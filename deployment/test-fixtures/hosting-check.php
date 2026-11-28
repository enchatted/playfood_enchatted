<?php
// Temporary capability check. No installation, disk writes or configuration reads.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
ini_set('display_errors', '0');

$sqliteWorks = false;
$hashWorks = false;
$randomWorks = false;
$drivers = is_callable(array('PDO', 'getAvailableDrivers')) ? PDO::getAvailableDrivers() : array();
try {
    if (in_array('sqlite', $drivers, true)) {
        $db = new PDO('sqlite::memory:');
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->exec('CREATE TABLE capability_check (value INTEGER)');
        $db->exec('INSERT INTO capability_check VALUES (7)');
        $sqliteWorks = (int) $db->query('SELECT value FROM capability_check')->fetchColumn() === 7;
        $db = null;
    }
} catch (Throwable $error) {
    $sqliteWorks = false;
}
try {
    if (function_exists('password_hash') && function_exists('password_verify')) {
        $hashWorks = password_verify('temporary-check', password_hash('temporary-check', PASSWORD_DEFAULT));
    }
    if (function_exists('random_bytes')) {
        $randomWorks = strlen(random_bytes(16)) === 16;
    }
} catch (Throwable $error) {
    // Report capabilities only, never filesystem paths or exception messages.
}

echo json_encode(array(
    'php_executed' => true,
    'php_82_or_newer' => PHP_VERSION_ID >= 80200,
    'sqlite_memory_test' => $sqliteWorks,
    'pdo_mysql_available' => in_array('mysql', $drivers, true),
    'password_hashing' => $hashWorks,
    'secure_random' => $randomWorks,
    'persistent_storage_verified' => false,
    'full_platform_ready' => false
), JSON_PRETTY_PRINT);
