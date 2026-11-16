import effectsData from '../../data/balance/effects.json';
import productionData from '../../data/balance/production.json';
import { L } from '../../core/lang';
import type { Run } from './run';

export const PRODUCTION = productionData;
export type ProductEffects = Record<string, number>;
export type StrategyId = keyof typeof PRODUCTION.strategy;
export type CardStacks = Partial<Record<StrategyId, number>>;
export const STRATEGY_IDS = Object.keys(PRODUCTION.strategy) as StrategyId[];
type StrategyHolder = { cardStacks?: CardStacks; strategy: Run['strategy'] };

export function strategyCount(run: StrategyHolder, id: StrategyId): number {
  return (
    run.cardStacks?.[id] ?? (run.strategy.support === id || run.strategy.processing === id ? 1 : 0)
  );
}

/** Bonuses add to the segment's bill; repeated cards never compound each other. */
export function segmentRevenueMultiplier(
  run: StrategyHolder,
  segment: keyof typeof PRODUCTION.segment_revenue,
): number {
  const rule = PRODUCTION.segment_revenue[segment];
  return 1 + rule.bonus_per_copy * strategyCount(run, rule.card as StrategyId);
}

export function upgradeWork(baseWork: number, currentLevel: number): number {
  const level = Math.max(1, Math.min(PRODUCTION.max_level - 1, currentLevel));
  return Math.ceil(baseWork * PRODUCTION.upgrade_work_mult[level]);
}

/** Larger live companies need more migration and rollout work; a queued quote stays fixed. */
export function projectCost(run: Run, work: number, targetLevel = 1): number {
  const clients = run.clients.length + run.market.groups.reduce((n,g) => n + g.profiles.reduce((s,p) => s + p.count, 0), 0);
  const scale = 1 + Math.max(0, clients - PRODUCTION.scale_free_clients) * PRODUCTION.cost_per_client;
  return Math.ceil(work * (targetLevel === 1 ? PRODUCTION.construction_cost_per_work : PRODUCTION.upgrade_cost_per_work) * PRODUCTION.level_cost_mult[targetLevel - 1] * scale);
}

export function restoreCardStacks(run: Run): void {
  run.cardStacks ??= {};
  for (const id of STRATEGY_IDS) {
    const count = strategyCount(run, id);
    if (count > 0) run.cardStacks[id] = count;
  }
}

export function blockEffects(kind: string, level: number): ProductEffects {
  const base = (effectsData as Record<string, ProductEffects>)[kind] ?? {};
  const steps = (PRODUCTION.upgrade_steps as Record<string, ProductEffects>)[kind] ?? {};
  const cappedLevel = Math.max(1, Math.min(PRODUCTION.max_level, level));
  const extra = PRODUCTION.upgrade_effect_steps
    .slice(0, cappedLevel)
    .reduce((sum, n) => sum + n, 0);
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [
      key,
      value + (steps[key] ?? 0) * (key === 'seats' || key === 'patience' ? cappedLevel - 1 : extra),
    ]),
  );
}

export function strategyEffects(run: Run): ProductEffects[] {
  return STRATEGY_IDS.map((id) => {
    const count = strategyCount(run, id);
    return Object.fromEntries(
      Object.entries(PRODUCTION.strategy[id])
        .filter(([key]) => key !== 'capacity' && key !== 'large_satisfaction')
        .map(([key, value]) => [
          key,
          key === 'seats' || key === 'patience' ? value * count : value ** count,
        ]),
    );
  });
}

export function strategyHosting(run: Run): number {
  return STRATEGY_IDS.reduce(
    (sum, id) => sum + PRODUCTION.strategy_host[id] * strategyCount(run, id),
    0,
  );
}

/** The same values drive the simulation and the building's explanation. */
export function blockEffectText(_run: Run, kind: string, level: number): string[] {
  const labels: Record<string, string> = {
    seats: L('мест для ключевых договоров', 'key account slots'),
    patience: L('терпение, спринтов', 'patience, sprints'),
    word_of_mouth: L('сарафан', 'word of mouth'),
    corp_pay: L('корпоративный чек', 'corporate bills'),
    small_pay: L('чек малого и среднего бизнеса', 'small and medium business bills'),
    promo: L('продвижение', 'promotion'),
    tokens: L('токены', 'tokens'),
  };
  const numbers = Object.entries(blockEffects(kind, level)).map(([key, value]) => {
    if (key === 'seats' || key === 'patience') return `${labels[key]} +${value}`;
    if (key === 'small_pay' || key === 'corp_pay') return `${labels[key]} +${Math.round((value - 1) * 100)}% ${L('базы', 'base')}`;
    return `${labels[key]} ×${Number(value.toFixed(3))}`;
  });
  if (kind === 'core') numbers.unshift(L('ядро продукта', 'product core'));
  if (kind === 'landing')
    numbers.unshift(L('открывает привлечение клиентов', 'enables client acquisition'));
  if (kind === 'pay')
    numbers.unshift(L('включает оплату подписок', 'enables subscription payments'));
  return numbers;
}
