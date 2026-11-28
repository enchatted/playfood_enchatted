import React, { useRef } from 'react';
import { useDialogDpad } from '../../components/ActiveCanvasStage.jsx';
import './SpotTheFake.css';

const STAGES = ['promise', 'evidence', 'decision'];

export default function SpotTheFakeInspector({
  product,
  stage,
  choice,
  verdict,
  highlightedEvidence,
  labels,
  onFlip,
  onEvidenceContinue,
  onSelect,
  onChoose,
  onContinue,
  onSource,
  onClose,
  frozen = false,
}) {
  const dialogRef = useRef(null);
  useDialogDpad(dialogRef, verdict ? onContinue : onClose, !frozen);
  if (!product) return null;

  const stageLabels = {
    promise: labels.stagePromise,
    evidence: labels.stageEvidence,
    decision: labels.stageDecision,
  };
  const activeStage = stage === 'feedback' ? 'decision' : stage;
  const showEvidence = stage !== 'promise';
  const showDecision = stage === 'decision' || stage === 'feedback';
  const decisionLocked = Boolean(verdict);
  const evidenceRows = [
    ['ingredients', labels.ingredientsLabel, product.ingredients],
    ['seal', labels.sealLabel, product.seal],
    ['claim', labels.claimLabel, product.claim],
  ];
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (verdict) onContinue?.();
      else onClose?.();
      return;
    }
    if (stage !== 'decision' || verdict
      || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    event.stopPropagation();
    const nextChoice = event.key === 'ArrowLeft' ? 'trust' : 'flag';
    onSelect?.(nextChoice);
    event.currentTarget.querySelector(`[data-choice="${nextChoice}"]`)?.focus();
  };
  return (
    <aside
      ref={dialogRef}
      className="spot-the-fake-inspector"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spot-the-fake-case-title"
      onKeyDown={handleKeyDown}
    >
      <header className="spot-the-fake-inspector__header">
        <span className="spot-the-fake-inspector__case-tab" aria-hidden="true">
          {labels.caseFileTab}
        </span>
        <h2 id="spot-the-fake-case-title">{labels.dialogLabel}</h2>
        <button type="button" data-dialog-close="true" className="spot-the-fake-inspector__close-hint" data-control="close"
          onClick={verdict ? onContinue : onClose}>
          <span aria-hidden="true">✕</span>
          <span>{labels.close}</span>
        </button>
      </header>

      <ol className="spot-the-fake-inspector__stages" aria-label={labels.stageIndicatorLabel}>
        {STAGES.map((stageName, index) => (
          <li
            className={`spot-the-fake-inspector__stage${activeStage === stageName ? ' is-active' : ''}`}
            aria-current={activeStage === stageName ? 'step' : undefined}
            key={stageName}
          >
            <span className="spot-the-fake-inspector__stage-label">
              <span className="spot-the-fake-inspector__stage-number" aria-hidden="true">
                {index + 1}
              </span>
              {stageLabels[stageName]}
            </span>
            {index < STAGES.length - 1 && <span aria-hidden="true">→</span>}
          </li>
        ))}
      </ol>

      <section className="spot-the-fake-inspector__promise" aria-labelledby="spot-the-fake-promise-label">
        <span id="spot-the-fake-promise-label" className="spot-the-fake-inspector__eyebrow">
          {labels.promiseLabel}
        </span>
        <div className="spot-the-fake-inspector__pack">
          <span className="spot-the-fake-inspector__product" aria-hidden="true">
            {product.emoji}
          </span>
          <strong>{product.front}</strong>
        </div>
      </section>

      {!showEvidence && (
        <button type="button" className="spot-the-fake-inspector__primary" onClick={onFlip}>
          <span aria-hidden="true">↻</span> {labels.flip}
        </button>
      )}

      {showEvidence && (
        <section className="spot-the-fake-inspector__evidence" aria-label={labels.stageEvidence}>
          {evidenceRows.map(([evidenceKey, label, value]) => {
            const highlighted = highlightedEvidence === evidenceKey;
            return (
              <div
                className={`spot-the-fake-inspector__evidence-row${highlighted ? ' is-highlighted' : ''}`}
                data-evidence={evidenceKey}
                data-highlighted={highlighted ? 'true' : 'false'}
                key={evidenceKey}
              >
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            );
          })}
        </section>
      )}

      {stage === 'evidence' && (
        <button
          type="button"
          className="spot-the-fake-inspector__primary"
          data-action="evidence-continue"
          onClick={onEvidenceContinue}
        >
          {labels.continue}
        </button>
      )}

      {showDecision && (
        <section className="spot-the-fake-inspector__decision" aria-label={labels.stageDecision}>
          <div className="spot-the-fake-inspector__choices">
            <button
              type="button"
              className={`spot-the-fake-inspector__choice spot-the-fake-inspector__choice--trust${choice === 'trust' ? ' is-selected' : ''}`}
              data-choice="trust"
              aria-pressed={choice === 'trust'}
              disabled={decisionLocked}
              onClick={() => onChoose('trust')}
            >
              <span aria-hidden="true">✓</span> {labels.supportedChoice}
            </button>
            <button
              type="button"
              className={`spot-the-fake-inspector__choice spot-the-fake-inspector__choice--flag${choice === 'flag' ? ' is-selected' : ''}`}
              data-choice="flag"
              aria-pressed={choice === 'flag'}
              disabled={decisionLocked}
              onClick={() => onChoose('flag')}
            >
              <span aria-hidden="true">⛐</span> {labels.needsEvidenceChoice}
            </button>
          </div>

          {!choice && !verdict && (
            <p className="spot-the-fake-inspector__select-first" role="status">
              {labels.selectFirst}
            </p>
          )}

        </section>
      )}

      {verdict && (
        <section
          className={`spot-the-fake-inspector__feedback spot-the-fake-inspector__feedback--${verdict.correct ? 'correct' : 'wrong'}`}
          aria-live="polite"
        >
          <h3>{verdict.title}</h3>
          <p className="spot-the-fake-inspector__judgement">{verdict.judgement}</p>
          <p data-feedback-reason="true">{verdict.reason}</p>
          {verdict.redFlag && (
            <div className="spot-the-fake-inspector__red-flag" data-red-flag="true">
              <span><span aria-hidden="true">🚩</span> {labels.redFlagLabel}</span>
              <strong>{verdict.redFlag}</strong>
            </div>
          )}
          <div className="spot-the-fake-inspector__rule" data-detector-rule="true">
            <span>{labels.detectorRuleLabel}</span>
            <strong>{verdict.rule}</strong>
          </div>

          <div className="spot-the-fake-inspector__feedback-actions">
            <button type="button" className="spot-the-fake-inspector__primary" onClick={onContinue}>
              {labels.continue}
            </button>
            <button type="button" data-action="source" onClick={onSource}>
              <span aria-hidden="true">📖</span> {labels.source}
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}
