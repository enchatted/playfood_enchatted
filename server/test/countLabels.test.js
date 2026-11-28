import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plural, countLabel } from '../public/panel/countLabels.js';

test('count labels use singular only for one and preserve numeric formatting', () => {
  assert.equal(countLabel(0, 'visit'), '0 visits');
  assert.equal(countLabel(1, 'visit'), '1 visit');
  assert.equal(countLabel(2, 'visit'), '2 visits');
  assert.equal(countLabel(1000, 'browser profile'), '1,000 browser profiles');
  assert.equal(countLabel(1, 'timed round'), '1 timed round');
  assert.equal(countLabel(1, 'child', 'children'), '1 child');
  assert.equal(countLabel(2, 'child', 'children'), '2 children');
  assert.equal(plural(1, 'First visit'), 'First visit');
  assert.equal(plural(2, 'First visit'), 'First visits');
});

test('missing count is not represented as measured zero', () => {
  assert.equal(countLabel(null, 'visit'), '—');
  assert.equal(countLabel(undefined, 'visit'), '—');
});
