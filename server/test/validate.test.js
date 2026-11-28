import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent, EVENT_TYPES, GAMES, ISLANDS, ISLAND_GAMES } from '../src/validate.js';

const base = { learner_id: 'aaaa1111', session_id: 'bbbb2222' };

test('requires event context without requiring legacy optional measurements', () => {
  for (const type of ['game_start', 'game_finish', 'game_abandon']) {
    for (const context of [{}, { island: 'growing' }, { game: 'SoilDoctor' }]) {
      assert.equal(validateEvent({ ...base, type, ...context }).ok, false);
    }
    const result = validateEvent({ ...base, type, island: 'growing', game: 'SoilDoctor' });
    assert.equal(result.ok, true);
    assert.equal(result.value.score, null);
    assert.equal(result.value.passed, null);
  }
  assert.equal(validateEvent({ ...base, type: 'island_enter' }).ok, false);
  assert.equal(validateEvent({ ...base, type: 'island_enter', island: 'growing' }).ok, true);
  assert.equal(validateEvent({ ...base, type: 'session_start' }).ok, true);
});

test('rejects conflicting game and island even without attempt ID or outcome', () => {
  for (const type of ['game_start', 'game_finish', 'game_abandon']) {
    assert.equal(validateEvent({ ...base, type, island: 'local', game: 'SoilDoctor' }).ok, false);
    assert.equal(validateEvent({ ...base, type, island: 'growing', game: 'SoilDoctor' }).ok, true);
  }
});

test('timing requires a complete bounded split on identified terminal game events', () => {
  const raw = { ...base, type: 'game_finish', island: 'growing', game: 'SoilDoctor', attempt_id: 'attempt1234',
    duration_s: 400, timing_version: 1, active_s: 300, learning_s: 20, paused_s: 10, hidden_s: 10, idle_s: 60, other_s: 0 };
  assert.equal(validateEvent(raw).value.active_s, 300);
  assert.equal(validateEvent({ ...raw, type: 'game_abandon' }).value.idle_s, 60);
  for (const patch of [{ active_s: -1 }, { active_s: '300' }, { active_s: null },
    { idle_s: undefined }, { timing_version: 2 }, { type: 'session_end' },
    { attempt_id: null }, { duration_s: 100 }]) {
    assert.equal(validateEvent({ ...raw, ...patch }).ok, false, JSON.stringify(patch));
  }
  assert.equal(validateEvent({ ...base, type: 'game_finish', island: 'growing', game: 'SoilDoctor' }).value.active_s, null);
});

test('passed is an explicit boolean on game_finish, with legacy outcomes unknown', () => {
  const raw = { ...base, type: 'game_finish', island: 'growing', game: 'SoilDoctor' };
  assert.equal(validateEvent({ ...raw, passed: true }).value.passed, 1);
  assert.equal(validateEvent({ ...raw, passed: false }).value.passed, 0);
  assert.equal(validateEvent(raw).value.passed, null);
  for (const passed of ['false', 1, 0, 'true']) assert.equal(validateEvent({ ...raw, passed }).ok, false);
  assert.equal(validateEvent({ ...raw, type: 'game_start', passed: true }).ok, false);
});

test('attempt IDs are preserved only on valid game events', () => {
  const raw = { ...base, type: 'game_start', island: 'growing', game: 'SoilDoctor', attempt_id: 'attempt0001' };
  assert.equal(validateEvent(raw).value.attempt_id, 'attempt0001');
  assert.equal(validateEvent({ ...raw, attempt_id: 'invalid!' }).ok, false);
  assert.equal(validateEvent({ ...raw, type: 'session_start' }).ok, false);
  assert.equal(validateEvent({ ...raw, island: 'local' }).ok, false);
  assert.equal(validateEvent({ ...raw, attempt_id: undefined }).ok, true);
});

test('accepts exactly eight event types, including activity redemption', () => {
  assert.equal(EVENT_TYPES.length, 8);
  assert.ok(EVENT_TYPES.includes('phygital_redeem'));
});

test('δέχεται έγκυρο game_finish και κρατά τους αριθμούς', () => {
  const r = validateEvent({ ...base, type: 'game_finish', island: 'growing',
    game: 'SoilDoctor', score: 90, stars: 2, duration_s: 400 });
  assert.equal(r.ok, true);
  assert.equal(r.value.game, 'SoilDoctor');
  assert.equal(r.value.stars, 2);
  assert.ok(r.value.ts > 0, 'ο server βάζει τη δική του χρονοσήμανση');
});

test('απορρίπτει άγνωστο τύπο', () => {
  assert.equal(validateEvent({ ...base, type: 'κατι_αλλο' }).ok, false);
});

test('απορρίπτει άγνωστο νησί ή παιχνίδι', () => {
  assert.equal(validateEvent({ ...base, type: 'island_enter', island: 'atlantis' }).ok, false);
  assert.equal(validateEvent({ ...base, type: 'game_start', island: 'growing', game: 'Doom' }).ok, false);
});

test('απορρίπτει ελεύθερο κείμενο σε αριθμητικό πεδίο', () => {
  assert.equal(validateEvent({ ...base, type: 'game_finish', island: 'growing',
    game: 'SoilDoctor', score: '<script>' }).ok, false);
});

test('πετάει άγνωστα πεδία αντί να τα αποθηκεύσει', () => {
  const r = validateEvent({ ...base, type: 'session_start', language: 'el',
    ip: '1.2.3.4', userAgent: 'Chrome', name: 'Μαρία' });
  assert.equal(r.ok, true);
  assert.equal(r.value.ip, undefined);
  assert.equal(r.value.userAgent, undefined);
  assert.equal(r.value.name, undefined);
});

test('απορρίπτει λάθος μορφή learner_id', () => {
  assert.equal(validateEvent({ learner_id: '', session_id: 'b', type: 'session_start' }).ok, false);
  assert.equal(validateEvent({ learner_id: 'x'.repeat(200), session_id: 'b', type: 'session_start' }).ok, false);
});

test('περιορίζει αστέρια στο 0..3 και σκορ σε λογικά όρια', () => {
  const r = validateEvent({ ...base, type: 'game_finish', island: 'growing',
    game: 'SoilDoctor', score: 999999, stars: 99 });
  assert.equal(r.ok, false);
});

test('hero_chosen με άκυρο game αποδεκτό και κρατά το hero', () => {
  const r = validateEvent({ ...base, type: 'hero_chosen', hero: 'pigtails', game: 'NotARealGame' });
  assert.equal(r.ok, true, 'Θα πρέπει να δέχεται hero_chosen χωρίς έλεγχο game');
  assert.equal(r.value.game, 'pigtails', 'Θα πρέπει να κρατά το hero, όχι το game');
});

test('μη-hero event με άκυρο game απορρίπτεται ακόμα', () => {
  const r = validateEvent({ ...base, type: 'game_start', island: 'growing', game: 'NotARealGame' });
  assert.equal(r.ok, false, 'Θα πρέπει να απορρίπτει μη-hero event με άκυρο game');
});

test('zero τιμές αποθηκεύονται ως 0 όχι null', () => {
  const r = validateEvent({ ...base, type: 'game_finish', island: 'growing',
    game: 'SoilDoctor', score: 0, stars: 0, duration_s: 0, progress: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.value.score, 0, 'score: 0 πρέπει να μείνει 0');
  assert.equal(r.value.stars, 0, 'stars: 0 πρέπει να μείνει 0');
  assert.equal(r.value.duration_s, 0, 'duration_s: 0 πρέπει να μείνει 0');
  assert.equal(r.value.progress, 0, 'progress: 0 πρέπει να μείνει 0');
});

test('όταν λείπουν numeric πεδία αποθηκεύονται ως null', () => {
  const r = validateEvent({ ...base, type: 'game_start', island: 'growing', game: 'SoilDoctor' });
  assert.equal(r.ok, true);
  assert.equal(r.value.score, null, 'score: undefined πρέπει να γίνει null');
  assert.equal(r.value.stars, null, 'stars: undefined πρέπει να γίνει null');
  assert.equal(r.value.duration_s, null, 'duration_s: undefined πρέπει να γίνει null');
  assert.equal(r.value.progress, null, 'progress: undefined πρέπει να γίνει null');
});

test('ο χάρτης νησί→παιχνίδια είναι κλειδωμένος στο MISSION_MAP', () => {
  assert.deepEqual(ISLAND_GAMES, {
    growing:   ['WhereDoesItGrow', 'GardenPlanner', 'SoilDoctor'],
    local:     ['SeasonMatcher', 'MarketTrip', 'SpotTheFake'],
    foodwaste: ['FridgeManager', 'MealPlanner', 'LeftoverChef'],
    circular:  ['CompostCreator', 'CircularCity', 'PlanetaryBoundaries'],
  });
  assert.deepEqual(Object.keys(ISLAND_GAMES).sort(), [...ISLANDS].sort(),
    'κάθε νησί έχει καταχώρηση — αλλιώς το perIsland θα έσκαγε σε undefined');
  assert.equal(GAMES.length, 12);
  assert.equal(new Set(GAMES).size, 12, 'κανένα παιχνίδι σε δύο νησιά');
});

test('phygital_redeem keeps only a well-formed activity id, in the game field', () => {
  const base = { learner_id: 'learner01', session_id: 'session01', type: 'phygital_redeem', language: 'el' };
  const ok = validateEvent({ ...base, activity: 'LOCAL01' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.game, 'LOCAL01');
  for (const activity of [undefined, 'local01', 'LOCAL 01', 'X'.repeat(40), '<script>']) {
    assert.equal(validateEvent({ ...base, activity }).ok, false, String(activity));
  }
});
