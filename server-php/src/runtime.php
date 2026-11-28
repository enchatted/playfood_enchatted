<?php
declare(strict_types=1);
header_remove('X-Powered-By');

function pf_json(array $body, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function pf_private_dir(): string {
    $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    if (!$root || $root === DIRECTORY_SEPARATOR) throw new RuntimeException('Invalid document root');
    // Stable across ZIP updates, outside the public document root; never fall back to public storage.
    $base = dirname($root);
    // Add-on domains may be nested under the main domain's public_html.
    for ($dir=$root; $dir !== dirname($dir); $dir=dirname($dir)) {
        if (in_array(strtolower(basename($dir)), ['public_html','www','htdocs','httpdocs','public'],true)) $base=dirname($dir);
    }
    return $base . '/playfood-private-' . substr(hash('sha256', $root), 0, 12);
}

function pf_write_json(string $file, array $value): void {
    $tmp = $file . '.tmp-' . bin2hex(random_bytes(8));
    try {
        if (file_put_contents($tmp, json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), LOCK_EX) === false) {
            throw new RuntimeException('Cannot write settings');
        }
        chmod($tmp, 0600);
        if (!rename($tmp, $file)) throw new RuntimeException('Cannot save settings');
    } finally { if (is_file($tmp)) unlink($tmp); }
}

function pf_body(): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 32768) pf_json(['error'=>'Request too large'], 413);
    $raw = file_get_contents('php://input', false, null, 0, 32769);
    if ($raw === false || strlen($raw) > 32768) pf_json(['error'=>'Request too large'], 413);
    try { $value = json_decode($raw, false, 32, JSON_THROW_ON_ERROR); }
    catch (Throwable $e) { pf_json(['error'=>'Invalid JSON'], 400); }
    if (!$value instanceof stdClass) pf_json(['error'=>'Expected object'], 400);
    return get_object_vars($value);
}

function pf_auth_tables(PDO $db): void {
    $db->exec('CREATE TABLE IF NOT EXISTS panel_sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS request_limits (bucket TEXT PRIMARY KEY, n INTEGER NOT NULL, expires INTEGER NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS maintenance (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
}

function pf_limit(PDO $db, string $bucket, int $max): bool {
    $now = time();
    $db->beginTransaction();
    try {
        $db->prepare('DELETE FROM request_limits WHERE expires <= ?')->execute([$now]);
        $q = $db->prepare('INSERT INTO request_limits(bucket,n,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET n=n+1 RETURNING n');
        $q->execute([$bucket, $now + 60]);
        $count = (int)$q->fetchColumn();
        $q->closeCursor();
        $db->commit();
        return $count <= $max;
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}

function pf_session(PDO $db): string {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer ([a-f0-9]{48})$/D', $auth, $match)) pf_json(['error'=>'not signed in'], 401);
    $now = time();
    $db->prepare('DELETE FROM panel_sessions WHERE expires <= ?')->execute([$now]);
    $q = $db->prepare('UPDATE panel_sessions SET expires=? WHERE token_hash=? AND expires>? RETURNING email');
    $q->execute([$now + 1800, hash('sha256', $match[1]), $now]);
    $email = $q->fetchColumn();
    $q->closeCursor();
    if (!$email) pf_json(['error'=>'not signed in'], 401);
    return $email;
}

function pf_filters(): array {
    $result = ['from'=>null, 'to'=>null, 'language'=>null];
    foreach (['from', 'to'] as $key) {
        $v = $_GET[$key] ?? '';
        if (!is_string($v)) pf_json(['error'=>'Invalid date'], 400);
        if ($v === '') continue;
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $v);
        if (!$d || $d->format('Y-m-d') !== $v) pf_json(['error'=>'Invalid date'], 400);
        $result[$key] = $v;
    }
    $lang = $_GET['language'] ?? '';
    if (!is_string($lang) || ($lang !== '' && !in_array($lang, ['en','el','nl','pt'], true))) pf_json(['error'=>'Unsupported language'], 400);
    $result['language'] = $lang ?: null;
    if ($result['from'] && $result['to'] && $result['from'] > $result['to']) pf_json(['error'=>'Invalid range'], 400);
    return $result;
}
