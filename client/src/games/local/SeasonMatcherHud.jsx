import React from 'react';
import { useTranslation } from 'react-i18next';
import LiveStars, { LIVE_STARS_KEYFRAMES } from '../../components/LiveStars.jsx';
import ExitConfirmButton from '../../components/ExitConfirmButton.jsx';
import { SeasonMatcherBasketSlots } from './SeasonMatcherSidePanels.jsx';

// Same dark-brown platform chrome family as the shared Island 1 ScoreBar
// (components/ScoreBar.jsx `styles.bar` / `styles.pauseBtn`) — kept as literal
// values here (not imported) so ScoreBar itself stays untouched.
const HEADER_CHROME_BG = 'linear-gradient(180deg, #8D6E63 0%, #6D4C41 100%)';
const HEADER_CHROME_BORDER = '#4E342E';
const HEADER_CHROME_TEXT = '#FFF8E1';

const ACTION_STYLE = {
  minWidth: 44,
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  padding: '6px 11px',
  borderRadius: 4,
  border: '2px solid #5D4037',
  background: 'linear-gradient(180deg, #A1887F 0%, #8D6E63 100%)',
  color: '#FFF8E1',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  textShadow: '1px 1px 1px rgba(0,0,0,0.3)',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
};

function HudToken({ children, tone = 'neutral' }) {
  return <span className={`season-matcher-hud__token season-matcher-hud__token--${tone}`}>{children}</span>;
}

export default function SeasonMatcherHud({
  score,
  stars,
  basketCurrent,
  basketTotal,
  basketItems,
  cartCurrent,
  cartTotal,
  countryFlag,
  countryName,
  seasonEmoji,
  seasonName,
  monthName,
  seasonColor,
  energyLabel,
  energyPercent,
  energyColor,
  energyPulsing = false,
  wideGutters = false,
  showGameplayStatus = true,
  showSource,
  onSource,
  onInstructions,
  onPause,
  onExit,
  onFreeze,
}) {
  const { t } = useTranslation();

  return (
    <header
      className="season-matcher-hud"
      data-testid="season-matcher-hud"
      style={{
        '--season-accent': seasonColor,
        // Small season-color accent stripe over the shared dark platform
        // chrome — the header itself is no longer the light cream theme.
        background: `linear-gradient(90deg, color-mix(in srgb, var(--season-accent) 22%, transparent), transparent 35%), ${HEADER_CHROME_BG}`,
        borderBottom: `3px solid ${HEADER_CHROME_BORDER}`,
        color: HEADER_CHROME_TEXT,
      }}
    >
      <style>{LIVE_STARS_KEYFRAMES}</style>

      <div className="season-matcher-hud__info">
        {showGameplayStatus && (
          <span className="season-matcher-hud__score" data-testid="season-matcher-score">
            <span aria-hidden="true">⭐</span>
            <span className="season-matcher-hud__score-label">{t('game.score')}:</span>
            <strong>{score}</strong>
          </span>
        )}
        {showGameplayStatus && !wideGutters && (
          <div className="season-matcher-hud__compact" data-testid="season-matcher-compact-context">
            <div className="season-matcher-hud__context">
              <HudToken tone="season">
                <span className="season-matcher-hud__country">{countryFlag} {countryName}</span>
                <span className="season-matcher-hud__period">
                  <strong data-testid="season-matcher-season">
                    {seasonEmoji} {seasonName}
                  </strong>
                  <small data-testid="season-matcher-month">{monthName}</small>
                </span>
              </HudToken>
              <span
                className={`season-matcher-hud__energy${energyPulsing ? ' is-pulsing' : ''}`}
                data-testid="season-matcher-energy"
                data-pulsing={energyPulsing ? 'true' : 'false'}
                aria-label={energyLabel}
              >
                <span aria-hidden="true">🌍</span>
                <span className="season-matcher-hud__energy-label">{energyLabel}</span>
                <span className="season-matcher-hud__energy-track" aria-hidden="true">
                  <span
                    className="season-matcher-hud__energy-fill"
                    style={{ width: `${energyPercent}%`, background: energyColor }}
                  />
                </span>
              </span>
            </div>
            <div className="season-matcher-hud__progress">
              <div className="season-matcher-hud__shopping-list">
                <span className="season-matcher-hud__shopping-count">
                  🧺 {basketCurrent}/{basketTotal}
                </span>
                <SeasonMatcherBasketSlots items={basketItems} total={basketTotal} />
              </div>
              <HudToken>🛒 {cartCurrent}/{cartTotal}</HudToken>
            </div>
          </div>
        )}
      </div>

      {showGameplayStatus && (
        <div className="season-matcher-hud__stars" data-testid="season-matcher-stars">
          <LiveStars stars={stars} />
        </div>
      )}

      <div className="season-matcher-hud__actions">
        {showSource && (
          <button
            type="button"
            data-testid="season-matcher-source"
            className="season-matcher-hud__action"
            style={ACTION_STYLE}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onSource}
            aria-label="EUFIC"
          >
            <span aria-hidden="true">📚</span>
            <span className="season-matcher-hud__action-label">EUFIC</span>
          </button>
        )}
        <button
          type="button"
          className="season-matcher-hud__action"
          style={ACTION_STYLE}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onInstructions}
        >
          <span aria-hidden="true">📖</span>
          <span className="season-matcher-hud__action-label">{t('game.instructions')}</span>
        </button>
        <button
          type="button"
          className="season-matcher-hud__action"
          style={ACTION_STYLE}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onPause}
        >
          <span aria-hidden="true">⏸</span>
          <span className="season-matcher-hud__action-label">{t('game.pause')}</span>
        </button>
        <ExitConfirmButton onExit={onExit} onFreeze={onFreeze} style={ACTION_STYLE} floatingConfirm />
      </div>
    </header>
  );
}
