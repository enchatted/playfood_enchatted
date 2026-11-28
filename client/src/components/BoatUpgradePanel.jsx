import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { BOAT_UPGRADES, getBoatCardState, getBoatUpgrade } from '../data/boatUpgrades.js';
import { DIR } from '../overworld/overworldData.js';
import { BRAND, WORLD_ART } from '../styles/brandColors.js';
import { useBlockingCanvasOverlay } from './ActiveCanvasStage.jsx';

const MAX_PREVIEW_SIZE = 176;
const PANEL_MAX_WIDTH = 900;
const PANEL_MAX_HEIGHT = 560;
const PANEL_INSET = 16;
const PANEL_FRAME = 16;
const KEYBOARD_CAPTURE_OPTIONS = Object.freeze({ capture: true });

export function nextBoatTier(currentTier, direction, total = BOAT_UPGRADES.length) {
  const safeTotal = Math.max(1, Math.trunc(Number(total)) || 1);
  const current = Math.trunc(Number(currentTier)) || 0;
  const step = Math.trunc(Number(direction)) || 0;
  return ((current + step) % safeTotal + safeTotal) % safeTotal;
}

export function getBoatPreviewScale(availableSize, sourceWidth = 32, sourceHeight = 32) {
  const available = Math.max(1, Math.floor(Number(availableSize)) || 1);
  const sourceSize = Math.max(1, Number(sourceWidth) || 1, Number(sourceHeight) || 1);
  return Math.max(1, Math.floor(available / sourceSize));
}

export function getBoatPanelKeyAction(
  key,
  targetTagName,
  purchaseEnabled,
  code = '',
  focusedAction = '',
) {
  if (key === 'Escape' || key === 'q' || key === 'Q' || code === 'KeyQ') return 'close';
  if (key === 'ArrowLeft') return 'previous';
  if (key === 'ArrowRight') return 'next';
  if (key === 'Enter' || key === ' ') {
    if (focusedAction === 'previous' || focusedAction === 'next' || focusedAction === 'close') {
      return focusedAction;
    }
    if (focusedAction === 'purchase') return purchaseEnabled ? 'purchase' : null;
    if (targetTagName !== 'BUTTON' && purchaseEnabled) return 'purchase';
  }
  return null;
}

function isBoatPanelOwnedKey(key, code) {
  return key === 'Escape'
    || key === 'ArrowLeft'
    || key === 'ArrowRight'
    || key === 'Enter'
    || key === ' '
    || key === 'q'
    || key === 'Q'
    || code === 'KeyQ';
}

export function installBoatPanelKeyboardOwner({
  windowObject,
  purchaseEnabled,
  onBrowse,
  onPurchase,
  onClose,
}) {
  const handleKeyDown = (event) => {
    if (!isBoatPanelOwnedKey(event.key, event.code)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const actionElement = event.target?.closest?.('[data-shipyard-action]') || event.target;
    const action = getBoatPanelKeyAction(
      event.key,
      event.target?.tagName,
      purchaseEnabled,
      event.code,
      actionElement?.dataset?.shipyardAction,
    );
    if (action === 'close') onClose?.();
    if (action === 'previous') onBrowse?.(-1);
    if (action === 'next') onBrowse?.(1);
    if (action === 'purchase') onPurchase?.();
  };

  windowObject.addEventListener('keydown', handleKeyDown, KEYBOARD_CAPTURE_OPTIONS);
  return () => {
    windowObject.removeEventListener('keydown', handleKeyDown, KEYBOARD_CAPTURE_OPTIONS);
  };
}

export function executeBoatPurchase({
  purchaseEnabled,
  purchaseInFlightRef,
  targetTier,
  onPurchase,
  onSuccess,
}) {
  if (!purchaseEnabled || purchaseInFlightRef.current) return null;

  purchaseInFlightRef.current = true;
  try {
    const result = onPurchase?.(targetTier);
    if (result?.success) onSuccess?.(result);
    return result || null;
  } finally {
    purchaseInFlightRef.current = false;
  }
}

export function trapBoatPanelFocus(event, panel, documentObject) {
  if (event.key !== 'Tab') return;
  const controls = Array.from(
    panel?.querySelectorAll('[data-shipyard-focus="true"]:not(:disabled)') || [],
  );
  if (controls.length === 0) return;

  const activeIndex = controls.indexOf(documentObject.activeElement);
  const leavingStart = event.shiftKey && activeIndex <= 0;
  const leavingEnd = !event.shiftKey && activeIndex === controls.length - 1;
  const enteringFromTitle = activeIndex === -1;
  if (!leavingStart && !leavingEnd && !enteringFromTitle) return;

  event.preventDefault();
  if (leavingStart) controls[controls.length - 1].focus();
  else controls[0].focus();
}

export function getBoatPanelLayout(surfaceWidth, surfaceHeight) {
  const width = Math.max(0, Number(surfaceWidth) || 0);
  const height = Math.max(0, Number(surfaceHeight) || 0);
  const compactHeight = height < 620;
  const stacked = !compactHeight && width < 760;
  const mode = compactHeight ? 'compact-height' : stacked ? 'compact-stacked' : 'standard';
  const panelWidth = Math.max(0, Math.min(PANEL_MAX_WIDTH, width - (PANEL_INSET * 2)));
  const panelHeight = Math.max(0, Math.min(PANEL_MAX_HEIGHT, height - (PANEL_INSET * 2)));
  const headerHeight = compactHeight ? 58 : 74;
  const bodyVerticalPadding = compactHeight ? 20 : 32;
  const bodyContentHeight = Math.max(
    0,
    panelHeight - PANEL_FRAME - headerHeight - bodyVerticalPadding,
  );
  const previewBayHeight = compactHeight
    ? Math.min(220, Math.max(200, bodyContentHeight - 96))
    : stacked ? 206 : 236;

  return Object.freeze({
    mode,
    inset: PANEL_INSET,
    panelWidth,
    panelHeight,
    arrowSize: compactHeight || stacked ? 56 : 64,
    purchaseHeight: 52,
    previewBayHeight,
    bodyContentHeight,
  });
}

function stateTranslationKey(state) {
  return `lighthouse.shipyard.state_${state}`;
}

export default function BoatUpgradePanel({
  boatTier,
  points,
  boatSprites,
  onPurchase,
  onClose,
}) {
  const { t } = useTranslation();
  const initialTier = getBoatUpgrade(boatTier)?.tier ?? 0;
  const [selectedTier, setSelectedTier] = useState(initialTier);
  const [currentTier, setCurrentTier] = useState(initialTier);
  const [announcement, setAnnouncement] = useState('');
  const [previewAvailableSize, setPreviewAvailableSize] = useState(MAX_PREVIEW_SIZE);
  const [panelLayout, setPanelLayout] = useState(() => getBoatPanelLayout(800, 440));
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  const previewBayRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const purchaseInFlightRef = useRef(false);
  const keyboardPurchaseFocusRef = useRef(false);

  useBlockingCanvasOverlay();

  const selectedBoat = getBoatUpgrade(selectedTier) || BOAT_UPGRADES[0];
  const selectedState = getBoatCardState({
    targetTier: selectedBoat.tier,
    currentTier,
    points,
  });
  const purchaseEnabled = selectedState === 'available';
  const boatName = t(`lighthouse.shipyard.boats.${selectedBoat.id}`);
  const previewSprite = boatSprites?.[selectedBoat.tier]?.[DIR.DOWN]?.[0] || null;
  const previewScale = getBoatPreviewScale(
    previewAvailableSize,
    previewSprite?.width,
    previewSprite?.height,
  );
  const previewWidth = (previewSprite?.width || 32) * previewScale;
  const previewHeight = (previewSprite?.height || 32) * previewScale;

  useEffect(() => {
    const nextCurrentTier = getBoatUpgrade(boatTier)?.tier;
    if (nextCurrentTier !== undefined) setCurrentTier(nextCurrentTier);
  }, [boatTier]);

  useLayoutEffect(() => {
    if (!keyboardPurchaseFocusRef.current) return;
    keyboardPurchaseFocusRef.current = false;
    titleRef.current?.focus();
  }, [currentTier]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return undefined;

    const measure = () => {
      setPanelLayout(getBoatPanelLayout(overlay.clientWidth, overlay.clientHeight));
    };
    measure();

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(overlay);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const previewBay = previewBayRef.current;
    if (!previewBay) return undefined;

    const measure = () => {
      const available = Math.min(
        MAX_PREVIEW_SIZE,
        Math.max(32, previewBay.clientWidth - 32),
        Math.max(32, previewBay.clientHeight - 24),
      );
      setPreviewAvailableSize(available);
    };

    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(previewBay);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    if (previewSprite) {
      context.drawImage(
        previewSprite,
        0,
        0,
        previewSprite.width,
        previewSprite.height,
        0,
        0,
        previewWidth,
        previewHeight,
      );
    }
  }, [previewHeight, previewSprite, previewWidth]);

  const browse = useCallback((direction) => {
    setSelectedTier((tier) => {
      const nextTier = nextBoatTier(tier, direction);
      const nextBoat = getBoatUpgrade(nextTier) || BOAT_UPGRADES[0];
      const nextState = getBoatCardState({
        targetTier: nextBoat.tier,
        currentTier,
        points,
      });
      const nextName = t(`lighthouse.shipyard.boats.${nextBoat.id}`);
      setAnnouncement(t('lighthouse.shipyard.selection_announcement', {
        boat: nextName,
        state: t(stateTranslationKey(nextState)),
      }));
      return nextTier;
    });
  }, [currentTier, points, t]);

  const closePanel = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const purchaseSelectedBoat = useCallback((inputMethod = 'pointer') => {
    return executeBoatPurchase({
      purchaseEnabled,
      purchaseInFlightRef,
      targetTier: selectedBoat.tier,
      onPurchase,
      onSuccess: (result) => {
        const purchasedTier = getBoatUpgrade(result.tier)?.tier ?? selectedBoat.tier;
        keyboardPurchaseFocusRef.current = inputMethod === 'keyboard';
        setCurrentTier(purchasedTier);
        setSelectedTier(purchasedTier);
        setAnnouncement(t('lighthouse.shipyard.confirmation'));
      },
    });
  }, [onPurchase, purchaseEnabled, selectedBoat.tier, t]);

  useEffect(() => {
    return installBoatPanelKeyboardOwner({
      windowObject: window,
      purchaseEnabled,
      onBrowse: browse,
      onPurchase: () => purchaseSelectedBoat('keyboard'),
      onClose: closePanel,
    });
  }, [browse, closePanel, purchaseEnabled, purchaseSelectedBoat]);

  const trapFocus = useCallback((event) => {
    trapBoatPanelFocus(event, panelRef.current, document);
  }, []);

  const progressStates = useMemo(() => BOAT_UPGRADES.map((boat) => ({
    ...boat,
    state: getBoatCardState({ targetTier: boat.tier, currentTier, points }),
  })), [currentTier, points]);

  const purchaseLabel = purchaseEnabled
    ? t('lighthouse.shipyard.purchase', { price: selectedBoat.price })
    : t(stateTranslationKey(selectedState));

  return (
    <div
      ref={overlayRef}
      className="pf-shipyard-overlay"
      data-layout={panelLayout.mode}
      style={{
        '--pf-shipyard-panel-width': `${panelLayout.panelWidth}px`,
        '--pf-shipyard-panel-height': `${panelLayout.panelHeight}px`,
        '--pf-shipyard-arrow-size': `${panelLayout.arrowSize}px`,
        '--pf-shipyard-purchase-height': `${panelLayout.purchaseHeight}px`,
        '--pf-shipyard-preview-height': `${panelLayout.previewBayHeight}px`,
      }}
    >
      <style>{SHIPYARD_CSS}</style>
      <section
        ref={panelRef}
        className="pf-shipyard-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="boat-upgrade-title"
        data-testid="boat-upgrade-panel"
        data-boat-state={selectedState}
        onKeyDown={trapFocus}
      >
        <div className="pf-shipyard-shell">
          <header className="pf-shipyard-header">
            <div>
              <p className="pf-shipyard-kicker" aria-hidden="true">
                <span />
                PLAYFOOD
                <span />
              </p>
              <h2 id="boat-upgrade-title" ref={titleRef} tabIndex={-1}>
                {t('lighthouse.shipyard.title')}
              </h2>
            </div>
            <p className="pf-shipyard-coins">
              {t('lighthouse.shipyard.coins', { points })}
            </p>
          </header>

          <div className="pf-shipyard-body">
            <div className="pf-shipyard-preview-column">
              <p className="pf-shipyard-position">
                {t('lighthouse.shipyard.position', {
                  current: selectedBoat.tier + 1,
                  total: BOAT_UPGRADES.length,
                })}
              </p>

              <div className="pf-shipyard-carousel">
                <button
                  type="button"
                  className="pf-shipyard-arrow"
                  data-testid="boat-previous"
                  data-shipyard-focus="true"
                  data-shipyard-action="previous"
                  aria-label={t('lighthouse.shipyard.previous')}
                  onClick={() => browse(-1)}
                >
                  <span aria-hidden="true">←</span>
                </button>

                <div
                  ref={previewBayRef}
                  className="pf-shipyard-preview-bay"
                  data-boat-state={selectedState}
                >
                  <span className="pf-shipyard-waterline pf-shipyard-waterline--one" aria-hidden="true" />
                  <span className="pf-shipyard-waterline pf-shipyard-waterline--two" aria-hidden="true" />
                  <canvas
                    ref={previewCanvasRef}
                    className="pf-shipyard-preview-canvas"
                    width={previewWidth}
                    height={previewHeight}
                    role="img"
                    aria-label={t('lighthouse.shipyard.preview_label', { boat: boatName })}
                    data-testid="boat-preview"
                    data-pixel-scale={previewScale}
                  />
                </div>

                <button
                  type="button"
                  className="pf-shipyard-arrow"
                  data-testid="boat-next"
                  data-shipyard-focus="true"
                  data-shipyard-action="next"
                  aria-label={t('lighthouse.shipyard.next')}
                  onClick={() => browse(1)}
                >
                  <span aria-hidden="true">→</span>
                </button>
              </div>

              <div className="pf-shipyard-progress" aria-hidden="true">
                {progressStates.map((boat) => (
                  <span
                    key={boat.id}
                    data-boat-state={boat.state}
                    data-selected={boat.tier === selectedBoat.tier ? 'true' : 'false'}
                  />
                ))}
              </div>
            </div>

            <div className="pf-shipyard-details">
              <div className="pf-shipyard-name-row">
                <h3>{boatName}</h3>
                <span className="pf-shipyard-state" data-state={selectedState}>
                  {t(stateTranslationKey(selectedState))}
                </span>
              </div>

              <p className="pf-shipyard-capacity">
                {t('lighthouse.shipyard.capacity', { capacity: selectedBoat.capacity })}
              </p>
              <p className="pf-shipyard-benefit">{t('lighthouse.shipyard.benefit')}</p>

              {selectedBoat.tier > 0 && (
                <p
                  className="pf-shipyard-price"
                  aria-label={t('lighthouse.shipyard.purchase', { price: selectedBoat.price })}
                >
                  <span aria-hidden="true">◆</span>
                  {selectedBoat.price}
                </p>
              )}

              <button
                type="button"
                className="pf-shipyard-purchase"
                data-testid="boat-purchase"
                data-shipyard-focus="true"
                data-shipyard-action="purchase"
                disabled={!purchaseEnabled}
                onClick={() => purchaseSelectedBoat('pointer')}
              >
                {purchaseLabel}
              </button>

              <p className="pf-shipyard-live" role="status" aria-live="polite" aria-atomic="true">
                {announcement}
              </p>
            </div>

            <div
              className="pf-shipyard-controls-guide"
              data-testid="boat-controls-guide"
              role="note"
              aria-label={t('lighthouse.shipyard.controls_label')}
            >
              <div className="pf-shipyard-control-group">
                <span className="pf-shipyard-control-keys" aria-hidden="true">
                  <kbd>←</kbd><kbd>→</kbd>
                </span>
                <span>{t('lighthouse.shipyard.controls_change')}</span>
              </div>
              <div className="pf-shipyard-control-group">
                <span className="pf-shipyard-control-keys" aria-hidden="true">
                  <kbd>Enter</kbd><b>/</b><kbd>Space</kbd>
                </span>
                <span>{t('lighthouse.shipyard.controls_buy')}</span>
              </div>
              <div className="pf-shipyard-control-group">
                <span className="pf-shipyard-control-keys" aria-hidden="true">
                  <kbd>Esc</kbd>
                </span>
                <span>{t('lighthouse.shipyard.controls_close')}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="pf-shipyard-close"
            data-testid="boat-close"
            data-key="q"
            data-shipyard-focus="true"
            data-shipyard-action="close"
            aria-label={t('lighthouse.shipyard.close')}
            aria-keyshortcuts="Q Escape"
            onClick={closePanel}
          >
            <span aria-hidden="true" className="pf-shipyard-close-badge">B</span>
            <span aria-hidden="true" className="pf-shipyard-close-label">
              {t('lighthouse.shipyard.close')}
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}

const SHIPYARD_CSS = `
  .pf-shipyard-overlay {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: ${PANEL_INSET}px;
    overflow: hidden;
    background: rgba(24, 39, 34, 0.72);
    font-family: 'Inter', system-ui, sans-serif;
  }

  .pf-shipyard-panel {
    width: var(--pf-shipyard-panel-width);
    height: var(--pf-shipyard-panel-height);
    max-width: 100%;
    max-height: 100%;
    box-sizing: border-box;
    padding: 8px;
    color: ${WORLD_ART.panelBrownDeep};
    background: ${WORLD_ART.woodDeep};
    filter: drop-shadow(10px 10px 0 rgba(28, 20, 13, 0.5));
    clip-path: polygon(12px 0, calc(100% - 12px) 0, calc(100% - 12px) 4px, calc(100% - 4px) 4px, calc(100% - 4px) 12px, 100% 12px, 100% calc(100% - 12px), calc(100% - 4px) calc(100% - 12px), calc(100% - 4px) calc(100% - 4px), calc(100% - 12px) calc(100% - 4px), calc(100% - 12px) 100%, 12px 100%, 12px calc(100% - 4px), 4px calc(100% - 4px), 4px calc(100% - 12px), 0 calc(100% - 12px), 0 12px, 4px 12px, 4px 4px, 12px 4px);
  }

  .pf-shipyard-shell {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    background: ${WORLD_ART.panelCream};
    clip-path: polygon(6px 0, calc(100% - 6px) 0, calc(100% - 6px) 3px, 100% 3px, 100% calc(100% - 6px), calc(100% - 3px) calc(100% - 6px), calc(100% - 3px) 100%, 6px 100%, 6px calc(100% - 3px), 0 calc(100% - 3px), 0 6px, 3px 6px, 3px 3px, 6px 3px);
  }

  .pf-shipyard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 0 0 74px;
    min-height: 74px;
    box-sizing: border-box;
    padding: 10px 152px 10px 24px;
    gap: 24px;
    color: #fff;
    background: ${WORLD_ART.buttonGreen};
    border-bottom: 6px solid ${WORLD_ART.woodDeep};
  }

  .pf-shipyard-kicker {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 2px;
    font: 700 10px/1 'Inter', system-ui, sans-serif;
    letter-spacing: 0.16em;
  }

  .pf-shipyard-kicker span {
    width: 5px;
    height: 5px;
    background: ${BRAND.yellowSoft};
    box-shadow: 2px 2px 0 rgba(40, 55, 24, 0.45);
  }

  .pf-shipyard-header h2 {
    margin: 0;
    outline: none;
    font: 700 clamp(24px, 3vw, 30px)/1.12 'Fredoka', system-ui, sans-serif;
    letter-spacing: 0.01em;
  }

  .pf-shipyard-header h2:focus-visible {
    outline: 3px solid ${BRAND.yellowSoft};
    outline-offset: 4px;
  }

  .pf-shipyard-coins {
    flex: 0 0 auto;
    margin: 0;
    padding: 8px 12px;
    color: ${WORLD_ART.panelBrownDeep};
    background: ${BRAND.yellowSoft};
    border: 3px solid ${WORLD_ART.woodDeep};
    box-shadow: 3px 3px 0 rgba(38, 54, 22, 0.45);
    font: 700 clamp(15px, 1.8vw, 18px)/1.2 'Fredoka', system-ui, sans-serif;
    white-space: nowrap;
  }

  .pf-shipyard-body {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(320px, 0.95fr) minmax(300px, 1.05fr);
    grid-template-rows: minmax(0, 1fr) auto;
    column-gap: clamp(18px, 3vw, 34px);
    row-gap: 14px;
    min-height: 0;
    box-sizing: border-box;
    padding: clamp(16px, 2.5vw, 26px);
  }

  .pf-shipyard-preview-column,
  .pf-shipyard-details {
    min-width: 0;
  }

  .pf-shipyard-position {
    margin: 0 0 9px;
    color: ${WORLD_ART.panelBrown};
    font-size: clamp(14px, 1.7vw, 17px);
    font-weight: 700;
    text-align: center;
  }

  .pf-shipyard-carousel {
    display: grid;
    grid-template-columns: var(--pf-shipyard-arrow-size) minmax(0, 1fr) var(--pf-shipyard-arrow-size);
    align-items: center;
    gap: 10px;
  }

  .pf-shipyard-arrow {
    width: var(--pf-shipyard-arrow-size);
    height: var(--pf-shipyard-arrow-size);
    min-width: var(--pf-shipyard-arrow-size);
    min-height: var(--pf-shipyard-arrow-size);
    padding: 0;
    color: #fff;
    background: ${BRAND.blue};
    border: 4px solid ${WORLD_ART.woodDeep};
    border-radius: 0;
    box-shadow: 4px 4px 0 ${WORLD_ART.woodShadow};
    font: 700 30px/1 'Fredoka', system-ui, sans-serif;
    cursor: pointer;
    clip-path: polygon(8px 0, calc(100% - 8px) 0, calc(100% - 8px) 4px, 100% 4px, 100% calc(100% - 8px), calc(100% - 4px) calc(100% - 8px), calc(100% - 4px) 100%, 8px 100%, 8px calc(100% - 4px), 0 calc(100% - 4px), 0 8px, 4px 8px, 4px 4px, 8px 4px);
  }

  .pf-shipyard-preview-bay {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: var(--pf-shipyard-preview-height);
    box-sizing: border-box;
    overflow: hidden;
    background: linear-gradient(to bottom, ${BRAND.blueSoft} 0 58%, ${WORLD_ART.oceanMid} 58% 100%);
    border: 6px solid ${WORLD_ART.woodDeep};
    box-shadow: inset 0 0 0 4px ${WORLD_ART.wood}, 4px 4px 0 ${WORLD_ART.woodShadow};
  }

  .pf-shipyard-preview-bay::before,
  .pf-shipyard-preview-bay::after {
    content: '';
    position: absolute;
    z-index: 0;
    top: 0;
    bottom: 0;
    width: 10px;
    background: repeating-linear-gradient(to bottom, ${WORLD_ART.woodMid} 0 12px, ${WORLD_ART.woodDeep} 12px 16px);
  }
  .pf-shipyard-preview-bay::before { left: 12px; }
  .pf-shipyard-preview-bay::after { right: 12px; }

  .pf-shipyard-waterline {
    position: absolute;
    z-index: 1;
    height: 4px;
    background: ${WORLD_ART.oceanWaveLight};
  }
  .pf-shipyard-waterline--one { left: 24px; right: 58%; bottom: 22px; }
  .pf-shipyard-waterline--two { left: 62%; right: 22px; bottom: 42px; }

  .pf-shipyard-preview-canvas {
    position: relative;
    z-index: 2;
    display: block;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }

  .pf-shipyard-progress {
    display: flex;
    justify-content: center;
    gap: 11px;
    margin: 14px 0 10px;
  }

  .pf-shipyard-progress span {
    width: 22px;
    height: 10px;
    box-sizing: border-box;
    background: ${WORLD_ART.stoneMid};
    border: 2px solid ${WORLD_ART.woodDeep};
    box-shadow: 2px 2px 0 ${WORLD_ART.woodShadow};
  }
  .pf-shipyard-progress span[data-boat-state='current'] { background: ${BRAND.green}; }
  .pf-shipyard-progress span[data-boat-state='available'] { background: ${BRAND.orange}; }
  .pf-shipyard-progress span[data-boat-state='prerequisite'] { background: ${BRAND.purple}; }
  .pf-shipyard-progress span[data-boat-state='inactive'] { background: ${WORLD_ART.woodMid}; }
  .pf-shipyard-progress span[data-selected='true'] { transform: translateY(-3px); }

  .pf-shipyard-details {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .pf-shipyard-controls-guide {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    min-height: 46px;
    box-sizing: border-box;
    padding: 7px 9px;
    color: ${WORLD_ART.panelBrownDeep};
    background: #f5e8bd;
    border: 3px solid ${WORLD_ART.woodMid};
    box-shadow: inset 0 0 0 2px #fff8e1, 3px 3px 0 ${WORLD_ART.woodShadow};
    clip-path: polygon(6px 0, calc(100% - 6px) 0, calc(100% - 6px) 3px, 100% 3px, 100% calc(100% - 6px), calc(100% - 3px) calc(100% - 6px), calc(100% - 3px) 100%, 6px 100%, 6px calc(100% - 3px), 0 calc(100% - 3px), 0 6px, 3px 6px, 3px 3px, 6px 3px);
  }

  .pf-shipyard-control-group {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    min-width: 0;
    padding: 4px 8px;
    background: rgba(255, 253, 243, 0.72);
    border: 2px solid ${WORLD_ART.wood};
    font: 700 clamp(13px, 1.55vw, 16px)/1.2 'Fredoka', system-ui, sans-serif;
    text-align: center;
  }

  .pf-shipyard-control-keys {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
  }

  .pf-shipyard-control-keys kbd {
    display: inline-grid;
    min-width: 28px;
    min-height: 26px;
    place-items: center;
    box-sizing: border-box;
    padding: 3px 6px;
    color: ${WORLD_ART.panelBrownDeep};
    background: #fffdf3;
    border: 2px solid ${WORLD_ART.woodMid};
    box-shadow: 2px 2px 0 ${WORLD_ART.woodDeep};
    font: 700 12px/1 'Inter', system-ui, sans-serif;
  }

  .pf-shipyard-control-keys b {
    color: ${WORLD_ART.woodMid};
    font: 700 12px/1 'Inter', system-ui, sans-serif;
  }

  .pf-shipyard-name-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 4px solid ${WORLD_ART.wood};
    padding-bottom: 12px;
  }

  .pf-shipyard-name-row h3 {
    margin: 0;
    color: ${WORLD_ART.textGreen};
    font: 700 clamp(22px, 3vw, 30px)/1.15 'Fredoka', system-ui, sans-serif;
  }

  .pf-shipyard-state {
    flex: 0 1 auto;
    padding: 6px 9px;
    color: #fff;
    background: ${WORLD_ART.stoneShadow};
    border: 3px solid ${WORLD_ART.woodDeep};
    font-size: clamp(12px, 1.5vw, 14px);
    font-weight: 700;
    text-align: center;
  }
  .pf-shipyard-state[data-state='current'] { background: ${WORLD_ART.buttonGreen}; }
  .pf-shipyard-state[data-state='available'] { background: ${BRAND.orange}; }
  .pf-shipyard-state[data-state='prerequisite'] { background: ${BRAND.purple}; }
  .pf-shipyard-state[data-state='inactive'] { background: ${WORLD_ART.woodMid}; }

  .pf-shipyard-capacity {
    margin: 18px 0 7px;
    color: ${WORLD_ART.panelBrownDeep};
    font: 700 clamp(17px, 2.1vw, 20px)/1.35 'Fredoka', system-ui, sans-serif;
  }

  .pf-shipyard-benefit {
    margin: 0;
    color: ${WORLD_ART.panelBrown};
    font-size: clamp(16px, 1.8vw, 18px);
    font-weight: 600;
    line-height: 1.45;
  }

  .pf-shipyard-price {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 28px;
    margin: 17px 0 8px;
    color: ${WORLD_ART.panelBrownDeep};
    font: 700 22px/1 'Fredoka', system-ui, sans-serif;
  }
  .pf-shipyard-price span {
    color: #bc6f16;
    text-shadow: 2px 2px 0 ${BRAND.yellowSoft};
  }

  .pf-shipyard-purchase {
    width: 100%;
    min-height: var(--pf-shipyard-purchase-height);
    margin-top: auto;
    padding: 9px 14px;
    color: #fff;
    background: ${BRAND.orange};
    border: 4px solid ${WORLD_ART.woodDeep};
    border-radius: 0;
    box-shadow: 4px 4px 0 ${WORLD_ART.woodShadow};
    font: 700 clamp(16px, 2vw, 19px)/1.25 'Fredoka', system-ui, sans-serif;
    cursor: pointer;
  }
  .pf-shipyard-purchase:disabled {
    color: #f4efe6;
    background: ${WORLD_ART.stoneShadow};
    cursor: not-allowed;
    box-shadow: 2px 2px 0 ${WORLD_ART.woodShadow};
  }

  .pf-shipyard-close {
    position: absolute;
    z-index: 3;
    top: 9px;
    right: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-width: 124px;
    height: 56px;
    padding: 0 10px;
    color: ${WORLD_ART.panelBrownDeep};
    background: ${BRAND.yellowSoft};
    border: 4px solid ${WORLD_ART.woodDeep};
    border-radius: 0;
    box-shadow: 3px 3px 0 rgba(38, 54, 22, 0.45);
    font: 700 15px/1 'Fredoka', system-ui, sans-serif;
    cursor: pointer;
  }

  .pf-shipyard-close-badge {
    display: grid;
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    place-items: center;
    box-sizing: border-box;
    color: #fff;
    background: ${BRAND.purple};
    border: 3px solid ${WORLD_ART.woodDeep};
    box-shadow: 2px 2px 0 ${WORLD_ART.woodShadow};
    font: 700 16px/1 'Fredoka', system-ui, sans-serif;
  }

  .pf-shipyard-close-label {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 18px;
  }

  .pf-shipyard-arrow:hover,
  .pf-shipyard-purchase:not(:disabled):hover,
  .pf-shipyard-close:hover { filter: brightness(1.08); }

  .pf-shipyard-arrow:active,
  .pf-shipyard-purchase:not(:disabled):active,
  .pf-shipyard-close:active {
    transform: translate(3px, 3px);
    box-shadow: 1px 1px 0 ${WORLD_ART.woodDeep};
  }

  .pf-shipyard-arrow:focus-visible,
  .pf-shipyard-purchase:focus-visible,
  .pf-shipyard-close:focus-visible {
    outline: 4px solid ${BRAND.purple};
    outline-offset: 3px;
  }

  .pf-shipyard-live {
    min-height: 22px;
    margin: 9px 0 0;
    color: ${WORLD_ART.textGreen};
    font: 700 15px/1.35 'Fredoka', system-ui, sans-serif;
    text-align: center;
  }
  .pf-shipyard-live:not(:empty) {
    animation: pf-shipyard-ready 420ms steps(2, end) 1;
  }

  @keyframes pf-shipyard-ready {
    50% { transform: translateY(-3px); color: ${BRAND.orange}; }
  }

  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-header {
    flex-basis: 58px;
    min-height: 58px;
    padding: 7px 152px 7px 18px;
    gap: 12px;
    border-bottom-width: 4px;
  }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-kicker { display: none; }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-close { top: 1px; }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-body {
    grid-template-columns: minmax(0, 0.92fr) minmax(260px, 1.08fr);
    column-gap: 16px;
    row-gap: 6px;
    padding: 10px 14px;
  }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-carousel { gap: 8px; }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-position { margin-bottom: 5px; }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-progress { margin: 8px 0 0; }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-controls-guide {
    min-height: 40px;
    gap: 5px;
    padding: 4px 6px;
  }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-control-group {
    gap: 6px;
    padding: 2px 5px;
    font-size: 14px;
  }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-control-keys kbd {
    min-width: 24px;
    min-height: 23px;
    padding: 2px 4px;
    font-size: 11px;
  }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-name-row {
    flex-direction: column;
    gap: 4px;
    padding-bottom: 6px;
  }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-state { padding: 4px 7px; }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-capacity { margin-top: 7px; }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-benefit { line-height: 1.3; }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-price { margin: 7px 0 5px; }
  .pf-shipyard-overlay[data-layout='compact-height'] .pf-shipyard-live {
    position: absolute;
    width: 1px;
    height: 1px;
    min-height: 0;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    animation: none;
  }

  .pf-shipyard-overlay[data-layout='compact-stacked'] .pf-shipyard-header {
    flex-basis: 64px;
    min-height: 64px;
    padding: 7px 152px 7px 18px;
    gap: 12px;
  }
  .pf-shipyard-overlay[data-layout='compact-stacked'] .pf-shipyard-body {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 10px 16px 12px;
  }
  .pf-shipyard-overlay[data-layout='compact-stacked'] .pf-shipyard-carousel { gap: 8px; }
  .pf-shipyard-overlay[data-layout='compact-stacked'] .pf-shipyard-controls-guide {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pf-shipyard-overlay[data-layout='compact-stacked'] .pf-shipyard-control-group:last-child {
    grid-column: 1 / -1;
  }
  .pf-shipyard-overlay[data-layout='compact-stacked'] .pf-shipyard-details { justify-content: flex-start; }
  .pf-shipyard-overlay[data-layout='compact-stacked'] .pf-shipyard-name-row { padding-bottom: 6px; }
  .pf-shipyard-overlay[data-layout='compact-stacked'] .pf-shipyard-capacity { margin-top: 7px; }
  .pf-shipyard-overlay[data-layout='compact-stacked'] .pf-shipyard-price { margin: 7px 0 5px; }
  .pf-shipyard-overlay[data-layout='compact-stacked'] .pf-shipyard-live {
    min-height: 19px;
    margin-top: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    .pf-shipyard-live:not(:empty) { animation: none; }
    .pf-shipyard-arrow:active,
    .pf-shipyard-purchase:not(:disabled):active,
    .pf-shipyard-close:active { transform: none; }
  }
`;
