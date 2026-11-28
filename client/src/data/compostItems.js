// COMPOST_BINS — drives both the renderer (colors/icons) and the data shape (correctBin valid values).
// Left→right pedagogical order: organic → recyclables → hazardous.
export const COMPOST_BINS = [
  { id: 'compost',   labelKey: 'compost.bin_label_compost',   emoji: '🌱', color: '#6B8E23' },
  { id: 'plastic',   labelKey: 'compost.bin_label_plastic',   emoji: '🧴', color: '#1976D2' },
  // id stays 'carton' (scoring, tests, saves); the GROUP is drink cartons — option A, 01/10.
  { id: 'carton',    labelKey: 'compost.bin_label_carton',    emoji: '🧃', color: '#8D6E63' },
  { id: 'aluminium', labelKey: 'compost.bin_label_aluminium', emoji: '🥫', color: '#9E9E9E' },
  { id: 'battery',   labelKey: 'compost.bin_label_battery',   emoji: '🔋', color: '#E53935' },
];

export const BIN_IDS = COMPOST_BINS.map(b => b.id);

// ── Source ids (registered in data/sources.js, MISSION_SOURCES.CompostCreator) ──
// US EPA carries the per-item verbatim: it is the only registered source that covers all five
// bins in English and every passage below was re-verified against the live pages on 2026-08-06.
// YPEN (the Greek Ministry Home Composting Manual) is an EU/national authority and backs one
// item from its own Greek text; it can only ever supply GREEK verbatim, never English.
export const YPEN_SOURCE = 'ypen-home-composting';
export const COMPOST_SOURCE = 'composting-home';
export const RECYCLE_SOURCE = 'recycle-common-recyclables';
export const BATTERY_SOURCE = 'used-household-batteries';
// The battery card cites the EU rule for every battery, not the EPA «certain batteries».
export const EU_BATTERY_SOURCE = 'eu-batteries-regulation';
// The drink-carton card links to the Fost Plus description of the packaging layers.
export const FOSTPLUS_CARTON_SOURCE = 'fostplus-drinkcartons';
// The model sentence of the intro («one bin may collect several of these groups together») is
// documented by four collection schemes, registered and listed under the mission. They back the
// intro step, which has no source chip of its own yet (the multi-source key is a separate topic):
export const CARTON_COLLECTION_SOURCES = ['eeaa-polites', 'pontoverde-pacotes', 'fostplus-pmd', 'milieucentraal-drinkpakken'];

// COMPOST_FACTS — the two-layer fact registry, keyed by item id.
//
//   quote  = VERBATIM from `sourceId`. Never reworded. Shown only behind the source badge
//            («Press S» → public/source.html), where a guard test in compostItems.test.js
//            pins every one of these strings to the viewer.
//   plain  = OUR child-facing sentence (ages 9 to 14), shown on the card with `paraphrase`
//            so it is never dressed up as the source's words. Every claim in it must be
//            traceable to the quote; a plain sentence that adds a number, a mechanism or a
//            causal link the quote does not contain is not publishable.
//
// PROVENANCE NOTE. Ten items once carried unsourced fun-facts ("Earthworms love them!",
// "Can take up to 450 years to decompose.") attributed to YPEN and flagged provisional:false.
// That attribution was checked against the actual 36-page Greek manual and does not hold:
// 6 of the 10 claims are not addressed anywhere in it, the words for battery, aluminium and
// calcium occur zero times, "450" occurs zero times, and the cooked-food claim is contradicted
// three times over. The genuine EPA verbatim that an earlier change had removed is restored
// here as the quote layer.
export const COMPOST_FACTS = {
  // ── the greens table: "What to Add to a Backyard Compost Pile" → Nitrogen-Rich ("Greens") ──
  banana_peel: {
    sourceId: COMPOST_SOURCE,
    quote: 'Fruit and vegetable scraps',
    plain: 'A banana peel is a fruit scrap, so it belongs on the compost heap.',
  },
  apple_core: {
    sourceId: COMPOST_SOURCE,
    quote: 'Fruit and vegetable scraps',
    plain: 'An apple core is a fruit scrap, so it belongs on the compost heap.',
  },
  lettuce_leaves: {
    sourceId: COMPOST_SOURCE,
    quote: 'Fruit and vegetable scraps',
    plain: 'Old lettuce leaves are vegetable scraps, so they belong on the compost heap.',
  },
  egg_shell: {
    sourceId: COMPOST_SOURCE,
    quote: 'Eggshells (crushed)',
    plain: 'Crushed egg shells belong on the compost heap.',
  },
  coffee_grounds: {
    sourceId: COMPOST_SOURCE,
    quote: 'Coffee grounds and paper filters',
    plain: 'Coffee grounds belong on the compost heap, and so do paper coffee filters.',
  },
  tea_bag: {
    sourceId: COMPOST_SOURCE,
    quote: 'Paper tea bags (no staples)',
    plain: 'A tea bag belongs on the compost heap if it is made of paper and has no staples in it.',
  },
  // The one Greek-sourced item. The manual names bread in its own list of nitrogen-rich
  // "greens", so the quote layer is Greek by necessity and the badge says so. Line breaks in
  // the PDF are normalised to single spaces; no word is changed.
  bread_stale: {
    sourceId: YPEN_SOURCE,
    quote: 'υπολείμματα φρούτων και λαχανικών, φλούδες από το καθάρισμα φρούτων και λαχανικών, υπολείμματα του καφέ, υπολείμματα τσαγιού, αγριόχορτα, μαραμένα λουλούδια, κομμένο γρασίδι, απόβλητα κήπων, ζωικά απόβλητα, ψωμί.',
    plain: 'Stale bread belongs on the compost heap, next to the fruit and vegetable scraps.',
  },
  // ── plastics ──
  plastic_bottle: {
    sourceId: RECYCLE_SOURCE,
    quote: 'Can plastic bottles and caps be recycled? Yes, typically the caps and labels can be left on the bottles as well.',
    plain: 'A plastic bottle can be recycled. You can usually leave the cap and the label on it.',
  },
  plastic_bag: {
    sourceId: RECYCLE_SOURCE,
    quote: 'Some types of plastics are not accepted in community recycling programs.',
    plain: 'The bag is made of plastic, so here it goes with the plastics. At home, check first: some kinds of plastic are not taken by the recycling service where you live.',
  },
  // ── aluminium ──
  aluminium_can: {
    sourceId: RECYCLE_SOURCE,
    quote: 'Both aluminum cans and foil can be recycled.',
    plain: 'Drink cans and kitchen foil can both be recycled.',
  },
  aluminium_foil: {
    sourceId: RECYCLE_SOURCE,
    quote: 'Yes, aluminum foil can be recycled. Make sure to remove any food residue before recycling.',
    plain: 'Kitchen foil can be recycled. Wipe off any bits of food first.',
  },
  // ── battery ──
  // ── drink cartons (milk + juice share one card) ──
  // Every clause of `plain` maps to its own part of the quote: «mostly cardboard» → part 2,
  // «a thin layer of plastic inside and outside» → part 3, «some also have aluminium» → part 4
  // («voor bepaalde producten», i.e. NOT all). Part 1 is the page's own summary («vaak ook»).
  // The 75% stays behind the badge; the card gives no number.
  drink_carton: {
    sourceId: FOSTPLUS_CARTON_SOURCE,
    quote: 'Het zijn bijzondere verpakkingen, samengesteld uit karton, een laag polyethyleen en vaak ook een fijn laagje aluminium. … Zoals de naam al aangeeft, bestaan ze voor het grootste deel – ongeveer 75% – uit karton. … De verpakking heeft zowel aan de buitenkant als aan de binnenkant een laagje plastic (polyethyleen) … Voor bepaalde producten wordt de plastic laag aan de binnenkant gecombineerd met een laagje aluminium.',
    plain: 'Milk and juice cartons are mostly cardboard, with a thin layer of plastic inside and outside. Some also have aluminium.',
  },
  battery: {
    sourceId: EU_BATTERY_SOURCE,
    quote: 'End-users shall discard waste batteries separately from other waste streams, including from mixed municipal waste.',
    plain: 'Batteries must never go in the rubbish. Take them to a battery collection point.',
  },
};

// The Hook's intro fact. Teaches what composting actually is, which nothing else in the game did.
export const COMPOST_INTRO_FACT = {
  sourceId: COMPOST_SOURCE,
  // 01/10 (our correction): the product is COMPOST that improves soil, not «soil» — the second
  // passage is the EPA's own next sentence, already on page 1 of the same viewer entry.
  quote: 'Composting is the managed, aerobic (oxygen-required) biological decomposition of organic materials by microorganisms. … The end product is compost, a biologically stable soil amendment that can be used to build soil health and provide nutrients to plants.',
  plain: 'Composting is when tiny living things turn food scraps and garden waste into compost, which makes soil healthier. They need air to do it.',
};

// The introduction pairs its prevention and reuse tips with the EPA passages on leftover food and gift packaging.
export const COMPOST_PREVENTION_FACT = {
  sourceId: RECYCLE_SOURCE,
  quote: 'EPA recommends reducing food waste by buying only what you need and by eating your leftovers. … EPA encourages consumers to reuse gift bags, boxes, and tissue paper.',
  plain: 'First, we make less waste: we buy only the food we need and eat leftovers that are still safe. We can also reuse gift bags and gift boxes.',
};

// WASTE_ITEMS — 14 items across 5 bins (≥1 each), 12 selected per session.
//
// `factId` points into COMPOST_FACTS; the game shows a card only for items that have one, so
// nothing unsourced can render. The two drink cartons were once PARKED (no factId):
// the EPA page answers for cardboard, not for layered drink cartons. Option A gives them the
// Fost Plus card and a drawn milk-carton icon (`icon`, because 🥛 is a glass and 📦 a parcel).
// `emoji` stays as the text fallback; correctBin and scoring are unchanged.
//
// REMOVED 2026-08-06: `leftover_fries`. It sat in the compost bin and was scored correct while
// its own cited source says cooked food must be avoided, three separate times. That is a data
// defect, not a wording one, so the item is out rather than reworded (see the provenance doc).
export const WASTE_ITEMS = [
  // ── compost (7 items) ──
  { id: 'banana_peel',    nameKey: 'compost_items.banana_peel',    emoji: '🍌',  correctBin: 'compost',   factId: 'banana_peel' },
  { id: 'egg_shell',      nameKey: 'compost_items.egg_shell',      emoji: '🥚',  correctBin: 'compost',   factId: 'egg_shell' },
  { id: 'coffee_grounds', nameKey: 'compost_items.coffee_grounds', emoji: '☕',  correctBin: 'compost',   factId: 'coffee_grounds' },
  { id: 'apple_core',     nameKey: 'compost_items.apple_core',     emoji: '🍎',  correctBin: 'compost',   factId: 'apple_core' },
  { id: 'tea_bag',        nameKey: 'compost_items.tea_bag',        emoji: '🍵',  correctBin: 'compost',   factId: 'tea_bag' },
  { id: 'lettuce_leaves', nameKey: 'compost_items.lettuce_leaves', emoji: '🥬',  correctBin: 'compost',   factId: 'lettuce_leaves' },
  { id: 'bread_stale',    nameKey: 'compost_items.bread_stale',    emoji: '🍞',  correctBin: 'compost',   factId: 'bread_stale' },
  // ── plastic (2 items) ──
  { id: 'plastic_bottle', nameKey: 'compost_items.plastic_bottle', emoji: '🧴',  correctBin: 'plastic',   factId: 'plastic_bottle' },
  { id: 'plastic_bag',    nameKey: 'compost_items.plastic_bag',    emoji: '🛍️', correctBin: 'plastic',   factId: 'plastic_bag' },
  // ── drink cartons (2 items, bin id 'carton') ──
  { id: 'milk_carton',    nameKey: 'compost_items.milk_carton',    emoji: '🧃',  icon: 'milkCarton', correctBin: 'carton',    factId: 'drink_carton' },
  { id: 'juice_box',      nameKey: 'compost_items.juice_box',      emoji: '🧃',  correctBin: 'carton',    factId: 'drink_carton' },
  // ── aluminium (2 items) ──
  { id: 'aluminium_can',  nameKey: 'compost_items.aluminium_can',  emoji: '🥫',  correctBin: 'aluminium', factId: 'aluminium_can' },
  { id: 'aluminium_foil', nameKey: 'compost_items.aluminium_foil', emoji: '🪙',  correctBin: 'aluminium', factId: 'aluminium_foil' },
  // ── battery (1 item) ──
  { id: 'battery',        nameKey: 'compost_items.battery',        emoji: '🔋',  correctBin: 'battery',   factId: 'battery' },
];

// True only when the item resolves to a registered two-layer fact — the single gate the game
// uses before rendering any fact card (no fact, no badge → nothing unsourced renders).
export function hasSourcedFact(item) {
  return !!(item && item.factId && COMPOST_FACTS[item.factId]);
}

// The fact record for an item, or null. Callers read `.plain` for the card and `.quote`
// for the verbatim behind the badge.
export function factForItem(item) {
  return (item && item.factId && COMPOST_FACTS[item.factId]) || null;
}

export const TOTAL_ITEMS_PER_SESSION = 12;

// Build the Grand-Reveal queue: every placed item that is NOT already confirmed
// correct, in bin order. Confirmed items stay in their bins but are never re-revealed
// or re-scored — so a retry round can't inflate the score.
// Pure (unit-tested in compostItems.test.js); the canvas loop just calls it.
export function buildRevealList(binIds, binItems, confirmed = new Set()) {
  const list = [];
  for (const id of binIds) {
    for (const item of binItems[id] || []) {
      if (confirmed.has(item.id)) continue;
      list.push({ item, binId: id });
    }
  }
  return list;
}

// Pure helper: picks N random items from WASTE_ITEMS while ensuring each bin gets ≥1 item if possible.
// Returns a new array; does not mutate input. Caller passes a seeded RNG or Math.random for deterministic tests.
export function pickSessionItems(allItems = WASTE_ITEMS, n = TOTAL_ITEMS_PER_SESSION, rng = Math.random) {
  if (n >= allItems.length) {
    return [...allItems].sort(() => rng() - 0.5);
  }
  // Group by bin, take 1 from each first, then fill remainder randomly.
  const byBin = new Map();
  for (const item of allItems) {
    if (!byBin.has(item.correctBin)) byBin.set(item.correctBin, []);
    byBin.get(item.correctBin).push(item);
  }
  const picked = [];
  const remaining = [];
  for (const [, items] of byBin) {
    const shuffled = [...items].sort(() => rng() - 0.5);
    picked.push(shuffled[0]);
    remaining.push(...shuffled.slice(1));
  }
  // Shuffle the remaining pool and take what's needed
  const shuffledRemaining = remaining.sort(() => rng() - 0.5);
  while (picked.length < n && shuffledRemaining.length) {
    picked.push(shuffledRemaining.shift());
  }
  // Final shuffle so bin order isn't predictable
  return picked.sort(() => rng() - 0.5);
}
export function returnCompostItemToStump(state, item, binId) {
  const original = state.counterItems.find(candidate => candidate.id === item.id);
  if (!original) return;
  state.binItems[binId] = state.binItems[binId].filter(candidate => candidate.id !== item.id);
  original.picked = false;
  state.totalPlaced--;
}
