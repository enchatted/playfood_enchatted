// Renderer for the canvas-based «choose your hero» ceremony.
//
// Reads as the harbor town continued upward: the same tiles, the same central
// cobblestone road (cols 13-14) running down through the village square to the
// pier. Picking a hero irises out onto them and drops them onto the docks below.
//
// The scene rests at the harbor's own 1.5× and pushes in on whichever hero is
// being considered, because here the heroes are the subject and have to be
// large enough to tell apart. Title / bio box / iris draw in screen space.
//
// Pure geometry (heroSlotRects) is split out and unit-tested.

import {
  CANVAS_W, CANVAS_H, TILE_SIZE as TS,
  WATER_FRAME_DURATION, WATER_FRAMES,
} from './overworldData.js';
import { TILE } from './tileAtlas.js';
import { WORLD_ART } from '../styles/brandColors.js';
import { drawIrisWipe, drawRetroBox, drawRoundedRect, drawText } from '../utils/canvas.js';

// ── Village map — the harbor's town/park continued upward ────────────────────
// Same tile vocabulary as harborData. Central PATH (cols 13-14) is the road
// down to the pier; heroes stand on the open green (row 8) flanking it; the
// bottom rows hand off to beach + dock so it blends straight into the harbor.
const W = TILE.BUILDING_WALL;
const B = TILE.BUILDING_DOOR;
const F = TILE.FLOOR_STONE;
const T = TILE.TABLE;
const P = TILE.PATH;
const G = TILE.GRASS;
const R = TILE.ROCK;
const L = TILE.FLOWERS;
const V = TILE.TREE;
const A = TILE.SAND;
const K = TILE.DOCK;
const S = TILE.SHALLOW_WATER;
const D = TILE.DEEP_WATER;

const AVATAR_COLS = 28;
const AVATAR_ROWS = 15;

// prettier-ignore
const AVATAR_MAP = [
  /* 0 */ [V,R,V,W,B,W,V,T,F,F,T,F,F,P,P,F,F,T,F,F,V,W,B,W,V,R,V,G],
  /* 1 */ [G,V,R,W,F,F,T,F,F,L,F,F,F,P,P,F,F,F,L,F,F,T,F,F,W,R,V,G],
  /* 2 */ [R,G,L,F,W,B,W,F,F,F,F,L,F,P,P,F,L,F,F,F,W,B,W,F,L,G,R,V],
  /* 3 */ [V,G,G,F,F,F,F,T,F,L,F,F,F,P,P,F,F,F,L,F,T,F,F,F,G,G,V,R],
  /* 4 */ [R,V,G,L,G,G,V,G,G,L,G,G,G,P,P,G,G,L,G,G,V,G,G,L,G,V,R,G],
  /* 5 */ [G,G,G,G,L,G,G,G,V,G,G,L,G,P,P,G,L,G,G,V,G,G,L,G,G,G,G,G],
  /* 6 */ [V,G,L,G,G,G,G,G,G,G,L,G,G,P,P,G,G,L,G,G,G,G,G,G,L,G,V,G],
  /* 7 */ [G,R,G,G,V,G,L,G,G,G,G,G,G,P,P,G,G,G,G,G,L,G,V,G,G,R,G,V],
  /* 8 */ [G,G,G,G,G,G,G,G,G,G,G,G,G,P,P,G,G,G,G,G,G,G,G,G,G,G,G,G],
  /* 9 */ [V,G,L,G,G,V,G,G,L,G,G,G,G,P,P,G,G,G,L,G,G,V,G,L,G,G,V,G],
  /*10 */ [G,G,G,G,L,G,G,G,G,G,L,G,P,P,P,P,G,L,G,G,G,G,G,L,G,G,G,G],
  /*11 */ [G,R,G,L,G,G,G,L,G,G,P,P,P,P,P,P,G,G,L,G,G,G,R,G,L,G,G,G],
  /*12 */ [A,A,A,A,A,A,A,A,A,A,A,A,A,K,K,A,A,A,A,A,A,A,A,A,A,A,A,A],
  /*13 */ [S,S,S,S,S,S,S,S,S,S,S,S,S,K,K,S,S,S,S,S,S,S,S,S,S,S,S,S],
  /*14 */ [S,S,D,S,S,S,S,D,S,S,S,S,S,K,K,S,S,S,D,S,S,S,D,S,S,D,S,S],
];

// Hero line-up — a tight party of friends clustered on the road (cols ~12-15),
// centred on the cobblestone path, ready to head down to the docks.
const PATH_CENTER_COL = 14;      // x-centre of the road (cols 13-14)
const HERO_STRIDE = 1.15;        // tiles between hero centres (tight cluster)
const HERO_ROW = 8;              // base row, just above the road
const HERO_ARC = [-0.08, 0.05, 0.05, -0.08]; // subtle arc — inner two a step forward
const WALK_FRAME_SEC = 0.36;

// Sprite-left column of hero i, with the group centred on the road.
function heroCol(i, count) {
  return PATH_CENTER_COL + (i - (count - 1) / 2) * HERO_STRIDE - 0.5;
}
function heroRowAt(i) {
  return HERO_ROW + (HERO_ARC[i] || 0);
}

// ── Scene camera ─────────────────────────────────────────────────────────────
// The screen rests on the whole village and pushes in on whichever hero is
// being considered, so the child sees who they are about to pick (at
// full-village scale the characters are too small to tell apart).
//
// Everything drawn and everything clickable is derived from the same camera, so
// the heroes on screen and the heroes you can click can never drift apart.
const SCENE_REST_SCALE = 1.5;
const SCENE_ZOOM_SCALE = 3.0;
const ZOOM_SECONDS = 3;            // how long the push-in takes to settle
const ZOOM_TAU = ZOOM_SECONDS / 3; // three time constants is close enough to settled

// heroCol returns a sprite-LEFT column, so the group's visual centre is
// PATH_CENTER_COL itself. Focusing half a tile off leaves the line-up skewed.
export const REST_CAMERA = {
  scale: SCENE_REST_SCALE,
  col: PATH_CENTER_COL,
  row: HERO_ROW - 0.2, // heroes sit just below centre, clear of the sign
};

// Where the camera wants to be: resting wide, or pushed in on one hero.
export function targetCamera(hoverIndex, count) {
  if (hoverIndex == null || hoverIndex < 0) return REST_CAMERA;
  return {
    scale: SCENE_ZOOM_SCALE,
    col: heroCol(hoverIndex, count) + 0.5, // sprite-left → sprite centre
    row: heroRowAt(hoverIndex) + 0.5,
  };
}

/**
 * Ease a camera toward a target. Exponential, so it is frame-rate independent
 * and always heads for the newest target: a child sweeping the arrow keys gets
 * one continuous glide rather than a queue of finished moves.
 */
export function easeCamera(cam, target, dt) {
  const k = 1 - Math.exp(-Math.max(0, dt) / ZOOM_TAU);
  return {
    scale: cam.scale + (target.scale - cam.scale) * k,
    col: cam.col + (target.col - cam.col) * k,
    row: cam.row + (target.row - cam.row) * k,
  };
}

function sceneOrigin(cam) {
  const tile = TS * cam.scale;
  return { ox: CANVAS_W / 2 - cam.col * tile, oy: CANVAS_H / 2 - cam.row * tile, tile };
}

// Same variant hash as the harbor renderer, for pixel-identical tiling.
function variantIndex(col, row, count) {
  return ((col * 7 + row * 13 + col * row) & 0x7FFFFFFF) % count;
}

function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(109,176,108,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Screen-space rect of a hero sprite (matches the world draw, post-scale).
function heroScreenRect(i, count, cam = REST_CAMERA) {
  const { ox, oy, tile } = sceneOrigin(cam);
  return {
    x: ox + heroCol(i, count) * tile,
    y: oy + heroRowAt(i) * tile,
    width: tile,
    height: tile,
  };
}

/**
 * Hit zones for the heroes — square, centred on each sprite. The side is
 * clamped to just under the (tight) stride so clustered zones never overlap.
 * Pure geometry, recomputed as the camera moves so the zones always sit under
 * what the child can see.
 */
export function heroSlotRects(count, cam = REST_CAMERA) {
  const { tile } = sceneOrigin(cam);
  const strideX = HERO_STRIDE * tile;
  const side = Math.min(tile + 24, strideX - 2);
  const rects = [];
  for (let i = 0; i < count; i++) {
    const s = heroScreenRect(i, count, cam);
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    rects.push({ x: cx - side / 2, y: cy - side / 2, width: side, height: side });
  }
  return rects;
}

// ── World: village tiles (drawn in tile coords, inside translate+scale) ──────
function drawVillageTiles(ctx, atlas, time) {
  const waterFrame = Math.floor((time || 0) / WATER_FRAME_DURATION) % WATER_FRAMES;
  for (let row = 0; row < AVATAR_ROWS; row++) {
    for (let col = 0; col < AVATAR_COLS; col++) {
      const tileId = AVATAR_MAP[row][col];
      const dx = col * TS;
      const dy = row * TS;
      if (tileId === TILE.DEEP_WATER) {
        const f = atlas.waterFrames?.deep?.[waterFrame];
        if (f) ctx.drawImage(f, dx, dy);
      } else if (tileId === TILE.SHALLOW_WATER) {
        const f = atlas.waterFrames?.shallow?.[waterFrame];
        if (f) ctx.drawImage(f, dx, dy);
      } else {
        const variants = atlas.tiles[tileId];
        if (variants) ctx.drawImage(variants[variantIndex(col, row, variants.length)], dx, dy);
      }
    }
  }
}

// ── World: ambient villagers (background life) ───────────────────────────────
// Reuses the harbor's per-island NPC sprites; each paces back and forth on the
// green via sin(time), so it's fully deterministic (no per-frame state). Placed
// to the sides of the central party so they frame it without crowding.
const VILLAGERS = [
  // Two stroll the paved plazas by the houses (row 3, on FLOOR_STONE)…
  { col: 4.5, row: 3,    range: 1.3, speed: 0.40, phase: 0.0, island: 'local',     variant: 1 },
  { col: 22,  row: 3,    range: 1.1, speed: 0.34, phase: 1.7, island: 'growing',   variant: 0 },
  // …two wander the lower green, framing the party.
  { col: 6,   row: 10.5, range: 1.8, speed: 0.50, phase: 3.1, island: 'circular',  variant: 2 },
  { col: 21,  row: 11,   range: 2.0, speed: 0.44, phase: 4.6, island: 'foodwaste', variant: 3 },
];

function drawVillagers(ctx, atlas, time) {
  const t0 = time || 0;
  const frame = Math.floor(t0 / 0.5) % 2;
  for (const v of VILLAGERS) {
    const x = (v.col + Math.sin(t0 * v.speed + v.phase) * v.range) * TS;
    const y = v.row * TS;
    const bob = Math.sin(t0 * 2 + v.phase) * 1;

    // Shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(x + TS / 2, y + TS - 2, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const sprite = atlas.npcs?.[v.island]?.[v.variant]?.[frame];
    if (sprite) ctx.drawImage(sprite, Math.round(x), Math.round(y + bob));
  }
}

// ── World: the four heroes (native 32px sprites, inside translate+scale) ─────
function drawHeroes(ctx, state, heroFrames, heroes) {
  const count = heroes.length;
  const frame = Math.floor((state.time || 0) / WALK_FRAME_SEC) % 2;
  const interactive = state.phase === 'idle';
  for (let i = 0; i < count; i++) {
    const x = heroCol(i, count) * TS;
    const y = heroRowAt(i) * TS;
    const cx = x + TS / 2;
    const footY = y + TS - 2;
    const hovered = interactive && state.hoverIndex === i;

    // Selection ring — a crisp, gently pulsing pedestal that unmistakably marks
    // the four as the interactive choices (vs the plain-shadowed villagers).
    // Drawn over the ground but under the sprite.
    const pulse = 0.5 + 0.5 * Math.sin((state.time || 0) * 2.2 + i * 0.6);
    const rx = TS * (0.60 + pulse * 0.05);
    const ry = TS * (0.23 + pulse * 0.02);
    ctx.save();
    // Soft glowing fill
    ctx.beginPath();
    ctx.ellipse(cx, footY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 244, 205, ${0.26 + pulse * 0.16})`;
    ctx.fill();
    // Crisp golden-white border
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(255, 236, 168, ${0.78 + pulse * 0.22})`;
    ctx.stroke();
    ctx.restore();

    // Small contact shadow to ground the feet (subtle, inside the ring)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, footY, TS * 0.22, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Hover spotlight in the hero's own colour
    if (hovered) {
      ctx.save();
      const g = ctx.createRadialGradient(cx, footY, 2, cx, footY, TS * 0.72);
      g.addColorStop(0, hexA(heroes[i].shirt, 0.6));
      g.addColorStop(1, hexA(heroes[i].shirt, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, footY, TS * 0.72, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const lift = hovered ? 6 : 0;
    const fr = heroFrames[i] && heroFrames[i][0] && heroFrames[i][0][frame];
    if (fr) ctx.drawImage(fr, x, y - lift, TS, TS);
  }
}

// ── Controls line on the sign ────────────────────────────────────────────────
const KEY_ARROW_W = 26;
const KEY_GAP = 7;
const KEY_SEP = 20;
const CONTROLS_FONT = "600 13px 'Inter', system-ui, sans-serif";
const KEYCAP_FONT = "800 13px 'Fredoka', 'Inter', system-ui, sans-serif";
const CONTROLS_CYCLE = 2.4; // seconds for one full left-then-right nudge

// A key carved into the sign. `press` (0..1) sinks it into the wood, so the two
// arrows can take turns being nudged and read as "these are what you press".
function drawKeyCap(ctx, cx, cy, w, label, press) {
  const h = 21;
  const top = cy - h / 2;
  const sink = press * 2.5;
  drawRoundedRect(ctx, cx - w / 2, top + 3, w, h, 5, 'rgba(40,24,12,0.5)', null);
  drawRoundedRect(ctx, cx - w / 2, top + sink, w, h, 5, press > 0.5 ? '#F0D48A' : '#FFF3C4', null);
  drawText(ctx, label, cx, top + sink + h / 2 + 0.5, {
    font: KEYCAP_FONT,
    color: '#4A3A1E', align: 'center', baseline: 'middle',
  });
}

// A named key is as wide as its label wants, never narrower than an arrow key.
// Fixed widths are what let «Enter ή Space» spill over the old 56px cap.
function keyCapWidth(ctx, label) {
  ctx.font = KEYCAP_FONT;
  return Math.max(KEY_ARROW_W, Math.ceil(ctx.measureText(label || '').width) + 16);
}

// Width of the whole controls row, so the sign can be widened to hold it.
// Mirrors drawControls exactly: arrows · look · [Enter] or [Space] · choose.
function controlsRowWidth(ctx, strings) {
  ctx.font = CONTROLS_FONT;
  const lookW = ctx.measureText(strings.controlsLook || '').width;
  const orW = ctx.measureText(strings.controlsOr || '').width;
  const chooseW = ctx.measureText(strings.controlsChoose || '').width;
  return KEY_ARROW_W + KEY_GAP + KEY_ARROW_W + KEY_GAP + lookW
    + KEY_SEP + keyCapWidth(ctx, strings.controlsKeyEnter)
    + KEY_GAP + orW
    + KEY_GAP + keyCapWidth(ctx, strings.controlsKeySpace)
    + KEY_GAP + chooseW;
}

// The arrows and both confirm keys, each in its own keycap. This line never
// times out: a hint that disappears was a reported defect on
// the harbour screen. Enter and Space sink together — either one confirms.
function drawControls(ctx, cy, strings, time) {
  const t = ((time || 0) % CONTROLS_CYCLE) / CONTROLS_CYCLE;
  const nudge = (from) => (t >= from && t < from + 0.16 ? Math.sin(((t - from) / 0.16) * Math.PI) : 0);

  let x = CANVAS_W / 2 - controlsRowWidth(ctx, strings) / 2;
  const cap = (w, label, press) => { drawKeyCap(ctx, x + w / 2, cy, w, label, press); x += w; };
  const label = (s) => {
    ctx.font = CONTROLS_FONT;
    drawText(ctx, s || '', x, cy, {
      font: CONTROLS_FONT, color: 'rgba(255,243,196,0.92)', align: 'left', baseline: 'middle',
    });
    x += ctx.measureText(s || '').width;
  };

  cap(KEY_ARROW_W, '◀', nudge(0));
  x += KEY_GAP;
  cap(KEY_ARROW_W, '▶', nudge(0.3));
  x += KEY_GAP;
  label(strings.controlsLook);
  x += KEY_SEP;
  const confirmNudge = nudge(0.6);
  cap(keyCapWidth(ctx, strings.controlsKeyEnter), strings.controlsKeyEnter, confirmNudge);
  x += KEY_GAP;
  label(strings.controlsOr);
  x += KEY_GAP;
  cap(keyCapWidth(ctx, strings.controlsKeySpace), strings.controlsKeySpace, confirmNudge);
  x += KEY_GAP;
  label(strings.controlsChoose);
}

// ── In-world wooden village sign ─────────────────────────────────────────────
function drawTitle(ctx, strings, time) {
  const title = strings.title || '';
  const subtitle = strings.subtitle || '';
  const titleFont = "800 31px 'Fredoka', 'IBM Plex Sans', system-ui, sans-serif";
  ctx.font = titleFont;
  const tw = ctx.measureText(title).width;
  const rowW = controlsRowWidth(ctx, strings);
  const w = Math.max(tw + 104, rowW + 72, 440);
  const h = 96; // title, subtitle and the controls line
  const x = CANVAS_W / 2 - w / 2;
  const y = 20;

  // Frame (dark wood) → board face (mid wood)
  drawRoundedRect(ctx, x - 6, y - 5, w + 12, h + 10, 10, WORLD_ART.woodDeep, null);
  drawRoundedRect(ctx, x, y, w, h, 7, WORLD_ART.woodMid, null);

  // Wood grain — a couple of subtle planks near the edges (clear of the text)
  ctx.strokeStyle = 'rgba(40,24,12,0.18)';
  ctx.lineWidth = 1;
  for (const gy of [y + 8, y + h - 8]) {
    ctx.beginPath();
    ctx.moveTo(x + 12, gy);
    ctx.lineTo(x + w - 12, gy);
    ctx.stroke();
  }

  // Corner bolts (dark stud + tiny highlight)
  const bolt = (bx, by) => {
    ctx.fillStyle = WORLD_ART.woodDeep;
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,243,196,0.55)';
    ctx.beginPath(); ctx.arc(bx - 1, by - 1, 1.3, 0, Math.PI * 2); ctx.fill();
  };
  bolt(x + 12, y + 12); bolt(x + w - 12, y + 12);
  bolt(x + 12, y + h - 12); bolt(x + w - 12, y + h - 12);

  // Carved/painted title — warm cream with a soft dark shadow
  drawText(ctx, title, CANVAS_W / 2, y + 25 + 1.2, {
    font: titleFont, color: 'rgba(40,24,12,0.45)', align: 'center', baseline: 'middle',
  });
  drawText(ctx, title, CANVAS_W / 2, y + 25, {
    font: titleFont, color: '#FFF3C4', align: 'center', baseline: 'middle',
  });
  drawText(ctx, subtitle, CANVAS_W / 2, y + 48, {
    font: "600 15px 'Inter', system-ui, sans-serif",
    color: 'rgba(255,243,196,0.82)', align: 'center', baseline: 'middle',
  });
  drawControls(ctx, y + 73, strings, time);
}

// ── Hover bio box (shared retro Pokémon chrome) ──────────────────────────────
function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${cur} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) cur = test;
    else { lines.push(cur); cur = words[i]; }
  }
  lines.push(cur);
  return lines;
}

// Two-line introduction box: bold Name header + warm divider + first-person
// Bio body. Structured this way so final names drop straight in.
function drawBioBox(ctx, slot, name, bio) {
  const nameFont = "800 17px 'Fredoka', 'Inter', system-ui, sans-serif";
  const bioFont = "600 15px 'Inter', system-ui, sans-serif";
  const maxTextW = 280;
  const padX = 16;
  const padY = 13;

  ctx.font = bioFont;
  const bioLines = wrapText(ctx, bio, maxTextW);
  let textW = 0;
  for (const ln of bioLines) textW = Math.max(textW, ctx.measureText(ln).width);
  ctx.font = nameFont;
  textW = Math.max(textW, ctx.measureText(name || '').width);
  const w = Math.min(maxTextW, textW) + padX * 2;

  const nameH = 22;
  const dividerGap = 9;
  const bioLineH = 20;
  const h = padY * 2 + nameH + dividerGap + bioLines.length * bioLineH;

  let x = slot.x + slot.width / 2 - w / 2;
  let y = slot.y - h - 16;
  let pointDown = true;
  x = Math.max(10, Math.min(x, CANVAS_W - w - 10));
  if (y < 8) { y = slot.y + slot.height + 16; pointDown = false; }

  drawRetroBox(ctx, x, y, w, h, { radius: 8 });

  // Header — name (bold, dark) with a short warm-wood divider (not a UI link)
  drawText(ctx, name || '', x + w / 2, y + padY + nameH / 2, {
    font: nameFont, color: '#2A2440', align: 'center', baseline: 'middle',
  });
  const ulw = Math.min(w - padX * 2, 72);
  ctx.strokeStyle = WORLD_ART.panelBrown;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - ulw / 2, y + padY + nameH + 1);
  ctx.lineTo(x + w / 2 + ulw / 2, y + padY + nameH + 1);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Body — first-person bio
  const bodyTop = y + padY + nameH + dividerGap;
  bioLines.forEach((ln, i) => drawText(ctx, ln, x + w / 2, bodyTop + i * bioLineH + bioLineH / 2, {
    font: bioFont, color: '#4A4458', align: 'center', baseline: 'middle',
  }));

  // Pointer tail toward the hero
  const tx = Math.max(x + 14, Math.min(slot.x + slot.width / 2, x + w - 14));
  ctx.fillStyle = '#10141F';
  ctx.beginPath();
  if (pointDown) { ctx.moveTo(tx - 8, y + h); ctx.lineTo(tx + 8, y + h); ctx.lineTo(tx, y + h + 10); }
  else { ctx.moveTo(tx - 8, y); ctx.lineTo(tx + 8, y); ctx.lineTo(tx, y - 10); }
  ctx.closePath();
  ctx.fill();
}

// ── Full scene ───────────────────────────────────────────────────────────────
export function renderAvatarSelect(ctx, state, { atlas, heroFrames, heroes, strings }) {
  ctx.imageSmoothingEnabled = false;

  // Deep-ocean backdrop (matches the harbor's edge-clip backdrop)
  ctx.fillStyle = WORLD_ART.oceanDeep;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // World — village tiles + heroes, through the live camera
  const cam = state.cam || REST_CAMERA;
  const { ox, oy } = sceneOrigin(cam);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(cam.scale, cam.scale);
  drawVillageTiles(ctx, atlas, state.time);
  drawVillagers(ctx, atlas, state.time);
  drawHeroes(ctx, state, heroFrames, heroes);
  ctx.restore();

  // Screen-space UI
  drawTitle(ctx, strings, state.time);

  if (state.phase === 'idle' && state.hoverIndex >= 0) {
    const hi = state.hoverIndex;
    drawBioBox(ctx, heroScreenRect(hi, heroes.length, cam), strings.names?.[hi] || '', strings.bios?.[hi] || '');
  }

  drawIrisWipe(
    ctx,
    state.irisCx == null ? CANVAS_W / 2 : state.irisCx,
    state.irisCy == null ? CANVAS_H / 2 : state.irisCy,
    state.irisOpenness == null ? 1 : state.irisOpenness,
    CANVAS_W, CANVAS_H,
  );
}
