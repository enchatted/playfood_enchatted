import { describe, it, expect } from 'vitest';
import { FOOD_ITEMS } from './foods.js';
import {
  AXIS_WEIGHTS, scoreSustainability, scoreWaste, gradeMealPlan, atRiskInventory,
  WASTE_FACTS, WASTE_FACTS_SOURCE,
} from './foodwaste.js';
// Import the module as a namespace so individual tests can report missing exports.
import * as MP from './foodwaste.js';
import { SOURCES } from './sources.js';
import { MARKET_CAP } from '../games/foodwaste/mealPlannerCarry.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

// Authenticity guard (see fridgeData.test.js) — unescape \' before matching.
const SOURCE_HTML_RAW = readFileSync(
  fileURLToPath(new URL('../../public/source.html', import.meta.url)),
  'utf8',
);
const SOURCE_HTML = SOURCE_HTML_RAW.replace(/\\'/g, "'");
const verbatimCore = (q) => q.replace(/^[…\s]+/, '').replace(/[…\s]+$/, '').trim();

function expectPlainSentence(plain, label) {
  expect(typeof plain, `${label}: plain must be a string`).toBe('string');
  expect(plain.length, `${label}: plain must be non-empty`).toBeGreaterThan(0);
  expect(plain.startsWith('…'), `${label}: plain must not open with an ellipsis`).toBe(false);
  expect(/[.!?]$/.test(plain), `${label}: plain must end as a sentence`).toBe(true);
  expect(/[—–]/.test(plain), `${label}: plain must not contain a dash`).toBe(false);
}

const VALID = new Set(FOOD_ITEMS.map((f) => f.id));

// ── plate-state literal builder (mirrors the GREEN plate-state shape) ──
// A plate = { meal, slots: [{ type, item, source }] }. `item` null = open socket.
const mkPlate = (meal, types, items = [], sources = []) => ({
  meal,
  slots: types.map((type, i) => ({
    type, item: items[i] ?? null, source: items[i] ? (sources[i] ?? 'home') : null,
  })),
});
const completePlantPlates = () => [
  mkPlate('breakfast', ['carb', 'protein', 'fruit', 'fruit'], ['bread', 'tofu', 'strawberry', 'banana']),
  mkPlate('lunch', ['carb', 'protein', 'veg', 'veg', 'fruit'], ['rice', 'lentils', 'tomato', 'cucumber', 'banana']),
  mkPlate('dinner', ['carb', 'protein', 'veg', 'veg', 'fruit'], ['pasta', 'tofu', 'tomato', 'cucumber', 'strawberry']),
];
const completeMeatPlates = () => [
  mkPlate('breakfast', ['carb', 'protein', 'fruit', 'fruit'], ['bread', 'egg', 'apple', 'orange']),
  mkPlate('lunch', ['carb', 'protein', 'veg', 'veg', 'fruit'], ['rice', 'beef', 'kale', 'mushroom', 'apple']),
  mkPlate('dinner', ['carb', 'protein', 'veg', 'veg', 'fruit'], ['pasta', 'chicken', 'kale', 'mushroom', 'orange']),
];
const halfPlates = () => [
  mkPlate('breakfast', ['carb', 'protein', 'fruit', 'fruit'], ['bread', 'egg', 'banana', 'apple']),
  mkPlate('lunch', ['carb', 'protein', 'veg', 'veg', 'fruit'], ['rice', 'lentils', 'tomato']),
  mkPlate('dinner', ['carb', 'protein', 'veg', 'veg', 'fruit'], []),
];
const emptyPlates = () => [
  mkPlate('breakfast', ['carb', 'protein', 'fruit', 'fruit']),
  mkPlate('lunch', ['carb', 'protein', 'veg', 'veg', 'fruit']),
  mkPlate('dinner', ['carb', 'protein', 'veg', 'veg', 'fruit']),
];

const planFromPicks = ({ home, market }) => {
  const plates = emptyPlates();
  for (const [source, ids] of [['home', home], ['market', market]]) {
    for (const id of ids) {
      const type = MP.slotTypeOf(id);
      const slot = plates.flatMap((plate) => plate.slots)
        .find((candidate) => candidate.type === type && !candidate.item);
      if (!slot) throw new Error(`No open ${type ?? 'blocked'} slot for ${id}`);
      slot.item = id;
      slot.source = source;
    }
  }
  return plates;
};

// Compute the expected score from the weighted components for each sequence of plates.
const SCORING_PATHS = {
  summer_garden: [
    {
      stars: 1, pct: 0.6696428571428571,
      home: ['bread', 'egg', 'tomato', 'cucumber', 'strawberry'],
      market: ['rice', 'rice', 'processed_ham', 'processed_ham', 'bell_pepper', 'bell_pepper', 'banana', 'cherry', 'cherry'],
    },
    {
      stars: 2, pct: 0.7482142857142857,
      home: ['tomato', 'cucumber', 'strawberry', 'banana', 'egg'],
      market: ['bread', 'rice', 'rice', 'chicken', 'lentils', 'bell_pepper', 'bell_pepper', 'cherry', 'cherry'],
    },
    {
      stars: 3, pct: 1,
      home: ['tomato', 'cucumber', 'strawberry', 'banana', 'bread'],
      market: ['rice', 'rice', 'lentils', 'lentils', 'lentils', 'bell_pepper', 'bell_pepper', 'cherry', 'cherry'],
    },
  ],
  autumn_harvest: [
    {
      stars: 1, pct: 0.6696428571428571,
      home: ['bread', 'rice', 'egg', 'mushroom', 'pumpkin'],
      market: ['pasta', 'chicken_nuggets', 'chicken_nuggets', 'leek', 'leek', 'banana', 'banana', 'banana', 'banana'],
    },
    {
      stars: 2, pct: 0.7232142857142858,
      home: ['bread', 'rice', 'egg', 'pumpkin', 'banana'],
      market: ['rice', 'lentils', 'chicken_nuggets', 'pumpkin', 'mushroom', 'leek', 'apple', 'apple', 'apple'],
    },
    {
      stars: 3, pct: 1,
      home: ['mushroom', 'pumpkin', 'bread', 'rice', 'banana'],
      market: ['pasta', 'lentils', 'lentils', 'lentils', 'leek', 'leek', 'apple', 'apple', 'apple'],
    },
  ],
  winter_pantry: [
    {
      stars: 1, pct: 0.6053571428571429,
      home: ['rice', 'egg', 'kale', 'orange', 'banana'],
      market: ['rice', 'bread', 'chicken', 'chicken', 'kale', 'kale', 'kale', 'strawberry', 'strawberry'],
    },
    {
      stars: 2, pct: 0.7553571428571428,
      home: ['rice', 'egg', 'kale', 'orange', 'banana'],
      market: ['rice', 'rice', 'chicken', 'chicken', 'chicory', 'chicory', 'chicory', 'strawberry', 'strawberry'],
    },
    {
      stars: 3, pct: 1,
      home: ['orange', 'kale', 'bread', 'banana', 'rice'],
      market: ['pasta', 'lentils', 'lentils', 'lentils', 'chicory', 'chicory', 'chicory', 'mandarin', 'mandarin'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// KEPT locks (unchanged by the redesign)
// ═══════════════════════════════════════════════════════════════════════

describe('foodwaste — WASTE_FACTS verbatim locks (provisional)', () => {
  const byId = Object.fromEntries(WASTE_FACTS.map((f) => [f.id, f]));

  it('locks the 2 public UNEP statistics word-for-word', () => {
    expect(byId.unep_meals.quote).toBe('1 billion meals of edible food… wasted every single day');
    expect(byId.unep_trillion.quote).toBe('over US$1 trillion worth of food… thrown away every year');
  });

  it('every waste fact is sourced + registered + flagged provisional', () => {
    expect(WASTE_FACTS).toHaveLength(2);
    for (const f of WASTE_FACTS) {
      expect(f.sourceId).toBe(WASTE_FACTS_SOURCE);
      expect(SOURCES[f.sourceId], f.sourceId).toBeTruthy();
      expect(f.provisional).toBe(true);
    }
  });

  // The card gives a plain-language explanation and its source chip opens the quotation.
  it('every quote is verbatim in the source viewer (each side of the elision)', () => {
    for (const f of WASTE_FACTS) {
      for (const part of f.quote.split('…').map(verbatimCore).filter(Boolean)) {
        expect(SOURCE_HTML.includes(part), `${f.id}: ${part}`).toBe(true);
      }
    }
  });

  it('every waste fact has a child-facing plain sentence', () => {
    for (const f of WASTE_FACTS) expectPlainSentence(f.plain, f.id);
  });

  it('meal_planner.facts has a non-empty translation for every fact in el/nl/pt', () => {
    for (const [lname, loc] of [['el', el], ['nl', nl], ['pt', pt]]) {
      for (const f of WASTE_FACTS) {
        const val = loc.meal_planner?.facts?.[f.id];
        expect(val, `${lname} missing meal_planner.facts.${f.id}`).toBeTruthy();
        expectPlainSentence(val, `${lname}.${f.id}`);
      }
    }
  });
});

describe('meal_planner — child-facing interaction and result copy', () => {
  const locales = { en, el, nl, pt };

  it('names the food in the grab prompt and exposes the real shopping cap', () => {
    for (const [language, locale] of Object.entries(locales)) {
      expect(locale.meal_planner.grab_prompt, language).toContain('{{food}}');
      expect(locale.meal_planner.market_count, language).toContain('{{used}}');
      expect(locale.meal_planner.market_count, language).toContain('{{total}}');
    }
  });

  it('explains both Q actions and gives touch parity for the source', () => {
    const undoWords = {
      en: /undo/i,
      el: /αναίρεσ/i,
      nl: /ongedaan/i,
      pt: /desfaz/i,
    };
    const touchWords = {
      en: /tap/i,
      el: /άγγιξ/i,
      nl: /tik/i,
      pt: /toca/i,
    };

    for (const [language, locale] of Object.entries(locales)) {
      expect(locale.meal_planner.undo_hint, language).toMatch(undoWords[language]);
      expect(locale.meal_planner.press_s, language).toMatch(touchWords[language]);
    }
  });

  it('has the two result-page prompts and all four shared result tiers', () => {
    for (const [language, locale] of Object.entries(locales)) {
      expect(locale.meal_planner.results_next_prompt, language).toBeTruthy();
      expect(locale.meal_planner.fact_continue_prompt, language).toBeTruthy();
      for (const tier of ['perfect', 'great', 'pass', 'fail']) {
        expect(locale.meal_planner.results[`tier_${tier}_title`], `${language}.${tier}.title`).toBeTruthy();
        expect(locale.meal_planner.results[`tier_${tier}_body`], `${language}.${tier}.body`).toBeTruthy();
      }
      const summary = locale.meal_planner.results.summary;
      expect(summary, language).toContain('{{sustainability}}');
      expect(summary, language).toContain('{{waste}}');
      expect(summary, language).toContain('{{nutrition}}');
    }
  });
});

describe('foodwaste — AXIS_WEIGHTS (sustainability-forward)', () => {
  it('sustainability is the single dominant axis', () => {
    expect(AXIS_WEIGHTS.sustainability).toBeGreaterThan(AXIS_WEIGHTS.waste);
    expect(AXIS_WEIGHTS.waste).toBeGreaterThan(AXIS_WEIGHTS.nutrition);
    expect(AXIS_WEIGHTS.sustainability).toBeGreaterThanOrEqual(
      AXIS_WEIGHTS.waste + AXIS_WEIGHTS.nutrition,
    );
  });
});

describe('foodwaste — scoreSustainability', () => {
  it('plant + low-carbon scores far above meat + high-carbon', () => {
    expect(scoreSustainability(['lentils'])).toBeGreaterThan(scoreSustainability(['beef']));
  });
  it('rewards in-season over out-of-season', () => {
    expect(scoreSustainability(['tomato'], 'summer')).toBeGreaterThan(scoreSustainability(['tomato'], 'winter'));
  });
  it('empty plan = 0', () => {
    expect(scoreSustainability([])).toBe(0);
  });
});

describe('foodwaste — scoreWaste (use-inventory-first · final-state redundant buys, 12/10)', () => {
  it('rewards consuming what is already in the fridge', () => {
    expect(scoreWaste(['lettuce', 'tomato'], ['lettuce', 'tomato', 'egg'])).toBeCloseTo(2 / 3, 5);
    expect(scoreWaste(['rice', 'beef'], ['lettuce', 'tomato'])).toBe(0);
  });
  it('empty inventory = nothing to waste (1)', () => {
    expect(scoreWaste(['rice'], [])).toBe(1);
  });
  it('buying a food you own costs one credit only while the home one stays unused (final state)', () => {
    const inv = ['lettuce', 'tomato', 'egg'];
    expect(scoreWaste(['lettuce', 'tomato'], inv)).toBeCloseTo(2 / 3, 5);
    // 12/10: the home tomato is on the plate, so the bought tomato is not redundant (was 1/3)
    expect(scoreWaste(['lettuce', 'tomato'], inv, ['tomato'])).toBeCloseTo(2 / 3, 5);
    // the home egg stays unused and an egg is bought → one penalty
    expect(scoreWaste(['lettuce', 'tomato'], inv, ['egg'])).toBeCloseTo(1 / 3, 5);
    // Buying the same unused home food twice still incurs only one penalty.
    expect(scoreWaste(['lettuce', 'tomato'], inv, ['egg', 'egg', 'egg'])).toBeCloseTo(1 / 3, 5);
    // two DIFFERENT unused home foods bought → two penalties
    expect(scoreWaste(['lettuce'], inv, ['egg', 'tomato'])).toBe(0);
    expect(scoreWaste(['lettuce'], inv, ['egg', 'tomato', 'lettuce'])).toBe(0);
    expect(scoreWaste(['lettuce'], inv, ['rice'])).toBeCloseTo(1 / 3, 5);
  });
  it('counts home foods outside the tracked list too, without changing the denominator', () => {
    const tracked = ['strawberry', 'banana', 'bread'];
    const home = ['tomato', 'cucumber', ...tracked, 'egg'];
    // tomato has no «Use me first!» but is home, unused and bought → one penalty, still /3
    expect(scoreWaste(['strawberry', 'bread'], tracked, ['tomato'], home)).toBeCloseTo(1 / 3, 10);
    expect(scoreWaste(['strawberry', 'bread', 'tomato'], tracked, ['tomato'], home)).toBeCloseTo(2 / 3, 10);
    // without the home list only tracked foods can be redundant
    expect(scoreWaste(['strawberry', 'bread'], tracked, ['tomato'])).toBeCloseTo(2 / 3, 10);
    // floor at 0, cap at 1
    expect(scoreWaste([], tracked, ['tomato', 'banana'], home)).toBe(0);
    expect(scoreWaste(tracked, tracked, [], home)).toBe(1);
  });
});

describe('foodwaste — gradeMealPlan (tiers & tunable weights · unchanged grader)', () => {
  it('tiers by normalised percentage, pass at 55%', () => {
    expect(gradeMealPlan({ sustainability: 1, waste: 1, nutrition: 1 }).tier).toBe('perfect');
    expect(gradeMealPlan({ sustainability: 0, waste: 0, nutrition: 0 }).tier).toBe('fail');
    expect(gradeMealPlan({ sustainability: 1, waste: 0, nutrition: 0 }).passed).toBe(false); // 0.5
    expect(gradeMealPlan({ sustainability: 1, waste: 0, nutrition: 1 }).passed).toBe(true);  // 0.7
  });
  it('nutrition weight is a tunable parameter', () => {
    const axes = { sustainability: 0.2, waste: 0.2, nutrition: 1 };
    const base = gradeMealPlan(axes);
    const nutritionFirst = gradeMealPlan(axes, { sustainability: 0.2, waste: 0.2, nutrition: 0.6 });
    expect(nutritionFirst.pct).toBeGreaterThan(base.pct);
  });
});

describe('foodwaste — processed/junk penalty (#4 · doc "4 first games analysis" L98-100)', () => {
  const byId = Object.fromEntries(FOOD_ITEMS.map((f) => [f.id, f]));
  const JUNK = ['soda', 'chicken_nuggets', 'processed_ham', 'processed_sausage',
    'processed_burger', 'instant_noodles', 'frozen_lasagna', 'sugary_juice'];

  it('the doc not-healthy "Extras" all exist in FOOD_ITEMS flagged processed:true', () => {
    for (const id of JUNK) {
      expect(byId[id], id).toBeTruthy();
      expect(byId[id].processed, id).toBe(true);
    }
  });
  it('adding a processed item DRAGS the sustainability score down (penalty, not just dilution)', () => {
    const clean = scoreSustainability(['lentils', 'lettuce'], 'summer');
    const withJunk = scoreSustainability(['lentils', 'lettuce', 'soda'], 'summer');
    expect(withJunk).toBeLessThan(clean);
  });
  it('a junk-only plan floors at 0 sustainability — penalised, never negative (teach-don\'t-punish)', () => {
    expect(scoreSustainability(['soda', 'chicken_nuggets'])).toBe(0);
    expect(scoreSustainability(['soda'])).toBeGreaterThanOrEqual(0);
  });
  it('only honest processed meat choices reach protein slots; drinks stay blocked', () => {
    expect(MP.slotTypeOf('processed_ham')).toBe('protein');
    expect(MP.slotTypeOf('processed_sausage')).toBe('protein');
    expect(MP.slotTypeOf('chicken_nuggets')).toBe('protein');
    expect(MP.slotTypeOf('soda')).toBe(null);
    expect(MP.slotTypeOf('sugary_juice')).toBe(null);
  });
});

describe('foodwaste — vegan plant proteins (#5 · doc "4 first games analysis" L96-97)', () => {
  const byId = Object.fromEntries(FOOD_ITEMS.map((f) => [f.id, f]));
  it('tofu and tempeh exist as plant-forward protein sources', () => {
    expect(byId.tofu).toBeTruthy();
    expect(byId.tempeh).toBeTruthy();
  });
  it('a vegan plant protein out-scores animal protein on sustainability', () => {
    expect(scoreSustainability(['tofu'])).toBeGreaterThan(scoreSustainability(['chicken']));
    expect(scoreSustainability(['tempeh'])).toBeGreaterThan(scoreSustainability(['beef']));
  });
});

// Check the scoring and choice rules for completed meal plans.

describe('redesign — PLATES (3 balanced meals · 14 required sockets)', () => {
  it('has breakfast/lunch/dinner with the doc socket structure', () => {
    expect(MP.PLATES).toHaveLength(3);
    const byMeal = Object.fromEntries(MP.PLATES.map((p) => [p.meal, p]));
    expect(byMeal.breakfast.sockets).toEqual(['carb', 'protein', 'fruit', 'fruit']);
    expect(byMeal.lunch.sockets).toEqual(['carb', 'protein', 'veg', 'veg', 'fruit']);
    expect(byMeal.dinner.sockets).toEqual(['carb', 'protein', 'veg', 'veg', 'fruit']);
  });
  it('totals 14 required sockets (carb3 / protein3 / veg4 / fruit4)', () => {
    const all = MP.PLATES.flatMap((p) => p.sockets);
    expect(all).toHaveLength(14);
    const count = (t) => all.filter((s) => s === t).length;
    expect(count('carb')).toBe(3);
    expect(count('protein')).toBe(3);
    expect(count('veg')).toBe(4);
    expect(count('fruit')).toBe(4);
  });
  it('exposes exactly the 14 playable slots, without a dormant 3rd-veg scoring promise', () => {
    expect(MP.PLATES.every((plate) => plate.bonusSocket === undefined)).toBe(true);
  });
});

describe('redesign — slotTypeOf (category → plate socket type)', () => {
  it('maps grain→carb, legume/protein/meat→protein, vegetable→veg, fruit→fruit', () => {
    expect(MP.slotTypeOf('bread')).toBe('carb');     // grain
    expect(MP.slotTypeOf('rice')).toBe('carb');
    expect(MP.slotTypeOf('egg')).toBe('protein');    // protein
    expect(MP.slotTypeOf('beef')).toBe('protein');   // meat
    expect(MP.slotTypeOf('lentils')).toBe('protein');// legume
    expect(MP.slotTypeOf('tofu')).toBe('protein');   // legume (vegan) — recast of #5 nutrition lock
    expect(MP.slotTypeOf('tempeh')).toBe('protein');
    expect(MP.slotTypeOf('tomato')).toBe('veg');
    expect(MP.slotTypeOf('banana')).toBe('fruit');
  });
  it('dairy and processed drinks map to NO socket (excluded / blocked)', () => {
    expect(MP.slotTypeOf('cheese')).toBe(null);  // dairy excluded
    expect(MP.slotTypeOf('milk')).toBe(null);
    expect(MP.slotTypeOf('soda')).toBe(null);    // extra
    expect(MP.slotTypeOf('sugary_juice')).toBe(null);
  });
});

describe('redesign — fitsSocket (typed sockets, direct-fill)', () => {
  it('an item fits an OPEN socket of its slot type', () => {
    const p = mkPlate('breakfast', ['carb', 'protein', 'fruit', 'fruit']);
    expect(MP.fitsSocket('egg', p)).toBe(true);    // protein
    expect(MP.fitsSocket('bread', p)).toBe(true);  // carb
    expect(MP.fitsSocket('banana', p)).toBe(true); // fruit
  });
  it('returns false when no open socket matches the type', () => {
    const full = mkPlate('breakfast', ['carb', 'protein', 'fruit', 'fruit'], ['bread', 'egg', 'banana', 'apple']);
    expect(MP.fitsSocket('lentils', full)).toBe(false); // nothing open
    const vegGap = mkPlate('lunch', ['carb', 'protein', 'veg', 'veg', 'fruit'], ['rice', 'egg', null, null, 'apple']);
    expect(MP.fitsSocket('banana', vegGap)).toBe(false); // only veg open, banana=fruit
    expect(MP.fitsSocket('tomato', vegGap)).toBe(true);  // veg open
  });
  it('pure junk fits NO socket (blocked-from-socket · recast of #4 junk lock)', () => {
    const p = mkPlate('breakfast', ['carb', 'protein', 'fruit', 'fruit']);
    expect(MP.fitsSocket('soda', p)).toBe(false);
    expect(MP.fitsSocket('sugary_juice', p)).toBe(false);
  });
});

describe('redesign — scoreNutrition = slot-completeness', () => {
  it('a fully-built set of plates scores 1.0', () => {
    expect(MP.scoreNutrition(completePlantPlates())).toBe(1);
  });
  it('half-filled required sockets score ~0.5', () => {
    expect(MP.scoreNutrition(halfPlates())).toBeCloseTo(0.5, 5);
  });
  it('empty plates score 0', () => {
    expect(MP.scoreNutrition(emptyPlates())).toBe(0);
  });
});

describe('redesign — scorePlan(plates, {season, scenario})', () => {
  it('a complete plant-forward in-season plan beats a complete meat-heavy out-of-season one', () => {
    const good = MP.scorePlan(completePlantPlates(), { season: 'summer' });
    const bad = MP.scorePlan(completeMeatPlates(), { season: 'winter' });
    expect(good.pct).toBeGreaterThan(bad.pct);
    expect(good.passed).toBe(true);
  });
  it('both complete plans score full Nutrition (structure gate = 1.0)', () => {
    expect(MP.scorePlan(completePlantPlates(), { season: 'summer' }).axes.nutrition).toBe(1);
    expect(MP.scorePlan(completeMeatPlates(), { season: 'winter' }).axes.nutrition).toBe(1);
  });
  it('season matters: the same plan scores higher Sustainability in its own season', () => {
    const inSeason = MP.scorePlan(completePlantPlates(), { season: 'summer' });
    const offSeason = MP.scorePlan(completePlantPlates(), { season: 'winter' });
    expect(inSeason.axes.sustainability).toBeGreaterThan(offSeason.axes.sustainability);
  });
});

describe('Meal Planner live stars — safe thresholds', () => {
  it.each([
    [-1, 0], [0, 0], [0.549999, 0], [0.55, 1], [0.699999, 1],
    [0.7, 2], [0.849999, 2], [0.85, 3], [1, 3], [4, 3],
  ])('maps pct %s to %s stars', (pct, stars) => {
    expect(MP.mealPlannerStarsForPct(pct)).toBe(stars);
  });

  it.each([undefined, null, '0.85', Number.NaN, Infinity, -Infinity])(
    'treats invalid pct %s as zero stars',
    (pct) => expect(MP.mealPlannerStarsForPct(pct)).toBe(0),
  );
});

// Float sums can land one ulp under a threshold (0.35 + 0.2 === 0.5499999999999999).
// The tolerance must lift only that artefact: weights, thresholds and credited points stay.
const oneUlpBelow = (x) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0) - 1n);
  return view.getFloat64(0);
};

describe('Meal Planner thresholds — floating-point precision at 55/70/85', () => {
  it('a live summer plan worth exactly 55% earns the first star', () => {
    const scenario = MP.SCENARIOS.find((s) => s.id === 'summer_garden');
    const options = { season: scenario.season, scenario };
    // 12 of 14 placements (breakfast and lunch complete, 3 dinner slots):
    // Sustainability 8.2/12 = 0.68333…, Waste ⅓ (strawberry used, no redundant buy), Balanced 12/14.
    // pct = 0.5·0.68333…·12/14 + 0.3·⅓·12/14 + 0.2·12/14 = (4.1 + 1.2 + 2.4)/14 = 7.7/14 = exactly 11/20.
    const plates = planFromPicks({
      home: ['strawberry', 'tomato', 'cucumber'],
      market: ['rice', 'chicken', 'cherry', 'rice',
        'processed_ham', 'cherry', 'processed_ham', 'tomato', 'cherry'],
    });
    const live = MP.scorePlanProgress(plates, options);

    expect(live.pct, 'fixture must reproduce the float artefact').toBeLessThan(0.55);
    expect(live.pct).toBeCloseTo(0.55, 12);
    expect(MP.mealPlannerStarsForPct(live.pct)).toBe(1);
    expect(live.tier).toBe('pass');
    expect(live.passed).toBe(true);
    expect(Math.round(live.pct * 100), 'credited points unchanged').toBe(55);
  });

  it.each([
    [0.55, 1, 'pass'],
    [0.7, 2, 'great'],
    [0.85, 3, 'perfect'],
  ])('one ulp below %s counts as the threshold (%s★, %s)', (threshold, stars, tier) => {
    const pct = oneUlpBelow(threshold);
    expect(pct).toBeLessThan(threshold);
    expect(MP.mealPlannerStarsForPct(pct)).toBe(stars);
    const graded = gradeMealPlan(
      { sustainability: pct, waste: 0, nutrition: 0 },
      { sustainability: 1, waste: 0, nutrition: 0 },
    );
    expect(graded.pct, 'raw pct is returned untouched').toBe(pct);
    expect(graded.tier).toBe(tier);
    expect(graded.passed).toBe(true);
  });

  it.each([
    [0.55, 0, 'fail'],
    [0.7, 1, 'pass'],
    [0.85, 2, 'great'],
  ])('a real gap under %s still stays below (%s★, %s)', (threshold, stars, tier) => {
    const pct = threshold - 1e-7;
    expect(MP.mealPlannerStarsForPct(pct)).toBe(stars);
    const graded = gradeMealPlan(
      { sustainability: pct, waste: 0, nutrition: 0 },
      { sustainability: 1, waste: 0, nutrition: 0 },
    );
    expect(graded.tier).toBe(tier);
    expect(graded.passed).toBe(stars > 0);
  });

  it('keeps the weights and the exact thresholds', () => {
    expect(AXIS_WEIGHTS).toEqual({ sustainability: 0.5, waste: 0.3, nutrition: 0.2 });
    expect([0.55, 0.7, 0.85].map((pct) => MP.mealPlannerStarsForPct(pct))).toEqual([1, 2, 3]);
  });
});

describe('Meal Planner scenario scoring fairness and live progress', () => {
  for (const scenario of MP.SCENARIOS) {
    const paths = SCORING_PATHS[scenario.id];

    it(`${scenario.id}: legal full paths reach 1/2/3 stars`, () => {
      expect(paths, `${scenario.id} fixture`).toHaveLength(3);
      const marketPool = new Set(Object.values(scenario.market).flat());

      for (const path of paths) {
        expect(path.home).toHaveLength(5);
        expect(new Set(path.home).size).toBe(path.home.length);
        expect(path.home.every((id) => scenario.homeInventory.includes(id))).toBe(true);
        expect(path.market).toHaveLength(9);
        expect(path.market.every((id) => marketPool.has(id))).toBe(true);

        const result = MP.scorePlan(planFromPicks(path), { season: scenario.season, scenario });
        expect(result.pct, `${scenario.id}:${path.stars}★`).toBeCloseTo(path.pct, 10);
        expect(MP.mealPlannerStarsForPct(result.pct), `${scenario.id}:${path.stars}★`).toBe(path.stars);
      }
    });

    it(`${scenario.id}: empty=0, partial stays below full, and full progress equals final`, () => {
      const best = paths.at(-1);
      const full = planFromPicks(best);
      const partial = emptyPlates();
      const firstFilled = full.flatMap((plate) => plate.slots).find((slot) => slot.item);
      const matchingSlot = partial.flatMap((plate) => plate.slots)
        .find((slot) => slot.type === firstFilled.type);
      Object.assign(matchingSlot, firstFilled);
      const options = { season: scenario.season, scenario };

      const empty = MP.scorePlanProgress(emptyPlates(), options);
      expect(empty).toEqual({
        axes: { sustainability: 0, waste: 0, nutrition: 0 },
        pct: 0, tier: 'fail', passed: false,
      });

      const live = MP.scorePlanProgress(partial, options);
      const final = MP.scorePlan(full, options);
      expect(live.pct).toBeGreaterThan(0);
      expect(live.pct).toBeLessThan(final.pct);
      expect(MP.mealPlannerStarsForPct(live.pct)).toBe(0);
      expect(MP.scorePlanProgress(full, options)).toEqual(final);
    });
  }

  it('gives all scenarios the same honest ceiling', () => {
    const ceilings = MP.SCENARIOS.map((scenario) => {
      const full = planFromPicks(SCORING_PATHS[scenario.id].at(-1));
      return MP.scorePlan(full, { season: scenario.season, scenario }).pct;
    });
    expect(ceilings).toEqual([1, 1, 1]);
  });
});

describe('redesign — SCENARIOS validity (3 seasonal · invariants α-ε)', () => {
  it('there are exactly 3 scenarios with season + homeInventory(6) + 5 market categories', () => {
    expect(MP.SCENARIOS).toHaveLength(3);
    for (const s of MP.SCENARIOS) {
      expect(['summer', 'autumn', 'winter']).toContain(s.season);
      expect(s.homeInventory).toHaveLength(6);
      for (const cat of ['carb', 'protein', 'veg', 'fruit', 'extra']) {
        expect(Array.isArray(s.market[cat]), `${s.id}.${cat}`).toBe(true);
      }
    }
  });
  it('(α) solvable — the market supplies every required slot type', () => {
    for (const s of MP.SCENARIOS) {
      const all = Object.values(s.market).flat();
      for (const type of ['carb', 'protein', 'veg', 'fruit']) {
        expect(all.some((id) => MP.slotTypeOf(id) === type), `${s.id}:${type}`).toBe(true);
      }
    }
  });
  it('(β) ≥2 at-risk items in the home inventory', () => {
    for (const s of MP.SCENARIOS) {
      expect(atRiskInventory(s.homeInventory).length, s.id).toBeGreaterThanOrEqual(2);
    }
  });
  it('(γ) ≥1 "already have it" trap — an id in BOTH home and market', () => {
    for (const s of MP.SCENARIOS) {
      const market = new Set(Object.values(s.market).flat());
      expect(s.homeInventory.some((id) => market.has(id)), s.id).toBe(true);
    }
  });
  it('(δ) ≥1 junk distractor — a non-empty extra list, all slotType null', () => {
    for (const s of MP.SCENARIOS) {
      expect(s.market.extra.length, s.id).toBeGreaterThanOrEqual(1);
      expect(s.market.extra.every((id) => MP.slotTypeOf(id) === null), s.id).toBe(true);
    }
  });
  it('(ε) ≥1 plant-vs-animal protein choice in the market', () => {
    const PLANT = new Set(['lentils', 'tofu', 'tempeh']);
    for (const s of MP.SCENARIOS) {
      expect(s.market.protein.some((id) => PLANT.has(id)), `${s.id}:plant`).toBe(true);
      expect(s.market.protein.some((id) => !PLANT.has(id) && MP.slotTypeOf(id) === 'protein'), `${s.id}:animal`).toBe(true);
    }
  });
  it('every scenario id resolves in FOOD_ITEMS', () => {
    for (const s of MP.SCENARIOS) {
      const ids = [...s.homeInventory, ...Object.values(s.market).flat()];
      for (const id of ids) expect(VALID.has(id), `${s.id}:${id}`).toBe(true);
    }
  });
});

describe('redesign — pickScenario (deterministic in testMode)', () => {
  it('returns the scenario at the given index', () => {
    expect(MP.pickScenario({ index: 0 }).id).toBe(MP.SCENARIOS[0].id);
    expect(MP.pickScenario({ index: 2 }).id).toBe(MP.SCENARIOS[2].id);
  });
  it('without an index, never immediately repeats the last scenario', () => {
    const s = MP.pickScenario({ lastId: MP.SCENARIOS[0].id });
    expect(MP.SCENARIOS.map((x) => x.id)).toContain(s.id);
    expect(s.id).not.toBe(MP.SCENARIOS[0].id);
  });
});

describe('redesign — spoilage consequence (home-first with teeth)', () => {
  const SCN = {
    id: 't', season: 'summer',
    homeInventory: ['lettuce', 'tomato', 'egg', 'bread', 'apple', 'strawberry'],
    market: { carb: ['rice'], protein: ['tofu', 'chicken'], veg: ['cucumber'], fruit: ['banana'], extra: ['soda'] },
  };
  // at-risk(home) = short shelf ≤4 days: lettuce(3), bread(1), strawberry(3)

  it('spoiledIds = at-risk home items that did NOT end up on any plate', () => {
    const used = [
      mkPlate('breakfast', ['carb', 'protein', 'fruit', 'fruit'], ['bread', 'egg', 'strawberry', 'apple']),
      ...emptyPlates().slice(1),
    ];
    const spoiled = MP.spoiledIds(used, SCN);
    expect(spoiled).toContain('lettuce');      // left in fridge → spoils
    expect(spoiled).not.toContain('bread');    // used
    expect(spoiled).not.toContain('strawberry');
  });

  it('using more at-risk items raises the Waste axis (vs leaving them to spoil)', () => {
    const usesAll = [
      mkPlate('breakfast', ['carb', 'protein', 'fruit', 'fruit'], ['bread', 'egg', 'strawberry', 'apple']),
      mkPlate('lunch', ['carb', 'protein', 'veg', 'veg', 'fruit'], ['rice', 'tofu', 'lettuce', 'cucumber', 'banana']),
      mkPlate('dinner', ['carb', 'protein', 'veg', 'veg', 'fruit'], ['rice', 'chicken', 'tomato', 'cucumber', 'banana']),
    ];
    const usesNone = completeMeatPlates(); // none of SCN's at-risk items
    const a = MP.scorePlan(usesAll, { season: 'summer', scenario: SCN });
    const b = MP.scorePlan(usesNone, { season: 'summer', scenario: SCN });
    expect(a.axes.waste).toBeGreaterThan(b.axes.waste);
  });
});

describe('redesign — no negative score (clamp/floor)', () => {
  it('every axis and the total stay within [0,1] even for a worst-case plan', () => {
    const SCN = {
      id: 't', season: 'winter',
      homeInventory: ['cheese', 'milk', 'beef', 'chicken', 'rice', 'pasta'],
      market: { carb: ['rice'], protein: ['beef'], veg: ['kale'], fruit: ['apple'], extra: ['soda'] },
    };
    const r = MP.scorePlan(completeMeatPlates(), { season: 'spring', scenario: SCN });
    for (const k of ['sustainability', 'waste', 'nutrition']) {
      expect(r.axes[k], k).toBeGreaterThanOrEqual(0);
      expect(r.axes[k], k).toBeLessThanOrEqual(1);
    }
    expect(r.pct).toBeGreaterThanOrEqual(0);
    expect(r.pct).toBeLessThanOrEqual(1);
  });
});

// Count each unused home food once, using the final plates.
describe('Meal Planner — final-state waste rule (12/10)', () => {
  const summer = MP.SCENARIOS.find((s) => s.id === 'summer_garden');
  const opts = { season: summer.season, scenario: summer };
  const slots = (plates) => plates.flatMap((plate) => plate.slots);
  const put = (plates, id, source) => {
    const slot = slots(plates).find((s) => s.type === MP.slotTypeOf(id) && !s.item);
    slot.item = id; slot.source = source;
    return slot;
  };
  const undo = (slot) => { slot.item = null; slot.source = null; };
  const waste = (plates) => MP.scorePlanProgress(plates, opts).axes.waste;
  const finalWaste = (plates) => MP.scorePlan(plates, opts).axes.waste;
  // the live bar dilutes Waste by filled/14; check that the live value is exactly the final rule
  // diluted, and return the undiluted Waste for the assertions
  const credit = (plates) => {
    const final = finalWaste(plates);
    const n = slots(plates).filter((s) => s.item).length;
    expect(waste(plates), 'live Waste = final Waste × filled/14').toBeCloseTo(n === 14 ? final : final * n / 14, 12);
    return final;
  };

  it('S1: the brief example (P3) — banana bought while the home banana stays → Waste ⅓, 74.82% ★★', () => {
    const plates = emptyPlates();
    // breakfast · lunch · dinner exactly as in the example
    const fill = [
      ['bread', 'home'], ['egg', 'home'], ['strawberry', 'home'], ['cherry', 'market'],
      ['rice', 'market'], ['lentils', 'market'], ['tomato', 'market'], ['cucumber', 'home'], ['banana', 'market'],
      ['rice', 'market'], ['chicken', 'market'], ['bell_pepper', 'market'], ['tomato', 'home'], ['cherry', 'market'],
    ];
    slots(plates).forEach((slot, i) => { [slot.item, slot.source] = fill[i]; expect(MP.slotTypeOf(slot.item)).toBe(slot.type); });
    const result = MP.scorePlan(plates, opts);
    expect(result.axes.waste).toBeCloseTo(1 / 3, 12);
    expect(result.pct).toBeCloseTo(0.7482142857142857, 12);
    expect(Math.round(result.pct * 100)).toBe(75);
    expect(MP.mealPlannerStarsForPct(result.pct)).toBe(2);
    // the bought tomato is NOT redundant: the home tomato is on the dinner plate
    expect(slots(plates).filter((s) => s.item === 'tomato').map((s) => s.source).sort()).toEqual(['home', 'market']);
  });

  it('S2/S9: using the home food — before or after the purchase — clears the penalty, live and final', () => {
    const before = emptyPlates();
    put(before, 'strawberry', 'home'); put(before, 'bread', 'home');
    const base = credit(before);                                   // 2/3
    expect(base).toBeCloseTo(2 / 3, 12);

    const buyFirst = structuredClone(before);
    put(buyFirst, 'banana', 'market');
    expect(credit(buyFirst), 'bought banana, home banana still in the fridge').toBeCloseTo(1 / 3, 12);
    expect(waste(buyFirst)).toBeLessThan(waste(before) + 1e-12);
    put(buyFirst, 'banana', 'home');
    expect(credit(buyFirst), 'home banana placed after the buy → no penalty').toBeCloseTo(1, 12);

    const homeFirst = structuredClone(before);
    put(homeFirst, 'banana', 'home');
    put(homeFirst, 'banana', 'market');
    expect(credit(homeFirst), 'home banana placed before the buy → no penalty').toBeCloseTo(1, 12);
    expect(MP.scorePlanProgress(homeFirst, opts)).toEqual(MP.scorePlanProgress(buyFirst, opts));
  });

  it('S3 (undo): taking the home food back off the plate brings the penalty back; undoing the buy removes it', () => {
    const plates = emptyPlates();
    put(plates, 'strawberry', 'home'); put(plates, 'bread', 'home');
    const bought = put(plates, 'banana', 'market');
    const home = put(plates, 'banana', 'home');
    expect(credit(plates)).toBeCloseTo(1, 12);
    const livePct = MP.scorePlanProgress(plates, opts).pct;
    undo(home);                                                     // Q on the home banana
    expect(credit(plates)).toBeCloseTo(1 / 3, 12);
    expect(MP.scorePlanProgress(plates, opts).pct).toBeLessThan(livePct);
    undo(bought);                                                   // Q on the bought banana
    expect(credit(plates)).toBeCloseTo(2 / 3, 12);
  });

  it('two or more buys of the same unused home food are ONE penalty; undo keeps it until the last buy goes', () => {
    const plates = emptyPlates();
    put(plates, 'strawberry', 'home'); put(plates, 'bread', 'home');
    const b1 = put(plates, 'banana', 'market');
    expect(credit(plates)).toBeCloseTo(1 / 3, 12);
    const b2 = put(plates, 'banana', 'market');
    expect(credit(plates), 'second banana: still one penalty').toBeCloseTo(1 / 3, 12);
    const b3 = put(plates, 'banana', 'market');
    expect(credit(plates), 'third banana: still one penalty').toBeCloseTo(1 / 3, 12);
    undo(b3); undo(b2);
    expect(credit(plates), 'one buy left: penalty stays').toBeCloseTo(1 / 3, 12);
    undo(b1);
    expect(credit(plates), 'no buy left: penalty gone').toBeCloseTo(2 / 3, 12);
    // a different unused home food is a second penalty
    put(plates, 'banana', 'market'); put(plates, 'tomato', 'market');
    expect(credit(plates)).toBeCloseTo(0, 12);
  });

  it('a home food without «Use me first!» counts too — tomato unused + bought → −1; placed → 0', () => {
    expect(atRiskInventory(summer.homeInventory)).not.toContain('tomato');
    const plates = emptyPlates();
    put(plates, 'strawberry', 'home'); put(plates, 'bread', 'home');
    put(plates, 'tomato', 'market');
    expect(credit(plates)).toBeCloseTo(1 / 3, 12);
    put(plates, 'tomato', 'market');
    expect(credit(plates), 'two tomatoes: one penalty').toBeCloseTo(1 / 3, 12);
    const home = put(plates, 'tomato', 'home');
    expect(credit(plates)).toBeCloseTo(2 / 3, 12);
    undo(home);
    expect(credit(plates)).toBeCloseTo(1 / 3, 12);
  });

  it('S6: denominator stays the at-risk count (3/3/2) and Waste is floored at 0', () => {
    expect(MP.SCENARIOS.map((s) => atRiskInventory(s.homeInventory).length)).toEqual([3, 3, 2]);
    const plates = emptyPlates();
    for (const id of ['banana', 'tomato', 'bread']) put(plates, id, 'market');
    expect(finalWaste(plates)).toBe(0);                              // (0 − 3)/3 → 0
  });

  it('S10/S11: credited points are Math.round(pct·100) and the stars keep their thresholds', () => {
    const cases = [
      // [season, home, market, pct, points, stars]
      ['summer', ['tomato', 'cucumber', 'strawberry', 'banana', 'egg'],
        ['rice', 'rice', 'rice', 'chicken', 'lentils', 'tomato', 'tomato', 'banana', 'banana'], 0.8482142857142858, 85, 2],
      ['winter', ['orange', 'kale', 'bread', 'rice', 'egg'],
        ['rice', 'processed_sausage', 'processed_sausage', 'kale', 'kale', 'kale', 'strawberry', 'strawberry', 'strawberry'], 0.6982142857142857, 70, 1],
      ['winter', ['rice', 'egg', 'kale', 'orange', 'banana'],
        ['rice', 'rice', 'processed_sausage', 'processed_sausage', 'kale', 'kale', 'kale', 'mandarin', 'strawberry'], 0.7125, 71, 2],
    ];
    for (const [season, home, market, pct, points, stars] of cases) {
      const scenario = MP.SCENARIOS.find((s) => s.season === season);
      const result = MP.scorePlan(planFromPicks({ home, market }), { season, scenario });
      expect(result.pct).toBeCloseTo(pct, 12);
      expect(Math.round(result.pct * 100)).toBe(points);
      expect(MP.mealPlannerStarsForPct(result.pct)).toBe(stars);
    }
  });

  // S8 — every legal COMPLETE plan of the three scenarios, as compositions per slot type (each home
  // food at most once, buys ≤ MARKET_CAP, fixed plate order).
  // Oracle values (minimum pct, stars lost vs the previous rule) were computed independently by
  // two separate calculations; the old rule below is only the comparison baseline.
  const typesOf = { carb: 3, protein: 3, veg: 4, fruit: 4 };
  const multisets = (pool, k, from = 0) => (k === 0 ? [[]]
    : pool.slice(from).flatMap((id, i) => multisets(pool, k - 1, from + i).map((rest) => [id, ...rest])));
  const subsets = (pool) => pool.reduce((acc, id) => acc.concat(acc.map((s) => [...s, id])), [[]]);
  function legalPlans(scenario) {
    const market = Object.values(scenario.market).flat();
    const perType = Object.entries(typesOf).map(([type, n]) => {
      const home = scenario.homeInventory.filter((id) => MP.slotTypeOf(id) === type);
      const shop = [...new Set(market.filter((id) => MP.slotTypeOf(id) === type))];
      return subsets(home).filter((h) => h.length <= n)
        .flatMap((h) => multisets(shop, n - h.length).map((m) => ({ home: h, market: m })));
    });
    let combos = [{ home: [], market: [] }];
    for (const options of perType) {
      combos = combos.flatMap((c) => options.map((o) => ({ home: [...c.home, ...o.home], market: [...c.market, ...o.market] })))
        .filter((c) => c.market.length <= MARKET_CAP);
    }
    return combos;
  }
  const oldWaste = (plates, scenario) => {           // the rule before 12/10: −1 per at-risk BUY
    const atRisk = atRiskInventory(scenario.homeInventory);
    const filled = slots(plates).filter((s) => s.item);
    const used = new Set(filled.filter((s) => s.source === 'home').map((s) => s.item));
    const redundant = filled.filter((s) => s.source === 'market' && atRisk.includes(s.item)).length;
    return Math.max(0, Math.min(1, (atRisk.filter((id) => used.has(id)).length - redundant) / atRisk.length));
  };

  it('S8: every legal complete plan reaches ≥1★ (none fails), with the expected minimum and star changes', () => {
    const expected = {
      summer_garden: { count: 1512, minPct: 0.6696428571428571, oldFails: 9, lostStar: 15 },
      autumn_harvest: { count: 2952, minPct: 0.6696428571428571, oldFails: 20, lostStar: 48 },
      winter_pantry: { count: 4860, minPct: 0.5553571428571429, oldFails: 24, lostStar: 288 },
    };
    for (const scenario of MP.SCENARIOS) {
      const plans = legalPlans(scenario);
      const options = { season: scenario.season, scenario };
      let minPct = 1; let oldFails = 0; let lostStar = 0;
      for (const pick of plans) {
        const plates = planFromPicks(pick);
        const result = MP.scorePlan(plates, options);
        const live = MP.scorePlanProgress(plates, options);
        expect(live).toEqual(result);                                // same rule live and final
        minPct = Math.min(minPct, result.pct);
        const old = gradeMealPlan({ ...result.axes, waste: oldWaste(plates, scenario) });
        if (MP.mealPlannerStarsForPct(old.pct) === 0) oldFails += 1;
        if (MP.mealPlannerStarsForPct(result.pct) < MP.mealPlannerStarsForPct(old.pct)) lostStar += 1;
      }
      const e = expected[scenario.id];
      expect(plans.length, `${scenario.id} legal plans`).toBe(e.count);
      expect(minPct, `${scenario.id} minimum pct`).toBeCloseTo(e.minPct, 10);
      expect(MP.mealPlannerStarsForPct(minPct), `${scenario.id}: no complete plan fails`).toBeGreaterThanOrEqual(1);
      expect(oldFails, `${scenario.id}: plans that failed under the old rule`).toBe(e.oldFails);
      expect(lostStar, `${scenario.id}: plans that lose a star vs the old rule`).toBe(e.lostStar);
    }
  });
});
