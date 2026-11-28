// Lighthouse Trophy Hall — room geometry (20×15) + walkability.
// A walkable interior inside the world-map's central lighthouse where the
// player's progress is shown as tangible in-world objects (4 island plinths,
// the ambient lamp, compass, postbox), greeted by the Keeper mentor.
//
// Pure data + a pure walkability function — no rendering, no React.
// Tile ids are reused verbatim from tileAtlas.js.

import { TILE } from './tileAtlas.js';
import { DIR } from './overworldData.js';

// Tile aliases for readable map layout (mirrors islandRoomData.js)
const W = TILE.BUILDING_WALL;  // 10 — walls (non-walkable)
const S = TILE.FLOOR_STONE;    // 15 — stone floor (walkable)
const F = TILE.FLOOR_WOOD;     // 14 — wood floor (walkable)
const E = TILE.EXIT_MAT;       // 17 — exit marker (walkable, triggers leave)

export const LIGHTHOUSE_COLS = 20;
export const LIGHTHOUSE_ROWS = 15;

// 15 rows × 20 cols. Solid BUILDING_WALL border, open interior of wood/stone
// floor, EXIT_MAT at bottom-centre. Stations sit ON walkable floor tiles and
// are made non-walkable by isLighthouseWalkable (so the player stands next to
// them, never on them) — same trick island rooms use for NPCs/vignettes.
// prettier-ignore
export const LIGHTHOUSE_MAP = [
  //   0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19
  /* 0*/ [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  /* 1*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],  // bare top wall (no centre lamp)
  /* 2*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  /* 3*/ [W,F,F,S,F,F,F,S,F,F,F,F,S,F,F,F,S,F,F,W],  // 4 island plinths (cols 3,7,12,16)
  /* 4*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  /* 5*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  /* 6*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  /* 7*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  /* 8*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  /* 9*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],  // keeper (col 9)
  /*10*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  /*11*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  /*12*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  /*13*/ [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],  // player start (interior floor, bottom-centre)
  /*14*/ [W,W,W,W,W,W,W,W,W,E,E,W,W,W,W,W,W,W,W,W],  // exit mat in the bottom wall (cols 9-10)
];

// Player spawns on interior floor at the bottom-centre (row 13), facing UP —
// one tile ABOVE the exit mat (row 14), so the first Enter never bounces them
// straight back to the hub. Same convention as the island rooms.
export const LIGHTHOUSE_PLAYER_START = { col: 9, row: 13, dir: DIR.UP };

// Layout A — «Hall of Fame». 4 island plinths at row 3, cols 3/7/12/16 (spread
// evenly across the room). Central compass aisle runs down col 9 (drawn centred
// on CANVAS_W/2). The right wall is left clean. Bookshelf is floor-level
// furniture on the left wall at (2,10) near the keeper. Postbox in
// the bottom-right corner. Each station is non-walkable so the player stands adjacent.
export const LIGHTHOUSE_STATIONS = {
  plinths: [
    { island: 'growing',   col: 3,  row: 3 },   // top row, cols 3/7/12/16 — spread across room
    { island: 'local',     col: 7,  row: 3 },
    { island: 'foodwaste', col: 12, row: 3 },
    { island: 'circular',  col: 16, row: 3 },
  ],
  lamp:      { col: 9,  row: 1 },   // top-row anchor: sets the height of the two side metric plaques (no centre lamp)
  compass:   { col: 9,  row: 7 },   // central aisle sea-compass anchor
  qr:        { col: 17, row: 13 },  // bottom-right corner — postbox (phygital codes)
  bookshelf: { col: 2,  row: 10 },  // left wall, floor-level near the keeper
  shipyard:  { col: 5,  row: 11 },  // lower-left boat upgrade station
};

export const LIGHTHOUSE_SHIPYARD_FOOTPRINT = {
  leftCol: 4,
  topRow: 11,
  cols: 3,
  rows: 2,
};

// The library is a real 2×4-tile piece of furniture, not a one-tile prop.
// Renderer and collision both consume this footprint so the visible cabinet
// can never drift away from the space it occupies in the room.
export const LIGHTHOUSE_BOOKSHELF_FOOTPRINT = {
  leftCol: LIGHTHOUSE_STATIONS.bookshelf.col - 1,
  topRow: LIGHTHOUSE_STATIONS.bookshelf.row - 3,
  cols: 2,
  rows: 4,
};

const LIGHTHOUSE_BOOKSHELF_OCCUPIED = Array.from(
  { length: LIGHTHOUSE_BOOKSHELF_FOOTPRINT.cols * LIGHTHOUSE_BOOKSHELF_FOOTPRINT.rows },
  (_, index) => ({
    col: LIGHTHOUSE_BOOKSHELF_FOOTPRINT.leftCol
      + (index % LIGHTHOUSE_BOOKSHELF_FOOTPRINT.cols),
    row: LIGHTHOUSE_BOOKSHELF_FOOTPRINT.topRow
      + Math.floor(index / LIGHTHOUSE_BOOKSHELF_FOOTPRINT.cols),
  }),
);

const LIGHTHOUSE_SHIPYARD_OCCUPIED = Array.from(
  { length: LIGHTHOUSE_SHIPYARD_FOOTPRINT.cols * LIGHTHOUSE_SHIPYARD_FOOTPRINT.rows },
  (_, index) => ({
    col: LIGHTHOUSE_SHIPYARD_FOOTPRINT.leftCol
      + (index % LIGHTHOUSE_SHIPYARD_FOOTPRINT.cols),
    row: LIGHTHOUSE_SHIPYARD_FOOTPRINT.topRow
      + Math.floor(index / LIGHTHOUSE_SHIPYARD_FOOTPRINT.cols),
  }),
);

// The Keeper — stands at the foot of the central aisle (just above the player
// spawn) so he greets on arrival. Teal, reachable from the floor.
export const LIGHTHOUSE_MENTOR = { col: 9, row: 10, color: '#4DB6AC' };

// ─── Walkability ─────────────────────────────────────────
// Mirrors isRoomWalkable / isHarborWalkable: in-bounds, a walkable tile type,
// and not occupied by a station or the mentor (so the player can stand beside
// them but not on top of them).

const WALKABLE_LIGHTHOUSE_TILES = new Set([
  TILE.FLOOR_WOOD,
  TILE.FLOOR_STONE,
  TILE.EXIT_MAT,
]);

// ─── Ambient decor props (solid — block movement) ────────
// Reading nook + plants added as purely decorative fill.
// Rug and cat are purely visual (walkable) — not listed here.
export const DECOR_OCCUPIED = [
  // Armchair — bottom-right reading nook
  { col: 15, row: 11 },
  // Floor lantern — beside the armchair
  { col: 16, row: 12 },
  // Potted plant 1 — top-left of the nook
  { col: 13, row: 9 },
  // Potted plant 2 — top-right of the nook
  { col: 16, row: 9 },
];

// Flat list of every occupied (non-walkable) station/mentor tile.
const OCCUPIED = [
  ...LIGHTHOUSE_STATIONS.plinths,
  LIGHTHOUSE_STATIONS.lamp,
  LIGHTHOUSE_STATIONS.compass,
  LIGHTHOUSE_STATIONS.qr,
  ...LIGHTHOUSE_BOOKSHELF_OCCUPIED,
  ...LIGHTHOUSE_SHIPYARD_OCCUPIED,
  LIGHTHOUSE_MENTOR,
  ...DECOR_OCCUPIED,
];

/** Can the player walk onto this lighthouse tile? */
export function isLighthouseWalkable(col, row) {
  if (col < 0 || col >= LIGHTHOUSE_COLS || row < 0 || row >= LIGHTHOUSE_ROWS) return false;
  if (!WALKABLE_LIGHTHOUSE_TILES.has(LIGHTHOUSE_MAP[row][col])) return false;
  if (OCCUPIED.some((o) => o.col === col && o.row === row)) return false;
  return true;
}

function facingTile(player) {
  const delta = {
    [DIR.DOWN]: [0, 1],
    [DIR.UP]: [0, -1],
    [DIR.LEFT]: [-1, 0],
    [DIR.RIGHT]: [1, 0],
  }[player.dir] || [0, 0];
  return { col: player.col + delta[0], row: player.row + delta[1] };
}

export function isFacingLighthouseShipyard(player) {
  const target = facingTile(player);
  const fp = LIGHTHOUSE_SHIPYARD_FOOTPRINT;
  return target.col >= fp.leftCol
    && target.col < fp.leftCol + fp.cols
    && target.row >= fp.topRow
    && target.row < fp.topRow + fp.rows;
}

// ─── Trophy state (store → display) ──────────────────────
// Pure mapping from a store snapshot to "what lights up" in the hall. No store
// import, no React — fully unit-testable. Every value reads a REAL persisted
// field (data-honesty rule): nothing is invented. The renderer consumes this
// shape verbatim; per-game stars are a LATER phase and intentionally absent.

const ISLAND_SLUGS = ['growing', 'local', 'foodwaste', 'circular'];

/**
 * buildTrophyState(s) → { islands, points, codes, stars }
 * where s = { completedMissions, points, redeemedCodes, gameStars }.
 * `done = count === 3` (full island). `stars` is the sum of every per-game
 * star earned. All numeric fields default to 0/null.
 */
export function buildTrophyState(s = {}) {
  const completed = s.completedMissions || {};
  const islands = {};
  for (const slug of ISLAND_SLUGS) {
    const count = (completed[slug] || []).length;
    islands[slug] = { done: count === 3, count };
  }

  const stars = Object.values(s.gameStars || {}).reduce((a, b) => a + (b || 0), 0);

  return {
    islands,
    points: s.points || 0,
    codes: (s.redeemedCodes || []).length,
    stars,
  };
}

/**
 * pendingGoldCeremonies(trophy, seen) → string[]
 * Returns the slugs of islands that are done (3/3) but whose gold ceremony has
 * NOT yet been shown in the lighthouse. `seen` is the persisted
 * `lighthouseGoldSeen` array from the store. Pure — unit-testable.
 */
export function pendingGoldCeremonies(trophy, seen = []) {
  const islands = trophy?.islands;
  if (!islands) return [];
  return ISLAND_SLUGS.filter((slug) => islands[slug]?.done && !seen.includes(slug));
}

/**
 * Which island should the player tackle next? The UNfinished island with the
 * most missions already done (closest to its trophy); ties → canonical order.
 * null when every island is complete. Pure — drives the compass needle.
 */
export function nextIslandToTackle(trophy) {
  const islands = trophy?.islands;
  if (!islands) return null;
  let best = null;
  let bestCount = -1;
  for (const slug of ISLAND_SLUGS) {        // canonical order = stable tie-break
    const isl = islands[slug];
    if (!isl || isl.done) continue;
    if (isl.count > bestCount) { bestCount = isl.count; best = slug; }
  }
  return best;
}
