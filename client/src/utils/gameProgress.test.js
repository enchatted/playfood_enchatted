import { describe, expect, it } from 'vitest';
import { getGameProgress, watchGameAbandonment } from './gameProgress.js';

describe('objective progress at abandonment', () => {
  it.each([
    ['WhereDoesItGrow', { correct: 3, deck: Array(12) }, 25],
    ['GardenPlanner', { plots: [{ harvested: true }, { harvested: false }] }, 50],
    ['SoilDoctor', { healedCount: 1, plots: Array(4) }, 25],
    ['SeasonMatcher', { basketCount: 2, basketSize: 6 }, 33],
    ['MarketTrip', { stallsDone: 2, stalls: Array(4) }, 50],
    ['SpotTheFake', { judgedCount: 3, products: Array(6) }, 50],
    ['FridgeManager', { acceptedCount: 4, counterItems: Array(10) }, 40],
    ['MealPlanner', { plates: [{ slots: [{ item: 'rice' }, { item: null }] }] }, 50],
    ['LeftoverChef', { completedGoals: ['soup'], goals: Array(3) }, 33],
    ['CompostCreator', { totalPlaced: 3, counterItems: Array(12) }, 25],
    ['CircularCity', { routedCount: 2, resources: Array(8) }, 25],
    ['PlanetaryBoundaries', { choicesMade: 1, consoles: Array(4) }, 25],
  ])('%s reads objective units, independently of score/time', (game, state, expected) => {
    expect(getGameProgress(game, { ...state, score: 900, time: 999 })).toBe(expected);
  });

  it('distinguishes an uninitialised game from real zero progress', () => {
    expect(getGameProgress('FridgeManager', {})).toBeNull();
    expect(getGameProgress('FridgeManager', { acceptedCount: 0, counterItems: Array(10) })).toBe(0);
    expect(getGameProgress('FridgeManager', { acceptedCount: 0, counterItems: [] })).toBeNull();
    expect(getGameProgress('unknown', {})).toBeNull();
  });

  it('reads current placements after an undo, not the highest previous progress', () => {
    const state = { plates: [{ slots: [{ item: 'rice' }, { item: 'beans' }] }] };
    expect(getGameProgress('MealPlanner', state)).toBe(100);
    state.plates[0].slots[1].item = null;
    expect(getGameProgress('MealPlanner', state)).toBe(50);
  });
});

function attempt() {
  const target = new EventTarget();
  const source = { current: { state: { judgedCount: 0, products: Array(6) }, completed: false } };
  const finished = { current: false };
  const events = [];
  const leave = watchGameAbandonment({ target, mission: 'SpotTheFake', island: 'local',
    attemptId: 'attempt1234', finishedRef: finished, source,
    send: (type, fields, final) => events.push({ type, ...fields, final }),
  });
  const hide = (persisted = false) => {
    const event = new Event('pagehide');
    Object.defineProperty(event, 'persisted', { value: persisted });
    target.dispatchEvent(event);
  };
  return { source, finished, events, leave, hide };
}

describe('abandonment lifecycle', () => {
  it('reads latest state at exit and emits only one terminal event', () => {
    const run = attempt();
    run.source.current.state.judgedCount = 3;
    run.leave();
    run.leave();
    run.hide();
    expect(run.events).toEqual([{ type: 'game_abandon', island: 'local', game: 'SpotTheFake',
      attempt_id: 'attempt1234', progress: 50, final: false }]);
  });
  it('uses final delivery on refresh without a second event on unmount', () => {
    const run = attempt();
    run.hide();
    run.leave();
    expect(run.events).toHaveLength(1);
    expect(run.events[0]).toMatchObject({ final: true, progress: 0 });
  });
  it('does not abandon a page preserved in back-forward cache', () => {
    const run = attempt();
    run.hide(true);
    expect(run.events).toEqual([]);
    run.source.current.state.judgedCount = 6;
    run.leave();
    expect(run.events[0].progress).toBe(100);
  });
  it.each(['finished', 'completed'])('does not misclassify %s rounds as quits', (phase) => {
    const run = attempt();
    if (phase === 'finished') run.finished.current = true;
    else run.source.current.completed = true;
    run.hide();
    run.leave();
    expect(run.events).toEqual([]);
  });
});
