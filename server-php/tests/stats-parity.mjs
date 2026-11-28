// Development-only parity check; deployment needs PHP and PDO SQLite only.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { openDb, insertEvent } from '../../server/src/db.js';
import { computeStats } from '../../server/src/stats.js';
import { ISLAND_GAMES, TIMING_FIELDS } from '../../server/src/validate.js';

const dir = mkdtempSync(join(tmpdir(), 'playfood-stats-'));
const file = join(dir, 'events.sqlite');
const db = openDb(file);
const runner = fileURLToPath(new URL('./stats-runner.php', import.meta.url));
let checked = 0;
function phpStats(databaseFile, filters, timezone) {
  // Deliberately give the PHP process a different OS timezone.
  return JSON.parse(execFileSync('php', [runner, databaseFile, timezone, JSON.stringify(filters)], {
    env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8',
  }));
}
function compare(filters, timezone) {
  process.env.TZ = timezone;
  const expected = computeStats(db, filters);
  const actual = phpStats(file, filters, timezone);
  assert.deepEqual(actual, expected, `${timezone} ${JSON.stringify(filters)}`);
  checked++;
}
function checkGameParticipation() {
  const participationFile = join(dir, 'participation.sqlite');
  const participationDb = openDb(participationFile);
  const check = (filters, timezone, profiles, languageCounts) => {
    process.env.TZ = timezone;
    const actual = phpStats(participationFile, filters, timezone);
    const context = `${timezone} ${JSON.stringify(filters)}`;
    // Literal fixture expectations catch the same counting bug in both backends.
    assert.equal(actual.overview.gameProfiles, profiles, `PHP gameProfiles: ${context}`);
    assert.deepEqual(actual.audience.gameLanguages, [
      { language: 'en', count: languageCounts[0] },
      { language: 'nl', count: languageCounts[1] },
      { language: 'el', count: languageCounts[2] },
      { language: 'pt', count: languageCounts[3] },
    ], `PHP gameLanguages: ${context}`);
    assert.deepEqual(actual, computeStats(participationDb, filters), context);
    checked++;
    return actual;
  };
  try {
    check({}, 'Europe/Athens', 0, [0, 0, 0, 0]);
    const firstDay = Date.parse('2026-01-15T12:00:00Z');
    const secondDay = Date.parse('2026-01-16T12:00:00Z');
    const add = (overrides) => insertEvent(participationDb, {
      ts: firstDay, learner_id: 'repeat', session_id: 'visit1', type: 'game_start',
      island: 'growing', game: 'WhereDoesItGrow', score: null, stars: null,
      duration_s: null, progress: null, language: 'en', returning: null, ...overrides,
    });
    add({ type: 'session_start', returning: 1 });
    add({});
    add({ type: 'game_finish' });
    add({ session_id: 'visit2', type: 'game_abandon' });
    add({ session_id: 'visit3', ts: secondDay, language: 'el' });
    add({ learner_id: 'finish-only', type: 'game_finish', language: 'el' });
    add({ learner_id: 'abandon-only', type: 'game_abandon', language: 'nl' });
    add({ learner_id: 'start-only', ts: secondDay, language: 'pt' });
    add({ learner_id: 'boundary', type: 'game_finish', language: 'nl',
      ts: Date.parse('2026-01-15T22:30:00Z') });
    add({ learner_id: 'unknown-language', type: 'game_finish', language: null });
    add({ learner_id: 'landing-only', type: 'session_start', returning: 0 });
    add({ learner_id: 'hero-only', type: 'hero_chosen', language: 'el' });
    add({ learner_id: 'island-only', type: 'island_enter', language: 'nl' });
    add({ learner_id: 'redeem-only', type: 'phygital_redeem', ts: secondDay, language: 'pt' });
    add({ learner_id: 'ended-only', type: 'session_end', language: 'el', duration_s: 600 });

    for (const timezone of ['Europe/Athens', 'America/New_York', 'UTC']) {
      const actual = check({}, timezone, 6, [1, 2, 2, 1]);
      assert.equal(actual.overview.learners, 11);
      assert.equal(actual.overview.sessions, 13);
      assert.equal(actual.overview.hours, 0.2);
      assert.deepEqual(actual.audience.visits, { first: 1, returning: 1, unknown: 11 });
      assert.deepEqual(actual.audience.languages, [
        { language: 'en', count: 3 }, { language: 'nl', count: 3 },
        { language: 'el', count: 4 }, { language: 'pt', count: 2 },
      ]);
      check({ language: 'en' }, timezone, 1, [1, 0, 0, 0]);
      check({ language: 'nl' }, timezone, 2, [0, 2, 0, 0]);
      check({ language: 'el' }, timezone, 2, [0, 0, 2, 0]);
      check({ language: 'pt' }, timezone, 1, [0, 0, 0, 1]);
      check({ from: '2026-01-15', to: '2026-01-15', language: 'el' }, timezone, 1, [0, 0, 1, 0]);
      check({ from: '2040-01-01' }, timezone, 0, [0, 0, 0, 0]);
      check({ to: '2026-01-14' }, timezone, 0, [0, 0, 0, 0]);
      if (timezone === 'Europe/Athens') {
        check({ to: '2026-01-15' }, timezone, 4, [1, 1, 1, 0]);
        check({ from: '2026-01-16' }, timezone, 3, [0, 1, 1, 1]);
        check({ from: '2026-01-15', to: '2026-01-15', language: 'nl' }, timezone, 1, [0, 1, 0, 0]);
      } else {
        check({ to: '2026-01-15' }, timezone, 5, [1, 2, 1, 0]);
        check({ from: '2026-01-16' }, timezone, 2, [0, 0, 1, 1]);
        check({ from: '2026-01-15', to: '2026-01-15', language: 'nl' }, timezone, 2, [0, 2, 0, 0]);
      }
    }
  } finally {
    participationDb.close();
  }
}
function checkHistoricalGames() {
  const historicalFile = join(dir, 'historical.sqlite');
  const historicalDb = openDb(historicalFile);
  const check = (filters, timezone, verify) => {
    process.env.TZ = timezone;
    const actual = phpStats(historicalFile, filters, timezone);
    verify(actual); // Literal fixture counts catch a shared backend mistake.
    assert.deepEqual(actual, computeStats(historicalDb, filters), `historical ${timezone} ${JSON.stringify(filters)}`);
    checked++;
  };
  const firstDay = Date.parse('2026-01-15T12:00:00Z');
  const secondDay = Date.parse('2026-01-16T12:00:00Z');
  const add = (overrides) => insertEvent(historicalDb, {
    ts: firstDay, learner_id: 'historic', session_id: 'visit', type: 'game_finish',
    island: 'growing', game: 'FoodMiles', score: null, stars: null,
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
    add({ game: 'LegacyTomorrow', ts: secondDay });
    const currentGames = Object.values(ISLAND_GAMES).flat();
    for (const timezone of ['Europe/Athens', 'America/New_York', 'UTC']) {
      check({ from: '2026-01-15', to: '2026-01-15', language: 'el' }, timezone, actual => {
        assert.equal(actual.overview.gamesFinished, 5);
        assert.equal(actual.overview.missionsCompleted, 3);
        assert.deepEqual(actual.stars.map(row => row.game), [...currentGames, 'EcoChallenge', 'FoodMiles']);
        assert.deepEqual(actual.stars.find(row => row.game === 'FoodMiles'), {
          game: 'FoodMiles', s0: 1, s1: 0, s2: 1, s3: 0, unknown: 1,
        });
        assert.equal(actual.stars.find(row => row.game === 'EcoChallenge').unknown, 1);
        assert.equal(actual.perIsland[0].avgStars, 1.7);
        assert.equal(actual.perIsland[0].starsMeasured, 3);
        assert.equal(actual.perIsland[0].totalSeconds, 60);
        assert.equal(actual.perIsland[0].timedFinishes, 3);
        assert.equal(actual.perIsland[0].finishedAll3, 0);
        assert.equal(actual.overview.finished12, 0);
      });
      check({}, timezone, actual => {
        assert.equal(actual.overview.gamesFinished, 7);
        assert.equal(actual.overview.missionsCompleted, 5);
        assert.deepEqual(actual.stars.slice(12).map(row => row.game), ['EcoChallenge', 'FoodMiles', 'LegacyDutch', 'LegacyTomorrow']);
        assert.equal(actual.stars.reduce((n, row) => n + row.s0 + row.s1 + row.s2 + row.s3 + row.unknown, 0), 7);
      });
      check({ language: 'nl' }, timezone, actual => {
        assert.equal(actual.overview.gamesFinished, 1);
        assert.deepEqual(actual.stars.slice(12).map(row => row.game), ['LegacyDutch']);
      });
      check({ from: '2026-01-16' }, timezone, actual => {
        assert.equal(actual.overview.gamesFinished, 1);
        assert.deepEqual(actual.stars.slice(12).map(row => row.game), ['LegacyTomorrow']);
      });
      check({ from: '2040-01-01' }, timezone, actual => {
        assert.equal(actual.overview.gamesFinished, 0);
        assert.deepEqual(actual.stars.map(row => row.game), currentGames);
      });
    }
    assert.equal(historicalDb.prepare('SELECT count(*) n FROM events').get().n, 8);
    historicalDb.exec('DELETE FROM events');
    const pairs = Object.entries(ISLAND_GAMES).flatMap(([island, games]) => games.map(game => [island, game]));
    for (const [island, game] of pairs.slice(0, 11)) add({ learner_id: 'mixed', island, game });
    add({ learner_id: 'mixed', island: 'circular', game: 'FoodMiles' });
    for (let i = 0; i < 12; i++) add({ learner_id: 'old-only', game: `Legacy${i}` });
    const islands = Object.keys(ISLAND_GAMES);
    for (const [island, game] of pairs) add({ learner_id: 'misplaced', island: islands[(islands.indexOf(island) + 1) % 4], game });
    for (let i = 0; i < 12; i++) add({ learner_id: 'repeated', game: 'WhereDoesItGrow' });
    for (const game of ['WhereDoesItGrow', 'GardenPlanner', 'FoodMiles']) add({ learner_id: 'part-island', game });
    for (const [island, game] of pairs) add({ learner_id: 'current', island, game, language: 'en' });
    add({ learner_id: 'current', game: 'WhereDoesItGrow', language: 'en' });
    for (const timezone of ['Europe/Athens', 'America/New_York', 'UTC']) {
      check({}, timezone, actual => {
        assert.equal(actual.overview.gamesFinished, 64);
        assert.equal(actual.overview.finished12, 1);
        assert.deepEqual(actual.perIsland.map(row => row.finishedAll3), [2, 2, 2, 1]);
        assert.equal(actual.funnel[4].count, 2);
      });
      check({ language: 'el' }, timezone, actual => {
        assert.equal(actual.overview.finished12, 0);
        assert.deepEqual(actual.perIsland.map(row => row.finishedAll3), [1, 1, 1, 0]);
        assert.equal(actual.funnel[4].count, 1);
      });
      check({ language: 'en' }, timezone, actual => {
        assert.equal(actual.overview.finished12, 1);
        assert.deepEqual(actual.perIsland.map(row => row.finishedAll3), [1, 1, 1, 1]);
        assert.equal(actual.overview.gamesFinished, 13);
      });
    }
    assert.equal(historicalDb.prepare('SELECT count(*) n FROM events').get().n, 64);
  } finally { historicalDb.close(); }
}
try {
  checkHistoricalGames();
  checkGameParticipation();
  compare({}, 'Europe/Athens');
  const base = Date.parse('2026-01-01T22:30:00Z');
  const add = (overrides) => insertEvent(db, {
    ts: base, learner_id: 'learner1', session_id: 'session1', type: 'game_finish',
    island: 'growing', game: 'WhereDoesItGrow', score: null, stars: null,
    duration_s: null, progress: null, language: 'el', returning: null, ...overrides,
  });
  add({ type: 'session_start', ts: base - 86400000, language: 'en', returning: 1 });
  add({ type: 'session_end', duration_s: 500 });
  add({ type: 'session_end', ts: base + 86400000, duration_s: 900 });
  let attempt = 0;
  for (const [island, games] of Object.entries(ISLAND_GAMES)) {
    for (const game of games) {
      const attempt_id = `attempt${++attempt}`;
      add({ type: 'game_start', island, game, attempt_id });
      add({ island, game, attempt_id, passed: 1, stars: attempt % 4, score: -3,
        duration_s: 25, timing_version: 1,
        ...Object.fromEntries(TIMING_FIELDS.map(key => [key, 3])),
      });
    }
  }
  add({ score: -2, passed: 0, stars: 0, duration_s: 0 });
  add({ learner_id: 'learner2', session_id: 'session2' });
  add({ type: 'game_abandon', progress: 47, learner_id: 'learner3' });
  add({ type: 'session_start', learner_id: 'learner4', returning: 0, language: 'pt' });
  add({ type: 'game_start', learner_id: 'learner5', attempt_id: 'unmatched' });
  add({ learner_id: 'learner5', attempt_id: 'unmatched', ts: base + 86400000 });
  add({ learner_id: 'learner6', ts: Date.now(), language: 'nl' });
  for (const timezone of ['Europe/Athens', 'America/New_York', 'UTC']) {
    for (const filters of [{}, { from: '2026-01-02', to: '2026-01-02' },
      { language: 'el' }, { from: '2026-01-02', to: '2026-01-02', language: 'el' },
      { from: '2040-01-01' }, { to: '2026-01-01' }]) compare(filters, timezone);
  }
  console.log(`PHP/Node stats parity passed: ${checked} cases`);
} finally {
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
