import { gamePaused } from '../core/pause-clock';
import Phaser from 'phaser';
import { nextStep } from './run-hint';
import { workArea } from './layout';
import { BLOCK_BY_ID } from '../content/blocks';
import {
  BANK_ANSWERS,
  BANK_TEXT,
  callAnswers,
  CALL_ASK,
  CLIENT_SAYS,
  CLIENT_TYPE_NOTE,
  FIRST_CLIENT_SAYS,
  HAND_DONE,
  HAND_IDLE,
  HAND_NAME,
  LANE_ACC,
  LANE_NAME,
  LEFT_CLOSED,
  LEFT_DEMO,
  LEFT_KNOWN,
  LEFT_GENERIC,
  NEWS,
  NEWS_EVENT,
  releaseLines,
  REWORK_SAYS,
  TIER_NAME,
  TIER_NOTE,
} from '../content/texts';
import { L } from '../core/lang';
import { logEvent, metrics } from '../core/metrics';
import type { Rng } from '../core/rng';
import { playSound, unlockSound } from '../core/sound';
import { PALETTE } from '../data/palette';
import { dec, money, PER_S, plural, rate } from '../ui/format';
import { apiWorkQuote, rushTask } from '../systems/run/run';
import type { Paper, ShelfKeys, ShelfSection } from '../ui/paper';
import type { WorkbenchAction } from '../ui/workbench';
import { projectName, SEGMENT_TITLES, workbenchView, type WorkbenchSelection } from '../ui/workbench-view';
import { cardChangeText, sprintCardsView } from '../ui/sprint-cards-view';
import { buildReason } from '../ui/build-reasons';
import { DRAFT_CARDS } from '../systems/run/draft';
import { PRODUCTION } from '../systems/run/product';
import { nextReleaseWork } from '../systems/run/production';
import type { CityView } from '../ui/client-city';
import { companyContext, companyTotals, customerCount } from '../systems/company/company';
import { SEGMENTS, schedulePrice, segmentView } from '../systems/company/market';
import {
  answerCall,
  answerDilemma,
  answerLastChance,
  answerOffer,
  activeWork,
  busy,
  cancelTask,
  canHire,
  cellsMax,
  agentSlots,
  officeQuote,
  expandOffice,
  OFFICE,
  clientPay,
  crunch,
  chooseCard,
  deferTask,
  demolish,
  dilemmaOf,
  expandInfrastructure,
  fire,
  firstIndustryOrder,
  flows,
  freeCells,
  friendsAt,
  haggleChance,
  handy,
  hire,
  honestMult,
  IDEAS,
  isDemo,
  isLive,
  LANES,
  links,
  linkBonus,
  logos,
  mortgageSeconds,
  moveTask,
  netPerS,
  pitch,
  place,
  promiseSprints,
  resumeTask,
  RULES,
  setLane,
  setReview,
  shelf,
  step,
  TIERS,
  TUNING,
  upgrade,
  valuation,
  type ClientType,
  type Lane,
  type Run,
  type RunEvent,
  type Tier,
  type WorkTask,
} from '../systems/run/run';
import { Board, type BlockOnSheet, type SlotOnSheet } from '../view/board';
import type { Pt } from '../view/iso';
import { Squares } from '../view/squares';
import { agentRoute, AGENT_SLOTS, BUS_GAP, BUS_Y, CLIENT_SLOTS, DESK, INFRASTRUCTURE, MARKET, MONEY_RECT, STAGE_VIEW, TRUNK_X, VIEW_AT } from './layout';

const STEP = 1 / 60;

const CLAUDE = L('<b>❯ Клод</b>', '<b>❯ Claude</b>');
/** a name in the quotes of the language: «оплата», “payments” */
const q = (s: string): string => L(`«${s}»`, `“${s}”`);
/** «спринтов», short: a client waits «3 спр.» */
const SPR = L('спр.', 'spr.');
const OF = L('из', 'of');
const NO = L('№', '#');
const ENERGY = L('силы', 'energy');
const CALL = L('ЗВОНОК', 'CALL');

/** How a client of each type stands on the sheet: the height of its picture and how many squares one payment is. */
export const CLIENT_LOOK: Record<ClientType, { height: number; squares: number }> = {
  small: { height: 118, squares: 1 },
  mid: { height: 136, squares: 1 },
  startup: { height: 112, squares: 1 },
  corp: { height: 150, squares: 3 },
  gov: { height: 158, squares: 4 },
};

export interface GameHooks {
  onHidden?: () => void;
  /** Resuming a save does not replay the first-run tutorial. */
  restored?: boolean;
  bestValuation?: number;
  /** called every simulated step, before it: a bot plays here */
  beforeStep?: (run: Run) => void;
  onEnd: (run: Run) => void;
}

/**
 * The run on screen: steps the simulation at a fixed rate, shows it on the sheet and passes the
 * player's clicks to it. Decides nothing about the rules.
 */
export class GameScene extends Phaser.Scene {
  private board!: Board;
  private squares!: Squares;
  private acc = 0;
  /** simulated seconds per real second: 1 in the game, more when a gym fast-forwards */
  speed = 1;
  paused = false;
  private readonly run: Run;
  private readonly rng: Rng;
  private readonly paper: Paper;
  private readonly hooks: GameHooks;
  /** the block picked on the shelf and waiting for a cell */
  private picked: string | null = null;
  /** «снести блок» is on: the next click on a shipped block takes it off the sheet */
  private razing: string | null = null;
  /** squares that have arrived at each block: the sheet shows work when it lands, not when it is sent */
  private readonly landed = new Map<string, number>();
  private readonly faces = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly idle = new Set<number>();
  private routeSig = '';
  private stageShown = 0;
  private mapMoved = false;
  private cityColumnsShown = 0;
  private termUntil = 0;
  private newsAt = 0;
  private newsIndex = 0;
  private newsHold = 0;
  private payAt = 0;
  private payTurn = 0;
  private clock = 0;
  private readonly said = new Set<string>();
  private ended = false;
  /** squares the founder has done by hand: the pitch of the click climbs with them */
  private hands = 0;
  /** what clients say aloud: a line over the building of client `id` until the clock reaches `until` */
  private readonly quotes = new Map<number, { text: string; until: number }>();
  private readonly workbenchSelection: WorkbenchSelection = { picked: null, selectedSegment: 'small', previewPrices: {} };
  private workbenchAt = -Infinity;
  private expectedReady = new Set<string>();
  private draftShown = false;
  private cityCollapsed = false;
  private citySignature = '';
  private cityProductSignature = '';
  private cityNodes: { id: string; segment: 'small' | 'medium' | 'large'; texture: string; title: string; x: number; y: number; height: number; chain: boolean }[] = [];
  private infrastructureArea: { x: number; y: number; height: number } | null = null;
  private infrastructurePoint: Pt = INFRASTRUCTURE;

  constructor(run: Run, rng: Rng, paper: Paper, hooks: GameHooks) {
    super('game');
    this.run = run;
    this.rng = rng;
    this.paper = paper;
    this.hooks = hooks;
  }

  preload(): void {
    const keys = new Set(['desk', 'laptop', this.run.idea.aud.texture, ...[...IDEAS.corp, ...IDEAS.gov, ...IDEAS.startup].map((client) => client.texture)]);
    for (const key of keys) this.load.image(`node_${key}`, `assets/img/nodes/${key}.webp`);
  }

  create(): void {
    this.board = new Board(this);
    this.paper.enableMapPan((dx, dy) => {
      if (this.ended || this.run.draft || this.paused) return;
      const z = this.board.zoom;
      const [ox, oy] = this.board.onScreen(0, 0);
      const points = [...this.run.blocks, ...freeCells(this.run)].map(c => this.board.cell(c.i, c.j));
      const left = Math.min(DESK[0] - 140, ...points.map(p => p[0] - 120));
      const right = Math.max(200, ...points.map(p => p[0] + 120), ...this.cityNodes.map(n => n.x + 120));
      const top = Math.min(-250, ...points.map(p => p[1] - 160), ...this.cityNodes.map(n => n.y - n.height));
      const bottom = Math.max(450, ...points.map(p => p[1] + 80), ...AGENT_SLOTS.slice(0, this.run.agents.length).map(p => p[1] + 80));
      const cx = Phaser.Math.Clamp((VIEW_AT[0] - ox - dx) / z, left, right);
      const cy = Phaser.Math.Clamp((VIEW_AT[1] - oy - dy) / z, top, bottom);
      this.mapMoved = true;
      this.board.view(z, cx, cy, ...VIEW_AT, 0, () => undefined);
      if (this.infrastructureArea) {
        const [nx, ny] = this.board.onScreen(0, 0);
        this.infrastructureArea.x += nx - ox;
        this.infrastructureArea.y += ny - oy;
      }
      this.show();
    }, () => {
      this.mapMoved = false;
      this.infrastructureArea = null;
      this.stageShown = 0;
      this.syncStage(0);
      this.show();
    });
    this.squares = new Squares(this, this.rng, 400);

    // the founder: the only human on the sheet
    const desk = this.place('me', 'desk', DESK[0], DESK[1], 196);
    this.addFace('me', DESK[0] - desk.displayWidth / 2 + 103.5 * desk.scaleX, DESK[1] - desk.displayHeight + 98 * desk.scaleY, 26 * desk.scaleX, 22 * desk.scaleY, -0.38);

    this.paper.onShelf = (section, item) => this.onShelf(section, item);
    this.paper.onLane = (owner, key) => this.onKey(owner, key);
    this.paper.onCell = (id) => this.onCell(id);
    this.paper.onAnswer = (k) => this.onAnswer(k);
    this.paper.onWorkbench = (action) => this.onWorkbench(action);
    this.paper.onCity = (segment) => {
      if (this.run.draft || this.paused || this.ended) return;
      if (segment === 'toggle') this.cityCollapsed = !this.cityCollapsed;
      else {
        const same = this.workbenchSelection.panel === 'clients' && this.workbenchSelection.selectedSegment === segment;
        this.workbenchSelection.selectedSegment = segment;
        this.workbenchSelection.panel = same ? null : 'clients';
      }
      this.workbenchAt = -Infinity;
      playSound('ui');
      this.show();
    };
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKeyDown(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.ended) this.hooks.onHidden?.();
    });

    for (const b of this.run.blocks) this.landed.set(b.kind, b.done);
    this.newsAt = 6;
    this.paper.setNews(`${pitch(this.run.idea)}. ${this.hooks.restored ? L('Стартап вернулся к работе', 'The startup is back at work') : L('Пока что это три слова и один человек', 'So far it is three words and one person')}`, this.newsHint());
    if (!this.hooks.restored) this.say(
      [
        CLAUDE,
        ...L(
          ['Привет. Я твоя команда — вся.', `Выбери справа «${BLOCK_BY_ID.core.name}»`, 'и поставь её на чертёж.', `Чтобы помочь, жми «${HAND_NAME.build}».`],
          ['Hi. I am your team — all of it.', `Pick “${BLOCK_BY_ID.core.name}” on the right`, 'and put it on the blueprint.', `Press “${HAND_NAME.build}” to help build.`],
        ),
      ],
      600,
    );
    this.syncStage(0);
    this.show();
    window.__GAME__.ready = true;
  }

  update(_time: number, deltaMs: number): void {
    if (gamePaused) return;
    if (this.ended) {
      this.squares.step(deltaMs / 1000);
      this.board.step(deltaMs / 1000);
      return;
    }
    const dt = Math.min(deltaMs / 1000, 0.25);
    // The bot must still be able to make its draft choice while simulation time stands still.
    if (this.run.draft) {
      this.acc = 0;
      if (!this.paused) this.hooks.beforeStep?.(this.run);
      if (this.run.events.length > 0) this.drain();
    }
    if (!this.paused && !this.run.draft) {
      this.acc += dt * this.speed;
      while (this.acc >= STEP) {
        this.hooks.beforeStep?.(this.run);
        if (this.run.draft) { this.acc = 0; break; }
        step(this.run, STEP);
        this.acc -= STEP;
        if (this.run.events.length > 0) this.drain();
        if (this.run.over || this.run.draft || this.run.lastChance !== null) { this.acc = 0; break; }
      }
      if (!this.run.draft && !this.run.over) {
        this.clock += dt;
        this.flowMoney(dt);
        this.tickNews(dt);
      }
    }
    const visualDt = this.paused || this.run.draft ? 0 : dt * Math.min(this.speed, 3);
    this.board.step(visualDt);
    this.squares.step(visualDt);
    this.show();
  }

  // ---------------------------------------------------------------- the player's clicks

  private onWorkbench(action: WorkbenchAction): void {
    const run = this.run;
    if (this.ended || run.over) return;
    if (action.type === 'close-panel') {
      this.workbenchSelection.panel = null;
      this.workbenchAt = -Infinity;
      this.show();
      return;
    }
    if (action.type === 'choose-card') {
      if (chooseCard(run, action.id)) {
        this.acc = 0;
        this.paused = false;
        playSound('buy', 2);
        this.workbenchAt = -Infinity;
        this.drain();
        this.show();
      }
      return;
    }
    if (run.draft || this.paused) return;
    unlockSound();
    let changed = true;
    switch (action.type) {
      case 'expand-office': changed = expandOffice(run, action.kind); break;
      case 'inspect-module':
        this.workbenchSelection.selectedModule = action.block;
        this.workbenchSelection.panel = 'module';
        break;
      case 'place':
        this.workbenchSelection.panel = null;
        this.onShelf('blocks', action.block);
        break;
      case 'upgrade': changed = upgrade(run, action.block); break;
      case 'demolish':
        this.picked = null;
        this.workbenchSelection.panel = null;
        this.razing = action.block;
        break;
      case 'move': changed = moveTask(run, action.task, action.direction); break;
      case 'defer': changed = deferTask(run, action.task); break;
      case 'resume': changed = resumeTask(run, action.task); break;
      case 'cancel-task': changed = cancelTask(run, action.task); break;
      case 'help-task':
        changed = (activeWork(run) ?? run.tasks.find(task => task.status === 'queued'))?.id === action.task;
        if (changed) this.byHand('build');
        break;
      case 'rush-task':
        changed = rushTask(run, action.task);
        if (changed) this.paper.pop(1120, 360, L('Ускорение: строители работают ×2', 'Boost: builders work ×2'), 'good');
        break;
      case 'expand-infrastructure': changed = expandInfrastructure(run); break;
      case 'select-segment':
        this.workbenchSelection.selectedSegment = action.segment;
        this.workbenchSelection.panel = 'clients';
        break;
      case 'preview-price':
        this.workbenchSelection.previewPrices[action.segment] = action.value;
        break;
      case 'confirm-price': {
        const price = this.workbenchSelection.previewPrices[action.segment];
        changed = price !== undefined && schedulePrice(run.market, action.segment, price);
        if (changed) delete this.workbenchSelection.previewPrices[action.segment];
        break;
      }
    }
    if (action.type !== 'preview-price' && action.type !== 'place') playSound(changed ? 'ui' : 'waste');
    this.workbenchAt = -Infinity;
    if (run.events.length > 0) this.drain();
    this.show();
  }

  private onShelf(section: string, item: string): void {
    if (this.paused || this.run.draft || this.ended) return;
    this.workbenchAt = -Infinity;
    unlockSound();
    if (section !== 'blocks') return;
    if (item === 'x') {
      // the wrecking tool: on, then a click on the block that has to go
      this.razing = this.razing ? null : '*';
      this.picked = null;
      playSound('ui');
      return;
    }
    this.razing = null;
    if (item.startsWith('up:')) {
      // a rework: no cell to choose — it is built on the block the client named
      if (upgrade(this.run, item.slice(3))) playSound('buy', 0);
      else {
        this.paper.flash('blocks', item, 'denied');
        playSound('waste');
      }
      return;
    }
    if (!shelf(this.run).includes(item) || this.run.blocks.length >= cellsMax(this.run)) {
      this.paper.flash('blocks', item, 'denied');
      playSound('waste');
      return;
    }
    this.picked = this.picked === item ? null : item;
    playSound('ui');
  }

  private onCell(id: string): void {
    if (this.paused || this.run.draft || this.ended) return;
    this.workbenchAt = -Infinity;
    if (id.startsWith('agent:')) {
      this.onKey('info', id.slice(6));
      return;
    }
    if (id.startsWith('inspect:')) {
      this.onWorkbench({ type: 'inspect-module', block: id.slice(8) });
      return;
    }
    if (id.startsWith('upgrade:')) {
      this.onWorkbench({ type: 'upgrade', block: id.slice(8) });
      return;
    }
    if (id.startsWith('rush:')) {
      this.onWorkbench({ type: 'rush-task', task: id.slice(5) });
      return;
    }
    if (id === 'infrastructure') {
      this.onWorkbench({ type: 'expand-infrastructure' });
      return;
    }
    if (id.startsWith('help:') || id.startsWith('defer:') || id.startsWith('later:')) {
      const [command, task] = id.split(':');
      this.onWorkbench(command === 'later' ? { type: 'move', task, direction: 1 } : { type: command === 'help' ? 'help-task' : 'defer', task });
      return;
    }
    if (id.startsWith('cancel:') || id.startsWith('first:') || id.startsWith('resume:')) {
      const [command, task] = id.split(':');
      const changed = command === 'cancel' ? cancelTask(this.run, task) : command === 'first' ? moveTask(this.run, task, -1) : resumeTask(this.run, task);
      playSound(changed ? 'ui' : 'waste');
      this.drain();
      this.show();
      return;
    }
    if (id === 'site') {
      this.byHand();
      return;
    }
    if (id.startsWith('x:')) {
      if (!this.razing || (this.razing !== '*' && this.razing !== id.slice(2))) return;
      if (demolish(this.run, id.slice(2))) this.razing = null;
      else playSound('waste');
      return;
    }
    if (!this.picked) return;
    const [i, j] = id.split(',').map(Number);
    if (place(this.run, this.picked, i, j)) this.picked = null;
  }

  /** The founder's own square of work on a lane: thrown from the desk to where that work goes. */
  private byHand(lane: Lane = 'build'): void {
    if (this.paused || this.run.draft || this.ended) return;
    this.workbenchAt = -Infinity;
    unlockSound();
    const run = this.run;
    const task = activeWork(run) ?? run.tasks.find((entry) => entry.status === 'queued');
    const site = task?.block ? run.blocks.find((block) => block.kind === task.block) : undefined;
    const can = handy(run, lane);
    if (!can || !crunch(run, lane)) {
      playSound('waste');
      const [x, y] = this.board.onScreen(DESK[0], DESK[1] - 200);
      // on the first clicks of the game an empty site is not news: the goal line already says what to do
      if (can || lane !== 'build' || run.blocks.length > 0) this.paper.pop(x, y, can ? L('сил нет: подожди', 'no energy: wait') : HAND_IDLE[lane], 'bad');
      return;
    }
    this.hands++;
    playSound('yes', this.hands % 6);
    const [fx, fy] = this.board.onScreen(DESK[0] - 40, DESK[1] - 130);
    const to: Pt = lane === 'build' ? site ? this.board.top(site) : this.infrastructurePoint : lane === 'fix' ? this.board.cell(0, 0) : MARKET;
    const [tx, ty] = this.board.onScreen(...to);
    // code is Claude's colour; a post, a call and a fix are the human's own ink
    this.squares.fly({ x: fx - 10, y: fy - 10, w: 20, h: 20 }, { x: tx - 20, y: ty - 10, w: 40, h: 20 }, 1, lane === 'build' ? PALETTE.coral : PALETTE.ink, 160, [0.35, 0.45]);
    if (HAND_DONE[lane]) this.paper.pop(tx, ty - 34, HAND_DONE[lane], 'good');
  }

  private onKey(owner: string, key: string): void {
    if (this.paused || this.run.draft || this.ended) return;
    this.workbenchAt = -Infinity;
    unlockSound();
    if (owner === 'info') {
      this.workbenchSelection.selectedAgent = Number(key);
      this.workbenchSelection.panel = 'agent';
      this.show();
      return;
    }
    if (owner === 'hand') {
      this.byHand(key as Lane);
      return;
    }
    if (owner === 'me') {
      if (setReview(this.run, key as Lane)) playSound('ui');
      else playSound('waste');
      return;
    }
    if (owner === 'hire') {
      if (hire(this.run, key as Tier)) playSound('buy', 4);
      else playSound('waste');
      return;
    }
    if (owner === 'office') {
      this.onWorkbench({ type: 'expand-office', kind: 'desks' });
      return;
    }
    if (owner === 'team') {
      for (const agent of this.run.agents) setLane(this.run, agent.id, key as Lane);
      playSound('ui');
      return;
    }
    const id = Number(owner.slice(1));
    if (key === 'drop') fire(this.run, id);
    else setLane(this.run, id, key as Lane);
    playSound('ui');
  }

  private onAnswer(k: number): void {
    if (this.run.draft || this.ended) return;
    this.workbenchAt = -Infinity;
    playSound('ui');
    // one card at a time, the most urgent first: the bank, a client on the line, the buyer
    if (this.run.lastChance !== null) answerLastChance(this.run, k === 0);
    else if (this.run.call) answerCall(this.run, k === 1);
    else if (this.run.offer !== null) answerOffer(this.run, k === 0 ? 'sell' : k === 1 ? 'haggle' : 'no');
    else answerDilemma(this.run, k);
    this.paper.call(null);
  }

  private onKeyDown(e: KeyboardEvent): void {
    unlockSound();
    if (this.ended || e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if (this.run.draft) {
      const digit = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
      if (digit && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const id = this.run.draft[Number(digit[1]) - 1];
        if (id) this.onWorkbench({ type: 'choose-card', id });
      }
      return;
    }
    if (['Enter', 'NumpadEnter', 'Space'].includes(e.code) && e.target instanceof HTMLElement && e.target.closest('button, input, summary')) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (!e.repeat) this.byHand();
      return;
    }
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (!digit) return;
    const dilemma = dilemmaOf(this.run);
    if (this.run.offer !== null || this.run.call || this.run.lastChance !== null || dilemma) {
      // the bank and a client on the line have two answers, the buyer three, a dilemma — as many as it has
      const urgent = this.run.lastChance !== null || this.run.call;
      const answers = urgent ? 2 : this.run.offer !== null ? 3 : (dilemma?.options.length ?? 2);
      if (Number(digit[1]) <= answers) this.onAnswer(Number(digit[1]) - 1);
      return;
    }
    const kind = shelf(this.run)[Number(digit[1]) - 1];
    if (kind) this.onShelf('blocks', kind);
  }

  // ---------------------------------------------------------------- what happened in the simulation

  private drain(): void {
    if (this.run.events.some((event) => event.type !== 'work')) this.workbenchAt = -Infinity;
    for (const e of this.run.events) this.onEvent(e);
    this.run.events.length = 0;
  }

  private onEvent(e: RunEvent): void {
    const run = this.run;
    switch (e.type) {
      case 'card-applied': {
        const card = DRAFT_CARDS.find((entry) => entry.id === e.id);
        if (card) {
          const impact = e.change ? cardChangeText(e.change) : card.impact;
          this.workbenchSelection.applied = { title: card.title, impact };
          this.time.delayedCall(5000, () => {
            this.workbenchSelection.applied = null;
            this.workbenchAt = -Infinity;
          });
          this.workbenchAt = -Infinity;
          this.paper.popMoney();
          this.board.pulse();
          if (card.money) this.paper.pop(670, 198, `+${money(card.money)}`, 'good');
          else if (e.change && e.change.before !== e.change.after && (card.debt || card.energy))
            this.paper.pop(card.debt ? 1170 : 670, card.debt ? 208 : 230, impact, 'good');
        }
        break;
      }
      case 'task-cancelled':
        if (e.block) {
          const block = run.blocks.find((entry) => entry.kind === e.block);
          if (block) this.landed.set(e.block, block.done);
          else this.landed.delete(e.block);
        }
        this.workbenchAt = -Infinity;
        break;
      case 'placed':
        this.landed.set(e.kind, 0);
        playSound('buy', 0);
        logEvent(`placed:${e.kind}`);
        if (run.blocks.length === 2 && !this.hooks.restored) {
          this.say(
            [
              CLAUDE,
              ...L(
                ['Строю. Пока я занят — выбери', 'следующий блок: без лендинга нас', 'не найдут, без оплаты не заплатят.'],
                ['Building. While I am busy — pick', 'the next block: without a landing', 'page nobody finds us, without', 'payments nobody pays.'],
              ),
            ],
            14,
          );
        }
        break;
      case 'work': {
        if (e.idle) {
          this.idle.add(e.agent);
          return;
        }
        this.idle.delete(e.agent);
        const key = `a${e.agent}`;
        const block = e.i !== undefined && e.j !== undefined ? run.blocks.find((b) => b.i === e.i && b.j === e.j) : undefined;
        const land = (): void => {
          if (block) this.landed.set(block.kind, (this.landed.get(block.kind) ?? 0) + 1);
        };
        if (e.agent === 0 || this.speed > 2) land();
        else if (this.board.hasRoute(key)) this.board.flow(key, PALETTE.coral, 620, land);
        else land();
        if (this.speed <= 2 && e.agent !== 0) playSound('auto');
        // the founder checks this lane: for every square of work an ink square leaves his desk
        if (e.agent !== 0 && e.lane === run.review && this.speed <= 2 && this.board.hasRoute('me') && (e.lane !== 'build' || block)) {
          this.board.flow('me', PALETTE.ink, 600);
          if (!this.hooks.restored && !this.said.has('t:review') && (this.termUntil === 0 || this.clock > this.termUntil - 4)) {
            this.said.add('t:review');
            this.say(
              [
                CLAUDE,
                ...L(
                  ['Тёмные квадраты от стола — это ты:', 'ты проверяешь одно направление.', 'Скорость +25%, новые баги −50%.', 'Сменить его — клавиши справа внизу.'],
                  ['The dark squares from the desk are', 'you: you review one lane.', '+25% speed, −50% new bugs.', 'Change it with the keys bottom right.'],
                ),
              ],
              14,
            );
          }
        }
        break;
      }
      case 'built': {
        const [x, y] = this.board.onScreen(...this.board.top(e));
        const live = run.blocks.find((block) => block.kind === e.kind)?.live && !run.blocks.find((block) => block.kind === e.kind)?.up;
        this.paper.pop(x, y - 30, live ? L('выпущено — работает', 'shipped — active') : L('готово — ждёт релиза', 'done — waiting for the release'), live ? 'good' : '');
        this.burst(x, y, 6);
        playSound('buy', 7);
        break;
      }
      case 'live':
        logEvent(`live:${e.kind}`);
        if (e.kind === 'core') this.news(NEWS_EVENT.firstBlock);
        break;
      case 'release': {
        this.picked = null;
        this.razing = null;
        this.syncStage(1100);
        metrics.completed = true;
        logEvent(`release:${e.report.sprint}`);
        const names = [...e.report.shipped.map((k) => BLOCK_BY_ID[k]?.short ?? k), ...(e.report.projects ?? []).map(projectName)].map(q);
        const reasons = e.report.reasons.map((k) => BLOCK_BY_ID[k]?.short ?? '');
        const perS = { mrr: e.report.mrr / TUNING.sprint_s, tokens: e.report.tokens / TUNING.sprint_s };
        this.say(releaseLines({ ...e.report, ...perS, shipped: names, reasons, unpaid: isLive(run, 'pay') ? 0 : run.clients.length }), 16);
        playSound('scale');
        // the release is the beat of the game: what ships bursts, the sheet breathes, the money answers
        for (const kind of e.report.shipped) {
          const b = run.blocks.find((x) => x.kind === kind);
          if (b) this.burst(...this.board.onScreen(...this.board.top(b)), 10);
        }
        if (e.report.projects?.length) this.burst(...this.board.onScreen(DESK[0] + 100, DESK[1] - 150), 10);
        this.board.pulse();
        if (e.report.mrr > 0) this.paper.popMoney();
        if (links(run).length > 0 && !this.said.has('link')) {
          this.said.add('link');
          this.news(NEWS_EVENT.link);
        }
        if (netPerS(run) >= 0 && e.report.mrr > 0 && !this.said.has('profit')) {
          this.said.add('profit');
          this.news(NEWS_EVENT.profit);
        }
        break;
      }
      case 'client': {
        const c = run.clients.find((x) => x.id === e.id);
        if (!c) return;
        this.syncStage(1100);
        this.paper.pop(1178, 740, `${c.name}: ${L('+ ключевой договор', '+ key contract')}`, 'good');
        playSound('all');
        logEvent(`client:${c.type}`);
        if (run.stats.clients === 1) {
          this.news(NEWS_EVENT.firstClient);
          this.quotes.set(c.id, { text: FIRST_CLIENT_SAYS, until: this.clock + 9 });
        } else if (CLIENT_TYPE_NOTE[c.type] && !this.said.has(`type:${c.type}`)) {
          // a new kind of client: it says a line of its own, and the news line says once how it pays
          this.said.add(`type:${c.type}`);
          this.news(`${L('Новый клиент', 'New client')} — ${CLIENT_TYPE_NOTE[c.type]}`);
          this.quotes.set(c.id, { text: CLIENT_SAYS[c.type], until: this.clock + 9 });
        }
        break;
      }
      case 'left': {
        const pool = e.demo ? LEFT_DEMO : e.closed ? LEFT_CLOSED : e.reason ? LEFT_KNOWN : LEFT_GENERIC;
        this.paper.pop(1178, 740, e.say ?? pool[e.id % pool.length].replace('%s', BLOCK_BY_ID[e.reason]?.short ?? ''), 'bad');
        playSound('waste');
        logEvent(e.closed ? 'closed' : 'left');
        if (!e.closed && !this.said.has('left')) {
          this.said.add('left');
          this.news(NEWS_EVENT.firstLeft);
        }
        break;
      }
      case 'trend': {
        this.news(NEWS_EVENT.trend.replace('%s', BLOCK_BY_ID[e.kind]?.name ?? e.kind));
        this.newsHold = 16;
        this.newsAt = 16;
        const [x, y] = this.board.onScreen(MARKET[0], MARKET[1]);
        this.paper.pop(x, y - 20, `${L('тренд: клиенты хотят', 'trend: clients want')} ${BLOCK_BY_ID[e.kind]?.name ?? e.kind}`, 'good');
        playSound('quip');
        logEvent(`trend:${e.kind}`);
        break;
      }
      case 'razed':
        this.landed.delete(e.kind);
        playSound('waste');
        logEvent(`razed:${e.kind}`);
        break;
      case 'rework': {
        // the client says it aloud: nothing to find out, only to build
        const line = REWORK_SAYS[e.id % REWORK_SAYS.length].replace('%s', BLOCK_BY_ID[e.kind]?.short ?? e.kind);
        this.quotes.set(e.id, { text: line, until: this.clock + 8 });
        playSound('quip');
        logEvent(`rework:${e.kind}`);
        if (!this.said.has('rework')) {
          this.said.add('rework');
          this.say(
            [
              CLAUDE,
              ...L(
                ['Ключевой клиент просит доработку.', 'Нажми на нужную постройку', 'и улучши её. Сделаем — платит', 'больше. Не сделаем — уйдёт.'],
                ['A key client asks for an upgrade.', 'Click the building and improve it.', 'Ship it — the client pays more.', 'Don’t — the client leaves.'],
              ),
            ],
            14,
          );
        }
        break;
      }
      case 'down':
        this.news(NEWS_EVENT.down);
        this.cameras.main.shake(180, 0.004);
        playSound('waste');
        logEvent('down');
        break;
      case 'stage':
        this.syncStage(1100);
        playSound('finale');
        logEvent(`stage:${e.stage}`);
        if (e.stage === 2) this.news(NEWS_EVENT.firstPay);
        if (e.stage === 3) this.news(NEWS_EVENT.stage3);
        break;
      case 'offer':
        playSound('quip');
        logEvent('offer');
        break;
      case 'call':
        playSound('quip');
        logEvent(`call:${e.kind}`);
        break;
      case 'hungup': {
        const [x, y] = this.board.onScreen(MARKET[0], MARKET[1]);
        this.paper.pop(x, y - 20, `${e.name}: ${L('не дозвонились и ушли', 'couldn’t reach you and left')}`, 'bad');
        playSound('waste');
        logEvent('hungup');
        break;
      }
      case 'kept': {
        this.paper.pop(1178, 740, L('обещание выполнено', 'promise kept'), 'good');
        playSound('buy', 9);
        logEvent('kept');
        break;
      }
      case 'refund': {
        this.paper.pop(1178, 740, `${L('возврат', 'refund')} ${money(-e.sum)}`, 'bad');
        this.cameras.main.shake(140, 0.003);
        playSound('waste');
        logEvent('refund');
        break;
      }
      case 'news':
        // competitors live in the news line: the headline says what it did to the numbers
        this.news(e.text.replace('%s', BLOCK_BY_ID[e.arg]?.name ?? e.arg));
        this.newsHold = 18;
        this.newsAt = 18;
        playSound(e.good ? 'quip' : 'waste');
        logEvent(`news:${e.id}`);
        break;
      case 'demo':
        this.news((e.ok ? NEWS_EVENT.demoOk : NEWS_EVENT.demoFail).replace('%s', e.ok ? projectName(e.name) : e.name));
        this.newsHold = 16;
        this.newsAt = 16;
        playSound(e.ok ? 'finale' : 'waste');
        logEvent(`demo:${e.ok ? 'ok' : 'fail'}`);
        break;
      case 'hero': {
        this.paper.pop(1178, 740, L('героический релиз: платит ×1,5', 'heroic release: pays ×1.5'), 'good');
        this.news(NEWS_EVENT.hero);
        playSound('finale');
        logEvent('hero');
        break;
      }
      case 'haggle':
        if (!e.ok) {
          this.news(NEWS_EVENT.haggleFail);
          playSound('waste');
        }
        logEvent(`haggle:${e.ok ? 'ok' : 'fail'}`);
        break;
      case 'dilemma':
        playSound('quip');
        logEvent(`dilemma:${e.id}`);
        break;
      case 'answered':
        // what came of the answer goes to the news line; a refusal makes no news
        if (e.text) {
          this.news(e.text);
          playSound('buy', 3);
        }
        logEvent(`answered:${e.id}:${e.option}`);
        break;
      case 'exposed':
        this.news(e.text);
        this.newsHold = 18;
        this.newsAt = 18;
        this.cameras.main.shake(200, 0.004);
        playSound('waste');
        logEvent('exposed');
        break;
      case 'lastchance':
        playSound('waste');
        this.cameras.main.shake(220, 0.005);
        logEvent('lastchance');
        break;
      case 'end':
        logEvent(`end:${e.ending}`);
        this.ended = true;
        this.paper.call(null);
        this.paper.setWorkbench(null);
        this.paper.setSprintCards(null);
        this.paper.setCity(null);
        // nobody speaks over the ending
        this.quotes.clear();
        if (e.ending === 'sold' || e.ending === 'profit') playSound('finale');
        else {
          playSound('waste');
          this.cameras.main.shake(260, 0.005);
        }
        this.say(
          [
            CLAUDE,
            ...L(
              [e.ending === 'broke' ? 'Деньги кончились. Было приятно' : 'На этом всё. Было приятно', 'поработать. Счёт за токены я пришлю.'],
              [e.ending === 'broke' ? 'The money has run out. It was nice' : 'That is all. It was nice', 'working together. Token bill to follow.'],
            ),
          ],
          30,
        );
        this.hooks.onEnd(run);
        break;
    }
  }

  // ---------------------------------------------------------------- showing the state

  private show(): void {
    const run = this.run;
    if (run.t - this.workbenchAt >= 0.2) this.expectedReady = nextReleaseWork(run);
    const board = this.board;
    this.syncStage(1100);
    const z = board.zoom;
    this.paper.setZoom(z);

    // the product
    const blocks: BlockOnSheet[] = run.blocks.map((b) => {
      const landed = Math.min(this.landed.get(b.kind) ?? 0, b.need);
      // a block under rework stays what it is — a shipped module — with the new work lying on top of it
      return { kind: b.kind, i: b.i, j: b.j, built: b.live || (b.built && landed >= b.need), up: b.live && b.up, done: landed, need: b.need, debt: 0, logos: b.kind === 'landing' ? logos(run) : 0 };
    });
    // debt sticks to the modules, oldest first: the picture of «it all rests on the first thing we wrote»
    let debt = Math.floor(run.debt);
    for (const b of blocks) {
      if (!b.built || debt <= 0) continue;
      b.debt = Math.min(15, debt);
      debt -= b.debt;
    }
    const free = this.picked && !run.draft && !this.paused ? freeCells(run) : [];
    const slots: SlotOnSheet[] = free.map((c) => ({ i: c.i, j: c.j, hot: this.picked !== null && friendsAt(run, this.picked, c.i, c.j) > 0 }));
    board.sync(blocks, slots);
    // a player who has not clicked yet does not know that things are clicked: what waits for a click breathes
    const novice = this.hands < 3;
    const cells: { id: string; x: number; y: number; pulse?: boolean }[] = free.map((c) => {
      const [x, y] = board.onScreen(...board.cell(c.i, c.j));
      return { id: `${c.i},${c.j}`, x, y, pulse: run.blocks.length < 2 };
    });
    // the wrecking tool: every shipped block but the base three can be clicked off the sheet
    if (this.razing && !run.draft && !this.paused) {
      for (const b of run.blocks) {
        if (!b.live || b.up || run.tasks.some((task) => task.block === b.kind) || RULES[b.kind].role === 'base' || (this.razing !== '*' && b.kind !== this.razing)) continue;
        const [x, y] = board.onScreen(...board.top(b));
        cells.push({ id: `x:${b.kind}`, x, y, pulse: true });
      }
    }
    const next = run.tasks.find((task) => task.status === 'queued');
    const active = activeWork(run) ?? (next && run.money >= next.cost ? next : undefined);
    const site = active?.block ? run.blocks.find((block) => block.kind === active.block) : undefined;
    if (!run.draft && !this.paused && !this.picked && !this.razing && site) {
      // the site itself takes clicks: the founder finishes the work by hand
      const [x, y] = board.onScreen(...board.top(site));
      cells.push({ id: 'site', x, y, pulse: novice && run.energy >= 1 });
    }
    if (!run.draft && !this.paused && !this.picked && !this.razing) {
      for (const block of run.blocks) {
        if (block === site) continue;
        const [x, y] = board.onScreen(...board.top(block));
        cells.push({ id: `inspect:${block.kind}`, x, y });
      }
    }
    this.paper.setCells(cells);

    const keep = new Set<string>();
    for (const b of blocks) {
      const kind = BLOCK_BY_ID[b.kind];
      const [x, y] = board.onScreen(...board.side(b));
      const id = `b:${b.kind}`;
      keep.add(id);
      const level = run.blocks.find((r) => r.kind === b.kind)?.level ?? 1;
      const task = run.tasks.find((entry) => entry.block === b.kind);
      this.paper.tag(id, x, y, `<button class="map-inspect" data-map="inspect:${b.kind}" title="${L('Свойства и улучшения', 'Details and upgrades')}">${kind.short}${level > 1 ? ` v${level}` : ''}</button>`, b.built ? 'face act' : 'face hot act');
      if (task) {
        const [tx, ty] = board.onScreen(...board.top(b));
        keep.add(`b:n${b.kind}`);
        this.paper.tag(`b:n${b.kind}`, tx, ty - 58 * z, this.taskCaption(task), 'map-task');
      } else {
        const reason = buildReason(run, b.kind);
        if (reason) {
          const [tx, ty] = board.onScreen(...board.top(b));
          keep.add(`b:why${b.kind}`);
          this.paper.tag(`b:why${b.kind}`, tx, ty - 38 * z, `<button data-map="inspect:${b.kind}" title="${reason.detail.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${reason.label}</button>`, 'map-reason');
        }
      }
    }
    // the very first placement: the free cell says «click here»
    if (this.picked && run.blocks.length < 2) {
      for (const c of free.slice(0, 1)) {
        const [x, y] = board.onScreen(...board.cell(c.i, c.j));
        keep.add('b:click');
        this.paper.tag('b:click', x, y - 12, L('кликни клетку', 'click a cell'), 'small hot');
      }
    }
    for (const s of slots) {
      if (!s.hot) continue;
      const [x, y] = board.onScreen(...board.cell(s.i, s.j));
      const id = `b:slot${s.i},${s.j}`;
      keep.add(id);
      const bonus = Math.round(friendsAt(run, this.picked!, s.i, s.j) * linkBonus(run) * 100);
      this.paper.tag(id, x, y - 9, L(`чек +${bonus}% после выпуска`, `bill +${bonus}% after release`), 'small hot');
    }
    this.paper.pruneTags('b:', keep);
    this.syncSharedWork();

    // the founder and the agents
    // the founder's caption starts at the left edge of the desk: the desk stands at the edge of the sheet
    const [mx, my] = board.onScreen(DESK[0] - 118, DESK[1] + 8);
    const full = Math.floor(run.energy);
    const pips = '■'.repeat(full) + '□'.repeat(TUNING.crunch.max - full);
    // on a wide sheet the first laptop stands close to the desk: the caption is cut to the bone
    const you = L('<b>ты</b>', '<b>you</b>');
    const mine = z < 0.8 ? `${you}: ${LANE_NAME[run.review]}` : `${you} · ${L('проверяешь', 'reviewing')} ${LANE_ACC[run.review]}`;
    this.paper.tag('me', mx, my, `${mine}<i>${ENERGY} ${pips}</i>`, 'left');
    this.syncAgents();
    const keepA = new Set<string>();
    run.agents.forEach((a, k) => {
      const [sx, sy] = AGENT_SLOTS[k];
      const [x, y] = board.onScreen(sx, sy + 8);
      const id = `a${a.id}`;
      keepA.add(id);
      // an agent with nothing to do on its lane waits for free: the caption says both
      const idle = !busy(run, a);
      // on a wide sheet the laptops stand close: their captions are set smaller
      const labelWidth = (AGENT_SLOTS[1][0] - AGENT_SLOTS[0][0]) * z - 14;
      const label = `${NO}${a.id} · ${TIER_NAME[a.tier]} · ${LANE_NAME[a.lane]}`;
      this.paper.tag(id, x, y, `<button class="map-agent" style="width:${labelWidth}px" data-map="agent:${a.id}" title="${label}"><span class="map-agent-heading"><b>${LANE_NAME[a.lane]}</b><small>${NO}${a.id}</small></span><i${idle ? ' class="bad"' : ''}>${idle ? L('ждёт · $0', 'idle · $0') : TIER_NAME[a.tier]}</i></button>`, z < 0.8 ? 'small act' : 'act');
    });
    this.paper.pruneTags('a', keepA);

    this.syncCity();
    // the product is down: it is written across the product itself, with the reason
    if (run.down) {
      const [x, y] = board.onScreen(...board.cell(0, 0));
      const why = run.downWhy === 'supplier' ? L('сбой у поставщика модели', 'the model provider is down') : L(`техдолг дошёл до ${TUNING.debt.down_at}`, `tech debt reached ${TUNING.debt.down_at}`);
      this.paper.tag('down', x, y - 150 * z, L(`<b>ПРОДУКТ ЛЕЖИТ</b><i>${why} · клиенты не платят до релиза</i>`, `<b>THE PRODUCT IS DOWN</b><i>${why} · clients don’t pay until the release</i>`), 'hot');
    } else this.paper.dropTag('down');

    this.paper.pruneTags('c', new Set());
    // what a client says aloud stands by its building for a few seconds
    // one line at a time, in the free strip above the news: on the sheet itself it would lie over the product
    let said: { name: string; text: string; until: number } | null = null;
    for (const [id, q] of this.quotes) {
      const c = run.clients.find((x) => x.id === id);
      if (!c || this.clock > q.until) this.quotes.delete(id);
      else if (!said || q.until > said.until) said = { name: c.name, text: q.text, until: q.until };
    }
    if (said) this.paper.tag('quote', 1322, 968, `<b>${said.name}:</b> ${said.text}`, 'say');
    else this.paper.dropTag('quote');

    // money and time
    const net = netPerS(run);
    let sub: string;
    if (net >= 0) sub = `<b class="good">+${rate(net)}${PER_S}</b> ${L('чистыми', 'net')}`;
    else {
      const left = run.money / -net;
      sub = `<b class="hot">${rate(net)}${PER_S}</b> ${L('чистыми · запас ≈', 'net · cash for ≈')} <b>${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b>`;
    }
    this.paper.setMoney(money(run.money), sub, run.money <= 0);
    const leftS = Math.ceil(TUNING.sprint_s - run.sprintT);
    const sprint = run.sprint;
    const demo = isDemo(run) && run.clients.length > 0;
    this.paper.setSprint(
      run.draft ? L(`СПРИНТ ${sprint}/${TUNING.last_sprint} · ПАУЗА: ВЫБОР КАРТЫ`, `SPRINT ${sprint}/${TUNING.last_sprint} · PAUSED: CHOOSE A CARD`) : L(`СПРИНТ ${sprint}/${TUNING.last_sprint} · ${demo ? 'ДЕМО-ДЕНЬ' : 'РЕЛИЗ'} ЧЕРЕЗ ${leftS} С`, `SPRINT ${sprint}/${TUNING.last_sprint} · ${demo ? 'DEMO DAY' : 'RELEASE'} IN ${leftS} S`),
      run.sprintT / TUNING.sprint_s,
    );
    // the goal is always on the sheet: three frames taken at random must say what to do
    const valuationNote = run.sprint >= 15 ? L(`Оценка для продажи ${money(valuation(run))}`, `Sale valuation ${money(valuation(run))}`) : '';
    const record = valuationNote && this.hooks.bestValuation ? L(` · рекорд ${money(this.hooks.bestValuation)}`, ` · record ${money(this.hooks.bestValuation)}`) : '';
    const order = run.nextId === 1 ? firstIndustryOrder(run) : undefined;
    const orderHint = order?.kind === 'mobile' ? L('Первый заказ стоматологии: запись пациентов с телефона', 'First dental order: book patients from a phone')
      : order?.kind === 'roles' ? L('Первый заказ комплаенса: разные права для автора и согласующего', 'First compliance order: separate permissions for author and approver') : '';
    const detail = valuationNote ? valuationNote + record : orderHint;
    const promises = run.clients.filter(client => client.promised && !client.happy).sort((a, b) => a.patience - b.patience);
    this.paper.setGoal(nextStep(run, net, { paused: this.paused, picked: Boolean(this.picked), razing: Boolean(this.razing) }) + (detail && !promises.length ? `<br><small>${detail}</small>` : ''));
    this.paper.setPromises(promises.map(client => {
      const deadline = Math.min(TUNING.last_sprint, run.sprint + client.patience - 1);
      const block = BLOCK_BY_ID[client.want]?.name ?? client.want;
      return { block: client.want, label: L(
        `Обещано: ${client.name} · ${block} v${client.wantLevel} · к релизу ${deadline} без сбоев`,
        `Promised: ${client.name} · ${block} v${client.wantLevel} · by release ${deadline} without outages`,
      ) };
    }));
    this.paper.setLedger(this.ledger());
    if (!this.ended) this.teach();

    this.paper.setShelf(this.shelfView());
    if (!this.ended && (run.t - this.workbenchAt >= 0.2 || this.draftShown !== Boolean(run.draft) || this.workbenchSelection.paused !== this.paused)) {
      this.workbenchAt = run.t;
      this.draftShown = Boolean(run.draft);
      this.workbenchSelection.picked = this.picked;
      this.workbenchSelection.paused = this.paused;
      this.paper.setWorkbench(workbenchView(run, this.workbenchSelection));
      this.paper.setSprintCards(sprintCardsView(run, this.workbenchSelection.news, this.workbenchSelection.applied));
    }
    if (run.draft) this.paper.call(null);
    else if (run.lastChance !== null) {
      this.paper.call({ who: `${CALL} · ${L('БАНК', 'THE BANK')}`, text: BANK_TEXT.replace('%s', money(run.lastChance)).replace('%t', String(mortgageSeconds(run))), options: BANK_ANSWERS });
    } else if (run.call) {
      const name = BLOCK_BY_ID[run.call.want]?.name;
      const order = run.call.id === 1 ? firstIndustryOrder(run) : undefined;
      this.paper.call({
        who: `${CALL} · ${run.call.name.toUpperCase()} · ${L('ДО РЕЛИЗА', 'UNTIL RELEASE')}`,
        text: order?.kind === run.call.want ? order.text : (CALL_ASK[run.call.want] ?? L(`А «${name}» у вас есть? Нам без этого никак.`, `Do you have “${name}”? We can’t do without it.`)),
        options: callAnswers(honestMult(run), TUNING.call.sure_mult, promiseSprints(run)),
      });
    } else if (run.offer !== null) {
      const full = money(valuation(run));
      const offer = money(run.offer);
      const chance = Math.round(haggleChance(run) * 100);
      this.paper.call({
        who: `${CALL} · ${L('ПОКУПАТЕЛЬ · ДО РЕЛИЗА', 'A BUYER · UNTIL RELEASE')}`,
        text: L(
          `Ваш продукт стоит <em>${full}</em>, но мы видели код. Даём <em>${offer}</em>. Продукт, правда, закроем.`,
          `Your product is worth <em>${full}</em>, but we have seen the code. We offer <em>${offer}</em>. We will shut the product down, though.`,
        ),
        // short answers: the card must not lie over half of the product
        options: L(
          [`Продать за ${offer}`, `Торговаться: всё или ничего <span>— шанс ${chance}%, выше при малом техдолге</span>`, 'Отказаться'],
          [`Sell for ${offer}`, `Haggle: all or nothing <span>— ${chance}% chance, higher with low tech debt</span>`, 'Decline'],
        ),
      });
    } else if (dilemmaOf(run) && run.dilemma) {
      // a choice with a price: Claude offers to cut a corner, or someone calls and wants an answer
      const d = dilemmaOf(run)!;
      const name = run.dilemma.name.toUpperCase();
      const who: Record<string, string> = {
        claude: L('КЛОД ПРЕДЛАГАЕТ', 'CLAUDE SUGGESTS'),
        client: `${CALL} · ${name}`,
        blogger: `${CALL} · ${L('БЛОГЕР', 'A BLOGGER')}`,
        rival: L(`КОНКУРЕНТ · ЦЕЛЬ: ${name}`, `A COMPETITOR · TARGET: ${name}`),
        press: `${CALL} · ${L('ПРЕССА', 'THE PRESS')}`,
      };
      this.paper.call({ who: (who[d.who] ?? CALL) + L(' · ДО РЕЛИЗА', ' · UNTIL RELEASE'), text: d.text, options: d.options.map((o) => `${o.label} <span>— ${o.note}</span>`) });
    } else this.paper.call(null);

    if (this.termUntil > 0 && this.clock > this.termUntil) {
      this.termUntil = 0;
      this.paper.term(null);
    }
  }

  private taskCaption(task: WorkTask): string {
    const ordered = this.run.tasks.filter((entry) => entry.status === 'active' || entry.status === 'queued');
    const order = ordered.indexOf(task) + 1;
    const eta = this.expectedReady.has(task.id) ? L('к релизу', 'this release') : L('позже', 'later');
    const label = task.status === 'ready' ? L('✓ к релизу', '✓ for release') : task.status === 'backlog' ? L('отложено', 'on hold') : `${task.status === 'active' ? '▶' : `№${order}`} ${Math.min(task.done, task.work)}/${task.work} · ${eta}`;
    const isCurrent = (activeWork(this.run) ?? this.run.tasks.find(entry => entry.status === 'queued'))?.id === task.id;
    if (task.block) {
      const compact = task.status === 'queued' ? `№${order}` : task.status === 'active' ? `▶ ${task.done}/${task.work}` : task.status === 'ready' ? '✓' : 'Ⅱ';
      const title = `${projectName(task.block)} · ${label} · ${L('Управление работой', 'Manage work')}`;
      return `<button class="task-progress" data-map="inspect:${task.block}" title="${title}" aria-label="${title}">${compact}</button>`;
    }
    const canHelp = isCurrent && handy(this.run, 'build') && this.run.energy >= 1 && !this.paused && !this.run.draft;
    const action = `help:${task.id}`;
    const refund = task.cost > 0 && (task.status === 'active' || task.status === 'ready') ? L(` Уже потраченные ${money(task.cost)} не возвращаются.`, ` The ${money(task.cost)} already spent is not refunded.`) : '';
    const api = apiWorkQuote(this.run, task.id);
    const waiting = task.status === 'queued' && isCurrent && this.run.money < task.cost ? L(` · нужно ещё ${money(task.cost - this.run.money)}`, ` · needs ${money(task.cost - this.run.money)} more`) : '';
    return `<button class="task-progress" data-map="${action}" ${action.startsWith('help:') && !canHelp ? 'disabled' : ''} title="${task.status === 'active' ? L('Помочь · 1 сила. Начатую работу нельзя переставить или отложить.', 'Help · 1 energy. Started work cannot be reordered or deferred.') : L('Порядок и прогресс работы', 'Work order and progress')}">${label}${waiting}</button>` +
      (task.status === 'queued' && this.run.tasks.filter((entry) => entry.status === 'queued').indexOf(task) > 0 ? `<button data-map="first:${task.id}" title="${L('Делать раньше', 'Do sooner')}">↑</button>` : '') +
      (task.status === 'backlog' ? `<button data-map="resume:${task.id}" title="${L('Продолжить', 'Resume')}">▶</button>` : '') +
      (task.kind === 'infrastructure' && task.status === 'queued' ? `<button data-map="later:${task.id}" ${this.run.tasks.filter(entry => entry.status === 'queued').at(-1)?.id === task.id ? 'disabled' : ''} title="${L('Делать позже', 'Do later')}">↓</button><button data-map="defer:${task.id}" title="${L('Отложить', 'Defer')}">Ⅱ</button>` : '') +
      (api ? `<button class="task-api" data-map="rush:${task.id}" ${api.affordable ? '' : 'disabled'} title="${L('Ускорить строителей вдвое. Нужен агент на стройке; выпуск на релизе.', 'Double builder speed. Requires a builder; ships at release.')}">⚡ ×2 ${money(api.cost)}</button>` : '') +
      `<button class="task-cancel" data-map="cancel:${task.id}" title="${L('Отменить.', 'Cancel.')}${refund}" aria-label="${L('Отменить работу', 'Cancel work')}">×</button>`;
  }

  private syncSharedWork(): void {
    const board = this.board, run = this.run, z = board.zoom;
    const areas = run.blocks.map(block => {
      const [x, y] = board.onScreen(...board.cell(block.i, block.j));
      return { left: x - 110 * z, right: x + 110 * z, top: y - ((BLOCK_BY_ID[block.kind]?.height ?? 40) + 95) * z, bottom: y + 60 * z };
    });
    for (const key of ['me', ...run.agents.map(agent => `a${agent.id}`)]) {
      const node = board.node(key);
      if (!node) continue;
      const [x, y] = board.onScreen(node.x, node.y);
      areas.push({ left: x - node.displayWidth * z / 2 - 10, right: x + node.displayWidth * z / 2 + 10, top: y - node.displayHeight * z, bottom: y + 70 });
    }
    for (const node of this.cityNodes) {
      const [x, y] = board.onScreen(node.x, node.y);
      areas.push({ left: x - 110 * z, right: x + 110 * z, top: y - node.height * z, bottom: y + 70 });
    }
    // Reserve the full control area, so progress, price and ready-state changes never move it.
    const area = workArea(areas, this.infrastructureArea, this.mapMoved);
    if (!area) return;
    const { x, y, height } = area;
    this.infrastructureArea = area;
    const [ox, oy] = board.onScreen(0, 0);
    const infra = run.tasks.find(task => task.kind === 'infrastructure');
    const current = activeWork(run) ?? run.tasks.find(task => task.status === 'queued');
    const tasks = [...run.tasks].sort((a, b) => Number(b.id === current?.id) - Number(a.id === current?.id));
    const rows = tasks.map(task => {
      const name = task.kind === 'infrastructure' ? L('Расширение', 'Expansion') + ` v${run.infrastructure + 1}` : projectName(task.block ?? task.card ?? task.kind);
      if (task.block) return `<div data-work-id="${task.id}" class="map-work-item"><button data-map="inspect:${task.block}">${name} · ${task.done}/${task.work} ›</button></div>`;
      return `<div data-work-id="${task.id}" class="map-work-item${task.status === 'ready' ? ' is-ready' : ''}"><span class="map-work-name" title="${name}">${name}</span><div class="map-work-actions">${this.taskCaption(task)}</div></div>`;
    }).join('');
    this.paper.pruneTags('task:', new Set());
    const group = this.paper.tag('infrastructure', x, y,
      `<div class="map-infrastructure" style="--work-height:${height}px"><button data-map="infrastructure" ${infra ? 'disabled' : ''} title="${L('Общая инфраструктура · не занимает клетку продукта', 'Shared infrastructure · uses no product cell')}"><span class="infra-rack" aria-hidden="true">▰<br>▰<br>▰</span><b>${L('Инфраструктура', 'Infrastructure')} v${run.infrastructure}` +
      (!infra ? `<small>${L('Расширить', 'Expand')} · ${money(Math.round(PRODUCTION.infrastructure.cost * PRODUCTION.infrastructure.cost_growth ** run.infrastructure))}</small>` : '') + `</b></button><div class="map-work-list">${rows}</div></div>`, 'map-task map-shared-work');
    const bounds = group.getBoundingClientRect();
    const action = current && group.querySelector(`[data-work-id="${current.id}"] .task-progress`);
    const row = action ? action.getBoundingClientRect() : null;
    const targetY = row ? y + (row.top + row.height / 2 - bounds.top) / (bounds.width / 276) : y + 26;
    this.infrastructurePoint = [(x - 140 - ox) / z, (targetY - oy) / z];
  }

  /** The ledger next to the money: every line of income and spending per second, and the debt with its limit. */
  private ledger(): string {
    const run = this.run;
    const f = flows(run);
    const limit = TUNING.debt.down_at;
    const part = Math.min(1, run.debt / limit);
    let income: string;
    const subs = L('подписки', 'subscriptions');
    const count = customerCount(run);
    const clients = `${count} ${plural(count, L(['клиент', 'клиента', 'клиентов'], ['client', 'clients', 'clients']))}`;
    if (run.down) income = `<p class="bad"><span>${subs}: ${L('продукт лежит', 'product is down')}</span><b>$0</b></p>`;
    else if (count > 0 && !isLive(run, 'pay')) income = `<p class="bad"><span>${subs}: ${L('нет «оплаты»', 'no “payments”')}</span><b>$0</b></p>`;
    else income = `<p class="in"><span>${subs} · ${clients}</span><b>+${rate(f.income)}</b></p>`;
    const note =
      part >= 0.66
        ? L('почти предел: ставь агента на починку', 'almost at the limit: put an agent on fixes')
        : run.debt < 1
          ? L('проверка: −50% нового долга; эксперт: без долга', 'review: −50% new debt; expert: no new debt')
          : L(`при ${limit} продукт упадёт; снимает починка`, `at ${limit} the product goes down; fixes remove it`);
    const blocks = `${run.live.size} ${plural(run.live.size, L(['блок', 'блока', 'блоков'], ['block', 'blocks', 'blocks']))}`;
    return (
      income +
      `<p><span>${L('ты: еда и жильё', 'you: food and rent')}</span><b>${rate(-f.living)}</b></p>` +
      `<p><span>${L('агенты', 'agents')} · ${run.agents.length}</span><b>${rate(-f.agents)}</b></p>` +
      `<p><span>${L('хостинг', 'hosting')} · ${blocks}</span><b>${rate(-f.hosting)}</b></p>` +
      `<p><span>${L('токены клиентов', 'clients’ tokens')}</span><b>${rate(-f.tokens)}</b></p>` +
      `<p class="debt${part >= 0.66 ? ' bad' : ''}"><span>${L('техдолг', 'tech debt')}</span><u><s style="width:${Math.round(part * 100)}%"></s></u><b>${Math.floor(run.debt)} ${OF} ${limit}</b></p>` +
      `<small>${note}</small>`
    );
  }

  /**
   * The line under the sprint ruler: the one thing to do next, in plain words. The first startup is
   * walked through by it step by step: block, landing, payment, client, profit.
   */

  /**
   * Teaching through play: Claude says one thing at the moment it matters. Most things once; what stops
   * the money (no way to charge the clients) — again and again until it is fixed. Never while his card
   * is busy with a release.
   */
  private teach(): void {
    if (this.hooks.restored || this.paused || this.run.draft || (this.termUntil > 0 && this.clock < this.termUntil - 4)) return;
    const run = this.run;
    const tell = (key: string, lines: string[]): boolean => {
      if (this.said.has(key)) return false;
      this.said.add(key);
      this.say([CLAUDE, ...lines], 13);
      playSound('quip');
      return true;
    };
    if (run.tasks.length > 1 && tell('t:queue', L(
      ['Можно поставить несколько блоков.', 'Номера над ними — порядок работ.', 'Крестик отменяет стройку.', 'Готовое заработает на релизе.'],
      ['Place several buildings ahead.', 'Numbers show their build order.', 'The cross cancels construction.', 'Finished work goes live at release.'],
    ))) return;
    if (run.stage >= 2 && tell('t:clouds', L(
      ['Город растёт вместе с компанией.', 'Числа рядом — сколько клиентов.', 'Кликни здания: увидишь,', 'чего им не хватает.'],
      ['The city grows with your company.', 'The numbers count your customers.', 'Click the buildings to see', 'what they need.'],
    ))) return;
    if (run.debt >= 10 && tell('t:debt', L(
      ['Техдолг растёт. Починка снимает его.', 'Проверка уменьшает новые баги вдвое.', 'Опытный чинит быстрее, эксперт — ещё быстрее.'],
      ['Tech debt is rising. Fixes remove it.', 'Review halves new bugs.', 'Experienced agents fix faster; experts faster still.'],
    ))) return;
    if (run.blocks.length >= cellsMax(run) && tell('t:full', L(
      officeQuote(run, 'land') !== null ? ['Чертёж полон. Открой «Блоки»', 'и нажми «Расширить участок».'] : ['Чертёж полон. Улучшай здания', 'на месте — кликни любое.'],
      officeQuote(run, 'land') !== null ? ['The blueprint is full. Open Blocks', 'and choose “Expand plot”.'] : ['The blueprint is full. Click', 'a building to improve it in place.'],
    ))) return;
    if (run.clients.some((client) => !client.happy) && tell('t:ask', L(
      ['Ключевой договор недоволен.', 'Нажми на здание клиента:', 'в окне виден его запрос', 'и сколько спринтов он готов ждать.'],
      ['A key contract is unhappy.', 'Click the customer building:', 'its request and remaining patience', 'are shown above it.'],
    ))) return;
    if (run.stage >= 2 && run.energy >= TUNING.crunch.max && tell('t:hands', L(
      ['Силы — не только на код.', 'Справа внизу можно самому', 'заняться продвижением или починкой.'],
      ['Energy is not only for code.', 'Bottom right, you can do', 'promotion or fixes yourself.'],
    ))) return;
    if (companyTotals(run).utilization > 0.85) tell('t:capacity', L(
      ['Клиентов всё больше.', 'Загрузка видна справа в блоках.', 'Нажми «Инфраструктура» —', 'расширение включится на релизе.'],
      ['More customers are arriving.', 'Load is shown in Blocks on the right.', 'Choose “Infrastructure” —', 'the expansion starts at release.'],
    ));
  }

  /** A handful of coral squares thrown out of a point: something is finished here. */
  private burst(x: number, y: number, count: number): void {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      const tx = x + Math.cos(a) * 70;
      const ty = y + Math.sin(a) * 36 - 20;
      this.squares.fly({ x: x - 6, y: y - 6, w: 12, h: 12 }, { x: tx - 4, y: ty - 4, w: 8, h: 8 }, 1, PALETTE.coral, 30, [0.32, 0.5]);
    }
  }

  private shelfView(): ShelfSection[] {
    const run = this.run;

    // what opens the stronger agents and more desks is written out: it is a goal, not a secret
    const stage3 = `${rate(TUNING.stage3_mrr / TUNING.sprint_s)}${PER_S}`;
    const unlock =
      run.stage === 1
        ? L('опытный и эксперт — после первого платящего клиента', 'experienced and expert unlock after the first paying client')
        : run.stage === 2
          ? L(`город — при подписках ${stage3}; дополнительные места покупаются отдельно`, `city at ${stage3} subscriptions; extra desks are purchased separately`)
          : '';
    const rows: ShelfKeys[] = [
      {
        owner: 'office',
        keys: [{ id: 'desks', title: officeQuote(run, 'desks') === null
          ? L(`Все ${agentSlots(run)} мест открыты`, `All ${agentSlots(run)} desks unlocked`)
          : L(`+ Рабочее место · ${money(officeQuote(run, 'desks')!)}`, `+ Agent desk · ${money(officeQuote(run, 'desks')!)}`),
          tip: L('Ещё одно место для найма. Сам агент оплачивается отдельно.', 'One more hiring slot. Agent setup is paid separately.'),
          off: officeQuote(run, 'desks') === null || run.money < officeQuote(run, 'desks')! }],
      },
      {
        owner: 'hire',
        keys: TIERS.map(t => ({
          id: t,
          title: `+ ${TIER_NAME[t]}<small>${L('Найм', 'Hire')} ${money(OFFICE.hire[t])} · ${money(TUNING.tiers[t].cost_per_s)}${PER_S}</small>`,
          note: `${dec(Number((TUNING.tiers[t].work_per_s / TUNING.tiers.fast.work_per_s).toFixed(1)))}× · ${t === 'think' ? L('без багов', 'no bugs') : t === 'normal' ? L('мало багов', 'few bugs') : L('много багов', 'many bugs')}`,
          bar: TUNING.tiers[t].work_per_s / TUNING.tiers.think.work_per_s,
          tip: TIER_NOTE[t], off: !canHire(run, t),
        })),
      },
      ...(run.agents.length >= 6 ? [{
        owner: 'team', label: L(`Все ${run.agents.length}`, `All ${run.agents.length}`),
        keys: LANES.map(lane => ({ id: lane, title: LANE_NAME[lane], tip: run.agents.map(a => `№${a.id}`).join(', ') })),
      }] : []),
      ...run.agents.map((a) => ({
        owner: `a${a.id}`,
        label: `<button class="agent-inspect" data-o="info" data-l="${a.id}" title="${TIER_NAME[a.tier]} · ${L('Производительность и стоимость', 'Performance and cost')}"><b>${NO}${a.id}</b><small>${TIER_NAME[a.tier]}</small><i aria-hidden="true">ⓘ</i></button>`,
        keys: [...LANES.map((l) => ({ id: l as string, title: LANE_NAME[l] })), { id: 'drop', title: '×' }],
        on: a.lane as string,
      })),
    ];
    return [
      {
        id: 'agents',
        title: L(`АГЕНТЫ · ${run.agents.length} ИЗ ${agentSlots(run)}`, `AGENTS · ${run.agents.length} OF ${agentSlots(run)}`),
        hint: `${rate(-flows(run).agents)}${PER_S} · ${L('без дела — бесплатно', 'idle — free')}`,
        note: unlock,
        rows,
      },
      {
        id: 'me',
        title: L('ТЫ · ОДИН ЧЕЛОВЕК', 'YOU · ONE PERSON'),
        note: L('Проверка: +25% скорости · −50% новых багов', 'Review: +25% speed · −50% new bugs'),
        hint: `${ENERGY} ${'■'.repeat(Math.floor(run.energy))}${'□'.repeat(TUNING.crunch.max - Math.floor(run.energy))}`,
        rows: [
          // Review speeds up one lane and halves its new debt; chosen once a sprint.
          {
            owner: 'me',
            label: run.reviewLocked ? L('проверяю <b>до релиза</b>', 'review <b>set</b>') : L('проверяю', 'I review'),
            keys: LANES.map((l) => ({ id: l as string, title: LANE_NAME[l] })),
            on: run.review,
            lock: run.reviewLocked,
          },
          // what he does with his own hands: one point of strength a square, on any lane
          { owner: 'hand', label: L('руками', 'by hand'), keys: LANES.map((l) => ({ id: l as string, title: HAND_NAME[l], off: run.energy < 1 || !handy(run, l) })) },
        ],
      },
    ];
  }

  /** Laptops on the sheet follow the list of agents; each one's connector follows its lane. */
  private syncAgents(): void {
    const run = this.run;
    const board = this.board;
    const task = activeWork(run) ?? run.tasks.find((entry) => entry.status === 'queued');
    const site = task?.block ? run.blocks.find((block) => block.kind === task.block) : undefined;
    // where the work of a lane goes on the sheet
    const targetOf = (lane: Lane): Pt | null => {
      if (!handy(run, lane)) return null;
      if (lane === 'build') {
        if (!site) return task ? this.infrastructurePoint : null;
        const [cx, cy] = board.cell(site.i, site.j);
        return [cx, cy + 56];
      }
      const block = run.blocks.find((entry) => entry.kind === (lane === 'fix' ? 'core' : 'landing') && (lane === 'fix' || entry.live));
      if (!block) return null;
      const [cx, cy] = board.cell(block.i, block.j);
      return [cx, cy + 56];
    };
    const targets = { build: targetOf('build'), fix: targetOf('fix'), promo: targetOf('promo') };
    const sig = JSON.stringify([run.agents.map((a) => [a.id, a.lane]), targets, task?.id, run.review]);
    if (sig === this.routeSig) return;
    this.routeSig = sig;

    // the founder's own connector: from the desk to what he checks. His squares are ink, not coral:
    // every square of work on that lane is looked at by a human
    const mine = targets[run.review];
    const from: Pt = [DESK[0] + 118, DESK[1] - 64];
    const activity = (lane: Lane): string => lane === 'build' ? `${lane}:${task?.id}` : lane;
    if (mine && !(run.review === 'build' && task && !site)) board.route('me', [from, [from[0], BUS_Y + BUS_GAP], [mine[0], BUS_Y + BUS_GAP], mine], true, activity(run.review));
    else board.dropRoute('me');

    const ids = new Set(run.agents.map((a) => `a${a.id}`));
    for (const key of [...this.faces.keys()]) {
      if (key === 'me' || ids.has(key)) continue;
      this.faces.get(key)?.destroy();
      this.faces.delete(key);
      board.dropNode(key);
      board.dropRoute(key);
    }
    run.agents.forEach((a, k) => {
      const key = `a${a.id}`;
      const [x, y] = AGENT_SLOTS[k];
      const old = board.node(key);
      if (old && (old.x !== x || old.y !== y)) {
        // an agent was let go: the rest move up
        old.setPosition(x, y);
        this.faces.get(key)?.destroy();
        this.faces.delete(key);
      }
      if (!old) this.place(key, 'laptop', x, y, 118, true);
      const img = board.node(key)!;
      if (!this.faces.has(key)) {
        // the picture may still be popping in: its final size is what counts
        const s = 118 / img.height / 0.5;
        this.addFace(key, x + 14 * s, y - 128 * s, 14 * s, 12 * s, 0.37);
      }
      const target = targets[a.lane];
      if (target) {
        let points = agentRoute(k, target);
        if (a.lane === 'build' && !site) {
          const outside: Pt = [target[0] - 20, target[1]];
          if (target[0] < DESK[0] + 118) {
            const desk = board.node('me')!;
            const above: Pt = [DESK[0] + desk.displayWidth / 2 + 24, DESK[1] - desk.displayHeight - 24];
            points = [...agentRoute(k, above), [outside[0], above[1]], outside, target];
          } else if (target[1] > BUS_Y && target[0] > AGENT_SLOTS[5][0] + 100) {
            points = [...agentRoute(k, [AGENT_SLOTS[5][0] + 100, target[1]]), target];
          } else points = [...agentRoute(k, outside), target];
        }
        board.route(key, points, true, activity(a.lane));
      }
      else board.dropRoute(key);
    });
  }

  private syncCity(): void {
    const run = this.run;
    const board = this.board;
    if (this.ended) {
      this.paper.setCity(null);
      return;
    }
    const ctx = companyContext(run);
    const groups = SEGMENTS.map((id) => {
      const segment = segmentView(run.market, ctx, id);
      const contracts = run.clients.filter((client) => (client.type === 'corp' || client.type === 'gov' ? 'large' : client.type === 'mid' ? 'medium' : 'small') === id);
      return {id, segment, contracts, count: segment.count + contracts.length};
    }).filter((group) => group.count > 0);
    this.syncStage(1100);
    const outlet = groups.length ? run.blocks.filter((block) => block.live).sort((a,b) => (b.i-b.j)-(a.i-a.j))[0] : undefined;
    const productSignature = outlet ? `${outlet.kind}:${outlet.i}:${outlet.j}` : '';
    if (productSignature !== this.cityProductSignature) {
      if (outlet) {
        const [x,y] = board.cell(outlet.i,outlet.j);
        const edgeY = y - (BLOCK_BY_ID[outlet.kind]?.height ?? 20) / 2;
        board.route('city-feed', [[x+96,edgeY], [TRUNK_X,edgeY], [TRUNK_X,0]], false);
      } else board.dropRoute('city-feed');
      this.cityProductSignature = productSignature;
    }
    const nodes: typeof this.cityNodes = [];
    groups.forEach((group, column) => {
      const amount = this.cityCollapsed ? 1 : Math.min(4, group.count);
      for (let row = 0; row < amount; row++) {
        const [x,y] = CLIENT_SLOTS[column * 4 + row];
        const contract = group.contracts[row];
        const corporate = [...IDEAS.corp, ...IDEAS.gov];
        const texture = contract?.texture ?? (group.id === 'large' ? corporate[row % corporate.length].texture : run.idea.aud.texture);
        nodes.push({
          id: `city:${group.id}:${row}:${contract?.id ?? 'group'}`,
          segment: group.id, texture,
          title: contract ? `${contract.name} · ${rate(clientPay(run, contract) / TUNING.sprint_s)}${PER_S}` : L(`${SEGMENT_TITLES[group.id]} компании · потребности и тариф`, `${SEGMENT_TITLES[group.id]} companies · needs and tariff`),
          x,y,height: contract ? CLIENT_LOOK[contract.type].height : group.id === 'large' ? 150 : 118,
          chain: contract?.type === 'mid' || (!contract && group.id === 'medium'),
        });
      }
    });
    const signature = JSON.stringify(nodes.map((node) => [node.id, node.texture, node.x, node.y, node.height, node.chain]));
    if (signature !== this.citySignature) {
      const next = new Set(nodes.map((node) => node.id));
      for (const old of this.cityNodes) {
        if (next.has(old.id)) continue;
        board.node(old.id)?.setVisible(false);
        board.node(`${old.id}:branch`)?.setVisible(false);
        board.dropNode(old.id);
        board.dropNode(`${old.id}:branch`);
        board.dropRoute(old.id);
      }
      for (const node of nodes) {
        if (node.chain) {
          const branch = board.node(`${node.id}:branch`) ?? this.place(`${node.id}:branch`, node.texture, node.x - 38, node.y - 20, node.height * .82);
          branch.setPosition(node.x - 38, node.y - 20);
        }
        const image = board.node(node.id) ?? this.place(node.id, node.texture, node.x, node.y, node.height, true);
        image.setPosition(node.x, node.y);
        board.route(node.id, [[TRUNK_X - 80, 0], [TRUNK_X, 0], [TRUNK_X, node.y - 56], [node.x - image.width * (node.height / image.height) / 2 - 10, node.y - 56]]);
      }
      this.citySignature = signature;
    }
    this.cityNodes = nodes;
    const z = board.zoom;
    const [hx,hy] = board.onScreen(760 + Math.max(0, groups.length - 1) * 225 / 2, -425);
    const view: CityView = {
      total: customerCount(run), collapsed: this.cityCollapsed,
      heading: groups.length
        ? {x: this.mapMoved ? hx : Math.min(hx, 1180), y: hy, width: Math.min(420, Math.max(275, groups.length * 225 * z))}
        : {x: 1155, y: 300, width: 275},
      groups: groups.map((group, column) => {
        const lastRow = this.cityCollapsed ? 0 : Math.min(4, group.count) - 1;
        const [sx,sy] = CLIENT_SLOTS[column * 4 + lastRow];
        const [x,y] = board.onScreen(sx,sy+12);
        return {id:group.id,title:SEGMENT_TITLES[group.id],count:group.count,happiness:Math.round(group.segment.satisfaction),x,y,width:210*z};
      }),
      nodes: nodes.map((node) => {
        const [x,y] = board.onScreen(node.x,node.y);
        return {id:node.id,segment:node.segment,title:node.title,x,y,width:150*z,height:node.height*z};
      }),
    };
    const selected = view.groups.find((group) => group.id === this.workbenchSelection.selectedSegment);
    this.workbenchSelection.clientAnchor = selected ? { x: selected.x, y: selected.y } : undefined;
    this.paper.setCity(view);
  }

  /** A new stage: the camera pulls back and shows more of the sheet. */
  private syncStage(ms: number): void {
    if (this.mapMoved) return;
    const count = customerCount(this.run);
    const segments = new Set<string>(this.run.market.groups.filter((group) => group.profiles.some((profile) => profile.count > 0)).map((group) => group.id));
    for (const client of this.run.clients) segments.add(client.type === 'corp' || client.type === 'gov' ? 'large' : client.type === 'mid' ? 'medium' : 'small');
    const groups = segments.size;
    const want = this.run.stage >= 3 || count > 4 || groups > 1 || this.run.land > 0 ? 3 : this.run.stage === 2 || count || this.run.market.opened ? 2 : 1;
    const teamRows = this.run.agents.length > AGENT_SLOTS.length / 2 ? 2 : 1;
    if (this.stageShown === want * 10 + teamRows && this.cityColumnsShown === groups) return;
    this.stageShown = want * 10 + teamRows;
    this.cityColumnsShown = groups;
    const v = STAGE_VIEW[Math.max(want, teamRows > 1 ? 2 : 1) - 1];
    // Reserve the whole caption, not just the building centre, before the shelf at x=1340.
    const rightEdge = groups ? CLIENT_SLOTS[(groups - 1) * 4][0] + 105 : 0;
    const centre = Math.max(v.x, rightEdge - (1322 - VIEW_AT[0]) / v.zoom);
    const duration = groups && this.board.onScreen(rightEdge, 0)[0] > 1322 ? 0 : ms;
    this.board.view(v.zoom, centre, teamRows > 1 ? Math.max(v.y, want <= 2 ? 300 : 225) : v.y, VIEW_AT[0], VIEW_AT[1], duration, () => undefined);
  }

  /** Subscriptions: green squares keep flying from the clients into the money. */
  private flowMoney(dt: number): void {
    this.payAt -= dt * Math.min(this.speed, 3);
    if (this.payAt > 0) return;
    const run = this.run;
    const ctx = companyContext(run);
    const paying = SEGMENTS.map((id, index) => ({
      index,
      income: (segmentView(run.market, ctx, id).income + run.clients.filter((client) => (client.type === 'corp' || client.type === 'gov' ? 'large' : client.type === 'mid' ? 'medium' : 'small') === id).reduce((sum, client) => sum + clientPay(run, client), 0)) / TUNING.sprint_s,
    })).filter((group) => group.income > 0);
    if (paying.length === 0) {
      this.payAt = 0.5;
      return;
    }
    this.payAt = Math.max(0.18, 1.4 / (1 + Math.sqrt(paying.reduce((sum, group) => sum + group.income, 0) / 10)));
    const group = paying[this.payTurn++ % paying.length];
    const city = this.cityNodes.filter((node) => node.segment === SEGMENTS[group.index]);
    const source = city[this.payTurn % Math.max(1, city.length)];
    if (!source) return;
    const [x,y] = this.board.onScreen(source.x,source.y-70);
    const count = Math.min(4, Math.max(1, Math.ceil(Math.log10(1 + group.income))));
    this.squares.fly({ x: x - 20, y: y - 14, w: 40, h: 28 }, MONEY_RECT, count, PALETTE.money, 200, [0.9, 1.3], PALETTE.money);
    if (this.payTurn % 6 === 0) this.paper.popMoney();
  }

  private tickNews(dt: number): void {
    this.newsHold -= dt;
    this.newsAt -= dt;
    if (this.newsAt > 0 || this.newsHold > 0) return;
    this.newsAt = 17;
    this.paper.setNews(NEWS[this.newsIndex++ % NEWS.length], this.newsHint());
  }

  /** the right end of the news line: what the news has done and for how long, then the pause key */
  private newsHint(): string {
    const parts = this.run.mods.map((m) => L(`${m.tag} · ещё ${m.left} ${SPR}`, `${m.tag} · ${m.left} more ${SPR}`));
    return [...parts, L('Esc — пауза, звук', 'Esc — pause, sound')].join('   ');
  }

  /** an event of the run takes the news line and holds it for a while */
  private news(text: string): void {
    this.paper.setNews(text, this.newsHint());
    this.workbenchSelection.news = { title: L('Новости стартапа', 'Startup news'), text };
    this.workbenchAt = -Infinity;
    this.newsHold = 12;
    this.newsAt = 12;
  }

  /** Claude's card for `seconds` */
  private say(lines: string[], seconds: number): void {
    this.paper.term(lines);
    this.termUntil = this.clock + seconds;
  }

  private place(id: string, texture: string, x: number, y: number, height: number, pop = false): Phaser.GameObjects.Image {
    const source = this.textures.get(`node_${texture}`).getSourceImage();
    return this.board.addNode(id, texture, x, y, height / source.height, pop);
  }

  /** Claude on a laptop screen: a coral square tilted with the screen */
  private addFace(key: string, x: number, y: number, w: number, h: number, rot: number): void {
    const face = this.add.rectangle(x, y, w, h, PALETTE.coral).setRotation(rot);
    this.board.add(face);
    this.faces.set(key, face);
  }
}

export { sprints } from './run-hint';
