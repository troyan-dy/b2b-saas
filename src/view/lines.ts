import type Phaser from 'phaser';

/** A dashed straight line: the outline of something that is not built yet. */
export function dashedLine(
  g: Phaser.GameObjects.Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dash: number,
  gap: number,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len === 0) return;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(d + dash, len);
    g.lineBetween(x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e);
  }
}

export function dashedRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  dash: number,
  gap: number,
): void {
  dashedLine(g, x, y, x + w, y, dash, gap);
  dashedLine(g, x + w, y, x + w, y + h, dash, gap);
  dashedLine(g, x + w, y + h, x, y + h, dash, gap);
  dashedLine(g, x, y + h, x, y, dash, gap);
}
