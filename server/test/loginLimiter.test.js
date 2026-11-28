import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoginLimiter } from '../src/loginLimiter.js';

test('a full login limiter keeps existing blocks and admits new peers once an expired bucket is removed', () => {
  let now = 0;
  const retryAfter = createLoginLimiter({ maxAttempts: 2, windowMs: 5000, maxPeers: 2, now: () => now });
  assert.equal(retryAfter('first'), 0);
  assert.equal(retryAfter('first'), 0);
  assert.equal(retryAfter('first'), 5);
  now = 1000;
  assert.equal(retryAfter('second'), 0);
  assert.equal(retryAfter('third'), 4, 'capacity cannot evict the blocked first peer');
  assert.equal(retryAfter('first'), 4);
  now = 5000;
  assert.equal(retryAfter('third'), 0, 'expired first bucket frees its slot');
  assert.equal(retryAfter('second'), 0, 'active second bucket retained its previous attempt');
  assert.equal(retryAfter('second'), 1);
  now = 6000;
  assert.equal(retryAfter('second'), 0, 'a blocked peer is allowed at exact expiry');
});

test('separate server limiter instances do not share login buckets', () => {
  const first = createLoginLimiter({ maxAttempts: 1 });
  const second = createLoginLimiter({ maxAttempts: 1 });
  assert.equal(first('peer'), 0);
  assert.ok(first('peer') > 0);
  assert.equal(second('peer'), 0);
});
