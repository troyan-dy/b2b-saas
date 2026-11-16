import { describe, expect, it } from 'vitest';
import { companyContext } from '../src/systems/company/company';
import { segmentView, marketCapacity } from '../src/systems/company/market';
import { dealDraft } from '../src/systems/run/draft';
import { segmentRevenueMultiplier, strategyCount } from '../src/systems/run/product';
import {
  chooseCard,
  createRun,
  IDEAS,
  refreshRun,
  step,
  TUNING,
  type Run,
} from '../src/systems/run/run';

function company(): Run {
  const run = createRun(42, { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] });
  run.blocks = ['core', 'landing', 'pay'].map((kind, i) => ({
    kind,
    i,
    j: 0,
    done: 10,
    need: 10,
    level: 1,
    built: true,
    live: true,
    up: false,
    hand: false,
  }));
  run.infrastructure = 4;
  run.market.opened = true;
  for (const group of run.market.groups) group.profiles[0].count = 3;
  refreshRun(run);
  return run;
}

function pick(run: Run, id: string): void {
  run.draft = [id, 'maintenance', 'rest'];
  expect(chooseCard(run, id)).toBe(true);
}

describe('stacked sprint cards', () => {
  it('applies patience changes to waiting contracts immediately without ending one during a choice', () => {
    const run = company();
    const waiting: Run['clients'][number] = {
      id: 1,
      type: 'corp',
      name: 'Waiting',
      texture: 'client',
      pay: 600,
      want: 'api',
      wantLevel: 1,
      patience: 2,
      happy: false,
      slot: 0,
      deal: 1,
      promised: false,
    };
    run.clients = [waiting, { ...waiting, id: 2, slot: 1, happy: true }];
    run.call = { ...waiting, id: 3, slot: -1 };
    pick(run, 'premium');
    expect(waiting.patience).toBe(3);
    expect(run.call.patience).toBe(3);
    expect(run.clients[1].patience).toBe(2);
    for (let n = 0; n < 5; n++) pick(run, 'batch');
    expect(waiting.patience).toBe(1);
    expect(run.call.patience).toBe(1);
    expect(run.clients).toHaveLength(2);
    expect(run.eff.patience).toBe(-4);
  });

  it('adds a bounded enterprise bill bonus per copy without charging small companies or more tokens', () => {
    const run = company();
    const base = companyContext(run);
    const large = segmentView(run.market, base, 'large');
    const small = segmentView(run.market, base, 'small');
    const host = run.host;
    for (let count = 1; count <= 5; count++) {
      pick(run, 'premium');
      const ctx = companyContext(run);
      const upgraded = segmentView(run.market, ctx, 'large');
      expect(upgraded.income / large.income).toBeCloseTo(1 + 0.12 * count);
      expect(upgraded.tokens).toBe(large.tokens);
      expect(segmentView(run.market, ctx, 'small').income).toBe(small.income);
      expect(run.host).toBe(host + count * 2);
      expect(run.eff.patience).toBe(count);
    }
    expect(segmentRevenueMultiplier(run, 'large')).toBeCloseTo(1.6);
    expect(run.eff.corp_pay).toBe(1);
    expect(strategyCount(run, 'premium')).toBe(5);
    expect(
      Array.from({ length: 20 }, () => {
        dealDraft(run);
        return run.draft!.includes('premium');
      }).some(Boolean),
    ).toBe(true);
  });

  it('gives small and medium businesses their own stackable revenue cards without cross-charging', () => {
    for (const [id, segment, bonus, hosting] of [
      ['small_sales', 'small', 0.18, 0.5],
      ['medium_sales', 'medium', 0.16, 1],
    ] as const) {
      const run = company();
      const base = companyContext(run);
      const before = ['small', 'medium', 'large'].map((group) =>
        segmentView(run.market, base, group as 'small' | 'medium' | 'large'),
      );
      const host = run.host;
      for (let count = 1; count <= 5; count++) {
        pick(run, id);
        const ctx = companyContext(run);
        for (const group of before) {
          const after = segmentView(run.market, ctx, group.id);
          expect(after.income / group.income).toBeCloseTo(
            group.id === segment ? 1 + bonus * count : 1,
          );
          expect(after.tokens).toBe(group.tokens);
        }
        expect(run.host).toBeCloseTo(host + hosting * count);
      }
      expect(strategyCount(run, id)).toBe(5);
    }
  });

  it('preserves old premium copies and never exponentiates a full run of revenue cards', () => {
    const legacy = { strategy: { support: 'premium' as const, processing: null } };
    expect(segmentRevenueMultiplier(legacy, 'large')).toBeCloseTo(1.12);
    const run = company();
    run.cardStacks = { premium: 30, small_sales: 30, medium_sales: 30 };
    expect(segmentRevenueMultiplier(run, 'large')).toBeCloseTo(4.6);
    expect(segmentRevenueMultiplier(run, 'medium')).toBeCloseTo(5.8);
    expect(segmentRevenueMultiplier(run, 'small')).toBeCloseTo(6.4);
  });

  it('combines all four cards after five copies each and scales each tradeoff instead of discarding it', () => {
    const run = company(),
      base = companyContext(run),
      host = run.host,
      promo = run.eff.promo;
    for (let count = 0; count < 5; count++)
      for (const id of ['mass', 'premium', 'batch', 'instant']) pick(run, id);
    const ctx = companyContext(run);
    expect(run.cardStacks).toEqual({ mass: 5, premium: 5, batch: 5, instant: 5 });
    expect(run.eff.tokens).toBeCloseTo(0.95 * 0.8 ** 5 * 1.1 ** 5);
    expect(run.eff.promo).toBeCloseTo(promo * 1.2 ** 10);
    expect(segmentRevenueMultiplier(run, 'large')).toBeCloseTo(1.6);
    expect(run.eff.patience).toBe(5);
    expect(run.host).toBeCloseTo(host + 22.5);
    expect(marketCapacity(ctx)).toBe(Math.round(marketCapacity(base) * 1.2 ** 5));
    expect(segmentView(run.market, ctx, 'large').reasons.delay).toBe(20);
    refreshRun(run);
    expect(run.cardStacks).toEqual({ mass: 5, premium: 5, batch: 5, instant: 5 });
  });

  it('keeps a deep token-saving stack positive and finite and still ends at sprint thirty', () => {
    const run = company();
    for (let count = 0; count < TUNING.last_sprint; count++) pick(run, 'batch');
    expect(run.eff.tokens).toBeGreaterThan(0);
    expect(Number.isFinite(run.eff.tokens)).toBe(true);
    run.draft = ['batch', 'maintenance', 'rest'];
    expect(chooseCard(run, 'batch')).toBe(false);
    expect(chooseCard(run, 'rest')).toBe(true);
    run.money = 100000;
    run.sprint = 30;
    run.agents = [];
    step(run, TUNING.sprint_s);
    expect(run.over).not.toBeNull();
    expect(run.draft).toBeNull();
    expect(run.sprint).toBe(30);
    expect(Number.isFinite(run.money)).toBe(true);
  });
});
