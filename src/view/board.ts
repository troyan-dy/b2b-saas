import type Phaser from 'phaser';
import { BLOCK_BY_ID, type BlockGroup } from '../content/blocks';
import { PALETTE } from '../data/palette';
import { cellCenter, drawBox, drawDebt, drawGlyph, drawProgress, drawSite, drawSlot, leftFace, type Pt } from './iso';

/** A block of the product as the sheet shows it. */
export interface BlockOnSheet {
  kind: string;
  i: number;
  j: number;
  built: boolean;
  /** squares of work delivered and needed */
  done: number;
  need: number;
  /** grey squares at its foot */
  debt: number;
}

export interface SlotOnSheet {
  i: number;
  j: number;
  hot: boolean;
}

interface Route {
  pts: readonly Pt[];
  len: number;
  arrow: boolean;
}

interface Dot {
  rect: Phaser.GameObjects.Rectangle;
  route: Route | null;
  dist: number;
  speed: number;
  done: (() => void) | null;
}

const SIDE: Record<BlockGroup, number> = {
  core: PALETTE.sand,
  sell: PALETTE.sage,
  ai: PALETTE.sand,
  corp: PALETTE.blue,
};
const DOTS = 220;

/** a connector with one right-angle turn: out along x, then along y */
export function elbow(a: Pt, b: Pt): Pt[] {
  return [a, [b[0], a[1]], b];
}

/**
 * The living sheet: the product as a diagram of isometric modules, node pictures (the founder, agents,
 * clients), connectors and squares running along them. Draws state, decides nothing.
 */
export class Board {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly lines: Phaser.GameObjects.Graphics;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly boxes: Phaser.GameObjects.Graphics;
  private readonly nodeLayer: Phaser.GameObjects.Container;
  private readonly nodes = new Map<string, Phaser.GameObjects.Image>();
  private readonly routes = new Map<string, Route>();
  private readonly dots: Dot[] = [];
  private signature = '';
  /** where cell (0, 0) of the product stands on the sheet */
  private readonly ox: number;
  private readonly oy: number;

  constructor(scene: Phaser.Scene, ox: number, oy: number) {
    this.scene = scene;
    this.ox = ox;
    this.oy = oy;
    this.lines = scene.add.graphics();
    this.ground = scene.add.graphics();
    this.nodeLayer = scene.add.container(0, 0);
    this.boxes = scene.add.graphics();
    this.root = scene.add.container(0, 0, [this.lines, this.ground, this.nodeLayer, this.boxes]);
    for (let k = 0; k < DOTS; k++) {
      const rect = scene.add.rectangle(0, 0, 11, 11, PALETTE.coral).setVisible(false);
      this.root.add(rect);
      this.dots.push({ rect, route: null, dist: 0, speed: 0, done: null });
    }
  }

  /** centre of the footprint of a cell, sheet coordinates */
  cell(i: number, j: number): Pt {
    return cellCenter(this.ox, this.oy, i, j);
  }

  /** centre of the top face of a block: where its squares land */
  top(b: { kind: string; i: number; j: number }): Pt {
    const [x, y] = this.cell(b.i, b.j);
    return [x, y - (BLOCK_BY_ID[b.kind]?.height ?? 20)];
  }

  /** middle of the left side of a block: its short name is written there */
  side(b: { kind: string; i: number; j: number }): Pt {
    const [x, y] = this.cell(b.i, b.j);
    return leftFace(x, y, BLOCK_BY_ID[b.kind]?.height ?? 40);
  }

  /** where a point of the sheet is on the screen right now: the sheet may be zoomed */
  onScreen(x: number, y: number): Pt {
    return [this.root.x + x * this.root.scaleX, this.root.y + y * this.root.scaleY];
  }

  get zoom(): number {
    return this.root.scaleX;
  }

  /** The pull-back of a new stage: the sheet shrinks around the point (fx, fy) of the screen. */
  zoomTo(scale: number, fx: number, fy: number, ms: number, onUpdate: () => void): void {
    const from = this.root.scaleX;
    // the sheet point that sits under (fx, fy) now stays there
    const sx = (fx - this.root.x) / from;
    const sy = (fy - this.root.y) / from;
    this.scene.tweens.add({
      targets: this.root,
      scale,
      x: fx - sx * scale,
      y: fy - sy * scale,
      duration: ms,
      ease: 'Cubic.InOut',
      onUpdate,
    });
  }

  /** Brings the modules in line with the product. */
  sync(blocks: readonly BlockOnSheet[], slots: readonly SlotOnSheet[]): void {
    const signature = JSON.stringify([blocks, slots]);
    if (signature === this.signature) return;
    this.signature = signature;

    const g = this.ground;
    g.clear();
    // modules that stand side by side are joined: the product is one diagram
    g.lineStyle(2, PALETTE.ink, 1);
    const at = new Set(blocks.map((b) => `${b.i},${b.j}`));
    for (const b of blocks) {
      const [x, y] = this.cell(b.i, b.j);
      for (const [di, dj] of [
        [1, 0],
        [0, 1],
      ] as const) {
        if (!at.has(`${b.i + di},${b.j + dj}`)) continue;
        const [nx, ny] = this.cell(b.i + di, b.j + dj);
        g.lineBetween(x, y, nx, ny);
      }
    }
    for (const s of slots) {
      const [x, y] = this.cell(s.i, s.j);
      drawSlot(g, x, y, s.hot);
    }

    const b = this.boxes;
    b.clear();
    // far cells first: a nearer module covers the one behind it
    for (const block of [...blocks].sort((p, q) => p.i + p.j - (q.i + q.j))) {
      const kind = BLOCK_BY_ID[block.kind];
      if (!kind) continue;
      const [x, y] = this.cell(block.i, block.j);
      if (block.built) {
        drawBox(b, x, y, kind.height, SIDE[kind.group]);
        drawGlyph(b, x, y, kind.height, kind.glyph);
        if (block.debt > 0) drawDebt(b, x, y, kind.height, block.debt);
      } else {
        drawSite(b, x, y, kind.height);
        drawProgress(b, x, y, kind.height, block.done, block.need);
      }
    }
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /** A picture on the sheet, anchored at its bottom centre. */
  addNode(id: string, texture: string, x: number, y: number, scale: number, pop: boolean): Phaser.GameObjects.Image {
    const img = this.scene.add.image(x, y, `node_${texture}`).setOrigin(0.5, 1).setScale(scale);
    this.nodeLayer.add(img);
    this.nodes.set(id, img);
    if (pop) {
      img.setScale(scale * 0.6).setAlpha(0);
      this.scene.tweens.add({ targets: img, scale, alpha: 1, duration: 280, ease: 'Back.Out' });
    }
    return img;
  }

  /** A node leaves the sheet: it fades and the picture is gone. */
  dropNode(id: string): void {
    const img = this.nodes.get(id);
    if (!img) return;
    this.nodes.delete(id);
    this.scene.tweens.add({ targets: img, alpha: 0, duration: 400, onComplete: () => img.destroy() });
  }

  /** Extra pictures drawn into the sheet by a scene: a face on a laptop screen and the like. */
  add(obj: Phaser.GameObjects.GameObject): void {
    this.nodeLayer.add(obj);
  }

  route(key: string, pts: readonly Pt[], arrow = true): void {
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    this.routes.set(key, { pts, len, arrow });
    this.redrawLines();
  }

  dropRoute(key: string): void {
    if (this.routes.delete(key)) this.redrawLines();
  }

  /** Sends a square along a connector; `done` fires when it arrives. */
  flow(key: string, color: number = PALETTE.coral, speed = 520, done: (() => void) | null = null): void {
    const route = this.routes.get(key);
    const dot = this.dots.find((d) => !d.route);
    if (!route || !dot) {
      done?.();
      return;
    }
    dot.route = route;
    dot.dist = 0;
    dot.speed = speed;
    dot.done = done;
    dot.rect.setFillStyle(color).setPosition(route.pts[0][0], route.pts[0][1]).setVisible(true);
  }

  step(dt: number): void {
    for (const d of this.dots) {
      if (!d.route) continue;
      d.dist += d.speed * dt;
      if (d.dist >= d.route.len) {
        d.route = null;
        d.rect.setVisible(false);
        d.done?.();
        d.done = null;
        continue;
      }
      let left = d.dist;
      for (let k = 1; k < d.route.pts.length; k++) {
        const [ax, ay] = d.route.pts[k - 1];
        const [bx, by] = d.route.pts[k];
        const seg = Math.hypot(bx - ax, by - ay);
        if (left <= seg) {
          const f = seg === 0 ? 0 : left / seg;
          d.rect.setPosition(ax + (bx - ax) * f, ay + (by - ay) * f);
          break;
        }
        left -= seg;
      }
    }
  }

  private redrawLines(): void {
    const g = this.lines;
    g.clear();
    g.lineStyle(2, PALETTE.ink, 1);
    g.fillStyle(PALETTE.ink, 1);
    for (const r of this.routes.values()) {
      for (let k = 1; k < r.pts.length; k++) {
        g.lineBetween(r.pts[k - 1][0], r.pts[k - 1][1], r.pts[k][0], r.pts[k][1]);
      }
      if (!r.arrow) continue;
      // a small arrowhead where the connector arrives
      const [ex, ey] = r.pts[r.pts.length - 1];
      const [px, py] = r.pts[r.pts.length - 2];
      const len = Math.hypot(ex - px, ey - py) || 1;
      const dx = (ex - px) / len;
      const dy = (ey - py) / len;
      g.fillTriangle(ex, ey, ex - dx * 12 - dy * 6, ey - dy * 12 + dx * 6, ex - dx * 12 + dy * 6, ey - dy * 12 - dx * 6);
    }
  }
}
