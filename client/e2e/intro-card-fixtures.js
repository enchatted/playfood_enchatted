import fs from 'node:fs';
import { GROWING_REVEALS, SOIL_REVEALS } from '../src/data/growing.js';
import { PRODUCT_REVEALS } from '../src/data/local.js';
import { GARDEN_FACT_TEXTS } from '../src/data/gardenData.js';
import { FRIDGE_INTRO_FACT } from '../src/data/fridgeData.js';
import { LEFTOVER_INTRO_FACT } from '../src/data/leftoverChef.js';
import { WASTE_FACTS } from '../src/data/foodwaste.js';
import { MARKET_INTRO_FACT } from '../src/data/marketTripData.js';
import { COMPOST_INTRO_FACT, COMPOST_PREVENTION_FACT } from '../src/data/compostItems.js';
import { CIRCULAR_REVEALS, PB_REVEALS } from '../src/data/circular.js';

export const INTRO_MISSIONS = [
  ['growing', 1, 'wheredoesitgrow', 'WhereDoesItGrow', 'wheredoesitgrow.facts.nine-species', GROWING_REVEALS.find(r => r.trigger?.intro)],
  ['growing', 2, 'gardenplanner', 'GardenPlanner', 'garden.facts.heirloom', { plain: GARDEN_FACT_TEXTS.heirloom, sourceId: 'heirloom-seeds' }],
  ['growing', 3, 'soildoctor', 'SoilDoctor', 'soildoctor.facts.intro', SOIL_REVEALS.intro],
  ['local', 1, 'seasonmatcher', 'SeasonMatcher', 'missionIntro.seasonmatcher.fact', { sourceId: 'eufic-seasonal' }],
  ['local', 2, 'markettrip', 'MarketTrip', 'market.facts.localDef', MARKET_INTRO_FACT],
  ['local', 3, 'spotthefake', 'SpotTheFake', 'spotthefake.facts.intro', PRODUCT_REVEALS.intro],
  ['foodwaste', 1, 'fridgemanager', 'FridgeManager', 'fridge.facts.freezer', FRIDGE_INTRO_FACT],
  ['foodwaste', 2, 'mealplanner', 'MealPlanner', `meal_planner.facts.${WASTE_FACTS[0].id}`, WASTE_FACTS[0]],
  ['foodwaste', 3, 'leftoverchef', 'LeftoverChef', 'leftover_chef.facts.leftovers_days', LEFTOVER_INTRO_FACT],
  ['circular', 1, 'compostcreator', 'CompostCreator', 'compost.facts.intro', COMPOST_INTRO_FACT],
  ['circular', 2, 'circularcity', 'CircularCity', 'circularcity.facts.intro', CIRCULAR_REVEALS.intro],
  ['circular', 3, 'planetaryboundaries', 'PlanetaryBoundaries', 'planetary.facts.intro', PB_REVEALS.intro],
];

export function introFixture(mission, language, { reopened = false } = {}) {
  const locale = JSON.parse(fs.readFileSync(new URL(`../src/i18n/locales/${language}.json`, import.meta.url)));
  const get = (key, fallback) => key.split('.').reduce((value, part) => value?.[part], locale) ?? fallback ?? key;
  const [, , key, , factKey, fact] = mission;
  const base = `missionIntro.${key}`;
  const garden = key === 'gardenplanner';
  const sourceLabel = get('result.source_link');
  const intro = {
    title: get(garden ? 'garden.tutorial_title' : `${base}.title`),
    // MarketTrip.jsx MISSION_INTRO shows the transport explanation as its 3rd step.
    steps: key === 'markettrip'
      ? [get(`${base}.step1`), get(`${base}.step2`), get('market.transport_explanation'), get(`${base}.step3`)]
      // Season Matcher uses a different introduction. The other games explain stars in the fourth step.
      : [1, 2, 3, ...(key === 'seasonmatcher' ? [] : [4])].map(index => get(`${base}.step${index}`)),
    goal: get(garden ? 'garden.tut_goal' : `${base}.goal`),
    // Check the start prompt and the separate prompt for continuing after reopening the guide.
    cta: get(reopened ? 'hint.resume_ab' : 'hint.skip_ab'),
    sourceLabel,
    introFact: { ...fact, quote: get(factKey, fact.plain), paraphrase: !garden },
  };
  if (key === 'compostcreator') {
    intro.preFact = { ...COMPOST_PREVENTION_FACT, quote: get('compost.facts.prevention', COMPOST_PREVENTION_FACT.plain), paraphrase: true, key: 'R', label: get('compost.intro_source_prevention') };
    intro.factLabel = get('compost.intro_source_definition');
  }
  return intro;
}
