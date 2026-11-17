import { describe, expect, it } from 'vitest';
import { claimResultTrait, recordResult, restoreResult, collectionLessons, emptyMeta, finish, learn, LESSONS, migrate, pastPitch, raise, traitChoices, traitLevels, TRAITS } from '../src/systems/meta/meta';
import { answerLastChance, chooseCard, createRun, IDEAS, isLive, priceMult, shelf, step, TUNING, type Idea } from '../src/systems/run/run';

const idea: Idea = { tech: IDEAS.tech[0], form: IDEAS.form[3], aud: IDEAS.aud[0] };

function goBroke(seed: number): ReturnType<typeof createRun> {
  const run = createRun(seed, idea);
  run.agents = [];
  while (!run.over) {
    if (run.draft) chooseCard(run, run.draft[0]);
    // the bank calls when the money is gone: this founder keeps the flat
    if (run.lastChance !== null) answerLastChance(run, false);
    step(run, 0.5);
  }
  return run;
}

describe('founder', () => {
  it('restores a final report and grants its reward exactly once across reloads', () => {
    const run = goBroke(12);
    run.stats.value = 90000;
    run.stats.profitAt = 12;
    const meta = emptyMeta();
    recordResult(run, meta);
    let loaded = migrate(JSON.parse(JSON.stringify(meta)));
    recordResult(run, loaded);
    expect(loaded.runs).toHaveLength(1);
    expect(restoreResult(loaded)?.stats.value).toBe(0);
    expect(loaded.runs[0]).toMatchObject({ value: 0, profitAt: 12 });
    const choices = traitChoices(meta, run.seed);
    expect(traitChoices(loaded, run.seed)).toEqual(choices);
    loaded.pending!.stage = 'trait';
    claimResultTrait(loaded, choices[0].id);
    loaded = migrate(JSON.parse(JSON.stringify(loaded)));
    claimResultTrait(loaded, choices[0].id);
    expect(loaded.traits[choices[0].id]).toBe(1);
    expect(loaded.pending?.stage).toBe('claimed');
  });
  it('keeps earned ear and buyers while retiring new ear awards and preserving old rag titles', () => {
    const meta = migrate({ v: 2, runs: [], lessons: ['ear', 'buyers'], traits: {} });
    expect(meta.lessons).toEqual(['ear', 'buyers']);
    expect(collectionLessons(meta).some(lesson => lesson.id === 'ear')).toBe(true);
    expect(collectionLessons(emptyMeta()).some(lesson => lesson.id === 'ear')).toBe(false);
    expect(collectionLessons(emptyMeta()).some(lesson => lesson.id === 'buyers')).toBe(true);
    const run = createRun(1, idea);
    const allButEar = { ...emptyMeta(), lessons: LESSONS.filter(lesson => lesson.id !== 'ear').map(lesson => lesson.id) };
    expect(learn(run, allButEar)).toEqual([]);
    const old = { pitch: 'old text', idea: ['rag', idea.form.id, idea.aud.id] as [string, string, string], ending: 'sold' as const, lived: 900, peakMrr: 100, clients: 5, soldFor: 1000 };
    expect(pastPitch(old)).toContain(IDEAS.tech.find(card => card.id === 'rag')!.adj);
  });
  it('learns profitable operations without requiring the removed timed ending', () => {
    const run = createRun(1, idea);
    run.over = 'sold';
    run.stats.profitAt = 120;
    const meta = emptyMeta();
    meta.lessons = ['cash', 'template'];
    expect(learn(run, meta).map(lesson => lesson.id)).toContain('cheapEarly');
  });
  it('test_meta_broken_record_is_a_founder_with_no_past', () => {
    expect(migrate(null)).toEqual(emptyMeta());
    expect(migrate('x')).toEqual(emptyMeta());
    expect(migrate({ v: 99, runs: [], lessons: [] })).toEqual(emptyMeta());
    expect(migrate({ v: 1, runs: 'no', lessons: [] })).toEqual(emptyMeta());
  });

  it('test_meta_unknown_lessons_are_dropped_known_are_kept', () => {
    const m = migrate({ v: 1, runs: [{ pitch: 'x', ending: 'broke', lived: 10, peakMrr: 0, clients: 0, soldFor: 0 }], lessons: ['posts', 'nonsense'] });
    expect(m.lessons).toEqual(['posts']);
    expect(m.runs).toHaveLength(1);
  });

  it('test_meta_bankruptcy_teaches_at_most_two_lessons_and_never_the_same_twice', () => {
    const meta = emptyMeta();
    const first = finish(goBroke(1), meta);
    // which two — depends on what the news did to the idle startup; the failure itself always teaches «posts»
    expect(first.length).toBeLessThanOrEqual(2);
    expect(first.map((l) => l.id)).toContain('posts');
    expect(meta.runs).toHaveLength(1);
    const second = learn(goBroke(2), meta);
    expect(second.some((l) => first.includes(l))).toBe(false);
  });

  it('test_meta_old_record_keeps_its_past_and_traits_grow_and_double', () => {
    // a record written before traits existed: the startups and lessons stay, the traits start from zero
    const m = migrate({ v: 1, runs: [{ pitch: 'x', ending: 'profit', lived: 900, peakMrr: 5000, clients: 9, soldFor: 0 }], lessons: ['posts'] });
    expect(m.runs).toHaveLength(1);
    expect(m.lessons).toEqual(['posts']);
    expect(m.traits).toEqual({});
    const three = traitChoices(m, 7);
    expect(three).toHaveLength(3);
    raise(m, 'sales');
    raise(m, 'sales');
    expect(migrate(JSON.parse(JSON.stringify(m))).traits).toEqual({ sales: 2 });
    // the bet of a startup doubles one trait for that startup only
    expect(traitLevels(m, 'sales').sales).toBe(4);
    expect(traitLevels(m).sales).toBe(2);
    for (let k = 0; k < 9; k++) raise(m, 'sales');
    expect(m.traits.sales).toBe(TRAITS.find((t) => t.id === 'sales')?.max);
    // a founder who sells better is paid more by the same client
    const plain = createRun(5, idea);
    const seller = createRun(5, idea, [], traitLevels(m));
    expect(priceMult(seller)).toBeGreaterThan(priceMult(plain));
  });
  it('test_meta_lessons_change_the_start_of_the_next_startup', () => {
    const plain = createRun(5, idea);
    const wise = createRun(5, idea, ['template', 'posts', 'ear', 'cash', 'cheapEarly']);
    expect(isLive(plain, 'core')).toBe(false);
    expect(isLive(wise, 'core')).toBe(true);
    expect(wise.leads).toBe(1);
    expect(wise.market.groups.find(group => group.id === 'small')!.profiles.reduce((sum, profile) => sum + profile.leads, 0)).toBeCloseTo(TUNING.lessons.ear_leads);
    expect(wise.money).toBe(TUNING.start_money + 1500);
    expect(shelf(wise)).toContain('cheap');
    expect(shelf(plain)).not.toContain('cheap');
  });
});
