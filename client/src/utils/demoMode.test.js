// demoMode.test.js — locks for the VITE_DEMO_ISLAND1 build flag.
// The default build MUST be inert: no island ever locks without the flag.
import { describe, it, expect } from 'vitest';
import { isDemoBuild, isIslandLocked } from './demoMode.js';

describe('isDemoBuild', () => {
  it('is false when the flag is absent (default build + vitest env)', () => {
    expect(isDemoBuild({})).toBe(false);
    expect(isDemoBuild()).toBe(false);
  });

  it('is true for "1" and "true"', () => {
    expect(isDemoBuild({ VITE_DEMO_ISLAND1: '1' })).toBe(true);
    expect(isDemoBuild({ VITE_DEMO_ISLAND1: 'true' })).toBe(true);
  });
});

describe('isIslandLocked', () => {
  it('locks exactly local, foodwaste, circular in demo mode', () => {
    for (const island of ['local', 'foodwaste', 'circular']) {
      expect(isIslandLocked(island, true), `${island} should lock`).toBe(true);
    }
    expect(isIslandLocked('growing', true)).toBe(false);
    expect(isIslandLocked('recycling', true)).toBe(false);
  });

  it('locks nothing outside demo mode (default build)', () => {
    for (const island of ['growing', 'local', 'foodwaste', 'circular', 'recycling']) {
      expect(isIslandLocked(island, false)).toBe(false);
      expect(isIslandLocked(island)).toBe(false);
    }
  });
});
