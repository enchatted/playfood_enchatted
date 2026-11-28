// circularCityRenderer.js — visuals unique to G4.2 Circular City.
// Reuses gameRoomRenderer for background/tiles/player/heldItem/decorations/particles and
// whereDoesItGrowRenderer.renderRevealCard for the sourced reveal card. Pure (ctx, state) draw functions.
//
// The "loop" is shown three ways: a rising Neighborhood Loop meter (renderLoopMeter), the
// transforming resources at home (renderResources), and the loop-back tokens that travel from
// a hub to the community heart on a correct delivery — or leak off-screen on a landfill drop
// (renderLoopTokens).

import { drawNPCSprite, NPC_PALETTES, OX, OY } from './gameRoomRenderer.js';
import { TILE_SIZE as TS } from './gameRoomLogic.js';
import { CANVAS_W } from '../../overworld/overworldData.js';
import { drawRoundedRect, drawText, lerp } from '../../utils/canvas.js';
import { drawFoodItem } from './itemSurface.js';

const tileCenter = (col, row) => ({ x: OX + col * TS + TS / 2, y: OY + row * TS + TS / 2 });

// Circular hubs read warm/green/blue (inviting); landfill reads dull grey-red (the leak).
const HUB_THEME = {
  repair:   { body: '#D9ECF7', roof: '#3679A8', accent: '#78B9DA', border: '#265B7C' },
  share:    { body: '#DCF2E5', roof: '#388D63', accent: '#82C99E', border: '#286647' },
  recycle:  { body: '#DDF3F5', roof: '#3694A9', accent: '#80CED6', border: '#286D7C' },
  compost:  { body: '#E5EED2', roof: '#6B8F3D', accent: '#A9C66D', border: '#4E6A2C' },
  landfill: { body: '#E1DADA', roof: '#6F6464', accent: '#A79A9A', border: '#514747' },
};

export function getCircularHubKioskGeometry(tile) {
  const { x: centerX, y: centerY } = tileCenter(tile.col, tile.row);
  const body = { x: centerX - 36, y: centerY - 38, width: 72, height: 66 };
  return {
    centerX,
    centerY,
    body,
    roof: { x: body.x - 3, y: body.y - 7, width: body.width + 6, height: 18 },
    window: { x: body.x + 10, y: body.y + 14, width: body.width - 20, height: 25 },
    counter: { x: body.x + 6, y: body.y + 38, width: body.width - 12, height: 7 },
    sign: { x: body.x + 5, y: body.y + 45, width: body.width - 10, height: 17 },
  };
}

export function getCircularCollectionDepotGeometry(resourceSlots = []) {
  const fallbackSlots = Array.from({ length: 8 }, (_, index) => ({ col: 6 + index, row: 11 }));
  const tiles = resourceSlots.length ? resourceSlots : fallbackSlots;
  const centers = tiles.map((tile) => tileCenter(tile.col, tile.row));
  const first = centers[0];
  const last = centers[centers.length - 1];
  const body = {
    x: first.x - 22,
    y: first.y - 29,
    width: (last.x - first.x) + 44,
    height: 58,
  };
  return {
    body,
    header: { x: body.x + 24, y: body.y - 20, width: body.width - 48, height: 20 },
    slots: centers,
    shelfY: first.y + 18,
  };
}

export function getCircularCommunityGeometry(community) {
  const center = tileCenter(community.col, community.row);
  return {
    center,
    outerRadius: 48,
    innerRadius: 34,
    label: { x: center.x - 42, y: center.y + 27, width: 84, height: 17 },
  };
}

export function updateCircularResidents(state, dt) {
  for (const resident of state.residents || []) {
    resident.x += resident.direction * resident.speed * dt;
    if (resident.x >= resident.maxCol) {
      resident.x = resident.maxCol;
      resident.direction = -1;
    } else if (resident.x <= resident.minCol) {
      resident.x = resident.minCol;
      resident.direction = 1;
    }
  }
}

// ─── Community heart (loop-back token target) ────────────
export function renderCommunity(ctx, room, state = {}) {
  if (!room.community) return;
  const geometry = getCircularCommunityGeometry(room.community);
  const { center, outerRadius, innerRadius, label } = geometry;
  const { x, y } = center;

  // A solid civic plaza replaces the unexplained transparent house marker.
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 6, outerRadius, 16, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(48,39,34,0.16)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#D7E3D7';
  ctx.fill();
  ctx.strokeStyle = '#3F7D58';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Eight paving segments make the circular route visible before any delivery.
  for (let index = 0; index < 8; index++) {
    const angle = -Math.PI / 2 + index * (Math.PI / 4);
    const px = x + Math.cos(angle) * 40;
    const py = y + Math.sin(angle) * 40;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = index < Math.round(((state.loopMeter || 0) / 100) * 8)
      ? '#3F9B6D' : '#AABDAE';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#FFF5D9';
  ctx.fill();
  ctx.strokeStyle = '#6F8F6D';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '27px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♻️', x, y - 4);

  drawRoundedRect(ctx, label.x, label.y, label.width, label.height, 8, '#3F7D58', '#28533A');
  drawText(ctx, state.loopLabel || 'Neighbourhood loop', x, label.y + label.height / 2, {
    font: "bold 7.5px 'Inter', system-ui, sans-serif",
    color: '#FFFBEF', align: 'center', baseline: 'middle',
  });
}

export function renderCircularResidents(ctx, state) {
  for (const resident of state.residents || []) {
    const x = OX + resident.x * TS;
    const y = OY + resident.row * TS;
    const walkFrame = Math.floor(state.time * 5 + resident.paletteIndex) % 2;
    const direction = resident.direction > 0 ? 3 : 2;
    const palette = NPC_PALETTES[resident.paletteIndex % NPC_PALETTES.length];
    drawNPCSprite(ctx, x, y, palette, direction, walkFrame, state.time);
  }
}

// ─── Delivery hubs ───────────────────────────────────────
export function renderHubs(ctx, state) {
  if (!state.nodes) return;

  for (const node of state.nodes) {
    const tile = node.tiles[0];
    const geometry = getCircularHubKioskGeometry(tile);
    const { body, roof, window, counter, sign, centerX: cx } = geometry;
    const theme = HUB_THEME[node.key] || HUB_THEME.repair;

    // Hint pulse on the correct hub after a wrong delivery.
    if (state.hintNodeKey === node.key) {
      const pulse = 0.5 + Math.sin(state.time * 6) * 0.5;
      drawRoundedRect(ctx, body.x - 5, roof.y - 5, body.width + 10, body.height + 20, 13,
        `rgba(244,183,64,${0.25 + pulse * 0.4})`, '#f4b740');
    }
    // Highlight the hub the player currently faces.
    if (state.facingNodeKey === node.key) {
      drawRoundedRect(ctx, body.x - 3, roof.y - 3, body.width + 6, body.height + 16, 12,
        'rgba(255,255,255,0.18)', '#ffffff');
    }

    // Ground shadow and compact neighborhood shopfront.
    ctx.beginPath();
    ctx.ellipse(cx, body.y + body.height + 3, 31, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(48, 39, 34, 0.18)';
    ctx.fill();
    drawRoundedRect(ctx, body.x, body.y, body.width, body.height, 7, theme.body, theme.border);
    drawRoundedRect(ctx, roof.x, roof.y, roof.width, roof.height, 7, theme.roof, theme.border);

    // Striped awning makes every destination read as a real service kiosk.
    const stripeWidth = roof.width / 6;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? theme.accent : '#FFF8E8';
      ctx.fillRect(roof.x + i * stripeWidth, roof.y + 8, stripeWidth + 0.5, 8);
    }

    drawRoundedRect(ctx, window.x, window.y, window.width, window.height, 5, '#FFF9E8', theme.border);

    ctx.font = '23px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.emoji, cx, window.y + window.height / 2 + 1);
    drawRoundedRect(ctx, counter.x, counter.y, counter.width, counter.height, 3, theme.roof, theme.border);

    // Landfill is still a destination, but its warning stays visibly distinct.
    if (node.isLeak) {
      drawRoundedRect(ctx, body.x + body.width - 18, body.y - 4, 20, 20, 10, '#FFD166', '#8B5E00');
      ctx.font = '12px sans-serif';
      ctx.fillText('⚠️', body.x + body.width - 8, body.y + 6);
    }

    // The destination name belongs to the shopfront; it never floats below the kiosk.
    const label = node.rLabel || node.label || node.key;
    let labelSize = 9;
    ctx.font = `bold ${labelSize}px 'Inter', system-ui, sans-serif`;
    while (ctx.measureText(label).width > sign.width - 8 && labelSize > 7) {
      labelSize -= 0.5;
      ctx.font = `bold ${labelSize}px 'Inter', system-ui, sans-serif`;
    }
    drawRoundedRect(ctx, sign.x, sign.y, sign.width, sign.height, 5, theme.roof, theme.border);
    drawText(ctx, label, cx, sign.y + sign.height / 2 + 0.5, {
      font: `bold ${labelSize}px 'Inter', system-ui, sans-serif`,
      color: '#fff', align: 'center', baseline: 'middle',
    });
  }
}

// ─── Shared community collection point ─────────────────
export function renderResourceDepot(ctx, state, room) {
  const geometry = getCircularCollectionDepotGeometry(room?.resourceSlots);
  const { body, header, slots, shelfY } = geometry;

  drawRoundedRect(ctx, body.x + 3, body.y + 5, body.width, body.height, 8,
    'rgba(48,39,34,0.20)', 'transparent');
  drawRoundedRect(ctx, body.x, body.y, body.width, body.height, 8, '#8D6E63', '#4E342E');
  drawRoundedRect(ctx, body.x + 6, body.y + 7, body.width - 12, body.height - 14, 5,
    '#F4E4C4', '#6D4C41');

  // Eight equal open bays keep every household object grounded in one system.
  const bayWidth = body.width / slots.length;
  ctx.strokeStyle = 'rgba(109,76,65,0.48)';
  ctx.lineWidth = 1;
  for (let index = 1; index < slots.length; index++) {
    const dividerX = body.x + bayWidth * index;
    ctx.beginPath();
    ctx.moveTo(dividerX, body.y + 8);
    ctx.lineTo(dividerX, body.y + body.height - 7);
    ctx.stroke();
  }
  ctx.fillStyle = '#6D4C41';
  ctx.fillRect(body.x + 4, shelfY, body.width - 8, 6);
  ctx.fillStyle = '#BCAAA4';
  ctx.fillRect(body.x + 5, shelfY, body.width - 10, 2);

  drawRoundedRect(ctx, header.x, header.y, header.width, header.height, 9, '#3F7D58', '#28533A');
  drawText(ctx, `♻️ ${state.collectionPointLabel || 'Collection point'}`,
    header.x + header.width / 2, header.y + header.height / 2 + 0.5, {
      font: "bold 10px 'Inter', system-ui, sans-serif",
      color: '#FFFBEF', align: 'center', baseline: 'middle',
    });
}

// ─── Resources waiting at home ───────────────────────────
export function renderResources(ctx, state) {
  if (!state.resources) return;

  for (const r of state.resources) {
    if (r.routed || r.id === state.carrying) continue; // routed gone; carried is in-hand
    const cx = OX + r.tile.col * TS + TS / 2;
    const cy = OY + r.tile.row * TS + TS / 2;
    // The shared depot owns the surface; resources sit directly in its eight bays.
    drawFoodItem(ctx, r.emoji, cx, cy - 2, { surface: null, time: state.time, bob: 0.6, emojiSize: 22 });
  }
}

// ─── Neighborhood Loop meter (top HUD — fills up) ────────
export function renderLoopMeter(ctx, state) {
  const v = Math.max(0, Math.min(100, state.loopMeter || 0));
  const w = 280, h = 16;
  const x = CANVAS_W / 2 - w / 2;
  const y = 18;

  // Plated title — teal text merged with the same-colored wall windows
  const routed = (state.routedProgressTemplate || 'Routed __C__/__T__')
    .replace('__C__', state.routedCount || 0)
    .replace('__T__', state.total || 0);
  const kept = (state.keptProgressTemplate || 'Kept in loop __C__/__T__')
    .replace('__C__', state.correctCount || 0)
    .replace('__T__', state.total || 0);
  const label = `${routed} · ${kept}`;
  ctx.font = "bold 12px 'Inter', system-ui, sans-serif";
  const labelW = ctx.measureText(label).width + 16;
  drawRoundedRect(ctx, CANVAS_W / 2 - labelW / 2, y - 17, labelW, 15, 7,
    'rgba(44,95,134,0.9)', 'transparent');
  drawText(ctx, label, CANVAS_W / 2, y - 9, {
    font: "bold 12px 'Inter', system-ui, sans-serif",
    color: '#fff', align: 'center', baseline: 'middle',
  });
  drawRoundedRect(ctx, x, y, w, h, 8, 'rgba(0,0,0,0.30)', 'rgba(255,255,255,0.55)');
  drawRoundedRect(ctx, x + 2, y + 2, (w - 4) * (v / 100), h - 4, 6, '#3f9b6d', 'transparent');
}

// ─── Loop-back tokens (the visible resource/currency loop) ─
function easeOut(t) { return 1 - (1 - t) * (1 - t); }

export function renderLoopTokens(ctx, state) {
  if (!state.tokens) return;
  for (const tk of state.tokens) {
    const e = easeOut(tk.t);
    const x = lerp(tk.sx, tk.tx, e);
    const y = lerp(tk.sy, tk.ty, e);
    // circular tokens (♻️/🪙) travel hub→community at full opacity;
    // the leak token (🗑️) flies off-screen and fades out (resource lost).
    ctx.globalAlpha = tk.leak ? Math.max(0, 1 - tk.t) : 1;
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tk.emoji, x, y);
    ctx.globalAlpha = 1;
  }
}
