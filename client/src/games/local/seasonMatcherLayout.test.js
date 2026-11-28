import { describe, expect, it } from 'vitest';
import { getSeasonMatcherGutterLayout } from './seasonMatcherLayout.js';

describe('getSeasonMatcherGutterLayout', () => {
  it('keeps side panels hidden when the room side band is below 180px', () => {
    expect(getSeasonMatcherGutterLayout(
      { left: 0, right: 1280 },
      { left: 0, right: 1280 },
    )).toEqual({
      wideGutters: false,
      leftWidth: 0,
      rightWidth: 0,
      leftOffset: 0,
      rightOffset: 0,
    });
  });

  it('uses the camera-safe side band without touching the rendered room', () => {
    expect(getSeasonMatcherGutterLayout(
      { left: 0, right: 1920 },
      { left: 0, right: 1920 },
    )).toEqual({
      wideGutters: true,
      leftWidth: 216,
      rightWidth: 216,
      leftOffset: 92,
      rightOffset: 92,
    });
  });

  it('caps very wide rails so ultrawide screens do not create giant cards', () => {
    expect(getSeasonMatcherGutterLayout(
      { left: 0, right: 3000 },
      { left: 0, right: 3000 },
    )).toEqual({
      wideGutters: true,
      leftWidth: 300,
      rightWidth: 300,
      leftOffset: 183.5,
      rightOffset: 183.5,
    });
  });
});
