import { describe, expect, it } from 'vitest';
import { renderFinaleCeremony } from './finaleCeremony.js';
import { renderGoldCeremony } from './lighthouseRoomRenderer.js';

const CAMERA_CASES = [
  ['growing', { x: 432, y: 214.4 }, { x: 328, y: 145.6 }],
  ['local', { x: 570.6666666666666, y: 214.4 }, { x: 536, y: 145.6 }],
  ['foodwaste', { x: 709.3333333333333, y: 214.4 }, { x: 744, y: 145.6 }],
  ['circular', { x: 848, y: 214.4 }, { x: 952, y: 145.6 }],
];

const FINALE_WORLD_CENTERS = [
  { x: 432, y: 224 },
  { x: 560, y: 224 },
  { x: 720, y: 224 },
  { x: 848, y: 224 },
];

const FINALE_CANVAS_CENTERS = [
  { x: 328, y: 160 },
  { x: 520, y: 160 },
  { x: 760, y: 160 },
  { x: 952, y: 160 },
];

function createRecordingContext() {
  const radialGradients = [];
  const arcs = [];
  const target = { radialGradients, arcs, globalAlpha: 1 };
  const gradient = { addColorStop() {} };

  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      if (property === 'createRadialGradient') {
        return (...args) => {
          radialGradients.push(args);
          return gradient;
        };
      }
      if (property === 'arc') {
        return (...args) => arcs.push(args);
      }
      if (property === 'measureText') return (text) => ({ width: String(text).length * 8 });
      return () => {};
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    },
  });
}

function createLighthouseCameraMapper(calls) {
  return (x, y) => {
    calls.push({ x, y });
    return {
      x: 640 + (x - 640) * 1.5,
      y: 352 + (y - 352) * 1.5,
    };
  };
}

describe('Lighthouse ceremony camera mapping', () => {
  it.each(CAMERA_CASES)(
    'maps the %s plinth burst, sweep, and shared lamp anchors exactly once',
    (island, expectedWorldBurst, expectedCanvasBurst) => {
      const context = createRecordingContext();
      const mapperCalls = [];

      renderGoldCeremony(
        context,
        { ceremony: { queue: [island], idx: 0, t: 0.25 } },
        { goldCheer: 'Complete' },
        createLighthouseCameraMapper(mapperCalls),
      );

      expect(mapperCalls).toEqual([
        expectedWorldBurst,
        { x: 624, y: 160 },
      ]);
      expect(context.radialGradients[0][0]).toBeCloseTo(expectedCanvasBurst.x, 8);
      expect(context.radialGradients[0][1]).toBeCloseTo(expectedCanvasBurst.y, 8);
      expect(context.radialGradients[1][0]).toBeCloseTo(expectedCanvasBurst.x, 8);
      expect(context.radialGradients[1][1]).toBeCloseTo(expectedCanvasBurst.y, 8);
      expect(context.radialGradients.at(-1).slice(0, 5)).toEqual([
        616, 64, 4, 616, 64,
      ]);
      expect(context.arcs).toContainEqual([616, 64, 200, 0, Math.PI * 2]);
    },
  );

  it('keeps finale anchors single-mapped while glow radii stay in screen space', () => {
    const context = createRecordingContext();
    const mapperCalls = [];

    renderFinaleCeremony(
      context,
      { time: 0, finale: { t: 2, confetti: [] } },
      createLighthouseCameraMapper(mapperCalls),
    );

    expect(mapperCalls).toEqual(FINALE_WORLD_CENTERS);
    for (const [index, center] of FINALE_CANVAS_CENTERS.entries()) {
      // The first gradient is the screen-space full-room wash. The following
      // four are the mapped plinth glows in station order.
      expect(context.radialGradients[index + 1].slice(0, 5)).toEqual([
        center.x, center.y - 6, 4, center.x, center.y - 6,
      ]);
      expect(context.arcs[index * 2].slice(0, 3)).toEqual([
        center.x, center.y - 6, 39.1,
      ]);
    }
  });
});
