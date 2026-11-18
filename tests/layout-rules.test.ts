import { expect, it } from 'vitest';
import { agentRoute, workArea } from '../src/game/layout';
import { cellCenter, corners, elbow, facePoint, leftFace, rect, ring } from '../src/view/geometry';

it('projects adjacent cells and keeps the raised face centred over its footprint', () => {
  expect(cellCenter(10, 20, 1, 0)).toEqual([160, 95]);
  expect(cellCenter(10, 20, 0, 1)).toEqual([-140, 95]);
  const box = corners(20, 90, 30);
  expect(box).toEqual({ n: [20, 12], e: [116, 60], s: [20, 108], w: [-76, 60], e0: [116, 90], s0: [20, 138], w0: [-76, 90] });
  expect(facePoint(20, 60, 1, 0)).toEqual(box.e);
  expect(facePoint(20, 60, 0.5, 0.5)).toEqual([20, 60]);
  expect(leftFace(20, 90, 30)).toEqual([-28, 99]);
});

it('constructs rectangular glyphs, full rings and directed arcs', () => {
  expect(rect(-1, 1, 3, 2)).toEqual([[-1, 1], [2, 1], [2, 3], [-1, 3]]);
  const full = ring(1, 2, 3);
  expect(full).toHaveLength(15);
  expect(full[0]).toEqual([4, 2]);
  expect(full.at(-1)![1]).toBeCloseTo(2);
  const arc = ring(0, 0, 1, 2, Math.PI, 0);
  expect(arc[0][0]).toBe(-1);
  expect(arc[1][1]).toBeCloseTo(1);
  expect(arc[2]).toEqual([1, 0]);
});

it('routes upper desks along the bus and the lower row around occupied seats', () => {
  expect(elbow([0, 2], [8, 9])).toEqual([[0, 2], [8, 2], [8, 9]]);
  expect(agentRoute(0, [200, 80])).toEqual([[-400, 278], [-400, 250], [200, 250], [200, 80]]);
  expect(agentRoute(6, [-540, 330])).toEqual([[-400, 538], [-400, 520], [525, 520], [525, 208], [-380, 208], [-380, 330], [-540, 330]]);
});

it('uses a free anchor, keeps an explicitly panned area and returns no area for a fully obstructed map', () => {
  const previous = { x: 200, y: 400, height: 120 };
  const full = { left: 0, right: 1500, top: 200, bottom: 1020 };
  expect(workArea([], null, true)).toEqual({ x: 160, y: 310, height: 180 });
  expect(workArea([], previous, false)).toEqual(previous);
  expect(workArea([full], previous, true)).toEqual(previous);
  expect(workArea([full], previous, false)).toBeUndefined();
  expect(workArea([{ left: 20, right: 300, top: 320, bottom: 390 }], null, false)).toEqual({ x: 1180, y: 350, height: 180 });
});

it('orders obstacles vertically and selects the tallest gap that can display a control', () => {
  const span = { left: 0, right: 1500 };
  const blocks = [{ ...span, top: 840, bottom: 1005 }, { ...span, top: 280, bottom: 590 }, { ...span, top: 730, bottom: 810 }];
  expect(workArea(blocks, null, false)).toEqual({ x: 160, y: 600, height: 120 });
  expect(workArea([{ ...span, top: 700, bottom: 750 }], null, false)).toEqual({ x: 160, y: 310, height: 180 });
  expect(workArea([{ ...span, top: 100, bottom: 200 }], null, false)).toEqual({ x: 160, y: 310, height: 180 });
});
