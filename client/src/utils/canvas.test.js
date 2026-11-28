// Locks for fitFontPx — the shrink-to-fit helper that keeps long localized
// titles/labels inside fixed-width canvas chrome (used by the mission-intro
// card title so the rebranded game names never clip in EL/NL/PT).
import { describe, it, expect } from 'vitest';
import { fitFontPx } from './canvas.js';

// Fake ctx: text width is proportional to font px × char count, so we can
// reason precisely about when a string stops fitting.
const makeCtx = () => {
  let px = 0;
  return {
    set font(v) { px = parseInt(v.match(/(\d+)px/)[1], 10); },
    get font() { return `${px}px`; },
    measureText: (t) => ({ width: t.length * px * 0.5 }),
  };
};

describe('fitFontPx', () => {
  it('keeps the start size when the text already fits', () => {
    const ctx = makeCtx();
    expect(fitFontPx(ctx, 'hello', 200, { start: 18, floor: 10 })).toBe(18);
  });

  it('shrinks the font so a long string fits the width', () => {
    const ctx = makeCtx();
    const px = fitFontPx(ctx, 'x'.repeat(40), 200, { start: 18, floor: 8 });
    expect(px).toBeLessThan(18);
    expect(40 * px * 0.5).toBeLessThanOrEqual(200);
  });

  it('never shrinks below the floor', () => {
    const ctx = makeCtx();
    expect(fitFontPx(ctx, 'x'.repeat(500), 50, { start: 18, floor: 9 })).toBe(9);
  });

  it('leaves ctx.font set to the chosen size for an immediate draw', () => {
    const ctx = makeCtx();
    const px = fitFontPx(ctx, 'x'.repeat(40), 200, { start: 18, floor: 8 });
    expect(ctx.font).toBe(`${px}px`);
  });
});
