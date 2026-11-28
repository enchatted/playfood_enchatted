// Game room renderer — rendering functions for walk-around mini-game rooms.
// Mirrors islandRoomRenderer.js structure; same OX/OY centering on the 1280×704 canvas.
//
// Render order (called by game components):
//   background → tiles → kitchen wall → fridge → decorations → counter items →
//   floor items → fridge shelves → ghost preview → player + held item →
//   throw arc → particles → floating texts → reject X → prompt → iris wipe

import {
  TILE_SIZE as TS, MOVE_DURATION, CANVAS_W, CANVAS_H,
} from '../../overworld/overworldData.js';
import { TILE } from '../../overworld/tileAtlas.js';
import { drawRoundedRect, drawText, fitFontPx, lerp } from '../../utils/canvas.js';
import { WORLD_ART } from '../../styles/brandColors.js';
import { drawItemSurface } from './itemSurface.js';
import { playSound } from '../../utils/sound.js';
import { DRAFT_MODE } from '../../config/draftMode.js';
import { drawItemGlyph } from './itemGlyphs.js';

const ROOM_COLS = 20;
const ROOM_ROWS = 15;

// Room offset — centers the 640×480 room on the 1280×704 canvas
const OX = (CANVAS_W - ROOM_COLS * TS) / 2;  // 320
const OY = (CANVAS_H - ROOM_ROWS * TS) / 2;  // 112

export { OX, OY, ROOM_COLS, ROOM_ROWS };

// ─── Room Camera ──────────────────────────────────
// Single shared 1.5× zoom for every walk-around game, so all rooms read at
// the same visual tile size. Pattern generalized from FridgeManager:
//   applyRoomCamera → world rendering → releaseRoomCamera → HUD drawing.
// Anything that must land at canvas coords while the camera is off
// (iris wipe center, HUD anchored to a world entity) goes through roomToCanvas.

export const ROOM_ZOOM = 1.5;

// Focus defaults to the exact room center, which coincides with the canvas
// center. A room can shift the view (e.g. to favor its bottom rows) by
// declaring cameraFocus: { col, row } in its GAME_ROOMS entry.
export function getRoomFocus(room) {
  const f = room?.cameraFocus || { col: ROOM_COLS / 2, row: ROOM_ROWS / 2 };
  return { x: OX + f.col * TS, y: OY + f.row * TS };
}

export function applyRoomCamera(ctx, room) {
  const focus = getRoomFocus(room);
  ctx.save();
  ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
  ctx.scale(ROOM_ZOOM, ROOM_ZOOM);
  ctx.translate(-focus.x, -focus.y);
}

export function releaseRoomCamera(ctx) {
  ctx.restore();
}

export function roomToCanvas(room, x, y) {
  const focus = getRoomFocus(room);
  return {
    x: CANVAS_W / 2 + ROOM_ZOOM * (x - focus.x),
    y: CANVAS_H / 2 + ROOM_ZOOM * (y - focus.y),
  };
}

// Tiles to skip in tile pass (drawn as unified fridge overlay instead)
const FRIDGE_TILE_IDS = new Set([TILE.FRIDGE, TILE.FRIDGE_DOOR]);

// Deterministic variant index (same as overworld/island renderers)
function variantIndex(col, row, count) {
  return ((col * 7 + row * 13 + col * row) & 0x7FFFFFFF) % count;
}

// ─── Background ──────────────────────────────────────────

export function renderGameRoomBackground(ctx) {
  // Warm kitchen backdrop (instead of dark navy)
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bg.addColorStop(0, '#D7CCC8');
  bg.addColorStop(1, '#BCAAA4');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

// ─── Room Tiles ──────────────────────────────────────────
// Skips FRIDGE/FRIDGE_DOOR tiles (renders floor underneath).
// The unified fridge is drawn separately by renderFridge().

export function renderGameRoomTiles(ctx, roomMap, atlas) {
  for (let row = 0; row < ROOM_ROWS; row++) {
    for (let col = 0; col < ROOM_COLS; col++) {
      let tileId = roomMap[row][col];
      const dx = OX + col * TS;
      const dy = OY + row * TS;

      // Render wood floor under fridge tiles (drawn as overlay later)
      if (FRIDGE_TILE_IDS.has(tileId)) tileId = TILE.FLOOR_WOOD;

      const variants = atlas.tiles[tileId];
      if (variants) {
        const idx = variantIndex(col, row, variants.length);
        ctx.drawImage(variants[idx], dx, dy);
      }
    }
  }
}

// ─── Kitchen Wall ─────────────────────────────────────────
// Draws cabinets and a large window over the top wall row (row 0).

export function renderKitchenWall(ctx) {
  const wallY = OY;

  if (DRAFT_MODE) {
    // Flat brown wall with grid
    for (let c = 0; c < 20; c++) {
      const cx = OX + c * TS;
      ctx.fillStyle = '#A1887F';
      ctx.fillRect(cx, wallY, TS, TS);
      ctx.strokeStyle = '#795548';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, wallY, TS, TS);
    }
    // Simple window area
    const winX = OX + 6 * TS;
    const winW = 8 * TS;
    ctx.fillStyle = '#B3E5FC';
    ctx.fillRect(winX + 2, wallY + 2, winW - 4, TS - 4);
    ctx.strokeStyle = '#5D4037';
    ctx.lineWidth = 2;
    ctx.strokeRect(winX + 2, wallY + 2, winW - 4, TS - 4);
    return;
  }

  // ── Upper kitchen cabinets (cols 1-5 left, cols 14-18 right) ──
  const cabinetRanges = [[1, 5], [14, 18]];
  for (const [startC, endC] of cabinetRanges) {
    for (let c = startC; c <= endC; c++) {
      const cx = OX + c * TS;

      // Cabinet body (warm wood gradient)
      const cabGrad = ctx.createLinearGradient(cx, wallY, cx, wallY + TS);
      cabGrad.addColorStop(0, '#8D6E63');
      cabGrad.addColorStop(0.3, '#A1887F');
      cabGrad.addColorStop(0.7, '#8D6E63');
      cabGrad.addColorStop(1, '#6D4C41');
      drawRoundedRect(ctx, cx + 1, wallY + 2, TS - 2, TS - 4, 3, cabGrad, '#5D4037');

      // Inner panel (inset shadow)
      drawRoundedRect(ctx, cx + 4, wallY + 5, TS - 8, TS - 10, 2,
        'rgba(0,0,0,0.08)', null);

      // Gold knob
      ctx.fillStyle = '#FFD54F';
      ctx.beginPath();
      ctx.arc(cx + TS / 2, wallY + TS / 2 + 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFC107';
      ctx.beginPath();
      ctx.arc(cx + TS / 2, wallY + TS / 2 + 4, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Large kitchen window (cols 6-13, 8 tiles = 256px) ──
  const winX = OX + 6 * TS;
  const winW = 8 * TS;

  // Wooden frame
  drawRoundedRect(ctx, winX, wallY + 1, winW, TS - 2, 4, '#5D4037', '#4E342E');

  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, wallY + 3, 0, wallY + TS - 3);
  skyGrad.addColorStop(0, '#81D4FA');
  skyGrad.addColorStop(0.5, '#B3E5FC');
  skyGrad.addColorStop(1, '#E1F5FE');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(winX + 3, wallY + 3, winW - 6, TS - 6);

  // Window cross-bars
  ctx.strokeStyle = '#5D4037';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(winX + winW / 2, wallY + 2);
  ctx.lineTo(winX + winW / 2, wallY + TS - 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(winX + 3, wallY + TS / 2);
  ctx.lineTo(winX + winW - 3, wallY + TS / 2);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Tree silhouettes through window
  ctx.fillStyle = 'rgba(46,125,50,0.45)';
  const trees = [30, 75, 128, 180, 225];
  for (const tx of trees) {
    const ty = wallY + TS - 8;
    ctx.beginPath();
    ctx.moveTo(winX + tx, ty - 10);
    ctx.lineTo(winX + tx - 8, ty);
    ctx.lineTo(winX + tx + 8, ty);
    ctx.closePath();
    ctx.fill();
  }

  // Sun
  ctx.fillStyle = 'rgba(255,235,59,0.55)';
  ctx.beginPath();
  ctx.arc(winX + winW - 30, wallY + 10, 6, 0, Math.PI * 2);
  ctx.fill();

  // Window sill (wooden ledge)
  ctx.fillStyle = '#795548';
  ctx.fillRect(winX - 2, wallY + TS - 3, winW + 4, 3);
}

// ─── Unified Fridge ──────────────────────────────────────
// Draws a solid 3D fridge spanning 2×N tiles.

export function renderFridge(ctx, fridgeCols, fridgeRows) {
  const startCol = fridgeCols[0];
  const startRow = fridgeRows[0];
  const fx = OX + startCol * TS;
  const fy = OY + startRow * TS;
  const fw = fridgeCols.length * TS;  // 64
  const fh = fridgeRows.length * TS;  // 96

  if (DRAFT_MODE) {
    // Simple white rectangle with label
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeStyle = '#757575';
    ctx.lineWidth = 2;
    ctx.strokeRect(fx, fy, fw, fh);
    drawText(ctx, 'FRIDGE', fx + fw / 2, fy + fh / 2, {
      font: "bold 11px sans-serif", color: '#424242',
      align: 'center', baseline: 'middle',
    });
    return;
  }

  // ── Rug under fridge (warm accent on floor) ──
  const rugX = fx - 8;
  const rugY = fy + fh + 2;
  const rugW = fw + 16;
  const rugH = 18;
  const rugGrad = ctx.createLinearGradient(rugX, rugY, rugX + rugW, rugY);
  rugGrad.addColorStop(0, '#8D6E63');
  rugGrad.addColorStop(0.2, '#A1887F');
  rugGrad.addColorStop(0.5, '#BCAAA4');
  rugGrad.addColorStop(0.8, '#A1887F');
  rugGrad.addColorStop(1, '#8D6E63');
  drawRoundedRect(ctx, rugX, rugY, rugW, rugH, 4, rugGrad, null);
  // Rug fringe lines
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const lx = rugX + 6 + i * (rugW - 12) / 3;
    ctx.beginPath();
    ctx.moveTo(lx, rugY + 2);
    ctx.lineTo(lx, rugY + rugH - 2);
    ctx.stroke();
  }

  // ── 3D Drop shadow (offset right + down) ──
  drawRoundedRect(ctx, fx + 5, fy + 5, fw, fh, 5, 'rgba(0,0,0,0.3)', null);

  // ── Side panel (3D depth — left edge visible) ──
  ctx.fillStyle = '#999';
  ctx.fillRect(fx - 3, fy + 2, 4, fh - 2);

  // ── Metallic body ──
  const bodyGrad = ctx.createLinearGradient(fx, fy, fx + fw, fy);
  bodyGrad.addColorStop(0, '#D0D0D0');
  bodyGrad.addColorStop(0.12, '#E8E8E8');
  bodyGrad.addColorStop(0.5, '#F5F5F5');
  bodyGrad.addColorStop(0.88, '#E4E4E4');
  bodyGrad.addColorStop(1, '#B0B0B0');
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, fx, fy, fw, fh, 5, bodyGrad, '#888');
  ctx.lineWidth = 1;

  // ── Interior panel (inset) ──
  const interiorGrad = ctx.createLinearGradient(0, fy, 0, fy + fh);
  interiorGrad.addColorStop(0, '#FAFAFA');
  interiorGrad.addColorStop(0.5, '#F0F0F0');
  interiorGrad.addColorStop(1, '#E8E8E8');
  ctx.fillStyle = interiorGrad;
  ctx.fillRect(fx + 4, fy + 4, fw - 8, fh - 8);

  // Cool blue glow (interior top)
  const glow = ctx.createLinearGradient(0, fy + 4, 0, fy + 24);
  glow.addColorStop(0, 'rgba(100,181,246,0.2)');
  glow.addColorStop(1, 'rgba(100,181,246,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(fx + 4, fy + 4, fw - 8, 20);

  // ── Horizontal shelf dividers (evenly spaced, first is door seam) ──
  const sectionH = fh / 4;
  for (let r = 1; r <= 3; r++) {
    const sy = fy + r * sectionH;
    if (r === 1) {
      // Door seam (freezer/fridge boundary — heavier)
      ctx.strokeStyle = '#AAAAAA';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'rgba(144,202,249,0.2)';
      ctx.lineWidth = 1;
    }
    ctx.beginPath();
    ctx.moveTo(fx + 5, sy);
    ctx.lineTo(fx + fw - 5, sy);
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  // ── Vertical center divider ──
  ctx.strokeStyle = 'rgba(144,202,249,0.25)';
  ctx.beginPath();
  ctx.moveTo(fx + TS, fy + 6);
  ctx.lineTo(fx + TS, fy + fh - 6);
  ctx.stroke();

  // ── Handle (right side, tall for 2×3 fridge) ──
  const hx = fx + fw - 7;
  const hy = fy + fh / 2 - 14;
  drawRoundedRect(ctx, hx, hy, 4, 28, 2, '#B0B0B0', '#888');
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(hx + 1, hy + 2, 1, 24);

  // ── Top highlight (3D shine) ──
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(fx + 6, fy + 1, fw - 12, 2);
}

// ─── Room Decorations ───────────────────────────────────
// Emoji props on wall/floor tiles (windows, plants, etc.)

export function renderGameRoomDecorations(ctx, room) {
  if (!room.decorations) return;

  for (const d of room.decorations) {
    const x = OX + d.col * TS + TS / 2;
    const y = OY + d.row * TS + TS / 2;

    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.emoji, x, y);
  }
}

// ─── Player ──────────────────────────────────────────────

export function renderGameRoomPlayer(ctx, state, atlas) {
  const p = state.player;
  const sx = state.screenShake || 0;
  const px = OX + p.pixelX + sx;
  const py = OY + p.pixelY;

  const walkFrame = p.moving ? (Math.floor(state.time / 0.12) % 2) : 0;

  let bounceY = 0;
  if (p.moving) {
    const progress = p.moveTimer / MOVE_DURATION;
    bounceY = -Math.sin(progress * Math.PI) * 3;
  } else {
    bounceY = Math.sin(state.time * 2) * 0.5;
  }

  // Shadow under player
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(px + TS / 2, py + TS - 2, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const sprite = atlas.player[p.dir]?.[walkFrame];
  if (sprite) {
    ctx.drawImage(sprite, Math.round(px), Math.round(py + bounceY));
  }
}

// ─── Counter Items ───────────────────────────────────────
// Food emoji + days-to-expire badge + expiration sparkle on counter tiles.
// Red pulse ≤2 days, yellow pulse ≤5 days, stable >5 days.

export function renderCounterItems(ctx, state) {
  if (!state.counterItems) return;

  for (const item of state.counterItems) {
    if (item.picked) continue;

    const x = OX + item.col * TS + TS / 2;
    const y = OY + item.row * TS + TS / 2;
    // Themed counter pedestal under each item (shared surface) — the expiry glow + emoji
    // draw on top so the "about to spoil" signal still reads as an aura around the item.
    drawItemSurface(ctx, x, y, 'counter', { time: state.time });
    // Only expiry-based games (e.g. MealPlanner) carry daysToExpire. Storage games
    // like FridgeManager don't — skip the glow + days badge so we never render
    // "undefined". Emoji always draws.
    const hasExpiry = typeof item.daysToExpire === 'number';

    // Expiration sparkle glow
    if (hasExpiry && item.daysToExpire <= 2) {
      const pulse = 0.4 + Math.sin(state.time * 8) * 0.3;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#FF1744';
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (hasExpiry && item.daysToExpire <= 5) {
      const pulse = 0.3 + Math.sin(state.time * 5) * 0.2;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#FFD600';
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Food emoji
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.emoji, x, hasExpiry ? y - 2 : y);

    // Days badge (expiry games only)
    if (hasExpiry) {
      const badgeText = item.daysToExpire + 'd';
      ctx.font = "bold 9px 'Inter', system-ui, sans-serif";
      const badgeW = ctx.measureText(badgeText).width + 6;
      const badgeColor = item.daysToExpire <= 2 ? '#FF1744'
        : item.daysToExpire <= 5 ? '#FF9100' : '#4CAF50';

      drawRoundedRect(ctx, x - badgeW / 2, y + 8, badgeW, 13, 4, badgeColor, null);
      drawText(ctx, badgeText, x, y + 14, {
        font: "bold 9px 'Inter', system-ui, sans-serif",
        color: '#fff',
        align: 'center',
        baseline: 'middle',
      });
    }
  }
}

// ─── Fridge Shelves ──────────────────────────────────────
// 8 shelf slots in a 2×4 grid (2 columns × 4 rows) inside the 2×3 fridge.
// Fridge body starts at col 9, row 1 (64×96px area).

const FRIDGE_START_COL = 9;
const FRIDGE_START_ROW = 1;
const FRIDGE_HEIGHT_TILES = 3;

export function shelfPosition(slotIdx) {
  const col = slotIdx % 2;            // 0 or 1
  const row = Math.floor(slotIdx / 2); // 0-3
  const fh = FRIDGE_HEIGHT_TILES * TS; // 96
  const sectionH = fh / 4;            // 24px per section
  return {
    x: OX + (FRIDGE_START_COL + col) * TS + TS / 2,
    y: OY + FRIDGE_START_ROW * TS + sectionH / 2 + row * sectionH,
  };
}

export function renderFridgeShelves(ctx, state) {
  const shelves = state.fridgeShelves;
  if (!shelves) return;

  for (let i = 0; i < shelves.length; i++) {
    const { x, y } = shelfPosition(i);

    if (shelves[i]) {
      // Placed item (larger emoji for 2×3 fridge)
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(shelves[i].emoji, x + 2, y);

      // Correct badge (green dot after reveal)
      if (shelves[i].correct) {
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(x + 14, y - 5, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Slot number (small, to the left)
      drawText(ctx, String(i + 1), x - 14, y, {
        font: "bold 8px 'Inter', system-ui, sans-serif",
        color: 'rgba(0,0,0,0.25)',
        align: 'center',
        baseline: 'middle',
      });
    } else {
      // Empty slot — dashed outline + number
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#90CAF9';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(x - 12, y - 8, 24, 16);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      drawText(ctx, String(i + 1), x, y, {
        font: "bold 10px 'Inter', system-ui, sans-serif",
        color: 'rgba(0,0,0,0.2)',
        align: 'center',
        baseline: 'middle',
      });
    }
  }
}

// ─── Held Item (Zelda carry) ─────────────────────────────
// Emoji 6px above player head with sin bob while walking.

export function renderHeldItem(ctx, state) {
  if (!state.heldItem) return;

  const p = state.player;
  const px = OX + p.pixelX + TS / 2;
  const py = OY + p.pixelY;

  // Zelda bounce: -6 base + sin bob
  const bobY = -6 + Math.sin(state.time * 6) * 2;

  ctx.textAlign = 'center';
  drawItemGlyph(ctx, state.heldItem, px, py + bobY, 18, 'bottom');
}

// ─── Ghost Preview ───────────────────────────────────────
// Semi-transparent preview on target fridge shelf when player holds item.

export function renderGhostPreview(ctx, state) {
  if (!state.heldItem || state.ghostTarget == null) return;

  const { x, y } = shelfPosition(state.ghostTarget);

  // Pulsing alpha
  const alpha = 0.25 + Math.sin(state.time * 4) * 0.15;
  ctx.globalAlpha = alpha;

  // Ghost emoji
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.heldItem.emoji, x, y);

  // Highlight ring
  ctx.strokeStyle = '#64B5F6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

// ─── Throw Arc ───────────────────────────────────────────
// Parabolic arc: y = lerp(from,to,t) - arcHeight * sin(PI * t)
// Item spins during flight (full 360° rotation).

export function renderThrowArc(ctx, state) {
  if (!state.throwing) return;

  const { fromX, fromY, toX, toY, progress, item } = state.throwing;
  const t = progress;

  const currentX = OX + lerp(fromX, toX, t);
  const groundY = OY + lerp(fromY, toY, t);
  const arcHeight = 40;
  const currentY = groundY - arcHeight * Math.sin(Math.PI * t);

  // Shadow on ground
  ctx.globalAlpha = 0.15 * (1 - t * 0.5);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(currentX, groundY + TS / 2, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Spinning item
  ctx.save();
  ctx.translate(currentX, currentY);
  ctx.rotate(t * Math.PI * 2);
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(item.emoji, 0, 0);
  ctx.restore();
}

// ─── Floor Items (bounced back) ──────────────────────────
// Items that bounced off fridge due to wrong order, sitting on floor.

export function renderFloorItems(ctx, state) {
  if (!state.floorItems || state.floorItems.length === 0) return;

  for (const item of state.floorItems) {
    const x = OX + item.col * TS + TS / 2;
    const y = OY + item.row * TS + TS / 2;

    // Shadow
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Food emoji (or a drawn icon where no faithful emoji exists — itemGlyphs.js)
    ctx.textAlign = 'center';
    drawItemGlyph(ctx, item, x, y, 18, 'middle');

    // Days badge (only for items with expiration — FridgeManager)
    if (item.daysToExpire != null) {
      const badgeText = item.daysToExpire + 'd';
      ctx.font = "bold 8px 'Inter', system-ui, sans-serif";
      const badgeW = ctx.measureText(badgeText).width + 6;
      const badgeColor = item.daysToExpire <= 2 ? '#FF1744'
        : item.daysToExpire <= 5 ? '#FF9100' : '#4CAF50';

      drawRoundedRect(ctx, x - badgeW / 2, y + 10, badgeW, 11, 3, badgeColor, null);
      drawText(ctx, badgeText, x, y + 15, {
        font: "bold 8px 'Inter', system-ui, sans-serif",
        color: '#fff',
        align: 'center',
        baseline: 'middle',
      });
    }
  }
}

// ─── Exit Door ──────────────────────────────────────────
// Draws a supermarket exit doorway on the bottom wall (cols 9-10, row 14).

export function renderExitSign(ctx) {
  // Hanging "ΕΞΟΔΟΣ" sign above the exit corridor. Placed at row ~11.75 (not the
  // bottom wall) so it sits between the cashier registers and the basket-strip
  // HUD without being occluded by the bottom-of-canvas bag bar after zoom.
  const signW = 80;
  const signH = 18;
  const cx = OX + 10 * TS; // center of room
  const signY = OY + 11.75 * TS;

  // Hanging wires
  ctx.strokeStyle = '#546E7A';
  ctx.lineWidth = 1;
  for (const sx of [cx - signW / 2 + 6, cx + signW / 2 - 6]) {
    ctx.beginPath();
    ctx.moveTo(sx, signY - 10);
    ctx.lineTo(sx, signY);
    ctx.stroke();
  }

  // Green sign background
  const signGrad = ctx.createLinearGradient(0, signY, 0, signY + signH);
  signGrad.addColorStop(0, '#2E7D32');
  signGrad.addColorStop(1, '#1B5E20');
  ctx.fillStyle = signGrad;
  drawRoundedRect(ctx, cx - signW / 2, signY, signW, signH, 3, signGrad, '#1B5E20');

  // Sign text
  drawText(ctx, '\u0395\u039E\u039F\u0394\u039F\u03A3', cx, signY + signH / 2, {
    font: "bold 10px 'Inter', system-ui, sans-serif",
    color: '#E8F5E9',
    align: 'center',
    baseline: 'middle',
  });

  // Subtle glow around sign
  ctx.fillStyle = 'rgba(102,187,106,0.08)';
  ctx.fillRect(cx - signW / 2 - 4, signY - 2, signW + 8, signH + 4);
}

// ─── Shopper NPCs ───────────────────────────────────────
// Pixel-art characters at checkout lanes: cashiers behind registers + customers.

// NPC color palettes (shirt, hair, cap — same body structure as player)
export const NPC_PALETTES = [
  { shirt: '#E91E63', shirtHi: '#F06292', hair: '#3E2723', cap: '#AD1457', capDk: '#880E4F' },
  { shirt: '#FF9800', shirtHi: '#FFB74D', hair: '#212121', cap: '#E65100', capDk: '#BF360C' },
  { shirt: '#9C27B0', shirtHi: '#BA68C8', hair: '#4E342E', cap: '#6A1B9A', capDk: '#4A148C' },
  { shirt: '#00BCD4', shirtHi: '#4DD0E1', hair: '#5D4037', cap: '#00838F', capDk: '#006064' },
  { shirt: '#FF5722', shirtHi: '#FF8A65', hair: '#1B5E20', cap: '#D84315', capDk: '#BF360C' },
  { shirt: '#607D8B', shirtHi: '#90A4AE', hair: '#33691E', cap: '#455A64', capDk: '#37474F' },
];

/** Draw a mini pixel character (same style as player) at canvas pos (cx, cy). */
export function drawNPCSprite(ctx, cx, cy, palette, dir, walkFrame, time) {
  const step = walkFrame === 0 ? 2 : -2;
  const armSwing = walkFrame === 0 ? -2 : 2;
  const isDown = dir === 0;
  const isUp = dir === 1;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(cx + 16, cy + 30, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#5D4037';
  ctx.fillRect(cx + 10 + step, cy + 24, 5, 5);
  ctx.fillRect(cx + 17 - step, cy + 24, 5, 5);

  // Shoes
  ctx.fillStyle = '#795548';
  ctx.fillRect(cx + 9 + step, cy + 28, 6, 3);
  ctx.fillRect(cx + 16 - step, cy + 28, 6, 3);

  // Body / Shirt
  ctx.fillStyle = palette.shirt;
  ctx.fillRect(cx + 9, cy + 14, 14, 10);
  ctx.fillStyle = palette.shirtHi;
  ctx.fillRect(cx + 10, cy + 14, 6, 3);

  // Arms
  ctx.fillStyle = '#FFCC80';
  if (isDown) {
    ctx.fillRect(cx + 6, cy + 15 + armSwing, 3, 7);
    ctx.fillRect(cx + 23, cy + 15 - armSwing, 3, 7);
  } else {
    ctx.fillRect(cx + 6, cy + 15 - armSwing, 3, 7);
    ctx.fillRect(cx + 23, cy + 15 + armSwing, 3, 7);
  }

  // Head
  ctx.fillStyle = '#FFCC80';
  ctx.beginPath();
  ctx.roundRect(cx + 10, cy + 4, 12, 11, 3);
  ctx.fill();

  // Hair
  ctx.fillStyle = palette.hair;
  ctx.fillRect(cx + 9, cy + 3, 14, 5);
  if (isDown) {
    ctx.fillRect(cx + 9, cy + 3, 3, 7);
    ctx.fillRect(cx + 20, cy + 3, 3, 7);
  }

  // Cap
  ctx.fillStyle = palette.cap;
  ctx.fillRect(cx + 8, cy + 2, 16, 4);
  ctx.fillStyle = palette.capDk;
  ctx.fillRect(cx + 8, cy + 4, 16, 2);
  if (isDown) {
    ctx.fillRect(cx + 7, cy + 5, 18, 2);
  }

  // Face (only when facing down)
  if (isDown) {
    ctx.fillStyle = '#333';
    ctx.fillRect(cx + 12, cy + 8, 2, 2);
    ctx.fillRect(cx + 18, cy + 8, 2, 2);
    ctx.fillStyle = '#E57373';
    ctx.fillRect(cx + 14, cy + 11, 4, 2);
  }
}

/** Draw a small shopping cart at canvas pos */
function drawMiniCart(ctx, cx, cy, time) {
  // Cart body
  ctx.fillStyle = '#9E9E9E';
  ctx.fillRect(cx + 8, cy + 14, 16, 10);
  ctx.fillStyle = '#BDBDBD';
  ctx.fillRect(cx + 9, cy + 15, 14, 8);
  // Cart handle
  ctx.fillStyle = '#757575';
  ctx.fillRect(cx + 6, cy + 10, 2, 8);
  // Wheels
  ctx.fillStyle = '#424242';
  ctx.beginPath();
  ctx.arc(cx + 11, cy + 26, 2, 0, Math.PI * 2);
  ctx.arc(cx + 21, cy + 26, 2, 0, Math.PI * 2);
  ctx.fill();
  // Items inside cart (colored blocks)
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(cx + 10, cy + 16, 5, 4);
  ctx.fillStyle = '#FF9800';
  ctx.fillRect(cx + 16, cy + 16, 5, 4);
  ctx.fillStyle = '#F44336';
  ctx.fillRect(cx + 12, cy + 20, 6, 3);
}

export function renderShopperNPCs(ctx, state) {
  if (!state.shopperNPCs) return;

  // Render cashiers first (behind registers, static, facing down toward customers)
  for (const cashier of state.shopperNPCs.cashiers) {
    const cx = OX + cashier.col * TS;
    const cy = OY + cashier.row * TS;
    const isChecking = Array.isArray(state.checkoutQueue)
      && state.activeCheckoutCol === cashier.col;
    const checkingFrame = isChecking ? Math.floor(state.time * 5) % 2 : 0;
    drawNPCSprite(ctx, cx, cy, cashier.palette, 0, checkingFrame, state.time);
  }

  // Render customers (animated, walking DOWN from fridge area to checkout, then exit)
  for (const cust of state.shopperNPCs.customers) {
    const cx = OX + cust.x;
    const cy = OY + cust.y;
    const walkFrame = cust.phase === 'paying' ? 0 : (Math.floor(state.time / 0.2 + cust.lane) % 2);

    // Always facing down (walking toward checkout / exit)
    const dir = 0;

    // Cart in front (below) when approaching, shopping bag when leaving
    if (cust.phase === 'approaching') {
      drawMiniCart(ctx, cx, cy + TS * 0.7, state.time);
    }

    // Customer sprite
    drawNPCSprite(ctx, cx, cy, cust.palette, dir, walkFrame, state.time);

    // Shopping bag when leaving (no cart — already paid)
    if (cust.phase === 'leaving') {
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛍️', cx + 25, cy + 18);
    }
  }
}

export function updateShopperNPCs(state, dt) {
  if (!state.shopperNPCs) return;

  for (const cust of state.shopperNPCs.customers) {
    switch (cust.phase) {
      case 'approaching':
        // Walk DOWN from top toward register
        cust.y += cust.speed * dt;
        if (cust.y >= cust.registerY) {
          cust.y = cust.registerY;
          cust.phase = 'paying';
          cust.waitTimer = 0;
        }
        break;
      case 'paying':
        cust.waitTimer += dt;
        if (cust.waitTimer >= cust.waitDuration) {
          cust.phase = 'leaving';
        }
        break;
      case 'leaving':
        // Walk DOWN toward exit door and off-screen
        cust.y += cust.speed * dt;
        if (cust.y > 15 * TS) {
          respawnCustomer(cust);
        }
        break;
    }
  }
}

function respawnCustomer(cust) {
  // Spawn anywhere from top wall (row 1) to counter area (row 4)
  cust.y = (1 + Math.random() * 3) * TS;
  cust.phase = 'approaching';
  cust.waitDuration = 2 + Math.random() * 3;
  cust.waitTimer = 0;
  cust.palette = NPC_PALETTES[Math.floor(Math.random() * NPC_PALETTES.length)];
  cust.speed = 18 + Math.random() * 14;
}

export function initShopperNPCs() {
  // 3 checkout lanes — register counters at col 3, 8, 13 row 10-11
  // Cashiers stand AT registers (row 10), customers come from top and walk DOWN
  const lanes = [
    { col: 3,  cashierRow: 10, customerCol: 4 },
    { col: 8,  cashierRow: 10, customerCol: 9 },
    { col: 13, cashierRow: 10, customerCol: 14 },
  ];

  const cashiers = lanes.map((lane, i) => ({
    col: lane.col,
    row: lane.cashierRow,
    palette: NPC_PALETTES[i],
  }));

  // Customers spawn at counter height (row 3-5), walk DOWN through player zone → checkout
  const customers = lanes.map((lane, i) => ({
    lane: i,
    x: lane.customerCol * TS,
    y: (1 + i * 1.5) * TS, // staggered: row 1, 2.5, 4
    registerY: 9 * TS, // stop at row 9 (one row above registers, in front of cashier)
    speed: 20 + i * 4,
    phase: 'approaching',
    palette: NPC_PALETTES[3 + i],
    waitDuration: 2 + i * 0.5,
    waitTimer: 0,
  }));

  return { cashiers, customers };
}

// ─── Action Prompt ───────────────────────────────────────
// Context-sensitive prompt bar at bottom of screen.

export function renderActionPrompt(ctx, state) {
  if (!state.actionPrompt) return;

  const text = state.actionPrompt;
  const pulse = 0.9 + Math.sin(state.time * 3) * 0.1;

  ctx.font = "bold 14px 'Inter', system-ui, sans-serif";
  // +64 keeps the centred text clear of the ↵ glyph drawn 22px from the right edge.
  const promptW = Math.max(ctx.measureText(text).width + 64, 250);
  const promptH = 40;
  const px = CANVAS_W / 2 - promptW / 2;
  const py = CANVAS_H - 65;

  ctx.globalAlpha = pulse;

  // Shadow
  drawRoundedRect(ctx, px + 2, py + 3, promptW, promptH, 14,
    'rgba(0,0,0,0.2)', 'transparent');
  // Main box
  drawRoundedRect(ctx, px, py, promptW, promptH, 14,
    'rgba(255,255,255,0.92)', '#4CAF50');

  drawText(ctx, text, CANVAS_W / 2, py + promptH / 2, {
    font: "bold 14px 'Inter', system-ui, sans-serif",
    color: '#1A237E',
    align: 'center',
    baseline: 'middle',
  });

  // Bouncing Enter icon
  const bounce = Math.sin(state.time * 5) * 3;
  drawText(ctx, '\u21B5', CANVAS_W / 2 + promptW / 2 - 22, py + promptH / 2 + bounce, {
    font: 'bold 13px sans-serif',
    color: '#4CAF50',
    align: 'center',
    baseline: 'middle',
  });

  ctx.globalAlpha = 1;
}

export function renderDropPrompt(ctx, state) {
  if (!state.dropPrompt) return;

  const text = state.dropPrompt;
  const font = "bold 14px 'Inter', system-ui, sans-serif";
  ctx.font = font;
  const w = ctx.measureText(text).width + 30;
  const h = 30;
  const px = CANVAS_W / 2 - w / 2;
  const py = dropPromptY(state, h);

  // Solid pill: the old see-through one let wall tiles show through the letters.
  ctx.globalAlpha = 1;
  drawRoundedRect(ctx, px, py, w, h, 10, '#4E342E', '#3E2723');
  drawText(ctx, text, CANVAS_W / 2, py + h / 2, {
    font,
    color: '#FFCC80',
    align: 'center',
    baseline: 'middle',
  });
}

// Stack above the action prompt (top at CANVAS_H - 65) when both show, else sit
// inside the bottom edge. Exported for the overlap test.
export function dropPromptY(state, h) {
  return state.actionPrompt ? CANVAS_H - 65 - 6 - h : CANVAS_H - h - 8;
}

// ─── Floating Score Texts ────────────────────────────────
// "+10" / "-5" that rise and fade from interaction point.

export function renderFloatingTexts(ctx, state) {
  if (!state.floatingTexts || state.floatingTexts.length === 0) return;

  for (const ft of state.floatingTexts) {
    if (ft.life <= 0) continue;
    ctx.globalAlpha = Math.min(1, ft.life);
    drawText(ctx, ft.text, ft.x, ft.y, {
      font: "bold 18px 'Inter', system-ui, sans-serif",
      color: ft.color,
      align: 'center',
      baseline: 'middle',
    });
    // Outline for readability — explicit per-floater outline wins; otherwise
    // green fills get the dark-green outline, everything else the dark red.
    ctx.strokeStyle = ft.outline || (ft.color === '#4CAF50' ? '#1B5E20' : '#B71C1C');
    ctx.lineWidth = 2;
    ctx.font = "bold 18px 'Inter', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.lineWidth = 1;
  }
  ctx.globalAlpha = 1;
}

export function updateFloatingTexts(state, dt) {
  if (!state.floatingTexts) return;
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const ft = state.floatingTexts[i];
    ft.y -= 35 * dt; // rise
    ft.life -= dt * 1.0;
    if (ft.life <= 0) state.floatingTexts.splice(i, 1);
  }
}

export function spawnFloatingText(state, x, y, text, color, opts = {}) {
  if (!state.floatingTexts) state.floatingTexts = [];
  state.floatingTexts.push({
    x, y, text, color,
    life: opts.life ?? 1.2,
    outline: opts.outline ?? null,
  });
}

// ─── Reject X ────────────────────────────────────────────
// Red X over fridge when item bounces off (wrong order).

export function renderRejectX(ctx, state) {
  if (!state.rejectX || state.rejectX.life <= 0) return;

  const rx = state.rejectX;
  const alpha = Math.min(1, rx.life * 2);
  const scale = 1 + (1 - rx.life) * 0.3; // grows slightly as it fades

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(rx.x, rx.y);
  ctx.scale(scale, scale);

  // Red X
  ctx.strokeStyle = '#EF5350';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-12, -12);
  ctx.lineTo(12, 12);
  ctx.moveTo(12, -12);
  ctx.lineTo(-12, 12);
  ctx.stroke();

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.lineCap = 'butt';
}

export function spawnRejectX(state, x, y) {
  state.rejectX = { x, y, life: 1.3 };
  playSound('wrong');
}

export function updateRejectX(state, dt) {
  if (!state.rejectX) return;
  state.rejectX.life -= dt; // ~1.3s on screen — long enough for kids to register the "no"
  if (state.rejectX.life <= 0) state.rejectX = null;
}

// ─── Particles ───────────────────────────────────────────
// Sparkle burst (correct) / red burst (wrong).
// Particles store canvas-space coords (already offset by OX/OY).

export function renderParticles(ctx, state) {
  if (DRAFT_MODE) return; // No particles in draft mode
  if (!state.particles || state.particles.length === 0) return;

  for (const p of state.particles) {
    if (p.life <= 0) continue;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;

    const size = p.size || 3;
    if (p.type === 'sparkle') {
      // Cross / star shape
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * Math.PI * 2);
      ctx.fillRect(-size / 2, -1, size, 2);
      ctx.fillRect(-1, -size / 2, 2, size);
      ctx.restore();
    } else {
      // Circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ─── Particle Spawners (helpers for game logic) ──────────

/** Burst of colored sparkles at canvas position (x, y).
 *  C3: sparkles double as the success blip. Pass a different sound name
 *  (e.g. 'pickup') or null to override. Hot-colored default bursts
 *  (red/orange = refusals) stay silent — spawnRejectX owns the "wrong" buzz. */
export function spawnSparkles(state, x, y, color, count = 10, sound = 'success') {
  if (!state.particles) state.particles = [];
  if (sound === 'success') {
    const rgb = /^#([0-9a-f]{2})([0-9a-f]{2})/i.exec(color || '');
    if (rgb && parseInt(rgb[1], 16) > parseInt(rgb[2], 16) + 60) sound = null;
  }
  if (sound) playSound(sound);
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 30 + Math.random() * 40;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color,
      size: 2 + Math.random() * 3,
      type: 'sparkle',
    });
  }
}

/** Update all particles (call each frame). */
export function updateParticles(state, dt) {
  if (!state.particles) return;
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt * 1.5;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

// ─── Tutorial Hint Overlay ────────────────────────────────

const HINT_DURATION = 3.0;

export { HINT_DURATION };

export function initHint(state, hintKey, t) {
  const storageKey = `playfood_hint_${hintKey}`;
  if (sessionStorage.getItem(storageKey)) {
    state.hintTimer = 0;
    state.hintText = null;
    state.hintSkipText = null;
    return;
  }
  sessionStorage.setItem(storageKey, '1');
  state.hintTimer = HINT_DURATION;
  state.hintText = t(`hint.${hintKey}`);
  state.hintSkipText = t('hint.skip');
}

export function updateHint(state, dt, keys) {
  if (state.hintTimer <= 0) return;
  // Enter or Space dismisses early (the copy promises both)
  if (keys.has('enter') || keys.has(' ')) {
    state.hintTimer = 0;
    return;
  }
  state.hintTimer = Math.max(0, state.hintTimer - dt);
}

// Greedy word-wrap against the live font metrics — keeps long localized hints
// (e.g. Greek/Dutch) inside the canvas instead of clipping off both edges.
// Caller sets ctx.font before measuring. A single short hint stays one line.
function wrapHintLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderHintOverlay(ctx, state) {
  if (!state.hintText || state.hintTimer <= 0) return;

  const alpha = Math.min(1, state.hintTimer / 0.3); // fade out in last 0.3s

  // Dark overlay
  ctx.save();
  ctx.globalAlpha = 0.7 * alpha;
  ctx.fillStyle = '#0D47A1';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.globalAlpha = alpha;

  // Hint text — centered, wrapped so long strings never clip the canvas edges.
  ctx.font = "bold 28px 'Inter', system-ui, sans-serif";
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  const lines = wrapHintLines(ctx, state.hintText, CANVAS_W - 160);
  const lineHeight = 34;
  // Center the wrapped block on the same anchor the single line used (−20).
  const blockTop = CANVAS_H / 2 - 20 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, CANVAS_W / 2, blockTop + i * lineHeight);
  });

  // Skip text — smaller, below the wrapped block.
  ctx.font = "16px 'Inter', system-ui, sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.shadowBlur = 0;
  const skipY = blockTop + (lines.length - 1) * lineHeight + 50;
  ctx.fillText(state.hintSkipText, CANVAS_W / 2, skipY);

  ctx.restore();
}

// ─── Shared MissionIntroCard ──────────────────────────────────
// ONE cream intro card for every game: title + 2–4 how-to steps + (optional)
// verbatim sourced fact + clickable source pill + goal + CTA. Modeled on the gold
// GardenPlanner tutorial; uses the WORLD_ART palette so it matches the in-game
// reveal cards. Strings are resolved ONCE here (the initHint idiom)
// so the render fn needs no `t`; the fact stays untranslated (EN verbatim).
const INTRO_DIM = 'rgba(13, 71, 161, 0.78)';

export function initMissionIntro(state, t, content) {
  if (!content) {
    state.missionIntro = null;
    state.showMissionIntro = false;
    state.introSourceRect = null;
    state.introPreSourceRect = null;
    return;
  }
  // The press that opened (or reopened) this card is often still held on the
  // first frame; seed the edge detector so it cannot instantly dismiss the card.
  state.enterWasDown = true;
  // Reopen = a card was already shown and dismissed (the "Guide" button). A second call while the
  // card is still open (StrictMode double setup, double click) keeps the previous answer.
  const reopened = Boolean(state.missionIntro) && (state.showMissionIntro ? Boolean(state.missionIntro.reopened) : true);
  state.missionIntro = {
    reopened,
    title: t(content.titleKey),
    steps: content.stepKeys.map((k) => t(k)),
    // { quote, sourceId, paraphrase? }. With `paraphrase` the quote field carries OUR
    // translated plain sentence and renders unquoted; without it, verbatim EN.
    introFact: content.introFact || null,
    // OPTIONAL second sourced line ABOVE the steps, with its own chip and keycap (Compost
    // Creator prevention/reuse, 01/10). Absent in the other 11 games, which render as before.
    // Shape: { quote, sourceId, paraphrase?, key: 'R', label }.
    preFact: content.preFact
      ? { ...content.preFact, label: content.preFact.labelKey ? t(content.preFact.labelKey) : t('result.source_link') }
      : null,
    // Optional own label for the main fact chip (only set when two chips must be told apart).
    factLabel: content.introFact?.labelKey ? t(content.introFact.labelKey) : null,
    goal: t(content.goalKey),
    cta: t(reopened ? 'hint.resume_ab' : (content.ctaKey || 'hint.skip')),
    sourceLabel: t('result.source_link'),
  };
  state.showMissionIntro = true;
  state.introSourceRect = null;
  state.introPreSourceRect = null;
  // A re-open (the "Guide" button) must not stack over an active reveal / feedback
  // card — clear them so the intro is the only modal on screen. A final/win reveal
  // is preserved (clearing it would skip the game's completion), and so is a card
  // that QUEUES the win (reveal.queueWin, SpotTheFake): clearing that one would
  // drop the queued win beat and the game could never complete.
  if (state.reveal && !state.reveal.final && !state.reveal.queueWin) state.reveal = null;
  state.feedback = null;
}

// Source pill + keycap, right-aligned at `rightX`, top at `ppy`. Returns the pill rect in the
// {x,y,width,height} shape hitTest() expects (canvas.js:79). Draw order and geometry are the
// ones the card has always used, so the single-fact card renders exactly as before.
function drawIntroSourceChip(ctx, label, keyCap, rightX, ppy) {
  ctx.font = "bold 11px 'Inter', system-ui, sans-serif";
  const pw = Math.ceil(ctx.measureText(label).width) + 18;
  const ph = 18;
  const ppx = rightX - pw;
  drawRoundedRect(ctx, ppx, ppy, pw, ph, 9, WORLD_ART.textGreen, null);
  drawText(ctx, label, ppx + pw / 2, ppy + ph / 2 + 0.5, {
    font: "bold 11px 'Inter', system-ui, sans-serif",
    color: '#fff', align: 'center', baseline: 'middle',
  });
  // Keycap hint left of the pill — the keyboard path to open the source (FIX-F).
  const kw = 17;
  const kx = ppx - 8 - kw;
  const ky = ppy + (ph - kw) / 2;
  drawRoundedRect(ctx, kx, ky, kw, kw, 4, '#fff', WORLD_ART.textGreen);
  drawText(ctx, keyCap, kx + kw / 2, ky + kw / 2 + 0.5, {
    // 11px: the full-size card is drawn at ~0.95 scale, and 10px fell under 10 CSS px.
    font: "bold 11px 'Inter', system-ui, sans-serif",
    color: WORLD_ART.textGreen, align: 'center', baseline: 'middle',
  });
  return { x: ppx, y: ppy, width: pw, height: ph };
}

// Self-guarded: draws nothing unless the card is active. Writes state.introSourceRect
// (canvas-pixel coords) so the game's pointer/keydown handler can open the source.
function renderMissionIntroCardLegacy(ctx, state) {
  const intro = state.missionIntro;
  if (!state.showMissionIntro || !intro) return;

  ctx.fillStyle = INTRO_DIM;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const panelW = 700;
  const pad = 32;
  const innerW = panelW - pad * 2;
  const stepLineH = 26;   // roomier leading for ages 9-14 (was 22)
  const stepGap = 4;      // breathing room between numbered steps
  const factLineH = 22;   // (was 19)

  // Measure wrapped steps + fact first so the panel fits its content exactly.
  ctx.font = "15px 'Inter', system-ui, sans-serif";
  const stepLines = intro.steps.map((s, i) => wrapHintLines(ctx, `${i + 1}.  ${s}`, innerW));
  const stepLineCount = stepLines.reduce((n, ls) => n + ls.length, 0);

  // `introFact.paraphrase` = the line is OUR plain sentence for ages 9 to 14, not the
  // source's words, so it is set upright and unquoted: quotation marks would pass our
  // wording off as the source's. Press S still opens the verbatim passage. Games that
  // show a verbatim quote omit the flag and render unchanged.
  const factParaphrase = !!intro.introFact?.paraphrase;
  const factFont = factParaphrase
    ? "13px 'Inter', system-ui, sans-serif"
    : "italic 13px 'Inter', system-ui, sans-serif";
  let factLines = [];
  if (intro.introFact) {
    ctx.font = factFont;
    factLines = wrapHintLines(
      ctx,
      factParaphrase ? intro.introFact.quote : '“' + intro.introFact.quote + '”',
      innerW - 12,
    );
  }

  // Optional pre-fact (above the steps). Same type and leading as the main fact line.
  const pre = intro.preFact || null;
  let preLines = [];
  if (pre) {
    ctx.font = pre.paraphrase ? "13px 'Inter', system-ui, sans-serif" : "italic 13px 'Inter', system-ui, sans-serif";
    preLines = wrapHintLines(ctx, pre.paraphrase ? pre.quote : '“' + pre.quote + '”', innerW - 12);
  }
  const preH = pre ? preLines.length * factLineH + 18 + 14 : 0;

  const titleH = 48;
  const stepsH = stepLineCount * stepLineH + stepLines.length * stepGap + 6;
  const factH = intro.introFact ? factLines.length * factLineH + 28 : 0;
  // Goal wraps at a fixed 14px (like the responsive card) instead of shrinking.
  const goalText = '🎯 ' + intro.goal;
  const goalFont = "bold 14px 'Inter', system-ui, sans-serif";
  ctx.font = goalFont;
  const goalLines = wrapHintLines(ctx, goalText, innerW - 28);
  const goalPillH = goalLines.length * 18 + 12;
  const goalH = goalPillH + 16;
  const ctaH = 24;
  const panelH = titleH + preH + stepsH + factH + goalH + ctaH + pad;

  const px = Math.round(CANVAS_W / 2 - panelW / 2);
  const py = Math.round(CANVAS_H / 2 - panelH / 2);

  // Shadow + cream body + green border, then the green title band.
  drawRoundedRect(ctx, px + 4, py + 6, panelW, panelH, 14, 'rgba(0,0,0,0.40)', null);
  drawRoundedRect(ctx, px, py, panelW, panelH, 14, WORLD_ART.panelCream, WORLD_ART.textGreen);
  drawRoundedRect(ctx, px + 6, py + 6, panelW - 12, 34, 8, WORLD_ART.buttonGreen, null);
  // Shrink-to-fit the title band so longer rebranded names (EL/NL/PT) never clip.
  const titlePx = fitFontPx(ctx, intro.title, panelW - 36, { start: 18, floor: 13, weight: 'bold' });
  drawText(ctx, intro.title, CANVAS_W / 2, py + 23, {
    font: `bold ${titlePx}px 'Inter', system-ui, sans-serif`,
    color: '#fff', align: 'center', baseline: 'middle',
  });

  let y = py + titleH + 6;

  if (pre) {
    const preFont = pre.paraphrase ? "13px 'Inter', system-ui, sans-serif" : "italic 13px 'Inter', system-ui, sans-serif";
    for (const line of preLines) {
      drawText(ctx, line, px + pad, y, { font: preFont, color: WORLD_ART.panelBrown, align: 'left', baseline: 'middle' });
      y += factLineH;
    }
    state.introPreSourceRect = drawIntroSourceChip(ctx, pre.label, pre.key || 'R', px + panelW - pad, y - 2);
    y += 18 + 14;
  } else {
    state.introPreSourceRect = null;
  }

  for (const lines of stepLines) {
    for (const line of lines) {
      drawText(ctx, line, px + pad, y, {
        font: "15px 'Inter', system-ui, sans-serif",
        color: WORLD_ART.panelBrown, align: 'left', baseline: 'middle',
      });
      y += stepLineH;
    }
    y += stepGap;
  }

  if (intro.introFact) {
    y += 6;
    for (const line of factLines) {
      drawText(ctx, line, px + pad, y, {
        font: factFont,
        color: WORLD_ART.panelBrown, align: 'left', baseline: 'middle',
      });
      y += factLineH;
    }
    state.introSourceRect = drawIntroSourceChip(ctx, intro.factLabel || intro.sourceLabel, 'S', px + panelW - pad, y - 2);
    y += 18;
  } else {
    state.introSourceRect = null;
  }

  // Goal pill: hugs one line, grows to full width and wraps for longer NL/PT goals.
  y += 10;
  ctx.font = goalFont;
  const gw = Math.min(innerW, Math.max(...goalLines.map(line => ctx.measureText(line).width)) + 28);
  drawRoundedRect(ctx, CANVAS_W / 2 - gw / 2, y, gw, goalPillH, 15, 'rgba(46,125,50,0.95)', WORLD_ART.textGreen);
  goalLines.forEach((line, index) => drawText(ctx, line, CANVAS_W / 2, y + 15 + index * 18, {
    font: goalFont, color: '#fff', align: 'center', baseline: 'middle',
  }));
  y += goalPillH + 10;

  drawText(ctx, intro.cta, CANVAS_W / 2, y, {
    font: "13px 'Inter', system-ui, sans-serif",
    color: WORLD_ART.textGreen, align: 'center', baseline: 'middle',
  });
}


// DOM rectangles are converted through the transform used by this frame, so
// Retina backing stores and letterboxed canvases have the same CSS-pixel fit.
export function missionIntroViewport(ctx) {
  const canvas = ctx.canvas;
  const doc = canvas?.ownerDocument;
  const win = doc?.defaultView;
  const rect = canvas?.getBoundingClientRect?.();
  const m = ctx.getTransform?.();
  if (!rect?.width || !rect.height || !m || !canvas.width || !win) return null;
  const pixelX = rect.width / canvas.width;
  const pixelY = rect.height / canvas.height;
  const scale = m.a * pixelX;
  if (!(scale > 0) || Math.abs(m.b) > 0.001 || Math.abs(m.c) > 0.001) return null;
  const originX = rect.left + m.e * pixelX;
  const originY = rect.top + m.f * pixelY;
  const viewport = win.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? win.innerWidth;
  const height = viewport?.height ?? win.innerHeight;
  const stage = canvas.closest?.('[data-testid="active-canvas-stage"]')?.getBoundingClientRect();
  const box = {
    left: Math.max(rect.left, left, stage?.left ?? rect.left) + 8,
    right: Math.min(rect.right, left + width, stage?.right ?? rect.right) - 8,
    top: Math.max(rect.top, top, stage?.top ?? rect.top) + 8,
    bottom: Math.min(rect.bottom, top + height, stage?.bottom ?? rect.bottom) - 8,
  };
  let topBar = doc.querySelector('[data-testid="game-scorebar"], [data-testid="garden-topbar"], [data-testid="spot-the-fake-hud"], [data-testid="season-matcher-hud"]');
  // Compost has a bespoke bar without a test id, immediately before its stage.
  for (let node = canvas; !topBar && node?.parentElement; node = node.parentElement) {
    if (node.previousElementSibling?.querySelector('button')) topBar = node.previousElementSibling;
  }
  const bar = topBar?.getBoundingClientRect();
  if (bar?.height) box.top = Math.max(box.top, bar.bottom + 8);
  const controls = [...doc.querySelectorAll('[data-testid="touch-controls-surface"] button[data-key], .spot-intro-start')]
    .filter(button => button.getClientRects().length)
    .map(button => button.getBoundingClientRect())
    .filter(control => control.right > box.left && control.left < box.right
      && control.bottom > box.top && control.top < box.bottom);
  return { scale, originX, originY, box, controls, compact: height <= 500 };
}

function introRegions(view) {
  const { box, controls } = view;
  if (!controls.length) return [box];
  const middle = (box.left + box.right) / 2;
  const left = controls.filter(c => c.right < middle);
  const right = controls.filter(c => c.left > middle);
  const central = controls.filter(c => c.left <= middle && c.right >= middle);
  return [
    { ...box, left: Math.max(box.left, ...left.map(c => c.right + 8)),
      right: Math.min(box.right, ...right.map(c => c.left - 8)),
      bottom: Math.min(box.bottom, ...central.map(c => c.top - 8)) },
    { ...box, bottom: Math.min(box.bottom, ...controls.map(c => c.top - 8)) },
  ].filter(region => region.right - region.left >= 180 && region.bottom - region.top >= 80);
}

function measureIntroLayout(ctx, intro, width, compact) {
  const pad = compact ? 16 : 28;
  const innerW = width - pad * 2;
  const stepLineH = compact ? 19 : 24;
  const factLineH = compact ? 17 : 21;
  const stepGap = compact ? 3 : 4;
  const factFont = paraphrase => `${paraphrase ? '' : 'italic '}13px 'Inter', system-ui, sans-serif`;
  const wrap = (text, font, maxW = innerW) => {
    ctx.font = font;
    return wrapHintLines(ctx, text, maxW);
  };
  const titlePx = fitFontPx(ctx, intro.title, width - 28, { start: 18, floor: 15, weight: 'bold' });
  const steps = intro.steps.map((s, index) => wrap(`${index + 1}.  ${s}`, "15px 'Inter', system-ui, sans-serif"));
  ctx.font = "15px 'Inter', system-ui, sans-serif";
  const previousBaseline = ctx.textBaseline;
  ctx.textBaseline = 'middle';
  const stepAdvances = steps.map(lines => {
    const ink = lines.map(line => ctx.measureText(line));
    return lines.map((_, index) => index === lines.length - 1 ? stepLineH : Math.max(
      stepLineH,
      // Emoji fallback glyphs can extend beyond the nominal font size.
      Math.ceil((ink[index].actualBoundingBoxDescent || 0)
        + (ink[index + 1].actualBoundingBoxAscent || 0) + 1),
    ));
  });
  ctx.textBaseline = previousBaseline;
  const fact = model => model ? wrap(model.paraphrase ? model.quote : `“${model.quote}”`, factFont(model.paraphrase)) : [];
  const preLines = fact(intro.preFact);
  const factLines = fact(intro.introFact);
  const goalLines = wrap(`🎯 ${intro.goal}`, "bold 14px 'Inter', system-ui, sans-serif", innerW - 20);
  const ctaLines = wrap(intro.cta, "13px 'Inter', system-ui, sans-serif");
  // The band ends at y=33 and the first step is centred on titleH, so 15px ink needs 46.
  const titleH = 46;
  const sourceH = compact ? 26 : 32;
  const preH = intro.preFact ? preLines.length * factLineH + sourceH + 4 : 0;
  const stepsH = stepAdvances.reduce((sum, advances) => sum + advances.reduce((total, h) => total + h, 0) + stepGap, 0);
  const factH = intro.introFact ? 4 + factLines.length * factLineH + sourceH : 0;
  const goalH = goalLines.length * 18 + 10;
  const height = titleH + preH + stepsH + factH + 8 + goalH + 12 + ctaLines.length * 17 + 12;
  return { width, height, pad, innerW, steps, stepAdvances, preLines, factLines, goalLines, ctaLines,
    titlePx, titleH, stepLineH, stepGap, factLineH, factFont, sourceH, goalH };
}

function chooseIntroLayout(ctx, intro, view) {
  let best = null;
  // Test the available gaps at decreasing real font sizes. Wrapping can change
  // at each size, so a single ratio of the old card's height is insufficient.
  for (let bodyCss = 14; bodyCss >= 9.5; bodyCss -= 0.1) {
    const u = Math.max(1, Math.round(bodyCss / (15 * view.scale) * 1000) / 1000);
    for (const region of introRegions(view)) {
      const width = (region.right - region.left - 6) / (view.scale * u);
      const L = measureIntroLayout(ctx, intro, width, view.compact);
      if ((L.height + 7) * view.scale * u > region.bottom - region.top) continue;
      const x = ((region.left + region.right) / 2 - view.originX) / view.scale - L.width * u / 2;
      const y = ((region.top + region.bottom) / 2 - view.originY) / view.scale - L.height * u / 2;
      const candidate = { ...L, u, x, y };
      if (!best || u > best.u || (u === best.u && width > best.width)) best = candidate;
    }
    if (best) return best;
  }
  return null;
}

function renderResponsiveMissionIntro(ctx, state, view) {
  const intro = state.missionIntro;
  const L = chooseIntroLayout(ctx, intro, view);
  if (!L) return false;
  const { box, scale, originX, originY } = view;
  ctx.fillStyle = INTRO_DIM;
  ctx.fillRect((box.left - originX - 8) / scale, (box.top - originY - 8) / scale,
    (box.right - box.left + 16) / scale, (box.bottom - box.top + 16) / scale);
  ctx.save();
  ctx.translate(L.x, L.y);
  ctx.scale(L.u, L.u);
  drawRoundedRect(ctx, 3, 5, L.width, L.height, 12, 'rgba(0,0,0,0.40)', null);
  drawRoundedRect(ctx, 0, 0, L.width, L.height, 12, WORLD_ART.panelCream, WORLD_ART.textGreen);
  drawRoundedRect(ctx, 5, 5, L.width - 10, 28, 8, WORLD_ART.buttonGreen, null);
  drawText(ctx, intro.title, L.width / 2, 19, {
    font: `bold ${L.titlePx}px 'Inter', system-ui, sans-serif`, color: '#fff', align: 'center', baseline: 'middle',
  });
  let y = L.titleH;
  const drawLines = (lines, font, lineH, color = WORLD_ART.panelBrown, align = 'left', x = L.pad) => {
    for (const [index, line] of lines.entries()) {
      drawText(ctx, line, x, y, { font, color, align, baseline: 'middle' });
      y += Array.isArray(lineH) ? lineH[index] : lineH;
    }
  };
  const sourceChip = (label, key) => {
    const font = "bold 13px 'Inter', system-ui, sans-serif";
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(label).width) + 18;
    const x = L.width - L.pad - w;
    drawRoundedRect(ctx, x, y - 2, w, 20, 9, WORLD_ART.textGreen, null);
    drawText(ctx, label, x + w / 2, y + 8, { font, color: '#fff', align: 'center', baseline: 'middle' });
    drawRoundedRect(ctx, x - 25, y - 2, 20, 20, 4, '#fff', WORLD_ART.textGreen);
    drawText(ctx, key, x - 15, y + 8, { font, color: WORLD_ART.textGreen, align: 'center', baseline: 'middle' });
    const rect = { x: L.x + x * L.u, y: L.y + (y - 2) * L.u, width: w * L.u, height: 20 * L.u };
    y += L.sourceH;
    return rect;
  };
  if (intro.preFact) {
    drawLines(L.preLines, L.factFont(intro.preFact.paraphrase), L.factLineH);
    state.introPreSourceRect = sourceChip(intro.preFact.label, intro.preFact.key || 'R');
    y += 4;
  } else state.introPreSourceRect = null;
  for (const [index, lines] of L.steps.entries()) {
    drawLines(lines, "15px 'Inter', system-ui, sans-serif", L.stepAdvances[index]);
    y += L.stepGap;
  }
  if (intro.introFact) {
    y += 4;
    drawLines(L.factLines, L.factFont(intro.introFact.paraphrase), L.factLineH);
    state.introSourceRect = sourceChip(intro.factLabel || intro.sourceLabel, 'S');
  } else state.introSourceRect = null;
  y += 8;
  drawRoundedRect(ctx, L.pad, y - 4, L.innerW, L.goalH, 12, 'rgba(46,125,50,0.95)', WORLD_ART.textGreen);
  const goalBottom = y - 4 + L.goalH;
  y += 7;
  drawLines(L.goalLines, "bold 14px 'Inter', system-ui, sans-serif", 18, '#fff', 'center', L.width / 2);
  y = goalBottom + 16;
  drawLines(L.ctaLines, "13px 'Inter', system-ui, sans-serif", 17, WORLD_ART.textGreen, 'center', L.width / 2);
  ctx.restore();
  return true;
}

export function renderMissionIntroCard(ctx, state) {
  if (!state.showMissionIntro || !state.missionIntro) return;
  const view = missionIntroViewport(ctx);
  // Full-size cards retain their existing drawing. Small canvases and Market's
  // narrower stage use the visible canvas, including its letterbox margins.
  if (view && view.scale < 0.95 && renderResponsiveMissionIntro(ctx, state, view)) return;
  renderMissionIntroCardLegacy(ctx, state);
}
