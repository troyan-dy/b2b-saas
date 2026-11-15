import { describe, expect, it } from 'vitest';
import blocks from '../src/data/balance/blocks.json';
import { advanceMarket, createMarket, marketTotals, priceForecast, schedulePrice, segmentView, type MarketContext } from '../src/systems/company/market';

const toolkit = Object.keys(blocks);
function product(): MarketContext {
  return { levels: Object.fromEntries(toolkit.map(id => [id, 2])), links: [['crm', 'bot'], ['onb', 'bot'], ['api', 'cheap']], stage: 3, infrastructure: 4, support: null, processing: null, debt: 0, down: false, sellable: true, payments: true, basePrice: 160, priceMult: 1, tokenMult: 1, promotionMult: 1 };
}

describe('customer cohorts', () => {
  it('counts each company once even when its needs overlap', () => {
    const state = createMarket(toolkit), ctx = product();
    const group = state.groups[0];
    group.profiles = [
      { share: 50, needs: [{ block: 'crm', level: 2 }, { block: 'bot', level: 2 }], count: 50, leads: 0, churnCarry: 0 },
      { share: 50, needs: [{ block: 'crm', level: 2 }], count: 50, leads: 0, churnCarry: 0 },
    ];
    const view = segmentView(state, ctx, 'small');
    expect(view.count).toBe(100);
    expect(view.needs.find(n => n.block === 'crm')?.count).toBe(100);
    expect(view.needs.find(n => n.block === 'bot')?.count).toBe(50);
    expect(view.income).toBe(100 * view.unitPrice);
  });

  it('changes billing without changing the cost of the same usage', () => {
    const state = createMarket(toolkit), ctx = product();
    state.groups[1].profiles[0].count = 12;
    const before = segmentView(state, ctx, 'medium');
    const after = segmentView(state, ctx, 'medium', 2);
    expect(after.income).toBe(before.income * 2);
    expect(after.tokens).toBe(before.tokens);
    expect(after.satisfaction).toBeLessThan(before.satisfaction);
  });

  it('needs a shipped CRM and its connection before that corporate profile converts', () => {
    const state = createMarket(toolkit), ctx = product();
    ctx.levels = { ...ctx.levels, crm: 1 };
    advanceMarket(state, ctx, 50);
    expect(state.groups[2].profiles[0].count).toBe(0);
    ctx.levels = { ...ctx.levels, crm: 2 };
    const before = segmentView(state, ctx, 'large').satisfaction;
    advanceMarket(state, ctx, 50);
    expect(state.groups[2].profiles[0].count).toBeGreaterThan(0);
    ctx.links = [];
    expect(segmentView(state, ctx, 'large').satisfaction).toBeLessThan(before);
  });

  it('does not apply a preview, charge for a duplicate confirmation, or overwrite a pending tariff', () => {
    const state = createMarket(toolkit), ctx = product();
    state.groups[0].profiles[0].count = 20;
    const snapshot = JSON.stringify(state);
    priceForecast(state, ctx, 'small', 1.5);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(schedulePrice(state, 'small', 1)).toBe(false);
    expect(schedulePrice(state, 'small', 1.5)).toBe(true);
    expect(schedulePrice(state, 'small', 2)).toBe(false);
    expect(state.groups[0].price).toBe(1);
    advanceMarket(state, ctx, 0);
    expect(state.groups[0].price).toBeCloseTo(1.5);
    expect(state.groups[0].pendingPrice).toBeNull();
    expect(schedulePrice(state, 'small', 1.5)).toBe(false);
  });

  it('accumulates fractional churn instead of making small groups immortal', () => {
    const state = createMarket(toolkit), ctx = product();
    ctx.stage = 1;
    state.opened = true;
    state.groups[2].profiles[0].count = 5;
    for (let n = 0; n < 150; n++) advanceMarket(state, ctx, 0);
    expect(state.groups[2].profiles[0].count).toBeLessThan(5);
  });

  it('scales to thousands with the same small number of profiles and respects their markets', () => {
    const state = createMarket(toolkit), ctx = product();
    ctx.infrastructure = 8;
    const profiles = state.groups.reduce((n, g) => n + g.profiles.length, 0);
    for (let n = 0; n < 20; n++) advanceMarket(state, ctx, 1000);
    expect(marketTotals(state, ctx).count).toBeGreaterThan(1000);
    expect(state.groups.reduce((n, g) => n + g.profiles.length, 0)).toBe(profiles);
    for (const g of state.groups) expect(segmentView(state, ctx, g.id).count).toBeLessThanOrEqual(segmentView(state, ctx, g.id).market);
  });

  it('keeps expensive instant contracts incompatible with batch processing', () => {
    const state = createMarket(toolkit), ctx = product();
    ctx.support = 'premium';
    state.groups[2].profiles[0].count = 10;
    const instant = priceForecast(state, ctx, 'large', 2);
    ctx.processing = 'batch';
    const batch = priceForecast(state, ctx, 'large', 2);
    expect(batch.after.satisfaction).toBeLessThan(instant.after.satisfaction);
    expect(batch.lost).toBeGreaterThan(instant.lost);
  });
});
