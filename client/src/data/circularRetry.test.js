import { it, expect } from 'vitest';
import * as circular from './circular.js';

it('keeps a landfill attempt recoverable without losing the resource or progress', () => {
  const state = { carrying: 'bike', routedCount: 2, correctCount: 2, leaks: 0 };
  expect(typeof circular.redirectCircularResource).toBe('function');
  circular.redirectCircularResource(state, 'repair');
  expect(state).toMatchObject({ carrying: 'bike', routedCount: 2, correctCount: 2, leaks: 0, hintNodeKey: 'repair' });
  expect(state.hintTimer).toBeGreaterThan(0);
});

it('distinguishes first-attempt accuracy from eventual successful recovery', () => {
  expect(circular.gradeCircularCity({ correct: 8, total: 8, leaks: 0, firstTryCount: 7 }))
    .toEqual({ passed: true, tier: 'great' });
  expect(circular.gradeCircularCity({ correct: 8, total: 8, leaks: 0, firstTryCount: 0 }))
    .toEqual({ passed: true, tier: 'pass' });
  expect(circular.gradeCircularCity({ correct: 8, total: 8, leaks: 0, firstTryCount: 8 }))
    .toEqual({ passed: true, tier: 'perfect' });
});

it('marks a carried resource as retried without consuming it', () => {
  const state = { carrying: 'bike', resources: [{ id: 'bike', routed: false }] };
  circular.redirectCircularResource(state, 'repair');
  circular.redirectCircularResource(state, 'repair');
  expect(state.resources[0]).toMatchObject({ routed: false, retried: true });
  expect(state.carrying).toBe('bike');
});
