import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { openDb, insertEvent, purgeOlderThan, countToday, closeDb } from '../src/db.js';

const DAY = 86400000;

test('timing split persists across reopen and does not invent legacy measurements', () => {
  const file = tmpFile();
  let db = openDb(file);
  insertEvent(db, ev());
  insertEvent(db, ev({ type: 'game_abandon', timing_version: 1, active_s: 300, learning_s: 10,
    paused_s: 0, hidden_s: 1, idle_s: 20, other_s: 0 }));
  closeDb(db); db = openDb(file);
  assert.equal(db.prepare("SELECT active_s FROM events WHERE type='session_start'").get().active_s, null);
  assert.equal(db.prepare("SELECT idle_s FROM events WHERE type='game_abandon'").get().idle_s, 20);
  closeDb(db);
});

test('an existing pre-attempt database migrates without altering its event and can reopen', () => {
  const file = tmpFile();
  const legacy = new Database(file);
  legacy.exec(`CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL,
    learner_id TEXT NOT NULL, session_id TEXT NOT NULL, type TEXT NOT NULL,
    island TEXT, game TEXT, score INTEGER, stars INTEGER, duration_s INTEGER,
    progress INTEGER, language TEXT, "returning" INTEGER
  ); INSERT INTO events (ts,learner_id,session_id,type) VALUES (123,'olduser','oldvisit','session_start')`);
  const original = legacy.prepare('SELECT * FROM events').get();
  legacy.close();
  let db = openDb(file);
  const migrated = db.prepare('SELECT * FROM events').get();
  assert.deepEqual(Object.fromEntries(Object.keys(original).map(key => [key, migrated[key]])), original);
  for (const key of ['attempt_id', 'passed', 'timing_version', 'active_s', 'learning_s', 'paused_s', 'hidden_s', 'idle_s', 'other_s']) {
    assert.equal(migrated[key], null);
  }
  closeDb(db);
  db = openDb(file);
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 1);
  closeDb(db);
});

test('attempt events are idempotent, while retries and legacy events remain separate', () => {
  const db = openDb(tmpFile());
  const start = ev({ type: 'game_start', island: 'growing', game: 'SoilDoctor', attempt_id: 'attempt0001' });
  insertEvent(db, start);
  insertEvent(db, start);
  insertEvent(db, { ...start, type: 'game_finish' });
  insertEvent(db, { ...start, type: 'game_finish' });
  insertEvent(db, { ...start, type: 'game_abandon' });
  insertEvent(db, { ...start, attempt_id: 'attempt0002' });
  insertEvent(db, ev());
  insertEvent(db, ev());
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 5);
  assert.equal(db.prepare("SELECT attempt_id FROM events WHERE type='game_finish'").get().attempt_id, 'attempt0001');
  closeDb(db);
});
const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'pfdb-')), 'playfood.db');

function ev(over = {}) {
  return {
    ts: Date.now(), learner_id: 'aaaa1111', session_id: 'ssss2222',
    type: 'session_start', island: null, game: null, score: null,
    stars: null, duration_s: null, progress: null, language: 'el',
    returning: 0, ...over,
  };
}

test('φτιάχνει το αρχείο και το schema μόνο του στην πρώτη εκκίνηση', () => {
  const file = tmpFile();
  assert.equal(existsSync(file), false);
  const db = openDb(file);
  assert.equal(existsSync(file), true);
  const cols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
  for (const c of ['ts', 'learner_id', 'session_id', 'type', 'island', 'game',
                   'score', 'stars', 'duration_s', 'progress', 'language', 'returning']) {
    assert.ok(cols.includes(c), `λείπει η στήλη ${c}`);
  }
  closeDb(db);
});

test('το openDb σε υπάρχον αρχείο δεν χάνει δεδομένα', () => {
  const file = tmpFile();
  const a = openDb(file); insertEvent(a, ev()); closeDb(a);
  const b = openDb(file);
  assert.equal(b.prepare('SELECT count(*) c FROM events').get().c, 1);
  closeDb(b);
});

test('η εισαγωγή κρατή όλα τα πεδία', () => {
  const db = openDb(tmpFile());
  insertEvent(db, ev({
    type: 'game_finish', island: 'growing', game: 'WhereDoesItGrow',
    score: 80, stars: 3, duration_s: 360,
  }));
  const row = db.prepare('SELECT * FROM events').get();
  assert.equal(row.type, 'game_finish');
  assert.equal(row.game, 'WhereDoesItGrow');
  assert.equal(row.score, 80);
  assert.equal(row.stars, 3);
  assert.equal(row.duration_s, 360);
  closeDb(db);
});

test('η εκκαθάριση σβήνει μόνο τα παλαιότερα του ορίου', () => {
  const db = openDb(tmpFile());
  const now = Date.now();
  insertEvent(db, ev({ ts: now }));                 // σήμερα — μένει
  insertEvent(db, ev({ ts: now - 300 * DAY }));      // ~10 μήνες — μένει
  insertEvent(db, ev({ ts: now - 800 * DAY }));      // ~26 μήνες — φεύγει
  const removed = purgeOlderThan(db, 24);
  assert.equal(removed, 1);
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 2);
  closeDb(db);
});

test('η εκκαθάριση 24 μηνών χρησιμοποιεί ημερολογιακούς μήνες, όχι σταθερές 30 μέρες', () => {
  // 24 ημερολογιακοί μήνες = 730-731 μέρες, όχι 720 (24*30). Μια γραμμή ~725
  // μέρες πίσω πρέπει να ΕΠΙΖΗΣΕΙ — με τη λανθασμένη αριθμητική 30-ημερών θα
  // είχε ήδη σβηστεί (720 < 725), οπότε το τεστ αυτό πέφτει σε εκείνη την
  // υλοποίηση και περνάει με ημερολογιακή αριθμητική.
  const db = openDb(tmpFile());
  const now = Date.now();
  insertEvent(db, ev({ ts: now }));                 // σήμερα — μένει
  insertEvent(db, ev({ ts: now - 725 * DAY }));      // ~725 μέρες — μένει (24 μήνες ημερολογιακά ≈ 730-731 μέρες)
  const removed = purgeOlderThan(db, 24);
  assert.equal(removed, 0);
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 2);
  closeDb(db);
});

test('το countToday μετρά μόνο τη σημερινή ημέρα', () => {
  const db = openDb(tmpFile());
  insertEvent(db, ev({ ts: Date.now() }));
  insertEvent(db, ev({ ts: Date.now() }));
  insertEvent(db, ev({ ts: Date.now() - 3 * DAY }));
  assert.equal(countToday(db), 2);
  closeDb(db);
});

test('purged rows leave no readable trace in the database file or its WAL', () => {
  const file = tmpFile();
  const db = openDb(file);
  const now = Date.now();
  insertEvent(db, ev({ ts: now }));
  insertEvent(db, ev({ ts: now - 800 * DAY, learner_id: 'PURGEDMARKER0000000000000000000000' }));
  assert.equal(purgeOlderThan(db, 24), 1);
  closeDb(db);
  for (const path of [file, `${file}-wal`]) {
    if (existsSync(path)) assert.equal(readFileSync(path).includes('PURGEDMARKER'), false, path);
  }
});
