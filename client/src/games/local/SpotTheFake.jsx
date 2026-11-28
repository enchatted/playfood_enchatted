import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas } from '../../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import {
  updatePlayerMovement, isEnterJustPressed, checkInteraction, resolveInteraction, REACH,
  TILE_SIZE as TS, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomTiles, renderGameRoomPlayer,
  renderGameRoomDecorations, renderActionPrompt,
  spawnSparkles, spawnFloatingText, spawnRejectX,
  updateParticles, renderParticles, updateFloatingTexts, renderFloatingTexts,
  updateRejectX, renderRejectX, OX, OY,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
  initMissionIntro, renderMissionIntroCard,
} from '../engine/gameRoomRenderer.js';
import {
  packageShapeForProduct, renderMarketFixtures, renderShelfProducts,
  createSpotTheFakeShoppers, updateSpotTheFakeShoppers, renderSpotTheFakePeople,
  renderSpotTheFakeGuideHint,
  syncSpotTheFakeOverlayHitRects,
} from '../engine/spotTheFakeRenderer.js';
import { missionIntroSourceId } from '../engine/missionIntroLogic.js';
import {
  drawIrisWipe, IRIS_DURATION, getCanvasPointer, hitTest,
} from '../../utils/canvas.js';
import {
  buildDeck, judge, scoreSpotTheFakeRun, PRODUCT_REVEALS,
  POINTS_FIRST_TRY, POINTS_RECOVERED, BONUS_FLAWLESS,
} from '../../data/local.js';
import PauseOverlay from '../../components/PauseOverlay.jsx';
import { useBlockingCanvasOverlay } from '../../components/ActiveCanvasStage.jsx';
import SpotTheFakeHud from './SpotTheFakeHud.jsx';
import SpotTheFakeInspector from './SpotTheFakeInspector.jsx';
import SpotTheFakeTeachingPanel from './SpotTheFakeTeachingPanel.jsx';
import SpotTheFakeIntroAction from './SpotTheFakeIntroAction.jsx';
import './SpotTheFake.css';

/**
 * SpotTheFake — Local and Seasonal Eating, Mission 3 (CHALLENGE).
 *
 * Walk a supermarket aisle and inspect packaged products front→back. The flashy
 * front lures (green, "100% natural"); the regulated back reveals the truth
 * (sugar #1, fake seal, vague claim). Judge each Trust ✓ / Flag 🚩 — but some are
 * genuinely honest and must be trusted. Synthesis of label cues, the front-vs-back
 * dilemma, and the don't-demonise-everything trade-off. Each call closes with a
 * verbatim sourced quote; finishing opens the ResultScreen with the 2-source panel.
 * This is the project's core promise: decode aggressive commercial messages.
 */

const ROOM = GAME_ROOMS.SpotTheFake;
const isWalkable = (col, row) => isGameRoomWalkable(ROOM, col, row);

function SpotBlockingOverlay() {
  useBlockingCanvasOverlay();
  return null;
}

function inspectedProduct(state) {
  return state.products?.find((product) => product.id === state.inspect?.productId) || null;
}

function openInspection(state, product) {
  if (!product || product.judged || state.inspect || state.reveal
    || state.showMissionIntro || state.exitConfirmOpen) return false;
  state.inspect = {
    productId: product.id,
    stage: 'promise',
    choice: null,
    attempts: product.attempts || 0,
    verdict: null,
    retryAvailable: false,
    highlightedEvidence: null,
  };
  return true;
}

function nearbyShelfProduct(player, products) {
  const candidates = products
    .filter((product) => !product.judged)
    .map((product) => {
      const { col, row } = product.tile.approach;
      return {
        product,
        tiles: [
          { col, row: row - 1 },
          { col, row },
          { col, row: row + 1 },
        ],
      };
    });
  const resolved = resolveInteraction(
    player,
    candidates,
    null,
    [REACH.OWN, REACH.FACED],
  );
  return resolved?.item.product || null;
}

function closeInspection(state) {
  if (!state?.inspect || state.exitConfirmOpen) return false;
  state.inspect = null;
  state.enterWasDown = false;
  state.leftWasDown = false;
  state.rightWasDown = false;
  return true;
}

function dismissMissionIntro(state) {
  if (!state.showMissionIntro) return false;
  state.showMissionIntro = false;
  return true;
}

function dismissFinalSynthesis(state, onFinal) {
  if (!state.reveal) return false;
  const final = state.reveal.final === true;
  state.reveal = null;
  if (final) onFinal?.(state);
  return true;
}

function flipInspection(state) {
  if (state.exitConfirmOpen || !state.inspect || state.inspect.stage !== 'promise') return false;
  state.inspect.stage = 'evidence';
  return true;
}

function continueFromEvidence(state) {
  if (state.exitConfirmOpen || !state.inspect || state.inspect.stage !== 'evidence') return false;
  state.inspect.stage = 'decision';
  return true;
}

function selectInspectionDecision(state, choice) {
  const inspect = state.inspect;
  if (state.exitConfirmOpen || !inspect || !['trust', 'flag'].includes(choice)) return false;
  if (inspect.verdict) return false;
  inspect.choice = choice;
  return true;
}

export function evidenceKeyForProduct(product) {
  return product?.evidenceType || null;
}

function feedbackFor(product, correct, labels) {
  const evidenceKey = evidenceKeyForProduct(product);
  return {
    correct,
    title: correct ? labels.correctToon : labels.wrongToon,
    judgement: product.verdict === 'trust'
      ? labels.supportedChoice
      : labels.needsEvidenceChoice,
    reason: product[evidenceKey],
    redFlag: product.redFlagKey ? labels.redflag[product.revealKey] : null,
    rule: labels.facts[product.revealKey],
  };
}

function liveScoreFor(state) {
  const flawless = state.judgedCount === state.products.length
    && state.firstTryCorrect === state.products.length;
  return state.firstTryCorrect * POINTS_FIRST_TRY
    + state.recoveredCount * POINTS_RECOVERED
    + (flawless ? BONUS_FLAWLESS : 0);
}

function confirmInspection(state, helpers, labels) {
  const inspect = state.inspect;
  const product = inspectedProduct(state);
  if (state.exitConfirmOpen || !inspect || !product
    || inspect.stage !== 'decision' || !inspect.choice) return false;

  inspect.attempts += 1;
  product.attempts = inspect.attempts;
  const correct = judge(product, inspect.choice);
  if (!correct) state.mistakes += 1;

  const px = OX + state.player.pixelX + TS / 2;
  const py = OY + state.player.pixelY;

  product.judged = true;
  product.correct = correct;
  state.judgedCount += 1;
  if (correct) {
    state.correctCount += 1;
    if (inspect.attempts === 1) state.firstTryCorrect += 1;
    else state.recoveredCount += 1;
    spawnSparkles(state, px, py, '#3f9b6d', 12);
  } else {
    state.screenShakeAmount = 4;
    inspect.highlightedEvidence = evidenceKeyForProduct(product);
    spawnRejectX(state, px, py);
  }
  inspect.stage = 'feedback';
  inspect.retryAvailable = false;
  inspect.verdict = feedbackFor(product, correct, labels);
  state.liveScore = liveScoreFor(state);
  spawnFloatingText(
    state,
    px,
    py - 16,
    correct ? labels.correctToon : labels.wrongToon,
    correct ? '#3f9b6d' : '#ef6f6f',
  );
  return true;
}

function chooseInspectionDecision(state, choice, helpers, labels) {
  if (!selectInspectionDecision(state, choice)) return false;
  return confirmInspection(state, helpers, labels);
}

function continueInspection(state, labels) {
  const inspect = state.inspect;
  if (state.exitConfirmOpen || !inspect?.verdict) return false;
  state.inspect = null;
  if (state.judgedCount >= state.products.length) {
    state.reveal = {
      quote: labels.facts.win,
      sourceId: PRODUCT_REVEALS.win.sourceId,
      final: true,
      paraphrase: true,
    };
  }
  return true;
}

function uiSnapshotFrom(state) {
  const product = inspectedProduct(state);
  return {
    judgedCount: state.judgedCount || 0,
    firstTryCorrect: state.firstTryCorrect || 0,
    recoveredCount: state.recoveredCount || 0,
    liveScore: state.liveScore || 0,
    showMissionIntro: Boolean(state.showMissionIntro),
    finalSynthesis: Boolean(state.reveal?.final),
    inspect: state.inspect && product ? {
      ...state.inspect,
      verdict: state.inspect.verdict ? { ...state.inspect.verdict } : null,
      product: {
        id: product.id,
        emoji: product.emoji,
        front: product.front,
        ingredients: product.ingredients,
        seal: product.seal,
        claim: product.claim,
      },
    } : null,
  };
}

// Shared MissionIntroCard. The fact REUSES the locked 🟢 greenwashing
// definition (PRODUCT_REVEALS.intro) verbatim; title/steps/goal are free UI text.
const MISSION_INTRO = {
  titleKey: 'missionIntro.spotthefake.title',
  stepKeys: [
    'missionIntro.spotthefake.step1',
    'missionIntro.spotthefake.step2',
    'missionIntro.spotthefake.step3',
    'missionIntro.spotthefake.step4', // How the stars are earned
  ],
  introFact: PRODUCT_REVEALS.intro,
  goalKey: 'missionIntro.spotthefake.goal',
  ctaKey: 'hint.skip_ab',
};

export default function SpotTheFake({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const completionNotifiedRef = useRef(false);
  const completeRunRef = useRef(null);
  const previousInspectorProductRef = useRef(null);
  const previousBlockingOverlayRef = useRef(false);
  const atlasRef = useRef(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const [uiSnapshot, setUiSnapshot] = useState(() => uiSnapshotFrom({}));
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  // Pre-translate static UI strings used inside the (non-React) game loop.
  const i18nRef = useRef({});
  i18nRef.current = {
    inspectPrompt: t('spotthefake.inspect_prompt'),
    guideName: t('spotthefake.guide_name'),
    guideHint: t('spotthefake.guide_hint'),
    readLabelPrompt: t('spotthefake.read_label_prompt'),
    choosePrompt: t('spotthefake.choose_prompt'),
    ingredientsLabel: t('spotthefake.ingredients_label'),
    sealLabel: t('spotthefake.seal_label'),
    claimLabel: t('spotthefake.claim_label'),
    seal_real: t('spotthefake.seal_real'),
    seal_fake: t('spotthefake.seal_fake'),
    seal_none: t('spotthefake.seal_none'),
    claim_approved: t('spotthefake.claim_approved'),
    claim_vague: t('spotthefake.claim_vague'),
    claim_none: t('spotthefake.claim_none'),
    verdictTrust: t('spotthefake.verdict_trust'),
    verdictFlag: t('spotthefake.verdict_flag'),
    correctToon: t('spotthefake.correct_toon'),
    wrongToon: t('spotthefake.wrong_toon'),
    supportedChoice: t('spotthefake.choice_supported'),
    needsEvidenceChoice: t('spotthefake.choice_needs_evidence'),
    progressLabel: (done, total) => t('spotthefake.progress_label', { done, total }),
    revealTitle: t('spotthefake.reveal_title'),
    revealDismiss: t('spotthefake.reveal_dismiss'),
    sourceHint: t('spotthefake.source_hint'),
    // Localized red-flag lead per flag product, shown above the fact line.
    // Keyed by revealKey — trust products have no red flag.
    redflag: {
      vague: t('spotthefake.redflag_vague'),
      toogood: t('spotthefake.redflag_toogood'),
      noadded: t('spotthefake.redflag_noadded'),
      descending: t('spotthefake.redflag_descending'),
      greenpack: t('spotthefake.redflag_greenpack'),
    },
    // The card shows the child-facing plain sentence, translated;
    // Press S still opens the verbatim source. EN falls back via defaultValue to the
    // canonical r.plain in local.js (en.json has no spotthefake.facts block).
    facts: Object.fromEntries(
      Object.entries(PRODUCT_REVEALS).map(([id, r]) => [
        id, t('spotthefake.facts.' + id, { defaultValue: r.plain }),
      ])
    ),
  };

  // Shared MissionIntroCard with the greenwashing definition in the child's language.
  // `paraphrase` sets our sentence unquoted (see gameRoomRenderer); Press S / the pill
  // still opens the verbatim source.
  const introForCard = () => ({
    ...MISSION_INTRO,
    introFact: {
      ...PRODUCT_REVEALS.intro,
      quote: i18nRef.current.facts.intro,
      paraphrase: true,
    },
  });

  const { gameState, setGameState, setScore, stateRef, keysRef } = useGameRoomCanvas(canvasRef, {
    timeLimit: null, // CHALLENGE — no clock; the task is critical thinking, not speed

    setup: (state) => {
      if (canvasRef.current) canvasRef.current._stateRef = stateRef;
      if (state.player) return;
      const start = ROOM.playerStart;

      state.player = {
        col: start.col, row: start.row,
        pixelX: start.col * TS, pixelY: start.row * TS,
        dir: start.dir ?? DIR.UP,
        moving: false, moveTimer: 0,
        fromX: 0, fromY: 0, toX: 0, toY: 0,
      };

      state.time = 0;
      state.irisOpenness = 0;
      state.enterWasDown = false;
      state.leftWasDown = false;
      state.rightWasDown = false;

      // Deck of 6 products mapped 1:1 to the shelf slots; per-product strings
      // translated here (single language per session).
      const L = i18nRef.current;
      const deck = buildDeck(6);
      state.products = deck.map((p, i) => ({
        ...p,
        tile: ROOM.productSlots[i],
        packageShape: packageShapeForProduct(p),
        front: t(p.frontKey),
        ingredients: t(p.ingredientsKey),
        seal: L[`seal_${p.sealStatus}`],
        claim: L[`claim_${p.claimStatus}`],
        attempts: 0,
        judged: false,
        correct: null,
      }));

      state.judgedCount = 0;
      state.correctCount = 0;
      state.firstTryCorrect = 0;
      state.recoveredCount = 0;
      state.mistakes = 0;
      state.liveScore = 0;
      state.completionResult = null;
      state.completionStarted = false;
      state.scoreComputationCount = 0;
      state.inspect = null;
      state.facingProductId = null;
      state.exitConfirmOpen = false;
      state.introCtaRect = null;
      state.revealCtaRect = null;
      state.introSourceRect = null;
      state.sourceBadgeRect = null;

      state.particles = [];
      state.floatingTexts = [];
      state.rejectX = null;
      state.screenShake = 0;
      state.screenShakeAmount = 0;
      state.hintProductId = null;
      state.hintTimer = 0;
      state.actionPrompt = null;
      state.ambientShoppers = createSpotTheFakeShoppers(ROOM.ambientShopperPaths);
      state.nearLabelGuide = false;

      // Labels consumed by state transitions and the DOM synthesis.
      state.labels = {
        readLabelPrompt: L.readLabelPrompt,
        correctToon: L.correctToon,
        wrongToon: L.wrongToon,
      };
      state.revealTitle = L.revealTitle;
      state.revealDismiss = L.revealDismiss;
      state.sourceHint = L.sourceHint; // localized "press S / tap to open source"

      // Seed source-backed copy/state; Spot-local DOM teaching panels own presentation.
      initMissionIntro(state, t, introForCard());
    },

    update: (state, dt, keys, helpers) => {
      const L = i18nRef.current;
      state.time += dt;

      if (state.irisOpenness < 1) {
        state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
      }

      updateParticles(state, dt);
      updateFloatingTexts(state, dt);
      updateRejectX(state, dt);

      if (state.screenShakeAmount > 0.5) {
        state.screenShake = Math.sin(state.time * 50) * state.screenShakeAmount;
        state.screenShakeAmount *= 0.88;
      } else {
        state.screenShake = 0;
        state.screenShakeAmount = 0;
      }

      if (state.hintTimer > 0) {
        state.hintTimer -= dt;
        if (state.hintTimer <= 0) state.hintProductId = null;
      }

      // Shared mission-intro card: same canvas-owned contract as Island 1 games.
      if (state.showMissionIntro) {
        state.timerPaused = true;
        state.actionPrompt = null;
        if (isEnterJustPressed(keys, state)) dismissMissionIntro(state);
        return;
      }

      // Final synthesis is also a DOM teaching surface.
      if (state.reveal) {
        state.timerPaused = true;
        state.actionPrompt = null;
        return;
      }

      // ── Inspection modal (pause) ──
      if (state.inspect) {
        state.timerPaused = true;
        state.actionPrompt = null;
        const inspect = state.inspect;
        const left = keys.has('arrowleft') || keys.has('a') || keys.has('keya');
        const right = keys.has('arrowright') || keys.has('d') || keys.has('keyd');
        const leftPressed = left && !state.leftWasDown;
        const rightPressed = right && !state.rightWasDown;
        state.leftWasDown = left;
        state.rightWasDown = right;

        if (inspect.stage === 'promise') {
          if (isEnterJustPressed(keys, state)) flipInspection(state);
        } else if (inspect.stage === 'evidence') {
          if (isEnterJustPressed(keys, state)) continueFromEvidence(state);
        } else if (inspect.stage === 'decision') {
          if (leftPressed) selectInspectionDecision(state, 'trust');
          if (rightPressed) selectInspectionDecision(state, 'flag');
          if (isEnterJustPressed(keys, state)) confirmInspection(state, helpers, L);
        } else if (inspect.stage === 'feedback') {
          if (isEnterJustPressed(keys, state)) {
            continueInspection(state, L);
          }
        }
        return;
      }

      state.timerPaused = false;
      if (state.irisOpenness < 1) return;

      // ── Walk + interaction ──
      updatePlayerMovement(state.player, dt, keys, isWalkable);
      updateSpotTheFakeShoppers(state.ambientShoppers, dt);
      state.nearLabelGuide = Boolean(checkInteraction(state.player, [ROOM.labelGuide], 2));

      const product = nearbyShelfProduct(state.player, state.products);
      state.facingProductId = product ? product.id : null;
      state.actionPrompt = product ? L.inspectPrompt : null;

      if (isEnterJustPressed(keys, state) && product) {
        openInspection(state, product);
      }
    },

    render: (ctx, state) => {
      if (!atlasRef.current) return;

      ctx.fillStyle = '#EAD0A6';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // ── Zoom into supermarket aisle ──
      applyRoomCamera(ctx, ROOM);

      renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);
      renderMarketFixtures(ctx, ROOM);
      renderGameRoomDecorations(ctx, ROOM);
      renderShelfProducts(ctx, state, ROOM);
      renderSpotTheFakePeople(ctx, state, ROOM, i18nRef.current);
      renderGameRoomPlayer(ctx, state, atlasRef.current);
      renderParticles(ctx, state);
      renderFloatingTexts(ctx, state);
      renderRejectX(ctx, state);
      renderSpotTheFakeGuideHint(ctx, state, ROOM, i18nRef.current);

      releaseRoomCamera(ctx);

      // Canvas retains only the world, player, products and world action prompt.
      renderActionPrompt(ctx, state);

      // Iris wipe (convert player position to canvas coords for zoom)
      if (state.irisOpenness < 1) {
        const px = OX + state.player.pixelX + TS / 2;
        const py = OY + state.player.pixelY + TS / 2;
        const { x: canvasX, y: canvasY } = roomToCanvas(ROOM, px, py);
        drawIrisWipe(ctx, canvasX, canvasY, state.irisOpenness, CANVAS_W, CANVAS_H);
      }

      renderMissionIntroCard(ctx, state);
      syncSpotTheFakeOverlayHitRects(ctx, state);

    },

    onComplete: () => {},
  });

  // Completion delivery is synchronous with final-synthesis dismissal. The guard
  // flips immediately around the real onComplete call, leaving no cancellable gap.
  completeRunRef.current = (state) => {
    if (state.completionStarted) return false;
    state.completionStarted = true;
    state.scoreComputationCount += 1;
    const total = state.products?.length || 6;
    const result = scoreSpotTheFakeRun({
      firstTryCorrect: state.firstTryCorrect,
      recovered: state.recoveredCount,
      total,
    });
    state.completionResult = result;
    setScore(result.score);
    setGameState('COMPLETED');
    if (completionNotifiedRef.current) return false;
    completionNotifiedRef.current = true;
    onComplete(result.score, result.passed, {
      tier: result.tier,
      stars: result.stars,
      correct: state.correctCount || 0,
      firstTryCount: state.firstTryCorrect || 0,
      total,
      mistakes: state.mistakes || 0,
      recovered: state.recoveredCount || 0,
    });
    return true;
  };

  useEffect(() => {
    if (atlasReady && gameState === 'INIT') setGameState('PLAYING');
  }, [atlasReady, gameState]);

  useEffect(() => {
    if (atlasReady && canvasRef.current) canvasRef.current.focus();
  }, [atlasReady]);

  // Poll the mutable canvas state, but publish to React only when this compact
  // semantic signature changes. Animation time/player coordinates never enter it.
  useEffect(() => {
    let animationId;
    let previousSignature = '';
    const mirrorMeaningfulState = () => {
      const next = uiSnapshotFrom(stateRef.current);
      const signature = JSON.stringify(next);
      if (signature !== previousSignature) {
        previousSignature = signature;
        setUiSnapshot(next);
      }
      animationId = requestAnimationFrame(mirrorMeaningfulState);
    };
    mirrorMeaningfulState();
    return () => cancelAnimationFrame(animationId);
  }, [stateRef]);

  const inspectorVisible = Boolean(
    uiSnapshot.inspect && gameState === 'PLAYING'
      && !uiSnapshot.showMissionIntro && !uiSnapshot.finalSynthesis,
  );
  const introVisible = gameState === 'PLAYING' && uiSnapshot.showMissionIntro;
  const teachingKind = gameState === 'PLAYING' && uiSnapshot.finalSynthesis ? 'final' : null;
  const domOverlayOpen = Boolean(inspectorVisible || teachingKind || exitConfirmOpen);
  const blockingOverlayOpen = Boolean(domOverlayOpen || introVisible);

  useEffect(() => {
    const productId = uiSnapshot.inspect?.productId || null;
    if (exitConfirmOpen) {
      rootRef.current?.querySelector('[data-testid="spot-exit-control"] button')?.focus();
    } else if (teachingKind) {
      rootRef.current?.querySelector('[data-action="teaching-continue"]')?.focus();
    } else if (introVisible) {
      rootRef.current?.querySelector('.spot-intro-start')?.focus();
    } else if (inspectorVisible) {
      const dialog = rootRef.current?.querySelector('.spot-the-fake-inspector');
      if (dialog && !dialog.contains(document.activeElement)) {
        // Skip the header ✕: Enter on a focused Close would shut the case it just opened.
        dialog.querySelector('button:not(:disabled):not([data-dialog-close])')?.focus();
      }
    } else if ((!productId && previousInspectorProductRef.current)
      || previousBlockingOverlayRef.current) {
      canvasRef.current?.focus();
    }
    previousInspectorProductRef.current = productId;
    previousBlockingOverlayRef.current = blockingOverlayOpen;
  }, [blockingOverlayOpen, exitConfirmOpen, gameState, inspectorVisible, introVisible, teachingKind,
    uiSnapshot.inspect?.productId, uiSnapshot.inspect?.stage]);

  // Direct pointer inspection uses renderer-authored canvas-space hit boxes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onClick = (e) => {
      const state = stateRef.current;
      if (!state || state.exitConfirmOpen || state.inspect
        || state.reveal || gameState !== 'PLAYING') return;
      const p = getCanvasPointer(canvas, e);
      if (state.showMissionIntro) {
        const introId = missionIntroSourceId(state);
        if (introId && hitTest(p, state.introSourceRect)) {
          window.open(`/source.html?src=${introId}`, '_blank', 'noopener');
        } else if (hitTest(p, state.introCtaRect)) {
          dismissMissionIntro(state);
        }
        return;
      }
      const product = state.products?.find((item) => {
        const r = item.pointerRect;
        return !item.judged && r
          && p.x >= r.x && p.x <= r.x + r.width
          && p.y >= r.y && p.y <= r.y + r.height;
      });
      openInspection(state, product);
    };
    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [atlasReady, gameState, stateRef]);

  // Source open via keyboard: press S while the intro card or a reveal is open. Listens
  // on WINDOW (like the main key handler, useGameRoomCanvas.js:59) so it survives the
  // canvas losing focus after a header-button click (FIX-F). Real keydown handler (not the
  // RAF loop) so window.open counts as a user gesture; the loop is paused during
  // intro/reveal, so S never doubles as player movement here.
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || (e.key !== 's' && e.key !== 'S' && e.code !== 'KeyS')) return; // e.code: Greek layout sends 'σ'
      const state = stateRef.current;
      if (!state || state.exitConfirmOpen) return;
      const introId = missionIntroSourceId(state);
      if (introId) {
        window.open('/source.html?src=' + introId, '_blank', 'noopener');
        return;
      }
      if (state.reveal && state.reveal.sourceId) {
        window.open('/source.html?src=' + state.reveal.sourceId, '_blank', 'noopener');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const inspectorLabels = {
    caseFileTab: t('spotthefake.case_file_tab'),
    dialogLabel: t('spotthefake.dialog_label'),
    stageIndicatorLabel: t('spotthefake.stage_indicator_label'),
    stagePromise: t('spotthefake.stage_promise'),
    stageEvidence: t('spotthefake.stage_evidence'),
    stageDecision: t('spotthefake.stage_decision'),
    promiseLabel: t('spotthefake.evidence_promise_label'),
    ingredientsLabel: t('spotthefake.evidence_ingredients_label'),
    sealLabel: t('spotthefake.evidence_seal_label'),
    claimLabel: t('spotthefake.evidence_claim_label'),
    supportedChoice: t('spotthefake.choice_supported'),
    needsEvidenceChoice: t('spotthefake.choice_needs_evidence'),
    selectFirst: t('spotthefake.select_first'),
    redFlagLabel: t('spotthefake.red_flag_label'),
    detectorRuleLabel: t('spotthefake.detector_rule_label'),
    flip: t('spotthefake.control_flip'),
    continue: t('spotthefake.control_continue'),
    source: t('spotthefake.control_source'),
    close: t('spotthefake.control_close'),
  };
  const activeInspection = uiSnapshot.inspect;
  const liveStars = uiSnapshot.firstTryCorrect >= 6
    ? 3
    : uiSnapshot.firstTryCorrect >= 5 ? 2 : uiSnapshot.firstTryCorrect >= 4 ? 1 : 0;
  const openInstructions = () => {
    const state = stateRef.current;
    if (!state || state.exitConfirmOpen) return;
    initMissionIntro(state, t, introForCard());
  };
  const openInspectorSource = () => {
    const state = stateRef.current;
    if (!state || state.exitConfirmOpen) return;
    const product = inspectedProduct(state);
    const sourceId = product && PRODUCT_REVEALS[product.revealKey]?.sourceId;
    if (sourceId) window.open(`/source.html?src=${sourceId}`, '_blank', 'noopener');
  };
  const closeInspector = () => {
    if (!closeInspection(stateRef.current)) return;
    keysRef.current?.clear();
  };
  const openTeachingSource = () => {
    const state = stateRef.current;
    if (!state || state.exitConfirmOpen) return;
    const sourceId = state.reveal?.sourceId;
    if (sourceId) window.open(`/source.html?src=${sourceId}`, '_blank', 'noopener');
  };
  const continueTeaching = () => {
    const state = stateRef.current;
    if (!state || state.exitConfirmOpen) return;
    if (teachingKind === 'final') dismissFinalSynthesis(state, completeRunRef.current);
  };
  const handleExitFreeze = (open) => {
    const state = stateRef.current;
    if (state) {
      state.exitConfirmOpen = open;
      state.enterWasDown = false;
      state.leftWasDown = false;
      state.rightWasDown = false;
    }
    keysRef.current?.clear();
    setExitConfirmOpen(open);
  };
  const teachingProps = {
    eyebrow: t('spotthefake.teaching_final_label'),
    title: t('spotthefake.reveal_title'),
    fact: i18nRef.current.facts.win,
    primaryLabel: t('spotthefake.teaching_finish'),
  };

  return (
    <div
      ref={rootRef}
      className="spot-the-fake-root"
      data-case-open={inspectorVisible ? 'true' : 'false'}
      data-exit-confirm-open={exitConfirmOpen ? 'true' : 'false'}
    >
      <SpotTheFakeHud
        score={uiSnapshot.liveScore}
        stars={liveStars}
        completed={uiSnapshot.judgedCount}
        total={6}
        onPause={() => {
          if (!stateRef.current?.exitConfirmOpen) setGameState('PAUSED');
        }}
        onInstructions={openInstructions}
        onExit={() => onNavigate('hub')}
        onFreeze={handleExitFreeze}
        controlsFrozen={exitConfirmOpen}
      />

      <div
        className={`spot-the-fake-stage${inspectorVisible ? ' is-inspecting' : ''}${teachingKind ? ' is-teaching' : ''}`}
        inert={exitConfirmOpen ? true : undefined}
      >
        <div
          className="spot-the-fake-scene"
          inert={domOverlayOpen ? true : undefined}
          aria-hidden={domOverlayOpen ? 'true' : undefined}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            tabIndex={0}
            className="spot-the-fake-canvas"
            inert={domOverlayOpen ? true : undefined}
            aria-label={t('spotthefake.title')}
          />
        </div>

        {introVisible && !domOverlayOpen && (
          <SpotTheFakeIntroAction
            label={t('spotthefake.teaching_start')}
            onStart={() => dismissMissionIntro(stateRef.current)}
          />
        )}

        {inspectorVisible && activeInspection && (
          <>
            <SpotTheFakeInspector
              product={activeInspection.product}
              stage={activeInspection.stage}
              choice={activeInspection.choice}
              verdict={activeInspection.verdict}
              highlightedEvidence={activeInspection.highlightedEvidence}
              labels={inspectorLabels}
              onFlip={() => flipInspection(stateRef.current)}
              onEvidenceContinue={() => continueFromEvidence(stateRef.current)}
              onSelect={(choice) => selectInspectionDecision(stateRef.current, choice)}
              onChoose={(choice) => chooseInspectionDecision(
                stateRef.current,
                choice,
                null,
                i18nRef.current,
              )}
              onContinue={() => continueInspection(stateRef.current, i18nRef.current)}
              onSource={openInspectorSource}
              onClose={closeInspector}
              frozen={exitConfirmOpen}
            />
          </>
        )}

        {teachingKind && (
          <SpotTheFakeTeachingPanel
            kind={teachingKind}
            {...teachingProps}
            factLabel={t('spotthefake.teaching_fact_label')}
            sourceLabel={t('spotthefake.control_source')}
            onSource={openTeachingSource}
            onPrimary={continueTeaching}
          />
        )}
      </div>

      {blockingOverlayOpen && <SpotBlockingOverlay />}

      {!atlasReady && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#fdf2e9', color: '#5d4037', fontSize: 24,
        }}>
          Loading...
        </div>
      )}

      {gameState === 'PAUSED' && (
        <PauseOverlay
          surfaceRef={canvasRef}
          onResume={() => setGameState('PLAYING')}
          onInstructions={openInstructions}
          onQuit={() => onNavigate('hub')}
        />
      )}
    </div>
  );
}
