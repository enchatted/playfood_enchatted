import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { track, trackFinal, __resetForTests } from './analytics.js';

beforeEach(() => {
  __resetForTests();
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ανθεκτικότητα — το παιχνίδι δεν πρέπει ΠΟΤΕ να σπάει', () => {
  it('το track πριν την αρχικοποίηση είναι αθόρυβο no-op', () => {
    expect(() => track('game_start', { island: 'growing', game: 'SoilDoctor' })).not.toThrow();
  });

  it('το trackFinal χωρίς sendBeacon δεν ρίχνει', () => {
    vi.stubGlobal('navigator', {});
    expect(() => trackFinal('session_end', { duration_s: 10 })).not.toThrow();
  });

  it('το track χωρίς fetch στο περιβάλλον δεν ρίχνει', () => {
    delete globalThis.fetch;
    expect(() => track('session_start')).not.toThrow();
  });
});
