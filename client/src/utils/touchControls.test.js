// touchControls.test.js — device gate for touch control rendering.
// Landscape touch layouts show controls; portrait gameplay requests rotation.
import { describe, it, expect } from 'vitest';
import * as touchControls from './touchControls.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

const {
  getTouchControlCapabilities,
  getTouchControlPolicy,
  shouldShowTouchControls,
  TOUCH_CONTROLS_MIN_SHORT_SIDE,
} = touchControls;

describe('touchControls', () => {
  it('exports TOUCH_CONTROLS_MIN_SHORT_SIDE === 600', () => {
    expect(TOUCH_CONTROLS_MIN_SHORT_SIDE).toBe(600);
  });

  describe('shouldShowTouchControls', () => {
    it('shows controls on desktop without any touch evidence', () => {
      expect(shouldShowTouchControls({
        viewportWidth: 1920,
        viewportHeight: 1080,
        coarsePointer: false,
        touchSeen: false,
      })).toBe(true);
    });

    it('iPad landscape: 1024×768, coarse=true, touchSeen=false → true', () => {
      expect(shouldShowTouchControls({
        viewportWidth: 1024,
        viewportHeight: 768,
        coarsePointer: true,
        touchSeen: false,
      })).toBe(true);
    });

    it('iPad Mini portrait hides controls behind the rotate-device screen', () => {
      expect(shouldShowTouchControls({
        viewportWidth: 744,
        viewportHeight: 1133,
        coarsePointer: true,
        touchSeen: false,
      })).toBe(false);
    });

    it('Whiteboard (fine pointer + touch panel): 1920×1080, coarse=false, touchSeen=true → true', () => {
      expect(shouldShowTouchControls({
        viewportWidth: 1920,
        viewportHeight: 1080,
        coarsePointer: false,
        touchSeen: true,
      })).toBe(true);
    });

    it('Landscape phone: 844×390 shows controls', () => {
      expect(shouldShowTouchControls({
        viewportWidth: 844,
        viewportHeight: 390,
        coarsePointer: true,
        touchSeen: false,
      })).toBe(true);
    });

    it('Portrait phone, size wins over touch evidence: 390×844, coarse=true, touchSeen=true → false', () => {
      expect(shouldShowTouchControls({
        viewportWidth: 390,
        viewportHeight: 844,
        coarsePointer: true,
        touchSeen: true,
      })).toBe(false);
    });

    it('Landscape tablet boundary: exactly 600 short side → true', () => {
      expect(shouldShowTouchControls({
        viewportWidth: 800,
        viewportHeight: 600,
        coarsePointer: true,
        touchSeen: false,
      })).toBe(true);
    });

    it('Boundary: 599: 599×800, coarse=true → false', () => {
      expect(shouldShowTouchControls({
        viewportWidth: 599,
        viewportHeight: 800,
        coarsePointer: true,
        touchSeen: false,
      })).toBe(false);
    });

    it('touchSeen alone below threshold: 500×900, coarse=false, touchSeen=true → false', () => {
      expect(shouldShowTouchControls({
        viewportWidth: 500,
        viewportHeight: 900,
        coarsePointer: false,
        touchSeen: true,
      })).toBe(false);
    });
  });

  describe('getTouchControlPolicy', () => {
    it.each([
      [{ viewportWidth: 1024, viewportHeight: 768 }, true, 'compact-landscape', 'compact-viewport'],
      [{ viewportWidth: 1180, viewportHeight: 820 }, true, 'compact-landscape', 'compact-viewport'],
      [{ viewportWidth: 1280, viewportHeight: 720 }, true, 'compact-landscape', 'compact-viewport'],
      [{ viewportWidth: 1280, viewportHeight: 800 }, true, 'compact-landscape', 'compact-viewport'],
      [{ viewportWidth: 1366, viewportHeight: 768 }, true, 'standard', 'all-devices'],
      [{ viewportWidth: 1440, viewportHeight: 900 }, true, 'standard', 'all-devices'],
    ])(
      'classifies $viewportWidth×$viewportHeight without touch evidence',
      (viewport, visible, profile, reason) => {
        expect(getTouchControlPolicy({
          ...viewport,
          coarsePointer: false,
          anyCoarsePointer: false,
          touchSeen: false,
        })).toEqual({ visible, profile, reason });
      },
    );

    it('uses the same visible policy regardless of touch capability', () => {
      expect(getTouchControlPolicy({
        viewportWidth: 1920,
        viewportHeight: 1080,
        coarsePointer: false,
        anyCoarsePointer: true,
        touchSeen: false,
      })).toEqual({ visible: true, profile: 'standard', reason: 'all-devices' });

      expect(getTouchControlPolicy({
        viewportWidth: 1920,
        viewportHeight: 1080,
        coarsePointer: false,
        anyCoarsePointer: false,
        touchSeen: true,
      })).toEqual({ visible: true, profile: 'standard', reason: 'all-devices' });
    });

    it.each([
      [390, 844],
      [599, 900],
    ])('requests rotation for portrait phone %d×%d', (width, height) => {
      expect(getTouchControlPolicy({
        viewportWidth: width,
        viewportHeight: height,
        coarsePointer: true,
        anyCoarsePointer: true,
        touchSeen: true,
      })).toEqual({ visible: false, profile: 'phone-portrait', reason: 'portrait' });
    });

    it('hides tablet portrait behind the rotate treatment', () => {
      expect(getTouchControlPolicy({
        viewportWidth: 768,
        viewportHeight: 1024,
        coarsePointer: true,
        anyCoarsePointer: true,
        touchSeen: true,
      })).toEqual({ visible: false, profile: 'tablet-portrait', reason: 'portrait' });
    });
  });

  describe('classifyGameViewport', () => {
    it('classifies the agreed tablet, portrait and monitor viewports', () => {
      expect(typeof touchControls.classifyGameViewport).toBe('function');

      expect(touchControls.classifyGameViewport(1024, 768)).toBe('compact-landscape');
      expect(touchControls.classifyGameViewport(1180, 820)).toBe('compact-landscape');
      expect(touchControls.classifyGameViewport(1368, 912)).toBe('standard');
      expect(touchControls.classifyGameViewport(768, 1024)).toBe('tablet-portrait');
      expect(touchControls.classifyGameViewport(1280, 800)).toBe('compact-landscape');
      expect(touchControls.classifyGameViewport(1920, 1080)).toBe('standard');
      expect(touchControls.classifyGameViewport(844, 390)).toBe('phone-landscape');
    });
  });

  describe('getTouchControlLayout', () => {
    it('moves tablet controls into the bottom safe area', () => {
      expect(typeof touchControls.getTouchControlLayout).toBe('function');

      expect(touchControls.getTouchControlLayout('compact-landscape')).toEqual({
        dpadBottom: 12,
        dpadLeft: 12,
        dpadButtonSize: 52,
        dpadGap: 4,
        actionBottom: 60,
        actionRight: 20,
        actionButtonSize: 68,
        secondaryButtonSize: 52,
      });
    });

    it('keeps the existing monitor and desktop placement', () => {
      expect(typeof touchControls.getTouchControlLayout).toBe('function');

      expect(touchControls.getTouchControlLayout('standard')).toEqual({
        dpadBottom: 32,
        dpadLeft: 32,
        dpadButtonSize: 64,
        dpadGap: 4,
        actionBottom: 100,
        actionRight: 40,
        actionButtonSize: 80,
        secondaryButtonSize: 56,
      });
    });
  });

  describe('getTouchControlCapabilities', () => {
    it('exposes only controls with a real action on each shared screen', () => {
      expect(getTouchControlCapabilities('menu')).toEqual({
        movement: true, action: true, drop: false, back: false,
      });
      expect(getTouchControlCapabilities('island')).toEqual({
        movement: true, action: true, drop: false, back: true,
      });
    });

    it('mounts on the avatar screen with no buttons, so portrait still gets the rotate card', () => {
      expect(getTouchControlCapabilities('avatar')).toEqual({
        movement: false, action: false, drop: false, back: false,
      });
    });

    it('shows Drop only in active missions that implement Q', () => {
      expect(getTouchControlCapabilities('game', 'GardenPlanner').drop).toBe(true);
      expect(getTouchControlCapabilities('game', 'MealPlanner').drop).toBe(true);
      expect(getTouchControlCapabilities('game', 'CompostCreator').drop).toBe(true);
      expect(getTouchControlCapabilities('game', 'FoodRescue').drop).toBe(true);
      expect(getTouchControlCapabilities('game', 'CircularCity').drop).toBe(true);
      expect(getTouchControlCapabilities('game', 'WhereDoesItGrow').drop).toBe(false);
      expect(getTouchControlCapabilities('game', 'SeasonMatcher').drop).toBe(true);
      expect(getTouchControlCapabilities('game', 'MarketTrip').drop).toBe(true);
      expect(getTouchControlCapabilities('game', 'PlanetaryBoundaries').drop).toBe(false);
    });

    it('does not mount controls for inactive or pointer-only legacy missions', () => {
      expect(getTouchControlCapabilities('game', 'FoodMiles')).toBeNull();
      expect(getTouchControlCapabilities('result')).toBeNull();
    });
  });

  it('provides the rotate-device message in every supported language', () => {
    for (const locale of [en, el, nl, pt]) {
      expect(locale.game.rotate_device_title).toBeTruthy();
      expect(locale.game.rotate_device_body).toBeTruthy();
      expect(locale.touch.controls).toBeTruthy();
      expect(locale.touch.more_space).toBeTruthy();
    }
  });
});
