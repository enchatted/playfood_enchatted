// Real Node/PHP CSV routes over a temporary database; no HTTP/browser process.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Fastify from '../../server/node_modules/fastify/fastify.js';
import { openDb, insertEvent } from '../../server/src/db.js';
import { createSession } from '../../server/src/auth.js';
import { __setConfigForTests } from '../../server/src/config.js';
import { computeStats } from '../../server/src/stats.js';
import panelApiRoutes from '../../server/src/routes/panelApi.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'playfood-export-parity-')));
const documentRoot = join(dir, 'webroot');
const privateDir = join(dir, 'playfood-private-' + createHash('sha256').update(documentRoot).digest('hex').slice(0, 12));
mkdirSync(documentRoot);
mkdirSync(privateDir);
cpSync(join(root, 'public/api'), join(documentRoot, 'api'), { recursive: true });
cpSync(join(root, 'src'), join(documentRoot, 'api/lib'), { recursive: true });
const dbFile = join(privateDir, 'playfood.db');
const db = openDb(dbFile);
const phpToken = 'a'.repeat(48);
db.exec('CREATE TABLE panel_sessions(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL)');
db.prepare('INSERT INTO panel_sessions VALUES(?,?,?)').run(
  createHash('sha256').update(phpToken).digest('hex'), 'teacher@example.org', Math.floor(Date.now() / 1000) + 1800
);
__setConfigForTests({ PANEL_ENABLED: true });
const f = Fastify();
f.register(panelApiRoutes, { db, dbFile, usersFile: join(dir, 'unused-users.txt'), prefix: '/api' });
const nodeToken = createSession('teacher@example.org');
const runner = join(root, 'tests/export-runner.php');
let checked = 0;
const columns = ['ts', 'learner_id', 'session_id', 'type', 'island', 'game', 'score', 'stars',
  'duration_s', 'progress', 'language', 'returning', 'attempt_id', 'passed', 'timing_version',
  'active_s', 'learning_s', 'paused_s', 'hidden_s', 'idle_s', 'other_s', 'local_time', 'timestamp_utc', 'row_scope'];

function parseCsv(body) {
  const lines = body.trim().split(/\r?\n/);
  assert.equal(lines.shift(), 'sep=,');
  // Fixture values contain no commas or quotes; PHP quotes timestamps with spaces.
  const cells = line => line.split(',').map(value => value.replace(/^"|"$/g, ''));
  const header = cells(lines.shift());
  return { header, rows: lines.map(line => Object.fromEntries(cells(line).map((value, i) => [header[i], value]))) };
}

async function compare(filters, timezone, expectedRows) {
  process.env.TZ = timezone;
  writeFileSync(join(privateDir, 'installation.json'), JSON.stringify({
    timezone, enabled: true, retention_months: 120,
  }));
  const actual = parseCsv(execFileSync('php', [runner, documentRoot, phpToken, JSON.stringify(filters)], {
    env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8',
  }));
  const res = await f.inject({ url: '/api/export.csv?' + new URLSearchParams(filters),
    headers: { authorization: `Bearer ${nodeToken}` } });
  assert.equal(res.statusCode, 200);
  const node = parseCsv(res.body);
  const summary = rows => rows.map(row => [Number(row.ts), row.row_scope]);
  // Explicit policy expectations prevent two identically wrong runtimes passing parity.
  assert.deepEqual(summary(actual.rows), expectedRows, `PHP ${timezone} ${JSON.stringify(filters)}`);
  assert.deepEqual(summary(node.rows), expectedRows, `Node ${timezone} ${JSON.stringify(filters)}`);
  assert.deepEqual(actual.header, columns, 'PHP appends row_scope after the complete R2 header');
  assert.deepEqual(node, actual, `CSV parity ${timezone} ${JSON.stringify(filters)}`);
  const cohort = new Set(node.rows.filter(row => row.row_scope === 'filtered')
    .map(row => JSON.stringify([row.learner_id, row.session_id])));
  assert.equal(cohort.size, computeStats(db, filters).overview.sessions);
  checked++;
}

try {
  const dateFilter = { from: '2026-09-02', to: '2026-09-02', language: 'el' };
  const add = (ts, overrides = {}) => insertEvent(db, { ts, learner_id: 'exportkid', session_id: 'selectedvisit',
    type: 'game_finish', island: 'foodwaste', game: 'FridgeManager', score: -3, stars: 0,
    duration_s: 0, progress: 0, language: 'el', returning: null, ...overrides });
  for (const timezone of ['Europe/Athens', 'America/New_York', 'UTC']) {
    process.env.TZ = timezone;
    const ts = (day, hour, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();
    db.exec('DELETE FROM events');
    add(ts(1, 12));
    add(ts(2, 12), { type: 'session_end', language: null });
    await compare(dateFilter, timezone, []);
    db.exec('DELETE FROM events');
    add(ts(1, 23, 57), { type: 'session_start', language: 'en', returning: 1 });
    add(ts(1, 23, 58), { type: 'hero_chosen', language: null, game: 'braid' });
    add(ts(1, 23, 59));
    add(ts(2, 0, 1), { attempt_id: 'selectedattempt', passed: 0, timing_version: 1,
      active_s: 0, learning_s: 0, paused_s: 0, hidden_s: 0, idle_s: 0, other_s: 0 });
    add(ts(2, 0, 2), { type: 'session_end', duration_s: 250 });
    add(ts(2, 1), { language: 'pt', type: 'game_start' });
    add(ts(2, 2), { language: null, type: 'game_start' });
    add(ts(2, 3), { language: null, type: 'island_enter' });
    add(ts(2, 4), { language: null, type: 'phygital_redeem', game: 'SAVEIT' });
    add(ts(2, 5), { language: null, type: 'session_start', session_id: 'othervisit' });
    add(ts(2, 6), { language: null, type: 'session_start', learner_id: 'otherkid' });
    add(ts(2, 7), { session_id: 'missingstart' });
    add(ts(3, 0, 1), { type: 'session_end', language: 'pt', duration_s: 500 });
    add(ts(3, 0, 2));
    const selected = [
      [ts(1, 23, 57), 'visit_context'], [ts(1, 23, 58), 'visit_context'],
      [ts(2, 0, 1), 'filtered'], [ts(2, 0, 2), 'filtered'], [ts(2, 7), 'filtered'],
      [ts(3, 0, 1), 'visit_context'],
    ];
    await compare(dateFilter, timezone, selected);
    await compare({ from: '2026-09-02', to: '2026-09-02' }, timezone,
      [ts(2, 0, 1), ts(2, 0, 2), ...[1, 2, 3, 4, 5, 6, 7].map(hour => ts(2, hour))].map(value => [value, 'filtered']));
    await compare({ from: '2040-01-01', language: 'el' }, timezone, []);
    const all = db.prepare('SELECT ts FROM events ORDER BY ts,id').all().map(row => [row.ts, 'filtered']);
    await compare({}, timezone, all);
  }
  console.log(`PHP/Node export parity passed: ${checked} cases, 3 timezones, real CLI/PDO routes, no HTTP server`);
} finally {
  await f.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
