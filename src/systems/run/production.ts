import tuning from '../../data/balance/run.json';
import { PRODUCTION } from './product';
import type { Run } from './run';

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
  const slow = 1 - Math.min(tuning.debt.slow_max, run.debt * tuning.debt.slow_per_point);
  const review = run.review === 'build' ? tuning.review_boost : 1;
  return run.agents
    .filter((agent) => agent.lane === 'build')
    .reduce(
      (sum, agent) =>
        sum +
        Math.floor(
          tuning.tiers[agent.tier].work_per_s * slow * review * seconds +
            (withCarry ? agent.carry : 0),
        ),
      0,
    );
}

export function buildCapacity(run: Run): number {
  return buildWork(run, tuning.sprint_s, false);
}

export function remainingBuildCapacity(run: Run): number {
  return buildWork(run, Math.max(0, tuning.sprint_s - run.sprintT), true);
}
