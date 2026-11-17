import { L } from './lang';

export interface Track {
  id: string;
  title: string;
  /** two or three words on how it sounds */
  mood: string;
  author: string;
  file: string;
}

/** The background music: one loop out of a list. All of it is CC0 from OpenGameArt. */
export const TRACKS: readonly Track[] = [
  { id: 'chip', title: L('Чиптюн', 'Chiptune'), mood: L('8 бит · ровный ритм', '8-bit · steady beat'), author: 'iamoneabe', file: 'assets/audio/chiploop.ogg' },
  { id: 'path', title: L('Забытая тропа', 'Forgotten Path'), mood: L('8 бит · задумчиво', '8-bit · thoughtful'), author: 'johndekale', file: 'assets/audio/forgotten_path.ogg' },
  { id: 'bossa', title: L('Босса-нова для лифта', 'Elevator Bossa Nova'), mood: L('иронично · 8 бит · бодро', 'ironic · 8-bit · upbeat'), author: 'Joth', file: 'assets/audio/bossa_nova.ogg' },
  { id: 'lofi', title: L('Лоу-фай', 'Lo-fi'), mood: L('бит для работы · тепло', 'beats to work to · warm'), author: 'omfgdude, qubodup', file: 'assets/audio/chill_lofi.ogg' },
];
const VOLUME = 0.3;

let audio: HTMLAudioElement | null = null;
let track = TRACKS[0];
let wanted = true;
let level = 100;
let started = false;

function apply(): void {
  if (!started) return;
  if (!wanted || level === 0) {
    audio?.pause();
    return;
  }
  if (!audio) {
    audio = new Audio(track.file);
    audio.loop = true;
  }
  audio.volume = VOLUME * level / 100;
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
  const next = TRACKS.find((t) => t.id === id) ?? TRACKS[0];
  if (next === track) return;
  track = next;
  if (audio) audio.src = track.file;
  apply();
}

/** the id of the loop after `id` in the list, round and round */
export function nextTrack(id: string): string {
  const k = TRACKS.findIndex((t) => t.id === id);
  return TRACKS[(k + 1) % TRACKS.length].id;
}

/** the name of a loop as the menu writes it */
export function trackTitle(id: string): string {
  return (TRACKS.find((t) => t.id === id) ?? TRACKS[0]).title.toLowerCase();
}

/** Try on page entry and again inside user gestures if autoplay was blocked. */
export function startMusic(): void {
  started = true;
  apply();
}
