import { expect, it, vi } from 'vitest';
import { emptyMeta } from '../src/systems/meta/meta';
import type { DraftCard } from '../src/systems/run/draft';
import { TUNING } from '../src/systems/run/run';
import { playerCollectionView } from '../src/ui/player-collection-view';
import { sprintCardsView } from '../src/ui/sprint-cards-view';
import { productEffects, workbenchView } from '../src/ui/workbench-view';
import { newRun, selection } from './ui-rules-fixtures';

// Content is expanded independently of the UI. Model new entries without changing the shipped catalogs.
vi.mock(import('../src/data/balance/ideas.json'), async (original) => {
  const { default: ideas } = await original();
  return {
    default: {
      ...ideas,
      tech: [...ideas.tech, { ...ideas.tech[0], id: 'mod-tech', does: '' }],
      form: [...ideas.form, { ...ideas.form[0], id: 'mod-form', does: '' }],
    },
  };
});
vi.mock(import('../src/data/balance/lessons.json'), async (original) => {
  const { default: lessons } = await original();
  return { default: [...lessons, { ...lessons[0], id: 'mod-lesson' }] };
});
vi.mock('../src/data/balance/draft.json', async (original) => {
  const { default: cards } = await original<{ default: DraftCard[] }>();
  const oneOff = cards.find((c) => c.slot === 'operation')!;
  return {
    default: [
      ...cards.filter((c) => c.id !== 'mass'),
      { ...oneOff, id: 'mod-card', requires: ['mod-block'] },
    ],
  };
});
vi.mock(import('../src/data/balance/effects.json'), async (original) => {
  const { default: effects } = await original();
  return { default: { ...effects, 'mod-block': { reputation: 1.5 } } };
});

it('supplies readable names, no-modifier copy and fallback art for new catalog entries', () => {
  const run = newRun();
  const [, lessons, pitches, sprint] = playerCollectionView(emptyMeta(), run).sections;
  expect(lessons.cards.find((c) => c.id === 'mod-lesson')?.art).toBe('desk');
  for (const id of ['tech:mod-tech', 'form:mod-form']) {
    expect(pitches.cards.find((c) => c.id === id)).toMatchObject({
      art: 'laptop',
      effect: 'Без модификаторов',
    });
  }
  expect(sprint.cards.find((c) => c.id === 'mod-card')?.unlock).toContain('mod-block');
  expect(sprintCardsView(run).cards.find((c) => c.id === 'mod-card')).toMatchObject({
    art: 'laptop',
    statusLabel: 'Нужен mod-block',
  });
  expect(productEffects('mod-block', 1)).toBe('reputation ×1,5');
});

it('skips a removed strategy card when displaying perks from an older save', () => {
  const run = newRun();
  run.cardStacks.mass = 3;
  expect(workbenchView(run, selection).perks).toEqual([]);
});

it('keeps a finite hosting quote even under a zero-living-cost balance', () => {
  const former = TUNING.living_per_s;
  try {
    TUNING.living_per_s = 0;
    const core = workbenchView(newRun(), selection).modules.find((m) => m.id === 'core')!;
    expect(core.nextHosting).toBe(0.75);
  } finally {
    TUNING.living_per_s = former;
  }
});
