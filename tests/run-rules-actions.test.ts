import { describe, expect, it, vi } from 'vitest';
import {
  answerCall,
  answerLastChance,
  answerOffer,
  clientsMax,
  createRun,
  demolish,
  fire,
  firstIndustryOrder,
  finishAtSprintLimit,
  fulfillClient,
  haggleChance,
  honestMult,
  linkBonus,
  logos,
  mortgageSeconds,
  netPerS,
  place,
  promiseSprints,
  reworks,
  setLane,
  sites,
  step,
  TUNING,
  upgrade,
  valuation,
} from '../src/systems/run/run';
import { client, product, shipped, startup } from './run-rules-fixtures';

describe('founder choices and contracts', () => {
  it('applies the saved lessons to exactly the affected contract terms', () => {
    const run = startup(['arch', 'word', 'no', 'banker']);
    expect(linkBonus(run)).toBeCloseTo(TUNING.link_bonus + TUNING.lessons.arch_link_bonus);
    expect(promiseSprints(run)).toBe(TUNING.call.sure_patience_perk);
    expect(honestMult(run)).toBe(TUNING.call.honest_mult_perk);
    expect(mortgageSeconds(run)).toBe(TUNING.mortgage_s_perk);
    expect(mortgageSeconds(startup())).toBe(TUNING.mortgage_s);
  });

  it('can start an unlisted industry without a special commission', () => {
    const idea = startup().idea;
    const run = createRun(6, { ...idea, aud: { ...idea.aud, id: 'independent' } });
    expect(firstIndustryOrder(run)).toBeUndefined();
    run.firstIndustryOrder = true;
    expect(firstIndustryOrder(run)).toBeUndefined();
  });

  it('lists only build sites still receptive to work', () => {
    const run = startup();
    run.blocks = [
      shipped('core', { built: false }),
      shipped('landing', { built: false, queued: true }),
      shipped('pay'),
      shipped('bot', { up: true }),
      shipped('crm', { up: true, done: 3 }),
    ];
    expect(sites(run).map((b) => b.kind)).toEqual(['core', 'crm']);
  });

  it('rewards a promised last-minute hand delivery only when the requested version is live', () => {
    const run = startup();
    const c = client(1, { promised: true, patience: 1, wantLevel: 2 });
    run.blocks = [shipped('bot', { hand: true })];
    fulfillClient(run, c);
    expect(c).toMatchObject({ happy: false, promised: true, deal: 1 });
    run.blocks[0].level = 2;
    fulfillClient(run, c);
    fulfillClient(run, c);
    expect(c).toMatchObject({ happy: true, promised: false, deal: TUNING.hero.deal });
    expect(run.stats).toMatchObject({ kept: 1, heroes: 1 });
    expect(run.leads).toBe(TUNING.hero.leads);
    expect(run.events).toEqual([
      { type: 'kept', id: 1 },
      { type: 'hero', id: 1 },
    ]);
    const automated = client(2, { promised: true, patience: 1, wantLevel: 2 });
    run.blocks[0].hand = false;
    fulfillClient(run, automated);
    expect(automated.deal).toBe(TUNING.rework.pay_mult);
    expect(run.stats.heroes).toBe(1);
  });

  it('groups outstanding requests and omits versions already satisfied or in production', () => {
    const run = startup();
    run.blocks = [
      shipped('bot'),
      shipped('crm', { live: false }),
      shipped('sso', { up: true }),
      shipped('dash'),
      shipped('onb', { level: 2 }),
    ];
    upgrade(run, 'dash');
    run.clients = [
      client(1, { happy: true }),
      client(2),
      ...['missing', 'crm', 'sso', 'dash', 'onb', 'bot', 'bot'].map((want, i) =>
        client(i + 3, { want, wantLevel: 2 }),
      ),
    ];
    expect(reworks(run)).toEqual([{ kind: 'bot', level: 2, who: ['Client 8', 'Client 9'] }]);
  });

  it('removes a live optional module and reopens just the contracts that relied on it', () => {
    const run = startup();
    product(run, ['core', 'bot', 'onb']);
    run.clients = [
      client(1, { happy: true, wantLevel: 2 }),
      client(2),
      client(3, { happy: true, want: 'core' }),
    ];
    const waiting = { ...run.clients[1] };
    expect(demolish(run, 'missing')).toBe(false);
    expect(demolish(run, 'core')).toBe(false);
    const bot = run.blocks[1];
    bot.live = false;
    expect(demolish(run, 'bot')).toBe(false);
    bot.live = true;
    bot.up = true;
    expect(demolish(run, 'bot')).toBe(false);
    bot.up = false;
    expect(upgrade(run, 'onb')).toBe(true);
    expect(demolish(run, 'onb')).toBe(false);
    expect(demolish(run, 'bot')).toBe(true);
    expect(run.live.has('bot')).toBe(false);
    expect(run.clients[0]).toMatchObject({ happy: false, wantLevel: 1, patience: 3 });
    expect(run.clients[1]).toEqual(waiting);
    expect(run.clients[2].happy).toBe(true);
    expect(run.events.at(-1)).toEqual({ type: 'razed', kind: 'bot' });
  });

  it('ignores a missing worker, and firing removes only the chosen worker', () => {
    const run = startup();
    run.agents.push({ ...run.agents[0], id: 2 });
    setLane(run, 3, 'promo');
    expect(run.agents.map((a) => a.lane)).toEqual(['build', 'build']);
    fire(run, 1);
    expect(run.agents.map((a) => a.id)).toEqual([2]);
    run.over = 'sold';
    fire(run, 2);
    expect(run.agents).toHaveLength(1);
  });

  it.each(['no', 'sell', 'haggle-lost', 'haggle-won'] as const)(
    'settles the bid once: %s',
    (choice) => {
      const run = startup();
      product(run, ['core', 'pay']);
      run.clients.push(client(1, { pay: 750 }));
      run.offer = 500;
      const worth = valuation(run);
      const chance = haggleChance(run);
      expect(chance).toBe(TUNING.valuation.haggle_clean);
      vi.spyOn(run.rng, 'next').mockReturnValue(choice === 'haggle-won' ? chance - 0.001 : chance);
      answerOffer(run, choice.startsWith('haggle') ? 'haggle' : choice === 'no' ? 'no' : 'sell');
      expect(run.offer).toBeNull();
      const sold = choice === 'sell' || choice === 'haggle-won';
      expect(run.over).toBe(sold ? 'sold' : null);
      expect(run.stats.soldFor).toBe(choice === 'sell' ? 500 : choice === 'haggle-won' ? worth : 0);
      const events = [...run.events];
      answerOffer(run, 'sell');
      expect(run.events).toEqual(events);
      run.debt = 1e4;
      expect(haggleChance(run)).toBe(TUNING.valuation.haggle_min);
    },
  );

  it('handles a promise met during a call and drops a call after the last seat fills', () => {
    const run = startup();
    product(run, ['bot']);
    expect(logos(run)).toBe(0);
    run.call = client(1);
    answerCall(run, true);
    expect(run.clients[0]).toMatchObject({ happy: true, promised: false });
    expect(run.stats).toMatchObject({ promises: 1, kept: 1 });
    const limit = clientsMax(run);
    run.clients = Array.from({ length: limit }, (_, i) => client(i + 1));
    run.call = client(100);
    answerCall(run, true);
    expect(run.clients).toHaveLength(limit);
    expect(run.call).toBeNull();
    expect(run.stats.promises).toBe(1);
  });

  it.each([true, false])(
    'offers a mortgage once and freezes the clock until the answer %s',
    (accept) => {
      const run = startup();
      run.money = 0;
      const expected = Math.ceil((-netPerS(run) * mortgageSeconds(run)) / 10) * 10;
      step(run, 0);
      expect(run.lastChance).toBe(expected);
      step(run, 4);
      expect(run.t).toBe(0);
      answerLastChance(run, accept);
      expect(run.lastChance).toBeNull();
      expect(run.money).toBe(accept ? expected : 0);
      expect(run.mortgaged).toBe(accept);
      if (accept) {
        run.money = 0;
        step(run, 0);
      }
      answerLastChance(run, true);
      expect(run.over).toBe('broke');
      expect(run.events.filter((e) => e.type === 'end')).toHaveLength(1);
    },
  );

  it('allows a solvent company with zero cash to keep trading', () => {
    const run = startup();
    product(run, ['pay', 'core']);
    run.clients = [client(1, { pay: 5000 })];
    run.money = 0;
    expect(netPerS(run)).toBeGreaterThan(0);
    step(run, 0);
    expect(run.lastChance).toBeNull();
    expect(run.over).toBeNull();
    step(run, 1);
    expect(run.money).toBeGreaterThan(0);
  });

  it('charges no extra debt when an agent finishes the last task mid-step', () => {
    const run = startup();
    place(run, 'core', 0, 0);
    run.tasks[0].work = 1;
    run.agents[0].carry = 2;
    step(run, 0);
    expect(run.events.filter((e) => e.type === 'work')).toEqual([
      { type: 'work', agent: 1, lane: 'build', i: 0, j: 0 },
      { type: 'work', agent: 1, lane: 'build', idle: true },
    ]);
    expect(run.debt).toBeGreaterThan(0);
  });

  it('settles a legacy run past its final sprint only once', () => {
    const run = startup();
    finishAtSprintLimit(run);
    expect(run.over).toBeNull();
    run.sprint = TUNING.last_sprint + 1;
    step(run, 0);
    finishAtSprintLimit(run);
    expect(run.sprint).toBe(TUNING.last_sprint);
    expect(run.events.filter((e) => e.type === 'end')).toEqual([{ type: 'end', ending: 'late' }]);
  });
});
