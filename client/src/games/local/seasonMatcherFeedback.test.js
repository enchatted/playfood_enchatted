import { describe, expect, it } from 'vitest';
import * as seasonFeedback from './seasonMatcherFeedback.js';
import i18n from '../../i18n/index.js';
import {
  feedbackDurationForVerdict,
  buildInSeasonPickupText,
  buildBravoCheckoutText,
} from './seasonMatcherFeedback.js';

describe('feedbackDurationForVerdict', () => {
  it('gives the positive checkout confirmation real reading time, not a blip', () => {
    const duration = feedbackDurationForVerdict(true);
    expect(duration).toBeGreaterThanOrEqual(2.25);
    expect(duration).toBeLessThanOrEqual(2.5);
  });

  it('keeps an educational error visible long enough for a child to read it', () => {
    expect(feedbackDurationForVerdict(false)).toBe(4.5);
  });

  it('keeps the positive duration clearly longer than the old 1.5s blip', () => {
    expect(feedbackDurationForVerdict(true)).toBeGreaterThan(1.5);
  });
});

const fakeT = (key, params) => {
  if (key === 'season.pickup_in_season') return `PICKUP:${params.food}`;
  if (key === 'season.bravo_in_season') return `BRAVO:${params.food}`;
  if (key === 'season_foods.pear') return 'Pear';
  return key;
};

describe('buildInSeasonPickupText', () => {
  it('names the food and carries only the "in season here now" claim', () => {
    const food = { nameKey: 'season_foods.pear' };
    expect(buildInSeasonPickupText(food, fakeT)).toBe('PICKUP:Pear');
  });
});

describe('buildBravoCheckoutText', () => {
  it('is a Bravo-style confirmation that also names the food', () => {
    const food = { emoji: '🍐', nameKey: 'season_foods.pear' };
    expect(buildBravoCheckoutText(food, fakeT)).toBe('✅ 🍐 BRAVO:Pear');
  });
});

describe('text-only produce feedback never substitutes a different object', () => {
  for (const lang of ['el', 'en', 'nl', 'pt']) {
    it.each([
      ['asparagus', '🌱'], ['leek', '🧅'], ['cabbage', '🥬'],
    ])(`keeps %s named accurately in ${lang} checkout and result summaries`, (id, emoji) => {
      const food = { id, emoji, nameKey: `season_foods.${id}`, inSeasonMonths: ['march', 'april', 'may'] };
      const t = i18n.getFixedT(lang);
      const name = t(food.nameKey);
      const wrongHint = seasonFeedback.buildSeasonWrongHint?.(food, t);
      expect(wrongHint).toContain(name);
      expect(wrongHint).not.toContain(emoji);
      expect(buildBravoCheckoutText(food, t)).not.toContain(emoji);
      const summary = seasonFeedback.buildTraveledSummary?.([food], t);
      const expectedWindow = {
        el: 'Μάρτιος έως Μάιος', en: 'March to May', nl: 'maart t/m mei', pt: 'março a maio',
      }[lang];
      expect(summary).toEqual([{ emoji: '', name, window: expectedWindow }]);
      expect(food.emoji).toBe(emoji);
      expect(food.inSeasonMonths).toEqual(['march', 'april', 'may']);
    });
  }

  it('keeps faithful emojis, the four-item summary limit and absent-table fallback', () => {
    const foods = Array.from({ length: 5 }, () => ({ id: 'pear', emoji: '🍐', nameKey: 'season_foods.pear' }));
    const t = i18n.getFixedT('en');
    expect(seasonFeedback.buildSeasonWrongHint(foods[0], t)).toContain('🍐');
    const summary = seasonFeedback.buildTraveledSummary(foods, t);
    expect(summary).toHaveLength(4);
    expect(summary[0]).toEqual({ emoji: '🍐', name: 'Pear', window: t('season.always_imported') });
  });
});
