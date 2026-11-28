import { describe, expect, it } from 'vitest';
import * as CodeCatalog from './codes.js';

const FROZEN_PLAY_CODE_ORDER = ['SAVEIT', 'LOCALF', 'SEASON', 'GROWIT', 'COMPOS'];
const ISLANDS = new Set(['growing', 'local', 'foodwaste', 'circular']);

describe('PLAYFOOD phygital code catalogue', () => {
  it('preserves the frozen order used by previously issued portable Play Codes', () => {
    expect(CodeCatalog.REDEEM_CODE_ORDER).toEqual(FROZEN_PLAY_CODE_ORDER);
    expect(Object.keys(CodeCatalog.VALID_CODES)).toEqual(FROZEN_PLAY_CODE_ORDER);
  });

  it('contains immutable, complete six-character reward definitions', () => {
    expect(Object.isFrozen(CodeCatalog.PHYGITAL_CODES)).toBe(true);
    expect(Object.isFrozen(CodeCatalog.REDEEM_CODE_ORDER)).toBe(true);
    expect(Object.isFrozen(CodeCatalog.VALID_CODES)).toBe(true);

    for (const entry of CodeCatalog.PHYGITAL_CODES) {
      expect(entry.code).toMatch(/^[A-Z]{6}$/);
      expect(ISLANDS.has(entry.island)).toBe(true);
      expect(entry.points).toBe(50);
      expect(entry.task.trim().length).toBeGreaterThan(0);
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });
});
