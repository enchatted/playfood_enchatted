// LeftoverChef renderer — kitchen-specific rendering for "The Magic Rescue Pot".
// Warm kitchen wall, checkered floor, granite counters, large rescue pot, recipe cards.

import {
  CANVAS_W, CANVAS_H, TILE_SIZE as TS,
} from '../../overworld/overworldData.js';
import { TILE } from '../../overworld/tileAtlas.js';
import { drawRoundedRect, drawText, renderSourceChip } from '../../utils/canvas.js';
import { drawFoodItem } from './itemSurface.js';
import { WORLD_ART } from '../../styles/brandColors.js';
import { OX, OY, drawNPCSprite, NPC_PALETTES } from './gameRoomRenderer.js';
import { DRAFT_MODE } from '../../config/draftMode.js';
import { canvasCssScale, readableUnit } from '../../utils/hidpi.js';

// Deterministic per-tile variant (same hash as gameRoomRenderer)
function vari(col, row, count) {
  return ((col * 7 + row * 13 + col * row) & 0x7FFFFFFF) % count;
}

// ─── Kitchen Wall (row 0) ──────────────────────────────

export function renderKitchenWall(ctx) {
  const wy = OY;

  if (DRAFT_MODE) {
    // Flat brown wall with simple outlines
    for (let c = 0; c < 20; c++) {
      const cx = OX + c * TS;
      ctx.fillStyle = '#A1887F';
      ctx.fillRect(cx, wy, TS, TS);
      ctx.strokeStyle = '#795548';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, wy, TS, TS);
    }
    // "CABINETS" label
    drawText(ctx, 'KITCHEN WALL', OX + 10 * TS, wy + TS / 2, {
      font: "bold 10px sans-serif", color: '#4E342E',
      align: 'center', baseline: 'middle',
    });
    return;
  }

  // Wooden cabinet panels across row 0
  for (let c = 1; c <= 18; c++) {
    const cx = OX + c * TS;

    // Cabinet body
    const cabGrad = ctx.createLinearGradient(cx, wy, cx, wy + TS);
    cabGrad.addColorStop(0, '#8D6E63');
    cabGrad.addColorStop(0.5, '#A1887F');
    cabGrad.addColorStop(1, '#795548');
    ctx.fillStyle = cabGrad;
    ctx.fillRect(cx, wy, TS, TS);

    // Cabinet door outline
    ctx.strokeStyle = 'rgba(62,39,35,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 2, wy + 2, TS - 4, TS - 4);

    // Door handle
    const v = vari(c, 0, 3);
    ctx.fillStyle = '#FFD54F';
    ctx.beginPath();
    ctx.arc(cx + TS / 2 + (v - 1) * 2, wy + TS * 0.6, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Corner posts
  for (const c of [0, 19]) {
    const cx = OX + c * TS;
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(cx, wy, TS, TS);
  }

  // Overhead lights
  for (const lc of [5, 10, 15]) {
    const lx = OX + lc * TS + TS / 2;
    const ly = wy + 4;
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#FFF9C4';
    ctx.beginPath();
    ctx.arc(lx, ly + 6, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#FFE082';
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#F9A825';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = '#5D4037';
    ctx.beginPath();
    ctx.moveTo(lx, wy);
    ctx.lineTo(lx, ly - 3);
    ctx.stroke();
  }
}

// ─── Checkered Kitchen Floor ───────────────────────────

export function renderKitchenFloor(ctx, roomMap) {
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 20; col++) {
      if (roomMap[row][col] !== TILE.FLOOR_WOOD) continue;

      const fx = OX + col * TS;
      const fy = OY + row * TS;

      if (DRAFT_MODE) {
        // Single flat color + visible grid
        ctx.fillStyle = '#E8E0D8';
        ctx.fillRect(fx, fy, TS, TS);
        ctx.strokeStyle = 'rgba(120,100,80,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(fx, fy, TS, TS);
        continue;
      }

      // Warm tile checker (WORLD_ART pebble tones). Base every tile light, then tint the
      // dark squares at half-strength so the checker is SOFT — a warm kitchen floor, not a
      // stark chessboard (C11 P3 floor-soften).
      const light = (col + row) % 2 === 0;
      ctx.fillStyle = WORLD_ART.pebbleLight;
      ctx.fillRect(fx, fy, TS, TS);
      if (!light) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = WORLD_ART.pebbleDark;
        ctx.fillRect(fx, fy, TS, TS);
        ctx.restore();
      }

      // Subtle tile border
      ctx.strokeStyle = 'rgba(93,64,55,0.08)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(fx, fy, TS, TS);
    }
  }
}

// ─── Counter Tops ──────────────────────────────────────

export function counterBenchRects(roomMap) {
  const seen = new Set();
  const benches = [];

  for (let row = 0; row < roomMap.length; row++) {
    for (let col = 0; col < roomMap[row].length; col++) {
      const startKey = `${col},${row}`;
      if (roomMap[row][col] !== TILE.COUNTER || seen.has(startKey)) continue;

      const pending = [{ col, row }];
      let minCol = col, maxCol = col, minRow = row, maxRow = row;
      seen.add(startKey);

      while (pending.length) {
        const cell = pending.pop();
        minCol = Math.min(minCol, cell.col);
        maxCol = Math.max(maxCol, cell.col);
        minRow = Math.min(minRow, cell.row);
        maxRow = Math.max(maxRow, cell.row);

        for (const next of [
          { col: cell.col - 1, row: cell.row },
          { col: cell.col + 1, row: cell.row },
          { col: cell.col, row: cell.row - 1 },
          { col: cell.col, row: cell.row + 1 },
        ]) {
          const key = `${next.col},${next.row}`;
          if (seen.has(key) || roomMap[next.row]?.[next.col] !== TILE.COUNTER) continue;
          seen.add(key);
          pending.push(next);
        }
      }

      benches.push({
        col: minCol,
        row: minRow,
        width: maxCol - minCol + 1,
        height: maxRow - minRow + 1,
      });
    }
  }

  return benches.sort((a, b) => a.col - b.col || a.row - b.row);
}

export function counterBenchLabelLayout(roomMap) {
  return counterBenchRects(roomMap).map((bench) => {
    const benchX = OX + bench.col * TS;
    const benchY = OY + bench.row * TS;
    const benchWidth = bench.width * TS;
    const width = 148;
    const height = 23;

    return {
      side: bench.col < 10 ? 'left' : 'right',
      x: benchX + benchWidth / 2 - width / 2,
      // Sit the smaller sign inside the station frame so it reads as a bench
      // label and leaves a clear gap beneath the primary rescue objective.
      y: benchY - height + 8,
      width,
      height,
      benchY,
    };
  });
}

// While the «Rescued!» reveal and its safety card are up, the banner keeps
// the goal that dish just met, so the tip is read next to the foods it is about (the
// next goal and its glowing counters appear once the child continues).
export function isDishRecap(state) {
  return Boolean((state.dishReveal || state.pendingFact || state.factCard)
    && (state.completedGoals?.length || 0) > 0);
}

export function activeGoalItemIds(state) {
  const goals = state.goals || [];
  if (!goals.length || (state.completedGoals?.length || 0) >= goals.length) return [];
  if (isDishRecap(state)) return [];
  const goalIndex = Math.min(state.goalIndex || 0, goals.length - 1);
  return [...(goals[goalIndex]?.atRisk || [])];
}

export function isActiveGoalItem(state, itemId) {
  return activeGoalItemIds(state).includes(itemId);
}

export function renderCounterTops(ctx, roomMap) {
  for (const bench of counterBenchRects(roomMap)) {
    const x = OX + bench.col * TS;
    const y = OY + bench.row * TS;
    const w = bench.width * TS;
    const h = bench.height * TS;

    if (DRAFT_MODE) {
      drawRoundedRect(ctx, x, y, w, h, 7, '#A1887F', '#5D4037');
      continue;
    }

    drawRoundedRect(ctx, x + 4, y + 6, w, h, 10, 'rgba(62,39,35,0.24)', null);
    const counterGradient = ctx.createLinearGradient(x, y, x + w, y);
    counterGradient.addColorStop(0, '#6D4C41');
    counterGradient.addColorStop(0.5, '#A1887F');
    counterGradient.addColorStop(1, '#795548');
    drawRoundedRect(ctx, x, y, w, h, 10, counterGradient, '#4E342E');

    // The half facing the central aisle is the preparation surface. The outer
    // half reads as cabinetry, so ingredients feel placed on one real bench.
    const facesRight = bench.col < 10;
    const prepX = facesRight ? x + TS : x;
    const cabinetX = facesRight ? x : x + TS;
    drawRoundedRect(ctx, prepX + 3, y + 4, TS - 6, h - 8, 6, '#C8B5A8', '#6D4C41');
    drawRoundedRect(ctx, cabinetX + 4, y + 5, TS - 8, h - 10, 6, '#76544C', '#4E342E');

    // Six shallow cream trays make this read as a preparation station rather than
    // a fridge or a tall cupboard. The food artwork sits on these trays.
    for (let station = 0; station < bench.height; station++) {
      const trayY = y + station * TS + 4;
      drawRoundedRect(ctx, prepX + 5, trayY, TS - 10, TS - 8, 5, '#E6D8C7', '#8D6E63');
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fillRect(prepX + 9, trayY + 3, TS - 18, 1);
    }

    // Three broad cupboard doors keep the outer half calm and furniture-like.
    for (let panel = 0; panel < 3; panel++) {
      const panelY = y + panel * TS * 2 + 5;
      ctx.strokeStyle = 'rgba(255,248,225,0.16)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cabinetX + 7, panelY + 3, TS - 14, TS * 2 - 12);
      ctx.fillStyle = '#D6B85F';
      ctx.beginPath();
      ctx.arc(cabinetX + TS / 2, panelY + TS - 3, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(78,52,46,0.42)';
    ctx.lineWidth = 1;
    for (let station = 1; station < bench.height; station++) {
      const dividerY = y + station * TS;
      ctx.beginPath();
      ctx.moveTo(x + 4, dividerY);
      ctx.lineTo(x + w - 4, dividerY);
      ctx.stroke();
    }

    // A narrow brass rail visually joins all six preparation trays.
    ctx.fillStyle = '#D6B85F';
    const railX = facesRight ? x + w - 3 : x + 1;
    ctx.fillRect(railX, y + 8, 2, h - 16);
  }
}

export function renderCounterStationLabels(ctx, roomMap, t) {
  const text = t
    ? t('leftover_chef.available_leftovers', 'Available leftovers')
    : 'Available leftovers';

  for (const label of counterBenchLabelLayout(roomMap)) {
    // Two short wooden supports connect the sign to the station beneath it.
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(label.x + 18, label.y + label.height - 1, 4, 8);
    ctx.fillRect(label.x + label.width - 22, label.y + label.height - 1, 4, 8);

    drawRoundedRect(
      ctx,
      label.x + 2,
      label.y + 3,
      label.width,
      label.height,
      8,
      'rgba(62,39,35,0.22)',
      null,
    );
    drawRoundedRect(ctx, label.x, label.y, label.width, label.height, 8, '#FFF8E1', '#5D4037');
    ctx.fillStyle = '#6D4C41';
    ctx.fillRect(label.x + 7, label.y + label.height - 5, label.width - 14, 2);

    let fontSize = 10.5;
    do {
      ctx.font = `700 ${fontSize}px 'Inter', system-ui, sans-serif`;
      fontSize -= 0.5;
    } while (fontSize > 9.5 && ctx.measureText(text).width > label.width - 18);

    drawText(ctx, text, label.x + label.width / 2, label.y + label.height / 2 - 1, {
      font: ctx.font,
      color: '#4E342E',
      align: 'center',
      baseline: 'middle',
    });
  }
}

// ─── Kitchen staff ─────────────────────────────────────

export function getKitchenStaffMotion(state, index = 0) {
  const blockedByOverlay = state.showMissionIntro
    || state.cooking
    || state.dishReveal
    || state.factCard
    || state.celebrating;

  if (blockedByOverlay) {
    return { offsetX: 0, offsetY: 0, walkFrame: 0, activityOffsetY: 0 };
  }

  const time = state.time || 0;
  const phase = time * 3.2 + index * Math.PI;
  return {
    offsetX: Math.sin(phase) * 1.6,
    offsetY: -Math.abs(Math.sin(phase * 0.8)) * 1.2,
    walkFrame: Math.floor(time * 3 + index) % 2,
    activityOffsetY: Math.sin(phase * 1.35) * 1.5,
  };
}

export function renderKitchenStaff(ctx, state, room) {
  for (const [index, staff] of (room.kitchenStaff || []).entries()) {
    const baseX = OX + staff.col * TS;
    const baseY = OY + staff.row * TS;
    const motion = getKitchenStaffMotion(state, index);
    const x = baseX + motion.offsetX;
    const y = baseY + motion.offsetY;

    ctx.fillStyle = index === 0 ? 'rgba(255,138,101,0.18)' : 'rgba(77,208,225,0.18)';
    ctx.beginPath();
    ctx.ellipse(baseX + TS / 2, baseY + TS - 1, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    drawNPCSprite(
      ctx,
      x,
      y,
      NPC_PALETTES[staff.paletteIndex % NPC_PALETTES.length],
      staff.dir,
      motion.walkFrame,
      state.time,
    );

    // White apron and chef hat turn the shared NPC sprite into kitchen staff.
    ctx.fillStyle = '#FFF8E1';
    ctx.fillRect(x + 11, y + 16, 10, 9);
    ctx.fillStyle = '#66BB6A';
    ctx.fillRect(x + 15, y + 16, 2, 9);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x + 12, y + 3, 5, 0, Math.PI * 2);
    ctx.arc(x + 20, y + 3, 5, 0, Math.PI * 2);
    ctx.arc(x + 16, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + 8, y + 3, 16, 4);

    const activityX = staff.dir === 3 ? x + 29 : x + 3;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      staff.activity === 'mix' ? '🥣' : '🍽️',
      activityX,
      y + 20 + motion.activityOffsetY,
    );
    ctx.restore();
  }
}

// ─── Rescue Pot ────────────────────────────────────────

const POT_CENTER_X = OX + 10 * TS;
const POT_TOP_Y = OY + 6.15 * TS;
const POT_W = 2.9 * TS;
const POT_H = 1.55 * TS;

const LEFTOVER_PROMPT_BOTTOM_GUTTER = 24;
const LEFTOVER_PROMPT_GAP = 14;
const LEFTOVER_ACTION_PROMPT_H = 42;
const LEFTOVER_DROP_PROMPT_H = 30;
const LEFTOVER_ACTION_PROMPT_MAX_W = 760;
const LEFTOVER_DROP_PROMPT_MAX_W = 560;

export function shouldRenderLeftoverInteractionPrompts(state) {
  return !state.cooking && !state.dishReveal && !state.factCard && !state.celebrating;
}

export function getLeftoverPromptLayout({ actionTextWidth = 0, dropTextWidth = 0 } = {}) {
  const dropY = CANVAS_H - LEFTOVER_PROMPT_BOTTOM_GUTTER - LEFTOVER_DROP_PROMPT_H;
  const actionY = dropY - LEFTOVER_PROMPT_GAP - LEFTOVER_ACTION_PROMPT_H;

  return {
    action: {
      width: Math.min(LEFTOVER_ACTION_PROMPT_MAX_W, Math.max(280, actionTextWidth + 62)),
      height: LEFTOVER_ACTION_PROMPT_H,
      y: actionY,
    },
    drop: {
      width: Math.min(LEFTOVER_DROP_PROMPT_MAX_W, Math.max(230, dropTextWidth + 42)),
      height: LEFTOVER_DROP_PROMPT_H,
      y: dropY,
    },
  };
}

function fitPromptFont(ctx, text, baseSize, minSize, maxWidth, weight = '700') {
  let size = baseSize;
  do {
    ctx.font = `${weight} ${size}px 'Inter', system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || size === minSize) break;
    size -= 1;
  } while (size >= minSize);
  return { font: ctx.font, width: ctx.measureText(text).width };
}

export function renderLeftoverInteractionPrompts(ctx, state) {
  if (!shouldRenderLeftoverInteractionPrompts(state)) return;

  const actionText = state.actionPrompt;
  const dropText = state.dropPrompt;
  if (!actionText && !dropText) return;

  const actionMetrics = actionText
    ? fitPromptFont(ctx, actionText, 15, 12, LEFTOVER_ACTION_PROMPT_MAX_W - 62)
    : { width: 0 };
  const dropMetrics = dropText
    ? fitPromptFont(ctx, dropText, 13, 11, LEFTOVER_DROP_PROMPT_MAX_W - 42)
    : { width: 0 };
  const layout = getLeftoverPromptLayout({
    actionTextWidth: actionMetrics.width,
    dropTextWidth: dropMetrics.width,
  });

  if (actionText) {
    const { width, height, y } = layout.action;
    const x = CANVAS_W / 2 - width / 2;
    const pulse = 0.94 + Math.sin(state.time * 3) * 0.06;
    ctx.globalAlpha = pulse;
    drawRoundedRect(ctx, x + 2, y + 3, width, height, 14, 'rgba(0,0,0,0.22)', 'transparent');
    drawRoundedRect(ctx, x, y, width, height, 14, 'rgba(255,255,255,0.94)', '#4CAF50');
    drawText(ctx, actionText, CANVAS_W / 2, y + height / 2, {
      font: actionMetrics.font,
      color: '#1A237E',
      align: 'center',
      baseline: 'middle',
    });
    drawText(ctx, '\u21B5', x + width - 22, y + height / 2 + Math.sin(state.time * 5) * 2, {
      font: 'bold 13px sans-serif', color: '#4CAF50', align: 'center', baseline: 'middle',
    });
    ctx.globalAlpha = 1;
  }

  if (dropText) {
    const { width, height, y } = layout.drop;
    const x = CANVAS_W / 2 - width / 2;
    ctx.globalAlpha = 0.84;
    drawRoundedRect(ctx, x, y, width, height, 10, 'rgba(93,64,55,0.9)', '#4E342E');
    drawText(ctx, dropText, CANVAS_W / 2, y + height / 2, {
      font: dropMetrics.font,
      color: '#FFECB3',
      align: 'center',
      baseline: 'middle',
    });
    ctx.globalAlpha = 1;
  }
}

export function renderRescuePot(ctx, state, t) {
  const px = POT_CENTER_X - POT_W / 2;
  const py = POT_TOP_Y;
  const centerX = POT_CENTER_X;
  const centerY = py + POT_H / 2;

  if (DRAFT_MODE) {
    drawRoundedRect(ctx, px - 8, py + 2, POT_W + 16, POT_H + 16, 8, '#D7CCC8', '#795548');
    drawRoundedRect(ctx, px, py, POT_W, POT_H, 9, '#FFF8E1', '#D65A3A');
    const label = t?.('leftover_chef.pot_label', 'RESCUE POT') || 'RESCUE POT';
    drawText(ctx, label, centerX, py + POT_H + 22, {
      font: "bold 9px sans-serif", color: '#5D4037',
      align: 'center', baseline: 'middle',
    });
    const potCount = state.potItems ? state.potItems.length : 0;
    if (potCount > 0) {
      drawText(ctx, `${potCount}`, centerX, centerY + 3, {
        font: "bold 10px sans-serif", color: '#fff',
        align: 'center', baseline: 'middle',
      });
    }
    return;
  }

  // Cooking shake offset
  let shakeX = 0, shakeY = 0;
  if (state.cooking) {
    shakeX = Math.sin(state.time * 30) * 3;
    shakeY = Math.cos(state.time * 25) * 2;
  }

  // Low enamel cooker island: the pot is visibly grounded, never floating.
  drawRoundedRect(
    ctx,
    px - 13,
    py - 7,
    POT_W + 26,
    POT_H + 27,
    13,
    '#D7CCC8',
    '#6D4C41',
  );
  ctx.fillStyle = '#BCAAA4';
  ctx.beginPath();
  ctx.ellipse(centerX, py + 14, POT_W * 0.42, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#795548';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Glow ring when player nearby with held item.
  if (state.heldItem && !state.cooking) {
    const pcol = state.player.col;
    const prow = state.player.row;
    const dist = Math.abs(pcol - 9.5) + Math.abs(prow - 6.5);
    if (dist < 4) {
      const pulse = 0.15 + Math.sin(state.time * 4) * 0.08;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#66BB6A';
      ctx.beginPath();
      ctx.ellipse(centerX, centerY + 5, POT_W * 0.65, POT_H * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Wide, shallow enamel pot — intentionally unlike the previous barrel shape.
  const potGrad = ctx.createLinearGradient(px, py, px, py + POT_H);
  potGrad.addColorStop(0, '#FFFDF3');
  potGrad.addColorStop(0.55, '#FFF3D6');
  potGrad.addColorStop(1, '#F1D7AA');
  ctx.fillStyle = potGrad;
  ctx.beginPath();
  ctx.moveTo(px + 5 + shakeX, py + 7 + shakeY);
  ctx.quadraticCurveTo(px + 9 + shakeX, py + POT_H + shakeY, px + 20 + shakeX, py + POT_H + shakeY);
  ctx.lineTo(px + POT_W - 20 + shakeX, py + POT_H + shakeY);
  ctx.quadraticCurveTo(px + POT_W - 9 + shakeX, py + POT_H + shakeY, px + POT_W - 5 + shakeX, py + 7 + shakeY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#D65A3A';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Terracotta lower band and rescue-leaf badge.
  ctx.fillStyle = '#E56F51';
  ctx.fillRect(px + 17 + shakeX, py + POT_H - 10 + shakeY, POT_W - 34, 8);
  ctx.fillStyle = '#43A047';
  ctx.beginPath();
  ctx.ellipse(centerX - 3 + shakeX, py + 30 + shakeY, 5, 3, -0.55, 0, Math.PI * 2);
  ctx.ellipse(centerX + 3 + shakeX, py + 27 + shakeY, 5, 3, 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Handles.
  ctx.strokeStyle = '#D65A3A';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(px + 1 + shakeX, centerY + shakeY, 9, Math.PI * 0.55, Math.PI * 1.45);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px + POT_W - 1 + shakeX, centerY + shakeY, 9, -Math.PI * 0.45, Math.PI * 0.45);
  ctx.stroke();

  // Dark opening with a bright enamel rim.
  ctx.fillStyle = '#D65A3A';
  ctx.beginPath();
  ctx.ellipse(centerX + shakeX, py + 7 + shakeY, POT_W / 2 - 5, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4E342E';
  ctx.beginPath();
  ctx.ellipse(centerX + shakeX, py + 7 + shakeY, POT_W / 2 - 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Steam when cooking
  if (state.cooking) {
    for (let i = 0; i < 5; i++) {
      const sx = centerX + Math.sin(state.time * 3 + i * 1.5) * 15 + shakeX;
      const sy = py - 5 - (state.time * 20 + i * 12) % 30 + shakeY;
      const sAlpha = 0.15 + Math.sin(state.time * 5 + i) * 0.08;
      ctx.globalAlpha = sAlpha;
      ctx.fillStyle = '#ECEFF1';
      ctx.beginPath();
      ctx.arc(sx, sy, 4 + i * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Label plaque belongs to the cooker island, not loose floor text.
  const label = t?.('leftover_chef.pot_label', 'RESCUE POT') || 'RESCUE POT';
  const labelW = Math.min(POT_W + 22, 112);
  drawRoundedRect(ctx, centerX - labelW / 2, py - 28, labelW, 18, 8, '#FFF8E1', '#D65A3A');
  drawText(ctx, label, centerX, py - 19, {
    font: "bold 8px 'Inter', system-ui, sans-serif",
    color: '#6D4C41',
    align: 'center',
    baseline: 'middle',
  });

  // Items-in-pot badge
  const potCount = state.potItems ? state.potItems.length : 0;
  if (potCount > 0) {
    const badgeX = px + POT_W - 5 + shakeX;
    const badgeY = py + POT_H - 3 + shakeY;
    ctx.fillStyle = '#2E7D32';
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, 10, 0, Math.PI * 2);
    ctx.fill();
    drawText(ctx, `${potCount}`, badgeX, badgeY, {
      font: "bold 9px 'Inter', system-ui, sans-serif",
      color: '#fff',
      align: 'center',
      baseline: 'middle',
    });
  }
}

// ─── Pot Items (emojis floating inside pot) ────────────

export function renderPotItems(ctx, state) {
  if (!state.potItems || state.potItems.length === 0) return;

  const centerX = POT_CENTER_X;
  const centerY = POT_TOP_Y + 6;

  if (DRAFT_MODE) {
    // Static emojis, no animation
    const positions = [[-10, -4], [10, -4], [0, 8]];
    for (let i = 0; i < state.potItems.length; i++) {
      const [ox, oy] = positions[i] || [0, 0];
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(state.potItems[i].emoji, centerX + ox, centerY + oy);
    }
    return;
  }

  let shakeX = 0, shakeY = 0;
  if (state.cooking) {
    shakeX = Math.sin(state.time * 30) * 3;
    shakeY = Math.cos(state.time * 25) * 2;
  }

  const positions = [
    [-10, -4], [10, -4], [0, 8],
  ];

  for (let i = 0; i < state.potItems.length; i++) {
    const item = state.potItems[i];
    const [ox, oy] = positions[i] || [0, 0];
    const bob = Math.sin(state.time * 2 + i * 2) * 2;

    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.emoji, centerX + ox + shakeX, centerY + oy + bob + shakeY);
  }
}

// ─── Counter Items (ingredient emojis on counters) ─────

export function renderCounterItems(ctx, state) {
  if (!state.counterItems) return;
  const visible = state.counterItems.filter((i) => !i.picked);
  for (const item of visible) {
    const x = OX + item.col * TS + TS / 2;
    const y = OY + item.row * TS + TS / 2;

    if (isActiveGoalItem(state, item.id)) {
      const pulse = 0.22 + (Math.sin((state.time || 0) * 2.4) + 1) * 0.04;
      ctx.save();
      ctx.shadowColor = 'rgba(255,193,7,0.72)';
      ctx.shadowBlur = 8;
      drawRoundedRect(ctx, x - 14, y - 14, 28, 28, 7, `rgba(255,213,79,${pulse})`, '#F9A825');
      ctx.restore();
    }

    // Wooden counter pedestal + item (shared themed surface) — kitchen counter language.
    drawFoodItem(ctx, item.emoji, x, y - 1, {
      surface: null,
      time: state.time,
      bob: 1,
      emojiSize: 22,
    });

  }
  // Product-name captions are temporarily hidden until the compact label
  // treatment is finalised; the food artwork remains fully visible.
}

// ─── Recipe Cards (HUD, outside zoom) ──────────────────

export function renderRecipeCards(ctx, state, t) {
  if (!state.recipes) return;

  const cardW = 140;
  const cardH = 52;
  const spacing = 12;
  const totalW = state.recipes.length * cardW + (state.recipes.length - 1) * spacing;
  const startX = (CANVAS_W - totalW) / 2;
  const startY = 56;

  for (let i = 0; i < state.recipes.length; i++) {
    const recipe = state.recipes[i];
    const rx = startX + i * (cardW + spacing);
    const ry = startY;
    const done = state.completedRecipes && state.completedRecipes.includes(recipe.id);
    const emojis = recipe.ingredientEmojis || [];

    if (DRAFT_MODE) {
      ctx.fillStyle = done ? 'rgba(76,175,80,0.6)' : 'rgba(80,80,80,0.5)';
      ctx.fillRect(rx, ry, cardW, cardH);
      ctx.strokeStyle = done ? '#388E3C' : '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry, cardW, cardH);
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(recipe.emoji, rx + 6, ry + 16);
      const name = t?.(recipe.nameKey, recipe.id) || recipe.id;
      drawText(ctx, name, rx + 28, ry + 16, {
        font: "bold 10px sans-serif", color: '#fff',
        align: 'left', baseline: 'middle',
      });
      // Ingredient emojis row
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      for (let j = 0; j < emojis.length; j++) {
        ctx.fillText(emojis[j], rx + 30 + j * 22, ry + 38);
      }
      if (done) {
        drawText(ctx, 'DONE', rx + cardW - 24, ry + 16, {
          font: "bold 9px sans-serif", color: '#C8E6C9',
          align: 'center', baseline: 'middle',
        });
      }
      continue;
    }

    // Card background
    const bgColor = done ? 'rgba(56,142,60,0.9)' : 'rgba(55,71,79,0.75)';
    const borderColor = done ? '#2E7D32' : 'rgba(255,255,255,0.15)';
    drawRoundedRect(ctx, rx, ry, cardW, cardH, 10, bgColor, borderColor);

    // Recipe emoji
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(recipe.emoji, rx + 8, ry + 18);

    // Recipe name
    const name = t?.(recipe.nameKey, recipe.id) || recipe.id;
    drawText(ctx, name, rx + 32, ry + 18, {
      font: "bold 11px 'Inter', system-ui, sans-serif",
      color: done ? '#E8F5E9' : '#CFD8DC',
      align: 'left',
      baseline: 'middle',
    });

    // Ingredient emojis row — shows what's needed
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let j = 0; j < emojis.length; j++) {
      ctx.globalAlpha = done ? 0.5 : 0.85;
      ctx.fillText(emojis[j], rx + 30 + j * 28, ry + 40);
    }
    ctx.globalAlpha = 1;

    // Checkmark
    if (done) {
      drawText(ctx, '\u2714', rx + cardW - 18, ry + 18, {
        font: "bold 16px 'Inter', system-ui, sans-serif",
        color: '#A5D6A7',
        align: 'center',
        baseline: 'middle',
      });
    }
  }
}

// ─── Cooking Animation Overlay ─────────────────────────

export function renderCookingOverlay(ctx, state) {
  if (!state.cooking) return;

  // Dim background
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.globalAlpha = 1;

  if (DRAFT_MODE) {
    // Static text, no pulse
    drawText(ctx, state.cookingText || 'Cooking...', CANVAS_W / 2, CANVAS_H / 2 + 100, {
      font: "bold 24px sans-serif", color: '#FFD54F',
      align: 'center', baseline: 'middle',
    });
    return;
  }

  // "Cooking..." text with pulse
  const pulse = 1 + Math.sin(state.time * 6) * 0.1;
  ctx.save();
  ctx.translate(CANVAS_W / 2, CANVAS_H / 2 + 100);
  ctx.scale(pulse, pulse);
  drawText(ctx, state.cookingText || 'Cooking...', 0, 0, {
    font: "bold 28px 'Inter', system-ui, sans-serif",
    color: '#FFD54F',
    align: 'center',
    baseline: 'middle',
  });
  ctx.restore();
}

// ─── Dish Reveal Overlay ───────────────────────────────

// The «Rescue idea» accepts a press only after this many seconds; LeftoverChef.jsx
// imports it for its input guard, so the prompt and the guard can never drift apart.
export const DISH_REVEAL_PROMPT_DELAY = 0.5;

// ─── Readable size on small screens ─────────────────────
export { canvasCssScale } from '../../utils/hidpi.js';

// The idea card's body text (15 logical px) reads at ≥ this many CSS px on screen. On
// 844×390 the canvas is drawn at ≈0.48, which left it at ≈7 px; full-size screens keep
// the card exactly as before (scale 1).
export const DISH_CARD_MIN_BODY_CSS_PX = 13;
export function dishRevealScale(cssScale) {
  return readableUnit(cssScale, 15, DISH_CARD_MIN_BODY_CSS_PX);
}

// Pure layout so tests can check sizes without a browser: every font size and box in
// logical px for a scale u. Lines are wrapped with the given measure function.
export function layoutDishReveal(dr, u, measure) {
  const s = (n) => Math.round(n * u);
  const pad = s(16);
  const cardW = Math.min(CANVAS_W - 40, s(560));
  const wrap = (text, font, maxW) => {
    if (!text) return [];
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && measure(next, font) > maxW) { lines.push(line); line = w; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const fonts = {
    title: `600 ${s(15)}px 'Inter', system-ui, sans-serif`,
    titleIcon: `${s(17)}px system-ui`,
    name: `800 ${s(21)}px 'Inter', system-ui, sans-serif`,
    emoji: `${s(34)}px system-ui`,
    body: `${s(15)}px 'Inter', system-ui, sans-serif`,
    home: `600 ${s(14)}px 'Inter', system-ui, sans-serif`,
    homeIcon: `${s(18)}px system-ui`,
    // the continue prompt grows a little more on small screens so it also reads at ≈12 CSS px
    prompt: `700 ${u > 1 ? s(14) : 12}px 'Inter', system-ui, sans-serif`,
    points: `800 ${s(18)}px 'Inter', system-ui, sans-serif`,
  };
  const nameLines = wrap(dr.name || '', fonts.name, cardW - pad * 2 - s(56));
  const textLines = wrap(dr.text || '', fonts.body, cardW - pad * 2 - s(24));
  const home = dr.homeIdea && dr.homeIdea.text ? dr.homeIdea : null;
  const homeLines = home ? wrap(`${home.label} ${home.text}`.trim(), fonts.home, cardW - pad * 2 - s(48)) : [];
  const nameLH = s(26); const bodyLH = s(20); const homeLH = s(19);
  const titleH = s(20) + s(8);
  const nameH = Math.max(s(40), nameLines.length * nameLH);
  const panelH = textLines.length ? s(12) + textLines.length * bodyLH + s(10) : 0;
  const homeH = homeLines.length ? s(14) + homeLines.length * homeLH + s(10) : 0;
  const promptH = s(12) + (u > 1 ? s(18) : 16);
  const cardH = pad + titleH + nameH + (panelH ? s(10) + panelH : 0) + (homeH ? s(14) + homeH : 0) + promptH + pad;
  return { u, s, pad, cardW, cardH, fonts, nameLines, textLines, homeLines, nameLH, bodyLH, homeLH, titleH, nameH, panelH, homeH };
}

export function renderDishReveal(ctx, state) {
  const dr = state.dishReveal;
  if (!dr) { state.dishRevealLayout = null; return; }

  // «Ιδέα αξιοποίησης» card: stays until
  // Enter/Space/A. Same bottom position as the safety card that follows it, in a
  // kitchen-brown so the two read as two different things (idea, then safety tip).
  // An optional, visibly separate «home idea» strip under the dish.
  ctx.save();
  const measure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
  const cssScale = canvasCssScale(ctx.canvas);
  // Grow for small screens, but never taller than the canvas (minus room for the +points pill).
  let L = layoutDishReveal(dr, dishRevealScale(cssScale), measure);
  const maxH = CANVAS_H - 20 - (dr.points ? L.s(52) : 0) - 8;
  for (let u = L.u; L.cardH > maxH && u > 1; ) {
    u = Math.max(1, u - 0.05);
    L = layoutDishReveal(dr, u, measure);
  }
  const { s, pad, cardW, cardH, fonts } = L;
  const x = (CANVAS_W - cardW) / 2;
  const y = CANVAS_H - cardH - 20;
  state.dishRevealLayout = {
    u: L.u, cssScale, x, y, w: cardW, h: cardH,
    bodyCssPx: 15 * L.u * cssScale, homeCssPx: 14 * L.u * cssScale,
    promptCssPx: (L.u > 1 ? 14 * L.u : 12) * cssScale,
    homeLines: L.homeLines.length, textLines: L.textLines.length,
  };

  ctx.globalAlpha = Math.min(1, (state.dishRevealElapsed ?? 1) * 4);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (dr.points) {
    const pointsText = `+${dr.points}`;
    ctx.font = fonts.points;
    const pillW = Math.max(s(84), ctx.measureText(pointsText).width + s(34));
    const pillH = s(32);
    const pillY = y - s(44);
    drawRoundedRect(ctx, CANVAS_W / 2 - pillW / 2, pillY, pillW, pillH, pillH / 2, '#2E7D32', '#A5D6A7');
    drawText(ctx, pointsText, CANVAS_W / 2, pillY + pillH / 2, {
      font: fonts.points, color: '#FFFFFF', align: 'center', baseline: 'middle',
    });
  }

  if (!DRAFT_MODE) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
  }
  drawRoundedRect(ctx, x, y, cardW, cardH, s(14), '#6D4C41', '#D7A86E');
  ctx.shadowColor = 'transparent';

  let cy = y + pad;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = fonts.titleIcon;
  ctx.fillText('💡', x + pad, cy - 1);
  ctx.font = fonts.title;
  ctx.fillText(dr.title || '', x + pad + s(26), cy);
  cy += L.titleH;

  // Dish emoji + name
  ctx.font = fonts.emoji;
  ctx.textBaseline = 'middle';
  ctx.fillText(dr.emoji || '🍲', x + pad + s(2), cy + L.nameH / 2);
  ctx.fillStyle = '#FFE082';
  ctx.font = fonts.name;
  const nameTop = cy + (L.nameH - L.nameLines.length * L.nameLH) / 2 + L.nameLH / 2;
  L.nameLines.forEach((ln, k) => ctx.fillText(ln, x + pad + s(50), nameTop + k * L.nameLH));
  cy += L.nameH;

  if (L.panelH) {
    cy += s(10);
    drawRoundedRect(ctx, x + pad, cy, cardW - pad * 2, L.panelH, s(10), SAFETY_CREAM, null);
    ctx.fillStyle = SAFETY_QUOTE;
    ctx.font = fonts.body;
    ctx.textBaseline = 'top';
    L.textLines.forEach((ln, k) => ctx.fillText(ln, x + pad + s(12), cy + s(12) + k * L.bodyLH));
    cy += L.panelH;
  }

  // The home idea sits BELOW the dish, after a dashed divider, in a lighter strip
  // with a house icon and its own label — it reads as an extra tip, not as the cooked dish.
  if (L.homeH) {
    cy += s(14);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,224,130,0.75)';
    ctx.setLineDash([s(5), s(4)]);
    ctx.lineWidth = Math.max(1.5, s(1.5));
    ctx.beginPath();
    ctx.moveTo(x + pad, cy - s(7));
    ctx.lineTo(x + cardW - pad, cy - s(7));
    ctx.stroke();
    ctx.restore();
    drawRoundedRect(ctx, x + pad, cy, cardW - pad * 2, L.homeH, s(10), '#8D6E63', '#BCAAA4');
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    ctx.font = fonts.homeIcon;
    ctx.fillText('🏠', x + pad + s(10), cy + s(11));
    ctx.font = fonts.home;
    L.homeLines.forEach((ln, k) => ctx.fillText(ln, x + pad + s(38), cy + s(14) + k * L.homeLH));
    cy += L.homeH;
  }

  // The prompt appears only once a press is accepted (the game ignores presses in the
  // first half second), so the child is never told to press when nothing would happen.
  if ((state.dishRevealElapsed ?? 1) >= DISH_REVEAL_PROMPT_DELAY) {
    ctx.fillStyle = '#FFE082';
    ctx.font = fonts.prompt;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(dr.continuePrompt || 'Press Enter or Space to continue', CANVAS_W / 2, cy + s(12));
  }
  ctx.restore();
}

// ─── Tip Banner ────────────────────────────────────────

export function renderTipBanner(ctx, state) {
  if (!state.tipBanner || state.tipBannerLife <= 0) return;

  const bw = Math.min(500, CANVAS_W - 100);
  const bh = 40;
  const bx = (CANVAS_W - bw) / 2;
  const by = CANVAS_H / 2 + 120;

  if (DRAFT_MODE) {
    // Simple box, no fade animation
    ctx.fillStyle = 'rgba(56,142,60,0.85)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#2E7D32';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    drawText(ctx, state.tipBanner, CANVAS_W / 2, by + bh / 2, {
      font: "bold 12px sans-serif", color: '#fff',
      align: 'center', baseline: 'middle',
    });
    return;
  }

  const alpha = Math.min(1, state.tipBannerLife * 2);
  ctx.globalAlpha = alpha;

  drawRoundedRect(ctx, bx, by, bw, bh, 14, 'rgba(56,142,60,0.95)', '#2E7D32');
  drawText(ctx, state.tipBanner, CANVAS_W / 2, by + bh / 2, {
    font: "bold 13px 'Inter', system-ui, sans-serif",
    color: '#fff',
    align: 'center',
    baseline: 'middle',
  });

  ctx.globalAlpha = 1;
}

// ─── Rescue-Goal Banner (HUD) ─────────
// Replaces the old hidden-recipe cards. Shows the ACTIVE rescue goal (which at-risk
// items to use up) + explicit progress. Goal-MATCHING: many dishes satisfy it, so the
// banner states an objective, never a single secret recipe.
export function goalBannerLayout() {
  const width = 540;
  const height = 100;
  const x = (CANVAS_W - width) / 2;
  const y = 48;

  return {
    board: { x, y, width, height },
    progress: { x: x + (width - 96) / 2, y: y + 7, width: 96, height: 20 },
    instruction: {
      x: x + 112,
      y: y + 31,
      width: width - 224,
      height: 18,
    },
    ingredients: { x: x + 60, y: y + 57, width: width - 120, height: 35 },
  };
}

export function renderGoalBanner(ctx, state, t) {
  const goals = state.goals || [];
  if (!goals.length) return;
  const done = state.completedGoals?.length ?? 0;
  const recap = isDishRecap(state);
  const idx = recap ? done - 1 : Math.min(state.goalIndex ?? 0, goals.length - 1);
  const goal = goals[idx];
  const allDone = done >= goals.length;

  const layout = goalBannerLayout();
  const { x, y, width: cardW, height: cardH } = layout.board;

  ctx.save();
  ctx.shadowColor = 'rgba(62,39,35,0.24)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 4;
  drawRoundedRect(ctx, x, y, cardW, cardH, 14, '#5D4037', '#3E2723');
  ctx.restore();

  // A pinned kitchen order ticket connects the goal HUD to the room's wooden
  // cupboards and cream preparation trays.
  drawRoundedRect(ctx, x + 6, y + 6, cardW - 12, cardH - 12, 10, '#FFF8E1', '#D6B85F');

  // Brass pins make the board feel physically attached to the kitchen wall.
  for (const pinX of [x + 12, x + cardW - 12]) {
    ctx.fillStyle = '#D6B85F';
    ctx.beginPath();
    ctx.arc(pinX, y + 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8D6E63';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  const progress = t
    ? t('leftover_chef.goal_progress', 'Goal {{current}}/{{total}}', {
        current: allDone && !recap ? goals.length : idx + 1,
        total: goals.length,
      })
    : `Goal ${idx + 1}/${goals.length}`;
  drawRoundedRect(
    ctx,
    layout.progress.x,
    layout.progress.y,
    layout.progress.width,
    layout.progress.height,
    7,
    '#6E9E68',
    '#466A45',
  );
  drawText(ctx, progress, layout.progress.x + layout.progress.width / 2, layout.progress.y + 10, {
    font: "700 10px 'Inter', system-ui, sans-serif", color: '#FFF8E1',
    align: 'center', baseline: 'middle',
  });

  const label = recap
    ? `✓ ${t ? t('leftover_chef.dish_rescued', 'Rescued! Nothing wasted.') : 'Rescued!'}`
    : (t ? t('leftover_chef.rescue_label', 'Rescue before it spoils:') : 'Rescue:');
  drawText(
    ctx,
    label,
    layout.instruction.x + layout.instruction.width / 2,
    layout.instruction.y + layout.instruction.height / 2,
    {
    font: "700 13px 'Inter', system-ui, sans-serif", color: '#4E342E',
    align: 'center', baseline: 'middle',
    },
  );

  // Names remove the ambiguity of an emoji-only objective, especially on a tablet.
  const ingredients = (goal.atRisk || []).map((id) => {
    const emoji = state.itemEmoji?.[id] || '?';
    const name = state.itemName?.[id] || id;
    return `${emoji} ${name}`;
  }).join('  +  ');
  drawRoundedRect(
    ctx,
    layout.ingredients.x,
    layout.ingredients.y,
    layout.ingredients.width,
    layout.ingredients.height,
    9,
    '#F2E3C7',
    '#C49A5A',
  );

  let ingredientSize = 16;
  do {
    ctx.font = `700 ${ingredientSize}px 'Inter', system-ui, sans-serif`;
    ingredientSize -= 1;
  } while (ingredientSize > 11 && ctx.measureText(ingredients).width > layout.ingredients.width - 20);
  drawText(
    ctx,
    ingredients,
    layout.ingredients.x + layout.ingredients.width / 2,
    layout.ingredients.y + layout.ingredients.height / 2,
    {
    font: ctx.font, color: '#4E342E',
    align: 'center', baseline: 'middle',
    },
  );
}

// ─── Food-Safety Fact Card ──────
// Mirrors the canonical CompostCreator fact card: green-edged body, the VERBATIM EUFIC
// quote in a cream sub-panel (Inter italic), the shared gold «📖 publisher» chip + «Press S».
// The chip rect is stored on state.sourceBadgeRect so a mouse click opens the source too.
// Driven by state.factCard = { emoji, title, fact, sourceId } set on a rescued dish.
const SAFETY_CREAM = '#FFF8E1';
const SAFETY_QUOTE = '#5D4037';

function wrapFactLines(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else { cur = test; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function renderReadableSafetyFactCard(ctx, state, t, cssScale) {
  const fc = state.factCard;
  const size = (css) => Math.ceil(css / cssScale);
  const pad = 28;
  const cardW = 1000;
  const x = (CANVAS_W - cardW) / 2;
  const headFont = `600 ${size(14)}px 'Inter', system-ui, sans-serif`;
  const factFont = `${fc.paraphrase ? '' : 'italic '}${size(12)}px 'Inter', system-ui, sans-serif`;
  const promptFont = `600 ${size(11)}px 'Inter', system-ui, sans-serif`;
  const headLineH = Math.ceil(size(14) * 1.2);
  const factLineH = Math.ceil(size(12) * 1.2);
  const promptLineH = Math.ceil(size(11) * 1.2);
  ctx.font = headFont;
  const headLines = wrapFactLines(ctx, fc.title || '', cardW - pad * 2 - 40);
  ctx.font = factFont;
  const factLines = wrapFactLines(ctx, fc.paraphrase ? String(fc.fact) : `“${fc.fact}”`, cardW - pad * 2 - 32);
  const pressS = (t && t('leftover_chef.press_s', 'Press S for the source ↗')) || 'Press S ↗';
  const prompt = (t && t('leftover_chef.fact_continue_prompt', 'Press Enter or Space to continue')) || 'Press Enter or Space to continue';
  ctx.font = promptFont;
  const sourceHintLines = wrapFactLines(ctx, pressS, cardW - pad * 2);
  const promptLines = wrapFactLines(ctx, prompt, cardW - pad * 2);
  const sourceScale = Math.max(1, 11 / (11 * cssScale));
  const sourceH = 20 * sourceScale;
  const factPanelH = 24 + factLines.length * factLineH;
  const cardH = pad * 2 + headLines.length * headLineH + 12 + factPanelH + 12 + sourceH
    + 8 + sourceHintLines.length * promptLineH + 8 + promptLines.length * promptLineH;
  const y = (CANVAS_H - cardH) / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  drawRoundedRect(ctx, x, y, cardW, cardH, 14, '#2E7D32', null);
  ctx.shadowColor = 'transparent';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let cy = y + pad;
  ctx.font = `${size(14)}px system-ui`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(fc.emoji || '🥡', x + pad, cy);
  ctx.font = headFont;
  headLines.forEach((line) => { ctx.fillText(line, x + pad + 40, cy); cy += headLineH; });
  cy += 12;
  drawRoundedRect(ctx, x + pad, cy, cardW - pad * 2, factPanelH, 10, SAFETY_CREAM, null);
  ctx.fillStyle = SAFETY_QUOTE;
  ctx.font = factFont;
  factLines.forEach((line, i) => ctx.fillText(line, x + pad + 16, cy + 12 + i * factLineH));
  cy += factPanelH + 12;
  ctx.save();
  ctx.scale(sourceScale, sourceScale);
  const sourceRect = renderSourceChip(ctx, CANVAS_W / (2 * sourceScale), cy / sourceScale, fc.sourceId);
  ctx.restore();
  state.sourceBadgeRect = Object.fromEntries(Object.entries(sourceRect).map(([key, value]) => [key, value * sourceScale]));
  cy += sourceH + 8;
  ctx.font = promptFont;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  sourceHintLines.forEach((line) => { ctx.fillText(line, CANVAS_W / 2, cy); cy += promptLineH; });
  cy += 8;
  ctx.fillStyle = '#FFE082';
  promptLines.forEach((line) => { ctx.fillText(line, CANVAS_W / 2, cy); cy += promptLineH; });
  ctx.restore();
}

export function renderSafetyFactCard(ctx, state, t) {
  const fc = state.factCard;
  if (!fc) {
    state.sourceBadgeRect = null;
    return;
  }

  const cssScale = canvasCssScale(ctx.canvas);
  if (cssScale < 0.9) {
    renderReadableSafetyFactCard(ctx, state, t, cssScale);
    return;
  }
  const pad = 16;
  const cardW = 560;
  const x = (CANVAS_W - cardW) / 2;

  ctx.font = "600 15px 'Inter', system-ui, sans-serif";
  const headLines = wrapFactLines(ctx, fc.title || '', cardW - pad * 2 - 30);
  // fc.paraphrase: our own plain sentence, upright and unquoted; the chip
  // opens the locked verbatim quote. Without the flag: verbatim in italics with quotes.
  const factFont = fc.paraphrase
    ? "14px 'Inter', system-ui, sans-serif"
    : "italic 14px 'Inter', system-ui, sans-serif";
  ctx.font = factFont;
  const factLines = wrapFactLines(ctx, fc.paraphrase ? String(fc.fact) : `“${fc.fact}”`, cardW - pad * 2 - 24);

  const lineH = 20;
  const factPanelH = 12 + factLines.length * 19 + 12;
  const cardH = pad + headLines.length * lineH + 10 + factPanelH + 8 + 62 + pad;
  const y = CANVAS_H - cardH - 20;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  drawRoundedRect(ctx, x, y, cardW, cardH, 14, '#2E7D32', null);
  ctx.shadowColor = 'transparent';

  let cy = y + pad;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '18px system-ui';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(fc.emoji || '🥡', x + pad, cy - 1);
  ctx.font = "600 15px 'Inter', system-ui, sans-serif";
  for (const ln of headLines) {
    ctx.fillText(ln, x + pad + 28, cy);
    cy += lineH;
  }

  cy += 10;
  const panelX = x + pad;
  const panelW = cardW - pad * 2;
  drawRoundedRect(ctx, panelX, cy, panelW, factPanelH, 10, SAFETY_CREAM, null);
  let qy = cy + 12;
  ctx.fillStyle = SAFETY_QUOTE;
  ctx.font = factFont;
  for (const ln of factLines) {
    ctx.fillText(ln, panelX + 12, qy);
    qy += 19;
  }
  cy += factPanelH + 8;

  // Shared gold source chip + «Press S». Store rect for click hit-testing.
  state.sourceBadgeRect = renderSourceChip(ctx, CANVAS_W / 2, cy, fc.sourceId);
  const pressS = (t && t('leftover_chef.press_s', 'Press S for the source ↗')) || 'Press S ↗';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = "600 12px 'Inter', system-ui, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(pressS, CANVAS_W / 2, cy + 24);

  const continuePrompt = (t && t(
    'leftover_chef.fact_continue_prompt',
    'Press Enter or Space to continue',
  )) || 'Press Enter or Space to continue';
  ctx.fillStyle = '#FFE082';
  ctx.font = "700 12px 'Inter', system-ui, sans-serif";
  ctx.fillText(continuePrompt, CANVAS_W / 2, cy + 43);
  ctx.restore();
}
