<?php
declare(strict_types=1);
ini_set('display_errors','0');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');
require __DIR__.'/api/lib/runtime.php';
function setupLock(string $private) {
    if (!is_dir($private) && !@mkdir($private, 0700) && !is_dir($private)) {
        throw new RuntimeException('Private storage unavailable');
    }
    $rules = $private . '/.htaccess';
    if (!is_file($rules) && file_put_contents($rules, "Require all denied\n", LOCK_EX) === false) {
        throw new RuntimeException('Cannot protect private storage');
    }
    $lock = fopen($private . '/setup.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Cannot lock setup');
    return $lock;
}

function localSetupKey(string $private): string {
    $file = $private . '/installation-key.txt';
    if (!is_file($file)) {
        $key = bin2hex(random_bytes(24));
        $temp = tempnam($private, '.key-');
        if ($temp === false) throw new RuntimeException('Cannot create key');
        try {
            if (file_put_contents($temp, $key . PHP_EOL) !== 49 || !rename($temp, $file)) {
                throw new RuntimeException('Cannot save key');
            }
        } finally {
            if (is_file($temp)) unlink($temp);
        }
    }
    $key = trim((string)file_get_contents($file));
    if (!preg_match('/^[a-f0-9]{48}$/D', $key)) throw new RuntimeException('Invalid private key');
    return $key;
}

function makeActivityCodes(array $activities): array {
    $used = [];
    foreach ($activities as &$activity) {
        do {
            $code = strtoupper(bin2hex(random_bytes(4)));
        } while (isset($used[$code]));
        $used[$code] = true;
        $activity['code'] = $code;
    }
    return $activities;
}

$message=''; $installed=false; $ready=false;
try {
    $private=pf_private_dir();
    $installed=is_file($private.'/installation.json');
    $drivers=is_callable(['PDO','getAvailableDrivers']) ? PDO::getAvailableDrivers() : [];
    $sqliteVersion=in_array('sqlite',$drivers,true) ? (new PDO('sqlite::memory:'))->query('SELECT sqlite_version()')->fetchColumn() : '0';
    $ready=PHP_VERSION_ID >= 80200 && version_compare($sqliteVersion,'3.35.0','>=') && is_writable(dirname($private));
    if ($installed) $message='Already installed. Your existing accounts, codes and data are preserved. Open /panel/.';
    elseif (!$ready) $message='The game can run, but setup cannot safely activate the panel: PHP 8.2+, PDO SQLite and a writable folder OUTSIDE the website root are required. No public-storage fallback is used.';
    elseif (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS']==='off') {
        $ready=false;
        $message='Use the HTTPS address of this site to complete installation.';
    } else {
        $lock=setupLock($private);
        try {
            clearstatcache();
            if (is_file($private.'/installation.json')) {
                $installed=true;
                $message='Already installed. Your existing accounts, codes and data are preserved. Open /panel/.';
            } else {
                $key=localSetupKey($private);
                if ($_SERVER['REQUEST_METHOD']==='POST') {
                    if ((int)($_SERVER['CONTENT_LENGTH']??0)>8192) throw new RuntimeException('Form too large');
                    $sent=$_POST['key']??'';
                    if (!is_string($sent) || !hash_equals($key,$sent)) throw new InvalidArgumentException('Incorrect installation key');
                    $email=$_POST['email']??''; $password=$_POST['password']??''; $zone=$_POST['timezone']??'';
                    if (!is_string($email) || !filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($email)>254) throw new InvalidArgumentException('Enter a valid email');
                    if (!is_string($password) || strlen($password)<12 || strlen($password)>72) throw new InvalidArgumentException('Use a password of 12–72 bytes');
                    if (!is_string($zone) || !in_array($zone,DateTimeZone::listIdentifiers(),true)) throw new InvalidArgumentException('Select a valid timezone');
                    date_default_timezone_set($zone);
                    require __DIR__.'/api/lib/data.php';
                    require __DIR__.'/api/lib/phygital.php';
                    $db=pf_open_db($private.'/playfood.db');
                    pf_auth_tables($db);
                    $codes=json_decode(file_get_contents(__DIR__.'/api/lib/default-codes.json'),true,32,JSON_THROW_ON_ERROR);
                    if(!is_file($private.'/phygital-codes.json')) pf_write_json($private.'/phygital-codes.json',makeActivityCodes($codes));
                    if(pf_config_load($private.'/phygital-codes.json') === null) throw new RuntimeException('Invalid activity configuration');
                    pf_write_json($private.'/installation.json',[
                        'email'=>trim($email),'password_hash'=>password_hash($password,PASSWORD_DEFAULT),
                        'enabled'=>isset($_POST['tracking']), 'timezone'=>$zone, 'retention_months'=>24,
                        'max_events_per_day'=>200000,'event_secret'=>'',
                    ]);
                    unlink($private.'/installation-key.txt');
                    $installed=true;
                    $message='Installation complete. Open /panel/ and sign in with the email and password you just chose. Delete setup.php from the website.';
                }
            }
        } finally { flock($lock,LOCK_UN); fclose($lock); }
    }
} catch (InvalidArgumentException $e) { $message=$e->getMessage(); }
catch (Throwable $e) { $message='Setup could not finish. Check PHP/SQLite and private-folder permissions. Existing data was not overwritten.'; }
function h(string $s):string { return htmlspecialchars($s,ENT_QUOTES,'UTF-8'); }
?>
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PLAYFOOD installation</title>
<style>body{font:18px/1.5 system-ui;background:#fff8e1;color:#3e2723;margin:0;padding:24px}main{max-width:640px;margin:auto}label{display:block;margin-top:16px}input,select,button{box-sizing:border-box;font:inherit;padding:10px;width:100%}input[type=checkbox]{width:auto}button{margin-top:24px;background:#3c713d;color:white;border:0}aside{padding:16px;border:2px solid #8d6e63}</style>
<main><h1>PLAYFOOD installation</h1><p>One-time setup. No build, terminal or MySQL database needed.</p>
<?php if($message): ?><aside role="status"><?=h($message)?></aside><?php endif; ?>
<?php if($ready && !$installed): ?>
<p>In cPanel File Manager, open <strong><?=h(basename($private))?></strong> outside your website root. Open <strong>installation-key.txt</strong> and copy the key into this form.</p>
<form method="post"><label>Installation key<input name="key" type="password" autocomplete="off" required></label>
<label>Panel email<input name="email" type="email" autocomplete="username" required></label>
<label>Choose your panel password (at least 12 characters)<input name="password" type="password" minlength="12" maxlength="72" autocomplete="new-password" required></label>
<label>School timezone<select name="timezone"><option>Europe/Athens</option><option>Europe/Brussels</option><option>Europe/Amsterdam</option><option>Europe/Lisbon</option><option>UTC</option></select></label>
<label><input name="tracking" type="checkbox"> Enable statistics collection and the panel (institution approval required)</label>
<p>Statistics retention: 24 calendar months. Phygital codes work independently of statistics.</p><button>Install PLAYFOOD</button></form>
<?php endif; ?><p><a href="/">Game</a> · <a href="/panel/">Statistics panel</a></p></main></html>
