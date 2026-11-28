import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import SpotTheFakeIntroAction from './SpotTheFakeIntroAction.jsx';

it('exposes a native, labelled start action instead of only a canvas hit area', () => {
  const markup = renderToStaticMarkup(<SpotTheFakeIntroAction label="Start investigating" onStart={() => {}} />);
  expect(markup).toMatch(/<button[^>]*type="button"/);
  expect(markup).toContain('Start investigating</button>');
});
