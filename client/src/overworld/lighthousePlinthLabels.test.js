import { describe, expect, it } from 'vitest';
import * as LighthouseRenderer from './lighthouseRoomRenderer.js';
import { TILE } from './tileAtlas.js';

describe('lighthouse plinth label layout', () => {
  it('draws the four gray floor inlays under the same visual centers as the trophies', () => {
    const drawCalls = [];
    const context = {
      drawImage(image, x, y) {
        drawCalls.push({ image, x, y });
      },
    };
    const atlas = {
      tiles: {
        [TILE.BUILDING_WALL]: ['wall'],
        [TILE.FLOOR_WOOD]: ['wood'],
        [TILE.FLOOR_STONE]: ['stone'],
        [TILE.EXIT_MAT]: ['exit'],
      },
    };

    LighthouseRenderer.renderLighthouseTiles(context, atlas);

    const stoneInlays = drawCalls
      .filter(({ image, y }) => image === 'stone' && y === 208)
      .map(({ x }) => x);

    expect(stoneInlays).toHaveLength(4);
    expect(stoneInlays[0]).toBeCloseTo(416, 5);
    expect(stoneInlays[1]).toBeCloseTo(554.66667, 5);
    expect(stoneInlays[2]).toBeCloseTo(693.33333, 5);
    expect(stoneInlays[3]).toBeCloseTo(832, 5);
  });

  it('gives all four islands equal-width slots with equal spacing', () => {
    const layouts = LighthouseRenderer.getLighthousePlinthLabelLayouts?.();

    expect(LighthouseRenderer.getLighthousePlinthLabelLayouts).toBeTypeOf('function');
    expect(layouts).toHaveLength(4);

    const widths = layouts.map(({ width }) => width);
    const heights = layouts.map(({ height }) => height);
    const centreGaps = layouts.slice(1).map(({ centerX }, index) => (
      centerX - layouts[index].centerX
    ));

    expect(new Set(widths)).toEqual(new Set([112]));
    expect(new Set(heights)).toEqual(new Set([30]));
    expect(layouts.every(({ centerX, plinthCenterX }) => centerX === plinthCenterX)).toBe(true);
    expect(Math.max(...centreGaps) - Math.min(...centreGaps)).toBeLessThan(0.01);
    expect(layouts[0].centerX).toBe(432);
    expect(layouts[3].centerX).toBe(848);
    for (const layout of layouts) {
      expect(LighthouseRenderer.getLighthousePlinthVisualCenter?.(layout.island))
        .toEqual({ cx: layout.plinthCenterX, cy: 224 });
    }
  });

  it.each([
    '🌱 Magic Garden',
    '🛒 Εποχές',
    '🍽️ Πράσινη Διάσωση',
    '🌍 Aardebeschermers',
    '🌍 Protetores da Terra',
  ])('fits %s into at most two readable lines', (label) => {
    const layoutText = LighthouseRenderer.layoutLighthousePlinthLabelText;
    const context = {
      font: '',
      measureText(text) {
        const px = Number.parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || '10');
        return { width: [...text].length * px * 0.56 };
      },
    };

    expect(layoutText).toBeTypeOf('function');
    const result = layoutText?.(context, label, 98);

    expect(result.lines.length).toBeLessThanOrEqual(2);
    expect(result.fontSize).toBeGreaterThanOrEqual(8);
    expect(result.lines.every((line) => context.measureText(line).width <= 98)).toBe(true);
  });

  it('centres the icon-and-text block while both text lines share one start point', () => {
    const context = {
      font: '',
      measureText(text) {
        const px = Number.parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || '10');
        return { width: [...text].length * px * 0.56 };
      },
    };
    const layoutContent = LighthouseRenderer.layoutLighthousePlinthContent;

    expect(layoutContent).toBeTypeOf('function');
    const result = layoutContent?.(context, {
      centerX: 100,
      maxWidth: 98,
      icon: '🍽️',
      lines: ['Πράσινη', 'Διάσωση'],
    });

    expect(new Set(result.linePositions.map(({ x }) => x)).size).toBe(1);
    expect(result.iconCenterX).toBeLessThan(result.linePositions[0].x);
    expect((result.contentLeft + result.contentRight) / 2).toBeCloseTo(100, 5);
  });
});
