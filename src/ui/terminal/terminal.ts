import './terminal.css';

export interface Option {
  title: string;
  note?: string;
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
          .map((o, k) => `<div class="tm-opt" data-k="${k}"><u>❯</u><span>${k + 1}.</span><span>${o.title}</span>${o.note ? `<small>${o.note}</small>` : ''}</div>`)
          .join('');
        body.append(box);
        foot.innerHTML = `<kbd>1</kbd>–<kbd>${options.length}</kbd> выбрать · <kbd>Enter</kbd> подтвердить${hint ? ` · ${hint}` : ''}`;
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
