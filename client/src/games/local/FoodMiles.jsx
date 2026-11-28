import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useGameCanvas from '../hooks/useGameCanvas.js';
import { drawRoundedRect, drawText, hitTest, getCanvasPointer } from '../../utils/canvas.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * FoodMiles — Local & Seasonal Island, Mission 3
 *
 * Mechanic: Head-to-head comparison — pick the food that traveled LESS
 * 10 pairs, 45 seconds timer
 * +10 per correct, no penalty for wrong
 * Pass threshold: 6/10 correct (60%)
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;
const POINTS_CORRECT = 10;
const PASS_THRESHOLD = 0.6;
const TIME_LIMIT = 45;

const FOOD_PAIRS = [
  {
    a: { nameKey: 'miles.local_apples', emoji: '🍎', km: 8 },
    b: { nameKey: 'miles.chilean_apples', emoji: '🍎', km: 12000 },
    correct: 'a',
  },
  {
    a: { nameKey: 'miles.spanish_tomatoes', emoji: '🍅', km: 2400 },
    b: { nameKey: 'miles.greek_tomatoes', emoji: '🍅', km: 15 },
    correct: 'b',
  },
  {
    a: { nameKey: 'miles.kenyan_beans', emoji: '🫘', km: 6500 },
    b: { nameKey: 'miles.dutch_beans', emoji: '🫘', km: 2800 },
    correct: 'b',
  },
  {
    a: { nameKey: 'miles.local_eggs', emoji: '🥚', km: 5 },
    b: { nameKey: 'miles.uk_eggs', emoji: '🥚', km: 3200 },
    correct: 'a',
  },
  {
    a: { nameKey: 'miles.argentinian_beef', emoji: '🥩', km: 11000 },
    b: { nameKey: 'miles.local_beef', emoji: '🥩', km: 30 },
    correct: 'b',
  },
  {
    a: { nameKey: 'miles.sa_oranges', emoji: '🍊', km: 9500 },
    b: { nameKey: 'miles.sicilian_oranges', emoji: '🍊', km: 800 },
    correct: 'b',
  },
  {
    a: { nameKey: 'miles.thai_rice', emoji: '🍚', km: 9000 },
    b: { nameKey: 'miles.local_bread', emoji: '🍞', km: 20 },
    correct: 'b',
  },
  {
    a: { nameKey: 'miles.colombian_coffee', emoji: '☕', km: 8500 },
    b: { nameKey: 'miles.local_tea', emoji: '🍵', km: 10 },
    correct: 'b',
  },
  {
    a: { nameKey: 'miles.moroccan_strawberries', emoji: '🍓', km: 3800 },
    b: { nameKey: 'miles.local_strawberries', emoji: '🍓', km: 10 },
    correct: 'b',
  },
  {
    a: { nameKey: 'miles.nz_lamb', emoji: '🍖', km: 18500 },
    b: { nameKey: 'miles.local_lamb', emoji: '🍖', km: 25 },
    correct: 'b',
  },
];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function FoodMiles({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [introCountdown, setIntroCountdown] = useState(3);

  const i18nRef = useRef({});
  i18nRef.current = {
    title: t('miles.title'),
    subtitle: t('miles.subtitle'),
    correct: t('miles.correct'),
    wrong: t('miles.wrong'),
    km_away: (km) => t('miles.km_away', { km }),
    progress: (done, total) => t('miles.progress', { done, total }),
    vs: t('miles.vs'),
  };

  const { gameState, setGameState, score, setScore, gameObjects, timeLeft } = useGameCanvas(
    canvasRef,
    {
      timeLimit: TIME_LIMIT,
      setup: (objects) => {
        const shuffled = shuffleArray(FOOD_PAIRS);
        const pairs = shuffled.map((pair) => ({
          a: { ...pair.a, name: t(pair.a.nameKey) },
          b: { ...pair.b, name: t(pair.b.nameKey) },
          correct: pair.correct,
          // Randomize left/right
          swapped: Math.random() > 0.5,
        }));

        const cardW = 420;
        const cardH = 320;
        const gap = 60;
        const totalW = cardW * 2 + gap;
        const startX = (CANVAS_W - totalW) / 2;
        const cardY = 180;

        objects.push({
          pairs,
          currentIndex: 0,
          correctCount: 0,
          selected: null,       // 'left' or 'right'
          isCorrect: null,
          feedbackTimer: 0,
          cardScale: 0,
          cardScaleTimer: 0,
          leftCard: { x: startX, y: cardY, width: cardW, height: cardH },
          rightCard: { x: startX + cardW + gap, y: cardY, width: cardW, height: cardH },
        });
      },

      update: (objects, dt, helpers) => {
        const state = objects[0];
        if (!state) return;

        // Card pop-in
        if (state.cardScaleTimer < 0.3) {
          state.cardScaleTimer += dt;
          state.cardScale = Math.min(1, state.cardScaleTimer / 0.3);
        }

        // Feedback auto-advance
        if (state.feedbackTimer > 0) {
          state.feedbackTimer -= dt;
          if (state.feedbackTimer <= 0) {
            state.currentIndex++;
            state.selected = null;
            state.isCorrect = null;
            state.cardScaleTimer = 0;
            state.cardScale = 0;

            if (state.currentIndex >= state.pairs.length) {
              helpers.complete();
            }
          }
        }
      },

      render: (ctx, objects, helpers) => {
        const state = objects[0];
        if (!state) return;
        const strings = i18nRef.current;

        // Background — blue/earth gradient
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grad.addColorStop(0, '#E3F2FD');
        grad.addColorStop(0.5, '#BBDEFB');
        grad.addColorStop(1, '#90CAF9');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Title
        drawText(ctx, '🗺️ ' + strings.title, CANVAS_W / 2, 36, {
          font: "bold 22px 'Inter', system-ui, sans-serif", color: '#0D47A1', align: 'center',
        });

        // Subtitle
        drawText(ctx, strings.subtitle, CANVAS_W / 2, 62, {
          font: "16px 'Inter', system-ui, sans-serif", color: '#1565C0', align: 'center',
        });

        // Progress
        const total = state.pairs.length;
        const done = Math.min(state.currentIndex + (state.selected ? 1 : 0), total);
        drawText(ctx, strings.progress(done, total), CANVAS_W / 2, 88, {
          font: "14px 'Inter', system-ui, sans-serif", color: '#1976D2', align: 'center',
        });

        // VS badge
        drawText(ctx, strings.vs, CANVAS_W / 2, state.leftCard.y + state.leftCard.height / 2, {
          font: "bold 32px 'Inter', system-ui, sans-serif", color: '#1565C0', align: 'center',
          baseline: 'middle',
        });

        // ─── Pair cards ──────────────────────────
        if (state.currentIndex < state.pairs.length) {
          const pair = state.pairs[state.currentIndex];
          const leftData = pair.swapped ? pair.b : pair.a;
          const rightData = pair.swapped ? pair.a : pair.b;
          const leftId = pair.swapped ? 'b' : 'a';
          const rightId = pair.swapped ? 'a' : 'b';

          ctx.save();
          const s = state.cardScale;
          if (s < 1) {
            ctx.translate(CANVAS_W / 2, 340);
            ctx.scale(s, s);
            ctx.translate(-CANVAS_W / 2, -340);
          }

          _renderFoodCard(ctx, state.leftCard, leftData, leftId, pair.correct, state, strings);
          _renderFoodCard(ctx, state.rightCard, rightData, rightId, pair.correct, state, strings);

          ctx.restore();
        }

        // ─── Feedback toast ──────────────────────
        if (state.selected && state.feedbackTimer > 0) {
          const alpha = state.feedbackTimer < 0.4 ? state.feedbackTimer / 0.4 : 1;
          ctx.globalAlpha = alpha;

          const fbText = state.isCorrect
            ? '✅ ' + strings.correct
            : '❌ ' + strings.wrong;
          const fbColor = state.isCorrect ? '#2E7D32' : '#C62828';

          const fbW = 400;
          const fbH = 46;
          const fbX = (CANVAS_W - fbW) / 2;
          const fbY = 540;

          drawRoundedRect(ctx, fbX, fbY, fbW, fbH, 14,
            'rgba(255,255,255,0.95)', fbColor);
          drawText(ctx, fbText, CANVAS_W / 2, fbY + fbH / 2, {
            font: "bold 16px 'Inter', system-ui, sans-serif",
            color: fbColor, align: 'center', baseline: 'middle',
          });

          ctx.globalAlpha = 1;
        }

        // ─── Score dots ──────────────────────────
        const dotY = CANVAS_H - 30;
        const dotSpacing = 28;
        const dotsStartX = CANVAS_W / 2 - ((state.pairs.length - 1) * dotSpacing) / 2;

        for (let i = 0; i < state.pairs.length; i++) {
          const dx = dotsStartX + i * dotSpacing;
          ctx.beginPath();
          ctx.arc(dx, dotY, 7, 0, Math.PI * 2);
          ctx.fillStyle = i < state.currentIndex ? '#66BB6A'
            : i === state.currentIndex ? '#FFB300'
            : 'rgba(0,0,0,0.12)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.stroke();
        }
      },

      onComplete: () => {},
    }
  );

  // Intro countdown
  useEffect(() => {
    if (introCountdown > 0) {
      const timer = setTimeout(() => setIntroCountdown(introCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (gameState === 'INIT') {
      setGameState('PLAYING');
    }
  }, [introCountdown, gameState]);

  // Completion
  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const state = gameObjects.current[0];
      const correct = state ? state.correctCount : 0;
      const passed = state ? (correct / state.pairs.length >= PASS_THRESHOLD) : false;
      setTimeout(() => onComplete(score, passed), 1000);
    }
  }, [gameState]);

  // Click handler
  const handlePointerDown = useCallback((e) => {
    if (gameState !== 'PLAYING') return;
    const canvas = canvasRef.current;
    const pointer = getCanvasPointer(canvas, e);
    const state = gameObjects.current[0];
    if (!state || state.selected) return;
    if (state.currentIndex >= state.pairs.length) return;

    const pair = state.pairs[state.currentIndex];
    const leftId = pair.swapped ? 'b' : 'a';
    const rightId = pair.swapped ? 'a' : 'b';

    let chosenId = null;
    if (hitTest(pointer, state.leftCard)) {
      chosenId = leftId;
      state.selected = 'left';
    } else if (hitTest(pointer, state.rightCard)) {
      chosenId = rightId;
      state.selected = 'right';
    }

    if (!chosenId) return;

    const isCorrect = chosenId === pair.correct;
    state.isCorrect = isCorrect;

    if (isCorrect) {
      state.correctCount++;
      setScore((s) => s + POINTS_CORRECT);
      state.feedbackTimer = 1.5;
    } else {
      state.feedbackTimer = 2.5;
    }
  }, [gameState]);

  const displayTime = timeLeft != null ? Math.ceil(timeLeft) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#E3F2FD', overflow: 'hidden' }}>
      <ScoreBar score={score} timeLeft={displayTime} onPause={() => setGameState('PAUSED')} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            width: '100%', height: 'auto', maxHeight: 'calc(100vh - 60px)',
            aspectRatio: '1280 / 720', objectFit: 'contain',
            imageRendering: 'pixelated', touchAction: 'none', cursor: 'pointer',
          }}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
        />
      </div>

      {introCountdown > 0 && (
        <div style={styles.introOverlay}>
          <h2 style={{ fontSize: 28, marginBottom: 12, color: '#0D47A1' }}>
            🗺️ {t('miles.intro_title')}
          </h2>
          <p style={{ fontSize: 18, color: '#1565C0', marginBottom: 24 }}>
            {t('miles.intro_desc')}
          </p>
          <span style={{ fontSize: 72, fontWeight: 'bold', color: '#1976D2' }}>
            {introCountdown}
          </span>
        </div>
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

// ─── Helper: render one food comparison card ───────────

function _renderFoodCard(ctx, rect, data, id, correctId, state, strings) {
  const { x, y, width, height } = rect;
  const isCorrectOption = id === correctId;
  const side = rect === state?.leftCard ? 'left' : 'right';

  let fill = 'rgba(255,255,255,0.88)';
  let stroke = 'rgba(0,0,0,0.12)';
  let dimmed = false;

  if (state.selected) {
    const wasChosen = state.selected === side;
    if (wasChosen && state.isCorrect) {
      fill = 'rgba(102,187,106,0.4)';
      stroke = '#388E3C';
    } else if (wasChosen && !state.isCorrect) {
      fill = 'rgba(229,115,115,0.4)';
      stroke = '#C62828';
    } else if (!wasChosen && isCorrectOption) {
      fill = 'rgba(102,187,106,0.3)';
      stroke = '#388E3C';
    } else {
      dimmed = true;
    }
  }

  if (dimmed) ctx.globalAlpha = 0.4;

  // Shadow
  drawRoundedRect(ctx, x + 3, y + 4, width, height, 20,
    'rgba(0,0,0,0.06)', 'transparent');
  // Body
  drawRoundedRect(ctx, x, y, width, height, 20, fill, stroke);

  // Emoji (large)
  drawText(ctx, data.emoji, x + width / 2, y + 80, {
    font: '56px sans-serif', align: 'center',
  });

  // Food name
  drawText(ctx, data.name, x + width / 2, y + 140, {
    font: "bold 20px 'Inter', system-ui, sans-serif", color: '#333', align: 'center',
  });

  // Distance
  const kmStr = data.km.toLocaleString();
  drawText(ctx, '📍 ' + strings.km_away(kmStr), x + width / 2, y + 180, {
    font: "18px 'Inter', system-ui, sans-serif",
    color: data.km < 100 ? '#2E7D32' : '#BF360C',
    align: 'center',
  });

  // Visual distance bar
  const maxKm = 20000;
  const barW = width - 60;
  const barH = 16;
  const barX = x + 30;
  const barY = y + 210;
  const barFill = Math.min(data.km / maxKm, 1) * barW;

  drawRoundedRect(ctx, barX, barY, barW, barH, 8,
    'rgba(0,0,0,0.08)', 'transparent');
  if (barFill > 2) {
    const barColor = data.km < 100 ? '#66BB6A' : data.km < 3000 ? '#FFB300' : '#E53935';
    drawRoundedRect(ctx, barX, barY, barFill, barH, 8, barColor, 'transparent');
  }

  // Map pin
  drawText(ctx, '📌', x + width / 2, y + 265, {
    font: '28px sans-serif', align: 'center',
  });

  if (dimmed) ctx.globalAlpha = 1;
}

const styles = {
  introOverlay: {
    position: 'absolute', inset: 0,
    background: 'rgba(227,242,253,0.95)',
    backdropFilter: 'blur(8px)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    color: '#0D47A1', zIndex: 30,
  },
};
