import { L } from '../core/lang';
import { companyContext, companyTotals } from '../systems/company/company';
import { marketCapacity } from '../systems/company/market';
import type { Run } from '../systems/run/run';

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
  const contracts = run.clients.filter((client) => !client.happy && client.want === kind && client.wantLevel > level && (client.promised || client.wantLevel > 1 || run.known.includes(kind)));
  if (contracts.some((client) => client.promised)) return {
    label: L('Обещано клиенту', 'Promised to client'),
    detail: contracts.map((client) => `${client.name}: v${client.wantLevel}`).join(' · '), tone: 'demand',
  };
  const wanted = run.market.groups.map((group) => {
    const total = group.profiles.reduce((sum, profile) => sum + profile.count, 0);
    const count = group.profiles.filter((profile) => profile.needs.some((need) => need.block === kind && need.level > level)).reduce((sum, profile) => sum + profile.count, 0);
    return { id: group.id, count, share: total ? Math.round(count / total * 100) : 0 };
  }).filter((group) => group.count > 0).sort((a, b) => b.count - a.count);
  if (wanted.length) return {
    label: L(`Просят ${wanted[0].share}% ${names[wanted[0].id]}`, `Wanted: ${wanted[0].share}% ${names[wanted[0].id]}`),
    detail: wanted.map((group) => L(`${group.count} ${names[group.id]} компаний (${group.share}%) ждут улучшения`, `${group.count} ${names[group.id]} companies (${group.share}%) want an upgrade`)).join(' · '), tone: 'demand',
  };
  if (contracts.length) return {
    label: L(`Ждут договоры: ${contracts.length}`, `Contracts waiting: ${contracts.length}`),
    detail: contracts.map((client) => `${client.name}: v${client.wantLevel}`).join(' · '), tone: 'demand',
  };
  if (!level && ['core', 'landing', 'pay'].includes(kind)) {
    const label = ({core: L('Основа продукта', 'Product foundation'), landing: L('Нужен для продаж', 'Starts acquisition'), pay: L('Чтобы получать деньги', 'Enables billing')} as Record<string, string>)[kind];
    return {label, detail: label, tone: 'goal'};
  }
  if (level < 3 && ['core', 'bot', 'onb', 'crm'].includes(kind)) {
    const load = companyTotals(run).load;
    const capacity = marketCapacity(companyContext(run));
    if (load >= capacity * .8) return {
      label: L('Больше места клиентам', 'Room for more clients'),
      detail: L('Мощность почти заполнена: этот блок добавит вместимость', 'Capacity is nearly full: this building adds room'), tone: 'capacity',
    };
  }
  if (!level && kind === 'cheap' && companyTotals(run).count > 0) return {
    label: L('Снизит счёт за токены', 'Cuts token costs'), detail: L('Экономия на каждом обслуживаемом клиенте', 'Saves on every customer served'), tone: 'goal',
  };
  return undefined;
}
