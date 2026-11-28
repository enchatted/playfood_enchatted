// planetaryBoundariesRenderer.js — visuals unique to G4.3 Planetary Boundaries.
// Reuses gameRoomRenderer for background/tiles/player/decorations/particles and
// whereDoesItGrowRenderer.renderRevealCard for the sourced reveal card. Pure (ctx, state) functions.
//
// The centrepiece is the boundary ring (renderBoundaryRing): 9 wedges around a planet,
// green = inside the safe space, red = transgressed. The choice modal (renderChoiceModal)
// is the 2-option strategic trade-off card.

import { drawNPCSprite, NPC_PALETTES, OX, OY } from './gameRoomRenderer.js';
import { TILE_SIZE as TS } from './gameRoomLogic.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { drawRoundedRect, drawText } from '../../utils/canvas.js';
import { canvasCssScale, readableUnit } from '../../utils/hidpi.js';

const SAFE_FILL = 'rgba(63,155,109,0.92)';   const SAFE_BORDER = '#2c7a54';
const BAD_FILL  = 'rgba(239,111,111,0.92)';  const BAD_BORDER  = '#c0392b';
const CONTROL_BLUE = '#2c5f86';
const CONTROL_GLOW = '#72c9dc';

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

export function getMissionControlLinks(state) {
  if (!state?.ringCenterPx || !state?.consoles) return [];
  return state.consoles.map((console) => ({
    key: console.key,
    chosen: Boolean(console.chosen),
    x: OX + console.tiles[0].col * TS + TS / 2,
    y: OY + console.tiles[0].row * TS + TS / 2,
  }));
}

// A shared floor network makes the four decisions read as one planetary system.
// It is rendered below the ring and consoles, so it guides without blocking play.
export function renderMissionControlDeck(ctx, state) {
  if (!state?.ringCenterPx) return;
  const hub = state.ringCenterPx;
  const links = getMissionControlLinks(state);

  ctx.save();

  const glow = ctx.createRadialGradient(hub.x, hub.y, 42, hub.x, hub.y, 142);
  glow.addColorStop(0, 'rgba(114,201,220,0.18)');
  glow.addColorStop(0.72, 'rgba(44,95,134,0.11)');
  glow.addColorStop(1, 'rgba(44,95,134,0)');
  ctx.beginPath();
  ctx.arc(hub.x, hub.y, 142, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(hub.x, hub.y, 127, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(44,95,134,0.28)';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hub.x, hub.y, 121, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(114,201,220,0.58)';
  ctx.lineWidth = 2;
  ctx.stroke();

  for (const link of links) {
    const activeColor = link.chosen ? '#7399ba' : CONTROL_GLOW;

    ctx.beginPath();
    ctx.moveTo(hub.x, hub.y);
    ctx.lineTo(link.x, link.y);
    ctx.strokeStyle = 'rgba(38,66,103,0.35)';
    ctx.lineWidth = 13;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hub.x, hub.y);
    ctx.lineTo(link.x, link.y);
    ctx.strokeStyle = activeColor;
    ctx.globalAlpha = link.chosen ? 0.8 : 0.52;
    ctx.lineWidth = link.chosen ? 4 : 3;
    ctx.stroke();
    ctx.globalAlpha = 1;

    drawRoundedRect(ctx, link.x - 29, link.y - 29, 58, 58, 15,
      'rgba(235,247,248,0.72)', link.chosen ? '#7399ba' : CONTROL_BLUE);

    for (const step of [0.28, 0.48, 0.68]) {
      const x = hub.x + (link.x - hub.x) * step;
      const y = hub.y + (link.y - hub.y) * step;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.fill();
    }
  }

  ctx.restore();
}

export function getBoundaryLabelLayout(center, boundaries, radius = 83) {
  if (!center || !boundaries?.length) return [];
  const segmentAngle = (Math.PI * 2) / boundaries.length;
  return boundaries.map((boundary, index) => {
    const angle = -Math.PI / 2 + (index + 0.5) * segmentAngle;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
      lines: String(boundary.short || boundary.key).split(/\s+/),
    };
  });
}

export function getChoiceAffectedBoundaryLabels(boundaries, option) {
  const affectedKeys = new Set(
    Object.entries(option?.effects || {}).filter(([, value]) => value !== 0).map(([key]) => key),
  );
  return (boundaries || [])
    .filter((boundary) => affectedKeys.has(boundary.key))
    .map((boundary) => boundary.short || boundary.key);
}

export function updatePlanetaryTechnicians(state, dt) {
  for (const technician of state.technicians || []) {
    technician.x += technician.direction * technician.speed * dt;
    if (technician.x >= technician.maxCol) {
      technician.x = technician.maxCol;
      technician.direction = -1;
    } else if (technician.x <= technician.minCol) {
      technician.x = technician.minCol;
      technician.direction = 1;
    }
  }
}

function renderObservationStation(ctx, { x, y, width, icon, title, accent }) {
  ctx.fillStyle = 'rgba(20,45,65,0.16)';
  drawRoundedRect(ctx, x + 3, y + 4, width, 58, 14, 'rgba(20,45,65,0.16)', 'transparent');
  drawRoundedRect(ctx, x, y, width, 58, 14, '#E8F4F5', '#2C5F86');
  drawRoundedRect(ctx, x + 7, y + 7, width - 14, 28, 9, '#244E70', 'transparent');

  ctx.font = '22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, x + 25, y + 21);

  // Crisp monitor trace instead of another emoji-only decoration.
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 44, y + 23);
  ctx.lineTo(x + 56, y + 17);
  ctx.lineTo(x + 68, y + 24);
  ctx.lineTo(x + 81, y + 13);
  ctx.lineTo(x + width - 12, y + 20);
  ctx.stroke();
  for (let dot = 0; dot < 3; dot += 1) {
    ctx.beginPath();
    ctx.arc(x + width - 14 - dot * 9, y + 43, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = dot === 0 ? '#62B873' : '#8EB9CE';
    ctx.fill();
  }

  drawText(ctx, title, x + 10, y + 45, {
    font: "800 8.5px 'Inter', system-ui, sans-serif",
    color: '#244E70', align: 'left', baseline: 'middle',
  });
}

export function renderPlanetaryObservationLab(ctx, state) {
  const stationY = OY + TS * 1.05;
  renderObservationStation(ctx, {
    x: OX + TS * 1.45,
    y: stationY,
    width: TS * 4.1,
    icon: '🛰️',
    title: state.satelliteStationLabel || 'Satellite station',
    accent: '#72C9DC',
  });
  renderObservationStation(ctx, {
    x: OX + TS * 14.45,
    y: stationY,
    width: TS * 4.1,
    icon: '🌍',
    title: state.earthStationLabel || 'Earth observation',
    accent: '#86D07B',
  });

  for (const technician of state.technicians || []) {
    const x = OX + technician.x * TS;
    const y = OY + technician.row * TS;
    const walkFrame = Math.floor(state.time * 5 + technician.paletteIndex) % 2;
    const direction = technician.direction > 0 ? 3 : 2;
    const palette = NPC_PALETTES[technician.paletteIndex % NPC_PALETTES.length];
    drawNPCSprite(ctx, x, y, palette, direction, walkFrame, state.time);

    const pulse = 0.55 + Math.sin(state.time * 3 + technician.paletteIndex) * 0.25;
    ctx.globalAlpha = pulse;
    drawText(ctx, technician.station === 'satellite' ? '✦' : '⌁', x + 16, y - 4, {
      font: "bold 13px 'Inter', system-ui, sans-serif",
      color: technician.station === 'satellite' ? '#72C9DC' : '#62B873',
      align: 'center', baseline: 'middle',
    });
    ctx.globalAlpha = 1;
  }
}

// ─── The boundary ring hologram (centrepiece) ────────────
export function renderBoundaryRing(ctx, state) {
  if (!state.boundaries || !state.ringCenterPx) return;
  const c = state.ringCenterPx;
  const rOuter = 104, rInner = 60;
  const n = state.boundaries.length; // 9
  const seg = (Math.PI * 2) / n;
  const pulse = state.ringPulse > 0 ? 1 + Math.sin(state.time * 14) * 0.04 : 1;

  for (let i = 0; i < n; i++) {
    const b = state.boundaries[i];
    const safe = b.value <= b.limit;
    const a0 = -Math.PI / 2 + i * seg + 0.045;
    const a1 = -Math.PI / 2 + (i + 1) * seg - 0.045;

    // Wedge (annulus segment): outer arc CW, inner arc CCW.
    ctx.beginPath();
    ctx.arc(c.x, c.y, rOuter * pulse, a0, a1);
    ctx.arc(c.x, c.y, rInner, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = safe ? SAFE_FILL : BAD_FILL;
    ctx.fill();
    ctx.strokeStyle = safe ? SAFE_BORDER : BAD_BORDER;
    ctx.lineWidth = 2;
    ctx.stroke();

  }

  // Labels live inside their own wedges, so longer translations cannot collide
  // with the four surrounding decision consoles.
  const labelLayout = getBoundaryLabelLayout(c, state.boundaries);
  labelLayout.forEach((label) => {
    const lineHeight = 10;
    const firstY = label.y - ((label.lines.length - 1) * lineHeight) / 2;
    label.lines.forEach((line, lineIndex) => {
      ctx.font = "800 8.5px 'Inter', system-ui, sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      // A near-opaque dark outline keeps white labels readable on the red wedges (was 0.62, about 3:1).
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(28,30,34,0.92)';
      ctx.strokeText(line, label.x, firstY + lineIndex * lineHeight);
      ctx.fillStyle = '#fff';
      ctx.fillText(line, label.x, firstY + lineIndex * lineHeight);
    });
  });

  // Planet + safe-count in the hub.
  ctx.font = '34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🌍', c.x, c.y - 15);
  const safeCount = state.boundaries.filter((b) => b.value <= b.limit).length;
  // The word was hardcoded English at the centre of the hologram in all four languages
  // until 2026-08-06; the count template now comes from i18n like everything else.
  const safeText = state.safeCountTemplate
    ? state.safeCountTemplate.replace('__N__', safeCount)
    : `${safeCount}/9 safe`;
  drawText(ctx, safeText, c.x, c.y + 14, {
    font: "800 13px 'Inter', system-ui, sans-serif",
    color: '#1B5E20', align: 'center', baseline: 'middle',
  });
  // Keep the safe-space caption in the hub instead of overlapping Materials below.
  const caption = state.safeSpaceLabel || 'Safe operating space';
  ctx.font = "bold 8.5px 'Inter', system-ui, sans-serif";
  const capW = Math.min(106, ctx.measureText(caption).width + 14);
  drawRoundedRect(ctx, c.x - capW / 2, c.y + 30, capW, 16, 8,
    'rgba(38,66,103,0.90)', 'transparent');
  drawText(ctx, caption, c.x, c.y + 38, {
    font: "bold 8.5px 'Inter', system-ui, sans-serif",
    color: '#fff', align: 'center', baseline: 'middle',
  });
}

// ─── Consumption consoles ────────────────────────────────
export function renderConsoles(ctx, state) {
  if (!state.consoles) return;

  const labelFont = "800 8px 'Inter', system-ui, sans-serif";
  ctx.font = labelFont;
  const labelWidth = Math.max(TS + 6,
    ...state.consoles.map(con => ctx.measureText(con.label || con.key).width + 12));

  for (const con of state.consoles) {
    const tile = con.tiles[0];
    const pad = 6;
    const x = OX + tile.col * TS - pad;
    const y = OY + tile.row * TS - pad;
    const w = TS + pad * 2;
    const h = TS + pad * 2;
    const cx = x + w / 2;

    if (state.facingConsoleKey === con.key && !con.chosen) {
      drawRoundedRect(ctx, x - 3, y - 3, w + 6, h + 6, 13, 'rgba(255,255,255,0.18)', '#ffffff');
    }

    drawRoundedRect(ctx, x, y, w, h, 10,
      con.chosen ? 'rgba(63,127,174,0.5)' : 'rgba(63,127,174,0.95)', '#2c5f86');

    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(con.emoji, cx, y + h / 2 - 2);

    if (con.chosen) {
      drawText(ctx, '•', x + w - 8, y + 10, {
        font: "bold 18px 'Inter', system-ui, sans-serif",
        color: '#426b91', align: 'center', baseline: 'middle',
      });
    }

    // Widen the nameplate horizontally without extending into the approach tile below.
    const label = con.label || con.key;
    drawRoundedRect(ctx, cx - labelWidth / 2, y + h - 16, labelWidth, 13, 6, '#16213a', '#2c5f86');
    ctx.font = labelFont;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, y + h - 9.5);
  }
}

// Persistent mission progress. The consoles already gain checkmarks, but the explicit
// fraction tells a child how long the challenge is and which decision they are making.
export function renderDecisionProgress(ctx, state) {
  if (!state.decisionProgressLabel) return;
  const label = state.decisionProgressLabel;
  ctx.font = "bold 12px 'Inter', system-ui, sans-serif";
  const width = ctx.measureText(label).width + 22;
  drawRoundedRect(ctx, CANVAS_W / 2 - width / 2, 10, width, 24, 12,
    'rgba(22,33,58,0.94)', '#4ba8bf');
  drawText(ctx, label, CANVAS_W / 2, 22, {
    font: "bold 12px 'Inter', system-ui, sans-serif",
    color: '#dff0fa', align: 'center', baseline: 'middle',
  });
}

// ─── Choice modal (2 options, ←/→ select + ENTER) ────────
export function renderChoiceModal(ctx, state) {
  if (!state.choice) return;
  const con = state.consoles.find((c) => c.key === state.choice.consoleKey);
  if (!con) return;

  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const cardW = 760, padX = 24;
  const cardX = CANVAS_W / 2 - cardW / 2;

  // Measure descriptions. The «Affects» line is NOT on the card any
  // more — it gave a hint before the answer (and was the same on both sides in 3 of 4
  // consoles). It now comes AFTER the answer, in the feedback (renderChoiceFeedback).
  ctx.font = "15px 'Inter', system-ui, sans-serif";
  const colW = (cardW - padX * 2 - 20) / 2;
  const optLines = con.options.map((option) => wrapText(ctx, option.desc, colW - 30));
  const maxDescriptionLines = Math.max(...optLines.map((lines) => lines.length));
  const optBoxH = 62 + maxDescriptionLines * 20;
  const cardH = 76 + optBoxH + 54;
  const cardY = CANVAS_H / 2 - cardH / 2;

  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 20, '#FFF8E1', '#5D4037');
  drawRoundedRect(ctx, cardX + 8, cardY + 8, cardW - 16, 52, 14, '#4F8D2D', 'transparent');

  // Question.
  drawText(ctx, `${con.emoji}  ${con.prompt}`, CANVAS_W / 2, cardY + 34, {
    font: "800 20px 'Fredoka', 'Inter', system-ui, sans-serif",
    color: '#fff', align: 'center', baseline: 'middle',
  });

  // Two option boxes.
  const boxY = cardY + 72;
  con.options.forEach((o, i) => {
    const bx = cardX + padX + i * (colW + 20);
    const selected = state.choice.sel === i;
    drawRoundedRect(ctx, bx, boxY, colW, optBoxH, 16,
      selected ? '#E7F1FF' : '#FFFDF7', selected ? '#2F6FBE' : '#B89B7A');
    if (selected) {
      ctx.lineWidth = 4;
      drawRoundedRect(ctx, bx + 3, boxY + 3, colW - 6, optBoxH - 6, 13,
        'transparent', '#2F6FBE');
      ctx.lineWidth = 1;
    }

    const letter = i === 0 ? 'A' : 'B';
    const optionLabel = (state.optionLabelTemplate || 'Option __L__').replace('__L__', letter);
    drawText(ctx, `${i === 0 ? '←' : '→'}  ${optionLabel}`, bx + 16, boxY + 23, {
      font: "800 14px 'Inter', system-ui, sans-serif",
      color: selected ? '#174F91' : '#5D4037', align: 'left', baseline: 'middle',
    });
    if (selected) {
      const selectedLabel = `◆ ${state.selectedLabel || 'SELECTED'}`;
      ctx.font = "800 10px 'Inter', system-ui, sans-serif";
      const badgeWidth = ctx.measureText(selectedLabel).width + 18;
      drawRoundedRect(ctx, bx + colW - badgeWidth - 12, boxY + 11, badgeWidth, 24, 12,
        '#2F6FBE', 'transparent');
      drawText(ctx, selectedLabel, bx + colW - badgeWidth / 2 - 12, boxY + 23, {
        font: "800 10px 'Inter', system-ui, sans-serif",
        color: '#fff', align: 'center', baseline: 'middle',
      });
    }

    let ly = boxY + 55;
    for (const ln of optLines[i]) {
      drawText(ctx, ln, bx + 14, ly, {
        font: "15px 'Inter', system-ui, sans-serif",
        color: '#4E342E', align: 'left', baseline: 'middle',
      });
      ly += 20;
    }
  });

  // Hint. After a confirm with nothing picked, the same strip says so
  // («choose first with ← or →») in a warning tone until an option is picked.
  const needsPick = !!state.choice.needsPick;
  drawRoundedRect(ctx, cardX + 90, cardY + cardH - 42, cardW - 180, 28, 14,
    needsPick ? '#FFE0B2' : '#F3E4C7', needsPick ? '#E65100' : 'transparent');
  drawText(ctx, needsPick ? (state.chooseFirst || '← / →') : (state.chooseHint || '← / →  ·  ↵'),
    CANVAS_W / 2, cardY + cardH - 28, {
      font: "bold 13px 'Inter', system-ui, sans-serif",
      color: needsPick ? '#BF360C' : '#5D4037', align: 'center', baseline: 'middle',
    });
}

export function renderChoiceFeedback(ctx, state) {
  const feedback = state.choiceFeedback;
  if (!feedback?.text || feedback.timer <= 0) return;

  const theme = {
    improved: { fill: '#E5F4DD', border: '#4F8D2D', text: '#2E6B2F', emoji: '🌱' },
    unchanged: { fill: '#E8F2FA', border: '#39759E', text: '#245A7C', emoji: '🔎' },
    caution: { fill: '#FFF0CC', border: '#D28A1C', text: '#7A4D00', emoji: '⚠️' },
  }[feedback.tone] || { fill: '#E8F2FA', border: '#39759E', text: '#245A7C', emoji: '🔎' };

  // Under the headline, the game-model lines «In the game, improved: …» /
  // «In the game, got worse: …» (the old «Affects», now after the answer, split by direction).
  const head = `${theme.emoji} ${feedback.text}`;
  const lines = (feedback.effectLines || []).filter(Boolean);
  const headFont = "800 16px 'Fredoka', 'Inter', system-ui, sans-serif";
  const lineFont = "700 14px 'Inter', system-ui, sans-serif";
  ctx.save();
  ctx.font = headFont;
  let textW = ctx.measureText(head).width;
  ctx.font = lineFont;
  for (const l of lines) textW = Math.max(textW, ctx.measureText(l).width);
  const width = Math.min(CANVAS_W - 120, textW + 76);
  const height = 44 + lines.length * 22;
  const x = CANVAS_W / 2 - width / 2;
  const y = 18;
  const alpha = feedback.timer < 0.3 ? feedback.timer / 0.3 : 1;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  // On phone landscape the toast grows from its top centre so 14 px lines read ≥ 12 CSS px.
  const u = Math.min(readableUnit(canvasCssScale(ctx.canvas), 14, 12), (CANVAS_W - 40) / width, (CANVAS_H - 40) / height);
  ctx.translate(CANVAS_W / 2, y);
  ctx.scale(u, u);
  ctx.translate(-CANVAS_W / 2, -y);
  drawRoundedRect(ctx, x, y, width, height, 20, theme.fill, theme.border);
  drawText(ctx, head, CANVAS_W / 2, y + 22, {
    font: headFont, color: theme.text, align: 'center', baseline: 'middle',
  });
  lines.forEach((l, i) => {
    drawText(ctx, l, CANVAS_W / 2, y + 44 + i * 22 + 2, {
      font: lineFont, color: theme.text, align: 'center', baseline: 'middle',
    });
  });
  ctx.restore();
}
