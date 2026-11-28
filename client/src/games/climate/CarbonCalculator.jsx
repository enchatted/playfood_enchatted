import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useGameCanvas from '../hooks/useGameCanvas.js';
import { drawRoundedRect, drawText, hitTest, getCanvasPointer } from '../../utils/canvas.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * CarbonCalculator — Climate Impact Island, Mission 1
 *
 * Mechanic: Meal builder with CO₂ budget
 * Goal: Select 4 food items to build a meal, stay under 5 kg CO₂
 * CO₂ values hidden until selected (card flip reveal)
 * Pass: 4-item meal under 5 kg | Fail: exceed budget
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;
const MAX_BUDGET = 5.0;
const MEAL_SIZE = 4;
const BONUS_THRESHOLD = 3.0;
const POINTS_PER_ITEM = 10;
const BONUS_POINTS = 20;

const FOODS = [
  { id: 'beef',      emoji: '🥩', nameKey: 'carbon_foods.beef',      co2: 13.0 },
  { id: 'lamb',      emoji: '🐑', nameKey: 'carbon_foods.lamb',      co2: 10.0 },
  { id: 'cheese',    emoji: '🧀', nameKey: 'carbon_foods.cheese',    co2: 5.0 },
  { id: 'pork',      emoji: '🐷', nameKey: 'carbon_foods.pork',      co2: 4.5 },
  { id: 'chicken',   emoji: '🍗', nameKey: 'carbon_foods.chicken',   co2: 2.5 },
  { id: 'salmon',    emoji: '🐟', nameKey: 'carbon_foods.salmon',    co2: 2.0 },
  { id: 'eggs',      emoji: '🥚', nameKey: 'carbon_foods.eggs',      co2: 1.5 },
  { id: 'chickpeas', emoji: '🫘', nameKey: 'carbon_foods.chickpeas', co2: 0.8 },
  { id: 'tomatoes',  emoji: '🍅', nameKey: 'carbon_foods.tomatoes',  co2: 0.4 },
  { id: 'carrots',   emoji: '🥕', nameKey: 'carbon_foods.carrots',   co2: 0.3 },
  { id: 'rice',      emoji: '🌾', nameKey: 'carbon_foods.rice',      co2: 0.7 },
  { id: 'lentils',   emoji: '🫙', nameKey: 'carbon_foods.lentils',   co2: 0.5 },
];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CarbonCalculator({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [introCountdown, setIntroCountdown] = useState(3);

  const i18nRef = useRef({});
  i18nRef.current = {
    title: t('carbon.title'),
    budget: t('carbon.budget'),
    select_hint: t('carbon.select_hint'),
    over_budget: t('carbon.over_budget'),
    well_done: t('carbon.well_done'),
    bonus_msg: t('carbon.bonus_message'),
    co2_unit: t('carbon.co2_unit'),
    your_meal: t('carbon.your_meal'),
  };

  const { gameState, setGameState, score, setScore, gameObjects, timeLeft } = useGameCanvas(
    canvasRef,
    {
      timeLimit: null,
      setup: (objects) => {
        const shuffled = shuffleArray(FOODS);
        const items = shuffled.map((f) => ({
          ...f,
          name: t(f.nameKey),
          revealed: false,
          selected: false,
        }));

        // Grid layout: 4 columns × 3 rows
        const cardW = 155;
        const cardH = 120;
        const gap = 16;
        const cols = 4;
        const rows = 3;
        const gridW = cols * cardW + (cols - 1) * gap;
        const gridX = (CANVAS_W - gridW) / 2;
        const gridY = 150;

        items.forEach((item, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          item.x = gridX + col * (cardW + gap);
          item.y = gridY + row * (cardH + gap);
          item.width = cardW;
          item.height = cardH;
        });

        objects.push({
          items,
          totalCO2: 0,
          selectedCount: 0,
          busted: false,
          completed: false,
          feedbackText: null,
          feedbackColor: null,
          feedbackTimer: 0,
          meterPulse: 0,
          flipTimer: 0,
          flipItem: null,
        });
      },

      update: (objects, dt, helpers) => {
        const state = objects[0];
        if (!state) return;

        if (state.meterPulse > 0) state.meterPulse = Math.max(0, state.meterPulse - dt * 2);

        if (state.feedbackTimer > 0) {
          state.feedbackTimer -= dt;
          if (state.feedbackTimer <= 0) {
            state.feedbackText = null;
            if (state.busted || state.completed) {
              helpers.complete();
            }
          }
        }
      },

      render: (ctx, objects, helpers) => {
        const state = objects[0];
        if (!state) return;
        const strings = i18nRef.current;

        // Background
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grad.addColorStop(0, '#E8F5E9');
        grad.addColorStop(0.5, '#F1F8E9');
        grad.addColorStop(1, '#DCEDC8');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Title
        drawText(ctx, '🌍 ' + strings.title, CANVAS_W / 2, 34, {
          font: "bold 22px 'Inter', system-ui, sans-serif", color: '#1B5E20', align: 'center',
        });

        // Instruction
        drawText(ctx, strings.select_hint, CANVAS_W / 2, 58, {
          font: "14px 'Inter', system-ui, sans-serif", color: '#558B2F', align: 'center',
        });

        // ─── CO₂ Budget Bar ──────────────────────
        const meterW = 500;
        const meterH = 28;
        const meterX = (CANVAS_W - meterW) / 2;
        const meterY = 76;
        const fill = state.totalCO2 / MAX_BUDGET;

        drawRoundedRect(ctx, meterX, meterY, meterW, meterH, 14,
          'rgba(255,255,255,0.7)', 'rgba(0,0,0,0.15)');

        const barColor = fill > 0.8 ? '#E53935' : fill > 0.6 ? '#FFB300' : '#43A047';
        const barW = Math.min(fill, 1) * (meterW - 4);
        if (barW > 0) {
          const pulseExtra = state.meterPulse * 4;
          drawRoundedRect(ctx, meterX + 2, meterY + 2 - pulseExtra / 2,
            barW, meterH - 4 + pulseExtra, 12, barColor, 'transparent');
        }

        drawText(ctx, `${state.totalCO2.toFixed(1)} / ${MAX_BUDGET.toFixed(1)} ${strings.co2_unit}`,
          CANVAS_W / 2, meterY + meterH / 2, {
            font: "bold 13px 'Inter', system-ui, sans-serif",
            color: fill > 0.5 ? '#fff' : '#1B5E20',
            align: 'center', baseline: 'middle',
          });

        // ─── Food Grid ───────────────────────────
        for (const item of state.items) {
          const isSelected = item.selected;
          let cardFill = 'rgba(255,255,255,0.85)';
          let cardStroke = 'rgba(0,0,0,0.1)';

          if (isSelected) {
            cardFill = 'rgba(102,187,106,0.35)';
            cardStroke = '#388E3C';
          }

          // Shadow
          drawRoundedRect(ctx, item.x + 2, item.y + 3, item.width, item.height, 14,
            'rgba(0,0,0,0.05)', 'transparent');
          // Body
          drawRoundedRect(ctx, item.x, item.y, item.width, item.height, 14,
            cardFill, cardStroke);

          // Emoji
          drawText(ctx, item.emoji, item.x + item.width / 2, item.y + 35, {
            font: '32px sans-serif', align: 'center',
          });

          // Name
          drawText(ctx, item.name, item.x + item.width / 2, item.y + 70, {
            font: "bold 13px 'Inter', system-ui, sans-serif", color: '#333', align: 'center',
          });

          // CO₂ value (revealed or hidden)
          if (item.revealed) {
            const co2Color = item.co2 > 4 ? '#D32F2F' : item.co2 > 1.5 ? '#E65100' : '#2E7D32';
            drawText(ctx, item.co2.toFixed(1) + ' ' + strings.co2_unit,
              item.x + item.width / 2, item.y + 98, {
                font: "bold 14px 'Inter', system-ui, sans-serif", color: co2Color, align: 'center',
              });
          } else {
            drawText(ctx, '? ' + strings.co2_unit,
              item.x + item.width / 2, item.y + 98, {
                font: "bold 14px 'Inter', system-ui, sans-serif", color: '#999', align: 'center',
              });
          }

          // Checkmark for selected
          if (isSelected) {
            drawText(ctx, '✅', item.x + item.width - 18, item.y + 14, {
              font: '14px sans-serif', align: 'center',
            });
          }
        }

        // ─── Meal Slots ──────────────────────────
        const slotY = 560;
        const slotW = 80;
        const slotH = 80;
        const slotGap = 20;
        const totalSlotW = MEAL_SIZE * slotW + (MEAL_SIZE - 1) * slotGap;
        const slotStartX = (CANVAS_W - totalSlotW) / 2;

        drawText(ctx, strings.your_meal, CANVAS_W / 2, slotY - 12, {
          font: "bold 14px 'Inter', system-ui, sans-serif", color: '#33691E', align: 'center',
        });

        const selected = state.items.filter(i => i.selected);
        for (let i = 0; i < MEAL_SIZE; i++) {
          const sx = slotStartX + i * (slotW + slotGap);
          drawRoundedRect(ctx, sx, slotY, slotW, slotH, 12,
            'rgba(255,255,255,0.5)', 'rgba(0,0,0,0.1)');

          if (selected[i]) {
            drawText(ctx, selected[i].emoji, sx + slotW / 2, slotY + 30, {
              font: '28px sans-serif', align: 'center',
            });
            drawText(ctx, selected[i].co2.toFixed(1), sx + slotW / 2, slotY + 60, {
              font: "bold 12px 'Inter', system-ui, sans-serif", color: '#E65100', align: 'center',
            });
          } else {
            drawText(ctx, '?', sx + slotW / 2, slotY + 40, {
              font: "bold 24px 'Inter', system-ui, sans-serif",
              color: 'rgba(0,0,0,0.15)', align: 'center', baseline: 'middle',
            });
          }
        }

        // ─── Feedback Toast ──────────────────────
        if (state.feedbackText && state.feedbackTimer > 0) {
          const alpha = Math.min(1, state.feedbackTimer / 0.3);
          ctx.globalAlpha = alpha;
          const fbW = 520;
          const fbH = 52;
          const fbX = (CANVAS_W - fbW) / 2;
          const fbY = 660;
          drawRoundedRect(ctx, fbX, fbY, fbW, fbH, 16,
            'rgba(255,255,255,0.95)', state.feedbackColor);
          drawText(ctx, state.feedbackText, CANVAS_W / 2, fbY + fbH / 2, {
            font: "bold 16px 'Inter', system-ui, sans-serif",
            color: state.feedbackColor, align: 'center', baseline: 'middle',
          });
          ctx.globalAlpha = 1;
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
      const passed = state ? !state.busted : false;
      setTimeout(() => onComplete(score, passed), 1000);
    }
  }, [gameState]);

  // Click handler
  const handlePointerDown = useCallback((e) => {
    if (gameState !== 'PLAYING') return;
    const canvas = canvasRef.current;
    const pointer = getCanvasPointer(canvas, e);
    const state = gameObjects.current[0];
    if (!state || state.busted || state.completed) return;
    if (state.feedbackTimer > 0) return;

    const strings = i18nRef.current;

    for (const item of state.items) {
      if (item.selected) continue;
      if (hitTest(pointer, item)) {
        item.revealed = true;
        item.selected = true;
        state.selectedCount++;
        state.totalCO2 += item.co2;
        state.meterPulse = 1;
        setScore(s => s + POINTS_PER_ITEM);

        // Check budget exceeded
        if (state.totalCO2 > MAX_BUDGET) {
          state.busted = true;
          state.feedbackText = '❌ ' + strings.over_budget;
          state.feedbackColor = '#D32F2F';
          state.feedbackTimer = 2.5;
        } else if (state.selectedCount >= MEAL_SIZE) {
          state.completed = true;
          if (state.totalCO2 <= BONUS_THRESHOLD) {
            setScore(s => s + BONUS_POINTS);
            state.feedbackText = '🌟 ' + strings.bonus_msg;
            state.feedbackColor = '#1B5E20';
          } else {
            state.feedbackText = '✅ ' + strings.well_done;
            state.feedbackColor = '#2E7D32';
          }
          state.feedbackTimer = 2.0;
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
          <h2 style={{ fontSize: 28, marginBottom: 12, color: '#1B5E20' }}>🌍 {t('carbon.intro_title')}</h2>
          <p style={{ fontSize: 18, color: '#2E7D32', marginBottom: 24 }}>{t('carbon.intro_desc')}</p>
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
