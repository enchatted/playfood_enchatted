import { describe, it, expect } from 'vitest';
import { MISSION_MAP, ROOMS, isMissionUnlocked, isRoomWalkable } from './islandRoomData.js';
import { MISSIONS_PER_ISLAND } from './overworldData.js';

const SLUGS = ['growing', 'local', 'foodwaste', 'circular'];

describe('MISSION_MAP 4×3', () => {
  it('has exactly the 4 new island slugs', () => {
    expect(Object.keys(MISSION_MAP).sort()).toEqual([...SLUGS].sort());
  });
  it('has exactly 3 missions per island with ids 1..3', () => {
    for (const slug of SLUGS) {
      expect(MISSION_MAP[slug].map((m) => m.id)).toEqual([1, 2, 3]);
    }
  });
  it('has a room with exactly 3 NPCs per island', () => {
    for (const slug of SLUGS) {
      expect(ROOMS[slug]).toBeDefined();
      expect(ROOMS[slug].npcs).toHaveLength(3);
    }
  });
  it('tags every mission with its phase, in play order', () => {
    for (const slug of SLUGS) {
      expect(MISSION_MAP[slug].map((m) => m.phase)).toEqual(['hook', 'practice', 'challenge']);
    }
  });
  it('MISSIONS_PER_ISLAND matches the actual mission count (the 4→3 lush trap)', () => {
    // Completion visuals (evolution, water tint, ceremony) divide by this
    // constant — if it drifts from MISSION_MAP, islands never go lush again.
    expect(MISSIONS_PER_ISLAND).toBe(3);
    for (const slug of SLUGS) {
      expect(MISSION_MAP[slug]).toHaveLength(MISSIONS_PER_ISLAND);
    }
  });
});

describe('isMissionUnlocked — Hook→Practice→Challenge gating', () => {
  it('mission 1 (Hook) is always unlocked', () => {
    for (const slug of SLUGS) {
      expect(isMissionUnlocked(slug, 1, [])).toBe(true);
      expect(isMissionUnlocked(slug, 1, undefined)).toBe(true);
    }
  });
  it('mission 2 needs mission 1 done; mission 3 needs mission 2 done', () => {
    expect(isMissionUnlocked('growing', 2, [])).toBe(false);
    expect(isMissionUnlocked('growing', 2, [1])).toBe(true);
    expect(isMissionUnlocked('growing', 3, [1])).toBe(false);
    expect(isMissionUnlocked('growing', 3, [1, 2])).toBe(true);
  });
  it('gating only looks one step back (no full-chain requirement)', () => {
    // Store invariant: completion is sequential, but the helper is lenient.
    expect(isMissionUnlocked('local', 3, [2])).toBe(true);
  });
  it('a completed mission is always replayable — even from non-sequential saves', () => {
    // Pre-gating saves and ?startMission= harness runs can produce e.g. [3].
    expect(isMissionUnlocked('growing', 3, [3])).toBe(true);
    expect(isMissionUnlocked('growing', 2, [2])).toBe(true);
  });
  it('unknown island or mission id is locked', () => {
    expect(isMissionUnlocked('climate', 2, [1])).toBe(false);
    expect(isMissionUnlocked('growing', 4, [1, 2, 3])).toBe(false);
  });
});

describe('growing room reachability — vignettes stay off the paths', () => {
  // BFS over walkable tiles from the player start.
  function reachableSet(room) {
    const start = room.playerStart;
    const seen = new Set([`${start.col},${start.row}`]);
    const queue = [[start.col, start.row]];
    while (queue.length) {
      const [c, r] = queue.shift();
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nc = c + dc, nr = r + dr;
        const key = `${nc},${nr}`;
        if (!seen.has(key) && isRoomWalkable(room, nc, nr)) {
          seen.add(key);
          queue.push([nc, nr]);
        }
      }
    }
    return seen;
  }

  const room = ROOMS.growing;
  const reach = () => reachableSet(room);

  it('every mission NPC keeps at least one reachable interaction tile', () => {
    const seen = reach();
    for (const npc of room.npcs) {
      const spots = [[0, 1], [0, -1], [1, 0], [-1, 0]]
        .map(([dc, dr]) => `${npc.col + dc},${npc.row + dr}`);
      expect(spots.some((s) => seen.has(s)), `NPC missionIdx ${npc.missionIdx}`).toBe(true);
    }
  });

  it('the mentor and the exit mat remain reachable', () => {
    const seen = reach();
    const m = room.mentor;
    const mentorSpots = [[0, 1], [0, -1], [1, 0], [-1, 0]]
      .map(([dc, dr]) => `${m.col + dc},${m.row + dr}`);
    expect(mentorSpots.some((s) => seen.has(s))).toBe(true);
    expect(seen.has('9,14')).toBe(true); // exit mat
  });

  it('vignette tiles are solid and never sit on an NPC/mentor interaction tile', () => {
    const interaction = new Set();
    for (const a of [...room.npcs, room.mentor]) {
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        interaction.add(`${a.col + dc},${a.row + dr}`);
      }
    }
    for (const v of room.vignettes) {
      for (let c = v.col; c < v.col + (v.w || 1); c++) {
        expect(isRoomWalkable(room, c, v.row), `${v.type}@${c},${v.row}`).toBe(false);
        expect(interaction.has(`${c},${v.row}`), `${v.type} on interaction tile ${c},${v.row}`).toBe(false);
      }
    }
  });
});
