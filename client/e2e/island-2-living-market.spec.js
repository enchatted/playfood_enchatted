import { test, expect } from '@playwright/test';

async function bootLocalIsland(page, completed = []) {
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => !!window.__playfood, null, { timeout: 20_000 });
  await page.evaluate((done) => {
    const store = window.__playfood.state();
    store.resetProgress();
    store.setHero('braid');
    for (const missionId of done) store.addCompletedMission('local', missionId);
    if (done.includes(2)) store.markReflectionSeen('local');
    if (done.includes(3)) store.markCeremonySeen('local');
    window.__playfood.goToIsland('local');
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
}

async function faceMission(page, missionId) {
  const positions = {
    1: { col: 4, row: 4, dir: 1 },
    2: { col: 15, row: 4, dir: 1 },
    3: { col: 14, row: 10, dir: 3 },
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
  ).not.toBeNull();
}

async function sampleOpenMarketFloor(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const scene = canvas._stateRef.current.roomSceneRect;
    const internalScaleX = canvas.width / 1280;
    const internalScaleY = canvas.height / 704;
    const roomOrigin = { x: 320, y: 112 };
    const floorCells = [
      { col: 8, row: 5 },
      { col: 9, row: 5 },
      { col: 11, row: 5 },
      { col: 12, row: 5 },
      { col: 8, row: 10 },
      { col: 11, row: 10 },
    ];

    return floorCells.map(({ col, row }) => {
      const roomX = roomOrigin.x + col * 32 + 16;
      const roomY = roomOrigin.y + row * 32 + 16;
      const canvasX = scene.x + (roomX - roomOrigin.x) * scene.scale;
      const canvasY = scene.y + (roomY - roomOrigin.y) * scene.scale;
      const sampleSize = Math.max(4, Math.round(8 * scene.scale * internalScaleX));
      const image = ctx.getImageData(
        Math.round(canvasX * internalScaleX - sampleSize / 2),
        Math.round(canvasY * internalScaleY - sampleSize / 2),
        sampleSize,
        sampleSize,
      ).data;
      let luminance = 0;
      for (let index = 0; index < image.length; index += 4) {
        luminance += 0.2126 * image[index]
          + 0.7152 * image[index + 1]
          + 0.0722 * image[index + 2];
      }
      return luminance / (image.length / 4);
    });
  });
}

async function sampleMarketPerimeter(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const scene = canvas._stateRef.current.roomSceneRect;
    const internalScaleX = canvas.width / 1280;
    const internalScaleY = canvas.height / 704;
    const roomOrigin = { x: 320, y: 112 };
    const wallCells = [
      { col: 3, row: 0 }, { col: 8, row: 0 }, { col: 13, row: 0 },
      { col: 4, row: 14 }, { col: 13, row: 14 }, { col: 16, row: 14 },
    ];

    return wallCells.map(({ col, row }) => {
      const roomX = roomOrigin.x + col * 32 + 16;
      const roomY = roomOrigin.y + row * 32 + 15;
      const canvasX = scene.x + (roomX - roomOrigin.x) * scene.scale;
      const canvasY = scene.y + (roomY - roomOrigin.y) * scene.scale;
      const pixel = ctx.getImageData(
        Math.round(canvasX * internalScaleX),
        Math.round(canvasY * internalScaleY),
        1,
        1,
      ).data;
      return 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
    });
  });
}

async function sampleMarketFixtureFrames(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const scene = canvas._stateRef.current.roomSceneRect;
    const internalScaleX = canvas.width / 1280;
    const internalScaleY = canvas.height / 704;
    const roomOrigin = { x: 320, y: 112 };
    const fixtures = [
      { col: 1, row: 1, x: 15, y: 22 }, // produce crate
      { col: 5, row: 1, x: 16, y: 25 }, // month-calendar post
      { col: 17, row: 1, x: 16, y: 25 }, // distance signpost
      { col: 16, row: 11, x: 16, y: 25 }, // label display post
      { col: 14, row: 12, x: 9, y: 25 }, // challenge flag post
    ];

    return fixtures.map(({ col, row, x, y }) => {
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
      return 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
    });
  });
}

async function sampleMarketZoneColors(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const scene = canvas._stateRef.current.roomSceneRect;
    const internalScaleX = canvas.width / 1280;
    const internalScaleY = canvas.height / 704;
    const roomOrigin = { x: 320, y: 112 };
    const zoneCells = [
      { id: 'season', col: 5, row: 4 },
      { id: 'local', col: 17, row: 4 },
      { id: 'mentor', col: 6, row: 10 },
      { id: 'labels', col: 13, row: 10 },
    ];

    return Object.fromEntries(zoneCells.map(({ id, col, row }) => {
      const roomX = roomOrigin.x + col * 32 + 16;
      const roomY = roomOrigin.y + row * 32 + 16;
      const canvasX = scene.x + (roomX - roomOrigin.x) * scene.scale;
      const canvasY = scene.y + (roomY - roomOrigin.y) * scene.scale;
      const pixel = ctx.getImageData(
        Math.round(canvasX * internalScaleX),
        Math.round(canvasY * internalScaleY),
        1,
        1,
      ).data;
      return [id, { r: pixel[0], g: pixel[1], b: pixel[2] }];
    }));
  });
}

test('the open market uses bright child-friendly paving instead of a dark wood field', async ({ page }) => {
  await bootLocalIsland(page);
  await dismissMentor(page);
  await expect.poll(
    () => page.evaluate(
      () => document.querySelector('canvas')?._stateRef?.current?.irisOpenness ?? 0,
    ),
  ).toBe(1);

  const floorLuminance = await sampleOpenMarketFloor(page);

  expect(Math.min(...floorLuminance), JSON.stringify(floorLuminance)).toBeGreaterThan(205);
  expect(floorLuminance.reduce((sum, value) => sum + value, 0) / floorLuminance.length)
    .toBeGreaterThan(220);
});

test('the market perimeter uses a light honey barrier instead of a dark brown cage', async ({ page }) => {
  await bootLocalIsland(page);
  await dismissMentor(page);
  await expect.poll(
    () => page.evaluate(
      () => document.querySelector('canvas')?._stateRef?.current?.irisOpenness ?? 0,
    ),
  ).toBe(1);

  const perimeterLuminance = await sampleMarketPerimeter(page);

  expect(Math.min(...perimeterLuminance), JSON.stringify(perimeterLuminance))
    .toBeGreaterThan(120);
  expect(perimeterLuminance.reduce((sum, value) => sum + value, 0) / perimeterLuminance.length)
    .toBeGreaterThan(145);
});

test('market signs and crates use light frames instead of repeating dark brown', async ({ page }) => {
  await bootLocalIsland(page);
  await dismissMentor(page);
  await expect.poll(
    () => page.evaluate(
      () => document.querySelector('canvas')?._stateRef?.current?.irisOpenness ?? 0,
    ),
  ).toBe(1);

  const fixtureLuminance = await sampleMarketFixtureFrames(page);

  expect(Math.min(...fixtureLuminance), JSON.stringify(fixtureLuminance))
    .toBeGreaterThan(110);
  expect(fixtureLuminance.reduce((sum, value) => sum + value, 0) / fixtureLuminance.length)
    .toBeGreaterThan(145);
});

test('the four learning corners have distinct light pastel paving cues', async ({ page }) => {
  await bootLocalIsland(page);
  await dismissMentor(page);
  await expect.poll(
    () => page.evaluate(
      () => document.querySelector('canvas')?._stateRef?.current?.irisOpenness ?? 0,
    ),
  ).toBe(1);

  const zones = await sampleMarketZoneColors(page);
  const distance = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
  const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  expect(zones.season.r - zones.season.b).toBeGreaterThan(20);
  expect(zones.local.g - zones.local.r).toBeGreaterThan(10);
  expect(zones.mentor.r - zones.mentor.b).toBeGreaterThan(20);
  expect(zones.labels.b - zones.labels.r).toBeGreaterThan(20);
  expect(Math.min(...Object.values(zones).map(luminance))).toBeGreaterThan(210);
  expect(distance(zones.season, zones.local)).toBeGreaterThan(35);
  expect(distance(zones.mentor, zones.labels)).toBeGreaterThan(35);
});

test('Market Keeper and shoppers use the living-market presentation', async ({ page }) => {
  await bootLocalIsland(page);

  const presentation = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      dedicatedMentor: state.mentorUsesDedicatedSprite,
      hasPortrait: Boolean(state.mentorPortraitSprite),
      shopperStops: state.ambientNPCs.map((shopper) =>
        shopper.waypoints.filter((waypoint) => waypoint.activity).length),
      activeActivities: state.ambientNPCs.map((shopper) => shopper.activity).filter(Boolean),
    };
  });

  expect(presentation).toMatchObject({
    dedicatedMentor: true,
    hasPortrait: true,
    shopperStops: [2, 2, 2, 2],
  });
  expect(presentation.activeActivities).toEqual(
    expect.arrayContaining(['browse-season']),
  );
});

test('locked Market Trip points to 2.1 and cannot launch', async ({ page }) => {
  await bootLocalIsland(page);
  await dismissMentor(page);
  await faceMission(page, 2);

  const before = await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    return {
      locked: state.nearNPC.locked,
      prompt: state.strings.lockedPrompt,
    };
  });
  expect(before.locked).toBe(true);
  expect(before.prompt).toContain('Το Ρολόι των Εποχών');

  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__playfood.screen())).toBe('island');
  await expect.poll(
    () => page.evaluate(
      () => document.querySelector('canvas')?._stateRef?.current?.lockedNudge ?? 0,
    ),
  ).toBeGreaterThan(0);
});

test('the first available local mission still launches with real Enter', async ({ page }) => {
  await bootLocalIsland(page);
  await dismissMentor(page);
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
  })).toEqual({ screen: 'game', island: 'local', missionId: 1 });
});

for (const viewport of [
  { name: 'tablet landscape', width: 1024, height: 768 },
  { name: 'short landscape', width: 844, height: 390 },
]) {
  test(`${viewport.name} contains the living market without overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await bootLocalIsland(page);

    const geometry = await page.evaluate(() => {
      const rect = document.querySelector('canvas').getBoundingClientRect();
      return {
        canvas: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        },
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
