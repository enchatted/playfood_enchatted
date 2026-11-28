import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getEuEmblemSrc } from '../utils/euBranding.js';

// EU compliance footer uses system sans (not Playfood brand fonts) so the
// funding statement reads as institutional/legal information, distinct
// from the game branding.
const SYS_FONT = 'Arial, Tahoma, Verdana, sans-serif';

export default function EUComplianceFooter({ language }) {
  const { t: activeT, i18n } = useTranslation();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!showDisclaimer) return;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setShowDisclaimer(false);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => {
      window.removeEventListener('keydown', handleKey, true);
      previousFocus?.focus();
    };
  }, [showDisclaimer]);

  const footerLanguage = language || i18n.language;
  const t = language ? i18n.getFixedT(language) : activeT;
  const emblemSrc = getEuEmblemSrc(footerLanguage);

  return (
    <>
      <div style={styles.wrap} role="contentinfo" lang={language || undefined}>
        <div style={styles.panel}>
          <img
            src={emblemSrc}
            alt={t('eu.emblem_alt')}
            style={styles.emblem}
          />
          <div style={styles.metaRow}>
            <span style={styles.projectNo}>{t('eu.project_no')}</span>
            <span style={styles.dot} aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setShowDisclaimer(true)}
              aria-label={t('eu.disclaimer_aria')}
              style={styles.infoBtn}
            >
              <span aria-hidden="true" style={styles.infoGlyph}>i</span>
              <span style={styles.infoLabel}>{t('eu.disclaimer_short')}</span>
            </button>
          </div>
        </div>
      </div>

      {showDisclaimer && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowDisclaimer(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="eu-disclaimer-title"
        >
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setShowDisclaimer(false)}
              aria-label={t('eu.close')}
              style={styles.modalClose}
            >
              ✕
            </button>
            <h2 id="eu-disclaimer-title" style={styles.modalTitle}>{t('eu.disclaimer_title')}</h2>
            <p style={styles.modalBody}>{t('eu.disclaimer_body')}</p>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  wrap: {
    marginTop: 'var(--eu-footer-margin, 18px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: 'var(--language-row-width, min(680px, calc(100vw - 32px)))',
    zIndex: 1,
  },
  panel: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: 'var(--eu-panel-padding, 10px 20px 12px)',
    background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.38) 18%, rgba(255,255,255,0.38) 82%, rgba(255,255,255,0) 100%)',
    border: 'none',
    borderRadius: 0,
    boxShadow: 'none',
    backdropFilter: 'none',
    boxSizing: 'border-box',
  },
  emblem: {
    height: 'var(--eu-emblem-height, 48px)',
    maxWidth: 'min(420px, 100%)',
    width: 'auto',
    display: 'block',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    fontFamily: SYS_FONT,
    color: '#1A1A1A',
    textShadow: 'none',
    lineHeight: 1.25,
  },
  projectNo: {
    fontSize: 'var(--eu-meta-font-size, 14px)',
    opacity: 0.82,
    letterSpacing: '0.01em',
  },
  dot: {
    color: '#1A1A1A',
    opacity: 0.42,
    fontSize: 'calc(var(--eu-meta-font-size, 14px) + 2px)',
    lineHeight: 1,
  },
  infoBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 'var(--eu-info-target, 40px)',
    padding: '0 6px',
    background: 'transparent',
    border: 'none',
    borderRadius: 12,
    color: '#003399',
    fontFamily: SYS_FONT,
    fontSize: 'var(--eu-meta-font-size, 14px)',
    lineHeight: 1.2,
    cursor: 'pointer',
    textShadow: 'none',
  },
  infoGlyph: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'var(--eu-info-glyph, 22px)',
    height: 'var(--eu-info-glyph, 22px)',
    borderRadius: '50%',
    border: '1px solid #003399',
    fontStyle: 'italic',
    fontWeight: 700,
    fontSize: 'calc(var(--eu-meta-font-size, 14px) - 2px)',
  },
  infoLabel: { whiteSpace: 'nowrap' },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 400,
    padding: 16,
  },
  modal: {
    background: '#FFFFFF',
    padding: '24px 28px 22px',
    borderRadius: 12,
    maxWidth: 560,
    width: '100%',
    maxHeight: 'calc(100dvh - 32px)',
    overflowY: 'auto',
    boxSizing: 'border-box',
    position: 'relative',
    fontFamily: SYS_FONT,
    color: '#1A1A1A',
    boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
  },
  modalClose: {
    position: 'absolute',
    top: 8,
    right: 10,
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    color: '#1A1A1A',
    padding: 6,
    lineHeight: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 700,
    marginBottom: 14,
    fontFamily: SYS_FONT,
  },
  modalBody: {
    fontSize: 13,
    lineHeight: 1.55,
    color: '#222222',
  },
};
