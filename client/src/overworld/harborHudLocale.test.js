import { describe, expect, it } from 'vitest';
import { renderHarborHUD } from './harborRenderer.js';
import el from '../i18n/locales/el.json';
import en from '../i18n/locales/en.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

function recordHud(brandLogoImg, locale) {
  const text = [];
  const context = new Proxy({}, {
    get(target, key) {
      if (key === 'measureText') return (value) => ({ width: String(value).length * 8 });
      if (key === 'fillText') return (value) => text.push(String(value));
      return target[key] ?? (() => {});
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  renderHarborHUD(context, { time: 10 }, 0, {
    brandLogoImg,
    hubTitle: locale.hub.harbor_title,
    harborSubtitle: locale.hub.harbor_subtitle,
  }, 0);
  return text;
}

describe('harbour HUD uses the selected language with and without its logo', () => {
  for (const [language, locale, subtitle] of [
    ['el', el, 'Αρχιπέλαγος'], ['en', en, 'Archipelago'],
    ['nl', nl, 'Archipel'], ['pt', pt, 'Arquipélago'],
  ]) {
    it(`${language}: draws the translated subtitle when the logo loads`, () => {
      const drawn = recordHud({ complete: true, naturalWidth: 240, naturalHeight: 60 }, locale);
      expect(drawn).toContain(subtitle);
      if (language !== 'en') expect(drawn).not.toContain('Archipelago');
    });

    it(`${language}: keeps the translated full title when the logo is unavailable`, () => {
      expect(recordHud(null, locale)).toContain(locale.hub.harbor_title);
    });
  }
});
