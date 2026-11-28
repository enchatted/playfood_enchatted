import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../store/gameStore.js';
import { useTranslation } from 'react-i18next';
import OceanWaves from '../components/OceanWaves.jsx';
import { TinyIsland, Sailboat } from '../components/IslandSvg.jsx';
import EUComplianceFooter from '../components/EUComplianceFooter.jsx';
import { DRAFT_MODE } from '../config/draftMode.js';
import { decodeProgress } from '../utils/playCode.js';
import { LANGUAGES } from './languageOptions.js';

const ARCHIPELAGO_LETTERS = 'Archipelago'.split('');
export default function LanguageSelector({ onNavigate }) {
  const setLanguage = useGameStore((s) => s.setLanguage);
  const restoreProgress = useGameStore((s) => s.restoreProgress);
  const { i18n } = useTranslation();
  // The entry screen is the one place where we do not yet know the child's
  // language. Keep its chrome English without mutating the selected locale;
  // the language card (or restored Play Code) remains the only authority.
  const t = i18n.getFixedT('en');

  // Load modal states
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [loadInput, setLoadInput] = useState('');
  const [loadError, setLoadError] = useState('');
  const loadBtnRef = useRef(null);

  // Close the load modal and hand focus back to the button that opened it.
  const closeLoadModal = () => {
    setShowLoadModal(false);
    loadBtnRef.current?.focus();
  };

  // Escape key closes load modal (when focus is outside it; inside, the overlay's
  // onKeyDown handles it because that handler stops keys from reaching window)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && showLoadModal) closeLoadModal();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showLoadModal]);

  // Select language → straight into the avatar ceremony (client-only, no server)
  const handleSelect = async (code) => {
    setLanguage(code);
    await i18n.changeLanguage(code);
    onNavigate('avatar');
  };

  // Restore progress from a pasted Play Code — decoded locally, case-sensitive
  const handleLoad = async () => {
    const data = decodeProgress(loadInput);
    if (!data) {
      setLoadError(t('playcode.not_found'));
      return;
    }
    restoreProgress(data);
    await i18n.changeLanguage(data.language || 'en');
    setShowLoadModal(false);
    onNavigate('menu');
  };

  // Open load modal — reset stale state
  const openLoadModal = () => {
    setLoadInput('');
    setLoadError('');
    setShowLoadModal(true);
  };

  return (
    <OceanWaves>
      <style>
        {`
          @keyframes playfood-title-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }

          @keyframes archipelago-word-sway {
            0%, 100% { transform: translateY(0) rotate(-1deg); }
            50% { transform: translateY(-3px) rotate(1deg); }
          }

          @keyframes archipelago-letter-wave {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            35% { transform: translateY(-9px) rotate(-2deg); }
            70% { transform: translateY(4px) rotate(1deg); }
          }

          @media (prefers-reduced-motion: reduce) {
            [data-archipelago-word],
            [data-archipelago-letter] {
              animation: none !important;
            }
          }

          [data-language-screen] {
            --language-row-width: min(720px, calc(100vw - 32px));
            --language-screen-padding: clamp(8px, 1.5vh, 16px) 32px;
            --language-title-margin-top: 0px;
            --language-title-margin-bottom: clamp(4px, 1vh, 10px);
            --language-logo-width: min(200px, 42vw);
            --language-logo-max-height: 28vh;
            --language-logo-margin-bottom: 10px;
            --language-word-height: clamp(34px, 5vw, 50px);
            --language-word-size: clamp(29px, 5vw, 46px);
            --language-subtitle-size: 18px;
            --language-subtitle-margin: clamp(8px, 1.5vh, 16px);
            --language-button-padding: 22px 34px;
            --language-flag-size: 64px;
            --language-name-size: 17px;
            --language-name-margin: 12px;
            --language-divider-width: 320px;
            --language-divider-margin: clamp(8px, 1.4vh, 16px);
            --language-divider-gap: 16px;
            --language-divider-size: 14px;
            --language-load-margin: 6px;
            --language-load-padding: 11px 26px;
            --language-load-size: 15px;
            --eu-footer-margin: 36px;
            --eu-panel-padding: 4px 30px;
            --eu-emblem-height: 44px;
            --eu-meta-font-size: 14px;
            --eu-info-target: 40px;
            --eu-info-glyph: 20px;
          }

          @media (max-height: 520px) and (orientation: landscape) {
            [data-language-screen] {
              --language-screen-padding: 4px 16px;
              --language-title-margin-bottom: 0px;
              --language-logo-width: 70px;
              --language-logo-max-height: 70px;
              --language-logo-margin-bottom: 2px;
              --language-word-height: 26px;
              --language-word-size: 24px;
              --language-subtitle-size: 13px;
              --language-subtitle-margin: 3px;
              --language-button-padding: 5px 16px;
              --language-flag-size: 30px;
              --language-name-size: 12px;
              --language-name-margin: 3px;
              --language-divider-width: 240px;
              --language-divider-margin: 3px;
              --language-divider-gap: 8px;
              --language-divider-size: 12px;
              --language-load-margin: 3px;
              --language-load-padding: 5px 18px;
              --language-load-size: 12px;
              --eu-footer-margin: 10px;
              --eu-panel-padding: 2px 16px;
              --eu-emblem-height: 30px;
              --eu-meta-font-size: 11px;
              --eu-info-target: 28px;
              --eu-info-glyph: 18px;
            }
          }
        `}
      </style>
      <div data-language-screen lang="en" style={styles.container}>
        {/* Decorative islands & boats — hidden in DRAFT_MODE */}
        {!DRAFT_MODE && (
          <>
            <div style={{ ...styles.deco, left: '8%', top: '18%' }}><TinyIsland /></div>
            <div style={{ ...styles.deco, left: '85%', top: '22%', animationDelay: '1s' }}><TinyIsland /></div>
            <div style={{ ...styles.deco, left: '92%', top: '55%', animationDelay: '2s' }}><TinyIsland /></div>
            <div style={{ ...styles.boat, left: '15%', top: '65%' }}><Sailboat /></div>
            <div style={{ ...styles.boat, left: '78%', top: '70%', animationDelay: '1.5s' }}><Sailboat /></div>
          </>
        )}

        {/* Title lockup — official Playfood logo + Archipelago wordmark */}
        <h1 aria-label="Playfood Archipelago" style={DRAFT_MODE ? styles.titleLockupDraft : styles.titleLockup}>
          <img
            src="/assets/logos/primary-logo-01.svg"
            alt="Playfood"
            style={DRAFT_MODE ? styles.logoDraft : styles.logo}
          />
          <div data-archipelago-word style={DRAFT_MODE ? styles.archipelagoWordDraft : styles.archipelagoWord} aria-hidden="true">
            {ARCHIPELAGO_LETTERS.map((letter, index) => (
              <span
                data-archipelago-letter
                key={`${letter}-${index}`}
                style={{
                  ...styles.archipelagoLetter,
                  animationDelay: `${index * 0.08}s`,
                }}
              >
                {letter}
              </span>
            ))}
          </div>
        </h1>

        <p style={DRAFT_MODE ? styles.subtitleDraft : styles.subtitle}>
          {t('lang.choose')}
        </p>

        <div data-language-options style={DRAFT_MODE ? styles.buttonsDraft : styles.buttons}>
          {LANGUAGES.map((lang) => (
            <div key={lang.code} style={styles.langWrapper}>
              <button
                onClick={() => handleSelect(lang.code)}
                style={{
                  ...(DRAFT_MODE ? styles.btnDraft : styles.btn),
                  borderColor: lang.color,
                  ...(DRAFT_MODE ? {} : { boxShadow: `0 6px 20px ${lang.color}40` }),
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-6px) scale(1.05)';
                  if (!DRAFT_MODE) e.currentTarget.style.boxShadow = `0 12px 30px ${lang.color}60`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  if (!DRAFT_MODE) e.currentTarget.style.boxShadow = `0 6px 20px ${lang.color}40`;
                }}
              >
                <span style={styles.flag} aria-hidden="true">{lang.flag}</span>
                <span style={styles.langName} lang={lang.nameLang}>{lang.name}</span>
              </button>
            </div>
          ))}
        </div>

        {/* "Or" divider */}
        <div style={styles.orDivider}>
          <div style={styles.orLine} />
          <span style={styles.orText}>{t('lang.or')}</span>
          <div style={styles.orLine} />
        </div>

        {/* Load Progress button */}
        <button ref={loadBtnRef} onClick={openLoadModal} style={styles.loadBtn}>
          {'\uD83D\uDD11'} {t('playcode.continue_btn')}
        </button>

        <EUComplianceFooter language="en" />

        {/* --- Load Progress Modal --- */}
        {showLoadModal && (
          <div
            style={styles.modalOverlay}
            onClick={closeLoadModal}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') closeLoadModal();
            }}
          >
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <button onClick={closeLoadModal} style={styles.closeBtn}>{'\u2715'}</button>
              <h2 style={styles.modalTitle}>{'\uD83D\uDD11'} {t('playcode.load_title')}</h2>
              <p style={styles.modalDesc}>{t('playcode.load_desc')}</p>
              <input
                type="text"
                value={loadInput}
                onChange={(e) => { setLoadInput(e.target.value); setLoadError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
                placeholder={t('playcode.load_placeholder')}
                style={styles.input}
                autoFocus
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
              />
              {loadError && <p style={styles.error}>{loadError}</p>}
              <div style={styles.modalButtons}>
                <button onClick={closeLoadModal} style={styles.cancelBtn}>{t('playcode.cancel')}</button>
                <button onClick={handleLoad} disabled={!loadInput.trim()} style={styles.submitBtn}>
                  {t('playcode.load_btn')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OceanWaves>
  );
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--language-screen-padding)',
    boxSizing: 'border-box',
    position: 'relative',
  },
  deco: {
    position: 'absolute',
    opacity: 0.7,
    pointerEvents: 'none',
    animation: 'float 4s ease-in-out infinite',
    zIndex: 0,
  },
  boat: {
    position: 'absolute',
    opacity: 0.5,
    pointerEvents: 'none',
    animation: 'float 5s ease-in-out infinite',
    zIndex: 0,
  },
  titleLockup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 'var(--language-title-margin-top)',
    marginBottom: 'var(--language-title-margin-bottom)',
    marginBlockStart: 'var(--language-title-margin-top)',
    marginBlockEnd: 'var(--language-title-margin-bottom)',
    padding: 0,
    lineHeight: 1,
    animation: 'playfood-title-float 5.5s ease-in-out infinite',
    zIndex: 1,
  },
  titleLockupDraft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 'var(--language-title-margin-top)',
    marginBottom: 'var(--language-title-margin-bottom)',
    marginBlockStart: 'var(--language-title-margin-top)',
    marginBlockEnd: 'var(--language-title-margin-bottom)',
    padding: 0,
    lineHeight: 1,
    zIndex: 1,
  },
  logo: {
    width: 'var(--language-logo-width)',
    height: 'auto',
    maxHeight: 'var(--language-logo-max-height)',
    display: 'block',
    marginBottom: 'var(--language-logo-margin-bottom)',
    objectFit: 'contain',
  },
  logoDraft: {
    width: 'var(--language-logo-width)',
    height: 'auto',
    maxHeight: 'var(--language-logo-max-height)',
    display: 'block',
    marginBottom: 'var(--language-logo-margin-bottom)',
    objectFit: 'contain',
  },
  archipelagoWord: {
    display: 'inline-flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    minHeight: 'var(--language-word-height)',
    padding: '2px 6px',
    filter: 'drop-shadow(0 2px 4px rgba(83,63,139,0.18))',
    animation: 'archipelago-word-sway 4.8s ease-in-out infinite',
  },
  archipelagoWordDraft: {
    display: 'inline-flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    minHeight: 'var(--language-word-height)',
    padding: '2px 6px',
  },
  archipelagoLetter: {
    display: 'inline-block',
    fontFamily: 'var(--pf-font-head), "IBM Plex Sans", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: 'var(--language-word-size)',
    color: 'var(--pf-purple)',
    letterSpacing: 0,
    lineHeight: 1,
    textShadow: 'none',
    transformOrigin: '50% 80%',
    animation: 'archipelago-letter-wave 2.2s ease-in-out infinite',
  },
  subtitle: {
    fontSize: 'var(--language-subtitle-size)',
    color: 'var(--pf-text)',
    marginBottom: 'var(--language-subtitle-margin)',
    opacity: 0.72,
    animation: 'slide-up 0.8s ease-out',
    zIndex: 1,
  },
  buttons: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 'clamp(8px, 1.5vw, 28px)',
    width: 'var(--language-row-width)',
    animation: 'slide-up 1s ease-out',
    zIndex: 1,
  },
  langWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  islandAbove: {
    marginBottom: -6,
    animation: 'float 4s ease-in-out infinite',
  },
  btn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--language-button-padding)',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(8px)',
    border: '3px solid',
    color: 'var(--pf-text)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontFamily: 'inherit',
  },
  flag: { fontSize: 'var(--language-flag-size)', lineHeight: 1 },
  langName: {
    marginTop: 'var(--language-name-margin)',
    fontFamily: 'var(--pf-font-body), system-ui, sans-serif',
    fontSize: 'var(--language-name-size)',
    fontWeight: 700,
    color: 'var(--pf-text)',
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
  },
  // DRAFT_MODE alternatives
  titleDraft: {
    fontSize: 52,
    fontWeight: 700,
    color: 'var(--pf-purple)',
    marginBottom: 12,
    zIndex: 1,
  },
  subtitleDraft: {
    fontSize: 'var(--language-subtitle-size)',
    color: 'var(--pf-text)',
    marginBottom: 'var(--language-subtitle-margin)',
    opacity: 0.8,
    zIndex: 1,
  },
  buttonsDraft: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 'clamp(8px, 1.5vw, 28px)',
    width: 'var(--language-row-width)',
    zIndex: 1,
  },
  btnDraft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--language-button-padding)',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.9)',
    border: '3px solid',
    color: 'var(--pf-text)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontFamily: 'inherit',
  },
  orDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--language-divider-gap)',
    width: 'min(var(--language-divider-width), calc(100vw - 32px))',
    maxWidth: 'none',
    marginTop: 'var(--language-divider-margin)',
    zIndex: 1,
  },
  orLine: {
    flex: 1,
    height: 1,
    background: 'rgba(83, 63, 139, 0.25)',
  },
  orText: {
    fontSize: 'var(--language-divider-size)',
    fontWeight: 400,
    fontStyle: 'italic',
    color: 'rgba(83, 63, 139, 0.62)',
    fontFamily: 'var(--pf-font-body), system-ui, sans-serif',
    whiteSpace: 'nowrap',
  },
  loadBtn: {
    marginTop: 'var(--language-load-margin)',
    padding: 'var(--language-load-padding)',
    fontSize: 'var(--language-load-size)',
    fontWeight: 700,
    fontFamily: 'var(--pf-font-body), system-ui, sans-serif',
    borderRadius: 14,
    background: '#FFFFFF',
    border: '2px solid var(--pf-purple)',
    color: 'var(--pf-purple)',
    cursor: 'pointer',
    letterSpacing: '0.01em',
    boxShadow: '0 4px 14px rgba(83,63,139,0.14)',
    transition: 'all 0.2s ease',
    zIndex: 1,
  },
  // Modal — matching PhygitalModal pattern
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(83, 63, 139, 0.42)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  modal: {
    background: '#fff',
    borderRadius: 24,
    padding: '32px 40px',
    maxWidth: 420,
    width: '90%',
    textAlign: 'center',
    fontFamily: 'var(--pf-font-body), system-ui, sans-serif',
    position: 'relative',
    boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 14,
    background: 'none',
    border: 'none',
    color: 'var(--pf-purple)',
    fontSize: 22,
    cursor: 'pointer',
    fontWeight: 700,
  },
  modalTitle: {
    fontFamily: 'var(--pf-font-head), "IBM Plex Sans", system-ui, sans-serif',
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--pf-purple)',
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14,
    color: 'var(--pf-text)',
    opacity: 0.72,
    marginBottom: 20,
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: 16,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    borderRadius: 12,
    border: '2px solid var(--pf-purple)',
    background: 'var(--pf-cream)',
    color: 'var(--pf-text)',
    textAlign: 'center',
    outline: 'none',
    boxSizing: 'border-box',
  },
  error: {
    color: 'var(--pf-red)',
    fontSize: 13,
    marginTop: 8,
    fontWeight: 600,
  },
  modalButtons: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    marginTop: 20,
  },
  cancelBtn: {
    padding: '10px 24px',
    fontSize: 14,
    fontFamily: 'var(--pf-font-body), system-ui, sans-serif',
    borderRadius: 12,
    background: '#F5F5F5',
    border: '1px solid rgba(83,63,139,0.18)',
    color: 'var(--pf-purple)',
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'var(--pf-font-body), system-ui, sans-serif',
    borderRadius: 12,
    background: 'var(--pf-green)',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
  },
};
