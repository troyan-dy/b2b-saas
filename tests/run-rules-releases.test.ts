import { describe, expect, it, vi } from 'vitest';
import { PRODUCTION } from '../src/systems/run/product';
import {
  answerDilemma,
  clientsMax,
  refreshRun,
  RULES,
  TUNING,
  type Run,
} from '../src/systems/run/run';
import events from '../src/data/balance/events.json';
import evolution from '../src/data/balance/market-evolution.json';
import { client, product, release, startup } from './run-rules-fixtures';

function choose(run: Run, id: string, option: number, subject = 1): void {
  run.dilemma = { id, client: subject, name: 'Client ' + subject };
  answerDilemma(run, option);
}

describe('decisions between releases', () => {
  it('applies immediate effects once and respects the energy and work boundaries', () => {
    const run = startup();
    const cash = run.money;
    run.debt = 17;
    choose(run, 'refactor', 0);
    expect(run.money).toBe(cash - 400);
    expect(run.debt).toBe(5);
    run.energy = 2;
    choose(run, 'night', 0);
    expect(run.energy).toBe(TUNING.crunch.max);
    choose(run, 'conf', 0);
    expect(run.energy).toBe(0);
    choose(run, 'tests', 0);
    expect(run.events.filter((event) => event.type === 'work')).toHaveLength(0);
    run.mods.push({ kind: 'tokens', left: 1, mult: 2, tag: 'old' });
    choose(run, 'free', 0);
    expect(run.mod.tokens).toBe(1.3);
    expect(run.mods).toEqual([expect.objectContaining({ kind: 'tokens', left: 3, mult: 1.3 })]);
  });

  it('applies an old tariff decision to all customers and removes only those who refuse the price', () => {
    const run = startup();
    const first = client(1),
      second = client(2);
    run.clients = [first, second];
    vi.spyOn(run.rng, 'next').mockReturnValueOnce(0).mockReturnValueOnce(0.9);
    choose(run, 'price', 0);
    expect([first.deal, second.deal]).toEqual([1.15, 1.15]);
    expect(run.clients).toEqual([second]);
    expect(run.stats.left).toBe(1);
    expect(run.events).toContainEqual(expect.objectContaining({ type: 'left', id: 1 }));
  });

  it('keeps targeted decisions tied to the same customer even if they have already left', () => {
    const run = startup();
    run.clients = [client(1), client(2)];
    choose(run, 'haggle', 0, 2);
    expect(run.clients.map((c) => c.deal)).toEqual([1, 0.7]);
    choose(run, 'poach', 2, 2);
    expect(run.clients.map((c) => c.id)).toEqual([1]);
    choose(run, 'haggle', 0, 2);
    choose(run, 'poach', 2, 2);
    expect(run.clients[0].deal).toBe(1);
    expect(run.stats.left).toBe(1);
  });
});

describe('what gets reported at the end of a sprint', () => {
  it.each([
    [[], 'II'],
    [['II'], 'III'],
    [['II', 'III'], 'IV'],
    [['II', 'III', 'IV'], 'V'],
  ] as const)(
    'gives each new branch of a full customer directory a unique name (%j)',
    (suffixes, expected) => {
      const run = startup();
      run.stage = 3;
      product(run, ['core', 'landing', 'bot', 'onb']);
      const names = run.idea.aud.clients;
      const occupied = [...names, ...suffixes.map((suffix) => names[0] + ' ' + suffix)];
      run.clients = occupied.map((name, i) => client(i + 1, { name, want: 'core', happy: true }));
      run.stats.clients = run.clients.length;
      run.nextId = run.clients.length + 1;
      expect(clientsMax(run)).toBeGreaterThan(run.clients.length);
      run.leads = 1;
      vi.spyOn(run.rng, 'pick').mockImplementation((items) => items[0]);
      vi.spyOn(run.rng, 'next').mockReturnValue(0.99);
      release(run, 1);
      expect(run.clients.at(-1)?.name).toBe(names[0] + ' ' + expected);
      expect(new Set(run.clients.map((c) => c.name)).size).toBe(run.clients.length);
    },
  );

  it('keeps requests unchanged when the trend has no new askable module', () => {
    const run = startup();
    run.asks = run.pool.filter((k) => RULES[k].role === 'ask');
    const known = [...run.asks];
    release(run, TUNING.trends.at[0]);
    expect(run.asks).toEqual(known);
  });

  it('counts no new corporate customers in a market without a large-company segment', () => {
    const run = startup();
    run.market.groups = run.market.groups.filter((group) => group.id !== 'large');
    run.stats.corp = 2;
    release(run, 1);
    expect(run.stats.corp).toBe(2);
  });

  it('reports API shipments by category and carries zero profit streak from old reports', () => {
    const run = startup();
    run.apiShipped = ['bot', 'infrastructure', 'bot', 'infrastructure'];
    release(run, 1);
    expect(run.lastReport).toMatchObject({ shipped: ['bot'], projects: ['infrastructure'] });
    expect(run.apiShipped).toEqual([]);
    delete run.lastReport!.profitableStreak;
    release(run, 2);
    expect(run.lastReport).toMatchObject({
      sprint: 2,
      profitableStreak: 0,
      shipped: [],
      projects: [],
    });
  });

  it('loses two sprints of patience in an outage and keeps an unexposed risk active', () => {
    const run = startup();
    run.debt = TUNING.debt.down_at;
    run.clients = [client(1, { patience: 3 })];
    run.risks.push({ p: 0.2, left: 3, n: 2, text: 'Report', say: 'Leaving' });
    vi.spyOn(run.rng, 'next').mockReturnValue(0.9);
    release(run, 1);
    expect(run.downWhy).toBe('debt');
    expect(run.clients[0].patience).toBe(1);
    expect(run.risks[0].left).toBe(2);
    expect(run.events.some((e) => e.type === 'exposed')).toBe(false);
  });

  it.each([false, true])(
    'an empty demo loses an unhappy customer first (all satisfied: %s)',
    (allSatisfied) => {
      const run = startup();
      product(run, ['bot']);
      run.stage = 2;
      run.newsWait = 10;
      run.clients = [client(1, { want: 'bot' }), client(2, { want: allSatisfied ? 'bot' : 'crm' })];
      vi.spyOn(run.rng, 'pick').mockImplementation((items) => items[0]);
      release(run, TUNING.demo.every);
      const lost = allSatisfied ? 1 : 2;
      expect(run.events).toContainEqual({ type: 'demo', ok: false, name: 'Client ' + lost });
      expect(run.clients.map((c) => c.id)).toEqual([allSatisfied ? 2 : 1]);
      expect(run.lastReport?.left).toBe(1);
    },
  );

  it('credits a profitable fully upgraded product for a quiet demo', () => {
    const run = startup();
    run.stage = 3;
    run.newsWait = 10;
    product(run, ['core', 'pay', 'landing', ...run.pool]);
    run.blocks.forEach((b) => {
      b.level = PRODUCTION.max_level;
    });
    refreshRun(run);
    run.clients = [client(1, { want: 'core', pay: 100000 })];
    release(run, TUNING.demo.every);
    expect(run.events).toContainEqual({ type: 'demo', ok: true, name: 'стабильная прибыль' });
  });

  it.each([true, false])(
    'offers another live module when the customer has the final version (alternative: %s)',
    (alternative) => {
      const run = startup();
      product(run, alternative ? ['bot', 'crm'] : ['bot']);
      run.blocks[0].level = PRODUCTION.max_level;
      run.stage = 2;
      run.clients = [client(1)];
      vi.spyOn(run.rng, 'next').mockReturnValue(0);
      release(run, 1);
      expect(run.clients[0]).toMatchObject(
        alternative ? { want: 'crm', wantLevel: 2, happy: false } : { want: 'bot', happy: true },
      );
    },
  );

  it('introduces a toolkit request on the trend release and reports a change in profile share at the quality cap', () => {
    const run = startup();
    const candidates = run.pool.filter((k) => RULES[k].role === 'ask' && !run.asks.includes(k));
    expect(candidates.length).toBeGreaterThan(0);
    for (const group of run.market.groups) {
      for (const profile of group.profiles)
        for (const need of profile.needs) need.level = evolution.shift_level_cap;
    }
    const previous = [...run.asks];
    release(run, TUNING.trends.at[0]);
    expect(run.asks.slice(0, previous.length)).toEqual(previous);
    expect(candidates).toContain(run.asks.at(-1));
    const signal = run.events.find((e) => e.type === 'news' && e.id === 'market-shift');
    expect(signal).toMatchObject({
      text: expect.stringContaining('доля профиля'),
      arg: expect.any(String),
    });
  });

  it('seats a midmarket first account for a known founder and sends surplus leads to the market at full capacity', () => {
    const run = startup(['name']);
    product(run, ['core', 'landing', ...run.asks]);
    run.firstIndustryOrder = false;
    release(run, 1);
    expect(run.clients[0].type).toBe('mid');
    run.clients = Array.from({ length: clientsMax(run) }, (_, i) =>
      client(i + 1, { want: 'core' }),
    );
    run.leads = 4;
    const next = run.nextId;
    release(run, 2);
    expect(run.nextId).toBe(next);
    expect(run.leads).toBe(0);
  });

  it.each(['outage', 'price_up'])(
    'applies the selected news effect to the next sprint: %s',
    (id) => {
      const run = startup();
      run.stage = 2;
      run.mods = [{ kind: 'tokens', mult: 3, left: 3, tag: 'prior' }];
      // Choose the midpoint of this headline's interval among all eligible headlines.
      const pool = events.filter((e) => e.stage <= 2 && e.kind !== 'impatience');
      const index = pool.findIndex((e) => e.id === id);
      const point = pool
        .slice(0, index)
        .reduce((sum, item) => sum + item.weight, pool[index].weight / 2);
      const weight = pool.reduce((sum, item) => sum + item.weight, 0);
      vi.spyOn(run.rng, 'next')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(point / weight)
        .mockReturnValue(0.99);
      release(run, TUNING.news.from_sprint);
      expect(run.events).toContainEqual(expect.objectContaining({ type: 'news', id }));
      if (id === 'outage') expect(run.downWhy).toBe('supplier');
      else
        expect(run.mods).toEqual([
          expect.objectContaining({
            kind: 'tokens',
            mult: pool[index].mult,
            left: pool[index].sprints,
          }),
        ]);
    },
  );
});
