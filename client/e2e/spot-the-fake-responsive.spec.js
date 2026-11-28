import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';

// a touch device: the on-screen controls only show with a finger-type pointer
test.use({ hasTouch: true });

const VIEWPORTS = [
  { width: 1366, height: 768, hudMax: 52, touchControls: true, overlay: false },
  { width: 1280, height: 720, hudMax: 52, touchControls: true, overlay: false },
  { width: 1024, height: 768, hudMax: 52, touchControls: true, overlay: false },
  // 46 = 44px touch-target controls + the 2px bottom border (SpotTheFake.css, 694c728).
  { width: 844, height: 390, hudMax: 46, touchControls: true, overlay: false },
];

function oppositeVerdict(verdict) {
  return verdict === 'trust' ? 'flag' : 'trust';
}

function expectInside(inner, outer, label, tolerance = 1) {
  expect(inner.left, `${label}: left edge`).toBeGreaterThanOrEqual(outer.left - tolerance);
  expect(inner.top, `${label}: top edge`).toBeGreaterThanOrEqual(outer.top - tolerance);
  expect(inner.right, `${label}: right edge`).toBeLessThanOrEqual(outer.right + tolerance);
  expect(inner.bottom, `${label}: bottom edge`).toBeLessThanOrEqual(outer.bottom + tolerance);
}

async function dismissIntro(page) {
  await page.bringToFront();
  await page.locator('canvas').focus();
  await pressEnter(page);
  await page.waitForFunction(() => {
    const state = document.querySelector('canvas')?._stateRef?.current;
    return state && !state.showMissionIntro && state.irisOpenness >= 1;
  });
}

async function expectSharedIntroContract(page, sourceId) {
  await expect(page.getByTestId('spot-teaching-panel')).toHaveCount(0);
  await expect(page.locator('.spot-the-fake-scene')).not.toHaveAttribute('inert');
  await expect(page.getByTestId('touch-controls-surface')).toHaveCount(0);

  const contract = await page.evaluate(() => {
    const stage = document.querySelector('.spot-the-fake-stage').getBoundingClientRect();
    const scene = document.querySelector('.spot-the-fake-scene').getBoundingClientRect();
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      stageHeight: stage.height,
      sceneHeight: scene.height,
      hasTapTarget: Boolean(state.introCtaRect),
      hasSourceTarget: Boolean(state.introSourceRect),
    };
  });
  expect(contract.sceneHeight / contract.stageHeight).toBeGreaterThan(0.9);
  expect(contract.hasTapTarget).toBe(true);
  expect(contract.hasSourceTarget).toBe(true);

  const popupPromise = page.waitForEvent('popup');
  await page.keyboard.press('s');
  const sourcePage = await popupPromise;
  await sourcePage.waitForLoadState('domcontentloaded');
  expect(sourcePage.url()).toContain(`source.html?src=${sourceId}`);
  await sourcePage.close();
}

async function openFirstUnjudgedProduct(page) {
  const product = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const item = state.products.find((candidate) => !candidate.judged);
    const { approach } = item.tile;
    Object.assign(state.player, {
      col: approach.col,
      row: approach.row,
      pixelX: approach.col * 32,
      pixelY: approach.row * 32,
      fromX: approach.col * 32,
      fromY: approach.row * 32,
      toX: approach.col * 32,
      toY: approach.row * 32,
      moving: false,
      moveTimer: 0,
      dir: approach.dir,
    });
    document.querySelector('canvas').focus();
    return { id: item.id, verdict: item.verdict };
  });
  await pressEnter(page);
  await expect(page.locator('.spot-the-fake-inspector')).toBeVisible();
  return product;
}

async function advanceToDecision(inspector) {
  await inspector.locator('.spot-the-fake-inspector__primary').click();
  await inspector.locator('[data-action="evidence-continue"]').click();
  await expect(inspector.locator('[data-choice]')).toHaveCount(2);
}

async function expectPageAndShellFit(page, viewport, phase) {
  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box && {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    return {
      viewport: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      root: rect('.spot-the-fake-root'),
      hud: rect('.spot-the-fake-hud'),
      stage: rect('.spot-the-fake-stage'),
      scene: rect('.spot-the-fake-scene'),
      canvas: rect('.spot-the-fake-canvas'),
    };
  });

  expect(layout.documentWidth, `${phase}: no horizontal document overflow`)
    .toBeLessThanOrEqual(viewport.width);
  expect(layout.documentHeight, `${phase}: no vertical document overflow`)
    .toBeLessThanOrEqual(viewport.height);
  expectInside(layout.root, layout.viewport, `${phase}: game root`);
  expectInside(layout.hud, layout.viewport, `${phase}: HUD`);
  expectInside(layout.stage, layout.root, `${phase}: stage`);
  expectInside(layout.scene, layout.stage, `${phase}: scene`);
  expectInside(layout.canvas, layout.scene, `${phase}: canvas`);
  expect(layout.hud.top, `${phase}: HUD must not start above the viewport`).toBeGreaterThanOrEqual(0);
  expect(layout.hud.height, `${phase}: compact HUD height`).toBeLessThanOrEqual(viewport.hudMax + 0.5);

  const canvasCenterY = (layout.canvas.top + layout.canvas.bottom) / 2;
  const sceneCenterY = (layout.scene.top + layout.scene.bottom) / 2;
  expect(Math.abs(canvasCenterY - sceneCenterY), `${phase}: width-constrained canvas remains centred`)
    .toBeLessThanOrEqual(1.5);
  const sceneCoverage = (layout.canvas.width * layout.canvas.height)
    / (layout.scene.width * layout.scene.height);
  if (phase === 'browse') {
    const canvasAspect = 1280 / 704;
    const sceneAspect = layout.scene.width / layout.scene.height;
    const maximumContainedCoverage = Math.min(
      sceneAspect / canvasAspect,
      canvasAspect / sceneAspect,
    );
    expect(sceneCoverage, `${phase}: the game uses the available scene instead of looking tiny`)
      .toBeGreaterThanOrEqual(maximumContainedCoverage - 0.02);
  }
}

async function expectTeachingContract(page, viewport, kind, sourceId) {
  const panel = page.getByTestId('spot-teaching-panel');
  await expect(panel).toHaveAttribute('data-teaching-kind', kind);
  await expect(page.locator('.spot-the-fake-scene')).toHaveAttribute('inert');
  await expect(page.getByTestId('touch-controls-surface')).toHaveCount(1);

  const contract = await panel.evaluate((element) => {
    const panelRect = element.getBoundingClientRect();
    const stageRect = document.querySelector('.spot-the-fake-stage').getBoundingClientRect();
    const body = element.querySelector('.spot-the-fake-teaching__body');
    const buttons = [...element.querySelectorAll('button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    const fontSizes = [...element.querySelectorAll(
      '.spot-the-fake-teaching__step, .spot-the-fake-teaching__fact, .spot-the-fake-teaching__goal',
    )].map((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    return {
      panel: {
        left: panelRect.left, top: panelRect.top, right: panelRect.right,
        bottom: panelRect.bottom, width: panelRect.width, height: panelRect.height,
      },
      stage: {
        left: stageRect.left, top: stageRect.top, right: stageRect.right,
        bottom: stageRect.bottom, width: stageRect.width, height: stageRect.height,
      },
      buttons,
      fontSizes,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      columns: getComputedStyle(body).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      text: element.innerText,
    };
  });

  expectInside(contract.panel, contract.stage, `${kind}: teaching panel`);
  expect(contract.scrollWidth, `${kind}: no horizontal teaching overflow`)
    .toBeLessThanOrEqual(contract.clientWidth + 1);
  expect(contract.text.length, `${kind}: teaching copy is visible`).toBeGreaterThan(80);
  for (const button of contract.buttons) {
    expect(button.width, `${kind}: native action width`).toBeGreaterThanOrEqual(44);
    expect(button.height, `${kind}: native action height`).toBeGreaterThanOrEqual(44);
  }
  for (const fontSize of contract.fontSizes) {
    expect(fontSize, `${kind}: essential teaching copy`).toBeGreaterThanOrEqual(13);
  }
  if (viewport.overlay) expect(contract.columns, `${kind}: compact landscape columns`).toBe(2);

  for (const action of ['button', 'shortcut']) {
    const popupPromise = page.waitForEvent('popup');
    if (action === 'button') await panel.locator('[data-action="teaching-source"]').click();
    else await page.keyboard.press('s');
    const sourcePage = await popupPromise;
    await sourcePage.waitForLoadState('domcontentloaded');
    expect(sourcePage.url()).toContain(`source.html?src=${sourceId}`);
    await sourcePage.close();
  }
}

async function expectInspectorContract(page, viewport, phase) {
  const contract = await page.evaluate(() => {
    const stageElement = document.querySelector('.spot-the-fake-stage');
    const stage = stageElement.getBoundingClientRect();
    const scene = document.querySelector('.spot-the-fake-scene').getBoundingClientRect();
    const inspector = document.querySelector('.spot-the-fake-inspector');
    const inspectorRect = inspector.getBoundingClientRect();
    const interactive = [
      ...document.querySelectorAll('.spot-the-fake-hud button, .spot-the-fake-inspector button'),
    ].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).map((element) => {
      const rect = element.getBoundingClientRect();
      return { label: element.getAttribute('aria-label') || element.textContent.trim(), width: rect.width, height: rect.height };
    });
    const essentialText = [
      ...inspector.querySelectorAll(
        '.spot-the-fake-inspector__evidence-row strong, .spot-the-fake-inspector__choice, .spot-the-fake-inspector__select-first',
      ),
    ].map((element) => ({
      text: element.textContent.trim(),
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    }));
    const wrapping = [...inspector.querySelectorAll('.spot-the-fake-inspector__evidence-row')]
      .map((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    const actionsElement = inspector.querySelector('.spot-the-fake-inspector__feedback-actions')
      || inspector.querySelector('.spot-the-fake-inspector__choices');
    const actionsRect = actionsElement?.getBoundingClientRect();
    return {
      actions: actionsRect && {
        left: actionsRect.left, top: actionsRect.top, right: actionsRect.right, bottom: actionsRect.bottom,
      },
      stage: {
        left: stage.left, top: stage.top, right: stage.right, bottom: stage.bottom,
        width: stage.width, height: stage.height,
      },
      scene: {
        left: scene.left, top: scene.top, right: scene.right, bottom: scene.bottom,
        width: scene.width, height: scene.height,
      },
      inspector: {
        left: inspectorRect.left, top: inspectorRect.top,
        right: inspectorRect.right, bottom: inspectorRect.bottom,
        width: inspectorRect.width, height: inspectorRect.height,
        clientWidth: inspector.clientWidth, scrollWidth: inspector.scrollWidth,
      },
      interactive,
      essentialText,
      wrapping,
      productFontSize: Number.parseFloat(
        getComputedStyle(inspector.querySelector('.spot-the-fake-inspector__product')).fontSize,
      ),
      ariaModal: inspector.getAttribute('aria-modal'),
      scrimColor: getComputedStyle(stageElement, '::before').backgroundColor,
    };
  });

  expectInside(contract.inspector, contract.stage, `${phase}: inspector`);
  // The answer and Next buttons should be visible without scrolling the case file.
  expect(contract.actions, `${phase}: action buttons exist`).toBeTruthy();
  expectInside(contract.actions, contract.inspector, `${phase}: action buttons`);
  expectInside(contract.scene, contract.stage, `${phase}: unchanged game scene`);
  expect(contract.ariaModal, `${phase}: case file uses modal semantics`).toBe('true');
  expect(contract.scrimColor, `${phase}: game scene is visibly dimmed behind the case file`)
    .not.toBe('rgba(0, 0, 0, 0)');
  expect(contract.inspector.scrollWidth, `${phase}: inspector has no horizontal clipping`)
    .toBeLessThanOrEqual(contract.inspector.clientWidth + 1);
  for (const target of contract.interactive) {
    expect(target.width, `${phase}: ${target.label} target width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${phase}: ${target.label} target height`).toBeGreaterThanOrEqual(44);
  }
  for (const text of contract.essentialText) {
    expect(text.fontSize, `${phase}: readable “${text.text}”`).toBeGreaterThanOrEqual(13);
  }
  for (const row of contract.wrapping) {
    expect(row.scrollWidth, `${phase}: evidence wraps inside its row`)
      .toBeLessThanOrEqual(row.clientWidth + 1);
  }
  expect(contract.productFontSize, `${phase}: product art remains identifiable`).toBeGreaterThanOrEqual(48);

  const inspectorCenterX = (contract.inspector.left + contract.inspector.right) / 2;
  const inspectorCenterY = (contract.inspector.top + contract.inspector.bottom) / 2;
  const stageCenterX = (contract.stage.left + contract.stage.right) / 2;
  const stageCenterY = (contract.stage.top + contract.stage.bottom) / 2;
  expect(Math.abs(inspectorCenterX - stageCenterX), `${phase}: case file is horizontally centred`)
    .toBeLessThanOrEqual(2);
  expect(Math.abs(inspectorCenterY - stageCenterY), `${phase}: case file is vertically centred`)
    .toBeLessThanOrEqual(2);

  const sceneRatio = contract.scene.width / contract.stage.width;
  expect(sceneRatio, `${phase}: popup does not collapse the game into a side column`)
    .toBeGreaterThanOrEqual(viewport.overlay ? 0.97 : 0.95);
}

async function prepareOneRealFinalJudgement(page) {
  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const unjudged = state.products.filter((product) => !product.judged);
    for (const product of unjudged.slice(0, -1)) {
      product.judged = true;
      product.correct = true;
      product.attempts = 1;
      state.judgedCount += 1;
      state.correctCount += 1;
      state.firstTryCorrect += 1;
    }
    state.liveScore = state.firstTryCorrect * 15 + state.recoveredCount * 5;
  });

  const product = await openFirstUnjudgedProduct(page);
  const inspector = page.locator('.spot-the-fake-inspector');
  await advanceToDecision(inspector);
  await inspector.locator(`[data-choice="${product.verdict}"]`).click();
  await inspector.getByRole('button').filter({ hasText: /Next|Επόμενο/ }).click();
  await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.reveal?.final === true);
}

for (const viewport of VIEWPORTS) {
  test(`2.3 responsive contract at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await bootMission(page, 'local', 3, 'el');

    const hudLayout = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };
      return {
        hud: rect('.spot-the-fake-hud'),
        leading: rect('.spot-the-fake-hud__leading'),
        stars: rect('.spot-the-fake-hud__stars'),
        trailing: rect('.spot-the-fake-hud__trailing'),
        progress: rect('.spot-the-fake-hud__progress'),
        controls: rect('.spot-the-fake-hud__controls'),
        hasTitle: Boolean(document.querySelector('.spot-the-fake-hud__title')),
      };
    });
    const hudCenter = hudLayout.hud.left + hudLayout.hud.width / 2;
    const starsCenter = hudLayout.stars.left + hudLayout.stars.width / 2;
    expect(hudLayout.hasTitle).toBe(false);
    expect(Math.abs(starsCenter - hudCenter)).toBeLessThanOrEqual(1);
    expect(hudLayout.leading.left).toBeLessThan(hudLayout.stars.left);
    expect(hudLayout.trailing.left).toBeGreaterThan(hudLayout.stars.right);
    expect(hudLayout.controls.right).toBeGreaterThan(hudLayout.stars.right);
    expect(hudLayout.progress.left).toBeGreaterThanOrEqual(hudLayout.trailing.left);
    expect(hudLayout.progress.right).toBeLessThanOrEqual(hudLayout.controls.left);

    expect(await page.evaluate(() => document.querySelector('canvas')._stateRef.current.showMissionIntro))
      .toBe(true);
    await expectPageAndShellFit(page, viewport, 'intro');
    await expectSharedIntroContract(page, 'greenwashing-red-flags');

    await dismissIntro(page);
    await expectPageAndShellFit(page, viewport, 'browse');
    await expect(page.getByTestId('touch-controls-surface'))
      .toHaveCount(viewport.touchControls ? 1 : 0);

    const product = await openFirstUnjudgedProduct(page);
    const inspector = page.locator('.spot-the-fake-inspector');
    const playerBefore = await page.evaluate(() => {
      const player = document.querySelector('canvas')._stateRef.current.player;
      return { col: player.col, row: player.row };
    });
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => {
      const player = document.querySelector('canvas')._stateRef.current.player;
      return { col: player.col, row: player.row };
    })).toEqual(playerBefore);
    await expect(page.getByTestId('touch-controls-surface')).toHaveCount(1);

    await advanceToDecision(inspector);
    await expectPageAndShellFit(page, viewport, 'decision');
    await expectInspectorContract(page, viewport, 'decision');

    await page.locator('.spot-the-fake-hud__control').nth(1).click();
    await expect(page.locator('[data-pause-overlay="menu"]')).toBeVisible();
    await page.locator('.pf-pause-action--resume').click();
    await expect(inspector).toBeVisible();

    await inspector.locator(`[data-choice="${oppositeVerdict(product.verdict)}"]`).click();
    await expect(inspector.locator('[data-evidence][data-highlighted="true"]')).toHaveCount(1);
    await expectPageAndShellFit(page, viewport, 'wrong feedback');
    await expectInspectorContract(page, viewport, 'wrong feedback');
    await inspector.getByRole('button').filter({ hasText: /Next|Επόμενο/ }).click();
    await expect(inspector).toHaveCount(0);

    await prepareOneRealFinalJudgement(page);
    await expectPageAndShellFit(page, viewport, 'final synthesis');
    await expectTeachingContract(page, viewport, 'final', 'food-labels');
    await page.getByTestId('spot-teaching-panel').locator('[data-action="teaching-continue"]').click();
    await page.waitForFunction(() => window.__playfood.state().currentScreen === 'result');
    expect(await page.evaluate(() => window.__playfood.state().navigationData.stars)).toBe(2);
    expect(await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }))).toEqual({ width: viewport.width, height: viewport.height });
  });
}

async function expectCloseReachable(page, label) {
  const close = await page.locator('.spot-the-fake-inspector').evaluate((inspector) => {
    inspector.scrollTop = inspector.scrollHeight;
    const button = inspector.querySelector('[data-control="close"]');
    const text = button.querySelector('span:last-child');
    const view = inspector.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    const textBox = text.getBoundingClientRect();
    const title = inspector.querySelector('h2');
    const atCentre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      scrolled: inspector.scrollHeight > inspector.clientHeight ? inspector.scrollTop > 0 : true,
      view: { left: view.left, top: view.top, right: view.right, bottom: view.bottom },
      button: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      text: { left: textBox.left, top: textBox.top, right: textBox.right, bottom: textBox.bottom },
      hitsButton: button.contains(atCentre),
      fontSize: Number.parseFloat(getComputedStyle(text).fontSize),
      titleFits: title.scrollWidth <= title.clientWidth + 1,
    };
  });
  expect(close.scrolled, `${label}: case file scrolled to its end`).toBe(true);
  expectInside(close.button, close.view, `${label}: ✕ visible after scrolling`);
  expectInside(close.text, close.button, `${label}: close label inside its button`);
  expect(close.hitsButton, `${label}: ✕ is not covered`).toBe(true);
  expect(close.fontSize, `${label}: readable close label`).toBeGreaterThanOrEqual(13);
  expect(close.titleFits, `${label}: case-file title is not clipped`).toBe(true);
}

for (const lang of ['en', 'el', 'nl', 'pt']) {
  for (const viewport of VIEWPORTS.filter(({ width }) => [844, 1024, 1366].includes(width))) {
    test(`2.3 case-file close stays reachable in ${lang} at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await bootMission(page, 'local', 3, lang);
      await dismissIntro(page);
      const inspector = page.locator('.spot-the-fake-inspector');

      // Touch: the ✕ in the feedback view continues like Next, after the full teaching steps.
      let product = await openFirstUnjudgedProduct(page);
      await advanceToDecision(inspector);
      await expectCloseReachable(page, `${lang} decision`);
      await inspector.locator(`[data-choice="${product.verdict}"]`).click();
      await expect(inspector.locator('.spot-the-fake-inspector__feedback-actions')).toBeVisible();
      await expectCloseReachable(page, `${lang} feedback`);
      await inspector.locator('[data-control="close"]').tap();
      await expect(inspector).toHaveCount(0);
      expect(await page.evaluate((id) => (
        document.querySelector('canvas')._stateRef.current.products.find((item) => item.id === id).judged
      ), product.id)).toBe(true);

      // Keyboard: Escape from the scrolled feedback view does the same.
      product = await openFirstUnjudgedProduct(page);
      await advanceToDecision(inspector);
      await inspector.locator(`[data-choice="${oppositeVerdict(product.verdict)}"]`).click();
      await expectCloseReachable(page, `${lang} wrong feedback`);
      await page.keyboard.press('Escape');
      await expect(inspector).toHaveCount(0);
      expect(await page.evaluate(() => window.__playfood.state().currentScreen)).toBe('game');
    });
  }
}
