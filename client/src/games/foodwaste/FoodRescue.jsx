import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas } from '../../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import {
  updatePlayerMovement, isEnterJustPressed, isDropKeyPressed,
  getFacingTile, TILE_SIZE, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomBackground, renderGameRoomTiles, renderGameRoomPlayer,
  renderGameRoomDecorations, renderHeldItem, renderFloorItems,
  renderActionPrompt, renderDropPrompt,
  renderParticles, renderFloatingTexts,
  spawnSparkles, updateParticles, updateFloatingTexts, spawnFloatingText,
  OX, OY,
  initHint, updateHint, renderHintOverlay,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
} from '../engine/gameRoomRenderer.js';
import {
  renderIndustrialWall, renderConveyorBelt, renderBeltItems,
  renderDonationCrate, renderCompostBin, renderTrashZone,
  renderBeltSpeedIndicator, renderSpeedUpFlash,
  renderRescueTipBanner, renderRescueStats,
} from '../engine/foodRescueRenderer.js';
import { drawIrisWipe, drawText, IRIS_DURATION } from '../../utils/canvas.js';
import { RESCUE_FOOD_POOL } from '../../data/foods.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * FoodRescue — "The Rescue Express"
 *
 * Walk-around conveyor belt action game. Food items scroll down a belt
 * toward the trash. Player grabs them and carries to Donation Crate
 * (good/ugly food) or Compost Bin (rotten food). Ugly food = DOUBLE points!
 */

const TIME_LIMIT = 90;
const POINTS_GOOD = 10;
const POINTS_UGLY = 20;
const POINTS_COMPOST = 5;
const POINTS_WRONG_BIN = -5;
const POINTS_TRASH = -10;
const PASS_THRESHOLD = 80;

const BELT_SPEED_INIT = 1.1;   // tiles/sec (gentle for kids)
const SPEED_INCREMENT = 0.15;
const SPEED_INTERVAL = 30;     // seconds between speed-ups
const SPAWN_INTERVAL_INIT = 3.0;
const SPAWN_INTERVAL_MIN = 1.4;
const COUNTDOWN_DURATION = 3;  // 3-2-1 warm-up seconds

const SCREEN_SHAKE_DECAY = 0.88;
const BELT_PUSH_RATE = 0.8; // seconds between belt push nudges (at speed 1x)
const INTERACTION_RADIUS = 1.2; // generous radius for moving belt items

const ROOM = GAME_ROOMS.FoodRescue;
const isWalkable = (col, row) => isGameRoomWalkable(ROOM, col, row);

// Belt columns set for quick lookup
const BELT_COL_SET = new Set(ROOM.beltCols);

// Weighted random pick: 50% good, 30% ugly, 20% rotten
const GOOD_POOL = RESCUE_FOOD_POOL.filter(f => f.quality === 'good');
const UGLY_POOL = RESCUE_FOOD_POOL.filter(f => f.quality === 'ugly');
const ROTTEN_POOL = RESCUE_FOOD_POOL.filter(f => f.quality === 'rotten');

function pickRandomItem() {
  const roll = Math.random();
  let pool;
  if (roll < 0.5) pool = GOOD_POOL;
  else if (roll < 0.8) pool = UGLY_POOL;
  else pool = ROTTEN_POOL;
  return pool[Math.floor(Math.random() * pool.length)];
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Find nearest belt item within generous radius of player's facing direction
function findNearestBeltItem(player, beltItems) {
  const facing = getFacingTile(player);
  let best = null;
  let bestDist = Infinity;

  for (const item of beltItems) {
    if (item.rescued || item.trashed) continue;
    const itemRow = Math.floor(item.pixelY / TILE_SIZE);

    // Check against facing tile (generous radius)
    const dist = Math.abs(item.col - facing.col) + Math.abs(itemRow - facing.row);
    if (dist <= INTERACTION_RADIUS && dist < bestDist) {
      bestDist = dist;
      best = item;
    }

    // Also check same tile as player
    if (item.col === player.col && itemRow === player.row && !best) {
      best = item;
      bestDist = 0;
    }
  }
  return best;
}

// Check if player is facing one of the given tile positions
function isFacingTiles(player, tiles) {
  const facing = getFacingTile(player);
  return tiles.some(t => t.col === facing.col && t.row === facing.row);
}

// ─── Component ───────────────────────────────────────────

export default function FoodRescue({ island, mission, missionId, onComplete, onNavigate }) {
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
    pickupPrompt: t('food_rescue.pickup_prompt', 'Press Enter to grab'),
    donatePrompt: t('food_rescue.donate_prompt', 'Press Enter to donate'),
    compostPrompt: t('food_rescue.compost_prompt', 'Press Enter to compost'),
    wrongBinDonate: t('food_rescue.wrong_bin_donate', 'This is rotten! Use the compost bin'),
    wrongBinCompost: t('food_rescue.wrong_bin_compost', 'This food is still good! Donate it'),
    speedUp: t('food_rescue.speed_up', 'SPEED UP!'),
    uglyButGood: t('food_rescue.ugly_but_good', 'Ugly but delicious! +20'),
    tipUglyFood: t('food_rescue.tip_ugly_food', 'Ugly food is perfectly safe to eat!'),
    tipRescueHero: t('food_rescue.tip_rescue_hero', "You're a food rescue hero!"),
    tipCompostRight: t('food_rescue.tip_compost_right', 'Rotten food makes great compost!'),
    dropPrompt: t('fridge.drop_prompt', 'Press Q to put back'),
  };

  const { gameState, setGameState, score, timeLeft, stateRef } = useGameRoomCanvas(
    canvasRef,
    {
      timeLimit: TIME_LIMIT,

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

        // Belt system
        state.beltItems = [];
        state.beltSpeed = BELT_SPEED_INIT;
        state.beltSpeedLevel = 0;
        state.spawnTimer = 0;
        state.spawnInterval = SPAWN_INTERVAL_INIT;
        state.beltAnimOffset = 0;
        state.nextItemId = 0;

        // Bins
        state.donationCount = 0;
        state.compostCount = 0;
        state.trashCount = 0;

        // Player state
        state.heldItem = null;
        state.floorItems = [];
        state.actionPrompt = null;
        state.dropPrompt = null;

        // Effects
        state.particles = [];
        state.floatingTexts = [];
        state.screenShake = 0;
        state.screenShakeAmount = 0;

        // Speed-up flash
        state.speedUpFlash = 0;
        state.speedUpText = '';

        // Tip banner
        state.tipBanner = null;
        state.tipBannerLife = 0;

        // Milestones
        state.firstUglyDonated = false;
        state.donationMilestone5 = false;

        // Belt push timer
        state.pushTimer = 0;

        // Countdown (3-2-1 before belt starts)
        state.countdown = COUNTDOWN_DURATION;
        state.countdownActive = true;

        // Tutorial hint
        initHint(state, 'foodrescue', t);
      },

      update: (state, dt, keys, helpers) => {
        const strings = i18nRef.current;
        state.time += dt;

        // Screen shake decay
        if (state.screenShakeAmount > 0.5) {
          state.screenShake = Math.sin(state.time * 50) * state.screenShakeAmount;
          state.screenShakeAmount *= SCREEN_SHAKE_DECAY;
        } else {
          state.screenShake = 0;
          state.screenShakeAmount = 0;
        }

        // Iris wipe open
        if (state.irisOpenness < 1) {
          state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
          return;
        }

        // Tutorial hint (blocks input + pauses timer while active)
        if (state.hintTimer > 0) {
          updateHint(state, dt, keys);
          state.timerPaused = true;
          return;
        }

        // 3-2-1 Countdown (player can move, belt is frozen)
        if (state.countdownActive) {
          state.countdown -= dt;
          if (state.countdown <= 0) {
            state.countdownActive = false;
            state.countdown = 0;
          }
          // Allow movement during countdown
          updatePlayerMovement(state.player, dt, keys, isWalkable);
          return;
        }

        // Update effects
        updateParticles(state, dt);
        updateFloatingTexts(state, dt);

        // Tip banner countdown
        if (state.tipBannerLife > 0) {
          state.tipBannerLife -= dt;
          if (state.tipBannerLife <= 0) {
            state.tipBanner = null;
          }
        }

        // Speed-up flash countdown
        if (state.speedUpFlash > 0) {
          state.speedUpFlash -= dt;
        }

        // ── Belt animation ──
        state.beltAnimOffset += state.beltSpeed * TILE_SIZE * dt;
        if (state.beltAnimOffset > TILE_SIZE) state.beltAnimOffset -= TILE_SIZE;

        // ── Speed escalation every SPEED_INTERVAL seconds ──
        const currentLevel = Math.floor(state.time / SPEED_INTERVAL);
        if (currentLevel > state.beltSpeedLevel) {
          state.beltSpeedLevel = currentLevel;
          state.beltSpeed += SPEED_INCREMENT;
          state.spawnInterval = Math.max(SPAWN_INTERVAL_MIN, state.spawnInterval - 0.3);
          state.speedUpFlash = 1.5;
          state.speedUpText = strings.speedUp;
        }

        // ── Spawn new belt items ──
        state.spawnTimer += dt;
        if (state.spawnTimer >= state.spawnInterval) {
          state.spawnTimer = 0;
          const template = pickRandomItem();
          // Alternate between belt columns
          const beltCol = ROOM.beltCols[state.nextItemId % ROOM.beltCols.length];
          state.beltItems.push({
            id: state.nextItemId++,
            baseId: template.baseId,
            emoji: template.emoji,
            quality: template.quality,
            labelKey: template.labelKey,
            pixelX: beltCol * TILE_SIZE + TILE_SIZE / 2,
            pixelY: ROOM.beltRowStart * TILE_SIZE,
            col: beltCol,
            rescued: false,
            trashed: false,
          });
        }

        // ── Move belt items downward ──
        const trashY = ROOM.beltRowEnd * TILE_SIZE;
        for (const item of state.beltItems) {
          if (item.rescued || item.trashed) continue;
          item.pixelY += state.beltSpeed * TILE_SIZE * dt;

          if (item.pixelY >= trashY) {
            item.trashed = true;
            if (item.quality === 'good' || item.quality === 'ugly') {
              helpers.addScore(POINTS_TRASH);
              state.trashCount++;
              // Screen shake + red flash for losing good food
              state.screenShakeAmount = 5;
              const tx = OX + item.pixelX;
              const ty = OY + trashY;
              spawnFloatingText(state, tx, ty, '-10', '#EF5350');
            }
            // Rotten falls: no penalty
          }
        }
        // Clean up trashed/rescued items
        state.beltItems = state.beltItems.filter(i => !i.trashed);

        // ── Belt push (player on belt gets nudged down) ──
        const p = state.player;
        const onBelt = BELT_COL_SET.has(p.col) && !p.moving;
        if (onBelt) {
          state.pushTimer += dt;
          const pushInterval = BELT_PUSH_RATE / state.beltSpeed;
          if (state.pushTimer >= pushInterval) {
            state.pushTimer = 0;
            const nextRow = p.row + 1;
            // Only push if walkable and not into trash zone bottom wall
            if (nextRow < 14 && isWalkable(p.col, nextRow) && !keys.has('arrowup') && !keys.has('w')) {
              p.moving = true;
              p.moveTimer = 0;
              p.dir = DIR.DOWN;
              p.fromX = p.col * TILE_SIZE;
              p.fromY = p.row * TILE_SIZE;
              p.row = nextRow;
              p.toX = p.col * TILE_SIZE;
              p.toY = nextRow * TILE_SIZE;
            }
          }
        } else {
          state.pushTimer = 0;
        }

        // ── Player movement ──
        updatePlayerMovement(p, dt, keys, isWalkable);

        // ── Prompt logic ──
        state.actionPrompt = null;
        state.dropPrompt = null;

        if (state.heldItem) {
          state.dropPrompt = strings.dropPrompt;

          // Check if near donation crate
          if (isFacingTiles(p, ROOM.donationTiles)) {
            if (state.heldItem.quality === 'rotten') {
              state.actionPrompt = strings.wrongBinDonate;
            } else {
              state.actionPrompt = strings.donatePrompt;
            }
          }
          // Check if near compost bin
          else if (isFacingTiles(p, ROOM.compostTiles)) {
            if (state.heldItem.quality === 'rotten') {
              state.actionPrompt = strings.compostPrompt;
            } else {
              state.actionPrompt = strings.wrongBinCompost;
            }
          }
        } else {
          // Check for belt item or floor item to grab
          const nearBelt = findNearestBeltItem(p, state.beltItems);
          if (nearBelt) {
            state.actionPrompt = strings.pickupPrompt;
          } else if (state.floorItems.length > 0) {
            const facing = getFacingTile(p);
            const nearFloor = state.floorItems.find(fi =>
              Math.abs(fi.col - facing.col) + Math.abs(fi.row - facing.row) <= 1
            );
            if (nearFloor) {
              state.actionPrompt = strings.pickupPrompt;
            }
          }
        }

        // ── Enter key interaction ──
        if (isEnterJustPressed(keys, state)) {
          if (state.heldItem) {
            // Try place in donation crate
            if (isFacingTiles(p, ROOM.donationTiles)) {
              const item = state.heldItem;
              const crateX = OX + 3.5 * TILE_SIZE;
              const crateY = OY + 4.5 * TILE_SIZE;

              if (item.quality === 'good') {
                helpers.addScore(POINTS_GOOD);
                state.donationCount++;
                spawnSparkles(state, crateX, crateY, '#66BB6A', 10);
                spawnFloatingText(state, crateX, crateY, '+10', '#66BB6A');
              } else if (item.quality === 'ugly') {
                helpers.addScore(POINTS_UGLY);
                state.donationCount++;
                spawnSparkles(state, crateX, crateY, '#FFD54F', 15);
                spawnFloatingText(state, crateX, crateY, '+20', '#FFD54F');
                // First ugly milestone
                if (!state.firstUglyDonated) {
                  state.firstUglyDonated = true;
                  state.tipBanner = strings.tipUglyFood;
                  state.tipBannerLife = 2.5;
                }
              } else {
                // Rotten in donation = wrong bin
                helpers.addScore(POINTS_WRONG_BIN);
                spawnSparkles(state, crateX, crateY, '#EF5350', 8);
                spawnFloatingText(state, crateX, crateY, '-5', '#EF5350');
              }
              state.heldItem = null;

              // 5 donations milestone
              if (state.donationCount === 5 && !state.donationMilestone5) {
                state.donationMilestone5 = true;
                state.tipBanner = strings.tipRescueHero;
                state.tipBannerLife = 2.5;
              }
            }
            // Try place in compost bin
            else if (isFacingTiles(p, ROOM.compostTiles)) {
              const item = state.heldItem;
              const binX = OX + 16.5 * TILE_SIZE;
              const binY = OY + 4.5 * TILE_SIZE;

              if (item.quality === 'rotten') {
                helpers.addScore(POINTS_COMPOST);
                state.compostCount++;
                spawnSparkles(state, binX, binY, '#81C784', 10);
                spawnFloatingText(state, binX, binY, '+5', '#81C784');
                // Compost tip on first correct compost
                if (state.compostCount === 1) {
                  state.tipBanner = strings.tipCompostRight;
                  state.tipBannerLife = 2.5;
                }
              } else {
                // Good/ugly in compost = wrong bin
                helpers.addScore(POINTS_WRONG_BIN);
                spawnSparkles(state, binX, binY, '#EF5350', 8);
                spawnFloatingText(state, binX, binY, '-5', '#EF5350');
              }
              state.heldItem = null;
            }
          } else {
            // Try grab from belt
            const nearBelt = findNearestBeltItem(p, state.beltItems);
            if (nearBelt) {
              nearBelt.rescued = true;
              state.heldItem = {
                id: nearBelt.id,
                emoji: nearBelt.emoji,
                quality: nearBelt.quality,
                labelKey: nearBelt.labelKey,
              };
              state.beltItems = state.beltItems.filter(i => i !== nearBelt);
            } else {
              // Try grab from floor
              const facing = getFacingTile(p);
              const nearFloor = state.floorItems.find(fi =>
                Math.abs(fi.col - facing.col) + Math.abs(fi.row - facing.row) <= 1
              );
              if (nearFloor) {
                state.floorItems = state.floorItems.filter(i => i !== nearFloor);
                state.heldItem = {
                  id: nearFloor.id,
                  emoji: nearFloor.emoji,
                  quality: nearFloor.quality,
                  labelKey: nearFloor.labelKey,
                };
              }
            }
          }
        }

        // ── Q key — drop held item to floor ──
        const qDown = isDropKeyPressed(keys);
        const qJust = qDown && !state.qWasDown;
        state.qWasDown = qDown;
        if (qJust && state.heldItem) {
          // Drop on player's current tile
          state.floorItems.push({
            ...state.heldItem,
            col: p.col,
            row: p.row,
          });
          state.heldItem = null;
          state.dropPrompt = null;
        }
      },

      render: (ctx, state, helpers) => {
        if (!atlasRef.current) return;

        // Background (industrial grey-blue)
        const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        bg.addColorStop(0, '#B0BEC5');
        bg.addColorStop(1, '#78909C');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // ── Zoom into room ──
        applyRoomCamera(ctx, ROOM);

        // Screen shake
        const shake = state.screenShake || 0;
        if (shake) ctx.translate(shake, 0);

        renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);
        renderIndustrialWall(ctx, t); // Pass t
        renderConveyorBelt(ctx, state);
        renderTrashZone(ctx, state, t); // Pass t
        renderDonationCrate(ctx, state, t); // Pass t
        renderCompostBin(ctx, state, t); // Pass t
        renderBeltItems(ctx, state);
        renderGameRoomDecorations(ctx, ROOM);
        renderFloorItems(ctx, state);
        renderGameRoomPlayer(ctx, state, atlasRef.current);
        renderHeldItem(ctx, state);
        renderParticles(ctx, state);
        renderFloatingTexts(ctx, state);

        releaseRoomCamera(ctx);

        // HUD elements at canvas scale
        renderActionPrompt(ctx, state);
        renderDropPrompt(ctx, state);
        renderBeltSpeedIndicator(ctx, state, t); // Pass t
        renderRescueStats(ctx, state);
        renderSpeedUpFlash(ctx, state);
        renderRescueTipBanner(ctx, state);

        // 3-2-1 Countdown overlay
        if (state.countdownActive && state.irisOpenness >= 1) {
          const num = Math.ceil(state.countdown);
          const label = num > 0 ? String(num) : '';
          const progress = 1 - (state.countdown % 1); // 0→1 within each second
          const scale = 1 + (1 - progress) * 0.6; // pulse: big→normal
          const alpha = Math.max(0.3, 1 - progress * 0.5);

          // Dim overlay
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          ctx.globalAlpha = 1;

          if (label) {
            ctx.save();
            ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
            ctx.scale(scale, scale);
            ctx.globalAlpha = alpha;

            drawText(ctx, label, 0, 0, {
              font: "bold 72px 'Inter', system-ui, sans-serif",
              color: '#FFD54F',
              align: 'center',
              baseline: 'middle',
            });

            ctx.restore();
            ctx.globalAlpha = 1;
          }
        }

        // Iris wipe
        if (state.irisOpenness < 1) {
          const px = OX + state.player.pixelX + TILE_SIZE / 2;
          const py = OY + state.player.pixelY + TILE_SIZE / 2;
          const { x: canvasX, y: canvasY } = roomToCanvas(ROOM, px, py);
          drawIrisWipe(ctx, canvasX, canvasY, state.irisOpenness, CANVAS_W, CANVAS_H);
        }

        // Tutorial hint overlay
        renderHintOverlay(ctx, state);
      },

      onComplete: () => {},
    },
  );

  // Handle completion → navigate to result screen
  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const passed = score >= PASS_THRESHOLD;
      setTimeout(() => onComplete(score, passed), 500);
    }
  }, [gameState]);

  // Auto-start
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

  const displayTime = timeLeft != null ? Math.ceil(timeLeft) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#78909C', overflow: 'hidden' }}>
      <ScoreBar
        score={score}
        timeLeft={displayTime}
        onPause={() => setGameState('PAUSED')}
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
    background: '#78909C', color: '#fff', fontSize: 24,
  },
};
