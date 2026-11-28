import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas } from '../../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import {
  updatePlayerMovement, isEnterJustPressed, isDropKeyPressed, checkInteraction, TILE_SIZE as TS, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomTiles, renderGameRoomPlayer,
  renderGameRoomDecorations,
  spawnSparkles, spawnFloatingText, updateParticles, renderParticles,
  updateFloatingTexts, renderFloatingTexts, OX, OY,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
  initMissionIntro, renderMissionIntroCard,
} from '../engine/gameRoomRenderer.js';
import {
  renderFridgeMarket, renderActivePlate, renderProgress, renderChefCoach,
  renderMealPlannerControlDock, renderMealPlannerHeldItem,
  renderResultsCard, renderTeachToast, renderWasteFactCard,
} from '../engine/mealPlannerRenderer.js';
import { hasDrawnIcon } from '../engine/itemGlyphs.js';
import { drawIrisWipe, IRIS_DURATION, getCanvasPointer, hitTest } from '../../utils/canvas.js';
import {
  PLATES, SCENARIOS, pickScenario, scorePlan, scorePlanProgress,
  mealPlannerStarsForPct, spoiledIds,
  atRiskInventory, FOOD_BY_ID, WASTE_FACTS, AXIS_WEIGHTS,
} from '../../data/foodwaste.js';
import {
  resolvePlacement, atRiskStillInFridge,
  MARKET_CAP, canAcquireMarket, marketHeldCount, advanceMealPlannerResultPage,
} from './mealPlannerCarry.js';
import { layoutMarketItems } from './mealPlannerShelfLayout.js';
import { mealPlanRecap } from './mealPlanRecap.js';
import { buildMealPlanRecapText, buildMealPlanHowText, planPoints } from './mealPlanRecapText.js';
import {
  createMealPlannerCoachMessage,
  shouldShowAtRiskMarketCoach,
  tickMealPlannerCoachMessage,
  createCoachTold, choiceCoachFor, markCoachTold, isChoiceCoach,
  coachAfterUndo, coachAfterHomePlacement, shouldShowMealDone,
} from './mealPlannerCoach.js';
import { missionIntroSourceId } from '../engine/missionIntroLogic.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * MealPlanner — Food Waste Island, Mission 2 (PRACTICE). Walk-GRAB-CARRY port.
 *
 * Teaches the locked [S] goal "reduce food waste through planning, storage, portioning, reuse".
 * A top-down room: walk to the FRIDGE (left) or a MARKET crate (right) + Enter to pick a food
 * into your hands; walk to the central ACTIVE plate + Enter to place it in a matching socket.
 * One active meal at a time; the physical menu board shows the current and upcoming plates,
 * and the next meal unlocks only after the active one is complete + you cook/advance.
 * Fridge-first is a SOFT recommendation (the chef nudges; the Waste score + spoilage teach).
 * The Chef mentor (in-room, bottom-left) speaks ONLY claim-free process guidance — never a
 * health/shelf-life/footprint claim. The only on-screen facts are the two UNEP stats on the
 * RESULTS «Did you know?» card (verbatim + source chip + «Press S»). Scoring is centralized
 * in foodwaste.js; the carry decisions live in mealPlannerCarry.js.
 */

const ROOM = GAME_ROOMS.MealPlanner;
const isWalkable = (col, row) => isGameRoomWalkable(ROOM, col, row);
const emojiOf = (id) => FOOD_BY_ID[id]?.emoji || '🍽️';
const SEASON_EMOJI = { summer: '☀️', autumn: '🍂', winter: '❄️', spring: '🌸' };

// `foods.js` still uses an ice cube as tofu's legacy placeholder. Keep the
// child-facing cue truthful until the shared dataset receives dedicated art. Drawn-icon foods
// (leek: dataset emoji is an onion) get the name only too.
export function getMealPlannerFoodCue(food, labels = {}) {
  const name = labels.nameOf ? labels.nameOf(food.id) : food.id;
  return food.id === 'tofu' || hasDrawnIcon(food) ? name : `${food.emoji || ''} ${name}`.trim();
}

export function syncMealPlannerLiveScore(state, helpers, setLiveStars) {
  const options = { season: state.scenario.season, scenario: state.scenario };
  const progress = scorePlanProgress(state.plates, options);
  // Floored like the score card, so the HUD never shows 55 without its star.
  const nextScore = Math.floor(progress.pct * 100 + 1e-9);
  const nextStars = mealPlannerStarsForPct(progress.pct);
  if (helpers.getScore() !== nextScore) helpers.setScore(nextScore);
  if (state.liveStars !== nextStars) {
    state.liveStars = nextStars;
    setLiveStars?.(nextStars);
  }
  return nextScore;
}

// Shared MissionIntroCard — surfaces ONE UNEP stat with a source chip + «Press S»
// (gold pattern · Island 1 / GardenPlanner). The card shows OUR translated plain
// sentence; the chip opens the verbatim (provisional source).
// The full 2-stat «Did you know?» panel still appears at RESULTS.
const missionIntroFor = (t) => ({
  titleKey: 'missionIntro.mealplanner.title',
  stepKeys: [
    'missionIntro.mealplanner.step1',
    'missionIntro.mealplanner.step2',
    'missionIntro.mealplanner.step3',
    'missionIntro.mealplanner.step4',
  ],
  introFact: {
    quote: t(`meal_planner.facts.${WASTE_FACTS[0].id}`, { defaultValue: WASTE_FACTS[0].plain }),
    sourceId: WASTE_FACTS[0].sourceId,
    paraphrase: true,
  },
  goalKey: 'missionIntro.mealplanner.goal',
  ctaKey: 'hint.skip_ab',
});

export default function MealPlanner({ island, mission, missionId, onComplete, onNavigate }) {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef(null);
  const atlasRef = useRef(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const [liveStars, setLiveStars] = useState(0);

  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  const i18nRef = useRef({});
  i18nRef.current = {
    phaseResults: t('meal_planner.phase_results', 'Your meal plan'),
    resultsNextPrompt: t('meal_planner.results_next_prompt', 'Press Enter or Space to see what you learned'),
    factContinuePrompt: t('meal_planner.fact_continue_prompt', 'Press Enter or Space to continue'),
    // Walk-GRAB-CARRY prompts.
    grabPrompt: (food) => t('meal_planner.grab_prompt', { food, defaultValue: `Press Enter or Space to pick up ${food}` }),
    placePrompt: t('meal_planner.place_prompt', 'Press Enter or Space to put it on the plate'),
    nextPrompt: t('meal_planner.next_prompt', 'Press Enter or Space for the next meal'),
    cookPrompt: t('meal_planner.cook_prompt', 'Press Enter or Space to cook your plates!'),
    undoHint: t('meal_planner.undo_hint', 'Press Q to put a food back.'),
    useFirst: t('meal_planner.use_first', 'Use first!'),
    fridgeZone: t('meal_planner.zone_fridge', 'FRIDGE'),
    marketZone: t('meal_planner.zone_market', 'MARKET'),
    menuBoardTitle: t('missionIntro.mealplanner.title'),
    // The season is visible on the menu board («The Chef's Menu · ☀️ Summer»).
    menuBoardTitleFor: (seasonId) => (seasonId ? t('meal_planner.menu_season', {
      title: t('missionIntro.mealplanner.title'), emoji: SEASON_EMOJI[seasonId] || '', season: t(`season.${seasonId}`, seasonId),
    }) : t('missionIntro.mealplanner.title')),
    missingShort: t('meal_planner.missing_short', 'Missing:'),
    // Chef mentor: process guidance only. NO factual claims.
    chefName: t('meal_planner.chef_name', 'The Chef'),
    chefWelcome: t('meal_planner.chef_welcome', 'Empty the fridge first, then buy only what you are missing.'),
    grabbed: t('meal_planner.chef_grabbed', 'Got it. Take it to the plate!'),
    placedGood: t('meal_planner.chef_good', 'Nice choice! 👍'),
    junkNudge: t('meal_planner.nudge_junk', "This doesn't go on a plate. Press Q or B to put it back."),
    wrongSocket: t('meal_planner.nudge_wrong_socket', 'There is no open spot for that on this plate. Try another food.'),
    // Name the food, so the line still makes sense after the next grab.
    alreadyHave: (foodId) => t('meal_planner.already_have', {
      food: t(`foods.${foodId}`, foodId).toLocaleLowerCase(i18n.language || undefined),
      emoji: emojiOf(foodId),
      defaultValue: 'Already in your fridge: {{food}} {{emoji}}. Use that one too, or you lose points.',
    }),
    plantNudge: t('meal_planner.nudge_plant', 'In this game lentils give more Planet-friendly points.'),
    atRiskCoach: t('meal_planner.coach_atrisk', "Pick what's marked “Use first!” from the fridge."),
    // Neutral label template — «season · out of season in the game: food emoji» — so it
    // reads the same for every food, singular or plural, in every language (no gender / case data).
    seasonCoach: (seasonId, foodId) => t('meal_planner.coach_season', {
      season: t(`season.${seasonId}`, seasonId),
      food: t(`foods.${foodId}`, foodId).toLocaleLowerCase(i18n.language || undefined),
      emoji: emojiOf(foodId),
      defaultValue: '{{season}} · out of season in the game: {{food}} {{emoji}}. Fewer Planet-friendly points.',
    }),
    mealDone: t('meal_planner.chef_meal_done', 'The plate is ready. On to the next meal.'),
    putBack: t('meal_planner.chef_put_back', 'Back it goes!'),
    platesDone: t('meal_planner.plates_done', 'All plates ready. Go cook!'),
    // Market-cap process guidance (NO factual claim — teach-don't-punish).
    marketCapFull: t('meal_planner.market_cap_full', "That's the shopping done. Make the most of your fridge!"),
    marketCapNear: t('meal_planner.market_cap_near', 'You can only buy a few more things.'),
    // RESULTS.
    axisSustain: t('meal_planner.axis_sustainability', 'Planet-friendly'),
    axisWaste: t('meal_planner.axis_waste', 'Nothing wasted'),
    axisNutrition: t('meal_planner.axis_nutrition', 'Full plates'),
    factTitle: t('meal_planner.fact_title', 'Did you know?'),
    pressS: t('meal_planner.press_s', 'Press S or tap the source ↗'),
    // The «Did you know?» card shows OUR translated plain sentences;
    // the chip keeps opening the verbatim source.
    wasteFacts: WASTE_FACTS.map((f) => ({
      ...f,
      plain: t(`meal_planner.facts.${f.id}`, { defaultValue: f.plain }),
      paraphrase: true,
    })),
    cookMissing: (slot, meal) => t('meal_planner.cook_missing', { slot, meal, defaultValue: `${meal} still needs: ${slot}.` }),
    // Results recap: text built from the final plates, neutral per-language templates.
    howOpen: t('meal_planner.how.open'),
    howBack: t('meal_planner.how.back'),
    howText: (recap, seasonId) => buildMealPlanHowText(recap, {
      tr: (key, vars) => t(`meal_planner.how.${key}`, vars),
      nameOf: (id) => t(`foods.${id}`, id),
      lang: i18n.language,
      seasonName: t(`season.${seasonId}`, seasonId),
      useFirst: t('meal_planner.use_first', 'Use first!'),
      axisNames: {
        sustainability: t('meal_planner.axis_sustainability'), waste: t('meal_planner.axis_waste'), nutrition: t('meal_planner.axis_nutrition'),
      },
      weights: AXIS_WEIGHTS,
    }),
    recapText: (recap, seasonId) => buildMealPlanRecapText(recap, {
      tr: (key, vars) => t(`meal_planner.recap.${key}`, vars),
      nameOf: (id) => t(`foods.${id}`, id),
      lang: i18n.language,
      seasonName: t(`season.${seasonId}`, seasonId),
      useFirst: t('meal_planner.use_first', 'Use first!'),
    }),
    nameOf: (id) => t(`foods.${id}`, id),
    mealName: (m) => t(`meal_planner.meal_${m}`, m),
    slotLabel: (ty) => t(`meal_planner.slot_${ty}`, ty),
    catName: (c) => t(`meal_planner.cat_${c}`, c),
    marketCount: (used, total) => t('meal_planner.market_count', { used, total, defaultValue: `Shopping: ${used}/${total}` }),
  };

  const { gameState, setGameState, score, stateRef } = useGameRoomCanvas(canvasRef, {
    timeLimit: null, // PRACTICE — calm, no clock

    setup: (state) => {
      if (canvasRef.current) canvasRef.current._stateRef = stateRef;
      if (state.player) return;
      const start = ROOM.playerStart;

      state.player = {
        col: start.col, row: start.row,
        pixelX: start.col * TS, pixelY: start.row * TS,
        dir: start.dir ?? DIR.UP,
        moving: false, moveTimer: 0, fromX: 0, fromY: 0, toX: 0, toY: 0,
      };
      state.time = 0;
      state.irisOpenness = 0;
      state.enterWasDown = false;
      state.qWasDown = false;
      state.sWasDown = false;

      // Pick a seasonal scenario — deterministic by ?scenario=<index> in testMode, else random.
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const raw = params ? params.get('scenario') : null;
      const idx = raw != null && raw !== '' && Number.isFinite(Number(raw))
        && Number(raw) >= 0 && Number(raw) < SCENARIOS.length ? Number(raw) : null;
      const scenario = idx != null ? pickScenario({ index: idx }) : pickScenario({});
      state.scenario = scenario;

      // Fridge (left aisle) — the home inventory; at-risk items pulse "Use first!".
      const risk = new Set(atRiskInventory(scenario.homeInventory));
      state.fridge = scenario.homeInventory.map((id, i) => ({
        id, emoji: emojiOf(id), tile: ROOM.fridgeTiles[i], atRisk: risk.has(id), used: false,
      }));

      // Market — every category owns one fixed supermarket shelf; 1/2/3 items are centred.
      state.marketShelves = ROOM.marketShelves;
      state.market = layoutMarketItems(scenario.market, ROOM.marketShelves)
        .map((item) => ({ ...item, emoji: emojiOf(item.id) }));

      // The 3 plates — typed sockets mirror PLATES (the live plate-state the scorer reads).
      state.plates = PLATES.map((p) => ({
        meal: p.meal,
        slots: p.sockets.map((type) => ({ type, item: null, source: null, emoji: null })),
      }));
      state.activePlate = 0;
      state.plateCenter = ROOM.plateCenter;
      state.chefPos = ROOM.chefPos;

      state.heldItem = null;      // { id, emoji, source, fridgeRef }
      state.history = [];         // for Undo / Q
      state.phase = 'play';       // single phase — fridge + market both open
      state.results = null;
      state.spoiled = null;
      state.recap = null;
      state.recapView = null;
      state.howView = null;
      state.howOpen = false;   // «How was the score made?» starts closed
      state.resultPage = null;
      state.marketHeld = 0;
      state.marketCap = MARKET_CAP;

      state.actionPrompt = null;
      state.focusedSource = null;
      state.atRiskCoachShown = false;
      state.coachTold = createCoachTold(); // what the chef has said in this attempt
      state.liveStars = 0;
      state.toast = null;
      state.particles = [];
      state.floatingTexts = [];
      state.labels = i18nRef.current;
      state.chef = null;

      initMissionIntro(state, t, missionIntroFor(t));
    },

    update: (state, dt, keys, helpers) => {
      const L = i18nRef.current;
      state.labels = L;
      state.time += dt;

      if (state.showMissionIntro) {
        if (state.irisOpenness < 1) state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
        if (isEnterJustPressed(keys, state)) state.showMissionIntro = false;
        state.timerPaused = true;
        latchHowArrows(state);   // an arrow held while the card was open does not open the breakdown
        return;
      }
      if (state.irisOpenness < 1) {
        state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
        return;
      }
      updateParticles(state, dt);
      updateFloatingTexts(state, dt);
      if (state.toast) { state.toast.life -= dt; if (state.toast.life <= 0) state.toast = null; }
      state.chef = tickMealPlannerCoachMessage(state.chef, dt);
      // No automatic egg hint — the chef only reacts to the child's own choices.

      // RESULTS — score first, then the educational fact/source, then complete.
      if (state.phase === 'results') {
        state.timerPaused = true;
        state.actionPrompt = null;
        const onFactPage = state.resultPage === 'fact';
        const sDown = onFactPage && (keys.has('s') || keys.has('keys')); // 'keys' = e.code KeyS (Greek layout)
        if (sDown && !state.sWasDown && state.wasteFact?.[0]?.sourceId && typeof window !== 'undefined') {
          window.open(`source.html?src=${state.wasteFact[0].sourceId}`, '_blank', 'noopener');
        }
        state.sWasDown = sDown;
        // ▼ opens / ▲ closes the optional breakdown, on the score page only (a flag on that
        // page, so Enter / Space / A still goes score → fact → complete exactly as before).
        const downNow = keys.has('arrowdown'); const upNow = keys.has('arrowup');
        if (state.resultPage === 'score') {
          if (downNow && !state.arrowDownWas) state.howOpen = true;
          if (upNow && !state.arrowUpWas) state.howOpen = false;
        }
        state.arrowDownWas = downNow; state.arrowUpWas = upNow;
        // Always read the edge, so a habit press during the grace is used up, not queued.
        const enterJust = isEnterJustPressed(keys, state);
        if (state.resultsLockT > 0) { state.resultsLockT -= dt; return; }
        if (enterJust) {
          state.howOpen = false;
          const nextPage = advanceMealPlannerResultPage(state.resultPage);
          if (nextPage === 'complete') helpers.complete();
          else state.resultPage = nextPage;
        }
        return;
      }

      updatePlayerMovement(state.player, dt, keys, isWalkable);
      state.actionPrompt = null;

      const plate = state.plates[state.activePlate];
      const plateDone = plate.slots.every((s) => s.item);
      const liveFridge = state.fridge.filter((f) => !f.used).map((f) => f.id);
      const marketHeld = marketHeldCount(state.plates, state.heldItem); // placed + in hand
      state.marketHeld = marketHeld;
      const marketOpen = canAcquireMarket(marketHeld, MARKET_CAP);
      const atPlate = !!checkInteraction(state.player, ROOM.plateTiles, 1);
      const facingFridge = !state.heldItem
        ? state.fridge.filter((f) => !f.used).find((f) => checkInteraction(state.player, [f.tile], 1)) : null;
      const facingMarket = !state.heldItem
        ? state.market.find((m) => checkInteraction(state.player, [m.tile], 1)) : null;
      const focusedSource = facingFridge || facingMarket;
      state.focusedSource = focusedSource ? {
        kind: facingFridge ? 'home' : 'market',
        id: focusedSource.id,
        col: focusedSource.tile.col,
        row: focusedSource.tile.row,
      } : null;

      // Prompts. At the shopping cap, a market crate shows no grab prompt (the chef explains).
      if (state.heldItem) {
        // A drink never goes on a plate, so no «put it on the plate» prompt (the dock shows Q/B instead).
        if (atPlate && resolvePlacement(plate, state.heldItem.id).reason !== 'junk') state.actionPrompt = L.placePrompt;
      } else if (atPlate && plateDone) {
        state.actionPrompt = state.activePlate < state.plates.length - 1 ? L.nextPrompt : L.cookPrompt;
      } else if (facingFridge || (facingMarket && marketOpen)) {
        const food = facingFridge || facingMarket;
        state.actionPrompt = L.grabPrompt(getMealPlannerFoodCue(food, L));
      }

      // Q — put the carried food back / undo the last placement (never a dead-end).
      const qDown = isDropKeyPressed(keys);
      const qJust = qDown && !state.qWasDown;
      state.qWasDown = qDown;
      if (qJust) {
        dropOrUndo(state);
        syncMealPlannerLiveScore(state, helpers, setLiveStars);
        return;
      }

      if (!isEnterJustPressed(keys, state)) return;

      // ── Carrying → place on the active plate ──
      if (state.heldItem) {
        if (atPlate && placeHeld(state, plate, liveFridge, L)) {
          syncMealPlannerLiveScore(state, helpers, setLiveStars);
          if (state.activePlate === state.plates.length - 1
            && state.plates.every(p => p.slots.every(slot => slot.item))) {
            state.actionPrompt = null;
            finish(state, helpers, setLiveStars);
          }
        }
        return;
      }
      // ── Not carrying, at the plate → cook gate (advance only when complete) ──
      if (atPlate) {
        if (plateDone) advance(state, helpers, L, setLiveStars);
        else showChef(state, missingHint(state, L), 'missing');
        return;
      }
      // ── Not carrying, at a source → grab into hands ──
      if (facingFridge) {
        grab(state, facingFridge, 'home');
        syncMealPlannerLiveScore(state, helpers, setLiveStars);
        return;
      }
      if (facingMarket) {
        if (!marketOpen) { showChef(state, L.marketCapFull, 'capfull'); return; } // market cap
        grab(state, facingMarket, 'market');
        // Only «Use first!» foods that still fit an empty spot on THIS plate.
        const atRiskRemaining = atRiskStillInFridge(state.scenario, liveFridge)
          .filter((id) => resolvePlacement(plate, id).ok).length;
        // Never over advice about a choice that is still showing; then it is not marked as said.
        if (!isChoiceCoach(state.chef) && shouldShowAtRiskMarketCoach({
          source: 'market',
          atRiskRemaining,
          alreadyShown: state.atRiskCoachShown,
        })) {
          state.atRiskCoachShown = true;
          showChef(state, L.atRiskCoach, 'atrisk');
        }
        syncMealPlannerLiveScore(state, helpers, setLiveStars);
      }
    },

    render: (ctx, state) => {
      if (!atlasRef.current) return;
      ctx.fillStyle = '#EAD0A6';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      applyRoomCamera(ctx, ROOM);
      renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);
      renderGameRoomDecorations(ctx, ROOM);
      renderFridgeMarket(ctx, state);     // fridge (left) + five supermarket shelves (right)
      renderActivePlate(ctx, state);      // ONE central plate = the active meal
      renderProgress(ctx, state);         // physical menu board in kitchen world space
      renderGameRoomPlayer(ctx, state, atlasRef.current);
      renderMealPlannerHeldItem(ctx, state); // carried food, including the non-ice tofu glyph
      renderParticles(ctx, state);
      renderFloatingTexts(ctx, state);
      releaseRoomCamera(ctx);

      // HUD (screen space)
      renderChefCoach(ctx, state);        // fixed two-line coach; never behind the player
      renderMealPlannerControlDock(ctx, state);
      renderTeachToast(ctx, state);
      renderResultsCard(ctx, state);
      renderWasteFactCard(ctx, state, t);

      if (state.irisOpenness < 1) {
        const px = OX + state.player.pixelX + TS / 2;
        const py = OY + state.player.pixelY + TS / 2;
        const { x, y } = roomToCanvas(ROOM, px, py);
        drawIrisWipe(ctx, x, y, state.irisOpenness, CANVAS_W, CANVAS_H);
      }

      renderMissionIntroCard(ctx, state);
    },

    onComplete: () => {},
  });

  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const s = stateRef.current;
      const passed = s.results?.passed ?? false;
      // No `axes` — the per-axis numbers live only in «How was the score made?»; the shared
      // ResultScreen hides its axes line by itself when they are absent (no shared code changed).
      setTimeout(() => onComplete(score, passed, { tier: s.results?.tier }), 500);
    }
  }, [gameState]);

  // Click a gold source chip to open the source (mouse parity with «Press S»).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onPointerDown = (e) => {
      const st = stateRef.current;
      if (!st) return;
      const p = getCanvasPointer(canvas, e);
      // Intro card chip — the UNEP stat source.
      const introId = missionIntroSourceId(st);
      if (introId && hitTest(p, st.introSourceRect)) {
        window.open(`source.html?src=${introId}`, '_blank', 'noopener');
        return;
      }
      // RESULTS «Did you know?» card chip.
      // The «How was the score made?» button / its «Back» button, on the score page only.
      if (st.phase === 'results' && st.resultPage === 'score' && !st.showMissionIntro && !st.exitConfirmOpen) {
        if (!st.howOpen && hitTest(p, st.howButtonRect)) { st.howOpen = true; return; }
        if (st.howOpen && hitTest(p, st.howBackRect)) { st.howOpen = false; return; }
      }
      const rect = st.sourceBadgeRect;
      if (!rect || !st.wasteFact?.[0]?.sourceId) return;
      if (hitTest(p, rect)) {
        window.open(`source.html?src=${st.wasteFact[0].sourceId}`, '_blank', 'noopener');
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, [atlasReady, stateRef]);

  // «Press S» fallback to open the INTRO card's source — listens on WINDOW so it survives the
  // canvas losing focus. Guarded by missionIntroSourceId → null off-intro, so it never collides
  // with the RESULTS-card S handler (that one lives in update(); the loop is paused during intro).
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
    if (atlasReady && gameState === 'INIT') setGameState('PLAYING');
  }, [atlasReady, gameState]);

  useEffect(() => {
    if (atlasReady && canvasRef.current) canvasRef.current.focus();
  }, [atlasReady]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#EAD0A6', overflow: 'hidden' }}>
      <ScoreBar
        score={score}
        showScore
        stars={liveStars}
        timeLeft={null}
        onPause={() => setGameState('PAUSED')}
        onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroFor(t))}
        onExit={() => onNavigate('hub')}
        onFreeze={(f) => { const s = stateRef.current; if (s) { s.exitConfirmOpen = f; latchHowArrows(s); } }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          tabIndex={0}
          style={{
            width: '100%', height: 'auto', maxHeight: 'calc(100vh - 60px)',
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, objectFit: 'contain',
            imageRendering: 'pixelated', outline: 'none',
          }}
        />
      </div>
      {!atlasReady && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#BCAAA4', color: '#fff', fontSize: 24 }}>
          Loading...
        </div>
      )}
      {gameState === 'PAUSED' && (
        <PauseOverlay
          surfaceRef={canvasRef}
          onResume={() => { latchHowArrows(stateRef.current); setGameState('PLAYING'); }}
          onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroFor(t))}
          onQuit={() => onNavigate('hub')}
        />
      )}
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────
// Whenever the results page (re)gains the game loop — the 14th placement,
// Pause → Resume, the instructions card, a cancelled exit — an arrow that is already held counts as
// already pressed. The breakdown opens / closes only after the key is released and pressed again.
// Enter / Space / A keep their own edge detection (isEnterJustPressed), unchanged.
export function latchHowArrows(state) {
  if (!state) return;
  state.arrowDownWas = true;
  state.arrowUpWas = true;
}

function sparkleAt(state, tile, color) {
  spawnSparkles(state, OX + tile.col * TS, OY + tile.row * TS, color, 8);
}

function showChef(state, msg, key) {
  state.chef = createMealPlannerCoachMessage(msg, key);
}

// Pick a food into the player's hands. Home items leave the fridge (until placed / put back).
function grab(state, item, source) {
  state.heldItem = { id: item.id, emoji: item.emoji, source, fridgeRef: source === 'home' ? item : null };
  if (source === 'home') item.used = true;
  sparkleAt(state, item.tile, source === 'home' ? '#7CB342' : '#64B5F6');
}

// Place the carried food into the active plate's matching socket. Junk / wrong → chef nudge,
// nothing placed (teach-don't-punish). Uses the tested resolvePlacement decision.
export function placeHeld(state, plate, liveFridge, L) {
  const held = state.heldItem;
  const dec = resolvePlacement(plate, held.id);
  if (!dec.ok) {
    showChef(state, dec.reason === 'junk' ? L.junkNudge : L.wrongSocket, dec.reason);
    return false;
  }
  const slot = plate.slots[dec.slotIndex];
  slot.item = held.id; slot.source = held.source; slot.emoji = held.emoji;
  const ref = { plateIdx: state.activePlate, socketIdx: dec.slotIndex, foodId: held.id };
  state.history.push({ plateIdx: ref.plateIdx, socketIdx: ref.socketIdx, source: held.source, fridgeRef: held.fridgeRef });

  // The home copy of X is now on a plate → «already in the fridge» about X no longer holds.
  if (held.source === 'home') state.chef = coachAfterHomePlacement(state.chef, held.id);
  // At most one piece of advice about THIS choice, each said once per attempt.
  // `liveFridge` = home foods still unused, the same set the scorer's final-state rule reads.
  state.coachTold ||= createCoachTold();
  const key = choiceCoachFor({
    food: FOOD_BY_ID[held.id] || { id: held.id }, source: held.source, liveFridgeIds: liveFridge,
    season: state.scenario?.season, told: state.coachTold,
  });
  const msg = { already: key === 'already' && L.alreadyHave ? L.alreadyHave(held.id) : null, plant: L.plantNudge,
    season: key === 'season' && L.seasonCoach ? L.seasonCoach(state.scenario.season, held.id) : null }[key];
  if (key && msg) {
    markCoachTold(state.coachTold, key, held.id);
    showChef(state, msg, key);
    if (state.chef) state.chef.ref = ref;
  }
  state.heldItem = null;
  const c = state.plateCenter;
  sparkleAt(state, c, held.source === 'home' ? '#7CB342' : '#64B5F6');
  spawnFloatingText(state, OX + c.col * TS, OY + c.row * TS, getMealPlannerFoodCue(held, L), '#fff');
  return true;
}

// Q — put the carried food back (home → returns to the fridge), or undo the last placement.
// Q never opens a new message; it closes advice about the placement it undoes.
export function dropOrUndo(state) {
  if (state.heldItem) {
    if (state.heldItem.source === 'home' && state.heldItem.fridgeRef) state.heldItem.fridgeRef.used = false;
    state.heldItem = null;
    return;
  }
  const h = state.history.pop();
  if (!h) return;
  const slot = state.plates[h.plateIdx].slots[h.socketIdx];
  slot.item = null; slot.source = null; slot.emoji = null;
  if (h.source === 'home' && h.fridgeRef) h.fridgeRef.used = false;
  state.chef = coachAfterUndo(state.chef, h);
  state.activePlate = h.plateIdx;
}

// Cook gate — only reachable when the active plate is complete.
function advance(state, helpers, L, setLiveStars) {
  if (state.activePlate < state.plates.length - 1) {
    state.activePlate += 1;
    // the neutral «plate ready» line never replaces advice that is still showing
    if (shouldShowMealDone(state.chef)) showChef(state, L.mealDone, 'mealdone');
  } else {
    finish(state, helpers, setLiveStars);
  }
}

function missingHint(state, L) {
  const plate = state.plates[state.activePlate];
  // Every missing spot, the same list the label under the plate shows.
  const missing = [...new Set(plate.slots.filter((s) => !s.item).map((s) => L.slotLabel(s.type)))];
  if (missing.length) return L.cookMissing(missing.join(', '), L.mealName(plate.meal));
  return L.platesDone;
}

function finish(state, helpers, setLiveStars) {
  const res = scorePlan(state.plates, { season: state.scenario.season, scenario: state.scenario });
  const finalStars = mealPlannerStarsForPct(res.pct);
  state.results = res;
  state.liveStars = finalStars;
  state.spoiled = spoiledIds(state.plates, state.scenario);
  // The recap reads only the final plates, so advice the chef had no frame to show on the 14th
  // placement (season, a redundant buy, the plant alternative) still reaches the child here.
  state.recap = mealPlanRecap(state.plates, state.scenario);
  state.recapView = state.labels?.recapText ? state.labels.recapText(state.recap, state.scenario.season) : null;
  helpers.setScore(planPoints(res.pct));   // same floored number as the card, so the score bar never says 75 beside «74»
  setLiveStars(finalStars);
  // Each fact once — unep_meals was on the intro card, so the end card shows unep_trillion only.
  state.wasteFact = (state.labels?.wasteFacts || WASTE_FACTS).filter((f) => f.id === 'unep_trillion');
  state.howView = state.labels?.howText ? state.labels.howText(state.recap, state.scenario.season) : null;
  state.howOpen = false;
  latchHowArrows(state);   // ▼ still held from walking to the table must not open the breakdown
  state.sWasDown = false;
  state.resultPage = 'score';
  // The 14th placement ends the game on Enter/A, so the next habit press must not skip the score card.
  state.resultsLockT = 0.8;
  state.phase = 'results';
}
