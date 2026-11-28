// lighthouseBookshelf.js — pure data helper for the sources bookshelf.
// Builds per-island "book spine" arrays from MISSION_MAP + MISSION_SOURCES + SOURCES.
// No rendering, no React — fully unit-testable.
//
// Guarantee: title / publisher / url come VERBATIM from SOURCES[id]; nothing is
// invented here. The `pending` flag is set for the 3 provisional EPA sources that
// are awaiting partner sign-off (US EPA vs an EU authority).

import { MISSION_MAP } from './islandRoomData.js';
import { MISSION_SOURCES, SOURCES } from '../data/sources.js';

export const ISLAND_SLUGS = ['growing', 'local', 'foodwaste', 'circular'];

// These three EPA source ids are provisional — included but flagged (pending:true)
// so the bookshelf shows them with a small «!» badge awaiting partner confirmation.
const PROVISIONAL = new Set([
  'composting-home',
  'recycle-common-recyclables',
  'used-household-batteries',
]);

/**
 * buildBookshelf(completedMissions?) → { growing:[…], local:[…], foodwaste:[…], circular:[…] }
 *
 * Per-island spine objects:
 *   { id, title, publisher, url, unlocked, pending }
 *
 * A spine is unlocked when at least ONE game that cites it has been completed
 * (i.e. its mission id appears in completedMissions[island]).
 * Duplicate source ids within a shelf are merged (one spine, unlocked if ANY citing
 * game is done). canonical order follows MISSION_MAP mission order.
 *
 * @param {Object} completedMissions — { growing:[1,2,…], local:[…], … } from store
 */
export function buildBookshelf(completedMissions = {}) {
  const shelves = {};
  for (const island of ISLAND_SLUGS) {
    const missions = MISSION_MAP[island] || [];
    const done = new Set(completedMissions[island] || []);
    const spines = [];

    for (const m of missions) {
      const unlocked = done.has(m.id);
      const sourceIds = MISSION_SOURCES[m.component] || [];
      for (const sid of sourceIds) {
        const existing = spines.find((s) => s.id === sid);
        if (existing) {
          // Merge: if ANY mission citing this source is done, mark it unlocked.
          if (unlocked) existing.unlocked = true;
          continue;
        }
        const src = SOURCES[sid];
        if (!src) continue; // dangling key — skip silently
        spines.push({
          id: sid,
          title: src.title,
          publisher: src.publisher,
          url: src.url || null,
          unlocked,
          pending: PROVISIONAL.has(sid),
        });
      }
    }

    shelves[island] = spines;
  }
  return shelves;
}

/**
 * unlockedSpines(shelves) → flat array of unlocked spines in canonical order,
 * each augmented with { island } so the renderer/panel knows which shelf it came from.
 * Used for Left/Right cycling in the open-book panel.
 */
export function unlockedSpines(shelves) {
  return ISLAND_SLUGS.flatMap((island) =>
    (shelves[island] || [])
      .filter((s) => s.unlocked)
      .map((s) => ({ ...s, island }))
  );
}
