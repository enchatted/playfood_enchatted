<?php
declare(strict_types=1);

const PF_STATS_ISLAND_GAMES = [
    'growing' => ['WhereDoesItGrow', 'GardenPlanner', 'SoilDoctor'],
    'local' => ['SeasonMatcher', 'MarketTrip', 'SpotTheFake'],
    'foodwaste' => ['FridgeManager', 'MealPlanner', 'LeftoverChef'],
    'circular' => ['CompostCreator', 'CircularCity', 'PlanetaryBoundaries'],
];
const PF_STATS_TIMING_FIELDS = ['active_s', 'learning_s', 'paused_s', 'hidden_s', 'idle_s', 'other_s'];

function pf_range(?string $from = null, ?string $to = null, ?string $language = null): array
{
    $where = [];
    $args = [];
    foreach ([[$from, '>='], [$to, '<=']] as [$date, $operator]) {
        if ($date) {
            // Some PDO SQLite builds truncate integer callback arguments to 32 bits.
            $where[] = "pf_local_date(CAST(ts AS TEXT)) $operator ?";
            $args[] = $date;
        }
    }
    if ($language) {
        $where[] = 'language = ?';
        $args[] = $language;
    }
    return ['clause' => $where ? 'WHERE ' . implode(' AND ', $where) : '', 'args' => $args];
}

function pf_compute_stats(PDO $db, array $filters = []): array
{
    // SQLite's localtime uses the host timezone, not PHP's configured timezone.
    $db->sqliteCreateFunction('pf_local_date', static fn($ts) => date('Y-m-d', (int) floor($ts / 1000)), 1);
    ['clause' => $clause, 'args' => $args] = pf_range($filters['from'] ?? null, $filters['to'] ?? null, $filters['language'] ?? null);
    $and = $clause ? 'AND' : 'WHERE';
    // Interpolate only the trusted catalogue constants, never filter values.
    $currentGameContext = implode(' OR ', array_map(
        static fn($island) => "(island='$island' AND game IN ('" . implode("','", PF_STATS_ISLAND_GAMES[$island]) . "'))",
        array_keys(PF_STATS_ISLAND_GAMES)
    ));
    $q = static function (string $sql) use ($db, $clause, $args): array {
        $statement = $db->prepare(str_replace('{W}', $clause, $sql));
        $statement->execute($args);
        return $statement->fetchAll(PDO::FETCH_ASSOC);
    };
    $one = static fn(string $sql) => $q($sql)[0];
    $index = static function (array $rows, string $key): array {
        $result = [];
        foreach ($rows as $row) $result[$row[$key]] = $row;
        return $result;
    };
    // Match JavaScript Math.round, including negative half-integers.
    $round = static fn($value) => (int) floor($value + 0.5);
    $round1 = static fn($value) => floor($value * 10 + 0.5) / 10;
    $pct = static fn($n, $d) => $d > 0 ? floor($n / $d * 1000 + 0.5) / 10 : 0;
    $learners = $one('SELECT count(DISTINCT learner_id) c FROM events {W}')['c'];
    $gameProfiles = $one("SELECT count(DISTINCT learner_id) c FROM events {W} $and
        type IN ('game_start','game_finish','game_abandon')")['c'];
    $sessions = $one('SELECT count(*) c FROM (SELECT DISTINCT learner_id, session_id FROM events {W})')['c'];
    $visitLength = $one("WITH ranked_ends AS (
        SELECT *, row_number() OVER (PARTITION BY learner_id, session_id ORDER BY ts DESC, id DESC) rn
        FROM events WHERE type='session_end'
      ) SELECT sum(duration_s) total, count(duration_s) measured FROM ranked_ends {W} $and rn=1");
    $gamesFinished = $one("SELECT count(*) c FROM events {W} $and type='game_finish'")['c'];
    // r2 P1: same as the Node server, one mission per browser profile and game.
    $missionsCompleted = $one("SELECT count(*) c FROM (
        SELECT DISTINCT learner_id, game FROM events {W} $and type='game_finish' AND passed=1)")['c'];
    $abandoned = $one("SELECT count(*) c FROM events {W} $and type='game_abandon'")['c'];
    $finished12 = $one("SELECT count(*) c FROM (
        SELECT learner_id FROM events {W} $and type='game_finish' AND passed=1 AND ($currentGameContext)
        GROUP BY learner_id HAVING count(DISTINCT game)>=12)")['c'];
    $active = $db->prepare('SELECT count(DISTINCT learner_id) FROM events WHERE ts >= ?');
    $active->execute([(int) floor(microtime(true) * 1000) - 7 * 86400000]);
    $activeThisWeek = (int) $active->fetchColumn();
    $distinct = static fn(string $condition) => $one("SELECT count(DISTINCT learner_id) c FROM events {W} $and $condition")['c'];
    $steps = [
        ['Started', $learners],
        ['Chose a character', $distinct("type IN ('hero_chosen','island_enter','game_start','game_finish','game_abandon')")],
        ['Entered an island', $distinct("type IN ('island_enter','game_start','game_finish','game_abandon')")],
        ['Finished a game', $distinct("type='game_finish'")],
        ['Finished an island', $one("SELECT count(DISTINCT learner_id) c FROM (
            SELECT learner_id FROM events {W} $and type='game_finish' AND passed=1 AND ($currentGameContext)
            GROUP BY learner_id, island HAVING count(DISTINCT game)>=3)")['c']],
        ['Reached 12/12', $finished12],
    ];
    $funnel = array_map(static fn($step) => ['step' => $step[0], 'count' => $step[1], 'pct' => $learners > 0 ? $pct($step[1], $learners) : null], $steps);
    $started = $index($q("SELECT game, count(*) c FROM events {W} $and type='game_start' GROUP BY game"), 'game');
    $finished = $index($q("SELECT game, count(*) c, avg(stars) st, count(stars) starsMeasured,
        count(score) scoresMeasured, avg(duration_s) du, count(duration_s) timedFinishes, avg(score) sc,
        sum(CASE WHEN passed=1 THEN 1 ELSE 0 END) successes,
        sum(CASE WHEN passed=0 THEN 1 ELSE 0 END) failures,
        sum(CASE WHEN passed IS NULL THEN 1 ELSE 0 END) unknown
        FROM events {W} $and type='game_finish' GROUP BY game"), 'game');
    $outcomes = ['passed' => 0, 'failed' => 0, 'unknown' => 0];
    foreach ($finished as $row) {
        $outcomes['passed'] += $row['successes'];
        $outcomes['failed'] += $row['failures'];
        $outcomes['unknown'] += $row['unknown'];
    }
    $attempts = $index($q("WITH selected AS (SELECT * FROM events {W})
        SELECT s.game, count(*) started, count(f.id) finished FROM selected s LEFT JOIN selected f
        ON f.type='game_finish' AND f.learner_id=s.learner_id AND f.session_id=s.session_id
        AND f.attempt_id=s.attempt_id AND f.game=s.game AND f.island=s.island
        WHERE s.type='game_start' AND s.attempt_id IS NOT NULL GROUP BY s.game"), 'game');
    $quit = $index($q("SELECT game, avg(progress) pr FROM events {W} $and
        type='game_abandon' AND progress IS NOT NULL GROUP BY game"), 'game');
    $timingColumns = implode(', ', array_map(static fn($key) => "avg($key) $key", PF_STATS_TIMING_FIELDS));
    $timings = $index($q("SELECT game, count(*) measured, $timingColumns FROM events {W} $and
        type IN ('game_finish','game_abandon') AND timing_version=1 GROUP BY game"), 'game');
    $gameRow = static function (string $game) use ($started, $finished, $attempts, $quit, $timings, $pct, $round, $round1): array {
        $f = $finished[$game] ?? [];
        $attempt = $attempts[$game] ?? null;
        $timing = ['measured' => $timings[$game]['measured'] ?? 0];
        foreach (PF_STATS_TIMING_FIELDS as $key) {
            $value = $timings[$game][$key] ?? null;
            $timing[$key] = $value === null ? null : $round($value);
        }
        return [
            'game' => $game, 'started' => $started[$game]['c'] ?? 0, 'finished' => $f['c'] ?? 0,
            'outcomes' => ['passed' => $f['successes'] ?? 0, 'failed' => $f['failures'] ?? 0, 'unknown' => $f['unknown'] ?? 0],
            'trackedStarted' => $attempt['started'] ?? 0, 'matchedFinished' => $attempt['finished'] ?? 0,
            'unpairedFinishes' => ($f['c'] ?? 0) - ($attempt['finished'] ?? 0),
            'pct' => $attempt ? $pct($attempt['finished'], $attempt['started']) : null,
            'avgStars' => isset($f['st']) ? $round1($f['st']) : null,
            'avgScore' => isset($f['sc']) ? $round($f['sc']) : null,
            'starsMeasured' => $f['starsMeasured'] ?? 0, 'scoresMeasured' => $f['scoresMeasured'] ?? 0,
            'avgSeconds' => isset($f['du']) ? $round($f['du']) : null, 'timedFinishes' => $f['timedFinishes'] ?? 0,
            'timing' => $timing, 'avgQuitProgress' => isset($quit[$game]['pr']) ? $round($quit[$game]['pr']) : null,
        ];
    };
    $islandEntered = $index($q("SELECT island, count(DISTINCT learner_id) c FROM events {W} $and
        type IN ('island_enter','game_start','game_finish','game_abandon') AND island IS NOT NULL GROUP BY island"), 'island');
    $islandFinished3 = $index($q("SELECT island, count(*) c FROM (
        SELECT learner_id, island FROM events {W} $and type='game_finish' AND passed=1 AND ($currentGameContext)
        GROUP BY learner_id, island HAVING count(DISTINCT game)>=3) GROUP BY island"), 'island');
    $islandFinish = $index($q("SELECT island, avg(stars) st, count(stars) starsMeasured,
        sum(duration_s) secs, count(duration_s) timedFinishes FROM events {W} $and
        type='game_finish' AND island IS NOT NULL GROUP BY island"), 'island');
    $perIsland = [];
    foreach (PF_STATS_ISLAND_GAMES as $island => $games) {
        $entered = $islandEntered[$island]['c'] ?? 0;
        $finishedAll3 = $islandFinished3[$island]['c'] ?? 0;
        $f = $islandFinish[$island] ?? [];
        $perIsland[] = [
            'island' => $island, 'entered' => $entered, 'finishedAll3' => $finishedAll3,
            'completionPct' => $entered > 0 ? $pct($finishedAll3, $entered) : null,
            'avgStars' => ($f['starsMeasured'] ?? 0) > 0 ? $round1($f['st']) : null,
            'starsMeasured' => $f['starsMeasured'] ?? 0,
            'totalSeconds' => ($f['timedFinishes'] ?? 0) > 0 ? $round($f['secs']) : null,
            'timedFinishes' => $f['timedFinishes'] ?? 0, 'games' => array_map($gameRow, $games),
        ];
    }
    // r2 P5: same as the Node server, Play Code activities redeemed per activity id.
    $phygital = array_map(fn($r) => ['activity' => $r['activity'], 'redemptions' => (int) $r['redemptions'], 'profiles' => (int) $r['profiles']],
        $q("SELECT game AS activity, count(*) AS redemptions, count(DISTINCT learner_id) AS profiles FROM events {W} $and type='phygital_redeem' GROUP BY game ORDER BY game"));
    $starRows = $q("SELECT game, stars, count(*) c FROM events {W} $and type='game_finish' GROUP BY game, stars");
    $currentGames = array_merge(...array_values(PF_STATS_ISLAND_GAMES));
    $historicalGames = array_values(array_diff(array_unique(array_column($starRows, 'game')), $currentGames));
    sort($historicalGames, SORT_STRING);
    $stars = [];
    foreach (array_merge($currentGames, $historicalGames) as $game) {
        $row = ['game' => $game, 's0' => 0, 's1' => 0, 's2' => 0, 's3' => 0, 'unknown' => 0];
        foreach ($starRows as $star) {
            if ($star['game'] === $game) $row[$star['stars'] === null ? 'unknown' : 's' . $star['stars']] = $star['c'];
        }
        $stars[] = $row;
    }
    $visits = $one('WITH selected_visits AS (SELECT DISTINCT learner_id, session_id FROM events {W}),
        classified AS (SELECT (SELECT e."returning" FROM events e
            WHERE e.learner_id=v.learner_id AND e.session_id=v.session_id AND e.type=\'session_start\'
            ORDER BY e.ts, e.id LIMIT 1) AS status FROM selected_visits v)
        SELECT coalesce(sum(CASE WHEN status=0 THEN 1 ELSE 0 END),0) firstVisits,
            coalesce(sum(CASE WHEN status=1 THEN 1 ELSE 0 END),0) returnVisits,
            coalesce(sum(CASE WHEN status IS NULL THEN 1 ELSE 0 END),0) unknownVisits FROM classified');
    $langCounts = $index($q("SELECT language, count(*) c FROM (
        SELECT DISTINCT learner_id, session_id, language FROM events {W} $and language IS NOT NULL) GROUP BY language"), 'language');
    $gameLangCounts = $index($q("SELECT language, count(DISTINCT learner_id) c FROM events {W} $and
        type IN ('game_start','game_finish','game_abandon') AND language IS NOT NULL GROUP BY language"), 'language');
    return [
        'now' => ['activeThisWeek' => $activeThisWeek],
        'overview' => [
            'learners' => $learners, 'gameProfiles' => $gameProfiles, 'sessions' => $sessions,
            'hours' => $visitLength['measured'] > 0 ? $round1($visitLength['total'] / 3600) : null,
            'gamesFinished' => $gamesFinished, 'finished12' => $finished12, 'missionsCompleted' => $missionsCompleted, 'abandoned' => $abandoned, 'outcomes' => $outcomes,
            'avgVisitSeconds' => $visitLength['measured'] > 0 ? $round($visitLength['total'] / $visitLength['measured']) : null,
            'visitsMeasured' => $visitLength['measured'],
        ],
        'funnel' => $funnel, 'perIsland' => $perIsland, 'stars' => $stars, 'phygital' => $phygital,
        'audience' => [
            'visits' => ['first' => $visits['firstVisits'], 'returning' => $visits['returnVisits'], 'unknown' => $visits['unknownVisits']],
            'languages' => array_map(static fn($language) => ['language' => $language, 'count' => $langCounts[$language]['c'] ?? 0], ['en', 'nl', 'el', 'pt']),
            'gameLanguages' => array_map(static fn($language) => ['language' => $language, 'count' => $gameLangCounts[$language]['c'] ?? 0], ['en', 'nl', 'el', 'pt']),
        ],
    ];
}
