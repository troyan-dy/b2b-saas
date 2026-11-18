import { expect, it, vi } from 'vitest';
import { createPitchDraft } from '../src/systems/run/pitch';
import { saveRun } from '../src/systems/run/save';
import { company } from './system-rules-fixtures';

// Exercise the contracts when new decks or a different market expansion curve ship.
vi.mock('../src/data/balance/ideas.json', async (importOriginal) => {
  const { default: ideas } = await importOriginal<{ default: typeof import('../src/data/balance/ideas.json') }>();
  return { default: { ...ideas, form: ideas.form.slice(0, 5) } };
});
vi.mock('../src/data/balance/market.json', async (importOriginal) => {
  const { default: market } = await importOriginal<{ default: typeof import('../src/data/balance/market.json') }>();
  return { default: { ...market, acquisition: { ...market.acquisition, market_expansion_mult: 2 } } };
});

it('keeps a short deck intact when too few unlocked replacements exist', () => {
  const offer = createPitchDraft(1, 100);
  const before = offer.hands.form.slice();
  expect(offer.reroll('form', [0, 1])).toBe(false);
  expect(offer.hands.form).toEqual(before);
  expect(offer.remaining).toBe(3);
  expect(offer.reroll('form', [0])).toBe(true);
});

it('rejects a company whose reachable customer count would overflow even while construction costs are finite', () => {
  const run = company();
  run.infrastructure = 1024;
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', { setItem });
  try {
    expect(saveRun(run)).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
