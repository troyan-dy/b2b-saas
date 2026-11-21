import { companyTotals } from '../systems/company/company';
import { PRODUCTION } from '../systems/run/product';
import { agentWorkRate, buildCapacity, busy, clientPay, clientsMax, clientTokens, flows, freeCells, handy, netPerS, remainingBuildCapacity, sellable, shelf, TUNING, workNeed, type CashFlow, type Report, type Run } from '../systems/run/run';

const BLOCKS = ['core', 'landing', 'pay'] as const;
export const GUIDE_STEPS = [...BLOCKS, 'core-cell', 'landing-cell', 'pay-cell', 'code', 'release', 'subscribed',
  'ledger', 'post', 'assign-promo', 'park-agent', 'fix-debt', 'expand-capacity', 'client-block', 'client-cell', 'compare', 'profitable'] as const;
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

const SPRINT_TIPS: readonly GuideStep[] = ['compare', 'post', 'fix-debt', 'assign-promo', 'park-agent', 'expand-capacity', 'client-block', 'client-cell'];

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
  restoreGuideWin(run);
  if (flows(run).income > 0 || (report?.mrr ?? 0) > 0 || run.stats.peakMrr > 0) {
    guide.dismissed.push('subscribed');
    guide.baselineNet = report?.cashFlow?.net ?? netPerS(run);
  }
}

/** A pre-lesson checkpoint may already contain the proof even when the first payment is unread. */
export function restoreGuideWin(run: Run): void {
  const guide = run.guide, report = run.lastReport;
  if (!guide || won(guide) || !report || (report.profitableStreak ?? 0) <= 0) return;
  if (report.cashFlow) guide.result = { ...report.cashFlow, release: report.sprint };
  else guide.legacyWin = { release: report.sprint, income: report.mrr / TUNING.sprint_s, tokens: report.tokens / TUNING.sprint_s };
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
  // One lead can fill a named slot; surplus leads go to the scalable market. Do not
  // cut off that channel when one more contract at today's margin still wouldn't pay the bills.
  const margin = run.clients.reduce((sum, c) => sum + clientPay(run, c) - clientTokens(run, c), 0)
    / (Math.max(1, run.clients.length) * TUNING.sprint_s);
  return run.agents.find(a => {
    if (a.lane !== 'promo') return false;
    const idleNet = net + TUNING.tiers[a.tier].cost_per_s;
    const workLeft = (TUNING.sprint_s - run.sprintT) * agentWorkRate(run, a);
    const runway = run.money / -net;
    return idleNet > 0 || (run.leads >= 1 && (margin <= 0 || workLeft <= 1 || runway < 3 * TUNING.sprint_s)) ||
      (run.leads >= 1 && run.clients.length < clientsMax(run) && idleNet + margin > 0);
  })?.id ?? null;
}

function clientBlock(run: Run): string | null {
  if (!run.clients.length || run.tasks.length || !freeCells(run).length) return null;
  const available = shelf(run);
  const repeated = run.clients.filter(c => !c.happy && c.wantLevel === 1 &&
    (run.lastReport?.reasons.includes(c.want) || run.clients.some(other => other !== c && other.want === c.want)) &&
    available.includes(c.want) && workNeed(run, c.want) <= remainingBuildCapacity(run) + (c.patience - 1) * buildCapacity(run));
  return repeated.sort((a, b) => clientPay(run, b) - clientPay(run, a))[0]?.want ?? null;
}

type ProfitLesson = NonNullable<Report['cashFlow']> & { release: number; agentId: number | null; blockId: string | null; historicalRatesMissing?: boolean };

export function profitLesson(run: Run): ProfitLesson {
  const guide = run.guide;
  if (guide?.legacyWin) return { ...guide.legacyWin, historicalRatesMissing: true, net: NaN,
    living: NaN, agents: NaN, hosting: NaN, previousNet: null, agentId: null, blockId: null };
  if (guide?.result && (won(guide) || !guide.dismissed.includes('compare')))
    return { ...guide.result, agentId: null, blockId: null };
  const f = flows(run);
  const net = f.income - (f.living + f.agents + f.hosting + f.tokens);
  return { ...f, net,
    previousNet: guide?.result?.net ?? guide?.baselineNet ?? guide?.subscription?.net ?? null,
    release: run.sprint, agentId: parkAgent(run, net) ?? promoAgent(run, net), blockId: clientBlock(run) };
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
    return fresh('expand-capacity') && canFundExpansion(run, net)
      ? 'expand-capacity' : null;
  }
  if (run.leads < 1) {
    if (fresh('client-block') && guide.dismissed.includes('ledger') && clientBlock(run)) return 'client-block';
    if (run.energy >= 1 && fresh('post')) return 'post';
    if (fresh('assign-promo') && fresh('park-agent') && promoAgent(run, net) !== null) return 'assign-promo';
  }
  return null;
}

function canFundExpansion(run: Run, net: number) {
  if (run.tasks.some(t => t.kind === 'infrastructure')) return false;
  const builders = run.agents.filter(a => a.lane === 'build');
  if (!builders.length) return false;
  const rule = PRODUCTION.infrastructure;
  const queue = run.tasks.filter(t => t.status === 'active' || t.status === 'queued');
  const work = rule.work + rule.work_growth * run.infrastructure + queue.reduce((n, t) => n + t.work - t.done, 0);
  const fees = Math.round(rule.cost * rule.cost_growth ** run.infrastructure) + queue.reduce((n, t) => n + (t.status === 'queued' ? t.cost : 0), 0);
  // A boost on an existing task won't continue into the infrastructure project.
  const unboosted = { ...run, tasks: [] };
  const rate = builders.reduce((sum, a) => sum + agentWorkRate(unboosted, a), 0);
  const duration = work / rate;
  const settlement = Math.ceil((run.sprintT + duration) / TUNING.sprint_s) * TUNING.sprint_s - run.sprintT;
  const wages = builders.reduce((n, a) => n + TUNING.tiers[a.tier].cost_per_s, 0);
  const idleNet = net + (handy(run, 'build') ? wages : 0);
  return run.money > fees + Math.max(0, wages - idleNet) * duration + Math.max(0, -idleNet) * (settlement - duration);
}

export function guideStep(run: Run, picked: string | null): GuideStep | null {
  const guide = run.guide;
  if (!guide || run.over || run.lastChance !== null) return null;
  // Pending calls, dilemmas and offers are behind the draft until a card is chosen.
  if (!run.draft && (run.call || run.dilemma || run.offer !== null)) return null;
  const tip = (step: GuideStep): GuideStep | null => guide.dismissed.includes(step) ? null : step;
  if (guide.subscription && tip('subscribed')) return 'subscribed';
  if (won(guide)) return 'profitable';
  if (guide.result && tip('compare')) return 'compare';
  if (guide.dismissed.includes('subscribed')) {
    if (run.draft) return null;
    if (picked !== null) return clientBlock(run) === picked ? tip('client-cell') : null;
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
