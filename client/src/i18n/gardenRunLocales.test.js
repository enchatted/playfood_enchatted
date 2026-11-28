import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import el from './locales/el.json';
import en from './locales/en.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

// The goal, phase progress and lost-round message must be present in every locale.
const LOCALES = { el, en, nl, pt };

const EXPECTED = {
  el: {
    goal: '🎯 Στόχος: 5 υγιείς σοδειές',
    plant: '🌱 Υγιή φυτά: 3 · Απομένουν 4 φυτεύσεις',
    plantOne: '🌱 Υγιή φυτά: 6 · Απομένει 1 φύτευση',
    water: '🌱 Υγιή φυτά: 5 · Πότισε κάθε φυτό δύο φορές',
    harvest: '🧺 Συγκομιδές: 2/5',
    phases: ['🌱 Φύτευση', '💧 Πότισμα', '🌾 Συγκομιδή'],
    title: '🥀 Δεν φτάνεις πια τις 5 υγιείς σοδειές',
    body: '4 φυτά μαράθηκαν, γιατί φυτεύτηκαν σε λάθος εποχή. Κοίτα την εποχή κάθε σπόρου και ξαναπροσπάθησε!',
    cont: 'Πάτα Enter, Space ή το κουμπί A στην οθόνη για συνέχεια',
  },
  en: {
    goal: '🎯 Goal: 5 healthy crops',
    plant: '🌱 Healthy plants: 3 · 4 plantings left',
    plantOne: '🌱 Healthy plants: 6 · 1 planting left',
    water: '🌱 Healthy plants: 5 · Water each plant twice',
    harvest: '🧺 Harvests: 2/5',
    phases: ['🌱 Planting', '💧 Watering', '🌾 Harvest'],
    title: '🥀 You can no longer reach 5 healthy crops',
    body: "4 plants wilted because they were planted in the wrong season. Check each seed's season and try again!",
    cont: 'Press Enter, Space or the on-screen A button to continue',
  },
  nl: {
    goal: '🎯 Doel: 5 gezonde gewassen',
    plant: '🌱 Gezonde planten: 3 · Nog 4 keer planten',
    plantOne: '🌱 Gezonde planten: 6 · Nog 1 keer planten',
    water: '🌱 Gezonde planten: 5 · Geef elke plant twee keer water',
    harvest: '🧺 Oogsten: 2/5',
    phases: ['🌱 Planten', '💧 Water geven', '🌾 Oogst'],
    title: '🥀 Je haalt de 5 gezonde gewassen niet meer',
    body: '4 planten zijn verwelkt, omdat ze in het verkeerde seizoen zijn geplant. Kijk naar het seizoen van elk zaadje en probeer het opnieuw!',
    cont: 'Druk op Enter, spatie of de A-knop op het scherm om door te gaan',
  },
  pt: {
    goal: '🎯 Objetivo: 5 colheitas saudáveis',
    plant: '🌱 Plantas saudáveis: 3 · Faltam 4 plantações',
    plantOne: '🌱 Plantas saudáveis: 6 · Falta 1 plantação',
    water: '🌱 Plantas saudáveis: 5 · Rega cada planta duas vezes',
    harvest: '🧺 Colheitas: 2/5',
    phases: ['🌱 Plantação', '💧 Rega', '🌾 Colheita'],
    title: '🥀 Já não consegues chegar às 5 colheitas saudáveis',
    body: '4 plantas murcharam, porque foram plantadas na estação errada. Vê a estação de cada semente e tenta outra vez!',
    cont: 'Prime Enter, Espaço ou o botão A no ecrã para continuar',
  },
};

describe('garden progress messages', () => {
  for (const [lang, exp] of Object.entries(EXPECTED)) {
    it(`${lang}: exact texts, plurals and interpolation`, async () => {
      const i = i18next.createInstance();
      await i.init({
        lng: lang, fallbackLng: false, resources: { [lang]: { translation: LOCALES[lang] } },
        interpolation: { escapeValue: false },
      });
      const t = i.t.bind(i);
      const plant = (healthy, left) => t('garden.bar.plant_progress', {
        healthy, left: t('garden.bar.plantings_left', { count: left }),
      });
      expect(t('garden.bar.goal', { goal: 5 })).toBe(exp.goal);
      expect(plant(3, 4)).toBe(exp.plant);
      expect(plant(6, 1)).toBe(exp.plantOne);
      expect(t('garden.bar.water_progress', { healthy: 5 })).toBe(exp.water);
      expect(t('garden.bar.harvest_progress', { done: 2, goal: 5 })).toBe(exp.harvest);
      expect(['plant', 'water', 'harvest'].map((p) => t(`garden.bar.phase_${p}`))).toEqual(exp.phases);
      expect(t('garden.lost.title', { goal: 5 })).toBe(exp.title);
      expect(t('garden.lost.body', { n: 4 })).toBe(exp.body);
      expect(t('garden.lost.continue')).toBe(exp.cont);
    });
  }

  // F3: a bare «A» reads as the keyboard A, which walks left. The hint
  // must name the on-screen A button explicitly.
  it('the run-lost hint names the ON-SCREEN A button, not a bare A', () => {
    const ONSCREEN = {
      el: 'το κουμπί A στην οθόνη', en: 'the on-screen A button',
      nl: 'de A-knop op het scherm', pt: 'o botão A no ecrã',
    };
    for (const lang of Object.keys(LOCALES)) {
      const hint = LOCALES[lang].garden.lost.continue;
      expect(hint).toContain(ONSCREEN[lang]);
      expect(hint).toMatch(/Enter/);
      expect(hint).toMatch(/Space|spatie|Espaço/);
      expect(hint.replace(ONSCREEN[lang], '')).not.toMatch(/\bA\b/);
    }
  });

  // F2: the bar keeps the full watering reminder for the whole phase.
  it('the WATER progress line keeps «each plant twice» in every language', () => {
    const PHASE = { el: 'Πότισε κάθε φυτό δύο φορές', en: 'Water each plant twice', nl: 'Geef elke plant twee keer water', pt: 'Rega cada planta duas vezes' };
    for (const lang of Object.keys(LOCALES)) {
      expect(LOCALES[lang].garden.bar.water_progress).toContain(PHASE[lang]);
      expect(LOCALES[lang].garden.phase_water).toContain(PHASE[lang]); // same words as the phase toast
    }
  });
});
