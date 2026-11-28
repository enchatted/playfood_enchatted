import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Shared inline exit confirm for the bespoke top bars (CompostCreator / GardenPlanner /
// SeasonMatcher). Mirrors ScoreBar's FIX-C two-step quit so a child can't drop their run
// with a stray tap: the first tap swaps the «✕ Έξοδος» button for a confirm row, and only
// a deliberate «Yes» actually leaves. `style` is the bar's own pill style — the row keeps
// that theme, with «Yes» tinted warning-red (matching ScoreBar). `onFreeze` is wired by all
// three bespoke bars to set state.exitConfirmOpen, so useGameRoomCanvas freezes the game
// loop/input while the confirm is open (parity with ScoreBar); guarded so omitting it is safe.
export default function ExitConfirmButton({ onExit, style, onFreeze, floatingConfirm = false }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  const open = () => { setConfirming(true); if (onFreeze) onFreeze(true); };
  const close = () => { setConfirming(false); if (onFreeze) onFreeze(false); };

  if (!confirming) {
    return (
      <button type="button" onMouseDown={(e) => e.preventDefault()} style={style} onClick={open}>
        ✕ {t('game.quit', 'Έξοδος')}
      </button>
    );
  }

  const confirmation = (
    <span data-exit-confirm="true" style={floatingConfirm ? confirmStyles.popup : confirmStyles.row}>
      <span style={{ ...confirmStyles.text, ...(floatingConfirm ? confirmStyles.popupText : {}) }}>{t('game.confirm_exit')}</span>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onExit} style={{ ...style, ...confirmStyles.yes }}>
        {t('game.confirm_yes')}
      </button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={close} style={style} autoFocus={floatingConfirm}>
        {t('game.confirm_no')}
      </button>
    </span>
  );
  if (!floatingConfirm) return confirmation;

  // Keep the original grid footprint while the confirmation floats below the HUD.
  return (
    <span data-exit-anchor="true" style={confirmStyles.anchor}>
      <button type="button" disabled aria-hidden="true" tabIndex={-1} style={{ ...style, visibility: 'hidden' }}>
        ✕ {t('game.quit', 'Έξοδος')}
      </button>
      {confirmation}
    </span>
  );
}

const confirmStyles = {
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  text: { fontSize: 13, fontWeight: 700, color: '#FFF8E1', textShadow: '1px 1px 2px rgba(0,0,0,0.45)' },
  yes: { background: 'linear-gradient(180deg, #C62828 0%, #8E0000 100%)', color: '#fff' },
  anchor: { position: 'relative', display: 'inline-flex' },
  popup: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60,
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
    width: 'max-content', maxWidth: 'min(340px, calc(100vw - 32px))',
    boxSizing: 'border-box', padding: 12, border: '2px solid #4E342E', borderRadius: 8,
    background: '#6D4C41', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  },
  popupText: { gridColumn: '1 / -1', whiteSpace: 'normal', lineHeight: 1.4 },
};
