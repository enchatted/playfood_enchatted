// itemSurface.js — shared themed item-surface helper.
//
// The art rule: every game renders an item on a THEMED material surface — never a
// bare white card/plate. Extracted verbatim (no new colours) from the two accepted Island-1/2
// renderers the framework names as the clean reference:
//   • seasonMatcherRenderer.js::renderProductShelves  → wood-shelf tones
//   • whereDoesItGrowRenderer.js::renderGrowingSpots / drawBedTexture / SPOT_THEME → soil bed
//   • seasonMatcherRenderer.js::renderSeasonFoods      → the soft food shadow + emoji
// Every colour below is lifted byte-for-byte from those files or from WORLD_ART.
//
// Usage (drop-in for white plates/slots):
//   drawFoodItem(ctx, emoji, cx, cy, { surface: 'fridge', time, atRisk, dim, badge });

import { drawRoundedRect } from '../../utils/canvas.js';
import { ITEM_ICONS, drawMilkCartonIcon } from './itemGlyphs.js';

// Wood tones — EXACT from seasonMatcherRenderer.renderProductShelves (Island-2 shelf).
const WOOD = {
  bodyMid:   '#6D4C41',
  bodyLight: '#8D6E63',
  bodyDeep:  '#5D4037',
  border:    '#3E2723',
  interior:  '#A1887F',
  plank:     '#BCAAA4',
};
// Soil tones — EXACT from whereDoesItGrowRenderer SPOT_THEME.soil + drawBedTexture furrows.
const SOIL = {
  fill:      'rgba(122,82,48,0.92)',
  border:    '#5d4037',
  furrow:    'rgba(0,0,0,0.18)',
  highlight: 'rgba(255,255,255,0.10)',
};
const COUNTER_WARM = '#A88A5F'; // WORLD_ART.counterWarm (kitchen counter)
const FOOD_SHADOW = 'rgba(0,0,0,0.22)'; // renderSeasonFoods under-food shadow

// ── A compact themed plinth under one item (≈ shelf-block / counter / soil bed / crate). ──
// Replaces a white plate/slot 1:1. kind: 'shelf' | 'fridge' | 'crate' | 'counter' | 'soil'.
export function drawItemSurface(ctx, cx, cy, kind = 'shelf', opts = {}) {
  const w = opts.w ?? 32;
  const h = opts.h ?? 28;
  const r = opts.radius ?? 6;
  const x = cx - w / 2;
  const y = cy - h / 2;

  // Grounding drop shadow (both refs ground their surface this way).
  drawRoundedRect(ctx, x + 2, y + 3, w, h, r, 'rgba(0,0,0,0.28)', null);

  if (kind === 'soil') {
    drawRoundedRect(ctx, x, y, w, h, r, SOIL.fill, SOIL.border);
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 2; i++) {
      const fy = y + (h * i) / 3;
      ctx.strokeStyle = SOIL.furrow;
      ctx.beginPath(); ctx.moveTo(x + 5, fy); ctx.lineTo(x + w - 5, fy); ctx.stroke();
      ctx.strokeStyle = SOIL.highlight;
      ctx.beginPath(); ctx.moveTo(x + 5, fy + 1.5); ctx.lineTo(x + w - 5, fy + 1.5); ctx.stroke();
    }
    return;
  }

  if (kind === 'counter') {
    drawRoundedRect(ctx, x, y, w, h, r, COUNTER_WARM, WOOD.border);
    ctx.fillStyle = WOOD.plank; ctx.fillRect(x + 3, y + 2, w - 6, 2);       // top plank highlight
    ctx.fillStyle = 'rgba(93,64,55,0.45)'; ctx.fillRect(x + 3, y + h - 4, w - 6, 2); // base shadow
    return;
  }

  // 'shelf' | 'fridge' | 'crate' — warm wood block with plank highlights (the shelf treatment).
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, WOOD.bodyMid);
  g.addColorStop(0.5, WOOD.bodyLight);
  g.addColorStop(1, WOOD.bodyDeep);
  drawRoundedRect(ctx, x, y, w, h, r, g, WOOD.border);
  ctx.fillStyle = WOOD.interior; ctx.fillRect(x + 3, y + 3, w - 6, h - 6); // interior backing
  ctx.fillStyle = WOOD.plank;    ctx.fillRect(x + 3, y + 3, w - 6, 2);     // top plank highlight
  ctx.fillStyle = WOOD.bodyLight; ctx.fillRect(x + 3, y + h - 6, w - 6, 3); // bottom plank
  if (kind === 'crate') {
    ctx.strokeStyle = 'rgba(62,39,35,0.45)'; ctx.lineWidth = 1;            // centre slat seam
    ctx.beginPath(); ctx.moveTo(cx, y + 4); ctx.lineTo(cx, y + h - 4); ctx.stroke();
  }
}

// ── Item-on-surface: themed plinth + soft food shadow + emoji (+ optional badge). ──
// Mirrors renderSeasonFoods: under-food shadow ellipse, 24px emoji, gentle bob, badge below.
// opts: { surface, time, bob, dim, badge, font, emojiSize, icon }.
export function drawFoodItem(ctx, emoji, cx, cy, opts = {}) {
  const {
    surface = 'shelf', time = 0, bob: bobAmt = 0, dim = false, badge,
    emojiSize = 24,
  } = opts;

  if (surface) drawItemSurface(ctx, cx, cy, surface, opts);

  const bob = bobAmt ? Math.sin(time * 2 + cx * 0.05) * bobAmt : 0;
  ctx.save();
  ctx.globalAlpha = dim ? 0.35 : 1;
  // Soft shadow under the food (renderSeasonFoods).
  ctx.fillStyle = FOOD_SHADOW;
  ctx.beginPath(); ctx.ellipse(cx, cy + 11, 9, 2.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; // opaque — full-colour emoji
  if (opts.icon && ITEM_ICONS.has(opts.icon)) {
    // A drawn icon (e.g. the milk carton) in place of an emoji that does not exist.
    drawMilkCartonIcon(ctx, cx, cy + bob, emojiSize);
  } else {
    ctx.font = `${emojiSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy + bob);
  }
  ctx.restore();

  if (badge) {
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, cx, cy + 13);
  }
}
