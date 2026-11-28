import { describe, expect, it } from 'vitest';
import { OX, OY } from './gameRoomRenderer.js';
import { TILE_SIZE as TS } from './gameRoomLogic.js';
import {
  getCircularCommunityGeometry,
  getCircularCollectionDepotGeometry,
  getCircularHubKioskGeometry,
  updateCircularResidents,
} from './circularCityRenderer.js';

describe('Circular City neighborhood kiosks', () => {
  it('keeps the sign inside an equal-size kiosk instead of floating below it', () => {
    const repair = getCircularHubKioskGeometry({ col: 3, row: 2 });
    const recycle = getCircularHubKioskGeometry({ col: 9, row: 2 });

    expect(repair.body).toEqual({
      x: OX + 3 * TS - 20,
      y: OY + 2 * TS - 22,
      width: 72,
      height: 66,
    });
    expect(recycle.body.width).toBe(repair.body.width);
    expect(recycle.body.height).toBe(repair.body.height);
    expect(repair.sign.x).toBeGreaterThanOrEqual(repair.body.x);
    expect(repair.sign.y).toBeGreaterThanOrEqual(repair.body.y);
    expect(repair.sign.x + repair.sign.width).toBeLessThanOrEqual(repair.body.x + repair.body.width);
    expect(repair.sign.y + repair.sign.height).toBeLessThanOrEqual(repair.body.y + repair.body.height);
  });
});

describe('Circular City collection depot', () => {
  it('places all eight resource slots inside one shared shelf', () => {
    const resourceSlots = Array.from({ length: 8 }, (_, index) => ({ col: 6 + index, row: 11 }));
    const depot = getCircularCollectionDepotGeometry(resourceSlots);

    expect(depot.body).toEqual({
      x: OX + 6 * TS - 6,
      y: OY + 11 * TS - 13,
      width: 268,
      height: 58,
    });
    expect(depot.slots).toHaveLength(8);
    depot.slots.forEach((slot) => {
      expect(slot.x).toBeGreaterThan(depot.body.x);
      expect(slot.x).toBeLessThan(depot.body.x + depot.body.width);
      expect(slot.y).toBeGreaterThan(depot.body.y);
      expect(slot.y).toBeLessThan(depot.body.y + depot.body.height);
    });
    expect(depot.header.y + depot.header.height).toBeLessThanOrEqual(depot.body.y + 2);
  });
});

describe('Circular City community loop', () => {
  it('replaces the ghost house with a labelled circular plaza', () => {
    const plaza = getCircularCommunityGeometry({ col: 9, row: 6 });

    expect(plaza.center).toEqual({ x: OX + 9 * TS + TS / 2, y: OY + 6 * TS + TS / 2 });
    expect(plaza.outerRadius).toBe(48);
    expect(plaza.label.y).toBeGreaterThan(plaza.center.y);
    expect(plaza.label.width).toBeLessThan(plaza.outerRadius * 2);
  });

  it('keeps ambient residents inside their own walking lanes', () => {
    const state = {
      residents: [{ x: 5, minCol: 5, maxCol: 6, speed: 1, direction: 1 }],
    };

    updateCircularResidents(state, 0.5);
    expect(state.residents[0].x).toBe(5.5);
    updateCircularResidents(state, 1);
    expect(state.residents[0]).toMatchObject({ x: 6, direction: -1 });
  });
});
