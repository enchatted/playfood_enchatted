import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

const expectedUndoLabels = {
  el: 'Q ή B · Άφησε πίσω / Αναίρεσε',
  en: 'Q or B · Put back / Undo',
  pt: 'Q ou B · Devolver / Desfazer',
  nl: 'Q of B · Terugleggen / Ongedaan',
};

const locales = { en, el, nl, pt };

describe('Meal Planner compact undo control copy', () => {
  it.each(Object.entries(expectedUndoLabels))(
    '%s uses the intended child-readable undo label',
    (localeName, expectedLabel) => {
      expect(locales[localeName].meal_planner.undo_hint).toBe(expectedLabel);
    },
  );

  it.each(Object.entries(locales))('%s label fits the central dock', (localeName, locale) => {
    expect(Array.from(locale.meal_planner.undo_hint).length, `${localeName} code points`).toBeLessThanOrEqual(36);
  });
});
