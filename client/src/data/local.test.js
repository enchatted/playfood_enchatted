import { describe, it, expect } from 'vitest';
import {
  PRODUCTS, PRODUCT_REVEALS, buildDeck, judge, gradeSpotTheFake,
  POINTS_CORRECT, PENALTY_WRONG, POINTS_FIRST_TRY, POINTS_RECOVERED,
  BONUS_FLAWLESS, scoreSpotTheFakeRun,
} from './local.js';
import { SOURCES, getMissionSources } from './sources.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

// Check that source quotations and their plain-language explanations remain distinct.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE_HTML_RAW = readFileSync(
  fileURLToPath(new URL('../../public/source.html', import.meta.url)),
  'utf8',
);
const SOURCE_HTML = SOURCE_HTML_RAW.replace(/\\'/g, "'");
const verbatimCore = (q) => q.replace(/^[…\s]+/, '').replace(/[…\s]+$/, '').trim();

function expectPlainSentence(plain, label) {
  expect(typeof plain, `${label}: plain must be a string`).toBe('string');
  expect(plain.length, `${label}: plain must be non-empty`).toBeGreaterThan(0);
  expect(plain.startsWith('…'), `${label}: plain must not open with an ellipsis`).toBe(false);
  expect(/[.!?]$/.test(plain), `${label}: plain must end as a sentence`).toBe(true);
  expect(/[—–]/.test(plain), `${label}: plain must not contain a dash`).toBe(false);
}

const PRODUCT_SEMANTIC_CONTRACT = [
  {
    id: 'soda', verdict: 'flag', evidenceType: 'claim', revealKey: 'vague',
    sourceId: 'greenwashing-red-flags',
    promises: {
      en: 'Natural ingredients · Eco choice', el: 'Φυσικά συστατικά · Οικολογική επιλογή',
      nl: 'Natuurlijke ingrediënten · Milieubewuste keuze', pt: 'Ingredientes naturais · Escolha ecológica',
    },
  },
  {
    id: 'choc', verdict: 'flag', evidenceType: 'seal', revealKey: 'toogood',
    sourceId: 'greenwashing-red-flags',
    promises: {
      en: 'Helps protect the rainforest', el: 'Βοηθά στην προστασία του τροπικού δάσους',
      nl: 'Helpt het regenwoud beschermen', pt: 'Ajuda a proteger a floresta tropical',
    },
  },
  {
    id: 'cookies', verdict: 'flag', evidenceType: 'ingredients', revealKey: 'noadded',
    sourceId: 'food-labels',
    promises: {
      en: 'No added sugar!', el: 'Χωρίς πρόσθετη ζάχαρη!',
      nl: 'Zonder toegevoegde suikers!', pt: 'Sem açúcares adicionados!',
    },
  },
  {
    id: 'yoghurt', verdict: 'flag', evidenceType: 'ingredients', revealKey: 'descending',
    sourceId: 'food-labels',
    promises: {
      en: 'Packed with strawberries!', el: 'Γεμάτο φράουλες!',
      nl: 'Boordevol aardbeien!', pt: 'Cheio de morangos!',
    },
  },
  {
    id: 'oil', verdict: 'flag', evidenceType: 'claim', revealKey: 'greenpack',
    sourceId: 'greenwashing-red-flags',
    promises: {
      en: 'A greener choice', el: 'Μια πιο πράσινη επιλογή',
      nl: 'Een groenere keuze', pt: 'Uma escolha mais verde',
    },
  },
  {
    id: 'oats', verdict: 'trust', evidenceType: 'seal', revealKey: 'realseal',
    sourceId: 'greenwashing-red-flags',
    promises: {
      en: 'Rainforest Alliance Certified', el: 'Πιστοποίηση Rainforest Alliance',
      nl: 'Rainforest Alliance-gecertificeerd', pt: 'Certificado pela Rainforest Alliance',
    },
  },
  {
    id: 'bread', verdict: 'trust', evidenceType: 'ingredients', revealKey: 'labelmust',
    sourceId: 'food-labels',
    promises: {
      en: 'Wholegrain bread', el: 'Ψωμί ολικής',
      nl: 'Volkorenbrood', pt: 'Pão integral',
    },
  },
];

const SPOT_THE_FAKE_LOCALES = { en, el, nl, pt };


describe('Spot the Fake — PRODUCTS pool', () => {
  it('has at least 7 products', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(7);
  });

  it('every product has a valid verdict and a reveal that resolves to a source', () => {
    for (const p of PRODUCTS) {
      expect(['trust', 'flag']).toContain(p.verdict);
      const rev = PRODUCT_REVEALS[p.revealKey];
      expect(rev, `reveal for ${p.id}`).toBeTruthy();
      expect(SOURCES[rev.sourceId], `source ${rev.sourceId}`).toBeTruthy();
    }
  });

  it('pool contains at least 2 trust and at least 4 flag products', () => {
    expect(PRODUCTS.filter((p) => p.verdict === 'trust').length).toBeGreaterThanOrEqual(2);
    expect(PRODUCTS.filter((p) => p.verdict === 'flag').length).toBeGreaterThanOrEqual(4);
  });

  it('flag products carry a redFlagKey; trust products do not', () => {
    for (const p of PRODUCTS) {
      if (p.verdict === 'flag') expect(p.redFlagKey, p.id).toBeTruthy();
      else expect(p.redFlagKey ?? null, p.id).toBeNull();
    }
  });

  it.each(PRODUCT_SEMANTIC_CONTRACT)(
    '$id keeps its visible promise, verdict, evidence, rule, and source coherent',
    ({ id, verdict, evidenceType, revealKey, sourceId, promises }) => {
      const product = PRODUCTS.find((candidate) => candidate.id === id);
      expect(product, id).toBeTruthy();

      for (const [localeName, expectedPromise] of Object.entries(promises)) {
        expect(
          SPOT_THE_FAKE_LOCALES[localeName].spotthefake[`front_${id}`],
          `${localeName} ${id} promise`,
        ).toBe(expectedPromise);
      }

      expect(product).toMatchObject({
        frontKey: `spotthefake.front_${id}`,
        verdict,
        evidenceType,
        revealKey,
      });
      expect(PRODUCT_REVEALS[revealKey]?.sourceId, `${id} source`).toBe(sourceId);
    },
  );

  it.each([
    ['en', 'Rainforest Alliance seal, checked by independent auditors'],
    ['el', 'Σφραγίδα Rainforest Alliance, ελεγμένη από ανεξάρτητους ελεγκτές'],
    ['nl', 'Rainforest Alliance-keurmerk, gecontroleerd door onafhankelijke controleurs'],
    ['pt', 'Selo Rainforest Alliance, verificado por auditores independentes'],
  ])('%s names the certification programme in the oats seal evidence', (localeName, label) => {
    expect(SPOT_THE_FAKE_LOCALES[localeName].spotthefake.seal_real).toBe(label);
  });
});

describe('Spot the Fake — PRODUCT_REVEALS verbatim quotes', () => {
  it('intro and win reveals exist and resolve to sources', () => {
    for (const key of ['intro', 'win']) {
      expect(PRODUCT_REVEALS[key]).toBeTruthy();
      expect(SOURCES[PRODUCT_REVEALS[key].sourceId]).toBeTruthy();
    }
  });

  it('every reveal quote is a non-empty string', () => {
    for (const r of Object.values(PRODUCT_REVEALS)) {
      expect(typeof r.quote).toBe('string');
      expect(r.quote.length).toBeGreaterThan(0);
    }
  });

  // Compare the five greenwashing warning signs with the source quotations.
  it('locks the exact verbatim for every greenwashing-red-flags reveal', () => {
    expect(PRODUCT_REVEALS.intro).toMatchObject({
      sourceId: 'greenwashing-red-flags',
      quote: 'Greenwashing—making false or misleading claims about the environmental benefits of a product or practice—is easy to define but can be hard to spot.',
    });
    expect(PRODUCT_REVEALS.vague).toMatchObject({
      sourceId: 'greenwashing-red-flags',
      quote: "Words like 'eco-friendly' and 'natural' sound nice—but without proof, they mean nothing.",
    });
    expect(PRODUCT_REVEALS.greenpack).toMatchObject({
      sourceId: 'greenwashing-red-flags',
      quote: 'Green letters? Leafy imagery? Earthy vibes? …misleading packaging can fool you into thinking a product is more sustainable than it really is.',
    });
    expect(PRODUCT_REVEALS.toogood).toMatchObject({
      sourceId: 'greenwashing-red-flags',
      quote: 'If it sounds too good to be true, it usually is! No product is single-handedly saving the planet… Dig deeper and look for details and data.',
    });
    expect(PRODUCT_REVEALS.realseal).toMatchObject({
      sourceId: 'greenwashing-red-flags',
      quote: "A company can't just stick our certification seal on their products. We have a robust verification system… with checks by independent auditors.",
    });
  });
});

describe('buildDeck', () => {
  it('returns 6 unique products with >=2 trust and >=3 flag', () => {
    for (let i = 0; i < 30; i++) {
      const deck = buildDeck(6);
      expect(deck).toHaveLength(6);
      expect(new Set(deck.map((p) => p.id)).size).toBe(6);
      expect(deck.filter((p) => p.verdict === 'trust').length).toBeGreaterThanOrEqual(2);
      expect(deck.filter((p) => p.verdict === 'flag').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('always includes at least 3 products that need back-label evidence', () => {
    for (let i = 0; i < 30; i++) {
      const deck = buildDeck(6);
      expect(deck.filter((product) => product.requiresBackEvidence).length)
        .toBeGreaterThanOrEqual(3);
    }
  });
});

describe('judge', () => {
  it('is correct only when choice matches the product verdict', () => {
    const flagP = PRODUCTS.find((p) => p.verdict === 'flag');
    const trustP = PRODUCTS.find((p) => p.verdict === 'trust');
    expect(judge(flagP, 'flag')).toBe(true);
    expect(judge(flagP, 'trust')).toBe(false);
    expect(judge(trustP, 'trust')).toBe(true);
    expect(judge(trustP, 'flag')).toBe(false);
  });
});

describe('gradeSpotTheFake', () => {
  it('passes at >=60% accuracy and tiers correctly', () => {
    expect(gradeSpotTheFake({ correct: 6, total: 6 })).toEqual({ passed: true, tier: 'perfect' });
    expect(gradeSpotTheFake({ correct: 5, total: 6 })).toEqual({ passed: true, tier: 'great' });
    expect(gradeSpotTheFake({ correct: 4, total: 6 })).toEqual({ passed: true, tier: 'pass' });
    expect(gradeSpotTheFake({ correct: 3, total: 6 })).toEqual({ passed: false, tier: 'fail' });
    expect(gradeSpotTheFake({ correct: 0, total: 0 })).toEqual({ passed: false, tier: 'fail' });
  });
});

describe('scoreSpotTheFakeRun', () => {
  it.each([
    [{ firstTryCorrect: 6, recovered: 0, total: 6 }, { score: 100, passed: true, tier: 'perfect', stars: 3 }],
    [{ firstTryCorrect: 5, recovered: 1, total: 6 }, { score: 80, passed: true, tier: 'great', stars: 2 }],
    [{ firstTryCorrect: 4, recovered: 2, total: 6 }, { score: 70, passed: true, tier: 'pass', stars: 1 }],
    [{ firstTryCorrect: 3, recovered: 3, total: 6 }, { score: 60, passed: false, tier: 'fail', stars: 0 }],
  ])('scores %j by first-try and recovery outcomes', (run, expected) => {
    expect(scoreSpotTheFakeRun(run)).toEqual(expected);
  });

  it('returns the same result when the same outcomes are presented in a different order', () => {
    const scoreRun = (outcomes) => scoreSpotTheFakeRun({
      firstTryCorrect: outcomes.filter((outcome) => outcome === 'first-try').length,
      recovered: outcomes.filter((outcome) => outcome === 'recovered').length,
      total: outcomes.length,
    });

    const ordered = ['first-try', 'first-try', 'first-try', 'first-try', 'recovered', 'recovered'];
    const permuted = ['recovered', 'first-try', 'recovered', 'first-try', 'first-try', 'first-try'];
    expect(scoreRun(permuted)).toEqual(scoreRun(ordered));
  });

  it('exports the redesigned scoring values', () => {
    expect(POINTS_FIRST_TRY).toBe(15);
    expect(POINTS_RECOVERED).toBe(5);
    expect(BONUS_FLAWLESS).toBe(10);
  });

  it('clamps invalid counts without subtracting points', () => {
    expect(scoreSpotTheFakeRun({ firstTryCorrect: 99, recovered: -4, total: 6 })).toEqual({
      score: 100,
      passed: true,
      tier: 'perfect',
      stars: 3,
    });
    expect(scoreSpotTheFakeRun({ firstTryCorrect: -4, recovered: 99, total: 6 }).score).toBe(30);
  });

  it('limits recovered outcomes to the products left after first tries', () => {
    expect(scoreSpotTheFakeRun({ firstTryCorrect: 6, recovered: 6, total: 6 }).score).toBe(100);
  });
});

describe('Spot the Fake — child-facing clarity copy', () => {
  const locales = { en, el, nl, pt };

  it.each(Object.entries(locales))('%s names the progress and interpolates both counts', (name, locale) => {
    const label = locale.spotthefake?.progress_label;
    expect(label, `${name} progress label`).toBeTruthy();
    expect(label).toContain('{{done}}');
    expect(label).toContain('{{total}}');
  });

  it.each(Object.entries(locales))('%s states the correct trust and flag answer explicitly', (name, locale) => {
    const copy = locale.spotthefake;
    expect(copy?.correct_answer_trust, `${name} trust answer`).toBeTruthy();
    expect(copy?.correct_answer_flag, `${name} flag answer`).toBeTruthy();
    expect(copy.correct_answer_trust).toContain(copy.verdict_trust);
    expect(copy.correct_answer_flag).toContain(copy.verdict_flag);
  });

  it.each(Object.entries(locales))('%s explains that the source supports both keyboard and touch', (name, locale) => {
    const hint = locale.spotthefake?.source_hint || '';
    expect(hint, `${name} source shortcut`).toMatch(/S/);
    expect(hint, `${name} source touch hint`).toMatch(/tap|touch|άγγι|tik|toca/i);
  });

  it.each(Object.entries(locales))('%s has all result tiers and a concrete run summary', (name, locale) => {
    const results = locale.spotthefake?.results;
    expect(results, `${name} results`).toBeTruthy();
    for (const tier of ['perfect', 'great', 'pass', 'fail']) {
      expect(results?.[`tier_${tier}_title`], `${name} ${tier} title`).toBeTruthy();
      expect(results?.[`tier_${tier}_body`], `${name} ${tier} body`).toBeTruthy();
    }
    expect(results?.summary).toContain('{{correct}}');
    expect(results?.summary).toContain('{{total}}');
    expect(results?.summary).toContain('{{mistakes}}');
  });
});

describe('scoring constants', () => {
  it('reward is positive, penalty is positive', () => {
    expect(POINTS_CORRECT).toBeGreaterThan(0);
    expect(PENALTY_WRONG).toBeGreaterThan(0);
  });
});

describe('MISSION_SOURCES wiring', () => {
  it('SpotTheFake resolves to its 2 verified sources', () => {
    const srcs = getMissionSources('SpotTheFake');
    expect(srcs).toHaveLength(2);
    expect(srcs.map((s) => s.id)).toEqual(['greenwashing-red-flags', 'food-labels']);
  });
});

describe('authenticity guard + plain layer', () => {
  it('every reveal quote is verbatim in the source viewer (unescaped)', () => {
    // Before this guard existed, labelmust had silently dropped "net quantity…"
    // from the viewer's enumeration and nothing failed. Never again.
    for (const [id, r] of Object.entries(PRODUCT_REVEALS)) {
      expect(SOURCE_HTML.includes(verbatimCore(r.quote)), id).toBe(true);
    }
  });

  it('every reveal has a child-facing plain sentence (never a fragment)', () => {
    for (const [id, r] of Object.entries(PRODUCT_REVEALS)) {
      expectPlainSentence(r.plain, id);
    }
  });

  it('spotthefake.facts has a non-empty translation for every reveal in el/nl/pt', () => {
    for (const [lname, loc] of [['el', el], ['nl', nl], ['pt', pt]]) {
      for (const id of Object.keys(PRODUCT_REVEALS)) {
        const val = loc.spotthefake?.facts?.[id];
        expect(val, `${lname} missing spotthefake.facts.${id}`).toBeTruthy();
      }
    }
  });

  it('en.json has NO spotthefake.facts block (English falls back to plain)', () => {
    expect(en.spotthefake?.facts).toBeUndefined();
  });
});
