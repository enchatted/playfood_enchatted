import { test, expect } from '@playwright/test';
import {
  bootMission, driveToResult, holdEnter, pressEnter,
} from './helpers.js';
import { stepGardenPlanner } from './drivers/garden-planner-driver.js';

/**
 * 1.2 "Garden Planner" (PRACTICE) — full plant → water → harvest cycle.
 *
 * Phases are global: PLANT all 4 seasons (2 plantings each, correct seed for the
 * active season → healthy), then WATER every plot twice (hold-to-water, 2 rounds),
 * then HARVEST every plot with the basket. Decision-event cards that pop after the
 * first planting of a season are answered + dismissed. Finishing all 8 healthy
 * harvests → win.
 */

async function dismissGardenIntro(page) {
  await page.waitForTimeout(650);
  await pressEnter(page);
  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return state && !state.showMissionIntro && state.irisOpenness >= 1;
  });
}

async function setGardenState(page, setup) {
  await page.evaluate((next) => {
    const state = document.querySelector('canvas')._stateRef.current;
    Object.assign(state, {
      showMissionIntro: false,
      irisOpenness: 1,
      decisionEvent: null,
      pendingEvent: null,
      ...next.state,
    });
    if (next.player) {
      Object.assign(state.player, next.player, {
        pixelX: next.player.col * 32,
        pixelY: next.player.row * 32,
        fromX: next.player.col * 32,
        fromY: next.player.row * 32,
        toX: next.player.col * 32,
        toY: next.player.row * 32,
        moving: false,
        moveTimer: 0,
      });
    }
    if (next.preparePlots) {
      for (const plot of state.plots) {
        Object.assign(plot, next.preparePlots);
      }
    }
    for (const change of next.plots || []) {
      const plot = state.plots.find((candidate) => (
        candidate.col === change.col && candidate.row === change.row
      ));
      Object.assign(plot, change.values);
    }
  }, setup);
  await page.waitForTimeout(150);
}

test('1.2 Garden Planner — full plant → water → harvest, 8/8 healthy harvests', async ({ page }) => {
  await bootMission(page, 'growing', 2);

  const nav = await driveToResult(page, stepGardenPlanner);

  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('result');
  expect(nav.passed).toBe(true);
  expect(nav.healthyHarvests).toBe(8);
});

test('#18 keeps walking direction until the child confirms a side target', async ({ page }) => {
  await bootMission(page, 'growing', 2);
  await dismissGardenIntro(page);
  await setGardenState(page, {
    state: {
      phase: 'PLANT', activeSeason: 'winter',
      carrying: { seed: { id: 'cabbage', emoji: '🥬', validSeasons: ['winter'] } },
    },
    player: { col: 3, row: 4, dir: 2 },
  });

  const idle = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return { dir: state.player.dir, target: state.targetTile };
  });
  expect(idle.dir).toBe(2);
  expect(idle.target).toMatchObject({ col: 3, row: 3 });

  await pressEnter(page);
  const confirmed = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const plot = state.plots.find((candidate) => candidate.col === 3 && candidate.row === 3);
    return { dir: state.player.dir, seed: plot.seed };
  });
  expect(confirmed.dir).toBe(1);
  expect(confirmed.seed?.id).toBe('cabbage');
});

test('does not allow the same crop twice in one season', async ({ page }) => {
  await bootMission(page, 'growing', 2, 'el');
  await dismissGardenIntro(page);
  await setGardenState(page, {
    state: {
      phase: 'PLANT',
      activeSeason: 'summer',
      seasonPlantCount: 1,
      carrying: {
        seed: {
          id: 'watermelon', emoji: '🍉', name: 'Καρπούζι', validSeasons: ['summer'],
        },
      },
    },
    player: { col: 16, row: 10, dir: 0 },
    preparePlots: { seed: null, health: 0, wilted: false, harvested: false, growthStage: 0 },
    plots: [
      { col: 15, row: 11, values: { seed: { id: 'watermelon', emoji: '🍉' } } },
    ],
  });

  await pressEnter(page);

  const result = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const target = state.plots.find((plot) => plot.col === 16 && plot.row === 11);
    return {
      targetSeed: target.seed,
      stillCarrying: state.carrying?.seed?.id,
      feedback: state.feedbackText,
      seasonPlantCount: state.seasonPlantCount,
    };
  });
  expect(result).toEqual({
    targetSeed: null,
    stillCarrying: 'watermelon',
    feedback: '✓ Το φύτεψες ήδη αυτή την εποχή. Διάλεξε άλλο!',
    seasonPlantCount: 1,
  });
});

test('#17 one continuous hold waters exactly one plant', async ({ page }) => {
  await bootMission(page, 'growing', 2);
  await dismissGardenIntro(page);
  await setGardenState(page, {
    state: { phase: 'WATER', waterRound: 1, carrying: { tool: 'water' } },
    player: { col: 3, row: 2, dir: 0 },
    preparePlots: { seed: null, health: 0, wilted: false, harvested: false, growthStage: 0 },
    plots: [
      { col: 3, row: 2, values: { seed: { id: 'cabbage', emoji: '🥬' } } },
      { col: 3, row: 3, values: { seed: { id: 'cabbage', emoji: '🥬' } } },
    ],
  });

  await holdEnter(page, 4300);
  const health = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const at = (col, row) => state.plots.find((plot) => plot.col === col && plot.row === row).health;
    return { own: at(3, 2), faced: at(3, 3) };
  });
  expect(health).toEqual({ own: 1, faced: 0 });
});

test('the move to harvest explains that growing time has passed', async ({ page }) => {
  await bootMission(page, 'growing', 2, 'el');
  await dismissGardenIntro(page);
  await setGardenState(page, {
    state: { phase: 'WATER', waterRound: 2, carrying: { tool: 'water' } },
    player: { col: 3, row: 2, dir: 0 },
    preparePlots: { seed: null, health: 0, wilted: false, harvested: false, growthStage: 0 },
    plots: [
      { col: 3, row: 2, values: { seed: { id: 'cabbage', emoji: '🥬' }, health: 1, growthStage: 1 } },
    ],
  });

  await holdEnter(page, 4300);
  const toast = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return { phase: state.phase, text: state.feedbackText, edu: state.feedbackEduText };
  });
  expect(toast.phase).toBe('HARVEST');
  expect(toast.text).toBe('🌾 Ώρα Συγκομιδής!'); // one 🌾, not two
  expect(toast.edu).toContain('Πέρασε καιρός');
});

test('#18 shows a teaching target before explaining the wrong harvest tool', async ({ page }) => {
  await bootMission(page, 'growing', 2);
  await dismissGardenIntro(page);
  await setGardenState(page, {
    state: { phase: 'HARVEST', carrying: { tool: 'harvest' }, wrongToolCount: 0 },
    player: { col: 3, row: 1, dir: 0 },
    preparePlots: {
      seed: { id: 'cabbage', emoji: '🥬' }, health: 2, wilted: false, harvested: true,
    },
    plots: [
      { col: 3, row: 2, values: { health: 0, wilted: true, harvested: false } },
      { col: 4, row: 2, values: { health: 2, wilted: false, harvested: false } },
    ],
  });

  const before = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return { target: state.targetTile, mode: state.targetMode, prompt: state.actionPrompt };
  });
  expect(before.target).toMatchObject({ col: 3, row: 2 });
  expect(before.mode).toBe('teach');
  expect(before.prompt).toBeTruthy();

  await pressEnter(page);
  const after = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      wrongToolCount: state.wrongToolCount,
      facedHarvested: state.plots.find((plot) => plot.col === 3 && plot.row === 2).harvested,
      diagonalHarvested: state.plots.find((plot) => plot.col === 4 && plot.row === 2).harvested,
    };
  });
  expect(after).toEqual({ wrongToolCount: 1, facedHarvested: false, diagonalHarvested: false });
});

test('instructions clear the world interaction target', async ({ page }) => {
  await bootMission(page, 'growing', 2);
  await dismissGardenIntro(page);
  await setGardenState(page, {
    state: {
      phase: 'PLANT', activeSeason: 'winter',
      carrying: { seed: { id: 'cabbage', emoji: '🥬', validSeasons: ['winter'] } },
    },
    player: { col: 3, row: 2, dir: 0 },
  });

  await expect.poll(() => page.evaluate(
    () => document.querySelector('canvas')._stateRef.current.targetTile,
  )).not.toBeNull();
  await page.getByRole('button', { name: /guide/i }).click();

  const overlayState = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      showMissionIntro: state.showMissionIntro,
      targetTile: state.targetTile,
      targetMode: state.targetMode,
      actionPrompt: state.actionPrompt,
      wateringTarget: state.wateringTarget,
    };
  });
  expect(overlayState).toEqual({
    showMissionIntro: true,
    targetTile: null,
    targetMode: null,
    actionPrompt: null,
    wateringTarget: null,
  });
});

test('pause clears the world interaction target', async ({ page }) => {
  await bootMission(page, 'growing', 2);
  await dismissGardenIntro(page);
  await setGardenState(page, {
    state: {
      phase: 'PLANT', activeSeason: 'winter',
      carrying: { seed: { id: 'cabbage', emoji: '🥬', validSeasons: ['winter'] } },
    },
    player: { col: 3, row: 2, dir: 0 },
  });

  await expect.poll(() => page.evaluate(
    () => document.querySelector('canvas')._stateRef.current.targetTile,
  )).not.toBeNull();
  await page.getByRole('button', { name: /pause/i }).click();

  const pausedState = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      targetTile: state.targetTile,
      targetMode: state.targetMode,
      actionPrompt: state.actionPrompt,
      wateringTarget: state.wateringTarget,
    };
  });
  expect(pausedState).toEqual({
    targetTile: null,
    targetMode: null,
    actionPrompt: null,
    wateringTarget: null,
  });
});

test('#20 keeps the consequence inside the answered decision card', async ({ page }) => {
  await bootMission(page, 'growing', 2);
  await dismissGardenIntro(page);
  await setGardenState(page, {
    state: {
      decisionEvent: {
        event: {
          id: 'seed_choice',
          emoji: '🌱',
          options: [
            { id: 'heirloom_local', emoji: '🌾', correct: true },
            { id: 'imported', emoji: '📦', correct: false },
            { id: 'artificial', emoji: '🧪', correct: false },
          ],
        },
        selected: 1,
        answered: false,
        correct: false,
        resultTimer: 0,
        prevKeys: null,
      },
    },
  });

  await pressEnter(page);

  const decision = await page.evaluate(() => {
    const current = document.querySelector('canvas')._stateRef.current.decisionEvent;
    return {
      answered: current.answered,
      correct: current.correct,
      consequenceText: current.consequenceText,
    };
  });
  expect(decision).toEqual({
    answered: true,
    correct: false,
    consequenceText: 'Heirloom varieties can give more nutritious food, and they are often adapted to local conditions.', // r2 copy (694c728)
  });
});

test('#21 opens an in-game fact source with S without moving the player down', async ({ page }) => {
  await bootMission(page, 'growing', 2);
  await dismissGardenIntro(page);
  await setGardenState(page, {
    state: {
      feedbackText: 'Best choice: both!',
      feedbackEduText: 'Old varieties are pollinated naturally, by insects and the wind.',
      feedbackFactId: 'pollination',
      feedbackTimer: 6,
    },
    player: { col: 10, row: 7, dir: 0 },
  });

  await expect.poll(() => page.evaluate(
    () => document.querySelector('canvas')._stateRef.current.feedbackSourceId,
  )).toBe('heirloom-seeds');
  const rowBefore = await page.evaluate(
    () => document.querySelector('canvas')._stateRef.current.player.row,
  );

  const popupPromise = page.waitForEvent('popup', { timeout: 3_000 });
  await page.keyboard.press('s');
  const sourcePage = await popupPromise;
  await sourcePage.waitForLoadState('domcontentloaded');

  expect(sourcePage.url()).toContain('/source.html?src=heirloom-seeds');
  expect(await page.evaluate(
    () => document.querySelector('canvas')._stateRef.current.player.row,
  )).toBe(rowBefore);
  await sourcePage.close();
});
