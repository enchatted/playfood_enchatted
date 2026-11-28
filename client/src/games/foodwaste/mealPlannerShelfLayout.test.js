import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../data/foodwaste.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import { TILE } from '../../overworld/tileAtlas.js';
import {
  OX, OY, ROOM_ROWS, ROOM_COLS, roomToCanvas,
} from '../engine/gameRoomRenderer.js';
import { TILE_SIZE as TS } from '../engine/gameRoomLogic.js';
import { getMealPlannerHudLayout } from '../engine/mealPlannerRenderer.js';
import { layoutMarketItems } from './mealPlannerShelfLayout.js';

const SHELVES = [
  { cat: 'carb', row: 3, cols: [15, 16, 17] },
  { cat: 'protein', row: 5, cols: [15, 16, 17] },
  { cat: 'veg', row: 7, cols: [15, 16, 17] },
  { cat: 'fruit', row: 9, cols: [15, 16, 17] },
  { cat: 'extra', row: 11, cols: [15, 16, 17] },
];

describe('MealPlanner shelf room data', () => {
  it('puts fridge food sources one tile inward and gives each market category one three-tile shelf', () => {
    const room = GAME_ROOMS.MealPlanner;

    expect(room.fridgeTiles).toEqual([
      { col: 2, row: 4 }, { col: 4, row: 4 },
      { col: 2, row: 6 }, { col: 4, row: 6 },
      { col: 2, row: 8 }, { col: 4, row: 8 },
    ]);
    expect(room.marketShelves).toEqual(SHELVES);
    expect(room.map[4].slice(1, 5)).toEqual([TILE.FLOOR_WOOD, TILE.COUNTER, TILE.FLOOR_WOOD, TILE.COUNTER]);
    expect(room.map[6].slice(1, 5)).toEqual([TILE.FLOOR_WOOD, TILE.COUNTER, TILE.FLOOR_WOOD, TILE.COUNTER]);
    expect(room.map[8].slice(1, 5)).toEqual([TILE.FLOOR_WOOD, TILE.COUNTER, TILE.FLOOR_WOOD, TILE.COUNTER]);
    expect(room.map[3].slice(15, 18)).toEqual([TILE.COUNTER, TILE.COUNTER, TILE.COUNTER]);
    expect(room.map[5].slice(15, 18)).toEqual([TILE.COUNTER, TILE.COUNTER, TILE.COUNTER]);
    expect(room.map[7].slice(15, 18)).toEqual([TILE.COUNTER, TILE.COUNTER, TILE.COUNTER]);
    expect(room.map[9].slice(15, 18)).toEqual([TILE.COUNTER, TILE.COUNTER, TILE.COUNTER]);
    expect(room.map[11].slice(15, 18)).toEqual([TILE.COUNTER, TILE.COUNTER, TILE.COUNTER]);
    expect(room.map[13].slice(15, 18)).toEqual([TILE.FLOOR_WOOD, TILE.FLOOR_WOOD, TILE.FLOOR_WOOD]);
    expect(room.decorations.every(({ col }) => col < 6 || col > 13)).toBe(true);
  });

  it('uses the geometric centre of the 2×2 plate tiles for rendering and feedback', () => {
    const room = GAME_ROOMS.MealPlanner;
    const cols = room.plateTiles.map(({ col }) => col);
    const rows = room.plateTiles.map(({ row }) => row);
    const tileBoundsCentre = {
      col: (Math.min(...cols) + Math.max(...cols) + 1) / 2,
      row: (Math.min(...rows) + Math.max(...rows) + 1) / 2,
    };

    expect(tileBoundsCentre).toEqual({ col: 10, row: 7 });
    expect(room.plateCenter).toEqual(tileBoundsCentre);
  });

  it('makes every floor tile covered by the fixed coach or control dock non-walkable', () => {
    const room = GAME_ROOMS.MealPlanner;
    const { coach, controls } = getMealPlannerHudLayout();
    const coveredFloorTiles = [];

    const overlaps = (tileRect, hudRect) => (
      tileRect.x < hudRect.x + hudRect.width
      && tileRect.x + tileRect.width > hudRect.x
      && tileRect.y < hudRect.y + hudRect.height
      && tileRect.y + tileRect.height > hudRect.y
    );

    for (let row = 0; row < ROOM_ROWS; row += 1) {
      for (let col = 0; col < ROOM_COLS; col += 1) {
        if (room.map[row][col] !== TILE.FLOOR_WOOD) continue;
        const start = roomToCanvas(room, OX + col * TS, OY + row * TS);
        const end = roomToCanvas(room, OX + (col + 1) * TS, OY + (row + 1) * TS);
        const tileRect = {
          x: start.x,
          y: start.y,
          width: end.x - start.x,
          height: end.y - start.y,
        };
        if ([coach, controls].some((rect) => overlaps(tileRect, rect))) {
          coveredFloorTiles.push({ col, row });
        }
      }
    }

    expect(coveredFloorTiles.length).toBeGreaterThan(0);
    expect(coveredFloorTiles.every(({ col, row }) => !isGameRoomWalkable(room, col, row))).toBe(true);

    // The blocked central bands must still leave a lane around both sides.
    expect(isGameRoomWalkable(room, 5, 2)).toBe(true);
    expect(isGameRoomWalkable(room, 14, 2)).toBe(true);
    expect(isGameRoomWalkable(room, 5, 13)).toBe(true);
    expect(isGameRoomWalkable(room, 14, 13)).toBe(true);
  });
});

describe('layoutMarketItems', () => {
  it('centres a singleton, spaces a pair to the edges, and fills a three-item shelf', () => {
    expect(layoutMarketItems({
      carb: ['bread'],
      protein: ['tofu', 'lentils'],
      veg: ['tomato', 'cucumber', 'kale'],
    }, SHELVES)).toEqual([
      { id: 'bread', cat: 'carb', tile: { col: 16, row: 3 }, firstOfCat: true },
      { id: 'tofu', cat: 'protein', tile: { col: 15, row: 5 }, firstOfCat: true },
      { id: 'lentils', cat: 'protein', tile: { col: 17, row: 5 }, firstOfCat: false },
      { id: 'tomato', cat: 'veg', tile: { col: 15, row: 7 }, firstOfCat: true },
      { id: 'cucumber', cat: 'veg', tile: { col: 16, row: 7 }, firstOfCat: false },
      { id: 'kale', cat: 'veg', tile: { col: 17, row: 7 }, firstOfCat: false },
    ]);
  });

  it.each(SCENARIOS.map(({ id }) => [id]))(
    'keeps every %s market item on its category shelf',
    (scenarioId) => {
      const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
      const items = layoutMarketItems(scenario.market, SHELVES);

      const expectedItemCount = Object.values(scenario.market)
        .reduce((total, categoryItems) => total + categoryItems.length, 0);
      expect(items).toHaveLength(expectedItemCount);
      expect(new Set(items.map(({ tile }) => `${tile.col},${tile.row}`)).size).toBe(items.length);

      for (const shelf of SHELVES) {
        const categoryItems = items.filter((item) => item.cat === shelf.cat);
        expect(categoryItems.map((item) => item.id)).toEqual(scenario.market[shelf.cat]);
        expect(categoryItems.every((item) => item.tile.row === shelf.row)).toBe(true);
        expect(categoryItems.every((item) => shelf.cols.includes(item.tile.col))).toBe(true);
        expect(categoryItems.filter((item) => item.firstOfCat)).toHaveLength(1);
        expect(categoryItems[0].firstOfCat).toBe(true);
      }
    },
  );

  it('rejects categories with more items than their three-tile shelf can hold', () => {
    expect(() => layoutMarketItems({ carb: ['bread', 'rice', 'pasta', 'oats'] }, SHELVES))
      .toThrow('Market shelf "carb" can hold at most 3 items.');
  });
});
