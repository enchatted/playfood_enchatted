import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas } from '../../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import {
  updatePlayerMovement, isEnterJustPressed, isDropKeyPressed,
  resolveInteraction, REACH, TILE_SIZE, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomTiles, renderGameRoomPlayer,
  renderGameRoomDecorations, renderHeldItem, renderFloorItems,
  renderParticles, renderFloatingTexts,
  spawnSparkles, updateParticles, updateFloatingTexts, spawnFloatingText,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
  OX, OY,
  initMissionIntro, renderMissionIntroCard,
} from '../engine/gameRoomRenderer.js';
import { missionIntroSourceId } from '../engine/missionIntroLogic.js';
import {
  renderKitchenWall, renderKitchenFloor, renderCounterTops, renderCounterStationLabels,
  renderKitchenStaff, renderRescuePot, renderPotItems, renderCounterItems,
  renderGoalBanner, renderCookingOverlay, renderDishReveal, DISH_REVEAL_PROMPT_DELAY,
  renderTipBanner, renderSafetyFactCard, renderLeftoverInteractionPrompts,
} from '../engine/leftoverChefRenderer.js';
import {
  LEFTOVER_ITEMS, LEFTOVER_BY_ID, RESCUE_GOALS, LEFTOVER_INTRO_FACT, FOOD_SAFETY_FACTS,
  LEFTOVER_POINTS_PER_GOAL, meetsGoal, unmetItems, safetyFactForDish, rescueIdeaForDish, undoLastPotItem,
  gradeLeftoverChef, liveLeftoverStars,
  isReservedForLaterGoal, homeIdeaForGoal,
} from '../../data/leftoverChef.js';
import { drawIrisWipe, IRIS_DURATION, getCanvasPointer, hitTest } from '../../utils/canvas.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * LeftoverChef — "The Magic Rescue Pot" (Island 3 · Challenge)
 *
 * Walk-around kitchen. 12 leftover ingredients on the counters. Each round states a
 * RESCUE GOAL — "use up these at-risk items before they spoil". The player drops 2–3
 * leftovers into the central pot and cooks. GOAL-MATCHING, not a hidden recipe: ANY dish
 * that includes the at-risk items meets the goal; extras never make it "wrong".
 *
 * Teach-don't-punish: a dish that misses the goal earns +0 and an amber nudge naming what
 * is still to rescue — never a red ✗, screen-shake or score penalty (the old −5/shake/
 * "doesn't make a dish" is gone). Each rescued dish surfaces a VERBATIM EUFIC food-safety
 * fact (cream card + «📖 source» chip + «Press S»).
 */

const BONUS_ALL_DONE = 25;
const PASS_SCORE = 50;           // ≥ 2 of 3 goals rescued
const COOKING_DURATION = 1.6;
// The «Rescue idea» stays until Enter/Space/A (a fixed 1.4 s was too short to
// read). Presses in the first half second are ignored so a hurried press while the pot
// finishes cannot skip it; the safety card after it needs its own, separate press.
const DISH_REVEAL_MIN_SECONDS = DISH_REVEAL_PROMPT_DELAY;
const TIP_DURATION = 4.0;

const ROOM = GAME_ROOMS.LeftoverChef;
const isWalkable = (col, row) => isGameRoomWalkable(ROOM, col, row);
const POT_INTERACTABLE = [{ isPot: true, tiles: ROOM.potTiles }];
const LEFTOVER_REACH_ORDER = [REACH.FACED, REACH.AHEAD2, REACH.DIAGONAL, REACH.SIDE];

const reachablePot = (player) => (
  resolveInteraction(player, POT_INTERACTABLE, null, LEFTOVER_REACH_ORDER)?.item || null
);
const reachableCounterItem = (player, items) => (
  resolveInteraction(player, items, (item) => !item.picked, LEFTOVER_REACH_ORDER)?.item || null
);
const clearInteractionPrompts = (state) => {
  state.actionPrompt = null;
  state.dropPrompt = null;
};

// Shared MissionIntroCard. The card shows OUR plain sentence (translated);
// the chip/«Press S» opens the locked 🟢 2-3-days EUFIC verbatim
// (LEFTOVER_INTRO_FACT). Title/steps/goal are free UI text.
const missionIntroFor = (t) => ({
  titleKey: 'missionIntro.leftoverchef.title',
  stepKeys: [
    'missionIntro.leftoverchef.step1',
    'missionIntro.leftoverchef.step2',
    'missionIntro.leftoverchef.step3',
    'missionIntro.leftoverchef.step4', // How the stars are earned
  ],
  introFact: {
    sourceId: LEFTOVER_INTRO_FACT.sourceId,
    quote: t('leftover_chef.facts.leftovers_days', { defaultValue: LEFTOVER_INTRO_FACT.plain }),
    paraphrase: true,
  },
  goalKey: 'missionIntro.leftoverchef.goal',
  ctaKey: 'hint.skip_ab', // names the on-screen A button (touch controls show on every landscape screen)
});

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Component ───────────────────────────────────────────

export default function LeftoverChef({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const atlasRef = useRef(null);

  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  // Pre-translate strings for canvas rendering
  const i18nRef = useRef({});
  i18nRef.current = {
    pickupPrompt: (food) => t('leftover_chef.pickup_prompt', {
      food,
      defaultValue: 'Press Enter or Space to pick up {{food}}',
    }),
    addToPotPrompt: t('leftover_chef.add_to_pot_prompt', 'Press Enter or Space to add to the Rescue Pot'),
    cookPrompt: t('leftover_chef.cook_prompt', 'Press Enter or Space to cook!'),
    dropPrompt: t('leftover_chef.drop_prompt', 'Press Q to put back'),
    undoPotPrompt: t('leftover_chef.undo_pot_prompt', 'Press Q to return the last pot ingredient'),
    cookingText: t('leftover_chef.cooking_text', 'Cooking...'),
    dishRescued: t('leftover_chef.dish_rescued', 'Rescued! Nothing wasted.'),
    stillToRescue: t('leftover_chef.still_to_rescue', 'Still to rescue:'),
    safetyTitle: t('leftover_chef.safety_title', 'This tip keeps your dish safe to eat:'),
    ideaTitle: t('leftover_chef.idea_title', 'Rescue idea:'),
    continuePrompt: t('leftover_chef.fact_continue_prompt', 'Press Enter or Space to continue'),
    idea: (id, field) => t(`leftover_chef.ideas.${id}.${field}`, ''),
    homeIdeaLabel: t('leftover_chef.home_idea_label', 'Another idea for home:'),
    homeIdea: (id) => t(`leftover_chef.home_ideas.${id}`, ''),
    allDone: t('leftover_chef.all_done', 'All rescue goals done! Amazing chef!'),
    // The child-facing plain sentence per locked fact (en falls back
    // to the data-file plain; el/nl/pt carry real translations).
    facts: Object.fromEntries(Object.entries(FOOD_SAFETY_FACTS).map(([id, f]) => [
      id, t(`leftover_chef.facts.${id}`, { defaultValue: f.plain }),
    ])),
  };

  // The instructions card shows the 2-3 days rule again, so it counts as shown: the
  // next dish without its own rule then gets the 2-hour rule (no repeat).
  const reopenInstructions = (state) => {
    initMissionIntro(state, t, missionIntroFor(t));
    if (Array.isArray(state.shownFactKeys)) state.shownFactKeys.push('leftovers_days');
  };

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
        state.qWasDown = false;
        state.sWasDown = false;

        // 12 leftovers (data/leftoverChef.js) shuffled onto the counter stations.
        const shuffled = shuffleArray(LEFTOVER_ITEMS);
        state.counterItems = shuffled.map((item, i) => ({
          ...item,
          name: t(`leftover_chef.item_${item.id}`, item.id),
          col: ROOM.counterPositions[i].col,
          row: ROOM.counterPositions[i].row,
          picked: false,
        }));
        state.itemEmoji = Object.fromEntries(LEFTOVER_ITEMS.map((i) => [i.id, i.emoji]));
        state.itemName = Object.fromEntries(state.counterItems.map((i) => [i.id, i.name]));

        state.floorItems = [];
        state.heldItem = null;
        state.potItems = [];

        // Rescue goals — one active at a time (goal-matching, not a hidden recipe).
        state.goals = RESCUE_GOALS;
        state.goalIndex = 0;
        state.completedGoals = [];
        // Safety facts already shown, oldest first — the mission intro shows the 2-3 days
        // rule, so the first dish without its own rule gets a different one.
        state.shownFactKeys = ['leftovers_days'];

        // Cooking / reveal / fact-card phases
        state.cooking = false;
        state.cookTimer = 0;
        state.cookingText = '';
        state.dishReveal = null;
        state.dishRevealElapsed = 0;
        state.pendingFact = null;
        state.factCard = null;
        state.celebrateAfterFact = false;
        state.sourceBadgeRect = null;

        state.tipBanner = null;
        state.tipBannerLife = 0;

        // Effects — NO screen shake in the reframe (teach-don't-punish).
        state.particles = [];
        state.floatingTexts = [];
        state.screenShake = 0;
        state.actionPrompt = null;
        state.dropPrompt = null;

        state.celebrating = false;
        state.celebrateTimer = 0;

        initMissionIntro(state, t, missionIntroFor(t));
      },

      update: (state, dt, keys, helpers) => {
        const strings = i18nRef.current;
        state.time += dt;
        state.timerPaused = false;

        // MissionIntroCard blocks input + pauses the timer until dismissed.
        // Iris opens behind the card (parity with FridgeManager) so it sits over the live
        // kitchen, not a blank screen — must run BEFORE the standalone iris early-return.
        if (state.showMissionIntro) {
          if (state.irisOpenness < 1) {
            state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
          }
          if (isEnterJustPressed(keys, state)) state.showMissionIntro = false;
          state.timerPaused = true;
          return;
        }

        // Iris wipe
        if (state.irisOpenness < 1) {
          state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
          return;
        }

        // A food-safety fact is a real learning pause, not a toast. Gameplay and the
        // countdown remain frozen until Enter/Space dismisses it; S still opens the source.
        const sDown = keys.has('s') || keys.has('keys'); // 'keys' = e.code KeyS (Greek layout)
        if (state.factCard) {
          clearInteractionPrompts(state);
          state.timerPaused = true;
          if (sDown && !state.sWasDown && state.factCard.sourceId && typeof window !== 'undefined') {
            window.open(`source.html?src=${state.factCard.sourceId}`, '_blank', 'noopener');
          }
          state.sWasDown = sDown;

          if (isEnterJustPressed(keys, state)) {
            state.factCard = null;
            state.sourceBadgeRect = null;

            if (state.celebrateAfterFact) {
              state.celebrateAfterFact = false;
              helpers.addScore(BONUS_ALL_DONE);
              state.tipBanner = strings.allDone;
              state.tipBannerLife = TIP_DURATION;
              state.celebrating = true;
              state.celebrateTimer = 3.5;
              spawnFloatingText(
                state, CANVAS_W / 2, CANVAS_H / 2 - 40,
                `+${BONUS_ALL_DONE}`, '#FFD54F',
              );
            }
          }
          return;
        }
        state.sWasDown = sDown;

        updateParticles(state, dt);
        updateFloatingTexts(state, dt);

        // Tip banner countdown
        if (state.tipBannerLife > 0) {
          state.tipBannerLife -= dt;
          if (state.tipBannerLife <= 0) state.tipBanner = null;
        }

        // ── Celebration phase ──
        if (state.celebrating) {
          clearInteractionPrompts(state);
          state.celebrateTimer -= dt;
          if (Math.random() < 0.3) {
            const rx = OX + (2 + Math.random() * 16) * TILE_SIZE;
            const ry = OY + (2 + Math.random() * 11) * TILE_SIZE;
            spawnSparkles(state, rx, ry, '#FFD54F', 4);
          }
          if (state.celebrateTimer <= 0) helpers.complete();
          return;
        }

        // ── Dish reveal phase ──
        if (state.dishReveal) {
          clearInteractionPrompts(state);
          state.timerPaused = true;
          state.dishRevealElapsed += dt;
          // Always read the key edge, so a press held from cooking never counts later.
          const pressed = isEnterJustPressed(keys, state);
          if (pressed && state.dishRevealElapsed >= DISH_REVEAL_MIN_SECONDS) {
            state.dishReveal = null;
            // Surface the queued food-safety fact for what was cooked.
            if (state.pendingFact) {
              state.factCard = { ...state.pendingFact };
              state.pendingFact = null;
              state.timerPaused = true;
            }
            // The final celebration starts only after the child reads and dismisses
            // the last safety fact, so the overlay can never disappear underneath it.
            if (state.completedGoals.length >= state.goals.length) {
              state.celebrateAfterFact = true;
            }
          }
          return;
        }

        // ── Cooking phase ──
        if (state.cooking) {
          clearInteractionPrompts(state);
          state.cookTimer -= dt;
          if (Math.random() < 0.2) {
            const potCenterX = OX + 9.5 * TILE_SIZE + TILE_SIZE / 2;
            const potCenterY = OY + 6.5 * TILE_SIZE;
            spawnSparkles(state, potCenterX, potCenterY - 10, '#ECEFF1', 2);
          }

          if (state.cookTimer <= 0) {
            state.cooking = false;
            const potCenterX = OX + 10 * TILE_SIZE;
            const potCenterY = OY + 6.5 * TILE_SIZE;
            const potIds = state.potItems.map((i) => i.id);
            const goal = state.goals[state.goalIndex];

            if (goal && meetsGoal(potIds, goal)) {
              // ── Rescued! (goal met) ──
              state.completedGoals.push(goal.id);
              helpers.addScore(LEFTOVER_POINTS_PER_GOAL);
              spawnSparkles(state, potCenterX, potCenterY, '#4CAF50', 15);

              // Queue the food-safety fact for the dish just cooked. The card shows
              // OUR translated plain sentence; the chip/«Press S» opens
              // the locked verbatim.
              const fact = safetyFactForDish(potIds, state.shownFactKeys);
              state.shownFactKeys.push(fact.key);
              state.pendingFact = {
                key: fact.key,
                emoji: '🥡',
                title: strings.safetyTitle,
                fact: strings.facts[fact.key] || fact.plain,
                sourceId: fact.sourceId,
                paraphrase: true,
              };

              // «Ιδέα αξιοποίησης»: a curated dish for THESE foods (order-independent), or
              // the neutral note — never an invented dish.
              const idea = rescueIdeaForDish(goal, potIds);
              const homeIdeaKey = homeIdeaForGoal(goal);
              const neutral = idea.id === 'neutral';
              state.dishReveal = {
                ideaId: idea.id,
                emoji: idea.emoji,
                title: strings.ideaTitle,
                name: neutral ? strings.dishRescued : strings.idea(idea.id, 'name'),
                text: strings.idea(idea.id, 'text'),
                continuePrompt: strings.continuePrompt,
                points: LEFTOVER_POINTS_PER_GOAL,
                // A separate home suggestion, never the dish just cooked.
                homeIdea: homeIdeaKey
                  ? { id: homeIdeaKey, label: strings.homeIdeaLabel, text: strings.homeIdea(homeIdeaKey) }
                  : null,
              };
              state.dishRevealElapsed = 0;
              state.goalIndex += 1;
              state.potItems = [];
            } else {
              // ── Missed the goal — teach-don't-punish: amber nudge, +0, no shake/red. ──
              const unmet = goal ? unmetItems(potIds, goal) : [];
              const emojis = unmet.map((id) => state.itemEmoji[id] || '').join(' ');
              spawnSparkles(state, potCenterX, potCenterY, '#FFB74D', 8);
              spawnFloatingText(
                state, potCenterX, potCenterY - 20,
                `${strings.stillToRescue} ${emojis}`.trim(), '#FFB74D',
              );
              // Return the items to their counters so the player can re-plan.
              for (const item of state.potItems) {
                const slot = state.counterItems.find((c) => c.id === item.id && c.picked);
                if (slot) slot.picked = false;
              }
              state.potItems = [];
            }
          }
          return;
        }

        // ── Player movement ──
        updatePlayerMovement(state.player, dt, keys, isWalkable);

        // ── Prompts ──
        state.actionPrompt = null;
        state.dropPrompt = null;

        if (state.heldItem) {
          state.dropPrompt = strings.dropPrompt;
          const nearPot = reachablePot(state.player);
          if (nearPot && state.potItems.length < 3) state.actionPrompt = strings.addToPotPrompt;
        } else {
          if (state.potItems.length > 0) state.dropPrompt = strings.undoPotPrompt;
          // Cook when the pot holds at least 2 leftovers.
          if (state.potItems.length >= 2) {
            const nearPot = reachablePot(state.player);
            if (nearPot) state.actionPrompt = strings.cookPrompt;
          }
          if (!state.actionPrompt) {
            const nearCounter = reachableCounterItem(state.player, state.counterItems);
            if (nearCounter) {
              state.actionPrompt = strings.pickupPrompt(`${nearCounter.emoji} ${nearCounter.name}`);
            }
          }
        }

        // ── Enter key ──
        if (isEnterJustPressed(keys, state)) {
          if (state.heldItem) {
            const nearPot = reachablePot(state.player);
            if (nearPot && state.potItems.length < 3) {
              if (isReservedForLaterGoal(state.heldItem.id, state.goals, state.goalIndex)) {
                state.tipBanner = t('leftover_chef.reserve_later');
                state.tipBannerLife = TIP_DURATION;
                return;
              }
              state.potItems.push({ ...state.heldItem });
              state.heldItem = null;
              state.dropPrompt = null;
              const potCenterX = OX + 10 * TILE_SIZE;
              const potCenterY = OY + 6.5 * TILE_SIZE;
              spawnSparkles(state, potCenterX, potCenterY, '#64B5F6', 4);
            }
          } else if (state.potItems.length >= 2
            && reachablePot(state.player)) {
            state.cooking = true;
            state.cookTimer = COOKING_DURATION;
            state.cookingText = strings.cookingText;
            clearInteractionPrompts(state);
            return;
          } else {
            const nearCounter = reachableCounterItem(state.player, state.counterItems);
            if (nearCounter) {
              nearCounter.picked = true;
              state.heldItem = { id: nearCounter.id, emoji: nearCounter.emoji, name: nearCounter.name };
            }
          }
        }

        // ── Q key — return a held item, or undo the latest ingredient in the pot ──
        const qDown = isDropKeyPressed(keys);
        const qJust = qDown && !state.qWasDown;
        state.qWasDown = qDown;
        if (qJust) {
          if (state.heldItem) {
            const slot = state.counterItems.find((c) => c.id === state.heldItem.id && c.picked);
            if (slot) slot.picked = false;
            state.heldItem = null;
            state.dropPrompt = null;
          } else if (state.potItems.length > 0) {
            const { item, remaining } = undoLastPotItem(state.potItems);
            state.potItems = remaining;
            const slot = state.counterItems.find((c) => c.id === item?.id && c.picked);
            if (slot) slot.picked = false;
            state.dropPrompt = null;
          }
        }
      },

      render: (ctx, state, helpers) => {
        if (!atlasRef.current) return;
        const tFunc = (key, fallback, opts) => t(key, fallback, opts);

        ctx.fillStyle = '#EAD0A6';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        applyRoomCamera(ctx, ROOM);

        renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);
        renderKitchenFloor(ctx, ROOM.map);
        renderCounterTops(ctx, ROOM.map);
        renderCounterStationLabels(ctx, ROOM.map, tFunc);
        renderKitchenWall(ctx);
        renderGameRoomDecorations(ctx, ROOM);
        renderCounterItems(ctx, state);
        renderKitchenStaff(ctx, state, ROOM);
        renderFloorItems(ctx, state);
        renderRescuePot(ctx, state, tFunc);
        renderPotItems(ctx, state);
        renderGameRoomPlayer(ctx, state, atlasRef.current);
        renderHeldItem(ctx, state);
        renderParticles(ctx, state);
        renderFloatingTexts(ctx, state);

        releaseRoomCamera(ctx);

        // HUD (screen space)
        renderGoalBanner(ctx, state, tFunc);
        renderLeftoverInteractionPrompts(ctx, state);
        renderCookingOverlay(ctx, state);
        renderDishReveal(ctx, state);
        renderTipBanner(ctx, state);
        renderSafetyFactCard(ctx, state, tFunc);

        // Iris wipe
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
      // Intro card chip — open the 2-3-days source.
      const introId = missionIntroSourceId(st);
      if (introId && hitTest(p, st.introSourceRect)) {
        window.open(`source.html?src=${introId}`, '_blank', 'noopener');
        return;
      }
      // Mid-game food-safety fact card chip.
      const rect = st.sourceBadgeRect;
      if (!rect || !st.factCard?.sourceId) return;
      if (hitTest(p, rect)) {
        window.open(`source.html?src=${st.factCard.sourceId}`, '_blank', 'noopener');
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, [atlasReady, stateRef]);

  // «Press S» fallback to open the INTRO card's source. Listens on WINDOW (FIX-F) so it
  // survives the canvas losing focus after a header-button click. Guarded by
  // missionIntroSourceId → null off-intro, so it never collides with the mid-game factCard
  // S handler (that one lives inside update(), and the loop is paused during the intro).
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || (e.key !== 's' && e.key !== 'S' && e.code !== 'KeyS')) return; // e.code: Greek layout sends 'σ'
      const id = missionIntroSourceId(stateRef.current);
      if (id) window.open(`source.html?src=${id}`, '_blank', 'noopener');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stateRef]);

  // Handle completion
  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const passed = score >= PASS_SCORE;
      const completed = stateRef.current.completedGoals?.length || 0;
      const total = stateRef.current.goals?.length || RESCUE_GOALS.length;
      const tier = gradeLeftoverChef(completed, total);
      setTimeout(() => onComplete(score, passed, {
        tier, completed, total, stars: liveLeftoverStars(score),
      }), 500);
    }
  }, [gameState]);

  // Auto-start
  useEffect(() => {
    if (atlasReady && gameState === 'INIT') setGameState('PLAYING');
  }, [atlasReady, gameState]);

  // Focus canvas
  useEffect(() => {
    if (atlasReady && canvasRef.current) canvasRef.current.focus();
  }, [atlasReady]);

  const liveStars = liveLeftoverStars(score);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#EAD0A6', overflow: 'hidden' }}>
      <ScoreBar
        score={score}
        stars={liveStars}
        timeLeft={null}
        onPause={() => setGameState('PAUSED')}
        onInstructions={() => {
          // Keep a pending safety fact intact. The instructions render above it and,
          // when dismissed, the child returns to the same paused learning card.
          const s = stateRef.current;
          if (!s) return;
          reopenInstructions(s);
        }}
        onExit={() => onNavigate('hub')}
        onFreeze={(f) => { const s = stateRef.current; if (s) s.exitConfirmOpen = f; }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          tabIndex={0}
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: 'calc(100vh - 60px)',
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            objectFit: 'contain',
            imageRendering: 'pixelated',
            outline: 'none',
          }}
        />
      </div>

      {!atlasReady && (
        <div style={styles.loading}>Loading...</div>
      )}

      {gameState === 'PAUSED' && (
        <PauseOverlay
          surfaceRef={canvasRef}
          onResume={() => setGameState('PLAYING')}
          onInstructions={() => {
            const state = stateRef.current;
            if (!state) return;
            reopenInstructions(state);
          }}
          onQuit={() => onNavigate('hub')}
        />
      )}
    </div>
  );
}

const styles = {
  loading: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#BCAAA4', color: '#fff', fontSize: 24,
  },
};
