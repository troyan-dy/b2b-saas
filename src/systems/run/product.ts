import effectsData from '../../data/balance/effects.json';
import productionData from '../../data/balance/production.json';
import { L } from '../../core/lang';
import type { Run } from './run';

export const PRODUCTION = productionData;
export type ProductEffects = Record<string, number>;

export function blockEffects(kind: string, level: number): ProductEffects {
  const base = (effectsData as Record<string, ProductEffects>)[kind] ?? {};
  const steps = (PRODUCTION.upgrade_steps as Record<string, ProductEffects>)[kind] ?? {};
  const extra = Math.max(0, Math.min(PRODUCTION.max_level, level) - 1);
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, value + (steps[key] ?? 0) * extra]),
  );
}

export function strategyEffects(run: Run): ProductEffects[] {
  return [run.strategy.support, run.strategy.processing]
    .filter((id) => id !== null)
    .map((id) => PRODUCTION.strategy[id]);
}

export function strategyHosting(run: Run): number {
  return [run.strategy.support, run.strategy.processing].reduce(
    (sum, id) => sum + (id ? PRODUCTION.strategy_host[id] : 0),
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
    return `${labels[key]} ×${Number(value.toFixed(2))}`;
  });
  if (kind === 'core') numbers.unshift(L('ядро продукта', 'product core'));
  if (kind === 'landing')
    numbers.unshift(L('открывает привлечение клиентов', 'enables client acquisition'));
  if (kind === 'pay')
    numbers.unshift(L('включает оплату подписок', 'enables subscription payments'));
  return numbers;
}
