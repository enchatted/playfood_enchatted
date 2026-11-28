// foodwaste.js — Island 3 · Meal Planner (Practice).
//
// Teaches the LOCKED [S] goal: "Reduce food waste through planning, storage, portioning, or
// reuse" (ksav.js). Flow: PLAN → SHOP (category-stall) → RESULTS.
// «Build 3 balanced plates — empty the fridge first, then buy ONLY what's missing, with the
//  best choice for each socket.» Orthogonality (CC): Nutrition = the structure was completed
// (gate), Sustainability = the QUALITY of the choices (dominant differentiator) — they do not
// compete. Every axis WEIGHT is a parameter (AXIS_WEIGHTS), so a nutrition-first balance is a one-line tweak.

import { FOOD_ITEMS } from './foods.js';

const FOOD_BY_ID = Object.fromEntries(FOOD_ITEMS.map((f) => [f.id, f]));

// ── Axis weights — SUSTAINABILITY dominant. Tunable; the grader normalises by their sum,
// so they need not add to 1. For a nutrition-first balance, raise `nutrition`.
export const AXIS_WEIGHTS = { sustainability: 0.5, waste: 0.3, nutrition: 0.2 };

// Plant-forward (low-footprint) categories for the per-socket sustainability quality.
const PLANT_CATEGORIES = new Set(['vegetable', 'fruit', 'legume', 'grain']);

// CO2 thresholds (kg CO2e/kg, from foods.js) → a 0/0.5/1 band. (unchanged)
function carbonScore(co2) {
  if (co2 <= 1.5) return 1;
  if (co2 <= 4) return 0.5;
  return 0;
}

// Processed items carry the source brief's flat sustainability penalty. In normal play only the
// explicitly typed processed meats can reach a plate; blocked drinks never enter the score.
// The axis is floored at 0, so a lower-quality choice can never make the score negative. (FIX#4)
const PROCESSED_PENALTY = 0.5;

// ── Axis A · SUSTAINABILITY (dominant · per-socket quality · unchanged logic · FIX#4) ──
// Plant-forward + low-carbon + in-season, minus a penalty for processed junk. Mean over the
// chosen ingredients, floored at 0 → 0..1. `season` comes from the active scenario.
export function scoreSustainability(itemIds, season = 'all') {
  if (!itemIds.length) return 0;
  let sum = 0;
  let counted = 0;
  for (const id of itemIds) {
    const f = FOOD_BY_ID[id];
    if (!f) continue;
    if (f.processed) { sum -= PROCESSED_PENALTY; counted++; continue; }
    const plant = PLANT_CATEGORIES.has(f.category) ? 1 : 0;
    const seasonal = f.season === 'all' || f.season === season ? 1 : 0;
    sum += plant * 0.5 + carbonScore(f.co2) * 0.3 + seasonal * 0.2;
    counted++;
  }
  return counted ? Math.max(0, sum / counted) : 0;
}

// ── Axis B · WASTE = use-inventory-first + check-before-you-buy ──
// Fraction of the tracked (at-risk) inventory the plan consumes, minus redundant purchases.
// Count one redundant purchase per distinct food bought while its home supply remains unused.
// The live and final scores both use the foods on the plates.
// `homeIds` = the whole home inventory (defaults to the tracked list). → 0..1.
export function scoreWaste(planIds, inventoryIds, boughtIds = [], homeIds = inventoryIds) {
  if (!inventoryIds.length) return 1; // nothing to waste
  const used = new Set(planIds);
  const bought = new Set(boughtIds);
  const consumed = inventoryIds.filter((id) => used.has(id)).length;
  const redundant = new Set(homeIds.filter((id) => bought.has(id) && !used.has(id))).size;
  const raw = (consumed - redundant) / inventoryIds.length;
  return Math.max(0, Math.min(1, raw));
}

// ── Axis C · NUTRITION = SLOT-COMPLETENESS ──
// "Balanced" = the required plate sockets are filled. Structure gate, NOT macros: a fully built
// set of plates = 1.0 → the gate teaches structure, Sust+Waste are the live differentiators.
// → filled required sockets / total required sockets, 0..1.
export function scoreNutrition(plates) {
  let filled = 0;
  let total = 0;
  for (const p of plates) {
    for (const s of p.slots) {
      total += 1;
      if (s.item) filled += 1;
    }
  }
  return total ? filled / total : 0;
}

// Float sums can land one ulp under a threshold (0.35 + 0.2 === 0.5499999999999999), which
// would show 55% with no star. Compare with a tolerance far below the smallest real score step
// (~1e-4); weights, thresholds and the returned pct (credited points) stay exactly as they are.
const THRESHOLD_EPSILON = 1e-9;
const reaches = (pct, threshold) => pct + THRESHOLD_EPSILON >= threshold;

// ── Weighted grade (PRIMITIVE, pass 55%) ──
// Combines the three axis scores (each 0..1) by AXIS_WEIGHTS → normalised pct + tier.
export function gradeMealPlan({ sustainability = 0, waste = 0, nutrition = 0 }, weights = AXIS_WEIGHTS) {
  const w = weights;
  const max = w.sustainability + w.waste + w.nutrition;
  const total = sustainability * w.sustainability + waste * w.waste + nutrition * w.nutrition;
  const pct = max > 0 ? total / max : 0;
  let tier = 'fail';
  if (reaches(pct, 0.85)) tier = 'perfect';
  else if (reaches(pct, 0.7)) tier = 'great';
  else if (reaches(pct, 0.55)) tier = 'pass';
  return { pct, tier, passed: reaches(pct, 0.55) };
}

export function mealPlannerStarsForPct(pct) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return 0;
  const safePct = Math.max(0, Math.min(1, pct));
  if (!reaches(safePct, 0.55)) return 0;
  if (!reaches(safePct, 0.7)) return 1;
  if (!reaches(safePct, 0.85)) return 2;
  return 3;
}

// ── Plate templates (source-backed) — 14 required sockets ──────────────────
// breakfast [carb][protein][fruit][fruit]; lunch/dinner [carb][protein][veg][veg][fruit].
// The source brief also mentioned an optional third vegetable, but the playable state and
// strict completion gate expose only these 14 slots. We therefore make no unreachable bonus
// promise in scoring; a future playable slot must arrive with its own interaction contract.
export const PLATES = [
  { meal: 'breakfast', sockets: ['carb', 'protein', 'fruit', 'fruit'] },
  { meal: 'lunch', sockets: ['carb', 'protein', 'veg', 'veg', 'fruit'] },
  { meal: 'dinner', sockets: ['carb', 'protein', 'veg', 'veg', 'fruit'] },
];

const REQUIRED_SLOT_COUNT = 14;

// ── category → plate socket type. grain→carb · legume/protein/meat→protein ·
// vegetable→veg · fruit→fruit · dairy/extra→null, except honest food-specific overrides below. ──
const CATEGORY_TO_SLOT = {
  grain: 'carb',
  legume: 'protein',
  protein: 'protein',
  meat: 'protein',
  vegetable: 'veg',
  fruit: 'fruit',
  // dairy, extra → null (no socket)
};

// The processed penalty must describe a choice the child can actually make. These foods are
// unambiguously meat/protein foods despite the shared dataset grouping all distractors under
// `extra`; drinks and mixed dishes remain blocked instead of receiving a misleading slot type.
const FOOD_TO_SLOT = {
  chicken_nuggets: 'protein',
  processed_ham: 'protein',
  processed_sausage: 'protein',
};
export function slotTypeOf(id) {
  const f = FOOD_BY_ID[id];
  return f ? (FOOD_TO_SLOT[id] ?? CATEGORY_TO_SLOT[f.category] ?? null) : null;
}

// ── direct-fill: does `foodId` fit an OPEN socket of its slot type on this plate? ──
// Junk / dairy (slotType null) fit nothing → the blocked-from-socket teach-moment.
export function fitsSocket(foodId, plateState) {
  const type = slotTypeOf(foodId);
  if (!type) return false;
  return plateState.slots.some((s) => s.type === type && !s.item);
}

// ── 3 seasonal scenarios ──────────────────────────────────────────────────────────────
// Each: { id, season, homeInventory[6, ≥2 at-risk], market{carb,protein,veg,fruit,extra} }.
// Built from existing seasonal FOOD_ITEMS so every id resolves (no new foods needed). Locked
// invariants (tested): (α) solvable — the market supplies every required slot type · (β) ≥2
// at-risk home items · (γ) ≥1 "already have it" trap (id in BOTH home and market) · (δ) ≥1 junk
// distractor (non-empty extra, slotType null) · (ε) ≥1 plant-vs-animal protein choice.
export const SCENARIOS = [
  {
    id: 'summer_garden',
    season: 'summer',
    // at-risk: strawberry(3) · banana(4) · bread(1)
    homeInventory: ['tomato', 'cucumber', 'strawberry', 'banana', 'bread', 'egg'],
    market: {
      carb: ['bread', 'rice'],
      protein: ['chicken', 'lentils', 'processed_ham'], // animal + plant + processed choice
      veg: ['tomato', 'bell_pepper'],
      fruit: ['banana', 'cherry'],
      extra: ['soda'], // junk distractor
    },
  },
  {
    id: 'autumn_harvest',
    season: 'autumn',
    // at-risk: mushroom(3) · bread(1) · banana(4)
    homeInventory: ['mushroom', 'pumpkin', 'bread', 'rice', 'banana', 'egg'],
    market: {
      carb: ['rice', 'pasta'],
      protein: ['fish', 'lentils', 'chicken_nuggets'], // animal + plant + processed choice
      veg: ['pumpkin', 'mushroom', 'leek'],
      fruit: ['apple', 'banana'],
      extra: ['soda'],
    },
  },
  {
    id: 'winter_pantry',
    season: 'winter',
    // at-risk: bread(1) · banana(4)
    homeInventory: ['orange', 'kale', 'bread', 'banana', 'rice', 'egg'],
    market: {
      carb: ['rice', 'pasta', 'bread'],
      protein: ['chicken', 'lentils', 'processed_sausage'], // animal + plant + processed choice
      veg: ['kale', 'chicory'],
      fruit: ['banana', 'mandarin', 'strawberry'], // strawberry = out-of-season sustainability trap
      extra: ['sugary_juice'],
    },
  },
];

// ── Picker: random without an immediate repeat; deterministic by index in testMode. ──
export function pickScenario({ index, lastId } = {}) {
  if (index != null) return SCENARIOS[index];
  const pool = lastId ? SCENARIOS.filter((s) => s.id !== lastId) : SCENARIOS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── At-risk inventory (short shelf, ≤4 days) — Waste urgency + PLAN "Use me first!". (unchanged) ──
export function atRiskInventory(inventoryIds, maxShelfDays = 4) {
  return inventoryIds.filter((id) => (FOOD_BY_ID[id]?.shelfDays ?? 99) <= maxShelfDays);
}

// ── Spoilage consequence: at-risk HOME items NOT used from the fridge spoil at RESULTS.
// "Used from the fridge" = placed in a plate slot with source==='home'. A consequence, not a
// point penalty (it already lowers Waste); spoiledIds surfaces it («🗑️ n χάλασαν»). ──
export function spoiledIds(plates, scenario) {
  const atRisk = atRiskInventory(scenario.homeInventory);
  const homeUsed = new Set(
    plates.flatMap((p) => p.slots.filter((s) => s.item && s.source === 'home').map((s) => s.item)),
  );
  return atRisk.filter((id) => !homeUsed.has(id));
}

// ── Score a built plan: plate-state + season (+ scenario for Waste).
// Bridges plate-state → the unchanged primitives: Sustainability over the flat filled ids,
// Nutrition over slot-completeness, Waste over the at-risk fridge (home-sourced placements
// consume it; a bought food whose home copy stays unused cancels one credit). → { axes, pct, tier, passed }. ──
export function scorePlan(plates, { season = 'all', scenario = null, weights = AXIS_WEIGHTS } = {}) {
  const filled = plates.flatMap((p) => p.slots.filter((s) => s.item));
  const allIds = filled.map((s) => s.item);
  const homeUsedIds = filled.filter((s) => s.source === 'home').map((s) => s.item);
  const boughtIds = filled.filter((s) => s.source === 'market').map((s) => s.item);
  const atRisk = scenario ? atRiskInventory(scenario.homeInventory) : [];
  const axes = {
    sustainability: scoreSustainability(allIds, season),
    waste: scenario ? scoreWaste(homeUsedIds, atRisk, boughtIds, scenario.homeInventory) : 1,
    nutrition: scoreNutrition(plates),
  };
  return { axes, ...gradeMealPlan(axes, weights) };
}

// Live feedback uses the same quality calculation as the final result, but each incomplete
// axis contributes only its share of the 14 required slots. This prevents one excellent first
// item from lighting a star while preserving exact scorePlan equality at strict completion.
export function scorePlanProgress(plates, options = {}) {
  const final = scorePlan(plates, options);
  const filledCount = plates.reduce(
    (count, plate) => count + plate.slots.filter((slot) => slot.item).length,
    0,
  );
  const completion = Math.max(0, Math.min(1, filledCount / REQUIRED_SLOT_COUNT));
  if (completion === 1) return final;

  const axes = {
    sustainability: final.axes.sustainability * completion,
    waste: final.axes.waste * completion,
    nutrition: final.axes.nutrition,
  };
  return { axes, ...gradeMealPlan(axes, options.weights ?? AXIS_WEIGHTS) };
}

// ── Public food-waste facts ──────────────────────────────────────────────────────────────
// Two public UNEP statistics carried verbatim from the foodeducators blurb
// (attributed to UNEP) — surfaced as a «Did you know?» fact card at RESULTS. VERBATIM with
// honest elision («…» = marked omission, NOT a fabricated bridge). Off-list companion stats
// (foodprint/WRI/OWID) stay HOLD until a partner verdict.
// Two layers: `plain` is our child-facing sentence shown on the card
// (translated via meal_planner.facts.*); the verbatim quote stays behind the chip.
export const WASTE_FACTS_SOURCE = 'food-waste-food-loss';
export const WASTE_FACTS = [
  {
    id: 'unep_meals',
    sourceId: WASTE_FACTS_SOURCE,
    provisional: true,
    quote: '1 billion meals of edible food… wasted every single day',
    plain: 'Every single day, about 1 billion meals of food are wasted. That food was still good to eat.',
  },
  {
    id: 'unep_trillion',
    sourceId: WASTE_FACTS_SOURCE,
    provisional: true,
    quote: 'over US$1 trillion worth of food… thrown away every year',
    plain: 'Every year, the food we throw away is worth more than 1 trillion US dollars. A trillion is a million millions.',
  },
];

export { FOOD_BY_ID };
