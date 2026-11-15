import { describe, expect, it } from 'vitest';
import { companyContext } from '../src/systems/company/company';
import { segmentView, marketCapacity } from '../src/systems/company/market';
import { dealDraft } from '../src/systems/run/draft';
import { strategyCount } from '../src/systems/run/product';
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

  it('gives every large company the repeated enterprise bill, without charging small companies or more tokens', () => {
    const run = company();
    const base = companyContext(run);
    const large = segmentView(run.market, base, 'large');
    const small = segmentView(run.market, base, 'small');
    const host = run.host;
    for (let count = 1; count <= 5; count++) {
      pick(run, 'premium');
      const ctx = companyContext(run);
      const upgraded = segmentView(run.market, ctx, 'large');
      expect(upgraded.income / large.income).toBeCloseTo(1.5 ** count);
      expect(upgraded.tokens).toBe(large.tokens);
      expect(segmentView(run.market, ctx, 'small').income).toBe(small.income);
      expect(run.host).toBe(host + count * 3);
      expect(run.eff.patience).toBe(count);
    }
    expect(run.eff.corp_pay).toBeCloseTo(7.59375);
    expect(strategyCount(run, 'premium')).toBe(5);
    expect(
      Array.from({ length: 20 }, () => {
        dealDraft(run);
        return run.draft!.includes('premium');
      }).some(Boolean),
    ).toBe(true);
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
    expect(run.eff.corp_pay).toBeCloseTo(1.5 ** 5);
    expect(run.eff.patience).toBe(5);
    expect(run.host).toBeCloseTo(host + 27.5);
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
