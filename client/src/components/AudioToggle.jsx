import React, { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { isSoundEnabled, setSoundEnabled, subscribeSoundEnabled } from '../utils/sound.js';
import { BRAND, WORLD_ART } from '../styles/brandColors.js';

const TOP_HUD_SCREENS = new Set(['menu', 'island']);

export function shouldRenderGlobalAudioToggle(screen) {
  return false;
}

export function getAudioTogglePlacement(inGameBar, screen) {
  return inGameBar || TOP_HUD_SCREENS.has(screen) ? styles.belowHud : styles.floating;
}

export default function AudioToggle({ inGameBar = false, screen = null }) {
  const { t } = useTranslation();
  const enabled = useSyncExternalStore(
    subscribeSoundEnabled,
    isSoundEnabled,
    () => true,
  );
  const label = enabled ? t('audio.disable') : t('audio.enable');

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      data-audio-state={enabled ? 'on' : 'muted'}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => setSoundEnabled(!enabled)}
      style={{
        ...styles.button,
        ...getAudioTogglePlacement(inGameBar, screen),
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" style={styles.speaker}>
        <path d="M4 9h4l5-4v14l-5-4H4z" fill={BRAND.cream} />
        {enabled ? (
          <>
            <path d="M16 9c1.1 1.5 1.1 4.5 0 6" fill="none" stroke={BRAND.cream} strokeWidth="1.8" strokeLinecap="square" />
            <path d="M19 6.5c2.6 3 2.6 8 0 11" fill="none" stroke={BRAND.cream} strokeWidth="1.8" strokeLinecap="square" />
          </>
        ) : (
          <path d="M5 5l15 15" fill="none" stroke={BRAND.red} strokeWidth="2.4" strokeLinecap="square" />
        )}
      </svg>
      <span
        aria-hidden="true"
        style={{
          ...styles.statusLight,
          background: enabled ? WORLD_ART.foliageLight : BRAND.red,
          boxShadow: enabled ? `0 0 5px ${WORLD_ART.foliageLight}` : 'none',
        }}
      />
    </button>
  );
}

const styles = {
  button: {
    width: 44,
    height: 40,
    padding: 0,
    border: `2px solid ${BRAND.cream}`,
    clipPath: 'polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px)',
    background: `linear-gradient(180deg, ${WORLD_ART.dirtAccent} 0%, ${WORLD_ART.woodDeep} 100%)`,
    color: BRAND.textOnColor,
    cursor: 'pointer',
    fontFamily: "'Fredoka', sans-serif",
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `3px 3px 0 rgba(16, 20, 31, 0.5), inset 0 1px 0 rgba(255,255,255,0.18)`,
    zIndex: 90,
  },
  floating: {
    position: 'fixed',
    top: 12,
    right: 12,
  },
  belowHud: {
    position: 'fixed',
    top: 54,
    right: 10,
    width: 38,
    height: 36,
  },
  speaker: {
    width: 23,
    height: 23,
    display: 'block',
  },
  statusLight: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 5,
    height: 5,
    border: `1px solid ${WORLD_ART.panelBrownDeep}`,
  },
};
