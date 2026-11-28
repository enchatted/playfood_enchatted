import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildServer } from '../src/app.js';
import { loadConfig } from '../src/config.js';

function fixture(extraConfig = '') {
  const dataDir = mkdtempSync(join(tmpdir(), 'pf-hosting-settings-'));
  const clientDist = join(dataDir, 'dist');
  mkdirSync(clientDist);
  writeFileSync(join(clientDist, 'index.html'), '<h1>game</h1>');
  writeFileSync(join(dataDir, 'users.txt'), 'teacher@example.test : test-password\n');
  writeFileSync(join(dataDir, 'playfood.config.txt'),
    'PANEL_ENABLED=yes\nPANEL_SECRET=fixture-secret\n' + extraConfig);
  return { dataDir, clientDist, loggerLevel: 'warn' };
}

const event = { learner_id: 'browser123', session_id: 'visit123', type: 'session_start', language: 'en' };
const ingest = (app, remoteAddress, forwarded) => app.inject({ method: 'POST', url: '/api/ev',
  remoteAddress, headers: { 'x-pf-secret': 'fixture-secret', 'x-forwarded-for': forwarded }, payload: event });

test('local defaults ignore spoofed forwarded addresses when limiting event collection', async () => {
  const app = await buildServer(fixture());
  try {
    for (let i = 0; i < 120; i++) {
      assert.equal((await ingest(app, '192.0.2.180', `198.51.100.${i}`)).statusCode, 204);
    }
    assert.equal((await ingest(app, '192.0.2.180', '203.0.113.222')).statusCode, 429);
  } finally { await app.close(); }
});

test('local defaults do not reflect arbitrary CORS origins', async () => {
  const app = await buildServer(fixture());
  try {
    const response = await app.inject({ url: '/api/config', headers: { origin: 'https://other.example' } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    assert.equal((await app.inject('/api/config')).json().tracking, true);
  } finally { await app.close(); }
});

test('explicit hosting proxy and CORS settings retain legitimate separate browser limits', async () => {
  const app = await buildServer(fixture('TRUST_PROXY=127.0.0.1\nCORS_ORIGINS=https://game.example\n'));
  try {
    for (let i = 0; i < 121; i++) {
      assert.equal((await ingest(app, '127.0.0.1', `198.51.100.${i}`)).statusCode, 204);
    }
    for (let i = 0; i < 120; i++) await ingest(app, '127.0.0.1', '203.0.113.200');
    assert.equal((await ingest(app, '127.0.0.1', '203.0.113.200')).statusCode, 429);
    const preflight = await app.inject({ method: 'OPTIONS', url: '/api/ev', headers: {
      origin: 'https://game.example', 'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-pf-secret',
    } });
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], 'https://game.example');
    const denied = await app.inject({ url: '/api/config', headers: { origin: 'https://other.example' } });
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
    // An untrusted direct peer cannot manufacture a new browser bucket.
    for (let i = 0; i < 120; i++) await ingest(app, '192.0.2.181', `203.0.113.${i}`);
    assert.equal((await ingest(app, '192.0.2.181', '203.0.113.222')).statusCode, 429);
  } finally { await app.close(); }
});

test('configuration parses only explicit proxy peers and CORS origin lists', () => {
  const { dataDir } = fixture('TRUST_PROXY=127.0.0.1, ::1\nCORS_ORIGINS=http://localhost:3000, https://game.example\n');
  const cfg = loadConfig(join(dataDir, 'playfood.config.txt'));
  assert.deepEqual(cfg.TRUST_PROXY, ['127.0.0.1', '::1']);
  assert.deepEqual(cfg.CORS_ORIGINS, ['http://localhost:3000', 'https://game.example']);
  const defaults = loadConfig('/missing-playfood-hosting-config.txt');
  assert.equal(defaults.TRUST_PROXY, false);
  assert.deepEqual(defaults.CORS_ORIGINS, []);
});

test('launcher can request quiet warn logging without silencing errors', async () => {
  const app = await buildServer({ ...fixture(), loggerLevel: 'warn' });
  try {
    assert.equal(app.log.level, 'warn');
    assert.equal(app.log.isLevelEnabled('info'), false);
    assert.equal(app.log.isLevelEnabled('warn'), true);
    assert.equal(app.log.isLevelEnabled('error'), true);
  } finally { await app.close(); }
});

test('CSV preserves epoch ts and adds a matching human-readable UTC timestamp', async () => {
  const app = await buildServer(fixture());
  try {
    assert.equal((await ingest(app, '192.0.2.182', '203.0.113.10')).statusCode, 204);
    const login = await app.inject({ method: 'POST', url: '/api/login',
      payload: { email: 'teacher@example.test', password: 'test-password' } });
    const token = login.json().token;
    assert.ok(token);
    const csv = (await app.inject({ url: '/api/export.csv', headers: { authorization: `Bearer ${token}` } })).body;
    const [sep, header, row] = csv.split('\n').map(line => line.split(','));
    assert.deepEqual(sep, ['sep=', '']);
    assert.equal(header[0], 'ts');
    const isoIndex = header.indexOf('timestamp_utc');
    assert.ok(isoIndex > 0);
    assert.equal(row[isoIndex], new Date(Number(row[0])).toISOString());
    assert.equal(row.length, header.length);
  } finally { await app.close(); }
});

test('panel links complete EN and EL data collection notes before staff sign in', async () => {
  const app = await buildServer(fixture());
  try {
    const panel = (await app.inject('/panel')).body;
    for (const language of ['en', 'el']) {
      const path = `/panel/data-collection-${language}.html`;
      assert.ok(panel.includes(path));
      const page = await app.inject(path);
      assert.equal(page.statusCode, 200);
      assert.match(page.body, new RegExp(`<html lang="${language}"`));
      for (const field of ['learner_id', 'session_id', 'attempt_id', 'timing_version',
        'progress', 'active_s', 'learning_s', 'paused_s', 'hidden_s', 'idle_s', 'other_s', 'duration_s']) {
        assert.ok(page.body.includes(field), `${language}: ${field}`);
      }
      assert.ok(page.body.includes('PANEL_ENABLED'));
      assert.ok(page.body.includes('RETENTION_MONTHS'));
      assert.ok(page.body.includes('SQLite'));
      assert.ok(page.body.includes('24'));
      assert.ok(page.body.includes('playfood-learner'));
      assert.doesNotMatch(page.body, /Google Fonts|fonts\.googleapis/);
    }
    assert.doesNotMatch(panel, /distinct anonymous IDs|Profiles are anonymous IDs/);
  } finally { await app.close(); }
});
