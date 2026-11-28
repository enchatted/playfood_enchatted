import { expect, test } from '@playwright/test';

async function enterLighthouseAtPostbox(page, lang = 'el') {
  await page.goto(`/?testMode=1&lang=${lang}`);
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
    if (!hidpi) {
      return {
        x: rect.left + (x / canvas.width) * rect.width,
        y: rect.top + (y / canvas.height) * rect.height,
      };
    }
    const bufferPixelsPerCssPixel = canvas.width / rect.width;
    return {
      x: rect.left + (x * hidpi.k + hidpi.ox) / bufferPixelsPerCssPixel,
      y: rect.top + (y * hidpi.k + hidpi.oy) / bufferPixelsPerCssPixel,
    };
  }, point);
}

test.describe('Lighthouse PLAYFOOD code entry', () => {
  test('opens by clicking the nearby postbox itself', async ({ page }) => {
    await enterLighthouseAtPostbox(page);
    const postbox = await logicalCanvasPointToViewport(page, { x: 1000, y: 640 });

    await page.mouse.click(postbox.x, postbox.y);

    await expect(page.getByRole('textbox')).toBeFocused();
  });

  test('Escape closes the modal and restores canvas focus', async ({ page }) => {
    await enterLighthouseAtPostbox(page);
    await page.keyboard.press('Enter');
    const input = page.getByRole('textbox');
    await expect(input).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(input).toBeHidden();
    await expect(page.locator('canvas')).toBeFocused();
  });

  for (const [lang, locale] of [
    ['el', 'el-GR'],
    ['en', 'en-GB'],
    ['nl', 'nl-NL'],
    ['pt', 'pt-PT'],
  ]) {
    test(`keeps the ${lang} placeholder fully readable beside the action button`, async ({ page }) => {
      // Narrowest supported tablet landscape: portrait intentionally blocks
      // gameplay input behind the shared rotate-device prompt.
      await page.setViewportSize({ width: 820, height: 600 });
      await enterLighthouseAtPostbox(page, lang);
      await page.keyboard.press('Enter');
      const input = page.getByRole('textbox');
      await expect(input).toBeFocused();

      const fit = await input.evaluate((element, textLocale) => {
        const style = getComputedStyle(element);
        const measure = document.createElement('canvas').getContext('2d');
        measure.font = style.font;
        const renderedPlaceholder = style.textTransform === 'uppercase'
          ? element.placeholder.toLocaleUpperCase(textLocale)
          : element.placeholder;
        const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
        const textWidth = measure.measureText(renderedPlaceholder).width
          + letterSpacing * Math.max(0, Array.from(renderedPlaceholder).length - 1);
        const availableWidth = element.clientWidth
          - Number.parseFloat(style.paddingLeft)
          - Number.parseFloat(style.paddingRight);
        return { placeholder: element.placeholder, textWidth, availableWidth };
      }, locale);

      expect(
        fit.availableWidth,
        `Placeholder "${fit.placeholder}" needs ${fit.textWidth}px but has ${fit.availableWidth}px`,
      ).toBeGreaterThanOrEqual(fit.textWidth);
    });
  }

  // Keyboard-only children: a rejected code must leave the field focused, so they can retype,
  // retry with Enter and leave with Escape without reaching for a mouse.
  for (const [kind, respond, message] of [
    ['invalid', (route) => route.fulfill({ status: 400, json: { success: false, reason: 'invalid_code' } }), 'Μη έγκυρος κωδικός. Δοκίμασε ξανά.'],
    ['duplicate', (route) => route.fulfill({ status: 409, json: { success: false, reason: 'already_redeemed' } }), 'Έχεις ήδη χρησιμοποιήσει αυτόν τον κωδικό.'],
    ['unavailable', (route) => route.abort(), 'Δεν μπορούμε να ελέγξουμε τον κωδικό τώρα. Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.'],
  ]) {
    test(`keeps keyboard focus after a rejected code (${kind}) submitted with Enter`, async ({ page }) => {
      // Each response waits until the test releases it, so the pending state is observable.
      const held = [];
      await page.route('**/api/phygital/redeem', (route) => new Promise((release) => held.push(release)).then(() => respond(route)));
      await enterLighthouseAtPostbox(page);
      await page.keyboard.press('Enter');
      const input = page.getByRole('textbox');
      await expect(input).toBeFocused();

      await page.keyboard.type('ABC');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Γίνεται έλεγχος…' })).toBeDisabled();
      await page.keyboard.press('Enter'); // a second press while pending must not resubmit
      await expect.poll(() => held.length).toBe(1);
      held[0]();
      await expect(page.getByText(message)).toBeVisible();
      await expect(input).toBeFocused();
      expect(held.length).toBe(1);

      await page.keyboard.type('D');
      await expect(input).toHaveValue('ABCD');
      await page.keyboard.press('Enter');
      await expect.poll(() => held.length).toBe(2);
      held[1]();
      await expect(page.getByText(message)).toBeVisible();
      await expect(input).toBeFocused();
      await expect(input).toBeEnabled();

      await page.keyboard.press('Escape');
      await expect(input).toBeHidden();
      await expect(page.locator('canvas')).toBeFocused();
      expect(await page.evaluate(() => window.__playfood.state().points)).toBe(0);
    });
  }

  test('returns focus to the field after a rejected code submitted with the mouse', async ({ page }) => {
    await page.route('**/api/phygital/redeem', (route) => route.fulfill({ status: 400, json: { success: false, reason: 'invalid_code' } }));
    await enterLighthouseAtPostbox(page);
    await page.keyboard.press('Enter');
    await page.getByRole('textbox').fill('WRONG');
    await page.getByRole('button', { name: 'Έλεγξε τον κωδικό' }).click();
    await expect(page.getByText('Μη έγκυρος κωδικός. Δοκίμασε ξανά.')).toBeVisible();
    await expect(page.getByRole('textbox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox')).toBeHidden();
  });

  test('handles invalid, valid, duplicate, and persisted code redemption end to end', async ({ page }) => {
    // The e2e config starts no API server; mirror server/src/routes/phygital.js for one SAVEIT reward.
    await page.route('**/api/phygital/redeem', (route) => {
      const { code, redeemedIds = [] } = route.request().postDataJSON();
      const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (code.trim().toUpperCase() !== 'SAVEIT') return reply(400, { success: false, reason: 'invalid_code' });
      if (redeemedIds.includes('SAVEIT')) return reply(409, { success: false, reason: 'already_redeemed' });
      return reply(200, { success: true, id: 'SAVEIT', points: 50, description: '' });
    });
    await enterLighthouseAtPostbox(page);
    await page.keyboard.press('Enter');
    const input = page.getByRole('textbox');
    const submit = page.getByRole('button', { name: 'Έλεγξε τον κωδικό' });

    await expect(page.getByText('Κάθε κωδικός δραστηριότητας δίνει πόντους μία φορά στη δική σου πρόοδο. Χρειάζεται σύνδεση στο διαδίκτυο.')).toBeVisible();

    await input.fill('WRONG!');
    await submit.click();
    await expect(page.getByText('Μη έγκυρος κωδικός. Δοκίμασε ξανά.')).toBeVisible();

    await input.fill('  saveit  ');
    await submit.click();
    await expect(page.getByText('Κωδικός αποδεκτός! +50 πόντοι!')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__playfood.state().points)).toBe(50);
    await expect(input).toBeHidden({ timeout: 4_000 });

    // Success waits on an explicit Continue (edb3205); Enter closes it, then Enter on the postbox reopens.
    await expect(page.getByRole('button', { name: 'Συνέχεια' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('canvas')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(input).toBeFocused();
    await input.fill('SAVEIT');
    await submit.click();
    await expect(page.getByText('Έχεις ήδη χρησιμοποιήσει αυτόν τον κωδικό.')).toBeVisible();
    expect(await page.evaluate(() => window.__playfood.state().points)).toBe(50);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    const persisted = await page.evaluate(() => {
      const state = window.__playfood.state();
      return { points: state.points, redeemedCodes: state.redeemedCodes };
    });
    expect(persisted).toEqual({ points: 50, redeemedCodes: ['SAVEIT'] });
  });
});
