import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';
import { initMissionIntro } from '../games/engine/gameRoomRenderer.js';

// Compost Creator, Leftover Chef and Season Matcher: every control instruction names the
// keyboard key AND the on-screen button that does the same thing (touch controls show on
// every landscape screen, see utils/touchControls.js). A = Enter/Space, B = Q.
const locales = { el, en, nl, pt };
const get = (obj, path) => path.split('.').reduce((node, key) => node?.[key], obj);

const A_KEYS = [
  'hint.skip_ab', 'hint.resume_ab',
  'compost.pickup_prompt', 'compost.floor_pickup_prompt', 'compost.place_bin_prompt',
  'compost.chef.ask_prompt', 'compost.fact_continue_prompt',
  'leftover_chef.pickup_prompt', 'leftover_chef.add_to_pot_prompt', 'leftover_chef.cook_prompt',
  'leftover_chef.fact_continue_prompt',
  'season.cart_add', 'season.checkout_prompt',
];
const B_KEYS = [
  'compost.drop_prompt',
  'leftover_chef.drop_prompt', 'leftover_chef.undo_pot_prompt', 'leftover_chef.reserve_later',
  'missionIntro.seasonmatcher.step2',
];
const SPACE = { el: 'Space', en: 'Space', nl: 'spatie', pt: 'Espaço' };
const BUTTON = {
  el: (b) => `κουμπί ${b} στην οθόνη`,
  en: (b) => `${b} button on screen`,
  nl: (b) => `${b}-knop op het scherm`,
  pt: (b) => `botão ${b} no ecrã`,
};

describe('A/B control copy in Compost Creator, Leftover Chef and Season Matcher', () => {
  for (const [lang, locale] of Object.entries(locales)) {
    it.each(A_KEYS)(`${lang}: %s names Enter, Space and the on-screen A button`, (key) => {
      const text = get(locale, key);
      expect(text, key).toContain('Enter');
      expect(text, key).toContain(SPACE[lang]);
      expect(text, key).toContain(BUTTON[lang]('A'));
      expect(text, key).not.toMatch(/ENTER|SPACE|SPATIE|ESPAÇO/);
    });

    it.each(B_KEYS)(`${lang}: %s names Q and the on-screen B button (Latin B)`, (key) => {
      const text = get(locale, key);
      expect(text, key).toMatch(/\bQ\b/);
      expect(text, key).toContain(BUTTON[lang]('B'));
      // A standalone Greek capital Beta (U+0392) looks like the B button label but is not it.
      expect(text, key).not.toMatch(/(^|[^\p{L}])Β([^\p{L}]|$)/u);
    });

    it(`${lang}: placeholders survive`, () => {
      expect(locale.compost.pickup_prompt).toContain('{{item}}');
      expect(locale.compost.floor_pickup_prompt).toContain('{{item}}');
      expect(locale.compost.place_bin_prompt).toContain('{{bin}}');
      expect(locale.leftover_chef.pickup_prompt).toContain('{{food}}');
      expect(locale.season.checkout_prompt).toContain('{{n}}');
    });

    it(`${lang}: the shared start hint used by the other games is unchanged in meaning`, () => {
      expect(locale.hint.skip).toContain('Enter');
      expect(locale.hint.skip).not.toContain(BUTTON[lang]('A'));
    });

    // The reserve banner is a single 13px line in a 500-logical-px pill (leftoverChefRenderer
    // renderTipBanner). Measured in Chromium: el 445 · en 414 · nl 461 · pt 422 px.
    it(`${lang}: the reserve-for-later banner stays short enough for one line`, () => {
      expect(Array.from(locale.leftover_chef.reserve_later).length).toBeLessThanOrEqual(78);
    });
  }

  // All twelve games use the same start prompt.
  it.each([
    'games/local/SeasonMatcher.jsx', 'games/local/MarketTrip.jsx', 'games/local/SpotTheFake.jsx',
    'games/circular/CompostCreator.jsx', 'games/circular/CircularCity.jsx', 'games/circular/PlanetaryBoundaries.jsx',
    'games/foodwaste/LeftoverChef.jsx', 'games/foodwaste/FridgeManager.jsx', 'games/foodwaste/MealPlanner.jsx',
    'games/growing/WhereDoesItGrow.jsx', 'games/growing/GardenPlanner.jsx', 'games/growing/SoilDoctor.jsx',
  ])('%s starts with the A/B start hint', (file) => {
    const src = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
    expect(src).toMatch(/ctaKey: 'hint\.skip_ab'/);
    expect(src).not.toMatch(/ctaKey: 'hint\.skip'[,\s]/);
  });

  it('a reopened instructions card says continue, the first one says start', () => {
    const t = (k) => k;
    const content = { titleKey: 'x', stepKeys: [], goalKey: 'g', ctaKey: 'hint.skip_ab' };
    const state = {};
    initMissionIntro(state, t, content);
    initMissionIntro(state, t, content); // StrictMode double setup: card still open
    expect(state.missionIntro.cta).toBe('hint.skip_ab');
    state.showMissionIntro = false; // child dismissed it
    initMissionIntro(state, t, content); // "Guide" button
    expect(state.missionIntro.cta).toBe('hint.resume_ab');
  });
});
