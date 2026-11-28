import { expect, it } from 'vitest';
import { getGardenCarryAnchor } from './gardenCarryLayout.js';

it('keeps the label and bobbing badge below the top boundary beside the player', () => {
  const result = getGardenCarryAnchor({ x: 700, y: 35, minTop: 50, fieldLeft: 300, fieldRight: 900 });
  expect(result.y - 46 - 2).toBeGreaterThanOrEqual(50);
  expect(result.x).toBeLessThan(700);
});
it('moves inward from the left edge, preserving normal above-player placement elsewhere', () => {
  expect(getGardenCarryAnchor({ x: 310, y: 35, minTop: 50, fieldLeft: 300, fieldRight: 900 }).x).toBe(354);
  expect(getGardenCarryAnchor({ x: 500, y: 200, minTop: 50, fieldLeft: 300, fieldRight: 900 })).toEqual({ x: 500, y: 200 });
});
