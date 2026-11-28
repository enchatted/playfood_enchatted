import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, startConfigWatcher, getConfig, stopConfigWatcher, __setConfigForTests } from '../src/config.js';
import { setTimeout as sleep } from 'node:timers/promises';

function writeConfig(body) {
  const dir = mkdtempSync(join(tmpdir(), 'pfcfg-'));
  const file = join(dir, 'playfood.config.txt');
  writeFileSync(file, body, 'utf8');
  return file;
}

test('διαβάζει κλειδιά και αγνοεί σχόλια/κενές γραμμές', () => {
  const file = writeConfig(`
# αυτό είναι σχόλιο
PANEL_ENABLED    = yes
PANEL_SECRET     = abc123
RETENTION_MONTHS = 12
TIMEZONE         = Europe/Lisbon
PORT             = 4100
`);
  const c = loadConfig(file);
  assert.equal(c.PANEL_ENABLED, true);
  assert.equal(c.PANEL_SECRET, 'abc123');
  assert.equal(c.RETENTION_MONTHS, 12);
  assert.equal(c.TIMEZONE, 'Europe/Lisbon');
  assert.equal(c.PORT, 4100);
});

test('PANEL_ENABLED=no γίνεται false· «yes» ανεξαρτήτως πεζών/κεφαλαίων γίνεται true', () => {
  assert.equal(loadConfig(writeConfig('PANEL_ENABLED = no')).PANEL_ENABLED, false);
  assert.equal(loadConfig(writeConfig('PANEL_ENABLED = YES')).PANEL_ENABLED, true);
  assert.equal(loadConfig(writeConfig('PANEL_ENABLED = Yes')).PANEL_ENABLED, true);
});

test('ό,τι λείπει παίρνει ασφαλείς προεπιλογές — κλειστό, 24 μήνες', () => {
  const c = loadConfig(writeConfig(''));
  assert.equal(c.PANEL_ENABLED, false);
  assert.equal(c.RETENTION_MONTHS, 24);
  assert.equal(c.TIMEZONE, 'Europe/Athens');
  assert.equal(c.PORT, 4000);
  assert.equal(c.MAX_EVENTS_PER_DAY, 200000);
});

test('αρχείο που δεν υπάρχει δεν ρίχνει τον server — επιστρέφει προεπιλογές', () => {
  const c = loadConfig('/δεν/υπαρχει/pou8ena.txt');
  assert.equal(c.PANEL_ENABLED, false);
});

test('μη έγκυρος αριθμός πέφτει στην προεπιλογή αντί για NaN', () => {
  const c = loadConfig(writeConfig('RETENTION_MONTHS = χαλασμένο'));
  assert.equal(c.RETENTION_MONTHS, 24);
});

test('η επαναφόρτωση πιάνει αλλαγή του αρχείου χωρίς επανεκκίνηση', async () => {
  const file = writeConfig('PANEL_ENABLED = no');
  startConfigWatcher(file, 20);            // 20ms αντί 30s στο test
  assert.equal(getConfig().PANEL_ENABLED, false);

  writeFileSync(file, 'PANEL_ENABLED = yes', 'utf8');
  await sleep(60);
  assert.equal(getConfig().PANEL_ENABLED, true, 'έπρεπε να το πιάσει μόνο του');

  stopConfigWatcher();
});

test('__setConfigForTests αρνείται να τρέξει εκτός NODE_ENV=test', () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.throws(() => __setConfigForTests({ PANEL_ENABLED: true }),
      /test-only/,
      'η παράκαμψη config δεν πρέπει να είναι εφικτή εκτός test run');
  } finally {
    process.env.NODE_ENV = original; // αποκατάσταση, ώστε να μη σπάσει η υπόλοιπη σουίτα
  }
});

test('TRUST_PROXY = yes trusts the local proxy instead of crashing on an invalid IP', () => {
  assert.deepEqual(loadConfig(writeConfig('TRUST_PROXY = yes\n')).TRUST_PROXY, ['127.0.0.1', '::1']);
  assert.equal(loadConfig(writeConfig('TRUST_PROXY = no\n')).TRUST_PROXY, false);
});
