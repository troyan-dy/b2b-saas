import { createRng, type Rng } from '../../core/rng';
import blocksData from '../../data/balance/blocks.json';
import effectsData from '../../data/balance/effects.json';
import eventsData from '../../data/balance/events.json';
import ideasData from '../../data/balance/ideas.json';
import tuningData from '../../data/balance/run.json';

/**
 * One run = one startup, from an empty sheet to an ending. Pure logic: no Phaser, no DOM.
 * The scene calls `step` at a fixed rate, sends the player's intents and drains `events`.
 */

export type Lane = 'build' | 'fix' | 'promo' | 'research';
export type Tier = 'fast' | 'normal' | 'think';
export type Ending = 'broke' | 'sold' | 'profit' | 'late';
export const LANES: readonly Lane[] = ['build', 'fix', 'promo', 'research'];
export const TIERS: readonly Tier[] = ['fast', 'normal', 'think'];

export type TechCard = (typeof ideasData.tech)[number];
export type FormCard = (typeof ideasData.form)[number];
export type AudCard = (typeof ideasData.aud)[number];
export interface Idea {
  tech: TechCard;
  form: FormCard;
  aud: AudCard;
}

interface BlockRule {
  work: number;
  stage: number;
  friends: string[];
  role: string;
}
export const RULES = blocksData as Record<string, BlockRule>;
const EFFECTS = effectsData as Record<string, Record<string, number>>;
/** the one object the mechanics read every step: a tuning panel binds to it */
export const TUNING = tuningData;
export const IDEAS = ideasData;

export interface Agent {
  id: number;
  tier: Tier;
  lane: Lane;
  /** work not yet turned into a whole square */
  carry: number;
}

export interface Block {
  kind: string;
  i: number;
  j: number;
  done: number;
  need: number;
  /** all the work is in */
  built: boolean;
  /** shipped by a release: only a live block does anything */
  live: boolean;
}

export interface Client {
  id: number;
  texture: string;
  name: string;
  size: 'small' | 'mid' | 'corp';
  /** base subscription per sprint, before the idea and the links */
  pay: number;
  /** the block this client is waiting for */
  want: string;
  /** sprints left before it walks away */
  patience: number;
  happy: boolean;
  /** its place on the sheet */
  slot: number;
  /** what the call settled: a discount for an honest «not yet», a premium for a confident «of course» */
  deal: number;
  /** the founder said the block is already there: it must ship before the patience runs out */
  promised: boolean;
}

export interface Report {
  sprint: number;
  shipped: string[];
  came: number;
  left: number;
  reasons: string[];
  mrr: number;
  tokens: number;
  debt: number;
  down: boolean;
}

export type RunEvent =
  | { type: 'work'; agent: number; lane: Lane; i?: number; j?: number; idle?: boolean }
  | { type: 'placed'; kind: string; i: number; j: number }
  | { type: 'built'; kind: string; i: number; j: number }
  | { type: 'live'; kind: string }
  | { type: 'release'; report: Report }
  | { type: 'client'; id: number }
  | { type: 'left'; id: number; name: string; reason: string }
  | { type: 'reveal'; kind: string }
  | { type: 'down' }
  | { type: 'stage'; stage: number }
  | { type: 'offer'; price: number }
  | { type: 'call'; name: string; kind: string }
  | { type: 'hungup'; name: string }
  | { type: 'kept'; id: number }
  | { type: 'refund'; id: number; sum: number }
  | { type: 'lastchance'; sum: number }
  /** `arg` — the block the headline is about, to be named in place of %s */
  | { type: 'news'; id: string; text: string; arg: string; good: boolean }
  | { type: 'end'; ending: Ending };

/** Something the industry did to the startup for a few sprints: dearer tokens, a smaller cheque, a better week for promotion. */
export interface Mod {
  kind: 'tokens' | 'price' | 'promo';
  mult: number;
  /** sprints left */
  left: number;
  /** how the sheet names it: «токены ×1,4» */
  tag: string;
}

export interface Run {
  seed: number;
  rng: Rng;
  idea: Idea;
  perks: readonly string[];
  /** seconds since the start */
  t: number;
  /** the sprint that is running now, from 1 */
  sprint: number;
  sprintT: number;
  money: number;
  stage: number;
  blocks: Block[];
  agents: Agent[];
  /** the lane the founder checks: no debt there, and the work goes faster */
  review: Lane;
  /** the choice is made once a sprint */
  reviewLocked: boolean;
  debt: number;
  /** the founder's own strength: each point is one square of work done by hand */
  energy: number;
  leads: number;
  insight: number;
  /** what this market asks for; hidden until research reveals it */
  asks: string[];
  corpAsks: string[];
  known: string[];
  clients: Client[];
  /** the product is down this sprint: nobody pays */
  down: boolean;
  offer: number | null;
  offersMade: number;
  /** a client on the line, asking about a block that is not there; it takes its place when answered */
  call: Client | null;
  /** the money is gone and the bank offers this much for the flat; the clock waits for the answer */
  lastChance: number | null;
  mortgaged: boolean;
  /** what the news did and how long it lasts; `mod` is the same thing multiplied out, read every step */
  mods: Mod[];
  mod: { tokens: number; price: number; promo: number };
  /** sprints before the news may strike again */
  newsWait: number;
  events: RunEvent[];
  over: Ending | null;
  lastReport: Report | null;
  stats: {
    clients: number;
    left: number;
    downs: number;
    peakMrr: number;
    shipped: number;
    corp: number;
    soldFor: number;
    tokens: number;
    firstClientAt: number;
    profitAt: number;
    /** blocks promised on calls, and how many of the promises were kept and broken */
    promises: number;
    kept: number;
    broken: number;
  };
  nextId: number;
  /** agents are numbered in the order they are hired */
  nextAgent: number;
  /** what is shipped, the links between it and what it gives: recounted at every release, read every step */
  live: Set<string>;
  linkCount: number;
  eff: Effects;
}

interface Effects {
  patience: number;
  word_of_mouth: number;
  corp_pay: number;
  small_pay: number;
  promo: number;
  tokens: number;
}

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = [...items];
  for (let k = a.length - 1; k > 0; k--) {
    const m = rng.int(0, k);
    [a[k], a[m]] = [a[m], a[k]];
  }
  return a;
}

/** Three cards of each deck to choose from. */
export function dealIdea(seed: number): { tech: TechCard[]; form: FormCard[]; aud: AudCard[] } {
  const rng = createRng(seed);
  return {
    tech: shuffle(rng, IDEAS.tech).slice(0, 3),
    form: shuffle(rng, IDEAS.form).slice(0, 3),
    aud: shuffle(rng, IDEAS.aud).slice(0, 3),
  };
}

/** «Голосовой ИИ-тиндер для стоматологий» */
export function pitch(idea: Idea): string {
  return `${idea.tech.adj} ИИ-${idea.form.name} для ${idea.aud.name}`;
}

export function createRun(seed: number, idea: Idea, perks: readonly string[] = []): Run {
  const rng = createRng(seed);
  const askable = Object.keys(RULES).filter((k) => RULES[k].role === 'ask');
  const corp = Object.keys(RULES).filter((k) => RULES[k].role === 'corp');
  const run: Run = {
    seed,
    rng,
    idea,
    perks,
    t: 0,
    sprint: 1,
    sprintT: 0,
    money: TUNING.start_money + (perks.includes('cash') ? 1500 : 0),
    stage: 1,
    blocks: [],
    agents: [{ id: 1, tier: 'fast', lane: 'build', carry: 0 }],
    review: 'build',
    reviewLocked: false,
    debt: 0,
    energy: TUNING.crunch.max,
    leads: 0,
    insight: 0,
    asks: shuffle(rng, askable).slice(0, 3),
    corpAsks: shuffle(rng, corp),
    known: [],
    clients: [],
    down: false,
    offer: null,
    offersMade: 0,
    call: null,
    lastChance: null,
    mortgaged: false,
    mods: [],
    mod: { tokens: 1, price: 1, promo: 1 },
    newsWait: 0,
    events: [],
    over: null,
    lastReport: null,
    stats: { clients: 0, left: 0, downs: 0, peakMrr: 0, shipped: 0, corp: 0, soldFor: 0, tokens: 0, firstClientAt: 0, profitAt: 0, promises: 0, kept: 0, broken: 0 },
    nextId: 1,
    nextAgent: 2,
    live: new Set(),
    linkCount: 0,
    eff: { patience: 0, word_of_mouth: 1, corp_pay: 1, small_pay: 1, promo: 1, tokens: 1 },
  };
  // what the founder learned in earlier startups
  if (perks.includes('template')) {
    run.blocks.push({ kind: 'core', i: 0, j: 0, done: workNeed(run, 'core'), need: workNeed(run, 'core'), built: true, live: true });
  }
  if (perks.includes('posts')) run.leads = 1;
  if (perks.includes('buyers')) run.known.push(run.corpAsks[0]);
  if (perks.includes('ear')) run.known.push(run.asks[0]);
  refresh(run);
  return run;
}

// ---------------------------------------------------------------- reading the state

export function isLive(run: Run, kind: string): boolean {
  return run.live.has(kind);
}

/** Recounts what the shipped blocks give. Liveness changes only at a release, so this is the only place it is counted. */
function refresh(run: Run): void {
  run.live = new Set(run.blocks.filter((b) => b.live).map((b) => b.kind));
  run.linkCount = links(run).length;
  const eff: Effects = { patience: 0, word_of_mouth: 1, corp_pay: 1, small_pay: 1, promo: 1, tokens: 1 };
  for (const [kind, e] of Object.entries(EFFECTS)) {
    if (!run.live.has(kind)) continue;
    for (const [name, v] of Object.entries(e)) {
      const key = name as keyof Effects;
      eff[key] = key === 'patience' ? eff[key] + v : eff[key] * v;
    }
  }
  run.eff = eff;
}

/** how many squares of work a block takes in this run */
export function workNeed(run: Run, kind: string): number {
  return Math.ceil(RULES[kind].work * run.idea.tech.work * run.idea.form.work);
}

/** Pairs of live blocks that stand side by side and are friends: «лендинг + оплата». */
export function links(run: Run): [string, string][] {
  const out: [string, string][] = [];
  const live = run.blocks.filter((b) => b.live);
  for (const a of live) {
    for (const b of live) {
      if (a.kind >= b.kind) continue;
      if (Math.abs(a.i - b.i) + Math.abs(a.j - b.j) !== 1) continue;
      if (RULES[a.kind].friends.includes(b.kind) || RULES[b.kind].friends.includes(a.kind)) out.push([a.kind, b.kind]);
    }
  }
  return out;
}

export function priceMult(run: Run): number {
  return run.idea.tech.price * run.idea.form.price * (1 + TUNING.link_bonus * run.linkCount) * run.mod.price;
}

/** what a client is worth per sprint: its subscription at today's prices, whether it pays right now or not */
function clientWorth(run: Run, c: Client): number {
  const own = c.size === 'corp' ? run.eff.corp_pay : run.eff.small_pay;
  return c.pay * c.deal * priceMult(run) * own * (c.happy ? TUNING.clients.happy_bonus : 1);
}

/** what a client pays per sprint right now */
export function clientPay(run: Run, c: Client): number {
  if (run.down || !isLive(run, 'pay')) return 0;
  return clientWorth(run, c);
}

/** what a client costs in tokens per sprint: free users burn them too */
export function clientTokens(run: Run, c: Client): number {
  // the more a client uses the product, the more it burns: tokens follow the size of the subscription
  return clientWorth(run, c) * TUNING.clients.token_share * run.idea.tech.tokens * run.eff.tokens * run.mod.tokens;
}

export function mrr(run: Run): number {
  let sum = 0;
  for (const c of run.clients) sum += clientPay(run, c);
  return sum;
}

export function tokens(run: Run): number {
  let sum = 0;
  for (const c of run.clients) sum += clientTokens(run, c);
  return sum;
}

export function agentCost(run: Run): number {
  let sum = 0;
  for (const a of run.agents) sum += TUNING.tiers[a.tier].cost_per_s;
  return sum;
}

export function burnPerS(run: Run): number {
  // every shipped block has to be hosted and kept alive: a feature is a commitment
  return TUNING.living_per_s + agentCost(run) + run.live.size * TUNING.upkeep_per_block_s + tokens(run) / TUNING.sprint_s;
}

export function incomePerS(run: Run): number {
  return mrr(run) / TUNING.sprint_s;
}

export function netPerS(run: Run): number {
  return incomePerS(run) - burnPerS(run);
}

export function stageRule(run: Run): (typeof TUNING.stages)[number] {
  return TUNING.stages[run.stage - 1];
}

/** Cells the next block may stand on: inside the sheet of this stage, next to what is already there. */
export function freeCells(run: Run): { i: number; j: number }[] {
  if (run.blocks.length === 0) return [{ i: 0, j: 0 }];
  const r = stageRule(run).radius;
  const taken = new Set(run.blocks.map((b) => `${b.i},${b.j}`));
  const out: { i: number; j: number }[] = [];
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      // the sheet of the product is a diamond: its far corners are cut off
      if (Math.abs(i) + Math.abs(j) > r + 1) continue;
      if (taken.has(`${i},${j}`)) continue;
      if (taken.has(`${i + 1},${j}`) || taken.has(`${i - 1},${j}`) || taken.has(`${i},${j + 1}`) || taken.has(`${i},${j - 1}`)) out.push({ i, j });
    }
  }
  return out;
}

/** Blocks that can be started now, in the order of the shelf. */
export function shelf(run: Run): string[] {
  if (run.blocks.length === 0) return ['core'];
  const placed = new Set(run.blocks.map((b) => b.kind));
  return Object.keys(RULES).filter((k) => !placed.has(k) && (RULES[k].stage <= run.stage || (k === 'cheap' && run.perks.includes('cheapEarly'))));
}

export function sites(run: Run): Block[] {
  return run.blocks.filter((b) => !b.built);
}

/** the product can be shown to a client: there is something to try and a page to find it on */
export function sellable(run: Run): boolean {
  return isLive(run, 'core') && isLive(run, 'landing');
}

/** how many friends of `kind` already stand around cell (i, j): a hint for the player and for bots */
export function friendsAt(run: Run, kind: string, i: number, j: number): number {
  let n = 0;
  for (const b of run.blocks) {
    if (Math.abs(b.i - i) + Math.abs(b.j - j) !== 1) continue;
    if (RULES[kind].friends.includes(b.kind) || RULES[b.kind].friends.includes(kind)) n++;
  }
  return n;
}

// ---------------------------------------------------------------- the player's intents

export function place(run: Run, kind: string, i: number, j: number): boolean {
  if (run.over || !shelf(run).includes(kind)) return false;
  if (sites(run).length >= TUNING.sites_max) return false;
  if (!freeCells(run).some((c) => c.i === i && c.j === j)) return false;
  run.blocks.push({ kind, i, j, done: 0, need: workNeed(run, kind), built: false, live: false });
  run.events.push({ type: 'placed', kind, i, j });
  return true;
}

export function setLane(run: Run, agentId: number, lane: Lane): void {
  const a = run.agents.find((x) => x.id === agentId);
  if (a) a.lane = lane;
}

/** The founder picks what to check; the choice holds until the release. */
export function setReview(run: Run, lane: Lane): boolean {
  if (run.reviewLocked || run.review === lane) return false;
  run.review = lane;
  run.reviewLocked = true;
  return true;
}

export function canHire(run: Run, tier: Tier): boolean {
  const rule = stageRule(run);
  return !run.over && run.agents.length < rule.agents_max && rule.tiers.includes(tier);
}

export function hire(run: Run, tier: Tier): boolean {
  if (!canHire(run, tier)) return false;
  run.agents.push({ id: run.nextAgent++, tier, lane: 'build', carry: 0 });
  return true;
}

export function fire(run: Run, agentId: number): void {
  run.agents = run.agents.filter((a) => a.id !== agentId);
}

/** The founder finishes the work by hand: one square into the site right now, and some debt with it. */
export function crunch(run: Run): boolean {
  const site = run.blocks.find((b) => !b.built);
  if (run.over || !site || run.energy < 1) return false;
  run.energy -= 1;
  run.debt += TUNING.crunch.debt;
  run.events.push({ type: 'work', agent: 0, lane: 'build', i: site.i, j: site.j });
  addWork(run, site);
  return true;
}

function addWork(run: Run, site: Block): void {
  site.done++;
  if (site.done >= site.need) {
    site.built = true;
    run.events.push({ type: 'built', kind: site.kind, i: site.i, j: site.j });
  }
}

export function answerOffer(run: Run, accept: boolean): void {
  if (run.offer === null) return;
  if (accept) {
    run.stats.soldFor = run.offer;
    end(run, 'sold');
  }
  run.offer = null;
}

/**
 * The client on the line asked about a block that is not there. Honest: it signs with a discount.
 * Confident: it pays a premium, but the block must ship before its patience ends.
 */
export function answerCall(run: Run, sure: boolean): void {
  const c = run.call;
  if (!c || run.over) return;
  run.call = null;
  if (run.clients.length >= stageRule(run).clients_max) return;
  if (sure) {
    c.deal = TUNING.call.sure_mult;
    c.promised = true;
    c.patience = TUNING.call.sure_patience;
    run.stats.promises++;
  } else c.deal = TUNING.call.honest_mult;
  seat(run, c);
}

/** The money is gone. Mortgaging the flat buys a minute of life, once. */
export function answerLastChance(run: Run, accept: boolean): void {
  if (run.lastChance === null || run.over) return;
  if (accept) {
    run.money += run.lastChance;
    run.mortgaged = true;
  } else end(run, 'broke');
  run.lastChance = null;
}

// ---------------------------------------------------------------- time

export function step(run: Run, dt: number): void {
  // the bank is on the line: the clock waits for the answer
  if (run.over || run.lastChance !== null) return;
  run.t += dt;
  run.money += netPerS(run) * dt;
  run.stats.tokens += (tokens(run) / TUNING.sprint_s) * dt;
  run.energy = Math.min(TUNING.crunch.max, run.energy + dt / TUNING.crunch.regen_s);

  const slow = 1 - Math.min(TUNING.debt.slow_max, run.debt * TUNING.debt.slow_per_point);
  for (const a of run.agents) {
    let rate = TUNING.tiers[a.tier].work_per_s;
    if (a.lane === run.review) rate *= TUNING.review_boost;
    if (a.lane === 'build') rate *= slow;
    a.carry += rate * dt;
    while (a.carry >= 1) {
      a.carry -= 1;
      deliver(run, a);
    }
  }

  run.sprintT += dt;
  if (run.sprintT >= TUNING.sprint_s) release(run);
  if (!run.over && run.money <= 0) {
    run.money = 0;
    const net = netPerS(run);
    // already in the black: a refund emptied the account, the subscriptions will fill it again
    if (net >= 0) return;
    if (run.mortgaged) end(run, 'broke');
    else {
      run.lastChance = Math.ceil((-net * TUNING.mortgage_s) / 10) * 10;
      run.events.push({ type: 'lastchance', sum: run.lastChance });
    }
  }
}

/** One square of work arrives where the agent's lane points. */
function deliver(run: Run, a: Agent): void {
  const dirty = a.lane === run.review ? 0 : TUNING.tiers[a.tier].debt_per_work * (run.perks.includes('tests') ? 0.6 : 1);
  switch (a.lane) {
    case 'build': {
      const site = run.blocks.find((b) => !b.built);
      if (!site) {
        run.events.push({ type: 'work', agent: a.id, lane: a.lane, idle: true });
        return;
      }
      run.debt += dirty;
      run.events.push({ type: 'work', agent: a.id, lane: a.lane, i: site.i, j: site.j });
      addWork(run, site);
      return;
    }
    case 'fix':
      run.events.push({ type: 'work', agent: a.id, lane: a.lane, idle: run.debt <= 0 });
      run.debt = Math.max(0, run.debt - TUNING.fix_per_work);
      return;
    case 'promo':
      run.leads += (run.idea.tech.hype * run.idea.form.hype * run.eff.promo * run.mod.promo) / TUNING.promo_work_per_lead;
      run.debt += dirty * 0.5;
      run.events.push({ type: 'work', agent: a.id, lane: a.lane });
      return;
    case 'research': {
      const unknown = [...run.asks, ...(run.stage >= 2 ? run.corpAsks : [])].filter((k) => !run.known.includes(k));
      run.events.push({ type: 'work', agent: a.id, lane: a.lane, idle: unknown.length === 0 });
      if (unknown.length === 0) return;
      run.insight++;
      if (run.insight >= TUNING.research_work_per_reveal) {
        run.insight = 0;
        run.known.push(unknown[0]);
        run.events.push({ type: 'reveal', kind: unknown[0] });
      }
      return;
    }
  }
}

/** A lead becomes a client-to-be: who it is, what it pays and what it waits for. Not on the sheet yet. */
function makeClient(run: Run): Client {
  const C = TUNING.clients;
  const slot = -1;
  const corps = run.clients.filter((c) => c.size === 'corp').length;
  const patienceMods = run.idea.tech.patience + run.idea.form.patience + run.eff.patience;
  let client: Client;
  if (run.stage >= 3 && corps < 4 && run.rng.next() < C.corp_chance) {
    const taken = new Set(run.clients.map((c) => c.name));
    const pool = IDEAS.corp.filter((c) => !taken.has(c.name));
    const who = run.rng.pick(pool.length > 0 ? pool : IDEAS.corp);
    const want = run.rng.pick(run.corpAsks);
    client = { id: run.nextId++, texture: who.texture, name: who.name, size: 'corp', pay: C.corp_pay, want, patience: Math.max(1, C.corp_patience + patienceMods), happy: false, slot, deal: 1, promised: false };
  } else {
    const taken = new Set(run.clients.map((c) => c.name));
    const pool = run.idea.aud.clients.filter((n) => !taken.has(n));
    // the names ran out: the same business opens another branch
    let name = run.rng.pick(pool.length > 0 ? pool : run.idea.aud.clients);
    if (pool.length === 0) {
      const tails = [' II', ' III', ' IV'];
      name += tails.find((x) => !taken.has(name + x)) ?? tails[0];
    }
    const mid = run.rng.next() < C.mid_chance;
    const want = run.rng.pick(run.asks);
    client = {
      id: run.nextId++,
      texture: run.idea.aud.texture,
      name,
      size: mid ? 'mid' : 'small',
      pay: run.idea.aud.pay * (mid ? C.mid_pay_mult : 1),
      want,
      patience: Math.max(1, C.patience + patienceMods),
      happy: false,
      slot,
      deal: 1,
      promised: false,
    };
  }
  return client;
}

/** The client takes its place on the sheet and starts to count. */
function seat(run: Run, client: Client): void {
  const used = new Set(run.clients.map((c) => c.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  client.slot = slot;
  client.happy = isLive(run, client.want);
  if (client.happy && client.promised) {
    // built while the phone was ringing: the promise is already kept
    client.promised = false;
    run.stats.kept++;
  }
  run.clients.push(client);
  run.stats.clients++;
  if (client.size === 'corp') run.stats.corp++;
  if (run.stats.firstClientAt === 0) run.stats.firstClientAt = run.t;
  run.events.push({ type: 'client', id: client.id });
}

/** The end of a sprint: what is built ships, the market answers. */
function release(run: Run): void {
  const C = TUNING.clients;
  const report: Report = { sprint: run.sprint, shipped: [], came: 0, left: 0, reasons: [], mrr: 0, tokens: 0, debt: 0, down: false };

  for (const b of run.blocks) {
    if (b.built && !b.live) {
      b.live = true;
      report.shipped.push(b.kind);
      run.stats.shipped++;
      run.events.push({ type: 'live', kind: b.kind });
    }
  }
  refresh(run);

  // too much debt: the product is down for the whole next sprint
  if (run.debt >= TUNING.debt.down_at) {
    run.down = true;
    run.debt -= TUNING.debt.down_relief;
    run.stats.downs++;
    run.events.push({ type: 'down' });
  } else {
    run.down = false;
  }

  news(run);

  // nobody picked up: the client on the line is gone
  if (run.call) {
    run.events.push({ type: 'hungup', name: run.call.name });
    run.call = null;
  }

  // clients who got what they waited for stay; the rest lose patience
  const stay: Client[] = [];
  for (const c of run.clients) {
    if (isLive(run, c.want)) {
      if (c.promised) {
        c.promised = false;
        run.stats.kept++;
        run.events.push({ type: 'kept', id: c.id });
      }
      c.happy = true;
      stay.push(c);
      continue;
    }
    c.patience -= run.down ? 2 : 1;
    if (c.patience > 0) {
      stay.push(c);
      continue;
    }
    const reason = run.known.includes(c.want) || c.promised ? c.want : '';
    report.left++;
    report.reasons.push(reason);
    run.stats.left++;
    if (c.promised) {
      // it paid for a block that never came: the money goes back
      const sum = Math.round(clientWorth(run, c) * TUNING.call.refund_sprints);
      run.money -= sum;
      run.stats.broken++;
      run.events.push({ type: 'refund', id: c.id, sum });
    }
    run.events.push({ type: 'left', id: c.id, name: c.name, reason });
  }
  run.clients = stay;

  if (sellable(run)) {
    const wom = C.word_of_mouth * run.eff.word_of_mouth * run.idea.form.viral;
    for (const c of run.clients) {
      if (c.happy && run.rng.next() < wom) run.leads += 1;
    }
    // the very first client is an acquaintance: no promotion needed
    if (run.stats.clients === 0) run.leads = Math.max(run.leads, 1);
    const max = stageRule(run).clients_max;
    while (run.leads >= 1 && run.clients.length < max) {
      run.leads -= 1;
      const c = makeClient(run);
      // a client that needs what is not there may call first and ask; it comes when the founder answers
      if (run.call === null && run.stage >= 2 && !isLive(run, c.want) && run.rng.next() < TUNING.call.chance) {
        run.call = c;
        run.events.push({ type: 'call', name: c.name, kind: c.want });
        // the question itself says what this market wants
        if (!run.known.includes(c.want)) {
          run.known.push(c.want);
          run.events.push({ type: 'reveal', kind: c.want });
        }
        continue;
      }
      seat(run, c);
      report.came++;
    }
    run.leads = Math.min(run.leads, 3);
  }

  const income = mrr(run);
  if (run.stage === 1 && run.clients.length > 0 && isLive(run, 'pay')) {
    run.stage = 2;
    run.events.push({ type: 'stage', stage: 2 });
  } else if (run.stage === 2 && income >= TUNING.stage3_mrr) {
    run.stage = 3;
    run.events.push({ type: 'stage', stage: 3 });
  }

  run.offer = null;
  const next = TUNING.offers[run.offersMade];
  if (next && income >= next.mrr) {
    run.offer = Math.round((income * next.mult) / 100) * 100;
    run.offersMade++;
    run.events.push({ type: 'offer', price: run.offer });
  }

  report.mrr = income;
  report.tokens = tokens(run);
  report.debt = run.debt;
  report.down = run.down;
  run.stats.peakMrr = Math.max(run.stats.peakMrr, income);
  if (run.stats.profitAt === 0 && netPerS(run) >= 0 && income > 0) run.stats.profitAt = run.t;
  run.lastReport = report;
  run.events.push({ type: 'release', report });

  run.sprint++;
  run.sprintT = 0;
  run.reviewLocked = false;
  if (run.sprint > TUNING.last_sprint) end(run, netPerS(run) >= 0 ? 'profit' : 'late');
}

/**
 * The industry answers too. What was in force runs out, and now and then a headline changes the rules
 * for a few sprints: the news line is where competitors live.
 */
function news(run: Run): void {
  for (const m of run.mods) m.left--;
  run.mods = run.mods.filter((m) => m.left > 0);

  const N = TUNING.news;
  run.newsWait--;
  if (run.sprint >= N.from_sprint && run.newsWait <= 0 && run.rng.next() < (run.stage >= 3 ? N.chance_stage3 : N.chance)) {
    const waiting = [...new Set(run.clients.filter((c) => !c.happy).map((c) => c.want))];
    const pool = eventsData.filter((e) => e.stage <= run.stage && (e.kind !== 'impatience' || waiting.length > 0) && (e.kind !== 'down' || !run.down));
    let roll = run.rng.next() * pool.reduce((s, e) => s + e.weight, 0);
    const e = pool.find((x) => (roll -= x.weight) < 0) ?? pool[0];
    let arg = '';
    switch (e.kind) {
      case 'tokens':
      case 'price':
      case 'promo':
        run.mods = run.mods.filter((m) => m.kind !== e.kind);
        run.mods.push({ kind: e.kind as Mod['kind'], mult: e.mult, left: e.sprints, tag: e.tag });
        break;
      case 'debt':
        run.debt += e.add;
        break;
      case 'leads':
        run.leads += e.add;
        break;
      case 'money':
        run.money += e.add;
        break;
      case 'down':
        run.down = true;
        break;
      case 'impatience': {
        const kind = run.rng.pick(waiting);
        // tired of waiting, but not gone yet: the founder still has a sprint to answer
        for (const c of run.clients) if (!c.happy && c.want === kind) c.patience = Math.max(1, c.patience - e.add);
        arg = kind;
        break;
      }
    }
    run.newsWait = N.cooldown;
    run.events.push({ type: 'news', id: e.id, text: e.text, arg, good: e.kind === 'leads' || e.kind === 'money' || (e.kind === 'promo' && e.mult > 1) });
  }

  const mod = { tokens: 1, price: 1, promo: 1 };
  for (const m of run.mods) mod[m.kind] *= m.mult;
  run.mod = mod;
}

function end(run: Run, ending: Ending): void {
  if (run.over) return;
  run.over = ending;
  run.events.push({ type: 'end', ending });
}
