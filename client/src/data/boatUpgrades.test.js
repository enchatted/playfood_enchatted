import { describe, expect, it } from 'vitest';
import {
  BOAT_UPGRADES,
  getBoatUpgrade,
  getBoatCapacityForTier,
  normalizeBoatTier,
  legacyBoatTierForCompletedMissions,
  getBoatCardState,
} from './boatUpgrades.js';

const missions = (total) => {
  const slugs = ['growing', 'local', 'foodwaste', 'circular'];
  let remaining = total;
  return Object.fromEntries(slugs.map((slug) => {
    const count = Math.min(3, remaining);
    remaining -= count;
    return [slug, [1, 2, 3].slice(0, count)];
  }));
};

describe('boat upgrade catalogue', () => {
  it('contains the five approved tiers in order', () => {
    expect(BOAT_UPGRADES.map(({ tier, id, capacity, price }) => ({ tier, id, capacity, price })))
      .toEqual([
        { tier: 0, id: 'starter', capacity: 3, price: 0 },
        { tier: 1, id: 'sailboat', capacity: 5, price: 150 },
        { tier: 2, id: 'cleanup', capacity: 8, price: 500 },
        { tier: 3, id: 'eco', capacity: 12, price: 1000 },
        { tier: 4, id: 'guardian', capacity: 18, price: 3000 },
      ]);
  });

  it.each([[0, 3], [1, 5], [2, 8], [3, 12], [4, 18]])(
    'maps tier %i to capacity %i',
    (tier, capacity) => expect(getBoatCapacityForTier(tier)).toBe(capacity),
  );

  it.each([[0, 0], [2, 0], [3, 1], [8, 1], [9, 2], [11, 2], [12, 3]])(
    'migrates %i completed missions to tier %i',
    (total, tier) => expect(legacyBoatTierForCompletedMissions(missions(total))).toBe(tier),
  );

  it('normalizes malformed tiers through the legacy migration', () => {
    expect(normalizeBoatTier(2, missions(0))).toBe(2);
    expect(normalizeBoatTier('2', missions(9))).toBe(2);
    expect(normalizeBoatTier(4, missions(0))).toBe(4);
    expect(normalizeBoatTier(8, missions(3))).toBe(1);
    expect(normalizeBoatTier(undefined, missions(12))).toBe(3);
    expect(normalizeBoatTier(null, missions(12))).toBe(3);
  });

  it('distinguishes owned, current, next affordable, next unaffordable and prerequisite cards', () => {
    expect(getBoatCardState({ targetTier: 1, currentTier: 1, points: 1000 })).toBe('current');
    expect(getBoatCardState({ targetTier: 0, currentTier: 1, points: 1000 })).toBe('inactive');
    expect(getBoatCardState({ targetTier: 3, currentTier: 2, points: 1000 })).toBe('available');
    expect(getBoatCardState({ targetTier: 3, currentTier: 2, points: 999 })).toBe('locked');
    expect(getBoatCardState({ targetTier: 4, currentTier: 2, points: 5000 })).toBe('prerequisite');
    expect(getBoatCardState({ targetTier: 9, currentTier: 0, points: 9999 })).toBeNull();
  });

  it('unlocks the Ocean Guardian at the exact 3000-coin boundary', () => {
    expect(getBoatCardState({ targetTier: 4, currentTier: 3, points: 2999 })).toBe('locked');
    expect(getBoatCardState({ targetTier: 4, currentTier: 3, points: 3000 })).toBe('available');
  });
});
