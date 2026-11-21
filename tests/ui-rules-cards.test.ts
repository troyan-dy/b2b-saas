import { describe, expect, it, vi } from 'vitest';
import { emptyMeta, TRAITS, LESSONS } from '../src/systems/meta/meta';
import { DRAFT_CARDS } from '../src/systems/run/draft';
import { playerCollectionSummary, playerCollectionView } from '../src/ui/player-collection-view';
import { sprintCardsView, cardChangeText } from '../src/ui/sprint-cards-view';
import { dec, money, multiplier, plural, rate, whole } from '../src/ui/format';
import { client, newRun, report, task } from './ui-rules-fixtures';

describe('display numbers', () => {
  it('uses Russian precision, a typographic minus and the correct plural for teens', () => {
    expect(dec(1.2)).toBe('1,2');
    expect(multiplier(1.336)).toBe('×1,34');
    expect(whole(12500.6)).toBe('12\u00a0501');
    expect([money(-0.4), money(-300), rate(-19.86), rate(20.5)]).toEqual([
      '$0',
      '−$300',
      '−$19,9',
      '$21',
    ]);
    const forms = ['один', 'несколько', 'много'] as const;
    expect([1, -2.4, 5, 11, 12, 14, 21, 24, 112, 124].map((n) => plural(n, forms))).toEqual([
      'один',
      'несколько',
      'много',
      'много',
      'много',
      'много',
      'один',
      'несколько',
      'много',
      'несколько',
    ]);
  });
  it('uses English decimal points and only the rounded absolute one is singular', async () => {
    vi.stubGlobal('window', { location: { search: '?lang=en' } });
    vi.resetModules();
    try {
      const english = await import('../src/ui/format');
      expect(english.dec(2.25)).toBe('2.25');
      expect(english.plural(-1, ['one', 'two', 'many'])).toBe('one');
      expect(english.plural(2, ['one', 'two', 'many'])).toBe('many');
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});

describe('sprint card decisions', () => {
  it('distinguishes pending projects, requirements, grants and a repeatable operation', () => {
    const run = newRun();
    run.tasks.push(task('m', { kind: 'card', card: 'mass', block: undefined }));
    run.claimedGrants = ['credits'];
    const view = sprintCardsView(run);
    const status = Object.fromEntries(view.cards.map((card) => [card.id, card.status]));
    expect(status).toMatchObject({
      mass: 'queued',
      premium: 'locked',
      credits: 'claimed',
      consulting: 'available',
      leads: 'available',
    });
    expect(view.draft).toBeNull();
    expect(view.cards.find((c) => c.id === 'premium')!.statusLabel).toBe('Требуется: Обёртка Клода');
    expect(view.cards.find((c) => c.id === 'credits')!.duration).toContain('один раз');
  });
  it('compares one additional copy, describes capped operations and removes unknown draft ids', () => {
    const run = newRun();
    run.live.add('core');
    run.cardStacks.mass = 2;
    run.draft = [...DRAFT_CARDS.map((card) => card.id), 'retired'];
    const first = sprintCardsView(run);
    const cards = first.draft!.cards;
    expect(cards).toHaveLength(DRAFT_CARDS.length);
    expect(cards.find((c) => c.id === 'mass')).toMatchObject({
      status: 'active',
      level: 2,
      nextLevel: 3,
      impact: '×1,44 → ×1,73 вместимость',
    });
    expect(cards.find((c) => c.id === 'maintenance')).toMatchObject({
      impact: 'Техдолг 0 → 0',
      benefits: undefined,
    });
    run.debt = 9;
    run.energy = 0;
    const second = sprintCardsView(run).draft!;
    expect(second.cards.find((c) => c.id === 'maintenance')!.impact).toContain('9 →');
    expect(second.cards.find((c) => c.id === 'rest')!.impact).toContain('Силы 0 →');
    expect(second.cards.find((c) => c.id === 'instant')!.penalties![0]).toContain('Токены:');
    expect(second.cards.find((c) => c.id === 'batch')!.benefits).toBeUndefined();
    expect(cardChangeText({ kind: 'debt', before: 3.44, after: 1.25 })).toBe('Техдолг 3,4 → 1,3');
  });
  it('separates founder bonuses and active news, and describes applied cards without duplicate token penalties', () => {
    const run = newRun();
    run.perks = [LESSONS[0].id];
    run.traits = { [TRAITS[0].id]: 1 };
    run.mods = [
      { kind: 'price', mult: 1.2, left: 2, tag: 'Премия' },
      { kind: 'promo', mult: 1.1, left: 1, tag: 'Промо' },
      { kind: 'tokens', mult: 2, left: 1, tag: 'Токены' },
      { kind: 'price', mult: 0.9, left: 0, tag: 'Скидка' },
    ];
    run.cardStacks = { instant: 2, batch: 1, mass: 2 };
    const view = sprintCardsView(run);
    expect(view.founder.map((c) => c.id)).toEqual([
      'lesson:' + LESSONS[0].id,
      'trait:' + TRAITS[0].id,
    ]);
    expect(view.events.map((c) => c.art)).toEqual(['bank', 'mall', 'rack']);
    for (const id of ['batch', 'instant', 'mass']) {
      const title = view.cards.find((c) => c.id === id)!.title;
      const applied = sprintCardsView(run, null, { title, impact: 'Реальный эффект' }).applied!;
      expect(applied.impact).toContain('Уровень');
      if (id === 'mass') expect(applied.impact).toContain('вместимость');
      else expect(applied.impact).toContain('Реальный эффект');
      if (id === 'instant') expect(applied.impact).not.toContain('стоимость токенов');
    }
    expect(
      sprintCardsView(run, null, { title: 'Старое событие', impact: '$100' }).applied?.impact,
    ).toBe('$100');
  });
  it('reports both promise outcomes, the first release with revenue and the next pending decision in priority order', () => {
    const run = newRun();
    run.draft = ['rest'];
    run.lastReport = report({
      firstSubscriptions: true,
      promises: [
        { name: 'Макс', block: 'bot', level: 1 },
        { name: 'Ира', block: 'старый модуль', level: 2, refund: 200 },
      ],
    });
    run.call = client();
    run.offer = 100;
    run.dilemma = { id: 'choice', client: 1, name: 'Ира' };
    const draft = () => sprintCardsView(run, { title: 'Рынок', text: 'Рост' }).draft!;
    expect(draft().promises).toEqual([
      expect.stringContaining('Обещание выполнено'),
      expect.stringContaining('Возврат $200'),
    ]);
    expect(draft().firstSubscriptions).toContain('Первый релиз с выручкой: $10/с');
    expect(draft().summary).toContain('звонок: Вектор');
    run.call = null;
    expect(draft().summary).toContain('предложение покупателя');
    run.offer = null;
    expect(draft().summary).toContain('решение: Ира');
    run.dilemma.name = '';
    expect(draft().summary).toContain('новое предложение');
    run.dilemma = null;
    run.lastReport = report();
    expect(draft().summary).toBe('Релиз 4 · пришло 4 · ушло 2');
    expect(draft().firstSubscriptions).toBeUndefined();
  });
});

describe('persistent collection', () => {
  it('separates permanent trait progress and unlocks from temporary run upgrades', () => {
    const meta = emptyMeta();
    const fresh = playerCollectionView(meta);
    expect(fresh.sections.map((s) => s.id)).toEqual(['traits', 'lessons', 'pitch', 'sprint']);
    expect(fresh.sections[2].cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'form:tracker',
          status: 'locked',
          progress: { value: 0, max: 2, label: 'Стартапы 0/2' },
        }),
      ]),
    );
    meta.traits = { [TRAITS[0].id]: 1, [TRAITS[1].id]: TRAITS[1].max };
    meta.lessons = [LESSONS[0].id];
    const run = newRun();
    run.cardStacks.instant = 2;
    run.claimedGrants.push('credits');
    const [traits, lessons, , sprint] = playerCollectionView(meta, run).sections;
    expect(playerCollectionSummary(meta)).toContain('черты 2/');
    expect(traits.cards[0].next).toContain('Следующий уровень');
    expect(traits.cards[1]).toMatchObject({
      statusLabel: 'Максимум',
      unlock: undefined,
      next: undefined,
    });
    expect(lessons.cards.find((c) => c.id === LESSONS[0].id)?.status).toBe('owned');
    expect(sprint.cards.find((c) => c.id === 'credits')?.status).toBe('owned');
    expect(sprint.cards.find((c) => c.id === 'mass')?.status).toBe('locked');
    expect(sprint.cards.find((c) => c.id === 'instant')?.penalty).toContain('хостинг');
    expect(sprint.cards.find((c) => c.id === 'rest')?.status).toBe('available');
    expect(sprint.summary).toContain('спринт 1');
  });
});
