import { describe, expect, it } from 'vitest';
import { ROOMS, isRoomWalkable } from './islandRoomData.js';
import { getFoodwastePrepIslandLayout } from './islandRoomRenderer.js';

const room = ROOMS.foodwaste;

function traversedTiles(from, to) {
  const tiles = [];
  let col = from.col;
  let row = from.row;
  while (col !== to.col) {
    col += to.col > col ? 1 : -1;
    tiles.push({ col, row });
  }
  while (row !== to.row) {
    row += to.row > row ? 1 : -1;
    tiles.push({ col, row });
  }
  return tiles;
}

describe('living teaching kitchen', () => {
  it('groups the six centre tables into one teaching island', () => {
    expect(getFoodwastePrepIslandLayout(room, 7, 6)).toEqual({
      draw: true,
      col: 7,
      row: 6,
      length: 6,
    });
    expect(getFoodwastePrepIslandLayout(room, 8, 6)).toEqual({
      draw: false,
      col: 7,
      row: 6,
      length: 6,
    });
  });

  it('uses six kitchen visitors with purposeful stops', () => {
    expect(room.ambientNPCs).toHaveLength(6);

    const activities = new Set();
    for (const visitor of room.ambientNPCs) {
      const purposefulStops = visitor.waypoints.filter((waypoint) => waypoint.activity);
      expect(purposefulStops.length).toBeGreaterThanOrEqual(2);
      for (const stop of purposefulStops) {
        expect(stop.pauseMin).toBeGreaterThanOrEqual(0.8);
        expect(stop.pauseMax).toBeLessThanOrEqual(1.8);
        expect(['UP', 'DOWN', 'LEFT', 'RIGHT']).toContain(stop.face);
        activities.add(stop.activity);
      }
    }

    expect(activities).toEqual(new Set([
      'check-fridge',
      'plan-meal',
      'prep-leftovers',
      'set-table',
      'carry-tray',
    ]));
  });

  it('keeps every visitor path off furniture, props and interaction tiles', () => {
    const reserved = new Set();
    for (const actor of [...room.npcs, room.mentor]) {
      reserved.add(`${actor.col},${actor.row}`);
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        reserved.add(`${actor.col + dc},${actor.row + dr}`);
      }
    }

    for (const [visitorIndex, visitor] of room.ambientNPCs.entries()) {
      const waypoints = visitor.waypoints;
      for (let index = 0; index < waypoints.length; index++) {
        const from = waypoints[index];
        const to = waypoints[(index + 1) % waypoints.length];
        for (const tile of traversedTiles(from, to)) {
          expect(
            isRoomWalkable(room, tile.col, tile.row),
            `visitor ${visitorIndex + 1} crosses blocked tile ${tile.col},${tile.row}`,
          ).toBe(true);
          expect(
            reserved.has(`${tile.col},${tile.row}`),
            `visitor ${visitorIndex + 1} crosses interaction tile ${tile.col},${tile.row}`,
          ).toBe(false);
        }
      }
    }
  });
});
