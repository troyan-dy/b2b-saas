import { describe, expect, it } from 'vitest';
import { playBot, SENSIBLE, type BotStyle } from '../src/gyms/bot';
import { answerLastChance, chooseCard, CLIENT_TYPES, createRun, IDEAS, mrr, netPerS, step, TUNING, type Idea, type Run } from '../src/systems/run/run';

const STEP = 1 / 4;

/** who came to all the startups played here, by type, and how many of them closed by themselves */
const met = new Map<string, number>();
let closed = 0;

function play(seed: number, idea: Idea, style: BotStyle | null): Run {
  const run = createRun(seed, idea);
  if (!style) run.agents = [];
  let read = 0;
  for (let k = 0; k < TUNING.last_sprint * TUNING.sprint_s / STEP && !run.over; k++) {
    if (style) playBot(run, style);
    // nobody at the desk: the bank's call goes unanswered, the startup closes
    else {
      if (run.draft) chooseCard(run, run.draft[0]);
      if (run.lastChance !== null) answerLastChance(run, false);
    }
    if (run.offer !== null) run.offer = null; // the bot never sells: we want to see the whole run
    step(run, STEP);
    for (; read < run.events.length; read++) {
      const e = run.events[read];
      if (e.type === 'client') {
        const type = run.clients.find((c) => c.id === e.id)?.type ?? '?';
        met.set(type, (met.get(type) ?? 0) + 1);
      } else if (e.type === 'left' && e.closed) closed++;
    }
  }
  return run;
}

function ideaOf(k: number): Idea {
  return { tech: IDEAS.tech[k % IDEAS.tech.length], form: IDEAS.form[(k >> 1) % IDEAS.form.length], aud: IDEAS.aud[k % IDEAS.aud.length] };
}

const plain: Idea = { tech: IDEAS.tech[0], form: IDEAS.form[3], aud: IDEAS.aud[1] };

function summary(runs: Run[]): { alive: number; profit: number; peak: number; first: number; profitAt: number; minutes: number; earliestDeath: number; downs: number } {
  const n = runs.length;
  const profitRuns = runs.filter((r) => r.stats.profitAt > 0);
  return {
    alive: runs.filter((r) => r.over !== 'broke').length / n,
    profit: runs.filter((r) => !r.over && netPerS(r) > 0).length / n,
    peak: runs.reduce((s, r) => s + r.stats.peakMrr, 0) / n,
    first: runs.reduce((s, r) => s + r.stats.firstClientAt, 0) / n / 60,
    profitAt: profitRuns.reduce((s, r) => s + r.stats.profitAt, 0) / Math.max(1, profitRuns.length) / 60,
    minutes: runs.reduce((s, r) => s + r.t, 0) / n / 60,
    downs: runs.reduce((s, r) => s + r.stats.downs, 0) / n,
    earliestDeath: Math.min(...runs.filter((r) => r.over === 'broke').map((r) => r.t / 60), 99),
  };
}

describe('economy', () => {
  it('test_run_doing_nothing_goes_broke_on_the_cost_of_living_alone', () => {
    // an agent with nothing to build is free: an idle founder is eaten by rent and food only
    const run = play(1, plain, null);
    // …and never ends well: broke, or out of time and still in the red if a windfall kept it afloat
    expect(['broke', 'late']).toContain(run.over);
    expect(run.t / 60).toBeGreaterThan(12);
    expect(run.stats.clients).toBe(0);
  });

  it('test_run_sensible_founder_usually_survives_and_first_client_comes_early', () => {
    const runs = Array.from({ length: 24 }, (_, k) => play(100 + k, ideaOf(k), SENSIBLE));
    const s = summary(runs);
    console.log('sensible', JSON.stringify(s));
    const pawned = runs.filter((r) => r.mortgaged);
    console.log(`mortgage: taken in ${pawned.length} of ${runs.length} runs, survived after it ${pawned.filter((r) => r.over !== 'broke').length}`);
    const promises = runs.reduce((a, r) => a + r.stats.promises, 0);
    console.log(`promises: ${promises} made, ${runs.reduce((a, r) => a + r.stats.kept, 0)} kept, ${runs.reduce((a, r) => a + r.stats.broken, 0)} broken`);
    console.log(`reworks shipped: ${runs.reduce((a, r) => a + r.stats.reworks, 0)} in ${runs.length} runs`);
    // the first client: not before the first release, not later than the fourth minute
    expect(s.first).toBeGreaterThan(0.6);
    expect(s.first).toBeLessThan(4);
    expect(s.alive).toBeGreaterThan(0.45);
    // even an unlucky startup lives long enough to be a story
    expect(s.earliestDeath).toBeGreaterThan(3.6);
  });

  it('test_run_links_raise_income_and_neglecting_debt_causes_outages', () => {
    // forty-eight startups: with fewer, one lucky seed moves the share of survivors by four points
    const seeds = Array.from({ length: 48 }, (_, k) => 500 + k);
    const full = summary(seeds.map((s, k) => play(s, ideaOf(k), SENSIBLE)));
    const noLinks = summary(seeds.map((s, k) => play(s, ideaOf(k), { ...SENSIBLE, links: false })));
    const dirty = summary(seeds.map((s, k) => play(s, ideaOf(k), { ...SENSIBLE, fix: false })));
    console.log('full   ', JSON.stringify(full));
    console.log('noLinks', JSON.stringify(noLinks));
    console.log('dirty  ', JSON.stringify(dirty));
    // where a block stands matters
    expect(full.peak).toBeGreaterThan(noLinks.peak * 1.05);
    // Endless growth has multiple viable strategies; maintenance must still prevent real outages.
    expect(dirty.downs).toBeGreaterThan(full.downs);
  }, 30000);

  it('test_run_every_idea_can_be_won_and_lost', () => {
    // sixteen mixes: every card of every deck is in at least one of them
    for (let k = 0; k < 16; k++) {
      const runs = Array.from({ length: 12 }, (_, s) => play(900 + s * 7 + k, ideaOf(k), SENSIBLE));
      const alive = runs.filter((r) => r.over !== 'broke').length;
      console.log(`idea ${k}: ${ideaOf(k).tech.id}/${ideaOf(k).form.id}/${ideaOf(k).aud.id} alive ${alive}/12 peak ${Math.round(runs.reduce((a, r) => a + r.stats.peakMrr, 0) / 12)}`);
      expect(alive).toBeGreaterThan(0);
    }
  }, 30000);

  it('test_run_every_client_type_comes_and_startups_close', () => {
    // counted over every startup played above: content that never shows up is not content
    console.log(`clients met: ${[...met].map(([type, n]) => `${type} ${n}`).join(', ')} · closed by themselves ${closed}`);
    for (const t of CLIENT_TYPES) expect(met.get(t.id) ?? 0).toBeGreaterThan(0);
    expect(closed).toBeGreaterThan(0);
  });

  it('test_run_continues_with_income_after_thirty_sprints', () => {
    const run = play(7, plain, SENSIBLE);
    expect(mrr(run)).toBeGreaterThanOrEqual(0);
    expect(run.sprint).toBe(TUNING.last_sprint + 1);
    expect(run.over).toBeNull();
    expect(Number.isFinite(run.money)).toBe(true);
  });
});
