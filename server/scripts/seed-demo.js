/**
 * seed-demo.js — synthetic event fixture for local statistics demonstrations.
 *
 * Σκοπός: έλεγχος των απεικονίσεων με συνθετικά δεδομένα. Παράγει events
 * όπως θα τα έστελνε αληθινό παιχνίδι, απλωμένα σε ~30 μέρες, ώστε funnel /
 * ανά-παιχνίδι / αστέρια / μέσος χρόνος / overview να δείχνουν κανονικά σχήματα.
 *
 * ⚠️  ΨΕΥΤΙΚΑ ΔΕΔΟΜΕΝΑ. Τα learner_id ξεκινούν με "demo" ώστε να ξεχωρίζουν.
 *     Σβήνονται ΜΟΝΟ από εδώ: node scripts/seed-demo.js --clear
 *     (το panel δεν έχει πια κουμπί διαγραφής, ούτε διαδρομή /api/reset).
 *     Ο ζωντανός server συνεχίζει να δέχεται ΚΑΝΟΝΙΚΑ events από πραγματικό
 *     παιχνίδι: το seed είναι additive, δεν κλειδώνει τίποτα.
 *
 * Χρήση (μέσα στο server/):
 *   node scripts/seed-demo.js            # προσθέτει το demo dataset
 *   node scripts/seed-demo.js --clear    # σβήνει ΜΟΝΟ τις demo* γραμμές
 *   DATA_DIR=/opt/playfood/server node scripts/seed-demo.js
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, insertEvent } from '../src/db.js';
import { ISLANDS, ISLAND_GAMES, GAMES, HEROES, LANGS } from '../src/validate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || join(HERE, '..');
const dbFile = join(dataDir, 'playfood.db');


// Ντετερμινιστικό RNG ώστε το seed να βγάζει το ίδιο dataset κάθε φορά.
let s = 20260721;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const DAY = 86400000;
const now = Date.now();

// Πλήρες event με όλα τα named params που περιμένει το insertEvent (null όπου λείπει).
function ev(ts, learner, session, type, extra = {}) {
  return {
    ts, learner_id: learner, session_id: session, type,
    island: null, game: null, score: null, stars: null,
    duration_s: null, progress: null, language: pick(LANGS), returning: 0,
    ...extra,
  };
}

function baseId(prefix, n) { return `${prefix}${String(n).padStart(4, '0')}`; }

function seed(db) {
  const rows = [];
  const LEARNERS = 42;

  for (let i = 0; i < LEARNERS; i++) {
    const learner = baseId('demo', i);          // demo0000..demo0041
    const dayOffset = between(0, 29);            // απλωμένα σε 30 μέρες
    // ~40% της κίνησης μέσα στην τελευταία εβδομάδα (για «ενεργοί αυτή την εβδομάδα»)
    const start = now - dayOffset * DAY + between(9, 18) * 3600000 - (rnd() < 0.4 ? between(0, 6) * DAY : 0);
    let t = Math.min(start, now - 60000);
    const session = baseId('sess', i);
    const returning = rnd() < 0.35 ? 1 : 0;
    const step = () => (t += between(20, 240) * 1000);

    rows.push(ev(t, learner, session, 'session_start', { returning }));
    step();
    rows.push(ev(t, learner, session, 'hero_chosen', { game: pick(HEROES) }));

    // Κλιμακωτό funnel: πόσα νησιά «αγγίζει» αυτό το παιδί.
    // r καθορίζει το βάθος — τα περισσότερα παιδιά μένουν στα πρώτα νησιά.
    const r = rnd();
    const islandsReached = r < 0.10 ? 0 : r < 0.35 ? 1 : r < 0.65 ? 2 : r < 0.88 ? 3 : 4;
    let totalPlaySeconds = 0;

    for (let is = 0; is < islandsReached; is++) {
      const island = ISLANDS[is];
      step();
      rows.push(ev(t, learner, session, 'island_enter', { island }));

      const games = ISLAND_GAMES[island];
      // Πόσα από τα 3 παιχνίδια του νησιού τελειώνει (0..3), με πτώση προς το 3.
      const q = rnd();
      const gamesFinished = q < 0.15 ? 0 : q < 0.35 ? 1 : q < 0.60 ? 2 : 3;

      for (let g = 0; g < games.length; g++) {
        const game = games[g];
        step();
        rows.push(ev(t, learner, session, 'game_start', { island, game, progress: 0 }));
        const dur = between(45, 300);
        if (g < gamesFinished) {
          t += dur * 1000;
          totalPlaySeconds += dur;
          const stars = between(1, 3);
          rows.push(ev(t, learner, session, 'game_finish', {
            island, game, stars, score: stars * between(20, 60),
            duration_s: dur, progress: 100,
          }));
        } else {
          // Ξεκίνησε αλλά παράτησε — μετράει στα game_start, όχι στα finish.
          t += between(10, 60) * 1000;
          rows.push(ev(t, learner, session, 'game_abandon', {
            island, game, progress: between(10, 80),
          }));
          break; // σταματά σε αυτό το νησί όταν παρατήσει
        }
      }
    }

    step();
    rows.push(ev(t, learner, session, 'session_end', {
      duration_s: totalPlaySeconds || between(30, 90), returning,
    }));
  }

  // Δύο «completionists»: τελειώνουν και τα 12 παιχνίδια, ώστε το «Reached 12/12»
  // και το finished12 να μη δείχνουν flat μηδέν στην επίδειξη.
  for (let c = 0; c < 2; c++) {
    const learner = baseId('demo', LEARNERS + c);
    const session = baseId('sess', LEARNERS + c);
    let t = now - between(2, 12) * DAY + 10 * 3600000;
    let total = 0;
    rows.push(ev(t, learner, session, 'session_start', { returning: 1 }));
    t += 60000;
    rows.push(ev(t, learner, session, 'hero_chosen', { game: pick(HEROES) }));
    for (const island of ISLANDS) {
      t += 60000;
      rows.push(ev(t, learner, session, 'island_enter', { island }));
      for (const game of ISLAND_GAMES[island]) {
        t += 30000;
        rows.push(ev(t, learner, session, 'game_start', { island, game, progress: 0 }));
        const dur = between(60, 240);
        t += dur * 1000; total += dur;
        const stars = between(2, 3);
        rows.push(ev(t, learner, session, 'game_finish', {
          island, game, stars, score: stars * between(30, 60),
          duration_s: dur, progress: 100,
        }));
      }
    }
    t += 60000;
    rows.push(ev(t, learner, session, 'session_end', { duration_s: total, returning: 1 }));
  }

  const insertMany = db.transaction((all) => { for (const r of all) insertEvent(db, r); });
  insertMany(rows);
  return rows.length;
}

function clearDemo(db) {
  return db.prepare(`DELETE FROM events WHERE learner_id LIKE 'demo%'`).run().changes;
}

const db = openDb(dbFile);
try {
  if (process.argv.includes('--clear')) {
    const n = clearDemo(db);
    console.log(`Removed ${n} demo rows from ${dbFile}`);
  } else {
    const n = seed(db);
    const learners = db.prepare(`SELECT count(DISTINCT learner_id) c FROM events WHERE learner_id LIKE 'demo%'`).get().c;
    console.log(`Seeded ${n} demo events (${learners} demo learners) into ${dbFile}`);
    console.log(`Clear them any time with:  node scripts/seed-demo.js --clear`);
  }
} finally {
  db.close();
}
