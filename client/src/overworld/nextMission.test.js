import { describe, it, expect } from 'vitest';
import { nextMissionId, isMissionUnlocked, MISSION_MAP } from './islandRoomData.js';

// Three things point the child at a game: the mentor's hint, the locked NPC's
// message, and the pointing hand. All three ask nextMissionId(), so these lock
// the one answer they share.

describe('nextMissionId', () => {
  it('sends a fresh player to the first game', () => {
    expect(nextMissionId('growing', [])).toBe(1);
  });

  it('never names a game that is itself locked', () => {
    // The bug this replaced: standing at the third NPC with nothing finished,
    // the room named the second game, which could not be played either.
    for (const island of Object.keys(MISSION_MAP)) {
      for (const completed of [[], [1], [1, 2]]) {
        const next = nextMissionId(island, completed);
        if (next === undefined) continue;
        expect(isMissionUnlocked(island, next, completed)).toBe(true);
      }
    }
  });

  it('walks forward as games are finished', () => {
    expect(nextMissionId('growing', [1])).toBe(2);
    expect(nextMissionId('growing', [1, 2])).toBe(3);
  });

  it('returns nothing once the island is done', () => {
    expect(nextMissionId('growing', [1, 2, 3])).toBeUndefined();
  });

  it('handles the gap left by a pre-gating save', () => {
    // Old saves and harness runs can hold non-sequential arrays like [3].
    expect(nextMissionId('growing', [3])).toBe(1);
    expect(nextMissionId('growing', [1, 3])).toBe(2);
  });

  it('is defined for every island', () => {
    for (const island of Object.keys(MISSION_MAP)) {
      expect(nextMissionId(island, [])).toBe(1);
    }
  });
});
