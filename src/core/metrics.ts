export interface Metrics {
  completed: boolean;
  presses: number;
  events: string[];
  /** every sound played, as `seconds:name` — the capture counts them: silent actions and one sound for everything show up here */
  sounds: string[];
}

declare global {
  interface Window {
    __metrics: Metrics;
    /** `run` — the startup on the sheet, in the gyms only: a capture script may push it into a state worth a frame */
    __GAME__: { ready: boolean; run?: unknown };
  }
}

/** What the frame capture reads back: tools/capture.mjs stores it in metrics.json. */
export const metrics: Metrics = { completed: false, presses: 0, events: [], sounds: [] };

export function installMetrics(): void {
  window.__metrics = metrics;
  window.__GAME__ = { ready: false };
}

export function logSound(name: string): void {
  if (metrics.sounds.length < 600) metrics.sounds.push(`${(performance.now() / 1000).toFixed(1)}:${name}`);
}

export function logEvent(name: string): void {
  if (metrics.events.length < 200) metrics.events.push(name);
}
