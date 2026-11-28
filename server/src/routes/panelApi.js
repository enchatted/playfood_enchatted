/** Οι διαδρομές που τροφοδοτούν το /panel. Όλες εκτός login/health θέλουν token. */
import { createReadStream, unlinkSync } from 'node:fs';
import { getConfig } from '../config.js';
import { computeStats, range } from '../stats.js';
import { countToday } from '../db.js';
import { collectionDiagnostics } from '../collectionDiagnostics.js';
import { LANGS, TIMING_FIELDS } from '../validate.js';
import { readUsers, verifyPanelPassword, createSession, getSession, destroySession } from '../auth.js';
import { createLoginLimiter } from '../loginLimiter.js';

const CSV_HEADER = 'ts,learner_id,session_id,type,island,game,score,stars,duration_s,progress,language,returning,attempt_id,passed,timing_version,' + TIMING_FIELDS.join(',') + ',local_time,timestamp_utc,row_scope';

// The file name carries the filter, so two exports of different periods never share a name.
export function csvFileName(from, to, language) {
  const day = (value) => String(value || '').replace(/[^0-9-]/g, '');
  const period = from || to ? `${day(from) || 'start'}_to_${day(to) || 'today'}` : 'all-time';
  return ['playfood-stats', period, language].filter(Boolean).join('_') + '.csv';
}

export default async function panelApiRoutes(fastify, opts) {
  const { db, usersFile, dbFile } = opts;
  const loginRetryAfter = createLoginLimiter();

  const requireSession = (request, reply) => {
    const token = String(request.headers.authorization || '').replace(/^Bearer /, '');
    const email = getSession(token);
    if (!email) { reply.code(401).send({ error: 'not signed in' }); return null; }
    return email;
  };

  // «Κλειστό» σημαίνει πραγματικά κλειστό: όταν PANEL_ENABLED = no, όχι μόνο η
  // καταγραφή και η σελίδα /panel σταματούν, αλλά και το authenticated data
  // API (login/stats/export/backup). Χωρίς αυτό, ένας υπεύθυνος που «έκλεισε τα
  // στατιστικά» θα είχε ακόμα ζωντανό endpoint που κατεβάζει ολόκληρη τη βάση με
  // ένα valid token. Ελέγχεται ΠΡΙΝ το token ώστε το «off» να μη διαρρέει καν αν
  // ένα token είναι έγκυρο.
  const requireEnabled = (reply) => {
    if (getConfig().PANEL_ENABLED !== true) {
      reply.code(503).send({ error: 'panel disabled' });
      return false;
    }
    return true;
  };

  fastify.get('/health', async () => ({
    db: true,
    tracking: getConfig().PANEL_ENABLED === true,
    eventsToday: countToday(db),
  }));

  fastify.post('/login', async (request, reply) => {
    if (!requireEnabled(reply)) return;
    // Use the socket peer even when a hosting proxy is configured. This is a
    // shared staff bucket for the proxy peer, rather than a spoofable client IP.
    const retryAfter = loginRetryAfter(request.raw.socket.remoteAddress || 'unknown');
    if (retryAfter) {
      return reply.header('Retry-After', String(retryAfter)).code(429)
        .send({ error: 'too many login attempts; try again later' });
    }
    const { email, password } = request.body || {};
    const stored = readUsers(usersFile).get(String(email || '').trim());
    if (!verifyPanelPassword(String(password || ''), stored)) {
      return reply.code(401).send({ error: 'wrong email or password' });
    }
    return { token: createSession(email) };
  });

  fastify.get('/session', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!requireEnabled(reply)) return;
    const email = requireSession(request, reply);
    if (!email) return;
    return { email };
  });

  fastify.post('/logout', async (request) => {
    destroySession(String(request.headers.authorization || '').replace(/^Bearer /, ''));
    return { ok: true };
  });

  fastify.get('/stats', async (request, reply) => {
    if (!requireEnabled(reply)) return;
    if (!requireSession(request, reply)) return;
    const { from = null, to = null, language = '' } = request.query || {};
    if (language && !LANGS.includes(language)) return reply.code(400).send({ error: 'Unsupported language' });
    const stats = computeStats(db, { from: from || null, to: to || null, language });
    // Το «τώρα» συμπληρώνεται ΕΔΩ και όχι στο stats.js: τα db/tracking/eventsToday
    // είναι θέματα ρύθμισης και διαδρομής, ενώ το stats.js μένει καθαρό
    // «αριθμοί από τη βάση» και δεν εισάγει ποτέ config.
    return {
      ...stats,
      now: {
        ...stats.now,
        db: true,
        tracking: getConfig().PANEL_ENABLED === true,
        eventsToday: countToday(db),
        collection: { ...collectionDiagnostics(db) },
      },
    };
  });

  fastify.get('/export.csv', async (request, reply) => {
    if (!requireEnabled(reply)) return;
    if (!requireSession(request, reply)) return;
    const { from = null, to = null, language = '' } = request.query || {};
    if (language && !LANGS.includes(language)) return reply.code(400).send({ error: 'Unsupported language' });
    // Match the stats visit cohort exactly. Only start/end/hero context may extend
    // beyond the date/language filter, and its scope stays explicit in the CSV.
    const { clause, args } = range(from, to, language);
    const rows = db.prepare(
      `WITH filtered AS (SELECT * FROM events ${clause}),
       selected_visits AS (SELECT DISTINCT learner_id, session_id FROM filtered),
       export_rows AS (
         SELECT *, 'filtered' AS row_scope FROM filtered
         ${language ? `UNION ALL
         SELECT e.*, 'visit_context' AS row_scope FROM events e
         WHERE e.type IN ('session_start','session_end','hero_chosen')
           AND EXISTS (SELECT 1 FROM selected_visits v
             WHERE v.learner_id=e.learner_id AND v.session_id=e.session_id)
           AND NOT EXISTS (SELECT 1 FROM filtered f WHERE f.id=e.id)` : ''}
       )
       SELECT ts, learner_id, session_id, type, island, game, score, stars,
              duration_s, progress, language, "returning", attempt_id, passed, timing_version, ${TIMING_FIELDS.join(', ')},
              datetime(ts/1000,'unixepoch','localtime') AS local_time, row_scope
       FROM export_rows ORDER BY ts, id`
    ).all(...args);
    // «sep=,» tells Excel the separator, so a Greek locale (list separator «;») still splits the columns.
    const body = ['sep=,', CSV_HEADER, ...rows.map(({ row_scope, ...r }) => [...Object.values(r), new Date(r.ts).toISOString(), row_scope]
      .map((v) => (v === null ? '' : v)).join(','))].join('\n');
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${csvFileName(from, to, language)}"`)
      .send(body);
  });

  fastify.get('/backup', async (request, reply) => {
    if (!requireEnabled(reply)) return;
    if (!requireSession(request, reply)) return;
    // Η βάση τρέχει σε WAL mode (db.js): πρόσφατες γραφές μένουν στο πλευρικό
    // αρχείο -wal μέχρι να γίνει checkpoint στο κύριο αρχείο. Ένα απλό
    // createReadStream(dbFile) διαβάζει ΜΟΝΟ το κύριο αρχείο — ό,τι εκκρεμεί
    // ακόμα στο -wal λείπει σιωπηλά από το κατέβασμα, και αν τύχει να τρέξει
    // αυτόματο checkpoint ΕΝΩ διαβάζουμε, το stream μπορεί να ανακατέψει δύο
    // καταστάσεις του αρχείου σε ένα άχρηστο αποτέλεσμα. Το db.backup() παίρνει
    // μια συνεπή στιγμιαία «φωτογραφία» (μαζί με ό,τι είναι στο WAL) σε
    // ξεχωριστό αρχείο, που το στέλνουμε και μετά διαγράφουμε.
    const snapshot = `${dbFile}.backup-${Date.now()}`;
    await db.backup(snapshot);
    const stream = createReadStream(snapshot);
    stream.on('close', () => { try { unlinkSync(snapshot); } catch { /* ήδη έφυγε */ } });
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', 'attachment; filename="playfood.db"')
      .send(stream);
  });

  // ΔΕΝ υπάρχει διαδρομή που σβήνει τα δεδομένα, και δεν πρέπει να ξαναμπεί.
  // Όλοι οι λογαριασμοί του panel έχουν ακριβώς τα ίδια δικαιώματα — δεν υπάρχουν
  // «ανώτεροι» και «κατώτεροι» χρήστες — άρα κανείς δεν πρέπει να κρατά διακόπτη
  // που ισοπεδώνει τη βάση με ένα κλικ. Το να έμενε το endpoint ζωντανό πίσω από
  // ένα κρυμμένο κουμπί δεν θα ήταν ασφάλεια αλλά θέατρο: κάθε λογαριασμός θα
  // μπορούσε να το καλέσει απευθείας. Το σβήσιμο γίνεται πλέον μόνο από τη γραμμή
  // εντολών του server (scripts/seed-demo.js --clear για τα demo δεδομένα).
  // Το /backup μένει: δεν είναι καταστροφικό και το runbook στηρίζεται πάνω του.
}
