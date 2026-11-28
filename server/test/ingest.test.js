import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, closeDb } from '../src/db.js';
import ingestRoutes, { __hitsSizeForTests, MAX_TRACKED } from '../src/routes/ingest.js';
import { __setConfigForTests } from '../src/config.js';

function app(cfg) {
  __setConfigForTests({ PANEL_ENABLED: true, PANEL_SECRET: 'sec', MAX_EVENTS_PER_DAY: 1000, ...cfg });
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pfing-')), 'playfood.db'));
  const f = Fastify();
  f.register(ingestRoutes, { db, prefix: '/api' });
  return { f, db };
}

const ev = { learner_id: 'aaaa1111', session_id: 'bbbb2222', type: 'session_start', language: 'el' };

test('GET /api/config λέει αν είναι ανοιχτή η καταγραφή', async () => {
  const { f, db } = app({ PANEL_ENABLED: true });
  const r = await f.inject({ method: 'GET', url: '/api/config' });
  assert.equal(JSON.parse(r.body).tracking, true);
  closeDb(db);
});

test('με PANEL_ENABLED=no ΔΕΝ γράφεται τίποτα', async () => {
  const { f, db } = app({ PANEL_ENABLED: false });
  const r = await f.inject({ method: 'POST', url: '/api/ev',
    headers: { 'x-pf-secret': 'sec' }, payload: ev });
  assert.equal(r.statusCode, 204);
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 0,
    'το κλειστό panel δεν αποθηκεύει ΤΙΠΟΤΑ');
  closeDb(db);
});

test('λάθος μυστικό απορρίπτεται και δεν γράφει', async () => {
  const { f, db } = app({});
  const r = await f.inject({ method: 'POST', url: '/api/ev',
    headers: { 'x-pf-secret': 'lathos' }, payload: ev });
  assert.equal(r.statusCode, 401);
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 0);
  closeDb(db);
});

test('σωστό event γράφεται', async () => {
  const { f, db } = app({});
  const r = await f.inject({ method: 'POST', url: '/api/ev',
    headers: { 'x-pf-secret': 'sec' }, payload: ev });
  assert.equal(r.statusCode, 204);
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 1);
  closeDb(db);
});

test('άκυρο event απορρίπτεται με 400 χωρίς εγγραφή', async () => {
  const { f, db } = app({});
  const r = await f.inject({ method: 'POST', url: '/api/ev',
    headers: { 'x-pf-secret': 'sec' }, payload: { ...ev, type: 'hacked' } });
  assert.equal(r.statusCode, 400);
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 0);
  closeDb(db);
});

test('το ημερήσιο ταβάνι σταματά την εγγραφή', async () => {
  const { f, db } = app({ MAX_EVENTS_PER_DAY: 2 });
  for (let i = 0; i < 5; i++) {
    await f.inject({ method: 'POST', url: '/api/ev', headers: { 'x-pf-secret': 'sec' }, payload: ev });
  }
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 2,
    'ο δίσκος δεν γεμίζει ποτέ, ακόμα κι από δικό μας bug');
  closeDb(db);
});

test('δεν αποθηκεύεται ποτέ IP ή user-agent', async () => {
  const { f, db } = app({});
  await f.inject({ method: 'POST', url: '/api/ev',
    headers: { 'x-pf-secret': 'sec', 'user-agent': 'Chrome/1', 'x-forwarded-for': '8.8.8.8' },
    payload: { ...ev, ip: '8.8.8.8' } });
  const row = db.prepare('SELECT * FROM events').get();
  assert.equal(JSON.stringify(row).includes('8.8.8.8'), false);
  assert.equal(JSON.stringify(row).includes('Chrome'), false);
  closeDb(db);
});

test('ένα ήδη περιορισμένο IP δεν χάνει το μέτρημά του όταν εμφανιστούν χιλιάδες άλλες διευθύνσεις', { timeout: 30000 }, async () => {
  // Αναπαράγει το εύρημα: πριν, hits.size > 5000 έκανε hits.clear() ΟΛΟΚΛΗΡΟ —
  // μηδενίζοντας και το παράθυρο ενός ήδη-καταγεγραμμένου (και ήδη μπλοκαρισμένου)
  // IP μόλις εμφανίζονταν αρκετές άλλες (πλαστές) διευθύνσεις. Αυτό το τεστ πρέπει
  // να αποτυγχάνει με το παλιό hits.clear() και να περνά με το νέο selective sweep.
  const { f, db } = app({ MAX_EVENTS_PER_DAY: 0 }); // 0 → countToday πάντα ≥ cap, καμία εγγραφή στον δίσκο
  const attacker = '203.0.113.50';

  // Φτάνουμε το attacker IP πάνω από το όριο (120/60s) — το 121ο αίτημά του μπλοκάρεται.
  let last;
  for (let i = 0; i < 121; i++) {
    last = await f.inject({
      method: 'POST', url: '/api/ev',
      headers: { 'x-pf-secret': 'sec' }, payload: ev,
      remoteAddress: attacker,
    });
  }
  assert.equal(last.statusCode, 429, 'το attacker IP έπρεπε να είναι ήδη μπλοκαρισμένο πριν την πλημμυρίδα');

  // Πλημμυρίδα από 5100 διαφορετικές πλαστές διευθύνσεις — υπερβαίνει το MAX_TRACKED=5000
  // και πυροδοτεί τον φραγμό μνήμης (clear ή selective sweep, ανάλογα με την υλοποίηση).
  for (let i = 0; i < 5100; i++) {
    await f.inject({
      method: 'POST', url: '/api/ev',
      headers: { 'x-pf-secret': 'sec' }, payload: ev,
      remoteAddress: `2001:db8::${i.toString(16)}`,
    });
  }

  // Το attacker IP πρέπει ΝΑ ΠΑΡΑΜΕΙΝΕΙ μπλοκαρισμένο — η πλημμυρίδα άσχετων
  // διευθύνσεων δεν πρέπει να μηδενίσει το δικό του παράθυρο μέτρησης.
  const after = await f.inject({
    method: 'POST', url: '/api/ev',
    headers: { 'x-pf-secret': 'sec' }, payload: ev,
    remoteAddress: attacker,
  });
  assert.equal(after.statusCode, 429,
    'το παλιό ολικό hits.clear() θα είχε σβήσει το μέτρημα του attacker εδώ, ξεμπλοκάροντάς το');

  closeDb(db);
});

test('ο χάρτης δεν μεγαλώνει πέρα από το σκληρό ταβάνι κάτω από πλημμυρίδα ζωντανών διευθύνσεων', { timeout: 30000 }, async () => {
  // Αν ΚΑΘΕ εγγραφή είναι ακόμα ζωντανή (καμία δεν έχει λήξει), το selective
  // sweep δεν ελευθερώνει τίποτα — μόνο το σκληρό ταβάνι σταματά την
  // απεριόριστη ανάπτυξη του Map.
  const { f, db } = app({ MAX_EVENTS_PER_DAY: 0 });
  for (let i = 0; i < MAX_TRACKED + 1500; i++) {
    await f.inject({
      method: 'POST', url: '/api/ev',
      headers: { 'x-pf-secret': 'sec' }, payload: ev,
      remoteAddress: `2001:db8:9::${i.toString(16)}`,
    });
  }
  assert.ok(__hitsSizeForTests() <= MAX_TRACKED,
    `ο χάρτης έπρεπε να μείνει ≤ ${MAX_TRACKED}, βρέθηκε ${__hitsSizeForTests()}`);
  closeDb(db);
});

test('σωστό event με μυστικό στο σώμα (sendBeacon) γράφεται', async () => {
  const { f, db } = app({});
  const r = await f.inject({ method: 'POST', url: '/api/ev',
    payload: { ...ev, secret: 'sec' } });
  assert.equal(r.statusCode, 204);
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 1);
  closeDb(db);
});

test('λάθος μυστικό στο σώμα απορρίπτεται με 401 χωρίς εγγραφή', async () => {
  const { f, db } = app({});
  const r = await f.inject({ method: 'POST', url: '/api/ev',
    payload: { ...ev, secret: 'lathos' } });
  assert.equal(r.statusCode, 401);
  assert.equal(db.prepare('SELECT count(*) c FROM events').get().c, 0);
  closeDb(db);
});

test('το μυστικό δεν αποθηκεύεται ποτέ, ακόμα κι όταν έρχεται στο σώμα', async () => {
  const { f, db } = app({});
  await f.inject({ method: 'POST', url: '/api/ev',
    payload: { ...ev, secret: 'sec' } });
  const row = db.prepare('SELECT * FROM events').get();
  assert.equal(JSON.stringify(row).includes('sec'), false,
    'το μυστικό δεν πρέπει να αποθηκευτεί σε κανένα πεδίο');
  closeDb(db);
});
