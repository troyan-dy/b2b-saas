import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyMeta, finish, learn, loadMeta, pastPitch, raise, recordResult, restoreResult, saveMeta, TRAITS, traitGives } from '../src/systems/meta/meta';
import { draftCards, releaseCard } from '../src/systems/run/draft';
import { blockEffects } from '../src/systems/run/product';
import { TUNING } from '../src/systems/run/run';
import { agentDebtPerWork, WORKFORCE } from '../src/systems/run/workforce';
import { company } from './system-rules-fixtures';

afterEach(() => vi.unstubAllGlobals());

describe('founder history', () => {
  it('round-trips the founder and safely handles broken or disabled storage', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
    };
    vi.stubGlobal('localStorage', storage);
    expect(loadMeta()).toEqual(emptyMeta());
    const meta = emptyMeta();
    finish(company(), meta);
    expect(saveMeta(meta)).toBe(true);
    expect(loadMeta()).toEqual(meta);
    expect(loadMeta().runs[0].ending).toBe('broke');
    vi.stubGlobal('localStorage', { getItem: () => '{' });
    expect(loadMeta()).toEqual(emptyMeta());
    expect(saveMeta(meta)).toBe(false);
  });

  it('awards the mortgage lesson only to founders who survive the mortgage', () => {
    const run = company();
    run.mortgaged = true;
    run.over = 'profit';
    const meta = emptyMeta();
    expect(learn(run, meta).map(lesson => lesson.id)).toContain('banker');
    run.over = 'broke';
    expect(learn(run, meta).map(lesson => lesson.id)).not.toContain('banker');
  });

  it('keeps historical pitches readable without a restorable card selection', () => {
    const meta = emptyMeta();
    expect(restoreResult(meta)).toBeNull();
    recordResult(company(), meta);
    const past = meta.runs[0];
    past.pitch = 'historical name';
    delete past.idea;
    expect(restoreResult(meta)).toBeNull();
    expect(pastPitch(past)).toBe('historical name');
    past.idea = ['missing', 'missing', 'missing'];
    expect(restoreResult(meta)).toBeNull();
    expect(pastPitch(past)).toBe('historical name');
  });

  it('ignores unknown traits and describes levels in the correct units', () => {
    const meta = emptyMeta();
    raise(meta, 'retired');
    expect(meta.traits).toEqual({});
    const sales = TRAITS.find(t => t.id === 'sales')!;
    const network = TRAITS.find(t => t.id === 'network')!;
    expect(traitGives(sales, 2)).toBe(sales.gives.replace('%s', '30%'));
    expect(traitGives(network, 2)).toBe(network.gives.replace('%s', '$1600'));
  });
});

describe('cards and workforce', () => {
  it('skips retired cards in the draft and cannot grant them at release', () => {
    const run = company();
    expect(draftCards(run)).toEqual([]);
    run.draft = ['removed', 'rest'];
    expect(draftCards(run).map(card => card.id)).toEqual(['rest']);
    const money = run.money;
    releaseCard(run, 'removed');
    expect(run.money).toBe(money);
    expect(run.claimedGrants).toEqual([]);
  });

  it('keeps a maxed strategy unchanged when an old queued card is released', () => {
    const run = company();
    run.cardStacks.mass = TUNING.last_sprint;
    releaseCard(run, 'mass');
    expect(run.cardStacks.mass).toBe(TUNING.last_sprint);
    expect(run.strategy.support).toBeNull();
  });

  it('unknown modules have no effects and the testing perk lowers debt per unit of work', () => {
    expect(blockEffects('retired', 2)).toEqual({});
    const base = company([]);
    const trained = company(['tests']);
    expect(agentDebtPerWork(trained, trained.agents[0])).toBeCloseTo(
      agentDebtPerWork(base, base.agents[0]) * WORKFORCE.tests_debt_mult,
    );
  });
});
