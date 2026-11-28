import { describe, expect, it, vi } from 'vitest';
import { createMusicController } from './music.js';

function createAudioHarness() {
  const created = [];

  const createAudio = (src) => {
    const audio = {
      src,
      loop: false,
      volume: 1,
      currentTime: 0,
      paused: true,
      onended: null,
      play: vi.fn(() => {
        audio.paused = false;
        return Promise.resolve();
      }),
      pause: vi.fn(() => {
        audio.paused = true;
      }),
    };
    created.push(audio);
    return audio;
  };

  return { createAudio, created };
}

describe('music controller', () => {
  it('keeps one exploration loop playing across the non-game screens', () => {
    const audio = createAudioHarness();
    const controller = createMusicController({
      createAudio: audio.createAudio,
      readEnabled: () => true,
    });

    controller.syncScreen('menu');
    controller.syncScreen('hub');
    controller.syncScreen('island');

    expect(audio.created).toHaveLength(1);
    expect(audio.created[0]).toMatchObject({
      src: '/assets/audio/calm-track-loop.ogg',
      loop: true,
      volume: 0.08,
      paused: false,
    });
    expect(audio.created[0].play).toHaveBeenCalledTimes(1);
  });

  it('switches to gameplay music and plays one transition cue from island to game', () => {
    const audio = createAudioHarness();
    const controller = createMusicController({
      createAudio: audio.createAudio,
      readEnabled: () => true,
    });

    controller.syncScreen('island');
    controller.syncScreen('game');

    expect(audio.created).toHaveLength(3);
    expect(audio.created[0]).toMatchObject({
      src: '/assets/audio/calm-track-loop.ogg',
      paused: true,
    });
    expect(audio.created[1]).toMatchObject({
      src: '/assets/audio/cozy-puzzle-gameplay-loop.mp3',
      loop: true,
      volume: 0.06,
      paused: false,
    });
    expect(audio.created[2]).toMatchObject({
      src: '/assets/audio/island-to-game-transition.mp3',
      loop: false,
      volume: 0.55,
      paused: false,
    });
  });

  it('pauses the background for a result cue and resumes it on the next game screen', () => {
    const audio = createAudioHarness();
    const controller = createMusicController({
      createAudio: audio.createAudio,
      readEnabled: () => true,
    });

    controller.syncScreen('game');
    controller.syncScreen('result');
    controller.playCue('success');

    expect(audio.created).toHaveLength(2);
    expect(audio.created[0].paused).toBe(true);
    expect(audio.created[1]).toMatchObject({
      src: '/assets/audio/cozy-puzzle-clear-jingle.mp3',
      loop: false,
      volume: 0.22,
      paused: false,
    });

    controller.stopCue();
    controller.syncScreen('island');

    expect(audio.created[1].paused).toBe(true);
    expect(audio.created[0].paused).toBe(true);
    expect(audio.created[2]).toMatchObject({
      src: '/assets/audio/calm-track-loop.ogg',
      loop: true,
      volume: 0.08,
      paused: false,
    });
  });

  it('uses the quieter cozy failure cue for an encouraging retry result', () => {
    const audio = createAudioHarness();
    const controller = createMusicController({
      createAudio: audio.createAudio,
      readEnabled: () => true,
    });

    controller.playCue('retry');

    expect(audio.created).toHaveLength(1);
    expect(audio.created[0]).toMatchObject({
      src: '/assets/audio/cozy-puzzle-failure-jingle.mp3',
      loop: false,
      volume: 0.14,
      paused: false,
    });
  });

  it('layers the soft vibraphone milestone over the background without stopping it', () => {
    const audio = createAudioHarness();
    const controller = createMusicController({
      createAudio: audio.createAudio,
      readEnabled: () => true,
    });

    controller.syncScreen('island');
    controller.playCue('milestone');

    expect(audio.created).toHaveLength(2);
    expect(audio.created[0].paused).toBe(false);
    expect(audio.created[1]).toMatchObject({
      src: '/assets/audio/win-vibraphone.ogg',
      loop: false,
      volume: 0.55,
      paused: false,
    });
  });

  it('pauses immediately when muted and resumes the current background when unmuted', () => {
    const audio = createAudioHarness();
    const controller = createMusicController({
      createAudio: audio.createAudio,
      readEnabled: () => true,
    });

    controller.syncScreen('hub');
    controller.setEnabled(false);
    expect(audio.created[0].paused).toBe(true);

    controller.setEnabled(true);
    expect(audio.created[0].paused).toBe(false);
    expect(audio.created[0].play).toHaveBeenCalledTimes(2);
  });

  it('pauses all audio while the browser tab is hidden and resumes on return', () => {
    const audio = createAudioHarness();
    const listeners = {};
    const visibilityTarget = {
      hidden: false,
      addEventListener: vi.fn((name, handler) => { listeners[name] = handler; }),
    };
    const controller = createMusicController({
      createAudio: audio.createAudio,
      readEnabled: () => true,
      visibilityTarget,
    });

    controller.syncScreen('island');
    controller.playCue('milestone');
    visibilityTarget.hidden = true;
    listeners.visibilitychange();

    expect(audio.created[0].paused).toBe(true);
    expect(audio.created[1].paused).toBe(true);

    visibilityTarget.hidden = false;
    listeners.visibilitychange();

    expect(audio.created[0].paused).toBe(false);
    expect(audio.created[1].paused).toBe(false);
  });

  it('retries blocked autoplay on the next real keyboard or pointer gesture', async () => {
    const listeners = {};
    const eventTarget = {
      addEventListener: vi.fn((name, handler) => { listeners[name] = handler; }),
      removeEventListener: vi.fn((name) => { delete listeners[name]; }),
    };
    let playAttempts = 0;
    const background = {
      loop: false,
      volume: 1,
      currentTime: 0,
      paused: true,
      play: vi.fn(() => {
        playAttempts += 1;
        if (playAttempts === 1) return Promise.reject(new Error('autoplay blocked'));
        background.paused = false;
        return Promise.resolve();
      }),
      pause: vi.fn(() => { background.paused = true; }),
    };
    const controller = createMusicController({
      createAudio: () => background,
      readEnabled: () => true,
      eventTarget,
    });

    controller.syncScreen('menu');
    await Promise.resolve();
    await Promise.resolve();

    expect(listeners.pointerdown).toBeTypeOf('function');
    expect(listeners.keydown).toBeTypeOf('function');

    listeners.pointerdown();
    await Promise.resolve();

    expect(background.play).toHaveBeenCalledTimes(2);
    expect(background.paused).toBe(false);
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
  });

  it('ignores a stale ended event after a newer cue has started', () => {
    const audio = createAudioHarness();
    const controller = createMusicController({
      createAudio: audio.createAudio,
      readEnabled: () => true,
    });

    controller.playCue('success');
    const oldCue = audio.created[0];
    controller.playCue('retry');
    const currentCue = audio.created[1];

    oldCue.onended();
    controller.stopCue();

    expect(currentCue.pause).toHaveBeenCalledTimes(1);
    expect(currentCue.currentTime).toBe(0);
  });

  it('ignores a stale autoplay rejection after a newer cue has started', async () => {
    const listeners = {};
    const eventTarget = {
      addEventListener: vi.fn((name, handler) => { listeners[name] = handler; }),
      removeEventListener: vi.fn((name) => { delete listeners[name]; }),
    };
    let rejectOldCue;
    const audio = createAudioHarness();
    const originalCreateAudio = audio.createAudio;
    let cueCount = 0;
    const createAudio = (src) => {
      const created = originalCreateAudio(src);
      cueCount += 1;
      if (cueCount === 1) {
        created.play = vi.fn(() => new Promise((resolve, reject) => {
          rejectOldCue = reject;
        }));
      }
      return created;
    };
    const controller = createMusicController({
      createAudio,
      readEnabled: () => true,
      eventTarget,
    });

    controller.playCue('success');
    controller.playCue('retry');
    rejectOldCue(new Error('old cue blocked'));
    await Promise.resolve();
    await Promise.resolve();

    expect(listeners.pointerdown).toBeUndefined();
    expect(audio.created[1].play).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale exploration autoplay rejection after gameplay music starts', async () => {
    let rejectExploration;
    const audio = createAudioHarness();
    const originalCreateAudio = audio.createAudio;
    const createAudio = (src) => {
      const created = originalCreateAudio(src);
      if (src === '/assets/audio/calm-track-loop.ogg') {
        created.play = vi.fn(() => new Promise((resolve, reject) => {
          rejectExploration = reject;
        }));
      }
      return created;
    };
    const controller = createMusicController({
      createAudio,
      readEnabled: () => true,
    });

    controller.syncScreen('island');
    controller.syncScreen('game');
    const gameplay = audio.created[1];

    rejectExploration(new Error('old exploration autoplay blocked'));
    await Promise.resolve();
    await Promise.resolve();
    controller.syncScreen('game');

    expect(gameplay.play).toHaveBeenCalledTimes(1);
  });
});

it('rescales the playing track and cue without restarting them', () => {
  const audio = createAudioHarness();
  let level = 50;
  const controller = createMusicController({
    createAudio: audio.createAudio, readEnabled: () => true, readLevel: () => level,
  });
  controller.syncScreen('game');
  controller.playCue('milestone');
  const [background, cue] = audio.created;
  expect(background.volume).toBeCloseTo(0.03);
  expect(cue.volume).toBeCloseTo(0.275);
  level = 25;
  controller.setEnabled(true);
  expect(background.volume).toBeCloseTo(0.015);
  expect(cue.volume).toBeCloseTo(0.1375);
  expect(background.play).toHaveBeenCalledTimes(1);
  expect(cue.play).toHaveBeenCalledTimes(1);
});
