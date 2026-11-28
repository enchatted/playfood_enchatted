import { describe, expect, it } from 'vitest';
import { renderIslandSigns, renderDockPrompt } from './overworldRenderer.js';
import { CANVAS_H, VIEW_SCALE, ISLANDS } from './overworldData.js';
import { ISLAND_COLORS } from '../styles/brandColors.js';
import el from '../i18n/locales/el.json';
import en from '../i18n/locales/en.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

function recorder() {
  const draws = [], stack = [];
  const ctx = {
    scaleX: 1, scaleY: 1, font: '', fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1,
    save() { stack.push({ ...this }); },
    restore() { Object.assign(this, stack.pop()); },
    scale(x, y) { this.scaleX *= x; this.scaleY *= y; },
    measureText(text) { return { width: [...text].length * (Number.parseFloat(this.font.match(/([\d.]+)px/)?.[1] || '12')) * 0.55 }; },
    beginPath() { this.points = []; },
    moveTo(x, y) { this.points.push([x, y]); },
    lineTo(x, y) { this.points.push([x, y]); },
    quadraticCurveTo(cx, cy, x, y) { this.points.push([cx, cy], [x, y]); },
    closePath() {},
    fill() {
      const xs = this.points.map(([x]) => x * this.scaleX), ys = this.points.map(([, y]) => y * this.scaleY);
      draws.push({ color: this.fillStyle, x: Math.min(...xs), y: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) });
    },
    stroke() {}, fillText() {},
  };
  return { ctx, draws };
}
const overlaps = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;

describe('world map dock prompt avoids the scaled island signs', () => {
  it.each(Object.entries({ el, en, nl, pt }))('%s retains every sign when docking at the lower islands', (_, locale) => {
    for (const island of ['growing', 'circular']) {
      for (const time of [0, 1.5, 3]) {
        const dock = ISLANDS[island];
        const state = {
          nearDock: island, time,
          camera: { x: Math.min(1024, Math.max(0, dock.dockCol * 32 - 448 + 16)), y: dock.dockRow * 32 - 256 + 16 },
          strings: { islandNames: Object.fromEntries(Object.entries(locale.islands).map(([id, data]) => [id, data.name])), enterPrompt: locale.hub.enter_prompt },
        };
        const { ctx, draws } = recorder();
        ctx.save(); ctx.scale(VIEW_SCALE, VIEW_SCALE); renderIslandSigns(ctx, state, {}); ctx.restore();
        renderDockPrompt(ctx, state);
        const prompt = draws.find(({ color }) => color === 'rgba(255,255,255,0.95)');
        const shadow = draws.find(({ color }) => color === 'rgba(0,0,0,0.15)');
        expect(prompt).toBeTruthy();
        for (const sign of draws.filter(({ color }) => Object.values(ISLAND_COLORS).includes(color))) {
          expect(overlaps(prompt, sign)).toBe(false);
          expect(overlaps(shadow, sign)).toBe(false);
        }
        expect(prompt.y).toBeLessThan(CANVAS_H - 75);
        expect(prompt.y).toBeGreaterThan(36);
        expect(prompt.bottom).toBeLessThan(CANVAS_H);
      }
    }
  });

  it('keeps the existing bottom position when no visible island sign conflicts', () => {
    const { ctx, draws } = recorder();
    renderDockPrompt(ctx, { nearDock: 'foodwaste', camera: { x: 0, y: 256 }, time: 0, strings: {} });
    expect(draws.find(({ color }) => color === 'rgba(255,255,255,0.95)').y).toBe(CANVAS_H - 75);
  });
});
