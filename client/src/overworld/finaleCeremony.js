// Grand Finale ceremony — the once-only celebration shown inside the Lighthouse
// when the player has completed all 12 missions.
//
// Self-contained + pure-ish: the LighthouseRoom owns a `state.finale` object; this
// module advances it, manages the confetti particles, and draws the overlay
// (a dramatic intro sweep of sequential plinth glow → ongoing gold/amber confetti).
// There is NO on-canvas claim button: the reward is triggered in-world by talking to
// the Lighthouse Keeper NPC, whose finale dialog (on dismiss) claims the diploma.

import { CANVAS_W, CANVAS_H, TILE_SIZE as TS } from './overworldData.js';
import { LIGHTHOUSE_STATIONS } from './lighthouseData.js';
import { OX, OY } from './lighthouseRoomRenderer.js';

const PLINTH_BEAT = 0.5;                 // seconds each plinth takes to light
const SWEEP = PLINTH_BEAT * LIGHTHOUSE_STATIONS.plinths.length; // ~2.0s — dramatic intro beat
const CONFETTI_COLORS = ['#C9A24B', '#E0B964', '#F2D9A0', '#D98E5A', '#B5762F'];
const keepWorldPoint = (x, y) => ({ x, y });

// ── Confetti ──────────────────────────────────────────────
function makeConfettoTop() {
  // Spawn just above the canvas, drifting down — warm gold/amber tones only.
  return {
    x: 40 + Math.random() * (CANVAS_W - 80),
    y: -20 - Math.random() * CANVAS_H,
    vx: (Math.random() - 0.5) * 40,
    vy: 60 + Math.random() * 90,
    size: 5 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    sway: Math.random() * Math.PI * 2,
  };
}

function makeBurst(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(makeConfettoTop());
  return out;
}

/** Build the initial `state.finale` payload (called once on Lighthouse entry at 12/12). */
export function initFinale() {
  return { t: 0, claimReady: false, confetti: makeBurst(70) };
}

/** Advance the ceremony + confetti. No-op while a per-island gold ceremony still runs. */
export function updateFinale(state, dt) {
  const f = state.finale;
  if (!f) return;
  f.t += dt;
  if (!f.claimReady && f.t >= SWEEP) f.claimReady = true;

  // Keep a gentle confetti stream alive; denser right after the sweep completes.
  const target = f.claimReady ? 90 : 60;
  while (f.confetti.length < target) f.confetti.push(makeConfettoTop());

  for (const c of f.confetti) {
    c.sway += dt * 2;
    c.x += (c.vx + Math.sin(c.sway) * 18) * dt;
    c.y += c.vy * dt;
    c.rot += c.vr * dt;
  }
  // Recycle anything that fell off the bottom.
  f.confetti = f.confetti.filter((c) => c.y < CANVAS_H + 30);
}

// ── Render ────────────────────────────────────────────────
function plinthCenter(plinth) {
  return { x: OX + plinth.col * TS + TS / 2, y: OY + plinth.row * TS + TS / 2 };
}

function drawPlinthGlow(ctx, cx, cy, intensity, time) {
  // Warm radial halo + a slow breathing ring around a lit plinth.
  const pulse = 0.85 + 0.15 * Math.sin(time * 3);
  const r = 46 * intensity * pulse;
  const grd = ctx.createRadialGradient(cx, cy - 6, 4, cx, cy - 6, r);
  grd.addColorStop(0, `rgba(255, 224, 150, ${0.55 * intensity})`);
  grd.addColorStop(0.5, `rgba(201, 162, 75, ${0.32 * intensity})`);
  grd.addColorStop(1, 'rgba(201, 162, 75, 0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy - 6, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(242, 217, 160, ${0.5 * intensity})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy - 6, 26 + 4 * Math.sin(time * 3 + cx), 0, Math.PI * 2);
  ctx.stroke();
}

function drawConfetti(ctx, confetti) {
  for (const c of confetti) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.globalAlpha = 0.92;
    // Thin rectangular flakes read more "paper confetti" than dots.
    ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/**
 * Draw the finale overlay: warm wash + sequential plinth glow + gold/amber confetti.
 * The reward itself is triggered by talking to the Lighthouse Keeper (see LighthouseRoom),
 * NOT by an on-canvas button — so there is no claim pill here. Call AFTER the room/stations
 * are drawn and only when `state.finale` exists and no per-island gold ceremony is running.
 */
export function renderFinaleCeremony(ctx, state, toCanvas = keepWorldPoint) {
  const f = state.finale;
  if (!f) return;
  const time = state.time || 0;

  // Gentle warm wash over the hall so the moment reads as "special" without hiding it.
  const wash = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H * 0.42, 80, CANVAS_W / 2, CANVAS_H * 0.42, CANVAS_W * 0.7);
  wash.addColorStop(0, 'rgba(255, 244, 214, 0.10)');
  wash.addColorStop(1, 'rgba(40, 30, 20, 0.28)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Sequential plinth glow — each plinth lights in turn, then stays lit.
  LIGHTHOUSE_STATIONS.plinths.forEach((plinth, i) => {
    const lit = Math.min(1, Math.max(0, f.t - i * PLINTH_BEAT) / PLINTH_BEAT);
    if (lit <= 0) return;
    const worldPoint = plinthCenter(plinth);
    const { x, y } = toCanvas(worldPoint.x, worldPoint.y);
    drawPlinthGlow(ctx, x, y, lit, time);
  });

  drawConfetti(ctx, f.confetti);
}
