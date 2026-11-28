import { describe, expect, it } from 'vitest';
import { CANVAS_H, CANVAS_W } from '../../overworld/overworldData.js';
import { GAME_ROOMS } from './gameRoomData.js';
import { roomToCanvas } from './gameRoomRenderer.js';
import * as LeftoverChefRenderer from './leftoverChefRenderer.js';
import {
  getLeftoverPromptLayout,
  shouldRenderLeftoverInteractionPrompts,
} from './leftoverChefRenderer.js';

describe('Leftover Chef interaction presentation', () => {
  it('keeps both bottom prompts separated from one another and the bottom edge', () => {
    const layout = getLeftoverPromptLayout({ actionTextWidth: 680, dropTextWidth: 360 });

    expect(layout.action.width).toBeLessThanOrEqual(CANVAS_W - 160);
    expect(layout.action.y + layout.action.height).toBeLessThan(layout.drop.y);
    expect(layout.drop.y + layout.drop.height).toBeLessThanOrEqual(CANVAS_H - 20);
  });

  it.each([
    [{ cooking: true }],
    [{ dishReveal: { emoji: '🍲' } }],
    [{ factCard: { title: 'Food safety' } }],
    [{ celebrating: true }],
  ])('hides interaction prompts while a blocking phase is active: %o', (state) => {
    expect(shouldRenderLeftoverInteractionPrompts(state)).toBe(false);
  });

  it('allows prompts during ordinary planning play', () => {
    expect(shouldRenderLeftoverInteractionPrompts({})).toBe(true);
  });
});

describe('Leftover Chef preparation-station guidance', () => {
  const goals = [
    { id: 'vegetables', atRisk: ['wilted_lettuce', 'ripe_tomato'] },
    { id: 'rice', atRisk: ['leftover_rice', 'half_onion'] },
    { id: 'bread', atRisk: ['stale_bread', 'brown_banana'] },
  ];

  it('highlights only the foods required by the active rescue goal', () => {
    const state = { goals, goalIndex: 1, completedGoals: ['vegetables'] };

    expect(LeftoverChefRenderer.activeGoalItemIds?.(state)).toEqual([
      'leftover_rice',
      'half_onion',
    ]);
    expect(LeftoverChefRenderer.isActiveGoalItem?.(state, 'leftover_rice')).toBe(true);
    expect(LeftoverChefRenderer.isActiveGoalItem?.(state, 'egg')).toBe(false);
  });

  it('keeps the rescued goal on the banner while its reveal / safety card is up', () => {
    const t = (k, d) => ({ 'leftover_chef.dish_rescued': 'RESCUED', 'leftover_chef.rescue_label': 'RESCUE' }[k] || d);
    const base = { goals, goalIndex: 1, completedGoals: ['vegetables'], itemEmoji: {}, itemName: {} };
    for (const phase of [{ dishReveal: {} }, { pendingFact: {} }, { factCard: {} }]) {
      const state = { ...base, ...phase };
      expect(LeftoverChefRenderer.isDishRecap(state)).toBe(true);
      expect(LeftoverChefRenderer.activeGoalItemIds(state)).toEqual([]);
    }
    expect(LeftoverChefRenderer.isDishRecap(base)).toBe(false);
    expect(LeftoverChefRenderer.activeGoalItemIds(base)).toEqual(['leftover_rice', 'half_onion']);
    // banner text: a recording canvas context keeps every string drawn with fillText
    const rec = { texts: [] };
    const recCtx = new Proxy({}, {
      get: (_, k) => {
        if (k === 'fillText') return (s) => rec.texts.push(String(s));
        if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
        return () => {};
      },
      set: () => true,
    });
    LeftoverChefRenderer.renderGoalBanner(recCtx, { ...base, factCard: {}, itemName: { wilted_lettuce: 'LETTUCE', leftover_rice: 'RICE' } }, t);
    expect(rec.texts.some((x) => x.includes('RESCUED'))).toBe(true);
    expect(rec.texts.join(' ')).toMatch(/LETTUCE/);
    expect(rec.texts.join(' ')).not.toMatch(/RICE\b/);
    rec.texts = [];
    LeftoverChefRenderer.renderGoalBanner(recCtx, { ...base, itemName: { wilted_lettuce: 'LETTUCE', leftover_rice: 'RICE' } }, t);
    expect(rec.texts).toContain('RESCUE');
    expect(rec.texts.join(' ')).toMatch(/RICE/);
  });

  it('removes the ingredient emphasis after all rescue goals are complete', () => {
    const state = { goals, goalIndex: 2, completedGoals: ['vegetables', 'rice', 'bread'] };

    expect(LeftoverChefRenderer.activeGoalItemIds?.(state)).toEqual([]);
  });

  it('anchors one readable label directly above each preparation bench', () => {
    const labels = LeftoverChefRenderer.counterBenchLabelLayout?.(
      GAME_ROOMS.LeftoverChef.map,
    );

    expect(labels).toHaveLength(2);
    expect(labels?.map(({ side }) => side)).toEqual(['left', 'right']);
    for (const label of labels || []) {
      const screenTop = roomToCanvas(GAME_ROOMS.LeftoverChef, label.x, label.y).y;
      expect(label.width).toBeGreaterThan(120);
      expect(label.width).toBeLessThanOrEqual(150);
      expect(label.height).toBeGreaterThanOrEqual(22);
      expect(label.height).toBeLessThanOrEqual(24);
      expect(screenTop).toBeGreaterThanOrEqual(156);
      expect(label.y + label.height).toBeLessThanOrEqual(label.benchY + 10);
    }
  });

  it('animates each chef inside its blocked tile during ordinary play', () => {
    const firstFrame = LeftoverChefRenderer.getKitchenStaffMotion?.({ time: 0 }, 0);
    const laterFrame = LeftoverChefRenderer.getKitchenStaffMotion?.({ time: 0.45 }, 0);

    expect(firstFrame).toBeDefined();
    expect(laterFrame).toBeDefined();
    expect(laterFrame).not.toEqual(firstFrame);
    expect(Math.abs(laterFrame?.offsetX || 0)).toBeLessThanOrEqual(2);
    expect(Math.abs(laterFrame?.offsetY || 0)).toBeLessThanOrEqual(2);
  });

  it.each([
    { showMissionIntro: true, time: 1 },
    { cooking: true, time: 1 },
    { dishReveal: { emoji: '🍲' }, time: 1 },
    { factCard: { title: 'Food safety' }, time: 1 },
  ])('keeps chefs still behind blocking overlays: %o', (state) => {
    expect(LeftoverChefRenderer.getKitchenStaffMotion?.(state, 0)).toEqual({
      offsetX: 0,
      offsetY: 0,
      walkFrame: 0,
      activityOffsetY: 0,
    });
  });
});

describe('Leftover Chef rescue-goal board', () => {
  it('centres the goal progress tab on the board', () => {
    const { board, progress } = LeftoverChefRenderer.goalBannerLayout();

    expect(progress.x + progress.width / 2).toBe(board.x + board.width / 2);
  });

  it('keeps the progress tab, instruction and ingredient ticket in distinct readable rows', () => {
    const layout = LeftoverChefRenderer.goalBannerLayout?.();

    expect(layout).toBeDefined();
    expect(layout?.board.height).toBeGreaterThanOrEqual(100);
    expect(layout?.progress.y + layout?.progress.height).toBeLessThanOrEqual(
      layout?.instruction.y,
    );
    expect(layout?.instruction.y + layout?.instruction.height).toBeLessThanOrEqual(
      layout?.ingredients.y,
    );
    expect(layout?.ingredients.x).toBeGreaterThanOrEqual(layout?.board.x);
    expect(layout?.ingredients.x + layout?.ingredients.width).toBeLessThanOrEqual(
      layout?.board.x + layout?.board.width,
    );
    expect(layout?.ingredients.y + layout?.ingredients.height).toBeLessThanOrEqual(
      layout?.board.y + layout?.board.height,
    );
  });
});
