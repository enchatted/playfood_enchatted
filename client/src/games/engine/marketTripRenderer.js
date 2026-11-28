// Market Trip — custom renderer for walk-around market shopping game.
// Cobblestone market with 8 vendor stalls, choice overlay, dual budget meters.

import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { drawRoundedRect, drawText, fitFontPx } from '../../utils/canvas.js';
import { OX, OY, drawNPCSprite, NPC_PALETTES, missionIntroViewport } from './gameRoomRenderer.js';
import { WORLD_ART } from '../../styles/brandColors.js';
import { MARKET_FACTS } from '../../data/marketTripData.js';
import { SOURCES } from '../../data/sources.js';

// Greedy word-wrap against the CURRENT ctx.font.
function wrapLine(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const probe = line ? line + ' ' + w : w;
    if (ctx.measureText(probe).width > maxW && line) { lines.push(line); line = w; }
    else line = probe;
  }
  if (line) lines.push(line);
  return lines;
}

function fitBoldLabelPx(ctx, text, maxWidth, start = 10, floor = 7) {
  for (let size = start; size >= floor; size -= 1) {
    ctx.font = `bold ${size}px 'Inter', system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return floor;
}

const TS = 32;

// ─── Cobblestone floor overlay ───────────────────────────

export function getMarketPromenadeGeometry() {
  return {
    x: OX + TS,
    y: OY + 5 * TS,
    width: 18 * TS,
    height: 5 * TS,
  };
}

export function renderMarketFloor(ctx, room) {
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 20; col++) {
      const tile = room.map[row][col];
      if (tile === 15) { // FLOOR_STONE
        const x = OX + col * TS;
        const y = OY + row * TS;

        // Warm sandy cobblestone (was a cold taupe checkerboard) — reads as a
        // sunny «λαϊκή» square. Per-tile bevel (light top-left / dark bottom-right)
        // + grout line give each paver subtle depth without clutter.
        const variant = ((col * 7 + row * 13) & 0xFF) % 4;
        const shades = ['#E7D4AE', '#DEC99C', '#D5BC8A', '#CBB07B'];
        ctx.fillStyle = shades[variant];
        ctx.fillRect(x, y, TS, TS);

        ctx.fillStyle = 'rgba(255,250,235,0.16)';      // sun-lit top-left edge
        ctx.fillRect(x + 1, y + 1, TS - 2, 2);
        ctx.fillRect(x + 1, y + 1, 2, TS - 2);
        ctx.fillStyle = 'rgba(92,66,48,0.12)';          // shaded bottom-right edge
        ctx.fillRect(x + 1, y + TS - 3, TS - 2, 2);
        ctx.fillRect(x + TS - 3, y + 1, 2, TS - 2);

        ctx.strokeStyle = 'rgba(120,92,64,0.22)';       // grout between pavers
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1);
      }
    }
  }

  // A soft central promenade groups the eight booths into one welcoming market
  // square. It is visual only and stays entirely inside the already-walkable
  // rows 5–9, so collision and approach tiles remain untouched.
  const promenade = getMarketPromenadeGeometry();
  const promenadeGradient = ctx.createLinearGradient(
    promenade.x,
    promenade.y,
    promenade.x,
    promenade.y + promenade.height,
  );
  promenadeGradient.addColorStop(0, 'rgba(255, 244, 205, 0.16)');
  promenadeGradient.addColorStop(0.5, 'rgba(255, 235, 174, 0.27)');
  promenadeGradient.addColorStop(1, 'rgba(255, 244, 205, 0.16)');
  ctx.fillStyle = promenadeGradient;
  ctx.fillRect(promenade.x, promenade.y, promenade.width, promenade.height);
  ctx.strokeStyle = 'rgba(145, 101, 55, 0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(promenade.x, promenade.y + 1);
  ctx.lineTo(promenade.x + promenade.width, promenade.y + 1);
  ctx.moveTo(promenade.x, promenade.y + promenade.height - 1);
  ctx.lineTo(promenade.x + promenade.width, promenade.y + promenade.height - 1);
  ctx.stroke();

  // Small leaf medallions provide child-friendly wayfinding without becoming
  // pick-ups or changing any interactive tile.
  ctx.save();
  ctx.globalAlpha = 0.22;
  for (const col of [3, 7, 12, 16]) {
    const cx = OX + col * TS + TS / 2;
    const cy = promenade.y + promenade.height / 2;
    ctx.fillStyle = '#6F9A4D';
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy, 7, 3, -0.45, 0, Math.PI * 2);
    ctx.ellipse(cx + 4, cy, 7, 3, 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Market fence / walls
  for (let col = 0; col < 20; col++) {
    for (const row of [0, 14]) {
      const x = OX + col * TS;
      const y = OY + row * TS;
      ctx.fillStyle = '#8B624C';
      ctx.fillRect(x, y, TS, TS);
      ctx.fillStyle = '#B18469';
      ctx.fillRect(x, y + 4, TS, 10);
      ctx.fillStyle = '#76503F';
      ctx.fillRect(x, y + 18, TS, 10);
      if (col % 5 === 0) {
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(x + 12, y, 8, TS);
      }
    }
  }
  for (let row = 1; row < 14; row++) {
    for (const col of [0, 19]) {
      const x = OX + col * TS;
      const y = OY + row * TS;
      ctx.fillStyle = '#8B624C';
      ctx.fillRect(x, y, TS, TS);
      ctx.fillStyle = '#B18469';
      ctx.fillRect(x + 4, y, 10, TS);
    }
  }
}

// ─── Vendor stalls ───────────────────────────────────────
// Per-product awning colour so each stall reads as its own goods from a distance
// (was 8 identical red awnings). Falls back to a soft red for any unmapped item.
const AWNING_COLORS = {
  '🍅': '#E53935', '🍓': '#EC407A', '🍊': '#FB8C00', '🧀': '#FBC02D',
  '🍯': '#FFA000', '🥬': '#66BB6A', '🍎': '#2E7D32', '🥔': '#A1887F',
};

export function getMarketStallGeometry(stall) {
  const centerX = OX + stall.col * TS + TS / 2;
  const anchorY = OY + stall.row * TS + TS / 2;
  const facesUp = stall.orientation === 'up';
  const awningWidth = 76;
  const counterWidth = 72;
  const canopyY = facesUp ? anchorY - 16 : anchorY - 42;
  const vendorY = facesUp ? anchorY - 4 : anchorY - 30;
  const counterY = facesUp ? anchorY + 22 : anchorY - 2;
  const bottom = facesUp ? anchorY + 42 : anchorY + 16;

  return {
    centerX,
    anchorY,
    awningWidth,
    counterWidth,
    left: centerX - awningWidth / 2,
    right: centerX + awningWidth / 2,
    top: canopyY,
    bottom,
    canopyY,
    counterY,
    vendorX: centerX - 16,
    vendorY,
    vendorDir: facesUp ? 1 : 0,
    productX: centerX + 21,
    productY: counterY + 7,
    markerY: counterY + 7,
  };
}

// Every stall is drawn inside its declared 3×2 solid footprint. Vendors still
// face the approach lane, while both booth structures remain visually upright.
export function renderStalls(ctx, stalls, time) {
  for (const stall of stalls) {
    const geometry = getMarketStallGeometry(stall);
    const { centerX: mx } = geometry;
    const awning = AWNING_COLORS[stall.emoji] || '#E57373';

    ctx.save();
    if (stall.chosen) ctx.globalAlpha = 0.82;

    // Soft footprint shadow anchors the booth without the heavy dark counters
    // that made the room feel adult and visually dense.
    ctx.fillStyle = 'rgba(82, 54, 35, 0.16)';
    ctx.beginPath();
    ctx.ellipse(mx, geometry.bottom - 2, 35, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Vendor always stays upright while facing the player's approach lane.
    const pal = NPC_PALETTES[(stall.col + stall.row) % NPC_PALETTES.length];
    const vendorBob = Math.sin(time * 1.4 + stall.col * 0.7) * 0.7;
    const idleFrame = Math.floor(time * 1.6 + stall.col * 0.35) % 2;
    drawNPCSprite(
      ctx,
      geometry.vendorX,
      geometry.vendorY + vendorBob,
      pal,
      geometry.vendorDir,
      idleFrame,
      time,
    );

    // Keep both booth rows visually upright. The lower row used to mirror the
    // complete booth, placing its striped canopy underneath the vendor.
    const aw = geometry.awningWidth;
    const ax = mx - aw / 2;
    const ay = geometry.canopyY;
    ctx.fillStyle = '#9A7257';
    const postHeight = geometry.bottom - ay - 8;
    ctx.fillRect(ax + 3, ay + 8, 4, postHeight);
    ctx.fillRect(ax + aw - 7, ay + 8, 4, postHeight);
    ctx.fillStyle = awning;
    ctx.fillRect(ax, ay, aw, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';            // white stripes
    for (let sx = ax + 6; sx < ax + aw - 6; sx += 16) ctx.fillRect(sx, ay, 7, 12);
    ctx.fillStyle = awning;                               // scalloped hem
    for (let i = 0; i <= aw - 10; i += 10) {
      ctx.beginPath();
      ctx.moveTo(ax + i, ay + 12);
      ctx.lineTo(ax + i + 5, ay + 17);
      ctx.lineTo(ax + i + 10, ay + 12);
      ctx.closePath();
      ctx.fill();
    }

    // ── Wide wooden counter at the front (drawn over the vendor's legs) ──
    const cw = geometry.counterWidth;
    const cx = mx - cw / 2;
    const cy = geometry.counterY;
    ctx.fillStyle = '#8C684F';
    ctx.fillRect(cx, cy, cw, 18);
    ctx.fillStyle = '#BE936C';
    ctx.fillRect(cx, cy, cw, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(cx, cy + 16, cw, 2);

    // Produce sits on a small counter tray instead of covering the vendor's
    // face. Both tray and label stay upright for the lower booths as well.
    const bob = Math.sin(time * 2 + stall.col * 1.1 + stall.row * 0.7) * 1.2;
    drawRoundedRect(
      ctx,
      geometry.productX - 15,
      geometry.productY + 7,
      30,
      6,
      2,
      '#D9B47E',
      '#7D573E',
    );
    drawRoundedRect(
      ctx,
      mx - 28,
      geometry.productY - 7,
      14,
      13,
      2,
      '#FFF3CF',
      '#8C684F',
    );
    ctx.fillStyle = awning;
    ctx.fillRect(mx - 24, geometry.productY - 3, 6, 2);
    drawText(ctx, stall.emoji, geometry.productX, geometry.productY + bob, {
      font: '22px sans-serif', align: 'center', baseline: 'middle',
    });

    // Name sign hung on the awning: every stall says what it
    // sells, and the sign stays inside the booth's declared footprint.
    if (stall.name) {
      // Measured in the font it is drawn with (measuring in Inter undersized it).
      const signPx = fitFontPx(ctx, stall.name, aw + 14, {
        start: 14, floor: 11, weight: '800', family: "'Fredoka', 'Inter', system-ui, sans-serif",
      });
      const signW = Math.min(aw + 18, ctx.measureText(stall.name).width + 12);
      drawRoundedRect(ctx, mx - signW / 2, ay + 1, signW, 19, 5, '#FFF8E6', '#8C684F');
      drawText(ctx, stall.name, mx, ay + 10.5, {
        font: `800 ${signPx}px 'Fredoka', 'Inter', system-ui, sans-serif`,
        color: '#4E342E', align: 'center', baseline: 'middle',
      });
    }

    if (stall.chosen) {
      drawText(ctx, '✓', mx + cw / 2 - 8, geometry.markerY, {
        font: "bold 16px 'Inter', system-ui, sans-serif",
        color: '#FFF8E1', align: 'center', baseline: 'middle',
      });
    }
    ctx.restore();
  }
}

// ─── In-room mentor «Η Μανάβισσα» (R1 directive — female grocer) ──────────
// Borrows the island-mentor pattern from MealPlanner's renderChef: a coral
// disc + white ring + emoji, plus a cream speech bubble with name + message.
// Drawn in WORLD space (inside the room camera), like the stalls/player.
const MENTOR_CORAL = '#F2845C';
export function renderMentor(ctx, state) {
  const c = state.mentorPos || { col: 10, row: 12.2 };
  const x = OX + c.col * TS;
  const y = OY + c.row * TS;

  // shadow + coral disc + white ring + grocer emoji
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(x, y + 16, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = MENTOR_CORAL;
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1;
  drawText(ctx, '👩🏽‍🌾', x, y, { font: '22px sans-serif', align: 'center', baseline: 'middle' });

  const msg = state.mentor && state.mentor.msg;
  if (!msg) {
    state.mentorBubbleRect = null;
    return;
  }
  const name = (state.strings && state.strings.mentorName) || 'Η Μανάβισσα';
  // Body 11px → 14px, so the bubble grows to keep about the same words per line.
  ctx.font = "600 14px 'Fredoka', 'Inter', system-ui, sans-serif";
  const lines = wrapLine(ctx, msg, 236);
  const bw = 260;
  const bh = lines.length * 18 + 28;
  // Bubble opens to the mentor's right, then is STRICTLY clamped inside the market
  // square (world rect) so it never clips off the edge wherever she is stationed.
  const minX = OX + 6, maxX = OX + 20 * TS - bw - 6;
  const minY = OY + 6, maxY = OY + 15 * TS - bh - 6;
  const bx = Math.max(minX, Math.min(x + 18, maxX));
  const by = Math.max(minY, Math.min(y - bh - 6, maxY));
  state.mentorBubbleRect = { x: bx, y: by, width: bw, height: bh };
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  drawRoundedRect(ctx, bx, by, bw, bh, 12, WORLD_ART.panelCream, '#D7C49A');
  ctx.restore();
  // little tail toward the mentor
  ctx.fillStyle = WORLD_ART.panelCream;
  ctx.beginPath(); ctx.moveTo(bx + 2, by + bh - 6); ctx.lineTo(bx - 8, y - 2); ctx.lineTo(bx + 14, by + bh - 2); ctx.closePath(); ctx.fill();
  // Darker than the coral disc so the name reads on cream (was ~2.2:1).
  drawText(ctx, name, bx + 12, by + 12, { font: "800 12px 'Fredoka', 'Inter', system-ui, sans-serif", color: '#B4471F', align: 'left', baseline: 'middle' });
  lines.forEach((ln, i) => drawText(ctx, ln, bx + 12, by + 31 + i * 18, {
    font: "600 14px 'Fredoka', 'Inter', system-ui, sans-serif", color: WORLD_ART.panelBrownDeep, align: 'left', baseline: 'middle',
  }));
}

// ─── Sensory-contrast card backgrounds (spec: "delicious local vs flavourless
// plastic imports") — the look does the teaching, before any tag is read. ──────

// LOCAL: warm sunlight melting into fresh green + a soft sun glow & leaf sprigs.
function paintLocalCard(ctx, x, y, w, h, r, hi) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, hi ? '#FFF4C9' : '#FBF6DD');
  g.addColorStop(0.5, hi ? '#DBEFBC' : '#E7F2D3');
  g.addColorStop(1, hi ? '#BDE399' : '#D2E9BD');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const sun = ctx.createRadialGradient(x + w - 32, y + 30, 4, x + w - 32, y + 30, 66);
  sun.addColorStop(0, 'rgba(255,228,130,0.85)');
  sun.addColorStop(1, 'rgba(255,228,130,0)');
  ctx.fillStyle = sun; ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 0.16; ctx.fillStyle = '#3F7A3D';
  for (const [lx, ly, rot] of [[x + 24, y + h - 20, -0.5], [x + w - 26, y + h - 16, 0.6]]) {
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(rot);
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// IMPORTED: clear sky blues + a route sheen + a faint plane watermark. It reads
// as a travelled option without visually labelling it as the "bad" choice.
function paintImportCard(ctx, x, y, w, h, r, hi) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, hi ? '#F3F8FF' : '#EEF5FC');
  g.addColorStop(1, hi ? '#C7DCF2' : '#D8E7F5');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const sheen = ctx.createLinearGradient(x, y, x + w, y + h);
  sheen.addColorStop(0.30, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.46, 'rgba(255,255,255,0.48)');
  sheen.addColorStop(0.62, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen; ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 0.14;
  drawText(ctx, '🌍', x + w - 28, y + 30, { font: '40px sans-serif', align: 'center', baseline: 'middle' });
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── Choice overlay (dual budget: miles + price) ─────────

export const CHOICE_PANEL = Object.freeze({ width: 860, height: 548, compactHeight: 446, cardWidth: 380, cardHeight: 330, gap: 30 });
// Below this free CSS height (a phone held sideways) the card switches to its compact form.
export const COMPACT_CHOICE_MAX_CSS_H = 420;

// Badge + one-line «why» for an option. Every sentence comes from the verified
// sources (see marketTripData.js); prices remain game parameters.
function optionCopy(stall, kind, s) {
  if (kind === 'imported') {
    const fragileOutOfSeason = stall.fragile && !stall.local.inSeason;
    return {
      badge: { text: '🌍 ' + (s.badgeImported || 'Available all year'), fill: '#E3ECF7', stroke: '#7596B6', color: '#34597A' },
      why: fragileOutOfSeason ? s.whyImportedFragile : s.whyImported,
    };
  }
  const option = stall.local;
  if (option.available === false) {
    return {
      badge: { text: '⚪ ' + (s.badgeNoLocal || 'No local season here'), fill: '#F2EEE8', stroke: '#B9B0A3', color: '#6F665C' },
      why: s.whyNoLocal,
    };
  }
  if (option.craft) {
    return {
      badge: { text: '🧑‍🌾 ' + (s.badgeCraft || 'Local producer'), fill: '#F7ECD3', stroke: '#C49A4A', color: '#7A5314' },
      why: s.whyLocalCraft,
    };
  }
  if (option.inSeason) {
    return {
      badge: { text: '🟢 ' + (s.badgeInSeason || 'In season now'), fill: '#DDF0D5', stroke: '#4F9A45', color: '#2E6B27' },
      why: s.whyLocalInSeason,
    };
  }
  return {
    badge: { text: '🟠 ' + (s.badgeOutOfSeason || 'Out of season now'), fill: '#FDE8D2', stroke: '#E08A2E', color: '#9A4D0B' },
    why: s.whyLocalOutOfSeason,
  };
}

// Keep the purchase card in an actually free CSS-pixel region. The full-stage
// canvas can still letterbox, so the current draw transform owns the conversion.
export function getMarketChoicePlacement(view, panelHeight = CHOICE_PANEL.height) {
  if (!view) return null;
  const { box, controls, scale, originX, originY } = view;
  const middle = (box.left + box.right) / 2;
  const left = controls.filter(c => c.right < middle);
  const right = controls.filter(c => c.left > middle);
  const central = controls.filter(c => c.left <= middle && c.right >= middle);
  const regions = [
    { ...box, left: Math.max(box.left, ...left.map(c => c.right + 8)),
      right: Math.min(box.right, ...right.map(c => c.left - 8)),
      bottom: Math.min(box.bottom, ...central.map(c => c.top - 8)) },
    { ...box, bottom: Math.min(box.bottom, ...controls.map(c => c.top - 8)) },
  ];
  let best = null;
  for (const region of regions) {
    const cssScale = Math.min(1, (region.right - region.left - 10) / CHOICE_PANEL.width,
      (region.bottom - region.top - 10) / panelHeight);
    if (!(cssScale > 0) || (best && cssScale <= best.cssScale)) continue;
    const width = CHOICE_PANEL.width * cssScale;
    const height = panelHeight * cssScale;
    best = { cssScale, zoom: cssScale / scale,
      x: ((region.left + region.right - width) / 2 - originX) / scale,
      y: ((region.top + region.bottom - height) / 2 - originY) / scale };
  }
  return best;
}

export function renderChoiceOverlay(ctx, state) {
  if (!state.activeStall || !state.showingChoice) return;

  const stall = state.activeStall;
  const s = state.strings || {};
  const money = s.formatMoney || ((value) => `€${Number(value).toFixed(2)}`);
  const km = s.kmLabel || ((value) => `≈ ${Number(value).toLocaleString()} km`);
  const { width: panelW, cardWidth: cardW, cardHeight: cardH, gap } = CHOICE_PANEL;
  const view = missionIntroViewport(ctx);
  // On a phone held sideways the card gets the whole screen (MarketTrip.jsx hides the
  // touch controls while it is open, ✕ closes it) and drops the totals strip and the key hint.
  const compact = Boolean(view && view.box.bottom - view.box.top < COMPACT_CHOICE_MAX_CSS_H);
  state.choiceCompact = compact;
  const panelH = compact ? CHOICE_PANEL.compactHeight : CHOICE_PANEL.height;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const panelX = (CANVAS_W - panelW) / 2;
  const panelY = (CANVAS_H - panelH) / 2;
  const placement = getMarketChoicePlacement(view, panelH);
  ctx.save();
  if (placement) {
    ctx.translate(placement.x, placement.y);
    ctx.scale(placement.zoom, placement.zoom);
    ctx.translate(-panelX, -panelY);
  }
  state.choicePanelRect = { x: panelX, y: panelY, width: panelW, height: panelH };
  drawRoundedRect(ctx, panelX + 3, panelY + 4, panelW, panelH, 20, 'rgba(0,0,0,0.15)', 'transparent');
  drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 20, WORLD_ART.panelCream, 'rgba(121,85,72,0.4)');

  // One clear task: identify the food, then compare the two options.
  drawText(ctx, stall.emoji + ' ' + stall.name, CANVAS_W / 2, panelY + 34, {
    font: "800 32px 'Fredoka', 'Inter', system-ui, sans-serif",
    color: '#4E342E', align: 'center', baseline: 'middle',
  });
  const question = stall.chosen
    ? (s.changeQuestion || 'Changed your mind? Choose again.')
    : (s.choiceQuestion || 'Which option goes in your basket?');
  // Compact has no totals strip, so the money warning takes the question's place.
  const compactWarning = compact && state.warning ? `⚠️ ${state.warning}` : null;
  const questionPx = compactWarning ? fitBoldLabelPx(ctx, compactWarning, panelW - 60, 19, 12) : 19;
  drawText(ctx, compactWarning || question, CANVAS_W / 2, panelY + 67, {
    font: `${compactWarning ? 800 : 600} ${questionPx}px 'Fredoka', 'Inter', system-ui, sans-serif`,
    color: compactWarning ? (state.warningIsOver ? '#A62E27' : '#8A5A10') : WORLD_ART.panelBrown,
    align: 'center', baseline: 'middle',
  });

  // The full source stays one click/tap/S away without competing with the decision.
  const pubLabel = `📖 ${s.pressS || 'Press S'}`;
  ctx.font = "bold 15px 'Inter', system-ui, sans-serif";
  const pillW = ctx.measureText(pubLabel).width + 20;
  const pillH = 26;
  const closeSize = 52;
  const pillX = panelX + panelW - pillW - 16 - (compact ? closeSize + 10 : 0);
  const pillY = panelY + 14;
  state.choiceCloseRect = null;
  if (compact) {
    const closeRect = { x: panelX + panelW - closeSize - 12, y: panelY + 10, width: closeSize, height: closeSize };
    drawRoundedRect(ctx, closeRect.x, closeRect.y, closeSize, closeSize, 14, '#FFFFFF', 'rgba(121,85,72,0.55)');
    drawText(ctx, '✕', closeRect.x + closeSize / 2, closeRect.y + closeSize / 2 + 1, {
      font: "800 28px 'Inter', system-ui, sans-serif", color: '#4E342E', align: 'center', baseline: 'middle',
    });
    state.choiceCloseRect = closeRect;
  }
  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 9, '#FFE8A3', '#B8860B');
  drawText(ctx, pubLabel, pillX + pillW / 2, pillY + pillH / 2 + 0.5, {
    font: "bold 15px 'Inter', system-ui, sans-serif",
    color: WORLD_ART.panelBrownDeep, align: 'center', baseline: 'middle',
  });
  state.choiceSourceRect = { x: pillX, y: pillY, width: pillW, height: pillH };

  const leftX = CANVAS_W / 2 - cardW - gap / 2;
  const rightX = CANVAS_W / 2 + gap / 2;
  const cardY = panelY + 100;
  const localY = cardY - (state.choiceIndex === 0 ? 5 : 0);
  const importedY = cardY - (state.choiceIndex === 1 ? 5 : 0);
  state.localChoiceRect = { x: leftX, y: localY, width: cardW, height: cardH };
  state.importedChoiceRect = { x: rightX, y: importedY, width: cardW, height: cardH };

  // Projected totals (a re-opened stall first gives back what is in the basket).
  const previous = stall.chosen ? (stall.chosenLocal ? stall.local : stall.imported) : null;
  const baseMoney = (state.moneySpent || 0) - (previous ? previous.price : 0);
  const baseMiles = (state.milesUsed || 0) - (previous ? previous.miles : 0);
  const cents = (value) => Math.round(value * 100) / 100;
  state.choiceProjection = {
    local: { money: cents(baseMoney + stall.local.price), miles: baseMiles + stall.local.miles },
    imported: { money: cents(baseMoney + stall.imported.price), miles: baseMiles + stall.imported.miles },
  };

  const selectedLabel = s.selectedChoice || 'SELECTED';
  const inBasketLabel = s.inBasket || 'IN BASKET';
  const previousLineWidth = ctx.lineWidth;
  let selectedLabelRect = null;

  const drawOptionCard = ({ x, y, option, kind, selected }) => {
    const unavailable = kind === 'local' && option.available === false;
    const inBasket = stall.chosen && (kind === 'local') === Boolean(stall.chosenLocal);
    const tagStroke = kind === 'local' ? '#6B8E4E' : '#5C78A6';
    ctx.save();
    if (selected) {
      ctx.shadowColor = 'rgba(47,104,183,0.38)';
      ctx.shadowBlur = 13;
      ctx.shadowOffsetY = 5;
    }
    if (unavailable) drawRoundedRect(ctx, x, y, cardW, cardH, 16, '#ECE7DF', '#B9B0A3');
    else if (kind === 'local') paintLocalCard(ctx, x, y, cardW, cardH, 16, selected);
    else paintImportCard(ctx, x, y, cardW, cardH, 16, selected);
    ctx.lineWidth = selected ? 5 : 2;
    drawRoundedRect(ctx, x, y, cardW, cardH, 16, null, selected ? '#2F68B7' : (unavailable ? '#B9B0A3' : tagStroke));
    ctx.restore();
    ctx.lineWidth = previousLineWidth;

    // Type tag
    const typeLabel = kind === 'local'
      ? '🏠 ' + (s.localChoice || s.local || 'Local choice')
      : '🌍 ' + (s.importedChoice || s.imported || 'Imported choice');
    const tagRect = { x: x + 26, y: y + 14, width: cardW - 52, height: 30 };
    const typePx = fitBoldLabelPx(ctx, typeLabel, tagRect.width - 18, 18, 12);
    drawRoundedRect(ctx, tagRect.x, tagRect.y, tagRect.width, tagRect.height, 12,
      kind === 'local' ? '#E8F1DF' : '#E8EEF8', tagStroke);
    drawText(ctx, typeLabel, x + cardW / 2, tagRect.y + 15.5, {
      font: `800 ${typePx}px 'Fredoka', 'Inter', system-ui, sans-serif`,
      color: kind === 'local' ? '#3E5B2E' : '#405777', align: 'center', baseline: 'middle',
    });

    // Name (local farm / origin country)
    const namePx = fitBoldLabelPx(ctx, option.name, cardW - 34, 24, 14);
    drawText(ctx, option.name, x + cardW / 2, y + 66, {
      font: `800 ${namePx}px 'Fredoka', 'Inter', system-ui, sans-serif`,
      color: unavailable ? '#8A8177' : '#3C302A', align: 'center', baseline: 'middle',
    });

    // Season / origin badge
    const copy = optionCopy(stall, kind, s);
    const badgePx = fitBoldLabelPx(ctx, copy.badge.text, cardW - 64, 17, 11);
    ctx.font = `800 ${badgePx}px 'Fredoka', 'Inter', system-ui, sans-serif`;
    const badgeW = Math.min(cardW - 40, ctx.measureText(copy.badge.text).width + 30);
    drawRoundedRect(ctx, x + cardW / 2 - badgeW / 2, y + 86, badgeW, 30, 15, copy.badge.fill, copy.badge.stroke);
    drawText(ctx, copy.badge.text, x + cardW / 2, y + 101.5, {
      font: `800 ${badgePx}px 'Fredoka', 'Inter', system-ui, sans-serif`,
      color: copy.badge.color, align: 'center', baseline: 'middle',
    });

    if (!unavailable) {
      // Price + transport points, equal weight on both cards
      const metricGap = 12;
      const metricW = (cardW - 44 - metricGap) / 2;
      const metrics = [
        { x: x + 22, text: `💰 ${money(option.price)}`, fill: 'rgba(255,244,214,0.95)', stroke: '#D2A94C', color: '#6D4C41' },
        { x: x + 22 + metricW + metricGap, text: `🌍 ${option.miles} ${s.transportShort || 'pts'}`, fill: 'rgba(232,242,252,0.95)', stroke: '#7596B6', color: '#345C78' },
      ];
      for (const metric of metrics) {
        drawRoundedRect(ctx, metric.x, y + 128, metricW, 44, 12, metric.fill, metric.stroke);
        const metricPx = fitBoldLabelPx(ctx, metric.text, metricW - 12, 22, 12);
        drawText(ctx, metric.text, metric.x + metricW / 2, y + 150.5, {
          font: `800 ${metricPx}px 'Fredoka', 'Inter', system-ui, sans-serif`,
          color: metric.color, align: 'center', baseline: 'middle',
        });
      }

      // Distance: an approximate game estimate, visually secondary.
      ctx.save();
      ctx.strokeStyle = kind === 'local' ? '#6B8E4E' : '#5C78A6';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(x + 42, y + 200); ctx.lineTo(x + cardW - 42, y + 200); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      const distanceText = `${kind === 'local' ? '📍' : (option.flag || '📍')} ${km(option.km)}`;
      const distancePx = fitBoldLabelPx(ctx, distanceText, cardW - 90, 17, 11);
      ctx.font = `700 ${distancePx}px 'Fredoka', 'Inter', system-ui, sans-serif`;
      const distanceW = Math.min(cardW - 70, ctx.measureText(distanceText).width + 30);
      drawRoundedRect(ctx, x + cardW / 2 - distanceW / 2, y + 184, distanceW, 32, 12, 'rgba(255,253,246,0.96)', tagStroke);
      drawText(ctx, distanceText, x + cardW / 2, y + 200.5, {
        font: `700 ${distancePx}px 'Fredoka', 'Inter', system-ui, sans-serif`,
        color: '#5D5147', align: 'center', baseline: 'middle',
      });
    }

    // One-line «why» (wrapped, at most three lines)
    // Compact (phone) starts larger and steps down to 17 only while the sentence needs more than 3 lines.
    let whyPx = compact ? 20 : 17;
    let lines;
    for (;; whyPx--) {
      ctx.font = `600 ${whyPx}px 'Inter', system-ui, sans-serif`;
      lines = wrapLine(ctx, copy.why || '', cardW - 48);
      if (lines.length <= 3 || whyPx <= 17) break;
    }
    lines = lines.slice(0, 3);
    const lineStep = whyPx + 5;
    drawRoundedRect(ctx, x + 14, y + 228, cardW - 28, 90, 12, 'rgba(255,255,255,0.78)', 'rgba(121,85,72,0.25)');
    let lineY = y + 273 - (lines.length - 1) * lineStep / 2;
    for (const line of lines) {
      drawText(ctx, line, x + cardW / 2, lineY, {
        font: `600 ${whyPx}px 'Inter', system-ui, sans-serif`,
        color: '#3F332B', align: 'center', baseline: 'middle',
      });
      lineY += lineStep;
    }

    if (selected || inBasket) {
      const label = selected ? `✓ ${selectedLabel}` : `🧺 ${inBasketLabel}`;
      const labelPx = fitBoldLabelPx(ctx, label, 116, 15, 9);
      ctx.font = `800 ${labelPx}px 'Fredoka', 'Inter', system-ui, sans-serif`;
      const labelW = Math.min(136, ctx.measureText(label).width + 22);
      const rect = { x: x + cardW / 2 - labelW / 2, y: y - 13, width: labelW, height: 26 };
      drawRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 12,
        selected ? '#2F68B7' : '#7A5C3C', selected ? '#1D4F91' : '#5A4028');
      drawText(ctx, label, x + cardW / 2, y + 0.5, {
        font: `800 ${labelPx}px 'Fredoka', 'Inter', system-ui, sans-serif`,
        color: '#FFFFFF', align: 'center', baseline: 'middle',
      });
      if (selected) selectedLabelRect = rect;
    }
  };

  drawOptionCard({ x: leftX, y: localY, option: stall.local, kind: 'local', selected: state.choiceIndex === 0 });
  drawOptionCard({ x: rightX, y: importedY, option: stall.imported, kind: 'imported', selected: state.choiceIndex === 1 });

  const hasPick = state.choiceIndex === 0 || state.choiceIndex === 1;
  state.selectedChoiceRect = hasPick
    ? { ...(state.choiceIndex === 0 ? state.localChoiceRect : state.importedChoiceRect) }
    : null;
  state.selectedChoiceLabelRect = selectedLabelRect;
  state.selectedChoiceLabel = hasPick ? selectedLabel : null;

  // One shared strip under the cards: a prompt before choosing, then the
  // projected totals, or the money warning for the highlighted option.
  state.choiceSummaryRect = null;
  if (!compact) {
    const summaryRect = { x: panelX + 60, y: cardY + cardH + 18, width: panelW - 120, height: 44 };
    state.choiceSummaryRect = summaryRect;
    const warn = Boolean(state.warning);
    const over = warn && state.warningIsOver;
    drawRoundedRect(ctx, summaryRect.x, summaryRect.y, summaryRect.width, summaryRect.height, 13,
      over ? '#FFE2DE' : (warn ? '#FFF1D6' : '#F4E8C9'),
      over ? '#D14B3F' : (warn ? '#D89A2B' : '#C7A86E'));
    const midY = summaryRect.y + summaryRect.height / 2 + 0.5;
    if (!hasPick) {
      const prompt = '👉 ' + (s.pickPrompt || 'Pick one card');
      const px = fitBoldLabelPx(ctx, prompt, summaryRect.width - 28, 20, 12);
      drawText(ctx, prompt, CANVAS_W / 2, midY, {
        font: `800 ${px}px 'Fredoka', 'Inter', system-ui, sans-serif`, color: '#4E443C', align: 'center', baseline: 'middle',
      });
    } else if (warn) {
      const text = `⚠️ ${state.warning}`;
      const px = fitBoldLabelPx(ctx, text, summaryRect.width - 28, 19, 11);
      drawText(ctx, text, CANVAS_W / 2, midY, {
        font: `800 ${px}px 'Fredoka', 'Inter', system-ui, sans-serif`,
        color: over ? '#A62E27' : '#8A5A10', align: 'center', baseline: 'middle',
      });
    } else {
      const projection = state.choiceIndex === 0 ? state.choiceProjection.local : state.choiceProjection.imported;
      drawText(ctx, s.projectedTotals || 'After this choice', summaryRect.x + 18, midY, {
        font: "600 16px 'Fredoka', 'Inter', system-ui, sans-serif", color: '#756255', align: 'left', baseline: 'middle',
      });
      const budgetText = Number.isFinite(state.budget) ? ` / ${money(state.budget)}` : '';
      const projectionText = `${money(projection.money)}${budgetText} · ${projection.miles} ${s.transportShort || 'pts'}`;
      const px = fitBoldLabelPx(ctx, projectionText, summaryRect.width - 230, 20, 12);
      drawText(ctx, projectionText, summaryRect.x + summaryRect.width - 18, midY, {
        font: `800 ${px}px 'Fredoka', 'Inter', system-ui, sans-serif`, color: '#4E443C', align: 'right', baseline: 'middle',
      });
    }

    // Controls
    const hint = s.chooseHint || '← → to choose · Enter to buy · Q to go back';
    const hintPx = fitBoldLabelPx(ctx, hint, panelW - 60, 17, 11);
    drawText(ctx, hint, CANVAS_W / 2, panelY + panelH - 22, {
      font: `700 ${hintPx}px 'Fredoka', 'Inter', system-ui, sans-serif`,
      color: '#8D6E63', align: 'center', baseline: 'middle',
    });
  }
  ctx.restore();
  if (placement) {
    for (const key of ['choicePanelRect', 'localChoiceRect', 'importedChoiceRect', 'choiceSourceRect',
      'choiceCloseRect', 'choiceSummaryRect', 'selectedChoiceRect', 'selectedChoiceLabelRect']) {
      const rect = state[key];
      if (rect) state[key] = {
        x: placement.x + (rect.x - panelX) * placement.zoom,
        y: placement.y + (rect.y - panelY) * placement.zoom,
        width: rect.width * placement.zoom, height: rect.height * placement.zoom,
      };
    }
  }
}

// ─── Fact toast ────────────
// Cream card showing state.factToast.quote — the child-facing plain sentence,
// translated (MarketTrip.jsx pre-resolves it) — plus a gold source chip whose
// sourceKey still opens the verbatim source.html. Set upright and unquoted:
// quotation marks would pass our wording off as the source's. Fired once per
// fact from MarketTrip.jsx; dismiss early with Enter, open the source with «S».
export function renderMarketFactToast(ctx, state) {
  if (!state.factToast || state.factTimer <= 0) return;
  const fact = state.factToast;
  const alpha = Math.min(1, state.factTimer / 0.3);
  ctx.save();
  ctx.globalAlpha = alpha;

  const fbW = 640;
  ctx.font = "15px 'Inter', system-ui, sans-serif";
  const lines = wrapLine(ctx, fact.quote, fbW - 56);
  const fbH = 30 + lines.length * 20 + 30;
  const fbX = (CANVAS_W - fbW) / 2;
  const fbY = CANVAS_H - fbH - 64;

  drawRoundedRect(ctx, fbX + 2, fbY + 3, fbW, fbH, 16, 'rgba(0,0,0,0.25)', 'transparent');
  drawRoundedRect(ctx, fbX, fbY, fbW, fbH, 16, WORLD_ART.panelCream, WORLD_ART.textGreen);

  let qy = fbY + 26;
  for (const ln of lines) {
    drawText(ctx, ln, CANVAS_W / 2, qy, {
      font: "15px 'Inter', system-ui, sans-serif",
      color: WORLD_ART.panelBrownDeep, align: 'center', baseline: 'middle',
    });
    qy += 20;
  }

  // Clickable gold source chip — same affordance as the Island-1 reveal cards.
  // Carries a «Press S» hint and stores its rect so a tap/click opens source.html.
  const s = state.strings || {};
  const label = '📖 ' + (SOURCES[fact.sourceKey]?.publisher || 'source')
    + ' · ' + (s.pressS || 'Press S');
  ctx.font = "bold 11px 'Inter', system-ui, sans-serif";
  const chipW = ctx.measureText(label).width + 22;
  const chipX = CANVAS_W / 2 - chipW / 2;
  const chipY = qy + 2;
  drawRoundedRect(ctx, chipX, chipY, chipW, 20, 10, '#FFE8A3', '#B8860B');
  drawText(ctx, label, CANVAS_W / 2, chipY + 10, {
    font: "bold 11px 'Inter', system-ui, sans-serif",
    color: WORLD_ART.panelBrownDeep, align: 'center', baseline: 'middle',
  });
  state.factSourceRect = { x: chipX, y: chipY, width: chipW, height: 20 };

  ctx.restore();
}
