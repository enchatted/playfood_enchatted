/**
 * Dev-only test mode API.
 *
 * Exposes `window.__playfood` for instant navigation, keyboard simulation,
 * and state inspection — so automated play-testing doesn't have to walk the
 * avatar across the harbor every time.
 *
 * Triple-gated for safety:
 *   1. `import.meta.env.DEV` — Vite tree-shakes this entire file in production
 *   2. `?testMode=1` URL param OR `localStorage.PLAYFOOD_TEST_MODE === '1'`
 *   3. Console warning on install, so it's never silently active
 *
 * Usage from browser console (or Puppeteer/Playwright):
 *   __playfood.startMission('local', 1)   // jump to SeasonMatcher
 *   __playfood.setLanguage('el')
 *   __playfood.walk('up', 5)
 *   __playfood.press('Enter')
 *
 * URL shortcuts (apply once on first navigation):
 *   ?testMode=1&lang=el&startMission=local:1
 */

import i18n from '../i18n/index.js';
import { MISSION_MAP } from '../overworld/islandRoomData.js';

const TEST_FLAG = 'PLAYFOOD_TEST_MODE';

function isEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.localStorage?.getItem(TEST_FLAG) === '1') return true;
  return new URLSearchParams(window.location.search).get('testMode') === '1';
}

function pressKey(key) {
  const opts = { key, code: keyCode(key), bubbles: true, cancelable: true };
  window.dispatchEvent(new KeyboardEvent('keydown', opts));
  setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', opts)), 50);
}

function keyCode(key) {
  if (key === 'ArrowUp') return 'ArrowUp';
  if (key === 'ArrowDown') return 'ArrowDown';
  if (key === 'ArrowLeft') return 'ArrowLeft';
  if (key === 'ArrowRight') return 'ArrowRight';
  if (key === 'Enter') return 'Enter';
  if (key === 'Escape') return 'Escape';
  if (key === ' ') return 'Space';
  if (key.length === 1) return 'Key' + key.toUpperCase();
  return key;
}

async function walk(dir, steps = 1) {
  const map = {
    up: 'ArrowUp', down: 'ArrowDown',
    left: 'ArrowLeft', right: 'ArrowRight',
  };
  const key = map[dir];
  if (!key) throw new Error(`walk: unknown dir "${dir}"`);
  for (let i = 0; i < steps; i++) {
    pressKey(key);
    await new Promise((r) => setTimeout(r, 350));
  }
}

/**
 * Install the test API on `window.__playfood`. Safe to call multiple times.
 * Reads from the Zustand store using its getState/setState pattern.
 *
 * @param {Object} store - the useGameStore instance (zustand store)
 */
export function installTestMode(store) {
  if (!import.meta.env.DEV) return;
  if (!isEnabled()) return;

  const api = {
    // ─── Inspection ──────────────────────────────────
    state: () => store.getState(),
    screen: () => store.getState().currentScreen,
    language: () => store.getState().language,
    setProgress: (patch) => store.setState(patch),

    // ─── Navigation (instant — skip walking) ─────────
    // Sync both the Zustand store AND react-i18next so UI strings update
    // immediately. LanguageSelector normally does this in concert; we
    // replicate it here for headless test launches.
    setLanguage: (lang) => {
      store.getState().setLanguage(lang);
      i18n.changeLanguage(lang);
    },

    goToScreen: (screen, data = {}) =>
      store.getState().navigate(screen, data),

    goToIsland: (island) =>
      store.getState().navigate('island', { island }),

    /**
     * Jump straight to a mini-game. Looks up the React component name
     * from MISSION_MAP so callers only need (island, missionId).
     */
    startMission: (island, missionId) => {
      const missions = MISSION_MAP[island];
      if (!missions) throw new Error(`startMission: unknown island "${island}"`);
      const mission = missions.find((m) => m.id === missionId);
      if (!mission) throw new Error(`startMission: no mission ${missionId} in ${island}`);
      store.getState().navigate('game', {
        island,
        mission: mission.component,
        missionId,
      });
    },

    reset: () => {
      localStorage.removeItem('playfood-storage');
      location.reload();
    },

    // ─── Keyboard simulation ─────────────────────────
    press: pressKey,
    walk,
  };

  window.__playfood = api;
  // eslint-disable-next-line no-console
  console.warn('[PLAYFOOD] Test mode ENABLED. window.__playfood is live.');
  return api;
}

/**
 * Apply one-shot URL params (?lang=el, ?startMission=local:1) on first call.
 * Runs after install so the navigation methods exist.
 *
 * Language MUST be applied (and the i18n change awaited) BEFORE the mission
 * mounts, otherwise the mission reads stale i18n.language at mount time and
 * derived state like country picks the wrong default.
 *
 * @param {Object} store - the useGameStore instance
 */
export async function applyTestUrlParams(store) {
  if (!import.meta.env.DEV) return;
  if (!isEnabled()) return;

  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang');
  const startScreen = params.get('startScreen');
  const startMission = params.get('startMission');
  const startIsland = params.get('startIsland');

  if (lang) {
    store.getState().setLanguage(lang);
    await i18n.changeLanguage(lang); // wait until react-i18next is fully on lang
  }
  if (startScreen) {
    window.__playfood?.goToScreen(startScreen);
  } else if (startIsland) {
    window.__playfood?.goToIsland(startIsland);
  } else if (startMission) {
    const [island, idStr] = startMission.split(':');
    const id = parseInt(idStr, 10);
    if (island && Number.isFinite(id)) {
      window.__playfood?.startMission(island, id);
    }
  }
}
