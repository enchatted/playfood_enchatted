// Check that the prevention and composting sources open from their own text and controls.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission } from './helpers.js';

const LANGS = (process.env.INTRO_LANGS || 'el,en,nl,pt').split(',');
const SIZES = (process.env.INTRO_SIZES || '1366x768,844x390').split(',')
  .map((s) => { const [width, height] = s.split('x').map(Number); return { width, height }; });

async function setup(page) {
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (u) => { window.__opened.push(String(u)); return null; };
    window.__drawn = [];
    // Card bounds: the cream panel (#FFF8E1) is drawn as a rounded-rect path then filled; track
    // the path's points (transform-aware) and record its box on fill, in canvas-logical px.
    window.__panels = [];
    const P = CanvasRenderingContext2D.prototype;
    const toL = (ctx, x, y) => { const m = ctx.getTransform(); const h = ctx.canvas.__hidpi || { k: ctx.canvas.width / 1280, ox: 0, oy: 0 }; return [((m.a * x + m.c * y + m.e) - h.ox) / h.k, ((m.b * x + m.d * y + m.f) - h.oy) / h.k]; };
    const oBegin = P.beginPath; P.beginPath = function b(...a) { this.__pts = []; return oBegin.apply(this, a); };
    for (const name of ['moveTo', 'lineTo']) { const o = P[name]; P[name] = function f(x, y) { (this.__pts ||= []).push(toL(this, x, y)); return o.call(this, x, y); }; }
    const oQ = P.quadraticCurveTo; P.quadraticCurveTo = function q(cx, cy, x, y) { (this.__pts ||= []).push(toL(this, x, y)); return oQ.call(this, cx, cy, x, y); };
    const oFill = P.fill; P.fill = function fl(...a) {
      if (window.__rec && String(this.fillStyle).toLowerCase() === '#fff8e1' && this.__pts?.length) {
        const xs = this.__pts.map((q) => q[0]); const ys = this.__pts.map((q) => q[1]);
        window.__panels.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
      }
      return oFill.apply(this, a);
    };
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function patched(text, x, y, ...rest) {
      if (window.__rec) {
        const m = this.getTransform(); const w = this.measureText(String(text)).width;
        const left = this.textAlign === 'center' ? x - w / 2 : (this.textAlign === 'right' ? x - w : x);
        const h = this.canvas.__hidpi || { k: this.canvas.width / 1280, ox: 0, oy: 0 }; const L = (bx) => (bx - h.ox) / h.k; const Y = (by) => (by - h.oy) / h.k; window.__drawn.push({ s: String(text), l: L(m.a * left + m.e), r: L(m.a * (left + w) + m.e), y: Y(m.d * y + m.f) });
      }
      return orig.call(this, text, x, y, ...rest);
    };
  });
}
async function key(page, k) { await page.keyboard.down(k); await page.waitForTimeout(60); await page.keyboard.up(k); await page.waitForTimeout(120); }
// CSS (client) point of a canvas-logical point (1280×704): inverse of getCanvasPointer (HiDPI path).
async function cssPoint(page, x, y) {
  return page.evaluate(([lx, ly]) => {
    const cv = document.querySelector('canvas'); const rect = cv.getBoundingClientRect();
    const h = cv.__hidpi; const dpr = cv.width / rect.width;
    if (!h) return { x: rect.left + lx * rect.width / 1280, y: rect.top + ly * rect.height / 704 };
    return { x: rect.left + (lx * h.k + h.ox) / dpr, y: rect.top + (ly * h.k + h.oy) / dpr };
  }, [x, y]);
}
const centre = (r) => [r.x + r.width / 2, r.y + r.height / 2];
// A MOUSE click (pointerType 'mouse') at a canvas-logical point, through the real pointer path.
async function mouseClickLogical(page, x, y) {
  const pt = await cssPoint(page, x, y);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(150);
}
// A pointerdown dispatched straight onto the canvas element (skips whatever DOM sits on top):
// isolates the canvas listener's own guard from the overlay's protection.
async function canvasPointerDown(page, x, y) {
  const pt = await cssPoint(page, x, y);
  await page.evaluate(([cx, cy]) => {
    document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, pointerType: 'mouse' }));
  }, [pt.x, pt.y]);
  await page.waitForTimeout(100);
}
// Distinct lines of the last frame, top to bottom (the recorder sees several frames).
function frameLines(drawn) {
  const seen = new Map();
  for (const d of drawn) seen.set(`${d.s}|${Math.round(d.l)}|${Math.round(d.y)}`, d);
  return [...seen.values()].sort((a, b) => a.y - b.y || a.l - b.l);
}
for (const lang of LANGS) for (const size of SIZES) {
  test(`4.1 Compost intro sources ${lang} ${size.width}x${size.height}`, async ({ page }) => {
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize(size);
    await setup(page);
    await bootMission(page, 'circular', 1, lang);
    await page.waitForTimeout(600);
    const loc = JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'));
    const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8'));
    const prevention = lang === 'en'
      ? 'First, we make less waste: we buy only the food we need and eat leftovers that are still safe. We can also reuse gift bags and gift boxes.'
      : loc.compost.facts.prevention;
    await page.evaluate(() => { window.__drawn = []; window.__panels = []; window.__rec = true; });
    await page.waitForTimeout(400);
    const drawn = await page.evaluate(() => { window.__rec = false; return window.__drawn; });
    // the intro card = the widest cream panel recorded in this frame
    const panel = (await page.evaluate(() => window.__panels)).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
    expect(panel, 'actual cream intro card').toBeTruthy();
    const st = await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; return { pre: s.introPreSourceRect, src: s.introSourceRect, show: s.showMissionIntro, steps: s.missionIntro.steps }; });
    const issues = [];
    expect(st.show).toBe(true);
    // every word of the prevention line drawn, inside the recorded card, above step 1
    const text = drawn.map((d) => d.s).join(' ');
    const miss = prevention.split(/\s+/).filter((w) => !text.includes(w));
    if (miss.length) issues.push(`prevention words not drawn: ${miss.slice(0, 4).join(' ')}`);
    const preLines = drawn.filter((d) => d.s.length > 3 && prevention.includes(d.s.trim()));
    if (!preLines.length) issues.push('prevention line not recorded');
    for (const d of preLines) if (d.l < panel.x0 || d.r > panel.x1) issues.push(`prevention line outside card: ${d.s.slice(0, 25)}`);
    const step1 = drawn.find((d) => d.s.startsWith('1.'));
    if (!step1) issues.push('step 1 not drawn');
    else if (Math.max(...preLines.map((d) => d.y)) >= step1.y) issues.push('prevention line is not above the steps');
    const yAll = drawn.map((d) => d.y);
    if (Math.min(...yAll) < 0 || Math.max(...yAll) > 704) issues.push('text outside canvas');
    // chips: labels, keycaps, inside the card, pre chip above step 1, def chip below the steps
    const preLabel = loc.compost.intro_source_prevention; const defLabel = loc.compost.intro_source_definition;
    if (!text.includes(preLabel)) issues.push('prevention chip label not drawn');
    if (!text.includes(defLabel)) issues.push('definition chip label not drawn');
    if (!drawn.some((d) => d.s === 'R')) issues.push('R keycap not drawn');
    if (!drawn.some((d) => d.s === 'S')) issues.push('S keycap not drawn');
    for (const [n, r] of [['pre', st.pre], ['def', st.src]]) {
      if (!r) { issues.push(`${n} chip rect missing`); continue; }
      if (r.x < panel.x0 || r.x + r.width > panel.x1) issues.push(`${n} chip outside card`);
    }
    if (st.pre && step1 && st.pre.y + st.pre.height > step1.y) issues.push('pre chip overlaps step 1');
    if (st.pre && st.src && st.pre.y + st.pre.height + 20 > st.src.y - 10) issues.push('chips touch areas overlap');
    // the WHOLE step-2 text: its wrapped lines, read back in order between «2.» and «3.», equal
    // the locale string, and every line sits inside the recorded card above step 3
    const lines = frameLines(drawn);
    const i2 = lines.findIndex((d) => d.s.startsWith('2.'));
    const i3 = lines.findIndex((d) => d.s.startsWith('3.'));
    if (i2 < 0 || i3 < 0 || i3 <= i2) issues.push('step 2 / step 3 lines not found');
    else {
      const step2Lines = lines.slice(i2, i3).filter((d) => Math.abs(d.l - lines[i2].l) < 2);
      const joined = step2Lines.map((d) => d.s).join(' ').replace(/\s+/g, ' ').trim();
      const want = `2. ${loc.missionIntro.compostcreator.step2}`.replace(/\s+/g, ' ').trim();
      if (joined !== want) issues.push(`step 2 drawn text differs: «${joined.slice(-60)}» vs «${want.slice(-60)}»`);
      for (const d of step2Lines) if (d.l < panel.x0 || d.r > panel.x1) issues.push(`step 2 line outside card: ${d.s.slice(0, 25)}`);
      // vertical: every step-2 line (15 px text, centred on y) lies inside the card panel, and
      // the panel itself inside the 704-px canvas
      if (!panel || panel.x1 <= panel.x0 || panel.y1 <= panel.y0) issues.push('card panel not recorded');
      else {
        if (panel.y0 < 0 || panel.y1 > 704) issues.push(`card panel outside canvas ${Math.round(panel.y0)}..${Math.round(panel.y1)}`);
        for (const d of step2Lines) {
          if (d.y - 9 < panel.y0 || d.y + 9 > panel.y1) issues.push(`step 2 line outside card vertically: ${d.s.slice(0, 25)} y=${Math.round(d.y)} panel ${Math.round(panel.y0)}..${Math.round(panel.y1)}`);
        }
      }
      if (step2Lines.length < 2) issues.push('step 2 wrapped onto fewer than 2 lines (unexpected)');
    }
    // keys: R → EPA recycle page, S → composting-home
    await key(page, 'r');
    await key(page, 's');
    // MOUSE click at the centre of each chip (touch: see touch-compost-intro-sources.spec.js)
    if (st.pre) await mouseClickLogical(page, ...centre(st.pre));
    if (st.src) await mouseClickLogical(page, ...centre(st.src));
    const opened = await page.evaluate(() => window.__opened.slice());
    expect(opened).toEqual([
      'source.html?src=recycle-common-recyclables', 'source.html?src=composting-home',
      'source.html?src=recycle-common-recyclables', 'source.html?src=composting-home',
    ]);
    // the card is still up (R/S/tap do not start the game); Enter starts it as before
    expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro)).toBe(true);
    await key(page, 'Enter');
    await page.waitForFunction(() => !document.querySelector('canvas')._stateRef.current.showMissionIntro);
    await key(page, 'r'); // no card → no-op
    expect((await page.evaluate(() => window.__opened.length))).toBe(4);
    expect(issues).toEqual([]);
    expect(errors).toEqual([]);
  });
}

// Another game keeps today's behaviour: one chip, R does nothing, and S opens ITS OWN source.
// The expected source is fixed per game, so the test fails if the chip or its source is missing.
const OTHER_INTROS = [
  ['foodwaste', 1, 'food-storage-fridge-freezer-cupboard'],
  ['circular', 2, 'circular-economy-rs'],
  ['growing', 1, 'food-diversity'],
];
for (const [island, id, expected] of OTHER_INTROS) {
  test(`intro sources: other game unchanged ${island}:${id} (S → ${expected})`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await setup(page);
    await bootMission(page, island, id, 'el');
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; return { show: s.showMissionIntro, pre: s.introPreSourceRect ?? null, preFact: s.missionIntro?.preFact ?? null, src: s.introSourceRect ?? null, fact: s.missionIntro?.introFact?.sourceId ?? null }; });
    expect(st.show).toBe(true);
    expect(st.pre).toBeNull();
    expect(st.preFact).toBeNull();
    expect(st.fact, 'intro fact source').toBe(expected);
    expect(st.src, 'single source chip drawn').toBeTruthy();
    await key(page, 'r');
    expect(await page.evaluate(() => window.__opened.length)).toBe(0);
    await key(page, 's');
    const opened = await page.evaluate(() => window.__opened.slice());
    expect(opened.length, 'exactly one source opened').toBe(1);
    // games open the viewer as «source.html?src=» or «/source.html?src=»; the source id must match exactly
    expect(opened[0]).toMatch(new RegExp(`^/?source\\.html\\?src=${expected}$`));
  });
}

async function pauseFromIntro(page) {
  await page.getByRole('button', { name: /Παύση/ }).click();
  await expect(page.getByRole('dialog', { name: 'Παύση' })).toBeVisible();
}
async function resume(page) {
  await page.getByRole('button', { name: /Συνέχεια|Συνέχισε|Επιστροφή/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Παύση' })).toHaveCount(0);
}
async function chipRects(page) {
  return page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; return { pre: s.introPreSourceRect, src: s.introSourceRect, show: s.showMissionIntro }; });
}

// (1) Overlay protection — a real mouse click at each chip's REAL position while paused lands
// on the pause overlay, not on the canvas, so nothing opens.
test('4.1 Compost intro sources — paused: the overlay covers both chips', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await setup(page);
  await bootMission(page, 'circular', 1, 'el');
  await page.waitForTimeout(600);
  const r = await chipRects(page);
  expect(r.show).toBe(true);
  expect(r.pre).toBeTruthy(); expect(r.src).toBeTruthy();
  await pauseFromIntro(page);
  for (const rect of [r.pre, r.src]) {
    const pt = await cssPoint(page, ...centre(rect));
    const hitIsCanvas = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', [pt.x, pt.y]);
    expect(hitIsCanvas, 'pause overlay sits over the chip').toBe(false);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(120);
  }
  expect(await page.evaluate(() => window.__opened.length)).toBe(0);
});

// (2) Listener guard — while paused, R / S and a pointerdown sent STRAIGHT to the canvas at each
// chip's real position open nothing. After resuming, the very same calls do open the sources
// (positive control), so the zero above is the guard's doing, not a missed target.
test('4.1 Compost intro sources — paused: the canvas listener guard blocks R/S and chip pointers', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await setup(page);
  await bootMission(page, 'circular', 1, 'el');
  await page.waitForTimeout(600);
  const r = await chipRects(page);
  await pauseFromIntro(page);
  await key(page, 'r'); await key(page, 's');
  await canvasPointerDown(page, ...centre(r.pre));
  await canvasPointerDown(page, ...centre(r.src));
  expect(await page.evaluate(() => window.__opened.slice()), 'nothing opens behind the pause').toEqual([]);
  await resume(page);
  await canvasPointerDown(page, ...centre(r.pre));
  await canvasPointerDown(page, ...centre(r.src));
  await key(page, 'r'); await key(page, 's');
  expect(await page.evaluate(() => window.__opened.slice())).toEqual([
    'source.html?src=recycle-common-recyclables', 'source.html?src=composting-home',
    'source.html?src=recycle-common-recyclables', 'source.html?src=composting-home',
  ]);
});

// (3) Modifiers — Ctrl / Cmd / Alt + R / S (reload, save) open nothing; plain R then does.
test('4.1 Compost intro sources — nothing with Ctrl / Cmd / Alt', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await setup(page);
  await bootMission(page, 'circular', 1, 'el');
  await page.waitForTimeout(600);
  for (const combo of ['Control+KeyR', 'Meta+KeyR', 'Control+KeyS', 'Meta+KeyS', 'Alt+KeyR', 'Alt+KeyS']) {
    await page.keyboard.press(combo); await page.waitForTimeout(80);
  }
  expect(await page.evaluate(() => window.__opened.length)).toBe(0);
  await key(page, 'r');
  expect(await page.evaluate(() => window.__opened.slice())).toEqual(['source.html?src=recycle-common-recyclables']);
});
