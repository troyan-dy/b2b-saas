import { BLOCK_BY_ID } from '../content/blocks';
import { HAND_NAME } from '../content/texts';
import { L } from '../core/lang';
import { profitLesson, type GuideStep } from '../game/startup-guide';
import { companyTotals } from '../systems/company/company';
import { MARKET } from '../systems/company/market';
import { draftCards, previewCardChange, type DraftCard } from '../systems/run/draft';
import { PRODUCTION } from '../systems/run/product';
import { clientsMax, flows, leadsPerWork, sellable, TUNING, type Run } from '../systems/run/run';
import { dec, money, PER_S, whole } from './format';
import { projectName } from './workbench-view';
import './startup-guide.css';

const cells = '.bl-cell[data-c*=","]';
const choices = '[data-sc-choice]:enabled';
const tile = (id: string) => `.wb-builds [data-wb-action="place"][data-wb-id="${id}"]:enabled`;
const hand = (lane: string) => `[data-o="hand"][data-l="${lane}"]:enabled`;
const selectors: Record<Exclude<GuideStep, 'assign-promo' | 'park-agent'>, string> = {
  core: tile('core'), landing: tile('landing'), pay: tile('pay'),
  'core-cell': cells, 'landing-cell': cells, 'pay-cell': cells,
  code: hand('build'), post: hand('promo'), 'fix-debt': hand('fix'),
  release: choices, subscribed: '.bl-ledger p:first-child',
  ledger: '.bl-ledger', compare: '.bl-ledger', profitable: '.bl-ledger',
  'expand-capacity': '[data-wb-action="expand-infrastructure"]:enabled, [data-map="infrastructure"]:enabled',
};

// A narrow margin can decide a release. Never round a real profit or loss to “$0”.
const dollars = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString(L('ru-RU', 'en-US'), Math.abs(n) < 0.01 ? { maximumSignificantDigits: 1 } : { maximumFractionDigits: 2 })}`;
const perSecond = (n: number) => dollars(n) + PER_S;
const netRate = (n: number) => (n > 0 ? '+' : '') + perSecond(n);
type Lesson = ReturnType<typeof profitLesson>;
const expenses = (f: Lesson) => f.living + f.agents + f.hosting + f.tokens;

function gap(net: number): string {
  return net < 0 ? L(`До нуля не хватает ${perSecond(-net)}.`, `Still ${perSecond(-net)} short of breaking even.`)
    : net === 0 ? L('Расходы ровно покрыты. Для прибыли нужен ещё доход или экономия.', 'You’re breaking even. Earn a little more or spend a little less to turn a profit.')
    : L('Сейчас подписки покрывают расходы. Проверь, сохранится ли плюс на релизе.', 'Subscriptions cover costs now. See if that margin holds at release.');
}

/** Prefer a concrete benefit this deal can deliver, before taking on another hosting bill. */
function suggestedCard(run: Run): DraftCard | undefined {
  const cards = draftCards(run);
  const find = (id: string) => cards.find(card => card.id === id);
  const cash = flows(run), batch = find('batch'), leads = find('leads');
  const tokens = batch && previewCardChange(run, batch);
  const savesTokens = tokens && tokens.after < tokens.before;
  const repair = find('maintenance');
  if (repair && run.debt >= TUNING.debt.down_at + (repair.debt ?? 0)) return repair;
  if (batch && savesTokens && cash.tokens >= cash.living && cash.tokens >= cash.hosting) return batch;
  if (leads && !run.down && sellable(run) && run.live.has('pay') && run.clients.length < clientsMax(run)) return leads;
  if (batch && savesTokens) return batch;
  return cards.find(card => card.money || (card.debt && run.debt > 0) || (card.energy && run.energy < TUNING.crunch.max))
    ?? cards.find(card => card.slot === 'operation') ?? cards[0];
}

function cardReason(card: DraftCard, run: Run, target: HTMLElement): string {
  if (card.money) return L(`${money(card.money)} на счёт один раз. Это запас времени; поток от подписок не изменится.`, `${money(card.money)} in cash, once. It buys time; subscription cash flow stays the same.`);
  if (card.leads) {
    const hosts: Readonly<Record<string, number>> = PRODUCTION.strategy_host;
    const other = draftCards(run).find(c => hosts[c.id] > 0);
    const host = other ? perSecond(hosts[other.id] * flows(run).living / TUNING.living_per_s) : '';
    const cost = other ? L(` С «${other.title}» хостинг дороже на ${host}.`, ` “${other.title}” adds ${host} in hosting.`) : '';
    return L(`+${card.leads} лида бесплатно. На релизе часть может стать клиентами.`, `Get ${card.leads} free leads. Some may become customers at release.`) + cost;
  }
  if (card.id === 'batch') {
    const change = previewCardChange(run, card)!;
    const bill = `${perSecond(change.before / TUNING.sprint_s)} → ${perSecond(change.after / TUNING.sprint_s)}`;
    return L(`Токены: ${bill}. Цена экономии — задержка ответов: крупные клиенты менее довольны.`, `Tokens: ${bill}. The trade-off is slower replies and less satisfied large customers.`);
  }
  if (card.debt || card.energy) {
    const impact = target.querySelector('.sc-impact')?.textContent;
    const change = previewCardChange(run, card);
    if (change?.before === change?.after) return `${impact}. ` + L('Сейчас бонус ничего не изменит, зато и расходы не вырастут.', 'No benefit right now, but no new costs either.');
    return `${impact}. ` + L('Разовый эффект, без новой платы за хостинг.', 'A one-off effect with no new hosting bill.');
  }
  return `${target.querySelector('.sc-impact')?.textContent}. ${card.tradeoff}`;
}

function releaseResult(run: Run): string {
  const report = run.lastReport;
  const shipped = [...(report?.shipped ?? []).map(id => BLOCK_BY_ID[id]?.name ?? id), ...(report?.projects ?? []).map(projectName)].join(', ');
  return shipped ? L(`На релизе заработали: ${shipped}.`, `Live with this release: ${shipped}.`)
    : L('В этот раз ничего не выпущено.', 'Nothing shipped this time.');
}

interface Tip { title?: string; figure?: string; body: string; choice?: string }

function advice(step: GuideStep, run: Run, target: HTMLElement, example?: DraftCard): Tip {
  const name = target.querySelector('strong')?.textContent;
  const choice = example ? L(`Например, «${example.title}». `, `One option: “${example.title}”. `) + cardReason(example, run, target) : undefined;
  switch (step) {
    case 'core': return { body: L(`Выбери «${name}». Это ядро продукта. Место для него выберешь на карте.`, `Choose “${name}”, the core of your product. Next you’ll pick a spot on the map.`) };
    case 'core-cell': return { body: L('Поставь ядро на свободную клетку. Размещение бесплатно. Пока агент строит, ты платишь за его работу; после выпуска — за хостинг блока.', 'Place the core on a free cell. Placement is free. You pay for the agent’s time while building and for hosting once the block ships.') };
    case 'code': return { body: L(`Агент строит сам. Нажми «${HAND_NAME.build}», чтобы потратить одну силу и помочь со стройкой.`, `The agent builds on its own. Press “${HAND_NAME.build}” to spend one energy and help it finish sooner.`) };
    case 'landing': return { body: L(`Выбери «${name}». После релиза клиенты смогут найти твой продукт.`, `Choose “${name}”. Once it ships, customers can find your product.`) };
    case 'landing-cell': return { body: L('Нажми на любую свободную клетку, чтобы поставить лендинг в очередь.', 'Click any free cell to queue the landing page.') };
    case 'pay': return { body: L(`Выбери «${name}». Без оплаты клиенты не приносят выручку.`, `Choose “${name}”. Until you can bill customers, they bring in no revenue.`) };
    case 'pay-cell': return { body: L('Поставь оплату на любую свободную клетку. Принимать деньги можно после релиза.', 'Place payments on any free cell. You can start billing once it ships.') };
    case 'release': return { body: releaseResult(run) + ' ' + L('Готовые блоки выходят в конце спринта. Теперь выбери любую карту.', 'Ready blocks ship at sprint end. Now pick any card.'), choice };
    case 'subscribed': {
      const first = run.guide!.subscription!;
      return { title: L('Первая подписка', 'First subscription'),
        figure: L(`Выручка ${perSecond(first.income)} · чистый поток ${netRate(first.net)}`, `Revenue ${perSecond(first.income)} · net ${netRate(first.net)}`),
        body: (run.draft && run.lastReport?.sprint === 1 ? `${releaseResult(run)} ` : '') +
          L('Разовые деньги пополняют счёт. Для прибыльного релиза нужно, чтобы подписки приносили больше, чем уходит каждую секунду.', 'One-off cash tops up your balance. For a profitable release, subscriptions must bring in more each second than you spend.'), choice };
    }
    case 'ledger': {
      const f = profitLesson(run);
      return { title: L('Выручка минус расходы', 'Revenue minus costs'),
        figure: `${perSecond(f.income)} − ${perSecond(expenses(f))} = ${netRate(f.net)}`,
        body: L(`Каждую секунду: еда и жильё ${dollars(f.living)}, агенты ${dollars(f.agents)}, хостинг ${dollars(f.hosting)}, токены клиентов ${dollars(f.tokens)}.`, `Each second: food and rent ${dollars(f.living)}, agents ${dollars(f.agents)}, hosting ${dollars(f.hosting)}, customer tokens ${dollars(f.tokens)}.`) + ' ' + gap(f.net) };
    }
    case 'post': {
      const leads = dec(Number(leadsPerWork(run).toFixed(2)));
      return { title: L('Пост основателя', 'Founder post'), figure: L(`1 сила → +${leads} к лидам`, `1 energy → +${leads} leads`),
        body: L(`Нажми «${HAND_NAME.promo}». Интерес накапливается без денежной платы. Часть заинтересованных компаний может стать клиентами на релизе; сам пост выручки не даёт.`, `Press “${HAND_NAME.promo}”. Interest builds at no cash cost. Some prospects may become customers at release; the post itself earns nothing.`) };
    }
    case 'assign-promo':
    case 'park-agent': {
      const agent = run.agents.find(a => `a${a.id}` === target.dataset.o)!;
      const pay = perSecond(TUNING.tiers[agent.tier].cost_per_s);
      if (step === 'park-agent') return { title: L(`Агент №${agent.id} · пауза в продвижении`, `Agent #${agent.id} · pause promotion`),
        body: L(`Переведи агента на стройку. Сейчас строить нечего: траты сразу снизятся на ${pay}, пока не появится работа. Новых лидов агент пока не ищет; уже собранные останутся до релиза.`, `Switch this agent to build. With nothing to build now, you save ${pay} until work starts. The agent stops finding leads; the ones you already have still count at release.`) };
      return { title: L(`Агент №${agent.id} · продвижение`, `Agent #${agent.id} · promotion`),
        body: L(`Назначь агента на продвижение. Пока он работает, ты платишь ${pay}; простой бесплатен. Агент собирает лиды весь спринт. На релизе они могут принести новые подписки.`, `Assign this agent to promotion. The agent costs ${pay} while working and nothing while idle. They gather leads throughout the sprint; some may turn into subscriptions at release.`) };
    }
    case 'fix-debt': {
      const debt = dec(Number(run.debt.toFixed(1))), limit = TUNING.debt.down_at;
      return { title: L('Убереги подписки от сбоя', 'Protect subscriptions from an outage'),
        figure: L(`Техдолг ${debt} / ${limit}`, `Tech debt ${debt} / ${limit}`),
        body: L(`Нажми «${HAND_NAME.fix}»: за 1 силу снимешь до ${TUNING.fix_per_work} долга сразу. Если к релизу долг достигнет ${limit}, в следующем спринте подписки не принесут денег.`, `Press “${HAND_NAME.fix}”: 1 energy immediately clears up to ${TUNING.fix_per_work} debt. If debt reaches ${limit} at release, subscriptions earn nothing next sprint.`) };
    }
    case 'expand-capacity': {
      const rule = PRODUCTION.infrastructure, cost = money(rule.cost * rule.cost_growth ** run.infrastructure);
      const load = Math.round(companyTotals(run).utilization * 100);
      const host = perSecond(MARKET.capacity.hosting_per_expansion * flows(run).living / TUNING.living_per_s);
      return { title: L(`Загрузка серверов: ${load}%`, `Server load: ${load}%`),
        body: L(`Перегрузка отпугивает клиентов. Поставь расширение в очередь: ${cost} спишутся один раз при старте стройки. После выпуска мощность вырастет в ${dec(MARKET.capacity.expansion_mult)} раза, а хостинг — на ${host}.`, `Overload drives customers away. Queue an expansion: ${cost} is charged once when construction starts. When it ships, capacity grows to ${dec(MARKET.capacity.expansion_mult)}× and hosting costs an extra ${host}.`) };
    }
    case 'compare':
    case 'profitable': {
      const f = profitLesson(run), report = run.lastReport?.sprint === f.release ? run.lastReport : null;
      if (f.historicalRatesMissing) return { title: L(`Прибыльный релиз №${f.release}`, `Profitable release #${f.release}`),
        body: L('На этом релизе выручка от подписок превысила расходы. В старом отчёте точный чистый поток не записан. Урок пройден!', 'Subscription revenue exceeded costs at this release. The old report didn’t record the exact net cash flow. Lesson complete!') };
      const figure = f.previousNet === null ? netRate(f.net) : `${netRate(f.previousNet)} → ${netRate(f.net)}`;
      if (step === 'profitable') return { title: L(`Прибыльный релиз №${f.release}`, `Profitable release #${f.release}`), figure,
        body: L(`Подписки приносили ${perSecond(f.income)}, расходы составляли ${perSecond(expenses(f))}. На момент релиза оставалась прибыль. Урок пройден!`, `Subscriptions brought in ${perSecond(f.income)} against costs of ${perSecond(expenses(f))}. You had money left over at release. Lesson complete!`) };
      const left = (report?.left ?? 0) + (report?.closed ?? 0);
      const missing = report?.reasons?.find(id => BLOCK_BY_ID[id]);
      const context = report?.down ? L('Продукт лежал — клиенты не платили.', 'The product was down, so customers didn’t pay.')
        : missing ? L(`Не все дождались блока «${BLOCK_BY_ID[missing].name}». Ушло клиентов: ${whole(left)}.`, `Some customers left waiting for “${BLOCK_BY_ID[missing].name}”. Total departures: ${whole(left)}.`)
        : left ? L(`На релизе пришло клиентов: ${whole(report!.came)}, ушло: ${whole(left)}.`, `Customers at release: ${whole(report!.came)} joined, ${whole(left)} left.`)
        : L(`Из выручки ${perSecond(f.income)} уходило ${perSecond(f.hosting)} на хостинг и ${perSecond(f.tokens)} на токены клиентов.`, `Of ${perSecond(f.income)} in revenue, ${perSecond(f.hosting)} went to hosting and ${perSecond(f.tokens)} to customer tokens.`);
      return { title: L(`Релиз №${f.release} · чистый поток`, `Release #${f.release} · net cash flow`), figure, body: `${context} ${gap(f.net)}`, choice };
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
  if (target.closest('[hidden], [inert]') || target.matches(':disabled') || !target.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
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
  if (target.closest('.bl-hud')) return !!hit && !hit.closest('.sc-overlay, .bl-shop, dialog, .tm');
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
  if (target.closest('.bl-hud')) {
    const shelf = paper.querySelector('.bl-shop')?.getBoundingClientRect();
    if (shelf) x = Math.min(x, (shelf.left - stage.left) / scale - gap - w);
  }
  const pos = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  if (card.style.transform !== pos) card.style.transform = pos;
}

export function createGuideView(onDismiss: () => void, onSkip: () => void) {
  const card = document.createElement('aside');
  card.className = 'startup-guide';
  card.setAttribute('aria-label', L('Первый стартап', 'First startup'));
  card.innerHTML = `<div id="startup-guide-text" aria-live="polite" aria-atomic="true"><strong></strong><div class="guide-figure" hidden></div><p></p><p class="guide-choice" hidden></p></div><footer>` +
    `<button type="button" data-guide-dismiss>${L('Понятно', 'Got it')}</button>` +
    `<button type="button" data-guide-skip>${L('Пропустить обучение', 'Skip tutorial')}</button></footer>`;
  const description = card.querySelector('#startup-guide-text')!, title = card.querySelector('strong')!, text = card.querySelector('p')!;
  const figure = card.querySelector<HTMLElement>('.guide-figure')!, choice = card.querySelector<HTMLElement>('.guide-choice')!;
  let paper: HTMLElement | null = null, marked: HTMLElement | null = null;
  // A temporarily hidden tip must not pull the shelf back after the player scrolls away.
  let revealed = '';
  let lastDeal: Run['draft'] = null, example: DraftCard | undefined, focusSuggestion = false;
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
    show(step: GuideStep | null, run: Run): boolean {
      if (!step) { revealed = ''; return unavailable(); }
      paper ??= document.querySelector<HTMLElement>('#top .bl-over');
      if (!paper || document.hidden || document.querySelector('.tm.on, dialog[open], .sc-album:not([hidden])')) return unavailable();
      const draft = run.draft ? paper.querySelector<HTMLElement>('.sc-draft:not([hidden])') : null;
      if ((run.draft && !draft) || (draft && !['release', 'subscribed', 'ledger', 'compare', 'profitable'].includes(step))) return unavailable();
      if (!draft && paper.querySelector('.bl-call.on, .wb-client-panel:not([hidden]), .wb-module-panel:not([hidden]), .sc-draft:not([hidden])')) return unavailable();
      const parent = draft ?? paper;
      if (run.draft !== lastDeal) {
        lastDeal = run.draft;
        example = run.draft ? suggestedCard(run) : undefined;
        focusSuggestion = !!run.draft;
      }
      const suggested = draft && (step === 'release' || step === 'subscribed' || step === 'compare') ? example : undefined;
      const selector = draft ? (suggested ? `[data-sc-choice="${suggested.id}"]:enabled` : '.sc-report')
        : step === 'assign-promo' || step === 'park-agent' ? `[data-o="a${profitLesson(run).agentId}"][data-l="${step === 'assign-promo' ? 'promo' : 'build'}"]:enabled:not(.on)` : selectors[step];
      const viewKey = `${step}:${selector}:${run.lastReport?.sprint ?? 0}`;
      const stage = paper.getBoundingClientRect(), scale = stage.width / paper.clientWidth;
      if (!scale) return unavailable();
      const same = card.dataset.viewKey === viewKey && card.parentElement === parent;
      let target = same && marked?.isConnected && reachable(marked, card) ? marked : null;
      if (!target) {
        const candidates = [...parent.querySelectorAll<HTMLElement>(selector)];
        // The report can be below the fold in a tall deal. Use its visible heading instead.
        if (draft && !suggested) candidates.push(...draft.querySelectorAll<HTMLElement>('.sc-deal-header'));
        for (const node of candidates) {
          if (revealed !== viewKey && !draft) revealInShelf(node, scale);
          if (reachable(node, card)) { target = node; break; }
        }
        revealed = viewKey;
      }
      if (!target) return unavailable();
      const changed = marked !== target || !same;
      if (changed) {
        unmark();
        marked = target;
        target.setAttribute('data-guide-target', '');
        target.setAttribute('aria-describedby', description.id);
        card.dataset.viewKey = viewKey;
        card.dataset.guideStep = step;
        const tip = advice(step, run, target, target.matches(choices) ? example : undefined);
        title.textContent = tip.title ?? L('Первый стартап', 'First startup');
        figure.hidden = !tip.figure;
        figure.textContent = tip.figure ?? '';
        text.textContent = tip.body;
        choice.hidden = !tip.choice;
        choice.textContent = tip.choice ?? '';
        // The deal initially focuses its first card. Match that initial focus to the example,
        // then leave all mouse, number-key and Tab choices to the player.
        if (focusSuggestion && target.matches(choices) && document.activeElement === draft?.querySelector(choices)) {
          target.focus({ preventScroll: true });
        }
        focusSuggestion = false;
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
  };
}
