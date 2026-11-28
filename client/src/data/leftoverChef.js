// leftoverChef.js — Island 3 · Leftover Chef (Challenge).
//
// Goal-MATCHING + food-safety, NOT "correct/wrong combination". Each round states a
// GOAL ("rescue the ingredients that spoil first"); ANY dish that uses the at-risk items
// meets it — there is no single hidden recipe. A parallel food-safety layer teaches
// verbatim EUFIC rules. Teach-don't-punish: a dish that misses the goal = amber nudge +
// retry, never a red ✗ or score penalty (the old −5 / shake / "doesn't make a dish").

export const FOOD_SAFETY_SOURCE = 'food-storage-fridge-freezer-cupboard';

// The 5 EUFIC food-safety facts — VERBATIM, checked against the live EUFIC food-safety page
// (Last Updated 19 Nov 2025), source-go (🟢). Locked as-is — including the
// HONEST ELISION in `two_hour` (the «…» marks omitted text; both sides are verbatim — this
// is a legitimate quotation elision, not a fabricated bridge).
// Two layers: `plain` is OUR child-facing sentence for the card; the lock
// covers the quote only, which stays verbatim behind the chip / «Press S»
// (live re-verified 2026-08-06).
export const FOOD_SAFETY_FACTS = {
  leftovers_days: {
    sourceId: FOOD_SAFETY_SOURCE,
    quote: 'Eat leftovers within 2-3 days.',
    plain: 'Eat your leftovers within 2 to 3 days.',
  },
  rice_one_day: {
    sourceId: FOOD_SAFETY_SOURCE,
    quote: 'Rice dishes should be used within 1 day, because rice can contain spores of Bacillus cereus that can survive cooking, and these can grow into bacteria.',
    plain: 'Eat rice dishes within 1 day. Rice can carry tiny spores that can survive cooking. Those spores can then grow into bacteria.',
  },
  freezing: {
    sourceId: FOOD_SAFETY_SOURCE,
    quote: 'freezing food does not kill bacteria but rather slows down their growth significantly.',
    plain: 'Freezing food does not kill bacteria. It only makes them grow much more slowly.',
  },
  reheat_once: {
    sourceId: FOOD_SAFETY_SOURCE,
    quote: 'do not heat it a second time and do not freeze it a second time either.',
    plain: 'Do not heat a leftover dish a second time. Do not freeze it a second time either.',
  },
  two_hour: {
    sourceId: FOOD_SAFETY_SOURCE,
    quote: "Remember the '2-hour rule': … cool and place foods in the fridge within 2 hours.",
    plain: 'Remember the 2-hour rule. Let your food cool and put it in the fridge within 2 hours.',
  },
};

// Leftover ingredients. `safety` ties an item to the food-safety fact it teaches (e.g.
// leftover rice → the 1-day Bacillus rule). `tag` groups items for goal-matching.
export const LEFTOVER_ITEMS = [
  { id: 'leftover_rice',  emoji: '🍚', tag: 'grain',   safety: 'rice_one_day' },
  { id: 'roast_chicken',  emoji: '🍗', tag: 'protein', safety: 'reheat_once' },
  { id: 'veg_soup',       emoji: '🥣', tag: 'veg',     safety: 'two_hour' },
  { id: 'frozen_peas',    emoji: '🫛', tag: 'veg',     safety: 'freezing' },
  { id: 'wilted_lettuce', emoji: '🥬', tag: 'veg' },
  { id: 'ripe_tomato',    emoji: '🍅', tag: 'veg' },
  { id: 'half_onion',     emoji: '🧅', tag: 'veg' },
  { id: 'brown_banana',   emoji: '🍌', tag: 'fruit' },
  { id: 'stale_bread',    emoji: '🍞', tag: 'grain' },
  { id: 'egg',            emoji: '🥚', tag: 'protein' },
  { id: 'cheese_end',     emoji: '🧀', tag: 'dairy' },
  { id: 'cooked_pasta',   emoji: '🍝', tag: 'grain',   safety: 'leftovers_days' },
];

// The MissionIntroCard fact slot. REUSES the locked 2-3-days rule
// verbatim (frames the game's rescue-before-it-spoils urgency); single source of truth,
// no new claim. Locked by leftoverChef.test.js.
export const LEFTOVER_INTRO_FACT = {
  sourceId: FOOD_SAFETY_SOURCE,
  quote: FOOD_SAFETY_FACTS.leftovers_days.quote,
  plain: FOOD_SAFETY_FACTS.leftovers_days.plain,
};

export const LEFTOVER_BY_ID = Object.fromEntries(LEFTOVER_ITEMS.map((i) => [i.id, i]));

// Rescue goals — each is a "use up the X" objective. A dish MEETS the goal when it uses
// every at-risk item the goal names (many dishes qualify; extra items are never "wrong").
export const RESCUE_GOALS = [
  { id: 'rescue_veg',   atRisk: ['wilted_lettuce', 'ripe_tomato'], minMatch: 2 },
  { id: 'rescue_rice',  atRisk: ['leftover_rice', 'half_onion'],   minMatch: 2 },
  { id: 'rescue_bread', atRisk: ['stale_bread', 'brown_banana'],   minMatch: 2 },
];

export const LEFTOVER_POINTS_PER_GOAL = 25;

export function isReservedForLaterGoal(foodId, goals, goalIndex) {
  if (goals[goalIndex]?.atRisk.includes(foodId)) return false;
  return goals.slice(goalIndex + 1).some(goal => goal.atRisk.includes(foodId));
}

export function liveLeftoverStars(score) {
  return Math.min(3, Math.max(0, Math.floor(score / LEFTOVER_POINTS_PER_GOAL)));
}

// Goal-matching: a dish meets a goal when it includes at least `minMatch` of the goal's
// at-risk items. No "wrong" items — extra ingredients never fail the round.
export function meetsGoal(dishIds, goal) {
  const used = new Set(dishIds);
  const matched = goal.atRisk.filter((id) => used.has(id)).length;
  return matched >= (goal.minMatch ?? goal.atRisk.length);
}

// Which at-risk items the player still has to rescue (drives the amber teach-don't-punish
// nudge instead of a "wrong combination" reject).
export function unmetItems(dishIds, goal) {
  const used = new Set(dishIds);
  return goal.atRisk.filter((id) => !used.has(id));
}

// Q acts as a real undo while the player is planning a dish: remove only the most
// recently added ingredient and leave the original array untouched.
export function undoLastPotItem(potItems) {
  const remaining = [...potItems];
  const item = remaining.pop() || null;
  return { item, remaining };
}

// Result tiers are derived from actual rescued goals rather than the raw score.
// Two of three goals is the game's existing pass threshold; all goals is perfect.
export function gradeLeftoverChef(completed, total = RESCUE_GOALS.length) {
  if (completed >= total) return 'perfect';
  if (completed >= Math.ceil(total * 2 / 3)) return 'pass';
  return 'fail';
}

// Two kinds of safety rule.
// GENERAL rules hold for ANY cooked leftover dish (EUFIC: 2-3 days; the 2-hour rule).
// ITEM rules are about one food and win over the general ones; when a dish holds several,
// the STRICTEST wins, whatever order the child added them in (rice 1 day first).
export const GENERAL_DISH_FACTS = ['leftovers_days', 'two_hour']; // order = tie-break
export const ITEM_RULE_PRIORITY = ['rice_one_day', 'reheat_once', 'freezing'];

// The food-safety fact a dish should surface. `shownKeys` = facts already shown in this
// play-through, oldest first (include the intro's 'leftovers_days'). With no item rule in
// the dish, the general rule shown least recently is picked, so the child never reads the
// same card twice in a row — also when an extra item (pasta, soup) carries a general rule.
export function safetyFactForDish(dishIds, shownKeys = []) {
  const present = new Set(
    dishIds.map((id) => LEFTOVER_BY_ID[id]?.safety).filter((k) => k && FOOD_SAFETY_FACTS[k]),
  );
  let key = ITEM_RULE_PRIORITY.find((k) => present.has(k));
  if (!key) {
    const lastShown = (k) => shownKeys.lastIndexOf(k);
    key = GENERAL_DISH_FACTS.reduce((best, k) => (lastShown(k) < lastShown(best) ? k : best));
  }
  return { key, ...FOOD_SAFETY_FACTS[key] };
}

// ─── «Ιδέα αξιοποίησης» — rescue ideas ──
// A small curated set. It is OUR game
// text (a dish name + one sentence), not a sourced fact: no health / nutrition claims. Key:
// goal id → the ONE extra item in the pot ('' = only the goal's two foods). Pot max = 3, so
// a dish has at most one extra. A combination without an entry gets the neutral note — we
// never invent a dish for it. Scoring, goals and safety cards are unaffected.
export const RESCUE_IDEAS = {
  rescue_veg: {
    '': { id: 'veg_soup_basic', emoji: '🍲' },
    veg_soup: { id: 'veg_soup_richer', emoji: '🍲' },
    frozen_peas: { id: 'veg_soup_peas', emoji: '🍲' },
    cooked_pasta: { id: 'veg_soup_pasta', emoji: '🍲' },
    roast_chicken: { id: 'veg_soup_chicken', emoji: '🍲' },
    egg: { id: 'veg_soup_egg', emoji: '🍲' },
    cheese_end: { id: 'veg_soup_cheese', emoji: '🍲' },
  },
  rescue_rice: {
    '': { id: 'fried_rice_onion', emoji: '🍛' },
    egg: { id: 'fried_rice_egg', emoji: '🍛' },
    frozen_peas: { id: 'fried_rice_peas', emoji: '🍛' },
    roast_chicken: { id: 'fried_rice_chicken', emoji: '🍛' },
    cheese_end: { id: 'baked_rice_cheese', emoji: '🥘' },
    veg_soup: { id: 'rice_soup', emoji: '🍲' },
  },
  rescue_bread: {
    '': { id: 'banana_toast', emoji: '🍞' },
    egg: { id: 'french_toast_banana', emoji: '🍞' },
  },
};

export const NEUTRAL_IDEA = { id: 'neutral', emoji: '🍽️' };

// «Άλλη ιδέα για το σπίτι». The goals keep the
// tomato (goal 1) and the bread (goal 3) apart, so «bread + tomato» can never be cooked here.
// It is shown as ONE extra home suggestion under the rescue idea of the bread goal — clearly
// separate from the dish the child cooked (also under the neutral note). Our text, no claim,
// no source; goals, items, points and safety cards are unaffected. goal id → home-idea key.
export const HOME_IDEAS = {
  rescue_bread: 'bread_tomato',
};

export function homeIdeaForGoal(goal) {
  return (goal && HOME_IDEAS[goal.id]) || null;
}

// The idea for a cooked dish — depends only on WHICH foods are in the pot, never their order.
export function rescueIdeaForDish(goal, dishIds) {
  const ideas = (goal && RESCUE_IDEAS[goal.id]) || {};
  const atRisk = goal?.atRisk || [];
  const extras = [...new Set(dishIds)].filter((id) => !atRisk.includes(id));
  const key = extras.length === 0 ? '' : (extras.length === 1 ? extras[0] : null);
  return (key !== null && ideas[key]) || NEUTRAL_IDEA;
}
