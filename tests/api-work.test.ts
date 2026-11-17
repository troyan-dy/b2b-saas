import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiWorkQuote, rushTask, startWork, cancelTask, syncProduction, enqueueTask, nextReleaseWork } from '../src/systems/run/production';
import { agentWorkRate } from '../src/systems/run/workforce';
import { createRun, IDEAS, place, step, setLane, TUNING } from '../src/systems/run/run';
import { loadRun, saveRun } from '../src/systems/run/save';
afterEach(() => vi.unstubAllGlobals());
function fresh() {
  const run = createRun(7, { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] });
  run.money = 100000;
  place(run, 'core', 0, 0);
  return run;
}
describe('paid builder acceleration', () => {
  it('forecasts a boosted task without lending its boost to the next task', () => {
    const run = fresh();
    const first = run.tasks[0];
    first.work = 3;
    const second = enqueueTask(run, { kind: 'infrastructure', work: 4, cost: 0 });
    run.sprintT = TUNING.sprint_s - 15;
    expect(rushTask(run, first.id)).toBe(true);
    expect(nextReleaseWork(run)).toEqual(new Set([first.id]));
    setLane(run, run.agents[0].id, 'fix');
    expect(nextReleaseWork(run).size).toBe(0);
    setLane(run, run.agents[0].id, 'build');
    while (run.sprint === 1) step(run, 1 / 60);
    expect(run.live.has('core')).toBe(true);
    expect(run.tasks.some(t => t.id === second.id)).toBe(true);
  });
  it('buys speed without supplying work, activating the block, or paying construction twice', () => {
    const run = fresh(), task = run.tasks[0];
    const quote = apiWorkQuote(run, task.id)!;
    const money = run.money, rate = agentWorkRate(run, run.agents[0]);
    expect(rushTask(run, task.id)).toBe(true);
    expect(task.done).toBe(0);
    expect(run.live.has('core')).toBe(false);
    expect(run.apiShipped).toEqual([]);
    expect(run.money).toBe(money - quote.cost);
    expect(agentWorkRate(run, run.agents[0])).toBe(rate * 2);
    startWork(run);
    expect(run.money).toBe(money - quote.cost - task.cost);
    expect(rushTask(run, task.id)).toBe(false);
    expect(apiWorkQuote(run, task.id)).toBeNull();
  });
  it('cannot substitute money for builders and pauses when builders are reassigned', () => {
    const run = fresh(), task = run.tasks[0];
    setLane(run, run.agents[0].id, 'promo');
    const before = run.money;
    expect(apiWorkQuote(run, task.id)?.builder).toBe(false);
    expect(rushTask(run, task.id)).toBe(false);
    expect(run.money).toBe(before);
    setLane(run, run.agents[0].id, 'build');
    expect(rushTask(run, task.id)).toBe(true);
    for (let k = 0; k < 12; k++) step(run, .25);
    const done = task.done;
    expect(done).toBeGreaterThan(0);
    setLane(run, run.agents[0].id, 'promo');
    for (let k = 0; k < 12; k++) step(run, .25);
    expect(task.done).toBe(done);
    expect(run.live.has('core')).toBe(false);
  });
  it('retains the normal release and cannot accelerate already completed work', () => {
    const run = fresh(), task = run.tasks[0];
    rushTask(run, task.id);
    task.done = task.work;
    task.status = 'ready';
    syncProduction(run);
    expect(apiWorkQuote(run, task.id)).toBeNull();
    expect(run.live.has('core')).toBe(false);
    step(run, TUNING.sprint_s);
    expect(run.live.has('core')).toBe(true);
    expect(run.tasks).toHaveLength(0);
  });
  it('rejects unaffordable acceleration atomically and does not refund cancelled compute', () => {
    const run = fresh(), task = run.tasks[0];
    run.money = apiWorkQuote(run, task.id)!.cost - 1;
    const before = run.money;
    expect(rushTask(run, task.id)).toBe(false);
    expect(run.money).toBe(before);
    run.money = 100000;
    rushTask(run, task.id);
    const paid = run.money;
    cancelTask(run, task.id);
    expect(run.money).toBe(paid);
  });
  it('saves purchased compute and restores it without charging or completing work', () => {
    const memory = new Map<string,string>();
    vi.stubGlobal('localStorage', {getItem: (k:string) => memory.get(k) ?? null, setItem: (k:string,v:string) => memory.set(k,v)});
    const run = fresh();
    rushTask(run, run.tasks[0].id);
    expect(saveRun(run)).toBe(true);
    const restored = loadRun()!;
    expect(restored).not.toBeNull();
    expect(restored.tasks[0].apiBoost).toBe(true);
    expect(restored.tasks[0].done).toBe(0);
    expect(restored.money).toBe(run.money);
  });
});
