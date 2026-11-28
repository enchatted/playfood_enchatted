// Sailing overworld renderer — boat on water, dock/buoy prompts, glass HUD.
// Shore foam, particles, boat rocking, animated buoy, glass HUD with phygital icon.

import {
  TILE_SIZE as TS, CANVAS_W, CANVAS_H,
  VIEW_COLS, VIEW_ROWS, VIEW_SCALE, HUD_HEIGHT,
  WATER_FRAME_DURATION, WATER_FRAMES, ISLANDS, MISSIONS_PER_ISLAND,
  PHYGITAL_BUOY,
} from './overworldData.js';
import { MAP, MAP_COLS, MAP_ROWS, ISLAND_SIGNS, PIER_HEADS } from './mapData.js';
import { TILE, getBoatSpritesForTier } from './tileAtlas.js';
import {
  drawRetroBox, drawRoundedRect, drawText, drawStatsBadge,
} from '../utils/canvas.js';
import { DRAFT_MODE } from '../config/draftMode.js';
import { readableHudUnit, scaleRectBy } from '../utils/hidpi.js';
import { isIslandLocked } from '../utils/demoMode.js';
import { BRAND, WORLD_ART } from '../styles/brandColors.js';
import { getRestorationStage } from './islandRestoration.js';

// ─── Helpers ──────────────────────────────────────────────

function isWaterTile(id) {
  return id === TILE.DEEP_WATER || id === TILE.SHALLOW_WATER;
}

function getTile(col, row) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return TILE.DEEP_WATER;
  return MAP[row][col];
}

// Pick tile variant based on grid position (deterministic, no Math.random)
function variantIndex(col, row, count) {
  return ((col * 7 + row * 13 + col * row) & 0x7FFFFFFF) % count;
}

// ─── Tile Map + Shore Edges + Animated Buoy ──────────────

export function renderTileMap(ctx, state, atlas) {
  if (DRAFT_MODE) {
    const cam = state.camera;
    const startCol = Math.floor(cam.x / TS);
    const startRow = Math.floor(cam.y / TS);
    const offsetX = -(cam.x % TS);
    const offsetY = -(cam.y % TS);

    const DRAFT_COLORS = {
      [TILE.DEEP_WATER]:    WORLD_ART.oceanDeep,
      [TILE.SHALLOW_WATER]: WORLD_ART.oceanWaveMid,
      [TILE.BUOY]:          BRAND.orange,
      [TILE.DOCK]:          WORLD_ART.wood,
      [TILE.SAND]:          WORLD_ART.sandBase,
      [TILE.GRASS]:         WORLD_ART.grassMid,
      [TILE.DARK_GRASS]:    WORLD_ART.grassDeep,
      [TILE.TREE]:          WORLD_ART.foliageDeep,
      [TILE.FLOWERS]:       BRAND.pink,
      [TILE.ROCK]:          WORLD_ART.stoneMid,
      [TILE.PATH]:          WORLD_ART.pathBase,
      [TILE.BUILDING]:      WORLD_ART.stoneLight,
    };

    for (let vy = -1; vy <= VIEW_ROWS; vy++) {
      for (let vx = -1; vx <= VIEW_COLS; vx++) {
        const col = startCol + vx;
        const row = startRow + vy;
        const dx = vx * TS + offsetX;
        const dy = vy * TS + offsetY;
        const tileId = getTile(col, row);

        ctx.fillStyle = DRAFT_COLORS[tileId] || WORLD_ART.oceanDeep;
        ctx.fillRect(dx, dy, TS, TS);

        // Subtle grid line
        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(dx, dy, TS, TS);
      }
    }
    return;
  }

  const cam = state.camera;
  const waterFrame = Math.floor(state.time / WATER_FRAME_DURATION) % WATER_FRAMES;

  const startCol = Math.floor(cam.x / TS);
  const startRow = Math.floor(cam.y / TS);
  const offsetX = -(cam.x % TS);
  const offsetY = -(cam.y % TS);

  // Pass 1: Draw base tiles
  for (let vy = -1; vy <= VIEW_ROWS; vy++) {
    for (let vx = -1; vx <= VIEW_COLS; vx++) {
      const col = startCol + vx;
      const row = startRow + vy;
      const dx = vx * TS + offsetX;
      const dy = vy * TS + offsetY;

      const tileId = getTile(col, row);

      if (tileId === TILE.DEEP_WATER) {
        ctx.drawImage(atlas.waterFrames.deep[waterFrame], dx, dy);
      } else if (tileId === TILE.SHALLOW_WATER) {
        ctx.drawImage(atlas.waterFrames.shallow[waterFrame], dx, dy);
      } else if (tileId === TILE.BUOY) {
        // Draw water underneath, then animated buoy on top
        ctx.drawImage(atlas.waterFrames.shallow[waterFrame], dx, dy);
        const buoyFrame = atlas.buoyFrames[waterFrame % atlas.buoyFrames.length];
        if (buoyFrame) ctx.drawImage(buoyFrame, dx, dy);
      } else {
        const variants = atlas.tiles[tileId];
        if (variants) {
          const idx = variantIndex(col, row, variants.length);
          ctx.drawImage(variants[idx], dx, dy);
        }
      }
    }
  }

  // Pass 2: Shore edge overlays (water tiles adjacent to land)
  for (let vy = -1; vy <= VIEW_ROWS; vy++) {
    for (let vx = -1; vx <= VIEW_COLS; vx++) {
      const col = startCol + vx;
      const row = startRow + vy;
      const tileId = getTile(col, row);

      // Shore edges on water and buoy tiles only
      if (!isWaterTile(tileId) && tileId !== TILE.BUOY) continue;

      const dx = vx * TS + offsetX;
      const dy = vy * TS + offsetY;

      // Land = anything that isn't water, buoy, or dock
      const isLand = (c, r) => {
        const t = getTile(c, r);
        return !isWaterTile(t) && t !== TILE.BUOY && t !== TILE.DOCK;
      };

      if (isLand(col, row - 1)) ctx.drawImage(atlas.shoreEdges.top, dx, dy);
      if (isLand(col, row + 1)) ctx.drawImage(atlas.shoreEdges.bottom, dx, dy);
      if (isLand(col - 1, row)) ctx.drawImage(atlas.shoreEdges.left, dx, dy);
      if (isLand(col + 1, row)) ctx.drawImage(atlas.shoreEdges.right, dx, dy);
    }
  }

}

// ─── Mooring Posts ───────────────────────────────────────
// Partner feedback: "it took some time to understand where the
// boat could dock because the piers are not clearly indicated". A pair of
// weathered posts stands in the water either side of the pier head, with a
// slack rope reaching back to the planks. Same wood as the pier, so it reads
// as part of the world rather than a marker laid over it, and a post with a
// rope says "tie up here" without a word of text. Every pier gets a pair,
// including the recycling hub.
//
// Scenery only. It changes nothing about where the boat may moor: docking is
// still whatever getDockIsland() allows, and the posts stand on water the boat
// can sail straight through.

const POST_W = 7;             // trunk width in world pixels
const POST_H = 21;            // height above the waterline
const POST_SWAY = 0.035;      // radians — barely there, just enough to live
const POST_SWAY_PERIOD = 3.4; // seconds per sway

// A pair per pier: one post either side of the head, each roping back inwards.
const MOORING_POSTS = PIER_HEADS.flatMap(({ col, row }) => [
  { col: col - 1, row, side: 1 },   // west of the head, rope reaching east
  { col: col + 1, row, side: -1 },  // east of the head, rope reaching west
]);

function drawMooringPost(ctx, x, y, phase, side) {
  ctx.save();
  ctx.translate(x, y);

  // Shadow on the water, drawn before the sway so it stays put.
  ctx.fillStyle = 'rgba(13,38,62,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 2, POST_W * 0.9, POST_W * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(Math.sin(phase) * POST_SWAY);

  const half = POST_W / 2;
  ctx.fillStyle = WORLD_ART.woodMid;
  ctx.fillRect(-half, -POST_H, POST_W, POST_H);
  ctx.fillStyle = WORLD_ART.woodShadow;          // shaded side
  ctx.fillRect(half - 2, -POST_H, 2, POST_H);
  ctx.fillStyle = WORLD_ART.wood;                // lit edge
  ctx.fillRect(-half, -POST_H, 1.5, POST_H);
  ctx.fillStyle = WORLD_ART.woodDeep;            // rounded cap
  ctx.beginPath();
  ctx.ellipse(0, -POST_H, half, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(13,38,62,0.22)';         // waterline darkening
  ctx.fillRect(-half, -3, POST_W, 3);

  // Slack rope back towards the planks, hanging under its own weight.
  ctx.strokeStyle = WORLD_ART.woodDeep;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -POST_H + 4);
  ctx.quadraticCurveTo(side * 10, -POST_H + 14, side * 18, -POST_H + 8);
  ctx.stroke();

  ctx.restore();
}

export function renderMooringPosts(ctx, state) {
  if (DRAFT_MODE) return;
  const cam = state.camera;
  const phase = state.time / POST_SWAY_PERIOD * Math.PI * 2;

  for (const post of MOORING_POSTS) {
    const x = post.col * TS + TS / 2 - cam.x;
    const y = post.row * TS + TS * 0.72 - cam.y;   // sits low in its tile
    if (x < -TS || x > CANVAS_W + TS || y < -TS || y > CANVAS_H + TS) continue;
    drawMooringPost(ctx, x, y, phase, post.side);
  }
}

// ─── Water Pollution Tinting ─────────────────────────────
// Simple darkening: lower completion = darker water around the island.
// 0/3 = very dark, 3/3 = no tint (pristine).

const TINT_RADIUS = 16;

export function renderWaterTint(ctx, state, completedMissions) {
  if (DRAFT_MODE) {
    // Flat dark overlay on water near polluted islands — no gradients
    const cam = state.camera;
    const startCol = Math.floor(cam.x / TS);
    const startRow = Math.floor(cam.y / TS);
    const offsetX = -(cam.x % TS);
    const offsetY = -(cam.y % TS);

    const influences = [];
    for (const [id, data] of Object.entries(EVOLUTION_DATA)) {
      const done = (completedMissions?.[id] || []).length;
      if (done >= MISSIONS_PER_ISLAND) continue;
      influences.push({ cx: data.cx, cy: data.cy, darkness: (MISSIONS_PER_ISLAND - done) / MISSIONS_PER_ISLAND });
    }
    if (influences.length === 0) return;

    for (let vy = -1; vy <= VIEW_ROWS; vy++) {
      for (let vx = -1; vx <= VIEW_COLS; vx++) {
        const col = startCol + vx;
        const row = startRow + vy;
        const tileId = getTile(col, row);
        if (!isWaterTile(tileId) && tileId !== TILE.BUOY) continue;

        let bestAlpha = 0;
        for (const inf of influences) {
          const dc = col - inf.cx;
          const dr = row - inf.cy;
          const dist = Math.sqrt(dc * dc + dr * dr);
          if (dist >= TINT_RADIUS) continue;
          const falloff = 1 - dist / TINT_RADIUS;
          const a = inf.darkness * falloff * 0.4;
          if (a > bestAlpha) bestAlpha = a;
        }

        if (bestAlpha > 0.01) {
          const dx = vx * TS + offsetX;
          const dy = vy * TS + offsetY;
          ctx.fillStyle = `rgba(40,30,20,${bestAlpha.toFixed(3)})`;
          ctx.fillRect(dx, dy, TS, TS);
        }
      }
    }
    return;
  }

  const cam = state.camera;
  const startCol = Math.floor(cam.x / TS);
  const startRow = Math.floor(cam.y / TS);
  const offsetX = -(cam.x % TS);
  const offsetY = -(cam.y % TS);

  // Pre-compute per-island darkness: 0/3 → 1.0 (max dark), 3/3 → 0.0 (no tint)
  const influences = [];
  for (const [id, data] of Object.entries(EVOLUTION_DATA)) {
    const done = (completedMissions?.[id] || []).length;
    if (done >= MISSIONS_PER_ISLAND) continue; // 3/3 = clean, skip
    influences.push({ cx: data.cx, cy: data.cy, darkness: (MISSIONS_PER_ISLAND - done) / MISSIONS_PER_ISLAND });
  }
  if (influences.length === 0) return; // all islands clean

  for (let vy = -1; vy <= VIEW_ROWS; vy++) {
    for (let vx = -1; vx <= VIEW_COLS; vx++) {
      const col = startCol + vx;
      const row = startRow + vy;
      const tileId = getTile(col, row);
      if (!isWaterTile(tileId) && tileId !== TILE.BUOY) continue;

      let bestAlpha = 0;
      for (const inf of influences) {
        const dc = col - inf.cx;
        const dr = row - inf.cy;
        const dist = Math.sqrt(dc * dc + dr * dr);
        if (dist >= TINT_RADIUS) continue;
        const falloff = 1 - dist / TINT_RADIUS;
        const a = inf.darkness * falloff * 0.55;
        if (a > bestAlpha) bestAlpha = a;
      }

      if (bestAlpha > 0.01) {
        const dx = vx * TS + offsetX;
        const dy = vy * TS + offsetY;
        ctx.fillStyle = `rgba(0,0,0,${bestAlpha.toFixed(3)})`;
        ctx.fillRect(dx, dy, TS, TS);
      }
    }
  }
}

// ─── Island Name Signs + Progress Pills ─────────────────
// Rendered AFTER evolution overlays so they appear on top.

export function renderIslandSigns(ctx, state, completedMissions) {
  if (DRAFT_MODE) {
    const cam = state.camera;
    for (const sign of ISLAND_SIGNS) {
      const sx = sign.col * TS - cam.x;
      const sy = sign.row * TS - cam.y;
      if (sx < -100 || sx > CANVAS_W + 100 || sy < -30 || sy > CANVAS_H + 30) continue;

      const name = state.strings?.islandNames?.[sign.island] || sign.island;
      const islandData = ISLANDS[sign.island];

      ctx.font = "bold 12px sans-serif";
      const textW = ctx.measureText(name).width + 16;
      const textH = 20;
      const tx = sx - textW / 2;
      const ty = sy - textH / 2;

      // Simple colored rectangle
      ctx.fillStyle = islandData?.color || BRAND.text;
      ctx.fillRect(tx, ty, textW, textH);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, ty, textW, textH);

      drawText(ctx, name, sx, sy, {
        font: "bold 12px sans-serif",
        color: '#fff',
        align: 'center',
        baseline: 'middle',
      });

      if (isIslandLocked(sign.island)) {
        drawText(ctx, '🔒', sx, ty - 10, {
          font: '14px sans-serif',
          color: '#fff', align: 'center', baseline: 'middle',
        });
      }

      // Progress pill — simple rectangle
      if (sign.island === 'recycling') continue;
      const done = (completedMissions?.[sign.island] || []).length;
      const pillLabel = done === 3 ? '* 3/3' : done + '/3';
      ctx.font = "bold 9px sans-serif";
      const pillW = ctx.measureText(pillLabel).width + 10;
      const pillH = 14;
      const pillX = sx - pillW / 2;
      const pillY = ty + textH + 2;

      // 3/3 gold: Reward gold — kept as functional accent, not brand chrome.
      ctx.fillStyle = done === 0 ? WORLD_ART.stoneMid : done === 3 ? '#F9A825' : BRAND.green;
      ctx.fillRect(pillX, pillY, pillW, pillH);
      drawText(ctx, pillLabel, sx, pillY + pillH / 2, {
        font: "bold 9px sans-serif",
        color: '#fff',
        align: 'center',
        baseline: 'middle',
      });
    }
    return;
  }

  const cam = state.camera;

  for (const sign of ISLAND_SIGNS) {
    const sx = sign.col * TS - cam.x;
    const sy = sign.row * TS - cam.y;
    if (sx < -100 || sx > CANVAS_W + 100 || sy < -30 || sy > CANVAS_H + 30) continue;

    const name = state.strings?.islandNames?.[sign.island] || sign.island;
    const islandData = ISLANDS[sign.island];
    const bob = Math.sin(state.time * 1.5 + sign.col * 0.3) * 2;

    ctx.font = "bold 12px 'Inter', system-ui, sans-serif";
    const textW = ctx.measureText(name).width + 18;
    const textH = 22;
    const tx = sx - textW / 2;
    const ty = sy - textH / 2 + bob;

    // Shadow
    drawRoundedRect(ctx, tx + 1, ty + 2, textW, textH, 11,
      'rgba(0,0,0,0.2)', 'transparent');
    // Badge
    drawRoundedRect(ctx, tx, ty, textW, textH, 11,
      islandData.color, 'rgba(255,255,255,0.3)');
    // Text
    drawText(ctx, name, sx, sy + bob, {
      font: "bold 12px 'Inter', system-ui, sans-serif",
      color: '#fff',
      align: 'center',
      baseline: 'middle',
    });

    // Demo build — padlock floats above the sign of a locked island.
    if (isIslandLocked(sign.island)) {
      drawText(ctx, '🔒', sx, ty - 10 + bob, {
        font: "14px 'Inter', system-ui, sans-serif",
        color: '#fff', align: 'center', baseline: 'middle',
      });
    }

    // Progress pill — "✓ x/4" below the name badge (skip for recycling island)
    if (sign.island === 'recycling') continue;
    const done = (completedMissions?.[sign.island] || []).length;
    const pillLabel = done === 3 ? '\u2605 3/3' : '\u2713 ' + done + '/3';
    ctx.font = "bold 9px 'Inter', system-ui, sans-serif";
    const pillTextW = ctx.measureText(pillLabel).width + 12;
    const pillH = 14;
    const pillX = sx - pillTextW / 2;
    const pillY = ty + textH + 3;

    // Pill color: grey 0/3, green gradient 1-2/3, gold 3/3
    let pillFill, pillText;
    if (done === 0) {
      pillFill = 'rgba(120,120,120,0.7)';
      pillText = 'rgba(255,255,255,0.6)';
    } else if (done === MISSIONS_PER_ISLAND) {
      // Reward gold — kept as functional accent, not brand chrome.
      pillFill = '#F9A825';
      pillText = BRAND.text;
    } else {
      // BRAND.green #6DB06C decomposed as rgba for alpha pill fill.
      pillFill = 'rgba(109,176,108,0.85)';
      pillText = '#fff';
    }

    // Pill shadow
    drawRoundedRect(ctx, pillX + 1, pillY + 1, pillTextW, pillH, 7,
      'rgba(0,0,0,0.2)', 'transparent');
    // Pill background
    drawRoundedRect(ctx, pillX, pillY, pillTextW, pillH, 7,
      pillFill, 'rgba(255,255,255,0.2)');
    // Pill text
    drawText(ctx, pillLabel, sx, pillY + pillH / 2, {
      font: "bold 9px 'Inter', system-ui, sans-serif",
      color: pillText,
      align: 'center',
      baseline: 'middle',
    });
  }
}

// ─── Island Environmental Evolution ──────────────────────
// Islands transform from dead/barren (0/3) to lush paradise (3/3).
// Per-tile death overlays: trees→stumps, grass→cracked earth, flowers→wilted.
// Progressive life: sprouts → flowers → birds/fish → animals/flag → butterflies/glow.

export const EVOLUTION_DATA = {
  foodwaste: {
    cx: 11, cy: 8,
    bounds: { col1: 3, row1: 3, col2: 19, row2: 13 },
    themed: true, // enables foodwaste-specific rendering
    // Stage 1 (1/3+): seagull + vegetable sprout
    seagulls: [
      { col: 6, row: 5, phase: 0 },
      { col: 16, row: 6, phase: 2.5 },
    ],
    vegSprout: { col: 11, row: 9 },
    // Stage 2 (2/3+): garden bed + compost bin
    gardenBed: { col: 13, row: 8 },
    compostBin: { col: 7, row: 11 },
    // Stage 3 (3/3): fruit tree + cat
    fruitTree: { col: 15, row: 9 },
    cat: { col: 9, row: 8, phase: 1.5 },
    // Final restoration layer (3/3): banner + falling leaves
    banner: { col: 11, row: 5 },
    fallingLeaves: [
      { col: 15, row: 7, offset: 0 },
      { col: 16, row: 8, offset: 1.2 },
      { col: 14, row: 9, offset: 2.4 },
      { col: 16, row: 10, offset: 0.8 },
    ],
    // Generic decorations kept as fallback (used by DRAFT_MODE)
    sprouts: [
      { col: 8, row: 7 }, { col: 13, row: 7 }, { col: 9, row: 9 },
      { col: 12, row: 10 }, { col: 15, row: 8 },
    ],
    flowers: [
      { col: 7, row: 6, color: '#FF7043' }, { col: 14, row: 6, color: '#FFD54F' },
      { col: 6, row: 9, color: '#F06292' }, { col: 15, row: 9, color: '#FF7043' },
      { col: 10, row: 10, color: '#FFD54F' },
    ],
    birds: [
      { col: 10, row: 7, radius: 3, speed: 0.7, phase: 0 },
      { col: 13, row: 9, radius: 2.5, speed: -0.5, phase: 2 },
    ],
    fish: [
      { col: 6, row: 3, dir: 1 }, { col: 16, row: 3, dir: -1 }, { col: 5, row: 12, dir: 1 },
    ],
    animals: [{ col: 9, row: 8, type: 'rabbit' }, { col: 14, row: 10, type: 'rabbit' }],
    flag: { col: 11, row: 5 },
    butterflies: [
      { col: 8, row: 7, color: '#FF7043', speed: 1.2, phase: 0 },
      { col: 13, row: 8, color: '#FFD54F', speed: 0.9, phase: 1.5 },
      { col: 11, row: 10, color: '#F06292', speed: 1.1, phase: 3 },
    ],
    glowRadius: 9,
  },
  local: {
    cx: 47, cy: 8,
    bounds: { col1: 39, row1: 3, col2: 55, row2: 13 },
    themed: true,
    // Stage 1 (1/3+): farmer NPC + first seedlings
    farmer: { col: 44, row: 9 },
    // Stage 2 (2/3+): market stall
    marketStall: { col: 50, row: 8 },
    // Stage 3 (3/3): windmill + fruit trees
    windmill: { col: 47, row: 5 },
    fruitTrees: [
      { col: 42, row: 7 },
      { col: 52, row: 7 },
    ],
    // Final restoration layer (3/3): bees + "EAT LOCAL" banner
    bees: [
      { col: 45, row: 7, offset: 0 },
      { col: 48, row: 6, offset: 1.5 },
      { col: 51, row: 8, offset: 3.0 },
    ],
    localBanner: { col: 47, row: 4 },
    sprouts: [
      { col: 44, row: 7 }, { col: 49, row: 7 }, { col: 45, row: 9 },
      { col: 50, row: 10 }, { col: 47, row: 8 },
    ],
    flowers: [
      { col: 45, row: 6, color: '#FFB300' }, { col: 50, row: 6, color: '#66BB6A' },
      { col: 43, row: 9, color: '#FFD54F' }, { col: 51, row: 9, color: '#FFB300' },
      { col: 47, row: 10, color: '#66BB6A' },
    ],
    birds: [
      { col: 46, row: 7, radius: 3, speed: 0.6, phase: 1 },
      { col: 49, row: 9, radius: 2, speed: -0.7, phase: 3 },
    ],
    fish: [
      { col: 42, row: 3, dir: 1 }, { col: 52, row: 3, dir: -1 }, { col: 41, row: 12, dir: 1 },
    ],
    animals: [{ col: 45, row: 8, type: 'rabbit' }, { col: 50, row: 10, type: 'rabbit' }],
    flag: { col: 47, row: 5 },
    butterflies: [
      { col: 44, row: 7, color: '#FFB300', speed: 1.0, phase: 0.5 },
      { col: 49, row: 8, color: '#66BB6A', speed: 1.3, phase: 2 },
      { col: 47, row: 10, color: '#FFD54F', speed: 0.8, phase: 4 },
    ],
    glowRadius: 9,
  },
  growing: {
    cx: 11, cy: 30,
    bounds: { col1: 3, row1: 26, col2: 19, row2: 34 },
    themed: true,
    // Stage 1 (1/3+): food origins become visible as young crops
    youngCrops: [
      { col: 7, row: 29, color: '#81C784' },
      { col: 15, row: 29, color: '#AED581' },
      { col: 9, row: 32, color: '#66BB6A' },
      { col: 13, row: 32, color: '#9CCC65' },
    ],
    // Stage 2 (2/3+): tended beds, compost and pollinator flowers
    gardenBeds: [
      { col: 6, row: 31 },
      { col: 15, row: 31 },
    ],
    compostBin: { col: 17, row: 29 },
    // Stage 3 (3/3): healthy soil supports mature food plants
    healthySoil: [
      { col: 8, row: 30 },
      { col: 14, row: 30 },
      { col: 11, row: 33 },
    ],
    fruitTrees: [
      { col: 5, row: 29 },
      { col: 17, row: 32 },
    ],
    bees: [
      { col: 8, row: 28, offset: 0.5 },
      { col: 14, row: 29, offset: 2.2 },
      { col: 11, row: 32, offset: 4.1 },
    ],
    sprouts: [
      { col: 8, row: 29 }, { col: 13, row: 29 }, { col: 9, row: 31 },
      { col: 12, row: 32 }, { col: 15, row: 30 },
    ],
    flowers: [
      { col: 7, row: 28, color: '#FBC02D' }, { col: 14, row: 28, color: '#F06292' },
      { col: 6, row: 32, color: '#AB47BC' }, { col: 16, row: 30, color: '#FFB300' },
      { col: 10, row: 32, color: '#EC407A' },
    ],
    birds: [
      { col: 10, row: 29, radius: 3, speed: 0.8, phase: 0.5 },
      { col: 14, row: 31, radius: 2.5, speed: -0.6, phase: 2.5 },
    ],
    fish: [
      { col: 6, row: 34, dir: 1 }, { col: 16, row: 34, dir: -1 }, { col: 5, row: 27, dir: 1 },
    ],
    animals: [{ col: 9, row: 30, type: 'rabbit' }, { col: 14, row: 32, type: 'rabbit' }],
    flag: { col: 11, row: 28 },
    butterflies: [
      { col: 8, row: 29, color: '#FBC02D', speed: 1.1, phase: 1 },
      { col: 13, row: 30, color: '#F06292', speed: 0.9, phase: 2.5 },
      { col: 11, row: 32, color: '#AB47BC', speed: 1.2, phase: 4 },
    ],
    glowRadius: 9,
  },
  circular: {
    cx: 47, cy: 30,
    bounds: { col1: 38, row1: 26, col2: 55, row2: 34 },
    themed: true,
    // Stage 1 (1/3+): recycling bin + first sprout
    recycleBin: { col: 44, row: 30 },
    // Stage 2 (2/3+): compost pile
    compostPile: { col: 50, row: 29 },
    // Stage 3 (3/3): small garden from compost
    gardenPatch: [
      { col: 48, row: 31 },
      { col: 49, row: 31 },
      { col: 50, row: 31 },
    ],
    // Final restoration layer (3/3): recycle banner + cycle arrows
    recycleBanner: { col: 47, row: 27 },
    cycleArrows: { col: 47, row: 30 },
    sprouts: [
      { col: 43, row: 29 }, { col: 49, row: 29 }, { col: 44, row: 31 },
      { col: 50, row: 32 }, { col: 47, row: 30 },
    ],
    flowers: [
      { col: 41, row: 28, color: '#66BB6A' }, { col: 49, row: 28, color: '#81C784' },
      { col: 43, row: 31, color: '#A5D6A7' }, { col: 51, row: 31, color: '#66BB6A' },
      { col: 47, row: 32, color: '#81C784' },
    ],
    birds: [
      { col: 46, row: 29, radius: 3, speed: 0.7, phase: 1.5 },
      { col: 50, row: 31, radius: 2, speed: -0.5, phase: 3.5 },
    ],
    fish: [
      { col: 41, row: 34, dir: 1 }, { col: 52, row: 34, dir: -1 }, { col: 40, row: 27, dir: 1 },
    ],
    animals: [{ col: 44, row: 30, type: 'rabbit' }, { col: 50, row: 32, type: 'rabbit' }],
    flag: { col: 47, row: 28 },
    butterflies: [
      { col: 43, row: 29, color: '#66BB6A', speed: 1.0, phase: 0 },
      { col: 49, row: 30, color: '#81C784', speed: 1.2, phase: 2 },
      { col: 47, row: 32, color: '#A5D6A7', speed: 0.8, phase: 3.5 },
    ],
    glowRadius: 9,
  },
};

// ── Dead tile overlay helpers ───────────────────────────

function _deadSeed(col, row) {
  return ((col * 7 + row * 13 + col * row) & 0x7FFFFFFF);
}

function _drawDeadTree(ctx, dx, dy, death) {
  ctx.globalAlpha = death;

  // Cover the green canopy — brown dead ground
  ctx.fillStyle = '#8D7B6A';
  ctx.fillRect(dx, dy, TS, TS);

  // Ground shadow under stump
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath();
  ctx.ellipse(dx + 16, dy + 27, 8, 3, 0, Math.PI * 2, false);
  ctx.fill();

  // Dead stump trunk
  ctx.fillStyle = '#5D4037';
  ctx.fillRect(dx + 12, dy + 14, 8, 14);
  ctx.fillStyle = '#4E342E';
  ctx.fillRect(dx + 12, dy + 14, 4, 14);

  // Flat cut stump top
  ctx.fillStyle = '#8D6E63';
  ctx.beginPath();
  ctx.ellipse(dx + 16, dy + 14, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#A1887F';
  ctx.beginPath();
  ctx.ellipse(dx + 16, dy + 14, 4, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ring pattern on stump
  ctx.strokeStyle = 'rgba(62,39,35,0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(dx + 16, dy + 14, 2.5, 1.2, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Broken branch stubs
  ctx.strokeStyle = '#5D4037';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dx + 11, dy + 17);
  ctx.lineTo(dx + 6, dy + 13);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(dx + 21, dy + 19);
  ctx.lineTo(dx + 26, dy + 15);
  ctx.stroke();
  ctx.lineWidth = 1;

  ctx.globalAlpha = 1;
}

function _drawDeadGrass(ctx, dx, dy, death, col, row) {
  ctx.globalAlpha = death;

  const s = _deadSeed(col, row);
  ctx.fillStyle = s % 3 === 0 ? '#8D7B6A' : s % 3 === 1 ? '#7B6B5A' : '#6D5D4E';
  ctx.fillRect(dx, dy, TS, TS);

  // Cracks
  ctx.strokeStyle = 'rgba(62,39,35,0.5)';
  ctx.lineWidth = 0.7;
  const r = s % 100;
  ctx.beginPath();
  ctx.moveTo(dx + (r % 20) + 4, dy + 3);
  ctx.lineTo(dx + ((r + 30) % 28) + 2, dy + TS - 3);
  ctx.stroke();
  if (r > 40) {
    ctx.beginPath();
    ctx.moveTo(dx + TS - (r % 12) - 4, dy + 6);
    ctx.lineTo(dx + ((r + 15) % 20) + 6, dy + TS / 2 + 3);
    ctx.stroke();
  }

  // Dead grass tufts
  ctx.strokeStyle = '#A09080';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 3; i++) {
    const gx = dx + ((s + i * 37) % 24) + 4;
    const gy = dy + ((s + i * 23) % 20) + 8;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + (i % 2 === 0 ? 1 : -1) * 2, gy - 3);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function _drawDeadFlowers(ctx, dx, dy, death, col, row) {
  ctx.globalAlpha = death;

  ctx.fillStyle = '#8D7B6A';
  ctx.fillRect(dx, dy, TS, TS);

  // Wilted stems with drooping heads
  const s = _deadSeed(col, row);
  ctx.strokeStyle = '#6D5D4E';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const sx = dx + ((s + i * 31) % 22) + 5;
    const sy = dy + TS - 6;
    const lean = i % 2 === 0 ? 3 : -3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + lean, sy - 6, sx + lean * 1.5, sy - 10);
    ctx.stroke();
    ctx.fillStyle = '#9E9E9E';
    ctx.beginPath();
    ctx.arc(sx + lean * 1.5, sy - 10, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

function _drawDeadSand(ctx, dx, dy, death) {
  ctx.globalAlpha = death * 0.35;
  ctx.fillStyle = '#8D7B6A';
  ctx.fillRect(dx, dy, TS, TS);
  ctx.globalAlpha = 1;
}

// ── Food Waste Island — Themed decoration helpers ────────

function _drawSeagull(ctx, x, y, time, phase) {
  const bob = Math.sin(time * 1.8 + phase) * 2;
  const wingFlap = Math.sin(time * 4 + phase) * 0.3;

  ctx.save();
  ctx.translate(x, y + bob);

  // Body
  ctx.fillStyle = '#ECEFF1';
  ctx.beginPath();
  ctx.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#FAFAFA';
  ctx.beginPath();
  ctx.arc(5, -2, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Beak (orange)
  ctx.fillStyle = '#FF8F00';
  ctx.beginPath();
  ctx.moveTo(7.5, -2);
  ctx.lineTo(10, -1.5);
  ctx.lineTo(7.5, -1);
  ctx.closePath();
  ctx.fill();

  // Eye
  ctx.fillStyle = '#212121';
  ctx.beginPath();
  ctx.arc(6, -2.5, 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Wings
  ctx.strokeStyle = '#B0BEC5';
  ctx.lineWidth = 1.2;
  // Left wing
  ctx.beginPath();
  ctx.moveTo(-2, -1);
  ctx.quadraticCurveTo(-6, -4 + wingFlap * 6, -8, -2 + wingFlap * 4);
  ctx.stroke();
  // Right wing
  ctx.beginPath();
  ctx.moveTo(2, -1);
  ctx.quadraticCurveTo(0, -4 + wingFlap * 6, -3, -2 + wingFlap * 4);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Tail
  ctx.fillStyle = '#CFD8DC';
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(-8, -1);
  ctx.lineTo(-8, 1);
  ctx.closePath();
  ctx.fill();

  // Feet (on ground)
  ctx.strokeStyle = '#FF8F00';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-1, 3 - bob);
  ctx.lineTo(-2, 5 - bob);
  ctx.moveTo(1, 3 - bob);
  ctx.lineTo(2, 5 - bob);
  ctx.stroke();
  ctx.lineWidth = 1;

  ctx.restore();
}

function _drawGardenBed(ctx, x, y, time) {
  // Brown soil bed
  ctx.fillStyle = '#5D4037';
  ctx.beginPath();
  ctx.roundRect(x - 14, y - 4, 28, 14, 3);
  ctx.fill();

  // Soil texture — darker rows
  ctx.fillStyle = '#4E342E';
  ctx.fillRect(x - 12, y - 1, 24, 2);
  ctx.fillRect(x - 12, y + 4, 24, 2);

  // Wooden border
  ctx.strokeStyle = '#795548';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - 14, y - 4, 28, 14, 3);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Carrot (left)
  const c1bob = Math.sin(time * 1.5) * 0.5;
  ctx.fillStyle = '#66BB6A';
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 4 + c1bob);
  ctx.lineTo(x - 6, y - 8 + c1bob);
  ctx.lineTo(x - 4, y - 4 + c1bob);
  ctx.closePath();
  ctx.fill();
  // Carrot top visible
  ctx.fillStyle = '#FF8A65';
  ctx.beginPath();
  ctx.roundRect(x - 8, y - 3 + c1bob, 4, 3, 1);
  ctx.fill();

  // Leafy green (center)
  const c2bob = Math.sin(time * 1.5 + 1) * 0.5;
  ctx.fillStyle = '#43A047';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(x + i * 3, y - 6 + c2bob, 3, 4, i * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#388E3C';
  ctx.beginPath();
  ctx.ellipse(x, y - 4 + c2bob, 2, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Another carrot (right)
  const c3bob = Math.sin(time * 1.5 + 2) * 0.5;
  ctx.fillStyle = '#66BB6A';
  ctx.beginPath();
  ctx.moveTo(x + 6, y - 4 + c3bob);
  ctx.lineTo(x + 8, y - 9 + c3bob);
  ctx.lineTo(x + 10, y - 4 + c3bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FF8A65';
  ctx.beginPath();
  ctx.roundRect(x + 6, y - 3 + c3bob, 4, 3, 1);
  ctx.fill();
}

function _drawCompostBin(ctx, x, y, time) {
  // Brown barrel body
  const grad = ctx.createLinearGradient(x - 10, y, x + 10, y);
  grad.addColorStop(0, '#5D4037');
  grad.addColorStop(0.5, '#795548');
  grad.addColorStop(1, '#5D4037');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x - 10, y - 8, 20, 18, 3);
  ctx.fill();

  // Barrel bands (metal rings)
  ctx.strokeStyle = '#8D6E63';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 3);
  ctx.lineTo(x + 10, y - 3);
  ctx.moveTo(x - 10, y + 4);
  ctx.lineTo(x + 10, y + 4);
  ctx.stroke();

  // Lid
  ctx.fillStyle = '#6D4C41';
  ctx.beginPath();
  ctx.roundRect(x - 11, y - 10, 22, 4, 2);
  ctx.fill();

  // Lid handle
  ctx.strokeStyle = '#4E342E';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y - 12, 3, Math.PI, 0);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Compost symbol (green recycling arrows simplified)
  ctx.fillStyle = '#66BB6A';
  ctx.globalAlpha = 0.8;
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♻', x, y);
  ctx.globalAlpha = 1;

  // Steam/smell lines rising (organic waste decomposing)
  ctx.strokeStyle = 'rgba(139,195,74,0.4)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) {
    const sx = x - 4 + i * 4;
    const wave = Math.sin(time * 2 + i * 1.5) * 2;
    const rise = (time * 8 + i * 20) % 12;
    ctx.globalAlpha = Math.max(0, 0.5 - rise / 12);
    ctx.beginPath();
    ctx.moveTo(sx, y - 12 - rise);
    ctx.quadraticCurveTo(sx + wave, y - 16 - rise, sx, y - 20 - rise);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

function _drawFruitTree(ctx, x, y, time, hasFruit) {
  // Trunk
  ctx.fillStyle = '#5D4037';
  ctx.fillRect(x - 3, y, 6, 12);
  ctx.fillStyle = '#4E342E';
  ctx.fillRect(x - 3, y, 3, 12);

  // Canopy (layered circles)
  const canopyColors = ['#2E7D32', '#388E3C', '#43A047'];
  const offsets = [
    { dx: 0, dy: -8, r: 9 },
    { dx: -6, dy: -4, r: 7 },
    { dx: 6, dy: -4, r: 7 },
  ];
  for (let i = 0; i < offsets.length; i++) {
    const sway = Math.sin(time * 0.8 + i) * 1;
    ctx.fillStyle = canopyColors[i];
    ctx.beginPath();
    ctx.arc(x + offsets[i].dx + sway, y + offsets[i].dy, offsets[i].r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Leaf highlights
  ctx.fillStyle = 'rgba(129,199,132,0.4)';
  ctx.beginPath();
  ctx.arc(x - 3, y - 10, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 4, y - 6, 3, 0, Math.PI * 2);
  ctx.fill();

  // Fruits (apples / oranges)
  if (hasFruit) {
    const fruitPositions = [
      { dx: -5, dy: -3, color: '#E53935' },   // red apple
      { dx: 4, dy: -5, color: '#FF8F00' },    // orange
      { dx: -1, dy: -11, color: '#E53935' },   // red apple
      { dx: 6, dy: -1, color: '#FF8F00' },    // orange
    ];
    for (const f of fruitPositions) {
      const fbob = Math.sin(time * 1.5 + f.dx) * 0.5;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(x + f.dx, y + f.dy + fbob, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Tiny highlight
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(x + f.dx - 0.5, y + f.dy + fbob - 0.8, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function _drawWasteReducedBanner(ctx, x, y, time, label1 = 'WASTE', label2 = 'REDUCED!') {
  const wave = Math.sin(time * 2) * 1.5;

  // Wooden posts
  ctx.fillStyle = '#795548';
  ctx.fillRect(x - 20, y - 2, 3, 16);
  ctx.fillRect(x + 17, y - 2, 3, 16);

  // Banner fabric
  ctx.fillStyle = '#C8E6C9';
  ctx.beginPath();
  ctx.moveTo(x - 18, y);
  ctx.quadraticCurveTo(x, y + 2 + wave, x + 18, y);
  ctx.lineTo(x + 18, y + 10);
  ctx.quadraticCurveTo(x, y + 12 + wave, x - 18, y + 10);
  ctx.closePath();
  ctx.fill();

  // Banner border
  ctx.strokeStyle = '#66BB6A';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 18, y);
  ctx.quadraticCurveTo(x, y + 2 + wave, x + 18, y);
  ctx.lineTo(x + 18, y + 10);
  ctx.quadraticCurveTo(x, y + 12 + wave, x - 18, y + 10);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 1;

  // Text
  ctx.fillStyle = '#2E7D32';
  ctx.font = 'bold 6px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label1, x, y + 3.5 + wave * 0.5);
  ctx.fillText(label2, x, y + 8 + wave * 0.5);

  // Seedling emoji beside
  ctx.font = '7px sans-serif';
  ctx.fillText('🌱', x + 14, y + 5 + wave * 0.5);
}

function _drawFallingLeaf(ctx, x, y, time, offset) {
  const leafLife = (time * 0.4 + offset) % 3; // 3s cycle
  const fallY = leafLife * 10;
  const swayX = Math.sin(time * 1.5 + offset * 7) * 6;
  const spin = time * 2 + offset * 5;
  const alpha = Math.max(0, 1 - leafLife / 3);

  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  ctx.translate(x + swayX, y + fallY);
  ctx.rotate(spin);

  // Leaf shape
  ctx.fillStyle = offset % 2 === 0 ? '#66BB6A' : '#8BC34A';
  ctx.beginPath();
  ctx.ellipse(0, 0, 2, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Vein
  ctx.strokeStyle = 'rgba(46,125,50,0.5)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(0, 3);
  ctx.stroke();

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

function _drawCat(ctx, x, y, time, phase) {
  const bob = Math.abs(Math.sin(time * 2 + phase)) < 0.3
    ? Math.abs(Math.sin(time * 2 + phase)) * 5 : 0;

  ctx.save();
  ctx.translate(x, y - bob);

  // Body
  ctx.fillStyle = '#FF8A65';
  ctx.beginPath();
  ctx.ellipse(0, 2, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#FF8A65';
  ctx.beginPath();
  ctx.arc(5, -1, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Ears (triangles)
  ctx.fillStyle = '#FF7043';
  ctx.beginPath();
  ctx.moveTo(3, -3.5);
  ctx.lineTo(2.5, -7);
  ctx.lineTo(5, -4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(6.5, -3.5);
  ctx.lineTo(7, -7);
  ctx.lineTo(8, -4);
  ctx.closePath();
  ctx.fill();

  // Inner ears
  ctx.fillStyle = '#FFAB91';
  ctx.beginPath();
  ctx.moveTo(3.5, -4);
  ctx.lineTo(3, -6);
  ctx.lineTo(4.5, -4.5);
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#2E7D32';
  ctx.beginPath();
  ctx.ellipse(4, -1.5, 0.8, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(6.5, -1.5, 0.8, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pupils
  ctx.fillStyle = '#212121';
  ctx.beginPath();
  ctx.ellipse(4, -1.5, 0.3, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(6.5, -1.5, 0.3, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = '#E57373';
  ctx.beginPath();
  ctx.moveTo(5.2, 0);
  ctx.lineTo(4.8, 0.5);
  ctx.lineTo(5.6, 0.5);
  ctx.closePath();
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(2, -0.5); ctx.lineTo(-1, -1.5);
  ctx.moveTo(2, 0.5); ctx.lineTo(-1, 1);
  ctx.moveTo(8.5, -0.5); ctx.lineTo(11, -1.5);
  ctx.moveTo(8.5, 0.5); ctx.lineTo(11, 1);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Tail
  ctx.strokeStyle = '#FF8A65';
  ctx.lineWidth = 2;
  const tailWave = Math.sin(time * 3 + phase) * 3;
  ctx.beginPath();
  ctx.moveTo(-5, 2);
  ctx.quadraticCurveTo(-8, -2 + tailWave, -7, -5 + tailWave);
  ctx.stroke();
  ctx.lineWidth = 1;

  ctx.restore();
}

// ── Local & Seasonal Island — themed helpers ────────────

function _drawFarmerNPC(ctx, x, y, time) {
  const bob = Math.sin(time * 1.5) * 1.5;
  ctx.save();
  ctx.translate(x, y - bob);

  // Body (overalls)
  ctx.fillStyle = '#5D4037';
  ctx.fillRect(-4, 0, 8, 8);
  // Shirt
  ctx.fillStyle = '#E8F5E9';
  ctx.fillRect(-3, -1, 6, 4);
  // Head
  ctx.fillStyle = '#FFCC80';
  ctx.beginPath();
  ctx.arc(0, -4, 4, 0, Math.PI * 2);
  ctx.fill();
  // Hat (straw)
  ctx.fillStyle = '#F9A825';
  ctx.fillRect(-6, -8, 12, 3);
  ctx.fillRect(-4, -10, 8, 3);
  // Eyes
  ctx.fillStyle = '#333';
  ctx.fillRect(-2, -5, 1.2, 1.2);
  ctx.fillRect(1, -5, 1.2, 1.2);
  // Smile
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(0, -3, 2, 0.1, Math.PI - 0.1);
  ctx.stroke();
  ctx.lineWidth = 1;

  ctx.restore();
}

function _drawMarketStall(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);

  // Wooden frame
  ctx.fillStyle = '#8D6E63';
  ctx.fillRect(-12, -4, 24, 3); // counter top
  ctx.fillRect(-11, -1, 3, 10); // left leg
  ctx.fillRect(8, -1, 3, 10);   // right leg
  // Awning
  ctx.fillStyle = '#E53935';
  ctx.beginPath();
  ctx.moveTo(-14, -4);
  ctx.lineTo(14, -4);
  ctx.lineTo(12, -10);
  ctx.lineTo(-12, -10);
  ctx.closePath();
  ctx.fill();
  // White stripes on awning
  ctx.fillStyle = '#fff';
  ctx.fillRect(-8, -9, 3, 5);
  ctx.fillRect(-1, -9, 3, 5);
  ctx.fillRect(6, -9, 3, 5);
  // Vegetables on counter
  ctx.font = '6px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🥕', -6, -1);
  ctx.fillText('🍅', 0, -1);
  ctx.fillText('🥬', 6, -1);

  ctx.restore();
}

function _drawWindmill(ctx, x, y, time) {
  ctx.save();
  ctx.translate(x, y);

  // Tower body
  ctx.fillStyle = '#EFEBE9';
  ctx.beginPath();
  ctx.moveTo(-4, 12);
  ctx.lineTo(-3, -6);
  ctx.lineTo(3, -6);
  ctx.lineTo(4, 12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#BCAAA4';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Door
  ctx.fillStyle = '#795548';
  ctx.fillRect(-2, 6, 4, 6);

  // Hub
  ctx.fillStyle = '#795548';
  ctx.beginPath();
  ctx.arc(0, -6, 2, 0, Math.PI * 2);
  ctx.fill();

  // 4 rotating sails
  const angle = time * 1.2;
  ctx.strokeStyle = '#8D6E63';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const a = angle + (Math.PI / 2) * i;
    const sx = Math.cos(a) * 12;
    const sy = Math.sin(a) * 12;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(sx, -6 + sy);
    ctx.stroke();
    // Sail triangles
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(sx, -6 + sy);
    ctx.lineTo(sx * 0.8 + Math.cos(a + 0.3) * 3, -6 + sy * 0.8 + Math.sin(a + 0.3) * 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.lineWidth = 1;

  ctx.restore();
}

function _drawBee(ctx, x, y, time, offset) {
  // Figure-8 flight path
  const bx = x + Math.sin(time * 2 + offset) * 8;
  const by = y + Math.sin(time * 4 + offset) * 3;

  ctx.save();
  ctx.translate(bx, by);

  // Body
  ctx.fillStyle = '#FFD54F';
  ctx.beginPath();
  ctx.ellipse(0, 0, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Stripes
  ctx.fillStyle = '#333';
  ctx.fillRect(-1, -2, 1, 4);
  ctx.fillRect(1, -2, 1, 4);
  // Wings
  const wingFlap = Math.sin(time * 20 + offset) * 0.5;
  ctx.fillStyle = 'rgba(200,230,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(-1, -2 - wingFlap, 2, 1.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(1, -2 + wingFlap, 2, 1.5, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function _drawLocalBanner(ctx, x, y, time, label = 'EAT LOCAL! 🌿') {
  const wave = Math.sin(time * 1.8) * 2;

  ctx.save();
  ctx.translate(x, y);

  // Wooden posts
  ctx.fillStyle = '#795548';
  ctx.fillRect(-20, -2, 3, 16);
  ctx.fillRect(17, -2, 3, 16);

  // Banner cloth
  ctx.fillStyle = '#43A047';
  ctx.beginPath();
  ctx.moveTo(-17, 0 + wave * 0.3);
  ctx.quadraticCurveTo(0, 3 + wave, 17, 0 - wave * 0.3);
  ctx.lineTo(17, 8 - wave * 0.3);
  ctx.quadraticCurveTo(0, 11 + wave, -17, 8 + wave * 0.3);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.font = "bold 6px 'Inter', system-ui, sans-serif";
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, 6 + wave * 0.5);

  ctx.restore();
}

// ── Circular Economy Island — themed helpers ────────────

function _drawRecycleBin(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  // Bin body
  ctx.fillStyle = '#66BB6A';
  ctx.fillRect(-6, -2, 12, 10);
  // Lid
  ctx.fillStyle = '#43A047';
  ctx.fillRect(-7, -4, 14, 3);
  // Recycle symbol
  ctx.font = '6px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('♻️', 0, 6);
  ctx.restore();
}

function _drawCompostPile(ctx, x, y, time) {
  ctx.save();
  ctx.translate(x, y);
  // Pile shape
  ctx.fillStyle = '#6D4C41';
  ctx.beginPath();
  ctx.ellipse(0, 4, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5D4037';
  ctx.beginPath();
  ctx.ellipse(0, 2, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Steam wisps
  const wisp = Math.sin(time * 2) * 2;
  ctx.strokeStyle = 'rgba(200,200,200,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2, -1);
  ctx.quadraticCurveTo(-1 + wisp, -5, 0, -8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3, -1);
  ctx.quadraticCurveTo(4 - wisp, -6, 2, -9);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.restore();
}

function _drawRecycleBanner(ctx, x, y, time, label = 'RECYCLE! ♻️') {
  const wave = Math.sin(time * 1.5) * 1.5;
  ctx.save();
  ctx.translate(x, y);
  // Posts
  ctx.fillStyle = '#5D4037';
  ctx.fillRect(-20, 0, 3, 14);
  ctx.fillRect(17, 0, 3, 14);
  // Banner
  ctx.fillStyle = WORLD_ART.recyclingHub;
  ctx.beginPath();
  ctx.moveTo(-17, 2 + wave * 0.3);
  ctx.quadraticCurveTo(0, 5 + wave, 17, 2 - wave * 0.3);
  ctx.lineTo(17, 10 - wave * 0.3);
  ctx.quadraticCurveTo(0, 13 + wave, -17, 10 + wave * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.font = "bold 5px 'Inter', system-ui, sans-serif";
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, 8 + wave * 0.4);
  ctx.restore();
}

function _drawCycleArrows(ctx, x, y, time) {
  const angle = time * 0.8;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = WORLD_ART.recyclingHub;
  ctx.lineWidth = 1.5;
  // 3 curved arrows in a circle
  for (let i = 0; i < 3; i++) {
    const a = (Math.PI * 2 / 3) * i;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.arc(0, -6, 6, -0.3, Math.PI * 0.8);
    ctx.stroke();
    // Arrow head
    const tipX = Math.cos(Math.PI * 0.8) * 6;
    const tipY = -6 + Math.sin(Math.PI * 0.8) * 6;
    ctx.fillStyle = WORLD_ART.recyclingHub;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - 3, tipY - 1);
    ctx.lineTo(tipX - 1, tipY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.lineWidth = 1;
  ctx.restore();
}

function _drawYoungCrop(ctx, x, y, time, color = '#81C784') {
  const sway = Math.sin(time * 1.6 + x * 0.02) * 1.2;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#388E3C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.lineTo(sway, -3);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(-3 + sway, -1, 4, 2, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(3 + sway, -4, 4, 2, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FBC02D';
  ctx.fillRect(-1 + sway, -7, 2, 2);
  ctx.restore();
}

function _drawHealthySoilPatch(ctx, x, y, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#5D4037';
  ctx.fillRect(-11, 2, 22, 7);
  ctx.fillStyle = '#795548';
  ctx.fillRect(-8, 0, 16, 3);
  ctx.fillStyle = '#A1887F';
  ctx.fillRect(-6, 4, 2, 2);
  ctx.fillRect(4, 6, 2, 2);

  const wiggle = Math.sin(time * 2 + x) * 1.5;
  ctx.strokeStyle = '#EF8E73';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-2, 5);
  ctx.quadraticCurveTo(wiggle, 2, 4, 5);
  ctx.stroke();
  ctx.restore();
}

function _drawReturningBird(ctx, bird, time, toX, toY) {
  const bx = toX(bird.col) + TS / 2 + Math.cos(time * bird.speed + bird.phase) * bird.radius * TS;
  const by = toY(bird.row) + Math.sin(time * bird.speed * 0.7 + bird.phase) * TS * 0.5;
  if (bx < -TS || bx > CANVAS_W + TS || by < -TS || by > CANVAS_H + TS) return;

  const wingAngle = Math.sin(time * 6 + bird.phase) * 0.4;
  ctx.strokeStyle = '#263238';
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.82;
  ctx.beginPath();
  ctx.moveTo(bx - 5, by + wingAngle * 4);
  ctx.quadraticCurveTo(bx - 2, by - 1, bx, by);
  ctx.quadraticCurveTo(bx + 2, by - 1, bx + 5, by + wingAngle * 4);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

function _drawReturningFish(ctx, fish, time, toX, toY) {
  const phase = fish.col * 2.1 + fish.row;
  const swimOffset = Math.sin(time * 0.8 + phase) * TS * 0.8;
  const fx = toX(fish.col) + TS / 2 + swimOffset * fish.dir;
  const fy = toY(fish.row) + TS / 2 + Math.sin(time * 1.5 + phase) * 3;
  if (fx < -TS || fx > CANVAS_W + TS || fy < -TS || fy > CANVAS_H + TS) return;

  ctx.save();
  ctx.translate(fx, fy);
  if (Math.cos(time * 0.8 + phase) * fish.dir < 0) ctx.scale(-1, 1);
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = '#4DD0E1';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-3, -3.5);
  ctx.lineTo(-3, 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#80DEEA';
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.lineTo(-7, -3);
  ctx.lineTo(-7, 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#123B4A';
  ctx.fillRect(2, -1.5, 1.5, 1.5);
  ctx.restore();
}

function _drawShoreSparkle(ctx, x, y, time, phase) {
  const pulse = 0.45 + (Math.sin(time * 2.4 + phase) + 1) * 0.25;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#D7FAFF';
  ctx.fillRect(x - 1, y - 5, 2, 10);
  ctx.fillRect(x - 5, y - 1, 10, 2);
  ctx.fillStyle = '#80DEEA';
  ctx.fillRect(x - 2, y - 2, 4, 4);
  ctx.restore();
}

function _drawRestorationWildlife(ctx, cfg, done, time, toX, toY) {
  const stage = getRestorationStage(done, {
    birds: cfg.birds?.length,
    fish: cfg.fish?.length,
  });

  for (const bird of (cfg.birds || []).slice(0, stage.birdCount)) {
    _drawReturningBird(ctx, bird, time, toX, toY);
  }
  for (const fish of (cfg.fish || []).slice(0, stage.fishCount)) {
    _drawReturningFish(ctx, fish, time, toX, toY);
  }

  if (!stage.finalIntensity) return;
  const b = cfg.bounds;
  const sparkleAnchors = [
    { col: b.col1 + 1, row: b.row1 - 0.2 },
    { col: cfg.cx, row: b.row1 - 0.35 },
    { col: b.col2 - 1, row: b.row1 - 0.2 },
    { col: b.col1 + 1, row: b.row2 + 0.45 },
    { col: cfg.cx, row: b.row2 + 0.55 },
    { col: b.col2 - 1, row: b.row2 + 0.45 },
  ];
  for (let i = 0; i < stage.shoreSparkleCount; i += 1) {
    const sparkle = sparkleAnchors[i];
    _drawShoreSparkle(
      ctx,
      toX(sparkle.col) + TS / 2,
      toY(sparkle.row) + TS / 2,
      time,
      i * 0.9,
    );
  }
}

// ── Main evolution renderer ─────────────────────────────

export function renderIslandEvolution(ctx, state, completedMissions) {
  if (DRAFT_MODE) {
    // Simplified evolution: flat death overlays, static life markers, no animations
    const cam = state.camera;
    const visStartCol = Math.floor(cam.x / TS) - 1;
    const visStartRow = Math.floor(cam.y / TS) - 1;
    const visEndCol = visStartCol + VIEW_COLS + 2;
    const visEndRow = visStartRow + VIEW_ROWS + 2;

    for (const [island, cfg] of Object.entries(EVOLUTION_DATA)) {
      const done = (completedMissions?.[island] || []).length;
      const b = cfg.bounds;
      if (b.col2 < visStartCol || b.col1 > visEndCol) continue;
      if (b.row2 < visStartRow || b.row1 > visEndRow) continue;

      const toX = (col) => col * TS - cam.x;
      const toY = (row) => row * TS - cam.y;

      // Death overlay — flat brown tint
      if (done < MISSIONS_PER_ISLAND) {
        const deathAlpha = ((MISSIONS_PER_ISLAND - done) / MISSIONS_PER_ISLAND) * 0.5;
        const c1 = Math.max(b.col1, visStartCol);
        const c2 = Math.min(b.col2, visEndCol);
        const r1 = Math.max(b.row1, visStartRow);
        const r2 = Math.min(b.row2, visEndRow);

        ctx.fillStyle = `rgba(120,100,80,${deathAlpha.toFixed(2)})`;
        for (let row = r1; row <= r2; row++) {
          for (let col = c1; col <= c2; col++) {
            const tileId = getTile(col, row);
            if (tileId === TILE.TREE || tileId === TILE.GRASS || tileId === TILE.DARK_GRASS ||
                tileId === TILE.FLOWERS || tileId === TILE.SAND) {
              ctx.fillRect(toX(col), toY(row), TS, TS);
            }
          }
        }
      }

      if (done === 0) continue;

      // 1/3+: Static green dots for sprouts
      ctx.fillStyle = '#66BB6A';
      for (const sprout of cfg.sprouts) {
        const sx = toX(sprout.col) + TS / 2;
        const sy = toY(sprout.row) + TS / 2;
        if (sx < -TS || sx > CANVAS_W + TS) continue;
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 1/3+: Static colored dots for flowers
      for (const flower of cfg.flowers) {
        const fx = toX(flower.col) + TS / 2;
        const fy = toY(flower.row) + TS / 2;
        if (fx < -TS || fx > CANVAS_W + TS) continue;
        ctx.fillStyle = flower.color;
        ctx.beginPath();
        ctx.arc(fx, fy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2/3+: Simple "V" marks for birds
      if (done >= 2) {
        const wildlife = getRestorationStage(done, {
          birds: cfg.birds?.length,
          fish: cfg.fish?.length,
        });
        ctx.strokeStyle = '#37474F';
        ctx.lineWidth = 1;
        for (const bird of cfg.birds.slice(0, wildlife.birdCount)) {
          const bx = toX(bird.col) + TS / 2;
          const by = toY(bird.row) + TS / 2;
          if (bx < -TS || bx > CANVAS_W + TS) continue;
          ctx.beginPath();
          ctx.moveTo(bx - 4, by + 2);
          ctx.lineTo(bx, by - 2);
          ctx.lineTo(bx + 4, by + 2);
          ctx.stroke();
        }

        // Simple triangles for fish
        ctx.fillStyle = '#64B5F6';
        for (const fish of cfg.fish.slice(0, wildlife.fishCount)) {
          const fx = toX(fish.col) + TS / 2;
          const fy = toY(fish.row) + TS / 2;
          if (fx < -TS || fx > CANVAS_W + TS) continue;
          ctx.beginPath();
          ctx.moveTo(fx + 4 * fish.dir, fy);
          ctx.lineTo(fx - 3 * fish.dir, fy - 2);
          ctx.lineTo(fx - 3 * fish.dir, fy + 2);
          ctx.closePath();
          ctx.fill();
        }
      }

      // 3/3: Simple circles for animals + line for flag
      if (done >= 3) {
        ctx.fillStyle = '#BCAAA4';
        for (const animal of cfg.animals) {
          const ax = toX(animal.col) + TS / 2;
          const ay = toY(animal.row) + TS / 2;
          if (ax < -TS || ax > CANVAS_W + TS) continue;
          ctx.beginPath();
          ctx.arc(ax, ay, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Flag — simple line + rectangle
        const flagX = toX(cfg.flag.col) + TS / 2;
        const flagY = toY(cfg.flag.row);
        ctx.strokeStyle = '#795548';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(flagX, flagY + TS);
        ctx.lineTo(flagX, flagY - 4);
        ctx.stroke();
        ctx.fillStyle = ISLANDS[island]?.color || BRAND.orange;
        ctx.fillRect(flagX + 1, flagY - 4, 10, 8);
        ctx.lineWidth = 1;
      }

      // 3/3 final: Simple gold border glow — no butterflies, no lighthouse
      if (done >= MISSIONS_PER_ISLAND) {
        const bx = toX(b.col1);
        const by = toY(b.row1);
        const bw = (b.col2 - b.col1 + 1) * TS;
        const bh = (b.row2 - b.row1 + 1) * TS;
        ctx.strokeStyle = 'rgba(255,215,0,0.4)';
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.lineWidth = 1;
      }
    }
    return;
  }

  const cam = state.camera;
  const t = state.time;

  // Visible tile range (for per-tile culling)
  const visStartCol = Math.floor(cam.x / TS) - 1;
  const visStartRow = Math.floor(cam.y / TS) - 1;
  const visEndCol = visStartCol + VIEW_COLS + 2;
  const visEndRow = visStartRow + VIEW_ROWS + 2;

  for (const [island, cfg] of Object.entries(EVOLUTION_DATA)) {
    const done = (completedMissions?.[island] || []).length;

    const b = cfg.bounds;
    // Skip if entire island is offscreen
    if (b.col2 < visStartCol || b.col1 > visEndCol) continue;
    if (b.row2 < visStartRow || b.row1 > visEndRow) continue;

    const toX = (col) => col * TS - cam.x;
    const toY = (row) => row * TS - cam.y;

    // ═══════════════════════════════════════════════════════
    // PHASE 1: Per-tile death overlays (0-2/3)
    // deathLevel: 1.0 at 0/3, 0.67 at 1/3, 0.33 at 2/3
    // ═══════════════════════════════════════════════════════
    if (done < MISSIONS_PER_ISLAND) {
      const deathLevel = (MISSIONS_PER_ISLAND - done) / MISSIONS_PER_ISLAND;

      const c1 = Math.max(b.col1, visStartCol);
      const c2 = Math.min(b.col2, visEndCol);
      const r1 = Math.max(b.row1, visStartRow);
      const r2 = Math.min(b.row2, visEndRow);

      for (let row = r1; row <= r2; row++) {
        for (let col = c1; col <= c2; col++) {
          const tileId = getTile(col, row);
          const dx = toX(col);
          const dy = toY(row);

          if (tileId === TILE.TREE) {
            _drawDeadTree(ctx, dx, dy, deathLevel);
          } else if (tileId === TILE.GRASS || tileId === TILE.DARK_GRASS) {
            _drawDeadGrass(ctx, dx, dy, deathLevel, col, row);
          } else if (tileId === TILE.FLOWERS) {
            _drawDeadFlowers(ctx, dx, dy, deathLevel, col, row);
          } else if (tileId === TILE.SAND) {
            _drawDeadSand(ctx, dx, dy, deathLevel);
          } else if (tileId === TILE.ROCK) {
            ctx.globalAlpha = deathLevel * 0.2;
            ctx.fillStyle = '#424242';
            ctx.fillRect(dx, dy, TS, TS);
            ctx.globalAlpha = 1;
          }
        }
      }

      // Atmospheric fog (radial — heavier at center, fades at edges)
      const fogCx = toX(cfg.cx) + TS / 2;
      const fogCy = toY(cfg.cy) + TS / 2;
      const fogR = Math.max(b.col2 - b.col1, b.row2 - b.row1) * TS * 0.6;
      const fog = ctx.createRadialGradient(fogCx, fogCy, 0, fogCx, fogCy, fogR);
      fog.addColorStop(0, `rgba(120,120,120,${deathLevel * 0.12})`);
      fog.addColorStop(0.7, `rgba(100,100,100,${deathLevel * 0.06})`);
      fog.addColorStop(1, 'rgba(100,100,100,0)');
      ctx.fillStyle = fog;
      const bx = toX(b.col1);
      const by = toY(b.row1);
      ctx.fillRect(bx, by, (b.col2 - b.col1 + 1) * TS, (b.row2 - b.row1 + 1) * TS);
    }

    if (done === 0) continue; // no life decorations

    // ═══════════════════════════════════════════════════════
    // PHASE 2: Progressive life decorations
    // ═══════════════════════════════════════════════════════

    // ── Food Waste Island — themed decorations ──
    if (cfg.themed && island === 'foodwaste') {
      // Stage 1 (1/3+): Seagull on beach + vegetable sprout
      {
        const sg = cfg.seagulls[0];
        const sgx = toX(sg.col) + TS / 2;
        const sgy = toY(sg.row) + TS / 2 + 6;
        if (sgx > -TS && sgx < CANVAS_W + TS) {
          _drawSeagull(ctx, sgx, sgy, t, sg.phase);
        }

        // Vegetable sprout near center
        const vs = cfg.vegSprout;
        const vx = toX(vs.col) + TS / 2;
        const vy = toY(vs.row) + TS / 2 + 6;
        if (vx > -TS && vx < CANVAS_W + TS) {
          const growth = 1 + Math.sin(t * 1.5) * 0.2;
          const h = 7 * growth;
          ctx.strokeStyle = '#66BB6A';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(vx, vy);
          ctx.lineTo(vx, vy - h);
          ctx.stroke();
          ctx.lineWidth = 1;
          // Two leaves
          ctx.fillStyle = '#81C784';
          ctx.beginPath();
          ctx.ellipse(vx + 3, vy - h + 2, 3, 1.5, 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(vx - 2, vy - h + 4, 2.5, 1.2, -0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Stage 2 (2/3+): Garden bed + compost bin + second seagull
      if (done >= 2) {
        const gb = cfg.gardenBed;
        const gbx = toX(gb.col) + TS / 2;
        const gby = toY(gb.row) + TS / 2 + 4;
        if (gbx > -TS && gbx < CANVAS_W + TS) {
          _drawGardenBed(ctx, gbx, gby, t);
        }

        const cb = cfg.compostBin;
        const cbx = toX(cb.col) + TS / 2;
        const cby = toY(cb.row) + TS / 2;
        if (cbx > -TS && cbx < CANVAS_W + TS) {
          _drawCompostBin(ctx, cbx, cby, t);
        }

        // Second seagull
        const sg2 = cfg.seagulls[1];
        const sg2x = toX(sg2.col) + TS / 2;
        const sg2y = toY(sg2.row) + TS / 2 + 6;
        if (sg2x > -TS && sg2x < CANVAS_W + TS) {
          _drawSeagull(ctx, sg2x, sg2y, t, sg2.phase);
        }
      }

      // Stage 3 (3/3): Fruit tree + cat
      if (done >= 3) {
        const ft = cfg.fruitTree;
        const ftx = toX(ft.col) + TS / 2;
        const fty = toY(ft.row) + TS / 2 + 4;
        if (ftx > -TS && ftx < CANVAS_W + TS) {
          _drawFruitTree(ctx, ftx, fty, t, true);
        }

        const cat = cfg.cat;
        const catx = toX(cat.col) + TS / 2;
        const caty = toY(cat.row) + TS / 2 + 6;
        if (catx > -TS && catx < CANVAS_W + TS) {
          _drawCat(ctx, catx, caty, t, cat.phase);
        }
      }

      // Final restoration (3/3): butterflies + banner + falling leaves + green glow
      if (done >= MISSIONS_PER_ISLAND) {
        // Butterflies (same as generic)
        for (const bf of cfg.butterflies) {
          const bfx = toX(bf.col) + TS / 2 + Math.sin(t * bf.speed + bf.phase) * TS;
          const bfy = toY(bf.row) + TS / 2 + Math.cos(t * bf.speed * 0.8 + bf.phase * 2) * TS * 0.4;
          if (bfx < -TS * 2 || bfx > CANVAS_W + TS * 2 || bfy < -TS * 2 || bfy > CANVAS_H + TS * 2) continue;

          const wingOpen = (Math.sin(t * 8 + bf.phase) + 1) * 0.5;
          ctx.globalAlpha = 0.8;
          ctx.save();
          ctx.translate(bfx, bfy);
          ctx.scale(wingOpen * 0.7 + 0.3, 1);
          ctx.fillStyle = bf.color;
          ctx.beginPath();
          ctx.ellipse(-3, 0, 3, 4, -0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.save();
          ctx.translate(bfx, bfy);
          ctx.scale(wingOpen * 0.7 + 0.3, 1);
          ctx.fillStyle = bf.color;
          ctx.beginPath();
          ctx.ellipse(3, 0, 3, 4, 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#37474F';
          ctx.fillRect(bfx - 0.5, bfy - 2, 1, 4);
          ctx.globalAlpha = 1;
        }

        // "Waste Reduced!" banner
        const bn = cfg.banner;
        const bnx = toX(bn.col) + TS / 2;
        const bny = toY(bn.row);
        if (bnx > -TS * 2 && bnx < CANVAS_W + TS * 2) {
          _drawWasteReducedBanner(ctx, bnx, bny, t, state.strings?.bannerWaste1, state.strings?.bannerWaste2);
        }

        // Falling leaves from fruit tree
        for (const leaf of cfg.fallingLeaves) {
          const lx = toX(leaf.col) + TS / 2;
          const ly = toY(leaf.row);
          if (lx > -TS * 2 && lx < CANVAS_W + TS * 2) {
            _drawFallingLeaf(ctx, lx, ly, t, leaf.offset);
          }
        }

        // Green glow (instead of golden)
        const glowX = toX(cfg.cx) + TS / 2;
        const glowY = toY(cfg.cy) + TS / 2;
        const pulseR = cfg.glowRadius * TS * (0.9 + Math.sin(t * 1.5) * 0.1);
        const glowGrad = ctx.createRadialGradient(glowX, glowY, pulseR * 0.2, glowX, glowY, pulseR);
        glowGrad.addColorStop(0, 'rgba(102,187,106,0.14)');
        glowGrad.addColorStop(0.5, 'rgba(76,175,80,0.07)');
        glowGrad.addColorStop(1, 'rgba(76,175,80,0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(glowX, glowY, pulseR, 0, Math.PI * 2);
        ctx.fill();
      }

      _drawRestorationWildlife(ctx, cfg, done, t, toX, toY);
      continue; // skip generic decorations for foodwaste island
    }

    // ── Local & Seasonal Island — themed decorations ──
    if (cfg.themed && island === 'local') {
      // Stage 1 (1/3+): Farmer NPC + seedlings
      {
        const fm = cfg.farmer;
        const fmx = toX(fm.col) + TS / 2;
        const fmy = toY(fm.row) + TS / 2 + 4;
        if (fmx > -TS && fmx < CANVAS_W + TS) {
          _drawFarmerNPC(ctx, fmx, fmy, t);
        }

        // Sprout seedlings (reuse from generic data)
        for (const sprout of cfg.sprouts.slice(0, 3)) {
          const sx = toX(sprout.col) + TS / 2;
          const sy = toY(sprout.row) + TS / 2 + 8;
          if (sx < -TS || sx > CANVAS_W + TS) continue;
          const growth = 1 + Math.sin(t * 1.5 + sprout.col) * 0.2;
          const h = 6 * growth;
          ctx.strokeStyle = '#66BB6A';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx, sy - h);
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.fillStyle = '#81C784';
          ctx.beginPath();
          ctx.ellipse(sx + 3, sy - h + 2, 3, 1.5, 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Stage 2 (2/3+): Market stall
      if (done >= 2) {
        const ms = cfg.marketStall;
        const msx = toX(ms.col) + TS / 2;
        const msy = toY(ms.row) + TS / 2;
        if (msx > -TS && msx < CANVAS_W + TS) {
          _drawMarketStall(ctx, msx, msy);
        }

        // More flowers
        for (const flower of cfg.flowers) {
          const fx = toX(flower.col) + TS / 2;
          const fy = toY(flower.row) + TS / 2;
          if (fx < -TS || fx > CANVAS_W + TS) continue;
          const breathe = 1 + Math.sin(t * 2 + flower.col * 1.3) * 0.15;
          ctx.fillStyle = flower.color;
          ctx.beginPath();
          ctx.arc(fx, fy, 3 * breathe, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FFF9C4';
          ctx.beginPath();
          ctx.arc(fx, fy, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Stage 3 (3/3): Windmill + fruit trees
      if (done >= 3) {
        const wm = cfg.windmill;
        const wmx = toX(wm.col) + TS / 2;
        const wmy = toY(wm.row) + TS / 2;
        if (wmx > -TS && wmx < CANVAS_W + TS) {
          _drawWindmill(ctx, wmx, wmy, t);
        }

        for (const ft of cfg.fruitTrees) {
          const ftx = toX(ft.col) + TS / 2;
          const fty = toY(ft.row) + TS / 2 + 4;
          if (ftx > -TS && ftx < CANVAS_W + TS) {
            _drawFruitTree(ctx, ftx, fty, t, true);
          }
        }
      }

      // Final restoration (3/3): bees + banner + golden glow
      if (done >= MISSIONS_PER_ISLAND) {
        // Buzzing bees
        for (const bee of cfg.bees) {
          const beex = toX(bee.col) + TS / 2;
          const beey = toY(bee.row) + TS / 2;
          if (beex > -TS * 2 && beex < CANVAS_W + TS * 2) {
            _drawBee(ctx, beex, beey, t, bee.offset);
          }
        }

        // "EAT LOCAL!" banner
        const bn = cfg.localBanner;
        const bnx = toX(bn.col) + TS / 2;
        const bny = toY(bn.row);
        if (bnx > -TS * 2 && bnx < CANVAS_W + TS * 2) {
          _drawLocalBanner(ctx, bnx, bny, t, state.strings?.bannerEatLocal);
        }

        // Butterflies
        for (const bf of cfg.butterflies) {
          const bfx = toX(bf.col) + TS / 2 + Math.sin(t * bf.speed + bf.phase) * TS;
          const bfy = toY(bf.row) + TS / 2 + Math.cos(t * bf.speed * 0.8 + bf.phase * 2) * TS * 0.4;
          if (bfx < -TS * 2 || bfx > CANVAS_W + TS * 2) continue;
          const wingOpen = (Math.sin(t * 8 + bf.phase) + 1) * 0.5;
          ctx.globalAlpha = 0.8;
          ctx.save();
          ctx.translate(bfx, bfy);
          ctx.scale(wingOpen * 0.7 + 0.3, 1);
          ctx.fillStyle = bf.color;
          ctx.beginPath();
          ctx.ellipse(-3, 0, 3, 4, -0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.save();
          ctx.translate(bfx, bfy);
          ctx.scale(wingOpen * 0.7 + 0.3, 1);
          ctx.fillStyle = bf.color;
          ctx.beginPath();
          ctx.ellipse(3, 0, 3, 4, 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#37474F';
          ctx.fillRect(bfx - 0.5, bfy - 2, 1, 4);
          ctx.globalAlpha = 1;
        }

        // Golden glow
        const glowX = toX(cfg.cx) + TS / 2;
        const glowY = toY(cfg.cy) + TS / 2;
        const pulseR = cfg.glowRadius * TS * (0.9 + Math.sin(t * 1.5) * 0.1);
        const glowGrad = ctx.createRadialGradient(glowX, glowY, pulseR * 0.2, glowX, glowY, pulseR);
        glowGrad.addColorStop(0, 'rgba(255,179,0,0.14)');
        glowGrad.addColorStop(0.5, 'rgba(255,183,77,0.07)');
        glowGrad.addColorStop(1, 'rgba(255,183,77,0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(glowX, glowY, pulseR, 0, Math.PI * 2);
        ctx.fill();
      }

      _drawRestorationWildlife(ctx, cfg, done, t, toX, toY);
      continue; // skip generic decorations for local island
    }

    // ── Little Gardener Island — crops, soil and habitat restoration ──
    if (cfg.themed && island === 'growing') {
      // Stage 1 (1/3+): young food crops show where food begins.
      for (const crop of cfg.youngCrops) {
        const cropX = toX(crop.col) + TS / 2;
        const cropY = toY(crop.row) + TS / 2 + 5;
        if (cropX > -TS && cropX < CANVAS_W + TS) {
          _drawYoungCrop(ctx, cropX, cropY, t, crop.color);
        }
      }

      // Stage 2 (2/3+): tended beds, compost and pollinator flowers.
      if (done >= 2) {
        for (const bed of cfg.gardenBeds) {
          const bedX = toX(bed.col) + TS / 2;
          const bedY = toY(bed.row) + TS / 2 + 4;
          if (bedX > -TS && bedX < CANVAS_W + TS) {
            _drawGardenBed(ctx, bedX, bedY, t);
          }
        }

        const compostX = toX(cfg.compostBin.col) + TS / 2;
        const compostY = toY(cfg.compostBin.row) + TS / 2;
        if (compostX > -TS && compostX < CANVAS_W + TS) {
          _drawCompostBin(ctx, compostX, compostY, t);
        }

        for (const flower of cfg.flowers) {
          const flowerX = toX(flower.col) + TS / 2;
          const flowerY = toY(flower.row) + TS / 2;
          if (flowerX < -TS || flowerX > CANVAS_W + TS) continue;
          const breathe = 1 + Math.sin(t * 2 + flower.col * 1.3) * 0.15;
          ctx.fillStyle = flower.color;
          ctx.beginPath();
          ctx.arc(flowerX, flowerY, 3 * breathe, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FFF9C4';
          ctx.beginPath();
          ctx.arc(flowerX, flowerY, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Stage 3 (3/3): healthy soil supports mature food plants.
      if (done >= MISSIONS_PER_ISLAND) {
        for (const soil of cfg.healthySoil) {
          const soilX = toX(soil.col) + TS / 2;
          const soilY = toY(soil.row) + TS / 2 + 5;
          if (soilX > -TS && soilX < CANVAS_W + TS) {
            _drawHealthySoilPatch(ctx, soilX, soilY, t);
          }
        }

        for (const tree of cfg.fruitTrees) {
          const treeX = toX(tree.col) + TS / 2;
          const treeY = toY(tree.row) + TS / 2 + 4;
          if (treeX > -TS && treeX < CANVAS_W + TS) {
            _drawFruitTree(ctx, treeX, treeY, t, true);
          }
        }

        for (const bee of cfg.bees) {
          const beeX = toX(bee.col) + TS / 2;
          const beeY = toY(bee.row) + TS / 2;
          if (beeX > -TS * 2 && beeX < CANVAS_W + TS * 2) {
            _drawBee(ctx, beeX, beeY, t, bee.offset);
          }
        }

        for (const butterfly of cfg.butterflies) {
          const butterflyX = toX(butterfly.col) + TS / 2
            + Math.sin(t * butterfly.speed + butterfly.phase) * TS;
          const butterflyY = toY(butterfly.row) + TS / 2
            + Math.cos(t * butterfly.speed * 0.8 + butterfly.phase * 2) * TS * 0.4;
          if (butterflyX < -TS * 2 || butterflyX > CANVAS_W + TS * 2) continue;
          const wingOpen = (Math.sin(t * 8 + butterfly.phase) + 1) * 0.5;
          ctx.globalAlpha = 0.82;
          ctx.save();
          ctx.translate(butterflyX, butterflyY);
          ctx.scale(wingOpen * 0.7 + 0.3, 1);
          ctx.fillStyle = butterfly.color;
          ctx.beginPath();
          ctx.ellipse(-3, 0, 3, 4, -0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(3, 0, 3, 4, 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 1;
        }

        // Warm garden glow: stronger and more relevant than the old CO2 layer.
        const glowX = toX(cfg.cx) + TS / 2;
        const glowY = toY(cfg.cy) + TS / 2;
        const pulseR = cfg.glowRadius * TS * (0.96 + Math.sin(t * 1.5) * 0.08);
        const glow = ctx.createRadialGradient(glowX, glowY, pulseR * 0.15, glowX, glowY, pulseR);
        glow.addColorStop(0, 'rgba(174,213,129,0.20)');
        glow.addColorStop(0.55, 'rgba(102,187,106,0.10)');
        glow.addColorStop(1, 'rgba(76,175,80,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(glowX, glowY, pulseR, 0, Math.PI * 2);
        ctx.fill();
      }

      _drawRestorationWildlife(ctx, cfg, done, t, toX, toY);
      continue; // skip generic decorations for Little Gardener island
    }

    // ── Circular Economy Island — themed decorations ──
    if (cfg.themed && island === 'circular') {
      // Stage 1 (1/3+): Recycling bin + seedlings
      {
        const rb = cfg.recycleBin;
        const rbx = toX(rb.col) + TS / 2;
        const rby = toY(rb.row) + TS / 2;
        if (rbx > -TS && rbx < CANVAS_W + TS) {
          _drawRecycleBin(ctx, rbx, rby);
        }

        for (const sprout of cfg.sprouts.slice(0, 3)) {
          const sx = toX(sprout.col) + TS / 2;
          const sy = toY(sprout.row) + TS / 2 + 8;
          if (sx < -TS || sx > CANVAS_W + TS) continue;
          const growth = 1 + Math.sin(t * 1.5 + sprout.col) * 0.2;
          const h = 6 * growth;
          ctx.strokeStyle = '#66BB6A';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx, sy - h);
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.fillStyle = '#81C784';
          ctx.beginPath();
          ctx.ellipse(sx + 3, sy - h + 2, 3, 1.5, 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Stage 2 (2/3+): Compost pile + flowers
      if (done >= 2) {
        const cp = cfg.compostPile;
        const cpx = toX(cp.col) + TS / 2;
        const cpy = toY(cp.row) + TS / 2;
        if (cpx > -TS && cpx < CANVAS_W + TS) {
          _drawCompostPile(ctx, cpx, cpy, t);
        }

        for (const flower of cfg.flowers) {
          const fx = toX(flower.col) + TS / 2;
          const fy = toY(flower.row) + TS / 2;
          if (fx < -TS || fx > CANVAS_W + TS) continue;
          const breathe = 1 + Math.sin(t * 2 + flower.col * 1.3) * 0.15;
          ctx.fillStyle = flower.color;
          ctx.beginPath();
          ctx.arc(fx, fy, 3 * breathe, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FFF9C4';
          ctx.beginPath();
          ctx.arc(fx, fy, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Stage 3 (3/3): Garden patch (compost → growth)
      if (done >= 3) {
        for (const gp of cfg.gardenPatch) {
          const gpx = toX(gp.col) + TS / 2;
          const gpy = toY(gp.row) + TS / 2 + 4;
          if (gpx > -TS && gpx < CANVAS_W + TS) {
            _drawFruitTree(ctx, gpx, gpy, t, true);
          }
        }
      }

      // Final restoration (3/3): recycle banner + cycle arrows + butterflies + green glow
      if (done >= MISSIONS_PER_ISLAND) {
        // Rotating cycle arrows
        const ca = cfg.cycleArrows;
        const cax = toX(ca.col) + TS / 2;
        const cay = toY(ca.row) + TS / 2;
        if (cax > -TS * 2 && cax < CANVAS_W + TS * 2) {
          _drawCycleArrows(ctx, cax, cay, t);
        }

        // Recycle banner
        const bn = cfg.recycleBanner;
        const bnx = toX(bn.col) + TS / 2;
        const bny = toY(bn.row);
        if (bnx > -TS * 2 && bnx < CANVAS_W + TS * 2) {
          _drawRecycleBanner(ctx, bnx, bny, t, state.strings?.bannerRecycle);
        }

        // Butterflies
        for (const bf of cfg.butterflies) {
          const bfx = toX(bf.col) + TS / 2 + Math.sin(t * bf.speed + bf.phase) * TS;
          const bfy = toY(bf.row) + TS / 2 + Math.cos(t * bf.speed * 0.8 + bf.phase * 2) * TS * 0.4;
          if (bfx < -TS * 2 || bfx > CANVAS_W + TS * 2) continue;
          const wingOpen = (Math.sin(t * 8 + bf.phase) + 1) * 0.5;
          ctx.globalAlpha = 0.8;
          ctx.save();
          ctx.translate(bfx, bfy);
          ctx.scale(wingOpen * 0.7 + 0.3, 1);
          ctx.fillStyle = bf.color;
          ctx.beginPath();
          ctx.ellipse(-3, 0, 3, 4, -0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.save();
          ctx.translate(bfx, bfy);
          ctx.scale(wingOpen * 0.7 + 0.3, 1);
          ctx.fillStyle = bf.color;
          ctx.beginPath();
          ctx.ellipse(3, 0, 3, 4, 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#37474F';
          ctx.fillRect(bfx - 0.5, bfy - 2, 1, 4);
          ctx.globalAlpha = 1;
        }

        // Green glow
        const glowX = toX(cfg.cx) + TS / 2;
        const glowY = toY(cfg.cy) + TS / 2;
        const pulseR = cfg.glowRadius * TS * (0.9 + Math.sin(t * 1.5) * 0.1);
        const glowGrad = ctx.createRadialGradient(glowX, glowY, pulseR * 0.2, glowX, glowY, pulseR);
        glowGrad.addColorStop(0, 'rgba(102,187,106,0.14)');
        glowGrad.addColorStop(0.5, 'rgba(76,175,80,0.07)');
        glowGrad.addColorStop(1, 'rgba(76,175,80,0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(glowX, glowY, pulseR, 0, Math.PI * 2);
        ctx.fill();
      }

      _drawRestorationWildlife(ctx, cfg, done, t, toX, toY);
      continue; // skip generic decorations for circular island
    }

    // ── Generic decorations (for non-themed islands) ──

    // ── 1/3+: Green sprouts emerging from dead earth ──
    for (const sprout of cfg.sprouts) {
      const sx = toX(sprout.col) + TS / 2;
      const sy = toY(sprout.row) + TS / 2 + 8;
      if (sx < -TS || sx > CANVAS_W + TS || sy < -TS || sy > CANVAS_H + TS) continue;

      const phase = sprout.col * 1.7 + sprout.row;
      const growth = 1 + Math.sin(t * 1.5 + phase) * 0.2;
      const h = 5 * growth;

      ctx.strokeStyle = '#66BB6A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - h);
      ctx.stroke();
      ctx.lineWidth = 1;

      // Tiny leaf
      ctx.fillStyle = '#81C784';
      ctx.beginPath();
      ctx.ellipse(sx + 2, sy - h + 1, 2.5, 1.2, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 1/3+: Flowers blooming ──
    for (const flower of cfg.flowers) {
      const fx = toX(flower.col) + TS / 2;
      const fy = toY(flower.row) + TS / 2;
      if (fx < -TS || fx > CANVAS_W + TS || fy < -TS || fy > CANVAS_H + TS) continue;

      const phase = flower.col * 1.3 + flower.row * 0.7;
      const breathe = 1 + Math.sin(t * 2 + phase) * 0.15;
      const r = 3 * breathe;

      ctx.fillStyle = flower.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();

      // Center
      ctx.fillStyle = '#FFF9C4';
      ctx.beginPath();
      ctx.arc(fx, fy, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── 2/3+: Birds circling overhead + fish ──
    if (done >= 2) {
      for (const bird of cfg.birds) {
        const bx = toX(bird.col) + TS / 2 + Math.cos(t * bird.speed + bird.phase) * bird.radius * TS;
        const by = toY(bird.row) + Math.sin(t * bird.speed * 0.7 + bird.phase) * TS * 0.5;
        if (bx < -TS || bx > CANVAS_W + TS || by < -TS || by > CANVAS_H + TS) continue;

        const wingAngle = Math.sin(t * 6 + bird.phase) * 0.4;

        ctx.strokeStyle = '#37474F';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(bx - 5, by + wingAngle * 4);
        ctx.quadraticCurveTo(bx - 2, by - 1, bx, by);
        ctx.quadraticCurveTo(bx + 2, by - 1, bx + 5, by + wingAngle * 4);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
      }

      for (const fish of cfg.fish) {
        const phase = fish.col * 2.1 + fish.row;
        const swimOffset = Math.sin(t * 0.8 + phase) * TS * 0.8;
        const fx = toX(fish.col) + TS / 2 + swimOffset * fish.dir;
        const fy = toY(fish.row) + TS / 2 + Math.sin(t * 1.5 + phase) * 3;
        if (fx < -TS || fx > CANVAS_W + TS || fy < -TS || fy > CANVAS_H + TS) continue;

        ctx.save();
        ctx.translate(fx, fy);
        if (Math.cos(t * 0.8 + phase) * fish.dir < 0) ctx.scale(-1, 1);

        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#64B5F6';
        ctx.beginPath();
        ctx.moveTo(5, 0); ctx.lineTo(-3, -3); ctx.lineTo(-3, 3);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-3, 0); ctx.lineTo(-6, -2.5); ctx.lineTo(-6, 2.5);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // ── 3/3: Animals (rabbits) + flag ──
    if (done >= 3) {
      for (const animal of cfg.animals) {
        const ax = toX(animal.col) + TS / 2;
        const ay = toY(animal.row) + TS / 2 + 6;
        if (ax < -TS || ax > CANVAS_W + TS || ay < -TS || ay > CANVAS_H + TS) continue;

        const hopOffset = Math.abs(Math.sin(t * 2 + animal.col * 3)) < 0.3
          ? Math.abs(Math.sin(t * 2 + animal.col * 3)) * 8 : 0;

        // Body
        ctx.fillStyle = '#BCAAA4';
        ctx.beginPath();
        ctx.ellipse(ax, ay - hopOffset, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.beginPath();
        ctx.arc(ax + 3, ay - 3 - hopOffset, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Ears
        ctx.fillStyle = '#D7CCC8';
        ctx.beginPath();
        ctx.ellipse(ax + 2, ay - 7 - hopOffset, 1, 3, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(ax + 4, ay - 7 - hopOffset, 1, 3, 0.2, 0, Math.PI * 2);
        ctx.fill();
        // Eye
        ctx.fillStyle = '#3E2723';
        ctx.beginPath();
        ctx.arc(ax + 4, ay - 3.5 - hopOffset, 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Tail
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(ax - 3.5, ay - 1 - hopOffset, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Flag / pennant
      const flagX = toX(cfg.flag.col) + TS / 2;
      const flagY = toY(cfg.flag.row);

      ctx.strokeStyle = '#795548';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(flagX, flagY + TS);
      ctx.lineTo(flagX, flagY - 4);
      ctx.stroke();
      ctx.lineWidth = 1;

      const wave = Math.sin(t * 3) * 2;
      const wave2 = Math.sin(t * 3 + 1) * 1.5;
      ctx.fillStyle = ISLANDS[island]?.color || BRAND.orange;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(flagX, flagY - 4);
      ctx.quadraticCurveTo(flagX + 6 + wave, flagY - 1 + wave2, flagX + 12, flagY - 3);
      ctx.lineTo(flagX + 10, flagY + 3);
      ctx.quadraticCurveTo(flagX + 5 + wave * 0.5, flagY + 5 + wave2 * 0.5, flagX, flagY + 5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── 3/3 final: Paradise — butterflies + golden glow ──
    if (done >= MISSIONS_PER_ISLAND) {
      // Butterflies
      for (const bf of cfg.butterflies) {
        const bfx = toX(bf.col) + TS / 2 + Math.sin(t * bf.speed + bf.phase) * TS;
        const bfy = toY(bf.row) + TS / 2 + Math.cos(t * bf.speed * 0.8 + bf.phase * 2) * TS * 0.4;
        if (bfx < -TS * 2 || bfx > CANVAS_W + TS * 2 || bfy < -TS * 2 || bfy > CANVAS_H + TS * 2) continue;

        const wingOpen = (Math.sin(t * 8 + bf.phase) + 1) * 0.5;

        ctx.globalAlpha = 0.8;
        // Left wing
        ctx.save();
        ctx.translate(bfx, bfy);
        ctx.scale(wingOpen * 0.7 + 0.3, 1);
        ctx.fillStyle = bf.color;
        ctx.beginPath();
        ctx.ellipse(-3, 0, 3, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Right wing
        ctx.save();
        ctx.translate(bfx, bfy);
        ctx.scale(wingOpen * 0.7 + 0.3, 1);
        ctx.fillStyle = bf.color;
        ctx.beginPath();
        ctx.ellipse(3, 0, 3, 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Body
        ctx.fillStyle = '#37474F';
        ctx.fillRect(bfx - 0.5, bfy - 2, 1, 4);
        ctx.globalAlpha = 1;
      }

      // Golden glow pulse
      const glowX = toX(cfg.cx) + TS / 2;
      const glowY = toY(cfg.cy) + TS / 2;
      const pulseR = cfg.glowRadius * TS * (0.9 + Math.sin(t * 1.5) * 0.1);

      const glowGrad = ctx.createRadialGradient(glowX, glowY, pulseR * 0.2, glowX, glowY, pulseR);
      glowGrad.addColorStop(0, 'rgba(255,215,0,0.14)');
      glowGrad.addColorStop(0.5, 'rgba(255,183,77,0.07)');
      glowGrad.addColorStop(1, 'rgba(255,183,77,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(glowX, glowY, pulseR, 0, Math.PI * 2);
      ctx.fill();

      // Lighthouse beam (rotating)
      const beamAngle = t * 0.5;
      const beamLen = cfg.glowRadius * TS * 0.8;
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = '#FFD54F';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(glowX, glowY);
      ctx.lineTo(glowX + Math.cos(beamAngle) * beamLen, glowY + Math.sin(beamAngle) * beamLen);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
}

// ─── Particles ────────────────────────────────────────────

const MAX_PARTICLES = 50;

export function initParticles(state) {
  state.particles = [];
  state.particleTimer = 0;
}

export function updateParticles(state, dt) {
  state.particleTimer += dt;

  // Spawn ambient particles
  if (state.particleTimer > 0.15 && state.particles.length < MAX_PARTICLES) {
    state.particleTimer = 0;

    const cam = state.camera;
    const rx = cam.x + Math.random() * CANVAS_W;
    const ry = cam.y + Math.random() * CANVAS_H;
    const col = Math.floor(rx / TS);
    const row = Math.floor(ry / TS);
    const tile = getTile(col, row);

    if (isWaterTile(tile)) {
      // Water sparkle
      state.particles.push({
        type: 'sparkle',
        x: rx, y: ry,
        life: 1.0,
        maxLife: 0.8 + Math.random() * 0.6,
        size: 1 + Math.random() * 1.5,
      });
    } else if (tile === TILE.TREE) {
      // Floating leaf
      state.particles.push({
        type: 'leaf',
        x: rx, y: ry - 10,
        vx: (Math.random() - 0.5) * 15,
        vy: 8 + Math.random() * 10,
        life: 1.0,
        maxLife: 2 + Math.random(),
        rot: Math.random() * Math.PI * 2,
      });
    }
  }

  // Update existing particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.life -= dt / pt.maxLife;

    if (pt.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }

    if (pt.type === 'leaf') {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.rot += dt * 2;
    } else if (pt.type === 'wake') {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.size += dt * 6; // ripple expands outward
    }
  }
}

export function renderParticles(ctx, state) {
  if (DRAFT_MODE) return; // Skip particles entirely

  const cam = state.camera;

  for (const pt of state.particles) {
    const sx = pt.x - cam.x;
    const sy = pt.y - cam.y;

    if (sx < -10 || sx > CANVAS_W + 10 || sy < -10 || sy > CANVAS_H + 10) continue;

    const alpha = Math.min(1, pt.life * 2);

    if (pt.type === 'sparkle') {
      const pulse = 0.5 + Math.sin(pt.life * 10) * 0.5;
      ctx.globalAlpha = alpha * pulse;
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx - 1, sy, 2, 1);
      ctx.fillRect(sx, sy - 1, 1, 2);
      ctx.globalAlpha = 1;
    } else if (pt.type === 'leaf') {
      ctx.globalAlpha = alpha * 0.7;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(pt.rot);
      ctx.fillStyle = '#81C784';
      ctx.beginPath();
      ctx.ellipse(0, 0, 3, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(-0.5, -1, 1, 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (pt.type === 'wake') {
      ctx.globalAlpha = alpha * 0.4;
      ctx.strokeStyle = '#B3E5FC';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, pt.size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

/** Spawn wake ripples behind the moving boat */
export function spawnWakeParticle(state, x, y) {
  if (DRAFT_MODE) return; // Skip wake particles
  if (state.particles.length >= MAX_PARTICLES) return;

  for (let i = 0; i < 2; i++) {
    state.particles.push({
      type: 'wake',
      x: x + (Math.random() - 0.5) * 6,
      y: y + 10 + Math.random() * 4,
      vx: (Math.random() - 0.5) * 8,
      vy: 2 + Math.random() * 3,
      life: 1.0,
      maxLife: 0.5 + Math.random() * 0.3,
      size: 2,
    });
  }
}

// ─── Floating Debris + Trash Cargo System ─────────────────

// Partner review 15.07: identifiable real-world litter (plastic bottle, plastic
// bag, drink can) instead of generic emoji — drawn as flat vector sprites below.
const DEBRIS_KINDS = ['bottle', 'bag', 'can'];
const MAX_DEBRIS = 8;
const DEBRIS_DRIFT_SPEED = 4;  // pixels/sec

export function initDebris(state) {
  state.debris = [];
  state.debrisCollected = 0;
  // Trash cargo system
  state.trashCargo = 0;
  state.trashCapacity = 3;
  state.cargoFull = false;
  state.cargoFullFlashTime = 0;
}

// Weighted island pollution — more trash near low-completion islands
function _getIslandWeights(completedMissions) {
  const weights = [];
  for (const [id, data] of Object.entries(EVOLUTION_DATA)) {
    const done = (completedMissions?.[id] || []).length;
    const w = MISSIONS_PER_ISLAND - done;
    if (w > 0) weights.push({ island: id, weight: w, bounds: data.bounds });
  }
  return weights;
}

function _spawnRandomDebris(state) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const col = Math.floor(Math.random() * MAP_COLS);
    const row = Math.floor(Math.random() * MAP_ROWS);
    if (getTile(col, row) !== TILE.DEEP_WATER) continue;
    const p = state.player;
    if (Math.abs(col - p.col) < 4 && Math.abs(row - p.row) < 4) continue;
    state.debris.push({
      x: col * TS + TS / 2,
      y: row * TS + TS / 2,
      kind: DEBRIS_KINDS[Math.floor(Math.random() * DEBRIS_KINDS.length)],
      tilt: (Math.random() - 0.5) * 0.9, // fixed float attitude per piece
      driftAngle: Math.random() * Math.PI * 2,
      bob: Math.random() * Math.PI * 2,
    });
    return;
  }
}

export function getDebrisTarget(completedMissions) {
  const completedCount = Number.isFinite(completedMissions)
    ? Math.max(0, Math.floor(completedMissions))
    : Object.values(completedMissions || {}).reduce(
      (total, missions) => total + (Array.isArray(missions) ? missions.length : 0),
      0,
    );

  if (completedCount >= 12) return 2;
  if (completedCount >= 10) return 4;
  if (completedCount >= 7) return 5;
  if (completedCount >= 4) return 6;
  if (completedCount >= 1) return 7;
  return MAX_DEBRIS;
}

export function spawnDebris(state, completedMissions) {
  const target = getDebrisTarget(completedMissions);
  if (state.debris.length > target) state.debris.splice(target);
  if (state.debris.length >= target) return;

  const weights = _getIslandWeights(completedMissions);

  // All islands 3/3 — keep the restored ocean replayable with renewable debris.
  if (weights.length === 0) {
    _spawnRandomDebris(state);
    return;
  }

  // Weighted random: pick island proportional to pollution level
  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * totalWeight;
  let chosen = weights[0];
  for (const w of weights) {
    roll -= w.weight;
    if (roll <= 0) { chosen = w; break; }
  }

  // Spawn 3-6 tiles from the chosen island's boundary
  const b = chosen.bounds;
  for (let attempt = 0; attempt < 30; attempt++) {
    const side = Math.floor(Math.random() * 4);
    let col, row;
    if (side === 0) {        // above
      col = b.col1 + Math.floor(Math.random() * (b.col2 - b.col1));
      row = b.row1 - 3 - Math.floor(Math.random() * 4);
    } else if (side === 1) { // below
      col = b.col1 + Math.floor(Math.random() * (b.col2 - b.col1));
      row = b.row2 + 3 + Math.floor(Math.random() * 4);
    } else if (side === 2) { // left
      col = b.col1 - 3 - Math.floor(Math.random() * 4);
      row = b.row1 + Math.floor(Math.random() * (b.row2 - b.row1));
    } else {                 // right
      col = b.col2 + 3 + Math.floor(Math.random() * 4);
      row = b.row1 + Math.floor(Math.random() * (b.row2 - b.row1));
    }
    if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) continue;
    if (getTile(col, row) !== TILE.DEEP_WATER) continue;
    const p = state.player;
    if (Math.abs(col - p.col) < 4 && Math.abs(row - p.row) < 4) continue;

    state.debris.push({
      x: col * TS + TS / 2,
      y: row * TS + TS / 2,
      kind: DEBRIS_KINDS[Math.floor(Math.random() * DEBRIS_KINDS.length)],
      tilt: (Math.random() - 0.5) * 0.9, // fixed float attitude per piece
      driftAngle: Math.random() * Math.PI * 2,
      bob: Math.random() * Math.PI * 2,
    });
    return;
  }
}

export function updateDebris(state, dt) {
  for (const d of state.debris) {
    const newX = d.x + Math.cos(d.driftAngle) * DEBRIS_DRIFT_SPEED * dt;
    const newY = d.y + Math.sin(d.driftAngle) * DEBRIS_DRIFT_SPEED * dt;
    const col = Math.floor(newX / TS);
    const row = Math.floor(newY / TS);

    if (getTile(col, row) === TILE.DEEP_WATER) {
      d.x = newX;
      d.y = newY;
    } else {
      d.driftAngle += Math.PI;
    }

    d.bob += dt * 2;
    d.driftAngle += (Math.random() - 0.5) * dt * 0.5;
  }
}

export function checkDebrisCollection(state) {
  // Cargo full — can't collect more
  if (state.trashCargo >= state.trashCapacity) {
    if (!state.cargoFull) {
      state.cargoFull = true;
      state.cargoFullFlashTime = state.time;
    }
    return false;
  }

  const p = state.player;
  const px = p.pixelX + TS / 2;
  const py = p.pixelY + TS / 2;

  for (let i = state.debris.length - 1; i >= 0; i--) {
    const d = state.debris[i];
    const dist = Math.hypot(d.x - px, d.y - py);
    if (dist < TS * 1.2) {
      for (let j = 0; j < 4; j++) {
        if (state.particles.length < 80) {
          state.particles.push({
            type: 'sparkle',
            x: d.x, y: d.y,
            life: 1.0,
            maxLife: 0.4 + Math.random() * 0.3,
            size: 2 + Math.random() * 2,
          });
        }
      }
      state.debris.splice(i, 1);
      state.debrisCollected++;
      state.trashCargo++;

      if (state.trashCargo >= state.trashCapacity) {
        state.cargoFull = true;
        state.cargoFullFlashTime = state.time;
      }
      return true;
    }
  }
  return false;
}

export function recycleTrash(state) {
  if (state.trashCargo <= 0) return { recycled: 0, points: 0 };

  const recycled = state.trashCargo;
  const points = recycled * 5;
  state.trashCargo = 0;
  state.cargoFull = false;

  // Green sparkle burst
  const p = state.player;
  for (let i = 0; i < 8; i++) {
    if (state.particles.length < 80) {
      state.particles.push({
        type: 'sparkle',
        x: p.pixelX + TS / 2 + (Math.random() - 0.5) * 20,
        y: p.pixelY + TS / 2 + (Math.random() - 0.5) * 20,
        life: 1.0,
        maxLife: 0.6 + Math.random() * 0.4,
        size: 3 + Math.random() * 3,
      });
    }
  }
  return { recycled, points };
}

// Litter sprites — centered on (0,0), ~20px tall, flat fills + dark outline to
// match the world art. Caller sets translate/rotate/alpha.
function drawDebrisBottle(ctx) {
  // Clear plastic water bottle: pale translucent body, blue cap, white label.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#46687D';
  ctx.fillStyle = 'rgba(203,229,241,0.92)';
  ctx.beginPath();
  ctx.moveTo(-4.5, -6);
  ctx.lineTo(-2, -9.5);   // shoulder taper → neck
  ctx.lineTo(2, -9.5);
  ctx.lineTo(4.5, -6);
  ctx.lineTo(4.5, 9);
  ctx.lineTo(-4.5, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2E86C1';  // cap
  ctx.fillRect(-2.5, -12.5, 5, 3.5);
  ctx.strokeRect(-2.5, -12.5, 5, 3.5);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; // label band
  ctx.fillRect(-4.5, 0, 9, 4.5);
  ctx.strokeStyle = 'rgba(70,104,125,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-4.5, 0, 9, 4.5);
  ctx.beginPath();            // plastic sheen
  ctx.moveTo(-2.5, -5);
  ctx.lineTo(-2.5, -1);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
}

function drawDebrisBag(ctx) {
  // Crumpled plastic bag: white puffed body + two handle loops.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#7C8B93';
  ctx.beginPath();            // handles first, behind the body
  ctx.arc(-3.5, -5.5, 2.5, Math.PI, 0);
  ctx.moveTo(6, -5.5);
  ctx.arc(3.5, -5.5, 2.5, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(240,243,245,0.94)';
  ctx.beginPath();            // irregular pillow blob
  ctx.moveTo(-7.5, -4);
  ctx.quadraticCurveTo(-9.5, 2, -6, 6.5);
  ctx.quadraticCurveTo(-1, 9, 5, 6.5);
  ctx.quadraticCurveTo(9.5, 3, 7.5, -3.5);
  ctx.quadraticCurveTo(3, -6.5, 0, -5);
  ctx.quadraticCurveTo(-4, -6.5, -7.5, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(124,139,147,0.6)'; // creases
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-3, -2); ctx.lineTo(-1, 3);
  ctx.moveTo(2, -2.5); ctx.lineTo(4, 2);
  ctx.stroke();
}

function drawDebrisCan(ctx) {
  // Drink can: red body, silver ends, pull tab.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#5B1E16';
  ctx.fillStyle = '#C0392B';
  ctx.fillRect(-4.5, -6, 9, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; // label stripe
  ctx.fillRect(-4.5, -1.5, 9, 3);
  ctx.strokeRect(-4.5, -6, 9, 12);
  ctx.fillStyle = '#C8CDD0';  // top + bottom rims
  ctx.beginPath();
  ctx.ellipse(0, -6, 4.5, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 6, 4.5, 1.8, 0, 0, Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#8F979C';  // pull tab
  ctx.fillRect(-1, -7, 2, 1.6);
}

function drawDebrisSprite(ctx, kind) {
  if (kind === 'bag') drawDebrisBag(ctx);
  else if (kind === 'can') drawDebrisCan(ctx);
  else drawDebrisBottle(ctx);
}

export function renderDebris(ctx, state) {
  if (DRAFT_MODE) {
    // Simple static squares for debris — no bob animation
    const cam = state.camera;
    for (const d of state.debris) {
      const sx = d.x - cam.x;
      const sy = d.y - cam.y;
      if (sx < -TS || sx > CANVAS_W + TS || sy < -TS || sy > CANVAS_H + TS) continue;
      ctx.fillStyle = 'rgba(180,120,60,0.7)';
      ctx.fillRect(sx - 5, sy - 5, 10, 10);
      ctx.strokeStyle = '#5D4037';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 5, sy - 5, 10, 10);
    }
    return;
  }

  const cam = state.camera;
  for (const d of state.debris) {
    const sx = d.x - cam.x;
    const sy = d.y - cam.y + Math.sin(d.bob) * 2;
    if (sx < -TS || sx > CANVAS_W + TS || sy < -TS || sy > CANVAS_H + TS) continue;

    ctx.save();
    ctx.translate(sx, sy);
    // Dark water ring so pale litter (bottle, bag) stays visible on blue sea.
    ctx.fillStyle = 'rgba(13,38,62,0.38)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 12, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate((d.tilt || 0) + Math.sin(d.bob * 0.6) * 0.1); // lazy float sway
    drawDebrisSprite(ctx, d.kind);
    ctx.restore();
  }
}

// ─── Recycling Island UI ──────────────────────────────────

export function shouldRenderRecyclingPrompt(state) {
  return Boolean(state.nearRecyclingDock && state.toast?.variant !== 'impact');
}

export function renderRecyclingDockPrompt(ctx, state) {
  state.recyclingPromptRect = null;
  if (!shouldRenderRecyclingPrompt(state)) return;

  if (DRAFT_MODE) {
    const count = state.trashCargo;
    const text = count > 0
      ? (state.strings?.recyclePrompt || 'Press Enter to recycle') + ` (${count})`
      : (state.strings?.recycleEmpty || 'No trash to recycle!');
    const color = count > 0 ? WORLD_ART.recyclingHub : '#757575';

    ctx.font = "bold 14px sans-serif";
    const w = Math.max(ctx.measureText(text).width + 30, 250);
    const h = 36;
    const px = CANVAS_W / 2 - w / 2;
    const py = CANVAS_H - 70;
    state.recyclingPromptRect = { x: px, y: py, width: w, height: h };

    ctx.fillStyle = color;
    ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, w, h);
    drawText(ctx, text, CANVAS_W / 2, py + h / 2, {
      font: "bold 14px sans-serif", color: '#fff',
      align: 'center', baseline: 'middle',
    });
    return;
  }

  const count = state.trashCargo;
  const text = count > 0
    ? (state.strings?.recyclePrompt || 'Press Enter to recycle') + ` (${count})`
    : (state.strings?.recycleEmpty || 'No trash to recycle!');
  const color = count > 0 ? WORLD_ART.recyclingHub : '#757575';
  const pulse = 0.9 + Math.sin(state.time * 3) * 0.1;

  ctx.font = "bold 16px 'Inter', system-ui, sans-serif";
  const promptW = Math.max(ctx.measureText(text).width + 50, 280);
  const promptH = 46;
  const px = CANVAS_W / 2 - promptW / 2;
  const py = CANVAS_H - 75;
  state.recyclingPromptRect = {
    x: px,
    y: py,
    width: promptW,
    height: promptH,
  };

  ctx.globalAlpha = pulse;
  drawRoundedRect(ctx, px + 2, py + 3, promptW, promptH, 23, 'rgba(0,0,0,0.3)', 'transparent');
  drawRoundedRect(ctx, px, py, promptW, promptH, 23, color, 'rgba(255,255,255,0.2)');
  drawText(ctx, text, CANVAS_W / 2, py + promptH / 2, {
    font: "bold 15px 'Inter', system-ui, sans-serif",
    color: '#fff',
    align: 'center',
    baseline: 'middle',
  });
  ctx.globalAlpha = 1;
}

export function shouldRenderRecyclingArrow(state) {
  return (state.trashCargo || 0) > 0;
}

export function renderRecyclingArrow(ctx, state) {
  state.recyclingArrowVisible = false;
  if (!shouldRenderRecyclingArrow(state)) return;

  if (DRAFT_MODE) {
    // Simple static arrow pointing toward recycling island
    const targetX = 28 * TS + TS / 2;
    const targetY = 37 * TS + TS / 2;
    const p = state.player;
    const dx = targetX - (p.pixelX + TS / 2);
    const dy = targetY - (p.pixelY + TS / 2);
    const dist = Math.hypot(dx, dy);
    if (dist < TS * 5) return;

    const angle = Math.atan2(dy, dx);
    const boatScreenX = (p.pixelX - state.camera.x + TS / 2) * VIEW_SCALE;
    const boatScreenY = (p.pixelY - state.camera.y + TS / 2) * VIEW_SCALE;
    let ax = Math.max(30, Math.min(CANVAS_W - 30, boatScreenX + Math.cos(angle) * 80));
    let ay = Math.max(40, Math.min(CANVAS_H - 40, boatScreenY + Math.sin(angle) * 80));

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = WORLD_ART.recyclingHub;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    state.recyclingArrowVisible = true;
    return;
  }

  // Direction from player to recycling island center
  const targetX = 28 * TS + TS / 2;
  const targetY = 37 * TS + TS / 2;
  const p = state.player;
  const dx = targetX - (p.pixelX + TS / 2);
  const dy = targetY - (p.pixelY + TS / 2);
  const dist = Math.hypot(dx, dy);
  if (dist < TS * 5) return; // close enough, don't show

  const angle = Math.atan2(dy, dx);

  // Position near the boat (80px orbit radius around boat's screen position)
  const boatScreenX = (p.pixelX - state.camera.x + TS / 2) * VIEW_SCALE;
  const boatScreenY = (p.pixelY - state.camera.y + TS / 2) * VIEW_SCALE;
  const orbitR = 80;
  let ax = boatScreenX + Math.cos(angle) * orbitR;
  let ay = boatScreenY + Math.sin(angle) * orbitR;
  ax = Math.max(30, Math.min(CANVAS_W - 30, ax));
  ay = Math.max(40, Math.min(CANVAS_H - 40, ay));

  const pulse = 0.7 + Math.sin(state.time * 4) * 0.3;
  ctx.globalAlpha = pulse;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.fillStyle = WORLD_ART.recyclingHub;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-6, -8);
  ctx.lineTo(-6, -3);
  ctx.lineTo(-14, -3);
  ctx.lineTo(-14, 3);
  ctx.lineTo(-6, 3);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fill();

  // Recycling emoji next to arrow
  ctx.rotate(-angle);
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u267B\uFE0F', 0, -24);
  ctx.restore();
  ctx.globalAlpha = 1;
  state.recyclingArrowVisible = true;
}

// ─── Whale Sighting ───────────────────────────────────────

export function initWhale(state) {
  state.whale = null;
  state.whaleTimer = 30 + Math.random() * 30;  // first spawn 30-60s in
}

export function updateWhale(state, dt) {
  // Countdown to next whale spawn
  if (!state.whale) {
    state.whaleTimer -= dt;
    if (state.whaleTimer <= 0) {
      // Pick random deep water tile far from player
      for (let attempt = 0; attempt < 30; attempt++) {
        const col = Math.floor(Math.random() * 60);
        const row = Math.floor(Math.random() * 40);
        if (getTile(col, row) !== TILE.DEEP_WATER) continue;

        const p = state.player;
        const dist = Math.hypot(col - p.col, row - p.row);
        if (dist < 5 || dist > 20) continue;  // not too close, not too far

        state.whale = {
          x: col * TS + TS / 2,
          y: row * TS + TS / 2,
          col, row,
          frame: 0,        // 0=rising, 1=peak, 2=diving
          elapsed: 0,
          totalDuration: 2.5,
          spotted: false,
        };
        return;
      }
      // Failed to place — try again soon
      state.whaleTimer = 10;
    }
    return;
  }

  // Animate breach
  const w = state.whale;
  w.elapsed += dt;
  w.frame = w.elapsed < 0.8 ? 0 : w.elapsed < 1.6 ? 1 : 2;

  if (w.elapsed >= w.totalDuration) {
    state.whale = null;
    state.whaleTimer = 60 + Math.random() * 40;  // next whale in 60-100s
  }
}

export function checkWhaleProximity(state) {
  if (!state.whale || state.whale.spotted) return false;

  const p = state.player;
  const dist = Math.hypot(state.whale.col - p.col, state.whale.row - p.row);
  if (dist <= 4) {
    state.whale.spotted = true;
    return true;
  }
  return false;
}

export function renderWhale(ctx, state) {
  if (!state.whale) return;

  if (DRAFT_MODE) {
    // Simple grey oval — no animation frames
    const w = state.whale;
    const cam = state.camera;
    const sx = w.x - cam.x;
    const sy = w.y - cam.y;
    if (sx < -TS * 2 || sx > CANVAS_W + TS * 2 || sy < -TS * 2 || sy > CANVAS_H + TS * 2) return;

    ctx.fillStyle = '#546E7A';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#37474F';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx + 10, sy - 2, 2, 0, Math.PI * 2);
    ctx.fill();

    drawText(ctx, 'WHALE', sx, sy + 14, {
      font: "bold 7px sans-serif", color: '#37474F',
      align: 'center', baseline: 'middle',
    });
    return;
  }

  const w = state.whale;
  const cam = state.camera;
  const sx = w.x - cam.x;
  const sy = w.y - cam.y;

  if (sx < -TS * 2 || sx > CANVAS_W + TS * 2 || sy < -TS * 2 || sy > CANVAS_H + TS * 2) return;

  // 3-frame breach animation
  const progress = w.elapsed / w.totalDuration;
  let yOffset = 0;
  let scale = 1;
  let alpha = 1;

  if (w.frame === 0) {
    // Rising — whale emerges from water
    const t = w.elapsed / 0.8;
    yOffset = (1 - t) * 20;
    scale = 0.6 + t * 0.4;
    alpha = t;
  } else if (w.frame === 1) {
    // Peak — fully visible, slight arc
    const t = (w.elapsed - 0.8) / 0.8;
    yOffset = -Math.sin(t * Math.PI) * 8;
    scale = 1;
  } else {
    // Diving — whale submerges
    const t = (w.elapsed - 1.6) / 0.9;
    yOffset = t * 25;
    scale = 1 - t * 0.4;
    alpha = 1 - t;
  }

  // Water splash ring
  ctx.globalAlpha = alpha * 0.3;
  ctx.strokeStyle = '#B3E5FC';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(sx, sy + 8, 18 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Whale body (pixel art style)
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.translate(sx, sy + yOffset);
  ctx.scale(scale, scale);

  // Body (dark blue-grey)
  ctx.fillStyle = '#37474F';
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly (lighter)
  ctx.fillStyle = '#78909C';
  ctx.beginPath();
  ctx.ellipse(0, 3, 12, 4, 0, 0, Math.PI);
  ctx.fill();

  // Tail fin
  ctx.fillStyle = '#37474F';
  ctx.beginPath();
  ctx.moveTo(-16, -2);
  ctx.lineTo(-24, -8);
  ctx.lineTo(-22, 0);
  ctx.lineTo(-24, 6);
  ctx.lineTo(-16, 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(10, -2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#263238';
  ctx.beginPath();
  ctx.arc(10.5, -2, 1, 0, Math.PI * 2);
  ctx.fill();

  // Water spout (only at peak frame)
  if (w.frame === 1) {
    const spoutH = 6 + Math.sin(w.elapsed * 12) * 3;
    ctx.strokeStyle = 'rgba(179, 229, 252, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(4, -8);
    ctx.lineTo(2, -8 - spoutH);
    ctx.moveTo(4, -8);
    ctx.lineTo(6, -8 - spoutH);
    ctx.stroke();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ─── Toast Notification (native resolution) ───────────────

export function initToast(state) {
  state.toast = null;
}

function buildRecyclingImpactDeck(messageCount, cycle) {
  const deck = Array.from({ length: messageCount }, (_, index) => index);
  if (messageCount < 2) return deck;

  // Keep the established turtle message first on the player's first trip,
  // then deterministically reshuffle each complete cycle. The trip counter is
  // persisted, so the sequence survives navigation and page refreshes.
  const firstShuffledIndex = cycle === 0 ? 1 : 0;
  let seed = Math.imul(cycle + 1, 0x9E3779B1) >>> 0;
  for (let index = messageCount - 1; index > firstShuffledIndex; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swapIndex = firstShuffledIndex + (seed % (index - firstShuffledIndex + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  if (cycle > 0 && messageCount > 2) {
    const previousDeck = buildRecyclingImpactDeck(messageCount, cycle - 1);
    if (deck[0] === previousDeck[messageCount - 1]) {
      [deck[0], deck[1]] = [deck[1], deck[0]];
    }
  }

  return deck;
}

export function selectRecyclingImpact(messages, recycleTrip) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  if (messages.length === 1) return messages[0];

  const trip = Math.max(1, Math.floor(Number(recycleTrip) || 1));
  const cycle = Math.floor((trip - 1) / messages.length);
  const position = (trip - 1) % messages.length;
  const deck = buildRecyclingImpactDeck(messages.length, cycle);
  return messages[deck[position]];
}

export function buildRecyclingRewardToast(strings, recycled, totalPoints, recycleTrip = 1) {
  return {
    text: strings.recycleSuccess(recycled, totalPoints),
    detail: selectRecyclingImpact(strings.recycleImpacts, recycleTrip),
    variant: 'impact',
    duration: 4.8,
  };
}

export function showToast(state, text, color = BRAND.green, options = {}) {
  state.toast = {
    text,
    color,
    detail: options.detail || null,
    variant: options.variant || 'default',
    elapsed: 0,
    duration: options.duration || 3.0,
  };
}

export function updateToast(state, dt) {
  if (!state.toast) return;
  state.toast.elapsed += dt;
  if (state.toast.elapsed >= state.toast.duration) {
    state.toast = null;
  }
}

export function renderToast(ctx, state) {
  if (!state.toast) return;

  if (DRAFT_MODE) {
    // Simple rectangle, no fade/slide animation
    const t = state.toast;
    ctx.font = "bold 16px sans-serif";
    const titleW = ctx.measureText(t.text).width;
    ctx.font = "14px sans-serif";
    const detailW = t.detail ? ctx.measureText(t.detail).width : 0;
    const textW = Math.max(titleW, detailW) + 30;
    const boxH = t.detail ? 64 : 36;
    const bx = CANVAS_W / 2 - textW / 2;
    const by = CANVAS_H - (t.detail ? 128 : 100);

    ctx.fillStyle = t.color;
    ctx.fillRect(bx, by, textW, boxH);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, textW, boxH);
    drawText(ctx, t.text, CANVAS_W / 2, by + (t.detail ? 22 : boxH / 2), {
      font: "bold 15px sans-serif", color: '#fff',
      align: 'center', baseline: 'middle',
    });
    if (t.detail) {
      drawText(ctx, t.detail, CANVAS_W / 2, by + 45, {
        font: "13px sans-serif", color: '#fff',
        align: 'center', baseline: 'middle',
      });
    }
    return;
  }

  const t = state.toast;
  const progress = t.elapsed / t.duration;

  // Fade in/out
  let alpha;
  if (progress < 0.15) alpha = progress / 0.15;
  else if (progress > 0.75) alpha = (1 - progress) / 0.25;
  else alpha = 1;

  // Slide up from bottom
  const slideY = progress < 0.15 ? (1 - progress / 0.15) * 20 : 0;

  ctx.globalAlpha = alpha;

  ctx.font = "bold 18px 'Inter', system-ui, sans-serif";
  const titleW = ctx.measureText(t.text).width;
  ctx.font = "14px 'Inter', system-ui, sans-serif";
  const detailW = t.detail ? ctx.measureText(t.detail).width : 0;
  const textW = Math.min(CANVAS_W - 64, Math.max(titleW, detailW) + (t.detail ? 56 : 40));
  const boxH = t.detail ? 76 : 44;
  const bx = CANVAS_W / 2 - textW / 2;
  const by = CANVAS_H - (t.detail ? 132 : 110) + slideY;

  if (t.variant === 'impact') {
    // Retro two-line reward card: the action stays prominent, while the
    // environmental consequence gets enough quiet space to be read.
    drawRoundedRect(ctx, bx + 3, by + 4, textW, boxH, 7,
      'rgba(0,0,0,0.24)', 'transparent');
    drawRetroBox(ctx, bx, by, textW, boxH, {
      fill: '#F8F4E3', outer: '#1B5E20', inner: '#A5D6A7', radius: 7,
    });
    drawText(ctx, t.text, CANVAS_W / 2, by + 26, {
      font: "bold 18px 'Inter', system-ui, sans-serif",
      color: '#1B5E20', align: 'center', baseline: 'middle',
    });
    drawText(ctx, t.detail, CANVAS_W / 2, by + 52, {
      font: "14px 'Inter', system-ui, sans-serif",
      color: '#2E5D35', align: 'center', baseline: 'middle',
    });
  } else {
    // Existing compact one-line toast remains unchanged for all other events.
    drawRoundedRect(ctx, bx + 2, by + 3, textW, boxH, 22,
      'rgba(0,0,0,0.2)', 'transparent');
    drawRoundedRect(ctx, bx, by, textW, boxH, 22,
      t.color, 'rgba(255,255,255,0.2)');
    drawText(ctx, t.text, CANVAS_W / 2, by + boxH / 2, {
      font: "bold 17px 'Inter', system-ui, sans-serif",
      color: '#fff', align: 'center', baseline: 'middle',
    });
  }

  ctx.globalAlpha = 1;
}

// ─── Boat ─────────────────────────────────────────────────

export function renderBoat(ctx, state, atlas) {
  if (DRAFT_MODE) {
    // Simple brown rectangle + white triangle sail — no sprite, no bob
    const p = state.player;
    const cam = state.camera;
    const px = p.pixelX - cam.x;
    const py = p.pixelY - cam.y;
    const cx = Math.round(px + TS / 2);
    const cy = Math.round(py + TS / 2);

    // Hull — brown rectangle
    ctx.fillStyle = '#6D4C41';
    ctx.fillRect(cx - 10, cy - 4, 20, 12);
    ctx.strokeStyle = '#4E342E';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 10, cy - 4, 20, 12);

    // Sail — white triangle
    ctx.fillStyle = '#FAFAFA';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 14);
    ctx.lineTo(cx - 6, cy - 4);
    ctx.lineTo(cx + 6, cy - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#BDBDBD';
    ctx.stroke();

    // Direction indicator
    const dirArrows = { up: '\u2191', down: '\u2193', left: '\u2190', right: '\u2192' };
    drawText(ctx, dirArrows[p.dir] || '', cx, cy + 16, {
      font: "bold 8px sans-serif", color: '#4E342E',
      align: 'center', baseline: 'middle',
    });
    return;
  }

  const p = state.player;
  const cam = state.camera;

  const px = p.pixelX - cam.x;
  const py = p.pixelY - cam.y;

  // Rock animation: alternate frames when moving, still frame when idle
  const rockFrame = p.moving ? (Math.floor(state.time / 0.15) % 2) : 0;

  // Idle bob on water (gentle vertical sway)
  let bobY = 0;
  if (p.moving) {
    const progress = p.moveTimer / 0.15;
    bobY = -Math.sin(progress * Math.PI) * 2;
  } else {
    bobY = Math.sin(state.time * 2.5) * 1.5;
  }

  // Water shadow under boat
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = WORLD_ART.oceanDeep;
  ctx.beginPath();
  ctx.ellipse(Math.round(px + TS / 2), Math.round(py + TS - 2), 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Draw boat sprite
  const frames = getBoatSpritesForTier(atlas, state.boatTier);
  const sprite = frames[p.dir]?.[rockFrame];
  if (sprite) {
    ctx.drawImage(sprite, Math.round(px), Math.round(py + bobY));
  }
}

// ─── Dock Prompt ──────────────────────────────────────────

function dockPromptTop(ctx, state, x, width, height, defaultTop) {
  ctx.save();
  ctx.font = "bold 12px 'Inter', system-ui, sans-serif";
  const signs = ISLAND_SIGNS.map((sign) => {
    const sx = sign.col * TS - state.camera.x;
    const sy = sign.row * TS - state.camera.y;
    const name = state.strings?.islandNames?.[sign.island] || sign.island;
    const bob = DRAFT_MODE ? 0 : Math.sin(state.time * 1.5 + sign.col * 0.3) * 2;
    const signWidth = ctx.measureText(name).width + (DRAFT_MODE ? 16 : 18);
    // The sign and its progress pill are drawn in the scaled world layer.
    return {
      left: (sx - signWidth / 2 - 2) * VIEW_SCALE,
      right: (sx + signWidth / 2 + 3) * VIEW_SCALE,
      top: (sy - 11 + bob - (isIslandLocked(sign.island) ? 18 : 2)) * VIEW_SCALE,
      bottom: (sy + 31 + bob) * VIEW_SCALE,
    };
  });
  ctx.restore();
  let top = defaultTop;
  for (let pass = 0; pass < signs.length; pass++) {
    const collisions = signs.filter((sign) => x - 2 < sign.right && x + width + 4 > sign.left
      && top - 2 < sign.bottom && top + height + 6 > sign.top);
    if (!collisions.length) break;
    top = Math.min(...collisions.map((sign) => sign.top - height - 10));
  }
  return Math.max(HUD_HEIGHT * readableHudUnit(ctx) + 12, top);
}

export function renderDockPrompt(ctx, state) {
  if (!state.nearDock || state.nearDock === 'recycling') return;

  const islandId = state.nearDock;
  const name = state.strings?.islandNames?.[islandId] || islandId;
  const locked = isIslandLocked(islandId);
  const text = locked
    ? (state.strings?.lockedPrompt?.replace('{{island}}', name) || `🔒 ${name}`)
    : (state.strings?.enterPrompt?.replace('{{island}}', name) || `Dock at ${name}`);
  const islandData = ISLANDS[islandId];
  // Locked docks use functional disabled grey instead of the island colour.
  const color = locked ? '#757575' : (islandData?.color || BRAND.text);

  if (DRAFT_MODE) {
    ctx.font = "bold 14px sans-serif";
    const w = Math.max(ctx.measureText(text).width + 30, 250);
    const h = 36;
    const px = CANVAS_W / 2 - w / 2;
    const py = dockPromptTop(ctx, state, px, w, h, CANVAS_H - 70);

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, w, h);
    drawText(ctx, text, CANVAS_W / 2, py + h / 2, {
      font: "bold 14px sans-serif", color: BRAND.purple,
      align: 'center', baseline: 'middle',
    });
    return;
  }

  const pulse = 0.9 + Math.sin(state.time * 3) * 0.1;
  const arrowBounce = Math.sin(state.time * 5) * 3;

  ctx.font = "bold 16px 'Inter', system-ui, sans-serif";
  const promptW = Math.max(ctx.measureText(text).width + 50, 280);
  const promptH = 46;
  const px = CANVAS_W / 2 - promptW / 2;
  const py = dockPromptTop(ctx, state, px, promptW, promptH, CANVAS_H - 75);

  ctx.globalAlpha = pulse;

  // Shadow
  drawRoundedRect(ctx, px + 2, py + 3, promptW, promptH, 16,
    'rgba(0,0,0,0.15)', 'transparent');
  // Main box
  drawRoundedRect(ctx, px, py, promptW, promptH, 16,
    'rgba(255,255,255,0.95)', color);
  // Colored accent strip at top
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(px + 16, py);
  ctx.lineTo(px + promptW - 16, py);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Text
  drawText(ctx, text, CANVAS_W / 2, py + promptH / 2 - 2, {
    font: "bold 15px 'Inter', system-ui, sans-serif",
    color: BRAND.purple,
    align: 'center',
    baseline: 'middle',
  });

  // Bouncing anchor icon
  drawText(ctx, '\u2693', CANVAS_W / 2, py + promptH - 6 + arrowBounce, {
    font: '12px sans-serif',
    color,
    align: 'center',
    baseline: 'middle',
  });

  ctx.globalAlpha = 1.0;
}

// ─── Buoy Prompt ──────────────────────────────────────────

export function renderBuoyPrompt(ctx, state) {
  if (!state.nearBuoy) return;

  if (DRAFT_MODE) {
    const text = state.strings?.buoyPrompt || 'Press Enter to enter a code';

    ctx.font = "bold 14px sans-serif";
    const w = Math.max(ctx.measureText(text).width + 30, 250);
    const h = 36;
    const px = CANVAS_W / 2 - w / 2;
    const py = CANVAS_H - 70;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = BRAND.orange;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, w, h);
    drawText(ctx, text, CANVAS_W / 2, py + h / 2, {
      font: "bold 14px sans-serif", color: BRAND.purple,
      align: 'center', baseline: 'middle',
    });
    return;
  }

  const text = state.strings?.buoyPrompt || 'Press Enter to enter a code';

  const pulse = 0.9 + Math.sin(state.time * 3) * 0.1;
  const glow = Math.sin(state.time * 4) * 0.05;
  const arrowBounce = Math.sin(state.time * 5) * 3;

  ctx.font = "bold 16px 'Inter', system-ui, sans-serif";
  const promptW = Math.max(ctx.measureText(text).width + 50, 280);
  const promptH = 46;
  const px = CANVAS_W / 2 - promptW / 2;
  const py = CANVAS_H - 75;

  ctx.globalAlpha = pulse;

  // Shadow
  drawRoundedRect(ctx, px + 2, py + 3, promptW, promptH, 16,
    'rgba(0,0,0,0.15)', 'transparent');
  // Main box with warm accent
  drawRoundedRect(ctx, px, py, promptW, promptH, 16,
    `rgba(255,255,255,${0.9 + glow})`, BRAND.orange);

  // Text
  drawText(ctx, text, CANVAS_W / 2, py + promptH / 2 - 2, {
    font: "bold 15px 'Inter', system-ui, sans-serif",
    color: BRAND.purple,
    align: 'center',
    baseline: 'middle',
  });

  // Bouncing ticket icon
  drawText(ctx, '\uD83C\uDFAB', CANVAS_W / 2, py + promptH - 6 + arrowBounce, {
    font: '12px sans-serif',
    color: BRAND.orange,
    align: 'center',
    baseline: 'middle',
  });

  ctx.globalAlpha = 1.0;
}

// ─── HUD ──────────────────────────────────────────────────

const HUD_BADGE_GAP = 8;
const HUD_AUDIO_WIDTH = 34;

export function layoutWorldHudBadges(exitRight, missionWidth, trashWidth) {
  const missionX = exitRight + HUD_BADGE_GAP;
  const trashX = missionX + missionWidth + HUD_BADGE_GAP;
  const audioX = trashX + trashWidth + HUD_BADGE_GAP;
  const audioRect = {
    x: audioX,
    y: 5,
    width: HUD_AUDIO_WIDTH,
    height: HUD_HEIGHT - 10,
  };
  return {
    missionX,
    audioRect,
    trashX,
    trashWidth,
  };
}

function drawHudAudioButton(ctx, state, rect, soundEnabled) {
  const hover = !!state.audioButtonHover;

  drawRoundedRect(ctx, rect.x + 1, rect.y + 1, rect.width, rect.height, 9,
    'rgba(0,0,0,0.22)', 'transparent');
  drawRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 9,
    WORLD_ART.woodDeep, 'transparent');
  drawRoundedRect(ctx, rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4, 7,
    hover ? WORLD_ART.wood : WORLD_ART.woodMid, 'transparent');
  drawText(ctx, soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07',
    rect.x + rect.width / 2, HUD_HEIGHT / 2, {
      font: '14px sans-serif', color: WORLD_ART.panelCream,
      align: 'center', baseline: 'middle',
    });

  state.audioButtonRect = { ...rect };
}

// Canvas-native Exit pill (top-left of the HUD). A warm WORLD_ART wooden plaque
// (dark woodDeep frame → woodMid board → cream carved label) so it reads as part
// of the world, not a UI overlay. Brightens on hover and publishes its rect on
// `state.exitButtonRect` so the screen can hit-test clicks/taps. Returns the
// pill's right edge so the first stat badge can sit just after it.
// Shared with the island-room HUD («Back to map» pill) — one wooden style.
export function drawExitButton(ctx, state, label) {
  const font = "bold 13px 'Inter', system-ui, sans-serif";
  ctx.font = font;
  const w = Math.max(ctx.measureText(label).width + 28, 64);
  const x = 12;
  const y = 5;
  const h = HUD_HEIGHT - 10;
  const hover = !!state.exitButtonHover;

  // drop shadow
  drawRoundedRect(ctx, x + 1, y + 1, w, h, 9, 'rgba(0,0,0,0.22)', 'transparent');
  // dark wood frame
  drawRoundedRect(ctx, x, y, w, h, 9, WORLD_ART.woodDeep, 'transparent');
  // wood board face (inset) — brightens on hover
  drawRoundedRect(ctx, x + 2, y + 2, w - 4, h - 4, 7,
    hover ? WORLD_ART.wood : WORLD_ART.woodMid, 'transparent');
  // thin lit top edge for a carved/raised feel
  drawRoundedRect(ctx, x + 3, y + 3, w - 6, 2, 1, 'rgba(255,255,255,0.18)', 'transparent');
  // cream carved label (soft dark shadow underneath for depth)
  drawText(ctx, label, x + w / 2, HUD_HEIGHT / 2 + 1, {
    font, color: 'rgba(40,24,12,0.45)', align: 'center', baseline: 'middle',
  });
  drawText(ctx, label, x + w / 2, HUD_HEIGHT / 2, {
    font, color: WORLD_ART.panelCream, align: 'center', baseline: 'middle',
  });

  state.exitButtonRect = { x, y, width: w, height: h };
  return x + w;
}

export function renderHUD(
  ctx,
  state,
  points,
  completedMissions,
  strings,
  stars,
  finaleActive = false,
  soundEnabled = true,
) {
  if (DRAFT_MODE) {
    // Simple opaque top bar — no glass-morphism
    // BRAND.purple #533F8B decomposed as rgba for alpha bar fill.
    ctx.fillStyle = 'rgba(83,63,139,0.8)';
    ctx.fillRect(0, 0, CANVAS_W, HUD_HEIGHT);

    // Title
    drawText(ctx, strings.hubTitle, CANVAS_W / 2, HUD_HEIGHT / 2, {
      font: "bold 18px sans-serif", color: '#fff',
      align: 'center', baseline: 'middle',
    });

    // Points — simple rectangle badge
    const ptText = 'PTS: ' + points;
    ctx.font = "bold 14px sans-serif";
    const ptW = ctx.measureText(ptText).width + 16;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(CANVAS_W - ptW - 10, 4, ptW, HUD_HEIGHT - 8);
    // Reward gold — kept as functional accent, not brand chrome.
    drawText(ctx, ptText, CANVAS_W - 10 - ptW / 2, HUD_HEIGHT / 2, {
      font: "bold 14px sans-serif", color: '#FFD54F',
      align: 'center', baseline: 'middle',
    });

    // Exit pill, mission count, trash cargo, then audio control.
    const exitRight = drawExitButton(ctx, state, strings.exitLabel || 'Exit');
    const GAME_ISLANDS = ['foodwaste', 'local', 'growing', 'circular'];
    let totalCompleted = 0;
    for (const id of GAME_ISLANDS) totalCompleted += (completedMissions[id] || []).length;
    const missionText = totalCompleted + '/12';
    ctx.font = "bold 13px sans-serif";
    const mW = ctx.measureText(missionText).width + 14;

    const trashCount = state.trashCargo || 0;
    const trashCap = state.trashCapacity || 3;
    const trashLabel = 'TRASH ' + trashCount + '/' + trashCap;
    ctx.font = "bold 12px sans-serif";
    const tW = ctx.measureText(trashLabel).width + 14;
    const hudLayout = layoutWorldHudBadges(exitRight, mW, tW);

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(hudLayout.missionX, 4, mW, HUD_HEIGHT - 8);
    drawText(ctx, missionText, hudLayout.missionX + mW / 2, HUD_HEIGHT / 2, {
      font: "bold 13px sans-serif", color: '#fff',
      align: 'center', baseline: 'middle',
    });

    // Trash cargo
    // Functional warning red — kept separate from BRAND.red pillar identity.
    ctx.fillStyle = trashCount >= trashCap ? 'rgba(244,67,54,0.5)' : 'rgba(255,255,255,0.2)';
    ctx.fillRect(hudLayout.trashX, 4, tW, HUD_HEIGHT - 8);
    drawText(ctx, trashLabel, hudLayout.trashX + tW / 2, HUD_HEIGHT / 2, {
      font: "bold 12px sans-serif", color: '#fff',
      align: 'center', baseline: 'middle',
    });

    drawHudAudioButton(ctx, state, hudLayout.audioRect, soundEnabled);

    // Control hint
    if (state.time < 6) {
      const alpha = state.time < 5 ? 0.8 : Math.max(0, 0.8 * (1 - (state.time - 5)));
      ctx.globalAlpha = alpha;
      ctx.font = "bold 12px sans-serif";
      const hintW = ctx.measureText(strings.controlHint).width + 20;
      const hx = CANVAS_W / 2 - hintW / 2;
      const hy = CANVAS_H - 34;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(hx, hy, hintW, 24);
      drawText(ctx, strings.controlHint, CANVAS_W / 2, hy + 12, {
        font: "bold 12px sans-serif", color: '#fff',
        align: 'center', baseline: 'middle',
      });
      ctx.globalAlpha = 1;
    }
    return;
  }

  const u = readableHudUnit(ctx);
  const W = CANVAS_W / u;
  const H = CANVAS_H / u;
  if (u !== 1) {
    ctx.save();
    ctx.scale(u, u);
  }

  // Glass-morphism top bar
  // BRAND.purple #533F8B decomposed as rgba for alpha glass fill.
  ctx.fillStyle = 'rgba(83,63,139,0.6)';
  ctx.fillRect(0, 0, W, HUD_HEIGHT);
  // Subtle bottom border glow
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(0, HUD_HEIGHT - 1, W, 1);

  // ── Points badge (right) ──
  // Combined stars | points pill — shared with the Harbor HUD for 1:1 parity.
  drawStatsBadge(ctx, W - 12, HUD_HEIGHT, stars || 0, points);

  // ── Exit pill (canvas-native, top-left) ──
  const exitRight = drawExitButton(ctx, state, strings.exitLabel || 'Exit');

  // ── Mission progress (left, just after the Exit pill) ──
  const GAME_ISLANDS = ['foodwaste', 'local', 'growing', 'circular'];
  let totalCompleted = 0;
  for (const id of GAME_ISLANDS) {
    totalCompleted += (completedMissions[id] || []).length;
  }
  const missionText = '\uD83C\uDFDD ' + totalCompleted + '/12';
  ctx.font = "bold 14px 'Inter', system-ui, sans-serif";
  const mW = ctx.measureText(missionText).width + 20;

  const trashCount = state.trashCargo || 0;
  const trashCap = state.trashCapacity || 3;
  const trashLabel = '\uD83D\uDDD1\uFE0F ' + trashCount + '/' + trashCap;
  ctx.font = "bold 13px 'Inter', system-ui, sans-serif";
  const tW = ctx.measureText(trashLabel).width + 18;
  const hudLayout = layoutWorldHudBadges(exitRight, mW, tW);

  drawRoundedRect(ctx, hudLayout.missionX - 1, 6, mW, HUD_HEIGHT - 10, 14,
    'rgba(0,0,0,0.15)', 'transparent');
  drawRoundedRect(ctx, hudLayout.missionX, 5, mW, HUD_HEIGHT - 10, 14,
    'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.15)');
  drawText(ctx, missionText, hudLayout.missionX + mW / 2, HUD_HEIGHT / 2, {
    font: "bold 14px 'Inter', system-ui, sans-serif",
    color: '#fff',
    align: 'center',
    baseline: 'middle',
  });

  // ── Trash cargo badge (after mission badge) ──
  let trashFill = 'rgba(255,255,255,0.2)';
  let trashTextColor = '#fff';
  if (trashCount >= trashCap && trashCap > 0) {
    const flash = Math.sin(state.time * 6) > 0;
    // Functional warning red — kept separate from BRAND.red pillar identity.
    trashFill = flash ? 'rgba(244,67,54,0.7)' : 'rgba(244,67,54,0.4)';
    trashTextColor = '#fff';
  }

  drawRoundedRect(ctx, hudLayout.trashX + 1, 6, tW, HUD_HEIGHT - 10, 14,
    'rgba(0,0,0,0.15)', 'transparent');
  drawRoundedRect(ctx, hudLayout.trashX, 5, tW, HUD_HEIGHT - 10, 14,
    trashFill, 'rgba(255,255,255,0.15)');
  drawText(ctx, trashLabel, hudLayout.trashX + tW / 2, HUD_HEIGHT / 2, {
    font: "bold 13px 'Inter', system-ui, sans-serif",
    color: trashTextColor,
    align: 'center',
    baseline: 'middle',
  });

  // ── Audio control (last item in the left HUD group) ──
  drawHudAudioButton(ctx, state, hudLayout.audioRect, soundEnabled);

  // ── Title (center) ──
  // Suppressed during the Grand Finale so the top of the map belongs solely to the
  // compass call-to-action bubble (renderFinaleCall) — no overlapping title. On a phone the
  // larger HUD leaves no room beside the left group, so it is skipped there too.
  ctx.font = "bold 20px 'Inter', system-ui, sans-serif";
  const titleLeft = W / 2 - ctx.measureText(strings.hubTitle).width / 2;
  if (!finaleActive && titleLeft > hudLayout.audioRect.x + hudLayout.audioRect.width + 8) {
    drawText(ctx, strings.hubTitle, W / 2 + 1, HUD_HEIGHT / 2 + 1, {
      font: "bold 20px 'Inter', system-ui, sans-serif",
      color: 'rgba(0,0,0,0.3)',
      align: 'center',
      baseline: 'middle',
    });
    drawText(ctx, strings.hubTitle, W / 2, HUD_HEIGHT / 2, {
      font: "bold 20px 'Inter', system-ui, sans-serif",
      color: '#fff',
      align: 'center',
      baseline: 'middle',
    });
  }

  // ── Control hint (fades after 5s) ── also hidden during the finale so the
  // compass call-to-action is the only instruction on screen.
  if (state.time < 6 && !finaleActive) {
    const alpha = state.time < 5 ? 0.8 : Math.max(0, 0.8 * (1 - (state.time - 5)));
    ctx.globalAlpha = alpha;

    const hintW = 260;
    const hintH = 28;
    const hx = W / 2 - hintW / 2;
    const hy = H - 38;

    drawRoundedRect(ctx, hx, hy, hintW, hintH, 14,
      'rgba(0,0,0,0.45)', 'transparent');
    drawText(ctx, strings.controlHint, W / 2, hy + hintH / 2, {
      font: "bold 13px 'Inter', system-ui, sans-serif",
      color: '#fff',
      align: 'center',
      baseline: 'middle',
    });

    ctx.globalAlpha = 1.0;
  }
  if (u !== 1) ctx.restore();
  state.exitButtonRect = scaleRectBy(state.exitButtonRect, u);
  state.audioButtonRect = scaleRectBy(state.audioButtonRect, u);
}

// ─── Vignette (subtle edge darkening) ─────────────────────

export function renderVignette(ctx) {
  if (DRAFT_MODE) return; // Skip vignette entirely

  // Top edge — BRAND.purple #533F8B decomposed for alpha vignette.
  const gTop = ctx.createLinearGradient(0, 0, 0, 50);
  gTop.addColorStop(0, 'rgba(83,63,139,0.15)');
  gTop.addColorStop(1, 'rgba(83,63,139,0)');
  ctx.fillStyle = gTop;
  ctx.fillRect(0, 0, CANVAS_W, 50);

  // Bottom edge — BRAND.purple decomposed for alpha vignette.
  const gBot = ctx.createLinearGradient(0, CANVAS_H - 40, 0, CANVAS_H);
  gBot.addColorStop(0, 'rgba(83,63,139,0)');
  gBot.addColorStop(1, 'rgba(83,63,139,0.15)');
  ctx.fillStyle = gBot;
  ctx.fillRect(0, CANVAS_H - 40, CANVAS_W, 40);
}

// ─── Grand Finale (12/12) — map reaction + compass call ──────────────────────
// Drawn only while the finale is active (all 12 done, certificate unclaimed).
// Beams are WORLD-space (call inside the scaled
// camera block); the compass call is screen-space (call after renderHUD).

const FINALE_GOLD = '#C9A24B';
const FINALE_ISLANDS = ['foodwaste', 'local', 'growing', 'circular'];

/**
 * Warm light beams connecting the 4 completed islands to the central Lighthouse buoy.
 * Drawn in world space — call inside the ctx.scale(VIEW_SCALE)+camera block (after
 * renderIslandEvolution), so it shares the boat/island coordinate system.
 */
export function renderFinaleBeams(ctx, state) {
  const cam = state.camera;
  const time = state.time || 0;
  const toX = (col) => col * TS + TS / 2 - cam.x;
  const toY = (row) => row * TS + TS / 2 - cam.y;
  const bx = toX(PHYGITAL_BUOY.col);
  const by = toY(PHYGITAL_BUOY.row);

  const signByIsland = Object.fromEntries(ISLAND_SIGNS.map((s) => [s.island, s]));
  const breathe = 0.6 + 0.4 * Math.sin(time * 2);

  ctx.save();
  ctx.lineCap = 'round';
  FINALE_ISLANDS.forEach((island, i) => {
    const sign = signByIsland[island];
    if (!sign) return;
    const ix = toX(sign.col);
    const iy = toY(sign.row);

    // The glowing beam: a soft gold gradient line, gently pulsing.
    const grad = ctx.createLinearGradient(ix, iy, bx, by);
    grad.addColorStop(0, `rgba(201,162,75,${0.10 + 0.10 * breathe})`);
    grad.addColorStop(0.5, `rgba(255,224,150,${0.30 + 0.25 * breathe})`);
    grad.addColorStop(1, `rgba(201,162,75,${0.10 + 0.10 * breathe})`);
    ctx.strokeStyle = grad;
    ctx.shadowColor = 'rgba(255,224,150,0.7)';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // A bright mote travelling island → lighthouse, staggered per beam.
    const tt = ((time * 0.35 + i * 0.25) % 1);
    const mx = ix + (bx - ix) * tt;
    const my = iy + (by - iy) * tt;
    ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(255,240,200,0.95)';
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Warm halo around the lighthouse buoy itself.
  ctx.shadowBlur = 0;
  const halo = ctx.createRadialGradient(bx, by, 4, bx, by, 34 * (0.85 + 0.15 * breathe));
  halo.addColorStop(0, 'rgba(255,224,150,0.45)');
  halo.addColorStop(1, 'rgba(255,224,150,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(bx, by, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The animated compass call-to-action — a warm parchment bubble near the top of the
 * map nudging the player toward the Lighthouse. Screen-space — call after renderHUD.
 * `strings.finaleCall` carries the localized line.
 */
export function renderFinaleCall(ctx, state, strings) {
  const text = strings?.finaleCall || 'You did it! The Lighthouse Keeper has something for you!';
  const time = state.time || 0;
  const bob = Math.sin(time * 2) * 3;
  const glow = 0.5 + 0.5 * Math.sin(time * 3);

  ctx.save();
  ctx.font = "700 18px 'Fredoka', system-ui, sans-serif";
  const padX = 22;
  const compassR = 13;
  const textW = ctx.measureText(text).width;
  const w = textW + padX * 2 + compassR * 2 + 14;
  const h = 44;
  const x = CANVAS_W / 2 - w / 2;
  const y = 18 + bob;

  // Parchment bubble + fine gold rule (editorial theme, echoing the certificate).
  ctx.shadowColor = `rgba(201,162,75,${0.35 + 0.35 * glow})`;
  ctx.shadowBlur = 18 + 8 * glow;
  ctx.fillStyle = 'rgba(251,247,240,0.97)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = FINALE_GOLD;
  ctx.stroke();

  // Little spinning compass glyph on the left.
  const ccx = x + padX + compassR - 4;
  const ccy = y + h / 2;
  ctx.fillStyle = FINALE_GOLD;
  ctx.beginPath();
  ctx.arc(ccx, ccy, compassR, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(ccx, ccy);
  ctx.rotate(time * 1.2);
  ctx.fillStyle = '#FBF7F0';
  ctx.beginPath();
  ctx.moveTo(0, -compassR + 3);
  ctx.lineTo(3, 0);
  ctx.lineTo(0, compassR - 3);
  ctx.lineTo(-3, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#2E2620';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, ccx + compassR + 10, y + h / 2 + 1);
  ctx.restore();
}
