import { L, LANG, worded } from '../../core/lang';
import { createRng, type Rng } from '../../core/rng';
import blocksData from '../../data/balance/blocks.json';
import clientsData from '../../data/balance/clients.json';
import dilemmasEn from '../../data/balance/dilemmas.en.json';
import dilemmasData from '../../data/balance/dilemmas.json';
import effectsData from '../../data/balance/effects.json';
import eventsEn from '../../data/balance/events.en.json';
import eventsData from '../../data/balance/events.json';
import ideasEn from '../../data/balance/ideas.en.json';
import ideasData from '../../data/balance/ideas.json';
import tuningData from '../../data/balance/run.json';
import officeData from '../../data/balance/office.json';
import traitsData from '../../data/balance/traits.json';
import { companyContext, companyTotals, customerCount } from '../company/company';
import { advanceMarket, createMarket, evolveMarket, normalizeMarket, MARKET, type MarketState } from '../company/market';
import { advanceResearch, beginResearch, createResearch, researchAvailable, RESEARCH, type ResearchKind, type ResearchState } from '../company/research';
import { dealDraft, releaseCard } from './draft';
import {
  addProductionWork,
  enqueueTask,
  hasWork,
  plannedWork,
  shipBlock,
  startWork,
  syncProduction,
  takeReleasedTasks,
  type WorkTask,
} from './production';
import { agentDebtPerWork, agentFixPerWork, agentWorkRate } from './workforce';
import {
  blockEffects,
  PRODUCTION,
  restoreCardStacks,
  strategyEffects,
  strategyHosting,
  segmentRevenueMultiplier,
  upgradeWork,
  projectCost,
  type CardStacks,
} from './product';

export { DRAFT_CARDS, chooseCard, draftCards, type DraftCard } from './draft';
export {
  activeWork,
  buildCapacity,
  remainingBuildCapacity,
  queueView,
  moveTask,
  deferTask,
  resumeTask,
  cancelTask,
  expandInfrastructure,
  apiWorkQuote,
  rushTask,
  type ApiWorkQuote,
  type WorkTask,
} from './production';
export { blockEffectText } from './product';
export { agentDebtPerWork, agentFixPerWork, agentWorkRate, WORKFORCE } from './workforce';

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
  /** what the shipped block costs to keep running, $ per second */
  host: number;
  stage: number;
  friends: string[];
  role: string;
}
export const RULES = blocksData as Record<string, BlockRule>;
/** what each shipped block gives; the shelf and the bots read it too */
export const EFFECTS = effectsData as Record<string, Record<string, number>>;
/** the one object the mechanics read every step: a tuning panel binds to it */
export const TUNING = tuningData;
export const OFFICE = officeData;
/** the idea decks and the names of the clients; the English words are laid over the cards by id, over the names — in order */
export const IDEAS: typeof ideasData =
  LANG === 'en'
    ? {
        tech: worded(ideasData.tech, ideasEn.tech),
        form: worded(ideasData.form, ideasEn.form),
        aud: worded(ideasData.aud, ideasEn.aud),
        corp: ideasData.corp.map((c, k) => ({ ...c, name: ideasEn.corp[k] ?? c.name })),
        startup: ideasData.startup.map((c, k) => ({ ...c, name: ideasEn.startup[k] ?? c.name })),
        gov: ideasData.gov.map((c, k) => ({ ...c, name: ideasEn.gov[k] ?? c.name })),
      }
    : ideasData;
/** what the industry does to the startup between releases: the news of the run */
const EVENTS = worded(eventsData, eventsEn);

export type ClientType = 'small' | 'mid' | 'startup' | 'corp' | 'gov';
interface ClientRule {
  id: ClientType;
  title: string;
  from_stage: number;
  /** a lead is tried against the types in the order of the file; the first roll that succeeds decides */
  chance: number;
  /** how many of this type the sheet holds at once */
  max: number;
  /** where the name and the picture come from: the audience of the idea or a list of its own */
  pool: 'aud' | 'corp' | 'startup' | 'gov';
  /** what it waits for: one of the market's asks or one of the purchasing department's */
  asks: 'market' | 'corp';
  /** subscription per sprint; 0 — the audience's cheque times `aud_mult` */
  pay: number;
  aud_mult: number;
  patience: number;
  /** the chance per release that it closes by itself, happy or not */
  churn: number;
  /** pays while it waits for its block; a state customer signs only when everything is there */
  pays_waiting: boolean;
}
export const CLIENT_TYPES = clientsData as ClientRule[];
const CLIENT_RULE = Object.fromEntries(CLIENT_TYPES.map((t) => [t.id, t])) as Record<
  ClientType,
  ClientRule
>;

/** One thing a chosen answer does. */
export type Fx =
  | { k: 'work' | 'debt' | 'leads' | 'money' | 'energy'; n: number }
  | { k: 'mod'; kind: string; mult: number; sprints: number; tag: string }
  | { k: 'deal'; who: string; mult: number }
  | { k: 'leave'; who: string; p: number; say: string }
  /** a lie that may come out: for three releases, chance `p` each, `n` clients walk out */
  | { k: 'risk'; p: number; n: number; say: string; text: string };

/** A small choice with a price: Claude offers to cut a corner, or someone calls and wants an answer. */
export interface Dilemma {
  id: string;
  /** who speaks: claude, client, blogger, rival, press */
  who: string;
  /** when it makes sense: site, sellable, client, clients2, debt, money, tired, stage2 */
  needs: string;
  weight: number;
  text: string;
  /** the last option is the refusal: it is what happens if nobody answers */
  options: { label: string; note: string; result: string; fx: Fx[] }[];
  /** what a careful founder answers: bots play it */
  bot: number;
}
/** the English words of a dilemma: its text, then every option with the words of its effects, in the order of the file */
type DilemmaWords = Record<
  string,
  { text: string; options: { label: string; note: string; result: string; fx?: object[] }[] }
>;
export const DILEMMAS: Dilemma[] =
  LANG === 'en'
    ? (dilemmasData as Dilemma[]).map((d) => {
        const w = (dilemmasEn as DilemmaWords)[d.id];
        // a dilemma nobody has translated yet is asked as it is written
        if (!w) return d;
        return {
          ...d,
          text: w.text,
          options: d.options.map((o, k) => ({
            ...o,
            ...w.options[k],
            fx: o.fx.map((f, m) => ({ ...f, ...w.options[k]?.fx?.[m] }) as Fx),
          })),
        };
      })
    : (dilemmasData as Dilemma[]);

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
  /** the version clients see: 1 when first shipped, one more after each rework */
  level: number;
  /** a rework is being built on top of the shipped block; `done` and `need` count its work */
  up: boolean;
  /** the last square of work was put in by the founder's own hands */
  hand: boolean;
  /** A reserved cell in the queue or backlog, before construction starts. */
  queued?: boolean;
}

export interface Client {
  id: number;
  texture: string;
  name: string;
  type: ClientType;
  /** base subscription per sprint, before the idea and the links */
  pay: number;
  /** the block this client is waiting for */
  want: string;
  /** …and the version of it: 1 — the block itself, more — a rework the client asked for */
  wantLevel: number;
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
  /** Completed non-building projects; these do not have a cell on the sheet. */
  projects?: string[];
  came: number;
  left: number;
  /** clients that closed by themselves: a startup like yours ran out of money first */
  closed: number;
  reasons: string[];
  mrr: number;
  tokens: number;
  debt: number;
  down: boolean;
}

export type RunEvent =
  | { type: 'researched'; kind: ResearchKind }
  | { type: 'card-applied'; id: string }
  | { type: 'task-cancelled'; id: string; block?: string }
  | { type: 'work'; agent: number; lane: Lane; i?: number; j?: number; idle?: boolean }
  | { type: 'placed'; kind: string; i: number; j: number }
  | { type: 'built'; kind: string; i: number; j: number }
  | { type: 'live'; kind: string }
  | { type: 'release'; report: Report }
  | { type: 'client'; id: number }
  /** `closed` — nothing was wrong with the product: the client itself is no more */
  /** `say` — its own parting words, when it leaves over a dilemma */
  | {
      type: 'left';
      id: number;
      name: string;
      reason: string;
      closed?: boolean;
      demo?: boolean;
      say?: string;
    }
  /** the demo day: something shipped and people came to look — or nothing did, and `name` walked out */
  | { type: 'demo'; ok: boolean; name: string }
  /** a promised block finished by hand in the last sprint of its term */
  | { type: 'hero'; id: number }
  /** the founder asked the buyer for the whole valuation */
  | { type: 'haggle'; ok: boolean; price: number }
  | { type: 'dilemma'; id: string }
  /** `text` — what the news line says about the answer; empty for a refusal */
  | { type: 'answered'; id: string; option: number; text: string }
  /** a lie came out */
  | { type: 'exposed'; text: string }
  | { type: 'reveal'; kind: string }
  /** the market wants something new: one more block joins what clients ask for */
  | { type: 'trend'; kind: string }
  /** a block is taken off the sheet */
  | { type: 'razed'; kind: string }
  /** a happy client asks to improve a block: it waits for version `level` */
  | { type: 'rework'; id: number; kind: string; level: number }
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
  /** levels of the founder's traits this startup is played with */
  traits: Readonly<Record<string, number>>;
  /** seconds since the start */
  t: number;
  /** the sprint that is running now, from 1 */
  sprint: number;
  sprintT: number;
  money: number;
  stage: number;
  blocks: Block[];
  tasks: WorkTask[];
  apiShipped: string[];
  nextTask: number;
  draft: string[] | null;
  claimedGrants: string[];
  strategy: { support: 'mass' | 'premium' | null; processing: 'batch' | 'instant' | null };
  cardStacks: CardStacks;
  infrastructure: number;
  land: number;
  desks: number;
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
  /** the blocks this startup can build besides the base three: a different set every time */
  pool: string[];
  /** what this market asks for; hidden until research reveals it */
  asks: string[];
  corpAsks: string[];
  known: string[];
  clients: Client[];
  market: MarketState;
  research: ResearchState;
  /** the product is down this sprint: nobody pays */
  down: boolean;
  /** what brought it down: the founder's own debt or the model supplier's outage */
  downWhy: 'debt' | 'supplier' | null;
  offer: number | null;
  /** a client on the line, asking about a block that is not there; it takes its place when answered */
  call: Client | null;
  /** a choice waiting for an answer until the release; `client` — whom it is about, 0 — nobody */
  dilemma: { id: string; client: number; name: string } | null;
  /** the last dilemmas shown: they are not repeated at once */
  seen: string[];
  /** lies that may still come out */
  risks: { left: number; p: number; n: number; say: string; text: string }[];
  /** the money is gone and the bank offers this much for the flat; the clock waits for the answer */
  lastChance: number | null;
  mortgaged: boolean;
  /** what the news did and how long it lasts; `mod` is the same thing multiplied out, read every step */
  mods: Mod[];
  mod: { tokens: number; price: number; promo: number };
  /** sprints before the news may strike again */
  newsWait: number;
  recentNews: string[];
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
    /** the most links the product ever had at once */
    links: number;
    /** reworks shipped on clients' requests */
    reworks: number;
    heroes: number;
    /** corners Claude offered to cut, and how many of them the founder agreed to */
    offered: number;
    shortcuts: number;
    /** what the company was valued at by the last release it was up for */
    value: number;
  };
  nextId: number;
  /** agents are numbered in the order they are hired */
  nextAgent: number;
  /** what is shipped, the links between it and what it gives: recounted at every release, read every step */
  live: Set<string>;
  /** hosting of everything shipped, $ per second */
  host: number;
  linkCount: number;
  eff: Effects;
}

interface Effects {
  patience: number;
  /** places for clients the shipped blocks add to those of the stage */
  seats: number;
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

/** Three cards of each deck to choose from; `runs` — startups behind the founder: some cards come only with experience. */
export function dealIdea(
  seed: number,
  runs = 99,
): { tech: TechCard[]; form: FormCard[]; aud: AudCard[] } {
  const rng = createRng(seed);
  const open = <T extends { unlock: number }>(deck: readonly T[]): T[] =>
    deck.filter((c) => c.unlock <= runs);
  return {
    tech: shuffle(rng, open(IDEAS.tech)).slice(0, 3),
    form: shuffle(rng, open(IDEAS.form)).slice(0, 3),
    aud: shuffle(rng, open(IDEAS.aud)).slice(0, 3),
  };
}

const TRAIT_STEP = Object.fromEntries(traitsData.map((t) => [t.id, t.per_level])) as Record<
  string,
  number
>;

/** what a trait of the founder adds in this startup: its level times the step of the trait */
function trait(run: Run, id: string): number {
  return (run.traits[id] ?? 0) * (TRAIT_STEP[id] ?? 0);
}

/** «Голосовой ИИ-тиндер для стоматологий», “Voice AI Tinder for dental clinics” */
export function pitch(idea: Idea): string {
  return L(
    `${idea.tech.adj} ИИ-${idea.form.name} для ${idea.aud.name}`,
    `${idea.tech.adj} AI ${idea.form.name} for ${idea.aud.name}`,
  );
}

export function createRun(
  seed: number,
  idea: Idea,
  perks: readonly string[] = [],
  traits: Readonly<Record<string, number>> = {},
): Run {
  const rng = createRng(seed);
  const askable = Object.keys(RULES).filter((k) => RULES[k].role === 'ask');
  const corp = Object.keys(RULES).filter((k) => RULES[k].role === 'corp');
  const asks = shuffle(rng, askable).slice(0, 3);
  const corpAsks = shuffle(rng, corp).slice(0, TUNING.corp_asks);
  // the toolkit of this startup: what the market asks for, two blocks that add places for clients,
  // and a random handful of the rest — never all of them
  const others = shuffle(
    rng,
    Object.keys(RULES).filter((k) => RULES[k].role !== 'base'),
  );
  const must = new Set([...asks, ...corpAsks]);
  if (perks.includes('cheapEarly')) must.add('cheap');
  for (const k of others)
    if (EFFECTS[k]?.seats && [...must].filter((x) => EFFECTS[x]?.seats).length < 2) must.add(k);
  const pool = [...must, ...others.filter((k) => !must.has(k))].slice(0, TUNING.pool_size);
  const run: Run = {
    seed,
    rng,
    idea,
    perks,
    traits,
    t: 0,
    sprint: 1,
    sprintT: 0,
    money:
      TUNING.start_money +
      (perks.includes('cash') ? 1500 : 0) +
      (traits.network ?? 0) * (TRAIT_STEP.network ?? 0),
    stage: 1,
    blocks: [],
    tasks: [],
    apiShipped: [],
    nextTask: 1,
    draft: null,
    claimedGrants: [],
    strategy: { support: null, processing: null },
    cardStacks: {},
    infrastructure: 0,
    land: 0,
    desks: 0,
    agents: [{ id: 1, tier: 'fast', lane: 'build', carry: 0 }],
    review: 'build',
    reviewLocked: false,
    debt: 0,
    energy: TUNING.crunch.max,
    leads: 0,
    insight: 0,
    pool,
    asks,
    corpAsks,
    known: [],
    clients: [],
    market: createMarket(['core', 'landing', 'pay', ...pool], seed),
    research: createResearch(),
    down: false,
    downWhy: null,
    offer: null,
    call: null,
    dilemma: null,
    seen: [],
    risks: [],
    lastChance: null,
    mortgaged: false,
    mods: [],
    mod: { tokens: 1, price: 1, promo: 1 },
    newsWait: 0,
    recentNews: [],
    events: [],
    over: null,
    lastReport: null,
    stats: {
      clients: 0,
      left: 0,
      downs: 0,
      peakMrr: 0,
      shipped: 0,
      corp: 0,
      soldFor: 0,
      tokens: 0,
      firstClientAt: 0,
      profitAt: 0,
      promises: 0,
      kept: 0,
      broken: 0,
      links: 0,
      reworks: 0,
      heroes: 0,
      offered: 0,
      shortcuts: 0,
      value: 0,
    },
    nextId: 1,
    nextAgent: 2,
    live: new Set(),
    host: 0,
    linkCount: 0,
    eff: {
      patience: 0,
      seats: 0,
      word_of_mouth: 1,
      corp_pay: 1,
      small_pay: 1,
      promo: 1,
      tokens: 1,
    },
  };
  // what the founder learned in earlier startups
  if (perks.includes('template')) {
    run.blocks.push({
      kind: 'core',
      i: 0,
      j: 0,
      done: workNeed(run, 'core'),
      need: workNeed(run, 'core'),
      built: true,
      live: true,
      level: 1,
      up: false,
      hand: false,
    });
  }
  if (perks.includes('posts')) run.leads = 1;
  if (perks.includes('buyers')) run.known.push(run.corpAsks[0]);
  if (perks.includes('ear')) run.known.push(run.asks[0]);
  for (const [id, perk, amount] of [['small', 'ear', TUNING.lessons.ear_leads], ['large', 'buyers', TUNING.lessons.buyers_leads]] as const) {
    if (perks.includes(perk)) {
      for (const profile of run.market.groups.find(group => group.id === id)!.profiles)
        profile.leads = amount * profile.share / 100;
    }
  }
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
  run.host = strategyHosting(run);
  // a reworked block is a bigger block: every version adds to its hosting
  for (const b of run.blocks)
    if (b.live) run.host += RULES[b.kind].host * (1 + TUNING.rework.host_mult * (b.level - 1));
  run.linkCount = links(run).length;
  run.stats.links = Math.max(run.stats.links, run.linkCount);
  const eff: Effects = {
    patience: 0,
    seats: 0,
    word_of_mouth: 1,
    corp_pay: 1,
    small_pay: 1,
    promo: 1,
    tokens: 1,
  };
  const effects = [
    ...run.blocks.filter((b) => b.live).map((b) => blockEffects(b.kind, b.level)),
    ...strategyEffects(run),
  ];
  for (const e of effects) {
    for (const [name, v] of Object.entries(e)) {
      const key = name as keyof Effects;
      eff[key] = key === 'patience' || key === 'seats' ? eff[key] + v : key === 'small_pay' || key === 'corp_pay' ? eff[key] + v - 1 : eff[key] * v;
    }
  }
  eff.tokens = Math.max(PRODUCTION.minimum_token_mult, eff.tokens);
  run.eff = eff;
}

/** Rebuilds derived values after loading; does not advance time or consume randomness. */
export function refreshRun(run: Run): void {
  run.tasks ??= [];
  run.apiShipped ??= [];
  run.nextTask ??= 1;
  run.draft ??= null;
  run.claimedGrants ??= [];
  run.strategy ??= { support: null, processing: null };
  restoreCardStacks(run);
  run.infrastructure ??= 0;
  run.land ??= 0;
  run.desks ??= Math.max(0, run.agents.length - OFFICE.desks.base);
  run.market ??= createMarket(['core', 'landing', 'pay', ...run.pool]);
  normalizeMarket(run.market);
  run.research ??= createResearch();
  run.recentNews ??= [];
  syncProduction(run);
  refresh(run);
  run.mod = { tokens: 1, price: 1, promo: 1 };
  for (const m of run.mods) run.mod[m.kind] *= m.mult;
}

/** how many squares of work a block takes in this run */
export function workNeed(run: Run, kind: string): number {
  return Math.ceil(
    RULES[kind].work *
      run.idea.tech.work *
      run.idea.form.work *
      Math.max(TUNING.min_work_mult, 1 - trait(run, 'engineering')),
  );
}

/** Pairs of live blocks that stand side by side and are friends: «лендинг + оплата». */
export function links(run: Run): [string, string][] {
  const out: [string, string][] = [];
  const live = run.blocks.filter((b) => b.live);
  for (const a of live) {
    for (const b of live) {
      if (a.kind >= b.kind) continue;
      if (Math.abs(a.i - b.i) + Math.abs(a.j - b.j) !== 1) continue;
      if (RULES[a.kind].friends.includes(b.kind) || RULES[b.kind].friends.includes(a.kind))
        out.push([a.kind, b.kind]);
    }
  }
  return out;
}

export function priceMult(run: Run): number {
  return (
    run.idea.tech.price *
    run.idea.form.price *
    (1 + linkBonus(run) * run.linkCount) *
    run.mod.price *
    (1 + trait(run, 'sales'))
  );
}

export function linkBonus(run: Run): number {
  return TUNING.link_bonus + (run.perks.includes('arch') ? TUNING.lessons.arch_link_bonus : 0);
}

/** what a client is worth per sprint: its subscription at today's prices, whether it pays right now or not */
function clientWorth(run: Run, c: Client): number {
  const own = CLIENT_RULE[c.type].asks === 'corp' ? run.eff.corp_pay : run.eff.small_pay;
  const segment = c.type === 'corp' || c.type === 'gov' ? 'large' : c.type === 'mid' ? 'medium' : 'small';
  return c.pay * c.deal * priceMult(run) * own * segmentRevenueMultiplier(run, segment) * (c.happy ? TUNING.clients.happy_bonus : 1);
}

/** the contract is still being approved: this client pays nothing until its block ships */
export function signing(c: Client): boolean {
  return !c.happy && !CLIENT_RULE[c.type].pays_waiting;
}

/** what a client pays per sprint right now */
export function clientPay(run: Run, c: Client): number {
  if (run.down || !isLive(run, 'pay') || signing(c)) return 0;
  return clientWorth(run, c);
}

/** squares of research before the market says one more thing it wants */
export function researchNeed(run: Run): number {
  return Math.max(1, RESEARCH.work[run.research.active ?? 'clients'] * run.idea.tech.research);
}

export function startResearch(run: Run, kind: ResearchKind): boolean {
  if (run.over || run.draft) return false;
  return beginResearch(run.research, kind, run.market);
}

/** what a client costs in tokens per sprint: free users burn them too */
export function clientTokens(run: Run, c: Client): number {
  // Usage follows account size; raising the price or fulfilling a promise cannot raise token use.
  return (
    c.pay *
    TUNING.clients.token_share *
    run.idea.tech.tokens *
    run.eff.tokens *
    run.mod.tokens
  );
}

export function mrr(run: Run): number {
  let sum = companyTotals(run).income;
  for (const c of run.clients) sum += clientPay(run, c);
  return sum;
}

export function tokens(run: Run): number {
  let sum = companyTotals(run).tokens;
  for (const c of run.clients) sum += clientTokens(run, c);
  return sum;
}

/** An agent is paid for the tokens it burns: one with nothing to do on its lane burns none. */
export function agentCost(run: Run): number {
  let sum = 0;
  for (const a of run.agents) if (busy(run, a)) sum += TUNING.tiers[a.tier].cost_per_s;
  return sum;
}

/** the agent has work on its lane right now */
export function busy(run: Run, a: Agent): boolean {
  return handy(run, a.lane);
}

export function burnPerS(run: Run): number {
  const f = flows(run);
  return f.living + f.agents + f.hosting + f.tokens;
}

/** Where the money goes and comes from, $ per second: the sheet shows every line of it. */
export function flows(run: Run): {
  living: number;
  agents: number;
  hosting: number;
  tokens: number;
  income: number;
} {
  return {
    living: TUNING.living_per_s * (1 - trait(run, 'thrift')),
    agents: agentCost(run),
    // every shipped block has to be hosted and kept alive: a feature is a commitment
    hosting: (run.host + MARKET.capacity.hosting_per_expansion * run.infrastructure) * (1 - trait(run, 'thrift')),
    tokens: tokens(run) / TUNING.sprint_s,
    income: mrr(run) / TUNING.sprint_s,
  };
}

export function incomePerS(run: Run): number {
  return mrr(run) / TUNING.sprint_s;
}

export function netPerS(run: Run): number {
  return incomePerS(run) - burnPerS(run);
}

/** How many clients the startup can serve: the stage gives some places, support and onboarding blocks add more. */
export function clientsMax(run: Run): number {
  return Math.min(TUNING.clients.slots, stageRule(run).clients_max + run.eff.seats);
}

export function stageRule(run: Run): (typeof TUNING.stages)[number] {
  return TUNING.stages[run.stage - 1];
}

/** Paid land expansions eventually fit the startup's whole toolkit. */
export function cellsMax(run: Run): number {
  return Math.min(run.pool.length + 3, stageRule(run).cells_max + run.land * OFFICE.land.cells);
}

export function agentSlots(run: Run): number { return Math.min(OFFICE.desks.max, OFFICE.desks.base + run.desks); }

export function officeQuote(run: Run, kind: 'land' | 'desks'): number | null {
  const rule = OFFICE[kind];
  if (run.over || run.draft || (kind === 'land' ? cellsMax(run) >= run.pool.length + 3 || run.land >= OFFICE.land.max : agentSlots(run) >= OFFICE.desks.max)) return null;
  return Math.round(rule.cost * rule.growth ** run[kind]);
}

export function expandOffice(run: Run, kind: 'land' | 'desks'): boolean {
  const cost = officeQuote(run, kind);
  if (cost === null || run.money < cost) return false;
  run.money -= cost;
  run[kind]++;
  return true;
}

/** Cells the next block may stand on: inside the sheet of this stage, next to what is already there. */
export function freeCells(run: Run): { i: number; j: number }[] {
  if (run.blocks.length === 0) return [{ i: 0, j: 0 }];
  if (run.blocks.length >= cellsMax(run)) return [];
  const r = Math.max(stageRule(run).radius, run.land > 0 ? 2 : 1);
  const taken = new Set(run.blocks.map((b) => `${b.i},${b.j}`));
  const out: { i: number; j: number }[] = [];
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      // the sheet of the product is a diamond: its far corners are cut off
      if (Math.abs(i) + Math.abs(j) > r + 1) continue;
      if (taken.has(`${i},${j}`)) continue;
      if (
        taken.has(`${i + 1},${j}`) ||
        taken.has(`${i - 1},${j}`) ||
        taken.has(`${i},${j + 1}`) ||
        taken.has(`${i},${j - 1}`)
      )
        out.push({ i, j });
    }
  }
  return out;
}

/** Blocks that can be started now, in the order of the shelf. */
export function shelf(run: Run): string[] {
  if (run.blocks.length === 0) return ['core'];
  const placed = new Set(run.blocks.map((b) => b.kind));
  const mine = (k: string): boolean => RULES[k].role === 'base' || run.pool.includes(k);
  return Object.keys(RULES).filter(
    (k) =>
      mine(k) &&
      !placed.has(k) &&
      (RULES[k].stage <= run.stage || (k === 'cheap' && run.perks.includes('cheapEarly'))),
  );
}

export function sites(run: Run): Block[] {
  return run.blocks.filter(isSite);
}

/** work still goes into this block: it is being built, or reworked on a client's request */
export function isSite(b: Block): boolean {
  return !b.queued && (!b.built || (b.up && b.done < b.need));
}

/** the client has what it waits for: the block is shipped, in the version it asked for */
export function satisfied(run: Run, c: Client): boolean {
  const b = run.blocks.find((x) => x.kind === c.want);
  return b !== undefined && b.live && b.level >= c.wantLevel;
}

export function fulfillClient(run: Run, c: Client): void {
  if (!satisfied(run, c)) return;
  if (!c.happy && c.wantLevel > 1) c.deal *= TUNING.rework.pay_mult;
  if (c.promised) {
    c.promised = false;
    run.stats.kept++;
    run.events.push({ type: 'kept', id: c.id });
    if (c.patience === 1 && run.blocks.find((b) => b.kind === c.want)?.hand) {
      c.deal = TUNING.hero.deal;
      run.leads += TUNING.hero.leads;
      run.stats.heroes++;
      run.events.push({ type: 'hero', id: c.id });
    }
  }
  c.happy = true;
}

/** squares of work a rework takes: each next version of a block is a bigger job */
export function reworkNeed(run: Run, b: Block): number {
  return upgradeWork(workNeed(run, b.kind), b.level);
}

/** Reworks clients are waiting for and nobody has started yet, with the names of those who asked. */
export function reworks(run: Run): { kind: string; level: number; who: string[] }[] {
  const out: { kind: string; level: number; who: string[] }[] = [];
  for (const c of run.clients) {
    if (c.happy || c.wantLevel < 2) continue;
    const b = run.blocks.find((x) => x.kind === c.want);
    if (!b || !b.live || b.up || plannedWork(run, b.kind) || b.level >= c.wantLevel) continue;
    const row = out.find((r) => r.kind === c.want);
    if (row) row.who.push(c.name);
    else out.push({ kind: c.want, level: c.wantLevel, who: [c.name] });
  }
  return out;
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
  if (run.over || run.draft || !shelf(run).includes(kind)) return false;
  if (!freeCells(run).some((c) => c.i === i && c.j === j)) return false;
  const work = workNeed(run, kind);
  run.blocks.push({
    kind,
    i,
    j,
    done: 0,
    need: work,
    built: false,
    live: false,
    level: 1,
    up: false,
    hand: false,
    queued: true,
  });
  enqueueTask(run, {
    kind: 'build',
    block: kind,
    level: 1,
    work,
    cost: projectCost(run, work),
  });
  run.events.push({ type: 'placed', kind, i, j });
  return true;
}

/**
 * Takes a shipped block off the sheet to make room: what it gave is gone at once, and the clients
 * that came for it start to wait again. The core stays: without it there is no product.
 */
export function demolish(run: Run, kind: string): boolean {
  const b = run.blocks.find((x) => x.kind === kind);
  if (
    run.over ||
    run.draft ||
    !b ||
    !b.live ||
    b.up ||
    plannedWork(run, kind) ||
    RULES[kind].role === 'base'
  )
    return false;
  run.blocks = run.blocks.filter((x) => x !== b);
  refresh(run);
  for (const c of run.clients) {
    if (c.want !== kind || !c.happy) continue;
    c.happy = false;
    c.wantLevel = 1;
    c.patience = Math.max(1, CLIENT_RULE[c.type].patience + run.eff.patience);
  }
  run.events.push({ type: 'razed', kind });
  return true;
}

/** Starts the rework a client asked for: the shipped block goes back to the site and keeps working meanwhile. */
export function upgrade(run: Run, kind: string): boolean {
  const b = run.blocks.find((x) => x.kind === kind);
  if (
    run.over ||
    run.draft ||
    !b ||
    !b.live ||
    b.up ||
    plannedWork(run, kind) ||
    b.level >= PRODUCTION.max_level
  )
    return false;
  const work = reworkNeed(run, b);
  enqueueTask(run, {
    kind: 'upgrade',
    block: kind,
    level: b.level + 1,
    work,
    cost: projectCost(run, work, b.level + 1),
  });
  run.events.push({ type: 'placed', kind, i: b.i, j: b.j });
  return true;
}

export function setLane(run: Run, agentId: number, lane: Lane): void {
  if (run.over || run.draft) return;
  const a = run.agents.find((x) => x.id === agentId);
  if (a) a.lane = lane;
}

/** The founder picks what to check; the choice holds until the release. */
export function setReview(run: Run, lane: Lane): boolean {
  if (run.over || run.draft || run.reviewLocked || run.review === lane) return false;
  run.review = lane;
  run.reviewLocked = true;
  return true;
}

export function canHire(run: Run, tier: Tier): boolean {
  const rule = stageRule(run);
  return (
    !run.over && !run.draft && run.agents.length < agentSlots(run) && rule.tiers.includes(tier) && run.money >= OFFICE.hire[tier]
  );
}

export function hire(run: Run, tier: Tier): boolean {
  if (!canHire(run, tier)) return false;
  run.money -= OFFICE.hire[tier];
  run.agents.push({ id: run.nextAgent++, tier, lane: 'build', carry: 0 });
  return true;
}

export function fire(run: Run, agentId: number): void {
  if (run.over || run.draft) return;
  run.agents = run.agents.filter((a) => a.id !== agentId);
}

/**
 * The founder does a square of work by hand, on any lane: codes into the site (and leaves some debt),
 * fixes, writes a post or calls a client. One point of strength each.
 */
export function crunch(run: Run, lane: Lane = 'build'): boolean {
  if (run.over || run.draft || run.energy < 1 || !handy(run, lane)) return false;
  run.energy -= 1;
  switch (lane) {
    case 'build': {
      run.debt += TUNING.crunch.debt;
      work(run, 0, true);
      break;
    }
    case 'fix':
      run.debt = Math.max(0, run.debt - TUNING.fix_per_work);
      run.events.push({ type: 'work', agent: 0, lane });
      break;
    case 'promo':
      run.leads += leadsPerWork(run);
      run.events.push({ type: 'work', agent: 0, lane });
      break;
    case 'research':
      run.events.push({ type: 'work', agent: 0, lane });
      interview(run);
      break;
  }
  return true;
}

/** there is something for a pair of hands to do on this lane right now */
export function handy(run: Run, lane: Lane): boolean {
  switch (lane) {
    case 'build':
      return hasWork(run);
    case 'fix':
      return run.debt > 0;
    case 'promo':
      return sellable(run);
    case 'research':
      return run.research.active !== null && researchAvailable(run.research, run.research.active, run.market);
  }
}

/** what the market wants and the founder does not know yet */
export function unknownAsks(run: Run): string[] {
  return [...run.asks, ...(run.stage >= 2 ? run.corpAsks : [])].filter(
    (k) => !run.known.includes(k),
  );
}

/** how much of a lead one square of promotion is */
export function leadsPerWork(run: Run): number {
  const trust = (1 + TUNING.logos.promo * logos(run)) * (1 + trait(run, 'marketing'));
  return (
    (run.idea.tech.hype *
      run.idea.form.hype *
      run.idea.aud.hype *
      run.eff.promo *
      run.mod.promo *
      trust) /
    TUNING.promo_work_per_lead
  );
}

/** One square of research: enough of them and the market names one more block it wants. */
function interview(run: Run): void {
  const report = advanceResearch(run.research, 1 / Math.max(0.1, run.idea.tech.research), run.market, companyContext(run), run.sprint);
  if (!report) return;
  if (report.kind === 'clients') run.known = [...new Set([...run.known, ...run.asks, ...run.corpAsks])];
  run.insight = 0;
  run.events.push({ type: 'researched', kind: report.kind });
}

function work(run: Run, agent: number, hand = false): boolean {
  const task = startWork(run);
  if (!task) return false;
  const site = task.block ? run.blocks.find((b) => b.kind === task.block) : undefined;
  run.events.push({ type: 'work', agent, lane: 'build', i: site?.i, j: site?.j });
  addProductionWork(run, hand);
  return true;
}

export type OfferAnswer = 'sell' | 'haggle' | 'no';

/**
 * The buyer is on the line with a bid below the valuation. Sell at the bid, refuse — or ask for the
 * whole valuation: the cleaner the code, the likelier the buyer agrees; if not, he hangs up.
 */
export function answerOffer(run: Run, answer: OfferAnswer): void {
  if (run.offer === null || run.over || run.draft) return;
  const bid = run.offer;
  run.offer = null;
  if (answer === 'no') return;
  if (answer === 'haggle') {
    const ok = run.rng.next() < haggleChance(run);
    const price = ok ? valuation(run) : bid;
    run.events.push({ type: 'haggle', ok, price });
    if (!ok) return;
    run.stats.soldFor = price;
  } else run.stats.soldFor = bid;
  end(run, 'sold');
}

/** what a dollar of subscriptions is worth to a buyer: links and reworks raise it, debt lowers it */
export function valueMult(run: Run): number {
  const V = TUNING.valuation;
  let levels = 0;
  for (const b of run.blocks) if (b.live) levels += b.level - 1;
  return Math.min(
    V.max,
    Math.max(
      V.min,
      V.base + V.per_link * run.linkCount + V.per_level * levels - V.per_debt * run.debt,
    ),
  );
}

/** The company's price tag: the goal of the third stage. */
export function valuation(run: Run): number {
  return Math.round((mrr(run) * valueMult(run)) / 100) * 100;
}

/** the chance the buyer pays the whole valuation when asked */
export function haggleChance(run: Run): number {
  const V = TUNING.valuation;
  return Math.max(V.haggle_min, V.haggle_clean - (run.debt / TUNING.debt.down_at) * V.haggle_debt);
}

/** the release of this sprint is watched by everyone */
export function isDemo(run: Run, sprint: number = run.sprint): boolean {
  return run.stage >= TUNING.demo.from_stage && sprint % TUNING.demo.every === 0;
}

/** logos of happy big clients on the landing page: each one makes promotion work better */
export function logos(run: Run): number {
  if (!isLive(run, 'landing')) return 0;
  return Math.min(
    TUNING.logos.max,
    run.clients.filter((c) => c.happy && CLIENT_RULE[c.type].asks === 'corp').length,
  );
}

/**
 * The client on the line asked about a block that is not there. Honest: it signs with a discount.
 * Confident: it pays a premium, but the block must ship before its patience ends.
 */
export function answerCall(run: Run, sure: boolean): void {
  const c = run.call;
  if (!c || run.over || run.draft) return;
  run.call = null;
  if (run.clients.length >= clientsMax(run)) return;
  if (sure) {
    c.deal = TUNING.call.sure_mult;
    c.promised = true;
    c.patience = promiseSprints(run);
    run.stats.promises++;
  } else c.deal = honestMult(run);
  seat(run, c);
}

/** sprints a promised block may take; a founder who has kept his word before is given one more */
export function promiseSprints(run: Run): number {
  return run.perks.includes('word') ? TUNING.call.sure_patience_perk : TUNING.call.sure_patience;
}

/** what an honest «not yet» leaves of the cheque */
export function honestMult(run: Run): number {
  return run.perks.includes('no') ? TUNING.call.honest_mult_perk : TUNING.call.honest_mult;
}

/** seconds of life the bank gives for the flat */
export function mortgageSeconds(run: Run): number {
  return run.perks.includes('banker') ? TUNING.mortgage_s_perk : TUNING.mortgage_s;
}

/** the dilemma on the table, with its words and options */
export function dilemmaOf(run: Run): Dilemma | null {
  return run.dilemma ? (DILEMMAS.find((d) => d.id === run.dilemma?.id) ?? null) : null;
}

function fits(run: Run, d: Dilemma): boolean {
  switch (d.needs) {
    case 'site':
      return hasWork(run);
    case 'sellable':
      return sellable(run);
    case 'client':
      return run.clients.length >= 1;
    case 'clients2':
      return run.clients.length >= 2;
    case 'debt':
      return run.debt >= 10 && run.money >= 600;
    case 'money':
      return sellable(run) && run.money >= 600;
    case 'tired':
      return run.energy < TUNING.crunch.max / 2;
    case 'stage2':
      return run.stage >= 2;
    default:
      return true;
  }
}

/** A new sprint: now and then it starts with a choice. */
function propose(run: Run): void {
  const D = TUNING.dilemma;
  if (run.sprint < D.from_sprint || run.call || run.offer !== null || run.rng.next() >= D.chance)
    return;
  // Tariffs are now a deliberate segment decision in the product panel.
  const pool = DILEMMAS.filter((d) => d.id !== 'price' && !run.seen.includes(d.id) && fits(run, d));
  if (pool.length === 0) return;
  let roll = run.rng.next() * pool.reduce((s, d) => s + d.weight, 0);
  const d = pool.find((x) => (roll -= x.weight) < 0) ?? pool[0];
  // a client's own question is about that client; a rival goes for the one that pays most
  const about =
    d.who === 'client'
      ? run.rng.pick(run.clients)
      : d.who === 'rival'
        ? [...run.clients].sort((a, b) => clientWorth(run, b) - clientWorth(run, a))[0]
        : undefined;
  run.dilemma = { id: d.id, client: about?.id ?? 0, name: about?.name ?? '' };
  run.seen = [...run.seen, d.id].slice(-D.no_repeat);
  if (d.who === 'claude') run.stats.offered++;
  run.events.push({ type: 'dilemma', id: d.id });
}

/** The founder answers; no answer by the release is the refusal — the last option. */
export function answerDilemma(run: Run, option: number): void {
  const d = dilemmaOf(run);
  const about = run.dilemma;
  if (!d || !about || run.over || run.draft) return;
  run.dilemma = null;
  const o = d.options[Math.min(Math.max(option, 0), d.options.length - 1)];
  if (d.who === 'claude' && o !== d.options[d.options.length - 1]) run.stats.shortcuts++;
  const one = run.clients.find((c) => c.id === about.client);
  const walk = (c: Client, say: string): void => {
    run.clients = run.clients.filter((x) => x !== c);
    run.stats.left++;
    run.events.push({ type: 'left', id: c.id, name: c.name, reason: '', say });
  };
  for (const f of o.fx) {
    switch (f.k) {
      case 'work': {
        for (let k = 0; k < f.n; k++) {
          if (!work(run, 0)) break;
        }
        break;
      }
      case 'debt':
        run.debt = Math.max(0, run.debt + f.n);
        break;
      case 'leads':
        run.leads += f.n;
        break;
      case 'money':
        run.money += f.n;
        break;
      case 'energy':
        run.energy = Math.min(TUNING.crunch.max, Math.max(0, run.energy + f.n));
        break;
      case 'mod':
        run.mods = run.mods.filter((m) => m.kind !== f.kind);
        run.mods.push({ kind: f.kind as Mod['kind'], mult: f.mult, left: f.sprints, tag: f.tag });
        run.mod[f.kind as Mod['kind']] = f.mult;
        break;
      case 'deal':
        for (const c of f.who === 'all' ? run.clients : one ? [one] : []) c.deal *= f.mult;
        break;
      case 'leave':
        for (const c of f.who === 'all' ? [...run.clients] : one ? [one] : [])
          if (run.rng.next() < f.p) walk(c, f.say);
        break;
      case 'risk':
        run.risks.push({ left: 3, p: f.p, n: f.n, say: f.say, text: f.text });
        break;
    }
  }
  run.events.push({ type: 'answered', id: d.id, option, text: o.result });
}

/** The money is gone. Mortgaging the flat buys a minute of life, once. */
export function answerLastChance(run: Run, accept: boolean): void {
  if (run.lastChance === null || run.over || run.draft) return;
  if (accept) {
    run.money += run.lastChance;
    run.mortgaged = true;
  } else end(run, 'broke');
  run.lastChance = null;
}

// ---------------------------------------------------------------- time

export function step(run: Run, dt: number): void {
  if (run.sprint > TUNING.last_sprint) finishAtSprintLimit(run);
  // the bank is on the line: the clock waits for the answer
  if (run.over || run.draft || run.lastChance !== null) return;
  if (run.sprint === TUNING.last_sprint)
    dt = Math.min(dt, Math.max(0, TUNING.sprint_s - run.sprintT));
  startWork(run);
  run.t += dt;
  run.money += netPerS(run) * dt;
  run.stats.tokens += (tokens(run) / TUNING.sprint_s) * dt;
  run.energy = Math.min(TUNING.crunch.max, run.energy + dt / TUNING.crunch.regen_s);

  for (const a of run.agents) {
    // nothing to do on the lane: the agent waits, for free
    if (!busy(run, a)) continue;
    a.carry += agentWorkRate(run, a) * dt;
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
      run.lastChance = Math.ceil((-net * mortgageSeconds(run)) / 10) * 10;
      run.events.push({ type: 'lastchance', sum: run.lastChance });
    }
  }
}

/** One square of work arrives where the agent's lane points. */
function deliver(run: Run, a: Agent): void {
  const dirty = agentDebtPerWork(run, a);
  switch (a.lane) {
    case 'build': {
      if (!work(run, a.id)) {
        run.events.push({ type: 'work', agent: a.id, lane: a.lane, idle: true });
        return;
      }
      run.debt += dirty;
      return;
    }
    case 'fix':
      run.events.push({ type: 'work', agent: a.id, lane: a.lane, idle: run.debt <= 0 });
      run.debt = Math.max(0, run.debt - agentFixPerWork(a.tier));
      return;
    case 'promo':
      run.leads += leadsPerWork(run);
      run.debt += dirty * 0.5;
      run.events.push({ type: 'work', agent: a.id, lane: a.lane });
      return;
    case 'research':
      run.events.push({
        type: 'work',
        agent: a.id,
        lane: a.lane,
        idle: !handy(run, 'research'),
      });
      interview(run);
      return;
  }
}

/** A lead becomes a client-to-be: who it is, what it pays and what it waits for. Not on the sheet yet. */
function makeClient(run: Run): Client {
  const count = (type: ClientType): number => run.clients.filter((c) => c.type === type).length;
  // a founder with a name on the market is found by a bigger first client
  const known = run.perks.includes('name') && run.stats.clients === 0;
  const rule =
    (known ? CLIENT_RULE.mid : undefined) ??
    CLIENT_TYPES.find(
      (t) =>
        run.stage >= t.from_stage &&
        count(t.id) < t.max &&
        (t.chance >= 1 || run.rng.next() < t.chance),
    ) ??
    CLIENT_RULE.small;

  const taken = new Set(run.clients.map((c) => c.name));
  const all =
    rule.pool === 'aud'
      ? run.idea.aud.clients.map((name) => ({ name, texture: run.idea.aud.texture }))
      : IDEAS[rule.pool];
  const pool = all.filter((c) => !taken.has(c.name));
  const who = run.rng.pick(pool.length > 0 ? pool : all);
  let name = who.name;
  if (pool.length === 0) {
    // the names ran out: the same business opens another branch
    const tails = [' II', ' III', ' IV'];
    name += tails.find((x) => !taken.has(name + x)) ?? tails[0];
  }
  // how long this market waits: the idea, the shipped blocks and, for its own audience, the audience itself
  const patience =
    rule.patience +
    run.idea.tech.patience +
    run.idea.form.patience +
    run.eff.patience +
    (rule.pool === 'aud' ? run.idea.aud.patience : 0);
  return {
    id: run.nextId++,
    texture: who.texture,
    name,
    type: rule.id,
    pay: rule.pay > 0 ? rule.pay : run.idea.aud.pay * rule.aud_mult,
    want: run.rng.pick(rule.asks === 'corp' ? run.corpAsks : run.asks),
    wantLevel: 1,
    patience: Math.max(1, patience),
    happy: false,
    slot: -1,
    deal: 1,
    promised: false,
  };
}

/** The client takes its place on the sheet and starts to count. */
function seat(run: Run, client: Client): void {
  const used = new Set(run.clients.map((c) => c.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  client.slot = slot;
  client.happy = satisfied(run, client);
  if (client.happy && client.promised) {
    // built while the phone was ringing: the promise is already kept
    client.promised = false;
    run.stats.kept++;
  }
  run.clients.push(client);
  run.stats.clients++;
  if (CLIENT_RULE[client.type].asks === 'corp') run.stats.corp++;
  if (run.stats.firstClientAt === 0) run.stats.firstClientAt = run.t;
  run.events.push({ type: 'client', id: client.id });
}

/** The end of a sprint: what is built ships, the market answers. */
function release(run: Run): void {
  const C = TUNING.clients;
  const report: Report = {
    sprint: run.sprint,
    shipped: [...new Set(run.apiShipped.filter((kind) => kind !== 'infrastructure'))],
    came: 0,
    left: 0,
    closed: 0,
    reasons: [],
    mrr: 0,
    tokens: 0,
    debt: 0,
    down: false,
  };
  const completed = takeReleasedTasks(run);
  report.projects = [
    ...new Set([
      ...completed
        .filter((task) => task.kind === 'card' || task.kind === 'infrastructure')
        .map((task) => task.card ?? task.kind),
      ...run.apiShipped.filter((kind) => kind === 'infrastructure'),
    ]),
  ];
  run.apiShipped = [];

  for (const b of run.blocks) {
    if (shipBlock(run, b) && !report.shipped.includes(b.kind)) report.shipped.push(b.kind);
  }
  refresh(run);

  // too much debt: the product is down for the whole next sprint
  if (run.debt >= TUNING.debt.down_at) {
    run.down = true;
    run.downWhy = 'debt';
    run.debt -= TUNING.debt.down_relief;
    run.stats.downs++;
    run.events.push({ type: 'down' });
  } else {
    run.down = false;
    run.downWhy = null;
  }

  news(run);
  for (const task of completed) {
    if (task.kind === 'card' && task.card) releaseCard(run, task.card);
    if (task.kind === 'infrastructure') run.infrastructure++;
  }
  refreshRun(run);

  // nobody picked up: the client on the line is gone
  if (run.call) {
    run.events.push({ type: 'hungup', name: run.call.name });
    run.call = null;
  }

  // clients who got what they waited for stay; the rest lose patience
  const stay: Client[] = [];
  for (const c of run.clients) {
    const churn = CLIENT_RULE[c.type].churn;
    if (churn > 0 && run.rng.next() < churn) {
      // a startup like yours: it ran out of money first, and nothing in the product could have kept it
      report.closed++;
      run.stats.left++;
      run.events.push({ type: 'left', id: c.id, name: c.name, reason: '', closed: true });
      continue;
    }
    if (satisfied(run, c)) {
      fulfillClient(run, c);
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

  // nobody answered: the refusal it is
  const pending = dilemmaOf(run);
  if (pending) answerDilemma(run, pending.options.length - 1);

  // a lie may come out: those who believed it walk out
  for (const r of run.risks) {
    r.left--;
    if (run.rng.next() >= r.p) continue;
    r.left = 0;
    run.events.push({ type: 'exposed', text: r.text });
    for (const c of run.clients.slice(0, r.n)) {
      report.left++;
      report.reasons.push('');
      run.stats.left++;
      run.events.push({ type: 'left', id: c.id, name: c.name, reason: '', say: r.say });
    }
    run.clients = run.clients.slice(r.n);
  }
  run.risks = run.risks.filter((r) => r.left > 0);

  // the demo day: everyone watches this release. Something shipped — people come to look; nothing — one walks out
  if (isDemo(run) && run.clients.length > 0) {
    const stable =
      netPerS(run) >= 0 &&
      !run.down &&
      (run.sprint > TUNING.last_sprint ||
        (shelf(run).length === 0 && run.blocks.every((b) => b.level >= PRODUCTION.max_level)));
    if (report.shipped.length > 0 || report.projects.length > 0 || stable) {
      run.leads += TUNING.demo.leads;
      run.events.push({
        type: 'demo',
        ok: true,
        name: report.shipped[0] ?? report.projects[0] ?? L('стабильная прибыль', 'steady profit'),
      });
    } else {
      const c = run.clients.find((x) => !x.happy) ?? run.rng.pick(run.clients);
      run.clients = run.clients.filter((x) => x !== c);
      report.left++;
      report.reasons.push('');
      run.stats.left++;
      run.events.push({ type: 'demo', ok: false, name: c.name });
      run.events.push({ type: 'left', id: c.id, name: c.name, reason: '', demo: true });
    }
  }

  // the market moves on: on schedule one more block of the toolkit becomes something clients ask for
  if (TUNING.trends.at.includes(run.sprint)) {
    const next = run.pool.filter((k) => RULES[k].role === 'ask' && !run.asks.includes(k));
    if (next.length > 0) {
      const kind = run.rng.pick(next);
      run.asks.push(kind);
      // Public signals name a change; an interview identifies the new request.
    }
  }

  // a happy client finds something to improve: it says which block, and waits for the new version
  const R = TUNING.rework;
  if (run.stage >= R.from_stage) {
    let pending = run.clients.filter((c) => !c.happy && c.wantLevel > 1).length;
    for (const c of run.clients) {
      if (pending >= R.max_pending) break;
      if (!c.happy || c.promised || run.rng.next() >= R.chance) continue;
      const own = run.blocks.find((b) => b.kind === c.want);
      const open = run.blocks.filter((b) => b.live && b.level < PRODUCTION.max_level);
      const b =
        own && own.level < PRODUCTION.max_level ? own : open.length > 0 ? run.rng.pick(open) : undefined;
      if (!b) continue;
      c.want = b.kind;
      c.wantLevel = b.level + 1;
      c.happy = false;
      c.patience = Math.max(1, R.patience + run.eff.patience);
      pending++;
      run.events.push({ type: 'rework', id: c.id, kind: b.kind, level: c.wantLevel });
    }
  }

  let marketLeads = 0;
  if (sellable(run)) {
    const wom = C.word_of_mouth * run.eff.word_of_mouth * run.idea.form.viral;
    for (const c of run.clients) {
      if (c.happy && run.rng.next() < wom) run.leads += 1;
    }
    // the very first client is an acquaintance: no promotion needed
    if (run.stats.clients === 0) run.leads = Math.max(run.leads, 1);
    const max = clientsMax(run);
    // One lead can become a named key account; the rest enters the scalable market.
    marketLeads = Math.max(0, run.leads - (run.clients.length < max ? 1 : 0));
    run.leads -= marketLeads;
    while (run.leads >= 1 && run.clients.length < max) {
      run.leads -= 1;
      const c = makeClient(run);
      // a client that needs what is not there may call first and ask; it comes when the founder answers
      if (
        run.call === null &&
        run.stage >= 2 &&
        !isLive(run, c.want) &&
        run.rng.next() < TUNING.call.chance
      ) {
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
  }

  if (run.stage === 1 && customerCount(run) > 0 && isLive(run, 'pay')) {
    run.stage = 2;
    run.events.push({ type: 'stage', stage: 2 });
  }
  const signal = evolveMarket(run.market, ['core', 'landing', 'pay', ...run.pool], run.sprint, run.seed);
  if (signal) {
    const group = { small: L('малых компаний', 'small companies'), medium: L('средних компаний', 'medium companies'), large: L('крупных компаний', 'large companies') }[signal.segment];
    const topic = { quality: L('требования к продукту', 'product expectations'), price: L('готовность платить', 'willingness to pay'), demand: L('конкуренция за клиентов', 'competition for customers') }[signal.theme];
    run.events.push({ type: 'news', id: `market-${signal.kind}`, arg: '', good: true,
      text: signal.kind === 'warning'
        ? L(`У ${group} скоро изменятся ${topic}. Следи за обратной связью.`, `For ${group}, ${topic} will change soon. Watch for feedback.`)
        : L(`У ${group} изменились ${topic}. Старые отчёты сохранены; новые исследования доступны.`, `For ${group}, ${topic} have changed. Old reports are kept; new research is available.`) });
  }
  const marketRelease = advanceMarket(run.market, companyContext(run), marketLeads);
  report.came += marketRelease.came;
  report.left += marketRelease.left;
  run.stats.clients += marketRelease.came;
  run.stats.left += marketRelease.left;
  run.stats.corp += run.market.groups.find(group => group.id === 'large')?.came ?? 0;
  if (run.stats.firstClientAt === 0 && customerCount(run) > 0) run.stats.firstClientAt = run.t;

  const income = mrr(run);
  if (run.stage === 2 && income >= TUNING.stage3_mrr) {
    run.stage = 3;
    run.events.push({ type: 'stage', stage: 3 });
  }

  // the buyer calls on schedule, with a bid below what the company is worth
  run.offer = null;
  const V = TUNING.valuation;
  if (income > 0) run.stats.value = valuation(run);
  if (run.stage >= 3 && run.sprint % V.every === 0 && income > 0 && run.sprint < TUNING.last_sprint) {
    run.offer = Math.round((valuation(run) * V.first_bid) / 100) * 100;
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

  if (run.sprint >= TUNING.last_sprint) {
    finishAtSprintLimit(run);
    return;
  }
  run.sprint++;
  run.sprintT = 0;
  run.reviewLocked = false;
  propose(run);
  dealDraft(run);
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
  if (
    run.sprint >= N.from_sprint &&
    run.newsWait <= 0 &&
    run.rng.next() < (run.stage >= 3 ? N.chance_stage3 : N.chance)
  ) {
    const waiting = [...new Set(run.clients.filter((c) => !c.happy).map((c) => c.want))];
    const pool = EVENTS.filter(
      (e) =>
        e.stage <= run.stage &&
        !run.recentNews.includes(e.id) &&
        (e.kind !== 'impatience' || waiting.length > 0) &&
        (e.kind !== 'down' || !run.down),
    );
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
        run.debt = Math.max(0, run.debt + e.add);
        break;
      case 'leads':
        run.leads += e.add;
        break;
      case 'money':
        run.money += e.add;
        break;
      case 'down':
        run.down = true;
        run.downWhy = 'supplier';
        break;
      case 'impatience': {
        const kind = run.rng.pick(waiting);
        // tired of waiting, but not gone yet: the founder still has a sprint to answer
        for (const c of run.clients)
          if (!c.happy && c.want === kind) c.patience = Math.max(1, c.patience - e.add);
        arg = kind;
        break;
      }
    }
    run.newsWait = N.cooldown;
    run.recentNews = [...run.recentNews, e.id].slice(-N.no_repeat);
    const good =
      e.kind === 'leads' ||
      (e.kind === 'money' && e.add > 0) ||
      (e.kind === 'debt' && e.add < 0) ||
      (e.kind === 'price' && e.mult > 1) ||
      (e.kind === 'promo' && e.mult > 1) ||
      (e.kind === 'tokens' && e.mult < 1);
    run.events.push({ type: 'news', id: e.id, text: e.text, arg, good });
  }

  const mod = { tokens: 1, price: 1, promo: 1 };
  for (const m of run.mods) mod[m.kind] *= m.mult;
  run.mod = mod;
}

/** The final release and legacy endless saves use the same result without another draft. */
export function finishAtSprintLimit(run: Run): void {
  if (run.over || run.sprint < TUNING.last_sprint) return;
  run.sprint = TUNING.last_sprint;
  run.sprintT = TUNING.sprint_s;
  run.draft = null;
  run.offer = null;
  run.call = null;
  run.dilemma = null;
  run.lastChance = null;
  end(run, netPerS(run) >= 0 ? 'profit' : 'late');
}

function end(run: Run, ending: Ending): void {
  if (run.over) return;
  run.over = ending;
  run.events.push({ type: 'end', ending });
}
