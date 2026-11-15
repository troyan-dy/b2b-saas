import { describe, expect, it } from 'vitest';
import { createPitchDraft, type PitchDeck } from '../src/systems/run/pitch';

describe('pitch draft', () => {
  it('replays the seed and actions, preserving held cards and sharing three rerolls', () => {
    const a = createPitchDraft(42, 0);
    const b = createPitchDraft(42, 0);
    const before = a.hands.tech.map((card) => card.id);
    expect(a.reroll('tech', [0, 2])).toBe(true);
    expect(b.reroll('tech', [2, 0, 0])).toBe(true);
    expect(a.hands).toEqual(b.hands);
    expect(a.hands.tech[1].id).toBe(before[1]);
    expect(a.hands.tech[3].id).toBe(before[3]);
    expect(before).not.toContain(a.hands.tech[0].id);
    expect(before).not.toContain(a.hands.tech[2].id);
    expect(a.reroll('form', [0, 1, 2, 3])).toBe(true);
    expect(a.reroll('aud', [0, 1, 2, 3])).toBe(true);
    const last = structuredClone(a.hands);
    expect(a.remaining).toBe(0);
    expect(a.reroll('tech', [1])).toBe(false);
    expect(a.hands).toEqual(last);
  });

  it('deals four unique unlocked cards, including after full rerolls in a first run', () => {
    for (const runs of [0, 1, 2, 4])
      for (let seed = 0; seed < 40; seed++) {
        const draft = createPitchDraft(seed, runs);
        for (const deck of ['tech', 'form', 'aud'] as PitchDeck[]) {
          expect(draft.hands[deck]).toHaveLength(4);
          expect(draft.reroll(deck, [0, 1, 2, 3])).toBe(true);
          expect(new Set(draft.hands[deck].map((card) => card.id)).size).toBe(4);
          expect(draft.hands[deck].every((card) => card.unlock <= runs)).toBe(true);
        }
      }
  });

  it('empty or invalid selections do not spend rerolls or advance randomness', () => {
    const a = createPitchDraft(9, 0);
    const b = createPitchDraft(9, 0);
    expect(a.reroll('tech', [])).toBe(false);
    expect(a.reroll('tech', [-1, 4, 0.5, NaN])).toBe(false);
    expect(a.remaining).toBe(3);
    a.reroll('tech', [1]);
    b.reroll('tech', [1]);
    expect(a.hands).toEqual(b.hands);
  });
});
