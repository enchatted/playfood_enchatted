// Derive recap advice from the final plates, including the last placement.
import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import { SCENARIOS, PLATES, scorePlan, slotTypeOf, atRiskInventory } from '../../data/foodwaste.js';
import { MARKET_CAP } from './mealPlannerCarry.js';
import { mealPlanRecap, outOfSeason, isPlantSwapCandidate, sustainabilityReasons } from './mealPlanRecap.js';
import { splitPlanPoints, buildMealPlanRecapText, buildMealPlanHowText, formatPlanPct, foodLabel } from './mealPlanRecapText.js';
import { FOOD_ITEMS } from '../../data/foods.js';
import { AXIS_WEIGHTS, scoreSustainability } from '../../data/foodwaste.js';
import el from '../../i18n/locales/el.json';
import en from '../../i18n/locales/en.json';
import nl from '../../i18n/locales/nl.json';
import pt from '../../i18n/locales/pt.json';

const LOCALES = { el, en, nl, pt };
const SC = Object.fromEntries(SCENARIOS.map((s) => [s.season, s]));
const empty = () => PLATES.map((p) => ({ meal: p.meal, slots: p.sockets.map((type) => ({ type, item: null, source: null })) }));
// plates in fixed order (breakfast, lunch, dinner), home before market within a type
const planFrom = ({ home, market }) => {
  const plates = empty();
  for (const [source, ids] of [['home', home], ['market', market]]) for (const id of ids) {
    const slot = plates.flatMap((p) => p.slots).find((s) => s.type === slotTypeOf(id) && !s.item);
    slot.item = id; slot.source = source;
  }
  return plates;
};
// plates exactly as listed, slot by slot
const platesFrom = (rows) => {
  const plates = empty(); const flat = plates.flatMap((p) => p.slots);
  rows.forEach(([item, source], i) => { expect(slotTypeOf(item)).toBe(flat[i].type); flat[i].item = item; flat[i].source = source; });
  return plates;
};
async function texter(lang) {
  const i = i18next.createInstance();
  await i.init({ lng: lang, fallbackLng: false, resources: { [lang]: { translation: LOCALES[lang] } }, interpolation: { escapeValue: false } });
  const t = i.t.bind(i);
  return (recap, season) => buildMealPlanRecapText(recap, {
    tr: (key, vars) => t(`meal_planner.recap.${key}`, vars), nameOf: (id) => t(`foods.${id}`, id), lang,
    seasonName: t(`season.${season}`), useFirst: t('meal_planner.use_first'),
  });
}

// the readiness report's example (P3), summer, 74.82%
const P3 = [
  ['bread', 'home'], ['egg', 'home'], ['strawberry', 'home'], ['cherry', 'market'],
  ['rice', 'market'], ['lentils', 'market'], ['tomato', 'market'], ['cucumber', 'home'], ['banana', 'market'],
  ['rice', 'market'], ['chicken', 'market'], ['bell_pepper', 'market'], ['tomato', 'home'], ['cherry', 'market'],
];
// review 12/10 (P2): the first winter strawberry is the 14th placement
const WINTER_LAST_STRAWBERRY = [
  ['rice', 'home'], ['egg', 'home'], ['orange', 'home'], ['banana', 'home'],
  ['rice', 'market'], ['chicken', 'market'], ['kale', 'market'], ['kale', 'home'], ['mandarin', 'market'],
  ['bread', 'market'], ['chicken', 'market'], ['kale', 'market'], ['kale', 'market'], ['strawberry', 'market'],
];

describe('recap data (mealPlanRecap)', () => {
  it('P3: used strawberry + bread, banana spoiled AND bought → take it from the fridge; lentils instead of chicken', () => {
    const r = mealPlanRecap(platesFrom(P3), SC.summer);
    expect(r).toMatchObject({ used: ['strawberry', 'bread'], allUsed: false, spoiled: ['banana'], leftBought: ['banana'] });
    expect(r.wasteTip).toMatchObject({ kind: 'fridge', item: 'banana' });
    expect(r.sustTip).toMatchObject({ from: 'chicken', to: 'lentils', toSource: 'market' });
    expect(r.reduced).toEqual(['egg', 'chicken']);
    expect(r.pct).toBeCloseTo(0.7482142857142857, 12);
  });

  it('reads only plates + scenario (R1): same plates → same recap, whatever else is in the state', () => {
    const plates = platesFrom(P3);
    const extra = plates.map((p) => ({ ...p, history: [1, 2], slots: p.slots.map((s) => ({ ...s, emoji: '?', fridgeRef: { used: true } })) }));
    expect(mealPlanRecap(extra, SC.summer)).toEqual(mealPlanRecap(plates, SC.summer));
  });

  it('review P2: the 14th placement is the first winter strawberry → the recap names it out of season', async () => {
    const plates = platesFrom(WINTER_LAST_STRAWBERRY);
    const flat = plates.flatMap((p) => p.slots);
    expect(flat.filter((s) => s.source === 'market')).toHaveLength(9);
    expect(flat.filter((s) => s.source === 'home')).toHaveLength(5);
    const r = mealPlanRecap(plates, SC.winter);
    expect(r.outOfSeason).toEqual(['strawberry']);
    expect(r.reduced).toContain('strawberry');
    const tx = await texter('el');
    const v = tx(r, 'winter');
    expect(v.paragraphs[1].text).toContain('φράουλα 🍓 (εκτός εποχής: Χειμώνας)');
  });

  it('the last placement is a redundant buy / the first chicken → the recap still says it', async () => {
    const tx = await texter('el');
    // summer, home banana left in the fridge; the bought banana is placed last (dinner fruit)
    const redundant = mealPlanRecap(platesFrom([...P3.slice(0, 13), ['banana', 'market']]), SC.summer);
    expect(redundant.leftBought).toEqual(['banana']);
    const tw = tx(redundant, 'summer').paragraphs[0].text;
    expect(tw).toContain('Αγόρασες το ίδιο τρόφιμο από την αγορά.');
    expect(tw).toContain('Την επόμενη φορά, από το ψυγείο: μπανάνα 🍌.');
    // the only chicken is the last protein placed
    const chickenLast = mealPlanRecap(platesFrom(WINTER_LAST_STRAWBERRY.map((x, i) => (i === 5 ? ['lentils', 'market'] : x))), SC.winter);
    expect(chickenLast.sustTip).toMatchObject({ from: 'chicken', to: 'lentils' });
    expect(tx(chickenLast, 'winter').paragraphs[1].text).toContain('δοκίμασε: φακές 🫘 (αντί για: κοτόπουλο 🍗)');
  });

  // R4 — every legal complete plan of the three scenarios (compositions per slot type, fixed order)
  const typesOf = { carb: 3, protein: 3, veg: 4, fruit: 4 };
  const multisets = (pool, k, from = 0) => (k === 0 ? [[]] : pool.slice(from).flatMap((id, i) => multisets(pool, k - 1, from + i).map((r) => [id, ...r])));
  const subsets = (pool) => pool.reduce((acc, id) => acc.concat(acc.map((s) => [...s, id])), [[]]);
  const legalPlans = (sc) => {
    const market = Object.values(sc.market).flat();
    const per = Object.entries(typesOf).map(([type, n]) => {
      const home = sc.homeInventory.filter((id) => slotTypeOf(id) === type);
      const shop = [...new Set(market.filter((id) => slotTypeOf(id) === type))];
      return subsets(home).filter((h) => h.length <= n).flatMap((h) => multisets(shop, n - h.length).map((m) => ({ home: h, market: m })));
    });
    let combos = [{ home: [], market: [] }];
    for (const o of per) combos = combos.flatMap((c) => o.map((x) => ({ home: [...c.home, ...x.home], market: [...c.market, ...x.market] }))).filter((c) => c.market.length <= MARKET_CAP);
    return combos;
  };
  const apply = (plates, ch) => { const next = plates.map((p) => ({ ...p, slots: p.slots.map((s) => ({ ...s })) })); Object.assign(next[ch.plateIdx].slots[ch.socketIdx], { item: ch.to, source: ch.toSource }); return next; };
  const legal = (plates, sc) => {
    const f = plates.flatMap((p) => p.slots).filter((s) => s.item);
    const home = f.filter((s) => s.source === 'home').map((s) => s.item);
    const market = new Set(Object.values(sc.market).flat());
    return f.filter((s) => s.source === 'market').length <= MARKET_CAP && new Set(home).size === home.length
      && home.every((id) => sc.homeInventory.includes(id)) && f.filter((s) => s.source === 'market').every((s) => market.has(s.item))
      && f.every((s) => slotTypeOf(s.item) === s.type);
  };
  const EXPECT = { // Compare the computed counts with an independent enumeration of meal plans.
    summer: { n: 1512, w1: 486, w2: 324, sust: 1278 },
    autumn: { n: 2952, w1: 1152, w2: 696, sust: 2492 },
    winter: { n: 4860, w1: 1728, w2: 720, sust: 4467 },
  };

  it('R4: every advice is legal and improving, alone and together; covers season, redundant buys and plant swaps', async () => {
    const tx = { el: await texter('el'), en: await texter('en'), nl: await texter('nl'), pt: await texter('pt') };
    for (const [season, sc] of Object.entries(SC)) {
      const options = { season, scenario: sc };
      const plans = legalPlans(sc);
      const c = { n: plans.length, w1: 0, w2: 0, sust: 0 };
      for (const pick of plans) {
        const plates = planFrom(pick);
        const r = mealPlanRecap(plates, sc);
        const base = scorePlan(plates, options).pct;
        if (r.wasteTip) {
          c[r.wasteTip.kind === 'fridge' ? 'w1' : 'w2'] += 1;
          const after = apply(plates, r.wasteTip);
          expect(legal(after, sc)).toBe(true);
          expect(scorePlan(after, options).pct).toBeGreaterThan(base);
        }
        if (r.sustTip) {
          c.sust += 1;
          const slot = plates[r.sustTip.plateIdx].slots[r.sustTip.socketIdx];
          expect(slot.source, 'only a bought place changes').toBe('market');
          const after = apply(plates, r.sustTip);
          expect(legal(after, sc)).toBe(true);
          expect(scorePlan(after, options).axes.sustainability).toBeGreaterThan(scorePlan(plates, options).axes.sustainability);
          expect(scorePlan(after, options).pct).toBeGreaterThanOrEqual(base - 1e-12);
          if (r.wasteTip) {
            expect(r.sustTip.from === r.wasteTip.target || r.sustTip.from === r.wasteTip.item, 'no two advices about one food').toBe(false);
            const both = apply(apply(plates, r.wasteTip), r.sustTip);
            expect(legal(both, sc)).toBe(true);
            expect(scorePlan(both, options).pct).toBeGreaterThan(scorePlan(apply(plates, r.wasteTip), options).pct - 1e-12);
          }
        }
        // coverage of the chef's three choice advices, from the final plates
        const placed = plates.flatMap((p) => p.slots).map((s) => s.item);
        if (placed.some(isPlantSwapCandidate)) {
          expect(r.sustTip && isPlantSwapCandidate(r.sustTip.from) && r.sustTip.to === 'lentils', 'plant alternative always said').toBe(true);
        }
        expect(r.outOfSeason).toEqual([...new Set(placed.filter((id) => outOfSeason(id, season)))]);
        // R3: a food is listed once
        expect(new Set(r.reduced).size).toBe(r.reduced.length);
        // text: every language, no placeholder left; season and redundant buy appear when due
        for (const [lang, t] of Object.entries(tx)) {
          const v = t(r, season);
          for (const p of v.paragraphs) expect(p.text, `${lang} ${p.key}`).not.toMatch(/\{\{|undefined|null/);
          const sust = v.paragraphs[1].text; const waste = v.paragraphs[0].text;
          const R = LOCALES[lang].meal_planner.recap;
          for (const id of r.outOfSeason) {
            const label = foodLabel(id, { nameOf: (x) => LOCALES[lang].foods[x], lang });
            expect(sust, `${lang}: season named for ${id}`).toContain(R.item_out_of_season.replace('{{item}}', label).replace('{{season}}', LOCALES[lang].season[season]));
          }
          if (r.leftBought.length) expect(waste).toContain(R.waste_bought_same);
        }
      }
      expect(c).toEqual(EXPECT[season]);
    }
  }, 60_000);

  it('R5: a 3★ plan with nothing to improve gets no advice', async () => {
    const r = mealPlanRecap(planFrom({ home: ['tomato', 'cucumber', 'strawberry', 'banana', 'bread'], market: ['rice', 'rice', 'lentils', 'lentils', 'lentils', 'bell_pepper', 'bell_pepper', 'cherry', 'cherry'] }), SC.summer);
    expect(r.wasteTip).toBeNull();
    expect(r.sustTip).toBeNull();
    expect(r.reduced).toEqual([]);
    const v = (await texter('el'))(r, 'summer');
    expect(v.paragraphs.map((p) => p.text)).toEqual([
      'Χρησιμοποίησες όλα τα «Πρώτα!»: φράουλα 🍓, μπανάνα 🍌, ψωμί 🍞.',
      'Όλα τα τρόφιμα στα πιάτα σου ήταν φυτικά και της εποχής.',
      'Γέμισαν και οι 14 θέσεις.',
    ]);
    expect(atRiskInventory(SC.summer.homeInventory)).toHaveLength(3);
  });
});

describe('recap text (mealPlanRecapText)', () => {
  it('the leek is named without the onion emoji, like tofu', () => {
    const nameOf = (x) => el.foods[x];
    expect(foodLabel('leek', { nameOf, lang: 'el' })).toBe(el.foods.leek.toLocaleLowerCase('el'));
    expect(foodLabel('banana', { nameOf, lang: 'el' })).toBe('μπανάνα 🍌');
  });
  it('In Greek, the three paragraphs of the approved card, neutral labels', async () => {
    const v = (await texter('el'))(mealPlanRecap(platesFrom(P3), SC.summer), 'summer');
    expect(v.pctLabel).toBe('Σκορ: 74%');
    expect(v.paragraphs).toEqual([
      { key: 'waste', icon: '🗑️', text: 'Χρησιμοποίησες από τα «Πρώτα!»: φράουλα 🍓, ψωμί 🍞. Έμεινε στο ψυγείο και χάλασε: μπανάνα 🍌. Αγόρασες το ίδιο τρόφιμο από την αγορά. Την επόμενη φορά, από το ψυγείο: μπανάνα 🍌.' },
      { key: 'sustainability', icon: '🌱', text: 'Τα περισσότερα τρόφιμα στα πιάτα σου ήταν φυτικά και της εποχής. Λιγότεροι πόντοι: αυγό 🥚, κοτόπουλο 🍗. Την επόμενη φορά δοκίμασε: φακές 🫘 (αντί για: κοτόπουλο 🍗).' },
      { key: 'nutrition', icon: '🍽️', text: 'Γέμισαν και οι 14 θέσεις.' },
    ]);
  });

  it('P3 in English, Dutch and Portuguese', async () => {
    const r = mealPlanRecap(platesFrom(P3), SC.summer);
    expect((await texter('en'))(r, 'summer').paragraphs[0].text).toBe('You used these “Use first!” foods: strawberry 🍓, bread 🍞. Left in the fridge and spoiled: banana 🍌. You bought the same food at the market. Next time, from the fridge: banana 🍌.');
    expect((await texter('nl'))(r, 'summer').pctLabel).toBe('Score: 74%');
    expect((await texter('pt'))(r, 'summer').paragraphs[1].text).toContain('Da próxima vez, experimenta: lentilhas 🫘 (em vez de: frango 🍗).');
  });

  it('whole points, floored, with the same tolerance as the stars', () => {
    expect(formatPlanPct(0.7482142857142857, 'el')).toBe('74');
    expect(formatPlanPct(0.7124999999999999, 'el')).toBe('71');
    expect(formatPlanPct(0.5499999999999999, 'pt')).toBe('55'); // one ulp under 55 still earns the star
    expect(formatPlanPct(0.849, 'en')).toBe('84');               // two stars never reads 85
    expect(formatPlanPct(1, 'nl')).toBe('100');
  });

  it('W2: a «Use first!» food that spoiled without being bought → from the fridge instead of the lowest bought place', async () => {
    // summer: banana not placed, not bought
    const r = mealPlanRecap(planFrom({ home: ['tomato', 'cucumber', 'strawberry', 'bread', 'egg'], market: ['rice', 'rice', 'chicken', 'lentils', 'bell_pepper', 'bell_pepper', 'cherry', 'cherry', 'cherry'] }), SC.summer);
    expect(r.wasteTip).toMatchObject({ kind: 'swap', item: 'banana', target: 'cherry' });
    expect((await texter('el'))(r, 'summer').paragraphs[0].text).toContain('Έμεινε στο ψυγείο και χάλασε: μπανάνα 🍌. Την επόμενη φορά, από το ψυγείο: μπανάνα 🍌 (αντί για: κεράσι 🍒).');
  });
});

// Check the score breakdown and the practical introduction.
async function howTexter(lang) {
  const i = i18next.createInstance();
  await i.init({ lng: lang, fallbackLng: false, resources: { [lang]: { translation: LOCALES[lang] } }, interpolation: { escapeValue: false } });
  const t = i.t.bind(i);
  return (recap, season) => buildMealPlanHowText(recap, {
    tr: (key, vars) => t(`meal_planner.how.${key}`, vars), nameOf: (id) => t(`foods.${id}`, id), lang,
    seasonName: t(`season.${season}`), useFirst: t('meal_planner.use_first'),
    axisNames: { sustainability: t('meal_planner.axis_sustainability'), waste: t('meal_planner.axis_waste'), nutrition: t('meal_planner.axis_nutrition') },
    weights: AXIS_WEIGHTS,
  });
}

describe('«How was the score made?»', () => {
  it('the reasons rebuild every food\'s real Sustainability points, in every season', () => {
    for (const f of FOOD_ITEMS) for (const season of ['summer', 'autumn', 'winter', 'all']) {
      const r = sustainabilityReasons(f.id, season);
      const v = r.includes('processed') ? 0 : (r.includes('not_plant') ? 0 : 0.5)
        + (r.includes('co2_high') ? 0 : (r.includes('co2_mid') ? 0.15 : 0.3)) + (r.includes('out_of_season') ? 0 : 0.2);
      expect(v, `${f.id} ${season}`).toBeCloseTo(scoreSustainability([f.id], season), 12);
    }
  });

  it('In Greek, whole points per axis that add up to the total', async () => {
    const v = (await howTexter('el'))(mealPlanRecap(platesFrom(P3), SC.summer), 'summer');
    expect(v.title).toBe('Πώς βγήκε το σκορ;');
    expect(v.sections).toEqual([
      { key: 'sustainability', heading: 'Φιλικό για τον πλανήτη: 44 από 50 πόντους', body: 'Πλήρεις πόντοι: 12 από 14 τρόφιμα. Λιγότεροι πόντοι στο παιχνίδι: αυγό 🥚 (όχι φυτικής προέλευσης, κάπως μεγάλο αποτύπωμα στον πλανήτη), κοτόπουλο 🍗 (όχι φυτικής προέλευσης, μεγάλο αποτύπωμα στον πλανήτη).' },
      { key: 'waste', heading: 'Τίποτα στα σκουπίδια: 10 από 30 πόντους', body: '«Πρώτα!» στα πιάτα: 2 από 3 (φράουλα 🍓, ψωμί 🍞). Έμεινε στο ψυγείο («Πρώτα!»): μπανάνα 🍌. Αγορά τροφίμου που υπήρχε ήδη στο ψυγείο και δεν μπήκε σε πιάτο: μπανάνα 🍌 (−1). Λογαριασμός: 2 − 1 = 1 από 3, άρα 10 από 30 πόντους.' },
      { key: 'nutrition', heading: 'Γεμάτα πιάτα: 20 από 20 πόντους', body: 'Γέμισαν και οι 14 θέσεις.' },
    ]);
    expect(v.total).toBe('Σύνολο: 44 + 10 + 20 = 74 από 100');
  });

  it('splits whole points that always add up, floored so 85 means three stars', () => {
    const W = { sustainability: 0.5, waste: 0.3, nutrition: 0.2 };
    for (const axes of [{ sustainability: 0.896, waste: 1 / 3, nutrition: 1 }, { sustainability: 1, waste: 1, nutrition: 1 },
      { sustainability: 0, waste: 0, nutrition: 0 }, { sustainability: 0.7, waste: 0.95, nutrition: 1 }, { sustainability: 0.3333, waste: 0.6667, nutrition: 0.5 }]) {
      const { total, points, max } = splitPlanPoints(axes, W);
      expect(points.sustainability + points.waste + points.nutrition, JSON.stringify(axes)).toBe(total);
      expect(max).toEqual({ sustainability: 50, waste: 30, nutrition: 20 });
      for (const k of Object.keys(points)) expect(points[k]).toBeLessThanOrEqual(max[k]);
    }
    // 84.9 is two stars, so it must read 84, never 85.
    expect(splitPlanPoints({ sustainability: 0.849, waste: 0.849, nutrition: 0.849 }, W).total).toBe(84);
  });

  it('winter, the strawberry out of season, and a plan with no redundant buy (plain count)', async () => {
    const tx = await howTexter('en');
    const w = tx(mealPlanRecap(platesFrom(WINTER_LAST_STRAWBERRY), SC.winter), 'winter');
    expect(w.sections[0].body).toContain('strawberry 🍓 (out of season: Winter)');
    expect(w.sections[1].body).toContain('Count: 1 − 1 = 0 of 2, so 0 of 30 points.');
    const r = mealPlanRecap(planFrom({ home: ['tomato', 'cucumber', 'strawberry', 'banana', 'bread'], market: ['rice', 'rice', 'lentils', 'lentils', 'lentils', 'bell_pepper', 'bell_pepper', 'cherry', 'cherry'] }), SC.summer);
    const v = tx(r, 'summer');
    expect(v.sections[1].body).toBe('“Use first!” on the plates: 3 of 3 (strawberry 🍓, banana 🍌, bread 🍞). Count: 3 of 3, so 30 of 30 points.');
    expect(v.sections[0].body).toBe('Full points: 14 of 14 foods.');
    expect(v.total).toBe('Total: 50 + 30 + 20 = 100 of 100');
  });

  it('the floor at 0 reads as such (synthetic: more redundant buys than used «Use first!»)', async () => {
    const r = mealPlanRecap(platesFrom(P3), SC.summer);
    const synthetic = { ...r, how: { ...r.how, axes: { ...r.how.axes, waste: 0 }, waste: { used: 0, total: 3, redundant: 1, net: 0, raw: -1 } }, used: [] };
    const v = (await howTexter('el'))(synthetic, 'summer');
    expect(v.sections[1].body).toContain('«Πρώτα!» στα πιάτα: 0 από 3.');
    expect(v.sections[1].body).toContain('Λογαριασμός: 0 − 1, με κάτω όριο 0, από 3, άρα 0 από 30 πόντους.');
  });

  // the full set of legal plans × 4 languages is laid out with real fonts in meal-planner-recap-fit.spec.js
  it('P3 and the winter plan × 4 languages: no placeholder left, total names the plan score out of 100', async () => {
    for (const lang of ['el', 'en', 'nl', 'pt']) {
      const tx = await howTexter(lang);
      for (const [rows, season] of [[P3, 'summer'], [WINTER_LAST_STRAWBERRY, 'winter']]) {
        const r = mealPlanRecap(platesFrom(rows), SC[season]);
        const v = tx(r, season);
        for (const part of [v.title, v.total, ...v.sections.flatMap((x) => [x.heading, x.body])]) expect(part, `${lang} ${season}`).not.toMatch(/\{\{|undefined|null|NaN/);
        expect(v.total, `${lang} ${season}`).toContain(`= ${formatPlanPct(r.pct, lang)} `);
      }
    }
  });
});

describe('practical intro and menu season', () => {
  for (const [lang, loc] of Object.entries(LOCALES)) {
    it(`${lang}: 4 short steps — fridge first with «Use first!», buy limit, what scores, what loses, stars`, () => {
      const mi = loc.missionIntro.mealplanner; const mp = loc.meal_planner;
      expect([1, 2, 3, 4].every((n) => typeof mi[`step${n}`] === 'string' && mi[`step${n}`].length > 0)).toBe(true);
      expect(mi.step2).toContain(mp.use_first);
      expect(mi.step2).toContain('9');
      expect(mi.step3).toContain('🍃');
      expect(mi.step4).toContain(mp.use_first);
      for (const n of ['55', '70', '85']) expect(mi.step4).toContain(n);
      for (const step of [mi.step1, mi.step2, mi.step3, mi.step4]) expect(step.split(/\s+/).length, step).toBeLessThanOrEqual(32);
      for (const step of [mi.step1, mi.step2, mi.step3, mi.step4]) expect(step).not.toMatch(/50\s?%|30\s?%|20\s?%/);
      expect(mp.menu_season).toMatch(/\{\{title\}\}.*\{\{emoji\}\}.*\{\{season\}\}/);
      expect(mp.results.tier_pass_body).not.toMatch(/Δοκίμασε ξανά|Try again|Probeer opnieuw|Tenta outra vez/);
    });
  }
});
