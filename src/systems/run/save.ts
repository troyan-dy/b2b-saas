import { createRng } from '../../core/rng';
import draftCards from '../../data/balance/draft.json';
import {
  CLIENT_TYPES,
  createRun,
  DILEMMAS,
  IDEAS,
  LANES,
  refreshRun,
  RULES,
  TIERS,
  type Idea,
  type Run,
} from './run';

export const RUN_SAVE_KEY = 'b2b-saas-run';
const SCHEMA_VERSION = 1;
const TRANSIENT = new Set(['rng', 'events', 'live', 'eff', 'host', 'linkCount', 'mod', 'idea']);
type RecordValue = Record<string, unknown>;

function record(value: unknown): value is RecordValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function plain(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => plain(item, depth + 1));
  return (
    record(value) &&
    Object.entries(value).every(
      ([key, item]) =>
        !['__proto__', 'constructor', 'prototype'].includes(key) && plain(item, depth + 1),
    )
  );
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function integer(value: unknown): value is number {
  return nonnegative(value) && Number.isSafeInteger(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function kind(value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(RULES, value);
}

function kinds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(kind);
}

function card(value: unknown): boolean {
  return typeof value === 'string' && draftCards.some((entry) => entry.id === value);
}

function client(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    integer(value.id) &&
    value.id > 0 &&
    typeof value.texture === 'string' &&
    typeof value.name === 'string' &&
    CLIENT_TYPES.some((item) => item.id === value.type) &&
    kind(value.want) &&
    integer(value.wantLevel) &&
    value.wantLevel > 0 &&
    integer(value.patience) &&
    integer(value.slot) &&
    nonnegative(value.pay) &&
    nonnegative(value.deal) &&
    typeof value.happy === 'boolean' &&
    typeof value.promised === 'boolean'
  );
}

function block(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    kind(value.kind) &&
    Number.isSafeInteger(value.i) &&
    Number.isSafeInteger(value.j) &&
    nonnegative(value.done) &&
    nonnegative(value.need) &&
    integer(value.level) &&
    value.level > 0 &&
    ['built', 'live', 'up', 'hand'].every((key) => typeof value[key] === 'boolean') &&
    (value.queued === undefined || typeof value.queued === 'boolean')
  );
}

function report(value: unknown): boolean {
  if (value === null) return true;
  if (!record(value)) return false;
  return (
    integer(value.sprint) &&
    strings(value.shipped) &&
    strings(value.reasons) &&
    typeof value.down === 'boolean' &&
    ['came', 'left', 'closed', 'mrr', 'tokens', 'debt'].every((key) => nonnegative(value[key]))
  );
}

function production(value: RecordValue): boolean {
  if (
    value.draft !== undefined &&
    value.draft !== null &&
    (!Array.isArray(value.draft) || !value.draft.every(card))
  )
    return false;
  if (value.infrastructure !== undefined && !integer(value.infrastructure)) return false;
  if (value.nextTask !== undefined && (!integer(value.nextTask) || value.nextTask < 1))
    return false;
  if (value.strategy !== undefined) {
    if (!record(value.strategy)) return false;
    if (
      ![null, 'mass', 'premium'].includes(value.strategy.support as string | null) ||
      ![null, 'batch', 'instant'].includes(value.strategy.processing as string | null)
    )
      return false;
  }
  if (value.tasks === undefined) return true;
  return (
    Array.isArray(value.tasks) &&
    value.tasks.every(
      (task: unknown) =>
        record(task) &&
        typeof task.id === 'string' &&
        task.id.length > 0 &&
        ['build', 'upgrade', 'card', 'infrastructure'].includes(task.kind as string) &&
        ['queued', 'active', 'ready', 'backlog'].includes(task.status as string) &&
        ['work', 'done', 'cost'].every((key) => nonnegative(task[key])) &&
        (task.done as number) <= (task.work as number) &&
        (task.block === undefined || kind(task.block)) &&
        (task.card === undefined || card(task.card)) &&
        (task.kind !== 'card' || card(task.card)) &&
        (!['build', 'upgrade'].includes(task.kind as string) || kind(task.block)) &&
        (task.level === undefined || (integer(task.level) && task.level > 0)),
    )
  );
}

function validRun(value: RecordValue, defaults: Run): boolean {
  const numeric = ['t', 'sprintT', 'debt', 'energy', 'leads', 'insight'];
  const ids = ['pool', 'asks', 'corpAsks', 'known'];
  if (!numeric.every((key) => nonnegative(value[key])) || !ids.every((key) => kinds(value[key])))
    return false;
  if (
    typeof value.seed !== 'number' ||
    !Number.isFinite(value.seed) ||
    typeof value.money !== 'number' ||
    !Number.isFinite(value.money)
  )
    return false;
  if (
    !integer(value.sprint) ||
    value.sprint < 1 ||
    !integer(value.stage) ||
    value.stage < 1 ||
    value.stage > 3
  )
    return false;
  if (
    !integer(value.nextId) ||
    value.nextId < 1 ||
    !integer(value.nextAgent) ||
    value.nextAgent < 1
  )
    return false;
  if (
    !strings(value.perks) ||
    !strings(value.seen) ||
    !record(value.traits) ||
    !Object.values(value.traits).every(integer)
  )
    return false;
  if (
    !LANES.includes(value.review as Run['review']) ||
    !['reviewLocked', 'down', 'mortgaged'].every((key) => typeof value[key] === 'boolean')
  )
    return false;
  if (![null, 'debt', 'supplier'].includes(value.downWhy as string | null) || value.over !== null)
    return false;
  if (![value.offer, value.lastChance].every((item) => item === null || nonnegative(item)))
    return false;
  if (
    !Array.isArray(value.blocks) ||
    !value.blocks.every(block) ||
    !Array.isArray(value.clients) ||
    !value.clients.every(client)
  )
    return false;
  if (value.call !== null && !client(value.call)) return false;
  if (
    !Array.isArray(value.agents) ||
    !value.agents.every(
      (agent: unknown) =>
        record(agent) &&
        integer(agent.id) &&
        agent.id > 0 &&
        nonnegative(agent.carry) &&
        LANES.includes(agent.lane as Run['review']) &&
        TIERS.includes(agent.tier as Run['agents'][number]['tier']),
    )
  )
    return false;
  if (
    value.dilemma !== null &&
    (!record(value.dilemma) ||
      !DILEMMAS.some((item) => item.id === (value.dilemma as RecordValue).id) ||
      !integer(value.dilemma.client) ||
      typeof value.dilemma.name !== 'string')
  )
    return false;
  if (
    !Array.isArray(value.risks) ||
    !value.risks.every(
      (risk: unknown) =>
        record(risk) &&
        integer(risk.left) &&
        integer(risk.n) &&
        nonnegative(risk.p) &&
        risk.p <= 1 &&
        typeof risk.say === 'string' &&
        typeof risk.text === 'string',
    )
  )
    return false;
  if (
    !Array.isArray(value.mods) ||
    !value.mods.every(
      (mod: unknown) =>
        record(mod) &&
        ['tokens', 'price', 'promo'].includes(mod.kind as string) &&
        nonnegative(mod.mult) &&
        integer(mod.left) &&
        typeof mod.tag === 'string',
    )
  )
    return false;
  if (!Number.isSafeInteger(value.newsWait)) return false;
  if (!report(value.lastReport) || !record(value.stats)) return false;
  const stats = value.stats;
  return Object.keys(defaults.stats).every((key) => nonnegative(stats[key])) && production(value);
}

export function saveRun(run: Run): boolean {
  if (run.over) return false;
  try {
    const state: RecordValue = Object.fromEntries(
      Object.entries(run).filter(([key, value]) => !TRANSIENT.has(key) && plain(value)),
    );
    state.idea = { tech: run.idea.tech.id, form: run.idea.form.id, aud: run.idea.aud.id };
    const saved = { v: SCHEMA_VERSION, rngState: run.rng.state(), run: state };
    if (!validRun(state, run)) return false;
    localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

export function loadRun(): Run | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(RUN_SAVE_KEY) ?? 'null');
    if (
      !record(saved) ||
      !plain(saved) ||
      saved.v !== SCHEMA_VERSION ||
      !integer(saved.rngState) ||
      saved.rngState > 0xffffffff ||
      !record(saved.run)
    )
      return null;
    const state = saved.run;
    if (!record(state.idea)) return null;
    const ids = state.idea;
    const tech = IDEAS.tech.find((card) => card.id === ids.tech);
    const form = IDEAS.form.find((card) => card.id === ids.form);
    const aud = IDEAS.aud.find((card) => card.id === ids.aud);
    if (!tech || !form || !aud) return null;
    const idea: Idea = { tech, form, aud };
    const run = createRun(state.seed as number, idea);
    if (!validRun(state, run)) return null;
    Object.assign(
      run,
      Object.fromEntries(Object.entries(state).filter(([key]) => !TRANSIENT.has(key))),
    );
    run.idea = idea;
    run.rng = createRng(run.seed, saved.rngState);
    run.events = [];
    refreshRun(run);
    return run;
  } catch {
    return null;
  }
}

export function clearRunSave(): void {
  try {
    localStorage.removeItem(RUN_SAVE_KEY);
  } catch {
    // A disabled browser store must not interrupt a completed company.
  }
}
