import { L } from '../core/lang';
import { BLOCK_BY_ID } from '../content/blocks';
import { LESSONS, TRAITS, traitGives } from '../systems/meta/meta';
import { DRAFT_CARDS, previewCardChange, type CardChange, type DraftCard } from '../systems/run/draft';
import { PRODUCTION, strategyCount, type StrategyId } from '../systems/run/product';
import { TUNING, type Run } from '../systems/run/run';
import { dec, whole } from './format';
import type { SprintCardsView, SprintCardView } from './sprint-cards';

export const SPRINT_CARD_ART: Record<string, string> = {
  mass: 'school',
  premium: 'hq',
  small_sales: 'cityblock',
  medium_sales: 'cityblock',
  batch: 'racks',
  instant: 'datacenter',
  leads: 'cityblock',
  consulting: 'handshake',
  credits: 'bank',
  maintenance: 'laptop',
  rest: 'coffee',
};
const blockName = (id: string): string => BLOCK_BY_ID[id]?.name ?? id;
const points = (value: number): string => dec(Math.round(value * 10) / 10);

export function cardChangeText(change: CardChange): string {
  const summary = `${points(change.before)} → ${points(change.after)}`;
  switch (change.kind) {
    case 'debt': return L(`Техдолг ${summary}`, `Tech debt ${summary}`);
    case 'energy': return L(`Силы ${summary}`, `Energy ${summary}`);
    case 'tokens':
      return L(
        `Токены: $${points(change.before)} → $${points(change.after)}/спринт`,
        `Tokens: $${points(change.before)} → $${points(change.after)}/sprint`,
      );
  }
}

function stackEffects(id: StrategyId, count: number) {
  const labels: Record<string, string> = {
    capacity: L('вместимость', 'capacity'),
    promo: L('продвижение', 'promotion'),
    seats: L(
      `места договоров (до ${TUNING.clients.slots})`,
      `contract slots (max ${TUNING.clients.slots})`,
    ),
    corp_pay: L('чек крупных', 'large-company bills'),
    patience: L('спр. терпения договоров', 'contract patience, sprints'),
    tokens: L('стоимость токенов', 'token cost'),
    large_satisfaction: L('довольство крупных', 'large-company satisfaction'),
  };
  const additive = ['seats', 'patience', 'large_satisfaction'];
  const fmt = (value: number) => dec(Number(value.toPrecision(3)));
  const effects = Object.entries(PRODUCTION.strategy[id]).map(([key, base]) => {
    const value = additive.includes(key) ? base * count : base ** count;
    const good = key === 'tokens' ? base < 1 : base > 0;
    const number = additive.includes(key)
      ? `${value >= 0 ? '+' : '−'}${fmt(Math.abs(value))}`
      : `×${fmt(value)}`;
    return { key, number, label: labels[key], text: `${number} ${labels[key]}`, good };
  });
  const segment = Object.entries(PRODUCTION.segment_revenue).find(([, rule]) => rule.card === id);
  if (segment) {
    const label = ({small: L('чек малых', 'small bills'), medium: L('чек средних', 'medium bills'), large: L('чек крупных', 'large bills')} as Record<string,string>)[segment[0]];
    const number = `+${Math.round(segment[1].bonus_per_copy * count * 100)}%`;
    effects.unshift({key:'segment_revenue', number, label, text: `${number} ${label}`, good:true});
  }
  return effects;
}

function cardView(run: Run, card: DraftCard, choosing = false): SprintCardView {
  const persistent = card.slot !== 'operation';
  const id = card.id as StrategyId;
  const level = persistent ? strategyCount(run, id) : 0;
  const category =
    card.slot === 'support'
      ? L('УСИЛЕНИЕ КОМПАНИИ', 'COMPANY UPGRADE')
      : card.slot === 'processing'
        ? L('УСИЛЕНИЕ ОБРАБОТКИ', 'PROCESSING UPGRADE')
        : L('РАЗОВАЯ ПОМОЩЬ', 'ONE-OFF HELP');
  const missing = card.requires.filter((kind) => !run.live.has(kind));
  const status: SprintCardView['status'] =
    level > 0
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
      ? L(`Собрано ×${level}`, `Collected ×${level}`)
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
  const current = persistent ? stackEffects(id, level) : [];
  const effects = persistent ? stackEffects(id, choosing ? 1 : Math.max(1, level)) : [];
  const primaryKey = id === 'mass' ? 'capacity' : effects[0]?.key;
  const primary = effects.find((effect) => effect.key === primaryKey);
  const before = current.find((effect) => effect.key === primaryKey);
  const after = persistent
    ? stackEffects(id, level + 1).find((effect) => effect.key === primaryKey)
    : undefined;
  const host = persistent
    ? PRODUCTION.strategy_host[id] * TUNING.sprint_s * (choosing ? 1 : Math.max(1, level))
    : 0;
  const benefits = effects
    .filter((effect) => effect.good && effect !== primary)
    .map((effect) => effect.text);
  const change = choosing ? previewCardChange(run, card) : undefined;
  const penalties = effects.filter((effect) => !effect.good && !(change?.kind === 'tokens' && effect.key === 'tokens')).map((effect) => effect.text);
  if (id === 'instant' && change) penalties.unshift(cardChangeText(change));
  if (host) penalties.push(L(`+$${whole(host)}/спринт хостинг`, `+$${whole(host)}/sprint hosting`));
  return {
    id: card.id,
    title: card.title,
    art: SPRINT_CARD_ART[card.id] ?? 'laptop',
    category,
    description: card.description,
    impact:
      change && id !== 'instant'
        ? cardChangeText(change)
        : choosing && before && after
          ? `${before.number} → ${after.number} ${after.label}`
          : (primary?.text ?? card.impact.replace(/^(Сразу:|Now:)\s*/, '')),
    benefits,
    penalties,
    level: persistent ? level : undefined,
    nextLevel: persistent && choosing ? level + 1 : undefined,
    detailLabel: persistent
      ? choosing
        ? L('ЕЩЁ ЗА ЭТУ КОПИЮ', 'ALSO PER COPY')
        : L('СУММАРНО ОТ КАРТЫ', 'CARD TOTAL')
      : '',
    tradeoff: persistent ? '' : card.tradeoff,
    duration: persistent
      ? L('До финала · 30 спринтов', 'Until the end · 30 sprints')
      : card.once
        ? L('Разово · один раз за партию', 'One-off · once per run')
        : L('Разово · может выпасть снова', 'One-off · may appear again'),
    replacement: persistent
      ? choosing
        ? L('Добавится к уже собранным картам', 'Stacks with your collected cards')
        : level
          ? L('Повторная карта добавит уровень', 'Another copy adds a level')
          : L('Показан эффект одной копии', 'Showing one copy’s effect')
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
    applied: applied
      ? {
          ...applied,
          impact: (() => {
            const card = cards.find((entry) => entry.title === applied.title);
            return card?.level
              ? [
                  L(`Уровень ${card.level}`, `Level ${card.level}`),
                  card.id === 'batch' ? applied.impact : card.impact,
                  ...(card.id === 'instant' ? [applied.impact] : []),
                  ...(card.benefits ?? []),
                  ...(card.penalties ?? []).filter((penalty) => card.id !== 'instant' || !penalty.endsWith(L('стоимость токенов', 'token cost'))),
                ].join(' · ')
              : applied.impact;
          })(),
        }
      : applied,
    draft: run.draft
      ? {
          sprint: run.sprint,
          limit: TUNING.last_sprint,
          cards: run.draft.flatMap((id) => {
            const card = DRAFT_CARDS.find((entry) => entry.id === id);
            return card ? [cardView(run, card, true)] : [];
          }),
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
