import { test, expect } from '@playwright/test';

const LANGUAGES = ['en', 'el', 'nl', 'pt'];

async function openCertificate(page, language) {
  await page.goto(`/?testMode=1&lang=${language}`);
  await page.waitForFunction(() => Boolean(window.__playfood));
  await page.evaluate(() => {
    window.__playfood.state().setHero('braid');
    window.__playfood.state().debugCompleteAll();
    window.__playfood.goToScreen('certificate');
  });
  await page.locator('[data-testid="certificate-island-grid"]').waitFor();
  await page.evaluate(() => document.fonts?.ready);
}

test.describe('certificate island layout', () => {
  for (const language of LANGUAGES) {
    test(`keeps four equal columns and two-line labels in ${language}`, async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 1100 });
      await openCertificate(page, language);

      const geometry = await page.locator('[data-testid="certificate-island-grid"] > [data-certificate-island]').evaluateAll((items) => (
        items.map((item) => {
          const rect = item.getBoundingClientRect();
          const label = item.querySelector('[data-testid="certificate-island-name"]');
          const labelRect = label.getBoundingClientRect();
          const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
          return {
            x: rect.x,
            width: rect.width,
            labelHeight: labelRect.height,
            lineHeight,
            labelFits: label.scrollWidth <= label.clientWidth && label.scrollHeight <= label.clientHeight,
          };
        })
      ));

      expect(geometry).toHaveLength(4);
      expect(Math.max(...geometry.map(({ width }) => width)) - Math.min(...geometry.map(({ width }) => width))).toBeLessThan(1);
      const gaps = geometry.slice(1).map(({ x }, index) => x - (geometry[index].x + geometry[index].width));
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1);
      expect(Math.max(...geometry.map(({ labelHeight }) => labelHeight)) - Math.min(...geometry.map(({ labelHeight }) => labelHeight))).toBeLessThan(1);
      expect(geometry.every(({ labelFits, labelHeight, lineHeight }) => labelFits && labelHeight <= lineHeight * 2 + 1)).toBe(true);
      expect(await page.locator('[data-testid="certificate-island-name"][data-label-lines="2"]').count())
        .toBeGreaterThanOrEqual(1);
      const lineRules = await page.locator('[data-testid="certificate-island-name"]').evaluateAll((labels) => (
        labels.map((label) => ({
          expected: label.getAttribute('aria-label').trim().split(/\s+/).length > 1 ? 2 : 1,
          actual: Number(label.dataset.labelLines),
        }))
      ));
      expect(lineRules.every(({ expected, actual }) => expected === actual)).toBe(true);
      const stackedLines = await page
        .locator('[data-testid="certificate-island-name"][data-label-lines="2"]')
        .evaluateAll((labels) => labels.map((label) => {
          const [first, second] = [...label.children].map((line) => line.getBoundingClientRect());
          const labelRect = label.getBoundingClientRect();
          const labelCenter = labelRect.left + labelRect.width / 2;
          return {
            isStacked: second.top >= first.bottom - 1,
            firstLineCenterDelta: Math.abs((first.left + first.right) / 2 - labelCenter),
            secondLineCenterDelta: Math.abs((second.left + second.right) / 2 - labelCenter),
          };
        }));
      expect(stackedLines.every(({ isStacked, firstLineCenterDelta, secondLineCenterDelta }) => (
        isStacked && firstLineCenterDelta < 1 && secondLineCenterDelta < 1
      ))).toBe(true);
    });
  }

  test('keeps the supporting certificate copy comfortably readable', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1100 });
    await openCertificate(page, 'en');

    const typography = await page.locator('.pf-content').evaluate((content) => {
      const directParagraphSizes = [...content.children]
        .filter((element) => element.tagName === 'P')
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
      const labelSizes = [...content.querySelectorAll('[data-testid="certificate-island-name"]')]
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
      const starPillSizes = [...content.querySelectorAll('[data-testid="certificate-island-grid"] .pf-tok')]
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
      const footer = content.querySelector('.pf-branding p');

      return {
        directParagraphSizes,
        labelSizes,
        starPillSizes,
        footerSize: Number.parseFloat(getComputedStyle(footer).fontSize),
      };
    });

    expect(typography.directParagraphSizes).toHaveLength(3);
    expect(typography.directParagraphSizes[0]).toBeGreaterThanOrEqual(14);
    expect(typography.directParagraphSizes[1]).toBeGreaterThanOrEqual(16);
    expect(typography.directParagraphSizes[2]).toBeGreaterThanOrEqual(16);
    expect(typography.labelSizes.every((size) => size >= 12)).toBe(true);
    expect(typography.starPillSizes.every((size) => size >= 15)).toBe(true);
    expect(typography.footerSize).toBeGreaterThanOrEqual(12);
  });

  test('keeps the celebration title prominent without overwhelming the certificate', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1100 });
    await openCertificate(page, 'en');

    const titleLayout = await page.locator('.pf-content h1').evaluate((title) => {
      const titleRange = document.createRange();
      titleRange.selectNodeContents(title);
      const titleRect = titleRange.getBoundingClientRect();
      const cardRect = title.closest('.pf-card').getBoundingClientRect();
      return {
        fontSize: Number.parseFloat(getComputedStyle(title).fontSize),
        widthRatio: titleRect.width / cardRect.width,
      };
    });

    expect(titleLayout.fontSize).toBeLessThanOrEqual(92);
    expect(titleLayout.widthRatio).toBeLessThan(0.9);
  });

  test('uses the official primary PLAYFOOD logo', async ({ page }) => {
    await openCertificate(page, 'en');
    const logo = page.locator('.pf-playfood-logo');

    await expect(logo).toHaveAttribute('src', '/assets/logos/primary-logo-01.svg');
    const naturalSize = await logo.evaluate((image) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    }));
    expect(naturalSize.width).toBeGreaterThan(0);
    expect(naturalSize.height).toBeGreaterThan(0);
  });

  test('preserves the equal four-column layout when printed', async ({ page }) => {
    await openCertificate(page, 'pt');
    await page.emulateMedia({ media: 'print' });

    const printLayout = await page.locator('[data-testid="certificate-island-grid"]').evaluate((grid) => {
      const gridRect = grid.getBoundingClientRect();
      const cardRect = grid.closest('.pf-card').getBoundingClientRect();
      const items = [...grid.querySelectorAll(':scope > [data-certificate-island]')]
        .map((item) => item.getBoundingClientRect());
      return {
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        gridLeft: gridRect.left,
        gridRight: gridRect.right,
        widths: items.map(({ width }) => width),
        gaps: items.slice(1).map(({ left }, index) => left - items[index].right),
      };
    });

    expect(printLayout.gridLeft).toBeGreaterThanOrEqual(printLayout.cardLeft);
    expect(printLayout.gridRight).toBeLessThanOrEqual(printLayout.cardRight);
    expect(Math.max(...printLayout.widths) - Math.min(...printLayout.widths)).toBeLessThan(1);
    expect(Math.max(...printLayout.gaps) - Math.min(...printLayout.gaps)).toBeLessThan(1);
  });
});
