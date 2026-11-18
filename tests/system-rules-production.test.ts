import { describe, expect, it } from 'vitest';
import api from '../src/data/balance/api.json';
import { addProductionWork, apiWorkQuote, enqueueTask, nextReleaseWork, resumeTask, startWork, syncProduction } from '../src/systems/run/production';
import { PRODUCTION } from '../src/systems/run/product';
import { TUNING } from '../src/systems/run/run';
import { company } from './system-rules-fixtures';

describe('API work quotes', () => {
  it('stops quoting at the final release boundary', () => {
    const run = company();
    const task = enqueueTask(run, { kind: 'infrastructure', cost: 70, work: 6 });
    run.sprint = TUNING.last_sprint;
    run.sprintT = TUNING.sprint_s - 1;
    expect(apiWorkQuote(run, task.id)).not.toBeNull();
    run.sprintT++;
    expect(apiWorkQuote(run, task.id)).toBeNull();
  });

  it('charges infrastructure level and remaining work, reserving the base cost only before work starts', () => {
    const run = company();
    run.infrastructure = 2;
    const task = enqueueTask(run, { kind: 'infrastructure', cost: 70, work: 6 });
    const price = (work: number) => Math.ceil((api.minimum_fee + api.cost_per_work * work) * (1 + 2 * api.level_growth));
    expect(apiWorkQuote(run, task.id)).toMatchObject({ unpaidCost: 70, fee: price(6), remainingWork: 6 });
    addProductionWork(run);
    expect(apiWorkQuote(run, task.id)).toMatchObject({ unpaidCost: 0, fee: price(5), remainingWork: 5 });
    for (const level of [-1, 1.25]) {
      run.infrastructure = level;
      expect(apiWorkQuote(run, task.id)).toBeNull();
    }
    run.infrastructure = 1;
    task.work = Number.MAX_SAFE_INTEGER;
    expect(apiWorkQuote(run, task.id)).toBeNull();
  });

  it('refuses inconsistent projects before charging a fee', () => {
    const run = company();
    const block = run.blocks[0];
    const task = enqueueTask(run, { kind: 'upgrade', cost: 0, work: 1, block: 'core', level: 2 });
    expect(apiWorkQuote(run, task.id)).not.toBeNull();
    task.level = 3;
    expect(apiWorkQuote(run, task.id)).toBeNull();
    delete task.level;
    expect(apiWorkQuote(run, task.id)).not.toBeNull();
    block.level = PRODUCTION.max_level;
    expect(apiWorkQuote(run, task.id)).toBeNull();
    block.level = 1;
    block.live = false;
    expect(apiWorkQuote(run, task.id)).toBeNull();
    task.block = 'missing';
    syncProduction(run);
    expect(apiWorkQuote(run, task.id)).toBeNull();
    expect(run.blocks).toHaveLength(1);
  });
});

describe('release forecasts', () => {
  it('returns completed work only if funds run out, excluding queued projects without mutating them', () => {
    const run = company();
    const ready = enqueueTask(run, { kind: 'card', card: 'rest', work: 1, cost: 0 });
    addProductionWork(run);
    const expensive = enqueueTask(run, { kind: 'infrastructure', work: 80, cost: 200 });
    run.money = 0;
    expect(nextReleaseWork(run)).toEqual(new Set([ready.id]));
    expect(expensive.status).toBe('queued');
    expect(run.money).toBe(0);
    expect(resumeTask(run, ready.id)).toBe(false);
  });

  it('models builders and repair agents while promoters do not advance the work queue', () => {
    const run = company();
    const task = enqueueTask(run, { kind: 'infrastructure', cost: 5, work: 2 });
    run.agents = [
      { id: 1, tier: 'fast', lane: 'promo', carry: 0.9 },
      { id: 2, tier: 'fast', lane: 'fix', carry: 0.999 },
      { id: 3, tier: 'fast', lane: 'build', carry: 0.5 },
    ];
    run.debt = 4;
    expect(nextReleaseWork(run)).toEqual(new Set([task.id]));
    expect(run.debt).toBe(4);
    expect(task.done).toBe(0);
  });

  it('pauses queued work during a choice and after the company ends', () => {
    const run = company();
    const task = enqueueTask(run, { kind: 'infrastructure', cost: 50, work: 3 });
    run.draft = ['leads', 'rest', 'maintenance'];
    expect(startWork(run)).toBeUndefined();
    run.draft = null;
    run.over = 'broke';
    expect(addProductionWork(run)).toBeUndefined();
    expect(task.status).toBe('queued');
    expect(task.done).toBe(0);
  });
});
