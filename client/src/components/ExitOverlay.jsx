import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useGameStore from '../store/gameStore.js';
import { encodeProgress } from '../utils/playCode.js';

/**
 * ExitOverlay — Full-screen save & exit overlay.
 *
 * Flow:
 *   1. Encodes the player's full progress into a self-contained Play Code
 *   2. Shows that code for the child to copy and keep
 *   3. "Keep playing" (primary) closes the overlay; "Close the game" resets
 *      the store and navigates to lang
 *   4. Escape and clicking the dark backdrop = keep playing, so an accidental
 *      Exit press always has a way back
 */
export default function ExitOverlay({ onNavigateToStart, onKeepPlaying }) {
  const resetProgress = useGameStore((s) => s.resetProgress);
  const { t } = useTranslation();

  // Snapshot the full progress into a portable code once, when the overlay opens.
  const [code] = useState(() => encodeProgress(useGameStore.getState()));
  const [copied, setCopied] = useState(false);
  const keepBtnRef = useRef(null);

  // Not autoFocus: that scrolls the card down to the button on short screens and
  // hides the code above the fold. preventScroll keeps the card at the top.
  useEffect(() => { keepBtnRef.current?.focus({ preventScroll: true }); }, []);

  // Escape = keep playing (capture phase so the game underneath never sees it)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onKeepPlaying?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onKeepPlaying]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExit = () => {
    resetProgress();
    onNavigateToStart();
  };

  // ─── Show the portable Play Code ───
  return (
    <div
      style={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onKeepPlaying?.(); }}
    >
      <div style={styles.card}>
        <p style={styles.title}>{t('exit.progress_saved')}</p>

        <p style={styles.codeLabel}>{t('exit.your_code')}</p>
        <div style={styles.codeDisplay}>{code}</div>

        <p style={styles.instruction}>{t('exit.write_it_down')}</p>

        {/* Copy button */}
        <button onClick={handleCopy} style={styles.copyBtn}>
          {copied ? t('playcode.copied') : t('exit.copy_code')}
        </button>

        <div style={styles.divider} />

        {/* Safe option first — a child who pressed Exit by accident goes back.
            Focused on open: the overlay owns the keyboard, so Enter/Space (the keys
            the game advertises everywhere) confirm the safe choice natively. */}
        <button ref={keepBtnRef} onClick={() => onKeepPlaying?.()} style={styles.keepBtn}>
          {t('exit.keep_playing')}
        </button>

        <button onClick={handleExit} style={styles.exitBtn}>
          {t('exit.close_game')}
        </button>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 500,
  },
  card: {
    background: '#fff',
    borderRadius: 28,
    padding: '40px 48px',
    textAlign: 'center',
    fontFamily: "'Fredoka', sans-serif",
    boxShadow: '0 20px 80px rgba(0,0,0,0.5)',
    maxWidth: 500,
    width: '90%',
    maxHeight: '90dvh',
    overflowY: 'auto',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--pf-purple)',
    marginBottom: 20,
    marginTop: 0,
  },
  codeLabel: {
    fontSize: 14,
    color: 'var(--pf-text)',
    marginBottom: 8,
    fontWeight: 500,
  },
  codeDisplay: {
    fontSize: 19,
    fontWeight: 700,
    fontFamily: 'monospace',
    color: 'var(--pf-purple)',
    background: 'var(--pf-blue-soft)',
    borderRadius: 18,
    padding: '16px 22px',
    marginBottom: 12,
    letterSpacing: 0.5,
    lineHeight: 1.6,
    border: '3px solid var(--pf-purple)',
    textAlign: 'center',
    wordBreak: 'break-word',
    userSelect: 'all',
    maxHeight: '25dvh',
    overflowY: 'auto',
    WebkitUserSelect: 'all',
  },
  instruction: {
    fontSize: 14,
    color: 'var(--pf-text)',
    marginBottom: 20,
    lineHeight: 1.5,
    fontWeight: 500,
  },
  copyBtn: {
    padding: '12px 36px',
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "'Fredoka', sans-serif",
    borderRadius: 14,
    background: 'var(--pf-blue-soft)',
    border: '2px solid var(--pf-purple)',
    color: 'var(--pf-purple)',
    cursor: 'pointer',
    marginBottom: 20,
    minWidth: 180,
  },
  divider: {
    height: 1,
    background: '#E0E0E0',
    margin: '0 0 20px 0',
  },
  keepBtn: {
    padding: '14px 36px',
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "'Fredoka', sans-serif",
    borderRadius: 14,
    background: 'var(--pf-green)',
    border: '2px solid var(--pf-green)',
    color: '#fff',
    cursor: 'pointer',
    display: 'block',
    width: '100%',
    marginBottom: 12,
  },
  exitBtn: {
    padding: '12px 36px',
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "'Fredoka', sans-serif",
    borderRadius: 14,
    background: 'transparent',
    // Functional destructive red — kept separate from BRAND.red pillar identity
    border: '2px solid #EF5350',
    color: '#EF5350',
    cursor: 'pointer',
    display: 'block',
    width: '100%',
  },
};
