// Harbor room data — Living Diorama: bustling pirate port with cinematic pier.
// 28×15 FULL-BLEED map: at HARBOR_SCALE=1.5, the map (1344×720) overflows
// the 1280×704 canvas by 32px/side horizontally and 8px top/bottom,
// creating natural edge-clipping with no solid-color borders.
//
// Layout: town (rows 0-3), park (row 4), beach (row 5),
// shallow water belt (row 6), pier into deep water (rows 7-14).
// Player walks ONLY on DOCK tiles (cols 13-14) down the pier.
// Chris-Craft speedboat moored to the LEFT side of the pier at col 11, row 9.
// Main ship anchored far out in the deep water at col 24, row 11.

import { TILE } from './tileAtlas.js';
import { DIR } from './overworldData.js';

// Tile aliases for readable map layout
const W = TILE.BUILDING_WALL;   // 10 — building wall (non-walkable)
const B = TILE.BUILDING_DOOR;   // 11 — building door (non-walkable scenery)
const F = TILE.FLOOR_STONE;     // 15 — stone floor / market area
const T = TILE.TABLE;           // 16 — market stall / crate (non-walkable)
const P = TILE.PATH;            //  5 — town cobblestone road
const G = TILE.GRASS;           //  3 — park grass
const R = TILE.ROCK;            //  7 — boulder
const L = TILE.FLOWERS;         //  8 — flower beds
const V = TILE.TREE;            //  6 — tree
const A = TILE.SAND;            //  2 — beach sand
const K = TILE.DOCK;            //  9 — dock planks (WALKABLE)
const S = TILE.SHALLOW_WATER;   //  1 — shallow water
const D = TILE.DEEP_WATER;      //  0 — deep water

export const HARBOR_COLS = 28;
export const HARBOR_ROWS = 15;

// prettier-ignore
export const HARBOR_MAP = [
  //       0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27
  /* 0 */ [V, R, V, W, B, W, V, W, B, W, T, V, F, P, P, F, V, T, W, B, W, V, W, B, W, V, R, V],  // forest + back buildings
  /* 1 */ [G, V, R, W, F, F, T, F, F, T, F, L, F, P, P, F, L, F, T, F, F, T, F, F, W, R, V, G],  // town stalls
  /* 2 */ [R, G, L, F, W, B, W, W, T, V, F, F, F, P, P, F, F, V, T, W, W, B, W, F, L, G, R, V],  // main town (buildings + doors)
  /* 3 */ [V, G, G, F, W, F, F, T, F, L, F, F, F, P, P, F, F, F, L, F, T, F, F, W, G, G, V, R],  // town inner (stalls + flowers)
  /* 4 */ [R, V, G, L, G, G, V, G, G, G, L, G, G, P, P, G, G, L, G, G, G, V, G, G, L, G, V, R],  // park (grass, trees, flowers)
  /* 5 */ [A, A, A, A, A, A, A, A, A, A, A, A, A, K, K, A, A, A, A, A, A, A, A, A, A, A, A, A],  // beach — pier entrance
  /* 6 */ [S, S, S, S, S, S, S, S, S, S, S, S, S, K, K, S, S, S, S, S, S, S, S, S, S, S, S, S],  // shallow water belt
  /* 7 */ [D, S, S, D, S, S, S, S, S, S, S, S, S, K, K, S, S, S, S, S, S, S, S, D, S, S, D, D],  // PLAYER START — asymmetric deep
  /* 8 */ [D, D, S, S, D, S, S, D, S, S, S, S, S, K, K, S, S, S, S, S, D, S, S, S, D, D, D, D],  // scattered deep patches
  /* 9 */ [D, D, D, S, S, S, D, S, S, S, S, S, S, K, T, S, S, S, S, D, S, S, D, D, D, D, D, D],  // CAPTAIN (13) + CRATE (14), BOAT (16)
  /*10 */ [D, D, D, D, S, D, S, S, D, S, S, D, S, K, K, S, D, S, S, D, S, D, D, D, D, D, D, D],  // irregular deep/shallow mix
  /*11 */ [D, D, D, D, D, S, D, S, D, S, D, S, D, K, K, D, S, D, S, D, D, D, D, D, D, D, D, D],  // dock bottom — ragged edge
  /*12 */ [D, D, D, D, D, D, S, D, D, S, D, D, S, D, D, S, D, D, S, D, D, D, D, D, D, D, D, D],  // mostly deep, stray shallow
  /*13 */ [D, D, D, D, D, D, D, D, S, D, D, D, D, D, D, D, D, D, D, S, D, D, D, D, D, D, D, D],  // deep with rare shallow
  /*14 */ [D, D, D, D, D, D, D, D, D, D, D, S, D, D, D, D, S, D, D, D, D, D, D, D, D, D, D, D],  // deep bottom
];

// Player spawns mid-pier, facing down
export const HARBOR_PLAYER_START = { col: 13, row: 7, dir: DIR.DOWN };

// Captain NPC — blocks the path alongside the crate at col 14
export const CAPTAIN_POS = { col: 13, row: 9 };

// Chris-Craft speedboat — moored to the LEFT side of the pier
export const SMALL_BOAT_POS = { col: 11, row: 9 };

// Main ship — anchored far out in deep water (player takes speedboat to reach it)
export const MAIN_SHIP_POS = { col: 24, row: 11 };

// ─── Walkable tiles ──────────────────────────────────────

const WALKABLE_HARBOR_TILES = new Set([TILE.DOCK]);

export function isHarborWalkable(col, row) {
  if (col < 0 || col >= HARBOR_COLS || row < 0 || row >= HARBOR_ROWS) return false;
  if (!WALKABLE_HARBOR_TILES.has(HARBOR_MAP[row][col])) return false;
  if (col === CAPTAIN_POS.col && row === CAPTAIN_POS.row) return false;
  return true;
}

// ─── Face-adjacent detection ─────────────────────────────

const DIR_OFFSETS = [[0, 1], [0, -1], [-1, 0], [1, 0]]; // DOWN, UP, LEFT, RIGHT

export function isNearCaptain(col, row, dir) {
  const [dx, dy] = DIR_OFFSETS[dir];
  return (col + dx) === CAPTAIN_POS.col && (row + dy) === CAPTAIN_POS.row;
}

export function isNearBoat(col, row, dir) {
  // Proximity check — small rowboat is 2x size, moored to the left.
  // Player at pier edge (col 13) facing LEFT can see the boat within 1 tile.
  const [dx, dy] = DIR_OFFSETS[dir];
  const fx = col + dx;
  const fy = row + dy;
  return Math.abs(fx - SMALL_BOAT_POS.col) <= 1 && Math.abs(fy - SMALL_BOAT_POS.row) <= 1;
}
