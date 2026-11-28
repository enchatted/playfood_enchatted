import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { getSoundLevel, setSoundLevel, setSoundEnabled, subscribeSoundEnabled, SOUND_LEVELS } from '../utils/sound.js';
import { useBlockingCanvasOverlay } from './ActiveCanvasStage.jsx';
import './soundControls.css';

export function SoundControls() {
  const { t } = useTranslation();
  const level = useSyncExternalStore(subscribeSoundEnabled, getSoundLevel, () => 100);
  function focusAdjacentLevel(event) {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
    const next = (buttons.indexOf(event.target) + step + buttons.length) % buttons.length;
    buttons[next].focus();
  }
  return (
    <fieldset className="pf-sound-controls" onKeyDown={focusAdjacentLevel}>
      <legend>{t('audio.volume')}</legend>
      <button type="button" aria-pressed={level === 0} onClick={() => setSoundEnabled(!level)}>
        {t(level ? 'audio.mute' : 'audio.unmute')}
      </button>
      {SOUND_LEVELS.map(value => (
        <button key={value} type="button" aria-pressed={level === value} onClick={() => setSoundLevel(value)}>
          {value}%
        </button>
      ))}
    </fieldset>
  );
}

export function MapSoundDialog({ onClose }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  useBlockingCanvasOverlay();
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="pf-sound-dialog" aria-labelledby="map-sound-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => event.stopPropagation()}>
      <h2 id="map-sound-title">{t('audio.title')}</h2>
      <SoundControls />
      <button type="button" className="pf-sound-close" onClick={onClose}>{t('audio.close')}</button>
    </dialog>
  );
}
