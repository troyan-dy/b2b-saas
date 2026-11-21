import { describe, expect, it } from 'vitest';
import { dismissGuideStep, guideStep, profitLesson, resumeProfitGuide, startGuide } from '../src/game/startup-guide';
import {
  answerCall, answerDilemma, answerLastChance, answerOffer, chooseCard, createRun, crunch, dealIdea,
  dilemmaOf, expandInfrastructure, flows, freeCells, IDEAS, netPerS, place, setLane, shelf, step, TUNING,
} from '../src/systems/run/run';
import { client, product, release, startup } from './run-rules-fixtures';

describe('profit lesson in a running company', () => {
  it('rejoins the actual blueprint before payment; never advances the company on invitation', () => {
    const run = startup(['template']);
    const before = { ...run };
    resumeProfitGuide(run);
    expect(guideStep(run, null)).toBe('landing');
    expect(run).toMatchObject(before);
  });

  it('rejoins a paid company at its live ledger, even if a profitable tick has not settled', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1, { pay: 800 })];
    expect(netPerS(run)).toBeGreaterThan(0);
    resumeProfitGuide(run);
    expect(guideStep(run, null)).toBe('ledger');
    expect(profitLesson(run)).toMatchObject({ ...flows(run), net: netPerS(run) });
    dismissGuideStep(run, 'ledger');
    expect(guideStep(run, null)).toBeNull();
    run.clients[0].pay = 1;
    run.money += 1000;
    release(run, 1);
    expect(guideStep(run, null)).toBe('compare');
    expect(profitLesson(run).net).toBeLessThan(0);
  });

  it('freezes a positive release, including costs, even if a draft or the next release changes the rates', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1, { pay: 1000 })];
    startGuide(run);
    release(run, 1);
    expect(guideStep(run, null)).toBe('subscribed');
    dismissGuideStep(run, 'subscribed');
    expect(guideStep(run, null)).toBe('profitable');
    const snapshot = { ...flows(run), release: 1, net: netPerS(run) };
    expect(profitLesson(run)).toMatchObject(snapshot);
    chooseCard(run, run.draft![0]);
    run.clients[0].pay = 0;
    release(run, 2);
    run.dilemma = null;
    expect(guideStep(run, null)).toBe('profitable');
    expect(profitLesson(run)).toMatchObject(snapshot);
    dismissGuideStep(run, 'profitable');
    expect(run.guide).toBeUndefined();
  });

  it('stops paying for promotion when one more ordinary contract could cover the deficit', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1, {pay: 200})];
    resumeProfitGuide(run);
    dismissGuideStep(run, 'ledger');
    setLane(run, 1, 'promo');
    run.leads = 1;
    expect(guideStep(run, null)).toBe('park-agent');
    expect(profitLesson(run).agentId).toBe(1);
    setLane(run, 1, 'build');
    expect(guideStep(run, null)).toBeNull();
  });

  it('keeps prospecting beyond the named-account lead when its margin cannot cover bills, then parks before settlement', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1, { pay: 55 })];
    resumeProfitGuide(run);
    dismissGuideStep(run, 'ledger');
    setLane(run, 1, 'promo');
    run.leads = 1;
    expect(guideStep(run, null)).toBeNull();
    step(run, 28);
    expect(crunch(run, 'fix')).toBe(true);
    expect(run.leads).toBeGreaterThan(1);
    expect(guideStep(run, null)).toBe('park-agent');
    setLane(run, 1, 'build');
    expect(flows(run).agents).toBe(0);
  });

  it('helps find a buyer if payments shipped after the initial free client already left', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    resumeProfitGuide(run);
    expect(guideStep(run, null)).toBe('post');
    expect(crunch(run, 'promo')).toBe(true);
    expect(guideStep(run, null)).not.toBe('post');
    run.money = 5;
    expect(guideStep(run, null)).toBeNull();
  });

  it('does not recommend manual actions already performed outside the tip in this sprint', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1)];
    run.debt = 9;
    resumeProfitGuide(run);
    crunch(run, 'promo');
    crunch(run, 'fix');
    dismissGuideStep(run, 'ledger');
    expect(guideStep(run, null)).toBe('assign-promo');
  });

  it('uses the prior release on manual rejoin even if prices and live costs have since changed', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1, {pay: 5})];
    release(run, 1);
    const previousNet = netPerS(run);
    chooseCard(run, run.draft![0]);
    run.clients[0].pay = 1000;
    release(run, 2);
    const snapshot = { ...flows(run), net: netPerS(run), previousNet, release: 2 };
    run.clients[0].pay = 0;
    run.dilemma = null;
    resumeProfitGuide(run);
    expect(guideStep(run, null)).toBe('profitable');
    expect(profitLesson(run)).toMatchObject(snapshot);
  });

  it('does not reconstruct missing historical rates from current bills in an old profitable company', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1, {pay: 1000})];
    release(run, 1);
    delete run.lastReport!.cashFlow;
    const oldIncome = run.lastReport!.mrr / TUNING.sprint_s;
    run.clients = [];
    resumeProfitGuide(run);
    expect(guideStep(run, null)).toBe('profitable');
    expect(profitLesson(run)).toMatchObject({ income: oldIncome, historicalRatesMissing: true, release: 1 });
    release(run, 2);
    expect(profitLesson(run)).toMatchObject({ income: oldIncome, historicalRatesMissing: true, release: 1 });
  });

  it('a verified zero release is not profitable, even after a grant or a stale finish click', () => {
    const run = createRun(7, { tech: IDEAS.tech[0], form: IDEAS.form[3], aud: IDEAS.aud[0] });
    product(run, ['pay']);
    run.clients = [client(1, { type: 'corp', pay: 32, deal: 4.88 })];
    run.t = TUNING.sprint_s;
    resumeProfitGuide(run);
    dismissGuideStep(run, 'ledger');
    release(run, 1);
    expect(run.lastReport!.cashFlow!.net).toBe(0);
    expect(run.stats.profitAt).toBe(0);
    run.money += 1200;
    dismissGuideStep(run, 'profitable');
    expect(guideStep(run, null)).toBe('compare');
    dismissGuideStep(run, 'compare');
    chooseCard(run, run.draft![0]);
    expect(guideStep(run, null)).toBeNull();
  });

  it('offers affordable market capacity only with overload and a builder; respects pending work', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.market.opened = true;
    run.market.groups[0].profiles[0].count = 80;
    resumeProfitGuide(run);
    dismissGuideStep(run, 'ledger');
    expect(guideStep(run, null)).toBe('expand-capacity');
    run.money = 900;
    expect(guideStep(run, null)).toBeNull();
    run.money = 1050;
    expect(guideStep(run, null)).toBeNull();
    run.money = 2200;
    const order = shelf(run)[0];
    expect(place(run, order, 0, -1)).toBe(true);
    run.tasks[0].work = 90;
    expect(guideStep(run, null)).toBeNull();
    step(run, 1); // Today's active builder is already in the ledger; the queue still needs funding.
    expect(guideStep(run, null)).toBeNull();
    run.tasks = [];
    run.agents = [];
    expect(guideStep(run, null)).toBeNull();
    run.agents = [{id: 4, tier: 'fast', lane: 'build', carry: 0}];
    expect(expandInfrastructure(run)).toBe(true);
    expect(guideStep(run, null)).toBeNull();
  });

  it('presents a paid release before an offer or dilemma hidden behind its draft', () => {
    const run = startup();
    startGuide(run);
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1, {pay: 2000})];
    release(run, 1);
    run.offer = 500;
    expect(guideStep(run, null)).toBe('subscribed');
    dismissGuideStep(run, 'subscribed');
    expect(guideStep(run, null)).toBe('profitable');
    chooseCard(run, run.draft![1]);
    expect(guideStep(run, null)).toBeNull();
  });

  it('reserves cash to the later release when debt accumulated by a builder delays expansion', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.market.opened = true;
    run.market.groups[0].profiles[0].count = 80;
    run.sprintT = 25; // 39 seconds until release #2. At today's speed the order appears to take 38.4.
    resumeProfitGuide(run);
    dismissGuideStep(run, 'ledger');
    run.money = 1450;
    expect(guideStep(run, null)).toBeNull();
    run.money = 2200;
    expect(guideStep(run, null)).toBe('expand-capacity');
    expect(expandInfrastructure(run)).toBe(true);
    for (let tick = 0; tick < 39 * 10; tick++) {
      if (run.draft) chooseCard(run, run.draft.find(id => id !== 'maintenance')!);
      step(run, 0.1);
    }
    expect(run.lastReport?.sprint).toBe(2);
    expect(run.infrastructure).toBe(0);
    expect(run.debt).toBeGreaterThan(0);
  });

  it('reserves for a debt-producing promoter even when the builder is debt-free', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.market.opened = true;
    run.market.groups[0].profiles[0].count = 80;
    run.sprintT = 20; // A think builder alone can just finish the 12 work before this release.
    run.agents = [{ id: 1, tier: 'think', lane: 'build', carry: 0 }];
    resumeProfitGuide(run);
    dismissGuideStep(run, 'ledger');
    run.money = 1500;
    expect(guideStep(run, null)).toBe('expand-capacity');
    run.agents.push({ id: 2, tier: 'fast', lane: 'promo', carry: 0 });
    expect(guideStep(run, null)).toBeNull();
    run.money = 2800;
    expect(guideStep(run, null)).toBe('expand-capacity');
  });

  it('picks an affordable idle agent by id, keeping people on active jobs and yielding during an outage', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1)];
    resumeProfitGuide(run);
    dismissGuideStep(run, 'ledger');
    run.energy = 0;
    run.agents = [
      { id: 5, lane: 'build', tier: 'think', carry: 0 },
      { id: 8, lane: 'fix', tier: 'normal', carry: 0 },
      { id: 9, lane: 'fix', tier: 'fast', carry: 0 },
    ];
    expect(guideStep(run, null)).toBe('assign-promo');
    expect(profitLesson(run).agentId).toBe(9);
    expect(place(run, shelf(run)[0], 0, -1)).toBe(true);
    run.debt = 2;
    expect(guideStep(run, null)).toBeNull();
    run.down = true;
    run.energy = 2;
    dismissGuideStep(run, 'fix-debt');
    expect(guideStep(run, null)).toBeNull();
    resumeProfitGuide(run);
    expect(guideStep(run, null)).toBeNull();
  });

  it('does not buy another sprint of agent wages if the player already moved them back to construction', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1)];
    resumeProfitGuide(run);
    dismissGuideStep(run, 'ledger');
    run.energy = 0;
    setLane(run, 1, 'promo');
    setLane(run, 1, 'build');
    expect(guideStep(run, null)).toBeNull();
  });

  it('retains two customers with one deliverable module; a different selection does not coach the wrong cell', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    const kind = shelf(run)[0];
    run.clients = [client(1,{pay:30,want:kind}), client(2,{pay:40,want:kind})];
    resumeProfitGuide(run);
    dismissGuideStep(run, 'ledger');
    expect(guideStep(run,null)).toBe('client-block');
    expect(profitLesson(run).blockId).toBe(kind);
    dismissGuideStep(run, 'client-block');
    expect(guideStep(run,shelf(run)[1])).toBeNull();
    expect(guideStep(run,kind)).toBe('client-cell');
    const cell = freeCells(run)[0];
    place(run,kind,cell.i,cell.j);
    expect(guideStep(run,null)).toBe('post');
  });

  it('rejoins when revenue only exists in an old report; does not infer profit from old income alone', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1)];
    release(run, 1);
    delete run.lastReport!.profitableStreak;
    delete run.lastReport!.cashFlow;
    chooseCard(run, run.draft![0]);
    if (run.call) answerCall(run, false);
    run.clients = [];
    run.down = true;
    resumeProfitGuide(run);
    expect(guideStep(run, null)).toBe('ledger');
    expect(profitLesson(run).income).toBe(0);
  });
});

// Only perform highlighted actions. Card choices are independent of their value.
function walk(seed: number, varied = false) {
  const { tech, form, aud } = dealIdea(seed, 0);
  const run = createRun(seed, { tech: tech[varied ? seed % 3 : 0], form: form[varied ? Math.floor(seed / 3) % 3 : 0],
    aud: aud[varied ? Math.floor(seed / 9) % 3 : 0] });
  startGuide(run);
  let picked: string | null = null;
  const paid: number[] = [];
  for (let turn = 0; turn < 5000 && !run.over; turn++) {
    const tip = guideStep(run, picked);
    if (tip === 'profitable') {
      expect(run.lastReport!.profitableStreak).toBeGreaterThan(0);
      return { seed, success: true, paid, release: profitLesson(run).release };
    }
    if (tip === 'core' || tip === 'landing' || tip === 'pay') picked = tip;
    else if (tip === 'client-block') picked = profitLesson(run).blockId!;
    else if (tip?.endsWith('-cell')) {
      const cells = freeCells(run);
      const cell = cells[varied ? (seed + run.blocks.length) % cells.length : 0];
      expect(place(run, picked!, cell.i, cell.j)).toBe(true);
      picked = null;
    } else if (tip === 'code' || tip === 'post' || tip === 'fix-debt') {
      expect(crunch(run, tip === 'code' ? 'build' : tip === 'post' ? 'promo' : 'fix')).toBe(true);
    } else if (tip === 'assign-promo' || tip === 'park-agent') {
      setLane(run, profitLesson(run).agentId!, tip === 'park-agent' ? 'build' : 'promo');
    } else if (tip === 'expand-capacity') expect(expandInfrastructure(run)).toBe(true);
    if (tip) { dismissGuideStep(run, tip); continue; }
    if (run.draft) chooseCard(run, run.draft[(seed + run.sprint) % 3]);
    else if (run.call) answerCall(run, varied && (seed + run.sprint) % 3 === 0);
    else if (run.offer !== null) answerOffer(run, 'no');
    else if (run.lastChance !== null) answerLastChance(run, true);
    else if (run.dilemma) {
      const choices = dilemmaOf(run)!.options.length;
      answerDilemma(run, varied ? (seed + run.sprint) % choices : choices - 1);
    } else {
      step(run, 0.5);
      if (run.draft && run.lastReport!.mrr > 0) paid.push(netPerS(run));
    }
  }
  return { seed, success: false, paid };
}

it('following only the guide reaches a profitable release across varied ordinary pitches', () => {
  const walks = Array.from({ length: 48 }, (_, i) => walk(101 + i));
  const wins = walks.filter(w => w.success);
  const example = wins.find(w => w.paid[0] < 0)!;
  console.log('guided profitable releases:', wins.length, '/', walks.length,
    '; initially losing paid releases recovered:', wins.filter(w => w.paid[0] < 0).length,
    '; example seed', example.seed, 'paid release net/s:', example.paid.map(n => n.toFixed(2)));
  expect(wins.length).toBe(48);
  expect(wins.filter(w => w.paid[0] < 0).length).toBeGreaterThanOrEqual(24);
}, 60000);

it('survives the short-patience coffee startup with the original card choices', () => {
  const result = walk(129);
  console.log('seed 129, recurring net/s at paid releases:', result.paid.map(n => n.toFixed(2)), 'first profit at release', result.release);
  expect(result.success).toBe(true);
  expect(result.paid[0]).toBeLessThan(0);
});

it('handles varied placements, pitches, card choices and risky promises on independent seeds', () => {
  const walks = Array.from({ length: 240 }, (_, i) => walk(2001 + i, true));
  const losses = walks.filter(w => !w.success);
  console.log('independent guided startups:', walks.length - losses.length, '/', walks.length,
    '; losing seeds:', losses.map(w => w.seed).join(', '));
  expect(losses.length).toBeLessThanOrEqual(24);
}, 60000);
