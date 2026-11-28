import { test, expect } from '@playwright/test';
import { pressEnter } from './helpers.js';
import { validateEvent } from '../../server/src/validate.js';

if (process.env.PLAYFOOD_E2E_BROWSER_CHANNEL) {
  test.use({ channel: process.env.PLAYFOOD_E2E_BROWSER_CHANNEL });
}

for (const exit of ['refresh', 'navigate']) {
  test(`progress survives ${exit} after a real detective decision`, async ({ page }) => {
    const events = [];
    await page.route('**/api/config', route => route.fulfill({ json: { tracking: true } }));
    // Capture the real outbound payload without polluting the local statistics.
    await page.route('**/api/ev', async route => {
      const body = route.request().postDataJSON();
      if (body) events.push(body);
      await route.fulfill({ json: { ok: true } });
    });
    // Count transmissions where they leave the page: one record per accepted sendBeacon or
    // fetch to /api/ev, kept across the reload. The route above may or may not expose an
    // unload beacon's body, so it is never a second source for the abandon count.
    await page.addInitScript(() => {
      const record = (body) => {
        const sent = JSON.parse(localStorage.getItem('__pf_sent') || '[]');
        localStorage.setItem('__pf_sent', JSON.stringify([...sent, body]));
      };
      const isEv = (url) => String(url).endsWith('/api/ev');
      const send = navigator.sendBeacon.bind(navigator), nativeFetch = window.fetch.bind(window);
      const NativeBlob = window.Blob;
      let last = null;
      window.Blob = class extends NativeBlob {
        constructor(parts, opts) { super(parts, opts); last = typeof parts?.[0] === 'string' ? parts[0] : null; }
      };
      navigator.sendBeacon = (url, data) => {
        const ok = send(url, data);
        if (ok && isEv(url)) record(last);
        return ok;
      };
      window.fetch = (url, init) => {
        if (isEv(url)) record(init?.body ?? null);
        return nativeFetch(url, init);
      };
    });
    const sentAbandons = async (attemptId) => (await page.evaluate(() => JSON.parse(localStorage.getItem('__pf_sent') || '[]')))
      .map(body => JSON.parse(body))
      .filter(e => e.type === 'game_abandon' && e.attempt_id === attemptId);
    await page.goto('/?testMode=1&lang=en');
    await expect.poll(() => events.some(e => e.type === 'session_start')).toBe(true);
    await page.evaluate(() => localStorage.removeItem('__pf_sent'));
    await page.evaluate(() => window.__playfood.startMission('local', 3));
    await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.products?.length === 6);
    await page.locator('canvas').focus();
    await pressEnter(page);
    await page.waitForFunction(() => {
      const s = document.querySelector('canvas')._stateRef.current;
      return !s.showMissionIntro && s.irisOpenness >= 1;
    });
    const verdict = await page.evaluate(() => {
      const s = document.querySelector('canvas')._stateRef.current;
      const product = s.products[0];
      const { col, row, dir } = product.tile.approach;
      Object.assign(s.player, { col, row, dir, pixelX: col * 32, pixelY: row * 32,
        fromX: col * 32, fromY: row * 32, toX: col * 32, toY: row * 32,
        moving: false, moveTimer: 0 });
      return product.verdict;
    });
    await pressEnter(page);
    const dialog = page.locator('.spot-the-fake-inspector');
    await dialog.locator('.spot-the-fake-inspector__primary').click();
    await dialog.locator('[data-action="evidence-continue"]').click();
    await dialog.locator(`[data-choice="${verdict}"]`).click();
    await expect(dialog.locator('[data-feedback-reason="true"]')).toBeVisible();
    const started = events.find(e => e.type === 'game_start' && e.game === 'SpotTheFake');
    expect(started).toBeTruthy();
    if (exit === 'refresh') {
      await page.reload();
      await expect.poll(() => events.filter(e => e.type === 'session_start').length).toBe(2);
    } else await page.evaluate(() => window.__playfood.goToScreen('hub'));
    await expect.poll(async () => (await sentAbandons(started.attempt_id)).length).toBe(1);
    // Exactly one transmission for this attempt: a late second send must still fail the test.
    await page.waitForTimeout(1000);
    const abandons = await sentAbandons(started.attempt_id);
    expect(abandons).toHaveLength(1);
    const terminal = abandons[0];
    expect(terminal).toMatchObject({ progress: 17, game: 'SpotTheFake', island: 'local' });
    expect(terminal.timing_version).toBe(1);
    expect(validateEvent(terminal).ok).toBe(true);
  });
}

test('five-minute inactivity threshold and pause reach the real outgoing payload', async ({ page }) => {
  const events = [];
  await page.clock.install();
  await page.route('**/api/config', route => route.fulfill({ json: { tracking: true } }));
  await page.route('**/api/ev', async route => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/?testMode=1&lang=en');
  await expect.poll(() => events.some(e => e.type === 'session_start')).toBe(true);
  await page.evaluate(() => window.__playfood.startMission('local', 3));
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.showMissionIntro);
  await page.locator('canvas').focus();
  await page.waitForTimeout(1000);
  await page.clock.fastForward(301000);
  await pressEnter(page);
  await page.waitForFunction(() => !document.querySelector('canvas')._stateRef.current.showMissionIntro);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.locator('[data-pause-overlay="menu"]').waitFor();
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__playfood.goToScreen('hub'));
  await expect.poll(() => events.some(e => e.type === 'game_abandon')).toBe(true);
  const event = events.find(e => e.type === 'game_abandon');
  expect(event.learning_s).toBeGreaterThanOrEqual(298);
  expect(event.learning_s).toBeLessThanOrEqual(301);
  expect(event.idle_s).toBeGreaterThanOrEqual(1);
  expect(event.paused_s).toBeGreaterThanOrEqual(1);
  expect(event.active_s).toBeGreaterThanOrEqual(1);
  expect(validateEvent(event).ok).toBe(true);
});
