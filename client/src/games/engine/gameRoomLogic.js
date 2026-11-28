// Reusable movement + interaction logic for walk-around game rooms.
// Extracted from IslandRoom patterns — same feel, same speed.

import { lerp } from '../../utils/canvas.js';

import { TILE_SIZE, MOVE_DURATION } from '../../overworld/overworldData.js';

export const DIR = { DOWN: 0, UP: 1, LEFT: 2, RIGHT: 3 };

const DIR_OFFSETS = {
  [DIR.DOWN]:  { dx: 0, dy: 1 },
  [DIR.UP]:    { dx: 0, dy: -1 },
  [DIR.LEFT]:  { dx: -1, dy: 0 },
  [DIR.RIGHT]: { dx: 1, dy: 0 },
};

// ─── Player Movement ─────────────────────────────────────

export function updatePlayerMovement(player, dt, keys, isWalkableFn) {
  if (player.moving) {
    player.moveTimer += dt;
    const progress = Math.min(player.moveTimer / MOVE_DURATION, 1);
    player.pixelX = lerp(player.fromX, player.toX, progress);
    player.pixelY = lerp(player.fromY, player.toY, progress);
    if (progress >= 1) {
      player.pixelX = player.toX;
      player.pixelY = player.toY;
      player.moving = false;
    }
    return;
  }

  let dx = 0, dy = 0, dir = player.dir;
  if (keys.has('arrowup') || keys.has('w') || keys.has('keyw'))         { dy = -1; dir = DIR.UP; }
  else if (keys.has('arrowdown') || keys.has('s') || keys.has('keys'))   { dy = 1;  dir = DIR.DOWN; }
  else if (keys.has('arrowleft') || keys.has('a') || keys.has('keya'))   { dx = -1; dir = DIR.LEFT; }
  else if (keys.has('arrowright') || keys.has('d') || keys.has('keyd'))  { dx = 1;  dir = DIR.RIGHT; }

  player.dir = dir;

  if (dx !== 0 || dy !== 0) {
    const newCol = player.col + dx;
    const newRow = player.row + dy;
    if (isWalkableFn(newCol, newRow)) {
      player.moving = true;
      player.moveTimer = 0;
      player.fromX = player.col * TILE_SIZE;
      player.fromY = player.row * TILE_SIZE;
      player.col = newCol;
      player.row = newRow;
      player.toX = newCol * TILE_SIZE;
      player.toY = newRow * TILE_SIZE;
    }
  }
}

// ─── Interaction Helpers ─────────────────────────────────

export function getFacingTile(player) {
  const off = DIR_OFFSETS[player.dir];
  return { col: player.col + off.dx, row: player.row + off.dy };
}

export function getDistanceTo(col1, row1, col2, row2) {
  return Math.abs(col1 - col2) + Math.abs(row1 - row2);
}

export function isEnterJustPressed(keys, state) {
  const down = keys.has('enter') || keys.has(' ');
  const justPressed = down && !state.enterWasDown;
  state.enterWasDown = down;
  return justPressed;
}

// `q` is the semantic value from a Latin keyboard or the touch control.
// `keyq` is the physical key position recorded by useGameRoomCanvas, so the
// same control works when the active layout emits a different character.
export function isDropKeyPressed(keys) {
  return keys.has('q') || keys.has('keyq');
}

/**
 * Generic interaction check — find nearest interactable the player faces.
 * @param {Object} player - { col, row, dir }
 * @param {Array} interactables - [{ col, row, ...data }]
 * @param {number} maxDist - max Manhattan distance to consider
 * @returns {Object|null} nearest matching interactable or null
 */
export function checkInteraction(player, interactables, maxDist = 1) {
  const facing = getFacingTile(player);
  let best = null;
  let bestDist = Infinity;

  for (const item of interactables) {
    // Must be in the direction the player faces (for distance 1, exact match)
    if (maxDist === 1) {
      if (item.col === facing.col && item.row === facing.row) return item;
      continue;
    }
    // For larger distances, check if target is roughly in the facing direction
    const off = DIR_OFFSETS[player.dir];
    const dc = item.col - player.col;
    const dr = item.row - player.row;
    // Target must be in the same general direction
    if (off.dx !== 0 && Math.sign(dc) !== Math.sign(off.dx)) continue;
    if (off.dy !== 0 && Math.sign(dr) !== Math.sign(off.dy)) continue;
    const dist = getDistanceTo(player.col, player.row, item.col, item.row);
    if (dist <= maxDist && dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  }
  return best;
}

// ─── Reach ladder ──────────────────────
//
// checkInteraction above answers only when the child stands on one precise tile
// facing one precise way. A tile short, or a facing left over from walking, and
// either nothing happens (#17) or the thing next to it answers (#18).
//
// resolveInteraction widens the reach in fixed steps, nearest intent first. The
// part that keeps #18 fixed rather than traded away is the refusal to guess:
// two different things equally in reach means silence, never a coin flip.
export const REACH = {
  OWN: 0,       // the tile the child is standing on
  FACED: 1,     // one ahead — what checkInteraction already did, unchanged
  AHEAD2: 2,    // two ahead, straight on
  SIDE: 3,      // one to the left or right of the child, never behind
  DIAGONAL: 4,  // the two tiles flanking the faced one
};

// Multi-tile items (a console drawn across two tiles) are ONE candidate, not
// two — otherwise an item could tie with itself and silence the turn.
const tilesOf = (item) => (
  item.tiles && item.tiles.length ? item.tiles : [{ col: item.col, row: item.row }]
);

/** The direction pointing from the player at an adjacent tile. */
export function dirTowardsTile(player, tile) {
  if (tile.row < player.row) return DIR.UP;
  if (tile.row > player.row) return DIR.DOWN;
  if (tile.col < player.col) return DIR.LEFT;
  return DIR.RIGHT;
}

/**
 * Work out what the player means to act on.
 *
 * @param {Object} player - { col, row, dir }
 * @param {Array} interactables - [{ col, row } | { tiles: [{col,row}] }, ...]
 * @param {Function} [isEligible] - item => boolean. Anything with nothing left
 *   to do must be filtered here, not afterwards: an already-finished item
 *   underfoot would otherwise win REACH.OWN and swallow the child's turn.
 * @param {number[]} [reachOrder] - Optional intent order for this object type.
 * @returns {{item: Object, tile: Object, reach: number}|null} null when nothing is in reach,
 *   and also when two different things are equally in reach (chosen silence).
 */
export function resolveInteraction(
  player,
  interactables,
  isEligible = null,
  reachOrder = [REACH.OWN, REACH.FACED, REACH.AHEAD2, REACH.SIDE, REACH.DIAGONAL],
) {
  const items = isEligible ? interactables.filter(isEligible) : interactables;
  if (!items.length) return null;

  const off = DIR_OFFSETS[player.dir];
  const faced = { col: player.col + off.dx, row: player.row + off.dy };
  // Perpendicular to the facing axis, so the tile behind is never a candidate.
  const perp = off.dx !== 0 ? { dx: 0, dy: 1 } : { dx: 1, dy: 0 };

  const zones = new Map([
    [REACH.OWN, [{ col: player.col, row: player.row }]],
    [REACH.FACED, [faced]],
    [REACH.AHEAD2, [{ col: player.col + off.dx * 2, row: player.row + off.dy * 2 }]],
    [REACH.SIDE, [
      { col: player.col - perp.dx, row: player.row - perp.dy },
      { col: player.col + perp.dx, row: player.row + perp.dy },
    ]],
    [REACH.DIAGONAL, [
      { col: faced.col - perp.dx, row: faced.row - perp.dy },
      { col: faced.col + perp.dx, row: faced.row + perp.dy },
    ]],
  ]);

  for (const reach of reachOrder) {
    const zone = zones.get(reach);
    if (!zone) continue;
    const found = items.flatMap((item) => {
      const tile = tilesOf(item).find(
        (candidate) => zone.some(
          (position) => position.col === candidate.col && position.row === candidate.row,
        ),
      );
      return tile ? [{ item, tile }] : [];
    });
    if (found.length === 1) return { ...found[0], reach };
    if (found.length > 1) return null; // ambiguous: say nothing rather than guess
  }
  return null;
}

/**
 * Find nearest walkable tile from a given position (BFS).
 * Used for bounce-back landing — never lands on wall/counter.
 */
export function findNearestWalkable(roomMap, col, row, isWalkableFn) {
  // Try the tile itself first
  if (isWalkableFn(col, row)) return { col, row };

  // BFS outward
  const visited = new Set();
  const queue = [{ col, row }];
  visited.add(`${col},${row}`);

  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nc = cur.col + dx;
      const nr = cur.row + dy;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (isWalkableFn(nc, nr)) return { col: nc, row: nr };
      queue.push({ col: nc, row: nr });
    }
  }
  return { col, row }; // fallback
}

/**
 * Find nearest walkable tile that is NOT already occupied by a floor item.
 * Prevents bounced items from stacking on the same tile.
 */
export function findNearestEmptyWalkable(roomMap, col, row, isWalkableFn, occupiedItems) {
  const occupied = new Set(occupiedItems.map(i => `${i.col},${i.row}`));

  const isValid = (c, r) => isWalkableFn(c, r) && !occupied.has(`${c},${r}`);

  if (isValid(col, row)) return { col, row };

  const visited = new Set();
  const queue = [{ col, row }];
  visited.add(`${col},${row}`);

  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nc = cur.col + dx;
      const nr = cur.row + dy;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (isValid(nc, nr)) return { col: nc, row: nr };
      if (isWalkableFn(nc, nr)) queue.push({ col: nc, row: nr });
    }
  }
  return { col, row };
}

export { TILE_SIZE, MOVE_DURATION };
