import { expect, test } from '@playwright/test';

const LANGUAGE_NAMES = ['English', 'Dutch', 'Ελληνικά', 'Português'];

async function bootLanguageScreen(page, lang = 'el') {
  await page.goto(`/?testMode=1&lang=${lang}`);
  await page.waitForFunction(
    (expectedLanguage) => window.__playfood?.screen() === 'lang'
      && window.__playfood?.language() === expectedLanguage,
    lang,
    { timeout: 20_000 },
  );
}

async function expectEnglishLanguageScreen(page) {
  await expect(page.getByRole('heading', { name: 'Playfood Archipelago' })).toBeVisible();
  await expect(page.getByText('Choose your language', { exact: true })).toBeVisible();
  await expect(page.getByText('Or', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Play Code' })).toBeVisible();

  for (const languageName of LANGUAGE_NAMES) {
    await expect(page.getByRole('button', { name: languageName, exact: true })).toBeVisible();
  }
}

function expectRectInsideViewport(rect, viewport, label) {
  expect(rect, `${label} must have a measurable rectangle`).not.toBeNull();
  expect(rect.width, `${label} must have a visible width`).toBeGreaterThan(0);
  expect(rect.height, `${label} must have a visible height`).toBeGreaterThan(0);
  expect(rect.left, `${label} must stay inside the left edge`).toBeGreaterThanOrEqual(-1);
  expect(rect.top, `${label} must stay inside the top edge`).toBeGreaterThanOrEqual(-1);
  expect(rect.right, `${label} must stay inside the right edge`).toBeLessThanOrEqual(viewport.width + 1);
  expect(rect.bottom, `${label} must stay inside the bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
}

async function readLanguageScreenGeometry(page) {
  const toRect = (box) => (box ? {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
    width: box.width,
    height: box.height,
  } : null);
  const languageButtons = LANGUAGE_NAMES.map((name) => (
    page.getByRole('button', { name, exact: true })
  ));
  const footer = page.getByRole('contentinfo');
  const action = page.getByRole('button', { name: 'Continue with Play Code' });
  const emblem = footer.getByRole('img', { name: 'Co-funded by the European Union' });
  const projectNo = footer.getByText('Project No. 101196354', { exact: true });
  const disclaimer = footer.getByRole('button', { name: 'View EU funding disclaimer' });

  await Promise.all([
    ...languageButtons.map((button) => expect(button).toBeVisible()),
    expect(footer).toBeVisible(),
    expect(action).toBeVisible(),
    expect(emblem).toBeVisible(),
    expect(projectNo).toBeVisible(),
    expect(disclaimer).toBeVisible(),
  ]);

  const buttonRects = (await Promise.all(languageButtons.map((button) => button.boundingBox())))
    .map(toRect);
  const footerRect = toRect(await footer.boundingBox());
  const actionRect = toRect(await action.boundingBox());
  const emblemRect = toRect(await emblem.boundingBox());
  const projectRect = toRect(await projectNo.boundingBox());
  const disclaimerRect = toRect(await disclaimer.boundingBox());
  const rowLeft = Math.min(...buttonRects.map((rect) => rect.left));
  const rowRight = Math.max(...buttonRects.map((rect) => rect.right));

  const typography = await page.evaluate(() => {
    const footerElement = document.querySelector('[role="contentinfo"]');
    const panelElement = footerElement.firstElementChild;
    const panelStyle = getComputedStyle(panelElement);
    const projectElement = Array.from(footerElement.querySelectorAll('span'))
      .find((element) => element.textContent.trim() === 'Project No. 101196354');
    const disclaimerElement = footerElement.querySelector('button');
    return {
      panelBackgroundColor: panelStyle.backgroundColor,
      panelBackgroundImage: panelStyle.backgroundImage,
      panelBorderTopWidth: panelStyle.borderTopWidth,
      panelBoxShadow: panelStyle.boxShadow,
      panelBackdropFilter: panelStyle.backdropFilter,
      projectFontSize: Number.parseFloat(getComputedStyle(projectElement).fontSize),
      disclaimerFontSize: Number.parseFloat(getComputedStyle(disclaimerElement).fontSize),
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  return {
    languageButtons: buttonRects,
    languageRow: {
      left: rowLeft,
      right: rowRight,
      width: rowRight - rowLeft,
    },
    footer: footerRect,
    action: actionRect,
    emblem: emblemRect,
    projectNo: projectRect,
    disclaimer: disclaimerRect,
    ...typography,
  };
}

test.describe('language selector locale boundary', () => {
  test('keeps first-entry chrome English, preserves language endonyms, then enters Greek', async ({ page }) => {
    await bootLanguageScreen(page, 'el');

    await expectEnglishLanguageScreen(page);

    await page.getByRole('button', { name: 'Ελληνικά', exact: true }).click();
    await page.waitForFunction(() => window.__playfood?.screen() === 'avatar');
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', 'ΔΙΑΛΕΞΕ ΤΟΝ ΧΑΡΑΚΤΗΡΑ ΣΟΥ');
    expect(await page.evaluate(() => window.__playfood.language())).toBe('el');
  });

  test('keeps the Play Code and EU compliance content English before language choice', async ({ page }) => {
    await bootLanguageScreen(page, 'el');

    const footer = page.getByRole('contentinfo');
    const emblem = footer.getByRole('img', { name: 'Co-funded by the European Union' });
    await expect(emblem).toHaveAttribute('src', '/assets/eu-cofunded-en.png');
    await expect(footer.getByText('Project No. 101196354', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Continue with Play Code' }).click();
    await expect(page.getByRole('heading', { name: 'Load Your Progress' })).toBeVisible();
    await expect(page.getByText('Type your Play Code to continue where you left off.', { exact: true }))
      .toBeVisible();
    await expect(page.getByRole('textbox')).toHaveAttribute('placeholder', 'e.g. kati-milo-tovo-…');
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Load Your Progress' })).toBeHidden();

    await footer.getByRole('button', { name: 'View EU funding disclaimer' }).click();
    const disclaimerDialog = page.getByRole('dialog');
    await expect(disclaimerDialog.getByRole('heading', { name: 'EU Funding Disclaimer' })).toBeVisible();
    await expect(disclaimerDialog).toContainText('Views and opinions expressed are however those of the author(s) only');
    await expect(disclaimerDialog.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  test('returning to the selector keeps PT or EL selected until another language card is clicked', async ({ page }) => {
    await bootLanguageScreen(page, 'en');

    await page.evaluate(() => {
      window.__playfood.setLanguage('pt');
      window.__playfood.goToScreen('avatar');
    });
    await page.waitForFunction(() => window.__playfood?.screen() === 'avatar');
    await page.evaluate(() => window.__playfood.goToScreen('lang'));
    await page.waitForFunction(() => window.__playfood?.screen() === 'lang');

    expect(await page.evaluate(() => window.__playfood.language())).toBe('pt');
    await expectEnglishLanguageScreen(page);
    await expect(page.getByRole('contentinfo').getByRole('img'))
      .toHaveAttribute('src', '/assets/eu-cofunded-en.png');

    await page.getByRole('button', { name: 'Ελληνικά', exact: true }).click();
    await page.waitForFunction(() => window.__playfood?.screen() === 'avatar');
    expect(await page.evaluate(() => window.__playfood.language())).toBe('el');
    await page.evaluate(() => window.__playfood.goToScreen('lang'));
    await page.waitForFunction(() => window.__playfood?.screen() === 'lang');

    expect(await page.evaluate(() => window.__playfood.language())).toBe('el');
    await expectEnglishLanguageScreen(page);

    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.waitForFunction(() => window.__playfood?.screen() === 'avatar');
    expect(await page.evaluate(() => window.__playfood.language())).toBe('en');
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', 'CHOOSE YOUR CHARACTER');
  });
});

const VIEWPORTS = [
  { name: 'full HD', width: 1920, height: 1080, compact: false },
  { name: 'laptop', width: 1366, height: 768, compact: false },
  { name: 'small laptop', width: 1280, height: 720, compact: false },
  { name: 'tablet landscape', width: 1024, height: 768, compact: false },
  { name: 'tablet portrait', width: 768, height: 1024, compact: false },
  { name: 'short landscape', width: 844, height: 390, compact: true },
];

test.describe('language selector responsive EU panel', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} aligns the enlarged EU panel with the language row`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await bootLanguageScreen(page, 'en');
      const geometry = await readLanguageScreenGeometry(page);

      geometry.languageButtons.forEach((rect, index) => {
        expectRectInsideViewport(rect, viewport, `${LANGUAGE_NAMES[index]} card`);
      });
      expect(new Set(geometry.languageButtons.map(rect => Math.round(rect.top))).size,
        'all four language choices must stay on one row').toBe(1);
      expectRectInsideViewport(geometry.action, viewport, 'Play Code action');
      expectRectInsideViewport(geometry.footer, viewport, 'EU panel');
      expectRectInsideViewport(geometry.emblem, viewport, 'EU emblem');
      expectRectInsideViewport(geometry.projectNo, viewport, 'project number');
      expectRectInsideViewport(geometry.disclaimer, viewport, 'disclaimer action');

      expect(
        Math.abs(geometry.footer.width - geometry.languageRow.width),
        `EU panel width ${geometry.footer.width}px must match language-row span ${geometry.languageRow.width}px`,
      ).toBeLessThanOrEqual(8);
      expect(
        Math.abs((geometry.footer.left + geometry.footer.right) / 2
          - (geometry.languageRow.left + geometry.languageRow.right) / 2),
        'EU panel and language row must share the same horizontal centre',
      ).toBeLessThanOrEqual(2);

      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight);
      expect(geometry.panelBackgroundColor, 'EU information must not look like a game card')
        .toBe('rgba(0, 0, 0, 0)');
      expect(geometry.panelBackgroundImage, 'EU information needs a soft contrast band')
        .toContain('linear-gradient');
      expect(Number.parseFloat(geometry.panelBorderTopWidth)).toBe(0);
      expect(geometry.panelBoxShadow).toBe('none');
      expect(geometry.panelBackdropFilter).toBe('none');

      if (viewport.compact) {
        expect(geometry.footer.top - geometry.action.bottom, 'compact footer separation')
          .toBeGreaterThanOrEqual(9);
        expect(geometry.emblem.height).toBeGreaterThanOrEqual(28);
        expect(geometry.projectFontSize).toBeGreaterThanOrEqual(11);
        expect(geometry.disclaimerFontSize).toBeGreaterThanOrEqual(11);
        expect(geometry.footer.height, 'short landscape should use the compact EU panel')
          .toBeLessThanOrEqual(86);
      } else {
        expect(geometry.footer.top - geometry.action.bottom, 'EU note must sit below the game action')
          .toBeGreaterThanOrEqual(32);
        expect(geometry.emblem.height).toBeGreaterThanOrEqual(40);
        expect(geometry.emblem.height).toBeLessThanOrEqual(48);
        expect(geometry.projectFontSize).toBeGreaterThanOrEqual(14);
        expect(geometry.projectFontSize).toBeLessThanOrEqual(14.5);
        expect(geometry.disclaimerFontSize).toBeGreaterThanOrEqual(14);
        expect(geometry.disclaimerFontSize).toBeLessThanOrEqual(14.5);
        expect(geometry.footer.height).toBeLessThanOrEqual(96);
      }
    });
  }
});
