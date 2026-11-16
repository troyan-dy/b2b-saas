import { describe, expect, it } from 'vitest';
import { companyContext, companyTotals, customerCount } from '../src/systems/company/company';
import {
  createMarket,
  priceForecast,
  schedulePrice,
  segmentView,
} from '../src/systems/company/market';
import {
  clientPay,
  clientTokens,
  createRun,
  flows,
  IDEAS,
  mrr,
  refreshRun,
  RULES,
  step,
  tokens,
  TUNING,
} from '../src/systems/run/run';

function company() {
  const run = createRun(7, { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] });
  run.stage = 3;
  run.money = 10000;
  run.agents = [];
  run.newsWait = 100;
  run.market = createMarket(Object.keys(RULES));
  run.blocks = ['core', 'landing', 'pay', 'crm', 'bot'].map((kind, i) => ({
    kind,
    i,
    j: 0,
    done: 10,
    need: 10,
    built: true,
    live: true,
    level: 2,
    up: false,
    hand: false,
  }));
  run.market.groups[0].profiles[0].count = 10;
  run.clients = [
    {
      id: 1,
      name: 'Key account',
      texture: 'client',
      type: 'small',
      pay: 100,
      want: 'core',
      wantLevel: 1,
      patience: 5,
      happy: true,
      slot: 0,
      deal: 1,
      promised: false,
    },
  ];
  refreshRun(run);
  return run;
}

describe('company integration', () => {
  it('counts cohorts and separate named accounts once in cash flow', () => {
    const run = company();
    expect(customerCount(run)).toBe(11);
    expect(mrr(run)).toBeCloseTo(companyTotals(run).income + clientPay(run, run.clients[0]));
    expect(tokens(run)).toBeCloseTo(companyTotals(run).tokens + clientTokens(run, run.clients[0]));
    const f = flows(run),
      money = run.money;
    step(run, 0.25);
    expect(run.money - money).toBeCloseTo(
      (f.income - f.agents - f.hosting - f.living - f.tokens) * 0.25,
    );
  });

  it('does not turn a higher contract price into higher usage costs', () => {
    const run = company(),
      before = tokens(run),
      revenue = mrr(run);
    run.clients[0].deal = 2;
    run.market.groups[0].price = 2;
    expect(mrr(run)).toBeGreaterThan(revenue);
    expect(tokens(run)).toBe(before);
  });

  it('applies a confirmed tariff at release and then freezes the complete economy for the draft', () => {
    const run = company();
    expect(schedulePrice(run.market, 'small', 1.5)).toBe(true);
    expect(run.market.groups[0].price).toBe(1);
    run.sprintT = TUNING.sprint_s - 0.25;
    step(run, 0.25);
    expect(run.market.groups[0].price).toBeCloseTo(1.5);
    expect(run.draft).toHaveLength(3);
    const snapshot = JSON.stringify({
      money: run.money,
      market: run.market,
      t: run.t,
      tasks: run.tasks,
    });
    step(run, 100);
    expect(
      JSON.stringify({ money: run.money, market: run.market, t: run.t, tasks: run.tasks }),
    ).toBe(snapshot);
  });

  it('passes a real CRM-support connection to the market and prices infrastructure hosting', () => {
    const run = company();
    expect(
      companyContext(run).links.some((pair) => pair.includes('crm') && pair.includes('bot')),
    ).toBe(true);
    const before = companyTotals(run),
      hosting = flows(run).hosting;
    run.infrastructure = 2;
    expect(companyTotals(run).capacity).toBeGreaterThan(before.capacity * 2);
    expect(flows(run).hosting - hosting).toBe(companyTotals(run).hosting);
  });

  it('premium raises every large-company bill without changing its tariff setting or usage cost', () => {
    const run = company();
    run.market.groups[2].profiles[0].count = 2;
    const before = segmentView(run.market, companyContext(run), 'large');
    run.strategy.support = 'premium';
    refreshRun(run);
    const ctx = companyContext(run);
    const after = segmentView(run.market, ctx, 'large');
    expect(after.income).toBeCloseTo(before.income * 1.12);
    expect(after.tokens).toBe(before.tokens);
    expect(after.price).toBe(1);
    const proposal = priceForecast(run.market, ctx, 'large', 2);
    expect(proposal.after.reasons.price).toBeGreaterThan(0);
    expect(proposal.after.income).toBeCloseTo(after.income * 2);
  });
});
