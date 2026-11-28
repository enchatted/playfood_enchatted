import { describe, expect, it } from 'vitest';
import { TILE } from '../../overworld/tileAtlas.js';
import { GAME_ROOMS, isGameRoomWalkable } from './gameRoomData.js';

const room = GAME_ROOMS.PlanetaryBoundaries;

describe('Planetary Boundaries room collision and surfaces', () => {
  it('uses clean stone floor instead of brown counter tiles behind every console', () => {
    for (const tile of [
      { col: 9, row: 2 }, { col: 10, row: 2 },
      { col: 3, row: 5 }, { col: 3, row: 6 },
      { col: 15, row: 5 }, { col: 15, row: 6 },
      { col: 9, row: 11 }, { col: 10, row: 11 },
    ]) {
      expect(room.map[tile.row][tile.col]).toBe(TILE.FLOOR_STONE);
    }
  });

  it('blocks the ring, consoles and technician work lanes while keeping approaches open', () => {
    for (const tile of [
      room.ringCenter,
      ...Object.values(room.consoleTiles),
      { col: 3, row: 3 },
      { col: 16, row: 3 },
    ]) {
      expect(isGameRoomWalkable(room, tile.col, tile.row), `${tile.col},${tile.row}`).toBe(false);
    }

    for (const tile of [
      { col: 9, row: 1 },
      { col: 4, row: 6 },
      { col: 14, row: 6 },
      { col: 9, row: 12 },
    ]) {
      expect(isGameRoomWalkable(room, tile.col, tile.row), `${tile.col},${tile.row}`).toBe(true);
    }
  });

  it('provides two animated observation technicians in protected lanes', () => {
    expect(room.technicians).toHaveLength(2);
    expect(room.technicians.map((technician) => technician.station)).toEqual(['satellite', 'earth']);
  });
});
