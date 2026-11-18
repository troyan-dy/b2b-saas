import type Phaser from 'phaser';
import { PALETTE } from '../data/palette';
import { dashedLine } from './lines';

import { BOX_H, BOX_W, corners, facePoint, type Pt, type Stroke } from './geometry';
export { BOX_H, BOX_W, CELL_H, CELL_W, cellCenter, FACE_SKEW, facePoint, leftFace, rect, ring, type Pt, type Stroke } from './geometry';

function path(g: Phaser.GameObjects.Graphics, pts: readonly Pt[], closed: boolean): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
  if (closed) g.closePath();
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

/** Logos of big clients on a module: small bright squares in a row under the top edge of its right side. */
export function drawLogos(g: Phaser.GameObjects.Graphics, cx: number, cy: number, height: number, count: number): void {
  const colors = [PALETTE.blue, PALETTE.coral, PALETTE.sage, PALETTE.sand];
  g.lineStyle(1.5, PALETTE.ink, 1);
  for (let k = 0; k < count; k++) {
    // the right side runs from the south corner up to the east one
    const f = 0.14 + k * 0.2;
    const x = cx + (f * BOX_W) / 2;
    const y = cy + BOX_H / 2 - (f * BOX_H) / 2 - height + 5;
    g.fillStyle(colors[k % colors.length], 1);
    path(g, [[x, y], [x + 13, y - 6.5], [x + 13, y + 6.5], [x, y + 13]], true);
    g.fillPath();
    g.strokePath();
  }
}
