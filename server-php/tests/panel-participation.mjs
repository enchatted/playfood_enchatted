// Real panel + Node API regression. PHP aggregation is covered by stats-parity.mjs.
// Use a fresh database and random loopback port, never an installed school server.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../client/node_modules/playwright/index.mjs';
import { buildServer } from '../../server/src/app.js';
import { ISLAND_GAMES } from '../../server/src/validate.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temp = mkdtempSync(join(tmpdir(), 'playfood-panel-participation-'));
const evidence = process.env.PANEL_QA_OUT
  ? resolve(process.env.PANEL_QA_OUT)
  : mkdtempSync(join(tmpdir(), 'playfood-panel-participation-evidence-'));
mkdirSync(evidence, { recursive: true });
const dist = join(temp, 'client');
mkdirSync(dist);
cpSync(join(repo, 'client/public/fonts'), join(dist, 'fonts'), { recursive: true });
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Isolated panel test</title>');
writeFileSync(join(temp, 'playfood.config.txt'), 'PANEL_ENABLED = yes\nPANEL_SECRET =\nTIMEZONE = Europe/Athens\n');
writeFileSync(join(temp, 'phygital-codes.json'), '[]\n');
const email = 'panel-qa@example.invalid';
const password = 'Temporary-panel-QA-2026!';
writeFileSync(join(temp, 'users.txt'), `${email} : ${password}\n`);

let server;
let browser;
try {
  server = await buildServer({ dataDir: temp, clientDist: dist, loggerLevel: 'warn', trustProxy: false, corsOrigins: [] });
  const base = await server.listen({ port: 0, host: '127.0.0.1' });
  const send = async (learner_id, session_id, event) => {
    const response = await fetch(`${base}/api/ev`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learner_id, session_id, language: 'el', secret: '', ...event }),
    });
    assert.equal(response.status, 204, `fixture ${event.type}: ${await response.text()}`);
  };
  await send('open0001', 'visit0001', { type: 'session_start', returning: false });
  await send('open0001', 'visit0002', { type: 'session_start', returning: true });
  await send('hero0001', 'visit0003', { type: 'hero_chosen', hero: 'pigtails' });
  await send('island01', 'visit0004', { type: 'island_enter', island: 'growing' });
  await send('code0001', 'visit0005', { type: 'phygital_redeem', activity: 'SAVEIT' });

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (process.env.PANEL_QA_BASELINE_HTML) {
    // Negative control: exercise a preserved old panel with the same real API.
    await page.route('**/panel/', route => route.fulfill({ path: resolve(process.env.PANEL_QA_BASELINE_HTML), contentType: 'text/html' }));
  }
  await page.goto(`${base}/panel/`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#signin').click();
  await page.locator('#dashboard').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#btnExport').disabled);

  assert.equal(await page.locator('#cGameProfiles').count(), 1, 'headline must count profiles that opened a game');
  assert.equal(await page.locator('#cGameProfiles').innerText(), '0', 'page loads, reloads, hero, island and activity codes are not game participation');
  assert.equal(await page.locator('#filterStatus').isVisible(), true);
  assert.match(await page.locator('#filterStatus').innerText(), /No recorded game activity/);
  assert.equal(await page.locator('#cSessions, #cAvgVisit, #cHours, #visitsBars').count(), 0);
  assert.deepEqual(await page.locator('.cards .lbl').allTextContents(), ['Game Profiles', 'Missions Completed', 'Reached 12/12']);
  const emptySteps = await page.locator('#funnel .funnel-value').allTextContents();
  assert.deepEqual(emptySteps, ['0 · —', '0 · —', '0 · —', '0 · —']);
  console.log('PASS: opening-only activity and reloads do not become game participants; visit metrics are absent.');

  await send('player01', 'visit0010', { type: 'game_start', island: 'growing', game: 'GardenPlanner', attempt_id: 'attempt0010' });
  await send('player01', 'visit0011', { type: 'game_start', island: 'growing', game: 'SoilDoctor', attempt_id: 'attempt0011' });
  await send('player01', 'visit0011', { type: 'game_start', island: 'growing', game: 'GardenPlanner', attempt_id: 'attempt0012', language: 'nl' });
  await send('missfin1', 'visit0012', { type: 'game_finish', island: 'foodwaste', game: 'MealPlanner', attempt_id: 'attempt0013', passed: false, stars: 0, language: 'pt' });
  await send('missquit', 'visit0013', { type: 'game_abandon', island: 'local', game: 'MarketTrip', attempt_id: 'attempt0014', progress: 20, language: 'en' });
  let attempt = 20;
  for (const [island, games] of Object.entries(ISLAND_GAMES)) {
    for (const game of games) {
      const attempt_id = `attempt00${attempt++}`;
      await send('allgames', 'visit0014', { type: 'game_start', island, game, attempt_id, language: 'en' });
      await send('allgames', 'visit0014', { type: 'game_finish', island, game, attempt_id, passed: true, stars: 3, language: 'en' });
    }
  }
  await send('allgames', 'visit0015', { type: 'game_finish', island: 'growing', game: 'SoilDoctor', attempt_id: 'attempt0099', passed: true, stars: 3, language: 'en' });

  async function refresh(action) {
    await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === '/api/stats'),
      action(),
    ]);
    await page.waitForFunction(() => !document.querySelector('#btnExport').disabled);
  }
  await refresh(() => page.locator('[data-preset="all"]').click());
  assert.equal(await page.locator('#cGameProfiles').innerText(), '4');
  assert.equal(await page.locator('#cFinished').innerText(), '12');
  assert.equal(await page.locator('#cFinished12').innerText(), '1');
  assert.deepEqual(await page.locator('#funnel .funnel-label span').allTextContents(), ['Opened a game', 'Finished a game', 'Finished an island', 'Reached 12/12']);
  assert.deepEqual(await page.locator('#funnel .funnel-value').allTextContents(), ['4 · 100%', '2 · 50%', '1 · 25%', '1 · 25%']);
  const languageCounts = await page.locator('#langBars .bar-value').allTextContents();
  assert.deepEqual(languageCounts, ['2', '1', '1', '1']);
  console.log('PASS: repeated sessions/games count once; missing starts, passes and game-language bars use the right population.');

  for (const [language, profiles, missions] of [['el', '1', '0'], ['nl', '1', '0'], ['pt', '1', '0'], ['en', '2', '12']]) {
    await refresh(() => page.locator(`input[name="gameLanguage"][value="${language}"]`).check());
    assert.equal(await page.locator('#cGameProfiles').innerText(), profiles, language);
    assert.equal(await page.locator('#cFinished').innerText(), missions, language);
  }
  await refresh(() => page.locator('input[name="gameLanguage"][value=""]').check());
  await refresh(async () => {
    await page.getByRole('button', { name: 'From: Choose date', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Year', exact: true }).fill('2040');
    await page.getByRole('spinbutton', { name: 'Year', exact: true }).press('Tab');
    await page.getByRole('combobox', { name: 'Month', exact: true }).selectOption('0');
    await page.locator('.date-calendar [data-date="2040-01-01"]').click();
  });
  assert.equal(await page.locator('#cGameProfiles').innerText(), '0');
  assert.deepEqual(await page.locator('#funnel .funnel-value').allTextContents(), ['0 · —', '0 · —', '0 · —', '0 · —']);
  await refresh(() => page.locator('[data-preset="all"]').click());
  await page.reload();
  await page.locator('#dashboard').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#cGameProfiles')?.textContent === '4');

  const download = page.waitForEvent('download');
  await page.locator('#btnExport').click();
  const downloaded = await download;
  const csvFile = join(evidence, 'participation-events.csv');
  await downloaded.saveAs(csvFile);
  const { readFileSync } = await import('node:fs');
  const csv = readFileSync(csvFile, 'utf8');
  assert.equal(csv.split('\n')[0].trim(), 'sep=,');
  assert.equal(csv.split('\n')[1].trim().split(',').length, 24);
  assert.match(csv, /open0001,visit0001,session_start/);
  assert.match(csv, /open0001,visit0002,session_start/);
  assert.match(csv, /code0001,visit0005,phygital_redeem/);
  console.log('PASS: all four language filters, refresh/session restoration and the unchanged event CSV.');

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(evidence, 'panel-overview-1366.png') });
  await page.screenshot({ path: join(evidence, 'panel-1366.png'), fullPage: true });
  await page.pdf({ path: join(evidence, 'panel-A4.pdf'), format: 'A4', printBackground: true });
  for (const [width, height] of [[1024, 768], [844, 390], [390, 844]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.locator('#cGameProfiles').innerText(), '4');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}: page must not scroll sideways`);
    await page.screenshot({ path: join(evidence, `panel-${width}.png`), fullPage: true });
  }
  await page.route('**/api/stats?**', async route => {
    const response = await route.fetch();
    const data = await response.json();
    delete data.overview.gameProfiles;
    delete data.audience.gameLanguages;
    await route.fulfill({ response, json: data });
  });
  await page.locator('input[name="gameLanguage"][value="el"]').check();
  await page.waitForFunction(() => document.querySelector('#dashboard').classList.contains('stale'));
  assert.equal(await page.locator('.cards').isVisible(), false, 'an older backend must not substitute landing-page counts');
  await page.unroute('**/api/stats?**');
  await refresh(() => page.locator('input[name="gameLanguage"][value="pt"]').check());
  assert.equal(await page.locator('#cGameProfiles').innerText(), '1');
  await page.route('**/api/stats?**', route => route.abort());
  await page.locator('input[name="gameLanguage"][value="en"]').check();
  await page.waitForFunction(() => document.querySelector('#dashboard').classList.contains('stale'));
  assert.equal(await page.locator('.cards').isVisible(), false, 'a failed request must hide old figures');
  assert.deepEqual(errors, []);
  console.log('PASS: responsive layout, real A4 PDF, no page errors, older-backend protection and stale-data handling.');
  await page.unroute('**/api/stats?**');
  await refresh(() => page.locator('input[name="gameLanguage"][value=""]').check());
  await page.setViewportSize({ width: 1366, height: 768 });

  const feedbackFailures = [];
  for (const failure of ['http', 'network']) {
    // Keep the panel and authenticated API real; fail only the export transport.
    await page.route('**/api/export.csv?**', route => failure === 'http'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' })
      : route.abort());
    const failedExport = failure === 'http'
      ? page.waitForResponse(response => new URL(response.url()).pathname === '/api/export.csv' && response.status() === 503)
      : page.waitForEvent('requestfailed', request => new URL(request.url()).pathname === '/api/export.csv');
    await page.locator('#btnExport').click();
    await failedExport;
    try {
      const notice = page.getByRole('alert').filter({ hasText: /CSV/i });
      await notice.waitFor({ state: 'visible', timeout: 2000 });
      assert.match(await notice.innerText(), /could not.*CSV.*try again/i, `${failure}: explain the failure and retry`);
      assert.equal(await page.locator('#btnExport').isEnabled(), true, `${failure}: export remains retryable`);
      await page.screenshot({ path: join(evidence, `csv-${failure}-retry-message.png`), fullPage: true });
    } catch (error) {
      feedbackFailures.push(`CSV ${failure}: ${error.message}`);
      console.error(`FAIL: CSV ${failure} failure must show an accessible retry message.`);
    }
    await page.unroute('**/api/export.csv?**');
    const retryDownload = page.waitForEvent('download');
    await page.locator('#btnExport').click();
    await (await retryDownload).saveAs(join(evidence, `csv-${failure}-retry.csv`));
    assert.equal(await page.getByRole('alert').filter({ hasText: /CSV/i }).isVisible(), false, `${failure}: a successful retry clears the failure message`);
  }
  console.log('CHECKED: HTTP and network export failures, successful retries and cleared notices.');

  // Revoke only the synthetic session, then let the real stats API reject it.
  const sessionToken = await page.evaluate(() => JSON.parse(sessionStorage.getItem('playfood-panel-session')).token);
  const revoked = await fetch(`${base}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}` } });
  assert.equal(revoked.status, 200);
  await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/stats' && response.status() === 401),
    page.locator('[data-preset="all"]').click(),
  ]);
  await page.locator('#login').waitFor({ state: 'visible' });
  try {
    const notice = page.getByRole('alert').filter({ hasText: /session.*ended/i });
    await notice.waitFor({ state: 'visible', timeout: 2000 });
    assert.match(await notice.innerText(), /sign in again/i);
    assert.doesNotMatch(await notice.innerText(), /inactiv/i, 'a server rejection does not establish inactivity');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('playfood-panel-session')), null);
    assert.equal(await page.locator('#whoami').isVisible(), false);
    await page.screenshot({ path: join(evidence, 'server-401-session-ended.png') });
  } catch (error) {
    feedbackFailures.push(`Server 401: ${error.message}`);
    console.error('FAIL: server 401 must explain that the session ended without claiming inactivity.');
  }
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#signin').click();
  await page.locator('#dashboard').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#btnExport').disabled);
  await page.locator('#signout').click();
  await page.locator('#login').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#loginError').isVisible(), false, 'ordinary logout has no expiry error');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('playfood-panel-session')), null);
  assert.deepEqual(feedbackFailures, [], 'panel feedback regressions');
  assert.deepEqual(errors, [], 'failed CSV requests must not cause unhandled page errors');
  console.log('PASS: accessible CSV retry feedback, successful retries, server-401 explanation and ordinary logout.');
  console.log(`Panel participation checks passed. Evidence: ${evidence}`);
} finally {
  await browser?.close();
  await server?.close();
  rmSync(temp, { recursive: true, force: true });
}
