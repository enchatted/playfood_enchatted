// MarketTrip (Local & Seasonal, Mission 2) — rules of the seasonal market.
//
// Redesigned after partner reviews. Pure functions only, so every rule is unit-locked.
//
//   • The market happens in a real country + month. Whether a local fruit or
//     vegetable is in season comes from the EUFIC dataset (the same data as
//     Season Matcher). Cheese and honey are local craft products.
//   • Prices are resolved per scenario from marketTripData.PRODUCTS[].prices,
//     so local is no longer always the expensive option.
//   • Money is the only hard limit and it is checked at the checkout. Until
//     the child pays, any stall can be re-opened and changed: nothing ends
//     the shop halfway.
//   • Three visible goals give the three stars:
//       1. eight products within the money       (needed to pay, 1 star)
//       2. local for everything that is in season (+1 star)
//       3. transport points up to the target     (+1 star)
//     Spending less money is no longer rewarded on its own.
import { getInSeasonMonths, pickMonth, seasonOfMonth } from '../../data/seasonMatcherData.js';
import { PRODUCTS } from '../../data/marketTripData.js';

export const REQUIRED_STALLS = 8;
export const POINTS_PER_PRODUCT = 10;
export const BONUS_SEASONAL = 15;
export const BONUS_TRANSPORT = 15;
export const NEAR_BUDGET_SHARE = 0.85;

const EPSILON = 1e-9;
const roundUpToHalf = (value) => Math.ceil(value * 2 - EPSILON) / 2;
export const roundCents = (value) => Math.round(value * 100) / 100;

// Scenario month: the real month most of the time (what is in season NOW),
// sometimes another month so a replay is a different market.
export function pickMarketMonth({ date, random } = {}) {
  return pickMonth({ country: null, date, random });
}

/**
 * Resolves prices, seasons, the money budget and the transport target for one
 * market (country + month). Every child-facing number comes from here.
 *
 * Budget rule (checked for 3 countries × 12 months × 256 baskets in tests):
 *   base = in-season products bought local + everything else imported.
 *   «Extra local» options = out-of-season local produce + local craft goods.
 *   The money covers the base plus about half of those extras (+ €1 slack),
 *   so the child has to choose which extras to buy local. Buying everything
 *   local never fits; the cheapest basket never earns more than 1 star.
 *   The transport target is met by any basket with that many extras local.
 */
export function buildMarketScenario({ country, month, products = PRODUCTS }) {
  const items = {};
  for (const product of products) {
    const craft = Boolean(product.craft);
    const months = craft ? [] : getInSeasonMonths(product.seasonId, country);
    const inSeason = !craft && months.includes(month);
    const localAvailable = craft || months.length > 0;
    const localPrice = craft
      ? product.prices.local
      : (inSeason ? product.prices.localInSeason : product.prices.localOutOfSeason);
    items[product.nameKey] = {
      nameKey: product.nameKey,
      craft,
      inSeason,
      localAvailable,
      localMonths: months,
      localPrice,
      importedPrice: product.prices.imported,
      localMiles: product.local.miles,
      importedMiles: product.imported.miles,
    };
  }

  const list = Object.values(items);
  const base = list.reduce((sum, it) => sum + (it.inSeason ? it.localPrice : it.importedPrice), 0);
  const basePoints = list.reduce((sum, it) => sum + (it.inSeason ? it.localMiles : it.importedMiles), 0);
  const extras = list
    .filter((it) => !it.inSeason && it.localAvailable)
    .map((it) => ({ cost: it.localPrice - it.importedPrice, saves: it.importedMiles - it.localMiles }));
  const extraLocalSlots = Math.max(1, Math.round(extras.length / 2));
  const cheapestExtras = [...extras].sort((a, b) => a.cost - b.cost).slice(0, extraLocalSlots);
  const smallestSavings = [...extras].sort((a, b) => a.saves - b.saves).slice(0, extraLocalSlots);

  return {
    country,
    month,
    season: seasonOfMonth(month),
    items,
    budget: roundUpToHalf(base + cheapestExtras.reduce((sum, e) => sum + e.cost, 0) + 1),
    transportTarget: basePoints - smallestSavings.reduce((sum, e) => sum + e.saves, 0),
    extraLocalSlots,
    extraLocalOptions: extras.length,
  };
}

// Stall objects carry the resolved prices so the renderer, the basket and the
// e2e drivers read one shape: stall.local.price / stall.imported.price.
export function stallFromProduct(product, scenario, translate = (key) => key) {
  const item = scenario.items[product.nameKey];
  return {
    ...product,
    name: translate(product.nameKey),
    local: {
      ...product.local,
      name: translate(product.local.nameKey),
      price: item.localPrice,
      inSeason: item.inSeason,
      craft: item.craft,
      available: item.localAvailable,
    },
    imported: {
      ...product.imported,
      name: translate(product.imported.nameKey),
      price: item.importedPrice,
    },
    chosen: false,
    chosenLocal: false,
  };
}

export function marketGoals(state) {
  const stalls = state?.stalls || [];
  const complete = stalls.length === REQUIRED_STALLS && stalls.every((stall) => stall.chosen);
  const money = roundCents(state?.moneySpent ?? 0);
  const miles = state?.milesUsed ?? 0;
  return {
    complete,
    withinBudget: money <= (state?.budget ?? Infinity) + EPSILON,
    seasonal: stalls.every((stall) => !stall.chosen || !stall.local.inSeason || stall.chosenLocal),
    transport: miles <= (state?.transportTarget ?? Infinity),
  };
}

export function starsForMarketGoals(goals) {
  if (!goals?.complete || !goals.withinBudget) return 0;
  return 1 + (goals.seasonal ? 1 : 0) + (goals.transport ? 1 : 0);
}

export function marketTierForStars(stars) {
  return ['fail', 'pass', 'great', 'perfect'][stars] || 'fail';
}

// Pass = the basket was paid: eight products within the money.
export function marketTripPassed(state) {
  return Boolean(state?.paid) && starsForMarketGoals(marketGoals(state)) > 0;
}

// Header stars show only goals that are really reached (full basket), never
// a pre-filled reward during the shop.
export function liveStarsForMarketTrip(state) {
  const goals = marketGoals(state);
  return goals.complete ? starsForMarketGoals(goals) : 0;
}

export function canPayMarketBasket(state) {
  const goals = marketGoals(state);
  return goals.complete && goals.withinBudget;
}

// Totals after picking an option; a re-opened stall first gives back the
// option already in the basket.
export function marketChoiceProjection(state, stall) {
  const previous = stall.chosen ? (stall.chosenLocal ? stall.local : stall.imported) : null;
  const money = (state.moneySpent || 0) - (previous ? previous.price : 0);
  const miles = (state.milesUsed || 0) - (previous ? previous.miles : 0);
  return {
    base: { money: roundCents(money), miles },
    local: { money: roundCents(money + stall.local.price), miles: miles + stall.local.miles },
    imported: { money: roundCents(money + stall.imported.price), miles: miles + stall.imported.miles },
  };
}

// Puts the chosen option in the basket (first purchase or change of mind).
export function applyMarketChoice(state, stall, isLocal) {
  const projection = marketChoiceProjection(state, stall);
  const option = isLocal ? stall.local : stall.imported;
  const wasChosen = Boolean(stall.chosen);
  const changed = wasChosen && Boolean(stall.chosenLocal) !== Boolean(isLocal);
  state.moneySpent = isLocal ? projection.local.money : projection.imported.money;
  state.milesUsed = isLocal ? projection.local.miles : projection.imported.miles;
  stall.chosen = true;
  stall.chosenLocal = Boolean(isLocal);
  if (!wasChosen) state.stallsDone = (state.stallsDone || 0) + 1;
  return { option, wasChosen, changed };
}

// Money warning for the highlighted option (transport is a goal, not a limit).
export function marketTripBudgetWarningKey({ money = 0, budget = Infinity } = {}) {
  if (money > budget + EPSILON) return 'warning_money';
  if (money >= budget * NEAR_BUDGET_SHARE) return 'near_money';
  return null;
}

// Selects at most one educational fact for a purchase. The caller owns the
// one-shot flags so this function remains deterministic and unit-testable.
// The air-freight fact follows the food, not the distance: only foods EUFIC lists as
// fragile (flagged `fragile` in marketTripData.js) earn it. Long ship journeys (apples, oranges) do not.
export function nextMarketFactId({ isLocal, fragile = false, factFired } = {}) {
  if (!factFired) return null;
  if (isLocal) return factFired.local ? null : 'localFirst';
  if (fragile && !factFired.airfreight) return 'airFreight';
  if (!factFired.imported) return 'importedFirst';
  if (!factFired.carbon) return 'carbonFootprint';
  return null;
}
