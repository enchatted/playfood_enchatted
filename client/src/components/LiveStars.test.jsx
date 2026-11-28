import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LiveStars, { starTransition } from './LiveStars.jsx';

describe('starTransition (pure)', () => {
  it('reports a gain on the star that just lit', () => {
    expect(starTransition(2, 3, 2)).toBe('gain');
  });

  it('reports a loss on the star that just turned off', () => {
    expect(starTransition(3, 2, 2)).toBe('loss');
  });

  it('reports no transition for a star whose lit state did not change', () => {
    expect(starTransition(3, 3, 0)).toBe('none');
    expect(starTransition(1, 2, 0)).toBe('none'); // already lit before and after
    expect(starTransition(0, 0, 1)).toBe('none'); // already dark before and after
  });

  it('treats a missing previous value as no transition (first render, no false pop)', () => {
    expect(starTransition(undefined, 3, 2)).toBe('none');
    expect(starTransition(null, 3, 2)).toBe('none');
  });
});

describe('LiveStars single-pass render (no prior state available)', () => {
  it('still marks the topmost lit star for the gain animation on first paint', () => {
    const markup = renderToStaticMarkup(<LiveStars stars={3} />);
    expect(markup).toContain('scorebarStarPop');
  });

  it('never shows a loss animation on a render with no known previous stars', () => {
    const markup = renderToStaticMarkup(<LiveStars stars={2} />);
    expect(markup).not.toContain('scorebarStarLoss');
  });

  it('returns null for a non-numeric stars prop (unchanged contract)', () => {
    expect(renderToStaticMarkup(<LiveStars stars={undefined} />)).toBe('');
  });
});
