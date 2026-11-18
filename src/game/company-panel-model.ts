import { TRAITS, type Meta } from '../systems/meta/meta';
import { activeWork, agentSlots, logos, officeQuote, RULES, TUNING, type Run } from '../systems/run/run';
import type { BlockOnSheet } from '../view/board';

export function blocksOnSheet(run: Run, landedWork: ReadonlyMap<string, number>): BlockOnSheet[] {
  let debt = Math.floor(run.debt);
  return run.blocks.map(b => {
    const landed = Math.min(landedWork.get(b.kind) ?? 0, b.need);
    const built = b.live || (b.built && landed >= b.need);
    // Attach up to fifteen debt squares to each completed module, oldest first.
    const visibleDebt = built && debt > 0 ? Math.min(15, debt) : 0;
    debt -= visibleDebt;
    return {
      kind: b.kind, i: b.i, j: b.j, built, up: b.live && b.up,
      done: landed, need: b.need, debt: visibleDebt, logos: b.kind === 'landing' ? logos(run) : 0,
    };
  });
}

export function demolitionTargets(run: Run, selected: string) {
  return run.blocks.filter(b => b.live && !b.up && !run.tasks.some(task => task.block === b.kind)
    && RULES[b.kind].role !== 'base' && (selected === '*' || b.kind === selected));
}

export function currentSite(run: Run) {
  const next = run.tasks.find(task => task.status === 'queued');
  const task = activeWork(run) ?? (next && run.money >= next.cost ? next : undefined);
  return task?.block ? run.blocks.find(block => block.kind === task.block) : undefined;
}

export function outstandingPromises(run: Run) {
  return run.clients.filter(client => client.promised && !client.happy)
    .sort((a, b) => a.patience - b.patience)
    .map(client => ({ client, deadline: Math.min(TUNING.last_sprint, run.sprint + client.patience - 1) }));
}

export function deskOffer(run: Run) {
  const price = officeQuote(run, 'desks');
  return { price, slots: agentSlots(run), disabled: price === null || run.money < price };
}

export function grownTraits(meta: Meta) {
  return TRAITS.filter(trait => (meta.traits[trait.id] ?? 0) > 0);
}

export function startingRunwayMinutes(): number {
  const burn = TUNING.living_per_s + TUNING.tiers.fast.cost_per_s;
  return Math.round(TUNING.start_money / burn / 60 * 10) / 10;
}

/** Whole minutes and seconds of savings left at the current net rate. */
export function cashRunway(cash: number, netPerSecond: number): string | null {
  if (netPerSecond >= 0) return null;
  const seconds = cash / -netPerSecond;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
