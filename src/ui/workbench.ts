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
  readonly shortTitle?: string;
  readonly level: number;
  readonly current: string;
  readonly next: string;
  readonly work: number;
  readonly cost: number;
  /** Hosting in dollars per second, matching the game's ledger. */
  readonly hosting: number;
  readonly nextHosting?: number;
  readonly demand: string;
  readonly action: WorkbenchBuildAction;
  readonly actionLabel?: string;
  readonly disabled: boolean;
  readonly selected: boolean;
  readonly specialization?: string;
  readonly links?: readonly string[];
  readonly canDemolish?: boolean;
}

export interface WorkbenchNeed {
  readonly block: string;
  readonly title: string;
  readonly count: number;
  readonly share: number;
  readonly effect: string;
  readonly action: WorkbenchBuildAction;
  readonly actionLabel?: string;
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
  readonly contracts?: readonly { readonly title: string; readonly detail: string }[];
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
    readonly load?: number;
    readonly capacity?: number;
    readonly nextCapacity?: number;
    readonly utilization?: number;
    readonly cost?: number;
    readonly work?: number;
    readonly progress?: number;
    readonly level?: number;
    readonly status?: 'queued' | 'active' | 'ready' | 'backlog';
    readonly taskId?: string;
  };
  readonly clientAnchor?: { readonly x: number; readonly y: number };
  readonly selectedSegment?: SegmentId;
  readonly panel?: 'module' | 'clients' | null;
  readonly selectedModule?: string;
  readonly perks?: readonly {
    readonly id: string;
    readonly title: string;
    readonly impact: string;
  }[];
  readonly applied?: { readonly title: string; readonly impact: string } | null;
}

export type WorkbenchAction =
  | { type: 'place' | 'upgrade' | 'demolish' | 'inspect-module'; block: string }
  | { type: 'close-panel' }
  | { type: 'move'; task: string; direction: -1 | 1 }
  | { type: 'defer' | 'resume'; task: string }
  | { type: 'choose-card'; id: string }
  | { type: 'preview-price'; segment: SegmentId; value: number }
  | { type: 'confirm-price'; segment: SegmentId }
  | { type: 'expand-infrastructure' }
  | { type: 'cancel-task'; task: string }
  | { type: 'select-segment'; segment: SegmentId };

const esc = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const multiplier = (value: number): string => '×' + dec(Number(value.toFixed(2)));
const signed = (value: number): string =>
  (value > 0 ? '+' : value < 0 ? '−' : '') + whole(Math.abs(value));
const primary = (value: string): string =>
  value.replace(/^(?:v\d+:|Сразу:|Immediately:)\s*/, '').split(' · ')[0];
const buildLabel = (action: WorkbenchBuildAction): string =>
  ({
    place: L('Разместить', 'Place'),
    upgrade: L('Улучшить', 'Upgrade'),
    none: L('Выпущено', 'Shipped'),
  })[action];

function button(
  action: string,
  id: string,
  label: string,
  off = false,
  cls = '',
  tip = '',
): string {
  return (
    '<button type="button" class="' +
    cls +
    '" data-wb-action="' +
    action +
    '" data-wb-id="' +
    esc(id) +
    '" data-wb-key="' +
    action +
    ':' +
    esc(id) +
    ':' +
    cls +
    '"' +
    (tip ? ' title="' + esc(tip) + '"' : '') +
    (off ? ' disabled' : '') +
    '>' +
    label +
    '</button>'
  );
}

function moduleCard(module: WorkbenchModule): string {
  const title =
    esc(module.shortTitle ?? module.title) + (module.level ? ` v${module.level + 1}` : '');
  const effect = esc(
    primary(module.next || module.current).replace('мест именных договоров', 'договоры'),
  );
  const tip = [
    module.title,
    primary(module.next || module.current),
    module.demand,
    `${money(module.cost)} · ${whole(module.work)} ${L('работы', 'work')}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    `<article class="wb-build${module.selected ? ' wb-selected' : ''}">` +
    button(
      module.action,
      module.id,
      `<strong>${title}</strong><span class="wb-build-work" aria-label="${whole(module.work)} ${L('работы', 'work')}"><i aria-hidden="true"></i>${whole(module.work)}</span>` +
        `<span class="wb-build-effect${module.selected ? ' wb-picked-hint' : ''}">${module.selected ? L('кликни клетку на чертеже', 'click a cell on the blueprint') : effect}</span>` +
        `<span class="wb-build-price">${money(module.cost)}</span>`,
      module.disabled,
      'wb-build-main',
      tip,
    ) +
    button(
      'inspect-module',
      module.id,
      '<span aria-hidden="true">i</span><span class="wb-sr-only">' +
        L('Подробности: ', 'Details: ') +
        title +
        '</span>',
      false,
      'wb-build-info',
    ) +
    '</article>'
  );
}

function moduleDetail(module: WorkbenchModule): string {
  const action =
    module.action !== 'none'
      ? '<div class="wb-module-buy"><p><span class="wb-cash">' +
        money(module.cost) +
        '</span> · ' +
        whole(module.work) +
        ' ' +
        L('работы', 'work') +
        '</p>' +
        button(
          module.action,
          module.id,
          esc(
            module.selected
              ? L('Выбери клетку на карте', 'Pick a cell on the map')
              : (module.actionLabel ?? buildLabel(module.action)),
          ),
          module.disabled,
          'wb-primary',
        ) +
        '</div>'
      : '<p class="wb-muted">' +
        esc(module.actionLabel ?? L('Максимальный уровень', 'Maximum level')) +
        '</p>';
  return (
    '<h2>' +
    esc(module.title) +
    '</h2>' +
    '<section class="wb-module-effect"><h3>' +
    (module.level
      ? L('Сейчас · v', 'Current · v') + module.level
      : L('Новая постройка', 'New building')) +
    '</h3><p>' +
    esc(module.current) +
    '</p></section>' +
    (module.next
      ? '<section class="wb-module-effect wb-next"><h3>' +
        L('После выпуска', 'After release') +
        '</h3><p>' +
        esc(module.next) +
        '</p></section>'
      : '') +
    action +
    (module.demand
      ? '<p class="wb-demand">' + L('Нужно клиентам: ', 'Wanted by: ') + esc(module.demand) + '</p>'
      : '') +
    '<p class="wb-host">' +
    L('Хостинг ', 'Hosting ') +
    rate(module.hosting) +
    PER_S +
    (module.nextHosting !== undefined ? ' → ' + rate(module.nextHosting) + PER_S : '') +
    '</p>' +
    (module.links?.length
      ? '<section class="wb-module-links"><h3>' +
        L('Соседи и связи', 'Neighbours and links') +
        '</h3><ul>' +
        module.links.map((link) => '<li>' + esc(link) + '</li>').join('') +
        '</ul></section>'
      : '') +
    (module.canDemolish
      ? button(
          'demolish',
          module.id,
          L('Разобрать здание…', 'Demolish building…'),
          false,
          'wb-text-button wb-demolish',
        )
      : '')
  );
}

function infrastructureCard(infra: NonNullable<WorkbenchView['infrastructure']>): string {
  const utilization = Math.max(0, infra.utilization ?? 0);
  const percent = Math.round(utilization * 100);
  const state = utilization > 1 ? 'overloaded' : utilization >= 0.8 ? 'busy' : 'spare';
  const stateText =
    utilization > 1
      ? L('Перегруз · клиенты уходят', 'Overloaded · clients leave')
      : utilization >= 0.8
        ? L('Почти заполнено', 'Nearly full')
        : L('Есть запас', 'Room to grow');
  const status =
    infra.status === 'ready'
      ? L('Готово · включится на релизе', 'Ready · goes live at release')
      : infra.status === 'active'
        ? L(
            `Строится · ${Math.round((infra.progress ?? 0) * 100)}%`,
            `Building · ${Math.round((infra.progress ?? 0) * 100)}%`,
          )
        : infra.status === 'queued'
          ? L('В очереди на стройку', 'Waiting for construction')
          : infra.status === 'backlog'
            ? L('Отложено', 'Deferred')
            : '';
  const effect =
    infra.nextCapacity !== undefined
      ? L(
          `Мощность ${whole(infra.capacity ?? 0)} → ${whole(infra.nextCapacity)}`,
          `Capacity ${whole(infra.capacity ?? 0)} → ${whole(infra.nextCapacity)}`,
        )
      : L('Больше клиентов без перегруза', 'More clients without overload');
  return (
    `<article class="wb-build wb-infrastructure-card wb-load-${state}">` +
    '<div class="wb-capacity" role="img" aria-label="' +
    esc(
      L(
        `Загрузка инфраструктуры ${percent}%. ${stateText}`,
        `Infrastructure load ${percent}%. ${stateText}`,
      ),
    ) +
    '">' +
    '<div><span>' +
    L('ЗАГРУЗКА', 'LOAD') +
    `</span><b>${percent}%</b></div>` +
    `<div class="wb-capacity-track"><i style="width:${Math.min(100, percent)}%"></i></div>` +
    `<span class="wb-capacity-numbers">${whole(infra.load ?? 0)} / ${whole(infra.capacity ?? 0)}</span>` +
    '<span class="wb-capacity-state">' +
    stateText +
    '</span></div>' +
    button(
      'expand-infrastructure',
      '',
      '<strong>' +
        L('Инфраструктура', 'Infrastructure') +
        ` v${(infra.level ?? 0) + 1}</strong>` +
        `<span class="wb-build-work"><i aria-hidden="true"></i>${whole(infra.work ?? 0)}</span>` +
        '<span class="wb-build-effect">' +
        esc(status || effect) +
        '</span>' +
        '<span class="wb-build-price">' +
        (infra.cost === undefined ? esc(infra.label) : money(infra.cost)) +
        '</span>',
      infra.disabled,
      'wb-build-main wb-infrastructure-buy',
      infra.detail,
    ) +
    (infra.taskId
      ? '<div class="wb-infrastructure-progress">' +
        `<progress max="1" value="${infra.progress ?? 0}" aria-label="${esc(status)}"></progress>` +
        button('cancel-task', infra.taskId, L('Отменить', 'Cancel'), false, 'wb-text-button') +
        '</div>'
      : '') +
    '</article>'
  );
}

function needHtml(need: WorkbenchNeed): string {
  return (
    '<li><div class="wb-need-title">' +
    button('inspect-module', need.block, esc(need.title), false, 'wb-text-button') +
    '<span>' +
    whole(need.share) +
    '% · ' +
    whole(need.count) +
    '</span></div>' +
    '<p>' +
    esc(need.effect) +
    '</p>' +
    (need.action === 'none'
      ? ''
      : button(
          need.action,
          need.block,
          esc(need.actionLabel ?? buildLabel(need.action)),
          need.disabled,
        )) +
    '</li>'
  );
}

export interface Workbench {
  readonly active: boolean;
  set(view: WorkbenchView | null): void;
}

/** The scene owns which detail is open. Input nodes survive simulation updates. */
export function createWorkbench(
  shop: HTMLElement,
  over: HTMLElement,
  send: (action: WorkbenchAction) => void,
): Workbench {
  const root = document.createElement('section');
  root.className = 'wb-main';
  root.hidden = true;
  const back = button('close-panel', '', '← ' + L('Блоки', 'Blocks'), false, 'wb-back');
  root.innerHTML =
    '<section class="wb-catalog"><header><h2 tabindex="-1">' +
    L('БЛОКИ', 'BLOCKS') +
    '</h2></header>' +
    '<div class="wb-builds"></div></section>' +
    '<section class="wb-detail wb-module-panel" aria-label="' +
    L('Постройка', 'Building') +
    '" hidden>' +
    '<header>' +
    back +
    '</header><div class="wb-panel-scroll wb-module-content"></div></section>';
  shop.prepend(root);
  const clientPanel = document.createElement('section');
  clientPanel.className = 'wb-main wb-client-panel wb-client-popup';
  clientPanel.hidden = true;
  clientPanel.setAttribute('role', 'dialog');
  clientPanel.setAttribute('aria-modal', 'false');
  clientPanel.setAttribute('aria-labelledby', 'wb-client-title');
  clientPanel.innerHTML =
    '<header><h2 id="wb-client-title"></h2>' +
    button(
      'close-panel',
      '',
      '<span aria-hidden="true">×</span><span class="wb-sr-only">' +
        L('Закрыть сведения о клиентах', 'Close client details') +
        '</span>',
      false,
      'wb-back wb-client-close',
    ) +
    '</header><div class="wb-panel-scroll wb-client-content"><p class="wb-client-count"></p>' +
    '<div class="wb-happiness"><span></span><meter min="0" max="100"></meter></div>' +
    '<section class="wb-client-needs"><h3>' +
    L('Что им нужно', 'What they need') +
    '</h3><ul class="wb-needs"></ul></section>' +
    '<section class="wb-price"><label for="wb-price">' +
    L('Тариф', 'Tariff') +
    '<output for="wb-price"></output></label>' +
    '<input id="wb-price" type="range" min="0.75" max="2.5" step="0.05" data-wb-price="small">' +
    '<p class="wb-current-price"></p><p class="wb-forecast" role="status"></p>' +
    button(
      'confirm-price',
      'small',
      L('На следующий релиз', 'Apply next release'),
      false,
      'wb-primary',
    ) +
    '</section>' +
    '<section class="wb-contracts"><h3>' +
    L('Именные договоры', 'Named contracts') +
    '</h3><p>' +
    L(
      'Их фиксированные тарифы считаются отдельно. Ползунок выше на них не влияет.',
      'Their fixed tariffs are counted separately. The slider above does not affect them.',
    ) +
    '</p><ul></ul></section>' +
    '<p class="wb-market-numbers"></p><p class="wb-reasons"></p></div>';
  over.append(clientPanel);

  const find = <T extends HTMLElement = HTMLElement>(selector: string): T =>
    (root.querySelector<T>(selector) ?? clientPanel.querySelector<T>(selector))!;
  const catalog = find('.wb-catalog');
  const modulePanel = find('.wb-module-panel');
  const client = find('.wb-client-content');
  const signatures = new WeakMap<HTMLElement, string>();
  let view: WorkbenchView | null = null;
  let panelKey = '';
  let clientId: SegmentId | null = null;
  let beforePanel: HTMLElement | null = null;

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
  const click = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target || target.disabled || !view) return;
    const action = target.dataset.wbAction;
    const id = target.dataset.wbId ?? '';
    if (view.draft) return;
    switch (action) {
      case 'place':
      case 'upgrade':
      case 'demolish':
      case 'inspect-module':
        send({ type: action, block: id });
        break;
      case 'close-panel':
        send({ type: 'close-panel' });
        break;
      case 'confirm-price':
        send({ type: 'confirm-price', segment: id as SegmentId });
        break;
      case 'expand-infrastructure':
        send({ type: 'expand-infrastructure' });
        break;
      case 'cancel-task':
        send({ type: 'cancel-task', task: id });
        break;
    }
  };
  root.addEventListener('click', click);
  clientPanel.addEventListener('click', click);
  clientPanel.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.matches('[data-wb-price]') || !view || view.draft || input.disabled) return;
    const value = Number(input.value);
    text(find('.wb-price output'), multiplier(value));
    send({ type: 'preview-price', segment: input.dataset.wbPrice as SegmentId, value });
  });
  root.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).closest('button, input, summary')) event.stopPropagation();
  });
  clientPanel.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).closest('button, input')) event.stopPropagation();
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if (
        !view ||
        over.style.visibility === 'hidden' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (!view.draft && view.panel && event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        send({ type: 'close-panel' });
      }
    },
    true,
  );

  function updateSegment(segment: WorkbenchSegment): void {
    const changed = clientId !== segment.id;
    clientId = segment.id;
    if (changed) client.scrollTop = 0;
    text(clientPanel.querySelector('h2')!, segment.title);
    text(
      find('.wb-client-count'),
      L(
        whole(segment.count) + ' компаний · ' + signed(segment.delta) + ' за спринт',
        whole(segment.count) + ' companies · ' + signed(segment.delta) + ' this sprint',
      ),
    );
    text(
      find('.wb-happiness span'),
      L('Довольство ', 'Satisfaction ') + whole(segment.happiness) + '/100',
    );
    const meter = find<HTMLMeterElement>('.wb-happiness meter');
    meter.value = segment.happiness;
    meter.setAttribute('aria-label', L('Удовлетворённость', 'Satisfaction'));
    text(
      find('.wb-market-numbers'),
      L(
        whole(segment.leads) + ' лидов · доступный рынок ' + whole(segment.market),
        whole(segment.leads) + ' leads · reachable market ' + whole(segment.market),
      ),
    );
    text(find('.wb-reasons'), segment.reasons.join(' · '));
    html(
      find('.wb-needs'),
      segment.needs.length
        ? segment.needs.map(needHtml).join('')
        : '<li>' + L('Новых запросов пока нет.', 'No new requests yet.') + '</li>',
    );
    const contracts = find('.wb-contracts');
    contracts.hidden = !segment.contracts?.length;
    html(
      contracts.querySelector('ul')!,
      (segment.contracts ?? [])
        .map(
          (contract) =>
            '<li><strong>' +
            esc(contract.title) +
            '</strong><p>' +
            esc(contract.detail) +
            '</p></li>',
        )
        .join(''),
    );
    const input = find<HTMLInputElement>('.wb-price input');
    input.dataset.wbPrice = segment.id;
    input.disabled = Boolean(view?.draft || segment.pricePending || segment.priceDisabled);
    // The same native slider keeps pointer capture and focus while its forecast changes.
    if (changed || document.activeElement !== input) input.value = String(segment.previewPrice);
    text(find('.wb-price output'), multiplier(Number(input.value)));
    text(
      find('.wb-current-price'),
      L('Сейчас ', 'Current ') +
        multiplier(segment.price) +
        (segment.priceLabel ? ' · ' + segment.priceLabel : ''),
    );
    text(find('.wb-forecast'), segment.forecast);
    const confirm = find<HTMLButtonElement>('[data-wb-action="confirm-price"]');
    confirm.dataset.wbId = segment.id;
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

  function positionClients(): void {
    const anchor = view?.clientAnchor ?? { x: 1110, y: 910 };
    const left = Math.min(
      1320 - clientPanel.offsetWidth,
      Math.max(20, anchor.x - clientPanel.offsetWidth / 2),
    );
    const top = Math.min(
      1004 - clientPanel.offsetHeight,
      Math.max(272, anchor.y - clientPanel.offsetHeight - 20),
    );
    clientPanel.style.left = `${left}px`;
    clientPanel.style.top = `${top}px`;
    clientPanel.style.setProperty(
      '--client-pointer-x',
      `${Math.max(24, Math.min(clientPanel.offsetWidth - 24, anchor.x - left))}px`,
    );
  }

  return {
    get active() {
      return view !== null;
    },
    set(next) {
      view = next;
      root.hidden = !view;
      root.inert = Boolean(view?.draft);
      clientPanel.inert = Boolean(view?.draft);
      shop.classList.toggle('wb-enabled', Boolean(view));
      if (!view) {
        clientPanel.hidden = true;
        panelKey = '';
        return;
      }
      const panel = view.panel ?? null;
      root.classList.toggle('wb-context', panel === 'module');
      catalog.hidden = panel === 'module';
      modulePanel.hidden = panel !== 'module';
      clientPanel.hidden = panel !== 'clients' || Boolean(view.draft);
      if (!view.draft) {
        const builds = view.modules
          .filter((module) => module.action === 'place' && !module.disabled)
          .sort((a, b) => Number(Boolean(b.demand)) - Number(Boolean(a.demand)));
        const upgrades = view.modules.filter(
          (module) => module.action === 'upgrade' && !module.disabled,
        );
        const requested = upgrades.filter((module) => module.demand);
        const available = [
          ...(requested.length ? requested : builds.length ? [] : upgrades),
          ...builds,
        ];
        html(
          find('.wb-builds'),
          (view.infrastructure ? infrastructureCard(view.infrastructure) : '') +
            (available.length
              ? available.map(moduleCard).join('')
              : '<p class="wb-empty">' +
                L(
                  'Всё доступное уже на чертеже.<br>Кликни здание, чтобы улучшить его.',
                  'Everything available is on the blueprint.<br>Click a building to improve it.',
                ) +
                '</p>'),
        );
      }
      if (panel === 'module') {
        const module = view.modules.find((entry) => entry.id === view?.selectedModule);
        html(
          find('.wb-module-content'),
          module
            ? moduleDetail(module)
            : '<p class="wb-empty">' +
                L('Выбери здание на карте.', 'Choose a building on the map.') +
                '</p>',
        );
      }
      const segment =
        view.segments.find((entry) => entry.id === view?.selectedSegment) ?? view.segments[0];
      if (panel === 'clients' && segment) {
        updateSegment(segment);
        positionClients();
      }
      const nextPanelKey =
        panel === 'module'
          ? 'module:' + (view.selectedModule ?? '')
          : panel === 'clients'
            ? 'clients:' + (segment?.id ?? '')
            : '';
      if (panelKey !== nextPanelKey) {
        if (nextPanelKey && !panelKey) beforePanel = document.activeElement as HTMLElement | null;
        if (!view.draft) {
          if (nextPanelKey)
            (panel === 'module' ? modulePanel : clientPanel)
              .querySelector<HTMLButtonElement>('.wb-back')
              ?.focus({ preventScroll: true });
          else if (beforePanel?.isConnected) beforePanel.focus({ preventScroll: true });
          else catalog.querySelector('h2')?.focus({ preventScroll: true });
        }
        if (panel === 'module') find('.wb-module-content').scrollTop = 0;
        panelKey = nextPanelKey;
      }
    },
  };
}
