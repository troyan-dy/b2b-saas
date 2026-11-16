import { createRng } from '../../core/rng';
import draftCards from '../../data/balance/draft.json';
import { createMarket, MARKET } from '../company/market';
import marketEvolution from '../../data/balance/market-evolution.json';
import { PRODUCTION, STRATEGY_IDS } from './product';
import {
  CLIENT_TYPES,
  createRun,
  finishAtSprintLimit,
  DILEMMAS,
  IDEAS,
  LANES,
  refreshRun,
  RULES,
  TIERS,
  TUNING,
  OFFICE,
  type Idea,
  type Run,
} from './run';

export const RUN_SAVE_KEY = 'b2b-saas-run';
const SCHEMA_VERSION = 4;
const TRANSIENT = new Set(['rng', 'events', 'live', 'eff', 'host', 'linkCount', 'mod', 'idea']);
const RETIRED = new Set(['research', 'known', 'insight']);
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
  if (value === undefined) return true;
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

function client(value: unknown, allowUnseated = false): boolean {
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
    (integer(value.slot) || (allowUnseated && value.slot === -1)) &&
    nonnegative(value.pay) &&
    nonnegative(value.deal) &&
    typeof value.happy === 'boolean' &&
    typeof value.promised === 'boolean'
  );
}

function block(value: unknown): value is Run['blocks'][number] {
  if (!record(value)) return false;
  return (
    kind(value.kind) &&
    Number.isSafeInteger(value.i) &&
    Number.isSafeInteger(value.j) &&
    nonnegative(value.done) &&
    nonnegative(value.need) &&
    integer(value.level) &&
    value.level > 0 &&
    value.level <= PRODUCTION.max_level &&
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

function tariff(value: unknown): value is number {
  if (!nonnegative(value) || value < MARKET.price.min || value > MARKET.price.max) return false;
  return Math.abs(value / MARKET.price.step - Math.round(value / MARKET.price.step)) < 1e-7;
}

function marketProfile(value: unknown, capacity: number): boolean {
  if (!record(value) || !nonnegative(value.share) || value.share <= 0 || value.share > 100 || !integer(value.count) || !nonnegative(value.leads))
    return false;
  if (!nonnegative(value.churnCarry) || value.churnCarry >= 1) return false;
  if (value.count + value.leads > capacity * marketEvolution.demand_max + 1e-7) return false;
  if (value.priceComfort !== undefined && (typeof value.priceComfort !== 'number' || value.priceComfort < marketEvolution.price_min || value.priceComfort > marketEvolution.price_max)) return false;
  if (
    !Array.isArray(value.needs) ||
    value.needs.length === 0 ||
    !value.needs.every(
      (need: unknown) =>
        record(need) &&
        kind(need.block) &&
        integer(need.level) &&
        need.level > 0 &&
        need.level <= PRODUCTION.max_level,
    )
  )
    return false;
  if (new Set(value.needs.map((need: RecordValue) => need.block)).size !== value.needs.length)
    return false;
  if (
    value.connection !== undefined &&
    (!kinds(value.connection) ||
      value.connection.length !== 2 ||
      new Set(value.connection).size !== 2)
  )
    return false;
  return value.instant === undefined || typeof value.instant === 'boolean';
}

function market(value: unknown, infrastructure: number): boolean {
  if (!record(value) || typeof value.opened !== 'boolean' || !Array.isArray(value.groups))
    return false;
  if (value.groups.length !== MARKET.segments.length || !value.groups.every(record)) return false;
  if (new Set(value.groups.map((group: RecordValue) => group.id)).size !== MARKET.segments.length)
    return false;
  if (value.revision !== undefined && (!integer(value.revision) || value.revision > marketEvolution.shift_sprints.length)) return false;
  for (const key of ['warned', 'evolved']) if (value[key] !== undefined && (!Array.isArray(value[key]) || !(value[key] as unknown[]).every(n => typeof n === 'number' && marketEvolution.shift_sprints.includes(n)))) return false;
  return value.groups.every((group: RecordValue) => {
    const segment = MARKET.segments.find((entry) => entry.id === group.id);
    if (
      !segment ||
      !tariff(group.price) ||
      (group.pendingPrice !== null && !tariff(group.pendingPrice))
    )
      return false;
    if (
      !integer(group.came) ||
      !integer(group.left) ||
      !Array.isArray(group.profiles) ||
      group.profiles.length !== segment.profiles.length
    )
      return false;
    const capacity = segment.market * MARKET.acquisition.market_expansion_mult ** infrastructure;
    if (!Number.isFinite(capacity)) return false;
    if (group.demand !== undefined && (!nonnegative(group.demand) || group.demand < marketEvolution.demand_min || group.demand > marketEvolution.demand_max)) return false;
    if (Math.abs(group.profiles.reduce((sum: number, profile: unknown) => sum + (record(profile) && nonnegative(profile.share) ? profile.share : 0), 0) - 100) > 1e-6) return false;
    return group.profiles.every(
      (profile: unknown) =>
        marketProfile(profile, capacity) &&
        (value.opened || (record(profile) && profile.count === 0 && profile.churnCarry === 0)),
    );
  });
}

function production(value: RecordValue, blocks: Run['blocks']): boolean {
  for (const key of ['land', 'desks'] as const) if (value[key] !== undefined && (!integer(value[key]) || value[key] > OFFICE[key].max)) return false;
  if (
    value.apiShipped !== undefined &&
    (!strings(value.apiShipped) ||
      !value.apiShipped.every((id) => id === 'infrastructure' || kind(id)))
  )
    return false;
  const infrastructure = value.infrastructure ?? 0;
  if (
    !integer(infrastructure) ||
    !Number.isFinite(
      PRODUCTION.infrastructure.cost * PRODUCTION.infrastructure.cost_growth ** infrastructure,
    ) ||
    !Number.isFinite(MARKET.capacity.expansion_mult ** infrastructure)
  )
    return false;
  if (value.market !== undefined && !market(value.market, infrastructure)) return false;
  const claimed = value.claimedGrants ?? [];
  if (
    !strings(claimed) ||
    !claimed.every((id) => id === 'credits' || id === 'consulting') ||
    new Set(claimed).size !== claimed.length
  )
    return false;
  const claimedIds = new Set<string>(claimed);
  if (value.claimedGrants === null || value.infrastructure === null) return false;
  if (value.strategy !== undefined) {
    if (!record(value.strategy)) return false;
    if (
      ![null, 'mass', 'premium'].includes(value.strategy.support as string | null) ||
      ![null, 'batch', 'instant'].includes(value.strategy.processing as string | null)
    )
      return false;
  }
  if (
    value.cardStacks !== undefined &&
    (!record(value.cardStacks) ||
      Object.entries(value.cardStacks).some(
        ([id, count]) =>
          !STRATEGY_IDS.includes(id as (typeof STRATEGY_IDS)[number]) ||
          !integer(count) ||
          count > TUNING.last_sprint,
      ))
  )
    return false;
  if (value.tasks !== undefined && !Array.isArray(value.tasks)) return false;
  const tasks = (value.tasks ?? []) as unknown[];
  if (value.nextTask !== undefined && (!integer(value.nextTask) || value.nextTask < 1))
    return false;
  const ids = new Set<string>();
  const planned = new Set<string>();
  const cards = new Set<string>();
  let active = 0;
  let expansions = 0;
  for (const task of tasks) {
    if (
      !record(task) ||
      typeof task.id !== 'string' ||
      !/^task-[1-9]\d*$/.test(task.id) ||
      ids.has(task.id)
    )
      return false;
    const id = Number(task.id.slice(5));
    if (!Number.isSafeInteger(id) || !integer(value.nextTask) || id >= value.nextTask) return false;
    ids.add(task.id);
    if (
      !['queued', 'active', 'ready', 'backlog'].includes(task.status as string) ||
      !integer(task.work) ||
      task.work === 0 ||
      !integer(task.done) ||
      !integer(task.cost) ||
      task.done > task.work
    )
      return false;
    if ((task.status === 'queued' || task.status === 'backlog') && task.done !== 0) return false;
    if ((task.status === 'ready') !== (task.done === task.work)) return false;
    if (task.status === 'active' && ++active > 1) return false;
    if (task.kind === 'build' || task.kind === 'upgrade') {
      const target = blocks.find((entry) => entry.kind === task.block);
      if (!target || planned.has(target.kind) || task.card !== undefined) return false;
      planned.add(target.kind);
      if (
        task.kind === 'build' &&
        (target.live || target.level !== 1 || task.level !== 1 || target.up)
      )
        return false;
      if (
        task.kind === 'upgrade' &&
        (!target.live ||
          task.level !== target.level + 1 ||
          (task.level as number) > PRODUCTION.max_level)
      )
        return false;
    } else if (task.kind === 'card') {
      const selected = draftCards.find((entry) => entry.id === task.card);
      if (!selected || task.block !== undefined || task.level !== undefined) return false;
      const cash = selected.id === 'credits' || selected.id === 'consulting';
      if ((selected.slot !== 'operation' || cash) && cards.has(selected.id)) return false;
      if (claimedIds.has(selected.id)) return false;
      cards.add(selected.id);
    } else if (task.kind === 'infrastructure') {
      if (
        ++expansions > 1 ||
        task.block !== undefined ||
        task.card !== undefined ||
        task.level !== undefined
      )
        return false;
    } else return false;
  }
  if (value.draft === undefined || value.draft === null) return true;
  if (!strings(value.draft) || value.draft.length !== 3 || new Set(value.draft).size !== 3)
    return false;
  return value.draft.every((id) => {
    const entry = draftCards.find((item) => item.id === id);
    if (
      !entry ||
      claimedIds.has(id) ||
      (entry.slot !== 'operation' && cards.has(id)) ||
      ((id === 'credits' || id === 'consulting') && cards.has(id))
    )
      return false;
    if (!entry.requires.every((kind) => blocks.some((block) => block.kind === kind && block.live)))
      return false;
    return (
      entry.slot === 'operation' ||
      Number((value.cardStacks as RecordValue | undefined)?.[id] ?? 0) < TUNING.last_sprint
    );
  });
}

function validRun(value: RecordValue, defaults: Run): boolean {
  if (value.recentNews !== undefined && (!strings(value.recentNews) || value.recentNews.length > TUNING.news.no_repeat)) return false;
  if (Array.isArray(value.tasks) && value.tasks.some(task => record(task) && task.apiBoost !== undefined && typeof task.apiBoost !== 'boolean')) return false;
  const numeric = ['t', 'sprintT', 'debt', 'energy', 'leads'];
  const ids = ['pool', 'asks', 'corpAsks'];
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
    !value.clients.every((entry) => client(entry))
  )
    return false;
  if (value.call !== null && !client(value.call, true)) return false;
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
  if (new Set(value.blocks.map((entry) => entry.kind)).size !== value.blocks.length) return false;
  if (new Set(value.blocks.map((entry) => `${entry.i}:${entry.j}`)).size !== value.blocks.length)
    return false;
  if (new Set(value.clients.map((entry) => entry.id)).size !== value.clients.length) return false;
  return (
    Object.keys(defaults.stats).every((key) => nonnegative(stats[key])) &&
    production(value, value.blocks)
  );
}

export function saveRun(run: Run): boolean {
  if (run.over) return false;
  try {
    const state: RecordValue = Object.fromEntries(
      Object.entries(run).filter(([key]) => !TRANSIENT.has(key) && !RETIRED.has(key)),
    );
    state.idea = { tech: run.idea.tech.id, form: run.idea.form.id, aud: run.idea.aud.id };
    const saved = { v: SCHEMA_VERSION, rngState: run.rng.state(), run: state };
    if (!plain(state) || !validRun(state, run)) return false;
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
      ![1, 2, 3, SCHEMA_VERSION].includes(saved.v as number) ||
      !integer(saved.rngState) ||
      saved.rngState > 0xffffffff ||
      !record(saved.run)
    )
      return null;
    const state = saved.run;
    if ((saved.v as number) < 4) {
      if (state.review === 'research') state.review = 'build';
      if (Array.isArray(state.agents))
        for (const agent of state.agents)
          if (record(agent) && agent.lane === 'research') agent.lane = 'build';
    }
    for (const key of RETIRED) delete state[key];
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
    if (state.desks === undefined) run.desks = Math.max(0, run.agents.length - OFFICE.desks.base);
    else if ((saved.v as number) < 3) {
      // Schemas 1–2 had two free places and at most six places in total.
      const oldSlots = Math.min(6, 2 + run.desks);
      run.desks = Math.max(0, oldSlots - OFFICE.desks.base, run.agents.length - OFFICE.desks.base);
    }
    if (state.market === undefined) run.market = createMarket(['core','landing','pay',...run.pool]);
    run.idea = idea;
    run.rng = createRng(run.seed, saved.rngState);
    run.events = [];
    refreshRun(run);
    if (run.sprint > TUNING.last_sprint) finishAtSprintLimit(run);
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
