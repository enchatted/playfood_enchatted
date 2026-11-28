// Play the planting, watering and harvest phases with the on-screen controls.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission, touchHold } from './helpers.js';
import { readScore } from './garden-tool-helpers.js';
import {
  loc, plantProgressText, goalText, touchInput, gstate, drive, captureEvents, storeSnap,
  expectBarWhole, expectGoalLinesWhole, installRecorder, expectLostCard, stepMistakes,
} from './garden-progress-helpers.js';

const SHOTS = process.env.GARDEN_SHOTS;
const num = (v, what) => { expect(Number.isFinite(v), `${what} is a finite number (got ${v})`).toBe(true); return v; };

/** Hold A down (CDP touch) without releasing — the "planting press" kept on the screen. */
async function touchDown(page, locator) {
  const box = await locator.boundingBox();
  const client = await page.context().newCDPSession(page);
  const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  return async () => { await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
}

async function dismissIntroByTouch(page, A) {
  await page.waitForTimeout(650);
  await touchHold(page, A, 150);
  await page.waitForFunction(() => { const s = document.querySelector('canvas')?._stateRef?.current; return s && !s.showMissionIntro && s.irisOpenness >= 1; });
}

for (const vp of [{ width: 844, height: 390 }, { width: 1024, height: 768 }]) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ hasTouch: true, viewport: vp });
    for (const lang of ['el', 'en', 'nl', 'pt']) {
      if (vp.width === 844) {
        test(`touch: 3 wrong-season plantings still pass — ${lang} ${vp.width}x${vp.height}`, async ({ page }) => {
          test.setTimeout(260_000);
          const L = loc(lang);
          await bootMission(page, 'growing', 2, lang);
          const input = touchInput(page);
          await expect(input.A).toBeVisible();
          await page.evaluate(() => { window.__plan = ['R', 'W', 'R', 'W', 'R', 'W', 'R', 'R']; });
          const before = await storeSnap(page);
          let n = 0;
          const nav = await drive(page, input, {
            timeoutMs: 240_000,
            onPlanted: async (s) => {
              n++;
              expect(s.runLost).toBeNull();
              if (s.phase === 'PLANT') expect(s.progress).toBe(plantProgressText(L, lang, s.alive, 8 - s.planted));
              expect(s.goal).toBe(goalText(L));
            },
          });
          expect(n).toBe(8);
          expect(nav.passed).toBe(true);
          expect(nav.healthyHarvests).toBe(5);
          const after = await storeSnap(page);
          expect(after.points - before.points).toBe(nav.score);
          expect(after.growing).toContain(2);
        });
      }

      test(`touch: losing planting → frozen card → new A tap → result once → Try again — ${lang} ${vp.width}x${vp.height}`, async ({ page }) => {
        test.setTimeout(200_000);
        const L = loc(lang);
        const events = await captureEvents(page);
        await installRecorder(page);
        await bootMission(page, 'growing', 2, lang);
        const input = touchInput(page);
        await expect(input.A).toBeVisible();
        await page.evaluate(() => { window.__plan = ['R', 'W', 'W', 'W', 'W']; });
        for (let i = 0; i < 400; i++) {
          const s = await gstate(page);
          if (s.planted === 4 && s.carrying?.seed && !s.decisionEvent && !s.pendingEvent) break;
          const a = await page.evaluate(stepMistakes);
          if (a.act === 'enter') await input.enter(); else await page.waitForTimeout(a.ms || 100);
        }
        const answered = await page.evaluate(() => window.__evAnswered || {});
        expect(Object.keys(answered).length).toBe(2);
        const expectedScore = 10 + 10 * Object.values(answered).filter(Boolean).length;
        expect(num(await readScore(page), 'score'), 'calibrated').toBe(expectedScore);
        await expectBarWhole(page, `${lang} ${vp.width} before`);

        await page.evaluate(() => {
          const s = document.querySelector('canvas')._stateRef.current;
          const plot = s.plots.find((p) => p.season === s.activeSeason && !p.seed);
          const p = s.player; p.col = plot.col; p.row = plot.row + 1;
          p.pixelX = p.col * 32; p.pixelY = p.row * 32; p.fromX = p.pixelX; p.fromY = p.pixelY;
          p.toX = p.pixelX; p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = 1;
        });
        await page.waitForTimeout(150);
        // plant with A and KEEP the finger on it
        const release = await touchDown(page, input.A);
        await page.waitForTimeout(1600);
        let s = await gstate(page);
        expect(s.runLost, 'card up').not.toBeNull();
        expect(s.planted).toBe(5);
        expect(s.screen, 'the held planting tap does not close it').toBe('game');
        await release();

        // d-pad does not move the frozen avatar; no timer closes the card
        const pos0 = s.player;
        await touchHold(page, page.locator('[data-touch-control][data-key="ArrowLeft"]'), 700);
        await touchHold(page, input.B, 150);
        await page.waitForTimeout(4200);
        s = await gstate(page);
        expect(s.player).toEqual(pos0);
        expect(s.screen).toBe('game');
        expect(num(await readScore(page), 'score')).toBe(expectedScore);
        const card = await expectLostCard(page, L, lang, { wilted: 4 });
        // F1 on touch: tap Quit, tap the card behind the confirm, tap «Όχι» —
        // the card is still up and waits for a NEW tap of A
        await page.getByRole('button', { name: new RegExp(L.game.quit) }).tap();
        await expect(page.getByRole('button', { name: L.game.confirm_no, exact: true })).toBeVisible();
        await page.touchscreen.tap(card.cardCss.l + 24, card.cardCss.t + 12);
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: L.game.confirm_no, exact: true }).tap();
        await page.waitForTimeout(1200);
        s = await gstate(page);
        expect(s.screen, 'F1 touch: tap behind the quit confirm is not replayed').toBe('game');
        expect(s.runLost && s.runLost.dismissed).toBe(false);
        await expectBarWhole(page, `${lang} ${vp.width} lost`);
        await expectGoalLinesWhole(page, `${lang} ${vp.width} lost`);
        if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/touch_${lang}_${vp.width}_lost.png` }); }

        const before = await storeSnap(page);
        await touchHold(page, input.A, 150); // a NEW tap
        await expect.poll(async () => (await storeSnap(page)).screen, { timeout: 5000 }).toBe('result');
        const res = await storeSnap(page);
        expect(res.nav.passed).toBe(false);
        expect(res.nav.score).toBe(expectedScore);
        expect(res.points - before.points).toBe(expectedScore);
        expect(res.growing).toEqual(before.growing);
        await page.waitForTimeout(1500);
        expect((await storeSnap(page)).points).toBe(res.points);
        expect(events.filter((e) => e.type === 'game_finish' && e.game === 'GardenPlanner').length).toBe(1);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/touch_${lang}_${vp.width}_result.png` });

        await page.getByRole('button', { name: L.result.try_again }).tap();
        await page.waitForFunction(() => {
          const st = document.querySelector('canvas')?._stateRef?.current;
          return st && st.player && window.__playfood.state().currentScreen === 'game';
        });
        await page.waitForTimeout(400);
        const fresh = await page.evaluate(() => {
          const st = document.querySelector('canvas')._stateRef.current;
          return { planted: st.plantedCount, runLost: st.runLost, seeded: st.plots.filter((p) => p.seed).length, nav: window.__playfood.state().navigationData };
        });
        expect(fresh).toMatchObject({ planted: 0, runLost: null, seeded: 0 });
        expect(fresh.nav.roundSeed).toBe(res.nav.roundSeed);
        expect(num(await readScore(page), 'score')).toBe(0);
        const again = await storeSnap(page);
        expect(again.points).toBe(res.points);
        expect(again.growing).toEqual(before.growing);
      });
    }
  });
}
