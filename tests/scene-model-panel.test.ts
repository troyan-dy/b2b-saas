import { describe, expect, it } from 'vitest';
import { blocksOnSheet, cashRunway, currentSite, demolitionTargets, deskOffer, grownTraits, outstandingPromises, startingRunwayMinutes } from '../src/game/company-panel-model';
import { emptyMeta } from '../src/systems/meta/meta';
import { enqueueTask } from '../src/systems/run/production';
import { OFFICE, refreshRun, TUNING } from '../src/systems/run/run';
import { company, contract, moduleAt } from './scene-model-fixtures';

describe('company panels', () => {
  it.each([
    [120, 0, null],
    [120, 2, null],
    [0, -2, '0:00'],
    [119.99, -2, '0:59'],
    [120, -2, '1:00'],
    [131, -2, '1:05'],
  ] as const)('displays the cash runway for %s at a net rate of %s', (cash, net, expected) => {
    expect(cashRunway(cash, net)).toBe(expected);
  });

  it('caps landed work at the task size and assigns whole debt squares to finished buildings in placement order', () => {
    const run = company();
    run.blocks = [
      moduleAt('core', 0, false),
      { ...moduleAt('landing', 1), up: true },
      { ...moduleAt('api', 2, false), built: true },
      moduleAt('sso', 3),
    ];
    run.clients.push(contract(1, 'corp'));
    run.debt = 18.5;
    refreshRun(run);
    const result = blocksOnSheet(run, new Map([['core', 1], ['api', 10]]));
    expect(result.map(b => [b.done, b.built, b.debt])).toEqual([[1, false, 0], [0, true, 15], [4, true, 3], [0, true, 0]]);
    expect(result[1]).toMatchObject({ up: true, logos: 1 });
    expect(run.debt).toBe(18.5);
    expect(blocksOnSheet(run, new Map())[2].built).toBe(false);
  });

  it('offers demolition only on live optional modules with no current or planned work', () => {
    const run = company();
    run.blocks = [
      moduleAt('core', 0), moduleAt('sso', 1), moduleAt('audit', 2), { ...moduleAt('api', 3), up: true },
      moduleAt('crm', 4, false), moduleAt('dark', 5),
    ];
    enqueueTask(run, { kind: 'upgrade', block: 'audit', level: 2, work: 5, cost: 0 });
    expect(demolitionTargets(run, '*').map(b => b.kind)).toEqual(['sso', 'dark']);
    expect(demolitionTargets(run, 'dark').map(b => b.kind)).toEqual(['dark']);
    expect(demolitionTargets(run, 'audit')).toEqual([]);
  });

  it('locates the active building before affordable waiting work and skips non-building projects', () => {
    const run = company();
    run.blocks = [moduleAt('api', 0), moduleAt('sso', 1)];
    expect(currentSite(run)).toBeUndefined();
    const site = enqueueTask(run, { kind: 'upgrade', block: 'api', level: 2, work: 2, cost: 0 });
    site.cost = 100;
    run.money = 99;
    expect(currentSite(run)).toBeUndefined();
    run.money++;
    expect(currentSite(run)).toBe(run.blocks[0]);
    const active = enqueueTask(run, { kind: 'upgrade', block: 'sso', level: 2, work: 3, cost: 0 });
    active.status = 'active';
    expect(currentSite(run)).toBe(run.blocks[1]);
    run.tasks = [];
    enqueueTask(run, { kind: 'infrastructure', work: 1, cost: 0 });
    expect(currentSite(run)).toBeUndefined();
  });

  it('sorts outstanding promises by urgency and caps deadlines at the final release', () => {
    const run = company();
    run.sprint = TUNING.last_sprint - 2;
    run.clients = [
      { ...contract(1, 'small'), happy: false, promised: true, patience: 4 },
      { ...contract(2, 'small'), happy: false, promised: true, patience: 1 },
      { ...contract(3, 'small'), happy: true, promised: true },
      { ...contract(4, 'small'), happy: false },
    ];
    expect(outstandingPromises(run).map(p => [p.client.id, p.deadline])).toEqual([[2, run.sprint], [1, TUNING.last_sprint]]);
    expect(run.clients.map(c => c.id)).toEqual([1, 2, 3, 4]);
  });

  it('distinguishes unaffordable desks, an exact purchase and a full office', () => {
    const run = company();
    run.money = OFFICE.desks.cost - 1;
    expect(deskOffer(run)).toEqual({ price: OFFICE.desks.cost, slots: OFFICE.desks.base, disabled: true });
    run.money++;
    expect(deskOffer(run).disabled).toBe(false);
    run.desks = OFFICE.desks.max - OFFICE.desks.base;
    expect(deskOffer(run)).toEqual({ price: null, slots: OFFICE.desks.max, disabled: true });
  });

  it('offers only earned traits for a boost, and estimates runway with the initial agent working', () => {
    const meta = emptyMeta();
    meta.traits = { sales: 1, engineering: 2, network: 0, retired: 3 };
    expect(grownTraits(meta).map(t => t.id)).toEqual(['sales', 'engineering']);
    const seconds = startingRunwayMinutes() * 60;
    const burn = TUNING.living_per_s + TUNING.tiers.fast.cost_per_s;
    expect(Math.abs(seconds - TUNING.start_money / burn)).toBeLessThanOrEqual(3);
  });
});
