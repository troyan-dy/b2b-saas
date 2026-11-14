import Phaser from 'phaser';
import { logEvent, metrics } from '../core/metrics';
import type { Rng } from '../core/rng';
import { playSound, unlockSound } from '../core/sound';
import { PALETTE } from '../data/palette';
import type { Hud } from '../ui/hud';
import { dashedRect } from './lines';
import { Squares } from './squares';

const STEP = 1 / 60;
const LAPTOP = { x: 470, y: 640, w: 150, h: 96 };
const BLOCK = { x: 860, y: 470, w: 320, h: 190 };
const NEED = 12;

/** Environment check: any key sends Claude's squares from the laptop into a block under construction. */
export class HelloScene extends Phaser.Scene {
  private squares!: Squares;
  private fill!: Phaser.GameObjects.Graphics;
  private acc = 0;
  private built = 0;
  private readonly rng: Rng;
  private readonly hud: Hud;

  constructor(rng: Rng, hud: Hud) {
    super('hello');
    this.rng = rng;
    this.hud = hud;
  }

  create(): void {
    const g = this.add.graphics();
    g.lineStyle(2, PALETTE.ink);
    // the laptop: a screen and a base
    g.fillStyle(PALETTE.termBg).fillRoundedRect(LAPTOP.x, LAPTOP.y, LAPTOP.w, LAPTOP.h, 8);
    g.strokeRoundedRect(LAPTOP.x, LAPTOP.y, LAPTOP.w, LAPTOP.h, 8);
    g.fillStyle(PALETTE.coral).fillRect(LAPTOP.x + LAPTOP.w / 2 - 14, LAPTOP.y + LAPTOP.h / 2 - 14, 28, 28);
    g.lineBetween(LAPTOP.x - 24, LAPTOP.y + LAPTOP.h + 10, LAPTOP.x + LAPTOP.w + 24, LAPTOP.y + LAPTOP.h + 10);
    // the link: straight lines, a right-angle turn
    const midY = LAPTOP.y + LAPTOP.h / 2;
    g.lineBetween(LAPTOP.x + LAPTOP.w, midY, BLOCK.x - 80, midY);
    g.lineBetween(BLOCK.x - 80, midY, BLOCK.x - 80, BLOCK.y + BLOCK.h / 2);
    g.lineBetween(BLOCK.x - 80, BLOCK.y + BLOCK.h / 2, BLOCK.x, BLOCK.y + BLOCK.h / 2);

    this.fill = this.add.graphics();
    dashedRect(g, BLOCK.x, BLOCK.y, BLOCK.w, BLOCK.h, 14, 9);
    this.squares = new Squares(this, this.rng, 200);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (!e.repeat) this.press();
    });
    this.input.on('pointerdown', () => this.press());

    this.hud.setHint('любая клавиша — Клод кладёт квадрат в блок «MVP»');
    this.show();
    window.__GAME__.ready = true;
  }

  update(_time: number, deltaMs: number): void {
    this.acc += Math.min(deltaMs / 1000, 0.25);
    while (this.acc >= STEP) {
      this.squares.step(STEP);
      this.acc -= STEP;
    }
  }

  private press(): void {
    unlockSound();
    metrics.presses++;
    metrics.completed = metrics.presses >= 3;
    logEvent('press');
    if (this.built >= NEED) return;
    this.built++;
    playSound('yes', this.built % 5);
    this.squares.fly(LAPTOP, BLOCK, 3, PALETTE.coral, 140, [0.45, 0.7]);
    this.show();
  }

  private show(): void {
    const done = this.built >= NEED;
    this.hud.setCount(`${this.built} / ${NEED}`);
    if (done) this.hud.setHint('блок «MVP» готов. Клиентов пока нет, зато есть лендинг');
    const cols = 4;
    const cell = 54;
    this.fill.clear().fillStyle(done ? PALETTE.sage : PALETTE.coral);
    for (let i = 0; i < this.built; i++) {
      const cx = BLOCK.x + 34 + (i % cols) * (cell + 12);
      const cy = BLOCK.y + 20 + Math.floor(i / cols) * (cell - 2);
      this.fill.fillRect(cx, cy, cell, cell - 14);
    }
  }
}
