// Check that the clothing rule fits the introduction and gives the correct feedback for both garments.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';

const LANGS = (process.env.CLOTHES_LANGS || 'el,en,nl,pt').split(',');
const SIZES = (process.env.CLOTHES_SIZES || '1920x1080,1366x768,1280x720,1024x768,844x390').split(',')
  .map((s) => { const [width, height] = s.split('x').map(Number); return { width, height }; });
const BASELINE = !!process.env.CLOTHES_BASELINE;
const SHOTS = process.env.CLOTHES_SHOTS;
const LOC = Object.fromEntries(['el', 'en', 'nl', 'pt'].map((l) => [l, JSON.parse(fs.readFileSync(`src/i18n/locales/${l}.json`, 'utf8'))]));

async function recorder(page) {
  await page.addInitScript(() => {
    window.__drawn = []; window.__panels = [];
    const P = CanvasRenderingContext2D.prototype;
    const toL = (ctx, x, y) => { const m = ctx.getTransform(); const h = ctx.canvas.__hidpi || { k: ctx.canvas.width / 1280, ox: 0, oy: 0 }; return [((m.a * x + m.c * y + m.e) - h.ox) / h.k, ((m.b * x + m.d * y + m.f) - h.oy) / h.k]; };
    const oBegin = P.beginPath; P.beginPath = function b(...a) { this.__pts = []; return oBegin.apply(this, a); };
    for (const name of ['moveTo', 'lineTo']) { const o = P[name]; P[name] = function f(x, y) { (this.__pts ||= []).push(toL(this, x, y)); return o.call(this, x, y); }; }
    const oQ = P.quadraticCurveTo; P.quadraticCurveTo = function q(cx, cy, x, y) { (this.__pts ||= []).push(toL(this, x, y)); return oQ.call(this, cx, cy, x, y); };
    const oFill = P.fill; P.fill = function fl(...a) {
      // #FFF8E1 = intro card; rgba(255,248,225,0.98) = the reveal ("Did you know?") card
      const fsS = String(this.fillStyle).toLowerCase().replace(/\s+/g, '');
      const kind = fsS === '#fff8e1' ? 'intro' : (fsS.startsWith('rgba(255,248,225,0.98') ? 'reveal' : null);
      if (window.__rec && kind && this.__pts?.length) {
        const xs = this.__pts.map((q) => q[0]); const ys = this.__pts.map((q) => q[1]);
        window.__panels.push({ kind, seq: (window.__seq = (window.__seq || 0) + 1), x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
      }
      return oFill.apply(this, a);
    };
    const orig = P.fillText;
    P.fillText = function patched(text, x, y, ...rest) {
      if (window.__rec) {
        const m = this.getTransform(); const w = this.measureText(String(text)).width;
        const left = this.textAlign === 'center' ? x - w / 2 : (this.textAlign === 'right' ? x - w : x);
        const h = this.canvas.__hidpi || { k: this.canvas.width / 1280, ox: 0, oy: 0 };
        window.__drawn.push({ seq: (window.__seq = (window.__seq || 0) + 1), s: String(text), l: ((m.a * left + m.e) - h.ox) / h.k, r: ((m.a * (left + w) + m.e) - h.ox) / h.k, y: ((m.d * y + m.f) - h.oy) / h.k });
      }
      return orig.call(this, text, x, y, ...rest);
    };
  });
}
async function record(page, ms = 350) {
  await page.evaluate(() => { window.__drawn = []; window.__panels = []; window.__rec = true; });
  await page.waitForTimeout(ms);
  return page.evaluate(() => { window.__rec = false; return { drawn: window.__drawn, panels: window.__panels }; });
}
function frameLines(drawn) {
  const seen = new Map();
  for (const d of drawn) seen.set(`${d.s}|${Math.round(d.l)}|${Math.round(d.y)}`, d);
  return [...seen.values()].sort((a, b) => a.y - b.y || a.l - b.l);
}
async function cssRectOfLogical(page, r) {
  return page.evaluate((q) => {
    const cv = document.querySelector('canvas'); const rect = cv.getBoundingClientRect();
    const h = cv.__hidpi; const dpr = cv.width / rect.width;
    const f = (x, y) => (h ? { x: rect.left + (x * h.k + h.ox) / dpr, y: rect.top + (y * h.k + h.oy) / dpr }
      : { x: rect.left + x * rect.width / 1280, y: rect.top + y * rect.height / 704 });
    const a = f(q.l, q.t); const b = f(q.r, q.b);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  }, r);
}
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// ── 1) Intro card ──────────────────────────────────────────────────────────────
if (!BASELINE) for (const lang of LANGS) for (const size of SIZES) {
  test(`4.2 clothes intro ${lang} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await recorder(page);
    await bootMission(page, 'circular', 2, lang);
    await page.waitForTimeout(600);
    const { drawn, panels } = await record(page);
    expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro)).toBe(true);
    const panel = panels.filter((q) => q.kind === 'intro').sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
    expect(panel, 'intro card panel').toBeTruthy();
    expect(panel.y0).toBeGreaterThanOrEqual(0); expect(panel.y1).toBeLessThanOrEqual(704);
    const lines = frameLines(drawn);
    const i2 = lines.findIndex((d) => d.s.startsWith('2.'));
    const i3 = lines.findIndex((d) => d.s.startsWith('3.'));
    expect(i2).toBeGreaterThanOrEqual(0); expect(i3).toBeGreaterThan(i2);
    const step2 = lines.slice(i2, i3).filter((d) => Math.abs(d.l - lines[i2].l) < 2);
    const joined = step2.map((d) => d.s).join(' ').replace(/\s+/g, ' ').trim();
    expect(joined).toBe(`2. ${LOC[lang].missionIntro.circularcity.step2}`.replace(/\s+/g, ' ').trim());
    for (const d of step2) {
      expect(d.l, `x ${d.s.slice(0, 20)}`).toBeGreaterThanOrEqual(panel.x0);
      expect(d.r, `x ${d.s.slice(0, 20)}`).toBeLessThanOrEqual(panel.x1);
      expect(d.y - 9, `y ${d.s.slice(0, 20)}`).toBeGreaterThanOrEqual(panel.y0);
      expect(d.y + 9, `y ${d.s.slice(0, 20)}`).toBeLessThanOrEqual(panel.y1);
    }
    // what follows step 2 in the card (step 3, the fact line and its source chip) stays inside it
    // EN uses the data file's plain sentence (no locale entry)
    const fact = LOC[lang].circularcity.facts?.intro || 'There are ten ways to keep a thing in use instead of throwing it away.';
    const factLines = lines.filter((d) => d.s.length > 3 && fact.includes(d.s.trim()));
    expect(factLines.length, 'fact line drawn').toBeGreaterThan(0);
    for (const d of [...factLines, lines[i3]]) { expect(d.y + 9).toBeLessThanOrEqual(panel.y1); expect(d.y).toBeGreaterThan(step2[step2.length - 1].y); }
    const chip = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.introSourceRect);
    expect(chip).toBeTruthy();
    expect(chip.y + chip.height).toBeLessThanOrEqual(panel.y1); expect(chip.x).toBeGreaterThanOrEqual(panel.x0); expect(chip.x + chip.width).toBeLessThanOrEqual(panel.x1);
    test.info().annotations.push({ type: 'metrics', description: JSON.stringify({ lang, size, step2Lines: step2.length, panel }) });
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${lang}_${size.width}x${size.height}_0_intro.png` }); }
  });
}

// ── 2) Real play with wrong deliveries ───────────────────────────────────────────
function step() {
  const TS = 32, DIR_UP = 1;
  const HUB_COL = { repair: 3, share: 6, recycle: 9, compost: 12, landfill: 16 };
  const cv = document.querySelector('canvas'); const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };
  const log = (window.__log ||= []);
  const score = () => Number((document.querySelector('[data-testid=game-scorebar]')?.textContent.match(/:\s*(\d+)/) || [])[1]);
  const stand = (col, row) => { const p = st.player; p.col = col; p.row = row; p.pixelX = col * TS; p.pixelY = row * TS; p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = DIR_UP; };
  if (st.showMissionIntro) return { act: 'enter' };
  // a wrong delivery was just made: log what the game shows
  if (window.__pending) {
    const p = window.__pending;
    if (!st.feedback || st.feedback.until === p.untilBefore) { p.tries = (p.tries || 0) + 1; return p.tries > 30 ? (window.__pending = null, { act: 'wait', ms: 50 }) : { act: 'wait', ms: 60 }; }
    log.push({ id: p.id, how: p.how, feedback: st.feedback.text, cardLead: st.reveal ? (st.reveal.lead || null) : null,
      scoreBefore: p.scoreBefore, firstTry: st.firstTryCount, carrying: st.carrying, routed: st.resources.find((r) => r.id === p.id).routed });
    window.__pending = null; window.__wantDom = log.length - 1;
    if (st.reveal) return { act: 'shot', tag: `${p.id}_${p.how}_card` };
    return { act: 'wait', ms: 200 };
  }
  if (window.__wantDom != null && !st.reveal) {
    const el = document.querySelector('[role=status]');
    if (!el) return { act: 'wait', ms: 100 };
    const box = el.parentElement; const b = box.getBoundingClientRect();
    const e = log[window.__wantDom];
    e.dom = { status: el.textContent, item: box.firstElementChild !== el ? box.firstElementChild.textContent : null,
      box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, clipped: box.scrollWidth > box.clientWidth + 1,
      fs: parseFloat(getComputedStyle(el).fontSize) };
    e.scoreAfter = score();
    const tag = `${e.id}_${e.how}_hud`; window.__wantDom = null;
    return { act: 'shot', tag, hub: true };
  }
  if (st.reveal) return { act: 'enter' };
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
  const plan = window.__plan;
  if (st.carrying) {
    const res = st.resources.find((r) => r.id === st.carrying);
    const done = (window.__done ||= {});
    const seq = plan[res.id] || [];
    const k = done[res.id] || 0;
    if (!window.__nameLogged?.[res.id]) {
      // the carried-item box shows the FULL name before any destination is chosen
      const box = [...document.querySelectorAll('div')].find((d) => d.style.top === '62%');
      (window.__names ||= {})[res.id] = box ? { text: box.firstElementChild?.textContent || null, clipped: box.scrollWidth > box.clientWidth + 1 } : null;
      (window.__nameLogged ||= {})[res.id] = true;
      if (res.id === 'shirt' || res.id === 'jacket') return { act: 'shot', tag: `${res.id}_carry` };
    }
    if (k < seq.length) {
      done[res.id] = k + 1;
      const how = seq[k];
      window.__pending = { id: res.id, how, untilBefore: st.feedback ? st.feedback.until : null, scoreBefore: score() };
      if (how === 'landfill') stand(HUB_COL.landfill, 3);
      else stand(HUB_COL[how], 3);
      return { act: 'enter' };
    }
    stand(HUB_COL[res.correctNode], 3); return { act: 'enter' };
  }
  const res = st.resources.find((r) => !r.routed);
  if (res) {
    stand(res.tile.col, res.tile.row + 1);
    if ((res.id === 'shirt' || res.id === 'jacket') && !(window.__prompts ||= {})[res.id]) {
      if (!st.actionPrompt || !st.actionPrompt.includes(res.name)) return { act: 'wait', ms: 60 };
      const ctx = cv.getContext('2d'); ctx.save(); ctx.font = "bold 14px 'Inter', system-ui, sans-serif";
      window.__prompts[res.id] = { text: st.actionPrompt, w: ctx.measureText(st.actionPrompt).width + 50 }; ctx.restore();
      return { act: 'shot', tag: `${res.id}_pickup` };
    }
    return { act: 'enter' };
  }
  return { act: 'wait', ms: 150 };
}

for (const lang of LANGS) for (const size of SIZES) {
  test(`4.2 clothes play ${lang} ${size.width}x${size.height}${BASELINE ? ' BASELINE' : ''}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(size);
    await recorder(page);
    // the round deals 8 of 12 items: boot until both clothes are in it
    let deck = [];
    for (let i = 0; i < 25; i++) {
      await bootMission(page, 'circular', 2, lang);
      deck = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.resources.map((r) => ({ id: r.id, node: r.correctNode })));
      if (deck.some((r) => r.id === 'jacket') && deck.some((r) => r.id === 'shirt')) break;
    }
    expect(deck.map((r) => r.id)).toEqual(expect.arrayContaining(['jacket', 'shirt']));
    const other = deck.find((r) => r.id !== 'jacket' && r.id !== 'shirt');
    const otherWrong = other.node === 'recycle' ? 'compost' : 'recycle';
    const plan = { jacket: ['share', 'landfill'], shirt: ['landfill', 'repair'], [other.id]: [otherWrong] };
    await page.evaluate((p) => { window.__plan = p; }, plan);

    // hub label rects (canvas-logical → CSS), to check the feedback box does not cover them
    const r = LOC[lang].circularcity;
    let hubRects = null; let cpRect = null;
    const cards = [];
    let nav = null;
    for (let i = 0; i < 1500 && !nav; i++) {
      const a = await page.evaluate(step);
      if (a.act === 'done') nav = a.nav;
      else if (a.act === 'enter') await pressEnter(page);
      else if (a.act === 'shot') {
        if (a.hub && !hubRects) {
          const { drawn } = await record(page, 250);
          const labels = [r.r_repair, r.r_share, r.r_recycle, r.r_compost];
          const ds = frameLines(drawn).filter((d) => labels.includes(d.s));
          hubRects = await Promise.all(ds.map((d) => cssRectOfLogical(page, { l: d.l, r: d.r, t: d.y - 7, b: d.y + 7 })));
          const cp = frameLines(drawn).find((d) => d.s.includes(r.collection_point));
          cpRect = cp ? await cssRectOfLogical(page, { l: cp.l, r: cp.r, t: cp.y - 7, b: cp.y + 7 }) : null;
        }
        if (a.tag.endsWith('_card')) {
          // the landfill card (canvas): the lead's wrapped lines, read back in order, equal the lead
          // EXACTLY, and every one of them lies inside the real card panel (not just somewhere on the
          // canvas); every drawn line of the card stays inside the canvas
          const { drawn, panels } = await record(page, 250);
          const lead = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.reveal?.lead || '');
          // the LAST reveal-card panel recorded, and only the text drawn after it (= on top of it,
          // in that frame): the game world under the dim is drawn before the card and is ignored
          const card = panels.filter((q) => q.kind === 'reveal').sort((x, y) => y.seq - x.seq)[0] || null;
          const all = card ? frameLines(drawn.filter((d) => d.seq > card.seq)) : [];
          let leadLines = null;
          for (let i = 0; i < all.length && !leadLines && lead; i++) {
            let acc = ''; const seq = [];
            for (let j = i; j < all.length && acc.length < lead.length; j++) { acc = (acc ? `${acc} ` : '') + all[j].s.trim(); seq.push(all[j]); }
            if (acc === lead) leadLines = seq;
          }
          const inCard = (d) => card && d.l >= card.x0 && d.r <= card.x1 && d.y - 7 >= card.y0 && d.y + 7 <= card.y1;
          cards.push({ tag: a.tag, lead, card, leadLineCount: leadLines ? leadLines.length : 0,
            ok: !!card && card.y0 >= 0 && card.y1 <= 704 && all.filter(inCard).length > 0,
            leadInCard: !!leadLines && leadLines.every(inCard) });
        }
        if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${lang}_${size.width}x${size.height}_${a.tag}.png` }); }
      } else await page.waitForTimeout(a.ms || 100);
    }
    expect(nav, 'reached the result').toBeTruthy();
    const { log, names, prompts } = await page.evaluate(() => ({ log: window.__log, names: window.__names, prompts: window.__prompts }));

    // numbers: same rules as before the change (no penalty; first try counts only clean deliveries)
    expect(nav).toMatchObject({ mission: 'CircularCity', score: 120, correct: 8, total: 8, leaks: 0, firstTryCount: 5, tier: 'pass', stars: 1 });
    expect(log).toHaveLength(5);
    for (const e of log) {
      expect(e.routed, `${e.id} ${e.how} is kept, not routed`).toBe(false);
      expect(e.carrying, `${e.id} ${e.how} still carried`).toBe(e.id);
      if (e.scoreAfter != null) expect(e.scoreAfter, `${e.id} ${e.how}: no points lost`).toBe(e.scoreBefore);
    }
    test.info().annotations.push({ type: 'metrics', description: JSON.stringify({ lang, size, nav, log, names, prompts, hubRects, cards, coversCollectionPoint: cpRect ? log.filter((e) => e.dom && overlap(e.dom.box, cpRect)).map((e) => `${e.id}:${e.how}`) : null }) });
    if (BASELINE) return;

    const toon = r.wrong_toon;
    const want = { jacket: `${r.wrong_hint_jacket} ${toon}`, shirt: `${r.wrong_hint_shirt} ${toon}`, [other.id]: toon };
    for (const e of log) {
      expect(e.feedback, `${e.id} ${e.how}`).toBe(want[e.id]);
      expect(e.dom?.status, `${e.id} ${e.how} shown`).toBe(want[e.id]);
      expect(e.dom.status.endsWith(toon), 'glowing-hub hint kept').toBe(true);
      // the first landfill opens the landfill card: its lead line carries the same explanation
      // (the first-landfill card lead is checked below, without any skip)
      // readable: inside the viewport, not clipped, does not cover a hub label
      const b = e.dom.box;
      expect(b.left).toBeGreaterThanOrEqual(0); expect(b.right).toBeLessThanOrEqual(size.width);
      expect(b.top).toBeGreaterThanOrEqual(0); expect(b.bottom).toBeLessThanOrEqual(size.height);
      expect(e.dom.clipped).toBe(false);
      expect(e.dom.fs).toBeGreaterThanOrEqual(14);
      for (const h of hubRects || []) expect(overlap(b, h), `${e.id} ${e.how} box covers a hub label`).toBe(false);
      if (e.id === 'jacket' || e.id === 'shirt') expect(e.dom.item).toContain(r[`res_${e.id}`]);
    }
    expect(log.some((e) => e.id === 'shirt' && e.how === 'landfill')).toBe(true);
    expect(log.some((e) => e.id === 'jacket' && e.how === 'landfill')).toBe(true);
    expect(hubRects && hubRects.length).toBe(4);
    expect(cards.length, 'the first landfill opened its card').toBeGreaterThanOrEqual(1);
    expect(cards.length, 'exactly one landfill card (the first landfill)').toBe(1);
    const landfills = log.filter((e) => e.how === 'landfill');
    expect(landfills).toHaveLength(2);
    // the FIRST landfill opens the card: its lead is mandatory, non-empty and exactly the item's text
    expect(landfills[0].cardLead, 'first landfill card lead').toBeTruthy();
    expect(landfills[0].cardLead).toBe(want[landfills[0].id]);
    expect(cards[0].lead).toBe(want[landfills[0].id]);
    expect(landfills[1].cardLead, 'second landfill opens no card').toBeNull();
    expect(cards[0].ok, 'card panel inside the canvas').toBe(true);
    expect(cards[0].leadInCard, `the whole lead is drawn inside the real card ${JSON.stringify(cards[0])}`).toBe(true);
    // full names before choosing: the pick-up prompt (canvas, one line, fits 1280) and the carried box
    for (const id of ['jacket', 'shirt']) {
      expect(prompts[id].text).toBe(r.pickup_prompt.replace('{{item}}', r[`res_${id}`]));
      expect(prompts[id].w).toBeLessThanOrEqual(1280 - 40);
      expect(names[id].text).toContain(r[`res_${id}`]);
      expect(names[id].clipped).toBe(false);
    }
  });
}
