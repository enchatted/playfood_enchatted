import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import { FRIDGE_FACTS, factSource } from '../data/fridgeData.js';
import { FOOD_SAFETY_SOURCE, FOOD_SAFETY_FACTS } from '../data/leftoverChef.js';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

const LOCALES = { el, en, nl, pt };
const KEYS = [
  'fridge.state_day_old',
  'fridge.facts.rice_old_why',
  'leftover_chef.item_leftover_rice',
  'leftover_chef.ideas.fried_rice_onion.text',
];

// The two games describe opposite sides of the same one-day rice storage limit.
const EXPECTED = {
  el: [
    'πάνω από 1 μέρα',
    'Τα πιάτα με ρύζι τρώγονται μέσα σε 1 μέρα. Αυτό το ρύζι είναι πάνω από 1 μέρας, άρα δεν τρώγεται πια με ασφάλεια.',
    'Ρύζι (έως 1 μέρας)',
    'Με λίγο λάδι, το ρύζι που περίσσεψε και το κρεμμύδι γίνονται τηγανητό ρύζι.',
  ],
  en: [
    'over 1 day',
    'Eat rice dishes within 1 day. For this rice, that 1 day has already passed, so it is no longer safe to eat.',
    'Leftover rice (within 1 day)',
    'With a little oil, the leftover rice and the onion become fried rice.',
  ],
  nl: [
    'meer dan 1 dag',
    'Eet rijstgerechten binnen 1 dag op. Voor deze rijst is die dag al voorbij, dus je kunt hem niet meer veilig eten.',
    'Restjes rijst (binnen 1 dag)',
    'Met een beetje olie worden de overgebleven rijst en de ui gebakken rijst.',
  ],
  pt: [
    'mais de 1 dia',
    'Come os pratos de arroz no espaço de 1 dia. Para este arroz esse dia já passou, por isso já não é seguro comê-lo.',
    'Arroz de sobra (dentro de 1 dia)',
    'Com um pouco de azeite, o arroz que sobrou e a cebola tornam-se arroz salteado.',
  ],
};

function valueAt(locale, key) {
  return key.split('.').reduce((value, part) => value?.[part], locale);
}

describe('Rice copy distinguishes expired Fridge rice from Leftover rice within one day', () => {
  it('the Fridge translation path uses the new English fact instead of its older data fallback', async () => {
    const translations = i18next.createInstance();
    await translations.init({ lng: 'en', resources: { en: { translation: en } } });
    expect(translations.t('fridge.facts.rice_old_why', {
      defaultValue: FRIDGE_FACTS.rice_old_why.plain,
    })).toBe(EXPECTED.en[1]);
  });

  it('both rice explanations still cite the existing registered EUFIC source', () => {
    expect(factSource('rice_old_why')).toBe('food-storage-fridge-freezer-cupboard');
    expect(FOOD_SAFETY_SOURCE).toBe(factSource('rice_old_why'));
    expect(FOOD_SAFETY_FACTS.rice_one_day.sourceId).toBe(FOOD_SAFETY_SOURCE);
  });

  for (const [language, locale] of Object.entries(LOCALES)) {
    it.each(KEYS.map((key, index) => [key, EXPECTED[language][index]]))(
      `${language}: %s matches the agreed one-day copy`,
      (key, expected) => {
        expect(valueAt(locale, key)).toBe(expected);
      },
    );

    it(`${language}: only these rice messages drop ambiguous yesterday wording and have no placeholders`, () => {
      for (const key of KEYS) {
        const text = valueAt(locale, key);
        expect(typeof text, key).toBe('string');
        expect(text, key).not.toMatch(/χθες|χθεσιν|yesterday|gisteren|ontem/i);
        expect(text.match(/\{\{[^}]+\}\}/g) || [], key).toEqual([]);
      }
    });
  }
});
