import { describe, expect, it } from 'vitest';
import { gradeFridgeRun } from '../data/fridgeData.js';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

const LOCALES = { en, el, nl, pt };

// The highest tier covers nine and ten first-try foods; its description must fit both.
describe('Fridge Manager perfect-tier copy', () => {
  it('the perfect tier starts at 9 first-try foods', () => {
    expect(gradeFridgeRun({ accepted: 10, total: 10, firstTryAccepted: 9 }).tier).toBe('perfect');
    expect(gradeFridgeRun({ accepted: 10, total: 10, firstTryAccepted: 10 }).tier).toBe('perfect');
    expect(gradeFridgeRun({ accepted: 10, total: 10, firstTryAccepted: 8 }).tier).toBe('great');
  });

  it.each(Object.entries(LOCALES))('%s: the perfect body names the 9 threshold', (localeName, locale) => {
    const body = locale.fridge.results.tier_perfect_body;
    expect(body, localeName).toContain('9');
    expect(body, localeName).not.toMatch(/σχεδόν|almost|bijna|quase/i);
  });
});
