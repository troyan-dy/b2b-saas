import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../src/core/rng';
import {
  createRun,
  IDEAS,
  isLive,
  mrr,
  place,
  step,
  TUNING,
  type Run,
} from '../src/systems/run/run';
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

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('company save', () => {
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
    for (let i = 0; i < 180; i++) step(run, 0.5);
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
    for (let i = 0; i < 200; i++) {
      step(run, 0.5);
      step(loaded, 0.5);
    }
    expect(snapshot(loaded)).toEqual(snapshot(run));
    expect(loaded.rng.state()).toBe(run.rng.state());
  });

  it('keeps new plain state, a pending card draft, strategies and queued production', () => {
    const run = createRun(71, idea);
    const extra = {
      draft: ['premium', 'batch', 'leads'],
      strategy: { support: 'premium', processing: 'batch' },
      infrastructure: 2,
      tasks: [
        {
          id: 'task-1',
          kind: 'build',
          block: 'landing',
          level: 2,
          work: 20,
          done: 8,
          cost: 30,
          status: 'active',
        },
        {
          id: 'task-2',
          kind: 'card',
          card: 'mass',
          work: 12,
          done: 0,
          cost: 600,
          status: 'queued',
        },
        { id: 'task-3', kind: 'infrastructure', work: 25, done: 0, cost: 1000, status: 'backlog' },
      ],
      nextTask: 4,
      market: { phase: 'growth', wait: 7 },
    };
    Object.assign(run, extra);
    expect(saveRun(run)).toBe(true);
    expect(loadRun()).toMatchObject(extra);
    expect(loadRun()!.sprintT).toBe(run.sprintT);
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
