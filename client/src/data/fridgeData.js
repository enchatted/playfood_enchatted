// Players choose the freezer, fridge, cupboard or compost for each food.
// Storage guidance links to EUFIC in the source viewer.
//
// SOURCE: SOURCES['food-storage-fridge-freezer-cupboard'] — EUFIC «How to properly
// store food in the fridge, freezer and cupboard»,
// fetched & verified 2026-06-15. The per-food shelf-life tables (Fig.1–5) are
// IMAGE-locked → never transcribe their numbers; only verbatim TEXT is used here.

export const STORAGE_SOURCE = 'food-storage-fridge-freezer-cupboard';

// Two-layer registry (same pattern as gardenData.GARDEN_FACTS):
// `quote` = the VERBATIM EUFIC passage, locked by tests and shown behind the source
// chip / «Press S» — never reworded. `plain` = our child-facing sentence for the
// card (ages 9-14); every number and claim traces to the quote. All 12 quotes were
// live-verified verbatim on the EUFIC article on 2026-08-06. Single source of truth: the
// destinations and food flags below reference these entries by id.
export const FRIDGE_FACTS = {
  freezer: {
    quote: 'freezing food does not kill bacteria but rather slows down their growth significantly.',
    plain: 'Freezing food does not kill bacteria. Bacteria are germs far too small to see. Freezing only makes them grow much more slowly.',
  },
  fridge: {
    quote: 'The cool temperature (at a maximum of 4°C) slows down the growth of harmful microbes.',
    plain: 'A fridge should be kept cool, at no more than 4 degrees Celsius. That cold slows down the growth of harmful microbes, which are germs far too small to see.',
  },
  cupboard: {
    quote: 'Clean, dry and cool (below 25°C) shelves are the best place to store bread, dry food (in sealed bags or containers), unopened tins, jars and drinks.',
    plain: 'Shelves that are clean, dry and cooler than 25 degrees Celsius are the best home for bread and dry food. Keep dry food in a bag or a box that seals shut. Tins, jars and drinks that have not been opened yet belong there too.',
  },
  banana_cupboard: {
    quote: 'Some produce, particularly those from the tropics, such as bananas, are sensitive to cold, and should not be stored in the refrigerator.',
    plain: 'Some fruit and vegetables do not like the cold, especially ones from hot tropical countries, such as bananas. They should not be kept in the fridge.',
  },
  potato_onion_cupboard: {
    quote: 'Potatoes and onions are best stored outside the refrigerator in a dark place to avoid sprouting.',
    plain: 'Potatoes and onions keep best outside the fridge, in a dark place. That stops them growing little shoots, which is called sprouting.',
  },
  banana_fridge_why: {
    quote: 'Some produce, particularly those from the tropics, such as bananas, are sensitive to cold, and should not be stored in the refrigerator.',
    plain: 'Bananas do not like the cold. Some fruit and vegetables, especially ones from hot tropical countries, should not be kept in the fridge, so try somewhere else.',
  },
  potato_onion_fridge_why: {
    quote: 'Potatoes and onions are best stored outside the refrigerator in a dark place to avoid sprouting.',
    plain: 'Potatoes and onions keep best out of the fridge, in a dark place. Keeping them there helps stop them growing little shoots, which is called sprouting.',
  },
  milk_cupboard_why: {
    quote: "Most foods with a 'use by' date (e.g., dairy, meat, ready meals, etc.) should be kept in the fridge.",
    plain: "Most foods that carry a 'use by' date belong in the fridge. That means things like foods made from milk, meat and ready meals.",
  },
  meat_cupboard_why: {
    quote: 'Store raw meat, fish and poultry in sealed containers, on the bottom shelf of your fridge.',
    plain: 'Raw meat, fish and poultry go on the bottom shelf of the fridge, inside a container that closes tightly. Poultry means birds we eat, such as chicken.',
  },
  lettuce_freezer_why: {
    quote: 'Foods with high water content, such as lettuce, cucumbers, tomatoes, mushrooms, and soft fruits, tend to lose their crispness and become watery when thawed.',
    plain: 'Foods that hold a lot of water, such as lettuce, cucumber, tomatoes, mushrooms and soft fruit, usually go limp and watery once they thaw. To thaw means to unfreeze.',
  },
  rice_old_why: {
    quote: 'Rice dishes should be used within 1 day…',
    plain: 'Eat rice dishes within 1 day. For this rice, that 1 day has already passed, so it is no longer safe to eat.',
  },
  fish_thawed_freezer_why: {
    quote: 'Food that has been defrosted should never be refrozen unless it is cooked prior to refreezing.',
    plain: 'Once frozen food has thawed out, do not put it back in the freezer. You may freeze it again only if you cook it first.',
  },

  // ── Food-specific cards for CORRECT placements. The same EUFIC article has a line for these
  // foods, so the card names the food instead of repeating the station fact.
  // Foods without such a line keep the station fact (no invented variety).
  bread_freezer: {
    quote: 'Freeze bread immediately after purchase. Keep it in its packaging or an airtight bag and defrost individual slices when needed. Bread keeps well for up to three months.',
    plain: 'You can freeze bread as soon as you buy it. Keep it in its bag and take out only the slices you need. It keeps well for up to three months.',
  },
  banana_freezer: {
    quote: 'Larger fruits like apples, pears, bananas and mango can be best sliced into smaller pieces first.',
    plain: 'Bananas can go in the freezer too. Big fruits like bananas freeze best when you cut them into smaller pieces first.',
  },
  onion_freezer: {
    quote: 'Some vegetables like onions, peppers, and leeks don’t need blanching.',
    plain: 'Onions do not need blanching before they go in the freezer. Blanching means dipping vegetables in boiling water first, and many vegetables need it.',
  },
  fish_freezer: {
    quote: 'Most fish can be safely frozen for two to four months.',
    plain: 'Most fish can be kept safely in the freezer for two to four months.',
  },
  fish_fridge: {
    quote: 'Store raw meat, fish and poultry in sealed containers, on the bottom shelf of your fridge.',
    plain: 'Raw fish goes on the bottom shelf of the fridge, inside a container that closes tightly.',
  },
  chicken_fridge: {
    quote: 'Store raw meat, fish and poultry in sealed containers, on the bottom shelf of your fridge.',
    plain: 'Raw chicken goes on the bottom shelf of the fridge, inside a container that closes tightly.',
  },
  chicken_freezer: {
    quote: 'uncooked meat can be kept frozen for 4-12 months and uncooked poultry for 9-12 months.',
    plain: 'Raw chicken keeps in the freezer for 9 to 12 months.',
  },
  fish_thawed_fridge: {
    quote: 'thaw completely before cooking (preferably in the fridge), never refreeze thawed food unless cooked',
    plain: 'Thawed fish belongs in the fridge. The fridge is the best place to thaw food, and thawed food must not go back in the freezer unless it is cooked first.',
  },
  // Day-old rice → compost: the compost card says WHICH compost, from
  // the EPA source Compost Creator already uses. Not the EUFIC storage article.
  rice_compost: {
    sourceId: 'composting-home',
    quote: 'Cooked food (small amounts are fine)*†',
    // The EPA footnote behind *† — verbatim, in the same viewer entry. It is what supports
    // «attract animals» and «some facilities accept these foods; check yours first». It does
    // NOT compare amounts (corrected 01/10: the card no longer says big facilities take «more»).
    footnote: '*These foods can attract animals. †Backyard composting piles generally do not reach high enough temperatures to fully decompose these materials. These materials can be composted at commercial composting facilities. Check first to make sure your specific facility accepts them.',
    plain: 'A compost bin at home can take cooked food only in small amounts, because it can attract animals. Some composting facilities accept these foods. Check first what the one in your area accepts.',
  },
};

// Source of a FRIDGE_FACTS entry: the EUFIC storage article unless the entry names
// another registered source (only rice_compost does).
export function factSource(factId) {
  return (FRIDGE_FACTS[factId] && FRIDGE_FACTS[factId].sourceId) || STORAGE_SOURCE;
}

// The four storage stations, in directive order (κατάψυξη / ψυγείο / ντουλάπι /
// κομπόστ). `fact` = a VERBATIM EUFIC quote shown when an item is placed here
// correctly. compost.fact = null by design (end-of-life, no unsourced claim).
export const STORAGE_DESTINATIONS = [
  {
    id: 'freezer',
    // The misconception-busting "wow" verbatim (same EUFIC article + source key as
    // LeftoverChef's `freezing` fact, 🟢). Replaces the -18°C/thermometer
    // line (still in git history); surfacing both would need fact-rotation = a mechanic change.
    fact: FRIDGE_FACTS.freezer.quote,
    source: STORAGE_SOURCE,
  },
  {
    id: 'fridge',
    fact: FRIDGE_FACTS.fridge.quote,
    source: STORAGE_SOURCE,
  },
  {
    id: 'cupboard',
    fact: FRIDGE_FACTS.cupboard.quote,
    source: STORAGE_SOURCE,
  },
  {
    id: 'compost',
    fact: null, // end-of-life destination — no unsourced claim (decision 2026-06-15)
    source: null,
  },
];

export const STORAGE_IDS = STORAGE_DESTINATIONS.map((d) => d.id);

// ── Grading: MULTI-VALID-BINS ─────────────────────────────────────
// The EUFIC article gives MORE THAN ONE valid bin for the same food (leftovers →
// fridge OR freezer; produce → cupboard/fridge/freezer). Single-canonical grading
// would teach a falsehood — a child who freezes leftovers (EUFIC: ≤3 months) must
// not get a ✗. Same discipline as the month-level season grading elsewhere. The FOOD is never the bad guy — only the PLACEMENT is the
// teachable moment, and the hint always teaches the verbatim EUFIC reason.
export const TIER = {
  ACCEPTED: 'accepted', // ✅ an EUFIC-endorsed (or not-warned) bin for this food
  SUBOPTIMAL: 'suboptimal', // 🟡 safe but lower quality / "still edible — store it"
  AVOID: 'avoid', // ❌ EUFIC explicitly warns / "should not" / "best stored elsewhere"
};

// Food roster. Each food lists ONLY its FLAGGED bins (avoid / suboptimal) with the
// VERBATIM EUFIC reason for the teach-hint; any bin NOT flagged grades as ACCEPTED
// (we never invent a prohibition the source doesn't state). compost is graded
// separately: on an edible food it is ALWAYS suboptimal ("still edible — store
// it"), the core food-waste message — never ✗. Every food keeps ≥1 accepted bin
// (locked by test) so there is always a right answer.
export const FRIDGE_FOODS = [
  // cupboard ✅ + freezer ✅ both endorsed (multi-valid)
  // EUFIC names shelves as «the best place to store bread», so the fridge is safe but not the best.
  { id: 'bread', emoji: '🍞', nameKey: 'foods.bread',
    flags: { fridge: { tier: TIER.SUBOPTIMAL, factId: 'cupboard' } },
    acceptedFactIds: { cupboard: 'cupboard', freezer: 'bread_freezer' } },
  {
    id: 'banana',
    emoji: '🍌',
    nameKey: 'foods.banana',
    flags: {
      fridge: { tier: TIER.AVOID, factId: 'banana_fridge_why' },
    },
    // Cupboard (room temp) is the right home → show the banana-specific verbatim, not
    // the generic cupboard fact (which lists bread/tins, not produce). Same EUFIC source.
    acceptedFactIds: { cupboard: 'banana_cupboard', freezer: 'banana_freezer' },
  },
  {
    id: 'potato',
    emoji: '🥔',
    nameKey: 'foods.potato',
    flags: {
      fridge: { tier: TIER.AVOID, factId: 'potato_onion_fridge_why' },
    },
    acceptedFactIds: { cupboard: 'potato_onion_cupboard' },
  },
  {
    id: 'onion',
    emoji: '🧅',
    nameKey: 'foods.onion',
    flags: {
      fridge: { tier: TIER.AVOID, factId: 'potato_onion_fridge_why' },
    },
    acceptedFactIds: { cupboard: 'potato_onion_cupboard', freezer: 'onion_freezer' },
  },
  {
    id: 'milk',
    emoji: '🥛',
    nameKey: 'foods.milk',
    flags: {
      cupboard: { tier: TIER.AVOID, factId: 'milk_cupboard_why' },
    },
    // The 'use by' line names dairy: the right answer shows why, not only the wrong one.
    acceptedFactIds: { fridge: 'milk_cupboard_why' },
  },
  {
    id: 'fish',
    emoji: '🐟',
    nameKey: 'foods.fish',
    flags: {
      cupboard: { tier: TIER.AVOID, factId: 'meat_cupboard_why' },
    },
    acceptedFactIds: { fridge: 'fish_fridge', freezer: 'fish_freezer' },
  },
  {
    id: 'chicken',
    emoji: '🍗',
    nameKey: 'foods.chicken',
    flags: {
      cupboard: { tier: TIER.AVOID, factId: 'meat_cupboard_why' },
    },
    acceptedFactIds: { fridge: 'chicken_fridge', freezer: 'chicken_freezer' },
  },
  {
    id: 'lettuce',
    emoji: '🥬',
    nameKey: 'foods.lettuce',
    flags: {
      freezer: { tier: TIER.SUBOPTIMAL, factId: 'lettuce_freezer_why' },
    },
  },

  // ── TIME/STATE layer ───────────────────────────────────────────────────────
  // Two items are graded by their STATE, not just type. The state is shown on the
  // item (a badge) so the decision is fair. The food is still never "the bad guy" —
  // the teach-hint gives the verbatim EUFIC reason, and these stay bin-static per
  // their fixed state (no live clock — the clock IS the state badge).
  {
    id: 'rice_old',
    emoji: '🍚',
    nameKey: 'foods.rice',
    state: 'day_old',
    stateLabelKey: 'fridge.state_day_old',
    // Cooked rice past its 1-day window can't be made safe by storing it ANYWHERE, so
    // every storage bin teaches the same rule and compost is the CORRECT destination.
    // `spoiledByState` flips compost from 🟡 ("still edible") to ✅ — the one exception
    // to the island's "don't compost edible food" message.
    spoiledByState: true,
    flags: {
      fridge:   { tier: TIER.AVOID, factId: 'rice_old_why' },
      freezer:  { tier: TIER.AVOID, factId: 'rice_old_why' },
      cupboard: { tier: TIER.AVOID, factId: 'rice_old_why' },
    },
    acceptedFactIds: { compost: 'rice_compost' },
  },
  {
    id: 'fish_thawed',
    emoji: '🐟',
    nameKey: 'foods.fish',
    state: 'thawed',
    stateLabelKey: 'fridge.state_thawed',
    // Defrosted fish must not be refrozen — keep it in the fridge and use it. Still
    // edible → compost stays 🟡 ("don't waste it").
    flags: {
      freezer:  { tier: TIER.AVOID, factId: 'fish_thawed_freezer_why' },
      cupboard: { tier: TIER.AVOID, factId: 'meat_cupboard_why' },
    },
    acceptedFactIds: { fridge: 'fish_thawed_fridge' },
  },
];

// Grade a placement → { tier, why, factId }. `why` is a VERBATIM EUFIC reason (or
// null); `factId` keys FRIDGE_FACTS + the fridge.facts.* i18n namespace, so the card
// can show the translated plain while the chip opens the verbatim.
// Composting an EDIBLE food is SUBOPTIMAL (the food-waste nudge), never AVOID. But a
// food that is `spoiledByState` (e.g. day-old rice) is genuine waste → compost is the
// CORRECT (ACCEPTED) destination — the one exception to "don't compost edible food".
export function gradePlacement(foodId, bin) {
  const food = FRIDGE_FOODS.find((f) => f.id === foodId);
  if (!food) return { tier: TIER.ACCEPTED, why: null, factId: null };
  if (bin === 'compost') {
    return food.spoiledByState
      ? { tier: TIER.ACCEPTED, why: null, factId: null }
      : { tier: TIER.SUBOPTIMAL, why: null, factId: null };
  }
  const flag = food.flags[bin];
  return flag
    ? { tier: flag.tier, why: FRIDGE_FACTS[flag.factId].quote, factId: flag.factId }
    : { tier: TIER.ACCEPTED, why: null, factId: null };
}

// The child completes the lesson only after every food reaches an accepted
// destination. Stars describe first-try understanding; retries teach without
// turning a completed learning run into a surprise failure.
export function gradeFridgeRun({ accepted, total, firstTryAccepted = 0, timedOut = false }) {
  const completed = total > 0 && accepted >= total;
  if (timedOut || !completed) return { passed: false, tier: 'fail', stars: 0 };
  if (firstTryAccepted >= 9) return { passed: true, tier: 'perfect', stars: 3 };
  if (firstTryAccepted >= 7) return { passed: true, tier: 'great', stars: 2 };
  return { passed: true, tier: 'pass', stars: 1 };
}

// The bins where this food grades ACCEPTED (✅) — its right-answer set. Includes compost
// only for spoiled-by-state items (where composting is the correct call).
export function acceptedBins(foodId) {
  return STORAGE_IDS.filter((b) => gradePlacement(foodId, b).tier === TIER.ACCEPTED);
}

// Resolve a destination's verbatim fact (or null for compost / unknown id).
export function factForDestination(destId) {
  const dest = STORAGE_DESTINATIONS.find((d) => d.id === destId);
  return dest ? dest.fact : null;
}

// FACT COHERENCE: the cupboard's verbatim fact enumerates
// "bread, dry food …, tins, jars and drinks" — it does NOT mention produce. So a
// banana/potato/onion stored (correctly) in the cupboard would otherwise show a fact
// about bread & tins. For those (food, bin) pairs we surface the FOOD-SPECIFIC
// verbatim EUFIC line instead (same source). Returns null when the destination fact
// already coheres (freezer/fridge are appliance-generic; lettuce→cupboard is the one
// soft link the reviewer accepted with the generic fact).
export function acceptedFact(foodId, bin) {
  const id = acceptedFactId(foodId, bin);
  return id ? FRIDGE_FACTS[id].quote : null;
}

// The FRIDGE_FACTS key of a food-specific override for an accepted placement, or
// null when the destination's generic fact already coheres. (The component falls
// back to the destination id — freezer/fridge/cupboard double as fact ids.)
export function acceptedFactId(foodId, bin) {
  const food = FRIDGE_FOODS.find((f) => f.id === foodId);
  return (food && food.acceptedFactIds && food.acceptedFactIds[bin]) || null;
}

// The verbatim fact shown on the MissionIntroCard. Reuses the SOLID
// freezer quote already locked above (never a new claim); derived here so there
// is ONE source of truth for the string. 🟢 EUFIC.
export const FRIDGE_INTRO_FACT = {
  sourceId: STORAGE_SOURCE,
  quote: factForDestination('freezer'),
  plain: FRIDGE_FACTS.freezer.plain,
};
