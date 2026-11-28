import { DRAFT_MODE } from '../config/draftMode.js';
import { SOURCES } from '../data/sources.js';
import { WORLD_ART } from '../styles/brandColors.js';

/**
 * Canvas drawing helpers (Section 8)
 */

// ─── Bottom UI layout slots ───────────────────────────────────
// One source of truth: where bottom-anchored UI lives. Centralised
// so interactive prompts and onboarding hints don't collide.
//   PROMPT slot — taller, white pill, shows when the player can act
//   HINT slot   — shorter, dark pill, onboarding text (auto-fades)
export const BOTTOM_PROMPT_Y_FROM_BOTTOM = 75;
export const BOTTOM_HINT_Y_FROM_BOTTOM   = 38;
export const HINT_VISIBLE_SECONDS        = 6;

/**
 * Returns true when any interactive prompt is shown at the bottom of
 * the canvas. Onboarding hints should suppress themselves when true,
 * so the two pills don't visually overlap.
 *
 * Add new prompt flags here as they're introduced — every consumer
 * of this helper benefits automatically.
 */
export function hasActiveBottomPrompt(state) {
  return Boolean(
    state.nearCaptain
    || state.nearBoat
    || state.nearNPC
    || state.onExit
    || state.actionPrompt,
  );
}

export function drawRoundedRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

// ── Retro RPG / Pokémon dialogue-box chrome ──────────────────────────────────
// A crisp, multi-layered border: thick near-black outer frame → solid parchment
// fill → a thin light inner keyline. Square-ish corners give the classic 16-bit
// RPG feel. Shared by the Lighthouse keeper/compass dialogs and the avatar-select
// bios so the retro chrome stays identical everywhere.
export function drawRetroBox(ctx, x, y, w, h, {
  fill = '#F8F4E3',   // warm parchment fill
  outer = '#10141F',  // thick near-black outer frame
  inner = '#7C8AAE',  // thin light inner keyline
  radius = 6,
} = {}) {
  const prevLW = ctx.lineWidth;
  // 1 · thick dark outer frame (fills the whole footprint)
  drawRoundedRect(ctx, x, y, w, h, radius, outer, null);
  // 2 · solid fill, inset by the outer frame thickness
  const O = 3;
  drawRoundedRect(ctx, x + O, y + O, w - O * 2, h - O * 2, Math.max(2, radius - 1), fill, null);
  // 3 · thin light inner keyline (the second border layer)
  const I = 6;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x + I, y + I, w - I * 2, h - I * 2, Math.max(1, radius - 3), null, inner);
  ctx.lineWidth = prevLW;
}

export function drawText(ctx, text, x, y, { font = '16px sans-serif', color = '#fff', align = 'left', baseline = 'top' } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

// Largest integer font size (from `start` down to `floor`) at which `text` fits
// within `maxW`. Keeps long localized titles/labels inside fixed-width canvas
// chrome without clipping — Greek/Dutch/Portuguese strings run longer than EN.
// Side effect: leaves ctx.font set to the chosen size, so the caller can draw
// immediately. `pad` reserves horizontal breathing room inside the container.
export function fitFontPx(ctx, text, maxW, { start = 18, floor = 10, pad = 0, weight = 'bold', family = "'Inter', system-ui, sans-serif" } = {}) {
  const setFont = (px) => { ctx.font = `${weight ? weight + ' ' : ''}${px}px ${family}`; };
  let px = start;
  setFont(px);
  while (px > floor && ctx.measureText(text).width + pad > maxW) {
    px -= 1;
    setFont(px);
  }
  return px;
}

// Small round wooden token for the points metric — dark woodDeep rim, woodMid
// face, a thin woodShadow inner ring, and a soft highlight. Earthy/premium, and
// not a star, so points read distinctly from minigame performance stars.
export function drawWoodenCoin(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = WORLD_ART.woodDeep; ctx.fill();              // dark rim
  ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
  ctx.fillStyle = WORLD_ART.woodMid; ctx.fill();               // wood face
  ctx.beginPath(); ctx.arc(cx, cy, r - 3.5, 0, Math.PI * 2);
  ctx.strokeStyle = WORLD_ART.woodShadow; ctx.lineWidth = 1; ctx.stroke(); // inner ring
  ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();        // soft highlight
  ctx.restore();
}

// Combined progression pill for the HUD top-right, drawn identically on every
// screen (Harbor + Overworld):  ⭐ <stars>  |  (wooden coin) <points>
// Anchored so its right edge sits at `rightX`; `hudH` is the HUD bar height.
export function drawStatsBadge(ctx, rightX, hudH, stars, points) {
  const numFont = "bold 16px 'Inter', system-ui, sans-serif";
  ctx.font = numFont;
  const starText = '⭐ ' + stars;
  const ptStr = '' + points;
  const starW = ctx.measureText(starText).width;
  const ptW = ctx.measureText(ptStr).width;
  const coinR = 7;
  const coinW = coinR * 2;
  const seg = 9;      // gap on each side of the divider
  const iconGap = 6;  // gap between coin and its number
  const padX = 16;
  const contentW = starW + seg + 1 + seg + coinW + iconGap + ptW;
  const pillW = contentW + padX * 2;
  const pillX = rightX - pillW;
  const pillY = 5;
  const pillH = hudH - 10;
  const midY = hudH / 2;

  drawRoundedRect(ctx, pillX + 1, pillY + 1, pillW, pillH, 14, 'rgba(0,0,0,0.15)', 'transparent');
  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 14, 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.15)');

  let x = pillX + padX;
  // ⭐ + stars count (reward gold)
  drawText(ctx, starText, x, midY, { font: numFont, color: '#FFD54F', align: 'left', baseline: 'middle' });
  x += starW + seg;
  // thin divider
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, pillY + 5); ctx.lineTo(x, pillY + pillH - 5); ctx.stroke();
  x += 1 + seg;
  // wooden coin + points count
  drawWoodenCoin(ctx, x + coinR, midY, coinR);
  x += coinW + iconGap;
  drawText(ctx, ptStr, x, midY, { font: numFont, color: '#FFD54F', align: 'left', baseline: 'middle' });

  return pillX;
}

/**
 * Shared "this has a source" affordance — the app-wide gold chip («📖 publisher»),
 * matching the MarketTrip fact toast and the Island-1 reveal cards. Drawn centred
 * horizontally at `cx`, with its top edge at `top`. Returns the chip's rect
 * ({x, y, width, height}, hitTest-compatible) so callers can register a clickable
 * hotspot for the source viewer.
 */
export function renderSourceChip(ctx, cx, top, sourceId) {
  const label = '📖 ' + (SOURCES[sourceId]?.publisher || 'source');
  ctx.font = "bold 11px 'Inter', system-ui, sans-serif";
  const w = ctx.measureText(label).width + 20;
  const x = cx - w / 2;
  drawRoundedRect(ctx, x, top, w, 20, 10, '#FFE8A3', '#B8860B');
  drawText(ctx, label, cx, top + 10, {
    font: "bold 11px 'Inter', system-ui, sans-serif",
    color: '#3E2723', align: 'center', baseline: 'middle',
  });
  return { x, y: top, width: w, height: 20 };
}

export function hitTest(pointer, object) {
  return (
    pointer.x >= object.x &&
    pointer.x <= object.x + object.width &&
    pointer.y >= object.y &&
    pointer.y <= object.y + object.height
  );
}

export function getCanvasPointer(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const clientY = event.touches ? event.touches[0].clientY : event.clientY;
  // HiDPI path (see utils/hidpi.js): the backing store is CSS size × dpr, so
  // clicks map through the same scale + centring offset the renderer uses,
  // back into logical 1280×704 coordinates.
  const h = canvas.__hidpi;
  if (h) {
    const dpr = canvas.width / rect.width; // buffer px per CSS px
    return {
      x: ((clientX - rect.left) * dpr - h.ox) / h.k,
      y: ((clientY - rect.top) * dpr - h.oy) / h.k,
    };
  }
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Load an image (SVG or bitmap) for drawing on canvas.
// Returns Promise<HTMLImageElement>. Caller is responsible for caching.
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

// ─── Iris Wipe ─────────────────────────────────────────────
// Retro circular transition — openness: 0 = fully black, 1 = fully visible
export const IRIS_DURATION = 0.5; // seconds

export function drawIrisWipe(ctx, cx, cy, openness, w, h) {
  if (openness >= 1) return; // fully open, nothing to draw

  const maxR = Math.hypot(w, h) * 0.55; // slightly beyond diagonal to avoid corner peeking
  // Smoothstep easing for organic feel
  const t = Math.max(0, Math.min(1, openness));
  const eased = t * t * (3 - 2 * t);
  const r = maxR * eased;

  // DRAFT_MODE: simple circle cutout, no glow ring or donut mask trick
  if (DRAFT_MODE) {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, Math.max(r, 0), 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();
    return;
  }

  // Edge glow ring (subtle lens flare effect)
  if (r > 2) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100,181,246,${0.3 * (1 - t)})`;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
  }

  // Donut mask: outer rect with circular hole (evenodd)
  ctx.save();
  ctx.fillStyle = '#0A0E27'; // deep navy, not harsh black
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.arc(cx, cy, Math.max(r, 0), 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.restore();
}
