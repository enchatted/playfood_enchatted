/**
 * Είσοδος στατιστικών. Δύο διαδρομές, καμία άλλη ευθύνη.
 *
 * Το κοινό μυστικό κόβει bots και τυχαία αιτήματα. ΔΕΝ είναι πραγματικά μυστικό
 * (ό,τι φτάνει στον browser διαβάζεται με DevTools) — γι' αυτό υπάρχουν και οι
 * υπόλοιπες δικλείδες, που προστατεύουν και από δικό μας bug.
 */
import { getConfig } from '../config.js';
import { insertEvent, countToday } from '../db.js';
import { validateEvent } from '../validate.js';
import { collectionDiagnostics } from '../collectionDiagnostics.js';

const WINDOW_MS = 60000;
const MAX_PER_WINDOW = 120;
const MAX_TRACKED = 5000;
const hits = new Map(); // ip → { n, resetAt } — ΜΟΝΟ στη μνήμη, ποτέ στον δίσκο

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (rec && now <= rec.resetAt) {
    rec.n += 1;
    return rec.n > MAX_PER_WINDOW;
  }
  // Φραγμός μνήμης: σκουπίζουμε ΜΟΝΟ τις ληγμένες εγγραφές. Το ολικό clear()
  // ήταν λάθος — 5001 διαφορετικές διευθύνσεις μηδένιζαν το παράθυρο ΟΛΩΝ,
  // ακριβώς υπό το φορτίο για το οποίο υπάρχει ο περιορισμός.
  if (hits.size > MAX_TRACKED) {
    for (const [key, v] of hits) if (v.resetAt < now) hits.delete(key);
    // Σκληρό ταβάνι: αν μια πλημμυρίδα από ΓΝΗΣΙΑ διαφορετικές διευθύνσεις
    // (ρεαλιστικό υπό IPv6 rotation) κρατά ΟΛΕΣ τις εγγραφές ζωντανές, το
    // selective sweep παραπάνω δεν ελευθερώνει τίποτα — χωρίς άλλο μέτρο ο
    // Map θα μεγάλωνε απεριόριστα και κάθε νέα διεύθυνση θα πυροδοτούσε ξανά
    // πλήρη σάρωση (τετραγωνικό CPU). Διώχνουμε πρώτα τις εγγραφές με τα
    // λιγότερα χτυπήματα (n) — μία μεμονωμένη διεύθυνση-μιας-χρήσης είναι
    // αναλώσιμη. ΔΕΝ διώχνουμε με βάση το resetAt (ποιο λήγει νωρίτερα): μια
    // ήδη μπλοκαρισμένη διεύθυνση έχει το ΠΑΛΙΟΤΕΡΟ resetAt ακριβώς επειδή
    // παρακολουθείται εδώ και ώρα — αυτή η λογική θα την πετούσε πρώτη,
    // χάνοντας το μπλοκάρισμά της στην ίδια την πλημμυρίδα που υποτίθεται ότι
    // αντιμετωπίζουμε.
    if (hits.size > MAX_TRACKED) {
      // Τρίμαρουμε ως το 80% του MAX_TRACKED, ΟΧΙ ως το ίδιο το ταβάνι: το
      // παλιό κλάδεμα άφηνε μηδενικό περιθώριο (γέμιζε ξανά στο MAX_TRACKED
      // ακριβώς μετά την εισαγωγή της τρέχουσας διεύθυνσης), οπότε υπό συνεχή
      // πλημμυρίδα η ΕΠΟΜΕΝΗ κιόλας νέα διεύθυνση ξαναπερνούσε το ταβάνι και
      // ξαναπυροδοτούσε ολόκληρο το sort — δηλαδή ένα πλήρες sort ΣΕ ΚΑΘΕ
      // αίτημα. Αφήνοντας περιθώριο ως το 80%, το sort τρέχει μία φορά ανά
      // ~20% του MAX_TRACKED νέες διευθύνσεις, όχι σε κάθε μία.
      const oldest = [...hits.entries()]
        .sort((a, b) => (a[1].n - b[1].n) || (a[1].resetAt - b[1].resetAt));
      const target = Math.floor(MAX_TRACKED * 0.8);
      for (let i = 0; i < oldest.length - target; i++) hits.delete(oldest[i][0]);
    }
  }
  hits.set(ip, { n: 1, resetAt: now + WINDOW_MS });
  return false;
}

// Μόνο για tests — ελέγχει ότι το ταβάνι μνήμης πιάνει, χωρίς να εκθέτει IPs.
export function __hitsSizeForTests() { return hits.size; }
export { MAX_TRACKED };

export default async function ingestRoutes(fastify, opts) {
  const { db } = opts;
  const diagnostics = collectionDiagnostics(db);

  fastify.get('/config', async () => ({ tracking: getConfig().PANEL_ENABLED === true }));

  fastify.post('/ev', async (request, reply) => {
    const cfg = getConfig();

    // Κλειστό → απαντά OK αλλά δεν αποθηκεύει τίποτα. Ο πομπός δεν χρειάζεται να ξέρει.
    if (!cfg.PANEL_ENABLED) return reply.code(204).send();

    // Το μυστικό μπορεί να έρθει είτε στην κεφαλίδα (κανονικά POST) είτε στο σώμα
    // (sendBeacon κατά τη στιγμή που κλείνει η σελίδα, δεν υποστηρίζει κεφαλίδες).
    const sent = request.headers['x-pf-secret'] ?? request.body?.secret;
    if (sent !== cfg.PANEL_SECRET) {
      diagnostics.unauthorized += 1;
      return reply.code(401).send();
    }
    if (rateLimited(request.ip)) {
      diagnostics.rateLimited += 1;
      return reply.code(429).send();
    }
    if (countToday(db) >= cfg.MAX_EVENTS_PER_DAY) {
      diagnostics.dailyCap += 1;
      return reply.code(204).send();
    }

    const result = validateEvent(request.body);
    if (!result.ok) {
      diagnostics.invalid += 1;
      return reply.code(400).send({ error: result.reason });
    }

    insertEvent(db, result.value);
    diagnostics.accepted += 1;
    diagnostics.lastAcceptedAt = Date.now();
    return reply.code(204).send();
  });
}
