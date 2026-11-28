<?php
declare(strict_types=1);
require __DIR__ . '/../src/stats.php';
date_default_timezone_set($argv[2]);
$db = new PDO('sqlite:' . $argv[1], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
echo json_encode(pf_compute_stats($db, json_decode($argv[3], true)), JSON_THROW_ON_ERROR);
