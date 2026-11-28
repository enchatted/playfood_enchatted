<?php
declare(strict_types=1);
require_once __DIR__ . '/../src/data.php';

function data_check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$base = ['learner_id' => 'abcd1234', 'session_id' => 'session1', 'type' => 'game_finish', 'island' => 'foodwaste', 'game' => 'FridgeManager', 'attempt_id' => 'attempt1', 'passed' => false];
$result = pf_validate_event($base + ['score' => -1.5, 'ts' => 1, 'ip' => '192.0.2.1', 'returning' => '0']);
data_check($result['ok'], 'valid event');
data_check($result['value']['score'] === -1 && $result['value']['passed'] === 0, 'JS rounding and boolean conversion');
data_check($result['value']['ts'] > 1 && !isset($result['value']['ip']), 'server time and whitelist');
data_check($result['value']['returning'] === null, 'returning is only measured on a visit start');
data_check(pf_validate_event(['learner_id' => 'abcd1234', 'session_id' => 'session1', 'type' => 'session_start', 'returning' => '0'])['value']['returning'] === 1, 'JS truthiness');
foreach ([['score' => '1'], ['score' => INF], ['passed' => 0], ['island' => 'local'], ['attempt_id' => 'bad!'], ['language' => 'fr'], ['stars' => 3.5], ['game' => null]] as $override) {
    data_check(!pf_validate_event(array_replace($base, $override))['ok'], 'invalid event: ' . json_encode($override, JSON_PARTIAL_OUTPUT_ON_ERROR));
}
$timing = ['timing_version' => 1.0, 'duration_s' => 10, 'active_s' => 5, 'learning_s' => 5, 'paused_s' => 1, 'hidden_s' => 0, 'idle_s' => 0, 'other_s' => 0];
data_check(pf_validate_event($base + $timing)['ok'], 'one second timing tolerance');
data_check(!pf_validate_event(array_replace($base + $timing, ['other_s' => 1]))['ok'], 'timing exceeds tolerance');
data_check(!pf_validate_event(array_replace($base + $timing, ['idle_s' => null]))['ok'], 'timing requires all fields');
data_check(!pf_validate_event(null)['ok'], 'invalid body');
$hero = pf_validate_event(['learner_id' => 'abcd', 'session_id' => 'efgh', 'type' => 'hero_chosen', 'hero' => 'bob', 'game' => 'arbitrary']);
data_check($hero['ok'] && $hero['value']['game'] === 'bob', 'hero stored in game');

$db = pf_open_db(':memory:');
data_check(pf_insert_event($db, $result['value']), 'first insert');
data_check(!pf_insert_event($db, $result['value']), 'duplicate ignored');
$abandon = pf_validate_event(array_replace($base, ['type' => 'game_abandon', 'passed' => null]))['value'];
data_check(!pf_insert_event($db, $abandon), 'only one terminal per attempt');
$start = pf_validate_event(array_replace($base, ['type' => 'game_start', 'passed' => null]))['value'];
data_check(pf_insert_event($db, $start), 'start allowed for same attempt');
data_check(pf_count_today($db) === 2, 'count today');
pf_record_rejection($db, 'invalid');
$diagnostics = pf_diagnostics($db);
data_check($diagnostics['accepted'] === 4 && $diagnostics['invalid'] === 1 && $diagnostics['lastAcceptedAt'] !== null, 'diagnostic counters include valid duplicate requests');
try {
    pf_record_rejection($db, 'ip');
    throw new RuntimeException('Expected invalid counter failure');
} catch (InvalidArgumentException $expected) {}
$db->exec('UPDATE events SET ts=1');
data_check(pf_count_today($db) === 0, 'old events not today');
pf_purge($db, 24);
data_check((int) $db->query('SELECT COUNT(*) FROM events')->fetchColumn() === 0, 'purge old rows');

// Check migration of an existing Node-shaped legacy database without timing columns.
$file = tempnam(sys_get_temp_dir(), 'pf-data-');
try {
    $legacy = new PDO('sqlite:' . $file);
    $legacy->exec('CREATE TABLE events(id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, learner_id TEXT NOT NULL, session_id TEXT NOT NULL, type TEXT NOT NULL, island TEXT, game TEXT, score INTEGER, stars INTEGER, duration_s INTEGER, progress INTEGER, language TEXT, "returning" INTEGER)');
    $legacy = null;
    $migrated = pf_open_db($file);
    data_check(pf_insert_event($migrated, $result['value']), 'insert after legacy schema migration');
    $migrated = null;
    $reopened = pf_open_db($file);
    data_check(pf_diagnostics($reopened)['accepted'] === 1, 'diagnostics persist across PHP requests');
    $reopened = null;
} finally {
    foreach ([$file, $file . '-wal', $file . '-shm'] as $path) if (is_file($path)) unlink($path);
}
echo "Data tests passed\n";
