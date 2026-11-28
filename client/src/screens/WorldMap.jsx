import { useRef, useEffect, useState } from 'react';
import { keyBelongsToDomTarget } from '../utils/keyOwnership.js';
import { useTranslation } from 'react-i18next';
import useGameStore from '../store/gameStore.js';
import useOverworldCanvas from '../games/hooks/useOverworldCanvas.js';
import { buildAtlas } from '../overworld/tileAtlas.js';
import { PLAYER_START, isNavigable, getDockIsland, isNearBuoy, isNearRecyclingDock, MAP_COLS, MAP_ROWS } from '../overworld/mapData.js';
import {
  CANVAS_W, CANVAS_H, TILE_SIZE, SAIL_DURATION,
  CAMERA_LERP, VIEW_COLS, VIEW_ROWS, VIEW_SCALE, DIR,
} from '../overworld/overworldData.js';
import {
  renderTileMap, renderMooringPosts, renderWaterTint, renderIslandEvolution, renderIslandSigns, renderBoat, renderDockPrompt, renderBuoyPrompt,
  renderHUD, renderVignette,
  initParticles, updateParticles, renderParticles, spawnWakeParticle,
  initDebris, spawnDebris, updateDebris, checkDebrisCollection, renderDebris,
  recycleTrash, renderRecyclingDockPrompt, renderRecyclingArrow,
  buildRecyclingRewardToast,
  initWhale, updateWhale, checkWhaleProximity, renderWhale,
  initToast, showToast, updateToast, renderToast,
  renderFinaleBeams, renderFinaleCall,
} from '../overworld/overworldRenderer.js';
import { initMerge, updateMerge, renderMerge } from '../overworld/finaleMerge.js';
import { lerp, drawIrisWipe, IRIS_DURATION, getCanvasPointer, hitTest } from '../utils/canvas.js';
import { isDemoBuild, isIslandLocked } from '../utils/demoMode.js';
import { BRAND } from '../styles/brandColors.js';
import { MapSoundDialog } from '../components/SoundControls.jsx';
import ExitOverlay from '../components/ExitOverlay.jsx';
import { isSoundEnabled, playSound } from '../utils/sound.js';
import { getBoatCapacityForTier, normalizeBoatTier } from '../data/boatUpgrades.js';

export function syncWorldBoatState(state, boatTier, storedCargo) {
  state.boatTier = normalizeBoatTier(boatTier);
  state.trashCapacity = getBoatCapacityForTier(state.boatTier);
  if (Number.isFinite(storedCargo)) {
    state.trashCargo = Math.max(0, Math.min(state.trashCapacity, Math.floor(storedCargo)));
    state.cargoFull = state.trashCargo >= state.trashCapacity;
  }
  return state;
}

export default function WorldMap({ onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const audioButtonRef = useRef(null);
  const completedMissions = useGameStore((s) => s.completedMissions);
  const points = useGameStore((s) => s.points);
  const gameStars = useGameStore((s) => s.gameStars);
  const finaleClaimed = useGameStore((s) => s.finaleClaimed);
  const boatPosition = useGameStore((s) => s.boatPosition);
  const boatTier = useGameStore((s) => s.boatTier);
  const trashCargo = useGameStore((s) => s.trashCargo);
  const setBoatPosition = useGameStore((s) => s.setBoatPosition);
  const setTrashCargo = useGameStore((s) => s.setTrashCargo);
  const addPoints = useGameStore((s) => s.addPoints);
  const whaleSpotted = useGameStore((s) => s.whaleSpotted);
  const setWhaleSpotted = useGameStore((s) => s.setWhaleSpotted);
  const recordRecycleTrip = useGameStore((s) => s.recordRecycleTrip);
  const [atlasReady, setAtlasReady] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [showSound, setShowSound] = useState(false);
  const atlasRef = useRef(null);

  // Refs for RAF-accessible store actions
  const addPointsRef = useRef(addPoints);
  addPointsRef.current = addPoints;
  const setWhaleSpottedRef = useRef(setWhaleSpotted);
  setWhaleSpottedRef.current = setWhaleSpotted;
  const whaleSpottedRef = useRef(whaleSpotted);
  whaleSpottedRef.current = whaleSpotted;
  const recordRecycleTripRef = useRef(recordRecycleTrip);
  recordRecycleTripRef.current = recordRecycleTrip;
  const boatTierRef = useRef(boatTier);
  boatTierRef.current = boatTier;
  const trashCargoRef = useRef(trashCargo);
  trashCargoRef.current = trashCargo;
  const setTrashCargoRef = useRef(setTrashCargo);
  setTrashCargoRef.current = setTrashCargo;

  // Grand Finale (12/12) — drives the map light-beams + the compass call-to-action.
  // Recomputed each render; the canvas render closure (re-captured every render by
  // useOverworldCanvas) picks up the flip the frame after Shift+F marks everything done.
  const totalCompleted = Object.values(completedMissions).reduce((s, a) => s + a.length, 0);
  const finaleActive = totalCompleted >= 12 && !finaleClaimed;

  // Pre-translate strings for canvas rendering
  const i18nRef = useRef({});
  i18nRef.current = {
    hubTitle: t('hub.title'),
    enterPrompt: t('hub.enter_prompt'),
    buoyPrompt: t('hub.buoy_prompt'),
    controlHint: t('hub.control_hint'),
    islandNames: {
      foodwaste: t('islands.foodwaste.name'),
      local: t('islands.local.name'),
      growing: t('islands.growing.name'),
      circular: t('islands.circular.name'),
      recycling: t('islands.recycling.name'),
    },
    debrisBonus: t('hub.debris_bonus'),
    whaleSpotted: t('hub.whale_spotted'),
    trashFull: t('hub.trash_full'),
    recyclePrompt: t('hub.recycle_prompt'),
    recycleEmpty: t('hub.recycle_empty'),
    recycleSuccess: (count, rewardPoints) => t('hub.recycle_success', {
      count, points: rewardPoints,
    }),
    recycleImpacts: t('hub.recycle_impacts', { returnObjects: true }),
    lockedPrompt: t('hub.locked_prompt'),
    lockedToast: t('hub.locked_toast'),
    exitLabel: t('exit.button'),
    finaleCall: t('hub.finale_call'),
    finaleToast: t('hub.finale_toast'),
    bannerWaste1: t('hub.banner_waste_1'),
    bannerWaste2: t('hub.banner_waste_2'),
    bannerEatLocal: t('hub.banner_eat_local'),
    bannerCo2: t('hub.banner_co2'),
    bannerRecycle: t('hub.banner_recycle'),
  };

  // Build tile atlas once
  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  // Auto-focus canvas
  useEffect(() => {
    if (atlasReady && canvasRef.current) {
      canvasRef.current.focus();
    }
  }, [atlasReady]);

  // Resolve starting position — persisted boatPosition or default
  const startCol = boatPosition?.col ?? PLAYER_START.col;
  const startRow = boatPosition?.row ?? PLAYER_START.row;

  // Overworld game loop
  const { stateRef } = useOverworldCanvas(canvasRef, {
    setup: (state) => {
      state.player = {
        col: startCol,
        row: startRow,
        pixelX: startCol * TILE_SIZE,
        pixelY: startRow * TILE_SIZE,
        dir: DIR.DOWN,
        moving: false,
        moveTimer: 0,
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
      };

      state.camera = {
        x: startCol * TILE_SIZE - (VIEW_COLS * TILE_SIZE) / 2 + TILE_SIZE / 2,
        y: startRow * TILE_SIZE - (VIEW_ROWS * TILE_SIZE) / 2 + TILE_SIZE / 2,
      };

      state.time = 0;
      state.nearDock = null;
      state.nearBuoy = false;
      state.strings = i18nRef.current;
      state.irisOpenness = 0;   // 0 = closed (black), 1 = fully open
      state.irisClosing = false; // true when exiting via dock

      initParticles(state);
      initDebris(state);
      syncWorldBoatState(state, boatTierRef.current, trashCargoRef.current);
      state.nearRecyclingDock = false;
      initWhale(state);
      initToast(state);

      // Grand Finale island-merge cinematic — armed when the player has just claimed
      // the certificate inside the Lighthouse and been routed back here. Plays once,
      // then hands off to the CertificateScreen (see finaleMerge.js + update below).
      state.finaleMerge = useGameStore.getState().finaleMerging ? initMerge() : null;
    },

    update: (state, dt, keys) => {
      if (showSound) return;
      state.time += dt;
      state.strings = i18nRef.current;
      syncWorldBoatState(state, boatTierRef.current);

      // Iris wipe animation
      if (state.irisClosing) {
        state.irisOpenness = Math.max(0, state.irisOpenness - dt / IRIS_DURATION);
      } else if (state.irisOpenness < 1) {
        state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
      }

      // Block input while iris is closing
      if (state.irisClosing) return;

      // ─── Grand Finale island-merge cinematic ────
      // Freezes the map while the 4 islands converge + bloom, then opens the certificate.
      if (state.finaleMerge) {
        updateMerge(state, dt);
        if (state.finaleMerge.done && !state.finaleMerge.navigated) {
          state.finaleMerge.navigated = true;
          useGameStore.getState().endFinaleMerge();
          onNavigate('certificate', {});
        }
        return;
      }

      const p = state.player;

      // ─── Movement ───────────────────────────────
      if (p.moving) {
        p.moveTimer += dt;
        const progress = Math.min(p.moveTimer / SAIL_DURATION, 1);
        p.pixelX = lerp(p.fromX, p.toX, progress);
        p.pixelY = lerp(p.fromY, p.toY, progress);

        if (progress >= 1) {
          p.pixelX = p.toX;
          p.pixelY = p.toY;
          p.moving = false;
        }
      }

      if (!p.moving) {
        let dx = 0, dy = 0, dir = p.dir;

        if (keys.has('arrowup') || keys.has('w') || keys.has('keyw')) {
          dy = -1; dir = DIR.UP;
        } else if (keys.has('arrowdown') || keys.has('s') || keys.has('keys')) {
          dy = 1; dir = DIR.DOWN;
        } else if (keys.has('arrowleft') || keys.has('a') || keys.has('keya')) {
          dx = -1; dir = DIR.LEFT;
        } else if (keys.has('arrowright') || keys.has('d') || keys.has('keyd')) {
          dx = 1; dir = DIR.RIGHT;
        }

        if (dx !== 0 || dy !== 0) {
          p.dir = dir;
          const newCol = p.col + dx;
          const newRow = p.row + dy;

          if (isNavigable(newCol, newRow)) {
            p.moving = true;
            p.moveTimer = 0;
            p.fromX = p.col * TILE_SIZE;
            p.fromY = p.row * TILE_SIZE;
            p.col = newCol;
            p.row = newRow;
            p.toX = newCol * TILE_SIZE;
            p.toY = newRow * TILE_SIZE;

            // Wake particles behind boat
            spawnWakeParticle(state, p.fromX + TILE_SIZE / 2, p.fromY + TILE_SIZE / 2);
          }
        }
      }

      // ─── Dock detection ─────────────────────────
      state.nearDock = getDockIsland(p.col, p.row);

      // ─── Buoy detection ─────────────────────────
      state.nearBuoy = isNearBuoy(p.col, p.row);

      // ─── Camera follow ──────────────────────────
      const targetCamX = p.pixelX - (VIEW_COLS * TILE_SIZE) / 2 + TILE_SIZE / 2;
      const targetCamY = p.pixelY - (VIEW_ROWS * TILE_SIZE) / 2 + TILE_SIZE / 2;

      state.camera.x += (targetCamX - state.camera.x) * CAMERA_LERP;
      state.camera.y += (targetCamY - state.camera.y) * CAMERA_LERP;

      const maxCamX = MAP_COLS * TILE_SIZE - VIEW_COLS * TILE_SIZE;
      const maxCamY = MAP_ROWS * TILE_SIZE - VIEW_ROWS * TILE_SIZE;
      state.camera.x = Math.max(0, Math.min(maxCamX, state.camera.x));
      state.camera.y = Math.max(0, Math.min(maxCamY, state.camera.y));

      // ─── Particles ──────────────────────────────
      updateParticles(state, dt);

      // ─── Floating Debris + Trash Cargo ──────────────
      spawnDebris(state, completedMissions);
      updateDebris(state, dt);
      if (checkDebrisCollection(state)) {
        setTrashCargoRef.current(state.trashCargo);
        playSound('pickup');
      }
      // Cargo full notification (once per fill)
      if (state.cargoFull && Math.abs(state.cargoFullFlashTime - state.time) < dt * 2) {
        // Functional warning red — kept separate from BRAND.red pillar identity
        showToast(state, state.strings.trashFull, '#F44336');
      }

      // ─── Recycling dock detection ──────────────────
      state.nearRecyclingDock = isNearRecyclingDock(p.col, p.row);

      // ─── Whale ────────────────────────────────────
      updateWhale(state, dt);
      if (!whaleSpottedRef.current && checkWhaleProximity(state)) {
        setWhaleSpottedRef.current();
        addPointsRef.current(50);
        showToast(state, state.strings.whaleSpotted, BRAND.blue);
      }

      // ─── Toast ────────────────────────────────────
      updateToast(state, dt);
    },

    render: (ctx, state) => {
      if (!atlasRef.current) return;

      ctx.save();
      ctx.scale(VIEW_SCALE, VIEW_SCALE);
      ctx.imageSmoothingEnabled = false;
      renderTileMap(ctx, state, atlasRef.current);
      renderWaterTint(ctx, state, completedMissions);
      renderIslandEvolution(ctx, state, completedMissions);
      if (finaleActive) renderFinaleBeams(ctx, state); // warm beams islands → lighthouse
      renderIslandSigns(ctx, state, completedMissions);
      renderMooringPosts(ctx, state);   // posts stand in the water, so the boat passes in front
      renderDebris(ctx, state);
      renderParticles(ctx, state);
      renderWhale(ctx, state);
      renderBoat(ctx, state, atlasRef.current);
      ctx.restore();

      // Native-resolution UI
      renderDockPrompt(ctx, state);
      // The buoy's legacy "Press Enter to enter a code" prompt is hidden during the
      // finale — the compass call already directs the player to the Lighthouse.
      if (!finaleActive) renderBuoyPrompt(ctx, state);
      renderRecyclingDockPrompt(ctx, state);
      renderRecyclingArrow(ctx, state);
      renderVignette(ctx);
      const totalStars = Object.values(gameStars).reduce((a, b) => a + b, 0);
      renderHUD(
        ctx,
        state,
        points,
        completedMissions,
        i18nRef.current,
        totalStars,
        finaleActive,
        isSoundEnabled(),
      );
      // Keep the native button exactly over the speaker painted by the responsive HUD.
      const rect = state.audioButtonRect;
      if (rect && audioButtonRef.current) {
        const bounds = `${rect.x},${rect.y},${rect.width},${rect.height}`;
        if (state.audioBounds !== bounds) {
          state.audioBounds = bounds;
          Object.assign(audioButtonRef.current.style, {
            left: `${100 * rect.x / CANVAS_W}%`, top: `${100 * rect.y / CANVAS_H}%`,
            width: `${100 * rect.width / CANVAS_W}%`, height: `${100 * rect.height / CANVAS_H}%`,
          });
        }
      }
      if (finaleActive) renderFinaleCall(ctx, state, i18nRef.current); // compass call-to-action
      renderToast(ctx, state);

      // Grand Finale merge cinematic — full-screen, above the HUD, below the iris.
      if (state.finaleMerge) renderMerge(ctx, state);

      // Iris wipe overlay (centered on boat)
      const p = state.player;
      const irisCx = (p.pixelX - state.camera.x + TILE_SIZE / 2) * VIEW_SCALE;
      const irisCy = (p.pixelY - state.camera.y + TILE_SIZE / 2) * VIEW_SCALE;
      drawIrisWipe(ctx, irisCx, irisCy, state.irisOpenness, CANVAS_W, CANVAS_H);
    },
  });

  // Dev/test parity with the mini-games: automated browser checks can inspect
  // the live canvas state without reaching through React internals. Vite removes
  // this branch from production builds.
  useEffect(() => {
    if (!import.meta.env.DEV || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    canvas._stateRef = stateRef;
    return () => { delete canvas._stateRef; };
  }, [atlasReady, stateRef]);

  // Confirm key (Enter or Space) — dock at island or interact with buoy.
  // Stands down while the exit overlay is open: a press meant for the overlay's
  // buttons must not dock the boat or dump trash underneath it.
  useEffect(() => {
    if (showExit || showSound) return undefined;
    const handleKeyDown = (e) => {
      if (e.repeat) return; // a held key must not re-fire the interaction
      if (keyBelongsToDomTarget(e)) return; // a focused button/input owns this key
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (stateRef.current.finaleMerge) return; // map is frozen during the merge cinematic

      if (stateRef.current.nearDock) {
        const s = stateRef.current;
        if (s.irisClosing) return;

        // Recycling island — dump trash, don't navigate
        if (s.nearDock === 'recycling') {
          if (s.trashCargo <= 0) {
            // Functional disabled grey — semantic empty-state, not chrome
            showToast(s, s.strings.recycleEmpty, '#757575');
            return;
          }
          const { recycled, points: recyclePts } = recycleTrash(s);
          setTrashCargoRef.current(0);
          playSound('success');
          addPointsRef.current(recyclePts);
          const trips = (useGameStore.getState().recycleTrips || 0) + 1;
          recordRecycleTripRef.current(recycled);
          const rewardToast = buildRecyclingRewardToast(s.strings, recycled, recyclePts, trips);
          showToast(s, rewardToast.text, BRAND.green, rewardToast);
          return;
        }

        // Demo build — Islands 2-4 are padlocked; the boat cannot dock there.
        if (isIslandLocked(s.nearDock)) {
          // Functional disabled grey — same semantic as the empty-recycle toast.
          showToast(s, s.strings.lockedToast, '#757575');
          return;
        }

        // Normal island dock — iris wipe + navigate
        s.irisClosing = true;
        const p = s.player;
        setBoatPosition({ col: p.col, row: p.row });
        const targetIsland = s.nearDock;
        setTimeout(() => {
          onNavigate('island', { island: targetIsland });
        }, IRIS_DURATION * 1000 + 80);
      } else if (stateRef.current.nearBuoy) {
        // Buoy = the central lighthouse: enter the Trophy Hall interior.
        // (QR phygital redemption now lives INSIDE the lighthouse room.)
        const s = stateRef.current;
        if (s.irisClosing) return;
        s.irisClosing = true;
        setTimeout(() => onNavigate('lighthouse', {}), IRIS_DURATION * 1000 + 80);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigate, setBoatPosition, showExit, showSound]);

  // DEV-only Grand Finale review hook — Shift + F mocks getTotalCompleted() === 12
  // (marks every mission done, full stars, re-arms the finale) so the map reaction,
  // compass call, ceremony and certificate can be reviewed without a 12-game playthrough.
  // import.meta.env.DEV is statically false in production, so this effect is tree-shaken
  // out of the shipped bundle.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const onKey = (e) => {
      if (!e.shiftKey || (e.key !== 'F' && e.key !== 'f')) return;
      e.preventDefault();
      useGameStore.getState().debugCompleteAll();
      const s = stateRef.current;
      if (s) showToast(s, s.strings.finaleToast, BRAND.orange);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // DEMO-only presenter hook — typing the word "finale" on the map mocks
  // getTotalCompleted() === 12, mirroring the DEV Shift+F above. Shift+F is
  // tree-shaken out of production builds, so the hosted demo needs its own
  // trigger; a typed word cannot collide with browser shortcuts or be hit
  // by accident. Guarded by isDemoBuild(): absent from the normal release.
  useEffect(() => {
    if (!isDemoBuild()) return undefined;
    let buffer = '';
    const onKey = (e) => {
      if (e.key.length !== 1) return; // letters only; ignore Shift/Arrow/etc.
      buffer = (buffer + e.key.toLowerCase()).slice(-6);
      if (buffer !== 'finale') return;
      buffer = '';
      useGameStore.getState().debugCompleteAll();
      const s = stateRef.current;
      if (s) showToast(s, s.strings.finaleToast, BRAND.orange);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Canvas HUD controls — hover highlight + click/touch. renderHUD publishes
  // both rects each frame, so visuals and hit zones share the same geometry.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (e) => {
      const state = stateRef.current;
      if (!state) return;
      const pointer = getCanvasPointer(canvas, e);
      const overExit = state.exitButtonRect && hitTest(pointer, state.exitButtonRect);
      const overRecycle = state.recyclingPromptRect
        && hitTest(pointer, state.recyclingPromptRect);
      state.exitButtonHover = Boolean(overExit);
      canvas.style.cursor = overExit || overRecycle ? 'pointer' : 'default';
    };
    const onDown = (e) => {
      const state = stateRef.current;
      if (!state) return;
      const pointer = getCanvasPointer(canvas, e);
      if (state.recyclingPromptRect && hitTest(pointer, state.recyclingPromptRect)) {
        e.preventDefault();
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        }));
        window.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        }));
        canvas.focus();
        return;
      }
      if (state.exitButtonRect && hitTest(pointer, state.exitButtonRect)) {
        e.preventDefault();
        setShowExit(true);
      }
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('touchstart', onDown);
    };
  }, []);

  // Escape does whatever the visible Exit does. The island rooms and the
  // lighthouse already work this way; the map was the one screen showing an
  // Exit that ignored the key. While the overlay is open it owns Escape as
  // "keep playing", so this listener stands down rather than fight it.
  useEffect(() => {
    if (showExit || showSound) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setShowExit(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showExit, showSound]);

  return (
    <div style={styles.container}>
      {!atlasReady && (
        <div style={styles.loading}>Loading...</div>
      )}
      {/* Wrapper scopes absolute positioning to the canvas area */}
      <div style={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={styles.canvas}
          tabIndex={0}
        />
        <button ref={audioButtonRef} type="button" className="pf-map-audio-key"
          aria-label={t('audio.title')} title={t('audio.title')} aria-haspopup="dialog"
          onPointerEnter={() => { stateRef.current.audioButtonHover = true; }}
          onPointerLeave={() => { stateRef.current.audioButtonHover = false; }}
          onClick={() => setShowSound(true)} />
      </div>
      {showSound && <MapSoundDialog onClose={() => {
        setShowSound(false);
        canvasRef.current?.focus();
      }} />}
      {/* Exit overlay */}
      {showExit && (
        <ExitOverlay
          onNavigateToStart={() => { setShowExit(false); onNavigate('lang'); }}
          onKeepPlaying={() => setShowExit(false)}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1A4A8E', // WORLD_ART.oceanDeep — matches canvas backdrop
    position: 'relative',
    overflow: 'hidden',
  },
  canvasWrapper: {
    position: 'relative',
    width: '100%',
    maxHeight: '100vh',
    aspectRatio: '1280 / 704',
  },
  canvas: {
    width: '100%',
    height: '100%',
    imageRendering: 'pixelated',
    display: 'block',
    touchAction: 'none',
    outline: 'none',
  },
  loading: {
    position: 'absolute',
    color: '#fff',
    fontSize: 24,
    fontFamily: "'Fredoka', sans-serif",
  },
};
