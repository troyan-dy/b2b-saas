import {
  answerCall,
  answerLastChance,
  burnPerS,
  canHire,
  clientsMax,
  crunch,
  EFFECTS,
  freeCells,
  friendsAt,
  hire,
  netPerS,
  place,
  reworks,
  RULES,
  sellable,
  setLane,
  setReview,
  shelf,
  sites,
  TUNING,
  upgrade,
  type Lane,
  type Run,
} from '../systems/run/run';

export interface BotStyle {
  /** puts blocks next to their friends; otherwise on the first free cell */
  links: boolean;
  /** asks clients what they want; otherwise builds blind */
  research: boolean;
  /** pays down debt before the product falls */
  fix: boolean;
  /** picks up the phone: answers clients and the bank; otherwise the cards wait for the player */
  calls: boolean;
}

export const SENSIBLE: BotStyle = { links: true, research: true, fix: true, calls: true };

/**
 * A stand-in for the player: balance checks and scripted playtests. Called every step; acts like a
 * careful founder who reads the sheet — not an optimal one.
 */
export function playBot(run: Run, style: BotStyle = SENSIBLE): void {
  if (run.over) return;

  // the bank offers a minute of life for the flat: a founder always takes it
  if (!style.calls) {
    if (run.lastChance !== null) return;
  } else if (run.lastChance !== null) answerLastChance(run, true);
  // a client asks about a block that is not there: promise it only when there is room and money to build it
  if (style.calls && run.call) answerCall(run, sites(run).length < TUNING.sites_max && run.money > burnPerS(run) * 90);

  // a client asked to improve a block: the rework goes first, unless something was promised on a call
  const promised = run.clients.some((c) => c.promised && shelf(run).includes(c.want));
  if (sites(run).length === 0 && !promised && reworks(run).length > 0) upgrade(run, reworks(run)[0].kind);

  // what to build next
  if (sites(run).length === 0) {
    const kind = nextBlock(run, style);
    if (kind) {
      const cells = freeCells(run);
      let best = cells[0];
      if (style.links) {
        let score = -1;
        for (const c of cells) {
          const s = friendsAt(run, kind, c.i, c.j);
          if (s > score) {
            score = s;
            best = c;
          }
        }
      }
      if (best) place(run, kind, best.i, best.j);
    }
  }

  // rested and the code is clean enough: finish a square by hand
  if (run.energy >= TUNING.crunch.max && run.debt < 10) crunch(run);

  // who works: hire while the savings last a few more sprints
  const runway = netPerS(run) >= 0 ? Infinity : run.money / -netPerS(run);
  if (run.stage >= 2 && run.agents.length < 2 + run.stage && runway > 280 + 60 * run.agents.length) {
    const tier = run.debt > 14 && canHire(run, 'think') ? 'think' : canHire(run, 'normal') ? 'normal' : 'fast';
    if (run.money > burnPerS(run) * 120) hire(run, tier);
  }

  // what each agent does
  const unknown = [...run.asks, ...(run.stage >= 2 ? run.corpAsks : [])].some((k) => !run.known.includes(k));
  const wanted: Lane[] = ['build'];
  if (sellable(run)) wanted.push('promo');
  if (style.research && unknown && run.clients.length > 0) wanted.push('research');
  if (style.fix && run.debt > 12) wanted.unshift('fix');
  // nothing to build and nothing worth starting: the builder is better used elsewhere
  if (sites(run).length === 0 && nextBlock(run, style) === null) wanted.splice(wanted.indexOf('build'), 1);
  if (wanted.length === 0) wanted.push(sellable(run) ? 'promo' : 'build');
  run.agents.forEach((a, k) => setLane(run, a.id, wanted[k % wanted.length] ?? 'build'));
  if (run.sprintT < 1) setReview(run, 'build');
}

function nextBlock(run: Run, style: BotStyle): string | null {
  const can = shelf(run);
  if (can.length === 0) return null;
  for (const k of ['core', 'landing', 'pay']) if (can.includes(k)) return k;
  // no room for the next client: the cheapest block that adds places
  if (run.clients.length >= clientsMax(run)) {
    const seats = can.filter((k) => EFFECTS[k]?.seats).sort((a, b) => RULES[a].work - RULES[b].work);
    if (seats.length > 0 && run.money > burnPerS(run) * 60) return seats[0];
  }
  // what was promised on a call comes first: a broken promise costs a refund
  for (const c of run.clients) if (c.promised && can.includes(c.want)) return c.want;
  const waited = new Set(run.clients.filter((c) => !c.happy).map((c) => c.want));
  // what the clients are known to wait for
  for (const k of run.known) if (can.includes(k) && (waited.has(k) || RULES[k].role === 'ask')) return k;
  if (!style.research) {
    // blind: whatever is cheapest
    return [...can].sort((a, b) => RULES[a].work - RULES[b].work)[0];
  }
  if (can.includes('cheap') && run.clients.length >= 4) return 'cheap';
  for (const k of run.known) if (can.includes(k)) return k;
  // everything known is built and the startup pays for itself: grow the product, cheapest first
  if (netPerS(run) >= 0 && run.clients.length > 0) return [...can].sort((a, b) => RULES[a].work - RULES[b].work)[0];
  // nothing known yet and money is tight: a careful founder waits for the interviews rather than guesses
  return null;
}
