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

  it('parks a paid promoter after a lead rather than buying redundant work or taking away a builder', () => {
    const run = startup();
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1)];
    resumeProfitGuide(run);
    dismissGuideStep(run, 'ledger');
    setLane(run, 1, 'promo');
    run.leads = 1;
    expect(guideStep(run, null)).toBe('park-agent');
    expect(profitLesson(run).agentId).toBe(1);
    setLane(run, 1, 'build');
    expect(guideStep(run, null)).toBeNull();
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
    resumeProfitGuide(run);
    dismissGuideStep(run, 'ledger');
    release(run, 1);
    expect(run.lastReport!.cashFlow!.net).toBe(0);
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
    run.money = 50;
    expect(guideStep(run, null)).toBeNull();
    run.money = 1050;
    run.agents = [];
    expect(guideStep(run, null)).toBeNull();
    run.agents = [{id: 4, tier: 'fast', lane: 'build', carry: 0}];
    expect(expandInfrastructure(run)).toBe(true);
    expect(guideStep(run, null)).toBeNull();
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

// Only perform highlighted actions. Cards vary independently of their value; calls are answered honestly.
function walk(seed: number) {
  const { tech, form, aud } = dealIdea(seed, 0);
  const run = createRun(seed, { tech: tech[0], form: form[0], aud: aud[0] });
  startGuide(run);
  let picked: string | null = null;
  const paid: number[] = [];
  for (let turn = 0; turn < 5000 && !run.over; turn++) {
    const tip = guideStep(run, picked);
    if (tip === 'profitable') {
      expect(run.lastReport!.profitableStreak).toBeGreaterThan(0);
      return { seed, success: true, paid };
    }
    if (tip === 'core' || tip === 'landing' || tip === 'pay') picked = tip;
    else if (tip?.endsWith('-cell')) {
      const cell = freeCells(run)[0];
      expect(place(run, picked!, cell.i, cell.j)).toBe(true);
      picked = null;
    } else if (tip === 'code' || tip === 'post' || tip === 'fix-debt') {
      expect(crunch(run, tip === 'code' ? 'build' : tip === 'post' ? 'promo' : 'fix')).toBe(true);
    } else if (tip === 'assign-promo' || tip === 'park-agent') setLane(run, profitLesson(run).agentId!, tip === 'park-agent' ? 'build' : 'promo');
    else if (tip === 'expand-capacity') expect(expandInfrastructure(run)).toBe(true);
    if (tip) { dismissGuideStep(run, tip); continue; }
    if (run.draft) chooseCard(run, run.draft[(seed + run.sprint) % 3]);
    else if (run.call) answerCall(run, false);
    else if (run.offer !== null) answerOffer(run, 'no');
    else if (run.lastChance !== null) answerLastChance(run, true);
    else if (run.dilemma) answerDilemma(run, dilemmaOf(run)!.options.length - 1);
    else {
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
  expect(wins.length).toBeGreaterThanOrEqual(44);
  expect(wins.filter(w => w.paid[0] < 0).length).toBeGreaterThanOrEqual(24);
}, 60000);
