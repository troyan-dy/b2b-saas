export interface Hud {
  setCount(text: string): void;
  setHint(text: string): void;
}

/** HTML layer over the canvas: crisp text. Reads state, decides nothing. */
export function createHud(root: HTMLElement): Hud {
  const count = document.createElement('div');
  count.className = 'hud-count';
  const hint = document.createElement('div');
  hint.className = 'hud-hint';
  root.append(count, hint);
  return {
    setCount(text) {
      count.textContent = text;
    },
    setHint(text) {
      hint.textContent = text;
    },
  };
}
