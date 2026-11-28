// Check option taps, hidden movement controls and the Continue button on the application card.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission, pressEnter, pressKey } from './helpers.js';
import { readScore } from './garden-tool-helpers.js';

const loc = (lang) => JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')).planetary;
const STAND = { food: { col: 9, row: 3 }, energy: { col: 3, row: 7 }, transport: { col: 15, row: 7 }, materials: { col: 9, row: 12 } };
const touchVisible = (page) => page.evaluate(() => [...document.querySelectorAll('[data-touch-control]')].filter((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }).length);
const apply = (page) => page.evaluate(() => { const s = document.querySelector('canvas')?._stateRef?.current?.applyStep; return s ? { sel: s.sel, answer: s.answer } : null; });

async function toApply(page, lang) {
  await bootMission(page, 'circular', 3, lang);
  for (let i = 0; i < 4; i++) { if (!await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro)) break; await pressEnter(page); await page.waitForTimeout(400); }
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.irisOpenness >= 1, null, { timeout: 10_000 });
  for (const key of ['food', 'energy', 'transport', 'materials']) {
    await page.evaluate((st) => { const p = document.querySelector('canvas')._stateRef.current.player; Object.assign(p, { col: st.col, row: st.row, dir: 1, pixelX: st.col * 32, pixelY: st.row * 32, fromX: st.col * 32, fromY: st.row * 32, toX: st.col * 32, toY: st.row * 32, moving: false }); }, STAND[key]);
    await page.waitForFunction((k) => document.querySelector('canvas')._stateRef.current.facingConsoleKey === k, key, { timeout: 5_000 });
    await pressEnter(page);
    const side = await page.evaluate((k) => document.querySelector('canvas')._stateRef.current.consoles.find((c) => c.key === k).options.findIndex((o) => o.id === 'B'), key);
    await pressKey(page, side === 0 ? 'ArrowLeft' : 'ArrowRight'); await pressEnter(page); await page.waitForTimeout(200);
    for (let i = 0; i < 6; i++) { if (!await page.evaluate(() => !!document.querySelector('canvas')._stateRef.current.reveal)) break; await pressEnter(page); await page.waitForTimeout(250); }
  }
  await page.waitForFunction(() => !!document.querySelector('canvas')._stateRef.current.applyStep, null, { timeout: 5_000 });
}

for (const vp of [{ width: 844, height: 390 }, { width: 1024, height: 768 }]) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ hasTouch: true, viewport: vp });
    for (const lang of ['el', 'en']) {
      for (const pick of [1, 0]) {
        test(`touch: tap answers, Continue → result — ${lang} ${vp.width} pick=${pick}`, async ({ page }) => {
          const L = loc(lang);
          await toApply(page, lang);
          await expect(page.getByTestId('pb-apply-card')).toBeVisible();
          expect(await touchVisible(page), 'touch controls hidden while the card is open').toBe(0);
          const score0 = await readScore(page);
          await page.getByTestId(`pb-apply-opt-${pick}`).tap();
          await page.waitForTimeout(250);
          expect(await apply(page), 'one tap answers').toEqual({ sel: pick, answer: pick });
          await expect(page.getByTestId('pb-apply-feedback')).toHaveAttribute('data-right', pick === 1 ? '1' : '0');
          await expect(page.getByTestId('pb-apply-feedback')).toContainText(L.apply.explain);
          expect(await touchVisible(page)).toBe(0);
          // the canvas keeps the keyboard focus (the buttons never take it)
          expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');
          if (process.env.APPLICATION_STEP_SHOTS) { fs.mkdirSync(process.env.APPLICATION_STEP_SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.APPLICATION_STEP_SHOTS}/touch_${lang}_${vp.width}_${pick}.png` }); }
          await page.getByTestId('pb-apply-continue').tap();
          await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result', null, { timeout: 10_000 });
          const nav = await page.evaluate(() => window.__playfood.state().navigationData);
          expect(nav.score, 'score unchanged by the step').toBe(score0);
          expect(nav.stars).toBe(3);
        });
      }
    }
  });
}
