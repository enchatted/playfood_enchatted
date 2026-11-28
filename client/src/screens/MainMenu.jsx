import { useRef, useEffect, useState, useCallback } from 'react';
import { keyBelongsToDomTarget } from '../utils/keyOwnership.js';
import { useTranslation } from 'react-i18next';
import useGameStore from '../store/gameStore.js';
import useOverworldCanvas from '../games/hooks/useOverworldCanvas.js';
import { buildAtlas } from '../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H, TILE_SIZE, MOVE_DURATION, DIR } from '../overworld/overworldData.js';
import {
  HARBOR_PLAYER_START, isHarborWalkable, isNearCaptain, isNearBoat,
  SMALL_BOAT_POS, MAIN_SHIP_POS,
} from '../overworld/harborData.js';
import {
  HARBOR_SCALE, HARBOR_OX, HARBOR_OY,
  renderHarborBackground, renderHarborTiles, renderHarborBoats,
  renderHarborCaptain, renderHarborPlayer, renderHarborPrompt, renderHarborHUD,
  initHarborAmbient, updateHarborAmbient, renderHarborAmbient,
} from '../overworld/harborRenderer.js';
import { lerp, loadImage } from '../utils/canvas.js';
import DialogueBox from '../components/DialogueBox.jsx';

export default function MainMenu({ onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const points = useGameStore((s) => s.points);
  const gameStars = useGameStore((s) => s.gameStars);
  const [atlasReady, setAtlasReady] = useState(false);
  const atlasRef = useRef(null);

  const [brandLogoImg, setBrandLogoImg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadImage('/assets/logos/secondary-logo-white.svg')
      .then((img) => { if (!cancelled) setBrandLogoImg(img); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, []);

  // Dialogue state — Captain NPC interaction
  const [dialogueActive, setDialogueActive] = useState(false);
  const dialogueActiveRef = useRef(false);
  dialogueActiveRef.current = dialogueActive;

  // Boarding sequence — fade-to-black then navigate
  const boardingRef = useRef(false);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  // Pre-translate strings for canvas rendering
  const i18nRef = useRef({});
  i18nRef.current = {
    hubTitle: t('hub.harbor_title'),
    harborSubtitle: t('hub.harbor_subtitle'),
    talkPrompt: t('hub.talk_prompt'),
    boardPrompt: t('hub.board_prompt'),
    controlHint: t('hub.control_hint'),
    brandLogoImg,
  };

  // Dialogue lines (translated)
  const dialogueLines = [
    t('hub.intro_1'),
    t('hub.intro_2'),
    t('hub.intro_3'),
    t('hub.intro_board'),
  ];

  const handleDialogueComplete = useCallback(() => {
    setDialogueActive(false);
    boardingRef.current = true;
  }, []);

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

  const start = HARBOR_PLAYER_START;

  // Harbor game loop
  const { stateRef } = useOverworldCanvas(canvasRef, {
    setup: (state) => {
      state.player = {
        col: start.col,
        row: start.row,
        pixelX: start.col * TILE_SIZE,
        pixelY: start.row * TILE_SIZE,
        dir: start.dir ?? DIR.DOWN,
        moving: false,
        moveTimer: 0,
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
      };

      state.time = 0;
      state.nearCaptain = false;
      state.nearBoat = false;
      state.strings = i18nRef.current;
      state.fadeIn = 1.0;
      state.boardFade = 0;
      state.boarding = false;
      // Boarding state machine:
      //   none → walking → hop_in → sailing_out → arriving → fading
      state.boardPhase = 'none';
      state.boardTimer = 0;
      state.smallBoatX = SMALL_BOAT_POS.col * TILE_SIZE;
      state.smallBoatY = SMALL_BOAT_POS.row * TILE_SIZE;
      state.sailWaypoint = 0;     // 0=down, 1=right, 2=up to ship
      state.sailTargetX = 0;
      state.sailTargetY = 0;
      state.boatAngle = 0;        // radians, 0 = pointing UP
      state.hopProgress = 0;      // 0→1 during hop animations
      state.hopFromX = 0;
      state.hopFromY = 0;
      state.hopToX = 0;
      state.hopToY = 0;

      // Ambient living-diorama systems
      initHarborAmbient(state);
    },

    update: (state, dt, keys) => {
      state.time += dt;
      state.strings = i18nRef.current;

      // Ambient systems — always tick (world stays alive during fade)
      updateHarborAmbient(state, dt);

      // Fade-in
      if (state.fadeIn > 0) {
        state.fadeIn = Math.max(0, state.fadeIn - dt * 2);
      }

      // ─── Cinematic boarding (walk → board → sail → fade) ───

      // Trigger
      if (boardingRef.current && state.boardPhase === 'none') {
        state.boardPhase = 'walking';
        state.boarding = true;
      }

      // Phase 1: Auto-walk player to pier edge (col 13, row 8), face LEFT
      if (state.boardPhase === 'walking') {
        const p = state.player;
        const tx = 13 * TILE_SIZE;     // left column of dock
        const ty = 8 * TILE_SIZE;      // one row above captain
        const speed = 80;
        const ddx = tx - p.pixelX;
        const ddy = ty - p.pixelY;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);

        if (dist < 2) {
          p.pixelX = tx;
          p.pixelY = ty;
          p.dir = DIR.LEFT;
          p.moving = false;
          // Set up hop: pier edge → Chris-Craft
          state.boardPhase = 'hop_in';
          state.hopProgress = 0;
          state.hopFromX = tx;
          state.hopFromY = ty;
          state.hopToX = SMALL_BOAT_POS.col * TILE_SIZE;
          state.hopToY = SMALL_BOAT_POS.row * TILE_SIZE;
        } else {
          p.pixelX += (ddx / dist) * speed * dt;
          p.pixelY += (ddy / dist) * speed * dt;
          p.moving = true;
          p.moveTimer += dt;
          if (Math.abs(ddx) > Math.abs(ddy)) {
            p.dir = ddx > 0 ? DIR.RIGHT : DIR.LEFT;
          } else {
            p.dir = ddy > 0 ? DIR.DOWN : DIR.UP;
          }
        }
        return;
      }

      // Phase 2: Player hops from pier into the Chris-Craft (0.5s arc)
      if (state.boardPhase === 'hop_in') {
        state.hopProgress = Math.min(1, state.hopProgress + dt / 0.5);
        const t = state.hopProgress;
        const p = state.player;
        p.pixelX = lerp(state.hopFromX, state.hopToX, t);
        p.pixelY = lerp(state.hopFromY, state.hopToY, t) - Math.sin(Math.PI * t) * 22;
        p.moving = true;
        p.moveTimer += dt;

        if (t >= 1) {
          state.boardPhase = 'sailing_out';
          state.sailWaypoint = 0;
          state.boatAngle = 0;
        }
        return;
      }

      // Phase 3: Chris-Craft sails AROUND the pier (3-leg water route)
      //   Leg 0: DOWN to row 13.5 — clear below pier (pier ends row 11)
      //   Leg 1: RIGHT to 2 tiles LEFT of the ship — traverse the channel
      //   Leg 2: UP alongside the ship — pull up next to it
      if (state.boardPhase === 'sailing_out') {
        const alongsideCol = MAIN_SHIP_POS.col - 2;  // stop 2 tiles left of ship
        const waypoints = [
          { x: SMALL_BOAT_POS.col * TILE_SIZE, y: 13.5 * TILE_SIZE },       // below pier
          { x: alongsideCol * TILE_SIZE,        y: 13.5 * TILE_SIZE },       // across channel
          { x: alongsideCol * TILE_SIZE,        y: MAIN_SHIP_POS.row * TILE_SIZE }, // alongside ship
        ];
        const wp = waypoints[state.sailWaypoint];
        const speed = 70;
        const ddx = wp.x - state.smallBoatX;
        const ddy = wp.y - state.smallBoatY;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);

        // Store target for wake trail direction
        state.sailTargetX = wp.x;
        state.sailTargetY = wp.y;

        // Compute target heading from velocity: atan2(vx, -vy)
        if (dist > 1) {
          const targetAngle = Math.atan2(ddx, -ddy);
          let diff = targetAngle - state.boatAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          state.boatAngle += Math.sign(diff) * Math.min(Math.abs(diff), 5 * dt);
        }

        if (dist < 4) {
          state.smallBoatX = wp.x;
          state.smallBoatY = wp.y;
          if (state.sailWaypoint < waypoints.length - 1) {
            state.sailWaypoint++;
          } else {
            // Chris-Craft pulled up alongside — set up hop to ship
            state.boardPhase = 'hop_out';
            state.hopProgress = 0;
            state.hopFromX = state.smallBoatX;
            state.hopFromY = state.smallBoatY;
            state.hopToX = MAIN_SHIP_POS.col * TILE_SIZE;
            state.hopToY = MAIN_SHIP_POS.row * TILE_SIZE;
          }
        } else {
          state.smallBoatX += (ddx / dist) * speed * dt;
          state.smallBoatY += (ddy / dist) * speed * dt;
        }
        return;
      }

      // Phase 4: Player hops from Chris-Craft into the main ship (0.6s arc)
      if (state.boardPhase === 'hop_out') {
        state.hopProgress = Math.min(1, state.hopProgress + dt / 0.6);
        const t = state.hopProgress;
        const p = state.player;
        p.pixelX = lerp(state.hopFromX, state.hopToX, t);
        p.pixelY = lerp(state.hopFromY, state.hopToY, t) - Math.sin(Math.PI * t) * 26;
        p.dir = DIR.RIGHT;
        p.moving = true;
        p.moveTimer += dt;

        if (t >= 1) {
          state.boardPhase = 'fading';
        }
        return;
      }

      // Phase 4: Fade to black
      if (state.boardPhase === 'fading') {
        state.boardFade = Math.min(1, state.boardFade + dt / 1.5);
        if (state.boardFade >= 1) {
          boardingRef.current = false;
          onNavigateRef.current('hub');
        }
        return;
      }

      // Lock movement during dialogue
      if (dialogueActiveRef.current) return;

      const p = state.player;

      // ─── Movement ───────────────────────────────
      if (p.moving) {
        p.moveTimer += dt;
        const progress = Math.min(p.moveTimer / MOVE_DURATION, 1);
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

          if (isHarborWalkable(newCol, newRow)) {
            p.moving = true;
            p.moveTimer = 0;
            p.fromX = p.col * TILE_SIZE;
            p.fromY = p.row * TILE_SIZE;
            p.col = newCol;
            p.row = newRow;
            p.toX = newCol * TILE_SIZE;
            p.toY = newRow * TILE_SIZE;
          }
        }
      }

      // ─── Interaction detection ─────────────────
      state.nearCaptain = isNearCaptain(p.col, p.row, p.dir);
      state.nearBoat = isNearBoat(p.col, p.row, p.dir);
    },

    render: (ctx, state) => {
      if (!atlasRef.current) return;

      // 1. Background at native resolution
      renderHarborBackground(ctx);

      // 2. Zoomed world (2x scale, centered)
      ctx.save();
      ctx.translate(HARBOR_OX, HARBOR_OY);
      ctx.scale(HARBOR_SCALE, HARBOR_SCALE);
      ctx.imageSmoothingEnabled = false;
      renderHarborTiles(ctx, atlasRef.current, state.time);
      renderHarborAmbient(ctx, state, atlasRef.current);
      renderHarborBoats(ctx, atlasRef.current, state.time, state);
      renderHarborCaptain(ctx, atlasRef.current, state.time);
      if (state.boardPhase === 'none' || state.boardPhase === 'walking'
          || state.boardPhase === 'hop_in' || state.boardPhase === 'hop_out') {
        renderHarborPlayer(ctx, state, atlasRef.current);
      }
      ctx.restore();

      // 3. UI at native resolution
      if (!state.boarding) {
        renderHarborPrompt(ctx, state);
      }
      const totalStars = Object.values(gameStars).reduce((a, b) => a + b, 0);
      renderHarborHUD(ctx, state, points, i18nRef.current, totalStars);

      // 4. Fade-in overlay
      if (state.fadeIn > 0) {
        // var(--pf-purple) #533F8B decomposed for alpha fade
        ctx.fillStyle = `rgba(83,63,139,${state.fadeIn})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }

      // 5. Boarding fade-to-black
      if (state.boardFade > 0) {
        // var(--pf-purple) #533F8B decomposed for alpha fade
        ctx.fillStyle = `rgba(83,63,139,${state.boardFade})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }
    },
  });

  // Confirm key (Enter or Space) — talk to Captain or board the ship
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.repeat) return; // a held key must not re-fire the interaction
      if (keyBelongsToDomTarget(e)) return; // a focused button/input owns this key
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (dialogueActiveRef.current || boardingRef.current) return;

      if (stateRef.current.nearCaptain) {
        setDialogueActive(true);
      } else if (stateRef.current.nearBoat) {
        boardingRef.current = true;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigate]);

  return (
    <div style={styles.container}>
      {!atlasReady && <div style={styles.loading}>Loading...</div>}
      {/* Wrapper scopes absolute positioning to the canvas area */}
      <div style={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={styles.canvas}
          tabIndex={0}
        />
        {/* Language button — small HTML overlay */}
        <button
          onClick={() => onNavigate('lang')}
          style={styles.langBtn}
          title={t('menu.language')}
        >
          {'\uD83C\uDF10'} {t('menu.language')}
        </button>
      </div>
      {/* Captain dialogue overlay */}
      {dialogueActive && (
        <DialogueBox
          lines={dialogueLines}
          avatar={'\uD83E\uDDED'}
          onComplete={handleDialogueComplete}
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
  langBtn: {
    // Top-left of the HUD bar is empty; bottom-right sat under the touch A button (S21).
    position: 'absolute',
    top: 6,
    left: 10,
    fontSize: 13,
    fontWeight: 500,
    padding: '6px 16px',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: "'Fredoka', sans-serif",
    zIndex: 10,
  },
};
