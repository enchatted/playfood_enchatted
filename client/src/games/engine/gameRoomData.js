// Game room layouts — tile maps + interactive positions for walk-around mini-games.
// Uses same 20×15 grid as IslandRoom for rendering compatibility (OX=320, OY=112).

import { TILE } from '../../overworld/tileAtlas.js';

const W = TILE.BUILDING_WALL;
const F = TILE.FLOOR_WOOD;
const C = TILE.COUNTER;
const G = TILE.FRIDGE;
const D = TILE.FRIDGE_DOOR;
const T = TILE.TABLE;
const S = TILE.FLOOR_STONE;

// Walkable tiles in game rooms
const WALKABLE = new Set([TILE.FLOOR_STONE, TILE.FLOOR_WOOD]);

export function isGameRoomHudReserved(room, col, row) {
  return Boolean(room.hudReservedRects?.some((rect) => (
    col >= rect.left && col <= rect.right
    && row >= rect.top && row <= rect.bottom
  )));
}

export function isGameRoomWalkable(room, col, row) {
  if (col < 0 || col >= 20 || row < 0 || row >= 15) return false;
  const explicitlyBlocked = room.blockedTiles?.some((tile) => tile.col === col && tile.row === row);
  return WALKABLE.has(room.map[row][col])
    && !isGameRoomHudReserved(room, col, row)
    && !explicitlyBlocked;
}

// Market Trip booths occupy a real 3×2 footprint. Every tile along the front
// counter edge is interactive, so the usable area matches the visible booth.
function marketBooth(col, row, orientation) {
  const collisionRows = orientation === 'down' ? [row - 1, row] : [row, row + 1];
  return {
    col,
    row,
    orientation,
    collisionTiles: collisionRows.flatMap((collisionRow) => (
      [col - 1, col, col + 1].map((collisionCol) => ({ col: collisionCol, row: collisionRow }))
    )),
    interactionTiles: [col - 1, col, col + 1].map((interactionCol) => ({
      col: interactionCol,
      row,
    })),
    approach: {
      col,
      row: orientation === 'down' ? row + 1 : row - 1,
      // A booth facing down is approached from below (player looks UP), and
      // a booth facing up is approached from above (player looks DOWN).
      dir: orientation === 'down' ? 1 : 0,
    },
  };
}

export const GAME_ROOMS = {
  FridgeManager: {
    // Compact teaching kitchen. Cold storage sits at the top, pantry and compost
    // form the side arms, and all ten foods share one central preparation island.
    // The short routes keep the challenge on the storage decision, not walking time.
    // prettier-ignore
    map: [
      // Row 0: top wall — kitchen cabinets drawn over this
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      // Rows 1-3: freezer (5-7) and fridge (12-14)
      [W,F,F,F,F,T,T,T,F,F,F,F,T,T,T,F,F,F,F,W],
      [W,F,F,F,F,T,T,T,F,F,F,F,T,T,T,F,F,F,F,W],
      [W,F,F,F,F,T,T,T,F,F,F,F,T,T,T,F,F,F,F,W],
      // Row 4: approach lane for cold storage
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 5: approach lane for the top side of the preparation island
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Rows 6-8: cupboard (1-3), central island (5-14), compost (16-18)
      [W,T,T,T,F,C,C,C,C,C,C,C,C,C,C,F,T,T,T,W],
      [W,T,T,T,F,C,C,C,C,C,C,C,C,C,C,F,T,T,T,W],
      [W,T,T,T,F,C,C,C,C,C,C,C,C,C,C,F,T,T,T,W],
      // Row 9: bottom edge of the preparation island
      [W,F,F,F,F,C,C,C,C,C,C,C,C,C,C,F,F,F,F,W],
      // Row 10: approach lane for the bottom side of the island
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 11: helper's small information podium at col 2
      [W,F,C,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 12: player start lane
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 13: open lower walkway
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 14: bottom wall
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 9, row: 12, dir: 1 },

    preparationIsland: { left: 5, right: 14, top: 6, bottom: 9 },

    // Five foods on each approachable edge of one unified worktop.
    counterPositions: [
      { col: 5,  row: 6 }, { col: 7,  row: 6 }, { col: 9,  row: 6 },
      { col: 11, row: 6 }, { col: 13, row: 6 },
      { col: 5,  row: 9 }, { col: 7,  row: 9 }, { col: 9,  row: 9 },
      { col: 11, row: 9 }, { col: 13, row: 9 },
    ],

    // Four large 3×3 appliances. id ↔ fridgeData STORAGE_DESTINATIONS.
    bins: [
      { id: 'freezer',  tiles: [ { col: 5, row: 1 }, { col: 6, row: 1 }, { col: 7, row: 1 }, { col: 5, row: 2 }, { col: 6, row: 2 }, { col: 7, row: 2 }, { col: 5, row: 3 }, { col: 6, row: 3 }, { col: 7, row: 3 } ] },
      { id: 'fridge',   tiles: [ { col: 12, row: 1 }, { col: 13, row: 1 }, { col: 14, row: 1 }, { col: 12, row: 2 }, { col: 13, row: 2 }, { col: 14, row: 2 }, { col: 12, row: 3 }, { col: 13, row: 3 }, { col: 14, row: 3 } ] },
      { id: 'cupboard', tiles: [ { col: 1, row: 6 }, { col: 2, row: 6 }, { col: 3, row: 6 }, { col: 1, row: 7 }, { col: 2, row: 7 }, { col: 3, row: 7 }, { col: 1, row: 8 }, { col: 2, row: 8 }, { col: 3, row: 8 } ] },
      { id: 'compost',  tiles: [ { col: 16, row: 6 }, { col: 17, row: 6 }, { col: 18, row: 6 }, { col: 16, row: 7 }, { col: 17, row: 7 }, { col: 18, row: 7 }, { col: 16, row: 8 }, { col: 17, row: 8 }, { col: 18, row: 8 } ] },
    ],

    helper: { col: 2, row: 11, labelKey: 'fridge.helper_name' },

    // Emoji decorations — kitchen accents on the wall.
    decorations: [
      { col: 6,  row: 0, emoji: '🍳' },
      { col: 13, row: 0, emoji: '🔪' },
      { col: 1,  row: 13, emoji: '🪴' },
      { col: 18, row: 13, emoji: '🪴' },
    ],
  },

  MealPlanner: {
    // Walk-GRAB-CARRY redesign. Zoned room, demo-faithful:
    //   FRIDGE aisle (left, col 2+4 · lane col 3) — the home inventory you carry first.
    //   MARKET aisle (right, cols 15-17) — buy only the gaps, grouped by category.
    //   ONE central plate (TABLE cols 9-10) = the ACTIVE meal; the other 2 are dimmed "up next"
    //   HUD cards (no in-room clutter). CHEF mentor rendered bottom-left (sprite + bubble).
    // Every grab-tile has its own adjacent floor (face-tile) so checkInteraction(maxDist 1) is
    // unambiguous; clean walkable lanes, zero overlap.
    // prettier-ignore
    map: [
      // Row 0:  top wall
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      // Row 1:  HUD buffer (●○○ + up-next cards sit above the room)
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 2:  open floor / market lane entry
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 3:  carb market shelf (cols 15-17)
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,C,C,C,F,W],
      // Row 4:  fridge shelf (cols 2,4)
      [W,F,C,F,C,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 5:  protein market shelf (cols 15-17)
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,C,C,C,F,W],
      // Row 6:  fridge shelf + plate (cols 2,4; cols 9,10)
      [W,F,C,F,C,F,F,F,F,T,T,F,F,F,F,F,F,F,F,W],
      // Row 7:  plate + veg market shelf (cols 15-17)
      [W,F,F,F,F,F,F,F,F,T,T,F,F,F,F,C,C,C,F,W],
      // Row 8:  fridge shelf (cols 2,4)
      [W,F,C,F,C,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 9:  fruit market shelf (cols 15-17; player start at center)
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,C,C,C,F,W],
      // Row 10: open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 11: extra market shelf (cols 15-17)
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,C,C,C,F,W],
      // Row 12: open floor (chef bottom-left)
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 13: open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 14: bottom wall
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 9, row: 9, dir: 1 }, // center, just below the plate, facing UP

    // Fixed screen-space coach/control cards cover these central camera tiles.
    // Keep the wood visible, but reserve the tiles for collision so the player
    // can never disappear behind HUD; columns 5 and 14 remain side bypasses.
    hudReservedRects: [
      { left: 6, right: 13, top: 1, bottom: 2 },
      { left: 6, right: 13, top: 12, bottom: 13 },
    ],

    // FRIDGE — left aisle (6 home slots), staggered cols 2 & 4, reached from the col-3 lane.
    fridgeTiles: [
      { col: 2, row: 4 }, { col: 4, row: 4 },
      { col: 2, row: 6 }, { col: 4, row: 6 },
      { col: 2, row: 8 }, { col: 4, row: 8 },
    ],

    // MARKET — one fixed shelf per category. Each shelf can display up to three items.
    marketShelves: [
      { cat: 'carb', row: 3, cols: [15, 16, 17] },
      { cat: 'protein', row: 5, cols: [15, 16, 17] },
      { cat: 'veg', row: 7, cols: [15, 16, 17] },
      { cat: 'fruit', row: 9, cols: [15, 16, 17] },
      { cat: 'extra', row: 11, cols: [15, 16, 17] },
    ],

    // ONE central plate (the ACTIVE meal). 2×2 TABLE; approachable from all 4 sides.
    plateTiles: [
      { col: 9, row: 6 }, { col: 10, row: 6 },
      { col: 9, row: 7 }, { col: 10, row: 7 },
    ],
    plateCenter: { col: 10, row: 7 },

    // Chef mentor (rendered sprite + speech bubble; NOT a tile — never blocks the lane).
    chefPos: { col: 2.6, row: 11.4 },

    decorations: [
      { col: 3,  row: 0, emoji: '🍳' },
      { col: 16, row: 0, emoji: '🥕' },
    ],
  },

  FoodRescue: {
    // Industrial sorting center — conveyor belt in center, bins on sides.
    // Belt cols 9-10 are walkable FLOOR tiles rendered as conveyor overlay.
    // prettier-ignore
    map: [
      // Row 0:  top wall — industrial wall overlay
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      // Row 1:  belt spawn zone
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 2:  open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 3:  open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 4:  Donation Crate (cols 3-4) + Compost Bin (cols 16-17)
      [W,F,F,T,T,F,F,F,F,F,F,F,F,F,F,F,T,T,F,W],
      // Row 5:  crate/bin bottom half
      [W,F,F,T,T,F,F,F,F,F,F,F,F,F,F,F,T,T,F,W],
      // Row 6:  open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 7:  open floor (player start)
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 8:  open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 9:  open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 10: open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 11: open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 12: trash danger zone (belt end)
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 13: trash zone end
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 14: bottom wall
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 6, row: 7, dir: 1 }, // left of belt, facing UP

    // Conveyor belt columns + row range
    beltCols: [9, 10],
    beltRowStart: 1,
    beltRowEnd: 13, // items reaching this row are trashed

    // Donation crate — TABLE tiles (left side)
    donationTiles: [
      { col: 3, row: 4 }, { col: 4, row: 4 },
      { col: 3, row: 5 }, { col: 4, row: 5 },
    ],

    // Compost bin — TABLE tiles (right side)
    compostTiles: [
      { col: 16, row: 4 }, { col: 17, row: 4 },
      { col: 16, row: 5 }, { col: 17, row: 5 },
    ],

    // Emoji decorations — industrial accents
    decorations: [
      { col: 2,  row: 0, emoji: '🔧' },  // tool on wall
      { col: 17, row: 0, emoji: '🔧' },  // tool on wall
      { col: 1,  row: 7, emoji: '🪣' },  // bucket left
      { col: 18, row: 7, emoji: '🪣' },  // bucket right
      { col: 1,  row: 12, emoji: '⚠️' }, // warning near trash
      { col: 18, row: 12, emoji: '⚠️' }, // warning near trash
    ],
  },

  CompostCreator: {
    // Backyard sorting — grass floor, wooden fence, tree stumps, five bins.
    // FLOOR_STONE tiles rendered as grass via overlay. COUNTER = tree stumps.
    // 5 bins, 2×3 tiles each (96×144 px at zoom 1.5 — matches SM shelves + FridgeManager).
    // Centered horizontally: interior cols 1-18, 2-tile padding each side, 1-tile gaps between.
    // Cols: [3-4][6-7][9-10][12-13][15-16]  in pedagogical order: compost → plastic → carton → aluminium → battery.
    // prettier-ignore
    map: [
      // Row 0:  wooden fence (overlay)
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      // Row 1:  5 bins — top
      [W,S,S,T,T,S,T,T,S,T,T,S,T,T,S,T,T,S,S,W],
      // Row 2:  bin middle
      [W,S,S,T,T,S,T,T,S,T,T,S,T,T,S,T,T,S,S,W],
      // Row 3:  bin bottom
      [W,S,S,T,T,S,T,T,S,T,T,S,T,T,S,T,T,S,S,W],
      // Row 4:  buffer — breathing room between tall bins and stumps
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 5:  top stump row — cols 1, 6, 13, 18 (evenly spread, avoids bin shadows)
      [W,C,S,S,S,S,C,S,S,S,S,S,S,C,S,S,S,S,C,W],
      // Row 6:  buffer (player path)
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 7:  open (player start, col 9)
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 8:  middle stump row — cols 3, 8, 11, 16 (staggered, off-axis from rows 5/11)
      [W,S,S,C,S,S,S,S,C,S,S,C,S,S,S,S,C,S,S,W],
      // Row 9:  buffer
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 10: buffer
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 11: bottom stump row — cols 1, 6, 13, 18 (avoids decorations at cols 5, 14)
      [W,C,S,S,S,S,C,S,S,S,S,S,S,C,S,S,S,S,C,W],
      // Row 12: open (chef sits at col 16 — clear of stumps)
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 13: open (decoration: pot at col 9)
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 14: bottom fence
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 9, row: 7, dir: 1 }, // center, facing UP

    // 12 stump positions across 3 rows (5/8/11) — evenly spread vertically + horizontally,
    // middle row staggered for visual variety.
    counterPositions: [
      // Row 5 — top
      { col: 1,  row: 5 },
      { col: 6,  row: 5 },
      { col: 13, row: 5 },
      { col: 18, row: 5 },
      // Row 8 — middle (staggered)
      { col: 3,  row: 8 },
      { col: 8,  row: 8 },
      { col: 11, row: 8 },
      { col: 16, row: 8 },
      // Row 11 — bottom (mirrors row 5, avoids decoration plants at cols 5/14)
      { col: 1,  row: 11 },
      { col: 6,  row: 11 },
      { col: 13, row: 11 },
      { col: 18, row: 11 },
    ],

    // 5 bins, each 2 cols × 3 rows (TABLE tiles) → 96×144 px at zoom 1.5.
    // Centered: 2-tile padding each side, 1-tile gap between bins.
    // Visual config (color, emoji, labelKey) lives in client/src/data/compostItems.js → COMPOST_BINS.
    bins: [
      { id: 'compost',   tiles: [ { col: 3,  row: 1 }, { col: 4,  row: 1 }, { col: 3,  row: 2 }, { col: 4,  row: 2 }, { col: 3,  row: 3 }, { col: 4,  row: 3 } ] },
      { id: 'plastic',   tiles: [ { col: 6,  row: 1 }, { col: 7,  row: 1 }, { col: 6,  row: 2 }, { col: 7,  row: 2 }, { col: 6,  row: 3 }, { col: 7,  row: 3 } ] },
      { id: 'carton',    tiles: [ { col: 9,  row: 1 }, { col: 10, row: 1 }, { col: 9,  row: 2 }, { col: 10, row: 2 }, { col: 9,  row: 3 }, { col: 10, row: 3 } ] },
      { id: 'aluminium', tiles: [ { col: 12, row: 1 }, { col: 13, row: 1 }, { col: 12, row: 2 }, { col: 13, row: 2 }, { col: 12, row: 3 }, { col: 13, row: 3 } ] },
      { id: 'battery',   tiles: [ { col: 15, row: 1 }, { col: 16, row: 1 }, { col: 15, row: 2 }, { col: 16, row: 2 }, { col: 15, row: 3 }, { col: 16, row: 3 } ] },
    ],

    // Chef NPC position (bottom-right)
    chefPosition: { col: 16, row: 12 },

    // Decorations — flowers on fence, garden accents
    decorations: [
      { col: 3,  row: 0, emoji: '🌸' },
      { col: 6,  row: 0, emoji: '🌻' },
      { col: 9,  row: 0, emoji: '🌺' },
      { col: 12, row: 0, emoji: '🌼' },
      { col: 16, row: 0, emoji: '🌸' },
      { col: 5,  row: 11, emoji: '🌱' },
      { col: 14, row: 11, emoji: '🌱' },
      { col: 9,  row: 13, emoji: '🪴' },
    ],
  },

  LeftoverChef: {
    // Kitchen with central Rescue Pot — counters around edges, pot in center.
    // FLOOR_WOOD walkable. COUNTER = ingredient stations. TABLE = pot.
    // prettier-ignore
    map: [
      // Row 0:  kitchen wall (cabinets overlay)
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      // Row 1: clear space below the kitchen wall and goal banner
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 2:  open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 3: clear goal-banner zone
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Rows 4-9: two continuous six-place preparation benches.
      [W,F,F,C,C,F,F,F,F,F,F,F,F,F,F,C,C,F,F,W],
      [W,F,F,C,C,F,F,F,F,F,F,F,F,F,F,C,C,F,F,W],
      // Rows 6-7 also hold the central Rescue Pot (cols 9-10).
      [W,F,F,C,C,F,F,F,F,T,T,F,F,F,F,C,C,F,F,W],
      [W,F,F,C,C,F,F,F,F,T,T,F,F,F,F,C,C,F,F,W],
      [W,F,F,C,C,F,F,F,F,F,F,F,F,F,F,C,C,F,F,W],
      [W,F,F,C,C,F,F,F,F,F,F,F,F,F,F,C,C,F,F,W],
      // Row 10: open floor (player start)
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 11: open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 12: open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 13: open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 14: bottom wall
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 9, row: 10, dir: 1 }, // center, facing UP

    // Decorative kitchen assistants. Their tiles are blocked so the player never
    // walks through a character, while the central aisle remains completely open.
    kitchenStaff: [
      { col: 5, row: 11, paletteIndex: 4, dir: 3, activity: 'mix' },
      { col: 14, row: 11, paletteIndex: 3, dir: 2, activity: 'plate' },
    ],
    blockedTiles: [
      { col: 5, row: 11 },
      { col: 14, row: 11 },
    ],

    // Two compact vertical benches. Every station is reached from the inner aisle,
    // keeping selection unambiguous while shortening the walking distance.
    counterPositions: [
      { col: 4,  row: 4 }, { col: 4,  row: 5 }, { col: 4,  row: 6 },
      { col: 4,  row: 7 }, { col: 4,  row: 8 }, { col: 4,  row: 9 },
      { col: 15, row: 4 }, { col: 15, row: 5 }, { col: 15, row: 6 },
      { col: 15, row: 7 }, { col: 15, row: 8 }, { col: 15, row: 9 },
    ],

    // Rescue Pot — TABLE tiles (center)
    potTiles: [
      { col: 9, row: 6 }, { col: 10, row: 6 },
      { col: 9, row: 7 }, { col: 10, row: 7 },
    ],

    // Emoji decorations — kitchen accents
    decorations: [
      { col: 4,  row: 0, emoji: '🍳' },
      { col: 8,  row: 0, emoji: '🔪' },
      { col: 11, row: 0, emoji: '🧂' },
      { col: 15, row: 0, emoji: '🍳' },
      { col: 3,  row: 13, emoji: '🪴' },
      { col: 16, row: 13, emoji: '🪴' },
    ],
  },

  SeasonMatcher: {
    // Supermarket room — FridgeManager pattern with TWO product shelves
    // attached to top wall (left + right), replacing the single fridge.
    // Each shelf is 6 tiles tall: foods at every other row (1, 3, 5) with
    // a "price strip" rendered on the wood between them (rows 2, 4, 6) so
    // the tag sits inside the shelf wood like real supermarket price labels.
    // prettier-ignore
    map: [
      // Row 0: top wall
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      // Row 1: SHELF A (cols 4-5) food row + open + SHELF B (cols 14-15) food row
      [W,F,F,F,C,C,F,F,F,F,F,F,F,F,C,C,F,F,F,W],
      // Row 2: SHELF A price strip + SHELF B price strip
      [W,F,F,F,C,C,F,F,F,F,F,F,F,F,C,C,F,F,F,W],
      // Row 3: shelves food row
      [W,F,F,F,C,C,F,F,F,F,F,F,F,F,C,C,F,F,F,W],
      // Row 4: shelves price strip
      [W,F,F,F,C,C,F,F,F,F,F,F,F,F,C,C,F,F,F,W],
      // Row 5: shelves food row
      [W,F,F,F,C,C,F,F,F,F,F,F,F,F,C,C,F,F,F,W],
      // Row 6: shelves price strip (bottom)
      [W,F,F,F,C,C,F,F,F,F,F,F,F,F,C,C,F,F,F,W],
      // Row 7: open floor (front of shelves — interaction zone)
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 8: open floor (player start area)
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 9: open floor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Rows 10-11: three symmetric 2×2 checkout stations. The four free
      // segments (wall margins + gaps) are all exactly three tiles wide.
      [W,F,F,F,C,C,F,F,F,C,C,F,F,F,C,C,F,F,F,W],
      [W,F,F,F,C,C,F,F,F,C,C,F,F,F,C,C,F,F,F,W],
      // Row 12: NPC exit corridor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 13: exit corridor
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      // Row 14: bottom wall
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 10, row: 8, dir: 1 }, // center, facing UP toward shelves

    // 2 product shelves at top wall — bounding boxes for the wooden cabinet visual
    productShelves: [
      { minCol: 4,  maxCol: 5,  minRow: 1, maxRow: 6 },
      { minCol: 14, maxCol: 15, minRow: 1, maxRow: 6 },
    ],

    // 12 food positions — 6 per shelf, foods at rows 1/3/5 (every other row).
    // The row directly below each food (2/4/6) renders the price strip.
    foodPositions: [
      // Shelf A (cols 4-5, rows 1/3/5)
      { col: 4, row: 1 }, { col: 5, row: 1 },
      { col: 4, row: 3 }, { col: 5, row: 3 },
      { col: 4, row: 5 }, { col: 5, row: 5 },
      // Shelf B (cols 14-15, rows 1/3/5)
      { col: 14, row: 1 }, { col: 15, row: 1 },
      { col: 14, row: 3 }, { col: 15, row: 3 },
      { col: 14, row: 5 }, { col: 15, row: 5 },
    ],

    // Visual centers sit between each station's two tiles. Fractional columns
    // keep margins and gaps optically identical across the 18-tile interior.
    cashierCenters: [4.5, 9.5, 14.5],

    // Both tiles of each station accept checkout interaction from row 9.
    checkoutTiles: [
      { col: 4,  row: 10 }, { col: 5,  row: 10 },
      { col: 9,  row: 10 }, { col: 10, row: 10 },
      { col: 14, row: 10 }, { col: 15, row: 10 },
    ],

    // Customer NPC lanes — avoid shelf cols (4-5, 14-15) so they don't overlap
    npcCustomerCols: [8, 10, 12],

    // Decorations — plants only. Cashier registers are now drawn by
    // renderCashierStations (proper counter + register sprite, no emoji).
    decorations: [
      { col: 2,  row: 5, emoji: '🪴' },
      { col: 17, row: 5, emoji: '🪴' },
    ],
  },

  MarketTrip: {
    // Guided market street — two rows of four solid booths with a wide central
    // walking route. FLOOR_STONE is walkable; every COUNTER belongs to a booth
    // footprint and cannot be crossed by the player.
    // prettier-ignore
    map: [
      // Row 0: market wall / fence
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      // Row 1: upper buffer
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Rows 2–3: four upper 3×2 booths, facing down
      [W,S,C,C,C,S,C,C,C,S,S,C,C,C,S,C,C,C,S,W],
      [W,S,C,C,C,S,C,C,C,S,S,C,C,C,S,C,C,C,S,W],
      // Row 4: upper approach lane
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Rows 5–9: central market street
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 10: lower approach lane
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Rows 11–12: four lower 3×2 booths, facing up
      [W,S,C,C,C,S,C,C,C,S,S,C,C,C,S,C,C,C,S,W],
      [W,S,C,C,C,S,C,C,C,S,S,C,C,C,S,C,C,C,S,W],
      // Row 13: lower buffer
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 14: market wall / fence
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 10, row: 9, dir: 1 },

    // The four upper interaction tiles are approached from row 4; the four
    // lower ones from row 10. Product data is shuffled over these eight booths.
    stallPositions: [
      marketBooth(3, 3, 'down'),
      marketBooth(7, 3, 'down'),
      marketBooth(12, 3, 'down'),
      marketBooth(16, 3, 'down'),
      marketBooth(3, 11, 'up'),
      marketBooth(7, 11, 'up'),
      marketBooth(12, 11, 'up'),
      marketBooth(16, 11, 'up'),
    ],

    // In-room mentor «Η Μανάβισσα» (R1 directive — female grocer, leading actor).
    // Stationed at the LEFT edge of the square — off the central walk path so she
    // never blocks the player crossing to the stalls. Her bubble opens rightward
    // into the room and is edge-clamped + auto-decays (renderMentor).
    mentorPos: { col: 2, row: 8 },

    // Decorations stay at the perimeter, outside the main walking and approach
    // lanes. Booth art supplies the produce/crates, so loose items no longer
    // look like unexplained pick-ups in the middle of the market.
    decorations: [
      { col: 5,  row: 0, emoji: '🏮' },
      { col: 10, row: 0, emoji: '🏮' },
      { col: 15, row: 0, emoji: '🏮' },
      { col: 5,  row: 7, emoji: '🪴' },
      { col: 14, row: 7, emoji: '🪴' },
    ],
  },

  SpotTheFake: {
    // Food Detective supermarket — two vertical three-product shelf banks frame
    // one generous central aisle. Products are approached from the inner shelf
    // edge, so the room reads like a shop instead of a row of floating cards.
    // prettier-ignore
    map: [
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,C,C,C,C,F,F,F,F,F,F,F,F,F,F,C,C,C,C,W],
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 9, row: 12, dir: 1 },

    // Product identity owns package art; slots own only layout and approach.
    // LEFT shelves are approached from col 5, RIGHT shelves from col 14.
    productSlots: [
      { col: 4,  row: 3,  area: 'left',  approach: { col: 5,  row: 3,  dir: 2 } },
      { col: 4,  row: 7,  area: 'left',  approach: { col: 5,  row: 7,  dir: 2 } },
      { col: 4,  row: 11, area: 'left',  approach: { col: 5,  row: 11, dir: 2 } },
      { col: 15, row: 3,  area: 'right', approach: { col: 14, row: 3,  dir: 3 } },
      { col: 15, row: 7,  area: 'right', approach: { col: 14, row: 7,  dir: 3 } },
      { col: 15, row: 11, area: 'right', approach: { col: 14, row: 11, dir: 3 } },
    ],

    productAreas: [
      { id: 'left', minCol: 1, maxCol: 4, minRow: 1, maxRow: 13 },
      { id: 'right', minCol: 15, maxCol: 18, minRow: 1, maxRow: 13 },
    ],

    // The Guide is a friendly, non-blocking presence at the top of the aisle.
    labelGuide: {
      col: 9,
      row: 1,
      nameKey: 'spotthefake.guide_name',
      hintKey: 'spotthefake.guide_hint',
    },

    // Six slow ambient shoppers. Four use carts while two edge shoppers use
    // baskets, keeping the centre lively without turning it into a traffic jam.
    // Their lanes stay one full column away from
    // every product approach, so they can never cover an interaction cue.
    ambientShopperPaths: [
      {
        id: 'left-reader',
        points: [
          { col: 7, row: 3 },
          { col: 7, row: 7 },
          { col: 7, row: 11 },
          { col: 8, row: 7 },
        ],
      },
      {
        id: 'right-reader',
        points: [
          { col: 12, row: 11 },
          { col: 12, row: 7 },
          { col: 12, row: 3 },
          { col: 11, row: 7 },
        ],
      },
      {
        id: 'centre-browser',
        points: [
          { col: 9, row: 4 },
          { col: 10, row: 4 },
          { col: 10, row: 10 },
          { col: 9, row: 10 },
        ],
      },
      {
        id: 'centre-shopper',
        points: [
          { col: 11, row: 11 },
          { col: 11, row: 5 },
          { col: 10, row: 5 },
          { col: 10, row: 11 },
        ],
      },
      {
        id: 'top-basket',
        hasCart: false,
        points: [
          { col: 6, row: 1 },
          { col: 7, row: 1 },
          { col: 7, row: 2 },
          { col: 6, row: 2 },
        ],
      },
      {
        id: 'bottom-basket',
        hasCart: false,
        points: [
          { col: 13, row: 13 },
          { col: 12, row: 13 },
          { col: 12, row: 12 },
          { col: 13, row: 12 },
        ],
      },
    ],

    floorDecals: [
      { col: 9, row: 5, symbol: '⌕' },
      { col: 10, row: 9, symbol: '⌕' },
    ],

    decorations: [
      { col: 2,  row: 0,  emoji: '💡', solid: true },
      { col: 17, row: 0,  emoji: '💡', solid: true },
      { col: 2,  row: 14, emoji: '🪴', solid: true },
      { col: 17, row: 14, emoji: '🪴', solid: true },
    ],
  },

  CircularCity: {
    // Neighborhood — stone streets (walkable). Top row = 5 delivery hubs; bottom row =
    // the home "pile" of 8 resources; centre = the community heart (loop-token target).
    // Default isGameRoomWalkable (FLOOR_STONE) — no custom set.
    // prettier-ignore
    map: [
      // Row 0: wall
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      // Row 1: plaza in front of the hubs
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 2: 5 hubs (C) — repair3, share6, recycle9, compost12, landfill16
      [W,S,S,C,S,S,C,S,S,C,S,S,C,S,S,S,C,S,S,W],
      // Row 3: street (deliver from here, facing UP)
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 4: open street
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 5: open street
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 6: open street (community heart drawn at col 9)
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 7: open street
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 8: open street
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 9: open street
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 10: open street
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 11: home pile — 8 resource slots (C) at cols 6-13
      [W,S,S,S,S,S,C,C,C,C,C,C,C,C,S,S,S,S,S,W],
      // Row 12: street (pick up from here, facing UP)
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 13: street
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      // Row 14: wall
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 9, row: 12, dir: 1 }, // by the home pile, facing UP

    // 5 delivery hubs (row 2). Matched to HUBS data by `key`.
    hubTiles: {
      repair:   { col: 3,  row: 2 },
      share:    { col: 6,  row: 2 },
      recycle:  { col: 9,  row: 2 },
      compost:  { col: 12, row: 2 },
      landfill: { col: 16, row: 2 },
    },

    // 8 home-pile slots (row 11). Deck of 8 maps 1:1 (deck[i] → slot i).
    resourceSlots: [
      { col: 6,  row: 11 }, { col: 7,  row: 11 }, { col: 8,  row: 11 }, { col: 9,  row: 11 },
      { col: 10, row: 11 }, { col: 11, row: 11 }, { col: 12, row: 11 }, { col: 13, row: 11 },
    ],

    // Community heart — loop-back token target (drawn by the renderer).
    community: { col: 9, row: 6 },

    // Visual structures use larger footprints than their interaction tiles.
    // Their approach rows remain open so the existing controls do not change.
    blockedTiles: [
      // Five kiosks, rows 1–2.
      ...[1, 2].flatMap((row) => [
        ...[2, 3, 4], ...[5, 6, 7], ...[8, 9, 10], ...[11, 12, 13], ...[15, 16, 17],
      ].map((col) => ({ col, row }))),
      // Central circular plaza.
      ...[5, 6, 7].flatMap((row) => [8, 9, 10].map((col) => ({ col, row }))),
      // Shared collection shelf.
      ...Array.from({ length: 10 }, (_, index) => ({ col: 5 + index, row: 11 })),
      // Solid trees at the plaza edges.
      { col: 2, row: 7 }, { col: 17, row: 7 },
    ],

    residents: [
      { id: 'upper-neighbour', row: 4, minCol: 4, maxCol: 8, startCol: 4, speed: 0.62, direction: 1, paletteIndex: 0 },
      { id: 'lower-neighbour', row: 8, minCol: 5, maxCol: 13, startCol: 13, speed: 0.48, direction: -1, paletteIndex: 3 },
      { id: 'east-neighbour', row: 9, minCol: 13, maxCol: 17, startCol: 14, speed: 0.56, direction: 1, paletteIndex: 1 },
    ],

    decorations: [
      { col: 2,  row: 7,  emoji: '🌳' },
      { col: 17, row: 7,  emoji: '🌳' },
    ],
  },

  PlanetaryBoundaries: {
    // Planetary Mission Control — the 9-boundary ring is drawn in the centre (not tiles);
    // 4 consumption consoles sit around it. Stone floor (walkable by default).
    // prettier-ignore
    map: [
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W], // 🍽️ Food console overlay
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W], // clean floor below console overlays
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W], // 📦 Materials console overlay
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 9, row: 13, dir: 1 }, // bottom, facing UP toward the materials console

    // Console interaction tiles (player faces these). Matched to PB_CONSOLES by key.
    consoleTiles: {
      food:      { col: 9,  row: 2 },
      energy:    { col: 3,  row: 6 },
      transport: { col: 15, row: 6 },
      materials: { col: 9,  row: 11 },
    },

    // Where the boundary-ring hologram is centred (pixel center computed in renderer from this).
    ringCenter: { col: 9, row: 6 },

    // Visual structures are overlays on clean stone, so their collision footprint is
    // declared explicitly. This blocks the hologram, the four consoles and both NPC lanes.
    blockedTiles: [
      { col: 9, row: 2 },
      { col: 3, row: 6 }, { col: 15, row: 6 }, { col: 9, row: 11 },
      { col: 9, row: 3 },
      { col: 7, row: 4 }, { col: 8, row: 4 }, { col: 9, row: 4 }, { col: 10, row: 4 }, { col: 11, row: 4 },
      { col: 7, row: 5 }, { col: 8, row: 5 }, { col: 9, row: 5 }, { col: 10, row: 5 }, { col: 11, row: 5 },
      { col: 6, row: 6 }, { col: 7, row: 6 }, { col: 8, row: 6 }, { col: 9, row: 6 }, { col: 10, row: 6 }, { col: 11, row: 6 }, { col: 12, row: 6 },
      { col: 7, row: 7 }, { col: 8, row: 7 }, { col: 9, row: 7 }, { col: 10, row: 7 }, { col: 11, row: 7 },
      { col: 7, row: 8 }, { col: 8, row: 8 }, { col: 9, row: 8 }, { col: 10, row: 8 }, { col: 11, row: 8 },
      { col: 9, row: 9 },
      { col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 },
      { col: 2, row: 3 }, { col: 3, row: 3 }, { col: 4, row: 3 }, { col: 5, row: 3 },
      { col: 14, row: 2 }, { col: 15, row: 2 }, { col: 16, row: 2 }, { col: 17, row: 2 },
      { col: 14, row: 3 }, { col: 15, row: 3 }, { col: 16, row: 3 }, { col: 17, row: 3 },
    ],

    technicians: [
      { id: 'satellite-tech', station: 'satellite', row: 3, minCol: 2, maxCol: 4.5, startCol: 2, speed: 0.65, direction: 1, paletteIndex: 3 },
      { id: 'earth-tech', station: 'earth', row: 3, minCol: 14.5, maxCol: 17, startCol: 17, speed: 0.55, direction: -1, paletteIndex: 5 },
    ],

    decorations: [],
  },

  GardenPlanner: {
    // Outdoor garden field — real tile atlas (GRASS + PATH).
    // Each tile visibly separated like FridgeManager floor.
    //   G = GRASS (3) — walkable grass, primary outdoor floor
    //   P = PATH (5)  — walkable dirt walkway, central spine + horizontal band
    //   W = BUILDING_WALL (10) — perimeter (fence rendered on top)
    // 4 corner 3×2 planting areas (wall-side row omitted — see cornerAreas):
    //   NW = Winter ❄️ (cols 2-4, rows 2-3)
    //   NE = Spring 🌸 (cols 15-17, rows 2-3)
    //   SW = Autumn 🍂 (cols 2-4, rows 11-12)
    //   SE = Summer 🌞 (cols 15-17, rows 11-12)
    // Center row 5 cols 7-12 = 6 seed crates.
    // Tool tiles row 9: 💧 watering can (col 8), 🌾 harvest basket (col 11).
    // Path: row 7-8 horizontal band + cols 9-10 vertical spine.
    // prettier-ignore
    map: [
      // Row 0:  garden fence
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      // Row 1-3: top — grass everywhere (corner beds overlay)
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      // Row 4: open grass with start of vertical path
      [W,3,3,3,3,3,3,3,3,5,5,3,3,3,3,3,3,3,3,W],
      // Row 5: seed crates row (drawn over grass)
      [W,3,3,3,3,3,3,3,3,5,5,3,3,3,3,3,3,3,3,W],
      // Row 6: open + vertical path
      [W,3,3,3,3,3,3,3,3,5,5,3,3,3,3,3,3,3,3,W],
      // Row 7: horizontal path band
      [W,3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3,W],
      // Row 8: horizontal path band
      [W,3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3,W],
      // Row 9: tool tiles + vertical path
      [W,3,3,3,3,3,3,3,3,5,5,3,3,3,3,3,3,3,3,W],
      // Row 10: open + vertical path
      [W,3,3,3,3,3,3,3,3,5,5,3,3,3,3,3,3,3,3,W],
      // Row 11-13: bottom corners
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      // Row 14: garden fence
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 9, row: 7, dir: 1 }, // center, facing UP toward seed crates

    // 4 corner planting areas, each a 3×3 grid of plots tagged by season.
    // plots[] generated in setup() — here we store just the bounding boxes.
    // The wall-side row of each bed is left out (top row for the north beds,
    // bottom row for the south beds) so no bed reads as merged into the fence.
    cornerAreas: [
      { season: 'winter', emoji: '❄️', minCol: 2,  maxCol: 4,  minRow: 2,  maxRow: 3  },
      { season: 'spring', emoji: '🌸', minCol: 15, maxCol: 17, minRow: 2,  maxRow: 3  },
      { season: 'autumn', emoji: '🍂', minCol: 2,  maxCol: 4,  minRow: 11, maxRow: 12 },
      { season: 'summer', emoji: '🌞', minCol: 15, maxCol: 17, minRow: 11, maxRow: 12 },
    ],

    // 12 seed-crate positions. GardenPlanner assigns a seeded, balanced 12-item
    // subset from the 18-item crop pool at round setup; positions own layout only.
    // The central vertical path (cols 9-10) stays clear.
    seedCratePositions: [
      { col: 6,  row: 4 },
      { col: 7,  row: 4 },
      { col: 8,  row: 4 },
      { col: 11, row: 4 },
      { col: 12, row: 4 },
      { col: 13, row: 4 },
      { col: 6,  row: 10 },
      { col: 7,  row: 10 },
      { col: 8,  row: 10 },
      { col: 11, row: 10 },
      { col: 12, row: 10 },
      { col: 13, row: 10 },
    ],

    // Tool tiles — moved to symmetric edges (out of center where seed
    // crates live) so they read as distinct "stations" not crowding.
    // 2026-05-19: compost-vs-collection split — added 🪣 compost bin (next to
    // harvest basket) so wilted plants get a dedicated action, not a fallback.
    toolPositions: [
      { col: 1,  row: 7, tool: 'water'   }, // 💧 left edge, on path band
      { col: 18, row: 7, tool: 'harvest' }, // 🌾 right edge — for HEALTHY plants
      { col: 18, row: 9, tool: 'compost' }, // 🪣 right edge, below harvest — for WILTED plants
    ],

    // Visual-only decorations
    decorations: [
      { col: 9,  row: 0, emoji: '🌳' },
      { col: 10, row: 0, emoji: '🌳' },
      { col: 5,  row: 7, emoji: '🦋' },
      { col: 14, row: 7, emoji: '🐝' },
    ],
  },

  WhereDoesItGrow: {
    // G1.1 HOOK — compact community garden. Grass everywhere (tile 3), perimeter
    // fence (W). 4 growing spots in a tight diamond around the centre start so
    // walks are short (Hook-light). Spot feature tiles are drawn by
    // whereDoesItGrowRenderer; player faces an adjacent grass tile and presses
    // ENTER (checkInteraction, maxDist 1). Walkability uses a custom GRASS set in
    // the component (like GardenPlanner), since isGameRoomWalkable only allows wood/stone.
    // prettier-ignore
    map: [
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 9, row: 7, dir: 1 }, // centre, facing UP

    // 4 growing spots — feature tile(s) the player faces to deliver. Close to centre.
    growingSpots: [
      { key: 'tree',  tiles: [{ col: 5,  row: 3 }, { col: 6,  row: 3 }] },   // top-left
      { key: 'vine',  tiles: [{ col: 13, row: 3 }, { col: 14, row: 3 }] },   // top-right
      { key: 'soil',  tiles: [{ col: 5,  row: 11 }, { col: 6,  row: 11 }] }, // bottom-left
      { key: 'grain', tiles: [{ col: 13, row: 11 }, { col: 14, row: 11 }] }, // bottom-right
    ],

    // 🐝 bee + 🦋 butterfly are NOT static here — they're drawn (animated,
    // bobbing/fluttering) by renderAmbientMotion in whereDoesItGrowRenderer.
    // Keeping only the static perimeter trees avoids a double-draw.
    decorations: [
      { col: 9,  row: 0, emoji: '🌳' },
      { col: 10, row: 0, emoji: '🌳' },
    ],
  },

  SoilDoctor: {
    // G1.3 CHALLENGE — soil clinic. 5 remedy stations (row 2) + 4 ailing plots (row 8),
    // approached from the grass tile below each. Walkability uses the custom GRASS set
    // in the component (like GardenPlanner / WhereDoesItGrow).
    // prettier-ignore
    map: [
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,W],
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
    ],

    playerStart: { col: 9, row: 11, dir: 1 }, // centre-bottom, facing UP

    // 5 remedy stations — keys map to REMEDIES in growing.js. 3 natural remedies
    // evenly spaced across the TOP (row 2); the two outer ones moved to the BOTTOM
    // (row 12) so the shelf wraps the field instead of crowding only the top.
    remedyStations: [
      { key: 'compost',  tiles: [{ col: 3,  row: 2 },  { col: 4,  row: 2 }] },
      { key: 'cover',    tiles: [{ col: 9,  row: 2 },  { col: 10, row: 2 }] },
      { key: 'notill',   tiles: [{ col: 15, row: 2 },  { col: 16, row: 2 }] },
      { key: 'mulch',    tiles: [{ col: 4,  row: 12 }, { col: 5,  row: 12 }] },
      { key: 'chemical', tiles: [{ col: 14, row: 12 }, { col: 15, row: 12 }] },
    ],

    // 4 ailing plots (row 8) — positional; component zips with SOIL_PLOTS in order.
    ailingPlots: [
      { tiles: [{ col: 3,  row: 8 }, { col: 4,  row: 8 }] },
      { tiles: [{ col: 7,  row: 8 }, { col: 8,  row: 8 }] },
      { tiles: [{ col: 11, row: 8 }, { col: 12, row: 8 }] },
      { tiles: [{ col: 15, row: 8 }, { col: 16, row: 8 }] },
    ],

    decorations: [
      { col: 9,  row: 0, emoji: '🌳' },
      { col: 10, row: 0, emoji: '🌳' },
      // 🐛 is now an animated guide critter (renderSoilAmbient); 🌿 stays as scenery.
      { col: 17, row: 11, emoji: '🌿' },
    ],
  },
};
