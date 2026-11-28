// Compare the carried item's drawn bounds with each bin label during approach and delivery.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission } from './helpers.js';

const OUT = process.env.HELD_SHOTS || ''; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const BINS = ['compost', 'plastic', 'carton', 'aluminium', 'battery'];
const BIN_COLS = { compost: [3, 4], plastic: [6, 7], carton: [9, 10], aluminium: [12, 13], battery: [15, 16] }; // gameRoomData.js
const MILK_FILLS = ['#eceff1', '#f5f5f5', '#cfd8dc', '#fafafa', '#b0bec5', '#1e6fd9', '#1857ad']; // itemGlyphs.js SHAPES

async function recorder(page) {
  await page.addInitScript((MILK) => {
    window.__ev = []; window.__rec = false; window.__frame = 0;
    const P = CanvasRenderingContext2D.prototype;
    const tx = (ctx, x, y) => { const m = ctx.getTransform(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; };
    const oFR = P.fillRect;
    P.fillRect = function (x, y, w, h) {
      if (x === 0 && y === 0 && w === 1280 && h === 704) { // CompostCreator render() starts with the full-canvas fill
        window.__frame += 1;
        if (window.__rec) window.__ev.push({ k: 'frame', f: window.__frame, cw: this.canvas.width, ch: this.canvas.height, hk: this.canvas.__hidpi?.k ?? 1 });
      }
      return oFR.call(this, x, y, w, h);
    };
    const oFT = P.fillText;
    P.fillText = function (s, x, y, ...r) {
      if (window.__rec) {
        const m = this.getTransform(); const mt = this.measureText(String(s));
        window.__ev.push({ k: 'text', f: window.__frame, s: String(s), font: this.font,
          l: m.a * (x - mt.actualBoundingBoxLeft) + m.e, r: m.a * (x + mt.actualBoundingBoxRight) + m.e,
          t: m.d * (y - mt.actualBoundingBoxAscent) + m.f, b: m.d * (y + mt.actualBoundingBoxDescent) + m.f });
      }
      return oFT.call(this, s, x, y, ...r);
    };
    const oBP = P.beginPath; P.beginPath = function () { this.__pts = []; return oBP.call(this); };
    const oMT = P.moveTo; P.moveTo = function (x, y) { (this.__pts ||= []).push(tx(this, x, y)); return oMT.call(this, x, y); };
    const oLT = P.lineTo; P.lineTo = function (x, y) { (this.__pts ||= []).push(tx(this, x, y)); return oLT.call(this, x, y); };
    const oF = P.fill;
    P.fill = function (...a) {
      if (window.__rec && typeof this.fillStyle === 'string' && MILK.includes(this.fillStyle.toLowerCase()) && this.__pts?.length >= 3) {
        const xs = this.__pts.map((p) => p[0]); const ys = this.__pts.map((p) => p[1]);
        window.__ev.push({ k: 'milk', f: window.__frame, fill: this.fillStyle.toLowerCase(),
          l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) });
      }
      return oF.apply(this, a);
    };
  }, MILK_FILLS);
}
async function record(page, ms) {
  await page.evaluate(() => { window.__ev = []; window.__rec = true; });
  await page.waitForTimeout(ms);
  return page.evaluate(() => { window.__rec = false; return window.__ev; });
}
async function press(page, key = 'Enter') { await page.keyboard.down(key); await page.waitForTimeout(140); await page.keyboard.up(key); await page.waitForTimeout(80); }
const S = (page, fn, arg) => page.evaluate(fn, arg);
async function place(page, col, row) {
  await S(page, ([c, r]) => {
    const p = document.querySelector('canvas')._stateRef.current.player;
    p.col = c; p.row = r; p.pixelX = c * 32; p.pixelY = r * 32; p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 1;
  }, [col, row]);
  await page.waitForTimeout(150);
}
const overlap = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
const norm = (s) => s.replace(/­/g, '');

/** The bin label lines of one frame, matched against the 5 locale labels in draw order. */
function labelLines(frameEv, labels) {
  const flat = labels.map(norm);
  const cand = frameEv.filter((e) => e.k === 'text' && /bold/.test(e.font)
    && flat.some((L) => { const s = norm(e.s).replace(/-$/, ''); return s.length >= 2 && L.includes(s); }));
  const out = []; let i = 0;
  for (const L of flat) {
    let found = null;
    for (; i < cand.length && !found; i++) {
      const one = norm(cand[i].s);
      if (one === L) { found = [cand[i]]; break; }
      const two = cand[i + 1] && (one.endsWith('-') ? one.slice(0, -1) + norm(cand[i + 1].s) : `${one} ${norm(cand[i + 1].s)}`);
      if (two === L) { found = [cand[i], cand[i + 1]]; i += 1; break; }
    }
    i += 1;
    out.push({ label: L, lines: found });
  }
  return out;
}
function heldBoxes(frameEv, id) {
  if (id === 'juice_box') return frameEv.filter((e) => e.k === 'text' && e.s === '🧃' && /^18px/.test(e.font));
  const polys = frameEv.filter((e) => e.k === 'milk');
  if (!polys.length) return [];
  return [{ polys: polys.length, fills: new Set(polys.map((p) => p.fill)).size,
    l: Math.min(...polys.map((p) => p.l)), r: Math.max(...polys.map((p) => p.r)),
    t: Math.min(...polys.map((p) => p.t)), b: Math.max(...polys.map((p) => p.b)) }];
}
/** Check every complete frame in a recording; returns how many frames were checked. */
// Frames come from their own start markers (P3, 08/10): a frame that draws
// nothing at all is still checked — and fails. The last marker may be partial.
function checkFrames(ev, id, labels, tag) {
  const marks = ev.filter((e) => e.k === 'frame');
  const frames = marks.slice(0, -1);
  expect(frames.length, `${tag}: complete frames recorded`).toBeGreaterThan(0);
  for (const fm of frames) {
    const f = fm.f;
    const fe = ev.filter((e) => e.f === f && e.k !== 'frame');
    const ll = labelLines(fe, labels);
    for (const x of ll) expect(x.lines, `${tag} frame ${f}: label «${x.label}» drawn whole`).toBeTruthy();
    const held = heldBoxes(fe, id);
    expect(held.length, `${tag} frame ${f}: held ${id} drawn`).toBeGreaterThan(0);
    if (id === 'milk_carton') {
      expect(held[0].polys, `${tag} frame ${f}: milk icon = 7 polygons`).toBe(7);
      expect(held[0].fills, `${tag}: all 7 milk colours`).toBe(7);
    }
    // P2 (08/10): the held box must be real and visible — finite, inside the
    // canvas, and about the drawn size (18 px item × room zoom 1.5 × HiDPI k).
    const unit = 18 * 1.5 * fm.hk;
    for (const h of held) {
      const w = h.r - h.l; const hh = h.b - h.t;
      expect([h.l, h.r, h.t, h.b].every(Number.isFinite), `${tag} frame ${f}: held box finite`).toBe(true);
      expect(h.l >= 0 && h.t >= 0 && h.r <= fm.cw && h.b <= fm.ch, `${tag} frame ${f}: held box inside the canvas`).toBe(true);
      expect(hh, `${tag} frame ${f}: held height ≈ item size`).toBeGreaterThan(0.6 * unit);
      expect(hh, `${tag} frame ${f}: held height ≈ item size`).toBeLessThan(1.4 * unit);
      expect(w, `${tag} frame ${f}: held width ≈ item size`).toBeGreaterThan(0.4 * unit);
      expect(w, `${tag} frame ${f}: held width ≈ item size`).toBeLessThan(1.4 * unit);
    }
    for (const h of held) for (const x of ll) for (const ln of x.lines) {
      expect(overlap(h, ln), `${tag} frame ${f}: held ${id} covers «${ln.s}»`).toBe(false);
    }
  }
  return frames.length;
}

const CASES = [
  ...['el', 'en', 'nl', 'pt'].map((lang) => ({ lang, size: { width: 1366, height: 768 } })),
  ...['el', 'en'].map((lang) => ({ lang, size: { width: 1024, height: 768 } })),
];
for (const { lang, size } of CASES) {
  test(`held item clear of bin labels — ${lang} ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(size);
    await recorder(page);
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) {
      await bootMission(page, 'circular', 1, lang);
      ok = await S(page, () => ['milk_carton', 'juice_box'].every((id) => document.querySelector('canvas')._stateRef.current.counterItems.some((x) => x.id === id)));
    }
    expect(ok, 'milk + juice on the stumps').toBe(true);
    await press(page);
    await page.waitForFunction(() => { const s = document.querySelector('canvas')._stateRef.current; return !s.showMissionIntro && s.irisOpenness >= 1; });
    const loc = JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'));
    const labels = BINS.map((b) => String(loc.compost[`bin_label_${b}`]));

    for (const id of ['juice_box', 'milk_carton']) {
      const it = await S(page, (iid) => { const c = document.querySelector('canvas')._stateRef.current.counterItems.find((x) => x.id === iid); return { col: c.col, row: c.row }; }, id);
      await place(page, it.col, it.row + 1);
      await page.waitForFunction(() => Boolean(document.querySelector('canvas')._stateRef.current.actionPrompt));
      await press(page);
      await page.waitForFunction((iid) => document.querySelector('canvas')._stateRef.current.heldItem?.id === iid, id);

      // 1. standing under both columns of every bin, before Enter
      for (const bin of BINS) for (const col of BIN_COLS[bin]) {
        await place(page, col, 4);
        const held = await S(page, () => document.querySelector('canvas')._stateRef.current.heldItem?.id);
        expect(held, 'still carrying (no Enter pressed)').toBe(id);
        checkFrames(await record(page, 260), id, labels, `${lang} ${size.width} ${id} ${bin} col ${col}`);
        if (OUT && bin === 'carton' && col === 9) await page.screenshot({ path: `${OUT}/${lang}_${size.width}_${id}_under_carton.png` });
      }
      // 2. walking up from two tiles below the carton bin: every frame, in-between pixel rows
      await place(page, 9, 6);
      await page.evaluate(() => { window.__ev = []; window.__rec = true; });
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(() => { const p = document.querySelector('canvas')._stateRef.current.player; return p.row === 4 && !p.moving; }, null, { timeout: 5000 });
      await page.keyboard.up('ArrowUp');
      await page.waitForTimeout(200);
      const walk = await page.evaluate(() => { window.__rec = false; return window.__ev; });
      const n = checkFrames(walk, id, labels, `${lang} ${size.width} ${id} walking up`);
      expect(n, 'several frames while walking').toBeGreaterThan(3);
      const end = await S(page, () => { const s = document.querySelector('canvas')._stateRef.current; return { row: s.player.row, held: s.heldItem?.id }; });
      expect(end).toEqual({ row: 4, held: id });

      // put it back (Q) before the next item
      await press(page, 'q');
      if (await S(page, () => document.querySelector('canvas')._stateRef.current.heldItem?.id)) await press(page, 'q');
    }
  });
}
