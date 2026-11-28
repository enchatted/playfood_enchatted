import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import en from '../../i18n/locales/en.json';
import el from '../../i18n/locales/el.json';
import nl from '../../i18n/locales/nl.json';
import pt from '../../i18n/locales/pt.json';
import SpotTheFakeHud from './SpotTheFakeHud.jsx';

const TASK_2_LOCALE_KEYS = [
  'mission_title',
  'dialog_label',
  'case_file_tab',
  'stage_indicator_label',
  'progress_aria',
  'stars_aria',
  'stage_promise',
  'stage_evidence',
  'stage_decision',
  'choice_supported',
  'choice_needs_evidence',
  'select_first',
  'retry_once',
  'detector_rule_label',
  'evidence_promise_label',
  'evidence_ingredients_label',
  'evidence_seal_label',
  'evidence_claim_label',
  'controls_label',
  'control_instructions',
  'control_pause',
  'control_exit',
  'control_flip',
  'control_confirm',
  'control_continue',
  'control_source',
  'teaching_intro_label',
  'teaching_final_label',
  'teaching_fact_label',
  'teaching_start',
  'teaching_finish',
];

const locales = { en, el, nl, pt };
const expectedStarLabels = {
  en: '2 out of 3 stars',
  el: '2 από 3 αστέρια',
  nl: '2 van 3 sterren',
  pt: '2 de 3 estrelas',
};

function placeholders(value) {
  return [...value.matchAll(/{{\s*([^}\s]+)\s*}}/g)].map((match) => match[1]).sort();
}

function renderHud(overrides = {}) {
  return renderToStaticMarkup(
    <SpotTheFakeHud
      score={30}
      stars={2}
      completed={2}
      total={6}
      onInstructions={() => {}}
      onPause={() => {}}
      onExit={() => {}}
      onFreeze={() => {}}
      {...overrides}
    />,
  );
}

describe('SpotTheFakeHud', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders one compact 2/6 progress indicator and six product state markers', () => {
    const markup = renderHud();

    expect(markup.match(/2\/6/g)).toHaveLength(1);
    expect(markup.match(/data-product-marker=/g)).toHaveLength(6);
    expect(markup.match(/data-state="complete"/g)).toHaveLength(2);
    expect(markup.match(/data-state="pending"/g)).toHaveLength(4);
  });

  it('keeps only score on the left, stars centred, and progress beside the controls', () => {
    const markup = renderHud();

    expect(markup).toContain('spot-the-fake-hud__leading');
    expect(markup).toContain('spot-the-fake-hud__trailing');
    expect(markup).toContain('spot-the-fake-hud__score-value');
    expect(markup).toContain('spot-the-fake-hud__stars');
    expect(markup.indexOf('spot-the-fake-hud__progress'))
      .toBeGreaterThan(markup.indexOf('spot-the-fake-hud__trailing'));
    expect(markup.indexOf('spot-the-fake-hud__controls'))
      .toBeGreaterThan(markup.indexOf('spot-the-fake-hud__progress'));
    expect(markup).not.toContain('spot-the-fake-hud__identity');
    expect(markup).not.toContain('spot-the-fake-hud__title');
    expect(markup).not.toContain('Food Detective');
  });

  it('exposes progress, Guide/Pause and the guarded exit control semantically', () => {
    const markup = renderHud();

    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="2"');
    expect(markup).toContain('aria-valuemax="6"');
    expect(markup).toContain('aria-label="How to play"');
    expect(markup).toContain('aria-label="Pause"');
    expect(markup).toContain('data-testid="spot-exit-control"');
    expect(markup).toContain('✕ Quit');
  });

  it.each(Object.entries(locales))('%s result copy distinguishes final correctness from first-try mastery', (language, locale) => {
    const results = locale.spotthefake.results;

    expect(placeholders(results.summary)).toEqual(['correct', 'firstTryCount', 'mistakes', 'total']);
    for (const tier of ['perfect', 'great', 'pass', 'fail']) {
      expect(placeholders(results[`tier_${tier}_body`]), `${language}: ${tier}`).toEqual(
        ['correct', 'firstTryCount', 'total'],
      );
    }
  });

  it.each(Object.entries(locales))('%s has the exact Task 2 locale contract and placeholders', (language, locale) => {
    const copy = locale.spotthefake;

    expect(TASK_2_LOCALE_KEYS.filter((key) => key in copy)).toEqual(TASK_2_LOCALE_KEYS);
    for (const key of TASK_2_LOCALE_KEYS) {
      expect(typeof copy[key], `${language}: ${key}`).toBe('string');
      expect(copy[key].trim().length, `${language}: ${key}`).toBeGreaterThan(0);
      expect(placeholders(copy[key]), `${language}: ${key} placeholders`).toEqual(
        key === 'progress_aria'
          ? ['completed', 'total']
          : key === 'stars_aria' ? ['stars'] : [],
      );
    }
  });

  it.each(Object.entries(expectedStarLabels))('%s renders a localised star name and hides LiveStars English semantics', async (language, expectedLabel) => {
    await i18n.changeLanguage(language);
    const markup = renderHud();

    expect(markup).toContain(`role="img" aria-label="${expectedLabel}"`);
    expect(markup).toMatch(/role="img"[^>]*><span aria-hidden="true">/);
    expect(markup).not.toContain('spotthefake.');
  });
});
