import { describe, expect, it } from 'vitest';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import { PRODUCTS } from '../../data/local.js';
import * as spotRenderer from '../engine/spotTheFakeRenderer.js';

const ROOM = GAME_ROOMS.SpotTheFake;
const ADJACENT_STEPS = [
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
];

function reachableTiles(start) {
  const pending = [start];
  const visited = new Set([`${start.col},${start.row}`]);

  while (pending.length > 0) {
    const current = pending.shift();
    for (const { dc, dr } of ADJACENT_STEPS) {
      const next = { col: current.col + dc, row: current.row + dr };
      const key = `${next.col},${next.row}`;
      if (visited.has(key) || !isGameRoomWalkable(ROOM, next.col, next.row)) continue;
      visited.add(key);
      pending.push(next);
    }
  }

  return visited;
}

describe('SpotTheFake supermarket room', () => {
  it('places six unique products in balanced left and right shelf banks', () => {
    expect(ROOM.productSlots).toHaveLength(6);
    expect(new Set(ROOM.productSlots.map(({ col, row }) => `${col},${row}`)).size).toBe(6);

    const areas = Object.groupBy(ROOM.productSlots, (slot) => slot.area);
    expect(Object.keys(areas).sort()).toEqual(['left', 'right']);
    expect(Object.values(areas).map((slots) => slots.length).sort()).toEqual([3, 3]);
    expect(areas.left.map((slot) => slot.row)).toEqual([3, 7, 11]);
    expect(areas.right.map((slot) => slot.row)).toEqual([3, 7, 11]);
    expect(new Set(areas.left.map((slot) => slot.col)).size).toBe(1);
    expect(new Set(areas.right.map((slot) => slot.col)).size).toBe(1);
  });

  it('derives coherent, unique package silhouettes from product identity', () => {
    expect(spotRenderer.packageShapeForProduct).toBeTypeOf('function');
    if (typeof spotRenderer.packageShapeForProduct !== 'function') return;

    const expectedShapes = {
      soda: 'can',
      choc: 'bar',
      cookies: 'bag',
      yoghurt: 'tub',
      oil: 'bottle',
      oats: 'box',
      bread: 'loaf',
    };
    const actualShapes = Object.fromEntries(PRODUCTS.map((product) => [
      product.id,
      spotRenderer.packageShapeForProduct(product),
    ]));

    expect(actualShapes).toEqual(expectedShapes);
    expect(new Set(Object.values(actualShapes)).size).toBe(PRODUCTS.length);
  });

  it('gives package silhouettes recognisable proportions instead of one repeated card size', () => {
    expect(spotRenderer.packageDimensionsForShape).toBeTypeOf('function');
    if (typeof spotRenderer.packageDimensionsForShape !== 'function') return;

    const dimensions = Object.fromEntries(
      ['can', 'bar', 'bag', 'tub', 'bottle', 'box', 'loaf'].map((shape) => [
        shape,
        spotRenderer.packageDimensionsForShape(shape),
      ]),
    );

    expect(new Set(Object.values(dimensions).map(({ width, height }) => `${width}x${height}`)).size)
      .toBeGreaterThanOrEqual(5);
    expect(dimensions.bottle.height).toBeGreaterThan(dimensions.bottle.width);
    expect(dimensions.can.height).toBeGreaterThan(dimensions.can.width);
    expect(dimensions.bar.width).toBeGreaterThan(dimensions.bar.height);
    expect(dimensions.loaf.width).toBeGreaterThan(dimensions.loaf.height);
  });

  it('uses a distinct direct product sprite for every shelf item', () => {
    expect(spotRenderer.shelfProductKind).toBeTypeOf('function');
    if (typeof spotRenderer.shelfProductKind !== 'function') return;

    const expectedKinds = {
      soda: 'drink',
      choc: 'chocolate',
      cookies: 'cookie',
      yoghurt: 'yoghurt-cup',
      oil: 'oil-bottle',
      oats: 'oats-bowl',
      bread: 'bread-loaf',
    };
    const actualKinds = Object.fromEntries(PRODUCTS.map((product) => [
      product.id,
      spotRenderer.shelfProductKind(product),
    ]));

    expect(actualKinds).toEqual(expectedKinds);
    expect(new Set(Object.values(actualKinds)).size).toBe(PRODUCTS.length);
  });

  it('seats every package on the visible shelf baseline without floating', () => {
    expect(spotRenderer.shelfBaselineForSlot).toBeTypeOf('function');
    if (typeof spotRenderer.shelfBaselineForSlot !== 'function') return;

    ROOM.productSlots.forEach((slot, index) => {
      const product = PRODUCTS[index % PRODUCTS.length];
      const art = spotRenderer.packageArtLayout({
        ...product,
        tile: slot,
        packageShape: spotRenderer.packageShapeForProduct(product),
      });

      expect(art.y + art.height).toBeCloseTo(spotRenderer.shelfBaselineForSlot(slot), 5);
    });
  });

  it('stocks every choice with repeated bare products instead of artificial package shells', () => {
    expect(spotRenderer.productFacingLayouts).toBeTypeOf('function');
    if (typeof spotRenderer.productFacingLayouts !== 'function') return;

    ROOM.productSlots.forEach((slot, index) => {
      const product = PRODUCTS[index % PRODUCTS.length];
      const facings = spotRenderer.productFacingLayouts({
        ...product,
        tile: slot,
        packageShape: spotRenderer.packageShapeForProduct(product),
      });

      expect(facings.length).toBeGreaterThanOrEqual(6);
      expect(new Set(facings.map(({ width, height }) => `${width}x${height}`)).size).toBe(1);
      const rows = Object.groupBy(facings, ({ y }) => y);
      expect(Object.keys(rows).length).toBeGreaterThanOrEqual(2);
      expect(Object.keys(rows).length).toBeLessThanOrEqual(4);
      expect(Object.values(rows).every((row) => row.length === 3)).toBe(true);
      for (const facing of facings) {
        expect(facing.width).toBeLessThanOrEqual(32);
        expect(facing).toMatchObject({
          artKind: 'product',
          emoji: product.emoji,
        });
        expect(facing.packageShape).toBeUndefined();
      }
      expect(Math.max(...facings.map(({ y, height }) => y + height))).toBeCloseTo(
        spotRenderer.shelfBaselineForSlot(slot),
        5,
      );
    });
  });

  it('builds one independent three-board shelf module for every product choice', () => {
    expect(spotRenderer.shelfModuleLayout).toBeTypeOf('function');
    if (typeof spotRenderer.shelfModuleLayout !== 'function') return;

    const modules = ROOM.productSlots.map((slot) => spotRenderer.shelfModuleLayout(slot));
    expect(modules).toHaveLength(6);

    for (const module of modules) {
      expect(module.shelfBaselines).toHaveLength(3);
      expect(module.shelfBaselines.every((baseline) => (
        baseline > module.y && baseline < module.y + module.height
      ))).toBe(true);
    }

    for (const areaId of ['left', 'right']) {
      const areaModules = ROOM.productSlots
        .filter(({ area }) => area === areaId)
        .map((slot) => spotRenderer.shelfModuleLayout(slot))
        .sort((a, b) => a.y - b.y);

      areaModules.slice(1).forEach((module, index) => {
        const previous = areaModules[index];
        expect(module.y - (previous.y + previous.height)).toBeGreaterThanOrEqual(12);
      });
    }
  });

  it('leaves a small visible gap between one stocked shelf and the next', () => {
    for (const areaId of ['left', 'right']) {
      const slots = ROOM.productSlots.filter(({ area }) => area === areaId);
      slots.forEach((slot, index) => {
        if (index === 0) return;
        const product = PRODUCTS[index % PRODUCTS.length];
        const facings = spotRenderer.productFacingLayouts({
          ...product,
          tile: slot,
          packageShape: spotRenderer.packageShapeForProduct(product),
        });
        const previousShelf = spotRenderer.shelfBaselineForSlot(slots[index - 1]);
        const stockedTop = Math.min(...facings.map(({ y }) => y));
        expect(stockedTop - previousShelf).toBeGreaterThanOrEqual(12);
      });
    }
  });

  it('uses language-neutral judgement symbols', () => {
    expect(spotRenderer.productJudgementSymbol).toBeTypeOf('function');
    if (typeof spotRenderer.productJudgementSymbol !== 'function') return;

    expect(spotRenderer.productJudgementSymbol({ judged: true, correct: true })).toBe('✓');
    expect(spotRenderer.productJudgementSymbol({ judged: true, correct: false })).toBe('!');
    expect(spotRenderer.productJudgementSymbol({ judged: false, correct: null })).toBeNull();
  });

  it('keeps every package fully seated inside its left or right display bank', () => {
    for (const slot of ROOM.productSlots) {
      const area = ROOM.productAreas.find((candidate) => candidate.id === slot.area);
      const art = spotRenderer.packageArtLayout({ tile: slot, packageShape: 'box' });
      const areaLeft = 320 + area.minCol * 32;
      const areaRight = 320 + (area.maxCol + 1) * 32;

      expect(art.x, `${slot.area} package left edge`).toBeGreaterThanOrEqual(areaLeft);
      expect(art.x + art.width, `${slot.area} package right edge`).toBeLessThanOrEqual(areaRight);
    }
  });

  it('gives every product a walkable adjacent approach reachable from the player start', () => {
    expect(isGameRoomWalkable(ROOM, ROOM.playerStart.col, ROOM.playerStart.row)).toBe(true);
    const reachable = reachableTiles(ROOM.playerStart);

    for (const slot of ROOM.productSlots) {
      expect(slot.approach, `${slot.area} product at ${slot.col},${slot.row}`).toBeDefined();
      expect(
        Math.abs(slot.col - slot.approach.col) + Math.abs(slot.row - slot.approach.row),
      ).toBe(1);
      expect(isGameRoomWalkable(ROOM, slot.approach.col, slot.approach.row)).toBe(true);
      expect(reachable.has(`${slot.approach.col},${slot.approach.row}`)).toBe(true);
    }
  });

  it('keeps the central aisle open instead of blocking it with a decorative machine', () => {
    for (let row = 1; row <= 13; row += 1) {
      for (let col = 5; col <= 14; col += 1) {
        expect(isGameRoomWalkable(ROOM, col, row), `central aisle ${col},${row}`).toBe(true);
      }
    }

    for (const decoration of ROOM.decorations.filter((item) => item.solid)) {
      expect(isGameRoomWalkable(ROOM, decoration.col, decoration.row)).toBe(false);
    }
  });

  it('gives six ambient shoppers safe loops that never cover product approaches', () => {
    expect(ROOM.ambientShopperPaths).toHaveLength(6);
    const approachKeys = new Set(
      ROOM.productSlots.map(({ approach }) => `${approach.col},${approach.row}`),
    );

    for (const path of ROOM.ambientShopperPaths) {
      expect(path.points.length).toBeGreaterThanOrEqual(2);
      for (const point of path.points) {
        expect(isGameRoomWalkable(ROOM, point.col, point.row)).toBe(true);
        expect(approachKeys.has(`${point.col},${point.row}`)).toBe(false);
      }
    }
  });

  it('moves ambient shoppers between shelf stops and pauses to read a label', () => {
    expect(spotRenderer.createSpotTheFakeShoppers).toBeTypeOf('function');
    expect(spotRenderer.updateSpotTheFakeShoppers).toBeTypeOf('function');
    if (typeof spotRenderer.createSpotTheFakeShoppers !== 'function'
      || typeof spotRenderer.updateSpotTheFakeShoppers !== 'function') return;

    const shoppers = spotRenderer.createSpotTheFakeShoppers(ROOM.ambientShopperPaths);
    expect(shoppers.filter((shopper) => shopper.hasCart)).toHaveLength(4);
    expect(shoppers.filter((shopper) => shopper.hasBasket)).toHaveLength(2);
    const first = shoppers[0];
    expect({ x: first.x, y: first.y }).toEqual({ x: 7 * 32, y: 3 * 32 });

    spotRenderer.updateSpotTheFakeShoppers(shoppers, 5);
    expect({ x: first.x, y: first.y }).toEqual({ x: 7 * 32, y: 7 * 32 });
    expect(first.isReading).toBe(true);

    const stoppedAt = { x: first.x, y: first.y };
    spotRenderer.updateSpotTheFakeShoppers(shoppers, 0.5);
    expect({ x: first.x, y: first.y }).toEqual(stoppedAt);
  });

  it('keeps each shopper cart in front of their walking direction', () => {
    expect(spotRenderer.shopperCartOffset).toBeTypeOf('function');
    if (typeof spotRenderer.shopperCartOffset !== 'function') return;

    expect(spotRenderer.shopperCartOffset(0).y).toBeGreaterThanOrEqual(24);
    expect(spotRenderer.shopperCartOffset(1).y).toBeLessThanOrEqual(-30);
    expect(spotRenderer.shopperCartOffset(2).x).toBeLessThanOrEqual(-30);
    expect(spotRenderer.shopperCartOffset(3).x).toBeGreaterThanOrEqual(30);
  });

  it('positions the label guide above the player route without closing the aisle', () => {
    expect(ROOM.labelGuide).toMatchObject({
      nameKey: 'spotthefake.guide_name',
      hintKey: 'spotthefake.guide_hint',
    });
    expect(isGameRoomWalkable(ROOM, ROOM.labelGuide.col, ROOM.labelGuide.row)).toBe(true);
  });

  it('wraps every translated guide hint inside a bubble tall enough for all lines', () => {
    expect(spotRenderer.guideHintBubbleLayout).toBeTypeOf('function');
    if (typeof spotRenderer.guideHintBubbleLayout !== 'function') return;

    const context = {
      measureText: (text) => ({ width: [...String(text)].length * 5 }),
    };
    const hints = [
      'Read the claim first, then check the evidence on the back.',
      'Διάβασε τον ισχυρισμό μπροστά και μετά έλεγξε τα στοιχεία πίσω.',
      'Lees eerst de bewering en controleer daarna het bewijs achterop.',
      'Lê primeiro a alegação e depois verifica as provas no verso.',
    ];

    for (const hint of hints) {
      const layout = spotRenderer.guideHintBubbleLayout(context, hint);
      expect(layout.lines.length, hint).toBeGreaterThan(1);
      expect(layout.lines.every((line) => (
        context.measureText(line).width <= layout.textMaxWidth
      )), hint).toBe(true);
      expect(layout.height).toBeGreaterThanOrEqual(
        layout.lines.length * layout.lineHeight + layout.paddingY * 2,
      );
    }
  });
});
