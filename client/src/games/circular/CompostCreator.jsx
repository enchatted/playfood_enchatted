import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas } from '../../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import { missionIntroSourceId, missionIntroPreSourceId, padIntroChip, sourceShortcutTarget } from '../engine/missionIntroLogic.js';
import {
  updatePlayerMovement, isEnterJustPressed, isDropKeyPressed,
  checkInteraction, TILE_SIZE, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomTiles, renderGameRoomPlayer,
  renderGameRoomDecorations, renderHeldItem, renderFloorItems,
  renderActionPrompt, renderDropPrompt,
  renderParticles, renderFloatingTexts,
  spawnSparkles, updateParticles, updateFloatingTexts, spawnFloatingText,
  initMissionIntro, renderMissionIntroCard,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
  OX, OY,
} from '../engine/gameRoomRenderer.js';
import {
  renderGardenFence, renderGrassOverlay, renderTreeStumps,
  renderCompostBins, renderStumpItems, renderChefNPC,
  renderChefTipBubble, renderCompostFactCard,
  CHEF_POSITION, binLabelText, renderCompostHeldItem,
} from '../engine/compostCreatorRenderer.js';
import { hasDrawnIcon, itemTextLabel, MILK_CARTON_DATA_URL } from '../engine/itemGlyphs.js';
import { compostFocusedItemRegions, placeCompostFocusedItem } from './compostFocusedItemLayout.js';
import { drawIrisWipe, IRIS_DURATION, getCanvasPointer, hitTest } from '../../utils/canvas.js';
import PauseOverlay from '../../components/PauseOverlay.jsx';
import ExitConfirmButton from '../../components/ExitConfirmButton.jsx';
import {
  COMPOST_BINS, WASTE_ITEMS, TOTAL_ITEMS_PER_SESSION, pickSessionItems, buildRevealList,
  hasSourcedFact, factForItem, COMPOST_INTRO_FACT, COMPOST_PREVENTION_FACT, returnCompostItemToStump,
} from '../../data/compostItems.js';

/**
 * CompostCreator — "The Backyard Sort"
 *
 * Walk-around backyard game. 12 waste items on tree stumps, 5 bins:
 * compost / plastic / carton / aluminium / battery.
 * After all 12 placed → Grand Reveal checks each one-by-one.
 * Wrong items bounce back for retry. Chef gives educational tips.
 * No timer — relaxed pace.
 */

const TOTAL_ITEMS = TOTAL_ITEMS_PER_SESSION;
const POINTS_CORRECT = 10;
const PASS_SCORE = 60;
const REVEAL_INTERVAL = 0.45;
const SCREEN_SHAKE_DECAY = 0.88;

const ROOM = GAME_ROOMS.CompostCreator;
const isWalkable = (col, row) => isGameRoomWalkable(ROOM, col, row);

// Shared MissionIntroCard. The intro now carries a fact: the EPA definition
// of composting, which nothing else in the game taught. `paraphrase` puts OUR plain sentence
// on the card with the verbatim one keypress away behind the badge.
// title/steps/goal are ordinary translated UI.
function missionIntroFor(t) {
  return {
    titleKey: 'missionIntro.compostcreator.title',
    stepKeys: [
      'missionIntro.compostcreator.step1',
      'missionIntro.compostcreator.step2',
      'missionIntro.compostcreator.step3',
      'missionIntro.compostcreator.step4', // How the stars are earned
    ],
    // Show the prevention tip above the steps. R opens its source.
    preFact: {
      sourceId: COMPOST_PREVENTION_FACT.sourceId,
      quote: t('compost.facts.prevention', { defaultValue: COMPOST_PREVENTION_FACT.plain }),
      paraphrase: true,
      key: 'R',
      labelKey: 'compost.intro_source_prevention',
    },
    introFact: {
      sourceId: COMPOST_INTRO_FACT.sourceId,
      quote: t('compost.facts.intro', { defaultValue: COMPOST_INTRO_FACT.plain }),
      paraphrase: true,
      labelKey: 'compost.intro_source_definition',
    },
    goalKey: 'missionIntro.compostcreator.goal',
    ctaKey: 'hint.skip_ab', // names the on-screen A button (touch controls show on every landscape screen)
  };
}

// Waste items + bin definitions live in /data/compostItems.js (pure module, Node-checked).

// ─── Reveal logic ────────────────────────────────────────

// Look up bin definition (tiles + visual config) by id.
function getBin(binId) {
  return ROOM.bins.find(b => b.id === binId);
}

// Pixel center of a bin's rectangle, computed from its full tiles array (works for any W×H).
function binCenter(binId) {
  const bin = getBin(binId);
  const cols = bin.tiles.map(t => t.col);
  const rows = bin.tiles.map(t => t.row);
  const cx = (Math.min(...cols) + Math.max(...cols)) / 2 + 0.5;
  const cy = (Math.min(...rows) + Math.max(...rows)) / 2 + 0.5;
  return { bx: OX + cx * TILE_SIZE, by: OY + cy * TILE_SIZE };
}

function startReveal(state) {
  state.revealing = true;
  state.revealIndex = 0;
  state.revealTimer = 0;
  state.factCard = null; // close any open sourced card before the rapid reveal
  state.actionPrompt = null; // input is blocked during the reveal, so no prompt may linger
  state.dropPrompt = null;
  // Only reveal items not yet confirmed correct — already-correct items don't re-score.
  state.revealList = buildRevealList(ROOM.bins.map(b => b.id), state.binItems, state.confirmed);
}

function revealNextItem(state, helpers, strings) {
  const idx = state.revealIndex;
  if (idx >= state.revealList.length) return;

  const { item, binId } = state.revealList[idx];
  const isCorrect = item.correctBin === binId;
  const { bx, by } = binCenter(binId);

  if (isCorrect) {
    helpers.addScore(POINTS_CORRECT);
    state.confirmed.add(item.id); // lock it — never re-revealed/re-scored on a retry round
    spawnSparkles(state, bx, by, '#4CAF50', 10);
    spawnFloatingText(state, bx, by - 16, '+10', '#4CAF50');

    // The fast Grand Reveal only CONFIRMS the bin (a sort-rule, needs no citation) — it never
    // flashes a fact. The verbatim "why" lives on the sourced chef card (ask the Σεφ while
    // holding the item) so kids read it calmly with the «📖 source» chip + «Press S».
    if (strings) {
      const binLabel = binLabelText(strings(`compost.bin_label_${binId}`) || binId);
      state.chefTip = strings('compost.correct_affirm', { bin: binLabel }) || `✓ ${binLabel}`;
      state.chefTipAmber = false;
      state.chefTipTimer = 2.0;
    }
  } else {
    // Teach-don't-punish (FridgeManager-avoid parity): NO score penalty,
    // AMBER not red, a gentle nudge (not a punitive jolt), and the item bounces back
    // to retry. The message is a NON-factual "try another bin" nudge: factual
    // teach-hints (the "why") wait for a verified source.
    spawnSparkles(state, bx, by, '#FFB74D', 8); // amber — the waste isn't "the bad guy"
    state.screenShakeAmount = 4;                 // gentle, matches FridgeManager avoid
    if (strings) {
      state.chefTip = strings('compost.wrong_retry', 'Not quite. Try another bin!');
      state.chefTipAmber = true;
      state.chefTipTimer = 2.5;
    }

    returnCompostItemToStump(state, item, binId);
  }

  state.revealIndex++;
}

// ─── Chef Help ───────────────────────────────────────────
// Stand near the Chef + Enter → he gives you contextual help. Two modes:
//   • Holding an item: hint about that specific item's correct bin.
//   • Idle: a 5-line guide of "what goes where".
// Output goes through the existing chef tip bubble (multi-line + amber support).
function askChef(state, strings) {
  if (state.heldItem) {
    const held = state.heldItem;
    if (hasSourcedFact(held)) {
      // Two-layer card: OUR plain sentence in the child's language, the verbatim passage one
      // keypress away behind the «📖 source» badge. `paraphrase` drops the quotation marks and
      // the italics, so our wording is never passed off as the source's.
      const rec = factForItem(held);
      state.factCard = {
        emoji: held.emoji || '🌱',
        icon: held.icon,
        title: strings('compost.fact_title', 'Why it belongs here:'),
        fact: strings(`compost.facts.${held.factId}`, rec.plain),
        sourceId: rec.sourceId,
        paraphrase: true,
      };
      state.chefTip = null; // the big sourced card replaces the small bubble
      state.chefTipTimer = 0;
    } else {
      // Parked item (no verbatim) → a sort-rule hint only; no unsourced fact-claim renders.
      const key = `compost.chef.hint_${held.correctBin}`;
      state.chefTip = strings(key)
        || strings('compost.chef.hint_generic', '🤔 Σκέψου: κομπόστ, πλαστικό, κουτιά ποτών, αλουμίνιο ή μπαταρία;');
      state.chefTipAmber = false;
      state.chefTipTimer = 5;
      state.factCard = null;
    }
  } else {
    // 5-line bin guide.
    const guide = [
      strings('compost.chef.guide_title', '📖 Πού πάει τι;'),
      strings('compost.chef.guide_compost',   '🌱 Κομπόστ: φρούτα, λαχανικά, καφές'),
      strings('compost.chef.guide_plastic',   '🧴 Πλαστικό: μπουκάλια, σακούλες'),
      strings('compost.chef.guide_carton',    '🧃 Κουτιά ποτών: κουτιά γάλακτος, κουτιά χυμού'),
      strings('compost.chef.guide_aluminium', '🥫 Αλουμίνιο: κουτιά, αλουμινόχαρτο'),
      strings('compost.chef.guide_battery',   '🔋 Μπαταρία: μόνο μπαταρίες!'),
    ];
    state.chefTip = guide.join('\n');
    state.chefTipAmber = false;
    state.chefTipTimer = 8;
  }
}

// ─── Component ───────────────────────────────────────────

export default function CompostCreator({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const topBarRef = useRef(null);
  const focusedItemRef = useRef(null);
  const [focusedItemLayout, setFocusedItemLayout] = useState(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const atlasRef = useRef(null);
  // Forces a React re-render at 5 Hz so the topBar progress chip stays in sync with the
  // canvas state (totalPlaced lives in stateRef which doesn't trigger React updates by itself).
  const [hudTick, setHudTick] = useState(0);

  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  // Pre-translate strings for canvas rendering
  const i18nRef = useRef(null);
  i18nRef.current = t;

  const { gameState, setGameState, score, timeLeft, stateRef } = useGameRoomCanvas(
    canvasRef,
    {
      timeLimit: null, // untimed

      setup: (state) => {
        if (state.player) return;

        initMissionIntro(state, t, missionIntroFor(t));

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

        // Select 12 items with at-least-1-per-bin coverage, place on stumps.
        const selected = pickSessionItems(WASTE_ITEMS, TOTAL_ITEMS);
        state.counterItems = selected.map((item, i) => ({
          ...item,
          name: t(item.nameKey),
          col: ROOM.counterPositions[i].col,
          row: ROOM.counterPositions[i].row,
          picked: false,
        }));

        state.floorItems = [];
        state.heldItem = null;
        state.actionPrompt = null;
        state.dropPrompt = null;
        state.qWasDown = false;
        state.particles = [];
        state.floatingTexts = [];
        state.screenShake = 0;
        state.screenShakeAmount = 0;

        // Bin placement tracking — one array per bin id.
        state.binItems = {};
        for (const bin of ROOM.bins) state.binItems[bin.id] = [];
        state.totalPlaced = 0;

        // Reveal phase
        state.revealing = false;
        state.revealIndex = 0;
        state.revealTimer = 0;
        state.revealList = [];
        state.confirmed = new Set(); // item ids already graded correct — never re-scored

        // Celebration
        state.celebrating = false;
        state.celebrateTimer = 0;

        // Chef tip
        state.chefTip = null;
        state.chefTipAmber = false;
        state.chefTipTimer = 0;

        // Sourced fact card (chef-ask) + Press-S / click plumbing.
        state.factCard = null;
        state.sourceBadgeRect = null;

        // Localised chef nameplate (renderer falls back to Greek if unset).
        state.chefName = t('compost.chef.name', 'Σεφ Κομπόστ');
      },

      update: (state, dt, keys, helpers) => {
        const strings = i18nRef.current;
        state.time += dt;
        state.timerPaused = false;

        // Screen shake decay
        if (state.screenShakeAmount > 0.5) {
          state.screenShake = Math.sin(state.time * 50) * state.screenShakeAmount;
          state.screenShakeAmount *= SCREEN_SHAKE_DECAY;
        } else {
          state.screenShake = 0;
          state.screenShakeAmount = 0;
        }

        // MissionIntroCard blocks input until dismissed. Iris
        // opens behind it (parity with FridgeManager) so it sits over the live backyard.
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

        // The sourced card is a real learning pause, dismissed deliberately with
        // Enter/Space. S and pointer access remain handled by the window/canvas listeners.
        if (state.factCard) {
          state.timerPaused = true;
          state.actionPrompt = null;
          state.dropPrompt = null;
          if (isEnterJustPressed(keys, state)) {
            state.factCard = null;
            state.sourceBadgeRect = null;
          }
          return;
        }

        // Update effects
        updateParticles(state, dt);
        updateFloatingTexts(state, dt);

        // Chef tip timer
        if (state.chefTipTimer > 0) {
          state.chefTipTimer -= dt;
          if (state.chefTipTimer <= 0) {
            state.chefTip = null;
          }
        }

        // ── Celebration ──
        if (state.celebrating) {
          state.celebrateTimer += dt;
          if (state.celebrateTimer > 1.5) {
            helpers.complete();
          }
          return;
        }

        // ── Reveal phase ──
        if (state.revealing) {
          state.revealTimer += dt;
          if (state.revealTimer >= REVEAL_INTERVAL) {
            state.revealTimer -= REVEAL_INTERVAL;
            revealNextItem(state, helpers, strings);

            if (state.revealIndex >= state.revealList.length) {
              state.revealing = false;

              // All 12 confirmed correct? Celebrate! (confirmed, not totalPlaced — a
              // retry round only adds the newly-correct items, never re-scores.)
              if (state.confirmed.size >= TOTAL_ITEMS) {
                state.celebrating = true;
                state.celebrateTimer = 0;
                // Gold sparkles centered on every bin
                for (const bin of ROOM.bins) {
                  const { bx: cx, by: cy } = binCenter(bin.id);
                  spawnSparkles(state, cx, cy, '#FFD700', 10);
                }
                spawnFloatingText(
                  state,
                  OX + 10 * TILE_SIZE,
                  OY + 5 * TILE_SIZE,
                  strings('compost.all_correct', 'Perfect!'),
                  '#FFD700',
                );
              }
            }
          }
          return; // block player input during reveal
        }

        // ── Player movement ──
        updatePlayerMovement(state.player, dt, keys, isWalkable);

        // Reset per-frame UI
        state.actionPrompt = null;
        state.focusedItem = null;
        state.nearChef = false;

        // Chef proximity (Manhattan distance ≤ 2 tiles) — flag so the renderer can pulse a glow.
        const chefDist = Math.abs(state.player.col - CHEF_POSITION.col)
          + Math.abs(state.player.row - CHEF_POSITION.row);
        if (chefDist <= 2) state.nearChef = true;

        // ── Prompt + interaction logic ──
        if (state.heldItem) {
          state.dropPrompt = strings('compost.drop_prompt', 'Press Q to put back');
          // While carrying, show the held item in the focused pill so the kid sees what they hold.
          state.focusedItem = state.heldItem;

          // Check proximity to any bin tile (tagged with its bin id)
          const allBinTiles = ROOM.bins.flatMap(b =>
            b.tiles.map(tt => ({ ...tt, binId: b.id, binLabelKey: COMPOST_BINS.find(cb => cb.id === b.id)?.labelKey })),
          );
          const nearBin = checkInteraction(state.player, allBinTiles, 1);
          if (nearBin) {
            const binLabel = binLabelText(strings(nearBin.binLabelKey) || nearBin.binId);
            state.actionPrompt = strings('compost.place_bin_prompt', { bin: binLabel })
              || `Press Enter or Space to place in ${binLabel}`;
          }
        } else {
          state.dropPrompt = null;
          // Check pickups: stump items
          const nearStump = checkInteraction(
            state.player,
            state.counterItems.filter(i => !i.picked),
            1,
          );
          if (nearStump) {
            state.actionPrompt = strings('compost.pickup_prompt', {
              item: itemTextLabel(nearStump, nearStump.name),
            });
            state.focusedItem = nearStump;
          } else {
            // Floor items (bounced back from reveal)
            const nearFloor = checkInteraction(state.player, state.floorItems, 1);
            if (nearFloor) {
              state.actionPrompt = strings('compost.floor_pickup_prompt', {
                item: itemTextLabel(nearFloor, nearFloor.name),
              });
              state.focusedItem = nearFloor;
            }
          }
        }

        // Chef Ask prompt — only when player is near chef and nothing more urgent is shown.
        // Works both while holding (contextual hint for that item) and idle (5-bin guide).
        if (state.nearChef && !state.actionPrompt) {
          state.actionPrompt = strings('compost.chef.ask_prompt', 'Πάτα Enter για βοήθεια');
        }

        // ── Enter key ──
        if (isEnterJustPressed(keys, state)) {
          // Priority 1: place item in bin (if holding + near bin)
          // Priority 2: pick up nearby item
          // Priority 3 (fallthrough): ask chef when near him
          let handled = false;
          if (state.heldItem) {
            const allBinTiles = ROOM.bins.flatMap(b =>
              b.tiles.map(tt => ({ ...tt, binId: b.id })),
            );
            const nearBin = checkInteraction(state.player, allBinTiles, 1);
            if (nearBin) {
              // Place item in bin (correctness checked later in reveal phase).
              state.binItems[nearBin.binId].push({ ...state.heldItem });
              state.totalPlaced++;

              // Blue sparkles centered on placement bin
              const { bx: cx, by: cy } = binCenter(nearBin.binId);
              spawnSparkles(state, cx, cy, '#64B5F6', 5);

              state.heldItem = null;
              state.dropPrompt = null;
              handled = true;

              // All 12 placed → start reveal!
              if (state.totalPlaced >= TOTAL_ITEMS) {
                startReveal(state);
              }
            }
          } else {
            // Pick up from stump
            const nearStump = checkInteraction(
              state.player,
              state.counterItems.filter(i => !i.picked),
              1,
            );
            if (nearStump) {
              nearStump.picked = true;
              state.heldItem = { ...nearStump };
              handled = true;
            } else {
              // Pick up from floor
              const nearFloor = checkInteraction(state.player, state.floorItems, 1);
              if (nearFloor) {
                state.floorItems = state.floorItems.filter(i => i !== nearFloor);
                state.heldItem = { ...nearFloor };
                handled = true;
              }
            }
          }

          // Fallthrough: ask chef (works whether or not player is holding something).
          if (!handled && state.nearChef) {
            askChef(state, strings);
          }
        }

        // ── Q key — drop held item back to stump ──
        const qDown = isDropKeyPressed(keys);
        const qJust = qDown && !state.qWasDown;
        state.qWasDown = qDown;
        if (qJust && state.heldItem) {
          const counterItem = state.counterItems.find(
            c => c.id === state.heldItem.id && c.picked,
          );
          if (counterItem) counterItem.picked = false;
          state.heldItem = null;
          state.dropPrompt = null;
        }
      },

      render: (ctx, state, helpers) => {
        if (!atlasRef.current) return;

        // Green backyard background (full canvas)
        ctx.fillStyle = '#81C784';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // ── Zoom into backyard ──
        applyRoomCamera(ctx, ROOM);

        // Screen shake
        const shake = state.screenShake || 0;
        if (shake) ctx.translate(shake, 0);

        // Base tiles (FLOOR_STONE → grey, overridden next)
        renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);

        // Custom overlays
        renderGrassOverlay(ctx, ROOM.map);
        renderTreeStumps(ctx, ROOM.map);
        renderGardenFence(ctx);
        renderGameRoomDecorations(ctx, ROOM);
        renderCompostBins(ctx, state, i18nRef.current, ROOM);
        renderStumpItems(ctx, state);
        renderFloorItems(ctx, state);
        renderGameRoomPlayer(ctx, state, atlasRef.current);
        renderCompostHeldItem(ctx, state, ROOM, renderHeldItem); // drawn clear of the bin labels
        renderChefNPC(ctx, state);
        renderChefTipBubble(ctx, state);
        renderParticles(ctx, state);
        renderFloatingTexts(ctx, state);

        releaseRoomCamera(ctx);

        // HUD (outside zoom)
        renderActionPrompt(ctx, state);
        renderDropPrompt(ctx, state);
        renderCompostFactCard(ctx, state, i18nRef.current);

        // Progress counter lives in the React top bar (see styles.topBarProgress).

        // Iris wipe
        if (state.irisOpenness < 1) {
          const px = OX + state.player.pixelX + TILE_SIZE / 2;
          const py = OY + state.player.pixelY + TILE_SIZE / 2;
          const { x: canvasX, y: canvasY } = roomToCanvas(ROOM, px, py);
          drawIrisWipe(ctx, canvasX, canvasY, state.irisOpenness, CANVAS_W, CANVAS_H);
        }

        // Intro card sits on top of everything, including the opening iris (FIX-D).
        renderMissionIntroCard(ctx, state);
      },

      onComplete: () => {},
    },
  );

  // Expose state for headless playtest (canvas._stateRef.current) — parity with FridgeManager.
  useEffect(() => {
    if (canvasRef.current) canvasRef.current._stateRef = stateRef;
  }, [atlasReady, stateRef]);

  // Source open via keyboard: press S while the intro card or a fact card is on
  // screen. Real keydown handler on WINDOW (WDIG pattern, FIX-F): survives the
  // canvas losing focus, works while the intro card pauses the update loop, and
  // window.open counts as a user gesture.
  // The pause flag lives in React state; the window listener reads it through a ref so the
  // shortcut never opens a source behind the pause overlay (review 01/10).
  const pausedRef = useRef(false);
  pausedRef.current = gameState === 'PAUSED';
  useEffect(() => {
    const onKey = (e) => {
      const srcId = sourceShortcutTarget(e, stateRef.current, { paused: pausedRef.current });
      if (srcId) window.open(`source.html?src=${srcId}`, '_blank', 'noopener');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Click the gold source chip to open the source (mouse parity with «Press S»):
  // the intro card's chip while it is up, the fact card's badge during play.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onPointerDown = (e) => {
      const st = stateRef.current;
      if (!st || pausedRef.current || st.exitConfirmOpen) return; // nothing opens behind an overlay
      const p = getCanvasPointer(canvas, e);
      // Touch: each intro chip is its own button. The hit area is padded around the drawn pill
      // (it is only 18 px tall, ~10 px on a phone), the two chips sit far apart, with the steps between them.
      const preId = missionIntroPreSourceId(st);
      if (preId && st.introPreSourceRect && hitTest(p, padIntroChip(st.introPreSourceRect))) {
        window.open(`source.html?src=${preId}`, '_blank', 'noopener');
        return;
      }
      const introId = missionIntroSourceId(st);
      if (introId && st.introSourceRect && hitTest(p, preId ? padIntroChip(st.introSourceRect) : st.introSourceRect)) {
        window.open(`source.html?src=${introId}`, '_blank', 'noopener');
        return;
      }
      if (st.factCard?.sourceId && st.sourceBadgeRect && hitTest(p, st.sourceBadgeRect)) {
        window.open(`source.html?src=${st.factCard.sourceId}`, '_blank', 'noopener');
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, [atlasReady, stateRef]);

  // Handle completion
  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const passed = score >= PASS_SCORE;
      const correct = stateRef.current.confirmed?.size || 0;
      setTimeout(() => onComplete(score, passed, {
        tier: correct >= TOTAL_ITEMS ? 'perfect' : (passed ? 'pass' : 'fail'),
        correct,
        total: TOTAL_ITEMS,
      }), 500);
    }
  }, [gameState]);

  // Auto-start on atlas ready
  useEffect(() => {
    if (atlasReady && gameState === 'INIT') {
      setGameState('PLAYING');
    }
  }, [atlasReady, gameState]);

  // Focus canvas for keyboard input
  useEffect(() => {
    if (atlasReady && canvasRef.current) {
      canvasRef.current.focus();
    }
  }, [atlasReady]);

  // Pulse the React tree at 5 Hz so the topBar progress chip mirrors stateRef.totalPlaced
  // without re-rendering on every animation frame.
  useEffect(() => {
    if (!atlasReady) return;
    const id = setInterval(() => setHudTick(t => t + 1), 200);
    return () => clearInterval(id);
  }, [atlasReady]);

  // The item name can include properties needed before choosing a bin. Keep it
  // outside the fenced playfield, using the actual letterbox and control bounds.
  useLayoutEffect(() => {
    const pill = focusedItemRef.current;
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    const bar = topBarRef.current;
    if (!pill || !canvas || !wrapper || !bar) return;
    pill.style.fontSize = styles.focusedItem.fontSize; // undo last item's shrink before measuring
    const regions = compostFocusedItemRegions({
      wrapper: wrapper.getBoundingClientRect(),
      canvas: canvas.getBoundingClientRect(),
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      hidpi: canvas.__hidpi,
      hud: bar.getBoundingClientRect(),
      controls: [...document.querySelectorAll('[data-touch-control]')]
        .map((control) => control.getBoundingClientRect()).filter((rect) => rect.width && rect.height),
    });
    const placement = placeCompostFocusedItem(regions, (width) => {
      pill.style.width = `${width}px`;
      return pill.getBoundingClientRect().height;
    });
    if (!placement) return;
    pill.style.width = `${placement.width}px`;
    // Words never break mid-word: shrink the font down to 12px until the longest word fits.
    for (let px = parseFloat(getComputedStyle(pill).fontSize); pill.scrollWidth > pill.clientWidth && px > 12; px -= 1) {
      pill.style.fontSize = `${px - 1}px`;
    }
    const rect = wrapper.getBoundingClientRect();
    const next = { left: placement.left - rect.left, top: placement.top - rect.top, width: placement.width, fits: placement.fits };
    setFocusedItemLayout((previous) => previous && Object.keys(next).every((key) => previous[key] === next[key]) ? previous : next);
  }, [hudTick, atlasReady, gameState]);

  useEffect(() => {
    const measure = () => setHudTick((tick) => tick + 1);
    const observer = new ResizeObserver(measure);
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    if (canvasRef.current) observer.observe(canvasRef.current);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const liveState = stateRef.current;
  const totalPlaced = liveState?.totalPlaced || 0;
  void hudTick;

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      {/* React top bar — score + progress + pause. Mirrors Season Matcher / Garden Planner. */}
      <div ref={topBarRef} style={styles.topBar}>
        {liveState?.revealing && (
          <div
            role="progressbar"
            aria-label={t('compost.progress_word', 'ταξινομημένα')}
            aria-valuemin={0}
            aria-valuemax={liveState.revealList.length}
            aria-valuenow={liveState.revealIndex}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: '#263b22' }}
          >
            <div style={{ height: '100%', background: '#9bdb67', width: `${100 * liveState.revealIndex / (liveState.revealList.length || 1)}%`, transition: 'width 0.2s ease' }} />
          </div>
        )}
        <span style={styles.topBarScore}>⭐ {score}</span>
        <span style={styles.topBarSep}>|</span>
        <span style={styles.topBarProgress}>
          🌱 {totalPlaced}/{TOTAL_ITEMS} {t('compost.progress_word', 'ταξινομημένα')}
        </span>
        <span style={styles.topBarSpacer} />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          style={styles.topBarPause}
          onClick={() => {
            // The guide renders above a paused fact and returns the child to that same card.
            const s = stateRef.current;
            if (!s) return;
            initMissionIntro(s, t, missionIntroFor(t));
          }}
        >
          📖 {t('game.instructions', 'Οδηγίες')}
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} style={styles.topBarPause} onClick={() => setGameState('PAUSED')}>
          ⏸ {t('game.pause', 'Παύση')}
        </button>
        <ExitConfirmButton
          onExit={() => onNavigate('hub')}
          onFreeze={(f) => { const s = stateRef.current; if (s) s.exitConfirmOpen = f; }}
          style={styles.topBarPause}
        />
      </div>

      {liveState?.focusedItem && !liveState.showMissionIntro && !liveState.revealing && !liveState.factCard && !liveState.exitConfirmOpen && gameState === 'PLAYING' && (
        <div ref={focusedItemRef} data-testid="compost-focused-item" data-fits={focusedItemLayout?.fits} style={{ ...styles.focusedItem, ...(focusedItemLayout ? { left: focusedItemLayout.left, top: focusedItemLayout.top, width: focusedItemLayout.width } : {}) }}>
          {hasDrawnIcon(liveState.focusedItem)
            ? <img src={MILK_CARTON_DATA_URL} alt="" aria-hidden="true" style={styles.focusedItemIcon} />
            : liveState.focusedItem.emoji}{' '}
          {liveState.focusedItem.name || t(liveState.focusedItem.nameKey)}
        </div>
      )}

      <div style={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          tabIndex={0}
          style={styles.canvas}
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
            initMissionIntro(state, t, missionIntroFor(t));
          }}
          onQuit={() => onNavigate('hub')}
        />
      )}
    </div>
  );
}

const styles = {
  // Full item properties wrap in the measured letterbox or side gutter.
  focusedItem: {
    position: 'absolute', top: 52, left: 8,
    width: 140, boxSizing: 'border-box', overflowWrap: 'normal', lineHeight: 1.25,
    padding: '6px 8px', borderRadius: 20, border: '2px solid #1B5E20',
    background: '#2E7D32', color: '#fff', fontSize: 'clamp(14px, 1.5vw, 20px)',
    fontWeight: 700, textAlign: 'center', pointerEvents: 'none', zIndex: 40,
  },
  // The drawn milk-carton icon sized like the emoji it stands in for.
  focusedItemIcon: { width: '1.15em', height: '1.15em', verticalAlign: '-0.2em' },
  wrapper: {
    position: 'relative', width: '100%', height: '100%',
    background: '#81C784', overflow: 'hidden',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  // Top bar follows Season Matcher / Garden Planner pattern: absolute over canvas,
  // 42px tall, sits above the fence row (row 0) so it never covers gameplay tiles.
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 42,
    display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16,
    background: 'linear-gradient(180deg, #4E342E 0%, #3E2723 100%)',
    color: '#fff', zIndex: 50,
    borderBottom: '2px solid rgba(0,0,0,0.25)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 700, fontSize: 14, letterSpacing: 0.2,
  },
  topBarScore: { color: '#FFD54F', fontSize: 16, textShadow: '1px 1px 2px rgba(0,0,0,0.45)' },
  topBarSep: { opacity: 0.45, fontWeight: 400 },
  topBarProgress: {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
    whiteSpace: 'nowrap', textShadow: '1px 1px 2px rgba(0,0,0,0.45)',
  },
  topBarSpacer: { flex: 1 },
  topBarPause: {
    fontSize: 13, fontWeight: 700, padding: '5px 14px', borderRadius: 16,
    background: 'rgba(0,0,0,0.28)', border: '1.5px solid rgba(255,255,255,0.35)',
    color: '#FFF8E1', cursor: 'pointer', fontFamily: 'inherit',
  },
  // Starts below the 42px top bar so the fence row and bin lids stay visible.
  canvasWrap: {
    position: 'absolute', inset: '42px 0 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#81C784', padding: 0,
  },
  canvas: {
    maxHeight: '100%', width: '100%', height: 'auto',
    aspectRatio: '1280 / 704',
    imageRendering: 'pixelated',
    outline: 'none',
    background: '#81C784',
  },
  loading: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#81C784', color: '#fff', fontSize: 24, zIndex: 100,
  },
};
