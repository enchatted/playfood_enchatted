import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  HUBS, CIRCULAR_NODES, RESOURCES, CIRCULAR_REVEALS,
  buildResourceSet, gradeCircularCity, loopValue,
  POINTS_CIRCULAR,
  PB_BOUNDARIES, PB_CONSOLES, PB_REVEALS, PB_LIMIT, PB_SAFE_KEYS, PB_POINTS_RECOVER,
  buildBoundaries, applyChoice, countTransgressed, gradePlanetaryBoundaries,
  planetaryScoreForTransgressed, planetaryStarsForTransgressed,
  scoreForRecovery, summarizePlanetaryChoice, PB_DISPLAY_ORDER, displayOptions,
  choiceEffectChanges, PB_APPLY,
} from './circular.js';
import * as circularExports from './circular.js';
import { getBoundaryLabelLayout, getChoiceAffectedBoundaryLabels } from '../games/engine/planetaryBoundariesRenderer.js';
import { SOURCES, getMissionSources, MISSION_SOURCES } from './sources.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

describe('Circular City — HUBS', () => {
  it('has 4 circular hubs + exactly 1 landfill leak', () => {
    expect(HUBS).toHaveLength(5);
    expect(HUBS.filter((h) => h.isLeak)).toHaveLength(1);
    expect(HUBS.find((h) => h.isLeak).key).toBe('landfill');
    expect(CIRCULAR_NODES).toEqual(['repair', 'share', 'recycle', 'compost']);
  });
});

describe('Circular City — RESOURCES pool', () => {
  it('has at least 12 resources, each routed to a circular node', () => {
    expect(RESOURCES.length).toBeGreaterThanOrEqual(12);
    for (const r of RESOURCES) {
      expect(CIRCULAR_NODES).toContain(r.correctNode);
      expect(typeof r.emoji).toBe('string');
    }
  });

  it('covers every circular node at least twice', () => {
    for (const node of CIRCULAR_NODES) {
      expect(RESOURCES.filter((r) => r.correctNode === node).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Circular City — CIRCULAR_REVEALS source wiring', () => {
  // Source WIRING only — NOT fact-content (the verbatim wording is partner-verified, not
  // asserted here). repair's reveal was dropped (misleading 40% stat).
  it('every present reveal resolves to a registered source', () => {
    for (const [key, rev] of Object.entries(CIRCULAR_REVEALS)) {
      expect(typeof rev.quote, key).toBe('string');
      expect(rev.quote.length, key).toBeGreaterThan(0);
      expect(SOURCES[rev.sourceId], `source ${rev.sourceId}`).toBeTruthy();
    }
  });

  it('covers repair/share/recycle/compost + intro/win/landfill', () => {
    for (const key of ['repair', 'share', 'recycle', 'compost', 'landfill', 'intro', 'win']) {
      expect(CIRCULAR_REVEALS[key], `reveal ${key}`).toBeTruthy();
    }
    // the old EMF "40%" (a price discount) must never come back on the repair card
    expect(CIRCULAR_REVEALS.repair.quote).not.toMatch(/40/);
    expect(CIRCULAR_REVEALS.repair.plain).not.toMatch(/40/);
  });

  // Check the repair card text against the source and the separate explanation on the card.
  it('locks the repair card and the two leads in 4 languages', () => {
    expect(CIRCULAR_REVEALS.repair).toMatchObject({
      sourceId: 'circular-economy-rs',
      quote: 'R0 Refuse, R1 Rethink, R2 Reduce, R3 Reuse, R4 Repair, R5 Refurbish, R6 Remanufacture, R7 Repurpose, R8 Recycle and R9 Recover.',
      plain: 'Reusing and repairing keep things in use. In the list of 10 ways, they come before recycling.',
    });
    expect(el.circularcity.facts.repair).toBe('Η επαναχρησιμοποίηση και η επισκευή κρατούν τα πράγματα σε χρήση. Στη λίστα με τους 10 τρόπους, βρίσκονται πριν από την ανακύκλωση.');
    expect(el.circularcity.repair_lead).toBe('Πριν πάρεις κάτι καινούργιο, σκέψου αν το χρειάζεσαι ή αν μπορείς να χρησιμοποιήσεις ξανά κάτι που έχεις.');
    expect(el.circularcity.win_lead).toBe('Στο σπίτι, στο σχολείο ή στη γειτονιά, μπορείς να ανταλλάξεις ένα βιβλίο σε καλή κατάσταση ή να επισκευάσεις ένα σκισμένο ρούχο με βοήθεια. Το Άμστερνταμ είναι ένα παράδειγμα πόλης:');
    for (const L of [en, el, nl, pt]) {
      for (const k of ['win_lead', 'repair_lead']) {
        expect(L.circularcity[k], k).toBeTruthy();
        expect(L.circularcity[k]).not.toMatch(/\{\{|R[0-9]/); // our lines: no placeholders, no R-numbers
      }
      // the transfer line never claims "no landfill was ever tried"
      expect(L.circularcity.win_lead).not.toMatch(/χωματερή|landfill|stortplaats|aterro/i);
    }
    for (const L of [el, nl, pt]) expect(L.circularcity.facts.repair).not.toMatch(/R[0-9]|40/);
  });

  // Compare all six quotations with their reference passages.
  it('locks the exact verbatim + source for every reveal', () => {
    expect(CIRCULAR_REVEALS.intro).toMatchObject({
      sourceId: 'circular-economy-rs',
      quote: 'going beyond the classic 3Rs, the 10R framework outlines common circular economy actions to keep products and materials in use and reduce waste.',
    });
    expect(CIRCULAR_REVEALS.share).toMatchObject({
      sourceId: 'circular-city-amsterdam',
      quote: 'sharing household items, space, modes of transport, and even food.',
    });
    expect(CIRCULAR_REVEALS.recycle).toMatchObject({
      sourceId: 'circular-city-amsterdam',
      quote: 'emissions related to material use make up 78% of Amsterdam\u2019s total CO2 emissions.',
    });
    expect(CIRCULAR_REVEALS.compost).toMatchObject({
      sourceId: 'composting-home',
      quote: 'Composting is nature\u2019s way of recycling.',
    });
    expect(CIRCULAR_REVEALS.landfill).toMatchObject({
      sourceId: 'linear-circular-food',
      quote: 'Our current food system uses the linear economic model of \u2018take-produce-consume-discard\u2019, which assumes that economic growth can be perpetuated based on an abundance of resources and unlimited waste disposal.',
    });
    expect(CIRCULAR_REVEALS.win).toMatchObject({
      sourceId: 'circular-city-amsterdam',
      quote: 'the first city in the world to commit to becoming a 100% circular economy by 2050, aiming to halve its use of virgin materials by 2030.',
    });
  });
});

describe('buildResourceSet', () => {
  it('returns 8 unique resources with >=1 per circular node', () => {
    for (let i = 0; i < 30; i++) {
      const set = buildResourceSet(8);
      expect(set).toHaveLength(8);
      expect(new Set(set.map((r) => r.id)).size).toBe(8);
      for (const node of CIRCULAR_NODES) {
        expect(set.filter((r) => r.correctNode === node).length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('gradeCircularCity', () => {
  it('passes at >=60% accuracy and tiers correctly', () => {
    expect(gradeCircularCity({ correct: 8, total: 8, leaks: 0 })).toEqual({ passed: true, tier: 'perfect' });
    expect(gradeCircularCity({ correct: 7, total: 8, leaks: 1 })).toEqual({ passed: true, tier: 'great' });
    expect(gradeCircularCity({ correct: 5, total: 8, leaks: 1 })).toEqual({ passed: true, tier: 'pass' });
    expect(gradeCircularCity({ correct: 4, total: 8, leaks: 2 })).toEqual({ passed: false, tier: 'fail' });
    expect(gradeCircularCity({ correct: 0, total: 0, leaks: 0 })).toEqual({ passed: false, tier: 'fail' });
  });
});

describe('loopValue', () => {
  it('maps correct/total to a 0-100 meter', () => {
    expect(loopValue(0, 8)).toBe(0);
    expect(loopValue(4, 8)).toBe(50);
    expect(loopValue(8, 8)).toBe(100);
    expect(loopValue(0, 0)).toBe(0);
  });
});

describe('scoring — teach-don\'t-punish', () => {
  it('rewards correct routing and exposes NO score penalties', () => {
    expect(POINTS_CIRCULAR).toBeGreaterThan(0);
    // Wrong hub + landfill carry no −X slap (parity with Fridge/Compost). The landfill is a
    // SYSTEMS consequence (resource leaks out of the loop), not a penalty constant.
    expect(circularExports.PENALTY_WRONG, 'PENALTY_WRONG removed').toBeUndefined();
    expect(circularExports.LEAK_PENALTY, 'LEAK_PENALTY removed').toBeUndefined();
  });
});

describe('MISSION_SOURCES wiring', () => {
  it('CircularCity resolves to its 4 verified sources', () => {
    const srcs = getMissionSources('CircularCity');
    expect(srcs).toHaveLength(4);
    expect(srcs.map((s) => s.id)).toEqual(['circular-economy-rs', 'circular-city-amsterdam', 'linear-circular-food', 'composting-home']);
  });
});

describe('Planetary Boundaries — PB_BOUNDARIES', () => {
  it('has the 9 real boundaries with exactly 2 safe at start', () => {
    expect(PB_BOUNDARIES).toHaveLength(9);
    expect(PB_SAFE_KEYS.slice().sort()).toEqual(['aerosols', 'ozone']);
  });

  it('buildBoundaries starts at the authentic 7-of-9 transgressed', () => {
    const b = buildBoundaries();
    expect(b).toHaveLength(9);
    expect(countTransgressed(b)).toBe(7);
    expect(b.filter((x) => x.value <= x.limit).map((x) => x.key).sort()).toEqual(['aerosols', 'ozone']);
  });
});

describe('Planetary Boundaries — PB_CONSOLES', () => {
  it('has 4 consoles, each with exactly 2 options carrying effects + a reveal', () => {
    expect(PB_CONSOLES).toHaveLength(4);
    for (const c of PB_CONSOLES) {
      expect(c.options).toHaveLength(2);
      for (const o of c.options) {
        expect(Object.keys(o.effects).length).toBeGreaterThanOrEqual(1);
        for (const k of Object.keys(o.effects)) {
          expect(PB_BOUNDARIES.map((b) => b.key)).toContain(k);
        }
        expect(PB_REVEALS[o.revealKey], `reveal ${o.revealKey}`).toBeTruthy();
      }
    }
  });
});

describe('Planetary Boundaries — PB_REVEALS verbatim quotes', () => {
  it('intro/crossing/lifesupport/doughnut/win all resolve to a source', () => {
    for (const key of ['intro', 'crossing', 'lifesupport', 'doughnut', 'win']) {
      const rev = PB_REVEALS[key];
      expect(rev, key).toBeTruthy();
      expect(typeof rev.quote).toBe('string');
      expect(rev.quote.length).toBeGreaterThan(0);
      expect(SOURCES[rev.sourceId], rev.sourceId).toBeTruthy();
    }
  });

  // Check that the quotation is contained in a single passage from the Stockholm source.
  it('locks the exact verbatim quote + source for every reveal', () => {
    expect(PB_REVEALS.intro).toMatchObject({
      sourceId: 'planetary-boundaries',
      quote: 'Today, seven out of nine boundaries have been transgressed.',
    });
    expect(PB_REVEALS.crossing).toMatchObject({
      sourceId: 'planetary-boundaries',
      quote: 'Crossing boundaries increases the risk of generating large-scale abrupt or irreversible environmental changes.',
    });
    expect(PB_REVEALS.lifesupport).toMatchObject({
      sourceId: 'planetary-boundaries',
      quote: 'Stay within them, and the Earth stays our dependable home — breach them, and we risk irreversible damage to our very own life support system.',
    });
    expect(PB_REVEALS.doughnut).toMatchObject({
      sourceId: 'circular-city-amsterdam',
      quote: 'Its five-year circular economy strategy to achieve this goal is based on Kate Raworth’s Doughnut Economics model, which achieves economic development while staying within planetary boundaries.',
    });
    expect(PB_REVEALS.win).toMatchObject({
      sourceId: 'planetary-boundaries',
      quote: "To safeguard the Earth's resilience and stability, we must bring the planet back into its Planetary Boundaries.",
    });
  });
});

describe('scoreForRecovery — teach-don\'t-punish', () => {
  it('earns points for recovery but never deducts for a worsening choice', () => {
    expect(PB_POINTS_RECOVER).toBeGreaterThan(0);
    expect(scoreForRecovery(2)).toBe(2 * PB_POINTS_RECOVER);
    expect(scoreForRecovery(1)).toBe(PB_POINTS_RECOVER);
    expect(scoreForRecovery(0)).toBe(0);
    // A high-impact choice raises the transgressed count (its intrinsic consequence);
    // it carries NO negative score slap — parity with Fridge/Compost/CircularCity.
    expect(scoreForRecovery(-1)).toBe(0);
    expect(scoreForRecovery(-3)).toBe(0);
  });
});

describe('applyChoice / countTransgressed — systemic trade-offs', () => {
  it('all-mindful (B) recovers down to 1 transgressed for an achievable perfect tier', () => {
    let b = buildBoundaries();
    for (const c of PB_CONSOLES) b = applyChoice(b, c.options.find((o) => o.id === 'B').effects);
    expect(countTransgressed(b)).toBe(1);
  });

  it('all-high-impact (A) breaches further (>= 8 transgressed)', () => {
    let b = buildBoundaries();
    for (const c of PB_CONSOLES) b = applyChoice(b, c.options.find((o) => o.id === 'A').effects);
    expect(countTransgressed(b)).toBeGreaterThanOrEqual(8);
  });

  it('clamps values to 0..100', () => {
    const b = applyChoice(buildBoundaries(), { climate: 999, ozone: -999 });
    expect(b.find((x) => x.key === 'climate').value).toBe(100);
    expect(b.find((x) => x.key === 'ozone').value).toBe(0);
  });
});

describe('gradePlanetaryBoundaries', () => {
  it('passes at <=3 transgressed and tiers correctly', () => {
    expect(gradePlanetaryBoundaries({ transgressed: 1 })).toEqual({ passed: true, tier: 'perfect' });
    expect(gradePlanetaryBoundaries({ transgressed: 2 })).toEqual({ passed: true, tier: 'great' });
    expect(gradePlanetaryBoundaries({ transgressed: 3 })).toEqual({ passed: true, tier: 'pass' });
    expect(gradePlanetaryBoundaries({ transgressed: 4 })).toEqual({ passed: false, tier: 'fail' });
    expect(gradePlanetaryBoundaries({ transgressed: 8 })).toEqual({ passed: false, tier: 'fail' });
  });
});

describe('planetaryStarsForTransgressed', () => {
  it.each([
    [1, 3],
    [2, 2],
    [3, 1],
    [4, 0],
    [7, 0],
  ])('maps %i transgressed boundaries to the expected live-star tier', (transgressed, stars) => {
    expect(planetaryStarsForTransgressed(transgressed)).toBe(stars);
  });
});

describe('Planetary Boundaries reachable outcomes and score order', () => {
  it('makes fail, pass, great and perfect reachable across the 16 decision paths', () => {
    const tiers = new Set();
    for (let mask = 0; mask < 16; mask += 1) {
      let boundaries = buildBoundaries();
      PB_CONSOLES.forEach((console, index) => {
        boundaries = applyChoice(boundaries, console.options[(mask >> index) & 1].effects);
      });
      tiers.add(gradePlanetaryBoundaries({ transgressed: countTransgressed(boundaries) }).tier);
    }
    expect(tiers).toEqual(new Set(['fail', 'pass', 'great', 'perfect']));
  });

  it('always awards more points for a better final planetary state', () => {
    expect(planetaryScoreForTransgressed(1)).toBeGreaterThan(planetaryScoreForTransgressed(2));
    expect(planetaryScoreForTransgressed(2)).toBeGreaterThan(planetaryScoreForTransgressed(3));
    expect(planetaryScoreForTransgressed(3)).toBeGreaterThan(planetaryScoreForTransgressed(4));
    expect(planetaryScoreForTransgressed(7)).toBe(0);
  });
});

describe('summarizePlanetaryChoice', () => {
  it('reports improvement, no change, and worsening through safe-boundary counts', () => {
    expect(summarizePlanetaryChoice(7, 5, 9)).toEqual({
      tone: 'improved', beforeSafe: 2, afterSafe: 4,
    });
    expect(summarizePlanetaryChoice(7, 7, 9)).toEqual({
      tone: 'unchanged', beforeSafe: 2, afterSafe: 2,
    });
    expect(summarizePlanetaryChoice(7, 8, 9)).toEqual({
      tone: 'caution', beforeSafe: 2, afterSafe: 1,
    });
  });
});

describe('MISSION_SOURCES wiring (PB)', () => {
  it('PlanetaryBoundaries resolves to its 2 verified sources', () => {
    const srcs = getMissionSources('PlanetaryBoundaries');
    expect(srcs).toHaveLength(2);
    expect(srcs.map((s) => s.id)).toEqual(['planetary-boundaries', 'circular-city-amsterdam']);
  });
});

// Look up each displayed quotation in the source the player can open.
const SOURCE_HTML_RAW = readFileSync(
  fileURLToPath(new URL('../../public/source.html', import.meta.url)), 'utf8');
const SOURCE_HTML = SOURCE_HTML_RAW.replace(/\\'/g, "'");
const LOCALES = { el, nl, pt };
const ALL_LOCALES = { en, el, nl, pt };
const verbatimCore = (q) => q.replace(/^[…\s]+/, '').replace(/[…\s]+$/, '').trim();

function expectPlainSentence(plain, label) {
  expect(typeof plain, label).toBe('string');
  expect(plain.trim().length, label).toBeGreaterThan(0);
  expect(plain, `${label} starts mid-clause`).not.toMatch(/^…/);
  expect(plain, `${label} ends in . ! or ?`).toMatch(/[.!?]$/);
  expect(plain, `${label} has no em or en dash`).not.toMatch(/[—–]/);
}

describe('Island 4 — Content Authenticity', () => {
  it('every Circular City quote appears verbatim inside public/source.html', () => {
    for (const [key, rev] of Object.entries(CIRCULAR_REVEALS)) {
      for (const part of rev.quote.split('…').map(verbatimCore).filter(Boolean)) {
        expect(SOURCE_HTML, `circularcity.${key}: "${part.slice(0, 60)}" missing from the viewer`)
          .toContain(part);
      }
    }
  });

  it('every Planetary Boundaries quote appears verbatim inside public/source.html', () => {
    for (const [key, rev] of Object.entries(PB_REVEALS)) {
      for (const part of rev.quote.split('…').map(verbatimCore).filter(Boolean)) {
        expect(SOURCE_HTML, `planetary.${key}: "${part.slice(0, 60)}" missing from the viewer`)
          .toContain(part);
      }
    }
  });

  it('every reveal carries a child-facing plain sentence', () => {
    for (const [key, rev] of Object.entries(CIRCULAR_REVEALS)) expectPlainSentence(rev.plain, `circularcity.${key}`);
    for (const [key, rev] of Object.entries(PB_REVEALS)) expectPlainSentence(rev.plain, `planetary.${key}`);
  });

  it('el, nl and pt translate every plain sentence', () => {
    for (const [code, json] of Object.entries(LOCALES)) {
      for (const key of Object.keys(CIRCULAR_REVEALS)) {
        const s = json.circularcity?.facts?.[key];
        expect(s, `${code}.circularcity.facts.${key}`).toBeTruthy();
        expectPlainSentence(s, `${code}.circularcity.${key}`);
      }
      for (const key of Object.keys(PB_REVEALS)) {
        const s = json.planetary?.facts?.[key];
        expect(s, `${code}.planetary.facts.${key}`).toBeTruthy();
        expectPlainSentence(s, `${code}.planetary.${key}`);
      }
    }
  });

  it('the nine ring labels are translated, not left in English', () => {
    for (const b of PB_BOUNDARIES) {
      const key = b.key;
      const enLabel = en.planetary[`bs_${key}`];
      expect(enLabel, `en.bs_${key}`).toBeTruthy();
      for (const [code, json] of Object.entries(LOCALES)) {
        const label = json.planetary[`bs_${key}`];
        expect(label, `${code}.bs_${key}`).toBeTruthy();
        if (code === 'el') {
          // Greek must not be Latin script: that was the defect (nine English words on the ring).
          expect(label, `el.bs_${key} still English`).toMatch(/[Ͱ-Ͽ]/);
        }
      }
    }
  });
});

describe('Planetary Boundaries — ring and «Affects» labels (03/10/2026)', () => {
  // Check the translated short labels against the nine named boundary processes.
  const EXPECTED = {
    el: { climate: 'Κλίμα', biosphere: 'Βιοποικιλότητα', land: 'Χρήση γης', freshwater: 'Γλυκό νερό', biogeochemical: 'Άζωτο και φώσφορος', ocean: 'Οξίνιση ωκεανών', novel: 'Νέες ουσίες', aerosols: 'Αιωρούμενα σωματίδια', ozone: 'Στιβάδα του όζοντος' },
    en: { climate: 'Climate', biosphere: 'Biodiversity', land: 'Land use', freshwater: 'Fresh water', biogeochemical: 'Nitrogen & phosphorus', ocean: 'Ocean acidification', novel: 'New substances', aerosols: 'Air particles', ozone: 'Ozone layer' },
    nl: { climate: 'Klimaat', biosphere: 'Biodiversiteit', land: 'Landgebruik', freshwater: 'Zoet water', biogeochemical: 'Stikstof en fosfor', ocean: 'Verzuring oceaan', novel: 'Nieuwe stoffen', aerosols: 'Fijnstof', ozone: 'Ozonlaag' },
    pt: { climate: 'Clima', biosphere: 'Biodiversidade', land: 'Uso do solo', freshwater: 'Água doce', biogeochemical: 'Azoto e fósforo', ocean: 'Acidificação dos oceanos', novel: 'Novas substâncias', aerosols: 'Partículas no ar', ozone: 'Camada de ozono' },
  };
  const shorts = (json) => PB_BOUNDARIES.map((b) => ({ key: b.key, short: json.planetary[`bs_${b.key}`] }));

  it('the nine ring labels match the reference table in 4 languages', () => {
    for (const [code, json] of Object.entries(ALL_LOCALES)) {
      const got = Object.fromEntries(PB_BOUNDARIES.map((b) => [b.key, json.planetary[`bs_${b.key}`]]));
      expect(got, code).toEqual(EXPECTED[code]);
    }
  });

  it('the narrow or place-only labels are gone (Γη, Wildlife, Air dust, Ocean, Solo, Poeira…)', () => {
    const old = { el: ['Γη', 'Ωκεανοί', 'Σκόνη'], en: ['Wildlife', 'Land', 'Ocean', 'Air dust'], nl: ['Land', 'Oceaan'], pt: ['Solo', 'Oceano', 'Poeira'] };
    for (const [code, words] of Object.entries(old)) {
      const labels = Object.values(EXPECTED[code]);
      for (const w of words) {
        expect(PB_BOUNDARIES.map((b) => ALL_LOCALES[code].planetary[`bs_${b.key}`]), `${code} ${w}`).not.toContain(w);
      }
      expect(labels.length).toBe(9);
    }
  });

  it('the English b_* full names stay the SRC terms (not shown in the game, unchanged)', () => {
    expect(PB_BOUNDARIES.map((b) => en.planetary[`b_${b.key}`])).toEqual([
      'Climate change', 'Biosphere integrity', 'Land-system change', 'Freshwater change',
      'Biogeochemical flows', 'Ocean acidification', 'Novel entities',
      'Atmospheric aerosol loading', 'Stratospheric ozone depletion',
    ]);
  });

  it('every «Affects» line of the 4 consoles × 2 options uses the same new labels, in board order', () => {
    for (const [code, json] of Object.entries(ALL_LOCALES)) {
      const boundaries = shorts(json);
      for (const con of PB_CONSOLES) {
        for (const opt of con.options) {
          const want = PB_BOUNDARIES.filter((b) => (opt.effects || {})[b.key]).map((b) => EXPECTED[code][b.key]);
          expect(getChoiceAffectedBoundaryLabels(boundaries, opt), `${code} ${con.key} ${opt.id}`).toEqual(want);
        }
      }
    }
    // Explicit example: the Food console uses the same Greek boundary labels.
    const food = PB_CONSOLES.find((c) => c.key === 'food');
    expect(getChoiceAffectedBoundaryLabels(shorts(el), food.options[0]))
      .toEqual(['Κλίμα', 'Βιοποικιλότητα', 'Χρήση γης', 'Γλυκό νερό', 'Άζωτο και φώσφορος']);
  });

  it('the ring splits each label into at most 3 lines (one word per line)', () => {
    for (const [code, json] of Object.entries(ALL_LOCALES)) {
      const layout = getBoundaryLabelLayout({ x: 0, y: 0 }, shorts(json));
      expect(layout).toHaveLength(9);
      for (const [i, l] of layout.entries()) {
        expect(l.lines.join(' '), code).toBe(EXPECTED[code][PB_BOUNDARIES[i].key]);
        expect(l.lines.length, `${code} ${l.lines.join(' ')}`).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('Planetary Boundaries — no preselection, alternating side (05/10/2026)', () => {
  const sumEffects = (o) => Object.values(o.effects || {}).reduce((a, b) => a + b, 0);

  it('the mindful option (B) is on the left for food/transport and on the right for energy/materials', () => {
    expect(PB_DISPLAY_ORDER).toEqual({ food: ['B', 'A'], transport: ['B', 'A'], energy: ['A', 'B'], materials: ['A', 'B'] });
    for (const con of PB_CONSOLES) {
      const shown = displayOptions(con.key, con.options);
      expect(shown.map((o) => o.id), con.key).toEqual(PB_DISPLAY_ORDER[con.key]);
      // the WHOLE option moves: same objects (description key, effects, reveal), nothing lost
      expect(new Set(shown)).toEqual(new Set(con.options));
    }
  });

  it('ids stay semantic: B is always the mindful choice, whatever its side', () => {
    for (const con of PB_CONSOLES) {
      const a = con.options.find((o) => o.id === 'A'); const b = con.options.find((o) => o.id === 'B');
      expect(sumEffects(b), con.key).toBeLessThan(0);
      expect(sumEffects(a), con.key).toBeGreaterThan(0);
      expect(a.revealKey).toBe('crossing');
    }
  });

  it('the correct answer is no longer always on the same side', () => {
    const sides = PB_CONSOLES.map((c) => displayOptions(c.key, c.options).findIndex((o) => o.id === 'B'));
    expect(sides).toContain(0);
    expect(sides).toContain(1);
  });

  it('hint names the real controls, and «choose first» exists, in 4 languages', () => {
    for (const [code, json] of Object.entries(ALL_LOCALES)) {
      const p = json.planetary;
      expect(p.choose_hint, code).toMatch(/←/); expect(p.choose_hint, code).toMatch(/→/);
      expect(p.choose_hint, code).toMatch(/Enter/); expect(p.choose_hint, code).toMatch(/\bA\b/);
      expect(p.choose_first, code).toMatch(/←/); expect(p.choose_first, code).toMatch(/→/);
    }
    expect(el.planetary.choose_hint).toBe('Διάλεξε με ← ή →, μετά Enter, Space ή το κουμπί A για επιβεβαίωση');
    expect(el.planetary.choose_first).toBe('Πρώτα διάλεξε με ← ή →');
  });
});

describe('Island 4 — clear controls, progress and results', () => {
  const touchWords = { en: /tap/i, el: /άγγιξ/i, nl: /tik/i, pt: /toca/i };

  it('Circular City exposes undo, honest routed/kept progress and result tiers', () => {
    for (const [code, json] of Object.entries(ALL_LOCALES)) {
      const copy = json.circularcity;
      expect(copy.drop_prompt, code).toContain('{{item}}');
      for (const key of ['routed_progress', 'kept_progress']) {
        expect(copy[key], `${code}.${key}`).toContain('{{current}}');
        expect(copy[key], `${code}.${key}`).toContain('{{total}}');
      }
      expect(copy.source_hint, code).toMatch(touchWords[code]);
      for (const tier of ['perfect', 'great', 'pass', 'fail']) {
        expect(copy.results?.[`tier_${tier}_title`], `${code}.${tier}.title`).toBeTruthy();
        expect(copy.results?.[`tier_${tier}_body`], `${code}.${tier}.body`).toBeTruthy();
      }
      expect(copy.results?.summary, code).toContain('{{correct}}');
      expect(copy.results?.summary, code).toContain('{{total}}');
      expect(copy.results?.summary, code).toContain('{{firstTryCount}}');
    }
  });

  it('Planetary Boundaries exposes decision progress, touch sources and result tiers', () => {
    for (const [code, json] of Object.entries(ALL_LOCALES)) {
      const copy = json.planetary;
      expect(copy.decision_progress, code).toContain('{{current}}');
      expect(copy.decision_progress, code).toContain('{{total}}');
      expect(copy.source_hint, code).toMatch(touchWords[code]);
      for (const tier of ['perfect', 'great', 'pass', 'fail']) {
        expect(copy.results?.[`tier_${tier}_title`], `${code}.${tier}.title`).toBeTruthy();
        expect(copy.results?.[`tier_${tier}_body`], `${code}.${tier}.body`).toBeTruthy();
      }
      expect(copy.results?.summary, code).toContain('{{safe}}');
      expect(copy.results?.summary, code).toContain('{{total}}');
      expect(copy.results?.summary, code).toContain('{{transgressed}}');
    }
  });
});

// Check garment conditions, the introductory sorting rule and the response to an incorrect delivery.
describe('Circular City — clothes', () => {
  const LOCS = { en, el, nl, pt };
  const { RESOURCES, WRONG_HINT_KEYS, wrongDeliveryText } = circularExports;
  const get = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj);

  it('keeps the same destinations (jacket → repair, shirt → share)', () => {
    expect(RESOURCES.find((r) => r.id === 'jacket').correctNode).toBe('repair');
    expect(RESOURCES.find((r) => r.id === 'shirt').correctNode).toBe('share');
    expect(RESOURCES.map((r) => `${r.id}:${r.correctNode}`)).toHaveLength(12);
  });

  it('hints only the two clothes', () => {
    expect(Object.keys(WRONG_HINT_KEYS).sort()).toEqual(['jacket', 'shirt']);
    const hints = { jacket: 'J.', shirt: 'S.' };
    expect(wrongDeliveryText('jacket', 'Try!', hints)).toBe('J. Try!');
    expect(wrongDeliveryText('shirt', 'Try!', hints)).toBe('S. Try!');
    for (const id of ['books', 'toys', 'chair', 'bike', 'bottle', 'peel']) {
      expect(wrongDeliveryText(id, 'Try!', hints)).toBe('Try!');
    }
  });

  it.each(Object.keys(LOCS))('%s: name, intro rule and hints are present and aligned', (l) => {
    const L = LOCS[l];
    for (const key of Object.values(WRONG_HINT_KEYS)) {
      const v = get(L, key);
      expect(v, key).toBeTruthy();
      expect(v).not.toMatch(/\{\{/);
    }
    const shirtName = L.circularcity.res_shirt;
    const step2 = L.missionIntro.circularcity.step2;
    const goodState = { el: 'καλή κατάσταση', en: 'good condition', nl: 'goede staat', pt: 'bom estado' }[l];
    expect(shirtName).toContain(goodState);
    expect(step2).toContain(goodState);
    expect(get(L, WRONG_HINT_KEYS.shirt)).toContain(goodState);
    // the shirt hint names the hub label the child sees; the jacket hint names repair
    expect(get(L, WRONG_HINT_KEYS.shirt).toLowerCase()).toContain({ el: 'αντάλλαξ', en: 'reuse', nl: 'hergebruik', pt: 'reutilizar' }[l]);
    // "not damaged" is NOT extended to books / toys
    expect(L.circularcity.res_books).not.toContain(goodState);
    expect(L.circularcity.res_toys).not.toContain(goodState);
  });

  it('Greek copy is exactly the agreed wording', () => {
    expect(el.circularcity.res_shirt).toBe('μπλούζα που σου μίκρυνε, σε καλή κατάσταση');
    expect(el.missionIntro.circularcity.step2.endsWith(
      'Το σκισμένο μπουφάν θέλει επισκευή. Η μπλούζα που σου μίκρυνε, σε καλή κατάσταση, πάει για ανταλλαγή.',
    )).toBe(true);
    expect(el.circularcity.r_share).toBe('Ανταλλαγή');
    // The short Greek shirt hint must leave room for the collection point label.
    expect(el.circularcity.wrong_hint_shirt).toBe('Είναι σε καλή κατάσταση, αλλά σου μίκρυνε: αντάλλαξέ τη.');
    expect(el.circularcity.wrong_hint_jacket).toBe('Το μπουφάν είναι σκισμένο: θέλει επισκευή.');
  });
});

// Check the Engineer's closing line after all three island missions.
describe('Island 4 — mentor line after the three missions', () => {
  it('uses the approved wording in 4 languages', () => {
    expect(el.island.mentor_done_circular).toBe('Τα κατάφερες και στις τρεις αποστολές! Η γειτονιά σε ευχαριστεί. Κάθε φορά που κρατάς κάτι στον κύκλο, λιγότερα πράγματα καταλήγουν στη χωματερή. ♻️');
    expect(en.island.mentor_done_circular).toBe('You finished all three missions! The neighbourhood thanks you. Every time you keep something in the loop, fewer things end up in the landfill. ♻️');
    expect(nl.island.mentor_done_circular).toBe('Je hebt alle drie de missies gehaald! De buurt bedankt je. Elke keer dat je iets in de kringloop houdt, komen er minder spullen op de stortplaats terecht. ♻️');
    expect(pt.island.mentor_done_circular).toBe('Conseguiste as três missões! O bairro agradece-te. Sempre que manténs algo no ciclo, menos coisas acabam no aterro. ♻️');
  });
  it('no "owes a favour", no absolute "nothing goes to waste"', () => {
    for (const L of [en, el, nl, pt]) {
      expect(L.island.mentor_done_circular).not.toMatch(/χρωστάει|Τίποτα δεν πάει|Nothing goes to waste|niets meer verloren|nada se perde/);
      expect(L.island.mentor_done_circular).not.toMatch(/: [A-ZΑ-Ω]/); // no capital after a colon (old NL)
    }
  });
});

// Check the application step after the final console decision.
describe('neutral option texts, effects after the answer, application step', () => {
  const LOCALES = Object.fromEntries(['el', 'en', 'nl', 'pt'].map((c) => [c,
    JSON.parse(readFileSync(fileURLToPath(new URL(`../i18n/locales/${c}.json`, import.meta.url)), 'utf8')).planetary]));
  const KEYS = ['food_a', 'food_b', 'energy_a', 'energy_b', 'transport_a', 'transport_b', 'materials_a', 'materials_b'];

  it('the 8 option texts are one short sentence with no judgement / consequence words', () => {
    const BANNED = {
      el: ['ζεσταίνει', 'βλάπτει', 'ήπιο', 'βρόμικος', 'καθαρός', 'λιγότερο', 'περισσότερ', 'Θέλει', 'Έτσι'],
      en: ['warms', 'harms', 'kinder', 'dirtier', 'cleaner', 'less', 'more', 'uses', 'This'],
      nl: ['warmt', 'schaadt', 'vriendelijker', 'vuilere', 'schonere', 'minder', 'meer', 'kost', 'Dat'],
      pt: ['aquece', 'faz mal', 'suave', 'sujo', 'limpo', 'menos', 'mais', 'Gasta', 'Isto', 'Assim'],
    };
    for (const [code, L] of Object.entries(LOCALES)) {
      for (const k of KEYS) {
        expect(L[k].split(/[.!?]\s/).length, `${code} ${k} one sentence`).toBe(1);
        for (const w of BANNED[code]) expect(L[k], `${code} ${k} «${w}»`).not.toMatch(new RegExp(`(^|[^\\p{L}])${w}`, 'u'));
      }
    }
  });

  it('choiceEffectChanges compares the REAL values before / after, board order', () => {
    const pick = (key, id) => PB_CONSOLES.find((c) => c.key === key).options.find((o) => o.id === id).effects;
    const step = (b, key, id) => { const a = applyChoice(b, pick(key, id)); return { a, fx: choiceEffectChanges(b, a) }; };
    let b = buildBoundaries();
    let r = step(b, 'energy', 'B');
    expect(r.fx).toEqual({ better: ['climate', 'ocean'], worse: ['novel'] });
    r = step(buildBoundaries(), 'materials', 'B');
    expect(r.fx).toEqual({ better: ['climate', 'biosphere', 'land', 'novel'], worse: [] });
    r = step(buildBoundaries(), 'food', 'A');
    expect(r.fx).toEqual({ better: [], worse: ['climate', 'biosphere', 'land', 'freshwater', 'biogeochemical'] });
  });

  it('F1: on A/A/A/A Climate reaches the 100 clamp — the last step does NOT call it «worse»', () => {
    const pick = (key) => PB_CONSOLES.find((c) => c.key === key).options.find((o) => o.id === 'A').effects;
    let b = buildBoundaries();
    const climate = [b.find((x) => x.key === 'climate').value];
    let last;
    for (const key of ['food', 'energy', 'transport', 'materials']) {
      const a = applyChoice(b, pick(key));
      last = choiceEffectChanges(b, a);
      climate.push(a.find((x) => x.key === 'climate').value);
      b = a;
    }
    expect(climate).toEqual([78, 84, 96, 100, 100]);
    expect(last.worse).not.toContain('climate');
    expect(last.better).not.toContain('climate');
    // the raw effect still says +6 — the old sign-only split would have listed it
    expect(pick('materials').climate).toBe(6);
    // every key reported really changed value
    for (const k of last.worse) expect(applyChoice(applyChoice(applyChoice(buildBoundaries(), pick('food')), pick('energy')), pick('transport')).find((x) => x.key === k).value).toBeLessThan(b.find((x) => x.key === k).value);
  });

  it('choiceEffectChanges reports nothing for an unchanged state', () => {
    const b = buildBoundaries();
    expect(choiceEffectChanges(b, b)).toEqual({ better: [], worse: [] });
  });

  it('the effect lines say «in the game» in every language and keep the list slot', () => {
    const IN_GAME = { el: 'Στο παιχνίδι', en: 'In the game', nl: 'In het spel', pt: 'No jogo' };
    for (const [code, L] of Object.entries(LOCALES)) {
      for (const k of ['effects_better', 'effects_worse']) {
        expect(L[k].startsWith(IN_GAME[code]), `${code} ${k}`).toBe(true);
        expect(L[k]).toContain('{{list}}');
      }
    }
  });

  it('PB_APPLY: registered source, two options, the answer is one of them', () => {
    expect(PB_APPLY.sourceId).toBe('circular-city-amsterdam');
    expect(MISSION_SOURCES.PlanetaryBoundaries).toContain(PB_APPLY.sourceId);
    expect(PB_APPLY.options).toEqual(['keep', 'share']);
    expect(PB_APPLY.options).toContain(PB_APPLY.answer);
  });

  it('every PB_APPLY support passage appears verbatim inside public/source.html', () => {
    for (const [k, q] of Object.entries(PB_APPLY.support)) {
      expect(SOURCE_HTML.includes(q), `support.${k}`).toBe(true);
    }
  });

  it('the application step texts exist in 4 languages and never claim an achieved result', () => {
    const FIELDS = ['kicker', 'title', 'context', 'question', 'opt_keep', 'opt_share', 'hint',
      'right_head', 'other_head', 'explain', 'other_prefix', 'you', 'continue'];
    for (const [code, L] of Object.entries(LOCALES)) {
      for (const f of FIELDS) expect(typeof L.apply?.[f] === 'string' && L.apply[f].length > 0, `${code} apply.${f}`).toBe(true);
    }
    // the old overclaim («Amsterdam grows its economy while staying inside Earth’s limits») is
    // a statement about the Doughnut MODEL; the step words a commitment, never that result
    expect(LOCALES.el.apply.context).toContain('έχει δεσμευτεί');
    expect(LOCALES.en.apply.context).toContain('has committed');
    for (const L of Object.values(LOCALES)) {
      expect(L.apply.context).toContain('2050');
      expect(L.apply.explain).not.toMatch(/γι' αυτό|so that|that is why|daarom|por isso/i);
    }
  });
});
