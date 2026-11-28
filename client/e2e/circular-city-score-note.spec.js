// Check that the result distinguishes correct deliveries from corrected mistakes.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { bootMission, driveToResult } from './helpers.js';

const LOC = Object.fromEntries(['el', 'en', 'nl', 'pt'].map((l) => [l,
  JSON.parse(fs.readFileSync(new URL(`../src/i18n/locales/${l}.json`, import.meta.url), 'utf8'))]));

function step() {
  const TS = 32, DIR_UP = 1;
  const HUB_COL = { repair: 3, share: 6, recycle: 9, compost: 12, landfill: 16 };
  const cv = document.querySelector('canvas'); const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };
  const stand = (col, row) => { const p = st.player; p.col = col; p.row = row; p.pixelX = col * TS; p.pixelY = row * TS; p.fromX = p.toX = p.pixelX; p.fromY = p.toY = p.pixelY; p.moving = false; p.moveTimer = 0; p.dir = DIR_UP; };
  if (st.showMissionIntro) return { act: 'enter' };
  if (st.reveal) return { act: 'enter' };
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
  const plan = window.__plan || {};
  if (st.carrying) {
    const res = st.resources.find((r) => r.id === st.carrying);
    const how = plan[st.resources.map((r) => r.id).indexOf(res.id)];
    if (how && !res.retried) {
      if (how === 'landfill') { stand(HUB_COL.landfill, 3); return { act: 'enter' }; }
      const wrong = Object.keys(HUB_COL).find((k) => k !== 'landfill' && k !== res.correctNode);
      stand(HUB_COL[wrong], 3); return { act: 'enter' };
    }
    stand(HUB_COL[res.correctNode], 3); return { act: 'enter' };
  }
  const res = st.resources.find((r) => !r.routed);
  if (res) { stand(res.tile.col, res.tile.row + 1); return { act: 'enter' }; }
  return { act: 'wait', ms: 150 };
}

const SCEN = {
  A: { plan: {}, firstTry: 8, tier: 'perfect', stars: 3 },
  B: { plan: { 0: 'hub' }, firstTry: 7, tier: 'great', stars: 2 },
  C: { plan: { 0: 'landfill' }, firstTry: 7, tier: 'great', stars: 2 },
  D: { plan: { 0: 'hub', 2: 'landfill', 4: 'hub', 6: 'landfill' }, firstTry: 4, tier: 'pass', stars: 1 },
  E: { plan: { 0: 'hub', 1: 'landfill', 2: 'hub', 3: 'landfill', 4: 'hub', 5: 'landfill', 6: 'hub', 7: 'landfill' }, firstTry: 0, tier: 'pass', stars: 1 },
};
const OTHER = (process.env.CC_NOTE_SIZES || '1920x1080,1280x720,1024x768,844x390').split(',').filter(Boolean)
  .map((s) => { const [w, h] = s.split('x').map(Number); return { width: w, height: h }; });
const CASES = [];
for (const lang of ['el', 'en', 'nl', 'pt']) {
  for (const sc of Object.keys(SCEN)) CASES.push({ lang, sc, size: { width: 1366, height: 768 } });
  for (const size of OTHER) if (!(size.width === 1366 && size.height === 768)) CASES.push({ lang, sc: 'D', size });
}
const SHOTS = process.env.CC_NOTE_SHOTS; // optional screenshot folder

for (const { lang, sc, size } of CASES) {
  test(`Circular City score note ${lang} ${sc} ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(200_000);
    const S = SCEN[sc]; const r = LOC[lang].circularcity.results;
    await page.setViewportSize(size);
    await bootMission(page, 'circular', 2, lang);
    await page.evaluate((p) => { window.__plan = p; }, S.plan);
    const nav = await driveToResult(page, step);

    // 1) scoring unchanged
    expect(nav).toMatchObject({ mission: 'CircularCity', score: 120, correct: 8, total: 8, leaks: 0,
      firstTryCount: S.firstTry, tier: S.tier, stars: S.stars });

    // 2) texts on the result screen
    const note = page.getByTestId('circular-score-note');
    await expect(note).toHaveText(r.score_note);
    const summaryText = r.summary.replace('{{correct}}', '8').replaceAll('{{total}}', '8').replace('{{firstTryCount}}', String(S.firstTry));
    const summary = page.getByText(summaryText, { exact: true });
    await expect(summary).toBeVisible();
    await expect(page.getByText(LOC[lang].result.your_score.replace('{{score}}', '120'), { exact: true })).toBeVisible();
    await expect(page.getByText(r[`tier_${S.tier}_title`], { exact: true })).toBeVisible();
    await expect(page.getByText(r[`tier_${S.tier}_body`], { exact: true })).toBeVisible();

    // 3) readable: counters, note and both nav buttons inside the viewport at the initial scroll position
    await page.evaluate(() => window.scrollTo(0, 0));
    const btns = page.locator('button', { hasText: new RegExp(`^(${LOC[lang].result.back_to_island}|${LOC[lang].result.back_to_map})$`) });
    await expect(btns).toHaveCount(2);
    const boxes = { summary: await summary.boundingBox(), note: await note.boundingBox(),
      btn0: await btns.nth(0).boundingBox(), btn1: await btns.nth(1).boundingBox() };
    for (const [k, b] of Object.entries(boxes)) {
      expect(b, k).toBeTruthy();
      expect(b.y, `${k} top`).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height, `${k} bottom`).toBeLessThanOrEqual(size.height);
      expect(b.x, `${k} left`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `${k} right`).toBeLessThanOrEqual(size.width);
    }
    const noteMetrics = await note.evaluate((el) => ({ fs: parseFloat(getComputedStyle(el).fontSize),
      clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
      lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)) }));
    expect(noteMetrics.fs).toBeGreaterThanOrEqual(12);
    expect(noteMetrics.clipped).toBe(false);
    // note sits under the counters and above the buttons
    expect(boxes.note.y).toBeGreaterThan(boxes.summary.y + boxes.summary.height - 1);
    expect(boxes.btn0.y).toBeGreaterThan(boxes.note.y + boxes.note.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.waitForTimeout(1500); /* card fade-in */ await page.screenshot({ path: `${SHOTS}/${lang}_${sc}_${size.width}x${size.height}_1_top.png` }); }

    // 4) learning goals and sources: reachable by scrolling and can be opened
    for (const key of ['result.learning_goals', 'result.sources_title']) {
      const label = key.split('.').reduce((o, k) => o[k], LOC[lang]);
      const sum = page.locator('summary', { hasText: label });
      await sum.scrollIntoViewIfNeeded();
      const b = await sum.boundingBox();
      expect(b.y).toBeGreaterThanOrEqual(-1); expect(b.y + b.height).toBeLessThanOrEqual(size.height + 1); // sub-pixel
      await sum.click();
      expect(await sum.evaluate((el) => el.parentElement.open), key).toBe(true);
      // the opened content can be scrolled to as well
      const body = sum.locator('xpath=following-sibling::*[1]');
      await body.scrollIntoViewIfNeeded();
      const bb = await body.boundingBox();
      expect(bb && bb.height > 0, `${key} content`).toBe(true);
      expect(bb.y).toBeLessThan(size.height); expect(bb.y + Math.min(bb.height, 20)).toBeGreaterThan(0);
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${lang}_${sc}_${size.width}x${size.height}_2_open.png` });
    test.info().annotations.push({ type: 'metrics', description: JSON.stringify({ lang, sc, size, nav, noteLines: noteMetrics.lines, noteFs: noteMetrics.fs, boxes }) });
  });
}
