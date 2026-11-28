import React from 'react';
import { useTranslation } from 'react-i18next';
import { DRAFT_MODE } from '../config/draftMode.js';
import { SoundControls } from './SoundControls.jsx';
import { BRAND, WORLD_ART } from '../styles/brandColors.js';
import { useBlockingCanvasOverlay } from './ActiveCanvasStage.jsx';

export function openPauseInstructions(onInstructions, onResume) {
  if (typeof onInstructions !== 'function') return;
  onInstructions();
  onResume?.();
}

function measurePauseSurface(surfaceElement, overlayElement) {
  const gameRoot = overlayElement?.parentElement;
  const canvasArea = surfaceElement?.parentElement;
  if (!gameRoot || !canvasArea) return null;

  const rootRect = gameRoot.getBoundingClientRect();
  const canvasAreaRect = canvasArea.getBoundingClientRect();
  const overlayRect = overlayElement.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);

  const left = Math.max(rootRect.left, viewportLeft);
  const top = Math.max(rootRect.top, viewportTop);
  const right = Math.min(rootRect.right, viewportRight);
  const bottom = Math.min(rootRect.bottom, canvasAreaRect.bottom, viewportBottom);

  if (right <= left || bottom <= top) return null;
  return {
    left: left - overlayRect.left,
    top: top - overlayRect.top,
    width: right - left,
    height: bottom - top,
  };
}

function sameBounds(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return ['left', 'top', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) < 0.5);
}

export default function PauseOverlay({ onResume, onQuit, onInstructions, surfaceRef }) {
  useBlockingCanvasOverlay();
  const { t } = useTranslation();
  const s = DRAFT_MODE ? draftStyles : styles;
  const overlayRef = React.useRef(null);
  const [surfaceBounds, setSurfaceBounds] = React.useState(null);

  React.useLayoutEffect(() => {
    const surfaceElement = surfaceRef?.current;
    const overlayElement = overlayRef.current;
    if (!surfaceElement || !overlayElement) return undefined;

    const updateBounds = () => {
      const nextBounds = measurePauseSurface(surfaceElement, overlayElement);
      setSurfaceBounds((currentBounds) => (
        sameBounds(currentBounds, nextBounds) ? currentBounds : nextBounds
      ));
    };

    updateBounds();
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(updateBounds)
      : null;
    resizeObserver?.observe(surfaceElement);
    resizeObserver?.observe(surfaceElement.parentElement);
    resizeObserver?.observe(overlayElement.parentElement);
    window.addEventListener('resize', updateBounds);
    window.visualViewport?.addEventListener('resize', updateBounds);
    window.visualViewport?.addEventListener('scroll', updateBounds);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateBounds);
      window.visualViewport?.removeEventListener('resize', updateBounds);
      window.visualViewport?.removeEventListener('scroll', updateBounds);
    };
  }, [surfaceRef]);

  const handleKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onResume?.();
  };

  return (
    <div
      ref={overlayRef}
      data-pause-overlay="menu"
      style={s.overlay}
      onKeyDown={handleKeyDown}
    >
      <style>{PAUSE_OVERLAY_CSS}</style>
      <div
        data-pause-surface="game"
        style={{
          ...s.surface,
          ...(surfaceBounds ? {
            inset: 'auto',
            left: surfaceBounds.left,
            top: surfaceBounds.top,
            width: surfaceBounds.width,
            height: surfaceBounds.height,
          } : {}),
        }}
      >
        <section
          className="pf-pause-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-overlay-title"
          style={s.card}
        >
          <div className="pf-pause-title-band" style={s.titleBand}>
            <span className="pf-pause-mark" aria-hidden="true" style={s.pauseMark}>Ⅱ</span>
            <h2 className="pf-pause-title" id="pause-overlay-title" style={s.title}>{t('game.pause')}</h2>
          </div>

          <div className="pf-pause-actions" style={s.buttons}>
            <button
              type="button"
              autoFocus
              onClick={onResume}
              className="pf-pause-action pf-pause-action--resume"
              style={{ ...s.action, ...s.resumeBtn }}
            >
              <span className="pf-pause-action-icon" aria-hidden="true" style={s.actionIcon}>▶</span>
              <span>{t('game.resume')}</span>
            </button>

            {onInstructions && (
              <button
                type="button"
                onClick={() => openPauseInstructions(onInstructions, onResume)}
                className="pf-pause-action pf-pause-action--guide"
                style={{ ...s.action, ...s.guideBtn }}
              >
                <span className="pf-pause-action-icon" aria-hidden="true" style={s.actionIcon}>📖</span>
                <span>{t('game.goal_instructions')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onQuit}
              className="pf-pause-action pf-pause-action--quit"
              style={{ ...s.action, ...s.quitBtn }}
            >
              <span className="pf-pause-action-icon" aria-hidden="true" style={s.actionIcon}>←</span>
              <span>{t('game.quit')}</span>
            </button>
          </div>
          <SoundControls />
        </section>
      </div>
    </div>
  );
}

const PAUSE_OVERLAY_CSS = `
  .pf-pause-card {
    width: min(clamp(520px, 44vw, 1080px), calc(100vw - 32px));
    max-height: min(calc(100dvh - 32px), calc(100% - 32px));
    padding: clamp(24px, 2.5vw, 48px);
    gap: clamp(20px, 1.5vw, 30px);
  }
  .pf-pause-title-band {
    min-height: clamp(60px, 5vw, 88px);
    padding: clamp(8px, 1vw, 14px) clamp(16px, 2vw, 28px);
    gap: clamp(12px, 1.2vw, 20px);
  }
  .pf-pause-title {
    font-size: clamp(30px, 2.7vw, 56px) !important;
  }
  .pf-pause-mark {
    font-size: clamp(26px, 2.3vw, 48px) !important;
  }
  .pf-pause-actions {
    gap: clamp(12px, 1vw, 18px);
  }
  .pf-pause-action {
    min-height: clamp(56px, 4vw, 80px);
    padding: clamp(10px, 1vw, 16px) clamp(18px, 3vw, 46px);
    grid-template-columns: clamp(28px, 2.4vw, 44px) minmax(0, 1fr) !important;
    gap: clamp(10px, 1.2vw, 18px) !important;
    font-size: clamp(18px, 1.45vw, 27px) !important;
    transition: transform 80ms linear, box-shadow 80ms linear, filter 80ms linear;
  }
  .pf-pause-action-icon {
    font-size: clamp(18px, 1.6vw, 30px) !important;
  }
  .pf-pause-action:hover {
    filter: brightness(1.08);
  }
  .pf-pause-action:focus-visible {
    outline: 4px solid ${BRAND.purple};
    outline-offset: 3px;
  }
  .pf-pause-action:active {
    transform: translate(3px, 3px);
    box-shadow: 1px 1px 0 ${WORLD_ART.woodDeep};
  }
  @media (max-width: 600px) {
    .pf-pause-card {
      width: calc(100vw - 24px);
      padding: 18px;
      gap: 16px;
    }
    .pf-pause-title-band {
      min-height: 56px;
    }
    .pf-pause-title {
      font-size: 28px !important;
    }
  }
  @media (max-height: 520px) {
    .pf-pause-card {
      width: min(620px, calc(100vw - 24px));
      max-height: min(calc(100dvh - 16px), calc(100% - 16px));
      padding: 12px 18px;
      gap: 10px;
    }
    .pf-pause-title-band {
      min-height: 44px;
      padding: 4px 12px;
      gap: 10px;
    }
    .pf-pause-title {
      font-size: 26px !important;
    }
    .pf-pause-mark {
      font-size: 23px !important;
    }
    .pf-pause-actions {
      gap: 8px;
    }
    [data-pause-overlay="menu"] .pf-pause-action {
      min-height: 48px;
      padding: 7px 16px;
      grid-template-columns: 26px minmax(0, 1fr) !important;
      gap: 9px !important;
      font-size: 16px !important;
    }
    .pf-pause-action-icon {
      font-size: 17px !important;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pf-pause-action {
      transition: none;
    }
  }
`;

const sharedStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(8, 30, 58, 0.84)',
    overflow: 'hidden',
    zIndex: 240,
  },
  surface: {
    position: 'absolute',
    inset: 0,
    padding: 'clamp(16px, 4vmin, 32px)',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflowY: 'auto',
  },
  card: {
    boxSizing: 'border-box',
    background: WORLD_ART.panelCream,
    border: `4px solid ${WORLD_ART.woodDeep}`,
    borderRadius: 0,
    clipPath: 'polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)',
    display: 'flex',
    flexDirection: 'column',
    imageRendering: 'pixelated',
    overflowY: 'auto',
    fontFamily: "'Fredoka', system-ui, sans-serif",
  },
  titleBand: {
    boxSizing: 'border-box',
    background: WORLD_ART.textGreen,
    border: `4px solid ${WORLD_ART.woodDeep}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseMark: {
    color: BRAND.yellowSoft,
    fontWeight: 900,
    lineHeight: 1,
  },
  title: {
    margin: 0,
    color: BRAND.cream,
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: '0.02em',
  },
  buttons: {
    display: 'flex',
    flexDirection: 'column',
  },
  action: {
    width: '100%',
    boxSizing: 'border-box',
    border: `3px solid ${WORLD_ART.woodDeep}`,
    borderRadius: 0,
    clipPath: 'polygon(7px 0, calc(100% - 7px) 0, 100% 7px, 100% calc(100% - 7px), calc(100% - 7px) 100%, 7px 100%, 0 calc(100% - 7px), 0 7px)',
    color: BRAND.textOnColor,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 800,
    lineHeight: 1.15,
    textAlign: 'left',
    display: 'grid',
    alignItems: 'center',
  },
  actionIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  resumeBtn: {
    background: WORLD_ART.grassDark,
  },
  guideBtn: {
    background: BRAND.blue,
  },
  quitBtn: {
    background: WORLD_ART.woodShadow,
  },
};

const styles = {
  ...sharedStyles,
  card: {
    ...sharedStyles.card,
    boxShadow: `6px 0 0 ${BRAND.yellowSoft}, -6px 0 0 ${BRAND.yellowSoft}, 0 6px 0 ${BRAND.yellowSoft}, 0 -6px 0 ${BRAND.yellowSoft}, 12px 12px 0 rgba(0, 0, 0, 0.42), inset 4px 4px 0 rgba(255,255,255,0.5), inset -4px -4px 0 rgba(76,56,38,0.18)`,
  },
  action: {
    ...sharedStyles.action,
    boxShadow: `5px 5px 0 ${WORLD_ART.woodDeep}, inset 0 3px 0 rgba(255,255,255,0.18)`,
  },
};

const draftStyles = {
  ...sharedStyles,
  overlay: {
    ...sharedStyles.overlay,
    background: 'rgba(8, 30, 58, 0.92)',
  },
};
