// Open the card, choose a side and confirm once using the touch controls.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission } from './helpers.js';
import { readScore } from './garden-tool-helpers.js';

const STAND = { food: { col: 8, row: 2, dir: 3 }, energy: { col: 4, row: 6, dir: 2 } };
const loc = (lang) => JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')).planetary;
const S = (page) => page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; return { choice: s.choice ? { key: s.choice.consoleKey, sel: s.choice.sel, needsPick: !!s.choice.needsPick } : null, made: s.choicesMade, reveal: !!s.reveal, feedback: !!s.choiceFeedback, transgressed: s.transgressedCount }; });

// The real numeric score — must be a finite number (null / undefined / NaN fail), and is
// CALIBRATED on this fixture: the first real decision food/B takes the score 0 → 25
// (safe limits 2 → 3, PB_POINTS_RECOVER = 25), so a wrong or constant hook cannot pass.
const num = async (page, label) => {
  const v = await readScore(page);
  expect(Number.isFinite(v), `${label}: score is a real finite number (got ${v})`).toBe(true);
  return v;
};

for (const vp of [{ width: 844, height: 390 }, { width: 1024, height: 768 }]) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ hasTouch: true, viewport: vp });
    for (const lang of ['el', 'en', 'nl', 'pt']) {
      test(`touch: nothing preselected, ◀/▶ pick, A confirms once — ${lang} ${vp.width}`, async ({ page }) => {
        const L = loc(lang);
        await bootMission(page, 'circular', 3, lang);
        const A = page.locator('[data-touch-control][data-key="Enter"]');
        const LEFT = page.locator('[data-touch-control][data-key="ArrowLeft"]');
        const RIGHT = page.locator('[data-touch-control][data-key="ArrowRight"]');
        await expect(A).toBeVisible();
        for (let i = 0; i < 4; i++) {
          const intro = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro);
          if (!intro) break; await page.waitForTimeout(500); await A.tap(); await page.waitForTimeout(400);
        }
        await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.irisOpenness >= 1, null, { timeout: 10_000 });
        let made = 0;
        for (const [key, side] of [['food', 0], ['energy', 1]]) {
          await page.evaluate((st) => { const p = document.querySelector('canvas')._stateRef.current.player; Object.assign(p, { col: st.col, row: st.row, dir: st.dir, pixelX: st.col * 32, pixelY: st.row * 32, fromX: st.col * 32, fromY: st.row * 32, toX: st.col * 32, toY: st.row * 32, moving: false }); }, STAND[key]);
          await page.waitForFunction((k) => document.querySelector('canvas')._stateRef.current.facingConsoleKey === k, key, { timeout: 5_000 });
          await A.tap(); await page.waitForTimeout(300);
          let s = await S(page);
          expect(s.choice?.key).toBe(key);
          expect(s.choice.sel, 'nothing preselected').toBeNull();
          expect(s.made, 'the opening tap did not confirm').toBe(made);
          const score0 = await num(page, `${key} before`);
          if (key === 'food') expect(score0, 'calibration: score 0 before the first decision').toBe(0);
          await A.tap(); await page.waitForTimeout(300);
          s = await S(page);
          expect(s.choice.sel).toBeNull();
          expect(s.choice.needsPick, '«choose first»').toBe(true);
          expect(s.made).toBe(made);
          expect(await num(page, `${key} after tap A without a pick`), 'score unchanged').toBe(score0);
          await (side === 0 ? LEFT : RIGHT).tap(); await page.waitForTimeout(300);
          s = await S(page);
          expect(s.choice.sel, `tap ${side === 0 ? '◀' : '▶'} picks`).toBe(side);
          expect(s.choice.needsPick).toBe(false);
          if (process.env.CONSOLE_CHOICE_SHOTS) { fs.mkdirSync(process.env.CONSOLE_CHOICE_SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.CONSOLE_CHOICE_SHOTS}/touch_${lang}_${vp.width}_${key}.png` }); }
          await A.tap(); await page.waitForTimeout(300);
          made += 1;
          expect((await S(page)).made, 'one decision').toBe(made);
          if (key === 'food') expect(await num(page, 'after food/B'), 'calibration: the real decision food/B (◀) gives 0 → 25').toBe(25);
          // dismiss the reveal / feedback with A
          for (let i = 0; i < 10; i++) { const q = await S(page); if (!q.reveal && !q.feedback && !q.choice) break; if (q.reveal) await A.tap(); await page.waitForTimeout(400); }
          expect((await S(page)).made).toBe(made);
        }
        void L;
      });
    }
  });
}
