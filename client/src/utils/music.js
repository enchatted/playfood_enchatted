import { getSoundLevel, isSoundEnabled, subscribeSoundEnabled } from './sound.js';

const EXPLORATION_BACKGROUND = {
  src: '/assets/audio/calm-track-loop.ogg',
  volume: 0.08,
};
const GAMEPLAY_BACKGROUND = {
  src: '/assets/audio/cozy-puzzle-gameplay-loop.mp3',
  volume: 0.06,
};
const BACKGROUND_SCREENS = new Set([
  'lang',
  'avatar',
  'menu',
  'hub',
  'island',
  'lighthouse',
  'game',
]);
const CUES = {
  success: {
    src: '/assets/audio/cozy-puzzle-clear-jingle.mp3',
    volume: 0.22,
  },
  retry: {
    src: '/assets/audio/cozy-puzzle-failure-jingle.mp3',
    volume: 0.14,
  },
  milestone: {
    src: '/assets/audio/win-vibraphone.ogg',
    volume: 0.55,
    pauseBackground: false,
  },
  enterGame: {
    src: '/assets/audio/island-to-game-transition.mp3',
    volume: 0.55,
    pauseBackground: false,
  },
};

function backgroundForScreen(screen) {
  return screen === 'game' ? GAMEPLAY_BACKGROUND : EXPLORATION_BACKGROUND;
}

export function createMusicController({
  createAudio,
  readEnabled,
  readLevel = () => 100,
  eventTarget = null,
  visibilityTarget = null,
}) {
  let background = null;
  let backgroundSrc = null;
  let backgroundStarted = false;
  let cue = null;
  let cueStarted = false;
  let cueVolume = 0;
  let currentScreen = null;
  let enabled = readEnabled();
  let unlockArmed = false;
  let pageHidden = Boolean(visibilityTarget?.hidden);

  function clearUnlock() {
    if (!unlockArmed || !eventTarget) return;
    eventTarget.removeEventListener('keydown', handleUnlock);
    eventTarget.removeEventListener('pointerdown', handleUnlock);
    unlockArmed = false;
  }

  function armUnlock() {
    if (unlockArmed || !eventTarget) return;
    unlockArmed = true;
    eventTarget.addEventListener('keydown', handleUnlock);
    eventTarget.addEventListener('pointerdown', handleUnlock);
  }

  function startBackground() {
    if (!background || backgroundStarted || pageHidden) return;
    const backgroundToStart = background;
    backgroundStarted = true;
    try {
      const playResult = backgroundToStart.play();
      if (playResult?.catch) {
        playResult.catch(() => {
          if (background !== backgroundToStart) return;
          backgroundStarted = false;
          armUnlock();
        });
      }
    } catch {
      if (background !== backgroundToStart) return;
      backgroundStarted = false;
      armUnlock();
    }
  }

  function startCue() {
    if (!cue || cueStarted || pageHidden) return;
    const cueToStart = cue;
    cueStarted = true;
    try {
      const playResult = cueToStart.play();
      if (playResult?.catch) {
        playResult.catch(() => {
          if (cue !== cueToStart) return;
          cueStarted = false;
          armUnlock();
        });
      }
    } catch {
      if (cue !== cueToStart) return;
      cueStarted = false;
      armUnlock();
    }
  }

  function handleUnlock() {
    clearUnlock();
    if (!enabled) return;
    if (BACKGROUND_SCREENS.has(currentScreen)) startBackground();
    startCue();
  }

  function pauseBackground() {
    if (!background || !backgroundStarted) return;
    background.pause();
    backgroundStarted = false;
  }

  function pauseCue() {
    if (!cue || !cueStarted) return;
    cue.pause();
    cueStarted = false;
  }

  function handleVisibilityChange() {
    pageHidden = Boolean(visibilityTarget?.hidden);
    if (pageHidden) {
      pauseBackground();
      pauseCue();
      return;
    }
    if (!enabled) return;
    if (BACKGROUND_SCREENS.has(currentScreen)) startBackground();
    startCue();
  }

  function syncScreen(screen) {
    const previousScreen = currentScreen;
    currentScreen = screen;
    if (!enabled || !BACKGROUND_SCREENS.has(screen)) {
      pauseBackground();
      return;
    }
    const definition = backgroundForScreen(screen);
    if (!background || backgroundSrc !== definition.src) {
      pauseBackground();
      background = createAudio(definition.src);
      backgroundSrc = definition.src;
      background.loop = true;
      background.volume = definition.volume * readLevel() / 100;
    }
    if (!backgroundStarted) {
      startBackground();
    }
    if (previousScreen === 'island' && screen === 'game') {
      playCue('enterGame');
    }
  }

  function stopCue() {
    if (!cue) return;
    cue.pause();
    cue.currentTime = 0;
    cue = null;
    cueStarted = false;
  }

  function playCue(name) {
    const definition = CUES[name];
    if (!definition || !enabled) return;
    stopCue();
    if (definition.pauseBackground !== false) pauseBackground();
    const nextCue = createAudio(definition.src);
    cue = nextCue;
    nextCue.loop = false;
    cueVolume = definition.volume;
    nextCue.volume = cueVolume * readLevel() / 100;
    nextCue.onended = () => {
      if (cue !== nextCue) return;
      cueStarted = false;
      cue = null;
    };
    startCue();
  }

  function setEnabled(nextEnabled) {
    if (background && backgroundSrc) {
      const track = backgroundSrc === GAMEPLAY_BACKGROUND.src ? GAMEPLAY_BACKGROUND : EXPLORATION_BACKGROUND;
      background.volume = track.volume * readLevel() / 100;
    }
    if (cue) cue.volume = cueVolume * readLevel() / 100;
    if (enabled === Boolean(nextEnabled)) return;
    enabled = Boolean(nextEnabled);
    if (!enabled) {
      stopCue();
      pauseBackground();
      return;
    }
    syncScreen(currentScreen);
  }

  visibilityTarget?.addEventListener?.('visibilitychange', handleVisibilityChange);

  return {
    syncScreen,
    playCue,
    stopCue,
    setEnabled,
  };
}

const musicController = createMusicController({
  createAudio: (src) => new Audio(src),
  readEnabled: isSoundEnabled,
  readLevel: getSoundLevel,
  eventTarget: typeof window === 'undefined' ? null : window,
  visibilityTarget: typeof document === 'undefined' ? null : document,
});

subscribeSoundEnabled((enabled) => musicController.setEnabled(enabled));

export function syncMusicForScreen(screen) {
  musicController.syncScreen(screen);
}

export function playMusicCue(name) {
  musicController.playCue(name);
}

export function stopMusicCue() {
  musicController.stopCue();
}
