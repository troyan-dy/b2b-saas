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
  };
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
  const title = esc(module.shortTitle ?? module.title) + (module.level ? ` v${module.level + 1}` : '');
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
      ? '<span class="wb-muted">' +
        esc(need.actionLabel ?? L('Нужный уровень выпущен', 'Required level shipped')) +
        '</span>'
      : button(
          need.action,
          need.block,
          esc(need.actionLabel ?? buildLabel(need.action)),
          need.disabled,
        )) +
    '</li>'
  );
}

function draftHtml(draft: WorkbenchDraft): string {
  return (
    '<section class="wb-draft-panel" role="dialog" aria-modal="true" aria-labelledby="wb-draft-title">' +
    '<header><span class="wb-kicker">' +
    L('Пауза · время не идёт', 'Paused · time is stopped') +
    '</span>' +
    '<h2 id="wb-draft-title">' +
    L(
      'Спринт ' + draft.sprint + '. Выбери усиление',
      'Sprint ' + draft.sprint + '. Choose a boost',
    ) +
    '</h2></header><details class="wb-release"><summary>' +
    L('Как прошёл спринт', 'Sprint recap') +
    '</summary><p>' +
    esc(draft.summary) +
    '</p>' +
    (draft.news
      ? '<div class="wb-draft-news"><strong>' +
        esc(draft.news.title) +
        '</strong><span>' +
        esc(draft.news.text) +
        '</span></div>'
      : '') +
    '</details><div class="wb-draft-cards">' +
    draft.cards
      .slice(0, 3)
      .map(
        (card, index) =>
          '<article class="wb-draft-card"><h3>' +
          esc(card.title) +
          '</h3>' +
          '<strong class="wb-impact">' +
          esc(primary(card.impact)) +
          '</strong>' +
          '<p class="wb-tradeoff">' +
          esc(card.tradeoff) +
          '</p>' +
          '<span class="wb-immediate">' +
          L('Действует сразу', 'Takes effect immediately') +
          '</span>' +
          button(
            'choose-card',
            card.id,
            '<kbd>' + (index + 1) + '</kbd> ' + L('Выбрать', 'Choose'),
          ) +
          '</article>',
      )
      .join('') +
    '</div><footer>' +
    L(
      'Один выбор. Спринт продолжится, когда решишь.',
      'One choice. The sprint continues when you decide.',
    ) +
    '</footer></section>'
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
    '<div class="wb-builds"></div><ul class="wb-perks" aria-label="' +
    L('Активные эффекты', 'Active effects') +
    '" hidden></ul></section>' +
    '<section class="wb-detail wb-module-panel" aria-label="' +
    L('Постройка', 'Building') +
    '" hidden>' +
    '<header>' +
    back +
    '</header><div class="wb-panel-scroll wb-module-content"></div></section>' +
    '<section class="wb-detail wb-client-panel" aria-label="' +
    L('Клиенты', 'Clients') +
    '" hidden><header>' +
    back +
    '</header><div class="wb-panel-scroll wb-client-content"><h2></h2><p class="wb-client-count"></p>' +
    '<div class="wb-happiness"><span></span><meter min="0" max="100"></meter></div>' +
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
    '<section class="wb-client-needs"><h3>' +
    L('Что им нужно', 'What they need') +
    '</h3><ul class="wb-needs"></ul></section>' +
    '<details class="wb-market-detail"><summary>' +
    L('Рынок и удовлетворённость', 'Market and satisfaction') +
    '</summary><p class="wb-market-numbers"></p><p class="wb-reasons"></p></details>' +
    '<details class="wb-contracts"><summary>' +
    L('Ключевые договоры', 'Key contracts') +
    '</summary><p>' +
    L(
      'Их фиксированные тарифы считаются отдельно. Ползунок выше на них не влияет.',
      'Their fixed tariffs are counted separately. The slider above does not affect them.',
    ) +
    '</p><ul></ul></details>' +
    '<details class="wb-infrastructure"><summary>' +
    L('Расширить инфраструктуру', 'Expand infrastructure') +
    '</summary><p></p>' +
    button('expand-infrastructure', '', L('Расширить', 'Expand')) +
    '</details></div></section>';
  shop.prepend(root);

  const draft = document.createElement('div');
  draft.className = 'wb-draft';
  draft.hidden = true;
  const applied = document.createElement('div');
  applied.className = 'wb-applied';
  applied.hidden = true;
  applied.setAttribute('role', 'status');
  applied.setAttribute('aria-live', 'polite');
  over.append(draft, applied);

  const find = <T extends HTMLElement = HTMLElement>(selector: string): T =>
    root.querySelector<T>(selector)!;
  const catalog = find('.wb-catalog');
  const modulePanel = find('.wb-module-panel');
  const clientPanel = find('.wb-client-panel');
  const client = find('.wb-client-content');
  const signatures = new WeakMap<HTMLElement, string>();
  let view: WorkbenchView | null = null;
  let panelKey = '';
  let clientId: SegmentId | null = null;
  let draftKey = '';
  let chosenDraft = false;
  let beforeDraft: HTMLElement | null = null;
  let beforePanel: HTMLElement | null = null;
  let appliedKey = '';
  let appliedTimer = 0;

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
    const action = target.dataset.wbAction;
    const id = target.dataset.wbId ?? '';
    if (action === 'choose-card') {
      chooseCard(id);
      return;
    }
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
    }
  };
  root.addEventListener('click', click);
  draft.addEventListener('click', click);
  root.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.matches('[data-wb-price]') || !view || view.draft || input.disabled) return;
    const value = Number(input.value);
    text(find('.wb-price output'), multiplier(value));
    send({ type: 'preview-price', segment: input.dataset.wbPrice as SegmentId, value });
  });
  root.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).closest('button, input, summary')) event.stopPropagation();
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
      if (!view.draft) {
        if (view.panel && event.code === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          send({ type: 'close-panel' });
        }
        return;
      }
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
        const buttons = [...draft.querySelectorAll<HTMLElement>('button:not(:disabled), summary')];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      } else if (event.code === 'Escape') event.preventDefault();
    },
    true,
  );

  function updateSegment(segment: WorkbenchSegment): void {
    const changed = clientId !== segment.id;
    clientId = segment.id;
    if (changed) {
      client.scrollTop = 0;
      client.querySelectorAll<HTMLDetailsElement>('details').forEach((details) => {
        details.open = false;
      });
    }
    text(client.querySelector('h2')!, segment.title);
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
    const infrastructure = find('.wb-infrastructure');
    infrastructure.hidden = !view?.infrastructure;
    if (view?.infrastructure) {
      text(infrastructure.querySelector('p')!, view.infrastructure.detail);
      const expand = infrastructure.querySelector('button')!;
      text(expand, view.infrastructure.label);
      expand.disabled = Boolean(view.draft || view.infrastructure.disabled);
    }
  }

  function updateApplied(value: WorkbenchView['applied']): void {
    const key = value ? value.title + '\n' + value.impact : '';
    if (key === appliedKey) return;
    appliedKey = key;
    window.clearTimeout(appliedTimer);
    applied.hidden = !value;
    if (!value) return;
    html(
      applied,
      '<span>' + esc(value.title) + '</span><strong>' + esc(value.impact) + '</strong>',
    );
    appliedTimer = window.setTimeout(() => {
      applied.hidden = true;
    }, 4500);
  }

  return {
    get active() {
      return view !== null;
    },
    set(next) {
      view = next;
      root.hidden = !view;
      root.inert = Boolean(view?.draft);
      shop.classList.toggle('wb-enabled', Boolean(view));
      if (!view) {
        draft.hidden = true;
        draftKey = '';
        panelKey = '';
        chosenDraft = false;
        updateApplied(null);
        return;
      }
      const perks = find('.wb-perks');
      perks.hidden = !view.perks?.length;
      html(
        perks,
        (view.perks ?? [])
          .map(
            (perk) =>
              '<li title="' +
              esc(perk.title + ': ' + perk.impact) +
              '">' +
              esc(primary(perk.impact) || perk.title) +
              '</li>',
          )
          .join(''),
      );
      const panel = view.panel ?? null;
      root.classList.toggle('wb-context', panel !== null);
      catalog.hidden = panel !== null;
      modulePanel.hidden = panel !== 'module';
      clientPanel.hidden = panel !== 'clients';
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
          available.length
            ? available.map(moduleCard).join('')
            : '<p class="wb-empty">' +
                L(
                  'Всё доступное уже на чертеже.<br>Кликни здание, чтобы улучшить его.',
                  'Everything available is on the blueprint.<br>Click a building to improve it.',
                ) +
                '</p>',
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
      if (panel === 'clients' && segment) updateSegment(segment);
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
      updateApplied(view.applied);
      draft.hidden = !view.draft;
      const key = view.draft
        ? view.draft.sprint + ':' + view.draft.cards.map((card) => card.id).join(',')
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
