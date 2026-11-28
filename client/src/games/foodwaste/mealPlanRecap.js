// Meal Planner recap — pure DATA from the final plates and the scenario only (no text, no history,
// no `fridge.used`, no chef flags). It gives one waste advice from
// the home food left in the fridge, one sustainability advice that changes a BOUGHT place only,
// the foods out of season in this scenario, and the foods with fewer points. Because it
// reads the final plates, it also covers advice the chef could not show on the 14th placement:
// the foods out of season, the redundant buy and the plant alternative (in all
// legal plans of today's scenarios the best sustainability change for a plate with chicken or a
// processed protein is lentils instead of it, locked by the exhaustive test).
// Every suggested change is legal and improves the real scorePlan.
import {
  FOOD_BY_ID, atRiskInventory, scorePlan, scoreSustainability, slotTypeOf,
} from '../../data/foodwaste.js';
import { MARKET_CAP } from './mealPlannerCarry.js';

const filledSlots = (plates) => plates.flatMap((plate, p) => plate.slots
  .map((slot, s) => ({ ...slot, plateIdx: p, socketIdx: s }))
  .filter((slot) => slot.item));
const uniq = (ids) => [...new Set(ids)];
const clonePlates = (plates) => plates.map((plate) => ({ ...plate, slots: plate.slots.map((slot) => ({ ...slot })) }));

// Same per-food value the Sustainability axis averages (full points = 1).
export function foodPoints(id, season) {
  return scoreSustainability([id], season);
}
// Out of season IN THIS SCENARIO, by the scorer's own rule (season 'all' counts as in season).
export function outOfSeason(id, season) {
  const f = FOOD_BY_ID[id];
  return !!f && !!season && f.season !== 'all' && f.season !== season;
}
// Chicken and the processed proteins are the choices the plant advice is about.
export function isPlantSwapCandidate(id) {
  return id === 'chicken' || !!FOOD_BY_ID[id]?.processed;
}

function legalPlan(plates, scenario) {
  const filled = filledSlots(plates);
  const bought = filled.filter((s) => s.source === 'market');
  if (bought.length > MARKET_CAP) return false;
  const home = filled.filter((s) => s.source === 'home').map((s) => s.item);
  if (new Set(home).size !== home.length) return false;
  if (!home.every((id) => scenario.homeInventory.includes(id))) return false;
  const market = new Set(Object.values(scenario.market).flat());
  if (!bought.every((s) => market.has(s.item))) return false;
  return filled.every((s) => slotTypeOf(s.item) === s.type);
}
// A change must not create a NEW redundant buy (a bought food whose home copy stays unused).
function redundantSet(plates, scenario) {
  const filled = filledSlots(plates);
  const used = new Set(filled.filter((s) => s.source === 'home').map((s) => s.item));
  const bought = new Set(filled.filter((s) => s.source === 'market').map((s) => s.item));
  return new Set(scenario.homeInventory.filter((id) => bought.has(id) && !used.has(id)));
}
function applyChange(plates, change) {
  const next = clonePlates(plates);
  const slot = next[change.plateIdx].slots[change.socketIdx];
  slot.item = change.to; slot.source = change.toSource;
  return next;
}

// Why a food scores fewer Sustainability points — the scorer's own terms (foodwaste.js
// scoreSustainability: plant 0.5 + carbon band 0.3 + season 0.2, or the flat processed penalty).
// The scorer is not touched; a test locks that these reasons rebuild every food's real points.
const PLANT_CATEGORIES = new Set(['vegetable', 'fruit', 'legume', 'grain']);
export function sustainabilityReasons(id, season) {
  const f = FOOD_BY_ID[id];
  if (!f) return [];
  if (f.processed) return ['processed'];
  const reasons = [];
  if (!PLANT_CATEGORIES.has(f.category)) reasons.push('not_plant');
  if (f.co2 > 4) reasons.push('co2_high');
  else if (f.co2 > 1.5) reasons.push('co2_mid');
  if (outOfSeason(id, season)) reasons.push('out_of_season');
  return reasons;
}

export function mealPlanRecap(plates, scenario) {
  const season = scenario.season;
  const options = { season, scenario };
  const filled = filledSlots(plates);
  const atRisk = atRiskInventory(scenario.homeInventory);
  const homeUsed = uniq(filled.filter((s) => s.source === 'home').map((s) => s.item));
  const boughtIds = uniq(filled.filter((s) => s.source === 'market').map((s) => s.item));
  const used = atRisk.filter((id) => homeUsed.includes(id));
  const left = scenario.homeInventory.filter((id) => !homeUsed.includes(id));
  const leftBought = left.filter((id) => boughtIds.includes(id));
  const spoiled = atRisk.filter((id) => !homeUsed.includes(id));
  const base = scorePlan(plates, options);

  // 🗑️ waste advice — from the home food that stayed in the fridge (in a complete legal plan
  // there is at most one). W1: it was bought → take it from the fridge instead. W2: a «Use first!»
  // food spoiled without being bought → put it in the bought place of the same type that scored
  // lowest (first on the plates on a tie).
  let wasteTip = null;
  const u = leftBought[0] ?? spoiled[0] ?? null;
  if (u && leftBought.includes(u)) {
    const slot = filled.find((s) => s.source === 'market' && s.item === u);
    wasteTip = { kind: 'fridge', item: u, plateIdx: slot.plateIdx, socketIdx: slot.socketIdx, to: u, toSource: 'home' };
  } else if (u) {
    const same = filled.filter((s) => s.source === 'market' && s.type === slotTypeOf(u));
    let target = null;
    for (const s of same) if (!target || foodPoints(s.item, season) < foodPoints(target.item, season)) target = s;
    if (target) wasteTip = { kind: 'swap', item: u, target: target.item, plateIdx: target.plateIdx, socketIdx: target.socketIdx, to: u, toSource: 'home' };
  }
  if (wasteTip) {
    const after = applyChange(plates, wasteTip);
    // keep only an advice that is legal and really helps
    if (!legalPlan(after, scenario) || scorePlan(after, options).pct <= base.pct) wasteTip = null;
  }

  // 🌱 sustainability advice: only BOUGHT places change. Candidates: what the market sells
  // for that place type, plus the home food left in the fridge. Excluded: the place, the home food
  // and the food the waste advice already uses (two advices about one food read as a contradiction).
  const redundantBefore = redundantSet(plates, scenario);
  const candidates = [];
  for (const s of filled) {
    if (s.source !== 'market') continue;
    if (wasteTip && (s.item === wasteTip.target || s.item === wasteTip.item
      || (s.plateIdx === wasteTip.plateIdx && s.socketIdx === wasteTip.socketIdx))) continue;
    const pool = [
      ...uniq(Object.values(scenario.market).flat()).filter((id) => slotTypeOf(id) === s.type).map((id) => ({ id, source: 'market' })),
      ...left.filter((id) => slotTypeOf(id) === s.type && (!wasteTip || id !== wasteTip.item)).map((id) => ({ id, source: 'home' })),
    ];
    for (const c of pool) {
      if (c.id === s.item && c.source === 'market') continue;
      const change = { from: s.item, to: c.id, toSource: c.source, plateIdx: s.plateIdx, socketIdx: s.socketIdx };
      const after = applyChange(plates, change);
      if (!legalPlan(after, scenario)) continue;
      const redundantAfter = redundantSet(after, scenario);
      if ([...redundantAfter].some((id) => !redundantBefore.has(id))) continue;
      const res = scorePlan(after, options);
      if (!(res.axes.sustainability > base.axes.sustainability + 1e-12) || res.pct < base.pct - 1e-12) continue;
      candidates.push({ ...change, gain: res.pct - base.pct });
    }
  }
  const order = (c) => [-c.gain, c.toSource === 'home' ? 0 : 1, scenario.homeInventory.includes(c.to) ? 1 : 0, c.plateIdx, c.socketIdx];
  candidates.sort((a, b) => {
    const oa = order(a); const ob = order(b);
    for (let i = 0; i < oa.length; i += 1) {
      if (Math.abs(oa[i] - ob[i]) > 1e-12) return oa[i] - ob[i];
    }
    return 0;
  });
  const sustTip = candidates[0] || null;

  const placed = uniq(filled.map((s) => s.item));
  // «How was the score made?»: the three axes as the scorer counts them. Waste credit is
  // (used «Use first!» − redundant buys) / «Use first!» count, floored at 0.
  const redundant = leftBought;
  const how = {
    axes: base.axes,
    reasons: Object.fromEntries(placed.map((id) => [id, sustainabilityReasons(id, season)])),
    waste: { used: used.length, total: atRisk.length, redundant: redundant.length, net: Math.max(0, used.length - redundant.length), raw: used.length - redundant.length },
  };
  const reduced = placed.filter((id) => foodPoints(id, season) < 1 - 1e-12);
  return {
    season,
    pct: base.pct,
    tier: base.tier,
    used, allUsed: used.length === atRisk.length, atRiskCount: atRisk.length,
    left, leftBought, spoiled,
    wasteTip,
    reduced,
    outOfSeason: placed.filter((id) => outOfSeason(id, season)),
    plantChoices: placed.filter((id) => isPlantSwapCandidate(id)),
    sustTip,
    how,
    fullCount: filled.filter((s) => foodPoints(s.item, season) >= 1 - 1e-12).length,
    filledCount: filled.length,
  };
}
