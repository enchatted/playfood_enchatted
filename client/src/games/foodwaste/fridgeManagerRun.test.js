import { describe, expect, it } from 'vitest';
import { TIER } from '../../data/fridgeData.js';
import {
  createFridgeRunProgress,
  liveFridgeStars,
  recordFridgeAttempt,
} from './fridgeManagerRun.js';

describe('FridgeManager learning run', () => {
  it('counts an accepted first attempt as progress and first-try understanding', () => {
    const progress = createFridgeRunProgress();

    const result = recordFridgeAttempt(progress, { foodId: 'banana', tier: TIER.ACCEPTED });

    expect(result).toEqual({ accepted: true, firstTry: true, points: 10 });
    expect(progress.acceptedFoodIds).toEqual(['banana']);
    expect(progress.acceptedCount).toBe(1);
    expect(progress.firstTryAcceptedCount).toBe(1);
    expect(progress.attemptsByFood.banana).toBe(1);
  });

  it('keeps suboptimal and avoid attempts out of accepted progress', () => {
    const progress = createFridgeRunProgress();

    expect(recordFridgeAttempt(progress, {
      foodId: 'lettuce', tier: TIER.SUBOPTIMAL,
    })).toEqual({ accepted: false, firstTry: false, points: 0 });
    expect(recordFridgeAttempt(progress, {
      foodId: 'banana', tier: TIER.AVOID,
    })).toEqual({ accepted: false, firstTry: false, points: 0 });

    expect(progress.acceptedCount).toBe(0);
    expect(progress.firstTryAcceptedCount).toBe(0);
    expect(progress.suboptimalCount).toBe(1);
    expect(progress.avoidCount).toBe(1);
  });

  it('accepts a corrected retry without restoring first-try credit', () => {
    const progress = createFridgeRunProgress();
    recordFridgeAttempt(progress, { foodId: 'banana', tier: TIER.AVOID });

    const result = recordFridgeAttempt(progress, { foodId: 'banana', tier: TIER.ACCEPTED });

    expect(result).toEqual({ accepted: true, firstTry: false, points: 10 });
    expect(progress.acceptedCount).toBe(1);
    expect(progress.firstTryAcceptedCount).toBe(0);
    expect(progress.attemptsByFood.banana).toBe(2);
  });

  it('does not count the same accepted food twice', () => {
    const progress = createFridgeRunProgress();
    recordFridgeAttempt(progress, { foodId: 'bread', tier: TIER.ACCEPTED });
    const duplicate = recordFridgeAttempt(progress, { foodId: 'bread', tier: TIER.ACCEPTED });

    expect(progress.acceptedFoodIds).toEqual(['bread']);
    expect(progress.acceptedCount).toBe(1);
    expect(progress.firstTryAcceptedCount).toBe(1);
    expect(duplicate.points).toBe(0);
  });

  it('turns first-try misses into the same live star tiers used at the result', () => {
    expect(liveFridgeStars(0, 0)).toBe(0);
    expect(liveFridgeStars(1, 1)).toBe(3);
    expect(liveFridgeStars(4, 3)).toBe(3);
    expect(liveFridgeStars(5, 3)).toBe(2);
    expect(liveFridgeStars(7, 3)).toBe(1);
    expect(liveFridgeStars(10, 9)).toBe(3);
    expect(liveFridgeStars(10, 7)).toBe(2);
    expect(liveFridgeStars(10, 6)).toBe(1);
  });
});
