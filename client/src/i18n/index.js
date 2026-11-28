import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import nl from './locales/nl.json';
import el from './locales/el.json';
import pt from './locales/pt.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    nl: { translation: nl },
    el: { translation: el },
    pt: { translation: pt },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

// Keep <html lang> in sync with the active language so CSS text-transform follows
// per-language casing rules (e.g. Greek drops the tonos in ALL-CAPS) and screen
// readers announce the correct language.
if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language || 'en';
  i18n.on('languageChanged', (lng) => { document.documentElement.lang = lng; });
}

export default i18n;
