// Pure typewriter reveal used by the Pokémon-style lighthouse dialogs.
// The renderer can't hold timers, so reveal is derived from elapsed seconds ×
// chars-per-second across a set of (already-wrapped) lines, left to right.
import { describe, it, expect } from 'vitest';
import { typewriterLines } from './typewriter.js';

describe('typewriterLines', () => {
  it('reveals nothing at elapsed 0 (non-empty text → not done)', () => {
    const r = typewriterLines(['Hello', 'World'], 0, 30);
    expect(r.lines).toEqual(['', '']);
    expect(r.done).toBe(false);
  });

  it('reveals a partial budget left-to-right, spilling onto later lines', () => {
    // 5 chars/sec × 1s = 5 revealed → "abc" (3) fills line 1, "de" (2) into line 2
    const r = typewriterLines(['abc', 'def'], 1, 5);
    expect(r.lines).toEqual(['abc', 'de']);
    expect(r.done).toBe(false);
  });

  it('stops exactly at a line boundary without bleeding into the next', () => {
    const r = typewriterLines(['abc', 'def'], 1, 3); // exactly 3 chars
    expect(r.lines).toEqual(['abc', '']);
    expect(r.done).toBe(false);
  });

  it('reveals everything and reports done once the budget covers all chars', () => {
    const r = typewriterLines(['abc', 'def'], 100, 30);
    expect(r.lines).toEqual(['abc', 'def']);
    expect(r.done).toBe(true);
  });

  it('is done exactly when the budget equals the total char count', () => {
    const r = typewriterLines(['abc', 'def'], 6, 1); // 6 chars total, 6 budget
    expect(r.lines).toEqual(['abc', 'def']);
    expect(r.done).toBe(true);
  });

  it('treats empty input as already done', () => {
    expect(typewriterLines([], 0, 30)).toEqual({ lines: [], done: true });
  });

  it('counts spaces as revealable characters', () => {
    const r = typewriterLines(['a b'], 1, 2); // reveals "a " (2 chars incl. space)
    expect(r.lines).toEqual(['a ']);
    expect(r.done).toBe(false);
  });

  it('coerces null/undefined lines to empty strings safely', () => {
    const r = typewriterLines([null, undefined, 'hi'], 100, 30);
    expect(r.lines).toEqual(['', '', 'hi']);
    expect(r.done).toBe(true);
  });
});
