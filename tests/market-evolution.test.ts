import { describe, expect, it } from 'vitest';
import blocks from '../src/data/balance/blocks.json';
import {
  createMarket,
  evolveMarket,
  normalizeMarket,
  priceForecast,
  SEGMENTS,
  segmentView,
  type MarketContext,
} from '../src/systems/company/market';
import marketEvolution from '../src/data/balance/market-evolution.json';

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

describe('visible changing demand', () => {
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
    normalizeMarket(legacy);
    expect(legacy.groups.map((group) => group.profiles.map((profile) => profile.needs))).toEqual(
      needs,
    );
    expect(legacy.revision).toBe(0);
  });

  it('warns before an economic change, applies it once and preserves customers and old needs', () => {
    const market = createMarket(toolkit, 10),
      ctx = context();
    for (const group of market.groups) for (const profile of group.profiles) profile.count = 5;
    for (const sprint of marketEvolution.shift_sprints) {
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

  it('shows all current needs and tariff forecasts before sales without changing the company', () => {
    const market = createMarket(toolkit, 5), ctx = context();
    ctx.levels = {};
    ctx.sellable = false;
    ctx.payments = false;
    const before = structuredClone(market);
    const views = SEGMENTS.map(id => segmentView(market, ctx, id));
    for (const view of views) {
      const expected = market.groups.find(group => group.id === view.id)!.profiles.flatMap(profile => profile.needs);
      for (const need of expected) expect(view.needs.some(item => item.block === need.block && item.level === need.level)).toBe(true);
      expect(priceForecast(market, ctx, view.id, 1.5).after).toEqual(segmentView(market, ctx, view.id, 1.5));
    }
    expect(market).toEqual(before);
    evolveMarket(market, toolkit, 7, 5);
    expect(SEGMENTS.map(id => segmentView(market, ctx, id))).not.toEqual(views);
  });
});
