import { describe, it, expect } from 'vitest';
import {
  createCart, addToCart, removeFromCart, cartTotal, cartCount,
  withinBudget, remainingBudget, shoppingListFor,
} from './shoppingEngine.js';

describe('shoppingEngine — cart ops (immutable)', () => {
  it('adds, totals, counts, and leaves the original untouched', () => {
    const c0 = createCart();
    const c1 = addToCart(c0, { id: 'rice', price: 1 });
    const c2 = addToCart(c1, { id: 'beef', price: 5 });
    expect(cartCount(c2)).toBe(2);
    expect(cartTotal(c2)).toBe(6);
    expect(c0.items).toHaveLength(0); // original cart not mutated
  });

  it('removes the first matching line; missing id returns the same cart', () => {
    const c = addToCart(addToCart(createCart(), { id: 'a', price: 2 }), { id: 'a', price: 2 });
    expect(cartCount(removeFromCart(c, 'a'))).toBe(1);
    expect(removeFromCart(c, 'zzz')).toBe(c);
  });

  it('budget helpers', () => {
    const c = addToCart(addToCart(createCart(), { id: 'a', price: 7 }), { id: 'b', price: 5 });
    expect(withinBudget(c, 12)).toBe(true);
    expect(withinBudget(c, 11)).toBe(false);
    expect(remainingBudget(c, 20)).toBe(8);
  });
});

describe('shoppingEngine — inventory-first shopping list', () => {
  it('only lists what you do not already own (shop for the gap)', () => {
    expect(shoppingListFor(['rice', 'beef', 'lettuce'], ['lettuce', 'tomato'])).toEqual(['rice', 'beef']);
    expect(shoppingListFor(['lettuce', 'tomato'], ['lettuce', 'tomato'])).toEqual([]);
  });
});
