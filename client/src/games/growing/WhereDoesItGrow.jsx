import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas, TILE } from '../../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { GAME_ROOMS } from '../engine/gameRoomData.js';
import {
  updatePlayerMovement, isEnterJustPressed, checkInteraction, TILE_SIZE as TS, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomTiles, renderGameRoomPlayer,
  renderGameRoomDecorations, renderHeldItem, renderActionPrompt,
  spawnSparkles, spawnFloatingText, spawnRejectX,
  updateParticles, renderParticles, updateFloatingTexts, renderFloatingTexts,
  updateRejectX, renderRejectX, OX, OY,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
  initMissionIntro, renderMissionIntroCard,
} from '../engine/gameRoomRenderer.js';
import {
  renderGrowingSpots, renderRevealCard,
  addGrowAnim, updateGrowAnims, renderGrowAnims, renderAmbientGrass, renderAmbientMotion,
} from '../engine/whereDoesItGrowRenderer.js';
import { missionIntroSourceId } from '../engine/missionIntroLogic.js';
import { drawIrisWipe, IRIS_DURATION, getCanvasPointer } from '../../utils/canvas.js';
import { WORLD_ART } from '../../styles/brandColors.js';
import {
  SPOTS, PLANT_ORIGINS, GROWING_REVEALS,
  buildDeck, gradeWhereDoesItGrow, starsForFirstTry, pickReveal,
} from '../../data/growing.js';
import useGameStore from '../../store/gameStore.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * WhereDoesItGrow — Growing Our Own Food, Mission 1 (HOOK).
 *
 * Compact walk-around community garden. The player carries one food at a time
 * (auto-given, no pickup) and walks it to the spot where it grows — tree / vine /
 * dug soil / grain field — then presses ENTER. Correct = +10 and (for some foods)
 * a verbatim "Did you know?" reveal with its source. Wrong = soft shake + a
 * hint on the correct spot, no penalty. 10 foods, pass ≥ 60% → ResultScreen (with
 * the verified-sources panel already wired for this mission).
 */

const DECK_SIZE = 10;
const POINTS_CORRECT = 10;
const ROOM = GAME_ROOMS.WhereDoesItGrow;

// Shared MissionIntroCard. The fact REUSES the locked 🟢 intro reveal
// (GROWING_REVEALS nine-species) verbatim; title/steps/goal are free UI text.
const GROW_INTRO_FACT = GROWING_REVEALS.find((r) => r.trigger.intro);
const MISSION_INTRO = {
  titleKey: 'missionIntro.wheredoesitgrow.title',
  stepKeys: [
    'missionIntro.wheredoesitgrow.step1',
    'missionIntro.wheredoesitgrow.step2',
    'missionIntro.wheredoesitgrow.step3',
    'missionIntro.wheredoesitgrow.step4', // How the stars are earned
  ],
  introFact: GROW_INTRO_FACT,
  goalKey: 'missionIntro.wheredoesitgrow.goal',
  ctaKey: 'hint.skip_ab',
};

// Custom walkability: GardenPlanner-style — allow GRASS/PATH/FLOOR_STONE.
// (isGameRoomWalkable only allows wood/stone, so grass rooms need their own set.)
const GARDEN_WALKABLE = new Set([TILE.GRASS, TILE.DARK_GRASS, TILE.PATH, TILE.FLOOR_STONE]);
// Block the growing-spot tiles (SoilDoctor pattern) so the player stands BESIDE
// a bed and interacts — standing ON the bed made Enter silently do nothing.
const BLOCKED_TILES = new Set(
  ROOM.growingSpots.flatMap((s) => s.tiles.map((t) => `${t.col},${t.row}`))
);
const isWalkable = (col, row) => {
  if (col < 0 || col >= 20 || row < 0 || row >= 15) return false;
  if (BLOCKED_TILES.has(`${col},${row}`)) return false;
  return GARDEN_WALKABLE.has(ROOM.map[row][col]);
};

const SPOT_EMOJI = Object.fromEntries(SPOTS.map((s) => [s.key, s.emoji]));

// Advance to the next food, or finish the game when the deck is exhausted.
function advanceToNextFood(state, helpers) {
  state.curWrong = false; // first-try tracking resets per food
  state.wrongAttemptsForCurrent = 0;
  state.hintSpotKey = null;
  state.hintTimer = 0;
  state.index++;
  if (state.index >= state.deck.length) {
    state.current = null;
    state.heldItem = null;
    helpers.complete();
  } else {
    state.current = state.deck[state.index];
    state.heldItem = state.current;
  }
}

// Pixel centre of a spot's tile group — anchors the grow animation to the bed.
function spotCenterPx(tiles) {
  let mnC = Infinity, mxC = -Infinity, mnR = Infinity, mxR = -Infinity;
  for (const t of tiles) {
    if (t.col < mnC) mnC = t.col;
    if (t.col > mxC) mxC = t.col;
    if (t.row < mnR) mnR = t.row;
    if (t.row > mxR) mxR = t.row;
  }
  return { x: OX + ((mnC + mxC + 1) / 2) * TS, y: OY + ((mnR + mxR + 1) / 2) * TS };
}

export default function WhereDoesItGrow({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const atlasRef = useRef(null);
  const [atlasReady, setAtlasReady] = useState(false);
  // Live 1–3 star tracker mirrored into the top bar (ScoreBar). Recomputed in
  // the loop on each correct placement; pushed to React only when it changes.
  const [liveStars, setLiveStars] = useState(0);
  // The canvas owns the gameplay state, while this small React mirror powers a
  // readable DOM label. It changes only when the active food or modal visibility
  // changes, never on every animation frame.
  const [activeFood, setActiveFood] = useState(null);

  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  // Pre-translate everything used inside the (non-React) game loop.
  const i18nRef = useRef({});
  i18nRef.current = {
    promptTemplate: t('wheredoesitgrow.prompt', { food: '__FOOD__' }),
    foodNames: Object.fromEntries(PLANT_ORIGINS.map((p) => [p.id, t(`foods.${p.id}`)])),
    spot: {
      tree: t('wheredoesitgrow.spot_tree'),
      vine: t('wheredoesitgrow.spot_vine'),
      soil: t('wheredoesitgrow.spot_soil'),
      grain: t('wheredoesitgrow.spot_grain'),
    },
    revealTitle: t('wheredoesitgrow.reveal_title'),
    revealDismiss: t('wheredoesitgrow.reveal_dismiss'),
    revealGeneralLabel: t('wheredoesitgrow.reveal_general'),
    sourceHint: t('wheredoesitgrow.source_hint'),
    wrongHint: t('wheredoesitgrow.wrong_hint'),
    // Every correct placement names WHY it was right, in the child's language —
    // shown as the reveal card's lead line, or as a floater when there's no card.
    correctTemplates: {
      tree: t('wheredoesitgrow.correct_tree', { food: '__FOOD__' }),
      vine: t('wheredoesitgrow.correct_vine', { food: '__FOOD__' }),
      soil: t('wheredoesitgrow.correct_soil', { food: '__FOOD__' }),
      grain: t('wheredoesitgrow.correct_grain', { food: '__FOOD__' }),
    },
    // Pre-translated "Did you know?" lines for mid-game reveal cards and the intro.
    // These are the child-facing `plain` sentences, not the verbatim
    // quotes — the verbatim passage stays one keypress away behind the source badge.
    // English falls back via i18next defaultValue to the canonical r.plain in growing.js —
    // so en.json stays untouched and growing.js remains the single EN source of truth.
    factQuotes: Object.fromEntries(
      GROWING_REVEALS.map((r) => [r.id, t(`wheredoesitgrow.facts.${r.id}`, { defaultValue: r.plain })]),
    ),
  };

  // MISSION_INTRO whose intro fact reads in the UI language (English via fallback).
  // Used by BOTH the setup intro card AND the Guide re-open (onInstructions) so the
  // localized quote always persists — never mutates the MISSION_INTRO module constant.
  const missionIntroRef = useRef(MISSION_INTRO);
  missionIntroRef.current = {
    ...MISSION_INTRO,
    introFact: {
      ...GROW_INTRO_FACT,
      quote: i18nRef.current.factQuotes[GROW_INTRO_FACT.id],
      paraphrase: true, // our plain sentence, so the card sets it unquoted (see renderer)
    },
  };

  const { gameState, setGameState, score, stateRef } = useGameRoomCanvas(canvasRef, {
    timeLimit: null, // HOOK — no time pressure

    setup: (state) => {
      // Expose state on the canvas for harness/debug reads (SeasonMatcher pattern).
      if (canvasRef.current) canvasRef.current._stateRef = stateRef;
      if (state.player) return; // hook re-runs setup on INIT→PLAYING; guard
      const labels = i18nRef.current;
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

      state.deck = buildDeck(DECK_SIZE);
      state.index = 0;
      state.correct = 0;
      state.wrong = 0;
      // First-try star rating (report-only — never changes the loop).
      state.firstTryCount = 0;
      state.streak = 0;
      state.bestStreak = 0;
      state.curWrong = false;
      state.wrongAttemptsForCurrent = 0;
      state.missed = [];
      state.liveStars = 0;
      state.current = state.deck[0];
      state.heldItem = state.current; // renderHeldItem draws .emoji above player

      state.spots = ROOM.growingSpots.map((s) => ({
        key: s.key,
        tiles: s.tiles,
        emoji: SPOT_EMOJI[s.key],
        label: labels.spot[s.key],
      }));

      state.particles = [];
      state.floatingTexts = [];
      state.rejectX = null;
      state.screenShake = 0;
      state.screenShakeAmount = 0;

      state.shownReveals = new Set();
      state.hintSpotKey = null;
      state.hintTimer = 0;
      state.actionPrompt = null;

      state.revealTitle = labels.revealTitle;
      state.revealDismiss = labels.revealDismiss;
      state.revealGeneralLabel = labels.revealGeneralLabel;
      state.sourceHint = labels.sourceHint;

      // Intro — shared MissionIntroCard (frames the game) with the 🟢 nine-species fact,
      // localized via missionIntroRef (the same object the Guide re-open uses). Mid-game
      // reveals still use state.reveal / renderRevealCard (untouched).
      initMissionIntro(state, t, missionIntroRef.current);
    },

    update: (state, dt, keys, helpers) => {
      state.time += dt;

      const activeFoodIsVisible = Boolean(
        state.current
        && !state.showMissionIntro
        && !state.reveal
        && (state.pendingRevealTimer || 0) <= 0
        && !state.exitConfirmOpen
      );
      // After the 2nd wrong try on the same food, the chip also explains WHY the
      // food belongs to its spot. It stays until the food
      // is placed, so the child has time to read it (no fading floater).
      const showWhy = activeFoodIsVisible && (state.wrongAttemptsForCurrent || 0) >= 2;
      const activeFoodSignature = activeFoodIsVisible
        ? `${state.current.id}|${showWhy ? 'why' : ''}` : '';
      if (state.activeFoodChipSignature !== activeFoodSignature) {
        state.activeFoodChipSignature = activeFoodSignature;
        setActiveFood(activeFoodIsVisible
          ? { id: state.current.id, emoji: state.current.emoji, whyOrigin: showWhy ? state.current.origin : null }
          : null);
      }

      // Iris-wipe intro.
      if (state.irisOpenness < 1) {
        state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
      }

      // Effects.
      updateParticles(state, dt);
      updateFloatingTexts(state, dt);
      updateRejectX(state, dt);
      updateGrowAnims(state, dt);

      // Screen-shake decay.
      if (state.screenShakeAmount > 0.5) {
        state.screenShake = Math.sin(state.time * 50) * state.screenShakeAmount;
        state.screenShakeAmount *= 0.88;
      } else {
        state.screenShake = 0;
        state.screenShakeAmount = 0;
      }

      // Correct-spot hint fades out.
      if (state.hintTimer > 0) {
        state.hintTimer -= dt;
        if (state.hintTimer <= 0) state.hintSpotKey = null;
      }

      // Brief "it grew!" beat after a correct drop — show the grow animation
      // before the fact card dims the scene.
      if (state.pendingRevealTimer > 0) {
        state.timerPaused = true;
        state.actionPrompt = null;
        state.pendingRevealTimer -= dt;
        if (state.pendingRevealTimer <= 0) {
          state.reveal = state.pendingReveal;
          state.pendingReveal = null;
        }
        return;
      }

      // ── MissionIntroCard (pause). Shown once at start; iris opens
      // behind it (advanced at the top of update). ENTER dismisses; S/click opens the
      // source via the window/canvas listeners below.
      if (state.showMissionIntro) {
        state.timerPaused = true;
        state.actionPrompt = null;
        if (isEnterJustPressed(keys, state)) state.showMissionIntro = false;
        return;
      }

      // Reveal open → pause loop. ENTER dismisses. (S opens the source — handled by a
      // keydown listener below so the popup counts as a real user gesture.)
      if (state.reveal) {
        state.timerPaused = true;
        state.actionPrompt = null;
        if (isEnterJustPressed(keys, state)) {
          const wasIntro = state.reveal.intro === true;
          state.reveal = null;
          if (!wasIntro) advanceToNextFood(state, helpers);
        }
        return;
      }
      state.timerPaused = false;

      // Block movement until the iris is fully open.
      if (state.irisOpenness < 1) return;

      updatePlayerMovement(state.player, dt, keys, isWalkable);

      // Prompt naming the current food.
      const strings = i18nRef.current;
      state.actionPrompt = state.current
        ? strings.promptTemplate.replace('__FOOD__', strings.foodNames[state.current.id] || state.current.id)
        : null;

      // ENTER → deliver the current food to the spot the player faces.
      if (isEnterJustPressed(keys, state) && state.current) {
        const spot = state.spots.find((s) => checkInteraction(state.player, s.tiles, 1));
        if (!spot) return;

        const px = OX + state.player.pixelX + TS / 2;
        const py = OY + state.player.pixelY;

        if (spot.key === state.current.origin) {
          // Correct.
          helpers.addScore(POINTS_CORRECT);
          state.correct++;

          // First-try rating (report-only): a clean first hit grows the streak +
          // star count; a food that was missed before is logged for the recap.
          const totalFoods = state.deck.length;
          if (!state.curWrong) {
            state.firstTryCount++;
            state.streak++;
            if (state.streak > state.bestStreak) state.bestStreak = state.streak;
          } else {
            state.missed.push({ id: state.current.id, origin: state.current.origin });
          }
          const ns = starsForFirstTry(state.firstTryCount, totalFoods);
          if (ns !== state.liveStars) { state.liveStars = ns; setLiveStars(ns); } // push to top bar only on change

          spawnSparkles(state, px, py, '#4CAF50', 10);
          spawnFloatingText(state, px, py - 16, '+10', '#4CAF50');
          // Grow animation at the BED (not the player) so the reward is tied to the spot.
          const gc = spotCenterPx(spot.tiles);
          addGrowAnim(state, gc.x, gc.y);

          // "Why was that right" — localized, names the food + its origin.
          const foodName = strings.foodNames[state.current.id] || state.current.id;
          const correctLine = (strings.correctTemplates[spot.key] || '')
            .replace('__FOOD__', foodName);

          const rev = pickReveal(state.current, state.shownReveals);
          if (rev) {
            // Let the player SEE it grow first; the fact card follows after a short
            // beat — led by the localized "Correct! X grows on Y" line, then the
            // child-facing plain sentence. The verbatim passage that backs it stays
            // one keypress away on the same card (source badge / Press S).
            state.shownReveals.add(rev.id);
            const displayedQuote = (strings.factQuotes && strings.factQuotes[rev.id]) || rev.plain;
            state.pendingReveal = {
              quote: displayedQuote, sourceId: rev.sourceId, scope: rev.scope,
              lead: correctLine, paraphrase: true,
            };
            state.pendingRevealTimer = 0.7;
          } else {
            // No fact card this time — the lesson still lands as a floater over
            // the bed: dark-green outline (a red rim contradicts "Correct!") and
            // a longer life so a full sentence is actually readable.
            spawnFloatingText(state, gc.x, gc.y - 34, correctLine, '#2e7d32',
              { outline: '#1B5E20', life: 2.5 });
            advanceToNextFood(state, helpers);
          }
        } else {
          // Wrong — soft fail: teach, don't punish.
          state.wrong++;
          state.wrongAttemptsForCurrent++;
          state.curWrong = true; // this food no longer counts as a first-try win
          state.streak = 0;
          state.screenShakeAmount = 6;
          spawnRejectX(state, px, py);
          // Worded nudge above the reject ✗ (34px up so they don't overlap). Amber, not
          // alarm-red — teach-don't-punish parity with Soil Doctor's wrong-hint.
          // Every miss keeps its worded nudge next to the ✗. In the top half of the
          // garden it starts BELOW the player, so it never rises behind the
          // "Now planting" chip at the top; in the bottom half it stays above.
          if (state.floatingTexts) {
            state.floatingTexts = state.floatingTexts.filter((f) => f.text !== strings.wrongHint);
          }
          const nudgeY = state.player.row < 7 ? py + 62 : py - 34;
          spawnFloatingText(state, px, nudgeY, strings.wrongHint, '#FFB74D');
          if (state.wrongAttemptsForCurrent >= 2) {
            state.hintSpotKey = state.current.origin;
            state.hintTimer = 2.8; // keep the "plant it here" nudge up long enough to read
          }
        }
      }
    },

    render: (ctx, state) => {
      if (!atlasRef.current) return;

      // Continue the surrounding meadow all the way to the garden walls.
      ctx.fillStyle = WORLD_ART.meadow;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // ── Zoom into the garden ──
      applyRoomCamera(ctx, ROOM);

      renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);
      renderGameRoomDecorations(ctx, ROOM);
      renderAmbientGrass(ctx, state); // grass in BACKGROUND so the spot labels stay readable
      renderGrowingSpots(ctx, state);
      renderAmbientMotion(ctx, state); // bee/butterfly in the foreground sky
      renderGameRoomPlayer(ctx, state, atlasRef.current);
      renderHeldItem(ctx, state);
      renderGrowAnims(ctx, state); // sprouts pop over the bed/player
      renderParticles(ctx, state);
      renderFloatingTexts(ctx, state);
      renderRejectX(ctx, state);

      releaseRoomCamera(ctx);

      // HUD elements at original canvas scale (live stars live in the top bar now)
      renderActionPrompt(ctx, state);
      renderRevealCard(ctx, state);

      // Iris-wipe intro (convert player position to canvas coords for zoom).
      if (state.irisOpenness < 1) {
        const px = OX + state.player.pixelX + TS / 2;
        const py = OY + state.player.pixelY + TS / 2;
        const { x: canvasX, y: canvasY } = roomToCanvas(ROOM, px, py);
        drawIrisWipe(ctx, canvasX, canvasY, state.irisOpenness, CANVAS_W, CANVAS_H);
      }

      // Intro card sits on top of everything, including the opening iris.
      renderMissionIntroCard(ctx, state);
    },

    onComplete: () => {},
  });

  // Completion → ResultScreen (carries pass + extras; the sources panel is already wired there).
  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const s = stateRef.current;
      const total = s.deck?.length || DECK_SIZE;
      const { passed, stars, tier } = gradeWhereDoesItGrow(s.firstTryCount || 0, total);
      // Persist the best ⭐ for the lighthouse Trophy Hall (Phase 2 reads this).
      useGameStore.getState().recordStars('growing:WhereDoesItGrow', stars);
      setTimeout(() => onComplete(score, passed, {
        stars, tier,
        bestStreak: s.bestStreak || 0,
        firstTryCount: s.firstTryCount || 0,
        total,
        missed: s.missed || [],
      }), 500);
    }
  }, [gameState]);

  // Auto-start once the tile atlas is ready (iris wipe is the intro).
  useEffect(() => {
    if (atlasReady && gameState === 'INIT') setGameState('PLAYING');
  }, [atlasReady, gameState]);

  // Focus canvas for keyboard input.
  useEffect(() => {
    if (atlasReady && canvasRef.current) canvasRef.current.focus();
  }, [atlasReady]);

  // Source badge click: while a reveal is open, a click inside state.sourceBadgeRect
  // (canvas-pixel coords, set every frame by renderRevealCard) opens the branded viewer.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onClick = (e) => {
      const state = stateRef.current;
      if (!state) return;
      const p = getCanvasPointer(canvas, e);
      // Intro card chip — rect is {x,y,width,height} (shared hitTest shape).
      const introId = missionIntroSourceId(state);
      const ir = state.introSourceRect;
      if (introId && ir
        && p.x >= ir.x && p.x <= ir.x + ir.width && p.y >= ir.y && p.y <= ir.y + ir.height) {
        window.open('/source.html?src=' + introId, '_blank', 'noopener');
        return;
      }
      // Mid-game reveal card chip — renderRevealCard writes {x,y,w,h}.
      if (!state.reveal || !state.sourceBadgeRect || !state.reveal.sourceId) return;
      const r = state.sourceBadgeRect;
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        window.open('/source.html?src=' + state.reveal.sourceId, '_blank', 'noopener');
      }
    };
    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [atlasReady]);

  // Source open via keyboard: press S while the intro card or a reveal is open. Listens
  // on WINDOW (like the main key handler, useGameRoomCanvas.js:59) so it survives the
  // canvas losing focus after a header-button click. Real keydown handler (not the
  // RAF loop) so window.open counts as a user gesture; the loop is paused during
  // intro/reveal, so S never doubles as player movement here.
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || (e.key !== 's' && e.key !== 'S' && e.code !== 'KeyS')) return; // e.code: Greek layout sends 'σ'
      const state = stateRef.current;
      if (!state) return;
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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: WORLD_ART.meadow, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <ScoreBar
        score={score}
        stars={liveStars}
        timeLeft={null}
        onPause={() => setGameState('PAUSED')}
        onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroRef.current)}
        onExit={() => onNavigate('hub')}
        onFreeze={(f) => { const s = stateRef.current; if (s) s.exitConfirmOpen = f; }}
      />

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
        {gameState === 'PLAYING' && activeFood && (
          <div
            data-testid="where-does-it-grow-active-food"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={activeFoodChipStyle}
          >
            <span style={activeFoodMainRowStyle}>
              <span aria-hidden="true" style={{ fontSize: '1.35em', lineHeight: 1 }}>{activeFood.emoji}</span>
              <span>{t('wheredoesitgrow.active_food', {
                food: i18nRef.current.foodNames[activeFood.id] || activeFood.id,
              })}</span>
            </span>
            {activeFood.whyOrigin && (
              <span data-testid="where-does-it-grow-why" style={activeFoodWhyStyle}>
                {/* Food-agnostic on purpose ("This food…"): the line above already
                    names the food, and this keeps grammar right for plural names. */}
                💡 {t(`wheredoesitgrow.why_${activeFood.whyOrigin}`)}
              </span>
            )}
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          tabIndex={0}
          style={{
            maxHeight: '100%',
            width: '100%',
            height: 'auto',
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            imageRendering: 'pixelated',
            outline: 'none',
            display: 'block',
          }}
        />
      </div>

      {!atlasReady && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: WORLD_ART.meadow, color: '#fff', fontSize: 24,
        }}>
          Loading...
        </div>
      )}

      {gameState === 'PAUSED' && (
        <PauseOverlay
          surfaceRef={canvasRef}
          onResume={() => setGameState('PLAYING')}
          onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroRef.current)}
          onQuit={() => onNavigate('hub')}
        />
      )}
    </div>
  );
}

const activeFoodChipStyle = {
  position: 'absolute',
  top: 'clamp(8px, 1.8vh, 16px)',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 4,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'clamp(8px, 1.2vw, 14px)',
  boxSizing: 'border-box',
  // max-content: an absolutely positioned chip at left:50% would otherwise
  // shrink to half the width and wrap the "why" line onto the growing beds.
  width: 'max-content',
  maxWidth: 'calc(100% - 32px)',
  minHeight: 46,
  padding: '8px clamp(14px, 2.2vw, 24px)',
  background: '#2E6F2A',
  border: '3px solid #FFF3C4',
  borderRadius: 2,
  boxShadow: '4px 4px 0 #4E342E, inset 0 0 0 2px rgba(255,255,255,0.12)',
  color: '#FFF8E1',
  fontSize: 'clamp(18px, 2.1vw, 28px)',
  fontWeight: 800,
  lineHeight: 1.15,
  textAlign: 'center',
  textShadow: '2px 2px 0 rgba(0,0,0,0.28)',
  whiteSpace: 'normal',
  pointerEvents: 'none',
};

const activeFoodMainRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'clamp(8px, 1.2vw, 14px)',
};

// Second line of the chip: the "why" after two wrong tries. Smaller and warm
// amber so it reads as help, not as an error.
// Kept compact (one line on school laptops) so the chip never grows down over
// the top growing beds.
const activeFoodWhyStyle = {
  display: 'block',
  marginTop: 2,
  padding: '3px 10px',
  background: '#FFF3C4',
  color: '#4E342E',
  fontSize: 'clamp(13px, 1.3vw, 18px)',
  fontWeight: 700,
  lineHeight: 1.2,
  textShadow: 'none',
};
