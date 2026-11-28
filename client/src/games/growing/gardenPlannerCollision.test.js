import { describe, expect, it } from 'vitest';
import { GAME_ROOMS } from '../engine/gameRoomData.js';
import { DIR, updatePlayerMovement } from '../engine/gameRoomLogic.js';
import * as gardenLogic from './gardenTargets.js';

const ROOM = GAME_ROOMS.GardenPlanner;
const DIRECTIONS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
const NEIGHBOURS = [
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
];

function buildPlots() {
  return ROOM.cornerAreas.flatMap((area) => {
    const plots = [];
    for (let row = area.minRow; row <= area.maxRow; row++) {
      for (let col = area.minCol; col <= area.maxCol; col++) {
        plots.push({
          col,
          row,
          season: area.season,
          seed: null,
          health: 0,
          wilted: false,
          harvested: false,
          growthStage: 0,
        });
      }
    }
    return plots;
  });
}

function canWalk(col, row) {
  return gardenLogic.isGardenTileWalkable(ROOM, col, row);
}

function playerAt(col, row, dir) {
  return {
    col,
    row,
    dir,
    pixelX: col * 32,
    pixelY: row * 32,
    moving: false,
    moveTimer: 0,
    fromX: col * 32,
    fromY: row * 32,
    toX: col * 32,
    toY: row * 32,
  };
}

function reachableWalkableTiles() {
  const start = ROOM.playerStart;
  const queue = [{ col: start.col, row: start.row }];
  const seen = new Set([`${start.col},${start.row}`]);

  while (queue.length) {
    const current = queue.shift();
    for (const { dc, dr } of NEIGHBOURS) {
      const next = { col: current.col + dc, row: current.row + dr };
      const key = `${next.col},${next.row}`;
      if (seen.has(key) || !canWalk(next.col, next.row)) continue;
      seen.add(key);
      queue.push(next);
    }
  }

  return [...seen].map((key) => {
    const [col, row] = key.split(',').map(Number);
    return { col, row };
  });
}

function stateAt(col, row, dir, over = {}) {
  return {
    phase: 'PLANT',
    activeSeason: 'winter',
    waterRound: 1,
    carrying: null,
    player: { col, row, dir },
    plots: buildPlots(),
    seedCrates: ROOM.seedCratePositions.map((position) => ({ ...position })),
    toolTiles: ROOM.toolPositions.map((position) => ({ ...position })),
    ...over,
  };
}

describe('Garden Planner collision', () => {
  it.each([
    ['seed crate', { from: { col: 9, row: 4 }, key: 'arrowleft', blocked: { col: 8, row: 4 } }],
    ['planting plot', { from: { col: 4, row: 4 }, key: 'arrowup', blocked: { col: 4, row: 3 } }],
  ])('does not let the child enter a %s tile', (_name, example) => {
    const player = playerAt(example.from.col, example.from.row, DIR.UP);

    updatePlayerMovement(player, 1 / 60, new Set([example.key]), canWalk);

    expect({ col: player.col, row: player.row }).toEqual(example.from);
    expect({ col: player.col, row: player.row }).not.toEqual(example.blocked);
    expect(player.moving).toBe(false);
  });

  it('keeps the central route and every interaction stance connected to the start', () => {
    const reachable = reachableWalkableTiles();
    const reachableKeys = new Set(reachable.map(({ col, row }) => `${col},${row}`));

    expect(reachableKeys).toContain('9,4');
    expect(reachableKeys).toContain('10,10');

    for (const crate of ROOM.seedCratePositions) {
      const canReachCrate = reachable.some(({ col, row }) => DIRECTIONS.some((dir) => {
        const state = stateAt(col, row, dir);
        const target = gardenLogic.resolveGardenTargets(state).crate;
        return target?.col === crate.col && target?.row === crate.row;
      }));
      expect(canReachCrate, `crate at ${crate.col},${crate.row}`).toBe(true);
    }

    for (const plot of buildPlots()) {
      const canReachPlot = reachable.some(({ col, row }) => DIRECTIONS.some((dir) => {
        const state = stateAt(col, row, dir, {
          activeSeason: plot.season,
          carrying: { seed: { id: 'test-seed' } },
        });
        const target = gardenLogic.resolveGardenTargets(state).plot;
        return target?.col === plot.col && target?.row === plot.row;
      }));
      expect(canReachPlot, `plot at ${plot.col},${plot.row}`).toBe(true);
    }
  });
});
