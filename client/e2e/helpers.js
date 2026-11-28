/**
 * Shared helpers for the Island 1 canvas interaction tests.
 *
 * Strategy: the minigames render to a <canvas> and only listen for keyboard
 * input on `window` (see useGameRoomCanvas.js). They also expose the live game
 * state on `canvas._stateRef` and the Zustand store on `window.__playfood`
 * (dev-only test mode). So we:
 *   1. position the avatar by mutating `_stateRef.current.player` (a debug hook —
 *      this avoids flaky tile-by-tile pathfinding across a 20×15 grid), then
 *   2. fire a REAL keyboard event (`page.keyboard`) to trigger the actual
 *      scoring / win logic, exactly as a player would.
 *
 * Every interaction that earns points or completes the game goes through a real
 * keypress; the debug hook only places the avatar where a player would have
 * walked. Assertions read the store's result screen.
 */

/**
 * Load a minigame straight into PLAYING via the test-mode URL params.
 * `extra` appends extra query params (e.g. '&scenario=0' to pin MealPlanner's seasonal scenario).
 */
export async function bootMission(page, island, missionId, lang = 'en', extra = '') {
  await page.goto(`/?testMode=1&lang=${lang}&startMission=${island}:${missionId}${extra}`);
  // Wait until the game canvas mounted, its state ref is populated, and the
  // store actually switched to the game screen.
  await page.waitForFunction(() => {
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    return !!(st && st.player)
      && !!window.__playfood
      && window.__playfood.state().currentScreen === 'game';
  }, null, { timeout: 30_000 });
  // Focus the canvas so real key events have a sensible target (they bubble to
  // window, which is where the game listens).
  await page.evaluate(() => document.querySelector('canvas')?.focus());
}

// The confirm key every driver taps. Defaults to Enter; run the suite with
// PLAYFOOD_E2E_CONFIRM_KEY=Space to prove all games are playable with the
// space bar alone (the UI copy promises "Enter / Space", so both must hold).
const CONFIRM_KEY = process.env.PLAYFOOD_E2E_CONFIRM_KEY || 'Enter';

/** A tapped confirm key, held long enough (≈1 RAF frame) for isEnterJustPressed to see it. */
export async function pressEnter(page) {
  await page.keyboard.down(CONFIRM_KEY);
  await page.waitForTimeout(90);
  await page.keyboard.up(CONFIRM_KEY);
  await page.waitForTimeout(70);
}

/** Hold the confirm key for `ms` — used by GardenPlanner's hold-to-water mechanic. */
export async function holdEnter(page, ms) {
  await page.keyboard.down(CONFIRM_KEY);
  await page.waitForTimeout(ms);
  await page.keyboard.up(CONFIRM_KEY);
  await page.waitForTimeout(80);
}

/** Tap an arbitrary key, held ≈1 frame — used for ←/→ verdict & choice selection. */
export async function pressKey(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(90);
  await page.keyboard.up(key);
  await page.waitForTimeout(70);
}

export function currentScreen(page) {
  return page.evaluate(() => window.__playfood.state().currentScreen);
}

/**
 * Press-and-hold a REAL touch on `locator`'s center for `ms` milliseconds, then
 * lift. Used to drive the on-screen TouchDpad (components/TouchDpad.jsx),
 * whose buttons listen for touchstart/touchend, not click/pointerdown.
 *
 * Goes through a raw CDP session (`Input.dispatchTouchEvent`) rather than
 * Playwright's `page.touchscreen` API on purpose: dispatching this way
 * delivers a genuine, trusted touchstart/touchend to the page regardless of
 * the browser context's `hasTouch` flag — and, verified against this
 * Playwright/Chromium build, setting `hasTouch: true` on the context ALSO
 * flips CSS `(pointer: coarse)` to true as a side effect, which would corrupt
 * the `tablet-touch` project's whiteboard-flow tests (touchSeen gate path vs.
 * coarsePointer gate path — see playwright.config.js). So `hasTouch` is left
 * unset there, and this helper is the only way touch specs dispatch touches.
 */
export async function touchHold(page, locator, ms) {
  const client = await page.context().newCDPSession(page);
  // Touch an empty corner to reveal controls on a whiteboard with a fine primary pointer.
  if (!(await page.locator('[data-touch-control]').count())) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 40, y: 40 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.locator('[data-touch-control]').first().waitFor();
  }
  const box = await locator.boundingBox();
  if (!box) throw new Error('touchHold: locator has no bounding box (not visible/attached)');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  await page.waitForTimeout(ms);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

/**
 * Generic driver. Repeatedly asks the in-page `stepFn` what to do next, then
 * performs that action from Node so the game receives genuine key events.
 *
 * `stepFn` runs in the browser (must be self-contained — no closures) and returns:
 *   { act: 'done', nav }     the store reached the result screen
 *   { act: 'enter' }         fire / dismiss with a tapped Enter
 *   { act: 'press', key }    tap an arbitrary key (←/→ verdict or stall choice)
 *   { act: 'hold', ms }      hold Enter for ms (watering)
 *   { act: 'wait', ms }      let the RAF loop advance (iris / animations / timers)
 *
 * The loop is convergent: if an action doesn't register (e.g. a watering hold
 * fell a hair short), the next step simply re-selects the same target — so it
 * retries rather than failing. Only a true hang trips the timeout.
 */
export async function driveToResult(page, stepFn, { maxSteps = 800, timeoutMs = 165_000 } = {}) {
  const startedAt = Date.now();
  for (let i = 0; i < maxSteps; i++) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`driver timed out after ${i} steps; screen=${await currentScreen(page)}`);
    }
    const action = await page.evaluate(stepFn);
    if (action.act === 'done') return action.nav;
    if (action.act === 'enter') await pressEnter(page);
    else if (action.act === 'press') await pressKey(page, action.key);
    else if (action.act === 'hold') await holdEnter(page, action.ms);
    else await page.waitForTimeout(action.ms || 100);
  }
  throw new Error(`driver exceeded ${maxSteps} steps; screen=${await currentScreen(page)}`);
}
