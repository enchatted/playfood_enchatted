// Check that opening or holding a control cannot select an answer and that scoring follows the option.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';
import { readScore } from './garden-tool-helpers.js';

const STAND = { food: { col: 8, row: 2, dir: 3 }, energy: { col: 4, row: 6, dir: 2 }, transport: { col: 14, row: 6, dir: 3 }, materials: { col: 9, row: 12, dir: 1 } };
const MINDFUL_SIDE = { food: 0, transport: 0, energy: 1, materials: 1 };
const loc = (lang) => JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')).planetary;
const S = (page) => page.evaluate(() => {
  const s = document.querySelector('canvas')._stateRef.current;
  return { choice: s.choice ? { key: s.choice.consoleKey, sel: s.choice.sel, needsPick: !!s.choice.needsPick } : null,
    made: s.choicesMade, transgressed: s.transgressedCount, reveal: !!s.reveal, feedback: !!s.choiceFeedback,
    boundaries: JSON.stringify(s.boundaries.map((b) => b.value ?? b.level ?? b.load ?? null)),
    order: Object.fromEntries(s.consoles.map((c) => [c.key, c.options.map((o) => o.id)])) };
});
// The real numeric score — must be a finite number (null / undefined / NaN fail), and is
// CALIBRATED on this fixture: the first real decision food/B takes the score 0 → 25
// (safe limits 2 → 3, PB_POINTS_RECOVER = 25), so a wrong or constant hook cannot pass.
const num = async (page, label) => {
  const v = await readScore(page);
  expect(Number.isFinite(v), `${label}: score is a real finite number (got ${v})`).toBe(true);
  return v;
};
const tap = async (page, key, ms = 90) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(200); };

async function boot(page, lang) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    window.__t = []; window.__rec = false; const P = CanvasRenderingContext2D.prototype; const o = P.fillText;
    P.fillText = function f(t, ...r) { if (window.__rec) window.__t.push(String(t)); return o.call(this, t, ...r); };
  });
  await bootMission(page, 'circular', 3, lang);
  for (let i = 0; i < 4; i++) {
    const intro = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro);
    if (!intro) break; await pressEnter(page); await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.irisOpenness >= 1, null, { timeout: 10_000 });
}
const drawn = async (page) => { await page.evaluate(() => { window.__t = []; window.__rec = true; }); await page.waitForTimeout(200); return page.evaluate(() => { window.__rec = false; return [...new Set(window.__t)]; }); };
async function face(page, key) {
  await page.evaluate((st) => { const p = document.querySelector('canvas')._stateRef.current.player; Object.assign(p, { col: st.col, row: st.row, dir: st.dir, pixelX: st.col * 32, pixelY: st.row * 32, fromX: st.col * 32, fromY: st.row * 32, toX: st.col * 32, toY: st.row * 32, moving: false }); }, STAND[key]);
  await page.waitForFunction((k) => document.querySelector('canvas')._stateRef.current.facingConsoleKey === k, key, { timeout: 5_000 });
}
async function settle(page) { // dismiss feedback / reveal until the room is free again (or the mission ends)
  for (let i = 0; i < 16; i++) { // Wait for the feedback to finish before continuing.
    if (await page.evaluate(() => !document.querySelector('canvas')?._stateRef)) return 'ended';
    const s = await S(page);
    if (!s.reveal && !s.feedback && !s.choice) return;
    if (s.reveal) await pressEnter(page); await page.waitForTimeout(400);
  }
}

for (const lang of ['el', 'en', 'nl', 'pt']) {
  test(`no preselection, real pick, one confirm, both sides — ${lang}`, async ({ page }) => {
    await boot(page, lang);
    const L = loc(lang);
    const s0 = await S(page);
    expect(s0.order, 'B: mindful left for food/transport, right for energy/materials').toEqual({ food: ['B', 'A'], energy: ['A', 'B'], transport: ['B', 'A'], materials: ['A', 'B'] });

    // the four cards in a row; pick the mindful side for food & energy, the high-impact side
    // for transport & materials — so index 0 AND 1 are both picked, and cards 2–4 come after
    // a previous decision
    const plan = [['food', 'B'], ['energy', 'B'], ['transport', 'A'], ['materials', 'A']];
    let made = 0;
    for (const [n, [key, id]] of plan.entries()) {
      await face(page, key);
      // an arrow HELD from walking into the console (blocked, so the avatar stays) while Enter
      // opens the card. Materials is faced from below (↑), so no ←/→ walk-in there.
      const holdKey = { food: 'ArrowRight', energy: 'ArrowLeft', transport: 'ArrowRight', materials: null }[key];
      if (holdKey) { await page.keyboard.down(holdKey); await page.waitForTimeout(120); }
      await pressEnter(page); await page.waitForTimeout(250);
      let s = await S(page);
      expect(s.choice?.key, `${key}: card open`).toBe(key);
      expect(s.choice.sel, `${key}: nothing preselected, held arrow ignored`).toBeNull();
      expect(s.made, `${key}: the opening press did not confirm`).toBe(made);
      if (holdKey) {
        await page.keyboard.up(holdKey); await page.waitForTimeout(150);
        expect((await S(page)).choice.sel, `${key}: releasing the held arrow does not select`).toBeNull();
      }
      let t = await drawn(page);
      expect(t.some((x) => x.includes(L.selected)), `${key}: no badge`).toBe(false);
      expect(t, `${key}: normal hint`).toContain(L.choose_hint);

      // confirm with nothing picked (Enter and Space): only the message
      const score0 = await num(page, `${key} before`); const before = await S(page);
      if (n === 0) expect(score0, 'calibration: score 0 before the first decision').toBe(0);
      await pressEnter(page); await tap(page, ' ');
      s = await S(page);
      expect(s.choice?.sel, `${key}: still nothing picked`).toBeNull();
      expect(s.choice.needsPick, `${key}: «choose first» raised`).toBe(true);
      for (const k of ['made', 'transgressed', 'boundaries', 'reveal']) expect(s[k], `${key}: ${k} unchanged`).toEqual(before[k]);
      expect(await num(page, `${key} after confirm without a pick`), `${key}: score unchanged`).toBe(score0);
      t = await drawn(page);
      expect(t, `${key}: «choose first» drawn`).toContain(L.choose_first);
      if (n === 0 && process.env.CONSOLE_CHOICE_SHOTS) { fs.mkdirSync(process.env.CONSOLE_CHOICE_SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.CONSOLE_CHOICE_SHOTS}/${lang}_choose_first.png` }); }

      // a real arrow picks the box that holds the wanted option; the message clears
      const want = s0.order[key].indexOf(id);
      await tap(page, want === 0 ? 'ArrowLeft' : 'ArrowRight');
      s = await S(page);
      expect(s.choice.sel, `${key}: picked box ${want}`).toBe(want);
      expect(s.choice.needsPick, `${key}: message cleared`).toBe(false);
      t = await drawn(page);
      expect(t, `${key}: hint back`).toContain(L.choose_hint);
      expect(t.some((x) => x.includes(L.selected)), `${key}: badge shown`).toBe(true);
      if (process.env.CONSOLE_CHOICE_SHOTS && n < 2) await page.screenshot({ path: `${process.env.CONSOLE_CHOICE_SHOTS}/${lang}_${key}_picked.png` });

      // HELD Enter: exactly one decision
      await page.keyboard.down('Enter'); await page.waitForTimeout(600); await page.keyboard.up('Enter');
      await page.waitForTimeout(250);
      s = await S(page);
      made += 1;
      expect(s.made, `${key}: one decision`).toBe(made);
      if (n === 0) expect(await num(page, 'after food/B'), 'calibration: the real decision food/B gives 0 → 25').toBe(25);
      const end = await settle(page);
      if (end !== 'ended') expect((await S(page)).made, `${key}: still one decision after the reveal`).toBe(made);
      else {
        expect(n, 'the mission ends only after the 4th decision').toBe(3);
        await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result', null, { timeout: 15_000 });
      }
    }
  });
}
