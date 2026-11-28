import { test, expect } from '@playwright/test';

for (const language of ['el', 'en', 'nl', 'pt']) {
  test(`certificate opens and prints with no external requests in ${language}`, async ({ page }, testInfo) => {
    const externalRequests = [];
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        await route.fulfill({ json: { tracking: false } });
        return;
      }
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
        externalRequests.push(url.href);
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.goto(`/?testMode=1&lang=${language}`);
    await page.waitForFunction(() => Boolean(window.__playfood));
    await page.evaluate(() => {
      window.__playfood.state().setHero('braid');
      window.__playfood.state().debugCompleteAll();
      window.__playfood.goToScreen('certificate');
    });
    await expect(page.getByTestId('certificate-island-grid')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.pf-content h1')).toBeVisible();
    expect(await page.locator('.pf-content p').first().evaluate((p) => getComputedStyle(p).fontFamily))
      .toMatch(/Inter/);
    await page.screenshot({ path: testInfo.outputPath(`certificate-${language}-screen.png`), fullPage: true });
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('certificate-island-grid')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`certificate-${language}-print.png`), fullPage: true });
    await page.waitForTimeout(150);
    expect(externalRequests).toEqual([]);
  });
}
