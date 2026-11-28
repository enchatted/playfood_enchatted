// Check the complete translated text on each screen at the supported viewport sizes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission, driveToResult, pressEnter, touchHold } from './helpers.js';
import { WASTE_FACTS } from '../src/data/foodwaste.js';

// Regression control: replay only the previous coach-title/body gap in the
// browser response; the application files and all visibility assertions stay intact.
test.beforeEach(async ({ page }) => {
  if (process.env.CHEF_LAYOUT_NEGATIVE_CONTROL !== '1') return;
  await page.route('**/src/games/engine/mealPlannerRenderer.js*', async route => {
    const response = await route.fetch();
    const body = await response.text();
    const current = 'coach.y + 26 + index * CHEF_COACH_LINE_STEP';
    expect(body, 'the intended coach-layout mutation must be installed').toContain(current);
    await route.fulfill({ response, body: body.replace(current, 'coach.y + 21 + index * CHEF_COACH_LINE_STEP') });
  });
});

const LANGS = ['el', 'en', 'nl', 'pt'];
const SIZES = ['1920x1080', '1366x768', '1280x720', '1024x768', '844x390'];
const SHOTS = process.env.TEXT_CYCLE_SHOTS || '';
const BASELINE = process.env.TEXT_CYCLE_BASELINE === '1';
const MODE = BASELINE ? 'baseline (the locale values on disk)' : 'approved (the directive values)';
const EPS = 0.5;
const MASK_MIN = 8; // a pixel a draw call changed by at least this much belongs to its ink
// on screen a reference pixel must change by at least this share of its reference change (the
// comparison is pixel-exact, so a clean frame gives 1.0; a veil that dims the text by more than 20 %
// fails here)
const RELATIVE = 0.8;
const VISIBLE_SHARE = 0.9; // share of a glyph's own ink pixels that must be visible
const FAINT = 0.5; // a text colour (or text fill) with a lower alpha is reported as faint
const LOGO = 'secondary-logo-white.svg';

console.log(`TEXT_CYCLE mode=${MODE}`);

const APPROVED = {
  'avatar.controls_look': { el: 'Κοίτα γύρω σου', en: 'Look around', nl: 'Kijk rond', pt: 'Olha à volta' },
  'hub.harbor_title': { el: 'Αρχιπέλαγος PLAYFOOD', en: 'PLAYFOOD Archipelago', nl: 'PLAYFOOD Archipel', pt: 'Arquipélago PLAYFOOD' },
  'hub.harbor_subtitle': { el: 'Αρχιπέλαγος', en: 'Archipelago', nl: 'Archipel', pt: 'Arquipélago' },
  'island.intro_foodwaste': {
    el: "Ξεκίνα με την αποστολή «{{m1}}». Πήγαινε στον χαρακτήρα πάνω αριστερά.",
    en: "Start with “{{m1}}”. Walk to the character at the top left.",
    nl: "Begin met ‘{{m1}}’. Loop naar het personage linksboven.",
    pt: "Começa pela missão «{{m1}}». Vai até à personagem no canto superior esquerdo.",
  },
  // Use the displayed score category for advice about ingredient choices.
  'meal_planner.nudge_plant': {
    el: "Στο παιχνίδι οι φακές δίνουν περισσότερους πόντους στο «Φιλικό για τον πλανήτη».",
    en: "In this game lentils give more Planet-friendly points.",
    nl: "In dit spel geven linzen meer punten voor Goed voor de planeet.",
    pt: "Neste jogo as lentilhas dão mais pontos em Amigo do planeta.",
  },
  'meal_planner.results.tier_great_body': {
    el: "Το πλάνο σου ήταν δυνατό. Σε μερικές επιλογές θα μπορούσες να χρησιμοποιήσεις περισσότερα τρόφιμα από το ψυγείο ή υλικά με μικρότερη επίδραση στο περιβάλλον.",
    en: "Your plan was strong. A few choices could use more food from the fridge or ingredients with a lower impact on the environment.",
    nl: "Je plan was sterk. Bij een paar keuzes kon je meer uit de koelkast gebruiken of kiezen voor eten met minder impact.",
    pt: "O teu plano foi forte. Em algumas escolhas, podias usar mais alimentos do frigorífico ou ingredientes com menos impacto.",
  },
};

// Use the completed plan's whole-point score, rounded down.
const MEAL_RESULT = {
  island: 'foodwaste', mission: 'MealPlanner', missionId: 2, score: 74, passed: true,
  tier: 'great', stars: 2,
};
// A completed run supplies no separate axes line to the result screen.

const readLocale = (lang) => JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'));
const readPath = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);

// The locale files must not change while the run proves them. Playwright starts a new worker after
// every failed test (beforeAll runs again), so the reference is taken ONCE for the whole run by the
// caller (TEXT_CYCLE_LOCALE_SHA256, JSON {file: sha256}); without it each worker compares with its
// own start. The cycle's own five values get a separate hash, so a parallel edit to an unrelated key
// (which also invalidates the run) is told apart from a change to this cycle's values.
const LOCALE_FILES = LANGS.map((l) => `src/i18n/locales/${l}.json`);
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const localeHashes = () => Object.fromEntries(LOCALE_FILES.map((f) => [f, sha256(fs.readFileSync(f))]));
const cycleHash = () => sha256(JSON.stringify(LANGS.map((l) => Object.keys(APPROVED).map((k) => readPath(readLocale(l), k)))));
const RUN_HASHES = process.env.TEXT_CYCLE_LOCALE_SHA256 ? JSON.parse(process.env.TEXT_CYCLE_LOCALE_SHA256) : null;
let atStart = null;
test.beforeAll(() => {
  atStart = { files: localeHashes(), cycle: cycleHash() };
  console.log(`TEXT_CYCLE locale sha256 at worker start ${JSON.stringify(atStart)}`);
  if (RUN_HASHES) expect(atStart.files, 'the locale files are the ones hashed when the run started').toEqual(RUN_HASHES);
});
test.afterAll(() => {
  const end = { files: localeHashes(), cycle: cycleHash() };
  console.log(`TEXT_CYCLE locale sha256 at worker end ${JSON.stringify(end)}`);
  expect(end.cycle, 'the five values of this cycle did not change during the run').toBe(atStart.cycle);
  expect(end.files, 'no locale file changed during the run (an edit to any other key also invalidates it)').toEqual(RUN_HASHES || atStart.files);
});
function expectedValue(lang, key) {
  const value = readPath(readLocale(lang), key);
  if (!BASELINE) expect(value, `${lang}.${key} on disk is the approved value`).toBe(APPROVED[key][lang]);
  return value;
}
const hit = (a, b) => a.l < b.r - EPS && b.l < a.r - EPS && a.top < b.bot - EPS && b.top < a.bot - EPS;
const inside = (a, box) => a.l >= box.l - EPS && a.r <= box.r + EPS && a.top >= box.top - EPS && a.bot <= box.bot + EPS;
const alphaOf = (style) => { const m = /^rgba\([^)]*,([\d.]+)\)$/.exec(style || ''); return m ? Number(m[1]) : 1; };

// ── In-page instrumentation (installed before any app code) ──────────────────────────────────
// For one frame of the visible canvas it records every text (ink box, per-glyph advance boxes and
// the pixels the text really painted) and every fill / stroke / rectangle / image with its box; it
// can redraw that frame without some texts or the logo, and it can freeze/step the RAF loop so a
// frame is redrawn with the same timestamp (the loops derive dt from it, so dt = 0).
function instrument() {
  const T = {
    rec: false, ops: [], seq: 0, masks: new Map(), skip: new Set(), skipLogo: false, drop: new Set(), mutate: null,
    cover: null, probe: null, probeSeen: false, frozen: false, queue: [], lastT: 0, ids: 0, real: new Map(), ink: 8,
    freezeOnProbe: false, canvasIds: 0,
    // negative controls only: draw a text under ctx.clip / faint (globalAlpha, colour, gradient) /
    // under a Path2D veil / with an arcTo shape over the top of one glyph
    clipNeg: null, alphaNeg: null, pathNeg: null, arcNeg: null,
  };
  window.__tc = T;
  const P = CanvasRenderingContext2D.prototype;
  const live = (ctx) => !!(ctx.canvas && ctx.canvas.isConnected);
  const canvasId = (ctx) => ctx.canvas.__tcId || (ctx.canvas.__tcId = ++T.canvasIds);
  const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase();
  const point = (ctx, x, y) => { const m = ctx.getTransform(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; };
  const boxOf = (ctx, pts) => {
    const ps = pts.map(([x, y]) => point(ctx, x, y));
    return { l: Math.min(...ps.map((p) => p[0])), r: Math.max(...ps.map((p) => p[0])), top: Math.min(...ps.map((p) => p[1])), bot: Math.max(...ps.map((p) => p[1])) };
  };
  const grow = (ctx, x, y) => {
    if (!T.rec || !live(ctx)) return;
    const [px, py] = point(ctx, x, y);
    const b = ctx.__pb || (ctx.__pb = { l: Infinity, r: -Infinity, top: Infinity, bot: -Infinity });
    b.l = Math.min(b.l, px); b.r = Math.max(b.r, px); b.top = Math.min(b.top, py); b.bot = Math.max(b.bot, py);
  };
  const strokePad = (ctx) => { const m = ctx.getTransform(); return (ctx.lineWidth || 1) * Math.max(Math.abs(m.a), Math.abs(m.d)) / 2; };
  const before = (name, fn) => { const o = P[name]; if (!o) return; P[name] = function wrapped(...a) { fn(this, a); return o.apply(this, a); }; };
  before('beginPath', (c) => { c.__pb = null; });
  before('moveTo', (c, [x, y]) => grow(c, x, y));
  before('lineTo', (c, [x, y]) => grow(c, x, y));
  before('quadraticCurveTo', (c, [a, b, x, y]) => { grow(c, a, b); grow(c, x, y); });
  before('bezierCurveTo', (c, [a, b, d, e, x, y]) => { grow(c, a, b); grow(c, d, e); grow(c, x, y); });
  before('arc', (c, [x, y, r]) => { grow(c, x - r, y - r); grow(c, x + r, y + r); });
  // arcTo: the corner points and the radius around the first one bound the arc it adds
  before('arcTo', (c, [x1, y1, x2, y2, r]) => { grow(c, x1 - r, y1 - r); grow(c, x1 + r, y1 + r); grow(c, x2, y2); });
  before('ellipse', (c, [x, y, rx, ry]) => { const r = Math.max(rx, ry); grow(c, x - r, y - r); grow(c, x + r, y + r); });
  before('rect', (c, [x, y, w, h]) => { grow(c, x, y); grow(c, x + w, y + h); });
  before('roundRect', (c, [x, y, w, h]) => { grow(c, x, y); grow(c, x + w, y + h); });
  // fill/stroke of a Path2D: its bounds are not tracked, so it counts as covering the whole canvas
  const isPath2D = (a) => typeof Path2D !== 'undefined' && a[0] instanceof Path2D;
  const whole = (c) => ({ l: 0, r: c.canvas.width, top: 0, bot: c.canvas.height });
  before('fill', (c, a) => {
    if (!T.rec || !live(c)) return;
    if (isPath2D(a)) T.ops.push({ seq: ++T.seq, cid: canvasId(c), kind: 'fill(Path2D)', style: norm(c.fillStyle), ...whole(c) });
    else if (c.__pb) T.ops.push({ seq: ++T.seq, cid: canvasId(c), kind: 'fill', style: norm(c.fillStyle), ...c.__pb });
  });
  before('stroke', (c, a) => {
    if (!T.rec || !live(c)) return;
    if (isPath2D(a)) { T.ops.push({ seq: ++T.seq, cid: canvasId(c), kind: 'stroke(Path2D)', style: norm(c.strokeStyle), ...whole(c) }); return; }
    if (!c.__pb) return;
    const p = strokePad(c); const b = c.__pb;
    T.ops.push({ seq: ++T.seq, cid: canvasId(c), kind: 'stroke', style: norm(c.strokeStyle), l: b.l - p, r: b.r + p, top: b.top - p, bot: b.bot + p });
  });
  before('clearRect', (c, [x, y, w, h]) => {
    if (T.rec && live(c)) T.ops.push({ seq: ++T.seq, cid: canvasId(c), kind: 'clearRect', ...boxOf(c, [[x, y], [x + w, y + h], [x, y + h], [x + w, y]]) });
  });
  before('putImageData', (c, [img, dx, dy]) => { // device pixels, the transform does not apply
    if (T.rec && live(c)) T.ops.push({ seq: ++T.seq, cid: canvasId(c), kind: 'putImageData', l: dx, r: dx + img.width, top: dy, bot: dy + img.height });
  });
  before('fillRect', (c, [x, y, w, h]) => {
    if (T.rec && live(c)) T.ops.push({ seq: ++T.seq, cid: canvasId(c), kind: 'rect', style: norm(c.fillStyle), ...boxOf(c, [[x, y], [x + w, y + h], [x, y + h], [x + w, y]]) });
  });
  before('strokeRect', (c, [x, y, w, h]) => {
    if (!T.rec || !live(c)) return;
    const p = strokePad(c); const b = boxOf(c, [[x, y], [x + w, y + h]]);
    T.ops.push({ seq: ++T.seq, cid: canvasId(c), kind: 'strokeRect', style: norm(c.strokeStyle), l: b.l - p, r: b.r + p, top: b.top - p, bot: b.bot + p });
  });

  // The ink of one draw call, in canvas pixels inside `box`. `ideal(o)` repeats the same draw on a
  // copy of the pixels underneath, with the same transform, font and colours but WITHOUT clip,
  // globalAlpha, compositing or filter: that is the ink the call is meant to paint, so a clip or a
  // faint alpha cannot shrink the reference together with the text. Per pixel: x, y, the ideal
  // difference (the reference) and the difference the real call made.
  const STATE = ['font', 'textAlign', 'textBaseline', 'direction', 'letterSpacing', 'wordSpacing', 'fontKerning', 'fontStretch',
    'fontVariantCaps', 'textRendering', 'fillStyle', 'strokeStyle', 'lineWidth', 'lineJoin', 'miterLimit', 'shadowColor',
    'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'imageSmoothingEnabled', 'imageSmoothingQuality'];
  // The reference canvas has the SAME size and the SAME transform as the real one: shifting the
  // transform into a small canvas changes the float rounding of the glyph positions, and at 844×390
  // (translation 67.45) some glyphs then land on another subpixel position (measured: 96 % → 100 %
  // identical pixels once size and transform are the same).
  let refCanvas = null;
  const refContext = (w, h) => {
    if (!refCanvas || refCanvas.width !== w || refCanvas.height !== h) refCanvas = new OffscreenCanvas(w, h);
    const o = refCanvas.getContext('2d');
    if (o.reset) o.reset(); else { refCanvas = new OffscreenCanvas(w, h); return refCanvas.getContext('2d'); }
    return o;
  };
  const paint = (ctx, box, draw, ideal) => {
    const cw = ctx.canvas.width; const ch = ctx.canvas.height;
    const x0 = Math.max(0, Math.floor(box.l) - 2); const y0 = Math.max(0, Math.floor(box.top) - 2);
    const x1 = Math.min(cw, Math.ceil(box.r) + 2); const y1 = Math.min(ch, Math.ceil(box.bot) + 2);
    const fs = ctx.fillStyle;
    const state = {
      alpha: ctx.globalAlpha, comp: ctx.globalCompositeOperation, filter: ctx.filter,
      paint: typeof fs === 'string' ? 'colour' : (fs && fs.constructor && fs.constructor.name) || 'unknown',
    };
    if (x1 <= x0 || y1 <= y0) return { x0, y0, w: 0, h: 0, px: [], state, out: draw() };
    const w = x1 - x0; const h = y1 - y0;
    const under = ctx.getImageData(x0, y0, w, h);
    const out = draw();
    const a = under.data; const b = ctx.getImageData(x0, y0, w, h).data;
    const o = refContext(cw, ch);
    o.putImageData(under, x0, y0);
    o.setTransform(ctx.getTransform());
    for (const k of STATE) { try { if (k in o) o[k] = ctx[k]; } catch { /* not settable here */ } }
    o.globalAlpha = 1; o.globalCompositeOperation = 'source-over'; o.filter = 'none';
    // the ideal keeps the real colour (glyph rasterisation depends on it, so a different alpha would
    // not give the same pixels); a faint colour is reported from its alpha instead
    const rgba = typeof fs === 'string' ? /^rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)$/.exec(fs) : null;
    state.fillAlpha = rgba ? Number(rgba[1]) : 1;
    ideal(o);
    const r = o.getImageData(x0, y0, w, h).data;
    const px = [];
    for (let i = 0; i < a.length; i += 4) {
      const dRef = Math.max(Math.abs(a[i] - r[i]), Math.abs(a[i + 1] - r[i + 1]), Math.abs(a[i + 2] - r[i + 2]));
      if (dRef < T.ink) continue;
      const dAct = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      const k = i / 4; px.push(x0 + (k % w), y0 + Math.floor(k / w), dRef, dAct);
    }
    return { x0, y0, w, h, px, state, out };
  };
  const textBox = (ctx, s, x, y) => {
    const m = ctx.getTransform(); const mt = ctx.measureText(s);
    return {
      l: m.a * (x - mt.actualBoundingBoxLeft) + m.e, r: m.a * (x + mt.actualBoundingBoxRight) + m.e,
      top: m.d * (y - mt.actualBoundingBoxAscent) + m.f, bot: m.d * (y + mt.actualBoundingBoxDescent) + m.f,
    };
  };

  const drawImage = P.drawImage;
  P.drawImage = function recordedDrawImage(img, ...a) {
    const src = (img && (img.currentSrc || img.src)) || '';
    const logo = /logo/.test(src);
    if (!live(this)) return drawImage.call(this, img, ...a);
    if (logo && T.skipLogo) return undefined;
    if (!T.rec) return drawImage.call(this, img, ...a);
    let dx; let dy; let dw; let dh;
    if (a.length >= 8) [, , , , dx, dy, dw, dh] = a;
    else if (a.length >= 4) [dx, dy, dw, dh] = a;
    else { [dx, dy] = a; dw = img?.width || 0; dh = img?.height || 0; }
    const box = boxOf(this, [[dx, dy], [dx + dw, dy + dh]]);
    const op = { seq: ++T.seq, kind: 'image', src: logo ? src : '', cid: canvasId(this), ...box };
    T.ops.push(op);
    if (!logo) return drawImage.call(this, img, ...a);
    const m = paint(this, box, () => drawImage.call(this, img, ...a), (o) => o.drawImage(img, ...a));
    m.state.paint = 'image'; m.state.fillAlpha = 1; // an image does not use the fill colour
    T.masks.set(op.seq, m);
    return m.out;
  };

  // negative controls: the same text drawn under a clip that hides its bottom share, or faint
  const drawNeg = (ctx, s, x, y, draw) => {
    if (T.clipNeg && s === T.clipNeg.s) {
      const mt = ctx.measureText(s); const h = mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent;
      ctx.save(); ctx.beginPath();
      ctx.rect(x - mt.actualBoundingBoxLeft - 2, y - mt.actualBoundingBoxAscent - 2, mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight + 4, h * (1 - T.clipNeg.share) + 2);
      ctx.clip();
      try { return draw(); } finally { ctx.restore(); }
    }
    return draw();
  };

  const fillText = P.fillText;
  P.fillText = function recordedFillText(t, x, y, ...rest) {
    const s = String(t);
    if (!live(this)) return fillText.call(this, t, x, y, ...rest);
    if (T.drop.has(s)) return undefined; // negative control: the text is never drawn
    if (T.mutate && s === T.mutate.from) return P.fillText.call(this, T.mutate.to, x, y, ...rest);
    if (T.alphaNeg && s === T.alphaNeg.s && !this.__tcFaint) { // negative control: set before the call, as an app would
      this.save(); this.__tcFaint = true;
      if (T.alphaNeg.alpha != null) this.globalAlpha = T.alphaNeg.alpha;
      if (T.alphaNeg.fill) this.fillStyle = T.alphaNeg.fill;
      if (T.alphaNeg.gradient) {
        const colour = String(this.fillStyle); const g = this.createLinearGradient(x, 0, x + this.measureText(s).width, 0);
        g.addColorStop(0, colour); g.addColorStop(0.5, colour); g.addColorStop(1, 'rgba(0,0,0,0)'); this.fillStyle = g;
      }
      try { return P.fillText.call(this, t, x, y, ...rest); } finally { this.__tcFaint = false; this.restore(); }
    }
    if (T.probe !== null && s === T.probe) {
      T.probeSeen = true;
      if (T.freezeOnProbe) T.frozen = true; // hold the loop at the very frame that first drew it
    }
    let out;
    if (T.skip.has(s)) {
      // pixel proof: the same frame without this text (anything else, e.g. a cover, still draws)
    } else if (T.rec && s.trim()) {
      const m = this.getTransform(); const mt = this.measureText(s); const align = this.textAlign;
      const x0 = align === 'center' ? x - mt.width / 2 : (align === 'right' || align === 'end') ? x - mt.width : x;
      const chars = []; let prefix = '';
      for (const ch of s) {
        const a = this.measureText(prefix).width; prefix += ch; const b = this.measureText(prefix).width;
        // a variation selector / joiner / combining mark has no ink of its own: it belongs to the
        // glyph before it (one grapheme, e.g. «🍽️» = 🍽 + U+FE0F), so it widens that glyph instead
        if (/^(?:[\uFE00-\uFE0F\u200D\u20E3]|\p{M})$/u.test(ch) && chars.length) { const g = chars[chars.length - 1]; g.ch += ch; g.r = m.a * (x0 + b) + m.e; continue; }
        if (ch.trim()) chars.push({ ch, l: m.a * (x0 + a) + m.e, r: m.a * (x0 + b) + m.e });
      }
      const op = { seq: ++T.seq, kind: 'text', s, font: this.font, ax: m.a * x + m.e, ay: m.d * y + m.f, chars, cid: canvasId(this), ...textBox(this, s, x, y) };
      T.ops.push(op);
      const painted = paint(this, op, () => drawNeg(this, s, x, y, () => fillText.call(this, t, x, y, ...rest)), (o) => o.fillText(t, x, y, ...rest));
      T.masks.set(op.seq, painted);
      out = painted.out;
    } else {
      out = drawNeg(this, s, x, y, () => fillText.call(this, t, x, y, ...rest));
    }
    if (T.cover && s === T.cover.s) { // negative control: a shape drawn over part of the text later
      const mt = this.measureText(s); const h = mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent;
      const x0 = this.textAlign === 'center' ? x - mt.width / 2 : x;
      this.save(); this.fillStyle = '#123456';
      this.fillRect(x0, y + mt.actualBoundingBoxDescent - h * T.cover.share, mt.width, h * T.cover.share);
      this.restore();
    }
    if (T.arcNeg && s === T.arcNeg.s) { // negative control: a shape made only of arcTo over one glyph's top
      const mt = this.measureText(s); const chars = [...s]; const k = T.arcNeg.index;
      const x0 = this.textAlign === 'center' ? x - mt.width / 2 : x;
      const L = x0 + this.measureText(chars.slice(0, k).join('')).width; const R = x0 + this.measureText(chars.slice(0, k + 1).join('')).width;
      const top = y - mt.actualBoundingBoxAscent - 1; const B = top + 1 + (mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent) * T.arcNeg.share;
      const r = Math.min(1.5, (R - L) / 4);
      this.save(); this.fillStyle = T.arcNeg.style; this.beginPath(); this.moveTo(L + r, top);
      this.arcTo(R, top, R, B, r); this.arcTo(R, B, L, B, r); this.arcTo(L, B, L, top, r); this.arcTo(L, top, R, top, r);
      this.closePath(); this.fill(); this.restore();
    }
    if (T.pathNeg && s === T.pathNeg.s) { // negative control: a translucent Path2D veil drawn later
      const mt = this.measureText(s); const x0 = this.textAlign === 'center' ? x - mt.width / 2 : x;
      const veil = new Path2D(); veil.rect(x0 - 2, y - mt.actualBoundingBoxAscent - 2, mt.width + 4, mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent + 4);
      this.save(); this.fillStyle = T.pathNeg.style; this.fill(veil); this.restore();
    }
    return out;
  };

  // an outline drawn later over a text is a shape like any other (z-order)
  const strokeText = P.strokeText;
  P.strokeText = function recordedStrokeText(t, x, y, ...rest) {
    const s = String(t);
    if (T.rec && live(this) && s.trim()) {
      const p = strokePad(this); const b = textBox(this, s, x, y);
      T.ops.push({ seq: ++T.seq, cid: canvasId(this), kind: 'strokeText', s, style: norm(this.strokeStyle), l: b.l - p, r: b.r + p, top: b.top - p, bot: b.bot + p });
    }
    return strokeText.call(this, t, x, y, ...rest);
  };

  const rRAF = window.requestAnimationFrame.bind(window);
  const rCAF = window.cancelAnimationFrame.bind(window);
  const run = (id, cb) => { T.real.set(id, rRAF((ts) => { T.real.delete(id); T.lastT = ts; cb(ts); })); };
  window.requestAnimationFrame = (cb) => { const id = ++T.ids; if (T.frozen) T.queue.push({ id, cb }); else run(id, cb); return id; };
  window.cancelAnimationFrame = (id) => {
    if (T.real.has(id)) { rCAF(T.real.get(id)); T.real.delete(id); }
    T.queue = T.queue.filter((q) => q.id !== id);
  };
  // the target canvas is the one that drew the measured text (another canvas may come first in the DOM)
  T.canvasEl = (cid) => [...document.querySelectorAll('canvas')].find((c) => c.isConnected && (cid == null || c.__tcId === cid)) || null;
  // a recorded step replaces the recording; plain steps (hidden / again) leave it as it is
  T.step = (rec) => {
    const q = T.queue; T.queue = []; T.rec = !!rec;
    if (rec) { T.ops = []; T.masks = new Map(); }
    try { for (const { cb } of q) cb(T.lastT); } finally { T.rec = false; }
    return q.length;
  };
  T.unfreeze = () => { T.frozen = false; const q = T.queue; T.queue = []; for (const { id, cb } of q) run(id, cb); };
}

// Every test runs in its own page: watch for Vite reloads / hot updates while it runs.
async function boot(page, size) {
  if (size) {
    const [width, height] = size.split('x').map(Number);
    await page.setViewportSize({ width, height });
  }
  const nav = { hmr: [], loads: 0 };
  page.on('console', (m) => { if (/\[vite\] (hot updated|page reload)/.test(m.text())) nav.hmr.push(m.text()); });
  page.on('load', () => { nav.loads += 1; }); // one document load per test; a Vite full reload adds one
  page.__tcNav = nav;
  await page.addInitScript(instrument);
}
test.afterEach(async ({ page }) => {
  if (page.__tcNav) expect(page.__tcNav, 'no Vite reload or hot update during the test').toEqual({ hmr: [], loads: 1 });
});

async function waitForProbe(page, text, { freezeThere = false } = {}) {
  await page.evaluate(([s, f]) => { window.__tc.probe = s; window.__tc.probeSeen = false; window.__tc.freezeOnProbe = f; }, [text, freezeThere]);
  // timer polling: with freezeThere the RAF loop is held from that frame on
  await page.waitForFunction(() => window.__tc.probeSeen, null, { timeout: 15_000, polling: 50 });
}

async function freeze(page) {
  await page.evaluate(() => { window.__tc.frozen = true; });
  // the frame already requested runs once more, then the loop's next request is held.
  // Poll on a timer: Playwright's default polling uses requestAnimationFrame, which is now held.
  await page.waitForFunction(() => window.__tc.queue.length > 0 && window.__tc.real.size === 0, null, { timeout: 5_000, polling: 50 });
}
const unfreeze = (page) => page.evaluate(() => window.__tc.unfreeze());

// Visible controls (whole painted rectangle), the target canvas rectangle and the padding boxes of
// the canvas's clipping ancestors, in CSS px. `cid`: the canvas that drew the measured text.
async function domContext(page, cid = null) {
  return page.evaluate((id) => {
    const visible = (e) => {
      const st = getComputedStyle(e); const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0;
    };
    const px = (s) => (s.match(/-?[\d.]+px/g) || []).map((n) => parseFloat(n));
    const painted = (e, b) => {
      const st = getComputedStyle(e); let l = 0; let r = 0; let t = 0; let d = 0;
      if (st.boxShadow && st.boxShadow !== 'none') {
        for (const sh of st.boxShadow.split(/,(?![^(]*\))/)) {
          if (/inset/.test(sh)) continue;
          const [ox = 0, oy = 0, blur = 0, spread = 0] = px(sh);
          l = Math.max(l, -ox + blur + spread); r = Math.max(r, ox + blur + spread);
          t = Math.max(t, -oy + blur + spread); d = Math.max(d, oy + blur + spread);
        }
      }
      if (st.outlineStyle !== 'none') {
        const o = parseFloat(st.outlineWidth) + parseFloat(st.outlineOffset);
        l = Math.max(l, o); r = Math.max(r, o); t = Math.max(t, o); d = Math.max(d, o);
      }
      return { l: b.left - l, r: b.right + r, top: b.top - t, bot: b.bottom + d };
    };
    const controls = [...document.querySelectorAll('button, [role="button"], a[href], input, select, textarea, summary, [data-touch-control]')]
      .filter(visible)
      .map((e) => ({ ...painted(e, e.getBoundingClientRect()), name: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30) }));
    const cv = window.__tc ? window.__tc.canvasEl(id) : [...document.querySelectorAll('canvas')].find((c) => c.isConnected);
    const r = cv ? cv.getBoundingClientRect() : null;
    const clips = [];
    for (let el = cv && cv.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      const st = getComputedStyle(el);
      if (st.overflowX !== 'visible' || st.overflowY !== 'visible' || /paint|strict|content/.test(st.contain)) {
        const b = el.getBoundingClientRect();
        clips.push({ tag: el.tagName.toLowerCase(), l: b.left + el.clientLeft, top: b.top + el.clientTop, r: b.left + el.clientLeft + el.clientWidth, bot: b.top + el.clientTop + el.clientHeight });
      }
    }
    // the pixel proof assumes 1 CSS px = 1 device px and no scaling transform around the target
    const scaled = [];
    for (let el = cv; el && el !== document.documentElement.parentNode; el = el.parentElement) {
      const st = getComputedStyle(el); const m = /^matrix\(([^)]*)\)$/.exec(st.transform);
      const linear = m ? m[1].split(',').slice(0, 4).map(Number) : [1, 0, 0, 1];
      if (st.transform !== 'none' && !(linear[0] === 1 && linear[1] === 0 && linear[2] === 0 && linear[3] === 1)) scaled.push(el.tagName.toLowerCase());
      else if ((st.scale && st.scale !== 'none') || (st.rotate && st.rotate !== 'none') || (st.zoom && st.zoom !== '1')) scaled.push(el.tagName.toLowerCase());
    }
    return {
      dpr: devicePixelRatio, scaled,
      controls, vw: innerWidth, vh: innerHeight, clips,
      // snap*: the canvas as painted. Chrome rounds its edges to whole pixels and scales the bitmap
      // into that box with nearest-neighbour sampling (image-rendering: pixelated), so a 751-row
      // bitmap in a 752-row box shows one row twice (measured: exact match at all five sizes)
      canvas: cv ? {
        w: cv.width, h: cv.height, l: r.left, top: r.top, r: r.right, bot: r.bottom, sx: r.width / cv.width, sy: r.height / cv.height,
        snapL: Math.round(r.left), snapT: Math.round(r.top), snapW: Math.round(r.right) - Math.round(r.left), snapH: Math.round(r.bottom) - Math.round(r.top),
      } : null,
    };
  }, cid);
}
const toCss = (b, c) => ({ l: c.l + b.l * c.sx, r: c.l + b.r * c.sx, top: c.top + b.top * c.sy, bot: c.top + b.bot * c.sy });

// Anything that paints, stacked above the target: 5 points per glyph plus every 1 px row through the
// glyph's centre, so a thin stripe cannot fall between samples. Hit testing is forced on for every
// element (inline !important, which also beats an inline `pointer-events: none !important`) and for
// every ::before / ::after (a selector heavy enough to beat any author rule), then put back exactly.
async function stackedAbove(page, glyphs, target) {
  return page.evaluate(({ gs, tgt }) => {
    const heavy = ':not(#__tc1):not(#__tc2):not(#__tc3):not(#__tc4):not(#__tc5):not(#__tc6)';
    const style = document.createElement('style');
    style.textContent = `*${heavy}::before,*${heavy}::after{pointer-events:auto!important}`;
    document.head.appendChild(style);
    const saved = [...document.querySelectorAll('*')].map((el) => [el, el.style.getPropertyValue('pointer-events'), el.style.getPropertyPriority('pointer-events'), el.hasAttribute('style')]);
    for (const [el] of saved) el.style.setProperty('pointer-events', 'auto', 'important');
    const target = tgt.kind === 'canvas' ? window.__tc.canvasEl(tgt.cid) : [...document.querySelectorAll('p')].find((e) => e.textContent === tgt.text);
    const isTarget = (el) => el === target || (tgt.kind === 'p' && target && target.contains(el));
    const alpha = (c) => (c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c) ? 0 : 1);
    const boxPaints = (st) => {
      const border = ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(st[`border${s}Width`]) > 0 && st[`border${s}Style`] !== 'none');
      return alpha(st.backgroundColor) > 0 || st.backgroundImage !== 'none' || border || st.boxShadow !== 'none'
        || (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0)
        || (st.backdropFilter && st.backdropFilter !== 'none'); // it changes whatever is behind it
    };
    const paints = (el) => {
      const st = getComputedStyle(el);
      if (['IMG', 'CANVAS', 'SVG', 'VIDEO', 'INPUT', 'TEXTAREA', 'SELECT', 'IFRAME'].includes(el.tagName.toUpperCase())) return true;
      if (typeof SVGGraphicsElement !== 'undefined' && el instanceof SVGGraphicsElement) return true;
      if (Number(st.opacity) === 0 || st.visibility === 'hidden') return false;
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());
      // a hit on a pseudo-element reports its element: count the pseudo's own painting too
      const pseudo = ['::before', '::after'].some((p) => {
        const ps = getComputedStyle(el, p);
        if (['none', 'normal'].includes(ps.content)) return false;
        return boxPaints(ps) || !['""', "''"].includes(ps.content); // text, url(), attr(), counter()
      });
      return boxPaints(st) || ownText || pseudo;
    };
    const out = [];
    try {
      for (const g of gs) {
        const w = g.r - g.l; const h = g.bot - g.top;
        const pts = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]].map(([fx, fy]) => [g.l + w * fx, g.top + h * fy]);
        for (let y = Math.floor(g.top) + 0.5; y < g.bot; y += 1) if (y > g.top) pts.push([g.l + w / 2, y]);
        for (const [x, y] of pts) {
          for (const el of document.elementsFromPoint(x, y)) {
            if (isTarget(el)) break;
            if (paints(el)) { out.push(`stack: glyph «${g.ch}» is under <${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? ` ${el.getAttribute('aria-label')}` : ''}>`); break; }
          }
        }
      }
    } finally {
      for (const [el, value, priority, hadStyle] of saved) {
        if (value) el.style.setProperty('pointer-events', value, priority); else el.style.removeProperty('pointer-events');
        if (!hadStyle) el.removeAttribute('style');
      }
      style.remove();
    }
    return [...new Set(out)];
  }, { gs: glyphs, tgt: target });
}

function clipFor(boxes, vw, vh) {
  const l = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.l)) - 3));
  const top = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.top)) - 3));
  const r = Math.min(vw, Math.ceil(Math.max(...boxes.map((b) => b.r)) + 3));
  const bot = Math.min(vh, Math.ceil(Math.max(...boxes.map((b) => b.bot)) + 3));
  return { x: l, y: top, width: Math.max(1, r - l), height: Math.max(1, bot - top) };
}

// In the page: for each item (a glyph group with its reference ink pixels), how many of those pixels
// changed between `shown` and `hidden`, and how many differ between `shown` and `again` (must be 0).
// No tolerance for position: every reference pixel is compared on exactly the screen pixels that
// show it. Canvas: the painted box is the canvas rectangle with its edges rounded to whole pixels,
// sampled nearest-neighbour, so canvas column i is shown by the screen columns X with
// floor((X + 0.5 - L) · w / W) = i (one column, two where a column is doubled, none where one is
// dropped; a dropped pixel cannot be seen or covered and is left out). DOM: the reference is a
// screenshot of the same grid, so one pixel each. A reference pixel is visible when every screen
// pixel that shows it changed by at least RELATIVE of the reference change. `drawn` counts the
// pixels the real draw call painted as meant (canvas), so a clip or a faint alpha shows up there.
// Pixel record (flat, 9 numbers): centre x (CSS, for the glyph it belongs to), x0, x1, y0, y1 (the
// screen pixels [x0, x1) × [y0, y1) that show it), reference difference, real difference, and its
// grid position (canvas pixel or screen pixel) for the pieces of a glyph: every 8-connected piece of
// a glyph's ink (an accent, a dot, a cedilla) must be at least 90 % visible on its own.
async function inkVisibility(page, shots, clip, source) {
  return page.evaluate(async ({ shots: sh, clip: cl, source: src, rel }) => {
    const load = async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const oc = new OffscreenCanvas(bmp.width, bmp.height); const cx = oc.getContext('2d');
      cx.drawImage(bmp, 0, 0); return { d: cx.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height };
    };
    const [S, H, A] = await Promise.all([load(sh.shown), load(sh.hidden), load(sh.again)]);
    const diff = (X, Y, x, y) => { const i = (y * S.w + x) * 4; return Math.max(Math.abs(X.d[i] - Y.d[i]), Math.abs(X.d[i + 1] - Y.d[i + 1]), Math.abs(X.d[i + 2] - Y.d[i + 2])); };
    const sx = S.w / cl.width; const sy = S.h / cl.height;
    let items = src.items;
    let states = [];
    if (src.kind === 'canvas') {
      const T = window.__tc; const c = src.canvas;
      const fx = c.snapW / c.w; const fy = c.snapH / c.h;
      const from = (i, L, f) => Math.ceil(L + i * f - 0.5);
      items = src.ops.map((op) => {
        const m = T.masks.get(op.seq) || { px: [] };
        const px = [];
        for (let i = 0; i < m.px.length; i += 4) {
          const x = m.px[i]; const y = m.px[i + 1];
          px.push(c.snapL + (x + 0.5) * fx, from(x, c.snapL, fx), from(x + 1, c.snapL, fx), from(y, c.snapT, fy), from(y + 1, c.snapT, fy), m.px[i + 2], m.px[i + 3], x, y);
        }
        const glyphs = op.kind === 'image' ? [{ ch: '[logo]', l: -Infinity, r: Infinity }] : op.chars.map((g) => ({ ch: g.ch, l: c.l + g.l * c.sx, r: c.l + g.r * c.sx }));
        return { name: op.kind === 'image' ? '[logo]' : op.s, glyphs, px };
      });
      states = src.ops.map((op) => (T.masks.get(op.seq) || {}).state || null);
    }
    return items.map((it, n) => {
      // each ink pixel belongs to the glyph whose advance box centre is nearest (at very small
      // sizes a glyph's ink can round into its neighbour's box, e.g. a 1 px full stop)
      const per = it.glyphs.map((g) => ({ ch: g.ch, total: 0, visible: 0, drawn: 0, nondet: 0, dropped: 0, ratio: 0, cells: new Map() }));
      for (let i = 0; i < it.px.length; i += 9) {
        const [cx, x0, x1, y0, y1, ref, act, gx, gy] = it.px.slice(i, i + 9);
        let gi = 0;
        if (it.glyphs.length > 1) {
          gi = it.glyphs.reduce((best, g, k) => (Math.abs(cx - (g.l + g.r) / 2) < Math.abs(cx - (it.glyphs[best].l + it.glyphs[best].r) / 2) ? k : best), 0);
        }
        const g = per[gi];
        if (x1 <= x0 || y1 <= y0) { g.dropped += 1; continue; }
        g.total += 1;
        if (act >= 0.9 * ref - 1) g.drawn += 1;
        let seen = true; let nondet = false; let worst = Infinity;
        for (let Y = y0; Y < y1; Y += 1) for (let X = x0; X < x1; X += 1) {
          const ix = Math.floor((X - cl.x) * sx); const iy = Math.floor((Y - cl.y) * sy);
          if (ix < 0 || iy < 0 || ix >= S.w || iy >= S.h) { seen = false; worst = 0; continue; } // off screen
          const d = diff(S, H, ix, iy);
          worst = Math.min(worst, d);
          if (d < Math.max(4, rel * ref)) seen = false;
          if (diff(S, A, ix, iy) > 0) nondet = true;
        }
        if (seen) g.visible += 1;
        if (nondet) g.nondet += 1;
        g.ratio += worst / ref;
        g.cells.set(`${gx},${gy}`, seen);
      }
      // the pieces of each glyph: 8-connected groups of its reference pixels
      const pieces = (cells) => {
        const out = []; const done = new Set();
        for (const start of cells.keys()) {
          if (done.has(start)) continue;
          let total = 0; let visible = 0; const queue = [start]; done.add(start);
          while (queue.length) {
            const k = queue.pop(); total += 1; if (cells.get(k)) visible += 1;
            const [x, y] = k.split(',').map(Number);
            for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
              const nk = `${x + dx},${y + dy}`;
              if (cells.has(nk) && !done.has(nk)) { done.add(nk); queue.push(nk); }
            }
          }
          out.push({ total, visible });
        }
        return out;
      };
      return {
        name: it.name, state: states[n] || null,
        per: per.map(({ cells, ...g }) => ({ ...g, meanRatio: g.total ? g.ratio / g.total : 0, pieces: pieces(cells) })),
      };
    });
  }, { shots: { shown: shots.shown.toString('base64'), hidden: shots.hidden.toString('base64'), again: shots.again.toString('base64') }, clip, source, rel: RELATIVE });
}

function pixelViolations(results) {
  const v = [];
  for (const { name, per, state } of results) {
    if (state && (state.alpha < 1 || state.comp !== 'source-over' || state.filter !== 'none')) {
      v.push(`style: «${name}» drawn with globalAlpha ${state.alpha}, ${state.comp}, filter ${state.filter}`);
    }
    if (state && !['colour', 'image'].includes(state.paint)) v.push(`style: «${name}» is filled with a ${state.paint}, which the pixel proof cannot grade`);
    if (state && state.fillAlpha < FAINT) v.push(`style: «${name}» is drawn in a colour at alpha ${state.fillAlpha}`);
    per.forEach((g, i) => {
      if (g.total === 0) v.push(`pixels: glyph «${g.ch}» #${i} of «${name}» painted no ink`);
      else {
        if (g.drawn / g.total < VISIBLE_SHARE) v.push(`draw: glyph «${g.ch}» #${i} of «${name}» drew only ${Math.round((100 * g.drawn) / g.total)}% of its ink (clip, alpha or compositing)`);
        if (g.visible / g.total < VISIBLE_SHARE) v.push(`pixels: glyph «${g.ch}» #${i} of «${name}» only ${Math.round((100 * g.visible) / g.total)}% visible`);
        // a small piece (an accent is a few % of its letter) must be visible on its own
        const worst = (g.pieces || []).reduce((w, q) => (!w || q.visible / q.total < w.visible / w.total ? q : w), null);
        if (worst && worst.visible / worst.total < VISIBLE_SHARE) v.push(`pixels: a piece of glyph «${g.ch}» #${i} of «${name}» (${worst.total} px) only ${Math.round((100 * worst.visible) / worst.total)}% visible`);
      }
      if (g.nondet > 0) v.push(`pixels: the frame is not deterministic at «${g.ch}» #${i} of «${name}»`);
    });
  }
  return v;
}

// The tightest margins of a pixel proof, for the metrics (how close each run came to a threshold).
function pixelMargins(results) {
  const all = results.flatMap((r) => r.per).filter((g) => g.total > 0);
  if (!all.length) return null;
  const round = (n) => Math.round(n * 1000) / 1000;
  return {
    glyphs: all.length,
    minVisibleShare: round(Math.min(...all.map((g) => g.visible / g.total))),
    minDrawnShare: round(Math.min(...all.map((g) => g.drawn / g.total))),
    minPieceVisibleShare: round(Math.min(...all.flatMap((g) => (g.pieces || []).map((q) => q.visible / q.total)))),
    minMeanScreenToInk: round(Math.min(...all.map((g) => g.meanRatio))),
    droppedPixels: results.flatMap((r) => r.per).reduce((n, g) => n + g.dropped, 0),
  };
}

// The pixel proof maps reference pixels 1:1 (DOM) or through the canvas's own rounded box (canvas):
// it needs devicePixelRatio 1 and no scaling transform / zoom around the target. Anything else is
// reported as a setup problem instead of being measured wrongly.
function setupViolations(dpr, scaled, what) {
  const v = [];
  if (dpr !== 1) v.push(`setup: devicePixelRatio ${dpr} (the pixel proof assumes 1)`);
  if (scaled && scaled.length) v.push(`setup: ${scaled.map((t) => `<${t}>`).join(', ')} around ${what} scale or rotate it (the pixel proof assumes none)`);
  return v;
}

function domViolations(boxes, ctx, label) {
  const v = [];
  for (const b of boxes) {
    if (b.l < -EPS || b.top < -EPS || b.r > ctx.vw + EPS || b.bot > ctx.vh + EPS) v.push(`viewport: «${b[label]}»`);
    for (const k of ctx.controls) if (b.l < k.r && k.l < b.r && b.top < k.bot && k.top < b.bot) v.push(`dom: «${b[label]}» under «${k.name}»`);
  }
  return [...new Set(v)];
}

async function saveCrop(page, shot, boxes, ctx) {
  if (!shot) return;
  await page.screenshot({ path: shot });
  const clip = clipFor(boxes.map((b) => ({ l: b.l - 40, r: b.r + 40, top: b.top - 24, bot: b.bot + 24 })), ctx.vw, ctx.vh);
  await page.screenshot({ path: shot.replace(/\.png$/, '_crop.png'), clip });
}

// One canvas text, end to end. `pick(ops)` returns { lines, container, images? } from the frame.
async function proveCanvasText(page, { expected, pick, shot, whileFrozen }) {
  await page.evaluate(() => document.fonts.ready);
  await freeze(page);
  try {
    const frozen = whileFrozen ? await whileFrozen() : null;
    const frame = await page.evaluate(() => { window.__tc.step(true); return window.__tc.ops; });
    const { lines, container, images = [] } = pick(frame);
    const ctx = await domContext(page, lines[0]?.cid ?? null);
    const v = [];
    if (!ctx.canvas) return { v: ['canvas-missing'], metrics: {} };
    if (new Set([...lines, ...images].map((o) => o.cid)).size > 1) v.push('canvas: the measured items come from more than one canvas');
    v.push(...setupViolations(ctx.dpr, ctx.scaled, 'the canvas'));
    const c = ctx.canvas;
    const canvasBox = { l: 0, r: c.w, top: 0, bot: c.h };
    if (!lines.length) v.push('text: nothing drawn');
    const joined = lines.map((x) => x.s.trim()).join(' ');
    if (joined !== expected) v.push(`text: «${joined}» ≠ «${expected}»`);
    if (!container) v.push('container: not drawn');
    else if (!inside(container, canvasBox)) v.push('container: outside the canvas');
    const items = [...lines, ...images];
    for (const it of items) {
      const name = it.kind === 'image' ? '[logo]' : it.s;
      if (container && !inside(it, container)) v.push(`container: «${name}» leaves its container`);
      if (!inside(it, canvasBox)) v.push(`canvas: «${name}» leaves the canvas`);
      // z-order: anything drawn after it in the same frame that reaches it
      for (const o of frame) {
        if (o.seq > it.seq && o.cid === it.cid && !((o.kind === 'text' || o.kind === 'strokeText') && o.s === it.s) && hit(it, o)) v.push(`zorder: «${name}» under a later ${o.kind}${o.style ? ` ${o.style}` : ''}${o.s ? ` «${o.s}»` : ''}`);
      }
      // texts drawn before it, in the same layer (or under a see-through container)
      for (const o of frame) {
        const sameLayer = !container || o.seq > container.seq || alphaOf(container.style) < 1;
        if (o.kind === 'text' && o.seq < it.seq && o.s !== it.s && sameLayer && hit(it, o)) v.push(`overlap: «${name}» × «${o.s}»`);
      }
    }
    for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) {
      if (hit(items[i], items[j])) v.push(`overlap: «${items[i].s || '[logo]'}» × «${items[j].s || '[logo]'}»`);
    }
    const cssCanvas = { l: c.l, r: c.r, top: c.top, bot: c.bot };
    if (!inside(cssCanvas, { l: 0, r: ctx.vw, top: 0, bot: ctx.vh })) v.push('viewport: the canvas leaves the viewport');
    const cssItems = items.map((it) => ({ ...toCss(it, c), s: it.kind === 'image' ? '[logo]' : it.s }));
    v.push(...domViolations(cssItems, ctx, 's'));
    // the canvas's own clipping ancestors (overflow / contain); a clip-path or mask on them shows up
    // in the pixel proof, because the reference ink is taken from the canvas itself
    for (const it of cssItems) for (const k of ctx.clips) if (!inside(it, k)) v.push(`clip: «${it.s}» is cut by <${k.tag}> around the canvas`);
    const glyphs = lines.flatMap((line) => line.chars.map((g) => ({ ch: g.ch, ...toCss({ l: g.l, r: g.r, top: line.top, bot: line.bot }, c) })));
    const logoBoxes = images.map((im) => ({ ch: '[logo]', ...toCss(im, c) }));
    v.push(...await stackedAbove(page, [...glyphs, ...logoBoxes], { kind: 'canvas', cid: lines[0]?.cid ?? null }));
    const fontsOk = await page.evaluate((ls) => document.fonts.status === 'loaded' && ls.every((l) => document.fonts.check(l.font, l.s)), lines.map((l) => ({ font: l.font, s: l.s })));
    if (!fontsOk) v.push('fonts: not loaded for every line');
    let margins = null;
    if (items.length) {
      const clip = clipFor(cssItems, ctx.vw, ctx.vh);
      const shown = await page.screenshot({ clip });
      await saveCrop(page, shot, cssItems, ctx);
      await page.evaluate(({ ss, logo }) => { window.__tc.skip = new Set(ss); window.__tc.skipLogo = logo; window.__tc.step(false); }, { ss: lines.map((l) => l.s), logo: images.length > 0 });
      const hidden = await page.screenshot({ clip });
      // redraw WITH the text (plain step: the masks of the measured frame stay)
      await page.evaluate(() => { window.__tc.skip = new Set(); window.__tc.skipLogo = false; window.__tc.step(false); });
      const again = await page.screenshot({ clip });
      const vis = await inkVisibility(page, { shown, hidden, again }, clip, {
        kind: 'canvas', canvas: c, ops: items.map((it) => ({ seq: it.seq, kind: it.kind, s: it.s, chars: it.chars || [] })),
      });
      v.push(...pixelViolations(vis));
      margins = pixelMargins(vis);
    }
    return {
      v: [...new Set(v)], frame, lines, ctx, frozen,
      metrics: { mode: MODE, lines: lines.length, glyphs: glyphs.length, controls: ctx.controls.length, cssLines: cssItems.map((l) => [l.l, l.top, l.r, l.bot].map((n) => Math.round(n * 10) / 10)), pixels: margins },
    };
  } finally {
    await unfreeze(page);
  }
}

// One DOM paragraph, end to end.
async function proveDomParagraph(page, { expected, shot }) {
  await page.evaluate(() => document.fonts.ready);
  // finite animations only (the slide-up of the card); decorative loops never finish
  await page.waitForFunction(() => document.getAnimations()
    .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    .every((a) => a.playState !== 'running'), null, { timeout: 10_000 });
  const facts = await page.evaluate((text) => {
    const p = [...document.querySelectorAll('p')].find((e) => e.textContent === text);
    if (!p) return null;
    const node = [...p.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.data === text);
    const range = document.createRange();
    const glyphs = []; let offset = 0;
    for (const ch of text) {
      if (ch.trim() && node) {
        range.setStart(node, offset); range.setEnd(node, offset + ch.length);
        const r = range.getBoundingClientRect(); glyphs.push({ ch, l: r.left, r: r.right, top: r.top, bot: r.bottom });
      }
      offset += ch.length;
    }
    let lineRects = [];
    if (node) { range.selectNodeContents(node); lineRects = [...range.getClientRects()].map((b) => ({ l: b.left, r: b.right, top: b.top, bot: b.bottom, s: text })); }
    // every clipping ancestor: the glyphs must sit inside its padding box
    const clips = [];
    for (let el = p; el && el !== document.documentElement; el = el.parentElement) {
      const st = getComputedStyle(el);
      if (st.overflowX !== 'visible' || st.overflowY !== 'visible' || st.clipPath !== 'none' || /paint|strict|content/.test(st.contain)) {
        const b = el.getBoundingClientRect();
        clips.push({ tag: el.tagName.toLowerCase(), l: b.left + el.clientLeft, top: b.top + el.clientTop, r: b.left + el.clientLeft + el.clientWidth, bot: b.top + el.clientTop + el.clientHeight });
      }
    }
    const scaled = [];
    for (let el = p; el; el = el.parentElement) {
      const st = getComputedStyle(el); const m = /^matrix\(([^)]*)\)$/.exec(st.transform);
      const linear = m ? m[1].split(',').slice(0, 4).map(Number) : [1, 0, 0, 1];
      if (st.transform !== 'none' && !(linear[0] === 1 && linear[1] === 0 && linear[2] === 0 && linear[3] === 1)) scaled.push(el.tagName.toLowerCase());
      else if ((st.scale && st.scale !== 'none') || (st.rotate && st.rotate !== 'none') || (st.zoom && st.zoom !== '1')) scaled.push(el.tagName.toLowerCase());
    }
    const card = p.parentElement.getBoundingClientRect();
    const alphaOfColour = (c) => { const m = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(c); return m ? Number(m[1]) : (c === 'transparent' ? 0 : 1); };
    const ps = getComputedStyle(p);
    const textFill = { colour: alphaOfColour(ps.color), fill: alphaOfColour(ps.webkitTextFillColor || ps.color), clipText: /text/.test(ps.backgroundClip || '') || /text/.test(ps.webkitBackgroundClip || '') };
    return {
      textFill, scaled, glyphs, lineRects, clips, card: { l: card.left, r: card.right, top: card.top, bot: card.bottom },
      lines: new Set(glyphs.map((g) => Math.round(g.top))).size,
      font: getComputedStyle(p).font, fontsOk: document.fonts.status === 'loaded' && document.fonts.check(getComputedStyle(p).font, text),
      hasTextNode: !!node,
    };
  }, expected);
  if (!facts) return { v: [`text: no paragraph reads «${expected}»`], metrics: {} };
  const ctx = await domContext(page);
  const v = [];
  if (!facts.hasTextNode) v.push('text: the paragraph is not one text node');
  v.push(...setupViolations(ctx.dpr, facts.scaled, 'the paragraph'));
  if (Math.min(facts.textFill.colour, facts.textFill.fill) < FAINT) v.push(`style: the paragraph is drawn in a colour at alpha ${Math.min(facts.textFill.colour, facts.textFill.fill)}`);
  if (facts.textFill.clipText) v.push('style: the paragraph is painted with background-clip: text, which the pixel proof cannot grade');
  if (!facts.fontsOk) v.push('fonts: not loaded');
  for (const g of facts.glyphs) {
    if (!inside(g, facts.card)) v.push(`card: glyph «${g.ch}» leaves the card`);
    for (const k of facts.clips) if (!inside(g, k)) v.push(`clip: glyph «${g.ch}» is cut by <${k.tag}>`);
  }
  v.push(...domViolations(facts.lineRects, ctx, 's'));
  v.push(...domViolations(facts.glyphs.map((g) => ({ ...g, s: g.ch })), ctx, 's').filter((x) => x.startsWith('viewport')));
  v.push(...await stackedAbove(page, facts.glyphs, { kind: 'p', text: expected }));
  const clip = clipFor(facts.glyphs, ctx.vw, ctx.vh);
  const setText = (mode) => page.evaluate(({ text, m }) => {
    const p = [...document.querySelectorAll('p')].find((e) => e.textContent === text);
    // React sets the colour inline: keep it and put back exactly the same value (and priority)
    const PROPS = ['color', '-webkit-text-fill-color'];
    if (m === 'hide') {
      window.__tcSavedColour = { had: p.hasAttribute('style'), props: PROPS.map((k) => [k, p.style.getPropertyValue(k), p.style.getPropertyPriority(k)]) };
      for (const k of PROPS) p.style.setProperty(k, 'transparent', 'important');
    }
    if (m === 'show') {
      for (const [k, value, priority] of window.__tcSavedColour.props) { if (value) p.style.setProperty(k, value, priority); else p.style.removeProperty(k); }
      if (!window.__tcSavedColour.had) p.removeAttribute('style');
      delete window.__tcSavedColour;
    }
    // isolate: only the paragraph and its ancestors paint, and with none of the effects that could
    // hide part of the text, on the whole chain up to <html> (opacity, filter, mask, clip-path,
    // outline, ::before/::after kept in the flow but invisible): the reference is the paragraph's
    // full ink, so whatever such an effect hides on screen counts as hidden
    if (m === 'isolate' || m === 'unisolate') {
      let st = document.getElementById('__tc_isolate');
      if (m === 'isolate') {
        const chain = 'html,body,.__tc_keep';
        st = document.createElement('style'); st.id = '__tc_isolate';
        st.textContent = 'body *:not(.__tc_keep){visibility:hidden!important}.__tc_keep{visibility:visible!important}'
          + `${chain}{opacity:1!important;filter:none!important;mask:none!important;-webkit-mask:none!important;clip-path:none!important;`
          + 'backdrop-filter:none!important;mix-blend-mode:normal!important;outline:none!important}'
          + 'html::before,html::after,body::before,body::after,.__tc_keep::before,.__tc_keep::after{visibility:hidden!important}';
        document.head.appendChild(st);
        window.__tcIsolated = [];
        for (let el = p; el && el !== document.body; el = el.parentElement) { window.__tcIsolated.push([el, el.hasAttribute('class')]); el.classList.add('__tc_keep'); }
      } else {
        st?.remove();
        for (const [el, hadClass] of window.__tcIsolated || []) {
          el.classList.remove('__tc_keep');
          if (!hadClass && !el.getAttribute('class')) el.removeAttribute('class');
        }
        delete window.__tcIsolated;
      }
    }
  }, { text: expected, m: mode });
  const shown = await page.screenshot({ clip });
  await saveCrop(page, shot, facts.lineRects, ctx);
  await setText('hide');
  const hidden = await page.screenshot({ clip });
  await setText('show');
  const again = await page.screenshot({ clip });
  await setText('isolate');
  const refShown = await page.screenshot({ clip });
  await setText('hide');
  const refHidden = await page.screenshot({ clip });
  await setText('show');
  await setText('unisolate');
  // the paragraph's own ink (rendered alone) → per-glyph pixel lists
  const ref = await page.evaluate(async ({ a, b, cl, gs, ink }) => {
    const load = async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const oc = new OffscreenCanvas(bmp.width, bmp.height); const cx = oc.getContext('2d');
      cx.drawImage(bmp, 0, 0); return { d: cx.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height };
    };
    const [A, B] = await Promise.all([load(a), load(b)]);
    const px = [];
    for (let y = 0; y < A.h; y += 1) for (let x = 0; x < A.w; x += 1) {
      const i = (y * A.w + x) * 4;
      const d = Math.max(Math.abs(A.d[i] - B.d[i]), Math.abs(A.d[i + 1] - B.d[i + 1]), Math.abs(A.d[i + 2] - B.d[i + 2]));
      if (d >= ink) px.push(cl.x + (x + 0.5) * (cl.width / A.w), cl.y + (y + 0.5) * (cl.height / A.h), d);
    }
    return px;
  }, { a: refShown.toString('base64'), b: refHidden.toString('base64'), cl: clip, gs: facts.glyphs, ink: MASK_MIN });
  // a reference pixel belongs to the glyph whose box holds it (nearest box otherwise); in the DOM
  // there is no separate draw call, so the "real" difference is the reference itself
  const glyphPx = facts.glyphs.map(() => []);
  for (let i = 0; i < ref.length; i += 3) {
    const x = ref[i]; const y = ref[i + 1];
    let gi = facts.glyphs.findIndex((g) => x >= g.l && x < g.r && y >= g.top && y < g.bot);
    if (gi < 0) gi = facts.glyphs.reduce((best, g, k) => ((Math.hypot(x - (g.l + g.r) / 2, y - (g.top + g.bot) / 2) < Math.hypot(x - (facts.glyphs[best].l + facts.glyphs[best].r) / 2, y - (facts.glyphs[best].top + facts.glyphs[best].bot) / 2)) ? k : best), 0);
    glyphPx[gi].push(x, Math.floor(x), Math.floor(x) + 1, Math.floor(y), Math.floor(y) + 1, ref[i + 2], ref[i + 2], Math.floor(x), Math.floor(y));
  }
  const items = facts.glyphs.map((g, i) => ({ name: expected, glyphs: [{ ch: g.ch, l: -Infinity, r: Infinity }], px: glyphPx[i] }));
  const vis = await inkVisibility(page, { shown, hidden, again }, clip, { kind: 'dom', items });
  // one list of glyphs for the paragraph, so each message carries the glyph's own index
  const paragraph = [{ name: expected, per: vis.map((r) => r.per[0]) }];
  v.push(...pixelViolations(paragraph));
  return {
    v: [...new Set(v)], facts, ctx,
    metrics: { mode: MODE, lines: facts.lines, glyphs: facts.glyphs.length, controls: ctx.controls.length, font: facts.font, lineRects: facts.lineRects.map((l) => [l.l, l.top, l.r, l.bot].map((n) => Math.round(n * 10) / 10)), pixels: pixelMargins(paragraph) },
  };
}

// ── Screens ──────────────────────────────────────────────────────────────────────────────────
const WOOD_MID = '#9a8466'; // WORLD_ART.woodMid, the avatar sign's face
const HUD_BAR = 'rgba(83,63,139,0.6)'; // harbour HUD bar
const PANEL_CREAM = '#fff8e1'; // WORLD_ART.panelCream, the mentor dialog panel
const COACH_CARD = 'rgba(255,248,225,0.95)'; // Meal Planner coach card

const largest = (ops, kind, style, beforeSeq = Infinity) => ops
  .filter((o) => o.kind === kind && o.style === style && o.seq < beforeSeq)
  .sort((a, b) => (b.r - b.l) * (b.bot - b.top) - (a.r - a.l) * (a.bot - a.top))[0] || null;

async function openAvatar(page, lang, size) {
  await boot(page, size);
  await page.goto(`/?testMode=1&lang=${lang}&startScreen=avatar`);
  await page.waitForFunction(() => window.__playfood?.screen() === 'avatar', null, { timeout: 20_000 });
  await waitForProbe(page, expectedValue(lang, 'avatar.controls_look'));
  await page.waitForTimeout(1000); // the iris (0.5 s) is over; the z-order check proves it in the frame
}
function pickAvatar(expected) {
  return (ops) => {
    const lines = ops.filter((o) => o.kind === 'text' && o.s === expected);
    return { lines, container: lines.length ? largest(ops, 'fill', WOOD_MID, lines[0].seq) : null };
  };
}

async function openHarbour(page, lang, size, { blockLogo }) {
  await boot(page, size);
  const logo = { requested: 0, failed: 0, ok: 0 };
  page.on('request', (r) => { if (r.url().includes(LOGO)) logo.requested += 1; });
  page.on('requestfailed', (r) => { if (r.url().includes(LOGO)) logo.failed += 1; });
  page.on('requestfinished', async (r) => { if (r.url().includes(LOGO) && (await r.response())?.status() === 200) logo.ok += 1; });
  if (blockLogo) await page.route(`**/assets/logos/${LOGO}`, (route) => route.abort());
  await page.goto(`/?testMode=1&lang=${lang}`);
  await page.waitForFunction((l) => window.__playfood?.language() === l, lang, { timeout: 20_000 });
  await page.evaluate(() => { const s = window.__playfood.state(); s.setHero('braid'); window.__playfood.goToScreen('menu'); });
  await page.waitForFunction(() => window.__playfood.screen() === 'menu', null, { timeout: 20_000 });
  if (blockLogo) await expect.poll(() => logo.failed, { message: 'the logo request was aborted' }).toBeGreaterThan(0);
  else await expect.poll(() => logo.ok, { message: 'the logo loaded' }).toBeGreaterThan(0);
  await waitForProbe(page, expectedValue(lang, blockLogo ? 'hub.harbor_title' : 'hub.harbor_subtitle'));
  await page.waitForTimeout(1500); // the fade-in (≈0.5 s) is over; the z-order check proves it in the frame
  return logo;
}
function pickHarbour(text, { withLogo = false } = {}) {
  return (ops) => {
    const lines = ops.filter((o) => o.kind === 'text' && o.s === text);
    const images = withLogo ? ops.filter((o) => o.kind === 'image' && o.src.includes(LOGO)) : [];
    return { lines, images, container: largest(ops, 'rect', HUD_BAR, lines[0]?.seq ?? Infinity) };
  };
}

async function openIntro(page, lang, size) {
  await boot(page, size);
  await page.goto(`/?testMode=1&lang=${lang}&startIsland=foodwaste`);
  await page.waitForFunction(() => {
    const s = document.querySelector('canvas')?._stateRef?.current;
    return window.__playfood?.screen() === 'island' && !!s?.mentorDialog && s.irisOpenness >= 1;
  }, null, { timeout: 20_000 });
  await page.waitForTimeout(400);
}
function introExpectation(lang) {
  const L = readLocale(lang);
  const raw = expectedValue(lang, 'island.intro_foodwaste');
  const m = L.missions.foodwaste;
  return {
    text: raw.replace('{{m1}}', m['1']),
    name: L.island.mentor_name_foodwaste,
    cont: `⏎ ${L.island.dialog_continue}`,
  };
}
function pickIntro(exp) {
  return (ops) => {
    const panel = ops.filter((o) => o.kind === 'fill' && o.style === PANEL_CREAM).at(-1) || null;
    const after = ops.filter((o) => o.kind === 'text' && panel && o.seq > panel.seq && o.s !== exp.name && o.s !== exp.cont);
    const counts = {}; after.forEach((o) => { const k = Math.round(o.ax); counts[k] = (counts[k] || 0) + 1; });
    const bodyX = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]);
    return { lines: after.filter((o) => Math.round(o.ax) === bodyX).sort((a, b) => a.ay - b.ay), container: panel };
  };
}

async function teleport(page, col, row) {
  await page.evaluate(([c, r]) => {
    const TS = 32; const p = document.querySelector('canvas')._stateRef.current.player;
    p.col = c; p.row = r; p.pixelX = c * TS; p.pixelY = r * TS; p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 1; // facing UP
  }, [col, row]);
}
// A real Enter, repeated only while it has not registered (a slow frame can miss a 90 ms press).
async function pressUntil(page, cond, what) {
  for (let i = 0; i < 4; i += 1) {
    await pressEnter(page);
    if (await page.waitForFunction(cond, null, { timeout: 1_500 }).then(() => true, () => false)) return;
  }
  throw new Error(`Enter did not register: ${what}`);
}
async function openNudge(page, lang, size) {
  await boot(page, size);
  await bootMission(page, 'foodwaste', 2, lang, '&scenario=0');
  await pressUntil(page, () => !document.querySelector('canvas')._stateRef.current.showMissionIntro, 'close the mission card');
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.irisOpenness >= 1);
  // walk to the chicken crate (debug placement) and pick it up with a real Enter
  const tile = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.market.find((m) => m.id === 'chicken').tile);
  await teleport(page, tile.col, tile.row + 1);
  await page.waitForFunction(() => !!document.querySelector('canvas')._stateRef.current.actionPrompt);
  await pressUntil(page, () => document.querySelector('canvas')._stateRef.current.heldItem?.id === 'chicken', 'pick up the chicken');
  // carry it to the plate and place it with a real Enter: this is what triggers the nudge
  await teleport(page, 9, 8);
  await page.waitForFunction(() => !!document.querySelector('canvas')._stateRef.current.actionPrompt);
  await pressUntil(page, () => !document.querySelector('canvas')._stateRef.current.heldItem, 'place the chicken');
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.chef?.key === 'plant', null, { timeout: 5_000 });
  return Date.now();
}
function pickNudge(chefName) {
  return (ops) => {
    const card = ops.filter((o) => o.kind === 'fill' && o.style === COACH_CARD).at(-1) || null;
    const name = ops.find((o) => o.kind === 'text' && o.s === chefName && card && o.seq > card.seq);
    const lines = name ? ops.filter((o) => o.kind === 'text' && o.seq > name.seq && Math.abs(o.ax - name.ax) < 0.5) : [];
    return { lines, container: card };
  };
}

async function openMealResult(page, lang, size) {
  await boot(page, size);
  await page.goto(`/?testMode=1&lang=${lang}`);
  await page.waitForFunction((l) => window.__playfood?.language() === l, lang, { timeout: 20_000 });
  await page.evaluate((data) => window.__playfood.goToScreen('result', data), MEAL_RESULT);
  await page.waitForFunction(() => window.__playfood.screen() === 'result');
}

const shotPath = (group, lang, size) => {
  if (!SHOTS) return '';
  fs.mkdirSync(`${SHOTS}/${group}`, { recursive: true });
  return `${SHOTS}/${group}/${lang}_${size}.png`;
};
const note = (res, extra = {}) => test.info().annotations.push({ type: 'metrics', description: JSON.stringify({ ...res.metrics, ...extra }) });

// ── The matrix ───────────────────────────────────────────────────────────────────────────────
for (const size of SIZES) {
  for (const lang of LANGS) {
    test(`avatar label ${lang} ${size}`, async ({ page }) => {
      await openAvatar(page, lang, size);
      const expected = expectedValue(lang, 'avatar.controls_look');
      const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected), shot: shotPath('avatar', lang, size) });
      note(res);
      expect(res.v, 'avatar label').toEqual([]);
    });

    test(`harbour with the logo keeps «[logo] Archipelago» ${lang} ${size}`, async ({ page }) => {
      await openHarbour(page, lang, size, { blockLogo: false });
      const title = expectedValue(lang, 'hub.harbor_title');
      const sub = expectedValue(lang, 'hub.harbor_subtitle');
      const res = await proveCanvasText(page, { expected: sub, pick: pickHarbour(sub, { withLogo: true }), shot: shotPath('harbour_logo', lang, size) });
      note(res);
      const logos = res.frame.filter((o) => o.kind === 'image' && o.src.includes(LOGO)).length;
      const titleDrawn = res.frame.some((o) => o.kind === 'text' && o.s === title);
      expect({ violations: res.v, logos, titleDrawn }, 'normal lockup').toEqual({ violations: [], logos: 1, titleDrawn: false });
    });

    test(`harbour fallback title ${lang} ${size}`, async ({ page }) => {
      const logo = await openHarbour(page, lang, size, { blockLogo: true });
      const title = expectedValue(lang, 'hub.harbor_title');
      const res = await proveCanvasText(page, { expected: title, pick: pickHarbour(title), shot: shotPath('harbour_fallback', lang, size) });
      note(res, { logo });
      const logoDrawn = res.frame.some((o) => o.kind === 'image' && o.src.includes(LOGO));
      const lockupDrawn = res.frame.some((o) => o.kind === 'text' && o.s === expectedValue(lang, 'hub.harbor_subtitle'));
      expect({ violations: res.v, logoDrawn, lockupDrawn, logoOk: logo.ok }, 'fallback title').toEqual({ violations: [], logoDrawn: false, lockupDrawn: false, logoOk: 0 });
    });

    test(`Foodwaste intro ${lang} ${size}`, async ({ page }) => {
      await openIntro(page, lang, size);
      const exp = introExpectation(lang);
      expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.mentorDialog.text)).toBe(exp.text);
      const res = await proveCanvasText(page, { expected: exp.text, pick: pickIntro(exp), shot: shotPath('intro', lang, size) });
      note(res);
      expect(res.v, 'intro').toEqual([]);
    });

    test(`Meal Planner nudge ${lang} ${size}`, async ({ page }) => {
      const seenAt = await openNudge(page, lang, size);
      const expected = expectedValue(lang, 'meal_planner.nudge_plant');
      const chef = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.chef);
      expect(chef.msg).toBe(expected);
      const chefName = readLocale(lang).meal_planner.chef_name;
      const res = await proveCanvasText(page, {
        expected, pick: pickNudge(chefName), shot: shotPath('nudge', lang, size),
        // the nudge's own clock and the game clock, read in the frozen frame that is measured
        whileFrozen: () => page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; return { key: s.chef?.key, life: s.chef?.life, time: s.time }; }),
      });
      // The app's lifetime is untouched: after the measurement the nudge runs out on its own. It is
      // timed on the game clock (state.time advances by the same dt that shortens the nudge).
      const unfrozenAt = Date.now();
      const end = await (await page.waitForFunction(() => {
        const s = document.querySelector('canvas')._stateRef.current;
        return s.chef?.key !== 'plant' && { time: s.time };
      }, null, { timeout: 15_000 })).jsonValue();
      const gameElapsed = end.time - res.frozen.time;
      note(res, {
        lifeAtDetection: chef.life, lifeWhenMeasured: res.frozen.life, gameSecondsUntilGone: Math.round(gameElapsed * 1000) / 1000,
        wallSecondsUntilGone: Math.round(Date.now() - unfrozenAt) / 1000, msFromDetectionToMeasurement: unfrozenAt - seenAt,
      });
      expect(res.v, 'nudge').toEqual([]);
      expect(res.frozen.key).toBe('plant');
      expect(chef.life).toBeLessThanOrEqual(4.5);
      expect(res.frozen.life).toBeGreaterThan(0);
      expect(gameElapsed).toBeGreaterThanOrEqual(res.frozen.life - 1e-6);
      expect(gameElapsed).toBeLessThanOrEqual(res.frozen.life + 0.2);
    });

    test(`Meal Planner great result ${lang} ${size}`, async ({ page }) => {
      await openMealResult(page, lang, size);
      const expected = expectedValue(lang, 'meal_planner.results.tier_great_body');
      const res = await proveDomParagraph(page, { expected, shot: shotPath('result', lang, size) });
      note(res);
      expect(res.v, 'result body').toEqual([]);
    });
  }
}

// Play the plan through with the keyboard and check the advice shown for the resulting tier.
function stepGreatPlan() {
  const PLAN = {
    breakfast: [['bread', 'home'], ['egg', 'home'], ['strawberry', 'home'], ['cherry', 'market']],
    lunch: [['rice', 'market'], ['lentils', 'market'], ['tomato', 'market'], ['cucumber', 'home'], ['banana', 'market']],
    dinner: [['rice', 'market'], ['chicken', 'market'], ['bell_pepper', 'market'], ['tomato', 'home'], ['cherry', 'market']],
  };
  const SLOT = { bread: 'carb', rice: 'carb', egg: 'protein', chicken: 'protein', lentils: 'protein', strawberry: 'fruit', banana: 'fruit', cherry: 'fruit', tomato: 'veg', cucumber: 'veg', bell_pepper: 'veg' };
  const TS = 32;
  const cv = document.querySelector('canvas'); const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };
  // a coach message that means a wrong step stops the run at once, with its reason
  if (st.chef && ['capfull', 'wrong', 'junk', 'missing'].includes(st.chef.key)) throw new Error(`unexpected coach «${st.chef.key}»: ${st.chef.msg}`);
  const face = (tile) => {
    const p = st.player; p.col = tile.col; p.row = tile.row + 1; p.pixelX = p.col * TS; p.pixelY = p.row * TS;
    p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = 1;
  };
  if (st.showMissionIntro) return { act: 'enter' };
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
  if (st.phase === 'results') return { act: 'enter' };
  const plate = st.plates[st.activePlate];
  if (st.heldItem) { face({ col: 9, row: 7 }); return st.actionPrompt ? { act: 'enter' } : { act: 'wait', ms: 80 }; }
  const open = plate.slots.find((s) => !s.item);
  if (!open) { face({ col: 9, row: 7 }); return st.actionPrompt ? { act: 'enter' } : { act: 'wait', ms: 80 }; }
  const remaining = [...PLAN[plate.meal]];
  for (const s of plate.slots.filter((x) => x.item)) {
    const i = remaining.findIndex(([id, src]) => id === s.item && src === s.source); if (i >= 0) remaining.splice(i, 1);
  }
  const want = remaining.find(([id]) => SLOT[id] === open.type);
  if (!want) return { act: 'wait', ms: 150 };
  const [id, src] = want;
  const target = src === 'home' ? st.fridge.find((f) => !f.used && f.id === id) : st.market.find((m) => m.id === id);
  if (!target) return { act: 'wait', ms: 150 };
  face(target.tile);
  return st.actionPrompt && st.actionPrompt.includes(target.emoji) ? { act: 'enter' } : { act: 'wait', ms: 80 };
}

test('real Meal Planner run reaches «great» and shows the new body (el 1366x768)', async ({ page }) => {
  await boot(page, '1366x768');
  await bootMission(page, 'foodwaste', 2, 'el', '&scenario=0');
  const nav = await driveToResult(page, stepGreatPlan);
  expect(nav).toMatchObject(MEAL_RESULT);
  expect(nav.axes, 'no axes to the shared ResultScreen').toBeUndefined();
  await page.waitForFunction(() => window.__playfood.screen() === 'result');
  const res = await proveDomParagraph(page, { expected: expectedValue('el', 'meal_planner.results.tier_great_body'), shot: shotPath('real_run', 'el', '1366x768') });
  note(res, { nav: { tier: nav.tier, score: nav.score, stars: nav.stars, axes: nav.axes } });
  expect(res.v, 'result body after a real run').toEqual([]);
});

// Inject clipping and placement faults to confirm that the advice layout checks detect them.
const CHEF_SIZES = ['1366x768', '844x390'];
async function carryTo(page, id, where) {
  const tile = await page.evaluate(([i, w]) => {
    const st = document.querySelector('canvas')._stateRef.current;
    return (w === 'home' ? st.fridge.find((f) => f.id === i && !f.used) : st.market.find((m) => m.id === i)).tile;
  }, [id, where]);
  await teleport(page, tile.col, tile.row + 1);
  await page.waitForFunction(() => !!document.querySelector('canvas')._stateRef.current.actionPrompt);
  await pressUntil(page, () => !!document.querySelector('canvas')._stateRef.current.heldItem, `pick up ${id}`);
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.heldItem.id)).toBe(id);
  await teleport(page, 9, 8);
  await page.waitForFunction(() => !!document.querySelector('canvas')._stateRef.current.actionPrompt);
  await pressUntil(page, () => !document.querySelector('canvas')._stateRef.current.heldItem, `place ${id}`);
}
// the 14th food placed the way a child walks it there (review 13/10, P2): ▼ held from (9,5) towards the
// table (9,6), then a real Enter — ▼ is still down when the results page starts. Leaves ▼ held.
async function carryHoldingDown(page, id, where) {
  const tile = await page.evaluate(([i, w]) => {
    const st = document.querySelector('canvas')._stateRef.current;
    return (w === 'home' ? st.fridge.find((f) => f.id === i && !f.used) : st.market.find((m) => m.id === i)).tile;
  }, [id, where]);
  await teleport(page, tile.col, tile.row + 1);
  await page.waitForFunction(() => !!document.querySelector('canvas')._stateRef.current.actionPrompt);
  await pressUntil(page, () => !!document.querySelector('canvas')._stateRef.current.heldItem, `pick up ${id}`);
  await teleport(page, 9, 5);
  await page.keyboard.down('ArrowDown');                     // turns to the table; the table blocks the step
  await page.waitForFunction(() => { const s = document.querySelector('canvas')._stateRef.current; return s.player.col === 9 && s.player.row === 5 && !!s.actionPrompt; }, null, { timeout: 5_000 });
  await pressUntil(page, () => document.querySelector('canvas')._stateRef.current.phase === 'results', `place ${id} with ▼ held`);
}
async function openChefLine(page, lang, size, scenario, steps, key) {
  await boot(page, size);
  await bootMission(page, 'foodwaste', 2, lang, `&scenario=${scenario}`);
  await pressUntil(page, () => !document.querySelector('canvas')._stateRef.current.showMissionIntro, 'close the mission card');
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.irisOpenness >= 1);
  for (const [id, where] of steps) await carryTo(page, id, where);
  if (key === 'mealdone') {                       // breakfast full → a real Enter at the plate
    await teleport(page, 9, 8);
    await pressUntil(page, () => document.querySelector('canvas')._stateRef.current.activePlate === 1, 'next meal');
  }
  await page.waitForFunction((k) => document.querySelector('canvas')._stateRef.current.chef?.key === k, key, { timeout: 5_000 });
  return page.evaluate(() => document.querySelector('canvas')._stateRef.current.chef.msg);
}
const CHEF_LINES = {
  // summer: a bought banana while the home banana is still in the fridge
  already: {
    scenario: 0, steps: [['banana', 'market']],
    expected: (loc, lang) => loc.meal_planner.already_have
      .replace('{{food}}', loc.foods.banana.toLocaleLowerCase(lang)).replace('{{emoji}}', '🍌'),
  },
  // winter: a bought strawberry (out of season in this scenario)
  season: {
    scenario: 2, steps: [['strawberry', 'market']],
    expected: (loc, lang) => loc.meal_planner.coach_season.replace('{{season}}', loc.season.winter)
      .replace('{{food}}', loc.foods.strawberry.toLocaleLowerCase(lang)).replace('{{emoji}}', '🍓'),
  },
  // summer: breakfast from the fridge only → no advice is showing when the plate changes
  mealdone: { scenario: 0, steps: [['bread', 'home'], ['egg', 'home'], ['strawberry', 'home'], ['banana', 'home']], expected: (loc) => loc.meal_planner.chef_meal_done },
};
for (const size of CHEF_SIZES) {
  for (const lang of LANGS) {
    for (const [key, line] of Object.entries(CHEF_LINES)) {
      test(`MP chef ${key} ${lang} ${size}`, async ({ page }) => {
        const loc = readLocale(lang);
        const expected = line.expected(loc, lang);
        expect(expected, 'no placeholder left').not.toMatch(/\{\{/);
        const msg = await openChefLine(page, lang, size, line.scenario, line.steps, key);
        expect(msg).toBe(expected);
        const res = await proveCanvasText(page, { expected, pick: pickNudge(loc.meal_planner.chef_name), shot: shotPath(`mp_chef_${key}`, lang, size) });
        note(res, { key });
        expect(res.v, `chef ${key}`).toEqual([]);
      });
    }
  }
}

// Check the recap against the final plates, including a change on the last placement.
const RECAP_PLANS = {
  // winter: the first strawberry (out of season) is the last placement; bread stays home and is bought
  season_last: {
    scenario: 2, season: 'winter',
    rows: [['rice', 'home'], ['egg', 'home'], ['orange', 'home'], ['banana', 'home'], ['rice', 'market'], ['chicken', 'market'], ['kale', 'market'], ['kale', 'home'], ['mandarin', 'market'], ['bread', 'market'], ['chicken', 'market'], ['kale', 'market'], ['kale', 'market'], ['strawberry', 'market']],
    pct: '61',                                      // 41.25 + 0 + 20 = 61.25 → 61
    used: ['banana'], all: false, left: 'bread', spoiled: true, bought: true, wasteTip: { kind: 'fridge', item: 'bread' },
    share: 'sust_most', fewer: ['egg', 'chicken', 'strawberry'], oos: ['strawberry'], sustTip: { kind: 'try', to: 'lentils', from: 'chicken' },
  },
  // summer: the bought banana (home banana unused) is the last placement
  redundant_last: {
    scenario: 0, season: 'summer',
    rows: [['bread', 'home'], ['egg', 'home'], ['strawberry', 'home'], ['cherry', 'market'], ['rice', 'market'], ['lentils', 'market'], ['tomato', 'market'], ['cucumber', 'home'], ['cherry', 'market'], ['rice', 'market'], ['chicken', 'market'], ['bell_pepper', 'market'], ['tomato', 'home'], ['banana', 'market']],
    pct: '74',                                      // 44.82 + 10 + 20 = 74.82 → 74
    used: ['strawberry', 'bread'], all: false, left: 'banana', spoiled: true, bought: true, wasteTip: { kind: 'fridge', item: 'banana' },
    share: 'sust_most', fewer: ['egg', 'chicken'], oos: [], sustTip: { kind: 'try', to: 'lentils', from: 'chicken' },
  },
  // summer: the only chicken is the last placement
  plant_last: {
    scenario: 0, season: 'summer',
    rows: [['bread', 'home'], ['egg', 'home'], ['strawberry', 'home'], ['banana', 'home'], ['rice', 'market'], ['lentils', 'market'], ['tomato', 'market'], ['cucumber', 'home'], ['cherry', 'market'], ['rice', 'market'], ['bell_pepper', 'market'], ['tomato', 'home'], ['cherry', 'market'], ['chicken', 'market']],
    pct: '94',
    used: ['strawberry', 'banana', 'bread'], all: true, left: null, wasteTip: null,
    share: 'sust_most', fewer: ['egg', 'chicken'], oos: [], sustTip: { kind: 'try', to: 'lentils', from: 'chicken' },
  },
};
const FOOD_EMOJI = { banana: '🍌', bread: '🍞', egg: '🥚', chicken: '🍗', strawberry: '🍓', lentils: '🫘' };
function expectedRecap(lang, plan) {
  const loc = readLocale(lang); const R = loc.meal_planner.recap;
  const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k]);
  const food = (id) => `${loc.foods[id].toLocaleLowerCase(lang)} ${FOOD_EMOJI[id]}`;
  const waste = [fill(plan.all ? R.waste_used_all : R.waste_used_some, { useFirst: loc.meal_planner.use_first, items: plan.used.map(food).join(', ') })];
  if (plan.left) waste.push(fill(plan.spoiled ? R.waste_spoiled : R.waste_left, { item: food(plan.left) }));
  if (plan.bought) waste.push(R.waste_bought_same);
  if (plan.wasteTip?.kind === 'fridge') waste.push(fill(R.tip_fridge, { item: food(plan.wasteTip.item) }));
  const sust = [R[plan.share]];
  if (plan.fewer.length) sust.push(fill(R.sust_fewer, { items: plan.fewer.map((id) => (plan.oos.includes(id) ? fill(R.item_out_of_season, { item: food(id), season: loc.season[plan.season] }) : food(id))).join(', ') }));
  if (plan.sustTip) sust.push(fill(R.tip_try_instead, { to: food(plan.sustTip.to), from: food(plan.sustTip.from) }));
  return { pct: fill(R.pct_label, { pct: plan.pct }), paragraphs: [waste.join(' '), sust.join(' '), R.nutrition_full] };
}
async function playPlan(page, lang, size, plan, { heldDownLast = false } = {}) {
  await boot(page, size);
  await bootMission(page, 'foodwaste', 2, lang, `&scenario=${plan.scenario}`);
  await pressUntil(page, () => !document.querySelector('canvas')._stateRef.current.showMissionIntro, 'close the mission card');
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.irisOpenness >= 1);
  let placed = 0;
  for (const [id, where] of plan.rows) {
    if (heldDownLast && placed === plan.rows.length - 1) await carryHoldingDown(page, id, where);
    else await carryTo(page, id, where);
    placed += 1;
    if (placed === 4) {                             // breakfast full → a real Enter at the plate
      await teleport(page, 9, 8);
      await pressUntil(page, () => document.querySelector('canvas')._stateRef.current.activePlate === 1, 'to lunch');
    }
    if (placed === 9) {
      await teleport(page, 9, 8);
      await pressUntil(page, () => document.querySelector('canvas')._stateRef.current.activePlate === 2, 'to dinner');
    }
  }
  // the 14th placement finishes the game at once: the chef has no frame to speak
  await page.waitForFunction(() => { const s = document.querySelector('canvas')._stateRef.current; return s.phase === 'results' && s.resultPage === 'score'; }, null, { timeout: 5_000 });
}
const RECAP_SIZES = ['1366x768', '844x390'];
for (const size of RECAP_SIZES) {
  for (const lang of LANGS) {
    for (const [name, plan] of Object.entries(RECAP_PLANS)) {
      test(`MP recap ${name} ${lang} ${size}`, async ({ page }) => {
        test.setTimeout(120_000);
        const exp = expectedRecap(lang, plan);
        await playPlan(page, lang, size, plan);
        const view = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.recapView);
        expect(view.pctLabel).toBe(exp.pct);
        expect(view.paragraphs.map((p) => p.text)).toEqual(exp.paragraphs);
        for (const [i, text] of [exp.pct, ...exp.paragraphs].entries()) {
          // pickRun: any same-x run of lines, inside the real recap card (CARDS.results)
          const res = await proveCanvasText(page, { expected: text, pick: pickRun(text, CARDS.results), shot: i === 0 ? shotPath(`mp_recap_${name}`, lang, size) : '' });
          note(res, { part: i });
          expect(res.v, `recap part ${i}`).toEqual([]);
        }
      });
    }
  }
}

// Check the introduction, score breakdown and recap using the keyboard and touch controls.
const TOUCH_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'q', 'Enter'];
async function requireControls(page, size) {
  const shown = await page.evaluate(() => [...document.querySelectorAll('[data-touch-control]')]
    .filter((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; })
    .map((e) => e.dataset.key));
  if (size === '844x390') for (const k of TOUCH_KEYS) expect(shown, `touch control ${k} on screen`).toContain(k);
  return shown;
}
// The real card of a text, recognised from the drawn frame alone (review 13/10, P2): a fill of the
// card's own style followed at once by its outline (drawRoundedRect = one path, fill then stroke) of
// the card's own stroke style — or, for `stroke: null`, a fill with no outline, drawn inside a fill of
// `within`. Cards drawn over the results dimming layer (`over`: the full-canvas fillRect of that
// style) are looked for only above its last copy. The card must be the ONLY such shape there and be
// drawn before the text. There is no fallback: never the overlay itself, never «whatever fill
// happens to enclose the first line».
const RESULTS_DIM = 'rgba(0,0,0,0.55)';
const norm = (v) => String(v).replace(/\s+/g, '').toLowerCase();   // as the recorder stores styles
const CARDS = {
  results: { fill: '#fff8e1', stroke: '#ffd54f', over: RESULTS_DIM },              // recap card / «How…» card
  button: { fill: '#ffffff', stroke: '#ffd54f', over: RESULTS_DIM },               // «How…» / «Back» pill on that card
  factPanel: { fill: '#fff8e1', stroke: null, within: '#2e7d32', over: RESULTS_DIM }, // cream panel of the green «Did you know?» card
  intro: { fill: '#fff8e1', stroke: '#33691e' },                // mission intro card (WORLD_ART panelCream / textGreen)
  menu: { fill: '[objectcanvasgradient]', stroke: '#3e2723' },  // wooden menu board on the kitchen wall
};
function findCard(ops, card) {
  const encloses = (a, b) => a.l <= b.l + 0.5 && a.r >= b.r - 0.5 && a.top <= b.top + 0.5 && a.bot >= b.bot - 0.5;
  const bySeq = new Map(ops.map((o) => [o.seq, o]));
  const floor = card.over ? (ops.filter((o) => o.kind === 'rect' && o.style === norm(card.over)).at(-1)?.seq ?? Infinity) : -Infinity;
  const hits = ops.filter((o) => {
    if (o.seq <= floor) return false;
    if (o.kind !== 'fill' || o.style !== card.fill) return false;
    const next = bySeq.get(o.seq + 1);
    const outlined = next && next.kind === 'stroke' && next.cid === o.cid;
    if (card.stroke) return outlined && next.style === card.stroke;
    if (outlined) return false;
    return ops.some((w) => w.kind === 'fill' && w.style === card.within && w.cid === o.cid && w.seq < o.seq && encloses(w, o));
  });
  return hits.length === 1 ? hits[0] : null;   // none, or more than one look-alike → not proven
}
// any text: the contiguous run of lines (same left x) that joins to `expected`; its container is the
// given card (findCard), which must be drawn before the run — independent of where the text landed
function pickRun(expected, card) {
  if (!card) throw new Error('pickRun: name the card the text belongs to');
  return (ops) => {
    const texts = ops.filter((o) => o.kind === 'text');
    const byX = {}; texts.forEach((o) => { (byX[Math.round(o.ax)] ||= []).push(o); });
    for (const group of Object.values(byX)) {
      const lines = group.sort((a, b) => a.seq - b.seq);
      for (let i = 0; i < lines.length; i += 1) {
        let acc = '';
        for (let j = i; j < lines.length; j += 1) {
          acc = acc ? `${acc} ${lines[j].s.trim()}` : lines[j].s.trim();
          if (!expected.startsWith(acc)) break;
          if (acc === expected) {
            const run = lines.slice(i, j + 1);
            const found = findCard(ops, card);
            return { lines: run, container: found && found.seq < run[0].seq ? found : null };
          }
        }
      }
    }
    return { lines: [], container: null };
  };
}
async function proveAll(page, texts, label, card, shot = '') {
  for (const [i, text] of texts.entries()) {
    const res = await proveCanvasText(page, { expected: text, pick: pickRun(text, card), shot: i === 0 ? shot : '' });
    note(res, { label, part: i });
    expect(res.v, `${label} · «${text.slice(0, 40)}»`).toEqual([]);
  }
}
// Expected totals use the three weighted score components and round down to whole points.
const HOW_PLANS = {
  redundant_last: {
    plan: 'redundant_last', points: { s: 44, w: 10, n: 20 }, total: 74, full: 12,   // 12.55/14 × 50, 1/3 × 30, 20
    fewer: [['egg', ['not_plant', 'co2_mid']], ['chicken', ['not_plant', 'co2_high']]],
    used: ['strawberry', 'bread'], foods: 3, spoiled: ['banana'], redundant: ['banana'], calc: [2, 1, 1],
  },
  season_last: {
    plan: 'season_last', points: { s: 41, w: 0, n: 20 }, total: 61, full: 10,        // 11.55/14 × 50, 0/2 × 30, 20
    fewer: [['egg', ['not_plant', 'co2_mid']], ['chicken', ['not_plant', 'co2_high']], ['strawberry', ['out_of_season']]],
    used: ['banana'], foods: 2, spoiled: ['bread'], redundant: ['bread'], calc: [1, 1, 0],
  },
};
const FOOD_EMOJI2 = { ...FOOD_EMOJI, egg: '🥚', chicken: '🍗', strawberry: '🍓', bread: '🍞', banana: '🍌' };
function expectedHow(lang, h) {
  const loc = readLocale(lang); const H = loc.meal_planner.how; const mp = loc.meal_planner;
  const plan = RECAP_PLANS[h.plan];
  const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k]);
  const food = (id) => `${loc.foods[id].toLocaleLowerCase(lang)} ${FOOD_EMOJI2[id]}`;
  const reason = (r) => (r === 'out_of_season' ? fill(H.reason_out_of_season, { season: loc.season[plan.season] }) : H[`reason_${r}`]);
  const sust = [fill(H.sust_full, { full: h.full, total: 14 }), fill(H.sust_fewer, { items: h.fewer.map(([id, rs]) => fill(H.item_reasons, { item: food(id), reasons: rs.map(reason).join(', ') })).join(', ') })].join(' ');
  const waste = [fill(H.waste_used, { useFirst: mp.use_first, used: h.used.length, total: h.foods, items: h.used.map(food).join(', ') }),
    fill(H.waste_spoiled, { useFirst: mp.use_first, items: h.spoiled.map(food).join(', ') }),
    fill(H.waste_redundant, { items: h.redundant.map(food).join(', '), n: h.redundant.length }),
    fill(H.waste_calc, { used: h.calc[0], redundant: h.calc[1], net: h.calc[2], total: h.foods, points: h.points.w, max: 30 })].join(' ');
  return {
    open: H.open, back: H.back, title: H.title,
    headings: [fill(H.axis_heading, { axis: mp.axis_sustainability, points: h.points.s, max: 50 }),
      fill(H.axis_heading, { axis: mp.axis_waste, points: h.points.w, max: 30 }),
      fill(H.axis_heading, { axis: mp.axis_nutrition, points: h.points.n, max: 20 })],
    bodies: [sust, waste, H.nut_full],
    total: fill(H.total, { s: h.points.s, w: h.points.w, n: h.points.n, total: h.total }),
    pctLabel: fill(mp.recap.pct_label, { pct: h.total }),
    // EN has no meal_planner.facts: the game falls back to the plain sentence in foodwaste.js
    fact: mp.facts?.unep_trillion ?? WASTE_FACTS.find((f) => f.id === 'unep_trillion').plain,
    otherFact: mp.facts?.unep_meals ?? WASTE_FACTS.find((f) => f.id === 'unep_meals').plain,
  };
}
// a key held for a few frames (a press shorter than one frame can be missed by the game loop)
async function holdKey(page, key) { await page.keyboard.down(key); await page.waitForTimeout(90); await page.keyboard.up(key); }
const mpState = (page) => page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; return { page: s.resultPage, how: s.howOpen, facts: (s.wasteFact || []).map((f) => f.id), phase: s.phase }; });
const P_SIZES = ['1366x768', '844x390'];
for (const size of P_SIZES) {
  for (const lang of LANGS) {
    for (const [name, h] of Object.entries(HOW_PLANS)) {
      test(`MP how ${name} ${lang} ${size}`, async ({ page }) => {
        test.setTimeout(150_000);
        const exp = expectedHow(lang, h);
        await playPlan(page, lang, size, RECAP_PLANS[h.plan]);
        await requireControls(page, size);
        expect(await mpState(page)).toMatchObject({ page: 'score', how: false });
        await proveAll(page, [exp.open], 'button', CARDS.button);
        await holdKey(page, 'ArrowDown');                            // ▼ opens
        await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.howOpen === true, null, { timeout: 5_000 });
        await proveAll(page, [exp.title, exp.headings[0], exp.bodies[0], exp.headings[1], exp.bodies[1], exp.headings[2], exp.bodies[2], exp.total], 'how', CARDS.results, shotPath(`mp_how_${name}`, lang, size));
        await proveAll(page, [exp.back], 'back', CARDS.button);
        await holdKey(page, 'ArrowUp');                              // ▲ closes
        await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.howOpen === false, null, { timeout: 5_000 });
        await proveAll(page, [exp.pctLabel], 'main again', CARDS.results);
        await proveAll(page, [exp.open], 'button again', CARDS.button);
        if (name !== 'redundant_last') return;
        await holdKey(page, 'ArrowDown');
        await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.howOpen === true, null, { timeout: 5_000 });
        await pressUntil(page, () => document.querySelector('canvas')._stateRef.current.resultPage === 'fact', 'Enter → fact');
        expect(await mpState(page)).toMatchObject({ page: 'fact', how: false, facts: ['unep_trillion'] });  // Check the score breakdown on the result card.
        const res = await proveCanvasText(page, { expected: exp.fact, pick: pickRun(exp.fact, CARDS.factPanel), shot: shotPath('mp_fact', lang, size) });
        note(res, { label: 'fact' });
        expect(res.v, 'fact').toEqual([]);
        const drawn = res.frame.filter((o) => o.kind === 'text').map((o) => o.s).join(' ');
        expect(drawn.includes(exp.otherFact.split(' ').slice(0, 4).join(' ')), 'unep_meals not on the end card').toBe(false);
      });
    }
  }
}
// pointer: the canvas button (mouse at 1366, tap at 844), the D-pad ▼ / ▲ at 844, and a clean new attempt
for (const size of P_SIZES) {
  test(`MP how pointer el ${size}`, async ({ page }) => {
    test.setTimeout(150_000);
    await playPlan(page, 'el', size, RECAP_PLANS.redundant_last);
    await requireControls(page, size);
    const clickRect = async (key) => {
      const pt = await page.evaluate((k) => {
        const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect(); const s = cv._stateRef.current; const b = s[k];
        // logical 1280×704 → backing px through the game's own HiDPI transform → CSS px
        const h = cv.__hidpi || { k: cv.width / 1280, ox: 0, oy: 0 };
        const bx = h.ox + h.k * (b.x + b.width / 2); const by = h.oy + h.k * (b.y + b.height / 2);
        return { x: r.left + bx * (r.width / cv.width), y: r.top + by * (r.height / cv.height) };
      }, key);
      await page.mouse.click(pt.x, pt.y);
    };
    await clickRect('howButtonRect');
    // the click flips howOpen at once; the Back button rect exists only after the next drawn frame
    await page.waitForFunction(() => { const s = document.querySelector('canvas')._stateRef.current; return s.howOpen === true && !!s.howBackRect; }, null, { timeout: 5_000 });
    await clickRect('howBackRect');
    await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.howOpen === false, null, { timeout: 5_000 });
    if (size === '844x390') {
      // a real touch on the D-pad (CDP touch events, as in the touch specs)
      await touchHold(page, page.locator('[data-touch-control][data-key="ArrowDown"]'), 120);
      await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.howOpen === true, null, { timeout: 5_000 });
      await touchHold(page, page.locator('[data-touch-control][data-key="ArrowUp"]'), 120);
      await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.howOpen === false, null, { timeout: 5_000 });
    }
    // a click outside the button does nothing
    await page.mouse.click(5, 5);
    expect(await mpState(page)).toMatchObject({ page: 'score', how: false });
    // finish: score → fact → shared ResultScreen, then a new attempt starts clean
    await pressUntil(page, () => document.querySelector('canvas')._stateRef.current.resultPage === 'fact', 'to fact');
    await pressUntil(page, () => window.__playfood.screen() === 'result', 'to result');
    await page.evaluate(() => window.__playfood.startMission('foodwaste', 2));
    await page.waitForFunction(() => { const s = document.querySelector('canvas')?._stateRef?.current; return window.__playfood.screen() === 'game' && s?.player && s.phase === 'play'; }, null, { timeout: 20_000 });
    expect(await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current;
      return { how: s.howOpen, howView: s.howView, recap: s.recap, results: s.results, chef: s.chef, told: s.coachTold?.already?.size ?? null, page: s.resultPage }; }))
      .toEqual({ how: false, howView: null, recap: null, results: null, chef: null, told: 0, page: null });
  });
}
// An arrow already held when the score card reopens must not advance the selection.
async function heldDownStaysClosed(page, lang, label) {
  await page.waitForTimeout(400);                                 // ~20 frames with ▼ still down
  expect(await mpState(page), `${label}: ▼ still held → closed`).toMatchObject({ page: 'score', how: false });
  await proveAll(page, [expectedHow(lang, HOW_PLANS.redundant_last).pctLabel], `${label}: main card`, CARDS.results);
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(200);
  expect(await mpState(page), `${label}: released → closed`).toMatchObject({ page: 'score', how: false });
  await holdKey(page, 'ArrowDown');                               // a new press opens it
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.howOpen === true, null, { timeout: 5_000 });
}
for (const size of P_SIZES) {
  for (const lang of LANGS) {
    test(`MP how held ▼ on the 14th placement ${lang} ${size}`, async ({ page }) => {
      test.setTimeout(150_000);
      await playPlan(page, lang, size, RECAP_PLANS.redundant_last, { heldDownLast: true });
      await requireControls(page, size);
      await heldDownStaysClosed(page, lang, '14th placement');
    });
  }
}
for (const size of P_SIZES) {
  test(`MP how held arrows across pause / instructions / exit el ${size}`, async ({ page }) => {
    test.setTimeout(150_000);
    const g = readLocale('el').game;
    const bar = (name) => page.getByTestId('game-scorebar').getByRole('button', { name: new RegExp(name) });
    await playPlan(page, 'el', size, RECAP_PLANS.redundant_last);
    await requireControls(page, size);
    expect(await mpState(page)).toMatchObject({ page: 'score', how: false });
    // Pause: ▼ pressed while paused and still held at Resume
    await bar(g.pause).click();
    const resume = page.getByRole('button', { name: g.resume, exact: true });
    await expect(resume).toBeVisible();
    await page.keyboard.down('ArrowDown');
    await resume.click();
    await heldDownStaysClosed(page, 'el', 'pause');               // ends with the breakdown open
    // Pause with the breakdown open: ▲ held at Resume keeps it open until a new ▲
    await bar(g.pause).click();
    await expect(resume).toBeVisible();
    await page.keyboard.down('ArrowUp');
    await resume.click();
    await page.waitForTimeout(400);
    expect(await mpState(page), 'pause: ▲ still held → open').toMatchObject({ page: 'score', how: true });
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(200);
    expect(await mpState(page), 'pause: ▲ released → open').toMatchObject({ page: 'score', how: true });
    await holdKey(page, 'ArrowUp');
    await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.howOpen === false, null, { timeout: 5_000 });
    // Instructions: ▼ pressed on the card and still held when Enter closes it
    await bar(g.instructions).click();
    await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.showMissionIntro === true, null, { timeout: 5_000 });
    await page.keyboard.down('ArrowDown');
    await pressUntil(page, () => !document.querySelector('canvas')._stateRef.current.showMissionIntro, 'close the instructions');
    await heldDownStaysClosed(page, 'el', 'instructions');
    await holdKey(page, 'ArrowUp');
    await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.howOpen === false, null, { timeout: 5_000 });
    // Exit → Cancel: ▼ pressed in the confirm and still held after Cancel
    await bar(g.quit).click();
    const cancel = page.getByRole('button', { name: g.confirm_no, exact: true });
    await expect(cancel).toBeVisible();
    await page.keyboard.down('ArrowDown');
    await cancel.click();
    await heldDownStaysClosed(page, 'el', 'exit cancelled');
    // Enter still goes on to the fact exactly as before
    await pressUntil(page, () => document.querySelector('canvas')._stateRef.current.resultPage === 'fact', 'Enter → fact');
    expect(await mpState(page)).toMatchObject({ page: 'fact', how: false, facts: ['unep_trillion'] });
  });
}
// Close the introduction with Enter and check the current season on the menu board.
for (const size of P_SIZES) {
  for (const lang of LANGS) {
    test(`MP intro and menu season ${lang} ${size}`, async ({ page }) => {
      const loc = readLocale(lang); const mi = loc.missionIntro.mealplanner;
      await boot(page, size);
      await bootMission(page, 'foodwaste', 2, lang, '&scenario=2');
      await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.showMissionIntro === true);
      await requireControls(page, size);
      expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.missionIntro.steps.length)).toBe(4);
      await proveAll(page, [1, 2, 3, 4].map((n) => `${n}. ${mi[`step${n}`]}`)  /* the card draws «n. step» (its wrapper collapses spaces) */, 'intro', CARDS.intro, shotPath('mp_intro', lang, size));
      await pressUntil(page, () => !document.querySelector('canvas')._stateRef.current.showMissionIntro, 'close the intro');
      await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.irisOpenness >= 1);
      const title = loc.meal_planner.menu_season.replace('{{title}}', mi.title).replace('{{emoji}}', '❄️').replace('{{season}}', loc.season.winter);
      await proveAll(page, [title], 'menu', CARDS.menu, shotPath('mp_menu_season', lang, size));
    });
  }
}
// Check the one-star result description and the absence of a separate axes line.
const MEAL_PASS = { island: 'foodwaste', mission: 'MealPlanner', missionId: 2, score: 62, passed: true, tier: 'pass', stars: 1 };
for (const size of P_SIZES) {
  for (const lang of LANGS) {
    test(`MP result pass body ${lang} ${size}`, async ({ page }) => {
      await boot(page, size);
      await page.goto(`/?testMode=1&lang=${lang}`);
      await page.waitForFunction((l) => window.__playfood?.language() === l, lang, { timeout: 20_000 });
      await page.evaluate((data) => window.__playfood.goToScreen('result', data), MEAL_PASS);
      await page.waitForFunction(() => window.__playfood.screen() === 'result');
      const loc = readLocale(lang);
      const res = await proveDomParagraph(page, { expected: loc.meal_planner.results.tier_pass_body, shot: shotPath('mp_pass_body', lang, size) });
      note(res);
      expect(res.v, 'pass body').toEqual([]);
      const summary = loc.meal_planner.results.summary.split('{{')[0].trim();
      if (summary) expect(await page.getByText(summary, { exact: false }).count(), 'no axes line').toBe(0);
    });
  }
}

test.describe('negative controls (each fault must be caught)', () => {
  const report = (name, v) => {
    fs.writeFileSync(test.info().outputPath('negative-control.txt'), `${name}\n${v.join('\n')}\n`);
    test.info().annotations.push({ type: 'caught', description: `${name}: ${v.slice(0, 4).join(' | ')}` });
    console.log(`NEG ${name}: ${v.length} violation(s): ${v.slice(0, 4).join(' | ')}`);
  };
  const addBox = (page, box, tag) => page.evaluate(({ b, t }) => {
    const e = document.createElement(t);
    if (t === 'button') e.setAttribute('aria-label', 'neg');
    Object.assign(e.style, { position: 'fixed', left: `${b.l}px`, top: `${b.top}px`, width: `${b.r - b.l}px`, height: `${b.bot - b.top}px`, padding: 0, border: 0, margin: 0, background: '#123456', boxShadow: 'none', outline: 'none', zIndex: 99, pointerEvents: t === 'div' ? 'none' : 'auto' });
    document.body.appendChild(e);
  }, { b: box, t: tag });
  const cssGlyphs = (res) => res.lines.flatMap((line) => line.chars.map((g) => ({ ch: g.ch, ...toCss({ l: g.l, r: g.r, top: line.top, bot: line.bot }, res.ctx.canvas) })));
  const lowVisibility = (v) => v.filter((x) => /% visible|painted no ink/.test(x));

  test('NEG avatar: a button over one glyph of the label', async ({ page }) => {
    await openAvatar(page, 'el', '1366x768');
    const expected = expectedValue('el', 'avatar.controls_look');
    const clean = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    expect(clean.v).toEqual([]);
    const g = cssGlyphs(clean)[3];
    await addBox(page, { l: g.l - 1, r: g.r + 1, top: g.top - 1, bot: g.bot + 1 }, 'button');
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('button over one avatar glyph', res.v);
    expect(res.v.some((x) => x.startsWith('dom:')), JSON.stringify(res.v)).toBe(true);
    expect(lowVisibility(res.v).some((x) => x.includes(`glyph «${g.ch}» #3`)), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG avatar: the canvas paints over the bottom 60% of the label later in the frame', async ({ page }) => {
    await openAvatar(page, 'el', '1366x768');
    const expected = expectedValue('el', 'avatar.controls_look');
    await page.evaluate((s) => { window.__tc.cover = { s, share: 0.6 }; }, expected);
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('canvas rectangle over the bottom 60% of the avatar label', res.v);
    expect(res.v.some((x) => x.startsWith('zorder:')), JSON.stringify(res.v)).toBe(true);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.7 * [...expected.replace(/\s/g, '')].length));
  });

  test('NEG harbour fallback: a non-control overlay (pointer-events none) over the bottom 60% of the title', async ({ page }) => {
    await openHarbour(page, 'el', '1366x768', { blockLogo: true });
    const title = expectedValue('el', 'hub.harbor_title');
    const clean = await proveCanvasText(page, { expected: title, pick: pickHarbour(title) });
    expect(clean.v).toEqual([]);
    const gs = cssGlyphs(clean); const h = gs[0].bot - gs[0].top;
    await addBox(page, { l: gs[0].l - 2, r: gs.at(-1).r + 2, top: gs[0].bot - h * 0.6, bot: gs[0].bot + 2 }, 'div');
    const res = await proveCanvasText(page, { expected: title, pick: pickHarbour(title) });
    report('opaque non-control overlay over the bottom 60% of the harbour title', res.v);
    expect(res.v.some((x) => x.startsWith('dom:')), 'no control involved').toBe(false);
    expect(res.v.some((x) => x.startsWith('stack:')), JSON.stringify(res.v)).toBe(true);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.7 * gs.length));
  });

  test('NEG harbour fallback: measured during the fade-in (transition not finished)', async ({ page }) => {
    await boot(page, '1366x768');
    await page.route(`**/assets/logos/${LOGO}`, (route) => route.abort());
    await page.goto('/?testMode=1&lang=el');
    await page.waitForFunction(() => window.__playfood?.language() === 'el', null, { timeout: 20_000 });
    await page.evaluate(() => { const s = window.__playfood.state(); s.setHero('braid'); window.__playfood.goToScreen('menu'); });
    const title = expectedValue('el', 'hub.harbor_title');
    // held at the very first frame that draws the title: the purple fade still covers the screen,
    // whatever the speed of the machine
    await waitForProbe(page, title, { freezeThere: true });
    const res = await proveCanvasText(page, { expected: title, pick: pickHarbour(title) });
    report('measured during the harbour fade-in', res.v);
    expect(res.v.some((x) => x.startsWith('zorder:') && x.includes('rgba(83,63,139')), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG intro: the last body line is never drawn', async ({ page }) => {
    await openIntro(page, 'el', '1366x768');
    const exp = introExpectation('el');
    const clean = await proveCanvasText(page, { expected: exp.text, pick: pickIntro(exp) });
    expect(clean.v).toEqual([]);
    await page.evaluate((s) => { window.__tc.drop = new Set([s]); }, clean.lines.at(-1).s);
    const res = await proveCanvasText(page, { expected: exp.text, pick: pickIntro(exp) });
    report('last intro line missing', res.v);
    expect(res.v.some((x) => x.startsWith('text:')), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG nudge: the last line is cut with an ellipsis', async ({ page }) => {
    // The fault is armed BEFORE the real Enter that places the chicken, so the one measurement
    // happens inside the nudge's natural lifetime (a second, later measurement could find it gone).
    const expected = expectedValue('el', 'meal_planner.nudge_plant');
    const chefName = readLocale('el').meal_planner.chef_name;
    // where the line breaks is the renderer's business; cut whatever the last drawn line is
    await page.addInitScript((full) => {
      const P = CanvasRenderingContext2D.prototype; const o = P.fillText;
      P.fillText = function cut(t, x, y, ...r) {
        const s = String(t);
        if (s && s !== full && full.endsWith(s) && s.length > 8 && window.__tc && !window.__tc.mutate) window.__tc.mutate = { from: s, to: `${s.slice(0, -6).trim()}…` };
        return o.call(this, t, x, y, ...r);
      };
    }, expected);
    await openNudge(page, 'el', '1366x768');
    expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.chef?.key)).toBe('plant');
    const res = await proveCanvasText(page, { expected, pick: pickNudge(chefName) });
    report('nudge cut with an ellipsis', res.v);
    expect(res.lines.length, 'the coach was still on screen when measured').toBeGreaterThan(0);
    expect(res.v.some((x) => x.startsWith('text:') && x.includes('…')), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG result: an overlay and a button over the body', async ({ page }) => {
    await openMealResult(page, 'el', '1366x768');
    const expected = expectedValue('el', 'meal_planner.results.tier_great_body');
    const clean = await proveDomParagraph(page, { expected });
    expect(clean.v).toEqual([]);
    const gs = clean.facts.glyphs;
    expect(gs.length).toBeGreaterThan(8);
    expect(Math.abs(gs[5].top - gs[8].top)).toBeLessThan(1);
    expect(Math.abs(gs.at(-3).top - gs.at(-1).top)).toBeLessThan(1);
    await addBox(page, { l: gs[5].l - 1, r: gs[8].r + 1, top: gs[5].top - 1, bot: gs[5].bot + 1 }, 'div');
    await addBox(page, { l: gs.at(-3).l - 1, r: gs.at(-1).r + 1, top: gs.at(-1).top - 1, bot: gs.at(-1).bot + 1 }, 'button');
    const res = await proveDomParagraph(page, { expected });
    report('overlay and button over the result body', res.v);
    expect(res.v.some((x) => x.startsWith('dom:')), JSON.stringify(res.v)).toBe(true);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(7);
  });

  test('NEG result: a non-control overlay over the top 60% of every line', async ({ page }) => {
    await openMealResult(page, 'el', '1366x768');
    const expected = expectedValue('el', 'meal_planner.results.tier_great_body');
    const clean = await proveDomParagraph(page, { expected });
    expect(clean.v).toEqual([]);
    for (const line of clean.facts.lineRects) {
      await addBox(page, { l: line.l - 2, r: line.r + 2, top: line.top - 1, bot: line.top + (line.bot - line.top) * 0.6 }, 'div');
    }
    const res = await proveDomParagraph(page, { expected });
    report('opaque non-control overlay over the top 60% of every result line', res.v);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.5 * clean.facts.glyphs.length));
  });

  // ── second review: one fault per category that used to pass ──────────────────────────────
  const addEl = (page, box, css, { importantNoPointer = false, tag = 'div' } = {}) => page.evaluate(({ b, c, imp, t }) => {
    const e = document.createElement(t);
    if (t === 'button') e.setAttribute('aria-label', 'neg');
    Object.assign(e.style, { position: 'fixed', left: `${b.l}px`, top: `${b.top}px`, width: `${b.r - b.l}px`, height: `${b.bot - b.top}px`, padding: 0, border: 0, margin: 0, zIndex: 99, pointerEvents: 'none', ...c });
    if (imp) e.style.setProperty('pointer-events', 'none', 'important');
    document.body.appendChild(e);
  }, { b: box, c: css, imp: importantNoPointer, t: tag });
  const drawnShort = (v) => v.filter((x) => x.startsWith('draw:'));
  const span = (gs) => ({ l: gs[0].l, r: gs.at(-1).r, top: Math.min(...gs.map((g) => g.top)), bot: Math.max(...gs.map((g) => g.bot)) });
  async function cleanAvatar(page) {
    await openAvatar(page, 'el', '1366x768');
    const expected = expectedValue('el', 'avatar.controls_look');
    const clean = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    expect(clean.v).toEqual([]);
    return { expected, clean, gs: cssGlyphs(clean) };
  }

  test('NEG avatar: drawn under a ctx.clip() that hides its bottom 45%', async ({ page }) => {
    const { expected, gs } = await cleanAvatar(page);
    await page.evaluate((s) => { window.__tc.clipNeg = { s, share: 0.45 }; }, expected);
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('avatar label under ctx.clip (bottom 45% hidden)', res.v);
    expect(drawnShort(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.7 * gs.length));
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.7 * gs.length));
  });

  test('NEG avatar: drawn with globalAlpha 0.1', async ({ page }) => {
    const { expected, gs } = await cleanAvatar(page);
    await page.evaluate((s) => { window.__tc.alphaNeg = { s, alpha: 0.1 }; }, expected);
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('avatar label at globalAlpha 0.1', res.v);
    expect(res.v.some((x) => x.startsWith('style:') && x.includes('globalAlpha 0.1')), JSON.stringify(res.v)).toBe(true);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.7 * gs.length));
  });

  test('NEG avatar: a translucent Path2D veil drawn later in the frame', async ({ page }) => {
    const { expected } = await cleanAvatar(page);
    await page.evaluate((s) => { window.__tc.pathNeg = { s, style: 'rgba(0,0,0,0.45)' }; }, expected);
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('Path2D veil (0.45) over the avatar label', res.v);
    expect(res.v.some((x) => x.startsWith('zorder:') && x.includes('fill(Path2D)')), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG avatar: opaque scanlines (every other row, the sign\'s colour, pointer-events none)', async ({ page }) => {
    const { expected, gs } = await cleanAvatar(page);
    const b = span(gs);
    await addEl(page, { l: b.l - 2, r: b.r + 2, top: Math.floor(b.top) - 1, bot: Math.ceil(b.bot) + 1 }, { background: `repeating-linear-gradient(to bottom, ${WOOD_MID} 0 1px, transparent 1px 2px)` });
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('opaque scanlines over the avatar label', res.v);
    expect(res.v.some((x) => x.startsWith('dom:')), 'no control involved').toBe(false);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.7 * gs.length));
  });

  test('NEG avatar: a 2 px stripe through the middle of the label (pointer-events none)', async ({ page }) => {
    const { expected, gs } = await cleanAvatar(page);
    const b = span(gs); const mid = Math.round((b.top + b.bot) / 2);
    await addEl(page, { l: b.l - 2, r: b.r + 2, top: mid - 1, bot: mid + 1 }, { background: WOOD_MID });
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('2 px stripe through the avatar label', res.v);
    expect(res.v.some((x) => x.startsWith('stack:')), JSON.stringify(res.v)).toBe(true);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.5 * gs.length));
  });

  test('NEG avatar: a 40% veil with an inline pointer-events: none !important', async ({ page }) => {
    const { expected, gs } = await cleanAvatar(page);
    const b = span(gs);
    await addEl(page, { l: b.l - 2, r: b.r + 2, top: b.top - 2, bot: b.bot + 2 }, { background: 'rgba(0,0,0,0.4)' }, { importantNoPointer: true });
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('40% veil, inline pointer-events none !important', res.v);
    expect(res.v.some((x) => x.startsWith('stack:')), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG avatar: a backdrop-filter layer with no background over the label', async ({ page }) => {
    const { expected, gs } = await cleanAvatar(page);
    const b = span(gs);
    await addEl(page, { l: b.l - 2, r: b.r + 2, top: b.top - 2, bot: b.bot + 2 }, { backdropFilter: 'contrast(0.55)' });
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('backdrop-filter contrast(0.55) over the avatar label', res.v);
    expect(res.v.some((x) => x.startsWith('stack:')), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG avatar: another canvas, first in the DOM, stacked above with a veil', async ({ page }) => {
    const { expected, gs } = await cleanAvatar(page);
    const b = span(gs);
    await page.evaluate((box) => {
      const game = document.querySelector('canvas'); const r = game.getBoundingClientRect();
      const c = document.createElement('canvas'); c.width = Math.round(r.width); c.height = Math.round(r.height);
      Object.assign(c.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, zIndex: 99, pointerEvents: 'none' });
      const x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,0.45)';
      x.fillRect(box.l - r.left - 2, box.top - r.top - 2, box.r - box.l + 4, box.bot - box.top + 4);
      document.body.prepend(c);
    }, b);
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('second canvas first in the DOM with a veil over the avatar label', res.v);
    expect(res.v.some((x) => x.startsWith('stack:') && x.includes('<canvas')), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG avatar: a control that reaches the label only with its box-shadow', async ({ page }) => {
    const { expected, gs } = await cleanAvatar(page);
    const b = span(gs);
    await addEl(page, { l: b.l, r: b.r, top: b.bot + 4, bot: b.bot + 20 }, { background: '#123456', boxShadow: '0 -8px 0 4px #123456', pointerEvents: 'auto' }, { tag: 'button' });
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('a button whose box-shadow reaches the avatar label', res.v);
    expect(res.v.some((x) => x.startsWith('dom:') && x.includes('neg')), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG harbour fallback: a clip-path on the canvas\'s parent cuts the bottom 18% of the title', async ({ page }) => {
    await openHarbour(page, 'el', '1366x768', { blockLogo: true });
    const title = expectedValue('el', 'hub.harbor_title');
    const clean = await proveCanvasText(page, { expected: title, pick: pickHarbour(title) });
    expect(clean.v).toEqual([]);
    const gs = cssGlyphs(clean); const b = span(gs); const cut = b.bot - 0.18 * (b.bot - b.top);
    await page.evaluate((y) => {
      const parent = document.querySelector('canvas').parentElement; const r = parent.getBoundingClientRect();
      parent.style.clipPath = `inset(0 0 ${r.bottom - y}px 0)`;
    }, cut);
    const res = await proveCanvasText(page, { expected: title, pick: pickHarbour(title) });
    report('clip-path on the canvas parent, bottom 18% of the harbour title', res.v);
    expect(res.v.some((x) => x.startsWith('dom:')), 'no control involved').toBe(false);
    const descenders = res.v.filter((x) => /(pixels|stack): glyph «[ρχγςμηβζξφψ,]»/.test(x));
    expect(descenders.length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(2);
  });

  test('NEG harbour logo: a translucent non-control overlay over the logo', async ({ page }) => {
    await openHarbour(page, 'el', '1366x768', { blockLogo: false });
    const sub = expectedValue('el', 'hub.harbor_subtitle');
    const clean = await proveCanvasText(page, { expected: sub, pick: pickHarbour(sub, { withLogo: true }) });
    expect(clean.v).toEqual([]);
    const logo = clean.frame.find((o) => o.kind === 'image' && o.src.includes(LOGO));
    const box = toCss(logo, clean.ctx.canvas);
    await addEl(page, { l: box.l, r: box.r, top: box.top, bot: box.bot }, { background: 'rgba(0,0,0,0.45)' });
    const res = await proveCanvasText(page, { expected: sub, pick: pickHarbour(sub, { withLogo: true }) });
    report('translucent overlay over the harbour logo', res.v);
    expect(res.v.some((x) => x.startsWith('stack: glyph «[logo]»')), JSON.stringify(res.v)).toBe(true);
  });

  async function cleanResult(page) {
    await openMealResult(page, 'el', '1366x768');
    const expected = expectedValue('el', 'meal_planner.results.tier_great_body');
    const clean = await proveDomParagraph(page, { expected });
    expect(clean.v).toEqual([]);
    return { expected, clean };
  }
  // the colour the paragraph really sits on (first ancestor with a background)
  const cardColour = (page, text) => page.evaluate((t) => {
    for (let el = [...document.querySelectorAll('p')].find((e) => e.textContent === t); el; el = el.parentElement) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg;
    }
    return '#ffffff';
  }, text);

  test('NEG result: the paragraph\'s own ::after covers the top 45% of every line (card colour)', async ({ page }) => {
    const { expected, clean } = await cleanResult(page);
    const colour = await cardColour(page, expected);
    await page.evaluate(({ t, lines, c }) => {
      const p = [...document.querySelectorAll('p')].find((e) => e.textContent === t); const pr = p.getBoundingClientRect();
      const stops = lines.flatMap((l) => {
        const a = l.top - pr.top; const b = a + (l.bot - l.top) * 0.45;
        return [`transparent ${a}px`, `${c} ${a}px`, `${c} ${b}px`, `transparent ${b}px`];
      });
      const st = document.createElement('style');
      st.textContent = `p[data-tc-neg]{position:relative}p[data-tc-neg]::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(to bottom, ${stops.join(', ')})}`;
      document.head.appendChild(st); p.dataset.tcNeg = '1';
    }, { t: expected, lines: clean.facts.lineRects, c: colour });
    const res = await proveDomParagraph(page, { expected });
    report('p::after over the top 45% of every result line', res.v);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.5 * clean.facts.glyphs.length));
  });

  test('NEG result: the paragraph at opacity 0.05', async ({ page }) => {
    const { expected, clean } = await cleanResult(page);
    await page.evaluate((t) => { [...document.querySelectorAll('p')].find((e) => e.textContent === t).style.opacity = '0.05'; }, expected);
    const res = await proveDomParagraph(page, { expected });
    report('result body at opacity 0.05', res.v);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.9 * clean.facts.glyphs.length));
  });

  test('NEG result: a 2 px stripe through the first line in the card colour (pointer-events none)', async ({ page }) => {
    const { expected, clean } = await cleanResult(page);
    const colour = await cardColour(page, expected);
    const first = clean.facts.glyphs.filter((g) => Math.abs(g.top - clean.facts.glyphs[0].top) < 1);
    const b = span(first); const mid = Math.round(b.top + (b.bot - b.top) * 0.55);
    await addEl(page, { l: b.l - 2, r: b.r + 2, top: mid - 1, bot: mid + 1 }, { background: colour });
    const res = await proveDomParagraph(page, { expected });
    report('2 px stripe through the first result line', res.v);
    expect(res.v.some((x) => x.startsWith('stack:')), JSON.stringify(res.v)).toBe(true);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.5 * first.length));
  });

  // ── third review: faint colours, effects on <body>/<html>, a lost accent ──────────────────
  const ACCENTED = /[άέήίόύώΆΈΉΊΌΎΏ]/;
  const pieceOf = (v, ch) => v.some((x) => x.startsWith(`pixels: a piece of glyph «${ch}»`));

  test('NEG avatar: drawn in a translucent colour (alpha 0.1)', async ({ page }) => {
    const { expected, gs } = await cleanAvatar(page);
    await page.evaluate((s) => { window.__tc.alphaNeg = { s, fill: 'rgba(255,243,196,0.1)' }; }, expected);
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('avatar label in a colour at alpha 0.1', res.v);
    expect(gs.length).toBeGreaterThan(0);
    expect(res.v.some((x) => x.startsWith('style:') && x.includes('colour at alpha 0.1')), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG avatar: filled with a gradient that fades out', async ({ page }) => {
    const { expected } = await cleanAvatar(page);
    await page.evaluate((s) => { window.__tc.alphaNeg = { s, gradient: true }; }, expected);
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('avatar label filled with a fading gradient', res.v);
    expect(res.v.some((x) => x.startsWith('style:') && x.includes('CanvasGradient')), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG harbour fallback: a shape made only of arcTo hides the accent, drawn later', async ({ page }) => {
    await openHarbour(page, 'el', '1366x768', { blockLogo: true });
    const title = expectedValue('el', 'hub.harbor_title');
    const clean = await proveCanvasText(page, { expected: title, pick: pickHarbour(title) });
    expect(clean.v).toEqual([]);
    const index = [...title].findIndex((ch) => ACCENTED.test(ch));
    expect(index, 'the title has an accented letter').toBeGreaterThanOrEqual(0);
    const ch = [...title][index];
    await page.evaluate(([s, i]) => { window.__tc.arcNeg = { s, index: i, share: 0.3, style: 'rgb(83,63,139)' }; }, [title, index]);
    const res = await proveCanvasText(page, { expected: title, pick: pickHarbour(title) });
    report(`arcTo shape over the accent of «${ch}» in the harbour title`, res.v);
    expect(res.v.some((x) => x.startsWith('zorder:')), JSON.stringify(res.v)).toBe(true);
    expect(pieceOf(res.v, ch) || res.v.some((x) => x.startsWith(`pixels: glyph «${ch}»`)), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG result: the box-shadow of an element 30 px away hides only the accent of a letter', async ({ page }) => {
    const { expected, clean } = await cleanResult(page);
    const colour = await cardColour(page, expected);
    const g = clean.facts.glyphs.find((x) => ACCENTED.test(x.ch));
    expect(g, 'the body has an accented letter').toBeTruthy();
    const h = (g.bot - g.top) * 0.4;
    await addEl(page, { l: g.l, r: g.r, top: g.top - 30, bot: g.top - 30 + h }, { boxShadow: `0 30px 0 0 ${colour}` });
    const res = await proveDomParagraph(page, { expected });
    report(`box-shadow over the accent of «${g.ch}» in the result body`, res.v);
    expect(pieceOf(res.v, g.ch) || res.v.some((x) => x.startsWith(`pixels: glyph «${g.ch}»`)), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG result: the text colour at alpha 0.1', async ({ page }) => {
    const { expected, clean } = await cleanResult(page);
    await page.evaluate((t) => {
      const p = [...document.querySelectorAll('p')].find((e) => e.textContent === t); const c = getComputedStyle(p).color.match(/\d+/g);
      p.style.color = `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.1)`;
    }, expected);
    const res = await proveDomParagraph(page, { expected });
    report('result body in a colour at alpha 0.1', res.v);
    expect(clean.facts.glyphs.length).toBeGreaterThan(0);
    expect(res.v.some((x) => x.startsWith('style:') && x.includes('colour at alpha 0.1')), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG result: <body> at opacity 0.1', async ({ page }) => {
    const { expected, clean } = await cleanResult(page);
    await page.evaluate(() => { document.body.style.opacity = '0.1'; });
    const res = await proveDomParagraph(page, { expected });
    report('body at opacity 0.1', res.v);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.9 * clean.facts.glyphs.length));
  });

  test('NEG result: <body> blurred by 3 px', async ({ page }) => {
    const { expected, clean } = await cleanResult(page);
    await page.evaluate(() => { document.body.style.filter = 'blur(3px)'; });
    const res = await proveDomParagraph(page, { expected });
    report('body filter blur(3px)', res.v);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.5 * clean.facts.glyphs.length));
  });

  test('NEG result: a 50% outline of the card drawn over its inside', async ({ page }) => {
    const { expected, clean } = await cleanResult(page);
    await page.evaluate((t) => {
      const card = [...document.querySelectorAll('p')].find((e) => e.textContent === t).parentElement;
      const b = card.getBoundingClientRect(); const half = Math.ceil(Math.min(b.width, b.height) / 2);
      Object.assign(card.style, { outline: `${half}px solid rgba(0,0,0,0.5)`, outlineOffset: `${-half}px` });
    }, expected);
    const res = await proveDomParagraph(page, { expected });
    report('card outline (50%) drawn over the result body', res.v);
    expect(lowVisibility(res.v).length, JSON.stringify(res.v)).toBeGreaterThanOrEqual(Math.ceil(0.9 * clean.facts.glyphs.length));
  });

  test('CONTROL result: a legitimate ::before in the flow keeps the proof clean', async ({ page }) => {
    const { expected } = await cleanResult(page);
    await page.evaluate((t) => {
      const st = document.createElement('style'); st.textContent = 'p[data-tc-ctl]::before{content:"» "}';
      document.head.appendChild(st); [...document.querySelectorAll('p')].find((e) => e.textContent === t).dataset.tcCtl = '1';
    }, expected);
    const res = await proveDomParagraph(page, { expected });
    report('legitimate ::before in the flow (must stay clean)', res.v);
    expect(res.v).toEqual([]);
  });

  test('NEG avatar: a scaling transform around the canvas is reported as a setup problem', async ({ page }) => {
    const { expected } = await cleanAvatar(page);
    await page.evaluate(() => { document.querySelector('canvas').parentElement.style.transform = 'scale(0.97)'; });
    const res = await proveCanvasText(page, { expected, pick: pickAvatar(expected) });
    report('scale(0.97) on the canvas parent', res.v);
    expect(res.v.some((x) => x.startsWith('setup:') && x.includes('scale or rotate')), JSON.stringify(res.v)).toBe(true);
  });
});
