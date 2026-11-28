// Meal Planner recap — TEXT from the recap data (mealPlanRecap.js). Pure: the caller passes a
// translate function `tr(key, vars)` for `meal_planner.recap.*`, the food names and the language.
// Recap labels place food names after a colon so translations can use each name in its base form.
// The score («Σκορ», one name with the HUD) with one decimal, rounded with the same tolerance as the stars.
import { FOOD_BY_ID } from '../../data/foodwaste.js';
import { hasDrawnIcon } from '../engine/itemGlyphs.js';

const DISPLAY_EPSILON = 1e-9; // same idea as the stars' THRESHOLD_EPSILON: lift one-ulp artefacts only

// Whole points, floored, the same number as the breakdown total and the HUD, so «85» always
// means three stars. 0.7479 → «74». The real pct and the credited points are untouched.
export function planPoints(pct) {
  return Math.floor(pct * 100 + DISPLAY_EPSILON);
}

export function formatPlanPct(pct, lang) {
  return planPoints(pct).toLocaleString(lang || 'en');
}

// Whole points a child can add up. The total is floored so «85 of 100» always means three
// stars (thresholds 55/70/85); the parts share it by largest remainder, so they always sum to it.
export function splitPlanPoints(axes, weights) {
  const keys = ['sustainability', 'waste', 'nutrition'];
  const max = keys.reduce((sum, k) => sum + weights[k], 0) || 1;
  const exact = keys.map((k) => ((axes[k] || 0) * weights[k] * 100) / max);
  const total = Math.floor(exact.reduce((a, b) => a + b, 0) + DISPLAY_EPSILON);
  const parts = exact.map((v) => Math.floor(v + DISPLAY_EPSILON));
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - parts[i], i]).sort((x, y) => y[0] - x[0]);
  for (const [, i] of order) { if (left <= 0) break; parts[i] += 1; left -= 1; }
  const maxOf = (k) => Math.round((weights[k] * 100) / max);
  return {
    total,
    points: Object.fromEntries(keys.map((k, i) => [k, parts[i]])),
    max: Object.fromEntries(keys.map((k) => [k, maxOf(k)])),
  };
}

// «banana 🍌» — the name from foods.*, lower case in the game language, then the food's emoji
// (none for tofu, whose dataset emoji is an ice-cube placeholder, nor for drawn-icon foods like
// the leek, whose dataset emoji is an onion; see getMealPlannerFoodCue).
export function foodLabel(id, { nameOf, lang }) {
  const name = String(nameOf(id)).toLocaleLowerCase(lang || undefined);
  const emoji = id === 'tofu' || hasDrawnIcon({ id }) ? '' : FOOD_BY_ID[id]?.emoji || '';
  return emoji ? `${name} ${emoji}` : name;
}

/**
 * → { pctLabel, paragraphs: [{ icon, text }] } in the order 🗑️, 🌱, 🍽️. The «spoiled» note
 * sits inside the 🗑️ paragraph.
 */
export function buildMealPlanRecapText(recap, { tr, nameOf, lang, seasonName, useFirst }) {
  const food = (id) => foodLabel(id, { nameOf, lang });
  const list = (ids) => ids.map(food).join(', ');

  const waste = [];
  if (recap.used.length) {
    waste.push(tr(recap.allUsed ? 'waste_used_all' : 'waste_used_some', { useFirst, items: list(recap.used) }));
  }
  const u = recap.wasteTip?.item ?? recap.leftBought[0] ?? recap.spoiled[0] ?? null;
  if (u) {
    waste.push(tr(recap.spoiled.includes(u) ? 'waste_spoiled' : 'waste_left', { item: food(u) }));
    if (recap.leftBought.includes(u)) waste.push(tr('waste_bought_same'));
  }
  if (recap.wasteTip?.kind === 'fridge') waste.push(tr('tip_fridge', { item: food(recap.wasteTip.item) }));
  if (recap.wasteTip?.kind === 'swap') waste.push(tr('tip_fridge_instead', { item: food(recap.wasteTip.item), from: food(recap.wasteTip.target) }));

  const sust = [];
  const share = recap.fullCount === recap.filledCount ? 'sust_all' : (recap.fullCount * 2 > recap.filledCount ? 'sust_most' : 'sust_some');
  sust.push(tr(share));
  if (recap.reduced.length) {
    const items = recap.reduced.map((id) => (recap.outOfSeason.includes(id)
      ? tr('item_out_of_season', { item: food(id), season: seasonName }) : food(id)));
    sust.push(tr('sust_fewer', { items: items.join(', ') }));
  }
  const tip = recap.sustTip;
  if (tip) {
    sust.push(tr(tip.toSource === 'home' ? 'tip_fridge_instead' : 'tip_try_instead', {
      item: food(tip.to), to: food(tip.to), from: food(tip.from),
    }));
  }

  const nutrition = [tr(recap.filledCount === 14 ? 'nutrition_full' : 'nutrition_partial', { n: recap.filledCount })];

  return {
    pctLabel: tr('pct_label', { pct: formatPlanPct(recap.pct, lang) }),
    paragraphs: [
      { key: 'waste', icon: '🗑️', text: waste.join(' ') },
      { key: 'sustainability', icon: '🌱', text: sust.join(' ') },
      { key: 'nutrition', icon: '🍽️', text: nutrition.join(' ') },
    ],
  };
}

// ── «How was the score made?»: optional, closed by default, drawn in place of the
// main card. Weights and per-axis numbers appear ONLY here. Same neutral label templates.

/**
 * → { title, sections: [{ key, heading, body }], total } — one section per axis in weight order
 * (🌱 50 %, 🗑️ 30 %, 🍽️ 20 %), then the total with «≈» (rounded parts may not add up exactly).
 */
export function buildMealPlanHowText(recap, { tr, nameOf, lang, seasonName, useFirst, axisNames, weights }) {
  const food = (id) => foodLabel(id, { nameOf, lang });
  const { axes, reasons, waste } = recap.how;
  const split = splitPlanPoints(axes, weights);

  const fewer = recap.reduced.map((id) => tr('item_reasons', {
    item: food(id),
    reasons: reasons[id].map((r) => (r === 'out_of_season' ? tr('reason_out_of_season', { season: seasonName }) : tr(`reason_${r}`))).join(', '),
  }));
  const sust = [tr('sust_full', { full: recap.fullCount, total: recap.filledCount })];
  if (fewer.length) sust.push(tr('sust_fewer', { items: fewer.join(', ') }));

  const w = [recap.used.length
    ? tr('waste_used', { useFirst, used: waste.used, total: waste.total, items: recap.used.map(food).join(', ') })
    : tr('waste_used_none', { useFirst, total: waste.total })];
  if (recap.spoiled.length) w.push(tr('waste_spoiled', { useFirst, items: recap.spoiled.map(food).join(', ') }));
  if (waste.redundant) w.push(tr('waste_redundant', { items: recap.leftBought.map(food).join(', '), n: waste.redundant }));
  const wastePts = { points: split.points.waste, max: split.max.waste };
  if (!waste.redundant) w.push(tr('waste_calc_plain', { used: waste.used, total: waste.total, ...wastePts }));
  else if (waste.raw >= 0) w.push(tr('waste_calc', { used: waste.used, redundant: waste.redundant, net: waste.net, total: waste.total, ...wastePts }));
  else w.push(tr('waste_calc_floor', { used: waste.used, redundant: waste.redundant, total: waste.total, ...wastePts }));

  const nut = [tr(recap.filledCount === 14 ? 'nut_full' : 'nut_partial', { n: recap.filledCount })];

  const parts = [
    ['sustainability', sust], ['waste', w], ['nutrition', nut],
  ].map(([key, body]) => ({
    key,
    heading: tr('axis_heading', { axis: axisNames[key], points: split.points[key], max: split.max[key] }),
    body: body.join(' '),
  }));
  return {
    title: tr('title'),
    sections: parts,
    total: tr('total', {
      s: split.points.sustainability, w: split.points.waste, n: split.points.nutrition, total: split.total,
    }),
  };
}
