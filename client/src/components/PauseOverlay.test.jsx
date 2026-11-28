import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import i18n from '../i18n/index.js';
import PauseOverlay, * as pauseOverlayModule from './PauseOverlay.jsx';

describe('PauseOverlay mission guide', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('el');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('opens the existing game guide before it removes the pause layer', () => {
    const events = [];
    const openInstructions = pauseOverlayModule.openPauseInstructions;

    expect(openInstructions).toBeTypeOf('function');
    openInstructions?.(
      () => events.push('instructions'),
      () => events.push('resume'),
    );

    expect(events).toEqual(['instructions', 'resume']);
  });

  it('renders an accessible touch-friendly action for goal and instructions', () => {
    const markup = renderToStaticMarkup(
      <PauseOverlay
        onResume={() => {}}
        onInstructions={() => {}}
        onQuit={() => {}}
      />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('data-pause-overlay="menu"');
    expect(markup).toContain('Πώς παίζω;');
  });
});
