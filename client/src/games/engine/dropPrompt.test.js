// The drop hint must stay on the canvas and clear of the action prompt.
import { describe, it, expect } from 'vitest';
import { CANVAS_H } from '../../overworld/overworldData.js';
import { renderDropPrompt, dropPromptY } from './gameRoomRenderer.js';

const ACTION_TOP = CANVAS_H - 65;

function mockCtx() {
  const alphas = [];
  const ctx = {
    globalAlpha: 1,
    measureText: (t) => ({ width: t.length * 7 }),
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, stroke() {},
    fill() { alphas.push(ctx.globalAlpha); },
    fillText() { alphas.push(ctx.globalAlpha); },
  };
  return { ctx, alphas };
}

describe('renderDropPrompt', () => {
  it('sits above the action prompt when both show', () => {
    const h = 30;
    expect(dropPromptY({ actionPrompt: 'Press Enter' }, h) + h).toBeLessThanOrEqual(ACTION_TOP);
  });

  it('stays inside the canvas when alone', () => {
    const h = 30;
    expect(dropPromptY({ actionPrompt: null }, h) + h).toBeLessThan(CANVAS_H);
  });

  it('draws the pill and text fully opaque', () => {
    const { ctx, alphas } = mockCtx();
    renderDropPrompt(ctx, { dropPrompt: 'Press Q to put it back', actionPrompt: 'Press Enter' });
    expect(alphas.length).toBeGreaterThan(0);
    expect(alphas.every((a) => a === 1)).toBe(true);
  });
});
