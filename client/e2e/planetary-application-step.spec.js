// Check console feedback, answer selection, source links and the score before and after the application step.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission, pressEnter, pressKey } from './helpers.js';
import { readScore } from './garden-tool-helpers.js';

const loc = (lang) => JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')).planetary;
const ORDER = ['climate', 'biosphere', 'land', 'freshwater', 'biogeochemical', 'ocean', 'novel', 'aerosols', 'ozone'];
const STAND = { food: { col: 9, row: 3 }, energy: { col: 3, row: 7 }, transport: { col: 15, row: 7 }, materials: { col: 9, row: 12 } };

const S = (page) => page.evaluate(() => {
  const s = document.querySelector('canvas')?._stateRef?.current;
  if (!s) return null;
  return {
    reveal: s.reveal ? { final: !!s.reveal.final } : null,
    choice: s.choice ? { key: s.choice.consoleKey, sel: s.choice.sel } : null,
    apply: s.applyStep ? { sel: s.applyStep.sel, answer: s.applyStep.answer, needsPick: !!s.applyStep.needsPick } : null,
    made: s.choicesMade, intro: !!s.showMissionIntro, iris: s.irisOpenness,
    feedback: s.choiceFeedback ? { text: s.choiceFeedback.text, lines: s.choiceFeedback.effectLines } : null,
    consoles: s.consoles.map((c) => ({ key: c.key, chosen: c.chosen, ids: c.options.map((o) => o.id), effects: c.options.map((o) => o.effects) })),
    shorts: s.boundaries.map((b) => b.short),
    values: Object.fromEntries(s.boundaries.map((b) => [b.key, b.value])),
  };
});

async function boot(page, lang) {
  await bootMission(page, 'circular', 3, lang);
  for (let i = 0; i < 4; i++) { const s = await S(page); if (!s.intro) break; await pressEnter(page); await page.waitForTimeout(400); }
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.irisOpenness >= 1, null, { timeout: 10_000 });
}

// commit one console with the option id (A / B), REAL keys; returns the state right after
async function decide(page, key, id) {
  await page.evaluate((st) => { const p = document.querySelector('canvas')._stateRef.current.player; Object.assign(p, { col: st.col, row: st.row, dir: 1, pixelX: st.col * 32, pixelY: st.row * 32, fromX: st.col * 32, fromY: st.row * 32, toX: st.col * 32, toY: st.row * 32, moving: false }); }, STAND[key]);
  await page.waitForFunction((k) => document.querySelector('canvas')._stateRef.current.facingConsoleKey === k, key, { timeout: 5_000 });
  await pressEnter(page);
  await page.waitForFunction((k) => document.querySelector('canvas')._stateRef.current.choice?.consoleKey === k, key, { timeout: 5_000 });
  const s = await S(page);
  const side = s.consoles.find((c) => c.key === key).ids.indexOf(id);
  await pressKey(page, side === 0 ? 'ArrowLeft' : 'ArrowRight');
  await pressEnter(page);
  await page.waitForTimeout(150);
  const after = await S(page);
  return { ...after, before: s.values };
}

// F1: the expected lists come from the REAL values read from the game before / after
// the decision (not from the option's raw effects), so a value held at the clamp is not listed.
function expectedLines(L, before, after) {
  const better = ORDER.filter((k) => after[k] < before[k]).map((k) => L[`bs_${k}`]);
  const worse = ORDER.filter((k) => after[k] > before[k]).map((k) => L[`bs_${k}`]);
  return [
    better.length ? L.effects_better.replace('{{list}}', better.join(' · ')) : null,
    worse.length ? L.effects_worse.replace('{{list}}', worse.join(' · ')) : null,
  ].filter(Boolean);
}

// play the 4 consoles; dismiss each reveal; stop at the application step
async function playToApply(page, L, route, { holdArrowOnFinal = false } = {}) {
  const keys = ['food', 'energy', 'transport', 'materials'];
  for (const [n, key] of keys.entries()) {
    const id = route[n];
    const s = await decide(page, key, id);
    expect(s.feedback?.lines, `${key}/${id}: feedback lines = real before/after, locale, board order`).toEqual(expectedLines(L, s.before, s.values));
    for (let i = 0; i < 6; i++) {
      const q = await S(page);
      if (!q.reveal) break;
      if (q.reveal.final && holdArrowOnFinal) {
        await page.keyboard.down('ArrowRight'); await page.waitForTimeout(120);
        await pressEnter(page);
        await page.waitForTimeout(250);
        const a = await S(page);
        expect(a.apply?.sel, 'an arrow held from before the step does not pick').toBeNull();
        await page.keyboard.up('ArrowRight'); await page.waitForTimeout(150);
        expect((await S(page)).apply?.sel, 'releasing it does not pick either').toBeNull();
        break;
      }
      await pressEnter(page); await page.waitForTimeout(250);
    }
  }
  await page.waitForFunction(() => !!document.querySelector('canvas')._stateRef.current.applyStep, null, { timeout: 5_000 });
}

async function cardGeometry(page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="pb-apply-card"]');
    const stage = document.querySelector('[data-testid="pb-apply"]');
    const r = card.getBoundingClientRect(); const st = stage.getBoundingClientRect();
    const touch = [...document.querySelectorAll('[data-touch-control]')].filter((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }).length;
    return {
      inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      inStage: r.left >= st.left - 0.5 && r.top >= st.top - 0.5 && r.right <= st.right + 0.5 && r.bottom <= st.bottom + 0.5,
      noScroll: card.scrollHeight <= card.clientHeight + 1,
      touchVisible: touch,
    };
  });
}

const resultNav = (page) => page.evaluate(() => { const s = window.__playfood.state(); return { screen: s.currentScreen, nav: s.navigationData }; });

for (const vp of [{ width: 1366, height: 768 }, { width: 844, height: 390 }]) {
  for (const lang of ['el', 'en']) {
    for (const answer of ['share', 'keep']) {
      test(`apply step ${lang} ${vp.width} answer=${answer}`, async ({ page }) => {
        await page.setViewportSize(vp);
        const L = loc(lang);
        await boot(page, lang);
        await playToApply(page, L, answer === 'share' ? 'BBBB' : 'BABB', { holdArrowOnFinal: answer === 'share' });

        const scoreBefore = await readScore(page);
        const starsBefore = await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; return s.boundaries.filter((b) => b.value > b.limit).length; });
        const card = page.getByTestId('pb-apply-card');
        await expect(card).toBeVisible();
        await expect(page.getByTestId('pb-apply-question')).toHaveText(L.apply.question);
        await expect(page.getByTestId('pb-apply-context')).toHaveText(L.apply.context);
        await expect(page.getByTestId('pb-apply-opt-0')).toContainText(L.apply.opt_keep);
        await expect(page.getByTestId('pb-apply-opt-1')).toContainText(L.apply.opt_share);
        let s = await S(page);
        expect(s.apply, 'opens with nothing picked').toEqual({ sel: null, answer: null, needsPick: false });
        let g = await cardGeometry(page);
        expect(g, 'card fits, no touch controls').toEqual({ inView: true, inStage: true, noScroll: true, touchVisible: 0 });
        if (process.env.APPLICATION_STEP_SHOTS) { fs.mkdirSync(process.env.APPLICATION_STEP_SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.APPLICATION_STEP_SHOTS}/${lang}_${vp.width}_q.png` }); }

        // Enter without a pick: only «choose first»
        await pressEnter(page);
        s = await S(page);
        expect(s.apply).toEqual({ sel: null, answer: null, needsPick: true });
        await expect(page.getByTestId('pb-apply-hint')).toHaveText(L.choose_first);
        // Escape does nothing here
        await pressKey(page, 'Escape');
        expect((await S(page)).apply?.answer).toBeNull();
        await expect(card).toBeVisible();

        // pick with a real arrow, answer with Enter
        const want = answer === 'share' ? 1 : 0;
        await pressKey(page, want === 1 ? 'ArrowRight' : 'ArrowLeft');
        s = await S(page);
        expect(s.apply).toEqual({ sel: want, answer: null, needsPick: false });
        await expect(page.getByTestId(`pb-apply-opt-${want}`)).toHaveAttribute('aria-pressed', 'true');
        await pressEnter(page);
        s = await S(page);
        expect(s.apply.answer, 'answered').toBe(want);
        const fb = page.getByTestId('pb-apply-feedback');
        await expect(fb).toHaveAttribute('data-right', answer === 'share' ? '1' : '0');
        await expect(fb).toContainText(answer === 'share' ? L.apply.right_head : L.apply.other_head);
        await expect(fb).toContainText(answer === 'share' ? L.apply.explain : `${L.apply.other_prefix} ${L.apply.explain}`);
        await expect(page.getByTestId('pb-apply-you')).toContainText(answer === 'share' ? L.apply.opt_share : L.apply.opt_keep);
        await expect(page.getByTestId('pb-apply-source')).toContainText('Shaping a Sharing Economy: Amsterdam');
        g = await cardGeometry(page);
        expect(g, 'feedback fits, no touch controls').toEqual({ inView: true, inStage: true, noScroll: true, touchVisible: 0 });
        if (process.env.APPLICATION_STEP_SHOTS) await page.screenshot({ path: `${process.env.APPLICATION_STEP_SHOTS}/${lang}_${vp.width}_${answer}.png` });

        // arrows after the answer change nothing
        await pressKey(page, want === 1 ? 'ArrowLeft' : 'ArrowRight');
        expect((await S(page)).apply.answer).toBe(want);

        // S opens the registered source (window.open stubbed)
        await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
        await pressKey(page, 's');
        expect(await page.evaluate(() => window.__opened)).toEqual(['/source.html?src=circular-city-amsterdam']);

        // score unchanged by the step
        expect(await readScore(page), 'score not touched by the step').toBe(scoreBefore);

        // Enter → result, same score and stars
        await pressEnter(page);
        await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result', null, { timeout: 10_000 });
        const r = await resultNav(page);
        expect(r.nav.score, 'result score = score before the step').toBe(scoreBefore);
        expect(r.nav.transgressed, 'result transgressed = before the step').toBe(starsBefore);
        expect(r.nav.stars, 'stars from the boundaries only').toBe(answer === 'share' ? 3 : 1);
        test.info().annotations.push({ type: 'nav', description: JSON.stringify(r.nav).slice(0, 400) });
      });
    }
  }
}

test('the step shows on every run (Play again)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const L = loc('el');
  for (let run = 0; run < 2; run++) {
    await boot(page, 'el');
    await playToApply(page, L, 'BBBB');
    await expect(page.getByTestId('pb-apply-card'), `run ${run + 1}`).toBeVisible();
    await pressKey(page, 'ArrowRight'); await pressEnter(page);
    await page.getByTestId('pb-apply-continue').click();
    await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result', null, { timeout: 10_000 });
  }
});

test('Instructions during the step hide the card, closing them brings it back', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const L = loc('el');
  await boot(page, 'el');
  await playToApply(page, L, 'BBBB');
  await expect(page.getByTestId('pb-apply-card')).toBeVisible();
  await page.getByRole('button', { name: /Πώς παίζω/ }).click();
  await expect(page.getByTestId('pb-apply-card')).toHaveCount(0);
  await page.locator('canvas').focus();
  await pressEnter(page);
  await expect(page.getByTestId('pb-apply-card')).toBeVisible();
  expect((await S(page)).apply).toEqual({ sel: null, answer: null, needsPick: false });
});

for (const lang of ['nl', 'pt']) {
  test(`application text fits ${lang} 844`, async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    const L = loc(lang);
    await boot(page, lang);
    await playToApply(page, L, 'BBBB');
    await expect(page.getByTestId('pb-apply-question')).toHaveText(L.apply.question);
    expect(await cardGeometry(page)).toEqual({ inView: true, inStage: true, noScroll: true, touchVisible: 0 });
    await pressKey(page, 'ArrowRight'); await pressEnter(page);
    await expect(page.getByTestId('pb-apply-feedback')).toContainText(L.apply.explain);
    expect(await cardGeometry(page)).toEqual({ inView: true, inStage: true, noScroll: true, touchVisible: 0 });
  });
}

// The card is sized in canvas units × the canvas scale, like the canvas cards (choice card 760
// wide): at a large window it grows with them, and it never shrinks below 13/15 of its size
// (so the text stays readable on a phone). Measured against the REAL canvas choice card width.
for (const vp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 2560, height: 1300 }, { width: 844, height: 390 }]) {
  test(`card scales like the canvas cards ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await boot(page, 'el');
    const k = await page.evaluate(() => { const c = document.querySelector('canvas'); return c.getBoundingClientRect().width / 1280; });
    await playToApply(page, loc('el'), 'BBBB');
    const m = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="pb-apply-card"]').getBoundingClientRect();
      const q = getComputedStyle(document.querySelector('[data-testid="pb-apply-question"]')).fontSize;
      const opt = getComputedStyle(document.querySelector('.pb-apply-ot')).fontSize;
      return { w: card.width, q: parseFloat(q), opt: parseFloat(opt), k: Number(document.querySelector('[data-testid="pb-apply"]').dataset.k) };
    });
    const kk = Math.max(k, 13 / 15);
    expect(m.k, 'card scale = canvas scale (min 13/15)').toBeCloseTo(kk, 2);
    const avail = vp.width - 2 * 8 * kk;
    expect(Math.abs(m.w - Math.min(760 * kk, avail)), `card width ${m.w} vs ${760 * kk}`).toBeLessThan(2);
    expect(Math.abs(m.opt - 15 * kk), 'option text = canvas card text size').toBeLessThan(0.6);
    expect(m.opt, 'option text never below 13 CSS px').toBeGreaterThanOrEqual(12.9);
    expect(await cardGeometry(page)).toEqual({ inView: true, inStage: true, noScroll: true, touchVisible: 0 });
    await pressKey(page, 'ArrowRight'); await pressEnter(page);
    expect(await cardGeometry(page), 'feedback state fits too').toEqual({ inView: true, inStage: true, noScroll: true, touchVisible: 0 });
    if (process.env.APPLICATION_STEP_SHOTS) { fs.mkdirSync(process.env.APPLICATION_STEP_SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.APPLICATION_STEP_SHOTS}/scale_${vp.width}.png` }); }
  });
}


// F1 (06/10): on A/A/A/A Climate climbs 78 → 84 → 96 → 100 and stays 100 on Materials A.
// The Materials feedback must NOT list Climate as «got worse» (its raw effect is still +6).
test('a value held at the clamp is not reported (AAAA, Climate 100 → 100)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const L = loc('el');
  await boot(page, 'el');
  const climate = [];
  let last;
  for (const key of ['food', 'energy', 'transport', 'materials']) {
    const s = await decide(page, key, 'A');
    climate.push(s.values.climate);
    last = s;
    for (let i = 0; i < 6; i++) { const q = await S(page); if (!q.reveal || q.reveal.final) break; await pressEnter(page); await page.waitForTimeout(250); }
  }
  expect(climate, 'Climate after each decision').toEqual([84, 96, 100, 100]);
  expect(last.before.climate).toBe(100);
  expect(last.feedback.lines.join(' | '), 'Climate not listed on Materials A').not.toContain(L.bs_climate);
  expect(last.feedback.lines).toEqual(expectedLines(L, last.before, last.values));
  expect(last.feedback.lines.length, 'the real changes are still listed').toBeGreaterThan(0);
});

// F2 (06/10): a key held while Instructions / the exit confirm are open must not pick,
// answer or continue when the step comes back — it needs a release and a NEW press.
test('an arrow held through Instructions does not pick', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const L = loc('el');
  await boot(page, 'el');
  await playToApply(page, L, 'BBBB');
  expect((await S(page)).apply).toEqual({ sel: null, answer: null, needsPick: false });
  await page.getByRole('button', { name: new RegExp(JSON.parse(fs.readFileSync('src/i18n/locales/el.json', 'utf8')).game.instructions) }).click();
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.showMissionIntro === true);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(200);
  await pressEnter(page); // closes the guide, the arrow is still held
  await page.waitForTimeout(400);
  let s = await S(page);
  expect(s.intro).toBe(false);
  expect(s.apply.sel, 'held arrow did not pick').toBeNull();
  await page.keyboard.up('ArrowRight'); await page.waitForTimeout(200);
  expect((await S(page)).apply.sel, 'release alone does not pick').toBeNull();
  await pressKey(page, 'ArrowRight');
  expect((await S(page)).apply.sel, 'a NEW press picks').toBe(1);
  await pressEnter(page);
  expect((await S(page)).apply.answer).toBe(1);
});

test('Space held through the exit confirm does not continue', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const L = loc('el');
  const G = JSON.parse(fs.readFileSync('src/i18n/locales/el.json', 'utf8')).game;
  await boot(page, 'el');
  await playToApply(page, L, 'BBBB');
  await pressKey(page, 'ArrowRight'); await pressEnter(page);
  expect((await S(page)).apply.answer).toBe(1);
  await page.getByRole('button', { name: new RegExp(G.quit) }).click();
  await expect(page.getByRole('button', { name: G.confirm_no })).toBeVisible();
  await page.keyboard.down(' '); await page.waitForTimeout(200);
  await page.getByRole('button', { name: G.confirm_no }).click(); // Cancel, Space still held
  await page.waitForTimeout(500);
  let s = await S(page);
  expect(s?.apply?.answer, 'still on the step').toBe(1);
  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).not.toBe('result');
  await page.keyboard.up(' '); await page.waitForTimeout(300);
  expect((await S(page))?.apply?.answer, 'release alone does not continue').toBe(1);
  await pressKey(page, ' ');
  await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result', null, { timeout: 10_000 });
});

test('an arrow held through Pause (mouse Resume) does not pick', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const L = loc('el');
  const G = JSON.parse(fs.readFileSync('src/i18n/locales/el.json', 'utf8')).game;
  await boot(page, 'el');
  await playToApply(page, L, 'BBBB');
  await page.getByRole('button', { name: new RegExp(G.pause) }).click();
  await expect(page.getByTestId('pb-apply-card')).toHaveCount(0);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(200);
  const resume = page.getByRole('button', { name: new RegExp(G.resume || 'Συνέχεια') }).first();
  await resume.click();
  await page.waitForTimeout(400);
  expect((await S(page)).apply.sel, 'held arrow did not pick').toBeNull();
  await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(200);
  await page.locator('canvas').focus();
  await pressKey(page, 'ArrowLeft');
  expect((await S(page)).apply.sel, 'a NEW press picks').toBe(0);
});
