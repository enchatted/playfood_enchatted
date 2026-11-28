// Island room data — 4 static interior rooms (20×15 tiles each).
// Each room has themed furniture, 4 mission NPCs, and an exit mat.

import { TILE } from './tileAtlas.js';

// Shorthand aliases for room map readability
const W = TILE.BUILDING_WALL;  // 10 — walls (non-walkable)
const S = TILE.FLOOR_STONE;    // 15 — stone floor (walkable)
const F = TILE.FLOOR_WOOD;     // 14 — wood floor (walkable)
const T = TILE.TABLE;          // 16 — furniture (non-walkable)
const E = TILE.EXIT_MAT;       // 17 — exit marker (walkable, triggers leave)
const C = TILE.COUNTER;        // 18 — kitchen counter (non-walkable, thematic)
const G = TILE.FRIDGE;         // 19 — fridge body (non-walkable, thematic)
const R = TILE.GRASS;          // 3 — outdoor grass (walkable, growing island)
const P = TILE.PATH;           // 5 — dirt path (walkable, growing island)

export const ROOM_COLS = 20;
export const ROOM_ROWS = 15;

const AMBIENT_FACE = {
  DOWN: 0,
  UP: 1,
  LEFT: 2,
  RIGHT: 3,
};

export function resolveAmbientWaypointStop(waypoint, randomValue) {
  const pauseMin = Number.isFinite(waypoint?.pauseMin) ? waypoint.pauseMin : 0.4;
  const requestedMax = Number.isFinite(waypoint?.pauseMax) ? waypoint.pauseMax : 2.0;
  const pauseMax = Math.max(pauseMin, requestedMax);
  const sample = Math.max(0, Math.min(1, Number.isFinite(randomValue) ? randomValue : 0));

  return {
    duration: pauseMin + sample * (pauseMax - pauseMin),
    face: AMBIENT_FACE[waypoint?.face] ?? null,
    activity: typeof waypoint?.activity === 'string' ? waypoint.activity : null,
  };
}

// ─── Mission mapping (migrated from IslandView.jsx) ──────

// phase: Hook→Practice→Challenge, the play
// order the gating enforces, now explicit in data. getNearbyNPC spreads the
// mission entry onto nearNPC, so `phase` is available wherever missions flow.
export const MISSION_MAP = {
  growing: [
    { id: 1, component: 'WhereDoesItGrow', phase: 'hook' },
    { id: 2, component: 'GardenPlanner', phase: 'practice' },
    { id: 3, component: 'SoilDoctor', phase: 'challenge' },
  ],
  local: [
    { id: 1, component: 'SeasonMatcher', phase: 'hook' },
    { id: 2, component: 'MarketTrip', phase: 'practice' },
    { id: 3, component: 'SpotTheFake', phase: 'challenge' },
  ],
  foodwaste: [
    { id: 1, component: 'FridgeManager', phase: 'hook' },
    { id: 2, component: 'MealPlanner', phase: 'practice' },
    { id: 3, component: 'LeftoverChef', phase: 'challenge' },
  ],
  circular: [
    { id: 1, component: 'CompostCreator', phase: 'hook' },
    { id: 2, component: 'CircularCity', phase: 'practice' },
    { id: 3, component: 'PlanetaryBoundaries', phase: 'challenge' },
  ],
};

// ─── Room definitions ────────────────────────────────────

export const ROOMS = {
  // ── Foodwaste: Kitchen — stone floor, counter tops ──
  foodwaste: {
    // prettier-ignore
    map: [
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [W,S,F,G,C,C,F,S,S,S,S,S,S,F,C,T,F,S,S,W],  // Kitchen zones: wood floor + fridge/counters
      [W,S,F,F,F,F,F,S,S,S,S,S,S,F,F,F,F,S,S,W],
      [W,S,F,T,S,T,F,S,S,S,S,S,S,F,S,S,F,S,S,W],  // Crate props flanking NPCs
      [W,S,F,F,F,F,F,S,S,S,S,S,S,F,F,F,F,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,T,T,T,T,T,T,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,S,F,F,F,F,F,S,S,S,S,S,S,F,F,F,F,S,S,W],
      [W,S,F,T,S,T,F,S,S,S,S,S,S,F,S,S,F,S,S,W],  // Crate props flanking NPCs 2 & 3
      [W,S,F,F,F,F,F,S,S,S,S,S,S,F,F,F,F,S,S,W],
      [W,S,F,C,T,C,F,S,S,S,S,S,S,F,C,T,F,S,S,W],  // Counter/table props
      [W,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,S,W],
      [W,W,W,W,W,W,W,W,E,E,E,E,W,W,W,W,W,W,W,W],
    ],
    npcs: [
      // Canonical Z-layout (parity with growing/local/circular): Hook top-left →
      // Practice top-right → Challenge BOTTOM-RIGHT, mentor bottom-left. The legacy
      // single-emoji `decorations` were dropped — the per-corner `vignettes` below
      // carry the kitchen storytelling (every other island uses vignettes only).
      { col: 4,  row: 3,  missionIdx: 0, previewItems: ['🥛', '🍞', '🧀'] },
      { col: 15, row: 3,  missionIdx: 1, previewItems: ['🍝', '🥗', '🍚'] },
      { col: 15, row: 10, missionIdx: 2, previewItems: ['🍳', '🥘', '✨'] }, // Leftover Chef → bottom-right
    ],
    // Island mentor: «Η Σεφ», a role-based name. Bottom-left,
    // same layout as the other 3 islands. Coral = warm kitchen pillar.
    mentor: { col: 4, row: 10, color: '#FF8A65' },
    // Completion ceremony (same ritual as growing/local/circular).
    ceremony: true,
    ceremonyIcon: '🍽️', // clean-plate emblem (arc: «nothing gets thrown away»)
    // Thematic vignettes (same ritual as the other rooms): per-corner kitchen mini-scenes previewing
    // each mission without text. Pure non-walkable scenery (isRoomWalkable). w = tiles spanned.
    vignettes: [
      // Hook «Fridge Manager» (NPC 4,3) — open fridge shelves, expiry tag, milk carton
      { type: 'fridgeShelves', col: 2, row: 1, w: 2 },
      { type: 'expiryTag', col: 5, row: 1 },
      { type: 'milkCarton', col: 2, row: 2 },
      // Practice «Meal Planner» (NPC 15,3) — plated meal, planning basket, week grid
      { type: 'mealPlate', col: 14, row: 1 },
      { type: 'planBasket', col: 16, row: 1 },
      { type: 'weekGrid', col: 13, row: 2 },
      // Challenge «Leftover Chef» (NPC 15,10) — cook pot, cutting board, leftover bowl
      { type: 'cookPot', col: 14, row: 11 },
      { type: 'cuttingBoard', col: 16, row: 11 },
      { type: 'leftoverBowl', col: 14, row: 12 },
      // Μέντορας «Η Σεφ» (4,10) — chef stand (toque), spice jars, recipe card
      { type: 'chefStand', col: 2, row: 11 },
      { type: 'spiceJars', col: 5, row: 11 },
      { type: 'recipeCard', col: 2, row: 12 },
    ],
    ambientNPCs: [
      // Six kitchen visitors share the organic room movement engine but stop at
      // recognisable jobs, so the space reads as a working teaching kitchen.
      {
        waypoints: [
          { col: 1, row: 5, pauseMin: 0.9, pauseMax: 1.6, face: 'UP', activity: 'check-fridge' },
          { col: 6, row: 5 }, { col: 6, row: 8 }, { col: 1, row: 8 },
          { col: 1, row: 13, pauseMin: 0.8, pauseMax: 1.4, face: 'UP', activity: 'carry-tray' },
          { col: 6, row: 13 },
        ],
        color: '#CE93D8',
      },
      {
        waypoints: [
          { col: 18, row: 8 }, { col: 13, row: 8 }, { col: 13, row: 5 },
          { col: 18, row: 5, pauseMin: 0.9, pauseMax: 1.6, face: 'UP', activity: 'plan-meal' },
          { col: 18, row: 13, pauseMin: 0.8, pauseMax: 1.5, face: 'LEFT', activity: 'prep-leftovers' },
          { col: 13, row: 13 },
        ],
        color: '#80CBC4',
      },
      {
        waypoints: [
          { col: 7, row: 4, pauseMin: 0.8, pauseMax: 1.4, face: 'LEFT', activity: 'check-fridge' },
          { col: 12, row: 4, pauseMin: 0.8, pauseMax: 1.5, face: 'RIGHT', activity: 'plan-meal' },
          { col: 12, row: 2 }, { col: 7, row: 2 },
        ],
        color: '#FFE082',
      },
      {
        waypoints: [
          { col: 7, row: 8 },
          { col: 12, row: 8, pauseMin: 0.8, pauseMax: 1.5, face: 'RIGHT', activity: 'set-table' },
          { col: 12, row: 13 },
          { col: 7, row: 13, pauseMin: 0.9, pauseMax: 1.7, face: 'LEFT', activity: 'carry-tray' },
        ],
        color: '#A5D6A7',
      },
      {
        waypoints: [
          { col: 6, row: 5, pauseMin: 0.8, pauseMax: 1.4, face: 'UP', activity: 'check-fridge' },
          { col: 11, row: 5, pauseMin: 0.9, pauseMax: 1.6, face: 'DOWN', activity: 'set-table' },
          { col: 11, row: 4 }, { col: 6, row: 4 },
        ],
        color: '#FFAB91',
      },
      {
        waypoints: [
          { col: 7, row: 9, pauseMin: 0.8, pauseMax: 1.4, face: 'UP', activity: 'set-table' },
          { col: 11, row: 9 },
          { col: 11, row: 12, pauseMin: 0.9, pauseMax: 1.8, face: 'RIGHT', activity: 'prep-leftovers' },
          { col: 7, row: 12, pauseMin: 0.8, pauseMax: 1.5, face: 'LEFT', activity: 'carry-tray' },
        ],
        color: '#90CAF9',
      },
    ],
    playerStart: { col: 10, row: 13, dir: 1 }, // facing UP
  },

  // ── Local: Market — wood floor, market stalls ──
  local: {
    // prettier-ignore
    map: [
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,T,T,F,F,F,F,F,F,F,F,F,F,T,T,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,T,F,F,F,T,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,T,F,F,F,T,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,T,T,F,F,F,F,F,F,F,F,F,F,T,T,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,W,W,W,W,W,W,W,E,E,E,E,W,W,W,W,W,W,W,W],
    ],
    npcs: [
      // Z-layout (Island 1 pattern): Hook top-left → Practice top-right →
      // Challenge BOTTOM-RIGHT, mentor bottom-left.
      { col: 4,  row: 3,  missionIdx: 0, previewItems: ['🍓', '☀️', '🍂'] },
      { col: 15, row: 3,  missionIdx: 1, previewItems: ['🛒', '🥕', '🏪'] },
      { col: 15, row: 10, missionIdx: 2, previewItems: ['🔍', '🏷️', '🚩'] },
    ],
    // Island mentor: «Η Μανάβισσα», a role-based name.
    mentor: { col: 4, row: 10, color: '#FFB74D' },
    // Completion ceremony, same ritual as growing.
    ceremony: true,
    ceremonyIcon: '🧺', // market basket emblem (arc: «fill a basket»)
    // Thematic vignettes (same ritual as growing): per-corner mini-scenes previewing
    // each mission without text. The 2.3 corner deliberately shows a GENERIC
    // carton with a vague leafy label — never one of the six in-game STF
    // products, so the room art doesn't spoil which products are fake.
    vignettes: [
      // Hook «Season Matcher» (NPC 4,3) — fruit stall + mini month calendar
      { type: 'stallFruits', col: 2, row: 2, w: 2 },
      { type: 'crates', col: 1, row: 1 },
      { type: 'monthCal', col: 5, row: 1 },
      // Practice «Market Trip» (NPC 15,3) — price-tag stall + coin + km signpost
      { type: 'stallPrices', col: 14, row: 2, w: 2 },
      { type: 'kmSign', col: 17, row: 1 },
      { type: 'coin', col: 17, row: 2 },
      // Challenge «Spot the Fake» (NPC 15,10) — magnifier over a suspicious
      // "green" box (generic!) + blank label tags + a red flag
      { type: 'magnifierBox', col: 14, row: 11 },
      { type: 'labelTags', col: 16, row: 11 },
      { type: 'flagPost', col: 14, row: 12 },
      // Μέντορας «Η Μανάβισσα» (4,10) — balance scale, crates, market basket
      { type: 'scale', col: 2, row: 11 },
      { type: 'crates', col: 5, row: 11 },
      { type: 'basket', col: 2, row: 12 },
    ],
    ambientNPCs: [
      // Patrol rows shifted off 1/11/12 corners so shoppers don't ghost
      // through the vignette props (crates, scale, flag…). Annotated
      // waypoints turn selected rests into small market visits; plain points
      // keep the shared organic patrol behavior.
      {
        waypoints: [
          { col: 1, row: 5, pauseMin: 0.9, pauseMax: 1.6, face: 'UP', activity: 'browse-season' },
          { col: 6, row: 5 }, { col: 6, row: 8 }, { col: 1, row: 8 },
          { col: 1, row: 13, pauseMin: 0.8, pauseMax: 1.4, face: 'UP', activity: 'carry-basket' },
          { col: 6, row: 13 },
        ],
        color: '#A5D6A7',
      },
      {
        waypoints: [
          { col: 18, row: 8 }, { col: 13, row: 8 }, { col: 13, row: 5 },
          { col: 18, row: 5, pauseMin: 0.9, pauseMax: 1.7, face: 'UP', activity: 'browse-local' },
          { col: 18, row: 13, pauseMin: 0.8, pauseMax: 1.5, face: 'LEFT', activity: 'inspect-label' },
          { col: 13, row: 13 },
        ],
        color: '#FFE082',
      },
      {
        waypoints: [
          { col: 6, row: 4, pauseMin: 0.8, pauseMax: 1.5, face: 'LEFT', activity: 'browse-season' },
          { col: 13, row: 4, pauseMin: 0.8, pauseMax: 1.5, face: 'RIGHT', activity: 'browse-local' },
          { col: 13, row: 1 }, { col: 6, row: 1 },
        ],
        color: '#EF9A9A',
      },
      {
        waypoints: [
          { col: 8, row: 8 },
          { col: 12, row: 8, pauseMin: 0.8, pauseMax: 1.6, face: 'RIGHT', activity: 'inspect-label' },
          { col: 12, row: 13 },
          { col: 8, row: 13, pauseMin: 0.9, pauseMax: 1.8, face: 'LEFT', activity: 'carry-basket' },
        ],
        color: '#90CAF9',
      },
    ],
    playerStart: { col: 10, row: 13, dir: 1 },
    // Reflection prompt: one tap-to-answer
    // question between Practice→Challenge (fires at exactly 2/3 done). Other
    // islands opt in later with their own island.reflection_* i18n keys.
    reflection: true,
  },

  // ── Growing: Garden courtyard — grass + dirt paths, wooden fence (outdoor theme) ──
  growing: {
    // prettier-ignore
    map: [
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [W,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,W],
      [W,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,W],
      [W,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,W],
      [W,R,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,R,W],
      [W,R,R,R,R,R,T,T,T,P,P,T,T,T,R,R,R,R,R,W],
      [W,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,W],
      [W,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,W],
      [W,R,R,R,R,R,T,T,T,P,P,T,T,T,R,R,R,R,R,W],
      [W,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,W],
      [W,R,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,R,W],
      [W,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,W],
      [W,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,W],
      [W,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,W],
      [W,W,W,W,W,W,W,W,E,E,E,E,W,W,W,W,W,W,W,W],
    ],
    npcs: [
      // Z-layout: Hook top-left → Practice top-right → Challenge BOTTOM-RIGHT,
      // so the reading order of the room matches the play order (with gating).
      { col: 4,  row: 3,  missionIdx: 0, previewItems: ['🌱', '🥕', '🍅'] },
      { col: 15, row: 3,  missionIdx: 1, previewItems: ['🪴', '☀️', '💧'] },
      { col: 15, row: 10, missionIdx: 2, previewItems: ['🩺', '🪱', '🍂'] },
    ],
    // Island mentor: stationary named female NPC, bottom-left.
    mentor: { col: 4, row: 10, color: '#F48FB1' },
    // Completion ceremony: fires once at 3/3. Islands without this
    // flag have no ending yet — add it together with their i18n keys
    // (island.ceremony_title_<slug> / island.ceremony_msg_<slug>).
    ceremony: true,
    // Thematic vignettes: 2-3 prop tiles per corner that preview what each
    // NPC's game is about, readable without text. Pure scenery — non-walkable
    // (isRoomWalkable) but never on an NPC-adjacent interaction tile, and drawn
    // by renderGrowingVignettes (no glow/prompt). w = tiles spanned horizontally.
    vignettes: [
      // Hook «Πού Φυτρώνει;» (NPC 4,3) — the 4 origins in miniature + a "?" sign
      { type: 'tree', col: 2, row: 2 },
      { type: 'vine', col: 3, row: 1 },
      { type: 'mound', col: 5, row: 1 },
      { type: 'wheat', col: 6, row: 1 },
      { type: 'sign', col: 6, row: 2 },
      // Practice «Σχεδιαστής Κήπου» (NPC 15,3) — seed bench, watering can, season calendar
      { type: 'bench', col: 14, row: 1, w: 2 },
      { type: 'can', col: 16, row: 1 },
      { type: 'calendar', col: 17, row: 2 },
      // Challenge «Soil Doctor» (NPC 15,10) — sick vs healed twin beds, med case, sacks
      { type: 'bedSick', col: 14, row: 11 },
      { type: 'bedHealed', col: 16, row: 11 },
      { type: 'medcase', col: 17, row: 11 },
      { type: 'sacks', col: 14, row: 12 },
      // Μέντορας «Η Κηπουρός» (NPC 4,10) — tool shed, pots, compost pile
      { type: 'shed', col: 2, row: 11, w: 2 },
      { type: 'pots', col: 5, row: 11 },
      { type: 'compost', col: 2, row: 12 },
    ],
    ambientNPCs: [
      { waypoints: [{ col: 1, row: 4 }, { col: 5, row: 4 }, { col: 5, row: 8 }, { col: 1, row: 8 }, { col: 1, row: 13 }, { col: 5, row: 13 }], color: '#90CAF9' },
      { waypoints: [{ col: 18, row: 8 }, { col: 14, row: 8 }, { col: 14, row: 4 }, { col: 18, row: 4 }], color: '#FFAB91' },
      { waypoints: [{ col: 10, row: 4 }, { col: 10, row: 7 }, { col: 5, row: 7 }, { col: 5, row: 4 }], color: '#CE93D8' },
      { waypoints: [{ col: 9, row: 9 }, { col: 13, row: 9 }, { col: 13, row: 13 }, { col: 9, row: 13 }], color: '#A5D6A7' },
    ],
    playerStart: { col: 10, row: 13, dir: 1 },
  },

  // ── Circular: open repair hub — four clear learning zones ──
  circular: {
    // prettier-ignore
    map: [
      [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,T,T,F,F,F,F,F,F,F,F,T,T,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,T,T,F,F,F,F,F,F,F,F,F,T,T,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
      [W,W,W,W,W,W,W,W,E,E,E,E,W,W,W,W,W,W,W,W],
    ],
    npcs: [
      // Canonical Z-layout (parity with growing/local): Hook top-left → Practice
      // top-right → Challenge BOTTOM-RIGHT, mentor bottom-left.
      { col: 4,  row: 3,  missionIdx: 0, previewItems: ['🍌', '🪱', '🌱'] },
      { col: 15, row: 3,  missionIdx: 1, previewItems: ['📦', '🧴', '♻️'] },
      { col: 15, row: 10, missionIdx: 2, previewItems: ['🌍', '📊', '⚖️'] },
    ],
    // Island mentor: «Η Μηχανικός», a role-based name.
    mentor: { col: 5, row: 10, color: '#64B5F6' }, // circular pillar = blue
    // Completion ceremony (same ritual as growing/local).
    ceremony: true,
    ceremonyIcon: '🌍', // planet emblem (arc: «one choice changes the planet»)
    // Each compact vignette sits on a kiosk instead of floating around the room.
    vignettes: [
      { type: 'compostBins', col: 3, row: 5, w: 2 },
      { type: 'repairBench', col: 13, row: 5, w: 2 },
      { type: 'miniPlanet', col: 13, row: 9 },
      { type: 'boundaryDial', col: 14, row: 9 },
      { type: 'toolbox', col: 2, row: 9 },
      { type: 'fixedItem', col: 3, row: 9 },
    ],
    ambientNPCs: [
      { waypoints: [{ col: 1, row: 4 }, { col: 6, row: 4 }, { col: 6, row: 8 }, { col: 1, row: 8 }, { col: 1, row: 12 }, { col: 6, row: 12 }], color: '#CE93D8' },
      { waypoints: [{ col: 18, row: 8 }, { col: 12, row: 8 }, { col: 12, row: 4 }, { col: 18, row: 4 }, { col: 18, row: 12 }, { col: 12, row: 12 }], color: '#80DEEA' },
      { waypoints: [{ col: 7, row: 2 }, { col: 12, row: 2 }, { col: 12, row: 4 }, { col: 7, row: 4 }], color: '#FFAB91' },
      { waypoints: [{ col: 8, row: 11 }, { col: 12, row: 11 }, { col: 12, row: 13 }, { col: 8, row: 13 }], color: '#A5D6A7' },
    ],
    playerStart: { col: 10, row: 13, dir: 1 },
  },
};

// ─── Room logic helpers ──────────────────────────────────

const WALKABLE_ROOM_TILES = new Set([
  TILE.FLOOR_WOOD,
  TILE.FLOOR_STONE,
  TILE.EXIT_MAT,
  TILE.GRASS,
  TILE.PATH,
]);

/** Can the player walk to this room tile? */
export function isRoomWalkable(room, col, row) {
  if (col < 0 || col >= ROOM_COLS || row < 0 || row >= ROOM_ROWS) return false;
  if (!WALKABLE_ROOM_TILES.has(room.map[row][col])) return false;
  // NPCs block their tile
  if (room.npcs.some((n) => n.col === col && n.row === row)) return false;
  if (room.mentor && room.mentor.col === col && room.mentor.row === row) return false;
  // Vignette props are solid scenery (a kid shouldn't walk through a tree)
  if (room.vignettes?.some((v) => row === v.row && col >= v.col && col < v.col + (v.w || 1))) {
    return false;
  }
  return true;
}

/**
 * Hook→Practice→Challenge gating: mission 1 is always open; mission N
 * unlocks once mission N-1 of the SAME island is completed. `completed` is the
 * store's number[] for the island. Test mode (?startMission=…) bypasses the
 * island room entirely, so this never blocks harness runs.
 */
export function isMissionUnlocked(island, missionId, completed) {
  if (missionId <= 1) return true;
  // A finished mission is always replayable — pre-gating saves (and harness runs
  // via ?startMission=) can hold non-sequential arrays like [3]; never lock those.
  if ((completed || []).includes(missionId)) return true;
  const order = MISSION_MAP[island];
  if (!order || !order.some((m) => m.id === missionId)) return false;
  return (completed || []).includes(missionId - 1);
}

/**
 * The next mission the child should actually play on this island: the first one
 * they have not finished. Returns undefined once the island is complete.
 *
 * Everything that points somewhere must agree, so the mentor's hint, the locked
 * NPC's message and the pointing hand all ask this one question. The old code
 * pointed at mission N-1 instead, which at the third NPC with nothing finished
 * named a game that was itself locked.
 */
export function nextMissionId(island, completed) {
  const order = MISSION_MAP[island] || [];
  const done = completed || [];
  return order.find((m) => !done.includes(m.id))?.id;
}

/** Returns NPC + mission data if player faces an NPC, or null. */
export function getNearbyNPC(room, island, col, row, dir) {
  // Direction offsets: DOWN=0, UP=1, LEFT=2, RIGHT=3
  const offsets = [[0, 1], [0, -1], [-1, 0], [1, 0]];
  const [dx, dy] = offsets[dir];
  const targetCol = col + dx;
  const targetRow = row + dy;

  const npc = room.npcs.find((n) => n.col === targetCol && n.row === targetRow);
  if (!npc) return null;

  const mission = MISSION_MAP[island]?.[npc.missionIdx];
  if (!mission) return null;

  return { ...npc, ...mission };
}

/** Is the player facing the island mentor? (same adjacency rule as mission NPCs) */
export function isNearMentor(room, col, row, dir) {
  if (!room.mentor) return false;
  const offsets = [[0, 1], [0, -1], [-1, 0], [1, 0]];
  const [dx, dy] = offsets[dir];
  return room.mentor.col === col + dx && room.mentor.row === row + dy;
}

/** Is the player standing on an exit mat? */
export function isOnExitMat(room, col, row) {
  if (col < 0 || col >= ROOM_COLS || row < 0 || row >= ROOM_ROWS) return false;
  return room.map[row][col] === TILE.EXIT_MAT;
}
