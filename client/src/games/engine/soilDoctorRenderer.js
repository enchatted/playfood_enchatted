// soilDoctorRenderer.js — visuals unique to G1.3 Soil Doctor.
// Reuses gameRoomRenderer for background/tiles/player/heldItem/particles and
// whereDoesItGrowRenderer.renderRevealCard for the "Did you know?" card.

import { OX, OY } from './gameRoomRenderer.js';
import { TILE_SIZE as TS } from './gameRoomLogic.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { drawRoundedRect, drawText } from '../../utils/canvas.js';
import { WORLD_ART } from '../../styles/brandColors.js';
import { canvasCssScale, readableUnit } from '../../utils/hidpi.js';

function tilesBounds(tiles) {
  let minCol = Infinity, minRow = Infinity, maxCol = -Infinity, maxRow = -Infinity;
  for (const t of tiles) {
    if (t.col < minCol) minCol = t.col;
    if (t.col > maxCol) maxCol = t.col;
    if (t.row < minRow) minRow = t.row;
    if (t.row > maxRow) maxRow = t.row;
  }
  return { minCol, minRow, maxCol, maxRow };
}

function rectFor(tiles, pad = 8, shakeX = 0) {
  const b = tilesBounds(tiles);
  return {
    x: OX + b.minCol * TS - pad + shakeX,
    y: OY + b.minRow * TS - pad,
    w: (b.maxCol - b.minCol + 1) * TS + pad * 2,
    h: (b.maxRow - b.minRow + 1) * TS + pad * 2,
  };
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function healthColor(health) {
  if (health > 60) return '#4CAF50';
  if (health > 30) return '#FBC02D';
  return '#EF5350';
}

// ─── Ailing plots ────────────────────────────────────────
// Every bed is brown SOIL (like GardenPlanner's plots) — state is read from the
// plant on top + a translucent tint, so a healed/lush bed never vanishes into the
// grass (the bug was a fully-green bed on green grass).
const SOIL_BED = '#5D4037';
const PLOT_THEME = {
  healed:   { tint: 'rgba(102,187,106,0.40)', border: '#2e7d32' },
  poisoned: { tint: 'rgba(123,80,140,0.45)',  border: '#6a1b9a' },
  sick:     { tint: null,                     border: '#4e342e' },
  masked:   { tint: 'rgba(110,231,98,0.55)', border: '#43a047' }, // TOO lush — suspiciously perfect green (C1)
};

// A masked plot looks healthy/lush until the player actually diagnoses it — the
// "adverse impacts masked by fertilizers/irrigation" lesson (SOIL_REVEALS.masked).
function isMaskedLush(p) {
  return p.masked && !p.diagnosed && !p.healed && !p.poisoned;
}
function plotStatus(p) {
  if (p.healed) return 'healed';
  if (p.poisoned) return 'poisoned';
  if (isMaskedLush(p)) return 'masked';
  return 'sick';
}
function plotEmoji(p) {
  if (p.healed) return '🌱';
  if (p.poisoned) return '☠️';
  if (isMaskedLush(p)) return '🌿'; // deceptively healthy-looking
  return '🥀';
}
// Small per-plot symptom glyph so the four sick plots are tellable at a glance
// (shown only once a plot reads as 'sick' — keeps the masked plot's disguise).
// eroding = wind carrying soil away (💧 read as "needs watering" — wrong model).
const SYMPTOM_ICON = { eroding: '🌬️', spent: '🍽️', compacted: '🪨', lifeless: '🎭' };

// ─── Organic bed shape ───────────────────────────────────
// An irregular soil mound (deterministic per-plot jitter) so beds read as DUG
// EARTH, not as the same rounded UI panel the stations/cards use (C1: entity
// TYPES must differ in silhouette, not just color).
function traceBedBlob(ctx, r, seed, inset = 0) {
  const x = r.x + inset, y = r.y + inset;
  const w = r.w - inset * 2, h = r.h - inset * 2;
  const cx = x + w / 2, cy = y + h / 2;
  const N = 10; // perimeter points
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    // deterministic bump per vertex — same every frame, different per plot
    const bump = 1 + (Math.sin(seed * 3.7 + i * 2.3) * 0.09);
    const px = cx + Math.cos(a) * (w / 2) * bump;
    const py = cy + Math.sin(a) * (h / 2) * bump;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ─── Per-ailment surface art (the bed ITSELF shows the symptom) ──
function drawCracksAndDust(ctx, r, t, seed) {
  // Cracked, crumbling surface… (cracks live in the bottom band + right third,
  // clear of the 24px centre emoji and the top-left symptom badge)
  ctx.save();
  ctx.strokeStyle = 'rgba(38,24,16,0.7)';
  ctx.lineWidth = 1.5;
  const crackSpots = [
    { x: r.x + 10 + ((seed * 31) % 14), y: r.y + r.h - 20 },           // bottom-left
    { x: r.x + r.w * 0.45 + ((seed * 17) % 10), y: r.y + r.h - 16 },   // bottom-centre
    { x: r.x + r.w - 26, y: r.y + 8 + ((seed * 13) % 10) },            // top-right
    { x: r.x + r.w - 22, y: r.y + r.h - 22 },                          // bottom-right
  ];
  for (const c of crackSpots) {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + 8, c.y + 6);
    ctx.lineTo(c.x + 5, c.y + 13);
    ctx.stroke();
  }
  ctx.restore();
  // …with dust drifting off to the right (soil literally leaving the bed).
  ctx.fillStyle = 'rgba(188,152,118,0.8)';
  for (let i = 0; i < 3; i++) {
    const phase = (t * 0.5 + i * 0.33) % 1;
    const dx = r.x + r.w * 0.5 + phase * (r.w * 0.75);
    const dy = r.y + 10 + i * 9 - phase * 6;
    ctx.globalAlpha = 0.85 * (1 - phase);
    ctx.beginPath();
    ctx.arc(dx, dy, 2.2 - phase, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSpentSurface(ctx, r, seed) {
  // Washed-out grey soil + skeletal dried-up stems (bleached straw color —
  // mid-brown stems disappeared against the soil at 1.5px).
  ctx.save();
  ctx.fillStyle = 'rgba(189,189,189,0.30)';
  traceBedBlob(ctx, r, seed, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(236,217,180,0.95)';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const sx = r.x + 16 + i * ((r.w - 32) / 2);
    const sy = r.y + r.h - 10;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + 3, sy - 10, sx + 8, sy - 12); // drooping dead stem
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx + 4, sy - 8);
    ctx.lineTo(sx + 8, sy - 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCompactedSurface(ctx, r, seed) {
  // Hard, flat, glossy crust…
  const gloss = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  gloss.addColorStop(0, 'rgba(255,255,255,0.16)');
  gloss.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  gloss.addColorStop(1, 'rgba(255,255,255,0.12)');
  ctx.fillStyle = gloss;
  traceBedBlob(ctx, r, seed, 3);
  ctx.fill();
  // …stamped with footprints (what compacted it) — placed bottom-left and
  // top-right, clear of the centre emoji and the top-left badge.
  ctx.fillStyle = 'rgba(33,20,12,0.55)';
  const prints = [
    { x: r.x + 14, y: r.y + r.h - 24 },
    { x: r.x + r.w - 30, y: r.y + 8 },
  ];
  for (const p of prints) {
    for (let s = 0; s < 2; s++) {
      ctx.beginPath();
      ctx.ellipse(p.x + s * 9, p.y + s * 10, 4, 6.5, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawMaskedShimmer(ctx, r, t) {
  // TOO-perfect green with a suspicious sparkle sweep — keeps the deception
  // (looks great in a thumbnail) while rewarding a second look.
  for (let i = 0; i < 3; i++) {
    const phase = (t * 0.7 + i * 0.37) % 1;
    const sx = r.x + 8 + phase * (r.w - 16);
    const sy = r.y + 8 + ((i * 37) % (r.h - 16));
    ctx.globalAlpha = 0.5 + Math.sin(phase * Math.PI) * 0.5;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✨', sx, sy);
  }
  ctx.globalAlpha = 1;
}

export function renderAilingPlots(ctx, state) {
  if (!state.plots) return;
  const sx = state.screenShake || 0;

  for (const p of state.plots) {
    const theme = PLOT_THEME[plotStatus(p)];
    const r = rectFor(p.tiles, 8, sx);
    const cx = r.x + r.w / 2;

    // Hint pulse on the plot just mistreated.
    if (state.hintPlotId === p.id) {
      const pulse = 0.5 + Math.sin(state.time * 6) * 0.5;
      drawRoundedRect(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 16,
        `rgba(255,235,59,${0.25 + pulse * 0.35})`, '#FBC02D');
    }

    // Attract beat: a warm GLOWING ring + bobbing arrow on the nearest sick plot
    // until the player heals their first plot — a green ring would vanish on grass,
    // so use a haloed amber that pops and pulls a young player's eye to the start.
    if (state.attractPlotId === p.id) {
      const pulse = 0.5 + Math.sin(state.time * 4) * 0.5;
      ctx.save();
      ctx.shadowColor = 'rgba(255,213,79,0.9)';
      ctx.shadowBlur = 10 + pulse * 16;
      drawRoundedRect(ctx, r.x - 5, r.y - 5, r.w + 10, r.h + 10, 16,
        `rgba(255,241,118,${0.18 + pulse * 0.26})`, '#FFD54F');
      ctx.restore();
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👇', cx, r.y - 20 + Math.sin(state.time * 5) * 5);
    }

    const seed = p.tiles[0].col;
    const status = plotStatus(p);

    // Raised-mound shadow so each bed lifts off the grass.
    ctx.save();
    ctx.translate(2, 5);
    traceBedBlob(ctx, r, seed);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
    ctx.restore();

    // Organic dug-soil mound: dark rim + lighter inner soil (silhouette ≠ UI panel).
    traceBedBlob(ctx, r, seed);
    ctx.fillStyle = theme.border;
    ctx.fill();
    traceBedBlob(ctx, r, seed, 3);
    ctx.fillStyle = SOIL_BED;
    ctx.fill();

    // Furrows — three curved planting rows so it reads as a worked garden bed.
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let f = 0; f < 3; f++) {
      const fy = r.y + r.h * (0.3 + f * 0.22);
      ctx.beginPath();
      ctx.moveTo(r.x + 10, fy);
      ctx.quadraticCurveTo(r.x + r.w / 2, fy + 3, r.x + r.w - 10, fy);
      ctx.stroke();
    }
    // Scattered soil crumbs (deterministic per tile).
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let i = 0; i < 10; i++) {
      const hx = (seed * 13 + i * 29) % (r.w - 12);
      const hy = (seed * 7 + i * 17) % (r.h - 12);
      ctx.fillRect(r.x + 6 + hx, r.y + 6 + hy, 2, 2);
    }
    ctx.restore();

    // State wash on top (healed green / poisoned purple / masked lush) — never on plain sick.
    if (theme.tint) {
      traceBedBlob(ctx, r, seed, 2);
      ctx.fillStyle = theme.tint;
      ctx.fill();
    }

    // The bed ITSELF shows its symptom (C1: readable without badge or label).
    if (status === 'sick') {
      if (p.id === 'eroding') drawCracksAndDust(ctx, r, state.time, seed);
      else if (p.id === 'spent') drawSpentSurface(ctx, r, seed);
      else if (p.id === 'compacted') drawCompactedSurface(ctx, r, seed);
      else if (p.id === 'lifeless') {
        // Unmasked truth: cold, ashen, bare — nothing lives here.
        traceBedBlob(ctx, r, seed, 3);
        ctx.fillStyle = 'rgba(97,97,97,0.45)';
        ctx.fill();
      }
    } else if (status === 'masked') {
      drawMaskedShimmer(ctx, r, state.time);
    }

    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ey = r.y + r.h / 2 - 3;
    if (plotStatus(p) === 'sick') {
      // Subtle "struggling" throb so an ailing plot looks alive, not frozen.
      const throb = 1 + Math.sin(state.time * 2 + p.tiles[0].col) * 0.05;
      ctx.save();
      ctx.translate(cx, ey);
      ctx.scale(throb, throb);
      ctx.fillText(plotEmoji(p), 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(plotEmoji(p), cx, ey);
    }

    // Symptom badge (top-left) for sick plots — a cream sticker so the glyph reads
    // as an intentional status marker, not a stray object dropped on the dirt.
    if (plotStatus(p) === 'sick' && SYMPTOM_ICON[p.id]) {
      const bx = r.x + 14, by = r.y + 14;
      ctx.beginPath();
      ctx.arc(bx, by, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,248,225,0.96)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#8d6e63';
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(SYMPTOM_ICON[p.id], bx, by + 0.5);
    }

    // Health bar under the plot. Masked-lush plots show a fake-healthy bar.
    const shownHealth = isMaskedLush(p) ? 88 : (p.health || 0);
    const bw = r.w;
    const by = r.y + r.h + 5;
    drawRoundedRect(ctx, r.x, by, bw, 6, 3, 'rgba(0,0,0,0.45)', 'transparent');
    const fillW = Math.max(0, Math.min(1, shownHealth / 100)) * (bw - 2);
    drawRoundedRect(ctx, r.x + 1, by + 1, fillW, 4, 2, healthColor(shownHealth), 'transparent');
  }
}

// ─── Remedy stations ─────────────────────────────────────
const REMEDY_THEME = {
  mulch:    { fill: 'rgba(141,110,99,0.92)',  border: '#5d4037' },
  compost:  { fill: 'rgba(124,179,66,0.92)',  border: '#558b2f' },
  cover:    { fill: 'rgba(102,187,106,0.92)', border: '#2e7d32' },
  notill:   { fill: 'rgba(120,144,156,0.92)', border: '#455a64' },
  chemical: { fill: 'rgba(229,115,115,0.92)', border: '#c62828' },
};

export function renderRemedyStations(ctx, state) {
  if (!state.stations) return;

  for (const s of state.stations) {
    const theme = REMEDY_THEME[s.key] || REMEDY_THEME.mulch;
    const r = rectFor(s.tiles, 8);
    const cx = r.x + r.w / 2;

    // Glow the CORRECT station when teaching: after repeated misses (hintStationKey)
    // or during the guided first cure's "fetch the remedy" step (guideStationKey).
    if (state.hintStationKey === s.key || state.guideStationKey === s.key) {
      const pulse = 0.5 + Math.sin(state.time * 6) * 0.5;
      ctx.save();
      ctx.shadowColor = 'rgba(255,213,79,0.9)';
      ctx.shadowBlur = 10 + pulse * 16;
      drawRoundedRect(ctx, r.x - 5, r.y - 5, r.w + 10, r.h + 10, 14,
        `rgba(255,241,118,${0.2 + pulse * 0.25})`, '#FFD54F');
      ctx.restore();
    }

    ctx.lineWidth = 1; // drawRoundedRect strokes at ambient width — pin it
    if (s.key === 'chemical') {
      // Industrial drum — a different SILHOUETTE from the wooden benches, so the
      // trap reads as "factory thing in a garden" before any label is read (C1).
      const bw = 44, bh = r.h + 6;
      const bx = cx - bw / 2, byTop = r.y - 4;
      // body
      drawRoundedRect(ctx, bx, byTop + 4, bw, bh - 8, 6, '#b71c1c', '#7f0000');
      // drum ribs
      ctx.strokeStyle = '#7f0000';
      ctx.lineWidth = 2;
      for (const fy of [0.32, 0.62]) {
        ctx.beginPath();
        ctx.moveTo(bx + 2, byTop + 4 + (bh - 8) * fy);
        ctx.lineTo(bx + bw - 2, byTop + 4 + (bh - 8) * fy);
        ctx.stroke();
      }
      // lid ellipse + metallic glint
      ctx.fillStyle = '#d32f2f';
      ctx.beginPath();
      ctx.ellipse(cx, byTop + 6, bw / 2 - 1, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7f0000';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(bx + 5, byTop + 10, 3, bh - 18);
      // hazard sign on the drum (the ⚠️ IS the vessel's label)
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠️', cx, byTop + bh / 2 + 2);
      // dripping test-tube up top so "chemical" is still concrete
      ctx.font = '15px sans-serif';
      ctx.fillText(s.emoji, cx + bw / 2 - 2, byTop + 4);
    } else {
      // Wooden work bench: legs + slab + a color-coded tray holding the remedy —
      // furniture silhouette ≠ plot mound ≠ barrel (C1 entity-type separation).
      const legW = 7, legH = 13;
      ctx.fillStyle = '#4e342e';
      ctx.fillRect(r.x + 10, r.y + r.h - legH, legW, legH);
      ctx.fillRect(r.x + r.w - 10 - legW, r.y + r.h - legH, legW, legH);
      // table slab (wood, with grain lines)
      drawRoundedRect(ctx, r.x, r.y + r.h - legH - 14, r.w, 16, 5, '#8d6e63', '#5d4037');
      ctx.strokeStyle = 'rgba(62,39,35,0.5)';
      ctx.lineWidth = 1;
      for (const gy of [6, 10]) {
        ctx.beginPath();
        ctx.moveTo(r.x + 6, r.y + r.h - legH - 14 + gy);
        ctx.lineTo(r.x + r.w - 6, r.y + r.h - legH - 14 + gy);
        ctx.stroke();
      }
      // color-coded tray ON the bench (keeps the remedy color language)
      const trayW = r.w - 18, trayH = 24;
      const trayY = r.y + r.h - legH - 14 - trayH + 3;
      drawRoundedRect(ctx, cx - trayW / 2, trayY, trayW, trayH, 8, theme.fill, theme.border);
      // the remedy itself, heaped in the tray
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.emoji, cx, trayY + trayH / 2);
    }

    // Label pill below — shrink the font to fit a max width so long labels
    // (e.g. Greek "Φυτά κάλυψης" / "Χωρίς όργωμα") never overlap neighbouring pills.
    const label = s.label || s.key;
    const MAX_PILL_W = 92; // stations are ~96px apart centre-to-centre
    let fontPx = 11, lw;
    do {
      ctx.font = `bold ${fontPx}px 'Inter', system-ui, sans-serif`;
      lw = ctx.measureText(label).width + 16;
      if (lw <= MAX_PILL_W) break;
      fontPx -= 1;
    } while (fontPx >= 8);
    const pillFont = `bold ${fontPx}px 'Inter', system-ui, sans-serif`;
    drawRoundedRect(ctx, cx - lw / 2, r.y + r.h + 4, lw, 18, 9, 'rgba(0,0,0,0.55)', 'transparent');
    drawText(ctx, label, cx, r.y + r.h + 13, {
      font: pillFont,
      color: '#fff',
      align: 'center',
      baseline: 'middle',
    });

    // Effect tag (one-word benefit) below the name — answers "what does this give me?".
    // The chemical's "poisons" is red so the trap reads as a warning, not a perk.
    if (s.effect) {
      const isTrap = s.key === 'chemical';
      const effFont = "600 10px 'Inter', system-ui, sans-serif";
      ctx.font = effFont;
      const ew = ctx.measureText(s.effect).width + 14;
      const ey = r.y + r.h + 24; // just under the 18px name pill (which starts at +4)
      drawRoundedRect(ctx, cx - ew / 2, ey, ew, 15, 7,
        isTrap ? 'rgba(198,40,40,0.95)' : 'rgba(46,125,50,0.92)', 'transparent');
      drawText(ctx, s.effect, cx, ey + 8, {
        font: effFont, color: '#fff', align: 'center', baseline: 'middle',
      });
    }
  }
}

// ─── Global soil-health meter (HUD, top of canvas) ───────
export function renderSoilMeter(ctx, state) {
  const health = Math.max(0, Math.min(100, state.soilHealth ?? 100));
  const w = 260, h = 16;
  const x = CANVAS_W / 2 - w / 2;
  const y = 18;

  // Plated title — unplated dark-green text sank into the zoomed wall bushes
  const label = state.soilHealthLabel || 'Soil Health';
  ctx.font = "bold 12px 'Inter', system-ui, sans-serif";
  const labelW = ctx.measureText(label).width + 16;
  drawRoundedRect(ctx, CANVAS_W / 2 - labelW / 2, y - 17, labelW, 15, 7,
    'rgba(27,94,32,0.85)', 'transparent');
  drawText(ctx, label, CANVAS_W / 2, y - 9, {
    font: "bold 12px 'Inter', system-ui, sans-serif",
    color: '#fff',
    align: 'center',
    baseline: 'middle',
  });
  drawRoundedRect(ctx, x, y, w, h, 8, 'rgba(0,0,0,0.35)', WORLD_ART.textGreen);
  // Skip the fill at (near-)empty so no rounded sliver shows when soil = 0.
  const fillW = (w - 4) * (health / 100);
  if (fillW >= 2) {
    drawRoundedRect(ctx, x + 2, y + 2, fillW, h - 4, 6, healthColor(health), 'transparent');
  }
}

// ─── Ambient life (guide bug + butterfly) ───────────────
// A guide bug crawls toward the nearest sick plot (drawing the child into motion
// until the first heal), then gently wanders; a butterfly drifts overhead. Position
// for the bug is eased in the update loop (state.guideBug); the rest is state.time.
// A few blades that bend with a shared sin so the front of the field is never frozen.
function drawGrassTuft(ctx, x, y, sway) {
  ctx.save(); // don't leak lineWidth/lineCap into the station strokes that follow
  ctx.strokeStyle = '#558b2f';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let b = -1; b <= 1; b++) {
    const bx = x + b * 4;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.quadraticCurveTo(bx + sway, y - 7, bx + sway * 1.6, y - 13);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderSoilAmbient(ctx, state) {
  const t = state.time || 0;

  // Living front edge: a row of swaying grass tufts along the bottom band,
  // clear of the plot row (8) and station row (2).
  const baseY = OY + 13.3 * TS;
  for (let i = 0; i < 8; i++) {
    const gx = OX + (2 + i * 2) * TS;
    drawGrassTuft(ctx, gx, baseY, Math.sin(t * 1.4 + i * 0.8) * 2.4);
  }

  // Butterfly drifting across the open upper-mid band (clear of plot rows).
  const bx = OX + (10 + Math.sin(t * 0.5) * 7) * TS;
  const by = OY + (5.4 + Math.cos(t * 0.8) * 1.2) * TS;
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(bx, by + Math.sin(t * 5) * 2);
  ctx.fillText('🦋', 0, 0);
  ctx.restore();

  // Guide bug (eased toward its target in the update loop).
  const gb = state.guideBug;
  if (gb) {
    ctx.save();
    ctx.translate(gb.x, gb.y + Math.sin(t * 8) * 1.5);
    if (gb.vx < 0) ctx.scale(-1, 1); // face travel direction
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐛', 0, 0);
    ctx.restore();
  }
}

// ─── Objective + progress chip (below the soil meter) ────
// Shows the goal & live tally (plots healed, missteps, chemical uses) DURING play,
// so "what do I do / how am I scored" is visible, not only on the result screen.
// Icon + number = language-neutral (no i18n needed).
export function renderObjectiveHUD(ctx, state) {
  const total = state.plots ? state.plots.length : 4;
  const healed = state.healedCount || 0;
  const parts = [`🌱 ${healed}/${total}`];
  if (state.mistakes) parts.push(`⚠️ ${state.mistakes}`);
  if (state.chemicalUses) parts.push(`🧪 ${state.chemicalUses}`);
  const label = parts.join('    ');

  const font = "bold 13px 'Inter', system-ui, sans-serif";
  ctx.font = font;
  const w = ctx.measureText(label).width + 24;
  const x = CANVAS_W / 2 - w / 2;
  const y = 40; // just under the soil meter (meter at y 18, h 16)
  drawRoundedRect(ctx, x, y, w, 22, 11, 'rgba(27,94,32,0.9)', WORLD_ART.pillBorder);
  drawText(ctx, label, CANVAS_W / 2, y + 11, {
    font, color: '#fff', align: 'center', baseline: 'middle',
  });
}

// ─── Guided first-cure banner ────────────────────────────
// One worded step (examine → fetch remedy → treat) beside the soil meter,
// shown until the first heal so a brand-new player learns the loop. Amber +
// soft pulse so it reads as a live prompt, distinct from the green HUD chip.
const GUIDE_STEP_NUM = { inspect: '1', grab: '2', treat: '3' };
export function renderGuideBanner(ctx, state) {
  const step = state.guideStep;
  if (!step || !state.guideLabels) return;
  const text = `${GUIDE_STEP_NUM[step] || '•'} · ${state.guideLabels[step] || ''}`;
  const font = "bold 13px 'Inter', system-ui, sans-serif";
  ctx.font = font;
  // The stations begin at canvas y76. Keep the guide in the unused top-left
  // HUD area, left of the meter (x520), including its glow and wrapped text.
  const w = Math.min(470, ctx.measureText(text).width + 30);
  const lines = wrapText(ctx, text, w - 30);
  const x = 20;
  const y = 12;
  const h = 12 + lines.length * 17;
  const pulse = 0.5 + Math.sin(state.time * 3) * 0.5;
  ctx.save();
  ctx.shadowColor = `rgba(255,213,79,${0.5 + pulse * 0.4})`;
  ctx.shadowBlur = 4 + pulse * 2;
  drawRoundedRect(ctx, x, y, w, h, 12, 'rgba(255,179,0,0.96)', '#E65100');
  ctx.restore();
  lines.forEach((line, index) => drawText(ctx, line, x + w / 2, y + 6 + (index + 0.5) * 17, {
    font, color: WORLD_ART.panelBrownDeep, align: 'center', baseline: 'middle',
  }));
}

// ─── Diagnosis card (symptoms only — no source badge) ────
export function renderDiagnosisCard(ctx, state) {
  if (!state.diagnosisCard) return;
  const symptom = state.diagnosisCard.symptom || '';
  const need = state.diagnosisCard.need || ''; // prescription bridge → the right remedy

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const cardW = 560;
  const padX = 28;
  ctx.font = "18px 'Inter', system-ui, sans-serif";
  const lines = wrapText(ctx, symptom, cardW - padX * 2);
  const cardH = 56 + lines.length * 26 + (need ? 58 : 0) + 44;
  const cardX = CANVAS_W / 2 - cardW / 2;
  const cardY = CANVAS_H / 2 - cardH / 2;

  // On phone landscape the card grows around the canvas centre so the 13 px button reads ≥ 12 CSS px.
  const u = Math.min(readableUnit(canvasCssScale(ctx.canvas), 13, 12), (CANVAS_W - 40) / cardW, (CANVAS_H - 20) / cardH);
  ctx.save();
  ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
  ctx.scale(u, u);
  ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);

  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 18, 'rgba(255,248,225,0.98)', '#6D4C41');

  drawText(ctx, `🩺 ${state.diagnosisTitle || 'Diagnosis'}`, CANVAS_W / 2, cardY + 26, {
    font: "bold 18px 'Inter', system-ui, sans-serif",
    color: WORLD_ART.panelBrown,
    align: 'center',
    baseline: 'middle',
  });

  let qy = cardY + 56 + 13;
  for (const ln of lines) {
    drawText(ctx, ln, CANVAS_W / 2, qy, {
      font: "18px 'Inter', system-ui, sans-serif",
      color: WORLD_ART.panelBrownDeep,
      align: 'center',
      baseline: 'middle',
    });
    qy += 26;
  }

  // Prescription line — an OUTLINED "tag" (light green wash + green border + green text),
  // deliberately NOT the solid-green pill of the «Got it» button below, so the child reads
  // "→ Needs covering" as a hint label, not a second tappable button. Extra top gap (qy+12)
  // keeps it from crowding the symptom text and the CTA (FIX-G).
  if (need) {
    const presc = `→ ${need}`;
    ctx.font = "bold 17px 'Inter', system-ui, sans-serif";
    const pw = ctx.measureText(presc).width + 32;
    const py = qy + 12;
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, CANVAS_W / 2 - pw / 2, py, pw, 28, 9, 'rgba(85,139,47,0.14)', WORLD_ART.textGreen);
    ctx.lineWidth = 1;
    drawText(ctx, presc, CANVAS_W / 2, py + 14, {
      font: "bold 17px 'Inter', system-ui, sans-serif",
      color: WORLD_ART.textGreen, align: 'center', baseline: 'middle',
    });
  }

  const btnLabel = `${state.revealDismiss || 'Got it'}  ↵`;
  ctx.font = "bold 13px 'Inter', system-ui, sans-serif";
  const btnW = ctx.measureText(btnLabel).width + 32;
  drawRoundedRect(ctx, CANVAS_W / 2 - btnW / 2, cardY + cardH - 36, btnW, 28, 14, WORLD_ART.buttonGreen, WORLD_ART.textGreen);
  drawText(ctx, btnLabel, CANVAS_W / 2, cardY + cardH - 22, {
    font: "bold 13px 'Inter', system-ui, sans-serif",
    color: '#fff',
    align: 'center',
    baseline: 'middle',
  });
  ctx.restore();
}
