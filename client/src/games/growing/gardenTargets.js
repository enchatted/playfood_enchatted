// What the child is about to act on in the Garden Planner, decided once a frame.
//
// This is the first game on the engine's reach ladder. Kept in
// its own module rather than inline in the component so the whole targeting
// decision can be tested without mounting a canvas — see gardenPlannerReach.test.js.
//
// Eligibility is the heart of it, not a filter bolted on afterwards. The room
// now keeps the child outside beds and crates, while the reach ladder resolves
// the intended neighbouring target without requiring one exact stance.

import { resolveInteraction, dirTowardsTile, REACH } from '../engine/gameRoomLogic.js';
import { TILE } from '../../overworld/tileAtlas.js';

const GARDEN_FLOOR_TILES = new Set([
  TILE.GRASS,
  TILE.DARK_GRASS,
  TILE.PATH,
  TILE.FLOOR_STONE,
]);

/** Garden floor that is not occupied by a seed crate or planting bed. */
export function isGardenTileWalkable(room, col, row) {
  const tile = room.map[row]?.[col];
  if (!GARDEN_FLOOR_TILES.has(tile)) return false;

  const hasSeedCrate = room.seedCratePositions.some(
    (position) => position.col === col && position.row === row,
  );
  if (hasSeedCrate) return false;

  const insidePlantingBed = room.cornerAreas.some((area) => (
    col >= area.minCol && col <= area.maxCol
    && row >= area.minRow && row <= area.maxRow
  ));
  return !insidePlantingBed;
}

const CRATE_REACH = [REACH.FACED, REACH.OWN, REACH.AHEAD2];
const TOOL_REACH = [REACH.FACED, REACH.OWN, REACH.AHEAD2, REACH.SIDE, REACH.DIAGONAL];
const IMMEDIATE_REACH = [REACH.OWN, REACH.FACED];
const FACED_REACH = [REACH.FACED];
const OWN_REACH = [REACH.OWN];
const TOLERANCE_REACH = [REACH.AHEAD2, REACH.SIDE, REACH.DIAGONAL];

/** Round gating: everything gets its first drink before anything gets a second. */
const waterTarget = (state) => (state.waterRound === 2 ? 1 : 0);

const isHealthy = (plot) => !plot.wilted && plot.health >= 2;

/** Can the child act on this plot this very frame, with what they are holding? */
export function isPlotActionable(state, plot) {
  if (state.phase === 'PLANT') {
    return !!state.carrying?.seed && !plot.seed && plot.season === state.activeSeason;
  }
  if (state.phase === 'WATER') {
    return state.carrying?.tool === 'water'
      && !!plot.seed && !plot.wilted && plot.health === waterTarget(state);
  }
  if (state.phase === 'HARVEST') {
    if (!plot.seed || plot.harvested) return false;
    return state.carrying?.tool === (isHealthy(plot) ? 'harvest' : 'compost');
  }
  return false;
}

/**
 * Plots that cannot be acted on but are worth explaining: the out-of-season bed,
 * the plant whose turn to drink has not come, the plant holding out for the other
 * tool. A directly faced explanation may beat a fuzzy side/diagonal guess, but
 * it never steals an immediate action underfoot or directly ahead.
 */
export function isPlotTeachable(state, plot) {
  if (state.phase === 'PLANT') return !!state.carrying?.seed && !plot.seed;
  if (state.phase === 'WATER') {
    return state.carrying?.tool === 'water' && !!plot.seed && !plot.wilted && plot.health < 2;
  }
  if (state.phase === 'HARVEST') {
    const holdingTool = state.carrying?.tool === 'harvest' || state.carrying?.tool === 'compost';
    return holdingTool && !!plot.seed && !plot.harvested;
  }
  return false;
}

/**
 * Does this tool still have work in the harvest phase?
 * The basket while a healthy, unharvested plant remains; the bin while a wilted
 * (or under-watered) unharvested plant remains. The same rule drives the target,
 * the prompt, the action and the tool's highlight (renderTools), so a tool the
 * child can no longer use never looks or answers as available.
 */
export function harvestToolHasWork(plots, tool) {
  const left = (plots || []).filter((p) => p.seed && !p.harvested);
  if (tool === 'harvest') return left.some((p) => !p.wilted && p.health >= 2);
  if (tool === 'compost') return left.some((p) => p.wilted || p.health < 2);
  return false;
}

/** Is this the tool the current phase asks for? */
export function isToolActionable(state, tile) {
  if (state.phase === 'WATER') return tile.tool === 'water';
  if (state.phase === 'HARVEST') {
    if (tile.tool !== 'harvest' && tile.tool !== 'compost') return false;
    // Holding this very tool: nothing to pick up. Holding the other harvest tool:
    // this one is a swap target (one press puts the old one down).
    if (state.carrying?.tool === tile.tool) return false;
    return harvestToolHasWork(state.plots, tile.tool);
  }
  return false;
}

/** Holding a harvest tool lets the child swap straight to the other one. */
function canSwapHarvestTool(state) {
  return state.phase === 'HARVEST'
    && (state.carrying?.tool === 'harvest' || state.carrying?.tool === 'compost');
}

/**
 * @returns {{crate, tool, plot, target, mode, snapDir, swap, toolTie}} the three answers the
 *   update loop expects, plus the matched `target` tile, its action/teach mode,
 *   and `snapDir` when a confirmed side interaction should turn the avatar.
 */
export function resolveGardenTargets(state) {
  const handsFree = !state.carrying;

  const crateHit = state.phase === 'PLANT' && handsFree
    ? resolveInteraction(state.player, state.seedCrates, null, CRATE_REACH)
    : null;
  const toolsOffered = handsFree || canSwapHarvestTool(state);
  const toolHit = toolsOffered
    ? resolveInteraction(
      state.player,
      state.toolTiles,
      (tile) => isToolActionable(state, tile),
      TOOL_REACH,
    )
    : null;

  let plotMode = 'action';
  let plotHit = resolveInteraction(
    state.player,
    state.plots,
    (plot) => isPlotActionable(state, plot),
    IMMEDIATE_REACH,
  );

  // A faced plot is a clear intention even when it needs an explanation. It
  // therefore blocks fuzzy side and diagonal guesses, but never an immediate
  // action underfoot or directly ahead.
  if (!plotHit) {
    plotHit = resolveInteraction(
      state.player,
      state.plots,
      (plot) => isPlotTeachable(state, plot),
      FACED_REACH,
    );
    if (plotHit) plotMode = 'teach';
  }

  if (!plotHit) {
    plotHit = resolveInteraction(
      state.player,
      state.plots,
      (plot) => isPlotActionable(state, plot),
      TOLERANCE_REACH,
    );
  }

  // A plot merely underfoot is a useful fallback explanation, but a nearby
  // actionable plot still takes precedence so the child's intended move works.
  if (!plotHit) {
    plotHit = resolveInteraction(
      state.player,
      state.plots,
      (plot) => isPlotTeachable(state, plot),
      OWN_REACH,
    );
    if (plotHit) plotMode = 'teach';
  }

  if (!plotHit) {
    plotHit = resolveInteraction(
      state.player,
      state.plots,
      (plot) => isPlotTeachable(state, plot),
      TOLERANCE_REACH,
    );
    if (plotHit) plotMode = 'teach';
  }

  // Judged by distance rather than by the order they are asked in: the nearest
  // intent wins, and two equally near is the same tie as any other, answered
  // with silence. Empty hands and full hands happen to make crates and beds
  // mutually exclusive today, but standing at (5,3) facing down really does put
  // a bed one step left and a crate diagonally ahead, so the invariant must not
  // rest on that coincidence.
  let hits = [['crate', crateHit], ['tool', toolHit], ['plot', plotHit]].filter(([, hit]) => hit);

  let best = null;
  if (hits.length) {
    const nearest = Math.min(...hits.map(([, hit]) => hit.reach));
    const front = hits.filter(([, hit]) => hit.reach === nearest);
    if (front.length === 1) best = front[0];
  }
  const kind = best ? best[0] : null;
  const item = best ? best[1].item : null;
  const target = best ? best[1].tile : null;

  // Two usable tools equally near and nothing else answering: still no action
  // (never guess), but the child is told to step closer to one of them.
  let toolTie = false;
  if (!best && toolsOffered && !toolHit) {
    const reaches = state.toolTiles
      .filter((tile) => isToolActionable(state, tile))
      .map((tile) => resolveInteraction(state.player, [tile], null, TOOL_REACH))
      .filter(Boolean)
      .map((hit) => hit.reach);
    if (reaches.length >= 2) {
      const nearest = Math.min(...reaches);
      toolTie = reaches.filter((reach) => reach === nearest).length >= 2;
    }
  }

  return {
    crate: kind === 'crate' ? item : null,
    tool: kind === 'tool' ? item : null,
    plot: kind === 'plot' ? item : null,
    target,
    mode: kind === 'plot' ? plotMode : (kind ? 'action' : null),
    // A tool answer while the hands hold the other harvest tool is a swap.
    swap: kind === 'tool' && !!state.carrying,
    toolTie,
    // Something answered from the side: turn only when the child confirms it.
    snapDir: best && best[1].reach === REACH.SIDE
      ? dirTowardsTile(state.player, target)
      : null,
  };
}
