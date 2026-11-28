/**
 * Ρυθμίσεις εγκατάστασης — απλό αρχείο «ΚΛΕΙΔΙ = τιμή».
 *
 * Επαναδιαβάζεται κάθε 30 δευτερόλεπτα ώστε ο υπεύθυνος της εγκατάστασης να
 * αλλάζει PANEL_ENABLED χωρίς επανεκκίνηση — δεν είναι τεχνικοί και δεν πρέπει
 * να χρειάζεται εντολή σε τερματικό.
 */
import { readFileSync } from 'node:fs';

const DEFAULTS = {
  PANEL_ENABLED: false,
  PANEL_SECRET: '',
  RETENTION_MONTHS: 24,
  TIMEZONE: 'Europe/Athens',
  PORT: 4000,
  MAX_EVENTS_PER_DAY: 200000,
  TRUST_PROXY: false,
  CORS_ORIGINS: [],
};

const NUMERIC = new Set(['RETENTION_MONTHS', 'PORT', 'MAX_EVENTS_PER_DAY']);

export function loadConfig(path) {
  const cfg = { ...DEFAULTS };
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Λείπει το αρχείο = φυσιολογικό στην πρώτη εκκίνηση, μένει σιωπηλό. Ένα
      // αρχείο που ΥΠΑΡΧΕΙ αλλά δεν διαβάζεται (π.χ. δικαιώματα) είναι άλλο
      // πρόβλημα — ο υπεύθυνος πρέπει να το μάθει αντί να υποθέσει σιωπηλά
      // προεπιλογές.
      console.error(`PLAYFOOD: could not read ${path} (${err.code || err.message}) — falling back to default settings.`);
    }
    return cfg; // λείπει (ή δεν διαβάζεται) το αρχείο → ασφαλείς προεπιλογές, ποτέ κατάρρευση
  }

  for (const line of raw.split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const eq = text.indexOf('=');
    if (eq < 0) continue;
    const key = text.slice(0, eq).trim();
    const value = text.slice(eq + 1).trim();
    if (!(key in DEFAULTS)) continue;

    if (key === 'PANEL_ENABLED') {
      cfg[key] = value.toLowerCase() === 'yes';
    } else if (key === 'TRUST_PROXY') {
      // Trust only named proxy addresses/CIDRs, never arbitrary forwarded headers.
      // «yes» means the usual same-machine proxy (nginx); it used to crash as an invalid IP.
      if (!value || value.toLowerCase() === 'no') cfg[key] = false;
      else if (value.toLowerCase() === 'yes') cfg[key] = ['127.0.0.1', '::1'];
      else cfg[key] = value.split(',').map(peer => peer.trim()).filter(Boolean);
    } else if (key === 'CORS_ORIGINS') {
      cfg[key] = value.split(',').map(origin => origin.trim()).filter(Boolean);
    } else if (NUMERIC.has(key)) {
      const n = Number(value);
      cfg[key] = Number.isFinite(n) && n > 0 ? n : DEFAULTS[key];
    } else {
      cfg[key] = value;
    }
  }
  return cfg;
}

let current = { ...DEFAULTS };
let timer = null;

export function startConfigWatcher(path, intervalMs = 30000) {
  current = loadConfig(path);
  stopConfigWatcher();
  timer = setInterval(() => { current = loadConfig(path); }, intervalMs);
  timer.unref?.(); // να μη κρατά ζωντανή τη διεργασία στα tests
}

export function stopConfigWatcher() {
  if (timer) { clearInterval(timer); timer = null; }
}

// Μόνο για tests — επιβεβαιώνει ότι ο watcher ΠΡΑΓΜΑΤΙΚΑ σταμάτησε (π.χ. στο
// onClose του server), αντί να υποθέτουμε από την απουσία σφάλματος.
export function __configWatcherRunningForTests() { return timer !== null; }

export function getConfig() {
  return current;
}

/**
 * Μόνο για tests — θέτει τη ρύθμιση χωρίς αρχείο.
 *
 * Ελέγχει PANEL_ENABLED, PANEL_SECRET και MAX_EVENTS_PER_DAY — δηλαδή όλες τις
 * δικλείδες του δημόσιου /api/ev. Ο φρουρός NODE_ENV υπάρχει ώστε αυτή η
 * παράκαμψη να μην μπορεί ποτέ να κληθεί εκτός test run, ακόμα κι αν κάποιος
 * την εκθέσει κατά λάθος από route ή script παραγωγής.
 */
export function __setConfigForTests(cfg) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setConfigForTests is test-only');
  }
  current = { ...current, ...cfg };
}
