import { test, expect } from '@playwright/test';
import { bootMission, driveToResult, pressEnter, pressKey } from './helpers.js';

/**
 * 3.2 "Meal Planner" (PRACTICE) — walk-GRAB-CARRY plan of 3 balanced plates.
 *
 * Pinned to scenario 0 (summer) for determinism. For each open socket on the ACTIVE plate
 * we grab a matching food — fridge (home) first to empty it before buying, then a market
 * crate for the gap — carry it to the central plate and place it. When the plate is full we
 * advance; after all 3 we cook → the «Did you know?» results card → complete. Filling every
 * socket while emptying the fridge first scores a comfortable pass (sustainability-forward).
 */
function stepMealPlanner() {
  const TS = 32, DIR_UP = 1;
  // food id → plate socket type (foods.js category → CATEGORY_TO_SLOT). Junk/dairy = no socket.
  const SLOT = {
    lettuce: 'veg', tomato: 'veg', cucumber: 'veg', kale: 'veg', chicory: 'veg', pumpkin: 'veg',
    mushroom: 'veg', bell_pepper: 'veg', red_pepper: 'veg', corn: 'veg', leek: 'veg',
    strawberry: 'fruit', banana: 'fruit', apple: 'fruit', orange: 'fruit', cherry: 'fruit', mandarin: 'fruit',
    egg: 'protein', lentils: 'protein', chicken: 'protein', tofu: 'protein', tempeh: 'protein', fish: 'protein',
    bread: 'carb', rice: 'carb', pasta: 'carb',
  };

  const cv = document.querySelector('canvas');
  const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };
  const liveScoreText = document.querySelector('[data-testid="game-scorebar"]')?.textContent || '';
  const liveScore = Number(liveScoreText.match(/Score:\s*(\d+)/)?.[1]);
  window.__mealPlannerLiveScores ||= [];
  if (Number.isFinite(liveScore) && !window.__mealPlannerLiveScores.includes(liveScore)) {
    window.__mealPlannerLiveScores.push(liveScore);
  }
  window.__mealPlannerMarketCounts ||= [];
  if (!window.__mealPlannerMarketCounts.includes(st.marketHeld)) {
    window.__mealPlannerMarketCounts.push(st.marketHeld);
  }

  const faceTile = (tile) => {
    const p = st.player;
    p.col = tile.col; p.row = tile.row + 1; // stand one tile below...
    p.pixelX = p.col * TS; p.pixelY = p.row * TS;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = DIR_UP; // ...facing UP toward it
  };
  const facePlate = () => faceTile({ col: 9, row: 7 }); // stand at (9,8), facing the central plate

  if (st.showMissionIntro) return { act: 'enter' };
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
  if (st.phase === 'results') {
    window.__mealPlannerResultPages ||= [];
    if (!window.__mealPlannerResultPages.includes(st.resultPage)) {
      window.__mealPlannerResultPages.push(st.resultPage);
    }
    if (st.resultPage === 'score') {
      const scoreText = document.querySelector('[data-testid="game-scorebar"]')?.textContent || '';
      const displayedScore = Number(scoreText.match(/Score:\s*(\d+)/)?.[1]);
      const expectedScore = Math.floor(st.results.pct * 100 + 1e-9);   // Round down to the integer shown on the score card.
      if (displayedScore !== expectedScore) return { act: 'wait', ms: 80 };
      window.__mealPlannerScoreAtFinish = displayedScore;
      window.__mealPlannerStarsAtFinish = document.querySelector('[aria-label$="out of 3 stars"]')
        ?.getAttribute('aria-label');
    }
    return { act: 'enter' };
  }

  const plate = st.plates[st.activePlate];
  if (st.heldItem) { facePlate(); return { act: 'enter' }; }      // place the carried food

  const open = plate.slots.find((s) => !s.item);
  if (!open) { facePlate(); return { act: 'enter' }; }            // plate full → next meal / cook

  const type = open.type;
  const fromFridge = st.fridge.find((f) => !f.used && SLOT[f.id] === type);
  if (fromFridge) {
    faceTile(fromFridge.tile);
    if (st.actionPrompt?.includes(fromFridge.emoji)) {
      window.__mealPlannerNamedGrabPrompt = st.actionPrompt;
      return { act: 'enter' };
    }
    return { act: 'wait', ms: 80 };
  }   // empty the fridge first
  const fromMarket = st.market.find((m) => m.cat === type && m.id !== 'chicken')
    || st.market.find((m) => m.cat === type);                               // then buy the gap (plant-first)
  if (fromMarket) {
    faceTile(fromMarket.tile);
    if (st.actionPrompt?.includes(fromMarket.emoji)) {
      window.__mealPlannerNamedGrabPrompt = st.actionPrompt;
      return { act: 'enter' };
    }
    return { act: 'wait', ms: 80 };
  }
  return { act: 'wait', ms: 150 };
}

test('3.2 Meal Planner — build 3 balanced plates fridge-first, reach a passing plan', async ({ page }) => {
  await bootMission(page, 'foodwaste', 2, 'en', '&scenario=0');

  const nav = await driveToResult(page, stepMealPlanner);

  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('result');
  // scorePlan() passes at ≥55%: all 14 sockets filled (nutrition 1.0) + fridge-first plant
  // choices (sustainability) clear it comfortably.
  expect(nav.passed).toBe(true);
  expect(nav.tier).toMatch(/^(perfect|great|pass)$/);
  // The breakdown belongs to the score card. The shared result screen receives no axes.
  expect(nav.axes).toBeUndefined();
  expect(await page.evaluate(() => window.__mealPlannerResultPages)).toEqual(['score', 'fact']);
  expect(await page.evaluate(() => window.__mealPlannerScoreAtFinish)).toBe(nav.score);
  expect(await page.evaluate(() => window.__mealPlannerStarsAtFinish)).toMatch(/^[0-3] out of 3 stars$/);
  expect(nav.score).toBeLessThanOrEqual(100);
  const liveScores = await page.evaluate(() => window.__mealPlannerLiveScores);
  expect(liveScores[0]).toBe(0);
  expect(liveScores.at(-1)).toBe(nav.score);
  expect(liveScores.some((value) => value > 0 && value < nav.score)).toBe(true);
  expect(await page.evaluate(() => window.__mealPlannerNamedGrabPrompt)).toMatch(/Press Enter, Space or the A button on screen to pick up .+/);
  const marketCounts = await page.evaluate(() => window.__mealPlannerMarketCounts);
  expect(marketCounts[0]).toBe(0);
  expect(Math.max(...marketCounts)).toBe(8);
  expect(Math.max(...marketCounts)).toBeLessThanOrEqual(9);

  const titleByTier = {
    perfect: 'Excellent meal planning!',
    great: 'Great meal planning!',
    pass: 'Good meal plan!',
  };
  await expect(page.getByRole('heading', { name: titleByTier[nav.tier] })).toBeVisible();
  await expect(page.getByText(/(Sustainability|Planet-friendly): \d+% · (Less waste|Nothing wasted): \d+% · (Balanced|Full plates): \d+%/)).toHaveCount(0);
});

test('3.2 Meal Planner — fridge focus, grab and put-back stay free of routine coach chatter', async ({ page }) => {
  await bootMission(page, 'foodwaste', 2, 'el', '&scenario=0');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);

  await page.evaluate(() => {
    const TS = 32;
    const st = document.querySelector('canvas')._stateRef.current;
    const target = st.fridge.find((item) => !item.used);
    const p = st.player;
    p.col = target.tile.col;
    p.row = target.tile.row + 1;
    p.pixelX = p.col * TS;
    p.pixelY = p.row * TS;
    p.fromX = p.pixelX;
    p.fromY = p.pixelY;
    p.toX = p.pixelX;
    p.toY = p.pixelY;
    p.moving = false;
    p.moveTimer = 0;
    p.dir = 1;
  });

  await page.waitForFunction(() => !!document.querySelector('canvas')?._stateRef?.current?.actionPrompt);
  const promptState = await page.evaluate(() => {
    const st = document.querySelector('canvas')._stateRef.current;
    return {
      actionPrompt: st.actionPrompt,
      actionPromptRect: st.actionPromptRect,
      undoHintRect: st.undoHintRect,
      coachRect: st.coachRect,
      focusedSource: st.focusedSource,
      chef: st.chef,
    };
  });

  expect(promptState.actionPrompt).toBeTruthy();
  expect(promptState.actionPromptRect).toEqual({ x: 448, y: 612, width: 384, height: 34 });
  expect(promptState.undoHintRect).toBeNull();
  expect(promptState.coachRect).toBeNull();
  expect(promptState.chef).toBeNull();
  expect(promptState.focusedSource).toMatchObject({ kind: 'home', id: expect.any(String) });

  await pressEnter(page);
  await page.waitForFunction(() => !!document.querySelector('canvas')?._stateRef?.current?.heldItem);
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.chef)).toBeNull();

  await pressKey(page, 'q');
  await page.waitForFunction(() => !document.querySelector('canvas')?._stateRef?.current?.heldItem);
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.chef)).toBeNull();
});

test('3.2 Meal Planner — Q undo restores the live score and stars', async ({ page }) => {
  await bootMission(page, 'foodwaste', 2, 'en', '&scenario=0');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);

  await page.evaluate(() => {
    const TS = 32;
    const state = document.querySelector('canvas')._stateRef.current;
    const bread = state.market.find((item) => item.id === 'bread');
    const player = state.player;
    player.col = bread.tile.col;
    player.row = bread.tile.row + 1;
    player.pixelX = player.col * TS;
    player.pixelY = player.row * TS;
    player.fromX = player.pixelX;
    player.fromY = player.pixelY;
    player.toX = player.pixelX;
    player.toY = player.pixelY;
    player.moving = false;
    player.moveTimer = 0;
    player.dir = 1;
  });
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.actionPrompt?.includes('🍞'));
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.heldItem?.id === 'bread');

  await page.evaluate(() => {
    const TS = 32;
    const player = document.querySelector('canvas')._stateRef.current.player;
    player.col = 9;
    player.row = 8;
    player.pixelX = player.col * TS;
    player.pixelY = player.row * TS;
    player.fromX = player.pixelX;
    player.fromY = player.pixelY;
    player.toX = player.pixelX;
    player.toY = player.pixelY;
    player.moving = false;
    player.moveTimer = 0;
    player.dir = 1;
  });
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.actionPrompt);
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.plates?.[0]?.slots?.[0]?.item === 'bread');

  const scoreBar = page.getByTestId('game-scorebar');
  await expect.poll(async () => Number((await scoreBar.textContent()).match(/Score:\s*(\d+)/)?.[1]))
    .toBeGreaterThan(0);
  await expect(scoreBar.getByLabel(/^[0-3] out of 3 stars$/)).toBeVisible();

  await pressKey(page, 'q');
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.plates?.[0]?.slots?.[0]?.item == null);
  await expect(scoreBar).toContainText('Score: 0');
  await expect(scoreBar.getByLabel('0 out of 3 stars')).toBeVisible();
});

// Check the live score against the foods on the plates as the player buys, places and removes them.
test('3.2 Meal Planner — final-state waste rule: home food clears the buy penalty, Q brings it back', async ({ page }) => {
  await bootMission(page, 'foodwaste', 2, 'en', '&scenario=0');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  const scoreBar = page.getByTestId('game-scorebar');
  const liveScore = async () => Number((await scoreBar.textContent()).match(/Score:\s*(\d+)/)?.[1]);

  const stand = (page_, target) => page_.evaluate((t) => {
    const TS = 32; const st = document.querySelector('canvas')._stateRef.current;
    const tile = t.at ? t.at : (t.where === 'home' ? st.fridge.find((f) => f.id === t.id && !f.used) : st.market.find((m) => m.id === t.id)).tile;
    const p = st.player; p.col = tile.col; p.row = tile.row + 1; p.pixelX = p.col * TS; p.pixelY = p.row * TS;
    p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = 1;
  }, target);
  const filled = () => page.evaluate(() => document.querySelector('canvas')._stateRef.current.plates
    .flatMap((pl) => pl.slots).filter((s) => s.item).map((s) => `${s.item}:${s.source}`));
  async function carry(id, where) {
    const before = (await filled()).length;
    await stand(page, { id, where });
    await page.waitForFunction((i) => document.querySelector('canvas')._stateRef.current.actionPrompt?.includes(
      document.querySelector('canvas')._stateRef.current[i.where === 'home' ? 'fridge' : 'market'].find((x) => x.id === i.id).emoji), { id, where });
    await pressEnter(page);
    await page.waitForFunction((i) => document.querySelector('canvas')._stateRef.current.heldItem?.id === i, id);
    await stand(page, { at: { col: 9, row: 7 } });
    await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.actionPrompt);
    await pressEnter(page);
    await page.waitForFunction((n) => document.querySelector('canvas')._stateRef.current.plates
      .flatMap((pl) => pl.slots).filter((s) => s.item).length === n, before + 1);
  }

  await carry('bread', 'home');
  // The live score and the score card both round down.
  await expect.poll(liveScore).toBe(5);
  await carry('banana', 'market');
  await expect.poll(liveScore, 'bought banana while the home banana is unused').toBe(10);
  await carry('banana', 'home');
  expect(await filled()).toEqual(['bread:home', 'banana:market', 'banana:home']);
  await expect.poll(liveScore, 'home banana used → the buy is no longer redundant').toBe(19);

  await pressKey(page, 'q');
  await expect.poll(filled).toEqual(['bread:home', 'banana:market']);
  await expect.poll(liveScore, 'Q on the home banana → the penalty is back').toBe(10);
  await pressKey(page, 'q');
  await expect.poll(filled).toEqual(['bread:home']);
  await expect.poll(liveScore, 'Q on the bought banana → no buy, no penalty').toBe(5);
});

// Check that advice follows the player's choice, appears once per food and closes on undo.
async function chefCarry(page, id, where) {
  const before = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.history.length);
  await page.evaluate(([i, w]) => {
    const TS = 32; const st = document.querySelector('canvas')._stateRef.current;
    const tile = (w === 'home' ? st.fridge.find((f) => f.id === i && !f.used) : st.market.find((m) => m.id === i)).tile;
    const p = st.player; p.col = tile.col; p.row = tile.row + 1; p.pixelX = p.col * TS; p.pixelY = p.row * TS;
    p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = 1;
  }, [id, where]);
  await page.waitForFunction(() => !!document.querySelector('canvas')._stateRef.current.actionPrompt);
  await pressEnter(page);
  await page.waitForFunction((i) => document.querySelector('canvas')._stateRef.current.heldItem?.id === i, id);
  await page.evaluate(() => {
    const TS = 32; const p = document.querySelector('canvas')._stateRef.current.player;
    p.col = 9; p.row = 8; p.pixelX = p.col * TS; p.pixelY = p.row * TS;
    p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = 1;
  });
  await page.waitForFunction(() => !!document.querySelector('canvas')._stateRef.current.actionPrompt);
  await pressEnter(page);
  await page.waitForFunction((n) => document.querySelector('canvas')._stateRef.current.history.length === n, before + 1);
}
const chefNow = (page) => page.evaluate(() => {
  const c = document.querySelector('canvas')._stateRef.current.chef;
  return c ? { key: c.key, msg: c.msg, ref: c.ref ?? null } : null;
});
async function undoOnce(page) {
  const before = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.history.length);
  await pressKey(page, 'q');
  await page.waitForFunction((n) => document.querySelector('canvas')._stateRef.current.history.length === n - 1, before);
}

test('3.2 Meal Planner — chef: no egg hint, «already» once per food, closed by Q and by the home copy', async ({ page }) => {
  await bootMission(page, 'foodwaste', 2, 'en', '&scenario=0');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  // the old automatic egg hint fired on the first frame; nothing is said before a choice now
  await page.waitForTimeout(1500);
  expect(await chefNow(page), 'no message before the first choice').toBeNull();

  await chefCarry(page, 'banana', 'market');                    // home banana still in the fridge
  expect(await chefNow(page)).toMatchObject({ key: 'already', msg: 'Already in your fridge: banana 🍌. Use that one too, or you lose points.', ref: { foodId: 'banana' } });
  await chefCarry(page, 'banana', 'home');                       // the home copy goes onto the plate
  expect(await chefNow(page), 'home banana placed → advice closed').toBeNull();
  await undoOnce(page);                                          // home banana back → penalty back
  expect(await chefNow(page), 'Q never opens a message').toBeNull();
  await undoOnce(page);                                          // the bought banana off the plate
  await chefCarry(page, 'banana', 'market');
  expect(await chefNow(page), 'banana: already said in this attempt').toBeNull();
  await undoOnce(page);

  await chefCarry(page, 'bread', 'market');                      // a different home food: said once
  expect(await chefNow(page)).toMatchObject({ key: 'already', ref: { foodId: 'bread' } });
  await undoOnce(page);
  expect(await chefNow(page), 'Q on the advised placement closes it').toBeNull();

  await chefCarry(page, 'chicken', 'market');
  expect(await chefNow(page)).toMatchObject({ key: 'plant', msg: 'In this game lentils give more Planet-friendly points.' });
  await undoOnce(page);
  expect(await chefNow(page), 'Q closes the plant advice').toBeNull();
  await chefCarry(page, 'chicken', 'market');
  expect(await chefNow(page), 'plant: already said').toBeNull();
});

test('3.2 Meal Planner — chef: season once, and «plate ready» never replaces advice still showing', async ({ page }) => {
  await bootMission(page, 'foodwaste', 2, 'en', '&scenario=2');      // winter
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  await chefCarry(page, 'bread', 'home');
  await chefCarry(page, 'egg', 'home');
  await chefCarry(page, 'orange', 'home');
  await chefCarry(page, 'strawberry', 'market');                 // out of season in winter
  expect(await chefNow(page)).toMatchObject({ key: 'season', msg: 'Winter · out of season in the game: strawberry 🍓. Fewer Planet-friendly points.' });
  // breakfast is full; the advice is still showing → a real Enter at the plate moves on silently
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.activePlate === 1);
  expect(await chefNow(page), 'advice stays, no «plate ready» over it').toMatchObject({ key: 'season' });
  await page.waitForFunction(() => !document.querySelector('canvas')._stateRef.current.chef, null, { timeout: 8_000 });
  await chefCarry(page, 'strawberry', 'market');
  expect(await chefNow(page), 'season: already said').toBeNull();
});

test('3.2 Meal Planner — chef: «plate ready» shows when no advice is showing', async ({ page }) => {
  await bootMission(page, 'foodwaste', 2, 'en', '&scenario=0');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  for (const id of ['bread', 'egg', 'strawberry', 'banana']) await chefCarry(page, id, 'home');
  expect(await chefNow(page)).toBeNull();
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.activePlate === 1);
  expect(await chefNow(page)).toMatchObject({ key: 'mealdone', msg: 'The plate is ready. On to the next meal.' });
});

test('3.2 Meal Planner — the reserved kitchen-wall row keeps player movement visible', async ({ page }) => {
  await bootMission(page, 'foodwaste', 2, 'el', '&scenario=0');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);

  // The central kitchen-wall/menu-board area reserves row 2. Exercise the real
  // keyboard movement path and prove the player remains on the visible row 3.
  await page.evaluate(() => {
    const TS = 32;
    const p = document.querySelector('canvas')._stateRef.current.player;
    p.col = 9;
    p.row = 3;
    p.pixelX = p.col * TS;
    p.pixelY = p.row * TS;
    p.fromX = p.pixelX;
    p.fromY = p.pixelY;
    p.toX = p.pixelX;
    p.toY = p.pixelY;
    p.moving = false;
    p.moveTimer = 0;
    p.dir = 1;
  });
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(250);

  expect(await page.evaluate(() => {
    const p = document.querySelector('canvas')._stateRef.current.player;
    return { col: p.col, row: p.row, moving: p.moving };
  })).toEqual({ col: 9, row: 3, moving: false });
});

test('3.2 Meal Planner — the Island 1 header shows live score and stars without duplicate status copy', async ({ page }) => {
  await bootMission(page, 'foodwaste', 2, 'el', '&scenario=0');

  const scoreBar = page.getByTestId('game-scorebar');
  await expect(scoreBar).toContainText('Σκορ: 0');
  await expect(scoreBar.getByLabel('0 out of 3 stars')).toBeVisible();
  await expect(scoreBar.getByTestId('scorebar-time')).toHaveCount(0);
  await expect(scoreBar.getByTestId('meal-planner-header-title')).toHaveCount(0);
  await expect(scoreBar).not.toContainText('Πιθανή επίδοση');
});
