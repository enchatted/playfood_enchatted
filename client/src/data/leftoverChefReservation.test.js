import { expect, it } from 'vitest';
import { RESCUE_GOALS, isReservedForLaterGoal } from './leftoverChef.js';

it('protects every later goal ingredient while allowing current and optional ingredients', () => {
  for (let index = 0; index < RESCUE_GOALS.length; index++) {
    for (const id of RESCUE_GOALS[index].atRisk) {
      expect(isReservedForLaterGoal(id, RESCUE_GOALS, index)).toBe(false);
    }
    for (const goal of RESCUE_GOALS.slice(index + 1)) {
      for (const id of goal.atRisk) expect(isReservedForLaterGoal(id, RESCUE_GOALS, index)).toBe(true);
    }
  }
  expect(isReservedForLaterGoal('stale_bread', RESCUE_GOALS, 0)).toBe(true);
  expect(isReservedForLaterGoal('egg', RESCUE_GOALS, 0)).toBe(false);
});
