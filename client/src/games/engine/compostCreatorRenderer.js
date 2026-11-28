// CompostCreator renderer — backyard-specific rendering for "The Backyard Sort".
// Grass overlay, wooden fence, tree stumps, 5 bins, chef NPC.

import {
  CANVAS_W, CANVAS_H, TILE_SIZE as TS,
} from '../../overworld/overworldData.js';
import { TILE } from '../../overworld/tileAtlas.js';
import { drawRoundedRect, drawText, renderSourceChip } from '../../utils/canvas.js';
import { OX, OY } from './gameRoomRenderer.js';
import { DRAFT_MODE } from '../../config/draftMode.js';
import { COMPOST_BINS } from '../../data/compostItems.js';
import { WORLD_ART } from '../../styles/brandColors.js';
import { drawFoodItem } from './itemSurface.js';
import { drawItemGlyph, hasDrawnIcon } from './itemGlyphs.js';

// Canonized Island-1 chrome tokens (single source of truth) — same cream/quote-brown the
// MarketTrip toast and the FridgeManager fact card use. The card border is the accepted-green
// pill edge; semantic prop art (bins, sparkles) stays raw hex per the brand convention.
const PANEL_CREAM = WORLD_ART.panelCream;     // #FFF8E1
const QUOTE_BROWN = WORLD_ART.panelBrownDeep; // #3E2723

// Build a quick lookup so render code can resolve bin id → visual config in O(1).
const BIN_VISUAL = Object.fromEntries(COMPOST_BINS.map(b => [b.id, b]));

// Darken a hex color by a given amount (0..1). Used for bin gradient bottoms + borders.
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(255 * amount));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (n & 0xff) - Math.round(255 * amount));
  return `rgb(${r},${g},${b})`;
}

// Deterministic per-tile variant (same hash as gameRoomRenderer)
function vari(col, row, count) {
  return ((col * 7 + row * 13 + col * row) & 0x7FFFFFFF) % count;
}

// ─── Garden Fence (row 0 + row 14) ──────────────────────

export function renderGardenFence(ctx) {
  if (DRAFT_MODE) {
    // Simple brown bars for fence
    for (const fenceRow of [0, 14]) {
      const fy = OY + fenceRow * TS;
      for (let c = 0; c < 20; c++) {
        const fx = OX + c * TS;
        ctx.fillStyle = '#A1887F';
        ctx.fillRect(fx, fy, TS, TS);
        ctx.strokeStyle = '#795548';
        ctx.lineWidth = 1;
        ctx.strokeRect(fx, fy, TS, TS);
      }
    }
    drawText(ctx, 'FENCE', OX + 10 * TS, OY + TS / 2, {
      font: "bold 10px sans-serif", color: '#4E342E',
      align: 'center', baseline: 'middle',
    });
    return;
  }

  // Top fence (row 0)
  for (const fenceRow of [0, 14]) {
    const fy = OY + fenceRow * TS;
    for (let c = 1; c <= 18; c++) {
      const fx = OX + c * TS;
      // Plank
      const plankGrad = ctx.createLinearGradient(fx, fy, fx + TS, fy);
      plankGrad.addColorStop(0, '#8D6E63');
      plankGrad.addColorStop(0.5, '#A1887F');
      plankGrad.addColorStop(1, '#8D6E63');
      ctx.fillStyle = plankGrad;
      ctx.fillRect(fx, fy, TS, TS);

      // Vertical plank lines
      ctx.strokeStyle = 'rgba(93,64,55,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx + TS / 2, fy);
      ctx.lineTo(fx + TS / 2, fy + TS);
      ctx.stroke();

      // Horizontal rail
      ctx.fillStyle = '#6D4C41';
      ctx.fillRect(fx, fy + TS * 0.35, TS, 3);
      ctx.fillRect(fx, fy + TS * 0.7, TS, 3);

      // Wood grain dots
      ctx.fillStyle = 'rgba(62,39,35,0.15)';
      const v = vari(c, fenceRow, 3);
      if (v === 0) {
        ctx.beginPath(); ctx.arc(fx + 8, fy + 10, 2, 0, Math.PI * 2); ctx.fill();
      } else if (v === 1) {
        ctx.beginPath(); ctx.arc(fx + 20, fy + 22, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Fence posts at edges
  for (const fenceRow of [0, 14]) {
    const fy = OY + fenceRow * TS;
    for (const c of [0, 19]) {
      const fx = OX + c * TS;
      ctx.fillStyle = '#5D4037';
      ctx.fillRect(fx, fy, TS, TS);
      ctx.fillStyle = '#4E342E';
      ctx.fillRect(fx + TS / 2 - 2, fy, 4, TS);
    }
  }
}

// ─── Grass Overlay (over FLOOR_STONE tiles) ─────────────

export function renderGrassOverlay(ctx, roomMap) {
  if (DRAFT_MODE) {
    // Flat green for all walkable tiles
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 20; col++) {
        if (roomMap[row][col] !== TILE.FLOOR_STONE) continue;
        const gx = OX + col * TS;
        const gy = OY + row * TS;
        ctx.fillStyle = '#7CB342';
        ctx.fillRect(gx, gy, TS, TS);
        ctx.strokeStyle = 'rgba(56,142,60,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(gx, gy, TS, TS);
      }
    }
    // Flat dark green for hedge walls
    for (let row = 1; row <= 13; row++) {
      for (const col of [0, 19]) {
        const hx = OX + col * TS;
        const hy = OY + row * TS;
        ctx.fillStyle = '#388E3C';
        ctx.fillRect(hx, hy, TS, TS);
        ctx.strokeStyle = '#2E7D32';
        ctx.lineWidth = 1;
        ctx.strokeRect(hx, hy, TS, TS);
      }
    }
    return;
  }

  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 20; col++) {
      if (roomMap[row][col] !== TILE.FLOOR_STONE) continue;

      const gx = OX + col * TS;
      const gy = OY + row * TS;

      // Base green
      const v = vari(col, row, 4);
      const greens = ['#4CAF50', '#43A047', '#388E3C', '#66BB6A'];
      ctx.fillStyle = greens[v];
      ctx.fillRect(gx, gy, TS, TS);

      // Grass tufts
      ctx.fillStyle = 'rgba(27,94,32,0.25)';
      const t1 = vari(col + 3, row + 7, 5);
      ctx.beginPath();
      ctx.moveTo(gx + 4 + t1 * 5, gy + TS - 2);
      ctx.lineTo(gx + 6 + t1 * 5, gy + TS - 8);
      ctx.lineTo(gx + 8 + t1 * 5, gy + TS - 2);
      ctx.fill();

      const t2 = vari(col + 11, row + 3, 5);
      ctx.beginPath();
      ctx.moveTo(gx + 16 + t2 * 2, gy + 4);
      ctx.lineTo(gx + 18 + t2 * 2, gy - 2);
      ctx.lineTo(gx + 20 + t2 * 2, gy + 4);
      ctx.fill();

      // Small flower on some tiles
      if (v === 3) {
        ctx.fillStyle = '#FFF176';
        ctx.beginPath();
        ctx.arc(gx + 14, gy + 12, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Wall tiles (row 0 / row 14) rendered by renderGardenFence above;
  // left/right walls (col 0 / col 19) need a hedge look
  for (let row = 1; row <= 13; row++) {
    for (const col of [0, 19]) {
      const hx = OX + col * TS;
      const hy = OY + row * TS;
      ctx.fillStyle = '#2E7D32';
      ctx.fillRect(hx, hy, TS, TS);
      // Hedge leaf dots
      ctx.fillStyle = 'rgba(27,94,32,0.6)';
      const lv = vari(col + 5, row, 3);
      ctx.beginPath();
      ctx.arc(hx + 8 + lv * 6, hy + 10 + lv * 4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(76,175,80,0.5)';
      ctx.beginPath();
      ctx.arc(hx + 20 - lv * 4, hy + 22 - lv * 3, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ─── Tree Stumps (over COUNTER tiles) ───────────────────

export function renderTreeStumps(ctx, roomMap) {
  if (DRAFT_MODE) {
    // Simple brown circles
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 20; col++) {
        if (roomMap[row][col] !== TILE.COUNTER) continue;
        const sx = OX + col * TS + TS / 2;
        const sy = OY + row * TS + TS / 2;
        ctx.fillStyle = '#8D6E63';
        ctx.beginPath();
        ctx.arc(sx, sy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5D4037';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    return;
  }

  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 20; col++) {
      if (roomMap[row][col] !== TILE.COUNTER) continue;

      const sx = OX + col * TS + TS / 2;
      const sy = OY + row * TS + TS / 2;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(sx + 1, sy + 2, 13, 11, 0, 0, Math.PI * 2);
      ctx.fill();

      // Stump body
      const stumpGrad = ctx.createRadialGradient(sx, sy, 2, sx, sy, 12);
      stumpGrad.addColorStop(0, '#D7CCC8');
      stumpGrad.addColorStop(0.4, '#A1887F');
      stumpGrad.addColorStop(1, '#6D4C41');
      ctx.fillStyle = stumpGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, Math.PI * 2);
      ctx.fill();

      // Ring
      ctx.strokeStyle = 'rgba(93,64,55,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.stroke();

      // Center dot
      ctx.fillStyle = '#8D6E63';
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Bin label fitting (pure apart from ctx.measureText). Returns { lines, size, width }.
// A soft hyphen (U+00AD) marks where a one-word compound may break; it is invisible on one line
// and becomes a visible «-» when the label wraps.
export const SOFT_HYPHEN = '\u00AD';
export function binLabelText(label) {
  return String(label).replace(/\u00AD/g, '');
}
export function fitBinLabel(ctx, label, maxW) {
  const font = (px) => `bold ${px}px 'Inter', system-ui, sans-serif`;
  const width = (px, lines) => {
    ctx.font = font(px);
    return Math.max(...lines.map((l) => ctx.measureText(l).width));
  };
  const flat = binLabelText(label);
  for (let px = 12; px >= 10; px--) {
    const w = width(px, [flat]);
    if (w <= maxW) return { lines: [flat], size: px, width: w };
  }
  // Two-line split at the break point closest to the middle (space or soft hyphen).
  const raw = String(label);
  const breaks = [];
  for (let i = 0; i < raw.length; i++) if (raw[i] === ' ' || raw[i] === SOFT_HYPHEN) breaks.push(i);
  if (breaks.length) {
    const mid = raw.length / 2;
    const at = breaks.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
    const first = binLabelText(raw.slice(0, at)) + (raw[at] === SOFT_HYPHEN ? '-' : '');
    const second = binLabelText(raw.slice(at + 1));
    for (let px = 12; px >= 9; px--) {
      const w = width(px, [first, second]);
      if (w <= maxW) return { lines: [first, second], size: px, width: w };
    }
  }
  let px = 9;
  let w = width(px, [flat]);
  while (w > maxW && px > 8) { px--; w = width(px, [flat]); }
  return { lines: [flat], size: px, width: w };
}

// ─── Compost & Trash Bins ───────────────────────────────

// Render all bins defined in room.bins. Each bin reads visual config from COMPOST_BINS by id.
// ─── Held item vs bin labels ──────
// The shared renderHeldItem draws the carried item 6 px above the player's
// head. Standing right under a bin, that box lands on the bin's name label
// («DRINK C🧃RTONS»). Bins are drawn first, so the label was hidden exactly when
// the child chooses where to drop. Here only: when the above-head box would
// overlap a bin's label zone, the item is carried in front instead (in the
// hand, below the label), so both the item and the bin name stay visible.
const HELD_SIZE = 18;
// Label zone of a bin: full width, bottom 34 px (two-line pill: centre bh−17,
// two 12 px lines + 4 px padding → ≤ 32 px; one-line pill sits inside it).
const LABEL_ZONE_H = 34;

export function binLabelZones(room) {
  return (room?.bins || []).map((bin) => {
    const cols = bin.tiles.map((t) => t.col);
    const rows = bin.tiles.map((t) => t.row);
    const bx = OX + Math.min(...cols) * TS;
    const by = OY + Math.min(...rows) * TS;
    const bw = (Math.max(...cols) - Math.min(...cols) + 1) * TS;
    const bh = (Math.max(...rows) - Math.min(...rows) + 1) * TS;
    return { id: bin.id, l: bx, r: bx + bw, t: by + bh - LABEL_ZONE_H, b: by + bh };
  });
}

/** Where the carried item goes: 'above' (shared default) or 'front' (clear of a bin label). */
export function heldItemPlacement(state, room) {
  if (!state?.heldItem || !state.player) return null;
  const px = OX + state.player.pixelX + TS / 2;
  const py = OY + state.player.pixelY;
  // above-head box incl. the ±2 px bob (renderHeldItem: bottom at py − 6 ± 2)
  const box = { l: px - HELD_SIZE / 2 - 2, r: px + HELD_SIZE / 2 + 2, t: py - 8 - HELD_SIZE, b: py - 4 };
  const hit = binLabelZones(room).some((z) => box.l < z.r && box.r > z.l && box.t < z.b && box.b > z.t);
  return hit ? 'front' : 'above';
}

/** Box of the item when carried in front (used by the renderer and the tests). */
export function frontHeldBox(state) {
  const px = OX + state.player.pixelX + TS / 2;
  const py = OY + state.player.pixelY;
  const cx = px + 9; const bottom = py + 2 + HELD_SIZE;
  return { cx, bottom, l: cx - HELD_SIZE / 2, r: cx + HELD_SIZE / 2, t: bottom - HELD_SIZE, b: bottom };
}

export function renderCompostHeldItem(ctx, state, room, renderAbove) {
  const where = heldItemPlacement(state, room);
  if (!where) return;
  if (where === 'above') { renderAbove(ctx, state); return; }
  const f = frontHeldBox(state);
  ctx.textAlign = 'center';
  drawItemGlyph(ctx, state.heldItem, f.cx, f.bottom, HELD_SIZE, 'bottom');
}

export function renderCompostBins(ctx, state, t, room) {
  if (!room?.bins) return;

  for (const bin of room.bins) {
    const visual = BIN_VISUAL[bin.id] || { color: '#888', emoji: '?', labelKey: bin.id };
    const firstTile = bin.tiles[0];
    // Bin dimensions derived from the tile array: width spans unique cols, height spans unique rows.
    // Supports both 2×2 and 2×3 layouts without hardcoding.
    const cols = [...new Set(bin.tiles.map(t => t.col))];
    const rows = [...new Set(bin.tiles.map(t => t.row))];
    const bx = OX + Math.min(...cols) * TS;
    const by = OY + Math.min(...rows) * TS;
    const bw = cols.length * TS;
    const bh = rows.length * TS;
    const label = (t && t(visual.labelKey) !== visual.labelKey)
      ? t(visual.labelKey)
      : bin.id.toUpperCase();

    if (DRAFT_MODE) {
      ctx.fillStyle = visual.color;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = shade(visual.color, 0.25);
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(visual.emoji, bx + bw / 2, by + bh / 2 - 4);
      drawText(ctx, label, bx + bw / 2, by + bh / 2 + 10, {
        font: "bold 8px sans-serif", color: '#fff',
        align: 'center', baseline: 'middle',
      });
      continue;
    }

    // Dark hole on top when player nearby with held item
    if (state.heldItem) {
      const pcol = state.player.col;
      const prow = state.player.row;
      const centerCol = Math.min(...cols) + cols.length / 2 - 0.5;
      const centerRow = Math.min(...rows) + rows.length / 2 - 0.5;
      const dist = Math.abs(pcol - centerCol) + Math.abs(prow - centerRow);
      if (dist < 4) {
        const pulse = 0.5 + Math.sin(state.time * 4) * 0.15;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#1B1B1B';
        ctx.beginPath();
        ctx.ellipse(bx + bw / 2, by + 10, bw / 2 - 6, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Glow ring (bin color)
        ctx.globalAlpha = 0.2 + Math.sin(state.time * 4) * 0.1;
        ctx.fillStyle = visual.color;
        ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
        ctx.globalAlpha = 1;
      }
    }

    // ── Bin sprite ──
    // Drawn as a proper trash-can shape: lid above the rim, dark opening hole,
    // gradient body with side highlights, ground shadow underneath.
    const darker = shade(visual.color, 0.30);
    const darkest = shade(visual.color, 0.55);
    const lighter = shade(visual.color, -0.18);

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(bx + bw / 2, by + bh + 3, bw / 2 + 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body gradient (slightly inset from lid edges for the trash-can look)
    const bodyTop = by + 8;
    const bodyH = bh - 8;
    const grad = ctx.createLinearGradient(bx, bodyTop, bx, bodyTop + bodyH);
    grad.addColorStop(0, visual.color);
    grad.addColorStop(1, darker);
    ctx.fillStyle = grad;
    ctx.fillRect(bx, bodyTop, bw, bodyH);

    // Vertical ribs — three subtle lighter strokes for depth
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (const ribX of [bx + bw * 0.22, bx + bw * 0.5, bx + bw * 0.78]) {
      ctx.fillRect(ribX - 0.5, bodyTop + 4, 1, bodyH - 8);
    }

    // Left highlight + right shadow
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(bx, bodyTop, 2, bodyH);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(bx + bw - 2, bodyTop, 2, bodyH);

    // Outer border
    ctx.strokeStyle = darkest;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, bodyTop, bw, bodyH);

    // Lid (overhanging rim) — sits 4 px above body, 4 px wider each side
    const lidH = 9;
    const lidX = bx - 4;
    const lidY = by - 1;
    const lidW = bw + 8;
    const lidGrad = ctx.createLinearGradient(lidX, lidY, lidX, lidY + lidH);
    lidGrad.addColorStop(0, lighter);
    lidGrad.addColorStop(1, darker);
    ctx.fillStyle = lidGrad;
    drawRoundedRect(ctx, lidX, lidY, lidW, lidH, 2, lidGrad, darkest);

    // Opening hole — dark ellipse just below the lid
    const holeX = bx + bw / 2;
    const holeY = by + 13;
    const holeRx = bw / 2 - 8;
    const holeRy = 5;
    ctx.fillStyle = shade(visual.color, 0.7);
    ctx.beginPath();
    ctx.ellipse(holeX, holeY, holeRx, holeRy, 0, 0, Math.PI * 2);
    ctx.fill();
    // Inner rim of the hole
    ctx.strokeStyle = darkest;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Emoji — placed in upper third (below opening, above label)
    ctx.font = '30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(visual.emoji, bx + bw / 2, by + bh * 0.55);

    // Label — auto-fit. Short labels: one line, shrink from 12 px. Two-word or compound labels
    // that would drop below 10 px on one line (e.g. «ΚΟΥΤΙΑ ΠΟΤΩΝ», «PACOTES DE BEBIDA»,
    // «DRANK·KARTONS» with a soft hyphen) wrap onto two lines instead. A label with no break
    // point keeps the original single-line shrink to 8 px, so the other bins are unchanged.
    const maxLabelW = bw - 8;
    const fit = fitBinLabel(ctx, label, maxLabelW);
    const lineH = fit.size + 2;
    const pillH = fit.lines.length * lineH + 4;
    const labelY = fit.lines.length > 1 ? by + bh - 17 : by + bh - 14;
    const pillW = fit.width + 12;
    drawRoundedRect(ctx,
      bx + bw / 2 - pillW / 2, labelY - pillH / 2, pillW, pillH,
      Math.min(pillH / 2, 9),
      'rgba(0,0,0,0.35)', null,
    );
    fit.lines.forEach((ln, i) => {
      drawText(ctx, ln, bx + bw / 2, labelY + (i - (fit.lines.length - 1) / 2) * lineH, {
        font: `bold ${fit.size}px 'Inter', system-ui, sans-serif`,
        color: '#fff',
        align: 'center',
        baseline: 'middle',
      });
    });

    // Placed items count badge — top-right corner
    const items = state.binItems?.[bin.id];
    if (items && items.length > 0) {
      const badgeX = bx + bw - 8;
      const badgeY = by + bh * 0.55 - 18;
      ctx.fillStyle = '#1B5E20';
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawText(ctx, String(items.length), badgeX, badgeY, {
        font: "bold 10px 'Inter', system-ui, sans-serif",
        color: '#fff',
        align: 'center',
        baseline: 'middle',
      });
    }
  }
}

// ─── Stump Items (emojis on counter positions) ──────────

export function renderStumpItems(ctx, state) {
  if (!state.counterItems) return;
  for (const item of state.counterItems) {
    if (item.picked) continue;

    const x = OX + item.col * TS + TS / 2;
    const y = OY + item.row * TS + TS / 2;

    // Wood stump-top pedestal (shared themed surface) — names render in the focused-item
    // pill so long Greek strings don't bleed.
    drawFoodItem(ctx, item.emoji, x, y, { surface: 'shelf', time: state.time, bob: 1, emojiSize: 22, icon: item.icon });
  }
}

// ─── Focused-item pill (anchored at canvas TOP-center, below topBar zone) ──
// Shows emoji + name of the stump/floor item the player is currently next to.
// Anchored at the top so it doesn't collide with the bottom actionPrompt pill.
export function renderFocusedItemPill(ctx, state, t) {
  const item = state.focusedItem;
  if (!item) return;
  const label = item.name || (item.nameKey && t ? t(item.nameKey) : '');
  if (!label) return;

  const py = 40;
  const px = CANVAS_W / 2;

  ctx.font = "bold 16px 'Inter', system-ui, sans-serif";
  const textWidth = ctx.measureText(label).width;
  const emojiWidth = 28;
  const pad = 18;
  const pillW = textWidth + emojiWidth + pad * 2 + 8;
  const pillH = 38;
  const pillX = px - pillW / 2;
  const pillY = py - pillH / 2;

  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 19, 'rgba(46, 125, 50, 0.96)', '#1B5E20');

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  if (hasDrawnIcon(item)) drawItemGlyph(ctx, item, pillX + pad + 11, py, 22, 'middle');
  else drawItemGlyph(ctx, { emoji: item.emoji || '📦' }, pillX + pad, py, 22, 'middle');

  drawText(ctx, label, pillX + pad + emojiWidth + 6, py, {
    font: "bold 16px 'Inter', system-ui, sans-serif",
    color: '#FFFFFF',
    align: 'left',
    baseline: 'middle',
  });
}

// ─── Chef NPC ───────────────────────────────────────────
// Σεφ Κομπόστ — interactive compost guide. Stand next to him + Enter to get help.

export const CHEF_POSITION = { col: 16, row: 12 };

export function renderChefNPC(ctx, state) {
  const cx = OX + CHEF_POSITION.col * TS + TS / 2;
  const cyBase = OY + CHEF_POSITION.row * TS + TS / 2;
  // Idle bob — gentle vertical oscillation makes the sprite feel alive without distracting.
  const bob = Math.sin(state.time * 1.6) * 1.5;
  const cy = cyBase + bob;
  // Soft shadow under feet keeps him grounded after we bob him.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, cyBase + 15, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // When the player is within 2 tiles, draw a soft pulsing glow ring to signal "you can interact".
  if (state.nearChef) {
    const pulse = 0.35 + Math.sin(state.time * 3) * 0.2;
    ctx.globalAlpha = pulse;
    const grad = ctx.createRadialGradient(cx, cyBase + 4, 6, cx, cyBase + 4, 22);
    grad.addColorStop(0, 'rgba(255, 235, 59, 0.7)');
    grad.addColorStop(1, 'rgba(255, 235, 59, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cyBase + 4, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (DRAFT_MODE) {
    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(cx - 9, cy - 6, 18, 22);
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.arc(cx, cy - 11, 7, 0, Math.PI * 2);
    ctx.fill();
    drawText(ctx, 'CHEF', cx, cy + 20, {
      font: "bold 8px sans-serif", color: '#4E342E',
      align: 'center', baseline: 'middle',
    });
    return;
  }

  // ── Body (apron) ──
  // Slightly trapezoid-feel via two stacked rects with green stripe down the middle.
  ctx.fillStyle = '#F5F5F5';
  ctx.fillRect(cx - 10, cy - 3, 20, 20);
  // Apron front shadow at edges so it looks dimensional, not flat.
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(cx - 10, cy - 3, 3, 20);
  ctx.fillRect(cx + 7, cy - 3, 3, 20);
  // Green leaf stripe
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(cx - 2, cy - 3, 4, 20);
  // Leaf badge centered on stripe
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🌿', cx, cy + 6);

  // Apron strap loop
  ctx.strokeStyle = '#E0E0E0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy - 3);
  ctx.lineTo(cx - 2, cy - 8);
  ctx.moveTo(cx + 8, cy - 3);
  ctx.lineTo(cx + 2, cy - 8);
  ctx.stroke();

  // Arms (short ones, hugging sides)
  ctx.fillStyle = '#F5F5F5';
  ctx.fillRect(cx - 13, cy + 2, 4, 11);
  ctx.fillRect(cx + 9, cy + 2, 4, 11);
  // Hands (peach tone)
  ctx.fillStyle = '#FFCC80';
  ctx.beginPath();
  ctx.arc(cx - 11, cy + 14, 2.5, 0, Math.PI * 2);
  ctx.arc(cx + 11, cy + 14, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // ── Head ──
  ctx.fillStyle = '#FFCC80';
  ctx.beginPath();
  ctx.arc(cx, cy - 11, 8, 0, Math.PI * 2);
  ctx.fill();
  // Head shadow (slight)
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.beginPath();
  ctx.arc(cx + 1, cy - 9, 8, 0.3 * Math.PI, 1.7 * Math.PI, true);
  ctx.fill();

  // ── Chef hat ──
  // Band
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(cx - 9, cy - 16, 18, 4);
  ctx.strokeStyle = '#E0E0E0';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(cx - 9, cy - 16, 18, 4);
  // Puffy top — two overlapping circles for a chef-poof shape
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 21, 5, 0, Math.PI * 2);
  ctx.arc(cx + 4, cy - 21, 5, 0, Math.PI * 2);
  ctx.arc(cx, cy - 24, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#E8E8E8';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // ── Face ──
  // Eyes with sparkle pixel
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(cx - 3, cy - 11, 1.4, 0, Math.PI * 2);
  ctx.arc(cx + 3, cy - 11, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx - 2.5, cy - 11.5, 0.5, 0, Math.PI * 2);
  ctx.arc(cx + 3.5, cy - 11.5, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // Rosy cheeks
  ctx.fillStyle = 'rgba(244, 143, 177, 0.55)';
  ctx.beginPath();
  ctx.arc(cx - 5, cy - 8, 1.5, 0, Math.PI * 2);
  ctx.arc(cx + 5, cy - 8, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Wider, friendlier smile
  ctx.strokeStyle = '#5D4037';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy - 7, 3.5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // ── Name plate above hat ──
  // Sits 6 px above the hat top so it doesn't compete with the speech indicator.
  // Localised via state.chefName (set from compost.chef.name); Greek fallback for safety.
  ctx.font = "bold 9px 'Inter', system-ui, sans-serif";
  const nameLabel = state.chefName || 'Σεφ Κομπόστ';
  const nameW = ctx.measureText(nameLabel).width + 10;
  drawRoundedRect(ctx, cx - nameW / 2, cy - 42, nameW, 13, 6, '#33691E', '#1B5E20');
  drawText(ctx, nameLabel, cx, cy - 35, {
    font: "bold 9px 'Inter', system-ui, sans-serif",
    color: '#FFFFFF',
    align: 'center',
    baseline: 'middle',
  });

  // ── Speech-bubble attribution indicator ──
  // Bright + larger when actively talking, soft when idle so kids learn he's the speaker.
  const hasTip = state.chefTip && state.chefTipTimer > 0;
  const bubBob = Math.sin(state.time * 3) * 1.2;
  const ix = cx + 12;
  const iy = cy - 24 + bubBob;
  const bubR = hasTip ? 7 : 5.5;
  ctx.globalAlpha = hasTip ? 1 : 0.6;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(ix, iy, bubR + 1, bubR, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4CAF50';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Bubble tail
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(ix - 5, iy + 4);
  ctx.lineTo(ix - 1, iy + 8);
  ctx.lineTo(ix - 1, iy + 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4CAF50';
  ctx.beginPath();
  ctx.moveTo(ix - 5, iy + 4);
  ctx.lineTo(ix - 1, iy + 8);
  ctx.stroke();
  // 💬 glyph
  drawText(ctx, '💬', ix, iy, {
    font: hasTip ? "10px sans-serif" : "8px sans-serif",
    color: '#1B5E20',
    align: 'center',
    baseline: 'middle',
  });
  ctx.globalAlpha = 1;
}

// ─── Chef Tip Bubble ────────────────────────────────────

export function renderChefTipBubble(ctx, state) {
  if (!state.chefTip || state.chefTipTimer <= 0) return;

  const chef = { col: 16, row: 12 };
  const cx = OX + chef.col * TS + TS / 2;
  const cy = OY + chef.row * TS;

  const text = state.chefTip;
  // Conditional correct (tea bag, leftover fries) → amber border + amber text instead of green.
  const isAmber = !!state.chefTipAmber;
  const borderColor = isAmber ? '#F4A72C' : '#4CAF50';
  const textColor = isAmber ? '#7A4F00' : '#1B5E20';

  // Tip may include an extra "⚠ note" line — split so the bubble can wrap.
  const lines = String(text).split('\n');

  if (DRAFT_MODE) {
    ctx.font = "bold 8px sans-serif";
    const widestLine = Math.max(...lines.map(l => ctx.measureText(l).width));
    const bw = Math.max(widestLine + 12, 70);
    const bh = 14 + lines.length * 10;
    const bx = cx - bw / 2;
    const by = cy - bh - 10;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    lines.forEach((line, i) => {
      drawText(ctx, line, cx, by + 8 + i * 10, {
        font: "bold 7px sans-serif", color: textColor,
        align: 'center', baseline: 'middle',
      });
    });
    return;
  }

  const alpha = Math.min(1, state.chefTipTimer * 2);
  ctx.globalAlpha = alpha;

  const font = "bold 10px 'Inter', system-ui, sans-serif";
  ctx.font = font;
  const widestLine = Math.max(...lines.map(l => ctx.measureText(l).width));
  const bw = Math.max(widestLine + 16, 80);
  const bh = 14 + lines.length * 14;
  const bx = cx - bw / 2;
  // Clear of the chef's name plate (top at cy - 26 minus bob) plus the 5px tail.
  const by = cy - 46 - bh;

  drawRoundedRect(ctx, bx, by, bw, bh, 8, 'rgba(255,255,255,0.95)', borderColor);

  // Tail
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(cx - 4, by + bh);
  ctx.lineTo(cx, by + bh + 5);
  ctx.lineTo(cx + 4, by + bh);
  ctx.closePath();
  ctx.fill();

  // Text — one drawText per line for the warning note
  lines.forEach((line, i) => {
    drawText(ctx, line, cx, by + 14 + i * 14, {
      font,
      color: textColor,
      align: 'center',
      baseline: 'middle',
    });
  });

  ctx.globalAlpha = 1;
}

// ─── Reveal Progress Indicator ──────────────────────────

export function renderRevealOverlay(ctx, state) {
  if (!state.revealing) return;

  const progress = state.revealIndex / (state.revealList?.length || 1);
  const bw = 200;
  const bh = 8;
  const bx = (CANVAS_W - bw) / 2;
  const by = CANVAS_H - 50;

  drawRoundedRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, 6, 'rgba(0,0,0,0.4)', null);
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(bx, by, bw * progress, bh);
}

// ─── Sourced fact card (HUD, screen coords) ──────────────────
// Word-wrap helper for the verbatim quote.
function wrapLines(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// HUD card that surfaces a verbatim, sourced fact. Reuses the
// Island-1/FridgeManager affordance: a green "why it belongs here" header, the verbatim
// quote in a CREAM sub-panel (Inter italic), the app-wide gold «📖 publisher» chip via the
// shared renderSourceChip(), and «Press S». The chip rect is stored on state.sourceBadgeRect
// so a mouse click opens the source too. Driven by state.factCard = { emoji, title, fact,
// sourceId }; the chef sets it on "ask" for an item that has a sourced fact.
export function renderCompostFactCard(ctx, state, t) {
  const fc = state.factCard;
  if (!fc) {
    state.sourceBadgeRect = null;
    return;
  }

  const pad = 16;
  const cardW = 560;
  const x = (CANVAS_W - cardW) / 2;

  // Header (sort-level, non-factual): emoji + title.
  ctx.font = "600 15px 'Inter', system-ui, sans-serif";
  const headLines = wrapLines(ctx, fc.title || '', cardW - pad * 2 - 30);

  // fc.paraphrase: OUR own plain sentence, so it is set upright and unquoted, because
  // quotation marks would pass our wording off as the source's. Without the flag the card still
  // renders a verbatim quote in italics, exactly as before.
  const factFont = fc.paraphrase
    ? "14px 'Inter', system-ui, sans-serif"
    : "italic 14px 'Inter', system-ui, sans-serif";
  ctx.font = factFont;
  const factLines = wrapLines(ctx, fc.paraphrase ? String(fc.fact) : `“${fc.fact}”`, cardW - pad * 2 - 24);

  const lineH = 20;
  const factPanelH = 12 + factLines.length * 19 + 12;
  // Source row = TWO centred lines (badge, then «Press S»). They shared one line until
  // 2026-08-06 and overlapped on the wider locales, the same collision fixed on the 3.1 card.
  const cardH = pad + headLines.length * lineH + 10 + factPanelH + 8 + 64 + pad;
  const y = CANVAS_H - cardH - 20;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Card body + accepted-green edge.
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  drawRoundedRect(ctx, x, y, cardW, cardH, 14, '#2E7D32', null);
  ctx.shadowColor = 'transparent';
  drawRoundedRect(ctx, x, y, cardW, cardH, 14, null, WORLD_ART.pillBorder);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = WORLD_ART.pillBorder;
  ctx.stroke();

  let cy = y + pad;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '18px system-ui';
  ctx.fillStyle = '#FFFFFF';
  if (hasDrawnIcon(fc)) drawItemGlyph(ctx, fc, x + pad + 10, cy - 1, 20, 'top');
  else ctx.fillText(fc.emoji || '🌱', x + pad, cy - 1);
  ctx.font = '18px system-ui';
  ctx.font = "600 15px 'Inter', system-ui, sans-serif";
  for (const ln of headLines) {
    ctx.fillText(ln, x + pad + 28, cy);
    cy += lineH;
  }

  // Cream sub-panel with the verbatim quote.
  cy += 10;
  const panelX = x + pad;
  const panelW = cardW - pad * 2;
  drawRoundedRect(ctx, panelX, cy, panelW, factPanelH, 10, PANEL_CREAM, null);
  let qy = cy + 12;
  ctx.fillStyle = QUOTE_BROWN;
  ctx.font = factFont;
  for (const ln of factLines) {
    ctx.fillText(ln, panelX + 12, qy);
    qy += 19;
  }
  cy += factPanelH + 8;

  // Shared gold source chip + «Press S». Store rect for click hit-testing.
  state.sourceBadgeRect = renderSourceChip(ctx, CANVAS_W / 2, cy, fc.sourceId);
  const pressS = (t && t('compost.press_s', 'Press S for the source ↗')) || 'Press S ↗';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = "600 12px 'Inter', system-ui, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pressS, CANVAS_W / 2, cy + 32);

  const continuePrompt = (t && t(
    'compost.fact_continue_prompt',
    'Press Enter or Space to continue',
  )) || 'Press Enter or Space to continue';
  ctx.fillStyle = '#FFE082';
  ctx.font = "700 12px 'Inter', system-ui, sans-serif";
  ctx.fillText(continuePrompt, CANVAS_W / 2, cy + 50);

  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
