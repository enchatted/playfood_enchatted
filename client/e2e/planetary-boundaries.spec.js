import { test, expect } from '@playwright/test';
import { bootMission, driveToResult } from './helpers.js';

/* Exercise all four result tiers by choosing options at the four consoles. */
function stepPlanetaryBoundaries() {
  const TS = 32, DIR_UP = 1;
  // console key → its interaction tile (player stands one below, facing UP).
  const CONSOLE = {
    food: { col: 9, row: 2 }, energy: { col: 3, row: 6 },
    transport: { col: 15, row: 6 }, materials: { col: 9, row: 11 },
  };

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
  if (st.reveal) return { act: 'enter' };           // choice / win reveal (final → application step)
  if (st.applyStep) return st.applyStep.answer === null && st.applyStep.sel === null ? { act: 'press', key: 'ArrowRight' } : { act: 'enter' }; // Select an answer before continuing from the application step.

  if (st.choice) {
    window.__planetaryDecisionProgress ||= [];
    if (st.decisionProgressLabel
      && !window.__planetaryDecisionProgress.includes(st.decisionProgressLabel)) {
      window.__planetaryDecisionProgress.push(st.decisionProgressLabel);
    }
    const consoleIndex = st.consoles.findIndex((c) => c.key === st.choice.consoleKey);
    const desiredOption = (window.__planetaryRoute || 'BBBB')[consoleIndex];
    // Find the option by ID because the mindful choice changes sides between consoles.
    const desiredSelection = st.consoles[consoleIndex].options.findIndex((o) => o.id === desiredOption);
    if (st.choice.sel !== desiredSelection) {
      return { act: 'press', key: desiredSelection === 0 ? 'ArrowLeft' : 'ArrowRight' };
    }
    return { act: 'enter' };                                            // commit
  }

  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };

  const con = st.consoles.find((c) => !c.chosen);
  if (con) {
    const tile = CONSOLE[con.key];
    stand(tile.col, tile.row + 1);                  // below the console, facing UP
    return { act: 'enter' };                         // open its choice modal
  }
  return { act: 'wait', ms: 150 };
}

const RESULT_CASES = [
  { route: 'AAAA', tier: 'fail', stars: 0, safe: 1, transgressed: 8, score: 0,
    title: 'Try the planetary choices again' },
  { route: 'BABB', tier: 'pass', stars: 1, safe: 6, transgressed: 3, score: 100,
    title: 'You made progress for the planet!' },
  { route: 'BBAB', tier: 'great', stars: 2, safe: 7, transgressed: 2, score: 125,
    title: 'Great planetary recovery!' },
  { route: 'BBBB', tier: 'perfect', stars: 3, safe: 8, transgressed: 1, score: 150,
    title: 'Excellent planetary recovery!' },
];

for (const resultCase of RESULT_CASES) {
  test(`4.3 Planetary Boundaries — ${resultCase.stars} stars via ${resultCase.route}`, async ({ page }, testInfo) => {
    await bootMission(page, 'circular', 3);
    await page.evaluate((route) => {
      window.__planetaryRoute = route;
      window.__planetaryDecisionProgress = [];
    }, resultCase.route);

    const nav = await driveToResult(page, stepPlanetaryBoundaries);

    expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('result');
    expect(nav.passed).toBe(resultCase.stars > 0);
    expect(nav.tier).toBe(resultCase.tier);
    expect(nav.transgressed).toBe(resultCase.transgressed);
    expect(nav.safe).toBe(resultCase.safe);
    expect(nav.score).toBe(resultCase.score);
    expect(nav.stars).toBe(resultCase.stars);
    expect(await page.evaluate(() => window.__planetaryDecisionProgress)).toEqual([
      'Decision 1/4', 'Decision 2/4', 'Decision 3/4', 'Decision 4/4',
    ]);
    await expect(page.getByRole('heading', { name: resultCase.title })).toBeVisible();
    await expect(page.getByText(
      `Inside the safe zone: ${resultCase.safe}/9 · Beyond the limits: ${resultCase.transgressed}`,
    )).toBeVisible();
    await testInfo.attach(`planetary-${resultCase.stars}-stars`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}
