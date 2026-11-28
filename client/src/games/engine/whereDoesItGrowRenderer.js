// whereDoesItGrowRenderer.js — visuals unique to G1.1 Where Does It Grow.
// Everything else (background, tiles, player, held item, prompt, particles,
// iris wipe) is reused from gameRoomRenderer. Pure (ctx, state) draw functions.

import { OX, OY } from './gameRoomRenderer.js';
import { TILE_SIZE as TS } from './gameRoomLogic.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { drawRoundedRect, drawText } from '../../utils/canvas.js';
import { SOURCES } from '../../data/sources.js';
import { BRAND, WORLD_ART } from '../../styles/brandColors.js';
import { canvasCssScale, readableUnit } from '../../utils/hidpi.js';

// Official Island-1 brand greens (brandColors.js).
const GREEN = BRAND.green;          // #6DB06C
const FOLIAGE = WORLD_ART.foliageMid; // #5D965C
const DIRT = WORLD_ART.dirtAccent;    // #7A5C40

// Warm, inclusive garden palette per spot (not "boyish").
const SPOT_THEME = {
  tree:  { fill: 'rgba(63,155,109,0.92)',  border: '#2c7a54', label: '#ffffff' }, // leaf green
  vine:  { fill: 'rgba(124,179,66,0.92)',  border: '#558b2f', label: '#ffffff' }, // vine green
  soil:  { fill: 'rgba(122,82,48,0.92)',   border: '#5d4037', label: '#ffffff' }, // brown soil
  grain: { fill: 'rgba(244,183,64,0.95)',  border: '#b8860b', label: '#5b4300' }, // gold field
};

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

// ─── Spot bed texture ────────────────────────────────────
// Subtle per-patch detailing so each spot reads as a real garden bed and
// not a flat rounded-rect. Drawn clipped to the patch so it stays inside.

function drawBedTexture(ctx, spot, x, y, w, h) {
  ctx.save();
  // Clip to the patch rounded-rect so texture never bleeds outside.
  ctx.beginPath();
  const r = 12;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.clip();

  if (spot.key === 'soil') {
    // Dug bed: horizontal furrows + a few tiny seeds/sprout dots.
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    const furrows = 3;
    for (let i = 1; i <= furrows; i++) {
      const fy = y + (h * i) / (furrows + 1);
      ctx.beginPath();
      ctx.moveTo(x + 6, fy);
      ctx.lineTo(x + w - 6, fy);
      ctx.stroke();
      // Soft highlight just under each furrow (raised earth).
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.moveTo(x + 6, fy + 2);
      ctx.lineTo(x + w - 6, fy + 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    }
    // A scatter of seeds and one tiny sprout in the furrows.
    const dots = [
      { dx: 0.28, dy: 0.32, seed: true },
      { dx: 0.62, dy: 0.30, seed: true },
      { dx: 0.45, dy: 0.58, seed: false },
      { dx: 0.74, dy: 0.62, seed: true },
      { dx: 0.30, dy: 0.78, seed: false },
    ];
    for (const d of dots) {
      const dx = x + w * d.dx;
      const dy = y + h * d.dy;
      if (d.seed) {
        ctx.fillStyle = '#3e2c1a';
        ctx.beginPath();
        ctx.arc(dx, dy, 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // tiny two-leaf sprout
        ctx.strokeStyle = GREEN;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(dx, dy + 3);
        ctx.lineTo(dx, dy - 3);
        ctx.stroke();
        ctx.fillStyle = FOLIAGE;
        ctx.beginPath();
        ctx.ellipse(dx - 2, dy - 2, 2, 1.2, -0.6, 0, Math.PI * 2);
        ctx.ellipse(dx + 2, dy - 2, 2, 1.2, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (spot.key === 'grain') {
    // Field: faint vertical stalks.
    ctx.strokeStyle = 'rgba(120,90,10,0.22)';
    ctx.lineWidth = 1.5;
    const stalks = Math.floor(w / 10);
    for (let i = 0; i < stalks; i++) {
      const gx = x + 6 + i * 10;
      ctx.beginPath();
      ctx.moveTo(gx, y + h - 6);
      ctx.lineTo(gx, y + 8);
      ctx.stroke();
    }
  } else {
    // tree / vine: dappled leaf shading dots.
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    const dapples = [
      [0.25, 0.30], [0.70, 0.28], [0.50, 0.55], [0.32, 0.72], [0.74, 0.68],
    ];
    for (const [px, py] of dapples) {
      ctx.beginPath();
      ctx.arc(x + w * px, y + h * py, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Inner top highlight on every bed so it reads as a raised, lit surface.
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x + 2, y + 2, w - 4, Math.min(10, h / 4));
  ctx.restore();
}

/**
 * The 4 growing spots — a labelled "patch" the player walks to and faces.
 * Pulses the correct spot's border when state.hintSpotKey is set (wrong-answer hint).
 */
// Beds whose top row is at or above this row get a side-pointing hint arrow.
const TOP_BED_MAX_ROW = 4;
const ROOM_COLS = 20;

export function renderGrowingSpots(ctx, state) {
  if (!state.spots) return;
  const sx = state.screenShake || 0;

  for (const spot of state.spots) {
    const theme = SPOT_THEME[spot.key] || SPOT_THEME.tree;
    const b = tilesBounds(spot.tiles);

    // Pixel rect for the tile group, padded a little so the patch reads as a "bed".
    const pad = 8;
    const x = OX + b.minCol * TS - pad + sx;
    const y = OY + b.minRow * TS - pad;
    const w = (b.maxCol - b.minCol + 1) * TS + pad * 2;
    const h = (b.maxRow - b.minRow + 1) * TS + pad * 2;
    const cx = x + w / 2;

    // Soft ground shadow under the bed (grounds it in the scene).
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, y + h - 2, w / 2 - 2, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Hint on the correct spot after a wrong drop — a glowing ring plus a
    // bobbing arrow that clearly says "plant it HERE" (kids need an unmissable nudge).
    if (state.hintSpotKey === spot.key) {
      const pulse = 0.5 + Math.sin(state.time * 6) * 0.5;
      ctx.save();
      ctx.shadowColor = 'rgba(249,168,37,0.9)';
      ctx.shadowBlur = 14 + pulse * 16;
      drawRoundedRect(ctx, x - 6, y - 6, w + 12, h + 12, 18,
        `rgba(255,235,59,${0.3 + pulse * 0.4})`, '#F9A825');
      ctx.restore();
      // Bobbing arrow pointing at the bed. Bottom beds: above, pointing down.
      // Top beds: from the inner side (toward the room centre), because the
      // "Now planting" chip and its 💡 line sit over the space above them.
      const bobA = Math.sin(state.time * 6) * 5;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000'; // opaque — full-colour emoji
      ctx.font = '26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (b.minRow <= TOP_BED_MAX_ROW) {
        const roomCentreX = OX + (ROOM_COLS * TS) / 2;
        if (cx < roomCentreX) ctx.fillText('👈', x + w + 30 + bobA, y + h / 2);
        else ctx.fillText('👉', x - 30 - bobA, y + h / 2);
      } else {
        ctx.fillText('👇', cx, y - 18 + bobA);
      }
    }

    // Patch + bed texture/shading.
    drawRoundedRect(ctx, x, y, w, h, 12, theme.fill, theme.border);
    drawBedTexture(ctx, spot, x, y, w, h);

    // Centred icon, gently bobbing. Skipped for soil (tractor instead) and grain
    // (swaying wheat instead) so they read as live, working beds — not flat icons.
    const bob = Math.sin(state.time * 2 + b.minCol) * 1.5;
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (spot.key !== 'soil' && spot.key !== 'grain') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000'; // opaque — keep the emoji at full colour/opacity
      ctx.fillText(spot.emoji, cx, y + h / 2 + bob);
    }

    // Per-spot ambient life — slow, opaque, thematic, kept above the label pill.
    const cyc = y + h / 2;
    const ang = state.time * 0.5 + b.minCol * 0.7; // slow, calm orbit
    const orbX = cx + Math.cos(ang) * (w / 2 + 15);
    const orbY = cyc + Math.sin(ang) * (h / 2 - 2);

    // Grain: wind-swept wheat (drawn under the bird).
    if (spot.key === 'grain') {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      const n = 5;
      for (let i = 0; i < n; i++) {
        const sxp = x + w * (0.22 + 0.56 * (i / (n - 1)));
        const sway = Math.sin(state.time * 1.0 + i * 0.9) * 4;
        ctx.beginPath();
        ctx.moveTo(sxp, y + h - 7);
        ctx.quadraticCurveTo(sxp + sway, y + h * 0.5, sxp + sway * 1.5, y + h * 0.3);
        ctx.stroke();
        ctx.fillStyle = '#e6c24f';
        ctx.beginPath();
        ctx.ellipse(sxp + sway * 1.5, y + h * 0.28, 3, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Tree: a few leaves gently drifting down and looping (fits a tree better than a bird).
    if (spot.key === 'tree') {
      const leaves = 3;
      for (let i = 0; i < leaves; i++) {
        const fall = (state.time * 0.32 + i / leaves) % 1; // 0..1 down the bed
        const lx = x + w * (0.28 + 0.44 * (i / (leaves - 1))) + Math.sin(state.time * 1.4 + i) * 6;
        const ly = y + 8 + fall * (h - 16);
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000';
        ctx.translate(lx, ly);
        ctx.rotate(Math.sin(state.time * 2 + i) * 0.6);
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🍃', 0, 0);
        ctx.restore();
      }
    }

    // Orbiting critter — all are HELPERS (never pests): the tractor tends the soil,
    // the ladybug eats aphids on the vine, the bee pollinates around the grain field.
    const CRITTER = { soil: '🚜', vine: '🐞', grain: '🐝' };
    const critter = CRITTER[spot.key];
    if (critter) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(orbX, orbY + 10, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000'; // opaque — else the shadow alpha bleeds into the emoji
      ctx.translate(orbX, orbY);
      if (Math.sin(ang) < 0) ctx.scale(-1, 1); // face the travel direction
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(critter, 0, 0);
      ctx.restore();
    }

    // Label on a small high-contrast pill below the patch
    const label = spot.label || spot.key;
    ctx.font = "bold 12px 'Inter', system-ui, sans-serif";
    const lw = ctx.measureText(label).width + 18;
    drawRoundedRect(ctx, cx - lw / 2, y + h + 4, lw, 20, 10, 'rgba(0,0,0,0.55)', 'transparent');
    drawText(ctx, label, cx, y + h + 14, {
      font: "bold 12px 'Inter', system-ui, sans-serif",
      color: theme.label === '#5b4300' ? '#fff' : theme.label,
      align: 'center',
      baseline: 'middle',
    });
  }
}

// ─── Grow animation (correct-placement reward) ───────────
// On a correct placement the component calls addGrowAnim(state, px, py).
// A short (~0.6s) seed → sprout → little-plant pop in brand greens — the
// visual answer to the spec's "how it develops biologically".

const GROW_DURATION = 0.6;

export function addGrowAnim(state, px, py) {
  if (!state.growAnims) state.growAnims = [];
  state.growAnims.push({ x: px, y: py, t: 0 });
}

export function updateGrowAnims(state, dt) {
  if (!state.growAnims || state.growAnims.length === 0) return;
  for (const a of state.growAnims) a.t += dt;
  state.growAnims = state.growAnims.filter((a) => a.t < GROW_DURATION);
}

export function renderGrowAnims(ctx, state) {
  if (!state.growAnims) return;
  for (const a of state.growAnims) {
    const p = Math.min(1, a.t / GROW_DURATION); // 0..1
    // Ease-out pop.
    const ease = 1 - Math.pow(1 - p, 3);

    ctx.save();
    ctx.translate(a.x, a.y);

    if (p < 0.3) {
      // Phase 1: seed lifts out of the ground.
      const lift = (p / 0.3) * 6;
      ctx.fillStyle = '#3e2c1a';
      ctx.beginPath();
      ctx.ellipse(0, -lift, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Phase 2-3: stem grows, then leaves unfurl with a little overshoot.
      const stemH = ease * 22;
      const grown = Math.max(0, (p - 0.3) / 0.7);
      // overshoot bounce on final scale
      const overshoot = 1 + Math.sin(grown * Math.PI) * 0.18;

      // Stem
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -stemH);
      ctx.stroke();

      // Leaves (two), scale in.
      const leaf = grown * overshoot;
      ctx.fillStyle = FOLIAGE;
      ctx.beginPath();
      ctx.ellipse(-6 * leaf, -stemH + 4, 6 * leaf, 3 * leaf, -0.7, 0, Math.PI * 2);
      ctx.ellipse(6 * leaf, -stemH + 4, 6 * leaf, 3 * leaf, 0.7, 0, Math.PI * 2);
      ctx.fill();

      // Tiny top bud once mostly grown.
      if (grown > 0.6) {
        ctx.fillStyle = GREEN;
        ctx.beginPath();
        ctx.arc(0, -stemH - 2, 3 * leaf, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

// ─── Ambient motion (living scene) ───────────────────────
// Gentle grass sway across the bed + an animated bee and butterfly doing a
// soft flutter/bob loop. Driven entirely by state.time (no per-frame state),
// kept cheap for school laptops. The static 🐝/🦋 decorations were moved out
// of gameRoomData.WhereDoesItGrow.decorations so nothing double-draws.

function drawGrassTuft(ctx, x, y, sway) {
  ctx.strokeStyle = FOLIAGE;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 3, y);
    ctx.quadraticCurveTo(x + i * 3 + sway, y - 5, x + i * 3 + sway * 1.6, y - 10);
    ctx.stroke();
  }
}

function drawBee(ctx, x, y, wingFlap) {
  ctx.save();
  ctx.translate(x, y);
  // wings
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  const wy = 2 + wingFlap * 2;
  ctx.beginPath();
  ctx.ellipse(-2, -wy, 3, 2, -0.5, 0, Math.PI * 2);
  ctx.ellipse(2, -wy, 3, 2, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = '#F4B740';
  ctx.beginPath();
  ctx.ellipse(0, 0, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // stripes
  ctx.strokeStyle = '#3e2c1a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-1, -3); ctx.lineTo(-1, 3);
  ctx.moveTo(2, -2.6); ctx.lineTo(2, 2.6);
  ctx.stroke();
  ctx.restore();
}

function drawButterfly(ctx, x, y, wingFlap) {
  ctx.save();
  ctx.translate(x, y);
  const open = 0.4 + wingFlap * 0.6; // wing openness
  ctx.fillStyle = '#9C6ADE'; // soft purple, brand-adjacent
  // upper wings
  ctx.beginPath();
  ctx.ellipse(-5 * open, -2, 5 * open, 4, -0.4, 0, Math.PI * 2);
  ctx.ellipse(5 * open, -2, 5 * open, 4, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // lower wings
  ctx.fillStyle = '#C9A9F0';
  ctx.beginPath();
  ctx.ellipse(-4 * open, 3, 3.5 * open, 3, -0.3, 0, Math.PI * 2);
  ctx.ellipse(4 * open, 3, 3.5 * open, 3, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = '#3e2c1a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Grass tufts — BACKGROUND layer. Drawn BEFORE the beds so the spot labels
// always render on top and stay readable (no grass over the names).
export function renderAmbientGrass(ctx, state) {
  const t = state.time || 0;
  const baseY = OY + 13.6 * TS; // very bottom band, clear of the spot labels
  for (let i = 0; i < 9; i++) {
    const gx = OX + TS + i * (TS * 1.9);
    const phase = t * 1.4 + i * 0.8;
    const sway = Math.sin(phase) * 2.2;
    drawGrassTuft(ctx, gx, baseY, sway);
  }
}

// Bee + butterfly — FOREGROUND. They fly in the open sky band, never over labels.
export function renderAmbientMotion(ctx, state) {
  const t = state.time || 0;

  // Bee: lazy looping path on the right, wings flapping fast.
  const beeX = OX + 17 * TS - Math.cos(t * 0.6) * 26;
  const beeY = OY + 6.8 * TS + Math.sin(t * 1.1) * 14;
  drawBee(ctx, beeX, beeY, Math.abs(Math.sin(t * 16)));

  // Butterfly: gentler drift on the left, slow wing flutter.
  const flyX = OX + 2.2 * TS + Math.sin(t * 0.5) * 22;
  const flyY = OY + 6.5 * TS + Math.cos(t * 0.8) * 16;
  drawButterfly(ctx, flyX, flyY, Math.abs(Math.sin(t * 5)));
}

// Word-wrap a string to fit maxWidth at the current ctx.font.
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

/**
 * "Did you know?" reveal card — verbatim quote + source badge.
 * In-canvas, legible, dims the scene behind. Component pre-translates
 * state.revealTitle / state.revealDismiss and sets
 * state.reveal = { quote, sourceId, scope }.
 *
 * scope ('item' | 'category' | 'general'): a 'general' fact gets a small
 * "🌍 για το φαγητό γενικά" sub-label so it never reads as being about the
 * specific held item. Every render also writes state.sourceBadgeRect
 * {x,y,w,h} (canvas px) so the component can hit-test clicks on the 📚 badge.
 */
export function renderRevealCard(ctx, state) {
  if (!state.reveal) return;
  // `paraphrase: true` = the body is OUR plain sentence for ages 9 to 14, not the
  // source's words, so it is set upright and unquoted:
  // quotation marks would pass our wording off as the source's. The verbatim
  // passage is still one keypress away on the same card, behind the source badge.
  // Games that still show a verbatim quote omit the flag and render unchanged.
  const { quote, sourceId, scope, lead, tone, title, paraphrase, takeaway } = state.reveal;
  const sourceTitle = SOURCES[sourceId]?.title || '';
  const isGeneral = scope === 'general';
  // A 'warning' reveal (chemical / soil-crash) gets a distinct red header + border so it
  // never reads like the cheerful heal reward. Default tone leaves the card unchanged.
  const isWarning = tone === 'warning';
  const headerEmoji = isWarning ? '⚠️' : '🌱';
  const headerColor = isWarning ? '#C62828' : WORLD_ART.textGreen;
  const cardBorder = isWarning ? '#C62828' : '#6D4C41';
  const headerText = title || state.revealTitle || 'Did you know?';

  // Dim
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Card
  const cardW = 600;
  const padX = 28;
  // Optional lead-in instruction line above the verbatim quote (e.g. Soil Doctor's
  // "heal each one the natural way" framing). Omitted (leadH 0) when no lead is set,
  // so games without it (WhereDoesItGrow) render unchanged.
  ctx.font = "600 14px 'Inter', system-ui, sans-serif";
  const leadLines = lead ? wrapText(ctx, lead, cardW - padX * 2) : [];
  const leadH = leadLines.length ? leadLines.length * 20 + 10 : 0;
  const bodyFont = paraphrase
    ? "18px 'Inter', system-ui, sans-serif"
    : "italic 18px 'Inter', system-ui, sans-serif";
  ctx.font = bodyFont;
  const lines = wrapText(ctx, paraphrase ? quote : `“${quote}”`, cardW - padX * 2);
  const quoteH = lines.length * 26;
  const subH = isGeneral ? 22 : 0; // optional scope sub-label row
  // Optional one-line takeaway under the body (Soil Doctor heal cards: "healthy
  // soil → strong plants → more nutritious food"). Omitted everywhere else.
  const takeH = takeaway ? 44 : 0;
  const cardH = 56 + subH + leadH + quoteH + takeH + 78; // title + (sub) + (lead) + quote + (takeaway) + footer
  const cardX = CANVAS_W / 2 - cardW / 2;
  const cardY = CANVAS_H / 2 - cardH / 2;

  // On phone landscape the card grows around the canvas centre so its 12 px footer reads ≥ 12 CSS px.
  const u = Math.min(readableUnit(canvasCssScale(ctx.canvas), 12, 12), (CANVAS_W - 40) / cardW, (CANVAS_H - 20) / cardH);
  const scaled = (v, c) => c + (v - c) * u;
  ctx.save();
  ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
  ctx.scale(u, u);
  ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);

  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 18,
    'rgba(255,248,225,0.98)', cardBorder);

  // Title
  drawText(ctx, `${headerEmoji} ${headerText}`, CANVAS_W / 2, cardY + 26, {
    font: "bold 20px 'Inter', system-ui, sans-serif",
    color: headerColor,
    align: 'center',
    baseline: 'middle',
  });

  // Reading order: when a lead line exists ("Correct! X grows on Y"), it comes
  // FIRST and the 🌍 general-scope sub-label moves down to sit against the quote
  // it disclaims — otherwise the disclaimer would visually label the praise line.
  const subY = leadLines.length ? cardY + 56 + leadH + 2 : cardY + 50;
  if (isGeneral && state.revealGeneralLabel) {
    drawText(ctx, `🌍 ${state.revealGeneralLabel}`, CANVAS_W / 2, subY, {
      font: "600 13px 'Inter', system-ui, sans-serif",
      color: WORLD_ART.dirtAccent,
      align: 'center',
      baseline: 'middle',
    });
  }

  // Lead-in instruction (non-italic), drawn above the (sub-label +) quote.
  if (leadLines.length) {
    let ly = cardY + 56 + 8;
    for (const ln of leadLines) {
      drawText(ctx, ln, CANVAS_W / 2, ly, {
        font: "600 14px 'Inter', system-ui, sans-serif",
        color: WORLD_ART.panelBrown,
        align: 'center',
        baseline: 'middle',
      });
      ly += 20;
    }
  }

  // Body: the verbatim quote, or our plain sentence when `paraphrase` is set.
  let qy = cardY + 56 + subH + leadH + 13;
  for (const ln of lines) {
    drawText(ctx, ln, CANVAS_W / 2, qy, {
      font: bodyFont,
      color: WORLD_ART.panelBrownDeep,
      align: 'center',
      baseline: 'middle',
    });
    qy += 26;
  }

  if (takeaway) {
    ctx.font = "bold 15px 'Inter', system-ui, sans-serif";
    const tw = Math.min(ctx.measureText(takeaway).width + 32, cardW - padX * 2);
    const ty = qy + 4;
    drawRoundedRect(ctx, CANVAS_W / 2 - tw / 2, ty, tw, 32, 16, '#E8F5E9', '#81C784');
    drawText(ctx, takeaway, CANVAS_W / 2, ty + 16, {
      font: "bold 15px 'Inter', system-ui, sans-serif",
      color: WORLD_ART.textGreen,
      align: 'center',
      baseline: 'middle',
    });
  }

  // Source badge (attribution) — CLICKABLE button that opens the in-app source page.
  const footY = cardY + cardH - 34;
  const badge = `📚 ${sourceTitle}`;
  ctx.font = "bold 12px 'Inter', system-ui, sans-serif";
  const bw = ctx.measureText(badge).width + 24;
  const badgeX = cardX + padX;
  const badgeY = footY - 10;
  const badgeH = 26;
  // Pressable chip look (filled + accent border) so it reads as tappable.
  drawRoundedRect(ctx, badgeX, badgeY, bw, badgeH, 13, '#FFE8A3', '#B8860B');
  drawText(ctx, badge, badgeX + bw / 2, badgeY + badgeH / 2, {
    font: "bold 12px 'Inter', system-ui, sans-serif",
    color: '#5b4300',
    align: 'center',
    baseline: 'middle',
  });
  // Keyboard affordance: press S (or click/tap) to open the source page. Localized
  // via state.sourceHint (wheredoesitgrow.source_hint); English fallback if unset.
  drawText(ctx, state.sourceHint || '⌨ Press S ↗', badgeX + bw / 2, badgeY + badgeH + 9, {
    font: "bold 11px 'Inter', system-ui, sans-serif",
    color: WORLD_ART.dirtAccent,
    align: 'center',
    baseline: 'middle',
  });
  // Hit rect for the component's click handler (open /source.html?src=...).
  // Stored where it is drawn: hit-testing works in unscaled canvas space.
  state.sourceBadgeRect = {
    x: scaled(badgeX, CANVAS_W / 2), y: scaled(badgeY, CANVAS_H / 2), w: bw * u, h: badgeH * u,
  };

  // Dismiss button (right side)
  const btnLabel = `${state.revealDismiss || 'Got it'}  ↵`;
  ctx.font = "bold 13px 'Inter', system-ui, sans-serif";
  const btnW = ctx.measureText(btnLabel).width + 32;
  const btnX = cardX + cardW - padX - btnW;
  drawRoundedRect(ctx, btnX, footY - 10, btnW, 28, 14, WORLD_ART.buttonGreen, WORLD_ART.textGreen);
  drawText(ctx, btnLabel, btnX + btnW / 2, footY + 4, {
    font: "bold 13px 'Inter', system-ui, sans-serif",
    color: '#fff',
    align: 'center',
    baseline: 'middle',
  });
  ctx.restore();
}
