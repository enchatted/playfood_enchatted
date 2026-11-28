import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { MarketItemCard } from './MarketTripPanels.jsx';
import { formatMarketMoney } from './marketCurrency.js';

describe('Market prices follow the selected language', () => {
  it.each(['en', 'el', 'nl', 'pt'])('%s: formats the actual product card price', async (language) => {
    const i18n = createInstance();
    await i18n.init({ lng: language, resources: { [language]: { translation: {} } } });
    const html = renderToStaticMarkup(<I18nextProvider i18n={i18n}>
      <MarketItemCard item={{ name: 'Test food', price: 4, local: true, inSeason: true }} />
    </I18nextProvider>);
    const price = html.match(/class="market-trip-item-price"[^>]*>([^<]*)</)?.[1];
    expect(price).toBe(formatMarketMoney(4, language));
    expect(price).toContain(language === 'en' ? '4.00' : '4,00');
  });
});
