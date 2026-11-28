import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initAnalytics, __resetForTests } from '../utils/analytics.js';
import useGameStore from '../store/gameStore.js';
import {
  createCompletionHandler,
  resolveCompletionStars,
} from './GameScreen.jsx';

const reset = () => useGameStore.getState().resetProgress();

function completionFor({ island = 'growing', mission = 'GardenPlanner', missionId = 1 } = {}) {
  const navigation = [];
  const state = useGameStore.getState();
  const complete = createCompletionHandler({
    island,
    mission,
    missionId,
    activeRoundSeed: null,
    startedAtRef: { current: Date.now() },
    finishedRef: { current: false },
    attemptIdRef: { current: 'attempt0001' },
    addCompletedMission: state.addCompletedMission,
    addPoints: state.addPoints,
    recordStars: state.recordStars,
    onNavigate: (...args) => navigation.push(args),
  });

  return { complete, navigation };
}

describe('resolveCompletionStars', () => {
  it.each([
    [{ passed: true, tier: 'perfect' }, 3],
    [{ passed: true, tier: 'excellent' }, 2],
    [{ passed: true, tier: 'great' }, 2],
    [{ passed: true, tier: 'pass' }, 1],
    [{ passed: false, tier: 'perfect' }, 0],
    [{ passed: true, tier: 'unknown' }, 0],
    [{ passed: true, stars: 8 }, 3],
    [{ passed: true, stars: -2 }, 0],
  ])('normalizes %o to %i stars', (completion, expectedStars) => {
    expect(resolveCompletionStars(completion)).toBe(expectedStars);
  });
});

describe('GameScreen completion economy', () => {
  beforeEach(reset);

  it.each([true, false])('records explicit passed=%s independently of stars and ignores duplicate callbacks', async (passed) => {
    __resetForTests();
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ tracking: true }) })));
    try {
      await initAnalytics('el');
      globalThis.fetch.mockClear();
      const { complete } = completionFor();
      complete(20, passed, { stars: 2 });
      complete(20, passed, { stars: 2 });
      expect(globalThis.fetch.mock.calls).toHaveLength(1);
      expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toMatchObject({type: 'game_finish', attempt_id: 'attempt0001', passed});
    } finally {
      vi.unstubAllGlobals();
      __resetForTests();
    }
  });

  it('keeps a historical three-star result when a later run earns one star', () => {
    completionFor().complete(20, true, { stars: 3 });
    const replay = completionFor();
    replay.complete(20, true, { tier: 'pass' });

    expect(useGameStore.getState().gameStars['growing:GardenPlanner']).toBe(3);
    expect(replay.navigation).toEqual([
      ['result', expect.objectContaining({ stars: 1 })],
    ]);
  });

  it('adds points for each completed replay', () => {
    completionFor().complete(20, true, { tier: 'pass' });
    completionFor().complete(20, true, { tier: 'pass' });

    expect(useGameStore.getState().points).toBe(40);
  });

  it('accepts a duplicate completion callback only once per mounted game', () => {
    const { complete, navigation } = completionFor();

    complete(20, true, { stars: 2 });
    complete(20, true, { stars: 3 });

    expect(useGameStore.getState()).toMatchObject({
      points: 20,
      completedMissions: { growing: [1] },
      gameStars: { 'growing:GardenPlanner': 2 },
    });
    expect(navigation).toHaveLength(1);
  });
});
