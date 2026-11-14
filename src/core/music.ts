/** The background music: one loop out of a short list, started by the first key press or click. */
export const TRACKS: readonly { id: string; title: string; file: string }[] = [
  { id: 'bossa', title: 'босса-нова для лифта', file: 'assets/audio/bossa_nova.ogg' },
  { id: 'lofi', title: 'лоу-фай', file: 'assets/audio/chill_lofi.ogg' },
  { id: 'shop', title: 'тема магазина', file: 'assets/audio/shop_theme.ogg' },
  { id: 'lobby', title: 'в лобби', file: 'assets/audio/in_the_lobby.ogg' },
];
const VOLUME = 0.3;

let audio: HTMLAudioElement | null = null;
let track = TRACKS[0];
let wanted = true;
let started = false;

function apply(): void {
  if (!started) return;
  if (!audio) {
    audio = new Audio(track.file);
    audio.loop = true;
    audio.volume = VOLUME;
  }
  if (wanted) void audio.play().catch(() => undefined); // no audio device or the browser said no: the game goes on in silence
  else audio.pause();
}

/** The «Музыка» switch of the menu. */
export function setMusicOn(on: boolean): void {
  wanted = on;
  apply();
}

/** Which loop plays; an unknown id leaves the first of the list. */
export function setTrack(id: string): void {
  const next = TRACKS.find((t) => t.id === id) ?? TRACKS[0];
  if (next === track) return;
  track = next;
  audio?.pause();
  audio = null;
  apply();
}

/** the id of the loop after `id` in the list, round and round */
export function nextTrack(id: string): string {
  const k = TRACKS.findIndex((t) => t.id === id);
  return TRACKS[(k + 1) % TRACKS.length].id;
}

export function trackTitle(id: string): string {
  return (TRACKS.find((t) => t.id === id) ?? TRACKS[0]).title;
}

/** Browsers start audio only after a gesture: call from the first key press or click. */
export function startMusic(): void {
  if (started) return;
  started = true;
  apply();
}
