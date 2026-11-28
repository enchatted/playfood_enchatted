import { test, expect } from '@playwright/test';

async function bootFoodwasteIsland(page, completed = []) {
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
  await page.evaluate((done) => {
    const store = window.__playfood.state();
    store.resetProgress();
    store.setHero('braid');
    for (const missionId of done) store.addCompletedMission('foodwaste', missionId);
    if (done.includes(3)) store.markCeremonySeen('foodwaste');
    window.__playfood.goToIsland('foodwaste');
  }, completed);
  await page.waitForFunction(
    () => window.__playfood.screen() === 'island'
      && !!document.querySelector('canvas')?._stateRef?.current,
    null,
    { timeout: 20_000 },
  );
}

async function dismissMentor(page) {
  const hasDialog = await page.evaluate(
    () => Boolean(document.querySelector('canvas')?._stateRef?.current?.mentorDialog),
  );
  if (hasDialog) await page.keyboard.press('Enter');
  await expect.poll(
    () => page.evaluate(
      () => document.querySelector('canvas')?._stateRef?.current?.mentorDialog ?? null,
    ),
  ).toBeNull();
  await expect.poll(
    () => page.evaluate(
      () => document.querySelector('canvas')?._stateRef?.current?.irisOpenness ?? 0,
    ),
  ).toBe(1);
}

async function sampleRoomPoints(page, points) {
  return page.evaluate((samplePoints) => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const scene = canvas._stateRef.current.roomSceneRect;
    const internalScaleX = canvas.width / 1280;
    const internalScaleY = canvas.height / 704;
    const roomOrigin = { x: 320, y: 112 };

    return Object.fromEntries(samplePoints.map(({ id, col, row, x = 16, y = 16 }) => {
      const roomX = roomOrigin.x + col * 32 + x;
      const roomY = roomOrigin.y + row * 32 + y;
      const canvasX = scene.x + (roomX - roomOrigin.x) * scene.scale;
      const canvasY = scene.y + (roomY - roomOrigin.y) * scene.scale;
      const pixel = ctx.getImageData(
        Math.round(canvasX * internalScaleX),
        Math.round(canvasY * internalScaleY),
        1,
        1,
      ).data;
      return [id, {
        r: pixel[0],
        g: pixel[1],
        b: pixel[2],
        luminance: 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2],
      }];
    }));
  }, points);
}

async function faceMission(page, missionId) {
  const positions = {
    1: { col: 4, row: 4, dir: 1 },
    2: { col: 15, row: 4, dir: 1 },
  };
  await page.evaluate((position) => {
    const state = document.querySelector('canvas')._stateRef.current;
    Object.assign(state.player, {
      ...position,
      pixelX: position.col * 32,
      pixelY: position.row * 32,
      moving: false,
    });
  }, positions[missionId]);
  await expect.poll(
    () => page.evaluate(() => {
      const npc = document.querySelector('canvas')?._stateRef?.current?.nearNPC;
      return npc ? { id: npc.id, locked: npc.locked } : null;
    }),
  ).toMatchObject({ id: missionId });
}

test('the kitchen uses a bright cream floor and one continuous teaching island', async ({ page }) => {
  await bootFoodwasteIsland(page);
  await dismissMentor(page);

  const pixels = await sampleRoomPoints(page, [
    { id: 'floorA', col: 8, row: 5 },
    { id: 'floorB', col: 10, row: 8 },
    { id: 'floorC', col: 12, row: 5 },
    { id: 'prepA', col: 8, row: 6 },
    { id: 'prepB', col: 10, row: 6 },
    { id: 'prepC', col: 12, row: 6 },
    { id: 'prepFrame', col: 7, row: 6, x: 1, y: 4 },
    { id: 'prepSurface', col: 7, row: 6, x: 16, y: 13 },
    { id: 'counterA', col: 4, row: 1 },
    { id: 'counterB', col: 3, row: 12 },
  ]);

  const floor = [pixels.floorA, pixels.floorB, pixels.floorC];
  const prep = [pixels.prepA, pixels.prepB, pixels.prepC];
  expect(Math.min(...floor.map((pixel) => pixel.luminance))).toBeGreaterThan(220);
  expect(Math.min(...prep.map((pixel) => pixel.luminance))).toBeGreaterThan(175);
  expect(Math.max(...prep.map((pixel) => pixel.luminance))
    - Math.min(...prep.map((pixel) => pixel.luminance))).toBeLessThan(75);
  expect(Math.min(pixels.counterA.luminance, pixels.counterB.luminance))
    .toBeGreaterThan(175);
  expect(pixels.prepFrame.g - pixels.prepFrame.r).toBeGreaterThan(10);
  expect(pixels.prepSurface.luminance - pixels.prepFrame.luminance)
    .toBeGreaterThan(45);
});

test('the four teaching corners use distinct light pastel cues', async ({ page }) => {
  await bootFoodwasteIsland(page);
  await dismissMentor(page);

  const zones = await sampleRoomPoints(page, [
    { id: 'fridge', col: 6, row: 3 },
    { id: 'plan', col: 13, row: 3 },
    { id: 'chef', col: 6, row: 11 },
    { id: 'leftovers', col: 13, row: 11 },
    { id: 'crossA', col: 8, row: 5 },
    { id: 'crossB', col: 10, row: 8 },
    { id: 'crossC', col: 12, row: 5 },
  ]);
  const distance = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

  const cornerPixels = [zones.fridge, zones.plan, zones.chef, zones.leftovers];
  const crossLuminance = (zones.crossA.luminance + zones.crossB.luminance
    + zones.crossC.luminance) / 3;

  expect(Math.min(...cornerPixels.map((pixel) => pixel.luminance)))
    .toBeGreaterThan(165);
  expect(Math.max(...cornerPixels.map((pixel) => pixel.luminance)))
    .toBeLessThan(crossLuminance - 18);
  expect(zones.fridge.b - zones.fridge.r).toBeGreaterThan(5);
  expect(zones.plan.g - zones.plan.r).toBeGreaterThan(5);
  expect(zones.chef.r - zones.chef.b).toBeGreaterThan(15);
  expect(zones.leftovers.r - zones.leftovers.b).toBeGreaterThan(15);
  expect(distance(zones.fridge, zones.plan)).toBeGreaterThan(20);
  expect(distance(zones.chef, zones.leftovers)).toBeGreaterThan(20);
});

test('the Chef and six visitors use the living-kitchen presentation', async ({ page }) => {
  await bootFoodwasteIsland(page);

  const presentation = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      dedicatedMentor: state.mentorUsesDedicatedSprite,
      hasPortrait: Boolean(state.mentorPortraitSprite),
      visitorCount: state.ambientNPCs.length,
      purposefulStops: state.ambientNPCs.map((visitor) =>
        visitor.waypoints.filter((waypoint) => waypoint.activity).length),
    };
  });

  expect(presentation).toEqual({
    dedicatedMentor: true,
    hasPortrait: true,
    visitorCount: 6,
    purposefulStops: [2, 2, 2, 2, 2, 3],
  });
});

test('the redesigned room preserves mission order and real Enter interaction', async ({ page }) => {
  await bootFoodwasteIsland(page);
  await dismissMentor(page);
  await faceMission(page, 2);

  expect(await page.evaluate(
    () => document.querySelector('canvas')._stateRef.current.nearNPC.locked,
  )).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__playfood.screen())).toBe('island');

  await faceMission(page, 1);
  expect(await page.evaluate(
    () => document.querySelector('canvas')._stateRef.current.nearNPC.locked,
  )).toBe(false);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__playfood.screen() === 'game', null, {
    timeout: 10_000,
  });
  expect(await page.evaluate(() => {
    const { currentScreen, navigationData } = window.__playfood.state();
    return {
      screen: currentScreen,
      island: navigationData.island,
      missionId: navigationData.missionId,
    };
  })).toEqual({ screen: 'game', island: 'foodwaste', missionId: 1 });
});

for (const viewport of [
  { name: 'tablet landscape', width: 1024, height: 768 },
  { name: 'short landscape', width: 844, height: 390 },
]) {
  test(`${viewport.name} contains the teaching kitchen without overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await bootFoodwasteIsland(page);

    const geometry = await page.evaluate(() => {
      const rect = document.querySelector('canvas').getBoundingClientRect();
      return {
        canvas: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        document: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
      };
    });

    expect(geometry.canvas.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.canvas.top).toBeGreaterThanOrEqual(-1);
    expect(geometry.canvas.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
    expect(geometry.canvas.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
    expect(geometry.document.width).toBeLessThanOrEqual(geometry.viewport.width);
    expect(geometry.document.height).toBeLessThanOrEqual(geometry.viewport.height);
  });
}
