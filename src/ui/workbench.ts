import './workbench.css';
import { L } from '../core/lang';
import { dec, money, PER_S, rate, whole } from './format';

export type SegmentId = 'small' | 'medium' | 'large';
export type WorkbenchBuildAction = 'place' | 'upgrade' | 'none';

export interface WorkbenchTask {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly work: number;
  readonly done: number;
  readonly cost: number;
  readonly status: 'queued' | 'active' | 'ready' | 'backlog';
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly canDefer: boolean;
  readonly canResume?: boolean;
}

export interface WorkbenchModule {
  readonly id: string;
  readonly title: string;
  readonly level: number;
  readonly current: string;
  readonly next: string;
  readonly work: number;
  readonly cost: number;
  /** Hosting in dollars per second, matching the game's ledger. */
  readonly hosting: number;
  readonly demand: string;
  readonly action: WorkbenchBuildAction;
  readonly disabled: boolean;
  readonly selected: boolean;
  readonly specialization?: string;
  readonly links?: readonly string[];
}

export interface WorkbenchNeed {
  readonly block: string;
  readonly title: string;
  readonly count: number;
  readonly share: number;
  readonly effect: string;
  readonly action: WorkbenchBuildAction;
  readonly disabled: boolean;
}

export interface WorkbenchSegment {
  readonly id: SegmentId;
  readonly title: string;
  readonly count: number;
  readonly happiness: number;
  readonly delta: number;
  readonly leads: number;
  readonly market: number;
  /** Current and proposed absolute tariff multipliers, not a percentage change. */
  readonly price: number;
  readonly previewPrice: number;
  readonly forecast: string;
  readonly needs: readonly WorkbenchNeed[];
  readonly reasons: readonly string[];
  readonly pricePending?: boolean;
  readonly priceDisabled?: boolean;
  readonly priceLabel?: string;
}

export interface WorkbenchNews {
  readonly title: string;
  readonly text: string;
}

export interface WorkbenchDraft {
  readonly sprint: number;
  readonly summary: string;
  readonly news: WorkbenchNews | null;
  readonly cards: readonly {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly impact: string;
    readonly tradeoff: string;
    readonly work: number;
    readonly cost: number;
  }[];
}

export interface WorkbenchView {
  readonly tasks: readonly WorkbenchTask[];
  readonly budget: { readonly planned: number; readonly capacity: number };
  readonly modules: readonly WorkbenchModule[];
  readonly segments: readonly WorkbenchSegment[];
  readonly draft: WorkbenchDraft | null;
  readonly news?: WorkbenchNews;
  readonly infrastructure?: {
    readonly label: string;
    readonly detail: string;
    readonly disabled?: boolean;
  };
  readonly selectedSegment?: SegmentId;
}

export type WorkbenchAction =
  | { type: 'place' | 'upgrade'; block: string }
  | { type: 'move'; task: string; direction: -1 | 1 }
  | { type: 'defer' | 'resume'; task: string }
  | { type: 'choose-card'; id: string }
  | { type: 'preview-price'; segment: SegmentId; value: number }
  | { type: 'confirm-price'; segment: SegmentId }
  | { type: 'expand-infrastructure' }
  | { type: 'select-segment'; segment: SegmentId };

const esc = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const disabled = (value: boolean): string => (value ? ' disabled' : '');
const multiplier = (value: number): string => `×${dec(Number(value.toFixed(2)))}`;
const signed = (value: number): string =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${whole(Math.abs(value))}`;
const taskState = (status: WorkbenchTask['status']): string =>
  ({
    queued: L('В плане', 'Planned'),
    active: L('В работе', 'In progress'),
    ready: L('К релизу', 'For release'),
    backlog: L('На потом', 'Later'),
  })[status];
const buildLabel = (action: WorkbenchBuildAction): string =>
  ({
    place: L('Разместить', 'Place'),
    upgrade: L('В очередь', 'Queue'),
    none: L('Готово', 'Complete'),
  })[action];

function button(action: string, id: string, label: string, off = false, extra = ''): string {
  return `<button type="button" data-wb-action="${action}" data-wb-id="${esc(id)}" data-wb-key="${action}:${esc(id)}${extra}"${disabled(off)}>${label}</button>`;
}

function taskHtml(task: WorkbenchTask, index: number): string {
  const detail = `${whole(task.done)} / ${whole(task.work)} ${L('работы', 'work')} · ${money(task.cost)}`;
  const arrows = (direction: -1 | 1, off: boolean): string =>
    `<button type="button" data-wb-action="move" data-wb-id="${esc(task.id)}" data-wb-direction="${direction}" data-wb-key="move:${esc(task.id)}:${direction}" aria-label="${esc(`${direction < 0 ? L('Поднять', 'Move up') : L('Опустить', 'Move down')}: ${task.title}`)}"${disabled(off)}>${direction < 0 ? '↑' : '↓'}</button>`;
  return (
    `<li class="wb-task"><div class="wb-task-head"><span class="wb-order">${index + 1}.</span><strong>${esc(task.title)}</strong><small>${taskState(task.status)}</small></div>` +
    `<p>${esc(task.detail)}</p><div class="wb-task-foot"><span>${detail}</span><div class="wb-task-actions">${task.status === 'backlog' ? button('resume', task.id, L('В очередь', 'Queue'), task.canResume === false) : arrows(-1, !task.canMoveUp) + arrows(1, !task.canMoveDown) + button('defer', task.id, L('На потом', 'Later'), !task.canDefer)}</div></div>` +
    `${task.status === 'active' ? `<progress value="${task.done}" max="${Math.max(1, task.work)}" aria-label="${esc(task.title)}"></progress>` : ''}</li>`
  );
}

function moduleHtml(module: WorkbenchModule): string {
  return (
    `<tr class="${module.selected ? 'wb-selected' : ''}"><th scope="row"><strong>${esc(module.title)}</strong><small>${module.level > 0 ? `v${module.level}` : L('Новый блок', 'New block')}${module.demand ? ` · ${esc(module.demand)}` : ''}</small>${module.specialization ? `<small class="wb-specialization">${esc(module.specialization)}</small>` : ''}</th>` +
    `<td><span>${esc(module.current)}</span>${module.next ? `<small class="wb-next">→ ${esc(module.next)}</small>` : ''}${module.links?.length ? `<small class="wb-links">${L('Связи', 'Links')}: ${module.links.map(esc).join(' · ')}</small>` : ''}</td>` +
    `<td class="wb-host">${rate(module.hosting)}${PER_S}</td><td class="wb-buy">${module.action !== 'none' ? `<small>${whole(module.work)} ${L('раб.', 'work')}<br><span class="wb-cash">${money(module.cost)}</span></small>` : ''}${button(module.action, module.id, module.selected ? L('Выберите клетку', 'Pick a cell') : buildLabel(module.action), module.disabled || module.action === 'none')}</td></tr>`
  );
}

function needHtml(need: WorkbenchNeed): string {
  return `<li><div class="wb-need-title"><strong>${esc(need.title)}</strong><span>${whole(need.share)}% · ${whole(need.count)}</span></div><p>${esc(need.effect)}</p>${need.action === 'none' ? `<small>${L('Запрос выполнен', 'Request fulfilled')}</small>` : button(need.action, need.block, buildLabel(need.action), need.disabled)}</li>`;
}

function draftHtml(draft: WorkbenchDraft): string {
  return (
    `<section class="wb-draft-panel" role="dialog" aria-modal="true" aria-labelledby="wb-draft-title"><header><span class="wb-kicker">${L('Пауза · время не идёт', 'Paused · time is stopped')}</span><h2 id="wb-draft-title">${L(`Спринт ${draft.sprint}. Следующий ход`, `Sprint ${draft.sprint}. Your next move`)}</h2><p>${esc(draft.summary)}</p></header>` +
    `${draft.news ? `<div class="wb-draft-news"><strong>${esc(draft.news.title)}</strong><span>${esc(draft.news.text)}</span></div>` : ''}<div class="wb-draft-cards">${draft.cards
      .slice(0, 3)
      .map(
        (card, index) =>
          `<article class="wb-draft-card"><small class="wb-kicker">${L('Вариант', 'Option')} ${index + 1}</small><h3>${esc(card.title)}</h3><strong class="wb-impact">${esc(card.impact)}</strong><p>${esc(card.description)}</p><p class="wb-tradeoff">${esc(card.tradeoff)}</p><div class="wb-card-cost">${whole(card.work)} ${L('работы', 'work')} · <span>${money(card.cost)}</span></div>${button('choose-card', card.id, `<kbd>${index + 1}</kbd> ${L('Выбрать', 'Choose')}`)}</article>`,
      )
      .join(
        '',
      )}</div><footer>${L('Выберите одну карту. После выбора спринт продолжится.', 'Choose one card. The sprint continues after your choice.')}</footer></section>`
  );
}

export interface Workbench {
  readonly active: boolean;
  set(view: WorkbenchView | null): void;
}

/** The shelf owns only presentation state: selected tab, open backlog and input focus. */
export function createWorkbench(
  shop: HTMLElement,
  over: HTMLElement,
  send: (action: WorkbenchAction) => void,
): Workbench {
  const root = document.createElement('section');
  root.className = 'wb-main';
  root.hidden = true;
  root.innerHTML =
    `<nav class="wb-tabs" aria-label="${L('Рабочая полка', 'Workbench')}" role="tablist"><button type="button" role="tab" id="wb-tab-product" aria-controls="wb-product" data-wb-tab="product">${L('Продукт', 'Product')}</button><button type="button" role="tab" id="wb-tab-clients" aria-controls="wb-clients" data-wb-tab="clients">${L('Клиенты', 'Clients')}</button></nav>` +
    `<section class="wb-plan"><div class="wb-plan-title"><h2>${L('Очередь релиза', 'Release queue')}</h2><span class="wb-budget"></span></div><ol class="wb-tasks"></ol><details class="wb-backlog"><summary></summary><ol></ol></details></section>` +
    `<section id="wb-product" class="wb-product" role="tabpanel" aria-labelledby="wb-tab-product"><div class="wb-table-scroll"><table><thead><tr><th>${L('Блок', 'Block')}</th><th>${L('Свойство → улучшение', 'Effect → upgrade')}</th><th>${L('Хост', 'Host')}</th><th>${L('Проект', 'Project')}</th></tr></thead><tbody></tbody></table></div><div class="wb-infrastructure"></div></section>` +
    `<section id="wb-clients" class="wb-clients" role="tabpanel" aria-labelledby="wb-tab-clients" hidden><div class="wb-segment-tabs"></div><div class="wb-segment-pages"></div></section><aside class="wb-news" hidden></aside>`;
  shop.prepend(root);
  const clouds = document.createElement('div');
  clouds.className = 'wb-clouds';
  clouds.hidden = true;
  clouds.setAttribute('aria-label', L('Группы клиентов', 'Client segments'));
  const draft = document.createElement('div');
  draft.className = 'wb-draft';
  draft.hidden = true;
  over.append(clouds, draft);

  const find = <T extends HTMLElement = HTMLElement>(selector: string): T =>
    root.querySelector<T>(selector)!;
  const product = find('#wb-product');
  const clients = find('#wb-clients');
  const tasks = find('.wb-tasks');
  const backlog = find('.wb-backlog');
  const segments = find('.wb-segment-pages');
  const signatures = new WeakMap<HTMLElement, string>();
  let view: WorkbenchView | null = null;
  let tab: 'product' | 'clients' = 'product';
  let selected: SegmentId = 'small';
  let draftKey = '';
  let chosenDraft = false;
  let beforeDraft: HTMLElement | null = null;

  const text = (node: HTMLElement, value: string): void => {
    if (node.textContent !== value) node.textContent = value;
  };
  const html = (node: HTMLElement, value: string): void => {
    if (signatures.get(node) === value) return;
    signatures.set(node, value);
    const focused = document.activeElement as HTMLElement | null;
    const key = focused && node.contains(focused) ? focused.dataset.wbKey : undefined;
    node.innerHTML = value;
    if (key)
      [...node.querySelectorAll<HTMLElement>('[data-wb-key]')]
        .find((el) => el.dataset.wbKey === key)
        ?.focus({ preventScroll: true });
  };

  const switchTab = (): void => {
    product.hidden = tab !== 'product';
    clients.hidden = tab !== 'clients';
    root.querySelectorAll<HTMLButtonElement>('[data-wb-tab]').forEach((el) => {
      const on = el.dataset.wbTab === tab;
      el.setAttribute('aria-selected', String(on));
      el.tabIndex = on ? 0 : -1;
    });
    segments.querySelectorAll<HTMLElement>('[data-wb-page]').forEach((el) => {
      el.hidden = el.dataset.wbPage !== selected;
    });
    root
      .querySelectorAll<HTMLButtonElement>('.wb-segment-tabs button')
      .forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.wbId === selected)));
    clouds
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((el) =>
        el.setAttribute('aria-pressed', String(tab === 'clients' && el.dataset.wbId === selected)),
      );
  };

  const selectSegment = (id: SegmentId): void => {
    selected = id;
    tab = 'clients';
    switchTab();
    send({ type: 'select-segment', segment: id });
  };

  const chooseCard = (id: string): void => {
    if (!view?.draft || chosenDraft || !view.draft.cards.some((card) => card.id === id)) return;
    chosenDraft = true;
    draft.querySelectorAll<HTMLButtonElement>('button').forEach((el) => {
      el.disabled = true;
    });
    send({ type: 'choose-card', id });
  };

  const click = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target || target.disabled || !view) return;
    if (target.dataset.wbAction === 'choose-card') {
      chooseCard(target.dataset.wbId!);
      return;
    }
    if (view.draft) return;
    if (target.dataset.wbTab) {
      tab = target.dataset.wbTab as typeof tab;
      switchTab();
      return;
    }
    const id = target.dataset.wbId ?? '';
    switch (target.dataset.wbAction) {
      case 'place':
      case 'upgrade':
        send({ type: target.dataset.wbAction, block: id });
        break;
      case 'move':
        send({ type: 'move', task: id, direction: Number(target.dataset.wbDirection) as -1 | 1 });
        break;
      case 'defer':
      case 'resume':
        send({ type: target.dataset.wbAction, task: id });
        break;
      case 'select-segment':
        selectSegment(id as SegmentId);
        break;
      case 'confirm-price':
        send({ type: 'confirm-price', segment: id as SegmentId });
        break;
      case 'expand-infrastructure':
        send({ type: 'expand-infrastructure' });
        break;
    }
  };
  root.addEventListener('click', click);
  clouds.addEventListener('click', click);
  draft.addEventListener('click', click);
  root.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.matches('[data-wb-price]') || !view || view.draft || input.disabled) return;
    const value = Number(input.value);
    text(input.closest('.wb-price')!.querySelector('output')!, multiplier(value));
    send({ type: 'preview-price', segment: input.dataset.wbPrice as SegmentId, value });
  });
  // Editing a tariff or pressing a button must not also trigger the scene's build shortcuts.
  root.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).closest('button, input, summary')) event.stopPropagation();
  });
  root.querySelector('.wb-tabs')!.addEventListener('keydown', (event) => {
    const key = event as KeyboardEvent;
    if (view?.draft || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key.code)) return;
    key.preventDefault();
    key.stopPropagation();
    tab =
      key.code === 'Home'
        ? 'product'
        : key.code === 'End'
          ? 'clients'
          : tab === 'product'
            ? 'clients'
            : 'product';
    switchTab();
    root.querySelector<HTMLButtonElement>(`[data-wb-tab="${tab}"]`)?.focus();
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if (!view?.draft || over.style.visibility === 'hidden') return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      event.stopImmediatePropagation();
      const digit = /^(?:Digit|Numpad)([1-3])$/.exec(event.code);
      if (digit) {
        event.preventDefault();
        if (!event.repeat) {
          const card = view.draft.cards[Number(digit[1]) - 1];
          if (card) chooseCard(card.id);
        }
      } else if (event.code === 'Tab') {
        event.preventDefault();
        const buttons = [...draft.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      } else if (event.code === 'Escape') event.preventDefault();
    },
    true,
  );

  function updateSegment(segment: WorkbenchSegment): void {
    let page = segments.querySelector<HTMLElement>(`[data-wb-page="${segment.id}"]`);
    if (!page) {
      page = document.createElement('article');
      page.dataset.wbPage = segment.id;
      page.className = 'wb-segment';
      page.innerHTML = `<h3></h3><p class="wb-segment-numbers"></p><div class="wb-happiness"><span></span><meter min="0" max="100"></meter></div><p class="wb-reasons"></p><ul class="wb-needs"></ul><section class="wb-price"><label for="wb-price-${segment.id}">${L('Тариф сегмента', 'Segment tariff')}<output for="wb-price-${segment.id}"></output></label><input id="wb-price-${segment.id}" type="range" min="0.75" max="2.5" step="0.05" data-wb-price="${segment.id}"><small class="wb-current-price"></small><p class="wb-forecast" role="status"></p>${button('confirm-price', segment.id, L('На следующий релиз', 'Apply next release'))}</section>`;
      segments.append(page);
    }
    text(page.querySelector('h3')!, segment.title);
    text(
      page.querySelector('.wb-segment-numbers')!,
      L(
        `${whole(segment.count)} компаний · ${whole(segment.leads)} лидов · рынок ${whole(segment.market)}`,
        `${whole(segment.count)} companies · ${whole(segment.leads)} leads · market ${whole(segment.market)}`,
      ),
    );
    text(
      page.querySelector('.wb-happiness span')!,
      L(
        `Удовлетворённость ${whole(segment.happiness)}%`,
        `Satisfaction ${whole(segment.happiness)}%`,
      ),
    );
    const meter = page.querySelector('meter')!;
    meter.value = segment.happiness;
    meter.setAttribute('aria-label', L('Удовлетворённость', 'Satisfaction'));
    text(page.querySelector('.wb-reasons')!, segment.reasons.join(' · '));
    html(
      page.querySelector('.wb-needs')!,
      segment.needs.length
        ? segment.needs.map(needHtml).join('')
        : `<li>${L('Новых запросов пока нет.', 'No new requests yet.')}</li>`,
    );
    const input = page.querySelector('input')!;
    input.disabled = Boolean(view?.draft || segment.pricePending || segment.priceDisabled);
    // Keep this exact input node and its local value while the player drags or uses arrow keys.
    if (document.activeElement !== input) input.value = String(segment.previewPrice);
    text(page.querySelector('output')!, multiplier(Number(input.value)));
    text(
      page.querySelector('.wb-current-price')!,
      `${L('Сейчас', 'Current')}: ${multiplier(segment.price)}${segment.priceLabel ? ` · ${segment.priceLabel}` : ''}`,
    );
    text(page.querySelector('.wb-forecast')!, segment.forecast);
    const confirm = page.querySelector<HTMLButtonElement>('[data-wb-action="confirm-price"]')!;
    confirm.disabled = Boolean(
      view?.draft ||
      segment.pricePending ||
      segment.priceDisabled ||
      Math.abs(segment.previewPrice - segment.price) < 0.001,
    );
    text(
      confirm,
      segment.pricePending
        ? L('Назначено на релиз', 'Scheduled for release')
        : L('На следующий релиз', 'Apply next release'),
    );
  }

  return {
    get active() {
      return view !== null;
    },
    set(next) {
      view = next;
      root.hidden = !view;
      clouds.hidden = !view;
      shop.classList.toggle('wb-enabled', Boolean(view));
      root.inert = Boolean(view?.draft);
      clouds.inert = Boolean(view?.draft);
      if (!view) {
        draft.hidden = true;
        draftKey = '';
        chosenDraft = false;
        return;
      }
      if (view.selectedSegment) selected = view.selectedSegment;
      text(
        find('.wb-budget'),
        `${L('План', 'Planned')} ${whole(view.budget.planned)} / ${whole(view.budget.capacity)}`,
      );
      const queued = view.tasks.filter((task) => task.status !== 'backlog');
      const deferred = view.tasks.filter((task) => task.status === 'backlog');
      html(
        tasks,
        queued.length
          ? queued.map(taskHtml).join('')
          : `<li class="wb-empty">${L('Выберите улучшение или поставьте новый блок.', 'Choose an upgrade or place a new block.')}</li>`,
      );
      text(
        backlog.querySelector('summary')!,
        `${L('Бэклог · на потом', 'Backlog · later')} (${deferred.length})`,
      );
      html(
        backlog.querySelector('ol')!,
        deferred.length
          ? deferred.map(taskHtml).join('')
          : `<li class="wb-empty">${L('Отложенные задачи не занимают план спринта.', 'Deferred tasks do not take up the sprint plan.')}</li>`,
      );
      html(find('tbody'), view.modules.map(moduleHtml).join(''));
      html(
        find('.wb-infrastructure'),
        view.infrastructure
          ? `<p>${esc(view.infrastructure.detail)}</p>${button('expand-infrastructure', '', esc(view.infrastructure.label), Boolean(view.infrastructure.disabled))}`
          : '',
      );
      html(
        find('.wb-segment-tabs'),
        view.segments
          .map((segment) => button('select-segment', segment.id, esc(segment.title)))
          .join(''),
      );
      for (const segment of view.segments) updateSegment(segment);
      html(
        clouds,
        view.segments
          .map(
            (segment) =>
              `<button type="button" class="wb-cloud" data-wb-action="select-segment" data-wb-id="${segment.id}" data-wb-key="cloud:${segment.id}" aria-label="${esc(`${segment.title}: ${whole(segment.count)}, ${L('удовлетворённость', 'satisfaction')} ${whole(segment.happiness)}%`)}"><span class="wb-cloud-head"><i aria-hidden="true"></i><span>${esc(segment.title)}</span></span><strong>${whole(segment.count)}</strong><span class="wb-cloud-foot"><span>${whole(segment.happiness)}% ${L('довольны', 'satisfied')}</span><span>${signed(segment.delta)}${L('/спр.', '/sprint')}</span></span></button>`,
          )
          .join(''),
      );
      const news = find('.wb-news');
      news.hidden = !view.news;
      if (view.news)
        html(news, `<strong>${esc(view.news.title)}</strong><span>${esc(view.news.text)}</span>`);
      switchTab();
      draft.hidden = !view.draft;
      const key = view.draft
        ? `${view.draft.sprint}:${view.draft.cards.map((card) => card.id).join(',')}`
        : '';
      if (key !== draftKey) {
        const wasDraft = draftKey !== '';
        draftKey = key;
        chosenDraft = false;
        if (view.draft) {
          if (!wasDraft) beforeDraft = document.activeElement as HTMLElement | null;
          html(draft, draftHtml(view.draft));
          draft.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
        } else if (beforeDraft?.isConnected) beforeDraft.focus({ preventScroll: true });
      }
    },
  };
}
