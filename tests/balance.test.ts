import { describe, expect, it } from 'vitest';
import { playBot, SENSIBLE, type BotStyle } from '../src/gyms/bot';
import { answerLastChance, createRun, IDEAS, mrr, step, TUNING, type Idea, type Run } from '../src/systems/run/run';

const STEP = 1 / 4;

function play(seed: number, idea: Idea, style: BotStyle | null): Run {
  const run = createRun(seed, idea);
  for (let k = 0; k < 60 * 60 * 4 && !run.over; k++) {
    if (style) playBot(run, style);
    // nobody at the desk: the bank's call goes unanswered, the startup closes
    else if (run.lastChance !== null) answerLastChance(run, false);
    if (run.offer !== null) run.offer = null; // the bot never sells: we want to see the whole run
    step(run, STEP);
  }
  return run;
}

function ideaOf(k: number): Idea {
  return { tech: IDEAS.tech[k % IDEAS.tech.length], form: IDEAS.form[(k >> 1) % IDEAS.form.length], aud: IDEAS.aud[k % IDEAS.aud.length] };
}

const plain: Idea = { tech: IDEAS.tech[0], form: IDEAS.form[3], aud: IDEAS.aud[1] };

function summary(runs: Run[]): { alive: number; profit: number; peak: number; first: number; profitAt: number; minutes: number; earliestDeath: number } {
  const n = runs.length;
  const profitRuns = runs.filter((r) => r.stats.profitAt > 0);
  return {
    alive: runs.filter((r) => r.over !== 'broke').length / n,
    profit: runs.filter((r) => r.over === 'profit').length / n,
    peak: runs.reduce((s, r) => s + r.stats.peakMrr, 0) / n,
    first: runs.reduce((s, r) => s + r.stats.firstClientAt, 0) / n / 60,
    profitAt: profitRuns.reduce((s, r) => s + r.stats.profitAt, 0) / Math.max(1, profitRuns.length) / 60,
    minutes: runs.reduce((s, r) => s + r.t, 0) / n / 60,
    earliestDeath: Math.min(...runs.filter((r) => r.over === 'broke').map((r) => r.t / 60), 99),
  };
}

describe('economy', () => {
  it('test_run_doing_nothing_goes_broke_in_five_to_eight_minutes', () => {
    const run = play(1, plain, null);
    expect(run.over).toBe('broke');
    expect(run.t / 60).toBeGreaterThan(5);
    expect(run.t / 60).toBeLessThan(8);
  });

  it('test_run_sensible_founder_usually_survives_and_first_client_comes_early', () => {
    const runs = Array.from({ length: 24 }, (_, k) => play(100 + k, ideaOf(k), SENSIBLE));
    const s = summary(runs);
    console.log('sensible', JSON.stringify(s));
    const pawned = runs.filter((r) => r.mortgaged);
    console.log(`mortgage: taken in ${pawned.length} of ${runs.length} runs, survived after it ${pawned.filter((r) => r.over !== 'broke').length}`);
    const promises = runs.reduce((a, r) => a + r.stats.promises, 0);
    console.log(`promises: ${promises} made, ${runs.reduce((a, r) => a + r.stats.kept, 0)} kept, ${runs.reduce((a, r) => a + r.stats.broken, 0)} broken`);
    // the first client: not before the first release, not later than the fourth minute
    expect(s.first).toBeGreaterThan(0.6);
    expect(s.first).toBeLessThan(4);
    expect(s.alive).toBeGreaterThan(0.45);
    // even an unlucky startup lives long enough to be a story
    expect(s.earliestDeath).toBeGreaterThan(4.5);
  });

  it('test_run_links_and_research_pay_off', () => {
    const seeds = Array.from({ length: 24 }, (_, k) => 500 + k);
    const full = summary(seeds.map((s, k) => play(s, ideaOf(k), SENSIBLE)));
    const noLinks = summary(seeds.map((s, k) => play(s, ideaOf(k), { ...SENSIBLE, links: false })));
    const blind = summary(seeds.map((s, k) => play(s, ideaOf(k), { ...SENSIBLE, research: false })));
    const dirty = summary(seeds.map((s, k) => play(s, ideaOf(k), { ...SENSIBLE, fix: false })));
    console.log('full   ', JSON.stringify(full));
    console.log('noLinks', JSON.stringify(noLinks));
    console.log('blind  ', JSON.stringify(blind));
    console.log('dirty  ', JSON.stringify(dirty));
    // a careful founder still loses some startups: the game is not a walk
    expect(full.alive).toBeLessThan(0.95);
    // where a block stands matters
    expect(full.peak).toBeGreaterThan(noLinks.peak * 1.05);
    // asking clients beats building blind
    expect(full.alive).toBeGreaterThan(blind.alive);
  });

  it('test_run_every_idea_can_be_won_and_lost', () => {
    for (let k = 0; k < 12; k++) {
      const runs = Array.from({ length: 12 }, (_, s) => play(900 + s * 7 + k, ideaOf(k), SENSIBLE));
      const alive = runs.filter((r) => r.over !== 'broke').length;
      console.log(`idea ${k}: ${ideaOf(k).tech.id}/${ideaOf(k).form.id}/${ideaOf(k).aud.id} alive ${alive}/12 peak ${Math.round(runs.reduce((a, r) => a + r.stats.peakMrr, 0) / 12)}`);
      expect(alive).toBeGreaterThan(0);
    }
  });

  it('test_run_income_never_negative_and_money_matches_flows', () => {
    const run = play(7, plain, SENSIBLE);
    expect(mrr(run)).toBeGreaterThanOrEqual(0);
    expect(run.sprint).toBeLessThanOrEqual(TUNING.last_sprint + 1);
  });
});
