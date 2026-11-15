import { L } from '../core/lang';
import { BLOCK_BY_ID } from '../content/blocks';
import { LESSONS, TRAITS, traitGives } from '../systems/meta/meta';
import { DRAFT_CARDS, type DraftCard } from '../systems/run/draft';
import { TUNING, type Run } from '../systems/run/run';
import { dec, whole } from './format';
import type { SprintCardsView, SprintCardView } from './sprint-cards';

const ART: Record<string, string> = {
  mass: 'school',
  premium: 'hq',
  batch: 'racks',
  instant: 'datacenter',
  leads: 'cityblock',
  consulting: 'handshake',
  credits: 'bank',
  maintenance: 'laptop',
  rest: 'coffee',
};
const blockName = (id: string): string => BLOCK_BY_ID[id]?.name ?? id;

function cardView(run: Run, card: DraftCard): SprintCardView {
  const persistent = card.slot !== 'operation';
  const selected = persistent ? run.strategy[card.slot as 'support' | 'processing'] : null;
  const previous = DRAFT_CARDS.find((entry) => entry.id === selected);
  const category =
    card.slot === 'support'
      ? L('РЕЖИМ ПОДДЕРЖКИ', 'SUPPORT MODE')
      : card.slot === 'processing'
        ? L('РЕЖИМ ОБРАБОТКИ', 'PROCESSING MODE')
        : L('РАЗОВАЯ ПОМОЩЬ', 'ONE-OFF HELP');
  const missing = card.requires.filter((kind) => !run.live.has(kind));
  const status: SprintCardView['status'] =
    selected === card.id
      ? 'active'
      : card.once && run.claimedGrants.includes(card.id)
        ? 'claimed'
        : run.tasks.some((task) => task.kind === 'card' && task.card === card.id)
          ? 'queued'
          : missing.length
            ? 'locked'
            : 'available';
  const statusLabel =
    status === 'active'
      ? L('Действует', 'Active')
      : status === 'claimed'
        ? L('Получено', 'Claimed')
        : status === 'queued'
          ? L('В работе', 'In progress')
          : status === 'locked'
            ? L(
                `Нужен ${missing.map(blockName).join(', ')}`,
                `Needs ${missing.map(blockName).join(', ')}`,
              )
            : L('Доступна в раздаче', 'Available in a deal');
  return {
    id: card.id,
    title: card.title,
    art: ART[card.id] ?? 'laptop',
    category,
    description: card.description,
    impact: card.impact.replace(/^(Сразу:|Now:)\s*/, ''),
    tradeoff: card.tradeoff,
    duration: persistent
      ? L('До замены или конца партии', 'Until replaced or the run ends')
      : card.once
        ? L('Разово · один раз за партию', 'One-off · once per run')
        : L('Разово · может выпасть снова', 'One-off · may appear again'),
    replacement:
      persistent && status !== 'active'
        ? previous
          ? L(`Заменит только режим «${previous.title}».`, `Replaces only “${previous.title}”.`)
          : L('Включит режим. Постройки останутся.', 'Enables this mode. Buildings stay.')
        : '',
    status,
    statusLabel,
  };
}

export function sprintCardsView(
  run: Run,
  news?: { readonly title: string; readonly text: string } | null,
  applied?: { readonly title: string; readonly impact: string } | null,
): SprintCardsView {
  const cards = DRAFT_CARDS.map((card) => cardView(run, card));
  const founder: SprintCardView[] = [
    ...LESSONS.filter((lesson) => run.perks.includes(lesson.id)).map((lesson): SprintCardView => ({
      id: `lesson:${lesson.id}`,
      title: lesson.title,
      art: 'desk',
      category: L('ОПЫТ ОСНОВАТЕЛЯ', 'FOUNDER EXPERIENCE'),
      description: lesson.text,
      impact: lesson.gives,
      tradeoff: '',
      duration: L('Получен до этой партии', 'Earned before this run'),
      replacement: '',
      status: 'active',
      statusLabel: L('С тобой в этой партии', 'With you this run'),
    })),
    ...TRAITS.filter((trait) => (run.traits[trait.id] ?? 0) > 0).map((trait): SprintCardView => ({
      id: `trait:${trait.id}`,
      title: trait.title,
      art: trait.art,
      category: L('ЧЕРТА ОСНОВАТЕЛЯ', 'FOUNDER TRAIT'),
      description: trait.note,
      impact: traitGives(trait, run.traits[trait.id]),
      tradeoff: '',
      duration: L(
        `Уровень в этой партии: ${run.traits[trait.id]}`,
        `Level this run: ${run.traits[trait.id]}`,
      ),
      replacement: '',
      status: 'active',
      statusLabel: L('Действует', 'Active'),
    })),
  ];
  const labels = {
    tokens: L('Стоимость токенов', 'Token cost'),
    price: L('Чек клиентов', 'Client bills'),
    promo: L('Продвижение', 'Promotion'),
  };
  const events: SprintCardView[] = run.mods
    .filter((mod) => mod.left > 0)
    .map((mod, index) => ({
      id: `event:${index}`,
      title: labels[mod.kind],
      art: mod.kind === 'tokens' ? 'rack' : mod.kind === 'price' ? 'bank' : 'mall',
      category: L('ВРЕМЕННОЕ СОБЫТИЕ', 'TEMPORARY EVENT'),
      description: L(
        'Эффект новости. Исчезнет сам после указанного числа релизов.',
        'A news effect. Expires automatically after the listed number of releases.',
      ),
      impact: `${labels[mod.kind]} ×${dec(mod.mult)}`,
      tradeoff: '',
      duration: L(`Осталось релизов: ${mod.left}`, `Releases remaining: ${mod.left}`),
      replacement: '',
      status: 'active',
      statusLabel: L('Действует', 'Active'),
    }));
  const report = run.lastReport;
  return {
    cards,
    founder,
    events,
    applied,
    draft: run.draft
      ? {
          sprint: run.sprint,
          limit: TUNING.last_sprint,
          cards: run.draft.flatMap((id) => cards.find((card) => card.id === id) ?? []),
          summary: report
            ? L(
                `Релиз ${report.sprint} · пришло ${whole(report.came)} · ушло ${whole(report.left)}`,
                `Release ${report.sprint} · joined ${whole(report.came)} · left ${whole(report.left)}`,
              )
            : '',
          news,
        }
      : null,
  };
}
