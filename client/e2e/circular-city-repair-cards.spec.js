// Check repair and closing cards with the repair item delivered first or last. Each card requires a separate press.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission } from './helpers.js';

// a touch device, so the on-screen A button exists (controls only show with a finger-type pointer)
test.use({ hasTouch: true });

const LOC = Object.fromEntries(['el', 'en', 'nl', 'pt'].map((l) => [l, JSON.parse(fs.readFileSync(`src/i18n/locales/${l}.json`, 'utf8'))]));
const EN_PLAIN = {
  repair: 'Reusing and repairing keep things in use. In the list of 10 ways, they come before recycling.',
};
const RES = {
  chair: ['🪑', 'repair'], bike: ['🚲', 'repair'], jacket: ['🧥', 'repair'],
  shirt: ['👕', 'share'], books: ['📚', 'share'], toys: ['🧸', 'share'],
  bottle: ['🍾', 'recycle'], can: ['🥫', 'recycle'], paper: ['📰', 'recycle'],
  peel: ['🍌', 'compost'], coffee: ['☕', 'compost'], eggs: ['🥚', 'compost'],
};
const DECK = {
  R2: ['jacket', 'chair', 'bike', 'shirt', 'books', 'bottle', 'peel', 'coffee'],
  R3: ['shirt', 'books', 'toys', 'bottle', 'can', 'peel', 'coffee', 'jacket'],
};
const SHOTS = process.env.REPAIR_CARD_SHOTS;

async function setup(page) {
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (u) => { window.__opened.push(String(u)); return null; };
    window.__d = []; window.__p = []; let seq = 0;
    const P = CanvasRenderingContext2D.prototype;
    const toL = (ctx, x, y) => { const m = ctx.getTransform(); const h = ctx.canvas.__hidpi || { k: ctx.canvas.width / 1280, ox: 0, oy: 0 }; return [((m.a * x + m.c * y + m.e) - h.ox) / h.k, ((m.b * x + m.d * y + m.f) - h.oy) / h.k]; };
    const oB = P.beginPath; P.beginPath = function b(...a) { this.__pts = []; return oB.apply(this, a); };
    for (const n of ['moveTo', 'lineTo']) { const o = P[n]; P[n] = function f(x, y) { (this.__pts ||= []).push(toL(this, x, y)); return o.call(this, x, y); }; }
    const oQ = P.quadraticCurveTo; P.quadraticCurveTo = function q(a, b, x, y) { (this.__pts ||= []).push(toL(this, x, y)); return oQ.call(this, a, b, x, y); };
    const oF = P.fill; P.fill = function fl(...a) {
      const s = String(this.fillStyle).replace(/\s+/g, '');
      if (window.__r && s.startsWith('rgba(255,248,225,0.98') && this.__pts?.length) { const xs = this.__pts.map((q) => q[0]); const ys = this.__pts.map((q) => q[1]); window.__p.push({ seq: ++seq, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }); }
      return oF.apply(this, a);
    };
    const oT = P.fillText; P.fillText = function t(text, x, y, ...r) {
      if (window.__r) { const m = this.getTransform(); const w = this.measureText(String(text)).width; const left = this.textAlign === 'center' ? x - w / 2 : x; const h = this.canvas.__hidpi || { k: this.canvas.width / 1280, ox: 0, oy: 0 }; window.__d.push({ seq: ++seq, s: String(text), l: ((m.a * left + m.e) - h.ox) / h.k, r: ((m.a * (left + w) + m.e) - h.ox) / h.k, y: ((m.d * y + m.f) - h.oy) / h.k }); }
      return oT.call(this, text, x, y, ...r);
    };
  });
}

// Text drawn ON the last reveal card of the recording, in drawing order (one frame).
async function cardText(page) {
  await page.evaluate(() => { window.__d = []; window.__p = []; window.__r = true; });
  await page.waitForTimeout(250);
  const { d, p } = await page.evaluate(() => { window.__r = false; return { d: window.__d, p: window.__p }; });
  const card = p.sort((a, b) => b.seq - a.seq)[0];
  if (!card) return { card: null, lines: [] };
  const lines = d.filter((x) => x.seq > card.seq);
  return { card, lines };
}
// The lines whose texts, joined in order, equal `want` exactly (null if absent).
function findRun(lines, want) {
  for (let i = 0; i < lines.length; i++) {
    let acc = ''; const seq = [];
    for (let j = i; j < lines.length && acc.length < want.length; j++) { acc = (acc ? `${acc} ` : '') + lines[j].s.trim(); seq.push(lines[j]); }
    if (acc === want) return seq;
  }
  return null;
}
const inCard = (c, d) => d.l >= c.x0 - 1 && d.r <= c.x1 + 1 && d.y - 7 >= c.y0 && d.y + 7 <= c.y1;

async function confirm(page, how) {
  if (how === 'space') { await page.keyboard.down(' '); await page.waitForTimeout(90); await page.keyboard.up(' '); }
  else if (how === 'click') {
    // a MOUSE click on the on-screen A button (pointerType 'mouse', left button, real press/release)
    const box = await page.locator('[data-touch-control][data-key="Enter"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up();
  } else if (how === 'A') {
    // a real touch tap (CDP touch events, as in helpers.js touchHold) on the on-screen A button
    const box = await page.locator('[data-touch-control][data-key="Enter"]').boundingBox();
    const client = await page.context().newCDPSession(page);
    const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await page.waitForTimeout(90);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else { await page.keyboard.down('Enter'); await page.waitForTimeout(90); await page.keyboard.up('Enter'); }
  await page.waitForTimeout(120);
}

function step() {
  const TS = 32, DIR_UP = 1;
  const HUB_COL = { repair: 3, share: 6, recycle: 9, compost: 12, landfill: 16 };
  const cv = document.querySelector('canvas'); const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };
  if (st.showMissionIntro) return { act: 'enter' };
  if (st.reveal) {
    if (st.reveal !== window.__lastReveal) {
      window.__lastReveal = st.reveal;
      const r = st.reveal;
      (window.__reveals ||= []).push({ sourceId: r.sourceId, lead: r.lead || null, quote: r.quote, final: r.final === true,
        hasNext: !!r.next, routed: st.routedCount, screen: store.currentScreen });
      return { act: 'reveal', idx: window.__reveals.length - 1 };
    }
    return { act: 'enter' };
  }
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
  const stand = (col, row) => { const p = st.player; p.col = col; p.row = row; p.pixelX = col * TS; p.pixelY = row * TS; p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = DIR_UP; };
  if (st.carrying) {
    const res = st.resources.find((r) => r.id === st.carrying);
    const wrong = (window.__wrong ||= {});
    if (window.__landfillOnce === res.id && !wrong[res.id]) { wrong[res.id] = true; stand(HUB_COL.landfill, 3); return { act: 'enter' }; }
    stand(HUB_COL[res.correctNode], 3); return { act: 'enter' };
  }
  const next = window.__order.find((id) => !st.resources.find((r) => r.id === id).routed);
  if (next) { const res = st.resources.find((r) => r.id === next); stand(res.tile.col, res.tile.row + 1); return { act: 'enter' }; }
  return { act: 'wait', ms: 150 };
}

async function play(page, { lang, size, deck, confirmHow = 'enter', landfillOnce = null, shotTag }) {
  const L = LOC[lang]; const r = L.circularcity;
  await page.setViewportSize(size);
  await setup(page);
  await bootMission(page, 'circular', 2, lang);
  // fix the deal: same 8 slots, chosen items (identity only)
  await page.evaluate(([ids, res, names]) => {
    const st = document.querySelector('canvas')._stateRef.current;
    st.resources = st.resources.map((slot, i) => ({ ...slot, id: ids[i], emoji: res[ids[i]][0], correctNode: res[ids[i]][1],
      nameKey: `circularcity.res_${ids[i]}`, name: names[ids[i]], routed: false, correct: null, retried: false }));
    window.__order = ids;
  }, [deck, RES, Object.fromEntries(Object.keys(RES).map((id) => [id, r[`res_${id}`]]))]);
  if (landfillOnce) await page.evaluate((id) => { window.__landfillOnce = id; }, landfillOnce);

  const cards = []; let nav = null;
  for (let i = 0; i < 1500 && !nav; i++) {
    const a = await page.evaluate(step);
    if (a.act === 'done') nav = a.nav;
    else if (a.act === 'enter') await confirm(page, 'enter');
    else if (a.act === 'reveal') {
      await page.waitForTimeout(150);
      const info = await page.evaluate((idx) => window.__reveals[idx], a.idx);
      const { card, lines } = await cardText(page);
      const t0 = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.time);
      await page.waitForTimeout(400);
      const t1 = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.time);
      const entry = { ...info, card, leadRun: info.lead ? !!findRun(lines, info.lead) : null,
        leadIn: info.lead ? (findRun(lines, info.lead) || []).every((d) => inCard(card, d)) : null,
        bodyRun: !!findRun(lines, info.quote), bodyIn: (findRun(lines, info.quote) || []).every((d) => inCard(card, d)),
        cardInCanvas: !!card && card.y0 >= 0 && card.y1 <= 704, timePaused: t0 === t1 };
      if (info.sourceId === 'circular-economy-rs') {
        await page.keyboard.press('s'); await page.waitForTimeout(150);
        entry.opened = await page.evaluate(() => window.__opened.slice(-1)[0] || null);
      }
      if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${shotTag}_${cards.length}_${info.sourceId}.png` }); }
      cards.push(entry);
      // ONE press, then the state right after it
      const how = info.hasNext || info.final ? confirmHow : 'enter';
      await confirm(page, how);
      await page.waitForTimeout(300);
      entry.after = await page.evaluate(() => { const s = document.querySelector('canvas')?._stateRef?.current; return {
        screen: window.__playfood.state().currentScreen, reveal: s?.reveal ? s.reveal.sourceId : null, final: s?.reveal?.final === true }; });
    } else await page.waitForTimeout(a.ms || 100);
  }
  return { nav, cards, L };
}

function checkCards(cards, L, expected) {
  const r = L.circularcity;
  expect(cards.map((c) => c.sourceId)).toEqual(expected);
  for (const c of cards) {
    expect(c.cardInCanvas, `${c.sourceId} card inside the canvas`).toBe(true);
    expect(c.bodyRun && c.bodyIn, `${c.sourceId} body drawn exactly inside the card`).toBe(true);
    if (c.lead) expect(c.leadRun && c.leadIn, `${c.sourceId} lead drawn exactly inside the card`).toBe(true);
    expect(c.timePaused, `${c.sourceId} time paused`).toBe(true);
  }
  const repair = cards.filter((c) => c.sourceId === 'circular-economy-rs');
  expect(repair, 'exactly one repair card').toHaveLength(1);
  expect(repair[0].lead).toBe(r.repair_lead);
  expect(repair[0].quote).toBe(r.facts?.repair || EN_PLAIN.repair);
  expect(repair[0].opened).toMatch(/^\/?source\.html\?src=circular-economy-rs$/);
  const win = cards[cards.length - 1];
  expect(win.sourceId).toBe('circular-city-amsterdam');
  expect(win.final).toBe(true);
  expect(win.lead).toBe(r.win_lead);
  expect(win.after.screen, `the closing card leads to the result ${JSON.stringify(cards.map((c) => [c.sourceId, c.after]))}`).toBe('result');
}

const SIZES = ['1920x1080', '1366x768', '1280x720', '1024x768', '844x390']
  .map((s) => { const [width, height] = s.split('x').map(Number); return { width, height }; });

// The only repair is the last delivery: 4 languages × 5 sizes
for (const lang of ['el', 'en', 'nl', 'pt']) for (const size of SIZES) {
  test(`repair last ${lang} ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(200_000);
    const { nav, cards, L } = await play(page, { lang, size, deck: DECK.R3, shotTag: `${lang}_${size.width}x${size.height}_R3` });
    checkCards(cards, L, ['circular-city-amsterdam', 'circular-city-amsterdam', 'composting-home', 'circular-economy-rs', 'circular-city-amsterdam']);
    // share, recycle, compost, then repair (queued closing), then the closing card
    const rep = cards[3];
    expect(rep.hasNext, 'repair card queues the closing card').toBe(true);
    expect(rep.routed).toBe(8);
    expect(rep.after, 'one press closes ONLY the repair card').toEqual({ screen: 'game', reveal: 'circular-city-amsterdam', final: true });
    expect(nav).toMatchObject({ score: 120, correct: 8, total: 8, leaks: 0, firstTryCount: 8, tier: 'perfect', stars: 3 });
    test.info().annotations.push({ type: 'metrics', description: JSON.stringify({ lang, size, seq: cards.map((c) => [c.sourceId, c.hasNext, c.final, c.card && [Math.round(c.card.y0), Math.round(c.card.y1)]]), nav }) });
  });
}

// R1 + R2: first repair early, two more repairs → no second repair card; closing card as usual
for (const lang of ['el', 'en', 'nl', 'pt']) for (const size of [SIZES[1], SIZES[4]]) {
  test(`repair early ${lang} ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(200_000);
    const { nav, cards, L } = await play(page, { lang, size, deck: DECK.R2, shotTag: `${lang}_${size.width}x${size.height}_R2` });
    checkCards(cards, L, ['circular-economy-rs', 'circular-city-amsterdam', 'circular-city-amsterdam', 'composting-home', 'circular-city-amsterdam']);
    expect(cards[0].routed, 'repair card after the FIRST delivery').toBe(1);
    expect(cards[0].hasNext).toBe(false);
    expect(cards[0].after).toEqual({ screen: 'game', reveal: null, final: false });
    expect(nav).toMatchObject({ score: 120, correct: 8, total: 8, leaks: 0, firstTryCount: 8, tier: 'perfect', stars: 3 });
  });
}

// R8: one press closes one card — Space, and the on-screen A button
for (const [how, size] of [['space', SIZES[1]], ['A', SIZES[4]], ['click', SIZES[1]]]) {
  test(`one ${how} closes one card el ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(200_000);
    const { nav, cards, L } = await play(page, { lang: 'el', size, deck: DECK.R3, confirmHow: how, shotTag: `el_${size.width}x${size.height}_R8_${how}` });
    checkCards(cards, L, ['circular-city-amsterdam', 'circular-city-amsterdam', 'composting-home', 'circular-economy-rs', 'circular-city-amsterdam']);
    // one press / tap / click closes ONLY the repair card; the next one closes the closing card
    expect(cards[3].after).toEqual({ screen: 'game', reveal: 'circular-city-amsterdam', final: true });
    expect(cards[4].after.screen).toBe('result');
    expect(nav.score).toBe(120);
  });
}

// R6 (+ R5): a corrected landfill before the end — same closing line, first try / stars drop as before
test('landfill before the end el 1366x768', async ({ page }) => {
  test.setTimeout(200_000);
  const { nav, cards, L } = await play(page, { lang: 'el', size: SIZES[1], deck: DECK.R3, landfillOnce: 'bottle', shotTag: 'el_1366x768_R6' });
  expect(cards.map((c) => c.sourceId)).toEqual(['circular-city-amsterdam', 'linear-circular-food', 'circular-city-amsterdam', 'composting-home', 'circular-economy-rs', 'circular-city-amsterdam']);
  const win = cards[cards.length - 1];
  expect(win.lead).toBe(L.circularcity.win_lead);
  expect(cards[4].after).toEqual({ screen: 'game', reveal: 'circular-city-amsterdam', final: true });
  // every card, the landfill card included: inside the canvas, body (and lead, when set) drawn
  // EXACTLY and wholly inside the real card, game time frozen while it is open
  for (const c of cards) {
    expect(c.cardInCanvas, `${c.sourceId} card inside the canvas`).toBe(true);
    expect(c.bodyRun && c.bodyIn, `${c.sourceId} body drawn exactly inside the card`).toBe(true);
    if (c.lead) expect(c.leadRun && c.leadIn, `${c.sourceId} lead drawn exactly inside the card`).toBe(true);
    expect(c.timePaused, `${c.sourceId} time paused`).toBe(true);
  }
  expect(win.leadRun && win.leadIn, 'closing line A drawn whole inside the closing card').toBe(true);
  expect(win.bodyRun && win.bodyIn, 'Amsterdam body drawn whole inside the closing card').toBe(true);
  expect(win.after.screen).toBe('result');
  expect(nav).toMatchObject({ score: 120, correct: 8, total: 8, leaks: 0, firstTryCount: 7, tier: 'great', stars: 2 });
});
