// Locks for Island 2 (local) i18n coverage in all 4 locales.
// EN is the reference key set; every locale must match it exactly (no missing,
// no orphaned extras) and carry real translations (no *_TODO stubs).
import { describe, it, expect } from 'vitest';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

const LOCALES = [['el', el], ['nl', nl], ['pt', pt]];
const NAMESPACES = ['season', 'market', 'spotthefake'];

const flat = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
  typeof v === 'object' && v !== null ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]);

// In-game facts are translated to the child's language while the Press-S
// source stays original; EN deliberately has NO `*.facts` block (it falls back
// via i18next defaultValue to the canonical verbatim quote in the data module).
// So `facts.*` keys are exempt from EN key-parity here — their cross-locale
// coverage is locked instead in marketTripData.test.js.
const stripFacts = (keys) => keys.filter((k) => !k.startsWith('facts.'));

describe('Island 2 namespaces — key parity with EN', () => {
  for (const ns of NAMESPACES) {
    it(`${ns}: identical key sets in all locales (translated facts excluded)`, () => {
      const enKeys = stripFacts(flat(en[ns]).map(([k]) => k)).sort();
      for (const [lname, loc] of LOCALES) {
        expect(stripFacts(flat(loc[ns]).map(([k]) => k)).sort(), `${lname}.${ns}`).toEqual(enKeys);
      }
    });
  }
});

describe('Island 2 strings — no TODO stubs, no empty values', () => {
  const SCOPES = [
    ...NAMESPACES.map((ns) => [ns, (loc) => loc[ns]]),
    ['islands.local', (loc) => loc.islands.local],
    ['missions.local', (loc) => loc.missions.local],
  ];
  for (const [label, get] of SCOPES) {
    it(`${label}: fully translated in EL/NL/PT`, () => {
      for (const [lname, loc] of LOCALES) {
        for (const [key, value] of flat(get(loc))) {
          expect(value, `${lname} ${label}.${key}`).toBeTruthy();
          expect(value, `${lname} ${label}.${key}`).not.toMatch(/_TODO/);
        }
      }
    });
  }
});

describe('mission names stay consistent with the games they launch', () => {
  it('missions.local.1/2/3 match the intro titles of SM / MT / STF per locale', () => {
    for (const [lname, loc] of [['en', en], ...LOCALES]) {
      expect(loc.missions.local['1'], `${lname} m1`).toBe(loc.season.intro_title);
      expect(loc.missions.local['2'], `${lname} m2`).toBe(loc.market.intro_title);
      // STF has no intro_title key; its identity string is spotthefake.title —
      // mission name may be the longer variant (EL «Ξεσκέπασε το Ψέμα» vs «Ξεσκέπασέ το!»),
      // so we only require it to be non-empty and translated (covered above).
      expect(loc.missions.local['3'], `${lname} m3`).toBeTruthy();
    }
  });
});
