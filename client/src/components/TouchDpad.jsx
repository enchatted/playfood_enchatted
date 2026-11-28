import React, {
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getTouchControlPolicy } from '../utils/touchControls.js';
import { getFittingTouchControlGeometry, getCanvasControlBounds } from '../utils/touchControlGeometry.js';
import {
  useActiveCanvasStage,
  useBlockingCanvasOverlayOpen,
} from './ActiveCanvasStage.jsx';

// ─── Session-sticky touch evidence (module scope) ──────────────────────
//
// A single one-shot `touchstart` listener, registered at module load (not
// inside the component) so a touch on the language/avatar screens — before
// this component ever mounts — is still captured. Once true, it stays true
// for the session; there is no reset logic because the flag itself never
// resets.
let touchSeen = false;
const touchSeenSubscribers = new Set();

function notifyTouchSeen() {
  for (const cb of touchSeenSubscribers) cb();
}

if (typeof window !== 'undefined') {
  const onFirstTouch = () => {
    touchSeen = true;
    window.removeEventListener('touchstart', onFirstTouch, { capture: true });
    notifyTouchSeen();
  };
  window.addEventListener('touchstart', onFirstTouch, { passive: true, capture: true });
}

function subscribeTouchSeen(cb) {
  touchSeenSubscribers.add(cb);
  return () => touchSeenSubscribers.delete(cb);
}

// ─── Device gate hook ───────────────────────────────────────────────────
//
// Re-evaluates shouldShowTouchControls() on every signal that could change
// the answer: viewport resize/rotation, pointer-type media query flip, and
// the sticky touch-evidence flag flipping true.
function useTouchControlsGate() {
  const [visible, setVisible] = useState(() => evaluateGate());

  useEffect(() => {
    const recompute = () => {
      const next = evaluateGate();
      setVisible(current => current.visible === next.visible && current.profile === next.profile
        ? current : next);
    };

    const primaryPointer = window.matchMedia('(pointer: coarse)');
    const anyPointer = window.matchMedia('(any-pointer: coarse)');
    window.addEventListener('resize', recompute);
    window.addEventListener('orientationchange', recompute);
    window.visualViewport?.addEventListener('resize', recompute);
    primaryPointer.addEventListener('change', recompute);
    anyPointer.addEventListener('change', recompute);
    const unsubscribe = subscribeTouchSeen(recompute);

    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('orientationchange', recompute);
      window.visualViewport?.removeEventListener('resize', recompute);
      primaryPointer.removeEventListener('change', recompute);
      anyPointer.removeEventListener('change', recompute);
      unsubscribe();
    };
  }, []);

  return visible;
}

function evaluateGate() {
  if (typeof window === 'undefined') return { visible: false, profile: 'standard' };
  return getTouchControlPolicy({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    anyCoarsePointer: window.matchMedia('(any-pointer: coarse)').matches,
    touchSeen,
  });
}

function sameRect(a, b) {
  return a?.left === b?.left
    && a?.top === b?.top
    && a?.width === b?.width
    && a?.height === b?.height;
}

export function observeTouchCanvasResize({
  activeCanvas,
  stage,
  measure,
  ResizeObserverClass = globalThis.ResizeObserver,
  resizeTarget = globalThis.window,
  visualViewport = globalThis.window?.visualViewport,
}) {
  const observer = typeof ResizeObserverClass === 'function'
    ? new ResizeObserverClass(measure)
    : null;
  observer?.observe(activeCanvas);
  observer?.observe(stage);
  resizeTarget?.addEventListener('resize', measure);
  visualViewport?.addEventListener('resize', measure);
  visualViewport?.addEventListener('scroll', measure);
  measure();

  return () => {
    observer?.disconnect();
    resizeTarget?.removeEventListener('resize', measure);
    visualViewport?.removeEventListener('resize', measure);
    visualViewport?.removeEventListener('scroll', measure);
  };
}

function useActiveCanvasRect(activeCanvas, stageRef) {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    setRect(null);
    if (!activeCanvas || !stage) {
      return undefined;
    }

    const insetProbe = document.createElement('div');
    insetProbe.setAttribute('aria-hidden', 'true');
    Object.assign(insetProbe.style, {
      position: 'absolute', visibility: 'hidden', pointerEvents: 'none',
      padding: 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)',
    });
    stage.appendChild(insetProbe);

    let frameId = 0;
    const measure = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const canvasBox = activeCanvas.getBoundingClientRect();
        const stageBox = stage.getBoundingClientRect();
        const viewport = window.visualViewport;
        const padding = getComputedStyle(insetProbe);
        const next = getCanvasControlBounds({
          canvas: canvasBox, stage: stageBox,
          viewport: {
            left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
            width: viewport?.width ?? window.innerWidth,
            height: viewport?.height ?? window.innerHeight,
          },
          insets: {
            left: parseFloat(padding.paddingLeft) || 0,
            right: parseFloat(padding.paddingRight) || 0,
            top: parseFloat(padding.paddingTop) || 0,
            bottom: parseFloat(padding.paddingBottom) || 0,
          },
        });
        setRect((current) => (sameRect(current, next) ? current : next));
      });
    };

    const stopObserving = observeTouchCanvasResize({
      activeCanvas,
      stage,
      measure,
    });

    return () => {
      cancelAnimationFrame(frameId);
      stopObserving();
      insetProbe.remove();
    };
  }, [activeCanvas, stageRef]);

  return rect;
}

export function releaseTouchControlsWhenBlocked(blockingOverlayOpen, releaseAllKeys) {
  if (blockingOverlayOpen) releaseAllKeys();
}

export function shouldHandleTouchControlPointer({ pointerType, button }) {
  return !((pointerType === 'mouse' || pointerType === 'pen') && button !== 0);
}

export function createTouchPointerKeyController({
  dispatchKey,
  scheduleFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
}) {
  const activePointers = new Map();
  const activeKeyCounts = new Map();
  const pendingReleases = new Map();

  const release = (pointerId) => {
    const key = activePointers.get(pointerId);
    if (!key) return;
    activePointers.delete(pointerId);
    const nextCount = Math.max(0, (activeKeyCounts.get(key) || 1) - 1);
    if (nextCount === 0) {
      activeKeyCounts.delete(key);
      dispatchKey(key, 'keyup');
    } else {
      activeKeyCounts.set(key, nextCount);
    }
  };

  const cancelPendingRelease = (pointerId) => {
    if (!pendingReleases.has(pointerId)) return false;
    cancelFrame(pendingReleases.get(pointerId));
    pendingReleases.delete(pointerId);
    release(pointerId);
    return true;
  };

  return {
    press(pointerId, key) {
      cancelPendingRelease(pointerId);
      if (activePointers.has(pointerId)) return;
      activePointers.set(pointerId, key);
      const count = activeKeyCounts.get(key) || 0;
      activeKeyCounts.set(key, count + 1);
      if (count === 0) dispatchKey(key, 'keydown');
    },
    deferRelease(pointerId) {
      if (!activePointers.has(pointerId) || pendingReleases.has(pointerId)) return;
      let frameId;
      frameId = scheduleFrame(() => {
        if (pendingReleases.get(pointerId) !== frameId) return;
        pendingReleases.delete(pointerId);
        release(pointerId);
      });
      pendingReleases.set(pointerId, frameId);
    },
    abort(pointerId) {
      if (pendingReleases.has(pointerId)) return;
      release(pointerId);
    },
    releaseAll() {
      for (const frameId of pendingReleases.values()) cancelFrame(frameId);
      pendingReleases.clear();
      for (const key of activeKeyCounts.keys()) dispatchKey(key, 'keyup');
      activePointers.clear();
      activeKeyCounts.clear();
    },
  };
}

const PORTRAIT_RELEASE_KEYS = [
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'w', 'a', 's', 'd', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'Enter', ' ', 'q', 'KeyQ', 'Escape',
];

/**
 * TouchDpad — On-screen directional pad + action buttons for tablet/whiteboard play.
 *
 * Dispatches synthetic KeyboardEvents on `window` so the existing
 * useOverworldCanvas key listener works unchanged. No direct coupling
 * to game logic — pure input adapter.
 */
export default function TouchDpad({ capabilities: gameCapabilities, mission }) {
  const { t } = useTranslation();
  const { visible, profile } = useTouchControlsGate();
  const {
    activeCanvas,
    contentRef,
    registerBlockingOverlay,
    stageRef,
    dialogControls,
  } = useActiveCanvasStage();
  const capabilities = dialogControls
    ? { movement: true, action: true, drop: false, back: true } : gameCapabilities;
  const blockingOverlayOpen = useBlockingCanvasOverlayOpen();
  const canvasRect = useActiveCanvasRect(activeCanvas, stageRef);
  const geometry = useMemo(() => canvasRect ? getFittingTouchControlGeometry({
    width: canvasRect.width, height: canvasRect.height, profile, capabilities, mission,
  }) : null, [canvasRect, profile, mission, capabilities.movement, capabilities.action,
    capabilities.drop, capabilities.back]);

  // One pointer can hold one key; several pointers may hold different keys at
  // the same time (direction + A/B). Key counts prevent an early keyup when
  // two pointers happen to press the same control.
  const dispatchKey = useCallback((key, type) => {
    if (dialogControls) { dialogControls.handleKey(key, type); return; }
    window.dispatchEvent(new KeyboardEvent(type, {
      key,
      code: key,
      bubbles: true,
      cancelable: true,
    }));
  }, [dialogControls]);

  const pointerController = useMemo(() => createTouchPointerKeyController({ dispatchKey }), [dispatchKey]);
  const releaseAllKeys = useCallback(() => pointerController.releaseAll(), [pointerController]);

  const handlePointerDown = useCallback((key) => (e) => {
    if (!shouldHandleTouchControlPointer(e)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointerController.press(e.pointerId, key);
  }, [pointerController]);

  const handlePointerUp = useCallback((e) => {
    e.preventDefault();
    pointerController.deferRelease(e.pointerId);
  }, [pointerController]);

  const handlePointerAbort = useCallback((e) => {
    // Pointerup deliberately holds the key through one animation frame so a
    // fast tap is still observable by canvas game loops. Its normal capture
    // release must not shorten that beat.
    pointerController.abort(e.pointerId);
  }, [pointerController]);

  // Native keyboard activation fires click with detail=0. Pointer clicks are
  // already handled by pointerdown/up and must not dispatch a duplicate pair.
  const handleKeyboardClick = useCallback((key) => (e) => {
    if (e.detail !== 0) return;
    e.preventDefault();
    dispatchKey(key, 'keydown');
    requestAnimationFrame(() => dispatchKey(key, 'keyup'));
  }, [dispatchKey]);

  // A pointer release can be lost on tab changes, orientation changes or a
  // screen transition. Always leave the shared keyboard state clean.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') releaseAllKeys();
    };
    window.addEventListener('blur', releaseAllKeys);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', releaseAllKeys);
      document.removeEventListener('visibilitychange', handleVisibility);
      releaseAllKeys();
    };
  }, [releaseAllKeys]);

  useEffect(() => () => releaseAllKeys(), [activeCanvas, releaseAllKeys]);
  // Browser toolbar movement must not cancel a finger still holding a button.
  // Release on mode changes or loss of usable controls, not every measurement.
  useEffect(() => { releaseAllKeys(); }, [visible, profile, geometry?.fits, releaseAllKeys]);

  useEffect(() => {
    releaseTouchControlsWhenBlocked(blockingOverlayOpen, releaseAllKeys);
  }, [blockingOverlayOpen, releaseAllKeys]);

  const tabletPortrait = profile === 'tablet-portrait' || profile === 'phone-portrait';
  useEffect(() => {
    const content = contentRef.current;
    if (!tabletPortrait || !content) return undefined;

    const previousAriaHidden = content.getAttribute('aria-hidden');
    const previouslyInert = content.hasAttribute('inert');
    activeCanvas?.blur();
    content.setAttribute('aria-hidden', 'true');
    content.setAttribute('inert', '');
    releaseAllKeys();
    for (const key of PORTRAIT_RELEASE_KEYS) dispatchKey(key, 'keyup');
    const releaseBlockingOverlay = registerBlockingOverlay();
    const blockKeyDown = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', blockKeyDown, true);

    return () => {
      window.removeEventListener('keydown', blockKeyDown, true);
      releaseBlockingOverlay();
      if (previousAriaHidden === null) content.removeAttribute('aria-hidden');
      else content.setAttribute('aria-hidden', previousAriaHidden);
      if (!previouslyInert) content.removeAttribute('inert');
    };
  }, [
    activeCanvas,
    contentRef,
    dispatchKey,
    registerBlockingOverlay,
    releaseAllKeys,
    tabletPortrait,
  ]);

  if (tabletPortrait) {
    const stage = stageRef.current;
    if (!stage) return null;
    return createPortal(
      <div
        data-testid="rotate-device"
        role="status"
        aria-live="polite"
        style={styles.rotateOverlay}
      >
        <div style={styles.rotateCard}>
          <div aria-hidden="true" style={styles.rotateIcon}>📱 ↻</div>
          <h2 style={styles.rotateTitle}>{t('game.rotate_device_title')}</h2>
          <p style={styles.rotateBody}>{t('game.rotate_device_body')}</p>
        </div>
      </div>,
      stage,
    );
  }

  if (!visible || !canvasRect || (blockingOverlayOpen && !dialogControls)) return null;
  if (!geometry.fits) {
    return <div role="status" style={{ position: 'absolute', ...canvasRect,
      display: 'grid', placeItems: 'center', padding: 8, pointerEvents: 'none', zIndex: 5 }}>
      <p style={{ background: '#FFF8E1', color: '#3E2723', padding: 8, fontSize: 14 }}>
        {t('touch.more_space')}
      </p>
    </div>;
  }
  const controlLayout = geometry.layout;
  const controlPosition = (rect) => ({ left: rect.left, top: rect.top });

  const dpadSize = controlLayout.dpadButtonSize;
  const dpadGap = controlLayout.dpadGap;
  const dpadStep = dpadSize + dpadGap;
  const dpadFootprint = dpadSize * 3 + dpadGap * 2;
  const actionSize = controlLayout.actionButtonSize;
  const secondarySize = controlLayout.secondaryButtonSize;

  const dpadButtons = [
    { key: 'ArrowUp',    label: '▲', style: { left: dpadStep, top: 0 }, aria: t('touch.up') },
    { key: 'ArrowDown',  label: '▼', style: { left: dpadStep, top: dpadStep * 2 }, aria: t('touch.down') },
    { key: 'ArrowLeft',  label: '◀', style: { left: 0, top: dpadStep }, aria: t('touch.left') },
    { key: 'ArrowRight', label: '▶', style: { left: dpadStep * 2, top: dpadStep }, aria: t('touch.right') },
  ];

  return (
    <div
      data-testid="touch-controls-surface"
      data-viewport-profile={profile}
      role="group"
      aria-label={t('touch.controls', 'Game controls')}
      style={{
        ...styles.container,
        zIndex: dialogControls ? 50 : styles.container.zIndex,
        left: canvasRect.left,
        top: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
      }}
    >
      <style>{TOUCH_CONTROL_CSS}</style>
      {/* D-Pad (bottom-left) */}
      {capabilities.movement && (
        <div style={{
          ...styles.dpad,
          ...controlPosition(geometry.controls.dpad),
          width: dpadFootprint,
          height: dpadFootprint,
        }}>
          {dpadButtons.map(({ key, label, style, aria }) => (
            <button
              key={key}
              style={{
                ...styles.btn,
                ...styles.direction,
                width: dpadSize,
                height: dpadSize,
                ...style,
              }}
              data-touch-control="true"
              data-key={key}
              onPointerDown={handlePointerDown(key)}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerAbort}
              onLostPointerCapture={handlePointerAbort}
              onClick={handleKeyboardClick(key)}
              aria-label={aria}
              aria-keyshortcuts={key}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Back is only shown where Escape has a real screen-level action. */}
      {capabilities.back && (
        <button
          style={{
            ...styles.btn,
            ...styles.back,
            ...controlPosition(geometry.controls.back),
            width: secondarySize,
            height: secondarySize,
          }}
          data-touch-control="true"
          data-key="Escape"
          onPointerDown={handlePointerDown('Escape')}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerAbort}
          onLostPointerCapture={handlePointerAbort}
          onClick={handleKeyboardClick('Escape')}
          aria-label={t('touch.back')}
          aria-keyshortcuts="Escape"
        >
          {'✕'}
        </button>
      )}

      {/* Drop button — round, left of the action button, game screens only */}
      {capabilities.drop && (
        <button
          style={{
            ...styles.btn,
            ...styles.drop,
            ...controlPosition(geometry.controls.drop),
            width: secondarySize,
            height: secondarySize,
          }}
          data-touch-control="true"
          data-key="q"
          onPointerDown={handlePointerDown('q')}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerAbort}
          onLostPointerCapture={handlePointerAbort}
          onClick={handleKeyboardClick('q')}
          aria-label={t('touch.drop')}
          aria-keyshortcuts="Q"
        >
          B
        </button>
      )}

      {/* Action button (bottom-right) */}
      {capabilities.action && (
        <button
          style={{
            ...styles.btn,
            ...styles.action,
            ...controlPosition(geometry.controls.action),
            width: actionSize,
            height: actionSize,
          }}
          data-touch-control="true"
          data-key="Enter"
          onPointerDown={handlePointerDown('Enter')}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerAbort}
          onLostPointerCapture={handlePointerAbort}
          onClick={handleKeyboardClick('Enter')}
          aria-label={t('touch.action')}
          aria-keyshortcuts="Enter Space"
        >
          A
        </button>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────

const styles = {
  container: {
    position: 'absolute',
    zIndex: 5,
    pointerEvents: 'none',
  },

  // D-pad: 3x3 grid, only corners empty
  dpad: {
    position: 'absolute',
    pointerEvents: 'none',
  },

  btn: {
    position: 'absolute',
    borderRadius: 10,
    border: '2px solid #FFF8E1',
    background: 'rgba(83,63,139,0.55)',
    color: '#fff',
    fontSize: 20,
    fontFamily: "'Fredoka', sans-serif",
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    cursor: 'pointer',
    opacity: 1,
    boxShadow: '0 4px 0 rgba(42,27,16,0.55), inset 0 2px 0 rgba(255,255,255,0.22)',
    padding: 0,
  },

  direction: {
    borderRadius: 0,
    clipPath: 'polygon(7px 0, calc(100% - 7px) 0, 100% 7px, 100% calc(100% - 7px), calc(100% - 7px) 100%, 7px 100%, 0 calc(100% - 7px), 0 7px)',
  },

  // Action button — bottom-right, round
  action: {
    borderRadius: '50%',
    background: 'rgba(224,127,55,0.62)',
    border: '2px solid #FFF8E1',
    fontSize: 22,
  },

  // Back button — small round, directly above the action button
  back: {
    borderRadius: '50%',
    background: 'rgba(76,56,38,0.58)',
    border: '2px solid #FFF8E1',
    fontSize: 20,
  },

  // Drop button — round, left of the action button
  drop: {
    borderRadius: '50%',
    background: 'rgba(83,63,139,0.55)',
    border: '2px solid #FFF8E1',
    fontSize: 20,
  },

  rotateOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    boxSizing: 'border-box',
    backgroundColor: '#2E7D32',
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.06) 2px, transparent 2px),
      linear-gradient(90deg, rgba(255,255,255,0.06) 2px, transparent 2px)
    `,
    backgroundSize: '32px 32px',
    pointerEvents: 'auto',
  },

  rotateCard: {
    width: 'min(520px, 100%)',
    padding: '38px 34px 34px',
    boxSizing: 'border-box',
    textAlign: 'center',
    background: '#FFF8E1',
    color: '#2E5D34',
    border: '4px solid #1B5E20',
    clipPath: 'polygon(12px 0, calc(100% - 12px) 0, calc(100% - 12px) 6px, 100% 6px, 100% calc(100% - 6px), calc(100% - 12px) calc(100% - 6px), calc(100% - 12px) 100%, 12px 100%, 12px calc(100% - 6px), 0 calc(100% - 6px), 0 6px, 12px 6px)',
    boxShadow: '0 12px 0 #1B5E20, 0 22px 42px rgba(28,65,32,0.34)',
    fontFamily: "'Fredoka', system-ui, sans-serif",
  },

  rotateIcon: { fontSize: 64, lineHeight: 1, marginBottom: 18 },
  rotateTitle: { margin: '0 0 12px', fontSize: 30, lineHeight: 1.15, fontWeight: 800 },
  rotateBody: { margin: 0, fontSize: 18, lineHeight: 1.5, fontWeight: 650 },
};

const TOUCH_CONTROL_CSS = `
  [data-touch-control="true"] {
    transition: transform 70ms ease-out, box-shadow 70ms ease-out, background-color 70ms linear;
  }
  [data-touch-control="true"]:active {
    transform: translate(2px, 2px);
    box-shadow: 0 1px 0 rgba(42,27,16,0.62), inset 0 2px 0 rgba(255,255,255,0.18) !important;
  }
  [data-touch-control="true"]:focus-visible {
    outline: 3px solid #fff8e1;
    outline-offset: 3px;
    box-shadow: 0 0 0 5px rgba(62,41,122,0.82), 0 4px 0 rgba(42,27,16,0.55) !important;
  }
  @media (prefers-reduced-motion: reduce) {
    [data-touch-control="true"] { transition: none; }
    [data-touch-control="true"]:active { transform: none; }
  }
`;
