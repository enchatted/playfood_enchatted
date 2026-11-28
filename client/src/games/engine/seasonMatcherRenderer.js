// Season Matcher renderer — FridgeManager-style supermarket.
// Two wooden product shelves at top wall (replacing the single fridge).
// Foods rendered inside shelves. Player carries a personal cart (visible
// at hip) that holds multiple items, taken to a checkout cashier for
// validation. Shared chrome (kitchen wall, exit sign, NPCs) comes from
// gameRoomRenderer.js (FridgeManager pattern).

import { drawRoundedRect, drawText } from '../../utils/canvas.js';
import { TILE_SIZE } from './gameRoomLogic.js';
import { OX, OY } from './gameRoomRenderer.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { drawItemGlyph, hasDrawnIcon, itemTextLabel } from './itemGlyphs.js';

// ─── Focused-food label ───────────────────────────────────────
// Anti-spoiler rule: the label for the faced food shows ONLY its name — never
// the season / origin / a colour verdict. The child must commit before knowing;
// the seasonal answer is revealed at checkout (teach-don't-punish hints), so a
// pick is a genuine decision, not green-check icon-matching.
export function focusedFoodText(f) {
  return f && f.name ? itemTextLabel(f, f.name) : '';
}

export function renderFocusedFoodLabel(ctx, state) {
  const text = focusedFoodText(state.focusedFood);
  if (!text) return;

  ctx.font = "bold 14px 'Inter', system-ui, sans-serif";
  const nameWidth = ctx.measureText(text).width;
  const iconSpace = hasDrawnIcon(state.focusedFood) ? 24 : 0;
  const w = nameWidth + iconSpace + 28;
  const h = 30;
  const x = CANVAS_W / 2 - w / 2;
  const y = CANVAS_H - 200; // sits above the ENTER action prompt (y = CANVAS_H-158)
  // Neutral dark pill — solid hairline + drop shadow, NO green/brown tell.
  drawRoundedRect(ctx, x + 2, y + 3, w, h, 15, 'rgba(0,0,0,0.22)', null);
  drawRoundedRect(ctx, x, y, w, h, 15, '#3E342B', '#C8B79A');
  if (iconSpace) drawItemGlyph(ctx, state.focusedFood, x + 24, y + h / 2, 20);
  drawText(ctx, text, CANVAS_W / 2 + iconSpace / 2, y + h / 2 + 0.5, {
    font: "bold 14px 'Inter', system-ui, sans-serif",
    color: '#fff', align: 'center', baseline: 'middle',
  });
}

// ─── Product shelves: 2 wooden cabinets at top wall (mirror of fridge) ──
// Each shelf is a 2×3 wooden cabinet with horizontal plank dividers and
// food slots inside. Foods are rendered separately by renderSeasonFoods.
export function renderProductShelves(ctx, productShelves) {
  if (!productShelves) return;
  for (const shelf of productShelves) {
    const fx = OX + shelf.minCol * TILE_SIZE;
    const fy = OY + shelf.minRow * TILE_SIZE;
    const fw = (shelf.maxCol - shelf.minCol + 1) * TILE_SIZE;
    const fh = (shelf.maxRow - shelf.minRow + 1) * TILE_SIZE;

    // Drop shadow
    drawRoundedRect(ctx, fx + 4, fy + 5, fw, fh, 5, 'rgba(0,0,0,0.30)', null);

    // Wooden body (matching FridgeManager fridge dimensions)
    const woodGrad = ctx.createLinearGradient(fx, fy, fx + fw, fy);
    woodGrad.addColorStop(0, '#6D4C41');
    woodGrad.addColorStop(0.5, '#8D6E63');
    woodGrad.addColorStop(1, '#5D4037');
    drawRoundedRect(ctx, fx, fy, fw, fh, 5, woodGrad, '#3E2723');

    // Interior (lighter wood backing)
    ctx.fillStyle = '#A1887F';
    ctx.fillRect(fx + 4, fy + 4, fw - 8, fh - 8);

    // Horizontal plank dividers per row (each row is a shelf level)
    const rowCount = shelf.maxRow - shelf.minRow + 1;
    for (let i = 1; i < rowCount; i++) {
      const sy = fy + i * TILE_SIZE;
      ctx.fillStyle = '#5D4037';
      ctx.fillRect(fx + 4, sy - 1, fw - 8, 2);
      // Plank top highlight
      ctx.fillStyle = '#BCAAA4';
      ctx.fillRect(fx + 4, sy + 1, fw - 8, 2);
    }

    // Vertical divider between cols (1 in middle if 2-col shelf)
    const colCount = shelf.maxCol - shelf.minCol + 1;
    if (colCount > 1) {
      for (let i = 1; i < colCount; i++) {
        const sx = fx + i * TILE_SIZE;
        ctx.strokeStyle = 'rgba(62, 39, 35, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, fy + 4);
        ctx.lineTo(sx, fy + fh - 4);
        ctx.stroke();
      }
    }

    // Top plank
    ctx.fillStyle = '#BCAAA4';
    ctx.fillRect(fx + 4, fy + 4, fw - 8, 3);
    // Bottom plank
    ctx.fillStyle = '#8D6E63';
    ctx.fillRect(fx + 4, fy + fh - 8, fw - 8, 4);
  }
}

// ─── Player's personal cart (drawn next to player) ────────────
// Shows a mini cart icon at the player's hip with the held items
// stacked inside + a counter badge. Cart visual fades in when first
// item is added.
export function renderPlayerCart(ctx, state, basketTotal) {
  const cart = state.cart || [];
  const checkoutQueue = state.checkoutQueue || [];
  const showCount = cart.length || checkoutQueue.length;
  if (showCount === 0) return;

  const p = state.player;
  const px = OX + p.pixelX + TILE_SIZE / 2;
  const py = OY + p.pixelY + TILE_SIZE / 2;

  // Position cart next to player (offset right if facing left, vice versa)
  const offsetX = (p.dir === 2 /* LEFT */) ? 18 : -18;
  const cx = px + offsetX;
  const cy = py + 6;

  // Cart body
  drawRoundedRect(ctx, cx - 13, cy - 8, 26, 14, 3, '#5D4037', '#3E2723');
  // Cart inner basket area
  ctx.fillStyle = '#A1887F';
  ctx.fillRect(cx - 11, cy - 6, 22, 10);
  // Wheels
  ctx.fillStyle = '#212121';
  ctx.beginPath();
  ctx.arc(cx - 8, cy + 7, 2.5, 0, Math.PI * 2);
  ctx.arc(cx + 8, cy + 7, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Handle
  ctx.strokeStyle = '#3E2723';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + (p.dir === 2 ? 13 : -13), cy - 8);
  ctx.lineTo(cx + (p.dir === 2 ? 18 : -18), cy - 12);
  ctx.stroke();

  // Show up to 3 most-recent foods with the same glyph as their shelf.
  const items = cart.length ? cart : checkoutQueue;
  const visible = items.slice(-3);
  visible.forEach((item, i) => {
    const ix = cx - 8 + i * 8;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    drawItemGlyph(ctx, item, ix, cy - 2, 12);
  });

  // Counter badge above cart (cart/CART_MAX) + basket progress (basket/total)
  const badgeText = `${cart.length}/${state.cartMax || 4}`;
  ctx.font = 'bold 10px sans-serif';
  const bw = ctx.measureText(badgeText).width + 8;
  const bh = 14;
  drawRoundedRect(ctx, cx - bw / 2, cy - 22, bw, bh, 6,
    cart.length >= (state.cartMax || 4) ? '#E65100' : '#33691E',
    'rgba(255,255,255,0.3)');
  drawText(ctx, badgeText, cx, cy - 15, {
    font: 'bold 10px sans-serif', color: '#fff',
    align: 'center', baseline: 'middle',
  });
}

// ─── Foods inside shelves (NO buy-signal badge — anti-spoiler) ─────────────
// Shelf foods show ONLY the emoji (+ a soft shadow + gentle bob). The old
// per-food ✅/✈️ buy-signal is deliberately gone: it let a child fill a perfect
// cart by icon-matching without ever reasoning about season. Now the seasonal
// verdict appears only at checkout, so picking takes real critical thinking.
function drawSpinachBunch(ctx, cx, cy, bob) {
  const baseY = cy + bob + 9;

  ctx.strokeStyle = '#1B5E20';
  ctx.lineWidth = 1.4;
  for (const [dx, lean, color] of [
    [-7, -3, '#43A047'],
    [0, 0, '#2E7D32'],
    [7, 3, '#388E3C'],
  ]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    ctx.quadraticCurveTo(cx + dx - 7, cy + bob + 1, cx + dx + lean, cy + bob - 11);
    ctx.quadraticCurveTo(cx + dx + 8, cy + bob, cx, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.strokeStyle = '#81C784';
  ctx.lineWidth = 1.2;
  for (const tipX of [cx - 10, cx, cx + 10]) {
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    ctx.lineTo(tipX, cy + bob - 7);
    ctx.stroke();
  }
}

function drawLettuceHead(ctx, cx, cy, bob) {
  const y = cy + bob;
  const leaves = [
    [-8, 2, 8, '#8BC34A'],
    [8, 2, 8, '#9CCC65'],
    [-5, -6, 8, '#AED581'],
    [5, -6, 8, '#7CB342'],
    [0, 1, 10, '#9CCC65'],
  ];

  ctx.strokeStyle = '#558B2F';
  ctx.lineWidth = 1.2;
  for (const [dx, dy, radius, color] of leaves) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + dx, y + dy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(46, 125, 50, 0.65)';
  for (const dx of [-6, 0, 6]) {
    ctx.beginPath();
    ctx.moveTo(cx, y + 9);
    ctx.quadraticCurveTo(cx + dx, y + 2, cx + dx, y - 8);
    ctx.stroke();
  }
}

function drawKaleBunch(ctx, cx, cy, bob) {
  const baseY = cy + bob + 11;
  const leaves = [
    { dx: -7, tipY: -10, color: '#2E7D32' },
    { dx: 0, tipY: -14, color: '#1B5E20' },
    { dx: 7, tipY: -9, color: '#388E3C' },
  ];

  for (const leaf of leaves) {
    const tipX = cx + leaf.dx;
    const tipY = cy + bob + leaf.tipY;
    ctx.strokeStyle = '#7CB342';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Dense scalloped lobes create the recognisable curly kale edge instead
    // of the previous pair of smooth, generic leaf emoji.
    ctx.fillStyle = leaf.color;
    ctx.strokeStyle = '#164A1B';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      const progress = (i + 1) / 5;
      const stemX = cx + (tipX - cx) * progress;
      const stemY = baseY + (tipY - baseY) * progress;
      const radius = 3.8 - i * 0.35;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(stemX + side * (3.1 + (i % 2)), stemY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = '#8BC34A';
  ctx.fillRect(cx - 5, baseY - 2, 10, 3);
  ctx.strokeStyle = '#33691E';
  ctx.strokeRect(cx - 5, baseY - 2, 10, 3);
}

const PRODUCT_FACINGS = [
  { dx: -9, dy: 1 },
  { dx: 9, dy: 1 },
  { dx: 0, dy: 0 },
];

function drawFoodFacing(ctx, food, cx, cy, bob) {
  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.scale(0.58, 0.58);

  if (food.id === 'spinach') {
    drawSpinachBunch(ctx, 0, 0, 0);
  } else if (food.id === 'lettuce') {
    drawLettuceHead(ctx, 0, 0, 0);
  } else if (hasDrawnIcon(food)) {
    drawItemGlyph(ctx, food, 0, 0, 24);
  } else if (food.id === 'kale') {
    drawKaleBunch(ctx, 0, 0, 0);
  } else {
    drawText(ctx, food.emoji, 0, 0, {
      font: '24px sans-serif', align: 'center', baseline: 'middle',
    });
  }

  ctx.restore();
}

export function renderSeasonFoods(ctx, foods, time) {
  for (const food of foods) {
    if (food.taken) continue;
    const cx = OX + food.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = OY + food.row * TILE_SIZE + TILE_SIZE / 2;
    const bob = Math.sin(time * 2 + food.col * 0.7 + food.row * 0.4) * 1.2;

    for (const facing of PRODUCT_FACINGS) {
      const facingX = cx + facing.dx;
      const facingY = cy + facing.dy;

      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.beginPath();
      ctx.ellipse(facingX, facingY + 8, 5.5, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();

      drawFoodFacing(ctx, food, facingX, facingY, bob);
    }
  }
}

// ─── Cashier stations: wooden counter face + cash register sprite ──
// Drawn AFTER the cashier NPC so the counter visually occludes the NPC's
// lower body — same depth ordering as standing behind a real counter.
// Replaces the 💰 emoji decoration with a proper register.
export function renderCashierStations(ctx, cashierCols, time = 0, checkoutState = null) {
  for (const col of cashierCols) {
    const isActive = Array.isArray(checkoutState?.checkoutQueue)
      && checkoutState.activeCheckoutCol === col;
    drawCashierStation(ctx, col, time, isActive ? checkoutState : null);
  }
}

export function renderCashierProgressOverlay(ctx, cashierCols, time = 0, checkoutState = null) {
  if (!Array.isArray(checkoutState?.checkoutQueue)) return;

  const activeCol = cashierCols.find((col) => checkoutState.activeCheckoutCol === col);
  if (activeCol == null) return;

  drawCashierProgressBubble(ctx, activeCol, time, checkoutState);
}

function drawCashierStation(ctx, col, time, activity) {
  // Symmetric layout — counter, register, conveyor and cashier all share the
  // same vertical axis. `col` may be fractional so the station can be centered
  // between its two collision tiles.
  // Cashier NPC was drawn earlier at canvas-y OY+10*TS .. OY+10*TS+32, with
  // visual center at cx. We position the counter so the cashier stays FULLY
  // visible above it (no body occlusion) and the register sits cleanly below
  // the cashier on the counter ledge.
  const cx = OX + col * TILE_SIZE + TILE_SIZE / 2;
  const counterW = TILE_SIZE * 2;              // exactly two collision tiles
  const counterH = TILE_SIZE * 0.78;           // 25px
  const counterX = cx - counterW / 2;
  // Counter sits in row 11 area, just below the cashier sprite (ends at OY+10.95*TS)
  const counterTopY = OY + 11 * TILE_SIZE;

  // ── 1. Drop shadow under the counter (on the floor in front)
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, counterTopY + counterH + 2, counterW / 2 + 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── 2. Counter base — warm oak wood, vertical gradient
  const woodGrad = ctx.createLinearGradient(counterX, counterTopY, counterX, counterTopY + counterH);
  woodGrad.addColorStop(0, '#A1715A');
  woodGrad.addColorStop(0.5, '#8B5E45');
  woodGrad.addColorStop(1, '#5D3B27');
  drawRoundedRect(ctx, counterX, counterTopY, counterW, counterH, 2, woodGrad, '#3E2723');

  // ── 3. Counter top trim (lighter strip — reads as a wood ledge edge)
  ctx.fillStyle = '#C49A77';
  ctx.fillRect(counterX + 1, counterTopY + 1, counterW - 2, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(counterX + 1, counterTopY + 3, counterW - 2, 1);

  // ── 4. Wood grain detail (3 faint vertical lines — symmetric around cx)
  ctx.strokeStyle = 'rgba(62, 39, 35, 0.25)';
  ctx.lineWidth = 1;
  for (const fx of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(counterX + counterW * fx, counterTopY + 5);
    ctx.lineTo(counterX + counterW * fx, counterTopY + counterH - 2);
    ctx.stroke();
  }

  // ── 5. Cash register — CENTERED on cx, sits on the counter ledge.
  // Placed so it does NOT overlap the cashier sprite above (sprite bottom
  // = OY + 10*TS + 32 = counterTopY; register starts at counterTopY+1).
  const regW = 24, regH = 18;
  const regX = cx - regW / 2;
  const regY = counterTopY + 1;

  // Register shadow
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  drawRoundedRect(ctx, regX + 1, regY + 2, regW, regH, 1.5, 'rgba(0,0,0,0.30)', null);

  // Register body — beige plastic
  const bodyGrad = ctx.createLinearGradient(regX, regY, regX, regY + regH);
  bodyGrad.addColorStop(0, '#EDE0C8');
  bodyGrad.addColorStop(1, '#B8A47C');
  drawRoundedRect(ctx, regX, regY, regW, regH, 2, bodyGrad, '#5D4037');

  // Display screen — dark with green digital readout (centered)
  ctx.fillStyle = '#1B2735';
  ctx.fillRect(regX + 2, regY + 2, regW - 4, 5);
  const registerPulse = activity ? (Math.sin(time * 10) + 1) / 2 : 0;
  ctx.fillStyle = activity && registerPulse > 0.45 ? '#FFF176' : '#7FFF00';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(regX + 3 + i * 4, regY + 3, 3, 2);
  }

  // Keypad — 2 rows × 4 columns of small button squares (centered)
  const btnSize = 3;
  const btnGap = 1;
  const padRowW = 4 * btnSize + 3 * btnGap;       // total keypad width
  const padX = regX + (regW - padRowW) / 2;
  const padY = regY + 9;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#6E4A2E' : '#8D6E63';
      ctx.fillRect(padX + c * (btnSize + btnGap), padY + r * (btnSize + btnGap), btnSize, btnSize);
    }
  }

  if (!activity) return;

  // Keep the chosen checkout visibly active throughout the reading pause.
  if (activity.checkoutCurrentItem?.emoji) {
    const scanProgress = (time * 0.42) % 1;
    const itemX = counterX + 10 + scanProgress * (counterW - 20);
    const itemY = counterTopY - 5 - Math.sin(scanProgress * Math.PI) * 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    drawItemGlyph(ctx, activity.checkoutCurrentItem, itemX, itemY, 14);

    ctx.save();
    ctx.globalAlpha = 0.35 + registerPulse * 0.45;
    ctx.fillStyle = '#80DEEA';
    ctx.fillRect(cx - 1, counterTopY - 12, 2, 13);
    ctx.restore();
  }

}

function drawCashierProgressBubble(ctx, col, time, activity) {
  const cx = OX + col * TILE_SIZE + TILE_SIZE / 2;
  const counterTopY = OY + 11 * TILE_SIZE;
  const dotCount = 1 + Math.floor((time * 2) % 3);
  const bubbleText = `${activity.cashierCheckingText || 'Checking'}${'.'.repeat(dotCount)}`;
  ctx.font = "bold 10px 'Inter', system-ui, sans-serif";
  const bubbleW = Math.max(58, ctx.measureText(bubbleText).width + 16);
  const bubbleH = 20;
  const bubbleX = cx - bubbleW / 2;
  const bubbleY = counterTopY - 55;
  drawRoundedRect(ctx, bubbleX + 1, bubbleY + 2, bubbleW, bubbleH, 8, 'rgba(0,0,0,0.22)', null);
  drawRoundedRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 8, '#FFF8E1', '#5D4037');
  drawText(ctx, bubbleText, cx, bubbleY + bubbleH / 2, {
    font: "bold 10px 'Inter', system-ui, sans-serif",
    color: '#4E342E', align: 'center', baseline: 'middle',
  });
  ctx.fillStyle = '#FFF8E1';
  ctx.beginPath();
  ctx.moveTo(cx - 4, bubbleY + bubbleH - 1);
  ctx.lineTo(cx + 3, bubbleY + bubbleH - 1);
  ctx.lineTo(cx, bubbleY + bubbleH + 5);
  ctx.closePath();
  ctx.fill();
}

// ─── Action prompt below the player ────────────────────────────
export function renderInteractionHint(ctx, state) {
  if (!state.actionPrompt) return;
  const text = state.actionPrompt;
  ctx.font = "bold 14px 'Inter', system-ui, sans-serif";
  const w = Math.max(ctx.measureText(text).width + 32, 240);
  const h = 36;
  const x = CANVAS_W / 2 - w / 2;
  // Sit ABOVE the bottom bag strip (its bags top out around CANVAS_H-114, and
  // it's drawn AFTER this hint). The old y = CANVAS_H-75 put the prompt inside
  // the strip's band, so the bags painted over it and the text got clipped.
  const y = CANVAS_H - 158;
  drawRoundedRect(ctx, x + 2, y + 3, w, h, 14, 'rgba(0,0,0,0.25)', 'transparent');
  drawRoundedRect(ctx, x, y, w, h, 14, 'rgba(255,255,255,0.95)', '#33691E');
  drawText(ctx, text, CANVAS_W / 2, y + h / 2, {
    font: "bold 14px 'Inter', system-ui, sans-serif", color: '#33691E',
    align: 'center', baseline: 'middle',
  });
}

// ─── On-canvas source chip ───────────────────────────────
// A clickable gold «📖 EUFIC» badge near the top-left corner — the same in-world
// "this verdict has a source" affordance MarketTrip and SpotTheFake put on their
// fact/reveal cards, so the EUFIC citation behind every in/out-of-season call is
// reachable on the canvas (click/tap) as well as via Press-S. Keeping it above
// the playfield's lower control zone prevents the in-game D-pad from covering
// the source on compact tablets. Drawn in screen
// coords (call AFTER releaseRoomCamera). Writes state.seasonSourceRect every
// frame so the component can hit-test clicks against it; returns the same rect.
export function renderSeasonSourceChip(ctx, state, label) {
  const text = '📖 ' + label;
  const font = "bold 12px 'Inter', system-ui, sans-serif";
  ctx.font = font;
  const w = ctx.measureText(text).width + 22;
  const h = 24;
  const x = 14;
  const y = 54;
  drawRoundedRect(ctx, x + 1, y + 2, w, h, 12, 'rgba(0,0,0,0.22)', 'transparent'); // drop shadow
  drawRoundedRect(ctx, x, y, w, h, 12, '#FFE8A3', '#B8860B');                       // gold chip (shared family)
  drawText(ctx, text, x + w / 2, y + h / 2 + 0.5, {
    font, color: '#3E2723', align: 'center', baseline: 'middle',
  });
  state.seasonSourceRect = { x, y, width: w, height: h };
  return state.seasonSourceRect;
}
