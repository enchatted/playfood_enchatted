import { expect, test } from '@playwright/test';

async function tapPoint(page, x, y) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function enterLighthouseAtPostbox(page) {
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const store = window.__playfood.state();
    store.resetProgress();
    store.markLighthouseOnboardingSeen();
    store.setHero('braid');
    window.__playfood.goToScreen('lighthouse');
  });
  await page.waitForFunction(() => window.__playfood.screen() === 'lighthouse');
  await page.waitForTimeout(1_000);
  await page.evaluate(async () => window.__playfood.walk('right', 7));
  await page.waitForTimeout(300);
}

async function logicalCanvasPointToViewport(page, point) {
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const hidpi = canvas.__hidpi;
    if (!hidpi) return {
      x: rect.left + (x / canvas.width) * rect.width,
      y: rect.top + (y / canvas.height) * rect.height,
    };
    const bufferPixelsPerCssPixel = canvas.width / rect.width;
    return {
      x: rect.left + (x * hidpi.k + hidpi.ox) / bufferPixelsPerCssPixel,
      y: rect.top + (y * hidpi.k + hidpi.oy) / bufferPixelsPerCssPixel,
    };
  }, point);
}

test.describe('Lighthouse code entry on tablet and whiteboard', () => {
  test('mouse or stylus click on the visible A button activates the postbox', async ({ page }) => {
    await enterLighthouseAtPostbox(page);
    await tapPoint(page, 40, 40);
    const action = page.locator('[data-key="Enter"]');
    await expect(action).toBeVisible();

    await action.click();

    await expect(page.getByRole('textbox')).toBeFocused();
  });

  test('finger tap on the nearby postbox itself opens code entry', async ({ page }) => {
    await enterLighthouseAtPostbox(page);
    const postbox = await logicalCanvasPointToViewport(page, { x: 1000, y: 640 });

    await tapPoint(page, postbox.x, postbox.y);

    await expect(page.getByRole('textbox')).toBeFocused();
  });
});
