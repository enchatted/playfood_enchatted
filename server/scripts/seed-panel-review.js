// Additive review data for the normal panel. No separate demo view or reset route.
import Database from 'better-sqlite3';
import { mkdtempSync, chmodSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { insertEvent } from '../src/db.js';
import { LANGS, ISLAND_GAMES, validateEvent } from '../src/validate.js';
import { loadConfig } from '../src/config.js';

export const REVIEW_PREFIX = 'pfReview202609v1';
const DAY = 86400000;

export function buildReviewEvents(now = Date.now()) {
  const rows = [];
  for (const language of LANGS) for (let scenario = 0; scenario < 6; scenario++) {
    const learner = `${REVIEW_PREFIX}${language}${scenario}`;
    const first = now - 29 * DAY - 3600000;
    const start = now - [0, 1, 3, 6, 13, 20][scenario] * DAY - 5 * 3600000;
    function add(ts, session, type, extra = {}) {
      const checked = validateEvent({ learner_id: learner, session_id: `${learner}${session}`, language, type, ...extra });
      if (!checked.ok) throw new Error(`Invalid review event: ${checked.reason}`);
      // Historical timestamps are set only by this offline seed, never the public API.
      rows.push({ ...checked.value, ts });
    }
    add(first, 'a', 'session_start', { returning: false });
    add(first + 120000, 'a', 'session_end', { duration_s: 120 });
    add(start, 'b', 'session_start', { returning: true });
    add(start + 10000, 'b', 'hero_chosen', { hero: 'pigtails' });
    let t = start + 20000, gameIndex = 0;
    for (const [island, games] of Object.entries(ISLAND_GAMES)) {
      add(t, 'b', 'island_enter', { island });
      t += 10000;
      for (const game of games) {
        const context = { island, game, attempt_id: scenario === 5 ? null : `${learner}g${gameIndex}` };
        add(t, 'b', 'game_start', context);
        t += 600000;
        const timing = scenario === 5 ? {} : { timing_version: 1, active_s: 180, learning_s: 120,
          paused_s: 30, hidden_s: 30, idle_s: 180, other_s: 60 };
        add(t, 'b', scenario === 4 ? 'game_abandon' : 'game_finish', {
          ...context, ...timing, duration_s: 600,
          progress: scenario === 4 ? 10 + gameIndex * 5 : 100,
          ...(scenario < 4 ? { stars: scenario, score: scenario * 30, passed: scenario > 0 } : {}),
        });
        t += 10000;
        gameIndex++;
      }
    }
    add(t, 'b', 'session_end', { duration_s: (t - start) / 1000, returning: true });
  }
  return rows;
}

function existingReviewCount(db) {
  return db.prepare('SELECT count(*) n FROM events WHERE substr(learner_id,1,?)=?')
    .get(REVIEW_PREFIX.length, REVIEW_PREFIX).n;
}

export function seedReviewEvents(db, now = Date.now()) {
  const rows = buildReviewEvents(now);
  return db.transaction(() => {
    const existing = existingReviewCount(db);
    if (existing === rows.length) return { inserted: 0, existing };
    if (existing) throw new Error('Partial review dataset exists. No rows changed; inspect before retrying.');
    for (const row of rows) insertEvent(db, row);
    if (existingReviewCount(db) !== rows.length) throw new Error('Review count mismatch; transaction rolled back.');
    return { inserted: rows.length, existing: 0 };
  }).immediate();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--apply', '--dry-run'].includes(arg)) || args.length > 1) {
    throw new Error('Usage: node scripts/seed-panel-review.js [--dry-run | --apply]');
  }
  const dataDir = resolve(process.env.DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '..'));
  process.env.TZ = loadConfig(join(dataDir, 'playfood.config.txt')).TIMEZONE;
  const dbFile = join(dataDir, 'playfood.db');
  const apply = args.includes('--apply');
  const db = new Database(dbFile, { fileMustExist: true, readonly: !apply });
  try {
    const existing = existingReviewCount(db);
    console.log(`Database: ${dbFile}\nReview ID prefix: ${REVIEW_PREFIX}\nExisting review rows: ${existing}`);
    console.log('Dataset: 792 events, 24 profiles, 48 visits, all 12 games and 4 languages.');
    console.log('These synthetic rows appear in normal statistics AND exports alongside existing data.');
    if (!apply) { console.log('DRY RUN: nothing changed. Use --apply to back up and insert.'); return; }
    if (existing === buildReviewEvents().length) { console.log('Already inserted; nothing changed.'); return; }
    if (existing) throw new Error('Partial review dataset exists. Nothing changed.');
    const backupDir = mkdtempSync(join(dataDir, 'before-panel-review-'));
    const backup = join(backupDir, 'playfood.db');
    await db.backup(backup);
    chmodSync(backup, 0o600);
    console.log(`Backup: ${backup}`);
    const result = seedReviewEvents(db);
    console.log(`Inserted ${result.inserted} review events. Reload the panel; no restart required.`);
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
