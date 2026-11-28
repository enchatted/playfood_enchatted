import { isDropKeyPressed } from '../engine/gameRoomLogic.js';

export function dropSoilRemedy(state, keys) {
  const down = isDropKeyPressed(keys);
  const pressed = down && !state.qWasDown;
  state.qWasDown = down;
  if (!pressed || !state.carrying || state.showMissionIntro || state.reveal
    || state.diagnosisCard || state.pendingReveal || state.irisOpenness < 1) return false;
  state.carrying = null;
  state.heldItem = null;
  state.actionPrompt = null;
  return true;
}
