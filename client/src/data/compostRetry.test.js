import { expect, it } from 'vitest';
import * as compost from './compostItems.js';

it('returns a misplaced item to its original stump without resetting other items', () => {
  const milk = { id: 'milk', col: 2, row: 4, picked: true };
  const correct = { id: 'apple', col: 8, row: 4, picked: true };
  const misplaced = { ...milk };
  const state = {
    counterItems: [milk, correct],
    binItems: { plastic: [misplaced], compost: [{ ...correct }] },
    totalPlaced: 2,
    floorItems: [],
  };
  expect(typeof compost.returnCompostItemToStump).toBe('function');
  compost.returnCompostItemToStump(state, misplaced, 'plastic');
  expect(milk).toEqual({ id: 'milk', col: 2, row: 4, picked: false });
  expect(correct.picked).toBe(true);
  expect(state.binItems.plastic).toEqual([]);
  expect(state.binItems.compost).toHaveLength(1);
  expect(state.floorItems).toEqual([]);
  expect(state.totalPlaced).toBe(1);
});
