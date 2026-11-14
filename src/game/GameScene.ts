import Phaser from 'phaser';
import { BLOCK_BY_ID } from '../content/blocks';
import { BANK_ANSWERS, BANK_TEXT, CALL_ANSWERS, CALL_ASK, LANE_ACC, LANE_NAME, LEFT_KNOWN, LEFT_UNKNOWN, NEWS, NEWS_EVENT, releaseLines, TIER_NAME } from '../content/texts';
import { logEvent, metrics } from '../core/metrics';
import type { Rng } from '../core/rng';
import { playSound, unlockSound } from '../core/sound';
import { PALETTE } from '../data/palette';
import { money, plural } from '../ui/format';
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
  freeCells,
  friendsAt,
  hire,
  IDEAS,
  incomePerS,
  LANES,
  links,
  netPerS,
  pitch,
  place,
  setLane,
  setReview,
  shelf,
  sites,
  step,
  TIERS,
  TUNING,
  workNeed,
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

export interface GameHooks {
  /** called every simulated step, before it: a bot plays here */
  beforeStep?: (run: Run) => void;
  onEnd: (run: Run) => void;
  /** the player drops the startup from the pause card */
  onQuit: () => void;
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

  constructor(run: Run, rng: Rng, paper: Paper, hooks: GameHooks) {
    super('game');
    this.run = run;
    this.rng = rng;
    this.paper = paper;
    this.hooks = hooks;
  }

  preload(): void {
    const keys = ['desk', 'laptop', this.run.idea.aud.texture, ...IDEAS.corp.map((c) => c.texture)];
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
    this.paper.setNews(`${pitch(this.run.idea)}. Пока что это три слова и один человек`, 'Esc — пауза');
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

  /** The founder's own square: thrown from the desk into the site. */
  private byHand(): void {
    unlockSound();
    const site = this.run.blocks.find((b) => !b.built);
    if (!site || !crunch(this.run)) {
      playSound('waste');
      if (site) {
        const [x, y] = this.board.onScreen(DESK[0], DESK[1] - 200);
        this.paper.pop(x, y, 'сил нет: подожди', 'bad');
      }
      return;
    }
    this.hands++;
    playSound('yes', this.hands % 6);
    const [fx, fy] = this.board.onScreen(DESK[0] - 40, DESK[1] - 130);
    const [tx, ty] = this.board.onScreen(...this.board.top(site));
    this.squares.fly({ x: fx - 10, y: fy - 10, w: 20, h: 20 }, { x: tx - 20, y: ty - 10, w: 40, h: 20 }, 1, PALETTE.coral, 160, [0.35, 0.45]);
  }

  private onKey(owner: string, key: string): void {
    unlockSound();
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
      if (k === 1) {
        this.hooks.onQuit();
        return;
      }
      this.pauseCard = false;
      this.paused = false;
      return;
    }
    // one card at a time, the most urgent first: the bank, a client on the line, the buyer
    if (this.run.lastChance !== null) answerLastChance(this.run, k === 0);
    else if (this.run.call) answerCall(this.run, k === 1);
    else answerOffer(this.run, k === 0);
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
      if (e.code === 'Digit1' || e.code === 'Digit2') this.onAnswer(e.code === 'Digit1' ? 0 : 1);
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (!e.repeat) this.byHand();
      return;
    }
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (!digit) return;
    if (this.run.offer !== null || this.run.call || this.run.lastChance !== null) {
      if (digit[1] === '1' || digit[1] === '2') this.onAnswer(Number(digit[1]) - 1);
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
        this.say(releaseLines({ ...e.report, shipped: names, reasons }), 16);
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
        const h = c.size === 'corp' ? 150 : c.size === 'mid' ? 136 : 118;
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
        logEvent('client');
        if (run.stats.clients === 1) this.news(NEWS_EVENT.firstClient);
        break;
      }
      case 'left': {
        const [x, y] = this.board.onScreen(...this.nodePos(`c${e.id}`));
        const pool = e.reason ? LEFT_KNOWN : LEFT_UNKNOWN;
        this.paper.pop(x, y - 150 * this.board.zoom, pool[e.id % pool.length].replace('%s', BLOCK_BY_ID[e.reason]?.short ?? ''), 'bad');
        this.board.dropNode(`c${e.id}`);
        this.board.dropRoute(`c${e.id}`);
        this.paper.dropTag(`c${e.id}`);
        playSound('waste');
        logEvent('left');
        if (!this.said.has('left')) {
          this.said.add('left');
          this.news(NEWS_EVENT.firstLeft);
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
      case 'lastchance':
        playSound('waste');
        this.cameras.main.shake(220, 0.005);
        logEvent('lastchance');
        break;
      case 'end':
        logEvent(`end:${e.ending}`);
        this.ended = true;
        this.paper.call(null);
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
      return { kind: b.kind, i: b.i, j: b.j, built: b.built && landed >= b.need, done: landed, need: b.need, debt: 0 };
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
    const cells = free.map((c) => {
      const [x, y] = board.onScreen(...board.cell(c.i, c.j));
      return { id: `${c.i},${c.j}`, x, y };
    });
    const site = run.blocks.find((b) => !b.built);
    if (!this.picked && site) {
      // the site itself takes clicks: the founder finishes the work by hand
      const [x, y] = board.onScreen(...board.top(site));
      cells.push({ id: 'site', x, y });
    }
    this.paper.setCells(cells);

    const keep = new Set<string>();
    for (const b of blocks) {
      const kind = BLOCK_BY_ID[b.kind];
      const [x, y] = board.onScreen(...board.side(b));
      const id = `b:${b.kind}`;
      keep.add(id);
      this.paper.tag(id, x, y, kind.short, b.built ? 'face' : 'face hot');
      if (!b.built) {
        // how much of the site is done: a number above it
        const [tx, ty] = board.onScreen(...board.top(b));
        keep.add(`b:n${b.kind}`);
        this.paper.tag(`b:n${b.kind}`, tx, ty - 78 * z, `<b>${b.done}/${b.need}</b>`, 'small hot');
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
    this.paper.tag('me', Math.max(10, mx), my, `<b>ты</b> · проверяешь ${LANE_ACC[run.review]}<i>силы ${pips}</i>`, 'left');
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
    if (promo || research || run.clients.length > 0) {
      const [x, y] = board.onScreen(MARKET[0], MARKET[1] + 10);
      const unknown = [...run.asks, ...(run.stage >= 2 ? run.corpAsks : [])].filter((k) => !run.known.includes(k)).length;
      const parts = [`лиды <b>${run.leads.toFixed(1).replace('.', ',')}</b>`];
      parts.push(unknown > 0 ? `разведка <b>${run.insight}/${TUNING.research_work_per_reveal}</b>` : 'все запросы известны');
      this.paper.tag('market', x, y, `рынок · ${parts.join(' · ')}`, 'small');
    }

    // clients
    for (const c of run.clients) {
      const [sx, sy] = CLIENT_SLOTS[c.slot % CLIENT_SLOTS.length];
      const [x, y] = board.onScreen(sx, sy + 6);
      const pay = clientPay(run, c);
      // two short lines: the name, then the money and the mood — twelve of them must fit side by side
      const paid = pay > 0 ? `<em>${money(pay)}</em>` : run.down ? 'лежим' : 'бесплатно';
      let mood: string;
      if (c.happy) mood = `<i>${paid} · доволен</i>`;
      else if (c.promised) mood = `<i class="bad">обещан «${BLOCK_BY_ID[c.want]?.short}» · ${c.patience} спр.</i>`;
      else if (run.known.includes(c.want)) mood = `<i class="bad">ждёт «${BLOCK_BY_ID[c.want]?.short}» · ${c.patience} спр.</i>`;
      else mood = `<i class="bad">чего-то ждёт · ${c.patience} спр.</i>`;
      this.paper.tag(`c${c.id}`, x, y, `<b>${c.name}</b>${c.happy ? '' : ` · ${paid}`}${mood}`, 'small');
    }

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
    this.paper.setSprint(`СПРИНТ ${Math.min(run.sprint, TUNING.last_sprint)} ИЗ ${TUNING.last_sprint} · РЕЛИЗ ЧЕРЕЗ ${leftS} С`, run.sprintT / TUNING.sprint_s);
    // the goal is always on the sheet: three frames taken at random must say what to do
    if (run.blocks.length === 0) this.paper.setGoal('цель: поставить первый блок — <b>выбери его справа</b>');
    else if (run.stats.clients === 0) this.paper.setGoal('цель: первый клиент — нужны <b>ядро</b> и <b>лендинг</b> в релизе');
    else if (net < 0) this.paper.setGoal(`цель: выйти в плюс — не хватает <b>${money(-net)}</b> в секунду`);
    else this.paper.setGoal(`<em>в плюсе</em> · удержись до ${TUNING.last_sprint}-го спринта или расти до звонка покупателя`);
    if (!this.ended) this.teach();

    this.paper.setShelf(this.shelfView());
    if (this.pauseCard) {
      this.paper.call({
        who: 'ПАУЗА',
        text: 'Деньги не горят, пока ты думаешь. В жизни так не бывает.',
        options: ['Вернуться к стартапу', 'Бросить стартап и выйти в меню'],
      });
    } else if (run.lastChance !== null) {
      this.paper.call({ who: 'ЗВОНОК · БАНК', text: BANK_TEXT.replace('%s', money(run.lastChance)), options: BANK_ANSWERS });
    } else if (run.call) {
      this.paper.call({
        who: `ЗВОНОК · ${run.call.name.toUpperCase()}`,
        text: CALL_ASK[run.call.want] ?? `А «${BLOCK_BY_ID[run.call.want]?.name}» у вас есть? Нам без этого никак.`,
        options: CALL_ANSWERS,
      });
    } else if (run.offer !== null) {
      this.paper.call({
        who: 'ЗВОНОК · ПОКУПАТЕЛЬ',
        text: `Нам очень нравится ваш продукт. Предлагаем <em>${money(run.offer)}</em> за компанию. Продукт мы, правда, закроем.`,
        options: ['Продать и написать пост об успехе', 'Отказаться: «мы только начинаем»'],
      });
    } else this.paper.call(null);

    if (this.termUntil > 0 && this.clock > this.termUntil) {
      this.termUntil = 0;
      this.paper.term(null);
    }
  }

  /**
   * Teaching through play: Claude says one thing at the moment it matters, once. Never while his card
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
    if (run.clients.length > 0 && !run.blocks.some((b) => b.kind === 'pay')) {
      if (tell('t:pay', ['У нас клиент, но брать с него', 'деньги нечем. Поставь «Приём оплаты».'])) return;
    }
    if (run.stage >= 2 && run.agents.length === 1 && run.sprintT > 6) {
      if (tell('t:hire', ['Можно нанять второго агента.', 'Он стоит денег каждую секунду —', 'смотри на «денег на…» под счётчиком.'])) return;
    }
    if (run.stage >= 2 && run.clients.some((c) => !c.happy && !run.known.includes(c.want)) && !run.agents.some((a) => a.lane === 'research')) {
      if (tell('t:ask', ['Клиент чего-то ждёт и молчит.', 'Переведи агента на разведку —', 'он выяснит, какой блок им нужен.'])) return;
    }
    if (run.debt >= 10) {
      if (tell('t:debt', ['Долг растёт: это серые квадраты', 'на блоках. Починка его снимает.', 'Что проверяешь сам — долга не даёт.'])) return;
    }
    if (this.idle.size > 0 && sites(run).length === 0 && shelf(run).length > 0 && run.blocks.length > 0) {
      if (tell('t:idle', ['Строить нечего, агент простаивает', 'за твои деньги. Выбери блок справа', 'или дай ему другое дело.'])) return;
    }
    if (netPerS(run) >= 0 && run.clients.length > 0) {
      tell('t:profit', ['Мы в плюсе. Можно дожить так', `до ${TUNING.last_sprint}-го спринта, а можно расти:`, 'при больших подписках позвонит покупатель.']);
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
    const items: ShelfItem[] = shelf(run).map((kind) => ({
      id: kind,
      title: BLOCK_BY_ID[kind].name,
      mark: run.known.includes(kind) ? 'просят' : '',
      note: BLOCK_BY_ID[kind].note,
      price: `<u></u>${workNeed(run, kind)}`,
      state: this.picked === kind ? 'on' : full ? 'off' : 'can',
    }));
    // what clients are known to ask for goes to the top of the shelf
    items.sort((a, b) => Number(b.mark !== '') - Number(a.mark !== ''));
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
        title: 'ТЫ · ЧТО ПРОВЕРЯЕШЬ САМ',
        hint: run.reviewLocked ? 'до релиза' : 'там долг не копится',
        rows: [{ owner: 'me', keys: LANES.map((l) => ({ id: l as string, title: LANE_NAME[l] })), on: run.review, lock: run.reviewLocked }],
      },
    ];
  }

  /** Laptops on the sheet follow the list of agents; each one's connector follows its lane. */
  private syncAgents(): void {
    const run = this.run;
    const board = this.board;
    const site = run.blocks.find((b) => !b.built);
    const sig = JSON.stringify([run.agents.map((a) => [a.id, a.lane]), site ? [site.i, site.j] : null]);
    if (sig === this.routeSig) return;
    this.routeSig = sig;

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
      let target: Pt | null = null;
      if (a.lane === 'build' && site) {
        const [cx, cy] = board.cell(site.i, site.j);
        target = [cx, cy + 56];
      } else if (a.lane === 'fix') {
        const [cx, cy] = board.cell(0, 0);
        target = [cx, cy + 56];
      } else if (a.lane === 'promo' || a.lane === 'research') target = MARKET;
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
    this.squares.fly({ x: x - 20, y: y - 14, w: 40, h: 28 }, MONEY_RECT, c.size === 'corp' ? 3 : 1, PALETTE.money, 200, [0.9, 1.3], PALETTE.money);
    if (this.payTurn % 6 === 0) this.paper.popMoney();
  }

  private tickNews(dt: number): void {
    this.newsHold -= dt;
    this.newsAt -= dt;
    if (this.newsAt > 0 || this.newsHold > 0) return;
    this.newsAt = 17;
    this.paper.setNews(NEWS[this.newsIndex++ % NEWS.length], 'Esc — пауза');
  }

  /** an event of the run takes the news line and holds it for a while */
  private news(text: string): void {
    this.paper.setNews(text, 'Esc — пауза');
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
