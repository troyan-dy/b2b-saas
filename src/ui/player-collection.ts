import { L } from '../core/lang';
import './player-collection.css';

export interface CollectionCard {
  id: string;
  title: string;
  art: string;
  kicker?: string;
  description: string;
  effect: string;
  penalty?: string;
  status: 'owned' | 'locked' | 'available';
  statusLabel: string;
  unlock?: string;
  next?: string;
  progress?: { value: number; max: number; label: string };
}

export interface CollectionSection {
  id: string;
  title: string;
  summary: string;
  note: string;
  cards: readonly CollectionCard[];
}

export interface CollectionView {
  title: string;
  subtitle: string;
  sections: readonly CollectionSection[];
}

type Filter = 'all' | 'open' | 'locked';
const filters: readonly Filter[] = ['all', 'open', 'locked'];
const filterLabel: Record<Filter, string> = {
  all: L('Все', 'All'),
  open: L('Открыто', 'Unlocked'),
  locked: L('Закрыто', 'Locked'),
};
const esc = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function cardHtml(card: CollectionCard): string {
  const progress = card.progress;
  const fraction =
    progress && progress.max > 0 ? Math.max(0, Math.min(1, progress.value / progress.max)) : 0;
  return (
    `<article class="pc-card pc-${card.status}" data-collection-card="${esc(card.id)}">` +
    `<div class="pc-art"><img src="assets/img/nodes/${encodeURIComponent(card.art)}.webp" alt="" loading="lazy"><span class="pc-state">${esc(card.statusLabel)}</span></div>` +
    '<div class="pc-card-body">' +
    (card.kicker ? `<small class="pc-kicker">${esc(card.kicker)}</small>` : '') +
    `<h3>${esc(card.title)}</h3><p class="pc-description">${esc(card.description)}</p>` +
    `<p class="pc-effect">${esc(card.effect)}</p>` +
    (card.penalty ? `<p class="pc-penalty">${esc(card.penalty)}</p>` : '') +
    (progress
      ? `<div class="pc-progress"><div role="progressbar" aria-label="${esc(progress.label)}" aria-valuenow="${progress.value}" aria-valuemin="0" aria-valuemax="${progress.max}"><i style="width:${fraction * 100}%"></i></div><span>${esc(progress.label)}</span></div>`
      : '') +
    (card.next ? `<p class="pc-next">${esc(card.next)}</p>` : '') +
    (card.unlock ? `<p class="pc-unlock">${esc(card.unlock)}</p>` : '') +
    '</div></article>'
  );
}

/** A read-only album. The supplied view is never changed. */
export function createPlayerCollection(
  body: HTMLElement,
  foot: HTMLElement,
  view: CollectionView,
  sound: (name: 'ui' | 'yes') => void,
  onClose: () => void,
) {
  const root = document.createElement('section');
  root.className = 'pc';
  root.setAttribute('aria-label', view.title);
  root.innerHTML =
    `<header class="pc-heading"><h1>${esc(view.title)}</h1><p>${esc(view.subtitle)}</p></header>` +
    `<nav class="pc-tabs" role="tablist" aria-label="${L('Разделы коллекции', 'Collection sections')}">` +
    view.sections
      .map(
        (section, index) =>
          `<button type="button" role="tab" id="pc-tab-${index}" aria-controls="pc-panel" data-section="${index}"><strong>${esc(section.title)}</strong><small>${esc(section.summary)}</small></button>`,
      )
      .join('') +
    '</nav><div class="pc-section-head"><p class="pc-note"></p>' +
    `<div class="pc-filters" role="group" aria-label="${L('Показать карты', 'Show cards')}">` +
    filters
      .map(
        (filter) => `<button type="button" data-filter="${filter}">${filterLabel[filter]}</button>`,
      )
      .join('') +
    '</div></div><div class="pc-scroll" id="pc-panel" role="tabpanel" tabindex="0"><div class="pc-grid"></div></div>';
  body.append(root);
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'pc-back';
  back.textContent = L('← В меню', '← Back to menu');
  const hint = document.createElement('span');
  hint.className = 'pc-footer-hint';
  hint.innerHTML = `<kbd>Esc</kbd> ${L('пауза', 'pause')} · <kbd>←</kbd><kbd>→</kbd> ${L('разделы', 'sections')}`;
  foot.replaceChildren(back, hint);
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-section]')];
  const filterButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  const note = root.querySelector<HTMLElement>('.pc-note')!;
  const scroll = root.querySelector<HTMLElement>('.pc-scroll')!;
  const grid = root.querySelector<HTMLElement>('.pc-grid')!;
  let selected = 0;
  let filter: Filter = 'all';
  let closed = false;

  const render = (): void => {
    const section = view.sections[selected];
    root.dataset.section = section?.id ?? '';
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === selected));
      tab.tabIndex = i === selected ? 0 : -1;
    });
    filterButtons.forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.filter === filter)),
    );
    note.textContent = section?.note ?? '';
    scroll.setAttribute('aria-labelledby', `pc-tab-${selected}`);
    const cards = (section?.cards ?? []).filter(
      (card) =>
        filter === 'all' ||
        (filter === 'locked' ? card.status === 'locked' : card.status !== 'locked'),
    );
    grid.classList.toggle('pc-five', section?.cards.length === 5);
    grid.innerHTML = cards.length
      ? cards.map(cardHtml).join('')
      : `<p class="pc-empty">${L('В этом разделе пока нет таких карт.', 'No matching cards in this section yet.')}</p>`;
    scroll.scrollTop = 0;
  };
  const select = (index: number): void => {
    if (index === selected || index < 0 || index >= tabs.length) return;
    selected = index;
    filter = 'all';
    render();
    sound('ui');
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    sound('ui');
    onClose();
  };
  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (target?.dataset.section !== undefined) select(Number(target.dataset.section));
    else if (target?.dataset.filter) {
      filter = target.dataset.filter as Filter;
      render();
      sound('ui');
    }
  });
  back.addEventListener('click', close);
  render();
  tabs[0]?.focus({ preventScroll: true });
  return {
    key(event: KeyboardEvent): void {
      const target = event.target as HTMLElement;
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
      if (digit && Number(digit[1]) <= tabs.length) {
        event.preventDefault();
        select(Number(digit[1]) - 1);
        tabs[selected]?.focus();
      } else if (tabs.length && (target.matches('[role="tab"]') || target === document.body)) {
        const index =
          event.code === 'ArrowRight'
            ? (selected + 1) % tabs.length
            : event.code === 'ArrowLeft'
              ? (selected + tabs.length - 1) % tabs.length
              : event.code === 'Home'
                ? 0
                : event.code === 'End'
                  ? tabs.length - 1
                  : -1;
        if (index >= 0) {
          event.preventDefault();
          select(index);
          tabs[selected]?.focus();
        }
      }
    },
    destroy(): void {
      root.remove();
      foot.replaceChildren();
    },
  };
}
