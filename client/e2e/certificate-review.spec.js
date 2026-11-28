import { test, expect } from '@playwright/test';
import { pressEnter, pressKey } from './helpers.js';

// Reopening the diploma after a reload must not award it a second time.
const progressSnapshot = (page) => page.evaluate(() => {
  const s = window.__playfood.state();
  return JSON.stringify({
    points: s.points, gameStars: s.gameStars, completedMissions: s.completedMissions,
    boatTier: s.boatTier, finaleClaimed: s.finaleClaimed, lighthouseGoldSeen: s.lighthouseGoldSeen,
  });
});
const screen = (page) => page.evaluate(() => window.__playfood.screen());

async function walkToKeeper(page) {
  await page.evaluate(() => {
    window.__playfood.state().markLighthouseOnboardingSeen();
    window.__playfood.goToScreen('lighthouse');
  });
  await page.waitForFunction(() => window.__playfood.screen() === 'lighthouse');
  await page.waitForTimeout(2800); // finale sweep (if any) must finish before movement unfreezes
  await page.evaluate(async () => { await window.__playfood.walk('up', 2); }); // facing the Keeper (9,10)
  await page.waitForTimeout(300);
}

test('the diploma can be reopened from the Keeper after claim and reload, with no second reward', async ({ page }) => {
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const s = window.__playfood.state();
    s.resetProgress();
    s.setHero('braid');
    s.debugCompleteAll();
  });

  // First claim: the normal finale (dialog → merge on the map → certificate).
  await walkToKeeper(page);
  await pressEnter(page); // open the finale dialog
  await page.waitForTimeout(400);
  await pressEnter(page); // claim
  await page.waitForFunction(() => window.__playfood.screen() === 'certificate', null, { timeout: 15_000 });
  const afterClaim = await progressSnapshot(page);
  expect(JSON.parse(afterClaim).finaleClaimed).toBe(true);

  await page.getByRole('button', { name: 'Πίσω στον χάρτη' }).click();
  await page.waitForFunction(() => window.__playfood.screen() !== 'certificate');

  // Reload: progress survives; the merge does not replay.
  await page.reload();
  await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
  expect(await progressSnapshot(page)).toBe(afterClaim);

  // Escape closes the review dialog and stays in the lighthouse. (With no dialog
  // open, Escape would leave for the map, so staying proves the dialog was open.)
  await walkToKeeper(page);
  await pressEnter(page);
  await page.waitForTimeout(300);
  await pressKey(page, 'Escape');
  await page.waitForTimeout(800);
  expect(await screen(page)).toBe('lighthouse');

  // Enter on the review dialog opens the certificate again.
  await pressEnter(page);
  await page.waitForTimeout(300);
  await pressEnter(page);
  await page.waitForFunction(() => window.__playfood.screen() === 'certificate', null, { timeout: 10_000 });
  await expect(page.getByTestId('certificate-island-grid')).toBeVisible();
  expect(await page.evaluate(() => window.__playfood.state().finaleMerging)).toBe(false);
  expect(await progressSnapshot(page)).toBe(afterClaim);
});
