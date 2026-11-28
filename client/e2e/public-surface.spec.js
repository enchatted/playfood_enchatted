import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { containsInternalNote } from '../test-fixtures/public-copy.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { tracking: false } }));
});

for (const language of ['el', 'en', 'nl', 'pt']) {
  const locale = JSON.parse(fs.readFileSync(`src/i18n/locales/${language}.json`, 'utf8'));
  for (const logoLoads of [true, false]) {
    test(`harbour ${language}, logo=${logoLoads}: real canvas title`, async ({ page }) => {
      await page.addInitScript(() => {
        window.__drawnHarbourTexts = [];
        const fillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
          if (!window.__drawnHarbourTexts.includes(String(text))) window.__drawnHarbourTexts.push(String(text));
          return fillText.call(this, text, ...args);
        };
      });
      if (!logoLoads) await page.route('**/assets/logos/secondary-logo-white.svg', (route) => route.abort());
      await page.goto(`/?testMode=1&lang=${language}&startScreen=menu`);
      const expected = logoLoads ? locale.hub.harbor_subtitle : locale.hub.harbor_title;
      await page.waitForFunction((text) => window.__drawnHarbourTexts.includes(text), expected);
      if (logoLoads && language !== 'en') {
        expect(await page.evaluate(() => window.__drawnHarbourTexts)).not.toContain('Archipelago');
      }
    });
  }
}

test('EU disclaimer names EISMEA, takes focus and closes on Escape', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /disclaimer/i });
  await trigger.click();
  const modal = page.getByRole('dialog');
  await expect(modal).toContainText('Co-funded by the European Union.');
  await expect(modal).toContainText('EISMEA');
  await expect(modal).not.toContainText('EACEA');
  await expect(modal.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('source viewer displays citations without internal reviewer history', async ({ page }) => {
  for (const source of ['circular-economy-rs', 'ypen-home-composting', 'food-storage-fridge-freezer-cupboard', 'food-waste-food-loss']) {
    await page.goto(`/source.html?src=${source}`);
    await expect(page.locator('#title')).not.toHaveText('Source not found');
    const paragraphs = await page.locator('.page p').allTextContents();
    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs.filter(containsInternalNote)).toEqual([]);
  }
});
