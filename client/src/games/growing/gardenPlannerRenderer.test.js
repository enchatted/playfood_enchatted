import { describe, expect, it } from 'vitest';
import { DIR } from '../engine/gameRoomLogic.js';
import {
  getWateringArcPoints, renderCarryOverlay, renderDecisionEvent,
  renderFeedbackToast, renderSeedCrates, renderRunLostCard,
  runLostCardScale, objectiveBannerTop, RUN_LOST_MIN_BODY_CSS_PX,
  canvasCssGeometry, hudTopInsetFor,
  objectiveBannerLayout, OBJ_MIN_CSS_PX, sideZones, sideMessagesHidden, SIDE_LAYOUT_MAX_SCALE,
  feedbackToastLayout, renderPhaseObjective, renderFeedbackToast,
} from '../engine/gardenPlannerRenderer.js';

function recordingContext() {
  let currentPath = [];
  return {
    filledPaths: [],
    fills: [],
    rects: [],
    texts: [],
    save() {},
    restore() {},
    beginPath() { currentPath = []; },
    moveTo(x, y) { currentPath.push({ x, y }); },
    lineTo(x, y) { currentPath.push({ x, y }); },
    quadraticCurveTo() {},
    arc() {},
    closePath() {},
    fill() {
      this.filledPaths.push([...currentPath]);
      this.fills.push({ path: [...currentPath], color: this.fillStyle });
    },
    stroke() {},
    fillRect(x, y, width, height) {
      this.rects.push({ x, y, width, height, color: this.fillStyle });
    },
    strokeRect() {},
    fillText(text, x, y) {
      this.texts.push({ text, x, y, color: this.fillStyle });
    },
    measureText(text) { return { width: String(text).length * 8 }; },
    createRadialGradient() { return { addColorStop() {} }; },
    globalAlpha: 1,
  };
}

describe('Garden Planner crop identity', () => {
  it('draws distinct pixel markers instead of the planted sprout for peas and green beans', () => {
    const peasContext = recordingContext();
    const beansContext = recordingContext();

    renderSeedCrates(peasContext, [{
      col: 1, row: 1, seedId: 'peas', emoji: '🌱', marker: 'peas',
    }], null, null, 0, 'PLANT');
    renderSeedCrates(beansContext, [{
      col: 1, row: 1, seedId: 'green_beans', emoji: '🌱', marker: 'green_beans',
    }], null, null, 0, 'PLANT');

    expect(peasContext.texts.map(({ text }) => text)).not.toContain('🌱');
    expect(beansContext.texts.map(({ text }) => text)).not.toContain('🌱');
    expect(peasContext.fills.map(({ color }) => color)).toContain('#C5E1A5');
    expect(beansContext.fills.map(({ color }) => color)).toContain('#8BC34A');
  });

  it('keeps the selected plant name visible while the child carries it', () => {
    const ctx = recordingContext();
    const player = { pixelX: 4 * 32, pixelY: 5 * 32 };

    renderCarryOverlay(ctx, player, {
      seed: { id: 'peas', emoji: '🌱', marker: 'peas', name: 'Peas' },
    }, 0, (key) => key);

    expect(ctx.texts.some(({ text }) => text === 'Peas')).toBe(true);
  });

  it('draws cabbage and spinach as distinct pixel crops instead of generic emoji', () => {
    const cabbageContext = recordingContext();
    const spinachContext = recordingContext();

    renderSeedCrates(cabbageContext, [{
      col: 1, row: 1, seedId: 'cabbage', emoji: '🥬', marker: 'cabbage',
    }], null, null, 0, 'PLANT');
    renderSeedCrates(spinachContext, [{
      col: 1, row: 1, seedId: 'spinach', emoji: '🌿', marker: 'spinach',
    }], null, null, 0, 'PLANT');

    expect(cabbageContext.texts.map(({ text }) => text)).not.toContain('🥬');
    expect(spinachContext.texts.map(({ text }) => text)).not.toContain('🌿');
    expect(cabbageContext.fills.map(({ color }) => color)).toContain('#7CB342');
    expect(spinachContext.fills.map(({ color }) => color)).toContain('#2E7D32');
  });

  it('marks a crop already planted in the active season as unavailable', () => {
    const ctx = recordingContext();

    renderSeedCrates(ctx, [{
      col: 1, row: 1, seedId: 'watermelon', emoji: '🍉',
    }], null, null, 0, 'PLANT', new Set(['watermelon']));

    expect(ctx.texts.map(({ text }) => text)).toContain('✓');
    expect(ctx.texts.map(({ text }) => text)).not.toContain('🍉');
  });
});

describe('Garden Planner watering arc', () => {
  it('keeps a visible stream when the player stands on the watered plot', () => {
    const player = {
      col: 3, row: 2, pixelX: 3 * 32, pixelY: 2 * 32, dir: DIR.DOWN,
    };
    const points = getWateringArcPoints(player, { col: 3, row: 2 });
    const distance = Math.hypot(points.tx - points.px, points.ty - points.py);

    expect(distance).toBeGreaterThan(10);
    expect(points.midY).toBeLessThan(Math.min(points.py, points.ty));
  });
});

describe('Garden Planner decision selection', () => {
  it('draws a four-point diamond beside the current unconfirmed option', () => {
    const ctx = recordingContext();
    const state = {
      decisionEvent: {
        selected: 0,
        answered: false,
        event: {
          id: 'pollinators',
          emoji: '🐝',
          options: [
            { id: 'sunflower', emoji: '🌻', correct: true },
            { id: 'lavender', emoji: '🌿', correct: false },
            { id: 'both', emoji: '🐝', correct: false },
          ],
        },
      },
    };
    const labels = {
      'garden.event.pollinators_q': 'Which plant attracts pollinators?',
      'garden.event.pollinators_opt_sunflower': 'Sunflower',
      'garden.event.pollinators_opt_lavender': 'Lavender',
      'garden.event.pollinators_opt_both': 'Both',
      'garden.event.pick_hint': 'Choose, then confirm',
    };

    renderDecisionEvent(ctx, state, (key) => labels[key] || key);

    expect(ctx.filledPaths).toContainEqual([
      { x: 408, y: 274 },
      { x: 415, y: 281 },
      { x: 408, y: 288 },
      { x: 401, y: 281 },
    ]);
    const optionTexts = ctx.texts.filter(({ text }) => /Sunflower|Lavender|Both/.test(text));
    expect(optionTexts.map(({ text }) => text)).toEqual([
      '🌻 Sunflower', '🌿 Lavender', '🐝 Both',
    ]);
    expect(new Set(optionTexts.map(({ x }) => x))).toEqual(new Set([428]));
  });

  it('shows the garden consequence and uses an amber, non-punitive wrong choice', () => {
    const ctx = recordingContext();
    const state = {
      decisionEvent: {
        selected: 1,
        answered: true,
        consequenceText: 'Heirloom seeds are often more nutritious and adapted.',
        event: {
          id: 'seed_choice',
          emoji: '🌱',
          options: [
            { id: 'heirloom_local', emoji: '🌾', correct: true },
            { id: 'imported', emoji: '📦', correct: false },
            { id: 'artificial', emoji: '🧪', correct: false },
          ],
        },
      },
    };
    const labels = {
      'garden.event.seed_choice_q': 'Choose seeds for your garden!',
      'garden.event.seed_choice_opt_heirloom_local': 'Heirloom / local seeds',
      'garden.event.seed_choice_opt_imported': 'Unknown imported seeds',
      'garden.event.seed_choice_opt_artificial': 'Artificial seeds only',
      'garden.event.consequence': 'What happens in the garden?',
      'garden.event.continue': 'Continue',
    };

    renderDecisionEvent(ctx, state, (key) => labels[key] || key);

    expect(ctx.texts.some(({ text }) => text.includes('What happens in the garden?'))).toBe(true);
    expect(ctx.texts.some(({ text }) => text.includes('Heirloom seeds are often'))).toBe(true);
    const selectedAnswer = ctx.texts.find(({ text }) => text.includes('Unknown imported seeds'));
    expect(selectedAnswer).toMatchObject({ color: '#6D3B00' });
    expect(selectedAnswer.text).not.toContain('✗');
  });
});

describe('Garden Planner sourced feedback', () => {
  it('shows the keyboard shortcut inside the source control', () => {
    const ctx = recordingContext();
    const state = {
      feedbackText: 'Best choice: both!',
      feedbackEduText: 'Old varieties are pollinated naturally.',
      feedbackSourceId: 'heirloom-seeds',
      feedbackTimer: 6,
      feedbackColor: '#2E7D32',
    };
    const labels = {
      'result.source_link': 'see source ↗',
      'garden.press_s': 'Press S',
    };

    renderFeedbackToast(ctx, state, (key) => labels[key] || key);

    expect(ctx.texts.some(({ text }) => text === 'see source ↗ · Press S')).toBe(true);
    expect(state.sourceBadgeRect).not.toBeNull();
  });

  it('wraps a long primary message inside the feedback card', () => {
    const ctx = recordingContext();
    const message = '⚠️ This plant is healthy. It needs the harvest basket, not the compost bin.';
    const state = {
      feedbackText: message,
      feedbackEduText: null,
      feedbackSourceId: null,
      feedbackTimer: 4,
      feedbackColor: '#E65100',
    };

    renderFeedbackToast(ctx, state, (key) => key);

    const renderedLines = ctx.texts.map(({ text }) => text);
    expect(renderedLines).not.toContain(message);
    expect(renderedLines.length).toBeGreaterThan(1);
    expect(renderedLines.every((line) => ctx.measureText(line).width <= 392)).toBe(true);
    expect(renderedLines.join(' ').replace(/\s+/g, ' ').trim()).toBe(message);
  });
});

// Check the card shown when the harvest goal becomes unreachable.
describe('Garden Planner run-lost card', () => {
  const strings = {
    lostTitle: '🥀 You can no longer reach 5 healthy crops',
    lostBody: (n) => `${n} plants wilted because they were planted in the wrong season. Check each seed's season and try again!`,
    lostContinue: 'Press Enter, Space or the on-screen A button to continue',
  };

  it('draws title, the mistake line, the body and the continue hint, and exposes its tap area', () => {
    const ctx = recordingContext();
    const state = { runLost: { wrongLine: '🥀 🌽 Grows in summer, not spring!', wilted: 4 } };
    renderRunLostCard(ctx, state, strings);
    const texts = ctx.texts.map(({ text }) => text);
    expect(texts[0]).toBe(strings.lostTitle);
    expect(texts[texts.length - 1]).toBe(strings.lostContinue);
    expect(texts.slice(1, -1).join(' ')).toBe(`🥀 🌽 Grows in summer, not spring! ${strings.lostBody(4)}`);
    expect(state.runLostRect).toMatchObject({ w: 600 });
    expect(state.runLostRect.h).toBeGreaterThan(100);
  });

  it('draws nothing and clears the tap area when no round is lost', () => {
    const ctx = recordingContext();
    const state = { runLost: null, runLostRect: { x: 1, y: 1, w: 1, h: 1 } };
    renderRunLostCard(ctx, state, strings);
    expect(ctx.texts).toEqual([]);
    expect(ctx.rects).toEqual([]);
    expect(state.runLostRect).toBeNull();
  });
});

// The card remains readable and the banner stays below the top bar.
describe('Garden Planner small-screen layout helpers', () => {
  it('keeps full-size screens as they were and grows the card type on 844×390', () => {
    expect(runLostCardScale(1.067)).toBe(1);          // 1366×768
    expect(runLostCardScale(undefined)).toBe(1);
    const u = runLostCardScale(0.554);                // 844×390
    expect(u).toBeGreaterThan(1.6);
    expect(15 * u * 0.554).toBeCloseTo(RUN_LOST_MIN_BODY_CSS_PX, 5);
  });

  it('draws the card wider and its text larger when the canvas is scaled down', () => {
    const big = recordingContext();
    const small = recordingContext();
    const base = { runLost: { wrongLine: '🥀 x', wilted: 4 } };
    renderRunLostCard(big, { ...base }, { lostTitle: 'T', lostBody: () => 'B', lostContinue: 'C' });
    const st = { ...base, cssScale: 0.554 };
    renderRunLostCard(small, st, { lostTitle: 'T', lostBody: () => 'B', lostContinue: 'C' });
    expect(st.runLostRect.w).toBeGreaterThan(900);
    expect(st.runLostRect.w).toBeLessThanOrEqual(1220);
  });

  it('puts the step banner below the top bar only when the bar covers it', () => {
    expect(objectiveBannerTop({})).toBe(52);
    expect(objectiveBannerTop({ hudTopInset: 39 })).toBe(52);
    expect(objectiveBannerTop({ hudTopInset: 86.4 })).toBe(87);
  });
});

// Review 06/10, P2: the scale is the REAL uniform HiDPI scale, not rect.width / 1280.
describe('Garden Planner logical → CSS geometry (real HiDPI scale)', () => {
  // Same geometry utils/hidpi.js writes on canvas.__hidpi.
  const hidpiCanvas = (cssW, cssH, dpr) => {
    const bw = Math.round(cssW * dpr); const bh = Math.round(cssH * dpr);
    const k = Math.min(bw / 1280, bh / 704);
    return { width: bw, height: bh, __hidpi: { k, ox: (bw - 1280 * k) / 2, oy: (bh - 704 * k) / 2 } };
  };
  const rect = (left, top, width, height) => ({ left, top, width, height });

  it('844×390 (height-limited, dpr 1 and 2): 390/704, not 844/1280', () => {
    for (const dpr of [1, 2]) {
      const g = canvasCssGeometry(hidpiCanvas(844, 390, dpr), rect(0, 0, 844, 390));
      expect(g.scale).toBeCloseTo(390 / 704, 3);
      expect(g.originX).toBeCloseTo((844 - 1280 * 390 / 704) / 2, 1);
      expect(g.originY).toBeCloseTo(0, 5);
    }
  });

  it('a tall box: the logical origin is the letterboxed one (oy), not the element top', () => {
    const g = canvasCssGeometry(hidpiCanvas(1024, 700, 1), rect(0, 50, 1024, 700));
    expect(g.scale).toBeCloseTo(0.8, 5);
    expect(g.originY).toBeCloseTo(50 + (700 - 704 * 0.8) / 2, 5);
    // the banner starts 6 CSS px under a bar ending at y = 120
    const inset = hudTopInsetFor(g, 120);
    expect(g.originY + inset * g.scale).toBeCloseTo(126, 5);
  });

  it('without HiDPI geometry the old element-width ratio is kept', () => {
    const g = canvasCssGeometry({ width: 1280, height: 704 }, rect(0, 10, 640, 352));
    expect(g).toEqual({ scale: 0.5, originX: 0, originY: 10 });
    expect(canvasCssGeometry(null, rect(0, 0, 1, 1))).toBeNull();
    expect(hudTopInsetFor(null, 50)).toBe(0);
  });

  it('with the real scale the card body is ≥ 14 CSS px at 844×390 and 1920×700', () => {
    for (const [w, h] of [[844, 390], [1920, 650]]) {
      const { scale } = canvasCssGeometry(hidpiCanvas(w, h, 1), rect(0, 0, w, h));
      const u = runLostCardScale(scale);
      expect(Math.ceil(15 * u) * scale).toBeGreaterThanOrEqual(RUN_LOST_MIN_BODY_CSS_PX - 1e-9);
    }
  });

  it('NEGATIVE CONTROL: the old width-only ratio leaves the body under 14 CSS px', () => {
    for (const [w, h] of [[844, 390], [1920, 650]]) {
      const real = canvasCssGeometry(hidpiCanvas(w, h, 1), rect(0, 0, w, h)).scale;
      const old = w / 1280;
      expect(old).toBeGreaterThan(real);
      const body = Math.ceil(15 * runLostCardScale(old)) * real; // what the screen really shows
      expect(body).toBeLessThan(RUN_LOST_MIN_BODY_CSS_PX);
    }
    // and its banner inset leaves the banner's top edge behind a 42 px bar
    const c = hidpiCanvas(844, 390, 1); const real = canvasCssGeometry(c, rect(0, 0, 844, 390));
    const oldInset = (42 + 6 - 0) / (844 / 1280);
    expect(real.originY + Math.ceil(oldInset) * real.scale).toBeLessThan(42);
  });
});

// Step banner + feedback toast (12/10): ≥ 13 CSS px, side strips on small screens.
describe('Garden Planner step banner and feedback toast placement', () => {
  const tr = (k) => ({ 'garden.obj_pick_seed': 'Pick a seed from a crate' }[k] || k);
  // 844×390, DPR 1: canvas 844 wide, logical x = 0 drawn at 67.45 CSS px, scale 390/704
  const small = () => ({
    cssScale: 390 / 704, cssOriginX: (844 - 1280 * 390 / 704) / 2, cssViewW: 844,
    hudTopInset: 87, ctrlTopLeft: 242 / (390 / 704), ctrlTopRight: 284 / (390 / 704),
    phase: 'PLANT', carrying: null, plots: [],
  });

  it('banner type is at least 13 CSS px at every scale it grows for, and old size above that', () => {
    const ctx = recordingContext();
    for (const scale of [390 / 704, 0.8, 1366 / 1280]) {
      const L = objectiveBannerLayout(ctx, 'x', scale);
      expect(L.fs * scale).toBeGreaterThanOrEqual(OBJ_MIN_CSS_PX - 1e-9);
    }
    expect(objectiveBannerLayout(ctx, 'x', 1.2).fs).toBe(12);   // 12 × 1.2 ≥ 13: unchanged
    expect(objectiveBannerLayout(ctx, 'x', undefined).fs).toBe(12);
  });

  it('banner wraps to its width and keeps every word', () => {
    const ctx = recordingContext(); // 8 px per character
    const text = 'aaaa bbbb cccc dddd eeee ffff gggg';
    const L = objectiveBannerLayout(ctx, text, 0.554, 200);
    expect(L.lines.length).toBeGreaterThan(1);
    expect(L.lines.join(' ')).toBe(text);
    expect(L.bw).toBeLessThanOrEqual(200);
  });

  it('side strips exist only on small screens with measured page geometry', () => {
    const z = sideZones(small());
    expect(z).not.toBeNull();
    expect(z.left.x1).toBeLessThan(z.right.x0);
    expect(z.left.y1).toBeCloseTo(242 / (390 / 704) - 8 / (390 / 704), 5);
    expect(z.right.y1).toBeCloseTo(284 / (390 / 704) - 8 / (390 / 704), 5);
    expect(sideZones({ ...small(), cssScale: SIDE_LAYOUT_MAX_SCALE })).toBeNull();
    expect(sideZones({ ...small(), cssScale: 0.8 })).toBeNull();
    expect(sideZones({ ...small(), cssOriginX: undefined })).toBeNull();
    // no controls on the page: the strips run to the canvas bottom
    expect(sideZones({ ...small(), ctrlTopLeft: null }).left.y1).toBeCloseTo(704 - 8 / (390 / 704), 5);
  });

  it('small screen: the banner is drawn in the left strip, and hidden under the intro and cards', () => {
    const ctx = recordingContext();
    const st = small();
    renderPhaseObjective(ctx, st, tr);
    const z = sideZones(st);
    expect(st.objectiveBannerRect.side).toBe(true);
    expect(st.objectiveBannerRect.x).toBeGreaterThanOrEqual(z.left.x0);
    expect(st.objectiveBannerRect.x + st.objectiveBannerRect.w).toBeLessThanOrEqual(z.left.x1);
    expect(ctx.texts.map((x) => x.text).join(' ')).toBe('Pick a seed from a crate');
    for (const k of ['showMissionIntro', 'decisionEvent', 'pendingEvent', 'runLost']) {
      const c = recordingContext(); const s2 = { ...small(), [k]: {} };
      expect(sideMessagesHidden(s2)).toBe(true);
      renderPhaseObjective(c, s2, tr);
      expect(c.texts, k).toEqual([]);
      expect(s2.objectiveBannerRect).toBeNull();
    }
  });

  it('larger screens: banner centred under the bar, as before', () => {
    const ctx = recordingContext();
    const st = { cssScale: 0.8, hudTopInset: 0, phase: 'PLANT', carrying: null, plots: [] };
    renderPhaseObjective(ctx, st, tr);
    expect(st.objectiveBannerRect.side).toBe(false);
    expect(st.objectiveBannerRect.x + st.objectiveBannerRect.w / 2).toBeCloseTo(640, 5);
    expect(st.objectiveBannerRect.y).toBe(52);
  });

  it('toast: right strip on small screens with every fact line; centred under the banner elsewhere', () => {
    const fact = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    const base = { feedbackText: 'Done +5', feedbackEduText: fact, feedbackSourceId: 's', feedbackTimer: 3 };
    const ctx = recordingContext();
    const st = { ...small(), ...base, objectiveBannerRect: null };
    renderFeedbackToast(ctx, st, null);
    const z = sideZones(st);
    expect(st.feedbackRect.side).toBe(true);
    expect(st.feedbackRect.x).toBeGreaterThanOrEqual(z.right.x0 - 1e-9);
    expect(st.feedbackRect.x + st.feedbackRect.w).toBeLessThanOrEqual(z.right.x1 + 1e-9);
    expect(st.feedbackRect.y).toBe(z.right.y0);
    const drawn = ctx.texts.map((x) => x.text);
    expect(drawn.filter((x) => /^w\d/.test(x)).join(' ')).toBe(fact);         // nothing cut
    expect(drawn.some((x) => x.endsWith('…'))).toBe(false);
    expect(st.sourceBadgeRect.x).toBeGreaterThanOrEqual(st.feedbackRect.x);
    expect(st.sourceBadgeRect.x + st.sourceBadgeRect.w).toBeLessThanOrEqual(st.feedbackRect.x + st.feedbackRect.w);

    const c2 = recordingContext();
    const s2 = { cssScale: 0.8, hudTopInset: 0, ...base, objectiveBannerRect: { h: 40 } };
    renderFeedbackToast(c2, s2, null);
    expect(s2.feedbackRect.side).toBe(false);
    expect(s2.feedbackRect.y).toBe(52 + 40 + 4);
    expect(s2.feedbackRect.x + s2.feedbackRect.w / 2).toBeCloseTo(640, 5);
  });

  it('NEGATIVE CONTROL: the old 4-line cap would cut a fact in the narrow strip', () => {
    const ctx = recordingContext();
    const fact = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    const capped = feedbackToastLayout(ctx, { text: 'x', eduText: fact }, 260, { capLines: true });
    const full = feedbackToastLayout(ctx, { text: 'x', eduText: fact }, 260, { capLines: false });
    expect(capped.eduLines.length).toBe(4);
    expect(capped.eduLines[3].endsWith('…')).toBe(true);
    expect(full.eduLines.length).toBeGreaterThan(4);
    expect(full.eduLines.join(' ')).toBe(fact);
  });
});
