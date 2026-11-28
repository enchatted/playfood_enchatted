// RED contract for the Meal Planner walk-GRAB-CARRY port.
// Pure decision helpers that the component orchestrates — keeps the carry logic
// testable + locks the fixes ("already have" = STILL in fridge · dynamic at-risk).
// Scoring stays in foodwaste.js (frozen, 272 locks) — this module only DECIDES, never scores.
import { describe, it, expect } from 'vitest';
import { PLATES, SCENARIOS } from '../../data/foodwaste.js';
import {
  resolvePlacement, isRedundantBuy, atRiskStillInFridge,
  MARKET_CAP, canAcquireMarket, marketHeldCount, scenarioSolvableUnderCap,
  advanceMealPlannerResultPage,
} from './mealPlannerCarry.js';

const mkPlate = (tpl) => ({
  meal: tpl.meal,
  slots: tpl.sockets.map((t) => ({ type: t, item: null, source: null })),
});

describe('resolvePlacement — carried food → active plate (pure decision, no mutation)', () => {
  it('rejects junk (no slot type) with reason "junk"', () => {
    const plate = mkPlate(PLATES[0]); // breakfast: carb/protein/fruit/fruit
    expect(resolvePlacement(plate, 'soda')).toEqual({ ok: false, reason: 'junk' });
  });

  it('places a matching food into the first OPEN slot of its type', () => {
    const plate = mkPlate(PLATES[0]);
    expect(resolvePlacement(plate, 'bread')).toEqual({ ok: true, slotIndex: 0 }); // carb → 0
    expect(resolvePlacement(plate, 'strawberry')).toEqual({ ok: true, slotIndex: 2 }); // fruit → first fruit
  });

  it('rejects a food whose slot type does not exist on this plate (reason "wrong")', () => {
    const plate = mkPlate(PLATES[0]); // breakfast has no veg socket
    expect(resolvePlacement(plate, 'tomato')).toEqual({ ok: false, reason: 'wrong' });
  });

  it('rejects when the matching slot type is already full (reason "wrong")', () => {
    const plate = mkPlate(PLATES[0]);
    plate.slots[0].item = 'rice'; // carb filled
    expect(resolvePlacement(plate, 'bread')).toEqual({ ok: false, reason: 'wrong' });
  });
});

describe('isRedundantBuy — "already have" = STILL in the fridge (not original-membership)', () => {
  it('flags a MARKET buy of a food still present (unused) in the live fridge', () => {
    expect(isRedundantBuy('strawberry', 'market', ['strawberry', 'lettuce'])).toBe(true);
  });

  it('does NOT flag once the fridge copy was already used (gone from live fridge)', () => {
    expect(isRedundantBuy('strawberry', 'market', ['lettuce'])).toBe(false);
  });

  it('never flags a HOME-sourced pickup', () => {
    expect(isRedundantBuy('strawberry', 'home', ['strawberry'])).toBe(false);
  });
});

describe('atRiskStillInFridge — dynamic at-risk coach (per scenario, never hardcoded)', () => {
  it('returns the at-risk home items still in the live fridge for the current scenario', () => {
    const summer = SCENARIOS[0];
    const out = atRiskStillInFridge(summer, [...summer.homeInventory]);
    expect(out).toContain('strawberry');
    expect(out).toContain('banana');
    expect(out).not.toContain('egg'); // long shelf — not at-risk
  });

  it('returns empty once all at-risk items have been used', () => {
    const summer = SCENARIOS[0];
    expect(atRiskStillInFridge(summer, ['tomato', 'egg', 'lentils'])).toEqual([]);
  });
});

// ── MARKET CAP — "item limit → forces prioritisation" ──
describe('canAcquireMarket — daily shopping cap on market buys (teach-don\'t-punish gate)', () => {
  it('allows a market buy while still below the cap', () => {
    expect(canAcquireMarket(0, MARKET_CAP)).toBe(true);
    expect(canAcquireMarket(MARKET_CAP - 1, MARKET_CAP)).toBe(true);
  });

  it('blocks the buy exactly AT the cap (never a fail / negative stock)', () => {
    expect(canAcquireMarket(MARKET_CAP, MARKET_CAP)).toBe(false);
  });

  it('stays blocked above the cap', () => {
    expect(canAcquireMarket(MARKET_CAP + 3, MARKET_CAP)).toBe(false);
  });
});

describe('marketHeldCount — market items you HOLD = placed + in-hand (Q/undo refunds by recount)', () => {
  const plate = (sources) => ({ meal: 'lunch', slots: sources.map((src) => ({ item: src ? 'x' : null, source: src })) });

  it('counts placed market slots, ignoring home + empty sockets', () => {
    const plates = [plate(['market', 'home', null]), plate(['market', null])];
    expect(marketHeldCount(plates, null)).toBe(2);
  });

  it('adds the in-hand item only when it is market-sourced', () => {
    const plates = [plate(['market'])];
    expect(marketHeldCount(plates, { source: 'market' })).toBe(2);
    expect(marketHeldCount(plates, { source: 'home' })).toBe(1);
  });

  it('drops back when a placed market item is undone (refund = recount, no soft-lock)', () => {
    const plates = [plate(['market', 'market'])];
    expect(marketHeldCount(plates, null)).toBe(2);
    plates[0].slots[1] = { item: null, source: null }; // Q/undo one market placement
    expect(marketHeldCount(plates, null)).toBe(1);
  });
});

describe('scenarioSolvableUnderCap — TEST-LOCK invariant (στ): every scenario finishes under the cap', () => {
  it('MARKET_CAP is the tuned daily limit (9 — forces ≥5 fridge items across 14 sockets)', () => {
    expect(MARKET_CAP).toBe(9);
  });

  it('all three scenarios are solvable with the 6-item fridge + ≤cap market buys', () => {
    for (const s of SCENARIOS) {
      expect(scenarioSolvableUnderCap(s, PLATES, MARKET_CAP)).toBe(true);
    }
  });

  it('fails when the cap is too low to buy what the fridge cannot cover (summer needs 8)', () => {
    expect(scenarioSolvableUnderCap(SCENARIOS[0], PLATES, 7)).toBe(false);
  });

  it('fails when a needed market category is empty (nothing to source the slot from)', () => {
    const broken = { ...SCENARIOS[0], market: { ...SCENARIOS[0].market, carb: [] } };
    expect(scenarioSolvableUnderCap(broken, PLATES, MARKET_CAP)).toBe(false);
  });

  it('fails when the fridge holds an unplaceable junk item (breaks the 6-placeable invariant)', () => {
    const broken = { ...SCENARIOS[0], homeInventory: ['soda', 'strawberry', 'tomato', 'egg', 'lentils', 'banana'] };
    expect(scenarioSolvableUnderCap(broken, PLATES, MARKET_CAP)).toBe(false);
  });
});

describe('advanceMealPlannerResultPage — score, learning card, shared result', () => {
  it('shows the educational fact only after the score page', () => {
    expect(advanceMealPlannerResultPage('score')).toBe('fact');
  });

  it('completes only after the educational fact page', () => {
    expect(advanceMealPlannerResultPage('fact')).toBe('complete');
  });
});
