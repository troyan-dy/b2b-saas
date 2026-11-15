import { createRng } from '../../core/rng';
import { IDEAS, type AudCard, type FormCard, type TechCard } from './run';

export const PITCH_REROLLS = 3;
const HAND_SIZE = 4;

type PitchHands = { tech: TechCard[]; form: FormCard[]; aud: AudCard[] };
export type PitchDeck = keyof PitchHands;

export function createPitchDraft(seed: number, runs: number) {
  const rng = createRng(seed);
  const draw = <T extends { id: string; unlock: number }>(
    deck: readonly T[],
    excluded: readonly T[],
    count: number,
  ): T[] => {
    const candidates = deck.filter(
      (card) => card.unlock <= runs && !excluded.some((old) => old.id === card.id),
    );
    const result: T[] = [];
    while (result.length < count && candidates.length > 0) {
      result.push(...candidates.splice(rng.int(0, candidates.length - 1), 1));
    }
    return result;
  };
  const hands: PitchHands = {
    tech: draw(IDEAS.tech, [], HAND_SIZE),
    form: draw(IDEAS.form, [], HAND_SIZE),
    aud: draw(IDEAS.aud, [], HAND_SIZE),
  };
  let remaining = PITCH_REROLLS;
  return {
    hands,
    get remaining() {
      return remaining;
    },
    reroll(deck: PitchDeck, indices: readonly number[]): boolean {
      const slots = [...new Set(indices)]
        .filter((index) => Number.isInteger(index) && index >= 0 && index < hands[deck].length)
        .sort((a, b) => a - b);
      if (remaining === 0 || slots.length === 0) return false;
      // Exclude the whole current hand: even a discarded card cannot immediately come back.
      const replace = <T extends { id: string; unlock: number }>(
        pool: readonly T[],
        hand: T[],
      ): boolean => {
        const available = pool.filter(
          (card) => card.unlock <= runs && !hand.some((old) => old.id === card.id),
        );
        if (available.length < slots.length) return false;
        const next = draw(pool, hand, slots.length);
        slots.forEach((slot, i) => {
          hand[slot] = next[i];
        });
        return true;
      };
      const changed =
        deck === 'tech'
          ? replace(IDEAS.tech, hands.tech)
          : deck === 'form'
            ? replace(IDEAS.form, hands.form)
            : replace(IDEAS.aud, hands.aud);
      if (changed) remaining--;
      return changed;
    },
  };
}
