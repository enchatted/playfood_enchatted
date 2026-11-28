import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildServer } from '../src/app.js';
import { __configWatcherRunningForTests } from '../src/config.js';
import { __sessionSweeperRunningForTests, startSessionSweeper } from '../src/auth.js';

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'pfsrv-'));
  const clientDist = join(dataDir, 'dist');
  mkdirSync(clientDist, { recursive: true });
  writeFileSync(join(clientDist, 'index.html'), '<h1>game</h1>', 'utf8');
  writeFileSync(join(dataDir, 'playfood.config.txt'),
    'PANEL_ENABLED = yes\nPANEL_SECRET = sec\n', 'utf8');
  writeFileSync(join(dataDir, 'users.txt'), 'a@b.gr : kodikos\n', 'utf8');
  return { dataDir, clientDist };
}

test('μία θύρα σερβίρει παιχνίδι, api και panel', async () => {
  const f = await buildServer(setup());

  assert.equal((await f.inject({ method: 'GET', url: '/' })).statusCode, 200, 'το παιχνίδι');
  assert.equal((await f.inject({ method: 'GET', url: '/api/config' })).statusCode, 200, 'το api');
  assert.equal((await f.inject({ method: 'GET', url: '/panel' })).statusCode, 200, 'το panel');

  await f.close();
});

test('το users.txt κλειδώνεται μόνο του στην εκκίνηση', async () => {
  const s = setup();
  const f = await buildServer(s);
  const { readFileSync } = await import('node:fs');
  const after = readFileSync(join(s.dataDir, 'users.txt'), 'utf8');
  assert.equal(after.includes('kodikos'), false, 'ο καθαρός κωδικός έπρεπε να έχει φύγει');
  assert.ok(after.includes('scrypt$'));
  await f.close();
});

test('δεν καταγράφεται ποτέ IP ή headers στα logs', async () => {
  const f = await buildServer(setup());
  assert.deepEqual(f.initialConfig.logger?.serializers?.req?.() ?? {}, {});
  await f.close();
});

// Το countToday και τα ημερήσια φίλτρα βασίζονται στο process.env.TZ. Μέχρι το
// Task 2 αυτή η εξάρτηση υπήρχε μόνο ως σχόλιο — κανένας κώδικας δεν την έγραφε,
// οπότε το «σήμερα» ακολουθούσε τη ζώνη του μηχανήματος αντί του σχολείου και
// events κοντά στα μεσάνυχτα προσμετρούνταν σιωπηλά σε λάθος μέρα.
test('η ζώνη ώρας του config εφαρμόζεται ΟΝΤΩΣ στη διεργασία', async () => {
  const s = setup();
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(s.dataDir, 'playfood.config.txt'),
    'PANEL_ENABLED = yes\nPANEL_SECRET = sec\nTIMEZONE = Europe/Lisbon\n', 'utf8');

  const f = await buildServer(s);
  assert.equal(process.env.TZ, 'Europe/Lisbon',
    'το buildServer πρέπει να θέτει το process.env.TZ ΠΡΙΝ από οποιαδήποτε πράξη στη βάση');
  await f.close();
});

// Το @fastify/static δεν πετάει σφάλμα όταν λείπει ο φάκελος-ρίζα — μόνο
// καταγράφει προειδοποίηση, που σε παραγωγή (logger level 'error') εξαφανίζεται
// εντελώς. Χωρίς αυτόν τον έλεγχο ένας server χωρίς game build θα ξεκινούσε
// κανονικά και θα γύριζε 404 παντού, χωρίς κανένα ίχνος στα logs.
test('λείπει το build του παιχνιδιού → buildServer αρνείται να ξεκινήσει με μήνυμα που ονομάζει το path', async () => {
  const s = setup();
  const missingDist = join(s.dataDir, 'dist-den-xtistike');

  await assert.rejects(
    buildServer({ dataDir: s.dataDir, clientDist: missingDist }),
    (err) => {
      assert.ok(err.message.includes(missingDist), 'το μήνυμα πρέπει να ονομάζει το ακριβές path');
      assert.match(err.message, /npm run build/, 'το μήνυμα πρέπει να λέει πώς να φτιαχτεί το build');
      return true;
    }
  );
});

test('άγνωστο μη-API path σερβίρει το index.html του παιχνιδιού (SPA fallback)', async () => {
  const f = await buildServer(setup());
  const res = await f.inject({ method: 'GET', url: '/kati/pou/den/yparxei' });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('<h1>game</h1>'), 'πρέπει να σερβίρει το index.html ΤΟΥ ΠΑΙΧΝΙΔΙΟΥ, όχι κάτι άλλο');
  await f.close();
});

test('άγνωστο API path γυρίζει JSON 404 (όχι το index.html)', async () => {
  const f = await buildServer(setup());
  const res = await f.inject({ method: 'GET', url: '/api/den-yparxei-tetoio' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(JSON.parse(res.body), { error: 'not found' });
  await f.close();
});

for (const url of [
  '/assets/missing.js',
  '/assets/missing.css?v=1',
  '/assets/missing-without-extension',
  '/assets',
  '/source.html?src=missing',
  '/missing.png',
  '/nested/missing%2Esvg',
  '/panel/missing.js',
  '/panel/missing-page',
]) {
  test(`missing static resource ${url} returns 404 instead of the game`, async () => {
    const f = await buildServer({ ...setup(), loggerLevel: 'silent' });
    try {
      const res = await f.inject({ url });
      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.json(), { error: 'not found' });
    } finally { await f.close(); }
  });
}

test('extensionless GET and HEAD navigation retain the game fallback, including query strings', async () => {
  const f = await buildServer({ ...setup(), loggerLevel: 'silent' });
  try {
    const res = await f.inject({ url: '/mission/replay?source=source.html' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, '<h1>game</h1>');
    const head = await f.inject({ method: 'HEAD', url: '/mission/replay' });
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, '');
  } finally { await f.close(); }
});

test('a missing POST route does not return the game HTML', async () => {
  const f = await buildServer({ ...setup(), loggerLevel: 'silent' });
  try {
    const res = await f.inject({ method: 'POST', url: '/mission/replay' });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: 'not found' });
  } finally { await f.close(); }
});

test('existing game files and panel pages keep their static responses', async () => {
  const fixture = setup();
  mkdirSync(join(fixture.clientDist, 'assets'));
  writeFileSync(join(fixture.clientDist, 'assets', 'game.js'), 'const game = true;');
  writeFileSync(join(fixture.clientDist, 'source.html'), '<h1>source</h1>');
  const f = await buildServer({ ...fixture, loggerLevel: 'silent' });
  try {
    const script = await f.inject({ url: '/assets/game.js?v=1' });
    assert.equal(script.statusCode, 200);
    assert.equal(script.body, 'const game = true;');
    assert.match(script.headers['content-type'], /javascript/);
    const source = await f.inject({ url: '/source.html?src=fixture' });
    assert.equal(source.statusCode, 200);
    assert.equal(source.body, '<h1>source</h1>');
    const panel = await f.inject({ url: '/panel/' });
    assert.equal(panel.statusCode, 200);
    assert.doesNotMatch(panel.body, /<h1>game<\/h1>/);
    const note = await f.inject({ url: '/panel/data-collection-en.html' });
    assert.equal(note.statusCode, 200);
    assert.match(note.body, /<html lang="en"/);
  } finally { await f.close(); }
});

// onClose καθάριζε το db handle και το retention timer, αλλά όχι το config
// watcher ή το session sweeper — και τα δύο timers έμεναν ζωντανά (αν και
// unref'd, άρα δεν κρεμούσαν τη διεργασία, απλώς η καθαριότητα ήταν ατελής).
test('το close() σταματάει και τον config watcher και τον session sweeper', async () => {
  startSessionSweeper(); // εγγύηση ότι τρέχει πριν το buildServer, ανεξάρτητα τι άφησε πίσω του προηγούμενο test

  const f = await buildServer(setup());
  assert.equal(__configWatcherRunningForTests(), true, 'ο watcher έπρεπε να τρέχει μετά το buildServer');
  assert.equal(__sessionSweeperRunningForTests(), true, 'ο sweeper έπρεπε να τρέχει (εκκινήθηκε παραπάνω)');

  await f.close();

  assert.equal(__configWatcherRunningForTests(), false, 'ο watcher έπρεπε να έχει σταματήσει στο close()');
  assert.equal(__sessionSweeperRunningForTests(), false, 'ο sweeper έπρεπε να έχει σταματήσει στο close()');
});
