import { companyContext } from '../systems/company/company';
import {
  MARKET,
  marketCapacity,
  priceForecast,
  SEGMENTS,
  marketTotals,
  schedulePrice,
  segmentView,
  type MarketContext,
  type SegmentId,
} from '../systems/company/market';
import { blockEffects, PRODUCTION, projectCost } from '../systems/run/product';
import marketEvolution from '../data/balance/market-evolution.json';
import {
  answerCall,
  answerDilemma,
  answerLastChance,
  burnPerS,
  canHire,
  chooseCard,
  crunch,
  deferTask,
  dilemmaOf,
  DRAFT_CARDS,
  draftCards,
  expandInfrastructure,
  expandOffice,
  officeQuote,
  flows,
  freeCells,
  friendsAt,
  handy,
  hire,
  mrr,
  netPerS,
  place,
  resumeTask,
  remainingBuildCapacity,
  reworkNeed,
  RULES,
  sellable,
  setLane,
  setReview,
  shelf,
  tokens,
  TUNING,
  upgrade,
  workNeed,
  type DraftCard,
  type Lane,
  type Run,
} from '../systems/run/run';

export interface BotStyle {
  /** puts blocks next to their friends; otherwise on the first free cell */
  links: boolean;
  focus?: SegmentId;
  /** pays down debt before the product falls */
  fix: boolean;
  /** answers clients and the bank; otherwise the cards wait for the player */
  calls: boolean;
}

export const SENSIBLE: BotStyle = { links: true, fix: true, calls: true };

const lastDecision = new WeakMap<Run, number>();

interface Project {
  kind: 'build' | 'upgrade' | 'infrastructure';
  block?: string;
  work: number;
  cost: number;
  score: number;
}

/** Reads the same needs, load and tariff forecast as the player; never simulates future events. */
export function playBot(run: Run, style: BotStyle = SENSIBLE): void {
  if (run.over) return;
  if (
    run.t - (lastDecision.get(run) ?? -1) < 1 &&
    !run.draft &&
    !run.call &&
    !run.dilemma &&
    run.lastChance === null
  )
    return;
  lastDecision.set(run, run.t);
  if (run.draft) {
    const preference = (card: DraftCard) => cardValue(run, card) * (style.focus && PRODUCTION.segment_revenue[style.focus].card === card.id ? 1.5 : 1);
    const cards = draftCards(run).sort((a, b) => preference(b) - preference(a));
    if (!cards[0] || !chooseCard(run, cards[0].id)) return;
  }
  if (run.lastChance !== null) {
    if (!style.calls) return;
    answerLastChance(run, true);
  }
  if (style.calls && run.call) {
    const task = run.tasks.find((task) => task.block === run.call!.want);
    answerCall(
      run,
      task?.status === 'ready' ||
        (task?.status === 'active' && task.work - task.done <= remainingBuildCapacity(run)),
    );
  }
  const dilemma = dilemmaOf(run);
  if (style.calls && dilemma) {
    const cost = -dilemma.options[dilemma.bot].fx.reduce(
      (sum, fx) => sum + (fx.k === 'money' ? fx.n : 0),
      0,
    );
    answerDilemma(
      run,
      cost <= 0 || canFund(run, cost, 0) ? dilemma.bot : dilemma.options.length - 1,
    );
  }

  const ctx = companyContext(run);
  const market = marketTotals(run.market, ctx);
  const growth = sellable(run) && market.utilization < 1;
  if (run.live.has('pay') && run.sprintT === 0) adjustPrices(run);
  const landCost = officeQuote(run, 'land');
  if (landCost !== null && !freeCells(run).length && canFund(run, landCost, 0)) expandOffice(run, 'land');

  // A card is a plan, not a command to spend the last cash or delay a useful release.
  for (const task of run.tasks) {
    if (task.status !== 'queued') continue;
    const card = task.card && DRAFT_CARDS.find((card) => card.id === task.card);
    if ((card && cardValue(run, card) <= 0) || !canFund(run, task.cost, task.work)) {
      if (task.kind !== 'build' || RULES[task.block!].role !== 'base') deferTask(run, task.id);
    }
  }
  if (!run.tasks.some((task) => task.status === 'queued' || task.status === 'active')) {
    const project = nextProject(run, style, ctx);
    if (project?.kind === 'infrastructure') expandInfrastructure(run);
    else if (project?.kind === 'upgrade') upgrade(run, project.block!);
    else if (project?.block) {
      const cell = bestCell(run, project.block, style);
      if (cell) place(run, project.block, cell.i, cell.j);
    } else {
      const waiting = run.tasks.find(
        (task) =>
          task.status === 'backlog' &&
          canFund(run, task.cost, task.work) &&
          (!task.card ||
            cardValue(
              run,
              DRAFT_CARDS.find((card) => card.id === task.card),
            ) > 0),
      );
      if (waiting) resumeTask(run, waiting.id);
    }
  }

  const building = handy(run, 'build');
  if (run.energy >= TUNING.crunch.max) {
    const lane: Lane =
      style.fix && run.debt >= 8
        ? 'fix'
        : !run.live.has('pay') && building
          ? 'build'
          : growth && run.leads < 3
            ? 'promo'
            : building
              ? 'build'
              : style.fix && run.debt > 0
                ? 'fix'
                : growth
                  ? 'promo'
                  : 'build';
    crunch(run, lane);
  }

  // A new wage needs recurring income, not the one-time consulting grant.
  const deskCost = officeQuote(run, 'desks');
  if (deskCost !== null && !canHire(run, 'fast') && netPerS(run) > TUNING.tiers.fast.cost_per_s * 2 && canFund(run, deskCost, 0)) expandOffice(run, 'desks');
  if (
    canHire(run, 'fast') &&
    netPerS(run) > TUNING.tiers.fast.cost_per_s * 1.5 &&
    run.money > burnPerS(run) * TUNING.sprint_s * 6 &&
    (building || growth)
  )
    hire(run, canHire(run, 'think') && netPerS(run) > TUNING.tiers.think.cost_per_s * 3 ? 'think' : canHire(run, 'normal') && netPerS(run) > TUNING.tiers.normal.cost_per_s * 3 ? 'normal' : 'fast');

  const lanes: Lane[] = [];
  if (style.fix && run.debt >= 18) lanes.push('fix');
  if (building) lanes.push('build');
  if (growth) lanes.push('promo');
  if (lanes.length === 0) lanes.push(style.fix && run.debt > 0 ? 'fix' : 'build');
  run.agents.forEach((agent, i) => setLane(run, agent.id, lanes[i % lanes.length]));
  if (run.sprintT === 0) setReview(run, lanes[0]);
}

function canFund(run: Run, cost: number, work: number, hosting = 0): boolean {
  if (cost === 0 && hosting === 0) return true;
  const f = flows(run);
  const staffedBurn =
    f.living + f.hosting + f.tokens + Math.max(f.agents, TUNING.tiers.fast.cost_per_s);
  const loss = Math.max(0, staffedBurn + hosting - f.income);
  const duration = Math.max(TUNING.sprint_s * 3, work / TUNING.tiers.fast.work_per_s);
  return run.money >= cost + loss * duration + (f.living + f.hosting + hosting) * TUNING.sprint_s;
}

function cardValue(run: Run, card: DraftCard | undefined): number {
  if (!card) return -1;
  if (card.money)
    return run.money < burnPerS(run) * TUNING.sprint_s * 6 ? card.money / Math.max(1, card.work) : 1;
  if (!canFund(run, card.cost, card.work)) return -1;
  const ctx = companyContext(run),
    market = marketTotals(run.market, ctx);
  if (card.id === 'maintenance') return run.debt >= 8 ? run.debt : 0;
  if (card.id === 'rest') return run.energy <= TUNING.crunch.max / 2 ? 4 : 0;
  if (card.id === 'leads')
    return sellable(run) && run.live.has('pay') && market.utilization < 0.9 ? 20 : 0;
  if (!run.live.has('pay') && !run.blocks.some((block) => block.kind === 'pay')) return -1;
  if (card.id === 'batch') {
    const large = segmentView(run.market, ctx, 'large');
    return large.count === 0 && tokens(run) * 2 > card.cost ? 30 : -1;
  }
  if (card.id === 'mass')
    return ((market.utilization < 0.8 && run.strategy.support === null) ||
      marketCapacity({ ...ctx, cardStacks: { ...ctx.cardStacks, mass: (ctx.cardStacks?.mass ?? 0) + 1 } }) > market.capacity) &&
      canFund(run, card.cost, card.work, PRODUCTION.strategy_host.mass)
      ? 25
      : -1;
  if (['premium','small_sales','medium_sales'].includes(card.id)) {
    const segment = card.id === 'premium' ? 'large' : card.id === 'medium_sales' ? 'medium' : 'small';
    const rule = PRODUCTION.segment_revenue[segment];
    const corp =
      segmentView(run.market, ctx, segment).income +
      run.clients
        .filter((c) => segment === 'large' ? c.type === 'corp' || c.type === 'gov' : segment === 'medium' ? c.type === 'mid' : c.type === 'small' || c.type === 'startup')
        .reduce((sum, c) => sum + c.pay * c.deal, 0);
    const hosting = PRODUCTION.strategy_host[rule.card as keyof typeof PRODUCTION.strategy_host];
    const gain = corp * rule.bonus_per_copy / (1 + rule.bonus_per_copy * (run.cardStacks[rule.card as keyof typeof run.cardStacks] ?? 0)) - hosting * TUNING.sprint_s;
    return gain > 0 && canFund(run, card.cost, card.work, hosting)
      ? gain / 20
      : -1;
  }
  return run.strategy.processing === null && market.utilization < 0.8 && tokens(run) < mrr(run) / 4
    ? 15
    : -1;
}

function bestCell(run: Run, block: string, style: BotStyle) {
  const cells = freeCells(run);
  return style.links
    ? cells.sort((a, b) => friendsAt(run, block, b.i, b.j) - friendsAt(run, block, a.i, a.j))[0]
    : cells[0];
}

function nextProject(run: Run, style: BotStyle, ctx: MarketContext): Project | undefined {
  const available = shelf(run),
    cells = freeCells(run);
  for (const block of ['core', 'landing', 'pay']) {
    if (available.includes(block) && cells.length) {
      const work = workNeed(run, block);
      return {
        kind: 'build',
        block,
        work,
        cost: projectCost(run, work),
        score: Infinity,
      };
    }
  }
  const market = marketTotals(run.market, ctx);
  const views = SEGMENTS.map((id) => segmentView(run.market, ctx, id));
  const projects: Project[] = [];
  const kinds = [
    ...(cells.length ? available : []),
    ...run.blocks
      .filter(
        (b) =>
          b.live &&
          b.level < PRODUCTION.max_level &&
          !run.tasks.some((task) => task.block === b.kind),
      )
      .map((b) => b.kind),
  ];
  for (const block of kinds) {
    const own = run.blocks.find((b) => b.kind === block);
    const level = own ? own.level + 1 : 1;
    const work = own ? reworkNeed(run, own) : workNeed(run, block);
    const cost = projectCost(run, work, level);
    const hosting = RULES[block].host * (own ? TUNING.rework.host_mult : 1);
    if (!canFund(run, cost, work, hosting)) continue;
    const before = own ? blockEffects(block, own.level) : {},
      after = blockEffects(block, level);
    const ratio = (effect: string) => (after[effect] ?? 1) / (before[effect] ?? 1);
    const projected: MarketContext = {
      ...ctx,
      levels: { ...ctx.levels, [block]: level },
      tokenMult: ctx.tokenMult * ratio('tokens'),
      segmentPrice: {
        small: (ctx.segmentPrice?.small ?? 1) * ratio('small_pay'),
        medium: (ctx.segmentPrice?.medium ?? 1) * ratio('small_pay'),
        large: (ctx.segmentPrice?.large ?? 1) * ratio('corp_pay'),
      },
    };
    const future = marketTotals(run.market, projected);
    // Estimate the published block effects and current customer needs.
    let benefit = market.tokens * (1 - ratio('tokens')) - hosting * TUNING.sprint_s;
    for (const group of run.market.groups) {
      const effect = group.id === 'large' ? 'corp_pay' : 'small_pay';
      benefit += segmentView(run.market, ctx, group.id).income * ((after[effect] ?? 1) - (before[effect] ?? 1)) / run.eff[effect];
    }
    // Capacity is useful before overload begins, while customers are already arriving.
    if (market.count > 0 && market.utilization > 0.65)
      benefit += Math.max(0, future.capacity - market.capacity) * market.utilization * 2;
    for (const view of views) {
      for (const need of view.needs.filter((need) => need.block === block && (ctx.levels[block] ?? 0) < need.level)) {
        const progress =
          Math.min(1, level / need.level) - Math.min(1, (own?.level ?? 0) / need.level);
        benefit +=
          (need.count + ((Math.min(10, view.leads) + 1) * need.share) / 100) *
          view.unitPrice * (style.focus ? view.id === style.focus ? 2 : .5 : 1) *
          progress;
      }
    }
    for (const client of run.clients.filter((c) => !c.happy && c.want === block)) {
      if (level >= client.wantLevel)
        benefit += client.pay * client.deal * (client.promised ? 2 : 1);
    }
    if (!own && style.links) {
      const cell = bestCell(run, block, style)!;
      benefit += friendsAt(run, block, cell.i, cell.j) * mrr(run) * TUNING.link_bonus;
    }
    if (market.utilization < 0.8) benefit += (ratio('promo') - 1) * Math.max(40, market.income / 4);
    projects.push({
      kind: own ? 'upgrade' : 'build',
      block,
      work,
      cost,
      score: benefit / (work + cost / 24),
    });
  }
  if (!run.tasks.some((task) => task.kind === 'infrastructure') && market.utilization > 0.85) {
    const rule = PRODUCTION.infrastructure;
    const cost = Math.round(rule.cost * rule.cost_growth ** run.infrastructure),
      work = rule.work + rule.work_growth * run.infrastructure;
    const hosting = MARKET.capacity.hosting_per_expansion;
    if (canFund(run, cost, work, hosting)) {
      const capacity = marketCapacity({ ...ctx, infrastructure: run.infrastructure + 1 });
      const recovered =
        market.income *
        (Math.min(1, capacity / market.load) / Math.min(1, market.capacity / market.load) - 1);
      const growth = Math.min(capacity - market.capacity, market.load * 0.3) * 2;
      projects.push({
        kind: 'infrastructure',
        cost,
        work,
        score: (recovered + growth - hosting * TUNING.sprint_s) / (work + cost / 24),
      });
    }
  }
  return projects.filter((project) => project.score > 0).sort((a, b) => b.score - a.score)[0];
}

function adjustPrices(run: Run): void {
  for (const group of run.market.groups) {
    if (group.pendingPrice !== null) continue;
    const forecasts = marketEvolution.forecast_prices.map((price) => {
      const forecast = priceForecast(run.market, companyContext(run), group.id, price);
      return { price, income: forecast.income, satisfaction: forecast.after.satisfaction };
    }).filter(f => f.satisfaction >= 65).sort((a,b) => b.income - a.income || a.price - b.price);
    const chosen = forecasts[0]?.price ?? group.price;
    if (Math.abs(chosen - group.price) >= MARKET.price.step / 2)
      schedulePrice(run.market, group.id, chosen);
  }
}
