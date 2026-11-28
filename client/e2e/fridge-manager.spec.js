import { test, expect } from '@playwright/test';
import { bootMission, driveToResult, pressEnter } from './helpers.js';

/**
 * 3.1 "Fridge Manager" (HOOK) — carry each food to a valid storage station.
 *
 * Pick up a food (Enter at a counter), carry it to a station where EUFIC endorses it
 * (freezer / fridge / cupboard / compost) and Enter to place. We always pick an ACCEPTED
 * bin per food (derived from fridgeData.gradePlacement), so every one of the 10 foods is
 * stored (+10), the kitchen fills 10/10 and the run earns the perfect tier.
 */
function stepFridgeManager() {
  const TS = 32, DIR_DOWN = 0, DIR_UP = 1, DIR_LEFT = 2, DIR_RIGHT = 3;
  // food id → an EUFIC-accepted station for it (never a flagged 'avoid' bin).
  const BIN = {
    bread: 'cupboard', banana: 'cupboard', potato: 'cupboard', onion: 'cupboard',
    milk: 'fridge', fish: 'fridge', chicken: 'fridge', lettuce: 'fridge',
    rice_old: 'compost', fish_thawed: 'fridge',
  };
  const BIN_TARGET = {
    freezer: { col: 6, row: 4, dir: DIR_UP },
    fridge: { col: 13, row: 4, dir: DIR_UP },
    cupboard: { col: 4, row: 7, dir: DIR_LEFT },
    compost: { col: 15, row: 7, dir: DIR_RIGHT },
  };

  const cv = document.querySelector('canvas');
  const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };

  const stand = (col, row, dir = DIR_UP) => {
    const p = st.player;
    p.col = col; p.row = row;
    p.pixelX = col * TS; p.pixelY = row * TS;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = dir;
  };

  if (st.showMissionIntro) return { act: 'enter' };  // mission intro card
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
  // Even the final teaching card waits for the player to continue.
  if (st.feedback) return { act: 'enter' };
  if (st.celebrating) return { act: 'wait', ms: 150 }; // all placed → completion fanfare

  if (st.heldItem) {
    const target = BIN_TARGET[BIN[st.heldItem.id]];
    stand(target.col, target.row, target.dir);
    return { act: 'enter' };
  }
  const food = st.counterItems.find((c) => !c.picked);
  if (food) {
    const approach = food.row === 6
      ? { col: food.col, row: 5, dir: DIR_DOWN }
      : { col: food.col, row: 10, dir: DIR_UP };
    stand(approach.col, approach.row, approach.dir);
    return { act: 'enter' };
  }
  return { act: 'wait', ms: 150 };
}

test('3.1 Fridge Manager — uses the shared score, centred stars and clean untimed header', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await bootMission(page, 'foodwaste', 1);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.showMissionIntro === true);

  await expect(page.getByTestId('fridge-progress-status')).toHaveCount(0);

  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.showMissionIntro === false);

  await expect(page.getByTestId('fridge-progress-status')).toHaveCount(0);
  await expect(page.getByTestId('scorebar-time')).toHaveCount(0);

  const alignment = await page.evaluate(() => {
    const header = document.querySelector('[data-testid="game-scorebar"]')?.getBoundingClientRect();
    const stars = document.querySelector('[aria-label$="out of 3 stars"]')?.getBoundingClientRect();
    return {
      starsCenterDelta: header && stars
        ? Math.abs((stars.left + stars.width / 2) - (header.left + header.width / 2))
        : null,
    };
  });

  expect(alignment.starsCenterDelta).not.toBeNull();
  expect(alignment.starsCenterDelta).toBeLessThanOrEqual(1);
});

test('3.1 Fridge Manager — store every food in a valid station, fill the kitchen 10/10', async ({ page }) => {
  await bootMission(page, 'foodwaste', 1);

  // Dismiss the intro, face the first shuffled food and verify the real action
  // prompt identifies what the child is about to pick up.
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    const food = st.counterItems.find((item) => !item.picked);
    const p = st.player;
    p.col = food.col; p.row = food.row === 6 ? 5 : 10;
    p.pixelX = p.col * 32; p.pixelY = p.row * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = food.row === 6 ? 0 : 1;
  });
  await page.waitForFunction(() => {
    const st = document.querySelector('canvas')?._stateRef?.current;
    const food = st?.counterItems?.find((item) => !item.picked);
    return !!(food && st.actionPrompt?.includes(food.emoji));
  });
  await pressEnter(page);
  await expect(page.getByTestId('fridge-active-food')).toBeVisible();
  await expect(page.locator('[aria-label="0 out of 3 stars"]')).toBeVisible();

  const nav = await driveToResult(page, stepFridgeManager);

  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('result');
  expect(nav.passed).toBe(true);
  expect(nav.score).toBeGreaterThanOrEqual(60);
  expect(nav.tier).toBe('perfect');
  expect(nav.correct).toBe(10);
  expect(nav.suboptimal).toBe(0);
  await expect(page.getByRole('heading', { name: 'Perfect storage!' })).toBeVisible();
  await expect(page.getByText('Correct storage: 10/10 · First try: 10')).toBeVisible();
});

test('3.1 Fridge Manager — a wrong home teaches and keeps the same food for retry', async ({ page }) => {
  await bootMission(page, 'foodwaste', 1);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.showMissionIntro === true);
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.showMissionIntro === false);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);

  await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    const food = st.counterItems.find((item) => item.id === 'banana');
    const p = st.player;
    p.col = food.col;
    p.row = food.row === 6 ? 5 : 10;
    p.pixelX = p.col * 32; p.pixelY = p.row * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = food.row === 6 ? 0 : 1;
  });
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.actionPrompt?.includes('Banana'));
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.heldItem?.id === 'banana');

  // A banana should not go in the fridge: stand below it and try.
  await page.evaluate(() => {
    const p = document.querySelector('canvas')._stateRef.current.player;
    p.col = 13; p.row = 4;
    p.pixelX = 13 * 32; p.pixelY = 4 * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 1;
  });
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.feedback?.tier === 'avoid');

  const afterMistake = await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    return {
      held: st.heldItem?.id,
      accepted: st.acceptedCount,
      firstTry: st.firstTryAcceptedCount,
      attempts: st.attemptsByFood.banana,
    };
  });
  expect(afterMistake).toEqual({ held: 'banana', accepted: 0, firstTry: 0, attempts: 1 });
  await expect(page.getByTestId('fridge-active-food')).toContainText('Banana');

  // Dismiss the teaching card and correct the same banana at the cupboard.
  await pressEnter(page);
  await page.waitForFunction(() => !document.querySelector('canvas')?._stateRef?.current?.feedback);
  await page.evaluate(() => {
    const p = document.querySelector('canvas')._stateRef.current.player;
    p.col = 4; p.row = 7;
    p.pixelX = 4 * 32; p.pixelY = 7 * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 2;
  });
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.acceptedCount === 1);

  const corrected = await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    return { held: st.heldItem, accepted: st.acceptedCount, firstTry: st.firstTryAcceptedCount };
  });
  expect(corrected).toEqual({ held: null, accepted: 1, firstTry: 0 });
});

test('3.1 Fridge Manager — the Fridge Helper offers readable, non-answering help', async ({ page }) => {
  await bootMission(page, 'foodwaste', 1);
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);

  await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    const p = st.player;
    p.col = 2; p.row = 12;
    p.pixelX = p.col * 32; p.pixelY = p.row * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 1;
  });

  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.actionPrompt?.includes('help'));
  await pressEnter(page);
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')?._stateRef?.current?.helperTip));

  const helperState = await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    return { tip: st.helperTip, timerPaused: st.timerPaused };
  });
  expect(helperState.timerPaused).toBe(true);
  expect(helperState.tip).toContain('label');
  expect(helperState.tip).not.toMatch(/freezer|fridge|cupboard|compost/i);

  await pressEnter(page);
  await page.waitForFunction(() => !document.querySelector('canvas')?._stateRef?.current?.helperTip);
});

for (const viewport of [
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'tablet landscape', width: 1024, height: 768 },
]) {
  test(`3.1 Fridge Manager — ${viewport.name} keeps the kitchen and HUD contained`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await bootMission(page, 'foodwaste', 1, 'el');
    await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.showMissionIntro === true);
    await pressEnter(page);
    await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.showMissionIntro === false);

    await expect(page.getByTestId('game-scorebar')).toBeVisible();
    await expect(page.getByTestId('game-scorebar').locator(':scope > div:first-child > span')).toBeVisible();
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')?.getBoundingClientRect();
      const hud = document.querySelector('[data-testid="game-scorebar"]')?.getBoundingClientRect();
      const hudFont = document.querySelector('[data-testid="game-scorebar"] > div:first-child > span');
      return {
        canvas: canvas && { left: canvas.left, top: canvas.top, right: canvas.right, bottom: canvas.bottom },
        hud: hud && { left: hud.left, top: hud.top, right: hud.right, bottom: hud.bottom },
        hudFontSize: hudFont ? Number.parseFloat(getComputedStyle(hudFont).fontSize) : 0,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      };
    });

    expect(geometry.canvas.left).toBeGreaterThanOrEqual(0);
    expect(geometry.canvas.top).toBeGreaterThanOrEqual(0);
    expect(geometry.canvas.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(geometry.canvas.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(geometry.hud.left).toBeGreaterThanOrEqual(0);
    expect(geometry.hud.right).toBeLessThanOrEqual(viewport.width);
    expect(geometry.hudFontSize).toBeGreaterThanOrEqual(14);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth);
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.innerHeight);
  });
}

test('3.1 Fridge Manager — portrait tablet asks the child to rotate without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await bootMission(page, 'foodwaste', 1, 'el');

  await expect(page.getByTestId('rotate-device')).toBeVisible();
  await expect(page.getByTestId('rotate-device')).toContainText('Γύρισε τη συσκευή σου');
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > window.innerWidth,
    vertical: document.documentElement.scrollHeight > window.innerHeight,
  }));
  expect(overflow).toEqual({ horizontal: false, vertical: false });
});

for (const resultCase of [
  { firstTry: 9, stars: 3, tier: 'perfect', title: 'Perfect storage!' },
  { firstTry: 7, stars: 2, tier: 'great', title: 'Great storage!' },
  { firstTry: 6, stars: 1, tier: 'pass', title: 'You did it!' },
]) {
  test(`3.1 Fridge Manager — ${resultCase.firstTry}/10 first-try answers award ${resultCase.stars} star(s)`, async ({ page }) => {
    await bootMission(page, 'foodwaste', 1);
    await page.evaluate(({ firstTry }) => {
      const state = document.querySelector('canvas')._stateRef.current;
      state.showMissionIntro = false;
      state.irisOpenness = 1;
      state.acceptedCount = 10;
      state.firstTryAcceptedCount = firstTry;
      state.celebrating = true;
      state.celebrateTimer = 2;
    }, { firstTry: resultCase.firstTry });

    await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result');
    const nav = await page.evaluate(() => window.__playfood.state().navigationData);
    expect(nav.passed).toBe(true);
    expect(nav.stars).toBe(resultCase.stars);
    expect(nav.tier).toBe(resultCase.tier);
    await expect(page.getByRole('heading', { name: resultCase.title })).toBeVisible();
  });
}

test('3.1 Fridge Manager — a teaching card stays until the child continues', async ({ page }) => {
  await bootMission(page, 'foodwaste', 1);
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  // Pick up the banana and try the fridge (a teaching card with a source).
  await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    const food = st.counterItems.find((item) => item.id === 'banana');
    const p = st.player;
    p.col = food.col; p.row = food.row === 6 ? 5 : 10;
    p.pixelX = p.col * 32; p.pixelY = p.row * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = food.row === 6 ? 0 : 1;
  });
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.actionPrompt?.includes('Banana'));
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.heldItem?.id === 'banana');
  await page.evaluate(() => {
    const p = document.querySelector('canvas')._stateRef.current.player;
    p.col = 13; p.row = 4;
    p.pixelX = 13 * 32; p.pixelY = 4 * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 1;
  });
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.feedback?.tier === 'avoid');

  // Longer than the old 5-second auto-hide: the card is still there.
  await page.waitForTimeout(6500);
  expect(await page.evaluate(() => Boolean(document.querySelector('canvas')._stateRef.current.feedback))).toBe(true);

  await pressEnter(page);
  await page.waitForFunction(() => !document.querySelector('canvas')?._stateRef?.current?.feedback);
});
