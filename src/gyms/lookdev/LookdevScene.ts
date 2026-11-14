import Phaser from 'phaser';
import { BLOCK_BY_ID } from '../../content/blocks';
import type { Rng } from '../../core/rng';
import { PALETTE } from '../../data/palette';
import { money } from '../../ui/format';
import type { Paper, ShelfItem, ShelfSection } from '../../ui/paper';
import { Board, type BlockOnSheet } from '../../view/board';
import { Squares } from '../../view/squares';

const STEP = 1 / 60;
const LANES = [
  { id: 'build', title: 'стройка' },
  { id: 'fix', title: 'починка' },
  { id: 'promo', title: 'продвижение' },
  { id: 'research', title: 'разведка' },
];

/** pictures of the sheet this scene uses */
const TEXTURES = ['desk', 'laptop', 'clinic', 'barber', 'bank'];

/**
 * Look-dev: the key frame of the game with made-up numbers. The same Board and Paper the game uses;
 * nothing here is a mechanic — squares run on a timer so that the picture lives.
 */
export class LookdevScene extends Phaser.Scene {
  private board!: Board;
  private squares!: Squares;
  private acc = 0;
  private t = 0;
  private cash = 4120;
  private built = 5;
  private readonly rng: Rng;
  private readonly paper: Paper;
  private blocks: BlockOnSheet[] = [];
  private nextWork = 0;
  private sent = 0;
  private paid = 0;
  private nextPay = 0.8;

  constructor(rng: Rng, paper: Paper) {
    super('lookdev');
    this.rng = rng;
    this.paper = paper;
  }

  preload(): void {
    for (const key of TEXTURES) this.load.image(`node_${key}`, `assets/img/nodes/${key}.webp`);
  }

  create(): void {
    const board = new Board(this, 600, 480);
    this.board = board;
    this.squares = new Squares(this, this.rng, 300);

    this.blocks = [
      { kind: 'core', i: 0, j: 0, built: true, done: 0, need: 0, debt: 0 },
      { kind: 'landing', i: 1, j: 0, built: true, done: 0, need: 0, debt: 0 },
      { kind: 'pay', i: 0, j: 1, built: true, done: 0, need: 0, debt: 7 },
      { kind: 'bot', i: 0, j: -1, built: true, done: 0, need: 0, debt: 0 },
      { kind: 'crm', i: 1, j: -1, built: false, done: this.built, need: 8, debt: 0 },
    ];

    // the founder: the only human on the sheet
    const desk = this.place('me', 'desk', 190, 640, 196);
    this.face(190 - desk.displayWidth / 2 + 103.5 * desk.scaleX, 640 - desk.displayHeight + 98 * desk.scaleY, 26 * desk.scaleX, 22 * desk.scaleY, -0.38);
    this.paper.tag('me', 190, 648, '<b>ты</b> · проверяешь стройку');

    // agents: laptops with Claude on the screen; each sends its work along its own connector
    this.agent('a1', 300, 930);
    this.agent('a2', 540, 930);
    this.paper.tag('a1', 300, 938, '<b>агент №1</b> · починка<i>думающий</i>');
    this.paper.tag('a2', 540, 938, '<b>агент №2</b> · стройка<i>быстрый</i>');
    const pay = board.cell(0, 1);
    board.route('a1', [
      [300, 808],
      [300, 740],
      [pay[0], 740],
      [pay[0], pay[1] + 56],
    ]);
    const site = board.cell(1, -1);
    board.route('a2', [
      [540, 808],
      [540, 770],
      [site[0], 770],
      [site[0], site[1] + 56],
    ]);

    // clients: buildings of the audience, each on its own stub of one trunk
    const clients: [string, string, number, string][] = [
      ['c1', 'clinic', 300, '<b>«Улыбка»</b> · <em>$40</em> за спринт<i>всем довольна</i>'],
      ['c2', 'barber', 560, '<b>«Борода»</b> · <em>$40</em> за спринт<i class="bad">ждёт интеграцию с CRM</i>'],
      ['c3', 'bank', 850, '<b>Банк</b> · <em>$600</em> за спринт<i class="bad">ждёт вход по почте · 2 спринта</i>'],
    ];
    for (const [id, texture, y, caption] of clients) {
      const img = this.place(id, texture, 1200, y, 128);
      const left = 1200 - img.displayWidth / 2 - 10;
      board.route(id, [
        [site[0] + 104, site[1]],
        [1062, site[1]],
        [1062, y - 60],
        [left, y - 60],
      ]);
      this.paper.tag(id, 1200, y + 6, caption, 'small');
    }

    // every module is signed on its side
    for (const b of this.blocks) {
      if (!b.built) continue;
      const [x, y] = board.side(b);
      this.paper.tag(`b:${b.kind}`, x, y, BLOCK_BY_ID[b.kind].short, 'face');
    }

    this.paper.setNews('Клод научился делать это сам. Четыреста стартапов узнали об этом из рассылки', 'Esc — меню');
    this.paper.setShelf(this.shelf());
    this.paper.term([
      '<b>❯ релиз · спринт 6</b>',
      '<em>+2</em> клиента · <strong>−1</strong> ушёл: «нет CRM»',
      'подписки <em>$680</em> · токены −$95',
      '<span>долг 7 — держится на честном слове</span>',
    ]);

    this.redraw();
    window.__GAME__.ready = true;
  }
  update(_time: number, deltaMs: number): void {
    this.acc += Math.min(deltaMs / 1000, 0.25);
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
  }

  private step(dt: number): void {
    this.t += dt;
    this.cash -= 31 * dt;

    // work is a stream: the fast agent's connector is visibly busier than the thinking one's
    this.nextWork -= dt;
    if (this.nextWork <= 0) {
      this.nextWork = 0.3;
      this.sent++;
      this.board.flow('a2', PALETTE.coral, 520, () => {
        if (this.sent % 4 !== 0) return;
        this.built = this.built >= 8 ? 2 : this.built + 1;
        this.redraw();
      });
      if (this.sent % 3 === 0) this.board.flow('a1', PALETTE.coral, 420);
      if (this.sent % 2 === 0) this.board.flow(['c1', 'c2', 'c3'][(this.sent / 2) % 3], PALETTE.coral, 380);
    }

    // subscriptions: green squares keep flying from the clients into the money
    this.nextPay -= dt;
    if (this.nextPay <= 0) {
      this.nextPay = 0.45;
      this.paid++;
      const [y, sum] = (
        [
          [240, 40],
          [500, 40],
          [790, 600],
          [790, 600],
        ] as const
      )[this.paid % 4];
      this.squares.fly({ x: 1150, y: y - 20, w: 60, h: 40 }, { x: 560, y: 60, w: 220, h: 90 }, sum > 100 ? 3 : 1, PALETTE.money, 220, [0.9, 1.3], PALETTE.money);
      this.cash += sum / 12;
      if (this.paid % 4 === 0) this.paper.popMoney();
    }
    const left = Math.max(0, this.cash / 31);
    const mm = Math.floor(left / 60);
    const ss = String(Math.floor(left % 60)).padStart(2, '0');
    this.paper.setMoney(money(this.cash), `<b class="hot">−$31</b> в секунду · денег на <b>${mm}:${ss}</b>`);
    const part = (this.t % 40) / 40;
    this.paper.setSprint(`СПРИНТ 7 · РЕЛИЗ ЧЕРЕЗ ${Math.ceil(40 - part * 40)} С`, part);

    this.board.step(dt);
    this.squares.step(dt);
  }

  private redraw(): void {
    const site = this.blocks[this.blocks.length - 1];
    site.done = this.built;
    this.board.sync(this.blocks, [
      { i: -1, j: 0, hot: false },
      { i: 1, j: 1, hot: true },
      { i: 0, j: -2, hot: false },
    ]);
    const [x, y] = this.board.side(site);
    this.paper.tag('b:site', x, y, `CRM ${site.done}/${site.need}`, 'face hot');
    const [sx, sy] = this.board.cell(1, 1);
    this.paper.tag('b:slot', sx, sy + 56, 'сюда встанет вход SSO', 'small');
  }
  private place(id: string, texture: string, x: number, y: number, height: number): Phaser.GameObjects.Image {
    const source = this.textures.get(`node_${texture}`).getSourceImage();
    return this.board.addNode(id, texture, x, y, height / source.height, false);
  }

  private agent(id: string, x: number, y: number): void {
    const img = this.place(id, 'laptop', x, y, 118);
    const k = img.scaleX / 0.5;
    this.face(x + 14 * k, y - 128 * k, 14 * k, 12 * k, 0.37);
  }

  /** Claude on a laptop screen: a coral square tilted with the screen */
  private face(x: number, y: number, w: number, h: number, rot: number): void {
    this.board.add(this.add.rectangle(x, y, w, h, PALETTE.coral).setRotation(rot));
  }

  private shelf(): ShelfSection[] {
    const block = (id: string, price: string, state: 'can' | 'on'): ShelfItem => ({
      id,
      title: BLOCK_BY_ID[id].name,
      note: BLOCK_BY_ID[id].note,
      price,
      state,
    });
    return [
      {
        id: 'blocks',
        title: 'БЛОКИ · ЧТО СТРОИМ ДАЛЬШЕ',
        items: [
          block('sso', '<u></u>10', 'on'),
          block('dash', '<u></u>6', 'can'),
          block('api', '<u></u>8', 'can'),
          { id: 'unknown', title: '???', note: 'расспроси клиентов — узнаешь, чего им не хватает', price: '', state: 'off' },
        ],
      },
      {
        id: 'agents',
        title: 'АГЕНТЫ · КТО СТРОИТ',
        items: [
          { id: 'fast', title: 'Быстрый агент', mark: '×1', note: 'много кода, много долга', price: '$6/с', cash: true, state: 'can' },
          { id: 'think', title: 'Думающий агент', mark: '×1', note: 'медленно, дорого, зато без долга', price: '$20/с', cash: true, state: 'poor' },
        ],
        rows: [
          { owner: 'a1', label: '<b>№1</b> думающий', keys: LANES, on: 'fix' },
          { owner: 'a2', label: '<b>№2</b> быстрый', keys: LANES, on: 'build' },
        ],
      },
      {
        id: 'me',
        title: 'ТЫ · ЧТО ПРОВЕРЯЕШЬ САМ',
        hint: 'там долг не копится',
        rows: [{ owner: 'me', keys: LANES, on: 'build' }],
      },
    ];
  }
}
