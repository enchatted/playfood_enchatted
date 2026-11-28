// touchControls.js — device gate for on-screen touch controls.
//
// Compact landscape layouts and interactive whiteboards should show on-screen
// controls, including landscape phones. This module stays browser-free so the
// responsive/device policy can be tested with literal viewport fixtures.
//
// Design decisions:
// - The 600px short-side boundary selects phone-sized controls, not exclusion.
//   Portrait gameplay requests rotation; landscape controls remain inside canvas.
// - Pointer type never controls visibility: desktop users also need the D-pad.

export const TOUCH_CONTROLS_MIN_SHORT_SIDE = 600; // CSS px — Android sw600dp "tablet" boundary
export const COMPACT_LANDSCAPE_MAX_WIDTH = 1280;
export const COMPACT_LANDSCAPE_MAX_HEIGHT = 900;

const SHARED_SCREEN_CAPABILITIES = Object.freeze({
  // Mouse/tap only: no buttons, but mounting the overlay gives it the portrait rotate card.
  avatar: Object.freeze({ movement: false, action: false, drop: false, back: false }),
  menu: Object.freeze({ movement: true, action: true, drop: false, back: false }),
  hub: Object.freeze({ movement: true, action: true, drop: false, back: true }),
  island: Object.freeze({ movement: true, action: true, drop: false, back: true }),
  lighthouse: Object.freeze({ movement: true, action: true, drop: false, back: true }),
});

const ACTIVE_GAME_MISSIONS = new Set([
  'WhereDoesItGrow',
  'GardenPlanner',
  'SoilDoctor',
  'SeasonMatcher',
  'MarketTrip',
  'SpotTheFake',
  'FridgeManager',
  'MealPlanner',
  'FoodRescue',
  'LeftoverChef',
  'CompostCreator',
  'CircularCity',
  'PlanetaryBoundaries',
]);

const DROP_GAME_MISSIONS = new Set([
  'SeasonMatcher',
  'MarketTrip', // B = back from a stall / the checkout without buying
  'SoilDoctor',
  'GardenPlanner',
  'FridgeManager',
  'MealPlanner',
  'FoodRescue',
  'LeftoverChef',
  'CompostCreator',
  'CircularCity',
]);

/**
 * Returns only controls that have a real action on the active screen/mission.
 * A null result means the global touch overlay must not mount there.
 */
export function getTouchControlCapabilities(screen, mission = null) {
  if (screen !== 'game') return SHARED_SCREEN_CAPABILITIES[screen] || null;
  if (!ACTIVE_GAME_MISSIONS.has(mission)) return null;
  return {
    movement: true,
    action: true,
    drop: DROP_GAME_MISSIONS.has(mission),
    back: mission === 'PlanetaryBoundaries',
  };
}

export function classifyGameViewport(viewportWidth, viewportHeight) {
  const shortSide = Math.min(viewportWidth, viewportHeight);
  if (shortSide < TOUCH_CONTROLS_MIN_SHORT_SIDE) {
    return viewportHeight > viewportWidth ? 'phone-portrait' : 'phone-landscape';
  }
  if (viewportHeight > viewportWidth) return 'tablet-portrait';
  if (
    viewportWidth <= COMPACT_LANDSCAPE_MAX_WIDTH
    && viewportHeight <= COMPACT_LANDSCAPE_MAX_HEIGHT
  ) {
    return 'compact-landscape';
  }
  return 'standard';
}

export function getTouchControlLayout(profile) {
  if (profile === 'phone-landscape') {
    return {
      dpadBottom: 8,
      dpadLeft: 8,
      dpadButtonSize: 44,
      dpadGap: 4,
      actionBottom: 50,
      actionRight: 12,
      actionButtonSize: 56,
      secondaryButtonSize: 44,
    };
  }
  if (profile === 'compact-landscape') {
    return {
      dpadBottom: 12,
      dpadLeft: 12,
      dpadButtonSize: 52,
      dpadGap: 4,
      actionBottom: 60,
      actionRight: 20,
      actionButtonSize: 68,
      secondaryButtonSize: 52,
    };
  }

  return {
    dpadBottom: 32,
    dpadLeft: 32,
    dpadButtonSize: 64,
    dpadGap: 4,
    actionBottom: 100,
    actionRight: 40,
    actionButtonSize: 80,
    secondaryButtonSize: 56,
  };
}

export function getTouchControlPolicy({
  viewportWidth,
  viewportHeight,
  coarsePointer = false,
  anyCoarsePointer = false,
  touchSeen = false,
}) {
  const profile = classifyGameViewport(viewportWidth, viewportHeight);

  if (profile === 'tablet-portrait' || profile === 'phone-portrait') {
    return { visible: false, profile, reason: 'portrait' };
  }
  if (profile === 'compact-landscape' || profile === 'phone-landscape') {
    return { visible: true, profile, reason: 'compact-viewport' };
  }
  return { visible: true, profile, reason: 'all-devices' };
}

export function shouldShowTouchControls(options) {
  return getTouchControlPolicy(options).visible;
}
