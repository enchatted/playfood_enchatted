// Grand Finale — the "magical island merge" cinematic.
//
// Played on the World Map AFTER the player claims the certificate inside the Lighthouse
// and is routed back to the map (store flag `finaleMerging`). The four island orbs slide
// in from the four screen corners — matching each island's real quadrant on the map —
// converge at centre, and bloom into a single golden "Success Island" before the screen
// hands off to the CertificateScreen.
//
// Screen-space + self-contained: WorldMap owns `state.finaleMerge`; this module advances
// it (updateMerge) and draws the overlay (renderMerge). When `state.finaleMerge.done`
// flips true, WorldMap clears the flag and navigates to the certificate.

import { CANVAS_W, CANVAS_H } from './overworldData.js';
import { ISLAND_COLORS } from '../styles/brandColors.js';

const CONVERGE = 1.7;                 // orbs travel corner → centre
const BLOOM = 1.1;                    // the Success Island blooms open
export const MERGE_DURATION = CONVERGE + BLOOM; // ~2.8s total (spec: 2–3s)

const GOLD = '#C9A24B';
const GOLD_LIGHT = '#F2D9A0';

// Each orb starts at the screen corner that mirrors its island's place on the map,
// so the merge reads as the four real islands sliding inward to become one.
const ORB_SOURCES = [
  { island: 'foodwaste', color: ISLAND_COLORS.foodwaste, fx: 0.17, fy: 0.22 }, // top-left
  { island: 'local',     color: ISLAND_COLORS.local,     fx: 0.83, fy: 0.22 }, // top-right
  { island: 'growing',   color: ISLAND_COLORS.growing,   fx: 0.17, fy: 0.80 }, // bottom-left
  { island: 'circular',  color: ISLAND_COLORS.circular,  fx: 0.83, fy: 0.80 }, // bottom-right
];

// ── Math helpers ──────────────────────────────────────────
function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const a2 = a + Math.PI / 5;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a2) * r * 0.45, cy + Math.sin(a2) * r * 0.45);
  }
  ctx.closePath();
  ctx.fill();
}

// ── Lifecycle ─────────────────────────────────────────────
/** Build the initial merge payload (called once when the map mounts mid-finale). */
export function initMerge() {
  return { t: 0, done: false, navigated: false };
}

/** Advance the cinematic clock; flips `done` once the full sequence has played. */
export function updateMerge(state, dt) {
  const m = state.finaleMerge;
  if (!m) return;
  m.t += dt;
  if (m.t >= MERGE_DURATION) { m.t = MERGE_DURATION; m.done = true; }
}

// ── Render ────────────────────────────────────────────────
/** Draw the full-screen merge overlay. Call last, just before the iris wipe. */
export function renderMerge(ctx, state) {
  const m = state.finaleMerge;
  if (!m) return;
  const t = m.t;
  const time = state.time || 0;
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;

  const conv = Math.min(1, t / CONVERGE);
  const ease = easeInOutCubic(conv);
  const bloom = Math.max(0, (t - CONVERGE) / BLOOM);
  const bEase = easeOutCubic(Math.min(1, bloom));

  ctx.save();

  // 1) Dark wash so the map recedes and the moment reads as a scene change.
  const washA = Math.min(0.52, (t / 0.4) * 0.52);
  ctx.fillStyle = `rgba(18,14,28,${washA})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Central warm glow — grows as the orbs near and the island blooms.
  const glowR = 70 + ease * 130 + bEase * 360;
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  cg.addColorStop(0, `rgba(255,242,206,${0.12 + 0.62 * bEase})`);
  cg.addColorStop(0.5, `rgba(255,224,150,${0.06 + 0.30 * bEase})`);
  cg.addColorStop(1, 'rgba(255,224,150,0)');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fill();

  // 2) The four island orbs — gold thread + glowing colored core, travelling inward.
  const orbAlpha = 1 - bEase; // dissolve into the bloom
  ctx.lineCap = 'round';
  ORB_SOURCES.forEach((o, i) => {
    const sx = o.fx * CANVAS_W;
    const sy = o.fy * CANVAS_H;
    const ox = sx + (cx - sx) * ease;
    const oy = sy + (cy - sy) * ease;

    // Gold thread pulling the orb toward centre.
    ctx.globalAlpha = 0.5 * orbAlpha;
    const grad = ctx.createLinearGradient(ox, oy, cx, cy);
    grad.addColorStop(0, 'rgba(201,162,75,0)');
    grad.addColorStop(1, 'rgba(255,224,150,0.55)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    // Colored halo + bright core.
    ctx.globalAlpha = orbAlpha;
    const r = 18 + 6 * Math.sin(time * 4 + i);
    const og = ctx.createRadialGradient(ox, oy, 2, ox, oy, r + 12);
    og.addColorStop(0, o.color);
    og.addColorStop(0.45, hexA(o.color, 0.55));
    og.addColorStop(1, hexA(o.color, 0));
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(ox, oy, r + 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFF8E8';
    ctx.beginPath();
    ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // 3) Bloom — expanding shock rings + a golden Success Island disc with a star.
  if (bloom > 0) {
    for (let k = 0; k < 2; k++) {
      const rp = Math.min(1, bloom * 1.2 - k * 0.18);
      if (rp <= 0) continue;
      ctx.globalAlpha = (1 - rp) * 0.6;
      ctx.strokeStyle = GOLD_LIGHT;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 40 + rp * 340, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const discR = 74 * bEase;
    const dg = ctx.createRadialGradient(cx, cy - discR * 0.3, 4, cx, cy, discR);
    dg.addColorStop(0, '#FFF3D2');
    dg.addColorStop(0.6, GOLD);
    dg.addColorStop(1, '#A9802F');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#FFF8E8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    drawStar(ctx, cx, cy, discR * 0.5, '#FFFDF5');

    // A few orbiting sparkles for life (deterministic — time-driven).
    for (let s = 0; s < 6; s++) {
      const a = time * 1.6 + (s * Math.PI) / 3;
      const rr = discR + 18 + 6 * Math.sin(time * 3 + s);
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 4 + s);
      ctx.fillStyle = GOLD_LIGHT;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
