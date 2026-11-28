import { afterEach, describe, expect, it, vi } from 'vitest';

const EMPTY_MISSIONS = {
  growing: [],
  local: [],
  foodwaste: [],
  circular: [],
};

function missions(total) {
  let remaining = total;
  return Object.fromEntries(Object.keys(EMPTY_MISSIONS).map((island) => {
    const completed = Math.min(3, remaining);
    remaining -= completed;
    return [island, [1, 2, 3].slice(0, completed)];
  }));
}

async function hydrateSameVersion(snapshot) {
  const values = new Map([
    ['playfood-storage', JSON.stringify({ state: snapshot, version: 1 })],
  ]);
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = { localStorage };
  vi.resetModules();
  const { default: store } = await import('./gameStore.js');
  return store;
}

afterEach(() => {
  vi.resetModules();
  delete globalThis.window;
});

describe('gameStore persisted hydration', () => {
  it.each([
    ['malformed', 'broken'],
    ['missing', undefined],
  ])('normalizes a %s same-version tier from completed missions', async (_case, boatTier) => {
    const store = await hydrateSameVersion({
      points: 321,
      boatTier,
      completedMissions: missions(9),
      redeemedCodes: ['SAVEIT'],
      lighthouseGoldSeen: ['growing'],
    });

    expect(store.getState()).toMatchObject({
      points: 321,
      boatTier: 2,
      redeemedCodes: ['SAVEIT'],
      lighthouseGoldSeen: ['growing'],
    });
    expect(store.getState().getBoatCapacity()).toBe(8);
    expect(store.getState().purchaseBoatTier).toBeTypeOf('function');
    expect(store.getState().language).toBe('en');
  });

  it('preserves a valid same-version tier instead of deriving a replacement', async () => {
    const store = await hydrateSameVersion({
      points: 75,
      boatTier: 3,
      completedMissions: EMPTY_MISSIONS,
    });

    expect(store.getState()).toMatchObject({ points: 75, boatTier: 3 });
    expect(store.getState().getBoatCapacity()).toBe(12);
  });

  it('hydrates unrecycled trash cargo so an interrupted trip can continue', async () => {
    const store = await hydrateSameVersion({
      boatTier: 1,
      trashCargo: 4,
      completedMissions: EMPTY_MISSIONS,
    });

    expect(store.getState().trashCargo).toBe(4);
    expect(store.getState().setTrashCargo).toBeTypeOf('function');
  });
});
