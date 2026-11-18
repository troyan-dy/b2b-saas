import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimResultTrait, emptyMeta, loadMeta, traitChoices } from '../src/systems/meta/meta';
import {
  completeCompanyResult,
  finishCompany,
  recoverCompanyResult,
} from '../src/systems/run/result-storage';
import { createRun, IDEAS, TUNING } from '../src/systems/run/run';
import { loadRun, RUN_SAVE_KEY, saveRun } from '../src/systems/run/save';

const founder = 'b2b-saas-founder';
const idea = { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] };
const memory = new Map<string, string>();
const storage = {
  getItem: vi.fn((key: string) => memory.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    memory.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    memory.delete(key);
  }),
};

function denied(): never {
  throw new Error('Storage access denied');
}

function oldCheckpoint(): string {
  const run = createRun(42, idea);
  run.sprint = TUNING.last_sprint + 1;
  run.t = TUNING.last_sprint * TUNING.sprint_s;
  expect(saveRun(run)).toBe(true);
  return memory.get(RUN_SAVE_KEY)!;
}

beforeEach(() => {
  memory.clear();
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => vi.unstubAllGlobals());

describe('company result and reward persistence', () => {
  it('saves the regular ending, resumes its reward after a reload, and retires the matching checkpoint', () => {
    const run = createRun(42, idea);
    expect(saveRun(run)).toBe(true);
    const meta = emptyMeta();
    expect(recoverCompanyResult(meta, loadRun())).toBeNull();
    run.over = 'sold';
    const result = finishCompany(run, meta, true);
    expect(result.over).toBe('sold');
    expect(loadMeta().pending?.stage).toBe('report');
    const resumed = loadMeta();
    expect(recoverCompanyResult(resumed, loadRun())).toEqual(result);
    resumed.pending!.stage = 'trait';
    const trait = traitChoices(resumed, run.seed)[0];
    claimResultTrait(resumed, trait.id);
    expect(completeCompanyResult(result, resumed, true)).toBe(true);
    expect(loadRun()).toBeNull();
    expect(loadMeta()).toMatchObject({ runs: [{ ending: 'sold' }], traits: { [trait.id]: 1 } });
    expect(loadMeta().pending).toBeUndefined();
    expect(recoverCompanyResult(loadMeta(), loadRun())).toBeNull();
  });

  it('retains an overdue save byte for byte when writes fail but deletion would succeed', () => {
    const previous = oldCheckpoint();
    const meta = loadMeta();
    storage.setItem.mockImplementationOnce(denied);
    const result = recoverCompanyResult(meta, loadRun())!;
    expect(result.over).toBe('late');
    expect(loadMeta()).toEqual(emptyMeta());
    storage.setItem.mockImplementationOnce(denied);
    expect(completeCompanyResult(result, meta, true)).toBe(false);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(memory.get(RUN_SAVE_KEY)).toBe(previous);
    // A fresh page can reconstruct the same ending from the only surviving copy.
    const restored = loadMeta();
    const again = recoverCompanyResult(restored, loadRun())!;
    expect(again).toEqual(result);
    expect(recoverCompanyResult(restored, loadRun())).toEqual(result);
    expect(completeCompanyResult(again, restored, true)).toBe(true);
    expect(loadMeta().runs).toHaveLength(1);
    expect(loadMeta().lessons).toEqual(meta.lessons);
    expect(memory.has(RUN_SAVE_KEY)).toBe(false);
  });

  it('persists the chosen reward before attempting cleanup and never grants it twice on retry', () => {
    const previous = oldCheckpoint();
    const meta = loadMeta();
    const result = recoverCompanyResult(meta, loadRun())!;
    meta.pending!.stage = 'trait';
    const trait = traitChoices(meta, result.seed)[0];
    claimResultTrait(meta, trait.id);
    storage.removeItem.mockImplementationOnce(denied);
    expect(completeCompanyResult(result, meta, true)).toBe(false);
    expect(memory.get(RUN_SAVE_KEY)).toBe(previous);
    const restored = loadMeta();
    const again = recoverCompanyResult(restored, loadRun())!;
    expect(restored.pending?.stage).toBe('claimed');
    claimResultTrait(restored, trait.id);
    expect(completeCompanyResult(again, restored, true)).toBe(true);
    expect(loadMeta().traits[trait.id]).toBe(1);
    expect(loadMeta().runs).toHaveLength(1);
  });

  it('keeps the durable pending report when the last write fails after the old save is gone', () => {
    oldCheckpoint();
    const meta = loadMeta();
    const result = recoverCompanyResult(meta, loadRun())!;
    storage.setItem
      .mockImplementationOnce((key, value) => {
        memory.set(key, value);
      })
      .mockImplementationOnce(denied);
    expect(completeCompanyResult(result, meta, true)).toBe(false);
    expect(memory.has(RUN_SAVE_KEY)).toBe(false);
    expect(meta.pending?.run.seed).toBe(result.seed);
    const restored = loadMeta();
    expect(recoverCompanyResult(restored, null)).toEqual(result);
    expect(completeCompanyResult(result, restored, true)).toBe(true);
    expect(loadMeta().runs).toHaveLength(1);
  });

  it('does not interpret an unreadable checkpoint as a successful cleanup', () => {
    oldCheckpoint();
    const meta = loadMeta();
    const result = recoverCompanyResult(meta, loadRun())!;
    storage.getItem.mockImplementationOnce(denied);
    expect(completeCompanyResult(result, meta, true)).toBe(false);
    expect(memory.has(RUN_SAVE_KEY)).toBe(true);
    expect(loadMeta().pending?.run.seed).toBe(result.seed);
    expect(completeCompanyResult(result, meta, true)).toBe(true);
  });

  it.each([
    { seed: 999, idea },
    { seed: 42, idea: { ...idea, aud: IDEAS.aud[1] } },
  ])('leaves the checkpoint of another company intact', (other) => {
    oldCheckpoint();
    const meta = loadMeta();
    const result = recoverCompanyResult(meta, loadRun())!;
    expect(saveRun(createRun(other.seed, other.idea))).toBe(true);
    const active = memory.get(RUN_SAVE_KEY);
    expect(completeCompanyResult(result, meta, true)).toBe(true);
    expect(memory.get(RUN_SAVE_KEY)).toBe(active);
    expect(loadRun()?.over).toBeNull();
    expect(loadMeta().runs).toHaveLength(1);
  });

  it('finishes a practice company in memory without altering either storage record', () => {
    const previous = oldCheckpoint();
    memory.set(founder, JSON.stringify(emptyMeta()));
    const meta = loadMeta();
    const run = createRun(13, idea);
    run.over = 'broke';
    const result = finishCompany(run, meta, false);
    expect(result.over).toBe('broke');
    expect(completeCompanyResult(result, meta, false)).toBe(true);
    expect(meta.runs).toHaveLength(1);
    expect(meta.pending).toBeUndefined();
    expect(loadMeta()).toEqual(emptyMeta());
    expect(memory.get(RUN_SAVE_KEY)).toBe(previous);
  });
});
