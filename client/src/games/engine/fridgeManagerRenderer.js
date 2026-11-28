// FridgeManager renderer: 4 storage stations + 3-tier feedback / sourced fact card.
// Stations are drawn in WORLD coords (inside applyRoomCamera). The feedback card is
// drawn in SCREEN coords (HUD, after releaseRoomCamera) so the verbatim EUFIC fact
// stays legible. Pedagogy: the 3 tiers are VISUALLY distinct — ✅ green affirm,
// 🟡 amber "still edible" nudge (never red, never ✗), ❌ teach-card with the EUFIC why.

import { TILE_SIZE } from './gameRoomLogic.js';
import { OX, OY } from './gameRoomRenderer.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { renderSourceChip, fitFontPx } from '../../utils/canvas.js';
import { balanceTwoLineLabel } from '../../utils/balancedLabel.js';
import { WORLD_ART } from '../../styles/brandColors.js';
import { canvasCssScale, readableUnit } from '../../utils/hidpi.js';

// House panel palette — canonized Island-1 chrome tokens (single source of truth),
// same values the MarketTrip fact toast uses. Tier/station hues below stay raw hex
// (thematic prop art — semantic traffic-light feedback, per the brand convention).
const PANEL_CREAM = WORLD_ART.panelCream;     // #FFF8E1
const QUOTE_BROWN = WORLD_ART.panelBrownDeep; // #3E2723

// Visual config per station (NOT facts — those live in fridgeData STORAGE_DESTINATIONS).
export const STATION_VISUALS = {
  freezer: { icon: '❄️', color: '#4F8FD8', body: '#EDF6FF', edge: '#386FAE', labelKey: 'fridge.station_freezer' },
  fridge: { icon: '🧊', color: '#238F85', body: '#E6F7F3', edge: '#176F68', labelKey: 'fridge.station_fridge' },
  cupboard: { icon: '🗄️', color: '#8D6E63', body: '#D8B38B', edge: '#6D4C41', labelKey: 'fridge.station_cupboard' },
  compost: { icon: '🌱', color: '#689F38', body: '#E8F2D8', edge: '#4E7A2D', labelKey: 'fridge.station_compost' },
};

// Tier → feedback chrome (the 🟡≠❌ distinction is the pedagogy).
const TIER_STYLE = {
  accepted: { bg: '#2E7D32', edge: WORLD_ART.pillBorder, icon: '✅' }, // edge = canonized pill border
  suboptimal: { bg: '#B8860B', edge: '#FFE082', icon: '🟡' }, // amber — soft nudge, NOT red
  avoid: { bg: WORLD_ART.panelBrown, edge: '#FFCC80', icon: '💡' }, // brown chrome token, not alarm red
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Pixel rect of a station's tiles (world coords, any W×H).
function stationRect(bin) {
  const cols = bin.tiles.map((t) => t.col);
  const rows = bin.tiles.map((t) => t.row);
  const minCol = Math.min(...cols), maxCol = Math.max(...cols);
  const minRow = Math.min(...rows), maxRow = Math.max(...rows);
  return {
    x: OX + minCol * TILE_SIZE,
    y: OY + minRow * TILE_SIZE,
    w: (maxCol - minCol + 1) * TILE_SIZE,
    h: (maxRow - minRow + 1) * TILE_SIZE,
  };
}

export function getFridgeStationVisualGeometry(bin) {
  const { x, y, w, h } = stationRect(bin);
  return {
    footprint: { left: x, top: y, width: w, height: h },
    shell: { left: x + 10, top: y + 4, width: w - 20, height: h - 8 },
  };
}

export function stationCenter(bin) {
  const r = stationRect(bin);
  return { bx: r.x + r.w / 2, by: r.y + r.h / 2 };
}

export function getFridgeStoredItemSlots(binId, shell) {
  const { left: x, top: y, width: w, height: h } = shell;
  if (binId === 'cupboard') {
    return [0.50, 0.80].flatMap((yRatio) => [0.28, 0.72].map((xRatio) => ({
      x: x + w * xRatio,
      y: y + h * yRatio,
    })));
  }
  if (binId === 'freezer' || binId === 'fridge') {
    return [0.49, 0.79].flatMap((yRatio) => [0.24, 0.50, 0.76].map((xRatio) => ({
      x: x + w * xRatio,
      y: y + h * yRatio,
    })));
  }
  return [
    { x: x + w * 0.38, y: y + h * 0.60 },
    { x: x + w * 0.62, y: y + h * 0.60 },
  ];
}

function drawStoredItems(ctx, state, binId, shell) {
  const items = state.binItems?.[binId] || [];
  const slots = getFridgeStoredItemSlots(binId, shell);
  const visible = items.slice(0, slots.length);
  for (let index = 0; index < visible.length; index++) {
    const { x: cx, y: cy } = slots[index];
    ctx.fillStyle = 'rgba(255,248,225,0.62)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '15px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(visible[index].emoji, cx, cy - 1);
  }
}

function drawApplianceBody(ctx, bin, vis, state) {
  const { shell } = getFridgeStationVisualGeometry(bin);
  const { left: x, top: y, width: w, height: h } = shell;
  const hasStoredItems = Boolean(state.binItems?.[bin.id]?.length);
  ctx.save();
  ctx.shadowColor = 'rgba(50, 34, 26, 0.20)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = vis.body;
  ctx.fill();
  ctx.restore();

  roundRect(ctx, x, y, w, h, 6);
  ctx.strokeStyle = vis.edge;
  ctx.lineWidth = 1.25;
  ctx.stroke();

  if (bin.id === 'freezer' || bin.id === 'fridge') {
    const cold = bin.id === 'freezer';
    roundRect(ctx, x + 8, y + 27, w - 16, h - 35, 4);
    ctx.fillStyle = cold ? '#F8FCFF' : '#F5FFFC';
    ctx.fill();
    ctx.strokeStyle = vis.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 8, y + h * 0.62);
    ctx.lineTo(x + w - 8, y + h * 0.62);
    ctx.stroke();
    ctx.fillStyle = vis.edge;
    ctx.fillRect(x + w - 14, y + 36, 3, 17);
    if (!hasStoredItems) {
      ctx.globalAlpha = 0.34;
      ctx.font = '24px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(vis.icon, x + w / 2, y + h * 0.53);
      ctx.globalAlpha = 1;
    }
  } else if (bin.id === 'cupboard') {
    const shelfX = x + 6;
    const shelfW = w - 12;
    ctx.fillStyle = '#6D4C41';
    ctx.fillRect(shelfX, y + 27, shelfW, h - 35);
    ctx.fillStyle = '#C99A6B';
    ctx.fillRect(shelfX + 3, y + 30, shelfW - 6, h - 41);
    ctx.strokeStyle = '#795548';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 30);
    ctx.lineTo(x + w / 2, y + h - 11);
    ctx.moveTo(shelfX + 3, y + h * 0.61);
    ctx.lineTo(shelfX + shelfW - 3, y + h * 0.62);
    ctx.stroke();
    ctx.fillStyle = '#F5D06F';
    ctx.beginPath();
    ctx.arc(x + w / 2 - 4, y + h * 0.55, 2, 0, Math.PI * 2);
    ctx.arc(x + w / 2 + 4, y + h * 0.55, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    roundRect(ctx, x + 10, y + 31, w - 20, h - 37, 5);
    ctx.fillStyle = '#4E8A36';
    ctx.fill();
    ctx.fillStyle = '#315D27';
    roundRect(ctx, x + 6, y + 27, w - 12, 10, 5);
    ctx.fill();
    if (!hasStoredItems) {
      ctx.globalAlpha = 0.5;
      ctx.font = '23px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(vis.icon, x + w / 2, y + h * 0.62);
      ctx.globalAlpha = 1;
    }
  }

  drawStoredItems(ctx, state, bin.id, shell);
  return { x, y, w, h };
}

// Draw four genuinely different appliances rather than four recoloured boxes.
export function renderStorageStations(ctx, state, t, room) {
  for (const bin of room.bins) {
    const vis = STATION_VISUALS[bin.id];
    if (!vis) continue;
    const { x, y, w, h } = drawApplianceBody(ctx, bin, vis, state);

    // Header band with label
    roundRect(ctx, x + 4, y + 4, w - 8, 19, 5);
    ctx.fillStyle = vis.color;
    ctx.fill();
    const label = (t && t(vis.labelKey)) || bin.id;
    ctx.fillStyle = '#FFFFFF';
    // Shrink long locales («Compostagem») to the band instead of overflowing it.
    fitFontPx(ctx, label, w - 8, { start: 11, floor: 8, pad: 8, weight: '700' });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + 13.5);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function renderPreparationIsland(ctx, state, t, room) {
  const island = room.preparationIsland;
  if (!island) return;
  const x = OX + island.left * TILE_SIZE;
  const y = OY + island.top * TILE_SIZE;
  const w = (island.right - island.left + 1) * TILE_SIZE;
  const h = (island.bottom - island.top + 1) * TILE_SIZE;

  ctx.save();
  ctx.shadowColor = 'rgba(66, 43, 29, 0.3)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 6;
  roundRect(ctx, x + 1, y + 2, w - 2, h - 4, 9);
  ctx.fillStyle = '#835739';
  ctx.fill();
  ctx.restore();

  roundRect(ctx, x + 6, y + 7, w - 12, h - 20, 7);
  const top = ctx.createLinearGradient(x, y, x, y + h);
  top.addColorStop(0, '#F2DCB4');
  top.addColorStop(1, '#D7AD79');
  ctx.fillStyle = top;
  ctx.fill();
  ctx.strokeStyle = '#6D4935';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Central wooden fascia gives the object one clear silhouette.
  roundRect(ctx, x + 72, y + 50, w - 144, 30, 7);
  ctx.fillStyle = '#9A6846';
  ctx.fill();
  ctx.strokeStyle = '#6D4935';
  ctx.stroke();
  ctx.fillStyle = '#FFF8E1';
  ctx.font = "700 12px 'Inter', system-ui, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('fridge.preparation_counter'), x + w / 2, y + 65);

  for (const item of state.counterItems || []) {
    const cx = OX + item.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = OY + item.row * TILE_SIZE + TILE_SIZE / 2;
    ctx.fillStyle = item.picked ? 'rgba(255,248,225,0.28)' : '#FFF8E1';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = item.picked ? 'rgba(109,76,65,0.22)' : '#B58B63';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (!item.picked) {
      ctx.font = '21px system-ui';
      ctx.fillStyle = '#3E2723';
      ctx.fillText(item.emoji, cx, cy - 1);
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function renderKitchenHelper(ctx, state, t, room) {
  const helper = room.helper;
  if (!helper) return;
  const x = OX + helper.col * TILE_SIZE;
  const y = OY + helper.row * TILE_SIZE;
  const bob = Math.sin((state.time || 0) * 2.4) * 1.2;
  const wave = Math.sin((state.time || 0) * 4.2) * 3;

  // Information podium: occupies the solid helper tile, so nobody walks through her.
  ctx.fillStyle = '#6D4C41';
  roundRect(ctx, x + 2, y + 18, TILE_SIZE - 4, 16, 4);
  ctx.fill();
  ctx.fillStyle = '#A5D6A7';
  ctx.fillRect(x + 7, y + 22, TILE_SIZE - 14, 8);

  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(x + 16, y + 19, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2E7D5B';
  ctx.fillRect(x + 9, y + 4, 14, 16);
  ctx.fillStyle = '#F3C79E';
  ctx.fillRect(x + 10, y - 7, 12, 12);
  ctx.fillStyle = '#5D4037';
  ctx.fillRect(x + 8, y - 9, 16, 5);
  ctx.fillRect(x + 8, y - 5, 3, 8);
  ctx.fillStyle = '#263238';
  ctx.fillRect(x + 12, y - 2, 2, 2);
  ctx.fillRect(x + 19, y - 2, 2, 2);
  ctx.fillStyle = '#F3C79E';
  ctx.fillRect(x + 23, y + 6 + wave, 5, 4);
  ctx.restore();

  const label = t(helper.labelKey);
  ctx.font = "700 10px 'Inter', system-ui, sans-serif";
  // Long names («A Ajudante do Frigorífico») wrap to two lines inside the 116px pill.
  const lines = ctx.measureText(label).width + 16 > 116 ? balanceTwoLineLabel(label) : [label];
  const labelW = Math.min(116, Math.max(...lines.map((line) => ctx.measureText(line).width)) + 16);
  const pillH = 6 + lines.length * 12;
  const pillTop = y - 13 - pillH; // bottom edge stays where the one-line pill ended
  roundRect(ctx, x + 16 - labelW / 2, pillTop, labelW, pillH, 7);
  ctx.fillStyle = '#FFF8E1';
  ctx.fill();
  ctx.strokeStyle = '#2E7D5B';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#2E5B42';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillText(line, x + 16, pillTop + 9 + i * 12, labelW - 8);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function renderKitchenHelperTip(ctx, state, t) {
  if (!state.helperTip) return;

  const cardW = Math.min(590, CANVAS_W - 48);
  const cardX = (CANVAS_W - cardW) / 2;
  const cardY = 92;
  const padX = 22;

  ctx.save();
  ctx.font = "600 15px 'Inter', system-ui, sans-serif";
  const lines = wrapLines(ctx, state.helperTip, cardW - padX * 2);
  const bodyLineH = 21;
  const cardH = 76 + lines.length * bodyLineH;

  ctx.shadowColor = 'rgba(62,39,35,0.2)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.fillStyle = PANEL_CREAM;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#2E7D5B';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#2E5B42';
  ctx.font = "800 17px 'Inter', system-ui, sans-serif";
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`💬 ${t('fridge.helper_name')}`, cardX + padX, cardY + 25);

  ctx.fillStyle = QUOTE_BROWN;
  ctx.font = "600 15px 'Inter', system-ui, sans-serif";
  lines.forEach((line, index) => {
    ctx.fillText(line, cardX + padX, cardY + 55 + index * bodyLineH);
  });

  ctx.fillStyle = '#2E7D5B';
  ctx.font = "700 12px 'Inter', system-ui, sans-serif";
  ctx.textAlign = 'right';
  ctx.fillText(
    t('fridge.helper_continue'),
    cardX + cardW - padX,
    cardY + cardH - 16,
  );
  ctx.restore();
}

// Amber "state" pill under an item (world coords). Surfaces a food's STATE — e.g.
// "day-old", "thawed" — so the player can grade fairly (time/state layer).
export function getFridgeStateBadgeLayout(measuredTextWidth, lineCount = 1) {
  const width = Math.min(56, Math.max(28, measuredTextWidth + 8));
  return { width, height: 4 + lineCount * 11, maxTextWidth: width - 6 };
}

export function getFridgeStateBadgeCenter(cx, width, room) {
  if (!room?.preparationIsland) return cx;
  const counterLeft = OX + room.preparationIsland.left * TILE_SIZE + 5;
  const counterRight = OX + (room.preparationIsland.right + 1) * TILE_SIZE - 5;
  return Math.max(counterLeft + width / 2, Math.min(counterRight - width / 2, cx));
}

function drawStateBadge(ctx, cx, topY, text, room) {
  if (!text) return;
  ctx.save();
  let fontSize = 10;
  ctx.font = `700 ${fontSize}px 'Inter', system-ui, sans-serif`;
  // Long tags («πάνω από 1 μέρα») go on two balanced lines instead of shrinking to 7px.
  const lines = ctx.measureText(text).width + 8 > 56 ? balanceTwoLineLabel(text) : [text];
  const widest = () => Math.max(...lines.map((line) => ctx.measureText(line).width));
  const layout = getFridgeStateBadgeLayout(widest(), lines.length);
  const badgeCenter = getFridgeStateBadgeCenter(cx, layout.width, room);
  while (fontSize > 9 && widest() > layout.maxTextWidth) {
    fontSize -= 0.5;
    ctx.font = `700 ${fontSize}px 'Inter', system-ui, sans-serif`;
  }
  roundRect(ctx, badgeCenter - layout.width / 2, topY, layout.width, layout.height, 5);
  ctx.fillStyle = '#E65100'; // deep amber — "look at me before you decide"
  ctx.fill();
  ctx.fillStyle = '#FFF8E1';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // maxWidth squeezes a single long word at the 9px floor so it never spills off the pill.
  lines.forEach((line, i) => {
    ctx.fillText(line, badgeCenter, topY + 2 + 5.5 + i * 11, layout.maxTextWidth);
  });
  ctx.restore();
}

// Draw state badges over every visible state-tagged item (counter / floor). The held
// item gets none: the carry banner already names its state.
export function renderStateBadges(ctx, state, t, room) {
  const label = (key) => (key && t ? t(key) : null);
  for (const item of state.counterItems || []) {
    if (item.picked || !item.stateLabelKey) continue;
    const cx = OX + item.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = OY + item.row * TILE_SIZE + TILE_SIZE / 2;
    drawStateBadge(ctx, cx, cy + 8, label(item.stateLabelKey), room);
  }
  for (const item of state.floorItems || []) {
    if (!item.stateLabelKey) continue;
    const cx = OX + item.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = OY + item.row * TILE_SIZE + TILE_SIZE / 2;
    drawStateBadge(ctx, cx, cy + 10, label(item.stateLabelKey), room);
  }
}

export function getFridgeFeedbackCardY(cardHeight) {
  return Math.max(16, (CANVAS_H - cardHeight) / 2);
}

// Word-wrap helper for the fact text.
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

// HUD feedback card (screen coords). Reads state.feedback = { tier, text, fact, sourceId }.
// House source affordance: verbatim quote in a CREAM sub-panel (Inter italic,
// mirrors the MarketTrip fact toast) + the app-wide gold «📖 publisher» chip via the
// shared renderSourceChip(). The tier-coloured card + icon stay (the 3-tier thumbnail
// read). The chip rect is stored on state.sourceBadgeRect so it's clickable.
export function renderFeedbackCard(ctx, state, t) {
  const fb = state.feedback;
  if (!fb || (fb.timer ?? 0) <= 0) {
    state.sourceBadgeRect = null;
    return;
  }

  const style = TIER_STYLE[fb.tier] || TIER_STYLE.accepted;
  const pad = 16;
  const cardW = 560;
  const x = (CANVAS_W - cardW) / 2;

  // Header message (Inter, on the tier-coloured card).
  ctx.font = "600 15px 'Inter', system-ui, sans-serif";
  const msgLines = wrapLines(ctx, fb.text || '', cardW - pad * 2 - 30);

  // Cream sub-panel: verbatim quote in Inter italic with quotation marks, OR, when
  // fb.paraphrase is set, our own plain sentence upright and unquoted
  // (our words must never be dressed as the source's; the chip opens the verbatim).
  const factFont = fb.paraphrase
    ? "14px 'Inter', system-ui, sans-serif"
    : "italic 14px 'Inter', system-ui, sans-serif";
  let factLines = [];
  if (fb.fact) {
    ctx.font = factFont;
    factLines = wrapLines(ctx, fb.paraphrase ? String(fb.fact) : `“${fb.fact}”`, cardW - pad * 2 - 24);
  }
  const hasSource = !!fb.sourceId;
  ctx.font = "700 13px 'Inter', system-ui, sans-serif";
  const retryLines = fb.tier === 'accepted'
    ? []
    : wrapLines(ctx, t('fridge.retry_same_food'), cardW - pad * 2);

  const lineH = 20;
  const factPanelH = factLines.length ? 12 + factLines.length * 19 + 12 : 0;
  // The source row is chip + «Press S» on its OWN line beneath it (the two used to
  // share a line and the wide publisher chip overlapped the text).
  const cardH = pad + msgLines.length * lineH
    + (factPanelH ? 10 + factPanelH : 0)
    + (hasSource ? 8 + 44 : 0)
    + (retryLines.length ? 8 + retryLines.length * 18 : 0)
    + 24
    + pad;
  const y = getFridgeFeedbackCardY(cardH);

  // Fade in/out on the last 0.4s of timer
  const alpha = Math.min(1, (fb.timer ?? 1) / 0.4);
  ctx.save();
  ctx.globalAlpha = alpha;
  // On phone landscape the card grows around its centre so even the 11 px source chip reads near 12 CSS px.
  const u = Math.min(readableUnit(canvasCssScale(ctx.canvas), 11, 12), (CANVAS_W - 40) / cardW, (CANVAS_H - 20) / cardH);
  const centreY = y + cardH / 2;
  ctx.translate(CANVAS_W / 2, centreY);
  ctx.scale(u, u);
  ctx.translate(-CANVAS_W / 2, -centreY);

  // Tier card + accent edge (keeps the 3-tier colour read).
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  roundRect(ctx, x, y, cardW, cardH, 14);
  ctx.fillStyle = style.bg;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  roundRect(ctx, x, y, cardW, cardH, 14);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = style.edge;
  ctx.stroke();

  let cy = y + pad;
  // Tier icon + message
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '18px system-ui';
  ctx.fillText(style.icon, x + pad, cy - 1);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = "600 15px 'Inter', system-ui, sans-serif";
  for (const ln of msgLines) {
    ctx.fillText(ln, x + pad + 28, cy);
    cy += lineH;
  }

  // Cream sub-panel with the verbatim quote.
  if (factLines.length) {
    cy += 10;
    const panelX = x + pad;
    const panelW = cardW - pad * 2;
    roundRect(ctx, panelX, cy, panelW, factPanelH, 10);
    ctx.fillStyle = PANEL_CREAM;
    ctx.fill();
    let qy = cy + 12;
    ctx.fillStyle = QUOTE_BROWN;
    ctx.font = factFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const ln of factLines) {
      ctx.fillText(ln, panelX + 12, qy);
      qy += 19;
    }
    cy += factPanelH;
  }

  // Shared gold source chip + «Press S». Store rect for click hit-testing.
  if (hasSource) {
    cy += 8;
    const chip = renderSourceChip(ctx, CANVAS_W / 2, cy, fb.sourceId);
    // Hit-testing works in unscaled canvas space, so store the chip where it is drawn.
    state.sourceBadgeRect = {
      x: CANVAS_W / 2 + (chip.x - CANVAS_W / 2) * u, y: centreY + (chip.y - centreY) * u,
      width: chip.width * u, height: chip.height * u,
    };
    const pressS = (t && t('fridge.press_s', 'Press S for the source ↗')) || 'Press S ↗';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = "600 12px 'Inter', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pressS, CANVAS_W / 2, cy + 32);
    cy += 44;
  } else {
    state.sourceBadgeRect = null;
  }

  if (retryLines.length) {
    cy += 8;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "700 13px 'Inter', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const line of retryLines) {
      ctx.fillText(line, CANVAS_W / 2, cy);
      cy += 18;
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = "700 12px 'Inter', system-ui, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(t('fridge.feedback_continue'), CANVAS_W / 2, cy + 7);

  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
