import './terminal.css';
import { L } from '../../core/lang';

export interface Option {
  title: string;
  note?: string;
}

/** One of the few cards dealt to choose from: a picture, a name, a line of flavour and what it does. */
export interface Card {
  /** small caps over the name: which deck it is from */
  kicker?: string;
  title: string;
  note?: string;
  /** what it does, one fact a line */
  facts?: readonly string[];
  /** a picture of the sheet: its file name without the extension */
  art?: string;
  boost?: { current: string; doubled: string };
}

export interface CardOptions {
  confirm?: string;
  reroll?: {
    remaining: number;
    redraw(indices: readonly number[]): { cards: readonly Card[]; remaining: number };
  };
}

export interface Terminal {
  /** shows the terminal over the sheet; `title` goes into its bar */
  open(title: string): void;
  /** the pull-back: the terminal shrinks into the founder's laptop and is gone */
  leave(): Promise<void>;
  clear(): void;
  /** a line at once; `cls`: dim, big, mid, small */
  print(html: string, cls?: string): void;
  /** lines typed out; any key or click finishes them at once */
  type(lines: readonly string[], cls?: string): Promise<void>;
  /** a question with numbered answers: digits, arrows + Enter, or a click */
  ask(options: readonly Option[], hint?: string): Promise<number>;
  /** deals a few cards face up and waits for one to be picked: digits, arrows + Enter, or a click */
  cards(cards: readonly Card[], hint?: string, options?: CardOptions): Promise<number>;
  /** waits for Enter, Space or a click */
  wait(hint: string): Promise<void>;
  readonly shown: boolean;
}

const TYPE_MS = 14;

/** Claude's full-screen terminal. Shows text and collects answers; knows nothing about the game. */
export function createTerminal(root: HTMLElement, sound: (name: 'ui' | 'yes') => void): Terminal {
  const el = document.createElement('div');
  el.className = 'tm';
  el.innerHTML =
    '<div class="tm-win"><div class="tm-bar"><i></i><span></span><em>b2b-saas</em></div>' +
    '<div class="tm-body"></div><div class="tm-foot"></div></div>';
  root.append(el);
  const bar = el.querySelector('.tm-bar span') as HTMLElement;
  const body = el.querySelector('.tm-body') as HTMLElement;
  const foot = el.querySelector('.tm-foot') as HTMLElement;

  /** the thing that is waiting for input right now */
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  let onClick: ((e: MouseEvent) => void) | null = null;
  window.addEventListener('keydown', (e) => {
    if (!el.classList.contains('on') || el.classList.contains('leave')) return;
    onKey?.(e);
  });
  el.addEventListener('click', (e) => onClick?.(e));

  const line = (html: string, cls = ''): HTMLElement => {
    const p = document.createElement('p');
    p.className = `tm-line ${cls}`;
    p.innerHTML = html;
    body.append(p);
    return p;
  };

  const term: Terminal = {
    get shown() {
      return el.classList.contains('on');
    },
    open(title) {
      bar.textContent = title;
      el.classList.remove('leave');
      el.classList.add('on', 'enter');
    },
    leave() {
      return new Promise((resolve) => {
        el.classList.remove('enter');
        el.classList.add('leave');
        window.setTimeout(() => {
          el.classList.remove('on', 'leave');
          resolve();
        }, 900);
      });
    },
    clear() {
      body.innerHTML = '';
      foot.innerHTML = '';
      el.classList.remove('wide');
    },
    print(html, cls) {
      line(html, cls);
    },
    type(lines, cls) {
      return new Promise((resolve) => {
        // the markup is kept whole: only the text between the tags is typed
        const targets = lines.map((html) => ({ p: line('', cls), html }));
        let k = 0;
        let n = 0;
        let timer = 0;
        const finish = (): void => {
          window.clearInterval(timer);
          for (const t of targets) t.p.innerHTML = t.html;
          onKey = null;
          onClick = null;
          resolve();
        };
        const tick = (): void => {
          if (k >= targets.length) {
            finish();
            return;
          }
          const t = targets[k];
          const plain = t.html.replace(/<[^>]+>/g, '');
          n += 2;
          if (n >= plain.length) {
            t.p.innerHTML = t.html;
            k++;
            n = 0;
          } else t.p.textContent = plain.slice(0, n);
        };
        timer = window.setInterval(tick, TYPE_MS);
        onKey = () => finish();
        onClick = () => finish();
      });
    },
    ask(options, hint = '') {
      return new Promise((resolve) => {
        const box = document.createElement('div');
        box.className = 'tm-ask';
        box.innerHTML = options
          .map(
            (o, k) =>
              `<div class="tm-opt" data-k="${k}"><u>❯</u><span>${k + 1}.</span><span>${o.title}</span>${o.note ? `<small>${o.note}</small>` : ''}</div>`,
          )
          .join('');
        body.append(box);
        foot.innerHTML = `<kbd>1</kbd>–<kbd>${options.length}</kbd> ${L('выбрать', 'choose')} · <kbd>Enter</kbd> ${L('подтвердить', 'confirm')}${hint ? ` · ${hint}` : ''}`;
        const rows = [...box.querySelectorAll('.tm-opt')] as HTMLElement[];
        let at = 0;
        const mark = (): void => rows.forEach((r, k) => r.classList.toggle('on', k === at));
        mark();
        const pick = (k: number): void => {
          onKey = null;
          onClick = null;
          at = k;
          mark();
          sound('yes');
          // the chosen line flashes inverted for two frames, then the answer goes
          rows[k].classList.add('hit');
          window.setTimeout(() => {
            rows[k].classList.remove('hit');
            foot.innerHTML = '';
            resolve(k);
          }, 70);
        };
        onKey = (e) => {
          const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
          if (digit && Number(digit[1]) <= options.length) pick(Number(digit[1]) - 1);
          else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
            at = (at + 1) % options.length;
            mark();
            sound('ui');
          } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
            at = (at + options.length - 1) % options.length;
            mark();
            sound('ui');
          } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') pick(at);
        };
        onClick = (e) => {
          const row = (e.target as HTMLElement).closest('.tm-opt') as HTMLElement | null;
          if (row) pick(Number(row.dataset.k));
        };
        box.addEventListener('mousemove', (e) => {
          const row = (e.target as HTMLElement).closest('.tm-opt') as HTMLElement | null;
          if (row && Number(row.dataset.k) !== at) {
            at = Number(row.dataset.k);
            mark();
          }
        });
      });
    },
    cards(cards, hint = '', options = {}) {
      return new Promise((resolve) => {
        const box = document.createElement('div');
        box.className = `tm-cards${options.confirm ? ' tm-collection' : ''}${options.reroll ? ' tm-pitch' : ''}`;
        if (options.confirm || options.reroll) el.classList.add('wide');
        body.append(box);
        let all: HTMLElement[] = [];
        let at = -1;
        let selected = -1;
        let remaining = options.reroll?.remaining ?? 0;
        let finished = false;
        const marked = new Set<number>();
        const updateFooter = (): void => {
          if (options.reroll) {
            foot.innerHTML =
              `<div class="tm-actions"><span class="tm-reroll-count" aria-live="polite">${L('Перебросы', 'Rerolls')}: <b>${remaining}</b> · ${L('на весь питч', 'for the whole pitch')}</span>` +
              `<button class="tm-reroll" ${remaining === 0 || marked.size === 0 ? 'disabled' : ''}>${L(`Перебросить${marked.size ? ` (${marked.size})` : ''}`, `Reroll${marked.size ? ` (${marked.size})` : ''}`)}</button></div>` +
              `<span>${remaining > 0 ? L('Отметь ненужные карты. Остальные останутся.', 'Mark unwanted cards. The others stay.') : L('Перебросы закончились. Выбери карту.', 'No rerolls left. Pick a card.')} · <kbd>1</kbd>–<kbd>${cards.length}</kbd> ${L('взять', 'take')} · <kbd>R</kbd> ${L('перебросить', 'reroll')}</span>`;
          } else if (options.confirm) {
            foot.innerHTML =
              `<div class="tm-actions"><span aria-live="polite">${selected < 0 ? L('Отметь одну карту для усиления.', 'Select one card to boost.') : L(`Усилим: ${cards[selected].title}. Остальные тоже действуют.`, `Boost: ${cards[selected].title}. All others stay active.`)}</span>` +
              `<button class="tm-confirm" ${selected < 0 ? 'disabled' : ''}>${options.confirm}</button></div>` +
              `<span><kbd>1</kbd>–<kbd>${cards.length}</kbd> ${L('отметить', 'select')} · <kbd>←</kbd><kbd>→</kbd> ${L('смотреть', 'browse')} · <kbd>Enter</kbd> ${L('отметить / подтвердить', 'select / confirm')}${hint ? ` · ${hint}` : ''}</span>`;
          } else
            foot.innerHTML = `<kbd>1</kbd>–<kbd>${cards.length}</kbd> ${L('взять карту', 'take a card')} · <kbd>←</kbd><kbd>→</kbd> ${L('и', 'and')} <kbd>Enter</kbd>${hint ? ` · ${hint}` : ''}`;
        };
        const mark = (): void =>
          all.forEach((card, k) => {
            card.classList.toggle('on', k === at);
            card.classList.toggle('chosen', k === selected);
            const face = card.querySelector('.tm-face');
            if (options.confirm) face?.setAttribute('aria-pressed', String(k === selected));
            const state = card.querySelector('.tm-owned-state');
            if (state)
              state.textContent =
                k === selected ? L('Усилена ×2', 'Boosted ×2') : L('Действует', 'Active');
          });
        const render = (): void => {
          box.innerHTML = cards
            .map(
              (c, k) =>
                `<article class="tm-card" data-k="${k}"><button class="tm-face" type="button"><i>${k + 1}</i>` +
                `<span class="tm-art">${c.art ? `<img src="assets/img/nodes/${c.art}.webp" alt="">` : ''}</span>` +
                `${c.kicker ? `<small>${c.kicker}</small>` : ''}<b>${c.title}</b>${c.note ? `<span class="tm-note">${c.note}</span>` : ''}` +
                (c.boost
                  ? `<span class="tm-boost"><span class="tm-current">${c.boost.current}</span><strong>${c.boost.doubled}</strong></span><span class="tm-owned-state">${L('Действует', 'Active')}</span>`
                  : `<ul>${(c.facts ?? []).map((f) => `<li>${f}</li>`).join('')}</ul>`) +
                `</button>${options.reroll ? `<label class="tm-reroll-mark"><input type="checkbox" data-reroll="${k}" ${remaining === 0 ? 'disabled' : ''}>${L('Перебросить', 'Reroll')}</label>` : ''}</article>`,
            )
            .join('');
          all = [...box.querySelectorAll('.tm-card')] as HTMLElement[];
          mark();
          updateFooter();
        };
        render();
        const pick = (k: number): void => {
          if (finished) return;
          finished = true;
          onKey = null;
          onClick = null;
          sound('yes');
          all[k].classList.add('hit');
          // Owned perks stay visible: choosing the extra boost never discards the collection.
          if (!options.confirm) box.classList.add('done');
          foot.innerHTML = '';
          window.setTimeout(() => resolve(k), 420);
        };
        const choose = (k: number): void => {
          if (!options.confirm) return pick(k);
          selected = k;
          mark();
          updateFooter();
          sound('ui');
        };
        const reroll = (): void => {
          if (!options.reroll || remaining === 0 || marked.size === 0 || finished) return;
          const next = options.reroll.redraw([...marked]);
          cards = next.cards;
          remaining = next.remaining;
          marked.clear();
          at = -1;
          render();
          sound('yes');
        };
        box.addEventListener('change', (e) => {
          const input = e.target as HTMLInputElement;
          if (!input.matches('[data-reroll]')) return;
          const k = Number(input.dataset.reroll);
          if (input.checked) marked.add(k);
          else marked.delete(k);
          all[k].classList.toggle('marked', input.checked);
          updateFooter();
          sound('ui');
        });
        box.addEventListener('focusin', (e) => {
          const card = (e.target as HTMLElement).closest('.tm-card') as HTMLElement | null;
          if (card) {
            at = Number(card.dataset.k);
            mark();
          }
        });
        onKey = (e) => {
          // Let native buttons and checkboxes handle Tab + Enter/Space once.
          const target = e.target as HTMLElement;
          if (
            (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') &&
            target.matches('button, input') &&
            !(options.confirm && target.matches('.tm-face'))
          )
            return;
          const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
          if (digit && Number(digit[1]) <= cards.length) {
            e.preventDefault();
            choose(Number(digit[1]) - 1);
          } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
            e.preventDefault();
            at = (at + 1) % cards.length;
            mark();
            all[at].querySelector<HTMLButtonElement>('.tm-face')?.focus();
            sound('ui');
          } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
            e.preventDefault();
            at = at < 0 ? cards.length - 1 : (at + cards.length - 1) % cards.length;
            mark();
            all[at].querySelector<HTMLButtonElement>('.tm-face')?.focus();
            sound('ui');
          } else if (e.code === 'KeyR') {
            e.preventDefault();
            reroll();
          } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
            e.preventDefault();
            if (options.confirm && selected >= 0 && (at < 0 || at === selected)) pick(selected);
            else if (at >= 0) choose(at);
          }
        };
        onClick = (e) => {
          if ((e.target as HTMLElement).closest('.tm-confirm')) {
            if (selected >= 0) pick(selected);
            return;
          }
          if ((e.target as HTMLElement).closest('.tm-reroll')) {
            reroll();
            return;
          }
          if (!(e.target as HTMLElement).closest('.tm-face')) return;
          const card = (e.target as HTMLElement).closest('.tm-card') as HTMLElement | null;
          if (card) choose(Number(card.dataset.k));
        };
        box.addEventListener('mousemove', (e) => {
          const card = (e.target as HTMLElement).closest('.tm-card') as HTMLElement | null;
          const k = card ? Number(card.dataset.k) : -1;
          if (k !== at) {
            at = k;
            mark();
          }
        });
        box.addEventListener('mouseleave', () => {
          const focused = document.activeElement?.closest('.tm-card') as HTMLElement | null;
          at = focused && box.contains(focused) ? Number(focused.dataset.k) : -1;
          mark();
        });
      });
    },
    wait(hint) {
      return new Promise((resolve) => {
        foot.innerHTML = `<kbd>Enter</kbd> ${hint}`;
        const go = (): void => {
          onKey = null;
          onClick = null;
          foot.innerHTML = '';
          sound('yes');
          resolve();
        };
        onKey = (e) => {
          if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') go();
        };
        onClick = () => go();
      });
    },
  };
  return term;
}
