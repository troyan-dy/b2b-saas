import { companyTotals } from '../systems/company/company';
import { PRODUCTION } from '../systems/run/product';
import { busy, flows, freeCells, handy, netPerS, sellable, shelf, TUNING, type CashFlow, type Report, type Run } from '../systems/run/run';

const BLOCKS = ['core', 'landing', 'pay'] as const;
export const GUIDE_STEPS = [...BLOCKS, 'core-cell', 'landing-cell', 'pay-cell', 'code', 'release', 'subscribed',
  'ledger', 'post', 'assign-promo', 'park-agent', 'fix-debt', 'expand-capacity', 'compare', 'profitable'] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

export interface StartupGuide {
  dismissed: GuideStep[];
  picked?: string;
  coded?: true;
  /** First paying contract or release, before a later draft choice changes the rates ($/s). */
  subscription?: { income: number; net: number };
  baselineNet?: number;
  result?: CashFlow & { previousNet: number | null; release: number };
  legacyWin?: { release: number; income: number; tokens: number };
}

const SPRINT_TIPS: readonly GuideStep[] = ['compare', 'post', 'fix-debt', 'assign-promo', 'park-agent', 'expand-capacity'];

export function recordGuideRelease(guide: StartupGuide, release: number, rates: CashFlow): void {
  if (won(guide)) return;
  if (guide.subscription || guide.dismissed.includes('subscribed') || rates.net > 0) {
    guide.result = { ...rates, release, previousNet: guide.result?.net ?? guide.baselineNet ?? guide.subscription?.net ?? null };
  }
  guide.dismissed = guide.dismissed.filter(id => !SPRINT_TIPS.includes(id));
}

export function isGuideBlock(id: unknown): id is (typeof BLOCKS)[number] {
  return BLOCKS.some(kind => kind === id);
}

export function startGuide(run: Run): void {
  run.guide ??= { dismissed: [] };
}

export function stopGuide(run: Run): void {
  delete run.guide;
}

/** Enrol the company as it stands; old saves have no first-payment checkpoint. */
export function resumeProfitGuide(run: Run): void {
  if (run.guide) return;
  startGuide(run);
  const guide = run.guide!, report = run.lastReport;
  if (report && (report.profitableStreak ?? 0) > 0) {
    if (report.cashFlow) guide.result = { ...report.cashFlow, release: report.sprint };
    else guide.legacyWin = { release: report.sprint, income: report.mrr / TUNING.sprint_s, tokens: report.tokens / TUNING.sprint_s };
  }
  if (flows(run).income > 0 || (report?.mrr ?? 0) > 0 || run.stats.peakMrr > 0) {
    guide.dismissed.push('subscribed');
    guide.baselineNet = report?.cashFlow?.net ?? netPerS(run);
  }
}

export function dismissGuideStep(run: Run, step: GuideStep): void {
  if (!run.guide) return;
  if (step === 'profitable') {
    if (won(run.guide)) stopGuide(run);
  }
  else if (!run.guide.dismissed.includes(step)) run.guide.dismissed.push(step);
}

function won(guide: StartupGuide): boolean {
  return !!guide.legacyWin || (guide.result?.net ?? 0) > 0;
}

function promoAgent(run: Run, net: number) {
  if (run.agents.some(a => a.lane === 'promo')) return null;
  const available = run.agents.filter(a => !busy(run, a))
    .sort((a, b) => TUNING.tiers[a.tier].cost_per_s - TUNING.tiers[b.tier].cost_per_s);
  const agent = available[0];
  return agent && run.money >= (TUNING.tiers[agent.tier].cost_per_s - net) * TUNING.sprint_s ? agent.id : null;
}

function parkAgent(run: Run, net: number) {
  if (handy(run, 'build')) return null;
  return run.agents.find(a => a.lane === 'promo' && (run.leads >= 1 || net + TUNING.tiers[a.tier].cost_per_s > 0))?.id ?? null;
}

type ProfitLesson = NonNullable<Report['cashFlow']> & { release: number; agentId: number | null; historicalRatesMissing?: boolean };

export function profitLesson(run: Run): ProfitLesson {
  const guide = run.guide;
  if (guide?.legacyWin) return { ...guide.legacyWin, historicalRatesMissing: true, net: NaN,
    living: NaN, agents: NaN, hosting: NaN, previousNet: null, agentId: null };
  if (guide?.result && (won(guide) || !guide.dismissed.includes('compare')))
    return { ...guide.result, agentId: null };
  const f = flows(run);
  const net = f.income - (f.living + f.agents + f.hosting + f.tokens);
  return { ...f, net,
    previousNet: guide?.result?.net ?? guide?.baselineNet ?? guide?.subscription?.net ?? null,
    release: run.sprint, agentId: parkAgent(run, net) ?? promoAgent(run, net) };
}

function action(run: Run, guide: StartupGuide): GuideStep | null {
  const net = netPerS(run);
  if (net > 0) return null;
  const fresh = (tip: GuideStep) => !guide.dismissed.includes(tip);
  if (run.energy >= 1 && run.debt >= TUNING.fix_per_work && fresh('fix-debt')) return 'fix-debt';
  if (!sellable(run) || !run.live.has('pay') || run.down) return null;
  if (fresh('park-agent') && parkAgent(run, net) !== null) return 'park-agent';
  const market = companyTotals(run);
  if (market.utilization > 1) {
    const rule = PRODUCTION.infrastructure;
    return fresh('expand-capacity') && run.money >= Math.round(rule.cost * rule.cost_growth ** run.infrastructure)
      && run.agents.some(a => a.lane === 'build') && !run.tasks.some(t => t.kind === 'infrastructure')
      ? 'expand-capacity' : null;
  }
  if (run.leads < 1) {
    if (run.energy >= 1 && fresh('post')) return 'post';
    if (fresh('assign-promo') && fresh('park-agent') && promoAgent(run, net) !== null) return 'assign-promo';
  }
  return null;
}

export function guideStep(run: Run, picked: string | null): GuideStep | null {
  const guide = run.guide;
  if (!guide || run.over || run.dilemma || run.offer !== null || run.lastChance !== null) return null;
  // A draft hides incoming calls; once it closes the caller has the player's attention.
  if (run.call && !run.draft) return null;
  const tip = (step: GuideStep): GuideStep | null => guide.dismissed.includes(step) ? null : step;
  if (guide.subscription && tip('subscribed')) return 'subscribed';
  if (won(guide)) return 'profitable';
  if (guide.result && tip('compare')) return 'compare';
  if (guide.dismissed.includes('subscribed')) {
    if (run.draft) return null;
    return tip('ledger') ?? action(run, guide);
  }
  if (run.draft) return tip('release');
  if (run.live.has('pay') && sellable(run) && picked === null) return action(run, guide);

  if (picked !== null) {
    if (!isGuideBlock(picked) || !shelf(run).includes(picked) || freeCells(run).length === 0) return null;
    return tip(`${picked}-cell`);
  }
  const core = run.blocks.find(block => block.kind === 'core');
  if (core && !core.built && !guide.coded) {
    // Acknowledging the tip lets the agent finish; actual manual work advances immediately.
    return run.energy >= 1 && handy(run, 'build') && run.agents.some(agent => agent.lane === 'build')
      ? tip('code') : null;
  }
  const missing = BLOCKS.find(kind => !run.blocks.some(block => block.kind === kind));
  return missing && freeCells(run).length > 0 ? tip(missing) : null;
}
