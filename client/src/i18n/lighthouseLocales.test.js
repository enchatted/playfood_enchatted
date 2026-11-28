// Phase 5 locks — Lighthouse Trophy Hall i18n coverage in all 4 locales.
// EN is the reference key set; every locale must match it exactly (no missing,
// no orphaned extras) and carry real translations (no *_TODO stubs).
// Plinth labels deliberately REUSE the existing islands.{slug}.name keys, so
// they are not duplicated here.
import { describe, it, expect } from 'vitest';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

const LOCALES = [['el', el], ['nl', nl], ['pt', pt]];
const NS = 'lighthouse';
const SHIPYARD_KEYS = [
  'prompt', 'title', 'coins', 'position', 'capacity', 'benefit',
  'state_current', 'state_available', 'state_locked', 'state_inactive', 'state_prerequisite',
  'purchase', 'close', 'confirmation', 'previous', 'next', 'preview_label',
  'selection_announcement', 'controls_label', 'controls_change', 'controls_buy',
  'controls_close',
];

const flat = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
  typeof v === 'object' && v !== null ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]);

describe('Lighthouse namespace — key parity with EN', () => {
  it('lighthouse namespace exists in every locale', () => {
    for (const [lname, loc] of [['en', en], ...LOCALES]) {
      expect(loc[NS], `${lname}.${NS}`).toBeDefined();
    }
  });

  it('identical key sets in all locales', () => {
    const enKeys = flat(en[NS]).map(([k]) => k).sort();
    for (const [lname, loc] of LOCALES) {
      expect(flat(loc[NS]).map(([k]) => k).sort(), `${lname}.${NS}`).toEqual(enKeys);
    }
  });

  it('covers every user-facing lighthouse string', () => {
    const REQUIRED = [
      'keeper_name', 'keeper_prompt', 'keeper_finale', 'keeper_welcome', 'exit_prompt',
      'qr_prompt',
      'compass_next', 'compass_left', 'compass_alldone',
    ];
    for (const [lname, loc] of [['en', en], ...LOCALES]) {
      const keys = Object.keys(loc[NS]);
      for (const key of REQUIRED) {
        expect(keys, `${lname}.${NS}.${key}`).toContain(key);
      }
    }
  });
});

describe('Lighthouse strings — no TODO stubs, no empty values', () => {
  it('fully translated in EL/NL/PT', () => {
    for (const [lname, loc] of LOCALES) {
      for (const [key, value] of flat(loc[NS])) {
        expect(value, `${lname} ${NS}.${key}`).toBeTruthy();
        expect(value, `${lname} ${NS}.${key}`).not.toMatch(/_TODO/);
      }
    }
  });

  it('starts each instruction after a colon with a capital letter', () => {
    for (const [lname, loc] of [['en', en], ...LOCALES]) {
      for (const key of ['onboarding_step1_keyboard_prefix', 'onboarding_step1_touch_prefix']) {
        expect(loc[NS][key], `${lname}.${NS}.${key}`).toMatch(/:\s+\p{Lu}/u);
      }
    }
  });
});

describe('Lighthouse interpolation placeholders are preserved across locales', () => {
  it('keeper_welcome keeps {{done}}/{{total}}/{{islands}}', () => {
    for (const [lname, loc] of [['en', en], ...LOCALES]) {
      const s = loc[NS].keeper_welcome;
      expect(s, `${lname} done`).toContain('{{done}}');
      expect(s, `${lname} total`).toContain('{{total}}');
      expect(s, `${lname} islands`).toContain('{{islands}}');
    }
  });
  it('compass_next keeps {{island}}', () => {
    for (const [lname, loc] of [['en', en], ...LOCALES]) {
      expect(loc[NS].compass_next, `${lname} island`).toContain('{{island}}');
    }
  });
  it('compass_left keeps {{n}}', () => {
    for (const [lname, loc] of [['en', en], ...LOCALES]) {
      expect(loc[NS].compass_left, `${lname} n`).toContain('{{n}}');
    }
  });
});

describe('Lighthouse shipyard translations', () => {
  it('provides the complete shipyard contract in every locale', () => {
    for (const [lname, loc] of [['en', en], ...LOCALES]) {
      const shipyard = loc[NS].shipyard;
      expect(shipyard, `${lname}.${NS}.shipyard`).toBeDefined();
      expect(Object.keys(shipyard).sort(), `${lname}.${NS}.shipyard keys`)
        .toEqual([...SHIPYARD_KEYS, 'boats'].sort());
      for (const key of SHIPYARD_KEYS) {
        expect(shipyard, `${lname}.${NS}.shipyard.${key}`).toHaveProperty(key);
        expect(shipyard[key], `${lname}.${NS}.shipyard.${key}`).toBeTruthy();
      }
      expect(Object.keys(shipyard.boats).sort(), `${lname}.${NS}.shipyard.boats`)
        .toEqual(['cleanup', 'eco', 'guardian', 'sailboat', 'starter']);
    }
  });

  it.each([
    ['en', en, 'Ocean Guardian'],
    ['el', el, 'Φύλακας του Ωκεανού'],
    ['nl', nl, 'Oceaanbeschermer'],
    ['pt', pt, 'Guardião do Oceano'],
  ])('provides the approved child-friendly guardian name in %s', (lname, loc, expected) => {
    expect(loc[NS].shipyard.boats.guardian, lname).toBe(expected);
  });

  it.each([
    ['coins', ['{{points}}']],
    ['position', ['{{current}}', '{{total}}']],
    ['capacity', ['{{capacity}}']],
    ['purchase', ['{{price}}']],
    ['preview_label', ['{{boat}}']],
    ['selection_announcement', ['{{boat}}', '{{state}}']],
  ])('preserves the %s interpolation placeholders', (key, placeholders) => {
    for (const [lname, loc] of [['en', en], ...LOCALES]) {
      for (const placeholder of placeholders) {
        expect(loc[NS].shipyard?.[key] ?? '', `${lname}.${NS}.shipyard.${key}`)
          .toContain(placeholder);
      }
    }
  });
});

describe('PLAYFOOD code entry copy', () => {
  it.each([
    ['en', en, /activity code/i, 'Scan your code'],
    ['el', el, /κωδικ(?:ό|ός) δραστηριότητας/i, 'Σάρωσε τον κωδικό σου'],
    ['nl', nl, /activiteitscode/i, 'Scan je code'],
    ['pt', pt, /código da atividade/i, 'Lê o teu código'],
  ])('%s distinguishes the activity reward code from the progress Play Code', (_language, locale, activityCode, oldScannerCopy) => {
    expect(locale.lighthouse.qr_prompt).toMatch(activityCode);
    expect(locale.lighthouse.qr_prompt).toContain('Enter');
    expect(locale.lighthouse.qr_prompt_touch).toMatch(activityCode);
    expect(locale.lighthouse.qr_prompt_touch).toMatch(/\bA\b/);
    expect(locale.lighthouse.qr_prompt).not.toBe(oldScannerCopy);
    expect(locale.phygital.enter_code).toMatch(activityCode);
    expect(locale.phygital.help).toMatch(activityCode);
    expect(locale.phygital.help).not.toMatch(/50/);
  });

  it.each([
    ['en', en],
    ['el', el],
    ['nl', nl],
    ['pt', pt],
  ])('%s uses a specific code-check action instead of a generic submit label', (_language, locale) => {
    expect(locale.phygital.submit).not.toMatch(/^(Submit|Υποβολή|Verzenden)$/i);
  });
});
