import { describe, expect, it } from 'vitest';
import { companyTotals } from '../src/systems/company/company';
import { createRun, IDEAS, refreshRun, RULES, type Run } from '../src/systems/run/run';

const additions = ['cache', 'monitor', 'webhook', 'help', 'ab', 'portal'];
const idea = { tech: IDEAS.tech[0], form: IDEAS.form[3], aud: IDEAS.aud[0] };

function company(level: number): Run {
  const run = createRun(7, idea);
  run.stage = 3;
  run.blocks = ['core', 'landing', 'pay', ...additions].map((kind, i) => ({
    kind,
    i: i * 2,
    j: 0,
    done: 30,
    need: 30,
    built: true,
    live: true,
    level: additions.includes(kind) ? level : 1,
    up: false,
    hand: false,
  }));
  run.market.groups.forEach((group, i) => {
    group.profiles[0].count = [200, 50, 10][i];
  });
  refreshRun(run);
  return run;
}

describe('expanded product toolkit', () => {
  it('keeps new requests buildable and makes every new block available across seeded runs', () => {
    const dealt = new Set<string>();
    const requested = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const run = createRun(seed, idea);
      run.pool.forEach((kind) => dealt.add(kind));
      for (const kind of [...run.asks, ...run.corpAsks]) {
        requested.add(kind);
        expect(run.pool).toContain(kind);
      }
      expect(run.asks.every((kind) => RULES[kind].stage === 1)).toBe(true);
      expect(run.pool).toHaveLength(14);
    }
    expect(additions.every((kind) => dealt.has(kind))).toBe(true);
    expect(['webhook', 'help', 'ab', 'portal'].every((kind) => requested.has(kind))).toBe(true);
  });

  it('all five levels improve the same customer base while hosting grows and tokens stay positive', () => {
    const runs = [1, 2, 3, 4, 5].map(company);
    for (let i = 1; i < runs.length; i++) {
      const before = companyTotals(runs[i - 1]);
      const after = companyTotals(runs[i]);
      expect(after.count).toBe(before.count);
      expect(after.income).toBeGreaterThan(before.income);
      expect(after.tokens).toBeGreaterThan(0);
      expect(after.tokens).toBeLessThan(before.tokens);
      expect(runs[i].host).toBeGreaterThan(runs[i - 1].host);
      expect(runs[i].eff.seats).toBeGreaterThan(runs[i - 1].eff.seats);
      expect(runs[i].eff.patience).toBe(2);
    }
    expect(runs[2].eff.tokens).toBeCloseTo(0.95 * 0.65 * 0.89);
    expect(runs[2].eff.corp_pay).toBeCloseTo(1.3 * 1.5);
  });
});
