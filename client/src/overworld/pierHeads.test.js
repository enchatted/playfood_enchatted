import { describe, it, expect } from 'vitest';
import { PIER_HEADS, MAP, isNavigable } from './mapData.js';
import { TILE } from './tileAtlas.js';
import { ISLANDS } from './overworldData.js';

// The mooring posts are placed either side of these tiles. If the rule that
// finds a pier head ever picks up an extra plank, or misses one, posts appear
// mid-pier or vanish from an island. These lock the geometry the art relies on.

describe('pier heads', () => {
  it('finds exactly one head per island', () => {
    expect(PIER_HEADS).toHaveLength(Object.keys(ISLANDS).length);
    const islands = PIER_HEADS.map((h) => h.island).sort();
    expect(islands).toEqual(Object.keys(ISLANDS).sort());
  });

  it('sits on a plank with water on both flanks', () => {
    for (const h of PIER_HEADS) {
      expect(MAP[h.row][h.col]).toBe(TILE.DOCK);
      expect(isNavigable(h.col - 1, h.row)).toBe(true);
      expect(isNavigable(h.col + 1, h.row)).toBe(true);
    }
  });

  it('is the seaward end, with open water straight ahead', () => {
    for (const h of PIER_HEADS) {
      const ahead = isNavigable(h.col, h.row - 1) || isNavigable(h.col, h.row + 1);
      expect(ahead).toBe(true);
    }
  });
});
