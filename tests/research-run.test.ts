import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRun, IDEAS, startResearch, crunch, handy, busy, setLane, expandOffice, cellsMax, agentSlots, OFFICE, officeQuote, freeCells, place } from '../src/systems/run/run';
import { evolveMarket } from '../src/systems/company/market';
import { saveRun, loadRun, RUN_SAVE_KEY } from '../src/systems/run/save';
afterEach(() => vi.unstubAllGlobals());
const fresh = () => createRun(5, {tech:IDEAS.tech[0],form:IDEAS.form[0],aud:IDEAS.aud[0]});
describe('research in the company loop', () => {
  it('researches before sales, stops wages after completion, and reopens after a real shift', () => {
    const run = fresh();
    expect(startResearch(run, 'clients')).toBe(true);
    setLane(run, 1, 'research');
    expect(busy(run, run.agents[0])).toBe(true);
    for(let n=0;n<30 && handy(run,'research');n++) {run.energy=8;crunch(run,'research');}
    expect(run.research.reports.clients?.findings).toHaveLength(3);
    expect(busy(run, run.agents[0])).toBe(false);
    expect(startResearch(run, 'clients')).toBe(false);
    const previous = JSON.stringify(run.research.reports.clients);
    evolveMarket(run.market, ['core','landing','pay',...run.pool], 7, run.seed);
    expect(JSON.stringify(run.research.reports.clients)).toBe(previous);
    expect(startResearch(run, 'clients')).toBe(true);
  });
  it('roundtrips reports, active progress, shifted audiences, and legacy saves', () => {
    const data = new Map<string,string>();
    vi.stubGlobal('localStorage', {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});
    const run=fresh();
    startResearch(run,'market');
    for(let i=0;i<30 && handy(run,'research');i++){run.energy=8;crunch(run,'research');}
    evolveMarket(run.market,['core','landing','pay',...run.pool],7,run.seed);
    startResearch(run,'clients');crunch(run,'research');
    expect(saveRun(run)).toBe(true);
    const loaded=loadRun()!;
    expect(loaded.research).toEqual(run.research);
    expect(loaded.market).toEqual(run.market);
    const saved=JSON.parse(data.get(RUN_SAVE_KEY)!);
    saved.v=1;delete saved.run.research;delete saved.run.land;delete saved.run.desks;
    data.set(RUN_SAVE_KEY,JSON.stringify(saved));
    expect(loadRun()?.research.reports).toEqual({clients:null,market:null});
  });
  it('buys enough building space and finite workspaces with increasing prices', () => {
    const run=fresh();run.money=100000;run.stage=3;
    const first=officeQuote(run,'land')!;
    expect(expandOffice(run,'land')).toBe(true);
    expect(officeQuote(run,'land')).toBeGreaterThan(first);
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
