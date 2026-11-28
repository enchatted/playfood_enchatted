import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useGameStore from '../store/gameStore.js';
import { BRAND, WORLD_ART } from '../styles/brandColors.js';

/**
 * PhygitalModal — controlled overlay for phygital code entry.
 *
 * Props:
 *   isOpen   — whether the modal is visible
 *   onClose  — callback to close the modal
 */
export function shouldClosePhygitalFromKey(key) {
  return key === 'Escape';
}

export default function PhygitalModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const redeemCode = useGameStore((s) => s.redeemCode);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const inputRef = useRef(null);
  const modalRef = useRef(null);

  // Auto-focus input when opening
  useEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement;
    inputRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [isOpen]);

  // The input is disabled while checking, which drops its focus; give it back after a
  // rejection so keyboard players can retype, retry and leave with Escape.
  useEffect(() => {
    if (message?.type === 'error') inputRef.current?.focus();
  }, [message]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim() || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setMessage(null);
    const result = await redeemCode(code);
    pendingRef.current = false;
    setPending(false);
    if (result.success) {
      setMessage({ type: 'success', text: t('phygital.success', { points: result.points }), description: result.description });
      setCode('');
    } else {
      setMessage({
        type: 'error',
        text: result.reason === 'already_redeemed'
          ? t('phygital.already_used')
          : result.reason === 'unavailable' ? t('phygital.unavailable')
          : result.reason === 'limit_reached' ? t('phygital.limit_reached')
          : t('phygital.invalid'),
      });
    }
  };

  const handleClose = () => {
    if (pendingRef.current) return;
    setCode('');
    setMessage(null);
    onClose();
  };

  const handleKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === 'Tab') {
      const controls = [...(modalRef.current?.querySelectorAll('input:not(:disabled), button:not(:disabled)') || [])];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (!shouldClosePhygitalFromKey(event.key)) return;
    event.preventDefault();
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onKeyDown={handleKeyDown}>
      <div ref={modalRef} className="phygital-modal" style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="phygital-heading">
        <style>{`.phygital-modal input:focus-visible, .phygital-modal button:focus-visible { outline: 3px solid ${BRAND.purple}; outline-offset: 3px; }`}</style>
        <h3 id="phygital-heading" style={styles.heading}>{t('phygital.enter_code')}</h3>
        <p id="phygital-help" style={styles.help}>{t('phygital.help')}</p>
        {message?.type !== 'success' && <form onSubmit={handleSubmit} style={styles.form}>
          <input
            ref={inputRef}
            aria-label={t('phygital.enter_code')}
            aria-describedby="phygital-help"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('phygital.placeholder')}
            style={styles.input}
            maxLength={32}
            disabled={pending}
          />
          <button type="submit" disabled={pending} style={styles.submitBtn}>{t(pending ? 'phygital.checking' : 'phygital.submit')}</button>
        </form>}
        {message && (
          <p role="status" style={{
            ...styles.msg,
            // Dark text colors keep both success and error readable on the cream panel.
            color: message.type === 'success' ? WORLD_ART.textGreen : '#B71C1C',
          }}>
            {message.text}
          </p>
        )}
        {message?.description && <p style={styles.description}>{message.description}</p>}
        {message?.type === 'success' && <button autoFocus onClick={handleClose} style={styles.submitBtn}>{t('phygital.continue')}</button>}
        <button aria-label={t('common.close')} disabled={pending} onClick={handleClose} style={styles.closeBtn}>✕</button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(18, 22, 28, 0.55)', // neutral premium scrim (no purple tint)
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  modal: {
    background: WORLD_ART.panelCream, // clean warm cream (#FFF8E1)
    borderRadius: 18,
    padding: 32,
    width: 480,
    minWidth: 0,
    maxWidth: 'calc(100vw - 96px)',
    position: 'relative',
    textAlign: 'center',
    boxSizing: 'content-box',
    maxHeight: 'calc(100dvh - 96px)',
    overflowY: 'auto',
    border: '1px solid rgba(109,176,108,0.35)', // hairline brand-green accent
    boxShadow: '0 16px 44px rgba(35, 45, 30, 0.30)',
  },
  heading: { color: WORLD_ART.textGreen, fontSize: 22, fontWeight: 800, marginBottom: 20, letterSpacing: 0.2 },
  help: {
    maxWidth: 420, margin: '0 auto 18px', color: WORLD_ART.panelBrown,
    fontSize: 15, lineHeight: 1.4, fontWeight: 650,
  },
  description: { margin: '0 auto 18px', color: WORLD_ART.panelBrown, fontSize: 15, lineHeight: 1.4, fontWeight: 650 },
  form: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  input: {
    flex: '1 1 230px',
    minWidth: 0,
    padding: '12px 16px',
    borderRadius: 10,
    border: `2px solid ${BRAND.green}`, // crisp solid brand-green border (was purple)
    background: '#FFFFFF',              // clean white field (was a blue-soft tint)
    color: '#2C2A24',                   // ink text (was purple)
    fontSize: 18,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textOverflow: 'ellipsis', // safety net: clip overflow instead of hard-cutting
    fontFamily: 'inherit',
    fontWeight: 700,
    boxSizing: 'border-box',
  },
  submitBtn: {
    padding: '12px 24px',
    borderRadius: 10,
    border: 'none',
    background: WORLD_ART.textGreen,
    color: '#fff',
    fontWeight: 800,
    fontSize: 16,
    letterSpacing: 0.3,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  msg: { margin: '14px 0 12px', fontSize: 15, fontWeight: 700 },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 14,
    background: 'none',
    border: 'none',
    color: WORLD_ART.panelBrown,
    minWidth: 44,
    minHeight: 44,
    fontSize: 22,
    lineHeight: 1,
    cursor: 'pointer',
    fontWeight: 700,
  },
};
