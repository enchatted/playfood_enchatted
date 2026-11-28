import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as CertificateModule from './CertificateScreen.jsx';

describe('CertificateBranding', () => {
  it.each([
    ['en', '/assets/eu-cofunded-en.png'],
    ['el-GR', '/assets/eu-cofunded-el.png'],
    ['nl', '/assets/eu-cofunded-nl.png'],
    ['pt-PT', '/assets/eu-cofunded-pt.png'],
  ])('renders the official emblem for %s', (language, expectedEmblem) => {
    const Branding = CertificateModule.CertificateBranding;

    expect(Branding).toBeTypeOf('function');

    const html = Branding
      ? renderToStaticMarkup(<Branding language={language} euAlt="Co-funded by the European Union" />)
      : '';

    expect(html).toContain('/assets/logos/primary-logo-01.svg');
    expect(html).toContain(expectedEmblem);
    expect(html).toContain('EU Grant Agreement No. 101196354');
  });

  it('falls back to the English emblem for an unsupported locale', () => {
    const Branding = CertificateModule.CertificateBranding;
    const html = Branding
      ? renderToStaticMarkup(<Branding language="fr" euAlt="Co-funded by the European Union" />)
      : '';

    expect(html).toContain('/assets/eu-cofunded-en.png');
  });
});

describe('getCertificateIslandLabel', () => {
  it('reads the certificate label from the island short name', () => {
    const getLabel = CertificateModule.getCertificateIslandLabel;
    const translations = {
      'islands.growing.name': 'The Magic Garden Island',
      'islands.growing.short_name': 'Magic Garden',
      'lighthouse.plinth_nick.growing': 'Growing',
    };
    const translate = (key, fallback) => translations[key] ?? fallback;

    expect(getLabel).toBeTypeOf('function');
    expect(getLabel?.(translate, 'growing')).toBe('Magic Garden');
  });
});

describe('getCertificateIslandLabelLines', () => {
  it.each([
    ['Magic Garden', ['Magic', 'Garden']],
    ['Πράσινη Διάσωση', ['Πράσινη', 'Διάσωση']],
    ['Προστάτες της Γης', ['Προστάτες', 'της Γης']],
    ['Groene Redding', ['Groene', 'Redding']],
    ['Aardebeschermers', ['Aardebeschermers']],
    ['Protetores da Terra', ['Protetores', 'da Terra']],
  ])('balances %s without exceeding two lines', (label, expected) => {
    expect(CertificateModule.getCertificateIslandLabelLines).toBeTypeOf('function');
    expect(CertificateModule.getCertificateIslandLabelLines?.(label)).toEqual(expected);
  });
});
