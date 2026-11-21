import { BLOCK_BY_ID } from '../content/blocks';
import { HAND_NAME } from '../content/texts';
import { L } from '../core/lang';
import type { GuideStep } from '../game/startup-guide';
import type { Run } from '../systems/run/run';
import { PER_S, rate } from './format';
import { projectName } from './workbench-view';
import './startup-guide.css';

const cells = '.bl-cell[data-c*=","]';
const choices = '[data-sc-choice]:enabled';
const tile = (id: string) => `.wb-builds [data-wb-action="place"][data-wb-id="${id}"]:enabled`;
const selectors: Record<GuideStep, string> = {
  core: tile('core'), landing: tile('landing'), pay: tile('pay'),
  'core-cell': cells, 'landing-cell': cells, 'pay-cell': cells,
  code: '[data-o="hand"][data-l="build"]:enabled',
  release: choices, subscribed: '.bl-ledger p:first-child',
};

function releaseResult(run: Run): string {
  const report = run.lastReport;
  const shipped = [...(report?.shipped ?? []).map(id => BLOCK_BY_ID[id]?.name ?? id), ...(report?.projects ?? []).map(projectName)].join(', ');
  return shipped ? L(`На релизе заработали: ${shipped}.`, `Live with this release: ${shipped}.`)
    : L('В этот раз ничего не выпущено.', 'Nothing shipped this time.');
}

function advice(step: GuideStep, run: Run, target: HTMLElement): string {
  const name = target.querySelector('strong')?.textContent;
  switch (step) {
    case 'core': return L(`Выбери «${name}». Это ядро продукта. Место для него выберешь на карте.`, `Choose “${name}”, the core of your product. Next you’ll pick a spot on the map.`);
    case 'core-cell': return L('Нажми на любую свободную клетку. Так ядро попадёт в очередь на стройку.', 'Click any free cell to add the core to the build queue.');
    case 'code': return L(`Агент строит сам. Нажми «${HAND_NAME.build}», чтобы потратить одну силу и помочь со стройкой.`, `The agent builds on its own. Press “${HAND_NAME.build}” to spend one energy and help it finish sooner.`);
    case 'landing': return L(`Выбери «${name}». После релиза клиенты смогут найти твой продукт.`, `Choose “${name}”. Once it ships, customers can find your product.`);
    case 'landing-cell': return L('Нажми на любую свободную клетку, чтобы поставить лендинг в очередь.', 'Click any free cell to queue the landing page.');
    case 'pay': return L(`Выбери «${name}». Без оплаты клиенты не приносят выручку.`, `Choose “${name}”. Until you can bill customers, they bring in no revenue.`);
    case 'pay-cell': return L('Поставь оплату на любую свободную клетку. Принимать деньги можно после релиза.', 'Place payments on any free cell. You can start billing once it ships.');
    case 'release': {
      const result = releaseResult(run);
      return L(`В конце спринта готовые блоки выходят автоматически. ${result} Выбери любую карту.`, `Ready blocks ship automatically at sprint end. ${result} Pick any card.`);
    }
    case 'subscribed': {
      const first = run.guide!.subscription!;
      const income = rate(first.income) + PER_S, net = rate(first.net) + PER_S;
      const result = run.lastReport?.sprint === 1 ? `${releaseResult(run)} ` : '';
      const next = run.draft ? L('Выбери любую карту.', 'Pick any card.') : L('Дальше ты решаешь, что строить.', 'What you build next is up to you.');
      return result + L(`Первые подписки: ${income}. Чистый поток после расходов: ${net}.`, `First subscription revenue: ${income}. Net cash flow after expenses: ${net}.`) + ` ${next}`;
    }
  }
}

/** Scroll just the list, never the stage or the player's camera. */
function revealInShelf(target: HTMLElement, scale: number): void {
  const list = target.closest<HTMLElement>('.wb-builds, .bl-shelf-body');
  if (!list || list.scrollHeight <= list.clientHeight) return;
  const box = list.getBoundingClientRect(), item = target.getBoundingClientRect();
  if (item.top < box.top) list.scrollTop += (item.top - box.top) / scale - 4;
  else if (item.bottom > box.bottom) list.scrollTop += (item.bottom - box.bottom) / scale + 4;
}

function reachable(target: HTMLElement, card: HTMLElement): boolean {
  if (target.closest('[hidden], [inert]') || target.matches(':disabled')) return false;
  const r = target.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const list = target.closest('.wb-builds, .bl-shelf-body')?.getBoundingClientRect();
  const top = Math.max(r.top, list?.top ?? r.top), bottom = Math.min(r.bottom, list?.bottom ?? r.bottom);
  if (bottom <= top) return false;
  const x = r.left + r.width / 2, y = (top + bottom) / 2;
  let hit = document.elementFromPoint(x, y);
  // A moving anchor can briefly pass behind the old position of our own buttons.
  if (hit && card.contains(hit)) hit = document.elementsFromPoint(x, y).find(el => !card.contains(el)) ?? null;
  // The paper HUD and its ledger deliberately pass all input through.
  if (target.closest('.bl-hud')) return target.checkVisibility() && !!hit && !hit.closest('.sc-overlay, .bl-shop, dialog, .tm');
  return !!hit && target.contains(hit);
}

/** Coordinates inside the scaled paper. Keep the whole group of free cells clear. */
function place(card: HTMLElement, target: HTMLElement, paper: HTMLElement, stage: DOMRect, scale: number): void {
  const anchor = target.closest<HTMLElement>('.bl-shop') ?? target;
  const bounds = target.matches(cells)
    ? [...paper.querySelectorAll(cells)].map(el => el.getBoundingClientRect())
    : [anchor.getBoundingClientRect()];
  const point = target.getBoundingClientRect();
  const w = card.offsetWidth, h = card.offsetHeight, gap = 16;
  const maxX = paper.clientWidth - w - gap, maxY = paper.clientHeight - h - gap;
  const cx = (point.left + point.width / 2 - stage.left) / scale;
  const cy = (point.top + point.height / 2 - stage.top) / scale;
  let x = Math.min(maxX, Math.max(gap, cx - w / 2));
  let y = Math.min(maxY, Math.max(gap, cy - h / 2));
  const above = (Math.min(...bounds.map(r => r.top)) - stage.top) / scale - gap - h;
  const below = (Math.max(...bounds.map(r => r.bottom)) - stage.top) / scale + gap;
  const left = (Math.min(...bounds.map(r => r.left)) - stage.left) / scale - gap - w;
  const right = (Math.max(...bounds.map(r => r.right)) - stage.left) / scale + gap;
  if (anchor.matches('.bl-shop')) x = left;
  else if (above >= gap) y = above;
  else if (below <= maxY) y = below;
  else if (left >= gap) x = left;
  else x = Math.min(maxX, right); // the shelf is outside the map's clipped cell layer
  const pos = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  if (card.style.transform !== pos) card.style.transform = pos;
}

export function createGuideView(onDismiss: () => void, onSkip: () => void) {
  const card = document.createElement('aside');
  card.className = 'startup-guide';
  card.setAttribute('aria-label', L('Первый стартап', 'First startup'));
  card.innerHTML = `<strong></strong><p id="startup-guide-text" aria-live="polite" aria-atomic="true"></p><footer>` +
    `<button type="button" data-guide-dismiss>${L('Понятно', 'Got it')}</button>` +
    `<button type="button" data-guide-skip>${L('Пропустить обучение', 'Skip tutorial')}</button></footer>`;
  const title = card.querySelector('strong')!, text = card.querySelector('p')!;
  let paper: HTMLElement | null = null, marked: HTMLElement | null = null;
  let revealed: GuideStep | null = null;
  let placementKey = '';
  function unmark() {
    marked?.removeAttribute('data-guide-target');
    marked?.removeAttribute('aria-describedby');
    marked = null;
  }
  function unavailable(): false {
    unmark();
    card.remove();
    placementKey = '';
    return false;
  }
  card.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest('button');
    if (!button) return;
    // Return keyboard input to the action (or a card if the report was highlighted).
    const action = marked instanceof HTMLButtonElement ? marked : card.closest('.sc-draft')?.querySelector<HTMLElement>(choices);
    action?.focus({ preventScroll: true });
    if (button.hasAttribute('data-guide-dismiss')) onDismiss();
    else onSkip();
  });

  return {
    show(step: GuideStep, run: Run): boolean {
      paper ??= document.querySelector<HTMLElement>('#top .bl-over');
      if (!paper || document.hidden || document.querySelector('.tm.on, dialog[open], .sc-album:not([hidden])')) return unavailable();
      const draft = run.draft ? paper.querySelector<HTMLElement>('.sc-draft:not([hidden])') : null;
      if ((run.draft && !draft) || (draft && step !== 'release' && step !== 'subscribed')) return unavailable();
      if (!draft && paper.querySelector('.bl-call.on, .wb-client-panel:not([hidden]), .wb-module-panel:not([hidden]), .sc-draft:not([hidden])')) return unavailable();
      const parent = draft ?? paper;
      const selector = draft && step === 'subscribed' ? '.sc-report' : selectors[step];
      const stage = paper.getBoundingClientRect(), scale = stage.width / paper.clientWidth;
      if (!scale) return unavailable();
      const same = card.dataset.guideStep === step && card.parentElement === parent;
      let target = same && marked?.isConnected && reachable(marked, card) ? marked : null;
      if (!target) {
        const candidates = [...parent.querySelectorAll<HTMLElement>(selector)];
        // In a tall deal the report can be offscreen; the card choice is still available.
        if (draft && step === 'subscribed') candidates.push(...draft.querySelectorAll<HTMLElement>(choices));
        for (const node of candidates) {
          if (revealed !== step && !draft) revealInShelf(node, scale);
          revealed = step;
          if (reachable(node, card)) { target = node; break; }
        }
      }
      if (!target) return unavailable();
      const changed = marked !== target || !same;
      if (changed) {
        unmark();
        marked = target;
        target.setAttribute('data-guide-target', '');
        target.setAttribute('aria-describedby', text.id);
      }
      if (changed) {
        card.dataset.guideStep = step;
        title.textContent = step === 'subscribed' ? L('Первая подписка', 'First subscription') : L('Первый стартап', 'First startup');
        text.textContent = advice(step, run, target);
      }
      if (card.parentElement !== parent) {
        if (draft) draft.append(card); // included in the deal's existing Tab loop
        else paper.prepend(card);
      }
      if (!draft) {
        const r = target.getBoundingClientRect();
        const key = `${r.x},${r.y},${r.width},${r.height},${scale},${card.offsetHeight}`;
        if (changed || key !== placementKey) place(card, target, paper, stage, scale);
        placementKey = key;
      }
      return true;
    },
    hide(): void {
      revealed = null;
      unavailable();
    },
  };
}
