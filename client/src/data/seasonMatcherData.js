/**
 * Season Matcher — data module
 *
 * PRIMARY SOURCE (verbatim, cited by every fact):
 *   EUFIC — "Explore seasonal fruit and vegetables in Europe"
 *   https://www.eufic.org/en/explore-seasonal-fruit-and-vegetables-in-europe
 *   Full verbatim 4-country × 12-month dataset: ./euficSeasonal.js (extracted
 *   2026-06-12).
 *
 * Dataset provenance: country-specific entries derive from the EUFIC dataset,
 * extracted on 2026-06-12. Preserve the extraction rules below when updating.
 *
 * DERIVATION RULE (season granularity)
 * ───────────────────────────────────────────────────────────────
 * EUFIC is month-based; the game currently plays at season granularity.
 * Months → seasons use EUFIC'S OWN grouping (EUFIC_SEASON_MONTHS, from their
 * map.js): Spring=Mar-May, Summer=Jun-Aug, Autumn=Sep-Nov, Winter=Dec-Feb.
 * A food is in-season for a season when EUFIC lists it in ≥2 of that
 * season's 3 months — single-transition-month foods (e.g. watermelon in
 * September) would otherwise make autumn a superset of summer. Month-level
 * truth stays available via getInSeasonMonths() (used by wrong-pick hints
 * and the month chip). "(stored)" EUFIC variants count as in-season:
 * stored local produce is NOT imported (the BE/NL distinction is itself
 * learning content — see isStoredOnlyInMonth).
 * ───────────────────────────────────────────────────────────────
 */

import { EUFIC_SEASONAL, EUFIC_MONTHS, EUFIC_SEASON_MONTHS } from './euficSeasonal.js';

// ─── Countries ──────────────────────────────────────────────
// Verbatim from Analysis doc: "Belgium, Portugal, or Greece".
// (euficSeasonal.js also carries netherlands — data-only, for cross-checks
// and a possible future NL audience; not a playable country.)
export const COUNTRIES = [
  { id: 'belgium',  flag: '🇧🇪', nameKey: 'season.country.belgium'  },
  { id: 'portugal', flag: '🇵🇹', nameKey: 'season.country.portugal' },
  { id: 'greece',   flag: '🇬🇷', nameKey: 'season.country.greece'   },
];

// Smart default — derive the child's country from the chosen UI language.
// Decision 2026-05-18: el→GR, nl→BE (Flemish), pt→PT, en→PT (fallback).
// Shared by Season Matcher (2.1) and Market Trip (2.2), so both missions of
// the island talk about the same country and the same EUFIC data.
export const LANG_TO_COUNTRY = { el: 'greece', nl: 'belgium', pt: 'portugal', en: 'portugal' };
export function countryForLanguage(lang) {
  if (!lang) return null;
  const base = String(lang).toLowerCase().split('-')[0];
  return LANG_TO_COUNTRY[base] || null;
}

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

// ─── Food catalog ───────────────────────────────────────────
// 27 foods. Every food maps to verbatim EUFIC item names via EUFIC_ALIASES;
// the catalog is the subset of EUFIC items that have a distinct,
// widely-supported emoji (school laptops run older Unicode — no 🫛/🫐).
export const FOODS = {
  strawberry:  { emoji: '🍓', nameKey: 'season_foods.strawberry'  },
  tomato:      { emoji: '🍅', nameKey: 'season_foods.tomato'      },
  watermelon:  { emoji: '🍉', nameKey: 'season_foods.watermelon'  },
  cucumber:    { emoji: '🥒', nameKey: 'season_foods.cucumber'    },
  peach:       { emoji: '🍑', nameKey: 'season_foods.peach'       },
  cherry:      { emoji: '🍒', nameKey: 'season_foods.cherry'      },
  grape:       { emoji: '🍇', nameKey: 'season_foods.grape'       },
  apple:       { emoji: '🍎', nameKey: 'season_foods.apple'       },
  pear:        { emoji: '🍐', nameKey: 'season_foods.pear'        },
  pumpkin:     { emoji: '🎃', nameKey: 'season_foods.pumpkin'     },
  orange:      { emoji: '🍊', nameKey: 'season_foods.orange'      },
  mandarin:    { emoji: '🍊', nameKey: 'season_foods.mandarin'    },
  lemon:       { emoji: '🍋', nameKey: 'season_foods.lemon'       },
  kiwi:        { emoji: '🥝', nameKey: 'season_foods.kiwi'        },
  melon:       { emoji: '🍈', nameKey: 'season_foods.melon'       },
  eggplant:    { emoji: '🍆', nameKey: 'season_foods.eggplant'    }, // EUFIC name: aubergine
  potato:      { emoji: '🥔', nameKey: 'season_foods.potato'      },
  mushroom:    { emoji: '🍄', nameKey: 'season_foods.mushroom'    },
  // Leafy greens — each gets a visually distinct emoji so a shelf can hold
  // multiple greens without looking like duplicates to the player.
  cabbage:     { emoji: '🥬', nameKey: 'season_foods.cabbage'     },
  leek:        { emoji: '🧅', nameKey: 'season_foods.leek'        }, // no leek emoji exists — closest match
  spinach:     { emoji: '🌿', nameKey: 'season_foods.spinach'     },
  lettuce:     { emoji: '🥗', nameKey: 'season_foods.lettuce'     },
  kale:        { emoji: '🍃', nameKey: 'season_foods.kale'        },
  asparagus:   { emoji: '🌱', nameKey: 'season_foods.asparagus'   },
  pepper:      { emoji: '🫑', nameKey: 'season_foods.pepper'      },
  carrot:      { emoji: '🥕', nameKey: 'season_foods.carrot'      },
  broccoli:    { emoji: '🥦', nameKey: 'season_foods.broccoli'    },
};

// ─── Game food id → verbatim EUFIC item names ───────────────
// Strict matching: only the exact EUFIC strings listed here count.
// (e.g. "chinese cabbage" ≠ cabbage, "iceberg lettuce" ≠ lettuce.)
// "(stored)" variants are the SAME food, locally stored — included.
export const EUFIC_ALIASES = {
  strawberry: ['strawberry'],
  tomato:     ['tomato'],
  watermelon: ['watermelon'],
  cucumber:   ['cucumber'],
  peach:      ['peach'],
  cherry:     ['cherry'],
  grape:      ['grape'],
  apple:      ['apple', 'apple (stored)'],
  pear:       ['pear', 'pear (stored)'],
  pumpkin:    ['pumpkin', 'pumpkin (stored)'],
  orange:     ['orange'],
  mandarin:   ['tangerine'], // EUFIC's name for the same citrus
  lemon:      ['lemon'],
  kiwi:       ['kiwi'],
  melon:      ['melon'],
  eggplant:   ['aubergine'],
  potato:     ['potato', 'potato (stored)'],
  mushroom:   ['mushroom'],
  cabbage:    ['cabbage', 'cabbage (stored)'],
  leek:       ['leek'],
  spinach:    ['spinach'],
  lettuce:    ['lettuce'],
  kale:       ['kale'], // EUFIC lists NO kale for Greece — always-imported there (real learning content)
  asparagus:  ['asparagus'],
  pepper:     ['bell pepper'],
  carrot:     ['carrot', 'carrot (stored)'],
  broccoli:   ['broccoli'],
};

// ─── EUFIC lookups (month granularity = the source of truth) ─
const CELL_CACHE = new Map();
function euficItemsInMonth(country, month) {
  const k = country + ':' + month;
  if (!CELL_CACHE.has(k)) {
    const cell = EUFIC_SEASONAL[country]?.[month];
    CELL_CACHE.set(k, cell ? new Set([...cell.fruit, ...cell.vegetable]) : new Set());
  }
  return CELL_CACHE.get(k);
}

// Months (lowercase EUFIC_MONTHS names) where foodId is in-season in country.
export function getInSeasonMonths(foodId, country) {
  const aliases = EUFIC_ALIASES[foodId] || [];
  return EUFIC_MONTHS.filter((mo) => {
    const items = euficItemsInMonth(country, mo);
    return aliases.some((a) => items.has(a));
  });
}

// True when the food is available that month ONLY as "(stored)" local produce
// (BE/NL distinction: stored local ≠ fresh local ≠ imported).
export function isStoredOnlyInMonth(foodId, country, month) {
  const aliases = EUFIC_ALIASES[foodId] || [];
  const items = euficItemsInMonth(country, month);
  const present = aliases.filter((a) => items.has(a));
  return present.length > 0 && present.every((a) => a.includes('(stored)'));
}

// ─── In-season per country × season (DERIVED from EUFIC) ────
// See DERIVATION RULE in the header: in-season for a season when EUFIC
// lists the food in ≥2 of the season's 3 months. Anything NOT in the list
// is treated as out-of-season for that cell. Cell sizes verified by tests:
// every playable country×season has ≥6 in-season and ≥6 out-of-season
// emoji-distinct foods (buildShelf invariant, 6+6 shelf).
export const SEASONAL_BY_COUNTRY = (() => {
  const result = {};
  for (const country of Object.keys(EUFIC_SEASONAL)) {
    result[country] = {};
    for (const [season, months] of Object.entries(EUFIC_SEASON_MONTHS)) {
      result[country][season] = Object.keys(FOODS).filter((id) => {
        const inMonths = getInSeasonMonths(id, country);
        return months.filter((mo) => inMonths.includes(mo)).length >= 2;
      });
    }
  }
  return result;
})();

// Season → emoji map for inline hints (wrong-pick toast, reveals).
export const SEASON_EMOJI = {
  spring: '🌸',
  summer: '☀️',
  autumn: '🍂',
  winter: '❄️',
};

// Returns array of seasons where foodId is in-season for given country.
// Empty array means the food is never local-seasonal there (always imported).
export function getInSeasonFor(foodId, country) {
  const countryData = SEASONAL_BY_COUNTRY[country];
  if (!countryData) return [];
  return SEASONS.filter((s) => countryData[s]?.includes(foodId));
}

// ─── Energy model (food-miles cost) ─────────────────────────
// In-season local food costs 0 transport energy.
// Out-of-season imported food costs ENERGY_COST_OOS units.
// energyBand() maps a cumulative basket energy to low/medium/high tier.
export const ENERGY_COST_OOS = 15;
export const ENERGY_BANDS = { low: 15, medium: 45 };

export function energyBand(energy) {
  if (energy <= ENERGY_BANDS.low) return 'low';
  if (energy <= ENERGY_BANDS.medium) return 'medium';
  return 'high';
}

// Out-of-season foreign origin per food. GAME PARAMETERS, not educational
// claims: anchored to typical EU import patterns when each food is out of
// local season, but the specific country per food is our tuning choice.
// Value pairs i18n key (country name on hover/results) with the flag emoji
// (shown directly on the shelf label — compact & instantly recognizable).
export const FOOD_OUT_ORIGIN = {
  strawberry:  { key: 'season.origin_out.egypt',        flag: '🇪🇬' },
  tomato:      { key: 'season.origin_out.morocco',      flag: '🇲🇦' },
  watermelon:  { key: 'season.origin_out.brazil',       flag: '🇧🇷' },
  cucumber:    { key: 'season.origin_out.spain',        flag: '🇪🇸' },
  peach:       { key: 'season.origin_out.chile',        flag: '🇨🇱' },
  cherry:      { key: 'season.origin_out.chile',        flag: '🇨🇱' },
  grape:       { key: 'season.origin_out.chile',        flag: '🇨🇱' },
  apple:       { key: 'season.origin_out.argentina',    flag: '🇦🇷' },
  pear:        { key: 'season.origin_out.argentina',    flag: '🇦🇷' },
  pumpkin:     { key: 'season.origin_out.mexico',       flag: '🇲🇽' },
  orange:      { key: 'season.origin_out.south_africa', flag: '🇿🇦' },
  mandarin:    { key: 'season.origin_out.argentina',    flag: '🇦🇷' },
  lemon:       { key: 'season.origin_out.spain',        flag: '🇪🇸' },
  kiwi:        { key: 'season.origin_out.new_zealand',  flag: '🇳🇿' },
  melon:       { key: 'season.origin_out.brazil',       flag: '🇧🇷' },
  eggplant:    { key: 'season.origin_out.spain',        flag: '🇪🇸' },
  potato:      { key: 'season.origin_out.egypt',        flag: '🇪🇬' },
  mushroom:    { key: 'season.origin_out.poland',       flag: '🇵🇱' },
  cabbage:     { key: 'season.origin_out.poland',       flag: '🇵🇱' },
  leek:        { key: 'season.origin_out.france',       flag: '🇫🇷' },
  spinach:     { key: 'season.origin_out.spain',        flag: '🇪🇸' },
  lettuce:     { key: 'season.origin_out.spain',        flag: '🇪🇸' },
  kale:        { key: 'season.origin_out.germany',      flag: '🇩🇪' },
  asparagus:   { key: 'season.origin_out.peru',         flag: '🇵🇪' },
  pepper:      { key: 'season.origin_out.morocco',      flag: '🇲🇦' },
  carrot:      { key: 'season.origin_out.poland',       flag: '🇵🇱' },
  broccoli:    { key: 'season.origin_out.spain',        flag: '🇪🇸' },
};

// Local country flag for in-season origin (mirrors COUNTRIES array flags).
const COUNTRY_FLAG = { greece: '🇬🇷', portugal: '🇵🇹', belgium: '🇧🇪' };

// Build the energy/origin label for a shelf food. Pure function.
// Returns season + origin metadata for the energy-meter UI (Tasks 3+).
export function getShelfLabel(food, country) {
  const seasonKey = (food.correctSeasons || [])[0] || null;
  const seasonEmoji = seasonKey ? SEASON_EMOJI[seasonKey] : '✈️';

  if (food.inSeason) {
    return {
      inSeason: true,
      energyCost: 0,
      seasonKey,
      seasonEmoji,
      originKey: 'season.country.' + country,
      originText: COUNTRY_FLAG[country] || '',
    };
  }

  // Out-of-season: look up flag from food.originKey (direct) or FOOD_OUT_ORIGIN[food.id]
  const meta = FOOD_OUT_ORIGIN[food.id];
  const flag = meta ? meta.flag : '';
  const originKey = food.originKey || (meta ? meta.key : 'season.origin_out.generic');
  const originText = flag ? flag + ' ✈️' : '✈️';

  return {
    inSeason: false,
    energyCost: ENERGY_COST_OOS,
    seasonKey,
    seasonEmoji,
    originKey,
    originText,
  };
}

// Compact display of in-season months as contiguous (circular) runs:
// ['june','july','august','september'] → "June to September", wrap-around
// handled (['october','november','december','january'] → "October to January").
// Full month names favour child comprehension; responsive result rows wrap.
// All 12 months still collapse to months.all_year.
export function formatMonthRuns(months, t) {
  if (!months || months.length === 0) return '';
  const present = new Set(months.map((m) => EUFIC_MONTHS.indexOf(m)));
  if (present.size === 12) return t('months.all_year');
  const runs = [];
  for (const i of [...present].sort((a, b) => a - b)) {
    if (present.has((i + 11) % 12)) continue; // continuation, not a run start
    let end = i;
    while (present.has((end + 1) % 12)) end = (end + 1) % 12;
    runs.push([i, end]);
  }
  const label = (i) => t('months_full.' + EUFIC_MONTHS[i]);
  // Localized joiner («October to April», «Οκτώβριος έως Απρίλιος») — the
  // no-dash copy rule bans the en dash that used to sit between month names.
  const joiner = ' ' + t('season.months_to') + ' ';
  return runs.map(([a, b]) => (a === b ? label(a) : label(a) + joiner + label(b))).join(', ');
}

// Build the wrong-pick feedback hint string. Pure function for testability.
// Surfaces ORIGIN COUNTRY + ✈️ at
// the moment of failure (productive-failure pedagogy, Habgood & Ainsworth 2011).
// The ✈️ icon — removed from the shelf labels — appears here as EXPLANATION
// of why the pick was wrong, not as a pre-spoiler at the choice point.
//
// Month-level truth: when the food carries
// inSeasonMonths, the hint shows the MONTH runs (the EUFIC truth), not the
// ≥2/3-derived seasons — otherwise a pick that is wrong in September could
// read "season: autumn" while the player IS in autumn.
//
// Child-facing feedback stays generic about transport origin. The configured
// origin metadata remains available internally, but partner validation would
// be required before claiming that a specific product came from one country.
// `food` carries emoji, nameKey, correctSeasons and optionally inSeasonMonths.
export function buildWrongHint(food, t) {
  const foodName = t(food.nameKey);

  // Month-level branch (preferred — EUFIC truth granularity)
  if (food.inSeasonMonths && food.inSeasonMonths.length > 0) {
    const monthsText = formatMonthRuns(food.inSeasonMonths, t);
    const seasonEmojis = [...new Set(food.inSeasonMonths.map((m) => SEASON_EMOJI[seasonOfMonth(m)]))].join('');
    return t('season.feedback_traveled_generic', {
      emoji: food.emoji,
      food: foodName,
      seasons: monthsText,
      seasonEmojis,
    });
  }

  if (food.correctSeasons && food.correctSeasons.length > 0) {
    const seasonNames = food.correctSeasons.map((s) => t('season.' + s)).join(' / ');
    const seasonEmojis = food.correctSeasons.map((s) => SEASON_EMOJI[s]).join('');
    return t('season.feedback_traveled_generic', {
      emoji: food.emoji,
      food: foodName,
      seasons: seasonNames,
      seasonEmojis,
    });
  }

  return t('season.feedback_traveled_generic', {
    emoji: food.emoji,
    food: foodName,
    seasons: t('season.always_imported'),
    seasonEmojis: '',
  });
}

// ─── Game parameters (per user-approved defaults) ───────────
export const BASKET_SIZE = 6;          // D4
export const SHELF_SIZE = 12;          // D4: 12 items mix

// ─── Result grading + stars (Phase 1) ───────────────────────
// The child sees one completion rule (fill all six slots) and one quality rule
// (how many out-of-season choices reached checkout). Transport energy remains
// useful learning data, but it no longer changes stars behind the scenes.
export function gradeSeasonMatcher({ correct, traveledCount = 0 }) {
  if (correct < BASKET_SIZE) return 'fail';
  if (traveledCount === 0) return 'perfect';
  if (traveledCount <= 2) return 'good';
  return 'pass';
}

export const SEASON_TIER_STARS = { perfect: 3, good: 2, pass: 1, fail: 0 };
export function starsForSeasonTier(tier) {
  return SEASON_TIER_STARS[tier] ?? 0;
}

// Live progress for the header. A star is earned for every two accepted
// seasonal foods, while out-of-season choices cap the best rating still
// available. At six accepted foods this is exactly the final result rule.
export function liveStarsForSeasonMatcher(state) {
  if (!state) return 0;
  const accepted = state.basketCount ?? 0;
  const traveled = state.boughtOutOfSeason?.length ?? 0;
  const earnedFromProgress = Math.min(3, Math.floor(accepted / 2));
  const qualityCap = traveled === 0 ? 3 : (traveled <= 2 ? 2 : 1);
  return Math.min(earnedFromProgress, qualityCap);
}

// Un-taken in-season foods still on the shelf. The win needs BASKET_SIZE of
// these, so this drives the soft-lock guard (no more reachable → graceful end).
export function remainingInSeason(foods) {
  if (!foods) return 0;
  return foods.filter((f) => f && f.inSeason && !f.taken).length;
}

// ─── Month picker (deterministic for tests) ─────────────────
// The game scenario is a concrete MONTH (the spec's
// "specific country + time of year"); the season is DERIVED from it for
// theming. Validation of picks is month-level — see buildShelf.
export function seasonOfMonth(month) {
  for (const [season, months] of Object.entries(EUFIC_SEASON_MONTHS)) {
    if (months.includes(month)) return season;
  }
  return null;
}

// Months where a full shelf exists for the country: ≥BASKET_SIZE emoji-distinct
// foods that are BOTH in the season's composition pool AND in-season that month,
// plus ≥(SHELF_SIZE−BASKET_SIZE) emoji-distinct month-false distractors.
// Excluding a sparse month (e.g. Greece/March: only 3 distinct emojis) is a
// scenario choice — level design — NOT a truth change: no food's seasonality
// is altered, the month simply isn't offered as a scenario.
export function getPlayableMonths(country) {
  return EUFIC_MONTHS.filter((month) => {
    const season = seasonOfMonth(month);
    const pool = (SEASONAL_BY_COUNTRY[country]?.[season] || [])
      .filter((id) => getInSeasonMonths(id, country).includes(month));
    const inEmojis = new Set(pool.map((id) => FOODS[id].emoji));
    const outPool = Object.keys(FOODS)
      .filter((id) => !getInSeasonMonths(id, country).includes(month));
    const outEmojis = new Set(outPool.map((id) => FOODS[id].emoji));
    return inEmojis.size >= BASKET_SIZE && outEmojis.size >= SHELF_SIZE - BASKET_SIZE;
  });
}

// The game assigns a month. Default: weighted
// toward the current real-world month (grounded UX — "what is in season NOW"),
// falling back to any playable month. Tests pass { random, date } to override.
export function pickMonth({ country, date = new Date(), random = Math.random } = {}) {
  const playable = country ? getPlayableMonths(country) : [...EUFIC_MONTHS];
  const realMonth = EUFIC_MONTHS[date.getMonth()];
  // 60% chance real month (when playable), 40% any playable month (replayability)
  if (playable.includes(realMonth) && random() < 0.6) return realMonth;
  return playable[Math.floor(random() * playable.length)];
}

// ─── Shelf builder ──────────────────────────────────────────
// Month-first:
//   • COMPOSITION: the in-shelf slots come from the ≥2/3 season pool of the
//     month's season, FILTERED to foods truly in-season that month.
//   • VALIDATION TRUTH: every item's inSeason flag is month-level. Distractor
//     slots sample ONLY month-false foods, so no EUFIC-in-season-this-month
//     item can ever be marked ✈️ (locked by test).
// Hard rule kept: no two items on the same shelf share an emoji (orange +
// mandarin are both 🍊 — only one appears per shelf). Each food carries its
// country-wide correctSeasons + inSeasonMonths so wrong-pick hints can show
// the right answer without re-querying.
export function buildShelf(country, month, { random = Math.random } = {}) {
  const season = seasonOfMonth(month);
  const monthTrue = (id) => getInSeasonMonths(id, country).includes(month);
  const inSeasonPool = (SEASONAL_BY_COUNTRY[country]?.[season] || []).filter(monthTrue);
  const allIds = Object.keys(FOODS);
  const outOfSeasonPool = allIds.filter((id) => !monthTrue(id));

  // Sample without replacement, skipping ids whose emoji is already taken.
  const sampleUniqueEmoji = (pool, n, takenEmojis) => {
    const shuffled = [...pool].sort(() => random() - 0.5);
    const picked = [];
    const seen = new Set(takenEmojis);
    for (const id of shuffled) {
      if (picked.length >= n) break;
      const emoji = FOODS[id].emoji;
      if (seen.has(emoji)) continue;
      seen.add(emoji);
      picked.push(id);
    }
    return picked;
  };

  const inSeasonPick = sampleUniqueEmoji(inSeasonPool, BASKET_SIZE, []);
  const usedEmojis = inSeasonPick.map((id) => FOODS[id].emoji);
  const outOfSeasonPick = sampleUniqueEmoji(
    outOfSeasonPool,
    SHELF_SIZE - inSeasonPick.length,
    usedEmojis,
  );

  const shelf = [...inSeasonPick, ...outOfSeasonPick].map((id) => ({
    id,
    ...FOODS[id],
    inSeason: inSeasonPool.includes(id),
    correctSeasons: getInSeasonFor(id, country),
    inSeasonMonths: getInSeasonMonths(id, country),
  }));

  return shelf.sort(() => random() - 0.5);
}
