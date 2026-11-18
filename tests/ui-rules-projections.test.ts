import { expect, it } from 'vitest';
import { money, primary, signed } from '../src/ui/format';
import {
  collectionCards,
  collectionProgress,
  playerCollectionView,
} from '../src/ui/player-collection-view';
import { activeCardCount, albumTitle, sprintCardsView } from '../src/ui/sprint-cards-view';
import {
  catalogModules,
  workbenchView,
  capacityIndicator,
  landShortfall,
  canConfirmPrice,
} from '../src/ui/workbench-view';
import { adjacentIndex, shortcutIndex, tabIndexForKey } from '../src/ui/navigation-view';
import { clientPanelPosition, stageScale, wheelMovement } from '../src/ui/map-geometry-view';
import { emptyMeta } from '../src/systems/meta/meta';
import { newRun, selection } from './ui-rules-fixtures';

it('scales wheel movement from pixel, line and page input and maps Shift to horizontal movement', () => {
  const scale = stageScale(960);
  expect(scale).toBe(0.5);
  expect(wheelMovement(2, -3, 0, false, scale)).toEqual([-4, 6]);
  expect(wheelMovement(2, -3, 1, false, 1)).toEqual([-32, 48]);
  expect(wheelMovement(2, -3, 2, true, 1)).toEqual([1800, -0]);
});

it('keeps the client panel and its pointer inside the map at either edge', () => {
  expect(clientPanelPosition({ x: 600, y: 800 }, 300, 400)).toEqual({
    left: 450,
    top: 380,
    pointer: 150,
  });
  expect(clientPanelPosition({ x: -100, y: 75 }, 300, 400)).toEqual({
    left: 20,
    top: 272,
    pointer: 24,
  });
  expect(clientPanelPosition({ x: 1610, y: 1200 }, 300, 400)).toEqual({
    left: 1020,
    top: 604,
    pointer: 276,
  });
});

it('orders available and recommended modules first, keeping the source order within ties', () => {
  const sample = workbenchView(newRun(), selection).modules[0];
  const modules = [
    { ...sample, id: 'locked', disabled: true, reason: undefined },
    { ...sample, id: 'open', disabled: false, reason: undefined },
    { ...sample, id: 'growth', category: 'growth' as const, disabled: false, reason: undefined },
    {
      ...sample,
      id: 'recommended',
      disabled: false,
      reason: { label: 'Нужен', detail: 'Клиенты', tone: 'demand' as const },
    },
  ];
  expect(catalogModules(modules, 'all').map((m) => m.id)).toEqual([
    'recommended',
    'open',
    'growth',
    'locked',
  ]);
  expect(catalogModules(modules, 'growth').map((m) => m.id)).toEqual(['growth']);
  expect(modules[0].id).toBe('locked');
});

it('filters collection access independently of purchase and clamps progress to the visible range', () => {
  const base = playerCollectionView(emptyMeta()).sections[1].cards[0];
  const cards = [
    base,
    { ...base, status: 'owned' as const },
    { ...base, status: 'available' as const },
  ];
  expect(collectionCards(cards, 'locked')).toEqual([base]);
  expect(collectionCards(cards, 'open')).toEqual(cards.slice(1));
  expect(collectionCards(cards, 'all')).toEqual(cards);
  const p = (value: number, max: number) => collectionProgress({ value, max, label: '' });
  expect([collectionProgress(undefined), p(-1, 4), p(1, 4), p(5, 4), p(3, 0)]).toEqual([
    0, 0, 0.25, 1, 0,
  ]);
});

it('uses deck size for the album title and counts stacked levels and temporary active cards', () => {
  const run = newRun();
  run.cardStacks.mass = 3;
  run.mods.push({ kind: 'promo', mult: 1.1, left: 1, tag: 'Биржа' });
  const view = sprintCardsView(run);
  expect(albumTitle(view.cards.length)).toContain(' · ' + view.cards.length + ' ');
  expect(albumTitle(11)).toBe('Вся коллекция · 11 карт');
  expect([albumTitle(1), albumTitle(2)]).toEqual([
    'Вся коллекция · 1 карта',
    'Вся коллекция · 2 карты',
  ]);
  expect(activeCardCount(view)).toBe(4);
  const oneActive = { ...view.cards[0], status: 'active' as const, level: undefined };
  expect(activeCardCount({ ...view, cards: [oneActive] })).toBe(2);
});

it('navigates keyboard choices and collection tabs at both ends, including a previously unfocused choice', () => {
  expect(
    ['Digit1', 'Numpad3', 'Digit4', 'Digit0', 'KeyX'].map((key) => shortcutIndex(key, 3)),
  ).toEqual([0, 2, -1, -1, -1]);
  expect(adjacentIndex(-1, 4, 1)).toBe(0);
  expect(adjacentIndex(-1, 4, -1)).toBe(3);
  expect(adjacentIndex(0, 0, 1)).toBe(-1);
  expect(
    ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Space'].map((key) => tabIndexForKey(key, 0, 3)),
  ).toEqual([2, 1, 0, 2, -1]);
  expect(tabIndexForKey('ArrowRight', 2, 3)).toBe(0);
  expect(tabIndexForKey('End', 0, 0)).toBe(-1);
});

it('shows overload only above full capacity, and reports a positive shortage even below one dollar', () => {
  expect(capacityIndicator().percent).toBe(0);
  expect(capacityIndicator(-1).state).toBe('spare');
  expect(capacityIndicator(0.799).state).toBe('spare');
  expect(capacityIndicator(0.8).state).toBe('busy');
  expect(capacityIndicator(1).state).toBe('busy');
  expect(capacityIndicator(1.15)).toEqual({
    percent: 115,
    state: 'overloaded',
    stateText: 'Перегруз · клиенты уходят',
  });
  expect([landShortfall(100, 99.9), landShortfall(100, 100), landShortfall(100, 101)]).toEqual([
    1, 0, 0,
  ]);
});

it('allows confirmation only for a changed tariff on an editable segment', () => {
  const segment = {
    ...workbenchView(newRun(), selection).segments[0],
    price: 1,
    previewPrice: 1.1,
  };
  expect(canConfirmPrice(segment, false)).toBe(true);
  expect(canConfirmPrice({ ...segment, previewPrice: 1.0001 }, false)).toBe(false);
  expect(canConfirmPrice({ ...segment, pricePending: true }, false)).toBe(false);
  expect(canConfirmPrice({ ...segment, priceDisabled: true }, false)).toBe(false);
  expect(canConfirmPrice(segment, true)).toBe(false);
});

it('formats signed changes and extracts the principal effect before secondary bonuses', () => {
  expect([-4, 0, 4].map(signed)).toEqual(['−4', '0', '+4']);
  expect(primary('v3: рост · скидка')).toBe('рост');
  expect(primary('Сразу: ' + money(20))).toBe('$20');
  expect(primary('Immediately: save more')).toBe('save more');
  expect(primary('обычный эффект')).toBe('обычный эффект');
});
