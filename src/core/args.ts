export interface Args {
  seed: number;
  gym: string;
  state: string;
  debug: boolean;
  capture: boolean;
  /** keep the game between visits */
  save: boolean;
  /** show the title card even in a gym or a capture */
  menu: boolean;
  /** a bot plays instead of the player: scripted playtests */
  bot: boolean;
  /** simulated seconds per real second */
  speed: number;
  /** switches of the gyms: ?flags=nocalls — the bot leaves the phone to the player */
  flags: string[];
}

/** Launch arguments from the URL: ?seed=7&gym=build&state=clients&debug=1&bot=1&speed=6 */
export function readArgs(search: string): Args {
  // the release reads nothing from the address: no gyms, no quick starts
  if (!__TOOLS__) return { seed: Date.now() >>> 0, gym: '', state: '', debug: false, capture: false, save: false, menu: false, bot: false, speed: 1, flags: [] };
  const p = new URLSearchParams(search);
  const seed = Number(p.get('seed'));
  const speed = Number(p.get('speed'));
  return {
    seed: Number.isFinite(seed) && p.has('seed') ? seed : Date.now() >>> 0,
    gym: p.get('gym') ?? '',
    state: p.get('state') ?? '',
    debug: p.get('debug') === '1',
    capture: p.get('capture') === '1',
    save: p.get('save') === '1',
    menu: p.get('menu') === '1',
    bot: p.get('bot') === '1',
    speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
    flags: (p.get('flags') ?? '').split(',').filter(Boolean),
  };
}