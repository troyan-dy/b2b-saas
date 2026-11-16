import { L } from '../core/lang';
import { BLOCK_BY_ID } from '../content/blocks';
import { LANE_NAME, TIER_TITLE } from '../content/texts';
import { RESEARCH, researchAvailable, type ResearchFinding, type ResearchKind } from '../systems/company/research';
import { busy, TUNING, type Run } from '../systems/run/run';
import { agentWorkRate } from '../systems/run/workforce';
import { dec, money, whole } from './format';

export const RESEARCH_TITLES = { clients: L('Изучить клиентов', 'Study customers'), market: L('Изучить рынок', 'Study the market') };
const names = { small: L('Малые', 'Small'), medium: L('Средние', 'Medium'), large: L('Крупные', 'Large') };

function findingText(f: ResearchFinding): string {
  const group = names[f.segment];
  if (f.type === 'need') return L(`${group}: ${Math.round(f.value)}% нужна «${BLOCK_BY_ID[f.block!]?.short ?? f.block}» v${f.level}.`, `${group}: ${Math.round(f.value)}% need ${BLOCK_BY_ID[f.block!]?.short ?? f.block} v${f.level}.`);
  if (f.type === 'retention') return L(`${group}: запросы закрыты; довольство ${Math.round(f.value)}/100.`, `${group}: requirements met; satisfaction ${Math.round(f.value)}/100.`);
  if (f.type === 'opportunity') return L(`${group}: ещё около ${whole(f.value)} потенциальных компаний.`, `${group}: about ${whole(f.value)} potential companies remain.`);
  if (f.type === 'price') return L(`${group}: комфортный тариф ≈×${dec(Number(f.value.toFixed(2)))} для текущего продукта.`, `${group}: comfortable tariff ≈×${dec(Number(f.value.toFixed(2)))} for the current product.`);
  if (Math.abs(f.value - 1) < 0.005) return L(`${group}: обычный интерес рынка.`, `${group}: normal market interest.`);
  return f.value < 1 ? L(`${group}: конкуренция снижает приток ≈на ${Math.round((1 - f.value) * 100)}%.`, `${group}: competition reduces acquisition by ≈${Math.round((1 - f.value) * 100)}%.`) : L(`${group}: интерес рынка выше обычного ≈на ${Math.round((f.value - 1) * 100)}%.`, `${group}: interest is ≈${Math.round((f.value - 1) * 100)}% above normal.`);
}

export interface ResearchSelection {
  selectedKind?: ResearchKind;
  paused?: boolean;
}

export function researchView(run: Run, selection: ResearchSelection = {}) {
  const selectedKind = selection.selectedKind ?? run.research.active ?? 'clients';
  const locked = Boolean(run.draft || run.over || selection.paused);
  const researchers = run.agents.filter(a => a.lane === 'research');
  const factor = Math.max(0.1, run.idea.tech.research);
  const cards = (['clients', 'market'] as ResearchKind[]).map(kind => {
    const report = run.research.reports[kind];
    const available = researchAvailable(run.research, kind, run.market);
    const active = run.research.active === kind;
    const total = RESEARCH.work[kind] * factor;
    const remaining = available ? Math.max(0, total - run.research.progress[kind] * factor) : 0;
    // Carry is real work underway; it is delivered by the simulation in whole units.
    const pending = active ? researchers.reduce((sum, a) => sum + a.carry, 0) : 0;
    return {
      kind, title: RESEARCH_TITLES[kind],
      label: kind === 'clients' ? L('Клиенты', 'Customers') : L('Рынок', 'Market'),
      benefit: kind === 'clients' ? L('Что построить', 'What to build') : L('Кому продавать и по какой цене', 'Who to sell to and at what price'),
      selected: selectedKind === kind,
      available: available && !locked,
      active,
      progress: available ? Math.min(0.99, Math.max(0, (total - remaining + pending) / total)) : 1,
      work: Math.ceil(total),
      remaining: Math.max(0, remaining - pending),
      status: report ? L(`Спринт ${report.sprint} · ${available ? 'есть перемены' : 'данные актуальны'}`, `Sprint ${report.sprint} · ${available ? 'changes detected' : 'up to date'}`) : L('Ещё не изучено', 'Not studied yet'),
      findings: report?.findings.slice(0, 3).map(findingText) ?? [],
      details: report?.segments.map(s => L(
        `${names[s.id]}: ${whole(s.count)} компаний · довольство ${Math.round(s.satisfaction)}/100 · доход ${money(s.income)}/спринт.`,
        `${names[s.id]}: ${whole(s.count)} companies · satisfaction ${Math.round(s.satisfaction)}/100 · income ${money(s.income)}/sprint.`,
      )) ?? [],
    };
  });
  const selected = cards.find(card => card.kind === selectedKind)!;
  const active = cards.find(card => card.active);
  const paused = selection.paused === true;
  const state = run.over ? L('Забег завершён.', 'Run ended.')
    : run.draft ? L('Выбор карты: время стоит.', 'Card choice: time is stopped.')
    : paused ? L('Пауза: работа не идёт. Продолжи время, чтобы агент исследовал.', 'Paused: work is stopped. Resume time for agents to research.')
    : active ? researchers.length
      ? L(`Исследуем: ${active.label.toLowerCase()}.`, `Researching: ${active.label.toLowerCase()}.`)
      : L('Ждём работу: назначь агента или помоги основателем.', 'Waiting for work: assign an agent or help as founder.')
    : selected.available ? L('Выбери направление и начни один отчёт.', 'Choose a direction and start one report.')
    : L('Отчёт готов. Повтор откроется после перемен рынка.', 'Report ready. Market changes will unlock another report.');
  return {
    active: run.research.active,
    selectedKind,
    selected,
    state,
    paused: selection.paused,
    locked,
    handDisabled: run.energy < 1 || !run.research.active || locked,
    energy: Math.floor(run.energy),
    agent: run.agents.find(a => a.lane === 'research')?.id ?? run.agents[0]?.id,
    working: researchers.some(a => busy(run, a)) && !locked && !paused,
    agents: run.agents.map(a => ({
      id: a.id,
      title: TIER_TITLE[a.tier],
      assigned: a.lane === 'research',
      disabled: !run.research.active || a.lane === 'research' || locked,
      occupation: `${LANE_NAME[a.lane]} · ${busy(run, a) ? locked ? L('время стоит', 'time is stopped') : L('работает', 'working') : L('ждёт бесплатно', 'waiting for free')}`,
      rate: agentWorkRate(run, { ...a, lane: 'research' }),
      salary: TUNING.tiers[a.tier].cost_per_s,
    })),
    cards,
    history: run.research.history.filter(report => {
      const current = run.research.reports[selectedKind];
      return !current || report.kind !== current.kind || report.sprint !== current.sprint || report.revision !== current.revision;
    }).slice().reverse().map(report => ({
      title: `${RESEARCH_TITLES[report.kind]} · ${L('спринт', 'sprint')} ${report.sprint}`,
      findings: report.findings.map(findingText),
    })),
  };
}

export type ResearchView = ReturnType<typeof researchView>;
