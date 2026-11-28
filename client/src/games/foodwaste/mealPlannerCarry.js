// Pure decision helpers for the Meal Planner walk-GRAB-CARRY port.
// The component orchestrates movement/interaction; this module only DECIDES (no mutation,
// no scoring). Scoring stays in foodwaste.js (frozen, 272 locks); here we just compose its
// frozen helpers so the carry fixes are lockable.
import { slotTypeOf, atRiskInventory } from '../../data/foodwaste.js';

// Where does a carried food go on the active plate? Pure — returns a decision, never mutates.
// plate = { meal, slots:[{ type, item, source }] }.
//   junk / dairy (slotType null) → { ok:false, reason:'junk' }
//   right type but no open socket / type absent → { ok:false, reason:'wrong' }
//   otherwise → { ok:true, slotIndex } (first OPEN socket of that type)
export function resolvePlacement(plate, foodId) {
  const type = slotTypeOf(foodId);
  if (!type) return { ok: false, reason: 'junk' };
  const slotIndex = plate.slots.findIndex((s) => s.type === type && !s.item);
  if (slotIndex < 0) return { ok: false, reason: 'wrong' };
  return { ok: true, slotIndex };
}

// "You already have it" = the food is STILL in the live fridge (unused), NOT
// original-membership (the demo bug). Only a MARKET buy of a still-present item is redundant.
export function isRedundantBuy(foodId, source, liveFridgeIds) {
  return source === 'market' && liveFridgeIds.includes(foodId);
}

// Dynamic at-risk coach: which at-risk home items are STILL in the live fridge,
// for the CURRENT scenario (never a hardcoded id list). Drives the chef's "Πρώτα!" nudge.
export function atRiskStillInFridge(scenario, liveFridgeIds) {
  return atRiskInventory(scenario.homeInventory).filter((id) => liveFridgeIds.includes(id));
}

// ── MARKET CAP — a daily shopping limit forces prioritisation.
// A FLOW constraint only: scoring (foodwaste.js) is untouched. 9 buys/day means with the 6-item
// fridge you must use ≥5 fridge items to fill all 14 sockets (6 + ≤9 ≥ 14). Tunable.
export const MARKET_CAP = 9;

// Can you still grab a market item? Blocked AT the cap (teach-don't-punish — never a fail or a
// negative balance; the chef nudges back to the fridge). Pure boundary check.
export function canAcquireMarket(marketHeld, cap = MARKET_CAP) {
  return marketHeld < cap;
}

// How many market-sourced items you currently HOLD = placed on plates + the one in your hand.
// Derived fresh from state, so a Q/undo of a market item refunds automatically (recount, no
// counter to keep in sync, no soft-lock).
export function marketHeldCount(plates, heldItem) {
  let n = 0;
  for (const p of plates) {
    for (const s of p.slots) if (s.item && s.source === 'market') n += 1;
  }
  if (heldItem && heldItem.source === 'market') n += 1;
  return n;
}

// Result flow is deliberately sequential: the child first sees how the plan scored,
// then the learning fact/source, and only then leaves the game for the shared result.
export function advanceMealPlannerResultPage(page) {
  return page === 'score' ? 'fact' : 'complete';
}

// ── Invariant · TEST-LOCK: is this scenario completable under the cap? ──
// True iff every required socket can be filled from the 6-item fridge + ≤cap market buys, where
// the market is infinite-per-non-empty-category (the in-game crates restock). Guards the clean
// design: all 6 fridge items placeable, no type overflow, the deficit is ≤cap and sourceable.
function socketDemand(plates) {
  const d = {};
  for (const p of plates) {
    const types = p.sockets || (p.slots || []).map((s) => s.type);
    for (const ty of types) if (ty) d[ty] = (d[ty] || 0) + 1;
  }
  return d;
}
function tallyByType(ids) {
  const t = {};
  for (const id of ids) {
    const ty = slotTypeOf(id);
    if (ty) t[ty] = (t[ty] || 0) + 1;
  }
  return t;
}
export function scenarioSolvableUnderCap(scenario, plates, cap = MARKET_CAP) {
  const demand = socketDemand(plates);
  const fridge = tallyByType(scenario.homeInventory);
  // (a) all 6 fridge items placeable (no junk) and no type overflow → "6 placeable" invariant.
  const allPlaceable = scenario.homeInventory.every((id) => slotTypeOf(id) !== null);
  const noOverflow = Object.keys(fridge).every((t) => fridge[t] <= (demand[t] || 0));
  // (b) the remaining deficit is ≤cap and every needed type has a non-empty market category.
  const market = tallyByType(Object.values(scenario.market || {}).flat());
  let needed = 0;
  let sourceable = true;
  for (const t of Object.keys(demand)) {
    const remaining = Math.max(0, demand[t] - (fridge[t] || 0));
    needed += remaining;
    if (remaining > 0 && !(market[t] > 0)) sourceable = false;
  }
  return allPlaceable && noOverflow && sourceable && needed <= cap;
}
