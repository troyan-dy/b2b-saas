import { describe, expect, it } from 'vitest';
import { dismissGuideStep, guideStep, startGuide, stopGuide } from '../src/game/startup-guide';
import {
  answerCall, chooseCard, crunch, deferTask, incomePerS, netPerS, place, step, TUNING,
} from '../src/systems/run/run';
import { client, product, release, startup } from './run-rules-fixtures';

describe('first startup guide', () => {
  it('starts only by invitation and stops immediately when skipped', () => {
    const run = startup();
    expect(run).not.toHaveProperty('guide');
    dismissGuideStep(run, 'core');
    expect(guideStep(run, null)).toBeNull();
    startGuide(run);
    expect(guideStep(run, null)).toBe('core');
    dismissGuideStep(run, 'core');
    startGuide(run);
    expect(guideStep(run, null)).toBeNull();
    stopGuide(run);
    expect(guideStep(run, 'core')).toBeNull();
  });

  it('follows actual choices, construction, one manual contribution and any free cell', () => {
    const run = startup();
    startGuide(run);
    expect(guideStep(run, 'core')).toBe('core-cell');
    expect(place(run, 'core', 0, 0)).toBe(true);
    expect(guideStep(run, null)).toBe('code');
    expect(crunch(run)).toBe(true);
    dismissGuideStep(run, 'code');
    expect(crunch(run)).toBe(true);
    dismissGuideStep(run, 'code');
    expect(run.guide!.dismissed).toEqual(['code']);
    expect(guideStep(run, null)).toBe('landing');
    expect(guideStep(run, 'landing')).toBe('landing-cell');
    expect(place(run, 'landing', -1, 0)).toBe(true);
    expect(guideStep(run, null)).toBe('pay');
    expect(guideStep(run, 'pay')).toBe('pay-cell');
    expect(place(run, 'pay', 0, 1)).toBe(true);
    expect(guideStep(run, null)).toBeNull();
  });

  it('lets construction advance when the code tip is acknowledged without helping', () => {
    const run = startup();
    startGuide(run);
    place(run, 'core', 0, 0);
    dismissGuideStep(run, 'code');
    expect(guideStep(run, null)).toBeNull();
    step(run, 1);
    expect(guideStep(run, null)).toBeNull();
    for (let second = 1; second < TUNING.sprint_s && !run.blocks[0].built; second++) step(run, 1);
    expect(guideStep(run, null)).toBe('landing');
  });

  it('does not substitute a different popup until a dismissed action changes', () => {
    const run = startup();
    startGuide(run);
    dismissGuideStep(run, 'core');
    expect(guideStep(run, null)).toBeNull();
    expect(guideStep(run, 'core')).toBe('core-cell');
    dismissGuideStep(run, 'core-cell');
    expect(guideStep(run, 'core')).toBeNull();
    product(run, ['core']);
    dismissGuideStep(run, 'landing');
    expect(guideStep(run, null)).toBeNull();
    expect(guideStep(run, 'landing')).toBe('landing-cell');
    dismissGuideStep(run, 'landing-cell');
    expect(guideStep(run, 'landing')).toBeNull();
    expect(guideStep(run, 'pay')).toBe('pay-cell');
    expect(place(run, 'pay', 0, -1)).toBe(true);
    expect(guideStep(run, null)).toBeNull();
  });

  it('respects an out-of-order placement, an unrelated selection, and a full blueprint', () => {
    const run = startup(['template']);
    startGuide(run);
    expect(guideStep(run, 'pay')).toBe('pay-cell');
    expect(guideStep(run, 'bot')).toBeNull();
    expect(place(run, 'pay', 1, 0)).toBe(true);
    expect(guideStep(run, 'pay')).toBeNull();
    expect(guideStep(run, null)).toBe('landing');
    product(run, ['core', 'pay', 'bot', 'dark', 'wait', 'api']);
    expect(guideStep(run, null)).toBeNull();
    expect(guideStep(run, 'landing')).toBeNull();
  });

  it('lets time run while energy or construction work is unavailable', () => {
    const run = startup();
    startGuide(run);
    place(run, 'core', 0, 0);
    run.energy = 0.9;
    expect(guideStep(run, null)).toBeNull();
    run.energy = 1;
    expect(deferTask(run, run.tasks[0].id)).toBe(true);
    expect(guideStep(run, null)).toBeNull();
  });

  it('coaches the release card over a hidden incoming call, then yields to the visible call', () => {
    const run = startup();
    startGuide(run);
    release(run, 1);
    run.call = client(1);
    expect(guideStep(run, null)).toBe('release');
    dismissGuideStep(run, 'release');
    expect(guideStep(run, null)).toBeNull();
    expect(chooseCard(run, run.draft![2])).toBe(true);
    expect(guideStep(run, null)).toBeNull();
    answerCall(run, false);
    expect(guideStep(run, null)).toBe('core');
    expect(run.guide?.subscription).toBeUndefined();
  });

  it.each([{ offer: 250 }, { lastChance: 100 }, { over: 'broke' }, { dilemma: { id: 'press' } }])(
    'yields to the company decision %j', decision => {
      const run = startup();
      startGuide(run);
      Object.assign(run, decision);
      expect(guideStep(run, null)).toBeNull();
      run.draft = ['credits', 'leads', 'rest'];
      expect(guideStep(run, null)).toBeNull();
    },
  );

  it('keeps the paid release rates across card effects and finishes on acknowledgement', () => {
    const run = startup();
    startGuide(run);
    product(run, ['core', 'landing', 'pay']);
    run.clients = [client(1)];
    release(run, 1);
    expect(run.lastReport?.firstSubscriptions).toBe(true);
    const income = run.lastReport!.mrr / TUNING.sprint_s;
    const net = netPerS(run);
    expect(income).toBeGreaterThan(0);
    expect(run.guide?.subscription).toEqual({ income, net });
    expect(guideStep(run, null)).toBe('subscribed');
    expect(chooseCard(run, run.draft![0])).toBe(true);
    run.call = null;
    expect(guideStep(run, null)).toBe('subscribed');
    run.clients[0].pay *= 2;
    release(run, 2);
    expect(run.lastReport!.mrr / TUNING.sprint_s).not.toBe(income);
    expect(run.guide?.subscription).toEqual({ income, net });
    run.dilemma = null;
    expect(guideStep(run, null)).toBe('subscribed');
    dismissGuideStep(run, 'subscribed');
    expect(guideStep(run, null)).toBeNull();
  });

  it('recognizes a first paying contract signed on the phone between releases', () => {
    const run = startup();
    startGuide(run);
    product(run, ['core', 'landing', 'pay']);
    run.call = client(1);
    answerCall(run, false);
    expect(guideStep(run, null)).toBe('subscribed');
    expect(run.guide?.subscription).toEqual({ income: incomePerS(run), net: netPerS(run) });
    const firstContract = { ...run.guide!.subscription };
    run.clients[0].pay *= 2;
    release(run, 1);
    expect(run.guide?.subscription).toEqual(firstContract);
  });
});
