import { describe, expect, it } from 'vitest';
import * as gameRoomLogic from './gameRoomLogic.js';

describe('layout-independent drop key', () => {
  it('accepts the physical Q key when a Greek layout reports another character', () => {
    const greekQEventKeys = new Set([';', 'keyq']);

    expect(gameRoomLogic.isDropKeyPressed?.(greekQEventKeys)).toBe(true);
  });

  it('keeps accepting the semantic q sent by the touch control', () => {
    expect(gameRoomLogic.isDropKeyPressed?.(new Set(['q']))).toBe(true);
  });
});
