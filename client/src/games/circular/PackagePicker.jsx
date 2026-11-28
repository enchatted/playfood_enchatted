import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useGameCanvas from '../hooks/useGameCanvas.js';
import { drawRoundedRect, drawText, hitTest, getCanvasPointer } from '../../utils/canvas.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * PackagePicker — Circular Economy Island, Mission 2
 *
 * Mechanic: Choose the most sustainable packaging for each product
 * 8 products, 2-3 options each, no timer
 * Pass threshold: 5/8 correct (62%)
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;
const POINTS_CORRECT = 10;
const PASS_THRESHOLD = 0.62;

const PRODUCTS = [
  {
    qKey: 'package.q1', emoji: '🧃',
    options: [
      { key: 'package.q1_a', emoji: '🧴', correct: false },
      { key: 'package.q1_b', emoji: '🫙', correct: true },
      { key: 'package.q1_c', emoji: '📦', correct: false },
    ],
    explainKey: 'package.q1_explain',
  },
  {
    qKey: 'package.q2', emoji: '🛒',
    options: [
      { key: 'package.q2_a', emoji: '🛍️', correct: false },
      { key: 'package.q2_b', emoji: '👜', correct: true },
    ],
    explainKey: 'package.q2_explain',
  },
  {
    qKey: 'package.q3', emoji: '🥛',
    options: [
      { key: 'package.q3_a', emoji: '🧴', correct: false },
      { key: 'package.q3_b', emoji: '🫙', correct: true },
    ],
    explainKey: 'package.q3_explain',
  },
  {
    qKey: 'package.q4', emoji: '🍱',
    options: [
      { key: 'package.q4_a', emoji: '🎞️', correct: false },
      { key: 'package.q4_b', emoji: '🍱', correct: true },
      { key: 'package.q4_c', emoji: '📄', correct: false },
    ],
    explainKey: 'package.q4_explain',
  },
  {
    qKey: 'package.q5', emoji: '☕',
    options: [
      { key: 'package.q5_a', emoji: '☕', correct: false },
      { key: 'package.q5_b', emoji: '🫖', correct: true },
    ],
    explainKey: 'package.q5_explain',
  },
  {
    qKey: 'package.q6', emoji: '🍎',
    options: [
      { key: 'package.q6_a', emoji: '🛍️', correct: false },
      { key: 'package.q6_b', emoji: '🧺', correct: true },
    ],
    explainKey: 'package.q6_explain',
  },
  {
    qKey: 'package.q7', emoji: '📦',
    options: [
      { key: 'package.q7_a', emoji: '📦', correct: false },
      { key: 'package.q7_b', emoji: '📦', correct: true },
    ],
    explainKey: 'package.q7_explain',
  },
  {
    qKey: 'package.q8', emoji: '🥛',
    options: [
      { key: 'package.q8_a', emoji: '🧴', correct: false },
      { key: 'package.q8_b', emoji: '📦', correct: false },
      { key: 'package.q8_c', emoji: '🥛', correct: true },
    ],
    explainKey: 'package.q8_explain',
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

export default function PackagePicker({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [introCountdown, setIntroCountdown] = useState(3);

  const i18nRef = useRef({});
  i18nRef.current = {
    title: t('package.title'),
    progress: (d, tot) => t('package.progress', { done: d, total: tot }),
  };

  const { gameState, setGameState, score, setScore, gameObjects, timeLeft } = useGameCanvas(
    canvasRef,
    {
      timeLimit: null,
      setup: (objects) => {
        const shuffled = shuffleArray(PRODUCTS);
        const products = shuffled.map((p) => ({
          question: t(p.qKey),
          emoji: p.emoji,
          options: p.options.map((o) => ({ ...o, label: t(o.key) })),
          explanation: t(p.explainKey),
        }));

        objects.push({
          products,
          currentIndex: 0,
          correctCount: 0,
          chosen: null,
          isCorrect: null,
          feedbackTimer: 0,
          explanation: null,
          cardScale: 0,
          cardScaleTimer: 0,
        });
      },

      update: (objects, dt) => {
        const state = objects[0];
        if (!state) return;

        if (state.cardScaleTimer < 0.3) {
          state.cardScaleTimer += dt;
          state.cardScale = Math.min(1, state.cardScaleTimer / 0.3);
        }

        if (state.feedbackTimer > 0) {
          state.feedbackTimer -= dt;
          if (state.feedbackTimer <= 0) {
            state.currentIndex++;
            state.chosen = null;
            state.isCorrect = null;
            state.explanation = null;
            state.cardScaleTimer = 0;
            state.cardScale = 0;

            if (state.currentIndex >= state.products.length) {
              // Use helpers via gameObjects
              setGameState('COMPLETED');
            }
          }
        }
      },

      render: (ctx, objects) => {
        const state = objects[0];
        if (!state) return;
        const strings = i18nRef.current;

        // Background — warm green
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grad.addColorStop(0, '#E8F5E9');
        grad.addColorStop(0.5, '#C8E6C9');
        grad.addColorStop(1, '#A5D6A7');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Title
        drawText(ctx, '📦 ' + strings.title, CANVAS_W / 2, 34, {
          font: "bold 22px 'Inter', system-ui, sans-serif", color: '#1B5E20', align: 'center',
        });

        // Progress
        const done = Math.min(state.currentIndex + (state.chosen != null ? 1 : 0), state.products.length);
        drawText(ctx, strings.progress(done, state.products.length), CANVAS_W / 2, 58, {
          font: "14px 'Inter', system-ui, sans-serif", color: '#2E7D32', align: 'center',
        });

        if (state.currentIndex >= state.products.length) return;

        const product = state.products[state.currentIndex];

        ctx.save();
        const s = state.cardScale;
        if (s < 1) {
          ctx.translate(CANVAS_W / 2, 300);
          ctx.scale(s, s);
          ctx.translate(-CANVAS_W / 2, -300);
        }

        // Product card
        const qW = 700;
        const qH = 100;
        const qX = (CANVAS_W - qW) / 2;
        const qY = 90;

        drawRoundedRect(ctx, qX + 3, qY + 4, qW, qH, 18, 'rgba(0,0,0,0.06)', 'transparent');
        drawRoundedRect(ctx, qX, qY, qW, qH, 18, 'rgba(255,255,255,0.92)', 'rgba(27,94,32,0.2)');

        drawText(ctx, product.emoji, qX + 50, qY + qH / 2, {
          font: '40px sans-serif', align: 'center', baseline: 'middle',
        });
        drawText(ctx, product.question, qX + 90 + (qW - 90) / 2, qY + qH / 2, {
          font: "bold 20px 'Inter', system-ui, sans-serif", color: '#1B5E20',
          align: 'center', baseline: 'middle',
        });

        // Option buttons
        const optCount = product.options.length;
        const btnW = 320;
        const btnH = 110;
        const btnGap = 24;
        const totalBtnW = optCount * btnW + (optCount - 1) * btnGap;
        const btnStartX = (CANVAS_W - totalBtnW) / 2;
        const btnY = 240;

        for (let i = 0; i < optCount; i++) {
          const opt = product.options[i];
          const bx = btnStartX + i * (btnW + btnGap);

          let fill = 'rgba(255,255,255,0.85)';
          let stroke = 'rgba(0,0,0,0.1)';
          let dimmed = false;

          if (state.chosen != null) {
            if (i === state.chosen && state.isCorrect) {
              fill = 'rgba(102,187,106,0.5)'; stroke = '#388E3C';
            } else if (i === state.chosen && !state.isCorrect) {
              fill = 'rgba(229,115,115,0.4)'; stroke = '#C62828';
            } else if (opt.correct) {
              fill = 'rgba(102,187,106,0.35)'; stroke = '#388E3C';
            } else { dimmed = true; }
          }

          if (dimmed) ctx.globalAlpha = 0.4;

          drawRoundedRect(ctx, bx + 2, btnY + 3, btnW, btnH, 16, 'rgba(0,0,0,0.05)', 'transparent');
          drawRoundedRect(ctx, bx, btnY, btnW, btnH, 16, fill, stroke);

          drawText(ctx, opt.emoji, bx + btnW / 2, btnY + 35, {
            font: '36px sans-serif', align: 'center',
          });
          drawText(ctx, opt.label, bx + btnW / 2, btnY + 78, {
            font: "bold 14px 'Inter', system-ui, sans-serif", color: '#333', align: 'center',
          });

          if (dimmed) ctx.globalAlpha = 1;
        }

        // Store rects for hit testing
        state._btnRects = product.options.map((_, i) => ({
          x: btnStartX + i * (btnW + btnGap), y: btnY, width: btnW, height: btnH,
        }));

        ctx.restore();

        // Explanation
        if (state.explanation && state.feedbackTimer > 0) {
          const alpha = state.feedbackTimer < 0.4 ? state.feedbackTimer / 0.4 : 1;
          ctx.globalAlpha = alpha;
          const exW = 650;
          const exH = 52;
          const exX = (CANVAS_W - exW) / 2;
          const exY = 400;
          const exColor = state.isCorrect ? '#1B5E20' : '#C62828';
          drawRoundedRect(ctx, exX, exY, exW, exH, 14, 'rgba(255,255,255,0.95)', exColor);
          drawText(ctx, state.explanation, CANVAS_W / 2, exY + exH / 2, {
            font: "14px 'Inter', system-ui, sans-serif", color: exColor,
            align: 'center', baseline: 'middle',
          });
          ctx.globalAlpha = 1;
        }

        // Progress dots
        const dotY = CANVAS_H - 28;
        const dotSpacing = 28;
        const dotsStartX = CANVAS_W / 2 - ((state.products.length - 1) * dotSpacing) / 2;
        for (let i = 0; i < state.products.length; i++) {
          ctx.beginPath();
          ctx.arc(dotsStartX + i * dotSpacing, dotY, 7, 0, Math.PI * 2);
          ctx.fillStyle = i < state.currentIndex ? '#66BB6A'
            : i === state.currentIndex ? '#FFB300' : 'rgba(0,0,0,0.12)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.stroke();
        }
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
      const state = gameObjects.current[0];
      const correct = state ? state.correctCount : 0;
      const passed = state ? (correct / state.products.length >= PASS_THRESHOLD) : false;
      setTimeout(() => onComplete(score, passed), 1000);
    }
  }, [gameState]);

  const handlePointerDown = useCallback((e) => {
    if (gameState !== 'PLAYING') return;
    const pointer = getCanvasPointer(canvasRef.current, e);
    const state = gameObjects.current[0];
    if (!state || state.chosen != null) return;
    if (state.currentIndex >= state.products.length) return;

    const product = state.products[state.currentIndex];
    const rects = state._btnRects;
    if (!rects) return;

    for (let i = 0; i < rects.length; i++) {
      if (hitTest(pointer, rects[i])) {
        const opt = product.options[i];
        state.chosen = i;
        state.isCorrect = opt.correct;
        state.explanation = (opt.correct ? '✅ ' : '❌ ') + product.explanation;

        if (opt.correct) {
          state.correctCount++;
          setScore(s => s + POINTS_CORRECT);
          state.feedbackTimer = 2.0;
        } else {
          state.feedbackTimer = 3.0;
        }
        return;
      }
    }
  }, [gameState]);

  const displayTime = timeLeft != null ? Math.ceil(timeLeft) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#E8F5E9', overflow: 'hidden' }}>
      <ScoreBar score={score} timeLeft={displayTime} onPause={() => setGameState('PAUSED')} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
          style={{ width: '100%', height: 'auto', maxHeight: 'calc(100vh - 60px)', aspectRatio: '1280 / 720', objectFit: 'contain', imageRendering: 'pixelated', touchAction: 'none', cursor: 'pointer' }}
          onMouseDown={handlePointerDown} onTouchStart={handlePointerDown} />
      </div>
      {introCountdown > 0 && (
        <div style={styles.introOverlay}>
          <h2 style={{ fontSize: 28, marginBottom: 12, color: '#1B5E20' }}>📦 {t('package.intro_title')}</h2>
          <p style={{ fontSize: 18, color: '#2E7D32', marginBottom: 24 }}>{t('package.intro_desc')}</p>
          <span style={{ fontSize: 72, fontWeight: 'bold', color: '#43A047' }}>{introCountdown}</span>
        </div>
      )}
      {gameState === 'PAUSED' && <PauseOverlay surfaceRef={canvasRef} onResume={() => setGameState('PLAYING')} onQuit={() => onNavigate('hub')} />}
    </div>
  );
}

const styles = {
  introOverlay: {
    position: 'absolute', inset: 0, background: 'rgba(232,245,233,0.95)', backdropFilter: 'blur(8px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#1B5E20', zIndex: 30,
  },
};
