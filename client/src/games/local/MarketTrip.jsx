import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas } from '../../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import {
  updatePlayerMovement, isEnterJustPressed, isDropKeyPressed,
  checkInteraction, TILE_SIZE, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomPlayer,
  renderGameRoomDecorations,
  renderParticles, renderFloatingTexts,
  spawnSparkles, updateParticles, updateFloatingTexts, spawnFloatingText,
  initMissionIntro, renderMissionIntroCard,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
  OX, OY,
} from '../engine/gameRoomRenderer.js';
import { missionIntroSourceId } from '../engine/missionIntroLogic.js';
import { useBlockingCanvasOverlay } from '../../components/ActiveCanvasStage.jsx';
import {
  renderMarketFloor, renderStalls, renderChoiceOverlay,
} from '../engine/marketTripRenderer.js';
import { PRODUCTS, MARKET_FACTS, MARKET_INTRO_FACT } from '../../data/marketTripData.js';
import { countryForLanguage } from '../../data/seasonMatcherData.js';
import { EUFIC_MONTHS } from '../../data/euficSeasonal.js';
import {
  REQUIRED_STALLS, POINTS_PER_PRODUCT, BONUS_SEASONAL, BONUS_TRANSPORT,
  buildMarketScenario, pickMarketMonth, stallFromProduct,
  marketGoals, starsForMarketGoals, marketTierForStars, marketTripPassed,
  liveStarsForMarketTrip, canPayMarketBasket, marketChoiceProjection, applyMarketChoice,
  marketTripBudgetWarningKey, nextMarketFactId, roundCents,
} from './marketTripLogic.js';
import useGameStore from '../../store/gameStore.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import { drawIrisWipe, IRIS_DURATION, getCanvasPointer, hitTest } from '../../utils/canvas.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';
import {
  MarketTripFeedbackPopup,
  MarketTripGuidance,
  MarketTripReceipt,
} from './MarketTripPanels.jsx';
import MarketTripCheckout from './MarketTripCheckout.jsx';
import { formatMarketMoney } from './marketCurrency.js';
import './MarketTrip.css';

/**
 * MarketTrip — Local & Seasonal Island, Mission 2 («The Green Basket»)
 *
 * Seasonal market (redesigned after partner reviews): the market happens in the child's
 * country and a real month. Each stall offers a local and an imported option;
 * the local card says whether it is in season (EUFIC data). Money is the only
 * hard limit, checked at the checkout, and the child can change any stall
 * before paying. Three visible goals give the three stars — see
 * marketTripLogic.js for every rule.
 */

const ROOM = GAME_ROOMS.MarketTrip;
// Seconds Enter/Space/A are ignored after the checkout opens.
const CHECKOUT_LOCK_S = 0.6;
const FACT_FLAG_BY_ID = {
  localFirst: 'local',
  importedFirst: 'imported',
  carbonFootprint: 'carbon',
  airFreight: 'airfreight',
};

// Shared MissionIntroCard. The fact reuses the verified
// no-uniform-distance explanation; title, steps and goal are free UI.
const MISSION_INTRO = {
  titleKey: 'missionIntro.markettrip.title',
  stepKeys: [
    'missionIntro.markettrip.step1',
    'missionIntro.markettrip.step2',
    'market.transport_explanation',
    'missionIntro.markettrip.step3',
  ],
  introFact: MARKET_INTRO_FACT,
  goalKey: 'missionIntro.markettrip.goal',
  ctaKey: 'hint.skip_ab',
};

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Country from the UI language (same as Season Matcher); month from the real
// date. `?mtMonth=<month>` pins the month for tests and screenshots.
function chooseScenario(language) {
  const country = countryForLanguage(language) || 'portugal';
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const pinned = params ? params.get('mtMonth') : null;
  const month = EUFIC_MONTHS.includes(pinned) ? pinned : pickMarketMonth();
  return buildMarketScenario({ country, month });
}

// Hides the touch controls while the compact (phone) choice card is open.
function CompactChoiceBlocker() {
  useBlockingCanvasOverlay();
  return null;
}

export default function MarketTrip({ island, mission, missionId, onComplete, onNavigate }) {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef(null);

  const atlasRef = useRef(null);
  const [atlasReady, setAtlasReady] = useState(false);
  // No stars are pre-awarded: the header only shows goals reached with a full basket.
  const [liveStars, setLiveStars] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const scenarioRef = useRef(null);
  if (!scenarioRef.current) scenarioRef.current = chooseScenario(i18n.language);

  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  const numberLocale = i18n.language || 'en';
  // Touch screens: one tap on a card buys it, so the hints talk about tapping (same test as TouchDpad).
  const coarsePointer = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  const stringsRef = useRef({});
  stringsRef.current = {
    local: t('market.local_label'),
    imported: t('market.imported_label'),
    localChoice: t('market.local_choice'),
    importedChoice: t('market.imported_choice'),
    choiceQuestion: t('market.choice_question'),
    changeQuestion: t('market.change_question'),
    chooseHint: t(coarsePointer ? 'market.touch_choose' : 'market.choose_hint'),
    chooseRibbon: t(coarsePointer ? 'market.touch_choose' : 'market.choose_ribbon'),
    pickPrompt: t(coarsePointer ? 'market.touch_pick' : 'market.pick_prompt'),
    projectedTotals: t('market.projected_totals'),
    selectedChoice: t('market.selected_choice'),
    inBasket: t('market.in_basket'),
    transportShort: t('market.transport_short'),
    badgeInSeason: t('market.badge_in_season'),
    badgeOutOfSeason: t('market.badge_out_of_season'),
    badgeCraft: t('market.badge_craft'),
    badgeNoLocal: t('market.badge_no_local'),
    badgeImported: t('market.badge_imported'),
    whyLocalInSeason: t('market.why_local_in_season'),
    whyLocalOutOfSeason: t('market.why_local_out_of_season'),
    whyLocalCraft: t('market.why_local_craft'),
    whyImported: t('market.why_imported'),
    whyImportedFragile: t('market.why_imported_fragile'),
    whyNoLocal: t('market.why_no_local'),
    kmLabel: (km) => t('market.km_label', { km: Number(km).toLocaleString(numberLocale) }),
    formatMoney: (value) => formatMarketMoney(roundCents(value), numberLocale),
    budgetWarning: (key, amount) => t(`market.${key}`, { amount: formatMarketMoney(roundCents(amount), numberLocale) }),
    // In-room mentor «Η Μανάβισσα» — name + welcome + reactive coaching.
    mentorName: t('market.mentor_name'),
    mentorWelcome: t('market.mentor_welcome'),
    mentorInSeason: t('market.mentor_in_season'),
    mentorOutOfSeason: t('market.mentor_out_of_season'),
    mentorCraft: t('market.mentor_craft'),
    mentorImported: t('market.mentor_imported'),
    mentorOverBudget: t('market.mentor_over_budget'),
    mentorFull: t('market.mentor_full'),
    // Source-pill keyboard hint (canvas can't call t()).
    pressS: t('market.press_s'),
    // The card shows the child-facing plain sentence, translated;
    // EN falls back via i18next defaultValue to the canonical f.plain in marketTripData.js.
    // The Press-S source.html still opens the verbatim source.
    factQuotes: Object.fromEntries(
      Object.entries(MARKET_FACTS).map(([id, f]) => [id, t(`market.facts.${id}`, { defaultValue: f.plain })]),
    ),
  };

  // The mission-intro card's local-area explanation shows the translated plain
  // sentence; `paraphrase` sets it unquoted on the card (our words, not the source's).
  // Its sourceId still opens the original source.
  const missionIntroRef = useRef(MISSION_INTRO);
  missionIntroRef.current = {
    ...MISSION_INTRO,
    introFact: {
      ...MARKET_INTRO_FACT,
      quote: stringsRef.current.factQuotes.localDef,
      paraphrase: true,
    },
  };

  // Build a fact toast that shows the TRANSLATED quote but keeps the original
  // sourceKey (so Press-S opens the right source.html). EN falls back to the quote.
  const toastFor = (id) => ({
    quote: (stringsRef.current.factQuotes && stringsRef.current.factQuotes[id]) || MARKET_FACTS[id].quote,
    sourceKey: MARKET_FACTS[id].sourceKey,
    id,
  });

  // Which source should «S» open right now? Priority: a live fact toast, then the
  // choice overlay (the local-area explanation), then the mission-intro card.
  const activeMarketSourceId = (st) => {
    if (!st) return null;
    if (st.factToast && st.factTimer > 0) return st.factToast.sourceKey;
    if (st.showingChoice) return MARKET_FACTS.localDef.sourceKey;
    return missionIntroSourceId(st);
  };

  const closeChoice = (st) => {
    st.showingChoice = false;
    st.activeStall = null;
    st.warning = null;
    st.pointerChoicePending = false;
  };

  const { gameState, setGameState, score, stateRef } =
    useGameRoomCanvas(canvasRef, {
      timeLimit: null,

      setup: (state) => {
        if (state.player) return;

        initMissionIntro(state, t, missionIntroRef.current);

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
        state.dropWasDown = false;

        // Shuffled products on the stall positions, priced for this market.
        const scenario = scenarioRef.current;
        const shuffled = shuffleArray(PRODUCTS);
        state.stalls = ROOM.stallPositions.map((pos, i) => ({
          ...pos,
          ...stallFromProduct(shuffled[i], scenario, t),
        }));

        state.marketScenario = scenario;
        state.budget = scenario.budget;
        state.transportTarget = scenario.transportTarget;
        state.marketTripLimits = { maxMoney: scenario.budget, transportTarget: scenario.transportTarget };
        state.milesUsed = 0;
        state.moneySpent = 0;
        state.stallsDone = 0;
        state.checkoutOpen = false;
        state.payRequested = false;
        state.paid = false;
        state.justBoughtStall = null;

        // Choice overlay state (choiceIndex -1 = nothing selected yet)
        state.showingChoice = false;
        state.activeStall = null;
        state.choiceIndex = -1;
        state.pointerChoicePending = false;
        state.warning = null;
        state.strings = stringsRef.current;

        // In-room mentor «Η Μανάβισσα» — greets at the entrance, then reacts to picks.
        state.mentorPos = ROOM.mentorPos;
        state.mentor = { msg: stringsRef.current.mentorWelcome, key: 'welcome' };
        state.mentorTimer = 6;
        state.mentorBubbleRect = null;

        state.liveStars = 0;

        // Effects
        state.particles = [];
        state.floatingTexts = [];
        state.actionPrompt = null;
        state.dropPrompt = null;
        state.feedbackTimer = 0;
        state.feedbackText = null;
        state.feedbackRect = null;
        state.feedbackPlayerPoint = null;
        state.factSourceRect = null;
        // Verbatim-sourced facts, fired once each (first local / first imported
        // purchase, then the transport nuance). Shown with a visible source.
        state.factFired = { local: false, imported: false, carbon: false, airfreight: false };
        state.factToast = null;
        state.factTimer = 0;

        // Expose stateRef for the headless playtest harness (same as SeasonMatcher)
        if (canvasRef.current) {
          canvasRef.current._stateRef = stateRef;
        }
      },

      update: (state, dt, keys, helpers) => {
        state.time += dt;
        state.strings = stringsRef.current;

        // Q / touch B: one press = one «back» (edge-triggered like Enter).
        const dropDown = isDropKeyPressed(keys);
        const dropJustPressed = dropDown && !state.dropWasDown;
        state.dropWasDown = dropDown;

        // MissionIntroCard blocks input until dismissed.
        // Iris opens behind the card so it sits over the live market.
        if (state.showMissionIntro) {
          if (state.irisOpenness < 1) {
            state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
          }
          // Clicks made while the card covers the game must not act later.
          state.payRequested = false;
          state.pointerChoicePending = false;
          if (isEnterJustPressed(keys, state)) state.showMissionIntro = false;
          return;
        }

        // Iris wipe
        if (state.irisOpenness < 1) {
          state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
          return;
        }

        // Header stars (goals reached with a full basket) + mentor bubble decay.
        const ns = liveStarsForMarketTrip(state);
        if (ns !== state.liveStars) { state.liveStars = ns; setLiveStars(ns); }
        if (state.mentorTimer > 0) {
          state.mentorTimer -= dt;
          if (state.mentorTimer <= 0 && state.mentor && state.mentor.msg) {
            state.mentor = { ...state.mentor, msg: null };
          }
        }

        // Guidance stays readable without freezing movement or purchase effects.
        if (state.factTimer > 0) {
          state.factTimer -= dt;
          if (state.factTimer <= 0) state.factToast = null;
        }

        updateParticles(state, dt);
        updateFloatingTexts(state, dt);

        if (state.feedbackTimer > 0) {
          state.feedbackTimer -= dt;
          if (state.feedbackTimer <= 0) state.feedbackText = null;
        }

        // ─── Checkout review (DOM panel) ─────────
        if (state.checkoutOpen) {
          // The Enter that bought the 8th product must not pay before the child sees the review.
          const enterPressed = isEnterJustPressed(keys, state);
          if (state.checkoutLockT > 0) state.checkoutLockT -= dt;
          else if (enterPressed) state.payRequested = true;
          if (dropJustPressed) {
            state.checkoutOpen = false;
            state.payRequested = false;
            // «Change something»: the stall in front of the child opens at once.
            state.justBoughtStall = null;
            return;
          }
          if (state.payRequested) {
            state.payRequested = false;
            if (canPayMarketBasket(state)) {
              const goals = marketGoals(state);
              if (goals.seasonal) helpers.addScore(BONUS_SEASONAL);
              if (goals.transport) helpers.addScore(BONUS_TRANSPORT);
              state.paid = true;
              state.checkoutOpen = false;
              helpers.complete();
            }
          }
          return;
        }
        state.payRequested = false;

        // ─── Choice overlay mode ─────────────────
        if (state.showingChoice) {
          const stall = state.activeStall;
          const localAvailable = stall.local.available !== false;

          if (dropJustPressed) {
            closeChoice(state);
            return;
          }
          if ((keys.has('arrowleft') || keys.has('a')) && localAvailable) state.choiceIndex = 0;
          if (keys.has('arrowright') || keys.has('d')) state.choiceIndex = 1;

          const hasPick = state.choiceIndex === 0 || state.choiceIndex === 1;
          const isLocal = state.choiceIndex === 0;
          const projection = marketChoiceProjection(state, stall);
          const projected = hasPick ? (isLocal ? projection.local : projection.imported) : null;
          const warningKey = projected
            ? marketTripBudgetWarningKey({ money: projected.money, budget: state.budget })
            : null;
          state.warning = warningKey
            ? stringsRef.current.budgetWarning(warningKey, Math.max(0, projected.money - state.budget))
            : null;
          state.warningIsOver = warningKey === 'warning_money';

          // Keyboard and direct card taps share this single confirmation path.
          const enterPressed = isEnterJustPressed(keys, state);
          const confirmsChoice = hasPick && (enterPressed || state.pointerChoicePending);
          state.pointerChoicePending = false;
          if (!confirmsChoice) return;

          state.factToast = null;
          state.factTimer = 0;
          const couldPayBefore = canPayMarketBasket(state);
          const { option, wasChosen, changed } = applyMarketChoice(state, stall, isLocal);
          closeChoice(state);
          state.justBoughtStall = stall;
          state.actionPrompt = null;

          const S = stringsRef.current;
          const overBudget = state.moneySpent > state.budget + 1e-9;
          let mentorMsg = S.mentorImported;
          if (isLocal && stall.local.craft) mentorMsg = S.mentorCraft;
          else if (isLocal && stall.local.inSeason) mentorMsg = S.mentorInSeason;
          else if (isLocal) mentorMsg = S.mentorOutOfSeason;
          if (overBudget) mentorMsg = S.mentorOverBudget;
          else if (state.stallsDone >= REQUIRED_STALLS) mentorMsg = S.mentorFull;
          state.mentor = { msg: mentorMsg, key: overBudget ? 'over' : (isLocal ? 'local' : 'imported') };
          state.mentorTimer = 6;

          const sx = OX + stall.col * TILE_SIZE + TILE_SIZE / 2;
          const sy = OY + stall.row * TILE_SIZE;
          if (!wasChosen) {
            helpers.addScore(POINTS_PER_PRODUCT);
            spawnFloatingText(state, sx, sy, `+${POINTS_PER_PRODUCT}`, isLocal ? '#2E7D32' : '#E65100');
          }
          state.feedbackText = isLocal
            ? t('market.saved', { food: stall.name })
            : t('market.traveled', { food: stall.name, km: option.km.toLocaleString(numberLocale) });
          state.feedbackTimer = 1.8;
          spawnSparkles(state, sx, sy, isLocal ? '#4CAF50' : '#FF8F00', 7);

          if (!wasChosen || changed) {
            const factId = nextMarketFactId({ isLocal, fragile: !!stall.fragile, factFired: state.factFired });
            if (factId) {
              state.factFired[FACT_FLAG_BY_ID[factId]] = true;
              state.factToast = toastFor(factId);
              state.factTimer = 6.0;
            }
          }

          // The 8th product opens the checkout review. A later change reopens it
          // only when it makes an unpayable basket fit the money; other changes
          // leave the market open (Enter away from a stall or «Go to the checkout»).
          if (state.stallsDone >= REQUIRED_STALLS
            && (!wasChosen || (!couldPayBefore && canPayMarketBasket(state)))) {
            state.checkoutOpen = true;
            state.checkoutLockT = CHECKOUT_LOCK_S;
          }
          return;
        }

        // ─── Normal movement mode ────────────────
        updatePlayerMovement(
          state.player, dt, keys,
          (col, row) => isGameRoomWalkable(ROOM, col, row),
        );

        // Every stall stays open: a bought one can be re-opened to change your mind,
        // but only after the child has stepped away from it (no accidental reopen
        // with a second Enter, and no «change» prompt right after buying).
        state.actionPrompt = null;
        const interactionTargets = state.stalls.flatMap(stall => (
          stall.interactionTiles.map(tile => ({ ...tile, stall }))
        ));
        const facedStall = checkInteraction(state.player, interactionTargets, 1)?.stall || null;
        if (facedStall !== state.justBoughtStall) state.justBoughtStall = null;
        const nearStall = facedStall && facedStall !== state.justBoughtStall ? facedStall : null;
        const basketFull = state.stallsDone >= REQUIRED_STALLS;
        if (nearStall) {
          state.actionPrompt = nearStall.chosen ? t('market.change_prompt') : t('market.shop_prompt');
        } else if (basketFull) {
          state.actionPrompt = t('market.checkout_prompt');
        }

        const enterPressed = isEnterJustPressed(keys, state);
        if (enterPressed && !nearStall && basketFull) {
          state.checkoutOpen = true;
          state.checkoutLockT = CHECKOUT_LOCK_S;
        }
        if (enterPressed && nearStall) {
          state.showingChoice = true;
          state.activeStall = nearStall;
          // No pre-selected card for a new stall: the child picks one on purpose.
          state.choiceIndex = nearStall.chosen ? (nearStall.chosenLocal ? 0 : 1) : -1;
          state.pointerChoicePending = false;
          state.warning = null;
        }
      },

      render: (ctx, state) => {
        if (!atlasRef.current) return;

        ctx.fillStyle = '#EAD0A6';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // ── Zoom into market area ──
        applyRoomCamera(ctx, ROOM);

        renderMarketFloor(ctx, ROOM);
        renderGameRoomDecorations(ctx, ROOM);
        renderStalls(ctx, state.stalls, state.time);
        renderGameRoomPlayer(ctx, state, atlasRef.current);
        renderParticles(ctx, state);
        renderFloatingTexts(ctx, state);

        releaseRoomCamera(ctx);

        // Iris wipe (convert player position to canvas coords for zoom)
        if (state.irisOpenness < 1) {
          const px = OX + state.player.pixelX + TILE_SIZE / 2;
          const py = OY + state.player.pixelY + TILE_SIZE / 2;
          const { x: canvasX, y: canvasY } = roomToCanvas(ROOM, px, py);
          drawIrisWipe(ctx, canvasX, canvasY, state.irisOpenness, CANVAS_W, CANVAS_H);
        }

        // Budgets, goals and the basket live in the DOM side panel; coaching in
        // the guidance ribbon. Keep stale canvas hit geometry impossible.
        state.feedbackRect = null;
        state.feedbackPlayerPoint = null;
        state.mentorBubbleRect = null;
        state.factSourceRect = null;
        renderChoiceOverlay(ctx, state);
        renderMissionIntroCard(ctx, state);
      },

      onComplete: () => {},
    });

  useEffect(() => {
    if (atlasReady && gameState === 'INIT') {
      setGameState('PLAYING');
    }
  }, [atlasReady, gameState]);

  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const state = stateRef.current;
      const goals = marketGoals(state);
      const passed = marketTripPassed(state);
      const stars = passed ? starsForMarketGoals(goals) : 0;
      const marketRecap = {
        country: state.marketScenario.country,
        month: state.marketScenario.month,
        money: roundCents(state.moneySpent || 0),
        budget: state.budget,
        transport: state.milesUsed || 0,
        transportTarget: state.transportTarget,
        goals: { money: goals.complete && goals.withinBudget, seasonal: goals.seasonal, transport: goals.transport },
        items: state.stalls.filter((stall) => stall.chosen).map((stall) => ({
          emoji: stall.emoji,
          name: stall.name,
          local: stall.chosenLocal,
          inSeason: stall.local.inSeason,
          craft: stall.local.craft,
        })),
      };
      useGameStore.getState().recordStars('local:MarketTrip', stars);
      setTimeout(() => onComplete(score, passed, { stars, tier: marketTierForStars(stars), marketRecap }), 700);
    }
  }, [gameState]);

  // Focus the canvas so keyboard movement works without a click (parity with other games).
  useEffect(() => {
    if (atlasReady && canvasRef.current) canvasRef.current.focus();
  }, [atlasReady]);

  // Click the intro source chip to open the source (mouse parity with «Press S»).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onPointerDown = (e) => {
      const st = stateRef.current;
      if (!st) return;
      // The instructions card or the exit question is on top: no stall taps.
      if (st.showMissionIntro || st.exitConfirmOpen) {
        const introId = missionIntroSourceId(st);
        if (introId && st.showMissionIntro && hitTest(getCanvasPointer(canvas, e), st.introSourceRect)) {
          window.open(`source.html?src=${introId}`, '_blank', 'noopener');
        }
        return;
      }
      const p = getCanvasPointer(canvas, e);
      // Only the compact (phone) card draws a ✕; elsewhere the rect is null.
      if (st.showingChoice && st.choiceCloseRect && hitTest(p, st.choiceCloseRect)) {
        closeChoice(st);
        return;
      }
      // Tap the visible source pill — fact toast, then choice overlay, then intro.
      if (st.showingChoice && hitTest(p, st.choiceSourceRect)) {
        window.open(`source.html?src=${MARKET_FACTS.localDef.sourceKey}`, '_blank', 'noopener');
        return;
      }
      if (st.showingChoice && hitTest(p, st.localChoiceRect)
        && st.activeStall?.local?.available !== false) {
        st.choiceIndex = 0;
        st.pointerChoicePending = true;
        return;
      }
      if (st.showingChoice && hitTest(p, st.importedChoiceRect)) {
        st.choiceIndex = 1;
        st.pointerChoicePending = true;
        return;
      }
      const introId = missionIntroSourceId(st);
      if (introId && hitTest(p, st.introSourceRect)) {
        window.open(`source.html?src=${introId}`, '_blank', 'noopener');
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, [atlasReady, stateRef]);

  // «Press S» opens the source for whatever fact is on screen — the live toast,
  // the choice-overlay definition, or the intro card. Listens on WINDOW (like the
  // main key handler) so it survives the canvas losing focus after a header click.
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || (e.key !== 's' && e.key !== 'S' && e.code !== 'KeyS')) return; // e.code: Greek layout sends 'σ'
      const id = activeMarketSourceId(stateRef.current);
      if (id) window.open(`source.html?src=${id}`, '_blank', 'noopener');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stateRef]);

  // Mirror the live shop state (money, goals, basket) into React state for the
  // «Το καλάθι μου» side panel and the checkout. Only setState when something
  // actually changed, so it never re-renders every frame.
  const [hud, setHud] = useState(() => ({
    money: 0,
    miles: 0,
    budget: scenarioRef.current.budget,
    transportTarget: scenarioRef.current.transportTarget,
    remaining: REQUIRED_STALLS,
    goals: null,
    canPay: false,
    items: [],
    introOpen: true,
    choiceOpen: false,
    choiceCompact: false,
    mentorText: '',
    guidanceKind: 'goal',
    guidanceText: '',
    guidanceSourceKey: null,
    feedbackText: '',
    feedbackWarning: false,
  }));
  useEffect(() => {
    let raf;
    let sig = '';
    let checkoutWasOpen = false;
    const tick = () => {
      const st = stateRef.current;
      if (st && st.stalls) {
        const chosen = st.stalls.filter((s) => s.chosen);
        const goals = marketGoals(st);
        const factActive = Boolean(st.factToast && st.factTimer > 0);
        const feedbackActive = Boolean(st.feedbackText && st.feedbackTimer > 0);
        const factId = factActive ? st.factToast.id : '';
        const mentorText = st.mentor?.msg || '';
        const actionPrompt = st.actionPrompt || '';
        const choiceOpen = Boolean(st.showingChoice);
        const choiceCompact = choiceOpen && Boolean(st.choiceCompact);
        const checkout = Boolean(st.checkoutOpen);
        const newSig = [
          st.moneySpent,
          st.milesUsed,
          st.stallsDone,
          chosen.map((s) => `${s.nameKey}:${s.chosenLocal ? 'L' : 'I'}`).join(','),
          Boolean(st.showMissionIntro),
          factId,
          feedbackActive ? st.feedbackText : '',
          mentorText,
          actionPrompt,
          choiceOpen,
          choiceCompact,
          checkout,
        ].join('|');
        if (checkout !== checkoutWasOpen) {
          checkoutWasOpen = checkout;
          setCheckoutOpen(checkout);
        }
        if (newSig !== sig) {
          sig = newSig;
          const items = chosen.map((s) => {
            const o = s.chosenLocal ? s.local : s.imported;
            return {
              key: s.nameKey,
              name: s.name,
              emoji: s.emoji,
              local: s.chosenLocal,
              inSeason: s.local.inSeason,
              craft: s.local.craft,
              price: o.price,
            };
          });
          setHud({
            money: roundCents(st.moneySpent || 0),
            miles: st.milesUsed || 0,
            budget: st.budget,
            transportTarget: st.transportTarget,
            remaining: REQUIRED_STALLS - (st.stallsDone || 0),
            goals,
            canPay: canPayMarketBasket(st),
            items,
            introOpen: Boolean(st.showMissionIntro),
            choiceOpen,
            choiceCompact,
            mentorText,
            guidanceKind: factActive
              ? 'fact'
              : choiceOpen
                ? 'choice'
                : actionPrompt
                  ? 'action'
                  : 'goal',
            guidanceText: factActive
              ? st.factToast.quote
              : choiceOpen
                ? stringsRef.current.chooseRibbon
                : actionPrompt,
            guidanceSourceKey: factActive ? st.factToast.sourceKey : null,
            feedbackText: feedbackActive ? st.feedbackText : '',
            feedbackWarning: false,
          });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stateRef]);

  const paused = gameState === 'PAUSED';
  const guidance = {
    kind: hud.guidanceKind,
    text: hud.guidanceText || t('market.goal_ribbon'),
    sourceKey: hud.guidanceSourceKey,
    sourceLabel: hud.guidanceSourceKey ? t('market.source_link') : null,
  };
  const openSource = (sourceKey) => {
    if (sourceKey) window.open(`source.html?src=${sourceKey}`, '_blank', 'noopener');
  };
  const requestPay = () => { const st = stateRef.current; if (st) st.payRequested = true; };
  const closeCheckout = () => {
    const st = stateRef.current;
    if (!st) return;
    st.checkoutOpen = false;
    st.payRequested = false;
    st.justBoughtStall = null; // the stall in front of the child opens at once
  };
  const openCheckout = () => {
    const st = stateRef.current;
    if (st && !st.showingChoice && !st.showMissionIntro && marketGoals(st).complete) {
      st.checkoutOpen = true;
      st.checkoutLockT = CHECKOUT_LOCK_S;
    }
  };

  return (
    <div className={`market-trip${hud.introOpen ? " intro-open" : ""}${hud.choiceOpen ? " choice-open" : ""}${hud.choiceCompact ? " choice-compact" : ""}`} style={S.root}>
      {hud.choiceCompact && <CompactChoiceBlocker />}
      <div className="market-trip-scorebar">
        <ScoreBar
          score={score}
          stars={liveStars}
          timeLeft={null}
          onPause={() => setGameState('PAUSED')}
          onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroRef.current)}
          onExit={() => onNavigate('hub')}
          onFreeze={(f) => { const s = stateRef.current; if (s) s.exitConfirmOpen = f; }}
        />
      </div>

      <MarketTripGuidance guidance={guidance} onOpenSource={openSource} />

      {/* Canvas + receipt grouped on ONE warm board, centred with breathing room
          so the play area never touches the top/bottom of the viewport. */}
      <div className="market-trip-stage-wrap" style={S.stageWrap}>
        <div className="market-trip-board" data-testid="market-trip-board" style={S.board}>
          <div className="market-trip-canvas-stage" data-testid="market-trip-canvas-stage" style={S.canvasStage}>
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              tabIndex={0}
              className="market-trip-canvas"
              data-testid="market-trip-canvas"
              aria-label={t('missionIntro.markettrip.title')}
              style={S.canvas}
            />
            {/* The checkout review replaces the purchase toast (no half-hidden note behind it). */}
            <MarketTripFeedbackPopup
              text={checkoutOpen ? '' : hud.feedbackText}
              warning={hud.feedbackWarning}
            />
            {checkoutOpen && !paused && !hud.introOpen && (
              <MarketTripCheckout hud={hud} onPay={requestPay} onChange={closeCheckout} />
            )}
          </div>

          <MarketTripReceipt
            hud={hud}
            scenario={scenarioRef.current}
            checkoutOpen={checkoutOpen}
            onOpenCheckout={openCheckout}
          />
        </div>
      </div>

      {paused && (
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

// ─── «Warm market ledger» styling — editorial-rustic: kraft paper, wood board,
// terracotta/honey/green accents, hairline rules, small-caps letterspaced header,
// tabular numerals. Inter kept for cohesion with the canvas world. ──────────────
const S = {
  root: {
    position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Inter', system-ui, sans-serif",
    background: '#EAD0A6',
  },
  stageWrap: {
    flex: '1 1 auto', minHeight: 0, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'clamp(10px, 2.4vh, 26px) clamp(12px, 2vw, 30px)',
  },
  board: {
    display: 'flex', alignItems: 'stretch', gap: 'clamp(8px, 1vw, 14px)',
    width: '100%', maxWidth: '100%', maxHeight: '100%', minHeight: 0, boxSizing: 'border-box',
    padding: 'clamp(8px, 1vw, 14px)', borderRadius: 20,
    background: 'linear-gradient(180deg, #8A5A37 0%, #6F4527 100%)',
    boxShadow: '0 20px 46px rgba(40,22,10,0.42), inset 0 1px 0 rgba(255,235,200,0.20), inset 0 0 0 2px rgba(54,30,15,0.55)',
  },
  canvasStage: {
    flex: '1 1 auto', minWidth: 0, minHeight: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 6, borderRadius: 14, background: '#EAD0A6',
    boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.55)',
  },
  canvas: {
    display: 'block', maxHeight: '100%', width: '100%', height: 'auto',
    aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, objectFit: 'contain', outline: 'none',
    imageRendering: 'pixelated', touchAction: 'none', borderRadius: 8,
  },

  receipt: {
    flex: '0 0 clamp(270px, 21vw, 360px)', alignSelf: 'stretch', minHeight: 0,
    flexDirection: 'column', overflow: 'hidden', borderRadius: 13, color: '#3E2A1E',
    background: 'linear-gradient(180deg, #FBF1DB 0%, #F5E6C8 100%)',
    boxShadow: '0 8px 22px rgba(40,22,10,0.32), inset 0 0 0 1px rgba(196,164,112,0.55)',
  },
  rHeader: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
    background: 'linear-gradient(180deg, #C8612E 0%, #B5511F 100%)',
    boxShadow: 'inset 0 -1px 0 rgba(80,30,10,0.35)',
  },
  rHeaderIcon: { fontSize: 16, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' },
  rHeaderTitle: {
    fontSize: 14, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase',
    color: '#FFF3E0', textShadow: '0 1px 1px rgba(80,30,10,0.4)',
  },
  rTimer: {
    marginLeft: 'auto', minWidth: 66, padding: '6px 9px', borderRadius: 10,
    background: '#FFF3E0', color: '#5D4037', fontSize: 15, fontWeight: 800,
    fontVariantNumeric: 'tabular-nums', textAlign: 'center',
  },
  rTimerUrgent: {
    background: '#C62828', color: '#FFFFFF',
  },
  rBody: { flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', padding: '14px 15px 8px' },

  meterBlock: { marginBottom: 11 },
  meterTop: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 },
  meterLabel: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 13, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: '#6E5235',
  },
  meterIcon: { fontSize: 13 },
  meterValue: { fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  track: {
    position: 'relative', height: 9, borderRadius: 5, overflow: 'visible',
    background: '#E7D6B4', boxShadow: 'inset 0 1px 2px rgba(120,90,50,0.30)',
  },
  fill: {
    position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 5,
    transition: 'width 0.25s ease, background 0.25s ease',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
  },
  tickLine: {
    position: 'absolute', top: -1, bottom: -1, width: 2, transform: 'translateX(-50%)',
    background: 'rgba(62,42,30,0.30)', borderRadius: 1,
  },
  tickDot: {
    position: 'absolute', top: -5, width: 7, height: 7, transform: 'translateX(-50%)',
    borderRadius: '50%', background: '#E2A33B', boxShadow: '0 0 0 1.5px #FBF1DB',
  },

  stallsRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '2px 0 4px' },
  stallsLabel: { fontSize: 13, fontWeight: 600, color: '#7A5C3C' },
  dotRow: { display: 'inline-flex', gap: 3 },
  dotOn: { width: 7, height: 7, borderRadius: '50%', background: '#5BA152', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' },
  dotOff: { width: 7, height: 7, borderRadius: '50%', background: '#DDCBA6', boxShadow: 'inset 0 1px 2px rgba(120,90,50,0.25)' },

  rRule: { height: 1, margin: '8px 0 9px', background: 'repeating-linear-gradient(90deg, #CDB488 0 5px, transparent 5px 10px)' },

  itemScroll: {
    flex: '1 1 auto', minHeight: 0, overflow: 'hidden', display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gridTemplateRows: 'repeat(4, minmax(0, 1fr))', gap: 5,
  },
  empty: { fontSize: 13, fontStyle: 'italic', color: '#A98C6B', textAlign: 'center', padding: '14px 0' },
  itemRow: {
    minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center',
    gap: 3, padding: '5px 6px', borderRadius: 9,
    background: 'rgba(255,255,255,0.55)', boxShadow: 'inset 0 0 0 1px rgba(196,164,112,0.35)',
  },
  itemHead: { minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 },
  itemAvatar: {
    flex: '0 0 23px', width: 23, height: 23, borderRadius: 6, fontSize: 14,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(180deg, #FFFCF3, #F0E2C4)', boxShadow: 'inset 0 0 0 1px rgba(196,164,112,0.4)',
  },
  itemName: { minWidth: 0, fontSize: 13, fontWeight: 700, color: '#3E2A1E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  itemFooter: { minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1 },
  tagLocal: { minWidth: 0, fontSize: 12.5, fontWeight: 700, color: '#2E7D32', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  tagImport: { minWidth: 0, fontSize: 12.5, fontWeight: 700, color: '#52666F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  itemPrice: { alignSelf: 'flex-end', flex: '0 0 auto', fontSize: 14, fontWeight: 800, color: '#B5511F', fontVariantNumeric: 'tabular-nums' },
};
