import { describe, expect, it } from 'vitest';
import { GAME_ROOMS, isGameRoomWalkable } from './gameRoomData.js';

describe('Circular City structure collision', () => {
  const room = GAME_ROOMS.CircularCity;

  it('blocks the full visual structures while leaving their approach lanes open', () => {
    expect(isGameRoomWalkable(room, 2, 2)).toBe(false);  // repair kiosk side
    expect(isGameRoomWalkable(room, 9, 6)).toBe(false);  // community plaza
    expect(isGameRoomWalkable(room, 5, 11)).toBe(false); // collection shelf edge

    expect(isGameRoomWalkable(room, 3, 3)).toBe(true);   // repair interaction lane
    expect(isGameRoomWalkable(room, 9, 8)).toBe(true);   // route below plaza
    expect(isGameRoomWalkable(room, 9, 12)).toBe(true);  // collection interaction lane
  });
});
