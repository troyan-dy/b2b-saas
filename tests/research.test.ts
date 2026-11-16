import { describe, expect, it } from 'vitest';
import blocks from '../src/data/balance/blocks.json';
import {
  createMarket,
  evolveMarket,
  normalizeMarket,
  SEGMENTS,
  segmentView,
  type MarketContext,
} from '../src/systems/company/market';
import {
  advanceResearch,
  beginResearch,
  createResearch,
  RESEARCH,
  researchAvailable,
} from '../src/systems/company/research';

const toolkit = Object.keys(blocks);
const context = (): MarketContext => ({
  levels: Object.fromEntries(toolkit.map((block) => [block, 2])),
  links: [['crm', 'bot']],
  stage: 3,
  infrastructure: 4,
  support: null,
  processing: null,
  debt: 0,
  down: false,
  sellable: true,
  payments: true,
  basePrice: 160,
  priceMult: 1,
  tokenMult: 1,
  promotionMult: 1,
});

describe('research and changing demand', () => {
  it('creates reproducible, reachable priorities without changing the unseeded legacy market', () => {
    const limited = ['core', 'landing', 'pay', 'bot', 'api', 'onb'];
    expect(createMarket(limited, 8)).toEqual(createMarket(limited, 8));
    expect(createMarket(limited, 8)).not.toEqual(createMarket(limited, 9));
    const market = createMarket(limited, 8);
    for (const group of market.groups) {
      expect(group.profiles.reduce((sum, profile) => sum + profile.share, 0)).toBeCloseTo(100);
      for (const profile of group.profiles)
        expect(profile.needs.every((need) => limited.includes(need.block))).toBe(true);
    }
    const legacy = createMarket(toolkit);
    delete legacy.revision;
    delete legacy.warned;
    delete legacy.evolved;
    const needs = legacy.groups.map((group) => group.profiles.map((profile) => profile.needs));
    normalizeMarket(legacy, toolkit);
    expect(legacy.groups.map((group) => group.profiles.map((profile) => profile.needs))).toEqual(
      needs,
    );
    expect(legacy.revision).toBe(0);
  });

  it('warns before an economic change, applies it once and preserves customers and old needs', () => {
    const market = createMarket(toolkit, 10),
      ctx = context();
    for (const group of market.groups) for (const profile of group.profiles) profile.count = 5;
    for (const sprint of RESEARCH.shift_sprints) {
      const before = SEGMENTS.map((id) => segmentView(market, ctx, id));
      const prior = structuredClone(market);
      const warning = evolveMarket(market, toolkit, sprint - 1, 10);
      expect(warning?.kind).toBe('warning');
      expect(SEGMENTS.map((id) => segmentView(market, ctx, id))).toEqual(before);
      expect(evolveMarket(market, toolkit, sprint - 1, 10)).toBeNull();
      const shift = evolveMarket(market, toolkit, sprint, 10);
      expect(shift?.kind).toBe('shift');
      expect(shift?.segment).toBe(warning?.segment);
      expect(market.revision).toBe((prior.revision ?? 0) + 1);
      expect(evolveMarket(market, toolkit, sprint, 10)).toBeNull();
      for (let g = 0; g < market.groups.length; g++)
        for (let p = 0; p < market.groups[g].profiles.length; p++) {
          const current = market.groups[g].profiles[p],
            old = prior.groups[g].profiles[p];
          expect(current.count).toBe(old.count);
          for (const need of old.needs) {
            const next = current.needs.find((item) => item.block === need.block);
            expect(next).toBeDefined();
            expect(next!.level).toBeGreaterThanOrEqual(need.level);
          }
        }
      const after = SEGMENTS.map((id) => segmentView(market, { ...ctx, levels: {} }, id, 1.5));
      const previous = SEGMENTS.map((id) => segmentView(prior, { ...ctx, levels: {} }, id, 1.5));
      // A quality wave can retain the same current satisfaction for an empty product,
      // but its needs/shares still alter which investment covers that market.
      expect(after).not.toEqual(previous);
    }
  });

  it('lets both studies finish before sales, preserves interrupted work and prevents empty repeats', () => {
    const market = createMarket(toolkit, 5),
      state = createResearch(),
      ctx = context();
    ctx.levels = {};
    ctx.sellable = false;
    ctx.payments = false;
    expect(beginResearch(state, 'clients', market)).toBe(true);
    expect(advanceResearch(state, 2, market, ctx, 1)).toBeNull();
    expect(beginResearch(state, 'market', market)).toBe(true);
    const marketBefore = structuredClone(market);
    const report = advanceResearch(state, RESEARCH.work.market, market, ctx, 1);
    expect(report?.findings).toHaveLength(3);
    expect(report?.forecasts.length).toBeGreaterThan(0);
    expect(market).toEqual(marketBefore); // Information creates no revenue or hidden bonus.
    expect(state.active).toBeNull();
    expect(beginResearch(state, 'market', market)).toBe(false);
    expect(advanceResearch(state, 100, market, ctx, 2)).toBeNull();
    expect(beginResearch(state, 'clients', market)).toBe(true);
    expect(state.progress.clients).toBe(2);
    expect(advanceResearch(state, RESEARCH.work.clients - 2, market, ctx, 2)?.kind).toBe('clients');
    expect(researchAvailable(state, 'clients', market)).toBe(false);
    expect(researchAvailable(state, 'market', market)).toBe(false);
    evolveMarket(market, toolkit, RESEARCH.shift_sprints[0], 5);
    expect(researchAvailable(state, 'clients', market)).toBe(true);
    expect(researchAvailable(state, 'market', market)).toBe(true);
  });

  it('keeps dated snapshots unchanged through market shifts, new reports and save round trips', () => {
    const market = createMarket(toolkit, 12),
      state = createResearch(),
      ctx = context();
    beginResearch(state, 'clients', market);
    const first = advanceResearch(state, RESEARCH.work.clients, market, ctx, 1)!;
    const original = JSON.stringify(first);
    const history = JSON.stringify(state.history[0]);
    evolveMarket(market, toolkit, 7, 12);
    ctx.levels = {};
    beginResearch(state, 'clients', market);
    advanceResearch(state, 1, market, ctx, 7);
    const restored = JSON.parse(JSON.stringify(state));
    const second = advanceResearch(restored, RESEARCH.work.clients - 1, market, ctx, 8)!;
    expect(second.revision).toBe(1);
    expect(second.sprint).toBe(8);
    expect(JSON.stringify(first)).toBe(original);
    expect(JSON.stringify(restored.history[0])).toBe(history);
    expect(restored.history).toHaveLength(2);
    expect(restored.active).toBeNull();
    expect(researchAvailable(restored, 'clients', market)).toBe(false);
  });
});
