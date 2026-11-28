// lighthouseData.test.js
import { describe, it, expect } from 'vitest';
import {
  LIGHTHOUSE_COLS, LIGHTHOUSE_ROWS, LIGHTHOUSE_MAP, LIGHTHOUSE_PLAYER_START,
  LIGHTHOUSE_STATIONS, LIGHTHOUSE_MENTOR, LIGHTHOUSE_SHIPYARD_FOOTPRINT,
  DECOR_OCCUPIED, isLighthouseWalkable, isFacingLighthouseShipyard,
  buildTrophyState, nextIslandToTackle, pendingGoldCeremonies,
} from './lighthouseData.js';
import { TILE } from './tileAtlas.js';
import { DIR } from './overworldData.js';

function reachable(fromC, fromR) {
  const seen = new Set([`${fromC},${fromR}`]);
  const q = [[fromC, fromR]];
  while (q.length) {
    const [c, r] = q.shift();
    for (const [dc, dr] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const nc = c + dc, nr = r + dr, k = `${nc},${nr}`;
      if (!seen.has(k) && isLighthouseWalkable(nc, nr)) { seen.add(k); q.push([nc, nr]); }
    }
  }
  return seen;
}

describe('lighthouseData — geometry', () => {
  it('map is 15×20', () => {
    expect(LIGHTHOUSE_MAP).toHaveLength(LIGHTHOUSE_ROWS);
    LIGHTHOUSE_MAP.forEach((row) => expect(row).toHaveLength(LIGHTHOUSE_COLS));
  });
  it('player start is walkable', () => {
    expect(isLighthouseWalkable(LIGHTHOUSE_PLAYER_START.col, LIGHTHOUSE_PLAYER_START.row)).toBe(true);
  });
  it('every station + mentor is adjacent to a walkable tile reachable from start', () => {
    const seen = reachable(LIGHTHOUSE_PLAYER_START.col, LIGHTHOUSE_PLAYER_START.row);
    const targets = [
      ...LIGHTHOUSE_STATIONS.plinths,
      LIGHTHOUSE_STATIONS.lamp, LIGHTHOUSE_STATIONS.compass,
      LIGHTHOUSE_STATIONS.qr,
      LIGHTHOUSE_STATIONS.bookshelf,
      LIGHTHOUSE_MENTOR,
    ];
    for (const t of targets) {
      const standable = [[0,1],[0,-1],[1,0],[-1,0]].some(([dc,dr]) => seen.has(`${t.col+dc},${t.row+dr}`));
      expect(standable, `station ${t.island||'?'} @${t.col},${t.row} reachable`).toBe(true);
    }
  });
  it('the hero portrait station was removed (right wall left clean)', () => {
    expect(LIGHTHOUSE_STATIONS.hero).toBeUndefined();
  });
  it('reading-nook decor sits bottom-right (cols 13-16) and blocks movement there', () => {
    for (const d of DECOR_OCCUPIED) {
      expect(d.col, `decor col @${d.col},${d.row}`).toBeGreaterThanOrEqual(13);
      expect(d.col, `decor col @${d.col},${d.row}`).toBeLessThanOrEqual(16);
      expect(isLighthouseWalkable(d.col, d.row), `decor blocks @${d.col},${d.row}`).toBe(false);
    }
    // the postbox's left approach tile must stay walkable so it remains reachable
    expect(isLighthouseWalkable(16, 13)).toBe(true);
  });
  it('blocks the full 2×4 bookshelf footprint while keeping its front approach open', () => {
    const bookshelfTiles = [
      [1, 7], [2, 7],
      [1, 8], [2, 8],
      [1, 9], [2, 9],
      [1, 10], [2, 10],
    ];

    for (const [col, row] of bookshelfTiles) {
      expect(isLighthouseWalkable(col, row), `bookshelf blocks @${col},${row}`).toBe(false);
    }
    expect(isLighthouseWalkable(2, 11), 'front approach remains walkable').toBe(true);
  });
  it('places a solid 3×2 shipyard at the approved lower-left position', () => {
    expect(LIGHTHOUSE_SHIPYARD_FOOTPRINT).toEqual({ leftCol: 4, topRow: 11, cols: 3, rows: 2 });
    for (let row = 11; row <= 12; row += 1) {
      for (let col = 4; col <= 6; col += 1) {
        expect(isLighthouseWalkable(col, row), `shipyard blocks @${col},${row}`).toBe(false);
      }
    }
  });
  it('keeps the lower interaction edge reachable and face-adjacent', () => {
    const seen = reachable(LIGHTHOUSE_PLAYER_START.col, LIGHTHOUSE_PLAYER_START.row);
    for (const col of [4, 5, 6]) expect(seen.has(`${col},13`)).toBe(true);
    expect(isFacingLighthouseShipyard({ col: 5, row: 13, dir: DIR.UP })).toBe(true);
    expect(isFacingLighthouseShipyard({ col: 7, row: 12, dir: DIR.LEFT })).toBe(true);
    expect(isFacingLighthouseShipyard({ col: 5, row: 10, dir: DIR.DOWN })).toBe(true);
    expect(isFacingLighthouseShipyard({ col: 8, row: 12, dir: DIR.LEFT })).toBe(false);
  });
  it('out-of-bounds is not walkable', () => {
    expect(isLighthouseWalkable(-1, 0)).toBe(false);
    expect(isLighthouseWalkable(LIGHTHOUSE_COLS, 0)).toBe(false);
  });
  it('player does NOT start on the exit mat (no instant-leave on first Enter)', () => {
    const { col, row } = LIGHTHOUSE_PLAYER_START;
    expect(LIGHTHOUSE_MAP[row][col]).not.toBe(TILE.EXIT_MAT);
  });
  it('an exit mat exists and is reachable from the player start', () => {
    const seen = reachable(LIGHTHOUSE_PLAYER_START.col, LIGHTHOUSE_PLAYER_START.row);
    let reachableExit = false;
    for (let r = 0; r < LIGHTHOUSE_ROWS; r++) {
      for (let c = 0; c < LIGHTHOUSE_COLS; c++) {
        if (LIGHTHOUSE_MAP[r][c] === TILE.EXIT_MAT && seen.has(`${c},${r}`)) reachableExit = true;
      }
    }
    expect(reachableExit).toBe(true);
  });
});

const EMPTY = { completedMissions:{growing:[],local:[],foodwaste:[],circular:[]}, points:0,
  redeemedCodes:[] };
describe('buildTrophyState', () => {
  it('empty store → nothing lit', () => {
    const t = buildTrophyState(EMPTY);
    expect(t.islands.growing).toEqual({ done:false, count:0 });
    expect(t.points).toBe(0); expect(t.codes).toBe(0); expect(t.stars).toBe(0);
  });
  it('maps real progress', () => {
    const t = buildTrophyState({ ...EMPTY, completedMissions:{growing:[1,2,3],local:[1],foodwaste:[],circular:[]},
      points:740, redeemedCodes:['SAVEIT'] });
    expect(t.islands.growing).toEqual({ done:true, count:3 });
    expect(t.islands.local).toEqual({ done:false, count:1 });
    expect(t.points).toBe(740); expect(t.codes).toBe(1);
  });
  it('sums accumulated minigame stars from gameStars', () => {
    const t = buildTrophyState({ ...EMPTY,
      gameStars: { 'growing:WhereDoesItGrow': 3, 'local:SeasonMatcher': 2, 'foodwaste:FridgeManager': 0 } });
    expect(t.stars).toBe(5);
  });
  it('defaults stars to 0 when gameStars is missing', () => {
    expect(buildTrophyState({ points: 10 }).stars).toBe(0);
  });
});

describe('pendingGoldCeremonies', () => {
  const trophy = (done, partial) => ({
    islands: {
      growing:   { done: done.includes('growing'),   count: done.includes('growing')   ? 3 : (partial.includes('growing')   ? 1 : 0) },
      local:     { done: done.includes('local'),     count: done.includes('local')     ? 3 : (partial.includes('local')     ? 1 : 0) },
      foodwaste: { done: done.includes('foodwaste'), count: done.includes('foodwaste') ? 3 : (partial.includes('foodwaste') ? 1 : 0) },
      circular:  { done: done.includes('circular'),  count: done.includes('circular')  ? 3 : (partial.includes('circular')  ? 1 : 0) },
    },
  });

  it('empty seen + 1 done → returns that island', () => {
    expect(pendingGoldCeremonies(trophy(['growing'], []), [])).toEqual(['growing']);
  });
  it('already-seen island → not returned', () => {
    expect(pendingGoldCeremonies(trophy(['growing'], []), ['growing'])).toEqual([]);
  });
  it('2 done, 1 seen → returns only the unseen one', () => {
    const result = pendingGoldCeremonies(trophy(['growing', 'local'], []), ['growing']);
    expect(result).toEqual(['local']);
  });
  it('nothing done → empty', () => {
    expect(pendingGoldCeremonies(trophy([], ['growing']), [])).toEqual([]);
  });
  it('all done, all seen → empty', () => {
    const t = trophy(['growing', 'local', 'foodwaste', 'circular'], []);
    expect(pendingGoldCeremonies(t, ['growing', 'local', 'foodwaste', 'circular'])).toEqual([]);
  });
  it('null-safe on undefined trophy', () => {
    expect(pendingGoldCeremonies(undefined, [])).toEqual([]);
  });
});

describe('nextIslandToTackle', () => {
  const t = (g, l, f, c) => ({ islands: {
    growing:{ done:g===3, count:g }, local:{ done:l===3, count:l },
    foodwaste:{ done:f===3, count:f }, circular:{ done:c===3, count:c },
  }});
  it('fresh save → growing (first canonical, all 0)', () => {
    expect(nextIslandToTackle(t(0,0,0,0))).toBe('growing');
  });
  it('points at the unfinished island closest to its trophy', () => {
    // growing done, local 2/3, foodwaste 1/3, circular 0 → local (most progress)
    expect(nextIslandToTackle(t(3,2,1,0))).toBe('local');
  });
  it('all islands done → null', () => {
    expect(nextIslandToTackle(t(3,3,3,3))).toBeNull();
  });
  it('null-safe on a missing trophy', () => {
    expect(nextIslandToTackle(undefined)).toBeNull();
  });
});
