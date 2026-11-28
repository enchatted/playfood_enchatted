import { describe, it, expect } from 'vitest';
import { missionIntroViewport, renderMissionIntroCard } from './gameRoomRenderer.js';

const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

function recordingContext({ width = 844, height = 390, dpr = 1, controls = [], top = 42, glyphMetrics } = {}) {
  const rect = box(0, top, width, height - top);
  const backingW = Math.round(rect.width * dpr), backingH = Math.round(rect.height * dpr);
  const k = Math.min(backingW / 1280, backingH / 704);
  let matrix = { a: k, b: 0, c: 0, d: k, e: (backingW - 1280 * k) / 2, f: (backingH - 704 * k) / 2 };
  const stack = [];
  const texts = [];
  const win = { innerWidth: width, innerHeight: height };
  const doc = {
    defaultView: win,
    querySelector: () => ({ getBoundingClientRect: () => box(0, 0, width, top) }),
    querySelectorAll: () => controls.map(control => ({ getClientRects: () => [control], getBoundingClientRect: () => control })),
  };
  const ctx = {
    canvas: { width: backingW, height: backingH, ownerDocument: doc, getBoundingClientRect: () => rect, closest: () => ({ getBoundingClientRect: () => box(0, 0, width, height) }) },
    font: '15px sans-serif', textAlign: 'left',
    getTransform: () => matrix,
    save() { stack.push({ matrix: { ...matrix }, font: this.font, textAlign: this.textAlign }); },
    restore() { const saved = stack.pop(); matrix = saved.matrix; this.font = saved.font; this.textAlign = saved.textAlign; },
    translate(x, y) { matrix = { ...matrix, e: matrix.e + matrix.a * x, f: matrix.f + matrix.d * y }; },
    scale(x, y) { matrix = { ...matrix, a: matrix.a * x, d: matrix.d * y }; },
    measureText(text) { return { width: Array.from(String(text)).length * Number(this.font.match(/([\d.]+)px/)[1]) * .52, ...glyphMetrics?.(String(text), this.font) }; },
    fillText(text, x, y) { texts.push({ text, x, y, matrix: { ...matrix }, font: this.font }); },
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {}, stroke() {}, fillRect() {},
  };
  return { ctx, texts, rect, win, setMatrix: next => { matrix = next; } };
}

const intro = {
  title: 'Instructions',
  steps: ['Pick up an ingredient.', 'Walk to the pot and press Enter.', 'Cook the dish.'],
  introFact: { quote: 'This is a short approved fact.', sourceId: 'unchanged-source', paraphrase: true },
  preFact: { quote: 'Use what you already have first.', sourceId: 'unchanged-pre-source', paraphrase: true, label: 'Prevention source', key: 'R' },
  sourceLabel: 'Source', factLabel: 'Compost source', goal: 'Complete the three steps.', cta: 'Press Enter or Space to begin.',
};

function cssRect(rect, ctx) {
  const matrix = ctx.getTransform(), canvas = ctx.canvas, box = canvas.getBoundingClientRect();
  return {
    left: box.left + (matrix.a * rect.x + matrix.e) * box.width / canvas.width,
    top: box.top + (matrix.d * rect.y + matrix.f) * box.height / canvas.height,
    width: matrix.a * rect.width * box.width / canvas.width,
    height: matrix.d * rect.height * box.height / canvas.height,
  };
}

describe('intro viewport uses the displayed frame geometry', () => {
  it.each([1, 2])('has the same CSS scale and letterbox origin at DPR %i', dpr => {
    const { ctx, rect } = recordingContext({ dpr });
    const view = missionIntroViewport(ctx);
    expect(view.scale).toBeCloseTo(rect.height / 704, 8);
    expect(view.originX).toBeCloseTo((844 - rect.height / 704 * 1280) / 2, 8);
    expect(view.box).toEqual({ left: 8, right: 836, top: 50, bottom: 382 });
  });

  it('clips to both the visual viewport and the active stage', () => {
    const { ctx, win } = recordingContext();
    win.visualViewport = { offsetLeft: 10, offsetTop: 5, width: 810, height: 370 };
    ctx.canvas.closest = () => ({ getBoundingClientRect: () => box(20, 45, 790, 320) });
    expect(missionIntroViewport(ctx).box).toEqual({ left: 28, right: 802, top: 53, bottom: 357 });
  });

  it('uses a bespoke top bar rather than assuming a ScoreBar', () => {
    const { ctx } = recordingContext();
    let selector;
    ctx.canvas.ownerDocument.querySelector = query => {
      selector = query;
      return { getBoundingClientRect: () => box(0, 0, 844, 60) };
    };
    expect(missionIntroViewport(ctx).box.top).toBe(68);
    expect(selector).toContain('garden-topbar');
    expect(selector).toContain('spot-the-fake-hud');
    expect(selector).toContain('season-matcher-hud');
  });

  it('finds the Compost bar immediately before the canvas stage', () => {
    const { ctx } = recordingContext();
    ctx.canvas.ownerDocument.querySelector = () => null;
    const bar = { querySelector: () => ({}), getBoundingClientRect: () => box(0, 0, 844, 56) };
    ctx.canvas.parentElement = { parentElement: {}, previousElementSibling: bar };
    expect(missionIntroViewport(ctx).box.top).toBe(64);
  });

  it('uses the actual current transform, not a stale __hidpi value', () => {
    const { ctx, setMatrix } = recordingContext({ dpr: 2 });
    ctx.canvas.__hidpi = { k: 99, ox: 1000, oy: 1000 };
    setMatrix({ a: 1.2, b: 0, c: 0, d: 1.2, e: 50, f: 80 });
    const view = missionIntroViewport(ctx);
    expect(view.scale).toBe(.6);
    expect(view.originX).toBe(25);
    expect(view.originY).toBe(82);
  });

  it('ignores invisible and outside controls', () => {
    const visible = box(10, 250, 44, 44);
    const { ctx } = recordingContext({ controls: [visible, box(-100, 250, 44, 44)] });
    const hidden = { getClientRects: () => [], getBoundingClientRect: () => box(400, 50, 200, 200) };
    const original = ctx.canvas.ownerDocument.querySelectorAll;
    ctx.canvas.ownerDocument.querySelectorAll = () => [...original(), hidden];
    expect(missionIntroViewport(ctx).controls).toEqual([visible]);
  });

  it('keeps the legacy test/server path when no DOM geometry is available', () => {
    expect(missionIntroViewport({})).toBeNull();
  });
});

describe('responsive intro preserves the content and source hit targets', () => {
  it.each([1, 2])('separates wrapped emoji ink without reducing the step font at DPR %i', dpr => {
    const { ctx, texts } = recordingContext({
      dpr,
      controls: [box(8, 238, 140, 140), box(760, 270, 60, 60)],
      // Mixed text/emoji ink can be 21px tall in the unchanged 15px font.
      glyphMetrics: text => text.includes('🌱')
        ? { actualBoundingBoxAscent: 14, actualBoundingBoxDescent: 7 }
        : { actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 7 },
    });
    const state = {
      showMissionIntro: true,
      missionIntro: { ...intro, steps: ['🌱 Seed '.repeat(30).trim()], preFact: null, introFact: null },
    };
    renderMissionIntroCard(ctx, state);
    const lines = texts.filter(row => row.font.startsWith('15px'));
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.font).toBe("15px 'Inter', system-ui, sans-serif");
      expect(15 * line.matrix.a / dpr).toBeGreaterThanOrEqual(11.5);
    }
    for (let i = 1; i < lines.length; i++) {
      const gap = (lines[i].y - 14) - (lines[i - 1].y + 7);
      expect(gap, 'actual emoji ink has a positive gap between wrapped lines').toBeGreaterThanOrEqual(1);
    }
  });

  it.each([1, 2])('renders the whole copy with larger type and both sources at DPR %i', dpr => {
    const { ctx, texts } = recordingContext({ dpr, controls: [box(8, 238, 140, 140), box(760, 270, 60, 60)] });
    const state = { showMissionIntro: true, missionIntro: structuredClone(intro), score: 77 };
    const before = structuredClone(state.missionIntro);
    renderMissionIntroCard(ctx, state);
    const normalize = s => s.replace(/\s+/g, ' ').trim();
    const drawn = normalize(texts.map(t => t.text).join(' '));
    for (const text of [...intro.steps, intro.preFact.quote, intro.introFact.quote, intro.goal, intro.cta]) expect(drawn).toContain(normalize(text));
    expect(texts.map(t => t.text)).toEqual(expect.arrayContaining(['R', 'S', intro.preFact.label, intro.factLabel]));
    const step = texts.find(t => t.text.startsWith('1.'));
    expect(Number(step.font.match(/([\d.]+)px/)[1]) * step.matrix.a / dpr).toBeGreaterThanOrEqual(11.5);
    for (const rect of [state.introPreSourceRect, state.introSourceRect]) {
      const screen = cssRect(rect, ctx);
      expect(screen.left).toBeGreaterThan(148);
      expect(screen.left + screen.width).toBeLessThan(752);
      expect(screen.top).toBeGreaterThanOrEqual(50);
      expect(screen.top + screen.height).toBeLessThan(382);
    }
    expect(state.missionIntro).toEqual(before);
    expect(state.score).toBe(77);
  });

  it('does not render or overwrite hit targets while the card is closed', () => {
    const { ctx, texts } = recordingContext();
    const state = { showMissionIntro: false, missionIntro: intro, introSourceRect: null };
    renderMissionIntroCard(ctx, state);
    expect(texts).toHaveLength(0);
    expect(state.introSourceRect).toBeNull();
  });

  it('clears a missing optional source rather than retaining a prior card target', () => {
    const { ctx } = recordingContext();
    const state = { showMissionIntro: true, missionIntro: { ...intro, preFact: null }, introPreSourceRect: { x: 1 } };
    renderMissionIntroCard(ctx, state);
    expect(state.introPreSourceRect).toBeNull();
    expect(state.introSourceRect).toBeTruthy();
  });

  it('reads resize geometry again while the same intro stays open', () => {
    const state = { showMissionIntro: true, missionIntro: intro };
    const desktop = recordingContext({ width: 1366, height: 768 });
    renderMissionIntroCard(desktop.ctx, state);
    const desktopSource = { ...state.introSourceRect };
    const phone = recordingContext();
    renderMissionIntroCard(phone.ctx, state);
    expect(state.introSourceRect).not.toEqual(desktopSource);
    renderMissionIntroCard(desktop.ctx, state);
    expect(state.introSourceRect).toEqual(desktopSource);
  });
});

describe('intro text stays readable at both layouts', () => {
  it('starts the first step below the title band on a phone (S19)', () => {
    const { ctx, texts } = recordingContext({ controls: [box(8, 238, 140, 140), box(760, 270, 60, 60)] });
    renderMissionIntroCard(ctx, { showMissionIntro: true, missionIntro: { ...intro, preFact: null } });
    const step = texts.find(t => t.text.startsWith('1.'));
    // Band ends at y=33 in card units; a 15px line centred on y reaches about y-8.
    expect(step.y - 8).toBeGreaterThanOrEqual(33);
  });

  it('wraps a long goal at 14px on the full-size card instead of shrinking it (S12)', () => {
    const { ctx, texts } = recordingContext({ width: 1366, height: 768 });
    const goal = 'Find every seasonal fruit and vegetable before the market closes and fill your basket. '.repeat(2).trim();
    renderMissionIntroCard(ctx, { showMissionIntro: true, missionIntro: { ...intro, goal } });
    const goalRows = texts.filter(t => t.text.length > 2 && `🎯 ${goal}`.includes(t.text.trim()));
    expect(goalRows.length).toBeGreaterThan(1);
    for (const row of goalRows) expect(row.font).toBe("bold 14px 'Inter', system-ui, sans-serif");
    expect(goalRows.map(r => r.text).join(' ').replace(/\s+/g, ' ')).toBe(`🎯 ${goal}`);
  });
});
