<?php
declare(strict_types=1);

// Execute the real authenticated export route with CLI globals; no HTTP server.
$_SERVER['DOCUMENT_ROOT'] = $argv[1];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $argv[2];
$_GET = ['route' => 'export.csv', ...json_decode($argv[3], true, 32, JSON_THROW_ON_ERROR)];
require $argv[1] . '/api/index.php';
