import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  STORAGE_DESTINATIONS,
  STORAGE_IDS,
  FRIDGE_FOODS,
  FRIDGE_FACTS,
  STORAGE_SOURCE,
  TIER,
  gradePlacement,
  acceptedBins,
  factForDestination,
  acceptedFact,
  FRIDGE_INTRO_FACT,
} from './fridgeData.js';
import * as fridgeData from './fridgeData.js';
import { SOURCES, MISSION_SOURCES, getMissionSources } from './sources.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

// Authenticity guard (same shape as local.test.js): every quote a child can reach
// must exist in the pinned viewer. The viewer stores some passages as single-quoted
// JS strings, so unescape \' before matching or correct quotes fail for the wrong
// reason. Before this guard, 11 of 13 Island 3 quotes were absent and nothing failed.
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

describe('fridgeData — storage destinations', () => {
  it('has exactly the 4 directive destinations, in order', () => {
    expect(STORAGE_IDS).toEqual(['freezer', 'fridge', 'cupboard', 'compost']);
  });

  it('every sourced fact points to a registered source', () => {
    for (const d of STORAGE_DESTINATIONS) {
      if (d.fact) {
        expect(d.source).toBe(STORAGE_SOURCE);
        expect(SOURCES[d.source]).toBeTruthy();
      }
    }
  });

  it('compost is end-of-life: no fact, no source (decision 2026-06-15)', () => {
    const compost = STORAGE_DESTINATIONS.find((d) => d.id === 'compost');
    expect(compost.fact).toBeNull();
    expect(compost.source).toBeNull();
  });

  // VERBATIM locks — break the build if an EUFIC quote is silently edited.
  it('locks the EUFIC facts verbatim', () => {
    const factOf = (id) => STORAGE_DESTINATIONS.find((d) => d.id === id).fact;
    expect(factOf('freezer')).toBe(
      'freezing food does not kill bacteria but rather slows down their growth significantly.',
    );
    expect(factOf('fridge')).toBe(
      'The cool temperature (at a maximum of 4°C) slows down the growth of harmful microbes.',
    );
    expect(factOf('cupboard')).toBe(
      'Clean, dry and cool (below 25°C) shelves are the best place to store bread, dry food (in sealed bags or containers), unopened tins, jars and drinks.',
    );
  });

  // The MissionIntroCard fact must REUSE an already-locked SOLID pair,
  // never introduce a new claim. Derived from the freezer destination above.
  it('FRIDGE_INTRO_FACT reuses the SOLID freezer verbatim (no new claim)', () => {
    expect(FRIDGE_INTRO_FACT).toMatchObject({
      sourceId: STORAGE_SOURCE,
      quote: 'freezing food does not kill bacteria but rather slows down their growth significantly.',
      plain: FRIDGE_FACTS.freezer.plain,
    });
  });

  it('factForDestination resolves quotes and null for compost/unknown', () => {
    expect(factForDestination('fridge')).toContain('4°C');
    expect(factForDestination('compost')).toBeNull();
    expect(factForDestination('nope')).toBeNull();
  });
});

// Check the plain text on the card and the quotation behind the source chip.
describe('fridgeData — FRIDGE_FACTS quote/plain layers', () => {
  it('every quote is verbatim in the source viewer (unescaped)', () => {
    // Each source opened from a card must contain the displayed quotation.
    for (const [id, f] of Object.entries(FRIDGE_FACTS)) {
      expect(SOURCE_HTML.includes(verbatimCore(f.quote)), id).toBe(true);
    }
  });

  it('every quote sits in the viewer entry of the source its card points to', () => {
    // The chip opens ONE source: the quote must be in that entry, not anywhere in the file.
    const entryOf = (sourceId) => {
      const start = SOURCE_HTML.indexOf(`'${sourceId}': {`);
      expect(start, sourceId).toBeGreaterThan(-1);
      const next = SOURCE_HTML.indexOf("\n  },", start);
      return SOURCE_HTML.slice(start, next);
    };
    for (const [id, f] of Object.entries(FRIDGE_FACTS)) {
      expect(entryOf(fridgeData.factSource(id)).includes(verbatimCore(f.quote)), id).toBe(true);
    }
  });

  it('every fact has a child-facing plain sentence (never a fragment)', () => {
    for (const [id, f] of Object.entries(FRIDGE_FACTS)) {
      expectPlainSentence(f.plain, id);
    }
  });

  it('fridge.facts has a non-empty translation for every fact in el/nl/pt', () => {
    for (const [lname, loc] of [['el', el], ['nl', nl], ['pt', pt]]) {
      for (const id of Object.keys(FRIDGE_FACTS)) {
        const val = loc.fridge?.facts?.[id];
        expect(val, `${lname} missing fridge.facts.${id}`).toBeTruthy();
        expectPlainSentence(val, `${lname}.${id}`);
      }
    }
  });

  it('every graded placement resolves to a FRIDGE_FACTS entry', () => {
    for (const food of FRIDGE_FOODS) {
      for (const bin of STORAGE_IDS) {
        const { factId, why } = gradePlacement(food.id, bin);
        if (!factId) continue;
        expect(FRIDGE_FACTS[factId], `${food.id} → ${bin}`).toBeTruthy();
        expect(why).toBe(FRIDGE_FACTS[factId].quote);
      }
    }
  });
});

describe('fridgeData — source registration', () => {
  it('FridgeManager is registered in MISSION_SOURCES with the EUFIC spine', () => {
    expect(MISSION_SOURCES.FridgeManager).toContain(STORAGE_SOURCE);
    expect(getMissionSources('FridgeManager').length).toBeGreaterThan(0);
  });
});

describe('fridgeData — multi-valid grading', () => {
  it('every food keeps ≥1 accepted bin — there is always a right answer', () => {
    for (const f of FRIDGE_FOODS) {
      expect(acceptedBins(f.id).length).toBeGreaterThan(0);
    }
  });

  // (α) multi-valid: a food with >1 EUFIC-valid bin accepts ALL of them — no false ✗.
  it('accepts every EUFIC-valid bin for multi-valid foods', () => {
    expect(gradePlacement('bread', 'cupboard').tier).toBe(TIER.ACCEPTED);
    expect(gradePlacement('bread', 'freezer').tier).toBe(TIER.ACCEPTED);
    expect(gradePlacement('chicken', 'fridge').tier).toBe(TIER.ACCEPTED);
    expect(gradePlacement('chicken', 'freezer').tier).toBe(TIER.ACCEPTED);
    expect(gradePlacement('banana', 'cupboard').tier).toBe(TIER.ACCEPTED);
    expect(gradePlacement('banana', 'freezer').tier).toBe(TIER.ACCEPTED);
  });

  // (β) suboptimal returns 🟡 (not ❌) and teaches the verbatim quality note.
  it('high-water → freezer is suboptimal (🟡), never avoid (✗)', () => {
    const g = gradePlacement('lettuce', 'freezer');
    expect(g.tier).toBe(TIER.SUBOPTIMAL);
    expect(g.why).toContain('lose their crispness');
  });

  // Composting an EDIBLE food = the food-waste nudge, always 🟡 — never ✗.
  // (Spoiled-by-state items are genuine waste → compost is ✅, tested in the 1c block.)
  it('compost on an edible food is suboptimal, never avoid', () => {
    for (const f of FRIDGE_FOODS) {
      if (f.spoiledByState) continue;
      expect(gradePlacement(f.id, 'compost').tier).toBe(TIER.SUBOPTIMAL);
    }
  });

  // (γ) the avoid tier is the ONLY hard-wrong, and its hint teaches the EUFIC reason.
  it('avoid is the only hard-wrong and carries a verbatim EUFIC reason', () => {
    expect(gradePlacement('banana', 'fridge').tier).toBe(TIER.AVOID);
    expect(gradePlacement('potato', 'fridge').tier).toBe(TIER.AVOID);
    expect(gradePlacement('chicken', 'cupboard').tier).toBe(TIER.AVOID);
    expect(gradePlacement('banana', 'fridge').why).toContain('sensitive to cold');
  });

  // The food is NEVER labelled bad — no punitive token in any teach-hint.
  it('no teach-hint calls the food inedible/spoiled/wrong', () => {
    const punitive = /inedible|spoiled|rotten|bad food|wrong food|χαλασμέν/i;
    for (const f of FRIDGE_FOODS) {
      for (const bin of STORAGE_IDS) {
        const { why } = gradePlacement(f.id, bin);
        if (why) expect(why).not.toMatch(punitive);
      }
    }
  });
});

describe('fridgeData — run grading rewards first-try understanding', () => {
  it('awards 3 stars for 9–10 first-try foods after all foods are stored correctly', () => {
    const gradeRun = fridgeData.gradeFridgeRun;
    expect(gradeRun).toBeTypeOf('function');
    if (!gradeRun) return;

    expect(gradeRun({ accepted: 10, total: 10, firstTryAccepted: 10 })).toEqual({
      passed: true, tier: 'perfect', stars: 3,
    });
    expect(gradeRun({ accepted: 10, total: 10, firstTryAccepted: 9 })).toEqual({
      passed: true, tier: 'perfect', stars: 3,
    });
  });

  it('awards 2 stars for 7–8 first-try foods and 1 star for a completed learning run below that', () => {
    const gradeRun = fridgeData.gradeFridgeRun;

    expect(gradeRun({ accepted: 10, total: 10, firstTryAccepted: 8 })).toEqual({
      passed: true, tier: 'great', stars: 2,
    });
    expect(gradeRun({ accepted: 10, total: 10, firstTryAccepted: 7 })).toEqual({
      passed: true, tier: 'great', stars: 2,
    });
    expect(gradeRun({ accepted: 10, total: 10, firstTryAccepted: 6 })).toEqual({
      passed: true, tier: 'pass', stars: 1,
    });
    expect(gradeRun({ accepted: 10, total: 10, firstTryAccepted: 0 })).toEqual({
      passed: true, tier: 'pass', stars: 1,
    });
  });

  it('returns zero stars when time ends before all foods are stored correctly', () => {
    const gradeRun = fridgeData.gradeFridgeRun;

    expect(gradeRun({ accepted: 9, total: 10, firstTryAccepted: 9, timedOut: true })).toEqual({
      passed: false, tier: 'fail', stars: 0,
    });
    expect(gradeRun({ accepted: 0, total: 0, firstTryAccepted: 0 })).toEqual({
      passed: false, tier: 'fail', stars: 0,
    });
  });
});

describe('fridgeData — every counter item has a localized child-facing name', () => {
  it('resolves every food name key in EN, EL, NL and PT', () => {
    const locales = { en, el, nl, pt };
    for (const food of FRIDGE_FOODS) {
      expect(food.nameKey, `${food.id} nameKey`).toBeTruthy();
      const [namespace, key] = food.nameKey.split('.');
      for (const [language, locale] of Object.entries(locales)) {
        expect(locale[namespace]?.[key], `${language} ${food.nameKey}`).toBeTruthy();
      }
    }
  });
});

describe('fridgeData — fact coherence', () => {
  // The cupboard fact enumerates "bread, dry food …, tins, jars and drinks" — NOT
  // produce. So a produce item stored (correctly) in the cupboard must surface its OWN
  // verbatim line, never the bread/tins enumeration under a banana.
  it('cupboard produce surfaces a food-specific verbatim, distinct from the generic fact', () => {
    const cupboardFact = factForDestination('cupboard');
    for (const id of ['banana', 'potato', 'onion']) {
      const f = acceptedFact(id, 'cupboard');
      expect(f, `${id} needs a cupboard-specific fact`).toBeTruthy();
      expect(f).not.toBe(cupboardFact);
      expect(gradePlacement(id, 'cupboard').tier).toBe(TIER.ACCEPTED);
    }
  });

  it('the produce cupboard facts are the verbatim EUFIC lines', () => {
    expect(acceptedFact('banana', 'cupboard')).toBe(
      'Some produce, particularly those from the tropics, such as bananas, are sensitive to cold, and should not be stored in the refrigerator.',
    );
    expect(acceptedFact('potato', 'cupboard')).toBe(
      'Potatoes and onions are best stored outside the refrigerator in a dark place to avoid sprouting.',
    );
    expect(acceptedFact('onion', 'cupboard')).toBe(
      'Potatoes and onions are best stored outside the refrigerator in a dark place to avoid sprouting.',
    );
  });

  // Use a food-specific fact when the source supports one; otherwise use the station fact.
  it('correct placements name the food where the source has a line for it', () => {
    const expected = {
      'bread/freezer': 'bread_freezer',
      'banana/freezer': 'banana_freezer',
      'onion/freezer': 'onion_freezer',
      'milk/fridge': 'milk_cupboard_why',
      'fish/fridge': 'fish_fridge',
      'fish/freezer': 'fish_freezer',
      'chicken/fridge': 'chicken_fridge',
      'chicken/freezer': 'chicken_freezer',
      'fish_thawed/fridge': 'fish_thawed_fridge',
      'rice_old/compost': 'rice_compost',
    };
    for (const [pair, factId] of Object.entries(expected)) {
      const [food, bin] = pair.split('/');
      expect(gradePlacement(food, bin).tier, pair).toBe(TIER.ACCEPTED);
      expect(fridgeData.acceptedFactId(food, bin), pair).toBe(factId);
    }
    // No source line → the station fact stays.
    expect(fridgeData.acceptedFactId('potato', 'freezer')).toBeNull();
    expect(fridgeData.acceptedFactId('milk', 'freezer')).toBeNull();
    expect(fridgeData.acceptedFactId('lettuce', 'fridge')).toBeNull();
  });

  it('the fridge no longer shows one identical card for five different foods', () => {
    const cardFor = (food, bin) => fridgeData.acceptedFactId(food, bin) || bin;
    const fridgeCards = ['milk', 'fish', 'chicken', 'lettuce', 'fish_thawed'].map((f) => cardFor(f, 'fridge'));
    expect(fridgeCards.filter((id) => id === 'fridge')).toHaveLength(1); // only lettuce
  });

  it.each([
    ['fish', 'fish_fridge', 'Raw fish goes on the bottom shelf of the fridge, inside a container that closes tightly.'],
    ['chicken', 'chicken_fridge', 'Raw chicken goes on the bottom shelf of the fridge, inside a container that closes tightly.'],
  ])('explains the accepted fridge placement specifically for %s without expanding its source quote', (foodId, factId, plain) => {
    expect(fridgeData.acceptedFactId(foodId, 'fridge')).toBe(factId);
    expect(FRIDGE_FACTS[factId]?.plain).toBe(plain);
    expect(FRIDGE_FACTS[factId]?.quote).toBe('Store raw meat, fish and poultry in sealed containers, on the bottom shelf of your fridge.');
    expect(fridgeData.factSource(factId)).toBe('food-storage-fridge-freezer-cupboard');
    expect(gradePlacement(foodId, 'fridge').tier).toBe(TIER.ACCEPTED);
    expect(gradePlacement(foodId, 'cupboard')).toMatchObject({ tier: TIER.AVOID, factId: 'meat_cupboard_why' });
  });

  it('every food-specific card points to a registered source of this mission', () => {
    for (const food of fridgeData.FRIDGE_FOODS) {
      for (const factId of Object.values(food.acceptedFactIds || {})) {
        const sourceId = fridgeData.factSource(factId);
        expect(SOURCES[sourceId], factId).toBeTruthy();
        expect(MISSION_SOURCES.FridgeManager, factId).toContain(sourceId);
      }
    }
  });
});

describe('fridgeData — day-old rice and compost', () => {
  it('uses the same more-than-one-day condition in the English data fallback as the visible locale', () => {
    expect(FRIDGE_FACTS.rice_old_why.plain).toBe(en.fridge.facts.rice_old_why);
    expect(FRIDGE_FACTS.rice_old_why.plain).toContain('that 1 day has already passed');
  });

  it('the rice rule no longer says every day-old food «belongs in the compost»', () => {
    expect(fridgeData.FRIDGE_FACTS.rice_old_why.plain).not.toMatch(/compost/i);
    for (const locale of [el, nl, pt]) {
      expect(locale.fridge.facts.rice_old_why).not.toMatch(/κομπόστ|compost/i);
    }
  });

  it('the compost card for the rice explains which compost, from the EPA source', () => {
    expect(fridgeData.factSource('rice_compost')).toBe('composting-home');
    expect(SOURCE_HTML.includes(verbatimCore(fridgeData.FRIDGE_FACTS.rice_compost.quote))).toBe(true);
    expect(SOURCE_HTML.includes('Check first to make sure your specific facility accepts them')).toBe(true);
  });
});

describe('fridgeData — food storage and composting guidance in every language', () => {
  it('explains the word «thaw» in the lettuce card in all four languages', () => {
    expect(fridgeData.FRIDGE_FACTS.lettuce_freezer_why.plain).toContain('To thaw means to unfreeze.');
    expect(el.fridge.facts.lettuce_freezer_why).toContain('Ξεπαγώνω σημαίνει ότι κάτι παύει να είναι παγωμένο.');
    expect(nl.fridge.facts.lettuce_freezer_why).toContain('Ontdooien betekent dat iets niet meer bevroren is.');
    expect(pt.fridge.facts.lettuce_freezer_why).toContain('Descongelar quer dizer que algo deixa de estar congelado.');
  });

  it('uses the plural «Κατεψυγμένα λαζάνια»', () => {
    expect(el.foods.frozen_lasagna).toBe('Κατεψυγμένα λαζάνια');
  });
});

describe('fridgeData — time/state layer', () => {
  // rice_old (cooked >1 day) can't be saved by storing it — every storage bin teaches
  // the rule, and compost is the CORRECT destination (the one edible→compost exception).
  it('day-old rice: every storage bin is avoid (verbatim rule), compost is accepted', () => {
    for (const bin of ['fridge', 'freezer', 'cupboard']) {
      const g = gradePlacement('rice_old', bin);
      expect(g.tier, `rice_old → ${bin}`).toBe(TIER.AVOID);
      expect(g.why).toContain('Rice dishes should be used within 1 day');
    }
    expect(gradePlacement('rice_old', 'compost').tier).toBe(TIER.ACCEPTED);
    expect(acceptedBins('rice_old')).toEqual(['compost']);
  });

  // fish_thawed must not be refrozen → freezer avoid (verbatim), fridge accepted, and
  // it is still EDIBLE → compost stays 🟡 (don't waste it).
  it('thawed fish: freezer avoid (refreeze rule), fridge accepted, compost still 🟡', () => {
    const g = gradePlacement('fish_thawed', 'freezer');
    expect(g.tier).toBe(TIER.AVOID);
    expect(g.why).toContain('should never be refrozen');
    expect(gradePlacement('fish_thawed', 'fridge').tier).toBe(TIER.ACCEPTED);
    expect(gradePlacement('fish_thawed', 'cupboard').tier).toBe(TIER.AVOID);
    expect(gradePlacement('fish_thawed', 'compost').tier).toBe(TIER.SUBOPTIMAL);
  });

  it('state items carry a visible state label key', () => {
    for (const id of ['rice_old', 'fish_thawed']) {
      const f = FRIDGE_FOODS.find((x) => x.id === id);
      expect(f.stateLabelKey, id).toBeTruthy();
    }
  });

  // Only genuine-waste items flip compost to accepted — no edible food does.
  it('spoiledByState is the only thing that makes compost accepted', () => {
    for (const f of FRIDGE_FOODS) {
      const compostAccepted = gradePlacement(f.id, 'compost').tier === TIER.ACCEPTED;
      expect(compostAccepted).toBe(!!f.spoiledByState);
    }
  });
});

// Check the limits of the source's advice on animals and commercial composting.
describe('fridgeData — rice compost card says only what the EPA footnote says (01/10/2026)', () => {
  const entry = (() => {
    const start = SOURCE_HTML.indexOf("'composting-home': {");
    return SOURCE_HTML.slice(start, SOURCE_HTML.indexOf('\n  },', start));
  })();

  it('quote and footnote are verbatim in the composting-home viewer entry', () => {
    const f = fridgeData.FRIDGE_FACTS.rice_compost;
    expect(f.sourceId).toBe('composting-home');
    expect(entry.includes(f.quote)).toBe(true);
    expect(f.quote.endsWith('*†')).toBe(true);
    expect(entry.includes(f.footnote)).toBe(true);
    expect(f.footnote).toContain('These materials can be composted at commercial composting facilities.');
  });

  it('no language claims that facilities accept «more» any longer', () => {
    expect(fridgeData.FRIDGE_FACTS.rice_compost.plain).not.toMatch(/\bmore\b/i);
    expect(fridgeData.FRIDGE_FACTS.rice_compost.plain).toMatch(/Some composting facilities accept/);
    expect(el.fridge.facts.rice_compost).not.toMatch(/περισσότερ/);
    expect(el.fridge.facts.rice_compost).toMatch(/Ορισμένες μονάδες/);
    expect(nl.fridge.facts.rice_compost).not.toMatch(/\bmeer\b/);
    expect(pt.fridge.facts.rice_compost).not.toMatch(/\bmais\b/);
    for (const text of [fridgeData.FRIDGE_FACTS.rice_compost.plain, el.fridge.facts.rice_compost, nl.fridge.facts.rice_compost, pt.fridge.facts.rice_compost]) {
      expect(text.length).toBeGreaterThan(40);
    }
  });

  it('the rice item, its state and its compost destination are unchanged', () => {
    const rice = fridgeData.FRIDGE_FOODS.find((f) => f.id === 'rice_old');
    expect(rice.state).toBe('day_old');
    expect(rice.spoiledByState).toBe(true);
    expect(rice.acceptedFactIds).toEqual({ compost: 'rice_compost' });
  });
});

describe('only placements the EUFIC source speaks to become "not the best"', () => {
  it('bread in the fridge is suboptimal, with its verbatim reason', () => {
    expect(gradePlacement('bread', 'fridge')).toMatchObject({ tier: TIER.SUBOPTIMAL, factId: 'cupboard' });
  });
  it('milk in the freezer stays accepted: the source does not call freezing worse', () => {
    expect(gradePlacement('milk', 'freezer').tier).toBe(TIER.ACCEPTED);
  });
  it('lettuce in the cupboard and raw potato in the freezer stay accepted: no source says otherwise', () => {
    expect(gradePlacement('lettuce', 'cupboard').tier).toBe(TIER.ACCEPTED);
    expect(gradePlacement('potato', 'freezer').tier).toBe(TIER.ACCEPTED);
  });
});
