import React, { useRef, useEffect, useReducer, useState } from 'react';
import { keyBelongsToDomTarget } from '../utils/keyOwnership.js';
import { useTranslation } from 'react-i18next';
import useGameStore from '../store/gameStore.js';
import useOverworldCanvas from '../games/hooks/useOverworldCanvas.js';
import { buildAtlas } from '../overworld/tileAtlas.js';
import {
  LIGHTHOUSE_MAP, LIGHTHOUSE_PLAYER_START, LIGHTHOUSE_MENTOR, LIGHTHOUSE_STATIONS,
  isLighthouseWalkable, buildTrophyState, nextIslandToTackle, pendingGoldCeremonies,
  isFacingLighthouseShipyard,
} from '../overworld/lighthouseData.js';
import { buildBookshelf, unlockedSpines } from '../overworld/lighthouseBookshelf.js';
import { TILE } from '../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H, TILE_SIZE, DIR } from '../overworld/overworldData.js';
import { updatePlayerMovement, getFacingTile } from '../games/engine/gameRoomLogic.js';
import {
  roomToCanvas, applyRoomCamera, releaseRoomCamera,
} from '../games/engine/gameRoomRenderer.js';
import {
  renderLighthouseBackground, renderLighthouseTiles, renderLighthouseStations,
  renderLighthousePlayer, renderLighthouseMentor, renderLighthousePrompt,
  renderLighthouseDialog, renderCompassBubble, renderBookPanel,
  renderGoldCeremony, renderLighthouseBackButton, renderLighthouseShipyard, OX, OY,
} from '../overworld/lighthouseRoomRenderer.js';
import { initFinale, updateFinale, renderFinaleCeremony } from '../overworld/finaleCeremony.js';
import { drawIrisWipe, IRIS_DURATION, getCanvasPointer, hitTest } from '../utils/canvas.js';
import { playMusicCue } from '../utils/music.js';
import { playSound } from '../utils/sound.js';
import { BRAND, WORLD_ART } from '../styles/brandColors.js';
import PhygitalModal from '../components/PhygitalModal.jsx';
import BoatUpgradePanel from '../components/BoatUpgradePanel.jsx';

const LIGHTHOUSE_ONBOARDING_STEP_COUNT = 3;
const LIGHTHOUSE_CAMERA_ROOM = {
  cameraFocus: {
    col: LIGHTHOUSE_MAP[0].length / 2,
    row: LIGHTHOUSE_MAP.length / 2,
  },
};

export function getLighthouseCanvasPoint(x, y) {
  return roomToCanvas(LIGHTHOUSE_CAMERA_ROOM, x, y);
}

export function exposeLighthouseStateForTesting(canvas, stateRef, isDev = import.meta.env.DEV) {
  if (!isDev || !canvas) return undefined;
  canvas._stateRef = stateRef;
  return () => {
    if (canvas._stateRef === stateRef) delete canvas._stateRef;
  };
}

export function getLighthousePostboxRect() {
  const { col, row } = LIGHTHOUSE_STATIONS.qr;
  const topLeft = getLighthouseCanvasPoint(OX + col * TILE_SIZE, OY + row * TILE_SIZE);
  const bottomRight = getLighthouseCanvasPoint(
    OX + (col + 1) * TILE_SIZE,
    OY + (row + 1) * TILE_SIZE,
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

export function shouldOpenLighthousePostbox(state, overlayOpen = false) {
  if (!state || overlayOpen) return false;
  if (!state.nearQR || state.irisClosing) return false;
  if (state.finale && !state.finale.claimReady) return false;
  if (state.keeperDialog || state.bookOpen || state.ceremony) return false;
  return true;
}

export function shouldOpenLighthousePostboxFromPointer(pointer, state, overlayOpen = false) {
  if (!pointer || !shouldOpenLighthousePostbox(state, overlayOpen)) return false;
  return hitTest(pointer, getLighthousePostboxRect());
}

export function shouldOpenLighthouseShipyard(state, overlayOpen = false) {
  if (!state?.nearShipyard || overlayOpen || state.irisClosing) return false;
  if (state.keeperDialog || state.bookOpen || state.ceremony) return false;
  if (state.finale && !state.finale.claimReady) return false;
  return true;
}

export function shouldOpenLighthouseShipyardFromPointer(pointer, state, overlayOpen = false) {
  if (!pointer || !state) return false;
  const overStation = Boolean(
    state.shipyardHitRect && hitTest(pointer, state.shipyardHitRect),
  );
  return shouldOpenLighthouseShipyard({
    ...state,
    nearShipyard: state.nearShipyard || overStation,
  }, overlayOpen);
}

export function createLighthouseOnboardingState(hasSeenOnboarding) {
  return { open: !hasSeenOnboarding, step: 0 };
}

export function reduceLighthouseOnboarding(state, action) {
  if (action.type === 'skip') return { ...state, open: false };
  if (action.type === 'back') return { ...state, step: Math.max(0, state.step - 1) };
  if (action.type === 'next') {
    if (state.step >= LIGHTHOUSE_ONBOARDING_STEP_COUNT - 1) {
      return { ...state, open: false };
    }
    return { ...state, step: state.step + 1 };
  }
  return state;
}

export function shouldFocusLighthouseCanvas(atlasReady, onboardingOpen) {
  return atlasReady && !onboardingOpen;
}

export function getLighthouseKeeperSprites(atlas) {
  return atlas?.lighthouseKeeper || null;
}

export function buildLighthouseIslandShortNames(translate) {
  return {
    growing: translate('islands.growing.short_name'),
    local: translate('islands.local.short_name'),
    foodwaste: translate('islands.foodwaste.short_name'),
    circular: translate('islands.circular.short_name'),
  };
}

const instructionText = (text) => ({ type: 'text', text });
const instructionKey = (text, variant = 'keyboard') => ({ type: 'key', text, variant });

export function buildLighthouseOnboardingSteps(translate) {
  return [
    {
      symbol: { type: 'action', label: 'A' },
      title: translate('lighthouse.onboarding_step1_title'),
      sections: [{
        id: 'keeper',
        lines: [
          [instructionText(translate('lighthouse.onboarding_step1_approach'))],
          [
            instructionText(translate('lighthouse.onboarding_step1_keyboard_prefix')),
            instructionKey('Enter'),
            instructionText(translate('lighthouse.onboarding_step1_keyboard_between')),
            instructionKey('Space'),
            instructionText(translate('lighthouse.onboarding_step1_keyboard_suffix')),
          ],
          [
            instructionText(translate('lighthouse.onboarding_step1_touch_prefix')),
            instructionKey('A', 'action'),
            instructionText(translate('lighthouse.onboarding_step1_touch_suffix')),
          ],
        ],
      }],
    },
    {
      symbol: { type: 'library', label: '📚' },
      title: translate('lighthouse.onboarding_step2_title'),
      sections: [
        {
          id: 'library',
          icon: '📚',
          title: translate('lighthouse.onboarding_step2_library_title'),
          lines: [[instructionText(translate('lighthouse.onboarding_step2_library_body'))]],
        },
        {
          id: 'activity-code',
          icon: '🎟️',
          title: translate('lighthouse.onboarding_step2_code_title'),
          lines: [[instructionText(translate('lighthouse.onboarding_step2_code_body'))]],
        },
      ],
    },
    {
      symbol: { type: 'compass', label: '🧭' },
      title: translate('lighthouse.onboarding_step3_title'),
      sections: [{
        id: 'next-stop',
        lines: [
          [instructionText(translate('lighthouse.onboarding_step3_progress'))],
          [instructionText(translate('lighthouse.onboarding_step3_compass'))],
        ],
      }],
    },
  ];
}

function LighthouseInstructionSegments({ segments }) {
  return segments.map((segment, index) => {
    if (segment.type !== 'key') {
      return <React.Fragment key={index}>{segment.text}</React.Fragment>;
    }
    return (
      <kbd
        key={index}
        style={{
          ...onboardingStyles.keycap,
          ...(segment.variant === 'action' ? onboardingStyles.actionKeycap : {}),
        }}
      >
        {segment.text}
      </kbd>
    );
  });
}

function LighthouseInstructionSections({ sections }) {
  return (
    <div style={onboardingStyles.instructionContent}>
      {sections.map((section) => (
        <section
          key={section.id}
          data-instruction-section={section.id}
          style={onboardingStyles.instructionSection}
        >
          {section.title && (
            <h3 style={onboardingStyles.instructionHeading}>
              {section.icon && <span aria-hidden="true">{section.icon} </span>}
              {section.title}
            </h3>
          )}
          {section.lines.map((segments, index) => (
            <p key={index} data-instruction-line={index + 1} style={onboardingStyles.instructionLine}>
              <LighthouseInstructionSegments segments={segments} />
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

export function LighthouseOnboarding({ step, steps, labels, onNext, onBack, onSkip }) {
  const dialogRef = useRef(null);
  const current = steps[step] || steps[0];
  const isLast = step === steps.length - 1;

  useEffect(() => {
    dialogRef.current?.focus();
  }, [step]);

  const handleKeyDown = (event) => {
    event.stopPropagation();
    const activationKey = event.key === 'Enter' || event.key === ' ';
    const focusedButton = event.target instanceof Element && event.target.closest('button');

    if (event.key === 'Escape') {
      event.preventDefault();
      onSkip();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onBack();
    } else if (event.key === 'ArrowRight' || (activationKey && !focusedButton)) {
      event.preventDefault();
      onNext();
    }
  };

  return (
    <div className="pf-lighthouse-onboarding" style={onboardingStyles.overlay}>
      <style>{`
        .pf-lighthouse-onboarding button:focus-visible {
          outline: 4px solid ${BRAND.yellowSoft};
          outline-offset: 3px;
        }
        .pf-lighthouse-onboarding button:hover { filter: brightness(1.08); }
        @media (max-width: 600px) {
          .pf-lighthouse-onboarding-card { padding: 16px 14px 14px !important; }
          .pf-lighthouse-onboarding-stage { grid-template-columns: 1fr !important; text-align: center; }
          .pf-lighthouse-onboarding-symbol {
            width: 64px !important;
            height: 64px !important;
            margin: 0 auto;
            font-size: 32px !important;
          }
          .pf-lighthouse-onboarding-footer { align-items: stretch !important; }
        }
        /* Phone landscape: the height-based width made a 314px-wide card taller than the screen. */
        @media (max-height: 500px) {
          .pf-lighthouse-onboarding { place-items: start center !important; }
          .pf-lighthouse-onboarding-card { width: min(720px, calc(100vw - 28px)) !important; padding: 12px 16px 0 !important; }
          .pf-lighthouse-onboarding-stage { min-height: 0 !important; padding: 10px 0 8px !important; }
          .pf-lighthouse-onboarding-footer {
            position: sticky; bottom: 0; padding: 8px 0 12px;
            background: ${WORLD_ART.panelCream};
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .pf-lighthouse-onboarding * { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div style={onboardingStyles.beam} aria-hidden="true" />
      <section
        ref={dialogRef}
        className="pf-lighthouse-onboarding-card"
        style={onboardingStyles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lighthouse-onboarding-title"
        tabIndex={-1}
        data-onboarding-step={`${step + 1}-of-${steps.length}`}
        onKeyDown={handleKeyDown}
      >
        <header style={onboardingStyles.header}>
          <p style={onboardingStyles.eyebrow}>{labels.eyebrow}</p>
          <div style={onboardingStyles.progress} aria-label={labels.progress}>
            {steps.map((_, index) => (
              <span
                key={index}
                style={{
                  ...onboardingStyles.progressStep,
                  ...(index < step ? onboardingStyles.progressDone : {}),
                  ...(index === step ? onboardingStyles.progressCurrent : {}),
                }}
                aria-hidden="true"
              >
                {index + 1}
              </span>
            ))}
          </div>
        </header>

        <div className="pf-lighthouse-onboarding-stage" style={onboardingStyles.stage}>
          <div
            className="pf-lighthouse-onboarding-symbol"
            style={{
              ...onboardingStyles.symbol,
              ...(current.symbol?.type === 'action' ? onboardingStyles.actionSymbol : {}),
            }}
            data-onboarding-symbol={current.symbol?.type || 'default'}
            aria-hidden="true"
          >
            {current.symbol?.label || current.symbol}
          </div>
          <div>
            <h2 id="lighthouse-onboarding-title" style={onboardingStyles.title}>{current.title}</h2>
            {current.sections
              ? <LighthouseInstructionSections sections={current.sections} />
              : <p style={onboardingStyles.body}>{current.body}</p>}
          </div>
        </div>

        <p style={onboardingStyles.hint}>
          {labels.hintSegments
            ? <LighthouseInstructionSegments segments={labels.hintSegments} />
            : labels.hint}
        </p>

        <footer className="pf-lighthouse-onboarding-footer" style={onboardingStyles.footer}>
          <button type="button" style={onboardingStyles.skipButton} onClick={onSkip}>
            {labels.skip}
          </button>
          <div style={onboardingStyles.navigation}>
            {step > 0 && (
              <button type="button" style={onboardingStyles.backButton} onClick={onBack}>
                ◀ {labels.back}
              </button>
            )}
            <button type="button" style={onboardingStyles.nextButton} onClick={onNext}>
              {isLast ? labels.finish : labels.next} <span aria-hidden="true">▶</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

// Is the player standing on the exit mat? (EXIT_MAT tile under their feet)
function isOnExitMat(col, row) {
  return LIGHTHOUSE_MAP[row]?.[col] === TILE.EXIT_MAT;
}

// Is the player facing the Keeper's tile? (face-adjacent interaction)
function isFacingKeeper(player) {
  const f = getFacingTile(player);
  return f.col === LIGHTHOUSE_MENTOR.col && f.row === LIGHTHOUSE_MENTOR.row;
}

// Is the player facing the QR / phygital station? (same face-adjacent pattern)
function isFacingQR(player) {
  const f = getFacingTile(player);
  return f.col === LIGHTHOUSE_STATIONS.qr.col && f.row === LIGHTHOUSE_STATIONS.qr.row;
}

// Is the player orthogonally adjacent (Manhattan distance === 1) to the compass?
// Proximity-triggered (no facing requirement) so the bubble is discoverable just
// by walking past it — same feel as walking into a zone trigger.
function isNearCompass(player) {
  const dc = Math.abs(player.col - LIGHTHOUSE_STATIONS.compass.col);
  const dr = Math.abs(player.row - LIGHTHOUSE_STATIONS.compass.row);
  return (dc === 1 && dr === 0) || (dc === 0 && dr === 1);
}

// Is the player facing the bookshelf interaction tile? (face-adjacent, like Keeper)
function isFacingBookshelf(player) {
  const f = getFacingTile(player);
  return f.col === LIGHTHOUSE_STATIONS.bookshelf.col && f.row === LIGHTHOUSE_STATIONS.bookshelf.row;
}

export default function LighthouseRoom({ onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const [showPhygital, setShowPhygital] = useState(false);
  const [touchPrompt, setTouchPrompt] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
  );
  useEffect(() => {
    const onPointer = (event) => setTouchPrompt(event.pointerType !== 'mouse');
    const onKey = (event) => {
      // The on-screen A sends a synthetic Enter. Keep the touch hint for that input.
      if (event.isTrusted) setTouchPrompt(false);
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
  const [showShipyard, setShowShipyard] = useState(false);
  const atlasRef = useRef(null);
  const lighthouseOnboardingSeen = useGameStore((s) => s.lighthouseOnboardingSeen);
  const markLighthouseOnboardingSeen = useGameStore((s) => s.markLighthouseOnboardingSeen);
  const [onboarding, dispatchOnboarding] = useReducer(
    reduceLighthouseOnboarding,
    lighthouseOnboardingSeen,
    createLighthouseOnboardingState,
  );
  const showOnboarding = onboarding.open && !lighthouseOnboardingSeen;
  const onboardingOpenRef = useRef(showOnboarding);
  onboardingOpenRef.current = showOnboarding;

  const finishOnboarding = (action) => {
    const nextState = reduceLighthouseOnboarding(onboarding, { type: action });
    dispatchOnboarding({ type: action });
    if (!nextState.open) {
      markLighthouseOnboardingSeen();
      requestAnimationFrame(() => canvasRef.current?.focus());
    }
  };

  // Ref mirror of showPhygital so the RAF loop + keydown handler (stale
  // closures) can see the live value and pause room input while the DOM
  // modal is up — same gating pattern other screens use behind a modal.
  const showPhygitalRef = useRef(false);
  showPhygitalRef.current = showPhygital;
  const showShipyardRef = useRef(false);
  showShipyardRef.current = showShipyard;

  // Live store snapshot → trophy state (every station reads a REAL field).
  // Per-field selectors keep the component reactive: any progress change
  // re-renders and the canvas loop picks up the fresh trophyRef next frame.
  const completedMissions = useGameStore((s) => s.completedMissions);
  const points = useGameStore((s) => s.points);
  const boatTier = useGameStore((s) => s.boatTier);
  const purchaseBoatTier = useGameStore((s) => s.purchaseBoatTier);
  const redeemedCodes = useGameStore((s) => s.redeemedCodes);
  const gameStars = useGameStore((s) => s.gameStars);
  const lighthouseGoldSeen = useGameStore((s) => s.lighthouseGoldSeen);
  const markGoldSeen = useGameStore((s) => s.markGoldSeen);
  const finaleClaimed = useGameStore((s) => s.finaleClaimed);

  const trophyRef = useRef(null);
  trophyRef.current = buildTrophyState({
    completedMissions, points, redeemedCodes, gameStars,
  });

  // Keep live refs for the ceremony so the RAF update loop avoids stale closures.
  const markGoldSeenRef = useRef(markGoldSeen);
  markGoldSeenRef.current = markGoldSeen;
  const lighthouseGoldSeenRef = useRef(lighthouseGoldSeen);
  lighthouseGoldSeenRef.current = lighthouseGoldSeen;

  // Bookshelf state — recomputed whenever completedMissions changes.
  // buildBookshelf is a pure function so this is cheap; we keep a ref so the
  // RAF loop always reads the latest version without needing React re-renders.
  const shelvesRef = useRef(null);
  shelvesRef.current = buildBookshelf(completedMissions);

  // Counts for the Keeper's welcome line — read straight off the trophy state
  // so the dialog reports REAL progress: missions done / total, islands lit.
  const trophy = trophyRef.current;
  const islandStates = Object.values(trophy.islands);
  const missionsDone = islandStates.reduce((sum, isl) => sum + (isl.count || 0), 0);
  const islandsLit = islandStates.filter((isl) => isl.done).length;
  const TOTAL_MISSIONS = islandStates.length * 3; // 4 islands × 3 → 12
  const isAllComplete = missionsDone === TOTAL_MISSIONS; // gates the Grand Finale ceremony

  // Fresh ref for the RAF/keydown closures: is the Keeper's finale dialog available?
  // (all 12 done AND the certificate not yet claimed). Talking to the Keeper in this
  // state opens the finale dialog; dismissing it claims the diploma + starts the merge.
  const finaleAvailableRef = useRef(false);
  finaleAvailableRef.current = isAllComplete && !finaleClaimed;
  // After the claim, the Keeper offers to show the diploma again. That path
  // only navigates: no claimFinale/startFinaleMerge, so nothing is credited twice.
  const certificateReviewRef = useRef(false);
  certificateReviewRef.current = isAllComplete && finaleClaimed;

  // Pre-translate every canvas string here (the RAF loop can't call t()).
  // All keys live in the `lighthouse` namespace across en/el/nl/pt; the plinth
  // labels REUSE the shared islands.{slug}.name keys (no duplicate strings).
  //
  // One canonical naming source for the map, island rooms, certificate, plinths,
  // and compass. This prevents generic Lighthouse-only labels drifting again.
  const plinthNicks = buildLighthouseIslandShortNames(t);

  // compassBubble: computed here where both t() and trophy are in scope.
  // The renderer receives a ready { line1, line2? } object and draws it verbatim.
  // Uses the short nick (not the full island name) so the bubble stays compact.
  const nextSlug = nextIslandToTackle(trophy);
  const compassBubble = (() => {
    if (!nextSlug) {
      return { line1: t('lighthouse.compass_alldone') };
    }
    const nick = plinthNicks[nextSlug] || t(`islands.${nextSlug}.name`);
    const remaining = 3 - (trophy.islands[nextSlug]?.count || 0);
    return {
      line1: t('lighthouse.compass_next', { island: nick }),
      line2: t('lighthouse.compass_left', { n: remaining }),
    };
  })();

  const i18nRef = useRef({});
  i18nRef.current = {
    backLabel: t('nav.back'),
    keeperName: t('lighthouse.keeper_name'),
    keeperPrompt: t('lighthouse.keeper_prompt'),
    keeperWelcome: t('lighthouse.keeper_welcome', {
      done: missionsDone, total: TOTAL_MISSIONS, islands: islandsLit,
    }),
    exitPrompt: t('lighthouse.exit_prompt'),
    qrPrompt: t(touchPrompt ? 'lighthouse.qr_prompt_touch' : 'lighthouse.qr_prompt'),
    shipyardPrompt: t('lighthouse.shipyard.prompt'),
    // The Keeper's Grand Finale line (12/12). Dismissing this dialog claims the diploma.
    keeperFinale: t('lighthouse.keeper_finale'),
    keeperCertificateAgain: t('lighthouse.keeper_certificate_again'),
    dialogContinue: t('island.dialog_continue'),
    // Bookshelf interaction prompt
    bookshelfPrompt: t('lighthouse.bookshelf_prompt'),
    // Plinth labels — reuse the canonical island names (islands.{slug}.name).
    plinthLabels: {
      growing: t('islands.growing.name'),
      local: t('islands.local.name'),
      foodwaste: t('islands.foodwaste.name'),
      circular: t('islands.circular.name'),
    },
    // Short kid-friendly nicknames for under-plinth labels + compass bubble.
    plinthNicks,
    // Gold ceremony cheer strings — one per island, pre-translated. The update
    // loop picks the right one when the ceremony beat fires (no t() in RAF).
    goldCheer: {
      growing:   t('lighthouse.gold_cheer', { island: t('islands.growing.name') }),
      local:     t('lighthouse.gold_cheer', { island: t('islands.local.name') }),
      foodwaste: t('lighthouse.gold_cheer', { island: t('islands.foodwaste.name') }),
      circular:  t('lighthouse.gold_cheer', { island: t('islands.circular.name') }),
    },
    // Compass speech-bubble — ready-to-render strings (no t() in the RAF loop).
    compassBubble,
    // Book panel strings — pre-translated so the RAF loop can draw them verbatim.
    bookPanel: {
      hook: t('lighthouse.book_hook'),
      pressS: t('lighthouse.book_press_s'),
      none: t('lighthouse.book_none'),
      pending: t('lighthouse.book_pending'),
      close: t('island.dialog_continue'),
      arrowHint: '◀ ▶',
    },
  };

  const onboardingSteps = buildLighthouseOnboardingSteps(t);
  const onboardingLabels = {
    eyebrow: t('lighthouse.onboarding_eyebrow'),
    progress: t('lighthouse.onboarding_progress', {
      current: onboarding.step + 1,
      total: LIGHTHOUSE_ONBOARDING_STEP_COUNT,
    }),
    skip: t('lighthouse.onboarding_skip'),
    back: t('lighthouse.onboarding_back'),
    next: t('lighthouse.onboarding_next'),
    finish: t('lighthouse.onboarding_finish'),
    hintSegments: [
      instructionKey('Enter'),
      instructionText(t('lighthouse.onboarding_hint_or')),
      instructionKey('Space'),
      instructionText(t('lighthouse.onboarding_hint_continue')),
      instructionKey('Esc'),
      instructionText(t('lighthouse.onboarding_hint_close')),
    ],
  };

  // Build tile atlas once
  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  // Auto-focus canvas so keyboard works immediately
  useEffect(() => {
    if (shouldFocusLighthouseCanvas(atlasReady, showOnboarding) && canvasRef.current) {
      canvasRef.current.focus();
    }
  }, [atlasReady, showOnboarding]);

  const start = LIGHTHOUSE_PLAYER_START;

  const { stateRef } = useOverworldCanvas(canvasRef, {
    setup: (state) => {
      state.player = {
        col: start.col,
        row: start.row,
        pixelX: start.col * TILE_SIZE,
        pixelY: start.row * TILE_SIZE,
        dir: start.dir ?? DIR.UP,
        moving: false,
        moveTimer: 0,
        fromX: 0, fromY: 0, toX: 0, toY: 0,
      };

      state.time = 0;
      state.nearKeeper = false;
      state.nearQR = false;
      state.nearCompass = false;
      state.nearBookshelf = false;
      state.nearShipyard = false;
      state.shipyardSparkleUntil = 0;
      state.onExit = false;
      state.keeperDialog = null;
      state.bookOpen = null;   // null | spine object | { id:null } for empty-state panel
      state.bookIndex = 0;     // current position in unlockedSpines flat array
      state.strings = i18nRef.current;
      state.irisOpenness = 0;    // starts closed, opens up
      state.irisClosing = false; // true while exiting

      // Gold ceremony — computed on entry from fresh trophy + persisted seen list.
      // { queue: string[], idx: number, t: number } or null when nothing to show.
      const freshGold = pendingGoldCeremonies(trophyRef.current, lighthouseGoldSeenRef.current);
      state.ceremony = freshGold.length > 0
        ? { queue: freshGold, idx: 0, t: 0 }
        : null;

      // Grand Finale (12/12) — shown once, AFTER any pending gold ceremonies clear.
      // Just the celebration (plinth glow + confetti); the reward is claimed by
      // talking to the Keeper, not an on-canvas button.
      state.finale = (isAllComplete && !finaleClaimed) ? initFinale() : null;
      state.allComplete = isAllComplete;

      // Dedicated Keeper frames, prebuilt once in the shared pixel atlas.
      state.mentorSprites = getLighthouseKeeperSprites(atlasRef.current);
    },

    update: (state, dt, keys) => {
      state.time += dt;
      state.strings = i18nRef.current;
      state.allComplete = isAllComplete; // gates the postbox prompt during the finale

      // Iris wipe animation
      if (state.irisClosing) {
        state.irisOpenness = Math.max(0, state.irisOpenness - dt / IRIS_DURATION);
      } else if (state.irisOpenness < 1) {
        state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
      }

      // Keep ceremonies and player input paused until the one-time guide closes.
      // This prevents a newly unlocked celebration from playing unseen below it.
      if (onboardingOpenRef.current) return;

      // Gold ceremony timing — runs before movement, independent of iris/dialog.
      // Each beat is CEREMONY_BEAT seconds long. On the first frame of each beat
      // (t crosses 0 from below), markGoldSeen + milestone cue fire exactly once.
      const CEREMONY_BEAT = 1.8; // seconds per island
      if (state.ceremony) {
        const cer = state.ceremony;
        if (cer.t === 0) {
          // Beat just started: mark seen + play fanfare
          const slug = cer.queue[cer.idx];
          markGoldSeenRef.current(slug);
          playMusicCue('milestone');
        }
        cer.t = Math.min(1, cer.t + dt / CEREMONY_BEAT);
        if (cer.t >= 1) {
          // Beat finished — advance to next island or clear ceremony
          if (cer.idx + 1 < cer.queue.length) {
            cer.idx += 1;
            cer.t = 0;
          } else {
            state.ceremony = null;
          }
        }
      }

      // Grand Finale — advance the celebration once the per-island gold beats finish.
      if (state.finale && !state.ceremony) updateFinale(state, dt);

      // Block input while iris is closing, a dialog is open, or the phygital
      // modal is up (the DOM modal owns the keyboard — freeze the room).
      if (state.irisClosing) return;
      if (state.keeperDialog) return;
      if (state.ceremony) return;   // ceremony running → freeze movement + interactions
      if (state.finale && !state.finale.claimReady) return; // finale sweep → freeze until claim ready
      if (state.bookOpen) return;   // book panel open → freeze movement
      if (showPhygitalRef.current) return;
      if (showShipyardRef.current) return;

      // Movement (clamped by lighthouse walkability)
      updatePlayerMovement(state.player, dt, keys, isLighthouseWalkable);

      const p = state.player;
      state.nearKeeper = isFacingKeeper(p);
      state.nearQR = isFacingQR(p);
      const wasNearCompass = state.nearCompass;
      state.nearCompass = isNearCompass(p);
      // Stamp the open time on the false→true edge so the compass bubble types
      // out fresh each time the player walks up to it.
      if (state.nearCompass && !wasNearCompass) state.compassOpenedAt = state.time;
      state.nearBookshelf = isFacingBookshelf(p);
      state.nearShipyard = isFacingLighthouseShipyard(p);
      state.onExit = isOnExitMat(p.col, p.row);
    },

    render: (ctx, state) => {
      if (!atlasRef.current) return;

      // The Lighthouse uses the same 1.5× world camera as the walk-around
      // games. Screen UI is drawn after restore so it stays crisp and compact.
      applyRoomCamera(ctx, LIGHTHOUSE_CAMERA_ROOM);
      renderLighthouseBackground(ctx, state.time);
      renderLighthouseTiles(ctx, atlasRef.current);
      renderLighthouseStations(ctx, trophyRef.current, state.time, state.strings, shelvesRef.current);
      renderLighthouseShipyard(
        ctx,
        state,
        atlasRef.current,
        boatTier,
        state.time,
        getLighthouseCanvasPoint,
      );
      renderLighthouseMentor(ctx, state, state.time);
      renderLighthousePlayer(ctx, state, atlasRef.current);
      releaseRoomCamera(ctx);

      renderCompassBubble(ctx, state, state.strings);
      renderLighthousePrompt(ctx, state);

      // Grand Finale celebration (plinth glow + confetti) — drawn BELOW the Keeper
      // dialog so the finale handover line stays readable on top of the confetti.
      if (state.finale && !state.ceremony) {
        renderFinaleCeremony(ctx, state, getLighthouseCanvasPoint);
      }

      renderLighthouseDialog(ctx, state);
      renderBookPanel(ctx, state, state.strings);

      // Canvas-native Back pill (top-left) — drawn after the room/panels but
      // before the ceremony + iris so those overlays cover it on exit.
      renderLighthouseBackButton(ctx, state, state.strings?.backLabel || 'Back');

      // Gold ceremony overlay — drawn above everything except the iris wipe
      if (state.ceremony) {
        const slug = state.ceremony.queue[state.ceremony.idx];
        const cheerStrings = {
          goldCheer: state.strings?.goldCheer?.[slug] || '🏆',
        };
        renderGoldCeremony(ctx, state, cheerStrings, getLighthouseCanvasPoint);
      }

      // Iris wipe overlay (centered on the player)
      const pp = state.player;
      const irisPoint = getLighthouseCanvasPoint(
        OX + pp.pixelX + 16,
        OY + pp.pixelY + 16,
      );
      drawIrisWipe(ctx, irisPoint.x, irisPoint.y, state.irisOpenness, CANVAS_W, CANVAS_H);
    },
  });

  // Mirror WorldMap's development-only browser-test bridge so E2E checks can
  // place the player deterministically without reaching through React internals.
  useEffect(() => exposeLighthouseStateForTesting(
    canvasRef.current,
    stateRef,
    import.meta.env.DEV,
  ), [atlasReady, stateRef]);

  const handleBoatPurchase = (targetTier) => {
    const result = purchaseBoatTier(targetTier);
    if (result.success) {
      playSound('success');
      const state = stateRef.current;
      state.shipyardSparkleUntil = state.time + 0.9;
    }
    return result;
  };

  const closeShipyard = () => {
    setShowShipyard(false);
    requestAnimationFrame(() => canvasRef.current?.focus());
  };

  // Enter — talk to the Keeper or leave via the exit mat | Escape — quick exit
  useEffect(() => {
    const triggerIrisExit = (target, data) => {
      const s = stateRef.current;
      if (s.irisClosing) return;
      s.irisClosing = true;
      setTimeout(() => onNavigate(target, data), IRIS_DURATION * 1000 + 80);
    };

    // Confirming the Keeper dialog (Enter/Space/click): the finale claims the diploma
    // and starts the merge; the review dialog just reopens the certificate.
    const confirmKeeperDialog = (s) => {
      const dialog = s.keeperDialog;
      s.keeperDialog = null;
      if (dialog.isFinale) {
        const store = useGameStore.getState();
        store.claimFinale();
        store.startFinaleMerge();
        triggerIrisExit('hub', {});
      } else if (dialog.isCertificateReview) {
        triggerIrisExit('certificate', {});
      }
    };

    const handleKeyDown = (e) => {
      const s = stateRef.current;
      if (s.irisClosing) return;
      if (onboardingOpenRef.current) return;
      if (e.repeat) return; // a held key must not close and reopen the dialog
      if (keyBelongsToDomTarget(e)) return; // a focused button/input owns this key

      // Book panel open — handle navigation FIRST (highest priority while open)
      if (s.bookOpen) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
          s.bookOpen = null;
          return;
        }
        // e.code covers non-Latin layouts: a Greek keyboard sends key 'σ' for
        // the physical S, which would otherwise never match.
        if (e.key === 's' || e.key === 'S' || e.code === 'KeyS') {
          // The url comes verbatim from sources.js — open source.html with the id
          if (s.bookOpen.id && s.bookOpen.url) {
            window.open(`source.html?src=${s.bookOpen.id}`, '_blank', 'noopener');
          }
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const flat = unlockedSpines(shelvesRef.current);
          if (flat.length === 0) return;
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          s.bookIndex = ((s.bookIndex + dir) + flat.length) % flat.length;
          s.bookOpen = flat[s.bookIndex];
          return;
        }
        return; // swallow all other keys while panel is open
      }

      // Existing dialog/modal owners stay ahead of the shipyard. Once the
      // shipyard is open, its capture listener owns every relevant key.
      if (s.keeperDialog) {
        if (e.key === 'Escape') s.keeperDialog = null;
        else if (e.key === 'Enter' || e.key === ' ') confirmKeeperDialog(s);
        return;
      }
      if (showPhygitalRef.current) return;
      if (showShipyardRef.current) return;

      if (e.key === 'Enter' || e.key === ' ') {
        // Confirm precedence (one interaction per press, in this exact order):
        //  1. On the exit mat      → leave to the hub
        //  2. Facing the Keeper    → open the welcome/finale dialog
        //  3. Facing the bookshelf → open the book panel
        //  4. Facing the shipyard  → open the boat carousel
        //  5. Facing the postbox   → open the phygital code modal
        if (s.onExit) {
          triggerIrisExit('hub', {});
          return;
        }
        if (s.nearKeeper) {
          // At 12/12 (unclaimed) the Keeper hands over the diploma; otherwise the welcome.
          if (finaleAvailableRef.current) {
            s.keeperDialog = { text: i18nRef.current.keeperFinale, openedAt: s.time, isFinale: true };
          } else if (certificateReviewRef.current) {
            s.keeperDialog = {
              text: i18nRef.current.keeperCertificateAgain, openedAt: s.time, isCertificateReview: true,
            };
          } else {
            s.keeperDialog = { text: i18nRef.current.keeperWelcome, openedAt: s.time };
          }
          return;
        }
        if (s.nearBookshelf) {
          const flat = unlockedSpines(shelvesRef.current);
          if (flat.length === 0) {
            // Empty-state sentinel: panel shows "finish a game first" message
            s.bookOpen = { id: null };
          } else {
            s.bookIndex = 0;
            s.bookOpen = flat[0];
          }
          return;
        }
        if (shouldOpenLighthouseShipyard(s, false)) {
          setShowShipyard(true);
          return;
        }
        if (shouldOpenLighthousePostbox(s)) {
          setShowPhygital(true);
        }
      } else if (e.key === 'Escape') {
        triggerIrisExit('hub', {});
      }
    };

    // Click/tap dismisses the Keeper dialog (mouse/touch parity with Enter). Dismissing
    // the Grand Finale dialog claims the diploma and starts the merge cinematic.
    const handleClick = () => {
      const s = stateRef.current;
      if (onboardingOpenRef.current) return;
      if (!s.keeperDialog) return;
      confirmKeeperDialog(s);
    };

    const canvas = canvasRef.current;
    window.addEventListener('keydown', handleKeyDown);
    canvas?.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      canvas?.removeEventListener('click', handleClick);
    };
  }, [onNavigate]);

  // Canvas Back pill — hover highlight + click/tap to leave the room for the map.
  // The renderer publishes the pill's rect on state.backButtonRect each frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (e) => {
      const s = stateRef.current;
      const pointer = getCanvasPointer(canvas, e);
      const overlayOpen = showPhygitalRef.current
        || showShipyardRef.current
        || onboardingOpenRef.current;
      const overBack = Boolean(s?.backButtonRect && hitTest(pointer, s.backButtonRect));
      const overShipyard = Boolean(
        s?.shipyardHitRect
        && hitTest(pointer, s.shipyardHitRect)
        && shouldOpenLighthouseShipyard({ ...s, nearShipyard: true }, overlayOpen),
      );
      const overPostbox = shouldOpenLighthousePostboxFromPointer(
        pointer,
        s,
        overlayOpen,
      );
      s.backButtonHover = overBack;
      canvas.style.cursor = overBack || overShipyard || overPostbox ? 'pointer' : 'default';
    };
    const onDown = (e) => {
      const s = stateRef.current;
      const pointer = getCanvasPointer(canvas, e);
      const overlayOpen = showPhygitalRef.current
        || showShipyardRef.current
        || onboardingOpenRef.current;
      if (shouldOpenLighthouseShipyardFromPointer(pointer, s, overlayOpen)) {
        e.preventDefault();
        setShowShipyard(true);
        return;
      }
      if (shouldOpenLighthousePostboxFromPointer(
        pointer,
        s,
        overlayOpen,
      )) {
        e.preventDefault();
        setShowPhygital(true);
        return;
      }
      const rect = s?.backButtonRect;
      if (!rect || !hitTest(pointer, rect)) return;
      // Don't leave while an overlay owns input (modal/dialog/book/ceremony/closing).
      if (s.irisClosing || s.keeperDialog || s.bookOpen || s.ceremony || overlayOpen) return;
      e.preventDefault();
      s.irisClosing = true;
      setTimeout(() => onNavigate('hub', {}), IRIS_DURATION * 1000 + 80);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
    };
  }, [onNavigate]);

  return (
    <div style={styles.container}>
      {!atlasReady && <div style={styles.loading}>Loading...</div>}
      <div style={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={styles.canvas}
          tabIndex={0}
        />
        {showShipyard && (
          <BoatUpgradePanel
            boatTier={boatTier}
            points={points}
            boatSprites={atlasRef.current?.boats}
            onPurchase={handleBoatPurchase}
            onClose={closeShipyard}
          />
        )}
      </div>
      {/* Phygital code redemption — opened from the in-room QR station */}
      <PhygitalModal
        isOpen={showPhygital}
        onClose={() => { setShowPhygital(false); canvasRef.current?.focus(); }}
      />
      {showOnboarding && (
        <LighthouseOnboarding
          step={onboarding.step}
          steps={onboardingSteps}
          labels={onboardingLabels}
          onNext={() => finishOnboarding('next')}
          onBack={() => dispatchOnboarding({ type: 'back' })}
          onSkip={() => finishOnboarding('skip')}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: WORLD_ART.oceanDeep,
    position: 'relative',
    overflow: 'hidden',
  },
  canvasWrapper: {
    position: 'relative',
    width: 'min(100vw, calc(100dvh * 1280 / 704))',
    height: 'min(100dvh, calc(100vw * 704 / 1280))',
    aspectRatio: '1280 / 704',
  },
  canvas: {
    width: '100%',
    height: '100%',
    imageRendering: 'pixelated',
    display: 'block',
    touchAction: 'none',
    outline: 'none',
  },
  loading: {
    position: 'absolute',
    color: '#fff',
    fontSize: 24,
    fontFamily: "'Fredoka', sans-serif",
  },
};

const onboardingStyles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 240,
    display: 'grid', placeItems: 'center', padding: 'clamp(14px, 3vw, 32px)',
    boxSizing: 'border-box', overflowY: 'auto',
    background: 'rgba(8, 30, 58, 0.74)',
    fontFamily: "'Fredoka', system-ui, sans-serif",
  },
  beam: {
    position: 'fixed', top: 0, bottom: 0, left: '50%',
    width: 'min(680px, 88vw)', transform: 'translateX(-50%)',
    background: 'rgba(247, 225, 164, 0.14)',
    clipPath: 'polygon(47% 0, 53% 0, 100% 100%, 0 100%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    // Same 700/1280 scale as the shared in-game MissionIntroCard. The second
    // expression covers height-constrained landscape screens below the ScoreBar.
    width: 'min(calc(54.6875vw - 8.75px), calc(99.4318dvh - 73.58px), calc(100vw - 28px))',
    boxSizing: 'border-box',
    padding: 'clamp(18px, min(calc(2.5vw - 0.4px), calc(4.5455dvh - 3.36px)), 32px)',
    background: WORLD_ART.panelCream, color: WORLD_ART.panelBrownDeep,
    border: `3px solid ${WORLD_ART.woodDeep}`, borderRadius: 0,
    boxShadow: `0 0 0 3px ${BRAND.yellowSoft}, 0 0 0 6px ${WORLD_ART.woodDeep}, 8px 8px 0 rgba(0,0,0,.26)`,
    outline: 'none', imageRendering: 'pixelated',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 14, paddingBottom: 12, borderBottom: `2px solid ${WORLD_ART.woodShadow}`,
  },
  eyebrow: {
    margin: 0, color: WORLD_ART.textGreen, fontSize: 'clamp(11px, 2vw, 13px)',
    fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
  },
  progress: { display: 'flex', alignItems: 'center', gap: 6 },
  progressStep: {
    width: 26, height: 26, display: 'grid', placeItems: 'center',
    boxSizing: 'border-box', background: '#E9DEC0', color: WORLD_ART.panelBrown,
    border: `2px solid ${WORLD_ART.woodShadow}`, fontSize: 12, fontWeight: 800,
  },
  progressDone: { background: BRAND.green, color: '#FFFFFF' },
  progressCurrent: {
    background: BRAND.yellowSoft, color: WORLD_ART.panelBrownDeep,
    boxShadow: `0 0 0 3px ${WORLD_ART.woodDeep}`,
  },
  stage: {
    display: 'grid', gridTemplateColumns: '78px 1fr', alignItems: 'center',
    gap: 'clamp(16px, 3vw, 22px)', minHeight: 142, padding: '17px 0 13px',
  },
  symbol: {
    width: 72, height: 72, display: 'grid', placeItems: 'center',
    boxSizing: 'border-box', background: BRAND.blueSoft,
    border: `3px solid ${WORLD_ART.woodDeep}`,
    boxShadow: `inset 4px 4px 0 rgba(255,255,255,.46), inset -4px -4px 0 rgba(35,95,183,.24), 4px 4px 0 ${WORLD_ART.woodShadow}`,
    fontSize: 36, lineHeight: 1, imageRendering: 'auto',
  },
  actionSymbol: {
    borderRadius: '50%', background: 'rgba(224,127,55,0.94)', color: '#FFFFFF',
    fontSize: 34, fontWeight: 900,
    boxShadow: `inset 4px 4px 0 rgba(255,255,255,.3), inset -4px -4px 0 rgba(109,76,65,.28), 4px 4px 0 ${WORLD_ART.woodShadow}`,
  },
  title: {
    margin: '0 0 8px', color: WORLD_ART.textGreen,
    fontSize: 'clamp(16px, min(calc(1.40625vw - 0.225px), calc(2.5568dvh - 1.89px)), 22px)',
    lineHeight: 1.12, fontWeight: 800,
  },
  body: {
    margin: 0, color: WORLD_ART.panelBrown,
    fontSize: 'clamp(14px, min(calc(1.171875vw - 0.188px), calc(2.1307dvh - 1.58px)), 18px)',
    lineHeight: 1.4, fontWeight: 600,
  },
  instructionContent: {
    display: 'grid', gap: 10,
    color: WORLD_ART.panelBrown,
    fontSize: 'clamp(14px, min(calc(1.171875vw - 0.188px), calc(2.1307dvh - 1.58px)), 18px)',
    lineHeight: 1.38, fontWeight: 600,
  },
  instructionSection: { display: 'grid', gap: 4 },
  instructionHeading: {
    margin: 0, color: WORLD_ART.textGreen,
    fontSize: '0.95em', lineHeight: 1.25, fontWeight: 850,
  },
  instructionLine: { margin: 0 },
  keycap: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '1.65em', margin: '0 0.16em', padding: '0.04em 0.48em',
    boxSizing: 'border-box', border: `2px solid ${WORLD_ART.woodDeep}`, borderRadius: 4,
    background: BRAND.blue, color: '#FFFFFF', boxShadow: `0 2px 0 ${WORLD_ART.woodDeep}`,
    fontFamily: "'Fredoka', system-ui, sans-serif", fontSize: '0.88em',
    lineHeight: 1, fontWeight: 900, whiteSpace: 'nowrap', verticalAlign: '0.05em',
  },
  actionKeycap: { borderRadius: '50%', background: 'rgba(224,127,55,0.98)', padding: '0.04em 0.5em' },
  hint: {
    margin: '0 0 12px', color: '#6D6658', fontSize: 11, fontWeight: 700,
    textAlign: 'center', letterSpacing: '0.03em',
  },
  footer: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 14, flexWrap: 'wrap',
  },
  navigation: { display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' },
  skipButton: {
    minHeight: 48, padding: '10px 14px', border: 'none', background: 'transparent',
    color: '#6D6658', font: 'inherit', fontWeight: 800, cursor: 'pointer',
    textDecoration: 'underline', textUnderlineOffset: 4,
  },
  backButton: {
    minHeight: 48, padding: '10px 18px', border: `3px solid ${WORLD_ART.woodDeep}`,
    borderRadius: 0, background: WORLD_ART.wood, color: WORLD_ART.panelBrownDeep,
    boxShadow: `0 4px 0 ${WORLD_ART.woodDeep}`, font: 'inherit', fontWeight: 800,
    cursor: 'pointer',
  },
  nextButton: {
    minHeight: 48, padding: '10px 22px', border: `3px solid ${WORLD_ART.woodDeep}`,
    borderRadius: 0, background: BRAND.blue, color: '#FFFFFF',
    boxShadow: `0 4px 0 ${WORLD_ART.woodDeep}`, font: 'inherit', fontWeight: 800,
    cursor: 'pointer',
  },
};
