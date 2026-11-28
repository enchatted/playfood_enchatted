// Enhanced tile atlas — lush tropical pixel art.
// All tiles 32×32, drawn programmatically with gradients and detail.
// Tile variants break grid repetition. Shore edges create coastlines.

import { DRAFT_MODE } from '../config/draftMode.js';
import { BRAND, ISLAND_COLORS, WORLD_ART } from '../styles/brandColors.js';
import { getHero } from './heroes.js';
import useGameStore from '../store/gameStore.js';

const T = 32;

export const TILE = {
  DEEP_WATER: 0,
  SHALLOW_WATER: 1,
  SAND: 2,
  GRASS: 3,
  DARK_GRASS: 4,
  PATH: 5,
  TREE: 6,
  ROCK: 7,
  FLOWERS: 8,
  DOCK: 9,
  BUILDING_WALL: 10,
  BUILDING_DOOR: 11,
  BRIDGE: 12,
  // ── New tiles (sailing overworld + island interiors) ──
  BUOY: 13,         // Phygital terminal on water
  FLOOR_WOOD: 14,   // Interior room floor
  FLOOR_STONE: 15,  // Interior room floor variant
  TABLE: 16,        // Non-walkable interior furniture
  EXIT_MAT: 17,     // Exit marker in island rooms
  // ── Game room tiles ──
  COUNTER: 18,       // Kitchen counter (non-walkable)
  FRIDGE: 19,        // Fridge body top (non-walkable)
  FRIDGE_DOOR: 20,   // Fridge front face (non-walkable, interaction)
};

// ─── Helpers ──────────────────────────────────────────────

function makeTile(draw) {
  const c = document.createElement('canvas');
  c.width = T;
  c.height = T;
  const ctx = c.getContext('2d');
  draw(ctx);
  return c;
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([offset, color]) => g.addColorStop(offset, color));
  return g;
}

// ─── Deep Water (3 animated frames) ──────────────────────

function drawDeepWater(ctx, frame) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.oceanMid;
    ctx.fillRect(0, 0, T, T);
    return;
  }
  ctx.fillStyle = grad(ctx, 0, 0, 0, T, [[0, WORLD_ART.oceanDeep], [1, WORLD_ART.oceanMid]]);
  ctx.fillRect(0, 0, T, T);

  // Curved wave crests
  const offset = frame * 5;
  ctx.strokeStyle = 'rgba(100,181,246,0.25)';
  ctx.lineWidth = 1.5;
  for (let y = 5; y < T; y += 10) {
    ctx.beginPath();
    for (let x = -8 + offset; x < T + 8; x += 16) {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 4, y - 2.5, x + 8, y);
    }
    ctx.stroke();
  }

  // Sparkle dots
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  const rand = seededRandom(frame * 17 + 7);
  for (let i = 0; i < 3; i++) {
    const sx = Math.floor(rand() * 28) + 2;
    const sy = Math.floor(rand() * 28) + 2;
    ctx.fillRect(sx, sy, 1, 1);
  }
}

// ─── Shallow Water (3 animated frames) ───────────────────

function drawShallowWater(ctx, frame) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.oceanMid;
    ctx.fillRect(0, 0, T, T);
    return;
  }
  // Top (shoreward) = official Playfood blue, fading to lighter wave tones
  // toward the open-sea edge. oceanShallow #CED3F4 is reserved for foam-only
  // highlights, never as a dominant tile fill.
  ctx.fillStyle = grad(ctx, 0, 0, T, T, [[0, WORLD_ART.oceanMid], [0.5, WORLD_ART.oceanWaveMid], [1, WORLD_ART.oceanWaveLight]]);
  ctx.fillRect(0, 0, T, T);

  // Ripple rings
  const offset = frame * 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  for (let y = 6; y < T; y += 12) {
    ctx.beginPath();
    for (let x = -4 + offset; x < T + 4; x += 14) {
      ctx.moveTo(x, y + 1);
      ctx.quadraticCurveTo(x + 3, y - 1.5, x + 7, y + 1);
    }
    ctx.stroke();
  }

  // Light caustics
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  const rand = seededRandom(frame * 23 + 3);
  for (let i = 0; i < 2; i++) {
    const cx = Math.floor(rand() * 24) + 4;
    const cy = Math.floor(rand() * 24) + 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 3, 2, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Sand (3 variants) ───────────────────────────────────

function drawSand(ctx, variant) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.sandBase;
    ctx.fillRect(0, 0, T, T);
    return;
  }
  ctx.fillStyle = grad(ctx, 0, 0, T, T, [[0, WORLD_ART.sandHighlight], [1, WORLD_ART.sandBase]]);
  ctx.fillRect(0, 0, T, T);

  const rand = seededRandom(42 + variant * 100);

  // Warm speckles
  ctx.fillStyle = WORLD_ART.sandShadow;
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(Math.floor(rand() * 28) + 2, Math.floor(rand() * 28) + 2, 2, 1);
  }

  // Darker grain
  ctx.fillStyle = 'rgba(183,148,88,0.3)';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(Math.floor(rand() * 30), Math.floor(rand() * 30), 1, 1);
  }

  // Variant details
  if (variant === 1) {
    // Tiny shell
    ctx.fillStyle = WORLD_ART.pebbleLight;
    ctx.beginPath();
    ctx.arc(22, 24, 2.5, 0, Math.PI, true);
    ctx.fill();
    ctx.fillStyle = WORLD_ART.pebbleDark;
    ctx.fillRect(20, 24, 5, 1);
  } else if (variant === 2) {
    // Pebbles
    ctx.fillStyle = WORLD_ART.pebbleDark;
    ctx.beginPath();
    ctx.ellipse(8, 14, 2, 1.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(24, 22, 1.5, 1, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Grass (3 variants) ──────────────────────────────────

function drawGrass(ctx, variant) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.grassMid;
    ctx.fillRect(0, 0, T, T);
    return;
  }
  ctx.fillStyle = grad(ctx, 0, 0, T, T, [[0, WORLD_ART.grassLight], [0.6, WORLD_ART.grassMid], [1, WORLD_ART.grassDeep]]);
  ctx.fillRect(0, 0, T, T);

  const rand = seededRandom(77 + variant * 50);

  // Light patches for depth
  ctx.fillStyle = 'rgba(129,199,132,0.35)';
  ctx.beginPath();
  ctx.ellipse(
    Math.floor(rand() * 16) + 8,
    Math.floor(rand() * 16) + 8,
    8, 6, rand() * Math.PI, 0, Math.PI * 2
  );
  ctx.fill();

  // Grass blades
  ctx.strokeStyle = WORLD_ART.grassDark;
  ctx.lineWidth = 1;
  const bladeCount = 5 + variant;
  for (let i = 0; i < bladeCount; i++) {
    const bx = Math.floor(rand() * 28) + 2;
    const by = Math.floor(rand() * 24) + 6;
    const lean = (rand() - 0.5) * 3;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + lean, by - 4 - Math.floor(rand() * 2));
    ctx.stroke();
  }

  // Tiny dark accent
  if (variant === 2) {
    ctx.fillStyle = 'rgba(56,142,60,0.4)';
    ctx.fillRect(4, 4, 6, 5);
  }
}

// ─── Dark Grass (2 variants) ─────────────────────────────

function drawDarkGrass(ctx, variant) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.grassDark;
    ctx.fillRect(0, 0, T, T);
    return;
  }
  ctx.fillStyle = grad(ctx, 0, 0, 0, T, [[0, WORLD_ART.grassDark], [1, WORLD_ART.grassDeep]]);
  ctx.fillRect(0, 0, T, T);

  const rand = seededRandom(99 + variant * 70);

  // Wheat stalks
  ctx.strokeStyle = WORLD_ART.grassLight;
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const sx = Math.floor(rand() * 28) + 2;
    const sy = Math.floor(rand() * 20) + 8;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (rand() - 0.5) * 2, sy - 5);
    ctx.stroke();
    // Wheat tip
    ctx.fillStyle = '#9E9D24';
    ctx.fillRect(sx - 1, sy - 6, 2, 2);
    ctx.fillStyle = 'transparent';
  }
}

// ─── Path (2 variants) ───────────────────────────────────

function drawPath(ctx, variant) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.pathMid;
    ctx.fillRect(0, 0, T, T);
    return;
  }
  ctx.fillStyle = grad(ctx, 0, 0, T, T, [[0, WORLD_ART.pathBase], [0.5, WORLD_ART.pathMid], [1, WORLD_ART.pathBase]]);
  ctx.fillRect(0, 0, T, T);

  const rand = seededRandom(33 + variant * 60);

  // Pebbles (warm-stone family — shared with sand pebbles + dirtAccent darkest)
  const pebbleColors = [WORLD_ART.pebbleDark, WORLD_ART.pebbleLight, WORLD_ART.dirtAccent];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = pebbleColors[i % 3];
    const px = Math.floor(rand() * 26) + 3;
    const py = Math.floor(rand() * 26) + 3;
    ctx.beginPath();
    ctx.ellipse(px, py, 2 + rand(), 1.5, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dirt cracks
  ctx.strokeStyle = 'rgba(62,39,35,0.2)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(Math.floor(rand() * T), Math.floor(rand() * T));
  ctx.lineTo(Math.floor(rand() * T), Math.floor(rand() * T));
  ctx.stroke();
}

// ─── Tree (2 variants) ───────────────────────────────────

function drawTree(ctx, variant) {
  if (DRAFT_MODE) {
    // Grass base
    ctx.fillStyle = WORLD_ART.grassMid;
    ctx.fillRect(0, 0, T, T);
    // Trunk (brand wood)
    ctx.fillStyle = WORLD_ART.woodShadow;
    ctx.fillRect(14, 20, 4, 10);
    // Green circle canopy
    ctx.fillStyle = WORLD_ART.foliageMid;
    ctx.beginPath();
    ctx.arc(16, 14, 10, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Grass base with gradient
  ctx.fillStyle = grad(ctx, 0, 0, T, T, [[0, WORLD_ART.grassLight], [1, WORLD_ART.grassMid]]);
  ctx.fillRect(0, 0, T, T);

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(16, 28, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (variant === 0) {
    // Bushy round tree
    // Trunk
    ctx.fillStyle = WORLD_ART.woodShadow;
    ctx.fillRect(14, 18, 5, 11);
    ctx.fillStyle = WORLD_ART.woodDeep;
    ctx.fillRect(14, 18, 2, 11);
    // Canopy layers (dark → light for depth)
    ctx.fillStyle = WORLD_ART.foliageDeep;
    ctx.beginPath(); ctx.arc(16, 13, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WORLD_ART.foliageDeep;
    ctx.beginPath(); ctx.arc(11, 11, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(21, 11, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WORLD_ART.foliageMid;
    ctx.beginPath(); ctx.arc(16, 10, 7, 0, Math.PI * 2); ctx.fill();
    // Highlight
    ctx.fillStyle = WORLD_ART.grassMid;
    ctx.beginPath(); ctx.arc(13, 8, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WORLD_ART.foliageLight;
    ctx.beginPath(); ctx.arc(12, 7, 2, 0, Math.PI * 2); ctx.fill();
  } else {
    // Conical pine tree
    ctx.fillStyle = WORLD_ART.woodShadow;
    ctx.fillRect(14, 22, 4, 7);
    ctx.fillStyle = WORLD_ART.woodDeep;
    ctx.fillRect(14, 22, 2, 7);
    // Pine layers
    ctx.fillStyle = WORLD_ART.foliageDeep;
    ctx.beginPath();
    ctx.moveTo(16, 2); ctx.lineTo(6, 22); ctx.lineTo(26, 22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = WORLD_ART.foliageDeep;
    ctx.beginPath();
    ctx.moveTo(16, 5); ctx.lineTo(8, 18); ctx.lineTo(24, 18);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = WORLD_ART.foliageMid;
    ctx.beginPath();
    ctx.moveTo(16, 8); ctx.lineTo(10, 14); ctx.lineTo(22, 14);
    ctx.closePath(); ctx.fill();
    // Snow/highlight tip
    ctx.fillStyle = WORLD_ART.foliageLight;
    ctx.beginPath();
    ctx.moveTo(16, 5); ctx.lineTo(13, 10); ctx.lineTo(19, 10);
    ctx.closePath(); ctx.fill();
  }
}

// ─── Rock (2 variants) ───────────────────────────────────

function drawRock(ctx, variant) {
  if (DRAFT_MODE) {
    // Grass base
    ctx.fillStyle = WORLD_ART.grassMid;
    ctx.fillRect(0, 0, T, T);
    // Stone body (brand stone)
    ctx.fillStyle = WORLD_ART.stoneShadow;
    ctx.fillRect(6, 8, 20, 18);
    return;
  }
  ctx.fillStyle = grad(ctx, 0, 0, T, T, [[0, WORLD_ART.grassLight], [1, WORLD_ART.grassMid]]);
  ctx.fillRect(0, 0, T, T);

  // Shadow under rock
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath();
  ctx.ellipse(16, 26, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (variant === 0) {
    // Big boulder
    ctx.fillStyle = WORLD_ART.stoneShadow;
    ctx.beginPath();
    ctx.moveTo(5, 26); ctx.lineTo(8, 10); ctx.lineTo(16, 7);
    ctx.lineTo(24, 9); ctx.lineTo(28, 16); ctx.lineTo(27, 26);
    ctx.closePath(); ctx.fill();
    // Highlight face
    ctx.fillStyle = WORLD_ART.stoneMid;
    ctx.beginPath();
    ctx.moveTo(10, 12); ctx.lineTo(16, 9); ctx.lineTo(22, 11);
    ctx.lineTo(18, 17); ctx.lineTo(12, 16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = WORLD_ART.stoneLight;
    ctx.beginPath();
    ctx.moveTo(12, 13); ctx.lineTo(16, 10); ctx.lineTo(19, 12);
    ctx.lineTo(16, 14);
    ctx.closePath(); ctx.fill();
    // Moss
    ctx.fillStyle = WORLD_ART.grassDark;
    ctx.fillRect(6, 22, 4, 3);
    ctx.fillRect(5, 23, 2, 2);
  } else {
    // Rock cluster
    ctx.fillStyle = WORLD_ART.stoneShadow;
    ctx.beginPath();
    ctx.moveTo(4, 24); ctx.lineTo(7, 14); ctx.lineTo(14, 12);
    ctx.lineTo(17, 18); ctx.lineTo(15, 24);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = WORLD_ART.stoneMid;
    ctx.beginPath();
    ctx.moveTo(16, 26); ctx.lineTo(20, 16); ctx.lineTo(27, 15);
    ctx.lineTo(28, 22); ctx.lineTo(24, 26);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = WORLD_ART.stoneLight;
    ctx.fillRect(21, 17, 4, 3);
  }
}

// ─── Flowers (3 variants) ────────────────────────────────

const FLOWER_PALETTES = [
  ['#FF5252', '#FF80AB', '#FFEB3B', '#E040FB'],
  ['#FFAB40', '#FF6E40', '#FFD740', '#FF4081'],
  ['#7C4DFF', '#448AFF', '#18FFFF', '#69F0AE'],
];

function drawFlowers(ctx, variant) {
  if (DRAFT_MODE) {
    // Grass base
    ctx.fillStyle = WORLD_ART.grassMid;
    ctx.fillRect(0, 0, T, T);
    // Simple colored dots for flowers (intentional Material pops — keep)
    const colors = ['#FF5252', '#FFEB3B', '#E040FB'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(8 + i * 8, 12 + (i % 2) * 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  // Grass base
  ctx.fillStyle = grad(ctx, 0, 0, T, T, [[0, WORLD_ART.grassLight], [1, WORLD_ART.grassMid]]);
  ctx.fillRect(0, 0, T, T);

  const colors = FLOWER_PALETTES[variant];
  const rand = seededRandom(55 + variant * 40);

  for (let i = 0; i < 5; i++) {
    const fx = Math.floor(rand() * 24) + 4;
    const fy = Math.floor(rand() * 22) + 6;
    const col = colors[i % colors.length];

    // Stem
    ctx.strokeStyle = WORLD_ART.grassDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx, fy + 3);
    ctx.lineTo(fx, fy);
    ctx.stroke();

    // Petals (4 tiny circles around center)
    ctx.fillStyle = col;
    for (let p = 0; p < 4; p++) {
      const angle = (p / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(fx + Math.cos(angle) * 1.5, fy + Math.sin(angle) * 1.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Center
    ctx.fillStyle = '#FFF9C4';
    ctx.beginPath();
    ctx.arc(fx, fy, 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Dock ─────────────────────────────────────────────────

function drawDock(ctx) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.wood;
    ctx.fillRect(0, 0, T, T);
    return;
  }
  ctx.fillStyle = grad(ctx, 0, 0, 0, T, [[0, '#29B6F6'], [1, '#42A5F5']]);
  ctx.fillRect(0, 0, T, T);

  // Planks with grain
  for (let y = 0; y < T; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? WORLD_ART.wood : WORLD_ART.woodMid;
    ctx.fillRect(0, y, T, 6);
    // Wood grain (woodDeep #4C3826 = rgb(76,56,38))
    ctx.strokeStyle = 'rgba(76,56,38,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(2, y + 2); ctx.lineTo(28, y + 3);
    ctx.moveTo(4, y + 4); ctx.lineTo(26, y + 4);
    ctx.stroke();
  }
  // Gaps (water peeking through — left untouched, water phase)
  ctx.fillStyle = 'rgba(2,119,189,0.4)';
  for (let y = 6; y < T; y += 8) ctx.fillRect(0, y, T, 2);
  // Nails (brand wood deepest)
  ctx.fillStyle = WORLD_ART.woodDeep;
  ctx.fillRect(4, 2, 2, 2); ctx.fillRect(26, 2, 2, 2);
  ctx.fillRect(4, 18, 2, 2); ctx.fillRect(26, 18, 2, 2);
}

// ─── Building Wall ────────────────────────────────────────

function drawBuildingWall(ctx) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.stoneLight;
    ctx.fillRect(0, 0, T, T);
    // Simple window indicator (navy — kept, navy chrome phase will rebrand)
    ctx.fillStyle = '#1A237E';
    ctx.fillRect(10, 8, 12, 12);
    return;
  }
  // Stone wall gradient (light → mid)
  ctx.fillStyle = grad(ctx, 0, 0, 0, T, [[0, WORLD_ART.stoneLight], [1, WORLD_ART.stoneMid]]);
  ctx.fillRect(0, 0, T, T);

  // Brick/mortar lines (brand stone shadow)
  ctx.strokeStyle = WORLD_ART.stoneShadow;
  ctx.lineWidth = 0.8;
  for (let y = 0; y < T; y += 8) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(T, y); ctx.stroke();
    const off = (y / 8) % 2 === 0 ? 0 : 16;
    for (let x = off; x < T; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 8); ctx.stroke();
    }
  }

  // Window (centered) — navy kept for later chrome phase
  ctx.fillStyle = '#1A237E';
  ctx.fillRect(11, 8, 10, 10);
  ctx.fillStyle = '#283593';
  ctx.fillRect(12, 9, 8, 8);
  // Window cross-bar (warm stone trim)
  ctx.fillStyle = WORLD_ART.stoneLight;
  ctx.fillRect(11, 12.5, 10, 1.5);
  ctx.fillRect(15.5, 8, 1.5, 10);
  // Window shine
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(12, 9, 3, 3);
}

// ─── Building Door ────────────────────────────────────────

function drawBuildingDoor(ctx) {
  if (DRAFT_MODE) {
    ctx.fillStyle = '#BDBDBD';
    ctx.fillRect(0, 0, T, T);
    // Simple door rectangle (brand wood)
    ctx.fillStyle = WORLD_ART.woodShadow;
    ctx.fillRect(8, 4, 16, 28);
    // Handle dot
    ctx.fillStyle = '#FFD54F';
    ctx.beginPath();
    ctx.arc(22, 18, 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = grad(ctx, 0, 0, 0, T, [[0, '#D7CCC8'], [1, '#BDBDBD']]);
  ctx.fillRect(0, 0, T, T);

  // Door arch frame (deepest wood for outline)
  ctx.fillStyle = WORLD_ART.woodDeep;
  ctx.fillRect(6, 4, 20, 26);
  ctx.beginPath();
  ctx.arc(16, 8, 10, Math.PI, 0);
  ctx.fill();

  // Door panels (mid wood for face)
  ctx.fillStyle = WORLD_ART.woodMid;
  ctx.fillRect(8, 10, 7, 18);
  ctx.fillRect(17, 10, 7, 18);
  // Top stripe between arch and panels
  ctx.fillStyle = WORLD_ART.woodShadow;
  ctx.fillRect(8, 6, 16, 4);

  // Handle (golden glow — non-wood accent, kept)
  ctx.fillStyle = '#FFD54F';
  ctx.beginPath(); ctx.arc(22, 20, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF9C4';
  ctx.beginPath(); ctx.arc(21.5, 19.5, 0.8, 0, Math.PI * 2); ctx.fill();

  // Light spill from door
  ctx.fillStyle = 'rgba(255,235,59,0.15)';
  ctx.fillRect(8, 26, 16, 6);

  // Welcome mat (light wood)
  ctx.fillStyle = WORLD_ART.wood;
  ctx.fillRect(8, 28, 16, 4);
  ctx.fillStyle = WORLD_ART.woodShadow;
  ctx.fillRect(10, 29, 12, 2);
}

// ─── Bridge ───────────────────────────────────────────────

function drawBridge(ctx) {
  if (DRAFT_MODE) {
    ctx.fillStyle = '#4FC3F7';
    ctx.fillRect(0, 0, T, T);
    // Plank area (brand wood)
    ctx.fillStyle = WORLD_ART.wood;
    ctx.fillRect(4, 0, 24, T);
    return;
  }
  ctx.fillStyle = grad(ctx, 0, 0, 0, T, [[0, '#29B6F6'], [1, '#42A5F5']]);
  ctx.fillRect(0, 0, T, T);

  // Planks
  ctx.fillStyle = WORLD_ART.wood;
  ctx.fillRect(4, 0, 24, T);

  // Plank lines + grain
  ctx.strokeStyle = WORLD_ART.woodMid;
  ctx.lineWidth = 0.8;
  for (let y = 0; y < T; y += 6) {
    ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(28, y); ctx.stroke();
  }
  // Fine grain (woodDeep #4C3826 = rgb(76,56,38))
  ctx.strokeStyle = 'rgba(76,56,38,0.15)';
  for (let y = 2; y < T; y += 6) {
    ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(26, y); ctx.stroke();
  }

  // Rope railings
  ctx.fillStyle = WORLD_ART.woodShadow;
  ctx.fillRect(3, 0, 3, T);
  ctx.fillRect(26, 0, 3, T);
  // Rope posts
  ctx.fillStyle = WORLD_ART.woodDeep;
  ctx.fillRect(3, 0, 3, 4);
  ctx.fillRect(26, 0, 3, 4);
  ctx.fillRect(3, 14, 3, 4);
  ctx.fillRect(26, 14, 3, 4);
  ctx.fillRect(3, 28, 3, 4);
  ctx.fillRect(26, 28, 3, 4);
  // Rope highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(4, 0, 1, T);
  ctx.fillRect(27, 0, 1, T);
}

// ─── Buoy / Phygital Terminal ─────────────────────────────

function drawBuoy(ctx, frame) {
  if (DRAFT_MODE) {
    // Flat water base
    ctx.fillStyle = '#4FC3F7';
    ctx.fillRect(0, 0, T, T);
    // Simple red circle
    ctx.fillStyle = '#EF5350';
    ctx.beginPath();
    ctx.arc(16, 16, 8, 0, Math.PI * 2);
    ctx.fill();
    // Yellow lamp dot
    ctx.fillStyle = '#FFEB3B';
    ctx.beginPath();
    ctx.arc(16, 8, 3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Shallow water base
  drawShallowWater(ctx, frame);

  // Platform base (floating wooden circle)
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(16, 24, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8D6E63';
  ctx.beginPath();
  ctx.ellipse(16, 22, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#A1887F';
  ctx.beginPath();
  ctx.ellipse(16, 21, 8, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pole
  ctx.fillStyle = '#E0E0E0';
  ctx.fillRect(14, 6, 4, 16);
  ctx.fillStyle = '#BDBDBD';
  ctx.fillRect(14, 6, 2, 16);

  // Red/white stripes on pole
  ctx.fillStyle = '#EF5350';
  ctx.fillRect(14, 8, 4, 3);
  ctx.fillRect(14, 14, 4, 3);

  // Lamp at top (pulsing glow based on frame)
  const glow = frame === 0 ? 0.6 : frame === 1 ? 0.8 : 0.4;
  ctx.fillStyle = `rgba(255,235,59,${glow})`;
  ctx.beginPath();
  ctx.arc(16, 5, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFEB3B';
  ctx.beginPath();
  ctx.arc(16, 5, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFF9C4';
  ctx.beginPath();
  ctx.arc(15, 4, 1, 0, Math.PI * 2);
  ctx.fill();

  // Ticket/code symbol on platform
  ctx.fillStyle = '#FFF';
  ctx.fillRect(12, 19, 8, 5);
  ctx.fillStyle = '#FF7043';
  ctx.fillRect(13, 20, 6, 3);
  // Star icon
  ctx.fillStyle = '#FFF';
  ctx.fillRect(15, 21, 2, 1);
}

// ─── Floor Wood (interior, 2 variants) ───────────────────

function drawFloorWood(ctx, variant) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.wood;
    ctx.fillRect(0, 0, T, T);
    return;
  }
  ctx.fillStyle = grad(ctx, 0, 0, T, T, [[0, WORLD_ART.wood], [0.5, WORLD_ART.woodMid], [1, WORLD_ART.wood]]);
  ctx.fillRect(0, 0, T, T);

  const rand = seededRandom(111 + variant * 55);

  // Plank lines (horizontal) — woodDeep #4C3826 = rgb(76,56,38)
  ctx.strokeStyle = 'rgba(76,56,38,0.25)';
  ctx.lineWidth = 0.8;
  for (let y = 0; y < T; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(T, y);
    ctx.stroke();
  }

  // Wood grain
  ctx.strokeStyle = 'rgba(76,56,38,0.1)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) {
    const gy = Math.floor(rand() * T);
    ctx.beginPath();
    ctx.moveTo(2, gy);
    ctx.lineTo(28, gy + (rand() - 0.5) * 2);
    ctx.stroke();
  }

  // Knot detail for variant 1
  if (variant === 1) {
    ctx.fillStyle = 'rgba(76,56,38,0.2)';
    ctx.beginPath();
    ctx.arc(20, 12, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Floor Stone (interior, 2 variants) ──────────────────

function drawFloorStone(ctx, variant) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.stoneMid;
    ctx.fillRect(0, 0, T, T);
    return;
  }
  ctx.fillStyle = grad(ctx, 0, 0, T, T, [[0, WORLD_ART.stoneLight], [1, WORLD_ART.stoneMid]]);
  ctx.fillRect(0, 0, T, T);

  const rand = seededRandom(222 + variant * 33);

  // Stone block pattern — stoneShadow #848179 = rgb(132,129,121)
  ctx.strokeStyle = 'rgba(132,129,121,0.45)';
  ctx.lineWidth = 1;
  // Horizontal lines
  ctx.beginPath();
  ctx.moveTo(0, 16); ctx.lineTo(T, 16);
  ctx.stroke();
  // Staggered verticals
  const off = variant === 0 ? 0 : 16;
  ctx.beginPath();
  ctx.moveTo(off, 0); ctx.lineTo(off, 16);
  ctx.moveTo(off + 16, 16); ctx.lineTo(off + 16, T);
  ctx.stroke();

  // Surface noise
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(Math.floor(rand() * 28) + 2, Math.floor(rand() * 28) + 2, 2, 2);
  }

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(2, 2, 12, 12);
}

// ─── Table (non-walkable furniture) ──────────────────────

function drawTable(ctx) {
  if (DRAFT_MODE) {
    // Stone floor base
    ctx.fillStyle = WORLD_ART.stoneMid;
    ctx.fillRect(0, 0, T, T);
    // Wood table rectangle
    ctx.fillStyle = WORLD_ART.woodMid;
    ctx.fillRect(4, 8, 24, 16);
    return;
  }
  // Stone floor base
  drawFloorStone(ctx, 0);

  // Table shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(16, 26, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Table top
  ctx.fillStyle = WORLD_ART.woodMid;
  ctx.fillRect(4, 10, 24, 14);
  ctx.fillStyle = WORLD_ART.wood;
  ctx.fillRect(5, 11, 22, 12);

  // Table top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(6, 12, 10, 4);

  // Legs
  ctx.fillStyle = WORLD_ART.woodShadow;
  ctx.fillRect(5, 22, 3, 6);
  ctx.fillRect(24, 22, 3, 6);
}

// ─── Exit Mat (walkable exit marker) ─────────────────────

function drawExitMat(ctx) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.wood;
    ctx.fillRect(0, 0, T, T);
    // Brand-green exit indicator
    ctx.fillStyle = BRAND.green;
    ctx.fillRect(6, 6, 20, 20);
    return;
  }
  // Wood floor base
  drawFloorWood(ctx, 0);

  // Green glowing mat (BRAND.green #6DB06C = rgb(109,176,108))
  ctx.fillStyle = 'rgba(109,176,108,0.3)';
  ctx.fillRect(4, 4, 24, 24);
  ctx.fillStyle = 'rgba(109,176,108,0.5)';
  ctx.fillRect(6, 6, 20, 20);

  // Arrow pointing down (exit direction)
  ctx.fillStyle = BRAND.green;
  ctx.beginPath();
  ctx.moveTo(16, 24);
  ctx.lineTo(10, 16);
  ctx.lineTo(13, 16);
  ctx.lineTo(13, 10);
  ctx.lineTo(19, 10);
  ctx.lineTo(19, 16);
  ctx.lineTo(22, 16);
  ctx.closePath();
  ctx.fill();

  // Arrow highlight (foliageLight = brand-green tonal lighter)
  ctx.fillStyle = WORLD_ART.foliageLight;
  ctx.fillRect(14, 11, 4, 4);
}

// ─── Game Room Tiles ─────────────────────────────────────

function drawCounter(ctx, tint = WORLD_ART.counterWarm) {
  if (DRAFT_MODE) {
    ctx.fillStyle = WORLD_ART.stoneMid;
    ctx.fillRect(0, 0, T, T);
    // Counter rectangle
    ctx.fillStyle = tint;
    ctx.fillRect(2, 2, 28, 28);
    return;
  }
  // Stone floor base
  drawFloorStone(ctx, 0);

  // Countertop surface (warm wood gradient)
  const g = ctx.createLinearGradient(0, 0, 0, T);
  g.addColorStop(0, tint);
  g.addColorStop(0.6, WORLD_ART.woodShadow);
  g.addColorStop(1, WORLD_ART.woodDeep);
  ctx.fillStyle = g;
  ctx.fillRect(2, 2, 28, 26);

  // Steel front edge (cool brand-stone tones)
  ctx.fillStyle = WORLD_ART.stoneCool;
  ctx.fillRect(2, 26, 28, 4);
  ctx.fillStyle = WORLD_ART.stoneMid;
  ctx.fillRect(2, 28, 28, 2);

  // Wood grain lines
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(4, 8); ctx.lineTo(28, 9);
  ctx.moveTo(6, 16); ctx.lineTo(26, 15);
  ctx.moveTo(5, 22); ctx.lineTo(27, 23);
  ctx.stroke();
}

function drawFridge(ctx, tint = WORLD_ART.stoneCool) {
  if (DRAFT_MODE) {
    ctx.fillStyle = BRAND.text;
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = tint;
    ctx.fillRect(4, 0, 24, T);
    return;
  }
  // Dark backdrop (brand text dark)
  ctx.fillStyle = BRAND.text;
  ctx.fillRect(0, 0, T, T);

  // Metallic fridge body (cool brand-stone gradient)
  const g = ctx.createLinearGradient(2, 0, 30, 0);
  g.addColorStop(0, WORLD_ART.stoneMid);
  g.addColorStop(0.3, tint);
  g.addColorStop(0.7, tint);
  g.addColorStop(1, WORLD_ART.stoneMid);
  ctx.fillStyle = g;
  ctx.fillRect(4, 0, 24, T);

  // Subtle vent lines at top
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  for (let y = 4; y < 28; y += 4) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(24, y);
    ctx.stroke();
  }

  // Side shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(4, 0, 3, T);
}

function drawFridgeDoor(ctx, tint = WORLD_ART.stoneCool) {
  if (DRAFT_MODE) {
    ctx.fillStyle = BRAND.text;
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = tint;
    ctx.fillRect(4, 0, 24, T);
    // Handle
    ctx.fillStyle = WORLD_ART.stoneShadow;
    ctx.fillRect(22, 6, 3, 8);
    return;
  }
  // Dark backdrop (brand text dark)
  ctx.fillStyle = BRAND.text;
  ctx.fillRect(0, 0, T, T);

  // Fridge door body (cool brand-stone gradient)
  const g = ctx.createLinearGradient(2, 0, 30, 0);
  g.addColorStop(0, WORLD_ART.stoneMid);
  g.addColorStop(0.3, tint);
  g.addColorStop(0.7, tint);
  g.addColorStop(1, WORLD_ART.stoneMid);
  ctx.fillStyle = g;
  ctx.fillRect(4, 0, 24, T);

  // Door seam line
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, 14);
  ctx.lineTo(28, 14);
  ctx.stroke();

  // Handle (warm-stone dark + mid for face highlight)
  ctx.fillStyle = WORLD_ART.stoneShadow;
  ctx.fillRect(22, 4, 3, 8);
  ctx.fillStyle = WORLD_ART.stoneMid;
  ctx.fillRect(22, 4, 2, 8);

  // Interior glow hint (through door crack)
  ctx.fillStyle = 'rgba(144,202,249,0.2)';
  ctx.fillRect(6, 15, 20, T - 16);

  // Shelf lines visible inside
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(6, 20); ctx.lineTo(26, 20);
  ctx.moveTo(6, 26); ctx.lineTo(26, 26);
  ctx.stroke();

  // Side shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(4, 0, 3, T);
}

// ─── Boat Sprites (top-down, 5 tiers × 4 directions × 2 frames) ───
// dir: 0=down, 1=up, 2=left, 3=right | frame: water-rock frame 0 or 1

const BOAT_COLORS = {
  ink: '#17324D',
  cream: '#FFF2C6',
  starterHull: '#6D4C41',
  starterDeck: '#A98269',
  sailHull: '#E97832',
  sailTrim: '#397CA5',
  cleanupHull: '#217F78',
  cleanupDeck: '#59B8A8',
  ecoHull: '#234866',
  ecoGreen: '#4F9B4F',
  guardianHull: '#176B78',
  guardianDeck: '#55C4BE',
  guardianOrange: '#F08A3C',
  guardianSolar: '#397CA5',
  guardianLime: '#B7DE64',
  recycle: '#A8D85F',
  cargo: '#B87942',
};

function boatPoint(dir, lateral, forward) {
  if (dir === 1) return [16 - lateral, 16 - forward];
  if (dir === 2) return [16 - forward, 16 + lateral];
  if (dir === 3) return [16 + forward, 16 - lateral];
  return [16 + lateral, 16 + forward];
}

function fillBoatPolygon(ctx, dir, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([lateral, forward], index) => {
    const [x, y] = boatPoint(dir, lateral, forward);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
}

function fillBoatRect(ctx, dir, lateral, forward, width, height, color) {
  fillBoatPolygon(ctx, dir, [
    [lateral, forward],
    [lateral + width, forward],
    [lateral + width, forward + height],
    [lateral, forward + height],
  ], color);
}

function drawBoatWake(ctx, dir, frame, halfWidth) {
  const wakeStep = frame === 1 ? 1 : 0;
  fillBoatRect(ctx, dir, -halfWidth, -11 - wakeStep, 4, 1, 'rgba(255,255,255,0.58)');
  fillBoatRect(ctx, dir, halfWidth - 4, -11 - wakeStep, 4, 1, 'rgba(255,255,255,0.58)');
  fillBoatRect(ctx, dir, -halfWidth + 2, -13 - wakeStep, 3, 1, 'rgba(206,211,244,0.5)');
  fillBoatRect(ctx, dir, halfWidth - 5, -13 - wakeStep, 3, 1, 'rgba(206,211,244,0.5)');
}

function drawTierHull(ctx, dir, halfWidth, hullColor, deckColor) {
  fillBoatPolygon(ctx, dir, [
    [-halfWidth, -9], [halfWidth, -9], [halfWidth - 2, 7],
    [0, 12], [-halfWidth + 2, 7],
  ], BOAT_COLORS.ink);
  fillBoatPolygon(ctx, dir, [
    [-halfWidth + 1, -8], [halfWidth - 1, -8], [halfWidth - 3, 7],
    [0, 10], [-halfWidth + 3, 7],
  ], hullColor);
  fillBoatPolygon(ctx, dir, [
    [-halfWidth + 3, -6], [halfWidth - 3, -6], [halfWidth - 4, 5],
    [0, 8], [-halfWidth + 4, 5],
  ], deckColor);
}

function drawStarterBoat(ctx, dir) {
  drawTierHull(ctx, dir, 7, BOAT_COLORS.starterHull, BOAT_COLORS.starterDeck);
  fillBoatRect(ctx, dir, -1, -7, 2, 13, BOAT_COLORS.ink);
  fillBoatPolygon(ctx, dir, [[-1, -6], [-1, 4], [-7, 1]], BOAT_COLORS.cream);
  fillBoatRect(ctx, dir, 2, -4, 3, 2, '#D95C4F');
}

function drawSailboat(ctx, dir) {
  drawTierHull(ctx, dir, 9, BOAT_COLORS.sailHull, '#F2A34F');
  fillBoatRect(ctx, dir, -7, 5, 14, 2, BOAT_COLORS.sailTrim);
  fillBoatRect(ctx, dir, -1, -9, 2, 16, BOAT_COLORS.ink);
  fillBoatPolygon(ctx, dir, [[-1, -8], [-1, 5], [-10, 1]], BOAT_COLORS.cream);
  fillBoatPolygon(ctx, dir, [[1, -7], [1, 3], [7, 0]], '#FFE7A4');
  fillBoatRect(ctx, dir, -9, 1, 3, 1, BOAT_COLORS.sailTrim);
}

function drawCleanupBoat(ctx, dir) {
  drawTierHull(ctx, dir, 10, BOAT_COLORS.cleanupHull, BOAT_COLORS.cleanupDeck);

  // Open stern bay and high-contrast recycling crate communicate its job.
  fillBoatRect(ctx, dir, -7, -7, 14, 7, BOAT_COLORS.ink);
  fillBoatRect(ctx, dir, -5, -6, 10, 5, '#2D655F');
  fillBoatRect(ctx, dir, -4, -5, 8, 4, BOAT_COLORS.recycle);
  fillBoatRect(ctx, dir, -2, -4, 4, 1, BOAT_COLORS.cream);
  fillBoatRect(ctx, dir, 1, -3, 1, 2, BOAT_COLORS.cream);
  fillBoatRect(ctx, dir, -2, -2, 3, 1, BOAT_COLORS.cream);

  // Forward wheelhouse keeps the workboat distinct from the sail tier.
  fillBoatRect(ctx, dir, -5, 2, 10, 5, BOAT_COLORS.ink);
  fillBoatRect(ctx, dir, -4, 2, 8, 4, BOAT_COLORS.cream);
  fillBoatRect(ctx, dir, -3, 3, 6, 2, BOAT_COLORS.sailTrim);
}

function drawEcoShip(ctx, dir) {
  drawTierHull(ctx, dir, 11, BOAT_COLORS.ecoHull, BOAT_COLORS.ecoGreen);

  // Broad cargo deck, two reusable crates and a compact forward bridge.
  fillBoatRect(ctx, dir, -8, -6, 16, 9, BOAT_COLORS.ink);
  fillBoatRect(ctx, dir, -7, -5, 14, 7, '#356B55');
  fillBoatRect(ctx, dir, -6, -4, 5, 5, BOAT_COLORS.cargo);
  fillBoatRect(ctx, dir, 1, -4, 5, 5, '#D6A150');
  fillBoatRect(ctx, dir, -5, -3, 3, 1, BOAT_COLORS.cream);
  fillBoatRect(ctx, dir, 2, -3, 3, 1, BOAT_COLORS.cream);
  fillBoatRect(ctx, dir, -5, 4, 10, 4, BOAT_COLORS.ink);
  fillBoatRect(ctx, dir, -4, 4, 8, 3, BOAT_COLORS.cream);
  fillBoatRect(ctx, dir, -3, 5, 6, 1, BOAT_COLORS.sailTrim);

  // Small environmental pennant: equipment, not a palette-only upgrade.
  fillBoatRect(ctx, dir, 7, -9, 1, 7, BOAT_COLORS.ink);
  fillBoatPolygon(ctx, dir, [[8, -9], [11, -8], [8, -6]], BOAT_COLORS.recycle);
}

function drawGuardianShip(ctx, dir) {
  // A broad twin-pontoon rescue silhouette fills more of the shared navigation
  // tile without changing its logical centre or collision footprint.
  fillBoatPolygon(ctx, dir, [
    [-13, -11], [13, -11], [12, 7], [8, 12],
    [0, 14], [-8, 12], [-12, 7],
  ], BOAT_COLORS.ink);
  fillBoatPolygon(ctx, dir, [
    [-12, -10], [12, -10], [10, 7], [7, 11],
    [0, 13], [-7, 11], [-10, 7],
  ], BOAT_COLORS.guardianHull);

  // Lime side pontoons read as cleanup equipment and give the Guardian its
  // friendly, stable shape rather than making it a larger cargo freighter.
  fillBoatRect(ctx, dir, -11, -7, 4, 16, BOAT_COLORS.ink);
  fillBoatRect(ctx, dir, -10, -6, 2, 14, BOAT_COLORS.guardianLime);
  fillBoatRect(ctx, dir, 7, -7, 4, 16, BOAT_COLORS.ink);
  fillBoatRect(ctx, dir, 8, -6, 2, 14, BOAT_COLORS.guardianLime);

  // Central solar-blue deck and bright orange bridge keep the role readable
  // at native size and connect the ship to PLAYFOOD's optimistic palette.
  fillBoatRect(ctx, dir, -7, -9, 14, 13, BOAT_COLORS.ink);
  fillBoatRect(ctx, dir, -6, -8, 12, 11, BOAT_COLORS.guardianDeck);
  fillBoatRect(ctx, dir, -5, -7, 4, 6, BOAT_COLORS.guardianSolar);
  fillBoatRect(ctx, dir, 1, -7, 4, 6, BOAT_COLORS.guardianSolar);
  fillBoatRect(ctx, dir, -5, 4, 10, 6, BOAT_COLORS.ink);
  fillBoatRect(ctx, dir, -4, 4, 8, 5, BOAT_COLORS.guardianOrange);
  fillBoatRect(ctx, dir, -3, 5, 6, 2, BOAT_COLORS.cream);

  // A simple ocean-shield badge is the child-facing signature: guardian first,
  // technical cleanup vessel second.
  fillBoatPolygon(ctx, dir, [
    [-3, -1], [0, -4], [3, -1], [2, 2], [0, 4], [-2, 2],
  ], BOAT_COLORS.cream);
  fillBoatPolygon(ctx, dir, [
    [-2, -1], [0, -3], [2, -1], [1, 1], [0, 2], [-1, 1],
  ], BOAT_COLORS.guardianSolar);
  fillBoatRect(ctx, dir, -12, 1, 2, 4, BOAT_COLORS.guardianOrange);
  fillBoatRect(ctx, dir, 10, 1, 2, 4, BOAT_COLORS.guardianOrange);
}

function drawBoatSprite(ctx, dir, frame, tier = 0) {
  ctx.clearRect(0, 0, T, T);
  ctx.imageSmoothingEnabled = false;

  const safeTier = Number.isInteger(Number(tier)) && Number(tier) >= 0 && Number(tier) <= 4
    ? Number(tier)
    : 0;
  const halfWidths = [7, 9, 10, 11, 13];
  drawBoatWake(ctx, dir, frame, halfWidths[safeTier]);

  if (safeTier === 1) drawSailboat(ctx, dir);
  else if (safeTier === 2) drawCleanupBoat(ctx, dir);
  else if (safeTier === 3) drawEcoShip(ctx, dir);
  else if (safeTier === 4) drawGuardianShip(ctx, dir);
  else drawStarterBoat(ctx, dir);
}

// ─── NPC Sprite (island room mission guides) ─────────────
// variant: 0-3 (one per mission slot), frame: 0 or 1 (idle bob)
// color: island theme color passed in

function drawNPCSprite(ctx, variant, frame, color) {
  ctx.clearRect(0, 0, T, T);

  if (DRAFT_MODE) {
    // Simple colored body rectangle
    ctx.fillStyle = color;
    ctx.fillRect(10, 14, 12, 12);
    // Head circle (skin tone)
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.arc(16, 10, 6, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#212121';
    ctx.fillRect(13, 9, 2, 2);
    ctx.fillRect(18, 9, 2, 2);
    return;
  }

  const bob = frame === 0 ? 0 : -1;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(16, 29, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#5D4037';
  ctx.fillRect(11, 24 + bob, 4, 5);
  ctx.fillRect(18, 24 + bob, 4, 5);
  // Shoes
  ctx.fillStyle = '#424242';
  ctx.fillRect(10, 27 + bob, 5, 3);
  ctx.fillRect(17, 27 + bob, 5, 3);

  // Body (colored to island theme)
  ctx.fillStyle = color;
  ctx.fillRect(9, 14 + bob, 14, 10);
  // Body highlight
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(10, 14 + bob, 6, 3);

  // Apron / badge based on variant
  const badges = ['!', '?', '*', '#'];
  ctx.fillStyle = '#FFF';
  ctx.fillRect(13, 18 + bob, 6, 5);
  ctx.fillStyle = color;
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(badges[variant], 16, 23 + bob);

  // Arms
  ctx.fillStyle = '#FFCC80';
  ctx.fillRect(6, 16 + bob, 3, 6);
  ctx.fillRect(23, 16 + bob, 3, 6);

  // Head
  ctx.fillStyle = '#FFCC80';
  ctx.beginPath();
  ctx.roundRect(10, 4 + bob, 12, 11, 3);
  ctx.fill();

  // Hair (different per variant)
  const hairColors = ['#4E342E', '#212121', '#BF360C', '#F9A825'];
  ctx.fillStyle = hairColors[variant];
  ctx.fillRect(9, 3 + bob, 14, 5);
  if (variant % 2 === 0) {
    ctx.fillRect(9, 3 + bob, 3, 8);
    ctx.fillRect(20, 3 + bob, 3, 8);
  }

  // Face (always facing down / toward player)
  ctx.fillStyle = '#fff';
  ctx.fillRect(12, 8 + bob, 3, 3);
  ctx.fillRect(18, 8 + bob, 3, 3);
  ctx.fillStyle = '#212121';
  ctx.fillRect(13, 9 + bob, 2, 2);
  ctx.fillRect(19, 9 + bob, 2, 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(13, 9 + bob, 1, 1);
  ctx.fillRect(19, 9 + bob, 1, 1);
  // Smile
  ctx.fillStyle = '#E57373';
  ctx.fillRect(15, 12 + bob, 3, 1);
}

// ─── NPC Completed Overlay (checkmark badge) ─────────────

function drawNPCCompletedBadge(ctx) {
  ctx.clearRect(0, 0, T, T);

  if (DRAFT_MODE) {
    // Simple green circle with white check
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.arc(24, 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u2713', 24, 5);
    return;
  }
  // Green circle badge
  ctx.fillStyle = '#4CAF50';
  ctx.beginPath();
  ctx.arc(24, 4, 6, 0, Math.PI * 2);
  ctx.fill();
  // White checkmark
  ctx.strokeStyle = '#FFF';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 4);
  ctx.lineTo(23, 7);
  ctx.lineTo(28, 1);
  ctx.stroke();
}

// ─── Ambient Villager Sprite (decorative NPCs) ────────────
// dir: 0=DOWN, 1=UP, 2=LEFT, 3=RIGHT — frame: 0 or 1 (walk cycle)

function drawAmbientNPC(ctx, dir, frame, color) {
  ctx.clearRect(0, 0, T, T);

  const bob = frame === 0 ? 0 : -1;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(16, 29, 6, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Walk animation leg offset
  const legOff = frame === 1 ? 2 : 0;

  // Legs
  ctx.fillStyle = '#8D6E63';
  ctx.fillRect(12, 24 + bob, 3, 5 - legOff);
  ctx.fillRect(17, 24 + bob + legOff, 3, 5 - legOff);

  // Body (colored shirt)
  ctx.fillStyle = color;
  ctx.fillRect(10, 15 + bob, 12, 9);
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(11, 15 + bob, 5, 3);

  // Arms
  ctx.fillStyle = '#FFCC80';
  const armSwing = frame === 1 ? 1 : -1;
  ctx.fillRect(7, 17 + bob + armSwing, 3, 5);
  ctx.fillRect(22, 17 + bob - armSwing, 3, 5);

  // Head
  ctx.fillStyle = '#FFCC80';
  ctx.beginPath();
  ctx.roundRect(11, 5 + bob, 10, 10, 3);
  ctx.fill();

  // Hair (simple cap)
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(10, 4 + bob, 12, 4);
  ctx.globalAlpha = 1;

  // Eyes (direction-aware)
  const eyeY = 9 + bob;
  if (dir === 1) {
    // facing UP — no eyes visible (back of head)
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(11, 5 + bob, 10, 10);
    ctx.globalAlpha = 1;
  } else {
    // facing DOWN, LEFT, RIGHT — show eyes
    let lx = 13, rx = 19;
    if (dir === 2) { lx = 12; rx = 17; } // LEFT — shift eyes left
    if (dir === 3) { lx = 14; rx = 20; } // RIGHT — shift eyes right
    ctx.fillStyle = '#212121';
    ctx.fillRect(lx, eyeY, 2, 2);
    ctx.fillRect(rx, eyeY, 2, 2);
  }
}

// ─── Growing Island Gardener Mentor ─────────────────────
// A dedicated, front-facing named character. The straw hat, green apron,
// flower and seedling stay legible at 32×32, unlike the generic villager that
// previously relied on the name pill to communicate her role.

function drawGardenerMentor(ctx, frame) {
  ctx.clearRect(0, 0, T, T);

  const forest = '#244D32';
  const leaf = '#4F8F3A';
  const leafLight = '#79B94C';
  const straw = '#F4C95D';
  const strawShadow = '#C7902A';
  const cream = '#FFF1C7';
  const earth = '#60402B';
  const earthDeep = '#3E2A1F';
  const skin = '#F2B77E';
  const skinShadow = '#D89462';
  const flower = '#F48FB1';

  // A wider shadow anchors the named character to the same gameplay tile.
  ctx.fillStyle = 'rgba(36,77,50,0.22)';
  ctx.beginPath();
  ctx.ellipse(16, 30, 8, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Boots and trousers.
  ctx.fillStyle = earthDeep;
  ctx.fillRect(9, 25, 6, 4);
  ctx.fillRect(18, 25, 6, 4);
  ctx.fillRect(8, 28, 7, 2);
  ctx.fillRect(18, 28, 7, 2);

  // Cream sleeves behind a broad, dark-outlined gardening apron.
  ctx.fillStyle = forest;
  ctx.fillRect(7, 15, 4, 9);
  ctx.fillRect(22, 15, 4, 9);
  ctx.fillRect(9, 14, 15, 13);
  ctx.fillStyle = cream;
  ctx.fillRect(8, 16, 3, 7);
  ctx.fillRect(23, 16, 3, 7);
  ctx.fillStyle = leaf;
  ctx.fillRect(10, 15, 13, 11);
  ctx.fillStyle = leafLight;
  ctx.fillRect(11, 16, 4, 8);
  ctx.fillStyle = cream;
  ctx.fillRect(14, 19, 5, 4);
  ctx.fillStyle = forest;
  ctx.fillRect(15, 20, 3, 1);

  // Hands and the small seedling that makes her role readable without text.
  ctx.fillStyle = skin;
  ctx.fillRect(6, 21, 3, 3);
  ctx.fillRect(25, 21, 3, 3);
  ctx.fillStyle = forest;
  ctx.fillRect(27, 15, 1, 7);
  ctx.fillStyle = frame === 0 ? leafLight : leaf;
  ctx.fillRect(frame === 0 ? 24 : 25, 14, 3, 2);
  ctx.fillRect(frame === 0 ? 28 : 27, 12, 3, 2);
  ctx.fillStyle = leaf;
  ctx.fillRect(26, 15, 2, 2);

  // Head, ears and warm brown hair.
  ctx.fillStyle = skinShadow;
  ctx.fillRect(8, 8, 3, 5);
  ctx.fillRect(22, 8, 3, 5);
  ctx.fillStyle = earth;
  ctx.fillRect(9, 5, 15, 8);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.roundRect(10, 6, 13, 10, 3);
  ctx.fill();
  ctx.fillStyle = earth;
  ctx.fillRect(9, 7, 2, 7);
  ctx.fillRect(22, 7, 2, 7);

  // Friendly face; the second idle frame is a quiet blink, not another bob.
  ctx.fillStyle = forest;
  if (frame === 0) {
    ctx.fillRect(12, 10, 2, 2);
    ctx.fillRect(19, 10, 2, 2);
  } else {
    ctx.fillRect(12, 11, 2, 1);
    ctx.fillRect(19, 11, 2, 1);
  }
  ctx.fillStyle = '#C45B62';
  ctx.fillRect(15, 13, 3, 1);

  // Straw hat: a broad silhouette with one pink flower as her signature.
  ctx.fillStyle = strawShadow;
  ctx.fillRect(4, 4, 25, 4);
  ctx.fillRect(9, 0, 15, 5);
  ctx.fillStyle = straw;
  ctx.fillRect(5, 3, 23, 3);
  ctx.fillRect(10, 0, 13, 4);
  ctx.fillStyle = forest;
  ctx.fillRect(9, 3, 15, 2);
  ctx.fillStyle = flower;
  ctx.fillRect(22, 0, 3, 3);
  ctx.fillRect(21, 1, 5, 1);
  ctx.fillStyle = straw;
  ctx.fillRect(23, 1, 1, 1);
}

// ─── Local Island Market Keeper Mentor ──────────────────
// Dedicated front-facing market character. Her green apron, warm scarf and
// woven produce basket keep the role readable without relying on the name pill.

function drawMarketKeeper(ctx, frame) {
  ctx.clearRect(0, 0, T, T);

  const forest = '#285C3A';
  const apron = '#4E8A52';
  const apronLight = '#76B16A';
  const cream = '#FFF1CF';
  const scarf = '#E87832';
  const scarfLight = '#F7A34D';
  const basket = '#A9672E';
  const basketDark = '#6C3F24';
  const hair = '#70402B';
  const hairDeep = '#43281E';
  const skin = '#F2B77E';
  const skinShadow = '#D89462';
  const shoe = '#3E2A1F';

  ctx.fillStyle = 'rgba(74,64,37,0.22)';
  ctx.beginPath();
  ctx.ellipse(16, 30, 8.5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoes and lower apron.
  ctx.fillStyle = shoe;
  ctx.fillRect(9, 26, 6, 4);
  ctx.fillRect(18, 26, 6, 4);
  ctx.fillStyle = forest;
  ctx.fillRect(9, 22, 15, 5);

  // Cream blouse and wide market apron.
  ctx.fillStyle = forest;
  ctx.fillRect(7, 15, 4, 10);
  ctx.fillRect(22, 15, 4, 10);
  ctx.fillRect(9, 14, 15, 12);
  ctx.fillStyle = cream;
  ctx.fillRect(8, 16, 4, 7);
  ctx.fillRect(21, 16, 4, 7);
  ctx.fillStyle = apron;
  ctx.fillRect(10, 15, 13, 11);
  ctx.fillStyle = apronLight;
  ctx.fillRect(11, 16, 3, 8);
  ctx.fillStyle = cream;
  ctx.fillRect(15, 19, 4, 4);
  ctx.fillStyle = forest;
  ctx.fillRect(16, 20, 2, 1);

  // Orange scarf gives the named character a strong market-island accent.
  ctx.fillStyle = scarf;
  ctx.fillRect(11, 14, 11, 3);
  ctx.fillStyle = scarfLight;
  ctx.fillRect(12, 14, 5, 1);
  ctx.fillStyle = scarf;
  ctx.fillRect(frame === 0 ? 20 : 19, 16, 3, 4);

  // Woven basket, lifted by one pixel in the second quiet idle frame.
  const basketY = frame === 0 ? 21 : 20;
  ctx.fillStyle = skin;
  ctx.fillRect(5, 20, 3, 3);
  ctx.fillRect(25, 20, 3, 3);
  ctx.fillStyle = basketDark;
  ctx.fillRect(1, basketY - 2, 9, 2);
  ctx.fillRect(1, basketY, 10, 7);
  ctx.fillStyle = basket;
  ctx.fillRect(2, basketY + 1, 8, 5);
  ctx.fillStyle = basketDark;
  ctx.fillRect(3, basketY + 2, 1, 4);
  ctx.fillRect(6, basketY + 2, 1, 4);
  ctx.fillStyle = '#E95D4F';
  ctx.fillRect(3, basketY - 1, 3, 2);
  ctx.fillStyle = '#79A94B';
  ctx.fillRect(7, basketY - 1, 2, 2);

  // Head, ears, hair and a small tied bun.
  ctx.fillStyle = hairDeep;
  ctx.fillRect(8, 7, 3, 7);
  ctx.fillRect(22, 7, 3, 7);
  ctx.fillRect(23, 5, 5, 6);
  ctx.fillStyle = hair;
  ctx.fillRect(9, 4, 15, 7);
  ctx.fillStyle = skinShadow;
  ctx.fillRect(8, 9, 3, 4);
  ctx.fillRect(22, 9, 3, 4);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.roundRect(10, 6, 13, 10, 3);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.fillRect(10, 5, 13, 3);
  ctx.fillRect(9, 7, 2, 6);
  ctx.fillRect(22, 7, 2, 6);

  // Friendly face; frame 1 is a blink.
  ctx.fillStyle = forest;
  if (frame === 0) {
    ctx.fillRect(12, 10, 2, 2);
    ctx.fillRect(19, 10, 2, 2);
  } else {
    ctx.fillRect(12, 11, 2, 1);
    ctx.fillRect(19, 11, 2, 1);
  }
  ctx.fillStyle = '#B9534F';
  ctx.fillRect(15, 13, 3, 1);

  // Leaf badge connects the Keeper to local, seasonal produce.
  ctx.fillStyle = '#DCEB88';
  ctx.fillRect(20, 18, 2, 2);
  ctx.fillStyle = forest;
  ctx.fillRect(21, 17, 2, 1);
}

// ─── Food-waste Island Kitchen Chef Mentor ─────────────
// A dedicated named chef: tall toque, double-breasted jacket, coral scarf,
// mint apron and wooden spoon. These cues stay readable at the native 32px tile.

function drawKitchenChef(ctx, frame) {
  ctx.clearRect(0, 0, T, T);

  const ink = '#39494A';
  const jacket = '#FFF8E8';
  const jacketShade = '#DCE8E2';
  const mint = '#78BFA1';
  const mintDark = '#3F806B';
  const coral = '#EE765F';
  const skin = '#F2B77E';
  const skinShadow = '#D89462';
  const hair = '#704630';
  const spoon = '#C88B45';

  ctx.fillStyle = 'rgba(57,73,74,0.2)';
  ctx.beginPath();
  ctx.ellipse(16, 30, 8, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoes, trousers and broad apron silhouette.
  ctx.fillStyle = ink;
  ctx.fillRect(9, 26, 6, 4);
  ctx.fillRect(18, 26, 6, 4);
  ctx.fillRect(8, 29, 7, 2);
  ctx.fillRect(18, 29, 7, 2);
  ctx.fillStyle = mintDark;
  ctx.fillRect(8, 17, 17, 10);
  ctx.fillStyle = mint;
  ctx.fillRect(10, 18, 13, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(11, 19, 4, 6);

  // White double-breasted jacket and sleeves.
  ctx.fillStyle = jacketShade;
  ctx.fillRect(6, 16, 5, 9);
  ctx.fillRect(22, 16, 5, 9);
  ctx.fillStyle = jacket;
  ctx.fillRect(8, 14, 17, 9);
  ctx.fillRect(7, 16, 4, 7);
  ctx.fillRect(23, 16, 4, 7);
  ctx.fillStyle = ink;
  for (const [bx, by] of [[13, 17], [20, 17], [13, 21], [20, 21]]) {
    ctx.fillRect(bx, by, 1.5, 1.5);
  }
  ctx.fillStyle = coral;
  ctx.fillRect(12, 14, 9, 3);
  ctx.fillRect(15, 16, 3, 2);

  // Hands and a wooden spoon: the role reads before the name pill appears.
  ctx.fillStyle = skin;
  ctx.fillRect(5, 22, 3, 3);
  ctx.fillRect(26, 22, 3, 3);
  ctx.fillStyle = spoon;
  ctx.fillRect(28, 13, 2, 12);
  ctx.beginPath();
  ctx.ellipse(29, 11, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head, hair and friendly blink animation.
  ctx.fillStyle = skinShadow;
  ctx.fillRect(8, 8, 3, 5);
  ctx.fillRect(22, 8, 3, 5);
  ctx.fillStyle = hair;
  ctx.fillRect(9, 6, 15, 8);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.roundRect(10, 6, 13, 10, 3);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.fillRect(9, 7, 2, 7);
  ctx.fillRect(22, 7, 2, 7);
  ctx.fillStyle = ink;
  if (frame === 0) {
    ctx.fillRect(12, 10, 2, 2);
    ctx.fillRect(19, 10, 2, 2);
  } else {
    ctx.fillRect(12, 11, 2, 1);
    ctx.fillRect(19, 11, 2, 1);
  }
  ctx.fillStyle = coral;
  ctx.fillRect(15, 13, 3, 1);

  // Tall chef's toque with a mint band, deliberately wider than her face.
  ctx.fillStyle = jacketShade;
  ctx.fillRect(7, 3, 20, 5);
  ctx.fillStyle = jacket;
  ctx.beginPath();
  ctx.arc(11, 3, 5, 0, Math.PI * 2);
  ctx.arc(16, 2, 6, 0, Math.PI * 2);
  ctx.arc(22, 3, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(8, 3, 17, 5);
  ctx.fillStyle = mintDark;
  ctx.fillRect(8, 6, 17, 2);
}

// ─── Lighthouse Keeper Sprite ────────────────────────────
// A dedicated, front-facing mentor instead of the generic room villager.
// The cap, navy coat, teal scarf, moustache and brass buttons remain readable
// at the native 32×32 size and match the lighthouse's nautical identity.

function drawMechanicMentor(ctx, frame) {
  ctx.clearRect(0, 0, T, T);

  const ink = '#243B45';
  const teal = '#348A91';
  const tealLight = '#70BBC0';
  const orange = '#F29A38';
  const orangeDark = '#B75D28';
  const cream = '#FFF1C9';
  const steel = '#D3E1E3';
  const steelDark = '#5B737B';
  const hair = '#633E2C';
  const skin = '#F2B77E';
  const skinShadow = '#D89462';

  ctx.fillStyle = 'rgba(38,63,74,0.22)';
  ctx.beginPath();
  ctx.ellipse(16, 30, 9, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Strong workwear silhouette: boots, legs, jacket and pale sleeves.
  ctx.fillStyle = ink;
  ctx.fillRect(8, 27, 7, 3);
  ctx.fillRect(18, 27, 7, 3);
  ctx.fillStyle = teal;
  ctx.fillRect(9, 22, 6, 6);
  ctx.fillRect(18, 22, 6, 6);
  ctx.fillRect(8, 16, 17, 8);
  ctx.fillStyle = cream;
  ctx.fillRect(6, 17, 4, 7);
  ctx.fillRect(23, 17, 4, 7);
  ctx.fillStyle = tealLight;
  ctx.fillRect(10, 17, 4, 5);
  ctx.fillStyle = ink;
  ctx.fillRect(14, 17, 5, 6);
  ctx.fillStyle = cream;
  ctx.fillRect(15, 18, 3, 3);

  // One broad tool belt reads better than several tiny pockets.
  ctx.fillStyle = orangeDark;
  ctx.fillRect(8, 22, 17, 3);
  ctx.fillStyle = orange;
  ctx.fillRect(14, 22, 5, 4);
  ctx.fillStyle = ink;
  ctx.fillRect(16, 23, 1, 2);

  // A large wrench sits outside the body so it cannot merge with the clothing.
  const toolY = frame === 0 ? 14 : 13;
  ctx.fillStyle = skin;
  ctx.fillRect(4, 22, 3, 3);
  ctx.fillRect(26, 21, 3, 3);
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(29, 22); ctx.lineTo(29, toolY + 3);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.arc(29, toolY + 1, 3.5, 0.75, Math.PI * 2 - 0.75);
  ctx.lineTo(29, toolY + 1);
  ctx.closePath();
  ctx.fill();

  // Compact head with side hair; the face remains the brightest central shape.
  ctx.fillStyle = hair;
  ctx.fillRect(8, 7, 17, 8);
  ctx.fillRect(23, 10, 4, 7);
  ctx.fillStyle = skinShadow;
  ctx.fillRect(8, 10, 3, 5);
  ctx.fillRect(22, 10, 3, 5);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.roundRect(10, 8, 13, 9, 3);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.fillRect(9, 7, 15, 2);
  ctx.fillRect(9, 9, 2, 6);
  ctx.fillRect(22, 9, 2, 6);
  ctx.fillStyle = ink;
  if (frame === 0) {
    ctx.fillRect(12, 11, 2, 2);
    ctx.fillRect(19, 11, 2, 2);
  } else {
    ctx.fillRect(12, 12, 2, 1);
    ctx.fillRect(19, 12, 2, 1);
  }
  ctx.fillStyle = orangeDark;
  ctx.fillRect(15, 14, 3, 1);

  // Bright hard hat replaces the unreadable pair of tiny safety goggles.
  ctx.fillStyle = orangeDark;
  ctx.fillRect(6, 5, 21, 4);
  ctx.fillRect(10, 1, 13, 5);
  ctx.fillStyle = orange;
  ctx.fillRect(7, 4, 19, 3);
  ctx.fillRect(11, 1, 11, 4);
  ctx.fillStyle = '#FFC65A';
  ctx.fillRect(12, 1, 4, 3);
}

function drawLighthouseKeeper(ctx, frame) {
  ctx.clearRect(0, 0, T, T);

  const bob = frame === 0 ? 0 : -1;
  const navy = '#294B63';
  const navyDeep = '#173247';
  const capCream = '#FFF4D5';
  const capShadow = '#D7C99F';
  const teal = '#2F9B91';
  const brass = '#F3C64E';
  const skin = '#F2B77E';
  const skinShadow = '#D89462';
  const silver = '#F3F1E8';

  // Ground shadow keeps the slightly larger silhouette anchored to its tile.
  ctx.fillStyle = 'rgba(23,50,71,0.22)';
  ctx.beginPath();
  ctx.ellipse(16, 30, 8, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Boots and trousers.
  ctx.fillStyle = navyDeep;
  ctx.fillRect(10, 24 + bob, 5, 5);
  ctx.fillRect(18, 24 + bob, 5, 5);
  ctx.fillRect(9, 28 + bob, 6, 2);
  ctx.fillRect(18, 28 + bob, 6, 2);

  // Broad naval coat silhouette with darker outline and sleeves.
  ctx.fillStyle = navyDeep;
  ctx.fillRect(7, 15 + bob, 4, 9);
  ctx.fillRect(22, 15 + bob, 4, 9);
  ctx.fillRect(9, 14 + bob, 15, 12);
  ctx.fillStyle = navy;
  ctx.fillRect(10, 15 + bob, 13, 10);
  ctx.fillRect(8, 16 + bob, 3, 7);
  ctx.fillRect(23, 16 + bob, 3, 7);

  // Teal scarf connects him visually with the lighthouse interaction color.
  ctx.fillStyle = teal;
  ctx.fillRect(13, 14 + bob, 7, 3);
  ctx.fillRect(16, 16 + bob, 3, 6);

  // Brass epaulettes and buttons make the role legible without extra detail.
  ctx.fillStyle = brass;
  ctx.fillRect(10, 15 + bob, 3, 1);
  ctx.fillRect(21, 15 + bob, 3, 1);
  ctx.fillRect(13, 19 + bob, 2, 2);
  ctx.fillRect(13, 23 + bob, 2, 2);

  // Head, ears and silver sideburns.
  ctx.fillStyle = skinShadow;
  ctx.fillRect(8, 8 + bob, 3, 5);
  ctx.fillRect(22, 8 + bob, 3, 5);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.roundRect(10, 5 + bob, 13, 11, 3);
  ctx.fill();
  ctx.fillStyle = silver;
  ctx.fillRect(9, 7 + bob, 2, 7);
  ctx.fillRect(22, 7 + bob, 2, 7);

  // Bright eyes and a friendly white moustache.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(12, 9 + bob, 3, 2);
  ctx.fillRect(18, 9 + bob, 3, 2);
  ctx.fillStyle = navyDeep;
  ctx.fillRect(13, 9 + bob, 1, 2);
  ctx.fillRect(19, 9 + bob, 1, 2);
  ctx.fillStyle = silver;
  ctx.fillRect(13, 12 + bob, 3, 2);
  ctx.fillRect(17, 12 + bob, 3, 2);
  ctx.fillRect(15, 13 + bob, 3, 2);

  // High-contrast lighthouse keeper cap: cream crown, navy band, brass badge.
  ctx.fillStyle = navyDeep;
  ctx.fillRect(8, 4 + bob, 17, 3);
  ctx.fillStyle = capShadow;
  ctx.fillRect(10, 0 + bob, 13, 5);
  ctx.fillStyle = capCream;
  ctx.fillRect(11, 0 + bob, 11, 4);
  ctx.fillStyle = navy;
  ctx.fillRect(10, 4 + bob, 13, 2);
  ctx.fillStyle = brass;
  ctx.fillRect(15, 2 + bob, 3, 2);
}

// ─── Roof Accents ─────────────────────────────────────────

function drawRoofAccent(ctx, color) {
  if (DRAFT_MODE) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, T, T);
    return;
  }
  // Darker base
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, T, T);

  // Tile pattern with shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let y = 0; y < T; y += 8) {
    const off = (y / 8) % 2 === 0 ? 0 : 8;
    for (let x = off; x < T; x += 16) {
      ctx.fillRect(x, y, 8, 8);
    }
  }

  // Highlight ridge at top
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, 0, T, 3);

  // Chimney accent (right side)
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(24, 0, 6, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(24, 0, 6, 2);
}

// ─── Shore Edge Overlays (pre-rendered) ──────────────────

function drawShoreEdge(ctx, side) {
  if (DRAFT_MODE) {
    // Simple white edge line on the appropriate side
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    switch (side) {
      case 'top':    ctx.fillRect(0, 0, T, 3); break;
      case 'bottom': ctx.fillRect(0, T - 3, T, 3); break;
      case 'left':   ctx.fillRect(0, 0, 3, T); break;
      case 'right':  ctx.fillRect(T - 3, 0, 3, T); break;
    }
    return;
  }
  const fade = 10;
  let g;
  switch (side) {
    case 'top':
      g = ctx.createLinearGradient(0, 0, 0, fade);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.5, 'rgba(224,247,250,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, T, fade);
      // Foam dots
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(5, 2, 3, 1); ctx.fillRect(14, 1, 4, 1);
      ctx.fillRect(24, 3, 3, 1);
      break;
    case 'bottom':
      g = ctx.createLinearGradient(0, T - fade, 0, T);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(224,247,250,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, T - fade, T, fade);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(4, T - 3, 4, 1); ctx.fillRect(16, T - 2, 3, 1);
      ctx.fillRect(25, T - 4, 3, 1);
      break;
    case 'left':
      g = ctx.createLinearGradient(0, 0, fade, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.5, 'rgba(224,247,250,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, fade, T);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(2, 5, 1, 3); ctx.fillRect(1, 16, 1, 4);
      ctx.fillRect(3, 25, 1, 3);
      break;
    case 'right':
      g = ctx.createLinearGradient(T - fade, 0, T, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(224,247,250,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(T - fade, 0, fade, T);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(T - 3, 6, 1, 3); ctx.fillRect(T - 2, 18, 1, 4);
      ctx.fillRect(T - 4, 26, 1, 3);
      break;
  }
}

// ─── Player Sprite (4 selectable heroes) ─────
// dir: 0=down, 1=up, 2=left, 3=right | frame: 0 or 1
// hero: entry from overworld/heroes.js (colors + hair silhouette).
// Gender reads from the hair SHAPE, never from outfit color.

function drawPlayerSprite(ctx, dir, frame, hero) {
  ctx.clearRect(0, 0, T, T);

  if (DRAFT_MODE) {
    // Simple body rectangle (hero shirt)
    ctx.fillStyle = hero.shirt;
    ctx.fillRect(10, 14, 12, 12);
    // Head circle (hero skin tone)
    ctx.fillStyle = hero.skin;
    ctx.beginPath();
    ctx.arc(16, 10, 6, 0, Math.PI * 2);
    ctx.fill();
    // Hair strip
    ctx.fillStyle = hero.hair;
    ctx.fillRect(9, 4, 14, 4);
    // Eyes (only when facing down or sides)
    if (dir !== 1) {
      ctx.fillStyle = '#212121';
      ctx.fillRect(13, 9, 2, 2);
      ctx.fillRect(18, 9, 2, 2);
    }
    // Legs
    ctx.fillStyle = hero.legs;
    ctx.fillRect(11, 26, 4, 4);
    ctx.fillRect(17, 26, 4, 4);
    return;
  }

  const step = frame === 0 ? 2 : -2;
  const armSwing = frame === 0 ? -2 : 2;
  const isDown = dir === 0;
  const isUp = dir === 1;
  const isLeft = dir === 2;
  const isRight = dir === 3;
  const isSide = isLeft || isRight;

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(16, 30, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Legs ──
  ctx.fillStyle = hero.legs;
  if (isSide) {
    ctx.fillRect(12, 24, 4, 5);
    ctx.fillRect(16 + step, 24, 4, 5);
  } else {
    ctx.fillRect(10 + step, 24, 5, 5);
    ctx.fillRect(17 - step, 24, 5, 5);
  }

  // ── Shoes ──
  ctx.fillStyle = hero.shoes;
  if (isSide) {
    ctx.fillRect(11, 28, 5, 3);
    ctx.fillRect(15 + step, 28, 5, 3);
  } else {
    ctx.fillRect(9 + step, 28, 6, 3);
    ctx.fillRect(16 - step, 28, 6, 3);
  }
  // Shoe highlight
  ctx.fillStyle = hero.shoesHi;
  if (isSide) {
    ctx.fillRect(12, 28, 3, 1);
    ctx.fillRect(16 + step, 28, 3, 1);
  } else {
    ctx.fillRect(10 + step, 28, 4, 1);
    ctx.fillRect(17 - step, 28, 4, 1);
  }

  // ── Body / Shirt ──
  ctx.fillStyle = hero.shirt;
  ctx.fillRect(9, 14, 14, 10);
  // Shirt highlight
  ctx.fillStyle = hero.shirtHi;
  ctx.fillRect(10, 14, 6, 3);
  // Shirt collar
  ctx.fillStyle = '#fff';
  ctx.fillRect(12, 14, 8, 2);

  // ── Backpack (visible from behind and sides) ──
  if (isUp) {
    ctx.fillStyle = hero.pack;
    ctx.fillRect(11, 16, 10, 7);
    ctx.fillStyle = hero.packHi;
    ctx.fillRect(12, 17, 8, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(13, 18, 6, 1);
  } else if (isSide) {
    const bx = isLeft ? 18 : 7;
    ctx.fillStyle = hero.pack;
    ctx.fillRect(bx, 16, 5, 6);
    ctx.fillStyle = hero.packHi;
    ctx.fillRect(bx + 1, 17, 3, 4);
  }

  // ── Arms ──
  ctx.fillStyle = hero.skin;
  if (isDown) {
    ctx.fillRect(6, 15 + armSwing, 3, 7);
    ctx.fillRect(23, 15 - armSwing, 3, 7);
  } else if (isUp) {
    ctx.fillRect(6, 15 - armSwing, 3, 7);
    ctx.fillRect(23, 15 + armSwing, 3, 7);
  } else if (isLeft) {
    ctx.fillRect(7, 15 + armSwing, 3, 7);
  } else {
    ctx.fillRect(22, 15 + armSwing, 3, 7);
  }

  // ── Head ──
  ctx.fillStyle = hero.skin;
  ctx.beginPath();
  ctx.roundRect(10, 4, 12, 11, 3);
  ctx.fill();

  // ── Hair (the silhouette carrier — one shape per hero) ──
  // Face is drawn AFTER hair, so fringes never cover the eyes.
  ctx.fillStyle = hero.hair;
  const bounce = frame === 0 ? 0 : 1; // hair follows the walk beat
  switch (hero.style) {
    case 'pigtails': {
      // Crown + two bunches sticking OUT past the head sides.
      ctx.fillRect(9, 3, 14, 5);
      if (!isSide) {
        ctx.fillRect(6, 6 + bounce, 4, 7);
        ctx.fillRect(22, 6 + bounce, 4, 7);
        // Hair ties (cream bands)
        ctx.fillStyle = BRAND.cream;
        ctx.fillRect(6, 6 + bounce, 4, 1);
        ctx.fillRect(22, 6 + bounce, 4, 1);
      } else {
        // One bunch visible on the back side of the head
        const px = isLeft ? 21 : 7;
        ctx.fillRect(px, 6 + bounce, 4, 7);
        ctx.fillStyle = BRAND.cream;
        ctx.fillRect(px, 6 + bounce, 4, 1);
      }
      if (isUp) {
        ctx.fillStyle = hero.hair;
        ctx.fillRect(10, 3, 12, 8); // back of head
      }
      break;
    }
    case 'braid': {
      // Crown + one long plait (stacked beads with alternating offset).
      ctx.fillRect(9, 3, 14, 5);
      if (isDown) {
        // Plait hangs over the right shoulder, down to the chest
        ctx.fillRect(20, 7, 4, 4);
        ctx.fillRect(21, 11 + bounce, 4, 4);
        ctx.fillRect(20, 15 + bounce, 4, 4);
        ctx.fillStyle = BRAND.cream;
        ctx.fillRect(21, 19 + bounce, 3, 2); // tie at the tip
      } else if (isUp) {
        ctx.fillRect(10, 3, 12, 8);          // back of head
        ctx.fillRect(14, 11, 4, 4);          // plait straight down the back
        ctx.fillRect(15, 15 + bounce, 4, 4);
        ctx.fillRect(14, 19 + bounce, 4, 4);
        ctx.fillStyle = BRAND.cream;
        ctx.fillRect(15, 23 + bounce, 3, 2);
      } else {
        // Side view: plait trails behind the head
        const bx = isLeft ? 20 : 8;
        ctx.fillRect(bx, 5, 4, 5);
        ctx.fillRect(bx + (isLeft ? 1 : -1), 10 + bounce, 4, 5);
        ctx.fillRect(bx, 15 + bounce, 4, 4);
        ctx.fillStyle = BRAND.cream;
        ctx.fillRect(bx + 1, 19 + bounce, 3, 2);
      }
      break;
    }
    case 'bob': {
      // Shaggy mop-top (καρέ) with a CHOPPY hem above the jaw — a blunt
      // chin-length bob read as «girl» in the blind test; the jagged cut
      // plus ear-length sides keeps it boyish without color stereotypes.
      ctx.fillRect(9, 3, 14, 5);
      if (isDown) {
        ctx.fillRect(8, 4, 3, 7);   // ear-length sides
        ctx.fillRect(21, 4, 3, 7);
        // choppy fringe teeth
        ctx.fillRect(10, 8, 2, 1);
        ctx.fillRect(14, 8, 2, 1);
        ctx.fillRect(18, 8, 2, 1);
        ctx.fillRect(8, 11, 2, 1);  // jagged side tips
        ctx.fillRect(22, 11, 2, 1);
      } else if (isUp) {
        ctx.fillRect(8, 3, 16, 9);  // back of head, ends above the neck
        // jagged hem
        ctx.fillRect(9, 12, 2, 1);
        ctx.fillRect(13, 12, 3, 1);
        ctx.fillRect(18, 12, 2, 1);
        ctx.fillRect(22, 12, 2, 1);
      } else {
        const hx = isLeft ? 15 : 8;
        ctx.fillRect(hx, 3, 9, 8);  // shaggy mass over the back half
        ctx.fillRect(hx + (isLeft ? 1 : 0), 11, 3, 1);
        ctx.fillRect(hx + (isLeft ? 5 : 5), 11, 3, 1);
      }
      break;
    }
    default: {
      // 'short' — close crop: hairline strip + temple tufts, head mostly open.
      ctx.fillRect(10, 3, 12, 4);
      if (isDown) {
        ctx.fillRect(10, 3, 2, 5);
        ctx.fillRect(20, 3, 2, 5);
      } else if (isUp) {
        ctx.fillRect(10, 3, 12, 7);
      } else if (isLeft) {
        ctx.fillRect(18, 3, 4, 6);
      } else {
        ctx.fillRect(10, 3, 4, 6);
      }
      break;
    }
  }

  // ── Face ──
  if (isDown) {
    // Eyes (big, expressive)
    ctx.fillStyle = '#fff';
    ctx.fillRect(12, 8, 3, 3);
    ctx.fillRect(18, 8, 3, 3);
    ctx.fillStyle = '#212121';
    ctx.fillRect(13, 9, 2, 2);
    ctx.fillRect(19, 9, 2, 2);
    // Eye shine
    ctx.fillStyle = '#fff';
    ctx.fillRect(13, 9, 1, 1);
    ctx.fillRect(19, 9, 1, 1);
    // Mouth
    ctx.fillStyle = '#E57373';
    ctx.fillRect(15, 12, 3, 1);
    // Cheek blush
    ctx.fillStyle = 'rgba(255,138,128,0.4)';
    ctx.fillRect(11, 11, 2, 2);
    ctx.fillRect(20, 11, 2, 2);
  } else if (isLeft) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(11, 8, 3, 3);
    ctx.fillStyle = '#212121';
    ctx.fillRect(11, 9, 2, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(11, 9, 1, 1);
    ctx.fillStyle = 'rgba(255,138,128,0.4)';
    ctx.fillRect(10, 11, 2, 2);
  } else if (isRight) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(18, 8, 3, 3);
    ctx.fillStyle = '#212121';
    ctx.fillRect(19, 9, 2, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(19, 9, 1, 1);
    ctx.fillStyle = 'rgba(255,138,128,0.4)';
    ctx.fillRect(20, 11, 2, 2);
  }
  // dir UP = no face (just hair/cap/backpack)
}

// ─── Hero Frame Builder ───────────────────────────────────
// 4 directions × 2 walk frames for one hero. Used by buildAtlas for the
// active hero and by the MainMenu picker cards for all four previews.

export function buildHeroFrames(heroId) {
  const hero = getHero(heroId);
  const frames = [];
  for (let dir = 0; dir < 4; dir++) {
    frames[dir] = [0, 1].map((frame) =>
      makeTile((ctx) => drawPlayerSprite(ctx, dir, frame, hero)),
    );
  }
  return frames;
}

export function getBoatSpritesForTier(atlas, tier) {
  return atlas?.boats?.[Number(tier)] || atlas?.boats?.[0] || atlas?.boat || [];
}

export function buildBoatSprites() {
  return [0, 1, 2, 3, 4].map((tier) => (
    [0, 1, 2, 3].map((dir) => (
      [0, 1].map((frame) => makeTile((ctx) => drawBoatSprite(ctx, dir, frame, tier)))
    ))
  ));
}

// ─── Atlas Builder ────────────────────────────────────────

export function buildAtlas() {
  // Tiles with variants: arrays of canvases
  const tiles = {
    [TILE.SAND]:       [0, 1, 2].map((v) => makeTile((ctx) => drawSand(ctx, v))),
    [TILE.GRASS]:      [0, 1, 2].map((v) => makeTile((ctx) => drawGrass(ctx, v))),
    [TILE.DARK_GRASS]: [0, 1].map((v) => makeTile((ctx) => drawDarkGrass(ctx, v))),
    [TILE.PATH]:       [0, 1].map((v) => makeTile((ctx) => drawPath(ctx, v))),
    [TILE.TREE]:       [0, 1].map((v) => makeTile((ctx) => drawTree(ctx, v))),
    [TILE.ROCK]:       [0, 1].map((v) => makeTile((ctx) => drawRock(ctx, v))),
    [TILE.FLOWERS]:    [0, 1, 2].map((v) => makeTile((ctx) => drawFlowers(ctx, v))),
    [TILE.DOCK]:       [makeTile(drawDock)],
    [TILE.BUILDING_WALL]: [makeTile(drawBuildingWall)],
    [TILE.BUILDING_DOOR]: [makeTile(drawBuildingDoor)],
    [TILE.BRIDGE]:     [makeTile(drawBridge)],
    // ── New interior / sailing tiles ──
    [TILE.FLOOR_WOOD]:  [0, 1].map((v) => makeTile((ctx) => drawFloorWood(ctx, v))),
    [TILE.FLOOR_STONE]: [0, 1].map((v) => makeTile((ctx) => drawFloorStone(ctx, v))),
    [TILE.TABLE]:       [makeTile(drawTable)],
    [TILE.EXIT_MAT]:    [makeTile(drawExitMat)],
    // ── Game room tiles ──
    [TILE.COUNTER]:     [0, 1].map((v) => makeTile((ctx) => drawCounter(ctx, v === 0 ? WORLD_ART.counterWarm : WORLD_ART.woodShadow))),
    [TILE.FRIDGE]:      [makeTile(drawFridge)],
    [TILE.FRIDGE_DOOR]: [makeTile(drawFridgeDoor)],
  };

  // Animated water (3 frames each)
  const waterFrames = {
    deep: [0, 1, 2].map((f) => makeTile((ctx) => drawDeepWater(ctx, f))),
    shallow: [0, 1, 2].map((f) => makeTile((ctx) => drawShallowWater(ctx, f))),
  };

  // Animated buoy (3 frames — lamp pulses)
  const buoyFrames = [0, 1, 2].map((f) => makeTile((ctx) => drawBuoy(ctx, f)));

  // Shore edge overlays (4 directions)
  const shoreEdges = {
    top: makeTile((ctx) => drawShoreEdge(ctx, 'top')),
    bottom: makeTile((ctx) => drawShoreEdge(ctx, 'bottom')),
    left: makeTile((ctx) => drawShoreEdge(ctx, 'left')),
    right: makeTile((ctx) => drawShoreEdge(ctx, 'right')),
  };

  // Roof accents per island — colors come from styles/brandColors.js
  const roofs = {
    foodwaste: makeTile((ctx) => drawRoofAccent(ctx, ISLAND_COLORS.foodwaste)),
    local:     makeTile((ctx) => drawRoofAccent(ctx, ISLAND_COLORS.local)),
    growing:   makeTile((ctx) => drawRoofAccent(ctx, ISLAND_COLORS.growing)),
    circular:  makeTile((ctx) => drawRoofAccent(ctx, ISLAND_COLORS.circular)),
  };

  // Player sprites: 4 directions × 2 walk frames, drawn for the hero the
  // player picked in the MainMenu (random on first run).
  // Reading the store here keeps all 16 buildAtlas() call sites unchanged.
  const player = buildHeroFrames(useGameStore.getState().heroId);

  // Boat sprites: 5 tiers × 4 directions × 2 water-rock frames.
  const boats = buildBoatSprites();
  const boat = boats[0];

  // NPC sprites per island theme: 4 variants × 2 idle frames each.
  // Subset of brand ISLAND_COLORS (recycling hub has no NPC roster).
  const NPC_ISLAND_COLORS = {
    foodwaste: ISLAND_COLORS.foodwaste,
    local:     ISLAND_COLORS.local,
    growing:   ISLAND_COLORS.growing,
    circular:  ISLAND_COLORS.circular,
  };
  const npcs = {};
  for (const [island, color] of Object.entries(NPC_ISLAND_COLORS)) {
    npcs[island] = [0, 1, 2, 3].map((variant) =>
      [0, 1].map((frame) =>
        makeTile((ctx) => drawNPCSprite(ctx, variant, frame, color)),
      ),
    );
  }

  // NPC completed badge overlay (drawn on top of NPC)
  const npcDoneBadge = makeTile(drawNPCCompletedBadge);

  // Ambient villager sprites (decorative, walking around rooms)
  // 4 direction × 2 frames, generated per-color at runtime via drawAmbientNPC
  const ambientNPC = {};
  function buildAmbientFrames(color) {
    return [0, 1, 2, 3].map((dir) =>
      [0, 1].map((frame) =>
        makeTile((ctx) => drawAmbientNPC(ctx, dir, frame, color)),
      ),
    );
  }
  ambientNPC.build = buildAmbientFrames;

  // The Growing Island Gardener is a named mentor, so she has her own
  // two-frame identity rather than borrowing the generic ambient villager.
  const gardenerMentor = [0, 1].map((frame) =>
    makeTile((ctx) => drawGardenerMentor(ctx, frame)),
  );

  // The Local Island Market Keeper mirrors the Gardener's dedicated named-
  // character treatment while keeping her own market identity.
  const marketKeeper = [0, 1].map((frame) =>
    makeTile((ctx) => drawMarketKeeper(ctx, frame)),
  );

  // The Food-waste Island Chef is also a named mentor and uses the same
  // dedicated two-frame treatment in-room and in the mentor portrait.
  const kitchenChef = [0, 1].map((frame) =>
    makeTile((ctx) => drawKitchenChef(ctx, frame)),
  );

  const mechanicMentor = [0, 1].map((frame) =>
    makeTile((ctx) => drawMechanicMentor(ctx, frame)),
  );

  // The Lighthouse Keeper is a named mentor, so he has his own two-frame
  // identity rather than borrowing the generic ambient-villager generator.
  const lighthouseKeeper = [0, 1].map((frame) =>
    makeTile((ctx) => drawLighthouseKeeper(ctx, frame)),
  );

  return {
    tiles, waterFrames, buoyFrames, shoreEdges, roofs, player, boats, boat, npcs,
    npcDoneBadge, ambientNPC, gardenerMentor, marketKeeper, kitchenChef, mechanicMentor,
    lighthouseKeeper,
  };
}
