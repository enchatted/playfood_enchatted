import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas } from '../../overworld/tileAtlas.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import {
  updatePlayerMovement, isEnterJustPressed,
  TILE_SIZE, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomTiles, renderGameRoomPlayer,
  renderGameRoomDecorations, renderKitchenWall,
  renderParticles, renderFloatingTexts,
  spawnSparkles, updateParticles, updateFloatingTexts, spawnFloatingText,
  renderShopperNPCs, updateShopperNPCs, NPC_PALETTES,
  initMissionIntro, renderMissionIntroCard,
  OX, OY,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
} from '../engine/gameRoomRenderer.js';
import { missionIntroSourceId } from '../engine/missionIntroLogic.js';
import {
  renderProductShelves, renderSeasonFoods, renderPlayerCart,
  renderInteractionHint,
  renderCashierStations, renderCashierProgressOverlay, renderFocusedFoodLabel,
} from '../engine/seasonMatcherRenderer.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import {
  drawIrisWipe, IRIS_DURATION, getCanvasPointer, hitTest,
} from '../../utils/canvas.js';
import {
  COUNTRIES,
  BASKET_SIZE,
  pickMonth, seasonOfMonth, buildShelf, getShelfLabel,
  ENERGY_COST_OOS, energyBand,
  gradeSeasonMatcher, starsForSeasonTier, liveStarsForSeasonMatcher, remainingInSeason,
  countryForLanguage,
} from '../../data/seasonMatcherData.js';
import PauseOverlay from '../../components/PauseOverlay.jsx';
import useGameStore from '../../store/gameStore.js';
import SeasonMatcherHud from './SeasonMatcherHud.jsx';
import SeasonMatcherSidePanels, {
  SeasonMatcherFeedbackMessage,
} from './SeasonMatcherSidePanels.jsx';
import { getSeasonMatcherGutterLayout } from './seasonMatcherLayout.js';
import {
  feedbackDurationForVerdict, buildInSeasonPickupText, buildBravoCheckoutText,
  buildSeasonWrongHint, buildTraveledSummary,
} from './seasonMatcherFeedback.js';
import './SeasonMatcher.css';

/**
 * SeasonMatcher — Local & Seasonal Island, Mission 1
 *
 * FridgeManager-style supermarket scene with cart-based shopping flow:
 * 1. Player picks foods from 2 product shelves at the top wall (12 foods total).
 *    Each pickup adds to a personal cart (max CART_MAX items per trip).
 * 2. Player walks to any of 3 checkout cashiers and presses ENTER.
 * 3. Cart is processed one item at a time with readable verdict feedback:
 *    in-season → ✅ +10; out-of-season → ❌ wrong + season hint.
 * 4. Game ends when basketCount >= BASKET_SIZE (win) OR all foods exhausted.
 *
 * Country auto-derived from i18n language.
 * NPC collision = soft "excuse me" bump (game-feel only, no score penalty).
 */

const ROOM = GAME_ROOMS.SeasonMatcher;
const SEASON_SOURCE = 'eufic-seasonal'; // the EUFIC dataset behind every in/out-of-season verdict
const POINTS_CORRECT = 10;
const BUMP_COOLDOWN = 1.5; // seconds between NPC "excuse me" bumps
const SCREEN_SHAKE_DECAY = 0.88;
const CART_MAX = 4;        // items per cart trip before mandatory checkout
const isWalkable = (col, row) => isGameRoomWalkable(ROOM, col, row);
const MISSION_INTRO = {
  titleKey: 'missionIntro.seasonmatcher.title',
  stepKeys: [
    'missionIntro.seasonmatcher.step1',
    'missionIntro.seasonmatcher.step2',
    'missionIntro.seasonmatcher.step3',
  ],
  goalKey: 'missionIntro.seasonmatcher.goal',
  ctaKey: 'hint.skip_ab', // names the on-screen A button (touch controls show on every landscape screen)
};

// Custom NPC init — avoids product shelf columns (4-5, 14-15).
// Customers walk DOWN through cols 8/10/12 (between shelves), exit at bottom.
function initSeasonShoppers(customerCols) {
  // Fractional columns center each cashier between the station's two blocked
  // tiles, producing equal three-tile wall margins and inter-station gaps.
  const cashiers = ROOM.cashierCenters.map((col, i) => ({
    col,
    row: 10,
    palette: NPC_PALETTES[i % NPC_PALETTES.length],
  }));

  const customers = customerCols.map((col, i) => ({
    lane: i,
    x: col * TILE_SIZE,
    y: (1 + i * 1.5) * TILE_SIZE,
    registerY: 9 * TILE_SIZE,
    speed: 20 + i * 4,
    phase: 'approaching',
    palette: NPC_PALETTES[(3 + i) % NPC_PALETTES.length],
    waitDuration: 2 + i * 0.5,
    waitTimer: 0,
  }));

  return { cashiers, customers };
}

// ─── Dev-only debug instrumentation ─────────────────────────
const DEBUG = typeof window !== 'undefined' && (
  (window.localStorage && window.localStorage.getItem('PLAYFOOD_DEBUG_SEASONMATCHER') === '1') ||
  new URLSearchParams(window.location.search).get('debugSeasonMatcher') === '1'
);
const dbg = (event, data) => {
  if (!DEBUG) return;
  if (data !== undefined) console.log('[SeasonMatcher]', event, data);
  else console.log('[SeasonMatcher]', event);
};
if (DEBUG) console.log('[SeasonMatcher] debug instrumentation ENABLED');

const STAGE = {
  PICK_COUNTRY: 'pick',
  INSTRUCTIONS: 'instructions', // Goal + how-to overlay before playing
  PLAYING: 'playing',
  PAUSED: 'paused',             // Same instructions overlay reopened mid-game
};

// Smart default — derive the child's country from chosen UI language
// (shared with Market Trip: seasonMatcherData.countryForLanguage).
const deriveCountryFromLang = countryForLanguage;

export default function SeasonMatcher({ island, mission, missionId, onComplete, onNavigate }) {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const atlasRef = useRef(null);
  const [gutterLayout, setGutterLayout] = useState({
    wideGutters: false,
    leftWidth: 0,
    rightWidth: 0,
  });

  const initialCountry = deriveCountryFromLang(i18n.language);
  const [country, setCountry] = useState(initialCountry);
  const [stage, setStage] = useState(
    initialCountry ? STAGE.INSTRUCTIONS : STAGE.PICK_COUNTRY,
  );
  // Stage we should return to after PAUSED (always PLAYING in practice).
  const [resumeStage, setResumeStage] = useState(STAGE.PLAYING);
  // Verdict condition: the scenario is a concrete MONTH (validation is
  // month-level); the season is derived for theming/banners only.
  const [month, setMonth] = useState(() =>
    (initialCountry ? pickMonth({ country: initialCountry }) : null));
  const season = month ? seasonOfMonth(month) : null;
  const [atlasReady, setAtlasReady] = useState(false);
  const [liveStars, setLiveStars] = useState(0);
  const missionIntroRef = useRef(MISSION_INTRO);
  missionIntroRef.current = {
    ...MISSION_INTRO,
    introFact: {
      quote: t('missionIntro.seasonmatcher.fact'),
      sourceId: SEASON_SOURCE,
      paraphrase: true,
    },
  };

  // Pre-translate i18n strings — read by render fns via ref to avoid stale closures
  const stringsRef = useRef({});
  stringsRef.current = {
    pickUp: t('season.cart_add'),
    cartFull: t('season.cart_full'),
    checkout: t('season.checkout_prompt'),
    accepted: t('season.accepted_now'),
    cashierChecking: t('season.cashier_checking'),
    pickupTransport: (item) => t('season.pickup_transport', {
      food: t(item.nameKey),
    }),
    bumpOops: t('season.bump_oops'),
    traveled: t('season.checkout_traveled'),
    pressS: t('season.press_s'),
  };

  // Load tile atlas (synchronous)
  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  useEffect(() => {
    const stageElement = stageRef.current;
    const canvasElement = canvasRef.current;
    if (!stageElement || !canvasElement) return undefined;

    const measureGutters = () => {
      const nextLayout = getSeasonMatcherGutterLayout(
        stageElement.getBoundingClientRect(),
        canvasElement.getBoundingClientRect(),
      );
      setGutterLayout((currentLayout) => (
        currentLayout.wideGutters === nextLayout.wideGutters
        && currentLayout.leftWidth === nextLayout.leftWidth
        && currentLayout.rightWidth === nextLayout.rightWidth
          ? currentLayout
          : nextLayout
      ));
    };

    const resizeObserver = new ResizeObserver(measureGutters);
    resizeObserver.observe(stageElement);
    resizeObserver.observe(canvasElement);
    const frameId = requestAnimationFrame(measureGutters);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, []);

  // ─── Country picker (DOM overlay, only for unsupported lang) ──
  const handleCountrySelect = (countryId) => {
    setCountry(countryId);
    setMonth(pickMonth({ country: countryId }));
    setStage(STAGE.INSTRUCTIONS);
  };

  const handleInstructionsDismiss = () => {
    const state = canvasRef.current?._stateRef?.current;
    if (state) state.showMissionIntro = false;
    // Dismiss either the initial how-to overlay or the in-game pause overlay.
    if (stage === STAGE.PAUSED) {
      setStage(resumeStage);
      const s = canvasRef.current?._stateRef?.current;
      if (s) s.timerPaused = false;
    } else {
      setStage(STAGE.PLAYING);
    }
  };

  const handleOpenInstructions = () => {
    // In-game "📖 Οδηγίες" button → pause the world and reopen the same overlay.
    if (stage !== STAGE.PLAYING) return;
    setResumeStage(STAGE.PLAYING);
    setStage(STAGE.PAUSED);
    const s = canvasRef.current?._stateRef?.current;
    if (s) {
      s.timerPaused = true;
      initMissionIntro(s, t, missionIntroRef.current);
    }
  };

  // ─── Checkout sequence processor ───────────────────────────
  // Called every frame while a checkout is in progress. Pops one cart
  // item after the previous verdict's reading window and applies validation
  // (in-season +10, out-of-season ❌ + season hint).
  const processCheckoutTick = (state, dt, helpers) => {
    state.checkoutTimer += dt;
    if (state.checkoutTimer < (state.checkoutWaitDuration || 0)) return;
    state.checkoutTimer = 0;

    if (state.checkoutQueue.length === 0) {
      // Done — resume gameplay
      state.checkoutQueue = null;
      state.checkoutCurrentItem = null;
      state.activeCheckoutCol = null;
      state.timerPaused = false;
      // Final win check
      if (state.basketCount >= BASKET_SIZE) {
        // Task 6B — trigger basket lift beat before results overlay.
        // Basket scales up + foods highlight in sequence over 1.2s, then
        // results slides in. Replaces the previous dead 1s delay.
        state.basketLiftStart = state.time;
        dbg('game_complete', {
          basket: state.basketCount, wrong: state.wrongCount,
          score: state.score,
        });
        setTimeout(() => helpers.complete(), 1500);
      }
      return;
    }

    const food = state.checkoutQueue.shift();
    state.checkoutCurrentItem = food;
    const feedbackDuration = feedbackDurationForVerdict(food.inSeason);
    state.checkoutWaitDuration = feedbackDuration;
    // Anchor feedback near nearest checkout (use player position as fallback)
    const fx = OX + state.player.pixelX + TILE_SIZE / 2;
    const fy = OY + state.player.pixelY - 8;

    if (food.inSeason) {
      state.basketCount++;
      state.score += POINTS_CORRECT;
      helpers.addScore(POINTS_CORRECT);
      // Task 6A — push to visible basket; addedAt drives the fill-in animation
      if (!state.basketItems) state.basketItems = [];
      state.basketItems.push({
        emoji: food.emoji,
        id: food.id,
        name: t(food.nameKey),
        addedAt: state.time,
      });
      state.feedbackText = buildBravoCheckoutText(food, t);
      state.feedbackColor = '#2E7D32';
      state.feedbackTimer = feedbackDuration;
      spawnSparkles(state, fx, fy, '#4CAF50', 6);
      spawnFloatingText(state, fx, fy, '+' + POINTS_CORRECT, '#2E7D32');
      dbg('checkout_item', { foodId: food.id, inSeason: true, scoreDelta: POINTS_CORRECT, feedbackText: state.feedbackText });
    } else {
      state.wrongCount++;
      // Task 7A — track wrong picks for the "Τι έχασες" reveal strip in results.
      // Carries the food metadata needed to surface the correct answer at debrief.
      if (!state.wrongPicks) state.wrongPicks = [];
      state.wrongPicks.push({
        id: food.id,
        emoji: food.emoji,
        nameKey: food.nameKey,
        correctSeasons: food.correctSeasons || [],
        originKey: food.originKey || null,
      });
      // The wrong hint: origin + the
      // EUFIC month window, instead of the bare "✈️ traveled".
      state.feedbackText = food.wrongHint || buildSeasonWrongHint(food, t);
      state.feedbackColor = '#e08a2e';
      state.feedbackTimer = feedbackDuration;
      spawnSparkles(state, fx, fy, '#E65100', 6);
      dbg('checkout_item', { foodId: food.id, inSeason: false, feedbackText: state.feedbackText });
    }
  };

  // ─── Game canvas ─────────────────────────────────────────────
  const { gameState, setGameState, stateRef } = useGameRoomCanvas(canvasRef, {
    timeLimit: null,

    setup: (state) => {
      // useGameRoomCanvas rebinds its loop when INIT becomes PLAYING. Keep the
      // initialized room intact so the shared intro cannot reopen on that bind.
      if (state.player) return;

      // Iris transition (opens to reveal scene)
      state.irisOpenness = 0;
      state.enterWasDown = false;
      state.time = 0;
      state.timerPaused = false;

      // Player
      state.player = {
        col: ROOM.playerStart.col,
        row: ROOM.playerStart.row,
        pixelX: ROOM.playerStart.col * TILE_SIZE,
        pixelY: ROOM.playerStart.row * TILE_SIZE,
        dir: ROOM.playerStart.dir,
        moving: false,
      };

      // Build foods inside the 2 product shelves at top wall (12 positions total).
      const shelf = country && month ? buildShelf(country, month).slice(0, ROOM.foodPositions.length) : [];
      state.foods = shelf.map((food, i) => {
        const pos = ROOM.foodPositions[i];
        const label = getShelfLabel(food, country);
        return {
          id: food.id,
          emoji: food.emoji,
          nameKey: food.nameKey,
          inSeason: label.inSeason,
          correctSeasons: food.correctSeasons || [],
          inSeasonMonths: food.inSeasonMonths || [],
          wrongHint: buildSeasonWrongHint(food, t), // precomputed (month-aware)
          name: t(food.nameKey),
          originKey: label.originKey,
          col: pos.col,
          row: pos.row,
          taken: false,
        };
      });

      // Game state — cart-based (player collects up to CART_MAX items,
      // checks out at any cashier; validation happens during checkout sequence)
      state.cart = [];
      state.cartMax = CART_MAX;
      state.checkoutQueue = null;    // when non-null, processing cart at checkout
      state.checkoutCurrentItem = null;
      state.activeCheckoutCol = null;
      state.checkoutTimer = 0;
      state.checkoutWaitDuration = 0;
      state.shoppingDone = false;    // true when all foods exhausted + cart empty
      state.basketCount = 0;
      state.wrongCount = 0;
      state.score = 0;
      state.basketSize = BASKET_SIZE;
      // Task 6 — visible basket
      state.basketItems = [];
      state.basketLiftStart = -1;
      // Task 7 — wrong picks for "Τι έχασες" reveal strip
      state.wrongPicks = [];

      // Task 4 — energy meter (out-of-season transport cost)
      state.energy = 0;
      state.boughtOutOfSeason = [];   // foods bought out-of-season, for results "what traveled" list

      // Live header stars (optimistic, degrades with food-miles).
      state.liveStars = 0;

      // Feedback
      state.particles = [];
      state.floatingTexts = [];
      state.actionPrompt = null;
      state.feedbackText = null;
      state.feedbackColor = null;
      state.feedbackTimer = 0;
      state.energyPulseUntil = 0;

      // FridgeManager-style: shopper NPCs (cashiers + customers walking)
      // + collision penalty system. Custom init places customers at cols
      // that don't overlap the product shelves.
      state.shopperNPCs = initSeasonShoppers(ROOM.npcCustomerCols);
      state.bumpCooldown = 0;
      state.screenShake = 0;
      state.screenShakeAmount = 0;

      initMissionIntro(state, t, missionIntroRef.current);

      // Expose stateRef on canvas so React-side code can read/mutate canvas state
      if (canvasRef.current) canvasRef.current._stateRef = stateRef;

      dbg('game_start', {
        country, season, month,
        shelfSize: state.foods.length,
        inSeasonCount: state.foods.filter(f => f.inSeason).length,
        layout: state.foods.map(f => ({
          id: f.id, col: f.col, row: f.row,
          inSeason: f.inSeason, correctSeasons: f.correctSeasons,
        })),
      });
    },

    update: (state, dt, keys, helpers) => {
      state.time += dt;
      if (dropSeasonCartItem(state, keys)) return;

      if (state.showMissionIntro) {
        if (state.irisOpenness < 1) {
          state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
        }
        state.timerPaused = true;
        return;
      }

      // Iris open animation (Pokemon-style)
      if (state.irisOpenness < 1) {
        state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
      }

      // Screen-shake decay (from NPC bumps)
      if (state.screenShakeAmount > 0.5) {
        state.screenShake = Math.sin(state.time * 50) * state.screenShakeAmount;
        state.screenShakeAmount *= SCREEN_SHAKE_DECAY;
      } else {
        state.screenShake = 0;
        state.screenShakeAmount = 0;
      }

      // Particle/text/NPC updates
      updateParticles(state, dt);
      updateFloatingTexts(state, dt);
      updateShopperNPCs(state, dt);

      // SeasonMatcher override — when an NPC enters the "leaving" phase
      // (post-checkout), respawn it at the top instantly instead of letting
      // it walk through the visible exit corridor. Keeps the bottom of the
      // room clean — customers don't drift past the cashiers visually.
      if (state.shopperNPCs) {
        for (const cust of state.shopperNPCs.customers) {
          if (cust.phase === 'leaving') {
            cust.y = (1 + Math.random() * 3) * TILE_SIZE;
            cust.phase = 'approaching';
            cust.waitTimer = 0;
            cust.waitDuration = 2 + Math.random() * 3;
          }
        }
      }
      if (state.feedbackTimer > 0) {
        state.feedbackTimer -= dt;
        if (state.feedbackTimer <= 0) {
          state.feedbackText = null;
          state.feedbackColor = null;
        }
      }

      // Live header stars — optimistic preview that degrades with food-miles.
      const ns = liveStarsForSeasonMatcher(state);
      if (ns !== state.liveStars) { state.liveStars = ns; setLiveStars(ns); }

      // Priority gate: checkout sequence in progress — process queue, no input
      if (state.checkoutQueue) {
        processCheckoutTick(state, dt, helpers);
        return;
      }

      // Player movement
      updatePlayerMovement(state.player, dt, keys, isWalkable);

      // ── NPC collision: soft "excuse me" (game-feel only). NO score penalty —
      // navigation is orthogonal to the seasonal lesson, so a bump never docks
      // points (teach-don't-punish). ──
      if (state.bumpCooldown > 0) {
        state.bumpCooldown -= dt;
      } else if (state.shopperNPCs) {
        const px = state.player.pixelX;
        const py = state.player.pixelY;
        for (const cust of state.shopperNPCs.customers) {
          const dx = px - cust.x;
          const dy = py - cust.y;
          if (Math.abs(dx) < TILE_SIZE * 0.8 && Math.abs(dy) < TILE_SIZE * 0.8) {
            state.bumpCooldown = BUMP_COOLDOWN;
            state.screenShakeAmount = 2.5;
            spawnFloatingText(state, OX + px + TILE_SIZE / 2, OY + py, stringsRef.current.bumpOops, '#8D6E63');
            dbg('npc_bump', { lane: cust.lane });
            break;
          }
        }
      }

      // Detect facing tile + interaction targets
      const facingCol = state.player.col + (state.player.dir === DIR.LEFT ? -1 : state.player.dir === DIR.RIGHT ? 1 : 0);
      const facingRow = state.player.row + (state.player.dir === DIR.UP ? -1 : state.player.dir === DIR.DOWN ? 1 : 0);

      const facingFood = state.foods.find(f => !f.taken && f.col === facingCol && f.row === facingRow);
      const facingCheckout = ROOM.checkoutTiles.some(c => c.col === facingCol && c.row === facingRow);

      // The faced food drives the focused-food label (name only — anti-spoiler).
      // The shelf itself draws the emoji only; the seasonal verdict appears at
      // checkout, never before the child commits.
      state.focusedFood = facingFood || null;

      // Action prompt
      const strings = stringsRef.current;
      const cartFull = state.cart.length >= state.cartMax;
      if (facingCheckout && state.cart.length > 0) {
        state.actionPrompt = strings.checkout.replace('{{n}}', state.cart.length);
      } else if (facingFood && cartFull) {
        state.actionPrompt = strings.cartFull;
      } else if (facingFood && !cartFull) {
        state.actionPrompt = strings.pickUp;
      } else {
        state.actionPrompt = null;
      }

      // Enter pressed → interact
      if (isEnterJustPressed(keys, state)) {
        // PICKUP: facing a food, cart has room
        if (facingFood && !cartFull) {
          state.cart.push({
            id: facingFood.id,
            emoji: facingFood.emoji,
            nameKey: facingFood.nameKey,
            inSeason: facingFood.inSeason,
            correctSeasons: facingFood.correctSeasons || [],
            originKey: facingFood.originKey || null,
            wrongHint: facingFood.wrongHint || null,
            energyCost: facingFood.inSeason ? 0 : ENERGY_COST_OOS,
          });
          facingFood.taken = true;
          const cx = OX + facingFood.col * TILE_SIZE + TILE_SIZE / 2;
          const cy = OY + facingFood.row * TILE_SIZE + TILE_SIZE / 2;
          spawnSparkles(state, cx, cy, '#1976D2', 4);
          if (!facingFood.inSeason) {
            state.energy = (state.energy || 0) + ENERGY_COST_OOS;
            state.energyPulseUntil = state.time + 1.4;
            state.feedbackText = strings.pickupTransport(facingFood);
            state.feedbackColor = '#E65100';
            state.feedbackTimer = feedbackDurationForVerdict(false);
            state.boughtOutOfSeason.push({
              id: facingFood.id,
              emoji: facingFood.emoji,
              nameKey: facingFood.nameKey,
              correctSeasons: facingFood.correctSeasons || [],
              // Months drive the debrief line (same rule as wrong hints)
              inSeasonMonths: facingFood.inSeasonMonths || [],
            });
            const fx = OX + facingFood.col * TILE_SIZE + TILE_SIZE / 2;
            const fy = OY + facingFood.row * TILE_SIZE + TILE_SIZE / 2;
            spawnFloatingText(state, fx, fy, '✈️ +' + ENERGY_COST_OOS, '#e08a2e');
          } else {
            // Symmetric with the out-of-season pickup toast above: an in-season
            // pickup now also gets an immediate, named reaction instead of only
            // silent sparkles. The only claim made is "in season here now".
            state.feedbackText = buildInSeasonPickupText(facingFood, t);
            state.feedbackColor = '#2E7D32';
            state.feedbackTimer = 2.5;
          }
          dbg('cart_add', {
            foodId: facingFood.id, inSeason: facingFood.inSeason,
            cartSize: state.cart.length,
          });
          return;
        }

        // CHECKOUT: facing a cashier with items in cart → start sequence
        if (facingCheckout && state.cart.length > 0 && !state.checkoutQueue) {
          state.checkoutQueue = [...state.cart];
          state.cart = [];
          state.activeCheckoutCol = ROOM.cashierCenters.find(
            (center) => Math.abs(center - facingCol) <= 0.5,
          ) ?? null;
          state.checkoutCurrentItem = null;
          state.checkoutTimer = 0;
          state.checkoutWaitDuration = 0;
          dbg('checkout_start', { items: state.checkoutQueue.length });
          return;
        }
      }

      // End-of-shop guard: end when the shelf is exhausted OR the win can no
      // longer be reached. (Defensive — with BASKET_SIZE in-season foods on the
      // shelf and no timer the basket normally always completes; the
      // reachability arm is a safety net so a future shelf/data change can't
      // soft-lock a child into an unwinnable run.)
      const remainingFoods = state.foods.filter(f => !f.taken).length;
      const reachable = state.basketCount + remainingInSeason(state.foods) >= BASKET_SIZE;
      if (
        !state.shoppingDone &&
        state.cart.length === 0 &&
        !state.checkoutQueue &&
        (remainingFoods === 0 || !reachable)
      ) {
        state.shoppingDone = true;
        dbg('shopping_done', { basket: state.basketCount, wrong: state.wrongCount, reachable });
        setTimeout(() => helpers.complete(), 1500);
      }
    },

    render: (ctx, state) => {
      if (!atlasRef.current) return;

      ctx.fillStyle = '#EAD0A6';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // ── Zoom into room (FridgeManager pattern) ──
      applyRoomCamera(ctx, ROOM);

      // Apply screen shake inside zoom
      const shake = state.screenShake || 0;
      if (shake) ctx.translate(shake, 0);

      renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);
      renderKitchenWall(ctx);
      renderGameRoomDecorations(ctx, ROOM);
      // Exit sign intentionally NOT rendered — removed per design feedback.
      renderShopperNPCs(ctx, state);
      // Cashier counter + register sprites — drawn AFTER NPCs so the counter
      // occludes the cashier's lower body (standing-behind-counter depth cue).
      renderCashierStations(ctx, ROOM.cashierCenters, state.time, {
        activeCheckoutCol: state.activeCheckoutCol,
        checkoutQueue: state.checkoutQueue,
        checkoutCurrentItem: state.checkoutCurrentItem,
        cashierCheckingText: stringsRef.current.cashierChecking,
      });
      renderProductShelves(ctx, ROOM.productShelves);
      renderSeasonFoods(ctx, state.foods, state.time);

      // Player + personal cart (replaces single-item carry)
      renderGameRoomPlayer(ctx, state, atlasRef.current);
      renderPlayerCart(ctx, state, BASKET_SIZE);

      // Particles + floating texts
      renderParticles(ctx, state);
      renderFloatingTexts(ctx, state);

      // Foreground UI: keep the cashier's progress message readable even when
      // the player is standing directly in front of the counter.
      renderCashierProgressOverlay(ctx, ROOM.cashierCenters, state.time, {
        activeCheckoutCol: state.activeCheckoutCol,
        checkoutQueue: state.checkoutQueue,
        cashierCheckingText: stringsRef.current.cashierChecking,
      });

      releaseRoomCamera(ctx);

      // Prompt at original canvas scale (banner + HUD now rendered as React strips above canvas)
      renderInteractionHint(ctx, state);

      // Name-only label for the food the player is facing (anti-spoiler: no
      // season/origin leak). The shelf draws emoji only; the seasonal verdict
      // appears at checkout. Energy meter lives in the responsive HUD, not the canvas.
      renderFocusedFoodLabel(ctx, state);

      // Iris wipe (convert player position to canvas coords for zoom)
      if (state.irisOpenness < 1) {
        const px = OX + state.player.pixelX + TILE_SIZE / 2;
        const py = OY + state.player.pixelY + TILE_SIZE / 2;
        const { x: canvasX, y: canvasY } = roomToCanvas(ROOM, px, py);
        drawIrisWipe(ctx, canvasX, canvasY, state.irisOpenness, CANVAS_W, CANVAS_H);
      }

      renderMissionIntroCard(ctx, state);
    },

  });

  // Start rendering as soon as the room data is ready. showMissionIntro keeps
  // movement and interactions paused while the supermarket opens behind it.
  useEffect(() => {
    if (atlasReady && country && stage !== STAGE.PICK_COUNTRY && gameState === 'INIT') {
      setGameState('PLAYING');
    }
  }, [stage, gameState, atlasReady, country, setGameState]);

  // Completion → hand off to the shared platform ResultScreen with stars + tier
  // + the "what travelled" debrief. helpers.complete() only flips gameState
  // (there is no in-game results card anymore), so we react to it here.
  const completedRef = useRef(false);
  useEffect(() => {
    if (gameState !== 'COMPLETED' || completedRef.current) return;
    completedRef.current = true;
    const st = stateRef.current;
    const correct = st?.basketCount || 0;
    const traveledCount = st?.boughtOutOfSeason?.length || 0;
    const passed = correct >= BASKET_SIZE;
    const tier = gradeSeasonMatcher({
      correct,
      traveledCount,
    });
    const stars = passed ? starsForSeasonTier(tier) : 0;
    useGameStore.getState().recordStars('local:SeasonMatcher', stars);
    const traveled = buildTraveledSummary(st?.boughtOutOfSeason || [], t);
    // Brief settle beat after the basket-lift flourish before the shared result
    // screen takes over (shorter than MarketTrip's 1000ms — no win banner here).
    const id = setTimeout(() => {
      if (onComplete) {
        onComplete(st?.score || 0, passed, {
          stars,
          tier,
          correct,
          traveledCount,
          traveled,
        });
      }
    }, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Force periodic re-renders during gameplay so the React HUD (basket/wrong)
  // stays in sync with the canvas state ref. Cheap: 5Hz.
  const [, setHudTick] = useState(0);
  useEffect(() => {
    if (stage !== STAGE.PLAYING) return;
    const id = setInterval(() => setHudTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [stage]);

  // Enter dismisses the instructions overlay (start) or pause overlay (resume).
  useEffect(() => {
    if (stage !== STAGE.INSTRUCTIONS && stage !== STAGE.PAUSED) return;
    const handler = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleInstructionsDismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // «Press S» opens the source on the shared intro, or EUFIC during play.
  // backs every in/out-of-season verdict, so the citation is reachable DURING
  // play, not just credited off-screen.
  const openSeasonSource = () => {
    if (typeof window !== 'undefined') {
      window.open(`source.html?src=${SEASON_SOURCE}`, '_blank', 'noopener');
    }
  };
  useEffect(() => {
    const handler = (e) => {
      if (e.repeat || (e.key !== 's' && e.key !== 'S' && e.code !== 'KeyS')) return; // e.code: Greek layout sends 'σ'
      const introId = missionIntroSourceId(stateRef.current);
      if (introId) {
        window.open(`source.html?src=${introId}`, '_blank', 'noopener');
      } else if (stage === STAGE.PLAYING) {
        openSeasonSource();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Touch/mouse parity for the source chip inside the shared canvas intro.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onPointerDown = (event) => {
      const state = stateRef.current;
      const introId = missionIntroSourceId(state);
      if (!introId || !state?.introSourceRect) return;
      if (hitTest(getCanvasPointer(canvas, event), state.introSourceRect)) {
        window.open(`source.html?src=${introId}`, '_blank', 'noopener');
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, [atlasReady, stateRef]);

  // CRITICAL fix #2 — if setup ran with country=null (unsupported lang fallback),
  // re-initialize foods once country becomes set. Otherwise state.foods stays empty
  // and the game is unplayable.
  useEffect(() => {
    const s = stateRef.current;
    if (country && month && s && (!s.foods || s.foods.length === 0)) {
      const shelf = buildShelf(country, month).slice(0, ROOM.foodPositions.length);
      s.foods = shelf.map((food, i) => {
        const pos = ROOM.foodPositions[i];
        const label = getShelfLabel(food, country);
        return {
          id: food.id, emoji: food.emoji, nameKey: food.nameKey,
          inSeason: label.inSeason, correctSeasons: food.correctSeasons || [],
          inSeasonMonths: food.inSeasonMonths || [],
          wrongHint: buildSeasonWrongHint(food, t), // precomputed (month-aware)
          name: t(food.nameKey),
          originKey: label.originKey,
          col: pos.col, row: pos.row, taken: false,
        };
      });
      dbg('foods_lazy_init', { country, season, month, count: s.foods.length });
    }
  }, [country, month, stateRef]);

  const seasonStyles = {
    winter: { color: '#42A5F5', emoji: '❄️' },
    spring: { color: '#7CB342', emoji: '🌸' },
    autumn: { color: '#FF7043', emoji: '🍂' },
    summer: { color: '#FFB300', emoji: '🌞' },
  };
  const seasonStyle = seasonStyles[season] || { color: '#533F8B', emoji: '' };

  // Live HUD numbers (read from canvas stateRef on each render — cheap)
  const liveState = stateRef?.current;
  const basketCount = liveState?.basketCount || 0;

  const energyNow = liveState?.energy || 0;
  const energyBandNow = energyBand(energyNow);
  const energyFillColor = { low: '#43A047', medium: '#F4A72C', high: '#E53935' }[energyBandNow];
  const energyPct = Math.min(100, (energyNow / 60) * 100);
  const energyPulsing = (liveState?.energyPulseUntil || 0) > (liveState?.time || 0);
  const cartCount = liveState?.cart?.length || 0;
  const countryMeta = COUNTRIES.find((item) => item.id === country);
  const showGameplayStatus = stage === STAGE.PLAYING && !liveState?.showMissionIntro;

  const styles = {
    overlay: {
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', zIndex: 10,
    },
    pickerCard: {
      background: '#fff', padding: '32px 40px', borderRadius: 18,
      boxShadow: '0 16px 48px rgba(0,0,0,0.4)', textAlign: 'center', maxWidth: 540,
    },
    pickerTitle: { margin: '0 0 8px', fontSize: 24, color: '#33691E' },
    pickerHint: { margin: '0 0 24px', fontSize: 14, color: '#666' },
    flagRow: { display: 'flex', gap: 16, justifyContent: 'center' },
    flagBtn: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 20px',
      border: '3px solid #ddd', borderRadius: 14, background: '#fafafa', cursor: 'pointer',
      transition: 'transform 0.15s ease, border-color 0.15s ease', fontSize: 14, fontWeight: 700,
    },
    flagEmoji: { fontSize: 48, marginBottom: 8 },
  };

  return (
    <div className="season-matcher-root">
      <SeasonMatcherHud
        score={liveState?.score || 0}
        stars={liveStars}
        basketCurrent={basketCount}
        basketTotal={BASKET_SIZE}
        basketItems={liveState?.basketItems || []}
        cartCurrent={cartCount}
        cartTotal={liveState?.cartMax || CART_MAX}
        countryFlag={countryMeta?.flag || '🌍'}
        countryName={country ? t(`season.country.${country}`) : ''}
        seasonEmoji={seasonStyle.emoji}
        seasonName={season ? t(`season.${season}`) : ''}
        monthName={month ? t(`months_full.${month}`) : ''}
        seasonColor={seasonStyle.color}
        energyLabel={t(`season.energy_${energyBandNow}`)}
        energyPercent={energyPct}
        energyColor={energyFillColor}
        energyPulsing={energyPulsing}
        wideGutters={gutterLayout.wideGutters}
        showGameplayStatus={showGameplayStatus}
        showSource={stage === STAGE.PLAYING}
        onSource={openSeasonSource}
        onInstructions={handleOpenInstructions}
        onPause={() => setGameState('PAUSED')}
        onExit={() => onNavigate('hub')}
        onFreeze={(f) => { const st = stateRef.current; if (st) st.exitConfirmOpen = f; }}
      />

      <div className="season-matcher-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          tabIndex={0}
          className="season-matcher-canvas"
        />
        {showGameplayStatus && (
          <SeasonMatcherSidePanels
            layout={gutterLayout}
            countryFlag={countryMeta?.flag || '🌍'}
            countryName={country ? t(`season.country.${country}`) : ''}
            seasonEmoji={seasonStyle.emoji}
            seasonName={season ? t(`season.${season}`) : ''}
            monthName={month ? t(`months_full.${month}`) : ''}
            energyLabel={t(`season.energy_${energyBandNow}`)}
            energyPercent={energyPct}
            energyColor={energyFillColor}
            energyPulsing={energyPulsing}
            basketCurrent={basketCount}
            basketTotal={BASKET_SIZE}
            basketItems={liveState?.basketItems || []}
            cartCurrent={cartCount}
            cartTotal={liveState?.cartMax || CART_MAX}
            feedbackText={liveState?.feedbackText}
            feedbackColor={liveState?.feedbackColor}
          />
        )}
        {showGameplayStatus && !gutterLayout.wideGutters && (
          <SeasonMatcherFeedbackMessage
            text={liveState?.feedbackText}
            color={liveState?.feedbackColor}
          />
        )}
      </div>

      {/* Country picker — only when language doesn't map to a country */}
      {stage === STAGE.PICK_COUNTRY && (
        <div style={styles.overlay}>
          <div style={styles.pickerCard}>
            <h2 style={styles.pickerTitle}>🌍 {t('season.pick_country_title')}</h2>
            <p style={styles.pickerHint}>{t('season.pick_country_hint')}</p>
            <div style={styles.flagRow}>
              {COUNTRIES.map((c) => (
                <button
                  key={c.id}
                  style={styles.flagBtn}
                  onClick={() => handleCountrySelect(c.id)}
                >
                  <span style={styles.flagEmoji}>{c.flag}</span>
                  <span>{t(c.nameKey)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {gameState === 'PAUSED' && (
        <PauseOverlay
          surfaceRef={canvasRef}
          onResume={() => setGameState('PLAYING')}
          onInstructions={handleOpenInstructions}
          onQuit={() => onNavigate('hub')}
        />
      )}
    </div>
  );
}
import { dropSeasonCartItem } from './seasonCart.js';
