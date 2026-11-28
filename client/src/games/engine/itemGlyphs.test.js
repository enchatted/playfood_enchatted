import { describe, it, expect, vi } from 'vitest';
import {
  hasDrawnIcon, drawItemGlyph, itemTextLabel, MILK_CARTON_SVG, MILK_CARTON_DATA_URL,
} from './itemGlyphs.js';
import { fitBinLabel, binLabelText } from './compostCreatorRenderer.js';

// A recording ctx: measureText = 6 px per character at 10 px, scaled linearly by font size.
function fakeCtx() {
  const calls = [];
  const ctx = {
    font: '10px sans-serif', textBaseline: 'alphabetic', fillStyle: '#000', strokeStyle: '#000',
    lineWidth: 1, lineJoin: 'miter',
    measureText(t) { const px = Number((/(\d+)px/.exec(this.font) || [0, 10])[1]); return { width: t.length * 0.6 * px }; },
  };
  for (const m of ['save', 'restore', 'translate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'arc']) {
    ctx[m] = vi.fn((...a) => calls.push([m, ...a]));
  }
  ctx.fillText = vi.fn((...a) => calls.push(['fillText', ...a]));
  return { ctx, calls };
}

describe('itemGlyphs — the drawn milk carton', () => {
  const milk = { id: 'milk_carton', emoji: '🧃', icon: 'milkCarton' };
  const juice = { id: 'juice_box', emoji: '🧃' };

  it('draws the vector icon, not text, for an item with a drawn icon', () => {
    const { ctx, calls } = fakeCtx();
    drawItemGlyph(ctx, milk, 100, 50, 24);
    expect(calls.some((c) => c[0] === 'fillText')).toBe(false);
    expect(calls.filter((c) => c[0] === 'fill').length).toBeGreaterThanOrEqual(8);
  });

  it('falls back to the emoji for every other item, at the same font size', () => {
    const { ctx } = fakeCtx();
    drawItemGlyph(ctx, juice, 100, 50, 18, 'bottom');
    expect(ctx.fillText).toHaveBeenCalledWith('🧃', 100, 50);
    expect(ctx.font).toBe('18px sans-serif');
    expect(ctx.textBaseline).toBe('bottom');
  });

  it('a bottom baseline lifts the icon by half its size, like the emoji it replaces', () => {
    const { ctx, calls } = fakeCtx();
    drawItemGlyph(ctx, milk, 100, 50, 20, 'bottom');
    const t = calls.find((c) => c[0] === 'translate');
    expect(t[1]).toBeCloseTo(100 - 10);
    expect(t[2]).toBeCloseTo(40 - 10);
  });

  it('prompts never pair the milk carton name with another object\'s emoji', () => {
    expect(itemTextLabel(milk, 'Κουτί γάλακτος')).toBe('Κουτί γάλακτος');
    expect(itemTextLabel(juice, 'Κουτί χυμού')).toBe('🧃 Κουτί χυμού');
    expect(hasDrawnIcon(milk)).toBe(true);
    expect(hasDrawnIcon(juice)).toBe(false);
    expect(hasDrawnIcon({ icon: 'unknown' })).toBe(false);
  });

  it('the DOM pill gets the same picture as SVG', () => {
    expect(MILK_CARTON_SVG).toMatch(/^<svg[^>]+viewBox="0 0 32 32"/);
    expect((MILK_CARTON_SVG.match(/<polygon/g) || []).length).toBe(7);
    expect(MILK_CARTON_DATA_URL.startsWith('data:image/svg+xml;utf8,')).toBe(true);
  });
});

describe('Season Matcher produce without faithful emoji', () => {
  it.each([
    ['asparagus', '🌱', 'Σπαράγγι'],
    ['leek', '🧅', 'Πράσο'],
    ['cabbage', '🥬', 'Λάχανο'],
  ])('draws %s instead of its misleading fallback and keeps text labels accurate', (id, emoji, name) => {
    const item = { id, emoji };
    const { ctx, calls } = fakeCtx();
    drawItemGlyph(ctx, item, 100, 50, 24);
    expect(calls.some(([kind]) => kind === 'fillText')).toBe(false);
    expect(calls.filter(([kind]) => kind === 'fill').length).toBeGreaterThan(2);
    expect(itemTextLabel(item, name)).toBe(name);
  });
});

describe('fitBinLabel — two-line bin labels for the drink-carton group', () => {
  // bin width 64 → maxW 56 (as in renderCompostBins)
  const fit = (label) => fitBinLabel(fakeCtx().ctx, label, 56);

  it('short labels stay on one line at the largest size that fits', () => {
    expect(fit('ΧΑΡΤΙ')).toMatchObject({ lines: ['ΧΑΡΤΙ'], size: 12 });
  });

  it('a one-word label with no break point keeps the original single-line shrink', () => {
    const r = fit('ALUMINIUMXX'); // 11 chars: 59.4 px at 9 → 52.8 at 8
    expect(r.lines).toEqual(['ALUMINIUMXX']);
    expect(r.size).toBe(8);
  });

  it('two words wrap onto two lines instead of shrinking below 10 px', () => {
    expect(fit('PACOTES DE BEBIDA')).toMatchObject({ lines: ['PACOTES', 'DE BEBIDA'] });
    expect(fit('ΚΟΥΤΙΑ ΠΟΤΩΝ').lines).toEqual(['ΚΟΥΤΙΑ', 'ΠΟΤΩΝ']);
    expect(fit('PACOTES DE BEBIDA').size).toBeGreaterThanOrEqual(9);
  });

  it('a soft hyphen breaks a compound with a visible hyphen, and is invisible elsewhere', () => {
    expect(fit('DRANK­KARTONS').lines).toEqual(['DRANK-', 'KARTONS']);
    expect(binLabelText('DRANK­KARTONS')).toBe('DRANKKARTONS');
    expect(fitBinLabel(fakeCtx().ctx, 'DRANK­KARTONS', 200).lines).toEqual(['DRANKKARTONS']);
  });
});
