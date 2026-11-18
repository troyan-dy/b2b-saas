import { describe, expect, it } from 'vitest';
import { companyContext } from '../src/systems/company/company';
import { advanceMarket, createMarket, evolveMarket, normalizeMarket, segmentView } from '../src/systems/company/market';
import evolution from '../src/data/balance/market-evolution.json';
import { company } from './system-rules-fixtures';

describe('market shifts and legacy companies', () => {
  it('recovers an empty list of needs and a quality shift redistributes shares when no upgrade is reachable', () => {
    const state = createMarket([]);
    for (const group of state.groups) for (const profile of group.profiles) profile.needs = [];
    normalizeMarket(state);
    expect(state.groups.flatMap(group => group.profiles).every(profile =>
      profile.needs.length === 1 && profile.needs[0].block === 'core' && profile.needs[0].level === 2,
    )).toBe(true);
    const shift = evolveMarket(state, [], evolution.shift_sprints[0], 0)!;
    const group = state.groups.find(item => item.id === shift.segment)!;
    expect(group.lastShift).toMatchObject({ theme: 'share', block: 'core' });
    expect(group.lastShift!.after).toBeGreaterThan(group.lastShift!.before);
    expect(group.profiles.reduce((sum, p) => sum + p.share, 0)).toBeCloseTo(100);
  });

  it('can decrease demand, starting from neutral in legacy markets', () => {
    const state = createMarket([]);
    for (const group of state.groups) delete group.demand;
    const sprint = evolution.shift_sprints[2];
    const signal = evolveMarket(state, [], sprint, 0)!;
    expect(state.groups.find(group => group.id === signal.segment)?.lastShift).toEqual({
      sprint, theme: 'demand', before: 1, after: 1 - evolution.demand_change,
    });
  });

  it('prices groups and acquires customers at neutral demand when a legacy save omits the field', () => {
    const current = createMarket(['core']);
    const legacy = structuredClone(current);
    for (const group of legacy.groups) {
      delete group.demand;
      for (const profile of group.profiles) delete profile.priceComfort;
    }
    const ctx = { ...companyContext(company()), sellable: true };
    expect(segmentView(legacy, ctx, 'small')).toEqual(segmentView(current, ctx, 'small'));
    expect(advanceMarket(legacy, ctx, 150)).toEqual(advanceMarket(current, ctx, 150));
    normalizeMarket(legacy);
    expect(legacy.groups).toEqual(current.groups);
  });
});
