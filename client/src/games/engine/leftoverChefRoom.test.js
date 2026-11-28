import { describe, expect, it } from 'vitest';
import { GAME_ROOMS, isGameRoomWalkable } from './gameRoomData.js';
import { counterBenchRects } from './leftoverChefRenderer.js';

describe('Leftover Chef preparation benches', () => {
  const room = GAME_ROOMS.LeftoverChef;

  it('organises all twelve ingredients into two six-place benches', () => {
    expect(room.counterPositions).toEqual([
      ...[4, 5, 6, 7, 8, 9].map((row) => ({ col: 4, row })),
      ...[4, 5, 6, 7, 8, 9].map((row) => ({ col: 15, row })),
    ]);
  });

  it('renders the counter tiles as two unified workbenches', () => {
    expect(counterBenchRects(room.map)).toEqual([
      { col: 3, row: 4, width: 2, height: 6 },
      { col: 15, row: 4, width: 2, height: 6 },
    ]);
  });

  it('keeps a clear interaction tile beside every ingredient station', () => {
    for (const station of room.counterPositions) {
      expect(isGameRoomWalkable(room, station.col, station.row)).toBe(false);
      const backingCol = station.col < 10 ? station.col - 1 : station.col + 1;
      expect(
        isGameRoomWalkable(room, backingCol, station.row),
        `bench backing for ${station.col},${station.row}`,
      ).toBe(false);
      const approachCol = station.col < 10 ? station.col + 1 : station.col - 1;
      expect(
        isGameRoomWalkable(room, approachCol, station.row),
        `approach for ${station.col},${station.row}`,
      ).toBe(true);
    }
  });

  it('places two kitchen assistants outside the central route and blocks their tiles', () => {
    expect(room.kitchenStaff).toEqual([
      { col: 5, row: 11, paletteIndex: 4, dir: 3, activity: 'mix' },
      { col: 14, row: 11, paletteIndex: 3, dir: 2, activity: 'plate' },
    ]);
    for (const staff of room.kitchenStaff) {
      expect(isGameRoomWalkable(room, staff.col, staff.row)).toBe(false);
    }
    expect(isGameRoomWalkable(room, 9, 11)).toBe(true);
  });
});
