import { describe, expect, it } from 'vitest';
import { renderRoomHUD } from './islandRoomRenderer.js';

function recordingContext() {
  return {
    texts: [],
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillRect() {},
    save() {},
    restore() {},
    arc() {},
    measureText(text) { return { width: String(text).length * 8 }; },
    fillText(text, x, y) { this.texts.push({ text, x, y }); },
    globalAlpha: 1,
  };
}

describe('Island room progression HUD', () => {
  it('uses the same stars-and-coins metric as the World Map', () => {
    const ctx = recordingContext();
    const state = { time: 10 };

    renderRoomHUD(ctx, state, 'growing', 135, 0, {
      backToMap: 'Map',
      islandName: 'Growing Island',
    }, 2);

    const labels = ctx.texts.map(({ text }) => text);
    expect(labels).toContain('⭐ 2');
    expect(labels).toContain('135');
    expect(labels).not.toContain('⭐ 135');
  });
});
