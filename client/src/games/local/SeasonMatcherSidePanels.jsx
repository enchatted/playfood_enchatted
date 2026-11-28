import React from 'react';
import { useTranslation } from 'react-i18next';
import { itemGlyphSvg } from '../engine/itemGlyphs.js';

export function SeasonMatcherFeedbackMessage({ text, color, mode = 'toast' }) {
  if (!text) return null;

  return (
    <div
      className={`season-matcher-feedback season-matcher-feedback--${mode}`}
      data-testid="season-matcher-feedback"
      role="status"
      aria-live="polite"
      style={{ '--feedback-color': color || '#33691e' }}
    >
      {text}
    </div>
  );
}

function EnergyMeter({ label, percent, color, pulsing }) {
  return (
    <div
      className={`season-matcher-panel__energy${pulsing ? ' is-pulsing' : ''}`}
      data-testid="season-matcher-energy"
      data-pulsing={pulsing ? 'true' : 'false'}
      aria-label={label}
    >
      <span className="season-matcher-panel__energy-label">🌍 {label}</span>
      <span className="season-matcher-panel__energy-track" aria-hidden="true">
        <span
          className="season-matcher-panel__energy-fill"
          style={{ width: `${percent}%`, background: color }}
        />
      </span>
    </div>
  );
}

export function SeasonMatcherBasketSlots({ items = [], total = 6 }) {
  const { t } = useTranslation();

  return (
    <div
      className="season-matcher-basket-slots"
      data-testid="season-matcher-basket-slots"
      role="list"
      aria-label={t('season.shopping_list')}
    >
      {Array.from({ length: total }, (_, index) => {
        const item = items[index] || null;
        const glyphSvg = itemGlyphSvg(item);
        return (
          <span
            key={index}
            className="season-matcher-basket-slot"
            data-testid="season-matcher-basket-slot"
            data-filled={item ? 'true' : 'false'}
            role="listitem"
            aria-label={item?.name || ''}
          >
            {glyphSvg ? (
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(glyphSvg)}`}
                alt=""
                aria-hidden="true"
                width="22"
                height="22"
                style={{ display: 'block', objectFit: 'contain' }}
              />
            ) : item?.emoji || ''}
          </span>
        );
      })}
    </div>
  );
}

export default function SeasonMatcherSidePanels({
  layout,
  countryFlag,
  countryName,
  seasonEmoji,
  seasonName,
  monthName,
  energyLabel,
  energyPercent,
  energyColor,
  energyPulsing = false,
  basketCurrent,
  basketTotal,
  basketItems,
  cartCurrent,
  cartTotal,
  feedbackText,
  feedbackColor,
}) {
  const { t } = useTranslation();
  if (!layout?.wideGutters) return null;

  return (
    <div className="season-matcher-side-panels" data-testid="season-matcher-side-panels">
      <aside
        className="season-matcher-side-panel season-matcher-side-panel--left"
        data-side="left"
        style={{ width: layout.leftWidth, left: layout.leftOffset }}
      >
        <h2>{t('season.market_today')}</h2>
        <div className="season-matcher-panel__context">
          <span className="season-matcher-panel__big-icon" aria-hidden="true">{countryFlag}</span>
          <strong>{countryName}</strong>
        </div>
        <div className="season-matcher-panel__context">
          <span className="season-matcher-panel__big-icon" aria-hidden="true">{seasonEmoji}</span>
          <span className="season-matcher-panel__period">
            <strong data-testid="season-matcher-season">{seasonName}</strong>
            <small data-testid="season-matcher-month">{monthName}</small>
          </span>
        </div>
        <EnergyMeter
          label={energyLabel}
          percent={energyPercent}
          color={energyColor}
          pulsing={energyPulsing}
        />
      </aside>

      <aside
        className="season-matcher-side-panel season-matcher-side-panel--right"
        data-side="right"
        style={{ width: layout.rightWidth, right: layout.rightOffset }}
      >
        <h2>{t('season.shopping_status')}</h2>
        <div className="season-matcher-panel__shopping-list">
          <div className="season-matcher-panel__shopping-list-title">
            <span aria-hidden="true">🧺</span>
            <strong>{t('season.shopping_list')}</strong>
            <small>{basketCurrent}/{basketTotal}</small>
          </div>
          <SeasonMatcherBasketSlots items={basketItems} total={basketTotal} />
        </div>
        <div className="season-matcher-panel__progress">
          <span>🛒</span>
          <strong>{cartCurrent}/{cartTotal}</strong>
          <small>{t('season.cart_short')}</small>
        </div>
        <SeasonMatcherFeedbackMessage
          text={feedbackText}
          color={feedbackColor}
          mode="receipt"
        />
      </aside>
    </div>
  );
}
