// Island 1 · Growing Our Own Food — data for G1.1 Where Does It Grow (HOOK).
// Origin-sorting deck + verbatim "Did you know?" facts. Facts cite SOURCES keys
// from sources.js — never invent a fact or a URL.

// The 4 growing spots the player delivers food to.
export const SPOTS = [
  { key: 'tree',  emoji: '🌳' }, // fruit on woody trees
  { key: 'vine',  emoji: '🌿' }, // soft above-ground plants & vines
  { key: 'soil',  emoji: '' }, // underground — drawn as animated plowed soil + tiny 🚜 (renderer), no static icon
  { key: 'grain', emoji: '🌾' }, // cereal grasses
];

// Sorting pool. origin ∈ SPOTS[].key. Reuses ids/emoji from foods.js where they overlap.
export const PLANT_ORIGINS = [
  // tree
  { id: 'apple',  emoji: '🍎', origin: 'tree' },
  { id: 'orange', emoji: '🍊', origin: 'tree' },
  { id: 'cherry', emoji: '🍒', origin: 'tree' },
  { id: 'lemon',  emoji: '🍋', origin: 'tree' },
  { id: 'peach',  emoji: '🍑', origin: 'tree' },
  // vine / above-ground
  { id: 'tomato',      emoji: '🍅', origin: 'vine' },
  { id: 'strawberry',  emoji: '🍓', origin: 'vine' },
  { id: 'bell_pepper', emoji: '🫑', origin: 'vine' },
  { id: 'cucumber',    emoji: '🥒', origin: 'vine' },
  { id: 'grapes',      emoji: '🍇', origin: 'vine' },
  { id: 'beans',       emoji: '🫘', origin: 'vine' },
  // soil / underground
  { id: 'potato', emoji: '🥔', origin: 'soil' },
  { id: 'carrot', emoji: '🥕', origin: 'soil' },
  { id: 'onion',  emoji: '🧅', origin: 'soil' },
  { id: 'garlic', emoji: '🧄', origin: 'soil' },
  // grain
  { id: 'wheat', emoji: '🌾', origin: 'grain' },
  { id: 'rice',  emoji: '🍚', origin: 'grain' },
  { id: 'corn',  emoji: '🌽', origin: 'grain' },
];

// Diversity facts. `scope` tells the renderer how to frame the fact:
//   'item'     → about the specific held food (trigger.foodId)
//   'category' → about the food's growing group (trigger.origin)
//   'general'  → about food/farming in general; the intro and the fallback pool.
// `trigger.intro: true` = shown once at game start. General reveals (no trigger)
// surface when a placement has no item/category match, so feedback always relates
// to food — never implying it's about the specific item.
//
// TWO LAYERS:
//   `quote` = the exact verbatim passage from the cited source, pinned
//             by test to source.html and shown behind the source badge / Press S.
//             NEVER reword it; the authenticity guard is what keeps it honest.
//   `plain` = what the child reads on the card: our own sentence for ages 9-14.
//             Every number and claim must come from `quote`.
// `retired: true` = still cited and translated, but never dealt into play.
// Never invent a fact or attach one to a food it doesn't mention.
export const GROWING_REVEALS = [
  { id: 'nine-species', scope: 'general', trigger: { intro: true }, sourceId: 'food-diversity',
    quote: 'in the last 50 years, the world mostly grows just nine species, making diets across the globe homogenised.',
    plain: 'People have grown thousands of different plants for food. In the last fifty years, farms around the world have mostly grown the same nine plant species.' },
  { id: 'three-crops', scope: 'category', trigger: { origin: 'grain' }, sourceId: 'heirloom-seeds',
    quote: '…we depend only on three – corn, rice and wheat – for 60% of our total calorie consumption.',
    plain: 'Three plants feed most of the world. Corn, rice and wheat give people 60% of all the energy they eat.' },
  // Retired from play: says the same thing as three-crops on the same trigger with a
  // different figure, so a child placing wheat then rice got one lesson twice.
  { id: 'fifty-percent', scope: 'category', trigger: { origin: 'grain' }, sourceId: 'food-diversity', retired: true,
    quote: 'Rice, wheat and maize provide 50% of all calories!',
    plain: 'Rice, wheat and maize give people half of all the energy they eat.' },
  { id: 'potato-park', scope: 'item', trigger: { foodId: 'potato' }, sourceId: 'heirloom-seeds',
    quote: 'houses around 2,300 of the 4,000 varieties of potatoes known in the world…',
    plain: 'There are about 4,000 kinds of potato in the world. One park in Peru looks after 2,300 of them.' },
  // General-food facts — surfaced as a relevant fallback so placements without an
  // item/category match still teach something true about food (never item-specific).
  { id: 'six-thousand-species', scope: 'general', trigger: null, sourceId: 'food-diversity',
    quote: 'Over the years humans have cultivated 6.000 plant species over time of existence.',
    plain: 'Over the years, people have grown 6,000 different kinds of plant for food.' },
  { id: 'diversified-farming', scope: 'general', trigger: null, sourceId: 'food-diversity',
    quote: 'Diversified farming systems can increase household dietary diversity and nutritional status.',
    plain: 'When a farm grows many different crops, the families nearby eat a wider variety of food and stay healthier.' },
  { id: 'heirloom-nutrient', scope: 'general', trigger: null, sourceId: 'heirloom-seeds',
    quote: 'Heirloom varieties can have higher nutrient-density.',
    plain: 'Old, traditional varieties can carry more vitamins and minerals in every bite.' },
  { id: 'heirloom-open-pollinated', scope: 'general', trigger: null, sourceId: 'heirloom-seeds',
    quote: 'They are open-pollinated, which means they rely on natural pollination from insects or wind.',
    plain: 'Old varieties are pollinated the natural way, by insects and by the wind.' },
  { id: 'crop-diversity-loss', scope: 'general', trigger: null, sourceId: 'heirloom-seeds',
    quote: 'a reduction in the crop-genetic diversity by a gapping of 75%.',
    plain: "Three quarters of the world's crop variety has already been lost." },
];

const GUARANTEED = ['corn', 'rice', 'wheat', 'potato']; // ensure fact triggers can fire

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build an n-card round: guaranteed trigger foods first, then random fill, then shuffle.
export function buildDeck(n = 10) {
  const byId = Object.fromEntries(PLANT_ORIGINS.map((p) => [p.id, p]));
  const picked = GUARANTEED.map((id) => byId[id]).filter(Boolean);
  const rest = shuffle(PLANT_ORIGINS.filter((p) => !GUARANTEED.includes(p.id)));
  while (picked.length < n && rest.length) picked.push(rest.shift());
  return shuffle(picked).slice(0, n);
}

// First-try star rating (0–3). Drives BOTH the live top-bar tracker and the
// final ResultScreen grade so the lit stars always match. f = foods placed
// correctly on the FIRST attempt; thresholds 30/60/100% → 1/2/3 stars (the 1st
// star comes early so the bar fills from the start, not only the back half).
export function starsForFirstTry(firstTryCount, total) {
  if (!total) return 0;
  const r = firstTryCount / total;
  if (firstTryCount >= total) return 3;
  if (r >= 0.6) return 2;
  if (r >= 0.3) return 1;
  return 0;
}

// No-fail grade: completing the run = passing. The stars + tier carry the
// nuance (perfect/great/pass/fail-soft), never a gate. `passed` is ALWAYS true.
export function gradeWhereDoesItGrow(firstTryCount, total) {
  const stars = starsForFirstTry(firstTryCount, total);
  const tier = ['fail', 'pass', 'great', 'perfect'][stars];
  return { passed: true, stars, tier };
}

// Tier → star count (any tier-based game can use this). Garden uses 'excellent'; WDIG uses 'great'.
export function starsForTier(tier) {
  return { perfect: 3, excellent: 2, great: 2, pass: 1, fail: 0 }[tier] || 0;
}

// GardenPlanner grade: healthyHarvests → {passed, stars, tier}. Thresholds MATCH the
// existing ResultScreen logic (8→perfect, 6→excellent, 5→pass, else fail).
export function gradeGardenPlanner(healthyHarvests) {
  let tier = 'fail';
  if (healthyHarvests >= 8) tier = 'perfect';
  else if (healthyHarvests >= 6) tier = 'excellent';
  else if (healthyHarvests >= 5) tier = 'pass';
  return { passed: healthyHarvests >= 5, stars: starsForTier(tier), tier };
}

// Live star signal for the GardenPlanner top bar (0-3). Pass a "secured count":
// the number of plots that are non-wilted AND fully watered (health >= 2). Such
// plots are guaranteed to become healthy harvests — a wrong-tool harvest attempt
// is refused, and wilting can only happen in PLANT phase before health is raised.
// The secured count is therefore monotonically non-decreasing, converges to the
// final healthyHarvests at the end of the run, and maps through the same
// gradeGardenPlanner thresholds (5/6/8) — so live stars == final stars at end.
export function liveStarsForHarvests(securedCount) {
  return gradeGardenPlanner(securedCount).stars;
}

// How many "about food in general" cards a single round may show, so
// cards do not feel like random facts: only 3 facts are tied to a food, so the general
// pool used to fill 5 of the 8 cards in a round and every one of them followed an
// action it had nothing to do with. Past the cap a correct placement keeps its
// floating "Correct!" line and play carries on.
export const GENERAL_CARDS_PER_ROUND = 2;

// Pick a reveal for a placed food. Prefer a not-yet-shown item/category match
// (so feedback is about THIS food); else fall back to a not-yet-shown general
// food fact while the round is under GENERAL_CARDS_PER_ROUND; else null.
// Never returns the intro reveal or a retired one.
export function pickReveal(food, shownIds) {
  const matched = GROWING_REVEALS.find((rev) =>
    rev.trigger && !rev.trigger.intro && !rev.retired && !shownIds.has(rev.id) &&
    (rev.trigger.foodId === food.id || rev.trigger.origin === food.origin),
  );
  if (matched) return matched;
  const isGeneralPool = (rev) => !rev.trigger && !rev.retired && rev.scope === 'general';
  const generalShown = GROWING_REVEALS.filter((rev) => isGeneralPool(rev) && shownIds.has(rev.id)).length;
  if (generalShown >= GENERAL_CARDS_PER_ROUND) return null;
  const general = GROWING_REVEALS.find((rev) => isGeneralPool(rev) && !shownIds.has(rev.id));
  return general || null;
}

// ── Soil Doctor (G1.3 · CHALLENGE) ──────────────────────────
// Diagnose ailing plots and treat with the right NATURAL remedy. Chemical is a
// trap (poisons soil). Quotes are verbatim from the cited sources; sourceId → sources.js.
// AUTHENTICITY: compost/mulch/cover/no-till/chemical → grow-regeneratively-home;
// problem facts → soil-degradation; closing → regenerative-agriculture.

export const REMEDIES = [
  { key: 'mulch',    emoji: '🍂' },
  { key: 'compost',  emoji: '♻️' },
  { key: 'cover',    emoji: '🫘' },
  // No-till icon: earthworm (soil life the remedy protects). An axe read as
  // "chop/dig" — the semantic OPPOSITE of not tilling (C1 visual-language pass).
  { key: 'notill',   emoji: '🪱' },
  { key: 'chemical', emoji: '🧪', isTrap: true },
];

// 4 ailing plots — each needs ONE natural remedy. `masked` = looks lush but is sick.
export const SOIL_PLOTS = [
  { id: 'eroding',   neededRemedy: 'mulch',   masked: false },
  { id: 'spent',     neededRemedy: 'cover',   masked: false },
  { id: 'compacted', neededRemedy: 'notill',  masked: false },
  { id: 'lifeless',  neededRemedy: 'compost', masked: true  },
];

// Reveals, keyed by remedy (heal beat) + context beats. Two layers, exactly as
// GROWING_REVEALS above: `quote` is the verbatim passage pinned to source.html and
// shown behind Press S; `plain` is what the child reads on the card.
//
// Five quotes here were once NOT verbatim and no test caught it, because the
// authenticity guard only covered GROWING_REVEALS. Each is now the exact source text
// (intro re-cut in source order; cover taken from the viewer's own wording; notill's
// stray em dash removed; chemical's apostrophe matched; fail's separator restored).
export const SOIL_REVEALS = {
  mulch:    { sourceId: 'grow-regeneratively-home',
    quote: 'Covering the soil prevents soil erosion, keeps weeds from gaining a foothold, and limits water loss…',
    plain: 'Your cover stops the soil from blowing or washing away. It also blocks weeds and keeps water in the ground.' },
  cover:    { sourceId: 'grow-regeneratively-home',
    quote: 'Between seasons, introduce cover crops such as legumes (beans), which infuse the soil with nitrogen.',
    plain: 'You planted a cover crop, a low plant that grows between harvests. Beans put nitrogen, a natural plant food, back into the soil.' },
  notill:   { sourceId: 'grow-regeneratively-home',
    quote: '…the beneficial microbiome of the soil… gets exposed to air and sunlight, where it quite likely will die…',
    plain: "You did not dig the bed over, so the soil's tiny living helpers stayed safe. Turning the soil throws them into air and sunlight, where they are likely to die." },
  compost:  { sourceId: 'grow-regeneratively-home',
    quote: 'Compost… is like the glue for the soil. It gives nitrogen and potassium and holds everything together.',
    plain: 'Your compost works like glue and holds the soil together. It also feeds the soil with nitrogen and potassium, two foods that plants need.' },
  chemical: { sourceId: 'grow-regeneratively-home',
    quote: 'Don’t kill it with chemical pesticides and herbicides which poison the soil and create toxic runoff…',
    plain: 'That chemical poisons the living soil. Rain then washes the poison off the land into streams and rivers.' },
  intro:    { sourceId: 'soil-degradation',
    quote: 'We have already degraded one third of arable land worldwide and business as usual will only get things worse. 95% of our food come from the soil!',
    plain: 'The soil gives us 95% of everything we eat. One third of the world’s farming soil is already damaged.' },
  masked:   { sourceId: 'soil-degradation',
    quote: 'The adverse impacts can now be easily masked by application of fertilizers and use of supplemental irrigation.',
    plain: 'Fertiliser and extra watering can make sick soil look healthy. This plot looks green, but underneath it is still ill.' },
  win:      { sourceId: 'regenerative-agriculture',
    quote: 'Healthy soil produces more nutrient dense food.',
    plain: 'You healed all four beds. Healthy soil grows food with more vitamins and minerals in every bite.' },
  // Shown as a closing beat when the shared soil-health meter crashes to 0 (real fail state).
  fail:     { sourceId: 'soil-degradation',
    quote: 'Unhealthy soils = Lack of resilience. No soils = No food.',
    plain: 'Sick soil cannot bounce back from hard times. Without soil, there is no food at all.' },
};

export const SOIL_START_HEALTH = 100;
export const SOIL_PENALTY_WRONG = 8;
export const SOIL_PENALTY_CHEMICAL = 20;
export const SOIL_POINTS_HEAL = 25;
export const SOIL_POINTS_STUDY = 5; // bonus for diagnosing a plot before healing it

// Runtime plot objects (start sick + unhealed; renderer draws the bar).
// `diagnosed` gates the study bonus + masked reveal; `misses` drives the teach hints.
export function buildSoilPlots() {
  return SOIL_PLOTS.map((p) => ({ ...p, health: 30, healed: false, poisoned: false, diagnosed: false, misses: 0 }));
}

// Live star projection for SoilDoctor's header bar. Unlike the count-up games, SoilDoctor
// starts at 3★ ("keep your stars") and drops as the child uses chemicals or wrong remedies.
// Returns the stars the run would earn if completed cleanly from the current state; equals
// the final gradeSoilDoctor stars once all plots are healed. 0 if the soil has crashed.
export function liveStarsForSoilState({ soilHealth, chemicalUses, mistakes }) {
  if (soilHealth <= 0) return 0;
  if (chemicalUses === 0 && mistakes === 0) return starsForTier('perfect'); // 3
  if (chemicalUses === 0 && mistakes <= 2) return starsForTier('great');    // 2
  return starsForTier('pass');                                              // 1
}

// Pass = all plots healed AND soil survived. Tier by chemical/mistakes.
export function gradeSoilDoctor({ healedCount, plotCount, soilHealth, chemicalUses, mistakes }) {
  const passed = healedCount >= plotCount && soilHealth > 0;
  let tier = 'fail';
  if (passed) {
    if (chemicalUses === 0 && mistakes === 0) tier = 'perfect';
    else if (chemicalUses === 0 && mistakes <= 2) tier = 'great';
    else tier = 'pass';
  }
  return { passed, stars: starsForTier(tier), tier };
}
