import { test, expect } from '@playwright/test';

const ISLANDS = ['growing', 'local', 'circular', 'foodwaste'];
const CANVAS_BOUNDS = { width: 1280, height: 704 };
const HUD_HEIGHT = 36;
const ENLARGED_ROOM_RECT = { x: 200, y: 40, width: 880, height: 660, scale: 1.375 };

const LANDSCAPE_VIEWPORTS = [
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet landscape', width: 1024, height: 768 },
  { name: 'short landscape', width: 844, height: 390 },
];

async function bootIsland(page, island, lang = 'el') {
  await page.goto(`/?testMode=1&lang=${lang}`);
  await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
  await page.evaluate((slug) => window.__playfood.goToIsland(slug), island);
  await page.waitForFunction(
    () => window.__playfood.screen() === 'island' && !!document.querySelector('canvas'),
    null,
    { timeout: 20_000 },
  );
  await expect(page.locator('canvas')).toBeVisible();
}

function readIslandLayout(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const state = canvas?._stateRef?.current;
    return {
      roomSceneRect: state?.roomSceneRect ?? null,
      mentorDialog: state?.mentorDialog ?? null,
      mentorDialogLayout: state?.mentorDialogLayout ?? null,
    };
  });
}

function expectContained(rect, width, height, label) {
  expect(rect.width, `${label} must have a visible width`).toBeGreaterThan(0);
  expect(rect.height, `${label} must have a visible height`).toBeGreaterThan(0);
  expect(rect.left, `${label} must stay inside the left edge`).toBeGreaterThanOrEqual(-1);
  expect(rect.top, `${label} must stay inside the top edge`).toBeGreaterThanOrEqual(-1);
  expect(rect.right, `${label} must stay inside the right edge`).toBeLessThanOrEqual(width + 1);
  expect(rect.bottom, `${label} must stay inside the bottom edge`).toBeLessThanOrEqual(height + 1);
}

test.describe('shared island-room scene scale', () => {
  for (const island of ISLANDS) {
    test(`${island} uses the enlarged room and compact mentor card`, async ({ page }) => {
      await bootIsland(page, island);

      const beforeDismiss = await readIslandLayout(page);

      const scene = beforeDismiss.roomSceneRect;
      expect(scene, `${island}: renderer must publish its shared scene rect`)
        .toMatchObject(ENLARGED_ROOM_RECT);
      expect(scene.y, `${island}: scene must start below the HUD`).toBeGreaterThanOrEqual(HUD_HEIGHT);
      expect(scene.x, `${island}: scene must stay inside the left canvas edge`).toBeGreaterThanOrEqual(0);
      expect(scene.x + scene.width, `${island}: scene must stay inside the right canvas edge`)
        .toBeLessThanOrEqual(CANVAS_BOUNDS.width);
      expect(scene.y + scene.height, `${island}: scene must stay inside the bottom canvas edge`)
        .toBeLessThanOrEqual(CANVAS_BOUNDS.height);

      const card = beforeDismiss.mentorDialogLayout;
      expect(card, `${island}: mentor card must publish its dynamic layout`).not.toBeNull();
      expect(card.width).toBeLessThanOrEqual(660);
      expect(card.bodyFontSize).toBe(16);
      expect(card.lineHeight).toBeLessThanOrEqual(24);
      expect(card.height).toBeGreaterThan(0);
      expect(card.height).toBeLessThanOrEqual(296);
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(1280);
      expect(card.y + card.height).toBeLessThanOrEqual(704);
      expect(beforeDismiss.mentorDialog).not.toBeNull();

      await page.keyboard.press('Enter');
      await expect.poll(
        async () => (await readIslandLayout(page)).mentorDialog,
        { message: `${island}: Enter must dismiss the mentor card` },
      ).toBeNull();
    });
  }

  test('scaled room preserves keyboard movement and first-mission launch', async ({ page }) => {
    await bootIsland(page, 'growing');

    await page.keyboard.press('Enter');
    await expect.poll(
      async () => (await readIslandLayout(page)).mentorDialog,
      { message: 'Enter must dismiss the mentor card before walking' },
    ).toBeNull();

    await page.evaluate(async () => {
      await window.__playfood.walk('up', 9);
      await window.__playfood.walk('left', 6);
      await window.__playfood.walk('up', 1);
    });

    const interaction = await page.evaluate(() => {
      const state = document.querySelector('canvas')?._stateRef?.current;
      return {
        player: state?.player ? { col: state.player.col, row: state.player.row } : null,
        nearNPC: state?.nearNPC
          ? { id: state.nearNPC.id, locked: state.nearNPC.locked }
          : null,
      };
    });
    expect(interaction.player).toEqual({ col: 4, row: 4 });
    expect(interaction.nearNPC).toMatchObject({ id: 1, locked: false });

    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => window.__playfood.screen() === 'game',
      null,
      { timeout: 10_000 },
    );
    expect(await page.evaluate(() => {
      const { currentScreen, navigationData } = window.__playfood.state();
      return {
        currentScreen,
        island: navigationData.island,
        missionId: navigationData.missionId,
      };
    })).toEqual({ currentScreen: 'game', island: 'growing', missionId: 1 });
  });
});

test.describe('island-room viewport containment', () => {
  for (const viewport of LANDSCAPE_VIEWPORTS) {
    test(`${viewport.name} keeps the canvas visible without document overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await bootIsland(page, 'growing');

      const geometry = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const wrapper = canvas.parentElement;
        const toPlainRect = (rect) => ({
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        });
        return {
          canvas: toPlainRect(canvas.getBoundingClientRect()),
          wrapper: toPlainRect(wrapper.getBoundingClientRect()),
          mentorDialogLayout: canvas._stateRef?.current?.mentorDialogLayout ?? null,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      });

      expectContained(geometry.wrapper, viewport.width, viewport.height, 'island wrapper');
      expectContained(geometry.canvas, viewport.width, viewport.height, 'island canvas');
      expect(geometry.mentorDialogLayout?.physicalBodyFontSize)
        .toBeGreaterThanOrEqual(14);
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight);
    });
  }

  test('portrait tablet shows the localized rotate message and contains the canvas', async ({ page }) => {
    const viewport = { width: 768, height: 1024 };
    await page.setViewportSize(viewport);
    await bootIsland(page, 'growing', 'el');

    const rotateDevice = page.getByTestId('rotate-device');
    await expect(rotateDevice).toBeVisible();
    await expect(rotateDevice).toContainText('Γύρισε τη συσκευή σου');
    await expect(rotateDevice).toContainText('Το παιχνίδι παίζεται οριζόντια');

    const beforeInput = await page.evaluate(() => {
      const state = document.querySelector('canvas')?._stateRef?.current;
      return {
        mentorText: state?.mentorDialog?.text,
        player: state?.player ? { col: state.player.col, row: state.player.row } : null,
      };
    });
    await page.keyboard.press('Enter');
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(180);
    await page.keyboard.up('ArrowUp');
    const afterInput = await page.evaluate(() => {
      const state = document.querySelector('canvas')?._stateRef?.current;
      return {
        mentorText: state?.mentorDialog?.text,
        player: state?.player ? { col: state.player.col, row: state.player.row } : null,
      };
    });
    expect(afterInput).toEqual(beforeInput);

    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const rect = canvas.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
      };
    });

    expectContained(geometry, viewport.width, viewport.height, 'portrait island canvas');
    expect(geometry.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(geometry.documentHeight).toBeLessThanOrEqual(viewport.height);
  });
});
