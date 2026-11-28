import { describe, it, expect } from 'vitest';
import { GAME_ROOMS } from '../engine/gameRoomData.js';
import { DIR, REACH, resolveInteraction } from '../engine/gameRoomLogic.js';
import {
  resolveGardenTargets, isPlotActionable, isPlotTeachable, isToolActionable, harvestToolHasWork,
} from './gardenTargets.js';
import { TILE } from '../../overworld/tileAtlas.js';

/* Check which garden plot the player can reach, including near a shared edge. */

const ROOM = GAME_ROOMS.GardenPlanner;
const WALKABLE = new Set([TILE.GRASS, TILE.DARK_GRASS, TILE.PATH, TILE.FLOOR_STONE]);
const isWalkable = (col, row) =>
  row >= 0 && row < 15 && col >= 0 && col < 20 && WALKABLE.has(ROOM.map[row][col]);

// Same construction as GardenPlanner's buildPlots.
function buildPlots() {
  const plots = [];
  for (const area of ROOM.cornerAreas) {
    for (let row = area.minRow; row <= area.maxRow; row++) {
      for (let col = area.minCol; col <= area.maxCol; col++) {
        plots.push({
          col, row, season: area.season, seed: null,
          health: 0, wilted: false, harvested: false, growthStage: 0,
        });
      }
    }
  }
  return plots;
}

const SEED = { seed: { id: 'cabbage', emoji: '🥬', validSeasons: ['winter'] } };

/** A game state good enough for targeting, with the player placed and facing. */
function stateAt(col, row, dir, over = {}) {
  return {
    phase: 'PLANT',
    activeSeason: 'winter',
    waterRound: 1,
    carrying: null,
    player: { col, row, dir },
    plots: buildPlots(),
    seedCrates: ROOM.seedCratePositions.map((p) => ({ ...p })),
    toolTiles: ROOM.toolPositions.map((p) => ({ ...p })),
    ...over,
  };
}

/** Grow every plot to a given state, so the water and harvest phases have work. */
function growAll(state, over) {
  for (const plot of state.plots) Object.assign(plot, { seed: { id: 'cabbage' } }, over);
  return state;
}

const plotAt = (state, col, row) => state.plots.find((p) => p.col === col && p.row === row);

/** Harvest with work for BOTH tools: everything healthy except one wilted plot. */
function mixedHarvest(state) {
  growAll(state, { health: 2, wilted: false, harvested: false });
  Object.assign(plotAt(state, 3, 2), { health: 0, wilted: true });
  return state;
}
const at = (item) => (item ? { col: item.col, row: item.row } : null);

describe('reach ladder — the faced tile still wins (no regression)', () => {
  it('picks the plot straight ahead, exactly as before', () => {
    const state = stateAt(3, 4, DIR.UP, { carrying: SEED });
    expect(at(resolveGardenTargets(state).plot)).toEqual({ col: 3, row: 3 });
  });

  it('picks the crate straight ahead', () => {
    const state = stateAt(7, 5, DIR.UP);
    expect(at(resolveGardenTargets(state).crate)).toEqual({ col: 7, row: 4 });
  });

  it('picks the tool straight ahead', () => {
    const state = stateAt(1, 8, DIR.UP, { phase: 'WATER' });
    expect(resolveGardenTargets(state).tool.tool).toBe('water');
  });
});

describe('#17 — the child no longer needs an exact position', () => {
  it('uses the faced crate before the crate underfoot', () => {
    // Standing on watermelon while facing strawberry must mean strawberry.
    const state = stateAt(7, 4, DIR.LEFT);
    expect(at(resolveGardenTargets(state).crate)).toEqual({ col: 6, row: 4 });
  });

  it('acts on the crate underfoot, which used to need stepping off first', () => {
    const state = stateAt(7, 4, DIR.UP); // standing ON the watermelon crate
    expect(at(resolveGardenTargets(state).crate)).toEqual({ col: 7, row: 4 });
  });

  it('plants the plot the child is standing on', () => {
    const state = stateAt(3, 2, DIR.RIGHT, { carrying: SEED });
    expect(at(resolveGardenTargets(state).plot)).toEqual({ col: 3, row: 2 });
  });

  it('reaches a crate two tiles straight ahead', () => {
    const state = stateAt(7, 6, DIR.UP);
    expect(at(resolveGardenTargets(state).crate)).toEqual({ col: 7, row: 4 });
  });

  it('rescues a facing left over from walking, and turns the avatar', () => {
    // Walked left along the path with the bed above: the old code went silent.
    const state = stateAt(3, 4, DIR.LEFT, { carrying: SEED });
    const targets = resolveGardenTargets(state);
    expect(at(targets.plot)).toEqual({ col: 3, row: 3 });
    expect(targets.snapDir).toBe(DIR.UP);
  });

  it('reaches the corner plot diagonally ahead', () => {
    const state = stateAt(5, 4, DIR.LEFT, { carrying: SEED });
    const targets = resolveGardenTargets(state);
    expect(at(targets.plot)).toEqual({ col: 4, row: 3 });
    expect(targets.snapDir).toBeNull(); // already facing that way, no turn needed
  });

  it('acts on the tool tile underfoot', () => {
    const state = growAll(stateAt(18, 7, DIR.UP, { phase: 'HARVEST' }), { health: 2 });
    expect(resolveGardenTargets(state).tool.tool).toBe('harvest');
  });
});

describe('#18 — it never grabs the neighbour', () => {
  it('explains the faced wilted plant instead of harvesting a diagonal neighbour', () => {
    const state = stateAt(3, 1, DIR.DOWN, {
      phase: 'HARVEST', carrying: { tool: 'harvest' },
    });
    growAll(state, { health: 2, wilted: false, harvested: true });
    Object.assign(plotAt(state, 3, 2), { health: 0, wilted: true, harvested: false });
    Object.assign(plotAt(state, 4, 2), { health: 2, wilted: false, harvested: false });

    const targets = resolveGardenTargets(state);
    expect(at(targets.plot)).toEqual({ col: 3, row: 2 });
    expect(targets.mode).toBe('teach');
  });

  it('keeps an actionable plot underfoot ahead of another actionable faced plot', () => {
    const state = stateAt(3, 2, DIR.DOWN, { carrying: SEED });
    const targets = resolveGardenTargets(state);
    expect(at(targets.plot)).toEqual({ col: 3, row: 2 });
    expect(targets.mode).toBe('action');
  });

  it('uses an actionable faced plot before a teachable plot underfoot', () => {
    const state = stateAt(3, 2, DIR.DOWN, {
      phase: 'HARVEST', carrying: { tool: 'harvest' },
    });
    growAll(state, { health: 2, wilted: false, harvested: true });
    Object.assign(plotAt(state, 3, 2), { health: 0, wilted: true, harvested: false });
    Object.assign(plotAt(state, 3, 3), { health: 2, wilted: false, harvested: false });

    const targets = resolveGardenTargets(state);
    expect(at(targets.plot)).toEqual({ col: 3, row: 3 });
    expect(targets.mode).toBe('action');
  });

  it('says nothing when two tools are equally in reach', () => {
    // (18,8) sits between the harvest basket (18,7) and the compost bin (18,9).
    const state = mixedHarvest(stateAt(18, 8, DIR.LEFT, { phase: 'HARVEST' }));
    expect(resolveGardenTargets(state).tool).toBeNull();
  });

  it('says nothing when both tools flank the faced tile', () => {
    const state = mixedHarvest(stateAt(17, 8, DIR.RIGHT, { phase: 'HARVEST' }));
    expect(resolveGardenTargets(state).tool).toBeNull();
  });

  it('never reaches behind the child', () => {
    // The winter bed is at row 3, directly behind a child facing down.
    const state = stateAt(3, 4, DIR.DOWN, { carrying: SEED });
    expect(resolveGardenTargets(state).plot).toBeNull();
  });

  it('a harvested plot underfoot does not swallow the plot being faced', () => {
    const state = stateAt(3, 12, DIR.UP, {
      phase: 'HARVEST', activeSeason: 'autumn', carrying: { tool: 'harvest' },
    });
    Object.assign(plotAt(state, 3, 12), { seed: { id: 'pumpkin' }, health: 2, harvested: true });
    Object.assign(plotAt(state, 3, 11), { seed: { id: 'pumpkin' }, health: 2, harvested: false });
    expect(at(resolveGardenTargets(state).plot)).toEqual({ col: 3, row: 11 });
  });

  it('a watered plot underfoot does not swallow the thirsty plot being faced', () => {
    const state = stateAt(3, 12, DIR.UP, {
      phase: 'WATER', activeSeason: 'autumn', carrying: { tool: 'water' },
    });
    Object.assign(plotAt(state, 3, 12), { seed: { id: 'pumpkin' }, health: 2 });
    Object.assign(plotAt(state, 3, 11), { seed: { id: 'pumpkin' }, health: 0 });
    expect(at(resolveGardenTargets(state).plot)).toEqual({ col: 3, row: 11 });
  });

  it('a plant that already drank does not swallow the one whose turn it is', () => {
    // The round-1 lock-out ("everything drinks once first") must not be spent on
    // a plot the child merely happens to be standing on.
    const state = stateAt(3, 12, DIR.UP, {
      phase: 'WATER', activeSeason: 'autumn', waterRound: 1, carrying: { tool: 'water' },
    });
    Object.assign(plotAt(state, 3, 12), { seed: { id: 'pumpkin' }, health: 1 });
    Object.assign(plotAt(state, 3, 11), { seed: { id: 'pumpkin' }, health: 0 });
    expect(at(resolveGardenTargets(state).plot)).toEqual({ col: 3, row: 11 });
  });
});

describe('eligibility gates the reach', () => {
  it('supports an intent-specific reach order', () => {
    const player = { col: 7, row: 4, dir: DIR.LEFT };
    const items = [{ id: 'own', col: 7, row: 4 }, { id: 'faced', col: 6, row: 4 }];
    const hit = resolveInteraction(player, items, null, [REACH.FACED, REACH.OWN]);
    expect(hit.item.id).toBe('faced');
  });

  it('returns the matched tile for a multi-tile interactable', () => {
    const player = { col: 4, row: 3, dir: DIR.LEFT };
    const consoleItem = { id: 'console', tiles: [{ col: 3, row: 3 }, { col: 2, row: 3 }] };
    const hit = resolveInteraction(player, [consoleItem]);
    expect(hit.tile).toEqual({ col: 3, row: 3 });
  });

  it('an item with nothing left to do is not in reach at all', () => {
    const player = { col: 3, row: 4, dir: DIR.UP };
    const items = [{ col: 3, row: 3, done: true }];
    expect(resolveInteraction(player, items, (item) => !item.done)).toBeNull();
  });

  it('never offers a plot that is already planted', () => {
    const state = stateAt(3, 4, DIR.UP, { carrying: SEED });
    plotAt(state, 3, 3).seed = { id: 'carrot' };
    expect(at(resolveGardenTargets(state).plot)).not.toEqual({ col: 3, row: 3 });
  });

  it('offers no tool in the planting phase', () => {
    const state = stateAt(1, 8, DIR.UP);
    expect(resolveGardenTargets(state).tool).toBeNull();
  });

  it('offers no crate while the child already carries something', () => {
    const state = stateAt(7, 4, DIR.UP, { carrying: SEED });
    expect(resolveGardenTargets(state).crate).toBeNull();
  });

  it('the water can is out of reach once the harvest starts', () => {
    const state = stateAt(1, 8, DIR.UP, { phase: 'HARVEST' });
    expect(resolveGardenTargets(state).tool).toBeNull();
  });

  it('a tie unlocks itself as things get used up', () => {
    const state = mixedHarvest(stateAt(18, 8, DIR.LEFT, { phase: 'HARVEST' }));
    expect(resolveGardenTargets(state).tool).toBeNull();
    // Once only one tool is still called for, the same stance answers.
    const narrowed = resolveInteraction(
      state.player, state.toolTiles, (tile) => tile.tool === 'harvest',
    );
    expect(at(narrowed.item)).toEqual({ col: 18, row: 7 });
    expect(narrowed.reach).toBe(REACH.SIDE);
  });
});

describe('the wrong bed still gets its explanation', () => {
  it('reaches an out-of-season plot when there is nothing else to do', () => {
    // Autumn is the active season; the child carries a seed to the winter bed.
    const state = stateAt(3, 4, DIR.UP, { activeSeason: 'autumn', carrying: SEED });
    const targets = resolveGardenTargets(state);
    expect(at(targets.plot)).toEqual({ col: 3, row: 3 });
    expect(isPlotActionable(state, targets.plot)).toBe(false);
    expect(isPlotTeachable(state, targets.plot)).toBe(true);
    expect(targets.mode).toBe('teach');
  });

  it('but a plot it can actually plant always comes first', () => {
    const state = stateAt(3, 4, DIR.UP, { activeSeason: 'winter', carrying: SEED });
    const targets = resolveGardenTargets(state);
    expect(isPlotActionable(state, targets.plot)).toBe(true);
    expect(targets.mode).toBe('action');
  });
});

describe('room sweep — every walkable tile, every direction', () => {
  const DIRS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
  const BEHIND = {
    [DIR.UP]: { dc: 0, dr: 1 },
    [DIR.DOWN]: { dc: 0, dr: -1 },
    [DIR.LEFT]: { dc: 1, dr: 0 },
    [DIR.RIGHT]: { dc: -1, dr: 0 },
  };
  const AHEAD = {
    [DIR.UP]: [0, -1], [DIR.DOWN]: [0, 1], [DIR.LEFT]: [-1, 0], [DIR.RIGHT]: [1, 0],
  };

  // Every hand the child can be walking around with, in every phase.
  const SCENARIOS = [
    { name: 'planting, empty handed', over: {} },
    { name: 'planting a winter seed', over: { carrying: SEED } },
    { name: 'planting an autumn seed', over: { activeSeason: 'autumn', carrying: SEED } },
    { name: 'watering, empty handed', over: { phase: 'WATER' }, grow: { health: 0 } },
    { name: 'watering round 1', over: { phase: 'WATER', waterRound: 1, carrying: { tool: 'water' } }, grow: { health: 0 } },
    { name: 'watering round 2', over: { phase: 'WATER', waterRound: 2, carrying: { tool: 'water' } }, grow: { health: 1 } },
    { name: 'harvesting, empty handed', over: { phase: 'HARVEST' }, grow: { health: 2 } },
    { name: 'harvesting with the basket', over: { phase: 'HARVEST', carrying: { tool: 'harvest' } }, grow: { health: 2 } },
    { name: 'harvesting with the bin', over: { phase: 'HARVEST', carrying: { tool: 'compost' } }, grow: { health: 0, wilted: true } },
    // Either usable tool can be selected with empty hands or while carrying the other.
    { name: 'harvesting, both needed, empty handed', over: { phase: 'HARVEST' }, mixed: true },
    { name: 'harvesting, both needed, basket in hand', over: { phase: 'HARVEST', carrying: { tool: 'harvest' } }, mixed: true },
    { name: 'harvesting, both needed, bin in hand', over: { phase: 'HARVEST', carrying: { tool: 'compost' } }, mixed: true },
  ];

  const eachStance = (scenario, visit) => {
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 20; col++) {
        if (!isWalkable(col, row)) continue;
        for (const dir of DIRS) {
          const state = stateAt(col, row, dir, scenario.over);
          if (scenario.grow) growAll(state, scenario.grow);
          if (scenario.mixed) mixedHarvest(state);
          visit(state);
        }
      }
    }
  };

  const everyStance = (visit) => { for (const s of SCENARIOS) eachStance(s, visit); };

  it('never answers with the tile directly behind the child', () => {
    everyStance((state) => {
      const { target } = resolveGardenTargets(state);
      if (!target) return;
      const b = BEHIND[state.player.dir];
      expect(at(target)).not.toEqual({
        col: state.player.col + b.dc, row: state.player.row + b.dr,
      });
    });
  });

  it('never answers with a crate, a tool and a plot at the same time', () => {
    // The component reads the three separately and the prompt takes the first
    // it finds, so exactly one of them may ever be filled in.
    everyStance((state) => {
      const t = resolveGardenTargets(state);
      expect([t.crate, t.tool, t.plot].filter(Boolean).length).toBeLessThanOrEqual(1);
    });
  });

  it('only ever answers with something this phase can use', () => {
    everyStance((state) => {
      const t = resolveGardenTargets(state);
      if (t.plot) {
        expect(isPlotActionable(state, t.plot) || isPlotTeachable(state, t.plot)).toBe(true);
      }
      if (t.tool) expect(isToolActionable(state, t.tool)).toBe(true);
      if (t.crate) expect(state.carrying).toBeNull();
    });
  });

  it('stays within two tiles of the child', () => {
    everyStance((state) => {
      const { target } = resolveGardenTargets(state);
      if (!target) return;
      const dist = Math.abs(target.col - state.player.col)
        + Math.abs(target.row - state.player.row);
      expect(dist).toBeLessThanOrEqual(2);
    });
  });

  it('never turns an aim that used to work into silence', () => {
    // The ladder may only ADD reach. Wherever the old exact-tile match answered,
    // the game must still answer: with the tile underfoot when the child is
    // standing on one, but never with nothing.
    everyStance((state) => {
      const [dc, dr] = AHEAD[state.player.dir];
      const faced = { col: state.player.col + dc, row: state.player.row + dr };
      const facedPlot = state.plots.find(
        (p) => p.col === faced.col && p.row === faced.row && isPlotActionable(state, p),
      );
      if (!facedPlot) return;
      const { plot, target } = resolveGardenTargets(state);
      expect(target).not.toBeNull();
      if (plot && (plot.col !== faced.col || plot.row !== faced.row)) {
        expect(at(plot)).toEqual({ col: state.player.col, row: state.player.row });
      }
    });
  });

  it('an explanation never steals an immediate action', () => {
    everyStance((state) => {
      const t = resolveGardenTargets(state);
      if (!t.plot || isPlotActionable(state, t.plot)) return;
      // A faced explanation may intentionally beat a fuzzy side/diagonal guess,
      // but it must never hide an action underfoot or directly ahead.
      const actionable = resolveInteraction(
        state.player,
        state.plots,
        (plot) => isPlotActionable(state, plot),
        [REACH.OWN, REACH.FACED],
      );
      expect(actionable).toBeNull();
    });
  });
});

describe('a harvest tool answers only while it has work, and swaps in one press', () => {
  const BASKET_FACE = [17, 7, DIR.RIGHT];
  const BIN_FACE = [17, 9, DIR.RIGHT];

  it('work rule: basket while a healthy plant is left, bin while a wilted one is left', () => {
    const state = mixedHarvest(stateAt(9, 7, DIR.UP, { phase: 'HARVEST' }));
    expect(harvestToolHasWork(state.plots, 'harvest')).toBe(true);
    expect(harvestToolHasWork(state.plots, 'compost')).toBe(true);
    plotAt(state, 3, 2).harvested = true; // the last wilted plant is composted
    expect(harvestToolHasWork(state.plots, 'compost')).toBe(false);
    expect(harvestToolHasWork(state.plots, 'harvest')).toBe(true);
    for (const p of state.plots) p.harvested = true;
    expect(harvestToolHasWork(state.plots, 'harvest')).toBe(false);
    expect(harvestToolHasWork(state.plots, 'water')).toBe(false);
  });

  it('after the last compost the empty bin is no longer offered; the basket is', () => {
    const state = mixedHarvest(stateAt(...BIN_FACE, { phase: 'HARVEST' }));
    plotAt(state, 3, 2).harvested = true;
    expect(resolveGardenTargets(state).tool).toBeNull();
    expect(isToolActionable(state, { tool: 'compost' })).toBe(false);
    Object.assign(state.player, { col: BASKET_FACE[0], row: BASKET_FACE[1], dir: BASKET_FACE[2] });
    expect(resolveGardenTargets(state).tool.tool).toBe('harvest');
  });

  it('holding the bin, the basket answers as a swap (no drop first) — and the reverse', () => {
    const state = mixedHarvest(stateAt(...BASKET_FACE, { phase: 'HARVEST', carrying: { tool: 'compost' } }));
    let t = resolveGardenTargets(state);
    expect(t.tool.tool).toBe('harvest');
    expect(t.swap).toBe(true);
    Object.assign(state, { carrying: { tool: 'harvest' } });
    Object.assign(state.player, { col: BIN_FACE[0], row: BIN_FACE[1], dir: BIN_FACE[2] });
    t = resolveGardenTargets(state);
    expect(t.tool.tool).toBe('compost');
    expect(t.swap).toBe(true);
  });

  it('never offers the tool already in hand, nor a swap to a tool with no work', () => {
    const state = mixedHarvest(stateAt(...BIN_FACE, { phase: 'HARVEST', carrying: { tool: 'compost' } }));
    expect(resolveGardenTargets(state).tool).toBeNull();
    Object.assign(state, { carrying: { tool: 'harvest' } });
    plotAt(state, 3, 2).harvested = true; // nothing left for the bin
    expect(resolveGardenTargets(state).tool).toBeNull();
  });

  it('a tie between two usable tools does nothing but says so', () => {
    for (const [c, r, d] of [[18, 8, DIR.LEFT], [17, 8, DIR.RIGHT]]) {
      const t = resolveGardenTargets(mixedHarvest(stateAt(c, r, d, { phase: 'HARVEST' })));
      expect(t.tool).toBeNull();
      expect(t.target).toBeNull();
      expect(t.toolTie).toBe(true);
    }
  });

  it('with only one usable tool the same stance answers, and there is no tie message', () => {
    const state = mixedHarvest(stateAt(18, 8, DIR.LEFT, { phase: 'HARVEST' }));
    plotAt(state, 3, 2).harvested = true;
    const t = resolveGardenTargets(state);
    expect(t.tool.tool).toBe('harvest');
    expect(t.toolTie).toBe(false);
    // holding the basket between the two: the bin (the only other usable tool) answers
    const s2 = mixedHarvest(stateAt(18, 8, DIR.LEFT, { phase: 'HARVEST', carrying: { tool: 'harvest' } }));
    const t2 = resolveGardenTargets(s2);
    expect(t2.tool.tool).toBe('compost');
    expect(t2.swap).toBe(true);
    expect(t2.toolTie).toBe(false);
  });

  it('planting and watering are unchanged: no tool with a seed in hand, the can while watering', () => {
    const planting = stateAt(17, 7, DIR.RIGHT, { carrying: SEED });
    expect(resolveGardenTargets(planting).tool).toBeNull();
    const watering = growAll(stateAt(1, 8, DIR.UP, { phase: 'WATER' }), { health: 0 });
    expect(resolveGardenTargets(watering).tool.tool).toBe('water');
    const wateringHeld = growAll(stateAt(1, 8, DIR.UP, { phase: 'WATER', carrying: { tool: 'water' } }), { health: 0 });
    expect(resolveGardenTargets(wateringHeld).tool).toBeNull();
  });
});
