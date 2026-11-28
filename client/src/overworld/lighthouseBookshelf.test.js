// lighthouseBookshelf.test.js — TDD coverage for buildBookshelf + unlockedSpines.
// Citation lock: title/publisher/url values must equal SOURCES[id] verbatim.
import { describe, it, expect } from 'vitest';
import { buildBookshelf, unlockedSpines, ISLAND_SLUGS } from './lighthouseBookshelf.js';
import { SOURCES, MISSION_SOURCES } from '../data/sources.js';
import { MISSION_MAP } from './islandRoomData.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function allSpines(shelves) {
  return ISLAND_SLUGS.flatMap((i) => shelves[i] || []);
}

// ── Empty completedMissions → every spine is unlocked:false ────────────
describe('buildBookshelf — empty completedMissions', () => {
  const shelves = buildBookshelf({});

  it('returns an object with all 4 island keys', () => {
    expect(Object.keys(shelves)).toEqual(ISLAND_SLUGS);
  });

  it('all spines are locked (unlocked:false)', () => {
    for (const spine of allSpines(shelves)) {
      expect(spine.unlocked, `${spine.id} should be locked`).toBe(false);
    }
  });

  it('unlockedSpines() is empty when nothing is complete', () => {
    expect(unlockedSpines(shelves)).toHaveLength(0);
  });

  it('each shelf has at least one spine', () => {
    for (const island of ISLAND_SLUGS) {
      expect(shelves[island].length, `${island} shelf should not be empty`).toBeGreaterThan(0);
    }
  });
});

// ── Completing all growing games unlocks growing spines ────────────────
describe('buildBookshelf — growing island fully complete', () => {
  const shelves = buildBookshelf({ growing: [1, 2, 3] });

  it('all growing spines are unlocked', () => {
    for (const spine of shelves.growing) {
      expect(spine.unlocked, `growing spine ${spine.id} should be unlocked`).toBe(true);
    }
  });

  it('other islands remain locked', () => {
    for (const island of ['local', 'foodwaste', 'circular']) {
      for (const spine of shelves[island]) {
        expect(spine.unlocked, `${island} spine ${spine.id} should be locked`).toBe(false);
      }
    }
  });

  it('unlockedSpines returns only growing entries', () => {
    const flat = unlockedSpines(shelves);
    expect(flat.length).toBeGreaterThan(0);
    for (const s of flat) {
      expect(s.island).toBe('growing');
    }
  });
});

// ── Completing mission 1 of circular (CompostCreator) → provisional spines unlocked ──
describe('buildBookshelf — circular mission 1 (CompostCreator) done', () => {
  const shelves = buildBookshelf({ circular: [1] });

  it('CompostCreator sources are unlocked', () => {
    const provIds = ['composting-home', 'recycle-common-recyclables', 'used-household-batteries'];
    for (const id of provIds) {
      const spine = shelves.circular.find((s) => s.id === id);
      expect(spine, `spine ${id} must exist`).toBeTruthy();
      expect(spine.unlocked, `spine ${id} should be unlocked`).toBe(true);
    }
  });

  it('CompostCreator provisional sources carry pending:true', () => {
    const provIds = ['composting-home', 'recycle-common-recyclables', 'used-household-batteries'];
    for (const id of provIds) {
      const spine = shelves.circular.find((s) => s.id === id);
      expect(spine?.pending, `${id} must be pending`).toBe(true);
    }
  });

  it('non-provisional circular sources carry pending:false', () => {
    const nonProv = shelves.circular.filter((s) => !s.pending);
    expect(nonProv.length).toBeGreaterThan(0);
    for (const spine of nonProv) {
      expect(spine.pending).toBe(false);
    }
  });
});

// ── Title / publisher / url verbatim from SOURCES ───────────────────────────
describe('buildBookshelf — verbatim citation check', () => {
  const shelves = buildBookshelf({});

  it('every spine title equals SOURCES[id].title verbatim', () => {
    for (const spine of allSpines(shelves)) {
      const src = SOURCES[spine.id];
      expect(src, `SOURCES['${spine.id}'] must exist`).toBeTruthy();
      expect(spine.title).toBe(src.title);
    }
  });

  it('every spine publisher equals SOURCES[id].publisher verbatim', () => {
    for (const spine of allSpines(shelves)) {
      const src = SOURCES[spine.id];
      expect(spine.publisher).toBe(src.publisher);
    }
  });

  it('every spine url equals SOURCES[id].url (or null)', () => {
    for (const spine of allSpines(shelves)) {
      const src = SOURCES[spine.id];
      const expected = src.url || null;
      expect(spine.url).toBe(expected);
    }
  });
});

// ── Deduplication — shared sources appear once per shelf ───────────────
describe('buildBookshelf — deduplication', () => {
  it('no duplicate spine ids within any shelf', () => {
    const shelves = buildBookshelf({ growing: [1, 2, 3], local: [1, 2, 3] });
    for (const island of ISLAND_SLUGS) {
      const ids = (shelves[island] || []).map((s) => s.id);
      const unique = new Set(ids);
      expect(unique.size, `${island} has duplicate spine ids`).toBe(ids.length);
    }
  });

  it('a spine shared between two games unlocks when either game is done', () => {
    // heirloom-seeds is cited by BOTH WhereDoesItGrow (id=1) AND GardenPlanner (id=2).
    // Completing only mission 1 should unlock that spine.
    const shelves = buildBookshelf({ growing: [1] });
    const spine = shelves.growing.find((s) => s.id === 'heirloom-seeds');
    expect(spine, 'heirloom-seeds spine must exist').toBeTruthy();
    expect(spine.unlocked).toBe(true);
  });
});

// ── unlockedSpines carries island key + canonical order ────────────────
describe('unlockedSpines — canonical order + island tag', () => {
  it('each unlocked spine carries island field', () => {
    const shelves = buildBookshelf({ growing: [1, 2, 3], circular: [1] });
    const flat = unlockedSpines(shelves);
    for (const s of flat) {
      expect(ISLAND_SLUGS).toContain(s.island);
    }
  });

  it('canonical order: growing comes before local comes before circular', () => {
    const shelves = buildBookshelf({
      growing: [1, 2, 3],
      local: [1, 2, 3],
      circular: [1, 2, 3],
    });
    const flat = unlockedSpines(shelves);
    const islands = flat.map((s) => s.island);
    const firstLocal = islands.indexOf('local');
    const firstGrowing = islands.indexOf('growing');
    const firstCircular = islands.indexOf('circular');
    // All growing spines should appear before any local or circular
    expect(firstGrowing).toBeLessThan(firstLocal);
    expect(firstLocal).toBeLessThan(firstCircular);
  });
});

// ── All MISSION_SOURCES keys resolve to existing SOURCES entries ───────
describe('MISSION_SOURCES integrity', () => {
  it('every source id referenced in MISSION_SOURCES exists in SOURCES', () => {
    for (const [component, ids] of Object.entries(MISSION_SOURCES)) {
      for (const id of ids) {
        expect(SOURCES[id], `SOURCES['${id}'] referenced by ${component} must exist`).toBeTruthy();
      }
    }
  });
});
