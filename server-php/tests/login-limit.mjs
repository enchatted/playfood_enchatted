// Real PHP API regression for the staff login limit. No game build, browser or installed data.
// PHP_BINARY=/opt/homebrew/bin/php node server-php/tests/login-limit.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const php = process.env.PHP_BINARY || 'php';
const temporary = mkdtempSync(join(tmpdir(), 'playfood-php-login-limit-'));
const publicDir = join(temporary, 'public_html');
const evidence = process.env.LOGIN_LIMIT_QA_OUT ? resolve(process.env.LOGIN_LIMIT_QA_OUT) : null;
const email = 'teacher-login-qa@example.invalid';
// A 72-byte bcrypt fixture also exposes the existing 1024-byte login guard.
const password = 'Synthetic-PHP-login-QA-'.padEnd(72, 'x');
const cases = [];
let server;
let serverClosed;
let log = '';
let database;

function sql(statement, parameters = []) {
  return JSON.parse(execFileSync(php, ['-r', `
    $db = new PDO('sqlite:' . $argv[1], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA busy_timeout=5000');
    $query = $db->prepare($argv[2]);
    $query->execute(json_decode($argv[3], true, 32, JSON_THROW_ON_ERROR));
    echo json_encode($query->fetchAll(PDO::FETCH_ASSOC), JSON_THROW_ON_ERROR);
  `, database, statement, JSON.stringify(parameters)], { encoding: 'utf8' }));
}

const limits = () => sql('SELECT bucket,n FROM request_limits ORDER BY bucket');
const resetLimits = () => sql('DELETE FROM request_limits');
const passed = name => { cases.push(name); console.log(`PASS: ${name}`); };

try {
  mkdirSync(join(publicDir, 'api'), { recursive: true });
  cpSync(join(repo, 'server-php/public/setup.php'), join(publicDir, 'setup.php'));
  // The override allows a negative control using a saved API file, without mutating source.
  cpSync(resolve(process.env.LOGIN_LIMIT_API_FILE || join(repo, 'server-php/public/api/index.php')), join(publicDir, 'api/index.php'));
  cpSync(join(repo, 'server-php/src'), join(publicDir, 'api/lib'), { recursive: true });
  writeFileSync(join(publicDir, 'api/lib/default-codes.json'), '[]\n');
  const version = execFileSync(php, ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8' });
  console.log(`PHP ${version}; fresh synthetic installation; loopback ephemeral port.`);
  const port = await new Promise((resolvePort, reject) => {
    const listener = createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const selected = listener.address().port;
      listener.close(error => error ? reject(error) : resolvePort(selected));
    });
  });
  assert.ok(port !== 3000 && port !== 4000);
  const base = `http://127.0.0.1:${port}`;
  // The built-in server has no TLS; this test-only prepend marks a request as HTTPS when it carries the header.
  const httpsShim = join(temporary, 'https-shim.php');
  writeFileSync(httpsShim, "<?php if (($_SERVER['HTTP_X_TEST_HTTPS'] ?? '') === '1') $_SERVER['HTTPS'] = 'on';\n");
  server = spawn(php, ['-d', `auto_prepend_file=${httpsShim}`, '-S', `127.0.0.1:${port}`, '-t', publicDir], { stdio: ['ignore', 'pipe', 'pipe'] });
  serverClosed = new Promise(resolveClosed => server.once('close', resolveClosed));
  let startupError;
  server.once('error', error => { startupError = error; });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { log += chunk; });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw new Error(`PHP exited during startup: ${log}`);
    try {
      const response = await fetch(`${base}/setup.php`, { headers: { 'X-Test-HTTPS': '1' }, signal: AbortSignal.timeout(5000) });
      await response.text();
      ready = response.status === 200;
      if (ready) break;
    } catch {}
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  assert.equal(ready, true, 'isolated PHP server starts');
  const keyDir = readdirSync(temporary).find(name => name.startsWith('playfood-private-'));
  assert.ok(keyDir, 'the first setup visit created private storage');
  const key = readFileSync(join(temporary, keyDir, 'installation-key.txt'), 'utf8').trim();
  const setup = await fetch(`${base}/setup.php`, {
    method: 'POST', headers: { 'X-Test-HTTPS': '1' }, signal: AbortSignal.timeout(5000),
    body: new URLSearchParams({ key, email, password, timezone: 'Europe/Athens', tracking: 'on' }),
  });
  assert.match(await setup.text(), /Installation complete/);
  const privateName = readdirSync(temporary).find(name => name.startsWith('playfood-private-'));
  assert.ok(privateName, 'setup created fresh private storage outside the document root');
  database = join(temporary, privateName, 'playfood.db');
  const login = async body => {
    const response = await fetch(`${base}/api/index.php?route=login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: await response.json() };
  };
  const expectStatus = async (body, expected, message) => {
    const response = await login(body);
    assert.equal(response.status, expected, message);
    if (expected === 200) assert.match(response.body.token, /^[a-f0-9]{48}$/);
    if (expected === 401) assert.deepEqual(response.body, { error: 'wrong email or password' });
    if (expected === 429) assert.deepEqual(response.body, { error: 'Too many attempts; wait one minute' });
    return response;
  };

  // Reverting to one shared bucket must fail here with actual=429, expected=200.
  for (let attempt = 0; attempt < 30; attempt++) {
    await expectStatus({ email: 'attacker@qa.invalid', password: 'wrong-password-123' }, 401);
  }
  await expectStatus({ email, password }, 200, 'T08-I40: unknown-email flood must not exhaust the teacher quota');
  await expectStatus({ email: 'attacker@qa.invalid', password }, 429);
  assert.deepEqual(limits(), [{ bucket: 'login', n: 1 }, { bucket: 'login:unknown', n: 31 }]);
  passed('T08-I40: 30 unknown-email failures -> teacher 200; unknown attempt 31 -> 429');

  resetLimits();
  for (let attempt = 0; attempt < 30; attempt++) await expectStatus({ email, password: 'wrong-password-123' }, 401);
  await expectStatus({ email, password }, 429, 'knowing the configured email can still exhaust its quota');
  await expectStatus({ email: 'unknown@qa.invalid', password }, 401);
  passed('30 configured-email password guesses -> correct password 429; unknown bucket remains separate');

  resetLimits();
  await expectStatus({ email, password }, 200);
  for (let attempt = 0; attempt < 64; attempt++) {
    await expectStatus({ email: `unknown-${attempt}@qa.invalid`, password }, attempt < 30 ? 401 : 429);
  }
  assert.deepEqual(limits(), [{ bucket: 'login', n: 1 }, { bucket: 'login:unknown', n: 64 }]);
  passed('64 distinct unknown addresses create only the two fixed buckets and share the same limit');

  resetLimits();
  const unknownBodies = [
    { password }, ...[null, [], {}, 42, true, '', ' \t\r\n ', email.toUpperCase(), ' attacker@qa.invalid '].map(value => ({ email: value, password })),
  ];
  for (const body of unknownBodies) await expectStatus(body, 401);
  await expectStatus({ email: ` \t${email}\r\n `, password }, 200);
  assert.deepEqual(limits(), [{ bucket: 'login', n: 1 }, { bucket: 'login:unknown', n: 10 }]);
  passed('missing/malformed and differently cased emails share unknown quota; exact configured email is trimmed');

  resetLimits();
  for (const value of [undefined, null, [], {}, 42, true]) await expectStatus({ email, password: value }, 401);
  await expectStatus({ email, password: password.padEnd(1025, 'x') }, 401);
  await expectStatus({ email, password: password + 'é'.repeat(477) }, 401);
  await expectStatus({ email, password: password.padEnd(1024, 'x') }, 200);
  assert.deepEqual(limits(), [{ bucket: 'login', n: 9 }]);
  passed('non-string and >1024-byte passwords stay rejected; existing 1024-byte/password_verify behaviour is preserved');

  resetLimits();
  for (let attempt = 0; attempt < 30; attempt++) await expectStatus({ email, password }, 200);
  await expectStatus({ email, password }, 429);
  assert.deepEqual(limits(), [{ bucket: 'login', n: 31 }]);
  passed('successful logins still consume all 30 configured-email attempts');

  resetLimits();
  sql("INSERT INTO request_limits(bucket,n,expires) VALUES ('login',30,CAST(strftime('%s','now') AS INTEGER)+60)");
  await expectStatus({ email, password }, 429, 'pre-existing login bucket still constrains the configured account');
  await expectStatus({ email: 'unknown@qa.invalid', password }, 401);
  sql("UPDATE request_limits SET n=30, expires=CAST(strftime('%s','now') AS INTEGER)+60 WHERE bucket='login:unknown'");
  await expectStatus({ email: 'another@qa.invalid', password }, 429);
  sql("UPDATE request_limits SET expires=CAST(strftime('%s','now') AS INTEGER)-1");
  await expectStatus({ email, password }, 200);
  await expectStatus({ email: 'unknown@qa.invalid', password }, 401);
  assert.deepEqual(limits(), [{ bucket: 'login', n: 1 }, { bucket: 'login:unknown', n: 1 }]);
  const lifetime = sql("SELECT expires-CAST(strftime('%s','now') AS INTEGER) AS seconds FROM request_limits");
  assert.ok(lifetime.every(row => row.seconds >= 58 && row.seconds <= 60));
  passed('existing login state survives; both 60-second buckets reset after fixture-only expiry without sleeping');
  console.log(`All ${cases.length} focused PHP login-limit checks passed.`);
} catch (error) {
  console.error(log.slice(-3000));
  throw error;
} finally {
  if (server) {
    server.kill('SIGTERM');
    await serverClosed;
  }
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, 'php-server.log'), log);
    writeFileSync(join(evidence, 'completed-checks.json'), `${JSON.stringify(cases, null, 2)}\n`);
  }
  rmSync(temporary, { recursive: true, force: true });
}
