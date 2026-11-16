import { L } from '../core/lang';
import { companyContext, companyTotals } from '../systems/company/company';
import { marketCapacity, SEGMENTS, segmentView } from '../systems/company/market';
import type { Run } from '../systems/run/run';
import { PRODUCTION } from '../systems/run/product';

export interface BuildReason {
  label: string;
  detail: string;
  tone: 'demand' | 'goal' | 'capacity';
}
const names: Record<string, string> = {
  small: L('малых', 'small'), medium: L('средних', 'medium'), large: L('крупных', 'large'),
};

/** One actionable reason on a tile; details keep the full request in plain language. */
export function buildReason(run: Run, kind: string): BuildReason | undefined {
  const level = run.blocks.find((block) => block.kind === kind && block.live)?.level ?? 0;
  const contracts = run.clients.filter((client) => !client.happy && client.want === kind && client.wantLevel > level);
  if (contracts.some((client) => client.promised)) return {
    label: L('Обещано клиенту', 'Promised to client'),
    detail: contracts.map((client) => `${client.name}: v${client.wantLevel}`).join(' · '), tone: 'demand',
  };
  const context = companyContext(run);
  const wanted = SEGMENTS.map((id) => segmentView(run.market, context, id)).map((group) => {
    const need = group.needs.find(need => need.block === kind && need.level > level);
    return { id: group.id, count: need?.count ?? 0, share: need?.share ?? 0 };
  }).filter((group) => group.share > 0).sort((a, b) => b.share - a.share);
  if (wanted.length) return {
    label: L(`Просят ${Math.round(wanted[0].share)}% ${names[wanted[0].id]}`, `Wanted: ${Math.round(wanted[0].share)}% ${names[wanted[0].id]}`),
    detail: wanted.map((group) => L(`≈${Math.round(group.share)}% ${names[group.id]} компаний интересуются улучшением`, `≈${Math.round(group.share)}% of ${names[group.id]} companies are interested`)).join(' · '), tone: 'demand',
  };
  if (contracts.length) return {
    label: L(`Ждут договоры: ${contracts.length}`, `Contracts waiting: ${contracts.length}`),
    detail: contracts.map((client) => `${client.name}: v${client.wantLevel}`).join(' · '), tone: 'demand',
  };
  if (!level && ['core', 'landing', 'pay'].includes(kind)) {
    const label = ({core: L('Основа продукта', 'Product foundation'), landing: L('Нужен для продаж', 'Starts acquisition'), pay: L('Чтобы получать деньги', 'Enables billing')} as Record<string, string>)[kind];
    return {label, detail: label, tone: 'goal'};
  }
  if (level < PRODUCTION.max_level && ['core', 'bot', 'onb', 'crm'].includes(kind)) {
    const load = companyTotals(run).load;
    const context = companyContext(run);
    const capacity = marketCapacity(context);
    const next = marketCapacity({...context, levels: {...context.levels, [kind]: level + 1}});
    if (load >= capacity * .8 && next > capacity) return {
      label: L('Больше места клиентам', 'Room for more clients'),
      detail: L('Мощность почти заполнена: этот блок добавит вместимость', 'Capacity is nearly full: this building adds room'), tone: 'capacity',
    };
  }
  if (!level && kind === 'cheap' && companyTotals(run).count > 0) return {
    label: L('Снизит счёт за токены', 'Cuts token costs'), detail: L('Экономия на каждом обслуживаемом клиенте', 'Saves on every customer served'), tone: 'goal',
  };
  return undefined;
}
