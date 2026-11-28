/**
 * Garden Planner — data module
 *
 * Source: PLAYFOOD_Digital Platform_4 first games analysis.docx (2026-05-07)
 *         + PLAYFOOD DIGITAL PLATFORM_Content Development_4 first games.docx (2026-05-07)
 *
 * Scope: ONLY content used by the current simplified flow
 * (Plant → Water → Harvest, per Miro Feedback Description in the Analysis doc).
 *
 * Deferred until partner reply (email sent 2026-05-13, reply pending):
 *   - Decision-event popups (kept here as FUTURE_DECISION_EVENTS, not wired)
 *   - Companion planting, cover crops, pesticides as mechanic
 *   - Soil quality sliders, math/logic prompts, phygital connection
 *   - Remaining Mediterranean sow/harvest content not used by the current mechanic
 */

// ─── Seasons ─────────────────────────────────────────────────
// Order from Analysis doc full Description:
//   "as the game progresses through autumn, winter, spring, and summer"
export const SEASONS = ['autumn', 'winter', 'spring', 'summer'];
export const START_SEASON = 'autumn';

// ─── Seeds ──────────────────────────────────────────────────
// The original 12-item set is extended to an 18-item round pool. Each new game
// selects 12 items with selectGardenSeeds(), while Retry reuses the same seed.
// The six 2026-08-18 additions and their validSeasons come directly from the
// partner table "WHAT CAN YOU SOW IN A MEDITERRANEAN CLIMATE EACH SEASON".
// Pumpkin and watermelon remain simplified
// cultural season associations and are not backed by a row in that sowing table.
// All nameKeys point to the shared season_foods.* namespace.
export const GARDEN_SEEDS = [
  {
    id: 'strawberry',
    emoji: '🍓',
    nameKey: 'season_foods.strawberry',
    validSeasons: ['spring'],
    // Single-season — clearest Spring signal for kids.
  },
  {
    id: 'watermelon',
    emoji: '🍉',
    nameKey: 'season_foods.watermelon',
    validSeasons: ['summer'],
    // Single-season — universal Summer association.
  },
  {
    id: 'pumpkin',
    emoji: '🎃',
    nameKey: 'season_foods.pumpkin',
    validSeasons: ['autumn'],
    // Single-season — strong Autumn cultural cue.
  },
  {
    id: 'cabbage',
    emoji: '🥬',
    marker: 'cabbage',
    nameKey: 'season_foods.cabbage',
    validSeasons: ['winter'],
    // Single-season here — cabbage is the canonical Winter brassica even
    // though it has wider real-world range. Simplified for clarity.
  },
  {
    id: 'carrot',
    emoji: '🥕',
    nameKey: 'season_foods.carrot',
    validSeasons: ['autumn', 'winter'],
    // Multi-season root crop in the original 12-item set.
  },
  {
    id: 'pepper',
    emoji: '🫑',
    nameKey: 'season_foods.pepper',
    validSeasons: ['spring', 'summer'],
    // Multi-season warm crop in the original 12-item set.
  },
  // ─── Extended set (2026-05-19) ────────────────────────────
  // Partner spec says "six seed types"; deliberate deviation to 12 for richer
  // combinations + variety per user request. Documented in v3 docx annotations.
  // These six additions are single-season (keeps the original set at 2/12 multi-season).
  {
    id: 'tomato',
    emoji: '🍅',
    nameKey: 'season_foods.tomato',
    validSeasons: ['summer'],
  },
  {
    id: 'cucumber',
    emoji: '🥒',
    nameKey: 'season_foods.cucumber',
    validSeasons: ['summer'],
  },
  {
    id: 'corn',
    emoji: '🌽',
    nameKey: 'season_foods.corn',
    validSeasons: ['summer'],
  },
  {
    id: 'eggplant',
    emoji: '🍆',
    nameKey: 'season_foods.eggplant',
    validSeasons: ['summer'],
  },
  {
    id: 'grape',
    emoji: '🍇',
    nameKey: 'season_foods.grape',
    validSeasons: ['autumn'],
  },
  {
    id: 'broccoli',
    emoji: '🥦',
    nameKey: 'season_foods.broccoli',
    validSeasons: ['winter'],
  },
  // ─── Randomised-round pool additions (2026-08-18) ─────────
  {
    id: 'lettuce',
    emoji: '🥬',
    nameKey: 'season_foods.lettuce',
    validSeasons: ['summer', 'autumn', 'winter'],
  },
  {
    id: 'spinach',
    emoji: '🌿',
    marker: 'spinach',
    nameKey: 'season_foods.spinach',
    validSeasons: ['autumn', 'winter'],
  },
  {
    id: 'onion',
    emoji: '🧅',
    nameKey: 'season_foods.onion',
    validSeasons: ['autumn', 'winter'],
  },
  {
    id: 'peas',
    emoji: '🌱',
    marker: 'peas',
    nameKey: 'season_foods.peas',
    validSeasons: ['autumn', 'winter'],
  },
  {
    id: 'green_beans',
    emoji: '🌱',
    marker: 'green_beans',
    nameKey: 'season_foods.green_beans',
    validSeasons: ['spring', 'summer'],
  },
  {
    id: 'zucchini',
    emoji: '🥒',
    nameKey: 'season_foods.zucchini',
    validSeasons: ['spring', 'summer'],
  },
];

const MIN_CHOICES_PER_SEASON = 2;

// Small deterministic PRNG: good for fair game shuffling and reproducible QA.
// It is not intended for security-sensitive randomness.
function createSeededRandom(roundSeed) {
  let value = roundSeed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(items, roundSeed) {
  const shuffled = [...items];
  const random = createSeededRandom(roundSeed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

/**
 * Pick a reproducible subset while guaranteeing that no season becomes
 * unplayable. A crop may satisfy more than one season, so the guarantee does
 * not force eight dedicated crates into every round.
 */
export function selectGardenSeeds(catalog, count, roundSeed) {
  if (!Array.isArray(catalog) || !Number.isInteger(count) || count < 1 || count > catalog.length) {
    throw new RangeError('Garden seed selection needs a valid catalog and item count.');
  }

  const uniqueIds = new Set(catalog.map((seed) => seed.id));
  if (uniqueIds.size !== catalog.length) {
    throw new Error('Garden seed catalog contains duplicate ids.');
  }

  const shuffled = shuffleWithSeed(catalog, Number(roundSeed) >>> 0);
  const selected = [];
  const selectedIds = new Set();
  const add = (seed) => {
    if (!seed || selectedIds.has(seed.id)) return;
    selected.push(seed);
    selectedIds.add(seed.id);
  };

  for (const season of SEASONS) {
    while (selected.filter((seed) => seed.validSeasons.includes(season)).length
      < MIN_CHOICES_PER_SEASON) {
      const candidate = shuffled.find((seed) => (
        !selectedIds.has(seed.id) && seed.validSeasons.includes(season)
      ));
      if (!candidate || selected.length >= count) {
        throw new Error(`Garden seed catalog cannot provide two choices for ${season}.`);
      }
      add(candidate);
    }
  }

  for (const seed of shuffled) {
    if (selected.length >= count) break;
    add(seed);
  }

  // Coverage is chosen constructively above; shuffle once more so the guaranteed
  // choices do not always occupy the same visual clusters in the garden room.
  return shuffleWithSeed(selected, (Number(roundSeed) ^ 0xA511E9B3) >>> 0);
}

/** True only when this crop already occupies a plot in the requested season. */
export function isSeedUsedInSeason(plots, seedId, season) {
  return Array.isArray(plots) && plots.some((plot) => (
    plot?.season === season && plot?.seed?.id === seedId
  ));
}

export function createGardenRoundSeed(cryptoSource = globalThis.crypto) {
  if (cryptoSource?.getRandomValues) {
    const value = new Uint32Array(1);
    cryptoSource.getRandomValues(value);
    return value[0];
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

export function resolveGardenRoundSeed(mission, suppliedSeed, generateSeed = createGardenRoundSeed) {
  if (mission !== 'GardenPlanner') return null;
  if (Number.isInteger(suppliedSeed)) return suppliedSeed >>> 0;
  return generateSeed();
}


// Stable fact ids → source + the two text layers, exactly as GROWING_REVEALS and
// SOIL_REVEALS in growing.js:
//   `quote` = the verbatim passage, pinned by test to public/source.html and shown
//             behind the source pill / Press S. Never reword it.
//   `plain` = what the child reads on the toast: our own sentence for ages 9-14.
//
// Three of these quotes were NOT verbatim and only three_sisters was
// test-pinned, so nothing caught it. good_soil had gained a hyphen the source does
// not have; compost had dropped an ellipsis and cut "and holds everything together"
// with no marker; pollination had replaced the source's subject ("They" = heirloom
// seeds) with "Plants", widening a claim about heirloom seeds into one about every
// plant. All three now carry the exact source wording.
export const GARDEN_FACTS = {
  good_soil: {
    sourceId: 'regenerative-agriculture',
    quote: 'Healthy soil produces more nutrient dense food.',
    plain: 'Healthy soil grows food with more vitamins and minerals in every bite.',
  },
  compost: {
    sourceId: 'grow-regeneratively-home',
    quote: 'Compost… is like the glue for the soil. It gives nitrogen and potassium and holds everything together.',
    plain: 'Compost holds the soil together like glue. It gives the soil two foods that plants need, nitrogen and potassium.',
  },
  pollination: {
    sourceId: 'heirloom-seeds',
    quote: 'They are open-pollinated, which means they rely on natural pollination from insects or wind.',
    // Same source sentence as 1.1's heirloom-open-pollinated, so the island says it
    // with one wording, not two.
    plain: 'Old varieties are pollinated the natural way, by insects and by the wind.',
  },
  three_sisters: {
    sourceId: 'three-sisters-nps',
    quote: 'Corn serves as a trellis, providing a framework for the beans to grow and wrap around. Beans, acting as a natural fertilizer, add nitrogen to the soil…',
    // The old card stopped on the ellipsis, so the squash — a third of the answer the
    // child had just chosen — was missing. Restored from the source's next sentence.
    plain: 'Corn grows tall and the beans climb up it. Beans add nitrogen to the soil, which is food for plants. The wide squash leaves keep the soil cool and damp and stop weeds.',
  },
  heirloom: {
    sourceId: 'heirloom-seeds',
    // Same source sentence as 1.1's heirloom-nutrient — one wording across the island.
    quote: 'Heirloom varieties can have higher nutrient-density.',
    plain: 'Old, traditional varieties can carry more vitamins and minerals in every bite.',
  },
};

// Stable fact id → the child-facing text (single source of truth for defaultValue
// fallback). en.json has NO garden.facts block — English falls back via i18next
// defaultValue to these strings, mirroring the WhereDoesItGrow pattern.
export const GARDEN_FACT_TEXTS = Object.fromEntries(
  Object.entries(GARDEN_FACTS).map(([id, f]) => [id, f.plain]),
);

// Stable fact id → source id. Drives the source pill via feedbackFactId (not text-based).
// seedling_care is intentionally absent — no public source yet.
export const FACT_SOURCE_BY_ID = Object.fromEntries(
  Object.entries(GARDEN_FACTS).map(([id, f]) => [id, f.sourceId]),
);

// ─── Decision events — WIRED ─────────────
// 4 of the 11 events from the partner-provided «How to care for your garden»
// Conditions/Options table. One per season, fired after the FIRST planting of that
// season so the card lands mid-care, not on top of the tutorial.
// Option order/labels follow the partner table exactly (correct ≠ always A).
// Feedback messages: partner-table lines for seed_choice/pests; companions + pollinators show
// the TRANSLATED sourced fact via factId (garden.facts.* + source pill by FACT_SOURCE_BY_ID).
export const DECISION_EVENTS = [
  {
    id: 'seed_choice',
    season: 'autumn',
    emoji: '🌱',
    options: [
      { id: 'heirloom_local', emoji: '🌾', correct: true },
      { id: 'imported',       emoji: '📦', correct: false },
      { id: 'artificial',     emoji: '🧪', correct: false },
    ],
  },
  {
    id: 'companions',
    season: 'winter',
    emoji: '🌽',
    factId: 'three_sisters',
    options: [
      { id: 'corn_beans_squash', emoji: '🌽', correct: true },
      { id: 'tomato_nothing',    emoji: '🍅', correct: false },
      { id: 'potato_plastic',    emoji: '🥔', correct: false },
    ],
  },
  {
    id: 'pollinators',
    season: 'spring',
    emoji: '🐝',
    options: [
      { id: 'sunflower', emoji: '🌻', correct: false },
      { id: 'lavender',  emoji: '🌿', correct: false },
      { id: 'both',      emoji: '🐝', correct: true },
    ],
    factId: 'pollination',
  },
  {
    id: 'pests',
    season: 'summer',
    emoji: '🐛',
    options: [
      { id: 'chemical', emoji: '🧪', correct: false },
      { id: 'natural',  emoji: '🐞', correct: true },
    ],
  },
];

// ─── FUTURE content — NOT WIRED to gameplay ─────────────────
// The remaining 7 of the 11 decision events from the same table (4 wired above
// as DECISION_EVENTS). Kept for review traceability; wire only with a confirmed slot in the flow.
export const FUTURE_DECISION_EVENTS = [
  { id: 'drought',          condition: 'There is drought. What protects soil?',                       correct: 'mulch' },
  { id: 'weak_soil',        condition: 'Soil is weak and dry. What do you add?',                       correct: 'compost' },
  { id: 'help_most',        condition: 'What helps your garden most?',                                 correct: 'flowers_bees' },
  { id: 'seedlings_dying',  condition: 'Why are the seedlings dying?',                                 correct: 'low_temperatures' },
  { id: 'worms',            condition: 'You see worms in the soil. What do you do?',                    correct: 'all_above' },
  { id: 'soil_protect',     condition: 'What protects soil?',                                           correct: 'clover' },
  { id: 'companion_combo',  condition: 'Companion combo?',                                              correct: 'tomato_basil' },
];
