import './workbench.css';
import { L } from '../core/lang';
import { BUILD_CATEGORIES, CATEGORY_TITLE, type BuildCategory } from '../content/build-categories';
import type { BuildReason } from './build-reasons';
import { canConfirmPrice, capacityIndicator, catalogModules, landShortfall } from './workbench-view';
import { clientPanelPosition } from './map-geometry-view';
import { dec, money, multiplier, PER_S, primary, rate, signed, whole } from './format';

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
  readonly canHelp?: boolean;
  readonly position?: number;
  readonly canMoveDown: boolean;
  readonly canDefer: boolean;
  readonly canResume?: boolean;
}

export interface WorkbenchModule {
  readonly id: string;
  readonly category: BuildCategory;
  readonly reason?: BuildReason;
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
  readonly needsLand?: boolean;
  readonly specialization?: string;
  readonly links?: readonly string[];
  readonly canDemolish?: boolean;
  readonly taskId?: string;
  readonly api?: { cost: number; affordable: boolean };
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
  readonly marketIncome: number;
  readonly contractIncome: number;
  /** Current and proposed absolute tariff multipliers, not a percentage change. */
  readonly price: number;
  readonly previewPrice: number;
  readonly forecast: string;
  readonly needs: readonly WorkbenchNeed[];
  readonly reasons: readonly string[];
  readonly pricePending?: boolean;
  readonly priceDisabled?: boolean;
  readonly priceLabel?: string;
  readonly contracts?: readonly {
    readonly title: string;
    readonly detail: string;
    readonly status?: string;
    readonly button?: {
      readonly block: string;
      readonly action: WorkbenchBuildAction | 'inspect-module';
      readonly label: string;
      readonly disabled: boolean;
    };
  }[];
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
  readonly office: { cells: number; used: number; gain: number; totalCells: number; slots: number; maxSlots: number; landCost: number | null; deskCost: number | null; money: number };
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
    readonly task?: WorkbenchTask;
    readonly helpDisabled?: boolean;
    readonly api?: { cost: number; affordable: boolean };
  };
  readonly clientAnchor?: { readonly x: number; readonly y: number };
  readonly selectedSegment?: SegmentId;
  readonly panel?: 'module' | 'clients' | 'agent' | null;
  readonly agent?: { id: number; title: string; description: string; lane: string; rate: number; topRate: number; fixRate: number; debt: number; salary: number; tariff: number; working: boolean; reviewed: boolean };
  readonly selectedModule?: string;
  readonly perks?: readonly {
    readonly id: string;
    readonly title: string;
    readonly impact: string;
  }[];
  readonly applied?: { readonly title: string; readonly impact: string } | null;
}

export type WorkbenchAction =
  | { type: 'expand-office'; kind: 'land' | 'desks' }
  | { type: 'place' | 'upgrade' | 'demolish' | 'inspect-module'; block: string }
  | { type: 'close-panel' }
  | { type: 'move'; task: string; direction: -1 | 1 }
  | { type: 'defer' | 'resume'; task: string }
  | { type: 'choose-card'; id: string }
  | { type: 'preview-price'; segment: SegmentId; value: number }
  | { type: 'confirm-price'; segment: SegmentId }
  | { type: 'expand-infrastructure' }
  | { type: 'cancel-task' | 'rush-task' | 'help-task'; task: string }
  | { type: 'select-segment'; segment: SegmentId };

const esc = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

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
    `${whole(module.work)} ${L('работы', 'work')} · ${L('хостинг', 'hosting')} ${rate(module.nextHosting ?? module.hosting)}${PER_S}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    `<article class="wb-build wb-category-${module.category}${module.selected ? ' wb-selected' : ''}">` +
    button(
      module.action,
      module.id,
      `<strong>${title}</strong><span class="wb-build-work" aria-label="${whole(module.work)} ${L('работы', 'work')}"><i aria-hidden="true"></i>${whole(module.work)}</span>` +
        `<span class="wb-build-effect${module.selected ? ' wb-picked-hint' : ''}">${module.selected ? L('кликни клетку на чертеже', 'click a cell on the blueprint') : module.disabled && module.actionLabel ? esc(module.actionLabel) : effect}</span>` +
        (module.reason ? `<span class="wb-build-reason wb-reason-${module.reason.tone}" title="${esc(module.reason.detail)}">${esc(module.reason.label)}</span>` : ''),
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

function plotControl(office: WorkbenchView['office']): string {
  const usage = L(`Занято клеток: ${office.used}/${office.cells}`, `Building cells: ${office.used}/${office.cells} used`);
  if (office.landCost === null) return '<span>' + usage + ' · ' + L('Предел участка', 'Plot limit reached') + '</span>';
  const shortfall = landShortfall(office.landCost, office.money);
  return '<span>' + usage + (shortfall ? ' · ' + L('Не хватает ', 'Short by ') + money(shortfall) : '') + '</span>' +
    button('expand-office', 'land', L('Расширить участок', 'Expand plot') + ' · ' + money(office.landCost) +
      L(` · +${office.gain} кл.`, ` · +${office.gain} cells`), shortfall > 0, 'wb-plot-button');
}

function moduleDetail(module: WorkbenchModule, task?: WorkbenchTask): string {
  const action =
    module.action !== 'none'
      ? '<div class="wb-module-buy"><p>' +
        whole(module.work) +
        ' ' +
        L('работы', 'work') +
        '</p><small>' + L('Работа команды · зарплата во время стройки · хостинг после выпуска', 'Team work · wages while building · hosting after release') + '</small>' +
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
    (task ? '<section class="wb-task-controls"><h3>' + esc(module.actionLabel ?? '') +
      (task.position ? ' · №' + task.position : '') + ' · ' + task.done + '/' + task.work + '</h3>' +
      (task.status === 'queued' ? button('move-up', task.id, L('↑ Раньше', '↑ Earlier'), !task.canMoveUp) +
        button('move-down', task.id, L('↓ Позже', '↓ Later'), !task.canMoveDown) : '') +
      (task.status === 'active' || task.status === 'queued' ? button('help-task', task.id, L('Помочь · 1 сила', 'Help · 1 energy'), !task.canHelp) : '') +
      (task.canResume ? button('resume', task.id, L('Продолжить', 'Resume')) : '') +
      button('cancel-task', task.id, L('Отменить работу', 'Cancel work')) + '</section>' : action) +
    (module.taskId && module.api ? '<div class="wb-api-option">' +
      button('rush-task', module.taskId, L('Строители ×2', 'Builders ×2') + ' · ' + money(module.api.cost), !module.api.affordable, 'wb-api-button', L('Дополнительные вычисления ускоряют назначенных строителей. Нужен агент на стройке; здание включится на релизе.', 'Extra compute speeds up assigned builders. Requires a builder; activates at release.')) +
      '<small>' + L('Дополнительные вычисления · нужен строитель · выпуск на релизе', 'Extra compute · requires a builder · ships at release') + '</small></div>' : '') +
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

function agentDetail(agent: NonNullable<WorkbenchView['agent']>): string {
  const speed = dec(Number(agent.rate.toFixed(2)));
  const bar = (value: number, max: number) => `<div class="wb-agent-meter"><i style="width:${Math.max(0, Math.min(100, value / max * 100))}%"></i></div>`;
  return `<h2>${esc(agent.title)} · №${agent.id}</h2><p>${esc(agent.description)}</p>` +
    `<section class="wb-agent-stat"><h3>${L('Скорость сейчас', 'Current speed')} <b>${speed} ${L('работы/с', 'work/s')}</b></h3>${bar(agent.rate, agent.topRate)}<small>${agent.working ? esc(agent.lane) : L('Простой · ждёт задачу', 'Idle · waiting for work')} · ${L(`1 работа за ${dec(Number((1 / agent.rate).toFixed(1)))} с`, `1 work every ${dec(Number((1 / agent.rate).toFixed(1)))} s`)}</small></section>` +
    `<section class="wb-agent-stat"><h3>${L('Починка', 'Fixes')} <b>−${dec(Number(agent.fixRate.toFixed(2)))} ${L('долга/с', 'debt/s')}</b></h3>${bar(agent.fixRate, agent.topRate * 3)}<small>${L('Если назначить на починку', 'When assigned to fixes')}</small></section>` +
    `<section class="wb-agent-stat"><h3>${L('Баги при стройке', 'Construction debt')} <b>${agent.debt ? '+' + dec(Number(agent.debt.toFixed(2))) : '0'}</b></h3><small>${L('долга за единицу работы · с учётом проверки и перков', 'debt per work · includes review and perks')}</small></section>` +
    `<p class="wb-agent-pay">${L('Сейчас', 'Now')}: ${rate(agent.salary)}${PER_S} · ${L('тариф', 'rate')}: ${rate(agent.tariff)}${PER_S}</p>` +
    `<p class="wb-muted">${agent.reviewed ? L('Ты проверяешь это направление: скорость +25%, новый долг −50%.', 'You review this lane: +25% speed, −50% new debt.') : L('Проверка этого направления даст +25% скорости и −50% нового долга.', 'Reviewing this lane gives +25% speed and −50% new debt.')}</p>` +
    `<p class="wb-muted">${L('Техдолг замедляет стройку. На простое зарплата не списывается.', 'Debt slows construction. Idle agents cost nothing.')}</p>`;
}

function infrastructureCard(infra: NonNullable<WorkbenchView['infrastructure']>): string {
  const { percent, state, stateText } = capacityIndicator(infra.utilization);
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
        (infra.api ? button('rush-task', infra.taskId, L('Строители ×2', 'Builders ×2') + ' · ' + money(infra.api.cost), !infra.api.affordable, 'wb-api-button', L('Ускорить работу агентов. Стройка и выпуск остаются обязательными.', 'Speed up agents. Construction and release are still required.')) : '') +
        '</div>'
      : '') +
    (infra.task ? '<div class="wb-infrastructure-actions">' +
      '<small>' + esc(infra.task.detail) + '</small>' +
      (infra.status === 'active' ? '<small>' + L('Работа уже начата: менять порядок и откладывать можно только в очереди.', 'Work has started: only queued work can be reordered or deferred.') + '</small>' : '') +
      (infra.status === 'active' || infra.status === 'queued' ? button('help-task', infra.task.id, L('Помочь · 1 сила', 'Help · 1 energy'), infra.helpDisabled) : '') +
      (infra.status === 'queued' ? button('move-up', infra.task.id, '↑', !infra.task.canMoveUp, '', L('Делать раньше', 'Do sooner')) + button('move-down', infra.task.id, '↓', !infra.task.canMoveDown, '', L('Делать позже', 'Do later')) + button('defer', infra.task.id, L('Отложить', 'Defer'), !infra.task.canDefer) : '') +
      (infra.status === 'backlog' ? button('resume', infra.task.id, L('Продолжить', 'Resume'), !infra.task.canResume) : '') + '</div>' : '') +
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
    '</h2><nav class="wb-categories" aria-label="' + L('Категории построек', 'Building categories') + '">' +
    button('category', 'all', L('Все', 'All'), false, 'wb-category-tab wb-category-all') +
    BUILD_CATEGORIES.map((category) => button('category', category, CATEGORY_TITLE[category], false, 'wb-category-tab wb-category-' + category)).join('') +
    '</nav></header>' +
    '<div class="wb-office"></div><div class="wb-builds"></div></section>' +
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
    '</header><nav class="wb-segment-tabs" aria-label="' + L('Размер компании', 'Company size') + '">' +
    button('select-segment', 'small', L('Малые', 'Small')) +
    button('select-segment', 'medium', L('Средние', 'Medium')) +
    button('select-segment', 'large', L('Крупные', 'Large')) +
    '</nav><div class="wb-panel-scroll wb-client-content"><p class="wb-client-count"></p>' +
    '<p class="wb-current-price wb-client-revenue"></p>' +
    '<section class="wb-contracts"><h3>' +
    L('Именные договоры', 'Named contracts') +
    '</h3><p>' +
    L('У каждого договора свой чек. Выпускай нужные им функции до срока, чтобы сохранить выручку.',
      'Each contract pays its own rate. Ship its requested features on time to keep the revenue.') +
    '</p><ul></ul></section>' +
    '<div class="wb-happiness"><span></span><meter min="0" max="100"></meter></div>' +
    '<section class="wb-client-needs"><h3>' +
    L('Что им нужно', 'What they need') +
    '</h3><p class="wb-reasons"></p><ul class="wb-needs"></ul></section>' +
    '<section class="wb-price"><label for="wb-price">' +
    L('Общий тариф', 'Shared tariff') +
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
    '<p class="wb-market-numbers"></p></div>';
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
  let category: BuildCategory | 'all' = 'all';

  const text = (node: HTMLElement, value: string): void => {
    if (node.textContent !== value) node.textContent = value;
  };
  const html = (node: HTMLElement, value: string): void => {
    if (signatures.get(node) === value) return;
    signatures.set(node, value);
    const focused = document.activeElement as HTMLElement | null;
    const key = focused && node.contains(focused) ? focused.dataset.wbKey : undefined;
    const scrollTop = node.scrollTop;
    const scrolls = new Map([...node.querySelectorAll<HTMLElement>('[data-wb-scroll]')].map(el => [el.dataset.wbScroll, el.scrollTop]));
    const expanded = new Map([...node.querySelectorAll<HTMLDetailsElement>('details[data-wb-key]')].map(detail => [detail.dataset.wbKey, detail.open]));
    node.innerHTML = value;
    for (const detail of node.querySelectorAll<HTMLDetailsElement>('details[data-wb-key]')) {
      if (expanded.has(detail.dataset.wbKey)) detail.open = expanded.get(detail.dataset.wbKey)!;
    }
    if (key)
      [...node.querySelectorAll<HTMLElement>('[data-wb-key]')]
        .find((el) => el.dataset.wbKey === key)
        ?.focus({ preventScroll: true });
    node.scrollTop = scrollTop;
    for (const el of node.querySelectorAll<HTMLElement>('[data-wb-scroll]')) el.scrollTop = scrolls.get(el.dataset.wbScroll) ?? 0;
  };
  const click = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target || target.disabled || !view) return;
    const action = target.dataset.wbAction;
    const id = target.dataset.wbId ?? '';
    if (view.draft) return;
    switch (action) {
      case 'expand-office': send({ type: action, kind: id as 'land' | 'desks' }); break;
      case 'category':
        category = id as BuildCategory | 'all';
        renderCatalog();
        break;
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
      case 'select-segment':
        send({ type: action, segment: id as SegmentId });
        break;
      case 'expand-infrastructure':
        send({ type: 'expand-infrastructure' });
        break;
      case 'cancel-task':
      case 'rush-task':
      case 'help-task':
      case 'defer':
      case 'resume':
        send({ type: action, task: id });
        break;
      case 'move-up': case 'move-down':
        send({ type: 'move', task: id, direction: action === 'move-up' ? -1 : 1 }); break;
    }
  };
  function renderCatalog(): void {
    if (!view || view.draft) return;
    const available = catalogModules(view.modules, category);
    for (const tab of root.querySelectorAll<HTMLButtonElement>('.wb-category-tab')) tab.setAttribute('aria-pressed', String(tab.dataset.wbId === category));
    const office = view.office;
    html(find('.wb-office'), plotControl(office));
    html(find('.wb-builds'),
      (view.infrastructure && (category === 'all' || category === 'infra') ? infrastructureCard(view.infrastructure) : '') +
      (available.length ? available.map(moduleCard).join('') : '<p class="wb-empty">' + L('Кликни здание на карте, чтобы улучшить его.', 'Click a building on the map to upgrade it.') + '</p>'),
    );
  }
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

  function updateSegment(segment: WorkbenchSegment): void {
    const changed = clientId !== segment.id;
    clientId = segment.id;
    if (changed) client.scrollTop = 0;
    text(clientPanel.querySelector('h2')!, segment.title);
    for (const tab of clientPanel.querySelectorAll<HTMLButtonElement>('[data-wb-action="select-segment"]'))
      tab.setAttribute('aria-pressed', String(tab.dataset.wbId === segment.id));
    text(
      find('.wb-client-count'),
      L(
        whole(segment.count) + ' компаний · ' + signed(segment.delta) + ' за спринт',
        whole(segment.count) + ' companies · ' + signed(segment.delta) + ' this sprint',
      ),
    );
    text(find('.wb-client-revenue'), L(
      `Выручка сейчас · договоры ${rate(segment.contractIncome)}${PER_S} · общий тариф ${rate(segment.marketIncome)}${PER_S}`,
      `Revenue now · contracts ${rate(segment.contractIncome)}${PER_S} · shared tariff ${rate(segment.marketIncome)}${PER_S}`,
    ));
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
        whole(segment.leads) + ' лидов · рынок ≈' + whole(segment.market),
        whole(segment.leads) + ' leads · market ≈' + whole(segment.market),
      ),
    );
    text(find('.wb-reasons'), segment.reasons.join(' · '));
    html(
      find('.wb-needs'),
      segment.needs.length
        ? segment.needs.map(needHtml).join('')
        : '<li>' + L('Новых запросов нет.', 'No new requests.') + '</li>',
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
            esc([contract.detail, contract.status].filter(Boolean).join(' · ')) +
            '</p>' +
            (contract.button
              ? button(contract.button.action, contract.button.block, esc(contract.button.label), contract.button.disabled)
              : '') +
            '</li>',
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
      find('.wb-price .wb-current-price'),
      L('Сейчас ', 'Current ') +
        multiplier(segment.price) +
        (segment.priceLabel ? ' · ' + segment.priceLabel + L(' с компании', ' per company') : ''),
    );
    text(find('.wb-forecast'), segment.forecast);
    const confirm = find<HTMLButtonElement>('[data-wb-action="confirm-price"]');
    confirm.dataset.wbId = segment.id;
    confirm.disabled = !canConfirmPrice(segment, Boolean(view?.draft));
    text(
      confirm,
      segment.pricePending
        ? L('Назначено на релиз', 'Scheduled for release')
        : L('На следующий релиз', 'Apply next release'),
    );
  }

  function positionClients(): void {
    const anchor = view?.clientAnchor ?? { x: 1110, y: 910 };
    const {left, top, pointer} = clientPanelPosition(anchor, clientPanel.offsetWidth, clientPanel.offsetHeight);
    clientPanel.style.left = `${left}px`;
    clientPanel.style.top = `${top}px`;
    clientPanel.style.setProperty(
      '--client-pointer-x',
      `${pointer}px`,
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
      const detail = panel === 'module' || panel === 'agent';
      root.classList.toggle('wb-context', detail);
      catalog.hidden = detail;
      modulePanel.hidden = !detail;
      clientPanel.hidden = panel !== 'clients' || Boolean(view.draft);
      if (!view.draft) {
        renderCatalog();
      }
      if (panel === 'module') {
        const module = view.modules.find((entry) => entry.id === view?.selectedModule);
        html(
          find('.wb-module-content'),
          module
            ? moduleDetail(module, view.tasks.find(task => task.id === module.taskId)) + (module.action === 'place' && view.office.used >= view.office.cells ? '<div class="wb-office">' + plotControl(view.office) + '</div>' : '')
            : '<p class="wb-empty">' +
                L('Выбери здание на карте.', 'Choose a building on the map.') +
                '</p>',
        );
      }
      if (panel === 'agent' && view.agent) html(find('.wb-module-content'), agentDetail(view.agent));
      const segment =
        view.segments.find((entry) => entry.id === view?.selectedSegment) ?? view.segments[0];
      if (panel === 'clients' && segment) {
        updateSegment(segment);
        positionClients();
      }
      const nextPanelKey =
        panel === 'module'
          ? 'module:' + (view.selectedModule ?? '')
          : panel === 'agent'
            ? 'agent:' + view.agent?.id
          : panel === 'clients'
            ? 'clients:' + (segment?.id ?? '')
            : '';
      if (panelKey !== nextPanelKey) {
        if (nextPanelKey && !panelKey) beforePanel = document.activeElement as HTMLElement | null;
        if (!view.draft) {
          if (nextPanelKey)
            (detail ? modulePanel : clientPanel)
              .querySelector<HTMLButtonElement>('.wb-back')
              ?.focus({ preventScroll: true });
          else {
            const origin = beforePanel?.isConnected ? beforePanel : beforePanel?.dataset.o && beforePanel.dataset.l
              ? shop.querySelector<HTMLElement>(`[data-o="${CSS.escape(beforePanel.dataset.o)}"][data-l="${CSS.escape(beforePanel.dataset.l)}"]`)
              : null;
            if (origin) origin.focus({ preventScroll: true });
            else catalog.querySelector('h2')?.focus({ preventScroll: true });
          }
        }
        if (panel === 'module') find('.wb-module-content').scrollTop = 0;
        panelKey = nextPanelKey;
      }
    },
  };
}
