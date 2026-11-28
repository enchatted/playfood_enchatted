import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useGameCanvas from '../hooks/useGameCanvas.js';
import { drawRoundedRect, drawText, hitTest, getCanvasPointer } from '../../utils/canvas.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * RecycleRush — Circular Economy Island, Mission 4
 *
 * Mechanic: Timed sorting — items appear, click the correct bin
 * 5 bins: Paper, Plastic, Glass, Organic, General
 * 90 seconds, +10 correct, -5 wrong, speed escalation
 * Pass: score >= 60
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;
const TIME_LIMIT = 90;
const POINTS_CORRECT = 10;
const POINTS_WRONG = -5;
const PASS_SCORE = 60;
const SPAWN_INTERVAL_START = 2.5;
const SPAWN_INTERVAL_MIN = 1.0;
const FALL_SPEED_START = 60;
const FALL_SPEED_MAX = 140;

const BINS = [
  { id: 'paper',   emoji: '📄', color: '#42A5F5', labelKey: 'recycle.bin_paper' },
  { id: 'plastic', emoji: '🧴', color: '#FFA726', labelKey: 'recycle.bin_plastic' },
  { id: 'glass',   emoji: '🫙', color: '#66BB6A', labelKey: 'recycle.bin_glass' },
  { id: 'organic', emoji: '🍂', color: '#8D6E63', labelKey: 'recycle.bin_organic' },
  { id: 'general', emoji: '🗑️', color: '#78909C', labelKey: 'recycle.bin_general' },
];

const WASTE_ITEMS = [
  // Paper
  { emoji: '📰', nameKey: 'recycle.newspaper',     bin: 'paper' },
  { emoji: '📦', nameKey: 'recycle.cardboard_box',  bin: 'paper' },
  { emoji: '📄', nameKey: 'recycle.paper_sheet',    bin: 'paper' },
  { emoji: '📕', nameKey: 'recycle.old_magazine',   bin: 'paper' },
  // Plastic
  { emoji: '🧴', nameKey: 'recycle.plastic_bottle', bin: 'plastic' },
  { emoji: '🥤', nameKey: 'recycle.plastic_cup',    bin: 'plastic' },
  { emoji: '🛍️', nameKey: 'recycle.plastic_bag',    bin: 'plastic' },
  // Glass
  { emoji: '🫙', nameKey: 'recycle.glass_jar',      bin: 'glass' },
  { emoji: '🍾', nameKey: 'recycle.glass_bottle',   bin: 'glass' },
  { emoji: '🥃', nameKey: 'recycle.broken_glass',   bin: 'glass' },
  // Organic
  { emoji: '🍌', nameKey: 'recycle.banana_peel',    bin: 'organic' },
  { emoji: '🍎', nameKey: 'recycle.apple_core',     bin: 'organic' },
  { emoji: '🥬', nameKey: 'recycle.veggie_scraps',  bin: 'organic' },
  { emoji: '☕', nameKey: 'recycle.coffee_grounds',  bin: 'organic' },
  // General
  { emoji: '🔋', nameKey: 'recycle.battery',        bin: 'general' },
  { emoji: '💡', nameKey: 'recycle.light_bulb',     bin: 'general' },
  { emoji: '🧽', nameKey: 'recycle.sponge',         bin: 'general' },
];

export default function RecycleRush({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [introCountdown, setIntroCountdown] = useState(3);

  const i18nRef = useRef({});
  i18nRef.current = {
    title: t('recycle.title'),
  };

  const { gameState, setGameState, score, setScore, gameObjects, timeLeft } = useGameCanvas(
    canvasRef,
    {
      timeLimit: TIME_LIMIT,
      setup: (objects) => {
        // Bin layout at bottom
        const binW = 200;
        const binH = 100;
        const binGap = 16;
        const totalW = BINS.length * binW + (BINS.length - 1) * binGap;
        const binStartX = (CANVAS_W - totalW) / 2;
        const binY = CANVAS_H - binH - 10;

        const bins = BINS.map((b, i) => ({
          ...b,
          label: t(b.labelKey),
          x: binStartX + i * (binW + binGap),
          y: binY,
          width: binW,
          height: binH,
          flash: 0,
          flashColor: null,
        }));

        // Pre-translate item names
        const items = WASTE_ITEMS.map((w) => ({
          ...w,
          name: t(w.nameKey),
        }));

        objects.push({
          bins,
          items,
          fallingItems: [],
          spawnTimer: 1.0, // first spawn after 1s
          spawnInterval: SPAWN_INTERVAL_START,
          fallSpeed: FALL_SPEED_START,
          elapsed: 0,
          correctCount: 0,
          wrongCount: 0,
          activeItem: null, // the current item to sort (topmost)
        });
      },

      update: (objects, dt, helpers) => {
        const state = objects[0];
        if (!state) return;

        state.elapsed += dt;

        // Speed escalation
        const progress = state.elapsed / TIME_LIMIT;
        state.spawnInterval = SPAWN_INTERVAL_START - progress * (SPAWN_INTERVAL_START - SPAWN_INTERVAL_MIN);
        state.fallSpeed = FALL_SPEED_START + progress * (FALL_SPEED_MAX - FALL_SPEED_START);

        // Bin flash decay
        for (const bin of state.bins) {
          if (bin.flash > 0) bin.flash = Math.max(0, bin.flash - dt * 3);
        }

        // Spawn new items
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          state.spawnTimer = state.spawnInterval;
          const template = state.items[Math.floor(Math.random() * state.items.length)];
          const laneW = CANVAS_W - 200;
          state.fallingItems.push({
            ...template,
            x: 100 + Math.random() * laneW,
            y: -40,
            speed: state.fallSpeed * (0.8 + Math.random() * 0.4),
            sorted: false,
          });
        }

        // Move falling items
        for (const item of state.fallingItems) {
          if (!item.sorted) {
            item.y += item.speed * dt;
          }
        }

        // Remove items that fell off screen (missed — no penalty, just gone)
        state.fallingItems = state.fallingItems.filter(
          (item) => item.y < CANVAS_H + 50 || item.sorted
        );

        // Remove sorted items after brief pause
        state.fallingItems = state.fallingItems.filter(
          (item) => !item.sorted || item.sortedTimer > 0
        );
        for (const item of state.fallingItems) {
          if (item.sorted) {
            item.sortedTimer -= dt;
          }
        }

        // Set active item (lowest unsorted falling item)
        const unsorted = state.fallingItems.filter(i => !i.sorted);
        state.activeItem = unsorted.length > 0
          ? unsorted.reduce((a, b) => a.y > b.y ? a : b) // lowest = closest to bins
          : null;
      },

      render: (ctx, objects) => {
        const state = objects[0];
        if (!state) return;
        const strings = i18nRef.current;

        // Background
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grad.addColorStop(0, '#E0F2F1');
        grad.addColorStop(0.5, '#B2DFDB');
        grad.addColorStop(1, '#80CBC4');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Title
        drawText(ctx, '♻️ ' + strings.title, CANVAS_W / 2, 34, {
          font: "bold 22px 'Inter', system-ui, sans-serif", color: '#004D40', align: 'center',
        });

        // ─── Falling items ───────────────────────
        for (const item of state.fallingItems) {
          if (item.sorted) continue;

          const isActive = item === state.activeItem;
          const glow = isActive ? 'rgba(255,193,7,0.3)' : 'rgba(255,255,255,0.6)';

          // Item bubble
          drawRoundedRect(ctx, item.x - 35, item.y - 25, 70, 60, 14,
            glow, isActive ? '#FFA000' : 'rgba(0,0,0,0.1)');

          drawText(ctx, item.emoji, item.x, item.y - 2, {
            font: '28px sans-serif', align: 'center', baseline: 'middle',
          });
          drawText(ctx, item.name, item.x, item.y + 22, {
            font: "bold 10px 'Inter', system-ui, sans-serif", color: '#333',
            align: 'center',
          });
        }

        // ─── 5 Bins ──────────────────────────────
        for (const bin of state.bins) {
          let fill = bin.color;
          let extraScale = 0;

          if (bin.flash > 0) {
            const flashAlpha = bin.flash;
            fill = bin.flashColor === 'green'
              ? `rgba(102,187,106,${0.3 + flashAlpha * 0.5})`
              : `rgba(229,115,115,${0.3 + flashAlpha * 0.5})`;
            extraScale = bin.flash * 3;
          }

          // Bin body
          drawRoundedRect(ctx, bin.x, bin.y - extraScale / 2, bin.width, bin.height + extraScale,
            14, fill, 'rgba(0,0,0,0.15)');

          // Emoji
          drawText(ctx, bin.emoji, bin.x + bin.width / 2, bin.y + 30, {
            font: '32px sans-serif', align: 'center',
          });

          // Label
          drawText(ctx, bin.label, bin.x + bin.width / 2, bin.y + 68, {
            font: "bold 14px 'Inter', system-ui, sans-serif", color: '#fff',
            align: 'center',
          });
        }

        // ─── Stats ───────────────────────────────
        const statsText = `✅ ${state.correctCount}  ❌ ${state.wrongCount}`;
        drawText(ctx, statsText, CANVAS_W / 2, 60, {
          font: "14px 'Inter', system-ui, sans-serif", color: '#004D40', align: 'center',
        });
      },

      onComplete: () => {},
    }
  );

  useEffect(() => {
    if (introCountdown > 0) {
      const timer = setTimeout(() => setIntroCountdown(introCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (gameState === 'INIT') { setGameState('PLAYING'); }
  }, [introCountdown, gameState]);

  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const passed = score >= PASS_SCORE;
      setTimeout(() => onComplete(score, passed), 1000);
    }
  }, [gameState]);

  // Click handler — click a bin to sort the active item
  const handlePointerDown = useCallback((e) => {
    if (gameState !== 'PLAYING') return;
    const pointer = getCanvasPointer(canvasRef.current, e);
    const state = gameObjects.current[0];
    if (!state || !state.activeItem) return;

    for (const bin of state.bins) {
      if (hitTest(pointer, bin)) {
        const item = state.activeItem;
        const isCorrect = item.bin === bin.id;

        item.sorted = true;
        item.sortedTimer = 0.3;

        if (isCorrect) {
          state.correctCount++;
          setScore(s => s + POINTS_CORRECT);
          bin.flash = 1;
          bin.flashColor = 'green';
        } else {
          state.wrongCount++;
          setScore(s => Math.max(0, s + POINTS_WRONG));
          bin.flash = 1;
          bin.flashColor = 'red';
          // Flash correct bin
          const correctBin = state.bins.find(b => b.id === item.bin);
          if (correctBin) {
            correctBin.flash = 1;
            correctBin.flashColor = 'green';
          }
        }
        return;
      }
    }
  }, [gameState]);

  const displayTime = timeLeft != null ? Math.ceil(timeLeft) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#E0F2F1', overflow: 'hidden' }}>
      <ScoreBar score={score} timeLeft={displayTime} onPause={() => setGameState('PAUSED')} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
          style={{ width: '100%', height: 'auto', maxHeight: 'calc(100vh - 60px)', aspectRatio: '1280 / 720', objectFit: 'contain', imageRendering: 'pixelated', touchAction: 'none', cursor: 'pointer' }}
          onMouseDown={handlePointerDown} onTouchStart={handlePointerDown} />
      </div>
      {introCountdown > 0 && (
        <div style={styles.introOverlay}>
          <h2 style={{ fontSize: 28, marginBottom: 12, color: '#004D40' }}>♻️ {t('recycle.intro_title')}</h2>
          <p style={{ fontSize: 18, color: '#00695C', marginBottom: 24 }}>{t('recycle.intro_desc')}</p>
          <span style={{ fontSize: 72, fontWeight: 'bold', color: '#00897B' }}>{introCountdown}</span>
        </div>
      )}
      {gameState === 'PAUSED' && <PauseOverlay surfaceRef={canvasRef} onResume={() => setGameState('PLAYING')} onQuit={() => onNavigate('hub')} />}
    </div>
  );
}

const styles = {
  introOverlay: {
    position: 'absolute', inset: 0, background: 'rgba(224,242,241,0.95)', backdropFilter: 'blur(8px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#004D40', zIndex: 30,
  },
};
