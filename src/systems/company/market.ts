import data from '../../data/balance/market.json';
import marketEvolution from '../../data/balance/market-evolution.json';
import { createRng } from '../../core/rng';
import {
  PRODUCTION,
  strategyCount,
  segmentRevenueMultiplier,
  type CardStacks,
  type StrategyId,
} from '../run/product';

export type SegmentId = 'small' | 'medium' | 'large';
export const SEGMENTS: readonly SegmentId[] = ['small', 'medium', 'large'];
export const MARKET = data;

export interface Need {
  block: string;
  level: number;
}
export interface Profile {
  share: number;
  needs: Need[];
  connection?: string[];
  instant?: boolean;
  count: number;
  leads: number;
  /** Fractions accumulate, so a small cohort eventually experiences churn too. */
  churnCarry: number;
  priceComfort?: number;
}
export interface MarketGroup {
  id: SegmentId;
  price: number;
  pendingPrice: number | null;
  profiles: Profile[];
  came: number;
  left: number;
  demand?: number;
}
export interface MarketState {
  groups: MarketGroup[];
  opened: boolean;
  revision?: number;
  warned?: number[];
  evolved?: number[];
}

export interface MarketSignal {
  kind: 'warning' | 'shift';
  sprint: number;
  segment: SegmentId;
  theme: 'quality' | 'price' | 'demand';
}

/** All inputs come from the shipped product, never from an unfinished project. */
export interface MarketContext {
  levels: Readonly<Record<string, number>>;
  links: readonly (readonly [string, string])[];
  stage: number;
  infrastructure: number;
  support: 'mass' | 'premium' | null;
  processing: 'batch' | 'instant' | null;
  cardStacks?: CardStacks;
  debt: number;
  down: boolean;
  sellable: boolean;
  payments: boolean;
  basePrice: number;
  priceMult: number;
  segmentPrice?: Readonly<Record<SegmentId, number>>;
  tokenMult: number;
  promotionMult: number;
  referralMult?: number;
}
export interface MarketNeed extends Need {
  count: number;
  share: number;
  potential: number;
  fulfilled: boolean;
}
export interface SegmentView {
  id: SegmentId;
  count: number;
  satisfaction: number;
  delta: number;
  came: number;
  left: number;
  leads: number;
  market: number;
  price: number;
  pendingPrice: number | null;
  unitPrice: number;
  income: number;
  tokens: number;
  needs: MarketNeed[];
  reasons: {
    needs: number;
    price: number;
    overload: number;
    outage: number;
    delay: number;
    debt: number;
  };
}
export interface MarketTotals {
  count: number;
  income: number;
  tokens: number;
  load: number;
  capacity: number;
  utilization: number;
  hosting: number;
}

const rule = (id: SegmentId) => data.segments.find((s) => s.id === id)!;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const linked = (ctx: MarketContext, a: string, b: string) =>
  ctx.links.some((pair) => pair.includes(a) && pair.includes(b));
const stacks = (ctx: MarketContext, id: StrategyId) =>
  strategyCount(
    { cardStacks: ctx.cardStacks, strategy: { support: ctx.support, processing: ctx.processing } },
    id,
  );

export function createMarket(toolkit: readonly string[], seed?: number): MarketState {
  const state: MarketState = {
    opened: false,
    revision: 0,
    warned: [],
    evolved: [],
    groups: data.segments.map((segment) => ({
      id: segment.id as SegmentId,
      price: 1,
      pendingPrice: null,
      came: 0,
      left: 0,
      demand: 1,
      profiles: segment.profiles.map((profile) => {
        // A run's toolkit is finite: every request must have a route to completion.
        const needs = profile.needs.filter((need) => toolkit.includes(need.block));
        const connection = 'connection' in profile ? profile.connection : undefined;
        return {
          share: profile.share,
          needs: needs.length ? needs.map((need) => ({ ...need })) : [{ block: 'core', level: 2 }],
          connection: connection?.every((block) => toolkit.includes(block))
            ? [...connection]
            : undefined,
          instant: 'instant' in profile ? profile.instant : undefined,
          count: 0,
          leads: 0,
          churnCarry: 0,
          priceComfort: 0,
        };
      }),
    })),
  };
  if (seed !== undefined) {
    const rng = createRng(seed ^ marketEvolution.seed_salt);
    for (const group of state.groups) {
      group.demand =
        1 + rng.range(-marketEvolution.initial_demand_variation, marketEvolution.initial_demand_variation);
      const pool = marketEvolution.segment_needs[group.id].filter((block) => toolkit.includes(block));
      for (const profile of group.profiles) {
        profile.share *= 1 + rng.range(-marketEvolution.share_variation, marketEvolution.share_variation);
        profile.priceComfort = rng.range(
          -marketEvolution.initial_price_variation,
          marketEvolution.initial_price_variation,
        );
        // Keep established needs; a run-specific priority changes the value of optional blocks.
        const candidates = pool.filter(
          (block) => !profile.needs.some((need) => need.block === block),
        );
        if (candidates.length)
          profile.needs.push({ block: rng.pick(candidates), level: marketEvolution.initial_need_level });
      }
      const total = group.profiles.reduce((sum, profile) => sum + profile.share, 0);
      for (const profile of group.profiles) profile.share = (profile.share / total) * 100;
    }
  }
  return state;
}

/** Old runs retain their existing audience; migration never rerolls requirements. */
export function normalizeMarket(state: MarketState): void {
  state.revision ??= 0;
  state.warned ??= [];
  state.evolved ??= [];
  for (const group of state.groups) {
    group.demand ??= 1;
    for (const profile of group.profiles) {
      profile.priceComfort ??= 0;
      if (!profile.needs.length) profile.needs = [{ block: 'core', level: 2 }];
    }
  }
}

/** Warn first; the change affects real demand rather than merely invalidating a report. */
export function evolveMarket(
  state: MarketState,
  toolkit: readonly string[],
  sprint: number,
  seed: number,
): MarketSignal | null {
  normalizeMarket(state);
  const index = marketEvolution.shift_sprints.findIndex(
    (at) => sprint === at || sprint === at - marketEvolution.warning_lead,
  );
  if (index < 0) return null;
  const at = marketEvolution.shift_sprints[index];
  const rng = createRng(seed ^ marketEvolution.seed_salt ^ at);
  const segment = SEGMENTS[(rng.int(0, SEGMENTS.length - 1) + index) % SEGMENTS.length];
  const theme = (['quality', 'price', 'demand'] as const)[index % 3];
  const signal: MarketSignal = {
    kind: sprint === at ? 'shift' : 'warning',
    sprint: at,
    segment,
    theme,
  };
  if (signal.kind === 'warning') {
    if (state.warned!.includes(at)) return null;
    state.warned!.push(at);
    return signal;
  }
  if (state.evolved!.includes(at)) return null;
  state.evolved!.push(at);
  const group = state.groups.find((item) => item.id === segment)!;
  if (theme === 'quality') {
    const profile = rng.pick(group.profiles);
    const eligible = profile.needs.filter((need) => toolkit.includes(need.block) && need.level < marketEvolution.shift_level_cap);
    if (eligible.length) rng.pick(eligible).level++;
    // Demand shifts towards this existing cohort; its old requirements stay useful.
    profile.share *= 1 + marketEvolution.share_variation;
    const total = group.profiles.reduce((sum, item) => sum + item.share, 0);
    for (const item of group.profiles) item.share = (item.share / total) * 100;
  } else if (theme === 'price') {
    const direction = rng.next() < 0.5 ? -1 : 1;
    for (const profile of group.profiles)
      profile.priceComfort = clamp(
        (profile.priceComfort ?? 0) + direction * marketEvolution.price_change,
        marketEvolution.price_min,
        marketEvolution.price_max,
      );
  } else {
    const direction = rng.next() < 0.5 ? -1 : 1;
    group.demand = clamp(
      (group.demand ?? 1) + direction * marketEvolution.demand_change,
      marketEvolution.demand_min,
      marketEvolution.demand_max,
    );
  }
  state.revision!++;
  return signal;
}

export function marketCapacity(ctx: MarketContext): number {
  const c = data.capacity;
  const compute = c.base + (ctx.levels.core ?? 0) * c.core_per_level;
  const support =
    c.base +
    (ctx.levels.bot ?? 0) * c.support_per_level +
    (ctx.levels.onb ?? 0) * c.onboarding_per_level +
    (ctx.levels.crm ?? 0) * c.crm_per_level;
  const mass = PRODUCTION.strategy.mass.capacity ** stacks(ctx, 'mass');
  return Math.round(Math.min(compute, support) * mass * c.expansion_mult ** ctx.infrastructure);
}

export function marketLoad(state: MarketState, ctx: MarketContext): number {
  return state.groups.reduce(
    (sum, group) =>
      sum +
      group.profiles.reduce((n, p) => n + p.count, 0) *
        rule(group.id).load *
        (group.id === 'large' && (ctx.levels.audit ?? 0) >= 2 ? 0.8 : 1),
    0,
  );
}

function coverage(profile: Profile, ctx: MarketContext): number {
  let value =
    profile.needs.reduce(
      (n, need) => n + Math.min(1, (ctx.levels[need.block] ?? 0) / need.level),
      0,
    ) / profile.needs.length;
  if (profile.connection && !linked(ctx, profile.connection[0], profile.connection[1]))
    value *= 0.5;
  return value;
}

export function acceptedPrice(profile: Profile, _id: SegmentId, ctx: MarketContext): number {
  return (
    data.price.base_comfort +
    data.price.fulfilled_comfort * coverage(profile, ctx) +
    (profile.priceComfort ?? 0)
  );
}

function reasons(
  profile: Profile,
  id: SegmentId,
  price: number,
  ctx: MarketContext,
  utilization: number,
) {
  const s = data.satisfaction;
  return {
    needs: s.fulfilled * coverage(profile, ctx),
    price: Math.max(0, price - acceptedPrice(profile, id, ctx)) * s.price_penalty,
    overload: Math.min(65, Math.max(0, utilization - 1) * s.overload_penalty),
    outage: ctx.down ? s.down_penalty : 0,
    delay:
      id === 'large' ? -PRODUCTION.strategy.batch.large_satisfaction * stacks(ctx, 'batch') : 0,
    debt: Math.min(s.debt_penalty, ctx.debt / 2),
  };
}

function happiness(
  profile: Profile,
  id: SegmentId,
  price: number,
  ctx: MarketContext,
  utilization: number,
): number {
  const r = reasons(profile, id, price, ctx, utilization);
  return clamp(
    data.satisfaction.base + r.needs - r.price - r.overload - r.outage - r.delay - r.debt,
    0,
    100,
  );
}

function churnRate(satisfaction: number): number {
  if (satisfaction >= 70) return data.churn.happy;
  if (satisfaction >= 50) return data.churn.neutral;
  return Math.min(
    data.churn.max,
    data.churn.unhappy + (50 - satisfaction) * data.churn.below_50_per_point,
  );
}

function reachable(ruleMarket: number, ctx: MarketContext): number {
  return Math.floor(ruleMarket * data.acquisition.market_expansion_mult ** ctx.infrastructure);
}

export function segmentView(
  state: MarketState,
  ctx: MarketContext,
  id: SegmentId,
  priceOverride?: number,
): SegmentView {
  const group = state.groups.find((g) => g.id === id)!;
  const cfg = rule(id),
    price = priceOverride ?? group.price;
  const count = group.profiles.reduce((n, p) => n + p.count, 0);
  const load = marketLoad(state, ctx),
    capacity = marketCapacity(ctx),
    utilization = load / capacity;
  const unitPrice =
    ctx.basePrice *
    data.billing_scale *
    cfg.price_scale *
    ctx.priceMult *
    price *
    (ctx.segmentPrice?.[id] ?? 1) *
    segmentRevenueMultiplier(
      {
        cardStacks: ctx.cardStacks,
        strategy: { support: ctx.support, processing: ctx.processing },
      },
      id,
    );
  const totalMarket = reachable(cfg.market * (group.demand ?? 1), ctx);
  let satisfaction = 0;
  const averages = { needs: 0, price: 0, overload: 0, outage: 0, delay: 0, debt: 0 };
  const needs = new Map<string, MarketNeed>();
  for (const p of group.profiles) {
    const weight = count > 0 ? p.count / count : p.share / 100;
    satisfaction += happiness(p, id, price, ctx, utilization) * weight;
    const r = reasons(p, id, price, ctx, utilization);
    for (const key of Object.keys(averages) as (keyof typeof averages)[])
      averages[key] += r[key] * weight;
    for (const need of p.needs) {
      const key = `${need.block}:${need.level}`;
      const item = needs.get(key) ?? {
        ...need,
        count: 0,
        share: 0,
        potential: 0,
        fulfilled: (ctx.levels[need.block] ?? 0) >= need.level,
      };
      item.count += p.count;
      item.share += p.share;
      item.potential += Math.floor((totalMarket * p.share) / 100);
      needs.set(key, item);
    }
  }
  const throughput = Math.min(1, capacity / Math.max(1, load));
  return {
    id,
    count,
    satisfaction: Math.round(satisfaction),
    delta: group.came - group.left,
    came: group.came,
    left: group.left,
    leads: Math.floor(group.profiles.reduce((n, p) => n + p.leads, 0)),
    market: totalMarket,
    price: group.price,
    pendingPrice: group.pendingPrice,
    unitPrice,
    income: ctx.payments && !ctx.down ? count * unitPrice * throughput : 0,
    // Billing choices cannot change the cost of the same usage.
    tokens: count * ctx.basePrice * data.billing_scale * cfg.price_scale * data.token_share * ctx.tokenMult,
    needs: [...needs.values()].sort((a, b) => b.count - a.count || b.share - a.share),
    reasons: averages,
  };
}

export function marketTotals(state: MarketState, ctx: MarketContext): MarketTotals {
  const capacity = marketCapacity(ctx),
    load = marketLoad(state, ctx);
  const throughput = ctx.payments && !ctx.down ? Math.min(1, capacity / Math.max(1, load)) : 0;
  let count = 0,
    income = 0,
    tokens = 0;
  for (const group of state.groups) {
    const clients = group.profiles.reduce((n, p) => n + p.count, 0);
    const base = ctx.basePrice * data.billing_scale * rule(group.id).price_scale;
    count += clients;
    income +=
      clients *
      base *
      ctx.priceMult *
      group.price *
      (ctx.segmentPrice?.[group.id] ?? 1) *
      segmentRevenueMultiplier(
        {
          cardStacks: ctx.cardStacks,
          strategy: { support: ctx.support, processing: ctx.processing },
        },
        group.id,
      ) *
      throughput;
    tokens += clients * base * data.token_share * ctx.tokenMult;
  }
  return {
    count,
    income,
    tokens,
    load,
    capacity,
    utilization: load / capacity,
    hosting: data.capacity.hosting_per_expansion * ctx.infrastructure,
  };
}

/** A forecast of tariff-related retention; acquisition is shown separately, not promised. */
export function priceForecast(
  state: MarketState,
  ctx: MarketContext,
  id: SegmentId,
  price: number,
) {
  const group = state.groups.find((g) => g.id === id)!;
  const before = segmentView(state, ctx, id),
    after = segmentView(state, ctx, id, price);
  const utilization = marketLoad(state, ctx) / marketCapacity(ctx);
  let lost = 0;
  for (const p of group.profiles)
    lost += p.count * churnRate(happiness(p, id, price, ctx, utilization));
  const retained = Math.max(0, after.count - lost);
  return {
    before,
    after,
    lost: Math.round(lost),
    income: after.count ? (after.income * retained) / after.count : 0,
  };
}

export function schedulePrice(state: MarketState, id: SegmentId, price: number): boolean {
  const group = state.groups.find((g) => g.id === id);
  if (
    !group ||
    group.pendingPrice !== null ||
    !Number.isFinite(price) ||
    price < data.price.min ||
    price > data.price.max
  )
    return false;
  const rounded = Math.round(price / data.price.step) * data.price.step;
  if (Math.abs(rounded - group.price) < 0.001) return false;
  group.pendingPrice = rounded;
  return true;
}

/** Each profile is disjoint. Shared needs never create another copy of a customer. */
export function advanceMarket(
  state: MarketState,
  ctx: MarketContext,
  leads: number,
): { came: number; left: number } {
  for (const group of state.groups) {
    group.came = 0;
    group.left = 0;
    if (group.pendingPrice !== null) {
      group.price = group.pendingPrice;
      group.pendingPrice = null;
    }
  }
  if (!ctx.sellable) return { came: 0, left: 0 };
  const first = !state.opened;
  state.opened = true;
  const utilization = marketLoad(state, ctx) / marketCapacity(ctx);
  let came = 0,
    left = 0;
  for (const group of state.groups) {
    const cfg = rule(group.id),
      available = reachable(cfg.market * (group.demand ?? 1), ctx);
    const canReach = group.id === 'small' || ctx.stage >= 2;
    for (const p of group.profiles) {
      const happy = happiness(p, group.id, group.price, ctx, utilization);
      p.churnCarry += p.count * churnRate(happy);
      const leaving = Math.min(p.count, Math.floor(p.churnCarry));
      p.churnCarry -= leaving;
      p.count -= leaving;
      group.left += leaving;
      const pool = Math.floor((available * p.share) / 100),
        room = Math.max(0, pool - p.count);
      if (!canReach) continue;
      const promotion =
        ((Math.max(0, leads) * data.acquisition.per_lead * cfg.weight * p.share) / 100) *
        ctx.promotionMult *
        (group.demand ?? 1);
      const referral =
        (p.count *
          data.acquisition.referral_rate *
          (ctx.referralMult ?? 1) *
          Math.max(0, happy - 50)) /
        50;
      const starting =
        first && group.id === 'small' ? (data.acquisition.first_leads * p.share) / 100 : 0;
      const saturation = Math.max(0, 1 - p.count / Math.max(1, pool));
      p.leads = Math.min(room, p.leads + (promotion + referral + starting) * saturation);
      const fit = coverage(p, ctx);
      const eligible = group.id !== 'large' || fit >= 1;
      const conversion = ((data.acquisition.conversion * happy) / 100) * (0.25 + fit * 0.75);
      const arrived = eligible ? Math.min(room, Math.floor(p.leads * Math.min(1, conversion))) : 0;
      p.leads -= arrived;
      p.count += arrived;
      group.came += arrived;
    }
    came += group.came;
    left += group.left;
  }
  return { came, left };
}
