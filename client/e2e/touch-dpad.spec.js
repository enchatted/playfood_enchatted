import { test, expect } from '@playwright/test';
import { bootMission, touchHold } from './helpers.js';
import { stepGardenPlanner } from './drivers/garden-planner-driver.js';

/**
 * Touch d-pad (components/TouchDpad.jsx) — tablet/whiteboard e2e coverage.
 *
 * Runs ONLY under the `tablet-touch` Playwright project (testMatch in
 * playwright.config.js), a 1024×768 viewport WITHOUT `hasTouch` set (see the
 * comment on that project in playwright.config.js — `hasTouch: true` flips
 * CSS `(pointer: coarse)` to true in this Chromium build, which would corrupt
 * this exact scenario). Compact landscape layouts such as 1024×768 clear the
 * size gate immediately. On larger fine-pointer displays, a REAL touch event
 * (dispatched via CDP — see `touchHold` in helpers.js) supplies the independent
 * sticky `touchSeen` signal. The `coarsePointer` path is covered by unit tests.
 *
 * We boot straight into the WhereDoesItGrow mission (growing:1) — a `game`
 * screen where movement and Action controls are relevant, but Drop is not.
 * The room is open grass with only 4 blocked bed tiles
 * far from spawn (col 9, row 7), so ArrowRight is freely walkable.
 */

// A quick tap (CDP touchStart→touchEnd, no hold) at an arbitrary point. Used
// for "touch evidence" — the app's window-level touchstart listener only
// cares that a real touch landed somewhere, not what it hit.
async function tapPoint(page, x, y) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// A tap in the top-left corner of the viewport: clear of the d-pad (bottom-left),
// the action/back/drop buttons (bottom-right), and anything the game itself
// listens for (the game rooms only bind keyboard listeners, see
// useGameRoomCanvas.js) — so this is a "neutral" touch, evidence-only.
async function tapNeutralCorner(page) {
  await tapPoint(page, 40, 40);
}

async function readPlayerPosition(page) {
  return page.evaluate(() => {
    const player = document.querySelector('canvas')._stateRef.current.player;
    return { col: player.col, row: player.row, pixelX: player.pixelX, pixelY: player.pixelY };
  });
}

async function waitForAnimationFrames(page, frameCount = 8) {
  await page.evaluate((count) => new Promise((resolve) => {
    let framesLeft = count;
    const next = () => {
      framesLeft -= 1;
      if (framesLeft === 0) resolve();
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }), frameCount);
}

async function canvasRectCenterInViewport(page, stateRectKey) {
  return page.evaluate((key) => {
    const canvas = document.querySelector('canvas');
    const stateRect = canvas?._stateRef?.current?.[key];
    if (!canvas || !stateRect) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const logicalWidth = stateRect.width ?? stateRect.w;
    const logicalHeight = stateRect.height ?? stateRect.h;
    const logicalX = stateRect.x + logicalWidth / 2;
    const logicalY = stateRect.y + logicalHeight / 2;
    const hidpi = canvas.__hidpi;

    if (!hidpi) {
      return {
        x: canvasRect.left + (logicalX / canvas.width) * canvasRect.width,
        y: canvasRect.top + (logicalY / canvas.height) * canvasRect.height,
      };
    }

    const bufferPixelsPerCssPixel = canvas.width / canvasRect.width;
    return {
      x: canvasRect.left + (logicalX * hidpi.k + hidpi.ox) / bufferPixelsPerCssPixel,
      y: canvasRect.top + (logicalY * hidpi.k + hidpi.oy) / bufferPixelsPerCssPixel,
    };
  }, stateRectKey);
}

async function canvasStateRectInViewport(page, stateRectKey) {
  return page.evaluate((key) => {
    const canvas = document.querySelector('canvas');
    const stateRect = canvas?._stateRef?.current?.[key];
    const hidpi = canvas?.__hidpi;
    if (!canvas || !stateRect || !hidpi) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const bufferPixelsPerCssPixel = canvas.width / canvasRect.width;
    return {
      x: canvasRect.left + (stateRect.x * hidpi.k + hidpi.ox) / bufferPixelsPerCssPixel,
      y: canvasRect.top + (stateRect.y * hidpi.k + hidpi.oy) / bufferPixelsPerCssPixel,
      width: (stateRect.width * hidpi.k) / bufferPixelsPerCssPixel,
      height: (stateRect.height * hidpi.k) / bufferPixelsPerCssPixel,
    };
  }, stateRectKey);
}

function overlapArea(a, b) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

const DPAD_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

async function readControlBoxes(page) {
  const entries = await Promise.all(
    [...DPAD_KEYS, 'Enter', 'q'].map(async (key) => [
      key,
      await page.locator(`[data-key="${key}"]`).boundingBox(),
    ]),
  );
  return Object.fromEntries(entries);
}

function expectControlsInsideViewport(
  boxes,
  viewport,
  { dpadSize = 64, secondarySize = 56, actionSize = 80 } = {},
) {
  for (const [key, box] of Object.entries(boxes)) {
    expect(box, `${key} must have a visible touch target`).not.toBeNull();
    expect(box.x, `${key} must stay inside the left edge`).toBeGreaterThanOrEqual(0);
    expect(box.y, `${key} must stay inside the top edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${key} must stay inside the right edge`).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height, `${key} must stay inside the bottom edge`).toBeLessThanOrEqual(viewport.height);
  }

  for (const key of DPAD_KEYS) {
    expect(boxes[key].width).toBeCloseTo(dpadSize, 1);
    expect(boxes[key].height).toBeCloseTo(dpadSize, 1);
  }
  expect(boxes.q.width).toBeCloseTo(secondarySize, 1);
  expect(boxes.q.height).toBeCloseTo(secondarySize, 1);
  expect(boxes.Enter.width).toBeCloseTo(actionSize, 1);
  expect(boxes.Enter.height).toBeCloseTo(actionSize, 1);
}

async function expectControlsInsideCanvas(page, minimumInset = 8) {
  const canvasBox = await page.locator('canvas').boundingBox();
  expect(canvasBox, 'active canvas must be measurable').not.toBeNull();

  const boxes = await readControlBoxes(page);
  for (const [key, box] of Object.entries(boxes)) {
    expect(box, `${key} must have a visible control`).not.toBeNull();
    expect(box.x, `${key} must stay inside the canvas left edge`)
      .toBeGreaterThanOrEqual(canvasBox.x + minimumInset);
    expect(box.y, `${key} must stay inside the canvas top edge`)
      .toBeGreaterThanOrEqual(canvasBox.y + minimumInset);
    expect(box.x + box.width, `${key} must stay inside the canvas right edge`)
      .toBeLessThanOrEqual(canvasBox.x + canvasBox.width - minimumInset);
    expect(box.y + box.height, `${key} must stay inside the canvas bottom edge`)
      .toBeLessThanOrEqual(canvasBox.y + canvasBox.height - minimumInset);
  }
}

async function driveGardenPlannerWithTouch(page) {
  const startedAt = Date.now();
  for (let step = 0; step < 800; step += 1) {
    if (Date.now() - startedAt > 165_000) {
      throw new Error(`touch driver timed out after ${step} steps`);
    }

    const action = await page.evaluate(stepGardenPlanner);
    if (action.act === 'done') return action.nav;
    if (action.act === 'enter') {
      await touchHold(page, page.locator('[data-key="Enter"]'), 150);
    } else if (action.act === 'hold') {
      await touchHold(page, page.locator('[data-key="Enter"]'), action.ms);
    } else {
      await page.waitForTimeout(action.ms || 100);
    }
  }
  throw new Error('touch driver exceeded 800 steps');
}

test.describe('Touch d-pad — device gate + input plumbing', () => {
  test('a) shows the d-pad immediately on a compact landscape layout', async ({ page }) => {
    await bootMission(page, 'growing', 1);

    for (const key of [...DPAD_KEYS, 'Enter']) {
      await expect(page.locator(`[data-key="${key}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-key="q"]')).not.toBeVisible();
    // Games already expose Pause and Exit in their own header. A second
    // Escape control in the touch overlay would be a dead/ambiguous button.
    await expect(page.locator('[data-key="Escape"]')).not.toBeVisible();
  });

  test('a2) shows Drop only in a mission that implements Q', async ({ page }) => {
    await bootMission(page, 'growing', 2);
    await expect(page.locator('[data-key="q"]')).toBeVisible();
  });

  test('a3) B drops the carried resource in Circular City', async ({ page }) => {
    await bootMission(page, 'circular', 2);
    await page.waitForTimeout(650);
    await touchHold(page, page.locator('[data-key="Enter"]'), 150);
    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')?._stateRef?.current?.showMissionIntro
    ))).toBe(false);

    await page.evaluate(() => {
      const state = document.querySelector('canvas')._stateRef.current;
      state.carrying = state.resources[0].id;
      state.qWasDown = false;
    });

    const drop = page.locator('[data-key="q"]');
    await expect(drop).toBeVisible();
    await touchHold(page, drop, 150);
    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')?._stateRef?.current?.carrying
    ))).toBeNull();
  });

  test('b) holding ArrowRight on the d-pad moves the avatar', async ({ page }) => {
    await bootMission(page, 'growing', 1);
    await tapNeutralCorner(page);
    await expect(page.locator('[data-key="ArrowRight"]')).toBeVisible();

    // Dismiss the mission intro card first (it blocks movement) via a touch hold
    // on the Enter button — proves the synthetic key reaches the game too.
    await touchHold(page, page.locator('[data-key="Enter"]'), 150);
    await expect.poll(() => page.evaluate(() => {
      const cv = document.querySelector('canvas');
      return cv._stateRef.current.showMissionIntro;
    })).toBe(false);

    // Movement is blocked while the iris-wipe plays (irisOpenness < 1) — wait it out.
    await expect.poll(() => page.evaluate(() => {
      const st = document.querySelector('canvas')?._stateRef?.current;
      return st ? st.irisOpenness : 0;
    })).toBeGreaterThanOrEqual(1);

    const startCol = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.player.col);

    // Movement is tile-stepped at 0.15s/tile — 400ms clears at least one tile
    // with margin for RAF timing jitter.
    await touchHold(page, page.locator('[data-key="ArrowRight"]'), 400);

    await expect.poll(() => page.evaluate(() => document.querySelector('canvas')._stateRef.current.player.col))
      .toBeGreaterThan(startCol);
  });

  test('b2) holding ArrowRight with a mouse also moves the avatar', async ({ page }) => {
    await bootMission(page, 'growing', 1);
    await page.waitForTimeout(650);
    await page.keyboard.down('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.up('Enter');

    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')?._stateRef?.current?.showMissionIntro
    ))).toBe(false);
    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')?._stateRef?.current?.irisOpenness || 0
    ))).toBeGreaterThanOrEqual(1);

    const startCol = await page.evaluate(() => (
      document.querySelector('canvas')._stateRef.current.player.col
    ));
    const right = page.locator('[data-key="ArrowRight"]');
    await right.hover();
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.up();

    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')._stateRef.current.player.col
    ))).toBeGreaterThan(startCol);
  });

  test('c) tapping the action button dismisses the mission intro card', async ({ page }) => {
    await bootMission(page, 'growing', 1);

    expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro)).toBe(true);

    await tapNeutralCorner(page);
    await expect(page.locator('[data-key="Enter"]')).toBeVisible();

    await touchHold(page, page.locator('[data-key="Enter"]'), 150);

    await expect.poll(() => page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro))
      .toBe(false);
  });

  test('d) landscape phone uses in-canvas controls and portrait requests rotation', async ({ page }) => {
    await bootMission(page, 'growing', 2);

    // Phone targets remain inside the existing canvas; no extra control strip.
    await page.setViewportSize({ width: 844, height: 390 });
    await tapNeutralCorner(page);
    await expect(page.locator('[data-key="ArrowUp"]')).toBeVisible();
    await expectControlsInsideCanvas(page);
    const up = await page.locator('[data-key="ArrowUp"]').boundingBox();
    expect(up.width).toBe(44);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('rotate-device')).toBeVisible();
    await expect(page.locator('[data-key="ArrowUp"]')).not.toBeVisible();

    // Restore a tablet-sized viewport — the gate re-evaluates on resize, and
    // touchSeen is already sticky-true from the tap above.
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('[data-key="ArrowUp"]')).toBeVisible();
  });

  test('d2) large non-touch monitor shows controls before any touch', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await bootMission(page, 'growing', 1);
    await expect(page.locator('[data-key="ArrowUp"]')).toBeVisible();

    await tapNeutralCorner(page);
    await expect(page.locator('[data-key="ArrowUp"]')).toBeVisible();
  });

  test('e) shows Back only on screens where Escape has a real navigation action', async ({ page }) => {
    await page.goto('/?testMode=1&lang=el');
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => window.__playfood.goToScreen('hub'));
    await page.waitForFunction(() => window.__playfood.screen() === 'hub');

    await tapNeutralCorner(page);

    await expect(page.locator('[data-key="Escape"]')).toBeVisible();
  });

  test('f) B drops the carried seed in Garden Planner', async ({ page }) => {
    await bootMission(page, 'growing', 2);
    await tapNeutralCorner(page);

    // The intro deliberately ignores confirmation during its short entrance
    // lock. Wait for that child-facing guard before exercising gameplay input.
    await page.waitForTimeout(650);
    await touchHold(page, page.locator('[data-key="Enter"]'), 150);
    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')?._stateRef?.current?.showMissionIntro
    ))).toBe(false);
    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')?._stateRef?.current?.irisOpenness || 0
    ))).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => {
      const state = document.querySelector('canvas')._stateRef.current;
      state.carrying = { seed: { id: 'cabbage', emoji: '🥬', validSeasons: ['winter'] } };
      state.qWasDown = false;
    });

    await touchHold(page, page.locator('[data-key="q"]'), 150);

    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')._stateRef.current.carrying
    ))).toBeNull();
  });

  test('f2) mouse click on B drops the carried seed', async ({ page }) => {
    await bootMission(page, 'growing', 2);
    await page.waitForTimeout(650);
    await page.keyboard.down('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.up('Enter');
    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')?._stateRef?.current?.showMissionIntro
    ))).toBe(false);

    await page.evaluate(() => {
      const state = document.querySelector('canvas')._stateRef.current;
      state.carrying = { seed: { id: 'cabbage', emoji: '🥬', validSeasons: ['winter'] } };
      state.qWasDown = false;
    });

    await page.locator('[data-key="q"]').click();
    await expect.poll(() => (
      page.evaluate(() => document.querySelector('canvas')._stateRef.current.carrying)
    )).toBeNull();
  });

  test('g) completes the full 1.2 plant, water and harvest cycle using touch A', async ({ page }) => {
    await bootMission(page, 'growing', 2);
    await tapNeutralCorner(page);
    await expect(page.locator('[data-key="Enter"]')).toBeVisible();

    const nav = await driveGardenPlannerWithTouch(page);

    expect(await page.evaluate(() => window.__playfood.screen())).toBe('result');
    expect(nav.passed).toBe(true);
    expect(nav.healthyHarvests).toBe(8);
  });

  test('h) keeps accessible controls inside tablet and touch-monitor viewports', async ({ page }) => {
    await bootMission(page, 'growing', 2);
    await tapNeutralCorner(page);

    const tabletViewport = { width: 1024, height: 768 };
    expectControlsInsideViewport(await readControlBoxes(page), tabletViewport, {
      dpadSize: 52,
      secondarySize: 52,
      actionSize: 68,
    });

    const monitorViewport = { width: 1920, height: 1080 };
    await page.setViewportSize(monitorViewport);
    await expect.poll(async () => (
      (await page.locator('[data-key="ArrowUp"]').boundingBox())?.width
    )).toBeCloseTo(64, 1);
    expectControlsInsideViewport(await readControlBoxes(page), monitorViewport);
  });

  test('i) opens the Garden Planner intro source with a finger tap', async ({ page }) => {
    await bootMission(page, 'growing', 2);
    await page.waitForFunction(() => (
      !!document.querySelector('canvas')?._stateRef?.current?.introSourceRect
    ));

    const sourceCenter = await canvasRectCenterInViewport(page, 'introSourceRect');
    expect(sourceCenter).not.toBeNull();

    const popupPromise = page.waitForEvent('popup');
    await tapPoint(page, sourceCenter.x, sourceCenter.y);
    const sourcePage = await popupPromise;
    await sourcePage.waitForLoadState('domcontentloaded');

    expect(sourcePage.url()).toContain('/source.html?src=heirloom-seeds');
    await sourcePage.close();
  });

  test('j) overlays controls inside the game canvas without a separate shelf', async ({ page }) => {
    await bootMission(page, 'growing', 2, 'el');

    await expect(page.locator('[data-testid="tablet-control-shelf"]')).toHaveCount(0);
    await expectControlsInsideCanvas(page);
  });

  test('k) portrait tablet asks for landscape and hides gameplay controls', async ({ page }) => {
    await bootMission(page, 'growing', 1, 'el');
    await touchHold(page, page.locator('[data-key="Enter"]'), 150);
    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')?._stateRef?.current?.showMissionIntro
    ))).toBe(false);
    await expect.poll(() => page.evaluate(() => (
      document.querySelector('canvas')?._stateRef?.current?.irisOpenness || 0
    ))).toBeGreaterThanOrEqual(1);

    const landscapeStart = await readPlayerPosition(page);
    let physicalDHeld = false;
    try {
      await page.keyboard.down('d');
      physicalDHeld = true;
      await expect.poll(() => readPlayerPosition(page)).not.toEqual(landscapeStart);

      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(page.getByTestId('rotate-device')).toBeVisible();
      await expect(page.locator('[data-key="ArrowUp"]')).not.toBeVisible();
      await expect(page.locator('[data-key="Enter"]')).not.toBeVisible();
      const content = page.getByTestId('active-canvas-content');
      await expect(content).toHaveAttribute('aria-hidden', 'true');
      await expect(content).toHaveAttribute('inert', '');
      await expect.poll(() => page.evaluate(() => (
        document.querySelector('canvas')._stateRef.current.player.moving
      ))).toBe(false);

      const settledPortraitPosition = await readPlayerPosition(page);
      await waitForAnimationFrames(page, 12);
      expect(await readPlayerPosition(page)).toEqual(settledPortraitPosition);

      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(page.getByTestId('rotate-device')).toBeHidden();
      await expect(page.locator('[data-key="ArrowUp"]')).toBeVisible();
      await expect(page.locator('[data-key="Enter"]')).toBeVisible();
      await expect(content).not.toHaveAttribute('aria-hidden', 'true');
      await expect(content).not.toHaveAttribute('inert', '');
      await waitForAnimationFrames(page, 8);
      expect(await readPlayerPosition(page)).toEqual(settledPortraitPosition);

      await page.keyboard.up('d');
      physicalDHeld = false;
      const releasedPosition = await readPlayerPosition(page);
      await page.keyboard.down('d');
      physicalDHeld = true;
      await expect.poll(() => readPlayerPosition(page)).not.toEqual(releasedPosition);
    } finally {
      if (physicalDHeld) await page.keyboard.up('d');
    }
  });

  test('k2) portrait releases non-Latin physical KeyQ before gameplay resumes', async ({ page }) => {
    await bootMission(page, 'growing', 2, 'el');
    await page.waitForFunction(() => Boolean(
      document.querySelector('canvas')?._stateRef?.current?.showMissionIntro,
    ));

    await page.evaluate(() => {
      const state = document.querySelector('canvas')._stateRef.current;
      state.carrying = { seed: { id: 'cabbage', emoji: '🥬', validSeasons: ['winter'] } };
      state.qWasDown = false;
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'θ',
        code: 'KeyQ',
        bubbles: true,
        cancelable: true,
      }));
    });

    try {
      const sharedRotateOverlay = page.getByTestId('active-canvas-stage')
        .locator(':scope > [data-testid="rotate-device"]');
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(sharedRotateOverlay).toBeVisible();
      await expect(page.getByTestId('rotate-device')).toHaveCount(1);
      expect(await page.evaluate(() => (
        document.querySelector('canvas')._stateRef.current.carrying?.seed?.id
      ))).toBe('cabbage');

      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(sharedRotateOverlay).toBeHidden();
      await page.evaluate(() => {
        const state = document.querySelector('canvas')._stateRef.current;
        state.showMissionIntro = false;
        state.irisOpenness = 1;
      });
      await waitForAnimationFrames(page, 12);

      expect(await page.evaluate(() => (
        document.querySelector('canvas')._stateRef.current.carrying?.seed?.id
      ))).toBe('cabbage');
    } finally {
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'θ',
          code: 'KeyQ',
          bubbles: true,
          cancelable: true,
        }));
      });
    }
  });

  test('l) keeps the compact tablet header readable in all four languages', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });

    for (const lang of ['en', 'el', 'nl', 'pt']) {
      await bootMission(page, 'growing', 2, lang);

      const header = await page.evaluate(() => {
        const wrapper = document.querySelector('canvas')?.parentElement?.parentElement;
        const bar = [...wrapper.children].find((el) => (
          el.querySelector('button') && getComputedStyle(el).position === 'absolute'
        ));
        const barRect = bar.getBoundingClientRect();
        const starRect = [...bar.children]
          .find((el) => (el.textContent || '').includes('★'))
          ?.getBoundingClientRect();
        const controls = [...bar.querySelectorAll('button')].map((button) => {
          const rect = button.getBoundingClientRect();
          const overlapsStars = starRect
            ? rect.left < starRect.right && rect.right > starRect.left
              && rect.top < starRect.bottom && rect.bottom > starRect.top
            : false;
          return {
            text: button.textContent.trim(),
            inside: rect.left >= barRect.left && rect.right <= barRect.right
              && rect.top >= barRect.top && rect.bottom <= barRect.bottom,
            overlapsStars,
          };
        });

        return {
          overflow: bar.scrollWidth > bar.clientWidth,
          controls,
        };
      });

      expect(header.overflow, `${lang}: header must not overflow`).toBe(false);
      for (const control of header.controls) {
        expect(control.inside, `${lang}: ${control.text} must stay inside the header`).toBe(true);
        expect(control.overlapsStars, `${lang}: ${control.text} must not cover the stars`).toBe(false);
      }
    }
  });

  test('m) keeps controls in-game on a 16:10 compact landscape layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await bootMission(page, 'growing', 2, 'el');

    await expect(page.getByTestId('touch-controls-surface')).toHaveAttribute(
      'data-viewport-profile',
      'compact-landscape',
    );
    await expect(page.locator('[data-testid="tablet-control-shelf"]')).toHaveCount(0);
    await expectControlsInsideCanvas(page);
  });

  test('n) keeps translucent surfaces while icons remain fully legible', async ({ page }) => {
    await bootMission(page, 'growing', 1);

    const appearance = await page.locator('[data-key="ArrowUp"]').evaluate((button) => {
      const style = getComputedStyle(button);
      const match = style.backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
      return {
        opacity: Number(style.opacity),
        backgroundAlpha: match.length === 4 ? match[3] : 1,
        color: style.color,
      };
    });

    expect(appearance.opacity).toBe(1);
    expect(appearance.backgroundAlpha).toBeGreaterThanOrEqual(0.45);
    expect(appearance.backgroundAlpha).toBeLessThanOrEqual(0.7);
    expect(appearance.color).toBe('rgb(255, 255, 255)');
  });

  test('o) does not cover Season Matcher source access', async ({ page }) => {
    await bootMission(page, 'local', 1, 'el');
    await touchHold(page, page.locator('[data-key="Enter"]'), 150);
    const source = page.getByTestId('season-matcher-source');
    await expect(source).toBeVisible();
    const sourceRect = await source.boundingBox();

    const controls = await Promise.all(DPAD_KEYS.map((key) => (
      page.locator(`[data-key="${key}"]`).boundingBox()
    )));
    for (const [index, controlRect] of controls.entries()) {
      expect(
        overlapArea(sourceRect, controlRect),
        `source access must not overlap ${DPAD_KEYS[index]}`,
      ).toBe(0);
    }
  });

  test('o2) instructions block movement while touch A remains available to start', async ({ page }) => {
    await bootMission(page, 'local', 1, 'el');
    const initialPosition = await readPlayerPosition(page);
    await touchHold(page, page.locator('[data-key="ArrowRight"]'), 400);
    expect(await readPlayerPosition(page)).toEqual(initialPosition);

    const action = page.locator('[data-key="Enter"]');
    await expect(action).toBeVisible();
    await touchHold(page, action, 150);
    await expect(page.getByTestId('season-matcher-source')).toBeVisible();
  });

  test('p) does not cover the Meal Planner undo hint', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await bootMission(page, 'foodwaste', 2, 'el');
    await page.evaluate(() => {
      const state = document.querySelector('canvas')._stateRef.current;
      state.showMissionIntro = false;
      state.irisOpenness = 1;
      state.heldItem = {
        id: 'bread', emoji: '🍞', source: 'market', fridgeRef: null,
      };
    });
    await page.waitForFunction(() => (
      !!document.querySelector('canvas')?._stateRef?.current?.undoHintRect
    ), null, { timeout: 3000 });

    const hintRect = await canvasStateRectInViewport(page, 'undoHintRect');
    expect(hintRect).not.toBeNull();

    const controls = await Promise.all(DPAD_KEYS.map((key) => (
      page.locator(`[data-key="${key}"]`).boundingBox()
    )));
    for (const [index, controlRect] of controls.entries()) {
      expect(
        overlapArea(hintRect, controlRect),
        `undo hint must not overlap ${DPAD_KEYS[index]}`,
      ).toBe(0);
    }
  });
});
