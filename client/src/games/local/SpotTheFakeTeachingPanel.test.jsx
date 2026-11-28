import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SpotTheFakeTeachingPanel from './SpotTheFakeTeachingPanel.jsx';
import { evidenceKeyForProduct } from './SpotTheFake.jsx';

const commonProps = {
  eyebrow: 'Detective briefing',
  title: 'The Food Detective',
  fact: 'Greenwashing can be hard to spot.',
  sourceLabel: 'Open source',
  primaryLabel: 'Start investigating',
  onSource: () => {},
  onPrimary: () => {},
};

describe('SpotTheFakeTeachingPanel', () => {
  it('uses the product-authored evidence row even when generic statuses suggest another row', () => {
    expect(evidenceKeyForProduct({
      evidenceType: 'ingredients',
      claimStatus: 'vague',
      sealStatus: 'real',
    })).toBe('ingredients');
  });

  it('renders the intro as a non-modal DOM briefing with native source and start actions', () => {
    const markup = renderToStaticMarkup(
      <SpotTheFakeTeachingPanel
        {...commonProps}
        kind="intro"
        steps={['Read the promise.', 'Check the evidence.', 'Make your decision.']}
        goal="Check six products."
      />,
    );

    expect(markup).toContain('data-testid="spot-teaching-panel"');
    expect(markup).toContain('data-teaching-kind="intro"');
    expect(markup).toContain('role="dialog"');
    expect(markup).not.toContain('aria-modal');
    expect(markup.match(/<li>/g)).toHaveLength(3);
    expect(markup).toContain('Greenwashing can be hard to spot.');
    expect(markup).toMatch(/<button[^>]*data-action="teaching-source"/);
    expect(markup).toMatch(/<button[^>]*data-action="teaching-continue"/);
  });

  it('renders final synthesis copy without intro-only steps', () => {
    const markup = renderToStaticMarkup(
      <SpotTheFakeTeachingPanel
        {...commonProps}
        kind="final"
        eyebrow="Case closed"
        title="What the evidence showed"
        fact="A healthy-sounding claim does not always mean the food is healthy."
        primaryLabel="See results"
      />,
    );

    expect(markup).toContain('data-teaching-kind="final"');
    expect(markup).toContain('A healthy-sounding claim does not always mean the food is healthy.');
    expect(markup).not.toContain('<ol');
    expect(markup).toContain('See results');
  });
});
