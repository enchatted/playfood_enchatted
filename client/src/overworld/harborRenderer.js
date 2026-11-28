// Harbor renderer — Living Diorama: bustling pirate port for the main menu scene.
// 28×15 full-bleed map zoomed 1.5× on the 1280×704 canvas.
// At this scale (1344×720), the map overflows by 32px/side + 8px top/bottom,
// creating natural edge-clipping with no solid-color borders.
// World functions draw in tile coords (inside ctx.translate + ctx.scale).
// UI functions draw at native 1280×704 resolution (outside scale context).
// Ambient systems: patrolling NPCs, seagulls, chimney smoke, dock flags, fish.

import {
  TILE_SIZE as TS, MOVE_DURATION, CANVAS_W, CANVAS_H, HUD_HEIGHT,
  WATER_FRAME_DURATION, WATER_FRAMES,
} from './overworldData.js';
import { HARBOR_COLS, HARBOR_ROWS, HARBOR_MAP, CAPTAIN_POS, SMALL_BOAT_POS, MAIN_SHIP_POS } from './harborData.js';
import { TILE } from './tileAtlas.js';
import { BRAND, WORLD_ART } from '../styles/brandColors.js';
import {
  drawRoundedRect, drawText, drawStatsBadge,
  hasActiveBottomPrompt, HINT_VISIBLE_SECONDS,
} from '../utils/canvas.js';
import { DRAFT_MODE } from '../config/draftMode.js';

// ─── Zoom & centering ────────────────────────────────────
// 1.5x zoom — full-bleed: map overflows canvas on all sides.
// Scaled: 28*32*1.5 = 1344 wide, 15*32*1.5 = 720 tall
// OX = (1280 - 1344) / 2 = -32,  OY = (704 - 720) / 2 = -8
export const HARBOR_SCALE = 1.5;
export const HARBOR_OX = (CANVAS_W - HARBOR_COLS * TS * HARBOR_SCALE) / 2;
export const HARBOR_OY = (CANVAS_H - HARBOR_ROWS * TS * HARBOR_SCALE) / 2;

// Deterministic variant index (same hash as other renderers)
function variantIndex(col, row, count) {
  return ((col * 7 + row * 13 + col * row) & 0x7FFFFFFF) % count;
}

// ─── Background (native resolution) ─────────────────────
// Full-bleed: just a deep navy fill — the map tiles cover everything visible.

export function renderHarborBackground(ctx) {
  // Backdrop reads as deep ocean continuation beyond the harbor (map overflows
  // canvas at 1.5× zoom, so this color is visible at the edges).
  if (DRAFT_MODE) {
    // Flat deep-ocean background — no gradient
    ctx.fillStyle = WORLD_ART.oceanDeep;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    return;
  }

  ctx.fillStyle = WORLD_ART.oceanDeep;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

// ═══════════════════════════════════════════════════════════
// WORLD FUNCTIONS — draw in tile coords (inside ctx.scale)
// ═══════════════════════════════════════════════════════════

// ─── Tiles (with animated water) ─────────────────────────

export function renderHarborTiles(ctx, atlas, time) {
  if (DRAFT_MODE) {
    // Flat colored rectangles — no atlas sprites, no animated water
    for (let row = 0; row < HARBOR_ROWS; row++) {
      for (let col = 0; col < HARBOR_COLS; col++) {
        const tileId = HARBOR_MAP[row][col];
        const dx = col * TS;
        const dy = row * TS;

        if (tileId === TILE.DEEP_WATER) {
          ctx.fillStyle = WORLD_ART.oceanMid;
        } else if (tileId === TILE.SHALLOW_WATER) {
          ctx.fillStyle = WORLD_ART.oceanWaveMid;
        } else if (tileId === TILE.DOCK) {
          ctx.fillStyle = WORLD_ART.wood;
        } else if (tileId === TILE.SAND) {
          ctx.fillStyle = WORLD_ART.sandBase;
        } else if (tileId === TILE.BUILDING_WALL) {
          ctx.fillStyle = WORLD_ART.stoneMid;
        } else if (tileId === TILE.BUILDING_DOOR) {
          ctx.fillStyle = WORLD_ART.woodShadow;
        } else if (tileId === TILE.GRASS || tileId === TILE.DARK_GRASS) {
          ctx.fillStyle = tileId === TILE.GRASS ? WORLD_ART.grassMid : WORLD_ART.grassDeep;
        } else if (tileId === TILE.PATH || tileId === TILE.BRIDGE) {
          ctx.fillStyle = WORLD_ART.pathBase;
        } else if (tileId === TILE.TREE) {
          ctx.fillStyle = WORLD_ART.foliageDeep;
        } else if (tileId === TILE.ROCK) {
          ctx.fillStyle = WORLD_ART.stoneShadow;
        } else if (tileId === TILE.FLOWERS) {
          ctx.fillStyle = WORLD_ART.grassLight;
        } else if (tileId === TILE.BUOY) {
          ctx.fillStyle = BRAND.red;
        } else {
          ctx.fillStyle = WORLD_ART.stoneMid;
        }

        ctx.fillRect(dx, dy, TS, TS);
        // Grid lines for draft clarity
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(dx, dy, TS, TS);
      }
    }
    return;
  }

  const waterFrame = Math.floor(time / WATER_FRAME_DURATION) % WATER_FRAMES;

  for (let row = 0; row < HARBOR_ROWS; row++) {
    for (let col = 0; col < HARBOR_COLS; col++) {
      const tileId = HARBOR_MAP[row][col];
      const dx = col * TS;
      const dy = row * TS;

      if (tileId === TILE.DEEP_WATER) {
        const frame = atlas.waterFrames?.deep?.[waterFrame];
        if (frame) ctx.drawImage(frame, dx, dy);
      } else if (tileId === TILE.SHALLOW_WATER) {
        const frame = atlas.waterFrames?.shallow?.[waterFrame];
        if (frame) ctx.drawImage(frame, dx, dy);
      } else {
        const variants = atlas.tiles[tileId];
        if (variants) {
          const idx = variantIndex(col, row, variants.length);
          ctx.drawImage(variants[idx], dx, dy);
        }
      }
    }
  }
}

// ─── Boats (main ship + Chris-Craft speedboat) ──────────
// Main ship: atlas sprite at 3× anchored far out in deep water (col 24).
// Chris-Craft: canvas-drawn white speedboat on the LEFT of the pier.

export function renderHarborBoats(ctx, atlas, time, state) {
  if (DRAFT_MODE) {
    // Main ship — simple rectangle + triangle sail
    {
      const sx = MAIN_SHIP_POS.col * TS;
      const sy = MAIN_SHIP_POS.row * TS;
      const sw = TS * 3;
      const sh = TS * 3;
      // Hull rectangle
      ctx.fillStyle = '#795548';
      ctx.fillRect(sx - sw / 2 + TS / 2, sy - sh / 2 + TS / 2, sw, sh * 0.6);
      ctx.strokeStyle = '#4E342E';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - sw / 2 + TS / 2, sy - sh / 2 + TS / 2, sw, sh * 0.6);
      // Triangle sail
      const cx = sx + TS / 2;
      const topY = sy - sh / 2 + TS / 2 - 20;
      ctx.fillStyle = '#FAFAFA';
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.lineTo(cx - 20, sy - sh / 2 + TS / 2 + sh * 0.5);
      ctx.lineTo(cx + 20, sy - sh / 2 + TS / 2 + sh * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#BDBDBD';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Label
      drawText(ctx, 'SHIP', cx, sy + TS / 2, {
        font: "bold 9px sans-serif", color: '#fff',
        align: 'center', baseline: 'middle',
      });
    }

    // Small boat — simple rectangle
    {
      const bx = state.smallBoatX;
      const by = state.smallBoatY;
      const bw = 24;
      const bh = 14;
      ctx.fillStyle = '#F5F5F5';
      ctx.fillRect(bx + TS / 2 - bw / 2, by + TS / 2 - bh / 2, bw, bh);
      ctx.strokeStyle = '#B0BEC5';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + TS / 2 - bw / 2, by + TS / 2 - bh / 2, bw, bh);
      // Bow triangle
      ctx.fillStyle = '#F5F5F5';
      ctx.beginPath();
      ctx.moveTo(bx + TS / 2, by + TS / 2 - bh / 2 - 6);
      ctx.lineTo(bx + TS / 2 - bw / 2, by + TS / 2 - bh / 2);
      ctx.lineTo(bx + TS / 2 + bw / 2, by + TS / 2 - bh / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawText(ctx, 'BOAT', bx + TS / 2, by + TS / 2 + 2, {
        font: "bold 6px sans-serif", color: '#546E7A',
        align: 'center', baseline: 'middle',
      });
    }
    return;
  }

  const sprite = atlas.boat?.[0]?.[0]; // DIR.DOWN frame 0

  // ── 1. Main Ship (atlas sprite — anchored in deep water) ──
  if (sprite) {
    const bob = Math.sin(time * 1.2) * 2.5;  // slow, majestic roll
    const sc = 3;
    const w = TS * sc;   // 96
    const h = TS * sc;   // 96
    const dx = MAIN_SHIP_POS.col * TS + (TS - w) / 2;
    const dy = MAIN_SHIP_POS.row * TS + (TS - h) / 2;

    // Shadow on water
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(dx + w / 2, dy + h + 4 + bob, w * 0.35, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Long mooring rope — RIGHT dock edge (col 15, row 11) to ship hull
    const ropeStartX = 15 * TS;                        // right edge of dock bottom
    const ropeStartY = 11 * TS + TS / 2;               // middle of last dock row
    const ropeEndX = dx + w * 0.1;                     // left side of ship hull
    const ropeEndY = dy + h * 0.5 + bob;
    // Deep sag for a long rope across open water
    const ropeMidX = (ropeStartX + ropeEndX) / 2;
    const ropeSagY = Math.max(ropeStartY, ropeEndY) + 18 + Math.sin(time * 0.8) * 3;
    ctx.strokeStyle = WORLD_ART.wood;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ropeStartX, ropeStartY);
    ctx.quadraticCurveTo(ropeMidX, ropeSagY, ropeEndX, ropeEndY);
    ctx.stroke();
    // Bollard on dock
    ctx.fillStyle = WORLD_ART.woodShadow;
    ctx.beginPath();
    ctx.arc(ropeStartX, ropeStartY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Cleat on ship hull
    ctx.beginPath();
    ctx.arc(ropeEndX, ropeEndY, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;

    ctx.drawImage(sprite, Math.round(dx), Math.round(dy + bob), w, h);
  }

  // ── 2. Chris-Craft Speedboat (canvas-drawn — LEFT of pier) ──
  // Hull is drawn relative to (0,0) inside a translate+rotate transform.
  // Rope and wake are drawn in world space before the transform.
  {
    const bob = Math.sin(time * 2.5) * 1.5;
    const bx = state.smallBoatX;
    const by = state.smallBoatY;
    const cx = bx + TS / 2;
    const cy = by + TS / 2 + bob;
    const angle = state.boatAngle || 0;  // radians, 0 = pointing UP

    const bLen = 28;   // hull length (bow to stern)
    const bWid = 12;   // hull width at widest

    // Mooring rope — world space (only while docked, angle ≈ 0)
    const docked = state.boardPhase === 'none' || state.boardPhase === 'walking';
    if (docked) {
      const ropeStartX = 13 * TS;
      const ropeStartY = SMALL_BOAT_POS.row * TS + TS / 2;
      const ropeEndX = cx + bWid / 2 + 1;
      const ropeEndY = cy;
      const sagY = Math.max(ropeStartY, ropeEndY) + 5 + Math.sin(time * 1.5) * 1;
      ctx.strokeStyle = WORLD_ART.wood;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ropeStartX, ropeStartY);
      ctx.quadraticCurveTo((ropeStartX + ropeEndX) / 2, sagY, ropeEndX, ropeEndY);
      ctx.stroke();
      ctx.fillStyle = WORLD_ART.woodShadow;
      ctx.beginPath();
      ctx.arc(ropeStartX, ropeStartY, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
    }

    // Dynamic wake trail — world space (uses velocity vector)
    if (state.boardPhase === 'sailing_out' && state.sailTargetX != null) {
      const vx = state.sailTargetX - bx;
      const vy = state.sailTargetY - by;
      const mag = Math.sqrt(vx * vx + vy * vy);
      if (mag > 1) {
        const nx = -vx / mag;
        const ny = -vy / mag;
        const px = -ny;
        const py = nx;
        const wakeLen = 16;
        const wakeSpread = 7;
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#B3E5FC';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + nx * wakeLen + px * wakeSpread, cy + ny * wakeLen + py * wakeSpread);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + nx * wakeLen - px * wakeSpread, cy + ny * wakeLen - py * wakeSpread);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        for (let i = 1; i <= 4; i++) {
          const fx = cx + nx * (wakeLen + i * 5) + Math.sin(time * 5 + i) * 2;
          const fy = cy + ny * (wakeLen + i * 5) + Math.cos(time * 5 + i) * 2;
          ctx.beginPath();
          ctx.arc(fx, fy, 1.5 - i * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
      }
    }

    // Shadow — world space
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, cy + bLen / 2 + 3, bWid * 0.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ─── Rotated hull ─────────────────────────────────
    // All coordinates below are relative to (0, 0) = boat center
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Hull (white, pointed bow at -y)
    ctx.fillStyle = '#F5F5F5';
    ctx.strokeStyle = '#B0BEC5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -bLen / 2);                                    // bow tip
    ctx.lineTo( bWid / 2, -bLen / 2 + 10);                      // starboard shoulder
    ctx.lineTo( bWid / 2,  bLen / 2 - 3);                       // starboard stern
    ctx.quadraticCurveTo(0, bLen / 2 + 2, -bWid / 2, bLen / 2 - 3); // rounded stern
    ctx.lineTo(-bWid / 2, -bLen / 2 + 10);                      // port shoulder
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mahogany deck strip
    ctx.fillStyle = '#6D4C41';
    ctx.fillRect(-4, -2, 8, 10);
    ctx.strokeStyle = '#5D4037';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-3, 0); ctx.lineTo(3, 0);
    ctx.moveTo(-3, 3); ctx.lineTo(3, 3);
    ctx.moveTo(-3, 6); ctx.lineTo(3, 6);
    ctx.stroke();
    ctx.lineWidth = 1;

    // Windshield (light blue)
    ctx.fillStyle = 'rgba(100,181,246,0.7)';
    ctx.strokeStyle = '#90CAF9';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo( 4, -4);
    ctx.lineTo( 3, -8);
    ctx.lineTo(-3, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Chrome trim (gunwales)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-bWid / 2 + 1, -bLen / 2 + 11);
    ctx.lineTo(-bWid / 2 + 1,  bLen / 2 - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo( bWid / 2 - 1, -bLen / 2 + 11);
    ctx.lineTo( bWid / 2 - 1,  bLen / 2 - 4);
    ctx.stroke();

    // Red racing stripes
    ctx.strokeStyle = '#E53935';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-bWid / 2 - 0.5, -bLen / 2 + 12);
    ctx.lineTo(-bWid / 2 - 0.5,  bLen / 2 - 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo( bWid / 2 + 0.5, -bLen / 2 + 12);
    ctx.lineTo( bWid / 2 + 0.5,  bLen / 2 - 5);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.restore();
  }
}

// ─── Captain NPC ─────────────────────────────────────────

export function renderHarborCaptain(ctx, atlas, time) {
  if (DRAFT_MODE) {
    const dx = CAPTAIN_POS.col * TS;
    const dy = CAPTAIN_POS.row * TS;
    const cx = dx + TS / 2;
    const cy = dy + TS / 2;
    // Rectangle body
    ctx.fillStyle = '#1565C0';
    ctx.fillRect(cx - 8, cy - 4, 16, 18);
    ctx.strokeStyle = '#0D47A1';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 8, cy - 4, 16, 18);
    // Circle head
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E0A060';
    ctx.stroke();
    // Label
    drawText(ctx, 'CAPTAIN', cx, cy + 20, {
      font: "bold 7px sans-serif", color: '#fff',
      align: 'center', baseline: 'middle',
    });
    return;
  }

  const dx = CAPTAIN_POS.col * TS;
  const dy = CAPTAIN_POS.row * TS;

  // Shadow
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(dx + TS / 2, dy + TS - 2, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Idle bob
  const bob = Math.sin(time * 2) * 1;

  // NPC frame
  const npcFrame = Math.floor(time / 0.5) % 2;
  const sprite = atlas.npcs?.foodwaste?.[0]?.[npcFrame];
  if (sprite) {
    ctx.drawImage(sprite, Math.round(dx), Math.round(dy + bob));
  }
}

// ─── Player (walking character) ──────────────────────────

export function renderHarborPlayer(ctx, state, atlas) {
  if (DRAFT_MODE) {
    const p = state.player;
    // Simple colored rectangle — no animation, no bounce
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(Math.round(p.pixelX + 4), Math.round(p.pixelY + 2), TS - 8, TS - 4);
    ctx.strokeStyle = '#2E7D32';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(p.pixelX + 4), Math.round(p.pixelY + 2), TS - 8, TS - 4);
    // Circle head
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.arc(Math.round(p.pixelX + TS / 2), Math.round(p.pixelY - 2), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E0A060';
    ctx.stroke();
    // Label
    drawText(ctx, 'PLAYER', Math.round(p.pixelX + TS / 2), Math.round(p.pixelY + TS + 6), {
      font: "bold 6px sans-serif", color: '#1B5E20',
      align: 'center', baseline: 'middle',
    });
    return;
  }

  const p = state.player;

  const walkFrame = p.moving ? (Math.floor(state.time / 0.12) % 2) : 0;

  let bounceY = 0;
  if (p.moving) {
    const progress = p.moveTimer / MOVE_DURATION;
    bounceY = -Math.sin(progress * Math.PI) * 3;
  } else {
    bounceY = Math.sin(state.time * 2) * 0.5;
  }

  const sprite = atlas.player[p.dir]?.[walkFrame];
  if (sprite) {
    ctx.drawImage(sprite, Math.round(p.pixelX), Math.round(p.pixelY + bounceY));
  }
}

// ═══════════════════════════════════════════════════════════
// AMBIENT SYSTEMS — The Living Diorama
// ═══════════════════════════════════════════════════════════

// ─── Init ────────────────────────────────────────────────

export function initHarborAmbient(state) {
  if (DRAFT_MODE) {
    // Still initialise arrays so update/render don't crash, but keep them empty
    state.ambientNPCs = [];
    state.seagulls = [];
    state.seagullTimer = 99999;
    state.smokePuffs = [];
    state.smokeTimer = 99999;
    state.chimneys = [];
    state.flags = [];
    state.fish = [];
    return;
  }

  // A. Patrolling town NPCs (5 characters across the wider town)
  state.ambientNPCs = [
    { x:  3 * TS, y: 1 * TS, speed: 12, minX:  1 * TS, maxX:  6 * TS, dir: 1,  island: 'local',    variant: 1 },
    { x: 18 * TS, y: 1 * TS, speed: 10, minX: 16 * TS, maxX: 22 * TS, dir: -1, island: 'growing',  variant: 0 },
    { x: 10 * TS, y: 3 * TS, speed:  8, minX:  7 * TS, maxX: 12 * TS, dir: 1,  island: 'circular', variant: 0 },
    { x: 22 * TS, y: 3 * TS, speed: 11, minX: 20 * TS, maxX: 26 * TS, dir: -1, island: 'local',    variant: 0 },
    { x:  8 * TS, y: 2 * TS, speed:  9, minX:  5 * TS, maxX: 10 * TS, dir: 1,  island: 'growing',  variant: 1 },
  ];

  // B. Seagulls (flying across the sky)
  state.seagulls = [];
  state.seagullTimer = 2 + Math.random() * 3;

  // C. Chimney smoke puffs (above row-0 buildings)
  state.smokePuffs = [];
  state.smokeTimer = 0;
  state.chimneys = [
    { x:  4.5 * TS, y: -0.3 * TS },
    { x:  8.5 * TS, y: -0.3 * TS },
    { x: 19.5 * TS, y: -0.3 * TS },
    { x: 24.5 * TS, y: -0.3 * TS },
  ];

  // D. Dock flags (at pier entrance, beach row 5)
  state.flags = [
    { x: 13 * TS + TS / 2, y: 5 * TS, color: BRAND.red },
    { x: 14 * TS + TS / 2, y: 5 * TS, color: BRAND.orange },
  ];

  // E. Ambient fish (tiny colored pixels darting in the water)
  state.fish = [
    { x:  3 * TS, y:  8 * TS,   vx:  15, vy:  2, color: '#FF8A65', dartTimer: 0 },
    { x: 22 * TS, y:  9 * TS,   vx: -12, vy: -3, color: '#B0BEC5', dartTimer: 1.5 },
    { x:  8 * TS, y: 11 * TS,   vx:  10, vy:  1, color: '#FFB74D', dartTimer: 0.8 },
    { x: 24 * TS, y:  7.5 * TS, vx:  -8, vy:  2, color: '#B0BEC5', dartTimer: 2.0 },
    { x:  5 * TS, y: 13 * TS,   vx:  14, vy: -1, color: '#FF8A65', dartTimer: 1.2 },
    { x: 20 * TS, y: 10 * TS,   vx: -11, vy:  3, color: '#FFB74D', dartTimer: 0.5 },
  ];
}

// ─── Update ──────────────────────────────────────────────

export function updateHarborAmbient(state, dt) {
  if (DRAFT_MODE) return;   // No ambient systems in draft mode

  // A. Patrolling NPCs — pace back and forth
  for (const npc of state.ambientNPCs) {
    npc.x += npc.dir * npc.speed * dt;
    if (npc.x >= npc.maxX) { npc.x = npc.maxX; npc.dir = -1; }
    if (npc.x <= npc.minX) { npc.x = npc.minX; npc.dir = 1; }
  }

  // B. Seagulls — spawn and fly
  state.seagullTimer -= dt;
  if (state.seagullTimer <= 0 && state.seagulls.length < 4) {
    const fromLeft = Math.random() > 0.5;
    const sx = fromLeft ? -TS : (HARBOR_COLS + 1) * TS;
    const sy = Math.random() * 4 * TS;              // top quarter of map
    const vx = fromLeft ? 60 : -60;
    const vy = (Math.random() - 0.3) * 15;          // slight upward bias
    state.seagulls.push({ x: sx, y: sy, vx, vy, age: 0 });
    state.seagullTimer = 3 + Math.random() * 4;
  }
  for (let i = state.seagulls.length - 1; i >= 0; i--) {
    const g = state.seagulls[i];
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.age += dt;
    // Remove when off-screen
    if (g.x < -2 * TS || g.x > (HARBOR_COLS + 2) * TS || g.age > 15) {
      state.seagulls.splice(i, 1);
    }
  }

  // C. Chimney smoke — spawn puffs
  state.smokeTimer -= dt;
  if (state.smokeTimer <= 0) {
    const chimney = state.chimneys[Math.floor(Math.random() * state.chimneys.length)];
    state.smokePuffs.push({
      x: chimney.x + (Math.random() - 0.5) * 4,
      y: chimney.y,
      radius: 2,
      alpha: 0.5,
      vx: (Math.random() - 0.5) * 3,
    });
    state.smokeTimer = 0.8 + Math.random() * 0.8;
  }
  for (let i = state.smokePuffs.length - 1; i >= 0; i--) {
    const p = state.smokePuffs[i];
    p.y -= 8 * dt;
    p.x += p.vx * dt;
    p.radius += 3 * dt;
    p.alpha -= 0.25 * dt;
    if (p.alpha <= 0) state.smokePuffs.splice(i, 1);
  }

  // E. Ambient fish — drift and occasionally dart
  for (const f of state.fish) {
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.dartTimer -= dt;
    // Random dart — change direction suddenly
    if (f.dartTimer <= 0) {
      f.vx = (Math.random() - 0.5) * 30;
      f.vy = (Math.random() - 0.5) * 12;
      f.dartTimer = 2 + Math.random() * 3;
    }
    // Stay in water area (rows 7-14, full width)
    if (f.x < 0)                       { f.x = 0;                       f.vx = Math.abs(f.vx); }
    if (f.x > (HARBOR_COLS - 1) * TS)  { f.x = (HARBOR_COLS - 1) * TS;  f.vx = -Math.abs(f.vx); }
    if (f.y < 7 * TS)                  { f.y = 7 * TS;                  f.vy = Math.abs(f.vy); }
    if (f.y > 14 * TS)                 { f.y = 14 * TS;                 f.vy = -Math.abs(f.vy); }
  }
}

// ─── Render (world coords — inside ctx.scale) ───────────

export function renderHarborAmbient(ctx, state, atlas) {
  if (DRAFT_MODE) return;   // Skip all particles: NPCs, seagulls, smoke, flags, fish

  const { time } = state;

  // A. Patrolling NPCs
  for (const npc of state.ambientNPCs) {
    // Shadow
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(npc.x + TS / 2, npc.y + TS - 2, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Idle bob
    const bob = Math.sin(time * 2 + npc.x) * 1;
    const npcFrame = Math.floor(time / 0.5) % 2;
    const sprite = atlas.npcs?.[npc.island]?.[npc.variant]?.[npcFrame];
    if (sprite) {
      ctx.drawImage(sprite, Math.round(npc.x), Math.round(npc.y + bob));
    }
  }

  // B. Seagulls (white V-shape)
  for (const g of state.seagulls) {
    const wingFlap = Math.sin(time * 8 + g.age * 3) * 4;
    const flyBob = Math.sin(time * 1.5 + g.age) * 2;
    const gx = Math.round(g.x);
    const gy = Math.round(g.y + flyBob);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    // Left wing
    ctx.moveTo(gx - 5, gy + wingFlap);
    ctx.lineTo(gx, gy);
    // Right wing
    ctx.lineTo(gx + 5, gy + wingFlap);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }

  // C. Chimney smoke
  for (const p of state.smokePuffs) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = '#9E9E9E';
    ctx.beginPath();
    ctx.arc(Math.round(p.x), Math.round(p.y), p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // D. Dock flags (animated pennants)
  for (let i = 0; i < state.flags.length; i++) {
    const f = state.flags[i];
    const poleH = 14;
    const flagW = 10;
    const flagH = 7;

    // Pole
    ctx.strokeStyle = WORLD_ART.woodShadow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(f.x, f.y - poleH);
    ctx.stroke();
    ctx.lineWidth = 1;

    // Flag (triangle with waving trailing edge)
    const wave = Math.sin(time * 4 + i * 2) * 3;
    const topY = f.y - poleH;

    ctx.fillStyle = f.color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(f.x, topY);                                  // Attach point top
    ctx.lineTo(f.x + flagW + wave, topY + flagH / 2);       // Trailing tip (waving)
    ctx.lineTo(f.x, topY + flagH);                           // Attach point bottom
    ctx.closePath();
    ctx.fill();

    // Flag outline
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // E. Ambient fish (tiny colored pixels)
  for (const f of state.fish) {
    const fx = Math.round(f.x);
    const fy = Math.round(f.y);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = f.color;
    // Body: 3×2 pixel rectangle facing movement direction
    ctx.fillRect(fx, fy, 3, 2);
    // Tail: 1px behind the body
    const tailX = f.vx > 0 ? fx - 1 : fx + 3;
    ctx.fillRect(tailX, fy, 1, 2);
    ctx.globalAlpha = 1;
  }
}

// ═══════════════════════════════════════════════════════════
// UI FUNCTIONS — draw at native 1280×704 resolution
// ═══════════════════════════════════════════════════════════

// ─── Interaction Prompt ──────────────────────────────────

export function renderHarborPrompt(ctx, state) {
  let text = null;

  if (state.nearCaptain) {
    text = state.strings?.talkPrompt || 'Press Enter or Space to talk to the Captain';
  } else if (state.nearBoat) {
    text = state.strings?.boardPrompt || 'Press Enter or Space to board the ship';
  }

  if (!text) return;

  if (DRAFT_MODE) {
    // Simple text box — no pulse, no bounce, no shadow
    ctx.font = "bold 14px sans-serif";
    const promptW = Math.max(ctx.measureText(text).width + 40, 280);
    const promptH = 36;
    const px = CANVAS_W / 2 - promptW / 2;
    const py = CANVAS_H - 70;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(px, py, promptW, promptH);
    ctx.strokeStyle = BRAND.purple;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, promptW, promptH);
    drawText(ctx, text, CANVAS_W / 2, py + promptH / 2, {
      font: "bold 13px sans-serif", color: BRAND.purple,
      align: 'center', baseline: 'middle',
    });
    return;
  }

  const pulse = 0.9 + Math.sin(state.time * 3) * 0.1;
  const arrowBounce = Math.sin(state.time * 5) * 3;

  ctx.font = "bold 15px 'Inter', system-ui, sans-serif";
  const promptW = Math.max(ctx.measureText(text).width + 50, 300);
  const promptH = 46;
  const px = CANVAS_W / 2 - promptW / 2;
  const py = CANVAS_H - 75;

  ctx.globalAlpha = pulse;

  // Shadow
  drawRoundedRect(ctx, px + 2, py + 3, promptW, promptH, 16,
    'rgba(0,0,0,0.15)', 'transparent');
  // Main box (brand UI chrome = purple per PDF p.09)
  drawRoundedRect(ctx, px, py, promptW, promptH, 16,
    'rgba(255,255,255,0.95)', BRAND.purple);
  // Accent line
  ctx.lineWidth = 3;
  ctx.strokeStyle = BRAND.purple;
  ctx.beginPath();
  ctx.moveTo(px + 16, py);
  ctx.lineTo(px + promptW - 16, py);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Text
  drawText(ctx, text, CANVAS_W / 2, py + promptH / 2 - 2, {
    font: "bold 14px 'Inter', system-ui, sans-serif",
    color: BRAND.purple,
    align: 'center',
    baseline: 'middle',
  });

  // Bouncing icon
  const icon = state.nearCaptain ? '\uD83D\uDDE8' : '\u2693';
  drawText(ctx, icon, CANVAS_W / 2, py + promptH - 6 + arrowBounce, {
    font: '10px sans-serif',
    color: BRAND.purple,
    align: 'center',
    baseline: 'middle',
  });

  ctx.globalAlpha = 1.0;
}

// ─── Harbor HUD ──────────────────────────────────────────

export function renderHarborHUD(ctx, state, points, strings, stars) {
  if (DRAFT_MODE) {
    // Flat solid bar — brand UI chrome (purple per PDF p.09)
    ctx.fillStyle = BRAND.purple;
    ctx.fillRect(0, 0, CANVAS_W, HUD_HEIGHT);

    // Title (center)
    const title = strings?.hubTitle || 'PLAYFOOD Archipelago';
    drawText(ctx, title, CANVAS_W / 2, HUD_HEIGHT / 2, {
      font: "bold 17px sans-serif", color: '#fff',
      align: 'center', baseline: 'middle',
    });

    // Points (right) — simple rectangle badge
    const ptText = '\u2B50 ' + points;
    ctx.font = "bold 15px sans-serif";
    const ptW = Math.max(ctx.measureText(ptText).width + 20, 80);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(CANVAS_W - ptW - 10, 4, ptW, HUD_HEIGHT - 8);
    // Reward gold — kept as functional accent, not brand chrome.
    drawText(ctx, ptText, CANVAS_W - 10 - ptW / 2, HUD_HEIGHT / 2, {
      font: "bold 15px sans-serif", color: '#FFD54F',
      align: 'center', baseline: 'middle',
    });

    // Controls hint (static, no fade) — suppressed by any active bottom prompt
    if (state.time < HINT_VISIBLE_SECONDS && !hasActiveBottomPrompt(state)) {
      const hintText = strings?.controlHint || 'Use WASD or arrow keys to move';
      ctx.font = "bold 12px sans-serif";
      const hintW = Math.max(ctx.measureText(hintText).width + 24, 260);
      const hintH = 24;
      const hx = CANVAS_W / 2 - hintW / 2;
      const hy = CANVAS_H - 34;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(hx, hy, hintW, hintH);
      drawText(ctx, hintText, CANVAS_W / 2, hy + hintH / 2, {
        font: "bold 12px sans-serif", color: '#fff',
        align: 'center', baseline: 'middle',
      });
    }
    return;
  }

  // Glass-morphism top bar — brand UI chrome (BRAND.purple #533F8B = rgb(83,63,139))
  ctx.fillStyle = 'rgba(83,63,139,0.6)';
  ctx.fillRect(0, 0, CANVAS_W, HUD_HEIGHT);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(0, HUD_HEIGHT - 1, CANVAS_W, 1);

  // Title treatment — subtle inline lockup inside HUD bar, no plate.
  // Harbor is gameplay UI, not the main branding screen — keep it quiet.
  const logo = strings?.brandLogoImg;
  const subtitle = strings?.harborSubtitle || 'Archipelago';
  const subtitleFont = "bold 17px Inter, system-ui, sans-serif";

  if (logo && logo.complete && logo.naturalWidth > 0) {
    const targetH = 30;
    const aspect = logo.naturalWidth / logo.naturalHeight;
    const logoW = targetH * aspect;

    ctx.font = subtitleFont;
    const gap = 10;
    const subW = ctx.measureText(subtitle).width;
    const totalW = logoW + gap + subW;
    const startX = CANVAS_W / 2 - totalW / 2;
    const logoY = (HUD_HEIGHT - targetH) / 2;

    ctx.drawImage(logo, startX, logoY, logoW, targetH);
    drawText(ctx, subtitle, startX + logoW + gap, HUD_HEIGHT / 2, {
      font: subtitleFont,
      color: '#FFFFFF',
      align: 'left',
      baseline: 'middle',
    });
  } else {
    const title = strings?.hubTitle || 'PLAYFOOD Archipelago';
    drawText(ctx, title, CANVAS_W / 2, HUD_HEIGHT / 2, {
      font: "bold 17px Inter, sans-serif",
      color: '#fff',
      align: 'center',
      baseline: 'middle',
    });
  }

  // Points badge (right)
  // Combined stars | points pill — shared with the Overworld HUD for 1:1 parity.
  drawStatsBadge(ctx, CANVAS_W - 12, HUD_HEIGHT, stars || 0, points);

  // Controls hint (fades after 5s) — suppressed by any active bottom prompt
  if (state.time < HINT_VISIBLE_SECONDS && !hasActiveBottomPrompt(state)) {
    const alpha = state.time < 5 ? 0.8 : Math.max(0, 0.8 * (1 - (state.time - 5)));
    ctx.globalAlpha = alpha;

    const hintText = strings?.controlHint || 'Use WASD or arrow keys to move';
    const hintW = 280;
    const hintH = 28;
    const hx = CANVAS_W / 2 - hintW / 2;
    const hy = CANVAS_H - 38;

    drawRoundedRect(ctx, hx, hy, hintW, hintH, 14,
      'rgba(0,0,0,0.45)', 'transparent');
    drawText(ctx, hintText, CANVAS_W / 2, hy + hintH / 2, {
      font: "bold 13px 'Inter', system-ui, sans-serif",
      color: '#fff',
      align: 'center',
      baseline: 'middle',
    });

    ctx.globalAlpha = 1.0;
  }
}
