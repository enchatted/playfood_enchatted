import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import '../i18n/index.js';
import ResultScreen, { resolveLeftoverChefResultStars } from './ResultScreen.jsx';

describe('resolveLeftoverChefResultStars', () => {
  it.each([
    [{ stars: 3, completed: 1, total: 3 }, 3],
    [{ stars: 2, completed: 3, total: 3 }, 2],
    [{ completed: 0, total: 3 }, 0],
    [{ completed: 1, total: 3 }, 1],
    [{ completed: 2, total: 3 }, 2],
    [{ completed: 3, total: 3 }, 3],
    [{ completed: 3, total: 0 }, 0],
  ])('prefers a supplied star score and safely falls back for %o', (result, expectedStars) => {
    expect(resolveLeftoverChefResultStars(result)).toBe(expectedStars);
  });
});

describe('Leftover Chef result presentation', () => {
  it('renders a three-slot earned-star row from a legacy completed/total payload', () => {
    const markup = renderToStaticMarkup(
      <ResultScreen
        island="foodwaste"
        mission="LeftoverChef"
        missionId={3}
        score={50}
        passed
        completed={2}
        total={3}
        onNavigate={() => {}}
      />,
    );

    expect(markup).toContain('data-testid="leftover-chef-result-stars"');
    expect(markup).toContain('aria-label="2 out of 3 stars"');
    expect(markup.match(/data-star-state="filled"/g)).toHaveLength(2);
    expect(markup.match(/data-star-state="empty"/g)).toHaveLength(1);
    expect(markup).not.toContain('<h1');
  });
});

// Check the score note for correct deliveries, including deliveries corrected on retry.
describe('Circular City result: score note', () => {
  const LANGS = ['el', 'en', 'nl', 'pt'];
  const locales = Object.fromEntries(
    LANGS.map((l) => [l, JSON.parse(readFileSync(new URL(`../i18n/locales/${l}.json`, import.meta.url), 'utf8'))]),
  );
  const render = (mission, island, extra = {}) => renderToStaticMarkup(
    <ResultScreen island={island} mission={mission} missionId={2} score={120} passed
      onNavigate={() => {}} {...extra} />,
  );

  it.each(LANGS)('%s: note exists, both counters stay in the summary, no "stars count only the first try" claim', (l) => {
    const r = locales[l].circularcity.results;
    expect(r.score_note).toBeTruthy();
    expect(r.score_note).not.toMatch(/\{\{/);
    expect(r.summary).toContain('{{correct}}/{{total}}');
    expect(r.summary).toContain('{{firstTryCount}}/{{total}}');
    expect(r.score_note).not.toMatch(/μόνο την πρώτη|only your first|alleen je eerste|só a primeira/i);
  });

  it('counter labels: correct deliveries + unchanged first-try labels; shared score label untouched', () => {
    expect(locales.el.circularcity.results.summary.startsWith('Σωστές παραδόσεις:')).toBe(true);
    expect(locales.en.circularcity.results.summary.startsWith('Correct deliveries:')).toBe(true);
    expect(locales.nl.circularcity.results.summary.startsWith('Juiste leveringen:')).toBe(true);
    expect(locales.pt.circularcity.results.summary.startsWith('Entregas certas:')).toBe(true);
    expect(locales.el.circularcity.results.summary).toContain('· Με την πρώτη:');
    expect(locales.en.circularcity.results.summary).toContain('· First try:');
    expect(locales.nl.circularcity.results.summary).toContain('· Meteen goed:');
    expect(locales.pt.circularcity.results.summary).toContain('· À primeira:');
    expect(locales.el.result.your_score).toBe('Το σκορ σου: {{score}}');
  });

  it('renders the note under the counters for Circular City', () => {
    const m = render('CircularCity', 'circular', { correct: 8, total: 8, firstTryCount: 4, leaks: 0 });
    expect(m).toContain('data-testid="circular-score-note"');
    expect(m.indexOf('data-testid="circular-score-note"')).toBeGreaterThan(m.indexOf('8/8'));
    expect(m).toMatch(/4\/8/);
  });

  it.each([
    ['CompostCreator', 'circular', { correct: 10, total: 12 }],
    ['PlanetaryBoundaries', 'circular', { safe: 5, total: 9, transgressed: 4 }],
    ['FridgeManager', 'foodwaste', { correct: 8, total: 10 }],
  ])('does not render the note for %s', (mission, island, extra) => {
    expect(render(mission, island, extra)).not.toContain('circular-score-note');
  });
});
