import { freeCells, handy, shelf, type Run } from '../systems/run/run';

const BLOCKS = ['core', 'landing', 'pay'] as const;
export const GUIDE_STEPS = [...BLOCKS, 'core-cell', 'landing-cell', 'pay-cell', 'code', 'release', 'subscribed'] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

export interface StartupGuide {
  dismissed: GuideStep[];
  picked?: string;
  coded?: true;
  /** First paying contract or release, before a later draft choice changes the rates ($/s). */
  subscription?: { income: number; net: number };
}

export function isGuideBlock(id: unknown): id is (typeof BLOCKS)[number] {
  return BLOCKS.some(kind => kind === id);
}

export function startGuide(run: Run): void {
  run.guide ??= { dismissed: [] };
}

export function stopGuide(run: Run): void {
  delete run.guide;
}

export function dismissGuideStep(run: Run, step: GuideStep): void {
  if (!run.guide) return;
  if (step === 'subscribed') stopGuide(run);
  else if (!run.guide.dismissed.includes(step)) run.guide.dismissed.push(step);
}

export function guideStep(run: Run, picked: string | null): GuideStep | null {
  const guide = run.guide;
  if (!guide || run.over || run.dilemma || run.offer !== null || run.lastChance !== null) return null;
  // A draft hides incoming calls; once it closes the caller has the player's attention.
  if (run.call && !run.draft) return null;
  if (guide.subscription) return 'subscribed';
  const tip = (step: GuideStep): GuideStep | null => guide.dismissed.includes(step) ? null : step;
  if (run.draft) return tip('release');

  if (picked !== null) {
    if (!isGuideBlock(picked) || !shelf(run).includes(picked) || freeCells(run).length === 0) return null;
    return tip(`${picked}-cell`);
  }
  const core = run.blocks.find(block => block.kind === 'core');
  if (core && !core.built && !guide.coded) {
    // Acknowledging the tip lets the agent finish; actual manual work advances immediately.
    return run.energy >= 1 && handy(run, 'build') && run.agents.some(agent => agent.lane === 'build')
      ? tip('code') : null;
  }
  const missing = BLOCKS.find(kind => !run.blocks.some(block => block.kind === kind));
  return missing && freeCells(run).length > 0 ? tip(missing) : null;
}
