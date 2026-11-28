<?php
declare(strict_types=1);

/** Match JavaScript string length (UTF-16 code units). */
function pf_string_length(string $value): int
{
    if (!preg_match_all('/./us', $value, $characters)) {
        return strlen($value);
    }
    $length = 0;
    foreach ($characters[0] as $character) {
        $length += strlen($character) === 4 ? 2 : 1;
    }
    return $length;
}

function pf_config_read(string $file): ?string
{
    $handle = @fopen($file, 'rb');
    if ($handle === false) {
        return null;
    }
    try {
        $raw = stream_get_contents($handle, 65537);
        return is_string($raw) && strlen($raw) <= 65536 ? $raw : null;
    } finally {
        fclose($handle);
    }
}

function pf_config_validate(?string $raw): ?array
{
    if ($raw === null) {
        return null;
    }
    try {
        $entries = json_decode($raw, false, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        return null;
    }
    if (!is_array($entries) || count($entries) > 100) {
        return null;
    }
    $ids = [];
    $codes = [];
    foreach ($entries as $entry) {
        if (!$entry instanceof stdClass) {
            return null;
        }
        $id = $entry->id ?? null;
        $code = $entry->code ?? null;
        $points = $entry->points ?? null;
        $island = $entry->island ?? null;
        $enabled = $entry->enabled ?? null;
        $description = $entry->description ?? new stdClass();
        if (!is_string($id) || !preg_match('/\A[A-Z][A-Z0-9_]{0,31}\z/', $id) || isset($ids[$id])
            || !is_string($code) || !preg_match('/\A[A-Z0-9_-]{3,32}\z/', $code) || isset($codes[$code])
            || !(is_int($points) || (is_float($points) && is_finite($points) && floor($points) === $points))
            || $points < 0 || $points > 1000
            || !in_array($island, ['growing', 'local', 'foodwaste', 'circular'], true)
            || !is_bool($enabled) || !$description instanceof stdClass) {
            return null;
        }
        foreach (get_object_vars($description) as $language => $text) {
            if (!in_array($language, ['en', 'el', 'nl', 'pt'], true)
                || !is_string($text) || pf_string_length($text) > 240) {
                return null;
            }
        }
        $ids[$id] = true;
        $codes[$code] = ['id' => $id, 'points' => (int) $points, 'island' => $island,
            'enabled' => $enabled, 'description' => get_object_vars($description)];
    }
    return $codes;
}

/** Configuration and its sibling cache must live outside the public document root. */
function pf_config_load(string $file): ?array
{
    $cache = $file . '.last-valid';
    $previousMask = umask(0077);
    try {
        $lock = @fopen($file . '.lock', 'c');
        if ($lock === false) {
            return pf_config_validate(pf_config_read($file)) ?? pf_config_validate(pf_config_read($cache));
        }
        @chmod($file . '.lock', 0600);
        try {
            if (!flock($lock, LOCK_EX)) {
                return null;
            }
            $raw = pf_config_read($file);
            $current = pf_config_validate($raw);
            if ($current === null) {
                return pf_config_validate(pf_config_read($cache));
            }
            if (pf_config_read($cache) !== $raw) {
                $temporary = @tempnam(dirname($file), '.phygital-');
                if ($temporary !== false) {
                    @chmod($temporary, 0600);
                    if (@file_put_contents($temporary, $raw) !== strlen($raw)
                        || !@rename($temporary, $cache)) {
                        @unlink($temporary);
                    }
                }
            }
            return $current;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    } finally {
        umask($previousMask);
    }
}

function pf_redeem(string $file, mixed $body): array
{
    $body = $body instanceof stdClass ? get_object_vars($body) : $body;
    $body = is_array($body) ? $body : [];
    $code = $body['code'] ?? null;
    $redeemedIds = array_key_exists('redeemedIds', $body) ? $body['redeemedIds'] : [];
    $language = $body['language'] ?? 'en';
    $failure = static fn (int $status, string $reason): array =>
        ['status' => $status, 'body' => ['success' => false, 'reason' => $reason]];
    if (!is_string($code) || pf_string_length($code) > 64 || !is_array($redeemedIds)
        || !array_is_list($redeemedIds) || count($redeemedIds) > 100) {
        return $failure(400, 'invalid_code');
    }
    foreach ($redeemedIds as $id) {
        if (!is_string($id) || !preg_match('/\A[A-Z][A-Z0-9_]{0,31}\z/', $id)) {
            return $failure(400, 'invalid_code');
        }
    }
    $current = pf_config_load($file);
    if ($current === null) {
        return $failure(503, 'unavailable');
    }
    $normalized = preg_replace('/\A[\s\x{FEFF}]+|[\s\x{FEFF}]+\z/u', '', $code);
    $reward = $current[strtoupper($normalized ?? $code)] ?? null;
    if ($reward === null || !$reward['enabled']) {
        return $failure(400, 'invalid_code');
    }
    if (in_array($reward['id'], $redeemedIds, true)) {
        return $failure(409, 'already_redeemed');
    }
    if (count($redeemedIds) >= 100) {
        return $failure(409, 'limit_reached');
    }
    $locale = in_array($language, ['en', 'el', 'nl', 'pt'], true) ? $language : 'en';
    $description = $reward['description'][$locale] ?? '';
    if ($description === '') {
        $description = $reward['description']['en'] ?? '';
    }
    return ['status' => 200, 'body' => ['success' => true, 'id' => $reward['id'],
        'points' => $reward['points'], 'island' => $reward['island'], 'description' => $description]];
}
