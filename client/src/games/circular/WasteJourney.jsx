import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useGameCanvas from '../hooks/useGameCanvas.js';
import { drawRoundedRect, drawText, hitTest, getCanvasPointer } from '../../utils/canvas.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * WasteJourney — Circular Economy Island, Mission 3
 *
 * Mechanic: Interactive branching story following a banana peel
 * 6 decision points, no timer
 * +10 per good decision, -5 per bad, story always completes
 * Pass: score >= 30 (at least 4 good decisions)
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;
const POINTS_GOOD = 10;
const POINTS_BAD = -5;
const PASS_SCORE = 30;

// 6-step story — each step has a scene description + 2-3 options
const STORY_STEPS = [
  {
    sceneKey: 'waste_journey.s1',
    emoji: '🍌',
    options: [
      { key: 'waste_journey.s1_a', emoji: '🗑️', good: true },
      { key: 'waste_journey.s1_b', emoji: '💨', good: false },
    ],
    resultKey: { good: 'waste_journey.s1_good', bad: 'waste_journey.s1_bad' },
  },
  {
    sceneKey: 'waste_journey.s2',
    emoji: '🚛',
    options: [
      { key: 'waste_journey.s2_a', emoji: '♻️', good: true },
      { key: 'waste_journey.s2_b', emoji: '🏭', good: false },
    ],
    resultKey: { good: 'waste_journey.s2_good', bad: 'waste_journey.s2_bad' },
  },
  {
    sceneKey: 'waste_journey.s3',
    emoji: '🏭',
    options: [
      { key: 'waste_journey.s3_a', emoji: '🌱', good: true },
      { key: 'waste_journey.s3_b', emoji: '🔥', good: false },
      { key: 'waste_journey.s3_c', emoji: '🗑️', good: false },
    ],
    resultKey: { good: 'waste_journey.s3_good', bad: 'waste_journey.s3_bad' },
  },
  {
    sceneKey: 'waste_journey.s4',
    emoji: '🌱',
    options: [
      { key: 'waste_journey.s4_a', emoji: '🧑‍🌾', good: true },
      { key: 'waste_journey.s4_b', emoji: '🏪', good: false },
    ],
    resultKey: { good: 'waste_journey.s4_good', bad: 'waste_journey.s4_bad' },
  },
  {
    sceneKey: 'waste_journey.s5',
    emoji: '🥕',
    options: [
      { key: 'waste_journey.s5_a', emoji: '🍽️', good: true },
      { key: 'waste_journey.s5_b', emoji: '🗑️', good: false },
    ],
    resultKey: { good: 'waste_journey.s5_good', bad: 'waste_journey.s5_bad' },
  },
  {
    sceneKey: 'waste_journey.s6',
    emoji: '🔄',
    options: [
      { key: 'waste_journey.s6_a', emoji: '♻️', good: true },
      { key: 'waste_journey.s6_b', emoji: '🚮', good: false },
      { key: 'waste_journey.s6_c', emoji: '🌍', good: true },
    ],
    resultKey: { good: 'waste_journey.s6_good', bad: 'waste_journey.s6_bad' },
  },
];

export default function WasteJourney({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [introCountdown, setIntroCountdown] = useState(3);

  const i18nRef = useRef({});
  i18nRef.current = {
    title: t('waste_journey.title'),
    chapter: (n, tot) => t('waste_journey.chapter', { n, total: tot }),
  };

  const { gameState, setGameState, score, setScore, gameObjects, timeLeft } = useGameCanvas(
    canvasRef,
    {
      timeLimit: null,
      setup: (objects) => {
        const steps = STORY_STEPS.map((step) => ({
          scene: t(step.sceneKey),
          emoji: step.emoji,
          options: step.options.map((o) => ({ ...o, label: t(o.key) })),
          goodResult: t(step.resultKey.good),
          badResult: t(step.resultKey.bad),
        }));

        objects.push({
          steps,
          currentIndex: 0,
          chosen: null,
          isGood: null,
          resultText: null,
          feedbackTimer: 0,
          cardScale: 0,
          cardScaleTimer: 0,
          goodCount: 0,
        });
      },

      update: (objects, dt, helpers) => {
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
            state.isGood = null;
            state.resultText = null;
            state.cardScaleTimer = 0;
            state.cardScale = 0;

            if (state.currentIndex >= state.steps.length) {
              helpers.complete();
            }
          }
        }
      },

      render: (ctx, objects) => {
        const state = objects[0];
        if (!state) return;
        const strings = i18nRef.current;

        // Background — story-like warm gradient
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grad.addColorStop(0, '#FFF8E1');
        grad.addColorStop(0.5, '#FFF3E0');
        grad.addColorStop(1, '#FFE0B2');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Title
        drawText(ctx, '🚮 ' + strings.title, CANVAS_W / 2, 34, {
          font: "bold 22px 'Inter', system-ui, sans-serif", color: '#4E342E', align: 'center',
        });

        // Chapter indicator
        const chapterNum = Math.min(state.currentIndex + 1, state.steps.length);
        drawText(ctx, strings.chapter(chapterNum, state.steps.length), CANVAS_W / 2, 58, {
          font: "14px 'Inter', system-ui, sans-serif", color: '#6D4C41', align: 'center',
        });

        if (state.currentIndex >= state.steps.length) return;

        const step = state.steps[state.currentIndex];

        ctx.save();
        const s = state.cardScale;
        if (s < 1) {
          ctx.translate(CANVAS_W / 2, 300);
          ctx.scale(s, s);
          ctx.translate(-CANVAS_W / 2, -300);
        }

        // Scene card — storybook style
        const scW = 750;
        const scH = 120;
        const scX = (CANVAS_W - scW) / 2;
        const scY = 85;

        drawRoundedRect(ctx, scX + 3, scY + 4, scW, scH, 20, 'rgba(0,0,0,0.06)', 'transparent');
        drawRoundedRect(ctx, scX, scY, scW, scH, 20, 'rgba(255,255,255,0.92)', 'rgba(121,85,72,0.25)');

        // Scene emoji
        drawText(ctx, step.emoji, scX + 55, scY + scH / 2, {
          font: '48px sans-serif', align: 'center', baseline: 'middle',
        });

        // Scene text — wrap if needed
        drawText(ctx, step.scene, scX + 100 + (scW - 110) / 2, scY + scH / 2, {
          font: "bold 18px 'Inter', system-ui, sans-serif", color: '#3E2723',
          align: 'center', baseline: 'middle',
        });

        // Decision buttons
        const optCount = step.options.length;
        const btnW = 300;
        const btnH = 100;
        const btnGap = 24;
        const totalBtnW = optCount * btnW + (optCount - 1) * btnGap;
        const btnStartX = (CANVAS_W - totalBtnW) / 2;
        const btnY = 250;

        for (let i = 0; i < optCount; i++) {
          const opt = step.options[i];
          const bx = btnStartX + i * (btnW + btnGap);

          let fill = 'rgba(255,255,255,0.85)';
          let stroke = 'rgba(0,0,0,0.1)';
          let dimmed = false;

          if (state.chosen != null) {
            if (i === state.chosen && state.isGood) {
              fill = 'rgba(102,187,106,0.5)'; stroke = '#388E3C';
            } else if (i === state.chosen && !state.isGood) {
              fill = 'rgba(229,115,115,0.4)'; stroke = '#C62828';
            } else if (opt.good) {
              fill = 'rgba(102,187,106,0.35)'; stroke = '#388E3C';
            } else { dimmed = true; }
          }

          if (dimmed) ctx.globalAlpha = 0.4;

          drawRoundedRect(ctx, bx + 2, btnY + 3, btnW, btnH, 16, 'rgba(0,0,0,0.05)', 'transparent');
          drawRoundedRect(ctx, bx, btnY, btnW, btnH, 16, fill, stroke);

          drawText(ctx, opt.emoji, bx + btnW / 2, btnY + 32, {
            font: '32px sans-serif', align: 'center',
          });
          drawText(ctx, opt.label, bx + btnW / 2, btnY + 72, {
            font: "bold 14px 'Inter', system-ui, sans-serif", color: '#333', align: 'center',
          });

          if (dimmed) ctx.globalAlpha = 1;
        }

        state._btnRects = step.options.map((_, i) => ({
          x: btnStartX + i * (btnW + btnGap), y: btnY, width: btnW, height: btnH,
        }));

        ctx.restore();

        // Result narrative
        if (state.resultText && state.feedbackTimer > 0) {
          const alpha = state.feedbackTimer < 0.4 ? state.feedbackTimer / 0.4 : 1;
          ctx.globalAlpha = alpha;
          const rW = 700;
          const rH = 70;
          const rX = (CANVAS_W - rW) / 2;
          const rY = 400;
          const rColor = state.isGood ? '#2E7D32' : '#BF360C';

          drawRoundedRect(ctx, rX, rY, rW, rH, 16, 'rgba(255,255,255,0.95)', rColor);
          drawText(ctx, state.resultText, CANVAS_W / 2, rY + rH / 2, {
            font: "15px 'Inter', system-ui, sans-serif", color: rColor,
            align: 'center', baseline: 'middle',
          });
          ctx.globalAlpha = 1;
        }

        // Progress path (visual story dots connected by line)
        const dotY = CANVAS_H - 40;
        const dotSpacing = 50;
        const dotsStartX = CANVAS_W / 2 - ((state.steps.length - 1) * dotSpacing) / 2;

        // Connecting line
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dotsStartX, dotY);
        ctx.lineTo(dotsStartX + (state.steps.length - 1) * dotSpacing, dotY);
        ctx.stroke();
        ctx.lineWidth = 1;

        for (let i = 0; i < state.steps.length; i++) {
          const dx = dotsStartX + i * dotSpacing;
          ctx.beginPath();
          ctx.arc(dx, dotY, 9, 0, Math.PI * 2);
          ctx.fillStyle = i < state.currentIndex ? '#66BB6A'
            : i === state.currentIndex ? '#FF8F00' : 'rgba(0,0,0,0.1)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.stroke();

          // Step number
          drawText(ctx, String(i + 1), dx, dotY, {
            font: "bold 10px 'Inter', system-ui, sans-serif",
            color: i <= state.currentIndex ? '#fff' : 'rgba(0,0,0,0.3)',
            align: 'center', baseline: 'middle',
          });
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
      const passed = score >= PASS_SCORE;
      setTimeout(() => onComplete(score, passed), 1000);
    }
  }, [gameState]);

  const handlePointerDown = useCallback((e) => {
    if (gameState !== 'PLAYING') return;
    const pointer = getCanvasPointer(canvasRef.current, e);
    const state = gameObjects.current[0];
    if (!state || state.chosen != null) return;
    if (state.currentIndex >= state.steps.length) return;

    const step = state.steps[state.currentIndex];
    const rects = state._btnRects;
    if (!rects) return;

    for (let i = 0; i < rects.length; i++) {
      if (hitTest(pointer, rects[i])) {
        const opt = step.options[i];
        state.chosen = i;
        state.isGood = opt.good;

        if (opt.good) {
          state.goodCount++;
          setScore(s => s + POINTS_GOOD);
          state.resultText = '✅ ' + step.goodResult;
          state.feedbackTimer = 2.5;
        } else {
          setScore(s => Math.max(0, s + POINTS_BAD));
          state.resultText = '❌ ' + step.badResult;
          state.feedbackTimer = 3.0;
        }
        return;
      }
    }
  }, [gameState]);

  const displayTime = timeLeft != null ? Math.ceil(timeLeft) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#FFF8E1', overflow: 'hidden' }}>
      <ScoreBar score={score} timeLeft={displayTime} onPause={() => setGameState('PAUSED')} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
          style={{ width: '100%', height: 'auto', maxHeight: 'calc(100vh - 60px)', aspectRatio: '1280 / 720', objectFit: 'contain', imageRendering: 'pixelated', touchAction: 'none', cursor: 'pointer' }}
          onMouseDown={handlePointerDown} onTouchStart={handlePointerDown} />
      </div>
      {introCountdown > 0 && (
        <div style={styles.introOverlay}>
          <h2 style={{ fontSize: 28, marginBottom: 12, color: '#4E342E' }}>🚮 {t('waste_journey.intro_title')}</h2>
          <p style={{ fontSize: 18, color: '#5D4037', marginBottom: 24 }}>{t('waste_journey.intro_desc')}</p>
          <span style={{ fontSize: 72, fontWeight: 'bold', color: '#FF8F00' }}>{introCountdown}</span>
        </div>
      )}
      {gameState === 'PAUSED' && <PauseOverlay surfaceRef={canvasRef} onResume={() => setGameState('PLAYING')} onQuit={() => onNavigate('hub')} />}
    </div>
  );
}

const styles = {
  introOverlay: {
    position: 'absolute', inset: 0, background: 'rgba(255,248,225,0.95)', backdropFilter: 'blur(8px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#4E342E', zIndex: 30,
  },
};
