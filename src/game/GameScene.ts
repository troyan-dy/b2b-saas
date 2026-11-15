import Phaser from 'phaser';
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
  LEFT_UNKNOWN,
  NEWS,
  NEWS_EVENT,
  releaseLines,
  REWORK_SAYS,
  TIER_NAME,
} from '../content/texts';
import { L } from '../core/lang';
import { logEvent, metrics } from '../core/metrics';
import type { Rng } from '../core/rng';
import { playSound, unlockSound } from '../core/sound';
import { PALETTE } from '../data/palette';
import { money, PER_S, plural, rate } from '../ui/format';
import type { Paper, ShelfKeys, ShelfSection } from '../ui/paper';
import type { WorkbenchAction } from '../ui/workbench';
import { projectName, workbenchView, type WorkbenchSelection } from '../ui/workbench-view';
import { companyContext, companyTotals, customerCount } from '../systems/company/company';
import { SEGMENTS, schedulePrice, segmentView } from '../systems/company/market';
import {
  answerCall,
  answerDilemma,
  answerLastChance,
  answerOffer,
  activeWork,
  busy,
  canHire,
  cellsMax,
  clientPay,
  crunch,
  chooseCard,
  deferTask,
  demolish,
  dilemmaOf,
  expandInfrastructure,
  fire,
  flows,
  freeCells,
  friendsAt,
  haggleChance,
  handy,
  hire,
  honestMult,
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
} from '../systems/run/run';
import { Board, type BlockOnSheet, type SlotOnSheet } from '../view/board';
import type { Pt } from '../view/iso';
import { Squares } from '../view/squares';
import { AGENT_SLOTS, BUS_GAP, BUS_Y, DESK, MARKET, MONEY_RECT, STAGE_VIEW, VIEW_AT } from './layout';

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
const onOff = (on: boolean, ru: [string, string]): string => L(on ? ru[0] : ru[1], on ? 'on' : 'off');

/** How a client of each type stands on the sheet: the height of its picture and how many squares one payment is. */
export const CLIENT_LOOK: Record<ClientType, { height: number; squares: number }> = {
  small: { height: 118, squares: 1 },
  mid: { height: 136, squares: 1 },
  startup: { height: 112, squares: 1 },
  corp: { height: 150, squares: 3 },
  gov: { height: 158, squares: 4 },
};

export interface GameHooks {
  /** Resuming a save does not replay the first-run tutorial. */
  restored?: boolean;
  /** called every simulated step, before it: a bot plays here */
  beforeStep?: (run: Run) => void;
  onEnd: (run: Run) => void;
  /** the player drops the startup from the pause card */
  onQuit: () => void;
  /** the sound and the music can be switched from the pause card */
  audio?: { readonly sound: boolean; readonly music: boolean; readonly track: string; toggle(what: 'sound' | 'music' | 'track'): void };
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
  /** Esc: the game stands still and asks what next */
  private pauseCard = false;
  /** what clients say aloud: a line over the building of client `id` until the clock reaches `until` */
  private readonly quotes = new Map<number, { text: string; until: number }>();
  private readonly workbenchSelection: WorkbenchSelection = { picked: null, selectedSegment: 'small', previewPrices: {} };
  private workbenchAt = -Infinity;
  private draftShown = false;

  constructor(run: Run, rng: Rng, paper: Paper, hooks: GameHooks) {
    super('game');
    this.run = run;
    this.rng = rng;
    this.paper = paper;
    this.hooks = hooks;
  }

  preload(): void {
    for (const key of ['desk', 'laptop']) this.load.image(`node_${key}`, `assets/img/nodes/${key}.webp`);
  }

  create(): void {
    this.board = new Board(this);
    this.squares = new Squares(this, this.rng, 400);

    // the founder: the only human on the sheet
    const desk = this.place('me', 'desk', DESK[0], DESK[1], 196);
    this.addFace('me', DESK[0] - desk.displayWidth / 2 + 103.5 * desk.scaleX, DESK[1] - desk.displayHeight + 98 * desk.scaleY, 26 * desk.scaleX, 22 * desk.scaleY, -0.38);

    this.paper.onShelf = (section, item) => this.onShelf(section, item);
    this.paper.onLane = (owner, key) => this.onKey(owner, key);
    this.paper.onCell = (id) => this.onCell(id);
    this.paper.onAnswer = (k) => this.onAnswer(k);
    this.paper.onWorkbench = (action) => this.onWorkbench(action);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKeyDown(e));
    // the tab is hidden: the startup waits — money must not burn while nobody is looking
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.ended) {
        this.pauseCard = true;
        this.paused = true;
      }
    });

    for (const b of this.run.blocks) this.landed.set(b.kind, b.done);
    this.newsAt = 6;
    this.paper.setNews(`${pitch(this.run.idea)}. ${this.hooks.restored ? L('Стартап вернулся к работе', 'The startup is back at work') : L('Пока что это три слова и один человек', 'So far it is three words and one person')}`, this.newsHint());
    if (!this.hooks.restored) this.say(
      [
        CLAUDE,
        ...L(
          ['Привет. Я твоя команда — вся.', 'Выбери справа «Обёртку над Клодом»', 'и поставь её на чертёж. Клик по', 'стройке или Enter — помочь руками.'],
          ['Hi. I am your team — all of it.', 'Pick “Claude Wrapper” on the right', 'and put it on the blueprint. Click', 'the site or press Enter to help.'],
        ),
      ],
      600,
    );
    this.syncStage(0);
    this.show();
    window.__GAME__.ready = true;
  }

  update(_time: number, deltaMs: number): void {
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
    if (action.type === 'choose-card') {
      if (chooseCard(run, action.id)) {
        this.acc = 0;
        this.pauseCard = false;
        this.paused = false;
        playSound('buy', 2);
        this.workbenchAt = -Infinity;
        this.show();
      }
      return;
    }
    if (run.draft || this.paused) return;
    unlockSound();
    let changed = true;
    switch (action.type) {
      case 'place': this.onShelf('blocks', action.block); break;
      case 'upgrade': changed = upgrade(run, action.block); break;
      case 'demolish':
        this.picked = null;
        this.razing = action.block;
        break;
      case 'move': changed = moveTask(run, action.task, action.direction); break;
      case 'defer': changed = deferTask(run, action.task); break;
      case 'resume': changed = resumeTask(run, action.task); break;
      case 'expand-infrastructure': changed = expandInfrastructure(run); break;
      case 'select-segment': this.workbenchSelection.selectedSegment = action.segment; break;
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
    const to: Pt = lane === 'build' ? site ? this.board.top(site) : [DESK[0] + 100, DESK[1] - 150] : lane === 'fix' ? this.board.cell(0, 0) : MARKET;
    const [tx, ty] = this.board.onScreen(...to);
    // code is Claude's colour; a post, a call and a fix are the human's own ink
    this.squares.fly({ x: fx - 10, y: fy - 10, w: 20, h: 20 }, { x: tx - 20, y: ty - 10, w: 40, h: 20 }, 1, lane === 'build' ? PALETTE.coral : PALETTE.ink, 160, [0.35, 0.45]);
    if (HAND_DONE[lane]) this.paper.pop(tx, ty - 34, HAND_DONE[lane], 'good');
  }

  private onKey(owner: string, key: string): void {
    if (this.paused || this.run.draft || this.ended) return;
    this.workbenchAt = -Infinity;
    unlockSound();
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
    const id = Number(owner.slice(1));
    if (key === 'drop') fire(this.run, id);
    else setLane(this.run, id, key as Lane);
    playSound('ui');
  }

  private onAnswer(k: number): void {
    if (this.run.draft || this.ended) return;
    this.workbenchAt = -Infinity;
    playSound('ui');
    if (this.pauseCard) {
      const audio = this.hooks.audio;
      if (k === this.pauseOptions().length - 1) {
        this.hooks.onQuit();
        return;
      }
      // the switches leave the pause on: the player hears the change and goes back when ready
      if (audio && k === 1) audio.toggle('music');
      else if (audio && k === 2) audio.toggle('track');
      else if (audio && k === 3) audio.toggle('sound');
      else {
        this.pauseCard = false;
        this.paused = false;
      }
      return;
    }
    // one card at a time, the most urgent first: the bank, a client on the line, the buyer
    if (this.run.lastChance !== null) answerLastChance(this.run, k === 0);
    else if (this.run.call) answerCall(this.run, k === 1);
    else if (this.run.offer !== null) answerOffer(this.run, k === 0 ? 'sell' : k === 1 ? 'haggle' : 'no');
    else answerDilemma(this.run, k);
    this.paper.call(null);
  }

  private onKeyDown(e: KeyboardEvent): void {
    unlockSound();
    if (this.ended || this.run.draft) return;
    if (e.code === 'Escape') {
      // first Esc drops the picked block or the wrecking tool, the next one stops the clock
      if (this.picked || this.razing) {
        this.picked = null;
        this.razing = null;
      }
      else {
        this.pauseCard = !this.pauseCard;
        this.paused = this.pauseCard;
      }
      return;
    }
    if (this.pauseCard) {
      const k = /^Digit([1-9])$/.exec(e.code);
      if (k && Number(k[1]) <= this.pauseOptions().length) this.onAnswer(Number(k[1]) - 1);
      return;
    }
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
        else if (e.lane === 'build' && !block) {
          // A card or infrastructure project is work at the founder's desk, not at a phantom cell.
          const agent = this.board.node(key);
          if (agent) {
            const [sx, sy] = this.board.onScreen(agent.x, agent.y - 100);
            const [tx, ty] = this.board.onScreen(DESK[0] + 100, DESK[1] - 150);
            this.squares.fly({ x: sx, y: sy, w: 10, h: 10 }, { x: tx, y: ty, w: 20, h: 16 }, 1, PALETTE.coral, 60, [0.4, 0.65]);
          }
        } else if (this.board.hasRoute(key)) this.board.flow(key, PALETTE.coral, 620, land);
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
                  ['Тёмные квадраты от стола — это ты:', 'ты проверяешь одно направление.', 'Там работа идёт быстрее и без долга.', 'Сменить его — клавиши справа внизу.'],
                  ['The dark squares from the desk are', 'you: you review one lane. Work there', 'goes faster and leaves no debt.', 'Change it with the keys bottom right.'],
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
        this.paper.pop(x, y - 30, L('готово — ждёт релиза', 'done — waiting for the release'), '');
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
        const pool = e.demo ? LEFT_DEMO : e.closed ? LEFT_CLOSED : e.reason ? LEFT_KNOWN : LEFT_UNKNOWN;
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
                ['Ключевой клиент просит доработку.', 'В таблице продукта поставь новый', 'уровень в очередь. Сделаем — платит', 'больше. Не сделаем — уйдёт.'],
                ['A key client asks for an upgrade.', 'Queue the next level in the product', 'table. Ship it — the client pays more.', 'Don’t — the client leaves.'],
              ),
            ],
            14,
          );
        }
        break;
      }
      case 'reveal': {
        const [x, y] = this.board.onScreen(MARKET[0], MARKET[1]);
        this.paper.pop(x, y - 20, `${L('клиенты просят', 'clients ask for')}: ${BLOCK_BY_ID[e.kind]?.name ?? e.kind}`, 'good');
        playSound('quip');
        logEvent(`reveal:${e.kind}`);
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
    const board = this.board;
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
    this.paper.setCells(cells);

    const keep = new Set<string>();
    for (const b of blocks) {
      const kind = BLOCK_BY_ID[b.kind];
      const [x, y] = board.onScreen(...board.side(b));
      const id = `b:${b.kind}`;
      keep.add(id);
      const level = run.blocks.find((r) => r.kind === b.kind)?.level ?? 1;
      this.paper.tag(id, x, y, level > 1 ? `${kind.short} v${level}` : kind.short, b.built ? 'face' : 'face hot');
      const task = run.tasks.find((entry) => entry.block === b.kind);
      if (task) {
        // how much of the site is done: a number above it
        const [tx, ty] = board.onScreen(...board.top(b));
        keep.add(`b:n${b.kind}`);
        // the first site of the run says in words that it can be clicked
        const status = task.status === 'backlog' ? L('в бэклоге', 'in backlog') : task.status === 'queued' ? L('в очереди', 'queued') : task.status === 'ready' ? L('к релизу', 'for release') : task.kind === 'upgrade' ? L('доработка', 'upgrade') : L('строится', 'building');
        const hint = novice && task.status === 'active' ? L('<i>клик: помочь руками</i>', '<i>click: help by hand</i>') : '';
        this.paper.tag(`b:n${b.kind}`, tx, ty - (hint ? 82 : 64) * z, `<b>${Math.min(task.done, task.work)}/${task.work}</b> · ${status}${hint}`, 'small hot');
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

    // the founder and the agents
    // the founder's caption starts at the left edge of the desk: the desk stands at the edge of the sheet
    const [mx, my] = board.onScreen(DESK[0] - 118, DESK[1] + 8);
    const full = Math.floor(run.energy);
    const pips = '■'.repeat(full) + '□'.repeat(TUNING.crunch.max - full);
    // on a wide sheet the first laptop stands close to the desk: the caption is cut to the bone
    const you = L('<b>ты</b>', '<b>you</b>');
    const mine = z < 0.8 ? `${you}: ${LANE_NAME[run.review]}` : `${you} · ${L('проверяешь', 'reviewing')} ${LANE_ACC[run.review]}`;
    this.paper.tag('me', Math.max(10, mx), my, `${mine}<i>${ENERGY} ${pips}</i>`, 'left');
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
      this.paper.tag(id, x, y, `<b>${LANE_NAME[a.lane]}</b><i${idle ? ' class="bad"' : ''}>${NO}${a.id} · ${idle ? L('без дела · $0', 'idle · $0') : TIER_NAME[a.tier]}</i>`, z < 0.8 ? 'small' : '');
    });
    this.paper.pruneTags('a', keepA);

    // A cloud is a cohort, not a seat cap. Infrastructure limits service quality under load.
    const company = companyTotals(run);
    this.paper.tag('market', 1308, 810, L(
      `<b>нагрузка ${Math.round(company.load)} / ${Math.round(company.capacity)}</b><i>ключевых договоров отдельно: ${run.clients.length}</i><i>спрос и тарифы — клик по облаку</i>`,
      `<b>load ${Math.round(company.load)} / ${Math.round(company.capacity)}</b><i>separate key contracts: ${run.clients.length}</i><i>needs and prices — click a cloud</i>`,
    ), 'small corner');
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
    if (net >= 0) sub = `<b class="good">+${money(net)}</b> ${L('в секунду · в плюсе', 'per second · in the black')}`;
    else {
      const left = run.money / -net;
      sub = `<b class="hot">${money(net)}</b> ${L('в секунду · денег на', 'per second · money for')} <b>${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b>`;
    }
    this.paper.setMoney(money(run.money), sub, run.money <= 0);
    const leftS = Math.ceil(TUNING.sprint_s - run.sprintT);
    const sprint = run.sprint;
    const demo = isDemo(run) && run.clients.length > 0;
    this.paper.setSprint(
      run.draft ? L(`СПРИНТ ${sprint} · ПАУЗА: ВЫБОР КАРТЫ`, `SPRINT ${sprint} · PAUSED: CHOOSE A CARD`) : L(`СПРИНТ ${sprint} · ∞ · ${demo ? 'ДЕМО-ДЕНЬ' : 'РЕЛИЗ'} ЧЕРЕЗ ${leftS} С`, `SPRINT ${sprint} · ∞ · ${demo ? 'DEMO DAY' : 'RELEASE'} IN ${leftS} S`),
      run.sprintT / TUNING.sprint_s,
    );
    // the goal is always on the sheet: three frames taken at random must say what to do
    this.paper.setGoal(this.nextStep(net));
    this.paper.setLedger(this.ledger());
    if (!this.ended) this.teach();

    this.paper.setShelf(this.shelfView());
    if (!this.ended && (run.t - this.workbenchAt >= 0.2 || this.draftShown !== Boolean(run.draft))) {
      this.workbenchAt = run.t;
      this.draftShown = Boolean(run.draft);
      this.workbenchSelection.picked = this.picked;
      this.paper.setWorkbench(workbenchView(run, this.workbenchSelection));
    }
    if (run.draft) this.paper.call(null);
    else if (this.pauseCard) {
      this.paper.call({
        who: L('ПАУЗА', 'PAUSE'),
        text: L('Деньги не горят, пока ты думаешь. В жизни так не бывает.', 'Money doesn’t burn while you think. Real life doesn’t work that way.'),
        options: this.pauseOptions(),
      });
    } else if (run.lastChance !== null) {
      this.paper.call({ who: `${CALL} · ${L('БАНК', 'THE BANK')}`, text: BANK_TEXT.replace('%s', money(run.lastChance)).replace('%t', String(mortgageSeconds(run))), options: BANK_ANSWERS });
    } else if (run.call) {
      const name = BLOCK_BY_ID[run.call.want]?.name;
      this.paper.call({
        who: `${CALL} · ${run.call.name.toUpperCase()}`,
        text: CALL_ASK[run.call.want] ?? L(`А «${name}» у вас есть? Нам без этого никак.`, `Do you have “${name}”? We can’t do without it.`),
        options: callAnswers(honestMult(run), TUNING.call.sure_mult, promiseSprints(run)),
      });
    } else if (run.offer !== null) {
      const full = money(valuation(run));
      const offer = money(run.offer);
      const chance = Math.round(haggleChance(run) * 100);
      this.paper.call({
        who: `${CALL} · ${L('ПОКУПАТЕЛЬ', 'A BUYER')}`,
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
      this.paper.call({ who: who[d.who] ?? CALL, text: d.text, options: d.options.map((o) => `${o.label} <span>— ${o.note}</span>`) });
    } else this.paper.call(null);

    if (this.termUntil > 0 && this.clock > this.termUntil) {
      this.termUntil = 0;
      this.paper.term(null);
    }
  }

  /** what the pause card offers: back to the startup, the two switches of the sound, out to the menu */
  private pauseOptions(): string[] {
    const audio = this.hooks.audio;
    const switches = audio
      ? [
          `${L('Музыка', 'Music')}: ${onOff(audio.music, ['включена', 'выключена'])}`,
          `${L('Трек', 'Track')}: ${audio.track} <span>— ${L('следующий', 'next')}</span>`,
          `${L('Звук', 'Sound')}: ${onOff(audio.sound, ['включён', 'выключен'])}`,
        ]
      : [];
    return [L('Вернуться к стартапу', 'Back to the startup'), ...switches, L('Бросить стартап и выйти в меню', 'Abandon the startup and go to the menu')];
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
          ? L('долг копят агенты без твоей проверки', 'agents pile up debt without your review')
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
  private nextStep(net: number): string {
    const run = this.run;
    const has = (kind: string): boolean => run.blocks.some((block) => block.kind === kind);
    if (run.draft) return L('Выбери <b>одну из трёх карт</b>: время и деньги стоят до решения.', 'Choose <b>one of three cards</b>: time and money wait for your decision.');
    if (this.razing) return L('<b>Кликни блок на карте</b>, который разобрать. Его клиенты снова начнут ждать; Esc — отмена.', '<b>Click a block on the map</b> to demolish it. Its clients will wait again; Esc cancels.');
    if (this.picked) return L('<b>Кликни свободную клетку</b>: новый модуль займёт её и попадёт в очередь. Подсвеченное соседство увеличивает чек после выпуска.', '<b>Click a free cell</b>: the new module reserves it and joins the queue. Highlighted adjacency increases bills after release.');
    if (!has('core')) return L('Начни с <b>«Обёртки над Клодом»</b> в таблице справа, затем выбери клетку на чертеже.', 'Start with <b>“Claude Wrapper”</b> in the table on the right, then choose a cell on the blueprint.');
    if (!has('landing')) return L('Поставь <b>«Лендинг»</b>: без него клиенты не найдут продукт. Следующий проект можно планировать заранее.', 'Place the <b>“Landing Page”</b>: clients need it to find the product. You can queue the next project in advance.');
    if (!has('pay')) return L('Поставь <b>«Приём оплаты»</b>: он включает подписки после выпуска.', 'Place <b>“Payments”</b>: it enables subscriptions after release.');
    if (run.down) return run.downWhy === 'supplier'
      ? L('<strong>Сбой поставщика</strong> до релиза: клиенты не платят. Время заняться потребностями и очередью.', '<strong>Provider outage</strong> until release: clients do not pay. Time to work on needs and the queue.')
      : L('<strong>Продукт лежит</strong>: назначь агента на починку, снизь техдолг к следующему релизу.', '<strong>The product is down</strong>: assign an agent to fixes and reduce tech debt before release.');
    const task = activeWork(run) ?? run.tasks.find((entry) => entry.status === 'queued');
    if (task?.status === 'queued' && run.money < task.cost) return L(
      'Первый проект ждёт <b>' + money(task.cost - run.money) + '</b> для старта. Подними более дешёвый или отложи этот в бэклог.',
      'The first project needs <b>' + money(task.cost - run.money) + '</b> to start. Move up a cheaper one or defer this one to backlog.',
    );
    if (!isLive(run, 'pay')) return L('<b>Платежи ещё не выпущены</b>. Помоги стройке через Enter; готовые проекты включатся на релизе.', '<b>Payments have not shipped yet</b>. Help build with Enter; completed projects activate at release.');
    const totals = companyTotals(run);
    if (totals.utilization > 1) return L(
      '<strong>Перегруз ' + Math.round(totals.utilization * 100) + '%</strong>: расширь инфраструктуру или увеличь мощность ядра и поддержки. Лишние клиенты снижают удовлетворённость.',
      '<strong>Load ' + Math.round(totals.utilization * 100) + '%</strong>: expand infrastructure or increase core and support capacity. Excess load lowers satisfaction.',
    );
    if (task && !task.block) return L('Проект карты или инфраструктуры — <b>в очереди у основателя</b>. Агенты строят его без новой клетки; Enter помогает.', 'The card or infrastructure project is <b>on the founder’s desk</b>. Agents build it without a new cell; Enter helps.');
    if (customerCount(run) === 0) return L('После выпуска ядра и лендинга придут первые клиенты. <b>Продвижение</b> пополняет воронку, нужные функции помогают им остаться.', 'The first clients arrive after core and landing ship. <b>Promotion</b> fills the funnel; useful features help them stay.');
    if (net < 0) return L(
      'До прибыли не хватает <b>' + rate(-net) + '/с</b>. Открой облако: посмотри потребности и прогноз тарифа перед повышением цены.',
      '<b>' + rate(-net) + '/s</b> short of profit. Open a cloud to inspect needs and forecast the tariff before raising it.',
    );
    if (run.sprint > TUNING.last_sprint) return L(
      '<em>Компания продолжает работать</em> · расти без перегруза: улучшай продукт, выбирай специализацию и расширяй рынок.',
      '<em>The company keeps running</em> · grow without overload: improve the product, choose a specialization and expand the market.',
    );
    return L(
      '<em>В плюсе</em> · оценка ' + money(valuation(run)) + '. Новый уровень остаётся в своей клетке; новые модули выбирай под потребности клиентов.',
      '<em>In the black</em> · valuation ' + money(valuation(run)) + '. Upgrades stay in their cells; choose new modules around client needs.',
    );
  }

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
      ['План можно набрать заранее.', 'Верхняя задача строится первой.', 'На потом — в бэклог. Готовое', 'включится только на релизе.'],
      ['You can plan ahead.', 'The first task gets built first.', 'Defer the rest to backlog. Finished', 'work takes effect at release.'],
    ))) return;
    if (run.stage >= 2 && tell('t:clouds', L(
      ['Клиенты теперь живут облаками.', 'Кликни по облаку: там запросы,', 'удовлетворённость и тариф.', 'Масштаб большой. Счёт тоже.'],
      ['Clients now live in clouds.', 'Click a cloud for needs,', 'satisfaction and tariff.', 'Big scale. Big bill, too.'],
    ))) return;
    if (run.debt >= 10 && tell('t:debt', L(
      ['Техдолг растёт. Починка снимает его.', 'Без твоей проверки агенты оставляют', 'долг: сначала замедление, потом сбой.'],
      ['Tech debt is rising. Fixes remove it.', 'Agents leave debt without your review:', 'first a slowdown, then an outage.'],
    ))) return;
    if (run.blocks.length >= cellsMax(run) && tell('t:full', L(
      ['Чертёж полон. Улучшения остаются', 'в своих зданиях. Ненужное можно', 'разобрать из строки модуля, затем', 'подтвердить кликом по карте.'],
      ['The blueprint is full. Upgrades stay', 'inside their buildings. Demolish an', 'unneeded module from its table row,', 'then confirm it on the map.'],
    ))) return;
    if (run.clients.some((client) => !client.happy && !run.known.includes(client.want)) && tell('t:ask', L(
      ['Ключевой договор недоволен.', 'Разведка выяснит его запрос.', 'Открой «Клиенты»: эти договоры', 'идут отдельно от тарифа облака.'],
      ['A key contract is unhappy.', 'Research reveals its request.', 'Open Clients: those contracts are', 'separate from the cloud tariff.'],
    ))) return;
    if (run.stage >= 2 && run.energy >= TUNING.crunch.max && tell('t:hands', L(
      ['Силы — не только на код.', 'Справа внизу можно самому', 'заняться продвижением или починкой.'],
      ['Energy is not only for code.', 'Bottom right, you can do', 'promotion or fixes yourself.'],
    ))) return;
    if (companyTotals(run).utilization > 0.85) tell('t:capacity', L(
      ['Мощность почти занята.', 'Сверь ядро и поддержку в таблице.', 'Расширение ускоряет рост рынка,', 'но за серверы платим каждый тик.'],
      ['Capacity is almost full.', 'Check core and support in the table.', 'Expansion opens a larger market,', 'but the servers charge every tick.'],
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
    const rule = TUNING.stages[run.stage - 1];
    // what opens the stronger agents and more desks is written out: it is a goal, not a secret
    const stage3 = `${rate(TUNING.stage3_mrr / TUNING.sprint_s)}${PER_S}`;
    const unlock =
      run.stage === 1
        ? L('обычный и думающий агенты и ещё два места — после первого платящего клиента', 'regular and thinking agents and two more desks — after the first paying client')
        : run.stage === 2
          ? L(`ещё два места для агентов — когда подписки дойдут до ${stage3}`, `two more desks for agents — when subscriptions reach ${stage3}`)
          : '';
    const rows: ShelfKeys[] = [
      {
        owner: 'hire',
        keys: TIERS.map((t) => ({ id: t, title: `+ ${TIER_NAME[t]} $${TUNING.tiers[t].cost_per_s}${PER_S}`, off: !canHire(run, t) })),
      },
      ...run.agents.map((a) => ({
        owner: `a${a.id}`,
        label: `<b>${NO}${a.id}</b> ${TIER_NAME[a.tier]}`,
        keys: [...LANES.map((l) => ({ id: l as string, title: LANE_NAME[l] })), { id: 'drop', title: '×' }],
        on: a.lane as string,
      })),
    ];
    return [
      {
        id: 'agents',
        title: L(`АГЕНТЫ · ${run.agents.length} ИЗ ${rule.agents_max}`, `AGENTS · ${run.agents.length} OF ${rule.agents_max}`),
        hint: `${rate(-flows(run).agents)}${PER_S} · ${L('без дела — бесплатно', 'idle — free')}`,
        note: unlock,
        rows,
      },
      {
        id: 'me',
        title: L('ТЫ · ОДИН ЧЕЛОВЕК', 'YOU · ONE PERSON'),
        hint: `${ENERGY} ${'■'.repeat(Math.floor(run.energy))}${'□'.repeat(TUNING.crunch.max - Math.floor(run.energy))}`,
        rows: [
          // what the founder checks: no debt there, and the work goes faster; chosen once a sprint
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
    const sig = JSON.stringify([run.agents.map((a) => [a.id, a.lane]), task?.id, site ? [site.i, site.j] : null, run.review]);
    if (sig === this.routeSig) return;
    this.routeSig = sig;

    // where the work of a lane goes on the sheet
    const targetOf = (lane: Lane): Pt | null => {
      if (lane === 'build') {
        if (!site) return task ? [DESK[0] + 100, DESK[1] - 150] : null;
        const [cx, cy] = board.cell(site.i, site.j);
        return [cx, cy + 56];
      }
      if (lane === 'fix') {
        const [cx, cy] = board.cell(0, 0);
        return [cx, cy + 56];
      }
      return MARKET;
    };

    // the founder's own connector: from the desk to what he checks. His squares are ink, not coral:
    // every square of work on that lane is looked at by a human
    const mine = targetOf(run.review);
    const from: Pt = [DESK[0] + 118, DESK[1] - 64];
    if (mine && !(run.review === 'build' && task && !site)) board.route('me', [from, [from[0] + 40, from[1]], [from[0] + 40, BUS_Y - 9], [mine[0], BUS_Y - 9], mine]);
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
      if (old && old.x !== x) {
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
      const top: Pt = [x, y - 122];
      const bus = BUS_Y + k * BUS_GAP;
      const target = targetOf(a.lane);
      if (target) board.route(key, [top, [x, bus], [target[0], bus], target]);
      else board.dropRoute(key);
    });
  }

  /** A new stage: the camera pulls back and shows more of the sheet. */
  private syncStage(ms: number): void {
    // Client counts live in three fixed clouds; only product progression widens the blueprint.
    const want = this.run.stage >= 3 ? 3 : this.run.stage === 2 || customerCount(this.run) > 0 ? 2 : 1;
    if (this.stageShown === want) return;
    this.stageShown = want;
    const v = STAGE_VIEW[want - 1];
    this.board.view(v.zoom, v.x, v.y, VIEW_AT[0], VIEW_AT[1], ms, () => undefined);
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
    const x = 1182, y = 350 + group.index * 134;
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

/** «3 спринта» */
export function sprints(n: number): string {
  return `${n} ${plural(n, L(['спринт', 'спринта', 'спринтов'], ['sprint', 'sprints', 'sprints']))}`;
}
