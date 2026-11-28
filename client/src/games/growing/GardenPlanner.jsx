import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas } from '../../overworld/tileAtlas.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import {
  updatePlayerMovement, isEnterJustPressed, isDropKeyPressed,
  TILE_SIZE, DIR,
} from '../engine/gameRoomLogic.js';
import { isGardenTileWalkable, resolveGardenTargets } from './gardenTargets.js';
import {
  renderGameRoomTiles, renderGameRoomPlayer,
  renderActionPrompt,
  renderParticles, renderFloatingTexts,
  spawnSparkles, updateParticles, updateFloatingTexts, spawnFloatingText,
  OX, OY,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
  initMissionIntro, renderMissionIntroCard,
} from '../engine/gameRoomRenderer.js';
import { missionIntroSourceId } from '../engine/missionIntroLogic.js';
import {
  renderSeasonCorners, renderSeasonBanners,
  renderPlots, renderSeedCrates, renderTools, renderCarryOverlay,
  renderFeedbackToast, renderGardenDecorations,
  renderWateringStream, renderProgressRing, renderPhaseObjective,
  renderDecisionEvent, renderTargetRing, renderGardenHint, renderRunLostCard,
  canvasCssGeometry, hudTopInsetFor,
} from '../engine/gardenPlannerRenderer.js';
import { isRunLost, waterPhaseNext, gardenBarProgress } from './gardenRun.js';
import { GAME_ROOMS } from '../engine/gameRoomData.js';

import { drawIrisWipe, IRIS_DURATION, getCanvasPointer } from '../../utils/canvas.js';
import {
  GARDEN_SEEDS, DECISION_EVENTS,
  GARDEN_FACT_TEXTS, FACT_SOURCE_BY_ID,
  selectGardenSeeds, isSeedUsedInSeason,
} from '../../data/gardenData.js';
import { WORLD_ART } from '../../styles/brandColors.js';
import PauseOverlay from '../../components/PauseOverlay.jsx';
import ExitConfirmButton from '../../components/ExitConfirmButton.jsx';
import { gradeGardenPlanner, liveStarsForHarvests } from '../../data/growing.js';
import LiveStars, { LIVE_STARS_KEYFRAMES } from '../../components/LiveStars.jsx';
import useGameStore from '../../store/gameStore.js';
import { classifyGameViewport } from '../../utils/touchControls.js';

/**
 * GardenPlanner — Island 1 "Growing Our Own Food", Mission 2 (PRACTICE).
 * (File still lives under games/local/ for legacy reasons; it is a growing-island game.)
 *
 * Avatar-based walking mechanic. Phases: PLANT → WATER → HARVEST (no DONE phase —
 * completion fires after the last harvest). 4 corner 3×3 plots (one per season)
 * + 12 center seed crates + 3 tool tiles (water can / harvest basket / compost bin).
 * Pass: ≥5 of 8 healthy harvests (PASS_HARVESTS).
 *
 * Source: MIRO FEEDBACK section of PLAYFOOD_Digital Platform_4 first games
 * analysis.docx (2026-05-07). Spec divergence (1 grid → 4 corner grids) is
 * documented as pedagogical upgrade — spatial memory ties corner ↔ season.
 */

const ROOM = GAME_ROOMS.GardenPlanner;
const POINTS_CORRECT_PLANT = 10;
const POINTS_HEALTHY_HARVEST = 20;
const POINTS_WILTED_HARVEST = 5;
const PASS_HARVESTS = 5;           // ≥5/8 healthy harvests to pass (~62%, gentle for 9-14)
const PLANTINGS_PER_SEASON = 2;    // C rotation: plant this many, then the season auto-rotates
const POINTS_DECISION = 10;        // Correct decision-event answer
const DECISION_DELAY_SEC = 1.2;    // let the planting toast land before the event card pops
const SEASON_ORDER = ['autumn', 'winter', 'spring', 'summer'];
const WATER_HOLD_SEC = 2.0;     // hold Enter/Space this long while facing plot to water
// Increased 2026-05-19 from 0.4s → 1.2s → 2.0s per user feedback: kids need to
// FEEL the deliberate care action, not just tap-and-done.
const MIN_TUTORIAL_SEC = 0.5;   // minimum visible time before the shared intro can be dismissed
const TOTAL_PLANTINGS = PLANTINGS_PER_SEASON * SEASON_ORDER.length; // 8
// The "you can't reach 5 any more" card. It waits for a NEW press
// (Enter / Space / touch A) — never a timer, never the press that planted. This
// is only a floor against an accidental double tap, not a countdown.
const RUN_LOST_MIN_SEC = 0.6;
const ROUND_END_DELAY_MS = 1500;   // existing beat so the last toast is seen

// End the round exactly once, whichever path gets here first
// (last harvest, nothing left after WATER, or the run-lost card).
function finishRoundOnce(state, helpers, delayMs = 0) {
  if (state.finishScheduled) return false;
  state.finishScheduled = true;
  // The timer id lives on the state so leaving the game (unmount) can cancel
  // it — a round the child walked away from must never end later (F5).
  if (delayMs > 0) state.finishTimer = setTimeout(() => { state.finishTimer = null; helpers.complete(); }, delayMs);
  else helpers.complete();
  return true;
}

// The run-lost card only takes input while it is the
// thing on top. Any other overlay (Οδηγίες, Παύση, «Σίγουρα έξοδος;») throws
// away a pending tap and asks again for a release and a NEW press afterwards.
function rearmRunLost(state) {
  const lost = state && state.runLost;
  if (!lost || lost.dismissed) return;
  lost.clicked = false;
  lost.released = false;
  lost.visibleTime = 0;
}

// Leave WATER as soon as nothing is left to water (point Γ). Called after
// every finished watering AND every frame of the WATER phase, so a garden with
// no live plant can no longer get stuck there.
function advanceFromWater(state, strings, helpers) {
  if (state.phase !== 'WATER') return null;
  const next = waterPhaseNext(state.plots);
  if (next === 'HARVEST') {
    state.phase = 'HARVEST';
    // Pickup-hose mechanic: do NOT auto-equip the harvest basket.
    // Player must walk to the 🌾 tile and press Enter.
    state.carrying = null;
    clearGardenInteractionState(state);
    // phase_harvest already starts with 🌾 in every locale.
    state.feedbackText = strings.phase_harvest;
    // Say that growing time has passed (the game
    // compresses it) before the child is asked to harvest.
    state.feedbackEduText = strings.msg_growth_time;
    state.feedbackFactId = null;  // our own wording, not a sourced fact
    state.feedbackColor = '#558B2F';
    state.feedbackTimer = 8.0; // two lines to read — major phase change
    dbg('phase_advance_to_harvest', {
      alive: state.plots.filter(p => p.seed && !p.wilted).length,
      wilted: state.plots.filter(p => p.seed && p.wilted).length,
    });
  } else if (next === 'DONE') {
    state.carrying = null;
    clearGardenInteractionState(state);
    dbg('water_nothing_left', {});
    finishRoundOnce(state, helpers, ROUND_END_DELAY_MS);
  }
  return next;
}

function readGardenViewport() {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 704, profile: 'standard' };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    profile: classifyGameViewport(window.innerWidth, window.innerHeight),
  };
}

function useGardenViewport() {
  const [viewport, setViewport] = useState(readGardenViewport);

  useEffect(() => {
    const updateViewport = () => setViewport(readGardenViewport());
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  return viewport;
}

// Shared MissionIntroCard content. titleKey/goalKey/ctaKey reuse existing garden
// strings so nothing has to move; stepKeys are the new per-locale intro steps.
// The introFact is injected at render time (missionIntroRef) with the localized
// heirloom quote so Press-S still opens the source in the original language.
const MISSION_INTRO = {
  titleKey: 'garden.tutorial_title',
  stepKeys: [
    'missionIntro.gardenplanner.step1',
    'missionIntro.gardenplanner.step2',
    'missionIntro.gardenplanner.step3',
    'missionIntro.gardenplanner.step4', // How the stars are earned
  ],
  introFact: { quote: '', sourceId: 'heirloom-seeds' }, // quote filled per-render via missionIntroRef
  goalKey: 'garden.tut_goal',
  ctaKey: 'hint.skip_ab',
};

// ─── Dev-only debug instrumentation ─────────────────────────
// Enable via:  localStorage.setItem('PLAYFOOD_DEBUG_GARDEN', '1')
//          OR  ?debugGarden=1 in URL
const DEBUG = typeof window !== 'undefined' && (
  (window.localStorage && window.localStorage.getItem('PLAYFOOD_DEBUG_GARDEN') === '1') ||
  new URLSearchParams(window.location.search).get('debugGarden') === '1'
);
const dbg = (event, data) => {
  if (!DEBUG) return;
  if (data !== undefined) console.log('[GardenPlanner]', event, JSON.stringify(data));
  else console.log('[GardenPlanner]', event);
};
if (DEBUG && typeof window !== 'undefined') {
  console.log('%c[GardenPlanner] avatar mode debug ENABLED', 'color:#33691E;font-weight:bold');
}

// ─── Helpers ─────────────────────────────────────────────────
function buildPlots(cornerAreas) {
  const plots = [];
  for (const area of cornerAreas) {
    for (let row = area.minRow; row <= area.maxRow; row++) {
      for (let col = area.minCol; col <= area.maxCol; col++) {
        plots.push({
          col, row,
          season: area.season,
          seed: null,
          health: 0,
          wilted: false,
          harvested: false,
          growthStage: 0,
        });
      }
    }
  }
  return plots;
}

function buildSeedCrates(cratePositions, t, roundSeed) {
  const roundSeeds = selectGardenSeeds(GARDEN_SEEDS, cratePositions.length, roundSeed);

  return cratePositions.map((pos, index) => {
    const seed = roundSeeds[index];
    return {
      col: pos.col, row: pos.row,
      seedId: seed.id,
      emoji: seed.emoji,
      marker: seed.marker,
      validSeasons: seed.validSeasons,
      nameKey: seed.nameKey,
      name: t(seed.nameKey),
    };
  });
}

// Attach a sourced fact to the toast, but only the first time it comes up in a
// round. Returns false when the fact has already been seen, so the
// caller can fall back to a plain action line instead of repeating itself.
function showFactOnce(state, strings, id) {
  if (state.shownFactIds?.has(id)) return false;
  state.shownFactIds?.add(id);
  state.feedbackFactId = id;
  state.feedbackEduText = strings.factQuotes[id];
  return true;
}

function clearGardenInteractionState(state) {
  if (!state) return;
  state.actionPrompt = null;
  state.targetTile = null;
  state.targetMode = null;
  state.wateringTarget = null;
  state.wateringTimer = 0;
  state.wateringNeedsRelease = true;
}

export default function GardenPlanner({
  island, mission, missionId, roundSeed, onComplete, onNavigate,
}) {
  const { t } = useTranslation();
  const viewport = useGardenViewport();
  const viewportProfile = viewport.profile;
  const tabletPortrait = viewportProfile === 'tablet-portrait';
  const canvasRef = useRef(null);

  const atlasRef = useRef(null);
  const [atlasReady, setAtlasReady] = useState(false);

  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  const stringsRef = useRef({});
  stringsRef.current = {
    correctPlant: t('garden.correct_plant'),
    wrongSeason: (s) => t('garden.wrong_season', { season: t(`season.${s}`) }),
    wrongSeasonClear: (validArr, current) => t('garden.wrong_season_clear', {
      valid: validArr.map((s) => t(`season.${s}`)).join(' / '), current: t(`season.${current}`),
    }),
    seasonChanged: (s) => t('garden.season_changed', { season: t(`season.${s}`) }),
    wrongCornerNow: (s) => t('garden.wrong_corner_now', { season: t(`season.${s}`) }),
    composted: t('garden.composted'),
    healthy: t('garden.healthy'),
    pressEnter: t('garden.press_to_interact'),
    pickSeedNamed: (plant) => t('garden.pick_seed_named', { plant }),
    alreadyPlantedThisSeason: t('garden.already_planted_this_season'),
    holdToWater: t('garden.hold_to_water', {
      key: typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
        ? 'A' : t('garden.water_key'),
    }),
    dropCarry: t('garden.drop_carry'),
    wrong_tool_healthy: t('garden.wrong_tool_healthy'),
    wrong_tool_wilted: t('garden.wrong_tool_wilted'),
    auto_drop_basket: t('garden.auto_drop_basket'),
    auto_drop_bin: t('garden.auto_drop_bin'),
    tool_swapped_basket: t('garden.tool_swapped_basket'),
    tool_swapped_bin: t('garden.tool_swapped_bin'),
    tool_tie: t('garden.tool_tie'),
    msg_unhealthy_soil: t('garden.msg.unhealthy_soil'),
    msg_seedling_care: t('garden.msg.seedling_care'),
    msg_growth_time: t('garden.msg.growth_time'),
    phase_water: t('garden.phase_water'),
    phase_harvest: t('garden.phase_harvest'),
    water_round2: t('garden.water_round2'),
    water_lockout: t('garden.water_lockout'),
    // Run-lost card
    lostTitle: t('garden.lost.title', { goal: PASS_HARVESTS }),
    lostBody: (n) => t('garden.lost.body', { n }),
    lostContinue: t('garden.lost.continue'),
    water_first_why: t('garden.water_first_why'),
    water_second_why: t('garden.water_second_why'),
    harvest_healthy_why: t('garden.harvest_healthy_why'),
    // Decision events — per-event question/options/feedback
    eventPickHint: t('garden.event.pick_hint'),
    eventContinue: t('garden.event.continue'),
    eventCorrect: t('garden.event.correct'),
    eventWrong: t('garden.event.wrong'),
    events: Object.fromEntries(DECISION_EVENTS.map((ev) => [ev.id, {
      q: t(`garden.event.${ev.id}_q`),
      msg: ev.factId ? null : t(`garden.event.${ev.id}_msg`),
      options: Object.fromEntries(
        ev.options.map((o) => [o.id, t(`garden.event.${ev.id}_opt_${o.id}`)])
      ),
    }])),
    // Pre-translated facts for mid-game toasts — mirrors WhereDoesItGrow pattern.
    // English falls back via i18next defaultValue to canonical text in GARDEN_FACT_TEXTS;
    // en.json has NO garden.facts block — single EN source of truth stays here.
    factQuotes: Object.fromEntries(
      Object.entries(GARDEN_FACT_TEXTS).map(([id, canonical]) => [
        id, t('garden.facts.' + id, { defaultValue: canonical }),
      ])
    ),
  };

  // Shared MissionIntroCard — inject the localized heirloom line each render so the
  // displayed fact is in the child's language while Press-S opens the source in its
  // original language (same pattern as WhereDoesItGrow). `paraphrase` marks it as our
  // plain sentence, so the card sets it unquoted rather than passing our wording off
  // as the source's.
  const missionIntroRef = useRef(MISSION_INTRO);
  missionIntroRef.current = {
    ...MISSION_INTRO,
    introFact: {
      ...MISSION_INTRO.introFact,
      quote: stringsRef.current.factQuotes.heirloom,
      paraphrase: true,
    },
  };

  const { gameState, setGameState, score, setScore, stateRef, keysRef } =
    useGameRoomCanvas(canvasRef, {
      timeLimit: null, // no timer — exploration paced

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

        state.phase = 'PLANT';
        state.activeSeason = SEASON_ORDER[0];   // C: which season is plantable now
        state.seasonPlantCount = 0;             // plantings done in the active season
        state.plots = buildPlots(ROOM.cornerAreas);
        state.seedCrates = buildSeedCrates(ROOM.seedCratePositions, t, roundSeed);
        state.toolTiles = ROOM.toolPositions.map(p => ({ ...p }));
        state.carrying = null; // { seed } or { tool: 'water'|'harvest' }
        state.plantedCount = 0;
        state.healthyHarvests = 0;
        state.wrongToolCount = 0;
        state.passThreshold = PASS_HARVESTS;
        // Watering hold state
        state.wateringTarget = null;  // plot being watered, or null
        state.wateringTimer = 0;       // seconds held so far
        state.wateringNeedsRelease = false; // one hold may water only one plot
        state.waterRound = 1;          // 1: every plot needs first water; 2: every plot needs second water
        state.waterLockoutTimer = 0;   // brief debounce for lock-out message
        // Set on the planting that makes 5 healthy harvests
        // unreachable; the world freezes until the child presses again.
        state.runLost = null;
        state.finishScheduled = false;  // the round ends exactly once

        // Feedback
        state.particles = [];
        state.floatingTexts = [];
        state.actionPrompt = null;
        state.targetTile = null;
        state.targetMode = null;
        state.feedbackTimer = 0;
        state.feedbackText = null;
        state.feedbackEduText = null;
        state.feedbackFactId = null;
        state.feedbackColor = null;
        state.timerPaused = false;

        // Decision events — one per season, queued after that season's
        // first planting (pendingEvent counts down so the planting toast lands
        // first), then modal until answered + dismissed.
        state.decisionEvent = null;   // { event, selected, answered, correct, resultTimer, prevKeys }
        state.pendingEvent = null;    // { event, delay }
        state.eventsFired = {};       // season → true

        // Each sourced fact appears at most once per round. The old
        // build re-served the same two sentences on every planting and every second
        // watering, which is this game's version of "just random facts": nineteen
        // interruptions built from four sentences. Later repeats now keep the bold
        // action line only, so the round keeps moving.
        state.shownFactIds = new Set();

        dbg('game_start', {
          roundSeed,
          startPhase: state.phase,
          corners: ROOM.cornerAreas.map(c => c.season),
          seedCrates: state.seedCrates.map(({ seedId, validSeasons }) => ({ seedId, validSeasons })),
          passHarvests: PASS_HARVESTS,
        });

        // Shared MissionIntroCard — shown at start, mirrors WhereDoesItGrow.
        // enterWasDown=true so a key held during the overworld→garden transition
        // cannot dismiss the card on frame 1 (same guard the old tutorial used).
        state.enterWasDown = true;
        initMissionIntro(state, t, missionIntroRef.current);
      },

      update: (state, dt, keys, helpers) => {
        state.time += dt;

        // Iris wipe in (advances even while the intro card is up, like WhereDoesItGrow)
        if (state.irisOpenness < 1) {
          state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
        }

        // Shared MissionIntroCard — pauses the game until dismissed.
        // MIN_TUTORIAL_SEC minimum + isEnterJustPressed (enterWasDown guard) ensures
        // a held key from the overworld transition cannot dismiss on frame 1.
        if (state.showMissionIntro) {
          state.timerPaused = true;
          clearGardenInteractionState(state);
          rearmRunLost(state);
          state.introVisibleTime = (state.introVisibleTime || 0) + dt;
          if (state.introVisibleTime >= MIN_TUTORIAL_SEC && isEnterJustPressed(keys, state)) {
            state.showMissionIntro = false;
            state.enterWasDown = true; // consume so it doesn't trigger pickup same frame
          }
          return;
        }

        if (state.irisOpenness < 1) {
          clearGardenInteractionState(state);
          return;
        }

        // ─── Run lost — world frozen until a NEW press ───
        // The card stays up as long as the child needs: no timer closes it, and
        // the Enter/Space/A that did the planting cannot close it either (the key
        // has to be seen released first). Then the existing result screen opens
        // with the existing "Try again".
        if (state.runLost) {
          clearGardenInteractionState(state);
          const lost = state.runLost;
          lost.visibleTime += dt;
          const confirmDown = keys.has('enter') || keys.has(' ');
          if (!confirmDown) lost.released = true;
          const freshPress = isEnterJustPressed(keys, state);
          if (!lost.dismissed && lost.visibleTime >= RUN_LOST_MIN_SEC
              && ((lost.released && freshPress) || (lost.released && lost.clicked))) {
            lost.dismissed = true;
            dbg('run_lost_dismissed', { score: helpers.getScore() });
            finishRoundOnce(state, helpers, 0);
          }
          lost.clicked = false;
          return;
        }

        // ─── Decision event — modal until answered + dismissed ───
        if (state.decisionEvent) {
          clearGardenInteractionState(state);
          const dev = state.decisionEvent;
          const evStrings = stringsRef.current;
          // Fresh-press detection (tutorial pattern: init true → frame 1 can't ghost)
          const down = {
            up: keys.has('arrowup') || keys.has('w'),
            down: keys.has('arrowdown') || keys.has('s'),
            enter: keys.has('enter') || keys.has(' '),
          };
          const prev = dev.prevKeys || { up: true, down: true, enter: true };
          dev.prevKeys = down;
          const fresh = (k) => down[k] && !prev[k];

          if (!dev.answered) {
            const n = dev.event.options.length;
            if (fresh('up')) dev.selected = (dev.selected - 1 + n) % n;
            if (fresh('down')) dev.selected = (dev.selected + 1) % n;
            // Click path (canvas handler) only records the tap — scoring stays
            // here so helpers.addScore is the single ledger.
            if (dev.clickedIdx != null) {
              dev.selected = dev.clickedIdx;
              dev.clickedIdx = null;
            }
            if (fresh('enter') || dev.confirmed) {
              dev.confirmed = false;
              const opt = dev.event.options[dev.selected];
              const factId = dev.event.factId || null;
              dev.answered = true;
              dev.correct = opt.correct;
              dev.consequenceText = factId
                ? evStrings.factQuotes[factId]
                : (evStrings.events[dev.event.id]?.msg || null);
              dev.resultTimer = 0;
              if (opt.correct) helpers.addScore(POINTS_DECISION);
              dbg('decision_event_answered', {
                id: dev.event.id, option: opt.id, correct: opt.correct,
              });
            }
          } else {
            dev.resultTimer += dt;
            // Small read-the-verdict beat before Enter/click can dismiss
            if (dev.resultTimer >= 0.4 && (fresh('enter') || dev.dismissClicked)) {
              const ev = dev.event;
              const msg = evStrings.events[ev.id]?.msg;
              const correctOpt = ev.options.find((o) => o.correct);
              state.feedbackText = dev.correct
                ? '✓ ' + evStrings.eventCorrect + ' +' + POINTS_DECISION
                : evStrings.eventWrong + ' ' + (evStrings.events[ev.id]?.options[correctOpt.id] || '');
              // Sourced events (factId) show the TRANSLATED fact (garden.facts.* via factQuotes)
              // so the displayed text matches the child's language AND the source pill (keyed by
              // factId). Non-fact events (seed_choice/pests) keep their translated event line.
              const factId = ev.factId || null;
              state.feedbackFactId = factId;
              // An event verdict always shows its fact (it is the answer to the quiz
              // the child just took); registering it keeps the once-per-round set honest.
              if (factId) state.shownFactIds?.add(factId);
              state.feedbackEduText = dev.consequenceText || (factId
                ? evStrings.factQuotes[factId]
                : (msg || null));
              state.feedbackColor = dev.correct ? '#2E7D32' : '#B26A00';
              state.feedbackTimer = 6.0; // partner message + (possible) source pill
              state.decisionEvent = null;
              state.enterWasDown = true; // consume — no pickup on the same press
            }
          }
          return; // world frozen while the card is up
        }

        // Queued event: let the planting toast land, then pop the card.
        // Hard-clear the stale planting toast the moment we promote so the old
        // "correct plant / wrong season" message cannot flash back after dismiss.
        if (state.pendingEvent) {
          state.pendingEvent.delay -= dt;
          if (state.pendingEvent.delay <= 0) {
            state.feedbackTimer = 0;
            state.feedbackText = null;
            state.feedbackEduText = null;
            state.feedbackFactId = null;
            state.decisionEvent = {
              event: state.pendingEvent.event,
              selected: 0,
              answered: false,
              correct: false,
              resultTimer: 0,
              prevKeys: null,
            };
            state.pendingEvent = null;
            dbg('decision_event_shown', { id: state.decisionEvent.event.id });
            clearGardenInteractionState(state);
            return;
          }
        }

        // Decay feedback
        if (state.feedbackTimer > 0) {
          state.feedbackTimer -= dt;
          if (state.feedbackTimer <= 0) {
            state.feedbackText = null;
            state.feedbackEduText = null;
            state.feedbackFactId = null;
          }
        }

        // (B simplification: crates are always full — no refill timer)

        updateParticles(state, dt);
        updateFloatingTexts(state, dt);

        // Movement
        updatePlayerMovement(
          state.player, dt, keys,
          (col, row) => isGardenTileWalkable(ROOM, col, row),
        );

        // ─── Nothing left to water → leave WATER ───
        // Checked every frame, not only after a finished watering, so a WATER
        // phase with no live plant moves on (or ends the round once).
        if (state.phase === 'WATER' && !state.finishScheduled) {
          const next = advanceFromWater(state, stringsRef.current, helpers);
          if (next === 'DONE') return;
        }

        // ─── Determine what the player is about to act on ─
        // One answer per frame, on the engine's reach ladder:
        // the prompt, the ring and Enter all read these same three, so a child
        // can only ever act on the thing the game is pointing at.
        state.actionPrompt = null;
        state.targetMode = null;
        const targets = resolveGardenTargets(state);
        const facingSeedCrate = targets.crate;
        const facingPlot = targets.plot;
        // Pickup-hose mechanic: the tool only answers when the phase asks for
        // it. HARVEST has TWO tools (basket for healthy, bin for wilted), so
        // standing between them is a tie and stays deliberately silent.
        const facingTool = targets.tool;

        const strings = stringsRef.current;
        if (facingSeedCrate && !state.carrying) {
          state.actionPrompt = isSeedUsedInSeason(
            state.plots,
            facingSeedCrate.seedId,
            state.activeSeason,
          )
            ? strings.alreadyPlantedThisSeason
            : strings.pickSeedNamed(facingSeedCrate.name);
        } else if (facingTool && (!state.carrying || targets.swap)) {
          state.actionPrompt = strings.pressEnter;
        } else if (facingPlot && targets.mode === 'teach') {
          // Blue dashed target: Enter gives an explanation, not a hidden action.
          state.actionPrompt = strings.pressEnter;
        } else if (facingPlot) {
          // Plot interaction depends on phase + carrying
          if (state.phase === 'PLANT' && state.carrying?.seed && !facingPlot.seed
              && facingPlot.season === state.activeSeason) {
            state.actionPrompt = strings.pressEnter;
          } else if (state.phase === 'WATER' && state.carrying?.tool === 'water'
                     && facingPlot.seed && !facingPlot.wilted && facingPlot.health < 2) {
            state.actionPrompt = strings.holdToWater;
          } else if (state.phase === 'HARVEST' && facingPlot.seed && !facingPlot.harvested) {
            // 2026-05-19: split — healthy plants need the harvest basket,
            // wilted plants need the compost bin. Only show the press-Enter
            // prompt when the player has the RIGHT tool for this plot.
            const plotHealthy = !facingPlot.wilted && facingPlot.health >= 2;
            if (plotHealthy && state.carrying?.tool === 'harvest') {
              state.actionPrompt = strings.pressEnter;
            } else if (!plotHealthy && state.carrying?.tool === 'compost') {
              state.actionPrompt = strings.pressEnter;
            }
          }
        }

        // The ring marks the one tile this frame's Enter will touch. Tied to the
        // prompt on purpose: no prompt means no ring and no action, so a child
        // standing between two identical things sees the game go quiet instead
        // of watching it grab the wrong one.
        state.targetTile = state.actionPrompt ? targets.target : null;
        state.targetMode = state.actionPrompt ? targets.mode : null;
        // Between two usable tools the game still never guesses, but
        // it says why nothing happens. A hint, not a prompt: no ring, no action.
        state.toolTieHint = !state.actionPrompt && targets.toolTie ? strings.tool_tie : null;

        // ─── Q-to-drop (2026-05-19) ──────────────────────
        // Player picked the wrong seed / wrong tool? Press Q to drop it. No
        // penalty. Carrying becomes null and they can pick up something else.
        // Uses a press-edge guard to avoid auto-repeat dropping.
        const qDown = isDropKeyPressed(keys);
        if (qDown && !state.qWasDown && state.carrying) {
          state.qWasDown = true;
          state.carrying = null;
          clearGardenInteractionState(state);
          state.feedbackText = '🤚 ' + strings.dropCarry;
          state.feedbackFactId = null;
          state.feedbackEduText = null;
          state.feedbackColor = '#795548';
          state.feedbackTimer = 1.5;
          dbg('carry_dropped', {});
          return;
        }
        if (!qDown) state.qWasDown = false;

        // ─── Handle Enter ─────────────────────────────────
        if (isEnterJustPressed(keys, state)) {
          // Side tolerance helps selection, but never changes walking direction
          // until the child confirms the highlighted target.
          if (state.actionPrompt && targets.snapDir !== null) {
            state.player.dir = targets.snapDir;
          }

          // Pick up seed from crate
          if (state.phase === 'PLANT' && facingSeedCrate && !state.carrying) {
            const crate = facingSeedCrate;
            if (isSeedUsedInSeason(state.plots, crate.seedId, state.activeSeason)) {
              state.feedbackText = '✓ ' + strings.alreadyPlantedThisSeason;
              state.feedbackFactId = null;
              state.feedbackEduText = null;
              state.feedbackColor = '#558B2F';
              state.feedbackTimer = 2.2;
              return;
            }
            state.carrying = {
              seed: {
                id: crate.seedId,
                emoji: crate.emoji,
                marker: crate.marker,
                name: crate.name,
                validSeasons: crate.validSeasons,
              },
            };
            // Sparkle at crate position for visual pop
            const cx = OX + crate.col * TILE_SIZE + TILE_SIZE / 2;
            const cy = OY + crate.row * TILE_SIZE + TILE_SIZE / 2;
            spawnSparkles(state, cx, cy, '#FFD54F', 6, 'pickup');
            dbg('seed_picked_up', { id: crate.seedId, validSeasons: crate.validSeasons });
            return;
          }

          // Pick up tool from tool tile (water can / harvest basket).
          // Replaces the old auto-equip on phase change — kids now explicitly
          // walk to the tool, like real gardening.
          // Holding the other harvest tool, one press
          // swaps — the old tool goes back to its tile, no Q / B needed first.
          // Score, harvest flags and counters are untouched.
          if (facingTool && state.carrying && targets.swap) {
            const to = facingTool.tool;
            state.carrying = { tool: to };
            clearGardenInteractionState(state);
            state.feedbackText = to === 'harvest' ? strings.tool_swapped_basket : strings.tool_swapped_bin;
            state.feedbackFactId = null;
            state.feedbackEduText = null;
            state.feedbackColor = '#2E7D32';
            state.feedbackTimer = 2.5;
            const cx = OX + facingTool.col * TILE_SIZE + TILE_SIZE / 2;
            const cy = OY + facingTool.row * TILE_SIZE + TILE_SIZE / 2;
            spawnSparkles(state, cx, cy, '#FFD54F', 6, 'pickup');
            dbg('tool_swapped', { to });
            return;
          }
          if (facingTool && !state.carrying) {
            state.carrying = { tool: facingTool.tool };
            const cx = OX + facingTool.col * TILE_SIZE + TILE_SIZE / 2;
            const cy = OY + facingTool.row * TILE_SIZE + TILE_SIZE / 2;
            const sparkleColor = facingTool.tool === 'water' ? '#1976D2' : '#FFD54F';
            spawnSparkles(state, cx, cy, sparkleColor, 6, 'pickup');
            dbg('tool_picked_up', { tool: facingTool.tool });
            return;
          }

          // Plant in plot — only in the active season's corner. A crop can be
          // reused in another valid season, never twice inside this one.
          if (state.phase === 'PLANT' && facingPlot && !facingPlot.seed && state.carrying?.seed
              && facingPlot.season === state.activeSeason
              && isSeedUsedInSeason(
                state.plots,
                state.carrying.seed.id,
                state.activeSeason,
              )) {
            state.feedbackText = '✓ ' + strings.alreadyPlantedThisSeason;
            state.feedbackFactId = null;
            state.feedbackEduText = null;
            state.feedbackColor = '#558B2F';
            state.feedbackTimer = 2.2;
            return;
          }

          if (state.phase === 'PLANT' && facingPlot && !facingPlot.seed && state.carrying?.seed
              && facingPlot.season === state.activeSeason) {
            const carrying = state.carrying.seed;
            const correctSeason = carrying.validSeasons.includes(facingPlot.season);
            facingPlot.seed = { id: carrying.id, emoji: carrying.emoji, marker: carrying.marker };
            state.plantedCount++;
            state.seasonPlantCount++;

            const cx = OX + facingPlot.col * TILE_SIZE + TILE_SIZE / 2;
            const cy = OY + facingPlot.row * TILE_SIZE + TILE_SIZE / 2;

            if (correctSeason) {
              facingPlot.health = 0;
              helpers.addScore(POINTS_CORRECT_PLANT);
              state.feedbackText = '✅ ' + strings.correctPlant;
              // No fact line here. Every planting slot is already taken: plantings
              // 1/3/5/7 queue that season's decision event, whose gate suppresses the
              // toast from the first frame, and 2/4/6/8 are overwritten in the same
              // frame by the season-rotation or phase-change toast. good_soil was
              // wired here and therefore never reached a single child; it now shows
              // on the first healthy harvest, where the toast survives.
              state.feedbackFactId = null;
              state.feedbackEduText = null;
              state.feedbackColor = '#2E7D32';
              spawnSparkles(state, cx, cy, '#4CAF50', 8);
              spawnFloatingText(state, cx, cy, '+' + POINTS_CORRECT_PLANT, '#2E7D32');
            } else {
              facingPlot.wilted = true;
              facingPlot.health = 0;
              // H4: name the plant + contrast its real season with the one the
              // child just planted it in, so the wilt teaches the rule instead
              // of feeling random ("🍓 grows in spring — not winter!").
              state.feedbackText = '🥀 ' + facingPlot.seed.emoji + ' '
                + strings.wrongSeasonClear(carrying.validSeasons, facingPlot.season);
              state.feedbackFactId = null; // gameplay feedback — no public source
              state.feedbackEduText = strings.msg_unhealthy_soil;
              state.feedbackColor = '#E65100';
              spawnSparkles(state, cx, cy, '#E65100', 6);
              dbg('educational_msg', { key: 'garden.msg.unhealthy_soil', trigger: 'wrong_season' });
            }
            state.feedbackTimer = 2.5;
            state.carrying = null;

            dbg('plot_planted', {
              col: facingPlot.col, row: facingPlot.row, season: facingPlot.season,
              seedId: carrying.id, correctSeason, plantedCount: state.plantedCount,
              scoreDelta: correctSeason ? POINTS_CORRECT_PLANT : 0,
            });

            // This planting made 5 healthy harvests unreachable.
            // Stop here — no event card, no season change, no WATER — and explain.
            // Points already earned stay; the result screen credits them once.
            if (!correctSeason && isRunLost(state.plots, state.plantedCount, {
              totalPlantings: TOTAL_PLANTINGS, passHarvests: PASS_HARVESTS,
            })) {
              const wiltedCount = state.plots.filter((p) => p.seed && p.wilted).length;
              state.runLost = {
                wrongLine: state.feedbackText,
                wilted: wiltedCount,
                visibleTime: 0,
                released: false,
                dismissed: false,
                clicked: false,
              };
              state.pendingEvent = null;
              state.feedbackTimer = 0;
              state.feedbackText = null;
              state.feedbackEduText = null;
              state.feedbackFactId = null;
              state.carrying = null;
              clearGardenInteractionState(state);
              dbg('run_lost', {
                plantedCount: state.plantedCount, wilted: wiltedCount, score: helpers.getScore(),
              });
              return;
            }

            // First planting of each season queues that season's decision
            // event (a "condition appears" beat from the partner table) — after
            // a short delay so the planting toast above is read first.
            if (state.seasonPlantCount === 1 && !state.eventsFired[state.activeSeason]) {
              const seasonEvent = DECISION_EVENTS.find((ev) => ev.season === state.activeSeason);
              if (seasonEvent) {
                state.eventsFired[state.activeSeason] = true;
                state.pendingEvent = { event: seasonEvent, delay: DECISION_DELAY_SEC };
              }
            }

            // C rotation: after PLANTINGS_PER_SEASON plantings, rotate to the next
            // season — or, if this was the last season, advance to WATER.
            if (state.seasonPlantCount >= PLANTINGS_PER_SEASON) {
              const idx = SEASON_ORDER.indexOf(state.activeSeason);
              if (idx < SEASON_ORDER.length - 1) {
                state.activeSeason = SEASON_ORDER[idx + 1];
                state.seasonPlantCount = 0;
                state.feedbackText = '🔄 ' + strings.seasonChanged(state.activeSeason);
                state.feedbackFactId = null;
                state.feedbackEduText = null;
                state.feedbackColor = '#6A1B9A';
                state.feedbackTimer = 2.0;
                dbg('season_rotated', { to: state.activeSeason });
              } else {
                state.phase = 'WATER';
                // Pickup-hose mechanic: do NOT auto-equip the water can.
                // Player must walk to the 💧 tile and press Enter to grab it.
                state.carrying = null;
                state.feedbackText = strings.phase_water;
                state.feedbackFactId = null; // seedling_care has no public source yet
                state.feedbackEduText = strings.msg_seedling_care;
                state.feedbackColor = '#1976D2';
                state.feedbackTimer = 5.0; // long — major phase change
                dbg('phase_advance_to_water', { plantedCount: state.plantedCount });
                dbg('educational_msg', { key: 'garden.msg.seedling_care', trigger: 'phase_advance_to_water' });
              }
            }
            return;
          }

          // Wrong corner — refuse LOUDLY (C1 review): Enter on an out-of-season
          // corner used to be a silent no-op, the one cut-tutorial rule taught
          // nowhere. Now it teaches at the moment of the mistake, like the
          // locked-NPC nudge: no wilt, no penalty, just "it's autumn — go to
          // the glowing corner".
          if (state.phase === 'PLANT' && facingPlot && !facingPlot.seed
              && state.carrying?.seed && facingPlot.season !== state.activeSeason) {
            const cx = OX + facingPlot.col * TILE_SIZE + TILE_SIZE / 2;
            const cy = OY + facingPlot.row * TILE_SIZE + TILE_SIZE / 2;
            state.feedbackText = '🔒 ' + strings.wrongCornerNow(state.activeSeason);
            state.feedbackFactId = null;
            state.feedbackEduText = null;
            state.feedbackColor = '#E65100';
            state.feedbackTimer = 2.2;
            spawnSparkles(state, cx, cy, '#E65100', 5);
            dbg('wrong_corner_refused', { plotSeason: facingPlot.season, active: state.activeSeason });
            return;
          }

          // (Water phase uses hold-to-water below — handled outside isEnterJustPressed)

          // Harvest a plot — split mechanic (2026-05-19):
          //   🌾 Harvest Basket → ONLY healthy plants (+20 food)
          //   🪣 Compost Bin    → ONLY wilted plants (+5 soil enrichment)
          //   Wrong tool        → educational error toast, no points, no harvest
          if (state.phase === 'HARVEST' && facingPlot && facingPlot.seed && !facingPlot.harvested
              && (state.carrying?.tool === 'harvest' || state.carrying?.tool === 'compost')) {
            const healthy = !facingPlot.wilted && facingPlot.health >= 2;
            const cx = OX + facingPlot.col * TILE_SIZE + TILE_SIZE / 2;
            const cy = OY + facingPlot.row * TILE_SIZE + TILE_SIZE / 2;

            if (healthy && state.carrying.tool === 'harvest') {
              facingPlot.harvested = true;
              state.healthyHarvests++;
              helpers.addScore(POINTS_HEALTHY_HARVEST);
              state.feedbackText = '🌾 ' + facingPlot.seed.emoji + ' +' + POINTS_HEALTHY_HARVEST;
              // First basket of the round carries the soil fact — the child has just
              // picked food they grew, which is what the source sentence is about.
              // After that, the UI celebration line (no source pill).
              if (!showFactOnce(state, strings, 'good_soil')) {
                state.feedbackFactId = null; // harvest_healthy_why is a UI string, no source
                state.feedbackEduText = strings.harvest_healthy_why;
              }
              state.feedbackColor = '#2E7D32';
              spawnSparkles(state, cx, cy, '#4CAF50', 8);
              spawnFloatingText(state, cx, cy, '+' + POINTS_HEALTHY_HARVEST, '#2E7D32');
              dbg('educational_msg', { key: state.feedbackFactId ? 'garden.facts.good_soil' : 'garden.harvest_healthy_why', trigger: 'harvest_healthy' });
            } else if (!healthy && state.carrying.tool === 'compost') {
              facingPlot.harvested = true;
              helpers.addScore(POINTS_WILTED_HARVEST);
              state.feedbackText = '🪣 ' + strings.composted + ' +' + POINTS_WILTED_HARVEST;
              if (!showFactOnce(state, strings, 'compost')) {
                state.feedbackFactId = null;
                state.feedbackEduText = null;
              }
              state.feedbackColor = '#795548';
              spawnFloatingText(state, cx, cy, '+' + POINTS_WILTED_HARVEST, '#795548');
              dbg('educational_msg', { key: 'garden.facts.compost', trigger: 'harvest_composted' });
            } else if (healthy && state.carrying.tool === 'compost') {
              // Wrong tool: healthy plant with compost bin. Don't harvest, redirect.
              state.feedbackText = '⚠️ ' + strings.wrong_tool_healthy;
              state.feedbackFactId = null;
              state.feedbackEduText = null;
              state.feedbackColor = '#E65100';
              state.wrongToolCount++;
              dbg('wrong_harvest_tool', { plot: { col: facingPlot.col, row: facingPlot.row }, want: 'harvest', got: 'compost', total: state.wrongToolCount });
            } else {
              // Wrong tool: wilted plant with harvest basket. Don't harvest, redirect.
              state.feedbackText = '⚠️ ' + strings.wrong_tool_wilted;
              state.feedbackFactId = null;
              state.feedbackEduText = null;
              state.feedbackColor = '#E65100';
              state.wrongToolCount++;
              dbg('wrong_harvest_tool', { plot: { col: facingPlot.col, row: facingPlot.row }, want: 'compost', got: 'harvest', total: state.wrongToolCount });
            }
            state.feedbackTimer = 4.0; // longer — kids need time to read the why

            // Auto-drop after sub-task completion (spec 2026-05-19).
            // Mirrors the water-phase auto-drop so the basket/bin behaves the
            // same way: when there's no matching work left, the tool returns
            // home and a toast tells the player. Game-end case still works —
            // allDone branch below clears + completes regardless.
            // Auto-drop the tool, but never at the cost of a fact. The notice used to
            // overwrite the fact line, which meant the child with exactly one wilted
            // plot — the most common way to make a mistake — composted it, and that
            // last compost swallowed the compost fact entirely. When a fact is on the
            // toast the notice is dropped instead: the tool visibly returns to its
            // tile and the objective banner already says what comes next, while the
            // fact has only this one appearance in the whole round.
            const announceAutoDrop = (msg) => {
              state.carrying = null;
              if (!state.feedbackFactId) state.feedbackEduText = msg; // UI string, no source pill
            };
            if (facingPlot.harvested && state.carrying?.tool === 'harvest') {
              const remainingHealthy = state.plots.filter(p =>
                p.seed && !p.harvested && !p.wilted && p.health >= 2,
              ).length;
              if (remainingHealthy === 0) {
                // Keep the just-set "+20" as the main toast line (H1) so the child
                // still sees their reward instead of it being overwritten.
                announceAutoDrop(strings.auto_drop_basket);
                dbg('auto_drop', { tool: 'harvest', reason: 'no_healthy_left' });
              }
            } else if (facingPlot.harvested && state.carrying?.tool === 'compost') {
              const remainingWilted = state.plots.filter(p =>
                p.seed && !p.harvested && (p.wilted || p.health < 2),
              ).length;
              if (remainingWilted === 0) {
                announceAutoDrop(strings.auto_drop_bin);
                dbg('auto_drop', { tool: 'compost', reason: 'no_wilted_left' });
              }
            }

            dbg('plot_harvested', {
              col: facingPlot.col, row: facingPlot.row, seedId: facingPlot.seed.id,
              healthy, finalHealth: facingPlot.health, wilted: facingPlot.wilted,
              scoreDelta: healthy ? POINTS_HEALTHY_HARVEST : POINTS_WILTED_HARVEST,
              healthyHarvests: state.healthyHarvests,
            });

            // All planted plots harvested? → DONE
            const allDone = state.plots.filter(p => p.seed).every(p => p.harvested);
            if (allDone) {
              const passed = state.healthyHarvests >= PASS_HARVESTS;
              dbg('game_complete', {
                healthyHarvests: state.healthyHarvests,
                plantedCount: state.plantedCount,
                passThreshold: PASS_HARVESTS,
                passed,
              });
              // Brief delay before completion so player sees final toast.
              // Once only: a second Enter in that beat must not end it twice.
              finishRoundOnce(state, helpers, ROUND_END_DELAY_MS);
            }
          }
        }

        // ─── Hold-to-water (WATER phase only) ─────────────
        // Round-gating: in round 1, only plots with health 0 can be watered.
        // In round 2, only plots with health 1. This forces the player to water
        // every plant once before any second watering — teaches even attention.
        const holdingKey = keys.has('enter') || keys.has(' ');
        if (!holdingKey) state.wateringNeedsRelease = false;
        const targetHealth = state.waterRound === 2 ? 1 : 0;
        const onWaterPhase = state.phase === 'WATER' && state.carrying?.tool === 'water';
        const facingAlivePlot = facingPlot && facingPlot.seed && !facingPlot.wilted;
        const canWaterTarget = onWaterPhase && targets.mode === 'action'
          && facingAlivePlot && facingPlot.health === targetHealth;
        const lockedOut = onWaterPhase && facingAlivePlot
          && facingPlot.health !== targetHealth && facingPlot.health < 2;

        // Lock-out feedback: facing a plot that's "out of turn"
        if (lockedOut && holdingKey && state.waterLockoutTimer <= 0) {
          state.feedbackText = '⏳ ' + strings.water_lockout;
          state.feedbackFactId = null;
          state.feedbackEduText = null;
          state.feedbackColor = '#FFA000';
          state.feedbackTimer = 2.0;
          state.waterLockoutTimer = 1.5; // debounce so message doesn't spam
          state.wateringNeedsRelease = true;
        }
        if (state.waterLockoutTimer > 0) state.waterLockoutTimer -= dt;

        const wateringTargetChanged = state.wateringTarget && (
          !canWaterTarget
          || state.wateringTarget.col !== facingPlot.col
          || state.wateringTarget.row !== facingPlot.row
        );
        if (wateringTargetChanged) {
          state.wateringTarget = null;
          state.wateringTimer = 0;
          if (holdingKey) state.wateringNeedsRelease = true;
        }

        if (canWaterTarget && holdingKey && !state.wateringNeedsRelease) {
          // Start or continue watering this target
          if (!state.wateringTarget
              || state.wateringTarget.col !== facingPlot.col
              || state.wateringTarget.row !== facingPlot.row) {
            state.wateringTarget = facingPlot;
            state.wateringTimer = 0;
          }
          state.wateringTimer += dt;
          if (state.wateringTimer >= WATER_HOLD_SEC) {
            // Water complete
            facingPlot.health = Math.min(2, facingPlot.health + 1);
            facingPlot.growthStage = Math.min(2, (facingPlot.growthStage || 0) + 1);
            const cx = OX + facingPlot.col * TILE_SIZE + TILE_SIZE / 2;
            const cy = OY + facingPlot.row * TILE_SIZE + TILE_SIZE / 2;
            spawnSparkles(state, cx, cy, '#1976D2', 8);
            dbg('plot_watered', {
              col: facingPlot.col, row: facingPlot.row,
              health: facingPlot.health, round: state.waterRound,
            });
            // Educational "why" feedback per round — long enough to read
            state.feedbackText = state.waterRound === 1
              ? strings.water_first_why
              : strings.water_second_why;
            // No fact line. The pollination fact used to fire on every second watering,
            // up to seven times a round, and giving a plant a drink of water has nothing
            // to do with pollen: this was the one card in the garden a child would
            // rightly call random. It now appears only on the spring
            // pollinators event, where it answers a choice the child actually made.
            state.feedbackFactId = null;
            state.feedbackEduText = null;
            state.feedbackColor = '#1976D2';
            state.feedbackTimer = 3.5;
            state.wateringTarget = null;
            state.wateringTimer = 0;
            state.wateringNeedsRelease = true;

            // Round 1 → 2 advance: every alive plot got first water
            if (state.waterRound === 1) {
              const round1Pending = state.plots.filter(p =>
                p.seed && !p.wilted && p.health < 1,
              ).length;
              if (round1Pending === 0) {
                state.waterRound = 2;
                state.feedbackText = strings.water_round2;
                state.feedbackFactId = null; // seedling_care has no public source yet
                state.feedbackEduText = strings.msg_seedling_care;
                state.feedbackColor = '#1565C0';
                state.feedbackTimer = 5.0; // long — important transition
                dbg('water_round_advance', { to: 2 });
              }
            }

            // Phase advance check: all alive plots fully watered (round 2 done)
            advanceFromWater(state, strings, helpers);
          }
        } else if (!holdingKey && state.wateringTarget) {
          // Cancel when the player releases before the hold completes.
          state.wateringTarget = null;
          state.wateringTimer = 0;
        }
      },

      render: (ctx, state) => {
        if (!atlasRef.current) return;

        // Base layers — actual tile atlas (grass + path), each tile rendered
        // distinctly with variant selection like FridgeManager/MarketTrip
        ctx.fillStyle = WORLD_ART.meadow;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        applyRoomCamera(ctx, ROOM);

        renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);

        // Garden decorations (background — scarecrow, well, trees, flowers)
        renderGardenDecorations(ctx, state.time);

        // Raised wooden season beds
        renderSeasonCorners(ctx, ROOM.cornerAreas, state.activeSeason, state.time);

        // The season labels are floor banners: visible over the room, but
        // always underneath the child instead of hiding the avatar.
        renderSeasonBanners(ctx, ROOM.cornerAreas, state.activeSeason, t);

        // Plots + seed crates + tools
        renderPlots(ctx, state.plots, state.time, state.phase);
        const usedSeedIds = new Set(
          state.plots
            .filter((plot) => plot.season === state.activeSeason && plot.seed)
            .map((plot) => plot.seed.id),
        );
        renderSeedCrates(
          ctx,
          state.seedCrates,
          state.carrying,
          null,
          state.time,
          state.phase,
          usedSeedIds,
        );
        renderTools(ctx, state.toolTiles, state.phase, state.carrying, state.plots, state.time);

        // What Enter will touch this frame — drawn over the beds, under the player
        renderTargetRing(ctx, state.targetTile, state.time, state.targetMode);

        // Watering stream + progress ring (between player and target)
        if (state.wateringTarget) {
          const progress = state.wateringTimer / WATER_HOLD_SEC;
          renderWateringStream(ctx, state.player, state.wateringTarget, progress, state.time);
          renderProgressRing(ctx, state.wateringTarget.col, state.wateringTarget.row, progress, '#1976D2');
        }

        // Player + carry overlay
        renderGameRoomPlayer(ctx, state, atlasRef.current);
        renderCarryOverlay(ctx, state.player, state.carrying, state.time, t);

        // Effects
        renderParticles(ctx, state);
        renderFloatingTexts(ctx, state);

        releaseRoomCamera(ctx);

        // Iris wipe in — player position transformed through zoom to canvas coords
        if (state.irisOpenness < 1) {
          const px = OX + state.player.pixelX + TILE_SIZE / 2;
          const py = OY + state.player.pixelY + TILE_SIZE / 2;
          const { x: canvasX, y: canvasY } = roomToCanvas(ROOM, px, py);
          drawIrisWipe(ctx, canvasX, canvasY, state.irisOpenness, CANVAS_W, CANVAS_H);
        }

        // HUD layer (canvas-pixel scale, outside zoom). The harvest-goal basket
        // and the live stars now live in the React top bar, not on the canvas.
        renderPhaseObjective(ctx, state, t);
        renderActionPrompt(ctx, state);
        if (!state.actionPrompt && state.toolTieHint) renderGardenHint(ctx, state.toolTieHint);
        // Derive the source for the CURRENTLY-shown verbatim fact here in the
        // render path — AFTER update() set this frame's final feedbackEduText — so
        // the "source" pill + sourceBadgeRect always match the visible message (no
        // 1-frame stale flash). The click handler reads this last-rendered value.
        // Re-keyed from text → stable factId so the pill still resolves after
        // feedbackEduText is translated (non-EN locales would otherwise miss the lookup).
        // GATE: suppress the toast entirely while any event modal is up (decisionEvent)
        // or pending (pendingEvent) — the quiz must appear alone, not on top of a toast.
        // The verdict fact/source bar is emitted by the update loop AFTER dismiss, which
        // sets feedbackTimer > 0 and clears decisionEvent, so the gate lifts automatically.
        // Also suppress while the shared intro card is up (re-opened via Οδηγίες
        // mid-game) so a still-decaying toast can't bleed under the card.
        const eventActive = !!(state.decisionEvent || state.pendingEvent || state.showMissionIntro
          || state.runLost);
        state.feedbackSourceId = (!eventActive && state.feedbackTimer > 0
          && state.feedbackFactId && state.feedbackEduText
          ? FACT_SOURCE_BY_ID[state.feedbackFactId] || null
          : null);
        if (!eventActive) {
          renderFeedbackToast(ctx, state, t);
        } else {
          // Modal is up — clear the source badge so a stale click target cannot fire.
          state.sourceBadgeRect = null;
        }
        // Decision event card — modal Q&A on top of the world
        renderDecisionEvent(ctx, state, t);
        // Run-lost card — the world is frozen behind it
        renderRunLostCard(ctx, state, stringsRef.current);
        // Shared MissionIntroCard sits on top of everything (same as WhereDoesItGrow)
        renderMissionIntroCard(ctx, state);
      },

      onComplete: () => {},
    });

  // Start when atlas ready
  useEffect(() => {
    if (atlasReady && gameState === 'INIT') {
      setGameState('PLAYING');
    }
  }, [atlasReady, gameState]);

  // F5: a scheduled end (round-end beat or result handoff) belongs to this
  // round only. Leaving the game cancels it, so no result and no points can
  // arrive from a round the child already left.
  const handoffTimerRef = useRef(null);
  useEffect(() => () => {
    if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    handoffTimerRef.current = null;
    const st = stateRef.current;
    if (st && st.finishTimer) { clearTimeout(st.finishTimer); st.finishTimer = null; }
  }, []);

  // F1: mirror of gameState for the canvas click handler, and any move
  // away from PLAYING (pause, Escape, completion) re-arms the run-lost card.
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
    if (gameState !== 'PLAYING') rearmRunLost(stateRef.current);
  }, [gameState]);

  // Result handoff
  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const state = stateRef.current;
      if (state) {
        const { passed, stars, tier } = gradeGardenPlanner(state.healthyHarvests);
        useGameStore.getState().recordStars('growing:GardenPlanner', stars); // lighthouse bridge
        const extras = { healthyHarvests: state.healthyHarvests, wrongToolCount: state.wrongToolCount, stars, tier };
        handoffTimerRef.current = setTimeout(() => {
          handoffTimerRef.current = null;
          onComplete(score, passed, extras);
        }, 800);
      }
    }
  }, [gameState]);

  // Live star tracker — mirrors WhereDoesItGrow pattern. Driven by "secured healthy"
  // count: plots that are non-wilted AND fully watered (health >= 2). These are
  // guaranteed to become healthy harvests (wrong-tool harvest is refused; wilting
  // only happens in PLANT phase). The count is monotonically non-decreasing and
  // converges to healthyHarvests at game end, so live stars == final stars at end.
  const [liveStars, setLiveStars] = useState(0);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);

  // The React topBar shows activeSeason, phase, and liveStars — all change only a
  // handful of times per game. Poll at 5 Hz but re-render only on actual changes
  // (~300 wasted reconciliations/min avoided on low-spec school laptops).
  const [hud, setHud] = useState({
    activeSeason: 'autumn', phase: 'PLANT', healthyHarvests: 0,
    progressKey: 'garden.bar.plant_progress', progressValues: { healthy: 0, left: TOTAL_PLANTINGS },
  });
  useEffect(() => {
    if (gameState !== 'PLAYING') return;
    const id = setInterval(() => {
      const s = stateRef.current;
      if (!s) return;
      // Season/phase chip + per-phase progress line
      const progress = gardenBarProgress(s, {
        totalPlantings: TOTAL_PLANTINGS, passHarvests: PASS_HARVESTS,
      });
      const progressSig = progress.key + JSON.stringify(progress.values);
      setHud((prev) =>
        prev.activeSeason === s.activeSeason && prev.phase === s.phase
          && prev.healthyHarvests === s.healthyHarvests
          && prev.progressSig === progressSig
          ? prev
          : {
            activeSeason: s.activeSeason, phase: s.phase, healthyHarvests: s.healthyHarvests,
            progressKey: progress.key, progressValues: progress.values, progressSig,
          });
      // Live star signal: count secured (non-wilted, fully watered) plots
      const secured = (s.plots || []).filter(
        (p) => p.seed && !p.wilted && p.health >= 2,
      ).length;
      const ns = liveStarsForHarvests(secured);
      setLiveStars((prev) => (prev === ns ? prev : ns));
    }, 200);
    return () => clearInterval(id);
  }, [gameState]);

  // F2 / F4: the canvas is scaled down on small screens (≈0.55 at 844×390)
  // and the DOM top bar sits over its top edge. Tell the renderer both, so the
  // step banner can start below the bar and the run-lost card can keep its
  // text at a readable size. Measured, not guessed, and kept current on resize.
  const topBarRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const bar = topBarRef.current;
    if (!canvas || !bar) return undefined;
    // The real uniform HiDPI scale and the letterbox offset (canvasCssGeometry),
    // not the element-width ratio: that one over-stated the scale whenever the
    // height limits the picture (844×390, 1920×700) — card text came out under
    // the floor and the banner's top edge stayed behind the bar.
    const measure = () => {
      const st = stateRef.current;
      if (!st) return;
      const geom = canvasCssGeometry(canvas, canvas.getBoundingClientRect(), CANVAS_W);
      if (!geom) return;
      st.cssScale = geom.scale;
      st.hudTopInset = hudTopInsetFor(geom, bar.getBoundingClientRect().bottom);
      // Side-strip layout on small screens (renderer sideZones): where the canvas
      // starts on screen, the viewport width and the top of each group of touch
      // controls (d-pad on the left, A/B on the right), in logical px. While the
      // controls are hidden (pause, overlays) the last known tops are kept.
      st.cssOriginX = geom.originX;
      st.cssViewW = window.innerWidth;
      const half = window.innerWidth / 2;
      const ctrls = [...document.querySelectorAll('[data-touch-control]')]
        .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
      if (ctrls.length) {
        const topOf = (rs) => (rs.length ? (Math.min(...rs.map((r) => r.top)) - geom.originY) / geom.scale : null);
        st.ctrlTopLeft = topOf(ctrls.filter((r) => r.left + r.width / 2 < half));
        st.ctrlTopRight = topOf(ctrls.filter((r) => r.left + r.width / 2 >= half));
      }
    };
    // attachHiDPI updates canvas.__hidpi from its own observer; measure again on
    // the next frame so the order of the two observers never leaves a stale k.
    let raf = 0;
    const schedule = () => {
      measure();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    schedule();
    // The touch controls are mounted by GameContainer, outside this component and
    // possibly after it; a light re-measure keeps their tops current.
    const ctrlPoll = setInterval(measure, 500);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(canvas);
    ro?.observe(bar);
    window.addEventListener('resize', schedule);
    return () => { clearInterval(ctrlPoll); ro?.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('resize', schedule); };
  }, [atlasReady, gameState]);

  // Expose state ref on the canvas DOM node for test automation parity
  // with SeasonMatcher. Lets headless tests inspect game state directly
  // (instead of walking React fiber).
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current._stateRef = stateRef;
    }
  }, [atlasReady]);

  // 'S' opens whichever sourced card is currently visible. During an in-play fact,
  // the source action owns this single key press: clear the corresponding WASD keys
  // before the update loop can interpret them as movement. ArrowDown stays available.
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || (e.key !== 's' && e.key !== 'S' && e.code !== 'KeyS')) return; // e.code: Greek layout sends 'σ'
      const state = stateRef.current;
      if (!state) return;
      const sourceId = missionIntroSourceId(state) || state.feedbackSourceId;
      if (!sourceId) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      keysRef.current.delete('s');
      keysRef.current.delete('keys');
      keysRef.current.delete(String(e.key).toLowerCase());
      window.open('/source.html?src=' + sourceId, '_blank', 'noopener');
    };
    // Capture phase runs before the shared WASD listener, so this sourced-card
    // shortcut cannot briefly enter the movement set between animation frames.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [keysRef]);

  // Click a "source" pill to open its public source in-game.
  //   • the intro citation (shared card, {x,y,width,height} shape)
  //   • the verbatim-fact toast during play ({x,y,w,h} shape)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onClick = (e) => {
      const state = stateRef.current;
      if (!state) return;
      const p = getCanvasPointer(canvas, e);
      // Intro card source chip — uses {width,height} (shared card convention)
      const introId = missionIntroSourceId(state);
      const ir = state.introSourceRect;
      if (introId && ir
        && p.x >= ir.x && p.x <= ir.x + ir.width && p.y >= ir.y && p.y <= ir.y + ir.height) {
        window.open('/source.html?src=' + introId, '_blank', 'noopener');
        return;
      }
      const hit = (r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      // Run-lost card: a tap on the card continues, like Enter.
      // Only recorded here; the update loop applies the same release/beat gate.
      if (state.runLost) {
        // Only when the card itself is on top: not behind Οδηγίες, the quit
        // confirm or the pause menu (F1).
        const cardOnTop = !state.showMissionIntro && !state.exitConfirmOpen
          && gameStateRef.current === 'PLAYING';
        if (cardOnTop && hit(state.runLostRect)) state.runLost.clicked = true;
        return;
      }
      // Decision event — tap an option to answer it (tablets/non-readers
      // of the keyboard hint). Only records the tap; the update loop confirms
      // and scores it so helpers.addScore stays the single ledger.
      if (state.decisionEvent && !state.decisionEvent.answered && state.eventOptionRects) {
        const r = state.eventOptionRects.find(hit);
        if (r) {
          state.decisionEvent.clickedIdx = r.idx;
          state.decisionEvent.confirmed = true;
        }
        return;
      }
      // Verdict shown → any click continues (same beat-gate as Enter)
      if (state.decisionEvent?.answered) {
        state.decisionEvent.dismissClicked = true;
        return;
      }
      // In-game verbatim-fact toast
      if (state.feedbackSourceId && hit(state.sourceBadgeRect)) {
        window.open('/source.html?src=' + state.feedbackSourceId, '_blank', 'noopener');
      }
    };
    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [atlasReady]);

  // Season → emoji map for the topBar season chip
  const SEASON_EMOJI = { winter: '❄️', spring: '🌸', summer: '☀️', autumn: '🍂' };
  // Live state values for the React topBar (driven by the change-gated poll above)
  const activeSeason = hud.activeSeason;
  const phase = hud.phase;
  // The bar names the phase briefly — the full
  // instruction stays in the step banner on the canvas — so goal, progress,
  // season, phase, stars and buttons all fit whole down to 844 px.
  const phaseLabelKey = {
    PLANT: 'garden.bar.phase_plant',
    WATER: 'garden.bar.phase_water',
    HARVEST: 'garden.bar.phase_harvest',
  }[phase] || 'garden.bar.phase_plant';
  const goalText = t('garden.bar.goal', { goal: PASS_HARVESTS });
  const progressText = hud.progressKey === 'garden.bar.plant_progress'
    ? t(hud.progressKey, {
      healthy: hud.progressValues.healthy,
      left: t('garden.bar.plantings_left', { count: hud.progressValues.left }),
    })
    : t(hud.progressKey, hud.progressValues);
  const compactBar = viewport.width < 1000;

  const styles = {
    wrapper: {
      position: 'relative', width: '100%', height: '100%',
      backgroundColor: WORLD_ART.meadow,
      overflow: 'hidden',
    },
    canvasWrap: {
      position: 'absolute',
      inset: 0,
      alignItems: 'center',
      display: 'flex', justifyContent: 'center',
      backgroundColor: 'transparent', padding: 0,
    },
    canvas: {
      maxHeight: '100%', maxWidth: '100%',
      width: '100%', height: 'auto',
      aspectRatio: '1280 / 704',
      imageRendering: 'pixelated', touchAction: 'none', display: 'block',
      background: WORLD_ART.meadow, // C6 verdict: was #8BC34A — one island, one meadow (matches WDIG/SD)
    },
    // Compact top bar overlaying canvas — ≤45px so it sits above the
    // garden field's top tile row without occluding the season corners.
    // One row, every item whole and in flow (nothing absolutely
    // positioned on top of anything else). The goal block stacks the fixed goal
    // over the per-phase progress line, so the bar keeps its 42 px height.
    topBar: {
      position: 'absolute', top: 0, left: 0, right: 0, height: 42,
      display: 'flex', alignItems: 'center',
      padding: compactBar ? '0 8px' : '0 16px', gap: compactBar ? 8 : 14,
      background: 'linear-gradient(180deg, #4E342E 0%, #3E2723 100%)',
      color: '#fff', zIndex: 50,
      borderBottom: '2px solid rgba(0,0,0,0.25)',
      boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
      fontFamily: "'Inter', system-ui, sans-serif",
      fontWeight: 700, fontSize: compactBar ? 12 : 14, letterSpacing: 0.2,
      whiteSpace: 'nowrap',
    },
    topBarSeason: { display: 'flex', alignItems: 'center', gap: 4, flex: 'none', textShadow: '1px 1px 2px rgba(0,0,0,0.45)' },
    topBarPhase: { display: 'flex', alignItems: 'center', gap: 4, flex: 'none', textShadow: '1px 1px 2px rgba(0,0,0,0.45)' },
    topBarGoal: {
      display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 'none',
      padding: compactBar ? '2px 8px' : '2px 12px', borderRadius: 10, height: 36, boxSizing: 'border-box',
      background: 'linear-gradient(180deg, #66BB6A 0%, #43A047 100%)', color: '#fff',
      fontWeight: 700, fontSize: compactBar ? 11 : 12, lineHeight: '15px',
      textShadow: '1px 1px 2px rgba(0,0,0,0.35)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
    },
    topBarGoalLine: { fontWeight: 800 },
    topBarStars: { flex: 'none', display: 'flex', alignItems: 'center' },
    topBarSpacer: { flex: 1, minWidth: 0 },
    topBarPause: {
      fontSize: compactBar ? 12 : 13, fontWeight: 700,
      padding: compactBar ? '5px 9px' : '5px 14px', borderRadius: 16, flex: 'none',
      background: 'rgba(0,0,0,0.28)', border: '1.5px solid rgba(255,255,255,0.35)',
      color: WORLD_ART.panelCream, cursor: 'pointer', fontFamily: 'inherit',
      whiteSpace: 'nowrap',
    },
  };

  return (
    <div style={styles.wrapper} data-viewport-profile={viewportProfile}>
      <style>{LIVE_STARS_KEYFRAMES}</style>
      <div style={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={styles.canvas}
        />
      </div>

      {/* Top bar overlay — single compact strip with live stars, season, phase, pause.
          Absolute so canvas keeps native res (parity with SeasonMatcher). */}
      <div style={styles.topBar} data-testid="garden-topbar" ref={topBarRef}>
        {/* Fixed goal over a per-phase progress line. It used to be
            «🧺 0/5», which stayed at 0 through planting and watering. */}
        <div style={styles.topBarGoal} data-testid="garden-goal">
          <span style={styles.topBarGoalLine} data-testid="garden-goal-line">{goalText}</span>
          <span data-testid="garden-progress-line">{progressText}</span>
        </div>
        {/* Active-season chip — only meaningful during PLANT phase (rotates
            autumn→winter→spring→summer). After planting ends it would just
            sit on the last active season ("summer") with no game role, so we
            hide it in WATER/HARVEST. */}
        {phase === 'PLANT' && (
          <span style={styles.topBarSeason} data-testid="garden-season">
            {SEASON_EMOJI[activeSeason] || '🌱'}&nbsp;{t(`season.${activeSeason}`)}
          </span>
        )}
        <span style={styles.topBarPhase} data-testid="garden-phase">{t(phaseLabelKey)}</span>
        {/* Live stars — in flow after the phase, so they can never sit on it. */}
        <div style={styles.topBarStars} data-testid="garden-stars"><LiveStars stars={liveStars} /></div>
        <div style={styles.topBarSpacer} />
        {/* Οδηγίες re-shows the shared MissionIntroCard (same as all other games).
            While Quit asks «are you sure?» the game is frozen and
            these two have nothing to do, so the confirm row takes their place
            and fits whole down to 844 px. */}
        {!quitConfirmOpen && (
          <>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              style={styles.topBarPause}
              onClick={() => {
                clearGardenInteractionState(stateRef.current);
                initMissionIntro(stateRef.current, t, missionIntroRef.current);
              }}
            >
              📖 {t('game.instructions', 'Οδηγίες')}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              style={styles.topBarPause}
              onClick={() => {
                clearGardenInteractionState(stateRef.current);
                setGameState('PAUSED');
              }}
            >
              ⏸ {t('game.pause')}
            </button>
          </>
        )}
        <ExitConfirmButton
          onExit={() => onNavigate('hub')}
          onFreeze={(f) => {
            setQuitConfirmOpen(f);
            const state = stateRef.current;
            if (!state) return;
            state.exitConfirmOpen = f;
            rearmRunLost(state);
            if (f) clearGardenInteractionState(state);
          }}
          style={styles.topBarPause}
        />
      </div>

      {gameState === 'PAUSED' && (
        <PauseOverlay
          surfaceRef={canvasRef}
          onResume={() => setGameState('PLAYING')}
          onInstructions={() => {
            clearGardenInteractionState(stateRef.current);
            initMissionIntro(stateRef.current, t, missionIntroRef.current);
          }}
          onQuit={() => onNavigate('hub')}
        />
      )}
    </div>
  );
}
