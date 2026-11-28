import { test, expect } from '@playwright/test';
import { bootMission, driveToResult, pressEnter, pressKey } from './helpers.js';

// a touch device: the on-screen controls only show with a finger-type pointer
test.use({ hasTouch: true });

/**
 * 2.1 "Season Matcher" (HOOK) — cart-shopping flow.
 *
 * Pick in-season foods off the shelves (avoiding out-of-season / imported ones),
 * carry up to 4 per trip, walk to a checkout cashier and ENTER to ring them up.
 * Each in-season item rings into the basket (+10); the win lands at BASKET_SIZE
 * (6). We only ever pick in-season foods, so the basket fills cleanly.
 *
 * Starts with the shared canvas mission intro (booted as `en` → Portugal, so no
 * country picker); we dismiss it, then drive the cart loop.
 */

function stepSeasonMatcher() {
  const TS = 32, DIR_UP = 1, DIR_DOWN = 0;
  const cv = document.querySelector('canvas');
  const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };

  const BASKET = st.basketSize || 6;
  const CART_MAX = st.cartMax || 4;
  const faceFrom = (col, row, dir) => {
    const p = st.player;
    const pr = dir === DIR_UP ? row + 1 : row - 1; // UP → stand below; DOWN → stand above
    p.col = col; p.row = pr; p.pixelX = col * TS; p.pixelY = pr * TS;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = dir;
  };

  if (st.checkoutQueue) return { act: 'wait', ms: 250 };        // checkout sequence running
  if (st.basketCount >= BASKET) return { act: 'wait', ms: 250 }; // win pending (setTimeout)
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };

  const cartCount = st.cart.length;
  const stillNeed = BASKET - st.basketCount - cartCount;
  const inSeasonLeft = st.foods.filter((f) => f.inSeason && !f.taken);

  // Pick an in-season food while the cart has room and we still need more.
  if (stillNeed > 0 && cartCount < CART_MAX && inSeasonLeft.length > 0) {
    const food = inSeasonLeft[0];
    faceFrom(food.col, food.row, DIR_UP);  // stand below the shelf, face up
    return { act: 'enter' };
  }
  // Otherwise ring up whatever is in the cart at a checkout (cols 5/10/15, row 10).
  if (cartCount > 0) {
    faceFrom(5, 10, DIR_DOWN);             // stand above the cashier, face down
    return { act: 'enter' };
  }
  return { act: 'wait', ms: 200 };
}

test('2.1 Season Matcher — fill the basket with in-season foods, reach the win', async ({ page }) => {
  await bootMission(page, 'local', 1, 'en'); // en → Portugal, so no country picker

  // Dismiss the shared canvas mission intro (stage INSTRUCTIONS → PLAYING).
  await pressEnter(page);
  // Wait until the canvas game loop is actually running (update increments time).
  await page.waitForFunction(() => {
    const st = document.querySelector('canvas')?._stateRef?.current;
    return !!st && st.time > 0.15;
  }, null, { timeout: 15_000 });

  const nav = await driveToResult(page, stepSeasonMatcher);

  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('result');
  expect(nav.passed).toBe(true);
  // We only picked in-season foods → no out-of-season "travelled" items, full stars.
  expect(nav.traveled).toEqual([]);
  expect(nav.stars).toBe(3);
});

test('2.1 Season Matcher — full-stage canvas and one visible EUFIC source', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootMission(page, 'local', 1, 'el');
  await pressEnter(page);

  const canvasBox = await page.locator('canvas').boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox.width).toBeGreaterThanOrEqual(1280 * 0.95);

  const sourceActions = page.locator('[data-testid="season-matcher-source"]:visible');
  await expect(sourceActions).toHaveCount(1);
  await expect(sourceActions.first()).toContainText('EUFIC');
});

test('2.1 Season Matcher — season is primary and month is supporting context', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootMission(page, 'local', 1, 'el');
  await pressEnter(page);

  const seasonLabel = page.locator('[data-testid="season-matcher-season"]');
  const monthLabel = page.locator('[data-testid="season-matcher-month"]');
  await expect(seasonLabel).toBeVisible();
  await expect(monthLabel).toBeVisible();

  const hierarchy = await page.evaluate(() => ({
    season: Number.parseFloat(getComputedStyle(
      document.querySelector('[data-testid="season-matcher-season"]'),
    ).fontSize),
    month: Number.parseFloat(getComputedStyle(
      document.querySelector('[data-testid="season-matcher-month"]'),
    ).fontSize),
  }));
  expect(hierarchy.season).toBeGreaterThan(hierarchy.month);
});

test('2.1 Season Matcher — shows live score, shared stars and six shopping slots', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootMission(page, 'local', 1, 'el');
  await pressEnter(page);

  await expect(page.getByTestId('season-matcher-score')).toContainText(/Σκορ:\s*0/);
  await expect(page.getByTestId('season-matcher-stars')).not.toContainText('0/3');
  const slots = page.locator('[data-testid="season-matcher-basket-slot"]');
  await expect(slots).toHaveCount(6);
  await expect(page.locator('[data-testid="season-matcher-basket-slot"][data-filled="true"]')).toHaveCount(0);

  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    state.basketItems = [
      { id: 'strawberry', emoji: '🍓', name: 'Φράουλα' },
      { id: 'tomato', emoji: '🍅', name: 'Ντομάτα' },
    ];
    state.basketCount = 2;
    state.score = 20;
  });

  const filledSlot = page.locator('[data-testid="season-matcher-basket-slot"][data-filled="true"]');
  await expect(filledSlot).toHaveCount(2);
  await expect(filledSlot.first()).toContainText('🍓');
  await expect(page.getByTestId('season-matcher-score')).toContainText(/Σκορ:\s*20/);
  await expect(page.getByTestId('season-matcher-stars').locator('[aria-label="1 out of 3 stars"]')).toBeVisible();
});

test('2.1 Season Matcher — cashier artwork is a solid obstacle with open approach aisles', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootMission(page, 'local', 1, 'el');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.time > 0.15);

  const placePlayer = (col, row) => page.evaluate(({ col: nextCol, row: nextRow }) => {
    const player = document.querySelector('canvas')._stateRef.current.player;
    player.col = nextCol;
    player.row = nextRow;
    player.pixelX = nextCol * 32;
    player.pixelY = nextRow * 32;
    player.fromX = player.toX = player.pixelX;
    player.fromY = player.toY = player.pixelY;
    player.moving = false;
    player.moveTimer = 0;
    player.dir = 0;
  }, { col, row });

  await placePlayer(4, 9);
  await pressKey(page, 'ArrowDown');
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.player.row)).toBe(9);

  await placePlayer(7, 9);
  await pressKey(page, 'ArrowDown');
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.player.row)).toBe(10);
});

test('2.1 Season Matcher — uses the shared three-step mission intro', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1080 });
  await bootMission(page, 'local', 1, 'el');

  const intro = await page.evaluate(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return {
      visible: state?.showMissionIntro,
      title: state?.missionIntro?.title,
      steps: state?.missionIntro?.steps,
      sourceId: state?.missionIntro?.introFact?.sourceId,
    };
  });

  expect(intro.visible).toBe(true);
  expect(intro.title).toBe('Το Ρολόι των Εποχών');
  expect(intro.steps).toHaveLength(3);
  expect(intro.sourceId).toBe('eufic-seasonal');
  await expect(page.getByRole('button', { name: 'Πάμε για ψώνια!' })).toHaveCount(0);
  await expect(page.locator('[data-testid="season-matcher-side-panels"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="season-matcher-compact-context"]')).toHaveCount(0);

  await pressEnter(page);
  await expect(page.locator('[data-testid="season-matcher-side-panels"]')).toBeVisible();
});

test('2.1 Season Matcher — opens the supermarket behind the mission intro', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootMission(page, 'local', 1, 'el');

  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return state?.showMissionIntro === true && state.irisOpenness >= 0.99;
  }, null, { timeout: 3_000 });

  const introState = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      showMissionIntro: state.showMissionIntro,
      irisOpenness: state.irisOpenness,
      playerMoving: state.player.moving,
    };
  });

  expect(introState.showMissionIntro).toBe(true);
  expect(introState.irisOpenness).toBeGreaterThanOrEqual(0.99);
  expect(introState.playerMoving).toBe(false);
});

test('2.1 Season Matcher — intro source opens by touch or mouse', async ({ page }) => {
  await bootMission(page, 'local', 1, 'el');
  await page.waitForFunction(() => !!document.querySelector('canvas')?._stateRef?.current?.introSourceRect);

  const target = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const sourceRect = canvas._stateRef.current.introSourceRect;
    const hidpi = canvas.__hidpi;
    const backingX = hidpi.ox + (sourceRect.x + sourceRect.width / 2) * hidpi.k;
    const backingY = hidpi.oy + (sourceRect.y + sourceRect.height / 2) * hidpi.k;
    return {
      x: canvasRect.left + (backingX / canvas.width) * canvasRect.width,
      y: canvasRect.top + (backingY / canvas.height) * canvasRect.height,
    };
  });

  const popupPromise = page.waitForEvent('popup');
  await page.mouse.click(target.x, target.y);
  const sourcePage = await popupPromise;
  await sourcePage.waitForLoadState('domcontentloaded');
  expect(sourcePage.url()).toContain('source.html?src=eufic-seasonal');
  await sourcePage.close();
});

test('2.1 Season Matcher — responsive HUD stays readable across the screen matrix', async ({ page }) => {
  for (const lang of ['el', 'en', 'nl', 'pt']) {
    for (const viewport of [
      { width: 1024, height: 768 },
      { width: 1180, height: 820 },
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 2560, height: 1080 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await bootMission(page, 'local', 1, lang);
      await pressEnter(page);
      if (viewport.width >= viewport.height) {
        await expect(
          page.locator('[data-testid="season-matcher-season"]'),
          `${lang} ${viewport.width}x${viewport.height}: season context`,
        ).toBeVisible();
      }

      const metrics = await page.evaluate(() => {
        const hud = document.querySelector('[data-testid="season-matcher-hud"]');
        const seasonLabel = document.querySelector('[data-testid="season-matcher-season"]');
        const fallbackStatus = hud?.querySelector('button');
        const hudRect = hud?.getBoundingClientRect();
        const actions = hud
          ? [...hud.querySelectorAll('button')]
            .filter((button) => getComputedStyle(button).display !== 'none')
            .map((button) => {
              const rect = button.getBoundingClientRect();
              return { width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
            })
          : [];

        return {
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          hud: hudRect
            ? { left: hudRect.left, top: hudRect.top, right: hudRect.right, bottom: hudRect.bottom }
            : null,
          statusFontSize: seasonLabel || fallbackStatus
            ? Number.parseFloat(getComputedStyle(seasonLabel || fallbackStatus).fontSize)
            : 0,
          actions,
        };
      });

      expect(metrics.documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(metrics.documentHeight).toBeLessThanOrEqual(viewport.height);
      expect(metrics.hud).not.toBeNull();
      expect(metrics.hud.left).toBeGreaterThanOrEqual(0);
      expect(metrics.hud.top).toBeGreaterThanOrEqual(0);
      expect(metrics.hud.right).toBeLessThanOrEqual(viewport.width);
      expect(metrics.hud.bottom).toBeLessThanOrEqual(viewport.height);
      expect(metrics.statusFontSize).toBeGreaterThanOrEqual(14);
      expect(metrics.actions.length).toBeGreaterThan(0);
      for (const action of metrics.actions) {
        expect(action.width).toBeGreaterThanOrEqual(44);
        expect(action.height).toBeGreaterThanOrEqual(44);
        expect(action.right).toBeLessThanOrEqual(viewport.width);
        expect(action.bottom).toBeLessThanOrEqual(viewport.height);
      }
    }
  }
});

test('2.1 Season Matcher — B (or Q) returns the last picked product before paying and undoes its energy', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootMission(page, 'local', 1, 'el');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.time > 0.15);

  const picked = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const food = state.foods.find((item) => !item.inSeason && !item.taken);
    if (!food) return null;
    const player = state.player;
    player.col = food.col;
    player.row = food.row + 1;
    player.pixelX = food.col * 32;
    player.pixelY = (food.row + 1) * 32;
    player.fromX = player.toX = player.pixelX;
    player.fromY = player.toY = player.pixelY;
    player.moving = false;
    player.dir = 1;
    return { id: food.id };
  });
  expect(picked).not.toBeNull();

  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.cart.length === 1);
  const energyAfterPickup = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.energy);
  expect(energyAfterPickup).toBeGreaterThan(0);
  await expect(page.locator('[data-testid="season-matcher-feedback"]')).toContainText(/πόντοι μεταφοράς/i);
  await expect(page.locator('[data-testid="season-matcher-energy"]')).toHaveAttribute('data-pulsing', 'true');

  // Hold Q until the game loop has seen it (a slow frame must not swallow a 90 ms tap).
  await page.keyboard.down('q');
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.cart.length === 0);
  await page.keyboard.up('q');

  // seasonCart.js: the last cart item goes back to its shelf; its travel energy is undone.
  const returned = await page.evaluate((foodId) => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      cart: state.cart.map((food) => food.id),
      energy: state.energy,
      taken: state.foods.find((food) => food.id === foodId)?.taken,
      traveled: state.boughtOutOfSeason.length,
    };
  }, picked.id);
  expect(returned).toEqual({
    cart: [],
    energy: 0,
    taken: false,
    traveled: 0,
  });
  // The on-screen B button is the same action (touchControls DROP_GAME_MISSIONS).
  await expect(page.locator('[data-touch-control="true"][data-key="q"]')).toHaveCount(1);
});

test('2.1 Season Matcher — uses side panels only when the canvas has real wide gutters', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1080 });
  await bootMission(page, 'local', 1, 'el');
  await pressEnter(page);
  await expect(page.locator('[data-testid="season-matcher-side-panels"]')).toBeVisible();

  const wideMetrics = await page.evaluate(() => {
    const canvas = document.querySelector('canvas').getBoundingClientRect();
    const panels = document.querySelector('[data-testid="season-matcher-side-panels"]');
    return {
      canvasWidth: canvas.width,
      leftRailRight: panels.querySelector('[data-side="left"]').getBoundingClientRect().right,
      rightRailLeft: panels.querySelector('[data-side="right"]').getBoundingClientRect().left,
      roomLeft: canvas.left + canvas.width * 0.1625,
      roomRight: canvas.right - canvas.width * 0.1625,
      compactContextVisible: !!document.querySelector('[data-testid="season-matcher-compact-context"]'),
    };
  });
  expect(wideMetrics.leftRailRight).toBeLessThanOrEqual(wideMetrics.roomLeft);
  expect(wideMetrics.rightRailLeft).toBeGreaterThanOrEqual(wideMetrics.roomRight);
  expect(wideMetrics.roomLeft - wideMetrics.leftRailRight).toBeLessThanOrEqual(5);
  expect(wideMetrics.rightRailLeft - wideMetrics.roomRight).toBeLessThanOrEqual(5);
  expect(wideMetrics.compactContextVisible).toBe(false);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('[data-testid="season-matcher-side-panels"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="season-matcher-compact-context"]')).toBeVisible();
});

test('2.1 Season Matcher — educational checkout feedback stays readable and on screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootMission(page, 'local', 1, 'el');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.time > 0.15);

  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const food = state.foods.find((item) => !item.inSeason && !item.taken);
    const player = state.player;
    player.col = food.col;
    player.row = food.row + 1;
    player.pixelX = food.col * 32;
    player.pixelY = (food.row + 1) * 32;
    player.fromX = player.toX = player.pixelX;
    player.fromY = player.toY = player.pixelY;
    player.moving = false;
    player.dir = 1;
  });
  await pressEnter(page);

  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const player = state.player;
    player.col = 5;
    player.row = 9;
    player.pixelX = 5 * 32;
    player.pixelY = 9 * 32;
    player.fromX = player.toX = player.pixelX;
    player.fromY = player.toY = player.pixelY;
    player.moving = false;
    player.dir = 0;
  });
  await pressEnter(page);

  const feedback = page.locator('[data-testid="season-matcher-feedback"]');
  await expect(feedback).toBeVisible();
  await expect(feedback).toContainText(/ταξίδεψε από μακριά/i);
  const box = await feedback.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(1272);
  expect(box.width).toBeLessThanOrEqual(620);

  // A wrong verdict includes the reason and the correct month range, so it
  // deliberately remains visible for 4.5s instead of behaving like a toast.
  await page.waitForTimeout(3600);
  await expect(feedback).toBeVisible();
  await expect(feedback).toHaveCount(0, { timeout: 1600 });
});
