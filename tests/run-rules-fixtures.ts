import {
  createRun,
  IDEAS,
  refreshRun,
  step,
  TUNING,
  type Block,
  type Client,
  type Run,
} from '../src/systems/run/run';

export function startup(perks: string[] = [], seed = 7): Run {
  return createRun(seed, { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] }, perks);
}

export function shipped(kind: string, overrides: Partial<Block> = {}): Block {
  return {
    kind,
    i: 0,
    j: 0,
    done: 4,
    need: 4,
    built: true,
    live: true,
    level: 1,
    up: false,
    hand: false,
    ...overrides,
  };
}

export function product(run: Run, kinds: string[]): void {
  run.blocks = kinds.map((kind, i) => shipped(kind, { i }));
  refreshRun(run);
}

export function client(id: number, overrides: Partial<Client> = {}): Client {
  return {
    id,
    name: 'Client ' + id,
    texture: 'shop',
    type: 'small',
    pay: 100,
    want: 'bot',
    wantLevel: 1,
    patience: 5,
    happy: false,
    slot: id - 1,
    deal: 1,
    promised: false,
    ...overrides,
  };
}

// Start at the release boundary; a zero-length step runs the real settlement without unrelated agent work.
export function release(run: Run, sprint: number): void {
  run.sprint = sprint;
  run.sprintT = TUNING.sprint_s;
  run.draft = null;
  step(run, 0);
}
