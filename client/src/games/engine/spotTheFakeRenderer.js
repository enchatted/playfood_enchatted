// Canvas-only supermarket art for G2.3 Spot the Fake. Inspection, progress and
// feedback deliberately belong to the DOM HUD/case file, not this renderer.

import {
  OX, OY, ROOM_ZOOM, roomToCanvas, drawNPCSprite, NPC_PALETTES,
} from './gameRoomRenderer.js';
import { TILE_SIZE as TS } from './gameRoomLogic.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { drawRoundedRect, drawText } from '../../utils/canvas.js';

const FLOOR_CLUE_SYMBOL = '⌕';

const PACKAGE_SHAPES = {
  soda: 'can',
  choc: 'bar',
  cookies: 'bag',
  yoghurt: 'tub',
  oil: 'bottle',
  oats: 'box',
  bread: 'loaf',
};

const SHELF_PRODUCT_KINDS = {
  soda: 'drink',
  choc: 'chocolate',
  cookies: 'cookie',
  yoghurt: 'yoghurt-cup',
  oil: 'oil-bottle',
  oats: 'oats-bowl',
  bread: 'bread-loaf',
};

export function packageShapeForProduct(product) {
  return PACKAGE_SHAPES[product?.id] || 'box';
}

export function shelfProductKind(product) {
  return SHELF_PRODUCT_KINDS[product?.id] || 'product';
}

export function productJudgementSymbol(product) {
  if (!product?.judged) return null;
  return product.correct ? '✓' : '!';
}

const PACKAGE_DIMENSIONS = {
  can: { width: 54, height: 82 },
  bar: { width: 84, height: 52 },
  bag: { width: 68, height: 78 },
  tub: { width: 76, height: 62 },
  bottle: { width: 52, height: 88 },
  box: { width: 70, height: 82 },
  loaf: { width: 82, height: 60 },
};

export function packageDimensionsForShape(shape) {
  return PACKAGE_DIMENSIONS[shape] || PACKAGE_DIMENSIONS.box;
}

export function shelfBaselineForSlot(tile) {
  return OY + tile.row * TS + TS / 2 + 44;
}

function packageCenterX(tile) {
  return tile.area === 'left'
    ? OX + (tile.col - 1) * TS
    : tile.area === 'right'
      ? OX + (tile.col + 2) * TS
      : OX + tile.col * TS + TS / 2;
}

export function packageArtLayout(product) {
  const shape = product?.packageShape || packageShapeForProduct(product);
  const tile = product?.tile || { col: 0, row: 0 };
  const { width, height } = packageDimensionsForShape(shape);
  const centerX = packageCenterX(tile);
  const x = centerX - width / 2;
  const y = shelfBaselineForSlot(tile) - height;

  return {
    x,
    y,
    width,
    height,
  };
}

export function productFacingLayouts(product) {
  const tile = product?.tile || { col: 0, row: 0 };
  const width = 26;
  const height = 26;
  const gap = 6;
  const groupWidth = width * 3 + gap * 2;
  const startX = packageCenterX(tile) - groupWidth / 2;
  const baseline = shelfBaselineForSlot(tile);
  const rowGap = 8;
  const rowCount = 3;

  return Array.from({ length: rowCount }, (_, rowIndex) => (
    Array.from({ length: 3 }, (__, columnIndex) => ({
      x: startX + columnIndex * (width + gap),
      y: baseline - height - rowIndex * (height + rowGap),
      width,
      height,
      artKind: 'product',
      emoji: product?.emoji || '',
    }))
  )).flat();
}

export function shelfModuleLayout(tile) {
  const baseline = shelfBaselineForSlot(tile);
  const minCol = tile.area === 'right' ? 15 : 1;
  return {
    x: OX + minCol * TS,
    y: baseline - 103,
    width: TS * 4,
    height: 115,
    shelfBaselines: [baseline - 68, baseline - 34, baseline],
  };
}

// ─── Shelf cabinet (drawn behind the products) ───────────
export function renderMarketFixtures(ctx, room) {
  for (const decal of room.floorDecals || []) {
    const cx = OX + decal.col * TS + TS / 2;
    const cy = OY + decal.row * TS + TS / 2;
    ctx.save();
    ctx.globalAlpha = 0.12;
    drawText(ctx, decal.symbol || FLOOR_CLUE_SYMBOL, cx, cy, {
      font: "bold 18px 'Courier New', monospace",
      color: '#2f7454', align: 'center', baseline: 'middle',
    });
    ctx.restore();
  }

  // Cover the COUNTER collision tiles with the same quiet tiled wall used by
  // the room. Collision stays intact, while the visible gaps between modules
  // no longer expose dark counter columns that visually join every shelf.
  for (const area of room.productAreas || []) {
    const x = OX + area.minCol * TS;
    const y = OY + area.minRow * TS;
    const w = (area.maxCol - area.minCol + 1) * TS;
    const h = (area.maxRow - area.minRow + 1) * TS;
    ctx.fillStyle = '#d8d3ca';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(91,78,69,0.16)';
    ctx.lineWidth = 1;
    for (let rowY = y; rowY <= y + h; rowY += TS) {
      ctx.beginPath();
      ctx.moveTo(x, rowY);
      ctx.lineTo(x + w, rowY);
      ctx.stroke();
    }
    for (let colX = x; colX <= x + w; colX += TS) {
      ctx.beginPath();
      ctx.moveTo(colX, y);
      ctx.lineTo(colX, y + h);
      ctx.stroke();
    }
  }

  for (const slot of room.productSlots || []) {
    const module = shelfModuleLayout(slot);
    const { x, y, width: w, height: h } = module;

    // Each choice owns a separate supermarket shelf module. The wall remains
    // visible between modules, so the six choices never merge into two towers.
    drawRoundedRect(ctx, x + 5, y + 6, w - 7, h - 1, 3, 'rgba(55,42,35,0.22)', null);
    drawRoundedRect(ctx, x, y, w, h - 5, 3, '#eee9dc', '#705247');

    const backing = ctx.createLinearGradient(x, y, x + w, y);
    backing.addColorStop(0, '#e5dfd2');
    backing.addColorStop(0.5, '#faf7ee');
    backing.addColorStop(1, '#ded7ca');
    ctx.fillStyle = backing;
    ctx.fillRect(x + 7, y + 7, w - 14, h - 18);

    // A quiet perforated backing gives depth while the products stay dominant.
    ctx.fillStyle = 'rgba(112,82,71,0.18)';
    for (let py = y + 14; py < y + h - 15; py += 14) {
      for (let px = x + 18; px < x + w - 12; px += 16) {
        ctx.fillRect(px, py, 1.5, 1.5);
      }
    }

    ctx.fillStyle = '#3f8d63';
    ctx.fillRect(x + 5, y + 3, w - 10, 7);
    ctx.fillStyle = '#d8eee0';
    ctx.fillRect(x + 8, y + 5, w - 16, 2);

    module.shelfBaselines.forEach((shelfY) => {
      ctx.fillStyle = 'rgba(55,42,35,0.18)';
      ctx.fillRect(x + 7, shelfY + 8, w - 14, 4);
      ctx.fillStyle = '#a8a29a';
      ctx.fillRect(x + 4, shelfY, w - 8, 8);
      ctx.fillStyle = '#f6f1e7';
      ctx.fillRect(x + 6, shelfY, w - 12, 3);
      ctx.fillStyle = '#d9b863';
      ctx.fillRect(x + 9, shelfY + 4, w - 18, 3);

      // One restrained ticket per physical shelf: it reads as retail furniture
      // without adding more text to the compact canvas.
      ctx.fillStyle = '#fffdf7';
      ctx.fillRect(x + w / 2 - 15, shelfY + 3, 30, 7);
      ctx.strokeStyle = '#8a7a6e';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + w / 2 - 15, shelfY + 3, 30, 7);
      ctx.fillStyle = '#6f655e';
      ctx.fillRect(x + w / 2 - 9, shelfY + 6, 12, 1);
      ctx.fillRect(x + w / 2 + 6, shelfY + 6, 4, 1);
    });

    // Short module posts stop at the gap; no continuous joined cabinet.
    ctx.fillStyle = '#78736d';
    ctx.fillRect(x + 2, y + 3, 5, h - 11);
    ctx.fillRect(x + w - 7, y + 3, 5, h - 11);
    ctx.fillStyle = '#b9b2a8';
    ctx.fillRect(x + 4, y + 6, 1.5, h - 17);
    ctx.fillRect(x + w - 5.5, y + 6, 1.5, h - 17);
    ctx.fillStyle = '#6f6860';
    ctx.fillRect(x + 5, y + h - 12, w - 10, 7);
  }
}

export function shopperCartOffset(dir) {
  if (dir === 1) return { x: 0, y: -30 };
  if (dir === 2) return { x: -32, y: 9 };
  if (dir === 3) return { x: 32, y: 9 };
  return { x: 0, y: 24 };
}

export function createSpotTheFakeShoppers(paths = []) {
  const speeds = [64, 58, 55, 61, 52, 56];
  const cartColors = ['#ef8a35', '#4e91c9', '#70a85b', '#a96cc3', '#d8a239', '#4ca6a8'];
  return paths.map((path, index) => {
    const first = path.points[0];
    const second = path.points[1] || first;
    const dx = second.col - first.col;
    const dy = second.row - first.row;
    const initialDir = Math.abs(dx) >= Math.abs(dy)
      ? (dx >= 0 ? 3 : 2)
      : (dy >= 0 ? 0 : 1);
    const hasCart = path.hasCart ?? true;
    return {
      id: path.id,
      points: path.points,
      x: first.col * TS,
      y: first.row * TS,
      targetIndex: 1,
      speed: speeds[index % speeds.length],
      isReading: false,
      readTimer: 0,
      dir: initialDir,
      hasCart,
      hasBasket: !hasCart,
      cartColor: cartColors[index % cartColors.length],
      palette: NPC_PALETTES[(index + 2) % NPC_PALETTES.length],
    };
  });
}

function renderShopperBasket(ctx, shopper) {
  if (!shopper.hasBasket) return;
  const offset = shopperCartOffset(shopper.dir);
  const cx = OX + shopper.x + TS / 2 + offset.x * 0.55;
  const cy = OY + shopper.y + TS / 2 + offset.y * 0.55;
  ctx.save();
  ctx.strokeStyle = '#714b2f';
  ctx.fillStyle = '#d99a45';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, cx - 8, cy - 3, 16, 10, 2, '#d99a45', '#714b2f');
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 7, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,245,214,0.72)';
  ctx.fillRect(cx - 5, cy + 1, 10, 1.5);
  ctx.restore();
}

function renderShopperCart(ctx, shopper) {
  if (!shopper.hasCart) return;
  const offset = shopperCartOffset(shopper.dir);
  const cx = OX + shopper.x + TS / 2 + offset.x;
  const cy = OY + shopper.y + TS / 2 + offset.y;
  const motionBob = shopper.isReading ? 0 : Math.sin((shopper.x + shopper.y) * 0.06) * 0.7;
  const y = cy + motionBob;

  ctx.save();
  ctx.fillStyle = 'rgba(45,32,26,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx, y + 11, 15, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shopper.cartColor || '#ef8a35';
  ctx.strokeStyle = '#51453f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 13, y - 7);
  ctx.lineTo(cx + 12, y - 7);
  ctx.lineTo(cx + 9, y + 6);
  ctx.lineTo(cx - 10, y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  for (let gx = cx - 7; gx <= cx + 7; gx += 7) {
    ctx.beginPath();
    ctx.moveTo(gx, y - 5);
    ctx.lineTo(gx, y + 4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - 10, y - 1);
  ctx.lineTo(cx + 10, y - 1);
  ctx.stroke();

  const direction = shopper.dir === 0
    ? { x: 0, y: -1 }
    : shopper.dir === 1
      ? { x: 0, y: 1 }
      : shopper.dir === 2 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  ctx.strokeStyle = '#51453f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + direction.x * 10, y + direction.y * 7);
  ctx.lineTo(cx + direction.x * 17, y + direction.y * 14);
  ctx.stroke();

  ctx.fillStyle = '#2f2b29';
  ctx.beginPath();
  ctx.arc(cx - 8, y + 9, 2.3, 0, Math.PI * 2);
  ctx.arc(cx + 8, y + 9, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function updateSpotTheFakeShoppers(shoppers = [], dt) {
  for (const shopper of shoppers) {
    if (shopper.isReading) {
      shopper.readTimer = Math.max(0, shopper.readTimer - dt);
      if (shopper.readTimer === 0) shopper.isReading = false;
      continue;
    }

    const target = shopper.points[shopper.targetIndex];
    if (!target) continue;
    const targetX = target.col * TS;
    const targetY = target.row * TS;
    const dx = targetX - shopper.x;
    const dy = targetY - shopper.y;
    const distance = Math.hypot(dx, dy);
    const travel = shopper.speed * dt;

    if (distance <= travel) {
      shopper.x = targetX;
      shopper.y = targetY;
      shopper.targetIndex = (shopper.targetIndex + 1) % shopper.points.length;
      shopper.isReading = true;
      shopper.readTimer = 0.75;
      continue;
    }

    shopper.x += (dx / distance) * travel;
    shopper.y += (dy / distance) * travel;
    if (Math.abs(dx) >= Math.abs(dy)) shopper.dir = dx > 0 ? 3 : 2;
    else shopper.dir = dy > 0 ? 0 : 1;
  }
}

export function guideHintBubbleLayout(ctx, text) {
  const width = 224;
  const paddingX = 10;
  const paddingY = 8;
  const lineHeight = 12;
  const textMaxWidth = width - paddingX * 2;
  const lines = wrappedLines(ctx, text, textMaxWidth);
  const height = Math.max(36, lines.length * lineHeight + paddingY * 2);

  return {
    width,
    height,
    paddingX,
    paddingY,
    lineHeight,
    textMaxWidth,
    lines,
  };
}

export function renderSpotTheFakePeople(ctx, state, room, labels = {}) {
  const guide = room.labelGuide;
  if (guide) {
    const gx = OX + guide.col * TS;
    const gy = OY + guide.row * TS;
    const guidePalette = {
      shirt: '#3f9b6d', shirtHi: '#83c594', hair: '#5d4037',
      cap: '#2d7f7a', capDk: '#185a57',
    };
    drawNPCSprite(ctx, gx, gy, guidePalette, 0, 0, state.time);

    const name = labels.guideName || '';
    if (name) {
      ctx.font = "bold 9px 'Inter', system-ui, sans-serif";
      const width = Math.max(96, ctx.measureText(name).width + 18);
      drawRoundedRect(ctx, gx + 16 - width / 2, gy - 18, width, 18, 8, '#fff4d8', '#3f7656');
      drawText(ctx, name, gx + 16, gy - 9, {
        font: "bold 9px 'Inter', system-ui, sans-serif",
        color: '#2f5f45', align: 'center', baseline: 'middle',
      });
    }

  }

  for (const shopper of state.ambientShoppers || []) {
    const walkFrame = shopper.isReading ? 0 : Math.floor(state.time * 5) % 2;
    renderShopperCart(ctx, shopper);
    renderShopperBasket(ctx, shopper);
    drawNPCSprite(
      ctx,
      OX + shopper.x,
      OY + shopper.y,
      shopper.palette,
      shopper.dir,
      walkFrame,
      state.time,
    );
    if (shopper.isReading) {
      drawText(ctx, '🔍', OX + shopper.x + 25, OY + shopper.y + 12, {
        font: '12px sans-serif', align: 'center', baseline: 'middle',
      });
    }
  }
}

export function renderSpotTheFakeGuideHint(ctx, state, room, labels = {}) {
  const guide = room.labelGuide;
  if (!guide || !state.nearLabelGuide || !labels.guideHint) return;

  const gx = OX + guide.col * TS;
  const gy = OY + guide.row * TS;
  ctx.font = "bold 9px 'Inter', system-ui, sans-serif";
  const bubble = guideHintBubbleLayout(ctx, labels.guideHint);
  const bubbleX = gx + 16 - bubble.width / 2;
  const bubbleY = gy + 37;

  drawRoundedRect(ctx, bubbleX, bubbleY, bubble.width, bubble.height, 9, '#fffaf0', '#3f7656');
  bubble.lines.forEach((line, index) => {
    drawText(ctx, line, gx + 16, bubbleY + bubble.paddingY + bubble.lineHeight * (index + 0.5), {
      font: "bold 9px 'Inter', system-ui, sans-serif",
      color: '#2f5f45', align: 'center', baseline: 'middle',
    });
  });
}

function drawShelfProductSprite(ctx, product, x, y, w, h) {
  const kind = shelfProductKind(product);
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';

  if (kind === 'drink') {
    ctx.strokeStyle = '#7e2f2b';
    drawRoundedRect(ctx, x + 5, y + 5, w - 10, h - 6, 3, '#e65b4f', '#7e2f2b');
    ctx.fillStyle = '#f8eee0';
    ctx.fillRect(x + 5, y + 7, w - 10, 3);
    ctx.strokeStyle = '#3d8065';
    ctx.beginPath();
    ctx.moveTo(cx + 3, y + 5);
    ctx.lineTo(cx + 7, y - 1);
    ctx.stroke();
  } else if (kind === 'chocolate') {
    drawRoundedRect(ctx, x + 2, y + 6, w - 4, h - 10, 2, '#8b4e2f', '#4d2b22');
    ctx.strokeStyle = '#d49a67';
    ctx.lineWidth = 1;
    for (let col = 1; col < 3; col += 1) {
      ctx.beginPath();
      ctx.moveTo(x + 2 + ((w - 4) * col) / 3, y + 7);
      ctx.lineTo(x + 2 + ((w - 4) * col) / 3, y + h - 5);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x + 3, cy + 2);
    ctx.lineTo(x + w - 3, cy + 2);
    ctx.stroke();
  } else if (kind === 'cookie') {
    ctx.fillStyle = '#dca75d';
    ctx.strokeStyle = '#88552f';
    ctx.beginPath();
    ctx.arc(cx, cy + 1, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#68412d';
    [[-4, -3], [4, -4], [1, 2], [-5, 5], [5, 5]].forEach(([dx, dy]) => {
      ctx.fillRect(cx + dx - 1, cy + dy, 2.5, 2.5);
    });
  } else if (kind === 'yoghurt-cup') {
    ctx.fillStyle = '#f8f2e7';
    ctx.strokeStyle = '#7f766f';
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 7);
    ctx.lineTo(x + w - 5, y + 7);
    ctx.lineTo(x + w - 8, y + h - 3);
    ctx.lineTo(x + 8, y + h - 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f3d6d7';
    ctx.fillRect(x + 7, y + 13, w - 14, 7);
    ctx.fillStyle = '#e9514e';
    ctx.beginPath();
    ctx.moveTo(cx - 4, y + 14);
    ctx.quadraticCurveTo(cx, y + 11, cx + 4, y + 14);
    ctx.quadraticCurveTo(cx + 2, y + 19, cx, y + 21);
    ctx.quadraticCurveTo(cx - 2, y + 19, cx - 4, y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4f974b';
    ctx.fillRect(cx - 2, y + 11, 4, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 3, y + 5, w - 6, 4);
    ctx.strokeStyle = '#7f766f';
    ctx.strokeRect(x + 3, y + 5, w - 6, 4);
  } else if (kind === 'oil-bottle') {
    ctx.fillStyle = '#2f8060';
    ctx.strokeStyle = '#245443';
    drawRoundedRect(ctx, x + 6, y + 5, w - 12, h - 6, 4, '#4a9b70', '#245443');
    ctx.fillStyle = '#e6bd4f';
    ctx.fillRect(cx - 4, y + 10, 8, h - 15);
    ctx.fillStyle = '#315447';
    ctx.fillRect(cx - 4, y + 1, 8, 5);
  } else if (kind === 'oats-bowl') {
    ctx.fillStyle = '#ead8a4';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 2, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c9fc4';
    ctx.strokeStyle = '#2f6587';
    ctx.beginPath();
    ctx.moveTo(x + 3, cy);
    ctx.quadraticCurveTo(cx, y + h + 1, x + w - 3, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'bread-loaf') {
    drawRoundedRect(ctx, x + 2, y + 5, w - 4, h - 8, 8, '#e7af5f', '#8f5c32');
    ctx.strokeStyle = '#fff0bd';
    ctx.lineWidth = 2;
    [-4, 2, 8].forEach((dx) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx - 2, y + 8);
      ctx.lineTo(cx + dx + 1, y + 13);
      ctx.stroke();
    });
  }
}

export function renderShelfProducts(ctx, state, room) {
  if (!state.products) return;

  for (const p of state.products) {
    const facings = productFacingLayouts(p);
    const first = facings[0];
    const last = facings.at(-1);
    const group = {
      x: first.x,
      y: Math.min(...facings.map(({ y }) => y)),
      width: last.x + last.width - first.x,
      height: Math.max(...facings.map(({ y, height }) => y + height))
        - Math.min(...facings.map(({ y }) => y)),
    };
    const cx = group.x + group.width / 2;
    const cy = group.y + group.height / 2;

    // Highlight the product the player currently faces (not yet judged).
    if (state.facingProductId === p.id && !p.judged) {
      const pulse = 0.5 + Math.sin(state.time * 6) * 0.5;
      drawRoundedRect(ctx, group.x - 5, group.y - 5, group.width + 10, group.height + 10, 8,
        `rgba(255,213,79,${0.35 + pulse * 0.45})`, '#ffd54f');
    }

    facings.forEach(({ x, y, width: w, height: h }) => {
      ctx.save();
      ctx.globalAlpha = p.judged ? 0.5 : 1;
      ctx.fillStyle = 'rgba(55,42,35,0.18)';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h - 1, w * 0.38, 2.3, 0, 0, Math.PI * 2);
      ctx.fill();
      drawShelfProductSprite(ctx, p, x, y, w, h);
      ctx.restore();
    });

    // Language-neutral judged stamp: ✓ for a correct decision, ! for a miss.
    if (p.judged) {
      const stamp = productJudgementSymbol(p);
      const stampColor = p.correct ? '#1b5e20' : '#9b3f24';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.16);
      drawRoundedRect(ctx, -13, -13, 26, 26, 13, 'rgba(255,242,201,0.94)', stampColor);
      drawText(ctx, stamp, 0, 0, {
        font: "bold 18px 'Courier New', monospace",
        color: stampColor, align: 'center', baseline: 'middle',
      });
      ctx.restore();
    }

    const topLeft = roomToCanvas(room, group.x - 6, group.y - 6);
    p.pointerRect = {
      x: topLeft.x,
      y: topLeft.y,
      width: (group.width + 12) * ROOM_ZOOM,
      height: (group.height + 12) * ROOM_ZOOM,
    };
  }
}

function wrappedLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function syncIntroCtaRect(ctx, state) {
  const intro = state.missionIntro;
  if (!state.showMissionIntro || !intro) {
    state.introCtaRect = null;
    return;
  }
  const panelW = 700;
  const pad = 32;
  const innerW = panelW - pad * 2;
  ctx.font = "15px 'Inter', system-ui, sans-serif";
  const stepLines = intro.steps.map((step, index) => (
    wrappedLines(ctx, `${index + 1}.  ${step}`, innerW)
  ));
  const stepLineCount = stepLines.reduce((count, lines) => count + lines.length, 0);
  let factLines = [];
  if (intro.introFact) {
    ctx.font = intro.introFact.paraphrase
      ? "13px 'Inter', system-ui, sans-serif"
      : "italic 13px 'Inter', system-ui, sans-serif";
    factLines = wrappedLines(
      ctx,
      intro.introFact.paraphrase ? intro.introFact.quote : `“${intro.introFact.quote}”`,
      innerW - 12,
    );
  }
  const stepsH = stepLineCount * 26 + stepLines.length * 4 + 6;
  const factH = intro.introFact ? factLines.length * 22 + 28 : 0;
  const panelH = 48 + stepsH + factH + 46 + 24 + pad;
  const panelY = Math.round(CANVAS_H / 2 - panelH / 2);
  let ctaY = panelY + 48 + 6 + stepLineCount * 26 + stepLines.length * 4;
  if (intro.introFact) ctaY += 6 + factLines.length * 22 + 18;
  ctaY += 10 + 40;
  state.introCtaRect = {
    x: CANVAS_W / 2 - 160,
    y: ctaY - 18,
    width: 320,
    height: 36,
  };
}

function syncRevealCtaRect(ctx, state) {
  if (!state.reveal) {
    state.revealCtaRect = null;
    return;
  }
  const { quote, lead, scope, paraphrase } = state.reveal;
  const cardW = 600;
  const padX = 28;
  ctx.font = "600 14px 'Inter', system-ui, sans-serif";
  const leadLines = lead ? wrappedLines(ctx, lead, cardW - padX * 2) : [];
  const leadH = leadLines.length ? leadLines.length * 20 + 10 : 0;
  ctx.font = paraphrase
    ? "18px 'Inter', system-ui, sans-serif"
    : "italic 18px 'Inter', system-ui, sans-serif";
  const body = paraphrase ? quote : `“${quote}”`;
  const bodyLines = wrappedLines(ctx, body, cardW - padX * 2);
  const cardH = 56 + (scope === 'general' ? 22 : 0) + leadH + bodyLines.length * 26 + 78;
  const cardX = CANVAS_W / 2 - cardW / 2;
  const cardY = CANVAS_H / 2 - cardH / 2;
  const footY = cardY + cardH - 34;
  const label = `${state.revealDismiss || ''}  ↵`;
  ctx.font = "bold 13px 'Inter', system-ui, sans-serif";
  const width = ctx.measureText(label).width + 32;
  state.revealCtaRect = {
    x: cardX + cardW - padX - width,
    y: footY - 10,
    width,
    height: 28,
  };
}

export function syncSpotTheFakeOverlayHitRects(ctx, state) {
  syncIntroCtaRect(ctx, state);
  syncRevealCtaRect(ctx, state);
}
