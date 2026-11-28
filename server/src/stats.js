/**
 * Οι υπολογισμοί. Το αρχείο είναι ημερολόγιο· εδώ γίνεται η ομαδοποίηση που
 * παράγει «μία γραμμή ανά παιδί» — ποτέ δεν πειράζουμε παλιές εγγραφές.
 *
 * Η ομαδοποίηση ανά ημέρα ακολουθεί το process.env.TZ (ορίζεται από το
 * TIMEZONE του config στην εκκίνηση), ώστε το «σήμερα» να είναι η τοπική μέρα.
 */
import { GAMES, ISLANDS, ISLAND_GAMES, LANGS, TIMING_FIELDS } from './validate.js';

// Χτίζει το τμήμα WHERE του φίλτρου ημερομηνίας. from/to = 'YYYY-MM-DD' ή null.
export function range(from, to, language = null) {
  const where = [];
  const args = [];
  if (from) { where.push(`date(ts/1000,'unixepoch','localtime') >= ?`); args.push(from); }
  if (to)   { where.push(`date(ts/1000,'unixepoch','localtime') <= ?`); args.push(to); }
  if (language) { where.push('language = ?'); args.push(language); }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const round1 = (n) => Math.round(n * 10) / 10;
// Only trusted catalogue constants are interpolated into these SQL predicates.
const currentGameContext = Object.entries(ISLAND_GAMES).map(([island, games]) =>
  `(island='${island}' AND game IN ('${games.join("','")}'))`
).join(' OR ');

export function computeStats(db, { from = null, to = null, language = null } = {}) {
  const { clause, args } = range(from, to, language);
  const q = (sql, extra = []) => db.prepare(sql.replace('{W}', clause)).all(...args, ...extra);
  const one = (sql, extra = []) => db.prepare(sql.replace('{W}', clause)).get(...args, ...extra);

  // ── Επισκόπηση ──────────────────────────────────────────────
  const learners = one(`SELECT count(DISTINCT learner_id) c FROM events {W}`).c;
  // A finish or abandonment also proves entry when the start was not recorded.
  const gameProfiles = one(
    `SELECT count(DISTINCT learner_id) c FROM events {W} ${clause ? 'AND' : 'WHERE'}
     type IN ('game_start','game_finish','game_abandon')`
  ).c;
  const sessions = one(`SELECT count(*) c FROM (
    SELECT DISTINCT learner_id, session_id FROM events {W})`).c;
  // One latest reported end per learner/session, BEFORE date/language filtering.
  // Older clients could send cumulative ends repeatedly after bfcache restores.
  // Duration belongs to the last recorded end, not to each intermediate event.
  // This is elapsed visit time, including inactivity, not active game time.
  const visitLength = one(
    `WITH ranked_ends AS (
       SELECT *, row_number() OVER (
         PARTITION BY learner_id, session_id ORDER BY ts DESC, id DESC
       ) rn FROM events WHERE type='session_end'
     )
     SELECT sum(duration_s) total, count(duration_s) measured
     FROM ranked_ends {W} ${clause ? 'AND' : 'WHERE'} rn=1`
  );
  const seconds = visitLength.total;
  const gamesFinished = one(
    `SELECT count(*) c FROM events {W} ${clause ? 'AND' : 'WHERE'} type='game_finish'`
  ).c;
  // A mission counts once per browser profile and game, however many replays passed.
  const missionsCompleted = one(
    `SELECT count(*) c FROM (
       SELECT DISTINCT learner_id, game FROM events {W} ${clause ? 'AND' : 'WHERE'} type='game_finish' AND passed=1)`
  ).c;
  const abandoned = one(
    `SELECT count(*) c FROM events {W} ${clause ? 'AND' : 'WHERE'} type='game_abandon'`
  ).c;
  const finished12 = one(
    `SELECT count(*) c FROM (
       SELECT learner_id FROM events {W} ${clause ? 'AND' : 'WHERE'} type='game_finish' AND passed=1 AND (${currentGameContext})
       GROUP BY learner_id HAVING count(DISTINCT game) >= 12)`
  ).c;
  // ── «Τώρα» — ΑΓΝΟΕΙ ΠΑΝΤΑ τα from/to ────────────────────────
  // Ζει σε ξεχωριστό μπλοκ και ΟΧΙ στο overview. Όσο βρισκόταν εκεί, η ίδια του
  // η θέση υπονοούσε ότι ακολουθεί το φίλτρο ενώ ποτέ δεν το έκανε: ο χρήστης
  // άλλαζε περίοδο, οι πέντε γειτονικές κάρτες άλλαζαν, αυτό έμενε σταθερό —
  // κάτω από την επιγραφή «Counts for the selected date range». Το όνομα του
  // μπλοκ είναι πλέον η προειδοποίηση: ό,τι μπαίνει εδώ δεν φιλτράρεται.
  const weekAgo = Date.now() - 7 * 86400000;
  const activeThisWeek = db.prepare(
    `SELECT count(DISTINCT learner_id) c FROM events WHERE ts >= ?`
  ).get(weekAgo).c;

  // ── Χωνί ────────────────────────────────────────────────────
  const distinct = (cond) => one(
    `SELECT count(DISTINCT learner_id) c FROM events {W} ${clause ? 'AND' : 'WHERE'} ${cond}`
  ).c;

  // «Μπήκαν» = ΟΠΟΙΟΣΔΗΠΟΤΕ που εμφανίζεται έστω και μία φορά στα events, όχι
  // μόνο όσοι έχουν session_start. Αν ένας εκπαιδευτικός ανοίξει την
  // καταγραφή ΕΝΩ τα παιδιά παίζουν ήδη, το session_start τους ποτέ δεν
  // καταγράφεται — αλλά τα game_finish τους ναι. Με session_start ως βάση,
  // «Τελείωσε παιχνίδι» θα ξεπερνούσε το «Μπήκαν» ακριβώς την πρώτη μέρα
  // που χρησιμοποιείται η λειτουργία, και το χωνί θα ανέβαινε αντί να πέφτει.
  const entered = one(`SELECT count(DISTINCT learner_id) c FROM events {W}`).c;
  // Κάθε βήμα εδώ σημαίνει «έφτασε ΤΟΥΛΑΧΙΣΤΟΝ ως εδώ», όχι «έχει ακριβώς αυτό
  // το event». Οι λίστες τύπων παρακάτω επικαλύπτονται ΣΚΟΠΙΜΑ: ένα παιδί με
  // μόνο game_finish (π.χ. ο δάσκαλος ενεργοποίησε την καταγραφή ΕΝΩ έπαιζαν
  // ήδη, οπότε hero_chosen/island_enter ποτέ δεν έφτασαν στον server) σίγουρα
  // πέρασε και από το «διάλεξε χαρακτήρα» και από το «μπήκε σε νησί» — απλώς
  // δεν το αποδεικνύει ξεχωριστό event. Αν κάθε βήμα μετρούσε ΜΟΝΟ τον δικό
  // του τύπο event, ένα τέτοιο παιδί θα εμφανιζόταν με 0 σε νωρίτερα βήματα
  // αλλά >0 στο «Τελείωσε παιχνίδι» — και το χωνί θα ανέβαινε. ΜΗΝ απλοποιήσεις
  // ξανά κάθε βήμα σε έναν μόνο τύπο event: έτσι έσπαγε η μονοτονία.
  const steps = [
    ['Started',            entered],
    ['Chose a character',  distinct(`type IN ('hero_chosen','island_enter','game_start','game_finish','game_abandon')`)],
    ['Entered an island',  distinct(`type IN ('island_enter','game_start','game_finish','game_abandon')`)],
    ['Finished a game',    distinct(`type='game_finish'`)],
    // DISTINCT εδώ είναι υποχρεωτικό: η εσωτερική ομαδοποίηση είναι ανά
    // (learner_id, island), άρα ένα παιδί που τελειώνει 3+ παιχνίδια σε
    // ΔΥΟ ή περισσότερα νησιά βγάζει δύο ή περισσότερες γραμμές. Χωρίς το
    // DISTINCT το count(*) μετράει ζευγάρια παιδί×νησί, όχι παιδιά — και το
    // χωνί μπορεί να ανέβει πάνω από το «Finished a game» ακριβώς στα παιδιά
    // που έχουν προχωρήσει περισσότερο.
    ['Finished an island', one(
      `SELECT count(DISTINCT learner_id) c FROM (
         SELECT learner_id FROM events {W} ${clause ? 'AND' : 'WHERE'} type='game_finish' AND passed=1 AND (${currentGameContext})
         GROUP BY learner_id, island HAVING count(DISTINCT game) >= 3)`).c],
    ['Reached 12/12',      finished12],
  ];
  const funnel = steps.map(([step, count]) => ({ step, count, pct: entered > 0 ? pct(count, entered) : null }));   // no visitors: no rate, not 0%

  // ── Ανά παιχνίδι ────────────────────────────────────────────
  const started = new Map(q(
    `SELECT game, count(*) c FROM events {W} ${clause ? 'AND' : 'WHERE'} type='game_start' GROUP BY game`
  ).map((r) => [r.game, r.c]));

  const finishRows = q(
    `SELECT game, count(*) c, avg(stars) st, count(stars) starsMeasured, count(score) scoresMeasured, avg(duration_s) du, count(duration_s) timedFinishes, avg(score) sc,
       sum(CASE WHEN passed=1 THEN 1 ELSE 0 END) successes,
       sum(CASE WHEN passed=0 THEN 1 ELSE 0 END) failures,
       sum(CASE WHEN passed IS NULL THEN 1 ELSE 0 END) unknown
     FROM events {W} ${clause ? 'AND' : 'WHERE'} type='game_finish' GROUP BY game`
  );
  const finished = new Map(finishRows.map((r) => [r.game, r]));
  const outcomes = finishRows.reduce((total, row) => ({
    passed: total.passed + row.successes,
    failed: total.failed + row.failures,
    unknown: total.unknown + row.unknown,
  }), { passed: 0, failed: 0, unknown: 0 });

  // Both ends must belong to the selected activity window. Never divide
  // unrelated historical finish events by starts from different attempts.
  const attemptRows = q(`WITH selected AS (SELECT * FROM events {W})
    SELECT s.game, count(*) started, count(f.id) finished
    FROM selected s LEFT JOIN selected f
      ON f.type='game_finish' AND f.learner_id=s.learner_id
      AND f.session_id=s.session_id AND f.attempt_id=s.attempt_id
      AND f.game=s.game AND f.island=s.island
    WHERE s.type='game_start' AND s.attempt_id IS NOT NULL
    GROUP BY s.game`);
  const attempts = new Map(attemptRows.map(row => [row.game, row]));

  // Ο μέσος τερματισμός όσων ΠΑΡΑΤΗΣΑΝ — το «πού ακριβώς κολλάνε» για το οποίο
  // καταγράφουμε εξαρχής τα game_abandon. Αποκλειστικά από game_abandon: τα
  // game_finish φέρουν progress 100 και θα τραβούσαν τον μέσο όρο στο 100%,
  // κρύβοντας ακριβώς την πληροφορία που ψάχνουμε.
  const quitRows = q(
    `SELECT game, avg(progress) pr FROM events {W} ${clause ? 'AND' : 'WHERE'}
     type='game_abandon' AND progress IS NOT NULL GROUP BY game`
  );
  const quit = new Map(quitRows.map((r) => [r.game, r.pr]));
  const timingRows = q(`SELECT game, count(*) measured,
    ${TIMING_FIELDS.map(key => `avg(${key}) ${key}`).join(', ')}
    FROM events {W} ${clause ? 'AND' : 'WHERE'}
    type IN ('game_finish','game_abandon') AND timing_version=1 GROUP BY game`);
  const timings = new Map(timingRows.map(row => [row.game, row]));

  // null (όχι 0) όπου δεν υπάρχει μέτρηση. Το 0 είναι ισχυρισμός («κανένα παιδί
  // δεν τα κατάφερε») ενώ η αλήθεια είναι «δεν έχουμε δεδομένα» — το panel το
  // αποδίδει ως «—». Ισχύει για ΟΛΟΝ τον πίνακα ώστε μια γραμμή να μη δείχνει
  // «—» στο σκορ και «0.0» στα αστέρια για τον ίδιο ακριβώς λόγο.
  const gameRow = (game) => {
    const f = finished.get(game);
    const s = started.get(game) || 0;
    const qp = quit.get(game);
    const attempt = attempts.get(game);
    return {
      game,
      started: s,
      finished: f ? f.c : 0,
      outcomes: { passed: f?.successes || 0, failed: f?.failures || 0, unknown: f?.unknown || 0 },
      trackedStarted: attempt?.started || 0,
      matchedFinished: attempt?.finished || 0,
      unpairedFinishes: (f?.c || 0) - (attempt?.finished || 0),
      pct: attempt ? pct(attempt.finished, attempt.started) : null,
      avgStars: f && f.st != null ? round1(f.st) : null,
      avgScore: f && f.sc != null ? Math.round(f.sc) : null,
      starsMeasured: f?.starsMeasured || 0,
      scoresMeasured: f?.scoresMeasured || 0,
      avgSeconds: f && f.du != null ? Math.round(f.du) : null,
      timedFinishes: f?.timedFinishes || 0,
      timing: { measured: timings.get(game)?.measured || 0,
        ...Object.fromEntries(TIMING_FIELDS.map(key => [key,
          timings.get(game)?.[key] == null ? null : Math.round(timings.get(game)[key])])) },
      avgQuitProgress: qp != null ? Math.round(qp) : null,
    };
  };

  // ── Ανά νησί ────────────────────────────────────────────────
  // Δύο μετρήσεις σε επίπεδο νησιού που τα events τις επέτρεπαν από την πρώτη
  // μέρα, αλλά καμία οθόνη δεν τις έδειχνε: ΠΟΙΑ νησιά αγγίζονται και σε ποια
  // φτάνουν στο 3/3. Το χωνί απαντούσε μόνο «μπήκε σε ΕΝΑ νησί», οπότε ένα νησί
  // που δεν το πάτησε ποτέ κανείς ήταν εντελώς αόρατο.
  //
  // Οι τύποι event επικαλύπτονται ΣΚΟΠΙΜΑ, για τον ίδιο λόγο με το χωνί: παιδί
  // που τελείωσε παιχνίδι σε ένα νησί βρέθηκε προφανώς σε αυτό, ακόμα κι αν το
  // island_enter του δεν έφτασε ποτέ στον server (καταγραφή που άνοιξε ενώ ήδη
  // έπαιζαν). Χωρίς την επικάλυψη, «τελείωσαν 3/3» θα μπορούσε να ξεπεράσει το
  // «μπήκαν» στο ίδιο νησί.
  const islandEntered = new Map(q(
    `SELECT island, count(DISTINCT learner_id) c FROM events {W} ${clause ? 'AND' : 'WHERE'}
     type IN ('island_enter','game_start','game_finish','game_abandon') AND island IS NOT NULL
     GROUP BY island`
  ).map((r) => [r.island, r.c]));

  // Το εσωτερικό GROUP BY δίνει ήδη μία γραμμή ανά (παιδί, νησί), και το
  // εξωτερικό χωρίζει ανά νησί — άρα μέσα σε κάθε νησί κάθε παιδί εμφανίζεται
  // το πολύ μία φορά και το count(*) μετράει παιδιά. (Στο χωνί χρειαζόταν
  // DISTINCT ακριβώς επειδή εκεί ΔΕΝ χωρίζαμε ανά νησί.)
  const islandFinished3 = new Map(q(
    `SELECT island, count(*) c FROM (
       SELECT learner_id, island FROM events {W} ${clause ? 'AND' : 'WHERE'}
       type='game_finish' AND passed=1 AND (${currentGameContext})
       GROUP BY learner_id, island HAVING count(DISTINCT game) >= 3)
     GROUP BY island`
  ).map((r) => [r.island, r.c]));

  // Μία διαδρομή στα game_finish του νησιού για τα δύο μεγέθη που δεν βγαίνουν
  // από μετρήσεις παιδιών: τα αστέρια και ο χρόνος. Η μονάδα εδώ είναι η
  // ΟΛΟΚΛΗΡΩΣΗ (ένα παιδί μπορεί να συνεισφέρει πολλές), σε αντίθεση με τα
  // entered/finishedAll3 πιο πάνω όπου η μονάδα είναι το παιδί.
  //
  // Τα count(stars) / count(duration_s) δεν είναι διακοσμητικά: το count(x)
  // μετράει ΜΟΝΟ τις μη-κενές τιμές και είναι ο σωστός παρονομαστής για κάθε
  // μέγεθος χωριστά. Μια ολοκλήρωση που έφτασε χωρίς αστέρια (παλιότερη έκδοση
  // του client, χαμένο πεδίο) δεν είναι «ολοκλήρωση με μηδέν αστέρια» — αν
  // έμπαινε στον παρονομαστή θα τραβούσε τον μέσο όρο προς τα κάτω σιωπηλά.
  const islandFinishRows = q(
    `SELECT island,
            avg(stars) st, count(stars) starsMeasured,
            sum(duration_s) secs, count(duration_s) timedFinishes
     FROM events {W} ${clause ? 'AND' : 'WHERE'}
     type='game_finish' AND island IS NOT NULL
     GROUP BY island`
  );
  const islandFinish = new Map(islandFinishRows.map((r) => [r.island, r]));

  const perIsland = ISLANDS.map((island) => {
    // Εδώ το 0 είναι σωστό και ΔΕΝ γίνεται «—»: «κανένα παιδί δεν μπήκε σε αυτό
    // το νησί» είναι μετρημένο γεγονός, όχι απουσία μέτρησης — και είναι ακριβώς
    // η πληροφορία που θέλει να δει ο δάσκαλος. Ό,τι ΠΑΡΑΓΕΤΑΙ από αυτά (μέσοι
    // όροι, ποσοστά, αθροίσματα) ακολουθεί τον αντίθετο κανόνα: null όταν ο
    // πληθυσμός του είναι άδειος, ώστε το panel να δείξει «—».
    const entered = islandEntered.get(island) || 0;
    const finishedAll3 = islandFinished3.get(island) || 0;
    const f = islandFinish.get(island);
    return {
      island,
      entered,
      finishedAll3,
      // ΠΑΡΟΝΟΜΑΣΤΗΣ = τα παιδιά ΑΥΤΟΥ του νησιού, όχι το σύνολο των παιδιών της
      // περιόδου. Η ερώτηση είναι «από όσους ΗΡΘΑΝ εδώ, πόσοι το ολοκλήρωσαν» —
      // μέτρο του ίδιου του νησιού. Με παρονομαστή όλα τα παιδιά θα μετρούσε
      // κάτι εντελώς άλλο (πόσο μακριά έφτασε η τάξη συνολικά) και κάθε νησί
      // πέρα από το πρώτο θα φαινόταν αποτυχημένο επειδή απλώς λίγοι πρόλαβαν
      // να φτάσουν ως εκεί.
      //
      // null ΜΟΝΟ όταν ο παρονομαστής είναι άδειος. Αν ήρθαν παιδιά και δεν
      // τελείωσε κανένα, το 0% είναι ΜΕΤΡΗΜΕΝΟ αποτέλεσμα και πρέπει να φανεί:
      // είναι ακριβώς το σήμα «το νησί ξεκινά αλλά δεν κλείνει».
      completionPct: entered > 0 ? pct(finishedAll3, entered) : null,
      avgStars: f && f.starsMeasured > 0 ? round1(f.st) : null,
      starsMeasured: f?.starsMeasured || 0,
      // Άθροισμα, όχι μέσος όρος — αλλά μένει null όταν ΚΑΜΙΑ ολοκλήρωση δεν
      // έφερε διάρκεια. Ένα «0 λεπτά εδώ» θα ήταν ισχυρισμός ότι τα παιδιά δεν
      // πέρασαν χρόνο στο νησί, ενώ χρόνο μετράμε μόνο στο game_finish: όποιος
      // μπήκε, έπαιξε και παράτησε δεν αφήνει δευτερόλεπτα πουθενά. Το «—» λέει
      // την αλήθεια — δεν έχουμε μέτρηση, όχι μηδέν χρόνο.
      totalSeconds: f && f.timedFinishes > 0 ? Math.round(f.secs) : null,
      timedFinishes: f?.timedFinishes || 0,
      games: ISLAND_GAMES[island].map(gameRow),
    };
  });

  // ── Κατανομή αστεριών ───────────────────────────────────────
  const starRows = q(
    `SELECT game, stars, count(*) c FROM events {W} ${clause ? 'AND' : 'WHERE'}
     type='game_finish' GROUP BY game, stars`
  );
  // Play Code activities redeemed, per configured activity id.
  const phygital = q(
    `SELECT game AS activity, count(*) AS redemptions, count(DISTINCT learner_id) AS profiles
     FROM events {W} ${clause ? 'AND' : 'WHERE'} type='phygital_redeem' GROUP BY game ORDER BY game`
  );
  // Historical finish IDs stay visible alongside the current twelve games.
  const historicalGames = [...new Set(starRows.map(row => row.game))]
    .filter(game => !GAMES.includes(game)).sort();
  const stars = [...GAMES, ...historicalGames].map((game) => {
    const pick = (n) => starRows.find((r) => r.game === game && r.stars === n)?.c || 0;
    return { game, s0: pick(0), s1: pick(1), s2: pick(2), s3: pick(3), unknown: pick(null) };
  });

  // ── Ποιοι παίζουν ───────────────────────────────────────────
  // Select visits from matching activity, then read their original start.
  // The start may precede the date range or the child's language selection.
  // No start means unknown, not a fabricated first visit.
  const visitRow = one(
    `WITH selected_visits AS (
       SELECT DISTINCT learner_id, session_id FROM events {W}
     ), classified AS (
       SELECT (SELECT e."returning" FROM events e
         WHERE e.learner_id=v.learner_id AND e.session_id=v.session_id
           AND e.type='session_start' ORDER BY e.ts, e.id LIMIT 1) AS status
       FROM selected_visits v
     ) SELECT
       coalesce(sum(CASE WHEN status=0 THEN 1 ELSE 0 END),0) firstVisits,
       coalesce(sum(CASE WHEN status=1 THEN 1 ELSE 0 END),0) returnVisits,
       coalesce(sum(CASE WHEN status IS NULL THEN 1 ELSE 0 END),0) unknownVisits
     FROM classified`
  );

  const langRows = q(
    `SELECT language, count(*) c FROM (
       SELECT DISTINCT learner_id, session_id, language FROM events {W} ${clause ? 'AND' : 'WHERE'}
       language IS NOT NULL) GROUP BY language`
  );
  const langCount = new Map(langRows.map((r) => [r.language, r.c]));
  // Και οι τέσσερις πάντα παρούσες, με 0 όπου δεν υπάρχουν — ίδια λογική με τα
  // δώδεκα παιχνίδια που εμφανίζονται όλα, ώστε η λίστα να μην αλλάζει μήκος
  // κάθε φορά που αλλάζει το φίλτρο.
  const languages = LANGS.map((language) => ({
    language, count: langCount.get(language) || 0,
  }));
  const gameLangRows = q(
    `SELECT language, count(DISTINCT learner_id) c FROM events {W} ${clause ? 'AND' : 'WHERE'}
     type IN ('game_start','game_finish','game_abandon') AND language IS NOT NULL
     GROUP BY language`
  );
  const gameLangCount = new Map(gameLangRows.map((r) => [r.language, r.c]));
  const gameLanguages = LANGS.map((language) => ({
    language, count: gameLangCount.get(language) || 0,
  }));

  return {
    now: { activeThisWeek },
    overview: {
      learners, gameProfiles, sessions, hours: visitLength.measured > 0 ? round1(seconds / 3600) : null,
      gamesFinished, finished12, missionsCompleted, abandoned,
      outcomes,
      // null (όχι 0) όταν καμία επίσκεψη δεν ανέφερε τέλος — ίδιος κανόνας με
      // τον πίνακα: «δεν έχουμε μέτρηση» δεν είναι «η επίσκεψη κράτησε 0».
      avgVisitSeconds: visitLength.measured > 0
        ? Math.round(seconds / visitLength.measured) : null,
      visitsMeasured: visitLength.measured,
    },
    funnel, perIsland, stars, phygital,
    audience: {
      visits: { first: visitRow.firstVisits, returning: visitRow.returnVisits, unknown: visitRow.unknownVisits },
      languages, gameLanguages,
    },
  };
}
