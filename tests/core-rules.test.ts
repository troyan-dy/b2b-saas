import { afterEach, expect, it, vi } from 'vitest';
import { readArgs } from '../src/core/args';
import { afterGameTime, setGamePaused } from '../src/core/pause-clock';
import { loadSettings, saveSettings } from '../src/core/settings';
import { nextTrack, trackTitle, TRACKS } from '../src/core/tracks';

afterEach(() => {
  setGamePaused(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('ignores playtest parameters in the release and bounds the simulation speed in a gym', () => {
  vi.spyOn(Date, 'now').mockReturnValue(2 ** 32 + 81);
  vi.stubGlobal('__TOOLS__', false);
  const defaults = { seed: 81, gym: '', state: '', debug: false, capture: false, save: false, menu: false, bot: false, speed: 1, flags: [] };
  expect(readArgs('?gym=build&seed=9&speed=100&bot=1')).toEqual(defaults);
  vi.stubGlobal('__TOOLS__', true);
  expect(readArgs('')).toEqual(defaults);
  expect(readArgs('?seed=x&speed=-2')).toEqual(defaults);
  expect(readArgs('?speed=Infinity')).toEqual(defaults);
  expect(readArgs('?seed=0&speed=2.5&gym=sheet&state=clients&debug=1&capture=1&save=1&menu=1&bot=1&flags=a,,b')).toEqual({
    seed: 0, speed: 2.5, gym: 'sheet', state: 'clients', debug: true, capture: true, save: true, menu: true, bot: true, flags: ['a', 'b'],
  });
});

it('round-trips settings, rounds each volume and keeps defaults for missing or malformed records', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
  const defaults = { sound: true, music: true, soundVolume: 100, musicVolume: 100, track: 'chip' };
  expect(loadSettings()).toEqual(defaults);
  saveSettings({ sound: false, music: false, musicVolume: -8, soundVolume: 32.7, lang: 'en', track: 'path' });
  expect(loadSettings()).toEqual({ sound: false, music: false, musicVolume: 0, soundVolume: 33, lang: 'en', track: 'path' });
  for (const raw of ['{', 'null', '{"lang":"fr","track":true,"musicVolume":"99","soundVolume":1e400}']) {
    store.set('b2b-saas-settings', raw);
    expect(loadSettings()).toEqual(defaults);
  }
  vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota'); } });
  expect(() => saveSettings(defaults)).not.toThrow();
});

it.each([
  ['?lang=en', 'ru', 'ru-RU', 'en'],
  ['?lang=ru', 'en', 'en-US', 'ru'],
  ['?lang=fr', 'en', 'ru-RU', 'en'],
  ['', 'ru', 'en-US', 'ru'],
  ['', undefined, 'RU-ru', 'ru'],
  ['', undefined, 'de-DE', 'en'],
])('selects language for %s, setting %s and browser %s', async (search, lang, language, expected) => {
  vi.resetModules();
  vi.stubGlobal('window', { location: { search } });
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ lang }) });
  vi.stubGlobal('navigator', { language });
  const { LANG, L, worded } = await import('../src/core/lang');
  expect(LANG).toBe(expected);
  expect(L(1, 2)).toBe(expected === 'en' ? 2 : 1);
  const rows = [{ id: 'a', title: 'А', price: 8 }, { id: 'b', title: 'Б', price: 4 }];
  expect(worded(rows, { a: { title: 'A' } })).toEqual([{ ...rows[0], title: expected === 'en' ? 'A' : 'А' }, rows[1]]);
  expect(rows[0].title).toBe('А');
});

it('cancels pending timers and starts newly scheduled timers only after resuming', () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  const cancelled = vi.fn(), delivered = vi.fn();
  setGamePaused(true);
  const cancel = afterGameTime(cancelled, 200);
  afterGameTime(delivered, 100);
  cancel();
  vi.advanceTimersByTime(2000);
  expect(delivered).not.toHaveBeenCalled();
  setGamePaused(false);
  vi.advanceTimersByTime(99);
  expect(delivered).not.toHaveBeenCalled();
  vi.advanceTimersByTime(101);
  expect(delivered).toHaveBeenCalledOnce();
  expect(cancelled).not.toHaveBeenCalled();
});

it('cycles all music tracks and resolves unknown saved ids to the first track', () => {
  expect(TRACKS.map(t => nextTrack(t.id))).toEqual([...TRACKS.slice(1), TRACKS[0]].map(t => t.id));
  expect(nextTrack('removed')).toBe(TRACKS[0].id);
  expect(trackTitle('removed')).toBe(TRACKS[0].title.toLowerCase());
  expect(trackTitle('bossa')).toBe('босса-нова для лифта');
});
