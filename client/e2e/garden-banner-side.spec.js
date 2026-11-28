// Check the step banner and feedback toast against the text bounds and the touch controls.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';
import {
  loc, installRecorder, recordFrameAll, expectBannerClear, drawnBanner, stepMistakes, keyboardInput,
  canvasMeta, toCss, union, contains, overlaps, domObstacles, round2, cssFontPx,
} from './garden-progress-helpers.js';

const LANGS = ['el', 'en', 'nl', 'pt'];
const SHOTS = process.env.GARDEN_SHOTS;
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const SEASONS = ['winter', 'spring', 'summer', 'autumn'];

/** Every text the toast can show, per language (main lines × facts / notes). */
function toastTexts(L) {
  const G = L.garden; const S = L.season;
  const sub = (s, o) => s.replace(/{{(\w+)}}/g, (_, k) => o[k]);
  const main = [
    `⏳ ${G.water_lockout}`, `⚠️ ${G.wrong_tool_healthy}`, `⚠️ ${G.wrong_tool_wilted}`, `✅ ${G.correct_plant}`,
    `✓ ${G.already_planted_this_season}`, `🤚 ${G.drop_carry}`, `🪣 ${G.composted} +5`, '🌾 🥬 +10',
    G.phase_harvest, G.phase_water, G.water_round2, G.tool_swapped_basket, G.tool_swapped_bin,
    G.water_first_why, G.water_second_why, `✓ ${G.event.correct} +10`,
    ...SEASONS.map((s) => `🔄 ${sub(G.season_changed, { season: S[s] })}`),
    ...SEASONS.map((s) => `🔒 ${sub(G.wrong_corner_now, { season: S[s] })}`),
    ...SEASONS.map((s) => `🥀 🥬 ${sub(G.wrong_season_clear, { valid: SEASONS.filter((x) => x !== s).map((x) => S[x]).join(' / '), current: S[s] })}`),
    ...Object.keys(G.event).filter((k) => /_opt_/.test(k)).map((k) => `${G.event.wrong} ${G.event[k]}`),
  ].filter(Boolean);
  const notes = [G.msg.unhealthy_soil, G.msg.seedling_care, G.msg.growth_time, G.harvest_healthy_why,
    G.auto_drop_basket, G.auto_drop_bin, G.event.seed_choice_msg, G.event.pests_msg].filter(Boolean);
  return { main, notes, facts: G.facts || null, source: `${L.result.source_link} · ${G.press_s}` };
}

async function startRound(page, lang) {
  await bootMission(page, 'growing', 2, lang);
  await page.waitForTimeout(650); await pressEnter(page);
  await page.waitForFunction(() => { const s = document.querySelector('canvas')?._stateRef?.current; return s && !s.showMissionIntro && s.irisOpenness >= 1; });
}

/** HARVEST, every plot healthy, the compost bin in hand, the compost fact on the toast. */
async function hardScene(page, L) {
  await page.evaluate(async ({ composted, fact }) => {
    const s = document.querySelector('canvas')._stateRef.current;
    if (!fact) fact = (await import('/src/data/gardenData.js')).GARDEN_FACT_TEXTS.compost; // EN, as the app
    for (const p of s.plots) Object.assign(p, { seed: { id: 'cabbage', emoji: '🥬' }, wilted: false, health: 2, harvested: false });
    const top = Math.min(...s.plots.map((p) => p.row));
    const lw = s.plots.filter((p) => p.row === top + 1).sort((a, b) => a.col - b.col)[1];
    lw.harvested = true; // the last wilted plant, just composted
    const P = s.player; P.col = lw.col; P.row = lw.row + 1; P.pixelX = P.col * 32; P.pixelY = P.row * 32;
    P.fromX = P.pixelX; P.fromY = P.pixelY; P.toX = P.pixelX; P.toY = P.pixelY; P.moving = false; P.dir = 1;
    s.plantedCount = 8; s.phase = 'HARVEST'; s.carrying = { tool: 'compost' };
    s.feedbackText = `🪣 ${composted} +5`; s.feedbackEduText = fact; s.feedbackFactId = 'compost';
    s.feedbackColor = '#795548'; s.feedbackTimer = 999;
  }, { composted: L.garden.composted, fact: L.garden.facts?.compost ?? null });
  await page.waitForTimeout(400);
}

/** What the scene holds on screen, in CSS px: plots, player, carried tool, tool tiles. */
async function sceneObjects(page) {
  return page.evaluate(async () => {
    const gr = await import('/src/games/engine/gameRoomRenderer.js');
    const { GAME_ROOMS } = await import('/src/games/engine/gameRoomData.js');
    const { getGardenCarryAnchor } = await import('/src/games/engine/gardenCarryLayout.js');
    const ROOM = GAME_ROOMS.GardenPlanner; const TS = 32; const OX = 320; const OY = 112;
    const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect(); const h = cv.__hidpi;
    const fx = r.width / cv.width; const fy = r.height / cv.height;
    const box = (x0, y0, x1, y1) => { const a = gr.roomToCanvas(ROOM, x0, y0), b = gr.roomToCanvas(ROOM, x1, y1);
      return { l: r.left + (h.ox + h.k * a.x) * fx, t: r.top + (h.oy + h.k * a.y) * fy, r: r.left + (h.ox + h.k * b.x) * fx, b: r.top + (h.oy + h.k * b.y) * fy }; };
    const s = cv._stateRef.current; const P = s.player;
    const an = getGardenCarryAnchor({ x: OX + P.pixelX + TS / 2, y: OY + P.pixelY - 6, minTop: OY + TS + 8, fieldLeft: OX + TS, fieldRight: OX + TS + 18 * TS });
    return [
      ...s.plots.map((p) => ({ id: `plot ${p.season} ${p.col},${p.row}`, ...box(OX + p.col * TS + 5, OY + p.row * TS + 5, OX + p.col * TS + TS - 5, OY + p.row * TS + TS - 5) })),
      { id: 'player', ...box(OX + P.pixelX, OY + P.pixelY - 16, OX + P.pixelX + TS, OY + P.pixelY + TS) },
      { id: 'carried tool', ...box(an.x - 30, an.y - 50, an.x + 30, an.y + 4) },
      ...s.toolTiles.map((t) => ({ id: `tool tile ${t.tool}`, ...box(OX + t.col * TS, OY + t.row * TS - 28, OX + t.col * TS + TS, OY + t.row * TS + TS) })),
    ];
  });
}

/** The toast as drawn: its box, its text lines and the source pill. */
function drawnToast(texts, shapes) {
  const box = shapes.filter((x) => x.kind === 'path' && /255, 255, 255, 0\.97/.test(x.style)).pop();
  if (!box) return null;
  const after = shapes.filter((x) => x.seq > box.seq);
  const pill = after.find((x) => x.kind === 'path' && x.style.toLowerCase() === '#3c743b') || null;
  const end = after.find((x) => x.seq > (pill ? pill.seq : box.seq) && !(pill && x === pill));
  const lines = texts.filter((x) => x.seq > box.seq && (!end || x.seq < end.seq));
  return { box, pill, lines };
}

function toastParts(toast) {
  const beforeSource = toast.lines.filter((line) => !toast.pill || line.seq < toast.pill.seq);
  return {
    main: beforeSource.filter((line) => /^bold /.test(line.font)),
    fact: beforeSource.filter((line) => !/^bold /.test(line.font)),
    source: toast.pill ? toast.lines.filter((line) => line.seq > toast.pill.seq) : [],
  };
}
function expectToastReadable(meta, toast, label, floors = { main: 10.5, fact: 9.5, source: 9.5 }) {
  for (const [kind, lines] of Object.entries(toastParts(toast))) {
    for (const line of lines) expect(cssFontPx(meta, line), `${label}: ${kind} ≥ ${floors[kind]} CSS px`).toBeGreaterThanOrEqual(floors[kind] - 0.05);
  }
}

const strips = (page) => page.evaluate(async () => {
  const m = await import('/src/games/engine/gardenPlannerRenderer.js');
  const s = document.querySelector('canvas')._stateRef.current;
  return m.sideZones(s);
});

// ── 844×390: side strips ──────────────────────────────────────────────────────
for (const dpr of [1, 2]) for (const lang of LANGS) {
  test.describe(`844x390@${dpr}x ${lang}`, () => {
    test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: dpr });

    test(`walk from the bed to the centre path: whole banner and toast, nothing hidden — ${lang} @${dpr}x`, async ({ page }) => {
      const L = loc(lang);
      await installRecorder(page);
      await startRound(page, lang);
      await hardScene(page, L);
      const fact = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.feedbackEduText);
      const z = await strips(page);
      expect(z, 'side strips in use').toBeTruthy();
      const seen = [];
      const check = async (step) => {
        const label = `${lang} @${dpr}x ${step}`;
        const bannerBox = await expectBannerClear(page, L.garden.obj_swap_to_basket, label);
        const { texts, shapes } = await recordFrameAll(page);
        const meta = await canvasMeta(page);
        const t = drawnToast(texts, shapes);
        expect(t, `${label}: toast drawn`).toBeTruthy();
        const tBox = toCss(meta, t.box);
        const parts = toastParts(t);
        const main = parts.main.map((x) => x.s).join(' ');
        const edu = parts.fact.map((x) => x.s).join(' ');
        expect(main, `${label}: toast main line whole`).toBe(`🪣 ${L.garden.composted} +5`);
        expect(edu, `${label}: fact whole, not cut`).toBe(fact);
        expect(t.lines.some((x) => x.s.endsWith('…')), `${label}: no ellipsis`).toBe(false);
        expect(t.pill, `${label}: source pill drawn`).toBeTruthy();
        expect(parts.source.map((x) => x.s).join(' '), `${label}: source label`).toBe(`${L.result.source_link} · ${L.garden.press_s}`);
        expectToastReadable(meta, t, label, { main: 13, fact: 12, source: 11 });
        for (const x of [...t.lines, t.pill]) expect(contains(tBox, toCss(meta, x)), `${label}: "${x.s || 'pill'}" inside the toast`).toBe(true);
        for (const o of await domObstacles(page)) expect(overlaps(tBox, o), `${label}: toast clear of ${o.id}`).toBe(false);
        expect(tBox.l, `${label}: toast inside viewport`).toBeGreaterThanOrEqual(-0.5);
        expect(tBox.r).toBeLessThanOrEqual(meta.vw + 0.5);
        expect(tBox.t).toBeGreaterThanOrEqual(meta.bar.b + 5.5);
        // the two strips: banner left of the garden, toast right of it
        expect(bannerBox.r, `${label}: banner left of the garden`).toBeLessThan(tBox.l);
        for (const o of await sceneObjects(page)) {
          expect(overlaps(bannerBox, o), `${label}: ${o.id} not under the banner`).toBe(false);
          expect(overlaps(tBox, o), `${label}: ${o.id} not under the toast`).toBe(false);
        }
        seen.push(await page.evaluate(() => { const p = document.querySelector('canvas')._stateRef.current.player; return [p.col, p.row]; }));
      };
      await check('at the bed');
      // real walking: down off the bed, then right to the centre path
      // one real short key tap per step; wait until the avatar lands, then check again
      const pos = () => page.evaluate(() => { const p = document.querySelector('canvas')._stateRef.current.player; return `${p.col},${p.row}`; });
      const walk = async (key, n) => {
        for (let i = 0; i < n; i++) {
          // a short tap (≈ one tile); a tap the game missed is simply repeated by the loop below
          await page.keyboard.down(key); await page.waitForTimeout(110); await page.keyboard.up(key);
          await page.waitForFunction(() => !document.querySelector('canvas')._stateRef.current.player.moving, null, { timeout: 5000 });
          await check(`${key} ${i + 1}`);
        }
      };
      // to the centre path (row 8, columns 9–10): down off the bed, then right
      const at = async () => (await pos()).split(',').map(Number);
      for (let i = 0; i < 20; i++) { const [, r] = await at(); if (r === 8) break; await walk(r < 8 ? 'ArrowDown' : 'ArrowUp', 1); }
      for (let i = 0; i < 20; i++) { const [c] = await at(); if (c >= 9) break; await walk('ArrowRight', 1); }
      const [endCol, endRow] = await at();
      expect([endCol >= 9, endRow], 'the player really walked to the centre path').toEqual([true, 8]);
      const tiles = new Set(seen.map((p) => p.join(',')));
      expect(tiles.size, 'checked on the way, on several tiles').toBeGreaterThanOrEqual(6);
      console.log('WALK', lang, dpr, JSON.stringify(seen));
      await shot(page, `side_844_${lang}_${dpr}x_path`);
    });

    test(`every banner text and every toast fits its strip, uncut — ${lang} @${dpr}x`, async ({ page }) => {
      const L = loc(lang);
      await installRecorder(page);
      await startRound(page, lang);
      const objs = Object.entries(L.garden).filter(([k]) => k.startsWith('obj_')).map(([, v]) => v);
      const T = toastTexts(L);
      const res = await page.evaluate(async ({ objs, T }) => {
        const m = await import('/src/games/engine/gardenPlannerRenderer.js');
        const { GARDEN_FACT_TEXTS } = await import('/src/data/gardenData.js');
        const s = document.querySelector('canvas')._stateRef.current; const z = m.sideZones(s);
        const ctx = document.createElement('canvas').getContext('2d');
        const banner = objs.map((t) => { const L = m.objectiveBannerLayout(ctx, t, s.cssScale, z.left.x1 - z.left.x0);
          return { t, whole: L.lines.join(' ').replace(/\s+/g, ' ') === t.replace(/\s+/g, ' ') && L.lines.every((l) => t.includes(l)), fits: z.left.y0 + L.bh <= z.left.y1, w: L.bw <= z.left.x1 - z.left.x0, h: L.bh }; });
        const facts = Object.keys(GARDEN_FACT_TEXTS).map((id) => T.facts?.[id] ?? GARDEN_FACT_TEXTS[id]);
        const ids = Object.keys(GARDEN_FACT_TEXTS);
        const edus = [null, ...T.notes.map((e) => ({ e, src: false })), ...facts.map((e, i) => ({ e, src: true, id: ids[i] }))];
        const toast = []; const W = Math.floor(z.right.x1 - z.right.x0);
        for (const text of T.main) for (const ed of edus) {
          const L = m.feedbackToastLayout(ctx, { text, eduText: ed?.e ?? null, sourceLabel: ed?.src ? T.source : '' }, W, { capLines: false, cssScale: s.cssScale, maxHeight: z.right.y1 - z.right.y0 - 3 });
          toast.push({ text, edu: ed?.e ?? null, id: ed?.id ?? null, fits: z.right.y0 + L.fbH <= z.right.y1, whole: L.mainLines.join(' ') === text && (!ed || L.eduLines.join(' ') === ed.e), h: L.fbH });
        }
        return { banner, toast, room: { bannerH: z.left.y1 - z.left.y0, toastH: z.right.y1 - z.right.y0 } };
      }, { objs, T });
      for (const b of res.banner) {
        expect(b.whole, `${lang}: banner "${b.t}" whole`).toBe(true);
        expect(b.fits && b.w, `${lang}: banner "${b.t}" fits the left strip`).toBe(true);
      }
      for (const t of res.toast) {
        expect(t.whole, `${lang}: toast "${t.text}" + "${(t.edu || '').slice(0, 30)}" whole`).toBe(true);
        expect(t.fits, `${lang}: toast "${t.text}" + "${(t.edu || '').slice(0, 30)}" fits the right strip`).toBe(true);
      }
      const maxB = Math.max(...res.banner.map((b) => b.h)); const maxT = Math.max(...res.toast.map((t) => t.h));
      // and the tallest toast with a source pill, really drawn: whole, inside its strip, clear of the controls
      const worst = res.toast.filter((t) => t.id).sort((a, b) => b.h - a.h)[0];
      await page.evaluate(({ w }) => { const s = document.querySelector('canvas')._stateRef.current;
        s.feedbackText = w.text; s.feedbackEduText = w.edu; s.feedbackFactId = w.id; s.feedbackColor = '#2E7D32'; s.feedbackTimer = 999; }, { w: worst });
      await page.waitForTimeout(400);
      const { texts, shapes } = await recordFrameAll(page);
      const meta = await canvasMeta(page);
      const t = drawnToast(texts, shapes);
      const tBox = toCss(meta, t.box);
      expect(toastParts(t).main.map((x) => x.s).join(' '), `${lang}: tallest toast main whole`).toBe(worst.text);
      expect(toastParts(t).fact.map((x) => x.s).join(' '), `${lang}: tallest toast fact whole`).toBe(worst.edu);
      expect(t.pill, `${lang}: tallest toast source pill`).toBeTruthy();
      expect(toastParts(t).source.map((x) => x.s).join(' '), `${lang}: tallest toast source whole`).toBe(T.source);
      expectToastReadable(meta, t, `${lang}: tallest toast`);
      for (const x of [...t.lines, t.pill]) expect(contains(tBox, toCss(meta, x)), `${lang}: "${x.s || 'pill'}" inside`).toBe(true);
      for (const o of await domObstacles(page)) expect(overlaps(tBox, o), `${lang}: tallest toast clear of ${o.id}`).toBe(false);
      await shot(page, `side_844_${lang}_${dpr}x_tallest_toast`);
      console.log('FIT', lang, dpr, JSON.stringify({ banners: res.banner.length, toasts: res.toast.length, maxBannerH: round2(maxB), leftH: round2(res.room.bannerH), maxToastH: round2(maxT), rightH: round2(res.room.toastH) }));
    });

    test(`banner and toast hidden under the intro, a question card and the run-lost card — ${lang} @${dpr}x`, async ({ page }) => {
      test.setTimeout(180_000);
      await installRecorder(page);
      await bootMission(page, 'growing', 2, lang);
      const none = async (what) => {
        const { texts, shapes } = await recordFrameAll(page);
        expect(drawnBanner(texts, shapes), `${lang}: no banner under ${what}`).toBeNull();
        expect(drawnToast(texts, shapes), `${lang}: no toast under ${what}`).toBeNull();
      };
      // intro card is up at boot; give the hidden banner a toast that would show
      await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; s.feedbackText = 'x'; s.feedbackTimer = 999; });
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro)).toBeTruthy();
      await none('the intro');
      // real play until the first question card (autumn), then until the run-lost card
      await page.evaluate(() => { window.__plan = ['R', 'W', 'W', 'W', 'W']; });
      const input = keyboardInput(page);
      let sawEvent = false;
      for (let i = 0; i < 600; i++) {
        const st = await page.evaluate(() => { const s = document.querySelector('canvas')._stateRef.current; return { ev: !!s.decisionEvent && !s.decisionEvent.answered, lost: !!s.runLost }; });
        if (st.ev && !sawEvent) { sawEvent = true; await page.waitForTimeout(300); await none('a question card'); }
        if (st.lost) break;
        const a = await page.evaluate(stepMistakes);
        if (a.act === 'lost') break;
        if (a.act === 'enter') await input.enter(); else await page.waitForTimeout(a.ms || 100);
      }
      expect(sawEvent, 'a question card came up').toBe(true);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => !!document.querySelector('canvas')._stateRef.current.runLost)).toBe(true);
      await none('the run-lost card');
    });
  });
}

// ── 1024×768 / 1366×768: centred, wider ───────────────────────────────────────
for (const [w, h] of [[1024, 768], [1366, 768]]) for (const lang of LANGS) {
  test(`${w}x${h}: banner ≥ 13 CSS px under the bar, toast under it, every fact whole — ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const L = loc(lang);
    await installRecorder(page);
    await startRound(page, lang);
    expect(await strips(page), 'no side strips at this size').toBeNull();
    await hardScene(page, L);
    const bannerBox = await expectBannerClear(page, L.garden.obj_swap_to_basket, `${lang} ${w}x${h}`);
    const { texts, shapes } = await recordFrameAll(page);
    const meta = await canvasMeta(page);
    const t = drawnToast(texts, shapes);
    const tBox = toCss(meta, t.box);
    expect(Math.abs((bannerBox.l + bannerBox.r) / 2 - meta.vw / 2), 'banner centred').toBeLessThan(2);
    expect(tBox.t, 'toast below the banner').toBeGreaterThanOrEqual(bannerBox.b - 0.5);
    expect(toastParts(t).fact.map((x) => x.s).join(' '), 'fact whole').toBe(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.feedbackEduText));
    for (const o of await domObstacles(page)) expect(overlaps(tBox, o), `toast clear of ${o.id}`).toBe(false);
    // every fact and note, every main line: whole at the centred width (the old 4-line cap never bites)
    const T = toastTexts(L);
    const cut = await page.evaluate(async ({ T }) => {
      const m = await import('/src/games/engine/gardenPlannerRenderer.js');
      const { GARDEN_FACT_TEXTS } = await import('/src/data/gardenData.js');
      const ctx = document.createElement('canvas').getContext('2d');
      const facts = Object.keys(GARDEN_FACT_TEXTS).map((id) => T.facts?.[id] ?? GARDEN_FACT_TEXTS[id]);
      const out = [];
      for (const e of [...T.notes, ...facts]) {
        const L = m.feedbackToastLayout(ctx, { text: T.main[0], eduText: e, sourceLabel: T.source }, 440, { capLines: true });
        if (L.eduLines.join(' ') !== e) out.push(e);
      }
      for (const text of T.main) {
        const L = m.feedbackToastLayout(ctx, { text }, 440, { capLines: true });
        if (L.mainLines.join(' ') !== text) out.push(text);
      }
      return out;
    }, { T });
    expect(cut, `${lang}: texts cut at the centred width`).toEqual([]);
    console.log('CENTRED', lang, w, JSON.stringify({ banner: Object.fromEntries(Object.entries(bannerBox).map(([k, v]) => [k, round2(v)])), toast: Object.fromEntries(Object.entries(tBox).map(([k, v]) => [k, round2(v)])), font: round2(cssFontPx(meta, drawnBanner(texts, shapes).lines[0])) }));
    await shot(page, `centred_${w}_${lang}`);
  });
}
