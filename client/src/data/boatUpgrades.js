export const BOAT_UPGRADES = Object.freeze([
  Object.freeze({ tier: 0, id: 'starter', capacity: 3, price: 0 }),
  Object.freeze({ tier: 1, id: 'sailboat', capacity: 5, price: 150 }),
  Object.freeze({ tier: 2, id: 'cleanup', capacity: 8, price: 500 }),
  Object.freeze({ tier: 3, id: 'eco', capacity: 12, price: 1000 }),
  Object.freeze({ tier: 4, id: 'guardian', capacity: 18, price: 3000 }),
]);

export function getBoatUpgrade(tier) {
  return BOAT_UPGRADES.find((boat) => boat.tier === Number(tier)) || null;
}

export function getBoatCapacityForTier(tier) {
  return getBoatUpgrade(tier)?.capacity ?? BOAT_UPGRADES[0].capacity;
}

export function countCompletedMissions(completedMissions = {}) {
  return Object.values(completedMissions).reduce(
    (total, ids) => total + (Array.isArray(ids) ? ids.length : 0),
    0,
  );
}

export function legacyBoatTierForCompletedMissions(completedMissions = {}) {
  const total = countCompletedMissions(completedMissions);
  if (total >= 12) return 3;
  if (total >= 9) return 2;
  if (total >= 3) return 1;
  return 0;
}

export function normalizeBoatTier(value, completedMissions = {}) {
  const hasExplicitTier = value !== undefined && value !== null && value !== '';
  const tier = Number(value);
  return hasExplicitTier && Number.isInteger(tier) && getBoatUpgrade(tier)
    ? tier
    : legacyBoatTierForCompletedMissions(completedMissions);
}

export function getBoatCardState({ targetTier, currentTier, points }) {
  const target = getBoatUpgrade(targetTier);
  if (!target) return null;
  const current = Number(currentTier);
  if (target.tier === current) return 'current';
  if (target.tier < current) return 'inactive';
  if (target.tier > current + 1) return 'prerequisite';
  return Number(points) >= target.price ? 'available' : 'locked';
}
