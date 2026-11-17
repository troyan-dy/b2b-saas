import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { afterGameTime, setGamePaused } from '../src/core/pause-clock';
import { loadSettings } from '../src/core/settings';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
});
afterEach(() => {
  setGamePaused(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('keeps the remaining transition time across two pauses', () => {
  const finish = vi.fn();
  afterGameTime(finish, 1000);
  vi.advanceTimersByTime(200);
  setGamePaused(true);
  vi.advanceTimersByTime(9000);
  setGamePaused(false);
  vi.advanceTimersByTime(300);
  setGamePaused(true);
  vi.advanceTimersByTime(9000);
  setGamePaused(false);
  vi.advanceTimersByTime(499);
  expect(finish).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(finish).toHaveBeenCalledOnce();
});

it('preserves legacy mute and bounds each saved level independently', () => {
  vi.stubGlobal('localStorage', { getItem: () => '{"music":false,"soundVolume":132,"track":"lofi"}' });
  expect(loadSettings()).toEqual({ sound: true, music: false, soundVolume: 100, musicVolume: 100, track: 'lofi' });
});
