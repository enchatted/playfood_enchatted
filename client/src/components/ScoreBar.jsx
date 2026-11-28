import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DRAFT_MODE } from '../config/draftMode.js';
import LiveStars, { LIVE_STARS_KEYFRAMES } from './LiveStars.jsx';

export const URGENT_KEYFRAMES = `
@keyframes urgentPulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.12); }
}
@keyframes urgentShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-3px); }
  40% { transform: translateX(3px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}
`;

export default function ScoreBar({ score, showScore = true, stars, starsLabel, timeLeft, headerStatus, onPause, onInstructions, onExit, onFreeze }) {
  const { t } = useTranslation();
  const urgent = timeLeft != null && timeLeft < 15;
  // Header controls. Exit is gated behind a mini-confirm so a child
  // can't drop their run with a stray tap.
  const [confirmingExit, setConfirmingExit] = useState(false);

  const closeConfirm = () => { setConfirmingExit(false); if (onFreeze) onFreeze(false); };
  const openConfirm = () => { setConfirmingExit(true); if (onFreeze) onFreeze(true); };

  const renderControls = (sx) => (confirmingExit ? (
    <div style={sx.controls}>
      <span style={sx.confirmText}>{t('game.confirm_exit')}</span>
      <button onMouseDown={(e) => e.preventDefault()} onClick={onExit} style={sx.confirmYes}>{t('game.confirm_yes')}</button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={closeConfirm} style={sx.confirmNo}>{t('game.confirm_no')}</button>
    </div>
  ) : (
    <div style={sx.controls}>
      {onInstructions && (
        <button onMouseDown={(e) => e.preventDefault()} onClick={onInstructions} style={sx.pauseBtn}>📖 {t('game.instructions')}</button>
      )}
      <button onMouseDown={(e) => e.preventDefault()} onClick={onPause} style={sx.pauseBtn}>⏸️ {t('game.pause')}</button>
      {onExit && (
        <button onMouseDown={(e) => e.preventDefault()} onClick={openConfirm} style={sx.pauseBtn}>✕ {t('game.quit')}</button>
      )}
    </div>
  ));

  if (DRAFT_MODE) {
    return (
      <div style={{
        ...draftStyles.bar,
        position: 'relative',
        ...(urgent ? { background: '#C62828' } : {}),
      }} data-testid="game-scorebar">
        <div style={draftStyles.leadingGroup}>
          {showScore && <span style={draftStyles.score}>⭐ {t('game.score')}: {score}</span>}
          {headerStatus && <div style={draftStyles.headerStatus}>{headerStatus}</div>}
        </div>
        {typeof stars === 'number' && (
          <div style={styles.starsPreview}>
            {starsLabel && <span className="scorebar-stars-label" style={styles.starsLabel}>{starsLabel}</span>}
            <LiveStars stars={stars} />
          </div>
        )}
        {timeLeft != null && (
          <span data-testid="scorebar-time" style={{ ...draftStyles.time, color: urgent ? '#FFCDD2' : '#FFF8E1' }}>
            ⏱️ {t('game.time_left')}: {timeLeft}s
          </span>
        )}
        {renderControls(draftStyles)}
      </div>
    );
  }

  return (
    <>
      {urgent && <style>{URGENT_KEYFRAMES}</style>}
      {typeof stars === 'number' && <style>{LIVE_STARS_KEYFRAMES}</style>}
      <div style={{
        ...styles.bar,
        position: 'relative',
        ...(urgent ? { background: 'linear-gradient(180deg, #C62828 0%, #8E0000 100%)', borderBottomColor: '#B71C1C', animation: 'urgentShake 0.4s ease-in-out infinite' } : {}),
      }} data-testid="game-scorebar">
        <div style={styles.leadingGroup}>
          {showScore && <span style={styles.score}>⭐ {t('game.score')}: {score}</span>}
          {headerStatus && <div style={styles.headerStatus}>{headerStatus}</div>}
        </div>
        {typeof stars === 'number' && (
          <div style={styles.starsPreview}>
            {starsLabel && <span className="scorebar-stars-label" style={styles.starsLabel}>{starsLabel}</span>}
            <LiveStars stars={stars} />
          </div>
        )}
        {timeLeft != null && (
          <span data-testid="scorebar-time" style={{
            ...styles.time,
            color: urgent ? '#FFCDD2' : '#FFF8E1',
            ...(urgent ? { animation: 'urgentPulse 0.6s ease-in-out infinite', display: 'inline-block' } : {}),
          }}>
            ⏱️ {t('game.time_left')}: {timeLeft}s
          </span>
        )}
        {renderControls(styles)}
      </div>
    </>
  );
}

// Tavern wood theme — deliberate aesthetic, kept LEGACY by design.
// Urgent timer reds (#C62828/#B71C1C/#8E0000) are functional warning red,
// kept separate from BRAND.red pillar identity.
// Score gold (#FFD54F) is reward gold — kept as functional accent, not brand chrome.
const styles = {
  bar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 20px',
    background: 'linear-gradient(180deg, #8D6E63 0%, #6D4C41 100%)',
    borderBottom: '3px solid #4E342E',
    boxShadow: '0 3px 10px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
  },
  leadingGroup: { display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1.4vw, 20px)', minWidth: 0 },
  headerStatus: { display: 'flex', alignItems: 'center', minWidth: 0 },
  score: { fontSize: 18, color: '#FFD54F', fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.4)' }, // reward gold
  starsPreview: {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
  },
  starsLabel: {
    fontSize: 12, lineHeight: 1, fontWeight: 700, color: '#FFF8E1',
    whiteSpace: 'nowrap', textShadow: '1px 1px 2px rgba(0,0,0,0.4)',
  },
  time: {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
    fontSize: 18, fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.4)',
    whiteSpace: 'nowrap',
  },
  pauseBtn: {
    fontSize: 14,
    fontWeight: 600,
    padding: '6px 18px',
    borderRadius: 20,
    background: 'linear-gradient(180deg, #A1887F 0%, #8D6E63 100%)',
    border: '2px solid #5D4037',
    color: '#FFF8E1',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textShadow: '1px 1px 1px rgba(0,0,0,0.3)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
  },
  controls: { display: 'flex', alignItems: 'center', gap: 8 },
  confirmText: { fontSize: 13, color: '#FFF8E1', fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.4)' },
  confirmYes: {
    fontSize: 14, fontWeight: 700, padding: '6px 16px', borderRadius: 20,
    background: 'linear-gradient(180deg, #C62828 0%, #8E0000 100%)', border: '2px solid #B71C1C',
    color: '#fff', cursor: 'pointer', fontFamily: 'inherit', textShadow: '1px 1px 1px rgba(0,0,0,0.3)',
  },
  confirmNo: {
    fontSize: 14, fontWeight: 600, padding: '6px 16px', borderRadius: 20,
    background: 'linear-gradient(180deg, #A1887F 0%, #8D6E63 100%)', border: '2px solid #5D4037',
    color: '#FFF8E1', cursor: 'pointer', fontFamily: 'inherit',
  },
};

// DRAFT_MODE: flat colors, no animations, no shadows
const draftStyles = {
  bar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 20px',
    background: '#6D4C41',
    borderBottom: '3px solid #4E342E',
  },
  leadingGroup: { display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1.4vw, 20px)', minWidth: 0 },
  headerStatus: { display: 'flex', alignItems: 'center', minWidth: 0 },
  score: { fontSize: 18, color: '#FFD54F', fontWeight: 700 }, // reward gold
  time: {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
    fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap',
  },
  pauseBtn: {
    fontSize: 14, fontWeight: 600, padding: '6px 18px', borderRadius: 20,
    background: '#8D6E63', border: '2px solid #5D4037', color: '#FFF8E1',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  controls: { display: 'flex', alignItems: 'center', gap: 8 },
  confirmText: { fontSize: 13, color: '#FFF8E1', fontWeight: 700 },
  confirmYes: {
    fontSize: 14, fontWeight: 700, padding: '6px 16px', borderRadius: 20,
    background: '#C62828', border: '2px solid #B71C1C', color: '#fff',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  confirmNo: {
    fontSize: 14, fontWeight: 600, padding: '6px 16px', borderRadius: 20,
    background: '#8D6E63', border: '2px solid #5D4037', color: '#FFF8E1',
    cursor: 'pointer', fontFamily: 'inherit',
  },
};
