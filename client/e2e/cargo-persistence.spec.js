import { test, expect } from '@playwright/test';

async function openHub(page) {
  await page.waitForFunction(() => Boolean(window.__playfood));
  await page.evaluate(() => window.__playfood.goToScreen('hub'));
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')?._stateRef?.current?.player));
}

test('keeps collected trash through an island visit and a reload', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('cargo-test-started')) {
      localStorage.clear();
      sessionStorage.setItem('cargo-test-started', '1');
    }
  });
  await page.goto('/?testMode=1&lang=el');
  await openHub(page);

  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const playerX = state.player.pixelX + 16;
    const playerY = state.player.pixelY + 16;
    state.debris = [{
      x: playerX,
      y: playerY,
      kind: 'bottle',
      tilt: 0,
      driftAngle: 0,
      bob: 0,
    }];
  });

  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.trashCargo
  ))).toBe(1);

  await page.evaluate(() => window.__playfood.goToIsland('growing'));
  await page.waitForFunction(() => window.__playfood.screen() === 'island');
  await page.evaluate(() => window.__playfood.goToScreen('hub'));
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')?._stateRef?.current?.player));

  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.trashCargo
  ))).toBe(1);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openHub(page);
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.trashCargo
  ))).toBe(1);
});
