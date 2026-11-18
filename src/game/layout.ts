import type { Pt } from '../view/iso';

/**
 * Where things stand on the sheet. Sheet coordinates: cell (0, 0) of the product is the origin;
 * pictures are anchored at their bottom centre. The camera (STAGE_VIEW) decides how much of it is seen.
 */

/** the founder's desk: bottom-left of the product, clear of its widest sheet */
export const DESK: Pt = [-540, 330];
export const INFRASTRUCTURE: Pt = [-485, 35];

/** laptops of the agents, in the order they are hired: a row under the product */
export const AGENT_SLOTS: readonly Pt[] = [
  [-400, 400],
  [-235, 400],
  [-70, 400],
  [95, 400],
  [260, 400],
  [425, 400],
  [-400, 660],
  [-235, 660],
  [-70, 660],
  [95, 660],
  [260, 660],
  [425, 660],
];

/** Connectors stay above the laptops; the lower row goes around the upper row and its captions. */
export const BUS_Y = 250;
export const BUS_GAP = 7;

export function agentRoute(slot: number, target: Pt): Pt[] {
  const [x, y] = AGENT_SLOTS[slot];
  const bus = BUS_Y - slot * BUS_GAP;
  const points: Pt[] = [[x, y - 122]];
  if (slot >= AGENT_SLOTS.length / 2) {
    const column = slot - AGENT_SLOTS.length / 2;
    const rowBus = y - 140 - column * BUS_GAP;
    const outside = AGENT_SLOTS[5][0] + 100 + column * BUS_GAP;
    points.push([x, rowBus], [outside, rowBus], [outside, bus]);
  } else points.push([x, bus]);
  // Projects at the founder's desk approach from its right, clear of his chair.
  if (target[0] < DESK[0] + 118) {
    const approach = DESK[0] + 160;
    points.push([approach, bus], [approach, target[1]], target);
  } else points.push([target[0], bus], target);
  return points;
}

/** the trunk to the clients: a vertical line to the right of the product */
export const TRUNK_X = 640;

/** where promotion and interviews go: the foot of the trunk */
export const MARKET: Pt = [TRUNK_X, 286];

/** buildings of the clients: three columns to the right of the trunk, filled top to bottom */
export const CLIENT_SLOTS: readonly Pt[] = [
  [760, -230],
  [760, -40],
  [760, 150],
  [760, 340],
  [985, -230],
  [985, -40],
  [985, 150],
  [985, 340],
  [1210, -230],
  [1210, -40],
  [1210, 150],
  [1210, 340],
];

/** the screen point the camera keeps the centre of its view under: the middle of the play area, below the money */
export const VIEW_AT: Pt = [670, 640];

/** what the camera shows at each stage: the sheet point under VIEW_AT and the zoom */
export const STAGE_VIEW: readonly { x: number; y: number; zoom: number }[] = [
  { x: -90, y: 148, zoom: 1 },
  { x: 80, y: 110, zoom: 0.84 },
  { x: 310, y: 90, zoom: 0.665 },
];

/** where the money counter is on the screen: squares of subscriptions fly into it */
export const MONEY_RECT = { x: 560, y: 60, w: 220, h: 90 };

export interface ScreenArea { x: number; y: number; height: number }
export interface Obstacle { left: number; right: number; top: number; bottom: number }

/** Keep controls clear of buildings. A manually panned map keeps its previous anchor. */
export function workArea(areas: Obstacle[], previous: ScreenArea | null, mapMoved: boolean): ScreenArea | undefined {
  if (mapMoved && previous) return previous;
  const fits = ({ x, y, height }: ScreenArea): boolean => areas.every(area => x + 138 < area.left || x - 138 > area.right || y + height < area.top || y > area.bottom);
  const anchors = [...(previous ? [previous] : []), { x: 160, y: 310, height: 180 }, { x: 1180, y: 350, height: 180 }, { x: 1180, y: 810, height: 180 }];
  const free = anchors.find(fits);
  if (free) return free;
  // A full city can occupy all three anchors. Use its remaining vertical gap and scroll the rows.
  const gaps: { x: number; y: number; height: number }[] = [];
  for (const x of [160, 1180]) {
    let top = 290;
    const obstacles = areas.filter(area => x + 138 >= area.left && x - 138 <= area.right).sort((a, b) => a.top - b.top);
    for (const area of [...obstacles, { top: 1010, bottom: 1010 }]) {
      const height = Math.min(180, area.top - 10 - top);
      if (height >= 110) gaps.push({ x, y: top, height });
      top = Math.max(top, area.bottom + 10);
    }
  }
  return gaps.sort((a, b) => b.height - a.height)[0];
}
