import { describe, expect, it } from 'vitest';

describe('sound module outside a browser', () => {
  it('does not touch localStorage when window is unavailable', async () => {
    let storageReads = 0;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        storageReads += 1;
        throw new Error('browser storage is unavailable');
      },
    });

    await import('./sound.js?server-safe');

    expect(storageReads).toBe(0);
    delete globalThis.localStorage;
  });
});
