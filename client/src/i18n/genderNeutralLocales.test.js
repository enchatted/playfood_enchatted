import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

// Check that praise and instructions apply to either avatar.
const BANNED = {
  el: [/νεαρέ εξερευνητή/, /Φοβερός σεφ/, /Άριστος γιατρός/, /Τέλειος κηπουρός/, /σαν αληθινός ντετέκτιβ/, /Φάκελος του Ντετέκτιβ/],
  pt: [/explorador\(a\)/, /Bem-vindo/, /ficares dourado/, /Jardineiro perfeito/, /Médico do solo/, /\bPreso\?/, /um verdadeiro detetive/],
  nl: [/jonge ontdekker/, /een Beschermer/, /Perfecte tuinier/, /Meester-bodemdokter/],
  en: [/\bhis\b/],
};
const LOCALES = { en, el, nl, pt };

function strings(value, path = '') {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

describe('player-directed copy is gender neutral', () => {
  it.each(Object.keys(BANNED))('%s has no gendered address to the player', (localeName) => {
    const hits = strings(LOCALES[localeName])
      .filter(([, text]) => BANNED[localeName].some((re) => re.test(text)))
      .map(([key, text]) => `${key}: ${text}`);
    expect(hits).toEqual([]);
  });
});
