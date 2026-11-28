/**
 * Market Trip — data module (seasonal market)
 *
 * SOURCES (every fact is verbatim and cites a registered source):
 *   S2 «Local and Seasonal Food» (public FoodEducators lesson framing) —
 *   registry key 'local-seasonal-food'. It backs the local-farmer, freshness
 *   and global-trade balance messages.
 *   European Commission report COM(2013) 866 — registry key
 *   'eu-local-food-systems'. It explicitly says there is no uniform distance
 *   definition for a local area.
 *   EUFIC «Are seasonal fruit and vegetables better for the environment?» —
 *   registry key 'eufic-seasonality-environment'. It backs the balanced facts
 *   about imports, production methods and air freight.
 *   EUFIC seasonal dataset ('eufic-seasonal', ./euficSeasonal.js) — the 6
 *   fruit/veg products below exist in the EUFIC catalog (seasonId = the
 *   Season Matcher food id). The market happens in a country + month, and
 *   whether a local product is in season is read from that dataset only.
 *   Their imported ORIGIN COUNTRIES reuse seasonMatcherData.FOOD_OUT_ORIGIN
 *   one-to-one, so the same food "travels from" the same country across the
 *   whole island.
 *
 * GAME PARAMETERS (ours, NOT educational claims):
 *   • € prices: local is
 *     no longer always the expensive option. A local product in season costs
 *     the same as or less than the imported one (strawberries +€0.50); out of
 *     season it costs double the imported price; local craft cheese and honey
 *     cost €1.50 more. Whole €0.50 steps keep the sums child-friendly.
 *   • km figures: order-of-magnitude route distances to the named origin —
 *     plausible, but chosen for play balance, not measured claims.
 *   • food-miles: derived from km via the milesForKm() tier table below.
 *   • Cheese & honey are NOT EUFIC items (EUFIC covers fruit & vegetables);
 *     they are "local craft" market archetypes without a season. Their
 *     origins/distances are game parameters (Germany = major EU dairy
 *     exporter; the EU imports much of its honey from China).
 */

// Internal distance tier used only to calculate transport points. This is a
// gameplay tuning value, not an EU definition of local food.
export const LOCAL_KM_MAX = 400;

// Food-miles per distance — GAME PARAMETER tier table (keeps the dual-budget
// balance of the original tuning: local trips ≈1 mile, continental imports 8,
// intercontinental 9, antipodean 10).
export function milesForKm(km) {
  if (km <= LOCAL_KM_MAX) return 1;
  if (km <= 3500) return 8;
  if (km <= 10000) return 9;
  return 10;
}

// Origin metadata mirrors seasonMatcherData.FOOD_OUT_ORIGIN (island consistency).
const withMiles = (option) => ({ ...option, miles: milesForKm(option.km) });

// prices: { imported, localInSeason, localOutOfSeason } for EUFIC produce,
//         { imported, local } for the craft products (no season).
// The price a child sees is resolved per market scenario (country + month) in
// marketTripLogic.buildMarketScenario().
export const PRODUCTS = [
  {
    emoji: '🍅', nameKey: 'market.tomatoes', seasonId: 'tomato',
    prices: { imported: 1.5, localInSeason: 1.0, localOutOfSeason: 3.0 },
    local:    withMiles({ nameKey: 'market.tomatoes_local',    km: 15 }),
    imported: withMiles({ nameKey: 'market.tomatoes_imported', km: 2500,
      originKey: 'season.origin_out.morocco', flag: '🇲🇦' }),
  },
  {
    emoji: '🍎', nameKey: 'market.apples', seasonId: 'apple',
    prices: { imported: 1.0, localInSeason: 1.0, localOutOfSeason: 2.0 },
    local:    withMiles({ nameKey: 'market.apples_local',    km: 8 }),
    imported: withMiles({ nameKey: 'market.apples_imported', km: 11500,
      originKey: 'season.origin_out.argentina', flag: '🇦🇷' }),
  },
  {
    emoji: '🥬', nameKey: 'market.lettuce', seasonId: 'lettuce',
    prices: { imported: 1.0, localInSeason: 1.0, localOutOfSeason: 2.0 },
    local:    withMiles({ nameKey: 'market.lettuce_local',    km: 5 }),
    imported: withMiles({ nameKey: 'market.lettuce_imported', km: 1800,
      originKey: 'season.origin_out.spain', flag: '🇪🇸' }),
  },
  {
    emoji: '🍊', nameKey: 'market.oranges', seasonId: 'orange',
    prices: { imported: 1.5, localInSeason: 1.5, localOutOfSeason: 3.0 },
    local:    withMiles({ nameKey: 'market.oranges_local',    km: 20 }),
    imported: withMiles({ nameKey: 'market.oranges_imported', km: 9500,
      originKey: 'season.origin_out.south_africa', flag: '🇿🇦' }),
  },
  {
    emoji: '🥔', nameKey: 'market.potatoes', seasonId: 'potato',
    prices: { imported: 1.0, localInSeason: 1.0, localOutOfSeason: 2.0 },
    local:    withMiles({ nameKey: 'market.potatoes_local',    km: 12 }),
    imported: withMiles({ nameKey: 'market.potatoes_imported', km: 3200,
      originKey: 'season.origin_out.egypt', flag: '🇪🇬' }),
  },
  {
    emoji: '🍓', nameKey: 'market.strawberries', seasonId: 'strawberry',
    prices: { imported: 2.0, localInSeason: 2.5, localOutOfSeason: 4.0 },
    local:    withMiles({ nameKey: 'market.strawberries_local',    km: 10 }),
    imported: withMiles({ nameKey: 'market.strawberries_imported', km: 3200,
      originKey: 'season.origin_out.egypt', flag: '🇪🇬' }),
    // EUFIC names berries among the fragile foods often flown by plane; the
    // card says «often», never that this game item travelled by air.
    fragile: true,
  },
  {
    // Local craft archetype — not a EUFIC item (see header).
    emoji: '🧀', nameKey: 'market.cheese', craft: true,
    prices: { imported: 2.0, local: 3.5 },
    local:    withMiles({ nameKey: 'market.cheese_local',    km: 25 }),
    imported: withMiles({ nameKey: 'market.cheese_imported', km: 1800,
      originKey: 'season.origin_out.germany', flag: '🇩🇪' }),
  },
  {
    // Local craft archetype — not a EUFIC item (see header).
    emoji: '🍯', nameKey: 'market.honey', craft: true,
    prices: { imported: 2.0, local: 3.5 },
    local:    withMiles({ nameKey: 'market.honey_local',    km: 5 }),
    imported: withMiles({ nameKey: 'market.honey_imported', km: 7700,
      originKey: 'season.origin_out.china', flag: '🇨🇳' }),
  },
];

// ─── Facts: two layers, the Island 1 pattern ──
//   `quote` = a verbatim passage from the registered source viewer.
//   `plain` = what the child reads on the card: our own sentence for ages 9 to 14.
export const MARKET_FACTS = {
  // Fired once, on the player's FIRST local purchase.
  localFirst: {
    quote: 'Eating locally and seasonally offers many benefits, such as supporting local farmers, reducing the environmental impact of food transportation, and enjoying fresher, more nutrient-dense foods.',
    plain: 'You chose local. Buying local and seasonal food can support nearby farmers.',
    sourceKey: 'local-seasonal-food',
  },
  // Fired once on the first imported purchase. Imports are not presented as
  // the villain: year-round variety is a real benefit.
  importedFirst: {
    quote: 'At the same time, global food trade plays a vital role in ensuring food security, providing dietary diversity.',
    plain: 'You picked an imported food. Imports can give us a wider variety of fruit and vegetables throughout the year.',
    sourceKey: 'local-seasonal-food',
  },
  // Shown in the intro and choice overlay. The EU report deliberately avoids a
  // fixed kilometre rule, so the game does the same in its educational copy.
  localDef: {
    quote: 'There is no uniform definition of the term ‘local area’.',
    plain: 'Local food comes from a reasonably nearby area. Europe has no single kilometre rule for what counts as local.',
    sourceKey: 'eu-local-food-systems',
  },
  // Fired once on a later imported purchase. This adds the important nuance
  // that distance is only one part of a food's environmental impact.
  carbonFootprint: {
    quote: 'While the type of transportation might be significant for some fruit and vegetables, such as with air-freighted produce (e.g. berries, tropical fruit and green beans), the contribution of transportation to the carbon footprint is usually lower than the emissions coming from the methods of production.',
    plain: 'Distance is only part of the story. How food is grown can sometimes affect the climate more than its journey.',
    sourceKey: 'eufic-seasonality-environment',
  },
  // Fired once on a long-haul selection. It teaches a general air-freight fact
  // without claiming that this specific game item travelled by plane.
  airFreight: {
    quote: 'fragile, highly perishable, and out of season soft fruit (berries, cherries) or exotic fruit (lychees, papayas, passion fruit) and out of season vegetables (asparagus, green beans, peas) are often transported by airplane because they spoil quicker. This greatly increases their GHG emissions.',
    plain: 'Not every imported food travels by plane. But some fragile foods are flown because they spoil quickly, and that greatly increases greenhouse gas emissions.',
    sourceKey: 'eufic-seasonality-environment',
  },
};

// The MissionIntroCard reuses the verified local-area explanation.
export const MARKET_INTRO_FACT = {
  sourceId: MARKET_FACTS.localDef.sourceKey,
  quote: MARKET_FACTS.localDef.quote,
  plain: MARKET_FACTS.localDef.plain, // one source sentence, one wording, mirrored
};
