// Island 4 · Climate Change and Circular Economy — data for G4.2 Circular City (PRACTICE).
// Route household resources through the right circular hub (repair / reuse / recycle / compost)
// to keep MATERIAL and MONEY recirculating locally; the landfill is the linear leak.
// Reveals are quoted verbatim from the public sources (EU 10R framework, Amsterdam,
// linear→circular food blurb). AUTHENTICITY: never invent a fact or a URL.
//
// The 10R definitions exist only as an image, so we use the verbatim R NAMES as hub labels
// (i18n) and teach each R through its concrete action + a verbatim TEXT quote, never a
// transcribed/paraphrased image definition. The game does not depend on the image.

// The 5 delivery hubs. 4 circular channels + the landfill leak (consumes the resource).
export const HUBS = [
  { key: 'repair',   emoji: '🛠️', rLabelKey: 'circularcity.r_repair',  isLeak: false },
  { key: 'share',    emoji: '🔁', rLabelKey: 'circularcity.r_share',   isLeak: false },
  { key: 'recycle',  emoji: '♻️', rLabelKey: 'circularcity.r_recycle', isLeak: false },
  { key: 'compost',  emoji: '🌱', rLabelKey: 'circularcity.r_compost', isLeak: false },
  { key: 'landfill', emoji: '🗑️', rLabelKey: null,                     isLeak: true  },
];

export const CIRCULAR_NODES = ['repair', 'share', 'recycle', 'compost'];

// Realistic household resources, each with exactly one correct circular channel.
export const RESOURCES = [
  { id: 'chair',  emoji: '🪑', nameKey: 'circularcity.res_chair',  correctNode: 'repair'  },
  { id: 'bike',   emoji: '🚲', nameKey: 'circularcity.res_bike',   correctNode: 'repair'  },
  { id: 'jacket', emoji: '🧥', nameKey: 'circularcity.res_jacket', correctNode: 'repair'  },
  { id: 'shirt',  emoji: '👕', nameKey: 'circularcity.res_shirt',  correctNode: 'share'   },
  { id: 'books',  emoji: '📚', nameKey: 'circularcity.res_books',  correctNode: 'share'   },
  { id: 'toys',   emoji: '🧸', nameKey: 'circularcity.res_toys',   correctNode: 'share'   },
  { id: 'bottle', emoji: '🍾', nameKey: 'circularcity.res_bottle', correctNode: 'recycle' },
  { id: 'can',    emoji: '🥫', nameKey: 'circularcity.res_can',    correctNode: 'recycle' },
  { id: 'paper',  emoji: '📰', nameKey: 'circularcity.res_paper',  correctNode: 'recycle' },
  { id: 'peel',   emoji: '🍌', nameKey: 'circularcity.res_peel',   correctNode: 'compost' },
  { id: 'coffee', emoji: '☕', nameKey: 'circularcity.res_coffee', correctNode: 'compost' },
  { id: 'eggs',   emoji: '🥚', nameKey: 'circularcity.res_eggs',   correctNode: 'compost' },
];

// Two-layer reveals (verbatim quote + plain sentence), keyed by the destination node + intro/win/landfill beats.
// A resource's success reveal = CIRCULAR_REVEALS[resource.correctNode].
//
//   quote = VERBATIM from `sourceId`, re-verified against the live page on 2026-08-06 and
//           pinned to public/source.html by the guard in circular.test.js. Most of these are
//           deliberate mid-sentence fragments, which is why the child never sees them raw.
//   plain = OUR child-facing sentence, shown on the card with `paraphrase`. Every claim in it
//           is traceable to the quote; nothing may be added that the quote does not contain.
export const CIRCULAR_REVEALS = {
  intro:    { sourceId: 'circular-economy-rs',     quote: 'going beyond the classic 3Rs, the 10R framework outlines common circular economy actions to keep products and materials in use and reduce waste.',
              plain: 'There are ten ways to keep a thing in use instead of throwing it away.' },
  // The repair card quotes the EU 10R framework and shows where reuse and repair appear in the list.
  repair:   { sourceId: 'circular-economy-rs',     quote: 'R0 Refuse, R1 Rethink, R2 Reduce, R3 Reuse, R4 Repair, R5 Refurbish, R6 Remanufacture, R7 Repurpose, R8 Recycle and R9 Recover.',
              plain: 'Reusing and repairing keep things in use. In the list of 10 ways, they come before recycling.' },
  share:    { sourceId: 'circular-city-amsterdam', quote: 'sharing household items, space, modes of transport, and even food.',
              plain: 'People can share what they have: things from the house, rooms, ways of getting around and even food.' },
  // The live page writes Amsterdam with a typographic apostrophe; the straight one here made
  // the quote differ from the source by one character (found 2026-08-06).
  recycle:  { sourceId: 'circular-city-amsterdam', quote: 'emissions related to material use make up 78% of Amsterdam’s total CO2 emissions.',
              plain: 'In Amsterdam, the materials people use cause 78 out of every 100 units of the city’s carbon dioxide.' },
  // compost — RE-SOURCED 2026-08-06. It used to quote Amsterdam's three programme areas ("food
  // and organic waste streams, consumer goods, and the built environment"), a bare noun list
  // that taught nothing about composting and that no honest plain sentence could restate.
  compost:  { sourceId: 'composting-home',         quote: 'Composting is nature’s way of recycling.',
              plain: 'Composting is nature’s own way of recycling.' },
  // landfill — CORRECTED 2026-08-06. The old string was a paraphrase inside quotation marks;
  // this is the source's actual opening sentence, fetched live.
  landfill: { sourceId: 'linear-circular-food',    quote: 'Our current food system uses the linear economic model of ‘take-produce-consume-discard’, which assumes that economic growth can be perpetuated based on an abundance of resources and unlimited waste disposal.',
              plain: 'The old way is to take, make, use and then throw away, as if the Earth could never run out.' },
  win:      { sourceId: 'circular-city-amsterdam', quote: 'the first city in the world to commit to becoming a 100% circular economy by 2050, aiming to halve its use of virgin materials by 2030.',
              plain: 'Amsterdam was the first city in the world to promise to become fully circular by 2050, and to halve the brand new materials it uses by 2030.' },
};

// The two clothes say WHY on a wrong delivery (wrong hub or landfill).
// Game-rule copy only (the item's own condition), no fact/source. Books and toys keep the plain
// hint on purpose: "not damaged" is not extended to them. Destinations, points and first-try
// accounting are unchanged — this only picks the feedback text.
export const WRONG_HINT_KEYS = {
  jacket: 'circularcity.wrong_hint_jacket',
  shirt: 'circularcity.wrong_hint_shirt',
};
export function wrongDeliveryText(resourceId, wrongToon, hints = {}) {
  const hint = hints[resourceId];
  return hint ? `${hint} ${wrongToon}` : wrongToon;
}

export const POINTS_CIRCULAR = 15;
// Teach-don't-punish (FridgeManager / CompostCreator parity): a wrong circular hub
// and landfill retain the resource with NO score penalty. Completion measures recovered
// resources; stars distinguish first-attempt accuracy from recovery after retries.

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build an n-resource round: guarantee >=1 per circular node, fill the rest, then shuffle.
export function buildResourceSet(n = 8) {
  const picked = [];
  for (const node of CIRCULAR_NODES) {
    const pool = shuffle(RESOURCES.filter((r) => r.correctNode === node));
    if (pool.length) picked.push(pool[0]); // 1 guaranteed per node
  }
  const rest = shuffle(RESOURCES.filter((r) => !picked.includes(r)));
  while (picked.length < n && rest.length) picked.push(rest.shift());
  return shuffle(picked).slice(0, n);
}

// Pass by recovered resources; stars by first-attempt accuracy (legacy runs default to correct).
export function gradeCircularCity({ correct, total, leaks, firstTryCount = correct }) {
  const acc = total > 0 ? correct / total : 0;
  const passed = acc >= 0.6;
  let tier = 'fail';
  if (passed) {
    if (correct === total && firstTryCount === total && leaks === 0) tier = 'perfect';
    else if (firstTryCount / total >= 0.8) tier = 'great';
    else tier = 'pass';
  }
  return { passed, tier };
}

// 0-100 "Neighborhood Loop" meter from correctly-routed resources.
export function loopValue(correct, total) {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

// ── G4.3 · Planetary Boundaries (CHALLENGE) ─────────────────────────────────
// Assess systemic trade-offs of COLLECTIVE consumption against the planet's
// ABSOLUTE limits. Boundaries, the safe operating space, the authentic 7-of-9
// transgressed state and the irreversibility framing are VERBATIM from the
// Stockholm Resilience Centre. The Amsterdam "doughnut" is the positive
// "living within limits" model. AUTHENTICITY: real boundary names only — "Novel
// entities" (never "pollution"); never invent a fact.

export const PB_LIMIT = 60;
const PB_START_TRANSGRESSED = 78;
const PB_START_SAFE = 40;

// The 9 boundaries (verbatim names via i18n b_* keys). 2 start inside the safe space.
export const PB_BOUNDARIES = [
  { key: 'climate',        nameKey: 'planetary.b_climate',        shortKey: 'planetary.bs_climate' },
  { key: 'biosphere',      nameKey: 'planetary.b_biosphere',      shortKey: 'planetary.bs_biosphere' },
  { key: 'land',           nameKey: 'planetary.b_land',           shortKey: 'planetary.bs_land' },
  { key: 'freshwater',     nameKey: 'planetary.b_freshwater',     shortKey: 'planetary.bs_freshwater' },
  { key: 'biogeochemical', nameKey: 'planetary.b_biogeochemical', shortKey: 'planetary.bs_biogeochemical' },
  { key: 'ocean',          nameKey: 'planetary.b_ocean',          shortKey: 'planetary.bs_ocean' },
  { key: 'novel',          nameKey: 'planetary.b_novel',          shortKey: 'planetary.bs_novel' },
  { key: 'aerosols',       nameKey: 'planetary.b_aerosols',       shortKey: 'planetary.bs_aerosols' },
  { key: 'ozone',          nameKey: 'planetary.b_ozone',          shortKey: 'planetary.bs_ozone' },
];

// The 2 boundaries still inside the safe space (verbatim from Stockholm).
export const PB_SAFE_KEYS = ['aerosols', 'ozone'];

// 4 collective-consumption consoles, each with 2 options (A = high-impact, B = mindful).
// effects = signed deltas applied to boundary values (− improves, + worsens). Calibrated so
// all-B → 1 transgressed (perfect; freshwater stays stuck = absolute limits) and
// all-A → 8 transgressed (breaches even aerosols).
// The side of the mindful option alternates per
// console, fixed (no randomness), so its position never gives the answer away. The option
// moves WHOLE (description, «Affects», effects, reveal); ids A/B stay semantic (A = high-impact,
// B = mindful) while the visible «Option A / B» labels stay positional (left / right).
export const PB_DISPLAY_ORDER = {
  food: ['B', 'A'],
  transport: ['B', 'A'],
  energy: ['A', 'B'],
  materials: ['A', 'B'],
};

/** The console's options in on-screen order (left, right). */
export function displayOptions(consoleKey, options) {
  const order = PB_DISPLAY_ORDER[consoleKey] || ['A', 'B'];
  return order.map((id) => options.find((o) => o.id === id)).filter(Boolean);
}

export const PB_CONSOLES = [
  {
    key: 'food', emoji: '🍽️', labelKey: 'planetary.console_food', promptKey: 'planetary.q_food',
    options: [
      { id: 'A', descKey: 'planetary.food_a', revealKey: 'crossing',
        effects: { climate: 6, biogeochemical: 10, land: 6, freshwater: 6, biosphere: 4 } },
      { id: 'B', descKey: 'planetary.food_b', revealKey: 'lifesupport',
        effects: { climate: -8, biogeochemical: -24, land: -8, freshwater: -10, biosphere: -6 } },
    ],
  },
  {
    key: 'energy', emoji: '⚡', labelKey: 'planetary.console_energy', promptKey: 'planetary.q_energy',
    options: [
      { id: 'A', descKey: 'planetary.energy_a', revealKey: 'crossing',
        effects: { climate: 12, novel: 8, ocean: 8 } },
      { id: 'B', descKey: 'planetary.energy_b', revealKey: 'doughnut',
        effects: { climate: -12, ocean: -22, novel: 2 } }, // renewable: small novel trade-off
    ],
  },
  {
    key: 'transport', emoji: '🚗', labelKey: 'planetary.console_transport', promptKey: 'planetary.q_transport',
    options: [
      { id: 'A', descKey: 'planetary.transport_a', revealKey: 'crossing',
        effects: { climate: 8, aerosols: 24 } }, // car-heavy can push aerosols over its limit
      { id: 'B', descKey: 'planetary.transport_b', revealKey: 'lifesupport',
        effects: { climate: -10, aerosols: -6 } },
    ],
  },
  {
    key: 'materials', emoji: '📦', labelKey: 'planetary.console_materials', promptKey: 'planetary.q_materials',
    options: [
      { id: 'A', descKey: 'planetary.materials_a', revealKey: 'crossing',
        effects: { novel: 12, land: 8, climate: 6 } },
      { id: 'B', descKey: 'planetary.materials_b', revealKey: 'doughnut',
        effects: { novel: -27, land: -12, climate: -6, biosphere: -14 } }, // reuse reduces extraction pressure
    ],
  },
];

// Two-layer reveals (verbatim quote + plain sentence): Stockholm + Amsterdam doughnut.
// Every quote below was re-verified against the live Stockholm page on 2026-08-06 and is pinned
// to public/source.html by the guard in circular.test.js.
//
// CORRECTED 2026-08-06. `intro` used to read "A safe operating space for humanity. Today, seven
// out of nine boundaries have been transgressed." Both halves are on the page but they never
// touch: the first is only ever the TITLE of the 2009 Nature paper inside a citation, and the
// second sits some 3,000 characters away. Welded together they formed a quotation that does not
// exist in the source. `win` was that same paper title on its own, presented as a claim, and it
// was a strict prefix of `intro`, so the climax repeated the opening line. Both now carry real
// sentences the Centre states in its own voice. Note the genuine em dash inside `lifesupport`:
// it belongs to the source, so it stays in the quote layer and never reaches the plain layer.
export const PB_REVEALS = {
  intro:       { sourceId: 'planetary-boundaries', quote: 'Today, seven out of nine boundaries have been transgressed.',
                 plain: 'Earth has nine safety limits that keep the planet a good home for us. We have already pushed past seven of them.' },
  crossing:    { sourceId: 'planetary-boundaries', quote: 'Crossing boundaries increases the risk of generating large-scale abrupt or irreversible environmental changes.',
                 plain: 'When we push past a limit, nature can change very fast. Some of those changes we can never undo.' },
  lifesupport: { sourceId: 'planetary-boundaries', quote: 'Stay within them, and the Earth stays our dependable home — breach them, and we risk irreversible damage to our very own life support system.',
                 plain: 'If we stay inside the limits, Earth stays a home we can count on. If we break them, we can do damage we can never undo.' },
  doughnut:    { sourceId: 'circular-city-amsterdam', quote: 'Its five-year circular economy strategy to achieve this goal is based on Kate Raworth’s Doughnut Economics model, which achieves economic development while staying within planetary boundaries.',
                 plain: 'Amsterdam’s circular economy plan is based on the “doughnut” model. Its aim is for the economy to develop without going past Earth’s limits.' },
  win:         { sourceId: 'planetary-boundaries', quote: "To safeguard the Earth's resilience and stability, we must bring the planet back into its Planetary Boundaries.",
                 plain: 'To keep Earth strong and steady, we have to bring the planet back inside its limits.' },
};

// ONE application step
// with a food example, after the final reveal and before the result. Two options, no points,
// no stars, no fail, no unlock change. It asks what the SOURCE mentions for Amsterdam — not
// which boundary a food choice helps: no registered source links a food choice to a specific
// boundary (Stockholm's page does not mention food at all; checked live 06/10). The Amsterdam
// page describes a COMMITMENT, AMBITIONS and the INNOVATIONS of an action plan, so the card
// words them as such («has committed», «plans focus on», «sharing ideas») and never as an
// achieved result, and never joins the sentences with «so» / «that is why».
// `support` = the verbatim passages behind each child-facing sentence, pinned to
// public/source.html by circular.test.js. Plain wording lives in planetary.apply.* (i18n).
export const PB_APPLY = {
  sourceId: 'circular-city-amsterdam',
  options: ['keep', 'share'], // on-screen order (left, right), fixed
  answer: 'share',
  support: {
    context: 'the first city in the world to commit to becoming a 100% circular economy by 2050, aiming to halve its use of virgin materials by 2030.',
    sharing: 'sharing household items, space, modes of transport, and even food.',
    sectors: 'food and organic waste streams, consumer goods, and the built environment.',
  },
};

/**
 * Game-model labels for the feedback after a choice: which boundaries ACTUALLY moved
 * toward the safe side (value went down) and which away from it (value went up), comparing the
 * real values before and after applyChoice — so a boundary held at the 0/100 clamp is not
 * reported as changed (e.g. AAAA left Climate at 100 → 100 but called it «worse»).
 * Board order. This is the game's calibration, shown as «in the game», never as a fact.
 */
export function choiceEffectChanges(before, after) {
  const valueOf = (list, key) => (list || []).find((b) => b.key === key)?.value;
  const better = [];
  const worse = [];
  for (const b of PB_BOUNDARIES) {
    const v0 = valueOf(before, b.key);
    const v1 = valueOf(after, b.key);
    if (typeof v0 !== 'number' || typeof v1 !== 'number') continue;
    if (v1 < v0) better.push(b.key);
    if (v1 > v0) worse.push(b.key);
  }
  return { better, worse };
}

export const PB_POINTS_RECOVER = 25; // per boundary brought back into the safe space

// Teach-don't-punish: a choice only EARNS points for boundaries it brings
// back into the safe space. A worsening choice (recovered < 0) is NOT slapped with a
// negative score — its consequence is intrinsic (the transgressed count rises, so the
// run is harder to win) and the forced 'crossing' reveal teaches why.
export function scoreForRecovery(recovered) {
  return recovered > 0 ? recovered * PB_POINTS_RECOVER : 0;
}

// Runtime boundaries: 7 transgressed (value > limit) + 2 safe (aerosols, ozone).
export function buildBoundaries() {
  const safe = new Set(PB_SAFE_KEYS);
  return PB_BOUNDARIES.map((b) => ({
    key: b.key,
    value: safe.has(b.key) ? PB_START_SAFE : PB_START_TRANSGRESSED,
    limit: PB_LIMIT,
  }));
}

// Apply a choice's signed deltas; returns a NEW clamped boundaries array (pure).
export function applyChoice(boundaries, effects) {
  return boundaries.map((b) => {
    const d = effects[b.key] || 0;
    return { ...b, value: Math.max(0, Math.min(100, b.value + d)) };
  });
}

export function countTransgressed(boundaries) {
  return boundaries.filter((b) => b.value > b.limit).length;
}

// Pass at <=3 transgressed (started 7 → recover >=4). Absolute limits leave a couple stuck.
export function gradePlanetaryBoundaries({ transgressed }) {
  const passed = transgressed <= 3;
  let tier = 'fail';
  if (passed) {
    if (transgressed <= 1) tier = 'perfect';
    else if (transgressed === 2) tier = 'great';
    else tier = 'pass';
  }
  return { passed, tier };
}

export function planetaryStarsForTransgressed(transgressed) {
  const { tier } = gradePlanetaryBoundaries({ transgressed });
  if (tier === 'perfect') return 3;
  if (tier === 'great') return 2;
  if (tier === 'pass') return 1;
  return 0;
}

export function planetaryScoreForTransgressed(transgressed, total = 9, startingSafe = 2) {
  const safe = Math.max(0, total - transgressed);
  return Math.max(0, safe - startingSafe) * PB_POINTS_RECOVER;
}

export function summarizePlanetaryChoice(beforeTransgressed, afterTransgressed, total = 9) {
  const beforeSafe = total - beforeTransgressed;
  const afterSafe = total - afterTransgressed;
  let tone = 'unchanged';
  if (afterSafe > beforeSafe) tone = 'improved';
  if (afterSafe < beforeSafe) tone = 'caution';
  return { tone, beforeSafe, afterSafe };
}
export function redirectCircularResource(state, correctNode) {
  const resource = state.resources?.find(item => item.id === state.carrying);
  if (resource) resource.retried = true;
  state.hintNodeKey = correctNode;
  state.hintTimer = 4;
}
