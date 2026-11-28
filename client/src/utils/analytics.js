/**
 * Πομπός στατιστικών — fire-and-forget.
 *
 * ΑΡΧΗ: τα στατιστικά είναι ΠΑΝΤΑ λιγότερο σημαντικά από το παιχνίδι. Καμία
 * εξαίρεση από αυτό το module δεν επιτρέπεται να φτάσει στο παιχνίδι — ό,τι κι
 * αν κάνει το localStorage, το crypto ή το δίκτυο (πολλά σχολικά εργαστήρια
 * έχουν κλειδωμένο ή σπασμένο storage). Ο πομπός δεν περιμένει απάντηση, δεν
 * ξαναπροσπαθεί και δεν εμφανίζει ποτέ σφάλμα.
 *
 * Ενεργοποιείται μόνο αν ο server απαντήσει tracking:true. Σε καθαρά στατική
 * φιλοξενία (καθόλου server) η ερώτηση αποτυγχάνει και ο πομπός μένει σιωπηλός —
 * γι' αυτό το ΙΔΙΟ πακέτο δουλεύει και με και χωρίς εγκατάσταση panel.
 */
const LEARNER_KEY = 'playfood-learner';
const SECRET = import.meta.env?.VITE_PANEL_SECRET || '';
const ID_PATTERN = /^[a-z0-9]{8}$/;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const MAX_QUEUED = 50;   // φράγμα: το δίκτυο μπορεί να κολλήσει, η ουρά δεν μεγαλώνει άπειρα

let enabled = false;
let ready = false;
let handshake = null;    // το εν εξελίξει initAnalytics — μοιράζεται σε παράλληλες κλήσεις
let queue = [];          // γεγονότα που εκπέμφθηκαν ΟΣΟ έτρεχε η χειραψία
let sessionId = null;
let cachedLearnerId = null; // in-memory fallback όταν το storage δεν επιμένει
let languageSource = null;

/**
 * Τυχαία συμβολοσειρά μήκους n. Προτιμά crypto (καλύτερη τυχαιότητα), αλλά ΔΕΝ
 * σκάει αν το crypto λείπει ή πετάξει — ένα ανώνυμο αναγνωριστικό μαθητή δεν
 * χρειάζεται κρυπτογραφική εγγύηση, Math.random ως fallback είναι αποδεκτό.
 */
function rand(n) {
  try {
    return Array.from(
      crypto.getRandomValues(new Uint8Array(n)),
      (b) => ALPHABET[b % 36]
    ).join('');
  } catch {
    let out = '';
    for (let i = 0; i < n; i++) out += ALPHABET[Math.floor(Math.random() * 36)];
    return out;
  }
}

/** Ίδιος κανόνας εγκυρότητας παντού: "έχουμε ένα αναγνωριστικό που εκδώσαμε εμείς". */
const isValidId = (id) => typeof id === 'string' && ID_PATTERN.test(id);

/** localStorage.getItem που ποτέ δεν πετάει — null αν το storage λείπει/σκάει. */
function readStoredId() {
  try {
    return localStorage.getItem(LEARNER_KEY);
  } catch {
    return null;
  }
}

/**
 * @returns {string} ΠΑΝΤΑ ένα έγκυρο αναγνωριστικό 8 χαρακτήρων (a-z0-9).
 *   Αν το localStorage λείπει/σκάει (π.χ. κλειδωμένο εργαστήριο), το
 *   αναγνωριστικό ζει μόνο στη μνήμη για την τρέχουσα φόρτωση της σελίδας —
 *   δεν επιμένει ανάμεσα σε επισκέψεις, αλλά η κλήση δεν πετάει ποτέ.
 */
export function getLearnerId() {
  if (isValidId(cachedLearnerId)) return cachedLearnerId;
  let id = readStoredId();
  if (!isValidId(id)) {
    id = rand(8);
    try {
      localStorage.setItem(LEARNER_KEY, id);
    } catch {
      // no persistence διαθέσιμο — το id μένει έγκυρο μόνο εντός μνήμης
    }
  }
  cachedLearnerId = id;
  return id;
}

/**
 * @returns {boolean} true ΜΟΝΟ όταν υπάρχει ήδη ένα έγκυρο, δικό μας
 *   αναγνωριστικό αποθηκευμένο (ίδιος κανόνας εγκυρότητας με getLearnerId).
 *   Μια κατεστραμμένη ή ξένη τιμή στο storage ΔΕΝ μετράει ως "επιστρέφων" —
 *   getLearnerId θα την αγνοήσει και θα εκδώσει καινούριο id ούτως ή άλλως.
 *   Ποτέ δεν πετάει· αν το storage λείπει/σκάει, γυρνά false.
 */
export function isReturning() {
  return isValidId(readStoredId());
}

/**
 * @param {string|null|function(): (string|null)} language Τρέχουσα γλώσσα ή
 *   συνάρτηση ανάγνωσης από τον store σε κάθε αποστολή. Πριν από την επιλογή
 *   επιστρέφει null: η προεπιλογή του store δεν αποτελεί επιλογή του παιδιού.
 *
 * @returns {Promise<boolean>} ΠΟΤΕ δεν απορρίπτεται (rejects) — καλείται
 *   fire-and-forget χωρίς .catch() από τον caller, οπότε ένα reject θα γινόταν
 *   unhandled promise rejection μέσα σε ένα παιχνίδι για παιδιά. Ό,τι κι αν πάει
 *   στραβά (storage, crypto, δίκτυο), γυρνά false σιωπηλά.
 */
export async function initAnalytics(language = null) {
  // Παράλληλες κλήσεις μοιράζονται την ΙΔΙΑ χειραψία: ένα /api/config, ένα
  // session_start. Χωρίς αυτό, δύο mounts θα άνοιγαν δύο συνεδρίες.
  if (handshake) return handshake;
  handshake = runHandshake(language);
  try {
    return await handshake;
  } finally {
    handshake = null;
  }
}

async function runHandshake(language) {
  try {
    // Κάθε νέα χειραψία ξεκινά από μηδενική κατάσταση: όσο τρέχει, δεν είμαστε
    // έτοιμοι και δεν εκπέμπουμε. Χωρίς αυτό, ένα re-init θα άφηνε ενεργό το
    // enabled της ΠΡΟΗΓΟΥΜΕΝΗΣ απάντησης και γεγονότα θα διέρρεαν ακόμη κι αν ο
    // server απαντούσε πλέον tracking:false.
    ready = false;
    enabled = false;
    languageSource = language;
    const returning = isReturning();
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      enabled = data?.tracking === true;
    } catch {
      enabled = false;   // δεν υπάρχει server — απολύτως φυσιολογικό
    }
    ready = true;
    if (enabled) {
      sessionId = rand(12);
      // Το session_start ΠΡΩΤΑ: ο server θέλει την έναρξη πριν από ό,τι συνέβη μέσα της.
      send('session_start', { returning }, readLanguage());
    }
    flushQueue();
    return enabled;
  } catch {
    // Ασπίδα ασφαλείας: καμία εξαίρεση δεν βγαίνει ποτέ από δω προς τον caller.
    enabled = false;
    ready = true;
    flushQueue();
    return false;
  }
}

/**
 * Στέλνει ό,τι μαζεύτηκε όσο έτρεχε η χειραψία — ή το πετάει, αν η καταγραφή
 * δεν είναι ενεργή. Η ουρά αδειάζει ΠΑΝΤΑ, ώστε τίποτα να μην ξανασταλεί.
 */
function flushQueue() {
  const pending = queue;
  queue = [];
  if (!enabled) return;   // tracking:false ή καθόλου server — τα ρίχνουμε σιωπηλά
  for (const event of pending) send(event.type, event.fields, event.language);
}

/** Η επιλεγμένη γλώσσα ΤΩΡΑ, ή null. Ποτέ δεν πετάει. */
function readLanguage() {
  try {
    const selected = typeof languageSource === 'function' ? languageSource() : languageSource;
    if (['en', 'nl', 'el', 'pt'].includes(selected)) return selected;
  } catch {
    // A failed locale read must not discard an otherwise valid event.
  }
  return null;
}

function payload(type, fields, language) {
  return { learner_id: getLearnerId(), session_id: sessionId, type, ...fields, language };
}

export function track(type, fields = {}) {
  // Χειραψία σε εξέλιξη: κρατάμε το γεγονός ΜΕ ΤΗ ΓΛΩΣΣΑ ΤΗΣ ΣΤΙΓΜΗΣ ΤΟΥ, γιατί
  // το παιδί μπορεί να αλλάξει γλώσσα πριν προλάβει να απαντήσει ο server.
  if (!ready && handshake) {
    // Αντίγραφο των πεδίων: ο caller μπορεί να ξαναχρησιμοποιήσει το αντικείμενο
    // πριν αδειάσει η ουρά, και το γεγονός πρέπει να κρατά ό,τι ίσχυε ΤΟΤΕ.
    if (queue.length < MAX_QUEUED) queue.push({ type, fields: { ...fields }, language: readLanguage() });
    return;
  }
  send(type, fields, readLanguage());
}

function send(type, fields, language) {
  if (!ready || !enabled) return;
  try {
    fetch('/api/ev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pf-secret': SECRET },
      body: JSON.stringify(payload(type, fields, language)),
      keepalive: true,
    }).catch(() => {});      // σιωπηλά — το παιδί δεν πρέπει ποτέ να το δει
  } catch {
    // ούτε συγχρονισμένο σφάλμα φτάνει στο παιχνίδι
  }
}

export function beginGameAttempt(fields) {
  const attemptId = rand(20);
  track('game_start', { ...fields, attempt_id: attemptId });
  return attemptId;
}

/** Για τη στιγμή που κλείνει η σελίδα — το sendBeacon προλαβαίνει, το fetch όχι. */
export function trackFinal(type, fields = {}) {
  if (!ready || !enabled) return;
  const body = (() => {
    try {
      return JSON.stringify({ ...payload(type, fields, readLanguage()), secret: SECRET });
    } catch {
      return null;
    }
  })();
  if (body === null) return;

  let delivered = false;
  try {
    // Επιστρέφει false όταν ο browser αρνείται την ουρά (π.χ. γεμάτη ή πολύ
    // μεγάλο payload) — αυτό ΔΕΝ είναι εξαίρεση, πρέπει να το ελέγξουμε ρητά.
    delivered = navigator.sendBeacon?.('/api/ev', new Blob([body], { type: 'application/json' })) === true;
  } catch {
    delivered = false;   // π.χ. navigator/sendBeacon λείπει ή μπλοκάρεται
  }
  if (delivered) return;

  // Εφεδρεία: keepalive fetch, που ο browser επιτρέπεται να ολοκληρώσει και
  // μετά το κλείσιμο της σελίδας. Μία προσπάθεια, καμία επανάληψη.
  try {
    fetch('/api/ev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pf-secret': SECRET },
      body,
      keepalive: true,
    })?.catch?.(() => {});
  } catch {
    // ούτε εδώ φτάνει τίποτα στο παιχνίδι
  }
}

export function __resetForTests() {
  enabled = false; ready = false; sessionId = null; cachedLearnerId = null;
  languageSource = null; handshake = null; queue = [];
}
