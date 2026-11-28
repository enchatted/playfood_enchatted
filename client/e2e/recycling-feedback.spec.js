import { test, expect } from '@playwright/test';

test('clicking the recycling prompt deposits the boat cargo', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => !!window.__playfood);
  await page.evaluate(() => window.__playfood.goToScreen('hub'));
  await page.waitForFunction(
    () => !!document.querySelector('canvas')?._stateRef?.current?.player,
    null,
    { timeout: 5_000 },
  );

  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    Object.assign(state.player, {
      col: 28,
      row: 34,
      pixelX: 28 * 32,
      pixelY: 34 * 32,
      fromX: 28 * 32,
      fromY: 34 * 32,
      toX: 28 * 32,
      toY: 34 * 32,
      moving: false,
      moveTimer: 0,
    });
    state.trashCargo = 1;
    state.cargoFull = false;
  });

  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.nearDock
  ))).toBe('recycling');
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('canvas')._stateRef.current.recyclingPromptRect
  ))).toBe(true);

  const promptRect = await page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.recyclingPromptRect
  ));
  const canvasRect = await page.locator('canvas').boundingBox();
  await page.mouse.click(
    canvasRect.x + (promptRect.x + promptRect.width / 2) * canvasRect.width / 1280,
    canvasRect.y + (promptRect.y + promptRect.height / 2) * canvasRect.height / 704,
  );

  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.trashCargo
  ))).toBe(0);
});

test('Task 4 — recycling shows the real count and marine-life consequence', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => !!window.__playfood);
  await page.evaluate(() => window.__playfood.goToScreen('hub'));
  await page.waitForFunction(() => window.__playfood.screen() === 'hub');
  await page.waitForFunction(
    () => !!document.querySelector('canvas')?._stateRef?.current?.player,
    null,
    { timeout: 5_000 },
  );

  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    Object.assign(state.player, {
      col: 28,
      row: 34,
      pixelX: 28 * 32,
      pixelY: 34 * 32,
      fromX: 28 * 32,
      fromY: 34 * 32,
      toX: 28 * 32,
      toY: 34 * 32,
      moving: false,
      moveTimer: 0,
    });
    state.trashCargo = 3;
    state.cargoFull = true;
  });
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.nearDock
  ))).toBe('recycling');

  await page.keyboard.press('Enter');

  await expect.poll(() => page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    const store = window.__playfood.state();
    return {
      trashCargo: state.trashCargo,
      toast: state.toast && {
        text: state.toast.text,
        detail: state.toast.detail,
        variant: state.toast.variant,
        duration: state.toast.duration,
      },
      points: store.points,
      recycleTrips: store.recycleTrips,
      totalRecycled: store.totalRecycled,
    };
  })).toEqual({
    trashCargo: 0,
    toast: {
      text: '♻️ Ανακύκλωσες 3 σκουπίδια! +15 πόντοι',
      detail: '🐢 Καθαρότερη θάλασσα σημαίνει ασφαλέστερο σπίτι για τη θαλάσσια ζωή.',
      variant: 'impact',
      duration: 4.8,
    },
    points: 15,
    recycleTrips: 1,
    totalRecycled: 3,
  });
});

test('the fifth recycling trip stays at five points and rotates the impact message', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => !!window.__playfood);
  await page.evaluate(() => {
    window.__playfood.setProgress({
      points: 200,
      recycleTrips: 4,
      totalRecycled: 4,
    });
    window.__playfood.goToScreen('hub');
  });
  await page.waitForFunction(
    () => !!document.querySelector('canvas')?._stateRef?.current?.player,
    null,
    { timeout: 5_000 },
  );

  await page.evaluate(() => {
    const state = document.querySelector('canvas')._stateRef.current;
    Object.assign(state.player, {
      col: 28,
      row: 34,
      pixelX: 28 * 32,
      pixelY: 34 * 32,
      fromX: 28 * 32,
      fromY: 34 * 32,
      toX: 28 * 32,
      toY: 34 * 32,
      moving: false,
      moveTimer: 0,
    });
    state.trashCargo = 1;
    state.cargoFull = false;
  });
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('canvas')._stateRef.current.nearDock
  ))).toBe('recycling');

  await page.keyboard.press('Enter');

  await expect.poll(() => page.evaluate(() => {
    const world = document.querySelector('canvas')._stateRef.current;
    const store = window.__playfood.state();
    return {
      points: store.points,
      recycleTrips: store.recycleTrips,
      totalRecycled: store.totalRecycled,
      trashCargo: world.trashCargo,
      toast: world.toast && {
        text: world.toast.text,
        detail: world.toast.detail,
      },
    };
  })).toEqual({
    points: 205,
    recycleTrips: 5,
    totalRecycled: 5,
    trashCargo: 0,
    toast: {
      text: '♻️ Ανακύκλωσες 1 σκουπίδι! +5 πόντοι',
      detail: '🐟 Τα θαλάσσια ζώα μπορεί να μπερδέψουν το πλαστικό με τροφή.',
    },
  });
});

test('a fully restored archipelago keeps exactly two renewable litter pieces', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?testMode=1&lang=el');
  await page.waitForFunction(() => Boolean(window.__playfood));
  await page.evaluate(() => {
    window.__playfood.setProgress({
      boatTier: 4,
      completedMissions: {
        growing: [1, 2, 3],
        local: [1, 2, 3],
        foodwaste: [1, 2, 3],
        circular: [1, 2, 3],
      },
      trashCargo: 0,
    });
    window.__playfood.goToScreen('hub');
  });
  await page.waitForFunction(() => (
    document.querySelector('canvas')?._stateRef?.current?.debris?.length === 2
  ));

  await expect.poll(() => page.evaluate(() => {
    const world = document.querySelector('canvas')._stateRef.current;
    return {
      boatTier: world.boatTier,
      capacity: world.trashCapacity,
      debris: world.debris.length,
      completed: Object.values(window.__playfood.state().completedMissions)
        .reduce((total, missions) => total + missions.length, 0),
    };
  })).toEqual({ boatTier: 4, capacity: 18, debris: 2, completed: 12 });

  await page.evaluate(() => {
    const world = document.querySelector('canvas')._stateRef.current;
    const offsets = [
      { x: -180, y: 70 },
      { x: 180, y: 70 },
    ];
    world.debris.forEach((item, index) => {
      item.x = world.player.pixelX + 16 + offsets[index].x;
      item.y = world.player.pixelY + 16 + offsets[index].y;
      item.driftAngle = 0;
    });
  });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: 'test-results/replay-economy/restored-ocean-tier4.png',
    fullPage: true,
  });
});
