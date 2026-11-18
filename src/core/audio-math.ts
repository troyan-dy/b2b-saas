const MAX_GAIN = { music: 0.3, effects: 0.25 };
const PENTATONIC = [0, 2, 4, 7, 9];

/** Convert the channel's 0–100 setting to the gain used by the audio device. */
export function channelGain(channel: keyof typeof MAX_GAIN, enabled: boolean, percent: number): number {
  return enabled ? MAX_GAIN[channel] * percent / 100 : 0;
}

export function transpose(hz: number, semitones: number): number {
  return hz * 2 ** (semitones / 12);
}

/** A random value in [0, 1) picks an agent's next note from the pentatonic scale. */
export function workNote(draw: number): number {
  return transpose(587, PENTATONIC[Math.floor(draw * PENTATONIC.length)]);
}
