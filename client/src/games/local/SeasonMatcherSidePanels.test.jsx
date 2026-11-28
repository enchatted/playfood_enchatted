import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import '../../i18n/index.js';
import { SeasonMatcherBasketSlots } from './SeasonMatcherSidePanels.jsx';

describe('Season Matcher collected produce', () => {
  it.each([
    ['asparagus', '🌱', 'Σπαράγγι'],
    ['leek', '🧅', 'Πράσο'],
    ['cabbage', '🥬', 'Λάχανο'],
  ])('keeps %s recognisable in the basket with its accessible name', (id, emoji, name) => {
    const markup = renderToStaticMarkup(
      <SeasonMatcherBasketSlots items={[{ id, emoji, name }]} total={6} />,
    );
    expect(markup).not.toContain(emoji);
    expect(markup).toContain('<img');
    expect(markup).toContain('data:image/svg+xml;utf8,');
    expect(markup).toContain(`aria-label="${name}"`);
    expect(markup.match(/role="listitem"/g)).toHaveLength(6);
  });

  it('keeps the existing emoji for a food with a faithful glyph', () => {
    const markup = renderToStaticMarkup(
      <SeasonMatcherBasketSlots items={[{ id: 'orange', emoji: '🍊', name: 'Πορτοκάλι' }]} />,
    );
    expect(markup).toContain('🍊');
    expect(markup).not.toContain('<img');
  });
});
