import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { HERO_IDS } from '../overworld/heroes.js';
import { track } from '../utils/analytics.js';
import {
  getBoatCapacityForTier,
  getBoatUpgrade,
  normalizeBoatTier,
} from '../data/boatUpgrades.js';

/**
 * Zustand Store — GameStore
 *
 * TypeScript interface (for reference):
 *
 * interface GameStore {
 *   language: 'en' | 'nl' | 'el' | 'pt';
 *   setLanguage: (lang: string) => void;
 *   completedMissions: { growing: number[]; local: number[]; foodwaste: number[]; circular: number[] };
 *   addCompletedMission: (island: string, missionId: number) => void;
 *   getIslandCompleted: (island: string) => number;
 *   getTotalCompleted: () => number;
 *   points: number;
 *   addPoints: (amount: number) => void;
 *   redeemedCodes: string[];
 *   redeemCode: (code: string) => { success: boolean };
 *   restoreProgress: (data: object) => void;
 *   resetProgress: () => void;
 * }
 */

const INITIAL_MISSIONS = {
  growing: [],
  local: [],
  foodwaste: [],
  circular: [],
};

const useGameStore = create(
  persist(
    (set, get) => ({
      // Restore full progress from a decoded client Play Code
      restoreProgress: (data) =>
        set({
          language: data.language || 'en',
          heroId: HERO_IDS.includes(data.heroId) ? data.heroId : null,
          completedMissions: data.completedMissions || { ...INITIAL_MISSIONS },
          boatTier: normalizeBoatTier(data.boatTier, data.completedMissions),
          // A Play Code restores progression, not an unfinished local sailing trip.
          trashCargo: 0,
          points: data.points || 0,
          redeemedCodes: data.redeemedCodes || [],
          ceremoniesSeen: data.ceremoniesSeen || [],
          reflectionsSeen: data.reflectionsSeen || [],
          whaleSpotted: data.whaleSpotted || false,
          recycleTrips: data.recycleTrips || 0,
          totalRecycled: data.totalRecycled || 0,
          lighthouseGoldSeen: data.lighthouseGoldSeen || [],
          gameStars: data.gameStars || {},
          finaleClaimed: data.finaleClaimed || false,
          // A Play Code represents game progress, not device UI history. Show the
          // Lighthouse guide once on the device where the code is restored.
          lighthouseOnboardingSeen: false,
        }),

      // Language
      language: 'en',
      setLanguage: (lang) => set({ language: lang }),

      // Hero select — starts null on a fresh run; the player
      // assigns it on the AvatarSelector ceremony screen (LanguageSelector →
      // 'avatar' → 'menu'). No random default — that silent assignment was the
      // root cause of the «too boyish» partner feedback. Persisted so the
      // choice survives reloads; getHero() falls back to HEROES[0] if ever read
      // while still null.
      heroId: null,
      setHero: (id) => {
        if (!HERO_IDS.includes(id)) return;
        set({ heroId: id });
        // Only a real choice counts; a page load or a Play Code restore must not re-send it.
        track('hero_chosen', { hero: id });
      },

      // Navigation (not persisted — handled by partialize)
      currentScreen: 'lang',
      navigationData: {},
      navigate: (screen, data = {}) =>
        set({ currentScreen: screen, navigationData: data }),

      // Boat position — survives screen transitions, resets on page refresh
      boatPosition: null,
      setBoatPosition: (pos) => set({ boatPosition: pos }),

      // Whale sighting achievement — one-time, persisted
      whaleSpotted: false,
      setWhaleSpotted: () => set({ whaleSpotted: true }),

      // Lighthouse gold ceremonies already shown (one-time per island), persisted
      lighthouseGoldSeen: [],
      markGoldSeen: (slug) => set((s) =>
        s.lighthouseGoldSeen.includes(slug) ? {} : { lighthouseGoldSeen: [...s.lighthouseGoldSeen, slug] }),

      // One-time Lighthouse orientation. Persisted locally, deliberately not
      // encoded in the Play Code because it is UI history rather than progress.
      lighthouseOnboardingSeen: false,
      markLighthouseOnboardingSeen: () => set({ lighthouseOnboardingSeen: true }),

      // Best first-try ⭐ per game (missionKey → 0–3), persisted. Phase 2 surfaces
      // this in the lighthouse Trophy Hall. Only ever climbs (keeps the max).
      gameStars: {},
      recordStars: (missionKey, stars) =>
        set((s) => {
          const best = Math.max(s.gameStars[missionKey] || 0, stars);
          if (best === (s.gameStars[missionKey] || 0)) return {};
          return { gameStars: { ...s.gameStars, [missionKey]: best } };
        }),

      // ── Grand Finale (12/12) ───────────────────────────────
      // The finale ceremony + certificate are gated on all 12 missions done AND
      // finaleClaimed === false, so the celebration plays once. Persisted.
      finaleClaimed: false,
      claimFinale: () => set({ finaleClaimed: true }),

      // Transient cinematic flag (NOT persisted): set when the player claims the
      // certificate inside the Lighthouse so the World Map plays the island-merge
      // animation BEFORE opening the certificate. Cleared once the merge finishes
      // (see finaleMerge.js + WorldMap). Never gates the one-shot finale itself —
      // that's finaleClaimed — so a refresh mid-merge just lands on a normal map.
      finaleMerging: false,
      startFinaleMerge: () => set({ finaleMerging: true }),
      endFinaleMerge: () => set({ finaleMerging: false }),

      // DEV-only review hook (Shift+F on the World Map): jump straight to the 12/12
      // finale state. Marks every mission complete, awards full stars, pre-clears the
      // per-island gold ceremonies (so the GRAND finale shows directly, not 4 island
      // ones first), and re-arms the finale (finaleClaimed:false) so it can be replayed.
      debugCompleteAll: () =>
        set({
          completedMissions: { growing: [1, 2, 3], local: [1, 2, 3], foodwaste: [1, 2, 3], circular: [1, 2, 3] },
          gameStars: {
            'growing:WhereDoesItGrow': 3, 'growing:GardenPlanner': 3, 'growing:SoilDoctor': 3,
            'local:SeasonMatcher': 3, 'local:MarketTrip': 3, 'local:SpotTheFake': 3,
            'foodwaste:FridgeManager': 3, 'foodwaste:MealPlanner': 3, 'foodwaste:LeftoverChef': 3,
            'circular:CompostCreator': 3, 'circular:CircularCity': 3, 'circular:PlanetaryBoundaries': 3,
          },
          lighthouseGoldSeen: ['growing', 'local', 'foodwaste', 'circular'],
          boatTier: 3,
          finaleClaimed: false,
          finaleMerging: false,
        }),

      // Player progress
      completedMissions: { ...INITIAL_MISSIONS },

      addCompletedMission: (island, missionId) =>
        set((state) => {
          const current = state.completedMissions[island] || [];
          if (current.includes(missionId)) return state;
          const updated = {
            ...state.completedMissions,
            [island]: [...current, missionId],
          };
          // Full island bonus (3 missions per island in the 4×3 structure)
          const bonus = updated[island].length === 3 ? 100 : 0;
          return {
            completedMissions: updated,
            points: state.points + bonus,
          };
        }),

      // Island ceremony — fires once per island (3/3), then never again.
      // Progress, not identity: cleared by resetProgress (unlike heroId).
      ceremoniesSeen: [],
      markCeremonySeen: (island) =>
        set((state) =>
          state.ceremoniesSeen.includes(island)
            ? state
            : { ceremoniesSeen: [...state.ceremoniesSeen, island] }
        ),

      // Reflection prompt — fires once per
      // island between Practice→Challenge (2/3 done), then never again.
      // Progress, not identity: cleared by resetProgress.
      reflectionsSeen: [],
      markReflectionSeen: (island) =>
        set((state) =>
          state.reflectionsSeen.includes(island)
            ? state
            : { reflectionsSeen: [...state.reflectionsSeen, island] }
        ),

      getIslandCompleted: (island) => {
        const state = get();
        return (state.completedMissions[island] || []).length;
      },

      getTotalCompleted: () => {
        const state = get();
        return Object.values(state.completedMissions).reduce(
          (sum, arr) => sum + arr.length,
          0
        );
      },

      // Points
      points: 0,
      addPoints: (amount) =>
        set((state) => ({ points: state.points + amount })),

      // Boat upgrades
      boatTier: 0,
      purchaseBoatTier: (targetTier) => {
        let result = { success: false, reason: 'invalid_tier' };
        set((state) => {
          const target = getBoatUpgrade(targetTier);
          if (!target) return {};
          if (target.tier <= state.boatTier) {
            result = { success: false, reason: 'current_or_lower' };
            return {};
          }
          if (target.tier !== state.boatTier + 1) {
            result = {
              success: false,
              reason: 'prerequisite_required',
              requiredTier: target.tier - 1,
            };
            return {};
          }
          if (state.points < target.price) {
            result = { success: false, reason: 'insufficient_points' };
            return {};
          }
          result = {
            success: true,
            tier: target.tier,
            capacity: target.capacity,
            price: target.price,
          };
          return {
            points: state.points - target.price,
            boatTier: target.tier,
          };
        });
        return result;
      },

      // Unrecycled litter belongs to the boat, not to the temporary World Map
      // canvas. Keeping it here lets an island visit or reload resume the trip.
      trashCargo: 0,
      setTrashCargo: (count) => set((state) => {
        const capacity = getBoatCapacityForTier(state.boatTier);
        const normalized = Math.max(0, Math.min(capacity, Math.floor(Number(count) || 0)));
        return { trashCargo: normalized };
      }),

      // Recycling stats
      recycleTrips: 0,
      totalRecycled: 0,

      getBoatCapacity: () => getBoatCapacityForTier(get().boatTier),

      recordRecycleTrip: (itemCount) =>
        set((state) => ({
          recycleTrips: state.recycleTrips + 1,
          totalRecycled: state.totalRecycled + itemCount,
        })),

      // Phygital codes
      redeemedCodes: [],
      redeemCode: async (code) => {
        if (typeof code !== 'string' || !code.trim()) return { success: false, reason: 'invalid_code' };
        const before = get().redeemedCodes;
        try {
          const response = await fetch('/api/phygital/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code.trim(), redeemedIds: before, language: get().language }),
            signal: AbortSignal.timeout(10000),
          });
          const reward = await response.json();
          if (!response.ok || reward.success !== true) {
            const reason = ['invalid_code', 'already_redeemed', 'limit_reached'].includes(reward.reason) ? reward.reason : 'unavailable';
            return { success: false, reason };
          }
          if (typeof reward.id !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(reward.id)
            || !Number.isInteger(reward.points) || reward.points < 0 || reward.points > 1000) {
            return { success: false, reason: 'unavailable' };
          }
          const state = get();
          if (state.redeemedCodes.includes(reward.id)) return { success: false, reason: 'already_redeemed' };
          // Do not apply a late response to another restored/reset progress.
          if (state.redeemedCodes !== before) return { success: false, reason: 'unavailable' };
          if (before.length >= 100 || state.points + reward.points > 65535) return { success: false, reason: 'limit_reached' };
          set({ redeemedCodes: [...before, reward.id], points: state.points + reward.points });
          track('phygital_redeem', { activity: reward.id }); // The panel counts offline activities
          return { success: true, points: reward.points,
            description: typeof reward.description === 'string' ? reward.description.slice(0, 240) : '' };
        } catch {
          return { success: false, reason: 'unavailable' };
        }
      },

      // Reset
      resetProgress: () =>
        set({
          completedMissions: { ...INITIAL_MISSIONS },
          boatTier: 0,
          trashCargo: 0,
          points: 0,
          redeemedCodes: [],
          ceremoniesSeen: [],
          reflectionsSeen: [],
          whaleSpotted: false,
          recycleTrips: 0,
          totalRecycled: 0,
          lighthouseGoldSeen: [],
          lighthouseOnboardingSeen: false,
          gameStars: {},
          finaleClaimed: false,
          finaleMerging: false,
        }),
    }),
    {
      name: 'playfood-storage',
      partialize: (state) => ({
        language: state.language,
        heroId: state.heroId,
        completedMissions: state.completedMissions,
        boatTier: state.boatTier,
        trashCargo: state.trashCargo,
        points: state.points,
        redeemedCodes: state.redeemedCodes,
        ceremoniesSeen: state.ceremoniesSeen,
        reflectionsSeen: state.reflectionsSeen,
        whaleSpotted: state.whaleSpotted,
        recycleTrips: state.recycleTrips,
        totalRecycled: state.totalRecycled,
        lighthouseGoldSeen: state.lighthouseGoldSeen,
        lighthouseOnboardingSeen: state.lighthouseOnboardingSeen,
        gameStars: state.gameStars,
        finaleClaimed: state.finaleClaimed,
      }),
      version: 1,
      migrate: (persistedState) => ({
        ...persistedState,
        boatTier: normalizeBoatTier(
          persistedState?.boatTier,
          persistedState?.completedMissions,
        ),
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...persistedState,
        boatTier: normalizeBoatTier(
          persistedState?.boatTier,
          persistedState?.completedMissions,
        ),
      }),
    }
  )
);

export default useGameStore;
