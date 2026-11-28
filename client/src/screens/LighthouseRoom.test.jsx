import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as LighthouseModule from './LighthouseRoom.jsx';
import * as LighthouseRenderer from '../overworld/lighthouseRoomRenderer.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

function translateFrom(locale) {
  return (key) => key.split('.').reduce((value, part) => value?.[part], locale);
}

describe('lighthouse onboarding flow', () => {
  it('uses the same 1.5x room camera as the walk-around games', () => {
    const toCanvas = LighthouseModule.getLighthouseCanvasPoint;

    expect(toCanvas).toBeTypeOf('function');
    expect(toCanvas?.(640, 352)).toEqual({ x: 640, y: 352 });
    expect(toCanvas?.(320, 112)).toEqual({ x: 160, y: -8 });
  });

  it('keeps canvas focus disabled while the onboarding owns the keyboard', () => {
    const shouldFocusCanvas = LighthouseModule.shouldFocusLighthouseCanvas;

    expect(shouldFocusCanvas).toBeTypeOf('function');
    expect(shouldFocusCanvas?.(true, true)).toBe(false);
    expect(shouldFocusCanvas?.(true, false)).toBe(true);
    expect(shouldFocusCanvas?.(false, false)).toBe(false);
  });

  it('opens at the first step for a new player and stays closed after it was seen', () => {
    const createState = LighthouseModule.createLighthouseOnboardingState;

    expect(createState).toBeTypeOf('function');
    expect(createState?.(false)).toEqual({ open: true, step: 0 });
    expect(createState?.(true)).toEqual({ open: false, step: 0 });
  });

  it('advances through all three steps and completes only after the last one', () => {
    const reduceState = LighthouseModule.reduceLighthouseOnboarding;
    let state = { open: true, step: 0 };

    expect(reduceState).toBeTypeOf('function');
    state = reduceState?.(state, { type: 'next' });
    expect(state).toEqual({ open: true, step: 1 });
    state = reduceState?.(state, { type: 'next' });
    expect(state).toEqual({ open: true, step: 2 });
    state = reduceState?.(state, { type: 'next' });
    expect(state).toEqual({ open: false, step: 2 });
  });

  it('supports going back and skipping without leaving the step range', () => {
    const reduceState = LighthouseModule.reduceLighthouseOnboarding;

    expect(reduceState?.({ open: true, step: 0 }, { type: 'back' }))
      .toEqual({ open: true, step: 0 });
    expect(reduceState?.({ open: true, step: 1 }, { type: 'back' }))
      .toEqual({ open: true, step: 0 });
    expect(reduceState?.({ open: true, step: 1 }, { type: 'skip' }))
      .toEqual({ open: false, step: 1 });
  });

  it('renders an accessible dialog with touch-friendly navigation controls', () => {
    const Onboarding = LighthouseModule.LighthouseOnboarding;
    const steps = [
      { symbol: '1', title: 'Meet the Keeper', body: 'Walk up and talk.' },
      { symbol: '2', title: 'Explore', body: 'See what you unlocked.' },
      { symbol: '3', title: 'Choose', body: 'Find your next island.' },
    ];

    expect(Onboarding).toBeTypeOf('function');

    const html = Onboarding
      ? renderToStaticMarkup(
          <Onboarding
            step={0}
            steps={steps}
            labels={{ eyebrow: 'Your lighthouse', skip: 'Skip', back: 'Back', next: 'Next', finish: 'Explore', hint: 'Enter to continue' }}
            onNext={() => {}}
            onBack={() => {}}
            onSkip={() => {}}
          />,
        )
      : '';

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('data-onboarding-step="1-of-3"');
    expect(html).toContain('Meet the Keeper');
    expect(html).toContain('>Skip<');
    expect(html).toContain('>Next');
  });

  it('shows the real touch action key and one child-sized action per line', () => {
    const Onboarding = LighthouseModule.LighthouseOnboarding;
    const buildSteps = LighthouseModule.buildLighthouseOnboardingSteps;

    expect(buildSteps).toBeTypeOf('function');
    const steps = buildSteps?.(translateFrom(el)) || [];
    const html = renderToStaticMarkup(
      <Onboarding
        step={0}
        steps={steps}
        labels={{ eyebrow: 'Ο Φάρος σου', skip: 'Παράλειψη', back: 'Πίσω', next: 'Επόμενο', finish: 'Εξερεύνησε', hint: 'Enter ή Space για συνέχεια' }}
        onNext={() => {}}
        onBack={() => {}}
        onSkip={() => {}}
      />,
    );

    expect(html).toContain('data-onboarding-symbol="action"');
    expect(html).not.toContain('👋');
    expect((html.match(/data-instruction-line=/g) || [])).toHaveLength(3);
    expect(html).toContain('<kbd');
    expect(html).toContain('>Enter</kbd>');
    expect(html).toContain('>Space</kbd>');
    expect(html).toContain('>A</kbd>');
  });

  it('explains sources and the activity code as separate ideas without a fixed reward amount', () => {
    const Onboarding = LighthouseModule.LighthouseOnboarding;
    const buildSteps = LighthouseModule.buildLighthouseOnboardingSteps;
    const steps = buildSteps?.(translateFrom(el)) || [];
    const html = renderToStaticMarkup(
      <Onboarding
        step={1}
        steps={steps}
        labels={{ eyebrow: 'Ο Φάρος σου', skip: 'Παράλειψη', back: 'Πίσω', next: 'Επόμενο', finish: 'Εξερεύνησε', hint: 'Enter ή Space για συνέχεια' }}
        onNext={() => {}}
        onBack={() => {}}
        onSkip={() => {}}
      />,
    );

    expect(html).toContain('data-instruction-section="library"');
    expect(html).toContain('data-instruction-section="activity-code"');
    expect(html).toContain('Κωδικός δραστηριότητας');
    expect(html).toContain('Έχεις κωδικό; Πήγαινε στο κόκκινο γραμματοκιβώτιο κάτω δεξιά.');
    expect(html).not.toMatch(/50\s*πόντ/);
  });
});

describe('lighthouse keeper artwork', () => {
  it('uses the dedicated keeper frames instead of rebuilding a generic villager', () => {
    const keeperFrames = [{ id: 'keeper-idle-a' }, { id: 'keeper-idle-b' }];
    const genericFrames = [[{ id: 'generic-villager' }]];
    const atlas = {
      lighthouseKeeper: keeperFrames,
      ambientNPC: { build: () => genericFrames },
    };

    expect(LighthouseModule.getLighthouseKeeperSprites).toBeTypeOf('function');
    expect(LighthouseModule.getLighthouseKeeperSprites?.(atlas)).toBe(keeperFrames);
  });
});

describe('lighthouse island labels', () => {
  it.each([
    ['en', en, { growing: 'Magic Garden', local: 'Seasons', foodwaste: 'Green Rescue', circular: 'Earth Protectors' }],
    ['el', el, { growing: 'Μαγικός Κήπος', local: 'Εποχές', foodwaste: 'Πράσινη Διάσωση', circular: 'Προστάτες της Γης' }],
    ['nl', nl, { growing: 'Magische Tuin', local: 'Seizoenen', foodwaste: 'Groene Redding', circular: 'Aardebeschermers' }],
    ['pt', pt, { growing: 'Jardim Mágico', local: 'Estações', foodwaste: 'Resgate Verde', circular: 'Protetores da Terra' }],
  ])('uses the canonical short island names in %s', (_language, locale, expected) => {
    const labels = LighthouseModule.buildLighthouseIslandShortNames?.(translateFrom(locale));

    expect(labels).toEqual(expected);
  });
});

describe('lighthouse postbox pointer target', () => {
  it('keeps activity codes accessible after completing all missions', () => {
    const state = { nearQR: true, allComplete: true };
    expect(LighthouseModule.shouldOpenLighthousePostbox(state)).toBe(true);
    expect(LighthouseRenderer.getLighthousePromptKind(state)).toBe('qr');
    expect(LighthouseModule.shouldOpenLighthousePostboxFromPointer({ x: 1000, y: 640 }, state)).toBe(true);
  });

  it.each(['keeperDialog', 'bookOpen', 'ceremony', 'irisClosing'])('blocks both inputs during %s', (field) => {
    const state = { nearQR: true, [field]: true };
    expect(LighthouseModule.shouldOpenLighthousePostbox(state)).toBe(false);
    expect(LighthouseModule.shouldOpenLighthousePostboxFromPointer({ x: 1000, y: 640 }, state)).toBe(false);
  });

  it('maps the postbox tile through the Lighthouse 1.5x camera', () => {
    expect(LighthouseModule.getLighthousePostboxRect?.()).toEqual({
      x: 976,
      y: 616,
      width: 48,
      height: 48,
    });
  });

  it('opens only for a nearby child pointing inside the postbox target', () => {
    const canOpen = LighthouseModule.shouldOpenLighthousePostboxFromPointer;
    const readyState = {
      nearQR: true,
      allComplete: false,
      irisClosing: false,
      keeperDialog: null,
      bookOpen: null,
      ceremony: null,
    };

    expect(canOpen?.({ x: 1000, y: 640 }, readyState, false)).toBe(true);
    expect(canOpen?.({ x: 900, y: 640 }, readyState, false)).toBe(false);
    expect(canOpen?.({ x: 1000, y: 640 }, { ...readyState, nearQR: false }, false)).toBe(false);
    expect(canOpen?.({ x: 1000, y: 640 }, readyState, true)).toBe(false);
  });
});

describe('lighthouse browser-test state bridge', () => {
  it('exposes the exact live state ref on the development canvas and removes it on cleanup', () => {
    const canvas = {};
    const stateRef = { current: { player: { col: 3, row: 4 } } };
    const exposeState = LighthouseModule.exposeLighthouseStateForTesting;

    expect(exposeState).toBeTypeOf('function');
    const cleanup = exposeState?.(canvas, stateRef, true);

    expect(canvas._stateRef).toBe(stateRef);
    stateRef.current.player.col = 5;
    expect(canvas._stateRef.current.player.col).toBe(5);

    cleanup?.();
    expect(canvas).not.toHaveProperty('_stateRef');
  });

  it('keeps a newer state-ref bridge when an older bridge cleans up', () => {
    const canvas = {};
    const stateRefA = { current: { player: { col: 3, row: 4 } } };
    const stateRefB = { current: { player: { col: 5, row: 6 } } };
    const exposeState = LighthouseModule.exposeLighthouseStateForTesting;

    const cleanupA = exposeState(canvas, stateRefA, true);
    const cleanupB = exposeState(canvas, stateRefB, true);

    cleanupA();
    expect(canvas._stateRef).toBe(stateRefB);

    cleanupB();
    expect(canvas).not.toHaveProperty('_stateRef');
  });

  it('does not expose state or register cleanup outside development', () => {
    const canvas = {};
    const stateRef = { current: { player: { col: 3, row: 4 } } };

    const cleanup = LighthouseModule.exposeLighthouseStateForTesting(canvas, stateRef, false);

    expect(cleanup).toBeUndefined();
    expect(canvas).not.toHaveProperty('_stateRef');
  });
});

describe('lighthouse shipyard interaction', () => {
  it('opens only while the child faces the station and no overlay owns input', () => {
    const canOpen = LighthouseModule.shouldOpenLighthouseShipyard;

    expect(canOpen).toBeTypeOf('function');
    expect(canOpen?.({ nearShipyard: true }, false)).toBe(true);
    expect(canOpen?.({ nearShipyard: false }, false)).toBe(false);
    expect(canOpen?.({ nearShipyard: true }, true)).toBe(false);
    expect(canOpen?.({ nearShipyard: true, keeperDialog: {} }, false)).toBe(false);
    expect(canOpen?.({ nearShipyard: true, bookOpen: {} }, false)).toBe(false);
    expect(canOpen?.({ nearShipyard: true, ceremony: {} }, false)).toBe(false);
  });

  it('allows a direct pointer or touch press on the published station target', () => {
    const canOpenFromPointer = LighthouseModule.shouldOpenLighthouseShipyardFromPointer;
    const state = {
      nearShipyard: false,
      shipyardHitRect: { x: 352, y: 520, width: 144, height: 96 },
    };

    expect(canOpenFromPointer).toBeTypeOf('function');
    expect(canOpenFromPointer?.({ x: 424, y: 568 }, state, false)).toBe(true);
    expect(canOpenFromPointer?.({ x: 200, y: 568 }, state, false)).toBe(false);
    expect(canOpenFromPointer?.({ x: 424, y: 568 }, state, true)).toBe(false);
  });

  it('keeps the approved prompt priority around the shipyard', () => {
    const promptKind = LighthouseRenderer.getLighthousePromptKind;

    expect(promptKind).toBeTypeOf('function');
    expect(promptKind?.({ nearKeeper: true, nearShipyard: true })).toBe('keeper');
    expect(promptKind?.({ nearBookshelf: true, nearShipyard: true })).toBe('bookshelf');
    expect(promptKind?.({ nearShipyard: true, nearQR: true })).toBe('shipyard');
    expect(promptKind?.({ nearQR: true })).toBe('qr');
    expect(promptKind?.({ onExit: true })).toBe('exit');
    expect(promptKind?.({ bookOpen: {} })).toBeNull();
  });

  it('publishes the camera-mapped hit target and draws the current real boat sprite', () => {
    const renderShipyard = LighthouseRenderer.renderLighthouseShipyard;
    const tierTwoModel = { id: 'tier-two-down', width: 32, height: 32 };
    const boats = Array.from({ length: 4 }, () => (
      Array.from({ length: 4 }, () => [{ width: 32, height: 32 }])
    ));
    boats[2][0][0] = tierTwoModel;
    const drawImageCalls = [];
    const ctx = {
      imageSmoothingEnabled: true,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      save() {},
      restore() {},
      fillRect() {},
      strokeRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      drawImage(...args) { drawImageCalls.push(args); },
      getTransform() {
        return { a: 1.5, b: 0, c: 0, d: 1.5, e: -320, f: -176 };
      },
    };
    const state = { shipyardSparkleUntil: 0 };
    const toCanvas = (x, y) => ({ x: 640 + (x - 640) * 1.5, y: 352 + (y - 352) * 1.5 });

    expect(renderShipyard).toBeTypeOf('function');
    renderShipyard?.(ctx, state, { boats }, 2, 10, toCanvas);

    expect(state.shipyardHitRect).toEqual({ x: 352, y: 520, width: 144, height: 96 });
    expect(state.shipyardVisualRect).toEqual({ x: 352, y: 520, width: 144, height: 96 });
    expect(drawImageCalls.some(([sprite]) => sprite === tierTwoModel)).toBe(true);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });
});
