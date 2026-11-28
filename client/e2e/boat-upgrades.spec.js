import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const VERSION_2_SAMPLE_CODE = 'fizo-sete-mati-rivo-hali-nima-todo-fise-liwe';
const VERSION_3_SAMPLE_CODE = 'kilo-sete-mati-rivo-hasa-sima-zimi-fise-jave';
const LIGHTHOUSE_SHIPYARD_POSITION = Object.freeze({ col: 5, row: 13, dir: 1 });
const SCREENSHOT_DIR = path.resolve('test-results/boat-upgrades');

async function openLighthouse(
  page,
  { points = 0, boatTier = 0, language = 'el' } = {},
) {
  await page.goto(`/?testMode=1&lang=${language}`);
  await page.waitForFunction(() => Boolean(window.__playfood));
  await page.evaluate(({ seededPoints, seededTier }) => {
    window.__playfood.setProgress({
      points: seededPoints,
      boatTier: seededTier,
      heroId: 'braid',
      lighthouseOnboardingSeen: true,
    });
    window.__playfood.goToScreen('lighthouse');
  }, { seededPoints: points, seededTier: boatTier });
  await page.waitForFunction(() => window.__playfood.screen() === 'lighthouse');
  await page.waitForFunction(() => Boolean(
    document.querySelector('canvas')?._stateRef?.current?.player,
  ));
}

async function lighthouseState(page) {
  return page.evaluate(() => document.querySelector('canvas')._stateRef.current);
}

async function waitForIrisOpen(page) {
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.irisOpenness
  ))).toBeGreaterThanOrEqual(0.99);
}

async function positionAtShipyard(page) {
  await page.evaluate(({ col, row, dir }) => {
    const player = document.querySelector('canvas')._stateRef.current.player;
    Object.assign(player, {
      col,
      row,
      dir,
      pixelX: col * 32,
      pixelY: row * 32,
      moving: false,
      moveTimer: 0,
      fromX: col * 32,
      fromY: row * 32,
      toX: col * 32,
      toY: row * 32,
    });
  }, LIGHTHOUSE_SHIPYARD_POSITION);
  await expect.poll(async () => (await lighthouseState(page)).nearShipyard).toBe(true);
}

async function openShipyardWithEnter(page) {
  await positionAtShipyard(page);
  await page.locator('canvas').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('boat-upgrade-panel')).toBeVisible();
}

async function selectedTier(page) {
  return page.getByTestId('boat-upgrade-panel').evaluate((panel) => (
    Array.from(panel.querySelectorAll('.pf-shipyard-progress > span'))
      .findIndex((marker) => marker.dataset.selected === 'true')
  ));
}

async function expectSelectedTier(page, tier, state) {
  await expect.poll(() => selectedTier(page)).toBe(tier);
  if (state) {
    await expect(page.getByTestId('boat-upgrade-panel')).toHaveAttribute(
      'data-boat-state',
      state,
    );
  }
}

async function dispatchTouchAt(page, x, y, holdMs = 90) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  await page.waitForTimeout(holdMs);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(50);
}

async function dispatchTouchOn(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Touch target has no visible bounding box');
  await dispatchTouchAt(page, box.x + box.width / 2, box.y + box.height / 2);
}

async function waitForAnimationFrames(page, frameCount = 8) {
  await page.evaluate((count) => new Promise((resolve) => {
    let remaining = count;
    const nextFrame = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(nextFrame);
    };
    requestAnimationFrame(nextFrame);
  }), frameCount);
}

async function waitForShipyardHitRect(page) {
  await expect.poll(() => page.evaluate(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    const rect = state?.shipyardHitRect;
    const visualRect = state?.shipyardVisualRect;
    return Boolean(
      rect
      && Number.isFinite(rect.x)
      && Number.isFinite(rect.y)
      && rect.width > 0
      && rect.height > 0
      && visualRect
      && Number.isFinite(visualRect.x)
      && Number.isFinite(visualRect.y)
      && visualRect.width > 0
      && visualRect.height > 0
    );
  })).toBe(true);
}

async function shipyardStationGeometry(page) {
  await waitForShipyardHitRect(page);
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const state = canvas._stateRef.current;
    const hitRect = state.shipyardHitRect;
    const visualRect = state.shipyardVisualRect;
    if (!hitRect || !visualRect) throw new Error('The Lighthouse renderer did not publish station geometry');
    const canvasRect = canvas.getBoundingClientRect();
    const hidpi = canvas.__hidpi;
    const toViewport = (logicalPoint) => {
      if (!hidpi) {
        return {
          x: canvasRect.left + (logicalPoint.x / canvas.width) * canvasRect.width,
          y: canvasRect.top + (logicalPoint.y / canvas.height) * canvasRect.height,
        };
      }

      const bufferPixelsPerCssPixel = canvas.width / canvasRect.width;
      return {
        x: canvasRect.left
          + (logicalPoint.x * hidpi.k + hidpi.ox) / bufferPixelsPerCssPixel,
        y: canvasRect.top
          + (logicalPoint.y * hidpi.k + hidpi.oy) / bufferPixelsPerCssPixel,
      };
    };
    return {
      hitRect,
      visualRect,
      visibleCenter: toViewport({
        x: visualRect.x + visualRect.width / 2,
        y: visualRect.y + visualRect.height / 2,
      }),
      blankPoint: toViewport({
        x: visualRect.x - 8,
        y: visualRect.y + visualRect.height / 2,
      }),
    };
  });
}

async function positionForExistingDebrisCollection(page) {
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current?.debris?.length || 0
  ))).toBeGreaterThan(0);

  return page.evaluate(async () => {
    const { isNavigable } = await import('/src/overworld/mapData.js');
    const state = document.querySelector('canvas')._stateRef.current;
    const tileSize = 32;
    const recyclingCenter = { x: 28.5 * tileSize, y: 37.5 * tileSize };
    const approaches = [
      { startDx: -2, startDy: 0, stepDx: 1, stepDy: 0, key: 'ArrowRight' },
      { startDx: 2, startDy: 0, stepDx: -1, stepDy: 0, key: 'ArrowLeft' },
      { startDx: 0, startDy: -2, stepDx: 0, stepDy: 1, key: 'ArrowDown' },
      { startDx: 0, startDy: 2, stepDx: 0, stepDy: -1, key: 'ArrowUp' },
    ];

    for (const debris of state.debris) {
      if (Math.hypot(
        debris.x - recyclingCenter.x,
        debris.y - recyclingCenter.y,
      ) < tileSize * 8) continue;

      const debrisCol = Math.floor(debris.x / tileSize);
      const debrisRow = Math.floor(debris.y / tileSize);
      for (const approach of approaches) {
        const startCol = debrisCol + approach.startDx;
        const startRow = debrisRow + approach.startDy;
        const nextCol = startCol + approach.stepDx;
        const nextRow = startRow + approach.stepDy;
        if (!isNavigable(startCol, startRow) || !isNavigable(nextCol, nextRow)) continue;

        const startX = startCol * tileSize;
        const startY = startRow * tileSize;
        const safelyOutsideEveryPickup = state.debris.every((item) => (
          Math.hypot(
            item.x - (startX + tileSize / 2),
            item.y - (startY + tileSize / 2),
          ) >= tileSize * 1.2
        ));
        if (!safelyOutsideEveryPickup) continue;

        const targetCenter = {
          x: nextCol * tileSize + tileSize / 2,
          y: nextRow * tileSize + tileSize / 2,
        };
        if (Math.hypot(debris.x - targetCenter.x, debris.y - targetCenter.y) >= tileSize) {
          continue;
        }
        const otherDebris = state.debris.filter((item) => item !== debris);
        const nearestOtherDistance = otherDebris.reduce((nearest, item) => Math.min(
          nearest,
          Math.hypot(item.x - targetCenter.x, item.y - targetCenter.y),
        ), Infinity);
        if (nearestOtherDistance < tileSize * 4) continue;

        Object.assign(state.player, {
          col: startCol,
          row: startRow,
          pixelX: startX,
          pixelY: startY,
          moving: false,
          moveTimer: 0,
          fromX: startX,
          fromY: startY,
          toX: startX,
          toY: startY,
        });
        return {
          direction: approach.key,
          startCol,
          startRow,
          debrisCol,
          debrisRow,
          initialDebrisCount: state.debris.length,
          nearestOtherDistance,
        };
      }
    }

    throw new Error('No existing debris had a safe two-tile navigable approach');
  });
}

async function positionForRecyclingDockApproach(page) {
  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const col = 28;
    const row = 33;
    Object.assign(state.player, {
      col,
      row,
      pixelX: col * 32,
      pixelY: row * 32,
      moving: false,
      moveTimer: 0,
      fromX: col * 32,
      fromY: row * 32,
      toX: col * 32,
      toY: row * 32,
    });
  });
  await expect.poll(() => page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return { col: state.player.col, row: state.player.row, nearDock: state.nearDock };
  })).toEqual({ col: 28, row: 33, nearDock: null });
}

async function buyTierTwoSequentially(page) {
  await openLighthouse(page, { points: 700, boatTier: 0 });
  await openShipyardWithEnter(page);
  await page.getByTestId('boat-next').click();
  await expectSelectedTier(page, 1, 'available');
  await page.getByTestId('boat-purchase').click();
  await expectSelectedTier(page, 1, 'current');
  await page.getByTestId('boat-next').click();
  await expectSelectedTier(page, 2, 'available');
  await page.getByTestId('boat-purchase').click();
  await expectSelectedTier(page, 2, 'current');
}

async function getPreviewOpaqueBounds(page) {
  return page.getByTestId('boat-preview').evaluate((canvas) => {
    const { data, width, height } = canvas.getContext('2d').getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let pixels = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[((y * width + x) * 4) + 3] === 0) continue;
        pixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return {
      height: maxY >= minY ? maxY - minY + 1 : 0,
      pixels,
      width: maxX >= minX ? maxX - minX + 1 : 0,
    };
  });
}

async function getBoatAtlasMetrics(page) {
  return page.evaluate(async () => {
    const { buildAtlas } = await import('/src/overworld/tileAtlas.js');
    const atlas = buildAtlas();
    const opaqueBounds = (canvas) => {
      const { data, width, height } = canvas.getContext('2d').getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (data[((y * width + x) * 4) + 3] === 0) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      return {
        height: maxY >= minY ? maxY - minY + 1 : 0,
        width: maxX >= minX ? maxX - minX + 1 : 0,
      };
    };
    return atlas.boats.map((directions) => directions.map((frames) => (
      frames.map((frame) => ({
        canvasHeight: frame.height,
        canvasWidth: frame.width,
        ...opaqueBounds(frame),
      }))
    )));
  });
}

async function installCanvasTextRecorder(page) {
  await page.evaluate(() => {
    window.__playfoodCanvasText = [];
    const originalFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function recordFillText(text, ...args) {
      window.__playfoodCanvasText.push(String(text));
      return originalFillText.call(this, text, ...args);
    };
  });
}

async function captureScreenshot(page, filename) {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    animations: 'disabled',
  });
}

async function expectShipyardTextFits(page) {
  const overflow = await page.getByTestId('boat-upgrade-panel').evaluate((panel) => {
    const selectors = {
      heading: '.pf-shipyard-name-row h3',
      state: '.pf-shipyard-state',
      capacity: '.pf-shipyard-capacity',
      benefit: '.pf-shipyard-benefit',
      purchase: '[data-testid="boat-purchase"]',
      close: '.pf-shipyard-close-label',
    };
    return Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
      const element = panel.querySelector(selector);
      return [name, {
        horizontal: element.scrollWidth - element.clientWidth,
        vertical: element.scrollHeight - element.clientHeight,
      }];
    }));
  });
  expect(overflow).toEqual({
    heading: { horizontal: 0, vertical: 0 },
    state: { horizontal: 0, vertical: 0 },
    capacity: { horizontal: 0, vertical: 0 },
    benefit: { horizontal: 0, vertical: 0 },
    purchase: { horizontal: 0, vertical: 0 },
    close: { horizontal: 0, vertical: 0 },
  });

  const liveRegionStyle = await page.getByRole('status').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clipPath: style.clipPath,
      height: style.height,
      position: style.position,
      width: style.width,
    };
  });
  expect(liveRegionStyle).toEqual({
    clipPath: 'inset(50%)',
    height: '1px',
    position: 'absolute',
    width: '1px',
  });
}

test.describe('Lighthouse shipyard child journey', () => {
  test('opens from the required player tile with a real Enter press', async ({ page }) => {
    await openLighthouse(page);
    await positionAtShipyard(page);

    const positioned = await lighthouseState(page);
    expect(positioned.player).toMatchObject(LIGHTHOUSE_SHIPYARD_POSITION);

    await page.locator('canvas[tabindex="0"]').focus();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('boat-upgrade-panel')).toBeVisible();
    await expectSelectedTier(page, 0, 'current');
  });

  test('opens from the required player tile with a real Space press', async ({ page }) => {
    await openLighthouse(page);
    await positionAtShipyard(page);

    await page.locator('canvas[tabindex="0"]').focus();
    await page.keyboard.press('Space');

    await expect(page.getByTestId('boat-upgrade-panel')).toBeVisible();
    await expectSelectedTier(page, 0, 'current');
  });

  test.describe('on a touch tablet', () => {
    test.use({ hasTouch: true });
    test('opens with real orange touch A at 1024x768 and closes with real touch B', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await openLighthouse(page);
      await positionAtShipyard(page);

      const action = page.locator('[data-key="Enter"]');
      await expect(action).toBeVisible();
      await expect(action).toHaveCSS('background-color', 'rgba(224, 127, 55, 0.62)');
      await dispatchTouchOn(page, action);

      await expect(page.getByTestId('boat-upgrade-panel')).toBeVisible();
      await expect(action).toBeHidden();
      const touchB = page.getByTestId('boat-close');
      await expect(touchB).toBeVisible();
      await expect(touchB).toHaveAttribute('data-key', 'q');
      await expect(touchB.locator('.pf-shipyard-close-badge')).toHaveText('B');
      await dispatchTouchOn(page, touchB);
      await expect(page.getByTestId('boat-upgrade-panel')).toBeHidden();
      await expect(page.locator('canvas')).toBeFocused();
    });
  });

  test('opens only on the actual visible station with mouse and touch', async ({ page }) => {
    await openLighthouse(page);
    const station = await shipyardStationGeometry(page);

    for (const key of ['x', 'y', 'width', 'height']) {
      expect(station.hitRect[key]).toBeCloseTo(station.visualRect[key], 4);
    }

    await page.mouse.click(station.blankPoint.x, station.blankPoint.y);
    await expect(page.getByTestId('boat-upgrade-panel')).toBeHidden();

    await page.mouse.click(station.visibleCenter.x, station.visibleCenter.y);
    await expect(page.getByTestId('boat-upgrade-panel')).toBeVisible();
    await page.getByTestId('boat-close').click();
    await expect(page.locator('canvas')).toBeFocused();

    await dispatchTouchAt(page, station.visibleCenter.x, station.visibleCenter.y);
    await expect(page.getByTestId('boat-upgrade-panel')).toBeVisible();
  });

  test('cycles through every tier with keyboard arrows and visible arrow buttons', async ({ page }) => {
    await openLighthouse(page, { points: 5000 });
    await openShipyardWithEnter(page);

    await page.keyboard.press('ArrowLeft');
    await expectSelectedTier(page, 4, 'prerequisite');
    await page.keyboard.press('ArrowRight');
    await expectSelectedTier(page, 0, 'current');

    const next = page.getByTestId('boat-next');
    const visited = [];
    for (let index = 0; index < 5; index += 1) {
      await next.click();
      visited.push(await selectedTier(page));
    }
    expect(visited).toEqual([1, 2, 3, 4, 0]);

    await page.getByTestId('boat-previous').click();
    await expectSelectedTier(page, 4, 'prerequisite');
  });

  test('locks tier 3 at 999 coins and enables it at the exact 1000-coin boundary', async ({ page }) => {
    await openLighthouse(page, { points: 999, boatTier: 2, language: 'en' });
    await openShipyardWithEnter(page);
    await page.keyboard.press('ArrowRight');

    await expectSelectedTier(page, 3, 'locked');
    await expect(page.getByTestId('boat-purchase')).toHaveText('Not enough coins');
    await expect(page.getByTestId('boat-purchase')).toBeDisabled();

    await page.evaluate(() => window.__playfood.setProgress({ points: 1000 }));
    await expectSelectedTier(page, 3, 'available');
    await expect(page.getByTestId('boat-purchase')).toBeEnabled();
  });

  test('requires tier 1 before buying tier 2, freezes movement, and marks it owned', async ({ page }) => {
    await openLighthouse(page, { points: 700, boatTier: 0, language: 'en' });
    await positionAtShipyard(page);
    const beforeOpening = (await lighthouseState(page)).player;

    await page.keyboard.press('Enter');
    await page.getByTestId('boat-next').click();
    await page.getByTestId('boat-next').click();
    await expectSelectedTier(page, 2, 'prerequisite');
    await expect(page.getByTestId('boat-purchase')).toHaveText('Buy the previous boat first');
    await expect(page.getByTestId('boat-purchase')).toBeDisabled();

    await page.locator('canvas[tabindex="0"]').focus();
    await page.keyboard.down('ArrowUp');
    await waitForAnimationFrames(page, 10);
    const whileHeld = (await lighthouseState(page)).player;
    await page.keyboard.up('ArrowUp');
    expect(whileHeld).toMatchObject({
      col: beforeOpening.col,
      row: beforeOpening.row,
      pixelX: beforeOpening.pixelX,
      pixelY: beforeOpening.pixelY,
      moving: false,
    });

    await page.getByTestId('boat-previous').click();
    await expectSelectedTier(page, 1, 'available');
    await page.getByTestId('boat-purchase').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await expect.poll(() => page.evaluate(() => {
      const state = window.__playfood.state();
      return { points: state.points, boatTier: state.boatTier, capacity: state.getBoatCapacity() };
    })).toEqual({ points: 550, boatTier: 1, capacity: 5 });

    await page.getByTestId('boat-next').click();
    await expectSelectedTier(page, 2, 'available');
    await page.getByTestId('boat-purchase').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await expect.poll(() => page.evaluate(() => {
      const state = window.__playfood.state();
      return {
        points: state.points,
        boatTier: state.boatTier,
        capacity: state.getBoatCapacity(),
      };
    })).toEqual({ points: 50, boatTier: 2, capacity: 8 });
    await expectSelectedTier(page, 2, 'current');

    await page.getByTestId('boat-previous').click();
    await expectSelectedTier(page, 1, 'inactive');
    await expect(page.getByTestId('boat-purchase')).toBeDisabled();

    await page.getByTestId('boat-close').click();
    await expect(page.getByTestId('boat-upgrade-panel')).toBeHidden();
    await expect(page.locator('canvas')).toBeFocused();
  });

  test('physical Q and Escape each close the modal and return canvas focus', async ({ page }) => {
    await openLighthouse(page);
    await openShipyardWithEnter(page);

    await page.keyboard.press('q');

    await expect(page.getByTestId('boat-upgrade-panel')).toBeHidden();
    await expect(page.locator('canvas')).toBeFocused();

    await openShipyardWithEnter(page);
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('boat-upgrade-panel')).toBeHidden();
    await expect(page.locator('canvas')).toBeFocused();
  });
});

test('previews, equips, fills, and persists the tier 4 Ocean Guardian', async ({ page }) => {
  await openLighthouse(page, { points: 3000, boatTier: 3, language: 'en' });
  await openShipyardWithEnter(page);
  await expectSelectedTier(page, 3, 'current');
  const ecoPreview = await getPreviewOpaqueBounds(page);

  await page.getByTestId('boat-next').click();
  await expectSelectedTier(page, 4, 'available');
  await expect(page.getByTestId('boat-preview')).toHaveAttribute(
    'aria-label',
    'Preview: Ocean Guardian',
  );
  await expect(page.getByText('Carries 18 litter items.')).toBeVisible();
  await expect(page.getByTestId('boat-purchase')).toHaveText('Buy it for 3000');
  const guardianPreview = await getPreviewOpaqueBounds(page);
  expect(guardianPreview.pixels).toBeGreaterThan(0);
  expect(guardianPreview.width).toBeGreaterThan(ecoPreview.width);
  expect(guardianPreview.height).toBeGreaterThan(ecoPreview.height);
  await captureScreenshot(page, 'shipyard-tier-4-guardian.png');

  const atlasMetrics = await getBoatAtlasMetrics(page);
  expect(atlasMetrics).toHaveLength(5);
  expect(atlasMetrics[4]).toHaveLength(4);
  for (let direction = 0; direction < 4; direction += 1) {
    expect(atlasMetrics[4][direction]).toHaveLength(2);
    for (let frame = 0; frame < 2; frame += 1) {
      expect(atlasMetrics[4][direction][frame]).toMatchObject({
        canvasHeight: 32,
        canvasWidth: 32,
      });
      expect(atlasMetrics[4][direction][frame].width).toBeGreaterThan(
        atlasMetrics[3][direction][frame].width,
      );
      expect(atlasMetrics[4][direction][frame].height).toBeGreaterThan(
        atlasMetrics[3][direction][frame].height,
      );
    }
    expect(atlasMetrics[4][direction][1]).not.toEqual(atlasMetrics[4][direction][0]);
  }

  await page.getByTestId('boat-purchase').click();
  await expectSelectedTier(page, 4, 'current');
  await expect.poll(() => page.evaluate(() => {
    const state = window.__playfood.state();
    return {
      boatTier: state.boatTier,
      capacity: state.getBoatCapacity(),
      points: state.points,
    };
  })).toEqual({ boatTier: 4, capacity: 18, points: 0 });

  await installCanvasTextRecorder(page);
  await page.getByTestId('boat-close').click();
  await expect(page.locator('canvas')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__playfood.screen() === 'hub');
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')?._stateRef?.current?.player));
  await waitForIrisOpen(page);
  await expect.poll(() => page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      boatTier: state.boatTier,
      trashCapacity: state.trashCapacity,
      trashCargo: state.trashCargo,
    };
  })).toEqual({ boatTier: 4, trashCapacity: 18, trashCargo: 0 });
  await expect.poll(() => page.evaluate(() => (
    window.__playfoodCanvasText.includes('🗑️ 0/18')
  ))).toBe(true);
  await captureScreenshot(page, 'world-map-tier-4-empty.png');

  for (let cargo = 1; cargo <= 18; cargo += 1) {
    await page.evaluate(() => {
      const state = document.querySelector('canvas')._stateRef.current;
      state.debris = [{
        bob: 0,
        driftAngle: 0,
        kind: 'bottle',
        tilt: 0,
        x: state.player.pixelX + 16,
        y: state.player.pixelY + 16,
      }];
    });
    await expect.poll(() => page.evaluate(() => (
      window.__playfood.state().trashCargo
    ))).toBe(cargo);
  }

  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    state.debris = [{
      bob: 0,
      driftAngle: 0,
      kind: 'can',
      tilt: 0,
      x: state.player.pixelX + 16,
      y: state.player.pixelY + 16,
    }];
  });
  await waitForAnimationFrames(page, 8);
  await expect.poll(() => page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      debrisAtBoat: state.debris.some((item) => (
        Math.hypot(
          item.x - (state.player.pixelX + 16),
          item.y - (state.player.pixelY + 16),
        ) < 32 * 1.2
      )),
      sharedCargo: window.__playfood.state().trashCargo,
      trashCargo: state.trashCargo,
    };
  })).toEqual({ debrisAtBoat: true, sharedCargo: 18, trashCargo: 18 });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__playfood));
  await expect.poll(() => page.evaluate(() => {
    const state = window.__playfood.state();
    return {
      boatTier: state.boatTier,
      capacity: state.getBoatCapacity(),
      trashCargo: state.trashCargo,
    };
  })).toEqual({ boatTier: 4, capacity: 18, trashCargo: 18 });
  await page.evaluate(() => window.__playfood.goToScreen('hub'));
  await page.waitForFunction(() => window.__playfood.screen() === 'hub');
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')?._stateRef?.current));
  await expect.poll(() => page.evaluate(() => {
    const state = window.__playfood.state();
    const world = document.querySelector('canvas')._stateRef.current;
    return {
      boatTier: state.boatTier,
      capacity: state.getBoatCapacity(),
      sharedCargo: state.trashCargo,
      trashCapacity: world.trashCapacity,
      trashCargo: world.trashCargo,
    };
  })).toEqual({
    boatTier: 4,
    capacity: 18,
    sharedCargo: 18,
    trashCapacity: 18,
    trashCargo: 18,
  });
});

test('uses tier 2 on the World Map, recycles one item early, and persists the purchase', async ({ page }) => {
  await buyTierTwoSequentially(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('canvas')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__playfood.screen() === 'hub');
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')?._stateRef?.current?.player));

  await expect.poll(() => page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      boatTier: state.boatTier,
      trashCapacity: state.trashCapacity,
      trashCargo: state.trashCargo,
    };
  })).toEqual({ boatTier: 2, trashCapacity: 8, trashCargo: 0 });

  await waitForIrisOpen(page);
  const collectionSetup = await positionForExistingDebrisCollection(page);
  expect(collectionSetup.initialDebrisCount).toBeGreaterThan(0);
  expect(collectionSetup.nearestOtherDistance).toBeGreaterThanOrEqual(32 * 4);
  await page.locator('canvas').focus();
  await page.keyboard.down(collectionSetup.direction);
  try {
    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')._stateRef.current.trashCargo
    ))).toBe(1);
  } finally {
    await page.keyboard.up(collectionSetup.direction);
  }
  const collectedState = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      col: state.player.col,
      row: state.player.row,
      recyclingArrowVisible: state.recyclingArrowVisible,
    };
  });
  expect(
    collectedState.col !== collectionSetup.startCol
      || collectedState.row !== collectionSetup.startRow,
    'real directional input must move the boat into the existing debris collision',
  ).toBe(true);
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.recyclingArrowVisible
  ))).toBe(true);

  await positionForRecyclingDockApproach(page);
  await page.locator('canvas').focus();
  await page.keyboard.down('ArrowDown');
  try {
    await expect.poll(() => page.evaluate(() => {
      const state = document.querySelector('canvas')._stateRef.current;
      return {
        col: state.player.col,
        row: state.player.row,
        pixelX: state.player.pixelX,
        pixelY: state.player.pixelY,
        moving: state.player.moving,
        nearDock: state.nearDock,
        nearRecyclingDock: state.nearRecyclingDock,
      };
    })).toEqual({
      col: 28,
      row: 34,
      pixelX: 28 * 32,
      pixelY: 34 * 32,
      moving: false,
      nearDock: 'recycling',
      nearRecyclingDock: true,
    });
  } finally {
    await page.keyboard.up('ArrowDown');
  }
  await expect.poll(() => page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return { nearDock: state.nearDock, nearRecyclingDock: state.nearRecyclingDock };
  })).toEqual({ nearDock: 'recycling', nearRecyclingDock: true });
  await page.locator('canvas').focus();
  await page.keyboard.press('Enter');

  await expect.poll(() => page.evaluate(() => {
    const state = window.__playfood.state();
    const world = document.querySelector('canvas')._stateRef.current;
    return {
      points: state.points,
      recycleTrips: state.recycleTrips,
      totalRecycled: state.totalRecycled,
      trashCargo: world.trashCargo,
    };
  })).toEqual({ points: 55, recycleTrips: 1, totalRecycled: 1, trashCargo: 0 });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__playfood));
  await expect.poll(() => page.evaluate(() => {
    const state = window.__playfood.state();
    return {
      points: state.points,
      boatTier: state.boatTier,
      capacity: state.getBoatCapacity(),
    };
  })).toEqual({ points: 55, boatTier: 2, capacity: 8 });
});

test('restores fixed legacy codes and a nine-word schema-v4 tier 4 code', async ({ page }) => {
  await page.goto('/?testMode=1&lang=en');
  await page.waitForFunction(() => Boolean(window.__playfood));

  const v2 = await page.evaluate(async (code) => {
    const { decodeProgress } = await import('/src/utils/playCode.js');
    const decoded = decodeProgress(code);
    window.__playfood.state().restoreProgress(decoded);
    const restored = window.__playfood.state();
    return {
      version: decoded.v,
      decodedTier: decoded.boatTier,
      storedTier: restored.boatTier,
      capacity: restored.getBoatCapacity(),
    };
  }, VERSION_2_SAMPLE_CODE);
  expect(v2).toEqual({ version: 2, decodedTier: 1, storedTier: 1, capacity: 5 });

  const v3 = await page.evaluate(async (code) => {
    const { decodeProgress } = await import('/src/utils/playCode.js');
    const decoded = decodeProgress(code);
    window.__playfood.state().restoreProgress(decoded);
    const restored = window.__playfood.state();
    return {
      version: decoded.v,
      recycleTrips: decoded.recycleTrips,
      decodedTier: decoded.boatTier,
      storedTier: restored.boatTier,
      capacity: restored.getBoatCapacity(),
    };
  }, VERSION_3_SAMPLE_CODE);
  expect(v3).toEqual({
    version: 3,
    recycleTrips: 200,
    decodedTier: 3,
    storedTier: 3,
    capacity: 12,
  });

  const v4 = await page.evaluate(async () => {
    const { encodeProgress, decodeProgress } = await import('/src/utils/playCode.js');
    const source = {
      ...window.__playfood.state(),
      language: 'pt',
      completedMissions: { growing: [], local: [], foodwaste: [], circular: [] },
      boatTier: 4,
      recycleTrips: 999,
      points: 1234,
    };
    const code = encodeProgress(source);
    const decoded = decodeProgress(code);
    window.__playfood.state().restoreProgress(decoded);
    const restored = window.__playfood.state();
    const words = code.split('-');
    return {
      code,
      wordCount: words.length,
      cvcvWords: words.every((word) => (
        /^[bdfghjklmnrstvwz][aeio][bdfghjklmnrstvwz][aeio]$/.test(word)
      )),
      version: decoded.v,
      recycleTrips: decoded.recycleTrips,
      decodedTier: decoded.boatTier,
      storedTier: restored.boatTier,
      capacity: restored.getBoatCapacity(),
    };
  });
  expect(v4).toMatchObject({
    wordCount: 9,
    cvcvWords: true,
    version: 4,
    recycleTrips: 127,
    decodedTier: 4,
    storedTier: 4,
    capacity: 18,
  });
});

for (const [language, title] of [
  ['en', 'Shipyard'],
  ['el', 'Ναυπηγείο'],
  ['nl', 'Scheepswerf'],
  ['pt', 'Estaleiro'],
]) {
  test(`renders the real ${language} shipyard title`, async ({ page }) => {
    await openLighthouse(page, { language });
    await openShipyardWithEnter(page);
    await expect(page.getByRole('dialog', { name: title })).toBeVisible();
  });
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 800, height: 600 },
]) {
  test(`contains the panel and preserves integer pixel scale at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLighthouse(page, { points: 1000 });
    await openShipyardWithEnter(page);

    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('canvas').getBoundingClientRect();
      const panel = document.querySelector('[data-testid="boat-upgrade-panel"]').getBoundingClientRect();
      const previousButton = document.querySelector('[data-testid="boat-previous"]').getBoundingClientRect();
      const nextButton = document.querySelector('[data-testid="boat-next"]').getBoundingClientRect();
      const purchaseButton = document.querySelector('[data-testid="boat-purchase"]').getBoundingClientRect();
      const closeButton = document.querySelector('[data-testid="boat-close"]').getBoundingClientRect();
      const preview = document.querySelector('[data-testid="boat-preview"]');
      return {
        canvas: {
          left: canvas.left,
          right: canvas.right,
          top: canvas.top,
          bottom: canvas.bottom,
        },
        panel: {
          left: panel.left,
          right: panel.right,
          top: panel.top,
          bottom: panel.bottom,
        },
        previousButton: { width: previousButton.width },
        nextButton: { width: nextButton.width },
        purchaseButton: { height: purchaseButton.height },
        closeButton: { width: closeButton.width, height: closeButton.height },
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pixelScale: Number(preview.dataset.pixelScale),
        previewCssWidth: preview.getBoundingClientRect().width,
        previewCssHeight: preview.getBoundingClientRect().height,
      };
    });

    expect(geometry.panel.left).toBeGreaterThanOrEqual(geometry.canvas.left + 16);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.canvas.right - 16);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.canvas.top + 16);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.canvas.bottom - 16);
    expect(geometry.previousButton.width).toBeGreaterThanOrEqual(56);
    expect(geometry.nextButton.width).toBeGreaterThanOrEqual(56);
    expect(geometry.purchaseButton.height).toBeGreaterThanOrEqual(52);
    expect(geometry.closeButton.width).toBeGreaterThanOrEqual(56);
    expect(geometry.closeButton.height).toBeGreaterThanOrEqual(56);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(Number.isInteger(geometry.pixelScale)).toBe(true);
    expect(geometry.pixelScale).toBeGreaterThan(0);
    expect(geometry.previewCssWidth / 32).toBe(geometry.pixelScale);
    expect(geometry.previewCssHeight / 32).toBe(geometry.pixelScale);
  });
}

test('captures the approved visual evidence for station, tiers, locales, tablet, and World Map', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openLighthouse(page, { points: 999, boatTier: 0, language: 'el' });
  await positionAtShipyard(page);
  await waitForIrisOpen(page);
  await captureScreenshot(page, 'lighthouse-shipyard-station.png');

  await page.locator('canvas').focus();
  await page.keyboard.press('Enter');
  await expectSelectedTier(page, 0, 'current');
  await captureScreenshot(page, 'shipyard-tier-0.png');

  await page.getByTestId('boat-next').click();
  await expectSelectedTier(page, 1, 'available');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('boat-purchase')).toBeFocused();
  await captureScreenshot(page, 'shipyard-tier-1.png');
  await page.getByTestId('boat-purchase').click();
  await expectSelectedTier(page, 1, 'current');

  await page.getByTestId('boat-next').click();
  await expectSelectedTier(page, 2, 'available');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('boat-purchase')).toBeFocused();
  await captureScreenshot(page, 'shipyard-tier-2.png');
  await page.getByTestId('boat-purchase').click();
  await expectSelectedTier(page, 2, 'current');

  await page.getByTestId('boat-next').click();
  await expectSelectedTier(page, 3, 'locked');
  await expect(page.getByTestId('boat-purchase')).toBeDisabled();
  await captureScreenshot(page, 'shipyard-tier-3.png');

  await page.getByTestId('boat-next').click();
  await expectSelectedTier(page, 4, 'prerequisite');
  await expect(page.getByTestId('boat-purchase')).toBeDisabled();
  await captureScreenshot(page, 'shipyard-tier-4-prerequisite.png');

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByTestId('boat-previous').click();
  await expectSelectedTier(page, 3, 'locked');
  await expectShipyardTextFits(page);
  await captureScreenshot(page, 'shipyard-tablet-1024x768.png');

  for (const [language, title] of [
    ['el', 'Ναυπηγείο'],
    ['nl', 'Scheepswerf'],
    ['pt', 'Estaleiro'],
    ['en', 'Shipyard'],
  ]) {
    await page.evaluate((nextLanguage) => window.__playfood.setLanguage(nextLanguage), language);
    await expect(page.getByRole('dialog', { name: title })).toBeVisible();
    await expectSelectedTier(page, 3, 'locked');
    await expectShipyardTextFits(page);
    await captureScreenshot(page, `shipyard-locale-${language}.png`);
  }

  await page.getByTestId('boat-previous').click();
  await expectSelectedTier(page, 2, 'current');
  await page.getByTestId('boat-close').click();
  await expect(page.locator('canvas')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__playfood.screen() === 'hub');
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')?._stateRef?.current?.player));
  await waitForIrisOpen(page);
  await expect.poll(() => page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      boatTier: state.boatTier,
      trashCapacity: state.trashCapacity,
      trashCargo: state.trashCargo,
    };
  })).toEqual({ boatTier: 2, trashCapacity: 8, trashCargo: 0 });
  await captureScreenshot(page, 'world-map-tier-2.png');
});
