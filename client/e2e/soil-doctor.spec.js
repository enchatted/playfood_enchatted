import { test, expect } from '@playwright/test';
import { bootMission, driveToResult, pressEnter } from './helpers.js';

/**
 * 1.3 "Soil Doctor" (CHALLENGE) — interaction critical path.
 *
 * For each ailing plot: INSPECT it (Enter while empty-handed → diagnosis card),
 * GRAB the correct natural remedy from its station (Enter), then APPLY it on the
 * plot (Enter) → heal beat (+25, +5 study bonus). Heal all 4 → win. We never
 * touch the chemical trap, so soil health stays full and the run passes.
 */

function stepSoilDoctor() {
  const TS = 32, DIR_UP = 1;
  const cv = document.querySelector('canvas');
  const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };

  const face = (tile) => {
    const p = st.player;
    p.col = tile.col; p.row = tile.row + 1;
    p.pixelX = p.col * TS; p.pixelY = p.row * TS;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
  };

  if (st.showMissionIntro) return { act: 'enter' };          // mission intro
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
  if (st.reveal) return { act: 'enter' };                    // heal / masked / win reveal
  if (st.diagnosisCard) return { act: 'enter' };             // dismiss diagnosis card
  if ((st.pendingRevealTimer || 0) > 0) return { act: 'wait', ms: 200 };

  const plot = st.plots.find((p) => !p.healed);
  if (!plot) return { act: 'wait', ms: 150 };

  const carrying = st.carrying; // SoilDoctor carries a remedy KEY string (or null)
  if (!carrying) {
    if (!plot.diagnosed) { face(plot.tiles[0]); return { act: 'enter' }; } // inspect
    const station = st.stations.find((s) => s.key === plot.neededRemedy);
    face(station.tiles[0]); return { act: 'enter' };                       // grab remedy
  }
  if (carrying === plot.neededRemedy) { face(plot.tiles[0]); return { act: 'enter' }; } // apply
  // Carrying the wrong remedy → grab the correct one (swap).
  const station = st.stations.find((s) => s.key === plot.neededRemedy);
  face(station.tiles[0]); return { act: 'enter' };
}

test('1.3 Soil Doctor — inspect, treat all 4 plots, reach a healthy win', async ({ page }) => {
  await bootMission(page, 'growing', 3);

  const nav = await driveToResult(page, stepSoilDoctor);

  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('result');
  expect(nav.passed).toBe(true);
  expect(nav.healed).toBe(4);
  expect(nav.chemicalUses).toBe(0);
  // Clean run = perfect tier → 3⭐ on the result screen + persisted for the lighthouse.
  expect(nav.stars).toBe(3);
  expect(await page.evaluate(() => window.__playfood.state().gameStars['growing:SoilDoctor'])).toBe(3);
});

test('every heal card ends with the soil → plants → food line', async ({ page }) => {
  await bootMission(page, 'growing', 3, 'el');
  const seen = [];
  for (let i = 0; i < 400; i++) {
    const reveal = await page.evaluate(() => {
      const r = document.querySelector('canvas')?._stateRef?.current?.reveal;
      return r && r.lead ? { lead: r.lead, takeaway: r.takeaway || null } : null;
    });
    if (reveal) seen.push(reveal); // heal cards are the only reveals with a lead line
    const action = await page.evaluate(stepSoilDoctor);
    if (action.act === 'done') break;
    if (action.act === 'enter') await pressEnter(page);
    else await page.waitForTimeout(action.ms || 100);
  }
  expect(seen.length).toBeGreaterThan(0);
  for (const card of seen) expect(card.takeaway).toBe('🌱 Υγιές χώμα → δυνατά φυτά → πιο θρεπτική τροφή');
});
