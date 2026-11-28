import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas } from '../../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import {
  updatePlayerMovement, isEnterJustPressed, isDropKeyPressed,
  checkInteraction, TILE_SIZE, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomTiles, renderGameRoomPlayer,
  renderGameRoomDecorations, renderKitchenWall,
  renderHeldItem, renderFloorItems, renderActionPrompt, renderDropPrompt,
  renderParticles, renderFloatingTexts,
  spawnSparkles, updateParticles, updateFloatingTexts, spawnFloatingText,
  initMissionIntro, renderMissionIntroCard,
  applyRoomCamera, releaseRoomCamera, roomToCanvas, OX, OY,
} from '../engine/gameRoomRenderer.js';
import { missionIntroSourceId } from '../engine/missionIntroLogic.js';
import {
  renderStorageStations, renderPreparationIsland, renderKitchenHelper,
  renderKitchenHelperTip, renderFeedbackCard, renderStateBadges,
  stationCenter, STATION_VISUALS,
} from '../engine/fridgeManagerRenderer.js';
import {
  FRIDGE_FOODS, FRIDGE_FACTS, gradePlacement, acceptedFactId, factSource, TIER,
  FRIDGE_INTRO_FACT, gradeFridgeRun,
} from '../../data/fridgeData.js';
import {
  createFridgeRunProgress,
  liveFridgeStars,
  recordFridgeAttempt,
} from './fridgeManagerRun.js';
import { drawIrisWipe, IRIS_DURATION, getCanvasPointer, hitTest } from '../../utils/canvas.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * FridgeManager — "Freeze · Store · Rescue" (Island 3 Hook).
 *
 * Walk-around kitchen. Carry each food to the right of FOUR storage stations
 * (freezer / fridge / cupboard / compost). Placement is graded with the
 * MULTI-VALID 3-tier model (fridgeData.gradePlacement):
 *   ✅ accepted   — an EUFIC-valid bin → +10, the verbatim EUFIC fact + «Press S».
 *   🟡 suboptimal — safe but not best → AMBER nudge, same food stays in hand.
 *   ❌ avoid       — EUFIC warns against it → teaching hint, same food stays in hand.
 * Time/state rules (rice 1-day, no-refreeze) live in the TIME/STATE layer of fridgeData.js.
 */

// A teaching card stays until the child presses Enter,
// Space or touch A — it never disappears while the child is still reading.
const FEEDBACK_DURATION = Number.POSITIVE_INFINITY;
const SCREEN_SHAKE_DECAY = 0.88;

const ROOM = GAME_ROOMS.FridgeManager;
const isWalkable = (col, row) => isGameRoomWalkable(ROOM, col, row);
const FOOD_COUNT = FRIDGE_FOODS.length;
// cupboard is left out: its card is about bread and dry food, so lettuce there gets no card. Bread names it itself.
const SOURCED_BINS = new Set(['freezer', 'fridge']); // compost = no source

// Shared MissionIntroCard content. The card shows OUR plain sentence
// (translated); the chip/«Press S» opens the locked 🟢 freezer verbatim
// (FRIDGE_INTRO_FACT). Title/steps/goal are free UI text.
const missionIntroFor = (t) => ({
  titleKey: 'missionIntro.fridgemanager.title',
  stepKeys: [
    'missionIntro.fridgemanager.step1',
    'missionIntro.fridgemanager.step2',
    'missionIntro.fridgemanager.step3',
    'missionIntro.fridgemanager.step4', // How the stars are earned
  ],
  introFact: {
    sourceId: FRIDGE_INTRO_FACT.sourceId,
    quote: t('fridge.facts.freezer', { defaultValue: FRIDGE_INTRO_FACT.plain }),
    paraphrase: true,
  },
  goalKey: 'missionIntro.fridgemanager.goal',
  ctaKey: 'hint.skip_ab',
});

function getBin(binId) {
  return ROOM.bins.find((b) => b.id === binId);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setFeedback(state, tier, text, fact, sourceId, paraphrase) {
  state.feedback = {
    tier, text, fact: fact || null, sourceId: sourceId || null,
    paraphrase: !!paraphrase, timer: FEEDBACK_DURATION,
  };
  state.timerPaused = true;
}

// The translated child-facing sentence for a FRIDGE_FACTS entry (falls back to the
// English plain in the data file — en.json carries no facts block by design).
function plainFor(strings, factId) {
  return strings(`fridge.facts.${factId}`, { defaultValue: FRIDGE_FACTS[factId].plain });
}

function foodLabel(strings, food) {
  const name = strings(food.nameKey, { defaultValue: food.id });
  if (!food.stateLabelKey) return name;
  return strings('fridge.food_with_state', {
    food: name,
    state: strings(food.stateLabelKey),
  });
}

export default function FridgeManager({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const [hud, setHud] = useState({ activeFood: null, accepted: 0, firstTry: 0, introVisible: true });
  const atlasRef = useRef(null);

  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  const i18nRef = useRef(null);
  i18nRef.current = t;

  const { gameState, setGameState, score, stateRef } = useGameRoomCanvas(
    canvasRef,
    {
      timeLimit: null,

      setup: (state) => {
        if (state.player) return;

        const start = ROOM.playerStart;
        state.player = {
          col: start.col, row: start.row,
          pixelX: start.col * TILE_SIZE, pixelY: start.row * TILE_SIZE,
          dir: start.dir ?? DIR.UP,
          moving: false, moveTimer: 0,
          fromX: 0, fromY: 0, toX: 0, toY: 0,
        };

        state.time = 0;
        state.irisOpenness = 0;
        state.enterWasDown = false;
        state.sWasDown = false;
        state.qWasDown = false;
        // Start paused so the timer never bleeds during the iris
        // wipe / tutorial hint (the hook counts down before update() runs).
        state.timerPaused = true;

        // Foods on counters (shuffled).
        const shuffled = shuffleArray(FRIDGE_FOODS);
        state.counterItems = shuffled.map((food, i) => ({
          id: food.id,
          emoji: food.emoji,
          nameKey: food.nameKey,
          stateLabelKey: food.stateLabelKey || null,
          col: ROOM.counterPositions[i].col,
          row: ROOM.counterPositions[i].row,
          picked: false,
        }));

        state.floorItems = [];
        state.heldItem = null;
        state.actionPrompt = null;
        state.dropPrompt = null;
        state.particles = [];
        state.floatingTexts = [];
        state.screenShake = 0;
        state.screenShakeAmount = 0;

        // One array per station.
        state.binItems = {};
        for (const bin of ROOM.bins) state.binItems[bin.id] = [];
        Object.assign(state, createFridgeRunProgress());
        state.totalPlaced = 0;

        state.feedback = null;
        state.helperTip = null;
        state.celebrating = false;
        state.celebrateTimer = 0;

        initMissionIntro(state, t, missionIntroFor(t));
      },

      update: (state, dt, keys, helpers) => {
        const strings = i18nRef.current;
        state.time += dt;

        const activeFood = state.heldItem
          ? {
              id: state.heldItem.id,
              emoji: state.heldItem.emoji,
              label: foodLabel(strings, state.heldItem),
            }
          : null;
        const hudSignature = [
          activeFood?.id || '', activeFood?.label || '',
          state.acceptedCount || 0, state.firstTryAcceptedCount || 0,
          state.showMissionIntro ? 'intro' : 'playing',
        ].join('|');
        if (state.hudSignature !== hudSignature) {
          state.hudSignature = hudSignature;
          setHud({
            activeFood,
            accepted: state.acceptedCount || 0,
            firstTry: state.firstTryAcceptedCount || 0,
            introVisible: Boolean(state.showMissionIntro),
          });
        }

        // MissionIntroCard blocks input + pauses timer until dismissed.
        // Let the iris open behind the card so it sits over the live kitchen (parity
        // with CircularCity), not a blank blue screen.
        if (state.showMissionIntro) {
          if (state.irisOpenness < 1) {
            state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
          }
          if (isEnterJustPressed(keys, state)) state.showMissionIntro = false;
          state.timerPaused = true;
          return;
        }

        // Screen shake decay
        if (state.screenShakeAmount > 0.5) {
          state.screenShake = Math.sin(state.time * 50) * state.screenShakeAmount;
          state.screenShakeAmount *= SCREEN_SHAKE_DECAY;
        } else {
          state.screenShake = 0;
          state.screenShakeAmount = 0;
        }

        // Iris wipe (blocks input)
        if (state.irisOpenness < 1) {
          state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
          return;
        }

        updateParticles(state, dt);
        updateFloatingTexts(state, dt);

        // A teaching card is part of the lesson, not part of the race. Freeze
        // movement and the countdown until it closes automatically or the child
        // presses Enter/Space after reading it.
        if (state.feedback && state.feedback.timer > 0) {
          state.timerPaused = true;
          state.feedback.timer -= dt;
          const sDown = keys.has('s') || keys.has('keys');
          if (sDown && !state.sWasDown && state.feedback.sourceId && typeof window !== 'undefined') {
            window.open(`source.html?src=${state.feedback.sourceId}`, '_blank', 'noopener');
          }
          state.sWasDown = sDown;
          const dismiss = isEnterJustPressed(keys, state);
          if (state.feedback.timer <= 0 || dismiss) state.feedback = null;
          return;
        }

        if (state.helperTip) {
          state.timerPaused = true;
          state.actionPrompt = null;
          state.dropPrompt = null;
          if (isEnterJustPressed(keys, state)) state.helperTip = null;
          return;
        }

        // ── Celebration ──
        state.timerPaused = state.celebrating;
        if (state.celebrating) {
          state.celebrateTimer += dt;
          if (state.celebrateTimer > 1.5) helpers.complete();
          return;
        }

        // ── Player movement ──
        updatePlayerMovement(state.player, dt, keys, isWalkable);

        // Reset per-frame UI
        state.actionPrompt = null;

        // All station tiles tagged with binId for proximity checks.
        const allBinTiles = ROOM.bins.flatMap((b) =>
          b.tiles.map((tt) => ({ ...tt, binId: b.id })),
        );
        const nearHelper = ROOM.helper
          ? checkInteraction(state.player, [ROOM.helper], 1)
          : null;

        if (state.heldItem) {
          state.dropPrompt = strings('fridge.drop_prompt', 'Press Q to put it back.');
          const nearBin = checkInteraction(state.player, allBinTiles, 1);
          if (nearBin) {
            const label = strings(STATION_VISUALS[nearBin.binId]?.labelKey) || nearBin.binId;
            state.actionPrompt = strings('fridge.place_prompt', { station: label })
              || `Press Enter or Space → ${label}`;
          }
        } else {
          state.dropPrompt = null;
          const nearCounter = checkInteraction(
            state.player, state.counterItems.filter((i) => !i.picked), 1,
          );
          if (nearCounter) {
            state.actionPrompt = strings('fridge.pickup_prompt', {
              food: `${nearCounter.emoji} ${foodLabel(strings, nearCounter)}`,
            });
          } else {
            const nearFloor = checkInteraction(state.player, state.floorItems, 1);
            if (nearFloor) {
              state.actionPrompt = strings('fridge.floor_pickup_prompt', {
                food: `${nearFloor.emoji} ${foodLabel(strings, nearFloor)}`,
              });
            }
          }
        }

        if (nearHelper && !state.actionPrompt) {
          state.actionPrompt = strings('fridge.helper_prompt');
        }

        // ── Enter — place / pick up / ask the helper ──
        if (isEnterJustPressed(keys, state)) {
          let handled = false;
          if (state.heldItem) {
            const nearBin = checkInteraction(state.player, allBinTiles, 1);
            if (nearBin) {
              placeHeld(state, nearBin.binId, helpers, strings);
              handled = true;
            }
          } else {
            const nearCounter = checkInteraction(
              state.player, state.counterItems.filter((i) => !i.picked), 1,
            );
            if (nearCounter) {
              nearCounter.picked = true;
              state.heldItem = {
                id: nearCounter.id, emoji: nearCounter.emoji,
                nameKey: nearCounter.nameKey, stateLabelKey: nearCounter.stateLabelKey,
              };
              handled = true;
            } else {
              const nearFloor = checkInteraction(state.player, state.floorItems, 1);
              if (nearFloor) {
                state.floorItems = state.floorItems.filter((i) => i !== nearFloor);
                state.heldItem = {
                  id: nearFloor.id, emoji: nearFloor.emoji,
                  nameKey: nearFloor.nameKey, stateLabelKey: nearFloor.stateLabelKey,
                };
                handled = true;
              }
            }
          }
          if (!handled && nearHelper) {
            state.helperTip = strings(
              state.heldItem ? 'fridge.helper_holding' : 'fridge.helper_idle',
            );
            state.actionPrompt = null;
            state.dropPrompt = null;
            state.timerPaused = true;
          }
        }

        // ── Q — drop held back to counter ──
        const qDown = isDropKeyPressed(keys);
        if (qDown && !state.qWasDown && state.heldItem) {
          const counterItem = state.counterItems.find((c) => c.id === state.heldItem.id && c.picked);
          if (counterItem) counterItem.picked = false;
          state.heldItem = null;
          state.dropPrompt = null;
        }
        state.qWasDown = qDown;
      },

      render: (ctx, state) => {
        if (!atlasRef.current) return;
        const strings = i18nRef.current;

        ctx.fillStyle = '#EAD0A6';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        applyRoomCamera(ctx, ROOM);
        const shake = state.screenShake || 0;
        if (shake) ctx.translate(shake, 0);

        renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);
        renderKitchenWall(ctx);
        renderGameRoomDecorations(ctx, ROOM);
        renderStorageStations(ctx, state, strings, ROOM);
        renderPreparationIsland(ctx, state, strings, ROOM);
        renderKitchenHelper(ctx, state, strings, ROOM);
        renderFloorItems(ctx, state);
        renderGameRoomPlayer(ctx, state, atlasRef.current);
        renderHeldItem(ctx, state);
        renderStateBadges(ctx, state, strings, ROOM);
        renderParticles(ctx, state);
        renderFloatingTexts(ctx, state);

        releaseRoomCamera(ctx);

        // HUD (screen coords)
        renderActionPrompt(ctx, state);
        renderDropPrompt(ctx, state);
        renderFeedbackCard(ctx, state, strings);
        renderKitchenHelperTip(ctx, state, strings);

        if (state.irisOpenness < 1) {
          const px = OX + state.player.pixelX + TILE_SIZE / 2;
          const py = OY + state.player.pixelY + TILE_SIZE / 2;
          const { x: canvasX, y: canvasY } = roomToCanvas(ROOM, px, py);
          drawIrisWipe(ctx, canvasX, canvasY, state.irisOpenness, CANVAS_W, CANVAS_H);
        }

        renderMissionIntroCard(ctx, state);
      },

      onComplete: () => {},
    },
  );

  // Expose state for headless playtest (canvas._stateRef.current).
  useEffect(() => {
    if (canvasRef.current) canvasRef.current._stateRef = stateRef;
  }, [atlasReady, stateRef]);

  // Click the gold source chip to open the source (mouse parity with «Press S»).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onPointerDown = (e) => {
      const st = stateRef.current;
      if (!st) return;
      const p = getCanvasPointer(canvas, e);
      // Intro card source chip — open the freezer source.
      const introId = missionIntroSourceId(st);
      if (introId && hitTest(p, st.introSourceRect)) {
        window.open(`source.html?src=${introId}`, '_blank', 'noopener');
        return;
      }
      const rect = st.sourceBadgeRect;
      if (!rect || !st.feedback?.sourceId) return;
      if (hitTest(p, rect)) {
        window.open(`source.html?src=${st.feedback.sourceId}`, '_blank', 'noopener');
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, [atlasReady, stateRef]);

  // «Press S» fallback to open the intro card's source. Listens on WINDOW (like the
  // main key handler, useGameRoomCanvas.js:59) so it survives the canvas losing focus
  // after a header-button click. The guard fires only while the intro is up.
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || (e.key !== 's' && e.key !== 'S' && e.code !== 'KeyS')) return; // e.code: Greek layout sends 'σ'
      const id = missionIntroSourceId(stateRef.current);
      if (id) window.open(`source.html?src=${id}`, '_blank', 'noopener');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stateRef]);

  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const state = stateRef.current;
      const correct = state?.acceptedCount || 0;
      const { passed, tier, stars } = gradeFridgeRun({
        accepted: correct,
        total: FOOD_COUNT,
        firstTryAccepted: state?.firstTryAcceptedCount || 0,
        timedOut: correct < FOOD_COUNT,
      });
      setTimeout(() => onComplete(score, passed, {
        tier,
        stars,
        correct,
        total: FOOD_COUNT,
        firstTryCount: state?.firstTryAcceptedCount || 0,
        suboptimal: state?.suboptimalCount || 0,
        mistakes: state?.avoidCount || 0,
      }), 500);
    }
  }, [gameState]);

  useEffect(() => {
    if (atlasReady && gameState === 'INIT') setGameState('PLAYING');
  }, [atlasReady, gameState]);

  useEffect(() => {
    if (atlasReady && canvasRef.current) canvasRef.current.focus();
  }, [atlasReady]);

  const liveStars = liveFridgeStars(hud.accepted, hud.firstTry);

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#EAD0A6', overflow: 'hidden' }}>
      <ScoreBar
        score={score}
        stars={liveStars}
        timeLeft={null}
        onPause={() => setGameState('PAUSED')}
        onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroFor(t))}
        onExit={() => onNavigate('hub')}
        onFreeze={(f) => { const s = stateRef.current; if (s) s.exitConfirmOpen = f; }}
      />

      <div style={styles.stage}>
        {gameState === 'PLAYING' && !hud.introVisible && hud.activeFood && (
          <div
            data-testid="fridge-active-food"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{ ...styles.statusRail, ...styles.activeFoodChip }}
          >
            {t('fridge.active_food', {
              food: `${hud.activeFood.emoji} ${hud.activeFood.label}`,
            })}
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          tabIndex={0}
          style={{
            width: '100%', height: 'auto', maxHeight: 'calc(100vh - 60px)',
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            objectFit: 'contain', imageRendering: 'pixelated', outline: 'none',
          }}
        />
      </div>

      {!atlasReady && <div style={styles.loading}>Loading...</div>}

      {gameState === 'PAUSED' && (
        <PauseOverlay
          surfaceRef={canvasRef}
          onResume={() => setGameState('PLAYING')}
          onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroFor(t))}
          onQuit={() => onNavigate('hub')}
        />
      )}
    </div>
  );
}

// ─── Placement grading (immediate, 3-tier) ───────────────
function placeHeld(state, binId, helpers, strings) {
  const food = state.heldItem;
  const { tier, factId } = gradePlacement(food.id, binId);
  const { bx, by } = stationCenter(getBin(binId));
  const attempt = recordFridgeAttempt(state, { foodId: food.id, tier });

  if (tier === TIER.AVOID) {
    // Keep the same food in hand so the child can immediately try a better home.
    // The card shows OUR plain sentence with the source chip, so the verbatim never
    // appears here without attribution.
    state.actionPrompt = null;
    spawnSparkles(state, bx, by, '#FFB74D', 6); // amber, NOT red — the food isn't bad
    state.screenShakeAmount = 4;
    const lead = strings('fridge.avoid_generic', 'That food keeps better somewhere else. Try another spot.');
    setFeedback(state, TIER.AVOID, lead,
      factId ? plainFor(strings, factId) : null,
      factId ? factSource(factId) : null, true);
    return;
  }

  if (tier === TIER.SUBOPTIMAL) {
    // A safe-but-not-best choice teaches without being locked in. The food stays
    // in hand and progress does not advance, so the child can improve the answer.
    state.actionPrompt = null;
    spawnSparkles(state, bx, by, '#FFD54F', 8);
    if (binId === 'compost') {
      setFeedback(state, TIER.SUBOPTIMAL,
        strings('fridge.compost_nudge', 'You can still eat this one. Store it somewhere instead of composting it.'),
        null, null);
    } else {
      setFeedback(state, TIER.SUBOPTIMAL,
        strings('fridge.suboptimal_generic', 'That food is safe there, but it keeps better somewhere else.'),
        factId ? plainFor(strings, factId) : null,
        factId ? factSource(factId) : null, true);
    }
    return;
  }

  state.binItems[binId].push({ id: food.id, emoji: food.emoji });
  state.totalPlaced = state.acceptedCount;
  state.heldItem = null;
  state.dropPrompt = null;
  helpers.addScore(attempt.points);
  spawnSparkles(state, bx, by, '#4CAF50', 10);
  spawnFloatingText(state, bx, by - 16, `+${attempt.points}`, '#4CAF50');
  // Fact coherence: a food-specific fact wins over the generic destination fact, so
  // the card names what was just stored (no repeated station card).
  const sourced = SOURCED_BINS.has(binId);
  const cardFactId = acceptedFactId(food.id, binId) || (sourced ? binId : null);
  const fact = cardFactId ? plainFor(strings, cardFactId) : null;
  const affirm = binId === 'compost'
    ? strings('fridge.compost_correct', 'This food is no longer safe to eat, so composting it is the right choice.')
    : strings('fridge.affirm', 'Your choice was accepted.');
  setFeedback(state, TIER.ACCEPTED, affirm, fact, fact ? factSource(cardFactId) : null, true);

  if (state.acceptedCount >= FOOD_COUNT) {
    state.celebrating = true;
    state.celebrateTimer = 0;
    for (const bin of ROOM.bins) {
      const { bx: cx, by: cy } = stationCenter(bin);
      spawnSparkles(state, cx, cy, '#FFD700', 8);
    }
  }
}

const styles = {
  stage: {
    position: 'relative', flex: 1, minHeight: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '8px 0', overflow: 'hidden',
  },
  statusRail: {
    position: 'absolute', zIndex: 4,
    top: 'clamp(8px, 1.6vh, 16px)', left: '50%', transform: 'translateX(-50%)',
    width: 'max-content', maxWidth: 'calc(100% - 24px)',
    pointerEvents: 'none',
  },
  activeFoodChip: {
    minHeight: 42, padding: '7px clamp(12px, 1.8vw, 22px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '3px solid #2E6B2E', borderRadius: 12,
    background: 'rgba(255, 248, 225, 0.96)', color: '#234F23',
    boxShadow: '0 4px 0 rgba(44, 62, 35, 0.34)',
    fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800,
    fontSize: 'clamp(15px, 1.65vw, 22px)', lineHeight: 1.15,
    whiteSpace: 'normal', textAlign: 'center',
  },
  loading: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#BCAAA4', color: '#fff', fontSize: 24,
  },
};
