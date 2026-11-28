import { describe, it, expect } from 'vitest';
import { heroSlotRects } from './avatarSelectRenderer.js';
import { CANVAS_W, CANVAS_H } from './overworldData.js';

describe('heroSlotRects — avatar-select hit zones', () => {
  const rects = heroSlotRects(4);

  it('returns one square rect per hero', () => {
    expect(rects).toHaveLength(4);
    for (const r of rects) {
      expect(r.width).toBe(r.height);
      expect(r.width).toBeGreaterThan(0);
    }
  });

  it('lays the heroes out evenly spaced (constant stride)', () => {
    const stride = rects[1].x - rects[0].x;
    expect(stride).toBeGreaterThan(rects[0].width); // a real gap, not overlapping
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].x - rects[i - 1].x).toBeCloseTo(stride, 6);
    }
  });

  it('centres the whole row horizontally in the canvas', () => {
    const first = rects[0];
    const last = rects[rects.length - 1];
    const leftMargin = first.x;
    const rightMargin = CANVAS_W - (last.x + last.width);
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(1); // symmetric (±rounding)
  });

  it('keeps every rect fully inside the canvas', () => {
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(CANVAS_W);
      expect(r.y + r.height).toBeLessThanOrEqual(CANVAS_H);
    }
  });

  it('never overlaps neighbouring hit zones', () => {
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i - 1].x + rects[i - 1].width).toBeLessThanOrEqual(rects[i].x);
    }
  });
});
