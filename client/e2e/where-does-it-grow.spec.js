import { test, expect } from '@playwright/test';
import { bootMission, driveToResult, pressEnter } from './helpers.js';

const ACTIVE_FOOD_VIEWPORTS = [
  { name: 'large desktop', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'school laptop', width: 1366, height: 768 },
  { name: 'low-spec laptop', width: 1280, height: 720 },
  { name: 'tablet landscape', width: 1024, height: 768 },
  { name: 'tablet portrait', width: 768, height: 1024 },
  { name: 'short landscape', width: 844, height: 390 },
  { name: 'narrow tablet', width: 600, height: 800 },
  { name: 'phone portrait stress test', width: 390, height: 844 },
];

/**
 * 1.1 "Where Does It Grow" (HOOK) — interaction critical path.
 *
 * The player carries one food at a time and walks it to the spot where it grows
 * (tree / vine / soil / grain), then presses ENTER. We position the avatar facing
 * the CORRECT spot for the current food and press Enter — driving the real
 * placement → +10 → reveal flow for all 10 foods, then assert the win state.
 */

// Runs in the browser. Faces the avatar at the correct growing spot for the
// current food (one tile below it, facing UP) and returns the action to perform.
function stepWhereDoesItGrow() {
  const TS = 32, DIR_UP = 1;
  const cv = document.querySelector('canvas');
  const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };

  if (st.showMissionIntro) return { act: 'enter' };       // dismiss mission intro card
  if (st.reveal) return { act: 'enter' };                 // dismiss "Did you know?" reveal
  if ((st.pendingRevealTimer || 0) > 0) return { act: 'wait', ms: 200 };
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };

  if (st.current) {
    const spot = st.spots.find((s) => s.key === st.current.origin);
    const tile = spot.tiles[0];
    const p = st.player;
    p.col = tile.col; p.row = tile.row + 1; // stand below the spot...
    p.pixelX = p.col * TS; p.pixelY = p.row * TS;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = DIR_UP; // ...facing UP toward it
    return { act: 'enter' }; // deliver the food
  }
  return { act: 'wait', ms: 150 };
}

test('1.1 Where Does It Grow — deliver every food, reach a 3★ win', async ({ page }) => {
  await bootMission(page, 'growing', 1);

  const nav = await driveToResult(page, stepWhereDoesItGrow);

  // 10 correct first-try placements → +10 each, full first-try stars.
  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('result');
  expect(nav.passed).toBe(true);
  expect(nav.score).toBe(100);
  expect(nav.stars).toBe(3);
});

test('1.1 replay awards coins again while keeping the best stars', async ({ page }) => {
  await bootMission(page, 'growing', 1);

  const firstRun = await driveToResult(page, stepWhereDoesItGrow);
  expect(firstRun).toMatchObject({ passed: true, score: 100, stars: 3 });
  expect(await page.evaluate(() => {
    const state = window.__playfood.state();
    return {
      points: state.points,
      bestStars: state.gameStars['growing:WhereDoesItGrow'],
    };
  })).toEqual({ points: 100, bestStars: 3 });

  await page.evaluate(() => window.__playfood.startMission('growing', 1));
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return window.__playfood.state().currentScreen === 'game'
      && Boolean(canvas?._stateRef?.current?.player);
  });
  await page.evaluate(() => document.querySelector('canvas')?.focus());

  const replay = await driveToResult(page, stepWhereDoesItGrow);
  expect(replay).toMatchObject({ passed: true, score: 100, stars: 3 });
  expect(await page.evaluate(() => {
    const state = window.__playfood.state();
    return {
      points: state.points,
      bestStars: state.gameStars['growing:WhereDoesItGrow'],
      completed: state.completedMissions.growing,
    };
  })).toEqual({ points: 200, bestStars: 3, completed: [1] });
});

test('1.1 reveals the correct spot only after two mistakes on the same food', async ({ page }) => {
  await bootMission(page, 'growing', 1, 'el');
  await pressEnter(page);
  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return state && !state.showMissionIntro && state.irisOpenness >= 1;
  });

  const placeAtSpot = async (useCorrectSpot) => page.evaluate((correct) => {
    const state = document.querySelector('canvas')._stateRef.current;
    const spot = state.spots.find((candidate) => (
      correct ? candidate.key === state.current.origin : candidate.key !== state.current.origin
    ));
    const tile = spot.tiles[0];
    Object.assign(state.player, {
      col: tile.col,
      row: tile.row + 1,
      pixelX: tile.col * 32,
      pixelY: (tile.row + 1) * 32,
      fromX: tile.col * 32,
      fromY: (tile.row + 1) * 32,
      toX: tile.col * 32,
      toY: (tile.row + 1) * 32,
      moving: false,
      moveTimer: 0,
      dir: 1,
    });
    return state.current.id;
  }, useCorrectSpot);

  await placeAtSpot(false);
  await pressEnter(page);
  expect(await page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.hintSpotKey
  ))).toBeNull();
  // The first incorrect answer leaves the explanation hidden.
  await expect(page.getByTestId('where-does-it-grow-why')).toHaveCount(0);

  await pressEnter(page);
  expect(await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return state.hintSpotKey === state.current.origin;
  })).toBe(true);
  // ...but after the second one the chip explains why, and it stays readable
  // (it is not a fading floater) until the food is placed.
  // On the 2nd miss exactly one "not there" nudge is shown (never a bare ✗), and
  // at a top bed it sits below the player, away from the chip.
  expect(await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const nudges = (state.floatingTexts || []).filter((f) => f.color === '#FFB74D');
    const playerY = 112 + state.player.pixelY; // OY (room offset) + player pixel Y
    return nudges.length === 1 && (state.player.row >= 7 || nudges[0].y > playerY);
  })).toBe(true);
  const why = page.getByTestId('where-does-it-grow-why');
  await expect(why).toBeVisible();
  await expect(why).not.toHaveText(/why_|\{\{/);
  await page.waitForTimeout(4000);
  await expect(why).toBeVisible();

  const firstFoodId = await placeAtSpot(true);
  await pressEnter(page);
  const nextStep = await page.waitForFunction((id) => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    if (state?.current?.id !== id) return 'advanced';
    if (state?.reveal || (state?.pendingRevealTimer || 0) > 0) return 'reveal';
    return false;
  }, firstFoodId).then((handle) => handle.jsonValue());
  if (nextStep === 'reveal') {
    await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.reveal);
    await page.waitForFunction(() => (
      document.querySelector('canvas')?._stateRef?.current?.enterWasDown === false
    ));
    await pressEnter(page);
  }
  await page.waitForFunction((id) => (
    document.querySelector('canvas')?._stateRef?.current?.current?.id !== id
  ), firstFoodId);
  await expect(page.getByTestId('where-does-it-grow-why')).toHaveCount(0);

  await placeAtSpot(false);
  await pressEnter(page);
  expect(await page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.hintSpotKey
  ))).toBeNull();
});

test('1.1 clearly names the food currently being planted', async ({ page }) => {
  await bootMission(page, 'growing', 1, 'el');

  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return state?.showMissionIntro === true;
  });
  await pressEnter(page);
  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return state?.showMissionIntro === false && state?.irisOpenness >= 1;
  });

  const firstFood = await page.evaluate(() => {
    const current = document.querySelector('canvas')._stateRef.current.current;
    return { id: current.id, emoji: current.emoji };
  });
  const activeFoodChip = page.getByTestId('where-does-it-grow-active-food');

  await expect(activeFoodChip).toBeVisible();
  await expect(activeFoodChip).toContainText(firstFood.emoji);
  await expect(activeFoodChip).toContainText('Τώρα φυτεύεις:');

  for (const viewport of ACTIVE_FOOD_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const layout = await activeFoodChip.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const canvasRect = document.querySelector('canvas').getBoundingClientRect();
      const gameSurface = document.querySelector('canvas').parentElement;
      let scoreBar = gameSurface.previousElementSibling;
      while (scoreBar?.tagName === 'STYLE') scoreBar = scoreBar.previousElementSibling;
      const scoreBarRect = scoreBar?.getBoundingClientRect();
      const computedStyle = getComputedStyle(element);
      return {
        fontSize: Number.parseFloat(computedStyle.fontSize),
        expectedFontSize: Math.min(28, Math.max(18, window.innerWidth * 0.021)),
        pointerEvents: computedStyle.pointerEvents,
        centeredDelta: Math.abs((rect.left + rect.right) / 2 - window.innerWidth / 2),
        topGapFromHeader: scoreBarRect ? rect.top - scoreBarRect.bottom : 0,
        insideViewport: rect.left >= 0 && rect.right <= window.innerWidth
          && rect.top >= 0 && rect.bottom <= window.innerHeight,
        canvasInsideViewport: canvasRect.left >= 0 && canvasRect.right <= window.innerWidth
          && canvasRect.top >= 0 && canvasRect.bottom <= window.innerHeight,
        hasDocumentOverflow: document.documentElement.scrollWidth > window.innerWidth
          || document.documentElement.scrollHeight > window.innerHeight,
        hasTextOverflow: element.scrollWidth > element.clientWidth + 1
          || element.scrollHeight > element.clientHeight + 1,
      };
    });
    const context = `${viewport.name} (${viewport.width}×${viewport.height})`;

    expect(layout.fontSize, `${context}: readable font`).toBeGreaterThanOrEqual(18);
    expect(layout.fontSize, `${context}: font cap`).toBeLessThanOrEqual(28);
    expect(Math.abs(layout.fontSize - layout.expectedFontSize), `${context}: proportional font`).toBeLessThan(0.1);
    expect(layout.centeredDelta, `${context}: horizontal centering`).toBeLessThan(1);
    expect(layout.topGapFromHeader, `${context}: gap below header`).toBeGreaterThanOrEqual(8);
    expect(layout.insideViewport, `${context}: chip bounds`).toBe(true);
    expect(layout.canvasInsideViewport, `${context}: canvas bounds`).toBe(true);
    expect(layout.hasDocumentOverflow, `${context}: document overflow`).toBe(false);
    expect(layout.hasTextOverflow, `${context}: text overflow`).toBe(false);
    expect(layout.pointerEvents, `${context}: gameplay remains clickable`).toBe('none');
  }

  await page.setViewportSize({ width: 1024, height: 768 });
  // The portrait rotation prompt releases keyboard control after the resize.
  await expect(page.getByTestId('rotate-device')).toHaveCount(0);
  await expect(page.getByTestId('active-canvas-content')).not.toHaveAttribute('inert', '');
  await page.locator('canvas').focus();

  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const spot = state.spots.find((candidate) => candidate.key === state.current.origin);
    const tile = spot.tiles[0];
    const tileSize = 32;
    state.player.col = tile.col;
    state.player.row = tile.row + 1;
    state.player.pixelX = state.player.col * tileSize;
    state.player.pixelY = state.player.row * tileSize;
    state.player.fromX = state.player.pixelX;
    state.player.fromY = state.player.pixelY;
    state.player.toX = state.player.pixelX;
    state.player.toY = state.player.pixelY;
    state.player.moving = false;
    state.player.moveTimer = 0;
    state.player.dir = 1;
  });
  await pressEnter(page);

  const needsRevealDismissal = await page.waitForFunction((firstId) => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    if (!state) return false;
    if (state.current?.id !== firstId) return 'advanced';
    if ((state.pendingRevealTimer || 0) > 0 || state.reveal) return 'reveal';
    return false;
  }, firstFood.id).then((handle) => handle.jsonValue());

  if (needsRevealDismissal === 'reveal') {
    await expect(activeFoodChip).toBeHidden();
    await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.reveal);
    await page.waitForFunction(() => (
      document.querySelector('canvas')?._stateRef?.current?.enterWasDown === false
    ));
    await pressEnter(page);
  }

  await page.waitForFunction((firstId) => {
    const current = document.querySelector('canvas')?._stateRef?.current?.current;
    return current && current.id !== firstId;
  }, firstFood.id);
  const secondFood = await page.evaluate(() => {
    const current = document.querySelector('canvas')._stateRef.current.current;
    return { id: current.id, emoji: current.emoji };
  });

  expect(secondFood.id).not.toBe(firstFood.id);
  await expect(activeFoodChip).toBeVisible();
  await expect(activeFoodChip).toContainText(secondFood.emoji);
  await expect(activeFoodChip).toContainText('Τώρα φυτεύεις:');
});
