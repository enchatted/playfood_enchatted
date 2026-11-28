import { defineConfig } from '@playwright/test';

/**
 * Playwright config — Island 1 canvas UI-interaction tests.
 *
 * These exercise the REAL keyboard→scoring→win path of each minigame. The games
 * render to a single <canvas> and expose `window.__playfood` + `canvas._stateRef`
 * (dev-only test mode, see src/utils/testMode.js), so the specs drive the avatar
 * with real key events and read the live game state to assert the result screen.
 *
 * Run: npm run dev must be available (Vite, port 3000). `webServer` boots it for us.
 */
export default defineConfig({
  testDir: './e2e',
  // GardenPlanner walks a full plant→water→harvest game (8 plots, 2 water rounds),
  // so give each spec a generous ceiling. The other two finish in well under a minute.
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // single dev server + RAF-timed watering → run serially for stable timing
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 1366, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    // Existing serial UI-interaction suite (real keyboard events). Touch specs
    // are excluded here so they don't run twice (once per project).
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: /touch-.*\.spec\.js/ },
    // Tablet/whiteboard emulation for the on-screen TouchDpad.
    // NOTE (verified empirically against this Playwright/Chromium build —
    // Playwright 1.61.1): setting `hasTouch: true` on the context flips CSS
    // `(pointer: coarse)` to true as a side effect, which is the OPPOSITE of
    // what the touchSeen-gate scenario needs to test (a whiteboard: a fine
    // primary pointer that ALSO receives real touch events). We deliberately
    // leave `hasTouch` unset (false) here: CDP `Input.dispatchTouchEvent`
    // (see helpers.js `touchHold`) dispatches genuine, trusted touch events
    // and is received by the page regardless of the context's `hasTouch`
    // flag, while `(pointer: coarse)` correctly stays false — i.e. this is
    // the more faithful emulation of the interactive-whiteboard device this
    // project is named for.
    { name: 'tablet-touch', use: { browserName: 'chromium', viewport: { width: 1024, height: 768 } }, testMatch: /touch-.*\.spec\.js/ },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
