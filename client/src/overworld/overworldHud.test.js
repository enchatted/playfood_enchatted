import { describe, expect, it } from 'vitest';
import * as overworldRenderer from './overworldRenderer.js';

describe('WorldMap HUD audio placement', () => {
  it('places the clickable audio slot after mission progress and trash cargo', () => {
    const layout = overworldRenderer.layoutWorldHudBadges?.(100, 80, 70);

    expect(layout, 'layoutWorldHudBadges export is missing').toBeDefined();
    expect(layout).toEqual({
      missionX: 108,
      trashX: 196,
      trashWidth: 70,
      audioRect: { x: 274, y: 5, width: 34, height: 26 },
    });
  });
});
