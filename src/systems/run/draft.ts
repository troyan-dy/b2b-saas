import cardsData from '../../data/balance/draft.json';
import cardsEn from '../../data/balance/draft.en.json';
import tuning from '../../data/balance/run.json';
import { worded } from '../../core/lang';
import { refreshRun, tokens, tokensAfterProcessingCard, type Run } from './run';
import {
  PRODUCTION,
  restoreCardStacks,
  strategyCount,
  STRATEGY_IDS,
  type StrategyId,
} from './product';

export interface DraftCard {
  id: string;
  title: string;
  description: string;
  impact: string;
  tradeoff: string;
  work: number;
  cost: number;
  slot: 'support' | 'processing' | 'operation';
  requires: string[];
  leads?: number;
  money?: number;
  once?: boolean;
  debt?: number;
  energy?: number;
}

export const DRAFT_CARDS: DraftCard[] = worded(cardsData as DraftCard[], cardsEn);

export interface CardChange {
  kind: 'debt' | 'energy' | 'tokens';
  before: number;
  after: number;
}

export function operationDelta(run: Run, card: DraftCard): { debt: number; energy: number } {
  return {
    debt: Math.max(0, run.debt + (card.debt ?? 0)) - run.debt,
    energy: Math.min(tuning.crunch.max, Math.max(0, run.energy + (card.energy ?? 0))) - run.energy,
  };
}

export function previewCardChange(run: Run, card: DraftCard): CardChange | undefined {
  if (card.id === 'batch' || card.id === 'instant')
    return { kind: 'tokens', before: tokens(run), after: tokensAfterProcessingCard(run, card.id) };
  const delta = operationDelta(run, card);
  if (card.debt !== undefined)
    return { kind: 'debt', before: run.debt, after: run.debt + delta.debt };
  if (card.energy !== undefined)
    return { kind: 'energy', before: run.energy, after: run.energy + delta.energy };
}

function available(run: Run, card: DraftCard): boolean {
  if (!card.requires.every((kind) => run.live.has(kind))) return false;
  const pending = run.tasks.some((task) => task.kind === 'card' && task.card === card.id);
  if (card.once && (run.claimedGrants.includes(card.id) || pending)) return false;
  if (card.slot === 'operation') return true;
  if (strategyCount(run, card.id as StrategyId) >= tuning.last_sprint) return false;
  return !pending;
}

export function dealDraft(run: Run): void {
  const projects = DRAFT_CARDS.filter((card) => card.slot !== 'operation' && available(run, card));
  for (let i = projects.length - 1; i > 0; i--) {
    const j = run.rng.int(0, i);
    [projects[i], projects[j]] = [projects[j], projects[i]];
  }
  const operations = DRAFT_CARDS.filter(
    (card) => card.slot === 'operation' && available(run, card),
  );
  const offset = run.sprint % operations.length;
  const rotated = [...operations.slice(offset), ...operations.slice(0, offset)];
  const affordable = rotated.filter((card) => card.cost <= run.money);
  const costly = rotated.filter((card) => card.cost > run.money);
  run.draft = [...projects.slice(0, 2), ...affordable, ...costly]
    .slice(0, 3)
    .map((card) => card.id);
}

export function draftCards(run: Run): DraftCard[] {
  return (run.draft ?? []).flatMap((id) => {
    const card = DRAFT_CARDS.find((entry) => entry.id === id);
    return card ? [{ ...card, requires: [...card.requires] }] : [];
  });
}

export function chooseCard(run: Run, id: string): boolean {
  if (run.over || !run.draft?.includes(id)) return false;
  const card = DRAFT_CARDS.find((entry) => entry.id === id);
  if (!card || !available(run, card)) return false;
  const change = previewCardChange(run, card);
  releaseCard(run, id);
  run.draft = null;
  refreshRun(run);
  if (change) change.after = change.kind === 'tokens' ? tokens(run) : run[change.kind];
  run.events.push({ type: 'card-applied', id, ...(change ? { change } : {}) });
  return true;
}

/** Shared by immediate choices and unfinished card projects from older saves. */
export function releaseCard(run: Run, id: string): void {
  const card = DRAFT_CARDS.find((entry) => entry.id === id);
  if (!card) return;
  if (card.once) {
    if (run.claimedGrants.includes(id)) return;
    run.claimedGrants.push(id);
  }
  if (STRATEGY_IDS.includes(id as StrategyId)) {
    restoreCardStacks(run);
    const key = id as StrategyId;
    const count = strategyCount(run, key);
    if (count >= tuning.last_sprint) return;
    run.cardStacks[key] = count + 1;
    const effect = PRODUCTION.strategy[key];
    if ('patience' in effect) {
      const waiting = run.call ? [...run.clients, run.call] : run.clients;
      for (const client of waiting)
        if (!client.happy) client.patience = Math.max(1, client.patience + effect.patience);
    }
    if (id === 'mass' || id === 'premium') run.strategy.support = id;
    if (id === 'batch' || id === 'instant') run.strategy.processing = id;
  }
  run.leads += card.leads ?? 0;
  run.money += card.money ?? 0;
  const delta = operationDelta(run, card);
  run.debt += delta.debt;
  run.energy += delta.energy;
}
