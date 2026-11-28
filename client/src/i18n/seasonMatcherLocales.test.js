import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

const LOCALES = { en, el, nl, pt };

function readPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

describe('Season Matcher child-readable locale contract', () => {
  const requiredKeys = [
    'missionIntro.seasonmatcher.title',
    'missionIntro.seasonmatcher.step1',
    'missionIntro.seasonmatcher.step2',
    'missionIntro.seasonmatcher.step3',
    'missionIntro.seasonmatcher.goal',
    'season.quality_hint',
    'season.shopping_list',
    'season.accepted_now',
    'season.rejected_traveled',
    'season.feedback_traveled_generic',
    'season.pickup_in_season',
    'season.bravo_in_season',
    'season.results.completion_title',
    'season.results.completion_summary',
    'season.results.transport_summary',
    'season.results.learning_recap_title',
    'season.results.learning_recap',
  ];

  it.each(Object.entries(LOCALES))('%s has every Season Matcher message', (localeName, locale) => {
    for (const key of requiredKeys) {
      expect(readPath(locale, key), `${localeName}: ${key}`).toBeTruthy();
    }
  });

  it('states the Greek goal as six foods that are in season', () => {
    const goal = el.missionIntro.seasonmatcher.goal;
    expect(goal).toContain('6');
    expect(goal.toLocaleLowerCase('el-GR')).toContain('εποχή');
  });

  it.each(Object.entries(LOCALES))('%s: the positive pickup and checkout messages name the food', (localeName, locale) => {
    expect(locale.season.pickup_in_season, `${localeName}: pickup_in_season`).toContain('{{food}}');
    expect(locale.season.bravo_in_season, `${localeName}: bravo_in_season`).toContain('{{food}}');
  });

  it.each(Object.entries(LOCALES))('%s: the mission goal states the 3-star rule', (localeName, locale) => {
    expect(locale.missionIntro.seasonmatcher.goal, `${localeName}: goal`).toContain('3');
  });

  // Starting at zero stars, the player earns one star per two seasonal foods.
  it.each(Object.entries(LOCALES))('%s: the goal describes earning stars, not keeping a starting 3', (localeName, locale) => {
    const goal = locale.missionIntro.seasonmatcher.goal;
    expect(goal, `${localeName}: goal`).toContain('2');
    expect(goal, `${localeName}: goal`).not.toMatch(/Ξεκινάς με 3|start with 3|begint met 3|Começas com 3/i);
    expect(goal, `${localeName}: no em dash`).not.toContain('—');
  });

  // The mentor, interaction prompt and introduction use the same game name.
  it.each(Object.entries(LOCALES))('%s: the intro title matches the mission name', (localeName, locale) => {
    expect(locale.missionIntro.seasonmatcher.title).toBe(locale.missions.local['1']);
  });
});
