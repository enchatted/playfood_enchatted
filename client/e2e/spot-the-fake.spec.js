import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { bootMission, pressEnter, touchHold } from './helpers.js';

const AUDIT_SCREENSHOT_DIR = process.env.PLAYFOOD_AUDIT_SCREENSHOT_DIR
  ? path.resolve(process.env.PLAYFOOD_AUDIT_SCREENSHOT_DIR)
  : null;
const AUDIT_LOCALE = process.env.PLAYFOOD_AUDIT_LOCALE || 'en';
const EXPECTED_RED_FLAG_BY_PRODUCT = {
  soda: "Vague words ('natural ingredients', 'eco choice') with no proof.",
  choc: 'An environmental claim with no data, backed by a fake-looking seal.',
  cookies: "It says 'no added sugar', but that does not mean sugar-free: the grape juice and raisins are full of sugars.",
  yoghurt: "It says 'packed with strawberries', but strawberry is only 2% and comes after sugar.",
  oil: 'Green, leafy packaging, but no evidence behind it.',
};

async function captureAuditScreenshot(page, filename) {
  if (!AUDIT_SCREENSHOT_DIR) return;
  await mkdir(AUDIT_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(AUDIT_SCREENSHOT_DIR, filename),
    fullPage: true,
  });
}

/**
 * 2.3 "Spot the Fake" (CHALLENGE) — inspect labels, assign Trust/Flag verdicts.
 *
 * The canvas owns browsing and package focus. The DOM case file owns promise,
 * evidence, decisions and feedback. Tests use real keyboard and pointer input;
 * `_stateRef` only positions the avatar or observes the resulting state.
 */

async function dismissMissionIntro(page) {
  await expect(page.getByTestId('spot-teaching-panel')).toHaveCount(0);
  const canvas = page.locator('canvas');
  await expect(canvas).not.toHaveAttribute('inert');
  await canvas.focus();
  await pressEnter(page);
  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return state && !state.showMissionIntro && state.irisOpenness >= 1;
  });
}

async function dismissMissionIntroWithPointer(page) {
  await expect(page.getByTestId('spot-teaching-panel')).toHaveCount(0);
  const canvas = page.locator('canvas');
  await expect(canvas).not.toHaveAttribute('inert');
  const point = await canvas.evaluate((canvasElement) => {
    const canvas = canvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const target = canvas._stateRef.current.introCtaRect;
    const hidpi = canvas.__hidpi;
    const bufferPerCssPixel = canvas.width / canvasRect.width;
    const logicalX = target.x + target.width / 2;
    const logicalY = target.y + target.height / 2;
    return {
      x: canvasRect.left + (hidpi.ox + logicalX * hidpi.k) / bufferPerCssPixel,
      y: canvasRect.top + (hidpi.oy + logicalY * hidpi.k) / bufferPerCssPixel,
    };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return !state.showMissionIntro && state.irisOpenness >= 1;
  });
}

test('2.3 Spot the Fake — the shared intro stays inside the game scene', async ({ page }) => {
  await bootMission(page, 'local', 3);

  await expect(page.getByTestId('spot-teaching-panel')).toHaveCount(0);
  const layout = await page.evaluate(() => {
    const stage = document.querySelector('.spot-the-fake-stage').getBoundingClientRect();
    const scene = document.querySelector('.spot-the-fake-scene').getBoundingClientRect();
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      stage: { top: stage.top, bottom: stage.bottom, height: stage.height },
      scene: { top: scene.top, bottom: scene.bottom, height: scene.height },
      hasIntroTapTarget: Boolean(state.introCtaRect),
    };
  });

  expect(layout.scene.top).toBeGreaterThanOrEqual(layout.stage.top);
  expect(layout.scene.bottom).toBeLessThanOrEqual(layout.stage.bottom);
  expect(layout.scene.height / layout.stage.height).toBeGreaterThan(0.9);
  expect(layout.hasIntroTapTarget).toBe(true);

  await dismissMissionIntroWithPointer(page);
});

test('2.3 Spot the Fake — Escape closes an open product case without pausing', async ({ page }) => {
  await bootMission(page, 'local', 3);
  await dismissMissionIntro(page);

  const product = await productByVerdict(page, 'trust');
  await openProductWithKeyboard(page, product.id);

  const dialog = page.locator('.spot-the-fake-inspector');
  await expect(dialog.getByRole('button', { name: /Flip label/i })).toBeFocused();
  await expect(dialog.locator('[data-control="close"]')).toContainText('Close');
  await page.keyboard.press('Escape');

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-pause-overlay="menu"]')).toHaveCount(0);
  await expect(page.locator('canvas')).toBeFocused();
  expect(await page.evaluate((productId) => {
    const state = document.querySelector('canvas')._stateRef.current;
    const reopenedProduct = state.products.find((item) => item.id === productId);
    return {
      inspect: state.inspect,
      judged: reopenedProduct?.judged,
      attempts: reopenedProduct?.attempts,
    };
  }, product.id)).toEqual({ inspect: null, judged: false, attempts: 0 });
});

test('2.3 Spot the Fake — the full shelf frontage opens a nearby product', async ({ page }) => {
  await bootMission(page, 'local', 3);
  await dismissMissionIntro(page);

  const product = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const item = state.products.find((candidate) => !candidate.judged);
    return { id: item.id, approach: item.tile.approach };
  });

  await page.evaluate(({ approach }) => {
    const canvas = document.querySelector('canvas');
    const state = canvas._stateRef.current;
    const row = approach.row - 1;
    Object.assign(state.player, {
      col: approach.col,
      row,
      pixelX: approach.col * 32,
      pixelY: row * 32,
      fromX: approach.col * 32,
      fromY: row * 32,
      toX: approach.col * 32,
      toY: row * 32,
      moving: false,
      moveTimer: 0,
      dir: approach.dir,
    });
    canvas.focus();
  }, product);

  await pressEnter(page);
  await expect(page.locator('.spot-the-fake-inspector')).toBeVisible();
});

test('2.3 Spot the Fake — Escape on the sixth feedback continues to the final lesson', async ({ page }) => {
  await bootMission(page, 'local', 3);
  await dismissMissionIntro(page);

  for (let index = 0; index < 6; index += 1) {
    const product = await page.evaluate(() => {
      const state = document.querySelector('canvas')._stateRef.current;
      const item = state.products.find((candidate) => !candidate.judged);
      return { id: item.id, verdict: item.verdict };
    });
    await openProductWithKeyboard(page, product.id);
    const dialog = page.locator('.spot-the-fake-inspector');
    await advanceToDecision(dialog);
    await dialog.locator(`[data-choice="${product.verdict}"]`).click();
    await expect(dialog.locator('[data-feedback-reason="true"]')).toBeVisible();

    if (index < 5) {
      await dialog.getByRole('button', { name: /Next/i }).click();
      await expect(dialog).toHaveCount(0);
    } else {
      await page.keyboard.press('Escape');
    }
  }

  await expect(page.locator('.spot-the-fake-inspector')).toHaveCount(0);
  await expect(page.getByTestId('spot-teaching-panel')).toHaveAttribute(
    'data-teaching-kind',
    'final',
  );
});

test('2.3 Spot the Fake — arrows and Enter submit a choice without a confirmation button', async ({ page }) => {
  await bootMission(page, 'local', 3);
  await dismissMissionIntro(page);

  const product = await productByVerdict(page, 'flag');
  await openProductWithKeyboard(page, product.id);
  const dialog = page.getByRole('dialog', { name: 'Food detective case file' });
  await advanceToDecision(dialog);

  const trustButton = dialog.locator('[data-choice="trust"]');
  const flagButton = dialog.locator('[data-choice="flag"]');
  await expect(dialog.locator('[data-action="confirm"]')).toHaveCount(0);
  await expect(trustButton).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(flagButton).toBeFocused();
  await expect(flagButton).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');

  await expect(dialog.locator('[data-feedback-reason="true"]')).toBeVisible();
  expect(await page.evaluate((productId) => {
    const state = document.querySelector('canvas')._stateRef.current;
    const judgedProduct = state.products.find((item) => item.id === productId);
    return {
      attempts: judgedProduct.attempts,
      judged: judgedProduct.judged,
      correct: judgedProduct.correct,
    };
  }, product.id)).toEqual({ attempts: 1, judged: true, correct: true });
});

test('2.3 Spot the Fake — one wrong choice is final and keeps Source to the right of Next', async ({ page }) => {
  await bootMission(page, 'local', 3);
  await dismissMissionIntro(page);

  const product = await productByVerdict(page, 'flag');
  await openProductWithKeyboard(page, product.id);
  const dialog = page.getByRole('dialog', { name: 'Food detective case file' });
  await advanceToDecision(dialog);
  await dialog.locator('[data-choice="trust"]').click();

  await expect(dialog.locator('[data-feedback-reason="true"]')).toBeVisible();
  await expect(dialog.getByText('One useful clue is highlighted. Try once more.')).toHaveCount(0);
  await expect(dialog.locator('[data-choice="trust"]')).toBeDisabled();
  await expect(dialog.locator('[data-choice="flag"]')).toBeDisabled();

  const nextButton = dialog.getByRole('button', { name: /Next/i });
  const sourceButton = dialog.getByRole('button', { name: /Source/i });
  const [nextBox, sourceBox] = await Promise.all([
    nextButton.boundingBox(),
    sourceButton.boundingBox(),
  ]);
  expect(nextBox.x).toBeLessThan(sourceBox.x);

  expect(await page.evaluate((productId) => {
    const state = document.querySelector('canvas')._stateRef.current;
    const judgedProduct = state.products.find((item) => item.id === productId);
    return {
      attempts: judgedProduct.attempts,
      judged: judgedProduct.judged,
      correct: judgedProduct.correct,
      retryAvailable: state.inspect.retryAvailable,
      judgedCount: state.judgedCount,
      mistakes: state.mistakes,
    };
  }, product.id)).toEqual({
    attempts: 1,
    judged: true,
    correct: false,
    retryAvailable: false,
    judgedCount: 1,
    mistakes: 1,
  });
});

async function advanceToDecision(dialog) {
  await dialog.locator('.spot-the-fake-inspector__primary').click();
  await expect(dialog.locator('[data-choice]')).toHaveCount(0);
  await dialog.locator('[data-action="evidence-continue"]').click();
  await expect(dialog.locator('[data-choice]')).toHaveCount(2);
}

async function openProductWithKeyboard(page, productId) {
  await page.evaluate((id) => {
    const state = document.querySelector('canvas')._stateRef.current;
    const product = state.products.find((item) => item.id === id);
    const approach = product.tile.approach;
    const player = state.player;
    player.col = approach.col;
    player.row = approach.row;
    player.pixelX = approach.col * 32;
    player.pixelY = approach.row * 32;
    player.fromX = player.pixelX;
    player.fromY = player.pixelY;
    player.toX = player.pixelX;
    player.toY = player.pixelY;
    player.moving = false;
    player.moveTimer = 0;
    player.dir = approach.dir;
    document.querySelector('canvas').focus();
  }, productId);
  await pressEnter(page);
  await expect(page.locator('.spot-the-fake-inspector')).toBeVisible();
}

async function productByVerdict(page, verdict) {
  return page.evaluate((wantedVerdict) => {
    const state = document.querySelector('canvas')._stateRef.current;
    const product = state.products.find((item) => !item.judged && item.verdict === wantedVerdict);
    return {
      id: product.id,
      front: product.front,
      verdict: product.verdict,
      evidenceType: product.evidenceType,
      supportedReason: product[product.evidenceType],
    };
  }, verdict);
}

function oppositeVerdict(verdict) {
  return verdict === 'trust' ? 'flag' : 'trust';
}

async function completeTierRun(page, correctTarget, auditLabel = null) {
  if (auditLabel === '0-stars') {
    await captureAuditScreenshot(page, '00-intro.png');
  }
  await dismissMissionIntro(page);

  for (let index = 0; index < 6; index += 1) {
    const product = await page.evaluate(() => {
      const state = document.querySelector('canvas')._stateRef.current;
      const item = state.products.find((candidate) => !candidate.judged);
      return { id: item.id, verdict: item.verdict };
    });
    await openProductWithKeyboard(page, product.id);
    const dialog = page.locator('.spot-the-fake-inspector');
    if (auditLabel === '0-stars' && index === 0) {
      await captureAuditScreenshot(page, '01-front-claim.png');
      await dialog.locator('.spot-the-fake-inspector__primary').click();
      await captureAuditScreenshot(page, '02-back-evidence.png');
      await dialog.locator('[data-action="evidence-continue"]').click();
      await captureAuditScreenshot(page, '03-decision.png');
    } else {
      await advanceToDecision(dialog);
    }

    await dialog.locator(
      `[data-choice="${index < correctTarget ? product.verdict : oppositeVerdict(product.verdict)}"]`,
    ).click();
    await expect(dialog.locator('[data-feedback-reason="true"]')).toBeVisible();
    if (auditLabel === '0-stars' && index === 0) {
      await captureAuditScreenshot(page, '04-wrong-feedback.png');
    }
    await dialog.locator('.spot-the-fake-inspector__feedback-actions .spot-the-fake-inspector__primary')
      .click();
    await expect(dialog).toHaveCount(0);
    await page.waitForFunction(() => {
      const state = document.querySelector('canvas')._stateRef.current;
      return !state.inspect && state.enterWasDown === false;
    });
  }

  const finalPanel = page.getByTestId('spot-teaching-panel');
  await expect(finalPanel).toHaveAttribute('data-teaching-kind', 'final');
  if (auditLabel === '0-stars') {
    await captureAuditScreenshot(page, '05-final-learning.png');
  }
  await page.evaluate(() => {
    window.__spotTheFakeCompletionState = document.querySelector('canvas')._stateRef;
  });
  await finalPanel.locator('[data-action="teaching-continue"]').click();
  await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result');
  if (auditLabel) {
    await page.waitForTimeout(650);
    await captureAuditScreenshot(page, `result-${auditLabel}.png`);
  }

  return page.evaluate(() => {
    const state = window.__spotTheFakeCompletionState.current;
    const store = window.__playfood.state();
    return {
      navigation: window.__playfood.state().navigationData,
      completion: {
        started: state.completionStarted,
        scoreComputations: state.scoreComputationCount,
        score: state.completionResult?.score,
      },
      persisted: {
        points: store.points,
        stars: store.gameStars['local:SpotTheFake'] || 0,
      },
    };
  });
}

test('2.3 Spot the Fake — the label guide and six shoppers make the aisle feel alive', async ({ page }) => {
  await bootMission(page, 'local', 3);
  await dismissMissionIntro(page);

  const before = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return state.ambientShoppers.map(({ id, x, y }) => ({ id, x, y }));
  });
  expect(before).toHaveLength(6);

  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return state.ambientShoppers.map(({ id, x, y }) => ({ id, x, y }));
  });
  expect(after.some((shopper, index) => (
    Math.hypot(
      shopper.x - before[index].x,
      shopper.y - before[index].y,
    ) >= 26
  ))).toBe(true);

  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    Object.assign(state.player, {
      col: 9,
      row: 3,
      pixelX: 9 * 32,
      pixelY: 3 * 32,
      fromX: 9 * 32,
      fromY: 3 * 32,
      toX: 9 * 32,
      toY: 3 * 32,
      moving: false,
      dir: 1,
    });
  });
  await page.waitForFunction(() => (
    document.querySelector('canvas')._stateRef.current.nearLabelGuide === true
  ));
});

test('2.3 Spot the Fake — the guide message stays visually above the player', async ({ page }) => {
  await bootMission(page, 'local', 3, 'el');
  await dismissMissionIntro(page);

  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    Object.assign(state.player, {
      col: 9,
      row: 3,
      pixelX: 9 * 32,
      pixelY: 3 * 32,
      fromX: 9 * 32,
      fromY: 3 * 32,
      toX: 9 * 32,
      toY: 3 * 32,
      moving: false,
      moveTimer: 0,
      dir: 1,
    });
  });
  await page.waitForFunction(() => (
    document.querySelector('canvas')._stateRef.current.nearLabelGuide === true
  ));
  await page.waitForTimeout(100);
  await captureAuditScreenshot(page, '06-guide-message-foreground.png');

  const warmPlayerPixelsInsideBubble = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const context = canvas.getContext('2d');
    const { k, ox, oy } = canvas.__hidpi;
    let count = 0;

    for (let logicalY = 132; logicalY <= 154; logicalY += 2) {
      for (let logicalX = 590; logicalX <= 624; logicalX += 2) {
        const [red, green, blue] = context.getImageData(
          Math.round(ox + logicalX * k),
          Math.round(oy + logicalY * k),
          1,
          1,
        ).data;
        if (red > 150 && green > 70 && green < 180 && blue < 100) count += 1;
      }
    }

    return count;
  });

  expect(warmPlayerPixelsInsideBubble).toBe(0);
});

test('2.3 Spot the Fake — browsing HUD, deliberate choice, pointer trust and flag paths', async ({ page }) => {
  await bootMission(page, 'local', 3);
  await expect(page.getByTestId('spot-the-fake-hud')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('dialog', { name: 'Food detective case file' })).toHaveCount(0);
  await dismissMissionIntroWithPointer(page);

  for (const verdict of ['trust', 'flag']) {
    const product = await productByVerdict(page, verdict);
    await openProductWithKeyboard(page, product.id);

    const dialog = page.getByRole('dialog', { name: 'Food detective case file' });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByText(product.front, { exact: true })).toBeVisible();
    await expect(dialog.locator('[data-choice][aria-pressed="true"]')).toHaveCount(0);
    await advanceToDecision(dialog);

    await expect(dialog.locator('[data-action="confirm"]')).toHaveCount(0);
    await dialog.locator(`[data-choice="${verdict}"]`).click();
    await expect(dialog.locator(`[data-choice="${verdict}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('[data-feedback-reason="true"]')).toBeVisible();
    await expect(dialog.locator('.spot-the-fake-inspector__judgement')).toHaveText(
      verdict === 'trust' ? 'Supported by evidence' : 'Needs evidence',
    );
    await expect(dialog.locator('.spot-the-fake-inspector__judgement')).not.toContainText(/Trust it|Call it out/);
    if (verdict === 'trust') {
      await expect(dialog.locator('[data-feedback-reason="true"]')).toHaveText(product.supportedReason);
    }
    await dialog.getByRole('button', { name: /Next/i }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('canvas')).toBeFocused();
  }

  const keyboardProduct = await productByVerdict(page, 'flag');
  await openProductWithKeyboard(page, keyboardProduct.id);
  const keyboardDialog = page.getByRole('dialog', { name: 'Food detective case file' });
  const flipButton = keyboardDialog.getByRole('button', { name: /Flip label/i });
  const guideButton = page.getByRole('button', { name: 'How to play' });
  const pauseButton = page.getByRole('button', { name: 'Pause' });
  const exitButton = page.getByRole('button', { name: 'Quit' });
  // The case file's own ✕ Close (a button since ff39aaf) sits between Quit and Flip.
  const closeButton = keyboardDialog.locator('[data-control="close"]');
  await expect(flipButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(exitButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(pauseButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(guideButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(pauseButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(exitButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(flipButton).toBeFocused();
  await pressEnter(page);
  await expect(keyboardDialog.locator('[data-action="evidence-continue"]')).toBeFocused();
  await pressEnter(page);
  const trustButton = keyboardDialog.locator('[data-choice="trust"]');
  const flagButton = keyboardDialog.locator('[data-choice="flag"]');
  await expect(trustButton).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(flagButton).toBeFocused();
  await pressEnter(page);
  await expect(flagButton).toHaveAttribute('aria-pressed', 'true');
  await expect(keyboardDialog.locator('[data-feedback-reason="true"]')).toBeVisible();
});

test('2.3 Spot the Fake — a pointer-opened wrong case highlights its fact without a retry', async ({ page }) => {
  await bootMission(page, 'local', 3);
  await dismissMissionIntro(page);

  const product = await productByVerdict(page, 'flag');
  const pointer = await page.evaluate((id) => {
    const canvas = document.querySelector('canvas');
    const state = document.querySelector('canvas')._stateRef.current;
    const target = state.products.find((item) => item.id === id).pointerRect;
    const box = canvas.getBoundingClientRect();
    const hidpi = canvas.__hidpi;
    const bufferPerCssPixel = canvas.width / box.width;
    return {
      x: (target.x * hidpi.k + hidpi.ox) / bufferPerCssPixel,
      y: (target.y * hidpi.k + hidpi.oy) / bufferPerCssPixel,
      width: (target.width * hidpi.k) / bufferPerCssPixel,
      height: (target.height * hidpi.k) / bufferPerCssPixel,
    };
  }, product.id);
  const canvas = page.locator('canvas');
  await canvas.click({
    position: {
      x: pointer.x + pointer.width / 2,
      y: pointer.y + pointer.height / 2,
    },
  });

  const dialog = page.getByRole('dialog', { name: 'Food detective case file' });
  await expect(dialog).toBeVisible();
  await advanceToDecision(dialog);
  const beforeMove = await page.evaluate(() => {
    const player = document.querySelector('canvas')._stateRef.current.player;
    return { col: player.col, row: player.row };
  });
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => {
    const player = document.querySelector('canvas')._stateRef.current.player;
    return { col: player.col, row: player.row };
  })).toEqual(beforeMove);
  await expect(canvas).toHaveAttribute('inert');

  await dialog.locator('[data-choice="trust"]').click();
  await expect(dialog.locator('[data-evidence][data-highlighted="true"]')).toHaveAttribute(
    'data-evidence',
    product.evidenceType,
  );
  await expect(dialog.getByText('One useful clue is highlighted. Try once more.')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      inspectOpen: Boolean(state.inspect),
      judged: state.products.find((item) => item.id === state.inspect.productId).judged,
      attempts: state.inspect.attempts,
    };
  })).toEqual({ inspectOpen: true, judged: true, attempts: 1 });

  const fact = await dialog.locator('[data-detector-rule="true"] strong').textContent();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /how to play/i }).click();
  await page.waitForFunction(() => (
    document.querySelector('canvas')._stateRef.current.showMissionIntro === true
    && !document.querySelector('[data-pause-overlay="menu"]')
  ));
  await dismissMissionIntro(page);
  await expect(dialog.locator('[data-detector-rule="true"] strong')).toHaveText(fact);
  expect(await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      firstTryCorrect: state.firstTryCorrect,
      recoveredCount: state.recoveredCount,
      attempts: state.inspect.attempts,
    };
  })).toEqual({ firstTryCorrect: 0, recoveredCount: 0, attempts: 1 });
});

test('2.3 Spot the Fake — one wrong answer closes the case after its explanation', async ({ page }) => {
  await bootMission(page, 'local', 3);
  await dismissMissionIntroWithPointer(page);
  const product = await productByVerdict(page, 'flag');
  await openProductWithKeyboard(page, product.id);

  const dialog = page.getByRole('dialog', { name: 'Food detective case file' });
  await advanceToDecision(dialog);
  await dialog.locator('[data-choice="trust"]').click();
  await expect(dialog.getByText('One useful clue is highlighted. Try once more.')).toHaveCount(0);
  await expect(dialog.locator('[data-action="confirm"]')).toHaveCount(0);
  await expect(dialog.locator('[data-choice="trust"]')).toBeDisabled();
  await expect(dialog.locator('[data-choice="flag"]')).toBeDisabled();
  expect(await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const current = state.products.find((item) => item.id === state.inspect.productId);
    return {
      attempts: state.inspect.attempts,
      judged: current.judged,
      retryAvailable: state.inspect.retryAvailable,
      judgedCount: state.judgedCount,
    };
  })).toEqual({ attempts: 1, judged: true, retryAvailable: false, judgedCount: 1 });

  await dialog.getByRole('button', { name: /Next/i }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
});

test('2.3 Spot the Fake — flagged feedback explains the specific warning before the detective rule', async ({ page }) => {
  await bootMission(page, 'local', 3);
  await dismissMissionIntro(page);
  const product = await productByVerdict(page, 'flag');
  await openProductWithKeyboard(page, product.id);

  const dialog = page.getByRole('dialog', { name: 'Food detective case file' });
  await advanceToDecision(dialog);
  await dialog.locator('[data-choice="flag"]').click();

  const warning = dialog.locator('[data-red-flag="true"]');
  const rule = dialog.locator('[data-detector-rule="true"]');
  await expect(warning).toContainText(EXPECTED_RED_FLAG_BY_PRODUCT[product.id]);
  expect(await warning.evaluate((element, ruleElement) => (
    Boolean(element.compareDocumentPosition(ruleElement) & Node.DOCUMENT_POSITION_FOLLOWING)
  ), await rule.elementHandle())).toBe(true);
});

test('2.3 Spot the Fake — exit confirmation freezes inspector and requires an explicit Yes', async ({ page }) => {
  await bootMission(page, 'local', 3);
  await dismissMissionIntro(page);
  const product = await productByVerdict(page, 'flag');
  await openProductWithKeyboard(page, product.id);
  const dialog = page.getByRole('dialog', { name: 'Food detective case file' });
  await advanceToDecision(dialog);

  const before = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return { time: state.time, choice: state.inspect.choice, attempts: state.inspect.attempts };
  });
  await page.getByRole('button', { name: /Quit/ }).click();
  await expect(page.getByText('Leave the game?')).toBeVisible();
  await expect(page.locator('.spot-the-fake-stage')).toHaveAttribute('inert');
  await expect(page.getByTestId('touch-controls-surface')).toHaveCount(0);
  // The floating confirm (694c728) focuses the safe choice, so a stray Enter keeps playing.
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();

  await page.waitForTimeout(180);
  expect(await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      frozen: state.exitConfirmOpen,
      choice: state.inspect.choice,
      attempts: state.inspect.attempts,
    };
  })).toEqual({ frozen: true, choice: before.choice, attempts: before.attempts });
  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('game');

  // Remove only the DOM inert marker to isolate the direct callback guard beneath it.
  await page.evaluate(() => document.querySelector('.spot-the-fake-stage').removeAttribute('inert'));
  await dialog.locator('[data-choice="trust"]').click({ force: true });
  expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.inspect.choice))
    .toBe(before.choice);

  await page.getByRole('button', { name: 'Yes' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await pressEnter(page);
  await expect(page.getByText('Leave the game?')).toHaveCount(0);
  await expect(page.locator('.spot-the-fake-stage')).not.toHaveAttribute('inert');
  expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('game');

  const exitButton = page.getByRole('button', { name: /Quit/ });
  await touchHold(page, exitButton, 80);
  await expect(page.getByText('Leave the game?')).toBeVisible();
  await expect(page.getByTestId('touch-controls-surface')).toHaveCount(0);
  // A real finger on Yes: touchHold would first wait for the D-pad, which this overlay hides on purpose.
  const yesBox = await page.getByRole('button', { name: 'Yes' }).boundingBox();
  const touch = await page.context().newCDPSession(page);
  const touchPoint = { x: yesBox.x + yesBox.width / 2, y: yesBox.y + yesBox.height / 2 };
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint] });
  await page.waitForTimeout(80);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.__playfood.state().currentScreen === 'hub');
});

for (const tierCase of [
  {
    label: '3 stars', firstTry: 6, recovered: 0, mistakes: 0,
    correct: 6, score: 100, passed: true, tier: 'perfect', stars: 3,
  },
  {
    label: '2 stars', firstTry: 5, recovered: 0, mistakes: 1,
    correct: 5, score: 75, passed: true, tier: 'great', stars: 2,
  },
  {
    label: '1 star', firstTry: 4, recovered: 0, mistakes: 2,
    correct: 4, score: 60, passed: true, tier: 'pass', stars: 1,
  },
  {
    label: '0 stars', firstTry: 0, recovered: 0, mistakes: 6,
    correct: 0, score: 0, passed: false, tier: 'fail', stars: 0,
  },
]) {
  test(`2.3 Spot the Fake — real decisions produce the ${tierCase.label} result contract`, async ({ page }) => {
    await bootMission(page, 'local', 3, AUDIT_LOCALE);
    const auditLabel = tierCase.label.replace(' ', '-');
    const { navigation, completion, persisted } = await completeTierRun(
      page,
      tierCase.firstTry,
      auditLabel,
    );

    expect(completion).toEqual({
      started: true,
      scoreComputations: 1,
      score: tierCase.score,
    });
    expect(navigation.passed).toBe(tierCase.passed);
    expect(navigation.score).toBe(tierCase.score);
    expect(navigation.correct).toBe(tierCase.correct);
    expect(navigation.firstTryCount).toBe(tierCase.firstTry);
    expect(navigation.mistakes).toBe(tierCase.mistakes);
    expect(navigation.recovered).toBe(tierCase.recovered);
    expect(navigation.tier).toBe(tierCase.tier);
    expect(navigation.stars).toBe(tierCase.stars);
    expect(persisted).toEqual({
      points: tierCase.score,
      stars: tierCase.stars,
    });

    if (AUDIT_LOCALE === 'en') {
      await expect(page.getByText(
        `Final correct: ${tierCase.correct}/6 · First try: ${tierCase.firstTry} · Mistakes: ${tierCase.mistakes}`,
      )).toBeVisible();
      await expect(page.getByText(
        `You finished ${tierCase.correct}/6 claim checks correctly. ${tierCase.firstTry} were correct on the first try.`,
      )).toBeVisible();

      if (tierCase.stars === 3) {
        await expect(page.getByRole('heading', { name: 'Perfect detective work!' })).toBeVisible();
      }
    } else {
      await expect(page.getByTestId('spot-the-fake-result-summary')).toBeVisible();

      if (AUDIT_LOCALE === 'el' && tierCase.stars === 3) {
        const feedback = page.getByText(
          'Ολοκλήρωσες σωστά 6/6 ελέγχους ισχυρισμών. Στους 6 απάντησες σωστά με την πρώτη.',
        );
        const summary = page.getByTestId('spot-the-fake-result-summary');
        const layout = await page.evaluate(() => {
          const feedbackElement = [...document.querySelectorAll('p')].find((element) => (
            element.textContent.includes('Ολοκλήρωσες σωστά 6/6')
          ));
          const summaryElement = document.querySelector('[data-testid="spot-the-fake-result-summary"]');
          const decorations = [...document.querySelectorAll('[aria-hidden="true"] i')];
          const metrics = (element) => {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              top: box.top,
              bottom: box.bottom,
              fontSize: Number.parseFloat(style.fontSize),
              lineHeight: Number.parseFloat(style.lineHeight),
            };
          };
          const feedbackBox = feedbackElement.getBoundingClientRect();
          const decorationOverlapsFeedback = decorations.some((element) => {
            const box = element.getBoundingClientRect();
            return box.right > feedbackBox.left
              && box.left < feedbackBox.right
              && box.bottom > feedbackBox.top
              && box.top < feedbackBox.bottom;
          });
          return {
            feedback: metrics(feedbackElement),
            summary: metrics(summaryElement),
            decorationOverlapsFeedback,
          };
        });

        await expect(feedback).toBeVisible();
        expect(layout.feedback.lineHeight).toBeGreaterThanOrEqual(layout.feedback.fontSize * 1.3);
        expect(layout.summary.top - layout.feedback.bottom).toBeGreaterThanOrEqual(10);
        expect(layout.decorationOverlapsFeedback).toBe(false);
      }
    }
  });
}
