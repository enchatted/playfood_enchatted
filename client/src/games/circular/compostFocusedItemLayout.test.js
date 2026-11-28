import { describe, expect, it } from 'vitest';
import { compostFocusedItemRegions, placeCompostFocusedItem } from './compostFocusedItemLayout.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
function geometry(width, height, dpr = 1) {
  const canvas = rect(0, 0, width, height);
  const k = Math.min(width * dpr / 1280, height * dpr / 704);
  return {
    wrapper: canvas, canvas, backingWidth: width * dpr, backingHeight: height * dpr,
    hidpi: { k, ox: (width * dpr - 1280 * k) / 2, oy: (height * dpr - 704 * k) / 2 },
    hud: rect(0, 0, width, 44),
    controls: [rect(15, height - 148, 128, 128), rect(width - 135, height - 106, 110, 90)],
  };
}
const overlap = (a, b) => a.left < b.right && a.left + a.width > b.left && a.top < b.bottom && a.top + a.textHeight > b.top;

describe('Compost focused item stays outside the fenced playfield', () => {
  it.each([1, 2])('chooses the side gutter on a short 844 screen at DPR%i', (dpr) => {
    const frame = geometry(844, 390, dpr);
    const placement = placeCompostFocusedItem(compostFocusedItemRegions(frame), () => 126);
    expect(placement.fits).toBe(true);
    expect(placement.kind).toBe('left');
    expect(placement.top).toBe(52);
    expect(placement.left).toBe(8);
    expect(placement.left + placement.width).toBeLessThan(156);
    expect(placement.top + placement.textHeight).toBeLessThan(234);
    for (const control of frame.controls) expect(overlap(placement, control)).toBe(false);
  });

  it('prefers the top letterbox on a 1024×768 screen when the complete name fits', () => {
    const placement = placeCompostFocusedItem(compostFocusedItemRegions(geometry(1024, 768)), () => 32);
    expect(placement.fits).toBe(true);
    expect(placement.kind).toBe('letterbox');
    expect(placement.top + placement.textHeight).toBeLessThan(96);
  });

  it('tries a side gutter when a top letterbox is too short for the full text', () => {
    const placement = placeCompostFocusedItem(compostFocusedItemRegions(geometry(1024, 768)), () => 86);
    expect(placement.fits).toBe(true);
    expect(placement.kind).toBe('left');
  });

  it('reserves the real touch control bounds before considering a side region', () => {
    const frame = geometry(844, 390);
    frame.controls.push(rect(10, 130, 130, 80));
    const placement = placeCompostFocusedItem(compostFocusedItemRegions(frame), () => 96);
    expect(placement.fits).toBe(true);
    expect(placement.kind).toBe('right');
    for (const control of frame.controls) expect(overlap(placement, control)).toBe(false);
  });

  it('keeps an unexpectedly oversized text complete and reports a failed fit', () => {
    const placement = placeCompostFocusedItem(compostFocusedItemRegions(geometry(844, 390)), () => 400);
    expect(placement.fits).toBe(false);
    expect(placement.textHeight).toBe(400);
  });

  it('uses the measured canvas origin rather than a viewport-width estimate', () => {
    const frame = geometry(844, 390);
    frame.wrapper = rect(75, 25, 844, 390);
    frame.canvas = rect(75, 25, 844, 390);
    frame.hud = rect(75, 25, 844, 44);
    frame.controls = frame.controls.map(({ left, top, width, height }) => rect(left + 75, top + 25, width, height));
    const placement = placeCompostFocusedItem(compostFocusedItemRegions(frame), () => 96);
    expect(placement.left).toBe(83);
    expect(placement.top).toBe(77);
    expect(placement.fits).toBe(true);
  });
});
