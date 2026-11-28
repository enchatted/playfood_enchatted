const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');

const file = resolve(__dirname, 'test-fixtures/hosting-check.php');
test('checks real SQLite read/write in memory and exports only capability flags', () => {
  const result = JSON.parse(execFileSync('php', [file], { encoding: 'utf8' }));
  assert.equal(result.php_executed, true);
  assert.equal(result.sqlite_memory_test, true);
  assert.equal(result.persistent_storage_verified, false);
  assert.equal(result.full_platform_ready, false);
  assert.deepEqual(Object.keys(result).sort(), ['full_platform_ready', 'password_hashing',
    'pdo_mysql_available', 'persistent_storage_verified', 'php_executed',
    'php_82_or_newer', 'secure_random', 'sqlite_memory_test'].sort());
});
test('when PDO is disabled it reports unavailable SQLite, not readiness', () => {
  const result = JSON.parse(execFileSync('php', ['-n', '-d', 'disable_classes=PDO', file], { encoding: 'utf8' }));
  assert.equal(result.php_executed, true);
  assert.equal(result.sqlite_memory_test, false);
  assert.equal(result.full_platform_ready, false);
});
