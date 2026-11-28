// Locks: Market Trip data grounded on verified facts.
import { describe, it, expect } from 'vitest';
import { PRODUCTS, LOCAL_KM_MAX, MARKET_FACTS, MARKET_INTRO_FACT, milesForKm } from './marketTripData.js';
import { FOOD_OUT_ORIGIN } from './seasonMatcherData.js';
import { SOURCES } from './sources.js';

// Compare the market's explanations with the quoted fixtures and the linked source viewer.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE_HTML_RAW = readFileSync(
  fileURLToPath(new URL('../../public/source.html', import.meta.url)),
  'utf8',
);
const SOURCE_HTML = SOURCE_HTML_RAW.replace(/\\'/g, "'");
const verbatimCore = (q) => q.replace(/^[…\s]+/, '').replace(/[…\s]+$/, '').trim();
const SOURCE_ARCHIVES = {
  'local-seasonal-food': readFileSync(
    fileURLToPath(new URL('../../test-fixtures/market-trip/local-seasonal-food.md', import.meta.url)),
    'utf8',
  ),
  'eu-local-food-systems': readFileSync(
    fileURLToPath(new URL('../../test-fixtures/market-trip/eu-local-food-systems.md', import.meta.url)),
    'utf8',
  ),
  'eufic-seasonality-environment': readFileSync(
    fileURLToPath(new URL('../../test-fixtures/market-trip/eufic-seasonality-environment.md', import.meta.url)),
    'utf8',
  ),
};

function expectPlainSentence(plain, label) {
  expect(typeof plain, `${label}: plain must be a string`).toBe('string');
  expect(plain.length, `${label}: plain must be non-empty`).toBeGreaterThan(0);
  expect(plain.startsWith('…'), `${label}: plain must not open with an ellipsis`).toBe(false);
  expect(/[.!?]$/.test(plain), `${label}: plain must end as a sentence`).toBe(true);
  expect(/[—–]/.test(plain), `${label}: plain must not contain a dash`).toBe(false);
}

import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

const LOCALES = [['en', en], ['el', el], ['nl', nl], ['pt', pt]];

describe('distance tiers are internal game parameters', () => {
  it('every local option is within LOCAL_KM_MAX; every imported option is beyond it', () => {
    for (const p of PRODUCTS) {
      expect(p.local.km, `${p.nameKey} local`).toBeLessThanOrEqual(LOCAL_KM_MAX);
      expect(p.imported.km, `${p.nameKey} imported`).toBeGreaterThan(LOCAL_KM_MAX);
    }
  });

  it('food-miles derive from km via the documented tier table (no hand-tuned drift)', () => {
    for (const p of PRODUCTS) {
      expect(p.local.miles, `${p.nameKey} local`).toBe(milesForKm(p.local.km));
      expect(p.imported.miles, `${p.nameKey} imported`).toBe(milesForKm(p.imported.km));
      expect(p.local.miles).toBe(1);
    }
  });

  it('an all-local trip costs 1 transport point per stall', () => {
    const total = PRODUCTS.reduce((sum, p) => sum + p.local.miles, 0);
    expect(total).toBe(PRODUCTS.length);
  });

  it('prices every product by season (produce) or as a local craft product', () => {
    for (const p of PRODUCTS) {
      if (p.craft) {
        expect(Object.keys(p.prices).sort(), p.nameKey).toEqual(['imported', 'local']);
        expect(p.seasonId, p.nameKey).toBeUndefined();
      } else {
        expect(Object.keys(p.prices).sort(), p.nameKey).toEqual(['imported', 'localInSeason', 'localOutOfSeason']);
        expect(typeof p.seasonId, p.nameKey).toBe('string');
      }
      expect(p.local.price, `${p.nameKey}: no fixed local price`).toBeUndefined();
      expect(p.imported.price, `${p.nameKey}: no fixed imported price`).toBeUndefined();
    }
  });
});

describe('island consistency: same food travels from the same country', () => {
  // The 6 EUFIC products must reuse Season Matcher's out-of-season origins.
  const EXPECTED = {
    'market.tomatoes': 'tomato', 'market.apples': 'apple', 'market.lettuce': 'lettuce',
    'market.oranges': 'orange', 'market.potatoes': 'potato', 'market.strawberries': 'strawberry',
  };

  it('imported origins of EUFIC products match FOOD_OUT_ORIGIN one-to-one', () => {
    for (const [nameKey, smId] of Object.entries(EXPECTED)) {
      const p = PRODUCTS.find((x) => x.nameKey === nameKey);
      expect(p, nameKey).toBeDefined();
      expect(p.imported.originKey, nameKey).toBe(FOOD_OUT_ORIGIN[smId].key);
      expect(p.imported.flag, nameKey).toBe(FOOD_OUT_ORIGIN[smId].flag);
    }
  });

  it('every imported origin key resolves in EN + EL locales', () => {
    for (const p of PRODUCTS) {
      const key = p.imported.originKey.split('.').pop();
      expect(en.season.origin_out[key], `en ${key}`).toBeTruthy();
      expect(el.season.origin_out[key], `el ${key}`).toBeTruthy();
    }
  });
});

describe('verified Market Trip facts', () => {
  it('all MARKET_FACTS carry a non-empty quote and a resolvable source', () => {
    for (const [id, fact] of Object.entries(MARKET_FACTS)) {
      expect(fact.quote, id).toBeTruthy();
      expect(SOURCES[fact.sourceKey], `${id} source`).toBeDefined();
    }
  });

  it('does not present the internal distance tier as a definition of local food', () => {
    expect(MARKET_FACTS.localDef.quote).not.toMatch(/400\s*(?:km|kilomet)/i);
    expect(MARKET_FACTS.localDef.plain).not.toMatch(/400\s*(?:km|kilomet)/i);
    expect(MARKET_FACTS.localDef.sourceKey).toBe('eu-local-food-systems');
  });

  it('uses the verified public sources for EU definitions and environmental context', () => {
    expect(MARKET_FACTS.importedFirst.sourceKey).toBe('local-seasonal-food');
    expect(MARKET_FACTS.carbonFootprint.sourceKey).toBe('eufic-seasonality-environment');
    expect(MARKET_FACTS.airFreight.sourceKey).toBe('eufic-seasonality-environment');
    expect(SOURCES['eu-local-food-systems']).toBeDefined();
    expect(SOURCES['eufic-seasonality-environment']).toBeDefined();
  });

  // The MissionIntroCard reuses the same verified local-food definition rather
  // than introducing a second claim or a game-tuning distance.
  it('MARKET_INTRO_FACT reuses the verified localDef with a resolvable sourceId', () => {
    expect(MARKET_INTRO_FACT).toEqual({
      sourceId: 'eu-local-food-systems',
      quote: MARKET_FACTS.localDef.quote,
      plain: MARKET_FACTS.localDef.plain,
    });
    expect(SOURCES[MARKET_INTRO_FACT.sourceId]).toBeDefined();
  });
});

describe('i18n product keys', () => {
  it('every product name key resolves in all 4 locales', () => {
    for (const [lname, loc] of LOCALES) {
      for (const p of PRODUCTS) {
        for (const key of [p.nameKey, p.local.nameKey, p.imported.nameKey]) {
          const [ns, leaf] = key.split('.');
          expect(loc[ns]?.[leaf], `${lname} ${key}`).toBeTruthy();
        }
      }
    }
  });

  // Staleness lock: the imported card title must BE the origin country the data
  // ships (an earlier version left old origins in the strings, e.g. "Chile" over a 🇦🇷 line).
  it('imported name strings mirror season.origin_out exactly, in every locale', () => {
    for (const [lname, loc] of LOCALES) {
      for (const p of PRODUCTS) {
        const leaf = p.imported.nameKey.split('.').pop();
        const origin = p.imported.originKey.split('.').pop();
        expect(loc.market[leaf], `${lname} ${leaf}`).toBe(loc.season.origin_out[origin]);
      }
    }
  });

  // The km figure lives in the data-driven line under the title; if a name
  // string carries its own number it can silently go stale again.
  it('option name strings carry no km figures', () => {
    for (const [lname, loc] of LOCALES) {
      for (const p of PRODUCTS) {
        for (const key of [p.local.nameKey, p.imported.nameKey]) {
          const leaf = key.split('.').pop();
          expect(loc.market[leaf], `${lname} ${leaf}`).not.toMatch(/\d|km|χλμ/);
        }
      }
    }
  });
});

// In-game facts are TRANSLATED to the child's language while the
// Press-S source.html stays in the original language. EN carries NO facts block
// (it falls back via i18next defaultValue to the canonical verbatim quote above).
describe('translated in-game facts, original-language source', () => {
  const FACT_IDS = Object.keys(MARKET_FACTS);

  it('EN keeps no market.facts block (falls back to the locked verbatim quote)', () => {
    expect(en.market.facts).toBeUndefined();
  });

  it('EL/NL/PT translate every fact id with a non-empty string', () => {
    for (const [lname, loc] of [['el', el], ['nl', nl], ['pt', pt]]) {
      expect(loc.market.facts, `${lname} facts block`).toBeDefined();
      for (const id of FACT_IDS) {
        expect(loc.market.facts[id], `${lname} ${id}`).toBeTruthy();
      }
    }
  });

  it('the «Press S» pill hint resolves in all 4 locales', () => {
    for (const [lname, loc] of LOCALES) {
      expect(loc.market.press_s, `${lname} press_s`).toBeTruthy();
    }
  });
});

// The result screen routes MarketTrip's stars → a tier → market.results.tier_*
// strings. Missing strings render the raw key (e.g. "undefined.tier_fail_title").
// Lock every tier title/body in every locale so that can't ship again.
describe('result-screen tier strings (no undefined.tier_* on the result screen)', () => {
  const TIERS = ['perfect', 'great', 'pass', 'fail'];
  it('every locale has market.results.tier_<t>_{title,body} for all 4 tiers', () => {
    for (const [lname, loc] of LOCALES) {
      const r = loc.market.results;
      expect(r, `${lname} market.results`).toBeDefined();
      for (const tier of TIERS) {
        expect(r[`tier_${tier}_title`], `${lname} tier_${tier}_title`).toBeTruthy();
        expect(r[`tier_${tier}_body`], `${lname} tier_${tier}_body`).toBeTruthy();
      }
    }
  });
});

describe('MarketTrip child-facing runtime copy', () => {
  const cases = [
    ['en', en, /stall/i, /transport points/i, /choice/i, /money budget/i],
    ['el', el, /πάγκο/i, /πόντ(?:οι|ους|ων) μεταφοράς/i, /επιλογή/i, /χρηματικό προϋπολογισμό/i],
    ['nl', nl, /kraam/i, /transportpunten/i, /keuze/i, /geldbudget/i],
    ['pt', pt, /banca/i, /pontos de transporte/i, /escolha/i, /orçamento de dinheiro/i],
  ];

  it('uses a market-specific action prompt that names the stall', () => {
    for (const [name, loc, stall] of cases) {
      expect(loc.market.shop_prompt, name).toMatch(stall);
    }
  });

  it('names the selected food in both local and imported feedback', () => {
    for (const [name, loc] of cases) {
      expect(loc.market.saved, `${name}: local feedback`).toContain('{{food}}');
      expect(loc.market.traveled, `${name}: imported feedback`).toContain('{{food}}');
      expect(loc.market.traveled, `${name}: imported distance`).toContain('{{km}}');
    }
  });

  it('names the choice and the missing amount in the money warning', () => {
    for (const [name, loc, , , choice] of cases) {
      expect(loc.market.warning_money, `${name}: money choice`).toMatch(choice);
      expect(loc.market.warning_money, `${name}: missing amount`).toContain('{{amount}}');
    }
  });

  it('labels the gamified meter as transport points rather than physical distance', () => {
    for (const [name, loc, , transportPoints] of cases) {
      expect(loc.market.miles_label, `${name}: side meter`).toMatch(transportPoints);
      expect(loc.market.goal_transport, `${name}: transport goal`).toMatch(transportPoints);
      const steps = ['step1', 'step2', 'step3'].map((key) => loc.missionIntro.markettrip[key]).join(' ');
      expect(steps, `${name}: intro meter`).toMatch(transportPoints);
    }
  });

  it('labels route kilometre values as approximate game estimates', () => {
    for (const [name, loc] of LOCALES) {
      expect(loc.market.km_label, `${name}: choice-card distance`).toContain('≈');
      expect(loc.market.traveled, `${name}: feedback distance`).toContain('≈');
    }
  });

  it('explains the result through the three goals, without fixed money figures', () => {
    for (const [name, loc, , transportPoints] of cases) {
      const results = loc.market.results;
      expect(results.tier_perfect_body, `${name}: perfect names the 3 goals`).toMatch(/3/);
      expect(results.tier_perfect_body, `${name}: perfect names transport`).toMatch(transportPoints);
      expect(results.tier_great_body, `${name}: great says 2 of 3`).toMatch(/2/);
      expect(results.tier_pass_body, `${name}: pass points at the other 2 goals`).toMatch(/2/);
      for (const body of Object.values(results)) {
        expect(body, `${name}: no stale €18/€20 or 16/24 figures`).not.toMatch(/€\s?(?:18|20)\b|\b(?:16|24)\s/);
      }
    }
  });
});

describe('authenticity guard + plain layer', () => {
  it('every quote is present in the independently archived source material', () => {
    for (const [id, fact] of Object.entries(MARKET_FACTS)) {
      const archive = SOURCE_ARCHIVES[fact.sourceKey];
      expect(archive, `${id}: missing source archive`).toBeTruthy();
      expect(archive.includes(verbatimCore(fact.quote)), id).toBe(true);
    }
  });

  it('every market fact quote is verbatim in the source viewer (unescaped)', () => {
    for (const [id, f] of Object.entries(MARKET_FACTS)) {
      expect(SOURCE_HTML.includes(verbatimCore(f.quote)), id).toBe(true);
    }
  });

  it('every market fact has a child-facing plain sentence (never a fragment)', () => {
    for (const [id, f] of Object.entries(MARKET_FACTS)) {
      expectPlainSentence(f.plain, id);
    }
  });

  it('market.facts translations exist for every id in el/nl/pt and none opens with an ellipsis', () => {
    // The old airFreight translations began with "…" in all three locales.
    for (const [lname, loc] of LOCALES) {
      if (lname === 'en') continue;
      for (const id of Object.keys(MARKET_FACTS)) {
        const val = loc.market?.facts?.[id];
        expect(val, `${lname} missing market.facts.${id}`).toBeTruthy();
        expect(val.startsWith('…'), `${lname} market.facts.${id} opens with an ellipsis`).toBe(false);
        expect(/[—–]/.test(val), `${lname} market.facts.${id} contains a dash`).toBe(false);
      }
    }
  });
});
