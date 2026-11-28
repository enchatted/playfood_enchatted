// Measure every possible completed plan with the fonts used on the recap and score cards.
import { test, expect } from '@playwright/test';
test('recap card fits for every legal plan, every language', async ({ page }) => {
  test.setTimeout(160_000);
  await page.goto('/?testMode=1&lang=en');
  await page.waitForFunction(() => !!window.__playfood);
  const out = await page.evaluate(async () => {
    const MP = await import('/src/data/foodwaste.js');
    const { mealPlanRecap } = await import('/src/games/foodwaste/mealPlanRecap.js');
    const { buildMealPlanRecapText, buildMealPlanHowText } = await import('/src/games/foodwaste/mealPlanRecapText.js');
    const { getMealPlannerRecapLayout, getMealPlannerHowLayout } = await import('/src/games/engine/mealPlannerRenderer.js');
    const { MARKET_CAP } = await import('/src/games/foodwaste/mealPlannerCarry.js');
    await document.fonts.load("15px Inter"); await document.fonts.ready;
    const ctx = document.createElement('canvas').getContext('2d');
    const typesOf = { carb: 3, protein: 3, veg: 4, fruit: 4 };
    const multisets = (pool, k, from = 0) => (k === 0 ? [[]] : pool.slice(from).flatMap((id, i) => multisets(pool, k - 1, from + i).map((r) => [id, ...r])));
    const subsets = (pool) => pool.reduce((acc, id) => acc.concat(acc.map((s) => [...s, id])), [[]]);
    const empty = () => MP.PLATES.map((p) => ({ meal: p.meal, slots: p.sockets.map((type) => ({ type, item: null, source: null })) }));
    const plan = ({ home, market }) => { const pl = empty(); for (const [src, ids] of [['home', home], ['market', market]]) for (const id of ids) { const s = pl.flatMap((p) => p.slots).find((x) => x.type === MP.slotTypeOf(id) && !x.item); s.item = id; s.source = src; } return pl; };
    const res = {};
    for (const lang of ['el', 'en', 'nl', 'pt']) {
      const loc = await (await fetch(`/src/i18n/locales/${lang}.json`)).json();
      const tr = (key, vars = {}) => loc.meal_planner.recap[key].replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k]);
      let max = { h: 0 }; let maxHow = { h: 0 };
      const trh = (key, vars = {}) => loc.meal_planner.how[key].replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k]);
      for (const sc of MP.SCENARIOS) {
        const market = Object.values(sc.market).flat();
        const per = Object.entries(typesOf).map(([t, n]) => { const h = sc.homeInventory.filter((id) => MP.slotTypeOf(id) === t); const sh = [...new Set(market.filter((id) => MP.slotTypeOf(id) === t))]; return subsets(h).filter((x) => x.length <= n).flatMap((x) => multisets(sh, n - x.length).map((m) => ({ home: x, market: m }))); });
        let combos = [{ home: [], market: [] }]; for (const o of per) combos = combos.flatMap((c) => o.map((x) => ({ home: [...c.home, ...x.home], market: [...c.market, ...x.market] }))).filter((c) => c.market.length <= MARKET_CAP);
        const seen = new Set();
        for (const c of combos) {
          const r = mealPlanRecap(plan(c), sc);
          const v = buildMealPlanRecapText(r, { tr, nameOf: (id) => loc.foods[id], lang, seasonName: loc.season[sc.season], useFirst: loc.meal_planner.use_first });
          const hv = buildMealPlanHowText(r, { tr: trh, nameOf: (id) => loc.foods[id], lang, seasonName: loc.season[sc.season], useFirst: loc.meal_planner.use_first,
            axisNames: { sustainability: loc.meal_planner.axis_sustainability, waste: loc.meal_planner.axis_waste, nutrition: loc.meal_planner.axis_nutrition }, weights: MP.AXIS_WEIGHTS });
          if ([hv.title, hv.total, ...hv.sections.flatMap((x) => [x.heading, x.body])].some((x) => /\{\{|undefined|null|NaN/.test(x))) maxHow.badText = (maxHow.badText || 0) + 1;
          const HL = getMealPlannerHowLayout(ctx, hv);
          ctx.font = "14px 'Inter', system-ui, sans-serif"; // HOW_CARD.bodyFont, the font the lines were wrapped with
          for (const sec of HL.sections) for (const l of sec.lines) if (ctx.measureText(l.text).width > HL.textW + 0.5) maxHow.overflow = (maxHow.overflow || 0) + 1;
          if (HL.y + HL.height > maxHow.h) maxHow = { badText: maxHow.badText, overflow: maxHow.overflow, h: HL.y + HL.height, sc: sc.id, lines: HL.sections.map((x) => x.lines.length) };
          const key = v.paragraphs.map((p) => p.text).join('|'); if (seen.has(key)) continue; seen.add(key);
          const L = getMealPlannerRecapLayout(ctx, v);
          for (const p of L.paragraphs) for (const l of p.lines) if (ctx.measureText(l.text).width > L.textW + 0.5) max.overflow = (max.overflow || 0) + 1;
          if (L.y + L.height > max.h) max = { overflow: max.overflow, h: L.y + L.height, lines: L.paragraphs.map((p) => p.lines.length), sc: sc.id, texts: v.paragraphs.map((p) => p.text) };
        }
      }
      res[lang] = max; res[`${lang}_how`] = maxHow;
    }
    return res;
  });
  console.log('RECAP_FIT', JSON.stringify(out));
  for (const [lang, m] of Object.entries(out)) {
    expect(m.h, `${lang}: tallest card bottom`).toBeLessThanOrEqual(612 - 8);
    expect(m.overflow || 0, `${lang}: lines wider than the text width`).toBe(0);
    expect(m.badText || 0, `${lang}: unfilled placeholders`).toBe(0);
  }
});
