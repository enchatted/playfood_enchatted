<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/lib/runtime.php';
try {
    $private = pf_private_dir();
    if (!is_file($private . '/installation.json')) pf_json(['error'=>'Complete /setup.php first', 'tracking'=>false], 503);
    $cfg = json_decode(file_get_contents($private . '/installation.json'), true, 32, JSON_THROW_ON_ERROR);
    date_default_timezone_set($cfg['timezone']);
    require __DIR__ . '/lib/data.php';
    require __DIR__ . '/lib/stats.php';
    require __DIR__ . '/lib/phygital.php';
    $db = pf_open_db($private . '/playfood.db');
    pf_auth_tables($db);
    $today = date('Y-m-d');
    $last = $db->query("SELECT value FROM maintenance WHERE key='purged'")->fetchColumn();
    if ($last !== $today) {
        pf_purge($db, (int)$cfg['retention_months']);
        $db->prepare("INSERT INTO maintenance(key,value) VALUES ('purged',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")->execute([$today]);
    }
    $route = $_GET['route'] ?? '';
    if (!is_string($route)) pf_json(['error'=>'Not found'], 404);
    $route = trim($route, '/');
    $method = $_SERVER['REQUEST_METHOD'];
    $body = $method === 'POST' && $route !== 'logout' ? pf_body() : [];
    if ($route === 'config' && $method === 'GET') pf_json(['tracking'=>$cfg['enabled'] === true]);
    if ($route === 'health' && $method === 'GET') pf_json(['db'=>true,'tracking'=>$cfg['enabled'] === true,'eventsToday'=>pf_count_today($db)]);
    if ($route === 'ev' && $method === 'POST') {
        if (!$cfg['enabled']) { http_response_code(204); exit; }
        $sent = $_SERVER['HTTP_X_PF_SECRET'] ?? $body['secret'] ?? null;
        if (!is_string($sent) || !hash_equals($cfg['event_secret'], $sent)) { pf_record_rejection($db, 'unauthorized'); pf_json(['error'=>'Unauthorized'],401); }
        // Installation-wide burst protection: no IP addresses stored, including hashed addresses.
        if (!pf_limit($db, 'events', 5000)) { pf_record_rejection($db, 'rateLimited'); pf_json(['error'=>'Rate limited'],429); }
        if (pf_count_today($db) >= $cfg['max_events_per_day']) { pf_record_rejection($db,'dailyCap'); http_response_code(204); exit; }
        $result = pf_validate_event($body);
        if (!$result['ok']) { pf_record_rejection($db, 'invalid'); pf_json(['error'=>$result['reason'] ?? 'Invalid event'],400); }
        pf_insert_event($db, $result['value']);
        http_response_code(204); exit;
    }
    if ($route === 'phygital/redeem' && $method === 'POST') {
        if (!pf_limit($db, 'phygital', 1200)) pf_json(['success'=>false,'reason'=>'unavailable'],429);
        $result = pf_redeem($private . '/phygital-codes.json', $body);
        pf_json($result['body'], $result['status']);
    }
    if ($route === 'logout' && $method === 'POST') {
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        $db->prepare('DELETE FROM panel_sessions WHERE token_hash=?')->execute([hash('sha256', preg_replace('/^Bearer /','',$auth))]);
        pf_json(['ok'=>true]);
    }
    if (!in_array($route, ['login','session','stats','export.csv','backup'],true)) pf_json(['error'=>'Not found'],404);
    if (!$cfg['enabled']) pf_json(['error'=>'panel disabled'],503);
    if ($route === 'login' && $method === 'POST') {
        $email = is_string($body['email'] ?? null) ? trim($body['email']) : '';
        $loginBucket = $email === $cfg['email'] ? 'login' : 'login:unknown';
        if (!pf_limit($db,$loginBucket,30)) pf_json(['error'=>'Too many attempts; wait one minute'],429);
        $password = $body['password'] ?? null;
        if (!is_string($password) || strlen($password)>1024 || $email !== $cfg['email'] || !password_verify($password,$cfg['password_hash'])) pf_json(['error'=>'wrong email or password'],401);
        $token = bin2hex(random_bytes(24));
        $db->prepare('DELETE FROM panel_sessions WHERE expires<=?')->execute([time()]);
        $db->prepare('INSERT INTO panel_sessions VALUES (?,?,?)')->execute([hash('sha256',$token),$email,time()+1800]);
        pf_json(['token'=>$token]);
    }
    if ($method !== 'GET') pf_json(['error'=>'Method not allowed'],405);
    $email = pf_session($db);
    if ($route === 'session') pf_json(['email'=>$email]);
    if ($route === 'stats') {
        $stats = pf_compute_stats($db, pf_filters());
        $stats['now'] = array_merge($stats['now'], ['db'=>true,'tracking'=>true,'eventsToday'=>pf_count_today($db),'collection'=>pf_diagnostics($db)]);
        pf_json($stats);
    }
    if ($route === 'export.csv') {
        $filter = pf_filters();
        $db->sqliteCreateFunction('pf_local_date',fn($ts)=>date('Y-m-d',(int)floor($ts/1000)),1);
        ['clause'=>$clause,'args'=>$args]=pf_range($filter['from'],$filter['to'],$filter['language']);
        // Match the stats cohort; only explicitly scoped start/end/hero context can extend it.
        $context=$filter['language'] ? "UNION ALL
            SELECT e.*, 'visit_context' AS row_scope FROM events e
            WHERE e.type IN ('session_start','session_end','hero_chosen')
              AND EXISTS (SELECT 1 FROM selected_visits v
                WHERE v.learner_id=e.learner_id AND v.session_id=e.session_id)
              AND NOT EXISTS (SELECT 1 FROM filtered f WHERE f.id=e.id)" : '';
        $cols=['ts','learner_id','session_id','type','island','game','score','stars','duration_s','progress','language','returning','attempt_id','passed','timing_version',...PF_TIMING_FIELDS];
        $sql="WITH filtered AS (SELECT * FROM events $clause),
            selected_visits AS (SELECT DISTINCT learner_id,session_id FROM filtered),
            export_rows AS (SELECT *, 'filtered' AS row_scope FROM filtered $context)
            SELECT ".implode(',',array_map(fn($c)=>'"'.$c.'"',$cols)).',row_scope FROM export_rows ORDER BY ts,id';
        $q=$db->prepare($sql); $q->execute($args);
        header('Content-Type: text/csv; charset=utf-8'); header('Cache-Control: no-store');
        // Same name as the Node server: the period and language are in the file name.
        $period=($filter['from']||$filter['to']) ? ($filter['from']?:'start').'_to_'.($filter['to']?:'today') : 'all-time';
        $name=implode('_',array_filter(['playfood-stats',$period,$filter['language']])).'.csv';
        header('Content-Disposition: attachment; filename="'.$name.'"');
        // «sep=,» tells Excel the separator, so a Greek locale (list separator «;») still splits the columns.
        $out=fopen('php://output','w'); fwrite($out,"sep=,\n"); fputcsv($out,[...$cols,'local_time','timestamp_utc','row_scope'],',','"','');
        while ($row=$q->fetch(PDO::FETCH_NUM)) {
            $scope=array_pop($row);
            $ms=(int)$row[0]; $sec=intdiv($ms,1000);
            fputcsv($out,[...$row,date('Y-m-d H:i:s',$sec),gmdate('Y-m-d\\TH:i:s',$sec).sprintf('.%03dZ',$ms%1000),$scope],',','"','');
        }
        fclose($out); exit;
    }
    if ($route === 'backup') {
        $snapshot=$private.'/backup-'.bin2hex(random_bytes(8)).'.db';
        try {
            $db->exec('VACUUM INTO '.$db->quote($snapshot));
            chmod($snapshot,0600);
            header('Content-Type: application/octet-stream'); header('Cache-Control: no-store');
            header('Content-Disposition: attachment; filename="playfood.db"');
            readfile($snapshot);
        } finally { if(is_file($snapshot)) unlink($snapshot); }
        exit;
    }
    pf_json(['error'=>'Not found'],404);
} catch (Throwable $e) {
    error_log('PLAYFOOD PHP request failed: '.get_class($e));
    pf_json(['error'=>'Service unavailable. Check hosting requirements and private storage permissions.'],503);
}
