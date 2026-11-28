import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COMPOST_BINS, BIN_IDS, WASTE_ITEMS, TOTAL_ITEMS_PER_SESSION, pickSessionItems, buildRevealList,
  hasSourcedFact, factForItem, COMPOST_FACTS, COMPOST_INTRO_FACT, COMPOST_PREVENTION_FACT,
} from './compostItems.js';
import { SOURCES, MISSION_SOURCES, getMissionSources } from './sources.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../games/engine/gameRoomData.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

// STRUCTURAL locks only (bins / coverage / pickSessionItems / reachability /
// i18n key-PRESENCE). Fact VALUES (chef tips) have no verified source → never asserted here.

const LOCALES = { en, el, nl, pt };
const ROOM = GAME_ROOMS.CompostCreator;
const NEIGHBOURS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const reachable = (col, row) =>
  NEIGHBOURS.some(([dc, dr]) => isGameRoomWalkable(ROOM, col + dc, row + dr));
const get = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);

describe('compostItems — bins + items', () => {
  it('has exactly the 5 directive bins, in pedagogical order', () => {
    expect(BIN_IDS).toEqual(['compost', 'plastic', 'carton', 'aluminium', 'battery']);
    for (const b of COMPOST_BINS) {
      expect(b.labelKey).toBeTruthy();
      expect(b.emoji).toBeTruthy();
      expect(b.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('every waste item maps to a real bin and carries a name key', () => {
    for (const item of WASTE_ITEMS) {
      expect(BIN_IDS, item.id).toContain(item.correctBin);
      expect(item.nameKey, item.id).toBeTruthy();
    }
  });

  it('every bin is covered by ≥1 item (so each can appear in a session)', () => {
    for (const id of BIN_IDS) {
      const n = WASTE_ITEMS.filter((i) => i.correctBin === id).length;
      expect(n, `bin ${id}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('compostItems — pickSessionItems', () => {
  it('returns N distinct items with ≥1 per bin, all from the roster (seeded, 20×)', () => {
    let seed = 42;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let trial = 0; trial < 20; trial++) {
      const picked = pickSessionItems(WASTE_ITEMS, TOTAL_ITEMS_PER_SESSION, rng);
      expect(picked.length).toBe(TOTAL_ITEMS_PER_SESSION);
      const ids = new Set(picked.map((i) => i.id));
      expect(ids.size, 'no duplicates').toBe(picked.length);
      expect(new Set(picked.map((i) => i.correctBin)).size, 'all 5 bins represented').toBe(BIN_IDS.length);
      for (const i of picked) expect(WASTE_ITEMS).toContain(i);
    }
  });
});

describe('compostItems — buildRevealList (re-reveal score fix)', () => {
  const binItems = {
    compost: [{ id: 'banana_peel' }, { id: 'apple_core' }],
    plastic: [{ id: 'plastic_bottle' }],
    carton: [], aluminium: [], battery: [],
  };

  it('reveals every placed item when nothing is confirmed yet', () => {
    const list = buildRevealList(BIN_IDS, binItems, new Set());
    expect(list.map((r) => r.item.id)).toEqual(['banana_peel', 'apple_core', 'plastic_bottle']);
    expect(list.map((r) => r.binId)).toEqual(['compost', 'compost', 'plastic']);
  });

  it('skips already-confirmed items — a retry round never re-scores them', () => {
    const confirmed = new Set(['banana_peel', 'plastic_bottle']);
    const list = buildRevealList(BIN_IDS, binItems, confirmed);
    expect(list.map((r) => r.item.id)).toEqual(['apple_core']); // only the still-unconfirmed one
  });

  it('returns empty once all placed items are confirmed', () => {
    const confirmed = new Set(['banana_peel', 'apple_core', 'plastic_bottle']);
    expect(buildRevealList(BIN_IDS, binItems, confirmed)).toEqual([]);
  });
});

describe('CompostCreator room — reachability', () => {
  it('has the 5 bins matching the data, each reachable', () => {
    expect(ROOM.bins.map((b) => b.id)).toEqual(BIN_IDS);
    for (const bin of ROOM.bins) {
      expect(bin.tiles.length).toBeGreaterThan(0);
      expect(bin.tiles.some((t) => reachable(t.col, t.row)), `bin ${bin.id}`).toBe(true);
    }
  });

  it('has ≥12 stump positions, all reachable', () => {
    expect(ROOM.counterPositions.length).toBeGreaterThanOrEqual(TOTAL_ITEMS_PER_SESSION);
    for (const c of ROOM.counterPositions) {
      expect(reachable(c.col, c.row), `stump ${c.col},${c.row}`).toBe(true);
    }
  });
});

describe('compostItems i18n — key-presence parity (NOT fact-content)', () => {
  const dataKeys = [
    ...COMPOST_BINS.map((b) => b.labelKey),
    ...WASTE_ITEMS.map((i) => i.nameKey),
  ];
  const uiKeys = [
    'compost.pickup_prompt', 'compost.drop_prompt', 'compost.floor_pickup_prompt',
    'compost.place_bin_prompt', 'compost.progress_word', 'compost.all_correct',
    'compost.wrong_retry', 'compost.chef.ask_prompt', 'compost.chef.name',
    'compost.press_s', 'compost.fact_title', 'compost.correct_affirm',
    'compost.fact_continue_prompt',
  ];

  it('every data-referenced key exists in all 4 locales', () => {
    for (const [code, json] of Object.entries(LOCALES)) {
      for (const key of dataKeys) expect(get(json, key), `${code}: ${key}`).toBeTruthy();
    }
  });

  // Core UI keys are free strings (no factual claim) → fully localised, no PT_TODO.
  it('core UI keys exist in all 4 locales with no PT_TODO', () => {
    for (const [code, json] of Object.entries(LOCALES)) {
      for (const key of uiKeys) {
        const v = get(json, key);
        expect(v, `${code}: ${key}`).toBeTruthy();
        expect(v, `${code}: ${key}`).not.toMatch(/PT_TODO/);
      }
    }
  });

  // Dead 2-bin / old-roster keys must stay deleted (no regression).
  it('dead 2-bin + old-roster keys are gone in every locale', () => {
    const deadCompost = ['title', 'compost_bin', 'trash_bin', 'drag_hint', 'correct', 'progress',
      'place_compost_prompt', 'place_trash_prompt', 'wrong_compost', 'wrong_trash',
      'intro_title', 'intro_desc', 'reveal_title', 'chef_tip_orange', 'chef_tip_newspaper',
      // Per-item fact-claims moved to the verbatim `fact` in compostItems.js.
      'chef_tip_banana', 'chef_tip_egg', 'chef_tip_coffee', 'chef_tip_apple', 'chef_tip_tea',
      'chef_tip_lettuce', 'chef_tip_bread', 'chef_tip_fries', 'chef_tip_plastic', 'chef_tip_plastic_bag',
      'chef_tip_milk_carton', 'chef_tip_juice_box', 'chef_tip_aluminium', 'chef_tip_foil', 'chef_tip_battery',
      'note_tea', 'note_fries'];
    for (const json of Object.values(LOCALES)) {
      for (const k of deadCompost) expect(json.compost[k], k).toBeUndefined();
      expect(json.compost_items.orange_peel).toBeUndefined();
      expect(json.compost_items.newspaper).toBeUndefined();
    }
  });

  // The new wrong-placement nudge is a free UI string (non-factual) → fully localised.
  it('wrong_retry is localised in every locale (no PT_TODO)', () => {
    for (const [code, json] of Object.entries(LOCALES)) {
      expect(json.compost.wrong_retry, code).toBeTruthy();
      expect(json.compost.wrong_retry).not.toMatch(/PT_TODO/);
    }
  });

  it('names the picked item and explains touch access to a paused fact card', () => {
    const touchWords = { en: /tap/i, el: /άγγιξ/i, nl: /tik/i, pt: /toca/i };
    for (const [code, json] of Object.entries(LOCALES)) {
      expect(json.compost.pickup_prompt, code).toContain('{{item}}');
      expect(json.compost.floor_pickup_prompt, code).toContain('{{item}}');
      expect(json.compost.press_s, code).toMatch(touchWords[code]);
      expect(json.compost.fact_continue_prompt, code).toBeTruthy();
    }
  });

  it('has a real sorting result summary in every locale', () => {
    for (const [code, json] of Object.entries(LOCALES)) {
      for (const tier of ['perfect', 'pass', 'fail']) {
        expect(json.compost.results?.[`tier_${tier}_title`], `${code}.${tier}.title`).toBeTruthy();
        expect(json.compost.results?.[`tier_${tier}_body`], `${code}.${tier}.body`).toBeTruthy();
      }
      expect(json.compost.results?.summary, code).toContain('{{correct}}');
      expect(json.compost.results?.summary, code).toContain('{{total}}');
    }
  });
});

// Check that each rendered fact links to a registered source containing the quoted text.
describe('compostItems — source plumbing', () => {
  it('every item either resolves to a registered fact or renders nothing', () => {
    for (const item of WASTE_ITEMS) {
      if (!item.factId) {
        expect(hasSourcedFact(item), `${item.id} parked`).toBe(false);
        expect(factForItem(item), item.id).toBeNull();
        continue;
      }
      const rec = COMPOST_FACTS[item.factId];
      expect(rec, `${item.id} → ${item.factId} registered`).toBeTruthy();
      expect(typeof rec.quote, item.id).toBe('string');
      expect(rec.quote.trim().length, item.id).toBeGreaterThan(0);
      expect(typeof rec.plain, item.id).toBe('string');
      expect(hasSourcedFact(item), item.id).toBe(true);
    }
  });

  it('every rendered fact cites a registered source listed under the mission', () => {
    const missionKeys = MISSION_SOURCES.CompostCreator;
    expect(missionKeys, 'CompostCreator mission sources').toBeTruthy();
    for (const rec of [...Object.values(COMPOST_FACTS), COMPOST_INTRO_FACT]) {
      expect(SOURCES[rec.sourceId], `${rec.sourceId} registered`).toBeTruthy();
      expect(missionKeys, `${rec.sourceId} cited by the mission`).toContain(rec.sourceId);
    }
  });

  it('exposes the 3 EPA pages, the Greek YPEN manual and the 5 drink-carton pages, all resolvable', () => {
    const resolved = getMissionSources('CompostCreator');
    expect(resolved.map((s) => s.id)).toEqual([
      'composting-home', 'recycle-common-recyclables', 'used-household-batteries', 'eu-batteries-regulation', 'ypen-home-composting',
      'fostplus-drinkcartons', 'eeaa-polites', 'pontoverde-pacotes', 'fostplus-pmd', 'milieucentraal-drinkpakken',
    ]);
    for (const s of resolved) {
      expect(s.publisher, s.id).toBeTruthy();
      expect(s.url, s.id).toMatch(/^https?:\/\//);
    }
  });

  it('the two drink cartons now carry the Fost Plus card (option A, 01/10)', () => {
    for (const id of ['milk_carton', 'juice_box']) {
      const item = WASTE_ITEMS.find((i) => i.id === id);
      expect(item, id).toBeTruthy();
      expect(item.factId, id).toBe('drink_carton');
      expect(hasSourcedFact(item), id).toBe(true);
    }
  });

  it('every bin has ≥1 sourced item', () => {
    for (const id of BIN_IDS) {
      const sourced = WASTE_ITEMS.filter((i) => i.correctBin === id && hasSourcedFact(i));
      expect(sourced.length, `bin ${id}`).toBeGreaterThanOrEqual(1);
    }
  });

  // The item that used to reward composting cooked chips under a source that says avoid.
  it('no item rewards composting cooked food', () => {
    expect(WASTE_ITEMS.find((i) => i.id === 'leftover_fries'), 'leftover_fries removed').toBeUndefined();
  });
});

// AUTHENTICITY GUARD — every quote must exist inside the viewer «Press S» opens. Islands 1 to 3
// grew this guard after quotes were found missing from the viewer; its absence here is why
// Island 4 drifted to zero coverage silently. The viewer stores some passages as single-quoted
// JS strings, so \' has to be unescaped before matching (the Island 2 escaping trap).
const SOURCE_HTML_RAW = readFileSync(
  fileURLToPath(new URL('../../public/source.html', import.meta.url)), 'utf8');
const SOURCE_HTML = SOURCE_HTML_RAW.replace(/\\'/g, "'");
const verbatimCore = (q) => q.replace(/^[…\s]+/, '').replace(/[…\s]+$/, '').trim();

function expectPlainSentence(plain, label) {
  expect(typeof plain, label).toBe('string');
  expect(plain.trim().length, label).toBeGreaterThan(0);
  expect(plain, `${label} starts mid-clause`).not.toMatch(/^…/);
  expect(plain, `${label} ends in . ! or ?`).toMatch(/[.!?]$/);
  expect(plain, `${label} has no em or en dash`).not.toMatch(/[—–]/);
}

describe('compostItems — Content Authenticity', () => {
  it('every quote appears verbatim inside public/source.html', () => {
    for (const [id, rec] of Object.entries({ intro: COMPOST_INTRO_FACT, ...COMPOST_FACTS })) {
      for (const part of rec.quote.split('…').map(verbatimCore).filter(Boolean)) {
        expect(SOURCE_HTML, `${id}: "${part.slice(0, 60)}" missing from the viewer`).toContain(part);
      }
    }
  });

  it('every plain sentence is a child-facing sentence, not a fragment', () => {
    for (const [id, rec] of Object.entries({ intro: COMPOST_INTRO_FACT, ...COMPOST_FACTS })) {
      expectPlainSentence(rec.plain, id);
    }
  });

  it('el, nl and pt translate every plain sentence', () => {
    for (const [code, json] of Object.entries(LOCALES)) {
      if (code === 'en') continue; // English falls back to the data file
      for (const id of ['intro', ...Object.keys(COMPOST_FACTS)]) {
        const s = json.compost?.facts?.[id];
        expect(s, `${code}.compost.facts.${id}`).toBeTruthy();
        expectPlainSentence(s, `${code}.${id}`);
      }
    }
  });
});

// The tea bag example states which materials and composting conditions it assumes.
describe('CompostCreator — the tea bag states its compost conditions up front (01/10)', () => {
  const LOC = { el, en, nl, pt };
  const PAPER_NO_STAPLE = {
    el: [/Χάρτινο/, /χωρίς σύρμα συρραπτικού/],
    en: [/Paper/, /without a staple/],
    nl: [/Papieren/, /zonder nietje/],
    pt: [/de papel/, /sem agrafo/],
  };

  it('the item name says paper and no staple in all four languages', () => {
    for (const [lang, [paper, staple]] of Object.entries(PAPER_NO_STAPLE)) {
      const name = LOC[lang].compost_items.tea_bag;
      expect(name, lang).toMatch(paper);
      expect(name, lang).toMatch(staple);
    }
  });

  it('the answer and the source are unchanged', () => {
    const item = WASTE_ITEMS.find((i) => i.id === 'tea_bag');
    expect(item.correctBin).toBe('compost');
    expect(COMPOST_FACTS.tea_bag.quote).toBe('Paper tea bags (no staples)');
  });

  it('the Greek card says the staple wire, not paper clips; PT keeps «saqueta» in name and card', () => {
    const el = LOC.el.compost.facts.tea_bag;
    expect(el).toContain('χωρίς μεταλλικό σύρμα συρραπτικού');
    expect(el).not.toMatch(/συνδετήρ/);
    expect(LOC.pt.compost_items.tea_bag).toMatch(/^Saqueta/);
    expect(LOC.pt.compost.facts.tea_bag).toMatch(/saqueta/);
    expect(LOC.pt.compost.facts.tea_bag).not.toMatch(/saquinho/);
  });
});

// Our correction (01/10): the intro said the organisms turn scraps «into soil». The EPA's own
// next sentence says the product is COMPOST that builds soil health — same source entry.
describe('CompostCreator — intro says compost improves soil, not «turns into soil» (01/10)', () => {
  // Scoped like the rice_compost guard in fridgeData.test.js: every part of the intro quote must
  // be inside the viewer entry of ITS OWN sourceId, not merely somewhere in source.html.
  const entryOf = (sourceId) => {
    const start = SOURCE_HTML.indexOf(`'${sourceId}': {`);
    expect(start, `${sourceId} entry in source.html`).toBeGreaterThan(-1);
    return SOURCE_HTML.slice(start, SOURCE_HTML.indexOf('\n  },', start));
  };

  it('the quote carries the EPA end-product sentence, inside the composting-home entry', () => {
    expect(COMPOST_INTRO_FACT.sourceId).toBe('composting-home');
    expect(COMPOST_INTRO_FACT.quote).toContain('The end product is compost, a biologically stable soil amendment that can be used to build soil health');
    const entry = entryOf(COMPOST_INTRO_FACT.sourceId);
    const parts = COMPOST_INTRO_FACT.quote.split('…').map(verbatimCore).filter(Boolean);
    expect(parts.length).toBe(2);
    for (const part of parts) expect(entry, `"${part.slice(0, 50)}" in the composting-home entry`).toContain(part);
  });

  it('all four languages name compost, keep the tiny organisms and the air, and drop «into soil»', () => {
    const intro = { en: COMPOST_INTRO_FACT.plain, el: el.compost.facts.intro, nl: nl.compost.facts.intro, pt: pt.compost.facts.intro };
    const NEED = {
      en: [/into compost, which makes soil healthier/, /tiny living things/, /need air/],
      el: [/σε κομπόστ, που βελτιώνει το χώμα/, /μικροσκοπικοί οργανισμοί/, /αέρα/],
      nl: [/in compost, die de bodem gezonder maakt/, /piepkleine organismen/, /lucht/],
      pt: [/em composto, que torna o solo mais saudável/, /seres vivos minúsculos/, /\bar\b/],
    };
    for (const [lang, rx] of Object.entries(NEED)) for (const r of rx) expect(intro[lang], lang).toMatch(r);
    expect(intro.en).not.toMatch(/into soil/);
    expect(intro.el).not.toMatch(/σε χώμα\./);
    expect(intro.nl).not.toMatch(/in aarde/);
    expect(intro.pt).not.toMatch(/em terra/);
  });
});

// Drink cartons form a separate group in the sorting activity.
describe('CompostCreator — drink cartons, option A (01/10)', () => {
  const LOC = { el, en, nl, pt };
  const plainOf = (lang) => (lang === 'en' ? COMPOST_FACTS.drink_carton.plain : LOC[lang].compost.facts.drink_carton);
  const flat = (s) => s.replace(/\u00ad/g, '');
  const entryOf = (sourceId) => {
    const start = SOURCE_HTML.indexOf(`'${sourceId}': {`);
    expect(start, `${sourceId} entry in source.html`).toBeGreaterThan(-1);
    return SOURCE_HTML.slice(start, SOURCE_HTML.indexOf('\n  }', start));
  };

  const EXPECT = {
    el: { bin: 'ΚΟΥΤΙΑ ΠΟΤΩΝ', group: 'κουτιά ποτών', milk: 'Κουτί γάλακτος', juice: 'Κουτί χυμού', old: /ΧΑΡΤΙ|χαρτόκουτο|Χαρτί:|, χαρτί,/ },
    en: { bin: 'DRINK CARTONS', group: 'drink cartons', milk: 'Milk carton', juice: 'Juice carton', old: /^CARTON$|Juice box|, carton,|Carton:/ },
    nl: { bin: 'DRANKKARTONS', group: 'drankkartons', milk: 'Melkpak', juice: 'Sappak', old: /^KARTON$|Sapje|, karton,|Karton:/ },
    pt: { bin: 'PACOTES DE BEBIDA', group: 'pacotes de bebida', milk: 'Pacote de leite', juice: 'Pacote de sumo', old: /CARTÃO|, cartão,|Cartão:/ },
  };

  it('keeps the five groups, the answers and the bin id (scoring unchanged)', () => {
    expect(BIN_IDS).toEqual(['compost', 'plastic', 'carton', 'aluminium', 'battery']);
    expect(WASTE_ITEMS.find((i) => i.id === 'milk_carton').correctBin).toBe('carton');
    expect(WASTE_ITEMS.find((i) => i.id === 'juice_box').correctBin).toBe('carton');
    expect(WASTE_ITEMS.filter((i) => i.correctBin === 'carton').map((i) => i.id)).toEqual(['milk_carton', 'juice_box']);
  });

  it('label, names, Chef guide and hints name the same group in all four languages', () => {
    for (const [lang, x] of Object.entries(EXPECT)) {
      const c = LOC[lang].compost;
      expect(flat(c.bin_label_carton), lang).toBe(x.bin);
      expect(LOC[lang].compost_items.milk_carton, lang).toBe(x.milk);
      expect(LOC[lang].compost_items.juice_box, lang).toBe(x.juice);
      expect(c.chef.guide_carton.toLowerCase(), `${lang} guide`).toContain(x.group);
      expect(c.chef.hint_carton.toLowerCase(), `${lang} hint`).toContain(x.group);
      expect(c.chef.hint_generic, `${lang} generic`).toContain(x.group);
      for (const s of [c.bin_label_carton, c.chef.guide_carton, c.chef.hint_carton, c.chef.hint_generic,
        LOC[lang].compost_items.milk_carton, LOC[lang].compost_items.juice_box]) {
        expect(s, `${lang}: old paper/carton wording`).not.toMatch(x.old);
      }
    }
  });

  it('the bin and the juice carton use the drink-carton emoji; the milk carton a drawn carton icon', () => {
    expect(COMPOST_BINS.find((b) => b.id === 'carton').emoji).toBe('🧃');
    const milk = WASTE_ITEMS.find((i) => i.id === 'milk_carton');
    expect(milk.icon).toBe('milkCarton');
    expect(milk.emoji).not.toMatch(/📦|🥛/);
    expect(WASTE_ITEMS.find((i) => i.id === 'juice_box').emoji).toBe('🧃');
  });

  it('the intro says, before sorting, that these are the game\'s groups and local rules decide', () => {
    const NEED = {
      el: [/5 ομάδες του παιχνιδιού/, /κουτιά ποτών/, /κάποιες από αυτές/, /τοπικές οδηγίες/],
      en: [/game's 5 groups/, /drink cartons/, /some of them together/, /local rules/],
      nl: [/5 groepen van het spel/, /drankkartons/, /sommige ervan samen/, /plaatselijke regels/],
      pt: [/5 grupos do jogo/, /pacotes de bebida/, /alguns deles juntos/, /regras locais/],
    };
    for (const [lang, rx] of Object.entries(NEED)) {
      const step = LOC[lang].missionIntro.compostcreator.step2;
      for (const r of rx) expect(step, lang).toMatch(r);
    }
  });

  it('the card says cartons are mostly cardboard with plastic, and only SOME have aluminium', () => {
    const NEED = {
      en: [/mostly cardboard/, /thin layer of plastic inside and outside/, /^.*\. Some also have aluminium\.$/],
      el: [/κυρίως από χαρτόνι/, /λεπτό στρώμα πλαστικού μέσα και έξω/, /Κάποια έχουν και αλουμίνιο\.$/],
      nl: [/vooral van karton/, /dun laagje plastic aan de binnen- en buitenkant/, /Sommige hebben ook aluminium\.$/],
      pt: [/sobretudo de cartão/, /camada fina de plástico por dentro e por fora/, /Alguns também têm alumínio\.$/],
    };
    for (const [lang, rx] of Object.entries(NEED)) {
      const p = plainOf(lang);
      for (const r of rx) expect(p, lang).toMatch(r);
      expect(p, `${lang}: no percentage`).not.toMatch(/\d/);
      expect(p, `${lang}: not «all» aluminium`).not.toMatch(/all have aluminium|όλα έχουν|allemaal|todos têm/i);
    }
  });

  it('every part of the card quote is inside the Fost Plus viewer entry, «certain products» included', () => {
    const rec = COMPOST_FACTS.drink_carton;
    expect(rec.sourceId).toBe('fostplus-drinkcartons');
    expect(rec.quote).toContain('Voor bepaalde producten wordt de plastic laag aan de binnenkant gecombineerd met een laagje aluminium.');
    const entry = entryOf(rec.sourceId);
    const parts = rec.quote.split('…').map(verbatimCore).filter(Boolean);
    expect(parts.length).toBe(4);
    for (const part of parts) expect(entry, `"${part.slice(0, 50)}" in the Fost Plus entry`).toContain(part);
  });

  it('the four collection schemes behind «one bin may collect some of them together» are registered with their passage', () => {
    const PASSAGE = {
      'eeaa-polites': ['Στον ΜΠΛΕ ΚΑΔΟ ρίχνουμε ΜΟΝΟ τις ΣΥΣΚΕΥΑΣΙΕΣ', 'Συσκευασίες από Αλουμίνιο', 'Συσκευασίες από Πλαστικό', 'γάλα, χυμούς'],
      'pontoverde-pacotes': ['só devem ser colocados no ecoponto amarelo', 'separadas das restantes embalagens do ecoponto amarelo'],
      'fostplus-pmd': ['Enkel Plastic verpakkingen, Metalen verpakkingen en Drankkartons mogen bij PMD.'],
      'milieucentraal-drinkpakken': ['in de bak of zak voor plastic en metalen verpakkingen en drinkpakken (pmd)', 'Check bij je gemeente'],
    };
    for (const [id, parts] of Object.entries(PASSAGE)) {
      expect(SOURCES[id], `${id} registered`).toBeTruthy();
      expect(MISSION_SOURCES.CompostCreator, `${id} under the mission`).toContain(id);
      const entry = entryOf(id);
      expect(entry, `${id} url`).toContain(SOURCES[id].url);
      for (const part of parts) expect(entry, `${id}: ${part}`).toContain(part);
    }
  });
});

// Prevention and reuse precede the sorting steps and have their own source link.
describe('CompostCreator — prevention and reuse line (01/10)', () => {
  const LOC = { el, en, nl, pt };
  const plainOf = (lang) => (lang === 'en' ? COMPOST_PREVENTION_FACT.plain : LOC[lang].compost.facts.prevention);
  const entryOf = (sourceId) => {
    const start = SOURCE_HTML.indexOf(`'${sourceId}': {`);
    expect(start, `${sourceId} entry in source.html`).toBeGreaterThan(-1);
    return SOURCE_HTML.slice(start, SOURCE_HTML.indexOf('\n  }', start));
  };

  it('cites the EPA Food and Paper passages, each inside the recycle-common-recyclables entry', () => {
    expect(COMPOST_PREVENTION_FACT.sourceId).toBe('recycle-common-recyclables');
    expect(MISSION_SOURCES.CompostCreator).toContain(COMPOST_PREVENTION_FACT.sourceId);
    const parts = COMPOST_PREVENTION_FACT.quote.split('…').map(verbatimCore).filter(Boolean);
    expect(parts).toEqual([
      'EPA recommends reducing food waste by buying only what you need and by eating your leftovers.',
      'EPA encourages consumers to reuse gift bags, boxes, and tissue paper.',
    ]);
    const entry = entryOf('recycle-common-recyclables');
    for (const part of parts) expect(entry, part.slice(0, 40)).toContain(part);
  });

  it('says buy what we need, EAT safe leftovers, and names gift bags AND gift boxes, in 4 languages', () => {
    const NEED = {
      el: [/^Πρώτα δημιουργούμε λιγότερα απόβλητα/, /αγοράζουμε όσο φαγητό χρειαζόμαστε/, /τρώμε τα ασφαλή περισσεύματα/, /σακούλες δώρων και κουτιά δώρων/],
      en: [/^First, we make less waste/, /buy only the food we need/, /eat leftovers that are still safe/, /gift bags and gift boxes/],
      nl: [/^Eerst maken we minder afval/, /alleen het eten dat we nodig hebben/, /eten veilige restjes op/, /cadeauzakjes en cadeaudozen/],
      pt: [/^Primeiro, fazemos menos desperdício/, /só a comida de que precisamos/, /comemos as sobras seguras/, /sacos de presentes e caixas de presentes/],
    };
    for (const [lang, rx] of Object.entries(NEED)) {
      const p = plainOf(lang);
      for (const r of rx) expect(p, lang).toMatch(r);
      expectPlainSentence(p, `${lang}.prevention`);
      expect(p, `${lang}: «use» is broader than the source's «eat»`).not.toMatch(/αξιοποιούμε|\buse leftovers\b|gebruiken we restjes|aproveitamos/);
    }
  });

  it('labels the two intro chips apart in 4 languages', () => {
    for (const [lang, json] of Object.entries(LOC)) {
      expect(json.compost.intro_source_prevention, lang).toMatch(/EPA/);
      expect(json.compost.intro_source_definition, lang).toMatch(/EPA/);
      expect(json.compost.intro_source_prevention).not.toBe(json.compost.intro_source_definition);
    }
  });
});

// The second step includes separate instructions for glass, batteries and residual waste.
describe('CompostCreator — sorting examples at the end of intro step 2', () => {
  const LOC = { el, en, nl, pt };
  const entryOf = (sourceId) => {
    const start = SOURCE_HTML.indexOf(`'${sourceId}': {`);
    expect(start, `${sourceId} entry in source.html`).toBeGreaterThan(-1);
    return SOURCE_HTML.slice(start, SOURCE_HTML.indexOf('\n  }', start));
  };
  const S1 = {
    // Check that all four shortened facts remain available.
    el: 'Υπάρχουν και κάδοι για γυαλί και σύμμεικτα. Οι μπαταρίες πάνε σε ειδικά σημεία συλλογής. Ακολουθούμε τις τοπικές οδηγίες.',
    en: 'There are also bins for glass and general waste. Batteries go to special collection points. We follow the local rules.',
    nl: 'Er zijn ook bakken voor glas en restafval. Batterijen gaan naar speciale inzamelpunten. We volgen de plaatselijke regels.',
    pt: 'Há também contentores para vidro e lixo indiferenciado. As pilhas vão para pontos de recolha especiais. Seguimos as regras locais.',
  };

  it('ends step 2 with the agreed four sentences, once, in all four languages', () => {
    for (const [lang, tail] of Object.entries(S1)) {
      const step2 = LOC[lang].missionIntro.compostcreator.step2;
      expect(step2.endsWith(tail), lang).toBe(true);
      expect(LOC[lang].missionIntro.compostcreator.step3, lang).toBeTruthy();
      // The fourth step explains stars, while the sorting examples stay in the second step.
      expect(LOC[lang].missionIntro.compostcreator.step4, `${lang}: step 4 is the star line`).toMatch(/12.*⭐⭐⭐|⭐⭐⭐.*12/);
    }
  });

  it('states no general rule for the rest of the waste, and «local rules» only once', () => {
    const NO_GENERAL = { el: /ό,τι μένει|ό,τι δεν/, en: /what is left|anything not|everything else/, nl: /wat overblijft|alles wat/, pt: /o que sobra|tudo o que/ };
    const LOCAL = { el: /τοπικ/g, en: /local/g, nl: /plaatselijk|gemeente/g, pt: /locais|zona/g };
    for (const lang of Object.keys(S1)) {
      const step2 = LOC[lang].missionIntro.compostcreator.step2;
      expect(step2, lang).not.toMatch(NO_GENERAL[lang]);
      if (lang !== 'pt') expect(step2.match(LOCAL[lang]).length, `${lang}: local rules once`).toBe(1);
    }
  });

  it('each sentence has its passage in the viewer entry of its registered source', () => {
    expect(entryOf('eeaa-polites')).toContain('Συσκευασίες από Γυαλί');
    expect(entryOf('eeaa-polites')).toContain('Στον ΜΠΛΕ ΚΑΔΟ ρίχνουμε ΜΟΝΟ τις ΣΥΣΚΕΥΑΣΙΕΣ');
    expect(entryOf('used-household-batteries')).toContain('taken to household hazardous waste collection points');
    expect(entryOf('ypen-home-composting')).toContain('Εάν η στρωμνή για μικρά ζώα δεν φέρει σαφή σήμανση ότι είναι βιοαποδομήσιμη, πρέπει να απορρίπτεται στον κάδο με τα υπόλοιπα απόβλητα.');
    for (const id of ['eeaa-polites', 'used-household-batteries', 'ypen-home-composting']) {
      expect(MISSION_SOURCES.CompostCreator, id).toContain(id);
    }
  });

  it('bins and answers are unchanged', () => {
    expect(BIN_IDS).toEqual(['compost', 'plastic', 'carton', 'aluminium', 'battery']);
    expect(WASTE_ITEMS.length).toBe(14);
  });
});
