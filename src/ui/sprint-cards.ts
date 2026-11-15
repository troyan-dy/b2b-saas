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
}

export interface SprintCardsView {
  readonly draft: {
    readonly sprint: number;
    readonly limit: number;
    readonly cards: readonly SprintCardView[];
    readonly summary: string;
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
    `<span class="sc-mark">${choosing ? index + 1 : esc(card.statusLabel)}</span></span>` +
    `<span class="sc-category">${esc(card.category)}</span><strong class="sc-title">${esc(card.title)}</strong>` +
    `<span class="sc-impact">${esc(card.impact)}</span><span class="sc-description">${esc(card.description)}</span>` +
    (card.tradeoff ? `<span class="sc-tradeoff">${esc(card.tradeoff)}</span>` : '') +
    `<span class="sc-lifetime">${esc(card.duration)}</span>` +
    (card.replacement ? `<span class="sc-replacement">${esc(card.replacement)}</span>` : '') +
    (choosing
      ? `<span class="sc-take">${L('Взять карту', 'Take this card')} <kbd>${index + 1}</kbd></span>`
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
    '<section class="sc-overlay sc-album" role="dialog" aria-modal="true" aria-labelledby="sc-album-title" hidden></section>';
  parent.append(root);
  const opener = root.querySelector<HTMLButtonElement>('.sc-open')!;
  const draft = root.querySelector<HTMLElement>('.sc-draft')!;
  const album = root.querySelector<HTMLElement>('.sc-album')!;
  let view: SprintCardsView | null = null;
  let draftKey = '';
  let albumKey = '';
  let chosen = false;
  let albumOpen = false;
  let beforeDraft: HTMLElement | null = null;
  let beforeAlbum: HTMLElement | null = null;

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
      `<p class="sc-guide">${L('Два режима: один для поддержки, один для обработки. Другая карта той же категории заменит только режим. Постройки остаются.', 'Two modes: one for support, one for processing. A different card in the same category replaces only that mode. Your buildings stay.')}</p>` +
      '<div class="sc-album-body">' +
      section(
        L('Действуют сейчас', 'Active now'),
        view.cards.filter((card) => card.status === 'active'),
        L(
          'Режимов пока нет. Выбирай их из трёх карт между спринтами.',
          'No modes yet. Choose them from three cards between sprints.',
        ),
      ) +
      section(L('Временные события', 'Temporary events'), view.events) +
      section(L('Основатель', 'Founder'), view.founder) +
      section(
        L('Коллекция спринтов', 'Sprint collection'),
        view.cards.filter((card) => card.status !== 'active'),
      ) +
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
    if (albumOpen && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeOverlay();
      return;
    }
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
      if (!view) {
        album.hidden = true;
        draft.hidden = true;
        albumOpen = false;
        draftKey = '';
        chosen = false;
        return;
      }
      const count =
        view.cards.filter((card) => card.status === 'active').length +
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
          `<p>${L('Выбери одну карту. Она сработает сразу.', 'Choose one card. It takes effect immediately.')}</p></header>` +
          `<div class="sc-choices">${deal.cards.map((card, index) => cardHtml(card, index)).join('')}</div>` +
          `<p class="sc-deal-rule">${L('Режимы сохраняются до замены или конца партии. Разовая помощь выдаётся один раз при выборе. Постройки не заменяются.', 'Modes stay until replaced or the run ends. One-off help is granted when chosen. Buildings are never replaced.')}</p>` +
          `<footer class="sc-report">${esc(deal.summary)}${deal.news ? `<span>${esc(deal.news.text)}</span>` : ''}</footer></div>`;
        draft.querySelector<HTMLButtonElement>('[data-sc-choice]')?.focus({ preventScroll: true });
      } else if (beforeDraft?.isConnected) beforeDraft.focus({ preventScroll: true });
    },
    destroy(): void {
      window.removeEventListener('keydown', onKey, true);
      root.remove();
    },
  };
}
