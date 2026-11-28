// Garden Planner: round bookkeeping.
//
// Pure helpers so the rules the top bar, the early end and the WATER exit rely
// on are unit-tested in one place. None of them changes a rule: 8 plantings,
// pass at 5 healthy harvests, same points.
//
// Why "8 − wilted" is the ceiling: a plant only wilts when it is planted in the
// wrong season. Every plant that went in at the right time becomes a healthy
// harvest — watering is required but cannot fail, and the wrong harvest tool is
// refused, not destructive. So the most healthy harvests still possible are the
// ones already in the basket, plus every live plant in the ground, plus every
// planting that has not happened yet.

export const GARDEN_TOTAL_PLANTINGS = 8;
export const GARDEN_PASS_HARVESTS = 5;

/** Healthy harvests still reachable from this state (watered or not). */
export function maxPossibleHealthy(plots, plantedCount, totalPlantings = GARDEN_TOTAL_PLANTINGS) {
  const seeded = (plots || []).filter((p) => p.seed);
  const harvestedHealthy = seeded.filter((p) => p.harvested && !p.wilted && p.health >= 2).length;
  const alive = seeded.filter((p) => !p.harvested && !p.wilted).length;
  const left = Math.max(0, totalPlantings - (plantedCount || 0));
  return harvestedHealthy + alive + left;
}

/** True once the pass mark can no longer be reached. */
export function isRunLost(plots, plantedCount, {
  totalPlantings = GARDEN_TOTAL_PLANTINGS, passHarvests = GARDEN_PASS_HARVESTS,
} = {}) {
  return maxPossibleHealthy(plots, plantedCount, totalPlantings) < passHarvests;
}

/** Planted, not wilted — the "Υγιή φυτά" number in the top bar. */
export function healthyPlantCount(plots) {
  return (plots || []).filter((p) => p.seed && !p.wilted).length;
}

/**
 * What the WATER phase should do now:
 *   null      — some live plant still needs water: stay in WATER
 *   'HARVEST' — nothing left to water, something left to harvest or compost
 *   'DONE'    — nothing left to water, harvest or compost: end the round once
 * Before this, the move to HARVEST was only checked inside a finished watering,
 * so a garden with nothing to water could never leave WATER.
 */
export function waterPhaseNext(plots) {
  const seeded = (plots || []).filter((p) => p.seed);
  if (seeded.some((p) => !p.wilted && !p.harvested && p.health < 2)) return null;
  if (seeded.some((p) => !p.harvested)) return 'HARVEST';
  return 'DONE';
}

/** Top-bar progress line per phase: which i18n key and which values. */
export function gardenBarProgress({ phase, plots, plantedCount, healthyHarvests },
  { totalPlantings = GARDEN_TOTAL_PLANTINGS, passHarvests = GARDEN_PASS_HARVESTS } = {}) {
  if (phase === 'HARVEST') {
    return { key: 'garden.bar.harvest_progress', values: { done: healthyHarvests || 0, goal: passHarvests } };
  }
  const healthy = healthyPlantCount(plots);
  if (phase === 'WATER') {
    return { key: 'garden.bar.water_progress', values: { healthy } };
  }
  return {
    key: 'garden.bar.plant_progress',
    values: { healthy, left: Math.max(0, totalPlantings - (plantedCount || 0)) },
  };
}
