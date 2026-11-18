import { channelGain } from './audio-math';
import { trackById, TRACKS } from './tracks';
export { TRACKS, nextTrack, trackTitle, type Track } from './tracks';

let audio: HTMLAudioElement | null = null;
let track = TRACKS[0];
let wanted = true;
let level = 100;
let started = false;

function apply(): void {
  if (!started) return;
  const volume = channelGain('music', wanted, level);
  if (volume === 0) {
    audio?.pause();
    return;
  }
  if (!audio) {
    audio = new Audio(track.file);
    audio.loop = true;
  }
  audio.volume = volume;
  if (audio.paused) void audio.play().catch(() => undefined); // A later user gesture can retry blocked autoplay.
}

/** The «Музыка» switch of the menu. */
export function setMusicOn(on: boolean, percent = 100): void {
  wanted = on;
  level = percent;
  apply();
}

/** Which loop plays; an unknown id leaves the first of the list. */
export function setTrack(id: string): void {
  const next = trackById(id);
  if (next === track) return;
  track = next;
  if (audio) audio.src = track.file;
  apply();
}


/** Try on page entry and again inside user gestures if autoplay was blocked. */
export function startMusic(): void {
  started = true;
  apply();
}
