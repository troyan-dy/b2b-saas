import { describe, expect, it } from 'vitest';
import { channelGain, transpose, workNote } from '../src/core/audio-math';
import { TRACKS, trackById } from '../src/core/tracks';
import { pointOnRoute, routeLength, type Pt } from '../src/view/geometry';

describe('distance along a map route', () => {
  // The diagonal is 5 units and the horizontal return is 6. The duplicate waypoints cost no distance.
  const route: Pt[] = [[1, 2], [1, 2], [4, 6], [4, 6], [-2, 6], [-2, 6]];

  it('measures travelled length, including a change of direction', () => {
    expect(routeLength(route)).toBe(11);
    expect(routeLength([])).toBe(0);
    expect(routeLength([[4, 6]])).toBe(0);
  });

  it('interpolates continuously across corners and clamps distances outside the route', () => {
    expect(pointOnRoute(route, -4)).toEqual([1, 2]);
    expect(pointOnRoute(route, 0)).toEqual([1, 2]);
    expect(pointOnRoute(route, 2.5)).toEqual([2.5, 4]);
    expect(pointOnRoute(route, 5)).toEqual([4, 6]);
    expect(pointOnRoute(route, 7)).toEqual([2, 6]);
    expect(pointOnRoute(route, 11)).toEqual([-2, 6]);
    expect(pointOnRoute(route, 15)).toEqual([-2, 6]);
  });

  it('keeps a zero-length route on its only position and rejects a missing starting point', () => {
    const repeated: Pt[] = [[8, 2], [8, 2]];
    expect(routeLength(repeated)).toBe(0);
    expect(pointOnRoute(repeated, 0)).toEqual([8, 2]);
    expect(pointOnRoute(repeated, 4)).toEqual([8, 2]);
    expect(pointOnRoute([[8, 2]], 1)).toEqual([8, 2]);
    expect(() => pointOnRoute([], 0)).toThrow(RangeError);
  });
});

describe('audio settings and notes', () => {
  it('converts independent music and effects sliders into playback levels and honours mute', () => {
    expect(channelGain('music', true, 100)).toBe(0.3);
    expect(channelGain('effects', true, 100)).toBe(0.25);
    expect(channelGain('music', true, 50)).toBe(0.15);
    expect(channelGain('effects', true, 20)).toBe(0.05);
    expect(channelGain('music', true, 0)).toBe(0);
    expect(channelGain('effects', false, 100)).toBe(0);
  });

  it('moves pitches by semitones in either direction and keeps the purchase tones in tune', () => {
    expect(transpose(392, 0)).toBe(392);
    expect(transpose(392, 12)).toBe(784);
    expect(transpose(392, -12)).toBe(196);
    expect(transpose(523, 7) / transpose(262, 7)).toBeCloseTo(523 / 262);
  });

  it('divides random work sounds evenly among five notes, including both ends of the random interval', () => {
    const samples = [0, 0.19999, 0.2, 0.4, 0.6, 0.8, 0.99999];
    // Frequencies in Hz, rounded to the nearest whole Hz.
    expect(samples.map(value => Math.round(workNote(value)))).toEqual([587, 587, 659, 740, 880, 987, 987]);
  });

  it('resolves the same track for playback and the menu after an old selection is removed', () => {
    expect(trackById('path')).toBe(TRACKS.find(t => t.id === 'path'));
    expect(trackById('removed')).toBe(TRACKS[0]);
  });
});
