import { describe, it, expect } from 'vitest';
import { ISLAND_KSAV, GAME_LEARNING_GOALS } from './ksav.js';
import { MISSION_MAP } from '../overworld/islandRoomData.js';
import el from '../i18n/locales/el.json';
import pt from '../i18n/locales/pt.json';
import nl from '../i18n/locales/nl.json';

describe('KSAV registry', () => {
  it('covers exactly the 4 canonical islands', () => {
    expect(Object.keys(ISLAND_KSAV).sort()).toEqual(Object.keys(MISSION_MAP).sort());
  });

  it('every mission component has a verbatim learning goal', () => {
    for (const missions of Object.values(MISSION_MAP)) {
      for (const m of missions) {
        expect(GAME_LEARNING_GOALS[m.component], m.component).toBeTruthy();
      }
    }
  });

  it('K/A/V are non-empty on every island (A & V must not be dropped — R6)', () => {
    for (const [island, ksav] of Object.entries(ISLAND_KSAV)) {
      expect(ksav.knowledge.length, `${island} K`).toBeGreaterThan(0);
      expect(ksav.attitudes.length, `${island} A`).toBeGreaterThan(0);
      expect(ksav.values.length, `${island} V`).toBeGreaterThan(0);
    }
  });

  it('locks the verbatim quirks so silent “fixes” fail loudly', () => {
    // Preserve the spelling of the quoted source.
    expect(ISLAND_KSAV.foodwaste.knowledge[0]).toBe('Understand food waste deduction');
    // Island 4 has no [S] item in the partner doc — a real gap, not our omission
    expect(ISLAND_KSAV.circular.skills).toEqual([]);
  });
});

// Every game goal and descriptor has a translation for the learning goals box.

describe('KSAV translations on the result screen', () => {
  for (const [code, locale] of Object.entries({ el, pt, nl })) {
    it(`${code}: translates all 12 game goals and all 16 island KSAV lines`, () => {
      const lo = locale.result.learning_outcomes;
      for (const [mission, english] of Object.entries(GAME_LEARNING_GOALS)) {
        expect(lo.games[mission], `${code} games.${mission}`).toBeTypeOf('string');
        expect(lo.games[mission], `${code} games.${mission} is not left in English`).not.toBe(english);
      }
      for (const [island, sections] of Object.entries(ISLAND_KSAV)) {
        for (const [section, items] of Object.entries(sections)) {
          const translated = lo.islands[island]?.[section] || [];
          expect(translated.length, `${code} ${island}.${section}`).toBe(items.length);
          items.forEach((english, i) => expect(translated[i], `${code} ${island}.${section}.${i}`).not.toBe(english));
        }
      }
    });
  }
});
