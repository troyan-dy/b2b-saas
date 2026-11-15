import { loadSettings } from './settings';

export type Lang = 'ru' | 'en';

/** The language of this page: the address (`?lang=en`), then the choice made in the menu, then the browser. */
function pick(): Lang {
  try {
    const asked = new URLSearchParams(window.location.search).get('lang');
    if (asked === 'ru' || asked === 'en') return asked;
    return loadSettings().lang ?? (navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en');
  } catch {
    return 'ru'; // no browser around: the tests read the game in its first language
  }
}

/** Fixed for the whole page: the menu changes it by reloading. */
export const LANG: Lang = pick();

/** The same thing in both languages; the game says the one it runs in. */
export const L = <T>(ru: T, en: T): T => (LANG === 'en' ? en : ru);

/**
 * The balance files name things in Russian. The English words live in `<file>.en.json`, by id, and are
 * laid over a row here, so the numbers stay in one place. In Russian the row is taken as it is.
 */
export function worded<T extends { id: string }>(rows: readonly T[], en: Record<string, object>): T[] {
  return LANG === 'en' ? rows.map((r) => ({ ...r, ...en[r.id] })) : [...rows];
}
