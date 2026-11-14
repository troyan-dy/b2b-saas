import lessonsData from '../../data/balance/lessons.json';
import { pitch, type Ending, type Run } from '../run/run';

/**
 * The founder between startups: the same developer goes from run to run and keeps what was learned.
 * Pure logic plus one record in the browser's storage.
 */

export interface Past {
  pitch: string;
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
}

export interface Lesson {
  id: string;
  when: string;
  title: string;
  text: string;
  gives: string;
}

export const LESSONS = lessonsData as Lesson[];
const SCHEMA_VERSION = 1;
const KEY = 'b2b-saas-founder';
/** how many lessons one startup can teach */
const PER_RUN = 2;

export function emptyMeta(): Meta {
  return { v: SCHEMA_VERSION, runs: [], lessons: [] };
}

/** Brings a stored record to the current schema; anything unreadable is a founder with no past. */
export function migrate(raw: unknown): Meta {
  if (typeof raw !== 'object' || raw === null) return emptyMeta();
  const r = raw as Partial<Meta>;
  if (r.v !== SCHEMA_VERSION || !Array.isArray(r.runs) || !Array.isArray(r.lessons)) return emptyMeta();
  const known = new Set(LESSONS.map((l) => l.id));
  return {
    v: SCHEMA_VERSION,
    runs: r.runs.filter((p) => typeof p?.pitch === 'string' && typeof p?.lived === 'number'),
    lessons: r.lessons.filter((id) => known.has(id)),
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
