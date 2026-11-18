import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TUNING } from '../src/systems/run/run';
import { loadRun, RUN_SAVE_KEY, saveRun } from '../src/systems/run/save';
import { company } from './system-rules-fixtures';

const store = new Map<string, string>();
type Saved = { v: number; run: Record<string, unknown> };
function read(): Saved {
  return JSON.parse(store.get(RUN_SAVE_KEY)!);
}
function restore(saved: Saved) {
  store.set(RUN_SAVE_KEY, JSON.stringify(saved));
  return loadRun();
}
function restoreWith(fields: Record<string, unknown>) {
  const saved = read();
  Object.assign(saved.run, fields);
  return restore(saved);
}

const core = company().blocks[0];
const buyer = {
  id: 1, type: 'corp', texture: 'tower', name: 'Buyer', want: 'core', wantLevel: 1,
  pay: 200, patience: 2, slot: 0, deal: 1, happy: false, promised: true,
};
const release = {
  sprint: 1, shipped: [], reasons: [], down: false, came: 0, left: 0, closed: 0, mrr: 0, tokens: 0, debt: 0,
};
const promise = { name: buyer.name, block: 'core', level: 1 };
const risk = { left: 1, n: 2, p: 0.5, say: 'outage', text: 'lost service' };
const task = { id: 'task-1', kind: 'infrastructure', status: 'queued', work: 2, done: 0, cost: 100 };

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
  expect(saveRun(company())).toBe(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('save integrity', () => {
  it.each([
    ['negative elapsed time', { t: -1 }],
    ['unknown requested block', { asks: ['missing'] }],
    ['reused next agent id', { nextAgent: 0 }],
    ['unknown review lane', { review: 'retired' }],
    ['negative acquisition offer', { offer: -1 }],
    ['invalid block placeholder', { blocks: [null] }],
    ['invalid customer placeholder', { clients: [null] }],
    ['call without a customer id', { call: { ...buyer, id: 0 } }],
    ['duplicate customers', { clients: [buyer, buyer] }],
    ['duplicate modules', { blocks: [core, { ...core, i: core.i + 1 }] }],
    ['overlapping modules', { blocks: [core, { ...core, kind: 'landing' }] }],
    ['unknown dilemma', { dilemma: { id: 'removed', client: 1, name: 'buyer' } }],
    ['out-of-range risk', { risks: [{ ...risk, p: 1.01 }] }],
    ['invalid price modifier', { mods: [{ kind: 'price', left: 2, mult: -1, tag: 'discount' }] }],
    ['fractional news countdown', { newsWait: 0.1 }],
    ['overlong news history', { recentNews: Array(TUNING.news.no_repeat + 1).fill('headline') }],
    ['invalid report', { lastReport: [] }],
    ['invalid promise refund', { lastReport: { ...release, promises: [{ ...promise, refund: -1 }] } }],
    ['impossible land expansion', { land: 1000 }],
    ['unknown expedited delivery', { apiShipped: ['unknown'] }],
    ['missing infrastructure level', { infrastructure: null }],
    ['invalid strategy state', { strategy: false }],
    ['invalid task collection', { tasks: {} }],
    ['reused task counter', { nextTask: 0 }],
    ['non-boolean API boost', { tasks: [{ ...task, apiBoost: 0 }], nextTask: 2 }],
    ['queued work already done', { tasks: [{ ...task, done: 1 }], nextTask: 2 }],
    ['two active jobs', { tasks: [{ ...task, status: 'active' }, { ...task, status: 'active', id: 'task-2' }], nextTask: 3 }],
    ['building an already live module', { tasks: [{ ...task, kind: 'build', block: 'core', level: 1 }], nextTask: 2 }],
    ['upgrade skipping a level', { tasks: [{ ...task, kind: 'upgrade', block: 'core', level: 3 }], nextTask: 2 }],
    ['retired card project', { tasks: [{ ...task, kind: 'card', card: 'retired' }], nextTask: 2 }],
    ['infrastructure with a module target', { tasks: [{ ...task, block: 'core' }], nextTask: 2 }],
    ['unknown task type', { tasks: [{ ...task, kind: 'retired' }], nextTask: 2 }],
    ['card offered without a prerequisite', { blocks: [], draft: ['mass', 'rest', 'leads'] }],
    ['missing idea', { idea: null }],
  ] as const)('rejects %s', (_reason, fields) => {
    expect(restoreWith(fields)).toBeNull();
  });

  it('preserves unfinished promises, realized refunds, risks and delivered API jobs', () => {
    const promises = [promise, { ...promise, refund: 15 }];
    const copy = restoreWith({ lastReport: { ...release, promises }, risks: [risk], apiShipped: ['infrastructure', 'core'] });
    expect(copy?.lastReport?.promises).toEqual(promises);
    expect(copy?.risks).toEqual([risk]);
    expect(copy?.apiShipped).toEqual(['infrastructure', 'core']);
  });

  it('refuses excessively nested extension data', () => {
    let nested: unknown = null;
    for (let i = 0; i < 34; i++) nested = [nested];
    expect(restoreWith({ extension: nested })).toBeNull();
  });

  it('migrates a company from before desks, queues, strategies and infrastructure existed', () => {
    const saved = read();
    saved.v = 1;
    for (const key of ['tasks', 'desks', 'strategy', 'infrastructure']) delete saved.run[key];
    const copy = restore(saved);
    expect(copy?.tasks).toEqual([]);
    expect(copy?.desks).toBe(0);
    expect(copy?.infrastructure).toBe(0);
    expect(copy?.strategy).toEqual({ support: null, processing: null });
  });

  it('rejects a legacy company with a broken roster before migrating assignments', () => {
    const saved = read();
    saved.v = 2;
    saved.run.agents = null;
    expect(restore(saved)).toBeNull();
  });

  it.each([
    ['revisions beyond the last market shift', { revision: 999 }],
    ['a warning on a nonexistent shift', { warned: [999] }],
  ] as const)('rejects %s', (_reason, change) => {
    expect(restoreWith({ market: { ...company().market, ...change } })).toBeNull();
  });

  it.each([
    ['negative demand', { demand: -1 }],
    ['non-numeric shares', { profiles: [null, ...company().market.groups[0].profiles.slice(1)] }],
  ] as const)('rejects %s', (_reason, change) => {
    const market = company().market;
    Object.assign(market.groups[0], change);
    expect(restoreWith({ market })).toBeNull();
  });

  it.each([
    ['unreachable number of clients', { count: Number.MAX_SAFE_INTEGER }],
    ['extreme price tolerance', { priceComfort: 1e6 }],
    ['repeated requirement', { needs: [{ block: 'core', level: 1 }, { block: 'core', level: 2 }] }],
  ] as const)('rejects %s', (_reason, change) => {
    const market = company().market;
    Object.assign(market.groups[0].profiles[0], change);
    expect(restoreWith({ market })).toBeNull();
  });
});
