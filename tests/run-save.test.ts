import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../src/core/rng';
import { segmentRevenueMultiplier } from '../src/systems/run/product';
import {
  createMarket,
  MARKET,
  schedulePrice,
  type MarketState,
} from '../src/systems/company/market';
import {
  chooseCard,
  cancelTask,
  agentSlots,
  expandOffice,
  hire,
  officeQuote,
  upgrade,
  crunch,
  createRun,
  deferTask,
  expandInfrastructure,
  IDEAS,
  isLive,
  mrr,
  place,
  refreshRun,
  RULES,
  step,
  TUNING,
  type Run,
} from '../src/systems/run/run';
import { enqueueTask } from '../src/systems/run/production';
import { clearRunSave, loadRun, RUN_SAVE_KEY, saveRun } from '../src/systems/run/save';

const idea = { tech: IDEAS.tech[0], form: IDEAS.form[3], aud: IDEAS.aud[0] };
const memory = new Map<string, string>();
const storage = {
  getItem: (key: string): string | null => memory.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    memory.set(key, value);
  },
  removeItem: (key: string): void => {
    memory.delete(key);
  },
};

function savedData(): { v: number; rngState: number; run: Record<string, unknown> } {
  return JSON.parse(memory.get(RUN_SAVE_KEY)!);
}

function snapshot(run: Run): unknown {
  return JSON.parse(
    JSON.stringify(run, (key, value: unknown) =>
      ['rng', 'events', 'live', 'eff', 'host', 'linkCount', 'mod'].includes(key)
        ? undefined
        : value,
    ),
  );
}

function advance(run: Run, steps: number): void {
  for (let i = 0; i < steps; i++) {
    if (run.draft) expect(chooseCard(run, run.draft[0])).toBe(true);
    step(run, 0.5);
  }
}

function marketCompany(): Run {
  const run = createRun(71, idea, ['template']);
  run.money = 50_000;
  run.market = createMarket(Object.keys(RULES));
  run.market.opened = true;
  const group = run.market.groups[0];
  group.profiles[0].count = 20;
  group.profiles[0].leads = 4.5;
  group.profiles[0].churnCarry = 0.4;
  group.price = MARKET.price.min + 10 * MARKET.price.step;
  expect(schedulePrice(run.market, group.id, group.price + 5 * MARKET.price.step)).toBe(true);
  return run;
}

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('company save', () => {
  it.each([1, 2])('preserves the old team and bought capacity when migrating schema %s', (version) => {
    const run = createRun(72, idea);
    run.money = 100_000;
    expect(hire(run, 'fast')).toBe(true);
    expect(hire(run, 'fast')).toBe(true);
    run.desks = 2;
    expect(saveRun(run)).toBe(true);
    const saved = savedData();
    saved.v = version;
    // The old office had two free places and two bought places.
    saved.run.desks = 2;
    memory.set(RUN_SAVE_KEY, JSON.stringify(saved));
    const loaded = loadRun()!;
    expect(loaded).not.toBeNull();
    expect(loaded.agents).toEqual(run.agents);
    expect(agentSlots(loaded)).toBe(4);
    expect(loaded.money).toBe(run.money);
    const quote = officeQuote(loaded, 'desks');
    expect(saveRun(loaded)).toBe(true);
    const twice = loadRun()!;
    expect(agentSlots(twice)).toBe(4);
    expect(officeQuote(twice, 'desks')).toBe(quote);
    expect(expandOffice(twice, 'desks')).toBe(true);
    expect(agentSlots(twice)).toBe(5);
  });

  it('restores all twelve agents and purchased places in a new save', () => {
    const run = createRun(72, idea);
    run.money = 4_000_000;
    while (expandOffice(run, 'desks')) { /* buy all available places */ }
    while (hire(run, 'fast')) { /* fill all available places */ }
    expect(agentSlots(run)).toBe(12);
    expect(run.agents).toHaveLength(12);
    expect(saveRun(run)).toBe(true);
    const loaded = loadRun()!;
    expect(loaded).not.toBeNull();
    expect(loaded.agents).toEqual(run.agents);
    expect(loaded.desks).toBe(run.desks);
    expect(loaded.money).toBe(run.money);
    expect(hire(loaded, 'fast')).toBe(false);
  });

  it.each(['queued', 'backlog', 'active', 'ready'] as const)(
    'removes old ordinary task fees in %s state without refunding paid money',
    (status) => {
      const run = createRun(72, idea, ['template']);
      expect(upgrade(run, 'core')).toBe(true);
      expect(place(run, 'landing', 1, 0)).toBe(true);
      expect(expandInfrastructure(run)).toBe(true);
      expect(saveRun(run)).toBe(true);
      const saved = savedData();
      const tasks = saved.run.tasks as Run['tasks'];
      for (const task of tasks.filter((task) => task.kind !== 'infrastructure')) {
        task.cost = 9999;
        task.status = status;
        task.done = status === 'ready' ? task.work : status === 'active' ? 1 : 0;
      }
      // Only one active task is valid in the old queue as well.
      if (status === 'active') {
        tasks[1].status = 'queued';
        tasks[1].done = 0;
      }
      saved.run.money = 20;
      memory.set(RUN_SAVE_KEY, JSON.stringify(saved));
      const loaded = loadRun()!;
      expect(loaded).not.toBeNull();
      expect(loaded.money).toBe(20);
      expect(loaded.tasks.slice(0, 2).map((task) => task.cost)).toEqual([0, 0]);
      expect(loaded.tasks[2].cost).toBe(tasks[2].cost);
      expect(loaded.tasks[0].status).toBe(status);
      expect(loaded.tasks[0].done).toBe(tasks[0].done);
      if (status === 'queued') {
        expect(crunch(loaded)).toBe(true);
        expect(loaded.money).toBe(20);
      }
      if (status === 'backlog') {
        expect(cancelTask(loaded, loaded.tasks[0].id)).toBe(true);
        expect(loaded.money).toBe(20);
      }
      expect(saveRun(loaded)).toBe(true);
      expect(loadRun()!.money).toBe(20);
    },
  );

  it('restores the next random choices after mixed draws, including state zero', () => {
    const rng = createRng(73);
    rng.next();
    rng.int(0, 100);
    rng.pick(['a', 'b', 'c']);
    const restored = createRng(73, rng.state());
    expect(Array.from({ length: 100 }, () => restored.next())).toEqual(
      Array.from({ length: 100 }, () => rng.next()),
    );
    expect(createRng(73, 0).next()).toBe(createRng(0).next());
  });

  it('roundtrips the running company and resumes the same simulation', () => {
    const run = createRun(-913.5, idea, ['template', 'posts'], { engineering: 1 });
    run.money = 500_000;
    expect(place(run, 'landing', 1, 0)).toBe(true);
    expect(place(run, 'pay', 0, 1)).toBe(true);
    advance(run, 180);
    run.events.push({ type: 'down' });
    expect(saveRun(run)).toBe(true);
    const data = savedData();
    expect(data.run.rng).toBeUndefined();
    expect(data.run.events).toBeUndefined();
    expect(data.run.live).toBeUndefined();
    expect(data.run.eff).toBeUndefined();
    expect(data.run.mod).toBeUndefined();
    expect(data.run.host).toBeUndefined();
    const loaded = loadRun()!;
    expect(loaded).not.toBeNull();
    expect(snapshot(loaded)).toEqual(snapshot(run));
    expect(loaded.events).toEqual([]);
    expect(loaded.rng.state()).toBe(run.rng.state());
    expect(isLive(loaded, 'core')).toBe(true);
    expect(loaded.host).toBe(run.host);
    expect(loaded.eff).toEqual(run.eff);
    expect(mrr(loaded)).toBe(mrr(run));
    const stateBefore = run.rng.state();
    advance(run, 200);
    advance(loaded, 200);
    expect(snapshot(loaded)).toEqual(snapshot(run));
    expect(loaded.rng.state()).toBe(run.rng.state());
    expect(loaded.rng.state()).not.toBe(stateBefore);
  });

  it('keeps new plain state, a pending card draft, strategies and queued production', () => {
    const run = marketCompany();
    expect(place(run, 'landing', 1, 0)).toBe(true);
    expect(crunch(run)).toBe(true);
    enqueueTask(run, { kind: 'card', card: 'credits', work: 3, cost: 0 });
    expect(expandInfrastructure(run)).toBe(true);
    expect(deferTask(run, run.tasks[2].id)).toBe(true);
    run.strategy = { support: 'mass', processing: 'instant' };
    run.claimedGrants = ['consulting'];
    run.infrastructure = 2;
    run.draft = ['premium', 'batch', 'leads'];
    run.sprintT = 9.25;
    run.t = 41.25;
    Object.assign(run, { futureField: { generation: 2, values: ['a', 'b'] } });
    refreshRun(run);
    expect(saveRun(run)).toBe(true);
    const loaded = loadRun()!;
    expect(snapshot(loaded)).toEqual(snapshot(run));
    expect(loaded.tasks.map((task) => task.status)).toEqual(['active', 'queued', 'backlog']);
    const before = snapshot(loaded);
    step(loaded, 100);
    expect(snapshot(loaded)).toEqual(before);
    expect(chooseCard(loaded, 'batch')).toBe(true);
    expect(chooseCard(run, 'batch')).toBe(true);
    advance(run, 200);
    advance(loaded, 200);
    expect(snapshot(loaded)).toEqual(snapshot(run));
    expect(loaded.market.groups[0].pendingPrice).toBeNull();
    expect(loaded.market.groups[0].price).toBeCloseTo(MARKET.price.min + 15 * MARKET.price.step);
    expect(loaded.rng.state()).toBe(run.rng.state());
  });

  it('settles an endless save beyond thirty sprints without rerunning a release or losing the company', () => {
    const run = marketCompany();
    run.sprint = 37;
    run.sprintT = 12;
    run.t = 36 * TUNING.sprint_s + 12;
    run.strategy = { support: 'mass', processing: 'instant' };
    run.draft = ['premium', 'batch', 'leads'];
    refreshRun(run);
    expect(saveRun(run)).toBe(true);
    const loaded = loadRun()!;
    expect(loaded).not.toBeNull();
    expect(loaded.over).toBe('late');
    expect(loaded.sprint).toBe(TUNING.last_sprint);
    expect(loaded.draft).toBeNull();
    expect(loaded.money).toBe(run.money);
    expect(loaded.t).toBe(run.t);
    expect(loaded.market).toEqual(run.market);
    expect(loaded.blocks).toEqual(run.blocks);
    expect(loaded.strategy).toEqual(run.strategy);
    expect(loaded.rng.state()).toBe(run.rng.state());
    expect(loaded.events).toEqual([{ type: 'end', ending: 'late' }]);
    const settled = snapshot(loaded);
    step(loaded, 32);
    expect(snapshot(loaded)).toEqual(settled);
    expect(saveRun(loaded)).toBe(false);
  });

  it('rebuilds a legacy missing market and grants history without consuming saved randomness', () => {
    const run = marketCompany();
    expect(saveRun(run)).toBe(true);
    const data = savedData();
    delete data.run.market;
    delete data.run.claimedGrants;
    memory.set(RUN_SAVE_KEY, JSON.stringify(data));
    const loaded = loadRun()!;
    expect(loaded.market).toEqual(createMarket(['core', 'landing', 'pay', ...run.pool]));
    expect(loaded.claimedGrants).toEqual([]);
    expect(loaded.rng.state()).toBe(run.rng.state());
  });

  it('migrates old exclusive modes into one stack and preserves every other saved field', () => {
    const run = marketCompany();
    expect(saveRun(run)).toBe(true);
    const data = savedData();
    delete data.run.cardStacks;
    data.run.strategy = { support: 'mass', processing: 'batch' };
    memory.set(RUN_SAVE_KEY, JSON.stringify(data));
    const loaded = loadRun()!;
    expect(loaded.cardStacks).toEqual({ mass: 1, batch: 1 });
    expect(loaded.money).toBe(run.money);
    expect(loaded.blocks).toEqual(run.blocks);
    expect(loaded.market).toEqual(run.market);
    expect(loaded.tasks).toEqual(run.tasks);
    expect(loaded.rng.state()).toBe(run.rng.state());
    refreshRun(loaded);
    expect(loaded.cardStacks).toEqual({ mass: 1, batch: 1 });
    loaded.draft = ['premium', 'batch', 'maintenance'];
    expect(chooseCard(loaded, 'premium')).toBe(true);
    expect(loaded.cardStacks).toEqual({ mass: 1, batch: 1, premium: 1 });
    expect(saveRun(loaded)).toBe(true);
    expect(snapshot(loadRun()!)).toEqual(snapshot(loaded));
  });

  it('roundtrips all stacked cards and an offered repeat without replaying their effects', () => {
    const run = marketCompany();
    for (let count = 0; count < 5; count++) {
      for (const id of ['mass', 'premium', 'batch', 'instant']) {
        run.draft = [id, 'maintenance', 'rest'];
        expect(chooseCard(run, id)).toBe(true);
      }
    }
    run.draft = ['premium', 'batch', 'maintenance'];
    expect(saveRun(run)).toBe(true);
    const loaded = loadRun()!;
    expect(snapshot(loaded)).toEqual(snapshot(run));
    expect(loaded.eff).toEqual(run.eff);
    expect(loaded.host).toBe(run.host);
    expect(chooseCard(loaded, 'premium')).toBe(true);
    expect(loaded.cardStacks.premium).toBe(6);
    expect(loaded.eff.corp_pay).toBe(run.eff.corp_pay);
    expect(segmentRevenueMultiplier(loaded, 'large') - segmentRevenueMultiplier(run, 'large')).toBeCloseTo(.12);
    expect(loaded.cardStacks.mass).toBe(5);
  });

  it.each([{ mass: -1 }, { batch: 0.5 }, { premium: 31 }, { instant: null }, { money: 1 }])(
    'rejects a malformed stack map %j',
    (cardStacks) => {
      expect(saveRun(marketCompany())).toBe(true);
      const data = savedData();
      data.run.cardStacks = cardStacks;
      memory.set(RUN_SAVE_KEY, JSON.stringify(data));
      expect(loadRun()).toBeNull();
    },
  );

  it('roundtrips starting market leads from ear and buyers before the market opens', () => {
    const run = createRun(110, idea, ['ear', 'buyers']);
    expect(run.market.opened).toBe(false);
    expect(
      run.market.groups
        .find((group) => group.id === 'small')!
        .profiles.reduce((sum, profile) => sum + profile.leads, 0),
    ).toBe(TUNING.lessons.ear_leads);
    expect(
      run.market.groups
        .find((group) => group.id === 'large')!
        .profiles.reduce((sum, profile) => sum + profile.leads, 0),
    ).toBe(TUNING.lessons.buyers_leads);
    expect(saveRun(run)).toBe(true);
    const loaded = loadRun()!;
    expect(snapshot(loaded)).toEqual(snapshot(run));
    expect(loaded.rng.state()).toBe(run.rng.state());
  });

  it('roundtrips an unanswered call with an unseated client and rejects that slot in active clients', () => {
    const run = createRun(0, { ...idea, form: IDEAS.form[0] });
    run.stage = 2;
    run.money = 50_000;
    run.agents = [];
    run.newsWait = 100;
    run.leads = 1;
    run.blocks = ['core', 'landing', 'pay'].map((kind, i) => ({
      kind,
      i,
      j: 0,
      done: 10,
      need: 10,
      built: true,
      live: true,
      level: 1,
      up: false,
      hand: false,
    }));
    refreshRun(run);
    step(run, TUNING.sprint_s);
    run.call = {id: run.nextId++, type: 'corp', name: 'Waiting buyer', texture: IDEAS.corp[0].texture, pay: 100, want: 'core', wantLevel: 1, patience: 5, happy: false, slot: -1, deal: 1, promised: false};
    expect(run.call.slot).toBe(-1);
    expect(saveRun(run)).toBe(true);
    const loaded = loadRun()!;
    expect(snapshot(loaded)).toEqual(snapshot(run));
    expect(loaded.rng.state()).toBe(run.rng.state());
    const damaged = savedData();
    damaged.run.clients = [run.call];
    memory.set(RUN_SAVE_KEY, JSON.stringify(damaged));
    expect(loadRun()).toBeNull();
  });

  it('restores a completed grant project and pays it only on its first release', () => {
    const run = marketCompany();
    run.agents = [];
    enqueueTask(run, { kind: 'card', card: 'credits', work: 3, cost: 0 });
    while (run.tasks[0].status !== 'ready') {
      run.energy = TUNING.crunch.max;
      expect(crunch(run)).toBe(true);
    }
    const money = run.money;
    expect(saveRun(run)).toBe(true);
    const loaded = loadRun()!;
    expect(loaded.money).toBe(money);
    expect(loaded.claimedGrants).toEqual([]);
    step(run, TUNING.sprint_s);
    step(loaded, TUNING.sprint_s);
    expect(snapshot(loaded)).toEqual(snapshot(run));
    expect(loaded.claimedGrants).toEqual(['credits']);
    expect(loaded.tasks).toHaveLength(0);
    expect(loaded.money).toBeGreaterThan(money);
    expect(saveRun(loaded)).toBe(true);
    const twice = loadRun()!;
    expect(twice.money).toBe(loaded.money);
    expect(twice.claimedGrants).toEqual(['credits']);
    advance(loaded, 64);
    advance(twice, 64);
    expect(snapshot(twice)).toEqual(snapshot(loaded));
    expect(twice.claimedGrants.filter((id) => id === 'credits')).toHaveLength(1);
  });

  it('roundtrips cancellation and immediate card effects without resurrecting removed work', () => {
    const run = createRun(73, idea, ['template']);
    run.money = 50_000;
    run.newsWait = 99;
    expect(place(run, 'landing', 1, 0)).toBe(true);
    expect(crunch(run)).toBe(true);
    const constructionCash = run.money;
    expect(cancelTask(run, run.tasks[0].id)).toBe(true);
    expect(run.money).toBe(constructionCash);
    expect(upgrade(run, 'core')).toBe(true);
    while (run.tasks[0].status !== 'ready') {
      run.energy = TUNING.crunch.max;
      expect(crunch(run)).toBe(true);
    }
    const upgradeCash = run.money;
    expect(cancelTask(run, run.tasks[0].id)).toBe(true);
    expect(run.money).toBe(upgradeCash);
    run.draft = ['mass', 'credits', 'leads'];
    expect(chooseCard(run, 'mass')).toBe(true);
    run.draft = ['credits', 'batch', 'leads'];
    expect(chooseCard(run, 'credits')).toBe(true);
    expect(run.tasks).toHaveLength(0);
    expect(saveRun(run)).toBe(true);
    const loaded = loadRun()!;
    expect(loaded).not.toBeNull();
    expect(snapshot(loaded)).toEqual(snapshot(run));
    expect(loaded.claimedGrants).toEqual(['credits']);
    expect(loaded.eff.promo).toBe(1.2);
    expect(loaded.eff.seats).toBe(2);
    expect(loaded.host).toBe(run.host);
    expect(loaded.blocks.map((block) => [block.kind, block.level, block.up])).toEqual([
      ['core', 1, false],
    ]);
    step(run, TUNING.sprint_s);
    step(loaded, TUNING.sprint_s);
    expect(snapshot(loaded)).toEqual(snapshot(run));
    expect(loaded.tasks).toHaveLength(0);
    expect(loaded.blocks).toHaveLength(1);
    expect(loaded.blocks[0].level).toBe(1);
    expect(loaded.claimedGrants).toEqual(['credits']);
    expect(loaded.lastReport?.shipped).toEqual([]);
    expect(saveRun(loaded)).toBe(true);
  });

  it('finishes a previously paid strategy card from an old save without charging again', () => {
    const run = createRun(74, idea, ['template']);
    run.money = 50_000;
    run.newsWait = 99;
    run.agents = [];
    enqueueTask(run, { kind: 'card', card: 'batch', work: 10, cost: 500 });
    expect(crunch(run)).toBe(true);
    expect(run.money).toBe(49_500);
    expect(run.strategy.processing).toBeNull();
    expect(saveRun(run)).toBe(true);
    const loaded = loadRun()!;
    const paidCash = loaded.money;
    while (loaded.tasks[0].status !== 'ready') {
      loaded.energy = TUNING.crunch.max;
      expect(crunch(loaded)).toBe(true);
    }
    expect(loaded.money).toBe(paidCash);
    expect(loaded.strategy.processing).toBeNull();
    step(loaded, TUNING.sprint_s);
    expect(loaded.strategy.processing).toBe('batch');
    expect(loaded.eff.tokens).toBeCloseTo(0.76);
    expect(loaded.tasks).toHaveLength(0);
    expect(saveRun(loaded)).toBe(true);
    expect(loadRun()!.strategy.processing).toBe('batch');
  });

  const badMarkets: [string, (market: MarketState) => void][] = [
    ['missing groups', (market) => Object.assign(market, { groups: null })],
    [
      'missing segment',
      (market) => {
        market.groups.pop();
      },
    ],
    [
      'duplicate segment',
      (market) => {
        market.groups[1].id = market.groups[0].id;
      },
    ],
    ['unknown segment', (market) => Object.assign(market.groups[0], { id: 'missing' })],
    ['invalid opened flag', (market) => Object.assign(market, { opened: 1 })],
    [
      'extra cohort',
      (market) => {
        market.groups[0].profiles.push(market.groups[0].profiles[0]);
      },
    ],
    [
      'duplicate cohort',
      (market) => {
        market.groups[0].profiles[1] = market.groups[0].profiles[0];
      },
    ],
    [
      'invalid share',
      (market) => {
        market.groups[0].profiles[0].share = 200;
      },
    ],
    [
      'empty needs',
      (market) => {
        market.groups[0].profiles[0].needs = [];
      },
    ],
    [
      'unknown block',
      (market) => {
        market.groups[0].profiles[0].needs[0].block = 'missing';
      },
    ],
    [
      'invalid level',
      (market) => {
        market.groups[0].profiles[0].needs[0].level = 0;
      },
    ],
    [
      'invalid link',
      (market) => {
        market.groups[0].profiles[0].connection = ['missing', 'core'];
      },
    ],
    [
      'invalid instant flag',
      (market) => Object.assign(market.groups[0].profiles[0], { instant: 'yes' }),
    ],
    [
      'negative population',
      (market) => {
        market.groups[0].profiles[0].count = -1;
      },
    ],
    [
      'fractional population',
      (market) => {
        market.groups[0].profiles[0].count = 1.5;
      },
    ],
    [
      'NaN population',
      (market) => {
        market.groups[0].profiles[0].count = NaN;
      },
    ],
    [
      'negative leads',
      (market) => {
        market.groups[0].profiles[0].leads = -1;
      },
    ],
    [
      'invalid churn remainder',
      (market) => {
        market.groups[0].profiles[0].churnCarry = 1;
      },
    ],
    [
      'negative arrivals',
      (market) => {
        market.groups[0].came = -1;
      },
    ],
    [
      'fractional departures',
      (market) => {
        market.groups[0].left = 0.5;
      },
    ],
    [
      'tariff below minimum',
      (market) => {
        market.groups[0].price = MARKET.price.min - MARKET.price.step;
      },
    ],
    [
      'tariff above maximum',
      (market) => {
        market.groups[0].price = MARKET.price.max + MARKET.price.step;
      },
    ],
    [
      'tariff outside step',
      (market) => {
        market.groups[0].price += MARKET.price.step / 2;
      },
    ],
    [
      'invalid pending tariff',
      (market) => {
        market.groups[0].pendingPrice = MARKET.price.max + MARKET.price.step;
      },
    ],
  ];

  it.each(badMarkets)('rejects damaged market data with %s', (_name, damage) => {
    const run = marketCompany();
    expect(saveRun(run)).toBe(true);
    const market = structuredClone(run.market);
    damage(market);
    const data = savedData();
    data.run.market = market;
    memory.set(RUN_SAVE_KEY, JSON.stringify(data));
    expect(loadRun() === null).toBe(true);
  });

  it.each(['count', 'pendingPrice'])(
    'rejects a live NaN %s instead of replacing a good market save',
    (field) => {
      const run = marketCompany();
      expect(saveRun(run)).toBe(true);
      const before = memory.get(RUN_SAVE_KEY);
      if (field === 'count') run.market.groups[0].profiles[0].count = NaN;
      else run.market.groups[0].pendingPrice = NaN;
      expect(saveRun(run)).toBe(false);
      expect(memory.get(RUN_SAVE_KEY)).toBe(before);
    },
  );

  it('rejects duplicate queue identities, impossible task progress and repeated cash grants', () => {
    const run = marketCompany();
    enqueueTask(run, { kind: 'card', card: 'credits', work: 3, cost: 0 });
    expect(saveRun(run)).toBe(true);
    const valid = savedData();
    const task = run.tasks[0];
    const corrupt = [
      { tasks: [task, task] },
      { tasks: [task, { ...task, id: 'task-2' }], nextTask: 3 },
      { tasks: [{ ...task, kind: 'build', block: 'landing', card: undefined, level: 1 }] },
      { tasks: [{ ...task, status: 'ready', done: 0 }] },
      { tasks: [{ ...task, done: 0.5 }] },
      { nextTask: 1 },
      { claimedGrants: ['credits'] },
      { claimedGrants: ['consulting', 'consulting'] },
      { claimedGrants: ['missing'] },
      { draft: [] },
      { draft: ['leads', 'leads', 'batch'] },
      { draft: ['credits', 'batch', 'leads'] },
    ];
    for (const change of corrupt) {
      memory.set(RUN_SAVE_KEY, JSON.stringify({ ...valid, run: { ...valid.run, ...change } }));
      expect(loadRun() === null, JSON.stringify(change)).toBe(true);
    }
  });

  it('rejects damaged schemas, invalid IDs and nested values without throwing', () => {
    saveRun(createRun(71, idea));
    const valid = savedData();
    const damaged: unknown[] = [
      null,
      [],
      'bad',
      { v: 99 },
      { v: 1, runs: [], lessons: [] },
      { ...valid, rngState: -1 },
      { ...valid, rngState: 1.5 },
      { ...valid, run: { ...valid.run, sprint: 0 } },
      { ...valid, run: { ...valid.run, money: null } },
      { ...valid, run: { ...valid.run, idea: { tech: 'missing', form: 'x', aud: 'x' } } },
      { ...valid, run: { ...valid.run, clients: [{}] } },
      {
        ...valid,
        run: { ...valid.run, agents: [{ id: 1, lane: 'missing', tier: 'fast', carry: 0 }] },
      },
      { ...valid, run: { ...valid.run, blocks: [{ kind: 'missing' }] } },
      { ...valid, run: { ...valid.run, tasks: [{ id: 1, work: null }] } },
      { ...valid, run: { ...valid.run, draft: [''] } },
      { ...valid, run: { ...valid.run, draft: ['missing'] } },
      {
        ...valid,
        run: {
          ...valid.run,
          tasks: [
            {
              id: 'task-1',
              kind: 'card',
              card: 'missing',
              work: 1,
              done: 0,
              cost: 0,
              status: 'queued',
            },
          ],
        },
      },
      { ...valid, run: { ...valid.run, strategy: { support: 'other', processing: null } } },
      { ...valid, run: { ...valid.run, infrastructure: -1 } },
      { ...valid, run: { ...valid.run, t: TUNING.sprint_s, perks: {} } },
      JSON.parse(JSON.stringify(valid).replace('"traits":{}', '"traits":{"__proto__":{}}')),
    ];
    for (const raw of damaged) {
      memory.set(RUN_SAVE_KEY, JSON.stringify(raw));
      expect(loadRun(), JSON.stringify(raw)).toBeNull();
    }
    memory.set(RUN_SAVE_KEY, '{broken');
    expect(loadRun()).toBeNull();
  });

  it('leaves founder progress and settings untouched when clearing a company', () => {
    storage.setItem('b2b-saas-founder', '{"v":2,"runs":[]}');
    storage.setItem('b2b-saas-settings', '{"sound":false}');
    saveRun(createRun(2, idea));
    clearRunSave();
    expect(loadRun()).toBeNull();
    expect(storage.getItem('b2b-saas-founder')).toBe('{"v":2,"runs":[]}');
    expect(storage.getItem('b2b-saas-settings')).toBe('{"sound":false}');
  });

  it('never restores a completed company or writes one over a live company', () => {
    const run = createRun(7, idea);
    saveRun(run);
    const valid = savedData();
    memory.set(RUN_SAVE_KEY, JSON.stringify({ ...valid, run: { ...valid.run, over: 'sold' } }));
    expect(loadRun()).toBeNull();
    run.over = 'sold';
    expect(saveRun(run)).toBe(false);
    expect(loadRun()).toBeNull();
  });

  it('handles unavailable browser storage without breaking the game', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(loadRun()).toBeNull();
    expect(saveRun(createRun(4, idea))).toBe(false);
    expect(() => clearRunSave()).not.toThrow();
  });
});
