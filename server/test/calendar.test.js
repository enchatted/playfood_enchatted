import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthDays, moveMonth, validISO } from '../public/panel/calendar.js';

test('calendar lays out Monday-first weeks including leap days', () => {
  const days = monthDays('2024-02-15');
  assert.equal(days[0], '2024-01-29');
  assert.equal(days[31], '2024-02-29');
  assert.equal(days[41], '2024-03-10');
  assert.equal(new Set(days).size, 42);
});
test('month navigation clamps month end and crosses year boundaries', () => {
  assert.equal(moveMonth('2024-01-31', 1), '2024-02-29');
  assert.equal(moveMonth('2023-03-31', -1), '2023-02-28');
  assert.equal(moveMonth('2026-12-07', 1), '2027-01-07');
});
test('calendar validates actual dates rather than allowing rolled-over dates', () => {
  assert.equal(validISO('2024-02-29'), true);
  for (const value of ['', '2023-02-29', '2026-13-01', '2026-04-31', '07/09/2026']) {
    assert.equal(validISO(value), false);
  }
});
