/**
 * Automated documentation screenshots — onboarding → Island 1.
 *
 * WHY THIS IS DIFFERENT FROM A NORMAL E2E TEST:
 * PLAYFOOD renders entirely to a <canvas> with NO DOM overlays, so Playwright's
 * usual `page.click(selector)` cannot drive in-game navigation — there is nothing
 * in the DOM to click. Instead we steer the game through its Zustand store, which
 * dev-mode exposes on `window.__playfood` (see src/utils/testMode.js). We jump
 * screen-to-screen via the store's router and screenshot each stop.
 *
 * Run:  npm run test:e2e -- walkthrough_docs   (Vite dev server auto-boots)
 * Out:  0X_*.png screenshots in the SHOTS folder (see below)
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { bootMission, driveToResult, pressEnter, pressKey, holdEnter } from './helpers.js';
import { stepGardenPlanner } from './drivers/garden-planner-driver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Output folder, resolved from client/e2e to the repository root.
const SHOTS = path.resolve(__dirname, '../../docs/screenshots');
const LANG = 'en'; // English UI — this manual is for EU partners.
                   // Language MUST be set via the URL param (?lang=), which
                   // applies BEFORE the minigame mounts; a setLanguage() call
                   // after mount is too late (the game reads i18n at mount time).

/**
 * Wait until the test-mode API is live and the store reports the expected
 * screen, then let the canvas paint a few RAF frames before the screenshot.
 */
async function waitScreen(page, screen, settleMs = 800) {
  await page.waitForFunction(
    (s) => !!window.__playfood && window.__playfood.screen() === s,
    screen,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(settleMs); // let the RAF loop / iris-in finish painting
}

/** Drive navigation through the store (no DOM to click on a canvas game). */
async function nav(page, fn) {
  await page.evaluate(fn);
}

test.describe('Documentation screenshots — onboarding → Island 1', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SHOTS, { recursive: true });
  });

  test('capture the player journey up to Island 1', async ({ page }) => {
    // ── 1. Start screen (language selection) ──
    // ?testMode=1 installs window.__playfood; ?lang=el renders the Greek UI.
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await waitScreen(page, 'lang', 600);
    await page.screenshot({ path: path.join(SHOTS, '01_start.png') });

    // ── 2. Avatar selection ──
    await nav(page, () => window.__playfood.goToScreen('avatar'));
    await waitScreen(page, 'avatar', 800);
    await page.screenshot({ path: path.join(SHOTS, '02_avatar.png') });

    // ── 3. The Pier / Harbour ──
    // A hero must be chosen first (the avatar screen normally does this on
    // select), then we enter the harbour screen ('menu').
    await nav(page, () => {
      window.__playfood.state().setHero('braid');
      window.__playfood.goToScreen('menu');
    });
    await waitScreen(page, 'menu', 1200);
    await page.screenshot({ path: path.join(SHOTS, '03_pier.png') });

    // ── 4. The Archipelago / World Map ──
    await nav(page, () => window.__playfood.goToScreen('hub'));
    await waitScreen(page, 'hub', 1000);
    await page.screenshot({ path: path.join(SHOTS, '04_map.png') });

    // ── 5. Island 1 room (Growing) ──
    await nav(page, () => window.__playfood.goToIsland('growing'));
    await waitScreen(page, 'island', 1400);
    await page.screenshot({ path: path.join(SHOTS, '05_island1.png') });
  });

  // ── In-game gameplay screenshots — the 3 Island-1 minigames ──
  // These can't be reached by clicking (canvas has no DOM): we boot each
  // minigame straight into PLAYING via the test-mode URL (?startMission=...),
  // which routes through the same store API and forces English UI.
  const ISLAND1_GAMES = [
    { id: 1, file: '06_game1.png' }, // The Food's Journey
    { id: 2, file: '07_game2.png' }, // The Little Gardener
    { id: 3, file: '08_game3.png' }, // Earth Doctor
  ];

  for (const g of ISLAND1_GAMES) {
    test(`capture Island 1 gameplay — mission ${g.id}`, async ({ page }) => {
      // Force English explicitly (belt-and-braces over the ?lang= param).
      await page.goto(`/?testMode=1&lang=${LANG}&startMission=growing:${g.id}`);
      await page.waitForFunction(
        () => {
          const cv = document.querySelector('canvas');
          const st = cv && cv._stateRef && cv._stateRef.current;
          return !!(st && st.player)
            && !!window.__playfood
            && window.__playfood.screen() === 'game';
        },
        null,
        { timeout: 30_000 },
      );
      await page.evaluate(() => window.__playfood.setLanguage('en'));
      await page.evaluate(() => document.querySelector('canvas')?.focus());
      // The minigame opens on its intro/tutorial card — that IS the most
      // descriptive "what is this game" frame for a manual. Let it paint.
      await page.waitForTimeout(1600);
      await page.screenshot({ path: path.join(SHOTS, g.file) });
    });
  }

  // Islands 2–4 each get a full, dedicated capture block lower in this file
  // (room approach + clean + mentor · per-game selection + intro + mid-play +
  // win + lose-where-real · 3/3 room + greening). Those blocks own every
  // 09–20 / gameN_* filename, so the old generic room+intro loop that used to
  // live here was removed to avoid two tests racing on the same output file.

  // ── The Lighthouse Trophy Hall ──
  // A walkable Canvas room at the map's centre. Shown here in its "full" state
  // (all islands mastered via the store's debugCompleteAll hook) so the
  // plinths, compass, and bookshelf are lit — the richest single frame.
  test('capture the Lighthouse Trophy Hall', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      window.__playfood.state().setHero('braid');
      window.__playfood.state().debugCompleteAll();
      window.__playfood.goToScreen('lighthouse');
    });
    await waitScreen(page, 'lighthouse', 1600);
    await page.screenshot({ path: path.join(SHOTS, '22_lighthouse.png') });
  });

  // ── The Lighthouse, station by station (Section 10) ──
  // The Trophy Hall is a walkable Canvas room with no DOM to click, so we steer
  // the avatar with REAL key events (walk/press), exactly as for the island
  // rooms. A partial-progress seed (Growing + Local done, Food waste 1/3) lets
  // the Keeper, compass, and bookshelf all report REAL mid-journey progress, and
  // marks the two finished islands' gold ceremonies as already seen so the room
  // input is free immediately on entry. Player spawns at (9,13) facing UP.
  async function enterLighthousePartial(page) {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      ['growing', 'local'].forEach((isl) => [1, 2, 3].forEach((m) => s.addCompletedMission(isl, m)));
      s.addCompletedMission('foodwaste', 1);
      s.recordStars('growing:WhereDoesItGrow', 3); s.recordStars('growing:GardenPlanner', 2); s.recordStars('growing:SoilDoctor', 3);
      s.recordStars('local:SeasonMatcher', 3); s.recordStars('local:MarketTrip', 3); s.recordStars('local:SpotTheFake', 2);
      s.recordStars('foodwaste:FridgeManager', 3);
      s.markGoldSeen('growing'); s.markGoldSeen('local'); // suppress the gold ceremony so input is free
      s.markLighthouseOnboardingSeen();
      window.__playfood.goToScreen('lighthouse');
    });
    await waitScreen(page, 'lighthouse', 1500);
  }

  // (pre) Where the lighthouse is + how you enter it. On the world map the
  // central buoy IS the lighthouse: sailing up to it and pressing Enter steps
  // inside the Trophy Hall. We seed the boat one tile south of the buoy (29,20)
  // — navigable shallow water — so the map opens framed on the central landmark
  // with the entry prompt up.
  test('capture the Lighthouse exterior approach (boat at the buoy)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.setBoatPosition({ col: 29, row: 21 }); // shallow water abutting the central lighthouse buoy
      window.__playfood.goToScreen('hub');
    });
    await waitScreen(page, 'hub', 1500);
    await page.screenshot({ path: path.join(SHOTS, '22_lighthouse_approach.png') });
  });

  // (a) Talk to the Keeper — the welcome dialog reporting real progress.
  test('capture the Lighthouse Keeper welcome', async ({ page }) => {
    await enterLighthousePartial(page);
    await page.evaluate(async () => { await window.__playfood.walk('up', 2); }); // (9,13) → (9,11), facing the Keeper (9,10)
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__playfood.press('Enter'));                 // open the welcome dialog
    await page.waitForTimeout(2700);                                             // let the whole line type out
    await page.screenshot({ path: path.join(SHOTS, '22a_lighthouse_keeper.png') });
  });

  // (b) The compass bubble — walk beside it and it points to the next island.
  test('capture the Lighthouse compass', async ({ page }) => {
    await enterLighthousePartial(page);
    await page.evaluate(async () => {
      await window.__playfood.walk('left', 1); // (9,13) → (8,13)
      await window.__playfood.walk('up', 6);   // (8,13) → (8,7), beside the compass (9,7)
    });
    await page.waitForTimeout(1500);           // let the compass bubble type out
    await page.screenshot({ path: path.join(SHOTS, '22b_lighthouse_compass.png') });
  });

  // (c) The Source Library bookshelf — Enter opens the verbatim-fact panel.
  test('capture the Lighthouse Source Library bookshelf', async ({ page }) => {
    await enterLighthousePartial(page);
    await page.evaluate(async () => {
      await window.__playfood.walk('left', 7); // (9,13) → (2,13)
      await window.__playfood.walk('up', 2);   // (2,13) → (2,11), facing the bookshelf (2,10)
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__playfood.press('Enter')); // open the book panel
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS, '22c_lighthouse_bookshelf.png') });
  });

  // (d) The postbox — Enter opens the phygital code modal (a DOM overlay).
  test('capture the Lighthouse postbox (phygital code)', async ({ page }) => {
    await enterLighthousePartial(page);
    await page.evaluate(async () => { await window.__playfood.walk('right', 7); }); // (9,13) → (16,13), facing the postbox (17,13)
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__playfood.press('Enter'));                     // open the phygital modal
    await page.waitForSelector('input', { timeout: 8_000 });                         // the DOM modal mounts
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '22d_lighthouse_postbox.png') });
  });

  // (e) The final door — at 12/12 the Keeper offers the Grand Finale handover.
  // We seed the full-completion state, wait out the ~2s finale sweep (so input
  // unfreezes), walk to the Keeper, and open the dialog WITHOUT dismissing it
  // (dismissing claims the diploma and leaves for the merge cinematic).
  test('capture the Lighthouse finale handover', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.debugCompleteAll(); // 12/12 + full stars, gold ceremonies pre-seen, finale re-armed
      window.__playfood.goToScreen('lighthouse');
    });
    await waitScreen(page, 'lighthouse', 1600);
    await page.waitForTimeout(2800); // let the finale sweep finish (claimReady) so movement unfreezes
    await page.evaluate(async () => { await window.__playfood.walk('up', 2); }); // to the Keeper
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__playfood.press('Enter')); // open the finale handover (do NOT dismiss)
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(SHOTS, '22e_lighthouse_finale.png') });
  });

  // ── The Grand Finale on the world map (Section 11 lead-in) ──
  // At 12/12 (and before the diploma is claimed) finaleActive flips on: the whole
  // archipelago sends warm beams of light inward to the central lighthouse, with a
  // call to sail there. We seed full completion (debugCompleteAll leaves
  // finaleClaimed === false) and park the boat by the central lighthouse so the
  // beams converge in frame.
  test('capture the Grand Finale beams (islands → lighthouse)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.debugCompleteAll();                       // 12/12, finaleClaimed === false → finaleActive
      s.setBoatPosition({ col: 29, row: 22 });    // beside the central lighthouse buoy
      window.__playfood.goToScreen('hub');
    });
    await waitScreen(page, 'hub', 1800);          // let the beams + finale call animate in
    await page.screenshot({ path: path.join(SHOTS, 'finale_beams.png') });
  });

  // The island-merge cinematic that plays AFTER the diploma is claimed: the four
  // islands' orbs converge at the centre and bloom into one golden "Success
  // Island" before the certificate opens. We arm the merge (startFinaleMerge),
  // enter the map, and grab a frame mid-bloom (the whole thing is ~2.8s and then
  // auto-navigates to the certificate).
  test('capture the Grand Finale island-merge cinematic', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.debugCompleteAll();
      s.startFinaleMerge();                       // arm the merge cinematic on the next map mount
      window.__playfood.goToScreen('hub');
    });
    await page.waitForFunction(() => !!window.__playfood && window.__playfood.screen() === 'hub', null, { timeout: 20_000 });
    await page.waitForTimeout(2100);              // mid-bloom, before the ~2.8s auto-navigate to the certificate
    await page.screenshot({ path: path.join(SHOTS, 'finale_merge.png') });
  });

  // ── The Recycling Island (Section 5) ──
  // The small island at the bottom-centre of the map where the child drops the
  // floating litter scooped up while sailing. We park the boat in the open water
  // just north of its dock (col 28) so the island + the recycle prompt are framed.
  test('capture the Recycling Island (boat at its dock)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.setBoatPosition({ col: 28, row: 34 }); // open water just north of the Recycling Island dock
      window.__playfood.goToScreen('hub');
    });
    await waitScreen(page, 'hub', 1600);
    await page.screenshot({ path: path.join(SHOTS, 'recycling_island.png') });
  });

  // Floating litter at sea — the trash the child scoops up between islands.
  // On a fresh map the not-yet-finished islands "pollute" the surrounding water,
  // so debris (up to 6 pieces) drifts in. We park the boat just off the Food
  // Waste island and let several pieces spawn into frame.
  test('capture floating litter at sea', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      // Finish the other three islands so ALL the litter spawns around the one
      // still-polluted island (Food Waste), clustering it clearly in frame.
      ['growing', 'local', 'circular'].forEach((isl) => [1, 2, 3].forEach((m) => s.addCompletedMission(isl, m)));
      s.setBoatPosition({ col: 16, row: 14 }); // open water just south of the Food Waste island
      window.__playfood.goToScreen('hub');
    });
    await waitScreen(page, 'hub', 1500);
    await page.waitForTimeout(4000); // let the debris drift in (spawns up to 6)
    await page.screenshot({ path: path.join(SHOTS, 'floating_litter.png') });
  });

  // ── Saving & continuing later: the Play Code (Section 5 / onboarding) ──
  // Pressing Exit on the world map shows a portable Play Code that encodes the
  // child's full progress, with no account and nothing sent anywhere. We seed a
  // mid-journey state so the code stands for real progress, then click the canvas
  // Exit pill (top-left) to open the save overlay.
  test('capture the Play Code save overlay', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      ['growing', 'local'].forEach((isl) => [1, 2, 3].forEach((m) => s.addCompletedMission(isl, m)));
      s.addCompletedMission('foodwaste', 1);
      s.recordStars('growing:WhereDoesItGrow', 3); s.recordStars('local:SeasonMatcher', 3);
      window.__playfood.goToScreen('hub');
    });
    await waitScreen(page, 'hub', 1200);
    await page.evaluate(() => document.querySelector('canvas')?.focus());
    await page.mouse.click(46, 93);                                   // the canvas "Exit" pill (top-left HUD)
    await page.getByText('Your Play Code', { exact: false }).waitFor({ timeout: 8_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'playcode_save.png') });
  });

  // The other half of the round-trip: on the start screen (any device, later),
  // the child taps "Continue with Play Code" and types the code to resume exactly
  // where they left off. We open that load modal on the language screen.
  test('capture the Play Code load modal', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await waitScreen(page, 'lang', 600);
    await page.getByRole('button', { name: /Continue with Play Code/i }).click();
    await page.getByText('Load Your Progress', { exact: false }).waitFor({ timeout: 8_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'playcode_load.png') });
  });

  // ── The Source Library page (content-authenticity proof) ──
  // source.html is a STANDALONE static page (no React, no store) that renders
  // a verbatim source by its ?src= key. Its UI chrome is now English (the page
  // does not go through the game's i18n, so it was translated directly). We
  // screenshot the Island-1 "heirloom-seeds" entry: the RHEA seed-bank facts a
  // child meets in Where Does It Grow / Garden Planner, shown exactly as
  // published, with a live link to the real PDF and a ★ "goes into the game"
  // tag on the verbatim fact pages. fullPage captures the complete archive —
  // the strongest single piece of visual evidence that the facts are sourced.
  test('capture the Source Library page', async ({ page }) => {
    await page.goto('/source.html?src=heirloom-seeds');
    // The page builds its document pages synchronously on load; wait for them
    // to exist, then let the pixel-art frame settle before the shot.
    await page.waitForSelector('.page', { timeout: 20_000 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(SHOTS, '08b_source_library.png'),
      fullPage: true,
    });
  });

  // ── The Grand Finale Certificate (12/12 completion) ──
  // In play this is reached only after the full finale flow (Lighthouse keeper
  // dialog → island-merge cinematic → certificate). For the manual we skip the
  // cinematic and jump straight to the certificate — but the avatar and the
  // stars are GENUINE: we drive the store's dev review hook (debugCompleteAll)
  // to mark all 12 missions done with full stars, so the screenshot shows the
  // real personalised certificate, not faked markup.
  test('capture the Grand Finale certificate', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      window.__playfood.state().setHero('braid');        // the child's chosen hero
      window.__playfood.state().debugCompleteAll();      // 12/12 done · full stars
      window.__playfood.goToScreen('certificate');       // skip the merge cinematic
    });
    await waitScreen(page, 'certificate', 600);
    await page.waitForSelector('.pf-card', { timeout: 20_000 });
    // The certificate pulls Fraunces + Hanken Grotesk webfonts — wait for them.
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(900);
    // The card lives inside an `overflow:auto` stage fixed to viewport height, so
    // a plain fullPage shot clips the bottom (island list + Save It button).
    // Size the viewport to the card's REAL height, then capture the whole thing
    // — including the chunky stepped pixel frame that sits outside the box.
    const cardH = await page.evaluate(() => {
      const el = document.querySelector('.pf-card');
      return el ? Math.ceil(el.getBoundingClientRect().height) : 0;
    });
    await page.setViewportSize({ width: 1366, height: Math.max(900, cardH + 180) });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(SHOTS, '21_certificate.png'),
      fullPage: true,
    });
  });

  // ── Three focused "detail" shots for the manual ──
  // All three force a 1280×704 viewport so the canvas (internal 1280×704) maps
  // 1:1 to the page and any clip coordinates line up exactly with what the
  // renderer draws.

  // (a) The Stars + Coins progress badge (drawStatsBadge) lives top-right of
  // the top HUD bar. We seed an illustrative mid-journey total (a few stars
  // and some coins) through the store's own actions, then capture the full
  // pier screen so the badge is shown in its real on-screen context, at the
  // SAME 1366×900 size as every other screenshot in the manual.
  test('capture the Stars & Coins HUD badge', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.recordStars('growing:WhereDoesItGrow', 2);   // a couple of games played…
      s.recordStars('growing:GardenPlanner', 3);     // …so the star total is non-zero
      s.addPoints(240);                               // coins collected along the way
      window.__playfood.goToScreen('menu');
    });
    await waitScreen(page, 'menu', 1200);
    await page.screenshot({ path: path.join(SHOTS, '01b_hud.png') });
  });

  // (b) Avatar selection: hover a girl hero (braid → "Ella") so her retro bio
  // box renders above her, and capture the FULL selection screen at 1366×900
  // (same size as every other shot). The overworld canvas hook (unlike the
  // in-game hook) does NOT expose its state on the DOM, so we drive the hover
  // with a REAL mouse move, placed from the renderer's own geometry and mapped
  // through the canvas's actual bounding rect.
  test('capture the avatar selection (girl hero + bio box)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => window.__playfood.goToScreen('avatar'));
    await waitScreen(page, 'avatar', 1800); // iris (0.5s) opens → phase 'idle'

    const cv = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top, sx: 1280 / r.width, sy: 704 / r.height };
    });
    expect(cv).toBeTruthy();
    // HEROES[1] = 'braid' (a girl); her sprite centre in canvas px is (612, 402).
    await page.mouse.move(
      Math.round(cv.left + 612 / cv.sx),
      Math.round(cv.top + 402 / cv.sy),
    );
    await page.waitForTimeout(700); // let the bio box paint
    await page.screenshot({ path: path.join(SHOTS, '02b_avatar_zoom.png') });
  });

  // (c) The Captain's welcome dialogue. The dialogue is an HTML overlay
  // (DialogueBox.jsx) that opens when the player is face-adjacent to the
  // Captain and presses Enter. The overworld hook keeps its state off the DOM,
  // so we move the player for real with the test API's walk() (the harbor
  // update loop reads the same key events a player would): the hero spawns
  // mid-pier (col 13, row 7) facing DOWN, one step down lands at row 8,
  // face-adjacent to the Captain (col 13, row 9). Then Enter opens the box,
  // which does not auto-advance, so we wait for the typewriter to finish and
  // snapshot it open over the pier.
  test('capture the Captain dialogue open on the pier', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      window.__playfood.goToScreen('menu');
    });
    await waitScreen(page, 'menu', 1200);
    await page.evaluate(() => window.__playfood.walk('down', 1)); // row 7 → 8
    await page.waitForTimeout(700);   // MOVE_DURATION 0.15s + settle
    await page.evaluate(() => window.__playfood.press('Enter'));
    await page.waitForSelector('p', { timeout: 8_000 }); // dialogue <p> mounts
    await page.waitForTimeout(2300);  // typewriter (~30ms/char) finishes + hint
    await page.screenshot({ path: path.join(SHOTS, '03b_captain_dialogue.png') });
  });

  // (d) The island's EXTERIOR pier. The world map itself is the islands' outside:
  // each island is a green landmass with a wooden DOCK pier reaching into the sea
  // (mapData.js). The boat can only sit on WATER, so we park it one tile north of
  // the Magic Garden Island's pier (the 'growing' dock, col 12) — close enough
  // that getDockIsland() flags it and the dock-entry prompt names the island.
  // We seed the boat's persisted position BEFORE the map mounts: WorldMap reads
  // boatPosition at setup and frames the camera on it, so the map opens with the
  // hero alongside the island's pier. This is the "arriving ashore" beat that
  // Section 6 (Arriving at the Island) describes.
  test('capture the island exterior pier (boat at the dock)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.setBoatPosition({ col: 12, row: 22 }); // water tile abutting the growing pier
      window.__playfood.goToScreen('hub');
    });
    await waitScreen(page, 'hub', 1500); // iris-in opens + dock prompt paints
    await page.screenshot({ path: path.join(SHOTS, '04b_island_approach.png') });
  });

  // (e) The island room BEFORE the mentor speaks — the courtyard scene itself.
  // On entry the Gardener's intro dialog auto-opens (modal, set in IslandRoom
  // setup when completed.length === 0). One Enter dismisses it, leaving the
  // clean room: the fenced garden courtyard, the three mission characters at
  // their corners, and the Gardener mentor standing bottom-left.
  test('capture the Island 1 room (clean, before the mentor dialog)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      window.__playfood.state().setHero('braid');
      window.__playfood.goToIsland('growing');
    });
    await waitScreen(page, 'island', 1400);
    await page.evaluate(() => window.__playfood.press('Enter')); // dismiss the intro dialog
    await page.waitForTimeout(700);                              // dialog closes, room settles
    await page.screenshot({ path: path.join(SHOTS, '04c_island1_room.png') });
  });

  // (f) Choosing the first game. With the intro dialog dismissed, we walk the
  // hero up the central dirt path then left along the top row to stand face to
  // face with the first character (the NPC at col 4, row 3). That raises the
  // in-room "Press Enter to play The Food's Journey" prompt — the game-selection
  // beat. The room canvas keeps its state off the DOM, so movement is driven
  // with real arrow-key events (one tile per ~350ms via the test API's walk()).
  // The final Up press only TURNS the hero to face the NPC: the NPC tile is
  // solid (isRoomWalkable blocks it), so the hero never steps onto it.
  test('capture the first-game selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      window.__playfood.state().setHero('braid');
      window.__playfood.goToIsland('growing');
    });
    await waitScreen(page, 'island', 1400);
    await page.evaluate(() => window.__playfood.press('Enter')); // dismiss the intro dialog
    await page.waitForTimeout(600);
    await page.evaluate(async () => {
      await window.__playfood.walk('up', 9);    // (10,13) → (10,4) up the central path
      await window.__playfood.walk('left', 6);  // (10,4)  → (4,4)  along the top row
      await window.__playfood.walk('up', 1);    // turn to face the NPC at (4,3)
    });
    await page.waitForTimeout(500); // let the "Press Enter to play…" prompt paint
    await page.screenshot({ path: path.join(SHOTS, '05b_game1_select.png') });
  });

  // ── Island 1 finale: selection prompts for games 2 & 3, the completed room,
  //    and the island "greening" across 1/3 → 2/3 → 3/3 on the world map. ──
  // Missions gate sequentially (isMissionUnlocked): game 2 needs game 1 done,
  // game 3 needs games 1 + 2. We unlock by marking the PREREQUISITES complete
  // with the store's addCompletedMission, WITHOUT completing the target game,
  // so its NPC still shows the live "Press Enter to play…" prompt. Marking
  // game 1 done also makes completed.length > 0, so the Gardener intro dialog
  // no longer auto-opens (no dismiss needed).

  test('capture the second-game selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.addCompletedMission('growing', 1);  // unlock game 2 (game 1 done)
      window.__playfood.goToIsland('growing');
    });
    await waitScreen(page, 'island', 1400);
    await page.evaluate(async () => {
      await window.__playfood.walk('up', 9);    // (10,13) → (10,4) up the central path
      await window.__playfood.walk('right', 5); // (10,4)  → (15,4) along the top row
      await window.__playfood.walk('up', 1);    // turn to face NPC 2 at (15,3)
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '06b_game2_select.png') });
  });

  test('capture the third-game selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.addCompletedMission('growing', 1);  // unlock chain…
      s.addCompletedMission('growing', 2);  // …game 3 needs games 1 + 2
      s.markReflectionSeen('growing');      // suppress the 2/3 reflection card
      window.__playfood.goToIsland('growing');
    });
    await waitScreen(page, 'island', 1400);
    await page.evaluate(async () => {
      await window.__playfood.walk('up', 3);    // (10,13) → (10,10) up the central path
      await window.__playfood.walk('right', 5); // (10,10) → (14,10), facing NPC 3 at (15,10)
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '07b_game3_select.png') });
  });

  // The room once every game is won (3/3). All three missions are marked done
  // with full-ish stars; the 3/3 ceremony is pre-marked seen so its card does
  // not cover the scene — leaving the three mission characters in their
  // completed state and the Gardener still in her corner.
  test('capture the Island 1 room completed (3/3)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.addCompletedMission('growing', 1);
      s.addCompletedMission('growing', 2);
      s.addCompletedMission('growing', 3);
      s.recordStars('growing:WhereDoesItGrow', 3);
      s.recordStars('growing:GardenPlanner', 2);
      s.recordStars('growing:SoilDoctor', 3);
      s.markCeremonySeen('growing'); // don't let the finale card cover the NPCs
      window.__playfood.goToIsland('growing');
    });
    await waitScreen(page, 'island', 1400);
    await page.screenshot({ path: path.join(SHOTS, '08c_island1_complete.png') });
  });

  // The island "greening" on the world map across 1/3 → 2/3 → 3/3. The boat is
  // seeded to the growing island's southern shore (col 11, row 34), reached from
  // the open sea to the south, so the camera frames the WHOLE island above it —
  // identically in all three shots; only the completion count (and thus
  // renderIslandEvolution) changes, so the green growth reads as a progression.
  const GREENING = [
    { done: [1],       file: '08d_island_1of3.png' },
    { done: [1, 2],    file: '08e_island_2of3.png' },
    { done: [1, 2, 3], file: '08f_island_3of3.png' },
  ];
  for (const g of GREENING) {
    test(`capture the island greening — ${g.done.length} of 3`, async ({ page }) => {
      await page.goto(`/?testMode=1&lang=${LANG}`);
      await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
      await page.evaluate((done) => {
        const s = window.__playfood.state();
        s.setHero('braid');
        for (const id of done) s.addCompletedMission('growing', id);
        s.setBoatPosition({ col: 11, row: 34 }); // southern shore — frames the whole island
        window.__playfood.goToScreen('hub');
      }, g.done);
      await waitScreen(page, 'hub', 1500);
      await page.screenshot({ path: path.join(SHOTS, g.file) });
    });
  }

  // ── Per-game mechanic shots: mid-play, the win result, and (where a game can
  //    truly be failed) the lose result. Reuses the committed interaction harness
  //    (helpers.js): the avatar is positioned via canvas._stateRef and every
  //    scoring action is a REAL key event, so win/lose run exactly as for a
  //    player. The win step functions are copied verbatim from the per-game
  //    specs (where-does-it-grow / garden-planner / soil-doctor .spec.js). ──

  function stepWhereDoesItGrow() {
    const TS = 32, DIR_UP = 1;
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.reveal) return { act: 'enter' };
    if ((st.pendingRevealTimer || 0) > 0) return { act: 'wait', ms: 200 };
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    if (st.current) {
      const spot = st.spots.find((s) => s.key === st.current.origin);
      const tile = spot.tiles[0];
      const p = st.player;
      p.col = tile.col; p.row = tile.row + 1;
      p.pixelX = p.col * TS; p.pixelY = p.row * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
      return { act: 'enter' };
    }
    return { act: 'wait', ms: 150 };
  }

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
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    if (st.reveal) return { act: 'enter' };
    if (st.diagnosisCard) return { act: 'enter' };
    if ((st.pendingRevealTimer || 0) > 0) return { act: 'wait', ms: 200 };
    const plot = st.plots.find((p) => !p.healed);
    if (!plot) return { act: 'wait', ms: 150 };
    const carrying = st.carrying;
    if (!carrying) {
      if (!plot.diagnosed) { face(plot.tiles[0]); return { act: 'enter' }; }
      const station = st.stations.find((s) => s.key === plot.neededRemedy);
      face(station.tiles[0]); return { act: 'enter' };
    }
    if (carrying === plot.neededRemedy) { face(plot.tiles[0]); return { act: 'enter' }; }
    const station = st.stations.find((s) => s.key === plot.neededRemedy);
    face(station.tiles[0]); return { act: 'enter' };
  }

  // Lose driver: grab the chemical trap and apply it to a plot, over and over,
  // until the soil-health meter crashes to zero — the genuine fail SoilDoctor
  // warns against. Applying a remedy needs no diagnosis, so this stays simple.
  function stepSoilDoctorFail() {
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
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    if (st.reveal) return { act: 'enter' };          // dismiss chemical-warning + final fail card
    if (st.diagnosisCard) return { act: 'enter' };
    if ((st.pendingRevealTimer || 0) > 0) return { act: 'wait', ms: 200 };
    const plot = st.plots.find((p) => !p.healed);
    if (!plot) return { act: 'wait', ms: 150 };
    const chem = st.stations.find((s) => s.key === 'chemical');
    if (st.carrying !== 'chemical') { face(chem.tiles[0]); return { act: 'enter' }; } // grab chemical
    face(plot.tiles[0]); return { act: 'enter' };    // apply chemical → soil health drops
  }

  // Run a step driver until an in-page predicate goes true (a mid-play modal),
  // WITHOUT advancing past it — so the next screenshot catches that exact beat.
  async function driveUntilState(page, stepFn, predFn, { maxSteps = 250 } = {}) {
    for (let i = 0; i < maxSteps; i++) {
      if (await page.evaluate(predFn)) return true;
      const action = await page.evaluate(stepFn);
      if (action.act === 'done') return false; // ran to the result before our target
      if (action.act === 'enter') await pressEnter(page);
      else if (action.act === 'press') await pressKey(page, action.key);
      else if (action.act === 'hold') await holdEnter(page, action.ms);
      else await page.waitForTimeout(action.ms || 100);
    }
    return false;
  }

  async function shootResult(page, file, settleMs = 700) {
    await page.waitForFunction(
      () => window.__playfood.state().currentScreen === 'result',
      null, { timeout: 30_000 },
    );
    await page.waitForTimeout(settleMs); // let the win flourish / card settle
    await page.screenshot({ path: path.join(SHOTS, file) });
  }

  // Mid-play predicates (run in the browser).
  const wdigRevealUp = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && s.reveal); };
  const gpDecisionUp = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && s.decisionEvent && !s.decisionEvent.answered); };
  const sdDiagnosisUp = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && s.diagnosisCard); };

  // Game 1 — The Food's Journey (WhereDoesItGrow): a correct delivery pops a
  // "Did you know?" reveal (the win mechanic in action), then a 3★ win.
  test('capture WhereDoesItGrow mid-play + win', async ({ page }) => {
    await bootMission(page, 'growing', 1);
    await driveUntilState(page, stepWhereDoesItGrow, wdigRevealUp);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, 'game1_play.png') });
    await driveToResult(page, stepWhereDoesItGrow);
    await shootResult(page, 'game1_win.png');
  });

  // Game 2 — The Little Gardener (GardenPlanner): the companion-planting decision
  // card mid-play, then the full plant→water→harvest win.
  test('capture GardenPlanner mid-play + win', async ({ page }) => {
    await bootMission(page, 'growing', 2);
    await driveUntilState(page, stepGardenPlanner, gpDecisionUp);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, 'game2_play.png') });
    await driveToResult(page, stepGardenPlanner);
    await shootResult(page, 'game2_win.png');
  });

  // Game 3 — Earth Doctor (SoilDoctor): the diagnosis card mid-play, the clean
  // (chemical-free) win, and the genuine LOSE when the chemical trap is abused.
  test('capture SoilDoctor mid-play + win', async ({ page }) => {
    await bootMission(page, 'growing', 3);
    await driveUntilState(page, stepSoilDoctor, sdDiagnosisUp);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, 'game3_play.png') });
    await driveToResult(page, stepSoilDoctor);
    await shootResult(page, 'game3_win.png');
  });

  test('capture SoilDoctor lose result', async ({ page }) => {
    await bootMission(page, 'growing', 3);
    await driveToResult(page, stepSoilDoctorFail);
    await shootResult(page, 'game3_lose.png', 600);
  });

  // ════════════════════════════════════════════════════════════════════
  //  ISLAND 2 — The Island of Seasons (local). Same templates as Island 1:
  //  room (approach + clean + mentor) · per game (selection + intro +
  //  mid-play + win + lose where real) · finishing (3/3 room + greening).
  //  Local room geometry is identical to growing, so the walk paths match.
  // ════════════════════════════════════════════════════════════════════

  // Win-drive step functions, copied verbatim from the per-game specs.
  function stepSeasonMatcher() {
    const TS = 32, DIR_UP = 1, DIR_DOWN = 0;
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    const BASKET = st.basketSize || 6;
    const CART_MAX = st.cartMax || 4;
    const faceFrom = (col, row, dir) => {
      const p = st.player;
      const pr = dir === DIR_UP ? row + 1 : row - 1;
      p.col = col; p.row = pr; p.pixelX = col * TS; p.pixelY = pr * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = dir;
    };
    if (st.checkoutQueue) return { act: 'wait', ms: 250 };
    if (st.basketCount >= BASKET) return { act: 'wait', ms: 250 };
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    const cartCount = st.cart.length;
    const stillNeed = BASKET - st.basketCount - cartCount;
    const inSeasonLeft = st.foods.filter((f) => f.inSeason && !f.taken);
    if (stillNeed > 0 && cartCount < CART_MAX && inSeasonLeft.length > 0) {
      const food = inSeasonLeft[0];
      faceFrom(food.col, food.row, DIR_UP);
      return { act: 'enter' };
    }
    if (cartCount > 0) { faceFrom(5, 10, DIR_DOWN); return { act: 'enter' }; }
    return { act: 'wait', ms: 200 };
  }

  // Choose a payable basket for the remaining stalls, then pay at the checkout.
  function stepMarketTrip() {
    const TS = 32;
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    const faceFromApproach = (stall) => {
      const p = st.player;
      p.col = stall.approach.col; p.row = stall.approach.row;
      p.pixelX = p.col * TS; p.pixelY = p.row * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = stall.approach.dir;
    };
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    if (st.checkoutOpen) return { act: 'enter' };
    if (st.factTimer > 0 && !st.showingChoice) return { act: 'wait', ms: 150 };
    if (st.feedbackTimer > 0) return { act: 'wait', ms: 200 };
    if (st.showingChoice && st.activeStall) {
      let baseMoney = 0, baseMiles = 0, seasonalOk = true;
      const free = [];
      for (const s of st.stalls) {
        if (s.chosen) {
          const o = s.chosenLocal ? s.local : s.imported;
          baseMoney += o.price; baseMiles += o.miles;
          if (s.local.inSeason && !s.chosenLocal) seasonalOk = false;
        } else free.push(s);
      }
      let best = null;
      for (let mask = 0; mask < (1 << free.length); mask++) {
        let m = baseMoney, mi = baseMiles, seasonal = seasonalOk, possible = true;
        for (let i = 0; i < free.length; i++) {
          const local = (mask >> i) & 1;
          if (local && free[i].local.available === false) { possible = false; break; }
          const o = local ? free[i].local : free[i].imported;
          m += o.price; mi += o.miles;
          if (free[i].local.inSeason && !local) seasonal = false;
        }
        if (!possible || m > st.budget + 1e-9) continue;
        const score = (seasonal ? 2 : 0) + (mi <= st.transportTarget ? 1 : 0);
        if (!best || score > best.score) best = { mask, score };
      }
      const idx = free.indexOf(st.activeStall);
      const wantLocal = best ? !!((best.mask >> idx) & 1) : false;
      const wantIndex = wantLocal ? 0 : 1;
      if (st.choiceIndex !== wantIndex) {
        return { act: 'press', key: wantLocal ? 'ArrowLeft' : 'ArrowRight' };
      }
      return { act: 'enter' };
    }
    const stall = st.stalls.find((s) => !s.chosen);
    if (stall) { faceFromApproach(stall); return { act: 'enter' }; }
    return { act: 'wait', ms: 200 };
  }

  function stepSpotTheFake() {
    const TS = 32;
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    // Stand on the shelf's own approach tile and facing (SpotTheFake nearbyShelfProduct).
    const approach = (product) => {
      const { col, row, dir } = product.tile.approach;
      Object.assign(st.player, { col, row, dir, pixelX: col * TS, pixelY: row * TS,
        fromX: col * TS, fromY: row * TS, toX: col * TS, toY: row * TS, moving: false, moveTimer: 0 });
    };
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.reveal) return { act: 'enter' }; // focused teaching Continue button
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    if (st.inspect) {
      const insp = st.inspect;
      const product = st.products.find((p) => p.id === insp.productId);
      if (insp.stage === 'promise' || insp.stage === 'evidence' || insp.stage === 'feedback') return { act: 'enter' };
      if (insp.stage === 'decision') {
        const want = product.verdict;
        if (insp.choice !== want) return { act: 'press', key: want === 'flag' ? 'ArrowRight' : 'ArrowLeft' };
        return { act: 'enter' };
      }
      return { act: 'wait', ms: 120 };
    }
    const product = st.products.find((p) => !p.judged);
    if (product) { approach(product); return { act: 'enter' }; }
    return { act: 'wait', ms: 150 };
  }

  // Buying local produce at every stall can leave a shortfall at checkout.
  function stepMarketTripAllLocal() {
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    if (st.checkoutOpen) return { act: 'done', nav: null };
    const TS = 32;
    const face = (stall) => {
      const p = st.player;
      p.col = stall.approach.col; p.row = stall.approach.row;
      p.pixelX = p.col * TS; p.pixelY = p.row * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = stall.approach.dir;
    };
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    if (st.factTimer > 0 && !st.showingChoice) return { act: 'wait', ms: 150 };
    if (st.feedbackTimer > 0) return { act: 'wait', ms: 200 };
    if (st.showingChoice && st.activeStall) {
      const wantIndex = st.activeStall.local.available === false ? 1 : 0;
      if (st.choiceIndex !== wantIndex) return { act: 'press', key: wantIndex === 0 ? 'ArrowLeft' : 'ArrowRight' };
      return { act: 'enter' };
    }
    const stall = st.stalls.find((s) => !s.chosen);
    if (stall) { face(stall); return { act: 'enter' }; }
    return { act: 'wait', ms: 200 };
  }

  // SpotTheFake: pick the WRONG verdict on every product → 0 correct → fail.
  function stepSpotTheFakeFail() {
    const TS = 32;
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    // Stand on the shelf's own approach tile and facing (SpotTheFake nearbyShelfProduct).
    const approach = (product) => {
      const { col, row, dir } = product.tile.approach;
      Object.assign(st.player, { col, row, dir, pixelX: col * TS, pixelY: row * TS,
        fromX: col * TS, fromY: row * TS, toX: col * TS, toY: row * TS, moving: false, moveTimer: 0 });
    };
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.reveal) return { act: 'enter' }; // focused teaching Continue button
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    if (st.inspect) {
      const insp = st.inspect;
      const product = st.products.find((p) => p.id === insp.productId);
      if (insp.stage === 'promise' || insp.stage === 'evidence' || insp.stage === 'feedback') return { act: 'enter' };
      if (insp.stage === 'decision') {
        const want = product.verdict === 'flag' ? 'trust' : 'flag';
        if (insp.choice !== want) return { act: 'press', key: want === 'flag' ? 'ArrowRight' : 'ArrowLeft' };
        return { act: 'enter' };
      }
      return { act: 'wait', ms: 120 };
    }
    const product = st.products.find((p) => !p.judged);
    if (product) { approach(product); return { act: 'enter' }; }
    return { act: 'wait', ms: 150 };
  }

  // Mid-play predicates (in-browser).
  const smShopped = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && (s.basketCount >= 2 || (s.cart && s.cart.length >= 3))); };
  const mtChoiceUp = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && s.showingChoice && s.activeStall); };
  const stfBackUp = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && s.inspect && s.inspect.stage === 'evidence'); };

  // ── Island 2 room: approach (pier) + clean room + mentor dialog ──
  test('capture Island 2 exterior pier (boat at the dock)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.setBoatPosition({ col: 47, row: 17 }); // water abutting the local (NE) pier
      window.__playfood.goToScreen('hub');
    });
    await waitScreen(page, 'hub', 1500);
    await page.screenshot({ path: path.join(SHOTS, '09b_island2_approach.png') });
  });

  test('capture Island 2 room (clean) + mentor dialog', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      window.__playfood.state().setHero('braid');
      window.__playfood.goToIsland('local');
    });
    await waitScreen(page, 'island', 1400);
    await page.screenshot({ path: path.join(SHOTS, '09_island2.png') });      // mentor dialog (auto-open)
    await page.evaluate(() => window.__playfood.press('Enter'));               // dismiss it
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, '09c_island2_room.png') }); // clean room
  });

  // ── Island 2 per-game selection prompts (same walk paths as Island 1) ──
  test('capture SeasonMatcher selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => { window.__playfood.state().setHero('braid'); window.__playfood.goToIsland('local'); });
    await waitScreen(page, 'island', 1400);
    await page.evaluate(() => window.__playfood.press('Enter')); // dismiss mentor dialog
    await page.waitForTimeout(500);
    await page.evaluate(async () => {
      await window.__playfood.walk('up', 9);
      await window.__playfood.walk('left', 6);
      await window.__playfood.walk('up', 1);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '09d_game4_select.png') });
  });

  test('capture MarketTrip selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid'); s.addCompletedMission('local', 1);
      window.__playfood.goToIsland('local');
    });
    await waitScreen(page, 'island', 1400);
    await page.evaluate(async () => {
      await window.__playfood.walk('up', 9);
      await window.__playfood.walk('right', 5);
      await window.__playfood.walk('up', 1);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '09e_game5_select.png') });
  });

  test('capture SpotTheFake selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.addCompletedMission('local', 1); s.addCompletedMission('local', 2);
      s.markReflectionSeen('local');
      window.__playfood.goToIsland('local');
    });
    await waitScreen(page, 'island', 1400);
    await page.evaluate(async () => {
      await window.__playfood.walk('up', 3);
      await window.__playfood.walk('right', 5);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '09f_game6_select.png') });
  });

  // ── Game 4 — The Season Clock (SeasonMatcher): no-fail. Intro overlay,
  //    shopping mid-play, and the win. Booted en → Portugal (no country picker).
  test('capture SeasonMatcher intro + mid-play + win', async ({ page }) => {
    await bootMission(page, 'local', 1, 'en');
    await page.waitForTimeout(500);
    await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.showMissionIntro === true);
    await page.screenshot({ path: path.join(SHOTS, '10_game4.png') }); // shared canvas mission intro
    await pressEnter(page); // the intro card closes with Enter or Space
    await page.waitForFunction(() => {
      const s = document.querySelector('canvas')?._stateRef?.current;
      return !!s && !s.showMissionIntro && s.irisOpenness >= 1;
    }, null, { timeout: 15_000 });
    await driveUntilState(page, stepSeasonMatcher, smShopped);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'game4_play.png') });
    await driveToResult(page, stepSeasonMatcher);
    await shootResult(page, 'game4_win.png');
  });

  // ── Game 5 — The Green Basket (MarketTrip): intro, the local/imported choice
  //    mid-play, the paid three-goal win, and the checkout when money is short. ──
  test('capture MarketTrip intro + mid-play + win', async ({ page }) => {
    await bootMission(page, 'local', 2);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, '11_game5.png') }); // mission intro card
    await driveUntilState(page, stepMarketTrip, mtChoiceUp);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'game5_play.png') });
    await driveToResult(page, stepMarketTrip);
    await shootResult(page, 'game5_win.png');
  });

  test('capture MarketTrip checkout when the money is not enough', async ({ page }) => {
    await bootMission(page, 'local', 2);
    await driveToResult(page, stepMarketTripAllLocal);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SHOTS, 'game5_checkout.png') });
  });

  // ── Game 6 — The Food Detective (SpotTheFake): intro, the front/back label
  //    inspection mid-play, the flawless win, and the all-wrong-verdict lose. ──
  test('capture SpotTheFake intro + mid-play + win', async ({ page }) => {
    await bootMission(page, 'local', 3);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, '12_game6.png') }); // mission intro card
    await driveUntilState(page, stepSpotTheFake, stfBackUp);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'game6_play.png') });
    await driveToResult(page, stepSpotTheFake);
    await shootResult(page, 'game6_win.png');
  });

  test('capture SpotTheFake lose result', async ({ page }) => {
    await bootMission(page, 'local', 3);
    await driveToResult(page, stepSpotTheFakeFail);
    await shootResult(page, 'game6_lose.png', 600);
  });

  // ── Island 2 finishing: 3/3 completed room + greening 1/3 → 2/3 → 3/3 ──
  test('capture Island 2 room completed (3/3)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.addCompletedMission('local', 1); s.addCompletedMission('local', 2); s.addCompletedMission('local', 3);
      s.recordStars('local:SeasonMatcher', 3); s.recordStars('local:MarketTrip', 2); s.recordStars('local:SpotTheFake', 3);
      s.markCeremonySeen('local');
      window.__playfood.goToIsland('local');
    });
    await waitScreen(page, 'island', 1400);
    await page.screenshot({ path: path.join(SHOTS, 'island2_complete.png') });
  });

  const GREENING2 = [
    { done: [1],       file: 'island2_1of3.png' },
    { done: [1, 2],    file: 'island2_2of3.png' },
    { done: [1, 2, 3], file: 'island2_3of3.png' },
  ];
  for (const g of GREENING2) {
    test(`capture Island 2 greening — ${g.done.length} of 3`, async ({ page }) => {
      await page.goto(`/?testMode=1&lang=${LANG}`);
      await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
      await page.evaluate((done) => {
        const s = window.__playfood.state();
        s.setHero('braid');
        for (const id of done) s.addCompletedMission('local', id);
        s.setBoatPosition({ col: 47, row: 3 }); // northern shallow — frames the whole NE island
        window.__playfood.goToScreen('hub');
      }, g.done);
      await waitScreen(page, 'hub', 1500);
      await page.screenshot({ path: path.join(SHOTS, g.file) });
    });
  }

  // ════════════════════════════════════════════════════════════════════
  //  ISLAND 3 — The Green Rescue Island (foodwaste). Same templates as
  //  Islands 1–2: room (approach + mentor + clean) · per game (selection +
  //  intro + mid-play + win). All three "rescue" games are TEACH-DON'T-PUNISH /
  //  guided: a wrong move bounces back (FridgeManager), is nudged with nothing
  //  placed (MealPlanner), or returns the leftovers to the counter WITHOUT
  //  advancing the goal (LeftoverChef) — so a run completes only once it is done
  //  right, and there is no reachable lose screen (verified in source). Foodwaste
  //  room geometry matches growing/local, so the walk paths are identical.
  // ════════════════════════════════════════════════════════════════════

  // Win-drive step functions, copied verbatim from the per-game specs
  // (fridge-manager / meal-planner / leftover-chef .spec.js).
  function stepFridgeManager() {
    const TS = 32, DIR_DOWN = 0, DIR_UP = 1, DIR_LEFT = 2, DIR_RIGHT = 3;
    const BIN = {
      bread: 'cupboard', banana: 'cupboard', potato: 'cupboard', onion: 'cupboard',
      milk: 'fridge', fish: 'fridge', chicken: 'fridge', lettuce: 'fridge',
      rice_old: 'compost', fish_thawed: 'fridge',
    };
    // Stand tile + facing for each 3x3 appliance in GAME_ROOMS.FridgeManager.bins
    // (freezer cols 5-7 / fridge 12-14 rows 1-3, cupboard cols 1-3 / compost 16-18 rows 6-8).
    const BIN_STAND = {
      freezer: { col: 6, row: 4, dir: DIR_UP }, fridge: { col: 13, row: 4, dir: DIR_UP },
      cupboard: { col: 4, row: 7, dir: DIR_LEFT }, compost: { col: 15, row: 7, dir: DIR_RIGHT },
    };
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    const stand = (col, row, dir) => {
      const p = st.player;
      p.col = col; p.row = row;
      p.pixelX = col * TS; p.pixelY = row * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = dir;
    };
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    // Wait for the player to dismiss each teaching card.
    if (st.feedback) return { act: 'enter' };
    if (st.celebrating) return { act: 'wait', ms: 150 };
    if (st.heldItem) { const b = BIN_STAND[BIN[st.heldItem.id]]; stand(b.col, b.row, b.dir); return { act: 'enter' }; }
    const food = st.counterItems.find((c) => !c.picked);
    // The worktop spans rows 6-9: reach its top edge from row 5, its bottom edge from row 10.
    if (food) { if (food.row === 6) stand(food.col, 5, DIR_DOWN); else stand(food.col, food.row + 1, DIR_UP); return { act: 'enter' }; }
    return { act: 'wait', ms: 150 };
  }


  function stepMealPlanner() {
    const TS = 32, DIR_UP = 1;
    const SLOT = {
      lettuce: 'veg', tomato: 'veg', cucumber: 'veg', kale: 'veg', chicory: 'veg', pumpkin: 'veg',
      mushroom: 'veg', bell_pepper: 'veg', red_pepper: 'veg', corn: 'veg', leek: 'veg',
      strawberry: 'fruit', banana: 'fruit', apple: 'fruit', orange: 'fruit', cherry: 'fruit', mandarin: 'fruit',
      egg: 'protein', lentils: 'protein', chicken: 'protein', tofu: 'protein', tempeh: 'protein', fish: 'protein',
      bread: 'carb', rice: 'carb', pasta: 'carb',
    };
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    const faceTile = (tile) => {
      const p = st.player;
      p.col = tile.col; p.row = tile.row + 1;
      p.pixelX = p.col * TS; p.pixelY = p.row * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
    };
    const facePlate = () => faceTile({ col: 9, row: 7 });
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    if (st.phase === 'results') return { act: 'enter' };
    const plate = st.plates[st.activePlate];
    if (st.heldItem) { facePlate(); return { act: 'enter' }; }
    const open = plate.slots.find((s) => !s.item);
    if (!open) { facePlate(); return { act: 'enter' }; }
    const type = open.type;
    const fromFridge = st.fridge.find((f) => !f.used && SLOT[f.id] === type);
    if (fromFridge) { faceTile(fromFridge.tile); return { act: 'enter' }; }
    const fromMarket = st.market.find((m) => m.cat === type && m.id !== 'chicken')
      || st.market.find((m) => m.cat === type);
    if (fromMarket) { faceTile(fromMarket.tile); return { act: 'enter' }; }
    return { act: 'wait', ms: 150 };
  }

  function stepLeftoverChef() {
    const TS = 32, DIR_UP = 1;
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    const faceTile = (tile) => {
      const p = st.player;
      p.col = tile.col; p.row = tile.row + 1;
      p.pixelX = p.col * TS; p.pixelY = p.row * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
    };
    const faceIngredient = (item) => {
      const p = st.player;
      p.col = item.col < 10 ? item.col + 1 : item.col - 1;
      p.row = item.row;
      p.pixelX = p.col * TS; p.pixelY = p.row * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = item.col < 10 ? 2 : 3;
    };
    const facePot = () => faceTile({ col: 9, row: 7 });
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    if (st.celebrating) return { act: 'wait', ms: 150 };
    if (st.cooking) return { act: 'wait', ms: 150 };
    if (st.dishReveal) return st.dishRevealElapsed >= 0.6 ? { act: 'enter' } : { act: 'wait', ms: 150 };
    const goal = st.goals[st.goalIndex];
    if (!goal) return { act: 'wait', ms: 150 };
    if (st.heldItem) { facePot(); return { act: 'enter' }; }
    const potIds = st.potItems.map((i) => i.id);
    const needed = goal.atRisk.filter((id) => !potIds.includes(id));
    if (needed.length === 0 && st.potItems.length >= 2) { facePot(); return { act: 'enter' }; }
    const item = st.counterItems.find((c) => c.id === needed[0] && !c.picked);
    if (item) { faceIngredient(item); return { act: 'enter' }; }
    return { act: 'wait', ms: 150 };
  }

  // Mid-play predicates (in-browser).
  const fmCarryUp = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && s.heldItem && s.counterItems && s.counterItems.filter((i) => i.picked).length >= 3); };
  const mpPlateBuilding = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; if (!s || !s.plates) return false; return s.plates.reduce((n, p) => n + p.slots.filter((x) => x.item).length, 0) >= 3; };
  const lcPotLoaded = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && s.potItems && s.potItems.length >= 2); };
  const lcDishRevealUp = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && (s.dishReveal || s.factCard)); };

  // ── Island 3 room: approach (pier) + mentor dialog + clean room ──
  test('capture Island 3 exterior pier (boat at the dock)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.setBoatPosition({ col: 12, row: 17 }); // water abutting the foodwaste (NW) pier
      window.__playfood.goToScreen('hub');
    });
    await waitScreen(page, 'hub', 1500);
    await page.screenshot({ path: path.join(SHOTS, '13b_island3_approach.png') });
  });

  test('capture Island 3 room (mentor) + clean room', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      window.__playfood.state().setHero('braid');
      window.__playfood.goToIsland('foodwaste');
    });
    await waitScreen(page, 'island', 1400);
    await page.screenshot({ path: path.join(SHOTS, '13_island3.png') });       // Chef mentor dialog
    await page.evaluate(() => window.__playfood.press('Enter'));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, '13c_island3_room.png') });  // clean kitchen
  });

  // ── Island 3 per-game selection prompts (same walk paths as Islands 1–2) ──
  test('capture FridgeManager selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => { window.__playfood.state().setHero('braid'); window.__playfood.goToIsland('foodwaste'); });
    await waitScreen(page, 'island', 1400);
    await page.evaluate(() => window.__playfood.press('Enter')); // dismiss mentor dialog
    await page.waitForTimeout(500);
    // The kitchen's central column is blocked by a table row (row 6), so we route
    // up the clear col-6 lane, then across the top to face NPC 1 at (4,3).
    await page.evaluate(async () => {
      await window.__playfood.walk('left', 4);  // (10,13) → (6,13)
      await window.__playfood.walk('up', 9);    // (6,13)  → (6,4)  up the clear col-6 lane
      await window.__playfood.walk('left', 2);  // (6,4)   → (4,4)
      await window.__playfood.walk('up', 1);    // turn to face the NPC at (4,3)
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '13d_game7_select.png') });
  });

  test('capture MealPlanner selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid'); s.addCompletedMission('foodwaste', 1);
      window.__playfood.goToIsland('foodwaste');
    });
    await waitScreen(page, 'island', 1400);
    // Up the clear right-edge (col-18) lane, then across the top to NPC 2 at (15,3).
    await page.evaluate(async () => {
      await window.__playfood.walk('right', 8); // (10,13) → (18,13)
      await window.__playfood.walk('up', 9);    // (18,13) → (18,4) up the clear col-18 lane
      await window.__playfood.walk('left', 3);  // (18,4)  → (15,4)
      await window.__playfood.walk('up', 1);    // turn to face the NPC at (15,3)
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '13e_game8_select.png') });
  });

  test('capture LeftoverChef selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.addCompletedMission('foodwaste', 1); s.addCompletedMission('foodwaste', 2);
      window.__playfood.goToIsland('foodwaste');
    });
    await waitScreen(page, 'island', 1400);
    // NPC 3 at (15,10) sits in a furniture-fenced corner; approach it from ABOVE
    // via the clear right lane + the clear row 8, then step down to face it.
    await page.evaluate(async () => {
      await window.__playfood.walk('right', 8); // (10,13) → (18,13)
      await window.__playfood.walk('up', 5);    // (18,13) → (18,8)
      await window.__playfood.walk('left', 3);  // (18,8)  → (15,8) along the clear row 8
      await window.__playfood.walk('down', 1);  // (15,8)  → (15,9), facing DOWN at NPC (15,10)
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '13f_game9_select.png') });
  });

  // ── Game 7 — Fridge Guardians (FridgeManager): intro, carry-to-storage
  //    mid-play, and the kitchen-full win. Guided: no lose screen. ──
  test('capture FridgeManager intro + mid-play + win', async ({ page }) => {
    await bootMission(page, 'foodwaste', 1);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, '14_game7.png') }); // mission intro card
    await driveUntilState(page, stepFridgeManager, fmCarryUp);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'game7_play.png') });
    await driveToResult(page, stepFridgeManager);
    await shootResult(page, 'game7_win.png');
  });

  // ── Game 8 — The Chef's Menu (MealPlanner): intro, plate-building mid-play,
  //    and the balanced-plan win. Pinned to scenario 0 for determinism. ──
  test('capture MealPlanner intro + mid-play + win', async ({ page }) => {
    await bootMission(page, 'foodwaste', 2, 'en', '&scenario=0');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, '15_game8.png') }); // mission intro card
    await driveUntilState(page, stepMealPlanner, mpPlateBuilding);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'game8_play.png') });
    await driveToResult(page, stepMealPlanner);
    await shootResult(page, 'game8_win.png');
  });

  // ── Game 9 — Culinary Rescue (LeftoverChef): intro, rescue-pot mid-play, and
  //    the rescued-dish payoff. Its END screen is the island's shared generic
  //    "Mission Complete!" — byte-identical to Fridge Guardians' perfect run — so
  //    for a distinct, game-specific "win" frame we capture LeftoverChef's
  //    signature payoff instead: the cooked rescue dish + its verbatim food-safety
  //    fact card. Guided: no lose screen. ──
  test('capture LeftoverChef intro + mid-play + win', async ({ page }) => {
    await bootMission(page, 'foodwaste', 3);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, '16_game9.png') }); // mission intro card
    await driveUntilState(page, stepLeftoverChef, lcPotLoaded);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'game9_play.png') });
    await driveUntilState(page, stepLeftoverChef, lcDishRevealUp); // first successful rescue → dish reveal
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'game9_win.png') });
  });

  // ── Island 3 finishing: 3/3 completed room + greening 1/3 → 2/3 → 3/3 ──
  test('capture Island 3 room completed (3/3)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.addCompletedMission('foodwaste', 1); s.addCompletedMission('foodwaste', 2); s.addCompletedMission('foodwaste', 3);
      s.recordStars('foodwaste:FridgeManager', 3); s.recordStars('foodwaste:MealPlanner', 2); s.recordStars('foodwaste:LeftoverChef', 3);
      s.markCeremonySeen('foodwaste');
      window.__playfood.goToIsland('foodwaste');
    });
    await waitScreen(page, 'island', 1400);
    await page.screenshot({ path: path.join(SHOTS, 'island3_complete.png') });
  });

  const GREENING3 = [
    { done: [1],       file: 'island3_1of3.png' },
    { done: [1, 2],    file: 'island3_2of3.png' },
    { done: [1, 2, 3], file: 'island3_3of3.png' },
  ];
  for (const g of GREENING3) {
    test(`capture Island 3 greening — ${g.done.length} of 3`, async ({ page }) => {
      await page.goto(`/?testMode=1&lang=${LANG}`);
      await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
      await page.evaluate((done) => {
        const s = window.__playfood.state();
        s.setHero('braid');
        for (const id of done) s.addCompletedMission('foodwaste', id);
        s.setBoatPosition({ col: 11, row: 3 }); // northern shallow — frames the whole NW island
        window.__playfood.goToScreen('hub');
      }, g.done);
      await waitScreen(page, 'hub', 1500);
      await page.screenshot({ path: path.join(SHOTS, g.file) });
    });
  }

  // ════════════════════════════════════════════════════════════════════
  //  ISLAND 4 — Earth Protectors Island (circular). Same templates again.
  //  CompostCreator (Hook) is guided/no-fail (wrong bin bounces back), so it
  //  shows no lose. CircularCity (Practice) and Planetary Boundaries
  //  (Challenge) DO have a genuine, reachable fail — routing every resource to
  //  the landfill leak (accuracy → 0, gradeCircularCity passes only at ≥60%),
  //  or committing the high-impact option at every console (the ring stays
  //  ≥8 transgressed, passes only at ≤3) — so both show a real lose screen.
  //  Circular room geometry matches the others, so the walk paths are identical.
  // ════════════════════════════════════════════════════════════════════

  // Win-drive step functions, copied verbatim from the per-game specs
  // (compost-creator / circular-city / planetary-boundaries .spec.js).
  function stepCompostCreator() {
    const TS = 32, DIR_UP = 1;
    const BIN_COL = { compost: 3, plastic: 6, carton: 9, aluminium: 12, battery: 15 };
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    const stand = (col, row) => {
      const p = st.player;
      p.col = col; p.row = row;
      p.pixelX = col * TS; p.pixelY = row * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
    };
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    if (st.revealing || st.celebrating) return { act: 'wait', ms: 150 };
    if (st.heldItem) { stand(BIN_COL[st.heldItem.correctBin], 4); return { act: 'enter' }; }
    const stump = st.counterItems.find((c) => !c.picked);
    if (stump) { stand(stump.col, stump.row + 1); return { act: 'enter' }; }
    const floor = st.floorItems[0];
    if (floor) { stand(floor.col, floor.row + 1); return { act: 'enter' }; }
    return { act: 'wait', ms: 150 };
  }

  function stepCircularCity() {
    const TS = 32, DIR_UP = 1;
    const HUB_COL = { repair: 3, share: 6, recycle: 9, compost: 12, landfill: 16 };
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    const stand = (col, row) => {
      const p = st.player;
      p.col = col; p.row = row;
      p.pixelX = col * TS; p.pixelY = row * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
    };
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.reveal) return { act: 'enter' };
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    if (st.carrying) {
      const res = st.resources.find((r) => r.id === st.carrying);
      stand(HUB_COL[res.correctNode], 3);
      return { act: 'enter' };
    }
    const res = st.resources.find((r) => !r.routed);
    if (res) { stand(res.tile.col, res.tile.row + 1); return { act: 'enter' }; }
    return { act: 'wait', ms: 150 };
  }

  function stepPlanetaryBoundaries() {
    const TS = 32, DIR_UP = 1;
    const CONSOLE = {
      food: { col: 9, row: 2 }, energy: { col: 3, row: 6 },
      transport: { col: 15, row: 6 }, materials: { col: 9, row: 11 },
    };
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    const stand = (col, row) => {
      const p = st.player;
      p.col = col; p.row = row;
      p.pixelX = col * TS; p.pixelY = row * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
    };
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.reveal) return { act: 'enter' };
    if (st.applyStep) return st.applyStep.answer === null && st.applyStep.sel === null ? { act: 'press', key: 'ArrowRight' } : { act: 'enter' }; // Select an answer before continuing.
    if (st.choice) {
      { const c = st.consoles.find((q) => q.key === st.choice.consoleKey); const want = c.options.findIndex((o) => o.id === 'B'); // Find the mindful choice on the side used by this console.
        if (st.choice.sel !== want) return { act: 'press', key: want === 0 ? 'ArrowLeft' : 'ArrowRight' }; }
      return { act: 'enter' };
    }
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    const con = st.consoles.find((c) => !c.chosen);
    if (con) { const t = CONSOLE[con.key]; stand(t.col, t.row + 1); return { act: 'enter' }; }
    return { act: 'wait', ms: 150 };
  }

  // PlanetaryBoundaries: commit the HIGH-IMPACT option (A, sel 0) at every
  // console — the ring stays ≥8 transgressed, so the run fails.
  function stepPlanetaryBoundariesFail() {
    const TS = 32, DIR_UP = 1;
    const CONSOLE = {
      food: { col: 9, row: 2 }, energy: { col: 3, row: 6 },
      transport: { col: 15, row: 6 }, materials: { col: 9, row: 11 },
    };
    const cv = document.querySelector('canvas');
    const st = cv && cv._stateRef && cv._stateRef.current;
    const store = window.__playfood.state();
    if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
    if (!st || !st.player) return { act: 'wait', ms: 150 };
    const stand = (col, row) => {
      const p = st.player;
      p.col = col; p.row = row;
      p.pixelX = col * TS; p.pixelY = row * TS;
      p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
      p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
    };
    if (st.showMissionIntro) return { act: 'enter' };
    if (st.reveal) return { act: 'enter' };
    if (st.applyStep) return st.applyStep.answer === null && st.applyStep.sel === null ? { act: 'press', key: 'ArrowRight' } : { act: 'enter' }; // Select an answer before continuing.
    if (st.choice) {
      { const c = st.consoles.find((q) => q.key === st.choice.consoleKey); const want = c.options.findIndex((o) => o.id === 'A'); // Find the high-impact choice on the side used by this console.
        if (st.choice.sel !== want) return { act: 'press', key: want === 0 ? 'ArrowLeft' : 'ArrowRight' }; }
      return { act: 'enter' };
    }
    if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
    const con = st.consoles.find((c) => !c.chosen);
    if (con) { const t = CONSOLE[con.key]; stand(t.col, t.row + 1); return { act: 'enter' }; }
    return { act: 'wait', ms: 150 };
  }

  // Mid-play predicates (in-browser).
  const ccompCarryUp = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && s.heldItem && s.counterItems && s.counterItems.filter((i) => i.picked).length >= 4); };
  const ccRevealUp = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && s.reveal); };
  const pbChoiceUp = () => { const c = document.querySelector('canvas'); const s = c && c._stateRef && c._stateRef.current; return !!(s && s.choice); };

  // ── Island 4 room: approach (pier) + mentor dialog + clean room ──
  test('capture Island 4 exterior pier (boat at the dock)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.setBoatPosition({ col: 47, row: 22 }); // water abutting the circular (SE) pier
      window.__playfood.goToScreen('hub');
    });
    await waitScreen(page, 'hub', 1500);
    await page.screenshot({ path: path.join(SHOTS, '17b_island4_approach.png') });
  });

  test('capture Island 4 room (mentor) + clean room', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      window.__playfood.state().setHero('braid');
      window.__playfood.goToIsland('circular');
    });
    await waitScreen(page, 'island', 1400);
    await page.screenshot({ path: path.join(SHOTS, '17_island4.png') });       // Repair Engineer dialog
    await page.evaluate(() => window.__playfood.press('Enter'));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, '17c_island4_room.png') });  // clean workshop
  });

  // ── Island 4 per-game selection prompts ──
  test('capture CompostCreator selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => { window.__playfood.state().setHero('braid'); window.__playfood.goToIsland('circular'); });
    await waitScreen(page, 'island', 1400);
    await page.evaluate(() => window.__playfood.press('Enter')); // dismiss mentor dialog
    await page.waitForTimeout(500);
    // The workshop's central column is blocked by a workbench row (row 7), so we
    // route up the clear left-edge (col-1) lane, then across to NPC 1 at (4,3).
    await page.evaluate(async () => {
      await window.__playfood.walk('left', 9);  // (10,13) → (1,13)
      await window.__playfood.walk('up', 9);    // (1,13)  → (1,4)  up the clear col-1 lane
      await window.__playfood.walk('right', 3); // (1,4)   → (4,4)
      await window.__playfood.walk('up', 1);    // turn to face the NPC at (4,3)
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '17d_game10_select.png') });
  });

  test('capture CircularCity selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid'); s.addCompletedMission('circular', 1);
      window.__playfood.goToIsland('circular');
    });
    await waitScreen(page, 'island', 1400);
    // Up the clear right-edge (col-18) lane, then across the top to NPC 2 at (15,3).
    await page.evaluate(async () => {
      await window.__playfood.walk('right', 8); // (10,13) → (18,13)
      await window.__playfood.walk('up', 9);    // (18,13) → (18,4) up the clear col-18 lane
      await window.__playfood.walk('left', 3);  // (18,4)  → (15,4)
      await window.__playfood.walk('up', 1);    // turn to face the NPC at (15,3)
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '17e_game11_select.png') });
  });

  test('capture PlanetaryBoundaries selection prompt', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.addCompletedMission('circular', 1); s.addCompletedMission('circular', 2);
      window.__playfood.goToIsland('circular');
    });
    await waitScreen(page, 'island', 1400);
    // NPC 3 at (15,10) sits in a furniture-fenced corner; approach it from ABOVE
    // via the clear right lane + the clear row 8, then step down to face it.
    await page.evaluate(async () => {
      await window.__playfood.walk('right', 8); // (10,13) → (18,13)
      await window.__playfood.walk('up', 5);    // (18,13) → (18,8)
      await window.__playfood.walk('left', 3);  // (18,8)  → (15,8) along the clear row 8
      await window.__playfood.walk('down', 1);  // (15,8)  → (15,9), facing DOWN at NPC (15,10)
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '17f_game12_select.png') });
  });

  // ── Game 10 — The Super Bin (CompostCreator): intro, sorting mid-play, and
  //    the 12/12 win. Guided: no lose screen. ──
  test('capture CompostCreator intro + mid-play + win', async ({ page }) => {
    await bootMission(page, 'circular', 1);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, '18_game10.png') }); // mission intro card
    await driveUntilState(page, stepCompostCreator, ccompCarryUp);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'game10_play.png') });
    await driveToResult(page, stepCompostCreator);
    await shootResult(page, 'game10_win.png');
  });

  // ── Game 11 — The Smart Neighborhood (CircularCity): intro, the verbatim
  //    channel reveal mid-play, the leak-free win, and the all-landfill lose. ──
  test('capture CircularCity intro + mid-play + win', async ({ page }) => {
    await bootMission(page, 'circular', 2);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, '19_game11.png') }); // mission intro card
    await driveUntilState(page, stepCircularCity, ccRevealUp);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'game11_play.png') });
    await driveToResult(page, stepCircularCity);
    await shootResult(page, 'game11_win.png');
  });

  // CircularCity has no lose screen: a wrong hub or the landfill keeps the item in hand
  // (teach-don't-punish, redirectCircularResource). Capture that recovery instead.
  test('capture CircularCity wrong-hub recovery', async ({ page }) => {
    const HUB_COL = { repair: 3, share: 6, recycle: 9, compost: 12, landfill: 16 };
    const snapshot = () => page.evaluate(() => {
      const s = document.querySelector('canvas')._stateRef.current;
      return { carrying: s.carrying, routedCount: s.routedCount, correctCount: s.correctCount,
        firstTryCount: s.firstTryCount, hint: s.hintNodeKey, reveal: !!s.reveal,
        resources: s.resources.map((r) => ({ id: r.id, routed: r.routed, retried: !!r.retried })) };
    });
    const standAt = (col, row) => page.evaluate(({ col, row }) => {
      const p = document.querySelector('canvas')._stateRef.current.player;
      Object.assign(p, { col, row, dir: 1, pixelX: col * 32, pixelY: row * 32,
        fromX: col * 32, fromY: row * 32, toX: col * 32, toY: row * 32, moving: false, moveTimer: 0 });
    }, { col, row });
    const deliverTo = async (hub) => { await standAt(HUB_COL[hub], 3); await pressEnter(page); };

    await bootMission(page, 'circular', 2);
    await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.showMissionIntro === true);
    await pressEnter(page);
    await page.waitForFunction(() => {
      const s = document.querySelector('canvas')._stateRef.current;
      return !s.showMissionIntro && s.irisOpenness >= 1;
    });
    const first = await page.evaluate(() => {
      const r = document.querySelector('canvas')._stateRef.current.resources[0];
      return { id: r.id, correctNode: r.correctNode, col: r.tile.col, row: r.tile.row };
    });
    await standAt(first.col, first.row + 1);
    await pressEnter(page);
    await expect.poll(async () => (await snapshot()).carrying).toBe(first.id);

    // Wrong circular hub: still carried, not routed, no progress, hint points to the right hub.
    await deliverTo(['repair', 'share', 'recycle', 'compost'].find((hub) => hub !== first.correctNode));
    await expect.poll(async () => (await snapshot()).hint).toBe(first.correctNode);
    let s = await snapshot();
    expect(s).toMatchObject({ carrying: first.id, routedCount: 0, correctCount: 0 });
    expect(s.resources[0]).toEqual({ id: first.id, routed: false, retried: true });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'game11_recovery.png') });

    // Landfill: the leak card teaches, the item stays recoverable.
    await deliverTo('landfill');
    await expect.poll(async () => (await snapshot()).reveal).toBe(true);
    s = await snapshot();
    expect(s).toMatchObject({ carrying: first.id, routedCount: 0, correctCount: 0 });
    await pressEnter(page);
    await expect.poll(async () => (await snapshot()).reveal).toBe(false);

    // Correct hub: routed now, counted as a recovery rather than a first try.
    await deliverTo(first.correctNode);
    await expect.poll(async () => (await snapshot()).routedCount).toBe(1);
    s = await snapshot();
    expect(s).toMatchObject({ carrying: null, correctCount: 1, firstTryCount: 0 });
    expect(s.resources[0]).toMatchObject({ routed: true, retried: true });

    const nav = await driveToResult(page, stepCircularCity);
    expect(nav).toMatchObject({ passed: true, correct: 8, total: 8, leaks: 0, firstTryCount: 7, tier: 'great' });
    await shootResult(page, 'game11_recovery_result.png', 600);
  });

  // ── Game 12 — Planet in Harmony (PlanetaryBoundaries): intro, the boundary
  //    console choice mid-play, the safe-zone win, and the high-impact lose. ──
  test('capture PlanetaryBoundaries intro + mid-play + win', async ({ page }) => {
    await bootMission(page, 'circular', 3);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, '20_game12.png') }); // mission intro card
    await driveUntilState(page, stepPlanetaryBoundaries, pbChoiceUp);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'game12_play.png') });
    await driveToResult(page, stepPlanetaryBoundaries);
    await shootResult(page, 'game12_win.png');
  });

  test('capture PlanetaryBoundaries lose result', async ({ page }) => {
    await bootMission(page, 'circular', 3);
    await driveToResult(page, stepPlanetaryBoundariesFail);
    await shootResult(page, 'game12_lose.png', 600);
  });

  // ── Island 4 finishing: 3/3 completed room + greening 1/3 → 2/3 → 3/3 ──
  test('capture Island 4 room completed (3/3)', async ({ page }) => {
    await page.goto(`/?testMode=1&lang=${LANG}`);
    await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
    await nav(page, () => {
      const s = window.__playfood.state();
      s.setHero('braid');
      s.addCompletedMission('circular', 1); s.addCompletedMission('circular', 2); s.addCompletedMission('circular', 3);
      s.recordStars('circular:CompostCreator', 3); s.recordStars('circular:CircularCity', 2); s.recordStars('circular:PlanetaryBoundaries', 3);
      s.markCeremonySeen('circular');
      window.__playfood.goToIsland('circular');
    });
    await waitScreen(page, 'island', 1400);
    await page.screenshot({ path: path.join(SHOTS, 'island4_complete.png') });
  });

  const GREENING4 = [
    { done: [1],       file: 'island4_1of3.png' },
    { done: [1, 2],    file: 'island4_2of3.png' },
    { done: [1, 2, 3], file: 'island4_3of3.png' },
  ];
  for (const g of GREENING4) {
    test(`capture Island 4 greening — ${g.done.length} of 3`, async ({ page }) => {
      await page.goto(`/?testMode=1&lang=${LANG}`);
      await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
      await page.evaluate((done) => {
        const s = window.__playfood.state();
        s.setHero('braid');
        for (const id of done) s.addCompletedMission('circular', id);
        s.setBoatPosition({ col: 47, row: 34 }); // southern shore — frames the whole SE island
        window.__playfood.goToScreen('hub');
      }, g.done);
      await waitScreen(page, 'hub', 1500);
      await page.screenshot({ path: path.join(SHOTS, g.file) });
    });
  }
});
