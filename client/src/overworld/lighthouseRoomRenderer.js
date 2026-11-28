// Lighthouse Trophy Hall renderer — the walkable interior of the world-map's
// central lighthouse. Renders the full room: coastal background (deep-blue walls
// + warm side glow), floor tiles, the four island-achievement plinths in the
// top row, the two top-wall metric plaques (stars + points), the central compass
// aisle, the postbox in the bottom-right corner, the Keeper mentor, the player,
// and all HUD / talk / exit prompts.
//
// Mirrors islandRoomRenderer.js: the 20×15 room is centred on the 1280×704
// canvas with the same OX/OY offsets, tiles blit from the shared atlas, and the
// HUD/prompts draw in screen coordinates. Reuses drawRoundedRect/drawText.

import {
  TILE_SIZE as TS, MOVE_DURATION, CANVAS_W, CANVAS_H, DIR,
} from './overworldData.js';
import {
  LIGHTHOUSE_COLS, LIGHTHOUSE_ROWS, LIGHTHOUSE_MAP, LIGHTHOUSE_MENTOR,
  LIGHTHOUSE_STATIONS, LIGHTHOUSE_BOOKSHELF_FOOTPRINT, LIGHTHOUSE_SHIPYARD_FOOTPRINT,
  DECOR_OCCUPIED, nextIslandToTackle,
} from './lighthouseData.js';
import { BRAND, WORLD_ART, ISLAND_COLORS } from '../styles/brandColors.js';
import { drawRoundedRect, drawText, drawRetroBox, drawWoodenCoin } from '../utils/canvas.js';
import { readableHudUnit, readableUnit, scaleRectBy, transformCssScale } from '../utils/hidpi.js';
import { DRAFT_MODE } from '../config/draftMode.js';
import { ISLAND_SLUGS } from './lighthouseBookshelf.js';
import { TILE, getBoatSpritesForTier } from './tileAtlas.js';
import { typewriterLines } from './typewriter.js';
import { balanceTwoLineLabel } from '../utils/balancedLabel.js';

// Per-island completion emblem (matches islandRoomData ROOMS.ceremonyIcon /
// the renderer default for growing). Shown on the plinth trophy at 3/3.
const ISLAND_ICON = {
  growing: '🌱',
  local: '🧺',
  foodwaste: '🍽️',
  circular: '🌍',
};

// Per-island emoji prefix for the plinth labels. The label TEXT itself comes
// from i18n (islands.{slug}.name, passed in via state.strings.plinthLabels) —
// the emoji is non-translatable chrome added here.
const ISLAND_LABEL_ICON = {
  growing: '🌱',
  local: '🛒',
  foodwaste: '🍽️',
  circular: '🌍',
};

// Four-point sparkle — same shape as islandRoomRenderer's helper, kept local so
// the lighthouse renderer stays self-contained.
function drawSparkleStar(ctx, x, y, r, color, alpha = 1) {
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

// Room offset — centers the 640×480 room on the 1280×704 canvas (same as islands)
const OX = (CANVAS_W - LIGHTHOUSE_COLS * TS) / 2;  // 320
const OY = (CANVAS_H - LIGHTHOUSE_ROWS * TS) / 2;  // 112

// ─── Shared unlock reveal pop ────────────────────────────
// Reusable helper: a scale-up burst + sparkle ring + soft fade, centred at (cx,cy).
// t = 0..1 (ceremony beat progress). Used by both the gold-plinth ceremony and
// (future) the bookshelf spine unlock pop. Pure visual — no side-effects.
//
// Phase breakdown:
//   0.00..0.30  → scale-up burst (golden radial flash expanding out)
//   0.00..0.70  → ring of sparkle stars orbiting outward
//   0.70..1.00  → everything fades
export function popReveal(ctx, cx, cy, t) {
  if (t <= 0 || t > 1) return;

  const fadeIn  = Math.min(1, t / 0.3);          // 0→1 over first 30%
  const fadeOut = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1; // 1→0 over last 30%
  const alpha   = fadeIn * fadeOut;

  // Expanding golden radial flash
  const maxR = 44;
  const r = maxR * Math.min(1, t / 0.5);          // expand over first 50%
  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
  grad.addColorStop(0, `rgba(255,230,80,${0.75 * alpha})`);
  grad.addColorStop(0.5, `rgba(255,200,40,${0.45 * alpha})`);
  grad.addColorStop(1, `rgba(255,200,40,0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ring of 8 sparkle stars expanding outward
  const starCount = 8;
  const orbitR = maxR * Math.min(1, t * 1.4);     // catches up to the flash
  for (let i = 0; i < starCount; i++) {
    const ang = (i * Math.PI * 2) / starCount;
    const sx = cx + Math.cos(ang) * orbitR;
    const sy = cy + Math.sin(ang) * orbitR;
    const tw = 0.5 + 0.5 * Math.abs(Math.sin(t * 12 + i));
    drawSparkleStar(ctx, sx, sy, 2.5 + tw * 2.5, '#FFE9A8', alpha * (0.5 + tw * 0.4));
  }

  // Soft white ring outline (keeps the burst readable on any background)
  ctx.save();
  ctx.globalAlpha = alpha * 0.4;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.restore();
}

// Deterministic variant index (same as the overworld / island renderers)
function variantIndex(col, row, count) {
  return ((col * 7 + row * 13 + col * row) & 0x7FFFFFFF) % count;
}

// One small white V-gull silhouette, drifting flap (lifted from harborRenderer's
// ambient gull, simplified to a pure function of time + phase).
function drawDriftGull(ctx, x, y, time, phase) {
  const flap = Math.sin(time * 7 + phase) * 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 4, y + flap);
  ctx.lineTo(x, y);
  ctx.lineTo(x + 4, y + flap);
  ctx.stroke();
  ctx.lineWidth = 1;
}

// Two arched windows in the upper wall band; through each, a gull drifts across
// a strip of sky on a slow loop. Clipped to the arch so nothing spills out.
function drawWindows(ctx, time) {
  const winW = 64, winH = 44;
  const wy = Math.max(8, OY - winH - 14);
  const centres = [CANVAS_W / 2 - 180, CANVAS_W / 2 + 180];

  for (let i = 0; i < centres.length; i++) {
    const wx = centres[i] - winW / 2;

    ctx.save();
    // Arched window opening
    ctx.beginPath();
    ctx.moveTo(wx, wy + winH);
    ctx.lineTo(wx, wy + winW / 2);
    ctx.arc(wx + winW / 2, wy + winW / 2, winW / 2, Math.PI, 0);
    ctx.lineTo(wx + winW, wy + winH);
    ctx.closePath();
    ctx.clip();

    // Sky behind the glass
    const sky = ctx.createLinearGradient(0, wy, 0, wy + winH);
    sky.addColorStop(0, '#9FD0F2');
    sky.addColorStop(1, '#CDE8FB');
    ctx.fillStyle = sky;
    ctx.fillRect(wx, wy, winW, winH);

    // A gull crossing the sky strip on a slow loop (offset per window)
    const span = winW + 24;
    const gx = wx - 12 + ((time * 16 + i * 90) % span);
    const gy = wy + 14 + Math.sin(time * 0.8 + i) * 5;
    drawDriftGull(ctx, gx, gy, time, i * 2.1);
    ctx.restore();

    // Window frame + sill (wood)
    ctx.strokeStyle = WORLD_ART.wood;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wx, wy + winH);
    ctx.lineTo(wx, wy + winW / 2);
    ctx.arc(wx + winW / 2, wy + winW / 2, winW / 2, Math.PI, 0);
    ctx.lineTo(wx + winW, wy + winH);
    ctx.stroke();
    // Mullion (cross bar)
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx + winW / 2, wy + 2);
    ctx.lineTo(wx + winW / 2, wy + winH);
    ctx.moveTo(wx, wy + winW / 2 + 4);
    ctx.lineTo(wx + winW, wy + winW / 2 + 4);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

// ─── Background ──────────────────────────────────────────
// Coastal interior: deep-blue walls washed by a warm golden glow from the
// lamp above. A radial pool of lamplight sits over the room centre so the
// space reads as "inside a lit lighthouse" rather than the generic void.

export function renderLighthouseBackground(ctx, time) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.oceanDeep;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = LIGHTHOUSE_MENTOR.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(OX - 2, OY - 2, LIGHTHOUSE_COLS * TS + 4, LIGHTHOUSE_ROWS * TS + 4);
    ctx.lineWidth = 1;
    return;
  }

  // Flat premium deep-blue wall — no gradient fade (PM directive 2026-06-23).
  // The warm radial lamp glow below supplies all the lighting variation.
  ctx.fillStyle = WORLD_ART.oceanDeep;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Warm glow now pours from the two side achievement plaques, NOT a dead-centre
  // lamp — the top centre stays bare. A gentle pulse keeps the room alive
  // without distracting.
  const pulse = 1 + Math.sin((time || 0) * 1.6) * 0.04;
  const { y: glowY, starX, pointX } = topPlaquePositions();
  ctx.save();
  for (const gx of [starX, pointX]) {
    const glow = ctx.createRadialGradient(gx, glowY, 16, gx, glowY, 250 * pulse);
    glow.addColorStop(0, 'rgba(255,213,128,0.5)'); // warm amber core
    glow.addColorStop(1, 'rgba(255,213,128,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  ctx.restore();

  // Two arched windows in the upper wall band, each showing a slice of sky and
  // a gull drifting past — the room breathes without distracting from the play
  // area (windows sit above the room, in the dark wall band).
  drawWindows(ctx, time);

  // Soft colored border around the room (keeper teal, low alpha)
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = LIGHTHOUSE_MENTOR.color;
  ctx.lineWidth = 3;
  ctx.strokeRect(OX - 4, OY - 4, LIGHTHOUSE_COLS * TS + 8, LIGHTHOUSE_ROWS * TS + 8);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

// ─── Room Tiles ──────────────────────────────────────────
// Blits the LIGHTHOUSE_MAP from the shared atlas (deep-blue walls draw as the
// BUILDING_WALL sprite, warm wood/stone floor as FLOOR_WOOD/FLOOR_STONE).

export function renderLighthouseTiles(ctx, atlas) {
  if (DRAFT_MODE) {
    const TILE_COLORS = {
      0: WORLD_ART.stoneShadow,
      1: WORLD_ART.stoneLight,
      2: WORLD_ART.wood,
    };
    for (let row = 0; row < LIGHTHOUSE_ROWS; row++) {
      for (let col = 0; col < LIGHTHOUSE_COLS; col++) {
        const dx = OX + col * TS;
        const dy = OY + row * TS;
        const isPlinthFloor = LIGHTHOUSE_STATIONS.plinths.some(
          (plinth) => plinth.col === col && plinth.row === row,
        );
        const tileId = isPlinthFloor ? TILE.FLOOR_WOOD : LIGHTHOUSE_MAP[row][col];
        ctx.fillStyle = TILE_COLORS[tileId] || WORLD_ART.counterWarm;
        ctx.fillRect(dx, dy, TS, TS);
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(dx, dy, TS, TS);
      }
    }

    for (const plinth of LIGHTHOUSE_STATIONS.plinths) {
      const center = getLighthousePlinthVisualCenter(plinth.island);
      ctx.fillStyle = TILE_COLORS[TILE.FLOOR_STONE];
      ctx.fillRect(center.cx - TS / 2, OY + plinth.row * TS, TS, TS);
    }
    return;
  }

  for (let row = 0; row < LIGHTHOUSE_ROWS; row++) {
    for (let col = 0; col < LIGHTHOUSE_COLS; col++) {
      const isPlinthFloor = LIGHTHOUSE_STATIONS.plinths.some(
        (plinth) => plinth.col === col && plinth.row === row,
      );
      const tileId = isPlinthFloor ? TILE.FLOOR_WOOD : LIGHTHOUSE_MAP[row][col];
      const dx = OX + col * TS;
      const dy = OY + row * TS;
      const variants = atlas.tiles[tileId];
      if (variants) {
        const idx = variantIndex(col, row, variants.length);
        ctx.drawImage(variants[idx], dx, dy);
      }
    }
  }

  // The middle trophies use fractional visual centers so all four displays are
  // equally spaced. Draw their stone inlays last at those same centers; keeping
  // the old grid-cell stones would leave the two middle trophies visibly offset.
  for (const plinth of LIGHTHOUSE_STATIONS.plinths) {
    const center = getLighthousePlinthVisualCenter(plinth.island);
    const variants = atlas.tiles[TILE.FLOOR_STONE];
    if (!variants) continue;
    const idx = variantIndex(plinth.col, plinth.row, variants.length);
    ctx.drawImage(
      variants[idx],
      center.cx - TS / 2,
      OY + plinth.row * TS,
    );
  }
}

// ─── Achievement stations ────────────────────────────────
// Phase 2: render every station from a pure `buildTrophyState` snapshot, so
// each in-world object reflects a REAL persisted store field (data-honesty).
// All canvas-drawn (no DOM cards). NO per-game stars — that's a later phase.
//
// Helper: tile-centre pixel for a {col,row} station.
function stationCenter(col, row) {
  return { cx: OX + col * TS + TS / 2, cy: OY + row * TS + TS / 2 };
}

const PLINTH_LABEL_WIDTH = 112;
const PLINTH_LABEL_HEIGHT = 30;

/**
 * Keep the four captions visually equidistant without moving their gameplay
 * stations. The outer captions stay anchored to the outer plinths and the two
 * inner captions share the remaining span evenly.
 */
export function getLighthousePlinthLabelLayouts() {
  const plinths = LIGHTHOUSE_STATIONS.plinths;
  const firstCenter = stationCenter(plinths[0].col, plinths[0].row).cx;
  const lastCenter = stationCenter(plinths.at(-1).col, plinths.at(-1).row).cx;
  const step = (lastCenter - firstCenter) / (plinths.length - 1);

  return plinths.map((plinth, index) => ({
    island: plinth.island,
    centerX: firstCenter + step * index,
    plinthCenterX: firstCenter + step * index,
    width: PLINTH_LABEL_WIDTH,
    height: PLINTH_LABEL_HEIGHT,
  }));
}

export function getLighthousePlinthVisualCenter(island) {
  const stationIndex = LIGHTHOUSE_STATIONS.plinths.findIndex((plinth) => plinth.island === island);
  if (stationIndex < 0) return null;

  const station = LIGHTHOUSE_STATIONS.plinths[stationIndex];
  const layout = getLighthousePlinthLabelLayouts()[stationIndex];
  return {
    cx: layout.plinthCenterX,
    cy: stationCenter(station.col, station.row).cy,
  };
}

function plinthLabelFont(fontSize) {
  return `bold ${fontSize}px 'Inter', system-ui, sans-serif`;
}

function wrapPlinthLabel(ctx, text, maxWidth) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];

  for (const word of words) {
    const previous = lines.at(-1);
    const candidate = previous ? `${previous} ${word}` : word;
    if (!previous || ctx.measureText(candidate).width <= maxWidth) {
      if (previous) lines[lines.length - 1] = candidate;
      else lines.push(candidate);
    } else {
      lines.push(word);
    }
  }

  return lines;
}

export function layoutLighthousePlinthLabelText(ctx, text, maxWidth) {
  const requestedLines = Array.isArray(text) ? text : null;
  for (let fontSize = 10; fontSize >= 8; fontSize -= 1) {
    ctx.font = plinthLabelFont(fontSize);
    const lines = requestedLines || wrapPlinthLabel(ctx, text, maxWidth);
    const fits = lines.length <= 2
      && lines.every((line) => ctx.measureText(line).width <= maxWidth);
    if (fits) return { lines, fontSize };
  }

  ctx.font = plinthLabelFont(8);
  return {
    lines: (requestedLines || wrapPlinthLabel(ctx, text, maxWidth)).slice(0, 2),
    fontSize: 8,
  };
}

export function layoutLighthousePlinthContent(ctx, {
  centerX,
  maxWidth,
  icon,
  lines,
}) {
  const iconColumnBudget = icon ? 18 : 0;
  const textLayout = layoutLighthousePlinthLabelText(
    ctx,
    lines,
    maxWidth - iconColumnBudget,
  );

  ctx.font = plinthLabelFont(textLayout.fontSize);
  const lineWidths = textLayout.lines.map((line) => ctx.measureText(line).width);
  const textWidth = Math.max(0, ...lineWidths);
  const gap = icon ? 4 : 0;

  ctx.font = `${textLayout.fontSize + 2}px sans-serif`;
  const iconWidth = icon ? ctx.measureText(icon).width : 0;
  const contentWidth = iconWidth + gap + textWidth;
  const contentLeft = centerX - contentWidth / 2;
  const textX = contentLeft + iconWidth + gap;

  return {
    ...textLayout,
    contentLeft,
    contentRight: contentLeft + contentWidth,
    iconCenterX: icon ? contentLeft + iconWidth / 2 : null,
    linePositions: textLayout.lines.map((line) => ({ text: line, x: textX })),
  };
}

function drawPlinthLabel(ctx, layout, y, { icon, lines }) {
  const x = layout.centerX - layout.width / 2;
  drawRoundedRect(
    ctx,
    x,
    y,
    layout.width,
    layout.height,
    6,
    'rgba(42,26,14,0.92)',
    'rgba(0,0,0,0.35)',
  );

  const contentLayout = layoutLighthousePlinthContent(ctx, {
    centerX: layout.centerX,
    maxWidth: layout.width - 14,
    icon,
    lines,
  });
  const lineHeight = contentLayout.fontSize + 2;
  const firstBaseline = y + layout.height / 2
    - ((contentLayout.lines.length - 1) * lineHeight) / 2;

  if (icon) {
    drawText(ctx, icon, contentLayout.iconCenterX, y + layout.height / 2, {
      font: `${contentLayout.fontSize + 2}px sans-serif`,
      color: '#FFF3C4',
      align: 'center',
      baseline: 'middle',
    });
  }

  contentLayout.linePositions.forEach(({ text, x: textX }, index) => {
    drawText(ctx, text, textX, firstBaseline + index * lineHeight, {
      font: plinthLabelFont(contentLayout.fontSize),
      color: '#FFF3C4',
      align: 'left',
      baseline: 'middle',
    });
  });
}

// A small high-contrast caption pill, centred at (cx) with its baseline-top at y.
function captionPill(ctx, cx, y, text, { bg = 'rgba(42,26,14,0.92)', fg = '#FFF3C4', maxW = null } = {}) {
  // Long i18n labels (e.g. "Climate & Circular Economy") would overflow a fixed
  // 11px pill and overlap the neighbouring plinth. When maxW is given, shrink the
  // font (down to a 8px floor) so the label fits its slot without truncation.
  const fontAt = (px) => `bold ${px}px 'Inter', system-ui, sans-serif`;
  let px = 11;
  ctx.font = fontAt(px);
  let tw = ctx.measureText(text).width;
  if (maxW && tw + 16 > maxW) {
    px = Math.max(8, Math.floor((px * (maxW - 16)) / tw));
    ctx.font = fontAt(px);
    tw = ctx.measureText(text).width;
  }
  const w = tw + 16;
  drawRoundedRect(ctx, cx - w / 2, y, w, 17, 6, bg, 'rgba(0,0,0,0.35)');
  drawText(ctx, text, cx, y + 8, {
    font: fontAt(px), color: fg, align: 'center', baseline: 'middle',
  });
}

// Shared typewriter tuning for the retro dialogue boxes (keeper + compass).
const TYPEWRITER_CPS = 45; // characters revealed per second
// Seconds since a dialog opened; a null/undefined stamp reveals instantly (safe).
function typewriterElapsed(openedAt, time) {
  return openedAt == null ? 999 : (time || 0) - openedAt;
}

// drawRetroBox (the multi-layer Pokémon dialogue-box chrome) now lives in
// utils/canvas.js so the avatar-select screen can share it. Imported above.

// Shared placement for the two top-wall metric plaques (and the warm glow that
// now pours from them). There is NO centre lamp any more (PM directive 2026-06-24):
// the top-centre wall is bare, and BOTH headline metrics live on the sides —
// stars between the growing & local plinths, points between foodwaste & circular,
// at the old lamp-row height.
function topPlaquePositions() {
  const cxOf = {};
  for (const p of LIGHTHOUSE_STATIONS.plinths) {
    cxOf[p.island] = stationCenter(p.col, p.row).cx;
  }
  const lamp = LIGHTHOUSE_STATIONS.lamp;
  return {
    y: stationCenter(lamp.col, lamp.row).cy,
    starX: (cxOf.growing + cxOf.local) / 2,
    pointX: (cxOf.foodwaste + cxOf.circular) / 2,
  };
}

// ── 1 · Top-wall metric plaques — stars (left) + points (right) ──
// Two symmetrical "hero" plaques flank the (now-empty) top centre, mirroring the
// dual-metric HUD pill: a gold star + total minigame stars on the left, a wooden
// coin + total points on the right. Each gets the full achievement treatment —
// a bright pulsing gold halo, orbiting sparkle stars, and a glowing gold frame —
// so both read as celebrated trophies, not flat signage.
function renderMetricPlaque(ctx, cx, cy, drawIcon, value, time) {
  const numFont = "bold 18px 'Inter', system-ui, sans-serif";
  ctx.font = numFont;
  const valStr = '' + (value || 0);
  const valW = ctx.measureText(valStr).width;
  const iconR = 9;
  const gap = 8;
  const padX = 15;
  const faceW = iconR * 2 + gap + valW + padX * 2;
  const faceH = 32;
  const frame = 4;
  const fx = cx - faceW / 2;
  const fy = cy - faceH / 2;

  // Bright, gently-pulsing golden halo behind the plaque (phase varies by cx so
  // the two plaques don't breathe in lockstep).
  const pulse = 1 + Math.sin((time || 0) * 2.2 + cx * 0.04) * 0.07;
  const glowR = (faceW * 0.85 + 18) * pulse;
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, 6, cx, cy, glowR);
  glow.addColorStop(0, 'rgba(255,213,79,0.62)');
  glow.addColorStop(0.55, 'rgba(255,200,60,0.28)');
  glow.addColorStop(1, 'rgba(255,213,79,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Orbiting sparkle stars hugging the frame — the "earned achievement" feel,
  // same sparkle shape used on the gold plinth trophies.
  const rx = faceW / 2 + 12;
  const ry = faceH / 2 + 12;
  for (let i = 0; i < 5; i++) {
    const ang = (time || 0) * 1.1 + cx + (i * Math.PI * 2) / 5;
    const sx = cx + Math.cos(ang) * rx;
    const sy = cy + Math.sin(ang) * ry;
    const tw = 0.5 + 0.5 * Math.abs(Math.sin((time || 0) * 3 + i * 1.6 + cx));
    drawSparkleStar(ctx, sx, sy, 1.8 + tw * 2.4, '#FFE9A8', 0.4 + tw * 0.5);
  }

  // Drop shadow → dark wood frame → wood face → top sheen (same wood palette as
  // the plinths/bookshelf, so the plaque belongs in the hall).
  drawRoundedRect(ctx, fx - frame + 2, fy - frame + 3, faceW + frame * 2, faceH + frame * 2, 9, 'rgba(0,0,0,0.30)', 'transparent');
  drawRoundedRect(ctx, fx - frame, fy - frame, faceW + frame * 2, faceH + frame * 2, 9, WORLD_ART.woodDeep, '#2A1A0E');
  drawRoundedRect(ctx, fx, fy, faceW, faceH, 6, WORLD_ART.woodMid, WORLD_ART.woodShadow);

  // The "glowing yellow frame" itself — a gold keyline with a soft bloom
  // (shadowBlur). Saved/restored so nothing else in the room blooms.
  ctx.save();
  ctx.shadowColor = 'rgba(255,213,79,0.9)';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, fx + 1.5, fy + 1.5, faceW - 3, faceH - 3, 5, null, '#FFD54F');
  ctx.restore();
  ctx.lineWidth = 1;

  // top-edge sheen
  drawRoundedRect(ctx, fx + 3, fy + 2.5, faceW - 6, 4, 2, 'rgba(255,255,255,0.20)', 'transparent');

  // Icon + value, centred within the face. Value gets a 1px drop shadow for
  // legibility against the wood.
  const ix = fx + padX + iconR;
  drawIcon(ctx, ix, cy);
  const tx = ix + iconR + gap;
  drawText(ctx, valStr, tx + 1, cy + 1, { font: numFont, color: 'rgba(0,0,0,0.5)', align: 'left', baseline: 'middle' });
  drawText(ctx, valStr, tx, cy, { font: numFont, color: '#FFF3C4', align: 'left', baseline: 'middle' });
}

function renderTopPlaques(ctx, trophy, time) {
  const { y, starX, pointX } = topPlaquePositions();

  // Left plaque — accumulated minigame stars (gold ⭐, matches the HUD).
  const drawStarIcon = (c, ix, iy) => {
    c.font = '18px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('⭐', ix, iy);
  };
  renderMetricPlaque(ctx, starX, y, drawStarIcon, trophy.stars, time);

  // Right plaque — accumulated points (wooden coin, matches the HUD).
  const drawCoinIcon = (c, ix, iy) => drawWoodenCoin(c, ix, iy, 9);
  renderMetricPlaque(ctx, pointX, y, drawCoinIcon, trophy.points, time);
}

// ── 2 · Four island plinths — pedestal + trophy + count / ceremony icon ──
function renderPlinth(ctx, station, islandState, time, strings, labelLayout) {
  const { col, row, island } = station;
  const dy = OY + row * TS;
  const cx = labelLayout.plinthCenterX;
  const tint = ISLAND_COLORS[island] || '#888';
  const done = islandState?.done;
  const count = islandState?.count || 0;

  // Pedestal (themed)
  const baseW = 42, baseH = 20;
  const baseX = cx - baseW / 2, baseY = dy + TS - baseH + 4;
  drawRoundedRect(ctx, baseX + 2, baseY + 3, baseW, baseH, 4, 'rgba(0,0,0,0.3)', 'transparent');
  drawRoundedRect(ctx, baseX, baseY, baseW, baseH, 4, tint, '#2A1A0E');
  // pedestal top lip
  drawRoundedRect(ctx, baseX - 3, baseY - 5, baseW + 6, 8, 3, tint, '#2A1A0E');

  // Trophy / emblem above the pedestal
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (done) {
    // Gold trophy + a soft sparkle ring + that island's ceremony icon
    const bob = Math.sin((time || 0) * 2 + col) * 1.5;
    ctx.save();
    const g = ctx.createRadialGradient(cx, dy + 8, 2, cx, dy + 8, 22);
    g.addColorStop(0, 'rgba(255,213,79,0.55)');
    g.addColorStop(1, 'rgba(255,213,79,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, dy + 8 + bob, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Twinkling sparkles around an earned trophy — the achievement feels alive.
    for (let i = 0; i < 3; i++) {
      const ang = (time || 0) * 1.3 + col + (i * Math.PI * 2) / 3;
      const sx = cx + Math.cos(ang) * 18;
      const sy = dy + 8 + bob + Math.sin(ang) * 14;
      const tw = 0.5 + 0.5 * Math.abs(Math.sin((time || 0) * 3 + i + col));
      drawSparkleStar(ctx, sx, sy, 1.8 + tw * 2.2, '#FFE9A8', 0.4 + tw * 0.5);
    }
    ctx.font = '24px sans-serif';
    ctx.fillText('🏆', cx, dy + 6 + bob);
    ctx.font = '13px sans-serif';
    ctx.fillText(ISLAND_ICON[island] || '🌱', cx, dy + 26 + bob);
  } else {
    // Dimmer trophy + the x/3 count, so partial progress still reads
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.font = '22px sans-serif';
    ctx.fillText('🏆', cx, dy + 8);
    ctx.restore();
    captionPill(ctx, cx, dy + 18, `${count}/3`,
      { bg: 'rgba(42,26,14,0.85)', fg: '#E8D6B8' });
  }

  // Plinth name label beneath the base — use the canonical short island name.
  // Falls back to the full island name, then to the slug if neither is supplied.
  const nick = strings?.plinthNicks?.[island] || strings?.plinthLabels?.[island] || island;
  const icon = ISLAND_LABEL_ICON[island];
  drawPlinthLabel(
    ctx,
    labelLayout,
    baseY + baseH + 4,
    { icon, lines: balanceTwoLineLabel(nick) },
  );
}

// ── 3 · Postbox (bottom-right corner) — discreet postbox, no label ──
// Opens the phygital code modal when interacted with; no kid-facing wording.
function renderPostbox(ctx, station) {
  const { col, row } = station;
  const dx = OX + col * TS;
  const dy = OY + row * TS;
  const cx = dx + TS / 2;

  // Post body — a small red mailbox
  const bw = 24, bh = 18;
  const bx = cx - bw / 2, by = dy + TS - bh - 4;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  drawRoundedRect(ctx, bx + 2, by + 3, bw, bh, 4, 'rgba(0,0,0,0.18)', 'transparent');
  // Body
  drawRoundedRect(ctx, bx, by, bw, bh, 4, '#C62828', '#7B1818');
  // Rounded top (arch)
  ctx.beginPath();
  ctx.arc(cx, by, bw / 2, Math.PI, 0);
  ctx.fillStyle = '#E53935';
  ctx.fill();
  ctx.strokeStyle = '#7B1818';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.lineWidth = 1;
  // Slot (letter aperture)
  const slotW = bw - 8, slotH = 3;
  ctx.fillStyle = '#7B1818';
  ctx.fillRect(cx - slotW / 2, by + 6, slotW, slotH);
  // Base / stand
  drawRoundedRect(ctx, cx - 5, by + bh - 1, 10, 5, 2, WORLD_ART.wood, '#2A1A0E');
}

// ── 8 · Sources bookshelf (left wall) — 4 colour-coded island groups ──
// The bookcase occupies cols 1–2 and rows 7–10. Its footprint is shared with
// lighthouseData so the visible furniture and movement collision stay aligned.
//
// shelves = buildBookshelf(completedMissions) — passed in via state.shelves.
// Spine colours:
//   UNLOCKED → filled in the island colour, gold edge.
//   LOCKED   → grey fill, faint lock glyph.
//   PENDING  → island colour + a «!» badge in the top corner.

// Tiny 🔒 drawn as a simple padlock outline so it works at 4–5px sizes.
function drawMiniLock(ctx, x, y) {
  const bw = 4, bh = 4, br = 2;
  // shackle arch
  ctx.beginPath();
  ctx.arc(x + bw / 2, y, bw / 2 - 0.5, Math.PI, 0);
  ctx.strokeStyle = '#F3D98B';
  ctx.lineWidth = 1;
  ctx.stroke();
  // lock body
  ctx.fillStyle = '#D6A93E';
  drawRoundedRect(ctx, x, y + br - 1, bw, bh, 1, '#D6A93E', '#6B4A27');
}

export function renderBookshelf(ctx, shelves, time) {
  if (!shelves) return;
  const {
    leftCol, topRow, cols: caseCols, rows: caseRows,
  } = LIGHTHOUSE_BOOKSHELF_FOOTPRINT;
  const caseX = OX + leftCol * TS;
  const caseY = OY + topRow * TS;
  const caseW = caseCols * TS;
  const caseH = caseRows * TS;
  const innerX = caseX + 7;
  const innerY = caseY + 10;
  const innerW = caseW - 14;
  const innerH = caseH - 18;
  // Extra sources share a second row inside the same collision footprint.
  // Six-pixel spines keep approval badges and locks at their existing size.
  const booksPerRow = Math.floor((innerW - 1) / 7);
  const rows = ISLAND_SLUGS.flatMap((island, islandIndex) => {
    const spines = shelves[island] || [];
    const rowCount = Math.max(1, Math.ceil(spines.length / booksPerRow));
    return Array.from({ length: rowCount }, (_, rowIndex) => ({
      island,
      islandIndex,
      compact: spines.length > 6,
      firstSpineIndex: rowIndex * booksPerRow,
      spines: spines.slice(rowIndex * booksPerRow, (rowIndex + 1) * booksPerRow),
    }));
  });
  const shelfH = innerH / rows.length;
  const palette = {
    woodLight: '#E1B778',
    wood: '#B17843',
    woodMid: '#8B5732',
    woodDeep: '#53331F',
    backing: '#946A48',
    paper: '#F2E4C2',
    brass: '#E5B84F',
  };
  const lockedBookColors = [
    '#7894AA', '#A87C72', '#7F987C',
    '#A58E5E', '#81789D', '#6F928C',
  ];

  ctx.save();

  // A firm cast shadow and small feet make the cabinet sit on the floor.
  ctx.fillStyle = 'rgba(42,26,14,0.24)';
  ctx.fillRect(caseX + 5, caseY + 7, caseW + 2, caseH - 3);
  ctx.fillStyle = palette.woodDeep;
  ctx.fillRect(caseX + 6, caseY + caseH - 5, 9, 5);
  ctx.fillRect(caseX + caseW - 15, caseY + caseH - 5, 9, 5);

  // Layered carcass: warm timber face, recessed back and highlighted stiles.
  ctx.fillStyle = palette.woodDeep;
  ctx.fillRect(caseX + 1, caseY + 3, caseW - 2, caseH - 7);
  ctx.fillStyle = palette.wood;
  ctx.fillRect(caseX + 3, caseY + 5, caseW - 6, caseH - 11);
  ctx.fillStyle = palette.backing;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  // Crown and base moulding keep the silhouette recognisable at small sizes.
  ctx.fillStyle = palette.woodDeep;
  ctx.fillRect(caseX, caseY + 2, caseW, 5);
  ctx.fillRect(caseX, caseY + caseH - 10, caseW, 6);
  ctx.fillStyle = palette.woodLight;
  ctx.fillRect(caseX + 2, caseY + 2, caseW - 4, 2);
  ctx.fillRect(caseX + 3, caseY + caseH - 10, caseW - 6, 2);

  // Side stiles with a narrow highlight and deep inner shadow.
  ctx.fillStyle = palette.woodMid;
  ctx.fillRect(caseX + 3, caseY + 7, 5, caseH - 17);
  ctx.fillRect(caseX + caseW - 8, caseY + 7, 5, caseH - 17);
  ctx.fillStyle = palette.woodLight;
  ctx.fillRect(caseX + 4, caseY + 8, 1, caseH - 19);
  ctx.fillStyle = 'rgba(42,26,14,0.34)';
  ctx.fillRect(caseX + 7, caseY + 8, 2, caseH - 19);
  ctx.fillRect(caseX + caseW - 9, caseY + 8, 2, caseH - 19);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const { island, islandIndex: si, compact, firstSpineIndex, spines } = rows[rowIndex];
    const tint = ISLAND_COLORS[island] || '#888';
    const shelfTop = innerY + rowIndex * shelfH;
    const shelfBottom = shelfTop + shelfH;

    // A quiet island-colour stripe identifies the shelf without tinting all wood.
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = tint;
    ctx.fillRect(innerX + 1, shelfTop + 1, innerW - 2, 2);
    ctx.restore();

    const bookWidths = spines.map((_, pi) => compact ? 6 : 6 + ((pi + si) % 2));
    const booksWidth = bookWidths.reduce((sum, width) => sum + width, 0)
      + Math.max(0, spines.length - 1);
    let bookX = innerX + Math.max(1, Math.floor((innerW - booksWidth) / 2));

    for (let pi = 0; pi < spines.length; pi++) {
      const spine = spines[pi];
      const spineW = bookWidths[pi];
      const heightDrop = ((pi + firstSpineIndex) * 3 + si * 2) % 5;
      const spineH = Math.max(13, Math.floor(shelfH - 7 - heightDrop));
      const sx = Math.round(bookX);
      const spineY = Math.round(shelfBottom - 5 - spineH);

      // One-pixel contact shadow keeps each volume separate from its neighbour.
      ctx.fillStyle = 'rgba(42,26,14,0.38)';
      ctx.fillRect(sx + 1, spineY + 1, spineW, spineH);

      if (spine.unlocked) {
        const pulse = spine.pending ? 1 : 1 + Math.sin(time * 2.5 + pi * 0.9) * 0.04;
        ctx.save();
        ctx.globalAlpha = 0.92 * pulse;
        ctx.fillStyle = tint;
        ctx.fillRect(sx, spineY, spineW, spineH);
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = palette.paper;
        ctx.fillRect(sx + 1, spineY + 2, Math.max(2, spineW - 2), 1);
        ctx.fillRect(sx + 1, spineY + spineH - 3, Math.max(2, spineW - 2), 1);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = palette.brass;
        ctx.fillRect(sx, spineY, 1, spineH);
        ctx.restore();

        if (spine.pending) {
          ctx.save();
          ctx.fillStyle = '#FFEB3B';
          ctx.beginPath();
          ctx.arc(sx + spineW - 2, spineY + 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#5D4037';
          ctx.font = 'bold 4px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', sx + spineW - 2, spineY + 2);
          ctx.restore();
        }
      } else {
        // Locked volumes keep distinct cloth covers; the brass lock communicates
        // state without turning the whole library into a row of grey slots.
        ctx.fillStyle = lockedBookColors[(pi + si * 2) % lockedBookColors.length];
        ctx.fillRect(sx, spineY, spineW, spineH);
        ctx.fillStyle = palette.paper;
        ctx.globalAlpha = 0.72;
        ctx.fillRect(sx + 1, spineY + 2, Math.max(2, spineW - 2), 1);
        ctx.fillRect(sx + 1, spineY + spineH - 3, Math.max(2, spineW - 2), 1);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(60,48,39,0.42)';
        ctx.fillRect(sx, spineY, 1, spineH);
        drawMiniLock(ctx, sx + spineW / 2 - 2, spineY + spineH / 2 - 3);
      }

      bookX += spineW + 1;
    }

    // Substantial shelf plank: light top edge, warm face, dark underside.
    ctx.fillStyle = palette.woodLight;
    ctx.fillRect(caseX + 5, shelfBottom - 5, caseW - 10, 2);
    ctx.fillStyle = palette.woodMid;
    ctx.fillRect(caseX + 4, shelfBottom - 3, caseW - 8, 4);
    ctx.fillStyle = palette.woodDeep;
    ctx.fillRect(caseX + 5, shelfBottom + 1, caseW - 10, 2);
  }

  // A small open book rests on the crown as a physical sign, replacing the
  // floating emoji pill while keeping the library instantly recognisable.
  const signX = caseX + caseW / 2;
  const signY = caseY - 5;
  ctx.fillStyle = palette.woodDeep;
  ctx.fillRect(signX - 12, signY + 7, 24, 3);
  ctx.fillStyle = '#C9574C';
  ctx.fillRect(signX - 11, signY, 10, 7);
  ctx.fillStyle = '#4C8B63';
  ctx.fillRect(signX + 1, signY, 10, 7);
  ctx.fillStyle = palette.paper;
  ctx.fillRect(signX - 9, signY + 1, 8, 5);
  ctx.fillRect(signX + 1, signY + 1, 8, 5);
  ctx.fillStyle = palette.woodDeep;
  ctx.fillRect(signX - 1, signY, 2, 7);

  // Brass pins are the single bright material accent; everything else stays wood.
  ctx.fillStyle = palette.brass;
  ctx.fillRect(caseX + 4, caseY + 5, 2, 2);
  ctx.fillRect(caseX + caseW - 6, caseY + 5, 2, 2);

  ctx.restore();
}

// ── Central sea-compass (Layout B anchor) — needle aims at the next island ──
// Pure visual: disc + ticks + needle. The needle points at the plinth of the
// next island to tackle (nextIslandToTackle); when every island is lit it spins
// gently as a quiet "all explored" flourish. Gives the room centre a focal
// point. Drawn centred on CANVAS_W/2 (true canvas horizontal middle) so it
// sits on the room's true vertical axis — the interaction tile stays at
// (9,7), only the draw centre shifts the 16px right to true centre.
function renderCompass(ctx, station, trophy, time) {
  // Draw on the true canvas centre — not the col-9 tile centre.
  const { cy } = stationCenter(station.col, station.row);
  const cx = CANVAS_W / 2;
  const R = 19;

  // Warm anchor glow so the centre reads as a focal point.
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, 3, cx, cy, R + 16);
  glow.addColorStop(0, 'rgba(255,235,180,0.40)');
  glow.addColorStop(1, 'rgba(255,235,180,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Brass disc + rim
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#F1E2BE';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#7A5A2E';
  ctx.stroke();
  ctx.lineWidth = 1;

  // N/E/S/W tick marks
  ctx.strokeStyle = '#7A5A2E';
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const ox = Math.cos(a), oy = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx + ox * (R - 5), cy + oy * (R - 5));
    ctx.lineTo(cx + ox * (R - 1), cy + oy * (R - 1));
    ctx.stroke();
  }

  // Needle → next island to tackle (else a slow celebratory spin when all done)
  const target = nextIslandToTackle(trophy);
  let ang;
  if (target) {
    const p = LIGHTHOUSE_STATIONS.plinths.find((pl) => pl.island === target);
    const pc = stationCenter(p.col, p.row);
    ang = Math.atan2(pc.cy - cy, pc.cx - cx);
  } else {
    ang = (time || 0) * 0.6;
  }
  const nx = Math.cos(ang), ny = Math.sin(ang);
  const tipX = cx + nx * (R - 4), tipY = cy + ny * (R - 4);
  const tailX = cx - nx * (R - 7), tailY = cy - ny * (R - 7);
  const sX = -ny * 3.5, sY = nx * 3.5;
  ctx.beginPath();           // slim red needle (front half toward the target)
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(cx + sX, cy + sY);
  ctx.lineTo(tailX, tailY);
  ctx.lineTo(cx - sX, cy - sY);
  ctx.closePath();
  ctx.fillStyle = '#D7402F';
  ctx.fill();
  // Hub pin
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#3A2A18';
  ctx.fill();
}

// ─── Ambient décor ───────────────────────────────────────
// Three decorative fills for the lower-left floor:
//   1. Warm rug (walkable — visual only, drawn UNDER everything else in the nook)
//   2. Cosy armchair (solid prop, OCCUPIED)
//   3. Small floor lantern (solid prop, OCCUPIED, warm glow)
//   4. Two potted plants (solid props, OCCUPIED)
//   5. Cat curled on the rug (visual only, NOT OCCUPIED, animated via time)
//
// Coordinates mirror DECOR_OCCUPIED in lighthouseData.js — keep in sync.
// All pixel maths use the shared OX/OY offsets and TS tile size.

// ── Rug — warm rounded mat, drawn first so props sit on top ──
function drawRug(ctx) {
  // Span the reading-nook area: approx cols 13-16, rows 10-12 (bottom-right)
  const rx = OX + 13 * TS + 4;
  const ry = OY + 10 * TS + 4;
  const rw = 4 * TS - 8;   // 4 tile-widths, slightly inset
  const rh = 3 * TS - 8;   // 3 tile-heights, slightly inset

  ctx.save();

  // Drop shadow
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  drawRoundedRect(ctx, rx + 3, ry + 4, rw, rh, 14, '#000', 'transparent');
  ctx.globalAlpha = 1;

  // Rug body — warm terracotta-amber
  drawRoundedRect(ctx, rx, ry, rw, rh, 14, '#B05A30', 'transparent');

  // Inner border stripe (decorative pattern)
  ctx.globalAlpha = 0.35;
  drawRoundedRect(ctx, rx + 5, ry + 5, rw - 10, rh - 10, 10, 'transparent', '#FFD080');
  ctx.globalAlpha = 1;

  // Diamond pattern dots — simple repeating texture
  ctx.fillStyle = 'rgba(255,210,120,0.30)';
  const dotSpacingX = 16, dotSpacingY = 14;
  for (let dx = rx + 14; dx < rx + rw - 10; dx += dotSpacingX) {
    for (let dy = ry + 14; dy < ry + rh - 10; dy += dotSpacingY) {
      ctx.beginPath();
      ctx.arc(dx, dy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ── Armchair — cosy chair in the bottom-right reading nook (col 15, row 11) ──
function drawArmchair(ctx) {
  // Anchor: tile (15, 11) — chair fits snugly in one tile width
  const tx = OX + 15 * TS;
  const ty = OY + 11 * TS;
  const cx = tx + TS / 2;

  ctx.save();

  // Shadow
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, ty + TS - 4, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Seat cushion
  const seatW = 26, seatH = 10;
  const seatX = cx - seatW / 2, seatY = ty + TS - seatH - 4;
  drawRoundedRect(ctx, seatX, seatY, seatW, seatH, 4, '#8B4513', '#5C2D0A');

  // Seat pad (lighter cushion on top)
  drawRoundedRect(ctx, seatX + 2, seatY - 4, seatW - 4, 8, 3, '#C07030', '#8B4513');

  // Back rest
  const backW = 26, backH = 16;
  const backX = cx - backW / 2, backY = seatY - backH + 2;
  drawRoundedRect(ctx, backX, backY, backW, backH, 5, '#8B4513', '#5C2D0A');
  // Back cushion
  drawRoundedRect(ctx, backX + 2, backY + 2, backW - 4, backH - 6, 4, '#A05020', '#8B4513');

  // Left armrest
  drawRoundedRect(ctx, seatX - 5, seatY - 8, 7, 18, 3, '#6B340A', '#3C1A05');
  // Right armrest
  drawRoundedRect(ctx, seatX + seatW - 2, seatY - 8, 7, 18, 3, '#6B340A', '#3C1A05');

  // Legs (two visible from top-down, flanking seat)
  ctx.fillStyle = '#4A2005';
  ctx.fillRect(seatX + 2, seatY + seatH - 2, 4, 5);
  ctx.fillRect(seatX + seatW - 6, seatY + seatH - 2, 4, 5);

  ctx.restore();
}

// ── Floor lantern — small warm lantern beside the armchair (col 16, row 12) ──
function drawFloorLantern(ctx, time) {
  const tx = OX + 16 * TS;
  const ty = OY + 12 * TS;
  const cx = tx + TS / 2;
  const cy = ty + TS / 2;

  const pulse = 1 + Math.sin((time || 0) * 2.8) * 0.06;

  ctx.save();

  // Warm glow pool on the floor (smaller, gentler version of the main lamp's glow)
  const glowR = 22 * pulse;
  const glow = ctx.createRadialGradient(cx, cy + 4, 3, cx, cy + 4, glowR);
  glow.addColorStop(0, 'rgba(255,190,80,0.45)');
  glow.addColorStop(1, 'rgba(255,190,80,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy + 4, glowR, 0, Math.PI * 2);
  ctx.fill();

  // Lantern base / stand
  const baseW = 6, baseH = 8;
  drawRoundedRect(ctx, cx - baseW / 2, cy + 8, baseW, baseH, 2, WORLD_ART.wood, '#2A1A0E');

  // Lantern body — small hexagonal-ish glass box
  const lw = 12, lh = 14;
  const lx = cx - lw / 2, ly = cy - 2;
  // Metal frame (dark)
  drawRoundedRect(ctx, lx - 1, ly - 1, lw + 2, lh + 2, 3, '#3A2808', 'transparent');
  // Glass panel (warm amber)
  const glassAlpha = 0.55 + Math.sin((time || 0) * 2.8) * 0.08;
  ctx.globalAlpha = glassAlpha;
  drawRoundedRect(ctx, lx, ly, lw, lh, 2, '#FFC840', 'transparent');
  ctx.globalAlpha = 1;
  // Inner flame glint
  ctx.fillStyle = `rgba(255,240,180,${0.7 + Math.sin((time || 0) * 4.5) * 0.2})`;
  ctx.beginPath();
  ctx.ellipse(cx, ly + lh / 2, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cap / top finial
  drawRoundedRect(ctx, cx - 5, ly - 4, 10, 5, 2, '#2A1A0E', 'transparent');
  ctx.fillStyle = '#3A2808';
  ctx.beginPath();
  ctx.arc(cx, ly - 4, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Potted plants ──────────────────────────────────────────
// plant1: col 13, row 9 — top-left of the bottom-right nook
// plant2: col 16, row 9 — top-right of the bottom-right nook

function drawPot(ctx, cx, baseY, tint) {
  // Terracotta pot
  const pw = 14, ph = 10;
  drawRoundedRect(ctx, cx - pw / 2, baseY - ph, pw, ph, 3, tint, '#5C2005');
  // Pot rim
  ctx.fillStyle = '#A04010';
  ctx.fillRect(cx - pw / 2 - 1, baseY - ph, pw + 2, 3);
  // Soil
  ctx.fillStyle = '#3D1C00';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - ph + 3, pw / 2 - 2, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlant(ctx, col, row, time, variant) {
  const tx = OX + col * TS;
  const ty = OY + row * TS;
  const cx = tx + TS / 2;
  const baseY = ty + TS - 2;

  ctx.save();

  // Shadow
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, baseY, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const sway = Math.sin((time || 0) * 1.5 + variant * 2.1) * 1.2;

  if (variant === 0) {
    // Tall herb / basil — a few upright stems
    drawPot(ctx, cx, baseY, '#B04010');
    const stems = 3;
    for (let i = 0; i < stems; i++) {
      const sx = cx + (i - 1) * 5;
      const stemH = 14 + i * 3;
      ctx.strokeStyle = '#2E6B14';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, baseY - 10);
      ctx.quadraticCurveTo(sx + sway, baseY - 10 - stemH / 2, sx + sway * 0.5, baseY - 10 - stemH);
      ctx.stroke();
      ctx.lineWidth = 1;
      // Leaf cluster at top
      ctx.fillStyle = '#3A8C1C';
      ctx.beginPath();
      ctx.ellipse(sx + sway * 0.5, baseY - 10 - stemH, 4, 5, 0.3 * i, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4CAF20';
      ctx.beginPath();
      ctx.ellipse(sx + sway * 0.5, baseY - 10 - stemH - 1, 2.5, 3.5, 0.3 * i, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Round bushy plant / mini fern
    drawPot(ctx, cx, baseY, '#8B4513');
    const leaves = 7;
    for (let i = 0; i < leaves; i++) {
      const ang = (i * Math.PI * 2) / leaves;
      const lr = 7 + (i % 2) * 2;
      const lx = cx + Math.cos(ang) * lr + sway * 0.4;
      const ly = baseY - 12 - Math.sin(ang) * lr * 0.5;
      ctx.fillStyle = i % 2 === 0 ? '#3A8C1C' : '#4CAF20';
      ctx.beginPath();
      ctx.ellipse(lx, ly, 4, 5.5, ang + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Centre highlight
    ctx.fillStyle = '#5CC830';
    ctx.beginPath();
    ctx.arc(cx + sway * 0.2, baseY - 13, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ── Cat — a warm tabby resting in the reading nook ──
// Positioned on the rug near the armchair (~col 14, between rows 11-12).
// NOT in OCCUPIED — draws over the floor, player walks through.
const CAT_IDLE_CYCLE_SECONDS = 9.6;

function smoothStep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function getLighthouseCatPose(time = 0) {
  const phase = ((time % CAT_IDLE_CYCLE_SECONDS) + CAT_IDLE_CYCLE_SECONDS)
    % CAT_IDLE_CYCLE_SECONDS;

  let headLift = 0;
  if (phase >= 6.4 && phase < 7.1) {
    headLift = smoothStep((phase - 6.4) / 0.7);
  } else if (phase >= 7.1 && phase < 7.9) {
    headLift = 1;
  } else if (phase >= 7.9 && phase < 8.7) {
    headLift = 1 - smoothStep((phase - 7.9) / 0.8);
  }

  const bodyRise = Math.sin((phase / 3.2) * Math.PI * 2) * 0.8;
  const earTwitchDistance = Math.abs(phase - 3) / 0.2;
  const earTwitch = smoothStep(1 - earTwitchDistance);
  const tailFlickDistance = Math.abs(phase - 4.8) / 0.7;
  const tailFlick = smoothStep(1 - tailFlickDistance);
  const tailSwing = Math.sin(phase * 1.35) * 0.45 + tailFlick * 2.4;
  const blinking = phase >= 7.52 && phase < 7.7;

  return {
    bodyRise,
    earTwitch,
    headLift,
    tailSwing,
    eyesOpen: headLift > 0.55 && !blinking,
  };
}

function drawCat(ctx, time) {
  const pose = getLighthouseCatPose(time);
  const catX = OX + 14 * TS + TS / 2;
  const catY = OY + 11 * TS + TS - 8;
  const bodyY = catY - pose.bodyRise * 0.45;
  const headX = catX - 9 - pose.headLift * 0.8;
  const headY = bodyY - 5 - pose.headLift * 4;
  const palette = {
    outline: '#593018',
    furDeep: '#925329',
    fur: '#C47B3E',
    furLight: '#E3AA64',
    cream: '#F1D39A',
    nose: '#D9827B',
    eye: '#315345',
  };

  ctx.save();

  // A grounded shadow follows the body but does not breathe with it.
  ctx.fillStyle = 'rgba(65,36,20,0.22)';
  ctx.beginPath();
  ctx.ellipse(catX + 1, catY + 5, 15, 5, -0.08, 0, Math.PI * 2);
  ctx.fill();

  // Dark outline first gives the curled body a readable pixel-art silhouette.
  ctx.fillStyle = palette.outline;
  ctx.beginPath();
  ctx.ellipse(catX + 1, bodyY, 14, 9, -0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.fur;
  ctx.beginPath();
  ctx.ellipse(
    catX + 1,
    bodyY - 0.5,
    12.5,
    7.5 + pose.bodyRise * 0.28,
    -0.18,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Warm flank patch and tucked paws clarify the sleeping pose.
  ctx.fillStyle = palette.furLight;
  ctx.beginPath();
  ctx.ellipse(catX + 4, bodyY + 1, 7, 5, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.cream;
  ctx.beginPath();
  ctx.ellipse(catX - 4, bodyY + 5, 4, 2, -0.15, 0, Math.PI * 2);
  ctx.ellipse(catX + 1, bodyY + 5.4, 4, 1.8, 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Three tabby marks follow the curve of the back.
  ctx.strokeStyle = palette.furDeep;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (let stripe = 0; stripe < 3; stripe += 1) {
    const stripeX = catX + 1 + stripe * 4;
    ctx.beginPath();
    ctx.moveTo(stripeX, bodyY - 6.2 + stripe * 0.5);
    ctx.quadraticCurveTo(stripeX - 1.2, bodyY - 3.8, stripeX - 2.3, bodyY - 2.6);
    ctx.stroke();
  }

  // Head outline and face rise as one unit during the brief alert beat.
  ctx.fillStyle = palette.outline;
  ctx.beginPath();
  ctx.arc(headX, headY, 6.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.fur;
  ctx.beginPath();
  ctx.arc(headX, headY, 5.8, 0, Math.PI * 2);
  ctx.fill();

  // Pointed ears, with a single restrained twitch on the outer ear.
  const earLift = pose.earTwitch * 2.5;
  ctx.fillStyle = palette.outline;
  ctx.beginPath();
  ctx.moveTo(headX - 5, headY - 3);
  ctx.lineTo(headX - 4, headY - 9 - earLift);
  ctx.lineTo(headX, headY - 5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(headX, headY - 5);
  ctx.lineTo(headX + 4, headY - 8);
  ctx.lineTo(headX + 5, headY - 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.furLight;
  ctx.beginPath();
  ctx.moveTo(headX - 3.9, headY - 4);
  ctx.lineTo(headX - 3.5, headY - 7 - earLift * 0.7);
  ctx.lineTo(headX - 1, headY - 4.7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(headX + 1, headY - 4.7);
  ctx.lineTo(headX + 3.5, headY - 6.7);
  ctx.lineTo(headX + 4, headY - 3);
  ctx.closePath();
  ctx.fill();

  // Eyes switch from soft sleeping strokes to small green alert eyes.
  if (pose.eyesOpen) {
    ctx.fillStyle = palette.eye;
    ctx.fillRect(Math.round(headX - 3.5), Math.round(headY - 1.5), 2, 2);
    ctx.fillRect(Math.round(headX + 1.5), Math.round(headY - 1.5), 2, 2);
    ctx.fillStyle = '#F4E8B5';
    ctx.fillRect(Math.round(headX - 3), Math.round(headY - 1.5), 1, 1);
    ctx.fillRect(Math.round(headX + 2), Math.round(headY - 1.5), 1, 1);
  } else {
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = 1;
    for (const eyeX of [headX - 2.5, headX + 2.5]) {
      ctx.beginPath();
      ctx.moveTo(eyeX - 1.5, headY - 0.5);
      ctx.lineTo(eyeX + 1.5, headY - 0.5);
      ctx.stroke();
    }
  }

  // Cream muzzle, nose and short whiskers stay readable without OS emoji art.
  ctx.fillStyle = palette.cream;
  ctx.beginPath();
  ctx.ellipse(headX, headY + 2.3, 3.2, 2.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.nose;
  ctx.fillRect(Math.round(headX), Math.round(headY + 1), 2, 1);
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 0.8;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(headX + side * 2, headY + 2.5);
    ctx.lineTo(headX + side * 7, headY + 1.5);
    ctx.moveTo(headX + side * 2, headY + 3.2);
    ctx.lineTo(headX + side * 6.5, headY + 4);
    ctx.stroke();
  }

  // The curled tail frames the body; its tip gives one clearly visible flick.
  const tailControlX = catX + 17 + pose.tailSwing;
  const tailTipX = catX + 9 + pose.tailSwing * 0.5;
  const drawTailStroke = (color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(catX + 9, bodyY + 3);
    ctx.quadraticCurveTo(tailControlX, bodyY + 7, catX + 15, bodyY - 1);
    ctx.quadraticCurveTo(catX + 14, bodyY - 5, tailTipX, bodyY - 5.5);
    ctx.stroke();
  };
  drawTailStroke(palette.outline, 5.5);
  drawTailStroke(palette.fur, 3.6);

  // Lighter tail tip and two small rings complete the tabby pattern.
  ctx.strokeStyle = palette.furLight;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(catX + 11, bodyY - 5.2);
  ctx.lineTo(tailTipX, bodyY - 5.5);
  ctx.stroke();

  ctx.lineCap = 'butt';
  ctx.lineWidth = 1;
  ctx.restore();
}

/**
 * Render the ambient reading-nook décor: rug → cat → armchair + lantern → plants.
 * Call AFTER renderLighthouseTiles and BEFORE the player/mentor so props sit
 * correctly in the floor layer.
 */
export function renderAmbientDecor(ctx, time) {
  // 1. Rug first — sits under everything
  drawRug(ctx);

  // 2. Cat — curled on the rug, drawn above rug but below solid props
  drawCat(ctx, time);

  // 3. Armchair (col 15, row 11) — solid prop over the rug
  drawArmchair(ctx);

  // 4. Floor lantern (col 16, row 12) — glowing prop beside the armchair
  drawFloorLantern(ctx, time);

  // 5. Potted plants — frame the top corners of the bottom-right nook
  drawPlant(ctx, 13, 9, time, 0);  // tall herb, top-left of the nook
  drawPlant(ctx, 16, 9, time, 1);  // bushy fern, top-right of the nook
}

/**
 * Lower-left boat workshop. Its drawing and collision consume the same 3×2
 * footprint, while `toCanvas` keeps the published pointer target aligned with
 * the Lighthouse camera without coupling this renderer to the screen.
 */
export function renderLighthouseShipyard(
  ctx,
  state,
  atlas,
  boatTier,
  time,
  toCanvas = (x, y) => ({ x, y }),
) {
  const footprint = LIGHTHOUSE_SHIPYARD_FOOTPRINT;
  const x = OX + footprint.leftCol * TS;
  const y = OY + footprint.topRow * TS;
  const width = footprint.cols * TS;
  const height = footprint.rows * TS;
  const topLeft = toCanvas(x, y);
  const bottomRight = toCanvas(x + width, y + height);

  state.shipyardHitRect = {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Dark timber silhouette and pale three-tile bench face.
  ctx.fillStyle = WORLD_ART.woodDeep;
  ctx.fillRect(x, y + 28, width, 34);
  ctx.fillStyle = '#E9BC72';
  ctx.fillRect(x + 2, y + 31, width - 4, 28);
  ctx.fillStyle = '#F7D797';
  ctx.fillRect(x + 3, y + 32, width - 6, 4);
  ctx.fillStyle = WORLD_ART.woodShadow;
  ctx.fillRect(x + 2, y + 58, width - 4, 1);
  ctx.fillStyle = WORLD_ART.woodDeep;
  ctx.fillRect(x + 7, y + 59, 8, 5);
  ctx.fillRect(x + width - 15, y + 59, 8, 5);

  // Pinned cream blueprint with a deliberately stepped blue boat outline.
  const planX = x + 27;
  const planY = y + 2;
  ctx.fillStyle = WORLD_ART.woodDeep;
  ctx.fillRect(planX - 2, planY - 2, 46, 27);
  ctx.fillStyle = '#FFF2C7';
  ctx.fillRect(planX, planY, 42, 23);
  ctx.fillStyle = BRAND.orange;
  ctx.fillRect(planX + 3, planY + 2, 2, 2);
  ctx.fillRect(planX + 37, planY + 2, 2, 2);
  ctx.strokeStyle = BRAND.blue;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(planX + 9, planY + 16);
  ctx.lineTo(planX + 32, planY + 16);
  ctx.lineTo(planX + 27, planY + 20);
  ctx.lineTo(planX + 13, planY + 20);
  ctx.lineTo(planX + 9, planY + 16);
  ctx.moveTo(planX + 20, planY + 5);
  ctx.lineTo(planX + 20, planY + 16);
  ctx.lineTo(planX + 29, planY + 13);
  ctx.lineTo(planX + 20, planY + 7);
  ctx.stroke();

  // Hammer and wrench on the left side of the lit work surface.
  ctx.fillStyle = '#795548';
  ctx.fillRect(x + 9, y + 40, 3, 14);
  ctx.fillStyle = '#546E7A';
  ctx.fillRect(x + 5, y + 38, 11, 4);
  ctx.strokeStyle = '#78909C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 21, y + 40);
  ctx.lineTo(x + 27, y + 53);
  ctx.moveTo(x + 18, y + 39);
  ctx.lineTo(x + 22, y + 43);
  ctx.moveTo(x + 24, y + 51);
  ctx.lineTo(x + 29, y + 53);
  ctx.stroke();

  // Small PLAYFOOD-green paint tin with an orange label.
  ctx.fillStyle = WORLD_ART.woodDeep;
  ctx.fillRect(x + width - 18, y + 42, 12, 14);
  ctx.fillStyle = BRAND.green;
  ctx.fillRect(x + width - 16, y + 44, 8, 10);
  ctx.fillStyle = BRAND.orange;
  ctx.fillRect(x + width - 16, y + 48, 8, 3);
  ctx.strokeStyle = '#90A4AE';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + width - 17, y + 40, 10, 6);

  // This is the same selected-tier sprite later used on the World Map.
  const modelSprite = getBoatSpritesForTier(atlas, boatTier)?.[DIR.DOWN]?.[0];
  if (modelSprite) {
    ctx.drawImage(modelSprite, x + Math.floor((width - TS) / 2), y + 27, TS, TS);
  }

  // Two restrained pixel frames make the new model glint after a purchase.
  if (Number(state.shipyardSparkleUntil) > time) {
    const sparkleFrame = Math.floor(time * 8) % 2;
    const sparklePoints = sparkleFrame === 0
      ? [[33, 31], [64, 40], [78, 27]]
      : [[27, 43], [58, 28], [72, 46]];
    ctx.fillStyle = BRAND.yellowSoft;
    for (const [sx, sy] of sparklePoints) {
      ctx.fillRect(x + sx - 2, y + sy, 5, 1);
      ctx.fillRect(x + sx, y + sy - 2, 1, 5);
    }
  }

  ctx.restore();
  // The next canvas consumer must keep the shared sprite crisp too.
  ctx.imageSmoothingEnabled = false;

  const transform = ctx.getTransform?.();
  const hidpi = ctx.canvas?.__hidpi;
  if (transform) {
    const corners = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height],
    ].map(([px, py]) => {
      const bufferX = transform.a * px + transform.c * py + transform.e;
      const bufferY = transform.b * px + transform.d * py + transform.f;
      return {
        x: (bufferX - (hidpi?.ox || 0)) / (hidpi?.k || 1),
        y: (bufferY - (hidpi?.oy || 0)) / (hidpi?.k || 1),
      };
    });
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    state.shipyardVisualRect = {
      x: left,
      y: top,
      width: Math.max(...xs) - left,
      height: Math.max(...ys) - top,
    };
  } else {
    state.shipyardVisualRect = { x, y, width, height };
  }
}

/**
 * Render every achievement station from a pure trophy snapshot.
 * trophy = buildTrophyState(storeSnapshot). Safe to call with a partial/empty
 * trophy (every field defaults), so the room renders before data hydrates.
 * shelves = buildBookshelf(completedMissions) — passed via state.shelves.
 */
export function renderLighthouseStations(ctx, trophy, time, strings, shelves) {
  if (!trophy) return;

  // Top-wall metric plaques — stars (left) + points (right). No centre lamp:
  // the top-centre wall is intentionally bare (PM directive 2026-06-24).
  renderTopPlaques(ctx, trophy, time);

  // Ambient décor — rug → cat → armchair + lantern → plants.
  // Drawn after the lamp glow (background) but before the bookshelf so the
  // bookcase visually sits in front of the rug edge as expected.
  renderAmbientDecor(ctx, time);

  // Left-wall bookshelf — sources collectible (shelves may be undefined on first frame)
  renderBookshelf(ctx, shelves || null, time);

  // Central compass anchor (fills the room centre, aims at the next island)
  renderCompass(ctx, LIGHTHOUSE_STATIONS.compass, trophy, time);

  const plinthLabelLayouts = getLighthousePlinthLabelLayouts();
  for (const [index, plinth] of LIGHTHOUSE_STATIONS.plinths.entries()) {
    renderPlinth(
      ctx,
      plinth,
      trophy.islands?.[plinth.island],
      time,
      strings,
      plinthLabelLayouts[index],
    );
  }

  renderPostbox(ctx, LIGHTHOUSE_STATIONS.qr);
  // Hero portrait removed (PM directive 2026-06-23) — the right wall is left clean.
}

// ─── Compass speech-bubble ───────────────────────────────
// Proximity-triggered: appears when state.nearCompass is true. Drawn AFTER the
// stations so it sits on top. Pure canvas, no DOM. Tail points down at the
// compass rose (below the bubble body). Auto-hidden when nearCompass is false.
//
// Receives strings.compassBubble = { line1, line2? } (pre-translated in the
// component where t() is available). line2 is absent for the all-done case.

export function renderCompassBubble(ctx, state, strings) {
  if (!state.nearCompass) return;

  const bubble = strings?.compassBubble;
  if (!bubble) return;

  const { col, row } = LIGHTHOUSE_STATIONS.compass;
  const { cy } = stationCenter(col, row); // screen centre of the compass tile
  // Bubble centres on the same axis as the drawn compass disc (true canvas centre).
  const cx = CANVAS_W / 2;

  // Layout constants
  const LINE1_SIZE = 14;
  const LINE2_SIZE = 11;
  const PAD_X = 18;
  const PAD_Y = 12;
  const LINE_GAP = 6;
  const TAIL_H = 10;  // downward tail pointing at the compass
  const RADIUS = 6;   // square-ish corners for the retro RPG feel

  // Measure the FULL lines so the box is stable while the text types in.
  ctx.font = `bold ${LINE1_SIZE}px 'Fredoka', 'Inter', system-ui, sans-serif`;
  const line1W = ctx.measureText(bubble.line1).width;

  let line2W = 0;
  if (bubble.line2) {
    ctx.font = `${LINE2_SIZE}px 'Fredoka', 'Inter', system-ui, sans-serif`;
    line2W = ctx.measureText(bubble.line2).width;
  }

  const contentW = Math.max(line1W, line2W);
  const contentH = LINE1_SIZE + (bubble.line2 ? LINE_GAP + LINE2_SIZE : 0);

  const bw = contentW + PAD_X * 2;
  const bh = contentH + PAD_Y * 2;

  // Centre the bubble horizontally over the compass; place it above with a gap
  const bx = cx - bw / 2;
  const compassTopY = cy - TS / 2;
  const by = Math.max(4, compassTopY - bh - TAIL_H - 12); // clamp to canvas top

  // Drop shadow
  ctx.save();
  ctx.globalAlpha = 0.20;
  drawRoundedRect(ctx, bx + 3, by + 5, bw, bh, RADIUS, '#000', null);
  ctx.restore();

  // Downward tail (dark, matches the retro frame) — drawn before the box so the
  // box's bottom border cleanly caps its top edge.
  const tailTopY = by + bh;
  const tailTipY = tailTopY + TAIL_H;
  ctx.fillStyle = '#10141F';
  ctx.beginPath();
  ctx.moveTo(cx - 9, tailTopY - 2);
  ctx.lineTo(cx + 9, tailTopY - 2);
  ctx.lineTo(cx, tailTipY);
  ctx.closePath();
  ctx.fill();

  // Retro RPG bubble box (thick dark frame → parchment fill → light keyline)
  drawRetroBox(ctx, bx, by, bw, bh, { radius: RADIUS });

  // Typewriter reveal across line1 (+ line2), left → right.
  const elapsed = typewriterElapsed(state.compassOpenedAt, state.time);
  const src = bubble.line2 ? [bubble.line1, bubble.line2] : [bubble.line1];
  const { lines: shown } = typewriterLines(src, elapsed, TYPEWRITER_CPS);

  const textX = bx + PAD_X;
  const textStartY = by + PAD_Y + LINE1_SIZE / 2;
  drawText(ctx, shown[0] || '', textX, textStartY, {
    font: `bold ${LINE1_SIZE}px 'Fredoka', 'Inter', system-ui, sans-serif`,
    color: '#1B3A6B',
    align: 'left',
    baseline: 'middle',
  });

  if (bubble.line2) {
    const line2Y = textStartY + LINE1_SIZE / 2 + LINE_GAP + LINE2_SIZE / 2;
    drawText(ctx, shown[1] || '', textX, line2Y, {
      font: `${LINE2_SIZE}px 'Fredoka', 'Inter', system-ui, sans-serif`,
      color: '#4A5B7A',
      align: 'left',
      baseline: 'middle',
    });
  }
}

// ─── Player ──────────────────────────────────────────────
// Same draw approach as renderRoomPlayer: walk-frame + bounce, atlas sprite.

export function renderLighthousePlayer(ctx, state, atlas) {
  const p = state.player;
  const px = OX + p.pixelX;
  const py = OY + p.pixelY;

  if (DRAFT_MODE) {
    const cx = px + TS / 2;
    const cy = py + TS / 2;
    ctx.fillStyle = '#42A5F5';
    ctx.fillRect(cx - 8, cy - 2, 16, 18);
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 7, 0, Math.PI * 2);
    ctx.fill();
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
  if (sprite) ctx.drawImage(sprite, Math.round(px), Math.round(py + bounceY));
}

// ─── Keeper mentor ───────────────────────────────────────
// The Keeper — role-based mentor (like «Η Σεφ»), dedicated nautical sprite + name pill.
// Sprites are prebuilt once in LighthouseRoom setup (state.mentorSprites).

function rectanglesOverlap(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function getKeeperOverlayLayout({
  cx,
  dy,
  spriteTopY,
  nameWidth,
  nameHeight = 14,
  playerRect,
  inviteVisible,
  dialogOpen,
}) {
  const spriteTop = Math.round(spriteTopY);
  const name = {
    x: cx - nameWidth / 2,
    y: dy + TS + 2,
    width: nameWidth,
    height: nameHeight,
  };
  const invite = {
    body: { x: cx - 9, y: spriteTop - 19, width: 18, height: 12 },
    tailTip: { x: cx, y: spriteTop - 3 },
  };

  return {
    invite,
    name,
    showInvite: Boolean(inviteVisible && !dialogOpen),
    showName: Boolean(!inviteVisible && !dialogOpen && !rectanglesOverlap(name, playerRect)),
  };
}

function drawKeeperInviteBubble(ctx, invite) {
  const { body, tailTip } = invite;
  const x = Math.round(body.x);
  const y = Math.round(body.y);
  const tailX = Math.round(tailTip.x);
  const tailY = Math.round(tailTip.y);

  // Crisp, canvas-native pixel bubble. Unlike an OS emoji, this has identical
  // metrics on every school computer and remains anchored to the Keeper's bob.
  ctx.fillStyle = '#263C46';
  ctx.fillRect(x - 1, y - 1, body.width + 2, body.height + 2);
  ctx.beginPath();
  ctx.moveTo(tailX - 4, y + body.height);
  ctx.lineTo(tailX + 4, y + body.height);
  ctx.lineTo(tailX, tailY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFF8E1';
  ctx.fillRect(x + 1, y + 1, body.width - 2, body.height - 2);
  ctx.beginPath();
  ctx.moveTo(tailX - 2, y + body.height - 1);
  ctx.lineTo(tailX + 2, y + body.height - 1);
  ctx.lineTo(tailX, tailY - 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#2F5B57';
  for (const dotX of [x + 4, x + 8, x + 12]) {
    ctx.fillRect(dotX, y + 5, 2, 2);
  }
}

export function renderLighthouseMentor(ctx, state, time) {
  const dx = OX + LIGHTHOUSE_MENTOR.col * TS;
  const dy = OY + LIGHTHOUSE_MENTOR.row * TS;
  const cx = dx + TS / 2;
  const name = state.strings?.keeperName || '';

  if (DRAFT_MODE) {
    ctx.fillStyle = LIGHTHOUSE_MENTOR.color;
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

  const bob = Math.sin(time * 2.2) * 1.2;
  const frame = Math.floor(time / 0.5) % 2;
  const sprite = state.mentorSprites?.[frame];
  if (sprite) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, Math.round(dx - 2), Math.round(dy - 4 + bob), TS + 4, TS + 4);
    ctx.restore();
  }

  // The name pill grows on a phone so «Ο Φαροφύλακας» reads at ≥ 11 CSS px.
  const nameUnit = readableUnit(transformCssScale(ctx), 9, 11);
  const nameFont = `bold ${9 * nameUnit}px sans-serif`;
  ctx.font = nameFont;
  const nameWidth = name ? ctx.measureText(name).width + 12 * nameUnit : 0;
  const playerRect = state.player ? {
    x: OX + state.player.pixelX,
    y: OY + state.player.pixelY,
    width: TS,
    height: TS,
  } : null;
  const overlay = getKeeperOverlayLayout({
    cx,
    dy,
    spriteTopY: dy - 4 + bob,
    nameWidth,
    nameHeight: 14 * nameUnit,
    playerRect,
    inviteVisible: state.nearKeeper,
    dialogOpen: Boolean(state.keeperDialog),
  });

  // Name pill below — the Keeper is the named character of the hall
  if (name && overlay.showName) {
    drawRoundedRect(ctx, overlay.name.x, overlay.name.y, overlay.name.width, overlay.name.height, 7, 'rgba(255,255,255,0.9)', '#8D6E63');
    drawText(ctx, name, cx, overlay.name.y + overlay.name.height / 2, {
      font: nameFont, color: WORLD_ART.panelBrown, align: 'center', baseline: 'middle',
    });
  }

  // Speech invite while the player faces the Keeper
  if (overlay.showInvite) {
    drawKeeperInviteBubble(ctx, overlay.invite);
  }
}

// ─── Prompts ─────────────────────────────────────────────
// Bottom-centre pills, identical chrome to the island prompts. Only one shows
// at a time: the Keeper talk invite takes priority, then the exit prompt.

function drawBottomPrompt(ctx, time, text, icon, accent) {
  ctx.font = "bold 15px 'Inter', system-ui, sans-serif";
  const promptW = Math.max(ctx.measureText(text).width + 60, 260);
  const promptH = 46;
  const px = CANVAS_W / 2 - promptW / 2;
  const py = CANVAS_H - 75;

  ctx.globalAlpha = 0.9 + Math.sin(time * 3) * 0.1;
  drawRoundedRect(ctx, px + 2, py + 3, promptW, promptH, 16, 'rgba(0,0,0,0.15)', 'transparent');
  drawRoundedRect(ctx, px, py, promptW, promptH, 16, 'rgba(255,255,255,0.95)', accent);
  drawText(ctx, (icon ? icon + ' ' : '') + text, CANVAS_W / 2, py + promptH / 2 - 2, {
    font: "bold 14px 'Inter', system-ui, sans-serif",
    color: BRAND.purple, align: 'center', baseline: 'middle',
  });
  ctx.globalAlpha = 1;
}

// Canvas-native "Back" pill (top-left). The room's only chrome — the same warm
// WORLD_ART wooden plaque as the Overworld Exit button (dark woodDeep frame →
// woodMid board → cream carved label), so it reads as part of the world, not a
// DOM overlay. Brightens on hover and publishes its rect on `state.backButtonRect`
// for the screen to hit-test clicks/taps. Returns the pill's right edge.
const BACK_BTN = { x: 12, y: 8, h: 26 };
export function renderLighthouseBackButton(ctx, state, label) {
  const u = readableHudUnit(ctx);
  if (u !== 1) {
    ctx.save();
    ctx.scale(u, u);
  }
  const font = "bold 13px 'Inter', system-ui, sans-serif";
  ctx.font = font;
  const w = Math.max(ctx.measureText(label).width + 28, 64);
  const { x, y, h } = BACK_BTN;
  const midY = y + h / 2;
  const hover = !!state.backButtonHover;

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
  drawText(ctx, label, x + w / 2, midY + 1, {
    font, color: 'rgba(40,24,12,0.45)', align: 'center', baseline: 'middle',
  });
  drawText(ctx, label, x + w / 2, midY, {
    font, color: WORLD_ART.panelCream, align: 'center', baseline: 'middle',
  });

  if (u !== 1) ctx.restore();
  state.backButtonRect = scaleRectBy({ x, y, width: w, height: h }, u);
  return (x + w) * u;
}

export function getLighthousePromptKind(state = {}) {
  if (state.bookOpen) return null;
  if (state.nearKeeper && !state.keeperDialog) return 'keeper';
  if (state.nearBookshelf) return 'bookshelf';
  if (state.nearShipyard) return 'shipyard';
  if (state.nearQR) return 'qr';
  if (state.onExit) return 'exit';
  return null;
}

export function renderLighthousePrompt(ctx, state) {
  const promptKind = getLighthousePromptKind(state);

  // Keeper talk invite — wins when facing the Keeper
  if (promptKind === 'keeper') {
    const text = state.strings?.keeperPrompt || 'Talk to the Keeper';
    drawBottomPrompt(ctx, state.time, text, '💬', LIGHTHOUSE_MENTOR.color);
    return;
  }
  // Bookshelf invite — when facing the bookshelf
  if (promptKind === 'bookshelf') {
    const text = state.strings?.bookshelfPrompt || 'Press Enter or Space to read the books';
    drawBottomPrompt(ctx, state.time, text, '📚', ISLAND_COLORS.growing);
    return;
  }
  // Shipyard invite — between the library and the postbox in prompt priority.
  if (promptKind === 'shipyard') {
    const text = state.strings?.shipyardPrompt || 'Open the Shipyard';
    drawBottomPrompt(ctx, state.time, text, '⛵', BRAND.orange);
    return;
  }
  // Activity codes remain available after completing the digital missions.
  if (promptKind === 'qr') {
    const text = state.strings?.qrPrompt || 'Press Enter or Space to enter your activity code.';
    drawBottomPrompt(ctx, state.time, text, '📮', BRAND.green);
    return;
  }
  // Exit prompt — standing on the mat
  if (promptKind === 'exit') {
    const text = state.strings?.exitPrompt || '⏎ Back to the ocean';
    drawBottomPrompt(ctx, state.time, text, '▼', 'rgba(83,63,139,0.6)');
  }
}

// ─── Keeper dialog ───────────────────────────────────────
// Modal speech card — same chrome as renderMentorDialog. Welcome line for now;
// a progress summary lands in a later phase.

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

export function renderLighthouseDialog(ctx, state) {
  if (!state.keeperDialog) return;
  const name = state.strings?.keeperName || '';
  const contText = state.strings?.dialogContinue || 'Continue';

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const panelW = 680;
  ctx.font = "17px 'Fredoka', 'Inter', system-ui, sans-serif";
  const lines = wrapLines(ctx, state.keeperDialog.text, panelW - 76);
  const lineH = 26;
  const panelH = 92 + lines.length * lineH + 60;
  const px = CANVAS_W / 2 - panelW / 2;
  const py = CANVAS_H / 2 - panelH / 2;

  // Retro RPG dialogue box (drop shadow → multi-layered border + parchment fill)
  drawRoundedRect(ctx, px + 4, py + 6, panelW, panelH, 8, 'rgba(0,0,0,0.30)', null);
  drawRetroBox(ctx, px, py, panelW, panelH, { radius: 8 });

  // Portrait + name header. Reuse the exact pixel sprite so the character the
  // child meets in the room is the one who speaks in the dialogue.
  const portraitSprite = state.mentorSprites?.[0];
  drawRoundedRect(ctx, px + 24, py + 18, 54, 54, 9, '#D7F0EC', '#2F6E72');
  if (portraitSprite) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(portraitSprite, px + 29, py + 17, 46, 46);
    ctx.restore();
  } else {
    drawText(ctx, '⚓', px + 51, py + 45, {
      font: '30px sans-serif', color: '#294B63', align: 'center', baseline: 'middle',
    });
  }
  drawText(ctx, name, px + 94, py + 44, {
    font: "bold 20px 'Fredoka', 'Inter', system-ui, sans-serif",
    color: WORLD_ART.panelBrown, align: 'left', baseline: 'middle',
  });

  // Body — typewriter reveal (char-by-char, left→right across the wrapped lines).
  const elapsed = typewriterElapsed(state.keeperDialog.openedAt, state.time);
  const { lines: shown, done } = typewriterLines(lines, elapsed, TYPEWRITER_CPS);
  let ty = py + 92;
  for (const line of shown) {
    drawText(ctx, line, px + 38, ty, {
      font: "17px 'Fredoka', 'Inter', system-ui, sans-serif",
      color: WORLD_ART.panelBrownDeep, align: 'left', baseline: 'middle',
    });
    ty += lineH;
  }

  // Continue affordance — only once the text has fully typed out. The classic
  // RPG "press to continue" cue: a solid pill plus a blinking ▼ chevron.
  if (done) {
    ctx.font = "bold 14px 'Fredoka', 'Inter', system-ui, sans-serif";
    const btnText = '⏎ ' + contText;
    const btnW = ctx.measureText(btnText).width + 40;
    const btnH = 34;
    const bx = px + panelW - btnW - 24;
    const by = py + panelH - btnH - 16;
    drawRoundedRect(ctx, bx + 1, by + 3, btnW, btnH, 17, 'rgba(0,0,0,0.2)', null);
    drawRoundedRect(ctx, bx, by, btnW, btnH, 17, '#26A69A', '#00796B');
    drawText(ctx, btnText, bx + btnW / 2, by + btnH / 2 - 1, {
      font: "bold 14px 'Fredoka', 'Inter', system-ui, sans-serif",
      color: '#fff', align: 'center', baseline: 'middle',
    });
    if (Math.sin((state.time || 0) * 6) > 0) {
      drawText(ctx, '▼', bx - 14, by + btnH / 2 - 1, {
        font: "bold 14px 'Fredoka', 'Inter', system-ui, sans-serif",
        color: '#00796B', align: 'center', baseline: 'middle',
      });
    }
  }
}

// ─── Open-book panel ────────────────────────────────────────────────────────
// In-canvas modal shown when state.bookOpen is set (a spine object + island).
// Mirrors renderLighthouseDialog in chrome but shows: hook line, verbatim title
// + publisher, and a «Press S» call-to-action. Purely canvas — no DOM card.
//
// Receives state.bookOpen = { id, title, publisher, url, island, unlocked, pending }
// and state.strings.bookPanel = { hook, pressS, none, noSpines, spineIndex, spineTotal }

export function renderBookPanel(ctx, state, strings) {
  if (!state.bookOpen) return;

  const spine = state.bookOpen;
  const noSpines = !spine.id; // sentinel: no unlocked spines yet

  // Dim backdrop
  ctx.fillStyle = 'rgba(0,0,0,0.50)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const panelW = 660;
  const panelH = noSpines ? 160 : 200;
  const px = CANVAS_W / 2 - panelW / 2;
  const py = CANVAS_H / 2 - panelH / 2;
  const RADIUS = 18;

  // Panel shadow
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#000';
  drawRoundedRect(ctx, px + 4, py + 6, panelW, panelH, RADIUS, '#000', 'transparent');
  ctx.restore();

  // Panel body — warm cream, matching keeperDialog chrome
  drawRoundedRect(ctx, px, py, panelW, panelH, RADIUS, WORLD_ART.panelCream, '#8D6E63');

  if (noSpines) {
    // Empty state: encourage the player to complete a game first
    const noneText = strings?.bookPanel?.none || 'Finish a game to unlock your first book!';
    ctx.font = "22px sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📚', px + 44, py + panelH / 2);
    drawText(ctx, noneText, px + panelW / 2 + 16, py + panelH / 2, {
      font: "bold 16px 'Inter', system-ui, sans-serif",
      color: WORLD_ART.panelBrownDeep,
      align: 'center',
      baseline: 'middle',
    });
    // Close hint
    const closeHint = strings?.bookPanel?.close || '⏎ / Esc to close';
    drawText(ctx, closeHint, px + panelW / 2, py + panelH - 20, {
      font: "12px 'Inter', system-ui, sans-serif",
      color: '#9E7D5A',
      align: 'center',
      baseline: 'middle',
    });
    return;
  }

  const tint = ISLAND_COLORS[spine.island] || '#888';

  // Open-book icon + island colour stripe on the left
  const STRIPE_W = 56;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(px, py + RADIUS);
  ctx.arcTo(px, py, px + RADIUS, py, RADIUS);
  ctx.lineTo(px + STRIPE_W, py);
  ctx.lineTo(px + STRIPE_W, py + panelH);
  ctx.lineTo(px, py + panelH);
  ctx.arcTo(px, py + panelH, px + RADIUS, py + panelH, RADIUS);
  ctx.closePath();
  ctx.fillStyle = tint;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.restore();

  // Book emoji centred in the stripe
  ctx.font = '26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('📖', px + STRIPE_W / 2, py + panelH / 2);

  // Pending badge if applicable
  if (spine.pending) {
    const label = '! ' + (strings?.bookPanel?.pending || 'pending');
    const font = "bold 9px 'Inter', system-ui, sans-serif";
    ctx.font = font;
    const badgeWidth = Math.max(54, Math.ceil(ctx.measureText(label).width + 5));
    const badgeX = px + STRIPE_W + 8;
    drawRoundedRect(ctx, badgeX, py + 8, badgeWidth, 16, 8, '#FFEB3B', '#F9A825');
    drawText(ctx, label, badgeX + badgeWidth / 2, py + 16, {
      font,
      color: '#5D4037',
      align: 'center',
      baseline: 'middle',
    });
  }

  const textX = px + STRIPE_W + 18;
  const textW = panelW - STRIPE_W - 36;

  // Hook line — generic kid-facing intro
  const hookText = strings?.bookPanel?.hook || 'A real source behind what you learned';
  drawText(ctx, hookText, textX, py + 36, {
    font: "bold 15px 'Inter', system-ui, sans-serif",
    color: WORLD_ART.panelBrownDeep,
    align: 'left',
    baseline: 'middle',
  });

  // Divider
  ctx.strokeStyle = 'rgba(141,110,99,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(textX, py + 52);
  ctx.lineTo(px + panelW - 18, py + 52);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Verbatim title (may be long — wrap in 2 lines max)
  ctx.font = `bold 14px 'Inter', system-ui, sans-serif`;
  const titleLines = wrapLines(ctx, spine.title, textW);
  let ty = py + 70;
  for (const line of titleLines.slice(0, 2)) {
    drawText(ctx, line, textX, ty, {
      font: "bold 14px 'Inter', system-ui, sans-serif",
      color: WORLD_ART.panelBrownDeep,
      align: 'left',
      baseline: 'middle',
    });
    ty += 20;
  }

  // Verbatim publisher (smaller, muted)
  drawText(ctx, spine.publisher, textX, ty + 4, {
    font: "13px 'Inter', system-ui, sans-serif",
    color: '#9E7D5A',
    align: 'left',
    baseline: 'middle',
  });

  // Press S → real page
  const pressSText = strings?.bookPanel?.pressS || 'Press S → the real page';
  ctx.font = "bold 13px 'Inter', system-ui, sans-serif";
  const btnW = ctx.measureText(pressSText).width + 32;
  const btnH = 28;
  const btnX = px + panelW - btnW - 16;
  const btnY = py + panelH - btnH - 12;
  drawRoundedRect(ctx, btnX + 1, btnY + 2, btnW, btnH, 14, 'rgba(0,0,0,0.15)', 'transparent');
  drawRoundedRect(ctx, btnX, btnY, btnW, btnH, 14, tint, '#2A1A0E');
  drawText(ctx, pressSText, btnX + btnW / 2, btnY + btnH / 2 - 1, {
    font: "bold 12px 'Inter', system-ui, sans-serif",
    color: '#fff',
    align: 'center',
    baseline: 'middle',
  });

  // Spine index / total (bottom-left)
  const indexText = strings?.bookPanel?.spineIndex || '';
  if (indexText) {
    drawText(ctx, indexText, textX, py + panelH - 18, {
      font: "11px 'Inter', system-ui, sans-serif",
      color: '#B0907A',
      align: 'left',
      baseline: 'middle',
    });
  }

  // Left/Right arrow hints
  const arrowHint = strings?.bookPanel?.arrowHint || '◀ ▶ browse';
  drawText(ctx, arrowHint, px + panelW / 2, py + panelH - 18, {
    font: "11px 'Inter', system-ui, sans-serif",
    color: '#B0907A',
    align: 'center',
    baseline: 'middle',
  });
}

// ─── Gold ceremony overlay ───────────────────────────────
// One-time per-island celebration rendered on top of everything else while
// state.ceremony is active. Draws:
//   - popReveal burst centred on the current island's plinth
//   - lamp pulse (brighter radial glow from the top-centre lamp)
//   - a full-room soft light sweep (warm golden tint, fades quickly)
//   - keeper cheer banner (strings.goldCheer) at the top of the canvas
//
// state.ceremony = { queue: string[], idx: number, t: number } where t ∈ [0,1]
// is the progress of the current beat. The caller (LighthouseRoom) advances t
// in the update loop and pops queue items when they complete.

export function renderGoldCeremony(ctx, state, strings, toCanvas = (x, y) => ({ x, y })) {
  const cer = state.ceremony;
  if (!cer || cer.queue.length === 0) return;

  const slug = cer.queue[cer.idx] || cer.queue[0];
  const t = Math.max(0, Math.min(1, cer.t));

  // Locate the plinth for this island
  const plinth = LIGHTHOUSE_STATIONS.plinths.find((p) => p.island === slug);
  if (!plinth) return;

  const worldPlinth = getLighthousePlinthVisualCenter(plinth.island);
  // The trophy offset is part of the world anchor. Map it once, then keep all
  // burst/sweep radii in screen pixels after the camera has been restored.
  const { x: cx, y: burstY } = toCanvas(worldPlinth.cx, worldPlinth.cy - TS * 0.3);

  // 1. Full-room golden light sweep (fast in, slow out — peak at t≈0.2)
  const sweepAlpha = t < 0.2 ? t / 0.2 : Math.max(0, 1 - (t - 0.2) / 0.6);
  if (sweepAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = sweepAlpha * 0.22;
    const sweep = ctx.createRadialGradient(cx, burstY, 20, CANVAS_W / 2, OY, 400);
    sweep.addColorStop(0, '#FFE080');
    sweep.addColorStop(1, 'rgba(255,220,80,0)');
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  }

  // 2. popReveal burst on the plinth
  popReveal(ctx, cx, burstY, t);

  // 3. Lamp pulse — an extra bright glow from the lamp tile during the ceremony
  const lampSt = LIGHTHOUSE_STATIONS.lamp;
  const worldLamp = stationCenter(lampSt.col, lampSt.row);
  const { x: lampX, y: lampY } = toCanvas(worldLamp.cx, worldLamp.cy);
  const lampAlpha = t < 0.5 ? t / 0.5 : Math.max(0, 1 - (t - 0.5) / 0.5);
  if (lampAlpha > 0) {
    ctx.save();
    const lampPulse = ctx.createRadialGradient(lampX, lampY, 4, lampX, lampY, 120 + lampAlpha * 80);
    lampPulse.addColorStop(0, `rgba(255,230,80,${0.6 * lampAlpha})`);
    lampPulse.addColorStop(1, 'rgba(255,230,80,0)');
    ctx.fillStyle = lampPulse;
    ctx.beginPath();
    ctx.arc(lampX, lampY, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4. Keeper cheer banner — slide in from top, pause, slide out
  const bannerT = t < 0.15 ? t / 0.15        // slide in  (0→1 in first 15%)
               : t < 0.75 ? 1               // hold
               :             1 - (t - 0.75) / 0.25; // slide out (last 25%)
  if (bannerT > 0) {
    const cheerText = strings?.goldCheer || '🏆 Island complete!';
    ctx.font = "bold 18px 'Inter', system-ui, sans-serif";
    const tw = ctx.measureText(cheerText).width;
    const bw = tw + 48;
    const bh = 44;
    const bx = CANVAS_W / 2 - bw / 2;
    const slideOff = (1 - bannerT) * (bh + 16); // slides up off-screen when bannerT→0
    const by = OY + 10 - slideOff;

    ctx.save();
    ctx.globalAlpha = bannerT;
    // Shadow
    ctx.globalAlpha = bannerT * 0.2;
    ctx.fillStyle = '#000';
    drawRoundedRect(ctx, bx + 3, by + 5, bw, bh, 14, '#000', 'transparent');
    // Banner body — deep blue with gold border
    ctx.globalAlpha = bannerT;
    drawRoundedRect(ctx, bx, by, bw, bh, 14, '#1A2A4A', '#FFD54F');
    // Trophy emoji left
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = bannerT;
    ctx.fillText('🏆', bx + 12, by + bh / 2 + 1);
    // Cheer text
    drawText(ctx, cheerText, CANVAS_W / 2 + 10, by + bh / 2 - 1, {
      font: "bold 16px 'Inter', system-ui, sans-serif",
      color: '#FFE680',
      align: 'center',
      baseline: 'middle',
    });
    ctx.restore();
  }
}

// Centering offsets, exported for the iris wipe in the screen component.
export { OX, OY };
