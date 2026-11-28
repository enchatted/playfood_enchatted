// Speak to the Engineer after all three missions and check the completed-island message.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const SIZES = ['1920x1080', '1366x768', '1280x720', '1024x768', '844x390'];
const SHOTS = process.env.I4_SHOTS;
const EPS = 0.5;
const hit = (a, b) => a.l < b.r - EPS && b.l < a.r - EPS && a.top < b.bot - EPS && b.top < a.bot - EPS;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function openMentor(page, lang, sz) {
  const [w, h] = sz.split('x').map(Number);
  await page.setViewportSize({ width: w, height: h });
  await page.addInitScript(() => {
    window.__d = []; window.__m = []; window.__neg = {}; let seq = 0; const P = CanvasRenderingContext2D.prototype; const o = P.fillText;
    P.fillText = function f(t, x, y, ...r) {
      const N = window.__neg || {}; const str = String(t);
      if (!this.__in) {
        if (N.skip && new RegExp(N.skip).test(str)) return undefined;
        if (N.overOn && new RegExp(N.overOn).test(str)) { this.__in = true; f.call(this, 'ΧΧΧ', x + 10, y + 3); this.__in = false; }
      }
      if (window.__r && str.trim()) {
        // full glyph ink box in canvas pixels
        const m = this.getTransform(); const mt = this.measureText(str);
        window.__d.push({ seq: ++seq, s: str, ay: m.d * y + m.f,
          l: m.a * (x - mt.actualBoundingBoxLeft) + m.e, r: m.a * (x + mt.actualBoundingBoxRight) + m.e,
          top: m.d * (y - mt.actualBoundingBoxAscent) + m.f, bot: m.d * (y + mt.actualBoundingBoxDescent) + m.f });
      }
      return o.call(this, t, x, y, ...r);
    };
    // the dialog starts with a full-canvas dim layer: its texts are the ones drawn after it
    const oR = P.fillRect; P.fillRect = function fr(x, y, w2, h2) {
      if (window.__r && String(this.fillStyle).replace(/\s/g, '') === 'rgba(0,0,0,0.36)') { const m = this.getTransform(); window.__m.push({ seq: ++seq, a: m.a, d: m.d, e: m.e, f: m.f }); }
      return oR.call(this, x, y, w2, h2);
    };
  });
  await page.goto(`/?testMode=1&lang=${lang}`);
  await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const s = window.__playfood.state(); s.resetProgress(); s.setHero('braid');
    for (const id of [1, 2, 3]) s.addCompletedMission('circular', id);
    s.markCeremonySeen('circular'); s.markReflectionSeen?.('circular');
    window.__playfood.goToIsland('circular');
  });
  await page.waitForFunction(() => window.__playfood.screen() === 'island' && !!document.querySelector('canvas')?._stateRef?.current?.player, null, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) {
    const busy = await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; return !!(s.mentorDialog || s.reflection || s.ceremony); });
    if (!busy) break; await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  }
  // stand left of the Engineer (col 5,row 10), facing right, and talk with a real Enter
  await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; const p = s.player; p.col = 4; p.row = 10; p.pixelX = 4 * 32; p.pixelY = 10 * 32; p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY; p.moving = false; p.dir = 3; });
  await page.waitForTimeout(400);
  await page.keyboard.down('Enter'); await page.waitForTimeout(80); await page.keyboard.up('Enter');
  await page.waitForTimeout(500);
}

// one frame of the dialog: texts drawn after the LAST dim layer, plus panel/canvas geometry
async function grabDialog(page) {
  await page.evaluate(() => { window.__d = []; window.__m = []; window.__r = true; });
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    window.__r = false;
    const cv = document.querySelector('canvas'); const s = cv._stateRef.current; const mk = window.__m[window.__m.length - 1];
    const lay = s.mentorDialogLayout;
    return {
      texts: mk ? window.__d.filter((d) => d.seq > mk.seq) : [],
      panel: mk && lay ? { x0: mk.a * lay.x + mk.e, x1: mk.a * (lay.x + lay.width) + mk.e, y0: mk.d * lay.y + mk.f, y1: mk.d * (lay.y + lay.height) + mk.f } : null,
      canvas: { w: cv.width, h: cv.height },
      text: s.mentorDialog?.text || null, name: s.strings?.mentorName || '',
    };
  });
}

function dialogViolations(dlg, L) {
  const v = [];
  if (!dlg.panel) return ['panel-missing'];
  const p = dlg.panel;
  if (p.x0 < -EPS || p.y0 < -EPS || p.x1 > dlg.canvas.w + EPS || p.y1 > dlg.canvas.h + EPS) v.push('panel-canvas');
  const texts = dlg.texts;
  const used = new Set();
  const one = (name, s) => { const xs = texts.filter((x) => !used.has(x.seq) && x.s === s); xs.forEach((x) => used.add(x.seq)); if (xs.length !== 1) v.push(`${name}: ${xs.length}× «${s}»`); };
  if (dlg.name) one('name', dlg.name);
  one('continue', `⏎ ${L.dialog_continue}`);
  const body = texts.filter((x) => !used.has(x.seq)).sort((a, b) => a.ay - b.ay || a.l - b.l);
  const joined = body.map((x) => x.s.trim()).join(' ');
  if (joined !== L.mentor_done_circular) v.push(`body: «${joined}» ≠ «${L.mentor_done_circular}»`);
  for (const x of texts) if (x.l < p.x0 - EPS || x.r > p.x1 + EPS || x.top < p.y0 - EPS || x.bot > p.y1 + EPS) v.push(`panel-inside: «${x.s}»`);
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) if (hit(texts[i], texts[j])) v.push(`overlap: «${texts[i].s}» × «${texts[j].s}»`);
  return { v, body };
}

async function domContext(page) {
  return page.evaluate(() => {
    const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect();
    const controls = [...document.querySelectorAll('button, [role="button"], a[href], input, select, textarea, [data-touch-control]')]
      .filter((e) => { const st = getComputedStyle(e); const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0; })
      .map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, top: b.top, bot: b.bottom, name: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 24) }; });
    return { left: r.left, top: r.top, sx: r.width / cv.width, sy: r.height / cv.height, controls, vw: innerWidth, vh: innerHeight,
      canvasRect: { l: r.left, t: r.top, r: r.right, b: r.bottom } };
  });
}
const toCss = (t, c) => ({ l: c.left + t.l * c.sx, r: c.left + t.r * c.sx, top: c.top + t.top * c.sy, bot: c.top + t.bot * c.sy });
function domViolations(texts, c) {
  const v = [];
  for (const t of texts) {
    const q = toCss(t, c);
    if (q.l < 0 || q.top < 0 || q.r > c.vw || q.bot > c.vh) v.push(`viewport: «${t.s}»`);
    for (const k of c.controls) if (q.l < k.r && k.l < q.r && q.top < k.bot && k.top < q.bot) v.push(`dom: «${t.s}» under «${k.name}»`);
  }
  return v;
}

for (const sz of SIZES) for (const lang of ['el', 'en', 'nl', 'pt']) {
  test(`Island 4 mentor done ${lang} ${sz}`, async ({ page }) => {
    await openMentor(page, lang, sz);
    const L = JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')).island;
    const dlg = await grabDialog(page);
    expect(dlg.text).toBe(L.mentor_done_circular);
    const res = dialogViolations(dlg, L);
    expect(res.v, 'dialog').toEqual([]);
    const c = await domContext(page);
    const cr = c.canvasRect;
    expect(cr.l >= -1 && cr.t >= -1 && cr.r <= c.vw + 1 && cr.b <= c.vh + 1, `canvasInView ${JSON.stringify(cr)}`).toBe(true);
    expect(domViolations(dlg.texts, c), 'dialog texts vs DOM controls / viewport').toEqual([]);
    test.info().annotations.push({ type: 'metrics', description: JSON.stringify({ lang, sz, bodyLines: res.body.length, dialogTexts: dlg.texts.length, controls: c.controls.length }) });
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${lang}_${sz}.png` }); }
  });
}

// ── NEGATIVE CONTROLS: each injected fault must be reported by the same check functions ──
test.describe('negative controls (each fault must be caught)', () => {
  const report = (name, v) => {
    fs.writeFileSync(test.info().outputPath('negative-control.txt'), `${name}\n${v.join('\n')}\n`);
    test.info().annotations.push({ type: 'caught', description: `${name}: ${v.slice(0, 3).join(' | ')}` });
    console.log(`NEG ${name}: ${v.length} violation(s): ${v.slice(0, 3).join(' | ')}`);
  };
  const L = JSON.parse(fs.readFileSync('src/i18n/locales/el.json', 'utf8')).island;

  test('NEG text drawn over the mentor name', async ({ page }) => {
    await openMentor(page, 'el', '1366x768');
    const name = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.strings?.mentorName || '');
    await page.evaluate((n) => { window.__neg = { overOn: n }; }, `^${esc(name)}$`);
    const res = dialogViolations(await grabDialog(page), L);
    report('text over the name', res.v);
    expect(res.v.some((x) => x.startsWith('overlap:') && x.includes(name)), JSON.stringify(res.v)).toBe(true);
  });

  test('NEG last body line removed', async ({ page }) => {
    await openMentor(page, 'el', '1366x768');
    const first = await grabDialog(page);
    const body = dialogViolations(first, L).body;
    await page.evaluate((s) => { window.__neg = { skip: s }; }, `^${esc(body[body.length - 1].s)}$`);
    const res = dialogViolations(await grabDialog(page), L);
    report('last body line removed', res.v);
    expect(res.v.some((x) => x.startsWith('body:')), JSON.stringify(res.v)).toBe(true);
  });

  for (const c of [
    { name: '3 px control between the old sample points of «Continue»', pick: (dlg) => dlg.texts.find((x) => x.s === `⏎ ${L.dialog_continue}`), at: (q) => ({ x: q.l + (q.r - q.l) * 0.37, y: (q.top + q.bot) / 2 - 1, w: 3, h: 3 }) },
    { name: '2 px control on the descender edge of the last body line', pick: (dlg) => dialogViolations(dlg, L).body.slice(-1)[0], at: (q) => ({ x: q.l + (q.r - q.l) * 0.62, y: q.bot - 1.5, w: 2, h: 2 }) },
  ]) {
    test(`NEG DOM: ${c.name}`, async ({ page }) => {
      await openMentor(page, 'el', '1366x768');
      const dlg = await grabDialog(page);
      const ctx = await domContext(page);
      expect(domViolations(dlg.texts, ctx)).toEqual([]);
      const target = c.pick(dlg);
      const box = c.at(toCss(target, ctx));
      await page.evaluate((b) => { const e = document.createElement('button'); e.setAttribute('aria-label', 'neg'); Object.assign(e.style, { position: 'fixed', left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, padding: 0, border: 0, zIndex: 99 }); document.body.appendChild(e); }, box);
      const v = domViolations(dlg.texts, await domContext(page));
      report(c.name, v);
      expect(v.some((x) => x.startsWith(`dom: «${target.s}» under «neg»`)), JSON.stringify(v)).toBe(true);
    });
  }
});
