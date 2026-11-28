import { describe, expect, it } from 'vitest';
import { ROOMS, isRoomWalkable } from './islandRoomData.js';
import {
  getCircularKioskLayout,
  getIslandMentorSpriteLayout,
} from './islandRoomRenderer.js';

const room = ROOMS.circular;

function countFurnitureZones() {
  const visited = new Set();
  let zones = 0;

  for (let row = 0; row < room.map.length; row++) {
    for (let col = 0; col < room.map[row].length; col++) {
      if (!getCircularKioskLayout(room, col, row) || visited.has(`${col},${row}`)) continue;
      zones += 1;
      const pending = [[col, row]];
      while (pending.length) {
        const [currentCol, currentRow] = pending.pop();
        const key = `${currentCol},${currentRow}`;
        if (visited.has(key) || !getCircularKioskLayout(room, currentCol, currentRow)) continue;
        visited.add(key);
        pending.push(
          [currentCol + 1, currentRow],
          [currentCol - 1, currentRow],
          [currentCol, currentRow + 1],
          [currentCol, currentRow - 1],
        );
      }
    }
  }

  return zones;
}

describe('Earth Protectors island room', () => {
  it('renders each two-tile work zone as one continuous kiosk', () => {
    expect(getCircularKioskLayout(room, 3, 5)).toEqual({
      draw: true,
      col: 3,
      row: 5,
      length: 2,
    });
    expect(getCircularKioskLayout(room, 4, 5)).toEqual({
      draw: false,
      col: 3,
      row: 5,
      length: 2,
    });
  });

  it('has four purposeful corner zones and keeps the centre plaza open', () => {
    expect(countFurnitureZones()).toBe(4);
    for (let col = 7; col <= 10; col++) {
      expect(isRoomWalkable(room, col, 7), `centre tile ${col},7`).toBe(true);
    }
  });

  it('keeps ambient residents away from every actor interaction tile', () => {
    const reserved = new Set();
    for (const actor of [...room.npcs, room.mentor]) {
      reserved.add(`${actor.col},${actor.row}`);
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        reserved.add(`${actor.col + dc},${actor.row + dr}`);
      }
    }

    for (const resident of room.ambientNPCs) {
      for (const waypoint of resident.waypoints) {
        expect(reserved.has(`${waypoint.col},${waypoint.row}`)).toBe(false);
      }
    }
  });

  it('keeps the Mechanic visually separate from her workshop kiosk', () => {
    const kioskCol = room.map[9].findIndex((tile, col) => (
      col < 10 && getCircularKioskLayout(room, col, 9)?.draw
    ));
    const kiosk = getCircularKioskLayout(room, kioskCol, 9);
    const kioskRect = {
      x: 320 + kiosk.col * 32,
      y: 112 + kiosk.row * 32,
      width: kiosk.length * 32,
      height: 32,
    };
    const mechanicRect = getIslandMentorSpriteLayout({
      mentor: room.mentor,
      time: 0,
      dedicated: true,
    });
    const overlaps = mechanicRect.x < kioskRect.x + kioskRect.width
      && mechanicRect.x + mechanicRect.width > kioskRect.x
      && mechanicRect.y < kioskRect.y + kioskRect.height
      && mechanicRect.y + mechanicRect.height > kioskRect.y;

    expect(overlaps).toBe(false);
  });
});
