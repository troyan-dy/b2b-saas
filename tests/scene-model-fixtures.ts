import { createRun, IDEAS, type Block, type Client, type ClientType } from '../src/systems/run/run';

export function company() {
  return createRun(12, { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] });
}

export function moduleAt(kind: string, i: number, live = true): Block {
  return { kind, i, j: 0, built: live, done: live ? 4 : 0, need: 4, level: 1, live, up: false, hand: false };
}

export function contract(id: number, type: ClientType): Client {
  return {
    id, type, texture: `building-${id}`, name: `Contract ${id}`, pay: 100, want: 'core',
    wantLevel: 1, patience: 2, slot: id - 1, deal: 1, happy: true, promised: false,
  };
}
