import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useGameCanvas from '../hooks/useGameCanvas.js';
import { drawRoundedRect, drawText, hitTest, getCanvasPointer } from '../../utils/canvas.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * EcoChallenge — Climate Impact Island, Mission 2
 *
 * Mechanic: Scenario-based quiz with eco-score meter
 * 8 scenarios, 90s timer, pass threshold 5/8 (62%)
 * Eco-score: starts 50, +10 correct, -10 wrong
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;
const POINTS_CORRECT = 10;
const PASS_THRESHOLD = 0.62;
const TIME_LIMIT = 90;
const ECO_START = 50;
const ECO_CHANGE = 10;

// Each scenario: question key, options [{key, correct, emoji}], explanation key
const SCENARIOS = [
  {
    qKey: 'eco.q1',
    options: [
      { key: 'eco.q1_a', emoji: '🥩', correct: false },
      { key: 'eco.q1_b', emoji: '🌯', correct: true },
      { key: 'eco.q1_c', emoji: '🍗', correct: false },
    ],
    explainKey: 'eco.q1_explain',
  },
  {
    qKey: 'eco.q2',
    options: [
      { key: 'eco.q2_a', emoji: '🥛', correct: false },
      { key: 'eco.q2_b', emoji: '🌾', correct: true },
    ],
    explainKey: 'eco.q2_explain',
  },
  {
    qKey: 'eco.q3',
    options: [
      { key: 'eco.q3_a', emoji: '🍝', correct: true },
      { key: 'eco.q3_b', emoji: '🥩', correct: false },
      { key: 'eco.q3_c', emoji: '🐟', correct: false },
    ],
    explainKey: 'eco.q3_explain',
  },
  {
    qKey: 'eco.q4',
    options: [
      { key: 'eco.q4_a', emoji: '🍫', correct: false },
      { key: 'eco.q4_b', emoji: '🍎', correct: true },
      { key: 'eco.q4_c', emoji: '🧀', correct: false },
    ],
    explainKey: 'eco.q4_explain',
  },
  {
    qKey: 'eco.q5',
    options: [
      { key: 'eco.q5_a', emoji: '🌽', correct: true },
      { key: 'eco.q5_b', emoji: '🥩', correct: false },
      { key: 'eco.q5_c', emoji: '🍗', correct: false },
    ],
    explainKey: 'eco.q5_explain',
  },
  {
    qKey: 'eco.q6',
    options: [
      { key: 'eco.q6_a', emoji: '🫘', correct: true },
      { key: 'eco.q6_b', emoji: '🐷', correct: false },
    ],
    explainKey: 'eco.q6_explain',
  },
  {
    qKey: 'eco.q7',
    options: [
      { key: 'eco.q7_a', emoji: '🧃', correct: false },
      { key: 'eco.q7_b', emoji: '💧', correct: true },
      { key: 'eco.q7_c', emoji: '🥛', correct: false },
    ],
    explainKey: 'eco.q7_explain',
  },
  {
    qKey: 'eco.q8',
    options: [
      { key: 'eco.q8_a', emoji: '🥓', correct: false },
      { key: 'eco.q8_b', emoji: '🥣', correct: true },
      { key: 'eco.q8_c', emoji: '🧀', correct: false },
    ],
    explainKey: 'eco.q8_explain',
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

export default function EcoChallenge({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [introCountdown, setIntroCountdown] = useState(3);

  const i18nRef = useRef({});
  i18nRef.current = {
    title: t('eco.title'),
    eco_label: t('eco.score_label'),
    progress: (d, tot) => t('eco.progress', { done: d, total: tot }),
  };

  const { gameState, setGameState, score, setScore, gameObjects, timeLeft } = useGameCanvas(
    canvasRef,
    {
      timeLimit: TIME_LIMIT,
      setup: (objects) => {
        const shuffled = shuffleArray(SCENARIOS);
        const scenarios = shuffled.map((s) => ({
          question: t(s.qKey),
          options: s.options.map((o) => ({
            ...o,
            label: t(o.key),
          })),
          explanation: t(s.explainKey),
        }));

        // Option button positions — computed dynamically per scenario
        objects.push({
          scenarios,
          currentIndex: 0,
          correctCount: 0,
          ecoScore: ECO_START,
          chosen: null,
          isCorrect: null,
          feedbackTimer: 0,
          explanation: null,
          cardScale: 0,
          cardScaleTimer: 0,
          ecoPulse: 0,
          ecoPulseColor: null,
        });
      },

      update: (objects, dt, helpers) => {
        const state = objects[0];
        if (!state) return;

        // Pause timer during feedback
        state.timerPaused = state.feedbackTimer > 0;

        if (state.cardScaleTimer < 0.3) {
          state.cardScaleTimer += dt;
          state.cardScale = Math.min(1, state.cardScaleTimer / 0.3);
        }

        if (state.ecoPulse > 0) state.ecoPulse = Math.max(0, state.ecoPulse - dt * 3);

        if (state.feedbackTimer > 0) {
          state.feedbackTimer -= dt;
          if (state.feedbackTimer <= 0) {
            state.currentIndex++;
            state.chosen = null;
            state.isCorrect = null;
            state.explanation = null;
            state.cardScaleTimer = 0;
            state.cardScale = 0;

            if (state.currentIndex >= state.scenarios.length) {
              helpers.complete();
            }
          }
        }
      },

      render: (ctx, objects) => {
        const state = objects[0];
        if (!state) return;
        const strings = i18nRef.current;

        // Background
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grad.addColorStop(0, '#E8F5E9');
        grad.addColorStop(0.5, '#C8E6C9');
        grad.addColorStop(1, '#A5D6A7');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Title
        drawText(ctx, '♻️ ' + strings.title, CANVAS_W / 2, 34, {
          font: "bold 22px 'Inter', system-ui, sans-serif", color: '#1B5E20', align: 'center',
        });

        // Progress
        const done = Math.min(state.currentIndex + (state.chosen != null ? 1 : 0), state.scenarios.length);
        drawText(ctx, strings.progress(done, state.scenarios.length), CANVAS_W / 2, 58, {
          font: "14px 'Inter', system-ui, sans-serif", color: '#2E7D32', align: 'center',
        });

        // ─── Eco Score Meter ─────────────────────
        const meterW = 300;
        const meterH = 24;
        const meterX = (CANVAS_W - meterW) / 2;
        const meterY = 74;
        const ecoFill = Math.max(0, Math.min(1, state.ecoScore / 100));

        drawRoundedRect(ctx, meterX, meterY, meterW, meterH, 12,
          'rgba(255,255,255,0.6)', 'rgba(0,0,0,0.12)');

        const ecoColor = ecoFill > 0.6 ? '#43A047' : ecoFill > 0.3 ? '#FFB300' : '#E53935';
        const ecoBarW = ecoFill * (meterW - 4);
        if (ecoBarW > 0) {
          const pulse = state.ecoPulse * 3;
          drawRoundedRect(ctx, meterX + 2, meterY + 2 - pulse / 2,
            ecoBarW, meterH - 4 + pulse, 10, ecoColor, 'transparent');
        }

        drawText(ctx, `${strings.eco_label}: ${state.ecoScore}`,
          CANVAS_W / 2, meterY + meterH / 2, {
            font: "bold 12px 'Inter', system-ui, sans-serif",
            color: ecoFill > 0.4 ? '#fff' : '#1B5E20',
            align: 'center', baseline: 'middle',
          });

        // ─── Current Scenario ────────────────────
        if (state.currentIndex < state.scenarios.length) {
          const scenario = state.scenarios[state.currentIndex];

          ctx.save();
          const s = state.cardScale;
          if (s < 1) {
            ctx.translate(CANVAS_W / 2, 300);
            ctx.scale(s, s);
            ctx.translate(-CANVAS_W / 2, -300);
          }

          // Question card
          const qW = 700;
          const qH = 80;
          const qX = (CANVAS_W - qW) / 2;
          const qY = 120;

          drawRoundedRect(ctx, qX + 3, qY + 4, qW, qH, 18,
            'rgba(0,0,0,0.06)', 'transparent');
          drawRoundedRect(ctx, qX, qY, qW, qH, 18,
            'rgba(255,255,255,0.92)', 'rgba(27,94,32,0.2)');

          drawText(ctx, scenario.question, CANVAS_W / 2, qY + qH / 2, {
            font: "bold 20px 'Inter', system-ui, sans-serif", color: '#1B5E20',
            align: 'center', baseline: 'middle',
          });

          // Option buttons
          const optCount = scenario.options.length;
          const btnW = 320;
          const btnH = 90;
          const btnGap = 24;
          const totalBtnW = optCount * btnW + (optCount - 1) * btnGap;
          const btnStartX = (CANVAS_W - totalBtnW) / 2;
          const btnY = 240;

          for (let i = 0; i < optCount; i++) {
            const opt = scenario.options[i];
            const bx = btnStartX + i * (btnW + btnGap);

            let fill = 'rgba(255,255,255,0.85)';
            let stroke = 'rgba(0,0,0,0.1)';
            let dimmed = false;

            if (state.chosen != null) {
              if (i === state.chosen && state.isCorrect) {
                fill = 'rgba(102,187,106,0.5)';
                stroke = '#388E3C';
              } else if (i === state.chosen && !state.isCorrect) {
                fill = 'rgba(229,115,115,0.4)';
                stroke = '#C62828';
              } else if (opt.correct) {
                fill = 'rgba(102,187,106,0.35)';
                stroke = '#388E3C';
              } else {
                dimmed = true;
              }
            }

            if (dimmed) ctx.globalAlpha = 0.4;

            drawRoundedRect(ctx, bx + 2, btnY + 3, btnW, btnH, 16,
              'rgba(0,0,0,0.05)', 'transparent');
            drawRoundedRect(ctx, bx, btnY, btnW, btnH, 16, fill, stroke);

            drawText(ctx, opt.emoji, bx + btnW / 2, btnY + 30, {
              font: '32px sans-serif', align: 'center',
            });
            drawText(ctx, opt.label, bx + btnW / 2, btnY + 65, {
              font: "bold 15px 'Inter', system-ui, sans-serif", color: '#333', align: 'center',
            });

            if (dimmed) ctx.globalAlpha = 1;
          }

          // Store button rects for hit testing
          state._btnRects = scenario.options.map((_, i) => ({
            x: btnStartX + i * (btnW + btnGap),
            y: btnY,
            width: btnW,
            height: btnH,
          }));

          ctx.restore();

          // ─── Explanation ─────────────────────────
          if (state.explanation && state.feedbackTimer > 0) {
            const alpha = state.feedbackTimer < 0.4 ? state.feedbackTimer / 0.4 : 1;
            ctx.globalAlpha = alpha;

            const exW = 650;
            const exH = 52;
            const exX = (CANVAS_W - exW) / 2;
            const exY = 370;
            const exColor = state.isCorrect ? '#1B5E20' : '#C62828';

            drawRoundedRect(ctx, exX, exY, exW, exH, 14,
              'rgba(255,255,255,0.95)', exColor);
            drawText(ctx, state.explanation, CANVAS_W / 2, exY + exH / 2, {
              font: "14px 'Inter', system-ui, sans-serif", color: exColor,
              align: 'center', baseline: 'middle',
            });

            ctx.globalAlpha = 1;
          }
        }

        // ─── Progress dots ───────────────────────
        const dotY = CANVAS_H - 28;
        const dotSpacing = 28;
        const dotsStartX = CANVAS_W / 2 - ((state.scenarios.length - 1) * dotSpacing) / 2;
        for (let i = 0; i < state.scenarios.length; i++) {
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
      const passed = state ? (correct / state.scenarios.length >= PASS_THRESHOLD) : false;
      setTimeout(() => onComplete(score, passed), 1000);
    }
  }, [gameState]);

  // Click handler
  const handlePointerDown = useCallback((e) => {
    if (gameState !== 'PLAYING') return;
    const canvas = canvasRef.current;
    const pointer = getCanvasPointer(canvas, e);
    const state = gameObjects.current[0];
    if (!state || state.chosen != null) return;
    if (state.currentIndex >= state.scenarios.length) return;

    const scenario = state.scenarios[state.currentIndex];
    const rects = state._btnRects;
    if (!rects) return;

    for (let i = 0; i < rects.length; i++) {
      if (hitTest(pointer, rects[i])) {
        const opt = scenario.options[i];
        const isCorrect = opt.correct;

        state.chosen = i;
        state.isCorrect = isCorrect;
        state.explanation = (isCorrect ? '✅ ' : '❌ ') + scenario.explanation;
        state.ecoPulse = 1;

        if (isCorrect) {
          state.correctCount++;
          state.ecoScore = Math.min(100, state.ecoScore + ECO_CHANGE);
          state.ecoPulseColor = '#43A047';
          setScore(s => s + POINTS_CORRECT);
          state.feedbackTimer = 2.0;
        } else {
          state.ecoScore = Math.max(0, state.ecoScore - ECO_CHANGE);
          state.ecoPulseColor = '#E53935';
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
        <canvas
          ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
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
          <h2 style={{ fontSize: 28, marginBottom: 12, color: '#1B5E20' }}>♻️ {t('eco.intro_title')}</h2>
          <p style={{ fontSize: 18, color: '#2E7D32', marginBottom: 24 }}>{t('eco.intro_desc')}</p>
          <span style={{ fontSize: 72, fontWeight: 'bold', color: '#43A047' }}>{introCountdown}</span>
        </div>
      )}

      {gameState === 'PAUSED' && (
        <PauseOverlay surfaceRef={canvasRef} onResume={() => setGameState('PLAYING')} onQuit={() => onNavigate('hub')} />
      )}
    </div>
  );
}

const styles = {
  introOverlay: {
    position: 'absolute', inset: 0,
    background: 'rgba(232,245,233,0.95)',
    backdropFilter: 'blur(8px)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    color: '#1B5E20', zIndex: 30,
  },
};
