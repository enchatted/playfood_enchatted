import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import el from '../src/i18n/locales/el.json' with { type: 'json' };
import nl from '../src/i18n/locales/nl.json' with { type: 'json' };
import pt from '../src/i18n/locales/pt.json' with { type: 'json' };

// Geometry comes from the actual DOM and text ranges. Opening/cancelling uses clicks.
for (const [lang, locale] of Object.entries({ en, el, nl, pt })) {
  for (const viewport of [{ width: 844, height: 390 }, { width: 1366, height: 768 }]) {
    for (const [mission, hudTestId] of [[1, 'season-matcher-hud'], [3, 'spot-the-fake-hud']]) {
      test(`${hudTestId}/${lang}/${viewport.width}: exit label fits and confirmation preserves the HUD`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await bootMission(page, 'local', mission, lang);
        await pressEnter(page);
        const hud = page.getByTestId(hudTestId);
        const exit = hud.getByRole('button', { name: `✕ ${locale.game.quit}`, exact: true });
        await expect(exit).toBeVisible();
        const before = await hud.boundingBox();
        const buttonBefore = await exit.boundingBox();
        const textFits = await exit.evaluate((button) => {
          const range = document.createRange();
          range.selectNodeContents(button);
          const text = range.getBoundingClientRect(), box = button.getBoundingClientRect();
          return text.left >= box.left && text.right <= box.right && text.top >= box.top && text.bottom <= box.bottom;
        });
        expect(textFits).toBe(true);
        await exit.click();
        const popup = hud.locator('[data-exit-confirm="true"]');
        await expect(popup).toBeVisible();
        await expect(popup).toContainText(locale.game.confirm_exit);
        const after = await hud.boundingBox();
        for (const key of ['x', 'y', 'width', 'height']) expect(after[key]).toBeCloseTo(before[key], 1);
        const placeholder = hud.locator('[data-exit-anchor] > button');
        const reserved = await placeholder.boundingBox();
        for (const key of ['x', 'y', 'width', 'height']) expect(reserved[key]).toBeCloseTo(buttonBefore[key], 1);
        const box = await popup.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y).toBeGreaterThanOrEqual(after.y + after.height);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        await popup.getByRole('button', { name: locale.game.confirm_no, exact: true }).click();
        await expect(popup).toHaveCount(0);
        await expect(exit).toBeVisible();
        expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('game');
        expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.exitConfirmOpen)).toBe(false);
      });
    }
  }
}
