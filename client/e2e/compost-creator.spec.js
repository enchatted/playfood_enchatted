import { test, expect } from '@playwright/test';
import { bootMission, driveToResult, pressEnter } from './helpers.js';

/**
 * 4.1 "Compost Creator" (HOOK) — sort 12 waste items into 5 bins.
 *
 * Pick up each item from its stump and carry it to its correct bin (compost / plastic /
 * carton / aluminium / battery) — the item carries its own `correctBin`, so we always place
 * it right. After all 12 are placed the Grand Reveal confirms each (+10); 12/12 correct →
 * celebration → complete. Score 120 ≥ the 60 pass mark.
 */
function stepCompostCreator() {
  const TS = 32, DIR_UP = 1;
  // bin id → the col of its face tile (bins span rows 1-3; stand on row 4, face UP).
  const BIN_COL = { compost: 3, plastic: 6, carton: 9, aluminium: 12, battery: 15 };

  const cv = document.querySelector('canvas');
  const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };

  const stand = (col, row) => {
    const p = st.player;
    p.col = col; p.row = row;
    p.pixelX = col * TS; p.pixelY = row * TS;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
  };

  if (st.showMissionIntro) return { act: 'enter' };
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
  if (st.revealing || st.celebrating) return { act: 'wait', ms: 150 }; // Grand Reveal + fanfare

  if (st.heldItem) {
    stand(BIN_COL[st.heldItem.correctBin], 4); // below the correct bin, facing UP at its face tile
    return { act: 'enter' };
  }
  const stump = st.counterItems.find((c) => !c.picked);
  if (stump) { stand(stump.col, stump.row + 1); return { act: 'enter' }; }       // pick up from a stump
  const floor = st.floorItems[0];
  if (floor) { stand(floor.col, floor.row + 1); return { act: 'enter' }; }       // re-grab a bounced item
  return { act: 'wait', ms: 150 };
}

test('4.1 Compost Creator — sort all 12 items correctly, reach a 12/12 win', async ({ page }) => {
  await bootMission(page, 'circular', 1);

  const nav = await driveToResult(page, stepCompostCreator);

  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('result');
  expect(nav.passed).toBe(true);
  expect(nav.score).toBeGreaterThanOrEqual(60);
  expect(nav.tier).toBe('perfect');
  expect(nav.correct).toBe(12);
  expect(nav.total).toBe(12);
  await expect(page.getByRole('heading', { name: 'Perfect sorting!' })).toBeVisible();
  await expect(page.getByText('Correctly sorted: 12/12')).toBeVisible();
});

test('4.1 Compost Creator — a chef fact pauses until Enter or Space dismisses it', async ({ page }) => {
  await bootMission(page, 'circular', 1, 'en');
  await pressEnter(page);
  await page.waitForFunction(() => {
    const st = document.querySelector('canvas')?._stateRef?.current;
    return st && !st.showMissionIntro && st.irisOpenness >= 1;
  });

  const itemId = await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    const item = st.counterItems.find((candidate) => candidate.factId);
    const p = st.player;
    p.col = item.col; p.row = item.row + 1;
    p.pixelX = p.col * 32; p.pixelY = p.row * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 1;
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
  await pressEnter(page);

  await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    const p = st.player;
    p.col = 16; p.row = 13;
    p.pixelX = p.col * 32; p.pixelY = p.row * 32;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = 1;
  });
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current.actionPrompt || ''
  ))).toContain('help');
  await pressEnter(page);
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current.factCard?.sourceId || null
  ))).not.toBeNull();
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.timerPaused)).toBe(true);

  await pressEnter(page);
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')?._stateRef?.current.factCard || null
  ))).toBeNull();
});
