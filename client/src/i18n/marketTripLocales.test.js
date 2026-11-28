import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

const LOCALES = { en, el, nl, pt };

function readPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

describe('Market Trip child-readable locale contract', () => {
  const requiredKeys = [
    'missionIntro.markettrip.title',
    'missionIntro.markettrip.step1',
    'missionIntro.markettrip.step2',
    'missionIntro.markettrip.step3',
    'missionIntro.markettrip.goal',
    'market.projected_totals',
    'market.transport_short',
    'market.near_money',
    'market.warning_money',
    'market.mentor_welcome',
    'market.mentor_in_season',
    'market.mentor_out_of_season',
    'market.mentor_craft',
    'market.mentor_imported',
    'market.mentor_over_budget',
    'market.mentor_full',
    'market.badge_in_season',
    'market.badge_out_of_season',
    'market.badge_craft',
    'market.badge_no_local',
    'market.badge_imported',
    'market.why_local_in_season',
    'market.why_local_out_of_season',
    'market.why_local_craft',
    'market.why_imported',
    'market.why_imported_fragile',
    'market.why_no_local',
    'market.goals_title',
    'market.goal_money_short',
    'market.goal_money_done',
    'market.goal_seasonal',
    'market.goal_transport',
    'market.checkout_title',
    'market.checkout_missing',
    'market.checkout_hint',
    'market.change_something',
    'market.pay',
    'market.recap_goals_title',
    'market.recap_learned_title',
    'market.recap_learned',
  ];

  it.each(Object.entries(LOCALES))('%s has every seasonal-market message', (localeName, locale) => {
    for (const key of requiredKeys) {
      expect(readPath(locale, key), `${localeName}: ${key}`).toBeTruthy();
    }
  });

  // The introduction explains which goal awards each star.
  it('states the goal as eight products and one star per goal in every language', () => {
    const goal = el.missionIntro.markettrip.goal.toLocaleLowerCase('el-GR');
    expect(goal).toContain('8');
    expect(goal).toContain('1 αστέρι');
    expect(goal).toContain('εποχή');
    for (const [name, locale] of Object.entries(LOCALES)) {
      expect(locale.missionIntro.markettrip.goal.match(/\(\+1\)/g), name).toHaveLength(2);
    }
  });

  it('has touch hints, the required-goal note and one lesson per missed goal', () => {
    for (const [name, locale] of Object.entries(LOCALES)) {
      for (const key of ['touch_choose', 'touch_pick', 'goal_money_required', 'checkout_prompt',
        'checkout_hint_blocked', 'recap_learned_season', 'recap_learned_transport', 'transport_explanation']) {
        expect(locale.market[key], `${name}: ${key}`).toBeTruthy();
        expect(locale.market[key], `${name}: ${key}`).not.toContain('—');
      }
      expect(locale.market.choose_hint, name).toMatch(/\bA\b/);
      expect(locale.market.checkout_hint_blocked, name).not.toMatch(/Enter/);
    }
  });

  // The goals panel title explains how to earn stars.
  it('the goals title links the 3 goals to the 3 stars in every language', () => {
    const want = { el: ['3 στόχοι', '3 αστέρια'], en: ['3 goals', '3 stars'], nl: ['3 doelen', '3 sterren'], pt: ['3 objetivos', '3 estrelas'] };
    for (const [name, locale] of Object.entries(LOCALES)) {
      const t = locale.market.goals_title;
      const key = Object.keys(want).find((k) => name.toLowerCase().includes(k)) || name;
      for (const w of want[key]) expect(t, `${name}: ${t}`).toContain(w);
    }
  });

  it('keeps the «sun-ripened / λιαστό» text out of every locale (it was never shown)', () => {
    for (const [name, locale] of Object.entries(LOCALES)) {
      expect(locale.market.sensory_local, name).toBeUndefined();
      expect(locale.market.sensory_imported, name).toBeUndefined();
    }
  });

  it('gives equally informative Greek feedback for local and imported choices', () => {
    for (const key of ['mentor_in_season', 'mentor_out_of_season', 'mentor_craft', 'mentor_imported']) {
      expect(el.market[key], key).not.toContain('Μπράβο');
      expect(el.market[key], key).not.toContain('Εντάξει');
      expect(el.market[key].toLocaleLowerCase('el-GR'), key).toContain('μεταφορ');
    }
  });

  it('names the missing amount and the checkout in every money warning', () => {
    for (const [name, locale] of Object.entries(LOCALES)) {
      expect(locale.market.warning_money, name).toContain('{{amount}}');
      expect(locale.market.checkout_missing, name).toContain('{{amount}}');
      expect(locale.market.goal_money_done, name).toContain('{{budget}}');
      expect(locale.market.goal_money_short, name).toContain('{{done}}');
      expect(locale.market.goal_transport, name).toContain('{{target}}');
    }
  });

  it('names Q or B as the way back without buying, in the choice hints', () => {
    for (const [name, locale] of Object.entries(LOCALES)) {
      expect(locale.market.choose_hint, name).toMatch(/Q/);
      expect(locale.market.choose_hint, name).toMatch(/B/);
      expect(locale.market.choose_ribbon, name).toMatch(/Q/);
    }
  });

  it('uses a child-readable Greek origin for local apples', () => {
    expect(el.market.apples_local).toBe('Κοντινό αγρόκτημα');
  });
});
