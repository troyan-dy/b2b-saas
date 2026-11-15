import './paper.css';
import { L } from '../core/lang';
import { createWorkbench, type WorkbenchAction, type WorkbenchView } from './workbench';
import { createClientCity, type CityView } from './client-city';
import { createSprintCards, type SprintCardsView } from './sprint-cards';
import type { SegmentId } from '../systems/company/market';

export interface ShelfItem {
  id: string;
  title: string;
  /** right after the title, coral: «×2», «строится» */
  mark?: string;
  note: string;
  /** said by the browser when the pointer rests on the card: the joke of the block */
  tip?: string;
  price: string;
  /** the price is money (green), not work */
  cash?: boolean;
  state: 'can' | 'poor' | 'off' | 'on';
  /** the card breathes: «click me» for a player who does not know yet that things are clicked */
  pulse?: boolean;
}

/** A row of small keys: the lanes of an agent, the founder's check, the hiring buttons. */
export interface ShelfKeys {
  /** which agent or «me» or «hire» these keys belong to */
  owner: string;
  /** a caption to the left of the keys: «№1 быстрый» */
  label?: string;
  /** the choice is made: the other keys are dimmed */
  lock?: boolean;
  keys: readonly { id: string; title: string; off?: boolean }[];
  on?: string;
}

export interface ShelfSection {
  id: string;
  title: string;
  hint?: string;
  /** one quiet line under the title: what unlocks the rest */
  note?: string;
  /** the cards are small tiles in two columns: many options seen at once */
  grid?: boolean;
  items?: readonly ShelfItem[];
  /** the cards scroll inside a box of this height, px */
  scroll?: number;
  rows?: readonly ShelfKeys[];
}
export interface Paper {
  /** `sub` is HTML: «<b class="hot">−$31</b> в секунду · денег на 2:13» */
  setMoney(text: string, sub: string, broke?: boolean): void;
  popMoney(): void;
  /** the sprint ruler: 0..1 and the caption to its left */
  setSprint(label: string, part: number): void;
  /** one line under the ruler: what the player is after right now (HTML) */
  setGoal(html: string): void;
  /** the ledger next to the money: every line of income and spending, and the debt (HTML rows) */
  setLedger(html: string): void;
  setNews(text: string, hint?: string): void;
  setShelf(sections: readonly ShelfSection[]): void;
  setWorkbench(view: WorkbenchView | null): void;
  setCity(view: CityView | null): void;
  setSprintCards(view: SprintCardsView | null): void;
  closeCardOverlay(): boolean;
  /** a row of the shelf answers a click */
  flash(section: string, item: string, how: 'bought' | 'denied'): void;
  /** a caption of a node; coordinates are screen pixels of the 1920×1080 layer */
  tag(id: string, x: number, y: number, html: string, cls?: string): void;
  dropTag(id: string): void;
  /** drops every caption whose id starts with `prefix` and is not in `keep` */
  pruneTags(prefix: string, keep: ReadonlySet<string>): void;
  /** clickable free cells of the product */
  setCells(cells: readonly { id: string; x: number; y: number; pulse?: boolean }[]): void;
  /** how much the sheet is zoomed: captions on the modules and the cells follow it */
  setZoom(z: number): void;
  /** Claude's card: lines of HTML, or null to hide it */
  term(lines: readonly string[] | null): void;
  /** a word that rises from a point and fades */
  pop(x: number, y: number, text: string, how: 'good' | 'bad' | ''): void;
  /** a call in the middle of the sheet; null hangs up */
  call(c: { who: string; text: string; options: readonly string[] } | null): void;
  /** everything but the paper itself: hidden while the terminal covers the sheet */
  show(on: boolean): void;
  onShelf: (section: string, item: string) => void;
  onLane: (owner: string, lane: string) => void;
  onCell: (id: string) => void;
  onAnswer: (index: number) => void;
  onWorkbench: (action: WorkbenchAction) => void;
  onCity: (segment: SegmentId | 'toggle') => void;
}

/**
 * The paper sheet in HTML: crisp text under and over the canvas. Shows what it is told, decides nothing;
 * clicks leave through the callbacks.
 */
export function createPaper(under: HTMLElement, over: HTMLElement): Paper {
  const sheet = document.createElement('div');
  sheet.className = 'bl';
  sheet.innerHTML =
    '<div class="bl-hud"><div class="bl-money"><b></b><span></span></div>' + '<div class="bl-sprint"><i></i><u><s></s></u></div><div class="bl-goal"></div><div class="bl-ledger"></div></div>';
  under.append(sheet);
  const top = document.createElement('div');
  top.className = 'bl-over';
  top.innerHTML =
    '<div class="bl-cells"></div><div class="bl-tags"></div><div class="bl-pops"></div>' +
    '<div class="bl-term"><i></i><div></div></div><div class="bl-call"></div>' +
    // the shelf and the news stand above the canvas: nothing drawn on the sheet may cover them
    `<div class="bl-shop"><div class="bl-shelf-body"></div></div><div class="bl-news"><i>${L('НОВОСТИ', 'NEWS')}</i><span></span><em></em></div>`;
  over.append(top);

  const hud = sheet.querySelector('.bl-hud') as HTMLElement;
  // Labels stay above the animated canvas; money can fly behind them.
  top.prepend(hud);
  const money = hud.querySelector('.bl-money') as HTMLElement;
  const moneyBig = money.querySelector('b') as HTMLElement;
  const moneySub = money.querySelector('span') as HTMLElement;
  const sprintLabel = hud.querySelector('.bl-sprint i') as HTMLElement;
  const sprintBar = hud.querySelector('.bl-sprint s') as HTMLElement;
  const goal = hud.querySelector('.bl-goal') as HTMLElement;
  const ledger = hud.querySelector('.bl-ledger') as HTMLElement;
  const shop = top.querySelector('.bl-shop') as HTMLElement;
  const shelfBody = shop.querySelector('.bl-shelf-body') as HTMLElement;
  const newsText = top.querySelector('.bl-news span') as HTMLElement;
  const newsHint = top.querySelector('.bl-news em') as HTMLElement;
  const cellLayer = top.querySelector('.bl-cells') as HTMLElement;
  const tagLayer = top.querySelector('.bl-tags') as HTMLElement;
  const popLayer = top.querySelector('.bl-pops') as HTMLElement;
  const termCard = top.querySelector('.bl-term') as HTMLElement;
  const termBody = termCard.querySelector('div') as HTMLElement;
  const callCard = top.querySelector('.bl-call') as HTMLElement;

  const tags = new Map<string, { el: HTMLElement; html: string; cls: string; x: number; y: number }>();
  let shelfSig = '';
  let cellSig = '';
  let callSig = '';
  let shelfSections: readonly ShelfSection[] = [];
  const cards = createSprintCards(top, (id) => paper.onWorkbench({ type: 'choose-card', id }));
  const workbench = createWorkbench(shop, top, (action) => paper.onWorkbench(action));
  const city = createClientCity(top, (segment) => paper.onCity(segment), () => paper.onCity('toggle'));
  const last = { money: '', sub: '', news: '', hint: '', sprint: '', part: -1, zoom: -1, goal: '', ledger: '' };

  const paper: Paper = {
    onShelf: () => undefined,
    onLane: () => undefined,
    onCell: () => undefined,
    onAnswer: () => undefined,
    onWorkbench: () => undefined,
    onCity: () => undefined,
    setCity: (view) => city.set(view),
    setSprintCards: (view) => cards.set(view),
    closeCardOverlay: () => cards.closeOverlay(),

    setMoney(text, sub, broke = false) {
      if (text !== last.money) {
        last.money = text;
        moneyBig.textContent = text;
      }
      if (sub !== last.sub) {
        last.sub = sub;
        moneySub.innerHTML = sub;
      }
      money.classList.toggle('broke', broke);
    },
    popMoney() {
      moneyBig.classList.remove('pop');
      void moneyBig.offsetWidth;
      moneyBig.classList.add('pop');
    },
    setSprint(label, part) {
      if (label !== last.sprint) {
        last.sprint = label;
        sprintLabel.textContent = label;
      }
      const p = Math.round(part * 200) / 2;
      if (p !== last.part) {
        last.part = p;
        sprintBar.style.width = `${p}%`;
      }
    },
    setGoal(html) {
      if (html === last.goal) return;
      last.goal = html;
      goal.innerHTML = html;
    },
    setLedger(html) {
      if (html === last.ledger) return;
      last.ledger = html;
      ledger.innerHTML = html;
    },
    setNews(text, hint = '') {
      if (text !== last.news) {
        last.news = text;
        newsText.textContent = text;
      }
      if (hint !== last.hint) {
        last.hint = hint;
        newsHint.textContent = hint;
      }
    },
    setShelf(sections) {
      shelfSections = sections;
      const shown = workbench.active
        ? sections.filter((section) => section.id !== 'blocks')
        : sections;
      const sig = JSON.stringify(shown);
      if (sig === shelfSig) return;
      shelfSig = sig;
      let html = '';
      for (const s of shown) {
        html += `<h2>${s.title}${s.hint ? `<em>${s.hint}</em>` : ''}</h2>`;
        if (s.note) html += `<p class="bl-note">${s.note}</p>`;
        if (s.scroll) html += `<div class="bl-scroll${s.grid ? ' grid' : ''}" style="max-height:${s.scroll}px">`;
        for (const it of s.items ?? []) {
          html +=
            `<div class="bl-item${s.grid ? ' tile' : ''} ${it.state === 'poor' ? '' : it.state === 'on' ? 'can on' : it.state}${it.pulse ? ' pulse' : ''}" data-s="${s.id}" data-i="${it.id}"${it.tip ? ` title="${it.tip.replace(/"/g, '&quot;')}"` : ''}>` +
            `<b>${it.title}${it.mark ? `<i>${it.mark}</i>` : ''}</b>` +
            `<span class="price${it.cash ? ' cash' : ''}">${it.price}</span>` +
            `<small>${it.note}</small></div>`;
        }
        if (s.scroll) html += '</div>';
        for (const r of s.rows ?? []) {
          const drop = r.keys.some((k) => k.id === 'drop');
          const cols = `${r.label ? '92px ' : ''}repeat(${r.keys.length - (drop ? 1 : 0)}, minmax(0, 1fr))${drop ? ' 30px' : ''}`;
          html += `<div class="bl-lanes${r.lock ? ' lock' : ''}" style="grid-template-columns:${cols}">`;
          if (r.label) html += `<p>${r.label}</p>`;
          for (const k of r.keys) {
            const cls = `${k.id === r.on ? 'on' : ''}${k.off ? ' off' : ''}${k.id === 'drop' ? ' drop' : ''}`;
            html += `<span class="${cls}" data-o="${r.owner}" data-l="${k.id}">${k.title}</span>`;
          }
          html += '</div>';
        }
      }
      // the list of blocks keeps its scroll position while the shelf is redrawn
      const box = shelfBody.querySelector('.bl-scroll');
      const at = box ? box.scrollTop : 0;
      shelfBody.innerHTML = html;
      const next = shelfBody.querySelector('.bl-scroll');
      if (next) next.scrollTop = at;
    },
    setWorkbench(view) {
      const active = workbench.active;
      workbench.set(view);
      shelfBody.inert = Boolean(view?.draft);
      cellLayer.inert = Boolean(view?.draft);
      callCard.inert = Boolean(view?.draft);
      if (active !== workbench.active) paper.setShelf(shelfSections);
    },
    flash(section, item, how) {
      const el = shop.querySelector(`.bl-item[data-s="${section}"][data-i="${item}"]`);
      if (!el) return;
      el.classList.remove('bought', 'denied');
      void (el as HTMLElement).offsetWidth;
      el.classList.add(how);
    },
    tag(id, x, y, html, cls = '') {
      let t = tags.get(id);
      if (!t) {
        const el = document.createElement('div');
        tagLayer.append(el);
        t = { el, html: '', cls: '\0', x: NaN, y: NaN };
        tags.set(id, t);
      }
      if (t.cls !== cls) {
        t.cls = cls;
        t.el.className = `bl-tag ${cls}`;
      }
      if (t.html !== html) {
        t.html = html;
        t.el.innerHTML = html;
      }
      const rx = Math.round(x);
      const ry = Math.round(y);
      if (t.x !== rx || t.y !== ry) {
        t.x = rx;
        t.y = ry;
        t.el.style.left = `${rx}px`;
        t.el.style.top = `${ry}px`;
      }
    },
    dropTag(id) {
      const t = tags.get(id);
      if (!t) return;
      t.el.remove();
      tags.delete(id);
    },
    pruneTags(prefix, keep) {
      for (const id of [...tags.keys()]) {
        if (id.startsWith(prefix) && !keep.has(id)) paper.dropTag(id);
      }
    },
    setCells(cells) {
      const sig = JSON.stringify(cells);
      if (sig === cellSig) return;
      cellSig = sig;
      cellLayer.innerHTML = cells
        .map((c) => `<div class="bl-cell${c.pulse ? ' pulse' : ''}" data-c="${c.id}" style="left:${Math.round(c.x)}px;top:${Math.round(c.y)}px"></div>`)
        .join('');
    },
    setZoom(z) {
      const v = Math.round(z * 1000) / 1000;
      if (v === last.zoom) return;
      last.zoom = v;
      top.style.setProperty('--z', String(v));
    },
    term(lines) {
      if (!lines) {
        termCard.classList.remove('on');
        return;
      }
      termBody.innerHTML = lines.join('\n');
      termCard.classList.add('on');
    },
    pop(x, y, text, how) {
      const el = document.createElement('div');
      el.className = `bl-pop ${how}`;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      popLayer.append(el);
      el.addEventListener('animationend', () => el.remove());
    },
    call(c) {
      const sig = JSON.stringify(c);
      if (sig === callSig) return;
      callSig = sig;
      if (!c) {
        callCard.classList.remove('on');
        return;
      }
      callCard.innerHTML =
        `<small>${c.who}</small><p>${c.text}</p>` + c.options.map((o, k) => `<div data-a="${k}">❯ ${k + 1}. ${o}</div>`).join('');
      callCard.classList.add('on');
    },
    show(on) {
      hud.style.visibility = on ? 'visible' : 'hidden';
      top.style.visibility = on ? 'visible' : 'hidden';
    },
  };

  shop.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const lane = t.closest('[data-l]') as HTMLElement | null;
    if (lane) {
      paper.onLane(lane.dataset.o ?? '', lane.dataset.l ?? '');
      return;
    }
    const item = t.closest('.bl-item') as HTMLElement | null;
    if (item) paper.onShelf(item.dataset.s ?? '', item.dataset.i ?? '');
  });
  cellLayer.addEventListener('click', (e) => {
    const cell = (e.target as HTMLElement).closest('.bl-cell') as HTMLElement | null;
    if (cell) paper.onCell(cell.dataset.c ?? '');
  });
  tagLayer.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-map]');
    if (button) paper.onCell(button.dataset.map ?? '');
  });
  callCard.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
    if (a) paper.onAnswer(Number(a.dataset.a));
  });

  return paper;
}
