// demoMode.js — build-time gating for the Island-1-only demo build.
//
// `VITE_DEMO_ISLAND1=1 npm run build` produces a partner-facing demo where
// Islands 2-4 are padlocked on the world map and the boat cannot dock there.
// The flag is read at build time, so the default build ships the full game
// with this module inert: isDemoBuild() === false, isIslandLocked() → false.
//
// Island 1 (growing) and the recycling hub stay open; the Lighthouse is
// deliberately not locked (it showcases progress as Island 1 is played).

const LOCKED_ISLANDS = ['local', 'foodwaste', 'circular'];

export function isDemoBuild(env = import.meta.env) {
  const v = env?.VITE_DEMO_ISLAND1;
  return v === '1' || v === 'true' || v === true;
}

export function isIslandLocked(island, demo = isDemoBuild()) {
  return demo && LOCKED_ISLANDS.includes(island);
}
