// Anti-spoiler locks (Phase 1): the choice point must stay blind — neither the
// shelf nor the focused-food label may reveal the in/out-of-season verdict
// before the child commits. The seasonal answer only appears at checkout.
import { describe, it, expect } from 'vitest';
import * as seasonMatcherRenderer from './seasonMatcherRenderer.js';
import {
  focusedFoodText,
  renderCashierStations,
  renderSeasonFoods,
  renderSeasonSourceChip,
  renderPlayerCart,
} from './seasonMatcherRenderer.js';

// Minimal canvas stub: capture every fillText, no-op everything else.
const makeCtx = (drawn = []) => new Proxy({}, {
  get(_t, prop) {
    if (prop === 'fillText') return (text) => drawn.push(String(text));
    if (prop === 'measureText') return () => ({ width: 10 });
    if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
  set() { return true; },
});

describe('focused-food label shows ONLY the product name', () => {
  it('in-season food → just emoji + name (no season / origin / "Now" tag)', () => {
    const f = { emoji: '🍓', name: 'Strawberry', inSeason: true, seasonLabel: 'Now', seasonEmoji: '🌿', originText: '🇬🇷' };
    expect(focusedFoodText(f)).toBe('🍓 Strawberry');
  });

  it('out-of-season food → just emoji + name (no ✈️, flag, or season word leaks)', () => {
    const f = { emoji: '🍅', name: 'Tomato', inSeason: false, seasonLabel: 'summer', seasonEmoji: '☀️', originText: '🇪🇸 ✈️' };
    const text = focusedFoodText(f);
    expect(text).toBe('🍅 Tomato');
    expect(text).not.toMatch(/✈️|🇪🇸|summer/);
  });

  it('empty string when there is no faced food or no name', () => {
    expect(focusedFoodText(null)).toBe('');
    expect(focusedFoodText({ emoji: '🍎' })).toBe('');
  });
});

describe('shelf foods draw NO ✅/✈️ buy-signal badge', () => {
  it('draws three facings for one selectable supermarket product', () => {
    const drawn = [];
    const ctx = makeCtx(drawn);

    renderSeasonFoods(ctx, [
      { id: 'strawberry', emoji: '🍓', col: 1, row: 1, taken: false },
    ], 0);

    expect(drawn.filter((text) => text === '🍓')).toHaveLength(3);
  });

  it('renderSeasonFoods draws the emoji but never a verdict glyph', () => {
    const drawn = [];
    // Minimal canvas stub: capture every fillText, no-op everything else.
    const ctx = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'fillText') return (text) => drawn.push(String(text));
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
        return () => {};
      },
      set() { return true; },
    });
    const foods = [
      { emoji: '🍓', col: 1, row: 1, inSeason: true, taken: false },
      { emoji: '🍅', col: 2, row: 1, inSeason: false, taken: false },
    ];
    renderSeasonFoods(ctx, foods, 0);
    expect(drawn).toContain('🍓');
    expect(drawn).toContain('🍅');
    expect(drawn.join('')).not.toMatch(/✅|✈️/);
  });

  it('draws spinach as a custom bunch instead of the unclear generic leaf emoji', () => {
    const drawn = [];
    const ctx = makeCtx(drawn);

    renderSeasonFoods(ctx, [
      { id: 'spinach', emoji: '🌿', col: 1, row: 1, taken: false },
    ], 0);

    expect(drawn).not.toContain('🌿');
  });

  it.each([
    ['lettuce', '🥗'],
    ['cabbage', '🥬'],
    ['kale', '🍃'],
  ])('draws %s with its own silhouette instead of a generic emoji', (id, emoji) => {
    const drawn = [];
    const ctx = makeCtx(drawn);

    renderSeasonFoods(ctx, [
      { id, emoji, col: 1, row: 1, taken: false },
    ], 0);

    expect(drawn).not.toContain(emoji);
  });
});

describe('active checkout feedback', () => {
  it('keeps the scanned product on the cashier layer without putting text behind the player', () => {
    const drawn = [];
    const ctx = makeCtx(drawn);

    renderCashierStations(ctx, [4.5, 9.5, 14.5], 0, {
      activeCheckoutCol: 9.5,
      checkoutQueue: [],
      checkoutCurrentItem: { emoji: '🍊' },
      cashierCheckingText: 'Ελέγχω',
    });

    expect(drawn.filter((text) => text.startsWith('Ελέγχω'))).toHaveLength(0);
    expect(drawn).toContain('🍊');
  });

  it('draws the checking message through the foreground overlay', () => {
    const drawn = [];
    const ctx = makeCtx(drawn);
    const checkoutState = {
      activeCheckoutCol: 9.5,
      checkoutQueue: [],
      checkoutCurrentItem: { emoji: '🍊' },
      cashierCheckingText: 'Ελέγχω',
    };

    expect(typeof seasonMatcherRenderer.renderCashierProgressOverlay).toBe('function');
    seasonMatcherRenderer.renderCashierProgressOverlay(
      ctx,
      [4.5, 9.5, 14.5],
      0,
      checkoutState,
    );

    expect(drawn.filter((text) => text.startsWith('Ελέγχω'))).toHaveLength(1);
    expect(drawn).not.toContain('🍊');
  });
});

describe('Season Matcher produce identity stays consistent through shopping', () => {
  it.each([
    ['asparagus', '🌱', 'Σπαράγγι'],
    ['leek', '🧅', 'Πράσο'],
    ['cabbage', '🥬', 'Λάχανο'],
  ])('never shows the misleading %s emoji on shelf, cart, checkout or name label', (id, emoji, name) => {
    const drawn = [];
    const ctx = makeCtx(drawn);
    const food = { id, emoji, name, col: 1, row: 1, taken: false };
    renderSeasonFoods(ctx, [food], 0);
    renderPlayerCart(ctx, { cart: [food], player: { pixelX: 0, pixelY: 0, dir: 2 } }, 6);
    renderCashierStations(ctx, [4.5], 0, { activeCheckoutCol: 4.5, checkoutCurrentItem: food });
    expect(drawn).not.toContain(emoji);
    expect(focusedFoodText(food)).toBe(name);
  });
});

describe('on-canvas EUFIC source chip', () => {
  it('draws a 📖 EUFIC label and publishes a hit-testable rect', () => {
    const drawn = [];
    const ctx = makeCtx(drawn);
    const state = {};
    const rect = renderSeasonSourceChip(ctx, state, 'EUFIC · Press S');
    // The rect is published for the component's click hit-test…
    expect(state.seasonSourceRect).toEqual(rect);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    // …and the chip shows the source badge text.
    expect(drawn.join('')).toContain('📖');
    expect(drawn.join('')).toContain('EUFIC');
  });
});

describe('Season Matcher scene responsibilities', () => {
  it('keeps shopping-list progress in the responsive UI instead of the game world', () => {
    expect(seasonMatcherRenderer).not.toHaveProperty('renderBasketStrip');
  });
});
