import data from '../../data/balance/market.json';

export type SegmentId = 'small' | 'medium' | 'large';
export const SEGMENTS: readonly SegmentId[] = ['small', 'medium', 'large'];
export const MARKET = data;

export interface Need { block: string; level: number }
export interface Profile {
  share: number;
  needs: Need[];
  connection?: string[];
  instant?: boolean;
  count: number;
  leads: number;
  /** Fractions accumulate, so a small cohort eventually experiences churn too. */
  churnCarry: number;
}
export interface MarketGroup {
  id: SegmentId;
  price: number;
  pendingPrice: number | null;
  profiles: Profile[];
  came: number;
  left: number;
}
export interface MarketState { groups: MarketGroup[]; opened: boolean }

/** All inputs come from the shipped product, never from an unfinished project. */
export interface MarketContext {
  levels: Readonly<Record<string, number>>;
  links: readonly (readonly [string, string])[];
  stage: number;
  infrastructure: number;
  support: 'mass' | 'premium' | null;
  processing: 'batch' | 'instant' | null;
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
export interface MarketNeed extends Need { count: number; share: number; potential: number; fulfilled: boolean }
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
  reasons: { needs: number; price: number; overload: number; outage: number; delay: number; debt: number };
}
export interface MarketTotals { count: number; income: number; tokens: number; load: number; capacity: number; utilization: number; hosting: number }

const rule = (id: SegmentId) => data.segments.find(s => s.id === id)!;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const linked = (ctx: MarketContext, a: string, b: string) => ctx.links.some(pair => pair.includes(a) && pair.includes(b));

export function createMarket(toolkit: readonly string[]): MarketState {
  return {
    opened: false,
    groups: data.segments.map(segment => ({
      id: segment.id as SegmentId, price: 1, pendingPrice: null, came: 0, left: 0,
      profiles: segment.profiles.map(profile => {
        // A run's toolkit is finite: every request must have a route to completion.
        const needs = profile.needs.filter(need => toolkit.includes(need.block));
        const connection = 'connection' in profile ? profile.connection : undefined;
        return {
          share: profile.share,
          needs: needs.length ? needs.map(need => ({ ...need })) : [{ block: 'core', level: 2 }],
          connection: connection?.every(block => toolkit.includes(block)) ? [...connection] : undefined,
          instant: 'instant' in profile ? profile.instant : undefined,
          count: 0, leads: 0, churnCarry: 0,
        };
      }),
    })),
  };
}

export function marketCapacity(ctx: MarketContext): number {
  const c = data.capacity;
  const compute = c.base + (ctx.levels.core ?? 0) * c.core_per_level;
  const support = c.base + (ctx.levels.bot ?? 0) * c.support_per_level + (ctx.levels.onb ?? 0) * c.onboarding_per_level + (ctx.levels.crm ?? 0) * c.crm_per_level;
  const mass = ctx.support === 'mass' && linked(ctx, 'onb', 'bot') ? 2 : 1;
  return Math.round(Math.min(compute, support * mass) * c.expansion_mult ** ctx.infrastructure);
}

export function marketLoad(state: MarketState, ctx: MarketContext): number {
  return state.groups.reduce((sum, group) => sum + group.profiles.reduce((n, p) => n + p.count, 0) * rule(group.id).load * (group.id === 'large' && (ctx.levels.audit ?? 0) >= 2 ? 0.8 : 1), 0);
}

function coverage(profile: Profile, ctx: MarketContext): number {
  let value = profile.needs.reduce((n, need) => n + Math.min(1, (ctx.levels[need.block] ?? 0) / need.level), 0) / profile.needs.length;
  if (profile.connection && !linked(ctx, profile.connection[0], profile.connection[1])) value *= 0.5;
  if (profile.instant && ctx.processing === 'batch') value *= 0.5;
  return value;
}

export function acceptedPrice(profile: Profile, id: SegmentId, ctx: MarketContext): number {
  let value = data.price.base_comfort + data.price.fulfilled_comfort * coverage(profile, ctx);
  if (id === 'large' && ctx.support === 'premium' && linked(ctx, 'crm', 'bot') && (ctx.levels.crm ?? 0) >= 2) value = data.price.premium_comfort;
  if (id === 'large' && ctx.processing === 'batch') value = Math.min(value, data.price.batch_large_max);
  return value;
}

function reasons(profile: Profile, id: SegmentId, price: number, ctx: MarketContext, utilization: number) {
  const s = data.satisfaction;
  return {
    needs: s.fulfilled * coverage(profile, ctx),
    price: Math.max(0, price - acceptedPrice(profile, id, ctx)) * s.price_penalty,
    overload: Math.min(65, Math.max(0, utilization - 1) * s.overload_penalty),
    outage: ctx.down ? s.down_penalty : 0,
    delay: id === 'large' && ctx.processing === 'batch' ? s.batch_large_penalty : 0,
    debt: Math.min(s.debt_penalty, ctx.debt / 2),
  };
}

function happiness(profile: Profile, id: SegmentId, price: number, ctx: MarketContext, utilization: number): number {
  const r = reasons(profile, id, price, ctx, utilization);
  return clamp(data.satisfaction.base + r.needs - r.price - r.overload - r.outage - r.delay - r.debt, 0, 100);
}

function churnRate(satisfaction: number): number {
  if (satisfaction >= 70) return data.churn.happy;
  if (satisfaction >= 50) return data.churn.neutral;
  return Math.min(data.churn.max, data.churn.unhappy + (50 - satisfaction) * data.churn.below_50_per_point);
}

function reachable(ruleMarket: number, ctx: MarketContext): number {
  return Math.floor(ruleMarket * data.acquisition.market_expansion_mult ** ctx.infrastructure);
}

export function segmentView(state: MarketState, ctx: MarketContext, id: SegmentId, priceOverride?: number): SegmentView {
  const group = state.groups.find(g => g.id === id)!;
  const cfg = rule(id), price = priceOverride ?? group.price;
  const count = group.profiles.reduce((n, p) => n + p.count, 0);
  const load = marketLoad(state, ctx), capacity = marketCapacity(ctx), utilization = load / capacity;
  const unitPrice = ctx.basePrice * cfg.price_scale * ctx.priceMult * price * (ctx.segmentPrice?.[id] ?? 1);
  const totalMarket = reachable(cfg.market, ctx);
  let satisfaction = 0;
  const averages = { needs: 0, price: 0, overload: 0, outage: 0, delay: 0, debt: 0 };
  const needs = new Map<string, MarketNeed>();
  for (const p of group.profiles) {
    const weight = count > 0 ? p.count / count : p.share / 100;
    satisfaction += happiness(p, id, price, ctx, utilization) * weight;
    const r = reasons(p, id, price, ctx, utilization);
    for (const key of Object.keys(averages) as (keyof typeof averages)[]) averages[key] += r[key] * weight;
    for (const need of p.needs) {
      const key = `${need.block}:${need.level}`;
      const item = needs.get(key) ?? { ...need, count: 0, share: 0, potential: 0, fulfilled: (ctx.levels[need.block] ?? 0) >= need.level };
      item.count += p.count;
      item.share += p.share;
      item.potential += Math.floor(totalMarket * p.share / 100);
      needs.set(key, item);
    }
  }
  const throughput = Math.min(1, capacity / Math.max(1, load));
  return {
    id, count, satisfaction: Math.round(satisfaction), delta: group.came - group.left,
    came: group.came, left: group.left, leads: Math.floor(group.profiles.reduce((n, p) => n + p.leads, 0)), market: totalMarket,
    price: group.price, pendingPrice: group.pendingPrice, unitPrice,
    income: ctx.payments && !ctx.down ? count * unitPrice * throughput : 0,
    // Billing choices cannot change the cost of the same usage.
    tokens: count * ctx.basePrice * cfg.price_scale * data.token_share * ctx.tokenMult,
    needs: [...needs.values()].sort((a, b) => b.count - a.count || b.share - a.share), reasons: averages,
  };
}

export function marketTotals(state: MarketState, ctx: MarketContext): MarketTotals {
  const capacity = marketCapacity(ctx), load = marketLoad(state, ctx);
  const throughput = ctx.payments && !ctx.down ? Math.min(1, capacity / Math.max(1, load)) : 0;
  let count = 0, income = 0, tokens = 0;
  for (const group of state.groups) {
    const clients = group.profiles.reduce((n, p) => n + p.count, 0);
    const base = ctx.basePrice * rule(group.id).price_scale;
    count += clients;
    income += clients * base * ctx.priceMult * group.price * (ctx.segmentPrice?.[group.id] ?? 1) * throughput;
    tokens += clients * base * data.token_share * ctx.tokenMult;
  }
  return { count, income, tokens, load, capacity, utilization: load / capacity, hosting: data.capacity.hosting_per_expansion * ctx.infrastructure };
}

/** A forecast of tariff-related retention; acquisition is shown separately, not promised. */
export function priceForecast(state: MarketState, ctx: MarketContext, id: SegmentId, price: number) {
  const group = state.groups.find(g => g.id === id)!;
  const before = segmentView(state, ctx, id), after = segmentView(state, ctx, id, price);
  const utilization = marketLoad(state, ctx) / marketCapacity(ctx);
  let lost = 0;
  for (const p of group.profiles) lost += p.count * churnRate(happiness(p, id, price, ctx, utilization));
  const retained = Math.max(0, after.count - lost);
  return { before, after, lost: Math.round(lost), income: after.count ? after.income * retained / after.count : 0 };
}

export function schedulePrice(state: MarketState, id: SegmentId, price: number): boolean {
  const group = state.groups.find(g => g.id === id);
  if (!group || group.pendingPrice !== null || !Number.isFinite(price) || price < data.price.min || price > data.price.max) return false;
  const rounded = Math.round(price / data.price.step) * data.price.step;
  if (Math.abs(rounded - group.price) < 0.001) return false;
  group.pendingPrice = rounded;
  return true;
}

/** Each profile is disjoint. Shared needs never create another copy of a customer. */
export function advanceMarket(state: MarketState, ctx: MarketContext, leads: number): { came: number; left: number } {
  if (!ctx.sellable) return { came: 0, left: 0 };
  const first = !state.opened;
  state.opened = true;
  const utilization = marketLoad(state, ctx) / marketCapacity(ctx);
  let came = 0, left = 0;
  for (const group of state.groups) {
    group.came = 0; group.left = 0;
    if (group.pendingPrice !== null) { group.price = group.pendingPrice; group.pendingPrice = null; }
    const cfg = rule(group.id), available = reachable(cfg.market, ctx);
    const canReach = group.id === 'small' || ctx.stage >= 2;
    for (const p of group.profiles) {
      const happy = happiness(p, group.id, group.price, ctx, utilization);
      p.churnCarry += p.count * churnRate(happy);
      const leaving = Math.min(p.count, Math.floor(p.churnCarry));
      p.churnCarry -= leaving; p.count -= leaving; group.left += leaving;
      const pool = Math.floor(available * p.share / 100), room = Math.max(0, pool - p.count);
      if (!canReach) continue;
      const promotion = Math.max(0, leads) * data.acquisition.per_lead * cfg.weight * p.share / 100 * ctx.promotionMult;
      const referral = p.count * data.acquisition.referral_rate * (ctx.referralMult ?? 1) * Math.max(0, happy - 50) / 50;
      const starting = first && group.id === 'small' ? data.acquisition.first_leads * p.share / 100 : 0;
      const saturation = Math.max(0, 1 - p.count / Math.max(1, pool));
      p.leads = Math.min(room, p.leads + (promotion + referral + starting) * saturation);
      const fit = coverage(p, ctx);
      const eligible = group.id !== 'large' || fit >= 1;
      const conversion = data.acquisition.conversion * happy / 100 * (0.25 + fit * 0.75);
      const arrived = eligible && !(p.instant && ctx.processing === 'batch') ? Math.min(room, Math.floor(p.leads * Math.min(1, conversion))) : 0;
      p.leads -= arrived; p.count += arrived; group.came += arrived;
    }
    came += group.came; left += group.left;
  }
  return { came, left };
}
