import { describe, expect, it } from 'vitest';
import { cityBuildings, cityFrame, cityGroups, cityOutlet, payingGroups } from '../src/game/client-city-model';
import { AGENT_SLOTS, CLIENT_SLOTS } from '../src/game/layout';
import { clientPay, IDEAS, refreshRun, TUNING } from '../src/systems/run/run';
import { company, contract, moduleAt } from './scene-model-fixtures';

describe('city map', () => {
  it('combines cohort and named customers in segment order, drawing at most four buildings per column', () => {
    const run = company();
    expect(cityGroups(run)).toEqual([]);
    run.clients.push(contract(1, 'startup'), contract(2, 'small'), contract(3, 'mid'), contract(4, 'corp'), contract(5, 'gov'));
    for (const group of run.market.groups) group.profiles[0].count = 4;
    const groups = cityGroups(run);
    expect(groups.map(g => [g.id, g.count, g.contracts.map(c => c.id)])).toEqual([
      ['small', 6, [1, 2]], ['medium', 5, [3]], ['large', 6, [4, 5]],
    ]);
    const expanded = cityBuildings(run, groups, false);
    expect(expanded).toHaveLength(12);
    expect(expanded[0]).toMatchObject({ id: 'city:small:0:1', texture: 'building-1', height: 112, chain: false });
    expect(expanded[0].title).toContain('Contract 1');
    expect(expanded[2]).toMatchObject({ texture: run.idea.aud.texture, height: 118 });
    expect(expanded[4]).toMatchObject({ id: 'city:medium:0:3', height: 136, chain: true });
    expect(expanded[5]).toMatchObject({ id: 'city:medium:1:group', chain: true });
    expect(expanded[10]).toMatchObject({ id: 'city:large:2:group', texture: [...IDEAS.corp, ...IDEAS.gov][2].texture, height: 150 });
    const collapsed = cityBuildings(run, groups, true);
    expect(collapsed.map(n => n.id)).toEqual(['city:small:0:1', 'city:medium:0:3', 'city:large:0:4']);
    expect(collapsed.map(n => [n.x, n.y])).toEqual([CLIENT_SLOTS[0], CLIENT_SLOTS[4], CLIENT_SLOTS[8]]);
  });

  it('charges named contracts and cohorts once and suppresses payment streams during downtime', () => {
    const run = company();
    run.clients.push(contract(1, 'small'), contract(2, 'small'), contract(3, 'corp'));
    run.market.groups[1].profiles[0].count = 3;
    expect(payingGroups(run)).toEqual([]);
    run.blocks = [moduleAt('core', 0), moduleAt('pay', 1)];
    refreshRun(run);
    const medium = cityGroups(run).find(g => g.id === 'medium')!;
    expect(medium.segment.income).toBeGreaterThan(0);
    expect(payingGroups(run)).toEqual([
      { id: 'small', income: (clientPay(run, run.clients[0]) + clientPay(run, run.clients[1])) / TUNING.sprint_s },
      { id: 'medium', income: medium.segment.income / TUNING.sprint_s },
      { id: 'large', income: clientPay(run, run.clients[2]) / TUNING.sprint_s },
    ]);
    run.down = true;
    expect(payingGroups(run)).toEqual([]);
  });

  it('connects the city to the rightmost live diagonal without reordering the blueprint', () => {
    const run = company();
    const left = moduleAt('core', 1), right = { ...moduleAt('pay', 4), j: 1 };
    const tied = moduleAt('landing', 3), pending = moduleAt('api', 6, false);
    run.blocks = [left, right, tied, pending];
    expect(cityOutlet(run, false)).toBeUndefined();
    expect(cityOutlet(run, true)).toBe(right);
    expect(run.blocks).toEqual([left, right, tied, pending]);
  });

  it('widens the frame as segments and desks fill, keeping the rightmost city caption visible', () => {
    const run = company();
    expect(cityFrame(run)).toMatchObject({ key: 11, columns: 0, rightEdge: 0, zoom: 1 });
    run.market.opened = true;
    expect(cityFrame(run)).toMatchObject({ key: 21, columns: 0, y: 110 });
    run.market.opened = false;
    run.clients.push(contract(1, 'small'));
    expect(cityFrame(run)).toMatchObject({ key: 21, columns: 1 });
    while (run.agents.length <= AGENT_SLOTS.length / 2)
      run.agents.push({ ...run.agents[0], id: run.agents.length + 1 });
    expect(cityFrame(run)).toMatchObject({ key: 22, y: 300 });
    run.market.groups[1].profiles[0].count = 1;
    run.clients.push(contract(2, 'gov'));
    const frame = cityFrame(run);
    expect(frame).toMatchObject({ key: 32, columns: 3, y: 225, rightEdge: CLIENT_SLOTS[8][0] + 105 });
    expect((frame.rightEdge - frame.x) * frame.zoom + 670).toBeCloseTo(1322);
  });
});
