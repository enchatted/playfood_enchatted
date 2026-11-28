// Verified educational sources (Content Authenticity Mandate).
//
// Every in-game fact must come VERBATIM from a verified source and the source
// must be VISIBLE to the player. This registry is the single source of truth:
// games read facts from these references, and ResultScreen shows the citations.
// NEVER add an unsupported fact or fabricate a URL — leave `url: null` if the
// exact link is not known/verified yet (the panel then shows publisher only).
//
// Citation fields (title / publisher / url) are deliberately language-neutral:
// they are factual references, so translating them could distort the source.
// Only the section heading (result.sources_title) is localised via i18n.

export const SOURCES = {
  // ── Island 1 · Growing Our Own Food ─────────────────────────────
  // 4 PDFs hosted on rheaeu.com — full links, verified live
  // 2026-06-09 (HTTP 200, application/pdf).
  // lisabronner ✅ full.
  'heirloom-seeds': {
    title: 'Heirloom Seeds',
    publisher: 'rheaeu.com (PDF)',
    url: 'https://www.rheaeu.com/_files/ugd/f924f7_8de1fb960de549c7b74f66185d00ab90.pdf',
  },
  'food-diversity': {
    title: 'Food Diversity',
    publisher: 'rheaeu.com (PDF)',
    url: 'https://www.rheaeu.com/_files/ugd/f924f7_58ce6d16f41b456d9727360b620c980d.pdf',
  },
  'soil-degradation': {
    title: 'Soil Degradation',
    publisher: 'rheaeu.com (PDF)',
    url: 'https://www.rheaeu.com/_files/ugd/f924f7_2341285132f84008b31eb86722150508.pdf',
  },
  'regenerative-agriculture': {
    title: 'Regenerative Agriculture',
    publisher: 'rheaeu.com (PDF)',
    url: 'https://www.rheaeu.com/_files/ugd/f924f7_221a18881b3f4dfeb98213091b71ebe6.pdf',
  },
  'grow-regeneratively-home': {
    title: 'Gardening Regeneratively at Home',
    publisher: 'Lisa Bronner',
    url: 'https://lisabronner.com/gardening-regeneratively-at-home/',
  },
  'three-sisters-nps': {
    title: 'The Three Sisters',
    publisher: 'U.S. National Park Service, Tonto National Monument',
    url: 'https://www.nps.gov/tont/learn/nature/the-three-sisters.htm',
  },

  // ── Island 2 · Local and Seasonal Eating ────────────────────────
  // S1 EUFIC seasonal ✅ full dataset extracted 2026-06-12: 4 countries
  // × 12 months verbatim in data/euficSeasonal.js.
  // S3 Rainforest greenwashing ✅ full access. S4 food labels: the foodeducators
  // lesson is login-walled → facts came VERBATIM from EUFIC (its scientific
  // base); cited honestly as EUFIC-backed, pending partner verification of the file.
  'eufic-seasonal': {
    title: 'Explore Seasonal Fruit and Vegetables in Europe',
    publisher: 'EUFIC (European Food Information Council)',
    url: 'https://www.eufic.org/en/explore-seasonal-fruit-and-vegetables-in-europe',
  },
  // S2: the lesson PDF is login-walled; the facts we use came VERBATIM
  // from public companion articles of the SAME programme (EIT Food / Kitchen
  // Adventure) — cited honestly at programme level, pending partner verification.
  'local-seasonal-food': {
    title: 'Local and Seasonal Food',
    publisher: 'foodeducators.eu (EIT Food)',
    url: 'https://www.foodeducators.eu/resources/resource/local-and-seasonal-food',
  },
  'eu-local-food-systems': {
    title: 'Report on Local Farming and Direct Sales',
    publisher: 'European Commission (EUR-Lex)',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A52013DC0866',
  },
  'eufic-seasonality-environment': {
    title: 'Are Seasonal Fruit and Vegetables Better for the Environment?',
    publisher: 'EUFIC (European Food Information Council)',
    url: 'https://www.eufic.org/en/healthy-living/article/are-seasonal-fruit-and-vegetables-better-for-the-environment',
  },
  'greenwashing-red-flags': {
    title: 'How to Spot Greenwashing: Red Flags',
    publisher: 'Rainforest Alliance',
    url: 'https://www.rainforest-alliance.org/everyday-actions/how-to-spot-greenwashing-red-flags/',
  },
  'food-labels': {
    title: 'Understanding Food Labels',
    publisher: 'foodeducators.eu (EUFIC-backed)',
    url: 'https://www.foodeducators.eu/resources/resource/understanding-food-labels-ESL',
  },

  // ── Island 3 · Food Waste Reduction ─────────────────────────────
  // EUFIC storage article = the exact source the partners named (Island 3
  // resource #2); fetched & verified live 2026-06-15 (HTTP 200, last-updated
  // 19 Nov 2025). The per-food shelf-life tables (Fig.1–5) are IMAGE-locked →
  // only verbatim TEXT is cited. foodeducators ESL (resource #1) is likely
  // login-walled (like S2/S4) → the EUFIC article is the spine.
  'food-storage-fridge-freezer-cupboard': {
    title: 'How to Properly Store Food in the Fridge, Freezer and Cupboard',
    publisher: 'EUFIC (European Food Information Council)',
    url: 'https://www.eufic.org/en/food-safety/article/how-to-properly-store-food-in-the-fridge-freezer-and-cupboard',
  },
  'food-waste-food-loss': {
    title: 'Food Waste and Food Loss (ESL)',
    publisher: 'foodeducators.eu',
    url: 'https://www.foodeducators.eu/resources/resource/ESL-food-waste-and-food-loss',
  },

  // ── Island 4 · Climate Change and Circular Economy ──────────────
  // S3 EU 10R ✅ (R NAMES are verbatim text; per-R DEFINITIONS are locked in an image →
  // not used; each R is taught via concrete action + verbatim S4/S5 text). S4 Amsterdam ✅.
  // S5 foodeducators login-walled → only the PUBLIC blurb quote is used; companion
  // EMF facts pending partner approval.
  'circular-economy-rs': {
    title: 'The Rs of the Circular Economy',
    publisher: 'European Commission (green-forum)',
    url: 'https://green-forum.ec.europa.eu/news/news-article-2024-11-28_en',
  },
  'circular-city-amsterdam': {
    title: 'Shaping a Sharing Economy: Amsterdam',
    publisher: 'Ellen MacArthur Foundation',
    url: 'https://www.ellenmacarthurfoundation.org/circular-examples/shaping-a-sharing-economy-amsterdam',
  },
  'linear-circular-food': {
    title: 'From Linear to Circular Food Systems',
    publisher: 'foodeducators.eu',
    url: 'https://www.foodeducators.eu/resources/resource/from-linear-to-circular-food-systems',
  },
  'planetary-boundaries': {
    title: 'Planetary Boundaries',
    publisher: 'Stockholm Resilience Centre',
    url: 'https://www.stockholmresilience.org/research/planetary-boundaries.html',
  },

  // ── Island 4 · Compost Creator (Hook) — EU/national authority, Greek only ────
  // The Greek Ministry (YPEN) Home Composting Manual. It is published in Greek only, so it can
  // supply GREEK verbatim and nothing else; it backs the stale-bread item from its own list of
  // nitrogen-rich "greens". It carried ten English sentences until 2026-08-06, an attribution
  // that did not survive checking.
  'ypen-home-composting': {
    title: 'Home Composting Manual',
    publisher: 'Hellenic Ministry of Environment and Energy (YPEN)',
    url: 'https://ypen.gov.gr/wp-content/uploads/2021/09/Manual-for-home-composting-leaflet-with-rules_EL_combined.pdf',
  },

  // ── Island 4 · Compost Creator (Hook) — the EN verbatim spine ───
  // The only registered sources that cover all five bins in English. Every passage the game
  // quotes from them was re-verified against the live pages on 2026-08-06. Whether a US
  // authority is acceptable here instead of an EU one is still a partner decision.
  'composting-home': {
    title: 'Composting At Home',
    publisher: 'US EPA',
    url: 'https://www.epa.gov/recycle/composting-home',
  },
  'recycle-common-recyclables': {
    title: 'How Do I Recycle Common Recyclables',
    publisher: 'US EPA',
    url: 'https://www.epa.gov/recycle/how-do-i-recycle-common-recyclables',
  },
  'used-household-batteries': {
    title: 'Used Household Batteries',
    publisher: 'US EPA',
    url: 'https://www.epa.gov/recycle/used-household-batteries',
  },
  // The battery card says batteries NEVER go in the bin. The EU Batteries
  // Regulation states it for every battery (Article 64); the EPA page only says «certain batteries».
  'eu-batteries-regulation': {
    title: 'Regulation (EU) 2023/1542 on batteries and waste batteries, Article 64',
    publisher: 'European Union (EUR-Lex)',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1542',
  },

  // The carton card cites Fost Plus for material composition. The introduction cites national collection schemes for local sorting rules.
  'fostplus-drinkcartons': {
    title: 'Recyclageproces van drankkartons',
    publisher: 'Fost Plus (Belgium)',
    url: 'https://www.betersorteren.be/recycleren/recyclageproces-van-drankkartons',
  },
  'fostplus-pmd': {
    title: 'Zo sorteer je correct PMD',
    publisher: 'Fost Plus (Belgium)',
    url: 'https://www.betersorteren.be/sorteren/zo-sorteer-je-correct-pmd',
  },
  'pontoverde-pacotes': {
    title: 'Amarelo ou Azul. Qual o ecoponto certo dos pacotes de bebida?',
    publisher: 'Sociedade Ponto Verde (Portugal)',
    url: 'https://www.pontoverde.pt/recicla/amarelo-ou-azul-qual-o-ecoponto-certo-dos-pacotes-de-bebida/',
  },
  'milieucentraal-drinkpakken': {
    title: 'Drinkpakken',
    publisher: 'Milieu Centraal (Netherlands)',
    url: 'https://www.milieucentraal.nl/minder-afval/afval-scheiden/drinkpakken/',
  },
  'eeaa-polites': {
    title: 'Πολίτες',
    publisher: 'Ελληνική Εταιρεία Αξιοποίησης Ανακύκλωσης (ΕΕΑΑ)',
    url: 'https://www.herrco.gr/polites/',
  },
};

// Which verified sources back each mini-game, keyed by component id (`mission`).
// Phase 3/4 extend this as each game is built; only the 3 growing games are
// seeded now (their facts are already extracted verbatim).
export const MISSION_SOURCES = {
  WhereDoesItGrow: ['heirloom-seeds', 'food-diversity'],
  GardenPlanner: ['regenerative-agriculture', 'grow-regeneratively-home', 'heirloom-seeds', 'three-sisters-nps'],
  SoilDoctor: ['soil-degradation', 'regenerative-agriculture', 'grow-regeneratively-home'],
  SeasonMatcher: ['eufic-seasonal', 'local-seasonal-food'],
  MarketTrip: ['local-seasonal-food', 'eu-local-food-systems', 'eufic-seasonality-environment'],
  SpotTheFake: ['greenwashing-red-flags', 'food-labels'],
  FridgeManager: ['food-storage-fridge-freezer-cupboard', 'food-waste-food-loss', 'composting-home'], // EPA: day-old rice card
  // composting-home joined 2026-08-06: the compost hub's reveal used to quote Amsterdam's three
  // programme areas, a bare noun list that taught nothing about composting.
  CircularCity: ['circular-economy-rs', 'circular-city-amsterdam', 'linear-circular-food', 'composting-home'],
  PlanetaryBoundaries: ['planetary-boundaries', 'circular-city-amsterdam'],
  // The three EPA pages carry the per-item verbatim; YPEN backs the stale-bread item in Greek.
  // Drink cartons (01/10): Fost Plus backs the carton card; the four collection schemes back the
  // intro's «one bin may collect several groups together».
  CompostCreator: ['composting-home', 'recycle-common-recyclables', 'used-household-batteries', 'eu-batteries-regulation', 'ypen-home-composting',
    'fostplus-drinkcartons', 'eeaa-polites', 'pontoverde-pacotes', 'fostplus-pmd', 'milieucentraal-drinkpakken'],
  // Island 3 Practice/Challenge. LeftoverChef food-safety = EUFIC (🟢, content-checked).
  // MealPlanner waste facts pending; listed so the source panel is ready.
  LeftoverChef: ['food-storage-fridge-freezer-cupboard', 'food-waste-food-loss'],
  MealPlanner: ['food-waste-food-loss'],
};

// Resolve a mission's source keys to full citation objects.
// Returns [] for unknown missions; silently skips any dangling key.
export function getMissionSources(mission) {
  const keys = MISSION_SOURCES[mission] || [];
  return keys
    .map((key) => (SOURCES[key] ? { id: key, ...SOURCES[key] } : null))
    .filter(Boolean);
}
