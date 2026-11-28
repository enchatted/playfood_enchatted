// Guard: every locale must be fully translated — no placeholder draft strings
// (`PT_TODO:` and friends) may survive in any namespace. After the Option-B
// cleanup (legacy 16-game stub namespaces removed) and the Portuguese bulk
// translation, all 4 locales are placeholder-free; this test keeps them that way.
import { describe, it, expect } from 'vitest';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

const LOCALES = { en, el, nl, pt };

// Flatten nested locale objects to [dottedKey, value] pairs (same helper shape
// as island2Locales.test.js).
const flat = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
  typeof v === 'object' && v !== null ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]);

// Matches the project's placeholder markers: `PT_TODO:` / any `XX_TODO` prefix
// and a bare `TODO:` — never a legitimate UI string (won't hit all-caps words
// like Portuguese "TODOS", which has no underscore/colon).
const PLACEHOLDER = /_TODO\b|\bTODO:/;

describe('locale placeholders', () => {
  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name}.json carries no TODO/placeholder strings`, () => {
      const offenders = flat(loc)
        .filter(([, v]) => typeof v === 'string' && PLACEHOLDER.test(v))
        .map(([k, v]) => `${k} = ${v}`);
      expect(offenders, `${name}.json still has placeholders`).toEqual([]);
    });
  }
});
