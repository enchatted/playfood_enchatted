// mealPlannerRenderer.js — visuals for the Meal Planner walk-GRAB-CARRY port.
// Demo-faithful zoned room: FRIDGE aisle (left) + MARKET aisle (right, by category) are carry
// sources; ONE central plate is the ACTIVE meal; the chef mentor sits in a compact HUD coach;
// the 2 other meals read as dimmed "up next" HUD chips. World-space helpers run inside the room
// camera; HUD helpers (progress / coach / controls / results / fact card) run in screen space.
// NO coins, NO CO₂/price numbers. The chef speaks ONLY process guidance, never unsourced facts.

import { OX, OY, roomToCanvas } from './gameRoomRenderer.js';
import { GAME_ROOMS } from './gameRoomData.js';
import { TILE_SIZE as TS } from './gameRoomLogic.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { drawRoundedRect, drawText, renderSourceChip } from '../../utils/canvas.js';
import { drawFoodItem } from './itemSurface.js';
import { drawItemGlyph, hasDrawnIcon } from './itemGlyphs.js';
import { FOOD_ITEMS } from '../../data/foods.js';
import { canvasCssScale, readableUnit } from '../../utils/hidpi.js';
import { isOutOfSeasonInScenario } from '../foodwaste/mealPlannerCoach.js';

const GOLD = '#FFD54F';
const AMBER = '#FFB74D';
const GREEN = '#43A047';
const CORAL = '#FF8A65';            // the Chef (foodwaste island mentor colour)
const CREAM = '#FFF8E1';
const CARD_BORDER = '#D7C49A';
const BROWN_DK = '#3E2723';
const BROWN_MD = '#5D4037';
const CHIP_EMPTY = '#EFE6D0';
const CHIP_EMPTY_BORDER = '#CDBB95';
const PLATE_RING = '#E7D9B6';
const CHALKBOARD = '#163B2C';
const BOARD_WOOD_LIGHT = '#A9825E';
const BOARD_WOOD_DARK = '#5D4037';

// Pure pictograms (NOT i18n). Meal headers and category signs.
const MEAL_ICON = { breakfast: '🍳', lunch: '🥗', dinner: '🍽️' };
const CAT_ICON = { carb: '🌾', protein: '🍗', veg: '🥦', fruit: '🍎', extra: '🥤' };
const CAT_COLOR = { carb: '#FFD54F', protein: '#FF8A65', veg: '#43A047', fruit: '#EC407A', extra: '#9575CD' };
const CAT_TEXT_COLOR = {
  carb: '#3E2723', protein: '#3E2723', veg: '#123D1F', fruit: '#FFFFFF', extra: '#FFFFFF',
};
const EMPTY_SLOT_STYLE = {
  carb: { fill: '#FFF3CD', border: '#C99100' },
  protein: { fill: '#FFE2DA', border: '#C75B47' },
  veg: { fill: '#E1F1D8', border: '#4E8D3A' },
  fruit: { fill: '#F9DFE9', border: '#B23667' },
};

export function getMealPlannerCategoryStyle(cat) {
  return {
    fill: CAT_COLOR[cat] || GREEN,
    textColor: CAT_TEXT_COLOR[cat] || '#FFFFFF',
    maxFontSize: 9,
  };
}

export function getMealPlannerEmptySlotVisual(type) {
  return {
    glyph: '+',
    showFood: false,
    ...(EMPTY_SLOT_STYLE[type] || { fill: CHIP_EMPTY, border: CHIP_EMPTY_BORDER }),
  };
}

export function getMealPlannerFridgeItemVisual(item = {}) {
  return item.used
    ? { showFood: false, badge: '✓', dim: true }
    : { showFood: true, badge: null, dim: false };
}

export function getMealPlannerMissingText(missingTypes = [], labels = {}) {
  const names = missingTypes.map((type) => (
    labels.slotLabel ? labels.slotLabel(type) : type
  ));
  return `${labels.missingShort || 'Missing:'} ${names.join(' · ')}`;
}

export function getMealPlannerFoodGlyphLabel(item, labels = {}) {
  if (item?.id !== 'tofu') return null;
  return labels.nameOf ? labels.nameOf(item.id) : 'Tofu';
}

function fittedFont(ctx, text, maxWidth, weight = 'bold', maxSize = 9, minSize = 7) {
  for (let size = maxSize; size >= minSize; size--) {
    const font = `${weight} ${size}px 'Inter', system-ui, sans-serif`;
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return font;
  }
  return `${weight} ${minSize}px 'Inter', system-ui, sans-serif`;
}

function drawEmoji(ctx, emoji, x, y, alpha = 1, size = 26) {
  ctx.save();
  ctx.globalAlpha = alpha;
  drawText(ctx, emoji, x, y, { font: `${size}px sans-serif`, align: 'center', baseline: 'middle' });
  ctx.restore();
}

// Wrap text to a max pixel width.
function wrapText(ctx, text, maxW, font) {
  ctx.font = font;
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function wrapLimitedText(ctx, text, maxW, font, maxLines = 2) {
  const lines = wrapText(ctx, text, maxW, font);
  if (lines.length <= maxLines) return lines;

  const visible = lines.slice(0, maxLines);
  const remaining = lines.slice(maxLines - 1).join(' ');
  let last = remaining;
  ctx.font = font;
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
  visible[maxLines - 1] = `${last.trim()}…`;
  return visible;
}

function drawMealPlannerFood(ctx, item, x, y, { alpha = 1, size = 22, label = null } = {}) {
  if (hasDrawnIcon(item)) {
    // The leek has no emoji (🧅 is an onion); use the shared drawn leek, as Season Matcher does.
    ctx.save();
    ctx.globalAlpha = alpha;
    drawItemGlyph(ctx, item, x, y, size);
    ctx.restore();
    return;
  }
  if (item?.id !== 'tofu') {
    drawEmoji(ctx, item?.emoji || '🍽️', x, y, alpha, size);
    return;
  }

  // A small cream tofu block is intentionally not the global 🧊 glyph: on this market shelf
  // it must read as food/protein, never as the ice cube shown in the original screenshot.
  ctx.save();
  ctx.globalAlpha = alpha;
  drawRoundedRect(ctx, x - 14, y - 11, 28, 22, 5, '#FFF8E1', '#558B2F');
  ctx.fillStyle = '#DCEDC8';
  ctx.fillRect(x - 10, y - 7, 20, 3);
  const glyphLabel = String(label || 'Tofu').toLocaleUpperCase();
  const glyphFont = fittedFont(ctx, glyphLabel, 24, 'bold', 7, 5);
  drawText(ctx, glyphLabel, x, y + 3, {
    font: glyphFont,
    color: '#33691E', align: 'center', baseline: 'middle',
  });
  ctx.restore();
}

// Short amber pulse + "Πρώτα!" tag on an at-risk fridge item.
function drawUseFirst(ctx, x, y, label, time) {
  const pulse = 0.5 + 0.5 * Math.sin((time || 0) * 6);
  ctx.save();
  ctx.globalAlpha = 0.4 + pulse * 0.4;
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, TS * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (label) {
    const w = 50;
    const font = fittedFont(ctx, label, w - 8, 'bold', 8, 7);
    drawRoundedRect(ctx, x - w / 2, y - TS * 0.9 - 6, w, 13, 6, AMBER, 'transparent');
    drawText(ctx, label, x, y - TS * 0.9, { font, color: BROWN_MD, align: 'center', baseline: 'middle' });
  }
}

// ── World space: FRIDGE aisle (left) + MARKET aisle (right, by category) ────────────────
export function getMealPlannerZoneVisuals(state = {}) {
  const labels = state.labels || {};
  const marketHeld = state.marketHeld ?? 0;
  const marketCap = state.marketCap ?? 9;
  const marketCount = labels.marketCount
    ? labels.marketCount(marketHeld, marketCap)
    : `${labels.marketZone || 'ΑΓΟΡΑ'}: ${marketHeld}/${marketCap}`;

  return {
    fridgePanel: {
      x: OX + 1.75 * TS,
      y: OY + 2 * TS - 8,
      width: 3.5 * TS,
      height: 7 * TS + 8,
      fill: 'rgba(227, 242, 253, 0.08)',
      border: '#5E7A92',
    },
    marketPanel: {
      x: OX + 14.75 * TS,
      y: OY + 2 * TS - 8,
      width: 3.5 * TS,
      height: 10 * TS + 8,
      fill: 'rgba(255, 248, 225, 0.08)',
      border: '#A5662E',
    },
    fridgeSign: { x: OX + 3.5 * TS, y: OY + 2.2 * TS },
    marketSign: { x: OX + 16.5 * TS, y: OY + 2.2 * TS },
    fridgeLabel: `🧊 ${labels.fridgeZone || 'ΨΥΓΕΙΟ'}`,
    marketLabel: `🛒 ${marketCount}`,
  };
}

// Screen-space alignment for transient coach/control HUD only. The menu-board is
// room-world furniture and has its own geometry below.
export function getMealPlannerHudLayout() {
  return {
    // The whole blocked band under the menu board (cols 6-13, canvas x 448-832, board
    // ends y≈79, first walkable row starts y=136), so the bigger card never covers a floor tile.
    coach: {
      x: 448, y: 80, width: 384, height: 56,
    },
    controls: {
      x: 448, y: 612, width: 384, height: 34,
    },
  };
}

export function mealPlannerHudVisible(state = {}) {
  return state.phase !== 'results' && !state.showMissionIntro;
}

export function getMealPlannerMenuBoardGeometry() {
  const ticketStartX = OX + 6 * TS + 10;
  const boardY = OY + 10;
  const ticketY = boardY + 25;
  return {
    space: 'room-world',
    board: { x: OX + 6 * TS, y: boardY, width: 8 * TS, height: 48 },
    surface: { x: OX + 6 * TS + 4, y: boardY + 4, width: 8 * TS - 8, height: 40 },
    tickets: [0, 1, 2].map((index) => {
      const x = ticketStartX + index * 80;
      return {
        x,
        y: ticketY,
        width: 75,
        height: 18,
        content: {
          icon: { x: x + 8, y: ticketY + 9 },
          name: {
            x: x + 16,
            y: ticketY + 5,
            maxWidth: 55,
            maxFontSize: 7,
            minFontSize: 5,
          },
          badge: { x: x + 43.5, y: ticketY + 13.5 },
        },
      };
    }),
  };
}

const MENU_TICKET_VISUALS = {
  complete: {
    fill: '#2E7D32', border: '#81C784', textColor: '#FFFFFF', alpha: 1,
  },
  active: {
    fill: '#4A3A20', border: AMBER, textColor: '#FFF3C4', alpha: 1,
  },
  locked: {
    fill: '#20342B', border: '#486154', textColor: '#A9BAAF', alpha: 0.58,
  },
};

function safeLabel(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function getMealPlannerMenuBoardModel(state = {}) {
  const labels = state.labels || {};
  // The scenario's season is part of the board title when the game provides it.
  const seasonal = typeof labels.menuBoardTitleFor === 'function' && state.scenario?.season
    ? labels.menuBoardTitleFor(state.scenario.season) : null;
  const title = safeLabel(seasonal, safeLabel(labels.menuBoardTitle, 'Menu'));
  const tickets = (state.plates || []).slice(0, 3).map((plate, index) => {
    const slots = plate.slots || [];
    const filled = slots.filter((slot) => slot.item).length;
    const complete = slots.length > 0 && slots.every((slot) => slot.item);
    const status = complete ? 'complete' : index === state.activePlate ? 'active' : 'locked';
    const translatedName = typeof labels.mealName === 'function'
      ? labels.mealName(plate.meal)
      : null;

    return {
      meal: plate.meal,
      icon: MEAL_ICON[plate.meal] || '🍽️',
      name: safeLabel(translatedName, plate.meal || ''),
      filled,
      total: slots.length,
      status,
      badge: complete ? '✓' : status === 'active' ? `${filled}/${slots.length}` : '🔒',
      visual: MENU_TICKET_VISUALS[status],
    };
  });

  return { title, tickets };
}

export function getMealPlannerControlDockModel(state = {}) {
  if (!mealPlannerHudVisible(state)) return null;

  const actionText = typeof state.actionPrompt === 'string' ? state.actionPrompt.trim() : '';
  if (actionText) {
    return {
      mode: 'action',
      text: actionText,
      fill: 'rgba(255,248,225,0.97)',
      border: GREEN,
      color: '#1B5E20',
    };
  }

  const canUndo = Boolean(state.heldItem) || (Array.isArray(state.history) && state.history.length > 0);
  if (!canUndo) return null;

  return {
    mode: 'undo',
    text: safeLabel(state.labels?.undoHint, 'Q · Put back / Undo'),
    fill: 'rgba(38,50,56,0.92)',
    border: 'rgba(255,213,79,0.72)',
    color: '#FFFFFF',
  };
}

export function getMealPlannerTeachToastModel(state = {}) {
  return mealPlannerHudVisible(state) && state.toast ? state.toast : null;
}

function drawZonePanel(ctx, panel) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(62,39,35,0.22)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  drawRoundedRect(
    ctx,
    panel.x,
    panel.y,
    panel.width,
    panel.height,
    10,
    panel.fill,
    panel.border,
  );
  ctx.restore();
}

function drawShelfPlank(ctx, x, y, width, accent) {
  const shelfGradient = ctx.createLinearGradient(x, y, x, y + 10);
  shelfGradient.addColorStop(0, '#D7B98E');
  shelfGradient.addColorStop(0.35, '#A9825E');
  shelfGradient.addColorStop(1, '#6D4C41');
  drawRoundedRect(ctx, x, y, width, 10, 3, shelfGradient, '#5D4037');
  ctx.fillStyle = accent;
  ctx.fillRect(x + 4, y + 1, width - 8, 2);
}

export function getMealPlannerShelfGeometry(panel, horizontalInset = 6) {
  const x = panel.x + horizontalInset;
  const width = Math.max(0, panel.width - horizontalInset * 2);
  return {
    backing: { x, width },
    plank: { x, width },
  };
}

export function getMealPlannerMarketShelfLayout(centerY) {
  return {
    backing: { y: centerY - 31, height: 43 },
    category: { y: centerY - 29, height: 14 },
    itemY: centerY - 1,
    itemHalfHeight: 11,
    plankY: centerY + 9,
  };
}

function isFocusedSource(state, item, kind) {
  const focus = state.focusedSource;
  return Boolean(focus
    && focus.kind === kind
    && focus.id === item.id
    && focus.col === item.tile.col
    && focus.row === item.tile.row);
}

function drawFocusedSource(ctx, x, y, time) {
  const pulse = 0.72 + Math.sin((time || 0) * 5) * 0.18;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = '#00ACC1';
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 2]);
  drawRoundedRect(ctx, x - 19, y - 19, 38, 38, 10, 'transparent', '#00ACC1');
  ctx.setLineDash([]);
  drawText(ctx, '▼', x, y - 25, {
    font: 'bold 11px sans-serif', color: '#006064', align: 'center', baseline: 'middle',
  });
  ctx.restore();
}

function drawFridgeCabinet(ctx, zones, state) {
  const shelfGeometry = getMealPlannerShelfGeometry(zones.fridgePanel, 7);

  for (const row of [4, 6, 8]) {
    const y = OY + row * TS + TS / 2;
    drawRoundedRect(ctx, shelfGeometry.backing.x, y - 19, shelfGeometry.backing.width, 31, 5, 'rgba(187, 222, 251, 0.72)', '#90A4AE');
    drawShelfPlank(ctx, shelfGeometry.plank.x, y + 10, shelfGeometry.plank.width, '#E1F5FE');
  }

  for (const it of state.fridge || []) {
    const x = OX + it.tile.col * TS + TS / 2;
    const y = OY + it.tile.row * TS + TS / 2 - 2;
    const visual = getMealPlannerFridgeItemVisual(it);
    if (visual.showFood) {
      drawFoodItem(ctx, it.emoji, x, y, {
        surface: null, time: state.time, bob: 1,
      });
    } else {
      drawRoundedRect(ctx, x - 12, y - 12, 24, 24, 6, 'rgba(255,255,255,0.55)', '#90A4AE');
      drawText(ctx, visual.badge, x, y, {
        font: "bold 15px 'Inter', system-ui, sans-serif",
        color: '#5E7A92', align: 'center', baseline: 'middle',
      });
    }
    if (!it.used && it.atRisk) drawUseFirst(ctx, x, y, state.labels?.useFirst, state.time);
    if (!it.used && isFocusedSource(state, it, 'home')) drawFocusedSource(ctx, x, y, state.time);
  }
}

// A leaf marks market foods the Sustainability score counts as in season, before the
// child buys them. Processed foods never get it: 'all' season would otherwise read as praise.
export function showsSeasonLeaf(foodId, season) {
  const food = FOOD_ITEMS.find((f) => f.id === foodId);
  return !!season && !!food && !food.processed && !isOutOfSeasonInScenario(food, season);
}

function drawMarketShelves(ctx, zones, state) {
  const shelves = state.marketShelves || [];
  const shelfGeometry = getMealPlannerShelfGeometry(zones.marketPanel);
  const shelfX = shelfGeometry.backing.x;
  const shelfW = shelfGeometry.backing.width;

  for (const shelf of shelves) {
    const y = OY + shelf.row * TS + TS / 2;
    const layout = getMealPlannerMarketShelfLayout(y);
    const style = getMealPlannerCategoryStyle(shelf.cat);
    const color = style.fill;
    const label = state.labels?.catName ? state.labels.catName(shelf.cat) : shelf.cat;
    const labelText = `${CAT_ICON[shelf.cat] || '•'} ${label}`;
    const labelFont = fittedFont(ctx, labelText, shelfW - 12, 'bold', style.maxFontSize, 8);

    // One continuous supermarket shelf per category: header, backing and a real plank.
    drawRoundedRect(ctx, shelfX, layout.backing.y, shelfW, layout.backing.height, 5, 'rgba(255,255,255,0.72)', '#C8AD85');
    drawRoundedRect(ctx, shelfX + 3, layout.category.y, shelfW - 6, layout.category.height, 7, color, 'transparent');
    drawText(ctx, labelText, shelfX + shelfW / 2, layout.category.y + layout.category.height / 2, {
      font: labelFont, color: style.textColor, align: 'center', baseline: 'middle',
    });
    drawShelfPlank(ctx, shelfGeometry.plank.x, layout.plankY, shelfGeometry.plank.width, color);
  }

  for (const item of state.market || []) {
    const x = OX + item.tile.col * TS + TS / 2;
    const shelfCenterY = OY + item.tile.row * TS + TS / 2;
    const y = getMealPlannerMarketShelfLayout(shelfCenterY).itemY;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 9, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawMealPlannerFood(ctx, item, x, y, {
      size: 22,
      label: getMealPlannerFoodGlyphLabel(item, state.labels),
    });
    if (showsSeasonLeaf(item.id, state.scenario?.season)) {
      drawText(ctx, '🍃', x + 15, y - 13, { font: '13px sans-serif', align: 'center', baseline: 'middle' });
    }
    if (isFocusedSource(state, item, 'market')) drawFocusedSource(ctx, x, y, state.time);
  }
}

export function renderFridgeMarket(ctx, state) {
  const zones = getMealPlannerZoneVisuals(state);

  // Two coherent fixtures with equal wall gutters; map counters are hidden beneath them.
  drawZonePanel(ctx, zones.fridgePanel);
  drawZonePanel(ctx, zones.marketPanel);
  drawZoneSign(ctx, zones.fridgeSign.x, zones.fridgeSign.y, zones.fridgeLabel, '#5E7A92');
  drawZoneSign(ctx, zones.marketSign.x, zones.marketSign.y, zones.marketLabel, '#A5662E');
  drawFridgeCabinet(ctx, zones, state);
  drawMarketShelves(ctx, zones, state);
}

const ZONE_SIGN_FONT = "bold 11px 'Inter', system-ui, sans-serif";
function drawZoneSign(ctx, x, y, text, color) {
  ctx.font = ZONE_SIGN_FONT;
  const w = ctx.measureText(text).width + 16;
  drawRoundedRect(ctx, x - w / 2, y - 9, w, 18, 9, color, 'transparent');
  drawText(ctx, text, x, y, { font: "bold 11px 'Inter', system-ui, sans-serif", color: '#fff', align: 'center', baseline: 'middle' });
}

export function getMealPlannerPlateCenter(state = {}) {
  return state.plateCenter || { col: 10, row: 7 };
}

export function getMealPlannerActivePlateModel(state = {}) {
  const plate = state.plates?.[state.activePlate];
  if (!plate) return null;

  const slots = plate.slots || [];
  return {
    center: getMealPlannerPlateCenter(state),
    complete: slots.length > 0 && slots.every((slot) => slot.item),
    missingTypes: [...new Set(slots.filter((slot) => !slot.item).map((slot) => slot.type))],
    slots,
  };
}

// ── World space: the ONE central plate = the ACTIVE meal (clean focus) ───────────────────
export function renderActivePlate(ctx, state) {
  const L = state.labels || {};
  const plate = state.plates?.[state.activePlate];
  const model = getMealPlannerActivePlateModel(state);
  if (!plate || !model) return;
  const c = model.center;
  const px = OX + c.col * TS;
  const py = OY + c.row * TS;
  const done = model.complete;
  const R = TS * 1.5;

  // Soft mat + active pulse ring (keeps the eye on the meal being built).
  ctx.save();
  ctx.globalAlpha = 0.16 + 0.10 * Math.sin((state.time || 0) * 4);
  ctx.fillStyle = done ? GREEN : GOLD;
  ctx.beginPath(); ctx.ellipse(px, py + 3, R + 16, R + 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Plate body.
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = done ? GREEN : PLATE_RING;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(px, py, R - 3, 0, Math.PI * 2); ctx.stroke();

  // Slot wells arranged in a ring.
  const n = plate.slots.length;
  plate.slots.forEach((s, i) => {
    const a = (-90 + i * (360 / n)) * Math.PI / 180;
    const sr = R * 0.62;
    const sx = px + Math.cos(a) * sr;
    const sy = py + Math.sin(a) * sr;
    if (s.item) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(sx, sy, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; ctx.stroke();
      const plateItem = { id: s.item, emoji: s.emoji };
      drawMealPlannerFood(ctx, plateItem, sx, sy, {
        size: 16,
        label: getMealPlannerFoodGlyphLabel(plateItem, state.labels),
      });
      drawEmoji(ctx, s.source === 'home' ? '🏠' : '🛒', sx + 10, sy - 10, 0.9, 9);
    } else {
      const visual = getMealPlannerEmptySlotVisual(s.type);
      ctx.fillStyle = visual.fill;
      ctx.beginPath(); ctx.arc(sx, sy, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = visual.border; ctx.lineWidth = 2; ctx.stroke();
      drawText(ctx, visual.glyph, sx, sy, {
        font: "bold 15px 'Inter', system-ui, sans-serif",
        color: visual.border, align: 'center', baseline: 'middle',
      });
    }
  });

  // In-world cook-gate feedback: missing category names, or a ✓ ready chip.
  const missing = model.missingTypes;
  if (missing.length) {
    const txt = getMealPlannerMissingText(missing, L);
    const font = fittedFont(ctx, txt, 220, 'bold', 10, 7);
    ctx.font = font;
    const w = ctx.measureText(txt).width + 16;
    drawRoundedRect(ctx, px - w / 2, py + R + 6, w, 17, 8, '#fff', AMBER);
    drawText(ctx, txt, px, py + R + 14, { font, color: '#7B3F00', align: 'center', baseline: 'middle' });
  } else {
    drawRoundedRect(ctx, px - 16, py + R + 6, 32, 17, 8, GREEN, 'transparent');
    drawText(ctx, '✓', px, py + R + 14, { font: 'bold 13px sans-serif', color: '#fff', align: 'center', baseline: 'middle' });
  }
}

// ── Screen space: compact Chef coach — never camera-scaled or covered by the player ──
// Baseline step of the chef's two body lines. Greek accents and descenders need ~1.25× the font
// size of ink (review 12/10/2026, P2), and an emoji (🍓) ~1.43×: 20 keeps two 14 px emoji lines
// apart and still ends inside the 56 px card.
export const CHEF_COACH_LINE_STEP = 20;
// Body 14 px like other card text (was 10); a long line steps down, never below 12.
export const CHEF_COACH_FONT_SIZES = [14, 13, 12];
export const CHEF_NAME_COLOR = '#B4471F'; // dark coral, ≥4.5:1 on the cream card (was #FF8A65, ~2.2:1)

export function chefCoachBodyFont(size) {
  return `700 ${size}px 'Fredoka', 'Inter', system-ui, sans-serif`;
}

export function renderChefCoach(ctx, state) {
  const msg = state.chef?.msg;
  if (!msg || !mealPlannerHudVisible(state)) {
    state.coachRect = null;
    return;
  }

  const { coach } = getMealPlannerHudLayout();
  const cardX = coach.x + 14;
  const cardW = coach.width - 14;
  const avatarX = coach.x + 16;
  const avatarY = coach.y + coach.height / 2;
  const textX = coach.x + 42;
  const textW = coach.width - 54;
  const size = CHEF_COACH_FONT_SIZES.find((s) => wrapText(ctx, msg, textW, chefCoachBodyFont(s)).length <= 2)
    || CHEF_COACH_FONT_SIZES[CHEF_COACH_FONT_SIZES.length - 1];
  const bodyFont = chefCoachBodyFont(size);
  const lines = wrapLimitedText(ctx, msg, textW, bodyFont, 2);

  // On phone landscape the whole card grows from its top centre so 12 px text reads ≥ 12 CSS px.
  const cssScale = canvasCssScale(ctx.canvas);
  const u = Math.min(readableUnit(cssScale, size, 12), (CANVAS_W - 40) / coach.width);
  if (u > 1) {
    renderChefCoachInLane(ctx, state, msg, cssScale);
    return;
  }
  const anchorX = coach.x + coach.width / 2;
  ctx.save();
  ctx.translate(anchorX, coach.y);
  ctx.scale(u, u);
  ctx.translate(-anchorX, -coach.y);

  ctx.save();
  ctx.shadowColor = 'rgba(62,39,35,0.25)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  drawRoundedRect(ctx, cardX, coach.y, cardW, coach.height, 12, 'rgba(255,248,225,0.95)', CARD_BORDER);
  ctx.restore();

  // Attached portrait overlaps the card edge, so it reads as one component rather than a popup.
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath(); ctx.ellipse(avatarX, avatarY + 15, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = CORAL;
  ctx.beginPath(); ctx.arc(avatarX, avatarY, 17, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke();
  drawEmoji(ctx, '👨‍🍳', avatarX, avatarY, 1, 22);

  drawText(ctx, (state.labels && state.labels.chefName) || 'Ο Σεφ', textX, coach.y + 8, {
    font: "800 12px 'Fredoka', 'Inter', system-ui, sans-serif",
    color: CHEF_NAME_COLOR, align: 'left', baseline: 'middle',
  });
  lines.forEach((line, index) => drawText(ctx, line, textX, coach.y + 26 + index * CHEF_COACH_LINE_STEP, {
    font: bodyFont, color: BROWN_DK, align: 'left', baseline: 'middle',
  }));
  ctx.restore();
  state.coachRect = {
    x: anchorX - (coach.width * u) / 2, y: coach.y, width: coach.width * u, height: coach.height * u,
  };
}

// T06-F3: the free floor lane between the fridge (foods end x≈397) and the market (foods start x≈885),
// under the menu board and above the plate. bottom 252: the food name that floats up from the plate
// has faded out by the time it reaches it. A grown card stays inside the lane.
export const CHEF_COACH_LANE = { x: 404, width: 476, top: 76, bottom: 252 };

// The lane also stops short of the two zone signs, whose width depends on the language.
function chefCoachLane(ctx, state) {
  const zones = getMealPlannerZoneVisuals(state);
  const room = GAME_ROOMS.MealPlanner;
  ctx.font = ZONE_SIGN_FONT;
  const half = (text) => (ctx.measureText(text).width + 16) / 2;
  const left = Math.max(CHEF_COACH_LANE.x, roomToCanvas(room, zones.fridgeSign.x + half(zones.fridgeLabel), 0).x + 8);
  const right = Math.min(CHEF_COACH_LANE.x + CHEF_COACH_LANE.width, roomToCanvas(room, zones.marketSign.x - half(zones.marketLabel), 0).x - 8);
  return { x: left, width: right - left };
}

// Small screens: instead of scaling the whole card over the shelves, keep it in the lane and wrap
// the full message into more lines at a size that reads ≥ 12 CSS px (name included).
function renderChefCoachInLane(ctx, state, msg, cssScale) {
  const px = Math.ceil(12 / cssScale);
  const pad = Math.ceil(px * 0.3);
  const step = Math.ceil(px * 1.2);
  const bodyFont = chefCoachBodyFont(px);
  const { x, width } = chefCoachLane(ctx, state);
  const top = CHEF_COACH_LANE.top;
  const textX = x + pad;
  // shortcut: a message longer than ~4 lines at phone size grows below the lane, onto the plate; today's longest is 4
  const lines = wrapText(ctx, msg, width - pad * 2, bodyFont);
  const height = pad * 2 + step * (lines.length + 1);

  ctx.save();
  ctx.shadowColor = 'rgba(62,39,35,0.25)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  drawRoundedRect(ctx, x, top, width, height, 12, 'rgba(255,248,225,0.95)', CARD_BORDER);
  ctx.restore();

  // The portrait sits at the end of the name row, so the name and the lines share one left edge.
  drawEmoji(ctx, '👨‍🍳', x + width - pad - px * 0.6, top + pad + step / 2, 1, px);
  drawText(ctx, (state.labels && state.labels.chefName) || 'Ο Σεφ', textX, top + pad + step / 2, {
    font: `800 ${px}px 'Fredoka', 'Inter', system-ui, sans-serif`,
    color: CHEF_NAME_COLOR, align: 'left', baseline: 'middle',
  });
  lines.forEach((line, index) => drawText(ctx, line, textX, top + pad + step * (index + 1.5), {
    font: bodyFont, color: BROWN_DK, align: 'left', baseline: 'middle',
  }));
  state.coachRect = { x, y: top, width, height };
}

// Zelda carry, with the local tofu glyph kept consistent between shelf, hand and plate.
export function renderMealPlannerHeldItem(ctx, state) {
  if (!state.heldItem) return;
  const p = state.player;
  const x = OX + p.pixelX + TS / 2;
  const y = OY + p.pixelY - 10 + Math.sin(state.time * 6) * 2;
  drawMealPlannerFood(ctx, state.heldItem, x, y, {
    size: 18,
    label: getMealPlannerFoodGlyphLabel(state.heldItem, state.labels),
  });
}

// ── Room world-space: one physical menu-board mounted on the central kitchen wall ──
// The caller must invoke this while the shared room camera transform is active.
export function renderProgress(ctx, state) {
  if (!mealPlannerHudVisible(state)) return;
  const geometry = getMealPlannerMenuBoardGeometry();
  const model = getMealPlannerMenuBoardModel(state);
  const { board, surface, tickets } = geometry;

  ctx.save();
  ctx.shadowColor = 'rgba(32,20,14,0.28)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  const wood = ctx.createLinearGradient(board.x, board.y, board.x, board.y + board.height);
  wood.addColorStop(0, BOARD_WOOD_LIGHT);
  wood.addColorStop(0.52, '#7D5A42');
  wood.addColorStop(1, BOARD_WOOD_DARK);
  drawRoundedRect(ctx, board.x, board.y, board.width, board.height, 7, wood, BROWN_DK);
  ctx.shadowColor = 'transparent';
  drawRoundedRect(ctx, surface.x, surface.y, surface.width, surface.height, 4, CHALKBOARD, '#294F3E');
  ctx.restore();

  const titleFont = fittedFont(ctx, model.title, surface.width - 16, 'bold', 8, 6);
  drawText(ctx, model.title, board.x + board.width / 2, board.y + 13, {
    font: titleFont,
    color: '#F4EFD8',
    align: 'center',
    baseline: 'middle',
  });

  model.tickets.forEach((ticket, index) => {
    const rect = tickets[index];
    if (!rect) return;
    const content = rect.content;
    const visual = ticket.visual;
    ctx.save();
    ctx.globalAlpha = visual.alpha;
    drawRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 4, visual.fill, visual.border);
    drawText(ctx, ticket.icon, content.icon.x, content.icon.y, {
      font: '9px sans-serif', align: 'center', baseline: 'middle',
    });
    const nameFont = fittedFont(
      ctx,
      ticket.name,
      content.name.maxWidth,
      'bold',
      content.name.maxFontSize,
      content.name.minFontSize,
    );
    drawText(ctx, ticket.name, content.name.x, content.name.y, {
      font: nameFont, color: visual.textColor, align: 'left', baseline: 'middle',
    });
    drawText(ctx, ticket.badge, content.badge.x, content.badge.y, {
      font: "bold 7px 'Inter', system-ui, sans-serif",
      color: visual.textColor,
      align: 'center',
      baseline: 'middle',
    });
    ctx.restore();
  });
}

// ── Screen space: one fixed control dock for action prompts or Q/undo ────────────────────
export function renderMealPlannerControlDock(ctx, state) {
  state.undoHintRect = null;
  state.actionPromptRect = null;
  const model = getMealPlannerControlDockModel(state);
  if (!model) return;

  const controls = getMealPlannerHudLayout().controls;
  const font = fittedFont(ctx, model.text, controls.width - 38, 'bold', 14, 10);
  const pulse = model.mode === 'action' ? 0.94 + Math.sin((state.time || 0) * 3) * 0.06 : 1;

  ctx.save();
  ctx.globalAlpha = pulse;
  drawRoundedRect(ctx, controls.x + 2, controls.y + 3, controls.width, controls.height, 14, 'rgba(0,0,0,0.20)', 'transparent');
  drawRoundedRect(ctx, controls.x, controls.y, controls.width, controls.height, 14, model.fill, model.border);
  drawText(ctx, model.text, controls.x + controls.width / 2, controls.y + controls.height / 2, {
    font, color: model.color, align: 'center', baseline: 'middle',
  });
  ctx.restore();

  const rect = { x: controls.x, y: controls.y, width: controls.width, height: controls.height };
  state.actionPromptRect = model.mode === 'action' ? rect : null;
  state.undoHintRect = model.mode === 'undo' ? rect : null;
}

// ── Screen space: amber teach toast (kept) ───────────────────────────────────────────────
export function renderTeachToast(ctx, state) {
  const toast = getMealPlannerTeachToastModel(state);
  if (!toast) return;
  const a = Math.min(1, toast.life / 0.4);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = "bold 15px 'Inter', system-ui, sans-serif";
  const w = ctx.measureText(toast.text).width + 44;
  const x = CANVAS_W / 2 - w / 2;
  drawRoundedRect(ctx, x, CANVAS_H - 108, w, 36, 18, AMBER, '#5D4037');
  drawText(ctx, toast.text, CANVAS_W / 2, CANVAS_H - 90, {
    font: "bold 15px 'Inter', system-ui, sans-serif", color: '#3E2723', align: 'center', baseline: 'middle',
  });
  ctx.restore();
}

const TIER_STAR_COUNT = { perfect: 3, great: 2, pass: 1, fail: 0 };

export function getMealPlannerTierStarStates(tier) {
  const filledCount = TIER_STAR_COUNT[tier] ?? 0;
  return [0, 1, 2].map((index) => index < filledCount);
}

export function getMealPlannerTierStars(tier) {
  return getMealPlannerTierStarStates(tier).map((filled) => (filled ? '★' : '☆')).join('');
}

// ── RESULTS: the plain recap card ───────────────────────
// Title, stars, «plan percentage», then three short paragraphs 🗑️ / 🌱 / 🍽️ built by the game from
// the final plates (mealPlanRecap). No bars and no per-axis numbers here: those belong to the
// optional «How was the score made?» page. The card grows with its text; nothing is cut.
export const RECAP_CARD = {
  width: 600, top: 24, padX: 28, iconW: 30, bodyFont: "15px 'Inter', system-ui, sans-serif",
  lineH: 21, paraGap: 10, headerH: 118, footerH: 88,
  buttonH: 28, buttonFont: "bold 14px 'Inter', system-ui, sans-serif",
};
// «How was the score made?» card: same place and width as the main card.
// lineH 20: a 14 px line with an emoji (🥚) has 20 px of ink, so 19 let two such lines touch.
export const HOW_CARD = {
  top: 24, headingFont: "bold 15px 'Inter', system-ui, sans-serif", bodyFont: "14px 'Inter', system-ui, sans-serif",
  totalFont: "bold 14px 'Inter', system-ui, sans-serif", lineH: 20, headingH: 22, sectionGap: 10, headerH: 64, footerH: 88,
};
function resultCardStyle(ctx) {
  const canvas = ctx.canvas;
  const rect = canvas?.getBoundingClientRect?.();
  const cssScale = rect?.width && canvas.width
    ? ((canvas.__hidpi?.k || 1) * rect.width / canvas.width) : 1;
  const small = cssScale < 0.9;
  const size = (base, floor = 12) => small ? Math.max(base, Math.ceil(floor / cssScale)) : base;
  return {
    small, size, cssScale, width: small ? 1000 : RECAP_CARD.width, top: 24, padX: small ? 28 : RECAP_CARD.padX,
    iconW: small ? 38 : RECAP_CARD.iconW,
    bodyFont: `${size(15)}px 'Inter', system-ui, sans-serif`,
    howBodyFont: `${size(14)}px 'Inter', system-ui, sans-serif`,
    totalFont: `bold ${size(14)}px 'Inter', system-ui, sans-serif`,
    headingFont: `bold ${size(15)}px 'Inter', system-ui, sans-serif`,
    titleFont: `bold ${size(22, 14)}px 'Inter', system-ui, sans-serif`,
    howTitleFont: `bold ${size(20, 14)}px 'Inter', system-ui, sans-serif`,
    pctFont: `bold ${size(16)}px 'Inter', system-ui, sans-serif`,
    buttonFont: `bold ${size(14)}px 'Inter', system-ui, sans-serif`,
    promptFont: `bold ${size(13, 11)}px 'Inter', system-ui, sans-serif`,
    bodyLineH: small ? Math.ceil(size(15) * 1.18) : RECAP_CARD.lineH,
    howLineH: small ? Math.ceil(size(14) * 1.18) : HOW_CARD.lineH,
    headingH: small ? Math.ceil(size(15) * 1.22) : HOW_CARD.headingH,
    headerH: small ? 112 : RECAP_CARD.headerH, howHeaderH: small ? 54 : HOW_CARD.headerH,
    paraGap: small ? 8 : RECAP_CARD.paraGap, sectionGap: small ? 6 : HOW_CARD.sectionGap,
    buttonH: small ? Math.ceil(size(14) * 1.35) : RECAP_CARD.buttonH,
  };
}
function resultFooter(ctx, style, prompt) {
  const promptLines = wrapText(ctx, prompt || '', style.width - style.padX * 2, style.promptFont);
  const promptLineH = style.small ? Math.ceil(parseFloat(style.promptFont.match(/([\d.]+)px/)[1]) * 1.2) : 18;
  return { promptLines, promptLineH, footerH: style.small ? 24 + style.buttonH + promptLines.length * promptLineH + 12 : 88 };
}
export function getMealPlannerHowLayout(ctx, view, prompt = '') {
  const style = resultCardStyle(ctx);
  const footer = resultFooter(ctx, style, prompt);
  const width = style.width;
  const x = CANVAS_W / 2 - width / 2;
  const textX = x + style.padX;
  const textW = width - style.padX * 2;
  let y = style.top + style.howHeaderH;
  const sections = (view?.sections || []).map((sec) => {
    const headingLines = wrapText(ctx, sec.heading, textW, style.headingFont).map((text, i) => ({ text, x: textX, y: y + style.headingH * (i + 0.5) }));
    y += headingLines.length * style.headingH;
    const lines = wrapText(ctx, sec.body, textW, style.howBodyFont).map((text, i) => ({ text, x: textX, y: y + i * style.howLineH + style.howLineH / 2 }));
    y += lines.length * style.howLineH + style.sectionGap;
    return { key: sec.key, heading: headingLines[0], headingLines, lines };
  });
  const totalLines = wrapText(ctx, view?.total || '', textW, style.totalFont).map((text, i) => ({ text, x: textX, y: y + i * style.howLineH + style.howLineH / 2 }));
  y += totalLines.length * style.howLineH;
  return { x, y: style.top, width, height: (y - style.top) + footer.footerH, textX, textW, sections, totalLines, style, footer };
}
function drawCardButton(ctx, label, cy, ch, style, footer) {
  ctx.font = style.buttonFont;
  const w = Math.ceil(ctx.measureText(label).width) + 32;
  const h = style.buttonH;
  const bx = CANVAS_W / 2 - w / 2;
  const by = style.small ? cy + ch - footer.footerH + 12 : cy + ch - 70;
  drawRoundedRect(ctx, bx, by, w, h, h / 2, '#FFFFFF', GOLD);
  drawText(ctx, label, CANVAS_W / 2, by + h / 2, {
    font: style.buttonFont, color: '#5D4037', align: 'center', baseline: 'middle',
  });
  return { x: bx, y: by, width: w, height: h };
}
export function getMealPlannerRecapLayout(ctx, view, prompt = '') {
  const style = resultCardStyle(ctx);
  const footer = resultFooter(ctx, style, prompt);
  const x = CANVAS_W / 2 - style.width / 2;
  const textX = x + style.padX + style.iconW;
  const textW = style.width - style.padX * 2 - style.iconW;
  let y = style.top + style.headerH;
  const paragraphs = (view?.paragraphs || []).map((para) => {
    const lines = wrapText(ctx, para.text, textW, style.bodyFont)
      .map((text, i) => ({ text, x: textX, y: y + i * style.bodyLineH + style.bodyLineH / 2 }));
    const block = { ...para, iconX: x + style.padX + style.iconW / 2, iconY: y + style.bodyLineH / 2, lines };
    y += lines.length * style.bodyLineH + style.paraGap;
    return block;
  });
  const height = (y - style.paraGap - style.top) + footer.footerH;
  return { x, y: style.top, width: style.width, height, textX, textW, paragraphs, style, footer };
}
function drawResultPrompt(ctx, prompt, layout) {
  const { style, footer } = layout;
  if (!style.small) {
    drawText(ctx, prompt, CANVAS_W / 2, layout.y + layout.height - 24, {
      font: style.promptFont, color: '#8D6E63', align: 'center', baseline: 'middle',
    });
    return;
  }
  const start = layout.y + layout.height - 12 - footer.promptLines.length * footer.promptLineH;
  footer.promptLines.forEach((line, i) => drawText(ctx, line, CANVAS_W / 2, start + footer.promptLineH * (i + 0.5), {
    font: style.promptFont, color: '#8D6E63', align: 'center', baseline: 'middle',
  }));
}

export function renderResultsCard(ctx, state) {
  if (state.phase !== 'results' || state.resultPage !== 'score' || !state.results) return;
  const L = state.labels || {};
  const r = state.results;
  const view = state.recapView || { pctLabel: '', paragraphs: [] };
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (state.howOpen && state.howView) {
    renderHowCard(ctx, state);
    return;
  }
  state.howBackRect = null;

  const prompt = L.resultsNextPrompt || 'Press Enter or Space to see what you learned';
  const layout = getMealPlannerRecapLayout(ctx, view, prompt);
  const { x: cx, y: cy, width: cw, height: ch } = layout;
  drawRoundedRect(ctx, cx, cy, cw, ch, 18, '#FFF8E1', GOLD);
  state.recapCardRect = { x: cx, y: cy, width: cw, height: ch };

  drawText(ctx, `🍽️ ${L.phaseResults || 'Your meal plan'}`, CANVAS_W / 2, cy + 34, {
    font: layout.style.titleFont, color: '#3E2723', align: 'center', baseline: 'middle',
  });
  getMealPlannerTierStarStates(r.tier).forEach((filled, index) => {
    drawText(ctx, '★', CANVAS_W / 2 + (index - 1) * 26, cy + 64, {
      font: "bold 22px 'Inter', system-ui, sans-serif",
      color: filled ? '#F9A825' : '#BDBDBD',
      align: 'center',
      baseline: 'middle',
    });
  });
  if (view.pctLabel) {
    drawText(ctx, view.pctLabel, CANVAS_W / 2, cy + 94, {
      font: layout.style.pctFont, color: '#5D4037', align: 'center', baseline: 'middle',
    });
  }
  layout.paragraphs.forEach((para) => {
    drawText(ctx, para.icon, para.iconX, para.iconY, {
      font: "16px 'Inter', system-ui, sans-serif", color: '#5D4037', align: 'center', baseline: 'middle',
    });
    para.lines.forEach((line) => drawText(ctx, line.text, line.x, line.y, {
      font: layout.style.bodyFont, color: '#3E2723', align: 'left', baseline: 'middle',
    }));
  });

  state.howButtonRect = state.howView && L.howOpen ? drawCardButton(ctx, L.howOpen, cy, ch, layout.style, layout.footer) : null;
  drawResultPrompt(ctx, prompt, layout);
}

function renderHowCard(ctx, state) {
  const L = state.labels || {};
  const view = state.howView;
  const prompt = L.resultsNextPrompt || 'Press Enter or Space to see what you learned';
  const layout = getMealPlannerHowLayout(ctx, view, prompt);
  const { x: cx, y: cy, width: cw, height: ch } = layout;
  drawRoundedRect(ctx, cx, cy, cw, ch, 18, '#FFF8E1', GOLD);
  state.recapCardRect = { x: cx, y: cy, width: cw, height: ch };
  state.howButtonRect = null;
  drawText(ctx, view.title, CANVAS_W / 2, cy + 34, {
    font: layout.style.howTitleFont, color: '#3E2723', align: 'center', baseline: 'middle',
  });
  layout.sections.forEach((sec) => {
    sec.headingLines.forEach((line) => drawText(ctx, line.text, line.x, line.y, {
      font: layout.style.headingFont, color: '#3E2723', align: 'left', baseline: 'middle',
    }));
    sec.lines.forEach((line) => drawText(ctx, line.text, line.x, line.y, {
      font: layout.style.howBodyFont, color: '#4E342E', align: 'left', baseline: 'middle',
    }));
  });
  layout.totalLines.forEach((line) => drawText(ctx, line.text, line.x, line.y, {
    font: layout.style.totalFont, color: '#3E2723', align: 'left', baseline: 'middle',
  }));
  state.howBackRect = L.howBack ? drawCardButton(ctx, L.howBack, cy, ch, layout.style, layout.footer) : null;
  drawResultPrompt(ctx, prompt, layout);
}

// ── «Did you know?» public food-waste fact card (the ONLY on-screen facts) — kept ───
const FACT_QUOTE_BROWN = '#5D4037';

export function renderWasteFactCard(ctx, state, t) {
  if (state.phase !== 'results' || state.resultPage !== 'fact' || !state.wasteFact?.length) {
    state.sourceBadgeRect = null;
    return;
  }
  const L = state.labels || {};
  // T04-F1: on phone landscape the card reflows like the score card (resultCardStyle), so every line
  // reads ≥ 12 CSS px; on larger screens every number below is the one it always was.
  const style = resultCardStyle(ctx);
  const px = (base) => style.size(base);
  const pad = 14;
  const cardW = style.small ? style.width : 600;
  const x = (CANVAS_W - cardW) / 2;
  // Entries carrying `paraphrase` show OUR translated plain sentence
  // upright and unquoted; verbatim-only entries keep italics + quotation marks.
  // Plains run longer than the elided quotes, so every entry word-wraps.
  const uprightFont = `${px(14)}px 'Inter', system-ui, sans-serif`;
  const italicFont = `italic ${px(14)}px 'Inter', system-ui, sans-serif`;
  const textW = cardW - pad * 2 - 24;
  const quotes = state.wasteFact.flatMap((f) => {
    const font = f.paraphrase ? uprightFont : italicFont;
    const text = f.paraphrase ? String(f.plain || f.quote) : `“${f.quote}”`;
    return wrapText(ctx, text, textW, font).map((line) => ({ text: line, font }));
  });
  const lineH = style.small ? Math.ceil(px(14) * 1.25) : 20;
  const titleH = style.small ? Math.ceil(px(15) * 1.3) : 20;
  const promptLineH = style.small ? Math.ceil(px(12) * 1.3) : 20;
  // the shared chip draws 11 px text in a 20 px pill; it grows until that text reads ≥ 12 CSS px
  const chipK = Math.max(px(11) / 11, 12 / (11 * style.cssScale));
  const chipH = 20 * chipK;
  const pressSFont = `600 ${px(12)}px 'Inter', system-ui, sans-serif`;
  const continueFont = `700 ${px(12)}px 'Inter', system-ui, sans-serif`;
  const prompts = [
    ...wrapText(ctx, L.pressS || 'Press S for the source ↗', textW, pressSFont).map((text) => ({ text, font: pressSFont, color: 'rgba(255,255,255,0.92)' })),
    ...wrapText(ctx, L.factContinuePrompt || 'Press Enter or Space to continue', textW, continueFont).map((text) => ({ text, font: continueFont, color: '#FFFFFF' })),
  ];
  const panelH = 10 + quotes.length * lineH + 10;
  const cardH = pad + titleH + 8 + panelH + 8 + chipH + prompts.length * promptLineH + 2 + pad;
  const y = 24;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 5;
  drawRoundedRect(ctx, x, y, cardW, cardH, 14, '#2E7D32', null);
  ctx.shadowColor = 'transparent';

  let cy = y + pad;
  drawText(ctx, `💡 ${L.factTitle || 'Did you know?'}`, x + pad, cy + titleH * 0.4, {
    font: `700 ${px(15)}px 'Inter', system-ui, sans-serif`, color: '#FFFFFF', align: 'left', baseline: 'middle',
  });
  cy += titleH + 8;

  drawRoundedRect(ctx, x + pad, cy, cardW - pad * 2, panelH, 10, '#FFF8E1', null);
  let qy = cy + 10 + lineH / 2;
  for (const q of quotes) {
    drawText(ctx, q.text, x + pad + 12, qy, {
      font: q.font, color: FACT_QUOTE_BROWN, align: 'left', baseline: 'middle',
    });
    qy += lineH;
  }
  cy += panelH + 8;

  const cx = CANVAS_W / 2;
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(chipK, chipK); ctx.translate(-cx, -cy);
  const chip = renderSourceChip(ctx, cx, cy, state.wasteFact[0].sourceId);
  ctx.restore();
  // click target in canvas px, the same box that was drawn
  state.sourceBadgeRect = { x: cx + (chip.x - cx) * chipK, y: cy, width: chip.width * chipK, height: chipH };
  prompts.forEach((p, i) => drawText(ctx, p.text, cx, cy + chipH + promptLineH * (i + 0.5), {
    font: p.font, color: p.color, align: 'center', baseline: 'middle',
  }));
  ctx.restore();
}
