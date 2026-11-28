/**
 * Αυστηρή πύλη εισόδου. Ό,τι δεν περιγράφεται εδώ ΔΕΝ αποθηκεύεται ποτέ —
 * αυτό είναι που εγγυάται ότι δεν καταλήγει IP, όνομα ή ελεύθερο κείμενο στη βάση.
 * Τα ονόματα νησιών/παιχνιδιών είναι αντίγραφο του MISSION_MAP
 * (client/src/overworld/islandRoomData.js).
 */
export const EVENT_TYPES = [
  'session_start', 'hero_chosen', 'island_enter',
  'game_start', 'game_finish', 'game_abandon', 'session_end',
  'phygital_redeem', // a Play Code activity redeemed; only its configured activity id is kept
];

// Same shape as an activity id in phygital-codes.json (routes/phygital.js).
const ACTIVITY_ID = /^[A-Z][A-Z0-9_]{0,31}$/;

export const ISLANDS = ['growing', 'local', 'foodwaste', 'circular'];

// Ποιο παιχνίδι ανήκει σε ποιο νησί. Ο πίνακας «ανά παιχνίδι» του panel σπάει σε
// τέσσερις πίνακες με βάση ΑΥΤΟΝ τον χάρτη, οπότε είναι η μοναδική πηγή αλήθειας:
// το GAMES παράγεται από εδώ αντί να ξαναγραφτεί ως δεύτερη χειρόγραφη λίστα —
// δύο λίστες θα απέκλιναν στην πρώτη αλλαγή παιχνιδιού, και η απόκλιση θα ήταν
// αθόρυβη (ένα παιχνίδι θα εξαφανιζόταν από τους πίνακες χωρίς κανένα σφάλμα).
export const ISLAND_GAMES = {
  growing:   ['WhereDoesItGrow', 'GardenPlanner', 'SoilDoctor'],
  local:     ['SeasonMatcher', 'MarketTrip', 'SpotTheFake'],
  foodwaste: ['FridgeManager', 'MealPlanner', 'LeftoverChef'],
  circular:  ['CompostCreator', 'CircularCity', 'PlanetaryBoundaries'],
};

export const GAMES = ISLANDS.flatMap((island) => ISLAND_GAMES[island]);

export const HEROES = ['pigtails', 'braid', 'short', 'bob'];
// Εξάγεται ώστε το stats.js να δείχνει και τις τέσσερις γλώσσες (με 0 όπου δεν
// υπάρχουν) χωρίς δεύτερο αντίγραφο της λίστας — δύο λίστες θα αποκλίνανε.
export const LANGS = ['en', 'nl', 'el', 'pt'];

const ID = /^[A-Za-z0-9]{4,32}$/;
export const TIMING_FIELDS = ['active_s', 'learning_s', 'paused_s', 'hidden_s', 'idle_s', 'other_s'];

const int = (v, min, max) => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined; // undefined = άκυρο
  const n = Math.round(v);
  return n >= min && n <= max ? n : undefined;
};

export function validateEvent(raw) {
  const bad = (reason) => ({ ok: false, reason });
  if (!raw || typeof raw !== 'object') return bad('not an object');

  const { learner_id, session_id, type } = raw;
  if (!ID.test(String(learner_id ?? ''))) return bad('learner_id');
  if (!ID.test(String(session_id ?? ''))) return bad('session_id');
  if (!EVENT_TYPES.includes(type)) return bad('type');

  const island = raw.island == null ? null : (ISLANDS.includes(raw.island) ? raw.island : undefined);
  if (island === undefined) return bad('island');

  // Ο χαρακτήρας ταξιδεύει στο πεδίο hero για hero_chosen — δεν επικυρώνουμε game
  const game = (type === 'hero_chosen' || raw.game == null)
    ? null
    : (GAMES.includes(raw.game) ? raw.game : undefined);
  if (game === undefined) return bad('game');
  if (['game_start', 'game_finish', 'game_abandon'].includes(type) && (game === null || island === null)) {
    return bad('game context required');
  }
  if (type === 'island_enter' && island === null) return bad('island required');
  if (game !== null && island !== null && !ISLAND_GAMES[island].includes(game)) {
    return bad('game does not belong to island');
  }

  let passed = null;
  if (raw.passed !== undefined && raw.passed !== null) {
    if (type !== 'game_finish' || typeof raw.passed !== 'boolean'
      || !ISLAND_GAMES[island]?.includes(game)) return bad('passed');
    passed = raw.passed ? 1 : 0;
  }

  const attempt_id = raw.attempt_id ?? null;
  if (attempt_id !== null && (
    typeof attempt_id !== 'string' || !ID.test(attempt_id)
    || !['game_start', 'game_finish', 'game_abandon'].includes(type)
    || !ISLAND_GAMES[island]?.includes(game)
  )) return bad('attempt_id or game context');

  const language = raw.language == null ? null : (LANGS.includes(raw.language) ? raw.language : undefined);
  if (language === undefined) return bad('language');

  const score = int(raw.score, -10000, 10000);
  const stars = int(raw.stars, 0, 3);
  const duration_s = int(raw.duration_s, 0, 86400);
  const progress = int(raw.progress, 0, 100);
  if ([score, stars, duration_s, progress].includes(undefined)) return bad('numeric range');
  const timing = { timing_version: null, ...Object.fromEntries(TIMING_FIELDS.map(key => [key, null])) };
  if (raw.timing_version != null || TIMING_FIELDS.some(key => raw[key] != null)) {
    if (raw.timing_version !== 1 || !attempt_id || !['game_finish', 'game_abandon'].includes(type)) return bad('timing context');
    timing.timing_version = 1;
    for (const key of TIMING_FIELDS) {
      timing[key] = int(raw[key], 0, 86400);
      if (timing[key] == null) return bad('timing range');
    }
    const total = TIMING_FIELDS.reduce((sum, key) => sum + timing[key], 0);
    if (total > 86400 || (duration_s != null && total > duration_s + 1)) return bad('timing total');
  }

  // Ο χαρακτήρας ταξιδεύει στο πεδίο game· επικυρώνεται από τη δική του λίστα.
  if (type === 'hero_chosen' && !HEROES.includes(raw.hero)) return bad('hero');
  // The activity id travels in the game field, like the hero does.
  if (type === 'phygital_redeem' && !ACTIVITY_ID.test(String(raw.activity ?? ''))) return bad('activity');

  return {
    ok: true,
    value: {
      ts: Date.now(),               // ΠΑΝΤΑ του server — ο client δεν ορίζει χρόνο
      learner_id: String(learner_id),
      session_id: String(session_id),
      type,
      attempt_id,
      passed,
      ...timing,
      island,
      game: type === 'hero_chosen' ? raw.hero : type === 'phygital_redeem' ? String(raw.activity) : game,
      score, stars, duration_s, progress, language,
      // Only a visit start knows whether the browser had a saved ID; elsewhere it is no measurement.
      returning: type === 'session_start' ? (raw.returning ? 1 : 0) : null,
    },
  };
}
