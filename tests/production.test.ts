import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../src/content/blocks';
import {
  blockEffects,
  PRODUCTION,
  segmentRevenueMultiplier,
  STRATEGY_IDS,
  upgradeWork,
} from '../src/systems/run/product';
import { dealDraft, DRAFT_CARDS, releaseCard } from '../src/systems/run/draft';
import { enqueueTask } from '../src/systems/run/production';
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
  cancelTask,
  freeCells,
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
  leadsPerWork,
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
  tokens,
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
  it('grants cash immediately once without creating or charging a production task', () => {
    for (const id of ['consulting', 'credits']) {
      const run = fresh();
      const initialMoney = run.money,
        nextTask = run.nextTask;
      select(run, id);
      const grant = DRAFT_CARDS.find((card) => card.id === id)!;
      expect(run.money).toBe(initialMoney + grant.money!);
      expect(run.claimedGrants).toEqual([id]);
      expect(run.tasks).toHaveLength(0);
      expect(run.nextTask).toBe(nextTask);
      expect(run.events.at(-1)).toEqual({ type: 'card-applied', id });
      dealDraft(run);
      expect(run.draft).not.toContain(id);
      run.draft = [id, 'leads', 'maintenance'];
      expect(chooseCard(run, id)).toBe(false);
      releaseCard(run, id);
      expect(run.money).toBe(initialMoney + grant.money!);
      expect(run.claimedGrants).toEqual([id]);
    }
  });

  it('keeps legacy cash projects pending until release and never pays them twice', () => {
    for (const id of ['consulting', 'credits']) {
      const run = fresh();
      const initialMoney = run.money;
      const task = enqueueTask(run, { kind: 'card', card: id, work: 6, cost: 0 });
      dealDraft(run);
      expect(run.draft).not.toContain(id);
      run.draft = [id, 'leads', 'maintenance'];
      expect(chooseCard(run, id)).toBe(false);
      run.draft = null;
      expect(deferTask(run, task.id)).toBe(true);
      dealDraft(run);
      expect(run.draft).not.toContain(id);
      run.draft = null;
      resumeTask(run, task.id);
      finishWork(run);
      expect(run.money).toBe(initialMoney);
      expect(run.claimedGrants).toEqual([]);
      release(run);
      const grant = DRAFT_CARDS.find((card) => card.id === id)!;
      const expected = initialMoney + grant.money! - TUNING.living_per_s * TUNING.sprint_s;
      expect(run.money).toBeCloseTo(expected);
      expect(run.claimedGrants).toEqual([id]);
      releaseCard(run, id);
      expect(run.money).toBeCloseTo(expected);
      expect(run.tasks).toHaveLength(0);
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
    }
    expect(run.blocks).toHaveLength(0);
    expect(run.tasks).toHaveLength(0);
  });

  it('reserves an affordable operation in every draft even with no cash and available projects', () => {
    for (const claimedGrants of [[], ['consulting', 'credits']]) {
      const run = fresh(['core']);
      run.claimedGrants = claimedGrants;
      run.money = 0;
      for (let sprint = 1; sprint <= 10; sprint++) {
        run.sprint = sprint;
        dealDraft(run);
        const cards = draftCards(run);
        expect(cards).toHaveLength(3);
        expect(new Set(cards.map((card) => card.id)).size).toBe(3);
        expect(cards.filter((card) => card.slot !== 'operation').length).toBeLessThanOrEqual(2);
        expect(cards.some((card) => card.slot === 'operation' && card.cost <= run.money)).toBe(
          true,
        );
      }
    }
  });

  it('applies maintenance, rest and leads immediately without advancing time or exceeding caps', () => {
    const run = fresh();
    const money = run.money,
      nextTask = run.nextTask;
    run.debt = 18;
    select(run, 'maintenance');
    expect(run.debt).toBe(8);
    select(run, 'maintenance');
    expect(run.debt).toBe(0);
    run.energy = 1;
    select(run, 'rest');
    expect(run.energy).toBe(5);
    run.energy = 7;
    select(run, 'rest');
    expect(run.energy).toBe(TUNING.crunch.max);
    const leads = run.leads;
    select(run, 'leads');
    expect(run.leads).toBe(leads + 4);
    expect(run.t).toBe(0);
    expect(run.money).toBe(money);
    expect(run.nextTask).toBe(nextTask);
    expect(run.tasks).toHaveLength(0);
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

  it('ships five levels with increasing work and no project fee and refuses a sixth', () => {
    const run = fresh(['core']);
    let previousWork = 0;
    for (let level = 1; level < 5; level++) {
      run.draft = null;
      expect(upgrade(run, 'core')).toBe(true);
      const task = run.tasks[0];
      expect(task.work).toBe(upgradeWork(workNeed(run, 'core'), level));
      expect(task.work).toBeGreaterThan(previousWork);
      expect(task.cost).toBe(0);
      previousWork = task.work;
      finishWork(run);
      expect(run.blocks[0].level).toBe(level);
      release(run);
      expect(run.blocks[0].level).toBe(level + 1);
    }
    run.draft = null;
    expect(PRODUCTION.max_level).toBe(5);
    expect(upgrade(run, 'core')).toBe(false);
    expect(run.eff.tokens).toBeCloseTo(0.8);
  });

  it('makes late upgrade gains smaller while keeping seats and patience whole', () => {
    const core = [1, 2, 3, 4, 5].map((level) => blockEffects('core', level).tokens);
    expect(core[1] - core[2]).toBeGreaterThan(core[2] - core[3]);
    expect(core[2] - core[3]).toBeGreaterThan(core[3] - core[4]);
    expect(upgradeWork(10, 3)).toBe(60);
    expect(upgradeWork(10, 4)).toBe(160);
    for (const kind of Object.keys(RULES)) {
      const effects = blockEffects(kind, 5);
      if (effects.tokens !== undefined) expect(effects.tokens).toBeGreaterThan(0);
      if (effects.seats !== undefined) expect(Number.isInteger(effects.seats)).toBe(true);
      if (effects.patience !== undefined) expect(Number.isInteger(effects.patience)).toBe(true);
    }
  });

  it('ships the prioritized upper upgrade when a late company cannot finish both before release', () => {
    for (const first of ['core', 'pay']) {
      // Reproduce a normal bot company, not a player save or a cash-funded fixture.
      const run = createRun(3200, { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] });
      for (let tick = 0; tick < TUNING.last_sprint * TUNING.sprint_s * 4 && !run.over; tick++) {
        playBot(run);
        run.offer = null;
        if (run.sprint === 24 && run.sprintT === 0) break;
        step(run, 0.25);
      }
      expect(run.sprint).toBe(24);
      expect(run.sprintT).toBe(0);
      expect(run.draft).toBeNull();
      for (const task of [...run.tasks]) expect(cancelTask(run, task.id)).toBe(true);
      for (const agent of run.agents) setLane(run, agent.id, agent.tier === 'fast' ? 'fix' : 'build');
      setReview(run, 'build');
      const cash = run.money;
      for (const kind of ['core', 'pay']) {
        expect(run.blocks.find(block => block.kind === kind)?.level).toBe(4);
        expect(upgrade(run, kind)).toBe(true);
      }
      expect(run.money).toBe(cash);
      expect(run.tasks.every(task => task.cost === 0)).toBe(true);
      const budget = remainingBuildCapacity(run);
      expect(run.tasks.every(task => task.work <= budget)).toBe(true);
      expect(run.tasks.reduce((sum, task) => sum + task.work, 0)).toBeGreaterThan(budget);
      if (first === 'pay') expect(moveTask(run, run.tasks[1].id, -1)).toBe(true);
      expect(blockEffects('core', 5).tokens).toBeLessThan(blockEffects('core', 4).tokens);
      expect(blockEffects('pay', 5).small_pay).toBeGreaterThan(blockEffects('pay', 4).small_pay);
      for (let tick = 0; tick < TUNING.sprint_s * 4 - 1; tick++) step(run, 0.25);
      expect(run.tasks.find(task => task.block === first)?.status).toBe('ready');
      expect(run.blocks.filter(block => ['core', 'pay'].includes(block.kind)).every(block => block.level === 4)).toBe(true);
      step(run, 0.25);
      const second = first === 'core' ? 'pay' : 'core';
      expect(run.lastReport?.sprint).toBe(24);
      expect(run.lastReport?.shipped).toEqual([first]);
      expect(run.blocks.find(block => block.kind === first)?.level).toBe(PRODUCTION.max_level);
      expect(run.blocks.find(block => block.kind === second)?.level).toBe(4);
      expect(run.tasks.find(task => task.block === second)?.status).toBe('active');
    }
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
    cancelTask(run, run.tasks[0].id);
    expect(chooseCard(run, 'absent')).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
    expect(chooseCard(run, 'consulting')).toBe(true);
    expect(run.draft).toBeNull();
  });

  it('always offers three distinct usable cards even when all strategy projects are planned', () => {
    const run = fresh(['core']);
    for (const id of STRATEGY_IDS)
      enqueueTask(run, { kind: 'card', card: id, work: 12, cost: 600 });
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

  it('stacks all four card effects immediately without replacing cards or queued buildings', () => {
    const run = fresh(['core']);
    place(run, 'landing', 0, 1);
    crunch(run);
    const queued = queueView(run);
    const money = run.money,
      nextTask = run.nextTask;
    const host = run.host;
    expect(DRAFT_CARDS.every((card) => card.cost === 0 && card.work === 0)).toBe(true);
    select(run, 'mass');
    expect(run.strategy.support).toBe('mass');
    expect(run.eff.promo).toBe(1.2);
    expect(run.eff.seats).toBe(2);
    expect(run.host).toBeCloseTo(host + 1);
    select(run, 'batch');
    expect(run.eff.tokens).toBeCloseTo(0.76);
    select(run, 'premium');
    expect(run.strategy).toEqual({ support: 'premium', processing: 'batch' });
    expect(run.eff.promo).toBe(1.2);
    expect(segmentRevenueMultiplier(run, 'large')).toBeCloseTo(1.12);
    expect(run.host).toBeCloseTo(host + 3);
    select(run, 'instant');
    expect(run.strategy).toEqual({ support: 'premium', processing: 'instant' });
    expect(run.eff.tokens).toBeCloseTo(0.836);
    expect(run.eff.patience).toBe(1);
    expect(run.eff.promo).toBeCloseTo(1.44);
    expect(run.cardStacks).toEqual({ mass: 1, premium: 1, batch: 1, instant: 1 });
    expect(run.host).toBeCloseTo(host + 4.5);
    expect(run.money).toBe(money);
    expect(run.nextTask).toBe(nextTask);
    expect(queueView(run)).toEqual(queued);
    expect(run.t).toBe(0);
    expect(run.events.filter((event) => event.type === 'card-applied')).toHaveLength(4);
  });

  it('gives every catalog block a growing independent effect and restores derived effects', () => {
    const run = fresh(['core', 'bot']);
    expect(Object.keys(RULES).sort()).toEqual(BLOCKS.map((block) => block.id).sort());
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

  it('keeps stacked gains through releases and never removes buildings', () => {
    const run = fresh(['core', 'landing', 'pay']);
    run.market.groups[0].profiles[0].count = 20;
    const blocks = run.blocks.map((block) => ({ ...block }));
    const initialTokens = tokens(run),
      initialLeads = leadsPerWork(run);
    select(run, 'mass');
    select(run, 'batch');
    expect(tokens(run)).toBeCloseTo(initialTokens * 0.8);
    expect(leadsPerWork(run)).toBeCloseTo(initialLeads * 1.2);
    for (let sprint = 0; sprint < 2; sprint++) {
      release(run);
      expect(run.strategy).toEqual({ support: 'mass', processing: 'batch' });
      select(run, 'maintenance');
    }
    const batchTokens = tokens(run);
    select(run, 'instant');
    expect(run.strategy).toEqual({ support: 'mass', processing: 'instant' });
    expect(tokens(run)).toBeCloseTo(batchTokens * 1.1);
    expect(leadsPerWork(run)).toBeCloseTo(initialLeads * 1.44);
    expect(run.cardStacks).toEqual({ mass: 1, batch: 1, instant: 1 });
    expect(run.blocks).toEqual(blocks);
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

  it('starts ordinary building and upgrades without cash and keeps their work requirement', () => {
    for (const upgrading of [false, true]) {
      const run = fresh(upgrading ? ['core'] : []);
      run.money = 0;
      if (upgrading) upgrade(run, 'core');
      else place(run, 'core', 0, 0);
      expect(run.tasks[0].cost).toBe(0);
      const work = run.tasks[0].work;
      expect(work).toBeGreaterThan(1);
      expect(crunch(run)).toBe(true);
      expect(run.tasks[0].status).toBe('active');
      expect(run.tasks[0].done).toBe(1);
      expect(run.money).toBe(0);
    }
  });

  it('still pays working agents, living costs and hosting during a free upgrade', () => {
    const run = fresh(['core', 'landing', 'pay']);
    expect(upgrade(run, 'pay')).toBe(true);
    const before = run.money;
    const hosting = run.host;
    expect(hosting).toBeGreaterThan(0);
    step(run, 1);
    expect(run.money).toBeCloseTo(before - TUNING.living_per_s - hosting - TUNING.tiers.fast.cost_per_s);
    expect(run.tasks[0].cost).toBe(0);
    expect(run.tasks[0].status).toBe('active');
  });

  it('keeps an unaffordable infrastructure order ahead of free work until reordered', () => {
    const run = fresh(['core']);
    run.money = 1;
    expandInfrastructure(run);
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

    const reordered = fresh(['core']);
    reordered.money = 1;
    expandInfrastructure(reordered);
    upgrade(reordered, 'core');
    expect(moveTask(reordered, reordered.tasks[1].id, -1)).toBe(true);
    expect(crunch(reordered)).toBe(true);
    expect(activeWork(reordered)?.kind).toBe('upgrade');
    expect(reordered.money).toBe(1);
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

  it('ships final work before judging profit at sprint thirty and then freezes the company', () => {
    const run = fresh(['core', 'landing', 'pay']);
    run.stage = 3;
    run.sprint = TUNING.last_sprint;
    run.t = (TUNING.last_sprint - 1) * TUNING.sprint_s;
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
    expect(expandInfrastructure(run)).toBe(true);
    finishWork(run);
    // A delayed frame must not charge for time beyond the final release.
    step(run, TUNING.sprint_s + 10);
    expect(run.infrastructure).toBe(1);
    expect(run.sprint).toBe(30);
    expect(run.t).toBe(TUNING.last_sprint * TUNING.sprint_s);
    expect(run.lastReport?.sprint).toBe(30);
    expect(run.lastReport?.projects).toContain('infrastructure');
    expect(run.over).toBe('profit');
    expect(run.draft).toBeNull();
    expect(run.offer).toBeNull();
    const ended = JSON.stringify(run);
    step(run, 100);
    expect(expandInfrastructure(run)).toBe(false);
    expect(chooseCard(run, 'credits')).toBe(false);
    expect(JSON.stringify(run)).toBe(ended);
    expect(run.events.filter((event) => event.type === 'end')).toHaveLength(1);
  });

  it('ends an unprofitable company at the deadline even with cash still in the bank', () => {
    const run = fresh();
    run.sprint = TUNING.last_sprint;
    release(run);
    expect(run.money).toBeGreaterThan(0);
    expect(run.over).toBe('late');
    expect(run.draft).toBeNull();
  });

  it('cancels every unshipped building state, releases its cell and never refunds spent cash', () => {
    for (const status of ['queued', 'backlog', 'active', 'ready'] as const) {
      const run = fresh();
      const before = run.money;
      place(run, 'core', 0, 0);
      const task = run.tasks[0];
      if (status === 'backlog') deferTask(run, task.id);
      if (status === 'active') crunch(run);
      if (status === 'ready') finishWork(run);
      expect(task.status).toBe(status);
      const spent = status === 'active' || status === 'ready' ? task.cost : 0;
      expect(run.money).toBe(before - spent);
      expect(cancelTask(run, task.id)).toBe(true);
      expect(run.money).toBe(before - spent);
      expect(run.tasks).toHaveLength(0);
      expect(run.blocks).toHaveLength(0);
      expect(freeCells(run)).toContainEqual({ i: 0, j: 0 });
      expect(run.events.at(-1)).toEqual({ type: 'task-cancelled', id: task.id, block: 'core' });
      release(run);
      expect(run.live.has('core')).toBe(false);
      expect(run.lastReport?.shipped).toEqual([]);
    }
  });

  it('cancels upgrades without changing the live level or releasing a finished upgrade later', () => {
    for (const status of ['queued', 'backlog', 'active', 'ready'] as const) {
      const run = fresh(['core']);
      const original = { ...run.blocks[0] };
      upgrade(run, 'core');
      const task = run.tasks[0];
      if (status === 'backlog') deferTask(run, task.id);
      if (status === 'active') crunch(run);
      if (status === 'ready') finishWork(run);
      expect(task.status).toBe(status);
      const money = run.money;
      expect(cancelTask(run, task.id)).toBe(true);
      expect(run.money).toBe(money);
      expect(run.blocks[0].level).toBe(original.level);
      expect(run.blocks[0].live).toBe(true);
      expect(run.blocks[0].built).toBe(true);
      expect(run.blocks[0].up).toBe(false);
      expect(run.blocks[0].done).toBe(run.blocks[0].need);
      if (status === 'queued' || status === 'backlog') expect(run.blocks[0]).toEqual(original);
      release(run);
      expect(run.blocks[0].level).toBe(original.level);
      expect(run.eff.tokens).toBeCloseTo(0.95);
      expect(run.lastReport?.shipped).toEqual([]);
      expect(run.stats.reworks).toBe(0);
    }
  });

  it('cancels ready legacy cards and infrastructure without releasing their effects', () => {
    for (const kind of ['card', 'infrastructure'] as const) {
      const run = fresh(['core']);
      if (kind === 'card') enqueueTask(run, { kind, card: 'batch', work: 10, cost: 500 });
      else expandInfrastructure(run);
      finishWork(run);
      const money = run.money;
      expect(cancelTask(run, run.tasks[0].id)).toBe(true);
      expect(run.money).toBe(money);
      release(run);
      expect(run.tasks).toHaveLength(0);
      expect(run.infrastructure).toBe(0);
      expect(run.strategy.processing).toBeNull();
      expect(run.lastReport?.projects).toEqual([]);
    }
  });

  it('rejects cancellation after the run ends and for missing tasks', () => {
    const run = fresh();
    place(run, 'core', 0, 0);
    expect(cancelTask(run, 'missing')).toBe(false);
    run.over = 'broke';
    const before = JSON.stringify(run);
    expect(cancelTask(run, run.tasks[0].id)).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
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
