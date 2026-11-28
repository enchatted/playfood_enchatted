import { isDropKeyPressed } from '../engine/gameRoomLogic.js';

export function dropSeasonCartItem(state, keys) {
  const down = isDropKeyPressed(keys);
  const pressed = down && !state.qWasDown;
  state.qWasDown = down;
  if (!pressed || !state.cart.length || state.showMissionIntro || state.checkoutQueue
    || state.shoppingDone || state.irisOpenness < 1) return false;
  const item = state.cart.pop();
  const food = state.foods.find(food => food.id === item.id);
  if (food) food.taken = false;
  state.energy = Math.max(0, state.energy - item.energyCost);
  if (item.energyCost > 0) {
    const index = state.boughtOutOfSeason.findLastIndex(food => food.id === item.id);
    if (index >= 0) state.boughtOutOfSeason.splice(index, 1);
  }
  state.feedbackText = null;
  state.feedbackTimer = 0;
  state.actionPrompt = null;
  return true;
}
