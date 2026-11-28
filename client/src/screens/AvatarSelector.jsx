import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useGameStore from '../store/gameStore.js';
import useOverworldCanvas from '../games/hooks/useOverworldCanvas.js';
import { HEROES } from '../overworld/heroes.js';
import { buildAtlas, buildHeroFrames } from '../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../overworld/overworldData.js';
import { IRIS_DURATION, getCanvasPointer, hitTest } from '../utils/canvas.js';
import {
  heroSlotRects, renderAvatarSelect, REST_CAMERA, targetCamera, easeCamera,
} from '../overworld/avatarSelectRenderer.js';

// Children who are sensitive to motion get the framing without the glide.
const PREFERS_REDUCED_MOTION = () =>
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * AvatarSelector — the canvas-based «choose your hero» ceremony.
 *
 * Onboarding flow: LanguageSelector → 'avatar' (this screen) → 'menu' (Harbor).
 * Fully immersive Canvas: a village-square plaza with the four heroes walking in
 * place. The screen irises IN on entry (masking the switch from the language
 * screen), pops a retro bio box on hover, and irises OUT onto the chosen hero
 * before dropping the player onto the harbor pier as that character.
 */
export default function AvatarSelector({ onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const setHero = useGameStore((s) => s.setHero);
  const [atlasReady, setAtlasReady] = useState(false);

  const atlasRef = useRef(null);
  const heroFramesRef = useRef(null);

  // Keep the latest onNavigate reachable from the RAF loop without re-running it.
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  // Pre-translate canvas strings (canvas can't read i18n live).
  const stringsRef = useRef({});
  stringsRef.current = {
    title: t('avatar.title'),
    subtitle: t('avatar.subtitle'),
    controlsLook: t('avatar.controls_look'),
    controlsChoose: t('avatar.controls_choose'),
    controlsKeyEnter: t('avatar.controls_key_enter'),
    controlsOr: t('avatar.controls_key_or'),
    controlsKeySpace: t('avatar.controls_key_space'),
    names: HEROES.map((h) => t(`hero.name_${h.id}`)),
    bios: HEROES.map((h) => t(`hero.bio_${h.id}`)),
  };

  // Build the tile atlas + per-hero frames once.
  useEffect(() => {
    atlasRef.current = buildAtlas();
    heroFramesRef.current = HEROES.map((h) => buildHeroFrames(h.id)); // [hero][dir][frame]
    setAtlasReady(true);
  }, []);

  const { stateRef } = useOverworldCanvas(canvasRef, {
    setup: (state) => {
      state.time = 0;
      state.phase = 'intro';          // intro → idle → selecting
      state.irisOpenness = 0;         // start black; opens in
      state.irisClosing = false;
      state.irisCx = CANVAS_W / 2;
      state.irisCy = CANVAS_H / 2;
      state.hoverIndex = -1;
      state.navigated = false;
      state.cam = { ...REST_CAMERA };
      state.slots = heroSlotRects(HEROES.length, state.cam);
    },
    update: (state, dt) => {
      state.time += dt;

      // Push in on whoever is being considered, then keep the hit zones under
      // what is actually on screen.
      const target = targetCamera(state.hoverIndex, HEROES.length);
      state.cam = PREFERS_REDUCED_MOTION() ? target : easeCamera(state.cam, target, dt);
      state.slots = heroSlotRects(HEROES.length, state.cam);

      if (state.irisClosing) {
        state.irisOpenness = Math.max(0, state.irisOpenness - dt / IRIS_DURATION);
        if (state.irisOpenness <= 0 && !state.navigated) {
          state.navigated = true;
          onNavigateRef.current('menu');
        }
      } else if (state.irisOpenness < 1) {
        state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
        if (state.irisOpenness >= 1 && state.phase === 'intro') state.phase = 'idle';
      }
    },
    render: (ctx, state) => {
      if (!atlasRef.current || !heroFramesRef.current) return;
      renderAvatarSelect(ctx, state, {
        atlas: atlasRef.current,
        heroFrames: heroFramesRef.current,
        heroes: HEROES,
        strings: stringsRef.current,
      });
    },
  });

  // Commit a hero: persist + start the iris close centred on that hero.
  const choose = (index) => {
    const state = stateRef.current;
    if (!state || state.phase !== 'idle') return;
    const slot = state.slots?.[index];
    if (!slot) return;
    setHero(HEROES[index].id);
    state.phase = 'selecting';
    state.irisClosing = true;
    state.hoverIndex = index;
    state.irisCx = slot.x + slot.width / 2;
    state.irisCy = slot.y + slot.height / 2;
  };

  // Mouse + keyboard interaction on the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const slotAt = (e) => {
      const state = stateRef.current;
      const slots = state?.slots || [];
      const p = getCanvasPointer(canvas, e);
      for (let i = 0; i < slots.length; i++) if (hitTest(p, slots[i])) return i;
      return -1;
    };

    // The camera moves the heroes under the pointer, so clearing the choice the
    // moment the cursor slips off would fight itself: the hero glides away, the
    // choice drops, the camera pulls back, the hero returns under the cursor.
    // A choice therefore only changes when the pointer reaches another hero.
    const onMove = (e) => {
      const state = stateRef.current;
      if (!state || state.phase !== 'idle') return;
      const hit = slotAt(e);
      if (hit >= 0) state.hoverIndex = hit;
      canvas.style.cursor = hit >= 0 ? 'pointer' : 'default';
    };
    const onLeave = () => {
      const state = stateRef.current;
      if (state) state.hoverIndex = -1;
      canvas.style.cursor = 'default';
    };
    const onDown = (e) => {
      const hit = slotAt(e);
      if (hit >= 0) choose(hit);
    };
    const onKey = (e) => {
      const state = stateRef.current;
      if (!state || state.phase !== 'idle') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const n = HEROES.length;
        const cur = state.hoverIndex < 0 ? (dir === 1 ? -1 : 0) : state.hoverIndex;
        state.hoverIndex = (cur + dir + n) % n;
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (state.hoverIndex >= 0) choose(state.hoverIndex);
      }
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateRef, setHero]);

  // Focus the canvas so keyboard selection works without a click first.
  useEffect(() => {
    if (atlasReady && canvasRef.current) canvasRef.current.focus();
  }, [atlasReady]);

  return (
    <div style={styles.container}>
      {!atlasReady && <div style={styles.loading}>…</div>}
      <div style={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={styles.canvas}
          tabIndex={0}
          aria-label={stringsRef.current.title}
        />
      </div>
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
    background: '#1A4A8E', // WORLD_ART.oceanDeep — matches the iris/backdrop
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
    fontFamily: 'system-ui, sans-serif',
    fontSize: 18,
  },
};
