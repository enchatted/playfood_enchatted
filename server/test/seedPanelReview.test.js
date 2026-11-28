import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, insertEvent } from '../src/db.js';
import { computeStats } from '../src/stats.js';
import { buildReviewEvents, seedReviewEvents } from '../scripts/seed-panel-review.js';

test('review dataset covers all games, languages, outcomes and independent samples', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pf-review-')), 'test.db'));
  try {
    const now = Date.now();
    const rows = buildReviewEvents(now);
    assert.equal(rows.length, 792);
    assert.ok(rows.every(row => row.ts <= now));
    assert.equal(seedReviewEvents(db, now).inserted, 792);
    const stats = computeStats(db);
    assert.equal(stats.overview.learners, 24);
    assert.equal(stats.overview.sessions, 48);
    for (const island of stats.perIsland) for (const game of island.games) {
      assert.equal(game.started, 24);
      assert.equal(game.finished, 20);
      assert.deepEqual(game.outcomes, { passed: 12, failed: 4, unknown: 4 });
      assert.equal(game.starsMeasured, 16);
      assert.equal(game.scoresMeasured, 16);
      assert.equal(game.avgStars, 1.5);
      assert.equal(game.avgScore, 45);
      assert.equal(game.timing.measured, 20);
      assert.equal(game.matchedFinished, 16);
    }
    for (const language of ['en', 'nl', 'el', 'pt']) {
      const filtered = computeStats(db, { language });
      assert.equal(filtered.overview.learners, 6);
      assert.equal(filtered.perIsland[0].games[0].finished, 5);
    }
  } finally { db.close(); }
});

test('review seeding is idempotent and does not modify existing records', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pf-review-')), 'test.db'));
  try {
    const real = { ...buildReviewEvents()[0], learner_id: 'real0001', session_id: 'realvisit' };
    insertEvent(db, real);
    const original = db.prepare('SELECT * FROM events').all();
    seedReviewEvents(db);
    assert.equal(seedReviewEvents(db, Date.now() + 86400000).inserted, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM events').get().n, 793);
    assert.deepEqual(db.prepare("SELECT * FROM events WHERE learner_id='real0001'").all(), original);
  } finally { db.close(); }
});

test('CLI dry run is read-only and apply backs up the original database before insertion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-review-cli-'));
  const db = openDb(join(dir, 'playfood.db'));
  insertEvent(db, { ...buildReviewEvents()[0], learner_id: 'original', session_id: 'originalvisit' });
  db.close();
  const run = arg => spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/seed-panel-review.js', import.meta.url)), arg],
    { env: { ...process.env, DATA_DIR: dir }, encoding: 'utf8' });
  assert.equal(run('--dry-run').status, 0);
  const count = file => { const d = new Database(file, { readonly: true }); try { return d.prepare('SELECT count(*) n FROM events').get().n; } finally { d.close(); } };
  assert.equal(count(join(dir, 'playfood.db')), 1);
  const applied = run('--apply');
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(count(join(dir, 'playfood.db')), 793);
  const backups = readdirSync(dir).filter(name => name.startsWith('before-panel-review-'));
  assert.equal(backups.length, 1);
  assert.equal(count(join(dir, backups[0], 'playfood.db')), 1);
  assert.equal(run('--apply').status, 0);
  assert.equal(count(join(dir, 'playfood.db')), 793);
  assert.equal(readdirSync(dir).filter(name => name.startsWith('before-panel-review-')).length, 1);
});

test('partial review data causes a refusal rather than duplication or deletion', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'pf-review-partial-')), 'test.db'));
  try {
    insertEvent(db, buildReviewEvents()[0]);
    assert.throws(() => seedReviewEvents(db), /Partial review dataset/);
    assert.equal(db.prepare('SELECT count(*) n FROM events').get().n, 1);
  } finally { db.close(); }
});
