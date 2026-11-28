import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as audioToggle from './AudioToggle.jsx';
import ScoreBar from './ScoreBar.jsx';

describe('Audio control visibility', () => {
  it.each(['lang', 'avatar', 'menu', 'island', 'game', 'result', 'lighthouse', 'certificate', 'hub'])(
    'does not render a floating audio control on the %s screen',
    (screen) => {
      const shouldRender = audioToggle.shouldRenderGlobalAudioToggle?.(screen);

      expect(shouldRender, 'shouldRenderGlobalAudioToggle export is missing').toBe(false);
    },
  );

  it('keeps the shared game ScoreBar free of audio controls', () => {
    const markup = renderToStaticMarkup(
      <ScoreBar score={0} timeLeft={30} onPause={() => {}} />,
    );

    expect(markup).not.toContain('data-audio-state');
  });
});
