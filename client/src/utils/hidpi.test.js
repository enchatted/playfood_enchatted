import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachHiDPI, beginFrame } from './hidpi.js';
import { getCanvasPointer } from './canvas.js';

function mockCtx() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    imageSmoothingEnabled: true,
  };
}

describe('beginFrame', () => {
  it('falls back to identity when no __hidpi geometry is attached', () => {
    const ctx = mockCtx();
    const canvas = { width: 1280, height: 704 };
    beginFrame(ctx, canvas);
    expect(ctx.setTransform).toHaveBeenCalledTimes(1);
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1280, 704);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  it('clears the full buffer in device pixels, then applies scale + offset', () => {
    const ctx = mockCtx();
    const canvas = {
      width: 2560,
      height: 1500,
      __hidpi: { k: 2, ox: 0, oy: 46, logicalW: 1280, logicalH: 704 },
    };
    beginFrame(ctx, canvas);
    // 1st call: identity for the clear; 2nd call: logical-space transform.
    expect(ctx.setTransform.mock.calls[0]).toEqual([1, 0, 0, 1, 0, 0]);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 2560, 1500);
    expect(ctx.setTransform.mock.calls[1]).toEqual([2, 0, 0, 2, 0, 46]);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });
});

describe('getCanvasPointer with HiDPI geometry', () => {
  it('maps clicks through scale and centring offset into logical coordinates', () => {
    const canvas = {
      width: 2560, // buffer px, CSS width 1280 → dpr 2
      height: 1500,
      __hidpi: { k: 2, ox: 0, oy: 46, logicalW: 1280, logicalH: 704 },
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 1280, height: 750 }),
    };
    // Click at the centre of the CSS box: (100+640, 50+375)
    const p = getCanvasPointer(canvas, { clientX: 740, clientY: 425 });
    expect(p.x).toBeCloseTo(640);       // (640*2 - 0) / 2
    expect(p.y).toBeCloseTo(352);       // (375*2 - 46) / 2 = 352 = logical centre
  });

  it('keeps the legacy mapping when no __hidpi is attached', () => {
    const canvas = {
      width: 1280,
      height: 704,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 352 }),
    };
    const p = getCanvasPointer(canvas, { clientX: 320, clientY: 176 });
    expect(p.x).toBeCloseTo(640);
    expect(p.y).toBeCloseTo(352);
  });
});

describe('attachHiDPI', () => {
  let observed, disconnected;

  beforeEach(() => {
    observed = [];
    disconnected = false;
    global.ResizeObserver = class {
      constructor(cb) { this.cb = cb; }
      observe(el) { observed.push(el); }
      disconnect() { disconnected = true; }
    };
    global.window = {
      devicePixelRatio: 2,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    delete global.ResizeObserver;
    delete global.window;
  });

  function fakeCanvas(cssW, cssH) {
    return {
      width: 1280,
      height: 704,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: cssW, height: cssH }),
    };
  }

  it('sizes the buffer to CSS size × dpr and stores uniform scale + offsets', () => {
    const canvas = fakeCanvas(1280, 750); // box slightly taller than 1280×704 ratio
    attachHiDPI(canvas, 1280, 704);
    expect(canvas.width).toBe(2560);
    expect(canvas.height).toBe(1500);
    expect(canvas.__hidpi.k).toBeCloseTo(2);          // min(2560/1280, 1500/704) = 2
    expect(canvas.__hidpi.ox).toBeCloseTo(0);
    expect(canvas.__hidpi.oy).toBeCloseTo(46);        // (1500 - 704*2) / 2
  });

  it('skips zero-sized boxes without touching the buffer', () => {
    const canvas = fakeCanvas(0, 0);
    attachHiDPI(canvas, 1280, 704);
    expect(canvas.width).toBe(1280);
    expect(canvas.__hidpi).toBeUndefined();
  });

  it('detach disconnects the observer and removes the resize listener', () => {
    const canvas = fakeCanvas(1280, 704);
    const detach = attachHiDPI(canvas, 1280, 704);
    expect(observed).toEqual([canvas]);
    expect(global.window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    detach();
    expect(disconnected).toBe(true);
    expect(global.window.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
