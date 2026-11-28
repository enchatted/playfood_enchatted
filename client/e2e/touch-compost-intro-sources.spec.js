// Tap each source chip and check that it opens its own source.
import { test, expect } from '@playwright/test';
import { bootMission } from './helpers.js';

const SIZES = [{ width: 1024, height: 768 }, { width: 844, height: 390 }];

async function setup(page) {
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (u) => { window.__opened.push(String(u)); return null; };
    window.__ptypes = [];
    window.addEventListener('pointerdown', (e) => window.__ptypes.push(e.pointerType), true);
  });
}
// CSS (client) point of a canvas-logical point (1280×704): inverse of getCanvasPointer.
async function cssPoint(page, x, y) {
  return page.evaluate(([lx, ly]) => {
    const cv = document.querySelector('canvas'); const rect = cv.getBoundingClientRect();
    const h = cv.__hidpi; const dpr = cv.width / rect.width;
    if (!h) return { x: rect.left + lx * rect.width / 1280, y: rect.top + ly * rect.height / 704 };
    return { x: rect.left + (lx * h.k + h.ox) / dpr, y: rect.top + (ly * h.k + h.oy) / dpr };
  }, [x, y]);
}
async function touchTap(page, x, y) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(60);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
}
const centre = (r) => [r.x + r.width / 2, r.y + r.height / 2];

for (const size of SIZES) {
  test(`4.1 Compost intro sources — touch on each chip ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await setup(page);
    await bootMission(page, 'circular', 1, 'el');
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; return { pre: s.introPreSourceRect, src: s.introSourceRect }; });
    expect(r.pre).toBeTruthy(); expect(r.src).toBeTruthy();
    for (const key of ['introPreSourceRect', 'introSourceRect']) {
      // re-read: the first touch brings up the on-screen controls and the card makes room for them
      await page.waitForTimeout(300);
      const rect = await page.evaluate((k) => document.querySelector('canvas')._stateRef.current[k], key);
      const pt = await cssPoint(page, ...centre(rect));
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [pt.x, pt.y])).toBe('CANVAS');
      await touchTap(page, pt.x, pt.y);
    }
    expect(await page.evaluate(() => window.__opened.slice())).toEqual([
      'source.html?src=recycle-common-recyclables', 'source.html?src=composting-home',
    ]);
    const types = await page.evaluate(() => window.__ptypes.slice());
    expect(types.length).toBeGreaterThanOrEqual(2);
    expect(types.every((t) => t === 'touch'), `pointerType seen: ${types.join(',')}`).toBe(true);
    // the card stays up: a chip tap does not start the game
    expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro)).toBe(true);
  });
}

test('4.1 Compost intro sources — touch on a chip while paused opens nothing', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setup(page);
  await bootMission(page, 'circular', 1, 'el');
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; return { pre: s.introPreSourceRect, src: s.introSourceRect }; });
  await page.getByRole('button', { name: /Παύση/ }).click();
  await expect(page.getByRole('dialog', { name: 'Παύση' })).toBeVisible();
  for (const rect of [r.pre, r.src]) {
    const pt = await cssPoint(page, ...centre(rect));
    await touchTap(page, pt.x, pt.y);
  }
  expect(await page.evaluate(() => window.__opened.slice())).toEqual([]);
});
