import api from '../../data/balance/api.json';
import tuning from '../../data/balance/run.json';
import { PRODUCTION, upgradeWork } from './product';
import { RULES, workNeed, type Block, type Run } from './run';
import { agentWorkRate } from './workforce';

export type TaskStatus = 'queued' | 'active' | 'ready' | 'backlog';
export interface WorkTask {
  id: string;
  kind: 'build' | 'upgrade' | 'card' | 'infrastructure';
  block?: string;
  card?: string;
  level?: number;
  work: number;
  done: number;
  cost: number;
  status: TaskStatus;
  apiBoost?: boolean;
}

export interface ApiWorkQuote {
  cost: number;
  fee: number;
  unpaidCost: number;
  remainingWork: number;
  affordable: boolean;
  builder: boolean;
}

export function apiWorkQuote(run: Run, id: string): ApiWorkQuote | null {
  if (
    run.over ||
    run.draft ||
    run.lastChance !== null ||
    !Number.isFinite(run.money) ||
    run.sprint > tuning.last_sprint ||
    (run.sprint === tuning.last_sprint && run.sprintT >= tuning.sprint_s)
  )
    return null;
  const task = run.tasks.find((entry) => entry.id === id);
  if (
    !task ||
    task.kind === 'card' ||
    !['build', 'upgrade', 'infrastructure'].includes(task.kind) ||
    !['queued', 'active'].includes(task.status) ||
    task.apiBoost ||
    ![task.work, task.done, task.cost].every(Number.isFinite) ||
    task.work <= 0 ||
    task.done < 0 ||
    task.done >= task.work ||
    task.cost < 0
  )
    return null;
  if (task.kind === 'infrastructure') {
    if (!Number.isSafeInteger(run.infrastructure) || run.infrastructure < 0) return null;
  } else {
    const block = run.blocks.find((entry) => entry.kind === task.block);
    if (
      !block ||
      !RULES[block.kind] ||
      !Number.isSafeInteger(block.level) ||
      block.level < 1 ||
      (task.kind === 'build' && block.live) ||
      (task.kind === 'upgrade' &&
        (!block.live ||
          block.level >= PRODUCTION.max_level ||
          (task.level !== undefined && task.level !== block.level + 1)))
    )
      return null;
  }
  const remainingWork = task.work - task.done;
  const unpaidCost = task.status === 'queued' || task.status === 'backlog' ? task.cost : 0;
  const fee = Math.ceil((api.minimum_fee + remainingWork * api.cost_per_work) * (1 + api.level_growth * ((task.level ?? run.infrastructure + 1) - 1)));
  const cost = fee;
  const builder = run.agents.some((agent) => agent.lane === 'build');
  if (!Number.isSafeInteger(cost)) return null;
  return { cost, fee, unpaidCost, remainingWork, builder, affordable: builder && run.money >= cost + unpaidCost };
}

/** Extra compute speeds up builders; it never supplies work or ships the task. */
export function rushTask(run: Run, id: string): boolean {
  const quote = apiWorkQuote(run, id);
  if (!quote?.affordable) return false;
  const task = run.tasks.find((entry) => entry.id === id)!;
  run.money -= quote.cost;
  run.stats.tokens += quote.fee;
  task.apiBoost = true;
  return true;
}

/** Apply a completed building or upgrade at the scheduled release. */
export function shipBlock(run: Run, block: Block): boolean {
  if (block.built && !block.live) {
    block.live = true;
    run.stats.shipped++;
  } else if (block.up && block.done >= block.need) {
    block.up = false;
    block.level++;
    run.stats.reworks++;
  } else return false;
  run.events.push({ type: 'live', kind: block.kind });
  return true;
}

export function queueView(run: Run): WorkTask[] {
  return run.tasks.map((task) => ({ ...task }));
}

export function activeWork(run: Run): WorkTask | undefined {
  return run.tasks.find((task) => task.status === 'active');
}

export function plannedWork(run: Run, kind: string): boolean {
  return run.tasks.some((task) => task.block === kind);
}

export function hasWork(run: Run): boolean {
  if (activeWork(run)) return true;
  const next = run.tasks.find((task) => task.status === 'queued');
  return next !== undefined && run.money >= next.cost;
}

export function enqueueTask(run: Run, task: Omit<WorkTask, 'id' | 'done' | 'status'>): WorkTask {
  const queued: WorkTask = { ...task, id: `task-${run.nextTask++}`, done: 0, status: 'queued' };
  run.tasks.push(queued);
  return queued;
}

export function moveTask(run: Run, id: string, delta: number): boolean {
  if (run.over || run.draft || !Number.isFinite(delta) || delta === 0) return false;
  const queue = run.tasks.filter((task) => task.status === 'queued');
  const index = queue.findIndex((task) => task.id === id);
  const target = index + Math.sign(delta);
  if (index < 0 || target < 0 || target >= queue.length) return false;
  const a = run.tasks.indexOf(queue[index]),
    b = run.tasks.indexOf(queue[target]);
  [run.tasks[a], run.tasks[b]] = [run.tasks[b], run.tasks[a]];
  return true;
}

export function deferTask(run: Run, id: string): boolean {
  if (run.over || run.draft) return false;
  const task = run.tasks.find((entry) => entry.id === id);
  if (!task || task.status !== 'queued') return false;
  task.status = 'backlog';
  syncProduction(run);
  return true;
}

export function resumeTask(run: Run, id: string): boolean {
  if (run.over || run.draft) return false;
  const index = run.tasks.findIndex((task) => task.id === id && task.status === 'backlog');
  if (index < 0) return false;
  const [task] = run.tasks.splice(index, 1);
  task.status = 'queued';
  run.tasks.push(task);
  syncProduction(run);
  return true;
}

/** Spent work and money stay spent. Only the unfinished change is removed. */
export function cancelTask(run: Run, id: string): boolean {
  if (run.over || run.draft) return false;
  const task = run.tasks.find((entry) => entry.id === id);
  if (!task) return false;
  run.tasks = run.tasks.filter((entry) => entry !== task);
  if (task.kind === 'build') {
    run.blocks = run.blocks.filter((block) => block.kind !== task.block);
  } else if (task.kind === 'upgrade') {
    const block = run.blocks.find((entry) => entry.kind === task.block);
    if (block?.up) {
      block.up = false;
      block.built = true;
      block.queued = false;
      const base = workNeed(run, block.kind);
      block.need = block.level === 1 ? base : upgradeWork(base, block.level - 1);
      block.done = block.need;
      block.hand = false;
    }
  }
  syncProduction(run);
  run.events.push({ type: 'task-cancelled', id, block: task.block });
  return true;
}

/** A planned block reserves its chosen cell. Only the active order receives work. */
export function syncProduction(run: Run): void {
  for (const task of run.tasks) {
    if (!task.block) continue;
    const block = run.blocks.find((b) => b.kind === task.block);
    if (!block) continue;
    if (task.kind === 'build') block.queued = task.status === 'queued' || task.status === 'backlog';
    if (task.status === 'queued' || task.status === 'backlog') continue;
    block.queued = false;
    block.done = task.done;
    block.need = task.work;
    if (task.kind === 'build') block.built = task.status === 'ready';
    if (task.kind === 'upgrade') block.up = true;
    if (task.status === 'ready') block.built = true;
  }
}

export function startWork(run: Run): WorkTask | undefined {
  if (run.over || run.draft) return undefined;
  const active = activeWork(run);
  if (active) return active;
  const next = run.tasks.find((task) => task.status === 'queued');
  if (!next || run.money < next.cost) return undefined;
  run.money -= next.cost;
  next.status = 'active';
  syncProduction(run);
  return next;
}

export function addProductionWork(run: Run, hand = false): WorkTask | undefined {
  const task = startWork(run);
  if (!task) return undefined;
  task.done = Math.min(task.work, task.done + 1);
  if (task.done >= task.work) task.status = 'ready';
  syncProduction(run);
  const block = task.block ? run.blocks.find((b) => b.kind === task.block) : undefined;
  if (block) {
    block.hand = hand;
    if (task.status === 'ready')
      run.events.push({ type: 'built', kind: block.kind, i: block.i, j: block.j });
  }
  return task;
}

export function takeReleasedTasks(run: Run): WorkTask[] {
  const ready = run.tasks.filter((task) => task.status === 'ready');
  run.tasks = run.tasks.filter((task) => task.status !== 'ready');
  return ready;
}

export function expandInfrastructure(run: Run): boolean {
  if (run.over || run.draft || run.tasks.some((task) => task.kind === 'infrastructure'))
    return false;
  const rule = PRODUCTION.infrastructure;
  enqueueTask(run, {
    kind: 'infrastructure',
    work: rule.work + rule.work_growth * run.infrastructure,
    cost: Math.round(rule.cost * rule.cost_growth ** run.infrastructure),
  });
  return true;
}

function buildWork(run: Run, seconds: number, withCarry: boolean): number {
  return run.agents
    .filter((agent) => agent.lane === 'build')
    .reduce(
      (sum, agent) =>
        sum + Math.floor(agentWorkRate(run, agent) * seconds + (withCarry ? agent.carry : 0)),
      0,
    );
}

export function buildCapacity(run: Run): number {
  return buildWork(run, tuning.sprint_s, false);
}

export function remainingBuildCapacity(run: Run): number {
  return buildWork(run, Math.max(0, tuning.sprint_s - run.sprintT), true);
}
