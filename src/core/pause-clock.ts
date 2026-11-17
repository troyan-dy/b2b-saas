// UI transitions share the same pause as the simulation, including the remaining delay.
type Timer = { remaining: number; started: number; handle?: number; callback: () => void };
const timers = new Set<Timer>();
export let gamePaused = false;

function arm(timer: Timer): void {
  timer.started = performance.now();
  timer.handle = window.setTimeout(() => {
    timers.delete(timer);
    timer.callback();
  }, timer.remaining);
}

export function afterGameTime(callback: () => void, ms: number): () => void {
  const timer: Timer = { callback, remaining: ms, started: 0 };
  timers.add(timer);
  if (!gamePaused) arm(timer);
  return () => {
    window.clearTimeout(timer.handle);
    timers.delete(timer);
  };
}

export function setGamePaused(value: boolean): void {
  if (gamePaused === value) return;
  gamePaused = value;
  for (const timer of timers) {
    if (value) {
      window.clearTimeout(timer.handle);
      timer.remaining = Math.max(0, timer.remaining - (performance.now() - timer.started));
    } else arm(timer);
  }
}
