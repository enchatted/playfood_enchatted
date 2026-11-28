// Garden Planner — polished renderer.
// Flat season-corner beds, 3D seed crates with empty-on-pickup state, tools,
// decorative elements, watering stream + progress ring, phase objective,
// tutorial, feedback toasts, and an animated carry overlay above the player.
// (The base floor/fence/walkway tiles are drawn by the shared gameRoom renderer.)

import {
  drawRetroBox, drawRoundedRect, drawText, lerp,
} from '../../utils/canvas.js';
import { WORLD_ART } from '../../styles/brandColors.js';
import { DIR, TILE_SIZE } from './gameRoomLogic.js';
import { OX, OY, roomToCanvas } from './gameRoomRenderer.js';
import { GAME_ROOMS } from './gameRoomData.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { getGardenCarryAnchor } from './gardenCarryLayout.js';
import { harvestToolHasWork } from '../growing/gardenTargets.js';
const ROOM_COLS = 20;
const ROOM_ROWS = 15;

// Inner playable area (everything between perimeter walls)
const FIELD_X = OX + TILE_SIZE;
const FIELD_Y = OY + TILE_SIZE;
const FIELD_W = (ROOM_COLS - 2) * TILE_SIZE;
const FIELD_H = (ROOM_ROWS - 2) * TILE_SIZE;

// Season visual identity — used by corners + banners
const SEASON_STYLES = {
  winter: { tint: 'rgba(144, 202, 249, 0.32)', bed: '#5D4037', banner: '#42A5F5', dark: '#1565C0', emoji: '❄️', label: 'WINTER' },
  spring: { tint: 'rgba(174, 213, 129, 0.40)', bed: '#5D4037', banner: '#7CB342', dark: '#558B2F', emoji: '🌸', label: 'SPRING' },
  autumn: { tint: 'rgba(255, 171, 145, 0.38)', bed: '#5D4037', banner: '#FF7043', dark: '#D84315', emoji: '🍂', label: 'AUTUMN' },
  summer: { tint: 'rgba(255, 224, 130, 0.40)', bed: '#5D4037', banner: '#FFB300', dark: '#E65100', emoji: '🌞', label: 'SUMMER' },
};

// ─── Flat 2D garden beds per season corner ──────────────────
// Flat colored tiles with clean simple border — banners drawn separately
// (via renderSeasonBanners).
export function renderSeasonCorners(ctx, cornerAreas, activeSeason, time) {
  for (const area of cornerAreas) {
    const style = SEASON_STYLES[area.season];
    if (!style) continue;

    const x = OX + area.minCol * TILE_SIZE - 3;
    const y = OY + area.minRow * TILE_SIZE - 3;
    const w = (area.maxCol - area.minCol + 1) * TILE_SIZE + 6;
    const h = (area.maxRow - area.minRow + 1) * TILE_SIZE + 6;
    const isActive = area.season === activeSeason;

    // Subtle drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(x + 2, y + 3, w, h);

    // Flat wooden border (2D — no gradient)
    ctx.fillStyle = style.bed;
    ctx.fillRect(x, y, w, h);
    // Crisp outline
    ctx.strokeStyle = '#3E2723';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // Inner soil area (flat dark brown, no gradient)
    const innerX = x + 5;
    const innerY = y + 5;
    const innerW = w - 10;
    const innerH = h - 10;
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(innerX, innerY, innerW, innerH);
    // Season tint overlay (flat, no gradient)
    ctx.fillStyle = style.tint;
    ctx.fillRect(innerX, innerY, innerW, innerH);
    // Inner border for crisp 2D feel
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(innerX + 0.5, innerY + 0.5, innerW - 1, innerH - 1);

    if (isActive) {
      // Glowing pulsing border on the active season
      const pulse = 0.5 + 0.5 * Math.sin((time || 0) * 4);
      ctx.strokeStyle = `rgba(255, 213, 79, ${0.55 + 0.45 * pulse})`;
      ctx.lineWidth = 3 + pulse * 2;
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    } else {
      // Dim the inactive corners — visible but clearly "not now"
      ctx.fillStyle = 'rgba(38, 40, 52, 0.42)';
      ctx.fillRect(x, y, w, h);
    }
  }
}

// ─── Season banners — drawn AFTER fence so always visible ───
// Position is adaptive: top corners → banner BELOW bed (inside field),
// bottom corners → banner ABOVE bed (toward field center).
// Strip Greek monotonic accents during uppercase — orthographically correct
// (Greek capital letters traditionally drop the tonos). JS default toUpperCase
// preserves diacritics (ό → Ό), which looks wrong in all-caps signage.
function upperCaseGreekClean(s) {
  // NFD decomposes accented chars into base + combining mark; we strip the
  // combining marks (U+0300-U+036F) and then uppercase. Result: clean caps
  // like ΦΘΙΝΟΠΩΡΟ (correct Greek monotonic) instead of ΦΘΙΝΌΠΩΡΟ.
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

export function renderSeasonBanners(ctx, cornerAreas, activeSeason, t = null) {
  for (const area of cornerAreas) {
    const style = SEASON_STYLES[area.season];
    if (!style) continue;
    // Localized label — falls back to hardcoded English (style.label) if no t() passed
    // (preserves backward compat for any call site that hasn't migrated yet).
    const seasonLabel = t ? upperCaseGreekClean(t('season.' + area.season)) : style.label;

    const bedX = OX + area.minCol * TILE_SIZE - 3;
    const bedY = OY + area.minRow * TILE_SIZE - 3;
    const bedW = (area.maxCol - area.minCol + 1) * TILE_SIZE + 6;
    const bedH = (area.maxRow - area.minRow + 1) * TILE_SIZE + 6;

    // Measure-then-size so longer localized season words don't overflow the
    // banner edges (H11). Min width keeps short labels from looking cramped.
    const bannerLabel = style.emoji + ' ' + seasonLabel;
    ctx.font = "bold 11px 'Inter', system-ui, sans-serif";
    const bannerW = Math.max(96, Math.ceil(ctx.measureText(bannerLabel).width) + 20);
    const bannerH = 22;
    const bannerX = bedX + bedW / 2 - bannerW / 2;
    // Top corners (minRow <= 3): banner BELOW bed (inside field — visible)
    // Bottom corners (minRow >= 11): banner ABOVE bed (inside field — visible)
    const isTopCorner = area.minRow <= 3;
    const bannerY = isTopCorner ? bedY + bedH + 4 : bedY - bannerH - 4;

    // Inactive season banners are dimmed
    ctx.globalAlpha = area.season === activeSeason ? 1 : 0.5;

    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
    ctx.fillRect(bannerX + 2, bannerY + 2, bannerW, bannerH);

    // Flat banner body
    ctx.fillStyle = style.banner;
    ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
    // Inner highlight stripe
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(bannerX, bannerY, bannerW, 4);
    // Crisp white border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(bannerX + 1, bannerY + 1, bannerW - 2, bannerH - 2);

    drawText(ctx, bannerLabel, bannerX + bannerW / 2, bannerY + bannerH / 2 + 1, {
      font: "bold 11px 'Inter', system-ui, sans-serif",
      color: '#fff', align: 'center', baseline: 'middle',
    });

    ctx.globalAlpha = 1;
  }
}

// ─── Plots ───────────────────────────────────────────────────
const PLOT_SEASON_EMOJI = { winter: '❄️', spring: '🌸', autumn: '🍂', summer: '🌞' };

export function renderPlots(ctx, plots, time, phase = null) {
  for (const plot of plots) {
    const px = OX + plot.col * TILE_SIZE + 5;
    const py = OY + plot.row * TILE_SIZE + 5;
    const ps = TILE_SIZE - 10;

    // Thumbnail-test fix: in HARVEST the ready plots must read «collect
    // me» without text — pulsing gold attract ring + the SAME speech-bubble
    // pattern that makes the WATER phase legible (💧 bubble passed the blind
    // test; the ring alone did not): 🧺 over ripe plants, 🪣 over wilted.
    if (phase === 'HARVEST' && plot.seed && !plot.harvested) {
      const mature = !plot.wilted && (plot.growthStage || 0) >= 2;
      if (mature || plot.wilted) {
        const pulse = mature ? 0.55 + 0.35 * Math.sin(time * 4 + plot.col) : 0.5;
        ctx.save();
        ctx.lineWidth = mature ? 3 : 2;
        ctx.strokeStyle = mature
          ? `rgba(249, 168, 37, ${pulse.toFixed(2)})`   // reward gold — «ripe»
          : 'rgba(121, 85, 72, 0.7)';                    // compost brown
        ctx.strokeRect(px - 3, py - 3, ps + 6, ps + 6);
        ctx.restore();
        drawToolPopup(ctx, px + ps / 2, py - 2, mature ? '🧺' : '🪣',
          time + plot.col * 0.7 + plot.row * 0.3);
      }
    }

    // Plot indentation (small dark inner)
    drawRoundedRect(ctx, px, py, ps, ps, 4, 'rgba(62, 39, 35, 0.55)', 'rgba(0,0,0,0.35)');

    // Soil dots for texture
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let i = 0; i < 5; i++) {
      const h = (plot.col * 7 + plot.row * 13 + i * 19) & 0x3F;
      ctx.fillRect(px + (h % ps), py + ((h * 3) % ps), 1, 1);
    }

    // Season watermark (simplification D) — faded emoji at center of empty plots
    // so kids always know which season the plot belongs to without scanning banners.
    if (!plot.seed && PLOT_SEASON_EMOJI[plot.season]) {
      ctx.globalAlpha = 0.35;
      drawText(ctx, PLOT_SEASON_EMOJI[plot.season], px + ps / 2, py + ps / 2, {
        font: '14px sans-serif', align: 'center', baseline: 'middle',
      });
      ctx.globalAlpha = 1;
    }

    if (!plot.seed) continue;

    if (plot.harvested) {
      drawText(ctx, '✅', px + ps / 2, py + ps / 2, {
        font: '16px sans-serif', align: 'center', baseline: 'middle',
      });
      continue;
    }

    if (plot.wilted) {
      drawText(ctx, '🥀', px + ps / 2, py + ps / 2, {
        font: '18px sans-serif', align: 'center', baseline: 'middle',
      });
      continue;
    }

    // Growing plant — emoji by growth stage (0 seedling → 1 sprout → 2 mature fruit)
    const stage = Math.min(2, plot.growthStage || 0);
    const STAGE_EMOJI = ['🌱', '🌿', plot.seed.emoji];
    const bobble = Math.sin(time * 2 + plot.col + plot.row) * 1.2;
    // Mature fruit drawn distinctly BIGGER than sprouts — at thumbnail distance
    // «grown food» must not read as «seedling» (blind-test finding).
    const scale = stage === 2 ? 1.2 : 0.7 + stage * 0.15;
    const fontSize = Math.round(20 * scale);
    const markerDrawn = stage === 2 && renderCropMarker(
      ctx,
      plot.seed,
      px + ps / 2,
      py + ps / 2 - 3 + bobble,
    );
    if (!markerDrawn) {
      drawText(ctx, STAGE_EMOJI[stage], px + ps / 2, py + ps / 2 - 3 + bobble, {
        font: `${fontSize}px sans-serif`, align: 'center', baseline: 'middle',
      });
    }

    // Health dots — redundant shape cue (H10): watered = filled+outlined,
    // unwatered = hollow ring. Distinguishable without relying on color, so
    // color-blind kids can still read the watering state the WATER round gates on.
    for (let i = 0; i < 2; i++) {
      const dx = px + ps / 2 - 6 + i * 12;
      const dy = py + ps - 4;
      const watered = i < plot.health;
      ctx.beginPath();
      ctx.arc(dx, dy, 2.8, 0, Math.PI * 2);
      if (watered) {
        ctx.fillStyle = '#43A047';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#1B5E20';
        ctx.stroke();
      } else {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.stroke();
      }
    }
  }
}

// Small crop-specific markers avoid using the same generic sprout for both the
// seed choice and the plant's first growth stage. Canvas shapes are used instead
// of recent Unicode emoji so they stay reliable on older school computers.
function renderCropMarker(ctx, item, centerX, centerY) {
  if (item.marker === 'cabbage') {
    // A compact round brassica head, distinct from the long lettuce emoji.
    ctx.fillStyle = '#558B2F';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7CB342';
    for (const [dx, dy, radius] of [[-4, -2, 5], [4, -2, 5], [0, 4, 5], [0, -5, 4]]) {
      ctx.beginPath();
      ctx.arc(centerX + dx, centerY + dy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#33691E';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
    ctx.stroke();
    return true;
  }

  if (item.marker === 'spinach') {
    // Three pointed leaves and visible stems form a recognisable spinach bunch.
    ctx.strokeStyle = '#1B5E20';
    ctx.lineWidth = 1.5;
    for (const [dx, lean] of [[-6, -3], [0, 0], [6, 3]]) {
      ctx.fillStyle = '#2E7D32';
      ctx.beginPath();
      ctx.moveTo(centerX, centerY + 9);
      ctx.quadraticCurveTo(centerX + dx - 7, centerY + 1, centerX + dx + lean, centerY - 10);
      ctx.quadraticCurveTo(centerX + dx + 8, centerY, centerX, centerY + 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = '#66BB6A';
    ctx.beginPath();
    ctx.moveTo(centerX - 5, centerY + 9);
    ctx.lineTo(centerX + 5, centerY + 9);
    ctx.stroke();
    return true;
  }

  if (item.marker === 'peas') {
    drawRoundedRect(ctx, centerX - 11, centerY - 6, 22, 12, 6, '#2E7D32', '#1B5E20');
    for (const offset of [-6, 0, 6]) {
      ctx.fillStyle = '#C5E1A5';
      ctx.beginPath();
      ctx.arc(centerX + offset, centerY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return true;
  }

  if (item.marker === 'green_beans') {
    ctx.fillStyle = '#8BC34A';
    ctx.strokeStyle = '#33691E';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX - 10, centerY - 6);
    ctx.quadraticCurveTo(centerX, centerY + 8, centerX + 10, centerY - 4);
    ctx.lineTo(centerX + 8, centerY);
    ctx.quadraticCurveTo(centerX, centerY + 11, centerX - 11, centerY - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return true;
  }

  return false;
}

// ─── Seed crates (3D wooden box with empty-on-pickup state) ─
// crateState: { [seedId]: refillTimer } — when >0, crate is "empty"
export function renderSeedCrates(
  ctx,
  crates,
  carrying,
  _crateState,
  time,
  currentPhase = 'PLANT',
  usedSeedIds = new Set(),
) {
  // Outside PLANT the crates are scenery, not the task: dim them so
  // they stop pulling the eye toward «planting» during WATER/HARVEST.
  const dimmed = currentPhase !== 'PLANT';
  if (dimmed) {
    ctx.save();
    ctx.globalAlpha = 0.45;
  }
  for (const crate of crates) {
    const x = OX + crate.col * TILE_SIZE + 3;
    const y = OY + crate.row * TILE_SIZE - 1;
    const w = TILE_SIZE - 6;
    const h = TILE_SIZE - 4;

    // Always-full crates (simplification B) — only dim if player is
    // currently carrying THIS seed type, so they get a soft "you have it" hint.
    const isCarried = carrying?.seed?.id === crate.seedId;
    const usedThisSeason = currentPhase === 'PLANT' && usedSeedIds.has(crate.seedId);

    // Drop shadow (flat)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(x + 2, y + h, w, 4);

    // Flat crate body
    ctx.fillStyle = '#8D6E63';
    ctx.fillRect(x, y, w, h);
    // Crisp dark border
    ctx.strokeStyle = '#3E2723';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // Top rim band
    ctx.fillStyle = '#A1887F';
    ctx.fillRect(x + 2, y + 2, w - 4, 4);

    // Single plank divider
    ctx.strokeStyle = '#5D4037';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + h / 2);
    ctx.lineTo(x + w - 2, y + h / 2);
    ctx.stroke();

    // Crop marker — full alpha normally, dim when carried.
    ctx.globalAlpha = isCarried || usedThisSeason ? 0.35 : 1;
    if (usedThisSeason) {
      ctx.globalAlpha = 1;
      drawText(ctx, '✓', x + w / 2, y + h / 2 + 3, {
        font: "bold 18px 'Inter', system-ui, sans-serif",
        color: '#E8F5E9', align: 'center', baseline: 'middle',
      });
    } else {
      const markerDrawn = renderCropMarker(ctx, crate, x + w / 2, y + h / 2 + 3);
      if (!markerDrawn) {
        drawText(ctx, crate.emoji, x + w / 2, y + h / 2 + 3, {
          font: '20px sans-serif', align: 'center', baseline: 'middle',
        });
      }
    }
    ctx.globalAlpha = 1;

    // No season tag under the crate: printing each seed's season here answered
    // the game's own question before the child could think. Matching seed to season IS the exercise; the
    // corner banners and the empty-plot watermarks still name each bed.
  }
  if (dimmed) ctx.restore();
}

// ─── Target ring — the tile Enter will touch ────────────────
// The reach ladder lets a child act on a tile they are not
// strictly facing, so the tile that will answer has to be visible or the extra
// reach just feels random. Amber, like the active-season glow: "this one".
export function renderTargetRing(ctx, tile, time, mode = 'action') {
  if (!tile) return;
  const x = OX + tile.col * TILE_SIZE;
  const y = OY + tile.row * TILE_SIZE;
  const pulse = 0.5 + 0.5 * Math.sin((time || 0) * 5);

  ctx.save();
  // Dark liner first, so the ring reads on pale soil and on dark beds alike.
  ctx.strokeStyle = 'rgba(62, 39, 35, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  if (mode === 'teach') ctx.setLineDash([5, 4]);
  ctx.strokeStyle = mode === 'teach'
    ? `rgba(100, 181, 246, ${0.65 + 0.35 * pulse})`
    : `rgba(255, 213, 79, ${0.6 + 0.4 * pulse})`;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  ctx.setLineDash([]);
  ctx.restore();
}

// ─── Tool stations (faucet / cart / compost bin) ────────────
// Spec 2026-05-19: each tool tile renders a canvas-drawn container sprite
// instead of a floating emoji. While the station is needed and the player
// isn't carrying the matching tool, a speech-bubble popup shows the tool
// emoji above the container — same "where to go next" cue as the active
// season halo, gentler than the old emoji-on-floor pattern.
//
// Sprites are flat 2D + crisp outline (matches the rest of the game's
// aesthetic). One drop shadow underneath, no gradients inside the body.

// Faucet: low brick wall with vertical pipe + brass spout + hanging drop.
function drawFaucet(ctx, cx, cy, active, time) {
  // Drop shadow under the brick wall
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(cx - 13, cy + 10, 26, 4);

  // Brick wall (2 short rows)
  ctx.fillStyle = '#A1664A';
  ctx.fillRect(cx - 12, cy + 2, 24, 10);
  ctx.strokeStyle = '#5D2E1F';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 12 + 0.5, cy + 2 + 0.5, 23, 9);
  // Mortar lines
  ctx.strokeStyle = '#FFE0B2';
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy + 7); ctx.lineTo(cx + 12, cy + 7);
  ctx.moveTo(cx - 4, cy + 2);  ctx.lineTo(cx - 4, cy + 7);
  ctx.moveTo(cx + 4, cy + 7);  ctx.lineTo(cx + 4, cy + 12);
  ctx.stroke();

  // Vertical pipe rising out of the wall
  ctx.fillStyle = '#90A4AE';
  ctx.fillRect(cx - 2, cy - 10, 4, 12);
  ctx.strokeStyle = '#37474F';
  ctx.strokeRect(cx - 2 + 0.5, cy - 10 + 0.5, 3, 11);

  // Horizontal brass spout
  ctx.fillStyle = '#D4A017';
  ctx.fillRect(cx - 2, cy - 10, 10, 3);
  ctx.strokeStyle = '#7C5A00';
  ctx.strokeRect(cx - 2 + 0.5, cy - 10 + 0.5, 9, 2);
  // Tap handle
  ctx.fillStyle = '#D4A017';
  ctx.fillRect(cx - 4, cy - 14, 8, 3);
  ctx.strokeRect(cx - 4 + 0.5, cy - 14 + 0.5, 7, 2);

  // Hanging drop (animated tiny bob when active)
  const bob = active ? Math.sin(time * 4) * 0.6 : 0;
  ctx.fillStyle = '#1E88E5';
  ctx.beginPath();
  ctx.ellipse(cx + 7, cy - 4 + bob, 1.6, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(cx + 6.5, cy - 5 + bob, 0.6, 0, Math.PI * 2);
  ctx.fill();
}

// Cart: wooden box on two wheels with a rope handle.
function drawCart(ctx, cx, cy, _active, _time) {
  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(cx - 13, cy + 11, 26, 3);

  // Box body
  ctx.fillStyle = '#8D6E63';
  ctx.fillRect(cx - 12, cy - 4, 24, 14);
  ctx.strokeStyle = '#3E2723';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 12 + 0.5, cy - 4 + 0.5, 23, 13);
  // Plank divider
  ctx.beginPath();
  ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 10);
  ctx.stroke();
  // Top lighter rim
  ctx.fillStyle = '#A1887F';
  ctx.fillRect(cx - 12, cy - 4, 24, 3);

  // Two wheels
  ctx.fillStyle = '#37474F';
  ctx.beginPath();
  ctx.arc(cx - 7, cy + 10, 3.2, 0, Math.PI * 2);
  ctx.arc(cx + 7, cy + 10, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#90A4AE';
  ctx.beginPath();
  ctx.arc(cx - 7, cy + 10, 1.2, 0, Math.PI * 2);
  ctx.arc(cx + 7, cy + 10, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Rope handle (thin curved line)
  ctx.strokeStyle = '#6D4C41';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy - 4);
  ctx.quadraticCurveTo(cx - 14, cy - 11, cx - 8, cy - 12);
  ctx.stroke();
  ctx.lineWidth = 1;
}

// Compost bin: round green/brown bin with brown lid + leaf decal.
function drawCompostBin(ctx, cx, cy, _active, _time) {
  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(cx - 11, cy + 11, 22, 3);

  // Bin body — slightly tapered (wider at top)
  ctx.fillStyle = '#43A047';
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy - 4);
  ctx.lineTo(cx + 10, cy - 4);
  ctx.lineTo(cx + 9, cy + 10);
  ctx.lineTo(cx - 9, cy + 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1B5E20';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Vertical ridges
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx - 4, cy + 10);
  ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx + 4, cy + 10);
  ctx.stroke();

  // Lid (slightly oval, darker brown)
  ctx.fillStyle = '#5D4037';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 5, 11, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3E2723';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Lid handle (small bump)
  ctx.fillStyle = '#3E2723';
  ctx.fillRect(cx - 2, cy - 8, 4, 2);

  // Leaf decal on the side
  ctx.fillStyle = '#9CCC65';
  ctx.beginPath();
  ctx.ellipse(cx - 5, cy + 4, 2.2, 1.2, Math.PI / 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = WORLD_ART.textGreen;
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

function drawContainer(ctx, cx, cy, kind, active, time) {
  if (kind === 'water') drawFaucet(ctx, cx, cy, active, time);
  else if (kind === 'harvest') drawCart(ctx, cx, cy, active, time);
  else if (kind === 'compost') drawCompostBin(ctx, cx, cy, active, time);
}

// Speech-bubble popup above a container — gentle pulse, tool emoji inside.
function drawToolPopup(ctx, cx, cy, emoji, time) {
  const pulse = 0.85 + 0.15 * Math.sin(time * 3);
  const w = 24;
  const h = 22;
  const x = cx - w / 2;
  const y = cy - h;

  ctx.globalAlpha = pulse;
  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
  drawRoundedRect(ctx, x + 1, y + 2, w, h, 6, 'rgba(0, 0, 0, 0.25)', 'transparent');
  // Bubble body
  drawRoundedRect(ctx, x, y, w, h, 6, WORLD_ART.panelCream, WORLD_ART.textGreen);
  // Tail
  ctx.fillStyle = WORLD_ART.panelCream;
  ctx.strokeStyle = WORLD_ART.textGreen;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 3, y + h - 0.5);
  ctx.lineTo(cx + 3, y + h - 0.5);
  ctx.lineTo(cx, y + h + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Cover the bubble's bottom border where the tail meets, so it reads as one shape
  ctx.fillStyle = WORLD_ART.panelCream;
  ctx.fillRect(cx - 2.5, y + h - 1.5, 5, 1.5);

  // Emoji
  drawText(ctx, emoji, cx, y + h / 2, {
    font: '14px sans-serif', align: 'center', baseline: 'middle',
  });
  ctx.globalAlpha = 1;
}

export function renderTools(ctx, tools, currentPhase, carrying, plots, time) {
  for (const tool of tools) {
    const x = OX + tool.col * TILE_SIZE;
    const y = OY + tool.row * TILE_SIZE;
    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2;

    // In the harvest phase a tool is lit only while it
    // still has work: the same rule as its target / prompt / action
    // (harvestToolHasWork), so an emptied bin never looks available again.
    const isActivePhase =
      (tool.tool === 'water' && currentPhase === 'WATER') ||
      ((tool.tool === 'harvest' || tool.tool === 'compost') && currentPhase === 'HARVEST'
        && harvestToolHasWork(plots, tool.tool));
    const isCarried = carrying?.tool === tool.tool;

    // Count remaining work that matches this tool — drives popup visibility.
    let remaining = 0;
    if (plots) {
      if (tool.tool === 'water') {
        remaining = plots.filter(p => p.seed && !p.wilted && p.health < 2).length;
      } else if (tool.tool === 'harvest') {
        remaining = plots.filter(p => p.seed && !p.harvested && !p.wilted && p.health >= 2).length;
      } else if (tool.tool === 'compost') {
        remaining = plots.filter(p => p.seed && !p.harvested && (p.wilted || p.health < 2)).length;
      }
    }
    const popupVisible = isActivePhase && remaining > 0 && !isCarried;

    // Soft ground mat (kept — anchors the sprite to its tile)
    drawRoundedRect(ctx, x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6, 6,
      isActivePhase ? 'rgba(255, 255, 255, 0.65)' : 'rgba(255, 255, 255, 0.30)',
      isActivePhase ? WORLD_ART.textGreen : 'rgba(0, 0, 0, 0.15)');

    // Active-phase pulse halo around the container
    if (isActivePhase && !isCarried) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 3);
      ctx.strokeStyle = `rgba(46, 125, 50, ${0.3 + 0.4 * pulse})`;
      ctx.lineWidth = 2 + pulse;
      ctx.beginPath();
      ctx.arc(cx, cy, 16 + 2 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (isCarried) ctx.globalAlpha = 0.35;
    else if (!isActivePhase) ctx.globalAlpha = 0.6;
    drawContainer(ctx, cx, cy, tool.tool, isActivePhase && !isCarried, time);
    ctx.globalAlpha = 1;

    if (popupVisible) {
      const emoji =
        tool.tool === 'water' ? '💧' :
        tool.tool === 'harvest' ? '🌾' :
        '🪣';
      drawToolPopup(ctx, cx, y - 4, emoji, time);
    }
  }
}

// ─── Hint bar ─────────────────────────────────
// Same place as the action prompt, but no ↵ icon and an amber border: it explains
// why nothing happens (two tools equally near), it does not invite a press.
export function renderGardenHint(ctx, text) {
  if (!text) return;
  ctx.save();
  ctx.font = "bold 14px 'Inter', system-ui, sans-serif";
  const w = Math.max(ctx.measureText(text).width + 40, 250);
  const h = 40;
  const x = CANVAS_W / 2 - w / 2;
  const y = CANVAS_H - 65;
  drawRoundedRect(ctx, x + 2, y + 3, w, h, 14, 'rgba(0,0,0,0.2)', 'transparent');
  drawRoundedRect(ctx, x, y, w, h, 14, 'rgba(255,248,225,0.95)', '#F9A825');
  drawText(ctx, text, CANVAS_W / 2, y + h / 2, {
    font: "bold 14px 'Inter', system-ui, sans-serif",
    color: '#5D4037', align: 'center', baseline: 'middle',
  });
  ctx.restore();
}

// ─── Decorative elements — emoji-only, consistent with FridgeManager style ─
// Static placements at fixed tiles + 2 wandering critters (butterfly + bee).
const STATIC_DECORATIONS = [
  // Trees flanking top corners (peek over the wall)
  { col: 6,  row: 1,  emoji: '🌳', size: 20, dy: -2 },
  { col: 13, row: 1,  emoji: '🌳', size: 20, dy: -2 },
  // Small flower clusters scattered between corners (peripheral, not central)
  { col: 1,  row: 4,  emoji: '🌷', size: 14 },
  { col: 18, row: 10, emoji: '🌼', size: 14 },
  { col: 1,  row: 10, emoji: '🌻', size: 14 },
  { col: 18, row: 4,  emoji: '🌹', size: 14 },
];

export function renderGardenDecorations(ctx, time) {
  for (const d of STATIC_DECORATIONS) {
    const x = OX + d.col * TILE_SIZE + TILE_SIZE / 2;
    const y = OY + d.row * TILE_SIZE + TILE_SIZE / 2 + (d.dy || 0);
    drawText(ctx, d.emoji, x, y, {
      font: `${d.size}px sans-serif`, align: 'center', baseline: 'middle',
    });
  }

  // Butterfly drifts above
  const bx = OX + (8 + 4 * Math.sin(time * 0.5)) * TILE_SIZE;
  const by = OY + (5.5 + 1.5 * Math.cos(time * 0.7)) * TILE_SIZE;
  drawText(ctx, '🦋', bx, by, { font: '14px sans-serif', align: 'center', baseline: 'middle' });

  // Bee buzzes below
  const ex = OX + (12 - 3 * Math.cos(time * 0.6)) * TILE_SIZE;
  const ey = OY + (10 + 1.2 * Math.sin(time * 0.8)) * TILE_SIZE;
  drawText(ctx, '🐝', ex, ey, { font: '12px sans-serif', align: 'center', baseline: 'middle' });
}

// ─── Carry overlay: large animated badge above player ───────
export function renderCarryOverlay(ctx, player, carrying, time, t = null) {
  if (!carrying) return;
  const { x: px, y: py } = getGardenCarryAnchor({
    x: OX + player.pixelX + TILE_SIZE / 2,
    y: OY + player.pixelY - 6,
    minTop: FIELD_Y + 8,
    fieldLeft: FIELD_X,
    fieldRight: FIELD_X + FIELD_W,
  });

  // Bobbing animation
  const bob = Math.sin(time * 4) * 2;

  // Glow halo
  const glow = ctx.createRadialGradient(px, py - 16 + bob, 4, px, py - 16 + bob, 20);
  glow.addColorStop(0, 'rgba(255, 235, 59, 0.6)');
  glow.addColorStop(1, 'rgba(255, 235, 59, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(px, py - 16 + bob, 20, 0, Math.PI * 2);
  ctx.fill();

  // Badge background
  const badgeW = 32;
  const badgeH = 28;
  drawRoundedRect(ctx, px - badgeW / 2, py - 28 + bob, badgeW, badgeH, 8,
    'rgba(255, 255, 255, 0.95)', WORLD_ART.textGreen);

  // Pointer (triangle) at bottom of badge
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.strokeStyle = WORLD_ART.textGreen;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px - 4, py + bob);
  ctx.lineTo(px + 4, py + bob);
  ctx.lineTo(px,     py + 4 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Carried item emoji
  let emoji = '?';
  let cropMarker = null;
  let label = null;
  if (carrying.seed) {
    emoji = carrying.seed.emoji;
    cropMarker = carrying.seed.marker;
    label = carrying.seed.name;
  }
  else if (carrying.tool === 'water') { emoji = '💧'; label = t && t('garden.tool_label_water'); }
  else if (carrying.tool === 'harvest') { emoji = '🌾'; label = t && t('garden.tool_label_basket'); }
  else if (carrying.tool === 'compost') { emoji = '🪣'; label = t && t('garden.tool_label_compost'); }

  const markerDrawn = cropMarker && renderCropMarker(
    ctx,
    { marker: cropMarker },
    px,
    py - 14 + bob,
  );
  if (!markerDrawn) {
    drawText(ctx, emoji, px, py - 14 + bob, {
      font: '20px sans-serif', align: 'center', baseline: 'middle',
    });
  }

  // A redundant word keeps both seeds and tools identifiable while carried.
  // This matters for crops that share an emoji (lettuce/cabbage and
  // cucumber/courgette) and for tool glyphs that vary across machines.
  if (label) {
    ctx.font = "bold 9px 'Inter', system-ui, sans-serif";
    const lw = Math.ceil(ctx.measureText(label).width) + 10;
    const lh = 13;
    const lx = px - lw / 2;
    const ly = py - 46 + bob;
    drawRoundedRect(ctx, lx, ly, lw, lh, 4, 'rgba(51,105,30,0.92)', '#fff');
    drawText(ctx, label, px, ly + lh / 2 + 0.5, {
      font: "bold 9px 'Inter', system-ui, sans-serif",
      color: '#fff', align: 'center', baseline: 'middle',
    });
  }
}


export function getWateringArcPoints(player, target) {
  let px = OX + player.pixelX + TILE_SIZE / 2;
  let py = OY + player.pixelY + TILE_SIZE / 2 - 4;
  let tx = OX + target.col * TILE_SIZE + TILE_SIZE / 2;
  let ty = OY + target.row * TILE_SIZE + TILE_SIZE / 2;

  // A plot underfoot is valid, but identical start/end coordinates collapse
  // the Bézier into a dot. Offset the nozzle and splash so care stays visible.
  if (player.col === target.col && player.row === target.row) {
    const ownTileOffsets = {
      [DIR.DOWN]: { startX: 10, startY: 0, endX: 0, endY: 14 },
      [DIR.UP]: { startX: -10, startY: -6, endX: 0, endY: 12 },
      [DIR.LEFT]: { startX: -12, startY: 0, endX: 8, endY: 12 },
      [DIR.RIGHT]: { startX: 12, startY: 0, endX: -8, endY: 12 },
    };
    const offset = ownTileOffsets[player.dir] || ownTileOffsets[DIR.DOWN];
    px += offset.startX;
    py += offset.startY;
    tx += offset.endX;
    ty += offset.endY;
  }

  // Curved water arc — quadratic bezier with midpoint above
  const midX = (px + tx) / 2;
  const midY = Math.min(py, ty) - 18;
  return { px, py, tx, ty, midX, midY };
}

// ─── Watering stream: curved hose from player to target plot ─
export function renderWateringStream(ctx, player, target, progress, time) {
  if (!target) return;

  const { px, py, tx, ty, midX, midY } = getWateringArcPoints(player, target);

  // Stream outline (dark)
  ctx.strokeStyle = '#0D47A1';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.quadraticCurveTo(midX, midY, tx, ty);
  ctx.stroke();
  // Stream body (light blue)
  ctx.strokeStyle = '#4FC3F7';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.quadraticCurveTo(midX, midY, tx, ty);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Droplets along the arc (3 animated points)
  for (let i = 0; i < 3; i++) {
    const t = ((time * 1.5 + i * 0.33) % 1);
    const ax = (1 - t) * (1 - t) * px + 2 * (1 - t) * t * midX + t * t * tx;
    const ay = (1 - t) * (1 - t) * py + 2 * (1 - t) * t * midY + t * t * ty;
    ctx.fillStyle = '#81D4FA';
    ctx.beginPath();
    ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ax - 0.5, ay - 0.5, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Splash at target
  for (let i = 0; i < 4; i++) {
    const a = (time * 4 + i * Math.PI / 2) % (Math.PI * 2);
    const r = 6 + 3 * Math.sin(time * 6 + i);
    ctx.fillStyle = `rgba(79, 195, 247, ${0.7 - 0.15 * i})`;
    ctx.beginPath();
    ctx.arc(tx + Math.cos(a) * r, ty + Math.sin(a) * r * 0.6, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Progress ring around a target tile ─────────────────────
export function renderProgressRing(ctx, col, row, progress, color = '#1976D2') {
  const cx = OX + col * TILE_SIZE + TILE_SIZE / 2;
  const cy = OY + row * TILE_SIZE + TILE_SIZE / 2;
  const r = TILE_SIZE / 2 + 4;

  // Background ring (faint)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Progress arc
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + Math.PI * 2 * Math.min(1, Math.max(0, progress));
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Center percentage hint when filling
  if (progress > 0 && progress < 1) {
    const pct = Math.round(progress * 100);
    drawText(ctx, pct + '%', cx, cy - r - 8, {
      font: "bold 11px 'Inter', system-ui, sans-serif",
      color: color, align: 'center', baseline: 'middle',
    });
  }
}

// ─── Phase objective banner: current task instruction ───────
// Different from feedback toast — this is the *persistent* "what to do now".
// Logical y of the step banner: 52 as before, or just below the DOM top bar
// when the bar covers the canvas top (GardenPlanner measures hudTopInset).
export function objectiveBannerTop(state) {
  return Math.max(52, Math.ceil(state?.hudTopInset || 0));
}

export function renderPhaseObjective(ctx, state, t) {
  // Pickup-hose mechanic (2026-05-19): water + harvest tools are no longer
  // auto-equipped. Player must walk to the tool tile and pick it up before
  // they can water/harvest. Objective tells them which step they're at.
  let text = '';
  if (state.phase === 'PLANT') {
    if (!state.carrying?.seed) text = t('garden.obj_pick_seed');
    else text = t('garden.obj_plant_seed');
  } else if (state.phase === 'WATER') {
    if (state.carrying?.tool !== 'water') text = t('garden.obj_pick_can');
    else text = t('garden.obj_water_hold', { round: state.waterRound });
  } else if (state.phase === 'HARVEST') {
    // Smart phase objective — detects when the player has finished one
    // category and needs to switch tools to handle the other.
    const remaining = state.plots.filter(p => p.seed && !p.harvested);
    const healthyLeft = remaining.filter(p => !p.wilted && p.health >= 2).length;
    const wiltedLeft  = remaining.filter(p => p.wilted || p.health < 2).length;

    if (state.carrying?.tool === 'harvest') {
      // Player has 🌾 — direct them either to remaining healthy OR to swap if done with healthy
      if (healthyLeft > 0) text = t('garden.obj_harvest_healthy');
      else if (wiltedLeft > 0) text = t('garden.obj_swap_to_compost');
      else text = t('garden.obj_all_done');
    } else if (state.carrying?.tool === 'compost') {
      // Player has 🪣 — direct them either to remaining wilted OR to swap if done with wilted
      if (wiltedLeft > 0) text = t('garden.obj_compost_wilted');
      else if (healthyLeft > 0) text = t('garden.obj_swap_to_basket');
      else text = t('garden.obj_all_done');
    } else {
      // No tool yet — direct based on what's left
      if (healthyLeft > 0 && wiltedLeft > 0) text = t('garden.obj_pick_tool');
      else if (healthyLeft > 0) text = t('garden.obj_pick_basket');
      else if (wiltedLeft > 0) text = t('garden.obj_pick_bin');
      else text = t('garden.obj_all_done');
    }
  }
  if (!text) {
    state.objectiveBannerRect = null;
    return;
  }

  // Small screens (≈844×390): the banner sits in the left side strip, beside the
  // garden wall and above the d-pad, so no plant, the player or the tool is ever
  // under it. It is hidden while the intro or a card is up (it would otherwise
  // stay readable beside the card). Larger screens: centred under the bar, wider
  // and at least OBJ_MIN_CSS_PX on screen, wrapping to a second line if needed.
  const zones = sideZones(state);
  if (zones && sideMessagesHidden(state)) {
    state.objectiveBannerRect = null;
    return;
  }
  const by = objectiveBannerTop(state);
  const zone = zones?.left;
  const L = objectiveBannerLayout(ctx, text, state.cssScale, zone ? zone.x1 - zone.x0 : undefined);
  const bx = zone ? zone.x0 + (zone.x1 - zone.x0 - L.bw) / 2 : CANVAS_W / 2 - L.bw / 2;
  state.objectiveBannerRect = { x: bx, y: by, w: L.bw, h: L.bh, side: !!zone };
  // Never cut or moved back to the centre: a strip that is too short is reported
  // (tests check it never happens for the real texts) instead of hiding plants.
  state.objectiveSideOverflow = zone ? by + L.bh > zone.y1 : false;

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
  ctx.fillRect(bx + 2, by + 2, L.bw, L.bh);
  // Flat banner
  ctx.fillStyle = WORLD_ART.textGreen;
  ctx.fillRect(bx, by, L.bw, L.bh);
  // Inner highlight stripe
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(bx, by, L.bw, 4);
  // White border
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 1, by + 1, L.bw - 2, L.bh - 2);

  L.lines.forEach((line, i) => {
    drawText(ctx, line, bx + L.bw / 2, by + L.padY + L.lineH * (i + 0.5) + 1, {
      font: L.font, color: '#fff', align: 'center', baseline: 'middle',
    });
  });
}

// Smallest on-screen (CSS px) size of the banner text, like the run-lost card.
export const OBJ_MIN_CSS_PX = 13;
// Layout of the step banner: type grows with the real CSS scale (never below
// OBJ_MIN_CSS_PX on screen, never below the old 12 logical px) and wraps to the
// available width. Full-size screens: CANVAS_W − 40 wide at most.
export function objectiveBannerLayout(ctx, text, cssScale, maxOuter = CANVAS_W - 40) {
  const u = Number.isFinite(cssScale) && cssScale > 0 ? Math.max(1, OBJ_MIN_CSS_PX / (12 * cssScale)) : 1;
  const fs = Math.ceil(12 * u);
  const font = `bold ${fs}px 'Inter', system-ui, sans-serif`;
  const padX = Math.ceil(14 * u);
  const padY = Math.ceil(5 * u);
  const lineH = Math.ceil(fs * 1.25);
  ctx.font = font;
  const lines = wrapKeepingSpaces(ctx, text, maxOuter - padX * 2);
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const bw = Math.ceil(tw + padX * 2);
  const bh = Math.max(24, lines.length * lineH + padY * 2);
  return { font, fs, padX, padY, lineH, lines, bw, bh };
}

// Word wrap that keeps the text exactly as written inside each line (the
// banners use «  ·  » with double spaces); a break drops only the spaces at it.
function wrapKeepingSpaces(ctx, text, maxWidth) {
  const parts = String(text).split(/(\s+)/); // words and the spaces between them
  const lines = [];
  let line = '';
  for (let i = 0; i < parts.length; i += 2) {
    const word = parts[i];
    const sep = i > 0 ? parts[i - 1] : '';
    if (!word) continue;
    const cand = line ? line + sep + word : word;
    if (!line || ctx.measureText(cand).width <= maxWidth) line = cand;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

// Side-strip layout is used only when the canvas is drawn this small (844×390:
// 0.554; 1024×768 is 0.8 and keeps the centred layout).
export const SIDE_LAYOUT_MAX_SCALE = 0.7;
const SIDE_MIN_W = 150;      // logical px a strip needs to be usable
const SIDE_EDGE_CSS = 8;     // CSS px kept from the screen edge and from the controls
const SIDE_WALL_GAP = 6;     // logical px kept from the garden wall
// The two strips beside the garden walls, above the touch controls, in logical
// px: { left, right } or null. Needs what GardenPlanner measures on the page:
// cssScale, cssOriginX (canvas logical x = 0 on screen), cssViewW and the top of
// the left / right control groups (logical y, null when there are none).
export function sideZones(state) {
  const s = state?.cssScale;
  if (!(s > 0 && s < SIDE_LAYOUT_MAX_SCALE) || !Number.isFinite(state.cssOriginX) || !(state.cssViewW > 0)) return null;
  const room = GAME_ROOMS.GardenPlanner;
  const wallL = roomToCanvas(room, OX, 0).x - SIDE_WALL_GAP;
  const wallR = roomToCanvas(room, OX + ROOM_COLS * TILE_SIZE, 0).x + SIDE_WALL_GAP;
  const xMin = (SIDE_EDGE_CSS - state.cssOriginX) / s;
  const xMax = (state.cssViewW - SIDE_EDGE_CSS - state.cssOriginX) / s;
  const top = objectiveBannerTop(state);
  const bottom = (ctrlTop) => (Number.isFinite(ctrlTop) ? ctrlTop : CANVAS_H) - SIDE_EDGE_CSS / s;
  const left = { x0: xMin, x1: wallL, y0: top, y1: bottom(state.ctrlTopLeft) };
  const right = { x0: wallR, x1: xMax, y0: top, y1: bottom(state.ctrlTopRight) };
  if (left.x1 - left.x0 < SIDE_MIN_W || right.x1 - right.x0 < SIDE_MIN_W) return null;
  return { left, right };
}
// In the side layout the banner and the toast are hidden while the intro or a
// card is up (the toast already was, see GardenPlanner's eventActive gate).
export function sideMessagesHidden(state) {
  return !!(state.showMissionIntro || state.decisionEvent || state.pendingEvent || state.runLost);
}

// ─── Decision event card ────────────────────────────────
// Partner "condition appears" Q&A (gardenData DECISION_EVENTS), modal like the
// tutorial. Keyboard: ↑↓ + Enter (GardenPlanner update); click: option rects
// are stashed on state.eventOptionRects for the canvas click handler.
function wrapDecisionText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderDecisionEvent(ctx, state, t) {
  const dev = state.decisionEvent;
  if (!dev) {
    state.eventOptionRects = null;
    return;
  }
  const ev = dev.event;
  const base = `garden.event.${ev.id}`;

  // Dim background (same family as the tutorial, slightly lighter)
  ctx.fillStyle = 'rgba(13, 71, 161, 0.62)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const optH = 44;
  const optGap = 10;
  const panelW = 560;
  const consequenceText = dev.answered ? dev.consequenceText : null;
  ctx.font = "13px 'Inter', system-ui, sans-serif";
  const consequenceLines = consequenceText
    ? wrapDecisionText(ctx, consequenceText, panelW - 112)
    : [];
  const consequenceBoxH = consequenceLines.length
    ? 52 + (consequenceLines.length - 1) * 17
    : 0;
  const panelH = 96 + ev.options.length * (optH + optGap) + 52
    + (consequenceBoxH ? consequenceBoxH + 8 : 0);
  const px = CANVAS_W / 2 - panelW / 2;
  const py = CANVAS_H / 2 - panelH / 2;

  // Chunky shadow and double keyline connect the card to the game's retro UI.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
  ctx.fillRect(px + 7, py + 9, panelW, panelH);
  drawRetroBox(ctx, px, py, panelW, panelH, {
    fill: WORLD_ART.panelCream,
    outer: '#234D2A',
    inner: '#D5B84B',
    radius: 5,
  });

  // Header bar — event emoji + question
  ctx.fillStyle = WORLD_ART.buttonGreen;
  ctx.fillRect(px + 9, py + 9, panelW - 18, 36);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(px + 9, py + 9, panelW - 18, 4);
  ctx.fillStyle = '#D5B84B';
  ctx.fillRect(px + 14, py + 14, 4, 4);
  ctx.fillRect(px + panelW - 18, py + 14, 4, 4);
  drawText(ctx, ev.emoji + ' ' + t(`${base}_q`), CANVAS_W / 2, py + 24, {
    font: "bold 17px 'Inter', system-ui, sans-serif",
    color: '#fff', align: 'center', baseline: 'middle',
  });

  // Option pills
  const rects = [];
  let oy = py + 62;
  ev.options.forEach((opt, i) => {
    const ox = px + 28;
    const ow = panelW - 56;
    const isSel = dev.selected === i;
    let fill = 'rgba(255,255,255,0.9)';
    let border = '#9E9D24';
    let textColor = WORLD_ART.textGreen;
    let mark = '';
    if (!dev.answered) {
      if (isSel) { fill = '#DCEDC8'; border = WORLD_ART.textGreen; }
    } else {
      // Green teaches the stronger choice. Amber keeps the child's own choice
      // visible without turning the answer into a punitive error state.
      if (opt.correct) { fill = '#A5D6A7'; border = '#2E7D32'; mark = ' ✓'; }
      else if (isSel) { fill = '#FFE0A3'; border = '#B26A00'; textColor = '#6D3B00'; }
      else { ctx.globalAlpha = 0.55; }
    }
    ctx.fillStyle = 'rgba(35, 77, 42, 0.18)';
    ctx.fillRect(ox + 3, oy + 3, ow, optH);
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, ox, oy, ow, optH, 4, fill, border);
    ctx.lineWidth = 1;

    const optionCenterY = oy + optH / 2;
    const indicatorCenterX = ox + 20;
    if (!dev.answered && isSel) {
      // A fixed diamond marks keyboard focus without suggesting a dropdown,
      // playback action, countdown, or automatic confirmation.
      const half = 7;
      ctx.fillStyle = WORLD_ART.textGreen;
      ctx.beginPath();
      ctx.moveTo(indicatorCenterX, optionCenterY - half);
      ctx.lineTo(indicatorCenterX + half, optionCenterY);
      ctx.lineTo(indicatorCenterX, optionCenterY + half);
      ctx.lineTo(indicatorCenterX - half, optionCenterY);
      ctx.closePath();
      ctx.fill();
    }

    // Every label uses the same text gutter, selected or not. The indicator is
    // its own visual channel rather than a character prepended to the answer.
    drawText(ctx, opt.emoji + ' ' + t(`${base}_opt_${opt.id}`) + mark,
      ox + 40, optionCenterY, {
        font: `${isSel || (dev.answered && opt.correct) ? 'bold ' : ''}15px 'Inter', system-ui, sans-serif`,
        color: textColor, align: 'left', baseline: 'middle',
      });
    ctx.globalAlpha = 1;
    rects.push({ x: ox, y: oy, w: ow, h: optH, idx: i });
    oy += optH + optGap;
  });
  state.eventOptionRects = dev.answered ? null : rects;

  if (consequenceLines.length) {
    const boxX = px + 38;
    const boxY = oy + 4;
    const boxW = panelW - 76;
    ctx.fillStyle = 'rgba(35, 77, 42, 0.22)';
    ctx.fillRect(boxX + 3, boxY + 3, boxW, consequenceBoxH);
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, boxX, boxY, boxW, consequenceBoxH, 4, '#F2EDC9', '#4E6F2D');
    ctx.lineWidth = 1;
    ctx.fillStyle = '#8AAA4A';
    ctx.fillRect(boxX + 7, boxY + 7, 5, consequenceBoxH - 14);

    drawText(ctx, `🌱 ${t('garden.event.consequence')}`, boxX + 22, boxY + 17, {
      font: "bold 13px 'Inter', system-ui, sans-serif",
      color: '#315A25', align: 'left', baseline: 'middle',
    });
    consequenceLines.forEach((line, i) => {
      drawText(ctx, line, boxX + 22, boxY + 39 + i * 17, {
        font: "13px 'Inter', system-ui, sans-serif",
        color: '#3F4A2E', align: 'left', baseline: 'middle',
      });
    });
  }

  // Bottom hint — pick vs continue (pulse like the tutorial dismiss line)
  const hint = dev.answered
    ?  t('garden.event.continue')
    : t('garden.event.pick_hint');
  const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 250);
  ctx.globalAlpha = dev.answered ? pulse : 0.9;
  drawText(ctx, hint, CANVAS_W / 2, py + panelH - 24, {
    font: "bold 14px 'Inter', system-ui, sans-serif",
    color: WORLD_ART.textGreen, align: 'center', baseline: 'middle',
  });
  ctx.globalAlpha = 1;
}

// ─── Logical → CSS geometry of the game canvas ──
// utils/hidpi.js draws with ONE uniform scale k (the smaller of width / height)
// and centres the 1280×704 picture with offsets (ox, oy), all in backing-store
// pixels. The on-screen size of one logical pixel is therefore k × (CSS px per
// backing px), not rect.width / 1280: on 844×390 that width-only ratio says
// 0.659, while the picture is really drawn at 390/704 ≈ 0.554. The logical
// origin sits oy backing px below the element's top (letterbox). Read-only:
// the shared HiDPI mechanism is not changed. Without HiDPI geometry (?hidpi=0,
// unit stubs) the old element-width ratio is kept.
export function canvasCssGeometry(canvas, rect, logicalW = CANVAS_W) {
  if (!canvas || !rect || !rect.width || !rect.height || !canvas.width || !canvas.height) return null;
  const h = canvas.__hidpi;
  if (h && Number.isFinite(h.k) && h.k > 0) {
    const fx = rect.width / canvas.width;
    const fy = rect.height / canvas.height;
    return {
      scale: h.k * fx,
      originX: rect.left + (h.ox || 0) * fx,
      originY: rect.top + (h.oy || 0) * fy,
    };
  }
  return { scale: rect.width / logicalW, originX: rect.left, originY: rect.top };
}

// Logical y below which the step banner may start: 6 CSS px under the DOM bar.
export function hudTopInsetFor(geom, barBottom, gapCssPx = 6) {
  if (!geom || !(geom.scale > 0)) return 0;
  return Math.max(0, (barBottom + gapCssPx - geom.originY) / geom.scale);
}

// ─── Run-lost card ───────────────────────────────
// Smallest on-screen (CSS px) size for the card's body text; the title and
// hint keep their proportions to it (17 / 15 / 14 logical at full size).
export const RUN_LOST_MIN_BODY_CSS_PX = 14;
export function runLostCardScale(cssScale) {
  if (!Number.isFinite(cssScale) || cssScale <= 0) return 1;
  return Math.max(1, RUN_LOST_MIN_BODY_CSS_PX / (15 * cssScale));
}

// Shown on the planting that makes 5 healthy harvests unreachable. Same retro
// card family as the decision event; warm amber instead of green so it reads
// as "this round is over", not as a quiz. No timer: the hint at the bottom is
// the only way out (Enter / Space / touch A, or a tap on the card).
export function renderRunLostCard(ctx, state, strings) {
  const lost = state.runLost;
  if (!lost) {
    state.runLostRect = null;
    return;
  }
  ctx.save();
  ctx.fillStyle = 'rgba(62, 39, 35, 0.62)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // The canvas is drawn at ≈0.55 on 844×390, which left this card's
  // text at ≈8 px. Grow the card's type (and the card) so the body reads at
  // ≥ RUN_LOST_MIN_BODY_CSS_PX on screen; full size screens stay as they were.
  const u = runLostCardScale(state.cssScale);
  const px_ = (n) => Math.ceil(n * u); // ceil: never under the readable floor
  const titleFont = `bold ${px_(17)}px 'Inter', system-ui, sans-serif`;
  const wrongFont = `bold ${px_(15)}px 'Inter', system-ui, sans-serif`;
  const bodyFont = `${px_(15)}px 'Inter', system-ui, sans-serif`;
  const hintFont = `bold ${px_(14)}px 'Inter', system-ui, sans-serif`;
  // Grown cards are a little narrower (560 instead of 600 before scaling): at the
  // real 844×390 scale (≈0.554) a 600-wide card and its shadow reached into the
  // d-pad column; 560 keeps the whole card between the touch-control columns and
  // lets the text wrap one line more. Full-size screens (u = 1) keep 600.
  const panelW = Math.min(CANVAS_W - 60, u > 1 ? px_(560) : 600);
  const innerW = panelW - px_(80);
  ctx.font = wrongFont;
  const wrongLines = lost.wrongLine ? wrapDecisionText(ctx, lost.wrongLine, innerW) : [];
  ctx.font = bodyFont;
  const bodyLines = wrapDecisionText(ctx, strings.lostBody(lost.wilted), innerW);
  const lineH = px_(21);
  const headH = px_(38);
  const panelH = px_(64) + (wrongLines.length + bodyLines.length) * lineH
    + (wrongLines.length ? px_(12) : 0) + px_(58);
  const px = CANVAS_W / 2 - panelW / 2;
  const py = CANVAS_H / 2 - panelH / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
  ctx.fillRect(px + 7, py + 9, panelW, panelH);
  drawRetroBox(ctx, px, py, panelW, panelH, {
    fill: WORLD_ART.panelCream,
    outer: '#6D3B00',
    inner: '#D5B84B',
    radius: 5,
  });
  ctx.fillStyle = '#B26A00';
  ctx.fillRect(px + 9, py + 9, panelW - 18, headH);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(px + 9, py + 9, panelW - 18, 4);
  drawText(ctx, strings.lostTitle, CANVAS_W / 2, py + 9 + headH / 2, {
    font: titleFont,
    color: '#fff', align: 'center', baseline: 'middle',
  });

  let y = py + px_(74);
  wrongLines.forEach((line) => {
    drawText(ctx, line, CANVAS_W / 2, y, {
      font: wrongFont,
      color: '#8A3B00', align: 'center', baseline: 'middle',
    });
    y += lineH;
  });
  if (wrongLines.length) y += px_(12);
  bodyLines.forEach((line) => {
    drawText(ctx, line, CANVAS_W / 2, y, {
      font: bodyFont,
      color: '#3F4A2E', align: 'center', baseline: 'middle',
    });
    y += lineH;
  });

  // The hint is the only way out, so it does not fade below full contrast.
  const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 250);
  ctx.globalAlpha = pulse;
  drawText(ctx, strings.lostContinue, CANVAS_W / 2, py + panelH - px_(26), {
    font: hintFont,
    color: WORLD_ART.textGreen, align: 'center', baseline: 'middle',
  });
  ctx.globalAlpha = 1;
  ctx.restore();
  state.runLostRect = { x: px, y: py, w: panelW, h: panelH };
}

// ─── Feedback toast (with optional educational hint) ────────
// Slim in-band strip sized to fit the 480px center gap between the NW and NE
// season beds (screen-x ~400..880 at 1.5x camera). Width is dynamic, capped
// at 440px so it stays inside that gap with margin. Grows downward to fit the
// edu line; source pill is re-measured each frame so the click hit-test is exact.
// Longest a fact line may run inside the toast. It used to be three lines, cut with
// no marker, so a slightly longer translation lost its ending in silence: the Three
// Sisters card ended mid-sentence in EL, NL and PT and nothing said so. Four lines
// fit the plain sentences in all four locales, and anything past the cap now ends in
// an ellipsis so a truncation is at least visible.
const MAX_EDU_LINES = 4;
const capEduLines = (lines) => {
  if (lines.length <= MAX_EDU_LINES) return lines;
  const kept = lines.slice(0, MAX_EDU_LINES);
  kept[MAX_EDU_LINES - 1] = kept[MAX_EDU_LINES - 1].replace(/[.,;:]?$/, '…');
  return kept;
};

// Side messages target 13/12/11 CSS px for main/fact/source. A long combination
// fits its measured height at floors 10.5/9.5/9.5, with every line preserved.
// The source label wraps too; desktop rendering keeps its previous sizes.
export function feedbackToastLayout(ctx, { text, eduText = null, sourceLabel = '' }, maxW = 440, { capLines = true, cssScale = null, maxHeight = Infinity, fit = 1 } = {}) {
  const small = Number.isFinite(cssScale) && cssScale > 0 && cssScale < SIDE_LAYOUT_MAX_SCALE;
  const size = (base, target, floor = target) => small ? Math.max(base, Math.ceil(Math.max(floor, target * fit) / cssScale)) : base;
  const mainFont = `bold ${size(15, 13, 10.5)}px 'Inter', system-ui, sans-serif`;
  const eduFont = `${size(13, 12, 9.5)}px 'Inter', system-ui, sans-serif`;
  const sourceFont = `bold ${size(11, 11, 9.5)}px 'Inter', system-ui, sans-serif`;
  const hPad = small ? 12 : 24;
  const vPad = small ? 8 : 12;
  const innerW = maxW - hPad * 2;
  const mainLineH = small ? Math.ceil(size(15, 13, 10.5) * 1.16) : 19;
  const eduLineH = small ? Math.ceil(size(13, 12, 9.5) * 1.18) : 18;
  const sourceLineH = small ? Math.ceil(size(11, 11, 9.5) * 1.18) : 20;
  const wrap = (value, font, width) => {
    ctx.font = font;
    return wrapDecisionText(ctx, value, width);
  };
  const mainLines = wrap(text, mainFont, innerW);
  let eduLines = eduText ? wrap(eduText, eduFont, innerW) : [];
  if (capLines) eduLines = capEduLines(eduLines);
  const sourceLines = sourceLabel ? wrap(sourceLabel, sourceFont, innerW - 16) : [];
  const measure = (lines, font) => {
    ctx.font = font;
    return Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
  };
  const sourceW = sourceLines.length ? measure(sourceLines, sourceFont) + (small ? 16 : 20) : 0;
  const fbW = Math.min(maxW, Math.max(measure(mainLines, mainFont), measure(eduLines, eduFont), sourceW) + hPad * 2);
  const mainH = mainLines.length * mainLineH;
  const eduH = eduLines.length * eduLineH;
  const sourceH = sourceLines.length ? (small ? sourceLines.length * sourceLineH + 8 : 20) : 0;
  const gap = small ? 6 : 8;
  const sourceGap = small ? 6 : 6;
  const fbH = Math.max(44, vPad * 2 + mainH + (eduLines.length ? gap + eduH : 0) + (sourceH ? sourceGap + sourceH : 0));
  if (small && fbH > maxHeight && fit > 0.79) {
    return feedbackToastLayout(ctx, { text, eduText, sourceLabel }, maxW, { capLines, cssScale, maxHeight, fit: fit - 0.04 });
  }
  return { mainLines, eduLines, sourceLines, fbW, fbH, mainLineH, mainH, eduLineH, eduH, sourceLineH, sourceH, sourceW,
    mainFont, eduFont, sourceFont, vPad, gap, sourceGap, small };
}

export function renderFeedbackToast(ctx, state, t = null) {
  if (!state.feedbackText || state.feedbackTimer <= 0) {
    state.sourceBadgeRect = null;
    return;
  }
  const alpha = Math.min(1, state.feedbackTimer / 0.3);
  ctx.globalAlpha = alpha;

  const hasEdu = !!state.feedbackEduText;
  const hasSource = !!state.feedbackSourceId; // verbatim fact with a public source
  const sourceLabel = hasSource
    ? `${(t && t('result.source_link')) || 'source ↗'} · ${(t && t('garden.press_s')) || 'Press S'}`
    : '';

  // Small screens: the right side strip, above the A/B buttons, full text (no
  // 4-line cap). Elsewhere: centred under the banner, as before (≤ 440 wide).
  const zones = sideZones(state);
  const zone = zones?.right;
  const T = feedbackToastLayout(ctx, {
    text: state.feedbackText, eduText: hasEdu ? state.feedbackEduText : null, sourceLabel,
  }, zone ? Math.floor(zone.x1 - zone.x0) : 440, { capLines: !zone, cssScale: zone ? state.cssScale : null, maxHeight: zone ? zone.y1 - zone.y0 - 3 : Infinity });
  const { mainLines, eduLines, fbW, fbH, mainLineH, mainH } = T;
  const fbX = zone ? zone.x0 + (zone.x1 - zone.x0 - fbW) / 2 : (CANVAS_W - fbW) / 2;
  const fbCx = fbX + fbW / 2;
  // below the banner (80 when a one-line banner sits at 52)
  const fbY = zone ? zone.y0 : objectiveBannerTop(state) + (state.objectiveBannerRect?.h || 24) + 4;
  state.feedbackRect = { x: fbX, y: fbY, w: fbW, h: fbH, side: !!zone };
  state.feedbackSideOverflow = zone ? fbY + fbH > zone.y1 : false;

  // Shadow
  drawRoundedRect(ctx, fbX + 2, fbY + 3, fbW, fbH, 10, 'rgba(0,0,0,0.25)', 'transparent');
  drawRoundedRect(ctx, fbX, fbY, fbW, fbH, 10, 'rgba(255,255,255,0.97)', state.feedbackColor || WORLD_ART.textGreen);

  const mainStartY = fbY + T.vPad + mainLineH / 2;
  mainLines.forEach((line, index) => {
    drawText(ctx, line, fbCx, mainStartY + index * mainLineH, {
      font: T.mainFont,
      color: state.feedbackColor || WORLD_ART.textGreen, align: 'center', baseline: 'middle',
    });
  });
  const eduStartY = fbY + T.vPad + mainH + T.gap + T.eduLineH / 2;
  eduLines.forEach((line, i) => {
    drawText(ctx, line, fbCx, eduStartY + i * T.eduLineH, {
      font: T.eduFont,
      color: WORLD_ART.textGreen, align: 'center', baseline: 'middle',
    });
  });

  // Clickable "source" pill, only on verbatim-fact toasts. Re-measured each
  // frame relative to the current (dynamic) fbW so the click hit-test stays exact.
  if (hasSource) {
    const pw = T.sourceW;
    const ph = T.sourceH;
    const px = fbCx - pw / 2;
    const py = fbY + fbH - ph - (T.small ? T.vPad : 6);
    drawRoundedRect(ctx, px, py, pw, ph, 10, '#3C743B', 'transparent');
    T.sourceLines.forEach((line, i) => drawText(ctx, line, fbCx, py + (ph - T.sourceLines.length * T.sourceLineH) / 2 + T.sourceLineH * (i + 0.5) + (T.small ? 0 : 0.5), {
      font: T.sourceFont, color: '#FFFFFF', align: 'center', baseline: 'middle',
    }));
    state.sourceBadgeRect = { x: px, y: py, w: pw, h: ph };
  } else {
    state.sourceBadgeRect = null;
  }
  ctx.globalAlpha = 1;
}
