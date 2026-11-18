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

/** the id of the loop after `id` in the list, round and round */
export function nextTrack(id: string): string {
  const k = TRACKS.findIndex((t) => t.id === id);
  return TRACKS[(k + 1) % TRACKS.length].id;
}

/** Old settings may name a track that is no longer in the catalogue. */
export function trackById(id: string): Track {
  return TRACKS.find((track) => track.id === id) ?? TRACKS[0];
}

/** the name of a loop as the menu writes it */
export function trackTitle(id: string): string {
  return trackById(id).title.toLowerCase();
}
