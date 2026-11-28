import { test, expect } from '@playwright/test';

const RESULT_DATA = {
  island: 'growing',
  mission: 'WhereDoesItGrow',
  missionId: 1,
  score: 100,
  passed: true,
  stars: 2,
  tier: 'great',
  bestStreak: 6,
  missed: [
    { id: 'beans', origin: 'vine' },
    { id: 'potato', origin: 'soil' },
  ],
};

const SEASON_RESULT_DATA = {
  island: 'local',
  mission: 'SeasonMatcher',
  missionId: 1,
  score: 60,
  passed: true,
  stars: 2,
  tier: 'good',
  correct: 6,
  traveledCount: 3,
  traveled: [
    { emoji: '🍋', name: 'Λεμόνι', window: 'Οκτώβριος έως Απρίλιος' },
    { emoji: '🥗', name: 'Μαρούλι', window: 'Σεπτέμβριος έως Μάιος' },
    { emoji: '🍎', name: 'Μήλο', window: 'Σεπτέμβριος έως Ιανουάριος' },
  ],
};

async function openSeasonResult(page, viewport, data = SEASON_RESULT_DATA) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => Boolean(window.__playfood));
  await page.evaluate((resultData) => window.__playfood.goToScreen('result', resultData), data);
  await page.waitForTimeout(650);
}

async function openResult(page, viewport) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => Boolean(window.__playfood));
  await page.evaluate((data) => window.__playfood.goToScreen('result', data), RESULT_DATA);
  await expect(page.getByRole('heading', { name: 'Πολύ καλά!' })).toBeVisible();
  await page.waitForTimeout(650); // let the result card's entrance animation settle
}

test('compacts the result hierarchy on a landscape tablet', async ({ page }) => {
  await openResult(page, { width: 1024, height: 768 });

  const metrics = await page.evaluate(() => {
    const resultContainer = [...document.querySelectorAll('div')]
      .find((element) => getComputedStyle(element).overflowY === 'auto');
    const card = resultContainer.firstElementChild;
    const buttons = [...card.querySelectorAll('button')].map((button) => button.getBoundingClientRect());
    const cardRect = card.getBoundingClientRect();
    return {
      cardHeight: cardRect.height,
      cardTop: cardRect.top,
      cardBottom: cardRect.bottom,
      paddingTop: parseFloat(getComputedStyle(card).paddingTop),
      hasRedundantTierEmoji: Boolean(card.querySelector('h1')),
      buttonTopDelta: Math.abs(buttons[0].top - buttons[1].top),
      buttonsBottom: Math.max(...buttons.map((rect) => rect.bottom)),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
    };
  });

  expect(metrics.cardHeight).toBeLessThanOrEqual(736);
  expect(metrics.cardTop).toBeGreaterThanOrEqual(16);
  expect(metrics.cardBottom).toBeLessThanOrEqual(752);
  expect(metrics.paddingTop).toBeLessThanOrEqual(32);
  expect(metrics.hasRedundantTierEmoji).toBe(false);
  expect(metrics.buttonTopDelta).toBeLessThan(2);
  expect(metrics.buttonsBottom).toBeLessThanOrEqual(768);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
});

test('keeps the result card contained on a portrait tablet', async ({ page }) => {
  await openResult(page, { width: 768, height: 1024 });

  const metrics = await page.evaluate(() => {
    const resultContainer = [...document.querySelectorAll('div')]
      .find((element) => getComputedStyle(element).overflowY === 'auto');
    const card = resultContainer.firstElementChild;
    const cardRect = card.getBoundingClientRect();
    return {
      cardHeight: cardRect.height,
      cardLeft: cardRect.left,
      cardRight: cardRect.right,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
    };
  });

  expect(metrics.cardHeight).toBeLessThan(960);
  expect(metrics.cardLeft).toBeGreaterThanOrEqual(16);
  expect(metrics.cardRight).toBeLessThanOrEqual(752);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
});

test('keeps full month names readable in the Season Matcher debrief on tablet', async ({ page }) => {
  await openSeasonResult(page, { width: 768, height: 1024 });
  await expect(page.getByText(/Τι ταξίδεψε:/i)).toBeVisible();
  await expect(page.getByText(/Οκτώβριος έως Απρίλιος/)).toBeVisible();

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    clippedRows: [...document.querySelectorAll('p')]
      .filter((element) => element.textContent?.startsWith('✈️'))
      .some((element) => element.scrollWidth > element.clientWidth),
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.clippedRows).toBe(false);
});

test('shows the focused Season Matcher completion without a generic score', async ({ page }) => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1180, height: 820 },
  ]) {
    await openSeasonResult(page, viewport);

    await expect(page.getByRole('heading', { name: 'Γέμισες το εποχικό καλάθι!' })).toBeVisible();
    await expect(page.getByText(/6 εποχικά τρόφιμα/i)).toBeVisible();
    await expect(page.getByText(/Τρόφιμα που ταξίδεψαν από μακριά: 3/i)).toBeVisible();
    await expect(page.getByText('Τι έμαθες')).toBeVisible();
    await expect(page.getByText(/Το σκορ σου:/i)).toHaveCount(0);

    const metrics = await page.evaluate(() => {
      const resultContainer = [...document.querySelectorAll('div')]
        .find((element) => getComputedStyle(element).overflowY === 'auto');
      const cardRect = resultContainer.firstElementChild.getBoundingClientRect();
      return {
        top: cardRect.top,
        bottom: cardRect.bottom,
        left: cardRect.left,
        right: cardRect.right,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth,
        innerHeight,
      };
    });
    const viewportLabel = `${viewport.width}x${viewport.height}`;
    expect(metrics.top, `${viewportLabel}: card top`).toBeGreaterThanOrEqual(8);
    expect(metrics.bottom, `${viewportLabel}: card bottom`).toBeLessThanOrEqual(metrics.innerHeight - 8);
    expect(metrics.left, `${viewportLabel}: card left`).toBeGreaterThanOrEqual(16);
    expect(metrics.right, `${viewportLabel}: card right`).toBeLessThanOrEqual(metrics.innerWidth - 16);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  }
});
