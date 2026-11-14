import './paper.css';

export interface ShelfItem {
  id: string;
  title: string;
  /** right after the title, coral: «×2», «строится» */
  mark?: string;
  note: string;
  price: string;
  /** the price is money (green), not work */
  cash?: boolean;
  state: 'can' | 'poor' | 'off' | 'on';
}

export interface ShelfLanes {
  /** which agent or «you» these keys belong to */
  owner: string;
  /** a caption above the keys: «агент №1 · быстрый» */
  label?: string;
  lanes: readonly { id: string; title: string }[];
  on: string;
}

export interface ShelfSection {
  id: string;
  title: string;
  hint?: string;
  items?: readonly ShelfItem[];
  lanes?: readonly ShelfLanes[];
}

export interface Paper {
  /** `sub` is HTML: «<b class="hot">−$31</b> в секунду · денег на 2:13» */
  setMoney(text: string, sub: string, broke?: boolean): void;
  popMoney(): void;
  /** the sprint ruler: 0..1 and the caption to its left */
  setSprint(label: string, part: number): void;
  setNews(text: string, hint?: string): void;
  setShelf(sections: readonly ShelfSection[]): void;
  /** a row of the shelf answers a click */
  flash(section: string, item: string, how: 'bought' | 'denied'): void;
  /** a caption of a node, sheet → screen coordinates are the caller's business */
  tag(id: string, x: number, y: number, html: string, cls?: string): void;
  dropTag(id: string): void;
  /** clickable free cells of the product */
  setCells(cells: readonly { id: string; x: number; y: number }[]): void;
  /** Claude's card: lines of HTML, or null to hide it */
  term(lines: readonly string[] | null): void;
  onShelf: (section: string, item: string) => void;
  onLane: (owner: string, lane: string) => void;
  onCell: (id: string) => void;
}

/**
 * The paper sheet in HTML: crisp text under and over the canvas. Shows what it is told, decides nothing;
 * clicks leave through the three callbacks.
 */
export function createPaper(under: HTMLElement, over: HTMLElement): Paper {
  const sheet = document.createElement('div');
  sheet.className = 'bl';
  sheet.innerHTML =
    '<div class="bl-money"><b></b><span></span></div>' +
    '<div class="bl-sprint"><i></i><u><s></s></u></div>' +
    '<div class="bl-shop"></div>' +
    '<div class="bl-news"><i>НОВОСТИ</i><span></span><em></em></div>';
  under.append(sheet);
  const top = document.createElement('div');
  top.className = 'bl-over';
  top.innerHTML = '<div class="bl-cells"></div><div class="bl-tags"></div><div class="bl-term"><i></i><div></div></div>';
  over.append(top);

  const money = sheet.querySelector('.bl-money') as HTMLElement;
  const moneyBig = money.querySelector('b') as HTMLElement;
  const moneySub = money.querySelector('span') as HTMLElement;
  const sprintLabel = sheet.querySelector('.bl-sprint i') as HTMLElement;
  const sprintBar = sheet.querySelector('.bl-sprint s') as HTMLElement;
  const shop = sheet.querySelector('.bl-shop') as HTMLElement;
  const newsText = sheet.querySelector('.bl-news span') as HTMLElement;
  const newsHint = sheet.querySelector('.bl-news em') as HTMLElement;
  const cellLayer = top.querySelector('.bl-cells') as HTMLElement;
  const tagLayer = top.querySelector('.bl-tags') as HTMLElement;
  const termCard = top.querySelector('.bl-term') as HTMLElement;
  const termBody = termCard.querySelector('div') as HTMLElement;

  const tags = new Map<string, { el: HTMLElement; html: string; cls: string; x: number; y: number }>();
  let shelfSig = '';
  let cellSig = '';
  const last = { money: '', sub: '', news: '', hint: '', sprint: '', part: -1 };

  const paper: Paper = {
    onShelf: () => undefined,
    onLane: () => undefined,
    onCell: () => undefined,

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
      const sig = JSON.stringify(sections);
      if (sig === shelfSig) return;
      shelfSig = sig;
      let html = '';
      for (const s of sections) {
        html += `<h2>${s.title}${s.hint ? `<em>${s.hint}</em>` : ''}</h2>`;
        for (const it of s.items ?? []) {
          html +=
            `<div class="bl-item ${it.state === 'poor' ? '' : it.state === 'on' ? 'can on' : it.state}" data-s="${s.id}" data-i="${it.id}">` +
            `<b>${it.title}${it.mark ? `<i>${it.mark}</i>` : ''}</b>` +
            `<span class="price${it.cash ? ' cash' : ''}">${it.price}</span>` +
            `<small>${it.note}</small></div>`;
        }
        for (const l of s.lanes ?? []) {
          if (l.label) html += `<p class="bl-who">${l.label}</p>`;
          html += '<div class="bl-lanes">';
          for (const lane of l.lanes) {
            html += `<span class="${lane.id === l.on ? 'on' : ''}" data-o="${l.owner}" data-l="${lane.id}">${lane.title}</span>`;
          }
          html += '</div>';
        }
      }
      shop.innerHTML = html;
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
      if (t.x !== x || t.y !== y) {
        t.x = x;
        t.y = y;
        t.el.style.left = `${Math.round(x)}px`;
        t.el.style.top = `${Math.round(y)}px`;
      }
    },
    dropTag(id) {
      const t = tags.get(id);
      if (!t) return;
      t.el.remove();
      tags.delete(id);
    },
    setCells(cells) {
      const sig = JSON.stringify(cells);
      if (sig === cellSig) return;
      cellSig = sig;
      cellLayer.innerHTML = cells
        .map((c) => `<div class="bl-cell" data-c="${c.id}" style="left:${Math.round(c.x)}px;top:${Math.round(c.y)}px"></div>`)
        .join('');
    },
    term(lines) {
      if (!lines) {
        termCard.classList.remove('on');
        return;
      }
      termBody.innerHTML = lines.join('\n');
      termCard.classList.add('on');
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

  return paper;
}
