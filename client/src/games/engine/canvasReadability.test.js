import { describe, expect, it } from 'vitest';
import { getFittingTouchControlGeometry } from '../../utils/touchControlGeometry.js';
import { getTouchControlCapabilities } from '../../utils/touchControls.js';
import { renderFeedbackToast } from './gardenPlannerRenderer.js';
import { renderResultsCard, renderChefCoach, renderWasteFactCard, CHEF_NAME_COLOR, CHEF_COACH_LANE } from './mealPlannerRenderer.js';
import { renderSafetyFactCard } from './leftoverChefRenderer.js';
import { renderDiagnosisCard } from './soilDoctorRenderer.js';
import { renderFeedbackCard } from './fridgeManagerRenderer.js';
import { SCENARIOS, PLATES, AXIS_WEIGHTS, WASTE_FACTS } from '../../data/foodwaste.js';
import { FOOD_SAFETY_FACTS } from '../../data/leftoverChef.js';
import { mealPlanRecap } from '../foodwaste/mealPlanRecap.js';
import { buildMealPlanRecapText, buildMealPlanHowText } from '../foodwaste/mealPlanRecapText.js';
import el from '../../i18n/locales/el.json';
import en from '../../i18n/locales/en.json';
import nl from '../../i18n/locales/nl.json';
import pt from '../../i18n/locales/pt.json';

const locales = { el, en, nl, pt };
const rows = [
  ['bread', 'home'], ['egg', 'home'], ['strawberry', 'home'], ['cherry', 'market'],
  ['rice', 'market'], ['lentils', 'market'], ['tomato', 'market'], ['cucumber', 'home'], ['banana', 'market'],
  ['rice', 'market'], ['chicken', 'market'], ['bell_pepper', 'market'], ['tomato', 'home'], ['cherry', 'market'],
];
const plates = PLATES.map((p) => ({ meal: p.meal, slots: p.sockets.map((type) => ({ type })) }));
plates.flatMap((p) => p.slots).forEach((slot, i) => Object.assign(slot, { item: rows[i][0], source: rows[i][1] }));
const recap = mealPlanRecap(plates, SCENARIOS.find((s) => s.season === 'summer'));

function translate(locale, key, vars = {}) {
  const value = key.split('.').reduce((object, part) => object?.[part], locale);
  return (typeof value === 'string' ? value : key).replace(/{{(\w+)}}/g, (_, name) => vars[name] ?? '');
}

// Records draw calls and their current transform. Text metrics are a deterministic
// font-size-sensitive unit stub; the delivery's native-Inter probe covers real glyph widths.
function recordingCanvas(scale, dpr) {
  let transform = { a: scale * dpr, d: scale * dpr, e: 0, f: 0 };
  let path = [];
  const stack = [];
  const ctx = {
    canvas: { width: 1280 * scale * dpr, height: 704 * scale * dpr,
      __hidpi: { k: scale * dpr }, getBoundingClientRect: () => ({ width: 1280 * scale, height: 704 * scale }) },
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'top', fillStyle: '', texts: [], shapes: [],
    save() { stack.push({ transform: { ...transform }, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, fillStyle: this.fillStyle }); },
    restore() { const saved = stack.pop(); if (saved) { transform = saved.transform; Object.assign(this, saved); } },
    scale(x, y) { transform.a *= x; transform.d *= y; },
    translate(x, y) { transform.e += transform.a * x; transform.f += transform.d * y; },
    measureText(text) { const size = Number(this.font.match(/([\d.]+)px/)[1]); return { width: [...String(text)].length * size * 0.52 }; },
    fillText(text, x, y) {
      const size = Number(this.font.match(/([\d.]+)px/)[1]); const width = this.measureText(text).width;
      const left = x - (this.textAlign === 'center' ? width / 2 : this.textAlign === 'right' ? width : 0);
      const top = y - (this.textBaseline === 'middle' ? size / 2 : 0);
      this.texts.push({ text: String(text), font: this.font, color: this.fillStyle, cssSize: size * transform.d / dpr,
        left: (left * transform.a + transform.e) / dpr, right: ((left + width) * transform.a + transform.e) / dpr,
        top: (top * transform.d + transform.f) / dpr, bottom: ((top + size) * transform.d + transform.f) / dpr });
    },
    beginPath() { path = []; }, moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); },
    quadraticCurveTo(_x, _y, x, y) { path.push([x, y]); }, closePath() {}, stroke() {}, arc() {}, ellipse() {},
    arcTo(x1, y1) { path.push([x1, y1]); },
    fill() { const xs = path.map(([x]) => (x * transform.a + transform.e) / dpr); const ys = path.map(([, y]) => (y * transform.d + transform.f) / dpr);
      this.shapes.push({ color: this.fillStyle, left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }); },
    fillRect() {},
  };
  return ctx;
}
function inside(box, item) {
  expect(item.left).toBeGreaterThanOrEqual(box.left - 0.01);
  expect(item.right).toBeLessThanOrEqual(box.right + 0.01);
  expect(item.top).toBeGreaterThanOrEqual(box.top - 0.01);
  expect(item.bottom).toBeLessThanOrEqual(box.bottom + 0.01);
}

function clearOfTouchControls(card, scale, mission, shadow = 0) {
  // The canvas ELEMENT fills 844px; HiDPI letterboxes the logical scene inside it.
  // Its322px visibleheight starts belowtheHUD, so controls are anchored to that
  // element rather than to the585px rendered logical picture.
  const element = { left: 0, top: 48, width: 844, height: 704 * scale };
  const geometry = getFittingTouchControlGeometry({ width: element.width, height: element.height,
    profile: 'phone-landscape', mission, capabilities: getTouchControlCapabilities('game', mission) });
  expect(geometry.fits).toBe(true);
  expect(geometry.controls.dpad).toBeTruthy(); expect(geometry.controls.action).toBeTruthy(); expect(geometry.controls.drop).toBeTruthy();
  const originX = (element.width - 1280 * scale) / 2;
  const box = { left: card.left + originX - shadow * scale, right: card.right + originX + shadow * scale,
    top: card.top + element.top - shadow * scale, bottom: card.bottom + element.top + (shadow + 6) * scale };
  for (const control of Object.values(geometry.controls).filter(Boolean)) {
    const overlaps = box.left < control.left + control.width && box.right > control.left
      && box.top < element.top + control.top + control.height && box.bottom > element.top + control.top;
    expect(overlaps).toBe(false);
  }
}

for (const [lang, locale] of Object.entries(locales)) for (const dpr of [1, 2]) {
  describe(`${lang} canvas text at DPR${dpr}`, () => {
    const tr = (key, vars) => translate(locale, key, vars);
    const options = { nameOf: (id) => tr(`foods.${id}`), lang, seasonName: tr('season.summer'), useFirst: tr('meal_planner.use_first') };
    const recapView = buildMealPlanRecapText(recap, { ...options, tr: (key, vars) => tr(`meal_planner.recap.${key}`, vars) });
    const howView = buildMealPlanHowText(recap, { ...options, tr: (key, vars) => tr(`meal_planner.how.${key}`, vars),
      axisNames: Object.fromEntries(['sustainability', 'waste', 'nutrition'].map((key) => [key, tr(`meal_planner.axis_${key}`)])), weights: AXIS_WEIGHTS });
    const labels = { phaseResults: tr('meal_planner.phase_results'), resultsNextPrompt: tr('meal_planner.results_next_prompt'),
      howOpen: tr('meal_planner.how.open'), howBack: tr('meal_planner.how.back') };

    it.each([false, true])('draws the full meal result (how=%s) with readable body and clickable buttons', (howOpen) => {
      const scale = 0.457; const ctx = recordingCanvas(scale, dpr);
      const state = { phase: 'results', resultPage: 'score', results: { tier: 'pass' }, recapView, howView, howOpen, labels };
      renderResultsCard(ctx, state);
      const card = ctx.shapes.find((shape) => shape.color === '#FFF8E1');
      expect(card).toBeTruthy(); expect(card.left).toBeGreaterThan(0); expect(card.right).toBeLessThan(1280 * scale);
      expect(card.top).toBeGreaterThanOrEqual(0); expect(card.bottom).toBeLessThan(704 * scale);
      clearOfTouchControls(card, scale, 'MealPlanner');
      for (const item of ctx.texts.filter((item) => item.text.length > 8)) { inside(card, item); expect(item.cssSize).toBeGreaterThanOrEqual(10.99); }
      const expected = howOpen ? howView.sections.map((section) => section.body) : recapView.paragraphs.map((paragraph) => paragraph.text);
      for (const text of expected) expect(ctx.texts.map((item) => item.text).join(' ')).toContain(text);
      const body = ctx.texts.filter((item) => /^\d/.test(item.font) && item.text.length > 8);
      expect(body.length).toBeGreaterThan(0); for (const item of body) expect(item.cssSize).toBeGreaterThanOrEqual(12);
      const button = howOpen ? state.howBackRect : state.howButtonRect;
      expect(button.width).toBeGreaterThan(0); inside(card, { left: button.x * scale, right: (button.x + button.width) * scale, top: button.y * scale, bottom: (button.y + button.height) * scale });
    });

    it.each(Object.keys(FOOD_SAFETY_FACTS))('draws the full safety fact %s, its source chip and both shortcuts', (key) => {
      const scale = 0.457; const ctx = recordingCanvas(scale, dpr);
      const fact = tr(`leftover_chef.facts.${key}`);
      const state = { factCard: { ...FOOD_SAFETY_FACTS[key], title: tr('leftover_chef.safety_title'), fact, paraphrase: true } };
      renderSafetyFactCard(ctx, state, tr);
      const card = ctx.shapes.find((shape) => shape.color === '#2E7D32');
      expect(card).toBeTruthy(); expect(card.top).toBeGreaterThanOrEqual(0); expect(card.bottom).toBeLessThanOrEqual(704 * scale);
      clearOfTouchControls(card, scale, 'LeftoverChef', 36);
      for (const item of ctx.texts.filter((item) => item.text.length > 8)) { inside(card, item); expect(item.cssSize).toBeGreaterThanOrEqual(10.99); }
      expect(ctx.texts.map((item) => item.text).join(' ')).toContain(fact);
      expect(ctx.texts.map((item) => item.text).join(' ')).toContain(tr('leftover_chef.press_s'));
      expect(ctx.texts.map((item) => item.text).join(' ')).toContain(tr('leftover_chef.fact_continue_prompt'));
      const source = ctx.shapes.find((shape) => shape.color === '#FFE8A3');
      inside(card, source); expect(state.sourceBadgeRect.x * scale).toBeCloseTo(source.left, 6);
      expect((state.sourceBadgeRect.x + state.sourceBadgeRect.width) * scale).toBeCloseTo(source.right, 6);
    });

    it('keeps a sourced compost message readable inside its side strip', () => {
      const scale = 390 / 704; const ctx = recordingCanvas(scale, dpr);
      const state = { cssScale: scale, cssOriginX: (844 - 1280 * scale) / 2, cssViewW: 844, hudTopInset: 87,
        ctrlTopLeft: 242 / scale, ctrlTopRight: 284 / scale, feedbackText: `🪣 ${locale.garden.composted} +5`,
        feedbackEduText: locale.garden.facts?.compost || 'Composting returns nutrients to the soil.', feedbackSourceId: 'compost', feedbackTimer: 3 };
      renderFeedbackToast(ctx, state, tr);
      const card = ctx.shapes.find((shape) => shape.color === 'rgba(255,255,255,0.97)');
      expect(card).toBeTruthy(); expect(card.bottom + 3 * scale).toBeLessThanOrEqual((284 - 8));
      for (const item of ctx.texts) { inside(card, item); expect(item.cssSize).toBeGreaterThanOrEqual(10.99); }
      expect(ctx.texts.filter((item) => /^\d/.test(item.font)).every((item) => item.cssSize >= 12)).toBe(true);
      expect(ctx.texts.map((item) => item.text).join(' ')).toContain(state.feedbackEduText);
      expect(ctx.texts.map((item) => item.text).join(' ')).toContain(`${locale.result.source_link} · ${locale.garden.press_s}`);
    });
  });
}


it('preserves the distinct desktop recap and How title sizes', () => {
  for (const locale of Object.values(locales)) for (const dpr of [1, 2]) {
    const tr = (key) => translate(locale, key);
    const labels = { phaseResults: tr('meal_planner.phase_results'), resultsNextPrompt: tr('meal_planner.results_next_prompt') };
    for (const howOpen of [false, true]) {
      const ctx = recordingCanvas(1, dpr);
      const title = tr('meal_planner.how.title');
      renderResultsCard(ctx, { phase: 'results', resultPage: 'score', results: { tier: 'pass' }, labels,
        recapView: { paragraphs: [] }, howView: { title, sections: [], total: '' }, howOpen });
      const expected = howOpen ? title : `🍽️ ${labels.phaseResults}`;
      const call = ctx.texts.find(item => item.text === expected);
      expect(call, 'actual drawn desktop title').toBeTruthy();
      expect(call.cssSize).toBe(howOpen ? 20 : 22);
    }
  }
});

// Each translated chef line must fit the coach card at the supported font sizes.
it('draws every Meal Planner chef line in full, at 12 px or more, with a dark name label', () => {
  for (const [lang, locale] of Object.entries(locales)) {
    const mp = locale.meal_planner;
    const tr = (key, vars) => translate(locale, key, vars);
    const longest = (ids) => ids.map((id) => tr(`foods.${id}`)).sort((x, y) => y.length - x.length)[0];
    const homeFood = longest(SCENARIOS.flatMap((s) => s.homeInventory));           // «already» is about a home food
    const marketFood = longest(SCENARIOS.flatMap((s) => Object.values(s.market).flat()));
    const longestSeason = ['summer', 'autumn', 'winter', 'spring'].map((s) => tr(`season.${s}`)).sort((a, b) => b.length - a.length)[0];
    const longestMeal = ['breakfast', 'lunch', 'dinner'].map((m) => tr(`meal_planner.meal_${m}`)).sort((a, b) => b.length - a.length)[0];
    const allSlots = ['carb', 'protein', 'veg', 'fruit'].map((s) => tr(`meal_planner.slot_${s}`)).join(', ');
    const lines = [
      mp.chef_welcome, mp.chef_grabbed, mp.chef_good, mp.nudge_junk, mp.nudge_wrong_socket, mp.nudge_plant,
      mp.coach_atrisk, mp.chef_meal_done, mp.chef_put_back, mp.plates_done, mp.market_cap_full, mp.market_cap_near,
      tr('meal_planner.already_have', { food: homeFood.toLocaleLowerCase(lang), emoji: '🍌' }),
      tr('meal_planner.coach_season', { season: longestSeason, food: marketFood.toLocaleLowerCase(lang), emoji: '🍓' }),
      tr('meal_planner.cook_missing', { meal: longestMeal, slot: allSlots }),
    ];
    for (const msg of lines) {
      const ctx = recordingCanvas(1, 1);
      renderChefCoach(ctx, { phase: 'play', chef: { msg }, labels: { chefName: mp.chef_name } });
      const card = ctx.shapes.find((shape) => shape.color === 'rgba(255,248,225,0.95)');
      const name = ctx.texts.find((item) => item.text === mp.chef_name);
      const body = ctx.texts.filter((item) => item !== name && item.text !== '👨‍🍳');
      expect(name.color).toBe(CHEF_NAME_COLOR); expect(name.cssSize).toBe(12);
      expect(body.length, `${lang}: ${msg}`).toBeLessThanOrEqual(2);
      expect(body.map((item) => item.text).join(' '), `${lang} line cut`).toBe(msg);
      for (const item of body) { inside(card, item); expect(item.cssSize).toBeGreaterThanOrEqual(12); }
    }
  }
});

it('grows the Meal Planner chef card on phone landscape so its text reads at 12 CSS px', () => {
  const scale = 0.48; // 844×390
  const msg = locales.el.meal_planner.chef_welcome;
  const ctx = recordingCanvas(scale, 2);
  renderChefCoach(ctx, { phase: 'play', chef: { msg }, labels: { chefName: locales.el.meal_planner.chef_name } });
  const card = ctx.shapes.find((shape) => shape.color === 'rgba(255,248,225,0.95)');
  const body = ctx.texts.filter((item) => item.text !== locales.el.meal_planner.chef_name && item.text !== '👨‍🍳');
  for (const item of body) { inside(card, item); expect(item.cssSize).toBeGreaterThanOrEqual(12); }
  expect(card.left).toBeGreaterThanOrEqual(0);
  expect(card.right).toBeLessThanOrEqual(1280 * scale);
});

// T06-F3: on a phone the grown chef card stays in the lane between fridge and market, above the
// plate, so it never covers a shelf or a food; the whole line and the name read at ≥ 12 CSS px.
it('keeps the phone chef card in the free lane, whole, with every word at 12 CSS px or more', () => {
  const scale = 0.469; // 844×390: the scene is letterboxed to the 330 px under the HUD
  for (const [lang, locale] of Object.entries(locales)) for (const dpr of [1, 2]) {
    const mp = locale.meal_planner;
    const tr = (key, vars) => translate(locale, key, vars);
    const longest = (ids) => ids.map((id) => tr(`foods.${id}`)).sort((x, y) => y.length - x.length)[0];
    const longestSeason = ['summer', 'autumn', 'winter', 'spring'].map((s) => tr(`season.${s}`)).sort((a, b) => b.length - a.length)[0];
    const lines = [mp.nudge_plant, mp.coach_atrisk, mp.market_cap_full,
      tr('meal_planner.already_have', { food: longest(SCENARIOS.flatMap((s) => s.homeInventory)).toLocaleLowerCase(lang), emoji: '🍌' }),
      tr('meal_planner.coach_season', { season: longestSeason, food: longest(SCENARIOS.flatMap((s) => Object.values(s.market).flat())).toLocaleLowerCase(lang), emoji: '🍓' }),
      tr('meal_planner.cook_missing', { meal: tr('meal_planner.meal_breakfast'), slot: ['carb', 'protein', 'fruit'].map((s) => tr(`meal_planner.slot_${s}`)).join(', ') })];
    for (const msg of lines) {
      const ctx = recordingCanvas(scale, dpr);
      renderChefCoach(ctx, { phase: 'play', chef: { msg }, labels: { chefName: mp.chef_name } });
      const card = ctx.shapes.find((shape) => shape.color === 'rgba(255,248,225,0.95)');
      expect(card.left, `${lang} lane left`).toBeGreaterThanOrEqual(CHEF_COACH_LANE.x * scale - 0.01);
      expect(card.right, `${lang} lane right`).toBeLessThanOrEqual((CHEF_COACH_LANE.x + CHEF_COACH_LANE.width) * scale + 0.01);
      expect(card.bottom, `${lang} above the plate: ${msg}`).toBeLessThanOrEqual(CHEF_COACH_LANE.bottom * scale + 0.01);
      const name = ctx.texts.find((item) => item.text === mp.chef_name);
      const body = ctx.texts.filter((item) => item !== name && item.text !== '👨‍🍳');
      expect(name.cssSize).toBeGreaterThanOrEqual(12);
      expect(body.map((item) => item.text).join(' '), `${lang} line cut`).toBe(msg);
      for (const item of [name, ...body]) { inside(card, item); expect(item.cssSize).toBeGreaterThanOrEqual(12); }
    }
  }
});

// T04-F1: the «Did you know?» card reflows on a phone instead of shrinking to 5–7 CSS px; the chip
// grows with it and its click target is the box that is drawn.
it.each([1, 2])('draws the whole Meal Planner fact card at 12 CSS px or more on phone landscape (DPR%i)', (dpr) => {
  const scale = 0.469;
  for (const [lang, locale] of Object.entries(locales)) {
    const tr = (key, vars) => translate(locale, key, vars);
    const fact = WASTE_FACTS.find((f) => f.id === 'unep_trillion');
    const state = { phase: 'results', resultPage: 'fact', wasteFact: [{ ...fact, plain: locale.meal_planner.facts?.[fact.id] ?? fact.plain, paraphrase: true }], // the game's own fallback
      labels: { factTitle: tr('meal_planner.fact_title'), pressS: tr('meal_planner.press_s'), factContinuePrompt: tr('meal_planner.fact_continue_prompt') } };
    const ctx = recordingCanvas(scale, dpr);
    renderWasteFactCard(ctx, state);
    const card = ctx.shapes.find((shape) => shape.color === '#2E7D32');
    expect(card.left).toBeGreaterThan(0); expect(card.right).toBeLessThan(1280 * scale);
    expect(card.top).toBeGreaterThanOrEqual(0); expect(card.bottom).toBeLessThan(704 * scale);
    clearOfTouchControls(card, scale, 'MealPlanner');
    const all = ctx.texts.map((item) => item.text).join(' ');
    for (const part of [state.labels.factTitle, state.labels.pressS, state.labels.factContinuePrompt]) expect(all, lang).toContain(part.split(' ')[0]);
    for (const item of ctx.texts) { inside(card, item); expect(item.cssSize, `${lang} «${item.text}»`).toBeGreaterThanOrEqual(12); }
    const chip = ctx.shapes.find((shape) => shape.color === '#FFE8A3');
    const r = state.sourceBadgeRect;
    expect([r.x * scale, (r.x + r.width) * scale, r.y * scale, (r.y + r.height) * scale].map((v) => +v.toFixed(2)))
      .toEqual([chip.left, chip.right, chip.top, chip.bottom].map((v) => +v.toFixed(2)));
  }
});

it('keeps the desktop Meal Planner fact card in place, with only the source chip grown to 12 CSS px', () => {
  const ctx = recordingCanvas(1, 1);
  const state = { phase: 'results', resultPage: 'fact', wasteFact: [{ ...WASTE_FACTS[1], paraphrase: true }],
    labels: { factTitle: en.meal_planner.fact_title, pressS: en.meal_planner.press_s, factContinuePrompt: en.meal_planner.fact_continue_prompt } };
  renderWasteFactCard(ctx, state);
  const card = ctx.shapes.find((shape) => shape.color === '#2E7D32');
  expect([card.left, card.right, card.top]).toEqual([340, 940, 24]);
  expect(ctx.texts.find((item) => item.text === en.meal_planner.press_s).cssSize).toBe(12);
  expect(ctx.texts.find((item) => item.text.startsWith('📖')).cssSize).toBeCloseTo(12, 6);
  expect(state.sourceBadgeRect.height).toBeCloseTo(240 / 11, 6);
});

it('grows the Soil Doctor diagnosis card on phone landscape so every line reads at 12 CSS px', () => {
  const scale = 0.48;
  const ctx = recordingCanvas(scale, 2);
  ctx.lineWidth = 1;
  ctx.measureText = ctx.measureText.bind(ctx);
  renderDiagnosisCard(ctx, { diagnosisCard: { symptom: el.soil?.symptom_dry || 'Το χώμα είναι σκληρό και ξερό.', need: 'Χρειάζεται σκέπασμα' },
    diagnosisTitle: 'Διάγνωση', revealDismiss: 'Το ’πιασα' });
  const card = ctx.shapes.find((shape) => shape.color === 'rgba(255,248,225,0.98)');
  for (const item of ctx.texts) { inside(card, item); expect(item.cssSize, item.text).toBeGreaterThanOrEqual(12 - 1e-9); }
  expect(card.left).toBeGreaterThanOrEqual(0);
  expect(card.right).toBeLessThanOrEqual(1280 * scale);
});

it('grows the Fridge Manager feedback card on phone landscape and keeps the source chip clickable', () => {
  const scale = 0.48;
  const ctx = recordingCanvas(scale, 2);
  const state = { feedback: { timer: 2, tier: 'suboptimal', text: el.fridge.affirm, fact: 'Bread keeps best on a dry shelf.', paraphrase: true, sourceId: 'eufic-storage' } };
  renderFeedbackCard(ctx, state, (key, fallback) => fallback || key);
  const card = ctx.shapes.find((shape) => shape.color === '#B8860B');
  for (const item of ctx.texts) {
    inside(card, item);
    // The shared source chip is 11 px everywhere; the card is capped by the canvas height first.
    expect(item.cssSize, item.text).toBeGreaterThanOrEqual(item.text.startsWith('📖') ? 11 : 12 - 1e-9);
  }
  const r = state.sourceBadgeRect;
  expect(r.x * scale).toBeGreaterThanOrEqual(card.left - 0.01);
  expect((r.x + r.width) * scale).toBeLessThanOrEqual(card.right + 0.01);
});
