import { afterEach, expect, it, vi } from 'vitest';
import ideas from '../src/data/balance/ideas.json';
import englishIdeas from '../src/data/balance/ideas.en.json';
import dilemmas from '../src/data/balance/dilemmas.json';
import englishDilemmas from '../src/data/balance/dilemmas.en.json';

afterEach(() => {
  vi.doUnmock('../src/data/balance/ideas.en.json');
  vi.doUnmock('../src/data/balance/dilemmas.en.json');
  vi.doUnmock('../src/data/balance/traits.json');
  vi.doUnmock('../src/data/balance/clients.json');
  vi.doUnmock('../src/data/balance/dilemmas.json');
  vi.doUnmock('../src/data/balance/events.json');
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('keeps original names, options and mechanics when a translation is incomplete', async () => {
  vi.stubGlobal('window', { location: { search: '?lang=en' } });
  vi.doMock('../src/data/balance/ideas.en.json', () => ({
    default: {
      ...englishIdeas,
      corp: englishIdeas.corp.slice(0, 1),
      gov: englishIdeas.gov.slice(0, 1),
      startup: englishIdeas.startup.slice(0, 1),
    },
  }));
  vi.doMock('../src/data/balance/dilemmas.en.json', () => ({
    default: { free: { ...englishDilemmas.free, options: [englishDilemmas.free.options[0]] } },
  }));
  const { IDEAS, DILEMMAS } = await import('../src/systems/run/run');
  for (const pool of ['corp', 'gov', 'startup'] as const) {
    expect(IDEAS[pool][0].name).toBe(englishIdeas[pool][0]);
    expect(IDEAS[pool][1]).toEqual(ideas[pool][1]);
  }
  const original = dilemmas.find((d) => d.id === 'free')!;
  const localized = DILEMMAS.find((d) => d.id === 'free')!;
  expect(localized.text).toBe(englishDilemmas.free.text);
  expect(localized.options[1]).toEqual(original.options[1]);
  expect(localized.options[0].fx).toContainEqual(expect.objectContaining({ k: 'mod', mult: 1.3 }));
  expect(DILEMMAS.find((d) => d.id === 'night')).toEqual(dilemmas.find((d) => d.id === 'night'));
});

it('ignores retired founder bonuses and uses a small-business contract when special account types are unavailable', async () => {
  vi.doMock('../src/data/balance/traits.json', () => ({ default: [] }));
  vi.doMock('../src/data/balance/clients.json', async (importActual) => {
    const actual = await importActual<{
      default: typeof import('../src/data/balance/clients.json');
    }>();
    return { default: actual.default.map((rule) => ({ ...rule, max: 0 })) };
  });
  const { createRun, IDEAS, TUNING, priceMult } = await import('../src/systems/run/run');
  const { product, release } = await import('./run-rules-fixtures');
  const idea = { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] };
  const run = createRun(3, idea, [], { network: 3, sales: 4 });
  expect(run.money).toBe(TUNING.start_money);
  expect(priceMult(run)).toBeCloseTo(idea.tech.price * idea.form.price);
  run.firstIndustryOrder = false;
  product(run, ['core', 'landing', ...run.asks]);
  release(run, 1);
  expect(run.clients.map((c) => c.type)).toEqual(['small']);
});

it('selects the first eligible news and dilemma when their configured weights sum to zero', async () => {
  vi.doMock('../src/data/balance/dilemmas.json', () => ({
    default: [{ ...dilemmas[0], id: 'open', needs: 'any', weight: 0 }],
  }));
  vi.doMock('../src/data/balance/events.json', async (importActual) => {
    const actual = await importActual<{
      default: typeof import('../src/data/balance/events.json');
    }>();
    return { default: [{ ...actual.default.find((e) => e.id === 'viral')!, weight: 0 }] };
  });
  const { startup, release } = await import('./run-rules-fixtures');
  const run = startup();
  vi.spyOn(run.rng, 'next').mockReturnValue(0);
  release(run, 4);
  expect(run.events).toContainEqual(expect.objectContaining({ type: 'news', id: 'viral' }));
  expect(run.dilemma?.id).toBe('open');
});
