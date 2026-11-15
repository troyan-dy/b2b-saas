import { describe, expect, it } from 'vitest';
import { companyTotals } from '../src/systems/company/company';
import {
  addProductionWork,
  apiWorkQuote,
  enqueueTask,
  rushTask,
  startWork,
} from '../src/systems/run/production';
import {
  cancelTask,
  createRun,
  expandInfrastructure,
  freeCells,
  IDEAS,
  place,
  step,
  TUNING,
  upgrade,
  type Run,
} from '../src/systems/run/run';

function fresh(): Run {
  const run = createRun(7, { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] });
  run.money = 100000;
  run.newsWait = 10000;
  return run;
}

function build(run: Run, kind: string) {
  const cell = freeCells(run)[0];
  expect(place(run, kind, cell.i, cell.j)).toBe(true);
  return run.tasks.find((task) => task.block === kind)!;
}

describe('paid immediate production', () => {
  it('quotes remaining work plus unpaid construction, and cannot refund or repeat a release', () => {
    const run = fresh();
    const task = build(run, 'core');
    const other = build(run, 'landing');
    const market = JSON.stringify(run.market);
    const quote = apiWorkQuote(run, task.id)!;
    const money = run.money;
    expect(quote).toEqual({
      cost: 120 + task.work * 100 + task.cost,
      fee: 120 + task.work * 100,
      unpaidCost: task.cost,
      remainingWork: task.work,
      affordable: true,
    });
    expect(rushTask(run, task.id)).toBe(true);
    expect(run.money).toBe(money - quote.cost);
    expect(run.stats.tokens).toBe(quote.fee);
    expect(run.live.has('core')).toBe(true);
    expect(run.tasks).toEqual([other]);
    expect(other.status).toBe('queued');
    expect(run.blocks.find((block) => block.kind === 'landing')?.live).toBe(false);
    expect(JSON.stringify(run.market)).toBe(market);
    expect(run.sprint).toBe(1);
    expect(run.sprintT).toBe(0);
    expect(run.lastReport).toBeNull();
    expect(rushTask(run, task.id)).toBe(false);
    expect(cancelTask(run, task.id)).toBe(false);
    expect(apiWorkQuote(run, task.id)).toBeNull();
    expect(run.money).toBe(money - quote.cost);
    expect(run.stats.shipped).toBe(1);
  });

  it('does not charge active construction twice, and ready work pays only the early-release fee', () => {
    const run = fresh();
    const task = build(run, 'core');
    const money = run.money;
    startWork(run);
    addProductionWork(run);
    addProductionWork(run);
    expect(run.money).toBe(money - task.cost);
    expect(apiWorkQuote(run, task.id)).toMatchObject({
      unpaidCost: 0,
      remainingWork: task.work - 2,
      cost: 120 + (task.work - 2) * 100,
    });
    while (task.status !== 'ready') addProductionWork(run);
    const second = build(run, 'landing');
    while (second.status !== 'ready') addProductionWork(run);
    expect(apiWorkQuote(run, task.id)?.cost).toBe(120);
    const paid = run.money;
    expect(rushTask(run, task.id)).toBe(true);
    expect(run.money).toBe(paid - 120);
    expect(run.live.has('landing')).toBe(false);
    expect(run.tasks).toEqual([second]);
    run.agents = [];
    step(run, TUNING.sprint_s);
    expect(run.live.has('landing')).toBe(true);
    expect(run.stats.shipped).toBe(2);
    expect(run.lastReport?.shipped).toEqual(['landing']);
  });

  it('activates just the selected upgrade or infrastructure level, including at the final sprint', () => {
    const run = fresh();
    rushTask(run, build(run, 'core').id);
    expect(upgrade(run, 'core')).toBe(true);
    const upgradeTask = run.tasks[0];
    expect(rushTask(run, upgradeTask.id)).toBe(true);
    expect(run.blocks[0]).toMatchObject({ level: 2, live: true, up: false });
    expect(run.stats.reworks).toBe(1);
    const capacity = companyTotals(run).capacity;
    const market = JSON.stringify(run.market);
    expect(expandInfrastructure(run)).toBe(true);
    const task = run.tasks[0];
    run.sprint = TUNING.last_sprint;
    run.sprintT = TUNING.sprint_s - 1;
    expect(rushTask(run, task.id)).toBe(true);
    expect(run.infrastructure).toBe(1);
    expect(companyTotals(run).capacity).toBeGreaterThan(capacity);
    expect(JSON.stringify(run.market)).toBe(market);
    expect(run.sprintT).toBe(TUNING.sprint_s - 1);
    expect(run.over).toBeNull();
    run.agents = [];
    step(run, 1);
    expect(run.infrastructure).toBe(1);
    expect(run.blocks[0].level).toBe(2);
    expect(run.stats.reworks).toBe(1);
  });

  it('rejects insufficient cash, paused or finished runs and invalid task amounts atomically', () => {
    const cases: ((run: Run) => void)[] = [
      (run) => {
        run.money = 1;
      },
      (run) => {
        run.money = Number.NaN;
      },
      (run) => {
        run.money = Infinity;
      },
      (run) => {
        run.draft = ['rest'];
      },
      (run) => {
        run.lastChance = 100;
      },
      (run) => {
        run.over = 'profit';
      },
      (run) => {
        run.sprint = TUNING.last_sprint + 1;
      },
      (run) => {
        run.tasks[0].work = Number.NaN;
      },
      (run) => {
        run.tasks[0].done = -1;
      },
      (run) => {
        run.tasks[0].done = Infinity;
      },
      (run) => {
        run.tasks[0].cost = -10;
      },
      (run) => {
        run.blocks = [];
      },
    ];
    for (const corrupt of cases) {
      const run = fresh();
      const task = build(run, 'core');
      corrupt(run);
      const before = JSON.stringify(run);
      expect(rushTask(run, task.id)).toBe(false);
      expect(JSON.stringify(run)).toBe(before);
    }
    const run = fresh();
    const legacy = enqueueTask(run, { kind: 'card', card: 'credits', work: 6, cost: 0 });
    expect(apiWorkQuote(run, legacy.id)).toBeNull();
    expect(rushTask(run, legacy.id)).toBe(false);
  });
});
