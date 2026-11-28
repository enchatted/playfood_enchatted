// Measure the step banner and lost-round card at different pixel densities.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';
import {
  loc, keyboardInput, drive, installRecorder, expectLostCard, expectBannerClear,
} from './garden-progress-helpers.js';

const LANGS = ['el', 'en', 'nl', 'pt'];
const VIEWPORTS = [[1366, 768], [1024, 768], [844, 390], [1920, 700]];
// plus 844×390 on a 2× screen: backing store 1688×780, same CSS sizes expected
const RETINA = [[844, 390, 2]];
const SHOTS = process.env.GARDEN_SHOTS;
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function startRound(page, lang) {
  await bootMission(page, 'growing', 2, lang);
  await page.waitForTimeout(650); await pressEnter(page);
  await page.waitForFunction(() => {
    const s = document.querySelector('canvas')?._stateRef?.current;
    return s && !s.showMissionIntro && s.irisOpenness >= 1;
  });
}

for (const [w, h, dpr = 1] of [...VIEWPORTS, ...RETINA]) {
  for (const lang of (dpr === 1 ? LANGS : ['el', 'en'])) {
    test.describe(`${w}x${h}${dpr > 1 ? `@${dpr}x` : ''} ${lang}`, () => {
      test.use({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });

      test(`step banner: whole box below the bar, in every phase — ${lang} ${w}x${h}`, async ({ page }) => {
        const L = loc(lang);
        await installRecorder(page);
        await startRound(page, lang);
        const cases = [
          { phase: 'PLANT', planted: 1, key: 'obj_pick_seed' },
          { phase: 'WATER', planted: 8, key: 'obj_pick_can' },
          { phase: 'HARVEST', planted: 8, key: 'obj_pick_tool' },
        ];
        for (const c of cases) {
          await page.evaluate(({ c }) => {
            const s = document.querySelector('canvas')._stateRef.current;
            let n = 0;
            for (const p of s.plots) {
              const i = n++;
              Object.assign(p, i < c.planted
                ? { seed: { id: 'cabbage', emoji: '🥬' }, wilted: i < 3, health: c.phase === 'PLANT' ? 0 : (i < 3 ? 0 : (c.phase === 'WATER' ? 1 : 2)), harvested: false }
                : { seed: null, wilted: false, health: 0, harvested: false });
            }
            s.plantedCount = c.planted; s.phase = c.phase; s.carrying = null;
          }, { c });
          await page.waitForTimeout(450);
          await expectBannerClear(page, L.garden[c.key], `${lang} ${w}x${h} ${c.phase}`);
        }
        await shot(page, `banner_${w}x${h}_${lang}`);
      });

      test(`run-lost card: real font sizes and whole card, from the real round — ${lang} ${w}x${h}`, async ({ page }) => {
        test.setTimeout(180_000);
        const L = loc(lang);
        await installRecorder(page);
        await bootMission(page, 'growing', 2, lang);
        await page.evaluate(() => { window.__plan = ['R', 'W', 'W', 'W', 'W']; });
        const out = await drive(page, keyboardInput(page));
        expect(out, 'the 5th planting freezes the round').toBe('lost');
        await page.waitForTimeout(600);
        const { measured } = await expectLostCard(page, L, lang, { wilted: 4 });
        expect(measured.fonts.body).toBeGreaterThanOrEqual(13.95);
        await shot(page, `card_${w}x${h}_${lang}`);
      });
    });
  }
}
