import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../utils/analytics.js', () => ({ track: vi.fn() }));
import useGameStore from './gameStore.js';
import { track } from '../utils/analytics.js';
import { HERO_IDS, HEROES, getHero } from '../overworld/heroes.js';

const reset = () => useGameStore.getState().resetProgress();

describe('gameStore 4×3 structure', () => {
  beforeEach(reset);

  it('tracks the four new island slugs', () => {
    const cm = useGameStore.getState().completedMissions;
    expect(Object.keys(cm).sort()).toEqual(['circular', 'foodwaste', 'growing', 'local']);
  });

  it('awards the full-island bonus at 3 missions (not 4)', () => {
    const { addCompletedMission } = useGameStore.getState();
    addCompletedMission('growing', 1);
    addCompletedMission('growing', 2);
    expect(useGameStore.getState().points).toBe(0);     // not yet
    addCompletedMission('growing', 3);
    expect(useGameStore.getState().points).toBe(100);   // bonus at 3
  });

  it('uses the explicit tier for boat capacity', () => {
    useGameStore.setState({ boatTier: 3 });
    expect(useGameStore.getState().getBoatCapacity()).toBe(12);
  });
});

describe('boat upgrades', () => {
  beforeEach(reset);

  it('starts with the free 3-item boat', () => {
    const store = useGameStore.getState();
    expect(store.boatTier).toBe(0);
    expect(store.getBoatCapacity()).toBe(3);
  });

  it('buys every tier sequentially and deducts each fixed price once', () => {
    useGameStore.setState({ points: 4650, boatTier: 0 });

    expect(useGameStore.getState().purchaseBoatTier(1))
      .toEqual({ success: true, tier: 1, capacity: 5, price: 150 });
    expect(useGameStore.getState().purchaseBoatTier(2))
      .toEqual({ success: true, tier: 2, capacity: 8, price: 500 });
    expect(useGameStore.getState().purchaseBoatTier(3))
      .toEqual({ success: true, tier: 3, capacity: 12, price: 1000 });
    expect(useGameStore.getState().purchaseBoatTier(4))
      .toEqual({ success: true, tier: 4, capacity: 18, price: 3000 });

    expect(useGameStore.getState()).toMatchObject({ points: 0, boatTier: 4 });
    expect(useGameStore.getState().getBoatCapacity()).toBe(18);
    expect(useGameStore.getState().purchaseBoatTier(4))
      .toEqual({ success: false, reason: 'current_or_lower' });
  });

  it('requires the immediately previous tier before checking affordability', () => {
    useGameStore.setState({ points: 5000, boatTier: 2 });

    expect(useGameStore.getState().purchaseBoatTier(4)).toEqual({
      success: false,
      reason: 'prerequisite_required',
      requiredTier: 3,
    });
    expect(useGameStore.getState()).toMatchObject({ points: 5000, boatTier: 2 });

    useGameStore.setState({ points: 4999 });
    expect(useGameStore.getState().purchaseBoatTier(4)).toEqual({
      success: false,
      reason: 'prerequisite_required',
      requiredTier: 3,
    });
    expect(useGameStore.getState()).toMatchObject({ points: 4999, boatTier: 2 });
  });

  it('rejects invalid, lower and unaffordable purchases without mutation', () => {
    useGameStore.setState({ points: 499, boatTier: 1 });
    const before = { points: 499, boatTier: 1 };

    expect(useGameStore.getState().purchaseBoatTier(9)).toEqual({ success: false, reason: 'invalid_tier' });
    expect(useGameStore.getState().purchaseBoatTier(0)).toEqual({ success: false, reason: 'current_or_lower' });
    expect(useGameStore.getState().purchaseBoatTier(2)).toEqual({ success: false, reason: 'insufficient_points' });
    expect(useGameStore.getState()).toMatchObject(before);
  });

  it('restores an explicit tier and migrates an old mission-derived save', () => {
    useGameStore.getState().restoreProgress({
      boatTier: 2,
      completedMissions: { growing: [], local: [], foodwaste: [], circular: [] },
    });
    expect(useGameStore.getState().boatTier).toBe(2);

    useGameStore.getState().restoreProgress({
      boatTier: 4,
      completedMissions: { growing: [], local: [], foodwaste: [], circular: [] },
    });
    expect(useGameStore.getState().boatTier).toBe(4);
    expect(useGameStore.getState().getBoatCapacity()).toBe(18);

    useGameStore.getState().restoreProgress({
      completedMissions: { growing: [1, 2, 3], local: [1, 2, 3], foodwaste: [1, 2, 3], circular: [] },
    });
    expect(useGameStore.getState().boatTier).toBe(2);
  });

  it('resets to tier 0 and makes debug completion explicit tier 3', () => {
    useGameStore.setState({ boatTier: 3 });
    useGameStore.getState().resetProgress();
    expect(useGameStore.getState().boatTier).toBe(0);
    useGameStore.getState().debugCompleteAll();
    expect(useGameStore.getState().boatTier).toBe(3);
  });
});

describe('boat trash cargo', () => {
  beforeEach(reset);

  it('keeps the current cargo in shared state until recycling resets it', () => {
    const store = useGameStore.getState();

    expect(store.trashCargo).toBe(0);
    expect(store.setTrashCargo).toBeTypeOf('function');
    store.setTrashCargo?.(2);
    expect(useGameStore.getState().trashCargo).toBe(2);

    useGameStore.getState().resetProgress();
    expect(useGameStore.getState().trashCargo).toBe(0);
  });
});

describe('island ceremony', () => {
  beforeEach(reset);

  it('starts with no ceremonies seen', () => {
    expect(useGameStore.getState().ceremoniesSeen).toEqual([]);
  });

  it('markCeremonySeen records each island once (idempotent)', () => {
    const { markCeremonySeen } = useGameStore.getState();
    markCeremonySeen('growing');
    markCeremonySeen('growing');
    expect(useGameStore.getState().ceremoniesSeen).toEqual(['growing']);
  });

  it('resetProgress clears seen ceremonies (progress, not identity)', () => {
    useGameStore.getState().markCeremonySeen('growing');
    useGameStore.getState().resetProgress();
    expect(useGameStore.getState().ceremoniesSeen).toEqual([]);
  });

  it('restoreProgress restores ceremoniesSeen and defaults to []', () => {
    useGameStore.getState().restoreProgress({ ceremoniesSeen: ['growing'] });
    expect(useGameStore.getState().ceremoniesSeen).toEqual(['growing']);
    useGameStore.getState().restoreProgress({});
    expect(useGameStore.getState().ceremoniesSeen).toEqual([]);
  });
});

describe('first-try stars — WhereDoesItGrow / Phase 1', () => {
  beforeEach(reset);

  it('starts with no stars recorded', () => {
    expect(useGameStore.getState().gameStars).toEqual({});
  });

  it('recordStars keeps the best (max) per game, never downgrades', () => {
    const { recordStars } = useGameStore.getState();
    recordStars('growing:WhereDoesItGrow', 2);
    expect(useGameStore.getState().gameStars['growing:WhereDoesItGrow']).toBe(2);
    recordStars('growing:WhereDoesItGrow', 3); // a better run climbs
    expect(useGameStore.getState().gameStars['growing:WhereDoesItGrow']).toBe(3);
    recordStars('growing:WhereDoesItGrow', 1); // a worse run does not drop it
    expect(useGameStore.getState().gameStars['growing:WhereDoesItGrow']).toBe(3);
  });

  it('resetProgress clears stars; restoreProgress round-trips them and defaults to {}', () => {
    useGameStore.getState().recordStars('growing:WhereDoesItGrow', 3);
    useGameStore.getState().resetProgress();
    expect(useGameStore.getState().gameStars).toEqual({});
    useGameStore.getState().restoreProgress({ gameStars: { 'growing:WhereDoesItGrow': 2 } });
    expect(useGameStore.getState().gameStars).toEqual({ 'growing:WhereDoesItGrow': 2 });
    useGameStore.getState().restoreProgress({});
    expect(useGameStore.getState().gameStars).toEqual({});
  });
});

describe('island reflection prompt — Kolb-cycle reflection pilot', () => {
  beforeEach(reset);

  it('markReflectionSeen records each island once (idempotent)', () => {
    const { markReflectionSeen } = useGameStore.getState();
    markReflectionSeen('local');
    markReflectionSeen('local');
    expect(useGameStore.getState().reflectionsSeen).toEqual(['local']);
  });

  it('resetProgress clears seen reflections; restoreProgress round-trips them', () => {
    useGameStore.getState().markReflectionSeen('local');
    useGameStore.getState().resetProgress();
    expect(useGameStore.getState().reflectionsSeen).toEqual([]);
    useGameStore.getState().restoreProgress({ reflectionsSeen: ['local'] });
    expect(useGameStore.getState().reflectionsSeen).toEqual(['local']);
  });
});

describe('hero select', () => {
  it('ships 4 heroes: 2 girls (pigtails, braid) + 2 boys (short, bob)', () => {
    expect(HERO_IDS).toEqual(['pigtails', 'braid', 'short', 'bob']);
    // Four distinct skin tones (inclusive beyond gender)
    expect(new Set(HEROES.map((h) => h.skin)).size).toBe(4);
    // No pink outfits — gender must read from silhouette
    for (const h of HEROES) {
      expect(h.shirt.toUpperCase()).not.toBe('#E5BDD1');
    }
  });

  it('starts with no hero until the player picks one (avatar ceremony)', () => {
    // A new save has no hero until the player chooses one.
    expect(useGameStore.getState().heroId).toBeNull();
  });

  it('setHero switches hero and ignores unknown ids', () => {
    useGameStore.getState().setHero('braid');
    expect(useGameStore.getState().heroId).toBe('braid');
    useGameStore.getState().setHero('not-a-hero');
    expect(useGameStore.getState().heroId).toBe('braid');
  });

  it('setHero records one hero_chosen per real choice, never for unknown ids', () => {
    track.mockClear();
    useGameStore.getState().setHero('bob');
    useGameStore.getState().setHero('not-a-hero');
    expect(track.mock.calls).toEqual([['hero_chosen', { hero: 'bob' }]]);
  });

  it('getHero falls back to the first hero for unknown ids', () => {
    expect(getHero('braid').id).toBe('braid');
    expect(getHero(null).id).toBe(HERO_IDS[0]);
  });

  it('resetProgress keeps the chosen hero (identity is not progress)', () => {
    useGameStore.getState().setHero('short');
    useGameStore.getState().resetProgress();
    expect(useGameStore.getState().heroId).toBe('short');
  });
});

describe('restoreProgress — heroId (client Play Code)', () => {
  it('restores a valid heroId carried in the code', () => {
    useGameStore.getState().restoreProgress({ heroId: 'braid', points: 10 });
    expect(useGameStore.getState().heroId).toBe('braid');
  });

  it('rejects an invalid heroId, falling back to null', () => {
    useGameStore.getState().setHero('pigtails');
    useGameStore.getState().restoreProgress({ heroId: 'not-a-hero' });
    expect(useGameStore.getState().heroId).toBeNull();
  });
});

describe('lighthouse onboarding', () => {
  beforeEach(reset);

  it('is shown once, then remains seen until progress is reset', () => {
    const store = useGameStore.getState();

    expect(store.lighthouseOnboardingSeen).toBe(false);
    expect(store.markLighthouseOnboardingSeen).toBeTypeOf('function');

    store.markLighthouseOnboardingSeen();
    expect(useGameStore.getState().lighthouseOnboardingSeen).toBe(true);

    useGameStore.getState().resetProgress();
    expect(useGameStore.getState().lighthouseOnboardingSeen).toBe(false);
  });

  it('shows the onboarding again when progress is restored on a new device', () => {
    useGameStore.setState({ lighthouseOnboardingSeen: true });
    useGameStore.getState().restoreProgress({ points: 20 });

    expect(useGameStore.getState().lighthouseOnboardingSeen).toBe(false);
  });
});

describe('phygital code redemption', () => {
  beforeEach(reset);
  afterEach(() => vi.unstubAllGlobals());

  it('awards server-configured points and remembers stable ID rather than typed code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, id: 'GARDEN_DAY', points: 75, island: 'growing', description: 'Care for a plant' }) })));
    expect(await useGameStore.getState().redeemCode('newcode')).toMatchObject({ success: true, points: 75, description: 'Care for a plant' });
    expect(useGameStore.getState().points).toBe(75);
    expect(useGameStore.getState().redeemedCodes).toEqual(['GARDEN_DAY']);
    expect(await useGameStore.getState().redeemCode('changedcode')).toEqual({ success: false, reason: 'already_redeemed' });
    expect(useGameStore.getState().points).toBe(75);
  });

  it('reports an accepted redemption to the statistics panel once, by activity id', async () => {
    track.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, id: 'GARDEN_DAY', points: 75, island: 'growing' }) })));
    await useGameStore.getState().redeemCode('newcode');
    await useGameStore.getState().redeemCode('changedcode'); // already redeemed: nothing new to report
    expect(track.mock.calls.filter(([type]) => type === 'phygital_redeem')).toEqual([['phygital_redeem', { activity: 'GARDEN_DAY' }]]);
  });

  it('does not fall back to hardcoded rewards when offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await useGameStore.getState().redeemCode('SAVEIT')).toEqual({ success: false, reason: 'unavailable' });
    expect(useGameStore.getState().points).toBe(0);
  });

  it('concurrent replies cannot award twice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, id: 'SAVEIT', points: 50, island: 'foodwaste' }) })));
    const results = await Promise.all([useGameStore.getState().redeemCode('SAVEIT'), useGameStore.getState().redeemCode('SAVEIT')]);
    expect(results.filter(r => r.success)).toHaveLength(1);
    expect(useGameStore.getState().points).toBe(50);
  });

  it('does not award a response after progress was reset', async () => {
    let resolve;
    vi.stubGlobal('fetch', () => new Promise(done => { resolve = done; }));
    const pending = useGameStore.getState().redeemCode('SAVEIT');
    reset();
    resolve({ ok: true, json: async () => ({ success: true, id: 'SAVEIT', points: 50 }) });
    expect((await pending).success).toBe(false);
    expect(useGameStore.getState().points).toBe(0);
    expect(useGameStore.getState().redeemedCodes).toEqual([]);
  });

  it.each([-1, 1.5, 1001, null, '50'])('rejects malformed server points %s', async (points) => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ success: true, id: 'SAVEIT', points }) }));
    expect((await useGameStore.getState().redeemCode('SAVEIT')).success).toBe(false);
    expect(useGameStore.getState().points).toBe(0);
  });

  it('accepts a zero-point activity once and rejects server-denied codes', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ success: true, id: 'CLASS_DAY', points: 0 }) }));
    expect((await useGameStore.getState().redeemCode('CLASS')).success).toBe(true);
    expect(useGameStore.getState().redeemedCodes).toEqual(['CLASS_DAY']);
    vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => ({ success: false, reason: 'invalid_code' }) }));
    expect((await useGameStore.getState().redeemCode('BAD')).reason).toBe('invalid_code');
    expect(useGameStore.getState().points).toBe(0);
  });
});
