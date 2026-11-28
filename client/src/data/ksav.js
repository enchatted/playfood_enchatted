// KSAV learning outcomes per island + per-game learning goals.
//
// Source: partner-authored, kept VERBATIM from the project's "Learning Outcomes
// Framework (KSAV)" and the four island sections of its specification.
// Keep these English strings unchanged as the canonical partner source. Approved
// interface translations live in the locale files and fall back to this registry.
//
// K = Knowledge (what learners should know and understand)
// S = Skills (what learners should be able to do or apply)
// A = Attitudes (mindsets and perspectives learners are encouraged to develop)
// V = Values (principles learners are expected to appreciate and internalize)
//
// KSAV exists per ISLAND; every minigame contributes to ≥1 of its island's
// KSAV goals. Per game the partners give a one-line prose
// "Learning Goals Summary" — kept verbatim in GAME_LEARNING_GOALS below.

export const ISLAND_KSAV = {
  growing: {
    knowledge: ['Understand growing our own food'],
    skills: ['Grow or care for food in simple ways'],
    attitudes: ['Patience and care for food production and nature'],
    values: ['Valuing food as something connected to soil, season, and effort'],
  },
  local: {
    knowledge: ['Understand local and seasonal eating'],
    skills: ['Decode aggressive commercial messages (core project promise)'],
    attitudes: ['Become more environmentally conscious (food travel, packaging, agriculture)'],
    values: ['Care for the environment in daily choices'],
  },
  foodwaste: {
    // Preserve the registered learning-objective wording until an approved revision.
    knowledge: ['Understand food waste deduction'],
    skills: ['Reduce food waste through planning, storage, portioning, or reuse'],
    attitudes: ['Become more environmentally conscious in everyday food choices'],
    values: ['Respect for food as something not to waste'],
  },
  circular: {
    knowledge: [
      'Understand the environmental impact of everyday food choices',
      'Understand the negative effects of unsustainable food consumption',
    ],
    // No skill statement is registered for this island.
    skills: [],
    attitudes: ['Become more environmentally conscious'],
    values: ['Responsibility in consumption/responsible citizenship'],
  },
};

// Per-game "Learning Goals Summary" — verbatim partner prose, keyed by the
// mission component name used in MISSION_MAP / GameScreen.
export const GAME_LEARNING_GOALS = {
  WhereDoesItGrow:
    'Recognize fundamental food origins and understand how individual agricultural plant species develop biologically.',
  GardenPlanner:
    'Observe seasonal impacts on crop lifecycles, manage a multi season virtual plot, and assume responsibility for plant cultivation.',
  SoilDoctor:
    'Diagnose soil and plant health deficiencies while identifying natural, ecological remedies such as composting, mulch, or cover crops.',
  SeasonMatcher:
    'Distinguish local, in season produce from out of season imported items based on a specific geographic country and time of year.',
  MarketTrip:
    'Balance realistic financial trade offs and budgetary constraints against sustainable, local purchasing decisions.',
  SpotTheFake:
    'Analyze retail food packaging, decipher product labels carefully, identify unregulated health claims, and uncover greenwashing marketing tactics.',
  FridgeManager:
    'Understand basic methods to secure food items before they spoil and recognise how specific storage decisions directly extend product shelf life.',
  MealPlanner:
    'Plan three balanced daily meals while strategically utilising existing household inventory before obtaining new ingredients.',
  LeftoverChef:
    'Develop culinary resourcefulness and creative problem-solving by transforming assorted leftover ingredients into safe, high-quality household dishes.',
  CompostCreator:
    'Categorize household waste items correctly and distinguish compostable organic matter from hazardous materials.',
  CircularCity:
    'Trace how currency and material resources recirculate locally through repair networks, composting facilities, and neighborhood loops.',
  PlanetaryBoundaries:
    'Assess systemic environmental trade offs and discover how collective resource consumption interacts with absolute planetary limits.',
};
