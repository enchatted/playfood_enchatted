import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  SPOTS, PLANT_ORIGINS, GROWING_REVEALS,
  buildDeck, gradeWhereDoesItGrow, starsForFirstTry, pickReveal,
  starsForTier, gradeGardenPlanner, liveStarsForHarvests,
  GENERAL_CARDS_PER_ROUND,
} from './growing.js';
import { SOURCES, MISSION_SOURCES } from './sources.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

// Source-of-truth for the verbatim authenticity guard: the branded source viewer
// shows each PDF page "as given" (Content Authenticity Mandate). Every in-game
// quote must be a verbatim substring of these page texts — never invented or
// embellished. Quotes may add leading/trailing "…" as in-game truncation markers
// (not in the source), so we strip those before matching.
const SOURCE_HTML = readFileSync(
  fileURLToPath(new URL('../../public/source.html', import.meta.url)),
  'utf8',
);
const verbatimCore = (q) => q.replace(/^[…\s]+/, '').replace(/[…\s]+$/, '').trim();

// The card gives a child-friendly explanation and the source contains the exact quotation.
function expectPlainSentence(plain, label) {
  expect(typeof plain, `${label}: plain must be a string`).toBe('string');
  expect(plain.length, `${label}: plain must be non-empty`).toBeGreaterThan(0);
  expect(plain.startsWith('…'), `${label}: plain must not open with an ellipsis`).toBe(false);
  expect(plain[0], `${label}: plain must start with a capital`).toBe(plain[0].toUpperCase());
  expect(/[.!?]$/.test(plain), `${label}: plain must end as a sentence`).toBe(true);
  // Project copy rule: no em dashes and no en dashes in anything a child reads.
  expect(/[—–]/.test(plain), `${label}: plain must not contain a dash`).toBe(false);
}

const SPOT_KEYS = ['tree', 'vine', 'soil', 'grain'];
const SCOPES = ['item', 'category', 'general'];
// The only sources this game cites (the rest of SOURCES belong to other games).
const MAPPED_SOURCES = new Set(MISSION_SOURCES.WhereDoesItGrow);

describe('growing data', () => {
  it('defines the 4 growing spots', () => {
    expect(SPOTS.map((s) => s.key).sort()).toEqual([...SPOT_KEYS].sort());
  });

  it('every plant has a valid origin and an emoji', () => {
    for (const p of PLANT_ORIGINS) {
      expect(SPOT_KEYS).toContain(p.origin);
      expect(p.emoji).toBeTruthy();
      expect(p.id).toBeTruthy();
    }
  });

  it('the pool covers all 4 origins (so every spot is reachable)', () => {
    const origins = new Set(PLANT_ORIGINS.map((p) => p.origin));
    for (const k of SPOT_KEYS) expect(origins.has(k)).toBe(true);
  });

  it('every reveal quote resolves to a registered source', () => {
    for (const r of GROWING_REVEALS) {
      expect(SOURCES[r.sourceId], r.id).toBeDefined();
      expect(r.quote).toBeTruthy();
    }
  });

  it('authenticity guard: every reveal cites a source the game actually maps', () => {
    for (const r of GROWING_REVEALS) {
      expect(MAPPED_SOURCES.has(r.sourceId), r.id).toBe(true);
    }
  });

  it('authenticity guard: every reveal quote is verbatim in the source viewer', () => {
    // Pins quote text to the source-of-truth so an embellished/invented quote
    // (e.g. appending a clause the source never says) fails the build, not just
    // a manual review. Allows leading/trailing "…" truncation markers.
    for (const r of GROWING_REVEALS) {
      expect(SOURCE_HTML.includes(verbatimCore(r.quote)), r.id).toBe(true);
    }
  });

  it('every reveal has a child-facing plain sentence (never a fragment)', () => {
    for (const r of GROWING_REVEALS) expectPlainSentence(r.plain, r.id);
  });

  it('the nine-species lesson names what the number refers to in every locale', () => {
    const english = GROWING_REVEALS.find((reveal) => reveal.id === 'nine-species').plain;
    const localized = [
      ['en', english, /nine plant species/i],
      ['el', el.wheredoesitgrow.facts['nine-species'], /εννέα είδη φυτών/i],
      ['nl', nl.wheredoesitgrow.facts['nine-species'], /negen plantensoorten/i],
      ['pt', pt.wheredoesitgrow.facts['nine-species'], /nove espécies de plantas/i],
    ];

    for (const [locale, sentence, explicitPlantKinds] of localized) {
      expect(sentence, `${locale}: nine must explicitly refer to plant species`)
        .toMatch(explicitPlantKinds);
    }
  });

  it('plain sentences keep every figure their source quote states', () => {
    // The rewrite may simplify wording, never the numbers. "75%" may become
    // "three quarters" and "6.000" may become "6,000", so compare digit runs
    // after normalising the separator, and allow the documented word forms.
    const WORDED = {
      'nine-species': ['fifty'],
      'fifty-percent': ['half'],
      'crop-diversity-loss': ['three quarters'],
    };
    const digits = (s) => (s.replace(/[.,](?=\d)/g, '').match(/\d+/g) || []);
    for (const r of GROWING_REVEALS) {
      const inPlain = new Set(digits(r.plain));
      for (const n of digits(r.quote)) {
        const spelledOut = (WORDED[r.id] || []).some((w) => r.plain.toLowerCase().includes(w));
        expect(inPlain.has(n) || spelledOut, `${r.id}: figure ${n} lost in the plain sentence`).toBe(true);
      }
    }
  });

  it('every reveal has a valid scope', () => {
    for (const r of GROWING_REVEALS) {
      expect(SCOPES, r.id).toContain(r.scope);
    }
  });

  it('the intro reveal is general-scoped', () => {
    const intro = GROWING_REVEALS.find((r) => r.trigger && r.trigger.intro);
    expect(intro).toBeTruthy();
    expect(intro.scope).toBe('general');
  });

  it('provides general-scoped fallback facts beyond the intro', () => {
    const generalFallbacks = GROWING_REVEALS.filter(
      (r) => !r.trigger && r.scope === 'general',
    );
    expect(generalFallbacks.length).toBeGreaterThan(0);
  });
});

describe('Garden Planner child-facing copy', () => {
  const localeCases = [
    {
      code: 'en', garden: en.garden,
      singularHealthy: /this plant is healthy/i,
      singularWilted: /this plant is wilted/i,
      healthyPlants: /healthy plants/i,
      wiltedPlants: /wilted plants/i,
      companionQuestion: /which plants grow/i,
    },
    {
      code: 'el', garden: el.garden,
      singularHealthy: /αυτό το φυτό είναι υγιές/i,
      singularWilted: /αυτό το φυτό είναι μαραμένο/i,
      healthyPlants: /υγιή φυτά/i,
      wiltedPlants: /μαραμένα φυτά/i,
      companionQuestion: /ποια φυτά μεγαλώνουν/i,
    },
    {
      code: 'nl', garden: nl.garden,
      singularHealthy: /deze plant is gezond/i,
      singularWilted: /deze plant is verwelkt/i,
      healthyPlants: /gezonde planten/i,
      wiltedPlants: /verwelkte planten/i,
      companionQuestion: /welke planten groeien/i,
    },
    {
      code: 'pt', garden: pt.garden,
      singularHealthy: /esta planta está saudável/i,
      singularWilted: /esta planta está murcha/i,
      healthyPlants: /plantas saudáveis/i,
      wiltedPlants: /plantas murchas/i,
      companionQuestion: /que plantas crescem/i,
    },
  ];

  it('tool feedback names the plant it describes in every locale', () => {
    for (const copy of localeCases) {
      expect(copy.garden.wrong_tool_healthy, `${copy.code}: healthy target`).toMatch(copy.singularHealthy);
      expect(copy.garden.wrong_tool_wilted, `${copy.code}: wilted target`).toMatch(copy.singularWilted);

      for (const key of ['obj_swap_to_compost', 'auto_drop_basket']) {
        expect(copy.garden[key], `${copy.code}: ${key}`).toMatch(copy.healthyPlants);
      }
      for (const key of ['obj_swap_to_basket', 'auto_drop_bin']) {
        expect(copy.garden[key], `${copy.code}: ${key}`).toMatch(copy.wiltedPlants);
      }

      expect(copy.garden.results.wrong_tool_hint, `${copy.code}: result hint`)
        .toMatch(copy.healthyPlants);
      expect(copy.garden.results.wrong_tool_hint, `${copy.code}: result hint`)
        .toMatch(copy.wiltedPlants);
    }
  });

  it('the companion question explicitly asks which plants grow together', () => {
    for (const copy of localeCases) {
      expect(copy.garden.event.companions_q, copy.code).toMatch(copy.companionQuestion);
    }
  });

  // Check that the obsolete seed tutorial keys are absent from every locale.
  it('the retired step-by-step tutorial copy is gone from every locale', () => {
    for (const [code, locale] of Object.entries({ en, el, nl, pt })) {
      const retired = Object.keys(locale.garden).filter((key) => key.startsWith('tut_step'));
      expect(retired, code).toEqual([]);
      expect(JSON.stringify(locale.garden).toLowerCase(), `${code}: no "heirloom" in Garden copy`)
        .not.toMatch(/τοπικοί heirloom|local heirloom|lokale heirloom/);
    }
  });
});

// Check the seed-choice message in each language.
describe('Garden seed-choice message — adapted to local conditions', () => {
  it('uses the source-scoped food claim and retains adapted-to-local-conditions wording in 4 languages', () => {
    expect(el.garden.event.seed_choice_msg).toBe('Οι παραδοσιακές ποικιλίες μπορεί να δίνουν πιο θρεπτική τροφή και συχνά είναι προσαρμοσμένες στις τοπικές συνθήκες.');
    expect(en.garden.event.seed_choice_msg).toBe('Heirloom varieties can give more nutritious food, and they are often adapted to local conditions.');
    expect(nl.garden.event.seed_choice_msg).toBe('Erfgoedrassen kunnen voedzamer eten geven en zijn vaak aangepast aan de lokale omstandigheden.');
    expect(pt.garden.event.seed_choice_msg).toBe('As variedades tradicionais podem dar alimentos mais nutritivos e muitas vezes estão adaptadas às condições locais.');
  });
});

describe('Where Does It Grow child-facing Greek copy', () => {
  it('explains that a correct match reveals a food fact and where to open its source', () => {
    const instruction = el.missionIntro.wheredoesitgrow.step3;

    expect(instruction).toMatch(/σωστό ταίριασμα/i);
    expect(instruction).toMatch(/τροφ/i);
    expect(instruction).toMatch(/πηγή/i);
  });
});

describe('Soil Doctor child-facing copy', () => {
  const localeCases = [
    {
      code: 'en', locale: en,
      gardenBed: /heal the garden bed/i,
      neededRemedy: /remedy the plot needs/i,
      bringRemedy: /bring the remedy back.*heal the plot/i,
      summaryLabels: [/healed beds/i, /chemicals/i, /mistakes/i],
    },
    {
      code: 'el', locale: el,
      gardenBed: /θεράπευσε το παρτέρι/i,
      neededRemedy: /λύση που χρειάζεται το παρτέρι/i,
      bringRemedy: /φέρε τη φυσική λύση στο παρτέρι.*θεράπευσέ το/i,
      summaryLabels: [/θεραπευμένα παρτέρια/i, /χημικά/i, /λάθη/i],
    },
    {
      code: 'nl', locale: nl,
      gardenBed: /genees het tuinbed/i,
      neededRemedy: /middel dat het perk nodig heeft/i,
      bringRemedy: /breng het middel terug.*genees het perk/i,
      summaryLabels: [/genezen perken/i, /chemicaliën/i, /fouten/i],
    },
    {
      code: 'pt', locale: pt,
      gardenBed: /cura o canteiro/i,
      neededRemedy: /remédio de que o canteiro precisa/i,
      bringRemedy: /leva o remédio ao canteiro.*cura-o/i,
      summaryLabels: [/canteiros curados/i, /químicos/i, /erros/i],
    },
  ];

  it('names the garden bed instead of using an unclear pronoun in the intro', () => {
    for (const copy of localeCases) {
      expect(copy.locale.missionIntro.soildoctor.step3, copy.code).toMatch(copy.gardenBed);
    }
  });

  it('names both the plot and its remedy in the treatment guide', () => {
    for (const copy of localeCases) {
      expect(copy.locale.soildoctor.guide_grab, `${copy.code}: fetch remedy`)
        .toMatch(copy.neededRemedy);
      expect(copy.locale.soildoctor.guide_treat, `${copy.code}: bring remedy`)
        .toMatch(copy.bringRemedy);
    }
  });

  it('labels all three numbers in the result summary', () => {
    for (const copy of localeCases) {
      for (const label of copy.summaryLabels) {
        expect(copy.locale.soildoctor.results.summary, copy.code).toMatch(label);
      }
    }
  });
});

describe('i18n parity: wheredoesitgrow.facts', () => {
  // Every GROWING_REVEALS id must have a translated fact in el/nl/pt so no
  // fact silently falls back to English in those locales.
  const locales = ['el', 'nl', 'pt'];
  const localeData = Object.fromEntries(
    locales.map((lang) => [
      lang,
      JSON.parse(
        readFileSync(
          fileURLToPath(new URL(`../i18n/locales/${lang}.json`, import.meta.url)),
          'utf8',
        ),
      ),
    ]),
  );

  for (const lang of locales) {
    it(`${lang}.json has a non-empty facts entry for every GROWING_REVEALS id`, () => {
      const facts = localeData[lang]?.wheredoesitgrow?.facts ?? {};
      for (const r of GROWING_REVEALS) {
        const val = facts[r.id];
        expect(val, `${lang} missing wheredoesitgrow.facts.${r.id}`).toBeTruthy();
        expect(typeof val, `${lang} wheredoesitgrow.facts.${r.id} should be string`).toBe('string');
        expect(val.length, `${lang} wheredoesitgrow.facts.${r.id} should be non-empty`).toBeGreaterThan(0);
      }
    });
  }
});

describe('buildDeck', () => {
  it('returns n cards, all with valid origin', () => {
    const deck = buildDeck(10);
    expect(deck).toHaveLength(10);
    for (const c of deck) expect(SPOT_KEYS).toContain(c.origin);
  });

  it('always includes the grain trio (corn/rice/wheat) so the grain facts can fire', () => {
    const ids = buildDeck(10).map((c) => c.id);
    expect(ids).toContain('corn');
    expect(ids).toContain('rice');
    expect(ids).toContain('wheat');
  });
});

describe('starsForFirstTry', () => {
  it('awards 0–3 stars by first-try ratio (30/60/100%)', () => {
    expect(starsForFirstTry(10, 10)).toBe(3); // all first try → perfect
    expect(starsForFirstTry(9, 10)).toBe(2);  // 90% → great
    expect(starsForFirstTry(6, 10)).toBe(2);  // 60% → great (boundary)
    expect(starsForFirstTry(5, 10)).toBe(1);  // 50% → pass
    expect(starsForFirstTry(3, 10)).toBe(1);  // 30% → pass (boundary)
    expect(starsForFirstTry(2, 10)).toBe(0);  // 20% → fail-soft
    expect(starsForFirstTry(0, 10)).toBe(0);
  });

  it('returns 0 when there are no foods (no divide-by-zero)', () => {
    expect(starsForFirstTry(0, 0)).toBe(0);
    expect(starsForFirstTry(5, 0)).toBe(0);
  });
});

describe('gradeWhereDoesItGrow', () => {
  it('maps first-try count → stars + tier', () => {
    expect(gradeWhereDoesItGrow(10, 10)).toEqual({ passed: true, stars: 3, tier: 'perfect' });
    expect(gradeWhereDoesItGrow(6, 10)).toEqual({ passed: true, stars: 2, tier: 'great' });
    expect(gradeWhereDoesItGrow(3, 10)).toEqual({ passed: true, stars: 1, tier: 'pass' });
    expect(gradeWhereDoesItGrow(2, 10)).toEqual({ passed: true, stars: 0, tier: 'fail' });
  });

  it('NO-FAIL: passed is always true (completing = passing)', () => {
    for (const f of [0, 3, 5, 6, 8, 10]) {
      expect(gradeWhereDoesItGrow(f, 10).passed, `f=${f}`).toBe(true);
    }
    expect(gradeWhereDoesItGrow(0, 0).passed).toBe(true);
  });
});

describe('pickReveal', () => {
  it('prefers an item/category match for a linked food', () => {
    const first = pickReveal({ id: 'potato', origin: 'soil' }, new Set());
    expect(first).toBeTruthy();
    expect(first.id).toBe('potato-park');
    expect(first.scope).toBe('item');
  });

  it('never returns the intro reveal', () => {
    const shown = new Set();
    for (let i = 0; i < GROWING_REVEALS.length; i++) {
      const r = pickReveal({ id: 'lemon', origin: 'tree' }, shown);
      if (!r) break;
      expect(r.trigger?.intro).toBeFalsy();
      shown.add(r.id);
    }
  });

  it('falls back to a general food fact when nothing matches the food', () => {
    const r = pickReveal({ id: 'lemon', origin: 'tree' }, new Set());
    expect(r).toBeTruthy();
    expect(r.scope).toBe('general');
    expect(r.trigger).toBeFalsy(); // a fallback, not the intro
  });

  it('returns null once every applicable reveal has been shown', () => {
    const shown = new Set(GROWING_REVEALS.map((r) => r.id));
    expect(pickReveal({ id: 'potato', origin: 'soil' }, shown)).toBeNull();
    expect(pickReveal({ id: 'lemon', origin: 'tree' }, shown)).toBeNull();
  });

  it('caps general cards at GENERAL_CARDS_PER_ROUND', () => {
    // A round used to deal five general cards, each following a placement it had
    // nothing to do with. Past the cap the placement gets its floating "Correct!"
    // line instead, so an unmatched food never drags an unrelated fact on screen.
    const shown = new Set();
    let dealt = 0;
    for (let i = 0; i < 10; i++) {
      const r = pickReveal({ id: 'lemon', origin: 'tree' }, shown); // never matches a fact
      if (!r) break;
      expect(r.scope).toBe('general');
      shown.add(r.id);
      dealt++;
    }
    expect(dealt).toBe(GENERAL_CARDS_PER_ROUND);
    expect(pickReveal({ id: 'lemon', origin: 'tree' }, shown)).toBeNull();
  });

  it('never deals a retired reveal, and the grain duplicate is retired', () => {
    // fifty-percent teaches the same lesson as three-crops on the same trigger with
    // a differently counted figure, so a child placing wheat then rice met it twice.
    const retired = GROWING_REVEALS.filter((r) => r.retired).map((r) => r.id);
    expect(retired).toContain('fifty-percent');
    const shown = new Set();
    for (let i = 0; i < GROWING_REVEALS.length; i++) {
      const r = pickReveal({ id: 'wheat', origin: 'grain' }, shown);
      if (!r) break;
      expect(r.retired, `${r.id} is retired but was dealt`).toBeFalsy();
      shown.add(r.id);
    }
  });

  it('still leads with the grain fact when a grain is placed', () => {
    const r = pickReveal({ id: 'rice', origin: 'grain' }, new Set());
    expect(r.id).toBe('three-crops');
  });
});

describe('starsForTier', () => {
  it('maps tier names to star counts', () => {
    expect(starsForTier('perfect')).toBe(3);
    expect(starsForTier('excellent')).toBe(2);
    expect(starsForTier('great')).toBe(2);
    expect(starsForTier('pass')).toBe(1);
    expect(starsForTier('fail')).toBe(0);
    expect(starsForTier('unknown')).toBe(0);
  });
});

describe('gradeGardenPlanner', () => {
  it('grades by healthyHarvests count', () => {
    expect(gradeGardenPlanner(8)).toEqual({ passed: true, stars: 3, tier: 'perfect' });
    expect(gradeGardenPlanner(7)).toEqual({ passed: true, stars: 2, tier: 'excellent' }); // mid excellent band
    expect(gradeGardenPlanner(6)).toEqual({ passed: true, stars: 2, tier: 'excellent' });
    expect(gradeGardenPlanner(5)).toEqual({ passed: true, stars: 1, tier: 'pass' });
    expect(gradeGardenPlanner(4)).toEqual({ passed: false, stars: 0, tier: 'fail' });
  });
});

describe('liveStarsForHarvests', () => {
  it('maps secured count to the same tiers as gradeGardenPlanner', () => {
    // 0-4 → 0 stars (fail band)
    for (const n of [0, 1, 2, 3, 4]) {
      expect(liveStarsForHarvests(n), `securedCount=${n}`).toBe(0);
    }
    // 5 → 1 star (pass)
    expect(liveStarsForHarvests(5)).toBe(1);
    // 6-7 → 2 stars (excellent)
    expect(liveStarsForHarvests(6)).toBe(2);
    expect(liveStarsForHarvests(7)).toBe(2);
    // 8 → 3 stars (perfect)
    expect(liveStarsForHarvests(8)).toBe(3);
  });

  it('live value at end equals gradeGardenPlanner(healthyHarvests).stars for all counts 0-8', () => {
    // Simulates game end: securedCount === healthyHarvests (all secured plots harvested).
    for (let h = 0; h <= 8; h++) {
      expect(liveStarsForHarvests(h), `healthyHarvests=${h}`)
        .toBe(gradeGardenPlanner(h).stars);
    }
  });
});

// ── Soil Doctor (G1.3) ──────────────────────────────────────
import {
  REMEDIES, SOIL_PLOTS, SOIL_REVEALS,
  buildSoilPlots, gradeSoilDoctor, liveStarsForSoilState,
} from './growing.js';

describe('soil doctor data', () => {
  const remedyKeys = REMEDIES.map((r) => r.key);

  it('has 4 plots, each needing a non-chemical remedy', () => {
    expect(SOIL_PLOTS).toHaveLength(4);
    for (const p of SOIL_PLOTS) {
      expect(remedyKeys).toContain(p.neededRemedy);
      expect(p.neededRemedy).not.toBe('chemical');
    }
  });

  it('flags exactly one remedy (chemical) as a trap', () => {
    expect(REMEDIES.find((r) => r.key === 'chemical').isTrap).toBe(true);
    expect(REMEDIES.filter((r) => r.isTrap)).toHaveLength(1);
  });

  it('every reveal resolves to a registered source', () => {
    for (const [k, r] of Object.entries(SOIL_REVEALS)) {
      expect(SOURCES[r.sourceId], k).toBeDefined();
      expect(r.quote).toBeTruthy();
    }
  });

  it('authenticity guard: every soil reveal quote is verbatim in the source viewer', () => {
    // Each growing fact quotes a passage available in the source viewer.
    for (const [k, r] of Object.entries(SOIL_REVEALS)) {
      expect(SOURCE_HTML.includes(verbatimCore(r.quote)), k).toBe(true);
    }
  });

  it('every soil reveal has a child-facing plain sentence (never a fragment)', () => {
    for (const [k, r] of Object.entries(SOIL_REVEALS)) expectPlainSentence(r.plain, k);
  });

  it('each plot remedy has a matching heal reveal', () => {
    for (const p of SOIL_PLOTS) expect(SOIL_REVEALS[p.neededRemedy]).toBeDefined();
  });

  it('buildSoilPlots returns 4 sick, unhealed plots', () => {
    const plots = buildSoilPlots();
    expect(plots).toHaveLength(4);
    for (const p of plots) {
      expect(p.healed).toBe(false);
      expect(p.health).toBeLessThan(100);
    }
  });
});

describe('gradeSoilDoctor', () => {
  const base = { healedCount: 4, plotCount: 4, soilHealth: 60, chemicalUses: 0, mistakes: 0 };
  it('fails if not all plots healed', () => {
    expect(gradeSoilDoctor({ ...base, healedCount: 3 }).passed).toBe(false);
  });
  it('fails if soil health crashed to 0', () => {
    expect(gradeSoilDoctor({ ...base, soilHealth: 0 }).passed).toBe(false);
  });
  it('perfect: all healed, no chemical, no mistakes', () => {
    expect(gradeSoilDoctor(base)).toEqual({ passed: true, stars: 3, tier: 'perfect' });
  });
  it('returns stars per tier and 0 on fail (ResultScreen star row + lighthouse bridge)', () => {
    expect(gradeSoilDoctor({ ...base, mistakes: 2 }).stars).toBe(2);      // great
    expect(gradeSoilDoctor({ ...base, chemicalUses: 1 }).stars).toBe(1);  // pass
    expect(gradeSoilDoctor({ ...base, healedCount: 3 }).stars).toBe(0);   // fail
  });
  it('great: no chemical, ≤2 mistakes', () => {
    expect(gradeSoilDoctor({ ...base, mistakes: 2 }).tier).toBe('great');
  });
  it('pass: chemical used but all healed', () => {
    const r = gradeSoilDoctor({ ...base, chemicalUses: 1, soilHealth: 30 });
    expect(r.passed).toBe(true);
    expect(r.tier).toBe('pass');
  });
});

describe('liveStarsForSoilState', () => {
  it('clean state → 3 stars', () => {
    expect(liveStarsForSoilState({ soilHealth: 100, chemicalUses: 0, mistakes: 0 })).toBe(3);
  });

  it('1-2 mistakes, no chemicals → 2 stars', () => {
    expect(liveStarsForSoilState({ soilHealth: 100, chemicalUses: 0, mistakes: 1 })).toBe(2);
    expect(liveStarsForSoilState({ soilHealth: 100, chemicalUses: 0, mistakes: 2 })).toBe(2);
  });

  it('3+ mistakes, no chemicals → 1 star', () => {
    expect(liveStarsForSoilState({ soilHealth: 100, chemicalUses: 0, mistakes: 3 })).toBe(1);
  });

  it('any chemical use → 1 star', () => {
    expect(liveStarsForSoilState({ soilHealth: 100, chemicalUses: 1, mistakes: 0 })).toBe(1);
  });

  it('soil crashed (health ≤ 0) → 0 stars', () => {
    expect(liveStarsForSoilState({ soilHealth: 0, chemicalUses: 0, mistakes: 0 })).toBe(0);
  });

  it('consistency lock: live stars match final ResultScreen stars for a passed run', () => {
    // Clean run — 0 chemicals, 0 mistakes
    const cleanState = { soilHealth: 60, chemicalUses: 0, mistakes: 0 };
    expect(liveStarsForSoilState(cleanState))
      .toBe(starsForTier(gradeSoilDoctor({ ...cleanState, healedCount: 4, plotCount: 4 }).tier));

    // 2-mistake run — 0 chemicals
    const twoMistakeState = { soilHealth: 60, chemicalUses: 0, mistakes: 2 };
    expect(liveStarsForSoilState(twoMistakeState))
      .toBe(starsForTier(gradeSoilDoctor({ ...twoMistakeState, healedCount: 4, plotCount: 4 }).tier));
  });
});

describe('i18n parity: soildoctor.facts', () => {
  // Every SOIL_REVEALS id must have a translated fact in el/nl/pt so no
  // fact silently falls back to English in those locales.
  // en.json must NOT have a soildoctor.facts block (English falls back via defaultValue).
  const locales = ['el', 'nl', 'pt'];
  const soilLocaleData = Object.fromEntries(
    locales.map((lang) => [
      lang,
      JSON.parse(
        readFileSync(
          fileURLToPath(new URL(`../i18n/locales/${lang}.json`, import.meta.url)),
          'utf8',
        ),
      ),
    ]),
  );
  const enLocale = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../i18n/locales/en.json', import.meta.url)),
      'utf8',
    ),
  );

  it('en.json has NO soildoctor.facts block (English falls back via defaultValue)', () => {
    expect(enLocale?.soildoctor?.facts).toBeUndefined();
  });

  for (const lang of locales) {
    it(`${lang}.json has a non-empty facts entry for every SOIL_REVEALS id`, () => {
      const facts = soilLocaleData[lang]?.soildoctor?.facts ?? {};
      for (const id of Object.keys(SOIL_REVEALS)) {
        const val = facts[id];
        expect(val, `${lang} missing soildoctor.facts.${id}`).toBeTruthy();
        expect(typeof val, `${lang} soildoctor.facts.${id} should be string`).toBe('string');
        expect(val.length, `${lang} soildoctor.facts.${id} should be non-empty`).toBeGreaterThan(0);
      }
    });
  }

  it('explains no-till in everyday Greek instead of using the specialist word βραγιά', () => {
    const noTillFact = soilLocaleData.el.soildoctor.facts.notill;

    expect(noTillFact).toContain('χώμα');
    expect(noTillFact).not.toContain('βραγιά');
  });

  it('every SOIL_REVEALS sourceId resolves in SOURCES', () => {
    for (const [k, r] of Object.entries(SOIL_REVEALS)) {
      expect(SOURCES[r.sourceId], `SOIL_REVEALS.${k}.sourceId`).toBeDefined();
    }
  });
});

// Each hint refers to the growing place it describes.
describe('Where Does It Grow: explanation after the second wrong try', () => {
  const locales = { en, el, nl, pt };
  it('every spot has a short "why" sentence in all four locales', () => {
    for (const [locale, copy] of Object.entries(locales)) {
      for (const { key } of SPOTS) {
        const line = copy.wheredoesitgrow[`why_${key}`];
        expect(line, `${locale}: wheredoesitgrow.why_${key}`).toBeTypeOf('string');
        // The chip's first line names the food; the why line stays food-agnostic
        // so plural food names ("grapes", «Σταφύλια») never break the grammar.
        expect(line, `${locale}: why_${key} must not interpolate the food`).not.toContain('{{food}}');
        expect(line.length, `${locale}: why_${key} stays one short sentence pair`).toBeLessThan(90);
      }
    }
  });
  it('the soil explanation never calls every underground food a root', () => {
    for (const [locale, copy] of Object.entries(locales)) {
      expect(copy.wheredoesitgrow.why_soil.toLowerCase(), locale)
        .not.toMatch(/root|ρίζα|wortel|raiz/);
    }
  });
});

// The transition to harvest explains that growing time has passed.
describe('Garden Planner: growing-time message before harvest', () => {
  it('exists in all four locales, is our own wording (no figures) and the title keeps one 🌾', () => {
    for (const [locale, copy] of Object.entries({ en, el, nl, pt })) {
      const line = copy.garden.msg.growth_time;
      expect(line, `${locale}: garden.msg.growth_time`).toBeTypeOf('string');
      expect(line, `${locale}: no numbers, so it is not a fact that needs a source`).not.toMatch(/\d/);
      expect(copy.garden.phase_harvest.startsWith('🌾'), `${locale}: phase_harvest`).toBe(true);
    }
  });
});

// Name each growing spot as a place and distinguish trees from other plants.
describe('Where Does It Grow: spot names are places, not misleading categories', () => {
  const locales = { en, el, nl, pt };
  it('no spot is called just "plant", "root" or "cereal", and each success line repeats its spot', () => {
    for (const [code, copy] of Object.entries(locales)) {
      const w = copy.wheredoesitgrow;
      for (const { key } of SPOTS) {
        const label = w[`spot_${key}`];
        expect(label.toLowerCase(), `${code}: spot_${key}`)
          .not.toMatch(/^(like a plant|σαν φυτό|als een plant|como uma planta)$/);
        expect(label.toLowerCase(), `${code}: spot_${key}`).not.toMatch(/root|ρίζα|wortel|raiz|cereal/);
        expect(w[`correct_${key}`].toLowerCase(), `${code}: correct_${key} matches its spot`)
          .toContain(label.toLowerCase().replace(/^(on|aan|numa|σε) /, ''));
      }
    }
  });
});

// Each healing card connects healthy soil with strong plants and nutritious food.
describe('Soil Doctor: soil → plants → food takeaway', () => {
  it('exists in all four locales as a short arrow chain without figures', () => {
    for (const [code, copy] of Object.entries({ en, el, nl, pt })) {
      const line = copy.soildoctor.soil_chain;
      expect(line, code).toBeTypeOf('string');
      expect(line.split('→').length, `${code}: three links`).toBe(3);
      expect(line, `${code}: no numbers`).not.toMatch(/\d/);
    }
  });
});
