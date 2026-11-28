import { describe, expect, it } from 'vitest';
import { CANVAS_H, CANVAS_W } from '../../overworld/overworldData.js';
import {
  canvasCssScale, dishRevealScale, layoutDishReveal, renderDishReveal, DISH_CARD_MIN_BODY_CSS_PX,
} from './leftoverChefRenderer.js';

// The rescue card gives the home suggestion its own readable strip on small screens.
const measure = (text, font) => String(text).length * (parseInt(String(font).match(/(\d+)px/)[1], 10) * 0.55);
const dish = { title: 'Rescue idea:', name: 'Toast with mashed banana', emoji: '🍞',
  text: 'The stale bread is toasted until crunchy and topped with mashed banana.', points: 25 };
const home = { id: 'bread_tomato', label: 'Another idea for home:', text: 'bread with tomato, for a sandwich.' };

function recordingCtx(canvas) {
  const calls = [];
  const noop = () => {};
  return {
    calls, canvas,
    font: '', fillStyle: '', strokeStyle: '', textAlign: '', textBaseline: '', globalAlpha: 1, lineWidth: 1,
    shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fill: noop,
    closePath: noop, arcTo: noop, arc: noop, quadraticCurveTo: noop, rect: noop, fillRect: noop, strokeRect: noop,
    setLineDash: noop, roundRect: noop,
    measureText(text) { return { width: measure(text, this.font || '10px') }; },
    fillText(text) { calls.push(String(text)); },
  };
}

describe('Leftover Chef idea card — screen scale', () => {
  it('keeps full-size screens unchanged and grows the card where the canvas is drawn small', () => {
    expect(dishRevealScale(1)).toBe(1);
    expect(dishRevealScale(0.9)).toBe(1);
    expect(dishRevealScale(Number.NaN)).toBe(1);
    const u = dishRevealScale(0.48); // ≈ 844×390
    expect(15 * u * 0.48).toBeCloseTo(DISH_CARD_MIN_BODY_CSS_PX, 6);
  });

  it('reads the on-screen scale through the HiDPI geometry', () => {
    const canvas = { width: 1688, __hidpi: { k: 0.96 }, getBoundingClientRect: () => ({ width: 844 }) };
    expect(canvasCssScale(canvas)).toBeCloseTo(0.48, 6); // k / dpr = 0.96 / 2
    expect(canvasCssScale(null)).toBe(1);
  });

  it('at scale 1 keeps the existing card geometry (560 wide) and adds no strip without a home idea', () => {
    const L = layoutDishReveal(dish, 1, measure);
    expect(L.cardW).toBe(560);
    expect(L.homeH).toBe(0);
    expect(L.homeLines).toEqual([]);
  });

  it('adds one separate strip for the home idea and stays inside the canvas when scaled', () => {
    for (const u of [1, dishRevealScale(0.48)]) {
      const L = layoutDishReveal({ ...dish, homeIdea: home }, u, measure);
      expect(L.homeLines.length).toBeGreaterThan(0);
      expect(L.homeLines.join(' ')).toBe(`${home.label} ${home.text}`);
      expect(L.cardW).toBeLessThanOrEqual(CANVAS_W - 40);
    }
  });
});

describe('Leftover Chef idea card — what is drawn', () => {
  it('draws the dish and, only when given, the home idea after it', () => {
    const plain = recordingCtx(null);
    const st1 = { dishReveal: dish, dishRevealElapsed: 1 };
    renderDishReveal(plain, st1);
    expect(plain.calls.some((c) => c.includes(home.label))).toBe(false);
    expect(st1.dishRevealLayout.homeLines).toBe(0);

    const withHome = recordingCtx(null);
    const st2 = { dishReveal: { ...dish, homeIdea: home }, dishRevealElapsed: 1 };
    renderDishReveal(withHome, st2);
    const nameAt = withHome.calls.indexOf(dish.name);
    const homeAt = withHome.calls.findIndex((c) => c.includes(home.label));
    expect(nameAt).toBeGreaterThanOrEqual(0);
    expect(homeAt).toBeGreaterThan(nameAt); // under the dish, never as its name
    expect(withHome.calls.filter((c) => c === dish.name)).toHaveLength(1);
  });

  it('on a small screen keeps the body text readable and the card fully on the canvas', () => {
    const canvas = { width: 1688, __hidpi: { k: 0.96 }, getBoundingClientRect: () => ({ width: 844 }) };
    const ctx = recordingCtx(canvas);
    const st = { dishReveal: { ...dish, homeIdea: home }, dishRevealElapsed: 1 };
    renderDishReveal(ctx, st);
    const L = st.dishRevealLayout;
    expect(L.bodyCssPx).toBeGreaterThanOrEqual(DISH_CARD_MIN_BODY_CSS_PX - 0.01);
    expect(L.y).toBeGreaterThanOrEqual(0);
    expect(L.y + L.h).toBeLessThanOrEqual(CANVAS_H);
    expect(L.x).toBeGreaterThanOrEqual(0);
    expect(L.x + L.w).toBeLessThanOrEqual(CANVAS_W);
  });

  it('clears its layout when no card is shown', () => {
    const st = { dishReveal: null, dishRevealLayout: { x: 1 } };
    renderDishReveal(recordingCtx(null), st);
    expect(st.dishRevealLayout).toBeNull();
  });
});
