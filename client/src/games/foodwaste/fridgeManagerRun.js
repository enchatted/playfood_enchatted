import { TIER } from '../../data/fridgeData.js';

export function createFridgeRunProgress() {
  return {
    acceptedFoodIds: [],
    acceptedCount: 0,
    firstTryAcceptedCount: 0,
    attemptsByFood: {},
    suboptimalCount: 0,
    avoidCount: 0,
  };
}

// Live stars show the best tier still available from the choices already made.
// At completion, acceptedCount is 10, so these thresholds exactly match
// gradeFridgeRun(): 0–1 missed first tries = 3★, 2–3 = 2★, 4+ = 1★.
export function liveFridgeStars(acceptedCount, firstTryAcceptedCount) {
  if (acceptedCount <= 0) return 0;
  const missedFirstTries = Math.max(0, acceptedCount - firstTryAcceptedCount);
  if (missedFirstTries <= 1) return 3;
  if (missedFirstTries <= 3) return 2;
  return 1;
}

export function recordFridgeAttempt(progress, { foodId, tier }) {
  const previousAttempts = progress.attemptsByFood[foodId] || 0;
  progress.attemptsByFood[foodId] = previousAttempts + 1;

  if (tier === TIER.SUBOPTIMAL) {
    progress.suboptimalCount += 1;
    return { accepted: false, firstTry: false, points: 0 };
  }

  if (tier === TIER.AVOID) {
    progress.avoidCount += 1;
    return { accepted: false, firstTry: false, points: 0 };
  }

  const alreadyAccepted = progress.acceptedFoodIds.includes(foodId);
  if (!alreadyAccepted) {
    progress.acceptedFoodIds.push(foodId);
    progress.acceptedCount = progress.acceptedFoodIds.length;
    if (previousAttempts === 0) progress.firstTryAcceptedCount += 1;
  }

  return {
    accepted: true,
    firstTry: !alreadyAccepted && previousAttempts === 0,
    points: alreadyAccepted ? 0 : 10,
  };
}
