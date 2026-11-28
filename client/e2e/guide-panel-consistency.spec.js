import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 1366, height: 900 },
  { width: 1024, height: 768 },
  { width: 800, height: 600 },
];

async function measureLighthouseGuide(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => Boolean(window.__playfood));
  await page.evaluate(() => {
    window.__playfood.state().setHero('braid');
    window.__playfood.goToScreen('lighthouse');
  });

  const card = page.locator('.pf-lighthouse-onboarding-card');
  await card.waitFor();
  return card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    const titleStyles = getComputedStyle(element.querySelector('h2'));
    const bodyStyles = getComputedStyle(
      element.querySelector('[data-instruction-line]') || element.querySelector('h2 + p'),
    );
    return {
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width },
      paddingLeft: Number.parseFloat(styles.paddingLeft),
      titleFont: Number.parseFloat(titleStyles.fontSize),
      bodyFont: Number.parseFloat(bodyStyles.fontSize),
    };
  });
}

async function measureGameGuide(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto('/?testMode=1&lang=el&startMission=growing:1');
  await page.waitForFunction(() => window.__playfood?.state().currentScreen === 'game');
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')?._stateRef?.current?.showMissionIntro));

  const canvasRect = await page.locator('canvas').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  const scale = canvasRect.width / 1280;
  return {
    width: 700 * scale,
    padding: 32 * scale,
    titleFont: 18 * scale,
    bodyFont: 15 * scale,
  };
}

test.describe('lighthouse and game guide panel consistency', () => {
  test('renders the Greek lighthouse guide without untranslated resource keys', async ({ page }) => {
    await page.goto('/?testMode=1&lang=el');
    await page.waitForFunction(() => Boolean(window.__playfood));
    await page.evaluate(() => {
      window.__playfood.state().setHero('braid');
      window.__playfood.goToScreen('lighthouse');
    });

    const card = page.locator('.pf-lighthouse-onboarding-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Πλησίασε τον Φαροφύλακα.');
    await expect(card).toContainText('Με πληκτρολόγιο: Πάτησε');
    await expect(card).toContainText('Σε οθόνη αφής: Πάτησε το πορτοκαλί κουμπί');
    await expect(card).not.toContainText(/lighthouse\./);
  });

  for (const viewport of VIEWPORTS) {
    test(`shares the game guide scale at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const lighthouse = await measureLighthouseGuide(page, viewport);
      const game = await measureGameGuide(page, viewport);

      expect(Math.abs(lighthouse.rect.width - game.width)).toBeLessThanOrEqual(8);
      expect(Math.abs(lighthouse.paddingLeft - Math.max(18, Math.min(32, game.padding)))).toBeLessThanOrEqual(2);
      expect(Math.abs(lighthouse.titleFont - Math.max(16, Math.min(22, game.titleFont)))).toBeLessThanOrEqual(2);
      expect(Math.abs(lighthouse.bodyFont - Math.max(14, Math.min(18, game.bodyFont)))).toBeLessThanOrEqual(2);
      expect(lighthouse.rect.left).toBeGreaterThanOrEqual(8);
      expect(lighthouse.rect.right).toBeLessThanOrEqual(viewport.width - 8);
      expect(lighthouse.rect.top).toBeGreaterThanOrEqual(8);
      expect(lighthouse.rect.bottom).toBeLessThanOrEqual(viewport.height - 8);
    });
  }
});
