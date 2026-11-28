import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';

async function expectPauseSurfaceAligned(page) {
  const deltas = await page.locator('[data-pause-surface="game"]').evaluate((pauseSurface) => {
    const canvasAreaRect = document.querySelector('canvas').parentElement.getBoundingClientRect();
    const surfaceRect = pauseSurface.getBoundingClientRect();
    const expectedBottom = Math.min(
      canvasAreaRect.bottom,
      window.visualViewport?.height ?? window.innerHeight,
    );
    return {
      bottom: Math.abs(surfaceRect.bottom - expectedBottom),
      center: Math.abs(
        surfaceRect.top + surfaceRect.height / 2
          - (pauseSurface.parentElement.parentElement.getBoundingClientRect().top + expectedBottom) / 2,
      ),
    };
  });

  expect(deltas.bottom).toBeLessThanOrEqual(2);
  expect(deltas.center).toBeLessThanOrEqual(2);
}

test('pause opens the existing goal and instructions guide', async ({ page }) => {
  await bootMission(page, 'foodwaste', 1, 'el');

  await page.waitForTimeout(650);
  await pressEnter(page);
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current?.showMissionIntro
  ))).toBe(false);

  await page.getByRole('button', { name: /Παύση/ }).click();

  const pauseDialog = page.getByRole('dialog', { name: 'Παύση' });
  await expect(pauseDialog).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Πώς παίζω;' })).toBeVisible();

  const guideButton = page.getByRole('dialog').getByRole('button', { name: 'Πώς παίζω;' });
  const guideBox = await guideButton.boundingBox();
  expect(guideBox?.height).toBeGreaterThanOrEqual(48);

  await guideButton.click();

  await expect(pauseDialog).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current?.showMissionIntro
  ))).toBe(true);
});

test('volume buttons support keyboard selection and restore the previous level on the map', async ({ page }) => {
  await bootMission(page, 'foodwaste', 1);
  await page.getByRole('button', { name: /Pause/ }).click();
  const pause = page.getByRole('dialog', { name: 'Pause' });
  await pause.getByRole('button', { name: '25%' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(pause.getByRole('button', { name: '50%' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(pause.getByRole('button', { name: '50%' })).toHaveAttribute('aria-pressed', 'true');
  await pause.getByRole('button', { name: 'Mute', exact: true }).click();

  await page.reload();
  await page.waitForFunction(() => window.__playfood?.screen() === 'game');
  await page.evaluate(() => window.__playfood.goToScreen('hub'));
  const openSound = page.getByRole('button', { name: 'Sound', exact: true });
  await openSound.focus();
  await page.keyboard.press('Enter');
  const sound = page.getByRole('dialog', { name: 'Sound' });
  await sound.getByRole('button', { name: 'Unmute' }).click();
  await expect(sound.getByRole('button', { name: '50%' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(sound).toHaveCount(0);
  expect(await page.evaluate(() => window.__playfood.screen())).toBe('hub');
});

test('pause scales its layout for large, tablet and short landscape screens', async ({ page }) => {
  await bootMission(page, 'foodwaste', 1, 'el');
  await page.waitForTimeout(650);
  await pressEnter(page);
  await page.getByRole('button', { name: /Παύση/ }).click();

  const measureAt = async (width, height) => {
    await page.setViewportSize({ width, height });
    return page.getByRole('dialog', { name: 'Παύση' }).evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect();
      const title = dialog.querySelector('h2');
      const action = dialog.querySelector('button');
      return {
        width: rect.width,
        height: rect.height,
        widthRatio: rect.width / window.innerWidth,
        heightRatio: rect.height / window.innerHeight,
        titleSize: Number.parseFloat(getComputedStyle(title).fontSize),
        actionHeight: action.getBoundingClientRect().height,
      };
    });
  };

  const large = await measureAt(1920, 1080);
  const tablet = await measureAt(1024, 768);
  const shortLandscape = await measureAt(844, 390);

  expect(large.widthRatio).toBeGreaterThanOrEqual(0.38);
  expect(large.widthRatio).toBeLessThanOrEqual(0.52);
  expect(large.titleSize).toBeGreaterThanOrEqual(44);
  expect(large.actionHeight).toBeGreaterThanOrEqual(64);

  expect(large.width - tablet.width).toBeGreaterThanOrEqual(140);
  expect(tablet.widthRatio).toBeGreaterThanOrEqual(0.5);
  expect(tablet.widthRatio).toBeLessThanOrEqual(0.72);

  expect(shortLandscape.heightRatio).toBeLessThanOrEqual(0.76);
  expect(shortLandscape.actionHeight).toBeGreaterThanOrEqual(48);
});

test('pause stays centered in the rendered game surface after screen-size changes', async ({ page }) => {
  await page.setViewportSize({ width: 1355, height: 943 });
  await bootMission(page, 'foodwaste', 1, 'el');
  await page.waitForTimeout(650);
  await pressEnter(page);
  await page.getByRole('button', { name: /Παύση/ }).click();

  const measureCentering = () => page.getByRole('dialog', { name: 'Παύση' }).evaluate((dialog) => {
    const overlay = dialog.closest('[data-pause-overlay="menu"]');
    const pauseSurface = overlay.querySelector('[data-pause-surface="game"]');
    const canvas = document.querySelector('canvas');
    const gameRoot = overlay.parentElement;
    const canvasArea = canvas.parentElement;
    const dialogRect = dialog.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const pauseSurfaceRect = pauseSurface.getBoundingClientRect();
    const gameRootRect = gameRoot.getBoundingClientRect();
    const canvasAreaRect = canvasArea.getBoundingClientRect();
    const expectedBottom = Math.min(canvasAreaRect.bottom, window.visualViewport?.height ?? window.innerHeight);
    const expectedCenterY = (gameRootRect.top + expectedBottom) / 2;

    return {
      horizontalDelta: Math.abs(
        dialogRect.left + dialogRect.width / 2
          - (pauseSurfaceRect.left + pauseSurfaceRect.width / 2),
      ),
      verticalDelta: Math.abs(
        dialogRect.top + dialogRect.height / 2 - expectedCenterY,
      ),
      surfaceLeftDelta: Math.abs(pauseSurfaceRect.left - gameRootRect.left),
      surfaceRightDelta: Math.abs(pauseSurfaceRect.right - gameRootRect.right),
      surfaceTopDelta: Math.abs(pauseSurfaceRect.top - gameRootRect.top),
      surfaceBottomDelta: Math.abs(pauseSurfaceRect.bottom - expectedBottom),
      overlayWidthDelta: Math.abs(overlayRect.width - window.innerWidth),
      overlayHeightDelta: Math.abs(overlayRect.height - window.innerHeight),
    };
  });

  for (const viewport of [
    { width: 1355, height: 943 },
    { width: 1024, height: 768 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    // The surface is repositioned by ResizeObserver after the viewport changes.
    await expect(async () => {
      const geometry = await measureCentering();
      for (const [axis, delta] of Object.entries(geometry)) {
        expect(delta, `${viewport.width}×${viewport.height} ${axis}`).toBeLessThanOrEqual(2);
      }
    }).toPass({ timeout: 3000 });
  }
});

const ACTIVE_MISSIONS = [
  ['growing', 1, 'The Food\'s Journey'],
  ['growing', 2, 'The Little Gardener'],
  ['growing', 3, 'Earth Doctor'],
  ['local', 1, 'The Season Clock'],
  ['local', 2, 'The Green Basket'],
  ['local', 3, 'The Food Detective'],
  ['foodwaste', 2, 'The Chef\'s Menu'],
  ['foodwaste', 3, 'Culinary Rescue'],
  ['circular', 1, 'The Super Bin'],
  ['circular', 2, 'The Smart Neighbourhood'],
  ['circular', 3, 'Planet in Harmony'],
];

for (const [island, missionId, label] of ACTIVE_MISSIONS) {
  test(`${label} exposes its existing guide from pause`, async ({ page }) => {
    await bootMission(page, island, missionId, 'el');

    await page.waitForTimeout(650);
    await pressEnter(page);

    await page.getByRole('button', { name: /Παύση/ }).click();
    const pauseDialog = page.getByRole('dialog', { name: 'Παύση' });
    const guideButton = page.getByRole('dialog').getByRole('button', { name: 'Πώς παίζω;' });

    await expect(pauseDialog).toBeVisible();
    await expectPauseSurfaceAligned(page);
    await guideButton.click();
    await expect(pauseDialog).not.toBeVisible();

    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')?._stateRef?.current?.showMissionIntro
    ))).toBe(true);
  });
}
