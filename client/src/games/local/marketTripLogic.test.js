import { describe, it, expect } from 'vitest';
import {
  REQUIRED_STALLS,
  buildMarketScenario, stallFromProduct, marketGoals, starsForMarketGoals,
  marketTripPassed, liveStarsForMarketTrip, canPayMarketBasket, marketTierForStars,
  marketChoiceProjection, applyMarketChoice, marketTripBudgetWarningKey,
  nextMarketFactId, pickMarketMonth,
} from './marketTripLogic.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import { checkInteraction, getFacingTile } from '../engine/gameRoomLogic.js';
import { TILE } from '../../overworld/tileAtlas.js';
import { PRODUCTS } from '../../data/marketTripData.js';
import { EUFIC_MONTHS } from '../../data/euficSeasonal.js';
import { countryForLanguage, getInSeasonMonths } from '../../data/seasonMatcherData.js';

const COUNTRIES = ['greece', 'portugal', 'belgium'];
const SCENARIOS = COUNTRIES.flatMap((country) => EUFIC_MONTHS.map((month) => ({ country, month })));

function freshState(scenario) {
  return {
    stalls: PRODUCTS.map((product) => stallFromProduct(product, scenario)),
    budget: scenario.budget,
    transportTarget: scenario.transportTarget,
    moneySpent: 0,
    milesUsed: 0,
    stallsDone: 0,
  };
}

// Every possible full basket (bit set = local) for one market scenario.
function enumerateBaskets(scenario) {
  const outcomes = [];
  for (let mask = 0; mask < 2 ** PRODUCTS.length; mask++) {
    const state = freshState(scenario);
    let possible = true;
    state.stalls.forEach((stall, index) => {
      const local = Boolean(mask & (1 << index));
      if (local && stall.local.available === false) possible = false;
      applyMarketChoice(state, stall, local);
    });
    if (!possible) continue;
    state.paid = canPayMarketBasket(state);
    outcomes.push({
      mask,
      state,
      locals: state.stalls.filter((stall) => stall.chosenLocal).length,
      stars: starsForMarketGoals(marketGoals(state)),
    });
  }
  return outcomes;
}

describe('seasonal market scenario (EUFIC country + month)', () => {
  it('uses the same country as Season Matcher for every UI language', () => {
    expect(countryForLanguage('el')).toBe('greece');
    expect(countryForLanguage('nl-BE')).toBe('belgium');
    expect(countryForLanguage('pt')).toBe('portugal');
    expect(countryForLanguage('en')).toBe('portugal');
  });

  it('marks a local product in season exactly when EUFIC lists it for that month', () => {
    for (const { country, month } of SCENARIOS) {
      const scenario = buildMarketScenario({ country, month });
      for (const product of PRODUCTS.filter((item) => !item.craft)) {
        const months = getInSeasonMonths(product.seasonId, country);
        const item = scenario.items[product.nameKey];
        expect(item.inSeason, `${country} ${month} ${product.seasonId}`).toBe(months.includes(month));
        expect(item.localAvailable, `${country} ${product.seasonId} local`).toBe(months.length > 0);
      }
    }
  });

  it('never offers a local orange in Belgium, where EUFIC lists no local season', () => {
    const scenario = buildMarketScenario({ country: 'belgium', month: 'january' });
    expect(scenario.items['market.oranges'].localAvailable).toBe(false);
  });

  it('keeps local in season as cheap as imported or cheaper, except strawberries (+€0.50)', () => {
    for (const product of PRODUCTS.filter((item) => !item.craft)) {
      const { imported, localInSeason, localOutOfSeason } = product.prices;
      if (product.seasonId === 'strawberry') expect(localInSeason - imported).toBe(0.5);
      else expect(localInSeason, product.seasonId).toBeLessThanOrEqual(imported);
      expect(localOutOfSeason, product.seasonId).toBe(imported * 2);
    }
    for (const product of PRODUCTS.filter((item) => item.craft)) {
      expect(product.prices.local - product.prices.imported, product.nameKey).toBe(1.5);
    }
  });

  it('uses whole €0.50 steps for every price and budget', () => {
    const half = (value) => Number.isInteger(value * 2);
    for (const product of PRODUCTS) {
      for (const value of Object.values(product.prices)) expect(half(value), product.nameKey).toBe(true);
    }
    for (const { country, month } of SCENARIOS) {
      expect(half(buildMarketScenario({ country, month }).budget), `${country} ${month}`).toBe(true);
    }
  });

  it('picks the real month most of the time and any month otherwise', () => {
    const september = new Date('2026-09-15T10:00:00Z');
    expect(pickMarketMonth({ date: september, random: () => 0.1 })).toBe('september');
    expect(EUFIC_MONTHS).toContain(pickMarketMonth({ date: september, random: () => 0.9 }));
  });
});

describe('seasonal market balance — 3 countries × 12 months × every basket', () => {
  it('never lets an all-local basket fit in the money, so there is always a choice', () => {
    for (const { country, month } of SCENARIOS) {
      const scenario = buildMarketScenario({ country, month });
      const outcomes = enumerateBaskets(scenario);
      const mostLocal = outcomes.reduce((best, item) => (item.locals > best.locals ? item : best));
      expect(mostLocal.state.moneySpent, `${country} ${month}`).toBeGreaterThan(scenario.budget);
      expect(mostLocal.stars, `${country} ${month}`).toBe(0);
    }
  });

  it('gives the cheapest basket at most one star: saving money alone is not the goal', () => {
    for (const { country, month } of SCENARIOS) {
      const outcomes = enumerateBaskets(buildMarketScenario({ country, month }));
      const cheapest = outcomes.reduce((best, item) => (
        item.state.moneySpent < best.state.moneySpent ? item : best));
      expect(cheapest.stars, `${country} ${month}`).toBeLessThanOrEqual(1);
    }
  });

  it('always has at least two different three-star baskets (no single right answer)', () => {
    for (const { country, month } of SCENARIOS) {
      const threeStar = enumerateBaskets(buildMarketScenario({ country, month })).filter((item) => item.stars === 3);
      expect(threeStar.length, `${country} ${month}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('reaches every final tier: 1, 2 and 3 stars', () => {
    for (const { country, month } of SCENARIOS) {
      const tiers = new Set(enumerateBaskets(buildMarketScenario({ country, month }))
        .filter((item) => item.stars > 0).map((item) => item.stars));
      expect([...tiers].sort(), `${country} ${month}`).toEqual([1, 2, 3]);
    }
  });

  it('gives the seasonal star only when every in-season product was bought local', () => {
    const scenario = buildMarketScenario({ country: 'greece', month: 'september' });
    for (const outcome of enumerateBaskets(scenario)) {
      const importedInSeason = outcome.state.stalls.some((stall) => stall.local.inSeason && !stall.chosenLocal);
      expect(marketGoals(outcome.state).seasonal).toBe(!importedInSeason);
    }
  });

  it('matches the documented Greek September example (€15.50, target 24, 2 of 4 extras)', () => {
    const scenario = buildMarketScenario({ country: 'greece', month: 'september' });
    expect(scenario.budget).toBe(15.5);
    expect(scenario.transportTarget).toBe(24);
    expect(scenario.extraLocalSlots).toBe(2);
    expect(scenario.extraLocalOptions).toBe(4);
  });
});

describe('goals, stars and paying', () => {
  const scenario = buildMarketScenario({ country: 'greece', month: 'september' });

  it('shows no stars before the basket is full and never before the first purchase', () => {
    const state = freshState(scenario);
    expect(liveStarsForMarketTrip(state)).toBe(0);
    applyMarketChoice(state, state.stalls[0], true);
    expect(liveStarsForMarketTrip(state)).toBe(0);
  });

  it('cannot pay an incomplete or over-budget basket; the paid basket passes', () => {
    const state = freshState(scenario);
    state.stalls.slice(0, 7).forEach((stall) => applyMarketChoice(state, stall, false));
    expect(canPayMarketBasket(state)).toBe(false);
    applyMarketChoice(state, state.stalls[7], false);
    expect(canPayMarketBasket(state)).toBe(true);
    expect(marketTripPassed(state)).toBe(false);
    state.paid = true;
    expect(marketTripPassed(state)).toBe(true);
  });

  it('maps stars to the result tiers', () => {
    expect([0, 1, 2, 3].map(marketTierForStars)).toEqual(['fail', 'pass', 'great', 'perfect']);
  });

  it('returns false/0 for a missing state', () => {
    expect(marketTripPassed(null)).toBe(false);
    expect(liveStarsForMarketTrip(null)).toBe(0);
  });
});

describe('changing your mind at a stall', () => {
  const scenario = buildMarketScenario({ country: 'greece', month: 'september' });

  it('projects totals after giving back the option already in the basket', () => {
    const state = freshState(scenario);
    const stall = state.stalls.find((item) => item.nameKey === 'market.strawberries');
    applyMarketChoice(state, stall, true);
    const projection = marketChoiceProjection(state, stall);
    expect(projection.base).toEqual({ money: 0, miles: 0 });
    expect(projection.imported.money).toBe(stall.imported.price);
  });

  it('swaps the option without counting the stall twice', () => {
    const state = freshState(scenario);
    const stall = state.stalls.find((item) => item.nameKey === 'market.strawberries');
    applyMarketChoice(state, stall, true);
    const result = applyMarketChoice(state, stall, false);
    expect(result).toMatchObject({ wasChosen: true, changed: true });
    expect(state.stallsDone).toBe(1);
    expect(state.moneySpent).toBe(stall.imported.price);
    expect(state.milesUsed).toBe(stall.imported.miles);
  });
});

describe('marketTripBudgetWarningKey (money only)', () => {
  it('warns when the highlighted option goes over the money', () => {
    expect(marketTripBudgetWarningKey({ money: 16, budget: 15.5 })).toBe('warning_money');
  });
  it('gives an early warning near the money limit', () => {
    expect(marketTripBudgetWarningKey({ money: 14, budget: 15.5 })).toBe('near_money');
  });
  it('stays quiet with comfortable room', () => {
    expect(marketTripBudgetWarningKey({ money: 8, budget: 15.5 })).toBeNull();
  });
});

describe('MarketTrip educational fact sequence', () => {
  const noFacts = { local: false, imported: false, carbon: false, airfreight: false };

  it('introduces the local-food benefit on the first local purchase', () => {
    expect(nextMarketFactId({ isLocal: true, km: 15, factFired: noFacts })).toBe('localFirst');
  });

  it('introduces the balanced imports message on the first imported purchase', () => {
    expect(nextMarketFactId({ isLocal: false, km: 2500, factFired: noFacts })).toBe('importedFirst');
  });

  it('reaches the carbon-footprint fact on a later short-haul import', () => {
    expect(nextMarketFactId({ isLocal: false, km: 1800, factFired: { ...noFacts, imported: true } }))
      .toBe('carbonFootprint');
  });

  it('gives the air-freight fact for a fragile import, even as the first import', () => {
    expect(nextMarketFactId({ isLocal: false, fragile: true, factFired: noFacts })).toBe('airFreight');
  });

  it('never gives the air-freight fact for a long ship journey that is not fragile', () => {
    const fired = { ...noFacts, imported: true };
    expect(nextMarketFactId({ isLocal: false, km: 11500, factFired: fired })).toBe('carbonFootprint');
  });

  it('does not repeat a fact after every relevant fact has fired', () => {
    expect(nextMarketFactId({
      isLocal: false, km: 11500, factFired: { local: true, imported: true, carbon: true, airfreight: true },
    })).toBe(null);
  });
});

describe('MarketTrip room ↔ product invariants (no crash / soft-lock)', () => {
  const room = GAME_ROOMS.MarketTrip;

  function reachableWalkableTiles() {
    const start = room.playerStart;
    const queue = [{ col: start.col, row: start.row }];
    const visited = new Set([`${start.col},${start.row}`]);
    const offsets = [
      { dc: 0, dr: -1 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
      { dc: 1, dr: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      for (const { dc, dr } of offsets) {
        const next = { col: current.col + dc, row: current.row + dr };
        const key = `${next.col},${next.row}`;
        if (visited.has(key) || !isGameRoomWalkable(room, next.col, next.row)) continue;
        visited.add(key);
        queue.push(next);
      }
    }

    return visited;
  }

  it('stalls, products and REQUIRED_STALLS are all 8 and in sync', () => {
    expect(room.stallPositions.length).toBe(REQUIRED_STALLS);
    expect(PRODUCTS.length).toBe(REQUIRED_STALLS);
  });

  it('uses eight unique COUNTER interaction tiles', () => {
    const stallKeys = room.stallPositions.map((stall) => `${stall.col},${stall.row}`);
    expect(new Set(stallKeys).size, 'no duplicate interaction tiles').toBe(REQUIRED_STALLS);
    for (const stall of room.stallPositions) {
      expect(room.map[stall.row][stall.col], `interaction tile ${stall.col},${stall.row}`).toBe(TILE.COUNTER);
    }
  });

  it('declares an explicit collision footprint and full-width interaction edge for every stall', () => {
    for (const stall of room.stallPositions) {
      expect(['up', 'down'], `orientation for ${stall.col},${stall.row}`).toContain(stall.orientation);
      expect(stall.collisionTiles, `collisionTiles for ${stall.col},${stall.row}`).toEqual(
        expect.arrayContaining([expect.objectContaining({ col: expect.any(Number), row: expect.any(Number) })]),
      );
      expect(stall.interactionTiles, `interactionTiles for ${stall.col},${stall.row}`).toEqual([
        { col: stall.col - 1, row: stall.row },
        { col: stall.col, row: stall.row },
        { col: stall.col + 1, row: stall.row },
      ]);
      expect(stall.approach, `approach for ${stall.col},${stall.row}`).toEqual(expect.objectContaining({
        col: expect.any(Number),
        row: expect.any(Number),
        dir: expect.any(Number),
      }));
    }
  });

  it('keeps every booth solid while its approach remains walkable and faces the interaction tile', () => {
    for (const stall of room.stallPositions) {
      for (const tile of stall.collisionTiles) {
        expect(isGameRoomWalkable(room, tile.col, tile.row), `solid booth tile ${tile.col},${tile.row}`).toBe(false);
      }

      expect(
        isGameRoomWalkable(room, stall.approach.col, stall.approach.row),
        `walkable approach for ${stall.col},${stall.row}`,
      ).toBe(true);
      expect(getFacingTile(stall.approach)).toEqual({ col: stall.col, row: stall.row });
    }
  });

  it('accepts interaction from every walkable tile along the front of each booth', () => {
    for (const stall of room.stallPositions) {
      const approachRow = stall.orientation === 'down' ? stall.row + 1 : stall.row - 1;

      for (const target of stall.interactionTiles) {
        const player = { col: target.col, row: approachRow, dir: stall.approach.dir };
        expect(isGameRoomWalkable(room, player.col, player.row)).toBe(true);
        expect(checkInteraction(player, stall.interactionTiles, 1)).toEqual(target);
      }
    }
  });

  it('makes all eight approach tiles reachable from the player start', () => {
    const reachable = reachableWalkableTiles();
    for (const stall of room.stallPositions) {
      expect(reachable.has(`${stall.approach.col},${stall.approach.row}`), `reachable stall ${stall.col},${stall.row}`).toBe(true);
    }
  });

  it('maps every booth collision tile to COUNTER and no unrelated COUNTER tiles', () => {
    const counterKeys = [];
    room.map.forEach((rowArr, row) => rowArr.forEach((tile, col) => {
      if (tile === TILE.COUNTER) counterKeys.push(`${col},${row}`);
    }));
    const collisionKeys = room.stallPositions.flatMap((stall) => (
      stall.collisionTiles.map((tile) => `${tile.col},${tile.row}`)
    ));

    expect(new Set(collisionKeys).size, 'no booth footprints overlap').toBe(collisionKeys.length);
    expect(counterKeys.slice().sort()).toEqual(collisionKeys.slice().sort());
  });
});
