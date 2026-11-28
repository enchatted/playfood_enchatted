import { describe, it, expect } from 'vitest';
import { SOURCES, MISSION_SOURCES, getMissionSources } from './sources.js';

describe('verified sources registry', () => {
  it('every SOURCES entry has a title and a publisher', () => {
    for (const [key, src] of Object.entries(SOURCES)) {
      expect(src.title, `${key}.title`).toBeTruthy();
      expect(src.publisher, `${key}.publisher`).toBeTruthy();
    }
  });

  it('every MISSION_SOURCES key points to a real SOURCES entry (no dangling refs)', () => {
    for (const [mission, keys] of Object.entries(MISSION_SOURCES)) {
      for (const key of keys) {
        expect(SOURCES[key], `${mission} -> ${key}`).toBeDefined();
      }
    }
  });

  it('getMissionSources returns [] for an unknown mission', () => {
    expect(getMissionSources('NoSuchGame')).toEqual([]);
    expect(getMissionSources(undefined)).toEqual([]);
  });

  it('getMissionSources resolves a known mission to full citation objects', () => {
    const list = getMissionSources('WhereDoesItGrow');
    expect(list.length).toBeGreaterThan(0);
    for (const src of list) {
      expect(src).toHaveProperty('title');
      expect(src).toHaveProperty('publisher');
    }
  });
});
