import { describe, expect, it } from 'vitest';
import { blockEffects } from '../src/systems/run/product';
import { dealDraft, DRAFT_CARDS, releaseCard } from '../src/systems/run/draft';
import { playBot } from '../src/gyms/bot';
import {
  activeWork,
  answerCall,
  answerDilemma,
  answerLastChance,
  answerOffer,
  blockEffectText,
  buildCapacity,
  chooseCard,
  createRun,
  crunch,
  deferTask,
  demolish,
  draftCards,
  expandInfrastructure,
  fire,
  hire,
  IDEAS,
  isSite,
  moveTask,
  place,
  queueView,
  refreshRun,
  remainingBuildCapacity,
  resumeTask,
  RULES,
  setLane,
  setReview,
  step,
  TUNING,
  upgrade,
  workNeed,
  type Run,
} from '../src/systems/run/run';

function fresh(kinds: string[] = []): Run {
  const run = createRun(7, { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] });
  run.money = 50000;
  run.newsWait = 99;
  run.blocks = kinds.map((kind, i) => ({
    kind,
    i,
    j: 0,
    done: workNeed(run, kind),
    need: workNeed(run, kind),
    built: true,
    live: true,
    level: 1,
    up: false,
    hand: false,
  }));
  refreshRun(run);
  return run;
}

function finishWork(run: Run): void {
  const task = activeWork(run) ?? run.tasks.find((entry) => entry.status === 'queued');
  if (!task) throw new Error('No queued work');
  const remaining = task.work - task.done;
  for (let i = 0; i < remaining; i++) {
    run.energy = TUNING.crunch.max;
    expect(crunch(run)).toBe(true);
  }
  run.debt = 0;
}

function release(run: Run): void {
  run.agents = [];
  step(run, TUNING.sprint_s - run.sprintT);
}

function select(run: Run, id: string): void {
  run.draft = [id, 'consulting', 'credits'].filter((value, i, list) => list.indexOf(value) === i);
  expect(chooseCard(run, id)).toBe(true);
}

describe('production queue and sprint choices', () => {
  it('offers each cash grant once, excludes queued grants and pays only at release', () => {
    for (const id of ['consulting', 'credits']) {
      const run = fresh();
      const initialMoney = run.money;
      select(run, id);
      expect(run.money).toBe(initialMoney);
      expect(run.claimedGrants).toEqual([]);
      dealDraft(run);
      expect(run.draft).not.toContain(id);
      run.draft = null;
      expect(deferTask(run, run.tasks[0].id)).toBe(true);
      dealDraft(run);
      expect(run.draft).not.toContain(id);
      run.draft = null;
      expect(resumeTask(run, run.tasks[0].id)).toBe(true);
      finishWork(run);
      expect(run.money).toBe(initialMoney);
      expect(run.claimedGrants).toEqual([]);
      release(run);
      const grant = DRAFT_CARDS.find((card) => card.id === id)!;
      expect(run.money).toBeCloseTo(
        initialMoney + grant.money! - TUNING.living_per_s * TUNING.sprint_s,
      );
      expect(run.claimedGrants).toEqual([id]);
      expect(run.draft).not.toContain(id);
      const paidMoney = run.money;
      releaseCard(run, id);
      expect(run.money).toBe(paidMoney);
      expect(run.claimedGrants).toEqual([id]);
      run.draft = [id, 'leads', 'maintenance'];
      expect(chooseCard(run, id)).toBe(false);
    }
  });

  it('keeps three non-cash fallback choices without a core after both grants are exhausted', () => {
    const run = fresh();
    run.claimedGrants = ['consulting', 'credits'];
    for (let i = 0; i < 6; i++) {
      release(run);
      expect([...run.draft!].sort()).toEqual(['leads', 'maintenance', 'rest']);
      const id = run.draft![0];
      expect(chooseCard(run, id)).toBe(true);
      const task = run.tasks.at(-1)!;
      if (task.status === 'queued') deferTask(run, task.id);
    }
    expect(run.blocks).toHaveLength(0);
    expect(run.tasks.length).toBe(6);
  });

  it('applies non-cash maintenance and rest effects only at release and caps restored energy', () => {
    const run = fresh();
    select(run, 'maintenance');
    finishWork(run);
    run.debt = 18;
    run.sprintT = TUNING.sprint_s - 0.1;
    expect(run.tasks[0].status).toBe('ready');
    expect(run.debt).toBe(18);
    release(run);
    expect(run.debt).toBe(8);
    select(run, 'rest');
    finishWork(run);
    run.energy = 1;
    run.sprintT = TUNING.sprint_s - 0.1;
    release(run);
    expect(run.energy).toBeCloseTo(5 + 0.1 / TUNING.crunch.regen_s);
    select(run, 'rest');
    finishWork(run);
    run.energy = 7;
    run.sprintT = TUNING.sprint_s - 0.1;
    release(run);
    expect(run.energy).toBe(TUNING.crunch.max);
  });

  it('reserves manual cells, reorders only unstarted work and charges exactly once', () => {
    const run = fresh();
    expect(place(run, 'core', 0, 0)).toBe(true);
    expect(place(run, 'landing', 1, 0)).toBe(true);
    expect(place(run, 'pay', 1, 0)).toBe(false);
    expect(run.blocks.every((block) => !isSite(block))).toBe(true);
    const [core, landing] = queueView(run);
    expect(moveTask(run, landing.id, -1)).toBe(true);
    expect(deferTask(run, landing.id)).toBe(true);
    const cash = run.money;
    expect(crunch(run)).toBe(true);
    expect(run.money).toBe(cash - core.cost);
    expect(activeWork(run)?.block).toBe('core');
    expect(deferTask(run, core.id)).toBe(false);
    expect(moveTask(run, core.id, 1)).toBe(false);
    expect(resumeTask(run, landing.id)).toBe(true);
    crunch(run);
    expect(run.money).toBe(cash - core.cost);
    expect(queueView(run)[0].done).toBe(2);
  });

  it('routes manual, agent and dilemma work into the same ordered target', () => {
    const run = fresh();
    place(run, 'core', 0, 0);
    place(run, 'landing', 1, 0);
    moveTask(run, run.tasks[1].id, -1);
    crunch(run);
    run.dilemma = { id: 'tests', client: 0, name: '' };
    answerDilemma(run, 0);
    expect(activeWork(run)?.done).toBe(6);
    for (let i = 0; i < 16; i++) step(run, 0.25);
    expect(run.tasks.find((task) => task.block === 'landing')?.done).toBeGreaterThan(6);
    expect(run.tasks.find((task) => task.block === 'core')?.done).toBe(0);
    expect(run.tasks.filter((task) => task.status === 'active')).toHaveLength(1);
  });

  it('keeps completed upgrades at the previous level until release', () => {
    const run = fresh(['core']);
    expect(upgrade(run, 'core')).toBe(true);
    expect(upgrade(run, 'core')).toBe(false);
    finishWork(run);
    expect(run.tasks[0].status).toBe('ready');
    expect(run.blocks[0].level).toBe(1);
    expect(run.eff.tokens).toBeCloseTo(0.95);
    release(run);
    expect(run.blocks[0].level).toBe(2);
    expect(run.eff.tokens).toBeCloseTo(0.9);
    expect(run.tasks).toHaveLength(0);
    expect(run.lastReport?.shipped).toContain('core');
    expect(draftCards(run)).toHaveLength(3);
  });

  it('freezes time and every gameplay intent while the saved draft awaits a choice', () => {
    const run = fresh(['core']);
    place(run, 'landing', 1, 0);
    place(run, 'pay', 0, 1);
    run.draft = ['mass', 'batch', 'consulting'];
    run.offer = 1000;
    run.lastChance = 300;
    run.dilemma = { id: 'tests', client: 0, name: '' };
    const before = JSON.stringify(run);
    step(run, 1000);
    place(run, 'wait', 1, 1);
    upgrade(run, 'core');
    demolish(run, 'landing');
    crunch(run);
    setLane(run, 1, 'fix');
    setReview(run, 'fix');
    hire(run, 'fast');
    fire(run, 1);
    answerOffer(run, 'sell');
    answerCall(run, true);
    answerLastChance(run, true);
    answerDilemma(run, 0);
    expandInfrastructure(run);
    moveTask(run, run.tasks[1].id, -1);
    deferTask(run, run.tasks[0].id);
    resumeTask(run, run.tasks[0].id);
    expect(chooseCard(run, 'absent')).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
    expect(chooseCard(run, 'consulting')).toBe(true);
    expect(run.draft).toBeNull();
  });

  it('always offers three distinct usable cards even when all strategy projects are planned', () => {
    const run = fresh(['core']);
    for (const id of ['mass', 'premium', 'batch', 'instant']) select(run, id);
    run.agents = [];
    for (let sprint = 0; sprint < 8; sprint++) {
      release(run);
      const cards = draftCards(run);
      expect(cards).toHaveLength(3);
      expect(new Set(cards.map((card) => card.id)).size).toBe(3);
      expect(cards.every((card) => card.slot === 'operation')).toBe(true);
      const draft = [...run.draft!];
      draftCards(run);
      refreshRun(run);
      expect(run.draft).toEqual(draft);
      expect(chooseCard(run, cards[0].id)).toBe(true);
    }
  });

  it('activates strategy projects only at release and replaces each slot independently', () => {
    const run = fresh(['core']);
    select(run, 'mass');
    finishWork(run);
    expect(run.strategy.support).toBeNull();
    release(run);
    expect(run.strategy.support).toBe('mass');
    expect(run.eff.promo).toBe(2);
    select(run, 'batch');
    finishWork(run);
    release(run);
    expect(run.eff.tokens).toBeCloseTo(0.475);
    select(run, 'premium');
    finishWork(run);
    release(run);
    expect(run.strategy).toEqual({ support: 'premium', processing: 'batch' });
    expect(run.eff.promo).toBe(1);
    expect(run.eff.corp_pay).toBe(2);
    select(run, 'instant');
    finishWork(run);
    release(run);
    expect(run.strategy).toEqual({ support: 'premium', processing: 'instant' });
    expect(run.eff.tokens).toBeCloseTo(1.14);
  });

  it('gives all twenty blocks a growing independent effect and restores derived effects', () => {
    const run = fresh(['core', 'bot']);
    expect(Object.keys(RULES)).toHaveLength(20);
    for (const kind of Object.keys(RULES)) {
      expect(Object.keys(blockEffects(kind, 1)).length).toBeGreaterThan(0);
      expect(blockEffects(kind, 2)).not.toEqual(blockEffects(kind, 1));
      expect(blockEffectText(run, kind, 2).length).toBeGreaterThan(0);
    }
    upgrade(run, 'bot');
    finishWork(run);
    release(run);
    expect(run.eff.seats).toBe(4);
    expect(run.eff.patience).toBe(2);
    run.eff.seats = 999;
    run.host = 999;
    run.mods = [{ kind: 'tokens', mult: 0.7, left: 2, tag: 'test' }];
    refreshRun(run);
    expect(run.eff.seats).toBe(4);
    expect(run.host).toBeCloseTo(2.25);
    expect(run.mod.tokens).toBe(0.7);
  });

  it('reports full and remaining work budgets with review, debt and individual carry', () => {
    const run = fresh();
    expect(buildCapacity(run)).toBe(10);
    run.sprintT = 16;
    run.agents[0].carry = 0.75;
    expect(remainingBuildCapacity(run)).toBe(5);
    setReview(run, 'fix');
    expect(buildCapacity(run)).toBe(8);
    run.debt = 50;
    expect(buildCapacity(run)).toBe(3);
    setLane(run, 1, 'fix');
    expect(buildCapacity(run)).toBe(0);
  });

  it('waits for money without charging or working, then starts the same queued task', () => {
    const run = fresh(['core']);
    run.money = 1;
    upgrade(run, 'core');
    expect(crunch(run)).toBe(false);
    expect(run.tasks[0].status).toBe('queued');
    expect(run.tasks[0].done).toBe(0);
    expect(run.money).toBe(1);
    run.money = 1000;
    const cost = run.tasks[0].cost;
    crunch(run);
    expect(run.money).toBe(1000 - cost);
    expect(run.tasks[0].status).toBe('active');
  });

  it('makes infrastructure repeatable with increasing cost and work only after release', () => {
    const run = fresh(['core']);
    expect(expandInfrastructure(run)).toBe(true);
    expect(expandInfrastructure(run)).toBe(false);
    const first = queueView(run)[0];
    finishWork(run);
    expect(run.infrastructure).toBe(0);
    release(run);
    expect(run.infrastructure).toBe(1);
    select(run, 'credits');
    expect(expandInfrastructure(run)).toBe(true);
    const second = run.tasks.find((task) => task.kind === 'infrastructure')!;
    expect(second.cost).toBeGreaterThan(first.cost);
    expect(second.work).toBeGreaterThan(first.work);
  });

  it('keeps running and receiving offers after sprint thirty and accepts a profitable mature demo', () => {
    const run = fresh(['core', 'landing', 'pay']);
    run.stage = 3;
    run.sprint = 32;
    run.clients = [
      {
        id: 1,
        texture: 'clinic',
        name: 'Client',
        type: 'corp',
        pay: 5000,
        want: 'core',
        wantLevel: 1,
        patience: 3,
        happy: true,
        slot: 0,
        deal: 1,
        promised: false,
      },
    ];
    release(run);
    expect(run.sprint).toBe(33);
    expect(run.over).toBeNull();
    expect(run.offer).not.toBeNull();
    select(run, 'credits');
    deferTask(run, run.tasks[0].id);
    run.sprint = 36;
    release(run);
    expect(run.over).toBeNull();
    expect(run.events.some((event) => event.type === 'demo' && event.ok)).toBe(true);
  });

  it('lets the bot answer drafts and keep producing through multiple releases', () => {
    const run = fresh();
    for (let n = 0; n < 32 * 4 * 5 && !run.over; n++) {
      playBot(run);
      step(run, 0.25);
    }
    expect(run.sprint).toBeGreaterThanOrEqual(6);
    expect(run.stats.shipped).toBeGreaterThanOrEqual(3);
    expect(run.strategy.support || run.strategy.processing).not.toBeNull();
  });
});
