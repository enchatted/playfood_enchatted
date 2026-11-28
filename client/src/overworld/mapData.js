// 60×40 tile map — "Sailing the Archipelago"
// Water is the navigable surface. Islands are landmasses (collision).
// The boat sails on water tiles and docks at island piers.

import { TILE } from './tileAtlas.js';
import { PHYGITAL_BUOY } from './overworldData.js';

const W = TILE.DEEP_WATER;    // 0  — navigable
const S = TILE.SHALLOW_WATER; // 1  — navigable
const A = TILE.SAND;          // 2  — land (collision)
const G = TILE.GRASS;         // 3  — land
const D = TILE.DARK_GRASS;    // 4  — land
const P = TILE.PATH;          // 5  — land
const T = TILE.TREE;          // 6  — land
const R = TILE.ROCK;          // 7  — land
const F = TILE.FLOWERS;       // 8  — land
const K = TILE.DOCK;          // 9  — navigable (boat entry point)
const U = TILE.BUOY;          // 13 — collision (interact from adjacent water)

export const MAP_COLS = 60;
export const MAP_ROWS = 40;

// Boat starts on open water near center
export const PLAYER_START = { col: 29, row: 22 };

// prettier-ignore
export const MAP = [
  // Row 0 — deep ocean border
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 1
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 2 — shallow ring appears around NW island
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 3 — NW island (Food Waste) & NE island (Local) shallow rings start
  [W,W,W,W,W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W,W,W,W,W],
  // Row 4 — sand borders
  [W,W,W,W,S,S,A,A,A,A,A,A,A,A,A,A,A,A,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,A,A,A,A,A,A,A,A,A,A,A,A,S,S,W,W,W,W],
  // Row 5 — island interiors begin
  [W,W,W,S,S,A,G,G,T,G,G,G,G,T,G,G,G,A,A,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,A,G,D,G,G,G,D,G,G,T,G,G,A,A,S,W,W,W,W],
  // Row 6
  [W,W,W,S,A,G,G,F,G,G,G,G,G,G,F,G,G,G,A,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,A,G,D,G,G,F,G,G,G,D,G,G,G,G,A,S,W,W,W,W],
  // Row 7 — upper interior
  [W,W,S,S,A,G,G,G,G,R,G,G,G,G,G,G,T,G,A,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,A,G,G,G,G,G,D,G,G,G,G,R,G,G,A,S,W,W,W,W],
  // Row 8
  [W,W,S,A,A,G,G,G,G,G,G,G,G,R,G,G,G,G,A,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,A,G,G,G,G,G,G,G,D,G,G,G,G,G,G,A,S,S,W,W,W],
  // Row 9 — mid interior
  [W,W,S,A,G,G,T,G,G,G,G,G,G,G,G,F,G,A,A,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,A,G,D,G,G,G,G,G,G,G,G,F,G,G,A,A,S,W,W,W,W],
  // Row 10
  [W,W,S,A,G,G,G,G,G,G,F,G,G,G,G,G,G,G,A,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,A,G,G,G,G,T,G,G,G,G,G,G,G,G,A,S,S,W,W,W,W],
  // Row 11 — lower interior
  [W,W,S,S,A,G,G,G,G,G,G,G,T,G,G,G,A,A,A,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,A,A,G,G,G,G,G,G,D,G,G,G,G,A,A,S,S,W,W,W,W],
  // Row 12 — sand edges + dock start
  [W,W,W,S,S,A,A,A,A,A,A,A,A,A,A,A,A,A,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,A,A,A,A,A,A,A,A,A,A,A,A,A,A,S,S,W,W,W,W,W],
  // Row 13 — shallow water + dock tiles extending south (2-wide pier)
  [W,W,W,S,S,S,S,S,S,S,S,S,K,S,S,S,S,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,S,S,S,S,S,S,S,K,S,S,S,S,S,S,W,W,W,W,W,W],
  // Row 14 — dock extends into water
  [W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 15 — dock continues — FOOD WASTE dock col 12-13, LOCAL dock col 47-48
  [W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 16 — dock end (boat stops here)
  [W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 17 — open water
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 18 — open water (central area)
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 19 — shallow ring around central buoy
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 20 — buoy at center (col 29)
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,U,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 21 — shallow ring below buoy
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 22 — open water (boat start row)
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 23 — dock end for bottom islands (boat stops here)
  [W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 24 — dock continues — CLIMATE dock col 12-13, CIRCULAR dock col 47-48
  [W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 25 — dock continues north toward islands
  [W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 26 — dock meets island shore (2-wide pier)
  [W,W,W,S,S,S,S,S,S,S,S,S,K,S,S,S,S,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,S,S,S,S,S,S,S,K,S,S,S,S,S,S,W,W,W,W,W,W],
  // Row 27 — SW island (Climate) & SE island (Circular) sand borders
  [W,W,W,S,S,A,A,A,A,A,A,A,A,A,A,A,A,A,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,A,A,A,A,A,A,A,A,A,A,A,A,A,A,S,S,W,W,W,W,W],
  // Row 28 — island interiors
  [W,W,S,S,A,G,G,G,G,G,R,G,G,G,G,G,G,A,A,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,A,G,F,G,G,G,G,G,G,G,F,G,G,A,A,S,W,W,W,W,W],
  // Row 29
  [W,W,S,A,G,G,G,G,G,G,G,G,G,R,G,G,G,G,A,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,A,G,G,G,G,G,F,G,G,G,G,G,G,G,G,A,S,W,W,W,W,W],
  // Row 30
  [W,W,S,A,G,G,T,G,G,G,G,G,G,G,G,F,G,G,A,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,A,G,G,G,G,G,G,G,T,G,G,G,G,G,G,A,S,W,W,W,W,W],
  // Row 31
  [W,W,S,A,G,G,G,G,R,G,G,G,G,G,G,G,G,A,A,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,A,G,G,G,G,G,G,G,G,G,G,F,G,G,A,A,S,W,W,W,W,W],
  // Row 32
  [W,W,S,S,A,G,G,G,G,G,T,G,G,G,G,G,A,A,A,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,A,G,G,G,T,G,G,G,G,G,G,G,A,A,S,S,W,W,W,W,W],
  // Row 33
  [W,W,W,S,S,A,A,A,G,G,G,G,A,A,A,A,A,A,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,A,A,G,G,G,G,A,A,A,A,A,A,S,S,W,W,W,W,W,W],
  // Row 34 — shallow water ring
  [W,W,W,W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W,W,W,W,W,W,W],
  // Row 35 — Recycling island dock
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,K,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 36 — Recycling island: sand border + dock
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,A,K,A,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 37 — Recycling island: grass center
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,A,G,G,G,A,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 38 — Recycling island: shallow ring
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,S,S,S,S,S,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  // Row 39
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

// ─── Navigation (boat movement) ─────────────────────────

const NAVIGABLE = new Set([
  TILE.DEEP_WATER,
  TILE.SHALLOW_WATER,
]);

/** Can the boat sail to this tile? */
export function isNavigable(col, row) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return false;
  return NAVIGABLE.has(MAP[row][col]);
}

// Legacy alias — keeps existing WorldMap.jsx working until Phase 3 rewrite
export const isWalkable = isNavigable;

// ─── Dock → Island mapping ──────────────────────────────

/** Returns island name when boat is adjacent to any DOCK tile, or null. */
export function getDockIsland(col, row) {
  const offsets = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [dx, dy] of offsets) {
    const nc = col + dx;
    const nr = row + dy;
    if (nc < 0 || nc >= MAP_COLS || nr < 0 || nr >= MAP_ROWS) continue;
    if (MAP[nr][nc] === TILE.DOCK) {
      // Recycling island dock (bottom-center, row >= 35)
      if (nr >= 35) return 'recycling';
      // Determine island by map quadrant
      if (nc < 30) return nr < 20 ? 'foodwaste' : 'growing';
      return nr < 20 ? 'local' : 'circular';
    }
  }
  return null;
}

// Legacy alias — keeps existing WorldMap.jsx working until Phase 3 rewrite
export const getDoorIsland = getDockIsland;

// ─── Pier heads (the seaward end of each pier) ──────────

// The tip of a pier is the plank with open water on both flanks and open water
// straight ahead: the point a boat rounds to come alongside. Derived from the
// map rather than listed by hand, so the mooring posts the renderer stands
// there cannot drift off the planks if the archipelago is ever redrawn.
export const PIER_HEADS = (() => {
  const heads = [];
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (MAP[row][col] !== TILE.DOCK) continue;
      const flanked = isNavigable(col - 1, row) && isNavigable(col + 1, row);
      const seaward = isNavigable(col, row - 1) || isNavigable(col, row + 1);
      if (!flanked || !seaward) continue;
      heads.push({ col, row, island: getDockIsland(col, row) });
    }
  }
  return heads;
})();

// ─── Buoy (phygital terminal) detection ─────────────────

/** Returns true if the boat is adjacent to the buoy (8-directional). */
export function isNearBuoy(col, row) {
  const b = PHYGITAL_BUOY;
  return Math.abs(b.col - col) <= 1 && Math.abs(b.row - row) <= 1
    && !(col === b.col && row === b.row);
}

// ─── Recycling island dock detection ─────────────────────

/** Returns true if the boat is adjacent to the recycling island dock. */
export function isNearRecyclingDock(col, row) {
  const offsets = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [dx, dy] of offsets) {
    const nc = col + dx;
    const nr = row + dy;
    if (nc < 0 || nc >= MAP_COLS || nr < 0 || nr >= MAP_ROWS) continue;
    if (MAP[nr][nc] === TILE.DOCK && nr >= 35) return true;
  }
  return false;
}

// ─── Deep water check (for debris / whale spawning) ─────

/** Returns true if the tile at (col, row) is deep ocean. */
export function isDeepWater(col, row) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return false;
  return MAP[row][col] === TILE.DEEP_WATER;
}

// ─── Island label positions (for name banners over landmasses) ──

export const ISLAND_SIGNS = [
  { col: 11, row: 8, island: 'foodwaste' },
  { col: 47, row: 8, island: 'local' },
  { col: 11, row: 30, island: 'growing' },
  { col: 47, row: 30, island: 'circular' },
  { col: 28, row: 37, island: 'recycling' },
];

// Legacy — no longer used (no buildings on sailing map) but kept to avoid import errors
export const ROOF_ACCENTS = [];
