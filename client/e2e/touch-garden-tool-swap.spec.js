// Tap the action button to swap harvest tools and the drop button to put one down.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission } from './helpers.js';
import {
  BASKET_FACE, BIN_FACE, installGardenRecorder, frame, gs, mixedHarvest, place, readScore, drawnLines,
} from './garden-tool-helpers.js';

const loc = (lang) => JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')).garden;
const SHOTS = process.env.GARDEN_SHOTS;

for (const vp of [{ width: 844, height: 390 }, { width: 1024, height: 768 }]) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ hasTouch: true, viewport: vp });
    for (const lang of ['el', 'en', 'nl', 'pt']) {
      test(`touch A swaps both ways, B drops — ${lang} ${vp.width}x${vp.height}`, async ({ page }) => {
        const L = loc(lang);
        await installGardenRecorder(page);
        await bootMission(page, 'growing', 2, lang);
        const A = page.locator('[data-touch-control][data-key="Enter"]');
        const B = page.locator('[data-touch-control][data-key="q"]');
        await expect(A).toBeVisible(); await expect(B).toBeVisible();
        // dismiss the intro with a real tap on A
        await page.waitForTimeout(650); await A.tap();
        await page.waitForFunction(() => { const s = document.querySelector('canvas')?._stateRef?.current; return s && !s.showMissionIntro && s.irisOpenness >= 1; });

        // CALIBRATE the score reader with a real tap: one compost = +5 exactly
        await mixedHarvest(page, 'compost');
        await page.evaluate(() => {
          Object.assign(document.querySelector('canvas')._stateRef.current.plots.find((p) => p.col === 2 && p.row === 2), { health: 0, wilted: true, harvested: false });
        });
        const score0 = await readScore(page);
        expect(typeof score0, 'numeric score read').toBe('number');
        await place(page, { col: 2, row: 1, dir: 0 });
        await A.tap(); await page.waitForTimeout(300);
        const score1 = await readScore(page);
        expect(score1 - score0, 'calibration: one compost adds exactly +5').toBe(5);
        const before = await gs(page);
        await place(page, BASKET_FACE);
        await A.tap(); await page.waitForTimeout(300);
        let s = await gs(page);
        expect(s.carrying, 'tap A: bin → basket').toBe('harvest');
        expect(s.toast).toBe(L.tool_swapped_basket);
        for (const k of ['healthyHarvests', 'wrongToolCount', 'harvested']) expect(s[k], k).toEqual(before[k]);
        expect(await readScore(page), 'score unchanged by the tap-A swap').toBe(score1);
        // a second tap on the same tile: no second action
        await A.tap(); await page.waitForTimeout(300);
        expect((await gs(page)).carrying).toBe('harvest');
        expect(await readScore(page), 'score unchanged by the repeated tap').toBe(score1);
        if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/touch_${lang}_${vp.width}_swap.png` }); }

        await place(page, BIN_FACE);
        await A.tap(); await page.waitForTimeout(300);
        s = await gs(page);
        expect(s.carrying, 'tap A: basket → bin').toBe('compost');
        expect(s.toast).toBe(L.tool_swapped_bin);
        expect(await readScore(page), 'score unchanged by the second swap').toBe(score1);

        // B still drops
        await B.tap(); await page.waitForTimeout(300);
        s = await gs(page);
        expect(s.carrying, 'tap B drops').toBeNull();
        expect(s.toast).toContain(L.drop_carry);
        expect(await readScore(page), 'score unchanged by the tap-B drop').toBe(score1);

        // the swap objective names A (and not Q) — shown when the hand holds a tool with no work
        await mixedHarvest(page, 'compost');
        await page.evaluate(() => { document.querySelector('canvas')._stateRef.current.plots.find((p) => p.col === 3 && p.row === 2).harvested = true; });
        const fr = await frame(page);
        expect(drawnLines(fr, L.obj_swap_to_basket), 'objective drawn whole (may wrap)').toBeTruthy();
        expect(L.obj_swap_to_basket).toMatch(/\bA\b/);
        expect(L.obj_swap_to_basket).not.toMatch(/\bQ\b/);
        await place(page, BASKET_FACE);
        await A.tap(); await page.waitForTimeout(300);
        expect((await gs(page)).carrying, 'and A does what it says').toBe('harvest');
      });
    }
  });
}
