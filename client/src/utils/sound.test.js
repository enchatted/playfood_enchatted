import { afterEach, describe, expect, it } from 'vitest';

const stored = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  },
});

const sound = await import('./sound.js');

afterEach(() => {
  sound.setSoundEnabled(true);
});

describe('sound preference', () => {
  it('notifies audio consumers when the shared sound setting changes', () => {
    const changes = [];
    const subscribe = sound.subscribeSoundEnabled;

    expect(subscribe).toBeTypeOf('function');
    const unsubscribe = subscribe((enabled) => changes.push(enabled));

    sound.setSoundEnabled(false);
    sound.setSoundEnabled(true);
    unsubscribe();
    sound.setSoundEnabled(false);

    expect(changes).toEqual([false, true]);
  });
});

it('restores the last audible preset after mute', () => {
  sound.setSoundLevel(25);
  sound.setSoundEnabled(false);
  expect(sound.getSoundLevel()).toBe(0);
  sound.setSoundEnabled(true);
  expect(sound.getSoundLevel()).toBe(25);
  sound.setSoundLevel(100);
});
