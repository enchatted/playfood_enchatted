// Check when harvest tools are offered and how the player swaps, drops and picks them up.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';
import {
  BASKET_FACE, BIN_FACE, TIE_STANCES, WILTED_FACE, HEALTHY_FACE,
  installGardenRecorder, frame, gs, dismissIntro, mixedHarvest, place, drawnAvailability, readScore, drawnLines,
} from './garden-tool-helpers.js';

const LANGS = ['el', 'en', 'nl', 'pt'];
const SHOTS = process.env.GARDEN_SHOTS;
const loc = (lang) => JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')).garden;
const press = async (page, key) => { await page.keyboard.down(key); await page.waitForTimeout(90); await page.keyboard.up(key); await page.waitForTimeout(250); };
const POINTS_WILTED = 5; const POINTS_HEALTHY = 20; // GardenPlanner.jsx

async function boot(page, lang) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await installGardenRecorder(page);
  await bootMission(page, 'growing', 2, lang);
  await dismissIntro(page);
}

for (const lang of LANGS) {
  test(`after the last compost: bin not offered nor lit, basket continues to the result — ${lang}`, async ({ page }) => {
    await boot(page, lang);
    const L = loc(lang);
    // baseline: empty hands, both tools have work → two halos (basket above bin), two popups
    await mixedHarvest(page, null);
    await place(page, WILTED_FACE);
    const both = drawnAvailability(await frame(page));
    expect(both.popups, 'both tools lit while both have work').toEqual(['🌾', '🪣'].sort());
    const haloY = [...new Set((await frame(page)).a.filter((a) => a.rad >= 15.9 && a.rad <= 18.1 && /rgba\(46,\s*125,\s*50/.test(a.stroke)).map((a) => Math.round(a.y)))].sort((p, q) => p - q);
    expect(haloY.length, `two distinct halos ${haloY}`).toBe(2);
    const [basketY, binY] = haloY;

    // the child holds the bin and composts the last wilted plant
    await mixedHarvest(page, 'compost');
    await place(page, WILTED_FACE);
    await pressEnter(page); await page.waitForTimeout(300);
    let s = await gs(page);
    expect(s.carrying, 'bin returned automatically').toBeNull();
    const after = await frame(page);
    const av = drawnAvailability(after);
    expect(av.popups, 'only the basket is shown as available').toEqual(['🌾']);
    const halos = [...new Set(after.a.filter((a) => a.rad >= 15.9 && a.rad <= 18.1 && /rgba\(46,\s*125,\s*50/.test(a.stroke)).map((a) => Math.round(a.y)))];
    expect(halos.length, 'one halo').toBe(1);
    expect(Math.abs(halos[0] - basketY), 'the halo is the basket, not the bin').toBeLessThan(Math.abs(halos[0] - binY));

    // the reported action: Enter on the bin → nothing (no pickup, no prompt, no ring)
    await place(page, BIN_FACE);
    s = await gs(page);
    expect(s.prompt, 'no prompt at the empty bin').toBeNull();
    expect(s.target).toBeNull();
    await pressEnter(page); await page.waitForTimeout(250);
    expect((await gs(page)).carrying, 'the empty bin cannot be taken again').toBeNull();

    // basket → healthy plant → result, without restart
    await place(page, BASKET_FACE);
    expect((await gs(page)).prompt, 'basket prompt').toBe(L.press_to_interact);
    await pressEnter(page); await page.waitForTimeout(250);
    expect((await gs(page)).carrying).toBe('harvest');
    await place(page, HEALTHY_FACE);
    await pressEnter(page);
    await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result', null, { timeout: 15_000 });
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${lang}_result.png` }); }
  });

  test(`swap in one press, both ways, Enter and Space; held/repeated press = one action; swap / drop / pickup score nothing (real score, calibrated) — ${lang}`, async ({ page }) => {
    await boot(page, lang);
    const L = loc(lang);
    // CALIBRATE the score reader with a real scoring action: one compost = +5 exactly
    await mixedHarvest(page, 'compost');
    await page.evaluate(() => { // a second wilted plot, so the bin stays in hand after composting
      Object.assign(document.querySelector('canvas')._stateRef.current.plots.find((p) => p.col === 2 && p.row === 2), { health: 0, wilted: true, harvested: false });
    });
    const score0 = await readScore(page);
    expect(typeof score0, 'numeric score read').toBe('number');
    await place(page, { col: 2, row: 1, dir: 0 });
    await pressEnter(page); await page.waitForTimeout(300);
    const score1 = await readScore(page);
    expect(score1 - score0, 'calibration: one compost adds exactly +5').toBe(POINTS_WILTED);
    expect((await gs(page)).carrying, 'bin still in hand (one wilted left)').toBe('compost');

    await place(page, BASKET_FACE);
    let s = await gs(page);
    expect(s.prompt, 'the basket answers while holding the bin').toBe(L.press_to_interact);
    expect(s.target).toEqual({ col: 18, row: 7 });
    const before = { ...s };

    // HELD Enter: sample carrying every frame — exactly one transition compost → harvest
    await page.evaluate(() => {
      window.__seq = []; const tick = () => { const c = document.querySelector('canvas')?._stateRef?.current?.carrying?.tool || null; if (window.__seq[window.__seq.length - 1] !== c) window.__seq.push(c); if (window.__sampling) requestAnimationFrame(tick); };
      window.__sampling = true; tick(); // seed synchronously, before the key goes down
    });
    await page.keyboard.down('Enter'); await page.waitForTimeout(700); await page.keyboard.up('Enter');
    await page.waitForTimeout(150);
    const seq = await page.evaluate(() => { window.__sampling = false; return window.__seq; });
    expect(seq, `held Enter swaps once: ${JSON.stringify(seq)}`).toEqual(['compost', 'harvest']);
    s = await gs(page);
    expect(s.toast).toBe(L.tool_swapped_basket);
    // repeated press on the same tile: no second action (the basket is already in hand)
    await press(page, 'Enter');
    expect((await gs(page)).carrying).toBe('harvest');
    // nothing scored or flagged by the swap
    s = await gs(page);
    for (const k of ['healthyHarvests', 'wrongToolCount', 'harvested', 'phase']) expect(s[k], k).toEqual(before[k]);
    expect(await readScore(page), 'score unchanged by the held + repeated Enter swap').toBe(score1);
    // the swap message is drawn whole on the canvas
    const fr = await frame(page);
    expect(fr.t.some((x) => x.s === L.tool_swapped_basket || x.s.includes(L.tool_swapped_basket)), 'swap message drawn').toBe(true);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${lang}_swap_to_basket.png` }); }

    // SPACE: basket → bin
    await place(page, BIN_FACE);
    expect((await gs(page)).prompt).toBe(L.press_to_interact);
    await press(page, ' ');
    s = await gs(page);
    expect(s.carrying, 'Space swaps to the bin').toBe('compost');
    expect(s.toast).toBe(L.tool_swapped_bin);
    for (const k of ['healthyHarvests', 'wrongToolCount', 'harvested']) expect(s[k], k).toEqual(before[k]);
    expect(await readScore(page), 'score unchanged by the Space swap').toBe(score1);
    // Q drop: no points either; then take the bin back (plain pickup) to continue
    await press(page, 'q');
    expect((await gs(page)).carrying, 'Q drops').toBeNull();
    expect(await readScore(page), 'score unchanged by the Q drop').toBe(score1);
    await pressEnter(page); await page.waitForTimeout(250);
    expect((await gs(page)).carrying, 'bin taken again (it still has work)').toBe('compost');
    expect(await readScore(page), 'score unchanged by the pickup').toBe(score1);
    // and the swapped tool really works: compost the wilted plant (+5 again), then the basket (+20)
    await place(page, WILTED_FACE);
    await pressEnter(page); await page.waitForTimeout(300);
    expect((await gs(page)).harvested).not.toEqual(before.harvested);
    expect(await readScore(page), 'compost after the swaps scores normally').toBe(score1 + POINTS_WILTED);
  });

  test(`tie between the two usable tools: no action, a visible hint — ${lang}`, async ({ page }) => {
    await boot(page, lang);
    const L = loc(lang);
    await mixedHarvest(page, null);
    for (const st of TIE_STANCES) {
      await place(page, st);
      let s = await gs(page);
      expect(s.prompt, 'no prompt in a tie').toBeNull();
      expect(s.target, 'no ring in a tie').toBeNull();
      expect(s.tie, 'tie hint').toBe(L.tool_tie);
      const fr = await frame(page);
      const hint = fr.t.find((x) => x.s === L.tool_tie);
      expect(hint, 'hint drawn whole').toBeTruthy();
      expect(hint.l >= 0 && hint.r <= hint.cw && hint.top >= 0 && hint.bot <= hint.ch, 'hint inside the canvas').toBe(true);
      expect(fr.t.some((x) => x.s === '↵' && Math.abs(x.y - hint.y) < 30), 'no ↵ icon next to the hint').toBe(false);
      await pressEnter(page); await page.waitForTimeout(250);
      s = await gs(page);
      expect(s.carrying, 'Enter in a tie does nothing').toBeNull();
      if (SHOTS && st.col === 17) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${lang}_tie.png` }); }
    }
    // one usable tool left → the same stance answers, no hint
    await page.evaluate(() => { document.querySelector('canvas')._stateRef.current.plots.find((p) => p.col === 3 && p.row === 2).harvested = true; });
    await place(page, TIE_STANCES[1]);
    const s = await gs(page);
    expect(s.tie).toBeNull();
    expect(s.prompt).toBe(L.press_to_interact);
    expect(s.target).toEqual({ col: 18, row: 7 });
  });

  test(`instructions match the controls; Q still drops — ${lang}`, async ({ page }) => {
    await boot(page, lang);
    const L = loc(lang);
    // carrying the bin with nothing left for it (only reachable by injection now): the objective
    await mixedHarvest(page, 'compost');
    await page.evaluate(() => { document.querySelector('canvas')._stateRef.current.plots.find((p) => p.col === 3 && p.row === 2).harvested = true; });
    await place(page, BASKET_FACE);
    const fr = await frame(page);
    const obj = drawnLines(fr, L.obj_swap_to_basket); // may wrap (12/10)
    expect(obj, 'swap objective drawn whole').toBeTruthy();
    for (const x of obj) expect(x.l >= 0 && x.r <= x.cw, 'objective inside the canvas').toBe(true);
    for (const k of ['obj_swap_to_basket', 'obj_swap_to_compost']) {
      expect(L[k]).not.toMatch(/\bQ\b/);
      expect(L[k]).toMatch(/Enter/); expect(L[k]).toMatch(/\bA\b/);
    }
    // and what it says works: one press at the basket swaps
    await pressEnter(page); await page.waitForTimeout(250);
    expect((await gs(page)).carrying).toBe('harvest');
    // Q still drops (with its message)
    await press(page, 'q');
    const s = await gs(page);
    expect(s.carrying).toBeNull();
    expect(s.toast).toContain(L.drop_carry);
  });

  test(`planting and watering unchanged; a carried seed is never lost at the tools — ${lang}`, async ({ page }) => {
    await boot(page, lang);
    // PLANT with a seed in hand, at the basket and at the bin: Enter keeps the seed
    await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; s.carrying = { seed: { id: 'cabbage', emoji: '🥬', marker: 'C', name: 'x', validSeasons: ['winter'] } }; });
    for (const st of [BASKET_FACE, BIN_FACE]) {
      await place(page, st);
      const s0 = await gs(page);
      expect(s0.phase).toBe('PLANT');
      expect(s0.prompt).toBeNull();
      await pressEnter(page); await page.waitForTimeout(250);
      expect((await gs(page)).carrying, 'seed kept').toBe('seed');
    }
    // WATER: the can is offered empty-handed; harvest tools are not
    await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; s.carrying = null; s.phase = 'WATER'; s.waterRound = 1; for (const p of s.plots) Object.assign(p, { seed: { id: 'cabbage' }, health: 0, wilted: false, harvested: false }); });
    await place(page, BASKET_FACE);
    expect((await gs(page)).prompt, 'no harvest tool while watering').toBeNull();
    await pressEnter(page); await page.waitForTimeout(250);
    expect((await gs(page)).carrying).toBeNull();
    await place(page, { col: 1, row: 8, dir: 1 });
    await pressEnter(page); await page.waitForTimeout(250);
    expect((await gs(page)).carrying, 'water can picked up').toBe('water');
  });
}
