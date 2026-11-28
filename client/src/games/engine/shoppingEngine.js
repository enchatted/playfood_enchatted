// shoppingEngine.js — reusable cart / budget logic for shop-style game phases.
//
// Built fresh. It deliberately does NOT import from or modify MarketTrip, so the
// accepted Island 2 game stays untouched. The Meal
// Planner CHECK/SHOP phase consumes this module; MarketTrip MAY migrate onto it later,
// but only with its own re-acceptance. Pure functions, no canvas/state coupling.

// A cart is a plain value: { items: [{ id, price, ... }] }. All ops return a NEW cart
// so the caller can keep the previous value (undo, diffing) without surprises.
export function createCart() {
  return { items: [] };
}

export function addToCart(cart, item) {
  return { ...cart, items: [...cart.items, item] };
}

// Removes the FIRST line matching `id` (carts may hold duplicates of the same item).
export function removeFromCart(cart, id) {
  const idx = cart.items.findIndex((it) => it.id === id);
  if (idx < 0) return cart;
  const items = cart.items.slice();
  items.splice(idx, 1);
  return { ...cart, items };
}

export function cartCount(cart) {
  return cart.items.length;
}

export function cartTotal(cart) {
  return cart.items.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
}

export function withinBudget(cart, budget) {
  return cartTotal(cart) <= budget;
}

export function remainingBudget(cart, budget) {
  return budget - cartTotal(cart);
}

// Inventory-first: the only items you actually NEED to buy are the ones you don't
// already own. This is the hook the Meal Planner's Waste axis rewards — shop for the
// gap, not the whole list. `neededIds` may contain duplicates; owned ids are filtered
// out entirely (you cook with what you have).
export function shoppingListFor(neededIds, inventoryIds) {
  const owned = new Set(inventoryIds);
  return neededIds.filter((id) => !owned.has(id));
}
