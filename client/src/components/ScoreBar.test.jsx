import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ScoreBar, { URGENT_KEYFRAMES } from './ScoreBar.jsx';

describe('ScoreBar optional star-preview label', () => {
  it('keeps the urgent timer centred while it pulses', () => {
    expect(URGENT_KEYFRAMES).toContain('transform: translate(-50%, -50%) scale(1)');
    expect(URGENT_KEYFRAMES).toContain('transform: translate(-50%, -50%) scale(1.12)');
  });

  it('renders a label when a mission explains that the stars are only a preview', () => {
    const markup = renderToStaticMarkup(
      <ScoreBar
        score={0}
        stars={2}
        starsLabel="Πιθανή επίδοση"
        timeLeft={30}
        onPause={() => {}}
      />,
    );

    expect(markup).toContain('Πιθανή επίδοση');
  });

  it('keeps the existing markup free of a preview label by default', () => {
    const markup = renderToStaticMarkup(
      <ScoreBar score={0} stars={2} timeLeft={30} onPause={() => {}} />,
    );

    expect(markup).not.toContain('scorebar-stars-label');
  });

  it('can replace an irrelevant live score with mission-specific status', () => {
    const markup = renderToStaticMarkup(
      <ScoreBar
        score={0}
        showScore={false}
        headerStatus={<span>🍽️ Το Μενού του Σεφ</span>}
        timeLeft={null}
        onPause={() => {}}
      />,
    );

    expect(markup).toContain('🍽️ Το Μενού του Σεφ');
    expect(markup).not.toContain('⭐');
  });
});
