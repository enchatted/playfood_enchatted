// Locks: the Season Matcher dataset must stay EUFIC-derived and intact.
// The verbatim sample cells below were copied from independently-extracted
// samples BEFORE this extraction — they verify the
// pipeline, not themselves.
import { describe, it, expect } from 'vitest';
import { EUFIC_SEASONAL, EUFIC_MONTHS, EUFIC_SEASON_MONTHS } from './euficSeasonal.js';
import {
  FOODS, EUFIC_ALIASES, FOOD_OUT_ORIGIN, SEASONAL_BY_COUNTRY, SEASONS, COUNTRIES,
  getInSeasonMonths, getInSeasonFor, isStoredOnlyInMonth, buildShelf,
  seasonOfMonth, getPlayableMonths, pickMonth, formatMonthRuns, buildWrongHint,
  BASKET_SIZE, SHELF_SIZE, ENERGY_COST_OOS,
  gradeSeasonMatcher, SEASON_TIER_STARS, starsForSeasonTier,
  liveStarsForSeasonMatcher, remainingInSeason,
} from './seasonMatcherData.js';
import { SOURCES, MISSION_SOURCES } from './sources.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

const GAME_COUNTRIES = COUNTRIES.map((c) => c.id); // belgium, portugal, greece

describe('EUFIC extraction (verbatim locks vs reference samples)', () => {
  it('Greece June fruits match the reference sample exactly', () => {
    expect(EUFIC_SEASONAL.greece.june.fruit).toEqual(
      ['apricot', 'cherry', 'melon', 'peach', 'pear', 'plum', 'strawberry', 'watermelon'],
    );
  });

  it('Greece December fruits match the reference sample exactly (citrus!)', () => {
    expect(EUFIC_SEASONAL.greece.december.fruit).toEqual(
      ['apple', 'grapefruit', 'kiwi', 'lemon', 'orange', 'pear', 'tangerine'],
    );
  });

  it('Netherlands December fruits = only apple & pear (reference sample)', () => {
    expect(EUFIC_SEASONAL.netherlands.december.fruit).toEqual(['apple', 'pear']);
  });

  it('Netherlands June fruits = only cherry & strawberry (reference sample)', () => {
    expect(EUFIC_SEASONAL.netherlands.june.fruit).toEqual(['cherry', 'strawberry']);
  });

  it('covers 4 countries × 12 months with non-empty cells', () => {
    const countries = ['greece', 'belgium', 'netherlands', 'portugal'];
    expect(Object.keys(EUFIC_SEASONAL).sort()).toEqual([...countries].sort());
    for (const c of countries) {
      for (const mo of EUFIC_MONTHS) {
        const cell = EUFIC_SEASONAL[c][mo];
        expect(cell, `${c}.${mo}`).toBeDefined();
        expect(cell.fruit.length + cell.vegetable.length, `${c}.${mo} empty`).toBeGreaterThan(0);
      }
    }
  });

  it('Belgium marks stored local produce — "(stored)" variants present', () => {
    const all = EUFIC_MONTHS.flatMap((mo) => [
      ...EUFIC_SEASONAL.belgium[mo].fruit, ...EUFIC_SEASONAL.belgium[mo].vegetable,
    ]);
    expect(all.some((x) => x.includes('(stored)'))).toBe(true);
  });
});

describe('Portugal is real data, not a copy of Greece', () => {
  it('raw EUFIC cells differ between PT and GR', () => {
    const differs = EUFIC_MONTHS.some((mo) =>
      JSON.stringify(EUFIC_SEASONAL.portugal[mo]) !== JSON.stringify(EUFIC_SEASONAL.greece[mo]));
    expect(differs).toBe(true);
  });

  it('derived game seasons differ between PT and GR', () => {
    const differs = SEASONS.some((s) =>
      JSON.stringify([...SEASONAL_BY_COUNTRY.portugal[s]].sort()) !==
      JSON.stringify([...SEASONAL_BY_COUNTRY.greece[s]].sort()));
    expect(differs).toBe(true);
  });
});

describe('alias map integrity', () => {
  it('uses the clear Greek name “Λαχανίδα (κέιλ)” consistently', () => {
    expect(el.season_foods.kale).toBe('Λαχανίδα (κέιλ)');
    expect(el.foods.kale).toBe('Λαχανίδα (κέιλ)');
  });

  it('FOODS, EUFIC_ALIASES and FOOD_OUT_ORIGIN cover the same food ids', () => {
    const ids = Object.keys(FOODS).sort();
    expect(Object.keys(EUFIC_ALIASES).sort()).toEqual(ids);
    expect(Object.keys(FOOD_OUT_ORIGIN).sort()).toEqual(ids);
  });

  it('every alias string exists somewhere in the EUFIC data (no dead aliases/typos)', () => {
    const allItems = new Set();
    for (const c of Object.keys(EUFIC_SEASONAL)) {
      for (const mo of EUFIC_MONTHS) {
        EUFIC_SEASONAL[c][mo].fruit.forEach((x) => allItems.add(x));
        EUFIC_SEASONAL[c][mo].vegetable.forEach((x) => allItems.add(x));
      }
    }
    for (const [id, aliases] of Object.entries(EUFIC_ALIASES)) {
      for (const a of aliases) {
        expect(allItems.has(a), `${id} alias "${a}" not found in EUFIC data`).toBe(true);
      }
    }
  });
});

describe('derivation rule (≥2 of 3 season months, EUFIC month grouping)', () => {
  it('uses EUFIC\'s own meteorological season grouping', () => {
    expect(EUFIC_SEASON_MONTHS.spring).toEqual(['march', 'april', 'may']);
    expect(EUFIC_SEASON_MONTHS.winter).toEqual(['december', 'january', 'february']);
  });

  it('watermelon in Greece: summer yes, autumn no (Sept-only transition month)', () => {
    expect(getInSeasonMonths('watermelon', 'greece')).toEqual(['june', 'july', 'august', 'september']);
    expect(getInSeasonFor('watermelon', 'greece')).toEqual(['summer']);
  });

  it('oranges never local in Belgium; kale never local in Greece (real EUFIC gaps)', () => {
    expect(getInSeasonFor('orange', 'belgium')).toEqual([]);
    expect(getInSeasonFor('kale', 'greece')).toEqual([]);
  });

  it('stored-only detection: Belgian apples in January are stored, in June fresh', () => {
    expect(isStoredOnlyInMonth('apple', 'belgium', 'january')).toBe(true);
    expect(isStoredOnlyInMonth('apple', 'belgium', 'june')).toBe(false);
  });
});

describe('buildShelf invariant survives the real dataset', () => {
  it('every playable country×season has ≥6 in-season and ≥6 out-of-season emoji-distinct foods', () => {
    for (const country of GAME_COUNTRIES) {
      for (const season of SEASONS) {
        const inPool = SEASONAL_BY_COUNTRY[country][season];
        const outPool = Object.keys(FOODS).filter((id) => !inPool.includes(id));
        const inEmojis = new Set(inPool.map((id) => FOODS[id].emoji));
        const outEmojis = new Set(outPool.map((id) => FOODS[id].emoji));
        expect(inEmojis.size, `${country}/${season} in-pool`).toBeGreaterThanOrEqual(BASKET_SIZE);
        expect(outEmojis.size, `${country}/${season} out-pool`).toBeGreaterThanOrEqual(SHELF_SIZE - BASKET_SIZE);
      }
    }
  });

  it('buildShelf always returns a full 12-item shelf with unique emojis (every playable month)', () => {
    let seed = 42;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const country of GAME_COUNTRIES) {
      for (const month of getPlayableMonths(country)) {
        const shelf = buildShelf(country, month, { random });
        expect(shelf.length, `${country}/${month}`).toBe(SHELF_SIZE);
        expect(new Set(shelf.map((f) => f.emoji)).size).toBe(SHELF_SIZE);
        expect(shelf.filter((f) => f.inSeason).length).toBe(BASKET_SIZE);
      }
    }
  });
});

describe('validation is month-level', () => {
  it('VERDICT TEST: no EUFIC-in-season-this-month item is ever marked ✈️ (and vice versa)', () => {
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const country of GAME_COUNTRIES) {
      for (const month of getPlayableMonths(country)) {
        for (let run = 0; run < 3; run++) {
          for (const item of buildShelf(country, month, { random })) {
            const monthTrue = getInSeasonMonths(item.id, country).includes(month);
            // exact equality: month-true never ✈️, month-false never ✓
            expect(item.inSeason, `${country}/${month}: ${item.id}`).toBe(monthTrue);
          }
        }
      }
    }
  });

  it('seasonOfMonth follows the EUFIC grouping', () => {
    expect(seasonOfMonth('june')).toBe('summer');
    expect(seasonOfMonth('december')).toBe('winter');
    expect(seasonOfMonth('march')).toBe('spring');
  });

  it('unplayable months are excluded as scenarios, not truth-edited (Greece/March)', () => {
    const gr = getPlayableMonths('greece');
    expect(gr).not.toContain('march'); // only 3 emoji-distinct in-pool foods — no full shelf
    expect(gr).toContain('april');
    expect(gr).toContain('june');
    // every playable country offers a healthy scenario pool year-round
    for (const country of GAME_COUNTRIES) {
      expect(getPlayableMonths(country).length, country).toBeGreaterThanOrEqual(9);
    }
  });

  it('pickMonth is deterministic under injected date/random and respects playability', () => {
    const june = new Date(2026, 5, 15);
    expect(pickMonth({ country: 'greece', date: june, random: () => 0.1 })).toBe('june');
    for (const country of GAME_COUNTRIES) {
      for (const r of [0, 0.33, 0.66, 0.99]) {
        const m = pickMonth({ country, date: june, random: () => r });
        expect(getPlayableMonths(country), `${country} r=${r}`).toContain(m);
      }
    }
  });
});

describe('month-aware wrong hint', () => {
  const FULL = {
    january: 'January', february: 'February', march: 'March', april: 'April', may: 'May',
    june: 'June', july: 'July', august: 'August', september: 'September', october: 'October',
    november: 'November', december: 'December',
  };
  const fakeT = (key, params) => {
    if (key === 'season.feedback_traveled_generic') {
      return `${params.emoji} ${params.food} travelled far · ${params.seasons} ${params.seasonEmojis}`;
    }
    if (key === 'season.origin_out.brazil') return 'Brazil';
    if (params) return `${params.emoji} ${params.food} ← ${params.country} · ${params.seasons} ${params.seasonEmojis}`;
    if (key.startsWith('months_full.')) return FULL[key.split('.')[1]];
    if (key === 'months.all_year') return 'all year';
    if (key === 'season.months_to') return 'to';
    return key;
  };

  it('formatMonthRuns renders contiguous runs, incl. circular wrap-around', () => {
    expect(formatMonthRuns(['june', 'july', 'august', 'september'], fakeT)).toBe('June to September');
    // GR mandarin (EUFIC tangerine): Oct…Apr crosses the year boundary → one run
    expect(formatMonthRuns(getInSeasonMonths('mandarin', 'greece'), fakeT)).toBe('October to April');
    expect(formatMonthRuns(EUFIC_MONTHS, fakeT)).toBe('all year');
    expect(formatMonthRuns([], fakeT)).toBe('');
  });

  it('buildWrongHint prefers EUFIC month truth over ≥2/3-derived seasons', () => {
    const food = {
      id: 'watermelon', emoji: '🍉', nameKey: 'season_foods.watermelon',
      correctSeasons: getInSeasonFor('watermelon', 'greece'),
      originKey: 'season.origin_out.brazil',
      inSeasonMonths: getInSeasonMonths('watermelon', 'greece'),
    };
    // months Jun–Sep (incl. the September transition month the season view hides)
    const text = buildWrongHint(food, fakeT);
    expect(text).toContain('June to September');
    expect(text).not.toContain('Brazil');
    expect(text).not.toContain('season.origin_out');
  });

  it('months.* short labels exist in all 4 locales', () => {
    for (const [name, loc] of [['en', en], ['el', el], ['nl', nl], ['pt', pt]]) {
      for (const key of [...EUFIC_MONTHS, 'all_year']) {
        expect(loc.months?.[key], `${name}: months.${key}`).toBeTruthy();
      }
    }
  });

  // The context chip («🇬🇷 Ελλάδα · Ιούνιος») reads months_full.<month>.
  it('months_full.* labels exist for all 12 months in all 4 locales', () => {
    for (const [name, loc] of [['en', en], ['el', el], ['nl', nl], ['pt', pt]]) {
      for (const key of EUFIC_MONTHS) {
        expect(loc.months_full?.[key], `${name}: months_full.${key}`).toBeTruthy();
      }
    }
  });
});

// ─── Phase 1: one completion rule + child-readable quality grading ────────
describe('gradeSeasonMatcher (six foods + committed travel mistakes)', () => {
  it.each([
    [6, 0, 0, 'perfect', 3],
    [6, 1, 15, 'good', 2],
    // Energy is deliberately high here: stars must follow choices, not a hidden meter.
    [6, 2, 60, 'good', 2],
    // Energy is deliberately low here: three mistakes must still mean one star.
    [6, 3, 0, 'pass', 1],
  ])(
    '%i accepted and %i travelled choices → %s',
    (correct, traveledCount, energy, expectedTier, expectedStars) => {
      const tier = gradeSeasonMatcher({ correct, traveledCount, energy });
      expect(tier).toBe(expectedTier);
      expect(starsForSeasonTier(tier)).toBe(expectedStars);
    },
  );

  it('five accepted foods remain an incomplete defensive result', () => {
    expect(gradeSeasonMatcher({ correct: BASKET_SIZE - 1, traveledCount: 0, energy: 0 })).toBe('fail');
  });
});

describe('starsForSeasonTier / SEASON_TIER_STARS', () => {
  it('maps the 4 tiers to 3/2/1/0 stars', () => {
    expect(SEASON_TIER_STARS).toEqual({ perfect: 3, good: 2, pass: 1, fail: 0 });
    expect(starsForSeasonTier('perfect')).toBe(3);
    expect(starsForSeasonTier('good')).toBe(2);
    expect(starsForSeasonTier('pass')).toBe(1);
    expect(starsForSeasonTier('fail')).toBe(0);
  });
  it('an unknown tier → 0 stars (no crash)', () => {
    expect(starsForSeasonTier('bogus')).toBe(0);
    expect(starsForSeasonTier(undefined)).toBe(0);
  });
});

describe('liveStarsForSeasonMatcher (same visible rule as the final result)', () => {
  it('starts with empty stars before the child earns anything', () => {
    expect(liveStarsForSeasonMatcher(null)).toBe(0);
    expect(liveStarsForSeasonMatcher({ basketCount: 0, boughtOutOfSeason: [] })).toBe(0);
  });

  it.each([
    [1, 0],
    [2, 1],
    [4, 2],
    [6, 3],
  ])('%i accepted seasonal foods earn %i★', (basketCount, expectedStars) => {
    const state = { basketCount, boughtOutOfSeason: [] };
    expect(liveStarsForSeasonMatcher(state)).toBe(expectedStars);
  });

  it('mistakes can lower an already earned live rating', () => {
    expect(liveStarsForSeasonMatcher({ basketCount: 4, boughtOutOfSeason: [{}, {}, {}] })).toBe(1);
  });

  it('live == final stars for any PASSED terminal state (consistency lock)', () => {
    for (const energy of [0, 15, 16, 30, 45, 46, 75]) {
      for (const traveledCount of [0, 1, 2, 3, 6]) {
        const state = {
          basketCount: BASKET_SIZE,
          energy,
          boughtOutOfSeason: Array(traveledCount).fill({}),
        };
        const finalStars = starsForSeasonTier(gradeSeasonMatcher({ correct: BASKET_SIZE, energy, traveledCount }));
        expect(liveStarsForSeasonMatcher(state), `energy=${energy} traveled=${traveledCount}`).toBe(finalStars);
      }
    }
  });
});

describe('remainingInSeason (soft-lock guard helper)', () => {
  it('counts only un-taken in-season foods', () => {
    const foods = [
      { inSeason: true, taken: false }, { inSeason: true, taken: true },
      { inSeason: false, taken: false }, { inSeason: true, taken: false },
    ];
    expect(remainingInSeason(foods)).toBe(2);
  });
  it('empty / missing → 0', () => {
    expect(remainingInSeason([])).toBe(0);
    expect(remainingInSeason(null)).toBe(0);
    expect(remainingInSeason(undefined)).toBe(0);
  });
});

describe('i18n + registry wiring', () => {
  it('every food has a season_foods name in all 4 locales', () => {
    for (const [id, food] of Object.entries(FOODS)) {
      const key = food.nameKey.split('.')[1];
      for (const [name, loc] of [['en', en], ['el', el], ['nl', nl], ['pt', pt]]) {
        expect(loc.season_foods?.[key], `${name}: season_foods.${key} (${id})`).toBeTruthy();
      }
    }
  });

  it('every out-origin key resolves in EN + EL (NL/PT origin_out = known gap)', () => {
    for (const [id, meta] of Object.entries(FOOD_OUT_ORIGIN)) {
      const key = meta.key.split('.').pop();
      expect(en.season.origin_out[key], `en origin ${key} (${id})`).toBeTruthy();
      expect(el.season.origin_out[key], `el origin ${key} (${id})`).toBeTruthy();
    }
  });

  it('the EUFIC source is registered for source badges', () => {
    expect(SOURCES['eufic-seasonal']).toBeDefined();
    expect(SOURCES['eufic-seasonal'].publisher).toMatch(/EUFIC/);
    expect(SOURCES['eufic-seasonal'].url).toMatch(/eufic\.org/);
  });

  it('SeasonMatcher + MarketTrip have visible sources via MISSION_SOURCES', () => {
    expect(MISSION_SOURCES.SeasonMatcher).toEqual(['eufic-seasonal', 'local-seasonal-food']);
    expect(MISSION_SOURCES.MarketTrip).toEqual([
      'local-seasonal-food',
      'eu-local-food-systems',
      'eufic-seasonality-environment',
    ]);
    for (const key of MISSION_SOURCES.SeasonMatcher) expect(SOURCES[key], key).toBeDefined();
    for (const key of MISSION_SOURCES.MarketTrip) expect(SOURCES[key], key).toBeDefined();
  });
});
