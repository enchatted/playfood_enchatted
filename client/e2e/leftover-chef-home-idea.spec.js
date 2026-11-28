// The bread rescue card includes a separate home suggestion before the safety card.
import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';

const EXPECTED = {
  el: {
    title: 'Ιδέα αξιοποίησης:',
    prompt: 'Πάτα Enter, Space ή το κουμπί A στην οθόνη για συνέχεια',
    home: 'Άλλη ιδέα για το σπίτι: ψωμί με ντομάτα, για ένα σάντουιτς.',
    toast: ['Τοστ με λιωμένη μπανάνα', 'Το μπαγιάτικο ψωμί ψήνεται τραγανό και από πάνω μπαίνει η λιωμένη μπανάνα.'],
    frenchtoast: ['Αυγόφετες με μπανάνα', 'Με λίγο βούτυρο ή λάδι, το μπαγιάτικο ψωμί βουτιέται στο αυγό, ψήνεται και σερβίρεται με μπανάνα.'],
    neutral: ['Σώθηκε! Τίποτα στα σκουπίδια.', 'Αυτά τα περισσεύματα μπορούν να αξιοποιηθούν σε διαφορετικά πιάτα.'],
  },
  en: {
    title: 'Rescue idea:',
    prompt: 'Press Enter, Space or the A button on screen to continue',
    home: 'Another idea for home: bread with tomato, for a sandwich.',
    toast: ['Toast with mashed banana', 'The stale bread is toasted until crunchy and topped with mashed banana.'],
    frenchtoast: ['French toast with banana', 'With a little butter or oil, the stale bread is dipped in egg, cooked and served with banana.'],
    neutral: ['Rescued! Nothing wasted.', 'These leftovers can be used in different dishes.'],
  },
  nl: {
    title: 'Idee voor je restjes:',
    prompt: 'Druk op Enter, spatie of de A-knop op het scherm om verder te gaan',
    home: 'Nog een idee voor thuis: brood met tomaat, voor een broodje.',
    toast: ['Toast met geprakte banaan', 'Het oudbakken brood wordt knapperig geroosterd, met geprakte banaan erop.'],
    frenchtoast: ['Verloren brood met banaan', 'Met een beetje boter of olie wordt het oudbakken brood in ei gedoopt, gebakken en met banaan geserveerd.'],
    neutral: ['Gered! Niets verspild.', 'Deze restjes kun je in verschillende gerechten gebruiken.'],
  },
  pt: {
    title: 'Ideia para aproveitar as sobras:',
    prompt: 'Pressiona Enter, Espaço ou o botão A no ecrã para continuar',
    home: 'Outra ideia para casa: pão com tomate, para uma sanduíche.',
    toast: ['Torrada com banana esmagada', 'O pão duro fica torrado e estaladiço, com banana esmagada por cima.'],
    frenchtoast: ['Rabanadas com banana', 'Com um pouco de manteiga ou azeite, o pão duro é passado por ovo, alourado na frigideira e servido com banana.'],
    neutral: ['Salvo! Nada desperdiçado.', 'Estas sobras podem ser aproveitadas em pratos diferentes.'],
  },
};
const POT = {
  toast: ['stale_bread', 'brown_banana'],
  frenchtoast: ['stale_bread', 'brown_banana', 'egg'],
  neutral: ['stale_bread', 'brown_banana', 'cheese_end'],
};
// Card colours (renderer constants, lower-case as the canvas reports them).
const CARD = '#6d4c41'; const PANEL = '#fff8e1'; const STRIP = '#8d6e63'; const PILL = '#2e7d32';

const st = (page, src, a) => page.evaluate(([s, arg]) => new Function('s', 'a', s)(document.querySelector('canvas')._stateRef.current, arg), [src, a]);
const norm = (t) => String(t).replace(/\s+/g, ' ').trim();

// Records fillText (+ font, transform, real glyph box) and filled paths of the game canvas.
function installRecorder() {
  const P = CanvasRenderingContext2D.prototype;
  const path = new WeakMap();
  const pt = (ctx, x, y) => { const m = ctx.getTransform(); return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; };
  const push = (ctx, x, y) => { if (window.__rec) { const l = path.get(ctx) || []; l.push(pt(ctx, x, y)); path.set(ctx, l); } };
  const wrap = (name, fn) => { const o = P[name]; P[name] = function (...a) { fn(this, a); return o.apply(this, a); }; };
  wrap('beginPath', (ctx) => path.set(ctx, []));
  wrap('moveTo', (ctx, [x, y]) => push(ctx, x, y));
  wrap('lineTo', (ctx, [x, y]) => push(ctx, x, y));
  wrap('quadraticCurveTo', (ctx, [cx, cy, x, y]) => { push(ctx, cx, cy); push(ctx, x, y); });
  wrap('fill', (ctx) => {
    if (!window.__rec || ctx.canvas !== document.querySelector('canvas')) return;
    const l = path.get(ctx) || []; if (!l.length) return;
    const xs = l.map((p) => p.x); const ys = l.map((p) => p.y);
    window.__rec.fills.push({ seq: window.__rec.n++, color: String(ctx.fillStyle).toLowerCase(), l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) });
  });
  wrap('fillText', (ctx, [text, x, y]) => {
    if (!window.__rec || ctx.canvas !== document.querySelector('canvas')) return;
    const m = ctx.getTransform(); const mt = ctx.measureText(text);
    const w = mt.width; const align = ctx.textAlign;
    const x0 = align === 'center' ? x - w / 2 : (align === 'right' || align === 'end') ? x - w : x;
    const a = pt(ctx, x0, y - mt.actualBoundingBoxAscent); const b = pt(ctx, x0 + w, y + mt.actualBoundingBoxDescent);
    const px = parseFloat(String(ctx.font).match(/([\d.]+)px/)[1]);
    window.__rec.texts.push({ seq: window.__rec.n++, text: String(text), font: ctx.font, color: String(ctx.fillStyle).toLowerCase(),
      devPx: px * Math.hypot(m.a, m.b), l: Math.min(a.x, b.x), r: Math.max(a.x, b.x), t: Math.min(a.y, b.y), b: Math.max(a.y, b.y) });
  });
}

// One full frame of draws, converted to CSS px on the page.
async function captureFrame(page) {
  return page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => {
      window.__rec = { texts: [], fills: [], n: 0 };
      requestAnimationFrame(() => {
        const rec = window.__rec; window.__rec = null;
        const cv = document.querySelector('canvas'); const rect = cv.getBoundingClientRect();
        const dpr = cv.width / rect.width;
        const box = (o) => ({ ...o, l: rect.left + o.l / dpr, r: rect.left + o.r / dpr, t: rect.top + o.t / dpr, b: rect.top + o.b / dpr, cssPx: o.devPx ? o.devPx / dpr : undefined });
        const controls = [...document.querySelectorAll('[data-touch-control="true"]')].filter((el) => el.offsetParent !== null)
          .map((el) => { const r = el.getBoundingClientRect(); return { key: el.dataset.key, l: r.left, r: r.right, t: r.top, b: r.bottom }; });
        resolve({ texts: rec.texts.map(box), fills: rec.fills.map(box), controls, vw: innerWidth, vh: innerHeight,
          canvas: { l: rect.left, r: rect.right, t: rect.top, b: rect.bottom } });
      });
    });
  }));
}

async function readScore(page) {
  const text = await page.locator('[data-testid="game-scorebar"]').first().textContent();
  const m = String(text).match(/:\s*(\d+)/);
  return m ? Number(m[1]) : Number.NaN;
}

async function pastIntro(page) {
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.player);
  for (let i = 0; i < 20; i++) {
    const r = await st(page, 'return {i:s.showMissionIntro,o:s.irisOpenness};');
    if (!r.i && r.o >= 1) return;
    if (r.i) await pressEnter(page); else await page.waitForTimeout(150);
  }
}
// Put the given leftovers in the pot for goal `gi` (earlier goals marked done), stand at the
// pot and cook with Enter — the same cook path the child uses.
async function cook(page, gi, ids) {
  await st(page, `
    s.goalIndex = a.gi; s.completedGoals = s.goals.slice(0, a.gi).map((g) => g.id);
    s.potItems = a.ids.map((id) => { const c = s.counterItems.find((x) => x.id === id); c.picked = true; return { id: c.id, emoji: c.emoji, name: c.name }; });
    const TS = 32; const p = s.player; p.col = 9; p.row = 8; p.pixelX = p.col * TS; p.pixelY = p.row * TS;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = 1;`, { gi, ids });
  await expect.poll(() => st(page, 'return !!s.actionPrompt;')).toBe(true);
  await pressEnter(page);
  await page.waitForFunction(() => {
    const s = document.querySelector('canvas')._stateRef.current;
    return s.dishReveal && s.dishRevealElapsed > 0.9;
  });
  return st(page, 'return { id: s.dishReveal.ideaId, home: s.dishReveal.homeIdea };');
}

const inside = (a, b, tol = 0.5) => a.l >= b.l - tol && a.r <= b.r + tol && a.t >= b.t - tol && a.b <= b.b + tol;
const overlaps = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
const joinIn = (texts, box) => norm(texts.filter((t) => inside(t, box, 1)).map((t) => t.text).join(' '));
const largest = (fills, color) => fills.filter((f) => f.color === color).sort((x, y) => (y.r - y.l) * (y.b - y.t) - (x.r - x.l) * (x.b - x.t))[0];

// The whole on-screen check, used for every language / size / dish.
export function checkCard(frame, exp, dish, { small }) {
  const card = largest(frame.fills, CARD);
  expect(card, 'card drawn').toBeTruthy();
  // the panel / strip are the ones drawn on the card (other cream / green shapes exist in the room)
  const onCard = frame.fills.filter((f) => f.seq > card.seq && inside(f, card, 1));
  // only what is drawn on top of the card counts (the room under the overlay is drawn first)
  frame = { ...frame, texts: frame.texts.filter((t) => t.seq > card.seq || norm(t.text) === '+25') };
  const panel = largest(onCard, PANEL);
  const strip = largest(onCard, STRIP);
  const pill = largest(frame.fills.filter((f) => f.color === PILL && f.b <= card.t + 1
    && (f.l + f.r) / 2 > card.l && (f.l + f.r) / 2 < card.r), PILL);
  expect(card, 'card drawn').toBeTruthy();
  expect(panel, 'dish text panel drawn').toBeTruthy();
  expect(strip, 'home-idea strip drawn').toBeTruthy();
  expect(pill, '+25 pill drawn').toBeTruthy();
  // every container on screen, inside the canvas
  for (const b of [card, pill]) {
    expect(b.l).toBeGreaterThanOrEqual(frame.canvas.l - 0.5); expect(b.r).toBeLessThanOrEqual(frame.canvas.r + 0.5);
    expect(b.t).toBeGreaterThanOrEqual(Math.max(0, frame.canvas.t) - 0.5); expect(b.b).toBeLessThanOrEqual(Math.min(frame.vh, frame.canvas.b) + 0.5);
  }
  expect(inside(panel, card)).toBe(true);
  expect(inside(strip, card)).toBe(true);
  // full translated texts, in their own boxes, in order
  expect(joinIn(frame.texts, panel), 'dish text').toBe(exp[dish][1]);
  expect(joinIn(frame.texts, strip).replace(/^🏠\s*/, ''), 'home idea').toBe(exp.home);
  const cardTexts = frame.texts.filter((t) => inside(t, card, 1));
  const at = (s) => cardTexts.findIndex((t) => norm(t.text) === s);
  expect(at(exp.title), 'title').toBeGreaterThanOrEqual(0);
  expect(norm(cardTexts.filter((t) => t.color === '#ffe082' && t.b < panel.t).map((t) => t.text).join(' ')), 'dish name').toBe(exp[dish][0]);
  const prompt = cardTexts.find((t) => norm(t.text) === exp.prompt);
  expect(prompt, 'continue prompt inside the card').toBeTruthy();
  // the home idea is BELOW the dish and above the prompt; never the dish name
  expect(strip.t).toBeGreaterThan(panel.b);
  expect(prompt.t).toBeGreaterThan(strip.b);
  expect(norm(cardTexts.filter((t) => t.b < panel.t).map((t) => t.text).join(' '))).not.toContain(exp.home);
  // +25 inside its pill, above the card
  const plus = frame.texts.find((t) => norm(t.text) === '+25');
  expect(plus && inside(plus, pill, 1), '+25 drawn in its pill').toBe(true);
  expect(pill.b).toBeLessThanOrEqual(card.t + 0.5);
  // real on-screen glyph sizes
  const panelTexts = frame.texts.filter((t) => inside(t, panel, 1));
  const stripTexts = frame.texts.filter((t) => inside(t, strip, 1) && !t.text.includes('🏠'));
  const minPx = (arr) => Math.min(...arr.map((t) => t.cssPx));
  const sizes = { body: minPx(panelTexts), home: minPx(stripTexts), prompt: prompt.cssPx };
  if (small) {
    expect(sizes.body, 'dish text CSS px').toBeGreaterThanOrEqual(12.9);
    expect(sizes.home, 'home idea CSS px').toBeGreaterThanOrEqual(12);
    expect(sizes.prompt, 'prompt CSS px').toBeGreaterThanOrEqual(12);
  }
  // the touch controls are there, and nothing of the card sits under them
  const keys = new Set(frame.controls.map((c) => c.key));
  for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'q']) expect(keys.has(k), `touch control ${k} present`).toBe(true);
  for (const c of frame.controls) {
    expect(overlaps(c, card), `card under touch control ${c.key}`).toBe(false);
    expect(overlaps(c, pill), `+25 under touch control ${c.key}`).toBe(false);
  }
  return { sizes, card };
}

// a touch device: the card must stay clear of the on-screen controls, which only show with a finger-type pointer
test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => { await page.addInitScript(installRecorder); });

for (const [w, h] of [[1366, 768], [844, 390]]) for (const lang of Object.keys(EXPECTED)) for (const dish of Object.keys(POT)) {
  test(`${w} ${lang} ${dish}: full texts, real glyph sizes and positions`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await bootMission(page, 'foodwaste', 3, lang);
    await pastIntro(page);
    const r = await cook(page, 2, POT[dish]);
    expect(r.home?.id).toBe('bread_tomato');
    const frame = await captureFrame(page);
    const { sizes, card } = checkCard(frame, EXPECTED[lang], dish, { small: w < 1000 });
    console.log('MEASURE', w, lang, dish, JSON.stringify({ sizes, card: { l: card.l, r: card.r, t: card.t, b: card.b } }));
  });
}

test('3rd goal score: exactly +25 for the dish; strip and safety card add nothing; the final bonus stays after the safety card', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await bootMission(page, 'foodwaste', 3, 'en');
  await pastIntro(page);
  const before = await readScore(page);
  expect(Number.isFinite(before), 'score is a number').toBe(true);
  await cook(page, 2, POT.frenchtoast);
  await expect.poll(() => readScore(page)).toBe(before + 25);
  await page.waitForTimeout(300);
  expect(await readScore(page)).toBe(before + 25); // the card with the home idea adds nothing
  await pressEnter(page);
  await page.waitForFunction(() => { const s = document.querySelector('canvas')._stateRef.current; return !s.dishReveal && !!s.factCard; });
  await page.waitForTimeout(300);
  expect(await readScore(page)).toBe(before + 25); // safety card adds nothing
  await pressEnter(page); // dismiss safety card → existing all-done bonus, same place as today
  await expect.poll(() => readScore(page)).toBe(before + 50);
});

test('goals 1 and 2: no home idea; continue → safety card; a fresh start is clean', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await bootMission(page, 'foodwaste', 3, 'en');
  await pastIntro(page);
  for (const [gi, ids] of [[0, ['wilted_lettuce', 'ripe_tomato']], [1, ['leftover_rice', 'half_onion']]]) {
    const r = await cook(page, gi, ids);
    expect(r.home).toBeNull();
    const frame = await captureFrame(page);
    expect(frame.fills.some((f) => f.color === STRIP), `goal ${gi + 1}: no strip drawn`).toBe(false);
    expect(frame.texts.some((t) => t.text.includes(EXPECTED.en.home) || t.text.includes('Another idea for home'))).toBe(false);
    await pressEnter(page);
    await page.waitForFunction(() => { const s = document.querySelector('canvas')._stateRef.current; return !s.dishReveal && !!s.factCard; });
    await pressEnter(page);
    await page.waitForFunction(() => !document.querySelector('canvas')._stateRef.current.factCard);
  }
  const g3 = await cook(page, 2, POT.toast);
  expect(g3.home?.id).toBe('bread_tomato');
  await page.evaluate(() => window.__playfood.state().navigate('hub'));
  await page.waitForFunction(() => window.__playfood.state().currentScreen === 'hub');
  await page.evaluate(() => window.__playfood.startMission('foodwaste', 3));
  await page.waitForFunction(() => {
    const s = document.querySelector('canvas')?._stateRef?.current;
    return s && s.player && window.__playfood.state().currentScreen === 'game';
  });
  expect(await st(page, 'return { reveal: s.dishReveal, goal: s.goalIndex, done: s.completedGoals.length, pot: s.potItems.length };'))
    .toEqual({ reveal: null, goal: 0, done: 0, pot: 0 });
  await pastIntro(page);
  expect((await cook(page, 0, ['wilted_lettuce', 'ripe_tomato'])).home).toBeNull();
});
