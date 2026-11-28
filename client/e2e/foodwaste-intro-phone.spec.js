// Measure the island story against the touch controls on a landscape phone.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { pressEnter } from './helpers.js';

const LANGS = ['el', 'en', 'nl', 'pt'];
const PHONES = [[844, 390], [852, 393], [874, 402], [896, 414], [915, 412], [932, 430], [1024, 576]];
const DPR = Number(process.env.INTRO_PHONE_DPR || 1);
const SHOTS = process.env.INTRO_PHONE_SHOTS || '';
// INTRO_PHONE_MEASURE_ONLY=1: record measurements and screenshots without failing (the «before» run)
const MEASURE_ONLY = process.env.INTRO_PHONE_MEASURE_ONLY === '1';
const MENTOR = [4, 10];
const readLocale = (lang) => JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'));
const fill = (s, v) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k]);
function story(lang) {
  const L = readLocale(lang); const m = L.missions.foodwaste;
  return { text: fill(L.island.intro_foodwaste, { m1: m['1'], m2: m['2'], m3: m['3'] }), name: L.island.mentor_name_foodwaste, cont: `⏎ ${L.island.dialog_continue}`, hint: fill(L.island.mentor_hint, { mission: m['2'] }) };
}

async function installRecorder(page) {
  await page.addInitScript(() => {
    window.__t = []; window.__g = []; window.__rec = false; window.__seq = 0;
    const P = CanvasRenderingContext2D.prototype;
    const ours = (c) => window.__rec && c.canvas === document.querySelector('canvas');
    // path bounding box in backing px, through the transform current at each call
    const grow = (c, pts) => { const m = c.getTransform(); const b = c.__pb || (c.__pb = { l: Infinity, r: -Infinity, top: Infinity, bot: -Infinity });
      for (let i = 0; i < pts.length; i += 2) { const X = m.a * pts[i] + m.c * pts[i + 1] + m.e; const Y = m.b * pts[i] + m.d * pts[i + 1] + m.f;
        b.l = Math.min(b.l, X); b.r = Math.max(b.r, X); b.top = Math.min(b.top, Y); b.bot = Math.max(b.bot, Y); } };
    const wrap = (name, fn) => { const o = P[name]; P[name] = function w(...a) { fn(this, a); return o.apply(this, a); }; };
    wrap('beginPath', (c) => { c.__pb = null; });
    wrap('moveTo', (c, a) => grow(c, a.slice(0, 2)));
    wrap('lineTo', (c, a) => grow(c, a.slice(0, 2)));
    wrap('quadraticCurveTo', (c, a) => grow(c, a.slice(0, 4)));
    wrap('bezierCurveTo', (c, a) => grow(c, a.slice(0, 6)));
    wrap('rect', (c, a) => grow(c, [a[0], a[1], a[0] + a[2], a[1] + a[3]]));
    wrap('fill', (c) => { if (ours(c) && c.__pb) window.__g.push({ seq: window.__seq++, kind: 'fill', style: String(c.fillStyle), ...c.__pb }); });
    wrap('stroke', (c) => { if (ours(c) && c.__pb) { const m = c.getTransform();
      window.__g.push({ seq: window.__seq++, kind: 'stroke', style: String(c.strokeStyle), lw: c.lineWidth * Math.hypot(m.b, m.d), ...c.__pb }); } });
    wrap('fillRect', (c, a) => { if (!ours(c)) return; const m = c.getTransform(); const xs = [a[0], a[0] + a[2]]; const ys = [a[1], a[1] + a[3]];
      const X = xs.flatMap((x) => ys.map((y) => m.a * x + m.c * y + m.e)); const Y = xs.flatMap((x) => ys.map((y) => m.b * x + m.d * y + m.f));
      window.__g.push({ seq: window.__seq++, kind: 'rect', style: String(c.fillStyle), l: Math.min(...X), r: Math.max(...X), top: Math.min(...Y), bot: Math.max(...Y) }); });
    const oT = P.fillText;
    P.fillText = function f(s, x, y, ...r) {
      if (ours(this)) {
        const m = this.getTransform(); const mt = this.measureText(String(s));
        const a = this.textAlign; const w = mt.width;
        window.__t.push({ seq: window.__seq++, s: String(s), font: this.font,
          l: m.a * (x - mt.actualBoundingBoxLeft) + m.e, r: m.a * (x + mt.actualBoundingBoxRight) + m.e,
          top: m.d * (y - mt.actualBoundingBoxAscent) + m.f, bot: m.d * (y + mt.actualBoundingBoxDescent) + m.f, align: a, w });
      }
      return oT.call(this, s, x, y, ...r);
    };
  });
}
async function frame(page) {
  await page.evaluate(() => { window.__t = []; window.__g = []; window.__rec = true; });
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    window.__rec = false;
    const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect(); const h = cv.__hidpi || null;
    const s = cv._stateRef.current;
    const ctrls = [...document.querySelectorAll('[data-touch-control]')].map((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return { key: e.dataset.key || e.getAttribute('aria-label') || '?', l: b.left, r: b.right, t: b.top, b: b.bottom, shown: b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }; }).filter((c) => c.shown);
    return { t: window.__t, g: window.__g, rect: { x: r.left, y: r.top, w: r.width, h: r.height }, cw: cv.width, ch: cv.height, hidpi: h && { k: h.k, ox: h.ox, oy: h.oy },
      layout: s.mentorDialogLayout, text: s.mentorDialog?.text ?? null, ctrls, vw: innerWidth, vh: innerHeight,
      profile: document.querySelector('[data-viewport-profile]')?.dataset.viewportProfile ?? null };
  });
}
// backing px → CSS px, and logical px (HUD, layout) → CSS px
const toCss = (F, b) => { const fx = F.rect.w / F.cw; const fy = F.rect.h / F.ch; return { l: F.rect.x + b.l * fx, r: F.rect.x + b.r * fx, t: F.rect.y + b.top * fy, b: F.rect.y + b.bot * fy }; };
const logicalY = (F, y) => { const k = F.hidpi ? F.hidpi.k : F.cw / 1280; const oy = F.hidpi ? F.hidpi.oy : 0; return F.rect.y + (oy + k * y) * (F.rect.h / F.ch); };
const cssBox = (F, b) => toCss(F, b);
const mid = (b) => ({ x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 });
// touch controls that must be on screen on a phone held sideways in the island room
const REQUIRED_CTRLS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Enter'];
const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
const r1 = (v) => Math.round(v * 10) / 10;

/** The card as drawn in the last frame: body lines (the dialog text, in order), name and continue hint. */
function drawnCard(F, exp, text) {
  const norm = (v) => v.replace(/\s+/g, ' ').trim();
  const t = F.t;
  // the body: consecutive texts (same font) that join to the dialog text — the last such run in the frame
  let body = null;
  for (let i = 0; i < t.length; i++) {
    let acc = '';
    for (let j = i; j < t.length && t[j].font === t[i].font; j++) {
      acc = norm(acc ? `${acc} ${t[j].s}` : t[j].s);
      if (!norm(text).startsWith(acc)) break;
      if (acc === norm(text)) { body = t.slice(i, j + 1); break; }
    }
  }
  const name = t.filter((x) => x.s === exp.name).pop() || null;
  const cont = t.filter((x) => x.s === exp.cont).pop() || null;
  return { body, name, cont };
}

/** The painted boxes of the frame, in CSS px: the dim overlay drawn by the dialog, the HUD bar under it,
 *  and the card itself — the last opaque path fill before the first body line that contains that line,
 *  widened by its stroke (half the line width, through the transform). */
function drawnBoxes(F, body) {
  const g = F.g; const first = body[0].seq;
  const inside = (o, x) => o.l <= x.l + 0.5 && o.r >= x.r - 0.5 && o.top <= x.top + 0.5 && o.bot >= x.bot - 0.5;
  const fill = g.filter((o) => o.kind === 'fill' && o.seq < first && !/^rgba/.test(o.style) && inside(o, body[0])).pop() || null;
  if (!fill) return { card: null };
  const stroke = g.find((o) => o.kind === 'stroke' && o.seq === fill.seq + 1 && Math.abs(o.top - fill.top) < 0.5 && Math.abs(o.l - fill.l) < 0.5) || null;
  const h = stroke ? stroke.lw / 2 : 0;
  const overlay = g.filter((o) => o.kind === 'rect' && o.seq < fill.seq && /^rgba\(0, 0, 0, 0\.36\)$/.test(o.style)).pop() || null;
  const hud = overlay && g.filter((o) => o.kind === 'rect' && o.seq < overlay.seq && /83, 63, 139|#533f8b/i.test(o.style)
    && Math.abs(o.top - overlay.top) < 0.5 && Math.abs(o.l - overlay.l) < 0.5 && Math.abs(o.r - overlay.r) < 0.5
    && (o.bot - o.top) < (overlay.bot - overlay.top) / 6).pop() || null;
  return {
    card: cssBox(F, fill), edge: cssBox(F, { l: fill.l - h, r: fill.r + h, top: fill.top - h, bot: fill.bot + h }), stroked: !!stroke,
    overlay: overlay && cssBox(F, overlay), hud: hud && cssBox(F, hud),
  };
}
/** card centred on the painted logical area (the dialog's overlay), both ways, within 0.5 CSS px */
function expectDrawnCentred(F, label) {
  const c = drawnCard(F, {}, F.text);
  expect(c.body, `${label}: whole text drawn`).toBeTruthy();
  const d = drawnBoxes(F, c.body);
  expect(d.card, `${label}: card drawn`).toBeTruthy();
  expect(d.overlay, `${label}: overlay drawn`).toBeTruthy();
  const dy = mid(d.card).y - mid(d.overlay).y; const dx = mid(d.card).x - mid(d.overlay).x;
  console.log('compact intro card', JSON.stringify({ label, dx: r1(dx), dy: r1(dy), cardTop: r1(d.card.t), cardBottom: r1(d.card.b) }));
  expect(Math.abs(dx), `${label}: drawn card centred horizontally`).toBeLessThan(0.5);
  expect(Math.abs(dy), `${label}: drawn card centred vertically`).toBeLessThan(0.5);
  return d;
}

async function checkPhoneCard(page, lang, label, kind = 'story', shot = '') {
  const exp = story(lang);
  const F = await frame(page);
  if (shot) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${shot}.png` }); }
  const want = kind === 'story' ? exp.text : exp.hint;
  expect(F.text, `${label}: dialog text`).toBe(want);
  const c = drawnCard(F, exp, want);
  expect(c.body, `${label}: whole text drawn`).toBeTruthy();
  expect(c.name, `${label}: name drawn`).toBeTruthy();
  expect(c.cont, `${label}: continue hint drawn`).toBeTruthy();
  const boxes = [...c.body.map((x) => ({ what: `"${x.s.slice(0, 24)}…"`, ...toCss(F, x) })), { what: 'name', ...toCss(F, c.name) }, { what: 'continue', ...toCss(F, c.cont) }];
  const d = drawnBoxes(F, c.body);
  const hudBottom = d.hud ? d.hud.b : NaN; const cardTop = d.edge ? d.edge.t : NaN; const cardBottom = d.edge ? d.edge.b : NaN;
  const lastLine = boxes[c.body.length - 1];
  const up = F.ctrls.find((k) => k.key === 'ArrowUp');
  const m = { label, profile: F.profile, top: F.layout.top, lines: c.body.length, hudBottom: r1(hudBottom), cardTop: r1(cardTop), cardBottom: r1(cardBottom),
    layoutCardTop: r1(logicalY(F, F.layout.y)), layoutHudBottom: r1(logicalY(F, 36)), stroked: d.stroked,
    lastLineBottom: r1(lastLine.b), upTop: up ? r1(up.t) : null, clearAboveUp: up ? r1(up.t - lastLine.b) : null, contBottom: r1(boxes.at(-1).b),
    ctrls: F.ctrls.map((k) => k.key) };
  m.covered = boxes.flatMap((b) => F.ctrls.filter((k) => hit(b, k)).map((k) => `${b.what}×${k.key}`));
  console.log('phone intro', JSON.stringify(m));
  if (MEASURE_ONLY) return { F, m, cardTop, hudBottom, boxes };
  expect(d.card, `${label}: card drawn`).toBeTruthy();
  expect(d.hud, `${label}: HUD bar drawn`).toBeTruthy();
  for (const key of REQUIRED_CTRLS) expect(m.ctrls, `${label}: touch control ${key} on screen`).toContain(key);
  for (const b of boxes) {
    expect(b.l >= d.card.l - 0.5 && b.r <= d.card.r + 0.5 && b.t >= d.card.t - 0.5 && b.b <= d.card.b + 0.5, `${label}: ${b.what} inside the drawn card`).toBe(true);
  }
  expect(d.edge.t >= -0.5 && d.edge.b <= F.vh + 0.5, `${label}: drawn card inside the viewport`).toBe(true);
  for (const b of boxes) {
    expect(b.l >= -0.5 && b.r <= F.vw + 0.5 && b.t >= -0.5 && b.b <= F.vh + 0.5, `${label}: ${b.what} inside the viewport`).toBe(true);
    for (const k of F.ctrls) expect(hit(b, k), `${label}: ${b.what} clear of touch ${k.key}`).toBe(false);
  }
  return { F, m, cardTop, hudBottom, boxes };
}

async function arrive(page, lang) {
  await page.goto(`/?testMode=1&lang=${lang}&startIsland=foodwaste`);
  await page.waitForFunction(() => { const s = document.querySelector('canvas')?._stateRef?.current;
    return window.__playfood?.screen() === 'island' && !!s?.mentorDialog && s.irisOpenness >= 1; }, null, { timeout: 20_000 });
  await page.waitForTimeout(400);
}
async function pressUntil(page, cond, what) {
  for (let i = 0; i < 5; i += 1) {
    await pressEnter(page);
    if (await page.waitForFunction(cond, null, { timeout: 1_500 }).then(() => true, () => false)) return;
  }
  throw new Error(`Enter did not register: ${what}`);
}
/** close the arrival card, stand under the chef, talk to her again with a real Enter */
async function talkAgain(page) {
  await pressUntil(page, () => !document.querySelector('canvas')._stateRef.current.mentorDialog, 'close the story');
  await page.evaluate(([c, r]) => { const p = document.querySelector('canvas')._stateRef.current.player;
    p.col = c; p.row = r; p.pixelX = c * 32; p.pixelY = r * 32; p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = 1; }, [MENTOR[0], MENTOR[1] + 1]);
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.nearMentor, null, { timeout: 5_000 });
  await pressUntil(page, () => !!document.querySelector('canvas')._stateRef.current.mentorDialog, 'talk to the chef again');
  await page.waitForTimeout(400);
}

for (const [w, h] of PHONES) {
  test.describe(`${w}x${h}@${DPR}x`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: DPR, hasTouch: true }); // a touch phone: the controls only show with a finger-type pointer
    for (const lang of LANGS) {
      test(`story on arrival and talking again: whole, clear of the controls, under the HUD — ${lang} ${w}x${h}`, async ({ page }) => {
        await installRecorder(page);
        await arrive(page, lang);
        for (const path of ['arrival', 'talk again']) {
          if (path === 'talk again') await talkAgain(page);
          const label = `${lang} ${w}x${h}@${DPR}x ${path}`;
          const { m, cardTop, hudBottom } = await checkPhoneCard(page, lang, label, 'story', SHOTS ? `${w}x${h}_${DPR}x_${lang}_${path.replace(' ', '_')}` : '');
          if (MEASURE_ONLY) continue;
          expect(m.profile, `${label}: phone-landscape`).toBe('phone-landscape');
          expect(m.top, `${label}: the story card is lifted`).toBe(true);
          expect(cardTop, `${label}: card top ≥ 1 CSS px below the HUD bar`).toBeGreaterThanOrEqual(hudBottom + 1);
        }
      });
    }
  });
}

test.describe('elsewhere unchanged', () => {
  test.use({ deviceScaleFactor: DPR, hasTouch: true });
  for (const lang of LANGS) {
    test(`1366x768: the story stays centred — ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await installRecorder(page);
      await arrive(page, lang);
      const F = await frame(page);
      expect(F.text, 'the story').toBe(story(lang).text);
      expect(F.layout.top, 'not lifted').toBe(false);
      expectDrawnCentred(F, `${lang} 1366x768 story`);
    });
    // Check the position of every mentor dialogue on a landscape phone.
    test(`844x390: the hint dialog sits at the top too, whole and clear of the controls — ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: 844, height: 390 });
      await installRecorder(page);
      await page.goto(`/?testMode=1&lang=${lang}`);
      await page.waitForFunction((l) => window.__playfood?.language() === l, lang, { timeout: 20_000 });
      await page.evaluate(() => { window.__playfood.setProgress({ completedMissions: { foodwaste: [1] }, ceremoniesSeen: ['foodwaste'], reflectionsSeen: ['foodwaste'] }); window.__playfood.goToIsland('foodwaste'); });
      await page.waitForFunction(() => { const s = document.querySelector('canvas')?._stateRef?.current; return window.__playfood?.screen() === 'island' && !!s?.player && s.irisOpenness >= 1 && !s.mentorDialog; }, null, { timeout: 20_000 });
      await page.evaluate(([c, r]) => { const p = document.querySelector('canvas')._stateRef.current.player;
        p.col = c; p.row = r; p.pixelX = c * 32; p.pixelY = r * 32; p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = 1; }, [MENTOR[0], MENTOR[1] + 1]);
      await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.nearMentor, null, { timeout: 5_000 });
      await pressUntil(page, () => !!document.querySelector('canvas')._stateRef.current.mentorDialog, 'open the hint');
      await page.waitForTimeout(400);
      const { m, cardTop, hudBottom } = await checkPhoneCard(page, lang, `${lang} 844x390 hint`, 'hint');
      expect(m.top, 'hint lifted').toBe(true);
      expect(cardTop).toBeGreaterThanOrEqual(hudBottom + 1);
    });
  }
  test('resize with the card open: 1366 → 844 → 1366 moves it and back (el, pt)', async ({ page }) => {
    await installRecorder(page); // once: a second init script would record every text twice
    for (const lang of ['el', 'pt']) {
      await page.setViewportSize({ width: 1366, height: 768 });
      await arrive(page, lang);
      let F = await frame(page);
      expect(F.layout.top, `${lang}: centred at 1366`).toBe(false);
      expectDrawnCentred(F, `${lang} 1366 before resize`);
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.mentorDialogLayout?.top === true, null, { timeout: 5_000 });
      await page.waitForTimeout(400);
      const { m, cardTop, hudBottom } = await checkPhoneCard(page, lang, `${lang} resized to 844`);
      expect(m.top).toBe(true);
      expect(cardTop).toBeGreaterThanOrEqual(hudBottom + 1);
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.mentorDialogLayout?.top === false, null, { timeout: 5_000 });
      await page.waitForTimeout(400);
      F = await frame(page);
      expectDrawnCentred(F, `${lang} 1366 after resize`);
    }
  });
});
