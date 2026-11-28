import { describe, expect, it } from 'vitest';
import { getTouchControlGeometry, getFittingTouchControlGeometry, getCanvasControlBounds } from './touchControlGeometry.js';

const capabilities = { movement: true, action: true, drop: true, back: false };
const input = {
  width: 1024, height: 563.2, profile: 'compact-landscape', capabilities,
};

describe('touch control occupied space', () => {
  it('matches the rendered directional grid and action/drop footprints', () => {
    const result = getTouchControlGeometry(input);
    expect(result.controls.dpad).toMatchObject({ left: 12, width: 164, height: 164 });
    expect(result.controls.dpad.top).toBeCloseTo(387.2);
    expect(result.controls.action).toMatchObject({ left: 936, width: 68, height: 68 });
    expect(result.controls.action.top).toBeCloseTo(435.2);
    expect(result.controls.drop).toMatchObject({ left: 868, width: 52, height: 52 });
    expect(result.controls.drop.top).toBeCloseTo(443.2);
    expect(result.controls.back).toBeNull();
    expect(result.safePlayRect.height).toBeCloseTo(375.2);
    expect(result.fits).toBe(true);
  });

  it('applies safe insets once and keeps the play rectangle above every control', () => {
    const result = getTouchControlGeometry({ ...input, insets: { left: 30, right: 20, top: 10, bottom: 24 } });
    expect(result.controls.dpad.left).toBe(42);
    expect(result.controls.action.left).toBe(916);
    expect(result.controls.dpad.top).toBeCloseTo(363.2);
    expect(result.safePlayRect.left).toBe(30);
    expect(result.safePlayRect.top).toBe(10);
    for (const rect of Object.values(result.controls).filter(Boolean)) {
      expect(result.safePlayRect.top + result.safePlayRect.height + 12).toBeLessThanOrEqual(rect.top + 0.001);
    }
  });

  it('does not reserve space for controls that are absent', () => {
    const result = getTouchControlGeometry({ ...input, capabilities: {} });
    expect(result.safePlayRect).toEqual({ left: 0, top: 0, width: 1024, height: 563.2 });
    expect(Object.values(result.controls).every(rect => rect === null)).toBe(true);
  });

  it('reports insufficient space instead of silently shrinking targets', () => {
    const result = getTouchControlGeometry({ ...input, width: 240, height: 120 });
    expect(result.fits).toBe(false);
    expect(result.controls.dpad.width).toBe(164);
    expect(result.safePlayRect.height).toBe(0);
  });

  it('includes Back only when available and recomputes after a resize', () => {
    const result = getTouchControlGeometry({ ...input, width: 1200, height: 700, capabilities: { action: true, back: true } });
    expect(result.controls.back).toEqual({ left: 1120, top: 508, width: 52, height: 52 });
    expect(result.safePlayRect.height).toBe(496);
  });
});

describe('in-canvas responsive controls', () => {
  it.each(['standard', 'compact-landscape', 'phone-landscape'])('keeps market controls in the same corners as other games in %s', profile => {
    const options = { width: 900, height: 500, profile, capabilities };
    const result = getTouchControlGeometry({ ...options, mission: 'MarketTrip' });
    expect(result.controls).toEqual(getTouchControlGeometry({ ...options, mission: 'SeasonMatcher' }).controls);
    expect(result.controls.dpad.top).toBeGreaterThan(250);
    expect(result.controls.action.top).toBeGreaterThan(250);
    expect(result.fits).toBe(true);
  });

  it('does not move other missions', () => {
    const phone = { width: 464, height: 256, profile: 'phone-landscape', capabilities };
    expect(getTouchControlGeometry({ ...phone, mission: 'FridgeManager' }).controls)
      .toEqual(getTouchControlGeometry(phone).controls);
  });

  it('fits phone controls inside the existing 844x330 canvas with readable targets', () => {
    const result = getFittingTouchControlGeometry({ ...input, width: 844, height: 330, profile: 'phone-landscape' });
    expect(result.fits).toBe(true);
    expect(result.layout.dpadButtonSize).toBe(44);
    for (const box of Object.values(result.controls).filter(Boolean)) {
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.left + box.width).toBeLessThanOrEqual(844);
      expect(box.top + box.height).toBeLessThanOrEqual(330);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  });

  it('falls back to smaller targets instead of overflowing a narrow canvas', () => {
    const result = getFittingTouchControlGeometry({ ...input, width: 320, height: 240, profile: 'standard' });
    expect(result.fits).toBe(true);
    expect(result.layout.dpadButtonSize).toBe(44);
  });

  it('reports impossible bounds rather than shrinking targets under 44px', () => {
    const result = getFittingTouchControlGeometry({ ...input, width: 180, height: 100 });
    expect(result.fits).toBe(false);
    expect(result.layout.dpadButtonSize).toBe(44);
  });

  it('clips the overlay to the visible canvas, accounting for safe areas only once', () => {
    const canvas = { left: 0, top: 60, width: 844, height: 350 };
    const result = getCanvasControlBounds({ canvas, stage: { left: 0, top: 0 },
      viewport: { left: 0, top: 0, width: 844, height: 390 },
      insets: { left: 30, right: 20, top: 0, bottom: 10 } });
    expect(result).toEqual({ left: 30, top: 60, width: 794, height: 320 });
    expect(canvas).toEqual({ left: 0, top: 60, width: 844, height: 350 });
  });

  it('does not double-pad a canvas already inside viewport safe areas', () => {
    expect(getCanvasControlBounds({ canvas: { left: 50, top: 70, width: 700, height: 280 },
      stage: { left: 10, top: 20 }, viewport: { left: 0, top: 0, width: 844, height: 390 },
      insets: { left: 30, right: 20, bottom: 10 } })).toEqual({ left: 40, top: 50, width: 700, height: 280 });
  });
});
