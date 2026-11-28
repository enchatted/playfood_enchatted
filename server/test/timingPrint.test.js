import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandTimingDetailsForPrint, installTimingPrint } from '../public/panel/timingPrint.js';

function tableRoot(details) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, 'details[data-timing-split]');
      return details.filter((item) => item.timingSplit);
    },
  };
}

test('print expands all time splits then restores the individual open states', () => {
  const details = [
    { timingSplit: true, open: false },
    { timingSplit: true, open: true },
    { timingSplit: true, open: false },
    { timingSplit: false, open: false },
  ];
  const restore = expandTimingDetailsForPrint(tableRoot(details));
  assert.deepEqual(details.map((item) => item.open), [true, true, true, false]);
  restore();
  assert.deepEqual(details.map((item) => item.open), [false, true, false, false]);
  restore();
  assert.deepEqual(details.map((item) => item.open), [false, true, false, false]);
});

test('a later print takes a fresh snapshot and empty tables are safe', () => {
  const details = [{ timingSplit: true, open: false }];
  expandTimingDetailsForPrint(tableRoot(details))();
  details[0].open = true;
  const restore = expandTimingDetailsForPrint(tableRoot(details));
  restore();
  assert.equal(details[0].open, true);
  assert.doesNotThrow(() => expandTimingDetailsForPrint(tableRoot([]))());
});

test('print events refresh the heading, tolerate repetition and restore each print', () => {
  const details = [{ timingSplit: true, open: false }, { timingSplit: true, open: true }];
  const events = new EventTarget();
  let headingsUpdated = 0;
  installTimingPrint(tableRoot(details), events, () => { headingsUpdated += 1; });
  events.dispatchEvent(new Event('afterprint'));
  events.dispatchEvent(new Event('beforeprint'));
  events.dispatchEvent(new Event('beforeprint'));
  assert.equal(headingsUpdated, 2);
  assert.deepEqual(details.map((item) => item.open), [true, true]);
  events.dispatchEvent(new Event('afterprint'));
  assert.deepEqual(details.map((item) => item.open), [false, true]);
  details[1].open = false;
  events.dispatchEvent(new Event('beforeprint'));
  assert.deepEqual(details.map((item) => item.open), [true, true]);
  events.dispatchEvent(new Event('afterprint'));
  assert.deepEqual(details.map((item) => item.open), [false, false]);
});
