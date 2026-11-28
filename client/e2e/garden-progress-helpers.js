// Place the avatar beside the target and drive garden actions through the keyboard or touch controls.
import fs from 'node:fs';
import { expect } from '@playwright/test';
import { pressEnter, holdEnter, pressKey, touchHold } from './helpers.js';

export const loc = (lang) => JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'));

/** Same plural rule the app uses (i18next → Intl.PluralRules). */
export function plantProgressText(L, lang, healthy, left) {
  const form = new Intl.PluralRules(lang).select(left) === 'one' ? 'plantings_left_one' : 'plantings_left_other';
  const leftText = L.garden.bar[form].replace('{{count}}', String(left));
  return L.garden.bar.plant_progress.replace('{{healthy}}', String(healthy)).replace('{{left}}', leftText);
}
export const waterProgressText = (L, healthy) => L.garden.bar.water_progress.replace('{{healthy}}', String(healthy));
export const harvestProgressText = (L, done) => L.garden.bar.harvest_progress.replace('{{done}}', String(done)).replace('{{goal}}', '5');
export const goalText = (L) => L.garden.bar.goal.replace('{{goal}}', '5');

/**
 * Browser-side driver. window.__plan is a list of 'R' (right season) / 'W'
 * (wrong season) for the plantings in order; after the list, plantings are 'R'.
 * Answers every decision card with its first option and records whether that
 * answer was correct (window.__evAnswered), so the expected score is known.
 * Stops (act 'lost') as soon as the run-lost card is up.
 */
export function stepMistakes() {
  const TS = 32, DIR_UP = 1;
  const cv = document.querySelector('canvas');
  const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };
  const face = (t) => {
    const p = st.player; p.col = t.col; p.row = t.row + 1;
    p.pixelX = p.col * TS; p.pixelY = p.row * TS; p.fromX = p.pixelX; p.fromY = p.pixelY;
    p.toX = p.pixelX; p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
  };
  if (st.runLost) return { act: 'lost' };
  if (st.showMissionIntro) return { act: 'enter' };
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
  if (st.finishScheduled) return { act: 'wait', ms: 200 };
  window.__evAnswered = window.__evAnswered || {};
  if (st.decisionEvent) {
    const d = st.decisionEvent;
    if (!d.answered) return { act: 'enter', tag: 'event' };
    window.__evAnswered[d.event.id] = !!d.correct;
    if ((d.resultTimer || 0) < 0.45) return { act: 'wait', ms: 150 };
    return { act: 'enter', tag: 'event' };
  }
  if (st.pendingEvent) return { act: 'wait', ms: 200 };
  const c = st.carrying;
  if (st.phase === 'PLANT') {
    if (c && c.seed) {
      const plot = st.plots.find((p) => p.season === st.activeSeason && !p.seed);
      if (plot) { face(plot); return { act: 'enter', tag: 'plant', wrong: !c.seed.validSeasons.includes(st.activeSeason) }; }
      return { act: 'wait', ms: 120 };
    }
    const plan = window.__plan || [];
    const want = plan[st.plantedCount] || 'R';
    const used = new Set(st.plots.filter((p) => p.season === st.activeSeason && p.seed).map((p) => p.seed.id));
    const crate = st.seedCrates.find((x) => (want === 'W'
      ? !x.validSeasons.includes(st.activeSeason) : x.validSeasons.includes(st.activeSeason)) && !used.has(x.seedId));
    if (crate) { face(crate); return { act: 'enter', tag: 'pick' }; }
    return { act: 'wait', ms: 120 };
  }
  if (st.phase === 'WATER') {
    if (c && c.tool === 'water') {
      const tgt = st.waterRound === 2 ? 1 : 0;
      const plot = st.plots.find((p) => p.seed && !p.wilted && p.health === tgt);
      if (plot) { face(plot); return { act: 'hold', ms: 2350, tag: 'water' }; }
      return { act: 'wait', ms: 150 };
    }
    face(st.toolTiles.find((t) => t.tool === 'water')); return { act: 'enter', tag: 'tool' };
  }
  if (st.phase === 'HARVEST') {
    const healthy = st.plots.find((p) => p.seed && !p.harvested && !p.wilted && p.health >= 2);
    const wilted = st.plots.find((p) => p.seed && !p.harvested && (p.wilted || p.health < 2));
    if (c && c.tool === 'harvest') { if (healthy) { face(healthy); return { act: 'enter', tag: 'harvest' }; } return { act: 'drop' }; }
    if (c && c.tool === 'compost') { if (wilted) { face(wilted); return { act: 'enter', tag: 'compost' }; } return { act: 'drop' }; }
    face(st.toolTiles.find((t) => t.tool === (healthy ? 'harvest' : 'compost'))); return { act: 'enter', tag: 'tool' };
  }
  return { act: 'wait', ms: 150 };
}

/** Real input surfaces. */
export const keyboardInput = (page) => ({
  name: 'keyboard',
  enter: () => pressEnter(page),
  hold: (ms) => holdEnter(page, ms),
  drop: () => pressKey(page, 'q'),
  confirmDown: () => page.keyboard.down('Enter'),
  confirmUp: () => page.keyboard.up('Enter'),
});
export const touchInput = (page) => {
  const A = page.locator('[data-touch-control][data-key="Enter"]');
  const B = page.locator('[data-touch-control][data-key="q"]');
  return {
    name: 'touch', A, B,
    enter: () => touchHold(page, A, 150),
    hold: (ms) => touchHold(page, A, ms),
    drop: () => touchHold(page, B, 150),
  };
};

export const gstate = (page) => page.evaluate(() => {
  const s = document.querySelector('canvas')?._stateRef?.current;
  const st = window.__playfood.state();
  if (!s || !s.plots) return { screen: st.currentScreen };
  const seeded = s.plots.filter((p) => p.seed);
  return {
    screen: st.currentScreen, phase: s.phase, planted: s.plantedCount,
    wilted: seeded.filter((p) => p.wilted).length, alive: seeded.filter((p) => !p.wilted).length,
    healthyHarvests: s.healthyHarvests, runLost: s.runLost ? { ...s.runLost } : null,
    pendingEvent: !!s.pendingEvent, decisionEvent: !!s.decisionEvent, carrying: s.carrying,
    player: { col: s.player.col, row: s.player.row, x: s.player.pixelX, y: s.player.pixelY },
    progress: document.querySelector('[data-testid="garden-progress-line"]')?.innerText ?? null,
    goal: document.querySelector('[data-testid="garden-goal-line"]')?.innerText ?? null,
    finishScheduled: !!s.finishScheduled,
  };
});

/**
 * Drive until the result screen (returns nav) or the run-lost card (returns
 * 'lost'). onPlanted(state) runs after every planting so the caller can check
 * the top bar at that moment.
 */
export async function drive(page, input, { onPlanted, timeoutMs = 170_000 } = {}) {
  const t0 = Date.now();
  for (let i = 0; i < 900; i++) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`drive timed out after ${i} steps`);
    const a = await page.evaluate(stepMistakes);
    if (a.act === 'done') return a.nav;
    if (a.act === 'lost') return 'lost';
    if (a.act === 'enter') await input.enter();
    else if (a.act === 'hold') await input.hold(a.ms);
    else if (a.act === 'drop') await input.drop();
    else await page.waitForTimeout(a.ms || 100);
    if (a.tag === 'plant' && onPlanted) {
      await page.waitForTimeout(260); // the bar polls at 5 Hz
      const s = await gstate(page);
      if (!s.runLost) await onPlanted(s);
    }
  }
  throw new Error('drive exceeded 900 steps');
}

/** Capture the real analytics payloads (game_finish must be sent once). */
export async function captureEvents(page) {
  const events = [];
  await page.route('**/api/config', (route) => route.fulfill({ json: { tracking: true } }));
  await page.route('**/api/ev', async (route) => {
    try { events.push(route.request().postDataJSON()); } catch { /* ignore */ }
    await route.fulfill({ json: { ok: true } });
  });
  return events;
}

export const storeSnap = (page) => page.evaluate(() => {
  const s = window.__playfood.state();
  return { points: s.points, growing: [...(s.completedMissions?.growing || [])], screen: s.currentScreen, nav: s.navigationData };
});

/** Every top-bar item: whole (no clipping), inside the viewport, no overlaps. */
export async function expectBarWhole(page, label) {
  const r = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="garden-topbar"]');
    const br = bar.getBoundingClientRect();
    const items = [...bar.children].filter((e) => e.getBoundingClientRect().width > 0 && e.innerText?.trim() !== undefined)
      .map((e) => {
        const b = e.getBoundingClientRect();
        // inner overflow of the element itself and of every text line in it
        const clipped = e.scrollWidth > e.clientWidth + 1
          || [...e.querySelectorAll('*')].some((c) => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflow !== 'visible');
        return { id: e.dataset.testid || e.tagName, text: e.innerText, x: b.x, r: b.right, y: b.y, b: b.bottom, w: b.width, clipped };
      });
    return { vw: innerWidth, bar: { x: br.x, r: br.right, y: br.y, b: br.bottom, sw: bar.scrollWidth, cw: bar.clientWidth }, items };
  });
  expect(r.bar.sw, `${label}: bar does not scroll/overflow`).toBeLessThanOrEqual(r.bar.cw + 1);
  const solid = r.items.filter((i) => i.w > 0.5 && (i.text?.trim() || i.id === 'garden-stars'));
  for (const it of solid) {
    expect(it.x, `${label}: ${it.id} starts inside the viewport`).toBeGreaterThanOrEqual(0);
    expect(it.r, `${label}: ${it.id} ends inside the viewport`).toBeLessThanOrEqual(r.vw + 0.5);
    expect(it.y, `${label}: ${it.id} inside the bar (top)`).toBeGreaterThanOrEqual(r.bar.y - 0.5);
    expect(it.b, `${label}: ${it.id} inside the bar (bottom)`).toBeLessThanOrEqual(r.bar.b + 0.5);
    expect(it.clipped, `${label}: ${it.id} not clipped`).toBe(false);
  }
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      const overlap = Math.min(a.r, b.r) - Math.max(a.x, b.x);
      expect(overlap, `${label}: ${a.id} / ${b.id} do not overlap`).toBeLessThanOrEqual(0.5);
    }
  }
  return r;
}

/** Text in the goal block's two lines must be fully visible (not cut by the chip). */
export async function expectGoalLinesWhole(page, label) {
  const r = await page.evaluate(() => {
    const g = document.querySelector('[data-testid="garden-goal"]');
    const gb = g.getBoundingClientRect();
    return [...g.children].map((c) => {
      const range = document.createRange(); range.selectNodeContents(c);
      const tb = range.getBoundingClientRect();
      return { text: c.innerText, l: tb.left, r: tb.right, t: tb.top, b: tb.bottom, g: { l: gb.left, r: gb.right, t: gb.top, b: gb.bottom } };
    });
  });
  for (const line of r) {
    expect(line.l, `${label}: "${line.text}" left inside chip`).toBeGreaterThanOrEqual(line.g.l - 0.5);
    expect(line.r, `${label}: "${line.text}" right inside chip`).toBeLessThanOrEqual(line.g.r + 0.5);
    expect(line.t, `${label}: "${line.text}" top inside chip`).toBeGreaterThanOrEqual(line.g.t - 0.5);
    expect(line.b, `${label}: "${line.text}" bottom inside chip`).toBeLessThanOrEqual(line.g.b + 0.5);
  }
}

/* Record canvas transforms and shape bounds to compare text and panels in screen pixels. */
export async function installRecorder(page) {
  await page.addInitScript(() => {
    window.__t = []; window.__shapes = []; window.__rec = false; window.__seq = 0;
    const P = CanvasRenderingContext2D.prototype;
    const pt = (ctx, x, y) => { const m = ctx.getTransform(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; };
    const boxOf = (pts) => ({ l: Math.min(...pts.map((q) => q[0])), r: Math.max(...pts.map((q) => q[0])),
      top: Math.min(...pts.map((q) => q[1])), bot: Math.max(...pts.map((q) => q[1])) });
    const oT = P.fillText;
    P.fillText = function f(s, x, y, ...r) {
      if (window.__rec) {
        const m = this.getTransform(); const mt = this.measureText(String(s));
        window.__t.push({ seq: window.__seq++, s: String(s), font: this.font, k: Math.hypot(m.a, m.b),
          l: m.a * (x - mt.actualBoundingBoxLeft) + m.e, r: m.a * (x + mt.actualBoundingBoxRight) + m.e,
          top: m.d * (y - mt.actualBoundingBoxAscent) + m.f, bot: m.d * (y + mt.actualBoundingBoxDescent) + m.f,
          cw: this.canvas.width, ch: this.canvas.height });
      }
      return oT.call(this, s, x, y, ...r);
    };
    for (const name of ['fillRect', 'strokeRect']) {
      const o = P[name];
      P[name] = function rect(x, y, w, h) {
        if (window.__rec && this.canvas === document.querySelector('canvas')) {
          window.__shapes.push({ seq: window.__seq++, kind: name, style: String(name === 'fillRect' ? this.fillStyle : this.strokeStyle),
            ...boxOf([pt(this, x, y), pt(this, x + w, y + h)]) });
        }
        return o.call(this, x, y, w, h);
      };
    }
    // filled paths (drawRoundedRect: moveTo / lineTo / quadraticCurveTo)
    const oB = P.beginPath;
    P.beginPath = function b() { this.__pts = []; return oB.call(this); };
    for (const name of ['moveTo', 'lineTo']) {
      const o = P[name];
      P[name] = function m(x, y) { (this.__pts ||= []).push(pt(this, x, y)); return o.call(this, x, y); };
    }
    const oQ = P.quadraticCurveTo;
    P.quadraticCurveTo = function q(cx, cy, x, y) { (this.__pts ||= []).push(pt(this, cx, cy), pt(this, x, y)); return oQ.call(this, cx, cy, x, y); };
    const oF = P.fill;
    P.fill = function fl(...a) {
      if (window.__rec && this.__pts?.length && this.canvas === document.querySelector('canvas')) {
        window.__shapes.push({ seq: window.__seq++, kind: 'path', style: String(this.fillStyle), ...boxOf(this.__pts) });
      }
      return oF.apply(this, a);
    };
  });
}

export async function recordFrame(page) {
  return (await recordFrameAll(page)).texts;
}
/** One recording window: drawn texts and shapes, each in backing-store px. */
export async function recordFrameAll(page) {
  await page.evaluate(() => { window.__t = []; window.__shapes = []; window.__rec = true; });
  await page.waitForTimeout(220);
  return page.evaluate(() => { window.__rec = false; return { texts: window.__t, shapes: window.__shapes }; });
}

/**
 * The run-lost card: exact title / mistake line / body / hint, each drawn whole
 * inside the card and inside the canvas, and the card itself inside the
 * visible canvas element.
 */
/** DOM obstacles a canvas overlay must not sit under: the top bar and every visible touch control. */
async function domObstacles(page) {
  return page.evaluate(() => {
    const out = [];
    const bar = document.querySelector('[data-testid="garden-topbar"]');
    if (bar) { const r = bar.getBoundingClientRect(); out.push({ id: 'topbar', l: r.left, r: r.right, t: r.top, b: r.bottom }); }
    for (const el of document.querySelectorAll('[data-touch-control]')) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none') {
        out.push({ id: `touch:${el.dataset.key}`, l: r.left, r: r.right, t: r.top, b: r.bottom });
      }
    }
    return out;
  });
}

async function canvasMeta(page) {
  return page.evaluate(() => {
    const s = document.querySelector('canvas')._stateRef.current;
    const c = document.querySelector('canvas'); const b = c.getBoundingClientRect();
    const bar = document.querySelector('[data-testid="garden-topbar"]')?.getBoundingClientRect();
    // state.cssScale / hudTopInset are read ONLY to report them next to the
    // independent measurement; no assertion below is computed from them.
    return { rect: s.runLostRect, wrongLine: s.runLost?.wrongLine, cw: c.width, ch: c.height,
      el: { x: b.x, y: b.y, w: b.width, h: b.height }, vw: innerWidth, vh: innerHeight,
      bar: bar ? { t: bar.top, b: bar.bottom } : null,
      appCssScale: s.cssScale, appInset: s.hudTopInset, dpr: devicePixelRatio };
  });
}

/** backing-store box (as recorded) → CSS box, from the element's own size / backing size */
const toCss = (meta, x) => {
  const fx = meta.el.w / meta.cw; const fy = meta.el.h / meta.ch;
  return { l: meta.el.x + x.l * fx, r: meta.el.x + x.r * fx, t: meta.el.y + x.top * fy, b: meta.el.y + x.bot * fy };
};
const fontPx = (font) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]);
/** On-screen CSS px of a drawn text: font px × real transform scale × CSS px per backing px. */
export const cssFontPx = (meta, x) => fontPx(x.font) * x.k * (meta.el.w / meta.cw);
/** NEGATIVE-CONTROL formula kept for the record: the width-only ratio of v2 (app + helper). */
export const oldWidthOnlyCssFontPx = (meta, x) => fontPx(x.font) * (meta.el.w / 1280);
const overlaps = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
const union = (a, b) => ({ l: Math.min(a.l, b.l), r: Math.max(a.r, b.r), t: Math.min(a.t, b.t), b: Math.max(a.b, b.b) });
const contains = (outer, x, tol = 1) => x.l >= outer.l - tol && x.r <= outer.r + tol && x.t >= outer.t - tol && x.b <= outer.b + tol;
const CARD_FRAME = '#6d3b00'; // renderRunLostCard outer frame
const BANNER_FILL = '#33691e'; // WORLD_ART.textGreen, renderPhaseObjective
const round2 = (v) => Math.round(v * 100) / 100;

/** Every box must sit inside the canvas element and the viewport, clear of the bar and touch controls. */
async function expectClear(page, meta, box, what, label) {
  expect(box.l, `${label}: ${what} left inside canvas`).toBeGreaterThanOrEqual(meta.el.x - 0.5);
  expect(box.r, `${label}: ${what} right inside canvas`).toBeLessThanOrEqual(meta.el.x + meta.el.w + 0.5);
  expect(box.t, `${label}: ${what} top inside canvas`).toBeGreaterThanOrEqual(meta.el.y - 0.5);
  expect(box.b, `${label}: ${what} bottom inside canvas`).toBeLessThanOrEqual(meta.el.y + meta.el.h + 0.5);
  expect(box.l, `${label}: ${what} left inside viewport`).toBeGreaterThanOrEqual(-0.5);
  expect(box.r, `${label}: ${what} right inside viewport`).toBeLessThanOrEqual(meta.vw + 0.5);
  expect(box.t, `${label}: ${what} top inside viewport`).toBeGreaterThanOrEqual(-0.5);
  expect(box.b, `${label}: ${what} bottom inside viewport`).toBeLessThanOrEqual(meta.vh + 0.5);
  for (const o of await domObstacles(page)) {
    expect(overlaps(box, o), `${label}: ${what} clear of ${o.id}`).toBe(false);
  }
}

/**
 * The run-lost card: exact title / mistake line / body / hint, each drawn whole
 * inside the card; the WHOLE card (frame + drop shadow, as drawn) inside the
 * canvas and the viewport and clear of the DOM top bar and every touch control;
 * and readable — body ≥ 14 CSS px, title ≥ 15, hint ≥ 12.5 — measured from the
 * real draw transform and backing-to-CSS ratio (review 06/10, P2).
 */
export async function expectLostCard(page, L, lang, { wilted }) {
  const { texts, shapes } = await recordFrameAll(page);
  const meta = await canvasMeta(page);
  const label = `${lang} ${meta.vw}x${meta.vh}`;
  expect(meta.rect, 'card rect').toBeTruthy();
  const title = L.garden.lost.title.replace('{{goal}}', '5');
  const body = L.garden.lost.body.replace('{{n}}', String(wilted));
  const hint = L.garden.lost.continue;
  const lastTitle = texts.map((x) => x.s).lastIndexOf(title);
  expect(lastTitle, `${lang}: title drawn`).toBeGreaterThanOrEqual(0);
  const seq = texts.slice(lastTitle);
  // the card as drawn: the last outer frame painted before the title, plus its shadow
  const frames = shapes.filter((x) => x.kind === 'path' && x.style.toLowerCase() === CARD_FRAME && x.seq < texts[lastTitle].seq);
  expect(frames.length, `${label}: card frame drawn`).toBeGreaterThan(0);
  const frame = frames[frames.length - 1];
  const shadow = shapes.filter((x) => x.kind === 'fillRect' && x.seq < frame.seq).pop();
  const cardBacking = { l: frame.l, r: frame.r, top: frame.top, bot: frame.bot };
  const frameCss = toCss(meta, cardBacking);
  const cardCss = shadow ? union(frameCss, toCss(meta, shadow)) : frameCss;
  const inside = (x) => contains(frameCss, toCss(meta, x));
  for (const x of seq) expect(inside(x), `${label}: "${x.s}" whole inside the card`).toBe(true);
  const joined = (arr) => arr.map((x) => x.s).join(' ').replace(/\s+/g, ' ').trim();
  expect(seq[seq.length - 1].s, `${lang}: hint is the last line of the card`).toBe(hint);
  const lines = seq.slice(1, -1);
  const wrongLine = meta.wrongLine;
  expect(wrongLine, 'the mistake line is kept on the card').toBeTruthy();
  expect(wrongLine.startsWith('🥀 '), 'mistake line starts with 🥀').toBe(true);
  expect(joined(lines), `${lang}: mistake line + body, complete and in order`).toBe(`${wrongLine} ${body}`.replace(/\s+/g, ' '));
  for (const x of seq) {
    expect(x.r - x.l, 'text has width').toBeGreaterThan(0);
    expect(x.l, 'inside canvas left').toBeGreaterThanOrEqual(0);
    expect(x.r, 'inside canvas right').toBeLessThanOrEqual(x.cw);
  }
  // readable on screen, from the real transform (not from state.cssScale)
  const css = (x) => cssFontPx(meta, x);
  expect(css(seq[0]), `${label}: title ≥ 15 CSS px`).toBeGreaterThanOrEqual(15);
  for (const x of lines) expect(css(x), `${label}: "${x.s.slice(0, 24)}…" ≥ 14 CSS px`).toBeGreaterThanOrEqual(13.95);
  expect(css(seq[seq.length - 1]), `${label}: hint ≥ 12.5 CSS px`).toBeGreaterThanOrEqual(12.5);
  await expectClear(page, meta, cardCss, 'card', label);
  // state.runLostRect (used for the tap target) agrees with the drawn frame
  const k = seq[0].k; const fx = meta.el.w / meta.cw;
  expect(Math.abs((meta.rect.w * k) - (frame.r - frame.l)) * fx, `${label}: runLostRect width = drawn frame`).toBeLessThan(1.5);
  const measured = {
    label, dpr: meta.dpr, k: round2(k), cssPerLogical: round2(k * fx), appCssScale: round2(meta.appCssScale),
    fonts: { title: round2(css(seq[0])), body: round2(Math.min(...lines.map(css))), hint: round2(css(seq[seq.length - 1])) },
    oldFormula: { title: round2(oldWidthOnlyCssFontPx(meta, seq[0])), body: round2(Math.min(...lines.map((x) => oldWidthOnlyCssFontPx(meta, x)))) },
    logicalFont: { title: fontPx(seq[0].font), body: fontPx(lines[lines.length - 1].font), hint: fontPx(seq[seq.length - 1].font) },
    card: Object.fromEntries(Object.entries(cardCss).map(([a, v]) => [a, round2(v)])),
  };
  console.log('MEASURE_CARD', JSON.stringify(measured));
  return { title, body, hint, wrongLine, cardCss: frameCss, measured };
}

/**
 * The step banner (renderPhaseObjective): its text drawn whole, and the WHOLE
 * banner box as drawn (fill + shadow + border) inside the canvas and the
 * viewport, at least 5.5 CSS px below the DOM top bar, and not under the bar
 * or a touch control (F2, review 06/10).
 */
export async function expectBannerClear(page, expectedText, label) {
  const { texts, shapes } = await recordFrameAll(page);
  const meta = await canvasMeta(page);
  const b = drawnBanner(texts, shapes);
  expect(b, `${label}: banner drawn`).toBeTruthy();
  // the banner may wrap (12/10): its lines, in order, are the whole text
  expect(b.lines.map((x) => x.s).join(' ').replace(/\s+/g, ' '), `${label}: banner text whole`).toBe(expectedText.replace(/\s+/g, ' '));
  for (const x of b.lines) expect(expectedText.includes(x.s), `${label}: "${x.s}" exactly as written`).toBe(true);
  const box = [b.fill, ...b.parts].map((r) => toCss(meta, r)).reduce(union);
  await expectClear(page, meta, box, 'banner', label);
  for (const x of b.lines) expect(contains(box, toCss(meta, x)), `${label}: "${x.s}" inside its box`).toBe(true);
  for (const x of b.lines) expect(cssFontPx(meta, x), `${label}: banner text ≥ 13 CSS px`).toBeGreaterThanOrEqual(12.95);
  if (meta.bar) expect(box.t, `${label}: banner ≥ 5.5 CSS px below the top bar`).toBeGreaterThanOrEqual(meta.bar.b + 5.5);
  console.log('MEASURE_BANNER', JSON.stringify({ label, box: Object.fromEntries(Object.entries(box).map(([a, v]) => [a, round2(v)])),
    barBottom: meta.bar && round2(meta.bar.b), gap: meta.bar && round2(box.t - meta.bar.b), cssFont: round2(cssFontPx(meta, b.lines[0])), lines: b.lines.length }));
  return box;
}

/** The step banner as drawn in the last recorded frame: green fill, its shadow /
 *  stripe / border, and the text lines drawn right after the border. */
export function drawnBanner(texts, shapes) {
  const fills = shapes.filter((r) => r.kind === 'fillRect' && r.style.toLowerCase() === BANNER_FILL);
  for (const fill of fills.reverse()) {
    const stroke = shapes.find((r) => r.seq > fill.seq && r.kind === 'strokeRect');
    if (!stroke) continue;
    const next = shapes.find((r) => r.seq > stroke.seq);
    const lines = texts.filter((x) => x.seq > stroke.seq && (!next || x.seq < next.seq));
    if (!lines.length) continue;
    const parts = shapes.filter((r) => r.seq >= fill.seq - 1 && r.seq <= stroke.seq);
    return { fill, parts, lines };
  }
  return null;
}
export { canvasMeta, toCss, union, contains, overlaps, domObstacles, round2 };
