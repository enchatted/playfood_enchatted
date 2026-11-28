// FoodRescue-specific rendering — industrial sorting center atmosphere.
// Reuses shared functions from gameRoomRenderer.js; adds conveyor belt,
// donation crate, compost bin, trash zone, quality overlays, and speed UI.

import {
  CANVAS_W, CANVAS_H, TILE_SIZE as TS,
} from '../../overworld/overworldData.js';
import { drawRoundedRect, drawText } from '../../utils/canvas.js';
import { OX, OY } from './gameRoomRenderer.js';

// ─── Industrial Wall (row 0) ──────────────────────────────
// Metal panels with localized "SORTING CENTER" sign and ceiling lights.

export function renderIndustrialWall(ctx, t) {
  const wallY = OY;

  // Metal panel gradient across full row 0
  for (let c = 1; c <= 18; c++) {
    const cx = OX + c * TS;
    const panelGrad = ctx.createLinearGradient(cx, wallY, cx, wallY + TS);
    panelGrad.addColorStop(0, '#78909C');
    panelGrad.addColorStop(0.5, '#90A4AE');
    panelGrad.addColorStop(1, '#607D8B');
    ctx.fillStyle = panelGrad;
    ctx.fillRect(cx, wallY, TS, TS);

    // Panel seam line
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, wallY + 0.5, TS - 1, TS - 1);

    // Rivet dots (corners)
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (const [rx, ry] of [[3, 3], [TS - 4, 3], [3, TS - 4], [TS - 4, TS - 4]]) {
      ctx.beginPath();
      ctx.arc(cx + rx, wallY + ry, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // "SORTING CENTER" sign (localized)
  const signText = t?.('food_rescue.sorting_center', 'SORTING CENTER') || 'SORTING CENTER';
  const signW = 180;
  const signH = 22;
  const signX = OX + 10 * TS - signW / 2;
  const signY = wallY + (TS - signH) / 2;

  drawRoundedRect(ctx, signX, signY, signW, signH, 4, '#37474F', '#263238');
  drawText(ctx, signText, OX + 10 * TS, signY + signH / 2, {
    font: "bold 11px 'Inter', system-ui, sans-serif",
    color: '#FFD54F',
    align: 'center',
    baseline: 'middle',
  });

  // Ceiling lights
  for (const lc of [4, 10, 16]) {
    const lx = OX + lc * TS + TS / 2;
    const ly = wallY + 4;
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#FFF9C4';
    ctx.beginPath();
    ctx.arc(lx, ly + 6, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#FFE082';
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#F9A825';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = '#455A64';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, wallY);
    ctx.lineTo(lx, ly - 3);
    ctx.stroke();
  }
}

// ─── Conveyor Belt ────────────────────────────────────────

export function renderConveyorBelt(ctx, state) {
  const beltCols = [9, 10];
  const rowStart = 1;
  const rowEnd = 13;

  const bx = OX + beltCols[0] * TS;
  const by = OY + rowStart * TS;
  const bw = beltCols.length * TS;
  const bh = (rowEnd - rowStart) * TS;

  const beltGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  beltGrad.addColorStop(0, '#616161');
  beltGrad.addColorStop(0.3, '#757575');
  beltGrad.addColorStop(0.7, '#757575');
  beltGrad.addColorStop(1, '#616161');
  ctx.fillStyle = beltGrad;
  ctx.fillRect(bx, by, bw, bh);

  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, bw, bh);
  ctx.clip();

  ctx.strokeStyle = 'rgba(189,189,189,0.25)';
  ctx.lineWidth = 2;
  const stripeGap = 16;
  const offset = state.beltAnimOffset % stripeGap;

  for (let y = by - stripeGap + offset; y < by + bh + stripeGap; y += stripeGap) {
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.lineTo(bx + bw, y - 8);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#455A64';
  ctx.fillRect(bx - 3, by, 3, bh);
  ctx.fillRect(bx + bw, by, 3, bh);

  for (const ry of [by - 2, by + bh - 2]) {
    for (let i = 0; i < 2; i++) {
      const rx = bx + i * TS + TS / 2;
      ctx.fillStyle = '#37474F';
      ctx.beginPath();
      ctx.arc(rx, ry + 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ─── Belt Items ───────────────────────────────────────────

export function renderBeltItems(ctx, state) {
  for (const item of state.beltItems) {
    if (item.rescued || item.trashed) continue;
    const ix = OX + item.pixelX;
    const iy = OY + item.pixelY;
    const bob = Math.sin(state.time * 3 + item.id * 1.7) * 1.5;

    if (item.quality === 'ugly') {
      ctx.globalAlpha = 0.35 + Math.sin(state.time * 4) * 0.15;
      ctx.fillStyle = '#FFD54F';
      ctx.beginPath();
      ctx.arc(ix + bob, iy, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (item.quality === 'good') {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#66BB6A';
      ctx.beginPath();
      ctx.arc(ix + bob, iy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#4E342E';
      ctx.beginPath();
      ctx.arc(ix + bob, iy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const emojiSize = item.quality === 'ugly' ? '20px' : '18px';
    ctx.font = `${emojiSize} sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (item.quality === 'rotten') ctx.globalAlpha = 0.7;
    ctx.fillText(item.emoji, ix + bob, iy);
    ctx.globalAlpha = 1;

    if (item.quality === 'ugly') {
      ctx.fillStyle = 'rgba(93,64,55,0.6)';
      ctx.beginPath();
      ctx.ellipse(ix + bob + 6, iy + 4, 4, 3, 0.3, 0, Math.PI * 2);
      ctx.fill();

      const badgePulse = 1 + Math.sin(state.time * 6) * 0.1;
      ctx.save();
      ctx.translate(ix + bob, iy - 14);
      ctx.scale(badgePulse, badgePulse);
      drawRoundedRect(ctx, -20, -6, 40, 12, 4, '#FFD54F', '#F9A825');
      drawText(ctx, 'SAVE ME!', 0, 0, {
        font: "bold 6px 'Inter', system-ui, sans-serif",
        color: '#5D4037',
        align: 'center',
        baseline: 'middle',
      });
      ctx.restore();
    }

    if (item.quality === 'rotten') {
      const flyAngle = state.time * 4 + item.id;
      const flyX = ix + bob + Math.cos(flyAngle) * 12;
      const flyY = iy + Math.sin(flyAngle) * 8;
      ctx.font = '8px sans-serif';
      ctx.fillText('🪰', flyX, flyY);
    }
  }
}

// ─── Donation Crate (ΔΩΡΕΑ) ───────────────────────────────

export function renderDonationCrate(ctx, state, t) {
  const cx = OX + 3 * TS;
  const cy = OY + 4 * TS;
  const cw = 2 * TS;
  const ch = 2 * TS;

  if (state.heldItem && state.heldItem.quality !== 'rotten') {
    const player = state.player;
    const dist = Math.abs(player.col - 3.5) + Math.abs(player.row - 4.5);
    if (dist < 4) {
      ctx.globalAlpha = 0.2 + Math.sin(state.time * 4) * 0.1;
      ctx.fillStyle = '#66BB6A';
      ctx.fillRect(cx - 4, cy - 4, cw + 8, ch + 8);
      ctx.globalAlpha = 1;
    }
  }

  const crateGrad = ctx.createLinearGradient(cx, cy, cx, cy + ch);
  crateGrad.addColorStop(0, '#A1887F');
  crateGrad.addColorStop(1, '#6D4C41');
  ctx.fillStyle = crateGrad;
  ctx.fillRect(cx, cy, cw, ch);
  ctx.strokeStyle = '#5D4037';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx, cy, cw, ch);

  ctx.font = '22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('❤️', cx + cw / 2, cy + ch / 2 - 6);

  const label = t?.('food_rescue.donate_label', 'DONATE') || 'DONATE';
  drawText(ctx, label, cx + cw / 2, cy + ch / 2 + 12, {
    font: "bold 9px 'Inter', system-ui, sans-serif",
    color: '#FFF8E1',
    align: 'center',
    baseline: 'middle',
  });
}

// ─── Compost Bin (ΛΙΠΑΣΜΑ) ────────────────────────────────

export function renderCompostBin(ctx, state, t) {
  const cx = OX + 16 * TS;
  const cy = OY + 4 * TS;
  const cw = 2 * TS;
  const ch = 2 * TS;

  if (state.heldItem && state.heldItem.quality === 'rotten') {
    const player = state.player;
    const dist = Math.abs(player.col - 16.5) + Math.abs(player.row - 4.5);
    if (dist < 4) {
      ctx.globalAlpha = 0.2 + Math.sin(state.time * 4) * 0.1;
      ctx.fillStyle = '#81C784';
      ctx.fillRect(cx - 4, cy - 4, cw + 8, ch + 8);
      ctx.globalAlpha = 1;
    }
  }

  const binGrad = ctx.createLinearGradient(cx, cy, cx, cy + ch);
  binGrad.addColorStop(0, '#66BB6A');
  binGrad.addColorStop(1, '#388E3C');
  ctx.fillStyle = binGrad;
  ctx.fillRect(cx, cy, cw, ch);
  ctx.strokeStyle = '#1B5E20';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx, cy, cw, ch);

  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('♻️', cx + cw / 2, cy + ch / 2 - 6);

  const label = t?.('food_rescue.compost_label', 'COMPOST') || 'COMPOST';
  drawText(ctx, label, cx + cw / 2, cy + ch / 2 + 12, {
    font: "bold 8px 'Inter', system-ui, sans-serif",
    color: '#E8F5E9',
    align: 'center',
    baseline: 'middle',
  });
}

// ─── Trash Zone ───────────────────────────────────────────

export function renderTrashZone(ctx, state, t) {
  const zx = OX + 9 * TS - 3;
  const zy = OY + 12 * TS;
  const zw = 2 * TS + 6;
  const zh = 2 * TS;

  const pulse = 0.08 + Math.sin(state.time * 3) * 0.04;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#EF5350';
  ctx.fillRect(zx, zy, zw, zh);
  ctx.globalAlpha = 1;

  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🗑️', OX + 9.5 * TS + TS / 2, zy + zh / 2);

  const label = t?.('food_rescue.waste_label', 'WASTE') || 'WASTE';
  drawText(ctx, label, OX + 9.5 * TS + TS / 2, zy + zh / 2 + 14, {
    font: "bold 7px 'Inter', system-ui, sans-serif",
    color: 'rgba(239,83,80,0.7)',
    align: 'center',
    baseline: 'middle',
  });
}

// ─── Speed UI ─────────────────────────────────────────────

export function renderBeltSpeedIndicator(ctx, state, t) {
  const level = state.beltSpeedLevel;
  const colors = ['#4CAF50', '#FFC107', '#FF9800', '#F44336'];
  const color = colors[Math.min(level, colors.length - 1)];

  const px = CANVAS_W - 130;
  const py = 58;
  const w = 110;
  const h = 32; // Larger

  drawRoundedRect(ctx, px, py, w, h, 10, 'rgba(55,71,79,0.85)', color);

  const labelText = t?.('food_rescue.speed_label', 'Speed {{level}}x', { level: level + 1 }) || `Speed ${level + 1}x`;
  drawText(ctx, `⚡ ${labelText}`, px + w / 2, py + h / 2, {
    font: "bold 12px 'Inter', system-ui, sans-serif",
    color: '#fff',
    align: 'center',
    baseline: 'middle',
  });
}

export function renderSpeedUpFlash(ctx, state) {
  if (state.speedUpFlash <= 0) return;

  const alpha = Math.min(0.25, state.speedUpFlash * 0.2);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#FFE082';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.globalAlpha = 1;

  const textAlpha = Math.min(1, state.speedUpFlash * 1.5);
  ctx.globalAlpha = textAlpha;
  
  // Perfectly centered and much larger
  drawText(ctx, state.speedUpText || 'SPEED UP!', CANVAS_W / 2, CANVAS_H / 2, {
    font: "bold 42px 'Inter', system-ui, sans-serif",
    color: '#FF8F00',
    align: 'center',
    baseline: 'middle',
  });

  ctx.globalAlpha = 1;
}

// ─── Vertical Stats HUD (Top-Left) ───────────────────────

export function renderRescueStats(ctx, state) {
  const sx = 12;
  const sy = 58;
  const badgeW = 74; // Wider for better numbers
  const badgeH = 32; // Taller
  const spacing = 8;

  // Background panel for all 3 stats
  drawRoundedRect(ctx, sx - 4, sy - 4, badgeW + 8, (badgeH + spacing) * 3 + 4, 12, 'rgba(55,71,79,0.6)', null);

  const badges = [
    { emoji: '❤️', count: state.donationCount, color: '#FFEBEE' },
    { emoji: '♻️', count: state.compostCount, color: '#E8F5E9' },
    { emoji: '🗑️', count: state.trashCount, color: '#FFEBEE' },
  ];

  for (let i = 0; i < badges.length; i++) {
    const by = sy + i * (badgeH + spacing);
    
    // Mini badge pill
    drawRoundedRect(ctx, sx, by, badgeW, badgeH, 10, 'rgba(0,0,0,0.3)', null);

    ctx.font = '18px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(badges[i].emoji, sx + 8, by + badgeH / 2);

    drawText(ctx, String(badges[i].count), sx + 50, by + badgeH / 2 + 1, {
      font: "bold 16px 'Inter', system-ui, sans-serif",
      color: badges[i].color,
      align: 'center',
      baseline: 'middle',
    });
  }
}

export function renderRescueTipBanner(ctx, state) {
  if (!state.tipBanner || state.tipBannerLife <= 0) return;
  const alpha = Math.min(1, state.tipBannerLife * 2);
  ctx.globalAlpha = alpha;
  const bw = Math.min(500, CANVAS_W - 100);
  const bh = 40;
  const bx = (CANVAS_W - bw) / 2;
  const by = CANVAS_H / 2 + 120; // Pushed down to clear speed flash
  drawRoundedRect(ctx, bx, by, bw, bh, 14, 'rgba(56,142,60,0.95)', '#2E7D32');
  drawText(ctx, state.tipBanner, CANVAS_W / 2, by + bh / 2, {
    font: "bold 14px 'Inter', system-ui, sans-serif",
    color: '#fff', align: 'center', baseline: 'middle',
  });
  ctx.globalAlpha = 1;
}
