import type Phaser from 'phaser';
import { PALETTE } from '../data/palette';
import { dashedLine } from './lines';

export type Pt = readonly [number, number];

/** the pitch of the product grid on the sheet: 2:1 isometry */
export const CELL_W = 300;
export const CELL_H = 150;
/** a module is much smaller than its cell: its sides stay visible and the links between modules show in the gaps */
export const BOX_W = 192;
export const BOX_H = 96;

/** One line of a glyph on the top face of a module, in face coordinates: u runs N→E, v runs N→W, 0..1. */
export interface Stroke {
  pts: readonly Pt[];
  closed?: boolean;
  fill?: 'coral' | 'ink' | 'sage' | 'blue' | 'sand';
  /** filled shapes only: no outline */
  bare?: boolean;
}

/** centre of the footprint of cell (i, j); `ox`, `oy` — where cell (0, 0) stands */
export function cellCenter(ox: number, oy: number, i: number, j: number): Pt {
  return [ox + ((i - j) * CELL_W) / 2, oy + ((i + j) * CELL_H) / 2];
}

/** a point of a rhombus face centred at (cx, cy) */
export function facePoint(cx: number, cy: number, u: number, v: number): Pt {
  return [cx + ((u - v) * BOX_W) / 2, cy - BOX_H / 2 + ((u + v) * BOX_H) / 2];
}

function path(g: Phaser.GameObjects.Graphics, pts: readonly Pt[], closed: boolean): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
  if (closed) g.closePath();
}

function corners(cx: number, cy: number, height: number): { n: Pt; e: Pt; s: Pt; w: Pt; e0: Pt; s0: Pt; w0: Pt } {
  const top = cy - height;
  return {
    n: [cx, top - BOX_H / 2],
    e: [cx + BOX_W / 2, top],
    s: [cx, top + BOX_H / 2],
    w: [cx - BOX_W / 2, top],
    e0: [cx + BOX_W / 2, cy],
    s0: [cx, cy + BOX_H / 2],
    w0: [cx - BOX_W / 2, cy],
  };
}

/** A built module: a flat isometric box, one thin ink line, one rare fill on the left side. */
export function drawBox(g: Phaser.GameObjects.Graphics, cx: number, cy: number, height: number, side: number): void {
  const c = corners(cx, cy, height);
  g.lineStyle(2, PALETTE.ink, 1);
  g.fillStyle(side, 1);
  path(g, [c.w, c.s, c.s0, c.w0], true);
  g.fillPath();
  g.fillStyle(PALETTE.card, 1);
  path(g, [c.s, c.e, c.e0, c.s0], true);
  g.fillPath();
  path(g, [c.n, c.e, c.s, c.w], true);
  g.fillPath();
  // the edges inside are thin, the outline of the whole module is heavy: weight without more fill
  g.lineStyle(1.5, PALETTE.ink, 1);
  path(g, [c.w, c.s, c.e], false);
  g.strokePath();
  g.lineBetween(c.s[0], c.s[1], c.s0[0], c.s0[1]);
  g.lineStyle(3, PALETTE.ink, 1);
  path(g, [c.n, c.e, c.e0, c.s0, c.w0, c.w], true);
  g.strokePath();
}

/** A module that is not built yet: the same box in a dashed line, paper inside. */
export function drawSite(g: Phaser.GameObjects.Graphics, cx: number, cy: number, height: number): void {
  const c = corners(cx, cy, height);
  g.fillStyle(PALETTE.paper, 1);
  path(g, [c.n, c.e, c.e0, c.s0, c.w0, c.w], true);
  g.fillPath();
  g.lineStyle(2, PALETTE.ink, 1);
  const edges: [Pt, Pt][] = [
    [c.n, c.e],
    [c.e, c.s],
    [c.s, c.w],
    [c.w, c.n],
    [c.w, c.w0],
    [c.w0, c.s0],
    [c.s0, c.e0],
    [c.e0, c.e],
    [c.s, c.s0],
  ];
  for (const [a, b] of edges) dashedLine(g, a[0], a[1], b[0], b[1], 9, 7);
}

/** A free cell the next module may stand on: a faint dashed footprint. */
export function drawSlot(g: Phaser.GameObjects.Graphics, cx: number, cy: number, hot: boolean): void {
  const c = corners(cx, cy, 0);
  g.lineStyle(hot ? 2.5 : 1.5, hot ? PALETTE.coral : PALETTE.rule, 1);
  const edges: [Pt, Pt][] = [
    [c.n, c.e],
    [c.e, c.s],
    [c.s, c.w],
    [c.w, c.n],
  ];
  for (const [a, b] of edges) dashedLine(g, a[0], a[1], b[0], b[1], 7, 7);
}

const GLYPH_SCALE = 1.2;
const FILLS = { coral: PALETTE.coral, ink: PALETTE.ink, sage: PALETTE.sage, blue: PALETTE.blue, sand: PALETTE.sand } as const;

/** The pictogram of a module, drawn flat on its top face. */
export function drawGlyph(g: Phaser.GameObjects.Graphics, cx: number, cy: number, height: number, glyph: readonly Stroke[]): void {
  const top = cy - height;
  g.lineStyle(2.5, PALETTE.ink, 1);
  for (const s of glyph) {
    // pictograms are drawn in a 0..1 square and shown a little larger: they must read from afar
    const pts = s.pts.map(([u, v]) => facePoint(cx, top, 0.5 + (u - 0.5) * GLYPH_SCALE, 0.5 + (v - 0.5) * GLYPH_SCALE));
    if (s.fill) {
      g.fillStyle(FILLS[s.fill], 1);
      path(g, pts, true);
      g.fillPath();
    }
    if (!s.bare) {
      path(g, pts, s.closed ?? false);
      g.strokePath();
    }
  }
}

/** Work delivered to a site: coral squares lie on its top face, row by row. */
export function drawProgress(g: Phaser.GameObjects.Graphics, cx: number, cy: number, height: number, done: number, need: number): void {
  const top = cy - height;
  const cols = Math.ceil(Math.sqrt(need));
  const rows = Math.ceil(need / cols);
  g.fillStyle(PALETTE.coral, 1);
  for (let k = 0; k < Math.min(done, need); k++) {
    const u0 = 0.12 + ((k % cols) / cols) * 0.76;
    const v0 = 0.12 + (Math.floor(k / cols) / rows) * 0.76;
    const du = (0.76 / cols) * 0.72;
    const dv = (0.76 / rows) * 0.72;
    path(g, [facePoint(cx, top, u0, v0), facePoint(cx, top, u0 + du, v0), facePoint(cx, top, u0 + du, v0 + dv), facePoint(cx, top, u0, v0 + dv)], true);
    g.fillPath();
  }
}

/** Technical debt on a module: grey squares stuck to its right side, row by row along the edge. */
export function drawDebt(g: Phaser.GameObjects.Graphics, cx: number, cy: number, height: number, count: number): void {
  g.fillStyle(PALETTE.debt, 1);
  const perRow = 5;
  for (let k = 0; k < count; k++) {
    // the right side runs from the south corner up to the east one
    const f = 0.14 + (k % perRow) * 0.16;
    const x = cx + (f * BOX_W) / 2;
    const y = cy + BOX_H / 2 - (f * BOX_H) / 2 - 14 - Math.floor(k / perRow) * 13;
    if (y < cy + BOX_H / 2 - (f * BOX_H) / 2 - height) break;
    path(g, [[x, y], [x + 10, y - 5], [x + 10, y + 5], [x, y + 10]], true);
    g.fillPath();
  }
}

/** middle of the left side of a module: its short name is written there, slanted with the edge */
export function leftFace(cx: number, cy: number, height: number): Pt {
  return [cx - BOX_W / 4, cy + BOX_H / 4 - height / 2];
}

/** the slope of the left side, degrees: captions on it are skewed by this much */
export const FACE_SKEW = (Math.atan2(BOX_H, BOX_W) * 180) / Math.PI;

/** a ring of `n` points on the face: circles and arcs of the pictograms */
export function ring(cu: number, cv: number, r: number, n = 14, from = 0, to = Math.PI * 2): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const a = from + ((to - from) * k) / n;
    pts.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r]);
  }
  return pts;
}

/** an axis-aligned rectangle on the face */
export function rect(u: number, v: number, w: number, h: number): Pt[] {
  return [
    [u, v],
    [u + w, v],
    [u + w, v + h],
    [u, v + h],
  ];
}
