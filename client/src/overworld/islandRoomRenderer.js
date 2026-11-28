// Island room renderer — static interior rooms with NPCs, player, prompts, HUD.
// Gameplay stays on the original 20×15-tile grid. The scene is drawn 1.375× so
// every 32px tile lands on a crisp 44px, while HUD/dialog chrome remains screen-space.

import {
  TILE_SIZE as TS, MOVE_DURATION, CANVAS_W, CANVAS_H, HUD_HEIGHT, ISLANDS,
} from './overworldData.js';
import { ROOM_COLS, ROOM_ROWS, MISSION_MAP, isMissionUnlocked, nextMissionId } from './islandRoomData.js';
import { TILE } from './tileAtlas.js';
import { BRAND, WORLD_ART } from '../styles/brandColors.js';
import {
  drawRoundedRect, drawText, drawStatsBadge,
  hasActiveBottomPrompt, HINT_VISIBLE_SECONDS,
} from '../utils/canvas.js';
import { DRAFT_MODE } from '../config/draftMode.js';
import { readableHudUnit, scaleRectBy } from '../utils/hidpi.js';
import { drawExitButton } from './overworldRenderer.js';

// Room offset — centers the 640×480 room on the 1280×704 canvas
const OX = (CANVAS_W - ROOM_COLS * TS) / 2;  // 320
const OY = (CANVAS_H - ROOM_ROWS * TS) / 2;  // 112

export const ROOM_SCENE_SCALE = 1.375;
export const ROOM_SCENE_RECT = Object.freeze({
  x: CANVAS_W / 2 - (ROOM_COLS * TS * ROOM_SCENE_SCALE) / 2,
  y: HUD_HEIGHT + 4,
  width: ROOM_COLS * TS * ROOM_SCENE_SCALE,
  height: ROOM_ROWS * TS * ROOM_SCENE_SCALE,
  scale: ROOM_SCENE_SCALE,
});

export function applyRoomSceneTransform(ctx) {
  ctx.translate(ROOM_SCENE_RECT.x, ROOM_SCENE_RECT.y);
  ctx.scale(ROOM_SCENE_SCALE, ROOM_SCENE_SCALE);
  ctx.translate(-OX, -OY);
}

export function projectRoomScenePoint(x, y) {
  return {
    x: ROOM_SCENE_RECT.x + (x - OX) * ROOM_SCENE_SCALE,
    y: ROOM_SCENE_RECT.y + (y - OY) * ROOM_SCENE_SCALE,
  };
}

// Deterministic variant index (same as overworld renderer)
function variantIndex(col, row, count) {
  return ((col * 7 + row * 13 + col * row) & 0x7FFFFFFF) % count;
}

// ─── Background ──────────────────────────────────────────

export function renderRoomBackground(ctx, island) {
  const color = ISLANDS[island]?.color || BRAND.text;

  if (DRAFT_MODE) {
    // Flat dark backdrop, no border effects
    ctx.fillStyle = WORLD_ART.oceanDeep;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // Simple solid border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(OX - 2, OY - 2, ROOM_COLS * TS + 4, ROOM_ROWS * TS + 4);
    ctx.lineWidth = 1;
    return;
  }

  // Growing island plays outdoors (C2): sky + sun instead of the interior void.
  if (island === 'growing') {
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, '#8ED1E8');
    sky.addColorStop(0.55, '#C5E8CF');
    sky.addColorStop(1, '#A8D5A2');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Sun, top-right
    ctx.save();
    ctx.shadowColor = 'rgba(255,224,130,0.9)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#FFE082';
    ctx.beginPath();
    ctx.arc(CANVAS_W - 140, 64, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Soft clouds
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [cx, cy, r] of [[210, 58, 26], [330, 70, 18], [880, 44, 22], [980, 56, 16]]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.8, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Local island is an open-air farmers' market: warm morning sky —
  // the «vibrant market» of the locked story arc, accent = BRAND.orange.
  if (island === 'local') {
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, WORLD_ART.marketSkyTop);
    sky.addColorStop(0.5, WORLD_ART.marketSkyMid);
    sky.addColorStop(1, WORLD_ART.marketSkyLow);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Morning sun, top-left (mirror of growing's — different day, different island)
    ctx.save();
    ctx.shadowColor = 'rgba(255,183,77,0.9)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = WORLD_ART.marketSun;
    ctx.beginPath();
    ctx.arc(140, 64, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Festive bunting strung across the sky band
    const buntCols = [BRAND.orange, WORLD_ART.panelCream, WORLD_ART.buntingGreen, WORLD_ART.panelCream];
    for (let i = 0; i < 26; i++) {
      const bx = 60 + i * 45;
      const by = 28 + Math.sin(i * 0.8) * 6;
      ctx.fillStyle = buntCols[i % buntCols.length];
      ctx.beginPath();
      ctx.moveTo(bx, by); ctx.lineTo(bx + 16, by); ctx.lineTo(bx + 8, by + 14);
      ctx.closePath(); ctx.fill();
    }
    return;
  }

  // Circular island is an open smart-neighborhood / repair-cafe: a clean-air sky over a
  // green-roofed skyline — the «circular city» of the locked arc, accent = BRAND.blue.
  if (island === 'circular') {
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, WORLD_ART.oceanShallow);    // airy light sky
    sky.addColorStop(0.6, WORLD_ART.recyclingHub);  // green neighborhood haze
    sky.addColorStop(1, WORLD_ART.grassDeep);       // deeper green ground line
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Soft eco sun, top-right
    ctx.save();
    ctx.shadowColor = 'rgba(180,211,154,0.9)';
    ctx.shadowBlur = 28;
    ctx.fillStyle = WORLD_ART.recyclingHub;
    ctx.beginPath(); ctx.arc(CANVAS_W - 150, 60, 30, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Green-roofed skyline ridge along the top sky band (circular-city motif)
    const baseY = ROOM_SCENE_RECT.y - 4; // just above the enlarged room's top wall
    for (const [hx, hw, hh] of [[360, 40, 36], [408, 30, 28], [462, 36, 44], [762, 46, 34], [822, 32, 40], [880, 44, 26]]) {
      const hy = baseY - hh;
      ctx.fillStyle = WORLD_ART.stoneCool; ctx.fillRect(hx, hy, hw, hh);          // body
      ctx.fillStyle = WORLD_ART.recyclingHub;                                      // green roof
      ctx.beginPath(); ctx.moveTo(hx - 3, hy); ctx.lineTo(hx + hw / 2, hy - 12); ctx.lineTo(hx + hw + 3, hy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(100,181,246,0.45)';                                    // window glint (blue)
      ctx.fillRect(hx + hw / 2 - 5, hy + 8, 10, 10);
    }
    return;
  }

  // Foodwaste island is a warm home kitchen (INTERIOR, not outdoors): a soft cream
  // wall washed by window light over a warm counter-toned floor band — the «cozy
  // kitchen» of the locked arc, accent = chef coral. Mirror of the circular case
  // but interior (no sky / no horizon).
  if (island === 'foodwaste') {
    const wall = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    wall.addColorStop(0, WORLD_ART.panelCream);   // warm cream wall, top
    wall.addColorStop(0.62, WORLD_ART.pebbleLight); // soft warm mid
    wall.addColorStop(1, WORLD_ART.counterWarm);  // warm counter-toned floor band
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Soft warm window light pouring from the top-left (a kitchen morning)
    ctx.save();
    const glow = ctx.createRadialGradient(150, 30, 10, 150, 30, 240);
    glow.addColorStop(0, 'rgba(247,225,164,0.55)'); // BRAND.yellowSoft, soft
    glow.addColorStop(1, 'rgba(247,225,164,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();

    // Kitchen windows along the top wall band (interior counterpart of circular's skyline)
    const baseY = ROOM_SCENE_RECT.y - 4;
    for (const wx of [392, 600, 808]) {
      const ww = 58, wh = 44, wy = baseY - wh;
      ctx.fillStyle = WORLD_ART.woodShadow; ctx.fillRect(wx - 5, wy + wh, ww + 10, 6);   // sill
      ctx.fillStyle = WORLD_ART.woodMid; ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 3);    // frame
      const pane = ctx.createLinearGradient(wx, wy, wx, wy + wh);                          // daylight glass
      pane.addColorStop(0, WORLD_ART.oceanShallow); pane.addColorStop(1, WORLD_ART.recyclingHub);
      ctx.fillStyle = pane; ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = WORLD_ART.woodMid;                                                   // muntins (cross)
      ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      ctx.fillRect(wx, wy + wh / 2 - 2, ww, 4);
    }
    return;
  }

  // Dark backdrop — unified "void around scene" semantics across scenes
  ctx.fillStyle = WORLD_ART.oceanDeep;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Subtle colored border around room
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(OX - 4, OY - 4, ROOM_COLS * TS + 8, ROOM_ROWS * TS + 8);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

// ─── Room Tiles ──────────────────────────────────────────

export function renderRoomTiles(ctx, room, atlas) {
  if (DRAFT_MODE) {
    // Flat colored rectangles per tile type — no sprites
    const TILE_COLORS = {
      0: WORLD_ART.stoneShadow,  // WALL — dark warm-stone
      1: WORLD_ART.stoneLight,   // FLOOR_STONE — warm beige
      2: WORLD_ART.wood,         // COUNTER — warm wood
      3: WORLD_ART.woodShadow,   // DOOR — wooden door
      4: WORLD_ART.woodMid,      // TABLE — mid wood
    };
    for (let row = 0; row < ROOM_ROWS; row++) {
      for (let col = 0; col < ROOM_COLS; col++) {
        const tileId = room.map[row][col];
        const dx = OX + col * TS;
        const dy = OY + row * TS;
        ctx.fillStyle = TILE_COLORS[tileId] || WORLD_ART.stoneMid;
        ctx.fillRect(dx, dy, TS, TS);
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(dx, dy, TS, TS);
      }
    }
    return;
  }

  for (let row = 0; row < ROOM_ROWS; row++) {
    for (let col = 0; col < ROOM_COLS; col++) {
      const tileId = room.map[row][col];
      const dx = OX + col * TS;
      const dy = OY + row * TS;

      const variants = atlas.tiles[tileId];
      if (variants) {
        const idx = variantIndex(col, row, variants.length);
        ctx.drawImage(variants[idx], dx, dy);
      }
    }
  }
}

// ─── Decorations (static emojis on furniture) ────────────

export function renderRoomDecorations(ctx, room) {
  if (!room.decorations) return;

  if (DRAFT_MODE) {
    // Simple emoji + text label, no effects
    for (const d of room.decorations) {
      const x = OX + d.col * TS + TS / 2;
      const y = OY + d.row * TS + TS / 2;
      // Light background square to mark decoration
      ctx.fillStyle = 'rgba(255,255,200,0.3)';
      ctx.fillRect(OX + d.col * TS, OY + d.row * TS, TS, TS);
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.emoji, x, y);
    }
    return;
  }

  for (const d of room.decorations) {
    const x = OX + d.col * TS + TS / 2;
    const y = OY + d.row * TS + TS / 2;

    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.emoji, x, y - 2);
  }
}

// ─── Growing outdoor pass (C2) ───────────────────────────
// Draws over the generic tile pass: wooden fence on the perimeter wall tiles
// and raised soil beds over the TABLE tiles, so the grey classroom reads as a
// garden courtyard without touching the shared tile atlas.

const FENCE = { post: '#6D4C41', rail: '#8D6E63', light: '#A1887F' };
const BED_CROPS = ['🥬', '🥕', '🍅'];

export function renderGrowingOutdoor(ctx, room) {
  if (DRAFT_MODE) return; // draft keeps the flat tile colors

  for (let row = 0; row < ROOM_ROWS; row++) {
    for (let col = 0; col < ROOM_COLS; col++) {
      const id = room.map[row][col];
      const dx = OX + col * TS;
      const dy = OY + row * TS;

      if (id === TILE.BUILDING_WALL) { // perimeter → wooden fence
        // Grass peeks behind the fence
        ctx.fillStyle = '#9CCC65';
        ctx.fillRect(dx, dy, TS, TS);
        // Two horizontal rails
        ctx.fillStyle = FENCE.rail;
        ctx.fillRect(dx, dy + 8, TS, 6);
        ctx.fillRect(dx, dy + 20, TS, 6);
        ctx.fillStyle = FENCE.light;
        ctx.fillRect(dx, dy + 8, TS, 2);
        ctx.fillRect(dx, dy + 20, TS, 2);
        // Post at tile center
        ctx.fillStyle = FENCE.post;
        ctx.fillRect(dx + TS / 2 - 3, dy + 2, 6, TS - 4);
        ctx.fillStyle = FENCE.light;
        ctx.fillRect(dx + TS / 2 - 3, dy + 2, 2, TS - 4);
      } else if (id === TILE.TABLE) { // furniture slot → raised soil bed
        const leftSame = room.map[row][col - 1] === TILE.TABLE;
        const rightSame = room.map[row][col + 1] === TILE.TABLE;
        // Wooden frame (skip inner edges so a 3-tile run reads as one bed)
        ctx.fillStyle = FENCE.rail;
        ctx.fillRect(dx, dy, TS, TS);
        // Soil fill, inset only on outer edges
        const ix = leftSame ? 0 : 4;
        const iw = TS - ix - (rightSame ? 0 : 4);
        ctx.fillStyle = '#6D4C41';
        ctx.fillRect(dx + ix, dy + 4, iw, TS - 8);
        ctx.fillStyle = '#5D4037';
        for (let f = 0; f < 3; f++) {
          ctx.fillRect(dx + ix, dy + 8 + f * 8, iw, 2);
        }
        // Little crop on each bed tile
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(BED_CROPS[col % BED_CROPS.length], dx + TS / 2, dy + TS / 2 - 1);
      }
    }
  }
}

// ─── Local market pass ────────────────────────────
// Open-air «λαϊκή αγορά» dressing over the generic tile pass: low wooden
// barriers on the perimeter walls and striped-awning stalls over every TABLE
// tile — same trick as the growing fence/beds, no atlas changes. The corner
// vignettes (stallFruits/stallPrices below) then add each zone's narrative
// produce ON these stalls.

const MARKET_ACCENTS = Object.freeze({
  season: '#EF7C4D',
  local: '#58AE73',
  labels: '#5B8FD9',
  mentor: '#F2B84B',
});

function getLocalStallAccent(col, row) {
  if (row <= 3) return col < ROOM_COLS / 2 ? MARKET_ACCENTS.season : MARKET_ACCENTS.local;
  if (row >= 9) return col < ROOM_COLS / 2 ? MARKET_ACCENTS.mentor : MARKET_ACCENTS.labels;
  return col < ROOM_COLS / 2 ? MARKET_ACCENTS.local : MARKET_ACCENTS.season;
}

function getLocalFloorZoneColor(col, row) {
  const inSteppedZone = (minCol, maxCol, minRow, maxRow) => {
    if (col < minCol || col > maxCol || row < minRow || row > maxRow) return false;
    const cornerCol = col === minCol || col === maxCol;
    const cornerRow = row === minRow || row === maxRow;
    return !(cornerCol && cornerRow);
  };
  if (inSteppedZone(1, 6, 1, 4)) return WORLD_ART.marketZoneSeason;
  if (inSteppedZone(13, 18, 1, 4)) return WORLD_ART.marketZoneLocal;
  if (inSteppedZone(1, 6, 9, 12)) return WORLD_ART.marketZoneMentor;
  if (inSteppedZone(13, 18, 9, 12)) return WORLD_ART.marketZoneLabels;
  return null;
}

export function getLocalStallLayout(room, col, row) {
  if (room.map[row]?.[col] !== TILE.TABLE) return null;

  let startCol = col;
  while (room.map[row]?.[startCol - 1] === TILE.TABLE) startCol -= 1;
  let horizontalLength = 0;
  while (room.map[row]?.[startCol + horizontalLength] === TILE.TABLE) horizontalLength += 1;
  if (horizontalLength > 1) {
    return {
      draw: col === startCol,
      orientation: 'horizontal',
      col: startCol,
      row,
      length: horizontalLength,
    };
  }

  let startRow = row;
  while (room.map[startRow - 1]?.[col] === TILE.TABLE) startRow -= 1;
  let verticalLength = 0;
  while (room.map[startRow + verticalLength]?.[col] === TILE.TABLE) verticalLength += 1;
  return {
    draw: row === startRow,
    orientation: verticalLength > 1 ? 'vertical' : 'horizontal',
    col,
    row: startRow,
    length: Math.max(1, verticalLength),
  };
}

export function getLocalAwningLift(time, stallIndex) {
  return Math.floor(time * 2 + stallIndex) % 8 === 0 ? -1 : 0;
}

export function renderLocalMarket(ctx, room, time = 0) {
  if (DRAFT_MODE) return; // draft keeps the flat tile colors

  for (let row = 0; row < ROOM_ROWS; row++) {
    for (let col = 0; col < ROOM_COLS; col++) {
      const id = room.map[row][col];
      const dx = OX + col * TS;
      const dy = OY + row * TS;

      if (id === TILE.FLOOR_WOOD) { // local-only sunlit paving over the shared wood tile
        const zoneColor = getLocalFloorZoneColor(col, row);
        ctx.fillStyle = zoneColor || ((row + col) % 2 === 0
          ? WORLD_ART.marketPavingHi
          : WORLD_ART.marketPaving);
        ctx.fillRect(dx, dy, TS, TS);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(dx + 2, dy + 2, TS - 4, 2);
        ctx.strokeStyle = WORLD_ART.marketPavingLn;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dx, dy + TS - 0.5); ctx.lineTo(dx + TS, dy + TS - 0.5);
        ctx.moveTo(dx + TS - 0.5, dy); ctx.lineTo(dx + TS - 0.5, dy + TS);
        ctx.stroke();
      } else if (id === TILE.BUILDING_WALL) { // perimeter → low market barrier
        ctx.fillStyle = WORLD_ART.marketEarth; // packed earth peeks behind
        ctx.fillRect(dx, dy, TS, TS);
        ctx.fillStyle = WORLD_ART.marketFence;
        ctx.fillRect(dx, dy + 12, TS, 7);
        ctx.fillStyle = WORLD_ART.marketFenceHi;
        ctx.fillRect(dx, dy + 12, TS, 2);
        ctx.fillStyle = WORLD_ART.marketFencePost;
        ctx.fillRect(dx + TS / 2 - 3, dy + 6, 6, TS - 10);
      } else if (id === TILE.TABLE) { // furniture slot → market stall
        const layout = getLocalStallLayout(room, col, row);
        if (!layout.draw) continue;
        const stallX = OX + layout.col * TS;
        const stallY = OY + layout.row * TS;
        const stallW = layout.orientation === 'horizontal' ? layout.length * TS : TS;
        const stallH = layout.orientation === 'vertical' ? layout.length * TS : TS;
        const canopy = getLocalStallAccent(layout.col, layout.row);
        const awningLift = getLocalAwningLift(time, layout.col + layout.row);

        // One continuous light structure replaces the old stack of dark boxes.
        ctx.fillStyle = 'rgba(145,94,36,0.16)';
        ctx.fillRect(stallX + 3, stallY + 5, stallW - 3, stallH - 3);
        ctx.fillStyle = WORLD_ART.marketCounter;
        ctx.fillRect(stallX + 2, stallY + 10, stallW - 4, stallH - 12);
        ctx.fillStyle = WORLD_ART.marketFrame;
        ctx.fillRect(stallX + 2, stallY + 9, 4, stallH - 10);
        ctx.fillRect(stallX + stallW - 6, stallY + 9, 4, stallH - 10);
        ctx.fillRect(stallX + 2, stallY + stallH - 5, stallW - 4, 3);
        ctx.fillStyle = WORLD_ART.marketFrameHi;
        ctx.fillRect(stallX + 6, stallY + 13, stallW - 12, 2);

        if (layout.orientation === 'vertical') {
          // Two open produce shelves make the tall centre kiosks read as one unit.
          for (let shelfY = stallY + TS; shelfY < stallY + stallH; shelfY += TS) {
            ctx.fillStyle = WORLD_ART.marketFrame;
            ctx.fillRect(stallX + 4, shelfY - 2, stallW - 8, 3);
            ctx.fillStyle = WORLD_ART.marketFrameHi;
            ctx.fillRect(stallX + 6, shelfY - 2, stallW - 12, 1);
          }
        }

        // Striped canvas canopy with one continuous silhouette per stall.
        const stripeWidth = 8;
        for (let stripeX = 0; stripeX < stallW; stripeX += stripeWidth) {
          ctx.fillStyle = Math.floor(stripeX / stripeWidth) % 2 === 0
            ? canopy
            : WORLD_ART.panelCream;
          const width = Math.min(stripeWidth, stallW - stripeX);
          ctx.fillRect(stallX + stripeX, stallY, width, 9);
          ctx.beginPath();
          ctx.arc(
            stallX + stripeX + width / 2,
            stallY + 9 + awningLift,
            width / 2,
            0,
            Math.PI,
          );
          ctx.fill();
        }

        // Small pixel produce display; themed corner vignettes may draw over it.
        const produceColors = ['#E84D3C', '#F6B73C', '#68AD63', '#8E69B2'];
        const shelfCount = layout.orientation === 'vertical' ? layout.length : 1;
        const produceCount = layout.orientation === 'vertical'
          ? 3
          : Math.max(3, Math.floor((stallW - 12) / 9));
        for (let shelf = 0; shelf < shelfCount; shelf++) {
          const shelfTop = stallY + shelf * TS;
          ctx.fillStyle = shelf % 2 === 0 ? '#FFF0C4' : '#EAF5D8';
          ctx.fillRect(stallX + 7, shelfTop + 16, stallW - 14, 11);
          for (let item = 0; item < produceCount; item++) {
            const itemX = stallX + 9
              + item * ((stallW - 18) / Math.max(1, produceCount - 1));
            const itemY = shelfTop + 21 + (item % 2) * 2;
            ctx.fillStyle = produceColors[(item + shelf + layout.col) % produceColors.length];
            ctx.beginPath();
            ctx.arc(itemX, itemY, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#4F9B58';
            ctx.fillRect(itemX - 1, itemY - 5, 2, 2);
          }
        }
      }
    }
  }
}

// ─── Circular neighborhood pass ──────────────────────────
// Smart-neighborhood / repair-cafe dressing over the workshop tiles — same trick
// as the local market: low green hedge on the perimeter walls + repair/recycle
// stalls (blue/green canopy) over every TABLE tile. Corner vignettes add each
// zone's narrative props ON these stalls.

const CIRCULAR_HUB = Object.freeze({
  grass: '#A8D18D',
  grassAlt: '#B7D99D',
  path: '#E8D9B6',
  pathAlt: '#F1E5C8',
  grout: '#C8B081',
  hedge: '#4D8350',
  hedgeLight: '#72A965',
  frame: '#5B4638',
  frameLight: '#8B6B4F',
  panel: '#FFF4D2',
});

const CIRCULAR_KIOSK_ZONES = Object.freeze({
  compost: { accent: '#5D9B55', pale: '#DCEFCB', icon: '♻️' },
  repair: { accent: '#3D7F9C', pale: '#D8EDF5', icon: '🔧' },
  mechanic: { accent: '#D8873F', pale: '#F7E1BB', icon: '🧰' },
  planet: { accent: '#5C6FAE', pale: '#DEE3F6', icon: '🌍' },
});

function getCircularZone(col, row) {
  if (row < ROOM_ROWS / 2) return col < ROOM_COLS / 2 ? 'compost' : 'repair';
  return col < ROOM_COLS / 2 ? 'mechanic' : 'planet';
}

export function getCircularKioskLayout(room, col, row) {
  if (room?.map?.[row]?.[col] !== TILE.TABLE) return null;

  let startCol = col;
  while (room.map[row]?.[startCol - 1] === TILE.TABLE) startCol -= 1;
  let length = 0;
  while (room.map[row]?.[startCol + length] === TILE.TABLE) length += 1;

  return {
    draw: col === startCol,
    col: startCol,
    row,
    length,
  };
}

function drawCircularKiosk(ctx, room, col, row) {
  const layout = getCircularKioskLayout(room, col, row);
  if (!layout?.draw) return;

  const zone = CIRCULAR_KIOSK_ZONES[getCircularZone(layout.col, layout.row)];
  const x = OX + layout.col * TS;
  const y = OY + layout.row * TS;
  const width = layout.length * TS;

  // A single continuous silhouette replaces the old pile of adjacent boxes.
  ctx.fillStyle = 'rgba(61,52,39,0.2)';
  ctx.fillRect(x + 3, y + 5, width, TS - 2);
  drawRoundedRect(ctx, x, y + 4, width, TS - 4, 4, zone.pale, CIRCULAR_HUB.frame);
  ctx.fillStyle = CIRCULAR_HUB.frame;
  ctx.fillRect(x + 3, y + 7, 4, TS - 10);
  ctx.fillRect(x + width - 7, y + 7, 4, TS - 10);
  ctx.fillRect(x + 3, y + TS - 7, width - 6, 5);
  ctx.fillStyle = CIRCULAR_HUB.frameLight;
  ctx.fillRect(x + 7, y + TS - 7, width - 14, 2);

  // One calm striped canopy and one role marker per station.
  const stripeWidth = 8;
  for (let stripeX = 0; stripeX < width; stripeX += stripeWidth) {
    ctx.fillStyle = Math.floor(stripeX / stripeWidth) % 2 === 0
      ? zone.accent
      : CIRCULAR_HUB.panel;
    ctx.fillRect(x + stripeX, y, Math.min(stripeWidth, width - stripeX), 7);
  }
  ctx.fillStyle = zone.accent;
  ctx.fillRect(x, y + 7, width, 3);
  drawRoundedRect(ctx, x + width - 18, y + 12, 14, 14, 7, CIRCULAR_HUB.panel, zone.accent);
  drawText(ctx, zone.icon, x + width - 11, y + 19, {
    font: '10px sans-serif', align: 'center', baseline: 'middle', color: CIRCULAR_HUB.frame,
  });
}

export function renderCircularNeighborhood(ctx, room) {
  if (DRAFT_MODE) return; // draft keeps the flat tile colors

  for (let row = 0; row < ROOM_ROWS; row++) {
    for (let col = 0; col < ROOM_COLS; col++) {
      const id = room.map[row][col];
      const dx = OX + col * TS;
      const dy = OY + row * TS;

      if (id === TILE.FLOOR_WOOD) {
        const isMainPath = (col >= 9 && col <= 10) || (row >= 6 && row <= 8);
        const zone = CIRCULAR_KIOSK_ZONES[getCircularZone(col, row)];
        ctx.fillStyle = isMainPath
          ? ((row + col) % 2 === 0 ? CIRCULAR_HUB.path : CIRCULAR_HUB.pathAlt)
          : ((row + col) % 2 === 0 ? CIRCULAR_HUB.grass : CIRCULAR_HUB.grassAlt);
        ctx.fillRect(dx, dy, TS, TS);
        ctx.strokeStyle = isMainPath ? CIRCULAR_HUB.grout : 'rgba(65,112,65,0.18)';
        ctx.strokeRect(dx + 0.5, dy + 0.5, TS - 1, TS - 1);
        if (!isMainPath && ((col <= 6 && row <= 5) || (col >= 13 && row <= 5)
          || (col <= 6 && row >= 9) || (col >= 13 && row >= 9))) {
          ctx.fillStyle = zone.pale;
          ctx.globalAlpha = 0.22;
          ctx.fillRect(dx + 2, dy + 2, TS - 4, TS - 4);
          ctx.globalAlpha = 1;
        }
      } else if (id === TILE.BUILDING_WALL) { // perimeter → clipped garden hedge
        ctx.fillStyle = CIRCULAR_HUB.grass;
        ctx.fillRect(dx, dy, TS, TS);
        ctx.fillStyle = CIRCULAR_HUB.hedge;
        ctx.fillRect(dx, dy + 11, TS, 12);
        ctx.fillStyle = CIRCULAR_HUB.hedgeLight;
        ctx.fillRect(dx, dy + 11, TS, 4);
        ctx.fillStyle = CIRCULAR_HUB.frame;
        ctx.fillRect(dx + TS / 2 - 2, dy + 5, 4, TS - 8);
      } else if (id === TILE.TABLE) {
        drawCircularKiosk(ctx, room, col, row);
      }
    }
  }

}

// ─── Foodwaste kitchen pass ──────────────────────────────
// Bright teaching-kitchen dressing over the generic tile pass. The map remains
// the collision source of truth; this pass only repaints its large surfaces and
// turns the six centre TABLE tiles into one continuous learning island.

const FOODWASTE_ZONE_TONES = Object.freeze({
  fridge: WORLD_ART.kitchenZoneFridge,
  plan: WORLD_ART.kitchenZonePlan,
  chef: WORLD_ART.kitchenZoneChef,
  leftovers: WORLD_ART.kitchenZoneLeftover,
});

function getFoodwasteZone(col, row) {
  if (col <= 6 && row <= 4) return 'fridge';
  if (col >= 13 && row <= 4) return 'plan';
  if (col <= 6 && row >= 9) return 'chef';
  if (col >= 13 && row >= 9) return 'leftovers';
  return null;
}

export function getFoodwastePrepIslandLayout(room, col, row) {
  if (room?.map?.[row]?.[col] !== TILE.TABLE) return null;

  let firstCol = col;
  while (room.map[row]?.[firstCol - 1] === TILE.TABLE) firstCol -= 1;
  let lastCol = col;
  while (room.map[row]?.[lastCol + 1] === TILE.TABLE) lastCol += 1;
  const length = lastCol - firstCol + 1;
  const isCentreIsland = row === 6 && length >= 3;

  return {
    draw: isCentreIsland && col === firstCol,
    col: firstCol,
    row,
    length,
  };
}

function drawFoodwasteFloorTile(ctx, col, row, tileId) {
  if (tileId !== TILE.FLOOR_STONE && tileId !== TILE.FLOOR_WOOD) return;
  const dx = OX + col * TS;
  const dy = OY + row * TS;
  const zone = getFoodwasteZone(col, row);
  const neutral = (col + row) % 2 === 0
    ? WORLD_ART.kitchenFloorHi
    : WORLD_ART.kitchenFloor;

  ctx.fillStyle = zone ? FOODWASTE_ZONE_TONES[zone] : neutral;
  ctx.fillRect(dx, dy, TS, TS);
  ctx.strokeStyle = WORLD_ART.kitchenGrout;
  ctx.strokeRect(dx + 0.5, dy + 0.5, TS - 1, TS - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillRect(dx + 2, dy + 2, TS - 4, 2);

  if (zone) {
    const accent = zone === 'leftovers'
      ? WORLD_ART.kitchenCoral
      : zone === 'plan'
        ? WORLD_ART.kitchenMint
        : WORLD_ART.kitchenFrameHi;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = accent;
    ctx.fillRect(dx + 3, dy + TS - 4, TS - 6, 2);
    ctx.globalAlpha = 1;
  }
}

function drawFoodwasteSideTable(ctx, col, row) {
  const dx = OX + col * TS;
  const dy = OY + row * TS;
  const zone = getFoodwasteZone(col, row);
  const accent = zone ? FOODWASTE_ZONE_TONES[zone] : WORLD_ART.kitchenFloor;

  ctx.fillStyle = WORLD_ART.kitchenFrame;
  ctx.fillRect(dx + 3, dy + 6, TS - 6, TS - 8);
  ctx.fillStyle = WORLD_ART.kitchenFrameHi;
  ctx.fillRect(dx + 4, dy + 6, TS - 8, 4);
  ctx.fillStyle = accent;
  ctx.fillRect(dx + 6, dy + 11, TS - 12, TS - 17);
  ctx.fillStyle = WORLD_ART.kitchenCounter;
  ctx.fillRect(dx + 7, dy + 12, TS - 14, 4);
}

function drawFoodwasteCounter(ctx, col, row) {
  const dx = OX + col * TS;
  const dy = OY + row * TS;
  const zone = getFoodwasteZone(col, row);
  const accent = zone === 'chef'
    ? WORLD_ART.kitchenCoral
    : WORLD_ART.kitchenMint;

  ctx.fillStyle = WORLD_ART.kitchenFrame;
  ctx.fillRect(dx + 1, dy + 4, TS - 2, TS - 5);
  ctx.fillStyle = WORLD_ART.kitchenCounter;
  ctx.fillRect(dx + 3, dy + 8, TS - 6, TS - 11);
  ctx.fillStyle = WORLD_ART.kitchenFrameHi;
  ctx.fillRect(dx + 1, dy + 4, TS - 2, 5);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.62;
  ctx.fillRect(dx + 5, dy + 12, TS - 10, 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#A67C52';
  ctx.fillRect(dx + TS / 2 - 2, dy + 17, 4, 2);
}

function drawFoodwastePrepIsland(ctx, layout) {
  const x = OX + layout.col * TS;
  const y = OY + layout.row * TS;
  const width = layout.length * TS;

  // One unmistakable shared table instead of six unrelated brown boxes.
  ctx.fillStyle = 'rgba(71,114,70,0.24)';
  ctx.fillRect(x + 4, y + 7, width - 8, TS - 5);
  ctx.fillStyle = WORLD_ART.grassDeep;
  ctx.fillRect(x, y + 3, width, TS - 5);
  ctx.fillStyle = WORLD_ART.kitchenCounter;
  ctx.fillRect(x + 3, y + 6, width - 6, TS - 11);
  ctx.fillStyle = WORLD_ART.grassLight;
  ctx.fillRect(x + 3, y + 6, width - 6, 4);
  ctx.fillStyle = WORLD_ART.kitchenCoral;
  ctx.fillRect(x + 3, y + TS - 8, width - 6, 3);

  // Six subtle work stations maintain the underlying tile rhythm.
  for (let index = 1; index < layout.length; index += 1) {
    ctx.fillStyle = 'rgba(109,176,108,0.38)';
    ctx.fillRect(x + index * TS - 1, y + 10, 2, TS - 18);
  }

  // Three large, readable prep stations: chopping board, mixing bowl, utensils.
  ctx.fillStyle = WORLD_ART.woodShadow;
  ctx.fillRect(x + 14, y + 11, 42, 13);
  ctx.fillStyle = BRAND.yellowSoft;
  ctx.fillRect(x + 16, y + 12, 38, 10);
  ctx.fillStyle = BRAND.orange; // chopped carrot
  ctx.fillRect(x + 21, y + 16, 12, 4);
  ctx.fillStyle = WORLD_ART.grassDeep;
  ctx.fillRect(x + 19, y + 14, 4, 3);
  ctx.fillStyle = BRAND.red; // tomato
  ctx.beginPath(); ctx.arc(x + 43, y + 17, 4, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = WORLD_ART.kitchenMint;
  ctx.beginPath(); ctx.arc(x + width / 2, y + 17, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = WORLD_ART.panelCream;
  ctx.beginPath(); ctx.arc(x + width / 2, y + 15, 7, 0, Math.PI); ctx.fill();
  for (const [ox, oy, color] of [[-4, 0, BRAND.green], [0, -2, BRAND.orange], [4, 0, BRAND.red]]) {
    ctx.fillStyle = color;
    ctx.fillRect(x + width / 2 + ox - 1, y + 16 + oy, 3, 3);
  }

  ctx.fillStyle = '#607D8B';
  ctx.fillRect(x + width - 50, y + 12, 30, 3);
  ctx.fillRect(x + width - 43, y + 9, 3, 14);
  ctx.fillRect(x + width - 32, y + 9, 3, 14);
  ctx.fillStyle = WORLD_ART.panelCream;
  ctx.fillRect(x + width - 42, y + 10, 1, 8);
  ctx.fillRect(x + width - 31, y + 10, 1, 8);
}

export function renderFoodwasteKitchen(ctx, room) {
  if (DRAFT_MODE) return; // draft keeps the flat tile colors

  for (let row = 0; row < ROOM_ROWS; row++) {
    for (let col = 0; col < ROOM_COLS; col++) {
      const tileId = room.map[row][col];
      const dx = OX + col * TS;
      const dy = OY + row * TS;

      drawFoodwasteFloorTile(ctx, col, row, tileId);

      if (tileId === TILE.TABLE) {
        const layout = getFoodwastePrepIslandLayout(room, col, row);
        if (layout?.draw) drawFoodwastePrepIsland(ctx, layout);
        else if (!layout || layout.length < 3 || layout.row !== 6) drawFoodwasteSideTable(ctx, col, row);
      }
      if (tileId === TILE.COUNTER) drawFoodwasteCounter(ctx, col, row);

      if (tileId !== TILE.BUILDING_WALL) continue;

      // Cream tiled wall
      ctx.fillStyle = WORLD_ART.kitchenFloorHi;
      ctx.fillRect(dx, dy, TS, TS);
      // Grout — a 2×2 tile grid
      ctx.strokeStyle = WORLD_ART.kitchenGrout;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dx + TS / 2, dy); ctx.lineTo(dx + TS / 2, dy + TS);
      ctx.moveTo(dx, dy + TS / 2); ctx.lineTo(dx + TS, dy + TS / 2);
      ctx.stroke();
      // Soft tile sheen (top-left of each grout cell)
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(dx + 2, dy + 2, 6, 2);
      ctx.fillRect(dx + TS / 2 + 2, dy + 2, 6, 2);

      // Pale honey skirting keeps the border clear without the old dark-brown frame.
      ctx.fillStyle = WORLD_ART.kitchenFrame;
      if (row === 0) ctx.fillRect(dx, dy + TS - 5, TS, 5);
      if (row === ROOM_ROWS - 1) ctx.fillRect(dx, dy, TS, 5);
      if (col === 0) ctx.fillRect(dx + TS - 5, dy, 5, TS);
      if (col === ROOM_COLS - 1) ctx.fillRect(dx, dy, 5, TS);
    }
  }
}

// ─── Thematic vignettes ─────────────────────────────
// Mini scenery clusters that preview each mission's content so a child knows
// what each NPC's game is about before talking (and without reading). Pure
// props: no glow, no prompt; solid via isRoomWalkable; same pixel language
// as the fence/raised beds above. Data: room.vignettes in islandRoomData.
// Used by every room that defines room.vignettes (growing, local).

const SEASON_CAL_COLORS = ['#F8BBD0', '#FFF176', '#FFB74D', '#B3E5FC']; // 🌸🌞🍂❄️

export function renderRoomVignettes(ctx, room, time) {
  if (!room.vignettes || DRAFT_MODE) return;
  for (const v of room.vignettes) {
    drawVignetteProp(ctx, v.type, OX + v.col * TS, OY + v.row * TS, time);
  }
}

function drawVignetteProp(ctx, type, dx, dy, time) {
  switch (type) {
    case 'tree': { // small fruit tree — "grows on a tree"
      ctx.fillStyle = '#6D4C41';
      ctx.fillRect(dx + 14, dy + 16, 5, 13);
      ctx.fillStyle = '#43A047';
      ctx.beginPath(); ctx.arc(dx + 16, dy + 10, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#66BB6A';
      ctx.beginPath(); ctx.arc(dx + 11, dy + 7, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#E53935';
      ctx.beginPath(); ctx.arc(dx + 20, dy + 13, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'vine': { // bush/vine with a tomato — "grows on a plant"
      ctx.fillStyle = '#558B2F';
      ctx.beginPath(); ctx.arc(dx + 11, dy + 22, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(dx + 21, dy + 22, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7CB342';
      ctx.beginPath(); ctx.arc(dx + 16, dy + 16, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#E53935';
      ctx.beginPath(); ctx.arc(dx + 16, dy + 22, 3.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'mound': { // soil mound with a carrot peeking out — "grows underground"
      ctx.fillStyle = '#795548';
      ctx.beginPath(); ctx.ellipse(dx + 16, dy + 25, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F57C00';
      ctx.beginPath(); ctx.arc(dx + 16, dy + 22, 4, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#66BB6A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dx + 16, dy + 19); ctx.lineTo(dx + 12, dy + 12);
      ctx.moveTo(dx + 16, dy + 19); ctx.lineTo(dx + 16, dy + 10);
      ctx.moveTo(dx + 16, dy + 19); ctx.lineTo(dx + 20, dy + 12);
      ctx.stroke();
      ctx.lineWidth = 1;
      break;
    }
    case 'wheat': { // swaying wheat stalks — "grows on grain stalks"
      const sway = Math.sin(time * 1.8) * 1.5;
      ctx.strokeStyle = '#D4A017';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const bx = dx + 8 + i * 5.5;
        const topY = dy + 10 + (i % 2) * 3;
        ctx.beginPath();
        ctx.moveTo(bx, dy + 28);
        ctx.quadraticCurveTo(bx + sway * 0.5, dy + 18, bx + sway, topY);
        ctx.stroke();
        ctx.fillStyle = '#E8C547';
        ctx.beginPath(); ctx.ellipse(bx + sway, topY - 3, 2.5, 5, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.lineWidth = 1;
      break;
    }
    case 'sign': { // wooden sign with a question mark
      ctx.fillStyle = '#6D4C41';
      ctx.fillRect(dx + 14, dy + 14, 4, 15);
      drawRoundedRect(ctx, dx + 5, dy + 4, 22, 15, 3, '#8D6E63', '#5D4037');
      drawText(ctx, '?', dx + 16, dy + 12, {
        font: 'bold 12px sans-serif', color: '#FFF8E1', align: 'center', baseline: 'middle',
      });
      break;
    }
    case 'bench': { // 2-tile seed bench with two tagged crates (GP preview)
      ctx.fillStyle = '#4E342E';
      ctx.fillRect(dx + 6, dy + 18, 4, 11);
      ctx.fillRect(dx + 54, dy + 18, 4, 11);
      ctx.fillStyle = '#8D6E63';
      ctx.fillRect(dx + 2, dy + 14, 60, 6);
      ctx.fillStyle = '#A1887F';
      ctx.fillRect(dx + 2, dy + 14, 60, 2);
      const crates = [[dx + 8, '🌸'], [dx + 36, '🍂']];
      for (const [cx0, tag] of crates) {
        ctx.fillStyle = '#795548';
        ctx.fillRect(cx0, dy + 2, 18, 12);
        ctx.strokeStyle = '#4E342E';
        ctx.strokeRect(cx0 + 0.5, dy + 2.5, 17, 11);
        drawRoundedRect(ctx, cx0 + 2, dy + 10, 14, 9, 4, '#FFF8E1', '#8D6E63');
        ctx.font = '7px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, cx0 + 9, dy + 15);
      }
      break;
    }
    case 'can': { // watering can
      drawRoundedRect(ctx, dx + 9, dy + 16, 15, 11, 3, '#4DB6AC', '#00897B');
      ctx.fillStyle = '#4DB6AC';
      ctx.beginPath();
      ctx.moveTo(dx + 9, dy + 19); ctx.lineTo(dx + 3, dy + 14);
      ctx.lineTo(dx + 5, dy + 12); ctx.lineTo(dx + 10, dy + 17);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#00897B';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(dx + 19, dy + 16, 5, Math.PI, 0); ctx.stroke();
      ctx.lineWidth = 1;
      break;
    }
    case 'calendar': { // 4-season mini calendar on a post
      ctx.fillStyle = '#6D4C41';
      ctx.fillRect(dx + 14, dy + 16, 4, 13);
      drawRoundedRect(ctx, dx + 4, dy + 2, 24, 17, 2, '#FFF8E1', '#8D6E63');
      const cells = [[dx + 6, dy + 4], [dx + 17, dy + 4], [dx + 6, dy + 11], [dx + 17, dy + 11]];
      SEASON_CAL_COLORS.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(cells[i][0], cells[i][1], 9, 6);
      });
      break;
    }
    case 'bedSick': { // cracked dry mini-bed with a wilted plant (SD "before")
      ctx.fillStyle = '#8D6E63';
      ctx.fillRect(dx + 3, dy + 10, 26, 18);
      ctx.fillStyle = '#A1887F';
      ctx.fillRect(dx + 6, dy + 13, 20, 12);
      ctx.strokeStyle = '#6D4C41';
      ctx.beginPath();
      ctx.moveTo(dx + 9, dy + 16); ctx.lineTo(dx + 14, dy + 20); ctx.lineTo(dx + 12, dy + 24);
      ctx.moveTo(dx + 21, dy + 15); ctx.lineTo(dx + 19, dy + 19); ctx.lineTo(dx + 23, dy + 23);
      ctx.stroke();
      // Wilted plant: green stem rooted in the bed, head hanging down
      // (olive-green, not yellow — a yellow droop reads as a banana peel)
      ctx.strokeStyle = '#7C9A3E';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dx + 14, dy + 22);
      ctx.quadraticCurveTo(dx + 13, dy + 11, dx + 19, dy + 11);
      ctx.quadraticCurveTo(dx + 23, dy + 11, dx + 23, dy + 15);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#A6B05A';
      ctx.beginPath(); ctx.ellipse(dx + 23, dy + 18, 2.2, 3.8, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bedHealed': { // rich dark mini-bed with a perky sprout (SD "after")
      ctx.fillStyle = '#8D6E63';
      ctx.fillRect(dx + 3, dy + 10, 26, 18);
      ctx.fillStyle = '#5D4037';
      ctx.fillRect(dx + 6, dy + 13, 20, 12);
      ctx.strokeStyle = '#2E7D32';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(dx + 16, dy + 16); ctx.lineTo(dx + 16, dy + 6); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#66BB6A';
      ctx.beginPath(); ctx.ellipse(dx + 12, dy + 7, 4, 2.5, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(dx + 20, dy + 7, 4, 2.5, 0.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'medcase': { // doctor's case with a green cross (heal, not chemicals)
      drawRoundedRect(ctx, dx + 5, dy + 12, 22, 15, 3, '#FAFAFA', '#9E9E9E');
      ctx.strokeStyle = '#9E9E9E';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(dx + 16, dy + 12, 4, Math.PI, 0); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#2E7D32';
      ctx.fillRect(dx + 14, dy + 15, 4, 9);
      ctx.fillRect(dx + 11.5, dy + 17.5, 9, 4);
      break;
    }
    case 'sacks': { // compost/mulch sacks
      drawRoundedRect(ctx, dx + 4, dy + 14, 13, 14, 4, '#8D6E63', '#5D4037');
      drawRoundedRect(ctx, dx + 16, dy + 17, 12, 11, 4, '#A1887F', '#5D4037');
      ctx.fillStyle = '#5D4037';
      ctx.fillRect(dx + 9, dy + 11, 4, 4);
      ctx.fillRect(dx + 20, dy + 14, 4, 4);
      break;
    }
    case 'shed': { // 2-tile lean-to with a leaning rake
      // Shaded interior so the roof reads as covering something
      ctx.fillStyle = 'rgba(93,64,55,0.25)';
      ctx.fillRect(dx + 5, dy + 12, 54, 17);
      ctx.fillStyle = '#6D4C41';
      ctx.fillRect(dx + 3, dy + 6, 5, 23);
      ctx.fillRect(dx + 56, dy + 11, 5, 18);
      // Thick slanted plank roof with highlight + underside shadow
      ctx.fillStyle = '#8D6E63';
      ctx.beginPath();
      ctx.moveTo(dx - 2, dy + 4); ctx.lineTo(dx + 66, dy + 10);
      ctx.lineTo(dx + 66, dy + 17); ctx.lineTo(dx - 2, dy + 11);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#A1887F';
      ctx.beginPath();
      ctx.moveTo(dx - 2, dy + 4); ctx.lineTo(dx + 66, dy + 10);
      ctx.lineTo(dx + 66, dy + 12); ctx.lineTo(dx - 2, dy + 6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.moveTo(dx - 2, dy + 11); ctx.lineTo(dx + 66, dy + 17);
      ctx.lineTo(dx + 66, dy + 19); ctx.lineTo(dx - 2, dy + 13);
      ctx.closePath(); ctx.fill();
      // rake leaning under the roof: shaft + head with teeth
      ctx.strokeStyle = '#C8A165';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(dx + 16, dy + 29); ctx.lineTo(dx + 24, dy + 13); ctx.stroke();
      ctx.strokeStyle = '#9E9E9E';
      ctx.beginPath(); ctx.moveTo(dx + 21, dy + 11); ctx.lineTo(dx + 28, dy + 15); ctx.stroke();
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(dx + 22 + i * 2, dy + 11.5 + i * 1.1);
        ctx.lineTo(dx + 21 + i * 2, dy + 8.5 + i * 1.1);
        ctx.stroke();
      }
      break;
    }
    case 'pots': { // terracotta pots in three sizes
      const pots = [[dx + 2, dy + 19, 9], [dx + 12, dy + 16, 12], [dx + 25, dy + 21, 7]];
      for (const [px0, py0, w] of pots) {
        const h = w * 0.9;
        ctx.fillStyle = '#C1664B';
        ctx.beginPath();
        ctx.moveTo(px0, py0); ctx.lineTo(px0 + w, py0);
        ctx.lineTo(px0 + w * 0.8, py0 + h); ctx.lineTo(px0 + w * 0.2, py0 + h);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#A14E38';
        ctx.fillRect(px0, py0, w, 2.5);
      }
      break;
    }
    case 'compost': { // compost pile with a worm
      ctx.fillStyle = '#5D4037';
      ctx.beginPath(); ctx.ellipse(dx + 16, dy + 24, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4E342E';
      for (const [ox2, oy2] of [[-6, -2], [2, -4], [6, 1], [-2, 2]]) {
        ctx.beginPath(); ctx.arc(dx + 16 + ox2, dy + 24 + oy2, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#7CB342';
      ctx.fillRect(dx + 10, dy + 19, 3, 2);
      ctx.fillRect(dx + 20, dy + 21, 3, 2);
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🪱', dx + 22, dy + 27);
      break;
    }

    // ── Local market vignettes ──

    case 'stallFruits': { // 2-tile fruit display on the dressed stall (SM corner)
      // Four tiny seasonal pennants make this corner distinct at a glance.
      SEASON_CAL_COLORS.forEach((color, index) => {
        const px = dx + 7 + index * 15;
        ctx.fillStyle = color;
        ctx.fillRect(px, dy + 3, 7, 4);
        ctx.beginPath();
        ctx.moveTo(px, dy + 7); ctx.lineTo(px + 3.5, dy + 10); ctx.lineTo(px + 7, dy + 7);
        ctx.closePath(); ctx.fill();
      });
      // Two tilted crates of fruit replacing the default produce pile
      for (const [cx0, fruit] of [[dx + 4, '#E53935'], [dx + 34, '#FB8C00']]) {
        ctx.fillStyle = WORLD_ART.marketCrate;
        ctx.fillRect(cx0, dy + 14, 26, 13);
        ctx.strokeStyle = WORLD_ART.marketCrateLn;
        ctx.strokeRect(cx0 + 0.5, dy + 14.5, 25, 12);
        ctx.fillStyle = fruit;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(cx0 + 6 + i * 5, dy + 15 + (i % 2) * 3, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // A hanging banana bunch off the awning edge
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🍇', dx + 32, dy + 11);
      break;
    }
    case 'stallPrices': { // 2-tile stall with € price tags (MT corner)
      // Local-origin badge: a map-pin silhouette with a leaf instead of text.
      ctx.fillStyle = '#2E7D32';
      ctx.beginPath();
      ctx.arc(dx + 32, dy + 7, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dx + 29, dy + 10); ctx.lineTo(dx + 32, dy + 14); ctx.lineTo(dx + 35, dy + 10);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#DCEB88';
      ctx.beginPath(); ctx.ellipse(dx + 32, dy + 7, 2.5, 1.5, -0.5, 0, Math.PI * 2); ctx.fill();
      // Produce piles…
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🍅', dx + 12, dy + 22);
      ctx.fillText('🥕', dx + 50, dy + 22);
      // …with white price tags planted in front of each
      for (const tx of [dx + 22, dx + 56]) {
        ctx.fillStyle = WORLD_ART.marketFencePost;
        ctx.fillRect(tx + 3, dy + 22, 2, 7);
        drawRoundedRect(ctx, tx - 2, dy + 14, 13, 10, 2, '#FFF8E1', WORLD_ART.marketFrame);
        drawText(ctx, '€', tx + 4.5, dy + 19, {
          font: 'bold 8px sans-serif', color: '#BF360C', align: 'center', baseline: 'middle',
        });
      }
      break;
    }
    case 'monthCal': { // mini month calendar on a post (SM corner — "what month is it?")
      ctx.fillStyle = WORLD_ART.marketFencePost;
      ctx.fillRect(dx + 14, dy + 18, 4, 11);
      drawRoundedRect(ctx, dx + 4, dy + 2, 24, 19, 2, '#FFF8E1', WORLD_ART.marketFrame);
      ctx.fillStyle = BRAND.orange; // header band = current month
      ctx.fillRect(dx + 5, dy + 3, 22, 5);
      ctx.fillStyle = '#7C765F'; // readable day grid without another brown block
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 5; c++) {
          ctx.fillRect(dx + 7 + c * 4.5, dy + 10 + r * 3.5, 3, 2.2);
        }
      }
      // Today, circled in market-red so it survives the thumbnail test
      ctx.strokeStyle = '#E53935';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(dx + 17.5, dy + 14.7, 3.5, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      break;
    }
    case 'crates': { // stacked produce crates — καφάσια
      ctx.fillStyle = WORLD_ART.marketCrate;
      ctx.fillRect(dx + 4, dy + 16, 22, 12);
      ctx.strokeStyle = WORLD_ART.marketCrateLn;
      ctx.strokeRect(dx + 4.5, dy + 16.5, 21, 11);
      ctx.fillStyle = WORLD_ART.marketFrameHi;
      ctx.fillRect(dx + 8, dy + 5, 20, 11);
      ctx.strokeStyle = WORLD_ART.marketCrateLn;
      ctx.strokeRect(dx + 8.5, dy + 5.5, 19, 10);
      // Greens poking out of the top crate
      ctx.fillStyle = '#66BB6A';
      for (const [gx, gy] of [[12, 4], [17, 2], [22, 4]]) {
        ctx.beginPath(); ctx.ellipse(dx + gx, dy + gy, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'kmSign': { // km signpost (MT corner): short green arrow vs long orange arrow
      ctx.fillStyle = WORLD_ART.marketFencePost;
      ctx.fillRect(dx + 14, dy + 6, 4, 23);
      // near: short green arrow pointing left
      ctx.fillStyle = '#43A047';
      ctx.beginPath();
      ctx.moveTo(dx + 6, dy + 10); ctx.lineTo(dx + 10, dy + 6); ctx.lineTo(dx + 10, dy + 14);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(dx + 10, dy + 8, 12, 4);
      // far: long orange arrow pointing right
      ctx.fillStyle = BRAND.orange;
      ctx.beginPath();
      ctx.moveTo(dx + 30, dy + 20); ctx.lineTo(dx + 26, dy + 16); ctx.lineTo(dx + 26, dy + 24);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(dx + 2, dy + 18, 24, 4);
      drawText(ctx, 'km', dx + 16, dy + 28, {
        font: 'bold 7px sans-serif', color: WORLD_ART.textGreen, align: 'center', baseline: 'middle',
      });
      break;
    }
    case 'coin': { // € coin against a money pouch (MT corner)
      ctx.fillStyle = '#E79E62';
      ctx.beginPath(); ctx.ellipse(dx + 20, dy + 22, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#C97840';
      ctx.fillRect(dx + 17, dy + 12, 6, 5);
      ctx.fillStyle = '#FFD54F';
      ctx.beginPath(); ctx.arc(dx + 10, dy + 21, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#F9A825';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(dx + 10, dy + 21, 5.2, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      drawText(ctx, '€', dx + 10, dy + 21.5, {
        font: 'bold 8px sans-serif', color: '#8D6E00', align: 'center', baseline: 'middle',
      });
      break;
    }
    case 'magnifierBox': { // STF corner: magnifier over a GENERIC "green-label" box.
      // Deliberately a plain carton — never one of the in-game products, so the
      // room never spoils which items are fake (no-spoiler rule).
      ctx.fillStyle = '#FFD9A8';
      ctx.fillRect(dx + 4, dy + 13, 20, 15);
      ctx.fillStyle = '#F0B96E';
      ctx.fillRect(dx + 4, dy + 13, 20, 4);
      // Vague leafy "eco" label
      drawRoundedRect(ctx, dx + 8, dy + 19, 12, 7, 2, '#C8E6C9', '#43A047');
      ctx.fillStyle = '#2E7D32';
      ctx.beginPath(); ctx.ellipse(dx + 14, dy + 22.5, 3, 1.8, -0.5, 0, Math.PI * 2); ctx.fill();
      // Hovering magnifying glass (slight bob)
      const bob = Math.sin(time * 2) * 1.5;
      ctx.strokeStyle = '#455A64';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(dx + 21, dy + 9 + bob, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dx + 25.5, dy + 13.5 + bob); ctx.lineTo(dx + 30, dy + 18 + bob);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(176,229,255,0.4)';
      ctx.beginPath(); ctx.arc(dx + 21, dy + 9 + bob, 5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'labelTags': { // post with blank hanging tags — "read the label" (STF corner)
      ctx.fillStyle = WORLD_ART.marketFencePost;
      ctx.fillRect(dx + 14, dy + 4, 4, 25);
      ctx.fillRect(dx + 4, dy + 6, 24, 3);
      for (const [index, tx] of [dx + 6, dx + 21].entries()) {
        ctx.strokeStyle = WORLD_ART.marketCrateLn;
        ctx.beginPath(); ctx.moveTo(tx + 3, dy + 9); ctx.lineTo(tx + 3, dy + 13); ctx.stroke();
        drawRoundedRect(ctx, tx - 1, dy + 13, 9, 11, 2, '#FFF8E1', WORLD_ART.marketFrame);
        ctx.fillStyle = '#BCAAA4'; // unreadable fine print
        ctx.fillRect(tx + 1, dy + 16, 5, 1.5);
        ctx.fillRect(tx + 1, dy + 19, 5, 1.5);
        ctx.fillStyle = index === 0 ? '#43A047' : '#FB8C00';
        ctx.fillRect(tx + 1, dy + 22, 5, 1.5);
      }
      break;
    }
    case 'flagPost': { // red call-it-out flag (STF corner), gentle wave
      const wave = Math.sin(time * 2.2) * 2;
      ctx.fillStyle = WORLD_ART.marketFencePost;
      ctx.fillRect(dx + 8, dy + 6, 3, 23);
      ctx.fillStyle = '#E53935';
      ctx.beginPath();
      ctx.moveTo(dx + 11, dy + 7);
      ctx.quadraticCurveTo(dx + 20, dy + 9 + wave, dx + 27, dy + 11 + wave);
      ctx.lineTo(dx + 11, dy + 16);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'scale': { // mentor corner: balance scale — the market keeper's tool
      ctx.fillStyle = '#455A64';
      ctx.fillRect(dx + 14, dy + 8, 4, 17);
      ctx.fillRect(dx + 8, dy + 25, 16, 3);
      ctx.fillRect(dx + 4, dy + 8, 24, 3);
      // Two hanging pans (left slightly lower — it holds the veg)
      for (const [px0, py0, full] of [[dx + 6, dy + 17, true], [dx + 26, dy + 14, false]]) {
        ctx.strokeStyle = '#78909C';
        ctx.beginPath(); ctx.moveTo(px0, dy + 11); ctx.lineTo(px0, py0); ctx.stroke();
        ctx.fillStyle = '#B0BEC5';
        ctx.beginPath(); ctx.ellipse(px0, py0 + 2, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        if (full) {
          ctx.fillStyle = '#E53935';
          ctx.beginPath(); ctx.arc(px0, py0 - 1, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'basket': { // wicker market basket with fresh produce
      ctx.fillStyle = '#C8A165';
      ctx.beginPath();
      ctx.moveTo(dx + 5, dy + 16); ctx.lineTo(dx + 27, dy + 16);
      ctx.lineTo(dx + 24, dy + 28); ctx.lineTo(dx + 8, dy + 28);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = WORLD_ART.marketCrateLn;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(dx + 6, dy + 19 + i * 3.5); ctx.lineTo(dx + 26, dy + 19 + i * 3.5);
        ctx.stroke();
      }
      ctx.strokeStyle = WORLD_ART.marketCrateLn;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(dx + 16, dy + 16, 9, Math.PI, 0); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🥖', dx + 11, dy + 14);
      ctx.fillText('🥬', dx + 21, dy + 14);
      break;
    }

    // ── Circular island vignettes (smart neighborhood / repair-cafe) ──

    case 'compostBins': { // 2-tile: a green compost bin + a brown bin, scraps on top
      drawRoundedRect(ctx, dx + 4, dy + 12, 18, 17, 3, '#558B2F', '#33691E'); // compost (green)
      ctx.fillStyle = '#7CB342'; ctx.fillRect(dx + 5, dy + 9, 16, 4); // lid
      drawRoundedRect(ctx, dx + 38, dy + 12, 18, 17, 3, '#8D6E63', '#5D4037'); // organic (brown)
      ctx.fillStyle = '#A1887F'; ctx.fillRect(dx + 39, dy + 9, 16, 4);
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🌱', dx + 13, dy + 21); ctx.fillText('🍌', dx + 47, dy + 21);
      break;
    }
    case 'peelPile': { // small heap of organic scraps (compost inputs)
      ctx.fillStyle = '#8D6E63';
      ctx.beginPath(); ctx.ellipse(dx + 16, dy + 25, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🍎', dx + 16, dy + 18); ctx.fillText('🥚', dx + 10, dy + 23); ctx.fillText('☕', dx + 22, dy + 23);
      break;
    }
    case 'wormSign': { // post + 🪱 placard — "compost has helpers"
      ctx.fillStyle = '#6D4C41'; ctx.fillRect(dx + 14, dy + 16, 4, 13);
      drawRoundedRect(ctx, dx + 4, dy + 4, 24, 14, 3, '#FFF8E1', '#8D6E63');
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🪱', dx + 16, dy + 11);
      break;
    }
    case 'repairBench': { // 2-tile workbench with tools + a half-fixed item
      ctx.fillStyle = '#8D6E63'; ctx.fillRect(dx + 2, dy + 16, 56, 12); // bench top (spans 2 tiles)
      ctx.fillStyle = '#6D4C41'; ctx.fillRect(dx + 2, dy + 16, 56, 3);
      ctx.strokeStyle = '#455A64'; ctx.lineWidth = 2.5; // screwdriver
      ctx.beginPath(); ctx.moveTo(dx + 10, dy + 15); ctx.lineTo(dx + 15, dy + 6); ctx.stroke();
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, dx + 24, dy + 9, 13, 8, 2, '#B0BEC5', '#607D8B'); // half-fixed item
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🔧', dx + 46, dy + 11);
      break;
    }
    case 'recycleCoin': { // green eco-coin against a pouch (mirror of local 'coin')
      ctx.fillStyle = '#8D6E63';
      ctx.beginPath(); ctx.ellipse(dx + 20, dy + 22, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6D4C41'; ctx.fillRect(dx + 17, dy + 12, 6, 5);
      ctx.fillStyle = '#A5D6A7';
      ctx.beginPath(); ctx.arc(dx + 10, dy + 21, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#43A047'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(dx + 10, dy + 21, 5.2, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♻️', dx + 10, dy + 21.5);
      break;
    }
    case 'cityHouse': { // small flat house with a green roof — circular-city motif
      ctx.fillStyle = WORLD_ART.stoneCool; ctx.fillRect(dx + 6, dy + 14, 20, 15);
      ctx.fillStyle = WORLD_ART.recyclingHub; // green roof
      ctx.beginPath(); ctx.moveTo(dx + 3, dy + 14); ctx.lineTo(dx + 16, dy + 5); ctx.lineTo(dx + 29, dy + 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(100,181,246,0.6)'; ctx.fillRect(dx + 9, dy + 18, 6, 6); ctx.fillRect(dx + 18, dy + 18, 6, 6); // windows
      ctx.fillStyle = '#6D4C41'; ctx.fillRect(dx + 14, dy + 23, 5, 6); // door
      break;
    }
    case 'miniPlanet': { // a small Earth — blue disc + green landmasses + faint ring
      ctx.fillStyle = '#64B5F6'; ctx.beginPath(); ctx.arc(dx + 16, dy + 17, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#66BB6A';
      ctx.beginPath(); ctx.ellipse(dx + 12, dy + 14, 4, 3, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(dx + 20, dy + 20, 3.5, 2.5, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(dx + 16, dy + 17, 14, 5, -0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      break;
    }
    case 'boundaryDial': { // a gauge: green "safe" arc + red "crossed" + swaying needle
      ctx.fillStyle = '#ECEFF1'; ctx.beginPath(); ctx.arc(dx + 16, dy + 21, 11, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#43A047'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(dx + 16, dy + 21, 11, Math.PI, Math.PI * 1.5); ctx.stroke(); // safe
      ctx.strokeStyle = '#E53935';
      ctx.beginPath(); ctx.arc(dx + 16, dy + 21, 11, Math.PI * 1.5, Math.PI * 2); ctx.stroke(); // crossed
      const a = -Math.PI / 2 + Math.sin(time * 1.5) * 0.4;
      ctx.strokeStyle = '#37474F'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(dx + 16, dy + 21); ctx.lineTo(dx + 16 + Math.cos(a) * 9, dy + 21 + Math.sin(a) * 9); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#37474F'; ctx.beginPath(); ctx.arc(dx + 16, dy + 21, 2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'toolbox': { // the Repair Engineer's toolbox
      drawRoundedRect(ctx, dx + 5, dy + 15, 22, 13, 2, '#E53935', '#B71C1C');
      ctx.fillStyle = '#C62828'; ctx.fillRect(dx + 5, dy + 19, 22, 2);
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2.5; // handle
      ctx.beginPath(); ctx.arc(dx + 16, dy + 15, 7, Math.PI, 0); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🔧', dx + 16, dy + 23);
      break;
    }
    case 'recycleBins': { // 2-tile: 3 colored sorting bins with ♻ marks
      for (const [c, bx] of [['#1E88E5', dx + 5], ['#FBC02D', dx + 23], ['#43A047', dx + 41]]) {
        drawRoundedRect(ctx, bx, dy + 13, 15, 16, 2, c, 'rgba(0,0,0,0.25)');
        ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('♻️', bx + 7.5, dy + 21);
      }
      break;
    }
    case 'fixedItem': { // a repaired object with a ✅ — the R4 Repair payoff
      drawRoundedRect(ctx, dx + 7, dy + 12, 18, 15, 2, '#B0BEC5', '#607D8B');
      ctx.strokeStyle = '#90A4AE'; ctx.lineWidth = 1; // mend seam
      ctx.beginPath(); ctx.moveTo(dx + 7, dy + 19); ctx.lineTo(dx + 25, dy + 19); ctx.stroke();
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✅', dx + 23, dy + 11);
      break;
    }

    // ── Foodwaste kitchen vignettes ──
    case 'fridgeShelves': { // 2-tile open fridge — shelves + food dots + cold glow (FM corner)
      drawRoundedRect(ctx, dx + 4, dy + 4, 40, 26, 3, '#ECEFF1', '#B0BEC5'); // body
      ctx.fillStyle = '#CFE8F0'; ctx.fillRect(dx + 8, dy + 8, 32, 18);        // chilled interior
      ctx.strokeStyle = '#B0BEC5'; ctx.lineWidth = 1;                         // shelves
      ctx.beginPath();
      ctx.moveTo(dx + 8, dy + 14); ctx.lineTo(dx + 40, dy + 14);
      ctx.moveTo(dx + 8, dy + 20); ctx.lineTo(dx + 40, dy + 20);
      ctx.stroke();
      for (const [fx, fy, c] of [[12, 11, '#E53935'], [20, 11, '#43A047'], [28, 11, '#FB8C00'], [14, 17, '#FFB300'], [24, 17, '#8D6E63'], [32, 17, '#7CB342']]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(dx + fx, dy + fy, 2.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(207,232,240,0.55)'; ctx.fillRect(dx + 44, dy + 6, 8, 22); // open door + glow
      ctx.fillStyle = '#ECEFF1'; ctx.fillRect(dx + 44, dy + 6, 3, 22);
      break;
    }
    case 'expiryTag': { // a use-by tag — calendar card with a red ringed day (FM corner)
      drawRoundedRect(ctx, dx + 8, dy + 8, 18, 18, 2, WORLD_ART.panelCream, '#90A4AE');
      ctx.fillStyle = BRAND.red; ctx.fillRect(dx + 8, dy + 8, 18, 5); // header band
      ctx.fillStyle = '#B0BEC5';
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) ctx.fillRect(dx + 11 + c * 5, dy + 16 + r * 5, 2, 2);
      ctx.strokeStyle = BRAND.red; ctx.lineWidth = 1.5; // ringed "today"
      ctx.beginPath(); ctx.arc(dx + 16, dy + 21, 3.4, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      break;
    }
    case 'milkCarton': { // a gable-top milk carton (FM corner)
      ctx.fillStyle = '#FAFAFA'; ctx.fillRect(dx + 11, dy + 12, 12, 16);
      ctx.beginPath(); ctx.moveTo(dx + 11, dy + 12); ctx.lineTo(dx + 17, dy + 7); ctx.lineTo(dx + 23, dy + 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#E0E0E0'; ctx.fillRect(dx + 19, dy + 12, 4, 16); // shade side
      ctx.fillStyle = BRAND.blue; ctx.fillRect(dx + 11, dy + 19, 12, 4); // label band
      ctx.fillStyle = '#FAFAFA'; ctx.beginPath(); ctx.arc(dx + 17, dy + 21, 1.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'mealPlate': { // a balanced plated meal — veg/protein/grain (MP corner)
      ctx.fillStyle = '#CFD8DC'; ctx.beginPath(); ctx.arc(dx + 16, dy + 18, 11, 0, Math.PI * 2); ctx.fill(); // rim
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(dx + 16, dy + 18, 8.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7CB342'; ctx.beginPath(); ctx.arc(dx + 13, dy + 15, 3.4, 0, Math.PI * 2); ctx.fill(); // veg
      ctx.fillStyle = '#FB8C00'; ctx.beginPath(); ctx.arc(dx + 20, dy + 16, 3.2, 0, Math.PI * 2); ctx.fill(); // protein
      ctx.fillStyle = '#FFB300'; ctx.beginPath(); ctx.arc(dx + 16, dy + 22, 3.2, 0, Math.PI * 2); ctx.fill(); // grain
      break;
    }
    case 'planBasket': { // a planning/shopping basket with produce (MP corner)
      ctx.fillStyle = '#A1887F';
      ctx.beginPath(); ctx.moveTo(dx + 8, dy + 16); ctx.lineTo(dx + 24, dy + 16); ctx.lineTo(dx + 22, dy + 28); ctx.lineTo(dx + 10, dy + 28); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(dx + 9, dy + 20); ctx.lineTo(dx + 23, dy + 20); ctx.moveTo(dx + 9, dy + 24); ctx.lineTo(dx + 23, dy + 24); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(dx + 16, dy + 16, 7, Math.PI, 0); ctx.stroke(); ctx.lineWidth = 1; // handle
      ctx.fillStyle = '#7CB342'; ctx.beginPath(); ctx.arc(dx + 12, dy + 15, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(dx + 18, dy + 14, 2.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'weekGrid': { // a week meal-plan grid with green ticks (MP corner)
      drawRoundedRect(ctx, dx + 5, dy + 8, 22, 18, 2, WORLD_ART.panelCream, '#90A4AE');
      ctx.strokeStyle = '#B0BEC5'; ctx.lineWidth = 1;
      for (let c = 1; c < 4; c++) { ctx.beginPath(); ctx.moveTo(dx + 5 + c * 5.5, dy + 8); ctx.lineTo(dx + 5 + c * 5.5, dy + 26); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(dx + 5, dy + 17); ctx.lineTo(dx + 27, dy + 17); ctx.stroke();
      ctx.strokeStyle = '#43A047'; ctx.lineWidth = 1.4;
      for (const [tx, ty] of [[8, 12], [19, 12], [13, 21]]) {
        ctx.beginPath(); ctx.moveTo(dx + tx, dy + ty); ctx.lineTo(dx + tx + 1.5, dy + ty + 2); ctx.lineTo(dx + tx + 4, dy + ty - 2); ctx.stroke();
      }
      ctx.lineWidth = 1;
      break;
    }
    case 'cookPot': { // a cook pot with rising steam (LC corner)
      const sw = Math.sin(time * 2) * 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dx + 13 + sw, dy + 12); ctx.quadraticCurveTo(dx + 16 - sw, dy + 8, dx + 13 + sw, dy + 4);
      ctx.moveTo(dx + 19 - sw, dy + 12); ctx.quadraticCurveTo(dx + 16 + sw, dy + 8, dx + 19 - sw, dy + 4);
      ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = '#546E7A'; ctx.fillRect(dx + 8, dy + 16, 16, 11); // body
      ctx.fillStyle = '#455A64'; ctx.fillRect(dx + 8, dy + 24, 16, 3);
      ctx.fillStyle = '#607D8B'; ctx.fillRect(dx + 7, dy + 14, 18, 3); // lid
      ctx.fillStyle = '#90A4AE'; ctx.fillRect(dx + 15, dy + 11, 2, 3); // knob
      ctx.fillStyle = '#455A64'; ctx.fillRect(dx + 5, dy + 18, 3, 2); ctx.fillRect(dx + 24, dy + 18, 3, 2); // handles
      break;
    }
    case 'cuttingBoard': { // a board with a knife + chopped veg (LC corner)
      drawRoundedRect(ctx, dx + 5, dy + 16, 22, 10, 2, '#C8A66B', '#A1887F');
      ctx.fillStyle = '#FB8C00';
      for (const sx of [9, 13, 17]) { ctx.beginPath(); ctx.arc(dx + sx, dy + 21, 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#CFD8DC'; ctx.beginPath();
      ctx.moveTo(dx + 20, dy + 12); ctx.lineTo(dx + 26, dy + 12); ctx.lineTo(dx + 22, dy + 18); ctx.lineTo(dx + 20, dy + 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5D4037'; ctx.fillRect(dx + 24, dy + 10, 4, 3); // knife handle
      break;
    }
    case 'leftoverBowl': { // a bowl of mixed leftovers + a green "made new" arc (LC corner)
      ctx.fillStyle = '#ECEFF1'; ctx.beginPath(); ctx.arc(dx + 16, dy + 19, 10, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#CFD8DC'; ctx.fillRect(dx + 6, dy + 19, 20, 2);
      for (const [fx, fy, c] of [[12, 17, '#7CB342'], [16, 16, '#FB8C00'], [20, 17, '#E53935'], [15, 19, '#FFB300']]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(dx + fx, dy + fy, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = '#43A047'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(dx + 16, dy + 10, 4, Math.PI * 0.3, Math.PI * 1.7); ctx.stroke();
      ctx.fillStyle = '#43A047'; ctx.beginPath(); ctx.moveTo(dx + 18, dy + 6); ctx.lineTo(dx + 21, dy + 7); ctx.lineTo(dx + 18, dy + 9); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1;
      break;
    }
    case 'chefStand': { // a chef's toque — the mentor's emblem (mentor corner)
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(dx + 9, dy + 20, 14, 6); // band
      ctx.fillStyle = '#ECEFF1'; ctx.fillRect(dx + 9, dy + 24, 14, 2);
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); // puffy top
      ctx.arc(dx + 12, dy + 16, 5, 0, Math.PI * 2);
      ctx.arc(dx + 16, dy + 13, 6, 0, Math.PI * 2);
      ctx.arc(dx + 20, dy + 16, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#E0E0E0'; ctx.beginPath(); ctx.arc(dx + 20, dy + 17, 2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'spiceJars': { // three little spice jars (mentor corner)
      for (const [jx, c] of [[8, '#E53935'], [15, '#FB8C00'], [22, '#7CB342']]) {
        ctx.fillStyle = c; ctx.fillRect(dx + jx, dy + 16, 6, 11);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(dx + jx + 1, dy + 17, 1.5, 9);
        ctx.fillStyle = '#8D6E63'; ctx.fillRect(dx + jx - 1, dy + 13, 8, 3);
      }
      break;
    }
    case 'recipeCard': { // a recipe card with text lines (mentor corner)
      drawRoundedRect(ctx, dx + 6, dy + 8, 20, 20, 2, WORLD_ART.panelCream, '#90A4AE');
      ctx.fillStyle = BRAND.red; ctx.fillRect(dx + 6, dy + 8, 20, 4); // header
      ctx.strokeStyle = '#B0BEC5'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(dx + 9, dy + 16 + i * 3); ctx.lineTo(dx + 23, dy + 16 + i * 3); ctx.stroke(); }
      ctx.fillStyle = '#FB8C00'; ctx.beginPath(); ctx.arc(dx + 21, dy + 12, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
}

// ─── NPCs ────────────────────────────────────────────────

// A mission NPC is locked until the previous mission of its island is
// done. Single source of truth: delegates to isMissionUnlocked so the padlock
// visual can never disagree with the Enter-refusal logic in IslandRoom.
function isNPCLocked(island, npc, completed) {
  const mission = MISSION_MAP[island]?.[npc.missionIdx];
  return !!mission && !isMissionUnlocked(island, mission.id, completed || []);
}

export function renderRoomNPCs(ctx, room, island, atlas, completed, time, state = null) {
  // Facing a locked NPC, point the way: amber halo + 👇 on the NPC of the first
  // game still unplayed, so a non-reader learns "go there first" without text.
  //
  // Two things this gets right that the old version did not. It points at the
  // next PLAYABLE game rather than the one numbered just before, which at the
  // third NPC with nothing finished meant pointing at another locked door. And
  // it holds for as long as the child stands there, instead of the 1.6s nudge,
  // so the prompt can refer to it without describing something already gone.
  const nextId = state?.nearNPC?.locked ? nextMissionId(island, completed) : undefined;
  const nudgeIdx = nextId === undefined
    ? -1
    : (MISSION_MAP[island] || []).findIndex((m) => m.id === nextId);
  if (DRAFT_MODE) {
    // Circle head + rectangle body + name label, no animation
    for (const npc of room.npcs) {
      const dx = OX + npc.col * TS;
      const dy = OY + npc.row * TS;
      const cx = dx + TS / 2;
      const cy = dy + TS / 2;

      const locked = isNPCLocked(island, npc, completed);
      if (locked) ctx.globalAlpha = 0.45;
      // Rectangle body
      ctx.fillStyle = '#90CAF9';
      ctx.fillRect(cx - 8, cy - 2, 16, 18);
      // Circle head
      ctx.fillStyle = '#FFCC80';
      ctx.beginPath();
      ctx.arc(cx, cy - 8, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Name label
      const mission = MISSION_MAP[island]?.[npc.missionIdx];
      const label = mission?.component || ('NPC' + npc.missionIdx);
      drawText(ctx, label, cx, dy + TS + 4, {
        font: "bold 7px sans-serif", color: '#fff',
        align: 'center', baseline: 'middle',
      });
      if (locked) {
        drawText(ctx, '🔒', cx, cy - 16, {
          font: '11px sans-serif', color: '#fff',
          align: 'center', baseline: 'middle',
        });
      }
      // Completed marker — simple green check text
      if (mission && completed.includes(mission.id)) {
        drawText(ctx, '\u2713', cx + 10, cy - 12, {
          font: "bold 12px sans-serif", color: BRAND.green,
          align: 'center', baseline: 'middle',
        });
      }
    }
    return;
  }

  const npcFrame = Math.floor(time / 0.5) % 2;

  for (const npc of room.npcs) {
    const dx = OX + npc.col * TS;
    const dy = OY + npc.row * TS;
    const locked = isNPCLocked(island, npc, completed);

    // Shadow under NPC
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(dx + TS / 2, dy + TS - 2, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Idle bob (locked NPCs stand still — visually "asleep" until unlocked)
    const bob = locked ? 0 : Math.sin(time * 2 + npc.missionIdx * 1.5) * 1;

    // NPC sprite — locked = dimmed
    const sprite = atlas.npcs[island]?.[npc.missionIdx]?.[npcFrame];
    if (sprite) {
      if (locked) ctx.globalAlpha = 0.45;
      ctx.drawImage(sprite, Math.round(dx), Math.round(dy + bob));
      ctx.globalAlpha = 1;
    }

    // Padlock above a locked NPC, gentle float so it still feels alive
    if (locked) {
      const lockBob = Math.sin(time * 1.5 + npc.missionIdx) * 1.5;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒', dx + TS / 2, dy - 8 + lockBob);
    }

    // "Go here first" beat on the prerequisite NPC (SoilDoctor attract pattern).
    if (npc.missionIdx === nudgeIdx) {
      const pulse = 0.5 + Math.sin(time * 5) * 0.5;
      ctx.save();
      ctx.shadowColor = 'rgba(255,213,79,0.9)';
      ctx.shadowBlur = 8 + pulse * 12;
      ctx.strokeStyle = '#FFD54F';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(dx + TS / 2, dy + TS / 2, TS * 0.75 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👇', dx + TS / 2, dy - 24 + Math.sin(time * 5) * 4);
    }

    // Happy expression overlay — foodwaste island NPCs smile when 3+ missions done
    if (island === 'foodwaste' && completed.length >= 3) {
      const fx = Math.round(dx);
      const fy = Math.round(dy + bob);
      // Cover default mouth with skin tone
      ctx.fillStyle = '#FFCC80';
      ctx.fillRect(fx + 14, fy + 12, 5, 2);
      // Draw wider smile arc
      ctx.strokeStyle = '#E57373';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(fx + 16, fy + 11, 3.5, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.lineWidth = 1;
      // Rosy cheeks
      ctx.fillStyle = 'rgba(244,143,177,0.35)';
      ctx.beginPath();
      ctx.arc(fx + 12, fy + 11, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fx + 20, fy + 11, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Completed badge overlay
    const mission = MISSION_MAP[island]?.[npc.missionIdx];
    if (mission && completed.includes(mission.id)) {
      if (atlas.npcDoneBadge) {
        ctx.drawImage(atlas.npcDoneBadge, dx, dy - 4);
      }
    }
  }
}

// ─── Player (walking character, NOT the boat) ────────────

export function renderRoomPlayer(ctx, state, atlas) {
  const p = state.player;
  const px = OX + p.pixelX;
  const py = OY + p.pixelY;

  if (DRAFT_MODE) {
    // Simple circle head + rectangle body, no bounce/animation
    const cx = px + TS / 2;
    const cy = py + TS / 2;
    // Body
    ctx.fillStyle = '#42A5F5';
    ctx.fillRect(cx - 8, cy - 2, 16, 18);
    // Head
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 7, 0, Math.PI * 2);
    ctx.fill();
    // Direction indicator arrow
    const arrows = { up: '\u25B2', down: '\u25BC', left: '\u25C0', right: '\u25B6' };
    drawText(ctx, arrows[p.dir] || '\u25BC', cx, cy + 20, {
      font: "bold 8px sans-serif", color: BRAND.purple,
      align: 'center', baseline: 'middle',
    });
    return;
  }

  const walkFrame = p.moving ? (Math.floor(state.time / 0.12) % 2) : 0;

  let bounceY = 0;
  if (p.moving) {
    const progress = p.moveTimer / MOVE_DURATION;
    bounceY = -Math.sin(progress * Math.PI) * 3;
  } else {
    bounceY = Math.sin(state.time * 2) * 0.5;
  }

  const sprite = atlas.player[p.dir]?.[walkFrame];
  if (sprite) {
    ctx.drawImage(sprite, Math.round(px), Math.round(py + bounceY));
  }
}

// ─── NPC Preview Items (game hint display) ──────────────

export function renderNPCPreviewItems(ctx, room, island, completed, time) {
  for (const npc of room.npcs) {
    if (!npc.previewItems || npc.previewItems.length === 0) continue;
    // Locked missions keep their secrets — the padlock is the whole message.
    if (isNPCLocked(island, npc, completed)) continue;

    const npcX = OX + npc.col * TS + TS / 2;
    // Display above the NPC (1 tile up)
    const shelfY = OY + (npc.row - 1) * TS;
    const itemCount = npc.previewItems.length;
    const spacing = 20;
    const totalW = (itemCount - 1) * spacing;

    // Light transparent pill background
    const bgW = totalW + 30;
    const bgH = 24;
    const bgY = shelfY + TS / 2 - bgH / 2 - 2;

    if (!DRAFT_MODE) {
      // Soft white glow behind emojis
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.ellipse(npcX, bgY + bgH / 2, bgW / 2 + 2, bgH / 2 + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Render emoji items with gentle float
    for (let i = 0; i < itemCount; i++) {
      const ix = npcX - totalW / 2 + i * spacing;
      const floatY = DRAFT_MODE ? 0 : Math.sin(time * 1.8 + i * 1.2 + npc.missionIdx * 2) * 1.5;

      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(npc.previewItems[i], ix, bgY + bgH / 2 + floatY);
    }
  }
}

// ─── Ambient NPCs (decorative villagers) ─────────────────

export function renderAmbientNPCs(ctx, state) {
  if (!state.ambientNPCs) return;

  for (const anpc of state.ambientNPCs) {
    const px = OX + anpc.pixelX;
    const py = OY + anpc.pixelY;

    if (DRAFT_MODE) {
      const cx = px + TS / 2;
      const cy = py + TS / 2;
      // Simple colored circle + body
      ctx.fillStyle = anpc.color || '#CE93D8';
      ctx.fillRect(cx - 6, cy - 2, 12, 14);
      ctx.fillStyle = '#FFCC80';
      ctx.beginPath();
      ctx.arc(cx, cy - 7, 5, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    // Use pre-built sprite frames
    if (anpc.sprites) {
      const walkFrame = anpc.moving ? (Math.floor(state.time / 0.18) % 2) : 0;
      const sprite = anpc.sprites[anpc.dir]?.[walkFrame];
      if (sprite) {
        const bounceY = anpc.moving ? -Math.sin(state.time * 8) * 1.5 : 0;
        const marketLeanX = !anpc.moving && anpc.activity
          ? (anpc.dir === 2 ? -1 : anpc.dir === 3 ? 1 : 0)
          : 0;
        const marketLeanY = !anpc.moving && anpc.activity && anpc.dir === 1 ? -1 : 0;
        ctx.drawImage(
          sprite,
          Math.round(px + marketLeanX),
          Math.round(py + bounceY + marketLeanY),
        );
      }
    }
  }
}

// ─── Island Mentor ────────────────
// Stationary named NPC. Growing uses a dedicated Gardener sprite; the other
// islands keep their existing ambient-villager frames until they receive art.

export function getIslandMentorSpriteLayout({ mentor, time = 0, dedicated = false }) {
  const dx = OX + mentor.col * TS;
  const dy = OY + mentor.row * TS;
  const bob = Math.sin(time * 2.2) * 1.2;
  const size = dedicated ? TS + 4 : TS;

  return {
    x: Math.round(dx - (size - TS) / 2),
    y: Math.round(dy - (size - TS) + bob),
    width: size,
    height: size,
  };
}

function mentorRectsOverlap(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function getIslandMentorOverlayLayout({
  cx,
  dy,
  spriteTopY,
  nameWidth,
  playerRect,
  inviteVisible,
  dialogOpen,
  dedicated,
}) {
  const spriteTop = Math.round(spriteTopY);
  const name = {
    x: cx - nameWidth / 2,
    y: dy + TS + 2,
    width: nameWidth,
    height: 14,
  };
  const invite = {
    body: { x: cx - 9, y: spriteTop - 19, width: 18, height: 12 },
    tailTip: { x: cx, y: spriteTop - 3 },
  };
  const showInvite = Boolean(inviteVisible && !dialogOpen);
  const dedicatedNameIsClear = !showInvite
    && !dialogOpen
    && !mentorRectsOverlap(name, playerRect);

  return {
    name,
    invite,
    showInvite,
    showName: dedicated ? dedicatedNameIsClear : true,
  };
}

function drawMentorInviteBubble(ctx, invite) {
  const x = Math.round(invite.body.x);
  const y = Math.round(invite.body.y);
  const cx = Math.round(invite.tailTip.x);
  const tailY = Math.round(invite.tailTip.y);

  ctx.fillStyle = '#244D32';
  ctx.fillRect(x - 1, y - 1, invite.body.width + 2, invite.body.height + 2);
  ctx.beginPath();
  ctx.moveTo(cx - 4, y + invite.body.height);
  ctx.lineTo(cx + 4, y + invite.body.height);
  ctx.lineTo(cx, tailY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFF1C7';
  ctx.fillRect(x + 1, y + 1, invite.body.width - 2, invite.body.height - 2);
  ctx.beginPath();
  ctx.moveTo(cx - 2, y + invite.body.height - 1);
  ctx.lineTo(cx + 2, y + invite.body.height - 1);
  ctx.lineTo(cx, tailY - 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#4F8F3A';
  for (const dotX of [x + 4, x + 8, x + 12]) {
    ctx.fillRect(dotX, y + 5, 2, 2);
  }
}

export function renderMentorNPC(ctx, room, time, state) {
  if (!room.mentor) return;
  const dx = OX + room.mentor.col * TS;
  const dy = OY + room.mentor.row * TS;
  const cx = dx + TS / 2;
  const name = state.strings?.mentorName || '';

  if (DRAFT_MODE) {
    ctx.fillStyle = room.mentor.color || '#F48FB1';
    ctx.fillRect(cx - 8, dy + TS / 2 - 2, 16, 18);
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.arc(cx, dy + TS / 2 - 8, 7, 0, Math.PI * 2);
    ctx.fill();
    if (name) {
      drawText(ctx, name, cx, dy + TS + 4, {
        font: 'bold 7px sans-serif', color: '#fff', align: 'center', baseline: 'middle',
      });
    }
    return;
  }

  // Shadow
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, dy + TS - 2, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const frame = Math.floor(time / 0.5) % 2;
  const dedicated = state.mentorUsesDedicatedSprite === true;
  const sprite = dedicated
    ? state.mentorSprites?.[frame]
    : state.mentorSprites?.[0]?.[frame]; // generic mentors face DOWN
  const spriteLayout = getIslandMentorSpriteLayout({ mentor: room.mentor, time, dedicated });
  if (sprite) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sprite,
      spriteLayout.x,
      spriteLayout.y,
      spriteLayout.width,
      spriteLayout.height,
    );
    ctx.restore();
  }

  ctx.font = 'bold 10px sans-serif';
  const nameWidth = name ? ctx.measureText(name).width + 12 : 0;
  const playerRect = state.player ? {
    x: OX + state.player.pixelX,
    y: OY + state.player.pixelY,
    width: TS,
    height: TS,
  } : null;
  const overlay = getIslandMentorOverlayLayout({
    cx,
    dy,
    spriteTopY: spriteLayout.y,
    nameWidth,
    playerRect,
    inviteVisible: state.nearMentor,
    dialogOpen: Boolean(state.mentorDialog),
    dedicated,
  });

  // Name pill below — the mentor is the only named character in the room
  if (name && overlay.showName) {
    drawRoundedRect(ctx, overlay.name.x, overlay.name.y, overlay.name.width, overlay.name.height, 7, 'rgba(255,255,255,0.9)', '#8D6E63');
    drawText(ctx, name, cx, dy + TS + 9, {
      font: 'bold 9px sans-serif', color: WORLD_ART.panelBrown, align: 'center', baseline: 'middle',
    });
  }

  // Speech invite while the player faces her
  if (overlay.showInvite) {
    if (dedicated) {
      drawMentorInviteBubble(ctx, overlay.invite);
    } else {
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💬', cx, dy - 12 + Math.sin(time * 4) * 3);
    }
  }
}

export function renderMentorPrompt(ctx, state) {
  if (!state.nearMentor || state.mentorDialog || state.nearNPC) return;
  const text = state.strings?.mentorPrompt || 'Talk';

  ctx.font = "bold 15px 'Inter', system-ui, sans-serif";
  const promptW = Math.max(ctx.measureText(text).width + 50, 260);
  const promptH = 46;
  const px = CANVAS_W / 2 - promptW / 2;
  const py = CANVAS_H - 75;

  ctx.globalAlpha = 0.9 + Math.sin(state.time * 3) * 0.1;
  drawRoundedRect(ctx, px + 2, py + 3, promptW, promptH, 16, 'rgba(0,0,0,0.15)', 'transparent');
  drawRoundedRect(ctx, px, py, promptW, promptH, 16, 'rgba(255,255,255,0.95)', '#8D6E63');
  drawText(ctx, '💬 ' + text, CANVAS_W / 2, py + promptH / 2 - 2, {
    font: "bold 14px 'Inter', system-ui, sans-serif",
    color: BRAND.purple, align: 'center', baseline: 'middle',
  });
  ctx.globalAlpha = 1;
}

// Greedy word wrap against the current ctx.font
function wrapLines(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Mentor speech card — doubles as the island intro (story arc) when it is
// auto-opened on first entry, and as contextual guidance when talked to.
// On a phone held sideways the centred card's last lines fall under the
// touch ▲. The caller asks for `top` only for the Foodwaste story there; the card then sits
// just under the HUD bar, never over it (MENTOR_TOP_GAP below HUD_HEIGHT, in card scale).
// hudUnit: the HUD grows on a phone (readableHudUnit), so the card follows it down.
export const MENTOR_TOP_GAP = 8;
export function mentorDialogTop(uiScale, hudUnit = 1) {
  return HUD_HEIGHT * hudUnit + MENTOR_TOP_GAP * uiScale;
}
export function renderMentorDialog(ctx, state, { top = false } = {}) {
  if (!state.mentorDialog) {
    state.mentorDialogLayout = null;
    return;
  }
  const name = state.strings?.mentorName || '';
  const contText = state.strings?.dialogContinue || 'Enter';

  // The canvas is contained on 4:3 tablets and short landscape screens. Scale
  // the card inversely when that happens so its *physical* text never shrinks
  // below the desktop design size, while the room itself keeps its pixel scale.
  const canvas = ctx.canvas;
  const cssScale = Math.min(
    (canvas?.clientWidth || CANVAS_W) / CANVAS_W,
    (canvas?.clientHeight || CANVAS_H) / CANVAS_H,
  );
  const uiScale = Math.min(1.82, Math.max(1, 1 / Math.max(cssScale, 0.01)));
  const scaled = (value) => value * uiScale;

  ctx.save();
  ctx.lineWidth = uiScale;

  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const panelW = scaled(640);
  const bodyFontSize = scaled(16);
  const lineH = scaled(23);
  const headerH = scaled(70);
  const footerH = scaled(50);
  ctx.font = `${bodyFontSize}px 'Fredoka', 'Inter', system-ui, sans-serif`;
  const lines = wrapLines(ctx, state.mentorDialog.text, panelW - scaled(72));
  const panelH = headerH + lines.length * lineH + footerH;
  const px = CANVAS_W / 2 - panelW / 2;
  const py = top ? mentorDialogTop(uiScale, readableHudUnit(ctx)) : CANVAS_H / 2 - panelH / 2;

  drawRoundedRect(ctx, px + scaled(3), py + scaled(5), panelW, panelH, scaled(20), 'rgba(0,0,0,0.25)', 'transparent');
  drawRoundedRect(ctx, px, py, panelW, panelH, scaled(20), WORLD_ART.panelCream, '#8D6E63');

  // Portrait + name header. Named pixel artwork replaces the OS emoji when a
  // dedicated mentor sprite exists, so room and dialog show the same person.
  const portraitSprite = state.mentorPortraitSprite;
  let nameX = px + scaled(70);
  if (portraitSprite) {
    const frameX = px + scaled(14);
    const frameY = py + scaled(8);
    const frameW = scaled(50);
    const frameH = scaled(54);
    const frameEdge = scaled(3);
    ctx.fillStyle = '#244D32';
    ctx.fillRect(frameX, frameY, frameW, frameH);
    ctx.fillStyle = '#F4C95D';
    ctx.fillRect(
      frameX + frameEdge,
      frameY + frameEdge,
      frameW - frameEdge * 2,
      frameH - frameEdge * 2,
    );
    ctx.fillStyle = '#E8F2D8';
    ctx.fillRect(
      frameX + frameEdge * 2,
      frameY + frameEdge * 2,
      frameW - frameEdge * 4,
      frameH - frameEdge * 4,
    );
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      portraitSprite,
      frameX + scaled(4),
      frameY + scaled(5),
      scaled(42),
      scaled(42),
    );
    ctx.restore();
    nameX = px + scaled(78);
  } else {
    ctx.font = `${scaled(30)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.strings?.mentorPortrait || '👩‍🌾', px + scaled(26), py + scaled(35));
  }
  drawText(ctx, name, nameX, py + scaled(35), {
    font: `bold ${scaled(19)}px 'Fredoka', 'Inter', system-ui, sans-serif`,
    color: WORLD_ART.panelBrown, align: 'left', baseline: 'middle',
  });

  // Body
  let ty = py + headerH + scaled(10);
  for (const line of lines) {
    drawText(ctx, line, px + scaled(38), ty, {
      font: `${bodyFontSize}px 'Fredoka', 'Inter', system-ui, sans-serif`,
      color: WORLD_ART.panelBrownDeep, align: 'left', baseline: 'middle',
    });
    ty += lineH;
  }

  // Continue button — solid pill so it reads as "press me" without reading.
  // Enter, Escape, or a click/tap anywhere dismisses (see IslandRoom handlers).
  const buttonFontSize = scaled(14);
  ctx.font = `bold ${buttonFontSize}px 'Inter', system-ui, sans-serif`;
  const btnText = '⏎ ' + contText;
  const btnW = ctx.measureText(btnText).width + scaled(40);
  const btnH = scaled(34);
  // At the top (phone landscape) Continue sits centred, between the touch ▲ (left) and ✕ (right).
  const bx = top ? px + (panelW - btnW) / 2 : px + panelW - btnW - scaled(24);
  const by = py + panelH - btnH - scaled(12);
  state.mentorDialogLayout = {
    x: px,
    y: py,
    width: panelW,
    height: panelH,
    bodyFontSize,
    lineHeight: lineH,
    lineCount: lines.length,
    top,
    cssScale,
    uiScale,
    physicalBodyFontSize: bodyFontSize * cssScale,
    buttonRect: { x: bx, y: by, width: btnW, height: btnH },
  };
  drawRoundedRect(ctx, bx + scaled(1), by + scaled(3), btnW, btnH, scaled(17), 'rgba(0,0,0,0.2)', 'transparent');
  drawRoundedRect(ctx, bx, by, btnW, btnH, scaled(17), '#66BB6A', '#2E7D32');
  drawText(ctx, btnText, bx + btnW / 2, by + btnH / 2 - 1, {
    font: `bold ${buttonFontSize}px 'Fredoka', 'Inter', system-ui, sans-serif`,
    color: '#fff', align: 'center', baseline: 'middle',
  });
  ctx.restore();
}

// ─── NPC Prompt ──────────────────────────────────────────

export function renderNPCPrompt(ctx, state) {
  if (!state.nearNPC) return;

  const locked = state.nearNPC.locked === true;
  const missionName = state.strings?.missionNames?.[state.nearNPC.id] || state.nearNPC.component;
  const prefix = state.strings?.playPrompt || 'Press Enter or Space to play';
  const text = locked
    ? '🔒 ' + (state.strings?.lockedPrompt || 'Locked')
    : prefix + ': ' + missionName;
  // Locked = neutral grey border; flashes red briefly when Enter is refused
  // (only the first beat of the 1.6s nudge — the rest belongs to the NPC halo).
  const nudge = locked && state.lockedNudge > 0.9;
  const color = locked ? (nudge ? '#E53935' : '#8D8D8D') : (state.islandColor || BRAND.text);

  if (DRAFT_MODE) {
    // Static prompt box, no pulse/bounce
    ctx.font = "bold 14px sans-serif";
    const promptW = Math.max(ctx.measureText(text).width + 40, 280);
    const promptH = 36;
    const px = CANVAS_W / 2 - promptW / 2;
    const py = CANVAS_H - 70;
    // Flat white box with colored border
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(px, py, promptW, promptH);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, promptW, promptH);
    ctx.lineWidth = 1;
    drawText(ctx, text, CANVAS_W / 2, py + promptH / 2, {
      font: "bold 13px sans-serif", color: BRAND.purple,
      align: 'center', baseline: 'middle',
    });
    return;
  }

  // Locked prompt: steady (no inviting pulse); shakes sideways on a refused Enter.
  const pulse = locked ? 1 : 0.9 + Math.sin(state.time * 3) * 0.1;
  const arrowBounce = Math.sin(state.time * 5) * 3;
  const shakeX = nudge ? Math.sin(state.time * 45) * 4 : 0;

  ctx.font = "bold 15px 'Inter', system-ui, sans-serif";
  const promptW = Math.max(ctx.measureText(text).width + 50, 300);
  const promptH = 46;
  const px = CANVAS_W / 2 - promptW / 2 + shakeX;
  const py = CANVAS_H - 75;

  ctx.globalAlpha = pulse;

  // Shadow
  drawRoundedRect(ctx, px + 2, py + 3, promptW, promptH, 16,
    'rgba(0,0,0,0.15)', 'transparent');
  // Main box — border keeps island pillar color for context
  drawRoundedRect(ctx, px, py, promptW, promptH, 16,
    'rgba(255,255,255,0.95)', color);
  // Colored accent (island pillar color)
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(px + 16, py);
  ctx.lineTo(px + promptW - 16, py);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Text (brand chrome purple — readable on white; locked = grey)
  drawText(ctx, text, CANVAS_W / 2 + shakeX, py + promptH / 2 - 2, {
    font: "bold 14px 'Inter', system-ui, sans-serif",
    color: locked ? '#616161' : BRAND.purple,
    align: 'center',
    baseline: 'middle',
  });

  // Bouncing play icon (only when the mission is actually playable)
  if (!locked) {
    drawText(ctx, '\u25B6', CANVAS_W / 2, py + promptH - 6 + arrowBounce, {
      font: '10px sans-serif',
      color,
      align: 'center',
      baseline: 'middle',
    });
  }

  ctx.globalAlpha = 1.0;
}

// ─── Exit Prompt ─────────────────────────────────────────

export function renderExitPrompt(ctx, state) {
  if (!state.onExit) return;

  const text = state.strings?.exitPrompt || 'Press Enter or Space to leave';

  if (DRAFT_MODE) {
    // Static prompt box, no pulse/bounce
    ctx.font = "bold 14px sans-serif";
    const promptW = Math.max(ctx.measureText(text).width + 40, 240);
    const promptH = 36;
    const px = CANVAS_W / 2 - promptW / 2;
    const py = CANVAS_H - 70;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(px, py, promptW, promptH);
    ctx.strokeStyle = BRAND.purple;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, promptW, promptH);
    ctx.lineWidth = 1;
    drawText(ctx, text, CANVAS_W / 2, py + promptH / 2, {
      font: "bold 13px sans-serif", color: BRAND.purple,
      align: 'center', baseline: 'middle',
    });
    return;
  }

  const pulse = 0.9 + Math.sin(state.time * 3) * 0.1;
  const arrowBounce = Math.sin(state.time * 5) * 3;

  ctx.font = "bold 15px 'Inter', system-ui, sans-serif";
  const promptW = Math.max(ctx.measureText(text).width + 50, 260);
  const promptH = 46;
  const px = CANVAS_W / 2 - promptW / 2;
  const py = CANVAS_H - 75;

  ctx.globalAlpha = pulse;

  drawRoundedRect(ctx, px + 2, py + 3, promptW, promptH, 16,
    'rgba(0,0,0,0.15)', 'transparent');
  // Box border — brand UI chrome (BRAND.purple #533F8B = rgb(83,63,139))
  drawRoundedRect(ctx, px, py, promptW, promptH, 16,
    'rgba(255,255,255,0.95)', 'rgba(83,63,139,0.6)');

  drawText(ctx, text, CANVAS_W / 2, py + promptH / 2 - 2, {
    font: "bold 14px 'Inter', system-ui, sans-serif",
    color: BRAND.purple,
    align: 'center',
    baseline: 'middle',
  });

  // Bouncing exit arrow
  drawText(ctx, '\u25BC', CANVAS_W / 2, py + promptH - 6 + arrowBounce, {
    font: '10px sans-serif',
    color: BRAND.purple,
    align: 'center',
    baseline: 'middle',
  });

  ctx.globalAlpha = 1.0;
}

// ─── Room HUD ────────────────────────────────────────────

export function renderRoomHUD(ctx, state, island, points, completedCount, strings, stars = 0) {
  const islandData = ISLANDS[island];
  const color = islandData?.color || BRAND.text;
  // Legacy saves from the 4-mission era can hold [1,2,3,4] — never show "4/3".
  completedCount = Math.min(completedCount, 3);

  if (DRAFT_MODE) {
    // Flat solid bar — brand UI chrome (purple per PDF p.09)
    ctx.fillStyle = BRAND.purple;
    ctx.fillRect(0, 0, CANVAS_W, HUD_HEIGHT);

    // «Back to map» pill (left) — publishes state.exitButtonRect for hit-testing
    const pillRightD = drawExitButton(ctx, state, strings.backToMap || 'Map');

    // Island name (left, after the back pill)
    const HUD_LEFT_D = pillRightD + 12;
    const nameText = strings.islandName || island;
    ctx.font = "bold 15px sans-serif";
    const nameW = ctx.measureText(nameText).width + 20;
    ctx.fillStyle = color;
    ctx.fillRect(HUD_LEFT_D, 4, nameW, HUD_HEIGHT - 8);
    drawText(ctx, nameText, HUD_LEFT_D + nameW / 2, HUD_HEIGHT / 2, {
      font: "bold 15px sans-serif", color: '#fff',
      align: 'center', baseline: 'middle',
    });

    // Progress (center) — permanent gold ★ once the island is complete
    drawText(ctx, completedCount >= 3 ? '★ 3/3' : completedCount + '/3',
      CANVAS_W / 2, HUD_HEIGHT / 2, {
        font: "bold 17px sans-serif",
        color: completedCount >= 3 ? '#FFD54F' : '#fff',
        align: 'center', baseline: 'middle',
      });

    // One shared progression language on map and island: stars | wooden coins.
    drawStatsBadge(ctx, CANVAS_W - 12, HUD_HEIGHT, stars, points);

    // Back hint (static, visible for first 5s) — suppressed by any active prompt
    if (state.time < HINT_VISIBLE_SECONDS - 1 && !hasActiveBottomPrompt(state)) {
      const hintText = strings.backHint || 'ESC to return to map';
      drawText(ctx, hintText, CANVAS_W / 2, CANVAS_H - 24, {
        font: "bold 12px sans-serif", color: 'rgba(255,255,255,0.7)',
        align: 'center', baseline: 'middle',
      });
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

  // Glass-morphism top bar — brand UI chrome (BRAND.purple #533F8B = rgb(83,63,139))
  ctx.fillStyle = 'rgba(83,63,139,0.6)';
  ctx.fillRect(0, 0, W, HUD_HEIGHT);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(0, HUD_HEIGHT - 1, W, 1);

  // ── «Back to map» wooden pill (left) — same style as the world-map Exit
  // pill; publishes state.exitButtonRect for the screen's click/hover test ──
  const pillRight = drawExitButton(ctx, state, strings.backToMap || 'Map');

  // ── Island name with colored badge (left, after the back pill) ──
  const HUD_LEFT = pillRight + 12;
  const nameText = strings.islandName || island;
  ctx.font = "bold 16px 'Inter', system-ui, sans-serif";
  const nameW = ctx.measureText(nameText).width + 24;

  drawRoundedRect(ctx, HUD_LEFT - 1, 6, nameW, HUD_HEIGHT - 10, 14,
    'rgba(0,0,0,0.15)', 'transparent');
  drawRoundedRect(ctx, HUD_LEFT, 5, nameW, HUD_HEIGHT - 10, 14,
    color, 'rgba(255,255,255,0.15)');
  drawText(ctx, nameText, HUD_LEFT + nameW / 2, HUD_HEIGHT / 2, {
    font: "bold 16px 'Inter', system-ui, sans-serif",
    color: '#fff',
    align: 'center',
    baseline: 'middle',
  });

  // ── Progress (center) — permanent gold ★ once complete (badge) ──
  // Gold matches the WorldMap sign convention ('★ 3/3', reward accent).
  const islandDone = completedCount >= 3;
  const progressText = islandDone ? '★ 3/3' : completedCount + '/3';
  drawText(ctx, progressText, W / 2, HUD_HEIGHT / 2, {
    font: "bold 18px 'Inter', system-ui, sans-serif",
    color: islandDone ? '#FFD54F' : '#fff',
    align: 'center',
    baseline: 'middle',
  });

  // ── Shared stars | points badge (right) ──
  drawStatsBadge(ctx, W - 12, HUD_HEIGHT, stars, points);

  // ── Back hint (fades after 5s) — suppressed by any active prompt ──
  if (state.time < HINT_VISIBLE_SECONDS && !hasActiveBottomPrompt(state)) {
    const alpha = state.time < 5 ? 0.8 : Math.max(0, 0.8 * (1 - (state.time - 5)));
    ctx.globalAlpha = alpha;

    const hintText = strings.backHint || 'ESC to return to map';
    const hintW = 240;
    const hintH = 28;
    const hx = W / 2 - hintW / 2;
    const hy = H - 38;

    drawRoundedRect(ctx, hx, hy, hintW, hintH, 14,
      'rgba(0,0,0,0.45)', 'transparent');
    drawText(ctx, hintText, W / 2, hy + hintH / 2, {
      font: "bold 13px 'Inter', system-ui, sans-serif",
      color: '#fff',
      align: 'center',
      baseline: 'middle',
    });

    ctx.globalAlpha = 1.0;
  }
  if (u !== 1) ctx.restore();
  state.exitButtonRect = scaleRectBy(state.exitButtonRect, u);
}

// ─── Island completion ceremony ──────────────
// Two beats, driven by IslandRoom: 'burst' (sparkle rain over the room +
// milestone cue) → 'card' (modal congratulations, Enter/click dismisses once,
// then markCeremonySeen keeps it from ever firing again).

export const CEREMONY_BURST_SECONDS = 1.6;

export function makeCeremonySparkles() {
  const sparkles = [];
  for (let i = 0; i < 44; i++) {
    sparkles.push({
      x: OX + Math.random() * ROOM_COLS * TS,
      y: OY + Math.random() * ROOM_ROWS * TS,
      delay: Math.random() * 1.1,
      dur: 0.6 + Math.random() * 0.5,
      size: 5 + Math.random() * 7,
      gold: Math.random() < 0.7,
    });
  }
  return sparkles;
}

// 4-point sparkle star (same visual language as the games' success sparkles)
function drawSparkleStar(ctx, x, y, r, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function renderCeremony(ctx, state) {
  const c = state.ceremony;
  if (!c || c.phase === 'pending') return;

  // Sparkles twinkle in a loop — they keep raining behind the card too.
  for (const sp of c.sparkles) {
    const local = c.t - sp.delay;
    if (local < 0) continue;
    const cycle = (local % sp.dur) / sp.dur;          // 0→1 repeating
    const pulse = Math.sin(cycle * Math.PI);          // grow then fade
    if (!DRAFT_MODE) {
      drawSparkleStar(ctx, sp.x, sp.y, sp.size * pulse,
        sp.gold ? '#FFD54F' : '#FFFFFF', 0.9 * pulse);
    }
  }

  if (c.phase !== 'card') return;

  const title = state.strings?.ceremonyTitle || '';
  const msg = state.strings?.ceremonyMsg || '';
  const contText = state.strings?.dialogContinue || 'Enter';

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const panelW = 640;
  ctx.font = "18px 'Fredoka', 'Inter', system-ui, sans-serif";
  const lines = wrapLines(ctx, msg, panelW - 80);
  const lineH = 27;
  const panelH = 158 + lines.length * lineH + 64;
  const px = CANVAS_W / 2 - panelW / 2;
  const py = CANVAS_H / 2 - panelH / 2;

  // Pop-in: quick ease-out scale around the panel center
  const cardT = Math.min((c.t - CEREMONY_BURST_SECONDS) / 0.3, 1);
  const scale = DRAFT_MODE ? 1 : 0.85 + 0.15 * (1 - Math.pow(1 - cardT, 3));
  ctx.save();
  ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);

  // Celebration panel — cream like the mentor dialog, gold ceremony border
  drawRoundedRect(ctx, px + 3, py + 6, panelW, panelH, 22, 'rgba(0,0,0,0.3)', 'transparent');
  drawRoundedRect(ctx, px, py, panelW, panelH, 22, WORLD_ART.panelCream, '#F9A825');
  ctx.lineWidth = 1;

  // Big island emblem + gold star header (room.ceremonyIcon, seedling default)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '46px sans-serif';
  ctx.fillText(state.strings?.ceremonyIcon || '🌱', CANVAS_W / 2, py + 52);
  drawSparkleStar(ctx, px + 64, py + 44, 10, '#FFD54F', 0.9);
  drawSparkleStar(ctx, px + panelW - 64, py + 44, 10, '#FFD54F', 0.9);

  drawText(ctx, title, CANVAS_W / 2, py + 108, {
    font: "bold 25px 'Fredoka', 'Inter', system-ui, sans-serif",
    color: WORLD_ART.panelBrown, align: 'center', baseline: 'middle',
  });

  let ty = py + 158;
  for (const line of lines) {
    drawText(ctx, line, CANVAS_W / 2, ty, {
      font: "18px 'Fredoka', 'Inter', system-ui, sans-serif",
      color: WORLD_ART.panelBrownDeep, align: 'center', baseline: 'middle',
    });
    ty += lineH;
  }

  // Continue pill — same affordance as the mentor dialog button
  ctx.font = "bold 14px 'Fredoka', 'Inter', system-ui, sans-serif";
  const btnText = '⏎ ' + contText;
  const btnW = ctx.measureText(btnText).width + 40;
  const btnH = 34;
  const bx = CANVAS_W / 2 - btnW / 2;
  const by = py + panelH - btnH - 18;
  drawRoundedRect(ctx, bx + 1, by + 3, btnW, btnH, 17, 'rgba(0,0,0,0.2)', 'transparent');
  drawRoundedRect(ctx, bx, by, btnW, btnH, 17, '#66BB6A', '#2E7D32');
  drawText(ctx, btnText, bx + btnW / 2, by + btnH / 2 - 1, {
    font: "bold 14px 'Fredoka', 'Inter', system-ui, sans-serif",
    color: '#fff', align: 'center', baseline: 'middle',
  });

  ctx.restore();
}

// ─── Reflection prompt card (Kolb-cycle reflection pilot) ─────────────
// One tap-to-answer question between Practice→Challenge. The partner's
// verbatim question ("Why is this available now?") lives in the island.reflection_*
// i18n keys (partner-internal content → translated, msg.compost_feeds
// precedent). All options are valid — this is reflection, not a quiz; the
// acknowledgment carries the second partner question as a take-away.
// state.reflection = { phase: 'ask'|'ack', selIdx, t }.
export function renderReflectionCard(ctx, state) {
  const r = state.reflection;
  if (!r) return;
  const str = state.strings || {};
  const opts = str.reflectionOpts || [];

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const panelW = 600;
  const optH = 40;
  const optGap = 12;

  ctx.font = "17px 'Fredoka', 'Inter', system-ui, sans-serif";
  const ackLines = r.phase === 'ack' ? wrapLines(ctx, str.reflectionAck || '', panelW - 80) : [];
  const bodyH = r.phase === 'ask'
    ? opts.length * (optH + optGap) + 8
    : ackLines.length * 24 + 16;
  const panelH = 150 + bodyH + 62;
  const px = CANVAS_W / 2 - panelW / 2;
  const py = CANVAS_H / 2 - panelH / 2;

  // Pop-in ease-out, like the ceremony card
  const scale = 0.9 + 0.1 * (1 - Math.pow(1 - Math.min(r.t / 0.25, 1), 3));
  ctx.save();
  ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);

  drawRoundedRect(ctx, px + 3, py + 5, panelW, panelH, 20, 'rgba(0,0,0,0.3)', 'transparent');
  drawRoundedRect(ctx, px, py, panelW, panelH, 20, WORLD_ART.panelCream, WORLD_ART.textGreen);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '38px sans-serif';
  ctx.fillText('🤔', CANVAS_W / 2, py + 44);

  drawText(ctx, str.reflectionTitle || '', CANVAS_W / 2, py + 86, {
    font: "bold 15px 'Fredoka', 'Inter', system-ui, sans-serif",
    color: WORLD_ART.panelBrown, align: 'center', baseline: 'middle',
  });
  drawText(ctx, str.reflectionQ || '', CANVAS_W / 2, py + 116, {
    font: "bold 20px 'Fredoka', 'Inter', system-ui, sans-serif",
    color: WORLD_ART.textGreen, align: 'center', baseline: 'middle',
  });

  let yy = py + 150;
  state.reflectionOptionRects = [];

  if (r.phase === 'ask') {
    opts.forEach((opt, i) => {
      const ow = panelW - 120;
      const ox = CANVAS_W / 2 - ow / 2;
      const sel = i === r.selIdx;
      drawRoundedRect(ctx, ox, yy, ow, optH, 12,
        sel ? 'rgba(102,187,106,0.25)' : 'rgba(255,255,255,0.8)',
        sel ? WORLD_ART.buttonGreen : 'rgba(0,0,0,0.12)');
      drawText(ctx, (sel ? '▶ ' : '') + opt, CANVAS_W / 2, yy + optH / 2, {
        font: `${sel ? 'bold ' : ''}15px 'Fredoka', 'Inter', system-ui, sans-serif`,
        color: sel ? WORLD_ART.textGreen : WORLD_ART.panelBrown,
        align: 'center', baseline: 'middle',
      });
      state.reflectionOptionRects.push({ x: ox, y: yy, w: ow, h: optH, idx: i });
      yy += optH + optGap;
    });
    drawText(ctx, '↑ ↓  ·  Enter/Space', CANVAS_W / 2, py + panelH - 26, {
      font: "12px 'Fredoka', 'Inter', system-ui, sans-serif",
      color: 'rgba(93,64,55,0.55)', align: 'center', baseline: 'middle',
    });
  } else {
    for (const ln of ackLines) {
      drawText(ctx, ln, CANVAS_W / 2, yy + 12, {
        font: "17px 'Fredoka', 'Inter', system-ui, sans-serif",
        color: WORLD_ART.panelBrownDeep, align: 'center', baseline: 'middle',
      });
      yy += 24;
    }
    // Continue pill — same affordance as ceremony/mentor dialog
    ctx.font = "bold 14px 'Fredoka', 'Inter', system-ui, sans-serif";
    const btnText = '⏎ ' + (str.dialogContinue || 'Enter');
    const btnW = ctx.measureText(btnText).width + 40;
    const bx = CANVAS_W / 2 - btnW / 2;
    const by = py + panelH - 34 - 18;
    drawRoundedRect(ctx, bx + 1, by + 3, btnW, 34, 17, 'rgba(0,0,0,0.2)', 'transparent');
    drawRoundedRect(ctx, bx, by, btnW, 34, 17, '#66BB6A', '#2E7D32');
    drawText(ctx, btnText, bx + btnW / 2, by + 16, {
      font: "bold 14px 'Fredoka', 'Inter', system-ui, sans-serif",
      color: '#fff', align: 'center', baseline: 'middle',
    });
  }

  ctx.restore();
}
