import { ZZFX, zzfx as synth } from 'zzfx';
import { logSound } from './metrics';

export type SoundName = 'yes' | 'auto' | 'buffer' | 'waste' | 'buy' | 'quip' | 'scale' | 'finale' | 'ui' | 'all';

let unlocked = false;
let enabled = true;

/** The «Звук» switch of the menu. */
const playing = new Set<GainNode>();
export function setSoundOn(on: boolean, percent = 100): void {
  enabled = on;
  ZZFX.volume = on ? 0.25 * percent / 100 : 0;
  for (const gain of playing) gain.gain.value = ZZFX.volume;
}
ZZFX.volume = 0.25;

function zzfx(...parameters: number[]): void {
  const source = synth(...parameters);
  if (!source) return;
  playing.add(source.gainNode);
  source.addEventListener('ended', () => playing.delete(source.gainNode), { once: true });
}

/** Browsers start audio only after a gesture: call from the first key press or click. */
export function unlockSound(): void {
  if (unlocked) return;
  unlocked = true;
  void ZZFX.audioContext.resume();
}

/**
 * The single place sounds are played from. `step` raises the pitch of «Да» with each
 * approval of a task, so five presses climb and the payout resolves them.
 */
export function playSound(name: SoundName, step = 0): void {
  if (!unlocked || !enabled) return;
  if (__TOOLS__) logSound(name);
  switch (name) {
    case 'yes':
      zzfx(0.9, 0, 392 * 2 ** ((step * 2) / 12), 0.004, 0.02, 0.07, 1, 1.4);
      break;
    case 'auto':
      // the most frequent sound of the game: each square of an agent lands on its own note of a pentatonic
      zzfx(0.3, 0, 587 * 2 ** ([0, 2, 4, 7, 9][Math.floor(Math.random() * 5)] / 12), 0.002, 0.01, 0.04, 1, 1.2);
      break;
    case 'buy':
      // `step` — semitones: every kind of purchase has its own pitch
      zzfx(1, 0, 523 * 2 ** (step / 12), 0.004, 0.09, 0.3, 0, 1.4, 0, 0, 262 * 2 ** (step / 12), 0.06);
      break;
    case 'ui':
      zzfx(0.4, 0, 660, 0.001, 0.008, 0.03, 0, 1.4);
      break;
    case 'all':
      zzfx(1, 0, 523, 0.005, 0.12, 0.35, 0, 1.6, 0, 0, 262, 0.05, 0.06);
      break;
    case 'quip':
      zzfx(0.35, 0, 880, 0.002, 0.012, 0.06, 0, 1.7);
      break;
    case 'scale':
      zzfx(0.9, 0, 196, 0.03, 0.22, 0.5, 0, 1.3, 2.2, 0, 0, 0, 0, 0, 0, 0, 0.12);
      break;
    case 'finale':
      zzfx(1, 0, 392, 0.02, 0.3, 0.7, 0, 1.5, 0, 0, 196, 0.09, 0.1);
      break;
    case 'buffer':
      zzfx(0.5, 0, 262, 0.002, 0.01, 0.04, 1, 1);
      break;
    case 'waste':
      zzfx(0.45, 0, 98, 0.002, 0.02, 0.05, 2, 0.6);
      break;
  }
}
