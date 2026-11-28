import { test, expect, vi } from 'vitest';
import { createGameTiming, gameTimingPhase, watchGameTiming } from './gameTiming.js';

test('five minutes without input splits active and possible-idle time, then input resumes', () => {
  let now = 0;
  const clock = createGameTiming({ now: () => now, phase: () => 'active' });
  now = 360000;
  expect(clock.snapshot()).toMatchObject({ active_s: 300, idle_s: 60 });
  clock.activity();
  now = 370000;
  expect(clock.snapshot()).toMatchObject({ active_s: 310, idle_s: 60 });
  expect(clock.snapshot()).toMatchObject({ active_s: 310, idle_s: 60 });
});

test('categories never overlap; hidden and explicit pause remain separate from idle', () => {
  let now = 0, phase = 'learning';
  const clock = createGameTiming({ now: () => now, phase: () => phase });
  now = 10000; phase = 'paused'; clock.sample();
  now = 30000; phase = 'hidden'; clock.sample();
  now = 630000; phase = 'active'; clock.sample();
  clock.activity();
  now = 640000;
  expect(clock.snapshot()).toEqual({ timing_version: 1, active_s: 10, learning_s: 10,
    paused_s: 20, hidden_s: 600, idle_s: 0, other_s: 0 });
});

test('learning panels also become possibly idle after five minutes', () => {
  let now = 0;
  const clock = createGameTiming({ now: () => now, phase: () => 'learning' });
  now = 301000;
  expect(clock.snapshot()).toMatchObject({ learning_s: 300, idle_s: 1 });
});

test.each([
  ['WhereDoesItGrow', { reveal: {} }], ['GardenPlanner', { decisionEvent: {} }],
  ['GardenPlanner', { runLost: {} }],
  ['SoilDoctor', { diagnosisCard: {} }], ['SeasonMatcher', { showMissionIntro: true }],
  ['MarketTrip', { showingChoice: true }], ['MarketTrip', { checkoutOpen: true }],
  ['SpotTheFake', { inspect: {} }],
  ['FridgeManager', { helperTip: {} }], ['MealPlanner', { phase: 'results' }],
  ['LeftoverChef', { factCard: {} }], ['CompostCreator', { factCard: {} }],
  ['CircularCity', { reveal: {} }], ['PlanetaryBoundaries', { choice: {} }],
])('%s reports its learning surfaces independently of timerPaused', (game, state) => {
  expect(gameTimingPhase(game, 'PLAYING', state)).toBe('learning');
  expect(gameTimingPhase(game, 'PAUSED', state)).toBe('paused');
});

test('stale timerPaused is not a learning card; animations are not active play', () => {
  expect(gameTimingPhase('GardenPlanner', 'PLAYING', { timerPaused: true })).toBe('active');
  expect(gameTimingPhase('FridgeManager', 'PLAYING', { celebrating: true })).toBe('other');
  expect(gameTimingPhase('SoilDoctor', 'COMPLETED', {})).toBe('other');
});

test('page suspension, focus, input and disposal preserve one final snapshot', () => {
  vi.useFakeTimers();
  let now = 0;
  const target = new EventTarget();
  const doc = new EventTarget();
  doc.hidden = false; doc.hasFocus = () => true;
  const source = { current: { timingPhase: 'active' } };
  const clock = watchGameTiming(source, { target, doc, now: () => now });
  try {
    now = 10000; target.dispatchEvent(new Event('pagehide'));
    now = 610000; target.dispatchEvent(new Event('pageshow'));
    target.dispatchEvent(new Event('keydown'));
    now = 620000;
    expect(clock.finish()).toMatchObject({ active_s: 20, hidden_s: 600, idle_s: 0 });
    now = 999000; target.dispatchEvent(new Event('keydown'));
    expect(clock.finish()).toMatchObject({ active_s: 20, hidden_s: 600, idle_s: 0 });
    expect(vi.getTimerCount()).toBe(0);
  } finally { clock.finish(); vi.useRealTimers(); }
});
