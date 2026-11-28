/**
 * Είσοδος στο panel.
 *
 * Οι χρήστες ζουν σε ένα αρχείο κειμένου. Ο υπεύθυνος γράφει με το χέρι
 *     admin@sxoleio.gr : tokodikomou
 * και στην πρώτη εκκίνηση ο server ΞΑΝΑΓΡΑΦΕΙ το αρχείο με hash. Καμία σελίδα
 * εγγραφής, κανένα εργαλείο — το κοινό μας δεν είναι τεχνικοί.
 *
 * Χρησιμοποιείται το ενσωματωμένο scrypt του Node: καμία νέα εξάρτηση.
 */
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const N = 16384, r = 8, p = 1, KEYLEN = 32;

export function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  // Ο υπεύθυνος επεξεργάζεται το users.txt με το χέρι (το αρχείο τον καλεί να
  // σβήσει μια γραμμή και να γράψει καινούρια) — μια μισο-γραμμένη τιμή είναι
  // αναμενόμενη, όχι εξαίρεση. Γι' αυτό ελέγχουμε αυστηρά το σχήμα ΚΑΙ τυλίγουμε
  // σε try/catch: οτιδήποτε αλλοιωμένο πρέπει να αποτύχει σιωπηλά (false), όχι
  // να ρίξει όλο το route εισόδου.
  try {
    if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
    const parts = stored.split('$');
    if (parts.length !== 6) return false;
    const [, n, rr, pp, saltHex, hashHex] = parts;
    const N = Number(n), R = Number(rr), P = Number(pp);
    if (![N, R, P].every(Number.isInteger)) return false;
    const expected = Buffer.from(hashHex, 'hex');
    if (expected.length === 0) return false;
    const actual = scryptSync(plain, Buffer.from(saltHex, 'hex'), expected.length,
      { N, r: R, p: P });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Unknown emails still perform scrypt with the same work factors. The random
// dummy credential never belongs to a user and cannot create a session.
const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(32).toString('hex'));

export function verifyPanelPassword(plain, stored) {
  const matches = verifyPassword(plain, stored ?? DUMMY_PASSWORD_HASH);
  return stored !== undefined && matches;
}

const parse = (line) => {
  const text = line.trim();
  if (!text || text.startsWith('#')) return null;
  const i = text.indexOf(':');
  if (i < 0) return null;
  return { email: text.slice(0, i).trim(), secret: text.slice(i + 1).trim() };
};

export function sealUsersFile(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return 0; }

  let changed = 0;
  const out = raw.split('\n').map((line) => {
    const u = parse(line);
    if (!u || u.secret.startsWith('scrypt$')) return line;
    changed += 1;
    return `${u.email} : ${hashPassword(u.secret)}`;
  });

  if (changed > 0) {
    // writeFileSync θα άδειαζε το αρχείο πριν γράψει τα νέα δεδομένα — αν ο
    // server πεθάνει σε αυτό το παράθυρο (διακοπή ρεύματος, OOM, kill -9),
    // χάνονται ΟΛΟΙ οι λογαριασμοί, ακόμα κι όσοι ήταν ήδη hashed. Το
    // users.txt είναι το ΜΟΝΑΔΙΚΟ αντίγραφο του υπεύθυνου — χωρίς backup.
    // Γράφουμε σε προσωρινό αρχείο και μετά renameSync, που είναι atomic
    // μέσα στο ίδιο filesystem: είτε βλέπουμε το παλιό αρχείο ολόκληρο, είτε
    // το καινούριο ολόκληρο — ποτέ κάτι ενδιάμεσο ή άδειο.
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, out.join('\n'), 'utf8');
    renameSync(tmp, path);
  }
  return changed;
}

export function readUsers(path) {
  const users = new Map();
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return users; }
  for (const line of raw.split('\n')) {
    const u = parse(line);
    if (u) users.set(u.email, u.secret);
  }
  return users;
}

const sessions = new Map(); // token → { email, expiresAt }
const TTL_MS = 30 * 60 * 1000;

// Μια συνεδρία που δημιουργείται και ποτέ δεν ξαναελέγχεται (π.χ. ο υπεύθυνος
// έκλεισε το browser) δεν διαγράφεται ποτέ μόνη της — το getSession καθαρίζει
// μόνο ό,τι κοιτάξει κανείς. Χωρίς περιοδικό καθάρισμα αυτό είναι αργή διαρροή
// μνήμης σε μια διεργασία που τρέχει επί μήνες.
//
// Το διάστημα είναι παράμετρος (όπως το startConfigWatcher στο config.js) ώστε
// το ίδιο το καθάρισμα να ελέγχεται με ένα μικρό interval στα tests — καμία
// δοκιμή δεν περιμένει μία ώρα. Το unref() είναι απαραίτητο: χωρίς αυτό το
// timer κρατάει ζωντανή τη διεργασία (και το test runner) ακόμα κι όταν δεν
// έχει μείνει τίποτα άλλο να γίνει.
let sweeper = null;

export function startSessionSweeper(intervalMs = 3600 * 1000) {
  stopSessionSweeper();
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [token, s] of sessions) if (now > s.expiresAt) sessions.delete(token);
  }, intervalMs);
  sweeper.unref?.();
}

export function stopSessionSweeper() {
  if (sweeper) { clearInterval(sweeper); sweeper = null; }
}

// Μόνο για tests — επιβεβαιώνει ότι ο sweeper ΠΡΑΓΜΑΤΙΚΑ σταμάτησε (π.χ. στο
// onClose του server), αντί να υποθέτουμε από την απουσία σφάλματος.
export function __sessionSweeperRunningForTests() { return sweeper !== null; }

// Μόνο για tests — επιβεβαιώνει ότι το καθάρισμα ΠΡΑΓΜΑΤΙΚΑ διέγραψε εγγραφές.
export function __sessionCountForTests() { return sessions.size; }

// Μόνο για tests — καμία δοκιμή δεν μπορεί να περιμένει 12 ώρες για να λήξει
// μια συνεδρία μόνη της, οπότε την «λήγουμε» χειροκίνητα και μετά αφήνουμε τον
// sweeper να τη σβήσει πραγματικά.
export function __setSessionExpiryForTests(token, expiresAt) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setSessionExpiryForTests is test-only');
  }
  const s = sessions.get(token);
  if (s) s.expiresAt = expiresAt;
}

startSessionSweeper();

export function createSession(email) {
  const token = randomBytes(24).toString('hex');
  sessions.set(token, { email, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function getSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() >= s.expiresAt) { sessions.delete(token); return null; }
  s.expiresAt = Date.now() + TTL_MS;
  return s.email;
}

export function destroySession(token) {
  sessions.delete(token);
}
