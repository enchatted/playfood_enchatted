// Meal Planner chef — pure timing and decision helpers. The component shows / closes messages;
// this module only decides. Advice is tied to the
// child's own choice, said at most once, closed when the choice it talks about is undone, and it
// talks only about what the scorer counts. No automatic egg hint any more.
import { isRedundantBuy } from './mealPlannerCarry.js';

const LONG_FEEDBACK_KEYS = new Set(['junk', 'wrong', 'missing', 'already', 'capfull', 'season']);
// Advice about a placement the child just made. Only these carry a `ref` to that placement.
export const CHOICE_COACH_KEYS = new Set(['already', 'season', 'plant']);
const VISIBLE_COACH_KEYS = new Set([
  ...LONG_FEEDBACK_KEYS,
  'atrisk',
  'plant',
  'mealdone',
]);

export function mealPlannerCoachDuration(key) {
  if (LONG_FEEDBACK_KEYS.has(key)) return 6;
  if (key === 'mealdone') return 3;
  return 4.5;
}

export function createMealPlannerCoachMessage(msg, key) {
  if (!msg || !VISIBLE_COACH_KEYS.has(key)) return null;
  return { msg, key, life: mealPlannerCoachDuration(key) };
}

export function shouldShowAtRiskMarketCoach({
  source,
  atRiskRemaining,
  alreadyShown,
} = {}) {
  return source === 'market' && atRiskRemaining > 0 && !alreadyShown;
}

export function tickMealPlannerCoachMessage(message, dt) {
  if (!message?.msg) return null;
  const life = message.life - dt;
  return life > 0 ? { ...message, life } : null;
}

// A fresh «what the chef has already said» record for one attempt.
export function createCoachTold() {
  return { already: new Set(), season: false, plant: false };
}

export function isChoiceCoach(message) {
  return !!message && CHOICE_COACH_KEYS.has(message.key);
}

// Out of season IN THIS SCENARIO, by the same rule the Sustainability score uses
// (`foodwaste.js` scoreSustainability: season === 'all' or the scenario's season counts as seasonal).
export function isOutOfSeasonInScenario(food, season) {
  return !!food && !!season && !!food.season && food.season !== 'all' && food.season !== season;
}

// Which advice (if any) a just-made placement earns. One message slot, priority
// already_have > season > nudge_plant. Only the winner is said — a message that loses the slot is
// NOT marked as said, so it can still come with a later choice.
//   already: a BOUGHT food while the same food is still unused in the live fridge (every home
//            food — the scorer's final-state rule), once per food per attempt;
//   season:  the first food that is out of season in the scenario, once per attempt;
//   plant:   the first chicken or processed protein, once per attempt.
export function choiceCoachFor({ food, source, liveFridgeIds = [], season, told }) {
  if (!food) return null;
  if (isRedundantBuy(food.id, source, liveFridgeIds) && !told.already.has(food.id)) return 'already';
  if (!told.season && isOutOfSeasonInScenario(food, season)) return 'season';
  if (!told.plant && (food.id === 'chicken' || food.processed)) return 'plant';
  return null;
}

export function markCoachTold(told, key, foodId) {
  if (key === 'already') told.already.add(foodId);
  else if (key === 'season') told.season = true;
  else if (key === 'plant') told.plant = true;
}

// Q undid the placement at (plateIdx, socketIdx): advice about that placement no longer applies.
export function coachAfterUndo(message, undone) {
  const ref = message?.ref;
  return ref && undone && ref.plateIdx === undone.plateIdx && ref.socketIdx === undone.socketIdx
    ? null : message;
}

// The home copy of X went onto a plate: «it is already in the fridge» is no longer true.
export function coachAfterHomePlacement(message, foodId) {
  return message?.key === 'already' && message.ref?.foodId === foodId ? null : message;
}

// Plate change: the neutral «plate ready» line never replaces advice that is still showing.
export function shouldShowMealDone(message) {
  return !isChoiceCoach(message);
}
