// A/B control copy + real on-screen B in Compost Creator, Leftover Chef and Season Matcher.
// Genuine touch events (CDP Input.dispatchTouchEvent) on the visible A/B buttons; tablet-touch
// project. The prompts name both the key and the on-screen button that does the same thing.
import { test, expect } from '@playwright/test';
import { bootMission } from './helpers.js';

// a touch device: the on-screen controls only show with a finger-type pointer
test.use({ hasTouch: true });

const st = (page, src, a) => page.evaluate(([s, arg]) => new Function('s', 'a', s)(document.querySelector('canvas')._stateRef.current, arg), [src, a]);
const TP = `const TS=32;const p=s.player;p.col=a.col;p.row=a.row;p.pixelX=p.col*TS;p.pixelY=p.row*TS;p.fromX=p.pixelX;p.fromY=p.pixelY;p.toX=p.pixelX;p.toY=p.pixelY;p.moving=false;p.moveTimer=0;p.dir=a.dir;`;
const FACE_ING = `const it=s.counterItems.find(c=>c.id===a&&!c.picked);const TS=32;const p=s.player;p.col=it.col<10?it.col+1:it.col-1;p.row=it.row;p.pixelX=p.col*TS;p.pixelY=p.row*TS;p.fromX=p.pixelX;p.fromY=p.pixelY;p.toX=p.pixelX;p.toY=p.pixelY;p.moving=false;p.moveTimer=0;p.dir=it.col<10?2:3;`;

async function tap(page, key) {
  const box = await page.locator(`[data-touch-control="true"][data-key="${key}"]`).boundingBox();
  expect(box, `on-screen ${key} button`).toBeTruthy();
  const client = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(90);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
}
async function startWithA(page, ctaText) {
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.showMissionIntro);
  expect(await st(page, 'return s.missionIntro.cta;')).toBe(ctaText);
  for (let i = 0; i < 20; i++) {
    const r = await st(page, 'return {i:s.showMissionIntro, o:s.irisOpenness};');
    if (!r.i && r.o >= 1) return;
    if (r.i) await tap(page, 'Enter'); else await page.waitForTimeout(150);
  }
  throw new Error('intro did not close with A');
}

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1024, height: 768 }); });

test('Season Matcher — A adds to the cart, B returns the last item before paying (el)', async ({ page }) => {
  await bootMission(page, 'local', 1, 'el');
  await startWithA(page, 'Πάτησε Enter, Space ή το κουμπί A στην οθόνη για να ξεκινήσεις');
  const foods = await st(page, 'return s.foods.filter(f=>!f.taken).slice(0,2).map(f=>({col:f.col,row:f.row,id:f.id}));');
  await st(page, TP, { col: foods[0].col, row: foods[0].row + 1, dir: 1 });
  await expect.poll(() => st(page, 'return s.actionPrompt;')).toContain('κουμπί A στην οθόνη');
  for (const f of foods) { await st(page, TP, { col: f.col, row: f.row + 1, dir: 1 }); await page.waitForTimeout(150); await tap(page, 'Enter'); }
  expect(await st(page, 'return s.cart.map(c=>c.id);')).toEqual(foods.map((f) => f.id));
  await tap(page, 'q');
  expect(await st(page, 'return s.cart.map(c=>c.id);')).toEqual([foods[0].id]);
  expect(await st(page, 'return s.foods.find(f=>f.id===a).taken;', foods[1].id)).toBe(false);
  await st(page, TP, { col: 5, row: 9, dir: 0 });
  await expect.poll(() => st(page, 'return s.actionPrompt;')).toMatch(/Καρότσι: 1 · .*κουμπί A στην οθόνη.*πληρωμή/);
  // keyboard Q = same action; hold it until the game loop has seen it
  await page.keyboard.down('q');
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.cart.length === 0);
  await page.keyboard.up('q');
});

test('Compost Creator — prompts name A/B; B puts the held item back (en)', async ({ page }) => {
  await bootMission(page, 'circular', 1, 'en');
  await startWithA(page, 'Press Enter, Space or the A button on screen to start');
  const it = await st(page, 'const i=s.counterItems.find(c=>!c.picked);return {col:i.col,row:i.row,id:i.id};');
  await st(page, TP, { col: it.col, row: it.row + 1, dir: 1 });
  await expect.poll(() => st(page, 'return s.actionPrompt;')).toContain('the A button on screen to pick up');
  await tap(page, 'Enter');
  await st(page, TP, { col: 3, row: 4, dir: 1 });
  await expect.poll(() => st(page, 'return [s.actionPrompt, s.dropPrompt];')).toEqual([
    expect.stringContaining('the A button on screen to place in'),
    'Press Q or the B button on screen to put it back',
  ]);
  await tap(page, 'q');
  expect(await st(page, 'return {h:s.heldItem, p:s.counterItems.find(c=>c.id===a).picked};', it.id)).toEqual({ h: null, p: false });
});

test('Leftover Chef — B puts back, then undoes the last pot item; prompts name A/B (en)', async ({ page }) => {
  await bootMission(page, 'foodwaste', 3, 'en');
  await startWithA(page, 'Press Enter, Space or the A button on screen to start');
  const g = await st(page, 'return s.goals[0].atRisk;');
  await st(page, FACE_ING, g[0]);
  await expect.poll(() => st(page, 'return s.actionPrompt;')).toContain('the A button on screen to pick up');
  await tap(page, 'Enter');
  await expect.poll(() => st(page, 'return s.dropPrompt;')).toBe('Press Q or the B button on screen to put it back');
  await tap(page, 'q');
  expect(await st(page, 'return s.heldItem;')).toBeNull();
  await st(page, FACE_ING, g[0]); await page.waitForTimeout(150); await tap(page, 'Enter');
  await st(page, TP, { col: 9, row: 8, dir: 1 }); await page.waitForTimeout(150); await tap(page, 'Enter');
  expect(await st(page, 'return s.potItems.map(i=>i.id);')).toEqual([g[0]]);
  await expect.poll(() => st(page, 'return s.dropPrompt;')).toBe('Press Q or the B button on screen to return the last pot ingredient');
  await tap(page, 'q');
  expect(await st(page, 'return {n:s.potItems.length, p:s.counterItems.find(c=>c.id===a).picked};', g[0])).toEqual({ n: 0, p: false });
});
