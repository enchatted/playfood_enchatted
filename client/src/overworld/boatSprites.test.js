import { describe, expect, it } from 'vitest';
import { buildBoatSprites, getBoatSpritesForTier } from './tileAtlas.js';

function makeTrackingCanvas() {
  const canvas = {
    height: 0,
    visualBounds: null,
    width: 0,
  };
  let path = [];
  const includePoint = (x, y) => {
    if (!canvas.visualBounds) {
      canvas.visualBounds = { maxX: x, maxY: y, minX: x, minY: y };
      return;
    }
    canvas.visualBounds.maxX = Math.max(canvas.visualBounds.maxX, x);
    canvas.visualBounds.maxY = Math.max(canvas.visualBounds.maxY, y);
    canvas.visualBounds.minX = Math.min(canvas.visualBounds.minX, x);
    canvas.visualBounds.minY = Math.min(canvas.visualBounds.minY, y);
  };
  canvas.getContext = () => ({
    beginPath() { path = []; },
    clearRect() { canvas.visualBounds = null; },
    closePath() {},
    fill() { path.forEach(([x, y]) => includePoint(x, y)); },
    lineTo(x, y) { path.push([x, y]); },
    moveTo(x, y) { path.push([x, y]); },
  });
  return canvas;
}

function visualSize(canvas) {
  const bounds = canvas.visualBounds;
  return {
    height: bounds.maxY - bounds.minY,
    width: bounds.maxX - bounds.minX,
  };
}

describe('tiered boat sprites', () => {
  const atlas = {
    boats: [
      [['starter']], [['sailboat']], [['cleanup']], [['eco']], [['guardian']],
    ],
    boat: [['legacy-starter']],
  };

  it.each([
    [0, 'starter'],
    [1, 'sailboat'],
    [2, 'cleanup'],
    [3, 'eco'],
    [4, 'guardian'],
  ])(
    'selects tier %i',
    (tier, marker) => expect(getBoatSpritesForTier(atlas, tier)[0][0]).toBe(marker),
  );

  it('falls back to the starter frames for malformed tiers and legacy atlases', () => {
    expect(getBoatSpritesForTier(atlas, 9)[0][0]).toBe('starter');
    expect(getBoatSpritesForTier({ boat: [['legacy-starter']] }, 2)[0][0]).toBe('legacy-starter');
  });

  it('builds a complete Guardian matrix with a larger silhouette on the shared tile', () => {
    const originalDocument = globalThis.document;
    globalThis.document = {
      createElement: () => makeTrackingCanvas(),
    };

    try {
      const boats = buildBoatSprites();

      expect(boats).toHaveLength(5);
      expect(boats[4]).toHaveLength(4);
      for (let direction = 0; direction < 4; direction += 1) {
        expect(boats[4][direction]).toHaveLength(2);
        for (let frame = 0; frame < 2; frame += 1) {
          expect(boats[4][direction][frame]).toMatchObject({ height: 32, width: 32 });
          expect(visualSize(boats[4][direction][frame]).width).toBeGreaterThan(
            visualSize(boats[3][direction][frame]).width,
          );
          expect(visualSize(boats[4][direction][frame]).height).toBeGreaterThan(
            visualSize(boats[3][direction][frame]).height,
          );
        }
        expect(visualSize(boats[4][direction][1])).not.toEqual(
          visualSize(boats[4][direction][0]),
        );
      }
    } finally {
      globalThis.document = originalDocument;
    }
  });
});
