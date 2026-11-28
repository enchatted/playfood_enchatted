import { test, expect } from '@playwright/test';
import { bootMission, driveToResult, pressEnter, pressKey } from './helpers.js';

/**
 * 3.3 "Leftover Chef" (CHALLENGE) — goal-matching rescue cooking.
 *
 * Each round names a rescue GOAL (use up these at-risk leftovers). We carry the goal's two
 * at-risk items from the counters into the central Rescue Pot and cook — any dish using them
 * meets the goal (+25). Rescue all 3 goals → +25 all-done bonus → celebration → complete.
 * Score 100 ≥ the 50 pass mark.
 */
function stepLeftoverChef() {
  const TS = 32, DIR_UP = 1;

  const cv = document.querySelector('canvas');
  const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };

  const faceTile = (tile) => {
    const p = st.player;
    p.col = tile.col; p.row = tile.row + 1;
    p.pixelX = p.col * TS; p.pixelY = p.row * TS;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
  };
  const faceIngredient = (item) => {
    const p = st.player;
    p.col = item.col < 10 ? item.col + 1 : item.col - 1;
    p.row = item.row;
    p.pixelX = p.col * TS; p.pixelY = p.row * TS;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = item.col < 10 ? 2 : 3;
  };
  const facePot = () => faceTile({ col: 9, row: 7 }); // stand at (9,8), facing the central pot

  if (st.showMissionIntro) return { act: 'enter' };
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
  if (st.factCard) {
    window.__leftoverFactVisits ||= {};
    const key = String(st.goalIndex);
    // Count a newly shown card, not every driver poll while the same card remains open.
    if (window.__leftoverActiveFact !== key) {
      window.__leftoverFactVisits[key] = (window.__leftoverFactVisits[key] || 0) + 1;
      window.__leftoverActiveFact = key;
    }
    window.__leftoverFactPaused = window.__leftoverFactPaused !== false && st.timerPaused === true;
    return { act: 'enter' };
  }
  window.__leftoverActiveFact = null;
  if (st.celebrating) return { act: 'wait', ms: 150 };
  if (st.cooking) return { act: 'wait', ms: 150 }; // cook beat
  // The «Rescue idea» card stays until Enter/Space/A (presses before 0.5 s are ignored).
  if (st.dishReveal) return st.dishRevealElapsed >= 0.6 ? { act: 'enter' } : { act: 'wait', ms: 150 };

  const goal = st.goals[st.goalIndex];
  if (!goal) return { act: 'wait', ms: 150 };

  if (st.heldItem) { facePot(); return { act: 'enter' }; } // add the carried leftover to the pot

  const potIds = st.potItems.map((i) => i.id);
  const needed = goal.atRisk.filter((id) => !potIds.includes(id));
  if (needed.length === 0 && st.potItems.length >= 2) { facePot(); return { act: 'enter' }; } // cook

  const item = st.counterItems.find((c) => c.id === needed[0] && !c.picked);
  if (item) {
    faceIngredient(item);
    if (st.actionPrompt?.includes(item.name)) {
      window.__leftoverNamedPickup = true;
      return { act: 'enter' };
    }
    return { act: 'wait', ms: 80 };
  }
  return { act: 'wait', ms: 150 };
}

test('3.3 Leftover Chef — rescue all 3 goals, reach the all-rescued win', async ({ page }) => {
  await bootMission(page, 'foodwaste', 3);

  const nav = await driveToResult(page, stepLeftoverChef);

  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('result');
  expect(nav.passed).toBe(true);
  expect(nav.score).toBeGreaterThanOrEqual(50);
  expect(nav.tier).toBe('perfect');
  expect(nav.completed).toBe(3);
  expect(nav.total).toBe(3);
  expect(nav.stars).toBe(3);
  expect(await page.evaluate(() => window.__leftoverFactVisits)).toEqual({ 1: 1, 2: 1, 3: 1 });
  expect(await page.evaluate(() => window.__leftoverFactPaused)).toBe(true);
  expect(await page.evaluate(() => window.__leftoverNamedPickup)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Excellent rescue cooking!' })).toBeVisible();
  await expect(page.getByText('Rescue goals: 3/3')).toBeVisible();
});

test('3.3 Leftover Chef — Q returns the last pot ingredient to its counter', async ({ page }) => {
  await bootMission(page, 'foodwaste', 3, 'en');
  await pressEnter(page); // dismiss intro
  await page.waitForFunction(() => {
    const st = document.querySelector('canvas')?._stateRef?.current;
    return st && !st.showMissionIntro && st.irisOpenness >= 1;
  });

  const itemId = await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    const item = st.counterItems.find((candidate) => !st.goals[0].atRisk.includes(candidate.id));
    const p = st.player;
    p.col = item.col < 10 ? item.col + 1 : item.col - 1;
    p.row = item.row;
    p.pixelX = p.col * 32; p.pixelY = p.row * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = item.col < 10 ? 2 : 3;
    return item.id;
  });
  await expect.poll(() => page.evaluate((id) => {
    const st = document.querySelector('canvas')?._stateRef?.current;
    const item = st?.counterItems.find((candidate) => candidate.id === id);
    return item && st.actionPrompt;
  }, itemId)).toContain(await page.evaluate((id) => {
    const st = document.querySelector('canvas')._stateRef.current;
    return st.counterItems.find((candidate) => candidate.id === id).name;
  }, itemId));
  await pressEnter(page); // pick it up
  await expect.poll(() => page.evaluate((id) => (
    document.querySelector('canvas')._stateRef.current.heldItem?.id === id
  ), itemId)).toBe(true);
  await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    const p = st.player;
    p.col = 9; p.row = 8;
    p.pixelX = p.col * 32; p.pixelY = p.row * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 1;
  });
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current.actionPrompt || ''
  ))).toContain('Rescue Pot');
  await pressEnter(page); // add it to the pot
  await expect.poll(() => page.evaluate(() => document.querySelector('canvas')._stateRef.current.potItems.length)).toBe(1);
  await pressKey(page, 'q');

  await expect.poll(() => page.evaluate(() => document.querySelector('canvas')._stateRef.current.potItems.length)).toBe(0);
  expect(await page.evaluate((id) => {
    const st = document.querySelector('canvas')._stateRef.current;
    return st.counterItems.find((item) => item.id === id).picked;
  }, itemId)).toBe(false);
});

test('3.3 Leftover Chef — a diagonal approach still reaches one unambiguous ingredient', async ({ page }) => {
  await bootMission(page, 'foodwaste', 3, 'en');
  await pressEnter(page);
  await page.waitForFunction(() => {
    const st = document.querySelector('canvas')?._stateRef?.current;
    return st && !st.showMissionIntro && st.irisOpenness >= 1;
  });

  const itemName = await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    const item = st.counterItems.find((candidate) => candidate.id === st.goals[0].atRisk[0]);
    const p = st.player;
    p.col = item.col + 1; p.row = item.row - 1;
    p.pixelX = p.col * 32; p.pixelY = p.row * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 0;
    return item.name;
  });

  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current.actionPrompt || ''
  ))).toContain(itemName);
});

test('3.3 Leftover Chef — a diagonal approach still reaches the Rescue Pot', async ({ page }) => {
  await bootMission(page, 'foodwaste', 3, 'en');
  await pressEnter(page);
  await page.waitForFunction(() => {
    const st = document.querySelector('canvas')?._stateRef?.current;
    return st && !st.showMissionIntro && st.irisOpenness >= 1;
  });

  await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    const item = st.counterItems[0];
    item.picked = true;
    st.heldItem = { id: item.id, emoji: item.emoji, name: item.name };
    const p = st.player;
    p.col = 8; p.row = 8;
    p.pixelX = p.col * 32; p.pixelY = p.row * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 1;
  });

  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current.actionPrompt || ''
  ))).toContain('Rescue Pot');
});

test('3.3 Leftover Chef — blocking phases clear stale interaction prompts', async ({ page }) => {
  await bootMission(page, 'foodwaste', 3, 'en');
  await pressEnter(page);
  await page.waitForFunction(() => {
    const st = document.querySelector('canvas')?._stateRef?.current;
    return st && !st.showMissionIntro && st.irisOpenness >= 1;
  });

  await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    st.actionPrompt = 'Press Enter or Space to cook!';
    st.dropPrompt = 'Press Q to put back';
    st.cooking = true;
    st.cookTimer = 10;
  });

  await expect.poll(() => page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    return [st.actionPrompt, st.dropPrompt];
  })).toEqual([null, null]);
});

test('3.3 Leftover Chef — the rescue idea waits for the child, then the safety card needs its own press', async ({ page }) => {
  await bootMission(page, 'foodwaste', 3, 'en');
  // Play until the first dish is cooked and its «Rescue idea» card is up.
  for (let i = 0; i < 300; i++) {
    const up = await page.evaluate(() => Boolean(document.querySelector('canvas')._stateRef.current.dishReveal));
    if (up) break;
    const a = await page.evaluate(stepLeftoverChef);
    if (a.act === 'enter') await pressEnter(page); else await page.waitForTimeout(a.ms || 120);
  }
  const reveal = () => page.evaluate(() => document.querySelector('canvas')._stateRef.current.dishReveal);
  const card = () => page.evaluate(() => document.querySelector('canvas')._stateRef.current.factCard);
  expect(await reveal()).toMatchObject({ ideaId: 'veg_soup_basic', name: 'Vegetable soup', title: 'Rescue idea:' });
  expect((await reveal()).text).toContain('With a little water and oil');

  // A hurried press in the first half second is ignored (and the prompt is not shown yet).
  await page.evaluate(() => { document.querySelector('canvas')._stateRef.current.dishRevealElapsed = 0; });
  await pressEnter(page);
  expect(await reveal()).toBeTruthy();

  await page.waitForTimeout(3000); // the old card closed itself after 1.4 s
  expect(await reveal()).toBeTruthy();
  expect(await card()).toBeNull();

  await pressEnter(page);
  await page.waitForFunction(() => !document.querySelector('canvas')._stateRef.current.dishReveal);
  await page.waitForTimeout(800);
  expect(await card()).toBeTruthy(); // the same press did not skip the safety card

  await pressEnter(page);
  await page.waitForFunction(() => !document.querySelector('canvas')._stateRef.current.factCard);
});
