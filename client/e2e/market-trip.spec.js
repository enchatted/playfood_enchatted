import { test, expect } from '@playwright/test';
import { bootMission, driveToResult, pressEnter, pressKey } from './helpers.js';

const browserOutputByPage = new WeakMap();

// Scan only visible main-page text and require a standalone namespace token.
// This intentionally excludes URL/source-page text while catching a missing
// i18next lookup rendered verbatim (for example, `market.over_money`).
const RAW_TRANSLATION_KEY = /(?:^|[\s"'“‘([{>:])((?:market|missionIntro|game)\.[a-z][A-Za-z0-9_.-]*)\b/g;

function rawTranslationKeys(visibleText) {
  return [...new Set([...visibleText.matchAll(RAW_TRANSLATION_KEY)].map((match) => match[1]))];
}

test.beforeEach(async ({ page }) => {
  const output = { consoleErrors: [], pageErrors: [] };
  browserOutputByPage.set(page, output);
  page.on('console', (message) => {
    if (message.type() === 'error') output.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => output.pageErrors.push(String(error)));
});

test.afterEach(async ({ page }) => {
  const output = browserOutputByPage.get(page);
  expect(output?.consoleErrors, 'browser console errors').toEqual([]);
  expect(output?.pageErrors, 'uncaught browser page errors').toEqual([]);

  const visibleText = await page.locator('body').innerText();
  expect(rawTranslationKeys(visibleText), 'visible raw i18n keys').toEqual([]);
});

/* Pin the month to test seasonal availability, basket choices and payment at the market. */
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
  if (st.checkoutOpen) return { act: 'enter' };                 // pay
  if (st.factTimer > 0 && !st.showingChoice) return { act: 'wait', ms: 150 };
  if (st.feedbackTimer > 0) return { act: 'wait', ms: 200 };

  if (st.showingChoice && st.activeStall) {
    // Best payable plan for the stalls not yet chosen (3 goals first).
    let baseMoney = 0; let baseMiles = 0; let seasonalOk = true;
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
      let money = baseMoney; let miles = baseMiles; let seasonal = seasonalOk; let possible = true;
      for (let i = 0; i < free.length; i++) {
        const local = (mask >> i) & 1;
        if (local && free[i].local.available === false) { possible = false; break; }
        const o = local ? free[i].local : free[i].imported;
        money += o.price; miles += o.miles;
        if (free[i].local.inSeason && !local) seasonal = false;
      }
      if (!possible || money > st.budget + 1e-9) continue;
      const score = (seasonal ? 2 : 0) + (miles <= st.transportTarget ? 1 : 0);
      if (!best || score > best.score) best = { mask, score };
    }
    const idx = free.indexOf(st.activeStall);
    const wantLocal = best ? Boolean((best.mask >> idx) & 1) : false;
    const wantIndex = wantLocal ? 0 : 1;
    if (st.choiceIndex !== wantIndex) return { act: 'press', key: wantLocal ? 'ArrowLeft' : 'ArrowRight' };
    return { act: 'enter' };
  }

  const stall = st.stalls.find((s) => !s.chosen);
  if (stall) { faceFromApproach(stall); return { act: 'enter' }; }
  return { act: 'wait', ms: 200 };
}

async function tapCanvasStateRect(page, rectKey) {
  const target = await page.evaluate((key) => {
    const canvas = document.querySelector('[data-testid="market-trip-canvas"]');
    const state = canvas?._stateRef?.current;
    const rect = state?.[key];
    if (!canvas || !rect) return null;
    const bounds = canvas.getBoundingClientRect();
    const logicalX = rect.x + rect.width / 2;
    const logicalY = rect.y + rect.height / 2;
    const hidpi = canvas.__hidpi;
    if (hidpi) {
      const dpr = canvas.width / bounds.width;
      return {
        x: bounds.left + (logicalX * hidpi.k + hidpi.ox) / dpr,
        y: bounds.top + (logicalY * hidpi.k + hidpi.oy) / dpr,
      };
    }
    return {
      x: bounds.left + (logicalX / canvas.width) * bounds.width,
      y: bounds.top + (logicalY / canvas.height) * bounds.height,
    };
  }, rectKey);
  expect(target, `${rectKey} is available`).not.toBeNull();
  await page.mouse.click(target.x, target.y);
}

async function openMarketStall(page, predicateSource = null) {
  const before = await page.evaluate((source) => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    const pick = source ? new Function('stall', `return (${source})(stall);`) : (item) => !item.chosen;
    const stall = state.stalls.find((item) => pick(item));
    const player = state.player;
    player.col = stall.approach.col;
    player.row = stall.approach.row;
    player.pixelX = player.col * 32;
    player.pixelY = player.row * 32;
    player.fromX = player.pixelX;
    player.fromY = player.pixelY;
    player.toX = player.pixelX;
    player.toY = player.pixelY;
    player.moving = false;
    player.moveTimer = 0;
    player.dir = stall.approach.dir;
    return state.stallsDone;
  }, predicateSource);
  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return Boolean(state?.actionPrompt) && state.enterWasDown === false;
  });
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.showingChoice);
  return before;
}

const openNextMarketStall = (page) => openMarketStall(page);

// Allow the checkout's opening key guard to expire.
async function waitCheckoutUnlocked(page) {
  await page.waitForFunction(() => !(document.querySelector('canvas')?._stateRef?.current?.checkoutLockT > 0));
}

async function waitForMarketFeedback(page) {
  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    const screen = window.__playfood?.state().currentScreen;
    return screen === 'result' || Boolean(state?.checkoutOpen)
      || Boolean(state && state.feedbackTimer <= 0);
  }, null, { timeout: 20_000 });
}

async function confirmChoice(page, choice, input) {
  if (input === 'touch') {
    await tapCanvasStateRect(page, choice === 'local' ? 'localChoiceRect' : 'importedChoiceRect');
  } else {
    await pressKey(page, choice === 'local' ? 'ArrowLeft' : 'ArrowRight');
    await pressEnter(page);
  }
}

async function buyNextMarketProduct(page, choice, input = 'keyboard') {
  const before = await openNextMarketStall(page);
  await confirmChoice(page, choice, input);
  await page.waitForFunction((previous) => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return window.__playfood?.state().currentScreen === 'result' || state?.stallsDone === previous + 1;
  }, before);
  await waitForMarketFeedback(page);
}

// Best payable choice for the next unchosen stall (seasonal + transport goals first).
async function feasibleNextChoice(page) {
  return page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    let baseMoney = 0; let baseMiles = 0; let seasonalOk = true;
    const free = [];
    for (const stall of state.stalls) {
      if (stall.chosen) {
        const option = stall.chosenLocal ? stall.local : stall.imported;
        baseMoney += option.price; baseMiles += option.miles;
        if (stall.local.inSeason && !stall.chosenLocal) seasonalOk = false;
      } else free.push(stall);
    }
    let best = null;
    for (let mask = 0; mask < 2 ** free.length; mask++) {
      let money = baseMoney; let miles = baseMiles; let seasonal = seasonalOk; let possible = true;
      for (let index = 0; index < free.length; index++) {
        const local = Boolean(mask & (1 << index));
        if (local && free[index].local.available === false) { possible = false; break; }
        const option = local ? free[index].local : free[index].imported;
        money += option.price; miles += option.miles;
        if (free[index].local.inSeason && !local) seasonal = false;
      }
      if (!possible || money > state.budget + 1e-9) continue;
      const score = (seasonal ? 2 : 0) + (miles <= state.transportTarget ? 1 : 0);
      if (!best || score > best.score) best = { mask, score };
    }
    return best && (best.mask & 1) ? 'local' : 'imported';
  });
}

test('2.2 Market Trip — keeps one stable shell through instructions and play', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootMission(page, 'local', 2, 'el');

  const receipt = page.getByTestId('market-trip-receipt');
  const guidance = page.getByTestId('market-trip-guidance');
  await expect(receipt).toBeVisible();
  await expect(guidance).toBeVisible();

  const readShell = () => page.evaluate(() => {
    const plainRect = (testId) => {
      const rect = document.querySelector(`[data-testid="${testId}"]`).getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };
    return {
      board: plainRect('market-trip-board'),
      canvas: plainRect('market-trip-canvas-stage'),
      receipt: plainRect('market-trip-receipt'),
      guidance: plainRect('market-trip-guidance'),
    };
  });
  const before = await readShell();

  await pressEnter(page);
  await expect(receipt).toBeVisible();
  await expect(guidance).toBeVisible();
  await expect(page.locator('.market-trip')).not.toHaveClass(/intro-open/);
  const after = await readShell();
  // The readable intro intentionally fills the board. Its canvas stage is an
  // overlay; the outer shell, receipt and guidance must keep their own footprint.
  expect(before.canvas.width).toBeGreaterThan(after.canvas.width);

  for (const key of ['board', 'receipt', 'guidance']) {
    expect(Math.abs(after[key].left - before[key].left), `${key} left shift`).toBeLessThanOrEqual(1);
    expect(Math.abs(after[key].top - before[key].top), `${key} top shift`).toBeLessThanOrEqual(1);
    expect(Math.abs(after[key].width - before[key].width), `${key} width shift`).toBeLessThanOrEqual(1);
    expect(Math.abs(after[key].height - before[key].height), `${key} height shift`).toBeLessThanOrEqual(1);
  }
});

test('2.2 Market Trip — intro source opens the verified EU local-food explanation', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el');

  const popupPromise = page.waitForEvent('popup');
  await page.keyboard.press('s');
  const sourcePage = await popupPromise;
  await sourcePage.waitForLoadState('domcontentloaded');

  expect(sourcePage.url()).toContain('source.html?src=eu-local-food-systems');
  await expect(sourcePage.locator('#title')).toHaveText('Report on Local Farming and Direct Sales');
  await expect(sourcePage.locator('#main')).toContainText('There is no uniform definition');
  await expect(sourcePage.locator('#main')).not.toContainText('400 km');
  await sourcePage.close();
});

test('2.2 Market Trip — choice source works with S and direct touch without buying', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  await openNextMarketStall(page);

  const keyboardPopup = page.waitForEvent('popup');
  await page.keyboard.press('s');
  const keyboardSource = await keyboardPopup;
  await keyboardSource.waitForLoadState('domcontentloaded');
  expect(keyboardSource.url()).toContain('source.html?src=eu-local-food-systems');
  await keyboardSource.close();

  const touchPopup = page.waitForEvent('popup');
  await tapCanvasStateRect(page, 'choiceSourceRect');
  const touchSource = await touchPopup;
  await touchSource.waitForLoadState('domcontentloaded');
  expect(touchSource.url()).toContain('source.html?src=eu-local-food-systems');
  await touchSource.close();

  const state = await page.evaluate(() => {
    const current = document.querySelector('canvas')._stateRef.current;
    return { stallsDone: current.stallsDone, showingChoice: current.showingChoice };
  });
  expect(state).toEqual({ stallsDone: 0, showingChoice: true });
});

test('2.2 Market Trip — opens a booth from either edge of its visible counter', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);

  const placeAtCounterEdge = async (offset) => {
    await page.evaluate((edgeOffset) => {
      const state = document.querySelector('[data-testid="market-trip-canvas"]')._stateRef.current;
      const stall = state.stalls.find((item) => !item.chosen);
      const player = state.player;
      player.col = stall.col + edgeOffset;
      player.row = stall.approach.row;
      player.pixelX = player.col * 32;
      player.pixelY = player.row * 32;
      player.fromX = player.pixelX;
      player.fromY = player.pixelY;
      player.toX = player.pixelX;
      player.toY = player.pixelY;
      player.moving = false;
      player.moveTimer = 0;
      player.dir = stall.approach.dir;
      state.actionPrompt = null;
      state.enterWasDown = false;
    }, offset);
    await page.waitForFunction(() => Boolean(
      document.querySelector('[data-testid="market-trip-canvas"]')?._stateRef?.current?.actionPrompt,
    ));
  };

  await placeAtCounterEdge(-1);
  await placeAtCounterEdge(1);
  await pressEnter(page);

  const opened = await page.evaluate(() => {
    const state = document.querySelector('[data-testid="market-trip-canvas"]')._stateRef.current;
    return {
      showingChoice: state.showingChoice,
      activeCol: state.activeStall?.col,
      playerCol: state.player.col,
    };
  });
  expect(opened.showingChoice).toBe(true);
  expect(opened.activeCol).toBe(opened.playerCol - 1);
});

test('2.2 Market Trip — pause and resume preserve an open choice', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  await openNextMarketStall(page);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-pause-overlay="menu"]')).toBeVisible();
  await expect(page.getByTestId('market-trip-receipt')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showingChoice)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-pause-overlay="menu"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showingChoice)).toBe(true);
});

test('2.2 Market Trip — nothing is pre-selected and the chosen option is clearly marked', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  await openNextMarketStall(page);

  const selectedChoice = () => page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const state = canvas._stateRef.current;
    const scale = canvas.__hidpi.k * canvas.getBoundingClientRect().width / canvas.width;
    const rect = state.selectedChoiceRect;
    const expected = state.choiceIndex === 0 ? state.localChoiceRect : state.importedChoiceRect;
    return {
      index: state.choiceIndex,
      label: state.selectedChoiceLabel,
      matchesExpectedCard: Boolean(rect && expected
        && rect.x === expected.x && rect.y === expected.y
        && rect.width === expected.width && rect.height === expected.height),
      hasLabelRect: Boolean(state.selectedChoiceLabelRect?.width > 0),
      labelIsCompact: state.selectedChoiceLabelRect?.width * scale <= 140,
    };
  });

  expect(await selectedChoice()).toEqual({
    index: -1, label: null, matchesExpectedCard: false, hasLabelRect: false, labelIsCompact: false,
  });
  // Enter alone does not buy anything while no card is selected.
  await pressEnter(page);
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.stallsDone)).toBe(0);

  await pressKey(page, 'ArrowRight');
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.choiceIndex === 1);
  expect(await selectedChoice()).toEqual({
    index: 1, label: 'ΕΠΙΛΕΓΜΕΝΟ', matchesExpectedCard: true, hasLabelRect: true, labelIsCompact: true,
  });

  await pressKey(page, 'ArrowLeft');
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.choiceIndex === 0);
  expect(await selectedChoice()).toEqual({
    index: 0, label: 'ΕΠΙΛΕΓΜΕΝΟ', matchesExpectedCard: true, hasLabelRect: true, labelIsCompact: true,
  });
});

test('2.2 Market Trip — Q (touch B) closes a stall without buying', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  await openNextMarketStall(page);
  await pressKey(page, 'ArrowLeft');
  await pressKey(page, 'q');
  await page.waitForFunction(() => !document.querySelector('canvas')._stateRef.current.showingChoice);
  const state = await page.evaluate(() => {
    const current = document.querySelector('canvas')._stateRef.current;
    return { stallsDone: current.stallsDone, money: current.moneySpent, miles: current.milesUsed };
  });
  expect(state).toEqual({ stallsDone: 0, money: 0, miles: 0 });
});

test('2.2 Market Trip — uses explicit child-facing guidance and choice names', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
  const guidance = page.getByTestId('market-trip-guidance');
  await expect(guidance).toHaveText('Γέμισε το καλάθι με 8 προϊόντα. Κοίτα την εποχή, την τιμή και τους πόντους μεταφοράς.');

  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  await openNextMarketStall(page);
  await expect(guidance).toHaveText('Διάλεξε μία κάρτα και πάτησε Enter, Space ή A. Με Q ή B φεύγεις χωρίς αγορά.');

  const labels = await page.evaluate(() => {
    const strings = document.querySelector('canvas')._stateRef.current.strings;
    return { local: strings.localChoice, imported: strings.importedChoice };
  });
  expect(labels).toEqual({ local: 'Τοπική επιλογή', imported: 'Εισαγόμενη επιλογή' });
});

test('2.2 Market Trip — the market knows the country and month (Greek September)', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
  await expect(page.getByTestId('market-trip-scenario')).toContainText('Σεπτέμβριος');
  const market = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const byKey = Object.fromEntries(state.stalls.map((stall) => [stall.nameKey, stall.local]));
    return {
      country: state.marketScenario.country,
      budget: state.budget,
      target: state.transportTarget,
      tomatoesInSeason: byKey['market.tomatoes'].inSeason,
      strawberriesInSeason: byKey['market.strawberries'].inSeason,
      tomatoPrice: byKey['market.tomatoes'].price,
      strawberryPrice: byKey['market.strawberries'].price,
      honeyCraft: byKey['market.honey'].craft,
    };
  });
  expect(market).toEqual({
    country: 'greece', budget: 15.5, target: 24,
    tomatoesInSeason: true, strawberriesInSeason: false,
    tomatoPrice: 1, strawberryPrice: 4, honeyCraft: true,
  });
});

test('2.2 Market Trip — a food without a local season can only be bought imported (Belgian oranges)', async ({ page }) => {
  await bootMission(page, 'local', 2, 'nl', '&mtMonth=january');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  await openMarketStall(page, "(stall) => stall.nameKey === 'market.oranges'");
  await pressKey(page, 'ArrowLeft');
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.choiceIndex)).toBe(-1);
  await tapCanvasStateRect(page, 'localChoiceRect');
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.stallsDone)).toBe(0);
  await pressKey(page, 'ArrowRight');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.stallsDone === 1);
  const orange = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.stalls
    .find((stall) => stall.nameKey === 'market.oranges'));
  expect(orange.chosenLocal).toBe(false);
  expect(orange.local.available).toBe(false);
});

test('2.2 Market Trip — tapping an imported choice card buys it exactly once', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await bootMission(page, 'local', 2, 'el');
  await pressEnter(page);
  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return state?.irisOpenness >= 1;
  });

  const expected = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const stall = state.stalls.find((item) => !item.chosen);
    const player = state.player;
    player.col = stall.approach.col;
    player.row = stall.approach.row;
    player.pixelX = player.col * 32;
    player.pixelY = player.row * 32;
    player.fromX = player.pixelX;
    player.fromY = player.pixelY;
    player.toX = player.pixelX;
    player.toY = player.pixelY;
    player.moving = false;
    player.moveTimer = 0;
    player.dir = stall.approach.dir;
    return { price: stall.imported.price, miles: stall.imported.miles };
  });

  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return Boolean(state?.actionPrompt) && state.enterWasDown === false;
  });
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.showingChoice);
  await tapCanvasStateRect(page, 'importedChoiceRect');

  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.stallsDone === 1, null, { timeout: 3000 });
  const result = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const chosen = state.stalls.find((item) => item.chosen);
    return {
      stallsDone: state.stallsDone,
      chosenLocal: chosen?.chosenLocal,
      money: state.moneySpent,
      miles: state.milesUsed,
    };
  });

  expect(result).toEqual({
    stallsDone: 1,
    chosenLocal: false,
    money: expected.price,
    miles: expected.miles,
  });
});

test('2.2 Market Trip — purchase result appears as a popup while the guidance ribbon keeps its own job', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el');
  const mentor = page.getByTestId('market-trip-mentor');
  const guidance = page.getByTestId('market-trip-guidance');
  const feedbackPopup = page.getByTestId('market-trip-feedback-popup');
  const welcomeText = await mentor.innerText();

  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  await openNextMarketStall(page);
  await tapCanvasStateRect(page, 'importedChoiceRect');

  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return Boolean(state?.feedbackText && state?.stallsDone === 1);
  }, null, { timeout: 3000 });

  const feedbackText = await page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.feedbackText
  ));
  await expect(mentor).not.toHaveText(welcomeText);
  await expect(feedbackPopup).toBeVisible();
  await expect(feedbackPopup).toContainText(feedbackText);
  await expect(guidance).not.toHaveText(feedbackText);

  const geometry = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const popup = document.querySelector('[data-testid="market-trip-feedback-popup"]')?.getBoundingClientRect();
    const stage = document.querySelector('[data-testid="market-trip-canvas-stage"]')?.getBoundingClientRect();
    return {
      feedbackRect: state.feedbackRect,
      feedbackPlayerPoint: state.feedbackPlayerPoint,
      mentorBubbleRect: state.mentorBubbleRect,
      actionPrompt: state.actionPrompt,
      popup: popup && { top: popup.top, right: popup.right, bottom: popup.bottom, left: popup.left },
      stage: stage && { top: stage.top, right: stage.right, bottom: stage.bottom, left: stage.left },
    };
  });
  expect(geometry.feedbackRect).toBeNull();
  expect(geometry.feedbackPlayerPoint).toBeNull();
  expect(geometry.mentorBubbleRect).toBeNull();
  expect(geometry.actionPrompt).toBeNull();
  expect(geometry.popup.top).toBeGreaterThanOrEqual(geometry.stage.top);
  expect(geometry.popup.left).toBeGreaterThanOrEqual(geometry.stage.left);
  expect(geometry.popup.right).toBeLessThanOrEqual(geometry.stage.right);
});

test('2.2 Market Trip — a bought stall can be re-opened to change your mind, without scoring twice', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  await buyNextMarketProduct(page, 'local');
  const afterFirst = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const stall = state.stalls.find((item) => item.chosen);
    return { key: stall.nameKey, money: state.moneySpent, imported: stall.imported.price };
  });
  const scoreBefore = await page.getByText(/Σκορ:/).innerText();

  // Right after buying, the same stall does not prompt again until the child steps away.
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.actionPrompt)).toBeNull();
  await page.evaluate(() => {
    // Step into the central market street (row 7), away from every booth.
    const player = document.querySelector('canvas')._stateRef.current.player;
    player.row = 7; player.pixelY = 7 * 32; player.fromY = player.toY = player.pixelY;
  });
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.justBoughtStall === null);

  await openMarketStall(page, `(stall) => stall.nameKey === '${afterFirst.key}'`);
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.choiceIndex)).toBe(0);
  await pressKey(page, 'ArrowRight');
  await pressEnter(page);
  await page.waitForFunction(() => !document.querySelector('canvas')._stateRef.current.showingChoice);

  const afterChange = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      stallsDone: state.stallsDone,
      money: state.moneySpent,
      chosenLocal: state.stalls.find((item) => item.chosen).chosenLocal,
    };
  });
  expect(afterChange).toEqual({ stallsDone: 1, money: afterFirst.imported, chosenLocal: false });
  await expect(page.getByText(/Σκορ:/)).toHaveText(scoreBefore);
});

test('2.2 Market Trip — direct touch can complete a balanced basket and pay at the checkout', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);

  for (let purchase = 0; purchase < 8; purchase++) {
    const choice = await feasibleNextChoice(page);
    await buyNextMarketProduct(page, choice, 'touch');
  }

  await expect(page.getByTestId('market-trip-checkout')).toBeVisible();
  await page.getByTestId('market-trip-checkout-pay').click();
  await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result');
  const navigation = await page.evaluate(() => window.__playfood.state().navigationData);
  expect(navigation.passed).toBe(true);
  expect(navigation.stars).toBe(3);
});

test('2.2 Market Trip — all-local shopping stops at the checkout, never mid-shop', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);

  for (let purchase = 0; purchase < 8; purchase++) {
    await buyNextMarketProduct(page, 'local');
    expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('game');
  }

  await expect(page.getByTestId('market-trip-checkout')).toBeVisible();
  await expect(page.getByTestId('market-trip-checkout-missing')).toContainText('Λείπουν 2,50 €');
  await expect(page.getByTestId('market-trip-checkout-pay')).toBeDisabled();
  await pressEnter(page);
  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('game');

  // Change something: back to the market, swap two extras to imported, then pay.
  await page.getByTestId('market-trip-checkout-change').click();
  await expect(page.getByTestId('market-trip-checkout')).toHaveCount(0);
  await openMarketStall(page, "(stall) => stall.nameKey === 'market.strawberries'");
  await pressKey(page, 'ArrowRight');
  await pressEnter(page);
  await waitForMarketFeedback(page);
  await expect(page.getByTestId('market-trip-checkout')).toHaveCount(0);
  await openMarketStall(page, "(stall) => stall.nameKey === 'market.honey'");
  await pressKey(page, 'ArrowRight');
  await pressEnter(page);
  await expect(page.getByTestId('market-trip-checkout')).toBeVisible();
  await expect(page.getByTestId('market-trip-checkout-pay')).toBeEnabled();
  await waitCheckoutUnlocked(page);
  await pressEnter(page);

  await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result');
  const navigation = await page.evaluate(() => window.__playfood.state().navigationData);
  expect(navigation.passed).toBe(true);
  expect(navigation.stars).toBe(3);
  expect(navigation.marketRecap.goals).toEqual({ money: true, seasonal: true, transport: true });
  await expect(page.getByTestId('market-trip-result-goals')).toBeVisible();
  await expect(page.getByTestId('market-trip-result-learned')).toContainText('Τι έμαθες');
});

test('2.2 Market Trip — the cheapest (all-imported) basket earns one star', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);

  for (let purchase = 0; purchase < 8; purchase++) {
    await buyNextMarketProduct(page, 'imported');
  }
  await expect(page.getByTestId('market-trip-checkout')).toBeVisible();
  // A quick second Enter must not pay before the child has seen the review.
  await pressEnter(page);
  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('game');
  await waitCheckoutUnlocked(page);
  await pressEnter(page);
  await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result');
  const navigation = await page.evaluate(() => window.__playfood.state().navigationData);
  expect(navigation.passed).toBe(true);
  expect(navigation.stars).toBe(1);
  expect(navigation.marketRecap.goals).toEqual({ money: true, seasonal: false, transport: false });
});

test('2.2 Market Trip — the instructions card hides the checkout and never pays by itself', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
  await pressEnter(page);
  await page.evaluate(() => {
    const st = document.querySelector('[data-testid="market-trip-canvas"]')._stateRef.current;
    let money = 0;
    let miles = 0;
    st.stalls.forEach((stall) => {
      stall.chosen = true;
      stall.chosenLocal = false;
      money += stall.imported.price;
      miles += stall.imported.miles;
    });
    st.moneySpent = money;
    st.milesUsed = miles;
    st.stallsDone = 8;
    st.checkoutOpen = true;
  });
  await expect(page.getByTestId('market-trip-checkout-pay')).toBeEnabled();

  // The child opens the instructions over the checkout and taps where «pay» was.
  await page.evaluate(() => {
    document.querySelector('[data-testid="market-trip-canvas"]')._stateRef.current.showMissionIntro = true;
  });
  await expect(page.getByTestId('market-trip-checkout')).toHaveCount(0);
  await expect(page.getByTestId('market-trip-checkout-button')).toHaveCount(0);
  await page.evaluate(() => {
    document.querySelector('[data-testid="market-trip-canvas"]')._stateRef.current.payRequested = true;
  });
  await page.waitForTimeout(150);

  await pressEnter(page); // closes the instructions card only
  await expect(page.getByTestId('market-trip-checkout')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => ({
    screen: window.__playfood.state().currentScreen,
    paid: Boolean(document.querySelector('[data-testid="market-trip-canvas"]')._stateRef.current.paid),
  }))).toEqual({ screen: 'game', paid: false });
});

test('2.2 Market Trip — after «change something» the stall in front of the child opens at once', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);
  for (let purchase = 0; purchase < 8; purchase++) await buyNextMarketProduct(page, 'local');
  await expect(page.getByTestId('market-trip-checkout')).toBeVisible();
  const last = await page.evaluate(() => document.querySelector('canvas')._stateRef.current.justBoughtStall?.nameKey);
  expect(last).toBeTruthy();

  await page.getByTestId('market-trip-checkout-change').click();
  await expect(page.getByTestId('market-trip-checkout')).toHaveCount(0);
  // Still facing the stall bought last: Enter opens it straight away.
  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return Boolean(state?.actionPrompt) && state.enterWasDown === false;
  });
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.showingChoice);
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.activeStall.nameKey)).toBe(last);
});

test('2.2 Market Trip — is untimed so an incomplete basket remains playable', async ({ page }) => {
  await bootMission(page, 'local', 2, 'el');
  await pressEnter(page);
  await page.waitForFunction(() => document.querySelector('canvas')?._stateRef?.current?.irisOpenness >= 1);

  await expect(page.getByTestId('market-trip-timer')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('game');
});

test('2.2 Market Trip — tablet landscape keeps the receipt beside the market', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await bootMission(page, 'local', 2, 'el');
  await pressEnter(page);

  const budgetValues = page.locator('[data-market-budget-value]');
  const goals = page.getByTestId('market-trip-goals');
  await expect(page.getByTestId('market-trip-timer')).toHaveCount(0);
  await expect(budgetValues).toHaveCount(2);
  await expect(budgetValues.nth(0)).toBeVisible();
  await expect(budgetValues.nth(1)).toBeVisible();
  await expect(goals).toBeVisible();

  const geometry = await page.evaluate(() => {
    const board = document.querySelector('[data-testid="market-trip-board"]');
    const stage = document.querySelector('[data-testid="market-trip-canvas-stage"]');
    const canvas = document.querySelector('[data-testid="market-trip-canvas"]');
    const receipt = document.querySelector('[data-testid="market-trip-receipt"]');
    if (!board || !stage || !canvas || !receipt) return null;

    const boardRect = board.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const receiptRect = receipt.getBoundingClientRect();
    return {
      board: { left: boardRect.left, right: boardRect.right },
      stage: { top: stageRect.top, left: stageRect.left, right: stageRect.right, width: stageRect.width },
      canvas: { width: canvasRect.width },
      receipt: {
        top: receiptRect.top, bottom: receiptRect.bottom, left: receiptRect.left, right: receiptRect.right,
        height: receiptRect.height,
      },
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry).not.toBeNull();
  expect(Math.abs(geometry.receipt.top - geometry.stage.top)).toBeLessThanOrEqual(1);
  expect(geometry.receipt.left).toBeGreaterThanOrEqual(geometry.stage.right);
  expect(geometry.receipt.left - geometry.stage.right).toBeLessThanOrEqual(6);
  expect(geometry.receipt.height).toBeGreaterThanOrEqual(500);
  expect(geometry.receipt.right - geometry.receipt.left).toBeGreaterThanOrEqual(300);
  expect(geometry.canvas.width).toBeGreaterThanOrEqual(1024 * 0.60);
  expect(Math.abs(geometry.board.left - (1024 - geometry.board.right))).toBeLessThanOrEqual(1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.viewportHeight);
});

test('2.2 Market Trip — short landscape keeps the compact receipt inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
  await pressEnter(page);

  await page.evaluate(() => {
    const state = document.querySelector('[data-testid="market-trip-canvas"]')?._stateRef?.current;
    state.stalls.forEach((stall, index) => {
      stall.chosen = true;
      stall.chosenLocal = index % 2 === 0 && stall.local.available !== false;
    });
    state.stallsDone = 7; // keep the checkout closed; the receipt shows all eight rows
  });
  await expect(page.locator('[data-testid="market-trip-item"]')).toHaveCount(8);

  const geometry = await page.evaluate(() => {
    const receipt = document.querySelector('[data-testid="market-trip-receipt"]');
    const body = document.querySelector('.market-trip-receipt-body');
    const items = document.querySelector('.market-trip-items');
    const budgetValues = [...document.querySelectorAll('[data-market-budget-value]')];
    const stage = document.querySelector('[data-testid="market-trip-canvas-stage"]');
    const mentor = document.querySelector('[data-testid="market-trip-mentor"]');
    const cards = [...document.querySelectorAll('[data-testid="market-trip-item"]')];
    const visibleItemText = [...document.querySelectorAll('.market-trip-items [data-child-text]')]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
    if (!receipt || !body || !items || !stage || !mentor || budgetValues.length !== 2 || cards.length !== 8) return null;

    const receiptRect = receipt.getBoundingClientRect();
    const insideReceipt = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.left >= receiptRect.left - 1 && rect.right <= receiptRect.right + 1
        && rect.top >= receiptRect.top - 1 && rect.bottom <= receiptRect.bottom + 1;
    };
    const stageRect = stage.getBoundingClientRect();
    const requiredVisible = [...budgetValues, mentor, ...cards, ...visibleItemText];
    return {
      receiptHeight: receiptRect.height,
      receiptWidth: receiptRect.width,
      receiptGap: receiptRect.left - stageRect.right,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      itemGridScrollWidth: items.scrollWidth,
      itemGridClientWidth: items.clientWidth,
      requiredVisibleInsideReceipt: requiredVisible.every(insideReceipt),
      visibleItemTextCount: visibleItemText.length,
      pageScrollWidth: document.documentElement.scrollWidth,
      pageScrollHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry.receiptHeight).toBeGreaterThanOrEqual(250);
  expect(geometry.receiptWidth).toBeGreaterThanOrEqual(290);
  expect(geometry.receiptGap).toBeGreaterThanOrEqual(0);
  expect(geometry.receiptGap).toBeLessThanOrEqual(6);
  expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.bodyClientWidth);
  expect(geometry.itemGridScrollWidth).toBeLessThanOrEqual(geometry.itemGridClientWidth);
  expect(geometry.requiredVisibleInsideReceipt, JSON.stringify(geometry)).toBe(true);
  expect(geometry.visibleItemTextCount).toBeGreaterThanOrEqual(16);
  expect(geometry.pageScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.pageScrollHeight).toBeLessThanOrEqual(geometry.viewportHeight);
});

test('2.2 Market Trip — desktop keeps a narrow full-height basket beside the canvas', async ({ page }) => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await bootMission(page, 'local', 2, 'el');
    await pressEnter(page);

    const geometry = await page.evaluate(() => {
      const board = document.querySelector('[data-testid="market-trip-board"]');
      const stage = document.querySelector('[data-testid="market-trip-canvas-stage"]');
      const canvas = document.querySelector('[data-testid="market-trip-canvas"]');
      const receipt = document.querySelector('[data-testid="market-trip-receipt"]');
      const meterLabel = document.querySelector('.market-trip-goal-text');
      const meterValue = document.querySelector('[data-market-budget-value]');
      const mentor = document.querySelector('[data-testid="market-trip-mentor"]');
      const title = document.querySelector('.market-trip-receipt-title');
      if (!board || !stage || !canvas || !receipt || !meterLabel || !meterValue || !mentor || !title) return null;
      const boardRect = board.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const receiptRect = receipt.getBoundingClientRect();
      return {
        boardWidth: boardRect.width,
        canvasWidth: canvasRect.width,
        receiptWidth: receiptRect.width,
        receiptHeight: receiptRect.height,
        stageHeight: stageRect.height,
        stageRight: stageRect.right,
        receiptLeft: receiptRect.left,
        stageTop: stageRect.top,
        stageBottom: stageRect.bottom,
        receiptTop: receiptRect.top,
        receiptBottom: receiptRect.bottom,
        receiptLabelFont: parseFloat(getComputedStyle(meterLabel).fontSize),
        receiptValueFont: parseFloat(getComputedStyle(meterValue).fontSize),
        mentorFont: parseFloat(getComputedStyle(mentor).fontSize),
        titleFont: parseFloat(getComputedStyle(title).fontSize),
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry.receiptLeft).toBeGreaterThanOrEqual(geometry.stageRight);
    expect(Math.abs(geometry.receiptTop - geometry.stageTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.receiptBottom - geometry.stageBottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.receiptHeight - geometry.stageHeight)).toBeLessThanOrEqual(1);
    expect(geometry.receiptWidth).toBeGreaterThanOrEqual(320);
    expect(geometry.receiptWidth).toBeLessThanOrEqual(340);
    expect(geometry.titleFont).toBeGreaterThanOrEqual(15);
    expect(geometry.receiptLabelFont).toBeGreaterThanOrEqual(15);
    expect(geometry.receiptValueFont).toBeGreaterThanOrEqual(17);
    expect(geometry.mentorFont).toBeGreaterThanOrEqual(14);
    expect(geometry.canvasWidth).toBeGreaterThanOrEqual(viewport.width * 0.65);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.viewportHeight);
  }
});

test('2.2 Market Trip — matches the Island 1 header and stays untimed', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await bootMission(page, 'local', 2, 'el');
  await pressEnter(page);

  await expect(page.locator('.scorebar-stars-label')).toHaveCount(0);
  const stars = page.getByLabel(/out of 3 stars/);
  const receipt = page.getByTestId('market-trip-receipt');
  await expect(stars).toBeVisible();
  await expect(receipt).toBeVisible();
  await expect(page.getByTestId('market-trip-timer')).toHaveCount(0);

  const geometry = await page.evaluate(() => {
    const starsRect = document.querySelector('[aria-label$="out of 3 stars"]')?.getBoundingClientRect();
    const receiptRect = document.querySelector('[data-testid="market-trip-receipt"]')?.getBoundingClientRect();
    const plainRect = (rect) => rect && ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    return {
      starsRect: plainRect(starsRect),
      receiptRect: plainRect(receiptRect),
      viewportWidth: innerWidth,
    };
  });

  expect(Math.abs((geometry.starsRect.left + geometry.starsRect.width / 2) - geometry.viewportWidth / 2)).toBeLessThanOrEqual(1);
  expect(geometry.receiptRect.width).toBeGreaterThan(0);
});

test('2.2 Market Trip — header controls keep 44px touch targets without shifting the centred stars', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await bootMission(page, 'local', 2, 'el');
    await pressEnter(page);

    const geometry = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button')].filter((button) => (
        /(Πώς παίζω|Παύση|Έξοδος)/.test(button.textContent)
      ));
      const header = controls[0]?.parentElement?.parentElement;
      const stars = document.querySelector('[aria-label$="out of 3 stars"]');
      const receipt = document.querySelector('[data-testid="market-trip-receipt"]');
      const plainRect = (node) => {
        const rect = node?.getBoundingClientRect();
        return rect && {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      return {
        controls: controls.map((button) => ({ label: button.textContent.trim(), rect: plainRect(button) })),
        header: plainRect(header),
        stars: plainRect(stars),
        receipt: plainRect(receipt),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      };
    });

    expect(geometry.controls).toHaveLength(3);
    for (const control of geometry.controls) {
      expect(control.rect.width, `${viewport.width}px ${control.label} width`).toBeGreaterThanOrEqual(44);
      expect(control.rect.height, `${viewport.width}px ${control.label} height`).toBeGreaterThanOrEqual(44);
    }
    expect(geometry.header.left).toBeGreaterThanOrEqual(0);
    expect(geometry.header.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.header.top).toBeGreaterThanOrEqual(0);
    expect(geometry.header.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(Math.abs((geometry.stars.left + geometry.stars.width / 2) - geometry.viewportWidth / 2)).toBeLessThanOrEqual(1);
    expect(geometry.receipt.width).toBeGreaterThan(0);
  }
});

test('2.2 Market Trip — receipt keeps eight purchases, full names, and origin labels readable', async ({ page }) => {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await bootMission(page, 'local', 2, 'el', '&mtMonth=september');
    await pressEnter(page);

    await page.evaluate(() => {
      const state = document.querySelector('[data-testid="market-trip-canvas"]')?._stateRef?.current;
      state.stalls.forEach((stall, index) => {
        stall.chosen = true;
        stall.chosenLocal = index % 2 === 0;
      });
      state.stallsDone = 7; // keep the checkout closed; the receipt shows all eight rows
    });

    await expect(page.locator('[data-testid="market-trip-item"]')).toHaveCount(8);
    const legibility = await page.evaluate(() => {
      const itemText = [...document.querySelectorAll('[data-testid="market-trip-item"] [data-child-text]')];
      const names = [...document.querySelectorAll('.market-trip-item-name')];
      const origins = [...document.querySelectorAll('.market-trip-item-origin')];
      const budgetValues = [...document.querySelectorAll('[data-market-budget-value]')];
      const items = document.querySelector('.market-trip-items');
      return {
        itemFontSizes: itemText.map((node) => parseFloat(getComputedStyle(node).fontSize)),
        itemNames: names.map((node) => {
          const rect = node.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(node);
          return {
            text: node.textContent.trim(),
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
            fullTextWidth: range.getBoundingClientRect().width,
            renderedWidth: rect.width,
            fontSize: parseFloat(getComputedStyle(node).fontSize),
            visible: getComputedStyle(node).display !== 'none' && rect.width > 0 && rect.height > 0,
          };
        }),
        originLabels: origins.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            text: node.textContent.trim(),
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
            visible: getComputedStyle(node).display !== 'none' && rect.width > 0 && rect.height > 0,
          };
        }),
        budgetFontSizes: budgetValues.map((node) => parseFloat(getComputedStyle(node).fontSize)),
        itemScrollHeight: items?.scrollHeight ?? 0,
        itemClientHeight: items?.clientHeight ?? 0,
        pageScrollWidth: document.documentElement.scrollWidth,
        pageScrollHeight: document.documentElement.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    expect(legibility.itemFontSizes).toHaveLength(24);
    expect(Math.min(...legibility.itemFontSizes)).toBeGreaterThanOrEqual(13);
    expect(legibility.itemNames.map(({ text }) => text).sort()).toEqual([
      'Ντομάτες', 'Μήλα', 'Μαρούλι', 'Πορτοκάλια', 'Πατάτες', 'Φράουλες', 'Τυρί', 'Μέλι',
    ].sort());
    expect(legibility.itemNames.every(({ visible }) => visible)).toBe(true);
    expect(legibility.itemNames.every(({ fontSize }) => fontSize >= 14)).toBe(true);
    expect(legibility.itemNames.every(({ scrollWidth, clientWidth }) => scrollWidth <= clientWidth)).toBe(true);
    expect(legibility.itemNames.every(({ fullTextWidth, renderedWidth }) => fullTextWidth <= renderedWidth)).toBe(true);
    const originTexts = legibility.originLabels.map(({ text }) => text);
    expect(originTexts).toHaveLength(8);
    expect(originTexts.every((text) => /^(🏠 Τοπικό( 🟢| 🟠)?|🌍 Εισαγόμενο)$/u.test(text))).toBe(true);
    expect(originTexts.filter((text) => text.startsWith('🌍'))).toHaveLength(4);
    expect(legibility.originLabels.every(({ visible }) => visible)).toBe(true);
    expect(legibility.originLabels.every(({ scrollWidth, clientWidth }) => scrollWidth <= clientWidth)).toBe(true);
    expect(legibility.budgetFontSizes).toHaveLength(2); // money + transport goal values
    expect(Math.min(...legibility.budgetFontSizes)).toBeGreaterThanOrEqual(17);
    expect(
      legibility.itemScrollHeight,
      JSON.stringify({ viewport, itemClientHeight: legibility.itemClientHeight }),
    ).toBeLessThanOrEqual(legibility.itemClientHeight + 1);
    expect(legibility.pageScrollWidth).toBeLessThanOrEqual(legibility.viewportWidth);
    expect(legibility.pageScrollHeight).toBeLessThanOrEqual(legibility.viewportHeight);
  }
});

test('2.2 Market Trip — one purchased product stays a compact note row at the top of the basket', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await bootMission(page, 'local', 2, 'el');
  await pressEnter(page);

  await page.evaluate(() => {
    const state = document.querySelector('[data-testid="market-trip-canvas"]')?._stateRef?.current;
    state.stalls[0].chosen = true;
    state.stalls[0].chosenLocal = false;
  });

  await expect(page.locator('[data-testid="market-trip-item"]')).toHaveCount(1);
  const geometry = await page.evaluate(() => {
    const list = document.querySelector('.market-trip-items')?.getBoundingClientRect();
    const row = document.querySelector('[data-testid="market-trip-item"]')?.getBoundingClientRect();
    return {
      rowHeight: row?.height ?? 0,
      topGap: row && list ? row.top - list.top : Number.POSITIVE_INFINITY,
    };
  });

  expect(geometry.rowHeight).toBeLessThanOrEqual(40);
  expect(geometry.topGap).toBeLessThanOrEqual(1);
});

test('2.2 Market Trip — portrait tablet shows the shared rotate-device guard', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await bootMission(page, 'local', 2, 'el');

  await expect(page.getByTestId('rotate-device')).toBeVisible();
  await expect(page.getByTestId('rotate-device')).toContainText('Γύρισε τη συσκευή σου');

  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > window.innerWidth,
    vertical: document.documentElement.scrollHeight > window.innerHeight,
  }));
  expect(overflow).toEqual({ horizontal: false, vertical: false });
});

test('2.2 Market Trip — the driver fills a three-star seasonal basket and pays (every language)', async ({ page }) => {
  for (const lang of ['el', 'en', 'nl', 'pt']) {
    await bootMission(page, 'local', 2, lang);
    const nav = await driveToResult(page, stepMarketTrip);
    expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('result');
    expect(nav.passed, lang).toBe(true);
    expect(nav.stars, lang).toBe(3);
    expect(nav.marketRecap.items, lang).toHaveLength(8);
  }
});
