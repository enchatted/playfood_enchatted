// Island 2 · Local and Seasonal Eating — data for G2.3 Spot the Fake (CHALLENGE).
// The player inspects packaged products (front→back) and judges Trust vs Flag,
// unmasking greenwashing & misleading labels. Reveals are VERBATIM from
// the public sources (Rainforest Alliance greenwashing, EUFIC food labels).
// AUTHENTICITY: never invent a fact or a URL — every quote is exact; sourceId → sources.js.
//
// i18n keys (frontKey/ingredientsKey/redFlagKey) point to the spotthefake.* block
// and are translated per locale. Reveal QUOTES stay verbatim English (citations are
// language-neutral, same convention as growing.js SOIL_REVEALS).

// Product pool (7). buildDeck(6) keeps both TRUST items + 4 FLAG items so a round
// is always a genuine discrimination task (never all-fake).
//   packStyle 'green' = flashy eco/leafy front (the lure); 'plain' = honest-looking.
//   sealStatus 'real' = independently audited cert; 'fake' = logo that mimics one; 'none'.
//   claimStatus 'approved' = EFSA-style regulated; 'vague' = unregulated marketing; 'none'.
//   evidenceType identifies the exact row that resolves the front-of-pack promise.
//   requiresBackEvidence marks cases deliberately written so the front alone is insufficient.
export const PRODUCTS = [
  {
    id: 'soda', emoji: '🥤', packStyle: 'green',
    frontKey: 'spotthefake.front_soda', ingredientsKey: 'spotthefake.ing_soda',
    sealStatus: 'none', claimStatus: 'vague', evidenceType: 'claim',
    requiresBackEvidence: false,
    verdict: 'flag', redFlagKey: 'spotthefake.redflag_vague', revealKey: 'vague',
  },
  {
    id: 'choc', emoji: '🍫', packStyle: 'green',
    frontKey: 'spotthefake.front_choc', ingredientsKey: 'spotthefake.ing_choc',
    sealStatus: 'fake', claimStatus: 'vague', evidenceType: 'seal',
    requiresBackEvidence: true,
    verdict: 'flag', redFlagKey: 'spotthefake.redflag_toogood', revealKey: 'toogood',
  },
  {
    id: 'cookies', emoji: '🍪', packStyle: 'green',
    frontKey: 'spotthefake.front_cookies', ingredientsKey: 'spotthefake.ing_cookies',
    sealStatus: 'none', claimStatus: 'none', evidenceType: 'ingredients',
    requiresBackEvidence: true,
    verdict: 'flag', redFlagKey: 'spotthefake.redflag_noadded', revealKey: 'noadded',
  },
  {
    id: 'yoghurt', emoji: '🍓', packStyle: 'plain',
    frontKey: 'spotthefake.front_yoghurt', ingredientsKey: 'spotthefake.ing_yoghurt',
    sealStatus: 'none', claimStatus: 'none', evidenceType: 'ingredients',
    requiresBackEvidence: true,
    verdict: 'flag', redFlagKey: 'spotthefake.redflag_descending', revealKey: 'descending',
  },
  {
    id: 'oil', emoji: '🧴', packStyle: 'green',
    frontKey: 'spotthefake.front_oil', ingredientsKey: 'spotthefake.ing_oil',
    sealStatus: 'none', claimStatus: 'vague', evidenceType: 'claim',
    requiresBackEvidence: false,
    verdict: 'flag', redFlagKey: 'spotthefake.redflag_greenpack', revealKey: 'greenpack',
  },
  {
    id: 'oats', emoji: '🥣', packStyle: 'plain',
    frontKey: 'spotthefake.front_oats', ingredientsKey: 'spotthefake.ing_oats',
    sealStatus: 'real', claimStatus: 'none', evidenceType: 'seal',
    requiresBackEvidence: true,
    verdict: 'trust', redFlagKey: null, revealKey: 'realseal',
  },
  {
    id: 'bread', emoji: '🍞', packStyle: 'plain',
    frontKey: 'spotthefake.front_bread', ingredientsKey: 'spotthefake.ing_bread',
    sealStatus: 'none', claimStatus: 'none', evidenceType: 'ingredients',
    requiresBackEvidence: true,
    verdict: 'trust', redFlagKey: null, revealKey: 'labelmust',
  },
];

// Reveals, keyed by revealKey + intro/win beats. Two layers, the Island 1
// pattern:
//   `quote` = the verbatim passage, pinned to public/source.html and shown behind
//             the source badge / Press S. The five greenwashing quotes are
//             content-locked; never reword any quote.
//   `plain` = what the child reads on the card: our own sentence for ages 9 to 14.
// greenwashing-red-flags = Rainforest Alliance · food-labels = EUFIC-backed.
export const PRODUCT_REVEALS = {
  intro:      { sourceId: 'greenwashing-red-flags',
    quote: 'Greenwashing—making false or misleading claims about the environmental benefits of a product or practice—is easy to define but can be hard to spot.',
    plain: 'Greenwashing means making a product sound better for nature than it really is. It is easy to explain but can be hard to spot.' },
  vague:      { sourceId: 'greenwashing-red-flags',
    quote: "Words like 'eco-friendly' and 'natural' sound nice—but without proof, they mean nothing.",
    plain: "Words like 'natural' and 'eco-friendly' sound nice. Without proof, they mean nothing." },
  greenpack:  { sourceId: 'greenwashing-red-flags',
    quote: 'Green letters? Leafy imagery? Earthy vibes? …misleading packaging can fool you into thinking a product is more sustainable than it really is.',
    plain: 'Green colours and leaf pictures can trick you. Packaging can fool you into thinking a product is kinder to nature than it really is.' },
  toogood:    { sourceId: 'greenwashing-red-flags',
    quote: 'If it sounds too good to be true, it usually is! No product is single-handedly saving the planet… Dig deeper and look for details and data.',
    plain: 'If a promise sounds too good to be true, it usually is. No product can save the planet on its own. Look for real details and numbers.' },
  realseal:   { sourceId: 'greenwashing-red-flags',
    quote: "A company can't just stick our certification seal on their products. We have a robust verification system… with checks by independent auditors.",
    // Names the Rainforest Alliance (the "our" of the quote, and the seal drawn on
    // the oats): generalising to any trusted seal would claim more than the source.
    plain: 'A company cannot just print the Rainforest Alliance seal on its pack. Checkers who do not work for the company make sure the rules are really followed.' },
  noadded:    { sourceId: 'food-labels',
    quote: 'No sugars were added… BUT may contain naturally occurring sugars.',
    plain: "'No added sugar' does not mean sugar-free. The food may still contain its own natural sugars." },
  descending: { sourceId: 'food-labels',
    quote: 'listed in descending order of weight.',
    plain: 'Ingredients are listed from most to least. Here, sugar comes before the strawberry, and strawberry is only 2%.' },
  labelmust:  { sourceId: 'food-labels',
    // 2026-08-06: restored "net quantity…", which the game quote had silently cut
    // although the source viewer carries it (the island's one real verbatim breach).
    quote: 'name of the food, full ingredient list, allergen info, nutrition declaration, expiry or durability date… net quantity… country of origin (if relevant).',
    plain: 'A food label must show what the food is called, everything that is in it and anything that can cause an allergy. It must also show the nutrition numbers, a date that tells you how long it keeps, how much is in the pack and sometimes which country it comes from.' },
  win:        { sourceId: 'food-labels',
    quote: "Just because a food product has a nutrition claim doesn't necessarily mean it's healthy.",
    plain: 'You checked the labels like a real detective. A healthy-sounding claim on the pack does not always mean the food is healthy.' },
};

export const POINTS_CORRECT = 20;
export const PENALTY_WRONG = 10;   // addScore clamps at 0 (hook), like every reused game
export const POINTS_FIRST_TRY = 15;
export const POINTS_RECOVERED = 5;
export const BONUS_FLAWLESS = 10;  // firstTryCorrect === total

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build an n-product round. Keep up to 2 trust (so it's never all-fake), fill the
// rest with flags, top up from the pool if needed, then shuffle order.
export function buildDeck(n = 6) {
  const trust = PRODUCTS.filter((p) => p.verdict === 'trust');
  const flag = PRODUCTS.filter((p) => p.verdict === 'flag');
  const pickedTrust = shuffle(trust).slice(0, Math.min(trust.length, 2));
  const pickedFlag = shuffle(flag).slice(0, n - pickedTrust.length);
  const deck = [...pickedTrust, ...pickedFlag];
  if (deck.length < n) {
    const extra = shuffle(PRODUCTS.filter((p) => !deck.includes(p)));
    while (deck.length < n && extra.length) deck.push(extra.shift());
  }
  return shuffle(deck).slice(0, n);
}

// True when the player's call matches the product's correct verdict.
export function judge(product, choice) {
  return choice === product.verdict;
}

// Pass at >=60% accuracy; tier by accuracy (mirrors gradeSoilDoctor shape).
export function gradeSpotTheFake({ correct, total }) {
  const acc = total > 0 ? correct / total : 0;
  const passed = acc >= 0.6;
  let tier = 'fail';
  if (passed) {
    if (acc === 1) tier = 'perfect';
    else if (acc >= 0.8) tier = 'great';
    else tier = 'pass';
  }
  return { passed, tier };
}

function clampCount(value, total) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(total, Math.max(0, Math.trunc(numericValue)));
}

// Score a run independently of the order in which products were judged.
export function scoreSpotTheFakeRun({ firstTryCorrect, recovered, total }) {
  const numericTotal = Number(total);
  const safeTotal = Number.isFinite(numericTotal)
    ? Math.max(0, Math.trunc(numericTotal))
    : 0;
  const safeFirstTryCorrect = clampCount(firstTryCorrect, safeTotal);
  const safeRecovered = clampCount(recovered, safeTotal - safeFirstTryCorrect);
  const { passed, tier } = gradeSpotTheFake({
    correct: safeFirstTryCorrect,
    total: safeTotal,
  });
  const score = safeFirstTryCorrect * POINTS_FIRST_TRY
    + safeRecovered * POINTS_RECOVERED
    + (safeFirstTryCorrect === safeTotal && safeTotal > 0 ? BONUS_FLAWLESS : 0);
  const starsByTier = { perfect: 3, great: 2, pass: 1, fail: 0 };

  return { score, passed, tier, stars: starsByTier[tier] };
}
