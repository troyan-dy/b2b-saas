import Phaser from 'phaser';
import { BLOCK_BY_ID } from '../content/blocks';
import {
  BANK_ANSWERS,
  BANK_TEXT,
  callAnswers,
  CALL_ASK,
  CLIENT_SAYS,
  CLIENT_TYPE_NOTE,
  effectLine,
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
import { logEvent, metrics } from '../core/metrics';
import type { Rng } from '../core/rng';
import { playSound, unlockSound } from '../core/sound';
import { PALETTE } from '../data/palette';
import { money, plural, rate } from '../ui/format';
import type { Paper, ShelfItem, ShelfKeys, ShelfSection } from '../ui/paper';
import {
  answerCall,
  answerLastChance,
  answerOffer,
  burnPerS,
  canHire,
  clientPay,
  crunch,
  fire,
  flows,
  freeCells,
  friendsAt,
  haggleChance,
  handy,
  hire,
  honestMult,
  IDEAS,
  incomePerS,
  isDemo,
  isLive,
  isSite,
  LANES,
  links,
  logos,
  mortgageSeconds,
  netPerS,
  pitch,
  place,
  promiseSprints,
  researchNeed,
  reworkNeed,
  reworks,
  RULES,
  setLane,
  setReview,
  shelf,
  signing,
  sites,
  step,
  TIERS,
  TUNING,
  unknownAsks,
  upgrade,
  valuation,
  valueMult,
  workNeed,
  type ClientType,
  type Lane,
  type Run,
  type RunEvent,
  type Tier,
} from '../systems/run/run';
import { Board, type BlockOnSheet, type SlotOnSheet } from '../view/board';
import type { Pt } from '../view/iso';
import { Squares } from '../view/squares';
import { AGENT_SLOTS, BUS_GAP, BUS_Y, CLIENT_SLOTS, DESK, MARKET, MONEY_RECT, STAGE_VIEW, TRUNK_X, VIEW_AT } from './layout';

const STEP = 1 / 60;

/** How a client of each type stands on the sheet: the height of its picture and how many squares one payment is. */
export const CLIENT_LOOK: Record<ClientType, { height: number; squares: number }> = {
  small: { height: 118, squares: 1 },
  mid: { height: 136, squares: 1 },
  startup: { height: 112, squares: 1 },
  corp: { height: 150, squares: 3 },
  gov: { height: 158, squares: 4 },
};

export interface GameHooks {
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
  /** when Claude may next repeat what stops the money */
  private nagAt = 0;
  /** what clients say aloud: a line over the building of client `id` until the clock reaches `until` */
  private readonly quotes = new Map<number, { text: string; until: number }>();

  constructor(run: Run, rng: Rng, paper: Paper, hooks: GameHooks) {
    super('game');
    this.run = run;
    this.rng = rng;
    this.paper = paper;
    this.hooks = hooks;
  }

  preload(): void {
    const others = [...IDEAS.corp, ...IDEAS.startup, ...IDEAS.gov].map((c) => c.texture);
    const keys = new Set(['desk', 'laptop', this.run.idea.aud.texture, ...others]);
    for (const key of keys) this.load.image(`node_${key}`, `assets/img/nodes/${key}.webp`);
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
    this.paper.setNews(`${pitch(this.run.idea)}. Пока что это три слова и один человек`, this.newsHint());
    this.say([
      '<b>❯ Клод</b>',
      'Привет. Я твоя команда — вся.',
      'Выбери справа «Обёртку над Клодом»',
      'и поставь её на чертёж. Клик по',
      'стройке или Enter — помочь руками.',
    ], 600);
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
    if (!this.paused) {
      this.acc += dt * this.speed;
      while (this.acc >= STEP) {
        this.hooks.beforeStep?.(this.run);
        step(this.run, STEP);
        this.acc -= STEP;
        if (this.run.events.length > 0) this.drain();
        if (this.run.over) break;
      }
      this.clock += dt;
      this.flowMoney(dt);
      this.tickNews(dt);
    }
    this.board.step(dt * Math.min(this.speed, 3));
    this.squares.step(dt * Math.min(this.speed, 3));
    this.show();
  }

  // ---------------------------------------------------------------- the player's clicks

  private onShelf(section: string, item: string): void {
    unlockSound();
    if (section !== 'blocks') return;
    if (item.startsWith('up:')) {
      // a rework: no cell to choose — it is built on the block the client named
      if (upgrade(this.run, item.slice(3))) playSound('buy', 0);
      else {
        this.paper.flash('blocks', item, 'denied');
        playSound('waste');
      }
      return;
    }
    if (sites(this.run).length >= TUNING.sites_max) {
      this.paper.flash('blocks', item, 'denied');
      playSound('waste');
      return;
    }
    this.picked = this.picked === item ? null : item;
    playSound('ui');
  }

  private onCell(id: string): void {
    if (id === 'site') {
      this.byHand();
      return;
    }
    if (!this.picked) return;
    const [i, j] = id.split(',').map(Number);
    if (place(this.run, this.picked, i, j)) this.picked = null;
  }

  /** The founder's own square of work on a lane: thrown from the desk to where that work goes. */
  private byHand(lane: Lane = 'build'): void {
    unlockSound();
    const run = this.run;
    const site = run.blocks.find(isSite);
    const can = handy(run, lane);
    if (!can || !crunch(run, lane)) {
      playSound('waste');
      const [x, y] = this.board.onScreen(DESK[0], DESK[1] - 200);
      // on the first clicks of the game an empty site is not news: the goal line already says what to do
      if (can || lane !== 'build' || run.blocks.length > 0) this.paper.pop(x, y, can ? 'сил нет: подожди' : HAND_IDLE[lane], 'bad');
      return;
    }
    this.hands++;
    playSound('yes', this.hands % 6);
    const [fx, fy] = this.board.onScreen(DESK[0] - 40, DESK[1] - 130);
    const to: Pt = lane === 'build' && site ? this.board.top(site) : lane === 'fix' ? this.board.cell(0, 0) : MARKET;
    const [tx, ty] = this.board.onScreen(...to);
    // code is Claude's colour; a post, a call and a fix are the human's own ink
    this.squares.fly({ x: fx - 10, y: fy - 10, w: 20, h: 20 }, { x: tx - 20, y: ty - 10, w: 40, h: 20 }, 1, lane === 'build' ? PALETTE.coral : PALETTE.ink, 160, [0.35, 0.45]);
    if (HAND_DONE[lane]) this.paper.pop(tx, ty - 34, HAND_DONE[lane], 'good');
  }

  private onKey(owner: string, key: string): void {
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
    else answerOffer(this.run, k === 0 ? 'sell' : k === 1 ? 'haggle' : 'no');
    this.paper.call(null);
  }

  private onKeyDown(e: KeyboardEvent): void {
    unlockSound();
    if (this.ended) return;
    if (e.code === 'Escape') {
      // first Esc drops the picked block, the next one stops the clock
      if (this.picked) this.picked = null;
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
    if (this.run.offer !== null || this.run.call || this.run.lastChance !== null) {
      // the buyer's card has a third answer: to haggle
      const answers = this.run.lastChance === null && !this.run.call ? 3 : 2;
      if (Number(digit[1]) <= answers) this.onAnswer(Number(digit[1]) - 1);
      return;
    }
    const kind = shelf(this.run)[Number(digit[1]) - 1];
    if (kind) this.onShelf('blocks', kind);
  }

  // ---------------------------------------------------------------- what happened in the simulation

  private drain(): void {
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
        if (run.blocks.length === 2) this.say(['<b>❯ Клод</b>', 'Строю. Пока я занят — выбери', 'следующий блок: без лендинга нас', 'не найдут, без оплаты не заплатят.'], 14);
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
        if (e.agent === 0 || this.speed > 2 || !this.board.hasRoute(key)) land();
        else this.board.flow(key, PALETTE.coral, 620, land);
        if (this.speed <= 2 && e.agent !== 0) playSound('auto');
        // the founder checks this lane: for every square of work an ink square leaves his desk
        if (e.agent !== 0 && e.lane === run.review && this.speed <= 2 && this.board.hasRoute('me')) {
          this.board.flow('me', PALETTE.ink, 600);
          if (!this.said.has('t:review') && (this.termUntil === 0 || this.clock > this.termUntil - 4)) {
            this.said.add('t:review');
            this.say(['<b>❯ Клод</b>', 'Тёмные квадраты от стола — это ты:', 'ты проверяешь одно направление.', 'Там работа идёт быстрее и без долга.', 'Сменить его — клавиши справа внизу.'], 14);
          }
        }
        break;
      }
      case 'built': {
        const [x, y] = this.board.onScreen(...this.board.top(e));
        this.paper.pop(x, y - 30, 'готово — ждёт релиза', '');
        this.burst(x, y, 6);
        playSound('buy', 7);
        break;
      }
      case 'live':
        logEvent(`live:${e.kind}`);
        if (e.kind === 'core') this.news(NEWS_EVENT.firstBlock);
        break;
      case 'release': {
        metrics.completed = true;
        logEvent(`release:${e.report.sprint}`);
        const names = e.report.shipped.map((k) => `«${BLOCK_BY_ID[k]?.short ?? k}»`);
        const reasons = e.report.reasons.map((k) => BLOCK_BY_ID[k]?.short ?? '');
        const perS = { mrr: e.report.mrr / TUNING.sprint_s, tokens: e.report.tokens / TUNING.sprint_s };
        this.say(releaseLines({ ...e.report, ...perS, shipped: names, reasons, unpaid: isLive(run, 'pay') ? 0 : run.clients.length }), 16);
        playSound('scale');
        // the release is the beat of the game: what ships bursts, the sheet breathes, the money answers
        for (const kind of e.report.shipped) {
          const b = run.blocks.find((x) => x.kind === kind);
          if (b) this.burst(...this.board.onScreen(...this.board.top(b)), 10);
        }
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
        const [x, y] = CLIENT_SLOTS[c.slot % CLIENT_SLOTS.length];
        const h = CLIENT_LOOK[c.type].height;
        // a chain is seen at once: a second branch stands behind the first
        if (c.type === 'mid') this.place(`c${c.id}b`, c.texture, x - 46, y - 20, h * 0.82, true);
        const img = this.place(`c${c.id}`, c.texture, x, y, h, true);
        this.board.route(`c${c.id}`, [
          [TRUNK_X - 80, 0],
          [TRUNK_X, 0],
          [TRUNK_X, y - 56],
          // the picture is still popping in: its final width is what counts
          [x - (img.width * (h / img.height)) / 2 - 10, y - 56],
        ]);
        this.syncStage(1100);
        const [sx, sy] = this.board.onScreen(x, y - 150);
        this.paper.pop(sx, sy, '+ клиент', 'good');
        playSound('all');
        logEvent(`client:${c.type}`);
        if (run.stats.clients === 1) {
          this.news(NEWS_EVENT.firstClient);
          this.quotes.set(c.id, { text: FIRST_CLIENT_SAYS, until: this.clock + 9 });
        } else if (CLIENT_TYPE_NOTE[c.type] && !this.said.has(`type:${c.type}`)) {
          // a new kind of client: it says a line of its own, and the news line says once how it pays
          this.said.add(`type:${c.type}`);
          this.news(`Новый клиент — ${CLIENT_TYPE_NOTE[c.type]}`);
          this.quotes.set(c.id, { text: CLIENT_SAYS[c.type], until: this.clock + 9 });
        }
        break;
      }
      case 'left': {
        const [x, y] = this.board.onScreen(...this.nodePos(`c${e.id}`));
        const pool = e.demo ? LEFT_DEMO : e.closed ? LEFT_CLOSED : e.reason ? LEFT_KNOWN : LEFT_UNKNOWN;
        this.paper.pop(x, y - 150 * this.board.zoom, pool[e.id % pool.length].replace('%s', BLOCK_BY_ID[e.reason]?.short ?? ''), 'bad');
        this.board.dropNode(`c${e.id}`);
        this.board.dropNode(`c${e.id}b`);
        this.board.dropRoute(`c${e.id}`);
        this.paper.dropTag(`c${e.id}`);
        playSound('waste');
        logEvent(e.closed ? 'closed' : 'left');
        if (!e.closed && !this.said.has('left')) {
          this.said.add('left');
          this.news(NEWS_EVENT.firstLeft);
        }
        break;
      }
      case 'rework': {
        // the client says it aloud: nothing to find out, only to build
        const line = REWORK_SAYS[e.id % REWORK_SAYS.length].replace('%s', BLOCK_BY_ID[e.kind]?.short ?? e.kind);
        this.quotes.set(e.id, { text: line, until: this.clock + 8 });
        playSound('quip');
        logEvent(`rework:${e.kind}`);
        if (!this.said.has('rework')) {
          this.said.add('rework');
          this.say(['<b>❯ Клод</b>', 'Клиент просит доработку блока.', 'Она вверху полки, с пометкой', '«доработка». Сделаем — заплатит', 'больше. Не сделаем — уйдёт.'], 14);
        }
        break;
      }
      case 'reveal': {
        const [x, y] = this.board.onScreen(MARKET[0], MARKET[1]);
        this.paper.pop(x, y - 20, `клиенты просят: ${BLOCK_BY_ID[e.kind]?.name ?? e.kind}`, 'good');
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
        this.paper.pop(x, y - 20, `${e.name}: не дозвонились и ушли`, 'bad');
        logEvent('hungup');
        break;
      }
      case 'kept': {
        const [x, y] = this.board.onScreen(...this.nodePos(`c${e.id}`));
        this.paper.pop(x, y - 170 * this.board.zoom, 'обещание выполнено', 'good');
        logEvent('kept');
        break;
      }
      case 'refund': {
        const [x, y] = this.board.onScreen(...this.nodePos(`c${e.id}`));
        this.paper.pop(x, y - 190 * this.board.zoom, `возврат ${money(-e.sum)}`, 'bad');
        this.cameras.main.shake(140, 0.003);
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
        this.news((e.ok ? NEWS_EVENT.demoOk : NEWS_EVENT.demoFail).replace('%s', e.ok ? (BLOCK_BY_ID[e.name]?.short ?? e.name) : e.name));
        this.newsHold = 16;
        this.newsAt = 16;
        playSound(e.ok ? 'finale' : 'waste');
        logEvent(`demo:${e.ok ? 'ok' : 'fail'}`);
        break;
      case 'hero': {
        const [x, y] = this.board.onScreen(...this.nodePos(`c${e.id}`));
        this.paper.pop(x, y - 190 * this.board.zoom, 'героический релиз: платит ×1,5', 'good');
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
      case 'lastchance':
        playSound('waste');
        this.cameras.main.shake(220, 0.005);
        logEvent('lastchance');
        break;
      case 'end':
        logEvent(`end:${e.ending}`);
        this.ended = true;
        this.paper.call(null);
        // nobody speaks over the ending
        this.quotes.clear();
        if (e.ending === 'sold' || e.ending === 'profit') playSound('finale');
        else {
          playSound('waste');
          this.cameras.main.shake(260, 0.005);
        }
        this.say(['<b>❯ Клод</b>', e.ending === 'broke' ? 'Деньги кончились. Было приятно' : 'На этом всё. Было приятно', 'поработать. Счёт за токены я пришлю.'], 30);
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
    const free = this.picked ? freeCells(run) : [];
    const slots: SlotOnSheet[] = free.map((c) => ({ i: c.i, j: c.j, hot: this.picked !== null && friendsAt(run, this.picked, c.i, c.j) > 0 }));
    board.sync(blocks, slots);
    // a player who has not clicked yet does not know that things are clicked: what waits for a click breathes
    const novice = this.hands < 3;
    const cells: { id: string; x: number; y: number; pulse?: boolean }[] = free.map((c) => {
      const [x, y] = board.onScreen(...board.cell(c.i, c.j));
      return { id: `${c.i},${c.j}`, x, y, pulse: run.blocks.length < 2 };
    });
    const site = run.blocks.find(isSite);
    if (!this.picked && site) {
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
      if (!b.built || b.up) {
        // how much of the site is done: a number above it
        const [tx, ty] = board.onScreen(...board.top(b));
        keep.add(`b:n${b.kind}`);
        // the first site of the run says in words that it can be clicked
        const call = b.up ? '<i>доработка</i>' : novice && b === blocks.find((x) => !x.built) ? '<i>кликай по блоку: помогай руками</i>' : '';
        this.paper.tag(`b:n${b.kind}`, tx, ty - (call ? 82 : 64) * z, `<b>${b.done}/${b.need}</b>${call}`, 'small hot');
      }
    }
    // the very first placement: the free cell says «click here»
    if (this.picked && run.blocks.length < 2) {
      for (const c of free.slice(0, 1)) {
        const [x, y] = board.onScreen(...board.cell(c.i, c.j));
        keep.add('b:click');
        this.paper.tag('b:click', x, y - 12, 'кликни клетку', 'small hot');
      }
    }
    for (const s of slots) {
      if (!s.hot) continue;
      const [x, y] = board.onScreen(...board.cell(s.i, s.j));
      const id = `b:slot${s.i},${s.j}`;
      keep.add(id);
      this.paper.tag(id, x, y - 9, 'связка', 'small hot');
    }
    this.paper.pruneTags('b:', keep);

    // the founder and the agents
    // the founder's caption starts at the left edge of the desk: the desk stands at the edge of the sheet
    const [mx, my] = board.onScreen(DESK[0] - 118, DESK[1] + 8);
    const full = Math.floor(run.energy);
    const pips = '■'.repeat(full) + '□'.repeat(TUNING.crunch.max - full);
    // on a wide sheet the first laptop stands close to the desk: the caption is cut to the bone
    const mine = z < 0.8 ? `<b>ты</b>: ${LANE_NAME[run.review]}` : `<b>ты</b> · проверяешь ${LANE_ACC[run.review]}`;
    this.paper.tag('me', Math.max(10, mx), my, `${mine}<i>силы ${pips}</i>`, 'left');
    this.syncAgents();
    const keepA = new Set<string>();
    run.agents.forEach((a, k) => {
      const [sx, sy] = AGENT_SLOTS[k];
      const [x, y] = board.onScreen(sx, sy + 8);
      const id = `a${a.id}`;
      keepA.add(id);
      const idle = this.idle.has(a.id);
      // on a wide sheet the laptops stand close: their captions are set smaller
      this.paper.tag(id, x, y, `<b>${LANE_NAME[a.lane]}</b><i${idle ? ' class="bad"' : ''}>№${a.id} · ${idle ? 'простаивает' : TIER_NAME[a.tier]}</i>`, z < 0.8 ? 'small' : '');
    });
    this.paper.pruneTags('a', keepA);

    // the market: leads and interviews gather where the trunk to the clients starts
    const promo = run.agents.some((a) => a.lane === 'promo');
    const research = run.agents.some((a) => a.lane === 'research');
    if (promo || research || run.clients.length > 0 || run.leads > 0) {
      // the caption stands in the free corner of the sheet: left of the trunk, above the lines of the agents
      const [x, y] = board.onScreen(MARKET[0], MARKET[1]);
      const places = TUNING.stages[run.stage - 1].clients_max;
      // promotion is a funnel with one number: how much of the next client is already there
      const whole = Math.floor(run.leads);
      const part = Math.round((run.leads - whole) * 100);
      const coming = whole > 0 ? `<b>${whole}</b> ${plural(whole, ['клиент придёт', 'клиента придут', 'клиентов придут'])} на релизе` : `до нового клиента <b>${part}%</b>`;
      const full = run.clients.length >= places ? ' · мест нет' : '';
      const ask = unknownAsks(run).length > 0 ? `разведка: до ответа <b>${run.insight} из ${researchNeed(run)}</b>` : 'разведка: все запросы известны';
      // big clients that are happy put their logos on the landing page: promotion works better with every one
      const trust = logos(run) > 0 ? `<i>логотипы на лендинге: ${logos(run)} · продвижение ×${String(1 + TUNING.logos.promo * logos(run)).replace('.', ',')}</i>` : '';
      this.paper.tag('market', x - 12, y - 16, `<b>рынок</b> · клиентов ${run.clients.length} из ${places}<i>продвижение: ${coming}${full}</i>${trust}<i>${ask}</i>`, 'small corner');
    }
    // the product is down: it is written across the product itself, with the reason
    if (run.down) {
      const [x, y] = board.onScreen(...board.cell(0, 0));
      const why = run.downWhy === 'supplier' ? 'сбой у поставщика модели' : `техдолг дошёл до ${TUNING.debt.down_at}`;
      this.paper.tag('down', x, y - 150 * z, `<b>ПРОДУКТ ЛЕЖИТ</b><i>${why} · клиенты не платят до релиза</i>`, 'hot');
    } else this.paper.dropTag('down');

    // clients
    for (const c of run.clients) {
      const [sx, sy] = CLIENT_SLOTS[c.slot % CLIENT_SLOTS.length];
      const [x, y] = board.onScreen(sx, sy + 6);
      const pay = clientPay(run, c);
      // two short lines: the name, then the money and the mood — twelve of them must fit side by side
      const paid = pay > 0 ? `<em>${rate(pay / TUNING.sprint_s)}/с</em>` : 'бесплатно';
      // twelve buildings stand close on the wide sheet: their captions are set tighter
      const cls = z < 0.7 ? 'small tight' : 'small';
      let mood: string;
      // nothing to charge with: this is said on every client, in coral — «free and happy» reads as «all is well»
      if (!isLive(run, 'pay')) {
        this.paper.tag(`c${c.id}`, x, y, `<b>${c.name}</b><i class="bad">не платит: нет «оплаты»</i>`, cls);
        continue;
      }
      // the product is down: said on every client, so that «paid last sprint, not this one» has a reason on the sheet
      if (run.down) {
        this.paper.tag(`c${c.id}`, x, y, `<b>${c.name}</b><i class="bad">не платит: продукт лежит</i>`, cls);
        continue;
      }
      const short = BLOCK_BY_ID[c.want]?.short;
      // on the wide sheet a caption has the width of one building: what is awaited and for how long, no verbs
      const tight = z < 0.7;
      if (c.happy) mood = `<i>${paid} · доволен</i>`;
      else if (c.wantLevel > 1) mood = `<i class="bad">${tight ? '' : 'просит доработать '}«${short}»${tight ? ` v${c.wantLevel}` : ''} · ${c.patience} спр.</i>`;
      else if (c.promised) mood = `<i class="bad">обещан «${short}» · ${c.patience} спр.</i>`;
      else if (run.known.includes(c.want)) mood = `<i class="bad">${tight ? '' : 'ждёт '}«${short}» · ${c.patience} спр.</i>`;
      else mood = `<i class="bad">ждёт молча · ${c.patience} спр.</i>`;
      // a waiting client says what it waits for; the one that pays nothing until then says that too
      this.paper.tag(`c${c.id}`, x, y, `<b>${c.name}</b>${signing(c) ? ' · <u>$0</u>' : ''}${mood}`, cls);
    }
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
    if (net >= 0) sub = `<b class="good">+${money(net)}</b> в секунду · в плюсе`;
    else {
      const left = run.money / -net;
      sub = `<b class="hot">${money(net)}</b> в секунду · денег на <b>${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b>`;
    }
    this.paper.setMoney(money(run.money), sub, run.money <= 0);
    const leftS = Math.ceil(TUNING.sprint_s - run.sprintT);
    this.paper.setSprint(`СПРИНТ ${Math.min(run.sprint, TUNING.last_sprint)} ИЗ ${TUNING.last_sprint} · ${isDemo(run) && run.clients.length > 0 ? 'ДЕМО-ДЕНЬ' : 'РЕЛИЗ'} ЧЕРЕЗ ${leftS} С`, run.sprintT / TUNING.sprint_s);
    // the goal is always on the sheet: three frames taken at random must say what to do
    this.paper.setGoal(this.nextStep(net));
    this.paper.setLedger(this.ledger());
    if (!this.ended) this.teach();

    this.paper.setShelf(this.shelfView());
    if (this.pauseCard) {
      this.paper.call({
        who: 'ПАУЗА',
        text: 'Деньги не горят, пока ты думаешь. В жизни так не бывает.',
        options: this.pauseOptions(),
      });
    } else if (run.lastChance !== null) {
      const life = mortgageSeconds(run) > 60 ? 'полторы минуты' : 'минута';
      this.paper.call({ who: 'ЗВОНОК · БАНК', text: BANK_TEXT.replace('%s', money(run.lastChance)).replace('%t', life), options: BANK_ANSWERS });
    } else if (run.call) {
      this.paper.call({
        who: `ЗВОНОК · ${run.call.name.toUpperCase()}`,
        text: CALL_ASK[run.call.want] ?? `А «${BLOCK_BY_ID[run.call.want]?.name}» у вас есть? Нам без этого никак.`,
        options: callAnswers(honestMult(run), TUNING.call.sure_mult, promiseSprints(run)),
      });
    } else if (run.offer !== null) {
      const full = valuation(run);
      this.paper.call({
        who: 'ЗВОНОК · ПОКУПАТЕЛЬ',
        text: `Ваш продукт стоит <em>${money(full)}</em>, но мы видели код. Даём <em>${money(run.offer)}</em>. Продукт, правда, закроем.`,
        // short answers: the card must not lie over half of the product
        options: [
          `Продать за ${money(run.offer)}`,
          `Торговаться: всё или ничего <span>— шанс ${Math.round(haggleChance(run) * 100)}%, выше при малом техдолге</span>`,
          'Отказаться',
        ],
      });
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
      ? [`Музыка: ${audio.music ? 'включена' : 'выключена'}`, `Трек: ${audio.track} <span>— следующий</span>`, `Звук: ${audio.sound ? 'включён' : 'выключен'}`]
      : [];
    return ['Вернуться к стартапу', ...switches, 'Бросить стартап и выйти в меню'];
  }

  /** The ledger next to the money: every line of income and spending per second, and the debt with its limit. */
  private ledger(): string {
    const run = this.run;
    const f = flows(run);
    const limit = TUNING.debt.down_at;
    const part = Math.min(1, run.debt / limit);
    let income: string;
    if (run.down) income = `<p class="bad"><span>подписки: продукт лежит</span><b>$0</b></p>`;
    else if (run.clients.length > 0 && !isLive(run, 'pay')) income = `<p class="bad"><span>подписки: нет «оплаты»</span><b>$0</b></p>`;
    else income = `<p class="in"><span>подписки · ${run.clients.length} ${plural(run.clients.length, ['клиент', 'клиента', 'клиентов'])}</span><b>+${rate(f.income)}</b></p>`;
    const note = part >= 0.66 ? 'почти предел: ставь агента на починку' : run.debt < 1 ? 'долг копят агенты без твоей проверки' : `при ${limit} продукт упадёт; снимает починка`;
    return (
      income +
      `<p><span>ты: еда и жильё</span><b>${rate(-f.living)}</b></p>` +
      `<p><span>агенты · ${run.agents.length}</span><b>${rate(-f.agents)}</b></p>` +
      `<p><span>хостинг · ${run.live.size} ${plural(run.live.size, ['блок', 'блока', 'блоков'])}</span><b>${rate(-f.hosting)}</b></p>` +
      `<p><span>токены клиентов</span><b>${rate(-f.tokens)}</b></p>` +
      `<p class="debt${part >= 0.66 ? ' bad' : ''}"><span>техдолг</span><u><s style="width:${Math.round(part * 100)}%"></s></u><b>${Math.floor(run.debt)} из ${limit}</b></p>` +
      `<small>${note}</small>`
    );
  }

  /**
   * The line under the sprint ruler: the one thing to do next, in plain words. The first startup is
   * walked through by it step by step: block, landing, payment, client, profit.
   */
  private nextStep(net: number): string {
    const run = this.run;
    const has = (kind: string): boolean => run.blocks.some((b) => b.kind === kind);
    const pay = run.blocks.find((b) => b.kind === 'pay');
    if (run.blocks.length === 0) return this.picked ? 'что делать: теперь <b>кликни клетку</b> на чертеже — блок встанет туда' : 'что делать: <b>кликни</b> справа <b>«Обёртку над Клодом»</b>, потом клетку на чертеже';
    if (run.blocks.length === 1 && !run.blocks[0].built && this.hands < 3) return 'что делать: <b>кликай по блоку</b> на чертеже (или жми Enter) — помогай Клоду строить';
    if (!has('landing')) return 'что делать: поставь <b>«Лендинг»</b> — без него клиенты не найдут продукт';
    if (!pay) return run.clients.length > 0 ? '<strong>клиенты не платят</strong> — поставь <b>«Приём оплаты»</b>: выбери его справа' : 'что делать: поставь <b>«Приём оплаты»</b> — без него клиенты будут пользоваться бесплатно';
    if (!isLive(run, 'pay')) {
      if (!pay.built) return `${run.clients.length > 0 ? '<strong>клиенты не платят</strong> — ' : 'что делать: '}дострой <b>«Приём оплаты»</b>: клик по стройке или Enter — помочь руками`;
      return '«Приём оплаты» готов: клиенты начнут платить с ближайшего релиза';
    }
    if (run.down) {
      return run.downWhy === 'supplier'
        ? '<strong>продукт лежит</strong> до релиза: сбой у поставщика модели — клиенты не платят, от тебя это не зависит'
        : '<strong>продукт лежит</strong> до релиза: слишком много техдолга — клиенты не платят; поставь агента на <b>починку</b>';
    }
    if (run.stats.clients === 0) return 'жди релиза: первый клиент придёт сам, когда выйдут <b>ядро</b> и <b>лендинг</b>';
    // the demo day: the release of this sprint is watched — it must ship something
    if (isDemo(run) && run.clients.length > 0) {
      const ready = run.blocks.some((b) => (b.built && !b.live) || (b.up && b.done >= b.need));
      return ready
        ? '<em>демо-день</em>: есть что показать — на релизе придут новые клиенты'
        : '<strong>демо-день</strong>: дострой к релизу блок или доработку — придут 3 клиента; покажешь пустоту — один уйдёт';
    }
    if (net < 0) return `цель: выйти в плюс — не хватает <b>${money(-net)}</b> в секунду; клиентов приводит <b>продвижение</b>, удерживает <b>разведка</b>`;
    if (run.stage < 3) return `<em>в плюсе</em> · расти до подписок <b>${rate(TUNING.stage3_mrr / TUNING.sprint_s)}/с</b>: тогда у компании появится оценка и покупатель`;
    // the third stage is played for the price tag of the company
    return `оценка компании <em>${money(valuation(run))}</em> · подписки ×${Math.round(valueMult(run))}: множитель растят <b>связки</b> и <b>доработки</b>, роняет <b>техдолг</b>`;
  }

  /**
   * Teaching through play: Claude says one thing at the moment it matters. Most things once; what stops
   * the money (no way to charge the clients) — again and again until it is fixed. Never while his card
   * is busy with a release.
   */
  private teach(): void {
    if (this.termUntil > 0 && this.clock < this.termUntil - 4) return;
    const run = this.run;
    const tell = (key: string, lines: string[]): boolean => {
      if (this.said.has(key)) return false;
      this.said.add(key);
      this.say(['<b>❯ Клод</b>', ...lines], 13);
      playSound('quip');
      return true;
    };
    if (run.clients.length > 0 && !isLive(run, 'pay') && this.clock >= this.nagAt) {
      const pay = run.blocks.find((b) => b.kind === 'pay');
      const lines = !pay
        ? ['Клиенты пользуются бесплатно:', 'нам нечем брать с них деньги.', 'Выбери справа «Приём оплаты»', 'и поставь его на чертёж.']
        : !pay.built
          ? ['«Приём оплаты» ещё строится —', 'до него клиенты не платят.', 'Клик по стройке или Enter: помоги.']
          : ['«Приём оплаты» готов. Клиенты', 'начнут платить с ближайшего релиза.'];
      this.say(['<b>❯ Клод</b>', ...lines], 16);
      playSound('quip');
      this.nagAt = this.clock + 34;
      return;
    }
    if (run.stage >= 2 && run.agents.length === 1 && run.sprintT > 6) {
      if (tell('t:hire', ['Можно нанять второго агента.', 'Он стоит денег каждую секунду —', 'смотри на «денег на…» под счётчиком.'])) return;
    }
    if (run.stage >= 2 && run.clients.some((c) => !c.happy && !run.known.includes(c.want)) && !run.agents.some((a) => a.lane === 'research')) {
      if (tell('t:ask', ['Клиент чего-то ждёт и молчит.', 'Переведи агента на разведку —', 'он выяснит, какой блок им нужен.'])) return;
    }
    if (run.debt >= 10) {
      if (tell('t:debt', ['Техдолг растёт: счётчик справа от', 'денег, серые квадраты на блоках.', `Дойдёт до ${TUNING.debt.down_at} — продукт упадёт, и спринт`, 'никто не платит. Починка его снимает.'])) return;
    }
    if (run.agents.some((a) => a.lane === 'promo') && run.stats.clients > 0) {
      if (tell('t:promo', ['Продвижение копит нового клиента:', 'смотри «до нового клиента» у рынка.', 'Набралось 100% — он придёт на релизе,', 'если есть место.'])) return;
    }
    if (run.stage >= 2 && run.energy >= TUNING.crunch.max && run.sprintT > 10) {
      if (tell('t:hands', ['Силы — не только на код. Справа внизу,', 'в строке «руками»: напиши пост', 'или позвони клиенту сам.'])) return;
    }
    if (this.idle.size > 0 && sites(run).length === 0 && shelf(run).length > 0 && run.blocks.length > 0) {
      if (tell('t:idle', ['Строить нечего, агент простаивает', 'за твои деньги. Выбери блок справа', 'или дай ему другое дело.'])) return;
    }
    if (netPerS(run) >= 0 && run.clients.length > 0) {
      if (tell('t:profit', ['Мы в плюсе. Дальше — расти:', 'на третьем этапе у компании появится', 'оценка, и покупатель начнёт звонить.', 'Чем она выше к концу — тем лучше.'])) return;
    }
    if (run.clients.length > 0 && isDemo(run, run.sprint + 1)) {
      tell('t:demo', ['Следующий релиз после этого —', 'демо-день: его смотрят все.', 'Выйдет блок или доработка — придут', 'три клиента. Не выйдет — один уйдёт.']);
    }
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
    const full = sites(run).length >= TUNING.sites_max;
    // a founder who has seen an architecture reads on the shelf which blocks go side by side
    const arch = run.perks.includes('arch');
    const note = (kind: string): string => {
      const gives = effectLine(kind);
      const friends = arch ? `дружит: ${RULES[kind].friends.map((f) => BLOCK_BY_ID[f]?.short ?? f).join(', ')}` : '';
      // every shipped block is paid for every second: the shelf says how much before it is built
      const host = `хостинг ${rate(RULES[kind].host)}/с`;
      const facts = [gives, host, friends].filter((x) => x !== '').join(' · ');
      return BLOCK_BY_ID[kind].note + (facts ? `<span>${facts}</span>` : '');
    };
    const items: ShelfItem[] = shelf(run).map((kind) => ({
      id: kind,
      title: BLOCK_BY_ID[kind].name,
      // clients are here and there is nothing to charge them with: the shelf says so on the block itself
      mark: kind === 'pay' && run.clients.length > 0 ? 'нужен сейчас' : run.known.includes(kind) ? 'просят' : '',
      note: note(kind),
      price: `<u></u>${workNeed(run, kind)}`,
      state: this.picked === kind ? 'on' : full ? 'off' : 'can',
      // nothing is built and nothing is picked: the first card of the shelf asks to be clicked
      pulse: run.blocks.length === 0 && this.picked === null,
    }));
    // what clients are known to ask for goes to the top of the shelf
    items.sort((a, b) => Number(b.mark !== '') - Number(a.mark !== ''));
    // and above everything — the reworks clients asked for by name
    const more = Math.round((TUNING.rework.pay_mult - 1) * 100);
    const ups: ShelfItem[] = reworks(run).map((r) => ({
      id: `up:${r.kind}`,
      title: `${BLOCK_BY_ID[r.kind].name} v${r.level}`,
      mark: 'доработка',
      note: `просит ${r.who.join(', ')}<span>заплатит на ${more}% больше · хостинг +${rate(RULES[r.kind].host * TUNING.rework.host_mult)}/с</span>`,
      price: `<u></u>${reworkNeed(run, run.blocks.find((b) => b.kind === r.kind)!)}`,
      state: full ? 'off' : 'can',
    }));
    items.unshift(...ups);
    const rule = TUNING.stages[run.stage - 1];
    const rows: ShelfKeys[] = [
      {
        owner: 'hire',
        keys: TIERS.map((t) => ({ id: t, title: `+ ${TIER_NAME[t]} $${TUNING.tiers[t].cost_per_s}/с`, off: !canHire(run, t) })),
      },
      ...run.agents.map((a) => ({
        owner: `a${a.id}`,
        label: `<b>№${a.id}</b> ${TIER_NAME[a.tier]}`,
        keys: [...LANES.map((l) => ({ id: l as string, title: LANE_NAME[l] })), { id: 'drop', title: '×' }],
        on: a.lane as string,
      })),
    ];
    return [
      {
        id: 'blocks',
        title: 'БЛОКИ · ЧТО СТРОИМ ДАЛЬШЕ',
        hint: this.picked ? 'теперь клетка на чертеже' : full ? `стройка занята: ${TUNING.sites_max} из ${TUNING.sites_max}` : items.length === 0 ? 'всё построено' : '',
        items,
        scroll: 348,
      },
      {
        id: 'agents',
        title: `АГЕНТЫ · ${run.agents.length} ИЗ ${rule.agents_max}`,
        hint: `−${money(burnPerS(run) - incomePerS(run) > 0 ? burnPerS(run) : burnPerS(run))}/с всего`,
        rows,
      },
      {
        id: 'me',
        title: 'ТЫ · ОДИН ЧЕЛОВЕК',
        hint: `силы ${'■'.repeat(Math.floor(run.energy))}${'□'.repeat(TUNING.crunch.max - Math.floor(run.energy))}`,
        rows: [
          // what the founder checks: no debt there, and the work goes faster; chosen once a sprint
          { owner: 'me', label: run.reviewLocked ? 'проверяю <b>до релиза</b>' : 'проверяю', keys: LANES.map((l) => ({ id: l as string, title: LANE_NAME[l] })), on: run.review, lock: run.reviewLocked },
          // what he does with his own hands: one point of strength a square, on any lane
          { owner: 'hand', label: 'руками', keys: LANES.map((l) => ({ id: l as string, title: HAND_NAME[l], off: run.energy < 1 || !handy(run, l) })) },
        ],
      },
    ];
  }

  /** Laptops on the sheet follow the list of agents; each one's connector follows its lane. */
  private syncAgents(): void {
    const run = this.run;
    const board = this.board;
    const site = run.blocks.find(isSite);
    const sig = JSON.stringify([run.agents.map((a) => [a.id, a.lane]), site ? [site.i, site.j] : null, run.review]);
    if (sig === this.routeSig) return;
    this.routeSig = sig;

    // where the work of a lane goes on the sheet
    const targetOf = (lane: Lane): Pt | null => {
      if (lane === 'build') {
        if (!site) return null;
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
    if (mine) board.route('me', [from, [from[0] + 40, from[1]], [from[0] + 40, BUS_Y - 9], [mine[0], BUS_Y - 9], mine]);
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
    // the first client is already a reason to look wider: it stands to the right of the product
    const want = this.run.stage >= 3 ? 3 : this.run.stage === 2 || this.run.stats.clients > 0 ? 2 : 1;
    if (this.stageShown === want) return;
    this.stageShown = want;
    const v = STAGE_VIEW[want - 1];
    this.board.view(v.zoom, v.x, v.y, VIEW_AT[0], VIEW_AT[1], ms, () => undefined);
  }

  /** Subscriptions: green squares keep flying from the clients into the money. */
  private flowMoney(dt: number): void {
    this.payAt -= dt * Math.min(this.speed, 3);
    if (this.payAt > 0) return;
    const paying = this.run.clients.filter((c) => clientPay(this.run, c) > 0);
    if (paying.length === 0) {
      this.payAt = 0.5;
      return;
    }
    this.payAt = Math.max(0.12, 1.4 / paying.length);
    const c = paying[this.payTurn++ % paying.length];
    const [sx, sy] = CLIENT_SLOTS[c.slot % CLIENT_SLOTS.length];
    const [x, y] = this.board.onScreen(sx, sy - 70);
    this.squares.fly({ x: x - 20, y: y - 14, w: 40, h: 28 }, MONEY_RECT, CLIENT_LOOK[c.type].squares, PALETTE.money, 200, [0.9, 1.3], PALETTE.money);
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
    const parts = this.run.mods.map((m) => `${m.tag} · ещё ${m.left} спр.`);
    return [...parts, 'Esc — пауза, звук'].join('   ');
  }

  /** an event of the run takes the news line and holds it for a while */
  private news(text: string): void {
    this.paper.setNews(text, this.newsHint());
    this.newsHold = 12;
    this.newsAt = 12;
  }

  /** Claude's card for `seconds` */
  private say(lines: string[], seconds: number): void {
    this.paper.term(lines);
    this.termUntil = this.clock + seconds;
  }

  private nodePos(id: string): Pt {
    const img = this.board.node(id);
    return img ? [img.x, img.y] : [0, 0];
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
  return `${n} ${plural(n, ['спринт', 'спринта', 'спринтов'])}`;
}
