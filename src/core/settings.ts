export interface Settings {
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
  /** the id of the background loop, see TRACKS in music.ts */
  track: string;
  /** chosen in the menu; absent — the browser decides */
  lang?: 'ru' | 'en';
}

const KEY = 'b2b-saas-settings';

/** What the player chose in the menu; survives a restart. */
export function loadSettings(): Settings {
  const s: Settings = { sound: true, music: true, soundVolume: 100, musicVolume: 100, track: 'chip' };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    if (typeof raw.sound === 'boolean') s.sound = raw.sound;
    if (typeof raw.music === 'boolean') s.music = raw.music;
    for (const key of ['musicVolume', 'soundVolume'] as const) {
      const value = raw[key];
      if (typeof value === 'number' && Number.isFinite(value)) s[key] = Math.max(0, Math.min(100, Math.round(value)));
    }
    if (typeof raw.track === 'string') s.track = raw.track;
    if (raw.lang === 'ru' || raw.lang === 'en') s.lang = raw.lang;
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
