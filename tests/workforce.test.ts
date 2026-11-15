import { describe, expect, it } from 'vitest';
import { enqueueTask } from '../src/systems/run/production';
import {
  agentCost,
  createRun,
  IDEAS,
  step,
  TUNING,
  type Agent,
  type Run,
  type Tier,
} from '../src/systems/run/run';
import { agentFixPerWork } from '../src/systems/run/workforce';

function staffed(seed: number, builders: Tier[], fixer?: Tier): Run {
  const run = createRun(seed, { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] });
  run.money = 100000;
  run.newsWait = 10000;
  run.agents = builders.map((tier, i): Agent => ({ id: i + 1, tier, lane: 'build', carry: 0 }));
  if (fixer) run.agents.push({ id: 6, tier: fixer, lane: 'fix', carry: 0 });
  return run;
}

function workload(seed: number, builders: Tier[], fixer?: Tier, work = 10000) {
  const run = staffed(seed, builders, fixer);
  const task = enqueueTask(run, { kind: 'infrastructure', work, cost: 0 });
  let wages = 0;
  for (let tick = 0; tick < 128 * 4 && task.done < task.work; tick++) {
    // Compare the same production order without grants, cards or founder clicks.
    run.draft = null;
    run.dilemma = null;
    wages += agentCost(run) / 4;
    step(run, 1 / 4);
  }
  return { work: task.done, seconds: run.t, debt: run.debt, downs: run.stats.downs, wages };
}

describe('workforce trade-offs', () => {
  it('keeps basic work cheapest, while an expert finishes the same urgent job fastest', () => {
    const tiers: Tier[] = ['fast', 'normal', 'think'];
    const rawCost = tiers.map(
      (tier) => TUNING.tiers[tier].cost_per_s / TUNING.tiers[tier].work_per_s,
    );
    expect(rawCost[0]).toBeLessThan(rawCost[1]);
    expect(rawCost[1]).toBeLessThan(rawCost[2]);
    const jobs = tiers.map((tier) => workload(70, [tier], undefined, 16));
    console.log(
      'urgent 16-work order',
      JSON.stringify(Object.fromEntries(tiers.map((tier, i) => [tier, jobs[i]]))),
    );
    expect(jobs[2].seconds).toBeLessThan(jobs[1].seconds);
    expect(jobs[1].seconds).toBeLessThan(jobs[0].seconds);
    expect(jobs[2].debt).toBe(0);
    expect(jobs[0].debt).toBeGreaterThan(jobs[1].debt);
    // Review helps all three, but cannot erase the cheap agent's repair bill.
    expect(jobs[0].debt).toBeCloseTo(16 * TUNING.tiers.fast.debt_per_work * 0.5);
    const maintained = jobs.map(
      (job, i) => job.wages + (job.debt / agentFixPerWork(tiers[i])) * rawCost[i],
    );
    expect(maintained[1]).toBeLessThan(maintained[0]);
    expect(maintained[1]).toBeLessThan(maintained[2]);
  });

  it('gives repair speed to skilled agents without billing idle agents', () => {
    const remaining: number[] = [];
    for (const tier of ['fast', 'normal', 'think'] as const) {
      const run = staffed(7, [tier]);
      run.agents[0].lane = 'fix';
      run.review = 'fix';
      run.debt = 15;
      for (let tick = 0; tick < 32; tick++) step(run, 1 / 4);
      remaining.push(run.debt);
    }
    expect(remaining).toEqual([13, 9, 0]);
    const idle = staffed(7, ['think']);
    const money = idle.money;
    step(idle, 8);
    expect(idle.money).toBe(money - TUNING.living_per_s * 8);
    expect(idle.agents[0].carry).toBe(0);
  });

  it('one cheap fixer no longer makes five cheap builders the dominant team', () => {
    const paired = Array.from({ length: 12 }, (_, i) => ({
      cheap: workload(200 + i, ['fast', 'fast', 'fast', 'fast', 'fast'], 'fast'),
      mixed: workload(200 + i, ['fast', 'fast', 'normal', 'normal', 'think'], 'normal'),
    }));
    console.log('paired 128s production', JSON.stringify(paired[0]));
    for (const { cheap, mixed } of paired) {
      expect(mixed.work).toBeGreaterThan(cheap.work * 1.25);
      expect(mixed.debt).toBeLessThan(cheap.debt);
      expect(mixed.wages / mixed.work).toBeLessThan(cheap.wages / cheap.work);
      expect(cheap.wages).toBeLessThan(mixed.wages);
    }
  });
});
