import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { openDb, insertEvent, closeDb } from '../src/db.js';
import { sealUsersFile } from '../src/auth.js';
import panelApiRoutes, { csvFileName } from '../src/routes/panelApi.js';
import ingestRoutes from '../src/routes/ingest.js';
import { __setConfigForTests } from '../src/config.js';

function app(fastifyOptions = {}) {
  __setConfigForTests({ PANEL_ENABLED: true, PANEL_SECRET: 'sec', MAX_EVENTS_PER_DAY: 100000 });
  const dir = mkdtempSync(join(tmpdir(), 'pfpanel-'));
  const usersFile = join(dir, 'users.txt');
  const dbFile = join(dir, 'playfood.db');
  writeFileSync(usersFile, 'admin@x.gr : kodikos123\n', 'utf8');
  sealUsersFile(usersFile);
  const db = openDb(dbFile);
  insertEvent(db, { ts: Date.now(), learner_id: 'kid1', session_id: 's1',
    type: 'session_start', island: null, game: null, score: null, stars: null,
    duration_s: null, progress: null, language: 'el', returning: 0 });
  const f = Fastify(fastifyOptions);
  f.register(panelApiRoutes, { db, usersFile, dbFile, prefix: '/api' });
  return { f, db, dir, dbFile };
}

test('collection diagnostics report rejections only to signed-in staff and ignore display filters', async () => {
  const { f, db } = app();
  f.register(ingestRoutes, { db, prefix: '/api' });
  try {
    const send = (payload, secret = 'sec') => f.inject({ method: 'POST', url: '/api/ev',
      headers: { 'x-pf-secret': secret }, remoteAddress: '192.0.2.77', payload });
    const event = { learner_id: 'testuser', session_id: 'testvisit', type: 'session_start' };
    assert.equal((await send(event, 'bad')).statusCode, 401);
    assert.equal((await send({ ...event, type: 'game_finish' })).statusCode, 400);
    assert.equal((await send(event)).statusCode, 204);
    __setConfigForTests({ PANEL_ENABLED: true, PANEL_SECRET: 'sec', MAX_EVENTS_PER_DAY: 1 });
    assert.equal((await send(event)).statusCode, 204);
    for (let i = 0; i < 118; i++) await send(event);
    const headers = { authorization: `Bearer ${JSON.parse((await login(f)).body).token}` };
    const diagnostics = (await f.inject({ url: '/api/stats?language=pt&from=2099-01-01', headers })).json().now.collection;
    assert.equal(diagnostics.accepted, 1);
    assert.equal(diagnostics.unauthorized, 1);
    assert.equal(diagnostics.invalid, 1);
    assert.equal(diagnostics.rateLimited, 1);
    assert.equal(diagnostics.dailyCap, 118);
    assert.ok(diagnostics.lastAcceptedAt >= diagnostics.since);
    assert.equal((await f.inject('/api/stats')).statusCode, 401);
    assert.equal((await f.inject('/api/health')).json().collection, undefined);
  } finally { await f.close(); closeDb(db); }
});

test('attempts survive ingestion, duplicate delivery, stats and CSV export', async () => {
  const { f, db } = app();
  f.register(ingestRoutes, { db, prefix: '/api' });
  try {
    const event = { learner_id: 'testuser', session_id: 'testvisit', island: 'growing',
      game: 'SoilDoctor', attempt_id: 'attempt0001', language: 'el' };
    // Arrival order need not equal gameplay order.
    for (const type of ['game_finish', 'game_start', 'game_finish', 'game_start']) {
      assert.equal((await f.inject({ method: 'POST', url: '/api/ev',
        headers: { 'x-pf-secret': 'sec' }, payload: { ...event, type,
          ...(type === 'game_finish' ? { passed: false, timing_version: 1,
            active_s: 20, learning_s: 10, paused_s: 0, hidden_s: 2, idle_s: 1, other_s: 0 } : {}) } })).statusCode, 204);
    }
    const headers = { authorization: `Bearer ${JSON.parse((await login(f)).body).token}` };
    const stats = (await f.inject({url:'/api/stats?language=el',headers})).json();
    const row = stats.perIsland[0].games.find(game => game.game === 'SoilDoctor');
    assert.equal(row.started, 1);
    assert.equal(row.finished, 1);
    assert.equal(row.pct, 100);
    assert.deepEqual(row.outcomes, { passed: 0, failed: 1, unknown: 0 });
    assert.equal(row.timing.measured, 1);
    assert.equal(row.timing.active_s, 20);
    const csv = (await f.inject({url:'/api/export.csv?language=el',headers})).body.split('\n').slice(1);
    const attemptColumn = csv[0].split(',').indexOf('attempt_id');
    assert.ok(attemptColumn >= 0);
    assert.equal(csv.slice(1).filter(line => line.split(',')[attemptColumn] === 'attempt0001').length, 2);
    const passedColumn = csv[0].split(',').indexOf('passed');
    assert.ok(passedColumn >= 0);
    const finishLine = csv.slice(1).find(line => line.split(',')[3] === 'game_finish');
    assert.equal(finishLine.split(',')[passedColumn], '0');
    for (const [key, value] of Object.entries({ timing_version: 1, active_s: 20, learning_s: 10,
      paused_s: 0, hidden_s: 2, idle_s: 1, other_s: 0 })) {
      const column = csv[0].split(',').indexOf(key);
      assert.ok(column >= 0);
      assert.equal(finishLine.split(',')[column], String(value));
    }
  } finally { await f.close(); closeDb(db); }
});

// Περιμένει έως ότου εξαφανιστούν τα προσωρινά .backup-* αρχεία (το unlink
// γίνεται σε 'close' handler του read stream, λίγο ΜΕΤΑ την ολοκλήρωση του
// inject) — χωρίς αόριστο sleep, με σύντομο polling και ταβάνι χρόνου.
async function waitForNoBackupFiles(dir, timeoutMs = 2000) {
  const start = Date.now();
  for (;;) {
    const leftover = readdirSync(dir).filter((name) => name.includes('.backup-'));
    if (leftover.length === 0 || Date.now() - start > timeoutMs) return leftover;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const login = async (f, password = 'kodikos123') =>
  f.inject({ method: 'POST', url: '/api/login', payload: { email: 'admin@x.gr', password } });

test('σωστά στοιχεία δίνουν token', async () => {
  const { f, db } = app();
  const r = await login(f);
  assert.equal(r.statusCode, 200);
  assert.ok(JSON.parse(r.body).token.length > 20);
  closeDb(db);
});

test('λάθος κωδικός απορρίπτεται', async () => {
  const { f, db } = app();
  assert.equal((await login(f, 'lathos')).statusCode, 401);
  closeDb(db);
});

test('login attempts have a temporary per-peer limit that ignores email and forwarded-header rotation', async (t) => {
  const { f, db } = app({ trustProxy: true });
  let now = 1000000;
  t.mock.method(Date, 'now', () => now);
  const attempt = (email, remoteAddress = '192.0.2.10', forwarded = '198.51.100.1', password = 'bad') =>
    f.inject({ method: 'POST', url: '/api/login', remoteAddress,
      headers: { 'x-forwarded-for': forwarded }, payload: { email, password } });
  try {
    for (let i = 0; i < 10; i++) {
      const response = await attempt(`unknown${i}@x.gr`, '192.0.2.10', `198.51.100.${i + 1}`);
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), { error: 'wrong email or password' });
    }
    const limited = await attempt('admin@x.gr', '192.0.2.10', '203.0.113.99', 'kodikos123');
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.headers['retry-after'], '300');
    assert.equal(limited.json().token, undefined);
    assert.equal((await attempt('admin@x.gr', '192.0.2.11', '203.0.113.99', 'kodikos123')).statusCode, 200);
    now += 299001;
    const almostExpired = await attempt('admin@x.gr');
    assert.equal(almostExpired.statusCode, 429);
    assert.equal(almostExpired.headers['retry-after'], '1');
    now += 999;
    const allowed = await attempt('admin@x.gr', '192.0.2.10', '203.0.113.99', 'kodikos123');
    assert.equal(allowed.statusCode, 200);
    assert.equal((await f.inject({ url: '/api/session', headers: {
      authorization: `Bearer ${allowed.json().token}` } })).json().email, 'admin@x.gr');
  } finally { await f.close(); closeDb(db); }
});

test('successful login consumes an attempt and does not reset the shared peer limit', async () => {
  const { f, db } = app();
  try {
    for (let i = 0; i < 10; i++) assert.equal((await login(f)).statusCode, 200);
    assert.equal((await login(f)).statusCode, 429);
  } finally { await f.close(); closeDb(db); }
});

test('unknown and known accounts both run real scrypt verification and have the same failure response', async (t) => {
  const { f, db } = app();
  const originalScrypt = crypto.scryptSync;
  const calls = [];
  const replacement = t.mock.method(crypto, 'scryptSync', (...args) => {
    calls.push({ keyLength: args[2], options: args[3] });
    return originalScrypt(...args);
  });
  syncBuiltinESMExports();
  try {
    const unknown = await f.inject({ method: 'POST', url: '/api/login',
      payload: { email: 'missing@x.gr', password: 'wrong' } });
    assert.equal(calls.length, 1, 'unknown email must verify a valid dummy hash');
    const known = await login(f, 'wrong');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1], 'same scrypt work factors and key length');
    assert.deepEqual(calls[0], { keyLength: 32, options: { N: 16384, r: 8, p: 1 } });
    assert.equal(unknown.statusCode, 401);
    assert.equal(known.statusCode, 401);
    assert.deepEqual(unknown.json(), known.json());
  } finally {
    replacement.mock.restore();
    syncBuiltinESMExports();
    await f.close(); closeDb(db);
  }
});

test('a disabled panel rejects login before consuming its attempt budget', async () => {
  const { f, db } = app();
  try {
    __setConfigForTests({ PANEL_ENABLED: false });
    for (let i = 0; i < 11; i++) assert.equal((await login(f)).statusCode, 503);
    __setConfigForTests({ PANEL_ENABLED: true });
    assert.equal((await login(f)).statusCode, 200);
  } finally { await f.close(); closeDb(db); }
});

test('τα stats θέλουν σύνδεση', async () => {
  const { f, db } = app();
  assert.equal((await f.inject({ method: 'GET', url: '/api/stats' })).statusCode, 401);
  closeDb(db);
});

test('συνδεδεμένος παίρνει στατιστικά', async () => {
  const { f, db } = app();
  const token = JSON.parse((await login(f)).body).token;
  const r = await f.inject({ method: 'GET', url: '/api/stats',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(r.statusCode, 200);
  const s = JSON.parse(r.body);
  assert.equal(s.overview.learners, 1);
  assert.equal(s.funnel.length, 6);
  assert.equal(s.perIsland.length, 4, 'τέσσερα νησιά, πάντα και τα τέσσερα');
  assert.equal(s.perIsland.flatMap((i) => i.games).length, 12,
    'και τα δώδεκα παιχνίδια, μοιρασμένα στα νησιά τους');
  closeDb(db);
});

test('το /api/stats δίνει πλήρες «τώρα» — κατάσταση, events σήμερα, ενεργοί', async () => {
  const { f, db } = app();
  const token = JSON.parse((await login(f)).body).token;
  const r = await f.inject({ method: 'GET', url: '/api/stats',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(r.statusCode, 200);
  const s = JSON.parse(r.body);
  // Η λωρίδα «Right Now» του panel γεμίζει από ΜΙΑ κλήση — αν λείπει έστω ένα
  // από αυτά, εμφανίζει «undefined» στον χρήστη.
  assert.equal(s.now.db, true);
  assert.equal(s.now.tracking, true);
  assert.equal(typeof s.now.eventsToday, 'number');
  assert.equal(typeof s.now.activeThisWeek, 'number');
  closeDb(db);
});

test('CSV and statistics use the same inclusive local date range', async () => {
  const { f, db } = app();
  try {
    db.prepare('DELETE FROM events').run();
    for (const [id, ts] of [
      ['before', new Date(2026, 8, 1, 23, 59, 59).getTime()],
      ['start', new Date(2026, 8, 2, 0, 0, 0).getTime()],
      ['end', new Date(2026, 8, 2, 23, 59, 59).getTime()],
      ['after', new Date(2026, 8, 3, 0, 0, 0).getTime()],
    ]) {
      insertEvent(db, { ts, learner_id: id, session_id: id, type: 'session_start',
        island: null, game: null, score: null, stars: null, duration_s: null,
        progress: null, language: 'en', returning: 0 });
    }
    const token = JSON.parse((await login(f)).body).token;
    const headers = { authorization: `Bearer ${token}` };
    for (const [query, ids] of [
      ['?from=2026-09-02&to=2026-09-02', ['start', 'end']],
      ['?from=2026-09-03', ['after']],
      ['?to=2026-09-01', ['before']],
      ['?from=2026-10-01', []],
      ['', ['before', 'start', 'end', 'after']],
    ]) {
      const csv = await f.inject({ url: '/api/export.csv' + query, headers });
      assert.equal(csv.statusCode, 200);
      assert.deepEqual(csv.body.split('\n').slice(2).map(row => row.split(',')[1]), ids);
      const stats = await f.inject({ url: '/api/stats' + query, headers });
      assert.equal(stats.json().overview.learners, ids.length);
    }
  } finally {
    await f.close();
    closeDb(db);
  }
});

test('language filters activity, not all activity of a matching profile', async () => {
  const { f, db } = app();
  try {
    for (const language of ['en', 'pt']) {
      insertEvent(db, { ts: Date.now(), learner_id: 'kid1', session_id: language,
        type: 'session_start', island: null, game: null, score: null, stars: null,
        duration_s: null, progress: null, language, returning: 1 });
    }
    const headers = { authorization: `Bearer ${JSON.parse((await login(f)).body).token}` };
    for (const [language, count] of [['el', 1], ['en', 1], ['pt', 1], ['nl', 0], ['', 3]]) {
      const stats = await f.inject({ url: '/api/stats?language=' + language, headers });
      assert.equal(stats.json().overview.sessions, count);
      const csv = await f.inject({ url: '/api/export.csv?language=' + language, headers });
      const rows = csv.body.split('\n').slice(2);
      assert.equal(rows.length, count);
      if (language) assert.ok(rows.every(row => row.split(',')[10] === language));
    }
    for (const path of ['/api/stats', '/api/export.csv']) {
      assert.equal((await f.inject({ url: path + '?language=invalid', headers })).statusCode, 400);
    }
  } finally { await f.close(); closeDb(db); }
});

test('session restoration requires a valid token and logout revokes it', async () => {
  const { f, db } = app();
  try {
    assert.equal((await f.inject({ url:'/api/session' })).statusCode, 401);
    const headers = { authorization: `Bearer ${JSON.parse((await login(f)).body).token}` };
    const restored = await f.inject({ url:'/api/session', headers });
    assert.equal(restored.json().email, 'admin@x.gr');
    assert.equal(restored.headers['cache-control'], 'no-store');
    await f.inject({ method:'POST', url:'/api/logout', headers });
    assert.equal((await f.inject({ url:'/api/session', headers })).statusCode, 401);
  } finally { await f.close(); closeDb(db); }
});

test('το CSV έχει επικεφαλίδα και γραμμές', async () => {
  const { f, db } = app();
  const token = JSON.parse((await login(f)).body).token;
  const r = await f.inject({ method: 'GET', url: '/api/export.csv',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(r.statusCode, 200);
  assert.ok(r.headers['content-type'].includes('text/csv'));
  assert.equal(r.body.split('\n')[0], 'sep=,');
  assert.ok(r.body.split('\n')[1].startsWith('ts,learner_id,session_id,type'));
  assert.ok(r.body.split('\n')[1].endsWith(',local_time,timestamp_utc,row_scope'));
  assert.match(r.headers['content-disposition'], /filename="playfood-stats_all-time\.csv"/);
  closeDb(db);
});

// Η διαδρομή που έσβηνε τα πάντα ΑΦΑΙΡΕΘΗΚΕ, μαζί με το κουμπί «Clear all data».
// Όλοι οι λογαριασμοί του panel έχουν ακριβώς τα ίδια δικαιώματα, άρα κανείς δεν
// πρέπει να κρατά διακόπτη που ισοπεδώνει τη βάση με ένα κλικ· αν το endpoint
// έμενε ζωντανό πίσω από ένα κρυμμένο κουμπί, το δικαίωμα θα υπήρχε ακόμα, απλώς
// αόρατο. Το τεστ φρουρεί την αφαίρεση ώστε να μην επιστρέψει κατά λάθος.
test('η διαδρομή /api/reset δεν υπάρχει πια', async () => {
  const { f, db } = app();
  const token = JSON.parse((await login(f)).body).token;
  const r = await f.inject({ method: 'POST', url: '/api/reset',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(r.statusCode, 404, 'έγκυρο token δεν πρέπει να βρίσκει διαδρομή διαγραφής');
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 1,
    'τα events μένουν άθικτα — δεν υπάρχει πια τρόπος να σβηστούν μέσω του API');
  closeDb(db);
});

test('το /api/health δείχνει κατάσταση χωρίς σύνδεση', async () => {
  const { f, db } = app();
  const r = await f.inject({ method: 'GET', url: '/api/health' });
  const h = JSON.parse(r.body);
  assert.equal(h.db, true);
  assert.equal(h.tracking, true);
  assert.equal(typeof h.eventsToday, 'number');
  closeDb(db);
});

// Οι δύο ευαίσθητες διαδρομές που απομένουν (CSV όλων των γραμμών, αντίγραφο
// ολόκληρης βάσης) ελέγχονται ΞΕΧΩΡΙΣΤΑ εδώ — ένα λάθος στο requireSession μιας
// μεμονωμένης διαδρομής δεν πρέπει να κρυφτεί πίσω από τον έλεγχο του /stats.
test('το /api/export.csv χωρίς σύνδεση απορρίπτεται', async () => {
  const { f, db } = app();
  assert.equal((await f.inject({ method: 'GET', url: '/api/export.csv' })).statusCode, 401);
  closeDb(db);
});

test('το /api/backup χωρίς σύνδεση απορρίπτεται', async () => {
  const { f, db } = app();
  assert.equal((await f.inject({ method: 'GET', url: '/api/backup' })).statusCode, 401);
  closeDb(db);
});

test('συνδεδεμένος παίρνει αντίγραφο βάσης', async () => {
  const { f, db } = app();
  const token = JSON.parse((await login(f)).body).token;
  const r = await f.inject({ method: 'GET', url: '/api/backup',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(r.statusCode, 200);
  assert.ok(r.headers['content-type'].includes('application/octet-stream'));
  assert.ok(r.headers['content-disposition'].includes('playfood.db'));
  closeDb(db);
});

// ΚΡΙΣΙΜΟ: η βάση τρέχει σε WAL mode (db.js). Ένα απλό createReadStream(dbFile)
// διαβάζει ΜΟΝΟ το κύριο αρχείο — ό,τι εκκρεμεί ακόμα στο πλευρικό -wal αρχείο
// λείπει σιωπηλά από το κατέβασμα. Το τεστ απενεργοποιεί το αυτόματο checkpoint
// ώστε οι 200 νέες γραμμές να ΜΕΙΝΟΥΝ εγγυημένα στο -wal, μετά ζητά /backup και
// ανοίγει τα bytes που επέστρεψε σαν ανεξάρτητη βάση SQLite — πρέπει να έχει
// ΑΚΡΙΒΩΣ τον ίδιο αριθμό γραμμών με τη ζωντανή βάση.
test('το /api/backup δεν χάνει σιωπηλά εγγραφές που εκκρεμούν στο WAL', { timeout: 20000 }, async () => {
  const { f, db, dir } = app();
  db.pragma('wal_autocheckpoint = 0'); // καμία αυτόματη μεταφορά WAL→κύριο αρχείο σε αυτό το τεστ
  const token = JSON.parse((await login(f)).body).token;

  for (let i = 0; i < 200; i++) {
    insertEvent(db, {
      ts: Date.now(), learner_id: `wal${String(i).padStart(4, '0')}`, session_id: 'swal',
      type: 'session_start', island: null, game: null, score: null, stars: null,
      duration_s: null, progress: null, language: 'el', returning: 0,
    });
  }

  const liveCount = db.prepare('SELECT count(*) c FROM events').get().c;
  assert.equal(liveCount, 201, 'το αρχικό kid1 + 200 νέες εγγραφές, όλες εκκρεμείς στο WAL');

  const r = await f.inject({ method: 'GET', url: '/api/backup',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(r.statusCode, 200);

  const receivedFile = join(dir, 'received-backup.db');
  writeFileSync(receivedFile, r.rawPayload);
  const received = new Database(receivedFile, { readonly: true });
  const backupCount = received.prepare('SELECT count(*) c FROM events').get().c;
  received.close();

  assert.equal(backupCount, liveCount,
    `το /backup επέστρεψε ${backupCount} γραμμές αλλά η ζωντανή βάση έχει ${liveCount} — ` +
    'εγγραφές που εκκρεμούσαν στο WAL χάθηκαν σιωπηλά στο αντίγραφο ασφαλείας');

  const leftover = await waitForNoBackupFiles(dir);
  assert.equal(leftover.length, 0,
    `έμεινε προσωρινό αρχείο αντιγράφου στον φάκελο: ${leftover.join(', ')}`);

  closeDb(db);
});

// I1 (Important): PANEL_ENABLED = no πρέπει να κλείνει ΚΑΙ το authenticated data
// API, όχι μόνο την καταγραφή και τη σελίδα. Ένα valid token από πριν το κλείσιμο
// δεν πρέπει να μπορεί να κατεβάσει/σβήσει τη βάση όσο το panel είναι «off».
test('με PANEL_ENABLED=no το data API κλείνει (503), health/logout μένουν', async () => {
  const { f, db } = app();
  // Πρώτα παίρνουμε token ΕΝΩ είναι ανοιχτό, μετά «κλείνουμε» το panel.
  const token = JSON.parse((await login(f)).body).token;
  __setConfigForTests({ PANEL_ENABLED: false });
  try {
    const auth = { authorization: `Bearer ${token}` };
    for (const [method, url] of [
      ['GET', '/api/stats'], ['GET', '/api/export.csv'], ['GET', '/api/backup'],
    ]) {
      const r = await f.inject({ method, url, headers: auth });
      assert.equal(r.statusCode, 503, `${url} έπρεπε να είναι 503 όσο το panel είναι off`);
    }
    // Ούτε νέο login επιτρέπεται όσο είναι off.
    assert.equal((await login(f)).statusCode, 503);
    // Η βάση παραμένει άθικτη.
    assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 1);
    // Το health παραμένει διαθέσιμο και δείχνει tracking:false· το logout αβλαβές.
    const h = JSON.parse((await f.inject({ method: 'GET', url: '/api/health' })).body);
    assert.equal(h.tracking, false);
    assert.equal((await f.inject({ method: 'POST', url: '/api/logout', headers: auth })).statusCode, 200);
  } finally {
    __setConfigForTests({ PANEL_ENABLED: true }); // επαναφορά για τα επόμενα tests
    closeDb(db);
  }
});

// Βλ. FIX 2 (Important): οι στήλες του CSV ταιριάζουν με την επικεφαλίδα μόνο
// επειδή το SELECT τυχαίνει να απαριθμεί τις στήλες με την ίδια σειρά. Αυτό το
// τεστ βάζει διακριτές τιμές σε ΚΑΘΕ στήλη και ελέγχει ότι η κάθε τιμή βρίσκεται
// κάτω από τη ΣΩΣΤΗ επικεφαλίδα (με βάση τη θέση στη λίστα header, όχι με το
// μάτι) — έτσι μια μελλοντική αναδιάταξη του SELECT θα σπάσει εδώ, όχι σιωπηλά
// σε ένα εξαγόμενο αρχείο.
test('το CSV ευθυγραμμίζει κάθε τιμή με τη σωστή στήλη', async () => {
  const { f, db } = app();
  insertEvent(db, {
    ts: 1234567890123, learner_id: 'csvalign', session_id: 'csvsess1', type: 'game_finish',
    island: 'foodwaste', game: 'LeftoverChef', score: 77, stars: 2, duration_s: 321,
    progress: 55, language: 'nl', returning: 1,
  });
  const token = JSON.parse((await login(f)).body).token;
  const r = await f.inject({ method: 'GET', url: '/api/export.csv',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(r.statusCode, 200);

  const lines = r.body.trim().split('\n').slice(1);
  const header = lines[0].split(',');
  const dataRows = lines.slice(1).map((line) => line.split(','));
  const idIdx = header.indexOf('learner_id');
  const row = dataRows.find((cells) => cells[idIdx] === 'csvalign');
  assert.ok(row, 'δεν βρέθηκε η distinctive γραμμή στο CSV');

  const cell = (name) => row[header.indexOf(name)];
  assert.equal(cell('ts'), '1234567890123');
  assert.equal(cell('session_id'), 'csvsess1');
  assert.equal(cell('type'), 'game_finish');
  assert.equal(cell('island'), 'foodwaste');
  assert.equal(cell('game'), 'LeftoverChef');
  assert.equal(cell('score'), '77');
  assert.equal(cell('stars'), '2');
  assert.equal(cell('duration_s'), '321');
  assert.equal(cell('progress'), '55');
  assert.equal(cell('language'), 'nl');
  assert.equal(cell('returning'), '1');
  assert.equal(cell('timestamp_utc'), '2009-02-13T23:31:30.123Z');
  assert.match(cell('local_time'), /^2009-02-1[34] \d\d:31:30$/);
  closeDb(db);
});

test('the CSV file name names the period and language', () => {
  assert.equal(csvFileName(null, null, ''), 'playfood-stats_all-time.csv');
  assert.equal(csvFileName('2026-09-01', '2026-09-30', 'el'), 'playfood-stats_2026-09-01_to_2026-09-30_el.csv');
  assert.equal(csvFileName('2026-09-01"; x', null, ''), 'playfood-stats_2026-09-01_to_today.csv');
});

test('a language CSV keeps the language-less start rows of visits played in that language', async () => {
  const { f, db } = app();
  f.register(ingestRoutes, { db, prefix: '/api' });
  try {
    const send = (payload) => f.inject({ method: 'POST', url: '/api/ev', headers: { 'x-pf-secret': 'sec' }, payload });
    // Visit A starts on the language screen (no language) and is played in Greek; visit B in Portuguese.
    assert.equal((await send({ type: 'session_start', learner_id: 'learnera', session_id: 'visita', returning: 1 })).statusCode, 204);
    assert.equal((await send({ type: 'game_start', learner_id: 'learnera', session_id: 'visita', island: 'growing', game: 'SoilDoctor', attempt_id: 'attempta001', language: 'el' })).statusCode, 204);
    assert.equal((await send({ type: 'session_start', learner_id: 'learnerb', session_id: 'visitb', returning: 1 })).statusCode, 204);
    assert.equal((await send({ type: 'game_start', learner_id: 'learnerb', session_id: 'visitb', island: 'growing', game: 'SoilDoctor', attempt_id: 'attemptb001', language: 'pt' })).statusCode, 204);
    const headers = { authorization: `Bearer ${JSON.parse((await login(f)).body).token}` };
    const csv = (await f.inject({ url: '/api/export.csv?language=el', headers })).body.split('\n').slice(2);
    const sessions = csv.map((line) => line.split(',')).filter((cells) => cells[3] === 'session_start').map((cells) => cells[2]);
    assert.ok(sessions.includes('visita'), 'the Greek visit keeps its language-less start');
    assert.ok(!sessions.includes('visitb'), 'the Portuguese visit stays out');
  } finally { await f.close(); closeDb(db); }
});

function csvRecords(body) {
  const [header, ...lines] = body.trim().split('\n').slice(1);
  const columns = header.split(',');
  return { columns, rows: lines.map(line => Object.fromEntries(
    line.split(',').map((value, index) => [columns[index], value])
  )) };
}

function addExportEvent(db, overrides) {
  insertEvent(db, { ts: new Date(2026, 8, 2, 12).getTime(), learner_id: 'exportkid',
    session_id: 'exportvisit', type: 'game_finish', island: 'foodwaste', game: 'FridgeManager',
    score: 77, stars: 2, duration_s: 25, progress: 60, language: 'el', returning: null,
    ...overrides });
}

test('P9: an old language match cannot select visits outside the date and language cohort', async () => {
  const { f, db } = app();
  try {
    db.prepare('DELETE FROM events').run();
    addExportEvent(db, { ts: new Date(2026, 8, 1, 12).getTime() });
    addExportEvent(db, { type: 'session_end', language: null });
    const headers = { authorization: `Bearer ${JSON.parse((await login(f)).body).token}` };
    const query = '?from=2026-09-02&to=2026-09-02&language=el';
    const stats = (await f.inject({ url: '/api/stats' + query, headers })).json();
    assert.equal(stats.overview.sessions, 0);
    const csv = await f.inject({ url: '/api/export.csv' + query, headers });
    assert.equal(csv.statusCode, 200);
    assert.deepEqual(csvRecords(csv.body).rows, [], 'no cohort means no exported context');
  } finally { await f.close(); closeDb(db); }
});

test('P9: selected visits retain original cross-midnight context without exporting unrelated gameplay', async () => {
  const { f, db } = app();
  try {
    db.prepare('DELETE FROM events').run();
    const ts = (day, hour, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();
    addExportEvent(db, { ts: ts(1, 23, 58), type: 'session_start', language: null, returning: 1 });
    addExportEvent(db, { ts: ts(1, 23, 59), type: 'hero_chosen', language: 'en', game: 'braid' });
    addExportEvent(db, { ts: ts(2, 0, 1), attempt_id: 'selected001', passed: 1,
      timing_version: 1, active_s: 10, learning_s: 3, paused_s: 2, hidden_s: 1, idle_s: 4, other_s: 5 });
    addExportEvent(db, { ts: ts(2, 0, 2), type: 'session_end', language: 'el', duration_s: 250 });
    addExportEvent(db, { ts: ts(3, 0, 1), type: 'session_end', language: 'pt', duration_s: 400 });
    // These share the visit but fail either the language or date predicate.
    addExportEvent(db, { ts: ts(1, 23, 57) });
    addExportEvent(db, { ts: ts(3, 0, 2), type: 'game_start' });
    addExportEvent(db, { ts: ts(2, 1), language: 'pt', type: 'game_start' });
    addExportEvent(db, { ts: ts(2, 2), language: null, type: 'game_start' });
    addExportEvent(db, { ts: ts(2, 3), language: null, type: 'island_enter' });
    addExportEvent(db, { ts: ts(2, 4), language: null, type: 'phygital_redeem', game: 'SAVEIT' });
    addExportEvent(db, { ts: ts(2, 5), session_id: 'othervisit', type: 'session_start', language: null });
    addExportEvent(db, { ts: ts(2, 6), learner_id: 'otherkid', type: 'session_start', language: null });
    // A non-null differently-languaged start is still the original visit status.
    addExportEvent(db, { ts: ts(1, 23, 56), session_id: 'englishstart', type: 'session_start', language: 'en', returning: 0 });
    addExportEvent(db, { ts: ts(2, 7), session_id: 'englishstart' });
    // Missing starts remain missing; exports must not manufacture returning=0.
    addExportEvent(db, { ts: ts(2, 8), session_id: 'missingstart' });
    const before = db.prepare('SELECT * FROM events ORDER BY id').all();
    const headers = { authorization: `Bearer ${JSON.parse((await login(f)).body).token}` };
    const query = '?from=2026-09-02&to=2026-09-02&language=el';
    const stats = (await f.inject({ url: '/api/stats' + query, headers })).json();
    assert.deepEqual(stats.audience.visits, { first: 1, returning: 1, unknown: 1 });
    const csv = await f.inject({ url: '/api/export.csv' + query, headers });
    assert.equal(csv.statusCode, 200);
    const { rows } = csvRecords(csv.body);
    assert.deepEqual(rows.map(row => [Number(row.ts), row.row_scope]), [
      [ts(1, 23, 56), 'visit_context'], [ts(1, 23, 58), 'visit_context'],
      [ts(1, 23, 59), 'visit_context'], [ts(2, 0, 1), 'filtered'],
      [ts(2, 0, 2), 'filtered'], [ts(2, 7), 'filtered'], [ts(2, 8), 'filtered'],
      [ts(3, 0, 1), 'visit_context'],
    ]);
    const selected = rows.find(row => row.attempt_id === 'selected001');
    for (const key of ['learner_id', 'session_id', 'score', 'stars', 'duration_s', 'progress',
      'language', 'attempt_id', 'passed', 'timing_version', 'active_s', 'learning_s',
      'paused_s', 'hidden_s', 'idle_s', 'other_s']) {
      const source = before.find(row => row.attempt_id === 'selected001');
      assert.equal(selected[key], String(source[key]), key);
    }
    assert.equal(rows.find(row => row.session_id === 'missingstart').returning, '');
    assert.equal(rows.find(row => row.session_id === 'englishstart').returning, '0');
    assert.equal(rows.find(row => row.type === 'session_start' && row.session_id === 'exportvisit').returning, '1');
    assert.deepEqual(db.prepare('SELECT * FROM events ORDER BY id').all(), before);
  } finally { await f.close(); closeDb(db); }
});

test('P9: unfiltered CSV keeps the existing columns and strict date population, with row_scope appended', async () => {
  const { f, db } = app();
  try {
    db.prepare('DELETE FROM events').run();
    addExportEvent(db, { ts: new Date(2026, 8, 1, 23, 59).getTime(), type: 'session_start', language: null });
    addExportEvent(db, { language: 'el' });
    addExportEvent(db, { language: 'pt', session_id: 'ptvisit' });
    addExportEvent(db, { language: null, session_id: 'nullvisit' });
    const headers = { authorization: `Bearer ${JSON.parse((await login(f)).body).token}` };
    const csv = await f.inject({ url: '/api/export.csv?from=2026-09-02&to=2026-09-02', headers });
    const { columns, rows } = csvRecords(csv.body);
    assert.deepEqual(columns, ['ts', 'learner_id', 'session_id', 'type', 'island', 'game', 'score',
      'stars', 'duration_s', 'progress', 'language', 'returning', 'attempt_id', 'passed',
      'timing_version', 'active_s', 'learning_s', 'paused_s', 'hidden_s', 'idle_s', 'other_s',
      'local_time', 'timestamp_utc', 'row_scope']);
    assert.deepEqual(rows.map(row => [row.session_id, row.language, row.row_scope]), [
      ['exportvisit', 'el', 'filtered'], ['ptvisit', 'pt', 'filtered'], ['nullvisit', '', 'filtered'],
    ]);
    assert.ok(rows.every(row => row.type === 'game_finish'));
  } finally { await f.close(); closeDb(db); }
});
