import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';

async function expectEscapePauseToggle(page) {
  const pauseOverlay = page.locator('[data-pause-overlay="menu"]');

  await page.keyboard.press('Escape');
  await expect(pauseOverlay).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(pauseOverlay).toBeHidden();
  await expect(page.locator('canvas')).toBeFocused();
}

test('Escape pauses and resumes a walk-around mini-game', async ({ page }) => {
  await bootMission(page, 'growing', 1, 'el');
  await pressEnter(page);
  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return state && !state.showMissionIntro && state.irisOpenness >= 1;
  });

  await expectEscapePauseToggle(page);
});
