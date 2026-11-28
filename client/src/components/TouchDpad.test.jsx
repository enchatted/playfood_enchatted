import { describe, expect, it } from 'vitest';
import {
  createTouchPointerKeyController,
  observeTouchCanvasResize,
  shouldHandleTouchControlPointer,
} from './TouchDpad.jsx';

describe('TouchDpad pointer ownership', () => {
  it('rejects secondary mouse and pen buttons before they emit a game key', () => {
    expect(shouldHandleTouchControlPointer({ pointerType: 'mouse', button: 0 })).toBe(true);
    expect(shouldHandleTouchControlPointer({ pointerType: 'pen', button: 0 })).toBe(true);
    expect(shouldHandleTouchControlPointer({ pointerType: 'touch', button: 0 })).toBe(true);
    expect(shouldHandleTouchControlPointer({ pointerType: 'mouse', button: 2 })).toBe(false);
    expect(shouldHandleTouchControlPointer({ pointerType: 'pen', button: 5 })).toBe(false);
  });

  it('cannot let an old deferred release cancel a new press with the same pointer id', () => {
    const events = [];
    const scheduled = new Map();
    let nextFrameId = 0;
    const controller = createTouchPointerKeyController({
      dispatchKey: (key, type) => events.push([key, type]),
      scheduleFrame: (callback) => {
        nextFrameId += 1;
        scheduled.set(nextFrameId, callback);
        return nextFrameId;
      },
      cancelFrame: (frameId) => scheduled.delete(frameId),
    });

    controller.press(7, 'ArrowRight');
    controller.deferRelease(7);
    controller.press(7, 'Enter');

    for (const callback of [...scheduled.values()]) callback();
    expect(events).toEqual([
      ['ArrowRight', 'keydown'],
      ['ArrowRight', 'keyup'],
      ['Enter', 'keydown'],
    ]);

    controller.deferRelease(7);
    for (const callback of [...scheduled.values()]) callback();
    expect(events.at(-1)).toEqual(['Enter', 'keyup']);
  });

  it('keeps a shared key held until its final pointer releases', () => {
    const events = [];
    const callbacks = [];
    const controller = createTouchPointerKeyController({
      dispatchKey: (key, type) => events.push([key, type]),
      scheduleFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancelFrame: () => {},
    });

    controller.press(1, 'ArrowUp');
    controller.press(2, 'ArrowUp');
    controller.deferRelease(1);
    callbacks.shift()();
    expect(events).toEqual([['ArrowUp', 'keydown']]);

    controller.deferRelease(2);
    callbacks.shift()();
    expect(events).toEqual([
      ['ArrowUp', 'keydown'],
      ['ArrowUp', 'keyup'],
    ]);
  });
});

describe('TouchDpad canvas measurement', () => {
  it('falls back to window resize measurement when ResizeObserver is unavailable', () => {
    const listeners = new Map();
    const resizeTarget = {
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type, listener) => {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
    };
    let measurements = 0;

    const cleanup = observeTouchCanvasResize({
      activeCanvas: {},
      stage: {},
      measure: () => { measurements += 1; },
      ResizeObserverClass: undefined,
      resizeTarget,
      visualViewport: null,
    });

    expect(measurements).toBe(1);
    listeners.get('resize')();
    expect(measurements).toBe(2);
    expect(() => cleanup()).not.toThrow();
    expect(listeners.has('resize')).toBe(false);
  });
});
