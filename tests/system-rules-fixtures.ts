import { IDEAS, createRun } from '../src/systems/run/run';

export function company(perks: string[] = ['template']) {
  return createRun(71, { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] }, perks);
}
