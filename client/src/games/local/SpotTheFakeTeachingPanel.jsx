import React, { useRef } from 'react';
import { useDialogDpad } from '../../components/ActiveCanvasStage.jsx';
import './SpotTheFake.css';

export default function SpotTheFakeTeachingPanel({
  kind,
  eyebrow,
  title,
  steps = [],
  goal,
  factLabel,
  fact,
  sourceLabel,
  primaryLabel,
  onSource,
  onPrimary,
}) {
  const titleId = `spot-teaching-${kind}-title`;
  const dialogRef = useRef(null);
  useDialogDpad(dialogRef, onPrimary);

  return (
    <section
      ref={dialogRef}
      className={`spot-the-fake-teaching spot-the-fake-teaching--${kind}`}
      data-testid="spot-teaching-panel"
      data-teaching-kind={kind}
      role="dialog"
      aria-labelledby={titleId}
    >
      <header className="spot-the-fake-teaching__header">
        <span className="spot-the-fake-teaching__eyebrow">{eyebrow}</span>
        <h2 id={titleId}>{title}</h2>
      </header>

      <div className="spot-the-fake-teaching__body">
        {(steps.length > 0 || goal) && (
          <div className="spot-the-fake-teaching__lesson">
            {steps.length > 0 && (
              <ol>
                {steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            )}
            {goal && <p className="spot-the-fake-teaching__goal">{goal}</p>}
          </div>
        )}

        <div className="spot-the-fake-teaching__fact-card">
          {factLabel && <span>{factLabel}</span>}
          <p className="spot-the-fake-teaching__fact">{fact}</p>
          <div className="spot-the-fake-teaching__actions">
            <button type="button" data-action="teaching-source" onClick={onSource}>
              {sourceLabel}
            </button>
            <button
              type="button"
              className="spot-the-fake-teaching__primary"
              data-action="teaching-continue"
              onClick={onPrimary}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
