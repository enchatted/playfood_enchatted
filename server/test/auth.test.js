import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { hashPassword, verifyPassword, sealUsersFile, readUsers,
         createSession, getSession, destroySession,
         startSessionSweeper, stopSessionSweeper,
         __sessionCountForTests, __setSessionExpiryForTests } from '../src/auth.js';

const usersFile = (body) => {
  const f = join(mkdtempSync(join(tmpdir(), 'pfusr-')), 'users.txt');
  writeFileSync(f, body, 'utf8');
  return f;
};

test('το hash επαληθεύεται και διαφέρει σε κάθε κλήση (τυχαίο salt)', () => {
  const a = hashPassword('mystiko123');
  const b = hashPassword('mystiko123');
  assert.notEqual(a, b, 'ίδιο hash δύο φορές σημαίνει ότι λείπει το salt');
  assert.equal(verifyPassword('mystiko123', a), true);
  assert.equal(verifyPassword('lathos', a), false);
});

test('αλλοιωμένη αποθηκευμένη τιμή αποτυγχάνει (false) αντί να ρίξει exception', () => {
  // Λείπει το κομμάτι του hash (5 τμήματα αντί για 6).
  assert.doesNotThrow(() => {
    assert.equal(verifyPassword('x', 'scrypt$16384$8$1$aabbccdd'), false);
  });
  // Το N δεν είναι αριθμός.
  assert.doesNotThrow(() => {
    assert.equal(verifyPassword('x', 'scrypt$abc$8$1$aabbccdd$eeff0011'), false);
  });
  // Ελλιπής μορφή μετά το πρόθεμα.
  assert.doesNotThrow(() => {
    assert.equal(verifyPassword('x', 'scrypt$'), false);
  });
  // Ένα σωστό password πρέπει να συνεχίσει να επαληθεύεται κανονικά.
  const valid = hashPassword('sostokodiko');
  assert.equal(verifyPassword('sostokodiko', valid), true);
});

test('το αρχείο κλειδώνεται μόνο του στην πρώτη ανάγνωση', () => {
  const f = usersFile('admin@sxoleio.gr : tokodikomou123\n');
  const sealed = sealUsersFile(f);
  assert.equal(sealed, 1);

  const after = readFileSync(f, 'utf8');
  assert.equal(after.includes('tokodikomou123'), false, 'ο καθαρός κωδικός πρέπει να έχει φύγει');
  assert.ok(after.includes('scrypt$'), 'πρέπει να έχει μπει hash');
  assert.ok(after.includes('admin@sxoleio.gr'), 'το email μένει');

  const users = readUsers(f);
  assert.equal(verifyPassword('tokodikomou123', users.get('admin@sxoleio.gr')), true);
});

test('το κλείδωμα γράφει με temp+rename και δεν αφήνει πίσω .tmp αρχείο', () => {
  const f = usersFile('admin@sxoleio.gr : tokodikomou123\nb@sxoleio.gr : allokodiko\n');
  const sealed = sealUsersFile(f);
  assert.equal(sealed, 2);

  // Το ίδιο το αρχείο περιέχει ακόμα έγκυρα credentials μετά το seal.
  const users = readUsers(f);
  assert.equal(verifyPassword('tokodikomou123', users.get('admin@sxoleio.gr')), true);
  assert.equal(verifyPassword('allokodiko', users.get('b@sxoleio.gr')), true);

  // Δεν μένει πίσω κανένα .tmp — το rename το κατανάλωσε.
  assert.equal(existsSync(`${f}.tmp`), false, 'δεν πρέπει να μείνει προσωρινό αρχείο μετά το seal');
});

test('δεύτερο πέρασμα δεν ξανακλειδώνει ήδη κλειδωμένη γραμμή', () => {
  const f = usersFile('a@b.gr : kodikos\n');
  sealUsersFile(f);
  const once = readFileSync(f, 'utf8');
  assert.equal(sealUsersFile(f), 0);
  assert.equal(readFileSync(f, 'utf8'), once, 'το αρχείο δεν πρέπει να αλλάξει');
});

test('αγνοεί σχόλια και κενές γραμμές', () => {
  const f = usersFile('# σχόλιο\n\nadmin@x.gr : abc\n');
  assert.equal(sealUsersFile(f), 1);
  assert.equal(readUsers(f).size, 1);
});

test('sessions expire after thirty idle minutes and renew on activity', (t) => {
  let now = 1000000;
  t.mock.method(Date, 'now', () => now);
  const token = createSession('idle@example.org');
  now += 29 * 60000;
  assert.equal(getSession(token), 'idle@example.org');
  now += 29 * 60000;
  assert.equal(getSession(token), 'idle@example.org');
  now += 30 * 60000;
  assert.equal(getSession(token), null);
});

test('οι συνεδρίες δίνονται και ανακαλούνται', () => {
  const t = createSession('admin@x.gr');
  assert.equal(getSession(t), 'admin@x.gr');
  destroySession(t);
  assert.equal(getSession(t), null);
  assert.equal(getSession('ανυπαρκτο'), null);
});

test('ο sweeper σβήνει μόνος του μια ληγμένη συνεδρία (χωρίς να την ψάξει κανείς)', async () => {
  const token = createSession('sweep@sxoleio.gr');
  const before = __sessionCountForTests();

  // Τη «λήγουμε» χειροκίνητα αντί να περιμένουμε 12 ώρες.
  __setSessionExpiryForTests(token, Date.now() - 1000);

  startSessionSweeper(20); // 20ms αντί για 1 ώρα, όπως στο config.test.js
  await sleep(60);

  // Ελέγχουμε το μέγεθος του Map απευθείας — ΟΧΙ μέσω getSession(token), που
  // θα τη διέγραφε μόνο του (lazy) και θα έκρυβε αν ο sweeper δουλεύει.
  assert.equal(__sessionCountForTests(), before - 1,
    'ο sweeper έπρεπε να διαγράψει μόνος του τη ληγμένη συνεδρία');

  stopSessionSweeper();
});
