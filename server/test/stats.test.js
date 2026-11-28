import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, insertEvent, closeDb } from '../src/db.js';
import { computeStats } from '../src/stats.js';
import { ISLAND_GAMES } from '../src/validate.js';

const DAY = 86400000;

test('game participation counts each profile once and excludes visits without game evidence', () => {
  const db = openDb(':memory:');
  const add = (o) => insertEvent(db, {
    ts: Date.now(), learner_id: 'opener', session_id: 'open', type: 'session_start',
    island: null, game: null, score: null, stars: null, duration_s: null,
    progress: null, language: 'el', returning: 0, ...o,
  });
  add({});
  add({ type: 'session_end', duration_s: 600 });
  add({ session_id: 'reload', returning: 1 });
  add({ session_id: 'reload', type: 'session_end', duration_s: 1200 });
  add({ learner_id: 'hero-only', type: 'hero_chosen', game: 'braid' });
  add({ learner_id: 'island-only', type: 'island_enter', island: 'growing' });
  add({ learner_id: 'code-only', type: 'phygital_redeem', game: 'LOCAL01' });
  add({ learner_id: 'starter', type: 'game_start', island: 'growing', game: 'SoilDoctor' });
  add({ learner_id: 'starter', type: 'game_start', island: 'growing', game: 'SoilDoctor' });
  add({ learner_id: 'starter', session_id: 'second-game-visit', type: 'game_start', island: 'local', game: 'MarketTrip' });
  add({ learner_id: 'finisher', type: 'game_finish', island: 'growing', game: 'SoilDoctor' });
  add({ learner_id: 'abandoner', type: 'game_abandon', island: 'growing', game: 'SoilDoctor' });
  add({ learner_id: 'no-language', type: 'game_start', island: 'growing', game: 'SoilDoctor', language: null });

  const stats = computeStats(db);
  assert.equal(stats.overview.gameProfiles, 4);
  assert.deepEqual(stats.audience.gameLanguages, [
    { language: 'en', count: 0 },
    { language: 'nl', count: 0 },
    { language: 'el', count: 3 },
    { language: 'pt', count: 0 },
  ]);
  assert.equal(stats.overview.learners, 8);
  assert.equal(stats.overview.sessions, 10);
  assert.equal(stats.overview.hours, 0.5);
  assert.deepEqual(stats.audience.visits, { first: 1, returning: 1, unknown: 8 });
  assert.deepEqual(stats.audience.languages, [
    { language: 'en', count: 0 },
    { language: 'nl', count: 0 },
    { language: 'el', count: 9 },
    { language: 'pt', count: 0 },
  ]);
  assert.deepEqual(stats.funnel.map(row => row.count), [8, 6, 5, 1, 0, 0]);
  closeDb(db);
});

test('game participation filters evidence by inclusive dates and language before deduplicating profiles', () => {
  const db = openDb(':memory:');
  const add = (day, o) => insertEvent(db, {
    ts: new Date(`2026-09-${day}T12:00:00Z`).getTime(), learner_id: 'repeat',
    session_id: 'visit', type: 'game_start', island: 'growing', game: 'SoilDoctor',
    score: null, stars: null, duration_s: null, progress: null,
    language: 'el', returning: null, ...o,
  });
  add('06', {});
  add('07', {});
  add('08', { language: 'nl' });
  add('09', { language: 'pt' });
  add('07', { learner_id: 'finisher', type: 'game_finish', language: 'nl' });
  add('08', { learner_id: 'abandoner', type: 'game_abandon' });
  add('06', { learner_id: 'before' });
  add('09', { learner_id: 'after' });
  add('07', { learner_id: 'open-only', type: 'session_start', island: null, game: null, language: 'pt' });

  const selected = { from: '2026-09-07', to: '2026-09-08' };
  const stats = computeStats(db, selected);
  assert.equal(stats.overview.gameProfiles, 3);
  assert.deepEqual(stats.audience.gameLanguages, [
    { language: 'en', count: 0 },
    { language: 'nl', count: 2 },
    { language: 'el', count: 2 },
    { language: 'pt', count: 0 },
  ]);
  for (const [language, count] of [['en', 0], ['nl', 2], ['el', 2], ['pt', 0]]) {
    const filtered = computeStats(db, { ...selected, language });
    assert.equal(filtered.overview.gameProfiles, count);
    assert.deepEqual(filtered.audience.gameLanguages, [
      { language: 'en', count: 0 },
      { language: 'nl', count: language === 'nl' ? 2 : 0 },
      { language: 'el', count: language === 'el' ? 2 : 0 },
      { language: 'pt', count: 0 },
    ]);
  }
  assert.equal(computeStats(db, { to: '2026-09-06' }).overview.gameProfiles, 2);
  assert.equal(computeStats(db, { from: '2026-09-09' }).overview.gameProfiles, 2);
  closeDb(db);
});

test('empty game participation keeps four ordered zero language rows', () => {
  const db = openDb(':memory:');
  const stats = computeStats(db);
  assert.equal(stats.overview.gameProfiles, 0);
  assert.deepEqual(stats.audience.gameLanguages, [
    { language: 'en', count: 0 },
    { language: 'nl', count: 0 },
    { language: 'el', count: 0 },
    { language: 'pt', count: 0 },
  ]);
  closeDb(db);
});

test('abandonment proves island reach but never completion', () => {
  const db = openDb(':memory:');
  insertEvent(db, { ts: Date.now(), learner_id: 'kid1', session_id: 'visit1', type: 'game_abandon',
    island: 'growing', game: 'SoilDoctor', language: 'el', returning: 0,
    score: null, stars: null, duration_s: null, progress: null });
  const stats = computeStats(db);
  assert.deepEqual(stats.funnel.map(row => row.count), [1, 1, 1, 0, 0, 0]);
  assert.equal(stats.perIsland[0].entered, 1);
  assert.equal(stats.perIsland[0].finishedAll3, 0);
  closeDb(db);
});

test('visit counts consistently distinguish profiles sharing a session ID', () => {
  const db = openDb(':memory:');
  for (const learner_id of ['kid1', 'kid2']) {
    for (const language of ['el', 'en']) insertEvent(db, { ts: Date.now(), learner_id,
      session_id: 'shared1', type: 'session_start', language, returning: 0,
      island: null, game: null, score: null, stars: null, duration_s: null, progress: null });
  }
  for (const language of [null, 'el']) {
    const stats = computeStats(db, { language });
    assert.equal(stats.overview.sessions, 2);
    assert.equal(stats.audience.visits.first, 2);
    assert.equal(stats.audience.languages.find(row => row.language === 'el').count, 2);
  }
  closeDb(db);
});

test('average sample counts are independent for score and stars, including zero and excluding missing values', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfsamples-')), 'playfood.db'));
  const add = (o) => insertEvent(db, { ts: Date.now(), learner_id: 'kid1', session_id: 'visit1',
    type: 'game_finish', island: 'growing', game: 'SoilDoctor', score: null, stars: null,
    duration_s: null, progress: null, language: 'el', returning: 0, ...o });
  add({ stars: 0, score: 0 });
  add({ stars: 2, score: 60 });
  add({ score: 90 });
  add({});
  add({ language: 'nl', stars: 3, score: 100 });
  add({ type: 'game_abandon', stars: 3, score: 100 });
  const stats = computeStats(db, { language: 'el' });
  const row = gameRow(stats, 'SoilDoctor');
  assert.equal(row.starsMeasured, 2);
  assert.equal(row.scoresMeasured, 3);
  assert.equal(row.finished, 4);
  assert.equal(row.avgStars, 1);
  assert.equal(row.avgScore, 50);
  const empty = gameRow(stats, 'MarketTrip');
  assert.equal(empty.starsMeasured, 0);
  assert.equal(empty.scoresMeasured, 0);
  assert.equal(empty.avgStars, null);
  assert.equal(empty.avgScore, null);
  assert.equal(stats.perIsland.find(r => r.island === 'growing').starsMeasured, 2);
  closeDb(db);
});

test('star distribution separates zero from missing measurements and counts only matching finishes', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfstars-')), 'playfood.db'));
  const add = (o) => insertEvent(db, { ts: Date.now(), learner_id: 'kid1', session_id: 'visit1',
    type: 'game_finish', island: 'growing', game: 'SoilDoctor', score: null, stars: null,
    duration_s: null, progress: null, language: 'el', returning: 0, ...o });
  add({ stars: 0, score: 0, passed: 1 });
  add({ stars: 0, score: 0, passed: 0 });
  add({ stars: 2, score: 60 });
  add({});
  add({ stars: 3, language: 'nl' });
  add({ type: 'game_abandon', stars: 3 });
  const stats = computeStats(db, { language: 'el' });
  const distribution = stats.stars.find(r => r.game === 'SoilDoctor');
  assert.deepEqual(distribution, { game: 'SoilDoctor', s0: 2, s1: 0, s2: 1, s3: 0, unknown: 1 });
  const row = gameRow(stats, 'SoilDoctor');
  assert.equal(distribution.s0 + distribution.s1 + distribution.s2 + distribution.s3 + distribution.unknown, row.finished);
  assert.equal(row.avgStars, 0.7);
  assert.equal(row.avgScore, 20);
  assert.equal(computeStats(db).stars.find(r => r.game === 'SoilDoctor').s3, 1);
  closeDb(db);
});

test('time breakdown averages only measured terminal rounds, includes abandonment and obeys language filter', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfsplit-')), 'playfood.db'));
  const add = (o) => insertEvent(db, { ts: Date.now(), learner_id: 'kid1', session_id: 'visit1',
    type: 'game_finish', island: 'growing', game: 'SoilDoctor', score: null, stars: null,
    duration_s: 600, progress: null, language: 'el', returning: 0, ...o });
  add({});
  const timing = { timing_version: 1, active_s: 300, learning_s: 20, paused_s: 0, hidden_s: 10, idle_s: 60, other_s: 0 };
  add(timing);
  add({ ...timing, type: 'game_abandon', active_s: 100 });
  add({ ...timing, language: 'nl', active_s: 500 });
  const row = gameRow(computeStats(db, { language: 'el' }), 'SoilDoctor');
  assert.equal(row.timing.measured, 2);
  assert.equal(row.timing.active_s, 200);
  assert.equal(row.timing.idle_s, 60);
  const empty = gameRow(computeStats(db), 'MarketTrip');
  assert.equal(empty.timing.measured, 0);
  assert.equal(empty.timing.active_s, null);
  closeDb(db);
});

test('visit duration counts the latest end once, and only in its end date/language', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pftime-')), 'playfood.db'));
  const add = (o) => insertEvent(db, {
    ts: new Date('2026-09-07T12:00:00Z').getTime(), learner_id: 'kid1', session_id: 'visit1',
    type: 'session_end', island: null, game: null, score: null, stars: null,
    duration_s: 600, progress: null, language: 'el', returning: 0, ...o,
  });
  add({});
  add({ duration_s: 1200, language: 'nl', ts: new Date('2026-09-08T12:00:00Z').getTime() });
  add({ duration_s: 1200, language: 'nl', ts: new Date('2026-09-08T12:00:00Z').getTime() });
  add({ session_id: 'visit2', type: 'session_start', duration_s: null });
  add({ session_id: 'visit3', duration_s: null });
  const all = computeStats(db).overview;
  assert.equal(all.visitsMeasured, 1);
  assert.equal(all.avgVisitSeconds, 1200);
  assert.equal(all.hours, 0.3);
  assert.equal(computeStats(db, { language: 'el' }).overview.hours, null);
  assert.equal(computeStats(db, { to: '2026-09-07' }).overview.visitsMeasured, 0);
  assert.equal(computeStats(db, { language: 'nl' }).overview.visitsMeasured, 1);
  closeDb(db);
});

test('no timing samples means unknown, while a recorded zero remains zero', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfzero-')), 'playfood.db'));
  assert.equal(computeStats(db).overview.hours, null);
  insertEvent(db, { ts: Date.now(), learner_id: 'kid1', session_id: 'visit1',
    type: 'session_end', island: null, game: null, score: null, stars: null,
    duration_s: 0, progress: null, language: 'el', returning: 0 });
  assert.equal(computeStats(db).overview.hours, 0);
  assert.equal(computeStats(db).overview.visitsMeasured, 1);
  closeDb(db);
});

test('per-game elapsed time exposes its actual measured sample size', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfgametime-')), 'playfood.db'));
  for (const duration_s of [0, 120, null]) insertEvent(db, {
    ts: Date.now(), learner_id: 'kid1', session_id: 'visit1', type: 'game_finish',
    island: 'growing', game: 'SoilDoctor', score: null, stars: null,
    duration_s, progress: null, language: 'el', returning: 0,
  });
  const row = gameRow(computeStats(db), 'SoilDoctor');
  assert.equal(row.avgSeconds, 60);
  assert.equal(row.timedFinishes, 2);
  assert.equal(row.finished, 3);
  assert.equal(islandRow(computeStats(db), 'growing').timedFinishes, 2);
  assert.equal(gameRow(computeStats(db), 'GardenPlanner').timedFinishes, 0);
  closeDb(db);
});

test('only explicitly passed distinct games count towards islands and 12/12', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfpassed-')), 'playfood.db'));
  const add = (o) => insertEvent(db, {
    ts: Date.now(), learner_id: 'player', session_id: 'visit', type: 'game_finish',
    island: 'growing', game: 'SoilDoctor', score: 20, stars: 3, duration_s: 10,
    progress: null, language: 'el', returning: 0, ...o,
  });
  for (const [island, games] of Object.entries(ISLAND_GAMES)) {
    for (const game of games) {
      add({ island, game, learner_id: 'failed', passed: 0 });
      add({ island, game, learner_id: 'legacy', passed: null });
      add({ island, game, learner_id: 'passed', passed: 1, stars: 0 });
    }
  }
  // Repeating one successful game cannot complete a different island.
  for (let i = 0; i < 3; i++) add({ learner_id: 'replay', passed: 1 });
  const stats = computeStats(db);
  assert.equal(stats.overview.finished12, 1);
  assert.equal(stats.overview.gamesFinished, 39);
  assert.deepEqual(stats.overview.outcomes, { passed: 15, failed: 12, unknown: 12 });
  for (const island of stats.perIsland) assert.equal(island.finishedAll3, 1);
  assert.equal(stats.funnel[4].count, 1);
  assert.deepEqual(gameRow(stats, 'SoilDoctor').outcomes, { passed: 4, failed: 1, unknown: 1 });
  assert.equal(computeStats(db, { language: 'nl' }).overview.finished12, 0);
  closeDb(db);
});

test('completion rate uses identified starts and matching finishes in the same filtered period', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfattempt-')), 'playfood.db'));
  const add = (o) => insertEvent(db, {
    ts: new Date('2026-09-07T12:00:00Z').getTime(), learner_id: 'kid1', session_id: 'visit1',
    type: 'game_start', island: 'growing', game: 'SoilDoctor', score: null, stars: null,
    duration_s: null, progress: null, language: 'el', returning: 0, ...o,
  });
  add({ attempt_id: 'attempt0001' });
  add({ attempt_id: 'attempt0001', type: 'game_finish' });
  add({ attempt_id: 'attempt0002' });
  add({ attempt_id: 'attempt0002', type: 'game_finish', ts: new Date('2026-09-08T12:00:00Z').getTime() });
  add({ type: 'game_finish' });
  add({ type: 'game_finish', attempt_id: 'orphan0001' });
  add({ type: 'game_finish', attempt_id: 'attempt0001', session_id: 'anotherVisit' });
  const row = gameRow(computeStats(db, { from: '2026-09-07', to: '2026-09-07', language: 'el' }), 'SoilDoctor');
  assert.equal(row.pct, 50);
  assert.equal(row.trackedStarted, 2);
  assert.equal(row.matchedFinished, 1);
  assert.equal(row.unpairedFinishes, 3);
  assert.equal(gameRow(computeStats(db, { language: 'el' }), 'SoilDoctor').pct, 100);
  closeDb(db);
});

test('legacy-only results have no reliable completion rate', () => {
  const db = seed();
  assert.equal(gameRow(computeStats(db), 'WhereDoesItGrow').pct, null);
  closeDb(db);
});

test('language audience counts visits with activity even when their start has no language', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pflanguage-')), 'playfood.db'));
  const add = (o) => insertEvent(db, {
    ts: Date.now(), learner_id: 'kid1', session_id: 'visit1', type: 'session_start',
    island: null, game: null, score: null, stars: null, duration_s: null,
    progress: null, language: null, returning: 0, ...o,
  });
  add({});
  add({ type: 'game_start', island: 'growing', game: 'SoilDoctor', language: 'el' });
  add({ type: 'game_finish', island: 'growing', game: 'SoilDoctor', language: 'el', stars: 3 });
  add({ type: 'game_start', island: 'local', game: 'MarketTrip', language: 'nl' });
  const greek = computeStats(db, { language: 'el' });
  assert.equal(greek.overview.sessions, 1);
  assert.equal(greek.audience.visits.first, 1);
  assert.equal(greek.audience.languages.find(l => l.language === 'el').count, 1);
  assert.equal(greek.perIsland[0].games.find(g => g.game === 'SoilDoctor').finished, 1);
  const all = computeStats(db);
  assert.equal(all.overview.sessions, 1);
  assert.equal(all.audience.languages.find(l => l.language === 'el').count, 1);
  assert.equal(all.audience.languages.find(l => l.language === 'nl').count, 1);
  closeDb(db);
});

test('returning status follows the visit start outside the selected dates; missing starts remain unknown', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfreturn-')), 'playfood.db'));
  const add = (o) => insertEvent(db, {
    ts: new Date('2026-09-07T12:00:00Z').getTime(), learner_id: 'kid1', session_id: 'visit1', type: 'game_start',
    island: 'growing', game: 'SoilDoctor', score: null, stars: null, duration_s: null,
    progress: null, language: 'el', returning: 0, ...o,
  });
  add({ type: 'session_start', ts: new Date('2026-09-05T12:00:00Z').getTime(), returning: 1, language: null });
  add({});
  add({ session_id: 'visit2' });
  const stats = computeStats(db, { from: '2026-09-07', to: '2026-09-07', language: 'el' });
  assert.equal(stats.audience.visits.returning, 1);
  assert.equal(stats.audience.visits.first, 0);
  assert.equal(stats.audience.visits.unknown, 1);
  closeDb(db);
});

// Οι γραμμές των παιχνιδιών ζουν πλέον μέσα στο νησί τους. Ο βοηθός ισοπεδώνει
// τα τέσσερα νησιά στα δώδεκα παιχνίδια, ώστε τα tests να ρωτάνε «δώσε μου τη
// γραμμή αυτού του παιχνιδιού» χωρίς να ξέρουν σε ποιο νησί ανήκει.
const gameRows = (s) => s.perIsland.flatMap((i) => i.games);
const gameRow = (s, game) => gameRows(s).find((g) => g.game === game);
const islandRow = (s, island) => s.perIsland.find((i) => i.island === island);

function seed() {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfst-')), 'playfood.db'));
  const now = Date.now();
  const add = (o) => insertEvent(db, {
    ts: now, learner_id: 'x', session_id: 's', type: 'session_start',
    island: null, game: null, score: null, stars: null, duration_s: null,
    progress: null, language: 'el', returning: 0,
    passed: o.type === 'game_finish' ? 1 : null, ...o,
  });

  // δύο παιδιά, τρεις επισκέψεις συνολικά
  add({ learner_id: 'kid1', session_id: 's1', type: 'session_start' });
  add({ learner_id: 'kid1', session_id: 's1', type: 'hero_chosen', game: 'braid' });
  add({ learner_id: 'kid1', session_id: 's1', type: 'island_enter', island: 'growing' });
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_start', island: 'growing', game: 'WhereDoesItGrow' });
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_finish', island: 'growing',
        game: 'WhereDoesItGrow', score: 90, stars: 3, duration_s: 300 });

  // ο kid1 συνεχίζει και τελειώνει 3 διαφορετικά παιχνίδια στο 'growing' ΚΑΙ
  // 3 διαφορετικά στο 'local' — απαραίτητο για να μπορεί ο έλεγχος μονοτονίας
  // πιο κάτω να πιάσει το σφάλμα «μετράω ζευγάρια παιδί×νησί, όχι παιδιά»
  // (χωρίς αυτό, κανένα παιδί δεν τελειώνει ποτέ δεύτερο νησί και το σφάλμα
  // δεν μπορεί να ενεργοποιηθεί από τη μαρτυρία).
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_start', island: 'growing', game: 'GardenPlanner' });
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_finish', island: 'growing',
        game: 'GardenPlanner', score: 80, stars: 2, duration_s: 200 });
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_start', island: 'growing', game: 'SoilDoctor' });
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_finish', island: 'growing',
        game: 'SoilDoctor', score: 80, stars: 2, duration_s: 200 });
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_start', island: 'local', game: 'SeasonMatcher' });
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_finish', island: 'local',
        game: 'SeasonMatcher', score: 80, stars: 2, duration_s: 150 });
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_start', island: 'local', game: 'MarketTrip' });
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_finish', island: 'local',
        game: 'MarketTrip', score: 80, stars: 2, duration_s: 150 });
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_start', island: 'local', game: 'SpotTheFake' });
  add({ learner_id: 'kid1', session_id: 's1', type: 'game_finish', island: 'local',
        game: 'SpotTheFake', score: 80, stars: 2, duration_s: 150 });

  add({ learner_id: 'kid1', session_id: 's1', type: 'session_end', duration_s: 600 });

  add({ learner_id: 'kid2', session_id: 's2', type: 'session_start' });
  add({ learner_id: 'kid2', session_id: 's2', type: 'game_start', island: 'growing', game: 'WhereDoesItGrow' });
  add({ learner_id: 'kid2', session_id: 's2', type: 'game_abandon', island: 'growing',
        game: 'WhereDoesItGrow', progress: 40 });

  // παλιά επίσκεψη του kid1 — έξω από το φίλτρο 7 ημερών
  add({ learner_id: 'kid1', session_id: 's3', type: 'session_start', ts: now - 40 * DAY });

  return db;
}

test('η επισκόπηση μετρά παιδιά και επισκέψεις χωριστά', () => {
  const db = seed();
  const { overview } = computeStats(db, { from: null, to: null });
  assert.equal(overview.learners, 2, 'δύο μοναδικά παιδιά');
  assert.equal(overview.sessions, 3, 'τρεις επισκέψεις — η μία παλιά');
  assert.equal(overview.gamesFinished, 6, 'ο kid1 τελείωσε 6 παιχνίδια συνολικά (3 growing + 3 local)');
  closeDb(db);
});

test('οι ώρες παιχνιδιού προκύπτουν από τα session_end', () => {
  const db = seed();
  const { overview } = computeStats(db, { from: null, to: null });
  assert.equal(overview.hours, 0.2); // 600s = 0,17 → στρογγυλοποίηση σε 1 δεκαδικό
  closeDb(db);
});

test('το χωνί έχει 6 βήματα με φθίνοντα αριθμό', () => {
  const db = seed();
  const { funnel } = computeStats(db, { from: null, to: null });
  assert.equal(funnel.length, 6);
  assert.equal(funnel[0].count, 2, 'μπήκαν = 2 παιδιά');
  // 2 όχι 1: ο kid2 δεν έχει hero_chosen, αλλά έχει game_start — και το βήμα
  // πλέον μετρά «έφτασε ΤΟΥΛΑΧΙΣΤΟΝ ως εδώ» (game_start αποδεικνύει ότι πέρασε
  // και από διαλογή χαρακτήρα), όχι μόνο το ίδιο το hero_chosen event.
  assert.equal(funnel[1].count, 2, 'διάλεξαν χαρακτήρα = 2 (kid1 hero_chosen + kid2 game_start)');
  for (let i = 1; i < funnel.length; i++) {
    assert.ok(funnel[i].count <= funnel[i - 1].count, 'το χωνί δεν μπορεί να ανεβαίνει');
  }
  closeDb(db);
});

test('legacy game counts and averages remain visible without inventing a matched rate', () => {
  const db = seed();
  const row = gameRow(computeStats(db, { from: null, to: null }), 'WhereDoesItGrow');
  assert.equal(row.started, 2);
  assert.equal(row.finished, 1);
  assert.equal(row.pct, null);
  assert.equal(row.avgStars, 3);
  assert.equal(row.avgSeconds, 300);
  closeDb(db);
});

test('η κατανομή αστεριών μετρά ανά επίπεδο', () => {
  const db = seed();
  const row = computeStats(db, { from: null, to: null })
    .stars.find((g) => g.game === 'WhereDoesItGrow');
  assert.deepEqual([row.s1, row.s2, row.s3], [0, 0, 1]);
  closeDb(db);
});

test('το φίλτρο ημερομηνίας κόβει τα έξω από το εύρος', () => {
  const db = seed();
  // ΤΟΠΙΚΗ ημερομηνία, όχι UTC: το computeStats φιλτράρει με SQLite 'localtime',
  // οπότε ένα toISOString() θα ζητούσε τη ΧΘΕΣΙΝΗ μέρα κάθε βράδυ 00:00-03:00 σε
  // Αθήνα (UTC+3) και το test θα έβρισκε 0 αποτελέσματα. Το 'en-CA' δίνει YYYY-MM-DD.
  const today = new Date().toLocaleDateString('en-CA');
  const { overview } = computeStats(db, { from: today, to: today });
  assert.equal(overview.sessions, 2, 'η παλιά επίσκεψη πρέπει να έχει κοπεί');
  closeDb(db);
});

test('παιδί με game_finish αλλά ΧΩΡΙΣ session_start δεν κάνει το χωνί να ανέβει', () => {
  // Αναπαράγει: ο εκπαιδευτικός ενεργοποιεί την καταγραφή ΕΝΩ το παιδί παίζει
  // ήδη — το session_start του ποτέ δεν καταγράφηκε, αλλά τα game_finish ναι.
  // Πριν, «Μπήκαν» βασιζόταν αποκλειστικά στο session_start και έβγαινε 0 ενώ
  // «Τελείωσε παιχνίδι» έβγαινε 1 — το χωνί ανέβαινε στο πρώτο του βήμα.
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfghost-')), 'playfood.db'));
  const now = Date.now();
  const add = (o) => insertEvent(db, {
    ts: now, learner_id: 'ghost', session_id: 'sg', type: 'session_start',
    island: null, game: null, score: null, stars: null, duration_s: null,
    progress: null, language: 'el', returning: 0, ...o,
  });
  add({ type: 'hero_chosen', game: 'braid' });
  add({ type: 'island_enter', island: 'growing' });
  add({ type: 'game_start', island: 'growing', game: 'WhereDoesItGrow' });
  add({ type: 'game_finish', island: 'growing', game: 'WhereDoesItGrow',
        score: 90, stars: 3, duration_s: 300 });

  const { funnel } = computeStats(db, { from: null, to: null });
  assert.equal(funnel.length, 6);
  for (let i = 1; i < funnel.length; i++) {
    assert.ok(funnel[i].count <= funnel[i - 1].count,
      `το «${funnel[i].step}» (${funnel[i].count}) δεν πρέπει να ξεπερνά το ` +
      `«${funnel[i - 1].step}» (${funnel[i - 1].count})`);
  }
  closeDb(db);
});

test('παιδιά με ΜΟΝΟ game_finish (χωρίς hero_chosen/island_enter/session_start) δεν κάνουν το χωνί να ανέβει', () => {
  // Αναπαράγει το πραγματικό εύρημα: δύο παιδιά που έχουν ήδη τελειώσει 3
  // παιχνίδια στο ίδιο νησί, αλλά ΚΑΝΕΝΑ πρωιμότερο event (session_start,
  // hero_chosen, island_enter) δεν έφτασε ποτέ στον server. Πριν το fix αυτό
  // έδινε 2 ≥ 0 ≥ 0 ≥ 2 ≥ 2 ≥ 0 — ανέβαινε ακριβώς στο «Τελείωσε παιχνίδι».
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfnoisy-')), 'playfood.db'));
  const now = Date.now();
  const add = (o) => insertEvent(db, {
    ts: now, learner_id: 'x', session_id: 's', type: 'session_start',
    island: null, game: null, score: null, stars: null, duration_s: null,
    progress: null, language: 'el', returning: 0, ...o,
  });
  for (const kid of ['noisyA', 'noisyB']) {
    add({ learner_id: kid, session_id: `s-${kid}`, type: 'game_start', island: 'growing', game: 'WhereDoesItGrow' });
    add({ learner_id: kid, session_id: `s-${kid}`, type: 'game_finish', island: 'growing',
          game: 'WhereDoesItGrow', score: 90, stars: 3, duration_s: 300 });
    add({ learner_id: kid, session_id: `s-${kid}`, type: 'game_start', island: 'growing', game: 'GardenPlanner' });
    add({ learner_id: kid, session_id: `s-${kid}`, type: 'game_finish', island: 'growing',
          game: 'GardenPlanner', score: 80, stars: 2, duration_s: 200 });
    add({ learner_id: kid, session_id: `s-${kid}`, type: 'game_start', island: 'growing', game: 'SoilDoctor' });
    add({ learner_id: kid, session_id: `s-${kid}`, type: 'game_finish', island: 'growing',
          game: 'SoilDoctor', score: 80, stars: 2, duration_s: 200 });
  }

  const { funnel } = computeStats(db, { from: null, to: null });
  assert.equal(funnel.length, 6);
  for (let i = 1; i < funnel.length; i++) {
    assert.ok(funnel[i].count <= funnel[i - 1].count,
      `το «${funnel[i].step}» (${funnel[i].count}) δεν πρέπει να ξεπερνά το ` +
      `«${funnel[i - 1].step}» (${funnel[i - 1].count})`);
  }
  closeDb(db);
});

test('FIX 4: 12/12 δεν ξεπερνά ποτέ το "Finished an island" — ΥΠΟΘΕΣΗ καταλόγου παιχνιδιών', () => {
  // Το βήμα «Reached 12/12» δεν ξεπερνά ΠΟΤΕ το «Finished an island» (που
  // απαιτεί ≥3 τελειωμένα ΣΤΟ ΙΔΙΟ νησί) μόνο επειδή σήμερα ο κατάλογος έχει
  // 12 παιχνίδια σε 4 νησιά: 12/4 = 3, άρα ένα παιδί που τελείωσε και τα 12
  // έχει αναγκαστικά ≥3 σε κάποιο νησί (περιστερώνας/pigeonhole). Αυτή η
  // εγγύηση δεν ελέγχεται πουθενά αλλού στον κώδικα — αν ο κατάλογος αλλάξει
  // (περισσότερα νησιά, λιγότερα παιχνίδια ανά νησί), το χωνί μπορεί να
  // ανέβει ξανά σιωπηλά. Καλύτερα να σπάσει εδώ, σε ένα τεστ, παρά σε ένα
  // report προς τον χρηματοδότη.
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pf12of12-')), 'playfood.db'));
  const now = Date.now();
  const add = (o) => insertEvent(db, {
    ts: now, learner_id: 'allgames', session_id: 'sall', type: 'session_start',
    island: null, game: null, score: null, stars: null, duration_s: null,
    progress: null, language: 'el', returning: 0, ...o,
  });
  const byIsland = {
    growing: ['WhereDoesItGrow', 'GardenPlanner', 'SoilDoctor'],
    local: ['SeasonMatcher', 'MarketTrip', 'SpotTheFake'],
    foodwaste: ['FridgeManager', 'MealPlanner', 'LeftoverChef'],
    circular: ['CompostCreator', 'CircularCity', 'PlanetaryBoundaries'],
  };
  for (const [island, games] of Object.entries(byIsland)) {
    for (const game of games) {
      add({ type: 'game_finish', island, game, score: 80, stars: 2, duration_s: 100, passed: 1 });
    }
  }

  const { funnel } = computeStats(db, { from: null, to: null });
  const finishedIsland = funnel.find((s) => s.step === 'Finished an island').count;
  const reached1212 = funnel.find((s) => s.step === 'Reached 12/12').count;
  assert.equal(reached1212, 1, 'το παιδί τελείωσε και τα 12 παιχνίδια');
  assert.ok(reached1212 <= finishedIsland,
    `«Reached 12/12» (${reached1212}) δεν πρέπει να ξεπερνά το «Finished an island» ` +
    `(${finishedIsland}) — η υπόθεση 12 παιχνίδια/4 νησιά έσπασε`);
  closeDb(db);
});

test('άδεια βάση δεν ρίχνει και δεν διαιρεί με μηδέν', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfempty-')), 'playfood.db'));
  const s = computeStats(db, { from: null, to: null });
  assert.equal(s.overview.learners, 0);
  assert.equal(s.funnel[0].pct, null, 'no visitors: no rate, the panel shows —');
  closeDb(db);
});

test('το «τώρα» αγνοεί το φίλτρο ημερομηνίας — το overview όχι', () => {
  const db = seed();
  // ΤΟΠΙΚΗ ημερομηνία (en-CA → YYYY-MM-DD): το computeStats φιλτράρει με SQLite
  // 'localtime', οπότε ένα toISOString() θα ζητούσε τη ΧΘΕΣΙΝΗ μέρα κάθε βράδυ
  // 00:00-03:00 σε Αθήνα και το test θα έβρισκε 0 αποτελέσματα.
  const today = new Date().toLocaleDateString('en-CA');
  const all = computeStats(db, { from: null, to: null });
  const oneDay = computeStats(db, { from: today, to: today });

  assert.equal(all.now.activeThisWeek, oneDay.now.activeThisWeek,
    'το «ενεργοί αυτή τη βδομάδα» ΔΕΝ πρέπει να αλλάζει με το εύρος');
  assert.equal(all.now.activeThisWeek, 2, 'kid1 + kid2 έχουν πρόσφατα events');
  // Χωρίς αυτό, το test θα περνούσε ακόμα κι αν το φίλτρο δεν δούλευε καθόλου.
  assert.notEqual(all.overview.sessions, oneDay.overview.sessions,
    'το overview ΠΡΕΠΕΙ να αλλάζει με το εύρος — αλλιώς το test δεν αποδεικνύει τίποτα');
  assert.equal(all.overview.activeThisWeek, undefined,
    'δεν πρέπει να έχει μείνει αντίγραφο στο overview');
  closeDb(db);
});

test('ανά παιχνίδι: μέσο σκορ από τα finish, μέσος τερματισμός από τα abandon', () => {
  const db = seed();
  // ΚΡΙΣΙΜΟ για τη διακριτική ικανότητα του test: μια επιπλέον ΟΛΟΚΛΗΡΩΣΗ με
  // progress 100, στο ίδιο παιχνίδι που έχει και abandon. Στο seed τα game_finish
  // έχουν progress null, οπότε ακόμα κι αν ο υπολογισμός ΔΕΝ φίλτραρε σε
  // game_abandon, το avg() θα αγνοούσε τα null και το test θα περνούσε ψευδώς.
  // Με το 100 μέσα, ένας υπολογισμός χωρίς φίλτρο δίνει (100+40)/2 = 70 ≠ 40.
  insertEvent(db, {
    ts: Date.now(), learner_id: 'kid3', session_id: 's4', type: 'game_finish',
    island: 'growing', game: 'WhereDoesItGrow', score: 90, stars: 3,
    duration_s: 300, progress: 100, language: 'el', returning: 0,
  });

  const rows = gameRows(computeStats(db, { from: null, to: null }));

  const wdig = rows.find((g) => g.game === 'WhereDoesItGrow');
  assert.equal(wdig.avgScore, 90, 'δύο ολοκληρώσεις, και οι δύο με σκορ 90');
  assert.equal(wdig.avgQuitProgress, 40,
    'μόνο το abandon (40%) μετράει — το finish με progress 100 πρέπει να αγνοηθεί');

  const gp = rows.find((g) => g.game === 'GardenPlanner');
  assert.equal(gp.avgScore, 80);
  assert.equal(gp.avgQuitProgress, null, 'κανένα abandon → «δεν ξέρουμε», όχι 0');
  closeDb(db);
});

test('παιχνίδι που δεν έπαιξε κανείς δίνει null παντού, ποτέ 0', () => {
  const db = seed();
  const row = gameRow(computeStats(db, { from: null, to: null }), 'FridgeManager');
  assert.equal(row.started, 0);
  assert.equal(row.finished, 0);
  // Το 0 θα διαβαζόταν ως «κανένα παιδί δεν τα κατάφερε» — που είναι ισχυρισμός.
  // Η αλήθεια είναι «δεν έχουμε μέτρηση».
  assert.equal(row.pct, null);
  assert.equal(row.avgScore, null);
  assert.equal(row.avgStars, null);
  assert.equal(row.avgSeconds, null);
  assert.equal(row.avgQuitProgress, null);
  closeDb(db);
});

test('ολοκληρώσεις χωρίς καταγεγραμμένο game_start δίνουν pct null', () => {
  // Ο υπεύθυνος ανοίγει την καταγραφή ΕΝΩ τα παιδιά ήδη παίζουν: φτάνει
  // game_finish χωρίς αντίστοιχο game_start, άρα παρονομαστής 0.
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfnostart-')), 'playfood.db'));
  insertEvent(db, {
    ts: Date.now(), learner_id: 'midkid', session_id: 'sm', type: 'game_finish',
    island: 'growing', game: 'SoilDoctor', score: 70, stars: 2, duration_s: 100,
    progress: 100, language: 'el', returning: 0,
  });
  const row = gameRow(computeStats(db, { from: null, to: null }), 'SoilDoctor');
  assert.equal(row.finished, 1);
  assert.equal(row.started, 0);
  assert.equal(row.pct, null);
  closeDb(db);
});

test('audience: οι επισκέψεις χωρίζονται σε πρώτη φορά / ξαναήρθαν', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfaud-')), 'playfood.db'));
  const now = Date.now();
  const add = (o) => insertEvent(db, {
    ts: now, learner_id: 'a', session_id: 's', type: 'session_start',
    island: null, game: null, score: null, stars: null, duration_s: null,
    progress: null, language: 'el', returning: 0, ...o,
  });
  add({ learner_id: 'a', session_id: 's1', returning: 0 });
  add({ learner_id: 'a', session_id: 's2', returning: 1 });
  add({ learner_id: 'b', session_id: 's3', returning: 0 });
  // ΔΕΝ είναι session_start — δεν πρέπει να μετρήσει, αλλιώς κάθε επίσκεψη
  // θα μετριόταν δύο φορές (μία στην είσοδο και μία στην έξοδο).
  add({ learner_id: 'b', session_id: 's3', type: 'session_end', duration_s: 10 });

  const { audience } = computeStats(db, { from: null, to: null });
  assert.equal(audience.visits.first, 2);
  assert.equal(audience.visits.returning, 1);
  closeDb(db);
});

test('audience: και οι τέσσερις γλώσσες παρούσες, με 0 όπου δεν υπάρχουν', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pflang-')), 'playfood.db'));
  const now = Date.now();
  const add = (o) => insertEvent(db, {
    ts: now, learner_id: 'a', session_id: 's', type: 'session_start',
    island: null, game: null, score: null, stars: null, duration_s: null,
    progress: null, language: 'el', returning: 0, ...o,
  });
  add({ session_id: 's1', language: 'el' });
  add({ session_id: 's2', language: 'el' });
  add({ session_id: 's3', language: 'pt' });
  add({ session_id: 's4', language: null });   // αγνοείται — δεν υπάρχει «άγνωστη γλώσσα» να δείξουμε

  const { audience } = computeStats(db, { from: null, to: null });
  const byLang = Object.fromEntries(audience.languages.map((l) => [l.language, l.count]));
  assert.deepEqual(Object.keys(byLang).sort(), ['el', 'en', 'nl', 'pt']);
  assert.equal(byLang.el, 2);
  assert.equal(byLang.pt, 1);
  assert.equal(byLang.en, 0, 'παρούσα με 0, ώστε η λίστα να μη «χοροπηδά» μεταξύ φίλτρων');
  assert.equal(byLang.nl, 0);
  closeDb(db);
});

test('ανά νησί: κάθε νησί κρατά ακριβώς τα τρία του παιχνίδια, στη σειρά του χάρτη', () => {
  const db = seed();
  const { perIsland } = computeStats(db, { from: null, to: null });
  assert.deepEqual(perIsland.map((i) => i.island),
    ['growing', 'local', 'foodwaste', 'circular']);
  perIsland.forEach((i) => assert.equal(i.games.length, 3, `${i.island}: τρία παιχνίδια`));
  assert.deepEqual(perIsland[0].games.map((g) => g.game),
    ['WhereDoesItGrow', 'GardenPlanner', 'SoilDoctor']);
  assert.equal(gameRows(computeStats(db, { from: null, to: null })).length, 12,
    'και τα δώδεκα εξακολουθούν να εμφανίζονται, κανένα δεν χάθηκε στο σπάσιμο');
  closeDb(db);
});

test('ανά νησί: «ήρθαν εδώ» και «τελείωσαν και τα τρία», με μηδέν σε όσα δεν πάτησε κανείς', () => {
  const db = seed();
  const s = computeStats(db, { from: null, to: null });

  // growing = ο kid1 (έχει island_enter) ΚΑΙ ο kid2 — που ΔΕΝ έχει καθόλου
  // island_enter, μόνο game_start. Μετράει κι αυτός: παιδί που ξεκίνησε
  // παιχνίδι σε ένα νησί προφανώς βρέθηκε εκεί, ακόμα κι αν το island_enter
  // του δεν έφτασε ποτέ στον server.
  assert.equal(islandRow(s, 'growing').entered, 2);
  assert.equal(islandRow(s, 'local').entered, 1, 'μόνο ο kid1 πέρασε στο δεύτερο νησί');

  // Το νούμερο που έλειπε εντελώς από το panel: νησιά που δεν άγγιξε κανείς.
  // Μένουν 0 και ΟΧΙ «—», γιατί εδώ το μηδέν είναι μετρημένο γεγονός.
  assert.equal(islandRow(s, 'foodwaste').entered, 0);
  assert.equal(islandRow(s, 'circular').entered, 0);

  assert.equal(islandRow(s, 'growing').finishedAll3, 1, 'ο kid1 τελείωσε 3/3 στο growing');
  assert.equal(islandRow(s, 'local').finishedAll3, 1, 'και 3/3 στο local');
  assert.equal(islandRow(s, 'foodwaste').finishedAll3, 0);
  closeDb(db);
});

test('ανά νησί: «τελείωσαν και τα τρία» δεν ξεπερνά ποτέ το «ήρθαν εδώ»', () => {
  const db = seed();
  computeStats(db, { from: null, to: null }).perIsland.forEach((i) => {
    assert.ok(i.finishedAll3 <= i.entered,
      `${i.island}: ${i.finishedAll3} τελείωσαν 3/3 αλλά μόνο ${i.entered} ήρθαν`);
  });
  closeDb(db);
});

test('ανά νησί: ποσοστό ολοκλήρωσης, μέσα αστέρια και χρόνος — happy path', () => {
  const db = seed();
  const s = computeStats(db, { from: null, to: null });

  // growing: ήρθαν 2 (kid1 + kid2), τελείωσε 3/3 ο 1 → 50%.
  // Αστέρια: 3 + 2 + 2 = 7 σε 3 ολοκληρώσεις → 2,3. Χρόνος: 300+200+200 = 700s.
  const g = islandRow(s, 'growing');
  assert.equal(g.completionPct, 50);
  assert.equal(g.avgStars, 2.3);
  assert.equal(g.totalSeconds, 700);

  // local: ήρθε 1, τελείωσε 3/3 ο 1 → 100%. Αστέρια 2+2+2 → 2. Χρόνος 3×150.
  const l = islandRow(s, 'local');
  assert.equal(l.completionPct, 100);
  assert.equal(l.avgStars, 2);
  assert.equal(l.totalSeconds, 450);
  closeDb(db);
});

test('ΠΑΡΟΝΟΜΑΣΤΗΣ: το ποσοστό ολοκλήρωσης διαιρεί με τα παιδιά ΤΟΥ ΝΗΣΙΟΥ, όχι με όλα', () => {
  const db = seed();
  const s = computeStats(db, { from: null, to: null });

  // Το seed έχει 2 παιδιά συνολικά, αλλά στο 'local' πέρασε ΜΟΝΟ ο kid1 — και
  // το τελείωσε. Σωστή απάντηση: 100%. Το 50% θα σήμαινε ότι ο παρονομαστής
  // πήρε όλα τα παιδιά της περιόδου (2) αντί για όσα ήρθαν στο νησί (1) —
  // δηλαδή ότι το νούμερο χρεώνει στο δεύτερο νησί τα παιδιά που δεν πρόλαβαν
  // καν να φτάσουν ως εκεί.
  const l = islandRow(s, 'local');
  assert.equal(l.entered, 1);
  assert.equal(l.finishedAll3, 1);
  assert.equal(l.completionPct, 100,
    'με παρονομαστή «όλα τα παιδιά» αντί «όσα ήρθαν εδώ» θα έβγαινε 50');

  // Και ο έλεγχος από την άλλη πλευρά: το growing ΔΕΝ είναι επίσης 100 — αν
  // ήταν, το test πιο πάνω θα περνούσε και με σπασμένο υπολογισμό.
  assert.equal(islandRow(s, 'growing').completionPct, 50);

  // Το ποσοστό δεν μπορεί ποτέ να ξεπεράσει το 100: numerator ⊆ denominator.
  s.perIsland.forEach((i) => {
    if (i.completionPct !== null) {
      assert.ok(i.completionPct <= 100, `${i.island}: ${i.completionPct}% > 100`);
    }
  });
  closeDb(db);
});

test('ΠΑΡΟΝΟΜΑΣΤΗΣ: αστέρια και χρόνος μετρώνται ΑΝΑ ΝΗΣΙ, όχι πάνω σε όλες τις ολοκληρώσεις', () => {
  const db = seed();
  const s = computeStats(db, { from: null, to: null });

  // Οι έξι ολοκληρώσεις του seed μαζί δίνουν (3+2+2+2+2+2)/6 = 2,2 αστέρια και
  // 1150s. Κανένα από τα δύο νησιά δεν έχει αυτές τις τιμές — άρα ένας
  // υπολογισμός που ξέχασε το GROUP BY island σπάει και στα δύο.
  assert.notEqual(islandRow(s, 'growing').avgStars, 2.2);
  assert.notEqual(islandRow(s, 'local').avgStars, 2.2);
  assert.equal(islandRow(s, 'growing').totalSeconds, 700);
  assert.equal(islandRow(s, 'local').totalSeconds, 450);
  assert.notEqual(islandRow(s, 'growing').totalSeconds, 1150);
  closeDb(db);
});

test('ΠΑΡΟΝΟΜΑΣΤΗΣ: ολοκλήρωση χωρίς αστέρια δεν μετράει ως «μηδέν αστέρια»', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfnostars-')), 'playfood.db'));
  const now = Date.now();
  const add = (o) => insertEvent(db, {
    ts: now, learner_id: 'k', session_id: 's', type: 'game_finish',
    island: 'growing', game: 'WhereDoesItGrow', score: 80, stars: null,
    duration_s: null, progress: null, language: 'el', returning: 0, ...o,
  });
  add({ game: 'WhereDoesItGrow', stars: 3, duration_s: 100 });
  add({ game: 'GardenPlanner', stars: 3, duration_s: 100 });
  // Έφτασε χωρίς αστέρια (χαμένο πεδίο / παλιότερος client). ΔΕΝ είναι μηδέν.
  add({ game: 'SoilDoctor', stars: null, duration_s: 100 });

  const i = islandRow(computeStats(db, { from: null, to: null }), 'growing');
  assert.equal(i.avgStars, 3,
    'ο παρονομαστής πρέπει να είναι οι ολοκληρώσεις ΜΕ αστέρια (2), όχι όλες (3) — ' +
    'αλλιώς βγαίνει 2,0 και ο μέσος όρος πέφτει σιωπηλά');
  // Η διάρκεια όμως μετριέται και στις τρεις: εκεί το πεδίο υπάρχει.
  assert.equal(i.totalSeconds, 300);
  closeDb(db);
});

test('ανά νησί: μόνο τα game_finish μετράνε — τα abandon δεν φουσκώνουν αστέρια/χρόνο', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfabandon-')), 'playfood.db'));
  const now = Date.now();
  const add = (o) => insertEvent(db, {
    ts: now, learner_id: 'k', session_id: 's', type: 'game_finish',
    island: 'circular', game: 'CompostCreator', score: null, stars: null,
    duration_s: null, progress: null, language: 'el', returning: 0, ...o,
  });
  add({ type: 'game_finish', stars: 2, duration_s: 100 });
  // Το παιδί που παράτησε: κράτησε 900s στο παιχνίδι, χωρίς να το τελειώσει.
  // Χωρίς φίλτρο τύπου θα έβγαινε 1000s και 2,5 αστέρια.
  add({ type: 'game_abandon', learner_id: 'k2', stars: 3, duration_s: 900, progress: 60 });

  const i = islandRow(computeStats(db, { from: null, to: null }), 'circular');
  assert.equal(i.avgStars, 2, 'το abandon δεν είναι ολοκλήρωση');
  assert.equal(i.totalSeconds, 100, 'ο χρόνος μετράει μόνο ολοκληρωμένα παιχνίδια');
  closeDb(db);
});

test('ανά νησί: νησί που δεν πάτησε κανείς → 0 στα μετρημένα, null στα παράγωγα', () => {
  const db = seed();
  const i = islandRow(computeStats(db, { from: null, to: null }), 'foodwaste');
  // Μετρημένα γεγονότα: μένουν 0, δεν γίνονται «—».
  assert.equal(i.entered, 0);
  assert.equal(i.finishedAll3, 0);
  // Παράγωγα μεγέθη: κανένας πληθυσμός → «δεν έχουμε μέτρηση», ποτέ 0.
  assert.equal(i.completionPct, null, 'ποσοστό χωρίς παρονομαστή δεν είναι 0%');
  assert.equal(i.avgStars, null, 'καμία ολοκλήρωση δεν είναι «μηδέν αστέρια»');
  assert.equal(i.totalSeconds, null, 'καμία μέτρηση χρόνου δεν είναι «0 λεπτά εδώ»');
  closeDb(db);
});

test('ανά νησί: ήρθαν παιδιά αλλά δεν τελείωσε κανένα → 0%, ΟΧΙ «—»', () => {
  // Η άλλη πλευρά του κανόνα, και το πιο χρήσιμο σήμα για τον δάσκαλο: όταν ο
  // παρονομαστής ΥΠΑΡΧΕΙ, το μηδέν είναι μετρημένο αποτέλεσμα («το νησί
  // ξεκινά αλλά δεν κλείνει») και πρέπει να φαίνεται ως 0%. Ένα «—» εδώ θα
  // έκρυβε ακριβώς την περίπτωση για την οποία μπήκε το νούμερο.
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfzero-')), 'playfood.db'));
  const now = Date.now();
  const add = (o) => insertEvent(db, {
    ts: now, learner_id: 'k1', session_id: 's1', type: 'island_enter',
    island: 'circular', game: null, score: null, stars: null, duration_s: null,
    progress: null, language: 'el', returning: 0, ...o,
  });
  add({ learner_id: 'k1' });
  add({ learner_id: 'k2' });
  add({ learner_id: 'k2', type: 'game_start', game: 'CompostCreator' });

  const i = islandRow(computeStats(db, { from: null, to: null }), 'circular');
  assert.equal(i.entered, 2);
  assert.equal(i.finishedAll3, 0);
  assert.equal(i.completionPct, 0, 'δύο παιδιά ήρθαν και κανένα δεν τελείωσε: μετρημένο 0%');
  // Ο χρόνος και τα αστέρια όμως παραμένουν null: καμία ολοκλήρωση δεν έγινε,
  // άρα δεν έχουμε ούτε αστέρια ούτε δευτερόλεπτα να δείξουμε.
  assert.equal(i.avgStars, null);
  assert.equal(i.totalSeconds, null);
  closeDb(db);
});

test('ανά νησί: ολοκληρώσεις χωρίς καταγεγραμμένη διάρκεια → χρόνος null, όχι 0', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfnodur-')), 'playfood.db'));
  insertEvent(db, {
    ts: Date.now(), learner_id: 'k', session_id: 's', type: 'game_finish',
    island: 'local', game: 'SeasonMatcher', score: 70, stars: 2,
    duration_s: null, progress: 100, language: 'el', returning: 0,
  });
  const i = islandRow(computeStats(db, { from: null, to: null }), 'local');
  assert.equal(i.avgStars, 2, 'τα αστέρια υπάρχουν και μετριούνται κανονικά');
  assert.equal(i.totalSeconds, null,
    'το sum() πάνω σε μόνο-null δίνει null: «δεν μετρήθηκε χρόνος», όχι «0 δευτερόλεπτα»');
  closeDb(db);
});

test('ανά νησί: άδεια περίοδος → μετρητές 0, παράγωγα null σε ΟΛΑ τα νησιά', () => {
  // Ό,τι βλέπει ο δάσκαλος πατώντας «Today» σε μέρα χωρίς μάθημα.
  const db = seed();
  const s = computeStats(db, { from: '2001-01-01', to: '2001-01-02' });
  assert.equal(s.perIsland.length, 4);
  s.perIsland.forEach((i) => {
    assert.equal(i.entered, 0, `${i.island}: μετρημένο μηδέν`);
    assert.equal(i.finishedAll3, 0);
    assert.equal(i.completionPct, null, `${i.island}: ποσοστό χωρίς δεδομένα`);
    assert.equal(i.avgStars, null);
    assert.equal(i.totalSeconds, null);
  });
  closeDb(db);
});

test('η μέση διάρκεια επίσκεψης διαιρεί με όσες ΑΝΕΦΕΡΑΝ τέλος, όχι με όλες', () => {
  const db = seed();
  const { overview } = computeStats(db, { from: null, to: null });
  // Το seed έχει ΤΡΕΙΣ επισκέψεις αλλά μόνο ΜΙΑ session_end, των 600s. Σωστή
  // απάντηση: 600. Το 200 θα σήμαινε ότι ο παρονομαστής μέτρησε και τις δύο
  // επισκέψεις που έκλεισαν χωρίς να προλάβουν να αναφέρουν διάρκεια — δηλαδή
  // ότι τις χρέωσε ως μηδενικές.
  assert.equal(overview.sessions, 3);
  assert.equal(overview.visitsMeasured, 1);
  assert.equal(overview.avgVisitSeconds, 600);
  closeDb(db);
});

test('μέσος όρος πάνω σε δύο μετρημένες επισκέψεις· χωρίς καμία → null, ποτέ 0', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfvisit-')), 'playfood.db'));
  const now = Date.now();
  const add = (o) => insertEvent(db, {
    ts: now, learner_id: 'k', session_id: 's', type: 'session_start',
    island: null, game: null, score: null, stars: null, duration_s: null,
    progress: null, language: 'el', returning: 0, ...o,
  });

  add({ session_id: 'sa', type: 'session_start' });
  add({ session_id: 'sb', type: 'session_start' });
  let o = computeStats(db, { from: null, to: null }).overview;
  assert.equal(o.visitsMeasured, 0);
  assert.equal(o.avgVisitSeconds, null, 'καμία μέτρηση δεν είναι «επίσκεψη 0 δευτερολέπτων»');

  add({ session_id: 'sa', type: 'session_end', duration_s: 400 });
  add({ session_id: 'sb', type: 'session_end', duration_s: 600 });
  o = computeStats(db, { from: null, to: null }).overview;
  assert.equal(o.visitsMeasured, 2);
  assert.equal(o.avgVisitSeconds, 500);
  assert.equal(o.hours, 0.3, 'οι συνολικές ώρες μένουν άθροισμα, όχι μέσος όρος');
  closeDb(db);
});

test('missions completed count once per profile and game; abandons are counted separately', () => {
  const db = openDb(':memory:');
  const base = { ts: Date.now(), session_id: 's1', island: 'growing', language: 'el',
    score: null, stars: null, duration_s: null, progress: null, returning: null };
  const finish = (learner_id, game, passed, attempt_id) => insertEvent(db, { ...base, learner_id, game, type: 'game_finish', passed, attempt_id });
  finish('kid1', 'SoilDoctor', 1, 'a1');
  finish('kid1', 'SoilDoctor', 1, 'a2');          // a passed replay: still one mission
  finish('kid1', 'GardenPlanner', 0, 'a3');       // not passed: not a mission
  finish('kid2', 'SoilDoctor', 1, 'a4');
  insertEvent(db, { ...base, learner_id: 'kid2', game: 'GardenPlanner', type: 'game_abandon', attempt_id: 'a5' });
  const { overview } = computeStats(db);
  assert.equal(overview.missionsCompleted, 2);
  assert.equal(overview.gamesFinished, 4);
  assert.equal(overview.abandoned, 1);
  closeDb(db);
});

test('Play Code redemptions are listed per activity with distinct profiles', () => {
  const db = openDb(':memory:');
  const base = { ts: Date.now(), session_id: 's1', island: null, language: 'el', type: 'phygital_redeem',
    score: null, stars: null, duration_s: null, progress: null, returning: null };
  insertEvent(db, { ...base, learner_id: 'kid1', game: 'LOCAL01' });
  insertEvent(db, { ...base, learner_id: 'kid2', game: 'LOCAL01' });
  insertEvent(db, { ...base, learner_id: 'kid2', game: 'GROW01' });
  assert.deepEqual(computeStats(db).phygital, [
    { activity: 'GROW01', redemptions: 1, profiles: 1 },
    { activity: 'LOCAL01', redemptions: 2, profiles: 2 },
  ]);
  assert.deepEqual(computeStats(db, { language: 'pt' }).phygital, []);
  closeDb(db);
});


test('historical game finishes remain visible and filtered without becoming current completion claims', () => {
  const db = openDb(':memory:');
  const add = (overrides) => insertEvent(db, {
    ts: Date.parse('2026-01-15T12:00:00Z'), learner_id: 'historic', session_id: 'visit',
    type: 'game_finish', island: 'growing', game: 'FoodMiles', score: null, stars: null,
    duration_s: null, progress: null, language: 'el', returning: null, passed: 1, ...overrides,
  });
  try {
    add({});
    add({ stars: 0, duration_s: 0 });
    add({ stars: 2, score: 40, duration_s: 20 });
    add({ game: 'EcoChallenge' });
    add({ game: 'GardenPlanner', stars: 3, score: 80, duration_s: 40 });
    add({ game: 'LegacyStartOnly', type: 'game_start', passed: null });
    add({ game: 'LegacyDutch', language: 'nl' });
    add({ game: 'LegacyTomorrow', ts: Date.parse('2026-01-16T12:00:00Z') });
    const rowCountBefore = db.prepare('SELECT count(*) n FROM events').get().n;
    const stats = computeStats(db, { from: '2026-01-15', to: '2026-01-15', language: 'el' });
    assert.equal(stats.overview.gamesFinished, 5);
    assert.equal(stats.overview.missionsCompleted, 3, 'historical passed missions stay in the existing total');
    assert.deepEqual(stats.overview.outcomes, { passed: 5, failed: 0, unknown: 0 });
    const currentGames = Object.values(ISLAND_GAMES).flat();
    assert.deepEqual(stats.stars.map(row => row.game), [...currentGames, 'EcoChallenge', 'FoodMiles']);
    assert.deepEqual(stats.stars.find(row => row.game === 'FoodMiles'), {
      game: 'FoodMiles', s0: 1, s1: 0, s2: 1, s3: 0, unknown: 1,
    });
    assert.deepEqual(stats.stars.find(row => row.game === 'EcoChallenge'), {
      game: 'EcoChallenge', s0: 0, s1: 0, s2: 0, s3: 0, unknown: 1,
    });
    assert.equal(stats.stars.reduce((n, row) => n + row.s0 + row.s1 + row.s2 + row.s3 + row.unknown, 0), 5);
    assert.equal(stats.perIsland[0].avgStars, 1.7);
    assert.equal(stats.perIsland[0].starsMeasured, 3);
    assert.equal(stats.perIsland[0].totalSeconds, 60);
    assert.equal(stats.perIsland[0].timedFinishes, 3);
    assert.equal(stats.overview.finished12, 0);
    assert.equal(stats.perIsland[0].finishedAll3, 0, 'two historical IDs cannot fill the current island');
    assert.deepEqual(computeStats(db, { language: 'nl' }).stars.slice(12).map(row => row.game), ['LegacyDutch']);
    assert.deepEqual(computeStats(db, { from: '2026-01-16' }).stars.slice(12).map(row => row.game), ['LegacyTomorrow']);
    assert.equal(computeStats(db, { from: '2040-01-01' }).stars.length, 12);
    assert.equal(db.prepare('SELECT count(*) n FROM events').get().n, rowCountBefore);
  } finally { closeDb(db); }
});

test('legacy IDs and misplaced current IDs cannot substitute for current island or twelve-game passes', () => {
  const db = openDb(':memory:');
  const add = (learner_id, island, game, overrides = {}) => insertEvent(db, {
    ts: Date.parse('2026-01-15T12:00:00Z'), learner_id, session_id: 'visit', type: 'game_finish',
    island, game, passed: 1, score: null, stars: null, duration_s: null, progress: null,
    language: 'el', returning: null, ...overrides,
  });
  try {
    const pairs = Object.entries(ISLAND_GAMES).flatMap(([island, games]) => games.map(game => [island, game]));
    for (const [island, game] of pairs.slice(0, 11)) add('mixed', island, game);
    add('mixed', 'circular', 'FoodMiles');
    for (let i = 0; i < 12; i++) add('old-only', 'growing', `Legacy${i}`);
    const islands = Object.keys(ISLAND_GAMES);
    for (const [island, game] of pairs) add('misplaced', islands[(islands.indexOf(island) + 1) % 4], game);
    for (let i = 0; i < 12; i++) add('repeated', 'growing', 'WhereDoesItGrow');
    add('part-island', 'growing', 'WhereDoesItGrow');
    add('part-island', 'growing', 'GardenPlanner');
    add('part-island', 'growing', 'FoodMiles');
    for (const [island, game] of pairs) add('current', island, game, { language: 'en' });
    // A repeat of a current pass is a round, never another completed game.
    add('current', 'growing', 'WhereDoesItGrow', { language: 'en' });
    const stats = computeStats(db);
    assert.equal(stats.overview.gamesFinished, 64);
    assert.equal(stats.overview.finished12, 1);
    assert.equal(stats.funnel[4].count, 2, 'only the mixed and genuine current profiles finished an island');
    assert.deepEqual(stats.perIsland.map(row => row.finishedAll3), [2, 2, 2, 1]);
    const selected = computeStats(db, { language: 'el' });
    assert.equal(selected.overview.finished12, 0);
    assert.deepEqual(selected.perIsland.map(row => row.finishedAll3), [1, 1, 1, 0]);
    assert.equal(selected.funnel[4].count, 1);
    assert.equal(computeStats(db, { language: 'en' }).overview.finished12, 1);
  } finally { closeDb(db); }
});
