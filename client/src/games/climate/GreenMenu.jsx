import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useGameCanvas from '../hooks/useGameCanvas.js';
import { drawRoundedRect, drawText, hitTest, getCanvasPointer } from '../../utils/canvas.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * GreenMenu — Climate Impact Island, Mission 4
 *
 * Mechanic: Full-day menu planner (breakfast + lunch + dinner)
 * Budget: 8 kg CO₂ total. Pick 2 items per meal (6 total).
 * CO₂ values visible from start — strategic planning game.
 * Can swap items (not immediate fail). Submit when ready.
 * Pass: total ≤ 8 kg | Fail: total > 8 kg on submit
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;
const MAX_BUDGET = 8.0;
const ITEMS_PER_MEAL = 2;
const POINTS_PER_SLOT = 10;
const BONUS_CHAMPION = 20;
const BONUS_GOOD = 10;

const MEALS = [
  {
    id: 'breakfast',
    labelKey: 'green.breakfast',
    emoji: '🌅',
    foods: [
      { id: 'oat_porridge',  emoji: '🥣', nameKey: 'green_foods.oat_porridge',  co2: 0.3 },
      { id: 'bacon',         emoji: '🥓', nameKey: 'green_foods.bacon',         co2: 3.5 },
      { id: 'scrambled_eggs',emoji: '🍳', nameKey: 'green_foods.scrambled_eggs',co2: 1.5 },
      { id: 'cheese_toast',  emoji: '🧀', nameKey: 'green_foods.cheese_toast',  co2: 2.0 },
      { id: 'banana_yogurt', emoji: '🍌', nameKey: 'green_foods.banana_yogurt', co2: 0.4 },
      { id: 'bread_jam',     emoji: '🍞', nameKey: 'green_foods.bread_jam',     co2: 0.2 },
    ],
  },
  {
    id: 'lunch',
    labelKey: 'green.lunch',
    emoji: '☀️',
    foods: [
      { id: 'bean_curry',    emoji: '🫘', nameKey: 'green_foods.bean_curry',    co2: 0.6 },
      { id: 'beef_burger',   emoji: '🥩', nameKey: 'green_foods.beef_burger',   co2: 4.5 },
      { id: 'veggie_wrap',   emoji: '🌯', nameKey: 'green_foods.veggie_wrap',   co2: 0.5 },
      { id: 'chicken_salad', emoji: '🍗', nameKey: 'green_foods.chicken_salad', co2: 1.2 },
      { id: 'greek_salad',   emoji: '🥗', nameKey: 'green_foods.greek_salad',   co2: 0.3 },
      { id: 'tuna_sandwich', emoji: '🐟', nameKey: 'green_foods.tuna_sandwich', co2: 1.0 },
    ],
  },
  {
    id: 'dinner',
    labelKey: 'green.dinner',
    emoji: '🌙',
    foods: [
      { id: 'lentil_pasta',   emoji: '🍝', nameKey: 'green_foods.lentil_pasta',   co2: 0.8 },
      { id: 'lamb_chop',      emoji: '🥩', nameKey: 'green_foods.lamb_chop',      co2: 5.0 },
      { id: 'grilled_salmon', emoji: '🐟', nameKey: 'green_foods.grilled_salmon', co2: 1.5 },
      { id: 'stuffed_peppers',emoji: '🫑', nameKey: 'green_foods.stuffed_peppers',co2: 0.4 },
      { id: 'chicken_stirfry',emoji: '🍗', nameKey: 'green_foods.chicken_stirfry',co2: 1.8 },
      { id: 'veggie_stew',    emoji: '🥦', nameKey: 'green_foods.veggie_stew',    co2: 0.3 },
    ],
  },
];

export default function GreenMenu({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [introCountdown, setIntroCountdown] = useState(3);

  const i18nRef = useRef({});
  i18nRef.current = {
    title: t('green.title'),
    budget: t('green.budget'),
    total: t('green.total'),
    over_warning: t('green.over_budget_warning'),
    submit: t('green.submit'),
    champion: t('green.champion'),
    good_effort: t('green.good_effort'),
    co2_unit: t('carbon.co2_unit'),
  };

  const { gameState, setGameState, score, setScore, gameObjects, timeLeft } = useGameCanvas(
    canvasRef,
    {
      timeLimit: null,
      setup: (objects) => {
        const meals = MEALS.map((meal) => ({
          id: meal.id,
          label: t(meal.labelKey),
          emoji: meal.emoji,
          foods: meal.foods.map((f) => ({
            ...f,
            name: t(f.nameKey),
            selected: false,
          })),
          selectedCount: 0,
        }));

        // Layout: 3 meal columns
        const colW = 380;
        const colGap = 20;
        const totalW = 3 * colW + 2 * colGap;
        const startX = (CANVAS_W - totalW) / 2;
        const headerY = 120;
        const foodCardH = 56;
        const foodGap = 6;

        meals.forEach((meal, mi) => {
          const mx = startX + mi * (colW + colGap);
          meal.colX = mx;
          meal.foods.forEach((f, fi) => {
            f.x = mx;
            f.y = headerY + 36 + fi * (foodCardH + foodGap);
            f.width = colW;
            f.height = foodCardH;
          });
        });

        // Submit button
        const submitBtn = {
          x: CANVAS_W / 2 - 100,
          y: 640,
          width: 200,
          height: 48,
        };

        objects.push({
          meals,
          submitBtn,
          totalCO2: 0,
          meterPulse: 0,
          feedbackText: null,
          feedbackColor: null,
          feedbackTimer: 0,
          completed: false,
          busted: false,
        });
      },

      update: (objects, dt) => {
        const state = objects[0];
        if (!state) return;

        if (state.meterPulse > 0) state.meterPulse = Math.max(0, state.meterPulse - dt * 2);

        if (state.feedbackTimer > 0) {
          state.feedbackTimer -= dt;
          if (state.feedbackTimer <= 0) {
            state.feedbackText = null;
          }
        }
      },

      render: (ctx, objects, helpers) => {
        const state = objects[0];
        if (!state) return;
        const strings = i18nRef.current;

        // Background
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grad.addColorStop(0, '#E1F5FE');
        grad.addColorStop(0.5, '#B3E5FC');
        grad.addColorStop(1, '#81D4FA');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Title
        drawText(ctx, '🍽️ ' + strings.title, CANVAS_W / 2, 34, {
          font: "bold 22px 'Inter', system-ui, sans-serif", color: '#0D47A1', align: 'center',
        });

        // ─── CO₂ Budget Bar ──────────────────────
        // Recalculate total
        let total = 0;
        state.meals.forEach(m => m.foods.forEach(f => { if (f.selected) total += f.co2; }));
        state.totalCO2 = total;

        const meterW = 500;
        const meterH = 26;
        const meterX = (CANVAS_W - meterW) / 2;
        const meterY = 54;
        const fill = total / MAX_BUDGET;

        drawRoundedRect(ctx, meterX, meterY, meterW, meterH, 13,
          'rgba(255,255,255,0.6)', 'rgba(0,0,0,0.12)');

        const barColor = fill > 1 ? '#D32F2F' : fill > 0.75 ? '#FFB300' : '#43A047';
        const barW = Math.min(fill, 1.15) * (meterW - 4);
        if (barW > 0) {
          const pulse = state.meterPulse * 3;
          drawRoundedRect(ctx, meterX + 2, meterY + 2 - pulse / 2,
            Math.min(barW, meterW - 4), meterH - 4 + pulse, 11, barColor, 'transparent');
        }

        const budgetLabel = `${strings.total}: ${total.toFixed(1)} / ${MAX_BUDGET.toFixed(1)} ${strings.co2_unit}`;
        drawText(ctx, budgetLabel, CANVAS_W / 2, meterY + meterH / 2, {
          font: "bold 12px 'Inter', system-ui, sans-serif",
          color: fill > 0.5 ? '#fff' : '#0D47A1',
          align: 'center', baseline: 'middle',
        });

        // Over-budget warning
        if (total > MAX_BUDGET) {
          drawText(ctx, '⚠️ ' + strings.over_warning, CANVAS_W / 2, meterY + meterH + 16, {
            font: "bold 13px 'Inter', system-ui, sans-serif", color: '#D32F2F', align: 'center',
          });
        }

        // ─── 3 Meal Columns ──────────────────────
        for (const meal of state.meals) {
          // Column header
          drawText(ctx, meal.emoji + ' ' + meal.label, meal.colX + meal.foods[0].width / 2, 120, {
            font: "bold 16px 'Inter', system-ui, sans-serif", color: '#0D47A1', align: 'center',
          });

          // Selection counter
          const selCount = meal.foods.filter(f => f.selected).length;
          const counterText = `${selCount}/${ITEMS_PER_MEAL}`;
          const counterColor = selCount === ITEMS_PER_MEAL ? '#388E3C' : '#1565C0';
          drawText(ctx, counterText, meal.colX + meal.foods[0].width - 8, 120, {
            font: "bold 12px 'Inter', system-ui, sans-serif", color: counterColor, align: 'right',
          });

          // Food cards
          for (const food of meal.foods) {
            const isSel = food.selected;
            let cardFill = 'rgba(255,255,255,0.8)';
            let cardStroke = 'rgba(0,0,0,0.08)';

            if (isSel) {
              cardFill = 'rgba(102,187,106,0.35)';
              cardStroke = '#388E3C';
            }

            // Dim if meal is full and this item isn't selected
            const mealFull = selCount >= ITEMS_PER_MEAL;
            if (mealFull && !isSel) ctx.globalAlpha = 0.4;

            drawRoundedRect(ctx, food.x, food.y, food.width, food.height, 10,
              cardFill, cardStroke);

            // Emoji
            drawText(ctx, food.emoji, food.x + 24, food.y + food.height / 2, {
              font: '22px sans-serif', align: 'center', baseline: 'middle',
            });

            // Name
            drawText(ctx, food.name, food.x + 50, food.y + food.height / 2 - 2, {
              font: "13px 'Inter', system-ui, sans-serif", color: '#333',
              align: 'left', baseline: 'middle',
            });

            // CO₂ value (always visible in GreenMenu)
            const co2Color = food.co2 > 3 ? '#D32F2F' : food.co2 > 1 ? '#E65100' : '#2E7D32';
            drawText(ctx, food.co2.toFixed(1) + ' kg',
              food.x + food.width - 12, food.y + food.height / 2, {
                font: "bold 13px 'Inter', system-ui, sans-serif", color: co2Color,
                align: 'right', baseline: 'middle',
              });

            // Checkmark
            if (isSel) {
              drawText(ctx, '✓', food.x + food.width - 46, food.y + food.height / 2, {
                font: "bold 14px 'Inter', system-ui, sans-serif", color: '#388E3C',
                align: 'center', baseline: 'middle',
              });
            }

            if (mealFull && !isSel) ctx.globalAlpha = 1;
          }
        }

        // ─── Submit Button ───────────────────────
        const allFilled = state.meals.every(m =>
          m.foods.filter(f => f.selected).length >= ITEMS_PER_MEAL);

        if (allFilled) {
          const btn = state.submitBtn;
          const btnColor = total > MAX_BUDGET ? '#E53935' : '#1565C0';
          drawRoundedRect(ctx, btn.x, btn.y, btn.width, btn.height, 14,
            btnColor, 'transparent');
          drawText(ctx, '▶ ' + strings.submit, btn.x + btn.width / 2, btn.y + btn.height / 2, {
            font: "bold 16px 'Inter', system-ui, sans-serif", color: '#fff',
            align: 'center', baseline: 'middle',
          });
        }

        // ─── Feedback Toast ──────────────────────
        if (state.feedbackText && state.feedbackTimer > 0) {
          const alpha = Math.min(1, state.feedbackTimer / 0.3);
          ctx.globalAlpha = alpha;
          const fbW = 520;
          const fbH = 52;
          const fbX = (CANVAS_W - fbW) / 2;
          const fbY = 580;
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
    if (!state || state.completed || state.busted) return;

    const strings = i18nRef.current;

    // Check submit button
    const allFilled = state.meals.every(m =>
      m.foods.filter(f => f.selected).length >= ITEMS_PER_MEAL);

    if (allFilled && hitTest(pointer, state.submitBtn)) {
      if (state.totalCO2 > MAX_BUDGET) {
        state.busted = true;
        state.feedbackText = '❌ ' + strings.over_warning;
        state.feedbackColor = '#D32F2F';
        state.feedbackTimer = 2.5;
        // Delay completion to show feedback
        setTimeout(() => {
          const st = gameObjects.current[0];
          if (st) setGameState('COMPLETED');
        }, 2600);
      } else {
        state.completed = true;
        // Score: +10 per slot
        let totalScore = 3 * POINTS_PER_SLOT;
        if (state.totalCO2 <= 5) {
          totalScore += BONUS_CHAMPION;
          state.feedbackText = '🌟 ' + strings.champion;
        } else if (state.totalCO2 <= 7) {
          totalScore += BONUS_GOOD;
          state.feedbackText = '✅ ' + strings.good_effort;
        } else {
          state.feedbackText = '✅ ' + strings.good_effort;
        }
        state.feedbackColor = '#1B5E20';
        state.feedbackTimer = 2.0;
        setScore(s => s + totalScore);
        setTimeout(() => {
          setGameState('COMPLETED');
        }, 2100);
      }
      return;
    }

    // Check food card clicks
    for (const meal of state.meals) {
      const selCount = meal.foods.filter(f => f.selected).length;

      for (const food of meal.foods) {
        if (hitTest(pointer, food)) {
          if (food.selected) {
            // Deselect (swap out)
            food.selected = false;
            state.meterPulse = 0.5;
          } else if (selCount < ITEMS_PER_MEAL) {
            // Select
            food.selected = true;
            state.meterPulse = 1;
          }
          // If meal is full and clicking unselected — ignore (dimmed)
          return;
        }
      }
    }
  }, [gameState]);

  const displayTime = timeLeft != null ? Math.ceil(timeLeft) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#E1F5FE', overflow: 'hidden' }}>
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
          <h2 style={{ fontSize: 28, marginBottom: 12, color: '#0D47A1' }}>🍽️ {t('green.intro_title')}</h2>
          <p style={{ fontSize: 18, color: '#1565C0', marginBottom: 24 }}>{t('green.intro_desc')}</p>
          <span style={{ fontSize: 72, fontWeight: 'bold', color: '#1976D2' }}>{introCountdown}</span>
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
    background: 'rgba(225,245,254,0.95)',
    backdropFilter: 'blur(8px)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    color: '#0D47A1', zIndex: 30,
  },
};
