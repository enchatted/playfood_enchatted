import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import phygitalRoutes from '../src/routes/phygital.js';

test('editable rewards reload atomically and are reusable across separate progress', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-codes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'codes.json');
  const entry = { id: 'SAVEIT', code: 'SAVEIT', points: 50, island: 'foodwaste', enabled: true,
    description: { en: 'Check food in the fridge', el: 'Έλεγχος τροφίμων στο ψυγείο' } };
  const save = (entries) => writeFileSync(file, JSON.stringify(entries));
  save([entry]);
  const app = Fastify();
  await app.register(phygitalRoutes, { file });
  t.after(() => app.close());
  const redeem = (code, redeemedIds = []) => app.inject({ method: 'POST', url: '/phygital/redeem', payload: { code, redeemedIds, points: 9999 } });
  assert.equal((await redeem(' saveit ')).json().points, 50);
  assert.equal((await redeem('SAVEIT')).json().description, 'Check food in the fridge');
  assert.equal((await app.inject({ method: 'POST', url: '/phygital/redeem', payload: { code: 'SAVEIT', language: 'el' } })).json().description, 'Έλεγχος τροφίμων στο ψυγείο');
  assert.equal((await redeem('SAVEIT')).json().points, 50, 'a different progress can use the same code');
  assert.equal((await redeem('SAVEIT', ['SAVEIT'])).json().reason, 'already_redeemed');
  save([{ ...entry, code: 'NEWCODE', points: 75 }]);
  assert.equal((await redeem('SAVEIT')).statusCode, 400);
  assert.equal((await redeem('NEWCODE')).json().points, 75);
  assert.equal((await redeem('NEWCODE', ['SAVEIT'])).json().reason, 'already_redeemed');
  writeFileSync(file, '{broken');
  assert.equal((await redeem('NEWCODE')).json().points, 75, 'last valid config retained');
  save([{ ...entry, points: -5 }]);
  assert.equal((await redeem('NEWCODE')).json().points, 75);
  save([entry, { ...entry, id: 'ANOTHER' }]);
  assert.equal((await redeem('NEWCODE')).json().points, 75, 'duplicate codes rejected');
  for (const change of [{ island: 'unknown' }, { enabled: 'yes' }, { points: 1.5 }, { points: 1001 }, { id: '' }]) {
    save([{ ...entry, ...change }]);
    assert.equal((await redeem('NEWCODE')).json().points, 75, 'invalid fields retain valid catalogue');
  }
  save([entry, { ...entry, code: 'OTHER' }]);
  assert.equal((await redeem('NEWCODE')).json().points, 75, 'duplicate IDs rejected');
  assert.equal((await redeem(null)).statusCode, 400);
  assert.equal((await redeem('NEWCODE', 'not an array')).statusCode, 400);
  save([{ ...entry, enabled: false }]);
  assert.equal((await redeem('SAVEIT')).statusCode, 400);
  save([]);
  assert.equal((await redeem('NEWCODE')).statusCode, 400);
});

test('missing configuration disables redemption, not the rest of the server', async (t) => {
  const app = Fastify();
  await app.register(phygitalRoutes, { file: '/nonexistent/playfood-codes.json' });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/phygital/redeem', payload: { code: 'SAVEIT' } });
  assert.equal(response.statusCode, 503);
});
