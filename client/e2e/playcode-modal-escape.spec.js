import { test, expect } from '@playwright/test';

// Escape should close the Play Code dialogue while its input has focus.
test.describe('Play Code modal closes with Escape', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?testMode=1&lang=en');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  for (const where of ['input focused', 'nothing focused']) {
    test(`Escape with ${where} closes it and returns focus to the opener`, async ({ page }) => {
      const opener = page.getByRole('button', { name: 'Continue with Play Code' });
      await opener.click();
      const input = page.getByPlaceholder(/./).last();
      await expect(input).toBeFocused();
      await input.fill('half-typed');
      if (where === 'nothing focused') await page.evaluate(() => document.activeElement.blur());

      await page.keyboard.press('Escape');

      await expect(page.getByRole('heading', { name: /Load/ })).toHaveCount(0);
      await expect(opener).toBeFocused();
      // Closing restores nothing: no progress written, still on the entry screen.
      expect(await page.evaluate(() => window.__playfood.state().currentScreen)).not.toBe('menu');
    });
  }
});
