import { expect, it } from 'vitest';
import { dropSeasonCartItem } from './seasonCart.js';

const setup = () => ({ irisOpenness: 1, cart: [{ id: 'a', energyCost: 0 }, { id: 'b', energyCost: 10 }],
  foods: [{ id: 'a', taken: true }, { id: 'b', taken: true }], energy: 20,
  boughtOutOfSeason: [{ id: 'old' }, { id: 'b' }], basketItems: [{ id: 'old' }], score: 30 });

it.each(['q', 'keyq'])('returns only the last unpurchased item with %s', key => {
  const state = setup();
  expect(dropSeasonCartItem(state, new Set([key]))).toBe(true);
  expect(state.cart).toEqual([{ id: 'a', energyCost: 0 }]);
  expect(state.foods[1].taken).toBe(false);
  expect(state.energy).toBe(10);
  expect(state.boughtOutOfSeason).toEqual([{ id: 'old' }]);
  expect(state.basketItems).toEqual([{ id: 'old' }]);
  expect(state.score).toBe(30);
  expect(dropSeasonCartItem(state, new Set([key]))).toBe(false);
  dropSeasonCartItem(state, new Set());
  expect(dropSeasonCartItem(state, new Set([key]))).toBe(true);
});

it.each(['showMissionIntro', 'checkoutQueue', 'shoppingDone'])('blocks return during %s without queuing the held key', gate => {
  const state = setup();
  state[gate] = true;
  expect(dropSeasonCartItem(state, new Set(['q']))).toBe(false);
  state[gate] = false;
  expect(dropSeasonCartItem(state, new Set(['q']))).toBe(false);
  expect(state.cart).toHaveLength(2);
});
