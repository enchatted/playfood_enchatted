import { test, expect } from '@playwright/test';
import { bootMission, touchHold } from './helpers.js';

async function tapPoint(page, x, y) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

// touchHold waits for the controls first; inside the pause menu they are unmounted, so tap directly
async function tapLocator(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('tapLocator: locator has no bounding box');
  await tapPoint(page, box.x + box.width / 2, box.y + box.height / 2);
}

test('tablet touch opens goal and instructions above the game controls', async ({ page }) => {
  await bootMission(page, 'foodwaste', 1, 'el');

  await tapPoint(page, 40, 40);
  await page.waitForTimeout(650);
  await touchHold(page, page.locator('[data-key="Enter"]'), 150);

  const dpadBox = await page.locator('[data-key="ArrowRight"]').boundingBox();
  expect(dpadBox, 'controls are shown while playing').not.toBeNull();
  const dpadCenter = { x: dpadBox.x + dpadBox.width / 2, y: dpadBox.y + dpadBox.height / 2 };

  await touchHold(page, page.getByRole('button', { name: /Παύση/ }), 100);

  const overlay = page.locator('[data-pause-overlay="menu"]');
  const dialog = page.getByRole('dialog', { name: 'Παύση' });
  const guideButton = page.getByRole('dialog').getByRole('button', { name: 'Πώς παίζω;' });
  await expect(dialog).toBeVisible();

  const viewport = page.viewportSize();
  const dialogBox = await dialog.boundingBox();
  const guideBox = await guideButton.boundingBox();
  expect(dialogBox?.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox?.y).toBeGreaterThanOrEqual(0);
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
  expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
  expect(guideBox?.height).toBeGreaterThanOrEqual(48);

  // A blocking overlay unmounts the controls (TouchDpad: `blockingOverlayOpen && !dialogControls`),
  // so nothing can be pressed behind the pause menu and the player stays still.
  await expect(page.locator('[data-touch-control]')).toHaveCount(0);
  const playerAt = () => page.evaluate(() => {
    const p = document.querySelector('canvas')._stateRef.current.player;
    return { col: p.col, row: p.row, pixelX: p.pixelX, pixelY: p.pixelY };
  });
  const pausedAt = await playerAt();
  const tapLandsOnPause = await page.evaluate(({ x, y }) => (
    Boolean(document.elementFromPoint(x, y)?.closest('[data-pause-overlay="menu"]'))
  ), dpadCenter);
  expect(tapLandsOnPause, 'a tap where ▶ was lands on the pause menu').toBe(true);
  await tapPoint(page, dpadCenter.x, dpadCenter.y);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  expect(await playerAt()).toEqual(pausedAt);

  // Resume brings the controls back and they move the player again.
  await tapLocator(page, page.getByRole('button', { name: 'Συνέχεια', exact: true }));
  await expect(overlay).not.toBeVisible();
  await expect(page.locator('[data-key="ArrowRight"]')).toBeVisible();
  expect(await playerAt()).toEqual(pausedAt);
  await touchHold(page, page.locator('[data-key="ArrowRight"]'), 400);
  await expect.poll(async () => (await playerAt()).col).toBeGreaterThan(pausedAt.col);

  // Pause again → Goal / Instructions opens the mission card.
  await touchHold(page, page.getByRole('button', { name: /Παύση/ }), 100);
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-touch-control]')).toHaveCount(0);
  await tapLocator(page, guideButton);
  await expect(overlay).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current?.showMissionIntro
  ))).toBe(true);
});
