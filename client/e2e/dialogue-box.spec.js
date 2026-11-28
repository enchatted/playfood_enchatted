import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet landscape', width: 1024, height: 768 },
  { name: 'short landscape', width: 844, height: 390 },
];

async function openCaptainWelcome(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
  await page.evaluate(() => {
    window.__playfood.state().setHero('braid');
    window.__playfood.goToScreen('menu');
  });
  await page.waitForFunction(() => window.__playfood?.screen() === 'menu');
  await page.waitForTimeout(1_200);
  await page.evaluate(() => window.__playfood.walk('down', 1));
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__playfood.press('Enter'));
}

test.describe('Captain dialogue readability', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} separates sentences and keeps the keyboard CTA readable`, async ({ page }) => {
      await openCaptainWelcome(page, viewport);

      const message = page.locator('p').filter({ hasText: 'Γεια χαρά' });
      const hint = page.getByText('Enter ή Space ▶', { exact: true });
      await expect(message).toBeVisible();
      await expect(hint).toBeVisible({ timeout: 6_000 });

      expect(await message.innerText()).toBe(
        'Γεια χαρά!\nΚαλώς ήρθες στο Αρχιπέλαγος PLAYFOOD!',
      );

      const hintStyle = await hint.evaluate((element) => {
        const style = getComputedStyle(element);
        return { color: style.color, fontWeight: Number.parseInt(style.fontWeight, 10) };
      });
      expect(hintStyle.color).toBe('rgb(255, 255, 255)');
      expect(hintStyle.fontWeight).toBeGreaterThanOrEqual(700);

      const bubble = message.locator('xpath=../..');
      const rect = await bubble.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect.x).toBeGreaterThanOrEqual(4);
      expect(rect.y).toBeGreaterThanOrEqual(4);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width - 4);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height - 4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height);
    });
  }
});
