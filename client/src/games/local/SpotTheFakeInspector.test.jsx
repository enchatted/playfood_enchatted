import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import SpotTheFakeInspector from './SpotTheFakeInspector.jsx';

const CSS = readFileSync(
  fileURLToPath(new URL('./SpotTheFake.css', import.meta.url)),
  'utf8',
);

const labels = {
  caseFileTab: 'Case file',
  dialogLabel: 'Food detective case file',
  stageIndicatorLabel: 'Investigation stages',
  stagePromise: 'Promise',
  stageEvidence: 'Evidence',
  stageDecision: 'Decision',
  promiseLabel: 'Front-of-pack promise',
  ingredientsLabel: 'Ingredients',
  sealLabel: 'Seal',
  claimLabel: 'Claim check',
  supportedChoice: 'Supported by evidence',
  needsEvidenceChoice: 'Needs evidence',
  selectFirst: 'Choose an answer first',
  flip: 'Flip to the evidence',
  continue: 'Next product',
  detectorRuleLabel: 'Detective rule',
  source: 'Open source',
  close: 'Close',
};

const expectedCaseTabs = {
  en: 'Case file',
  el: 'Φάκελος υπόθεσης',
  nl: 'Dossier',
  pt: 'Dossiê',
};

function translatedLabels() {
  return {
    caseFileTab: i18n.t('spotthefake.case_file_tab'),
    dialogLabel: i18n.t('spotthefake.dialog_label'),
    stageIndicatorLabel: i18n.t('spotthefake.stage_indicator_label'),
    stagePromise: i18n.t('spotthefake.stage_promise'),
    stageEvidence: i18n.t('spotthefake.stage_evidence'),
    stageDecision: i18n.t('spotthefake.stage_decision'),
    promiseLabel: i18n.t('spotthefake.evidence_promise_label'),
    ingredientsLabel: i18n.t('spotthefake.evidence_ingredients_label'),
    sealLabel: i18n.t('spotthefake.evidence_seal_label'),
    claimLabel: i18n.t('spotthefake.evidence_claim_label'),
    supportedChoice: i18n.t('spotthefake.choice_supported'),
    needsEvidenceChoice: i18n.t('spotthefake.choice_needs_evidence'),
    selectFirst: i18n.t('spotthefake.select_first'),
    flip: i18n.t('spotthefake.control_flip'),
    continue: i18n.t('spotthefake.control_continue'),
    detectorRuleLabel: i18n.t('spotthefake.detector_rule_label'),
    source: i18n.t('spotthefake.control_source'),
    close: i18n.t('spotthefake.control_close'),
  };
}

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return CSS.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`))?.[1] ?? '';
}

const product = {
  emoji: '🥣',
  front: 'High in fibre',
  ingredients: 'Wholegrain oats (100%).',
  seal: 'Checked by independent auditors',
  claim: 'Approved health claim',
};

function renderInspector(overrides = {}) {
  return renderToStaticMarkup(
    <SpotTheFakeInspector
      product={product}
      stage="decision"
      choice={null}
      verdict={null}
      highlightedEvidence={null}
      labels={labels}
      onFlip={() => {}}
      onEvidenceContinue={() => {}}
      onSelect={() => {}}
      onChoose={() => {}}
      onContinue={() => {}}
      onSource={() => {}}
      {...overrides}
    />,
  );
}

describe('SpotTheFakeInspector', () => {
  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders a modal case file with the Promise → Evidence → Decision sequence', () => {
    const markup = renderInspector();

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup.indexOf('Promise')).toBeLessThan(markup.indexOf('Evidence'));
    expect(markup.indexOf('Evidence')).toBeLessThan(markup.indexOf('Decision'));
    expect(markup.match(/aria-hidden="true">→/g)).toHaveLength(2);
  });

  it('offers two direct semantic decisions without a separate confirmation control', () => {
    const markup = renderInspector();

    expect(markup).toContain('data-choice="trust"');
    expect(markup).toContain('Supported by evidence');
    expect(markup).toContain('data-choice="flag"');
    expect(markup).toContain('Needs evidence');
    expect(markup).not.toContain('data-action="confirm"');
    expect(markup).toContain('Choose an answer first');
  });

  it('makes Evidence a real current step with a continue action before decisions', () => {
    const markup = renderInspector({ stage: 'evidence' });

    expect(markup).toMatch(/<li[^>]*aria-current="step"[^>]*>[\s\S]*?Evidence/);
    expect(markup).toContain('data-evidence="ingredients"');
    expect(markup).toContain('data-action="evidence-continue"');
    expect(markup).toContain('Next product');
    expect(markup).not.toContain('data-choice="trust"');
    expect(markup).not.toContain('data-choice="flag"');
  });

  it('renders one reason, one reusable detective rule and the source action in feedback', () => {
    const markup = renderInspector({
      choice: 'flag',
      stage: 'feedback',
      verdict: {
        correct: true,
        title: 'Good eye!',
        judgement: 'This promise needs evidence.',
        reason: 'The pack shows leaves but gives no proof.',
        rule: 'Look for details and data behind a large promise.',
      },
    });

    expect(markup.match(/data-feedback-reason=/g)).toHaveLength(1);
    expect(markup).toContain('The pack shows leaves but gives no proof.');
    expect(markup.match(/data-detector-rule=/g)).toHaveLength(1);
    expect(markup).toContain('Look for details and data behind a large promise.');
    expect(markup).toContain('data-action="source"');
    expect(markup).toContain('Open source');
    expect(markup.indexOf('Next product')).toBeLessThan(markup.indexOf('Open source'));
  });

  it.each(Object.entries(expectedCaseTabs))('%s renders the translated case-file tab without a raw fallback key', async (language, expectedTab) => {
    await i18n.changeLanguage(language);
    const markup = renderInspector({ labels: translatedLabels() });

    expect(markup).toContain(`>${expectedTab}</span>`);
    expect(markup).not.toContain('spotthefake.');
    if (language !== 'en') expect(markup).not.toContain('>CASE FILE</span>');
  });

  it('keeps essential stage and evidence labels at 13px or larger', () => {
    expect(cssRule('.spot-the-fake-inspector__stages')).toContain('font-size: clamp(13px');
    expect(cssRule('.spot-the-fake-inspector__eyebrow,\n.spot-the-fake-inspector__evidence-row > span,\n.spot-the-fake-inspector__rule > span'))
      .toContain('font-size: clamp(13px');
  });

  it('keeps product art at least 48px in base and compact-landscape rules', () => {
    expect(cssRule('.spot-the-fake-inspector__product')).toContain('font-size: clamp(48px');
    expect(CSS).not.toMatch(/\.spot-the-fake-inspector__product\s*{\s*font-size:\s*(?:[0-3]?\d|4[0-7])px;/);
  });
});
