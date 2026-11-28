import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useGameCanvas from '../hooks/useGameCanvas.js';
import { drawRoundedRect, drawText, hitTest, getCanvasPointer } from '../../utils/canvas.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * BalanceScale — Climate Impact Island, Mission 3
 *
 * Mechanic: Binary comparison (which food has higher CO₂?)
 * Goal: Predict which of 2 foods has a higher carbon footprint
 * Items: 10 pre-defined pairs
 * Correct: +10 points, scale tips to heavier side
 * Wrong: 0 points, scale tips to reveal correct answer
 * CO₂ values revealed after choice, auto-advance 3s
 * Pass threshold: >=60% correct
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;
const POINTS_CORRECT = 10;
const PASS_THRESHOLD = 0.6;
const MAX_TILT = 0.25; // radians (~14°)

// CO₂ values in kg CO₂e per kg (or per L for liquids)
// Sources: Our World in Data, Poore & Nemecek 2018
const FOOD_CO2 = {
  beef: 27.0,
  lentils: 0.9,
  local_apple: 0.4,
  imported_banana: 1.1,
  cheese: 13.5,
  tofu: 3.0,
  lamb: 24.0,
  chicken: 6.9,
  butter: 11.9,
  olive_oil: 6.0,
  rice: 4.0,
  potatoes: 0.3,
  chocolate: 19.0,
  bread: 1.4,
  shrimp: 12.0,
  eggs: 4.5,
  milk: 3.2,
  oat_milk: 0.9,
  pork: 7.6,
  beans: 0.8,
};

// Emoji for each food
const FOOD_EMOJI = {
  beef: '\uD83E\uDD69',
  lentils: '\uD83E\uDED8',
  local_apple: '\uD83C\uDF4F',
  imported_banana: '\uD83C\uDF4C',
  cheese: '\uD83E\uDDC0',
  tofu: '\uD83E\uDDC8',
  lamb: '\uD83E\uDD69',
  chicken: '\uD83C\uDF57',
  butter: '\uD83E\uDDC8',
  olive_oil: '\uD83E\uDED2',
  rice: '\uD83C\uDF5A',
  potatoes: '\uD83E\uDD54',
  chocolate: '\uD83C\uDF6B',
  bread: '\uD83C\uDF5E',
  shrimp: '\uD83E\uDD90',
  eggs: '\uD83E\uDD5A',
  milk: '\uD83E\uDD5B',
  oat_milk: '\uD83C\uDF3E',
  pork: '\uD83E\uDD69',
  beans: '\uD83E\uDED8',
};

// 10 pairs — the answer is always the one with higher CO₂
const PAIRS = [
  ['beef', 'lentils'],
  ['local_apple', 'imported_banana'],
  ['cheese', 'tofu'],
  ['lamb', 'chicken'],
  ['butter', 'olive_oil'],
  ['rice', 'potatoes'],
  ['chocolate', 'bread'],
  ['shrimp', 'eggs'],
  ['milk', 'oat_milk'],
  ['pork', 'beans'],
];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function BalanceScale({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [introCountdown, setIntroCountdown] = useState(3);

  const i18nRef = useRef({});
  i18nRef.current = {
    title: t('balance.title'),
    pick: t('balance.pick'),
    correct: t('balance.correct'),
    wrong: (food) => t('balance.wrong', { food }),
    co2Label: (value) => t('balance.co2_label', { value }),
    progress: (done, total) => t('balance.progress', { done, total }),
    vs: t('balance.vs'),
  };

  const { gameState, setGameState, score, setScore, gameObjects, timeLeft } = useGameCanvas(
    canvasRef,
    {
      timeLimit: null,
      setup: (objects) => {
        // Shuffle pairs, and randomly swap left/right within each pair
        const shuffledPairs = shuffleArray(PAIRS).map((pair) =>
          Math.random() > 0.5 ? [pair[1], pair[0]] : [...pair]
        );

        const pairs = shuffledPairs.map(([left, right]) => ({
          left: {
            key: left,
            name: t('balance_foods.' + left),
            emoji: FOOD_EMOJI[left],
            co2: FOOD_CO2[left],
          },
          right: {
            key: right,
            name: t('balance_foods.' + right),
            emoji: FOOD_EMOJI[right],
            co2: FOOD_CO2[right],
          },
        }));

        // Pick buttons — positioned below each tray
        const leftBtn  = { x: 200,  y: 540, width: 200, height: 56 };
        const rightBtn = { x: 880,  y: 540, width: 200, height: 56 };

        objects.push({
          pairs,
          leftBtn,
          rightBtn,
          currentIndex: 0,
          correctCount: 0,
          // Answer state
          chosen: null,       // 'left' | 'right' | null
          isCorrect: null,
          feedbackTimer: 0,
          // Scale animation
          tiltAngle: 0,       // current angle (lerps towards target)
          tiltTarget: 0,      // target angle after answer
          // Card animation
          cardScale: 0,
          cardScaleTimer: 0,
        });
      },

      update: (objects, dt, helpers) => {
        const state = objects[0];
        if (!state) return;

        // Card entrance animation
        if (state.cardScaleTimer < 0.3) {
          state.cardScaleTimer += dt;
          state.cardScale = Math.min(1, state.cardScaleTimer / 0.3);
        }

        // Scale tilt lerp
        const tiltSpeed = 3.0;
        const diff = state.tiltTarget - state.tiltAngle;
        if (Math.abs(diff) > 0.001) {
          state.tiltAngle += diff * tiltSpeed * dt;
        } else {
          state.tiltAngle = state.tiltTarget;
        }

        // Auto-advance after feedback
        if (state.feedbackTimer > 0) {
          state.feedbackTimer -= dt;
          if (state.feedbackTimer <= 0) {
            state.currentIndex++;
            state.chosen = null;
            state.isCorrect = null;
            state.tiltAngle = 0;
            state.tiltTarget = 0;
            state.cardScaleTimer = 0;
            state.cardScale = 0;

            if (state.currentIndex >= state.pairs.length) {
              helpers.complete();
            }
          }
        }
      },

      render: (ctx, objects) => {
        const state = objects[0];
        if (!state) return;
        const strings = i18nRef.current;

        // Background — sky blue gradient
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grad.addColorStop(0, '#E1F5FE');
        grad.addColorStop(0.5, '#B3E5FC');
        grad.addColorStop(1, '#81D4FA');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Title
        drawText(ctx, '\u2696\uFE0F ' + strings.title, CANVAS_W / 2, 36, {
          font: "bold 22px 'Inter', system-ui, sans-serif", color: '#0D47A1', align: 'center',
        });

        // Progress
        const done = Math.min(state.currentIndex + (state.chosen != null ? 1 : 0), state.pairs.length);
        drawText(ctx, strings.progress(done, state.pairs.length), CANVAS_W / 2, 64, {
          font: "16px 'Inter', system-ui, sans-serif", color: '#1565C0', align: 'center',
        });

        if (state.currentIndex >= state.pairs.length) return;

        const pair = state.pairs[state.currentIndex];
        const angle = state.tiltAngle;

        // ─── Draw scale ───────────────────────────────
        const cx = CANVAS_W / 2;
        const baseY = 470;
        const beamLen = 320;

        // Base / pillar
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(cx - 12, baseY - 10, 24, 60);
        // Base platform
        drawRoundedRect(ctx, cx - 60, baseY + 48, 120, 16, 6,
          '#795548', '#4E342E');

        // Pivot circle
        ctx.beginPath();
        ctx.arc(cx, baseY - 10, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#8D6E63';
        ctx.fill();
        ctx.strokeStyle = '#4E342E';
        ctx.stroke();

        // Beam (tilts around pivot)
        ctx.save();
        ctx.translate(cx, baseY - 10);
        ctx.rotate(angle);

        // Beam bar
        ctx.fillStyle = '#6D4C41';
        ctx.fillRect(-beamLen, -4, beamLen * 2, 8);

        // Left tray
        const trayW = 160;
        const trayH = 12;
        const chainLen = 70;
        const leftTrayX = -beamLen;
        const rightTrayX = beamLen;

        // Chains (left)
        ctx.strokeStyle = '#8D6E63';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(leftTrayX, 0);
        ctx.lineTo(leftTrayX, chainLen);
        ctx.stroke();
        // Tray (left)
        drawRoundedRect(ctx, leftTrayX - trayW / 2, chainLen, trayW, trayH, 4,
          '#A1887F', '#6D4C41');

        // Chains (right)
        ctx.beginPath();
        ctx.moveTo(rightTrayX, 0);
        ctx.lineTo(rightTrayX, chainLen);
        ctx.stroke();
        // Tray (right)
        drawRoundedRect(ctx, rightTrayX - trayW / 2, chainLen, trayW, trayH, 4,
          '#A1887F', '#6D4C41');
        ctx.lineWidth = 1;

        ctx.restore();

        // ─── Food cards (positioned relative to tray ends) ────
        // Calculate tray world positions from tilt
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const leftWorldX = cx + (-beamLen) * cosA;
        const leftWorldY = (baseY - 10) + (-beamLen) * sinA + 70; // + chain length
        const rightWorldX = cx + beamLen * cosA;
        const rightWorldY = (baseY - 10) + beamLen * sinA + 70;

        const cardW = 200;
        const cardH = 170;

        // Apply card scale
        const s = state.cardScale;

        // Left food card
        this_renderFoodCard(ctx, pair.left, leftWorldX - cardW / 2, leftWorldY - cardH - 25, cardW, cardH, s, state, 'left', strings);

        // Right food card
        this_renderFoodCard(ctx, pair.right, rightWorldX - cardW / 2, rightWorldY - cardH - 25, cardW, cardH, s, state, 'right', strings);

        // "vs" label
        ctx.globalAlpha = 0.5;
        drawText(ctx, strings.vs, cx, baseY - 55, {
          font: "bold 20px 'Inter', system-ui, sans-serif", color: '#5D4037',
          align: 'center', baseline: 'middle',
        });
        ctx.globalAlpha = 1;

        // ─── Pick buttons ─────────────────────────────
        if (state.chosen == null) {
          renderPickBtn(ctx, state.leftBtn, strings.pick, '#1565C0');
          renderPickBtn(ctx, state.rightBtn, strings.pick, '#1565C0');
        }

        // ─── Feedback toast ───────────────────────────
        if (state.chosen != null && state.feedbackTimer > 0) {
          const heavierFood = pair.left.co2 > pair.right.co2 ? pair.left : pair.right;
          const fbText = state.isCorrect
            ? '\u2705 ' + strings.correct
            : '\u274C ' + strings.wrong(heavierFood.name);
          const fbColor = state.isCorrect ? '#1B5E20' : '#E65100';

          const alpha = state.feedbackTimer < 0.5
            ? state.feedbackTimer / 0.5 : 1;
          ctx.globalAlpha = alpha;

          const fbW = 500;
          const fbH = 46;
          const fbX = cx - fbW / 2;
          const fbY = CANVAS_H - 60;
          drawRoundedRect(ctx, fbX, fbY, fbW, fbH, 14,
            'rgba(255,255,255,0.95)', fbColor);
          drawText(ctx, fbText, cx, fbY + fbH / 2, {
            font: "bold 16px 'Inter', system-ui, sans-serif", color: fbColor,
            align: 'center', baseline: 'middle',
          });
          ctx.globalAlpha = 1;
        }

        // ─── Progress dots ────────────────────────────
        const dotY = CANVAS_H - 18;
        const dotSpacing = 28;
        const dotsStartX = cx - ((state.pairs.length - 1) * dotSpacing) / 2;
        for (let i = 0; i < state.pairs.length; i++) {
          ctx.beginPath();
          ctx.arc(dotsStartX + i * dotSpacing, dotY, 7, 0, Math.PI * 2);
          ctx.fillStyle = i < state.currentIndex ? '#81C784'
            : i === state.currentIndex ? '#29B6F6' : 'rgba(0,0,0,0.12)';
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

  // Handle completion
  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const state = gameObjects.current[0];
      const correct = state ? state.correctCount : 0;
      const passed = state ? (correct / state.pairs.length >= PASS_THRESHOLD) : false;
      setTimeout(() => onComplete(score, passed), 1000);
    }
  }, [gameState]);

  // ─── Click handler ──────────────────────────────

  const handlePointerDown = useCallback((e) => {
    if (gameState !== 'PLAYING') return;
    const canvas = canvasRef.current;
    const pointer = getCanvasPointer(canvas, e);
    const state = gameObjects.current[0];
    if (!state || state.chosen != null) return;

    const pair = state.pairs[state.currentIndex];
    const strings = i18nRef.current;
    let chosenSide = null;

    if (hitTest(pointer, state.leftBtn)) {
      chosenSide = 'left';
    } else if (hitTest(pointer, state.rightBtn)) {
      chosenSide = 'right';
    }

    if (!chosenSide) return;

    const chosenFood = chosenSide === 'left' ? pair.left : pair.right;
    const heavierFood = pair.left.co2 > pair.right.co2 ? pair.left : pair.right;
    const isCorrect = chosenFood.key === heavierFood.key;

    state.chosen = chosenSide;
    state.isCorrect = isCorrect;

    // Tilt towards heavier side (left = negative angle, right = positive)
    if (pair.left.co2 > pair.right.co2) {
      state.tiltTarget = -MAX_TILT;
    } else {
      state.tiltTarget = MAX_TILT;
    }

    if (isCorrect) {
      state.correctCount++;
      setScore((s) => s + POINTS_CORRECT);
    }

    state.feedbackTimer = 3.0;
  }, [gameState]);

  const displayTime = timeLeft != null ? Math.ceil(timeLeft) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#E1F5FE', overflow: 'hidden' }}>
      <ScoreBar
        score={score}
        timeLeft={displayTime}
        onPause={() => setGameState('PAUSED')}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: 'calc(100vh - 60px)',
            aspectRatio: '1280 / 720',
            objectFit: 'contain',
            imageRendering: 'pixelated',
            touchAction: 'none',
            cursor: 'pointer',
          }}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
        />
      </div>

      {/* Intro countdown overlay */}
      {introCountdown > 0 && (
        <div style={styles.introOverlay}>
          <h2 style={{ fontSize: 28, marginBottom: 12, color: '#0D47A1' }}>
            {'\u2696\uFE0F'} {t('balance.intro_title')}
          </h2>
          <p style={{ fontSize: 18, color: '#1565C0', marginBottom: 24 }}>
            {t('balance.intro_desc')}
          </p>
          <span style={{ fontSize: 72, fontWeight: 'bold', color: '#29B6F6' }}>
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

// ─── Rendering helpers (module-level, not methods) ────

function this_renderFoodCard(ctx, food, x, y, w, h, scale, state, side, strings) {
  ctx.save();

  if (scale < 1) {
    const cxCard = x + w / 2;
    const cyCard = y + h / 2;
    ctx.translate(cxCard, cyCard);
    ctx.scale(scale, scale);
    ctx.translate(-cxCard, -cyCard);
  }

  // Highlight if chosen
  let fill = 'rgba(255,255,255,0.9)';
  let stroke = 'rgba(13,71,161,0.2)';

  if (state.chosen != null) {
    const isThisSide = state.chosen === side;
    if (isThisSide && state.isCorrect) {
      fill = 'rgba(102,187,106,0.4)';
      stroke = '#388E3C';
    } else if (isThisSide && !state.isCorrect) {
      fill = 'rgba(255,112,67,0.35)';
      stroke = '#D84315';
    } else if (!isThisSide && !state.isCorrect) {
      // This is the correct side (not chosen)
      fill = 'rgba(102,187,106,0.3)';
      stroke = '#388E3C';
    }
  }

  // Card shadow
  drawRoundedRect(ctx, x + 2, y + 3, w, h, 16, 'rgba(0,0,0,0.06)', 'transparent');
  // Card body
  drawRoundedRect(ctx, x, y, w, h, 16, fill, stroke);

  // Emoji
  drawText(ctx, food.emoji, x + w / 2, y + 50, {
    font: '48px sans-serif', align: 'center',
  });

  // Name
  drawText(ctx, food.name, x + w / 2, y + 105, {
    font: "bold 16px 'Inter', system-ui, sans-serif", color: '#0D47A1', align: 'center',
  });

  // CO₂ value (revealed after choice)
  if (state.chosen != null) {
    const co2Text = strings.co2Label(food.co2.toFixed(1));
    drawText(ctx, co2Text, x + w / 2, y + h - 18, {
      font: "bold 14px 'Inter', system-ui, sans-serif", color: '#E65100', align: 'center',
    });
  }

  ctx.restore();
}

function renderPickBtn(ctx, btn, label, color) {
  // Shadow
  drawRoundedRect(ctx, btn.x + 2, btn.y + 3, btn.width, btn.height, 14,
    'rgba(0,0,0,0.08)', 'transparent');
  // Button
  drawRoundedRect(ctx, btn.x, btn.y, btn.width, btn.height, 14,
    color, 'rgba(255,255,255,0.3)');
  // Label
  drawText(ctx, '\u261D\uFE0F ' + label, btn.x + btn.width / 2, btn.y + btn.height / 2, {
    font: "bold 18px 'Inter', system-ui, sans-serif", color: '#fff',
    align: 'center', baseline: 'middle',
  });
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
