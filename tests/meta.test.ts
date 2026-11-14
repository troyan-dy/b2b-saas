import { describe, expect, it } from 'vitest';
import { emptyMeta, finish, learn, migrate } from '../src/systems/meta/meta';
import { answerLastChance, createRun, IDEAS, isLive, shelf, step, TUNING, type Idea } from '../src/systems/run/run';

const idea: Idea = { tech: IDEAS.tech[0], form: IDEAS.form[3], aud: IDEAS.aud[0] };

function goBroke(seed: number): ReturnType<typeof createRun> {
  const run = createRun(seed, idea);
  while (!run.over) {
    // the bank calls when the money is gone: this founder keeps the flat
    if (run.lastChance !== null) answerLastChance(run, false);
    step(run, 0.5);
  }
  return run;
}

describe('founder', () => {
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

  it('test_meta_lessons_change_the_start_of_the_next_startup', () => {
    const plain = createRun(5, idea);
    const wise = createRun(5, idea, ['template', 'posts', 'ear', 'cash', 'cheapEarly']);
    expect(isLive(plain, 'core')).toBe(false);
    expect(isLive(wise, 'core')).toBe(true);
    expect(wise.leads).toBe(1);
    expect(wise.known).toEqual([wise.asks[0]]);
    expect(wise.money).toBe(TUNING.start_money + 1500);
    expect(shelf(wise)).toContain('cheap');
    expect(shelf(plain)).not.toContain('cheap');
  });
});
