import React from 'react';
import { useTranslation } from 'react-i18next';
import LiveStars, { LIVE_STARS_KEYFRAMES } from '../../components/LiveStars.jsx';
import ExitConfirmButton from '../../components/ExitConfirmButton.jsx';
import './SpotTheFake.css';

const EXIT_STYLE = {
  minWidth: 44,
  minHeight: 44,
  boxSizing: 'border-box',
  padding: '4px 9px',
  border: '2px solid #3d241b',
  borderRadius: 2,
  background: 'linear-gradient(180deg, #8c6558, #684238)',
  color: '#fff8e1',
  font: 'inherit',
  fontWeight: 900,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  boxShadow: '2px 2px 0 rgba(61, 36, 27, 0.75)',
};

export default function SpotTheFakeHud({
  score,
  stars,
  completed,
  total,
  onInstructions,
  onPause,
  onExit,
  onFreeze,
  controlsFrozen = false,
}) {
  const { t } = useTranslation();
  const safeTotal = Math.max(0, Number.isFinite(total) ? Math.trunc(total) : 0);
  const safeCompleted = Math.min(
    safeTotal,
    Math.max(0, Number.isFinite(completed) ? Math.trunc(completed) : 0),
  );

  const controls = [
    {
      key: 'instructions',
      icon: '📖',
      label: t('game.instructions'),
      hint: t('spotthefake.control_instructions'),
      onClick: onInstructions,
    },
    {
      key: 'pause',
      icon: '⏸',
      label: t('game.pause'),
      hint: t('spotthefake.control_pause'),
      onClick: onPause,
    },
  ];

  return (
    <header className="spot-the-fake-hud" data-testid="spot-the-fake-hud">
      <style>{LIVE_STARS_KEYFRAMES}</style>

      <div className="spot-the-fake-hud__leading">
        <span className="spot-the-fake-hud__score-value">
          <span aria-hidden="true">★</span> {t('game.score')}: {score}
        </span>
      </div>

      <span
        className="spot-the-fake-hud__stars"
        role="img"
        aria-label={t('spotthefake.stars_aria', { stars })}
      >
        <span aria-hidden="true">
          <LiveStars stars={stars} />
        </span>
      </span>

      <div className="spot-the-fake-hud__trailing">
        <div
          className="spot-the-fake-hud__progress"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax={safeTotal}
          aria-valuenow={safeCompleted}
          aria-label={t('spotthefake.progress_aria', {
            completed: safeCompleted,
            total: safeTotal,
          })}
        >
          <span className="spot-the-fake-hud__progress-count" aria-hidden="true">
            {safeCompleted}/{safeTotal}
          </span>
          <span className="spot-the-fake-hud__markers" aria-hidden="true">
            {Array.from({ length: safeTotal }, (_, index) => {
              const state = index < safeCompleted ? 'complete' : 'pending';
              return (
                <span
                  className={`spot-the-fake-hud__marker spot-the-fake-hud__marker--${state}`}
                  data-product-marker={index + 1}
                  data-state={state}
                  key={index}
                />
              );
            })}
          </span>
        </div>

        <nav className="spot-the-fake-hud__controls" aria-label={t('spotthefake.controls_label')}>
          {controls.map((control) => (
            <button
              type="button"
              className="spot-the-fake-hud__control"
              aria-label={control.label}
              onClick={control.onClick}
              disabled={controlsFrozen}
              key={control.key}
            >
              <span aria-hidden="true">{control.icon}</span>
              <span className="spot-the-fake-hud__control-hint">{control.hint}</span>
            </button>
          ))}
          <span className="spot-the-fake-hud__exit" data-testid="spot-exit-control">
            <ExitConfirmButton onExit={onExit} onFreeze={onFreeze} style={EXIT_STYLE} floatingConfirm />
          </span>
        </nav>
      </div>
    </header>
  );
}
