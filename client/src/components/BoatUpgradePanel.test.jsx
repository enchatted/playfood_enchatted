import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/index.js';
import BoatUpgradePanel, {
  executeBoatPurchase,
  getBoatPanelLayout,
  getBoatPanelKeyAction,
  getBoatPreviewScale,
  installBoatPanelKeyboardOwner,
  nextBoatTier,
  trapBoatPanelFocus,
} from './BoatUpgradePanel.jsx';
import { createBlockingOverlayRegistration } from './ActiveCanvasStage.jsx';
import { releaseTouchControlsWhenBlocked } from './TouchDpad.jsx';
import GameContainer from './GameContainer.jsx';
import useGameStore from '../store/gameStore.js';

vi.mock('../screens/LighthouseRoom.jsx', () => ({ default: () => null }));
vi.mock('../screens/LanguageSelector.jsx', () => ({ default: () => null }));

function makeBoatSprites() {
  return Array.from({ length: 5 }, (_, tier) => (
    Array.from({ length: 4 }, () => [{ width: 32, height: 32, tier }])
  ));
}

describe('BoatUpgradePanel', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the canvas-anchored accessible carousel contract', () => {
    const markup = renderToStaticMarkup(
      <BoatUpgradePanel
        boatTier={0}
        points={500}
        boatSprites={makeBoatSprites()}
        onPurchase={() => ({ success: true, tier: 2 })}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('data-testid="boat-upgrade-panel"');
    expect(markup).toContain('data-testid="boat-preview"');
    expect(markup).toContain('data-testid="boat-previous"');
    expect(markup).toContain('data-testid="boat-next"');
    expect(markup).toContain('data-testid="boat-purchase"');
    expect(markup).toMatch(/data-testid="boat-close"[^>]*data-key="q"/);
    expect(markup).toContain('class="pf-shipyard-close-badge"');
    expect(markup).toContain('class="pf-shipyard-close-label"');
    expect(markup).toContain('data-testid="boat-controls-guide"');
    expect(markup).toContain('Change boat');
    expect(markup).toContain('Buy');
    expect(markup).toContain('Close');
    expect(markup).toContain('aria-label="Previous boat"');
    expect(markup).toContain('aria-label="Next boat"');
    expect(markup).toContain('aria-label="Close"');
    expect(markup).toContain('aria-label="Preview: Starter Boat"');
    expect(markup).toMatch(
      /data-testid="boat-upgrade-panel"[^>]*data-boat-state="current"/,
    );
    expect(markup).toContain('500');
    expect(markup).not.toContain('🚤');
    expect(markup).not.toContain('⛵');
  });

  it('wraps carousel navigation across all five boat tiers', () => {
    expect(nextBoatTier(4, 1)).toBe(0);
    expect(nextBoatTier(0, -1)).toBe(4);
    expect(nextBoatTier(1, 1)).toBe(2);
  });

  it('renders the fifth guardian position and its catalogue details', () => {
    const markup = renderToStaticMarkup(
      <BoatUpgradePanel
        boatTier={4}
        points={0}
        boatSprites={makeBoatSprites()}
        onPurchase={() => ({ success: false })}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain('Boat 5 of 5');
    expect(markup).toContain('Ocean Guardian');
    expect(markup).toContain('Carries 18 litter items.');
    const progressMarkup = markup.match(
      /<div class="pf-shipyard-progress"[^>]*>(.*?)<\/div>/,
    )?.[1] || '';
    expect(progressMarkup.match(/<span/g)).toHaveLength(5);
  });

  it('maps keyboard input without double-activating focused buttons', () => {
    expect(getBoatPanelKeyAction('ArrowLeft', 'DIV', true)).toBe('previous');
    expect(getBoatPanelKeyAction('ArrowRight', 'DIV', true)).toBe('next');
    expect(getBoatPanelKeyAction('Escape', 'BUTTON', true)).toBe('close');
    expect(getBoatPanelKeyAction('Enter', 'DIV', true)).toBe('purchase');
    expect(getBoatPanelKeyAction(' ', 'DIV', true)).toBe('purchase');
    expect(getBoatPanelKeyAction('Enter', 'BUTTON', true)).toBeNull();
    expect(getBoatPanelKeyAction(' ', 'BUTTON', true)).toBeNull();
    expect(getBoatPanelKeyAction('Enter', 'DIV', false)).toBeNull();
    expect(getBoatPanelKeyAction('q', 'DIV', false, 'KeyQ')).toBe('close');
    expect(getBoatPanelKeyAction('Q', 'BUTTON', true, 'KeyQ')).toBe('close');
  });

  it('owns modal keys in capture phase and removes the exact listener registration', () => {
    const windowObject = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const onBrowse = vi.fn();
    const onPurchase = vi.fn();
    const onClose = vi.fn();
    const cleanup = installBoatPanelKeyboardOwner({
      windowObject,
      purchaseEnabled: true,
      onBrowse,
      onPurchase,
      onClose,
    });
    const [eventName, listener, options] = windowObject.addEventListener.mock.calls[0];
    const makeEvent = ({ key, code = key, action, tagName = 'DIV' }) => ({
      key,
      code,
      target: {
        tagName,
        dataset: action ? { shipyardAction: action } : {},
      },
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    });

    expect(eventName).toBe('keydown');
    expect(options).toEqual({ capture: true });

    const right = makeEvent({ key: 'ArrowRight' });
    listener(right);
    expect(onBrowse).toHaveBeenCalledWith(1);
    expect(right.preventDefault).toHaveBeenCalledOnce();
    expect(right.stopImmediatePropagation).toHaveBeenCalledOnce();

    const focusedPrevious = makeEvent({
      key: 'Enter',
      action: 'previous',
      tagName: 'BUTTON',
    });
    listener(focusedPrevious);
    expect(onBrowse).toHaveBeenLastCalledWith(-1);
    expect(onPurchase).not.toHaveBeenCalled();

    const purchase = makeEvent({ key: ' ', code: 'Space' });
    listener(purchase);
    expect(onPurchase).toHaveBeenCalledOnce();

    for (const event of [
      makeEvent({ key: 'Escape' }),
      makeEvent({ key: 'q', code: 'KeyQ' }),
      makeEvent({ key: 'Q', code: 'KeyQ' }),
    ]) {
      listener(event);
      expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    }
    expect(onClose).toHaveBeenCalledTimes(3);

    cleanup();
    expect(windowObject.removeEventListener).toHaveBeenCalledWith(
      'keydown',
      listener,
      options,
    );
  });

  it('consumes owned keys even when purchase is unavailable', () => {
    const windowObject = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const onPurchase = vi.fn();
    installBoatPanelKeyboardOwner({
      windowObject,
      purchaseEnabled: false,
      onBrowse: vi.fn(),
      onPurchase,
      onClose: vi.fn(),
    });
    const listener = windowObject.addEventListener.mock.calls[0][1];
    const event = {
      key: 'Enter',
      code: 'Enter',
      target: { tagName: 'DIV', dataset: {} },
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };

    listener(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(onPurchase).not.toHaveBeenCalled();
  });

  it('guards purchases by state and by an in-flight callback', () => {
    const purchaseInFlightRef = { current: false };
    const onPurchase = vi.fn(() => ({ success: true, tier: 1 }));
    const onSuccess = vi.fn();

    expect(executeBoatPurchase({
      purchaseEnabled: false,
      purchaseInFlightRef,
      targetTier: 1,
      onPurchase,
      onSuccess,
    })).toBeNull();
    expect(onPurchase).not.toHaveBeenCalled();

    purchaseInFlightRef.current = true;
    expect(executeBoatPurchase({
      purchaseEnabled: true,
      purchaseInFlightRef,
      targetTier: 1,
      onPurchase,
      onSuccess,
    })).toBeNull();
    expect(onPurchase).not.toHaveBeenCalled();

    purchaseInFlightRef.current = false;
    expect(executeBoatPurchase({
      purchaseEnabled: true,
      purchaseInFlightRef,
      targetTier: 1,
      onPurchase,
      onSuccess,
    })).toEqual({ success: true, tier: 1 });
    expect(onPurchase).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledWith({ success: true, tier: 1 });
    expect(purchaseInFlightRef.current).toBe(false);
  });

  it('traps focus across enabled shipyard controls', () => {
    const previous = { focus: vi.fn() };
    const next = { focus: vi.fn() };
    const close = { focus: vi.fn() };
    const controls = [previous, next, close];
    const panel = { querySelectorAll: vi.fn(() => controls) };
    const makeEvent = (shiftKey = false) => ({
      key: 'Tab',
      shiftKey,
      preventDefault: vi.fn(),
    });

    const forward = makeEvent();
    trapBoatPanelFocus(forward, panel, { activeElement: close });
    expect(forward.preventDefault).toHaveBeenCalledOnce();
    expect(previous.focus).toHaveBeenCalledOnce();

    const backward = makeEvent(true);
    trapBoatPanelFocus(backward, panel, { activeElement: previous });
    expect(backward.preventDefault).toHaveBeenCalledOnce();
    expect(close.focus).toHaveBeenCalledOnce();

    const fromTitle = makeEvent();
    trapBoatPanelFocus(fromTitle, panel, { activeElement: {} });
    expect(previous.focus).toHaveBeenCalledTimes(2);
  });

  it('fits the panel contract inside the real short Lighthouse surfaces', () => {
    const smallest = getBoatPanelLayout(800, 440);
    const tablet = getBoatPanelLayout(1024, 563);

    for (const [layout, width, height] of [
      [smallest, 800, 440],
      [tablet, 1024, 563],
    ]) {
      expect(layout.mode).toBe('compact-height');
      expect(layout.inset).toBeGreaterThanOrEqual(16);
      expect(layout.panelWidth).toBeLessThanOrEqual(width - (layout.inset * 2));
      expect(layout.panelHeight).toBeLessThanOrEqual(height - (layout.inset * 2));
      expect(layout.arrowSize).toBeGreaterThanOrEqual(56);
      expect(layout.purchaseHeight).toBeGreaterThanOrEqual(52);
      expect(layout.previewBayHeight).toBeGreaterThanOrEqual(200);
      expect(layout.bodyContentHeight).toBeGreaterThanOrEqual(294);
    }
  });

  it('uses only positive integer preview scales', () => {
    expect(getBoatPreviewScale(176, 32, 32)).toBe(5);
    expect(getBoatPreviewScale(128, 32, 32)).toBe(4);
    expect(getBoatPreviewScale(12, 32, 32)).toBe(1);
  });
});

describe('blocking canvas overlays', () => {
  it('puts the active screen and shared touch controls under the stage provider', () => {
    const originalState = useGameStore.getState();
    useGameStore.setState({
      currentScreen: 'lighthouse',
      navigationData: {},
    });

    try {
      const markup = renderToStaticMarkup(<GameContainer />);
      expect(markup).toContain('data-testid="active-canvas-stage"');
    } finally {
      useGameStore.setState(originalState, true);
    }
  });

  it('reference-counts each registration and releases it at most once', () => {
    let count = 0;
    const setCount = (update) => { count = update(count); };
    const release = createBlockingOverlayRegistration(setCount);

    expect(count).toBe(1);
    release();
    release();
    expect(count).toBe(0);
  });

  it('releases held touch keys only when a blocking overlay opens', () => {
    const releaseAllKeys = vi.fn();

    releaseTouchControlsWhenBlocked(false, releaseAllKeys);
    expect(releaseAllKeys).not.toHaveBeenCalled();
    releaseTouchControlsWhenBlocked(true, releaseAllKeys);
    expect(releaseAllKeys).toHaveBeenCalledOnce();
  });
});
