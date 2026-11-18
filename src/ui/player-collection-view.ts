import { BLOCK_BY_ID } from '../content/blocks';
import { CARD_ART } from '../content/cards';
import { L } from '../core/lang';
import { collectionLessons, TRAITS, traitGives, type Meta } from '../systems/meta/meta';
import { DRAFT_CARDS } from '../systems/run/draft';
import { ACTIVE_TECHS, IDEAS, TUNING, type Run } from '../systems/run/run';
import type { CollectionCard, CollectionSection, CollectionView } from './player-collection';
import { rate } from './format';
import { SPRINT_CARD_ART, sprintCardsView } from './sprint-cards-view';

const LESSON_ART: Record<string, string> = {
  tests: 'laptop',
  buyers: 'hq',
  word: 'handshake',
  no: 'desk',
  banker: 'bank',
  arch: 'racks',
  name: 'cityblock',
  ear: 'desk_empty',
  cash: 'bank',
  cheapEarly: 'rack',
  posts: 'office',
  template: 'laptop',
};
const LESSON_UNLOCK: Record<string, string> = {
  down: L('Переживи падение продукта.', 'Experience a product outage.'),
  corp: L('Привлеки крупного клиента.', 'Attract an enterprise client.'),
  kept: L('Выполни два обещания клиентам за партию.', 'Keep two client promises in one run.'),
  broken: L(
    'Заверши партию хотя бы с одним сорванным обещанием.',
    'Finish a run with at least one broken promise.',
  ),
  pawn: L(
    'Заложи квартиру и закончи партию без банкротства.',
    'Mortgage your apartment and finish without bankruptcy.',
  ),
  links: L(
    'Собери три рабочие связи между блоками.',
    'Create three active links between buildings.',
  ),
  many: L('Привлеки десять клиентов за партию.', 'Attract ten clients in one run.'),
  sold: L('Продай компанию.', 'Sell a company.'),
  profit: L('Выйди в плюс хотя бы раз за партию.', 'Turn a profit at least once during a run.'),
  broke: L(
    'Закончи партию банкротством или без прибыли к финалу.',
    'Finish bankrupt or without profit by the final release.',
  ),
  any: L('Закончи любую партию.', 'Finish any run.'),
};

export type CollectionFilter = 'all' | 'open' | 'locked';

export function collectionCards(cards: readonly CollectionCard[], filter: CollectionFilter): CollectionCard[] {
  return cards.filter(card => filter === 'all' || (filter === 'locked' ? card.status === 'locked' : card.status !== 'locked'));
}

export function collectionProgress(progress: CollectionCard['progress']): number {
  return progress && progress.max > 0 ? Math.max(0, Math.min(1, progress.value / progress.max)) : 0;
}

export function playerCollectionSummary(meta: Meta): string {
  const traits = TRAITS.filter((trait) => (meta.traits[trait.id] ?? 0) > 0).length;
  const lessons = collectionLessons(meta);
  return L(
    `черты ${traits}/${TRAITS.length} · уроки ${meta.lessons.length}/${lessons.length}`,
    `traits ${traits}/${TRAITS.length} · lessons ${meta.lessons.length}/${lessons.length}`,
  );
}

/** Progress comes from the persistent founder record; a run's temporary boost is never a new level. */
export function playerCollectionView(meta: Meta, saved: Run | null = null): CollectionView {
  const visibleLessons = collectionLessons(meta);
  const levels = TRAITS.reduce((sum, trait) => sum + (meta.traits[trait.id] ?? 0), 0);
  const maxLevels = TRAITS.reduce((sum, trait) => sum + trait.max, 0);
  const traits: CollectionSection = {
    id: 'traits',
    title: L('Черты', 'Traits'),
    summary: L(`Уровни ${levels}/${maxLevels}`, `Levels ${levels}/${maxLevels}`),
    note: L(
      'После партии повысь одну из предложенных черт. Все полученные черты действуют вместе; усиление ×2 на старте временное.',
      'After a run, raise one of the offered traits. All earned traits work together; the starting ×2 boost is temporary.',
    ),
    cards: TRAITS.map((trait) => {
      const level = meta.traits[trait.id] ?? 0;
      return {
        id: trait.id,
        title: trait.title,
        art: trait.art,
        kicker: L('Постоянная черта', 'Permanent trait'),
        description: trait.note,
        effect:
          level > 0
            ? traitGives(trait, level)
            : L('Первый уровень: ', 'First level: ') + traitGives(trait, 1),
        status: level > 0 ? 'owned' : 'locked',
        statusLabel:
          level === trait.max
            ? L('Максимум', 'Maxed out')
            : level > 0
              ? L(`Уровень ${level}`, `Level ${level}`)
              : L('Не получена', 'Not earned'),
        unlock:
          level === trait.max
            ? undefined
            : L(
                'Выбери эту карту среди наград после партии.',
                'Choose this card among the rewards after a run.',
              ),
        next:
          level > 0 && level < trait.max
            ? L('Следующий уровень: ', 'Next level: ') + traitGives(trait, level + 1)
            : undefined,
        progress: {
          value: level,
          max: trait.max,
          label: L(`Уровень ${level} из ${trait.max}`, `Level ${level} of ${trait.max}`),
        },
      };
    }),
  };
  const lessons: CollectionSection = {
    id: 'lessons',
    title: L('Уроки', 'Lessons'),
    summary: L(
      `Получено ${meta.lessons.length}/${visibleLessons.length}`,
      `Earned ${meta.lessons.length}/${visibleLessons.length}`,
    ),
    note: L(
      'Остаются с основателем навсегда. В конце партии выдаётся до двух новых уроков по событиям забега.',
      'Stay with the founder forever. A finished run grants up to two new lessons based on what happened.',
    ),
    cards: visibleLessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      art: LESSON_ART[lesson.id] ?? 'desk',
      kicker: L('Опыт основателя', 'Founder experience'),
      description: lesson.text,
      effect: lesson.gives,
      status: meta.lessons.includes(lesson.id) ? 'owned' : 'locked',
      statusLabel: meta.lessons.includes(lesson.id)
        ? L('Получен', 'Earned')
        : L('Не получен', 'Not earned'),
      unlock: LESSON_UNLOCK[lesson.when],
    })),
  };
  const ideas = [
    ...ACTIVE_TECHS.map((card) => ({
      ...card,
      id: 'tech:' + card.id,
      title: L(`${card.adj} ИИ`, `${card.adj} AI`),
      art: CARD_ART[card.id],
      kicker: L('Какой ИИ', 'AI'),
      effect: card.does || L('Без модификаторов', 'No modifiers'),
    })),
    ...IDEAS.form.map((card) => ({
      ...card,
      id: 'form:' + card.id,
      title: L(`ИИ-${card.name}`, `AI ${card.name}`),
      art: CARD_ART[card.id],
      kicker: L('Продукт', 'Product'),
      effect: card.does || L('Без модификаторов', 'No modifiers'),
    })),
    ...IDEAS.aud.map((card) => ({
      ...card,
      id: 'aud:' + card.id,
      title: L(`Для ${card.name}`, `For ${card.name}`),
      art: card.texture,
      kicker: L('Аудитория', 'Audience'),
      effect:
        L(
          `Клиент от ${rate(card.pay / TUNING.sprint_s)}/с`,
          `Client from ${rate(card.pay / TUNING.sprint_s)}/s`,
        ) + (card.does ? ' · ' + card.does : ''),
    })),
  ];
  const pitch: CollectionSection = {
    id: 'pitch',
    title: L('Питч', 'Pitch'),
    summary: L(
      `Открыто ${ideas.filter((card) => card.unlock <= meta.runs.length).length}/${ideas.length}`,
      `Unlocked ${ideas.filter((card) => card.unlock <= meta.runs.length).length}/${ideas.length}`,
    ),
    note: L(
      `Завершено стартапов: ${meta.runs.length}. Открытые карты могут попасть в стартовый питч; выбор не расходует карту.`,
      `Finished startups: ${meta.runs.length}. Unlocked cards can appear in a starting pitch; choosing one does not consume it.`,
    ),
    cards: ideas.map((card) => ({
      id: card.id,
      title: card.title,
      art: card.art ?? 'laptop',
      kicker: card.kicker,
      description: card.note,
      effect: card.effect,
      status: card.unlock <= meta.runs.length ? 'owned' : 'locked',
      statusLabel:
        card.unlock <= meta.runs.length ? L('Открыта', 'Unlocked') : L('Закрыта', 'Locked'),
      unlock:
        card.unlock <= meta.runs.length
          ? L('Может выпасть в питче.', 'Can appear in a pitch.')
          : L(
              `Заверши ещё ${card.unlock - meta.runs.length} стартап(а).`,
              `Finish ${card.unlock - meta.runs.length} more startup(s).`,
            ),
      progress:
        card.unlock > meta.runs.length
          ? {
              value: meta.runs.length,
              max: card.unlock,
              label: L(
                `Стартапы ${meta.runs.length}/${card.unlock}`,
                `Startups ${meta.runs.length}/${card.unlock}`,
              ),
            }
          : undefined,
    })),
  };
  const runningCards = saved ? sprintCardsView(saved).cards : null;
  const sprint: CollectionSection = {
    id: 'sprint',
    title: L('Карты спринта', 'Sprint cards'),
    summary: saved
      ? L(`Текущая компания · спринт ${saved.sprint}`, `Current company · sprint ${saved.sprint}`)
      : L(`${DRAFT_CARDS.length} карт`, `${DRAFT_CARDS.length} cards`),
    note: L(
      'Копии усилений складываются только внутри компании. Новая партия начинает сбор заново; разовая помощь действует один раз при выборе.',
      'Upgrade copies stack within one company. A new run starts the collection over; one-off help acts once when chosen.',
    ),
    cards: DRAFT_CARDS.map((card): CollectionCard => {
      const current = runningCards?.find((entry) => entry.id === card.id);
      return {
        id: card.id,
        title: card.title,
        art: SPRINT_CARD_ART[card.id],
        kicker:
          card.slot === 'operation'
            ? L('Разовая помощь', 'One-off help')
            : L('Усиление до финала', 'Upgrade until the final release'),
        description: card.description,
        effect: current ? [current.impact, ...current.benefits].join(' · ') : card.impact,
        penalty: current?.penalties?.length ? current.penalties.join(' · ') : card.tradeoff,
        status:
          current?.status === 'active' || current?.status === 'claimed'
            ? 'owned'
            : current?.status === 'locked'
              ? 'locked'
              : 'available',
        statusLabel: current?.statusLabel ?? L('Встречается в партии', 'Available during a run'),
        unlock: card.requires.length
          ? L('Нужны постройки: ', 'Required buildings: ') +
            card.requires.map((id) => BLOCK_BY_ID[id]?.name ?? id).join(', ')
          : undefined,
      };
    }),
  };
  return {
    title: L('Коллекция игрока', 'Player collection'),
    subtitle: L(
      'Твои карты, их сила и следующие открытия.',
      'Your cards, their effects, and what unlocks next.',
    ),
    sections: [traits, lessons, pitch, sprint],
  };
}
