import type { Pt } from '../view/iso';

/**
 * Where things stand on the sheet. Sheet coordinates: cell (0, 0) of the product is the origin;
 * pictures are anchored at their bottom centre. The camera (STAGE_VIEW) decides how much of it is seen.
 */

/** the founder's desk: bottom-left of the product */
export const DESK: Pt = [-540, 250];

/** laptops of the agents, in the order they are hired: a row under the product */
export const AGENT_SLOTS: readonly Pt[] = [
  [-400, 470],
  [-235, 470],
  [-70, 470],
  [95, 470],
  [260, 470],
  [425, 470],
];

/** connectors of the agents run along horizontal lines under the product, one line each, BUS_GAP px apart */
export const BUS_Y = 304;
export const BUS_GAP = 7;

/** the trunk to the clients: a vertical line to the right of the product */
export const TRUNK_X = 640;

/** where promotion and interviews go: the foot of the trunk */
export const MARKET: Pt = [TRUNK_X, 286];

/** buildings of the clients: three columns to the right of the trunk, filled top to bottom */
export const CLIENT_SLOTS: readonly Pt[] = [
  [770, -230],
  [770, -40],
  [770, 150],
  [770, 340],
  [960, -230],
  [960, -40],
  [960, 150],
  [960, 340],
  [1150, -230],
  [1150, -40],
  [1150, 150],
  [1150, 340],
];

/** the screen point the camera keeps the centre of its view under: the middle of the play area, below the money */
export const VIEW_AT: Pt = [670, 640];

/** what the camera shows at each stage: the sheet point under VIEW_AT and the zoom */
export const STAGE_VIEW: readonly { x: number; y: number; zoom: number }[] = [
  { x: -80, y: 150, zoom: 1 },
  { x: 115, y: 105, zoom: 0.84 },
  { x: 305, y: 85, zoom: 0.68 },
];

/** where the money counter is on the screen: squares of subscriptions fly into it */
export const MONEY_RECT = { x: 560, y: 60, w: 220, h: 90 };
