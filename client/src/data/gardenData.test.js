import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import * as gardenData from './gardenData.js';
import {
  SEASONS, DECISION_EVENTS, FUTURE_DECISION_EVENTS,
  GARDEN_FACTS, GARDEN_FACT_TEXTS, FACT_SOURCE_BY_ID,
} from './gardenData.js';
import { SOURCES } from './sources.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

const LOCALES = { en, el, nl, pt };

describe('Garden Planner round selection', () => {
  const newCropIds = ['lettuce', 'spinach', 'onion', 'peas', 'green_beans', 'zucchini'];

  it('offers 12 unique plants and at least two valid choices for every season', () => {
    for (let roundSeed = 0; roundSeed < 256; roundSeed += 1) {
      const selected = gardenData.selectGardenSeeds?.(
        gardenData.GARDEN_SEEDS,
        12,
        roundSeed,
      );

      expect(selected, 'selectGardenSeeds export is missing').toBeDefined();
      expect(selected).toHaveLength(12);
      expect(new Set(selected.map((seed) => seed.id)).size).toBe(12);

      for (const season of gardenData.SEASONS) {
        const validChoices = selected.filter((seed) => seed.validSeasons.includes(season));
        expect(validChoices.length, `round ${roundSeed} needs two ${season} choices`)
          .toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('replays the same set for the same seed and varies new rounds', () => {
    const first = gardenData.selectGardenSeeds?.(gardenData.GARDEN_SEEDS, 12, 12345);
    const replay = gardenData.selectGardenSeeds?.(gardenData.GARDEN_SEEDS, 12, 12345);
    const nextRound = gardenData.selectGardenSeeds?.(gardenData.GARDEN_SEEDS, 12, 54321);

    expect(first, 'selectGardenSeeds export is missing').toBeDefined();
    expect(replay.map((seed) => seed.id)).toEqual(first.map((seed) => seed.id));
    expect(nextRound.map((seed) => seed.id)).not.toEqual(first.map((seed) => seed.id));
  });

  it('adds all six approved plants and keeps their labels available in every locale', () => {
    expect(gardenData.GARDEN_SEEDS).toHaveLength(18);
    const cropsById = new Map(gardenData.GARDEN_SEEDS.map((seed) => [seed.id, seed]));

    for (const cropId of newCropIds) {
      const crop = cropsById.get(cropId);
      expect(crop, `${cropId} missing from GARDEN_SEEDS`).toBeDefined();

      const labelKey = crop.nameKey.replace('season_foods.', '');
      for (const [lang, dict] of Object.entries(LOCALES)) {
        expect(dict.season_foods?.[labelKey], `${lang} missing ${crop.nameKey}`).toBeTruthy();
      }
    }
  });

  it('keeps a supplied retry seed and generates a seed only for a new Garden Planner round', () => {
    const generateSeed = () => 987654321;

    expect(gardenData.resolveGardenRoundSeed?.('GardenPlanner', 12345, generateSeed)).toBe(12345);
    expect(gardenData.resolveGardenRoundSeed?.('GardenPlanner', undefined, generateSeed))
      .toBe(987654321);
    expect(gardenData.resolveGardenRoundSeed?.('SoilDoctor', undefined, generateSeed)).toBeNull();
  });

  it('names the targeted crop in the pickup prompt in every locale', () => {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      const prompt = dict.garden?.pick_seed_named;
      expect(prompt, `${lang} missing garden.pick_seed_named`).toBeTruthy();
      expect(prompt, `${lang} pickup prompt must keep the plant placeholder`)
        .toContain('{{plant}}');
    }
  });

  it('gives cabbage and spinach their own reliable pixel markers', () => {
    const cropsById = new Map(gardenData.GARDEN_SEEDS.map((seed) => [seed.id, seed]));

    expect(cropsById.get('cabbage')?.marker).toBe('cabbage');
    expect(cropsById.get('spinach')?.marker).toBe('spinach');
    expect(cropsById.get('lettuce')?.marker).not.toBe('cabbage');
  });

  it('treats a crop as used only inside the season where it was planted', () => {
    const plots = [
      { season: 'summer', seed: { id: 'watermelon' } },
      { season: 'winter', seed: { id: 'cabbage' } },
      { season: 'autumn', seed: null },
    ];

    expect(gardenData.isSeedUsedInSeason).toBeTypeOf('function');
    expect(gardenData.isSeedUsedInSeason?.(plots, 'watermelon', 'summer')).toBe(true);
    expect(gardenData.isSeedUsedInSeason?.(plots, 'watermelon', 'spring')).toBe(false);
    expect(gardenData.isSeedUsedInSeason?.(plots, 'cabbage', 'summer')).toBe(false);
  });

  it('translates the already-planted guidance in every supported locale', () => {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      expect(
        dict.garden?.already_planted_this_season,
        `${lang} missing garden.already_planted_this_season`,
      ).toBeTruthy();
    }
  });
});

// Compare the displayed Three Sisters quotation and ellipsis with the source passage.
const THREE_SISTERS =
  'Corn serves as a trellis, providing a framework for the beans to grow and wrap around. Beans, acting as a natural fertilizer, add nitrogen to the soil…';

// Source-of-truth for the verbatim authenticity guard: the branded source viewer
// shows each page "as given" (Content Authenticity Mandate). The in-game quote
// must be a verbatim substring of the source viewer text — never invented or
// embellished. Allows leading/trailing "…" truncation markers.
const SOURCE_HTML = readFileSync(
  fileURLToPath(new URL('../../public/source.html', import.meta.url)),
  'utf8',
);
const verbatimCore = (q) => q.replace(/^[…\s]+/, '').replace(/[…\s]+$/, '').trim();

describe('DECISION_EVENTS — wiring', () => {
  it('ships exactly 4 events, one per season', () => {
    expect(DECISION_EVENTS).toHaveLength(4);
    expect(DECISION_EVENTS.map((ev) => ev.season).sort()).toEqual([...SEASONS].sort());
  });

  it('every event has exactly one correct option (partner table order kept)', () => {
    for (const ev of DECISION_EVENTS) {
      expect(ev.options.filter((o) => o.correct)).toHaveLength(1);
      expect(ev.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('wired events were removed from FUTURE_DECISION_EVENTS (no double bookkeeping)', () => {
    const wired = new Set(DECISION_EVENTS.map((ev) => ev.id));
    for (const f of FUTURE_DECISION_EVENTS) {
      expect(wired.has(f.id), `${f.id} is both wired and future`).toBe(false);
    }
    expect(FUTURE_DECISION_EVENTS).toHaveLength(7); // 11 partner events − 4 wired
  });

  it('has q/opt/msg i18n keys in all 4 locales', () => {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      const evDict = dict.garden?.event;
      expect(evDict, `${lang}: garden.event missing`).toBeDefined();
      for (const ev of DECISION_EVENTS) {
        expect(evDict[`${ev.id}_q`], `${lang}: ${ev.id}_q`).toBeTruthy();
        for (const o of ev.options) {
          expect(evDict[`${ev.id}_opt_${o.id}`], `${lang}: ${ev.id}_opt_${o.id}`).toBeTruthy();
        }
        // Non-fact events require an event _msg; factId events show garden.facts.* instead.
        if (!ev.factId) {
          expect(evDict[`${ev.id}_msg`], `${lang}: ${ev.id}_msg`).toBeTruthy();
        }
      }
    }
  });

  it('companions maps to the three_sisters fact: verbatim quote + child-facing plain + translated EL + source pill', () => {
    const ev = DECISION_EVENTS.find((e) => e.id === 'companions');
    expect(ev.factId).toBe('three_sisters');
    // The verbatim passage stays untouched behind Press S...
    expect(GARDEN_FACTS.three_sisters.quote).toBe(THREE_SISTERS);
    // Show the age-appropriate explanation on the card.
    expect(GARDEN_FACT_TEXTS.three_sisters).toBe(GARDEN_FACTS.three_sisters.plain);
    expect(GARDEN_FACT_TEXTS.three_sisters).not.toBe(THREE_SISTERS);
    expect(FACT_SOURCE_BY_ID.three_sisters).toBe('three-sisters-nps');
    // The in-game fact is translated for the child — EL must differ from the EN canonical.
    expect(el.garden.facts.three_sisters).toBeTruthy();
    expect(el.garden.facts.three_sisters).not.toBe(THREE_SISTERS);
  });

  it('the three_sisters card names the squash the child just chose', () => {
    // The old card stopped on the source's ellipsis, so a child who picked
    // "Corn + Beans + Squash" was told what two of their three plants do.
    expect(GARDEN_FACTS.three_sisters.plain.toLowerCase()).toContain('squash');
    for (const [lang, dict] of Object.entries({ el, nl, pt })) {
      expect(dict.garden.facts.three_sisters.length, `${lang}: squash sentence missing`)
        .toBeGreaterThan(GARDEN_FACTS.three_sisters.quote.length / 2);
    }
  });

  it('pollinators maps to the pollination fact (translated, sourced via factId)', () => {
    const ev = DECISION_EVENTS.find((e) => e.id === 'pollinators');
    expect(ev.factId).toBe('pollination');
    expect(ev.msgKey).toBeUndefined();
    expect(FACT_SOURCE_BY_ID.pollination).toBe('heirloom-seeds');
  });

  it('shows lavender as a neutral plant instead of an answer-biasing heart', () => {
    const event = DECISION_EVENTS.find((candidate) => candidate.id === 'pollinators');
    const lavender = event.options.find((option) => option.id === 'lavender');

    expect(lavender.emoji).toBe('🌿');
  });

  it('authenticity guard: Three Sisters companions fact is verbatim in source.html', () => {
    // Pins the companions_msg text to source.html so any embellishment or
    // mis-citation fails the build rather than slipping through to production.
    // Allows leading/trailing "…" truncation markers (stripped before matching).
    const core = verbatimCore(THREE_SISTERS);
    expect(SOURCE_HTML.includes(core)).toBe(true);
  });

  it('authenticity guard: EVERY garden fact quote is verbatim in source.html', () => {
    // Check every garden quotation against the corresponding passage, including omissions and punctuation.
    for (const [id, f] of Object.entries(GARDEN_FACTS)) {
      expect(SOURCE_HTML.includes(verbatimCore(f.quote)), id).toBe(true);
    }
  });

  it('every garden fact has a child-facing plain sentence (never a fragment)', () => {
    for (const [id, f] of Object.entries(GARDEN_FACTS)) {
      expect(typeof f.plain, `${id}: plain must be a string`).toBe('string');
      expect(f.plain.length, `${id}: plain must be non-empty`).toBeGreaterThan(0);
      expect(f.plain.startsWith('…'), `${id}: plain must not open with an ellipsis`).toBe(false);
      expect(f.plain[0], `${id}: plain must start with a capital`).toBe(f.plain[0].toUpperCase());
      expect(/[.!?]$/.test(f.plain), `${id}: plain must end as a sentence`).toBe(true);
      expect(/[—–]/.test(f.plain), `${id}: plain must not contain a dash`).toBe(false);
    }
  });

  it('the island says a shared source sentence one way, not two', () => {
    // heirloom and pollination quote the same two sentences 1.1 quotes, so the two
    // games must not mint separate child-facing wordings for them.
    expect(GARDEN_FACTS.heirloom.plain)
      .toBe('Old, traditional varieties can carry more vitamins and minerals in every bite.');
    expect(GARDEN_FACTS.pollination.plain)
      .toBe('Old varieties are pollinated the natural way, by insects and by the wind.');
  });
});

// Surfaced fact ids used by GardenPlanner (the facts that can show a source pill).
// seedling_care is intentionally excluded — no public source yet.
const SURFACED_FACT_IDS = Object.keys(GARDEN_FACT_TEXTS);

describe('i18n parity: garden.facts (translated facts)', () => {
  const nonEnLocales = { el, nl, pt };

  it('every surfaced fact id has a non-empty garden.facts entry in el, nl, pt', () => {
    for (const [lang, dict] of Object.entries(nonEnLocales)) {
      const facts = dict.garden?.facts ?? {};
      for (const id of SURFACED_FACT_IDS) {
        const val = facts[id];
        expect(val, `${lang} missing garden.facts.${id}`).toBeTruthy();
        expect(typeof val, `${lang} garden.facts.${id} should be string`).toBe('string');
        expect(val.length, `${lang} garden.facts.${id} should be non-empty`).toBeGreaterThan(0);
      }
    }
  });

  it('every surfaced fact id resolves to a registered source id in sources.js', () => {
    for (const id of SURFACED_FACT_IDS) {
      const sourceId = FACT_SOURCE_BY_ID[id];
      expect(sourceId, `FACT_SOURCE_BY_ID missing ${id}`).toBeTruthy();
      expect(SOURCES[sourceId], `sources.js missing source ${sourceId} (fact ${id})`).toBeDefined();
    }
  });

  it('en.json does NOT define garden.facts (EN falls back via defaultValue)', () => {
    expect(en.garden?.facts).toBeUndefined();
  });

  it('every locale has the visible Garden Planner S shortcut', () => {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      expect(dict.garden?.press_s, `${lang}: garden.press_s missing`).toBeTruthy();
    }
  });
});
