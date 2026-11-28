// Phase 1 locks for the SeasonMatcher energy model + result i18n.
// The energy/getShelfLabel assertions migrated here from the orphaned
// __checks__/seasonMatcherData.check.mjs — vitest's include glob is
// src/**/*.test.{js,jsx}, so the .mjs never ran in CI.
import { describe, it, expect } from 'vitest';
import {
  energyBand, getShelfLabel, ENERGY_COST_OOS, SHELF_SIZE,
} from './seasonMatcherData.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../games/engine/gameRoomData.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

const LOCALES = [['en', en], ['el', el], ['nl', nl], ['pt', pt]];

describe('energy model (food-miles bands)', () => {
  it('energyBand boundaries: low ≤15, medium ≤45, high >45', () => {
    expect(energyBand(0)).toBe('low');
    expect(energyBand(15)).toBe('low');
    expect(energyBand(16)).toBe('medium');
    expect(energyBand(45)).toBe('medium');
    expect(energyBand(46)).toBe('high');
  });

  it('getShelfLabel: in-season costs 0 energy, carries no price, has a season emoji', () => {
    const l = getShelfLabel(
      { id: 1, emoji: '🍓', nameKey: 'season_foods.strawberry', inSeason: true, correctSeasons: ['spring'] },
      'greece',
    );
    expect(l.inSeason).toBe(true);
    expect(l.energyCost).toBe(0);
    expect('priceText' in l).toBe(false);
    expect(l.seasonEmoji).toBeDefined();
  });

  it('getShelfLabel: out-of-season costs ENERGY_COST_OOS and carries a ✈️ origin', () => {
    const l = getShelfLabel(
      { id: 2, emoji: '🍅', nameKey: 'season_foods.tomato', inSeason: false, correctSeasons: ['summer'], originKey: 'season.origin_out.spain' },
      'greece',
    );
    expect(l.inSeason).toBe(false);
    expect(l.energyCost).toBe(ENERGY_COST_OOS);
    expect(l.originText).toMatch(/✈️/);
  });
});

describe('room ↔ shelf invariant (a shrunk shelf must never make the win unreachable)', () => {
  it('SeasonMatcher room exposes at least SHELF_SIZE food positions', () => {
    expect(GAME_ROOMS.SeasonMatcher.foodPositions.length).toBeGreaterThanOrEqual(SHELF_SIZE);
  });
});

describe('checkout collision matches the full cashier-station artwork', () => {
  it('uses symmetric two-tile stations with equal three-tile margins and gaps', () => {
    expect(GAME_ROOMS.SeasonMatcher.cashierCenters).toEqual([4.5, 9.5, 14.5]);

    const stationColumns = [[4, 5], [9, 10], [14, 15]];
    for (const columns of stationColumns) {
      for (const row of [10, 11]) {
        for (const col of columns) {
          expect(isGameRoomWalkable(GAME_ROOMS.SeasonMatcher, col, row), `${col},${row}`).toBe(false);
        }
      }
    }

    expect(GAME_ROOMS.SeasonMatcher.checkoutTiles).toEqual(
      stationColumns.flatMap((columns) => columns.map((col) => ({ col, row: 10 }))),
    );
  });

  it('keeps the approach row and aisles between checkout stations walkable', () => {
    const equalFreeSegments = [[1, 2, 3], [6, 7, 8], [11, 12, 13], [16, 17, 18]];
    for (const segment of equalFreeSegments) {
      for (const col of segment) {
        expect(isGameRoomWalkable(GAME_ROOMS.SeasonMatcher, col, 10), `${col},10`).toBe(true);
      }
    }
    for (const col of [4, 5, 9, 10, 14, 15]) {
      expect(isGameRoomWalkable(GAME_ROOMS.SeasonMatcher, col, 9), `${col},9`).toBe(true);
    }
  });
});

describe('Phase 1 result i18n — season.results.* tiers + press_s in all 4 locales', () => {
  const TIERS = ['perfect', 'good', 'pass', 'fail'];

  it('every tier title+body + traveled_title resolve; old flat keys are gone', () => {
    for (const [name, loc] of LOCALES) {
      const r = loc.season?.results;
      expect(r, `${name} season.results`).toBeTruthy();
      for (const tier of TIERS) {
        expect(r[`tier_${tier}_title`], `${name} tier_${tier}_title`).toBeTruthy();
        expect(r[`tier_${tier}_body`], `${name} tier_${tier}_body`).toBeTruthy();
      }
      expect(r.traveled_title, `${name} traveled_title`).toBeTruthy();
      // Regression: the pre-migration flat keys (season.results_tier_* /
      // results_correct) were folded into the nested block — they must NOT
      // reappear, and the now-orphaned season.results.correct stays removed.
      expect(loc.season.results_tier_perfect_title, `${name} old flat tier key`).toBeUndefined();
      expect(loc.season.results_correct, `${name} old flat correct key`).toBeUndefined();
      expect(r.correct, `${name} results.correct removed`).toBeUndefined();
    }
  });

  it('the GardenPlanner copy-paste leftover is gone (no gardener/tuinier/κηπουρός in the perfect title)', () => {
    for (const [name, loc] of LOCALES) {
      expect(loc.season.results.tier_perfect_title, name).not.toMatch(/garden|tuinier|κηπουρ/i);
    }
  });

  it('season.press_s resolves in every locale', () => {
    for (const [name, loc] of LOCALES) {
      expect(loc.season?.press_s, `${name} press_s`).toBeTruthy();
    }
  });
});

describe('runtime wrong-hint keys resolve (the teach-don\'t-punish checkout toast)', () => {
  it('feedback_traveled / feedback_always_from carry {{food}}+{{country}}; always_imported exists', () => {
    for (const [name, loc] of LOCALES) {
      const s = loc.season;
      expect(s.feedback_traveled, `${name} feedback_traveled`).toBeTruthy();
      expect(s.feedback_traveled, `${name} feedback_traveled food`).toContain('{{food}}');
      expect(s.feedback_traveled, `${name} feedback_traveled country`).toContain('{{country}}');
      expect(s.feedback_always_from, `${name} feedback_always_from`).toBeTruthy();
      expect(s.feedback_always_from, `${name} feedback_always_from food`).toContain('{{food}}');
      expect(s.feedback_always_from, `${name} feedback_always_from country`).toContain('{{country}}');
      expect(s.always_imported, `${name} always_imported`).toBeTruthy();
    }
  });
});

describe('SeasonMatcher counters name what every number represents', () => {
  const cases = [
    // Use the same transport points label in both games.
    ['en', en, /season basket/i, /cart/i, /transport points/i],
    ['el', el, /καλάθι εποχής/i, /καρότσι/i, /πόντοι μεταφοράς/i],
    ['nl', nl, /seizoensmand/i, /karretje/i, /transportpunten/i],
    ['pt', pt, /cesto da época/i, /carrinho/i, /pontos de transporte/i],
  ];

  it('labels the checkout count, season basket and shopping cart in every locale', () => {
    for (const [name, loc, basketNoun, cartNoun] of cases) {
      expect(loc.season.checkout_prompt, `${name}: checkout count`).toContain('{{n}}');
      expect(loc.season.checkout_prompt, `${name}: checkout cart`).toMatch(cartNoun);

      expect(loc.season.basket_progress, `${name}: basket name`).toMatch(basketNoun);
      expect(loc.season.basket_progress, `${name}: basket current`).toContain('{{current}}');
      expect(loc.season.basket_progress, `${name}: basket total`).toContain('{{total}}');

      expect(loc.season.cart_progress, `${name}: cart name`).toMatch(cartNoun);
      expect(loc.season.cart_progress, `${name}: cart current`).toContain('{{current}}');
      expect(loc.season.cart_progress, `${name}: cart total`).toContain('{{total}}');
    }
  });

  it('identifies every energy band as transport energy in every locale', () => {
    for (const [name, loc, , , transportEnergy] of cases) {
      for (const band of ['low', 'medium', 'high']) {
        expect(loc.season[`energy_${band}`], `${name}: ${band}`).toMatch(transportEnergy);
      }
    }
  });
});
