import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import SeasonMatcherHud from './SeasonMatcherHud.jsx';

// Same dark-brown platform chrome family as the shared Island 1 ScoreBar
// header (components/ScoreBar.jsx `styles.bar` / `styles.pauseBtn`) — locks
// SeasonMatcher's header to that family instead of its own light cream theme.
const CHROME_BG = 'linear-gradient(180deg, #8D6E63 0%, #6D4C41 100%)';
const CHROME_BORDER = '#4E342E';
const CHROME_TEXT = '#FFF8E1';
const CHROME_ACTION_BG = 'linear-gradient(180deg, #A1887F 0%, #8D6E63 100%)';

function renderHud(overrides = {}) {
  return renderToStaticMarkup(
    <SeasonMatcherHud
      score={20}
      stars={3}
      basketCurrent={0}
      basketTotal={6}
      basketItems={[]}
      cartCurrent={0}
      cartTotal={4}
      countryFlag="🇬🇷"
      countryName="Ελλάδα"
      seasonEmoji="☀️"
      seasonName="Καλοκαίρι"
      monthName="Αύγουστος"
      seasonColor="#E07F37"
      energyLabel="Ενέργεια μεταφοράς: χαμηλή"
      energyPercent={0}
      energyColor="#43A047"
      showSource
      onSource={() => {}}
      onInstructions={() => {}}
      onPause={() => {}}
      onExit={() => {}}
      {...overrides}
    />,
  );
}

describe('SeasonMatcherHud shares the platform dark-brown chrome', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('el');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the header with the shared chrome background, border and text color', () => {
    const markup = renderHud();
    expect(markup).toContain(CHROME_BG);
    expect(markup).toContain(CHROME_BORDER);
    expect(markup).toContain(CHROME_TEXT);
  });

  it('renders the action buttons (Source/Instructions/Pause) with the shared chrome button style', () => {
    const markup = renderHud();
    expect(markup).toContain(CHROME_ACTION_BG);
  });

  it('shows the live score beside the same unlabelled star row used by other games', () => {
    const markup = renderHud({ score: 20, stars: 2 });

    expect(markup).toContain('Σκορ:');
    expect(markup).toContain('20');
    expect(markup).toContain('2 out of 3 stars');
    expect(markup).not.toContain('Αστέρια');
    expect(markup).not.toContain('2/3');
  });
});
