import { expect, test } from '@playwright/test';

async function mountShipyardHarness(page, {
  width,
  height,
  language = 'en',
  viewportWidth = width,
  viewportHeight = height,
}) {
  await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
  await page.goto(process.env.SHIPYARD_BASE_URL || '/');
  await page.evaluate(async ({ surfaceWidth, surfaceHeight, selectedLanguage }) => {
    const [reactModule, reactDomClientModule, panelModule, stageModule, { default: i18n }] = await Promise.all([
      import('/@id/react'),
      import('/@id/react-dom/client'),
      import('/src/components/BoatUpgradePanel.jsx'),
      import('/src/components/ActiveCanvasStage.jsx'),
      import('/src/i18n/index.js'),
    ]);
    const React = reactModule.default || reactModule;
    const createRoot = reactDomClientModule.createRoot || reactDomClientModule.default?.createRoot;
    await i18n.changeLanguage(selectedLanguage);

    const host = document.createElement('div');
    host.id = 'shipyard-component-harness';
    Object.assign(host.style, {
      position: 'fixed',
      inset: '0 auto auto 0',
      width: `${surfaceWidth}px`,
      height: `${surfaceHeight}px`,
      zIndex: '10000',
    });
    document.body.append(host);

    const gameplayKeys = [];
    const gameplayListener = (event) => gameplayKeys.push(event.key);
    window.addEventListener('keydown', gameplayListener);

    const root = createRoot(host);
    const state = { closeCount: 0, purchaseCount: 0 };

    function BlockingProbe() {
      const blocked = stageModule.useBlockingCanvasOverlayOpen();
      return React.createElement('span', {
        'data-testid': 'blocking-probe',
        'data-blocked': String(blocked),
      });
    }

    function render(showPanel) {
      root.render(
        React.createElement(
          stageModule.ActiveCanvasStage,
          null,
          showPanel && React.createElement(panelModule.default, {
            boatTier: 0,
            points: 500,
            onPurchase: (tier) => {
              state.purchaseCount += 1;
              return { success: true, tier };
            },
            onClose: () => { state.closeCount += 1; },
          }),
          React.createElement(BlockingProbe),
        ),
      );
    }

    window.__shipyardHarness = {
      gameplayKeys,
      host,
      render,
      state,
      unmount() {
        root.unmount();
        window.removeEventListener('keydown', gameplayListener);
        host.remove();
      },
    };
    render(true);
  }, { surfaceWidth: width, surfaceHeight: height, selectedLanguage: language });

  await expect(page.getByTestId('boat-upgrade-panel')).toBeVisible();
}

async function expectPanelFitsSurface(page) {
  const host = page.locator('#shipyard-component-harness');
  const panel = page.getByTestId('boat-upgrade-panel');
  const purchase = page.getByTestId('boat-purchase');
  const previous = page.getByTestId('boat-previous');
  const shell = panel.locator('.pf-shipyard-shell');
  const body = panel.locator('.pf-shipyard-body');
  const controlsGuide = page.getByTestId('boat-controls-guide');
  const previewBay = panel.locator('.pf-shipyard-preview-bay');
  const details = panel.locator('.pf-shipyard-details');
  const liveRegion = page.getByRole('status');
  const hostBox = await host.boundingBox();
  const panelBox = await panel.boundingBox();
  const purchaseBox = await purchase.boundingBox();
  const previousBox = await previous.boundingBox();
  const shellBox = await shell.boundingBox();
  const bodyBox = await body.boundingBox();
  const controlsGuideBox = await controlsGuide.boundingBox();
  const previewBayBox = await previewBay.boundingBox();
  const detailsBox = await details.boundingBox();
  const liveRegionStyle = await liveRegion.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clipPath: style.clipPath,
      height: style.height,
      position: style.position,
      width: style.width,
    };
  });
  const controlTypography = await controlsGuide.evaluate((element) => ({
    key: Number.parseFloat(getComputedStyle(element.querySelector('kbd')).fontSize),
    label: Number.parseFloat(
      getComputedStyle(element.querySelector('.pf-shipyard-control-group')).fontSize,
    ),
  }));
  const overflow = await panel.evaluate((element) => {
    const measuredElements = {
      panel: element,
      shell: element.querySelector('.pf-shipyard-shell'),
      body: element.querySelector('.pf-shipyard-body'),
    };
    return Object.fromEntries(Object.entries(measuredElements).map(([name, measured]) => [name, {
      x: measured.scrollWidth - measured.clientWidth,
      y: measured.scrollHeight - measured.clientHeight,
    }]));
  });
  expect(overflow).toEqual({
    panel: { x: 0, y: 0 },
    shell: { x: 0, y: 0 },
    body: { x: 0, y: 0 },
  });

  expect(panelBox.width).toBeCloseTo(Math.min(900, hostBox.width - 32), 1);
  expect(panelBox.height).toBeCloseTo(Math.min(560, hostBox.height - 32), 1);

  expect(panelBox.x).toBeGreaterThanOrEqual(hostBox.x + 16);
  expect(panelBox.y).toBeGreaterThanOrEqual(hostBox.y + 16);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(hostBox.x + hostBox.width - 16);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(hostBox.y + hostBox.height - 16);
  expect(previousBox.width).toBeGreaterThanOrEqual(56);
  expect(previousBox.height).toBeGreaterThanOrEqual(56);
  expect(purchaseBox.height).toBeGreaterThanOrEqual(52);
  expect(previewBayBox.height).toBeGreaterThanOrEqual(200);
  expect(previewBayBox.height / previewBayBox.width).toBeGreaterThanOrEqual(0.65);
  expect(previewBayBox.width).toBeLessThan(detailsBox.width);
  expect(controlsGuideBox.width).toBeGreaterThanOrEqual(bodyBox.width * 0.85);
  expect(controlsGuideBox.height).toBeGreaterThanOrEqual(40);
  expect(controlsGuideBox.x).toBeGreaterThanOrEqual(bodyBox.x);
  expect(controlsGuideBox.x + controlsGuideBox.width)
    .toBeLessThanOrEqual(bodyBox.x + bodyBox.width);
  await expect(controlsGuide.locator('.pf-shipyard-control-group')).toHaveCount(3);
  await expect(controlsGuide).toContainText('Αλλαγή καραβιού');
  await expect(controlsGuide).toContainText('Αγορά');
  await expect(controlsGuide).toContainText('Κλείσιμο');
  expect(controlTypography.label).toBeGreaterThanOrEqual(14);
  expect(controlTypography.key).toBeGreaterThanOrEqual(11);
  expect(purchaseBox.y + purchaseBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
  expect(liveRegionStyle).toEqual({
    clipPath: 'inset(50%)',
    height: '1px',
    position: 'absolute',
    width: '1px',
  });
  expect(bodyBox.y + bodyBox.height).toBeLessThanOrEqual(shellBox.y + shellBox.height);
}

async function browseToGreekCleanupBoat(page) {
  const next = page.getByTestId('boat-next');
  await next.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Καράβι 2 από 5')).toBeVisible();
  await page.keyboard.press('ArrowRight');

  await expect(page.getByText('Σκάφος καθαρισμού', { exact: true })).toBeVisible();
  await expect(page.getByTestId('boat-upgrade-panel')).toHaveAttribute('data-boat-state', 'prerequisite');
  await expect(page.getByRole('status')).toContainText('Σκάφος καθαρισμού');
  await expect(next).toBeFocused();
}

test.describe('BoatUpgradePanel component harness', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => window.__shipyardHarness?.unmount());
  });

  test('owns gameplay keys, announces selection, traps focus, and cleans up blocking state', async ({ page }) => {
    await mountShipyardHarness(page, {
      width: 800,
      height: 440,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    await expect(page.getByTestId('blocking-probe')).toHaveAttribute('data-blocked', 'true');
    await expect(page.getByTestId('boat-upgrade-panel')).toHaveAttribute('data-boat-state', 'current');

    const next = page.getByTestId('boat-next');
    await next.focus();
    await page.keyboard.press('ArrowRight');

    await expect(page.getByTestId('boat-upgrade-panel')).toHaveAttribute('data-boat-state', 'available');
    await expect(page.getByRole('status'))
      .toHaveText('Viewing Sailboat. Status: You can buy it.');
    await expect(next).toBeFocused();

    const purchase = page.getByTestId('boat-purchase');
    const dialog = page.getByTestId('boat-upgrade-panel');
    const title = page.locator('#boat-upgrade-title');
    const previous = page.getByTestId('boat-previous');
    expect(await page.evaluate(() => window.__shipyardHarness.state.purchaseCount)).toBe(0);
    await purchase.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__shipyardHarness.state.purchaseCount)).toBe(1);
    await expect(dialog).toHaveAttribute('data-boat-state', 'current');
    await expect(page.getByRole('status')).toHaveText('Your new boat is ready!');
    await expect(title).toBeFocused();
    expect(await dialog.evaluate((panel) => panel.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    await expect(previous).toBeFocused();

    await next.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('boat-upgrade-panel')).toHaveAttribute('data-boat-state', 'available');
    await purchase.focus();
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.__shipyardHarness.state.purchaseCount)).toBe(2);
    await expect(page.getByTestId('boat-upgrade-panel')).toHaveAttribute('data-boat-state', 'current');

    const close = page.getByTestId('boat-close');
    await close.focus();
    await page.keyboard.press('Tab');
    await expect(previous).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(close).toBeFocused();

    await page.keyboard.press('Escape');
    await page.keyboard.press('q');
    await page.keyboard.press('Q');
    expect(await page.evaluate(() => window.__shipyardHarness.state.closeCount)).toBe(3);
    expect(await page.evaluate(() => window.__shipyardHarness.gameplayKeys.filter((key) => (
      ['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 'q', 'Q'].includes(key)
    )))).toEqual([]);

    await page.evaluate(() => window.__shipyardHarness.render(false));
    await expect(page.getByTestId('blocking-probe')).toHaveAttribute('data-blocked', 'false');
    await page.keyboard.press('ArrowLeft');
    expect(await page.evaluate(() => window.__shipyardHarness.gameplayKeys.filter((key) => (
      ['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 'q', 'Q'].includes(key)
    )))).toEqual(['ArrowLeft']);
  });

  test('fits the 800×440 canvas surface without scroll or clipping', async ({ page }) => {
    await mountShipyardHarness(page, {
      width: 800,
      height: 440,
      language: 'el',
      viewportWidth: 800,
      viewportHeight: 600,
    });
    await browseToGreekCleanupBoat(page);
    await expectPanelFitsSurface(page);
  });

  test('fits the 1024×563 surface produced by a 1024×768 viewport', async ({ page }) => {
    await mountShipyardHarness(page, {
      width: 1024,
      height: 563,
      language: 'el',
      viewportWidth: 1024,
      viewportHeight: 768,
    });
    await browseToGreekCleanupBoat(page);
    await expectPanelFitsSurface(page);
  });
});
