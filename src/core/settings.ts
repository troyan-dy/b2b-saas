export interface Settings {
  sound: boolean;
  music: boolean;
  /** the id of the background loop, see TRACKS in music.ts */
  track: string;
}

const KEY = 'b2b-saas-settings';

/** What the player chose in the menu; survives a restart. */
export function loadSettings(): Settings {
  const s: Settings = { sound: true, music: true, track: 'bossa' };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    if (typeof raw.sound === 'boolean') s.sound = raw.sound;
    if (typeof raw.music === 'boolean') s.music = raw.music;
    if (typeof raw.track === 'string') s.track = raw.track;
  } catch {
    // no storage or a broken record: the defaults will do
  }
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // the choice lives until the page is closed
  }
}
