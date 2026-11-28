import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectionStatus } from '../public/panel/collectionStatus.js';

test('collection diagnostics retain observed rejections without automatically flagging the installation', () => {
  const status = collectionStatus({ since: 1, accepted: 8, lastAcceptedAt: null,
    unauthorized: 2, invalid: 1, rateLimited: 3, dailyCap: 4 });
  assert.equal(status.warning, false);
  for (const phrase of ['10 rejected', '2 authentication', '1 invalid', '3 rate', '4 daily', 'never reached']) {
    assert.ok(status.text.includes(phrase), phrase);
  }
  assert.doesNotMatch(status.text, /Ask the administrator/);
  assert.match(status.text, /tests/);
  assert.match(status.text, /PHP.*persist/);
  assert.match(status.text, /Node.*reset/);
});

test('zero rejections and missing diagnostics do not imply complete collection', () => {
  const clean = collectionStatus({ since: 1, accepted: 0, unauthorized: 0, invalid: 0, rateLimited: 0, dailyCap: 0 });
  assert.equal(clean.warning, false);
  assert.ok(clean.text.includes('No accepted requests'));
  assert.ok(clean.text.includes('never reached'));
  assert.ok(collectionStatus().text.includes('unavailable'));
});
