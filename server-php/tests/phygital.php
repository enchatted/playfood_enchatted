<?php
declare(strict_types=1);
require_once __DIR__ . '/../src/phygital.php';

$directory = sys_get_temp_dir() . '/playfood-phygital-' . bin2hex(random_bytes(8));
mkdir($directory, 0700);
$file = $directory . '/activities.json';
$entry = ['id' => 'ACTIVITY', 'code' => 'TEST-CODE', 'points' => 50, 'island' => 'growing',
    'enabled' => true, 'description' => (object) ['en' => 'English', 'el' => 'Ελληνικά']];
$checks = 0;
function check(bool $condition, string $message): void
{
    global $checks;
    $checks++;
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function save_entries(string $file, array $entries): void
{
    file_put_contents($file, json_encode($entries, JSON_THROW_ON_ERROR));
}
try {
    check(pf_redeem($file, ['code' => 'TEST-CODE'])['status'] === 503, 'Missing configuration');
    save_entries($file, [$entry]);
    $result = pf_redeem($file, ['code' => ' test-code ', 'language' => 'el']);
    check($result['status'] === 200 && $result['body']['description'] === 'Ελληνικά', 'Localized redemption');
    check(pf_redeem($file, ['code' => 'TEST-CODE'])['status'] === 200, 'Different user can redeem same code');
    check(pf_redeem($file, ['code' => 'TEST-CODE', 'redeemedIds' => ['ACTIVITY']])['body']['reason'] === 'already_redeemed', 'Duplicate redemption');
    check(pf_redeem($file, ['code' => 'UNKNOWN'])['status'] === 400, 'Unknown code');
    check(pf_redeem($file, ['code' => 'TEST-CODE', 'redeemedIds' => null])['status'] === 400, 'Invalid redeemed ids');
    check(pf_redeem($file, ['code' => 'TEST-CODE', 'redeemedIds' => array_fill(0, 100, 'OTHER')])['body']['reason'] === 'limit_reached', 'Redemption limit');
    file_put_contents($file, '{bad');
    check(pf_redeem($file, ['code' => 'TEST-CODE'])['status'] === 200, 'Last valid cache');
    save_entries($file, [$entry, $entry]);
    check(pf_redeem($file, ['code' => 'TEST-CODE'])['status'] === 200, 'Duplicate configuration rejected');
    file_put_contents($file, str_repeat(' ', 65537));
    check(pf_redeem($file, ['code' => 'TEST-CODE'])['status'] === 200, 'Oversized configuration falls back');
    $entry['enabled'] = false;
    save_entries($file, [$entry]);
    check(pf_redeem($file, ['code' => 'TEST-CODE'])['status'] === 400, 'Reload disabled activity');
    $entry['enabled'] = true;
    $entry['description'] = new stdClass();
    save_entries($file, [$entry]);
    check(pf_redeem($file, ['code' => 'TEST-CODE'])['body']['description'] === '', 'Empty object description');
    check(pf_config_validate('[{"id":"A","code":"ABC","points":1,"island":"growing","enabled":true,"description":[]}]') === null, 'Array description rejected');
    check(pf_config_validate('[{"id":"A","code":"ABC","points":1,"island":"growing","enabled":true}]') !== null, 'Missing description defaults to object');
    check((fileperms($file . '.last-valid') & 0777) === 0600, 'Private cache permissions');
    echo "Phygital: $checks checks passed\n";
} finally {
    foreach (glob($directory . '/*') as $temporary) {
        unlink($temporary);
    }
    rmdir($directory);
}
