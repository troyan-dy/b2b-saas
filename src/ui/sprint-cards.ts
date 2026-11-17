import { afterGameTime } from '../core/pause-clock';
import { L } from '../core/lang';
import './sprint-cards.css';

export interface SprintCardView {
  readonly id: string;
  readonly title: string;
  readonly art: string;
  readonly category: string;
  readonly description: string;
  readonly impact: string;
  readonly tradeoff: string;
  readonly duration: string;
  readonly replacement: string;
  readonly status: 'active' | 'available' | 'locked' | 'claimed' | 'queued';
  readonly statusLabel: string;
  readonly benefits?: readonly string[];
  readonly penalties?: readonly string[];
  readonly level?: number;
  readonly nextLevel?: number;
  readonly detailLabel?: string;
}

export interface SprintCardsView {
  readonly draft: {
    readonly sprint: number;
    readonly limit: number;
    readonly cards: readonly SprintCardView[];
    readonly summary: string;
    readonly firstSubscriptions?: string;
    readonly promises?: string[];
    readonly news?: { readonly title: string; readonly text: string } | null;
  } | null;
  readonly cards: readonly SprintCardView[];
  readonly founder: readonly SprintCardView[];
  readonly events: readonly SprintCardView[];
  readonly applied?: { readonly title: string; readonly impact: string } | null;
}

const esc = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

function cardHtml(card: SprintCardView, index?: number): string {
  const choosing = index !== undefined;
  const tag = choosing ? 'button' : 'article';
  return (
    `<${tag} class="sc-card sc-${card.status}${choosing ? ' sc-choice' : ''}" ${choosing ? `type="button" data-sc-choice="${esc(card.id)}"` : ''}>` +
    `<span class="sc-art"><img src="${import.meta.env.BASE_URL}assets/img/nodes/${esc(card.art)}.webp" alt="" draggable="false">` +
    `<span class="sc-mark">${choosing ? index + 1 : esc(card.statusLabel)}</span>` +
    (card.level !== undefined
      ? `<span class="sc-level">${card.nextLevel !== undefined ? `×${card.level} → ×${card.nextLevel}` : `×${card.level}`}</span>`
      : '') +
    '</span>' +
    `<span class="sc-category">${esc(card.category)}</span><strong class="sc-title">${esc(card.title)}</strong>` +
    `<span class="sc-impact${card.benefits ? ' sc-benefit' : ''}">${esc(card.impact)}</span>` +
    (card.detailLabel ? `<span class="sc-detail-label">${esc(card.detailLabel)}</span>` : '') +
    (card.benefits?.length || card.penalties?.length
      ? `<span class="sc-badges">${(card.benefits ?? []).map((text) => `<span class="sc-badge sc-good">${esc(text)}</span>`).join('')}${(card.penalties ?? []).map((text) => `<span class="sc-badge sc-cost">${esc(text)}</span>`).join('')}</span>`
      : '') +
    `<span class="sc-description">${esc(card.description)}</span>` +
    (card.tradeoff ? `<span class="sc-tradeoff">${esc(card.tradeoff)}</span>` : '') +
    `<span class="sc-lifetime">${esc(card.duration)}</span>` +
    (card.replacement ? `<span class="sc-replacement">${esc(card.replacement)}</span>` : '') +
    (choosing
      ? `<span class="sc-take">${card.nextLevel !== undefined ? L(`Усилить до ×${card.nextLevel}`, `Upgrade to ×${card.nextLevel}`) : L('Получить сейчас', 'Claim now')} <kbd>${index + 1}</kbd></span>`
      : '') +
    `</${tag}>`
  );
}

function section(title: string, cards: readonly SprintCardView[], empty = ''): string {
  if (!cards.length && !empty) return '';
  return (
    `<section class="sc-album-section"><h3>${esc(title)}</h3>` +
    (cards.length
      ? `<div class="sc-album-grid">${cards.map((card) => cardHtml(card)).join('')}</div>`
      : `<p class="sc-empty">${esc(empty)}</p>`) +
    '</section>'
  );
}

export function createSprintCards(parent: HTMLElement, onChoose: (id: string) => void) {
  const root = document.createElement('section');
  root.className = 'sprint-cards';
  root.hidden = true;
  root.innerHTML =
    `<button type="button" class="sc-open" data-sc-open></button>` +
    '<section class="sc-overlay sc-draft" role="dialog" aria-modal="true" aria-labelledby="sc-draft-title" hidden></section>' +
    '<section class="sc-overlay sc-album" role="dialog" aria-modal="true" aria-labelledby="sc-album-title" hidden></section>' +
    '<div class="sc-applied" role="status" aria-live="polite" hidden></div>';
  parent.append(root);
  const opener = root.querySelector<HTMLButtonElement>('.sc-open')!;
  const draft = root.querySelector<HTMLElement>('.sc-draft')!;
  const album = root.querySelector<HTMLElement>('.sc-album')!;
  const applied = root.querySelector<HTMLElement>('.sc-applied')!;
  parent.querySelector('.bl-shop')?.prepend(applied);
  let view: SprintCardsView | null = null;
  let draftKey = '';
  let albumKey = '';
  let chosen = false;
  let albumOpen = false;
  let beforeDraft: HTMLElement | null = null;
  let beforeAlbum: HTMLElement | null = null;
  let appliedKey = '';
  let cancelApplied: (() => void) | undefined;

  function updateApplied(value: SprintCardsView['applied']): void {
    const key = value ? `${value.title}\n${value.impact}` : '';
    if (key === appliedKey) return;
    appliedKey = key;
    cancelApplied?.();
    applied.hidden = !value;
    if (!value) return;
    const card = view?.cards.find((entry) => entry.title === value.title);
    applied.innerHTML =
      `<span>${L('КАРТА СРАБОТАЛА', 'CARD APPLIED')} · ${esc(value.title)}</span>` +
      `<strong>${esc(value.impact)}</strong>` +
      (card ? `<small>${esc(card.duration)}</small>` : '');
    cancelApplied = afterGameTime(() => {
      applied.hidden = true;
    }, 4500);
  }

  function renderAlbum(): void {
    if (!view) return;
    const key = JSON.stringify([view.cards, view.founder, view.events]);
    if (key === albumKey) return;
    albumKey = key;
    const scroll = album.querySelector('.sc-album-body')?.scrollTop ?? 0;
    album.innerHTML =
      '<div class="sc-album-sheet"><header class="sc-album-header">' +
      `<div><span class="sc-eyebrow">${L('ТВОЯ КОМПАНИЯ', 'YOUR COMPANY')}</span><h2 id="sc-album-title">${L('Карты и усиления', 'Cards and effects')}</h2></div>` +
      `<button type="button" class="sc-close" data-sc-close aria-label="${L('Закрыть карты', 'Close cards')}">×</button></header>` +
      `<p class="sc-guide">${L('Все усиления работают вместе до финала. Каждая копия добавляет уровень: множители перемножаются, прибавки складываются. Деньги, лиды, ремонт и силы выдаются разово.', 'All upgrades work together until the end. Every copy adds a level: multipliers multiply, additions add up. Cash, leads, repairs and energy are one-off rewards.')}</p>` +
      '<div class="sc-album-body">' +
      section(
        L('Действуют сейчас', 'Active now'),
        view.cards.filter((card) => card.status === 'active'),
        L(
          'Усилений пока нет. Выбирай их из трёх карт между спринтами.',
          'No upgrades yet. Choose them from three cards between sprints.',
        ),
      ) +
      section(L('Временные события', 'Temporary events'), view.events) +
      section(L('Основатель', 'Founder'), view.founder) +
      section(L('Вся коллекция · 9 карт', 'Full collection · 9 cards'), view.cards) +
      '</div>' +
      `<footer>${L('Здесь можно только смотреть. Новые карты выбираются между спринтами. Время идёт.', 'This is a reference. Choose new cards between sprints. Time is running.')}</footer></div>`;
    const body = album.querySelector('.sc-album-body');
    if (body) body.scrollTop = scroll;
  }

  function closeOverlay(): boolean {
    if (!albumOpen) return false;
    albumOpen = false;
    album.hidden = true;
    if (beforeAlbum?.isConnected) beforeAlbum.focus({ preventScroll: true });
    else opener.focus({ preventScroll: true });
    return true;
  }

  function openCollection(): void {
    if (!view || view.draft || albumOpen) return;
    beforeAlbum = document.activeElement as HTMLElement | null;
    albumOpen = true;
    renderAlbum();
    album.hidden = false;
    album.querySelector<HTMLButtonElement>('[data-sc-close]')?.focus({ preventScroll: true });
  }

  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (target?.hasAttribute('data-sc-open')) openCollection();
    else if (target?.hasAttribute('data-sc-close')) closeOverlay();
    else if (target?.dataset.scChoice && view?.draft && !chosen) {
      chosen = true;
      for (const button of draft.querySelectorAll<HTMLButtonElement>('[data-sc-choice]'))
        button.disabled = true;
      onChoose(target.dataset.scChoice);
    }
  });
  album.addEventListener('click', (event) => {
    if (event.target === album) closeOverlay();
  });

  const onKey = (event: KeyboardEvent): void => {
    if (root.hidden || (!albumOpen && !view?.draft)) return;
    const overlay = albumOpen ? album : draft;
    if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = focusable[0],
        last = focusable.at(-1);
      if (!first || !last) return;
      if (!overlay.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    if (albumOpen) event.stopImmediatePropagation();
  };
  window.addEventListener('keydown', onKey, true);

  return {
    openCollection,
    closeOverlay,
    set(next: SprintCardsView | null): void {
      view = next;
      root.hidden = !view;
      updateApplied(view?.applied);
      if (!view) {
        album.hidden = true;
        draft.hidden = true;
        albumOpen = false;
        draftKey = '';
        chosen = false;
        return;
      }
      const count =
        view.cards.reduce(
          (sum, card) => sum + (card.level ?? (card.status === 'active' ? 1 : 0)),
          0,
        ) +
        view.founder.length +
        view.events.length;
      opener.textContent = L(`Карты · ${count}`, `Cards · ${count}`);
      opener.setAttribute(
        'aria-label',
        L(`Карты и усиления: действует ${count}`, `Cards and effects: ${count} active`),
      );
      opener.hidden = Boolean(view.draft);
      if (albumOpen && view.draft) closeOverlay();
      if (albumOpen) renderAlbum();
      draft.hidden = !view.draft;
      const nextKey = view.draft ? JSON.stringify(view.draft) : '';
      if (nextKey === draftKey) return;
      const wasDraft = Boolean(draftKey);
      draftKey = nextKey;
      chosen = false;
      if (view.draft) {
        if (!wasDraft) beforeDraft = document.activeElement as HTMLElement | null;
        const deal = view.draft;
        draft.innerHTML =
          '<div class="sc-deal"><header class="sc-deal-header">' +
          `<span class="sc-eyebrow">${L(`СПРИНТ ${deal.sprint} / ${deal.limit} · ВРЕМЯ ОСТАНОВЛЕНО`, `SPRINT ${deal.sprint} / ${deal.limit} · TIME PAUSED`)}</span>` +
          `<h2 id="sc-draft-title">${L('Следующий ход компании', 'Your company’s next move')}</h2>` +
          `<p>${L('Выбери одну. Усиления копятся и работают сразу.', 'Choose one. Upgrades stack and work immediately.')}</p></header>` +
          `<div class="sc-choices">${deal.cards.map((card, index) => cardHtml(card, index)).join('')}</div>` +
          `<p class="sc-deal-rule">${L('Зелёное — выгода. Терракотовое — цена. Все собранные карты и постройки остаются с тобой.', 'Green is the benefit. Terracotta is the cost. All collected cards and buildings stay with you.')}</p>` +
          `<footer class="sc-report">${deal.firstSubscriptions ? `<strong>${esc(deal.firstSubscriptions)}</strong>` : ''}${deal.promises?.length ? `<p class="sc-promises">${deal.promises.map(esc).join(' · ')}</p>` : ''}${esc(deal.summary)}${deal.news ? `<span>${esc(deal.news.text)}</span>` : ''}</footer></div>`;
        draft.querySelector<HTMLButtonElement>('[data-sc-choice]')?.focus({ preventScroll: true });
      } else (beforeDraft?.isConnected && beforeDraft !== document.body ? beforeDraft : opener).focus({ preventScroll: true });
    },
    destroy(): void {
      cancelApplied?.();
      window.removeEventListener('keydown', onKey, true);
      applied.remove();
      root.remove();
    },
  };
}
