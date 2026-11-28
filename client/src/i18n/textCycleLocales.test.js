// Check the translated labels, advice and result descriptions across all four languages.
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

const LOCALES = { el, en, nl, pt };

const readPath = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);

const APPROVED = {
  // Check the left and right controls on the avatar screen.
  'avatar.controls_look': {
    el: 'Κοίτα γύρω σου',
    en: 'Look around',
    nl: 'Kijk rond',
    pt: 'Olha à volta',
  },
  // Harbour full-title fallback; the normal logo uses hub.harbor_subtitle.
  'hub.harbor_title': {
    el: 'Αρχιπέλαγος PLAYFOOD',
    en: 'PLAYFOOD Archipelago',
    nl: 'PLAYFOOD Archipel',
    pt: 'Arquipélago PLAYFOOD',
  },
  // The pilot revision names only the first mission and its position.
  'island.intro_foodwaste': {
    "en": "Start with “{{m1}}”. Walk to the character at the top left.",
    "el": "Ξεκίνα με την αποστολή «{{m1}}». Πήγαινε στον χαρακτήρα πάνω αριστερά.",
    "nl": "Begin met ‘{{m1}}’. Loop naar het personage linksboven.",
    "pt": "Começa pela missão «{{m1}}». Vai até à personagem no canto superior esquerdo."
  },
  // Check advice against the foods actually available in the Meal Planner scenarios.
  'meal_planner.nudge_plant': {
    // Use the child-facing name for the score category.
    el: "Στο παιχνίδι οι φακές δίνουν περισσότερους πόντους στο «Φιλικό για τον πλανήτη».",
    en: "In this game lentils give more Planet-friendly points.",
    nl: "In dit spel geven linzen meer punten voor Goed voor de planeet.",
    pt: "Neste jogo as lentilhas dão mais pontos em Amigo do planeta.",
  },
  // The Greek advice also covers ingredients with a lower impact.
  'meal_planner.results.tier_great_body': {
    el: 'Το πλάνο σου ήταν δυνατό. Σε μερικές επιλογές θα μπορούσες να χρησιμοποιήσεις περισσότερα τρόφιμα από το ψυγείο ή υλικά με μικρότερη επίδραση στο περιβάλλον.',
    en: 'Your plan was strong. A few choices could use more food from the fridge or ingredients with a lower impact on the environment.',
    nl: 'Je plan was sterk. Bij een paar keuzes kon je meer uit de koelkast gebruiken of kiezen voor eten met minder impact.',
    pt: 'O teu plano foi forte. Em algumas escolhas, podias usar mais alimentos do frigorífico ou ingredientes com menos impacto.',
  },
};

describe('small text cycle: approved values in all four locales', () => {
  for (const [key, byLang] of Object.entries(APPROVED)) {
    for (const [lang, value] of Object.entries(byLang)) {
      it(`${lang} ${key}`, () => {
        expect(readPath(LOCALES[lang], key)).toBe(value);
      });
    }
  }

  it('each nudge names the lentils as foods.lentils does, and the Sustainability axis by its name', () => {
    for (const [lang, loc] of Object.entries(LOCALES)) {
      expect(loc.meal_planner.nudge_plant.toLocaleLowerCase(lang), lang).toContain(loc.foods.lentils.toLocaleLowerCase(lang));
      expect(loc.meal_planner.nudge_plant, lang).toContain(loc.meal_planner.axis_sustainability);
    }
  });
});

describe('small text cycle: island.intro_foodwaste placeholders', () => {
  for (const [lang, loc] of Object.entries(LOCALES)) {
    it(`${lang} names just the first mission`, () => {
      const placeholders = loc.island.intro_foodwaste.match(/\{\{[^}]*\}\}/g);
      expect(placeholders).toEqual(['{{m1}}']);
    });
  }
});

describe('small text cycle: the old wording is gone', () => {
  const OLD = {
    'avatar.controls_look': { el: ['Δες τους'], pt: ['Vê os heróis', 'heróis'] },
    'hub.harbor_title': { el: ['Λιμάνι Αναχώρησης'], nl: ['Vertrekhaven'], pt: ['PLAYFOOD Archipelago'] },
    'island.intro_foodwaste': { el: ['το σχεδιάζουμε,'], en: ['plan it'], nl: ['plannen het'], pt: ['planeamos e'] },
    'meal_planner.nudge_plant': { el: ['tofu', 'Tofu', 'τόφου', 'Πάτα Q'], en: ['tofu', 'Press Q'], nl: ['tofu', 'Druk op Q'], pt: ['tofu', 'Pressiona Q'] },
    'meal_planner.results.tier_great_body': { el: ['θα μπορούσαν να χρησιμοποιούν'] },
  };
  // Checked on the cycle's own keys only: other namespaces (garden.*, planetary.*, …) belong to
  // other work and are deliberately not read here.
  for (const [key, byLang] of Object.entries(OLD)) {
    for (const [lang, phrases] of Object.entries(byLang)) {
      it(`${lang} ${key} no longer says ${phrases.map((p) => `«${p}»`).join(', ')}`, () => {
        const value = readPath(LOCALES[lang], key);
        expect(typeof value).toBe('string');
        for (const phrase of phrases) expect(value).not.toContain(phrase);
      });
    }
  }
});
