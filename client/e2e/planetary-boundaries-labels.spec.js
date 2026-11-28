// Check the nine boundary labels and the text drawn on each console's choice cards.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';

const SIZES = ['1920x1080', '1366x768', '1280x720', '1024x768', '844x390'];
const SHOTS = process.env.BOUNDARY_LABEL_SHOTS;
const ORDER = ['climate', 'biosphere', 'land', 'freshwater', 'biogeochemical', 'ocean', 'novel', 'aerosols', 'ozone'];
const CONSOLES = ['food', 'energy', 'transport', 'materials'];
// where a player stands to face each console (all walkable; see gameRoomData consoleTiles)
const STAND = { food: { col: 8, row: 2, dir: 3 }, energy: { col: 4, row: 6, dir: 2 }, transport: { col: 14, row: 6, dir: 3 }, materials: { col: 9, row: 12, dir: 1 } };
const CANVAS_W = 1280;
const CANVAS_H = 704;
const EPS = 0.5;
const hit = (a, b) => a.l < b.r - EPS && b.l < a.r - EPS && a.top < b.bot - EPS && b.top < a.bot - EPS;
const inside = (a, box) => a.l >= box.x0 - EPS && a.r <= box.x1 + EPS && a.top >= box.y0 - EPS && a.bot <= box.y1 + EPS;
const loc = (lang) => JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')).planetary;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function installRecorder(page) {
  await page.addInitScript(() => {
    window.__d = []; window.__p = []; window.__f = []; window.__neg = {}; let seq = 0; const P = CanvasRenderingContext2D.prototype;
    const H = (c) => c.canvas.__hidpi || { k: c.canvas.width / 1280, ox: 0, oy: 0 };
    const L = (c, x, y) => { const m = c.getTransform(); const k = H(c); return [((m.a * x + m.e) - k.ox) / k.k, ((m.d * y + m.f) - k.oy) / k.k]; };
    const oB = P.beginPath; P.beginPath = function b(...a) { this.__pts = []; return oB.apply(this, a); };
    for (const n of ['moveTo', 'lineTo']) { const o = P[n]; P[n] = function f(x, y) { (this.__pts ||= []).push(L(this, x, y)); return o.call(this, x, y); }; }
    const oQ = P.quadraticCurveTo; P.quadraticCurveTo = function q(a, b, x, y) { (this.__pts ||= []).push(L(this, x, y)); return oQ.call(this, a, b, x, y); };
    const BOX = { '#fff8e1': 'card', '#fffdf7': 'opt', '#e7f1ff': 'optSel' };
    const oF = P.fill; P.fill = function fl(...a) {
      const kind = BOX[String(this.fillStyle).toLowerCase()];
      if (window.__r && kind && this.__pts?.length) {
        const xs = this.__pts.map((q) => q[0]); const ys = this.__pts.map((q) => q[1]);
        window.__p.push({ seq: ++seq, kind, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
      }
      return oF.apply(this, a);
    };
    const oR = P.fillRect; P.fillRect = function fr(x, y, w2, h2) {
      if (window.__r && String(this.fillStyle).toLowerCase() === '#16213a') window.__f.push({ seq: ++seq });
      return oR.call(this, x, y, w2, h2);
    };
    const oT = P.fillText; P.fillText = function t(s, x, y, ...r) {
      const N = window.__neg || {}; const str = String(s);
      // ── negative-control faults (never set in the real tests) ──
      if (!this.__in) {
        if (N.skip && new RegExp(N.skip).test(str)) return undefined;
        if (N.affAtoB && /(bold|800) 11px/.test(this.font)) {
          const [lx] = L(this, x, y);
          if (lx < 640) { this.__in = true; const rr = t.call(this, s, x + 370, y, ...r); this.__in = false; return rr; }
        }
        if (N.addAff && new RegExp(N.addAff).test(str)) { this.__in = true; const f0 = this.font; this.font = "bold 11px 'Inter', system-ui, sans-serif"; t.call(this, N.affText, x - 250, y + 80); this.font = f0; this.__in = false; }
        if (N.overOn && new RegExp(N.overOn).test(str)) { this.__in = true; t.call(this, 'ΧΧΧΧ', x + 4, y + 3); this.__in = false; }
        if (N.ringWord && str === N.ringWord && /800 8\.5px/.test(this.font)) { this.__in = true; const rr = t.call(this, s, x + N.dx, y + N.dy, ...r); this.__in = false; return rr; }
      }
      if (window.__r && str.trim()) {
        const font = this.font;
        const kind = /800 8\.5px/.test(font) ? 'ring' : (/(bold|800) 11px/.test(font) ? 'aff' : (/^15px/.test(font) ? 'desc' : 'other'));
        const mt = this.measureText(str);
        const [ax, ay] = L(this, x, y);
        const [l] = L(this, x - mt.actualBoundingBoxLeft, y); const [r2] = L(this, x + mt.actualBoundingBoxRight, y);
        const [, top] = L(this, x, y - mt.actualBoundingBoxAscent); const [, bot] = L(this, x, y + mt.actualBoundingBoxDescent);
        window.__d.push({ seq: ++seq, kind, s: str, ax, ay, l, r: r2, top, bot });
      }
      return oT.call(this, s, x, y, ...r);
    };
  });
}

// one complete frame: everything drawn between the last two frame starts
async function grabFrame(page) {
  await page.evaluate(() => { window.__d = []; window.__p = []; window.__f = []; window.__r = true; });
  await page.waitForTimeout(250);
  const { d, p, f } = await page.evaluate(() => { window.__r = false; return { d: window.__d, p: window.__p, f: window.__f }; });
  const [s0, s1] = [f[f.length - 2].seq, f[f.length - 1].seq];
  return { d: d.filter((x) => x.seq > s0 && x.seq < s1), p: p.filter((x) => x.seq > s0 && x.seq < s1) };
}

// visible DOM controls (CSS px) and the logical→CSS mapping of the canvas
async function domContext(page) {
  return page.evaluate(() => {
    const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect();
    const k = cv.__hidpi || { k: cv.width / 1280, ox: 0, oy: 0 };
    const controls = [...document.querySelectorAll('button, [role="button"], a[href], input, select, textarea, [data-touch-control]')]
      .filter((e) => { const st = getComputedStyle(e); const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0; })
      .map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, top: b.top, bot: b.bottom, name: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 24) }; });
    return { rect: { left: r.left, top: r.top, sx: r.width / cv.width, sy: r.height / cv.height }, k: { k: k.k, ox: k.ox, oy: k.oy }, controls, vw: innerWidth, vh: innerHeight };
  });
}
const toCss = (t, ctx) => ({
  l: ctx.rect.left + (t.l * ctx.k.k + ctx.k.ox) * ctx.rect.sx, r: ctx.rect.left + (t.r * ctx.k.k + ctx.k.ox) * ctx.rect.sx,
  top: ctx.rect.top + (t.top * ctx.k.k + ctx.k.oy) * ctx.rect.sy, bot: ctx.rect.top + (t.bot * ctx.k.k + ctx.k.oy) * ctx.rect.sy,
});
function domViolations(texts, ctx) {
  const v = [];
  for (const t of texts) {
    const c = toCss(t, ctx);
    if (c.l < 0 || c.top < 0 || c.r > ctx.vw || c.bot > ctx.vh) v.push(`viewport: «${t.s}»`);
    for (const k of ctx.controls) if (c.l < k.r && k.l < c.r && c.top < k.bot && k.top < c.bot) v.push(`dom: «${t.s}» under «${k.name}»`);
  }
  return v;
}

// ── RING ──
function ringViolations(fr, labels) {
  const v = [];
  const ring = fr.d.filter((x) => x.kind === 'ring');
  const runs = [];
  // each label: its words drawn as one consecutive run (draw order), same centre x, top→down
  for (const [i, label] of labels.entries()) {
    const words = label.split(/\s+/);
    let found = null;
    for (let j = 0; j + words.length <= ring.length && !found; j++) {
      const run = ring.slice(j, j + words.length);
      if (run.every((x, n) => x.s === words[n])) found = run;
    }
    if (!found) { v.push(`ring-missing: «${label}»`); continue; }
    const cx = found[0].ax;
    if (found.some((x) => Math.abs(x.ax - cx) > 1)) v.push(`ring-column: «${label}»`);
    if (found.some((x, n) => n > 0 && x.ay <= found[n - 1].ay)) v.push(`ring-order: «${label}»`);
    runs.push({ i, label, x: cx, y: (found[0].ay + found[found.length - 1].ay) / 2, words: found });
  }
  if (runs.length === labels.length) {
    // ring centre = centroid of the nine label centres (they sit evenly on one circle)
    const c = { x: runs.reduce((a, q) => a + q.x, 0) / runs.length, y: runs.reduce((a, q) => a + q.y, 0) / runs.length };
    for (const q of runs) {
      const ang = (Math.atan2(q.y - c.y, q.x - c.x) * 180) / Math.PI;
      const want = -90 + (q.i + 0.5) * (360 / labels.length);
      const diff = ((ang - want + 540) % 360) - 180;
      if (Math.abs(diff) > 180 / labels.length) v.push(`ring-wedge: «${q.label}» at ${ang.toFixed(0)}° (wedge ${want.toFixed(0)}° ± 20°)`);
    }
  }
  const ringWords = runs.flatMap((q) => q.words.map((x) => ({ ...x, owner: q.i })));
  for (const a of ringWords) {
    if (a.l < 0 || a.r > CANVAS_W || a.top < 0 || a.bot > CANVAS_H) v.push(`ring-canvas: «${a.s}»`);
    for (const b of fr.d) {
      if (a.seq === b.seq) continue;
      const other = ringWords.find((x) => x.seq === b.seq);
      if (other && other.owner === a.owner) continue;
      if (hit(a, b)) v.push(`ring-overlap: «${a.s}» × «${b.s}»`);
    }
  }
  return { v, ringWords };
}

// ── CARD ──
function cardViolations(fr, exp, sel) {
  const v = [];
  const card = fr.p.filter((x) => x.kind === 'card').sort((a, b) => b.seq - a.seq)[0];
  if (!card) return { v: ['card-missing'], onCard: [] };
  if (card.x0 < 0 || card.x1 > CANVAS_W || card.y0 < 0 || card.y1 > CANVAS_H) v.push('card-canvas');
  const boxes = fr.p.filter((x) => x.seq > card.seq && (x.kind === 'opt' || x.kind === 'optSel')).sort((a, b) => a.x0 - b.x0);
  if (boxes.length !== 2) return { v: [...v, `boxes: ${boxes.length}`], onCard: [], card };
  if (sel === null) { if (boxes.some((b) => b.kind !== 'opt')) v.push('selected-box: a box is highlighted with nothing picked'); }
  else if (boxes[sel].kind !== 'optSel' || boxes[1 - sel].kind !== 'opt') v.push(`selected-box: sel=${sel}`);
  const onCard = fr.d.filter((x) => x.seq > card.seq);
  const used = new Set();
  const take = (pred) => { const xs = onCard.filter((x) => !used.has(x.seq) && pred(x)); xs.forEach((x) => used.add(x.seq)); return xs; };
  const one = (name, s, where) => { const xs = take((x) => x.s === s && (!where || inside(x, where))); if (xs.length !== 1) v.push(`${name}: ${xs.length}× «${s}»`); };
  one('question', exp.question, card);
  one('hint', exp.hint, card);
  for (const i of [0, 1]) {
    one(`title-${'AB'[i]}`, exp.titles[i], boxes[i]);
    const desc = take((x) => x.kind === 'desc' && inside(x, boxes[i])).sort((a, b) => a.ay - b.ay).map((x) => x.s.trim()).join(' ');
    if (desc !== exp.desc[i]) v.push(`desc-${'AB'[i]}: «${desc}» ≠ «${exp.desc[i]}»`);
    const aff = take((x) => x.kind === 'aff' && inside(x, boxes[i])).sort((a, b) => a.ay - b.ay).map((x) => x.s.trim()).join(' ');
    if (aff !== exp.affects[i]) v.push(`affects-${'AB'[i]}: «${aff}» ≠ «${exp.affects[i]}»`);
  }
  if (sel === null) { const bs = onCard.filter((x) => x.s === exp.badge); if (bs.length) v.push(`badge with nothing picked: ${bs.length}`); }
  else one('badge', exp.badge, boxes[sel]);
  for (const x of onCard) if (!used.has(x.seq)) v.push(`extra: «${x.s}»`);
  for (const x of onCard) if (!inside(x, card)) v.push(`card-inside: «${x.s}»`);
  for (let i = 0; i < onCard.length; i++) for (let j = i + 1; j < onCard.length; j++) if (hit(onCard[i], onCard[j])) v.push(`overlap: «${onCard[i].s}» × «${onCard[j].s}»`);
  return { v, onCard, card };
}

async function expectedCard(page, L, key) {
  const st = await page.evaluate((k) => {
    const s = document.querySelector('canvas')._stateRef.current; const c = s.consoles.find((q) => q.key === k);
    return { emoji: c.emoji, ids: c.options.map((o) => o.id), effects: c.options.map((o) => o.effects || {}) };
  }, key);
  const letter = (x) => L.option_label.replace('{{letter}}', x);
  return {
    question: `${st.emoji}  ${L[`q_${key}`]}`,
    hint: L.choose_hint,
    titles: [`←  ${letter('A')}`, `→  ${letter('B')}`],
    badge: `◆ ${L.selected}`,
    // Use the displayed order of the options for this console.
    desc: st.ids.map((id) => L[`${key}_${id.toLowerCase()}`]),
    ids: st.ids,
    // Boundary effects appear in feedback after the answer.
    affects: st.effects.map(() => ''),
  };
}

async function bootPlanetary(page, lang, sz) {
  const [w, h] = sz.split('x').map(Number);
  await page.setViewportSize({ width: w, height: h });
  await installRecorder(page);
  await bootMission(page, 'circular', 3, lang);
  for (let i = 0; i < 4; i++) {
    const intro = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro);
    if (!intro) break; await pressEnter(page); await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.irisOpenness >= 1, null, { timeout: 10_000 });
  await page.waitForTimeout(300);
}

async function openConsole(page, key) {
  await page.evaluate((st) => {
    const p = document.querySelector('canvas')._stateRef.current.player;
    p.col = st.col; p.row = st.row; p.pixelX = st.col * 32; p.pixelY = st.row * 32;
    p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY; p.moving = false; p.dir = st.dir;
  }, STAND[key]);
  await page.waitForFunction((k) => document.querySelector('canvas')._stateRef.current.facingConsoleKey === k, key, { timeout: 5_000 });
  await pressEnter(page);
  await page.waitForFunction((k) => document.querySelector('canvas')._stateRef.current.choice?.consoleKey === k, key, { timeout: 5_000 });
  await page.waitForTimeout(250);
}

for (const sz of SIZES) for (const lang of ['el', 'en', 'nl', 'pt']) {
  test(`ring + cards ${lang} ${sz}`, async ({ page }) => {
    await bootPlanetary(page, lang, sz);
    const L = loc(lang);
    const labels = ORDER.map((k) => L[`bs_${k}`]);
    expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.boundaries.map((b) => b.short)), 'state labels = locale').toEqual(labels);

    const cv = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight }; });
    expect(cv.l >= -1 && cv.t >= -1 && cv.r <= cv.vw + 1 && cv.b <= cv.vh + 1, `canvasInView ${JSON.stringify(cv)}`).toBe(true);

    const ring = ringViolations(await grabFrame(page), labels);
    expect(ring.v, 'ring').toEqual([]);
    expect(domViolations(ring.ringWords, await domContext(page)), 'ring vs DOM / viewport').toEqual([]);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${lang}_${sz}_ring.png` }); }

    const metrics = [];
    for (const key of CONSOLES) {
      await openConsole(page, key);
      const exp = await expectedCard(page, L, key);
      // Check both selections and the initial state with no selection.
      for (const sel of [null, 1, 0]) {
        if (sel !== null) {
          const key2 = sel === 0 ? 'ArrowLeft' : 'ArrowRight';
          await page.keyboard.down(key2); await page.waitForTimeout(90); await page.keyboard.up(key2);
          await page.waitForFunction((v) => document.querySelector('canvas')._stateRef.current.choice?.sel === v, sel, { timeout: 5_000 });
          await page.waitForTimeout(150);
        } else {
          expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.choice.sel), 'opens with nothing picked').toBeNull();
        }
        const res = cardViolations(await grabFrame(page), exp, sel);
        const tag = sel === null ? 'none' : 'LR'[sel];
        expect(res.v, `${key} sel=${tag}`).toEqual([]);
        expect(domViolations(res.onCard, await domContext(page)), `${key} sel=${tag} vs DOM / viewport`).toEqual([]);
        if (sel === null) metrics.push({ key, cardH: Math.round(res.card.y1 - res.card.y0), texts: res.onCard.length });
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${lang}_${sz}_${key}.png` });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.choice === null, null, { timeout: 5_000 });
    }
    expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.choicesMade), 'nothing chosen').toBe(0);
    test.info().annotations.push({ type: 'metrics', description: JSON.stringify({ lang, sz, ringWords: ring.ringWords.length, cards: metrics }) });
  });
}

// ── NEGATIVE CONTROLS: each injected fault must be reported by the same check functions ──
test.describe('negative controls (each fault must be caught)', () => {
  const report = (name, v) => {
    fs.writeFileSync(test.info().outputPath('negative-control.txt'), `${name}\n${v.join('\n')}\n`);
    test.info().annotations.push({ type: 'caught', description: `${name}: ${v.slice(0, 3).join(' | ')}` });
    console.log(`NEG ${name}: ${v.length} violation(s): ${v.slice(0, 3).join(' | ')}`);
  };
  const CASES = [
    { name: 'question removed', neg: (L) => ({ skip: esc(L.q_food) }), expect: /^question: 0×/ },
    { name: 'first line of the high-impact description removed', neg: (L) => ({ skip: `^${esc(L.food_a.split(' ').slice(0, 3).join(' '))}` }), expect: /^desc-/ },
    { name: 'an «Affects» line drawn on the card again', neg: (L) => ({ addAff: esc(L.q_food), affText: `${L.affects} ${L.bs_climate}` }), expect: /^affects-A|^extra/ },
    { name: 'text drawn over the question', neg: (L) => ({ overOn: esc(L.q_food) }), expect: /^overlap|^extra/ },
  ];
  for (const c of CASES) {
    test(`NEG card: ${c.name}`, async ({ page }) => {
      await bootPlanetary(page, 'el', '1366x768');
      const L = loc('el');
      await page.evaluate((n) => { window.__neg = n; }, c.neg(L));
      await openConsole(page, 'food');
      const res = cardViolations(await grabFrame(page), await expectedCard(page, L, 'food'), null);
      report(c.name, res.v);
      expect(res.v.some((x) => c.expect.test(x)), `caught: ${JSON.stringify(res.v)}`).toBe(true);
    });
  }

  test('NEG ring: a label moved into another wedge', async ({ page }) => {
    await bootPlanetary(page, 'el', '1366x768');
    const L = loc('el');
    // move the one-word label of «climate» (wedge 0, at the top) down across the ring
    await page.evaluate((w) => { window.__neg = { ringWord: w, dx: 0, dy: 150 }; }, L.bs_climate);
    const ring = ringViolations(await grabFrame(page), ORDER.map((k) => L[`bs_${k}`]));
    report('ring label in another wedge', ring.v);
    expect(ring.v.some((x) => x.startsWith(`ring-wedge: «${L.bs_climate}»`)), `caught: ${JSON.stringify(ring.v)}`).toBe(true);
  });

  test('NEG DOM: a 3 px control between sampled points of a card text', async ({ page }) => {
    await bootPlanetary(page, 'el', '1366x768');
    const L = loc('el');
    await openConsole(page, 'food');
    const res = cardViolations(await grabFrame(page), await expectedCard(page, L, 'food'), null);
    expect(res.v).toEqual([]);
    const hint = res.onCard.find((x) => x.s === L.choose_hint);
    const c = toCss(hint, await domContext(page));
    // 3 px wide control at 37 % of the hint width (between 1/4-spaced samples), on the descender band
    await page.evaluate((r) => { const b = document.createElement('button'); b.textContent = ''; Object.assign(b.style, { position: 'fixed', left: `${r.x}px`, top: `${r.y}px`, width: '3px', height: '3px', padding: 0, border: 0, zIndex: 99 }); b.setAttribute('aria-label', 'neg'); document.body.appendChild(b); },
      { x: c.l + (c.r - c.l) * 0.37, y: c.bot - 2 });
    const v = domViolations(res.onCard, await domContext(page));
    report('DOM control between samples', v);
    expect(v.some((x) => x.startsWith(`dom: «${L.choose_hint}» under «neg»`)), `caught: ${JSON.stringify(v)}`).toBe(true);
  });
});
