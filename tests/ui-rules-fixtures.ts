import {
  createRun,
  IDEAS,
  type Block,
  type Client,
  type Report,
  type Run,
  type WorkTask,
} from '../src/systems/run/run';
import type { WorkbenchSelection } from '../src/ui/workbench-view';

export const selection: WorkbenchSelection = {
  picked: null,
  selectedSegment: 'small',
  previewPrices: {},
};
export const newRun = (): Run =>
  createRun(17, { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] });
export const block = (kind: string, changes: Partial<Block> = {}): Block => ({
  kind,
  i: 0,
  j: 0,
  done: 1,
  need: 1,
  built: true,
  live: true,
  level: 1,
  up: false,
  hand: false,
  ...changes,
});
export const client = (changes: Partial<Client> = {}): Client => ({
  id: 1,
  texture: 'hq',
  name: 'Вектор',
  type: 'small',
  pay: 320,
  want: 'bot',
  wantLevel: 2,
  patience: 3,
  happy: false,
  slot: 0,
  deal: 1,
  promised: false,
  ...changes,
});
export const task = (id: string, changes: Partial<WorkTask> = {}): WorkTask => ({
  id,
  kind: 'build',
  block: 'core',
  work: 20,
  done: 0,
  cost: 0,
  status: 'queued',
  ...changes,
});
export const report = (changes: Partial<Report> = {}): Report => ({
  sprint: 4,
  shipped: [],
  came: 4,
  left: 2,
  closed: 0,
  reasons: [],
  mrr: 320,
  tokens: 1,
  debt: 0,
  down: false,
  ...changes,
});
