/**
 * Αποθήκευση — ένα αρχείο SQLite, καμία διεργασία βάσης, κανένας κωδικός.
 * Ο πίνακας είναι ΗΜΕΡΟΛΟΓΙΟ: μόνο προσθέτουμε, ποτέ δεν διορθώνουμε παλιά
 * γραμμή. Η «μία εγγραφή ανά παιδί» φτιάχνεται κατά την ΑΝΑΓΝΩΣΗ (stats.js).
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { TIMING_FIELDS } from './validate.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  learner_id TEXT    NOT NULL,
  session_id TEXT    NOT NULL,
  type       TEXT    NOT NULL,
  island     TEXT,
  game       TEXT,
  score      INTEGER,
  stars      INTEGER,
  duration_s INTEGER,
  progress   INTEGER,
  language   TEXT,
  "returning"  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_ts      ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_type    ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_learner ON events(learner_id);
`;

export function openDb(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');   // ταυτόχρονη ανάγνωση ενώ γράφουμε
  db.pragma('synchronous = NORMAL');
  db.pragma('secure_delete = ON'); // purged rows are zeroed, not left readable in free pages
  db.exec(SCHEMA);
  db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info(events)').all();
    for (const key of ['timing_version', ...TIMING_FIELDS]) {
      if (!columns.some(column => column.name === key)) db.exec(`ALTER TABLE events ADD COLUMN ${key} INTEGER`);
    }
    if (!columns.some(column => column.name === 'attempt_id')) {
      db.exec('ALTER TABLE events ADD COLUMN attempt_id TEXT');
    }
    if (!columns.some(column => column.name === 'passed')) {
      db.exec('ALTER TABLE events ADD COLUMN passed INTEGER CHECK (passed IN (0,1) OR passed IS NULL)');
    }
    // One start and one terminal event per attempt. Legacy rows stay untouched.
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_attempt
      ON events(learner_id, session_id, attempt_id,
        CASE WHEN type IN ('game_finish','game_abandon') THEN 'terminal' ELSE type END)
      WHERE attempt_id IS NOT NULL`);
  })();
  return db;
}

const INSERT = `INSERT INTO events
  (ts, learner_id, session_id, type, island, game, score, stars, duration_s, progress, language, "returning", attempt_id, passed, timing_version, ${TIMING_FIELDS.join(', ')})
  VALUES (@ts, @learner_id, @session_id, @type, @island, @game, @score, @stars, @duration_s, @progress, @language, @returning, @attempt_id, @passed, @timing_version, ${TIMING_FIELDS.map(key => '@' + key).join(', ')})
  ON CONFLICT DO NOTHING`;

export function insertEvent(db, ev) {
  db.prepare(INSERT).run({ attempt_id: null, passed: null, timing_version: null,
    ...Object.fromEntries(TIMING_FIELDS.map(key => [key, null])), ...ev });
}

export function purgeOlderThan(db, months) {
  // Ημερολογιακή αφαίρεση μηνών (όχι σταθερά 30 μέρες/μήνα) — 24 μήνες = 730-731
  // μέρες, όχι 720. Στο άκρο μήνα (π.χ. 31 Μαρτίου - 1 μήνας) το Date κυλά στον
  // επόμενο μήνα (π.χ. 3 Μαρτίου γίνεται 3 Φεβρουαρίου κανονικά, αλλά 31 Μαρτίου
  // - 1 μήνας δίνει 3 Μαρτίου): αποδεκτό εδώ γιατί conservative — κρατάει λίγες
  // παραπάνω μέρες αντί να σβήσει νωρίτερα από την υποσχόμενη περίοδο.
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  const cutoff = d.getTime();
  const removed = db.prepare('DELETE FROM events WHERE ts < ?').run(cutoff).changes;
  if (removed) db.pragma('wal_checkpoint(TRUNCATE)'); // old copies in the WAL file go too
  return removed;
}

export function countToday(db) {
  // Υπολογισμός του local start-of-day σε JS ώστε το query να μείνει sargable
  // (SEARCH με το idx_events_ts) αντί να τυλίγει το ts σε date(...) στο SQL, που
  // ακύρωνε το index και σάρωνε ολόκληρο τον πίνακα. Το process.env.TZ ορίζεται
  // από το TIMEZONE του config στο startup, άρα το JS Date συμφωνεί με το
  // 'localtime' που χρησιμοποιούσε παλιότερα το SQLite.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return db.prepare('SELECT count(*) c FROM events WHERE ts >= ?').get(start.getTime()).c;
}

export function closeDb(db) {
  db.close();
}
