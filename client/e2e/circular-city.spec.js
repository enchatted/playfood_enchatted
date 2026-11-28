import { test, expect } from '@playwright/test';
import { bootMission, driveToResult, pressEnter, pressKey } from './helpers.js';

/**
 * 4.2 "Circular City" (PRACTICE) — route 8 household resources through the right circular hub.
 *
 * Pick up each resource from the home pile and deliver it to its correct circular hub
 * (repair / share / recycle / compost) — never the landfill leak. Each resource carries its
 * own `correctNode`, so every delivery keeps the loop closed; each new channel shows a verbatim
 * reveal (Enter to dismiss), and the final delivery shows the win beat → complete. All 8
 * correct with 0 leaks = a perfect pass.
 */
function stepCircularCity() {
  const TS = 32, DIR_UP = 1;
  // hub key → the col of its delivery tile (hubs on row 2; stand on row 3, face UP).
  const HUB_COL = { repair: 3, share: 6, recycle: 9, compost: 12, landfill: 16 };

  const cv = document.querySelector('canvas');
  const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };

  const stand = (col, row) => {
    const p = st.player;
    p.col = col; p.row = row;
    p.pixelX = col * TS; p.pixelY = row * TS;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
  };

  if (st.showMissionIntro) return { act: 'enter' };
  if (st.reveal) return { act: 'enter' };           // channel / win reveal (final → complete)
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };

  if (st.carrying) {
    const res = st.resources.find((r) => r.id === st.carrying);
    if (window.__retryEveryResource && !res.retried) {
      stand(HUB_COL.landfill, 3);
      return { act: 'enter' };
    }
    stand(HUB_COL[res.correctNode], 3);             // below the correct hub, facing UP
    return { act: 'enter' };                         // deliver
  }
  const res = st.resources.find((r) => !r.routed);
  if (res) { stand(res.tile.col, res.tile.row + 1); return { act: 'enter' }; } // pick up
  return { act: 'wait', ms: 150 };
}

test('4.2 Circular City — route all 8 resources correctly, reach a leak-free win', async ({ page }) => {
  await bootMission(page, 'circular', 2);

  const nav = await driveToResult(page, stepCircularCity);

  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('result');
  expect(nav.passed).toBe(true);
  expect(nav.tier).toBe('perfect');
  expect(nav.correct).toBe(8);
  expect(nav.leaks).toBe(0);
  await expect(page.getByRole('heading', { name: 'Perfect circular routing!' })).toBeVisible();
  expect(nav.firstTryCount).toBe(8);
  await expect(page.getByText('Correct deliveries: 8/8 · First try: 8/8')).toBeVisible();
});

test('4.2 retries recover all resources without falsely awarding a perfect run', async ({ page }) => {
  await bootMission(page, 'circular', 2);
  await page.evaluate(() => { window.__retryEveryResource = true; });
  const nav = await driveToResult(page, stepCircularCity);
  expect(nav).toMatchObject({ passed: true, tier: 'pass', correct: 8, firstTryCount: 0, leaks: 0, score: 120 });
  await expect(page.getByText('Correct deliveries: 8/8 · First try: 0/8')).toBeVisible();
});

test('4.2 Circular City — Q returns the carried resource home', async ({ page }) => {
  await bootMission(page, 'circular', 2, 'en');
  await pressEnter(page);
  await page.waitForFunction(() => {
    const st = document.querySelector('canvas')?._stateRef?.current;
    return st && !st.showMissionIntro && st.irisOpenness >= 1;
  });

  const itemId = await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    const item = st.resources[0];
    const p = st.player;
    p.col = item.tile.col; p.row = item.tile.row + 1;
    p.pixelX = p.col * 32; p.pixelY = p.row * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 1;
    return item.id;
  });
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current.actionPrompt || ''
  ))).not.toBe('');
  await pressEnter(page);
  await expect.poll(() => page.evaluate((id) => (
    document.querySelector('canvas')?._stateRef?.current.carrying === id
  ), itemId)).toBe(true);

  await pressKey(page, 'q');
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current.carrying || null
  ))).toBeNull();
  expect(await page.evaluate((id) => {
    const st = document.querySelector('canvas')._stateRef.current;
    return st.resources.find((item) => item.id === id).routed;
  }, itemId)).toBe(false);
});
