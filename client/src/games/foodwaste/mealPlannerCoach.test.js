import { describe, expect, it } from 'vitest';
import {
  createMealPlannerCoachMessage,
  mealPlannerCoachDuration,
  shouldShowAtRiskMarketCoach,
  tickMealPlannerCoachMessage,
} from './mealPlannerCoach.js';

describe('Meal Planner coach message timing', () => {
  it('keeps errors visible longer than normal confirmations', () => {
    expect(mealPlannerCoachDuration('wrong')).toBe(6);
    expect(mealPlannerCoachDuration('junk')).toBe(6);
    expect(mealPlannerCoachDuration('good')).toBe(4.5);
  });

  it('keeps routine actions and near-cap status silent', () => {
    for (const key of ['welcome', 'grab', 'good', 'putback', 'capnear']) {
      expect(createMealPlannerCoachMessage('Routine feedback', key), key).toBeNull();
    }
  });

  it('keeps meal-complete praise shorter than corrective feedback', () => {
    expect(mealPlannerCoachDuration('mealdone')).toBe(3);
    expect(mealPlannerCoachDuration('mealdone')).toBeLessThan(mealPlannerCoachDuration('wrong'));
  });

  it('expires without mutating the original message', () => {
    const message = createMealPlannerCoachMessage('Try again', 'wrong');
    const ticking = tickMealPlannerCoachMessage(message, 2);

    expect(ticking.life).toBe(4);
    expect(message.life).toBe(6);
    expect(tickMealPlannerCoachMessage(ticking, 4.1)).toBeNull();
  });
});

describe('Meal Planner adaptive at-risk coaching', () => {
  it('appears only for a market attempt that ignores remaining at-risk food', () => {
    expect(shouldShowAtRiskMarketCoach({
      source: 'market', atRiskRemaining: 2, alreadyShown: false,
    })).toBe(true);
    expect(shouldShowAtRiskMarketCoach({
      source: 'home', atRiskRemaining: 2, alreadyShown: false,
    })).toBe(false);
    expect(shouldShowAtRiskMarketCoach({
      source: 'market', atRiskRemaining: 0, alreadyShown: false,
    })).toBe(false);
  });

  it('never repeats during the same run', () => {
    expect(shouldShowAtRiskMarketCoach({
      source: 'market', atRiskRemaining: 2, alreadyShown: true,
    })).toBe(false);
  });
});

describe('Meal Planner chef decisions', () => {
  it('has no breakfast egg hint any more and shows the season advice', async () => {
    const coach = await import('./mealPlannerCoach.js');
    expect(coach.shouldSuggestBreakfastEgg).toBeUndefined();
    expect(coach.createMealPlannerCoachMessage('egg', 'breakfast')).toBeNull();
    expect(coach.createMealPlannerCoachMessage('season', 'season')).toMatchObject({ key: 'season', life: 6 });
  });

  it('season follows the scorer: «all» and the scenario season are in season', async () => {
    const { isOutOfSeasonInScenario } = await import('./mealPlannerCoach.js');
    expect(isOutOfSeasonInScenario({ season: 'summer' }, 'winter')).toBe(true);
    expect(isOutOfSeasonInScenario({ season: 'summer' }, 'summer')).toBe(false);
    expect(isOutOfSeasonInScenario({ season: 'all' }, 'winter')).toBe(false);
    expect(isOutOfSeasonInScenario({ season: 'summer' }, undefined)).toBe(false);
  });

  it('closing rules: undo of the same placement, home copy placed, mealdone never over advice', async () => {
    const c = await import('./mealPlannerCoach.js');
    const advice = { key: 'already', msg: 'x', life: 6, ref: { plateIdx: 1, socketIdx: 2, foodId: 'banana' } };
    expect(c.coachAfterUndo(advice, { plateIdx: 1, socketIdx: 2 })).toBeNull();
    expect(c.coachAfterUndo(advice, { plateIdx: 1, socketIdx: 3 })).toBe(advice);
    expect(c.coachAfterUndo({ key: 'atrisk', msg: 'x', life: 4 }, { plateIdx: 1, socketIdx: 2 })).toMatchObject({ key: 'atrisk' });
    expect(c.coachAfterHomePlacement(advice, 'banana')).toBeNull();
    expect(c.coachAfterHomePlacement(advice, 'egg')).toBe(advice);
    expect(c.shouldShowMealDone(advice)).toBe(false);
    expect(c.shouldShowMealDone({ key: 'atrisk' })).toBe(true);
    expect(c.shouldShowMealDone(null)).toBe(true);
  });
});
