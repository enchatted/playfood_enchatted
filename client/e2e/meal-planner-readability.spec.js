import { test, expect } from '@playwright/test';
import { bootMission } from './helpers.js';
import { installIntroProbe, readIntroFrame } from './intro-card-probe.js';

/* Measure the text and shapes actually drawn in the Meal Planner at each viewport. */
const LANGS = ['el', 'en', 'nl', 'pt'];
const SIZES = [[844, 390], [1024, 768], [1366, 768]];
const DPRS = [1, 2];
const CHEF_FILL = /rgba\(255, 248, 225, 0\.95\)/;
const FACT_FILL = '#2e7d32';
const MIN_PX = 12;
const SHOTS = process.env.QA_SHOTS || '';

const S = (page, body, arg) => page.evaluate(([b, a]) => new Function('s', 'a', b)(document.querySelector('canvas')._stateRef.current, a), [body, arg]);
const waitS = (page, body, arg, timeout = 8000) => page.waitForFunction(([b, a]) => {
  const s = document.querySelector('canvas')?._stateRef?.current; return !!s && new Function('s', 'a', b)(s, a);
}, [body, arg], { timeout });
const tap = async (page, key = 'Enter') => { await page.keyboard.down(key); await page.waitForTimeout(90); await page.keyboard.up(key); await page.waitForTimeout(70); };
const STAND = `const p = s.player; p.col = a.col; p.row = a.row + 1; p.pixelX = p.col * 32; p.pixelY = p.row * 32;
  p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = 1;`;
const overlaps = (a, b, tol = 0.5) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > tol && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tol;
const inside = (t, r, tol = 1) => t.left >= r.left - tol && t.right <= r.right + tol && t.top >= r.top - tol && t.bottom <= r.bottom + tol;
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

async function open(page, lang, [w, h], dpr, scenario) {
  await page.setViewportSize({ width: w, height: h });
  await installIntroProbe(page);
  await page.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  await bootMission(page, 'foodwaste', 2, lang, `&scenario=${scenario}`);
  await waitS(page, 'return s.showMissionIntro === true');
  await tap(page);
  await waitS(page, 'return !s.showMissionIntro && s.irisOpenness >= 1');
}
async function place(page, src, id) {
  await S(page, `const it = a.src === 'home' ? s.fridge.find((f) => f.id === a.id && !f.used) : s.market.find((m) => m.id === a.id); a = it.tile; ${STAND}`, { src, id });
  await waitS(page, 'return s.focusedSource?.id === a && !!s.actionPrompt', id);
  await tap(page); await waitS(page, 'return s.heldItem?.id === a', id);
  await S(page, `a = { col: 9, row: 7 }; ${STAND}`); await waitS(page, 'return !!s.actionPrompt');
  await tap(page); await waitS(page, 'return !s.heldItem');
}
async function nextPlate(page, n) { await S(page, `a = { col: 9, row: 7 }; ${STAND}`); await page.waitForTimeout(80); await tap(page); await waitS(page, 'return s.activePlate === a', n); }

// summer: 13 placements; the 14th ends the game, so the last chef message a child sees is the 13th
const SUMMER_13 = [[0, 'home', 'bread'], [0, 'home', 'egg'], [0, 'home', 'strawberry'], [0, 'home', 'banana'],
  [1, 'market', 'rice'], [1, 'market', 'lentils'], [1, 'home', 'tomato'], [1, 'home', 'cucumber'], [1, 'market', 'cherry'],
  [2, 'market', 'rice'], [2, 'market', 'chicken'], [2, 'market', 'bell_pepper'], [2, 'market', 'tomato']];
const CHEF_CASES = {
  // a market bread while the home bread is still in the fridge
  already: { scenario: 0, steps: [[0, 'market', 'bread']], key: 'already' },
  // winter: an out-of-season strawberry
  season: { scenario: 2, steps: [[0, 'market', 'strawberry']], key: 'season' },
  // a market chicken while lentils are on the shelf
  plant: { scenario: 0, steps: [[0, 'home', 'bread'], [0, 'market', 'chicken']], key: 'plant' },
  // the 13th placement (a second market tomato: home tomato used, so no «already»), then the plate check
  last: { scenario: 0, steps: SUMMER_13, key: null },
};

function chefReport(frame) {
  const card = frame.shapes.filter((x) => x.fill && CHEF_FILL.test(x.fill)).at(-1);
  if (!card) return { card: null };
  const own = frame.texts.filter((t) => t.order > card.order && inside(t, card, 2));
  const covered = frame.texts.filter((t) => t.order < card.order && t.text.trim() && overlaps(t, card)).map((t) => t.text.trim());
  const underControls = frame.controls.filter((c) => overlaps(c, card)).map((c) => c.key);
  return { card, own, covered, underControls };
}

for (const lang of LANGS) for (const size of SIZES) for (const dpr of DPRS) {
  test.describe(`${lang} ${size.join('x')} DPR${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });

    test(`fact card: whole, ≥ ${MIN_PX} CSS px, source chip usable`, async ({ page }) => {
      await open(page, lang, size, dpr, 0);
      const plates = [['h:bread', 'h:egg', 'h:strawberry', 'h:banana'], ['m:rice', 'm:lentils', 'h:tomato', 'h:cucumber', 'm:cherry'], ['m:rice', 'm:lentils', 'm:bell_pepper', 'm:bell_pepper', 'm:cherry']];
      for (let pi = 0; pi < 3; pi++) {
        if (pi) await nextPlate(page, pi);
        for (const x of plates[pi]) await place(page, x[0] === 'h' ? 'home' : 'market', x.slice(2));
      }
      await waitS(page, "return s.resultPage === 'score'"); await page.waitForTimeout(900);
      await tap(page); await waitS(page, "return s.resultPage === 'fact'");
      const frame = await readIntroFrame(page);
      const expected = await S(page, 'return { fact: s.wasteFact[0].plain, src: s.wasteFact[0].sourceId, title: s.labels.factTitle, pressS: s.labels.pressS, cont: s.labels.factContinuePrompt }');
      const card = frame.shapes.filter((x) => x.fill === FACT_FILL && x.right - x.left > 100).at(-1);
      expect(card, 'fact card drawn').toBeTruthy();
      const texts = frame.texts.filter((t) => t.order > card.order && t.text.trim());
      const joined = norm(texts.map((t) => t.text).join(' '));
      for (const part of [expected.title, expected.fact, expected.pressS, expected.cont]) expect(joined, 'complete text').toContain(norm(part));
      const chipText = texts.find((t) => t.text.startsWith('📖'));
      expect(chipText, 'source chip label drawn').toBeTruthy();
      const outside = texts.filter((t) => !inside(t, card)).map((t) => t.text);
      const small = texts.filter((t) => t.size < MIN_PX - 0.05).map((t) => [t.text, +t.size.toFixed(1)]);
      const lines = [...texts].sort((a, b) => a.top - b.top);
      const lineOverlaps = [];
      for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) if (overlaps(lines[i], lines[j], 1)) lineOverlaps.push([lines[i].text, lines[j].text]);
      const canvas = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
      const underControls = frame.controls.filter((c) => overlaps(c, card)).map((c) => c.key);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/fact_${lang}_${size.join('x')}_dpr${dpr}.png` });
      // the source action: S, then a click on the chip where it is actually drawn
      await tap(page, 's');
      const byKey = await page.evaluate(() => window.__opened.slice());
      await page.mouse.click((chipText.left + chipText.right) / 2, (chipText.top + chipText.bottom) / 2);
      const byClick = await page.evaluate((n) => window.__opened.slice(n), byKey.length);
      const opened = { byKey, byClick };
      console.log('MPR_FACT', lang, size.join('x'), dpr, JSON.stringify({ card: [card.left, card.right, card.top, card.bottom].map(Math.round), minPx: Math.min(...texts.map((t) => t.size)).toFixed(1), small, outside, lineOverlaps, underControls, opened }));
      expect(small, 'every text ≥ 12 CSS px').toEqual([]);
      expect(outside, 'every text inside the card').toEqual([]);
      expect(lineOverlaps, 'no overlapping lines').toEqual([]);
      expect(inside(card, canvas), 'card inside the canvas').toBe(true);
      expect(underControls, 'card clear of the touch controls').toEqual([]);
      expect(opened.byKey, 'S opens the source').toEqual([`source.html?src=${expected.src}`]);
      expect(opened.byClick, 'a click on the drawn chip opens the source').toEqual([`source.html?src=${expected.src}`]);
    });

    for (const [name, c] of Object.entries(CHEF_CASES)) {
      test(`chef ${name}: covers no food or shelf text, whole, ≥ ${MIN_PX} CSS px`, async ({ page }) => {
        await open(page, lang, size, dpr, c.scenario);
        let plate = 0;
        for (const [pi, src, id] of c.steps) { if (pi > plate) { await nextPlate(page, pi); plate = pi; } await place(page, src, id); }
        if (name === 'last') { await S(page, `a = { col: 9, row: 7 }; ${STAND}`); await page.waitForTimeout(80); await tap(page); } // «Dinner still needs: Fruit.»
        await waitS(page, c.key ? 'return s.chef?.key === a' : 'return !!s.chef?.msg', c.key);
        const msg = await S(page, 'return s.chef.msg');
        const frame = await readIntroFrame(page);
        const r = chefReport(frame);
        expect(r.card, 'chef card drawn').toBeTruthy();
        const body = norm(r.own.map((t) => t.text).join(' '));
        const small = r.own.filter((t) => t.size < MIN_PX - 0.05).map((t) => [t.text, +t.size.toFixed(1)]);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/chef_${name}_${lang}_${size.join('x')}_dpr${dpr}.png` });
        console.log('MPR_CHEF', name, lang, size.join('x'), dpr, JSON.stringify({ card: [r.card.left, r.card.right, r.card.top, r.card.bottom].map(Math.round), covered: r.covered, underControls: r.underControls, small, msg }));
        expect(body, 'whole message drawn').toContain(norm(msg));
        expect(body).not.toContain('…');
        expect(small, 'chef text ≥ 12 CSS px').toEqual([]);
        expect(r.covered, 'no room text under the chef card').toEqual([]);
        expect(r.underControls, 'chef card clear of the touch controls').toEqual([]);
      });
    }
  });
}

// Check that the winter kale advice fits in the two languages with the longest wording.
for (const lang of ['el', 'pt']) for (const dpr of [1, 2]) {
  test.describe(`winter kale ${lang} 844x390 DPR${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test('already-have kale: whole line, inside the lane, above the plate', async ({ page }) => {
      // the plate is drawn with arc/ellipse, which the shared probe does not record: add their bounds
      await page.addInitScript(() => {
        const P = CanvasRenderingContext2D.prototype;
        const box = (ctx, cx, cy, rx, ry) => {
          const m = ctx.getTransform(), r = ctx.canvas.getBoundingClientRect();
          const pt = (x, y) => ({ x: r.left + (m.a * x + m.c * y + m.e) * r.width / ctx.canvas.width, y: r.top + (m.b * x + m.d * y + m.f) * r.height / ctx.canvas.height });
          (ctx.__introPoints ||= []).push(pt(cx - rx, cy - ry), pt(cx + rx, cy + ry));
        };
        const arc = P.arc; P.arc = function (x, y, rad, ...rest) { box(this, x, y, rad, rad); return arc.call(this, x, y, rad, ...rest); };
        const ell = P.ellipse; P.ellipse = function (x, y, rx, ry, ...rest) { box(this, x, y, rx, ry); return ell.call(this, x, y, rx, ry, ...rest); };
      });
      await open(page, lang, [844, 390], dpr, 2);
      for (const id of ['bread', 'egg', 'orange', 'banana']) await place(page, 'home', id);
      await nextPlate(page, 1);
      await place(page, 'market', 'kale');
      await waitS(page, "return s.chef?.key === 'already' && s.fridge.some((f) => f.id === 'kale' && !f.used)");
      const msg = await S(page, 'return s.chef.msg');
      const expected = await page.evaluate(async (l) => {
        const { FOOD_BY_ID } = await import('/src/data/foodwaste.js');
        const loc = await (await fetch(`/src/i18n/locales/${l}.json`)).json();
        return loc.meal_planner.already_have.replace('{{food}}', loc.foods.kale.toLocaleLowerCase(l)).replace('{{emoji}}', FOOD_BY_ID.kale.emoji);
      }, lang);
      const frame = await readIntroFrame(page);
      const floats = await S(page, 'return (s.floatingTexts || []).map((f) => ({ text: String(f.text).trim(), alpha: +Math.min(1, f.life).toFixed(2) }))');
      const r = chefReport(frame);
      expect(r.card, 'chef card drawn').toBeTruthy();
      // a food name floating up from the plate is transient: report it, then measure again once it is gone
      const transient = r.covered.filter((t) => floats.some((f) => f.text === t)).map((t) => ({ text: t, alpha: floats.find((f) => f.text === t).alpha }));
      const coveredRoom = r.covered.filter((t) => !floats.some((f) => f.text === t));
      await waitS(page, "return !(s.floatingTexts || []).length && s.chef?.key === 'already'");
      const settled = chefReport(await readIntroFrame(page));
      // the plate body: the largest white disc drawn before the card; its gold glow is reported too
      const before = frame.shapes.filter((x) => x.order < r.card.order);
      const round = (x) => Math.abs((x.right - x.left) - (x.bottom - x.top)) < 1;
      const plate = before.filter((x) => x.fill === '#ffffff' && round(x) && x.right - x.left > 40).sort((a, b) => (b.right - b.left) - (a.right - a.left))[0];
      const own = r.own.filter((t) => t.text.trim() && t.text !== '👨‍🍳');
      const body = norm(own.map((t) => t.text).join(' '));
      const lines = own.length - 1; // minus the name
      const outside = own.filter((t) => !inside(t, r.card)).map((t) => t.text);
      const small = own.filter((t) => t.size < MIN_PX - 0.05).map((t) => [t.text, +t.size.toFixed(1)]);
      const gap = +(plate.top - r.card.bottom).toFixed(1);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/kale_${lang}_844x390_dpr${dpr}.png` });
      console.log('MPR_KALE', lang, dpr, JSON.stringify({ msg, lines, card: [r.card.left, r.card.right, r.card.top, r.card.bottom].map((v) => +v.toFixed(1)),
        plate: [plate.left, plate.right, plate.top, plate.bottom].map((v) => +v.toFixed(1)), gapToPlate: gap, coveredRoom, transient, coveredSettled: settled.covered, underControls: r.underControls, small, outside }));
      expect(msg, 'the locale line, filled').toBe(expected);
      expect(body, 'whole line drawn').toContain(norm(msg));
      expect(body).not.toContain('…');
      expect(outside, 'every line inside the card').toEqual([]);
      expect(small, 'every line ≥ 12 CSS px').toEqual([]);
      expect(coveredRoom, 'no room text under the card').toEqual([]);
      expect(settled.covered, 'nothing under the card once the floating name is gone').toEqual([]);
      expect(r.underControls, 'clear of the touch controls').toEqual([]);
      expect(gap, 'card ends above the plate').toBeGreaterThanOrEqual(0);
    });
  });
}
