// Use keyboard input to check phase goals, progress, scoring and the end of an unwinnable round.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission, pressEnter, pressKey } from './helpers.js';
import { readScore } from './garden-tool-helpers.js';
import {
  loc, plantProgressText, waterProgressText, harvestProgressText, goalText,
  keyboardInput, gstate, drive, captureEvents, storeSnap, expectBarWhole,
  expectGoalLinesWhole, installRecorder, expectLostCard, stepMistakes, expectBannerClear,
} from './garden-progress-helpers.js';

const placeAt = (page, where) => page.evaluate((w) => {
  const s = document.querySelector('canvas')._stateRef.current;
  const t = w === 'plot' ? s.plots.find((p) => p.season === s.activeSeason && !p.seed) : w;
  const p = s.player; p.col = t.col; p.row = t.row + 1;
  p.pixelX = p.col * 32; p.pixelY = p.row * 32; p.fromX = p.pixelX; p.fromY = p.pixelY;
  p.toX = p.pixelX; p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = 1;
}, where);
const crateIds = (page) => page.evaluate(() => document.querySelector('canvas')._stateRef.current.seedCrates.map((c) => c.seedId));
const stars = (page) => page.evaluate(() => window.__playfood.state().gameStars?.['growing:GardenPlanner'] ?? 0);
/** Drive with the planting plan until the given planting is in hand (seed carried, no card up). */
async function driveToPlanting(page, input, plantedBefore) {
  for (let i = 0; i < 600; i++) {
    const s = await gstate(page);
    if (s.planted === plantedBefore && s.carrying?.seed && !s.decisionEvent && !s.pendingEvent) return;
    const a = await page.evaluate(stepMistakes);
    if (a.act === 'enter') await input.enter(); else await page.waitForTimeout(a.ms || 100);
  }
  throw new Error('did not reach the planting');
}

const LANGS = ['el', 'en', 'nl', 'pt'];
const SHOTS = process.env.GARDEN_SHOTS;
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const num = (v, what) => { expect(Number.isFinite(v), `${what} is a finite number (got ${v})`).toBe(true); return v; };

for (const lang of LANGS) {
  test.describe(`keyboard ${lang}`, () => {
    test.use({ viewport: { width: 1366, height: 768 } });

    test(`3 wrong-season plantings: the bar counts along and the round still passes — ${lang}`, async ({ page }) => {
      test.setTimeout(240_000);
      const L = loc(lang);
      const events = await captureEvents(page);
      await bootMission(page, 'growing', 2, lang);
      await page.evaluate(() => { window.__plan = ['W', 'R', 'W', 'R', 'W', 'R', 'R', 'R']; });
      const before = await storeSnap(page);
      // goal is fixed from the first frame
      await expect.poll(async () => (await gstate(page)).goal).toBe(goalText(L));
      const seen = [];
      const nav = await drive(page, keyboardInput(page), {
        onPlanted: async (s) => {
          expect(s.runLost, 'never lost with ≤3 mistakes').toBeNull();
          if (s.phase === 'PLANT') {
            expect(s.progress, `after planting ${s.planted}`).toBe(plantProgressText(L, lang, s.alive, 8 - s.planted));
          }
          seen.push(s.progress);
          expect(s.goal).toBe(goalText(L));
        },
      });
      expect(seen.length, 'checked after every planting').toBe(8);
      expect(nav.passed, 'passes with exactly 5').toBe(true);
      expect(nav.healthyHarvests).toBe(5);
      const after = await storeSnap(page);
      expect(after.points - before.points, 'round points credited once').toBe(nav.score);
      expect(after.growing).toContain(2);
      await page.waitForTimeout(1500);
      expect((await storeSnap(page)).points, 'and not again').toBe(after.points);
      const finishes = events.filter((e) => e.type === 'game_finish' && e.game === 'GardenPlanner');
      expect(finishes.length, 'one game_finish').toBe(1);
    });

    test(`WATER and HARVEST progress lines follow the real round — ${lang}`, async ({ page }) => {
      test.setTimeout(240_000);
      const L = loc(lang);
      await bootMission(page, 'growing', 2, lang);
      await page.evaluate(() => { window.__plan = ['W', 'R', 'R', 'R', 'R', 'R', 'R', 'R']; });
      const input = keyboardInput(page);
      const checks = { WATER: false, HARVEST: [] };
      // step the same driver by hand so we can read the bar between actions
      for (let i = 0; i < 900; i++) {
        const s = await gstate(page);
        if (s.screen === 'result') break;
        if (s.phase === 'WATER' && !checks.WATER) {
          await page.waitForTimeout(260);
          expect((await gstate(page)).progress).toBe(waterProgressText(L, 7));
          checks.WATER = true;
        }
        if (s.phase === 'HARVEST') {
          await page.waitForTimeout(260);
          const now = await gstate(page);
          if (now.screen === 'game' && !checks.HARVEST.includes(now.healthyHarvests)) {
            expect(now.progress).toBe(harvestProgressText(L, now.healthyHarvests));
            checks.HARVEST.push(now.healthyHarvests);
          }
        }
        const a = await page.evaluate(stepMistakes);
        if (a.act === 'done') break;
        if (a.act === 'enter') await input.enter();
        else if (a.act === 'hold') await input.hold(a.ms);
        else if (a.act === 'drop') await input.drop();
        else await page.waitForTimeout(a.ms || 100);
      }
      expect(checks.WATER).toBe(true);
      expect(checks.HARVEST.length, 'harvest counter seen moving').toBeGreaterThanOrEqual(5);
    });

    test(`4th wrong planting: frozen card, new press, result once, clean Try again — ${lang}`, async ({ page }) => {
      test.setTimeout(240_000);
      const L = loc(lang);
      const events = await captureEvents(page);
      await installRecorder(page);
      await bootMission(page, 'growing', 2, lang);
      // planting 1 right (+10), then wrong ×4: the 5th planting makes 5 unreachable
      await page.evaluate(() => { window.__plan = ['R', 'W', 'W', 'W', 'W']; });
      // an earlier best of 3★ must survive this failed round (history kept)
      await page.evaluate(() => { const st = window.__playfood.state(); window.__playfood.setProgress({ gameStars: { ...st.gameStars, 'growing:GardenPlanner': 3 } }); });
      const roundCrates = await crateIds(page);
      const input = keyboardInput(page);

      // drive up to the carried seed of the losing planting, then plant it by hand
      for (let i = 0; i < 400; i++) {
        const s = await gstate(page);
        if (s.planted === 4 && s.carrying?.seed && !s.decisionEvent && !s.pendingEvent) break;
        const a = await page.evaluate(stepMistakes);
        if (a.act === 'enter') await input.enter(); else await page.waitForTimeout(a.ms || 100);
      }
      const pre = await gstate(page);
      expect(pre.wilted, 'three mistakes so far').toBe(3);
      expect(pre.runLost).toBeNull();
      expect(pre.progress).toBe(plantProgressText(L, lang, 1, 4));
      // CALIBRATE the score reader: planting 1 (+10) + answered autumn/winter events
      // Exact, not derived from the app's own verdict (point 4): the first
      // option of both autumn and winter cards is the correct one.
      const answered = await page.evaluate(() => window.__evAnswered || {});
      expect(answered, 'autumn + winter cards answered correctly').toEqual({ seed_choice: true, companions: true });
      const expectedScore = 30; // planting 1 (+10) + two correct answers (+10 +10)
      expect(num(await readScore(page), 'score'), 'calibrated: plant + answered events').toBe(expectedScore);

      // face the plot and plant with a press that is HELD through the card
      await page.evaluate(() => {
        const s = document.querySelector('canvas')._stateRef.current;
        const plot = s.plots.find((p) => p.season === s.activeSeason && !p.seed);
        const p = s.player; p.col = plot.col; p.row = plot.row + 1;
        p.pixelX = p.col * 32; p.pixelY = p.row * 32; p.fromX = p.pixelX; p.fromY = p.pixelY;
        p.toX = p.pixelX; p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = 1;
      });
      await page.waitForTimeout(150);
      await input.confirmDown();
      await page.waitForTimeout(200);
      let s = await gstate(page);
      expect(s.runLost, 'card up on the losing planting').not.toBeNull();
      expect(s.planted).toBe(5);
      expect(s.wilted).toBe(4);
      expect(s.pendingEvent, 'the spring event is not queued behind the card').toBe(false);
      expect(s.decisionEvent).toBe(false);
      await page.waitForTimeout(1500); // still holding the planting press
      s = await gstate(page);
      expect(s.screen, 'the planting press does not close it').toBe('game');
      expect(s.runLost).not.toBeNull();
      await input.confirmUp();

      // frozen world: arrows do nothing, no timer closes the card
      const pos0 = s.player;
      await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(700); await page.keyboard.up('ArrowLeft');
      await pressKey(page, 'q');
      // the KEYBOARD A walks left — it must not close the card (F3 / point 5)
      await page.keyboard.down('a'); await page.waitForTimeout(300); await page.keyboard.up('a');
      await page.waitForTimeout(4200);
      s = await gstate(page);
      expect(s.player, 'avatar frozen').toEqual(pos0);
      expect(s.screen, 'no timer: still on the card after > 4 s').toBe('game');
      expect(s.runLost.dismissed).toBe(false);
      expect(num(await readScore(page), 'score'), 'nothing scored while frozen').toBe(expectedScore);

      const card = await expectLostCard(page, L, lang, { wilted: 4 });
      expect(card.wrongLine).toContain('🥀');
      await shot(page, `kbd_${lang}_lost_card`);
      // a point on the card's title bar — away from the guide's source pill, which opens a tab
      const cx = card.cardCss.l + 24; const cy = card.cardCss.t + 12;

      // F1: a click on the card while «Σίγουρα έξοδος;» is open is NOT
      // kept for later — after «Όχι» the card still waits for a new press.
      await page.getByRole('button', { name: new RegExp(L.game.quit) }).click();
      await expect(page.getByRole('button', { name: L.game.confirm_no, exact: true })).toBeVisible();
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: L.game.confirm_no, exact: true }).click();
      await page.waitForTimeout(1200);
      s = await gstate(page);
      expect(s.screen, 'F1: click behind the quit confirm is not replayed').toBe('game');
      expect(s.runLost && s.runLost.dismissed).toBe(false);
      // …and the same behind Οδηγίες: click on the card area, close the guide with Enter
      await page.getByRole('button', { name: new RegExp(L.game.instructions) }).click();
      await page.waitForTimeout(700);
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(200);
      await pressEnter(page); // closes the guide only
      await page.waitForTimeout(1200);
      s = await gstate(page);
      expect(s.screen, 'F1: click behind Οδηγίες is not replayed, the guide-closing Enter does not close the card').toBe('game');
      expect(s.runLost && s.runLost.dismissed).toBe(false);
      expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro)).toBe(false);

      const before = await storeSnap(page);
      // a NEW press continues
      await pressEnter(page);
      await expect.poll(async () => (await storeSnap(page)).screen, { timeout: 5000 }).toBe('result');
      const res = await storeSnap(page);
      expect(res.nav.passed).toBe(false);
      expect(res.nav.score, 'result carries the earned points').toBe(expectedScore);
      expect(res.points - before.points, 'credited exactly once').toBe(expectedScore);
      expect(res.growing, 'no mission unlocked').toEqual(before.growing);
      await expect(page.getByRole('button', { name: L.result.try_again })).toBeVisible();
      await shot(page, `kbd_${lang}_lost_result`);
      await page.waitForTimeout(2000);
      expect((await storeSnap(page)).points, 'not credited again').toBe(res.points);
      const finishes = events.filter((e) => e.type === 'game_finish' && e.game === 'GardenPlanner');
      expect(finishes.length, 'one game_finish').toBe(1);
      expect(finishes[0].passed).toBe(false);
      expect(finishes[0].score).toBe(expectedScore);
      expect(await stars(page), 'the earlier 3★ best is kept after a failed round').toBe(3);

      // Try again: same round, fresh state, nothing unlocked, no extra points
      const seedsBefore = res.nav.roundSeed;
      await page.getByRole('button', { name: L.result.try_again }).click();
      await page.waitForFunction(() => {
        const st = document.querySelector('canvas')?._stateRef?.current;
        return st && st.player && window.__playfood.state().currentScreen === 'game';
      });
      await page.waitForTimeout(400);
      const fresh = await page.evaluate(() => {
        const st = document.querySelector('canvas')._stateRef.current;
        return { planted: st.plantedCount, runLost: st.runLost, fin: st.finishScheduled, seeded: st.plots.filter((p) => p.seed).length,
          phase: st.phase, season: st.activeSeason, eventsFired: st.eventsFired, wilted: st.plots.filter((p) => p.wilted).length,
          healthyHarvests: st.healthyHarvests, nav: window.__playfood.state().navigationData };
      });
      expect(fresh).toMatchObject({ planted: 0, runLost: null, fin: false, seeded: 0, phase: 'PLANT', season: 'autumn', eventsFired: {}, wilted: 0, healthyHarvests: 0 });
      expect(await crateIds(page), 'the same seeds in the same crates').toEqual(roundCrates);
      expect(await stars(page), 'best stars still 3').toBe(3);
      expect(fresh.nav.roundSeed, 'the same round is replayed').toBe(seedsBefore);
      expect(num(await readScore(page), 'score'), 'a clean score').toBe(0);
      const again = await storeSnap(page);
      expect(again.points).toBe(res.points);
      expect(again.growing).toEqual(before.growing);
    });

    test(`late 4th mistake on the 8th planting, planted with Space held — ${lang}`, async ({ page }) => {
      test.setTimeout(240_000);
      const L = loc(lang);
      const events = await captureEvents(page);
      await installRecorder(page);
      await bootMission(page, 'growing', 2, lang);
      // wrong at plantings 2, 4, 7, 8: still winnable after the 7th (3 wilted,
      // 4 alive + 1 left = 5), lost on the 8th — the planting that would
      // otherwise start WATER (point 1)
      await page.evaluate(() => { window.__plan = ['R', 'W', 'R', 'W', 'R', 'R', 'W', 'W']; });
      const input = keyboardInput(page);
      await driveToPlanting(page, input, 7);
      let s = await gstate(page);
      expect(s.wilted).toBe(3);
      expect(s.runLost, 'still winnable after the 7th planting').toBeNull();
      expect(s.progress).toBe(plantProgressText(L, lang, 4, 1));
      const answered = await page.evaluate(() => window.__evAnswered || {});
      // first option: correct for autumn / winter, not for spring / summer
      expect(answered).toEqual({ seed_choice: true, companions: true, pollinators: false, pests: false });
      const expectedScore = 4 * 10 + 2 * 10; // 4 right plantings + 2 correct answers
      expect(num(await readScore(page), 'score'), 'calibrated').toBe(expectedScore);

      await placeAt(page, 'plot');
      await page.waitForTimeout(150);
      await page.keyboard.down(' '); // Space, held through the card
      await page.waitForTimeout(1600);
      s = await gstate(page);
      expect(s.runLost, 'card up on the 8th planting').not.toBeNull();
      expect(s.planted).toBe(8);
      expect(s.phase, 'WATER never starts').toBe('PLANT');
      expect(s.screen, 'the held Space that planted does not close it').toBe('game');
      expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.feedbackText), 'no WATER announcement').toBeNull();
      await page.keyboard.up(' ');
      await page.waitForTimeout(600);
      await expectLostCard(page, L, lang, { wilted: 4 });
      const before = await storeSnap(page);
      await page.keyboard.down(' '); await page.waitForTimeout(90); await page.keyboard.up(' '); // a NEW Space
      await expect.poll(async () => (await storeSnap(page)).screen, { timeout: 5000 }).toBe('result');
      const res = await storeSnap(page);
      expect(res.nav.passed).toBe(false);
      expect(res.nav.score).toBe(expectedScore);
      expect(res.points - before.points).toBe(expectedScore);
      expect(res.growing).toEqual(before.growing);
      expect(events.filter((e) => e.type === 'game_finish' && e.game === 'GardenPlanner').length).toBe(1);
    });

    test(`Γ: an empty WATER phase ends as a failed result, once — ${lang}`, async ({ page }) => {
      test.setTimeout(120_000);
      const L = loc(lang);
      const events = await captureEvents(page);
      await bootMission(page, 'growing', 2, lang);
      await page.waitForTimeout(650); await pressEnter(page);
      await page.waitForFunction(() => { const s = document.querySelector('canvas')?._stateRef?.current; return s && !s.showMissionIntro && s.irisOpenness >= 1; });
      const before = await storeSnap(page);
      // nothing planted at all, and WATER: nothing to water, harvest or compost
      await page.evaluate(() => {
        const s = document.querySelector('canvas')._stateRef.current;
        for (const p of s.plots) Object.assign(p, { seed: null, health: 0, wilted: false, harvested: false });
        s.carrying = null; s.plantedCount = 8; s.phase = 'WATER'; s.waterRound = 1;
      });
      for (let i = 0; i < 4; i++) await pressEnter(page);
      await expect.poll(async () => (await storeSnap(page)).screen, { timeout: 6000 }).toBe('result');
      await page.waitForTimeout(2000);
      const after = await storeSnap(page);
      expect(after.nav.passed).toBe(false);
      expect(after.nav.healthyHarvests).toBe(0);
      expect(after.nav.score).toBe(0);
      expect(after.points).toBe(before.points);
      expect(after.growing, 'no unlock').toEqual(before.growing);
      const finishes = events.filter((e) => e.type === 'game_finish' && e.game === 'GardenPlanner');
      expect(finishes.length, 'one game_finish').toBe(1);
      expect(finishes[0].passed).toBe(false);
      await expect(page.getByRole('button', { name: L.result.try_again })).toBeVisible();
    });

    test(`Γ: WATER with nothing to water moves on; nothing left ends the round once — ${lang}`, async ({ page }) => {
      test.setTimeout(120_000);
      const L = loc(lang);
      const events = await captureEvents(page);
      await bootMission(page, 'growing', 2, lang);
      await page.waitForTimeout(650); await pressEnter(page);
      await page.waitForFunction(() => { const s = document.querySelector('canvas')?._stateRef?.current; return s && !s.showMissionIntro && s.irisOpenness >= 1; });
      // the old dead end: WATER with every plant wilted
      await page.evaluate(() => {
        const s = document.querySelector('canvas')._stateRef.current;
        s.carrying = null;
        let n = 0;
        for (const p of s.plots) Object.assign(p, n++ < 8 ? { seed: { id: 'cabbage', emoji: '🥬' }, health: 0, wilted: true, harvested: false } : { seed: null, health: 0, wilted: false, harvested: false });
        s.plantedCount = 8; s.phase = 'WATER'; s.waterRound = 1;
      });
      await expect.poll(async () => (await gstate(page)).phase, { timeout: 3000 }).toBe('HARVEST');
      let s = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.feedbackText);
      expect(s, 'the normal harvest announcement').toBe(L.garden.phase_harvest);
      expect((await gstate(page)).screen).toBe('game');

      // WATER with everything already harvested: the round ends exactly once
      const before = await storeSnap(page);
      await page.evaluate(() => {
        const st = document.querySelector('canvas')._stateRef.current;
        for (const p of st.plots) if (p.seed) Object.assign(p, { wilted: false, health: 2, harvested: true });
        st.healthyHarvests = 8; st.phase = 'WATER';
      });
      // a burst of presses during the end beat must not end it twice
      for (let i = 0; i < 4; i++) await pressEnter(page);
      await expect.poll(async () => (await storeSnap(page)).screen, { timeout: 6000 }).toBe('result');
      await page.waitForTimeout(2000);
      const after = await storeSnap(page);
      expect(after.points - before.points, 'credited once').toBe(after.nav.score);
      const finishes = events.filter((e) => e.type === 'game_finish' && e.game === 'GardenPlanner');
      expect(finishes.length, 'one game_finish').toBe(1);
      s = await page.evaluate(() => window.__playfood.state().currentScreen);
      expect(s).toBe('result');
    });
  });
}

// F5: leaving the game inside the 800 ms result handoff must not bring a
// result (or points) from the round the child already left.
for (const lang of ['el', 'en']) {
  test(`F5: leaving during the result handoff brings no late result — ${lang}`, async ({ page }) => {
    test.setTimeout(200_000);
    const L = loc(lang);
    const events = await captureEvents(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await bootMission(page, 'growing', 2, lang);
    await page.evaluate(() => { window.__plan = ['R', 'W', 'W', 'W', 'W']; });
    const input = keyboardInput(page);
    await driveToPlanting(page, input, 4);
    await placeAt(page, 'plot');
    await page.waitForTimeout(150);
    await pressEnter(page); // the losing planting
    await expect.poll(async () => !!(await gstate(page)).runLost).toBe(true);
    await page.waitForTimeout(800);
    const before = await storeSnap(page);
    await pressEnter(page); // continue → the round completes, the result handoff is scheduled
    await page.getByRole('button', { name: new RegExp(L.game.quit) }).click();
    await page.getByRole('button', { name: L.game.confirm_yes, exact: true }).click();
    await expect.poll(async () => (await storeSnap(page)).screen, { timeout: 3000 }).not.toBe('game');
    const left = (await storeSnap(page)).screen;
    await page.waitForTimeout(2500); // well past the 800 ms handoff
    const after = await storeSnap(page);
    expect(after.screen, 'still where the child went, no late result').toBe(left);
    expect(after.screen).not.toBe('result');
    expect(after.points, 'no late points').toBe(before.points);
    expect(events.filter((e) => e.type === 'game_finish' && e.game === 'GardenPlanner').length, 'no late game_finish').toBe(0);
  });
}

// A: every bar item whole at every size, in every phase, also with Quit's confirm open
for (const vp of [[1920, 1080], [1366, 768], [1280, 720], [1024, 768], [844, 390]]) {
  for (const lang of LANGS) {
    test(`top bar fits whole at ${vp[0]}x${vp[1]} — ${lang}`, async ({ page }) => {
      const L = loc(lang);
      await installRecorder(page);
      await page.setViewportSize({ width: vp[0], height: vp[1] });
      await bootMission(page, 'growing', 2, lang);
      await page.waitForTimeout(650); await pressEnter(page);
      await page.waitForFunction(() => { const s = document.querySelector('canvas')?._stateRef?.current; return s && !s.showMissionIntro && s.irisOpenness >= 1; });
      const cases = [
        { phase: 'PLANT', set: { plantedCount: 1, wilt: 0 }, text: plantProgressText(L, lang, 1, 7) },
        { phase: 'PLANT', set: { plantedCount: 7, wilt: 2 }, text: plantProgressText(L, lang, 5, 1) },
        { phase: 'WATER', set: { plantedCount: 8, wilt: 3 }, text: waterProgressText(L, 5) },
        { phase: 'HARVEST', set: { plantedCount: 8, wilt: 3, hh: 4 }, text: harvestProgressText(L, 4) },
      ];
      for (const c of cases) {
        await page.evaluate(({ c }) => {
          const s = document.querySelector('canvas')._stateRef.current;
          let n = 0;
          for (const p of s.plots) {
            const i = n++;
            Object.assign(p, i < c.set.plantedCount
              ? { seed: { id: 'cabbage', emoji: '🥬' }, wilted: i < c.set.wilt, health: c.phase === 'PLANT' ? 0 : (i < c.set.wilt ? 0 : (c.phase === 'WATER' ? 1 : 2)), harvested: false }
              : { seed: null, wilted: false, health: 0, harvested: false });
          }
          s.plantedCount = c.set.plantedCount; s.healthyHarvests = c.set.hh || 0; s.phase = c.phase; s.carrying = null;
        }, { c });
        await page.waitForTimeout(450);
        const st = await gstate(page);
        expect(st.goal).toBe(goalText(L));
        expect(st.progress, `${c.phase} line`).toBe(c.text);
        const phaseKey = { PLANT: 'phase_plant', WATER: 'phase_water', HARVEST: 'phase_harvest' }[c.phase];
        expect(await page.locator('[data-testid="garden-phase"]').innerText()).toBe(L.garden.bar[phaseKey]);
        await expect(page.locator('[data-testid="garden-season"]')).toHaveCount(c.phase === 'PLANT' ? 1 : 0);
        const label = `${lang} ${vp[0]}x${vp[1]} ${c.phase}`;
        await expectBarWhole(page, label);
        await expectGoalLinesWhole(page, label);
        // F2: the step banner is whole and not under the bar or a touch control
        const bannerKey = { PLANT: 'obj_pick_seed', WATER: 'obj_pick_can', HARVEST: 'obj_pick_tool' }[c.phase];
        await expectBannerClear(page, L.garden[bannerKey], label);
        if (c.phase === 'PLANT' && c.set.plantedCount === 7) await shot(page, `bar_${vp[0]}_${lang}_plant`);
      }
      // Quit's confirm row also fits (longest bar state: PLANT with season chip)
      await page.evaluate(() => { document.querySelector('canvas')._stateRef.current.phase = 'PLANT'; });
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: new RegExp(L.game.quit) }).click();
      await expect(page.getByRole('button', { name: L.game.confirm_yes, exact: true })).toBeVisible();
      await expectBarWhole(page, `${lang} ${vp[0]}x${vp[1]} quit-confirm`);
      await shot(page, `bar_${vp[0]}_${lang}_confirm`);
      await page.getByRole('button', { name: L.game.confirm_no, exact: true }).click();
    });
  }
}
