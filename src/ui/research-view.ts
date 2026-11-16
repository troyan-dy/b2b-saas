import { L } from '../core/lang';
import { BLOCK_BY_ID } from '../content/blocks';
import { RESEARCH, researchAvailable, type ResearchFinding, type ResearchKind } from '../systems/company/research';
import type { Run } from '../systems/run/run';
import { dec, whole } from './format';

export const RESEARCH_TITLES = { clients: L('Изучить клиентов', 'Study customers'), market: L('Изучить рынок', 'Study the market') };
const names = { small: L('Малые', 'Small'), medium: L('Средние', 'Medium'), large: L('Крупные', 'Large') };

function findingText(f: ResearchFinding): string {
  const group = names[f.segment];
  if (f.type === 'need') return L(`${group}: ${Math.round(f.value)}% нужна «${BLOCK_BY_ID[f.block!]?.short ?? f.block}» v${f.level}. Можно развить продукт или выбрать другую аудиторию.`, `${group}: ${Math.round(f.value)}% need ${BLOCK_BY_ID[f.block!]?.short ?? f.block} v${f.level}. Improve it or focus on a different audience.`);
  if (f.type === 'retention') return L(`${group}: текущие запросы закрыты; довольство ${Math.round(f.value)}/100. Сравни цену и качество обслуживания.`, `${group}: current requirements are met; satisfaction ${Math.round(f.value)}/100. Compare pricing and service quality.`);
  if (f.type === 'opportunity') return L(`${group}: около ${whole(f.value)} потенциальных компаний ещё не охвачены. Рост потребует продукта и мощности.`, `${group}: about ${whole(f.value)} potential companies remain. Growth needs a suitable product and capacity.`);
  if (f.type === 'price') return L(`${group}: ориентир комфортного тарифа ×${dec(Number(f.value.toFixed(2)))} для текущего продукта. Это оценка, не обещание продаж.`, `${group}: estimated comfortable tariff ×${dec(Number(f.value.toFixed(2)))} for the current product. Not a sales guarantee.`);
  return f.value < 1 ? L(`${group}: конкуренция снижает приток примерно на ${Math.round((1 - f.value) * 100)}%. Можно усилить продукт или искать другой спрос.`, `${group}: competition reduces acquisition by about ${Math.round((1 - f.value) * 100)}%. Improve the product or pursue other demand.`) : L(`${group}: интерес рынка выше обычного примерно на ${Math.round((f.value - 1) * 100)}%. Возможность для продвижения.`, `${group}: interest is about ${Math.round((f.value - 1) * 100)}% above normal. An acquisition opportunity.`);
}

export function researchView(run: Run) {
  return {
    active: run.research.active,
    handDisabled: run.energy < 1 || !run.research.active || Boolean(run.draft || run.over),
    agent: run.agents.find(a => a.lane === 'research')?.id ?? run.agents[0]?.id,
    working: run.agents.some(a => a.lane === 'research'),
    cards: (['clients', 'market'] as ResearchKind[]).map(kind => {
      const report = run.research.reports[kind];
      const available = researchAvailable(run.research, kind, run.market);
      return {
        kind, title: RESEARCH_TITLES[kind],
        available: available && !run.draft && !run.over,
        active: run.research.active === kind,
        progress: run.research.progress[kind] / RESEARCH.work[kind],
        work: Math.ceil(RESEARCH.work[kind] * run.idea.tech.research),
        status: report ? L(`Спринт ${report.sprint} · ${available ? 'есть перемены' : 'данные актуальны'}`, `Sprint ${report.sprint} · ${available ? 'changes detected' : 'up to date'}`) : L('Ещё не изучено', 'Not studied yet'),
        findings: report?.findings.map(findingText) ?? [],
      };
    }),
    history: run.research.history.slice(0, -1).slice().reverse().map(report => ({
      title: `${RESEARCH_TITLES[report.kind]} · ${L('спринт', 'sprint')} ${report.sprint}`,
      findings: report.findings.map(findingText),
    })),
  };
}

export type ResearchView = ReturnType<typeof researchView>;
