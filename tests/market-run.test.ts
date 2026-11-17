import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRun, IDEAS, crunch, handy, busy, setLane, setReview, agentCost, LANES, expandOffice, cellsMax, agentSlots, OFFICE, officeQuote, freeCells, place, type Lane } from '../src/systems/run/run';
import { evolveMarket } from '../src/systems/company/market';
import { saveRun, loadRun, RUN_SAVE_KEY } from '../src/systems/run/save';
afterEach(() => vi.unstubAllGlobals());
const fresh = () => createRun(5, {tech:IDEAS.tech[0],form:IDEAS.form[0],aud:IDEAS.aud[0]});
describe('open market in the company loop', () => {
  it('offers only ordinary jobs and cannot spend energy or wages on a retired research action', () => {
    const run = fresh();
    const obsolete = 'research' as Lane;
    expect(LANES).toEqual(['build', 'fix', 'promo']);
    setLane(run, 1, obsolete);
    expect(run.agents[0].lane).toBe('build');
    expect(setReview(run, obsolete)).toBe(false);
    const energy = run.energy, money = run.money;
    expect(handy(run, obsolete)).toBe(false);
    expect(crunch(run, obsolete)).toBe(false);
    expect(run.energy).toBe(energy);
    expect(run.money).toBe(money);
    expect(busy(run, run.agents[0])).toBe(false);
    expect(agentCost(run)).toBe(0);
    expect(place(run, 'core', 0, 0)).toBe(true);
    expect(busy(run, run.agents[0])).toBe(true);
    expect(agentCost(run)).toBeGreaterThan(0);
    expect(run).not.toHaveProperty('research');
  });
  it('roundtrips evolved market data without study state', () => {
    const data = new Map<string,string>();
    vi.stubGlobal('localStorage', {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});
    const run = fresh();
    evolveMarket(run.market, ['core','landing','pay',...run.pool], 7, run.seed);
    expect(saveRun(run)).toBe(true);
    expect(loadRun()?.market).toEqual(run.market);
    const saved = JSON.parse(data.get(RUN_SAVE_KEY)!);
    expect(saved.v).toBe(4);
    for (const field of ['research', 'known', 'insight']) expect(saved.run).not.toHaveProperty(field);
  });
  it('buys enough building space and finite workspaces with increasing prices', () => {
    const run=fresh();run.money=100000;run.stage=3;
    const first=officeQuote(run,'land')!;
    const originalCells = cellsMax(run);
    run.money = first - 1;
    expect(expandOffice(run, 'land')).toBe(false);
    expect([run.money, cellsMax(run), run.land]).toEqual([first - 1, originalCells, 0]);
    run.money = first;
    expect(expandOffice(run,'land')).toBe(true);
    expect(run.money).toBe(0);
    expect(cellsMax(run)).toBe(originalCells + OFFICE.land.cells);
    expect(officeQuote(run,'land')).toBeGreaterThan(first);
    run.money = 100000;
    while(expandOffice(run,'land')) { /* buy the finite plot */ }
    expect(cellsMax(run)).toBe(run.pool.length+3);
    for (const kind of ['core', 'landing', 'pay', ...run.pool]) {
      const cell = freeCells(run)[0];
      expect(cell).toBeDefined();
      expect(place(run, kind, cell.i, cell.j)).toBe(true);
    }
    expect(run.blocks).toHaveLength(run.pool.length + 3);
    expect(agentSlots(run)).toBe(OFFICE.desks.base);
    run.money = 4_000_000;
    while(expandOffice(run,'desks')) { /* buy the finite office */ }
    expect(agentSlots(run)).toBe(OFFICE.desks.max);
    expect(officeQuote(run,'desks')).toBeNull();
  });
});
