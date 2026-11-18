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

export function corners(cx: number, cy: number, height: number): { n: Pt; e: Pt; s: Pt; w: Pt; e0: Pt; s0: Pt; w0: Pt } {
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

/** a connector with one right-angle turn: out along x, then along y */
export function elbow(a: Pt, b: Pt): Pt[] {
  return [a, [b[0], a[1]], b];
}
