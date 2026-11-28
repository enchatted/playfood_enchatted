import { describe, it, expect } from 'vitest';
import { LANGUAGES } from './languageOptions.js';

// Each button names a language and marks the language of its spoken label.
describe('start screen language options', () => {
  it('names a language on every button, never a country', () => {
    expect(LANGUAGES.map((l) => [l.code, l.name])).toEqual([
      ['en', 'English'],
      ['nl', 'Dutch'],
      ['el', 'Ελληνικά'],
      ['pt', 'Português'],
    ]);
  });

  it('leaves the flags untouched, so Dutch keeps the Belgian flag', () => {
    expect(LANGUAGES.map((l) => l.flag)).toEqual(['🇬🇧', '🇧🇪', '🇬🇷', '🇵🇹']);
  });

  it('tags each label with the language the label itself is written in', () => {
    // "Dutch" is English text on the button that selects Dutch, so a screen
    // reader must read it as English rather than as Dutch.
    expect(LANGUAGES.map((l) => l.nameLang)).toEqual(['en', 'en', 'el', 'pt']);
  });
});
