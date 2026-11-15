import lessonsEn from '../../data/balance/lessons.en.json';
import lessonsData from '../../data/balance/lessons.json';
import traitsEn from '../../data/balance/traits.en.json';
import traitsData from '../../data/balance/traits.json';
import { L, worded } from '../../core/lang';
import { createRng } from '../../core/rng';
import { IDEAS, pitch, type Ending, type Run } from '../run/run';

/**
 * The founder between startups: the same developer goes from run to run and keeps what was learned —
 * lessons (one-off skills given by what happened) and traits (levels that grow with every startup).
 * Pure logic plus one record in the browser's storage.
 */

export interface Past {
  /** the three words as they were said when the startup ended */
  pitch: string;
  /** the ids of its three cards: the résumé says the words again in the language of today; old records have none */
  idea?: [string, string, string];
  ending: Ending;
  /** seconds the startup lived */
  lived: number;
  peakMrr: number;
  clients: number;
  soldFor: number;
  /** what the company was valued at when it ended; records made before valuations have none */
  value?: number;
}

export interface Meta {
  v: number;
  runs: Past[];
  /** ids of the lessons learned so far */
  lessons: string[];
  /** levels of the founder's traits, by id */
  traits: Record<string, number>;
}

export interface Lesson {
  id: string;
  when: string;
  title: string;
  text: string;
  gives: string;
}

/** A trait of the founder: every level adds `per_level` of what it gives. */
export interface Trait {
  id: string;
  title: string;
  note: string;
  /** what it gives, with %s for the size */
  gives: string;
  /** how the size is written: a percentage or money */
  unit: string;
  per_level: number;
  max: number;
  art: string;
}

export const LESSONS: Lesson[] = worded(lessonsData, lessonsEn);
export const TRAITS: Trait[] = worded(traitsData, traitsEn);
const SCHEMA_VERSION = 2;
const KEY = 'b2b-saas-founder';
/** how many lessons one startup can teach */
const PER_RUN = 2;

export function emptyMeta(): Meta {
  return { v: SCHEMA_VERSION, runs: [], lessons: [], traits: {} };
}

/** Brings a stored record to the current schema; anything unreadable is a founder with no past. */
export function migrate(raw: unknown): Meta {
  if (typeof raw !== 'object' || raw === null) return emptyMeta();
  const r = raw as Partial<Meta>;
  // version 1 had no traits: the founder keeps the past and starts them from zero
  if ((r.v !== SCHEMA_VERSION && r.v !== 1) || !Array.isArray(r.runs) || !Array.isArray(r.lessons)) return emptyMeta();
  const known = new Set(LESSONS.map((l) => l.id));
  const traits: Record<string, number> = {};
  for (const t of TRAITS) {
    const level = Number((r.traits ?? {})[t.id]);
    if (Number.isFinite(level) && level > 0) traits[t.id] = Math.min(t.max, Math.floor(level));
  }
  return {
    v: SCHEMA_VERSION,
    runs: r.runs.filter((p) => typeof p?.pitch === 'string' && typeof p?.lived === 'number'),
    lessons: r.lessons.filter((id) => known.has(id)),
    traits,
  };
}

export function loadMeta(): Meta {
  try {
    return migrate(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    // no storage or a broken record: a founder with no past
    return emptyMeta();
  }
}

export function saveMeta(meta: Meta): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    // the past lives until the page is closed
  }
}

function happened(run: Run, when: string): boolean {
  switch (when) {
    case 'down':
      return run.stats.downs > 0;
    case 'corp':
      return run.stats.corp > 0;
    case 'asked':
      return run.known.length >= 2;
    case 'kept':
      return run.stats.kept >= 2;
    case 'broken':
      return run.stats.broken > 0;
    case 'pawn':
      return run.mortgaged && run.over !== 'broke';
    case 'links':
      return run.stats.links >= 3;
    case 'many':
      return run.stats.clients >= 10;
    case 'sold':
      return run.over === 'sold';
    case 'profit':
      return run.over === 'profit';
    case 'broke':
      return run.over === 'broke' || run.over === 'late';
    default:
      return true;
  }
}

/** What this startup taught: up to two new lessons, by what happened in it. */
export function learn(run: Run, meta: Meta): Lesson[] {
  return LESSONS.filter((l) => !meta.lessons.includes(l.id) && happened(run, l.when)).slice(0, PER_RUN);
}

/** Writes the finished startup into the founder's record and returns the lessons it gave. */
export function finish(run: Run, meta: Meta): Lesson[] {
  const got = learn(run, meta);
  meta.runs.push({
    pitch: pitch(run.idea),
    idea: [run.idea.tech.id, run.idea.form.id, run.idea.aud.id],
    ending: run.over ?? 'broke',
    lived: run.t,
    peakMrr: run.stats.peakMrr,
    clients: run.stats.clients,
    soldFor: run.stats.soldFor,
    value: run.stats.value,
  });
  for (const l of got) meta.lessons.push(l.id);
  return got;
}

/** The three words of a past startup in the language the game runs in now; a record without card ids keeps its own words. */
export function pastPitch(p: Past): string {
  const [tech, form, aud] = p.idea ?? [];
  const idea = { tech: IDEAS.tech.find((c) => c.id === tech), form: IDEAS.form.find((c) => c.id === form), aud: IDEAS.aud.find((c) => c.id === aud) };
  return idea.tech && idea.form && idea.aud ? pitch({ tech: idea.tech, form: idea.form, aud: idea.aud }) : p.pitch;
}

/** Three traits to choose one from after a startup: those that can still grow, drawn by the seed of the run. */
export function traitChoices(meta: Meta, seed: number): Trait[] {
  const rng = createRng(seed ^ 0x9e3779b9);
  const open = TRAITS.filter((t) => (meta.traits[t.id] ?? 0) < t.max);
  for (let k = open.length - 1; k > 0; k--) {
    const m = rng.int(0, k);
    [open[k], open[m]] = [open[m], open[k]];
  }
  return open.slice(0, 3);
}

export function raise(meta: Meta, id: string): void {
  const t = TRAITS.find((x) => x.id === id);
  if (t) meta.traits[id] = Math.min(t.max, (meta.traits[id] ?? 0) + 1);
}

/** The levels a startup is played with: one trait may be doubled for this startup only. */
export function traitLevels(meta: Meta, boost = ''): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TRAITS) out[t.id] = (meta.traits[t.id] ?? 0) * (t.id === boost ? 2 : 1);
  return out;
}

/** «чек клиентов +12%» — what a trait gives at this level */
export function traitGives(t: Trait, level: number): string {
  const size = t.unit === 'money' ? `$${Math.round(t.per_level * level)}` : `${Math.round(t.per_level * level * 100)}%`;
  return t.gives.replace('%s', size);
}

/** Cards of the idea decks that the next startup sees for the first time: unlocked by the number of startups behind. */
export function unlockedNow(runs: number): string[] {
  const all = [
    ...IDEAS.tech.map((c) => ({ c, name: L(`${c.adj} ИИ`, `${c.adj} AI`) })),
    ...IDEAS.form.map((c) => ({ c, name: L(`ИИ-${c.name}`, `AI ${c.name}`) })),
    ...IDEAS.aud.map((c) => ({ c, name: L(`для ${c.name}`, `for ${c.name}`) })),
  ];
  return all.filter((x) => (x.c as { unlock?: number }).unlock === runs).map((x) => x.name);
}
