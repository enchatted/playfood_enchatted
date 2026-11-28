<?php
declare(strict_types=1);

const PF_ISLAND_GAMES = [
    'growing' => ['WhereDoesItGrow', 'GardenPlanner', 'SoilDoctor'],
    'local' => ['SeasonMatcher', 'MarketTrip', 'SpotTheFake'],
    'foodwaste' => ['FridgeManager', 'MealPlanner', 'LeftoverChef'],
    'circular' => ['CompostCreator', 'CircularCity', 'PlanetaryBoundaries'],
];
const PF_ISLANDS = ['growing', 'local', 'foodwaste', 'circular'];
const PF_GAMES = ['WhereDoesItGrow', 'GardenPlanner', 'SoilDoctor', 'SeasonMatcher', 'MarketTrip', 'SpotTheFake', 'FridgeManager', 'MealPlanner', 'LeftoverChef', 'CompostCreator', 'CircularCity', 'PlanetaryBoundaries'];
const PF_LANGS = ['en', 'nl', 'el', 'pt'];
const PF_TIMING_FIELDS = ['active_s', 'learning_s', 'paused_s', 'hidden_s', 'idle_s', 'other_s'];

function pf_now_ms(): int { return (int) floor(microtime(true) * 1000); }

function pf_open_db(string $file): PDO
{
    if ($file !== ':memory:' && !is_dir(dirname($file)) && !mkdir(dirname($file), 0700, true) && !is_dir(dirname($file))) {
        throw new RuntimeException('Cannot create data directory');
    }
    $db = new PDO('sqlite:' . $file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    if ($file !== ':memory:') chmod($file, 0600);
    $db->exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA secure_delete = ON');
    $db->exec('CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL,
        learner_id TEXT NOT NULL, session_id TEXT NOT NULL, type TEXT NOT NULL,
        island TEXT, game TEXT, score INTEGER, stars INTEGER, duration_s INTEGER,
        progress INTEGER, language TEXT, "returning" INTEGER
    ); CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_learner ON events(learner_id)');
    $db->exec('BEGIN IMMEDIATE');
    try {
        $columns = array_column($db->query('PRAGMA table_info(events)')->fetchAll(), 'name');
        $additions = array_fill_keys(['timing_version', ...PF_TIMING_FIELDS], 'INTEGER');
        $additions['attempt_id'] = 'TEXT';
        $additions['passed'] = 'INTEGER CHECK (passed IN (0,1) OR passed IS NULL)';
        foreach ($additions as $name => $definition) {
            if (!in_array($name, $columns, true)) $db->exec("ALTER TABLE events ADD COLUMN $name $definition");
        }
        $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_events_attempt ON events(
            learner_id, session_id, attempt_id,
            CASE WHEN type IN ('game_finish','game_abandon') THEN 'terminal' ELSE type END
        ) WHERE attempt_id IS NOT NULL");
        $db->exec('CREATE TABLE IF NOT EXISTS collection_diagnostics (
            id INTEGER PRIMARY KEY CHECK(id=1), since INTEGER NOT NULL,
            accepted INTEGER NOT NULL DEFAULT 0, lastAcceptedAt INTEGER,
            unauthorized INTEGER NOT NULL DEFAULT 0, invalid INTEGER NOT NULL DEFAULT 0,
            rateLimited INTEGER NOT NULL DEFAULT 0, dailyCap INTEGER NOT NULL DEFAULT 0
        )');
        $db->prepare('INSERT OR IGNORE INTO collection_diagnostics(id,since) VALUES(1,?)')->execute([pf_now_ms()]);
        $db->exec('COMMIT');
    } catch (Throwable $error) {
        $db->exec('ROLLBACK');
        throw $error;
    }
    return $db;
}

function pf_event_integer(mixed $value, int $min, int $max): int|false|null
{
    if ($value === null) return null;
    if ((!is_int($value) && !is_float($value)) || !is_finite((float) $value)) return false;
    // JavaScript Math.round rounds negative half values toward positive infinity.
    $rounded = floor($value + 0.5);
    return $rounded >= $min && $rounded <= $max ? (int) $rounded : false;
}

function pf_validate_event(mixed $body): array
{
    $bad = static fn(string $reason): array => ['ok' => false, 'reason' => $reason];
    if (is_object($body)) $body = get_object_vars($body);
    if (!is_array($body)) return $bad('not an object');
    foreach (['learner_id', 'session_id'] as $field) {
        $id = $body[$field] ?? '';
        if ((!is_string($id) && !is_int($id) && !is_float($id)) || !preg_match('/\A[A-Za-z0-9]{4,32}\z/D', (string) $id)) return $bad($field);
    }
    $type = $body['type'] ?? null;
    if (!in_array($type, ['session_start', 'hero_chosen', 'island_enter', 'game_start', 'game_finish', 'game_abandon', 'session_end', 'phygital_redeem'], true)) return $bad('type');
    $island = $body['island'] ?? null;
    if ($island !== null && !in_array($island, PF_ISLANDS, true)) return $bad('island');
    $game = $type === 'hero_chosen' ? null : ($body['game'] ?? null);
    if ($game !== null && !in_array($game, PF_GAMES, true)) return $bad('game');
    $gameEvent = in_array($type, ['game_start', 'game_finish', 'game_abandon'], true);
    if ($gameEvent && ($game === null || $island === null)) return $bad('game context required');
    if ($type === 'island_enter' && $island === null) return $bad('island required');
    if ($game !== null && $island !== null && !in_array($game, PF_ISLAND_GAMES[$island], true)) return $bad('game does not belong to island');
    $passed = $body['passed'] ?? null;
    if ($passed !== null && ($type !== 'game_finish' || !is_bool($passed))) return $bad('passed');
    $attempt = $body['attempt_id'] ?? null;
    if ($attempt !== null && (!is_string($attempt) || !preg_match('/\A[A-Za-z0-9]{4,32}\z/D', $attempt) || !$gameEvent)) return $bad('attempt_id or game context');
    $language = $body['language'] ?? null;
    if ($language !== null && !in_array($language, PF_LANGS, true)) return $bad('language');
    $numbers = [];
    foreach (['score' => [-10000, 10000], 'stars' => [0, 3], 'duration_s' => [0, 86400], 'progress' => [0, 100]] as $key => [$min, $max]) {
        $numbers[$key] = pf_event_integer($body[$key] ?? null, $min, $max);
        if ($numbers[$key] === false) return $bad('numeric range');
    }
    $timing = array_fill_keys(['timing_version', ...PF_TIMING_FIELDS], null);
    $hasTiming = false;
    foreach (array_keys($timing) as $key) if (isset($body[$key])) $hasTiming = true;
    if ($hasTiming) {
        if (!in_array($body['timing_version'] ?? null, [1, 1.0], true) || !$attempt || !in_array($type, ['game_finish', 'game_abandon'], true)) return $bad('timing context');
        $timing['timing_version'] = 1;
        $total = 0;
        foreach (PF_TIMING_FIELDS as $key) {
            $timing[$key] = pf_event_integer($body[$key] ?? null, 0, 86400);
            if ($timing[$key] === null || $timing[$key] === false) return $bad('timing range');
            $total += $timing[$key];
        }
        if ($total > 86400 || ($numbers['duration_s'] !== null && $total > $numbers['duration_s'] + 1)) return $bad('timing total');
    }
    if ($type === 'hero_chosen' && !in_array($body['hero'] ?? null, ['pigtails', 'braid', 'short', 'bob'], true)) return $bad('hero');
    // r2 P5: same rule as the Node server; the activity id travels in the game field.
    if ($type === 'phygital_redeem' && !preg_match('/^[A-Z][A-Z0-9_]{0,31}$/D', (string) ($body['activity'] ?? ''))) return $bad('activity');
    $returning = $body['returning'] ?? null;
    // Empty arrays/objects and the string "0" are truthy in JavaScript.
    $returning = !($returning === null || $returning === false || $returning === 0 || $returning === 0.0 || $returning === '');
    return ['ok' => true, 'value' => [
        'ts' => pf_now_ms(), 'learner_id' => (string) $body['learner_id'], 'session_id' => (string) $body['session_id'],
        'type' => $type, 'attempt_id' => $attempt, 'passed' => $passed === null ? null : (int) $passed,
        ...$timing, 'island' => $island, 'game' => $type === 'hero_chosen' ? $body['hero'] : ($type === 'phygital_redeem' ? (string) $body['activity'] : $game),
        ...$numbers, 'language' => $language, 'returning' => $type === 'session_start' ? (int) $returning : null,
    ]];
}

function pf_insert_event(PDO $db, array $event): bool
{
    $columns = ['ts', 'learner_id', 'session_id', 'type', 'island', 'game', 'score', 'stars', 'duration_s', 'progress', 'language', 'returning', 'attempt_id', 'passed', 'timing_version', ...PF_TIMING_FIELDS];
    $quoted = implode(', ', array_map(static fn($key) => '"' . $key . '"', $columns));
    $statement = $db->prepare('INSERT INTO events (' . $quoted . ') VALUES (' . implode(',', array_fill(0, count($columns), '?')) . ') ON CONFLICT DO NOTHING');
    $statement->execute(array_map(static fn($key) => $event[$key] ?? null, $columns));
    $inserted = $statement->rowCount() > 0;
    $db->prepare('UPDATE collection_diagnostics SET accepted=accepted+1,lastAcceptedAt=? WHERE id=1')->execute([pf_now_ms()]);
    return $inserted;
}

function pf_purge(PDO $db, int $months): void
{
    if ($months < 0) throw new InvalidArgumentException('Retention months must be nonnegative');
    $cutoff = new DateTimeImmutable();
    $cutoff = $cutoff->modify('-' . $months . ' months');
    $statement = $db->prepare('DELETE FROM events WHERE ts < ?');
    $statement->execute([(int) floor((float) $cutoff->format('U.u') * 1000)]);
    if ($statement->rowCount() > 0) $db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
}

function pf_count_today(PDO $db): int
{
    $start = (new DateTimeImmutable('today'))->getTimestamp() * 1000;
    $statement = $db->prepare('SELECT COUNT(*) FROM events WHERE ts >= ?');
    $statement->execute([$start]);
    return (int) $statement->fetchColumn();
}

function pf_diagnostics(PDO $db): array
{
    $row = $db->query('SELECT since,accepted,lastAcceptedAt,unauthorized,invalid,rateLimited,dailyCap FROM collection_diagnostics WHERE id=1')->fetch();
    return array_map(static fn($value) => $value === null ? null : (int) $value, $row);
}

function pf_record_rejection(PDO $db, string $reason): void
{
    if (!in_array($reason, ['unauthorized', 'invalid', 'rateLimited', 'dailyCap'], true)) throw new InvalidArgumentException('Invalid rejection counter');
    $db->exec('UPDATE collection_diagnostics SET "' . $reason . '"="' . $reason . '"+1 WHERE id=1');
}
