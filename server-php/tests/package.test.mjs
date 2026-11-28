import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function fixture(t) {
  const temporary = mkdtempSync(join(tmpdir(), 'playfood-php-package-test-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const source = join(temporary, 'source');
  for (const directory of ['server-php/public', 'server-php/src', 'server/public/panel']) {
    cpSync(join(repo, directory), join(source, directory), { recursive: true });
  }
  for (const file of ['server-php/build-package.mjs', 'server-php/READ_ME_FIRST.txt', 'server/phygital-codes.json', 'LICENSE', 'client/FONT_LICENCES.txt']) {
    cpSync(join(repo, file), join(source, file));
  }
  mkdirSync(join(source, 'client/dist/assets'), { recursive: true });
  writeFileSync(join(source, 'client/dist/index.html'), '<!doctype html><html><head><title>Fixture game</title></head><body></body></html>');
  writeFileSync(join(source, 'client/dist/assets/game.js'), 'console.log("fixture game");');
  mkdirSync(join(source, 'server-php/private'), { recursive: true });
  for (const file of ['server/playfood.db', 'server/users.txt', 'server-php/private/installation.json']) {
    writeFileSync(join(source, file), 'HOST_PRIVATE_DATA_MUST_NOT_SHIP');
  }
  return { source, temporary };
}

function build(source, output) {
  return JSON.parse(execFileSync(process.execPath, [join(source, 'server-php/build-package.mjs'), output], { encoding: 'utf8' }));
}

test('PHP public overlay survives the shared panel copy in the actual ZIP', t => {
  const { source, temporary } = fixture(t);
  mkdirSync(join(source, 'server-php/public/panel'), { recursive: true });
  const notes = new Map([
    ['data-collection-en.html', '<html lang="en">PHP fixture notes</html>'],
    ['data-collection-el.html', '<html lang="el">Σημείωση PHP δοκιμής</html>'],
  ]);
  for (const [file, content] of notes) writeFileSync(join(source, 'server-php/public/panel', file), content);
  const result = build(source, join(temporary, 'output'));
  for (const [file, content] of notes) {
    assert.equal(readFileSync(join(result.upload, 'panel', file), 'utf8'), content);
    assert.equal(execFileSync('unzip', ['-p', result.zip, `PLAYFOOD_Upload/UPLOAD_CONTENTS/panel/${file}`], { encoding: 'utf8' }), content);
  }
});

test('PHP package disables Apache directory listings without blocking public files', t => {
  const { source, temporary } = fixture(t);
  const result = build(source, join(temporary, 'output'));
  const htaccess = execFileSync('unzip', ['-p', result.zip, 'PLAYFOOD_Upload/UPLOAD_CONTENTS/.htaccess'], { encoding: 'utf8' });
  assert.match(htaccess, /^Options -Indexes\s*$/m);
  assert.doesNotMatch(htaccess, /Require all denied|Deny from all|RewriteRule/i);
  assert.equal(readFileSync(join(result.upload, '.htaccess'), 'utf8'), htaccess);
});

test('PHP package revalidates index pages and removes PHP version headers in both Apache tables', t => {
  const { source, temporary } = fixture(t);
  const result = build(source, join(temporary, 'output'));
  const htaccess = execFileSync('unzip', ['-p', result.zip, 'PLAYFOOD_Upload/UPLOAD_CONTENTS/.htaccess'], { encoding: 'utf8' });
  assert.match(htaccess, /^\s*Header onsuccess unset X-Powered-By\s*$/m);
  assert.match(htaccess, /^\s*Header always unset X-Powered-By\s*$/m);
  const indexRules = htaccess.match(/<Files "index\.html">([\s\S]*?)<\/Files>/)?.[1];
  assert.ok(indexRules);
  assert.match(indexRules, /Header onsuccess unset Cache-Control/);
  assert.match(indexRules, /Header always set Cache-Control "no-cache, max-age=0, must-revalidate"/);
  assert.doesNotMatch(htaccess.replace(/<Files "index\.html">[\s\S]*?<\/Files>/, ''), /Cache-Control/);
});

test('PHP package adapts disabled-panel help while preserving the shared Node page', t => {
  const { source, temporary } = fixture(t);
  const panelSource = join(source, 'server/public/panel/index.html');
  const nodePanel = readFileSync(panelSource, 'utf8');
  const result = build(source, join(temporary, 'output'));
  const panel = readFileSync(join(result.upload, 'panel/index.html'), 'utf8');
  assert.match(panel, /installation\.json/);
  assert.match(panel, /<code>enabled<\/code>.*<code>true<\/code>/);
  assert.match(panel, /next API request/i);
  assert.doesNotMatch(panel, /server\/playfood\.config\.txt|PANEL_ENABLED = yes|within 30 seconds/);
  assert.equal(readFileSync(panelSource, 'utf8'), nodePanel);
  for (const file of ['index.html', 'panel/index.html']) {
    assert.equal((readFileSync(join(result.upload, file), 'utf8').match(/<script src="\/hosting-api\.js"><\/script>/g) || []).length, 1);
  }
});

test('packaging fails if shared disabled-panel help changes instead of shipping Node instructions', t => {
  const { source, temporary } = fixture(t);
  const panelSource = join(source, 'server/public/panel/index.html');
  writeFileSync(panelSource, readFileSync(panelSource, 'utf8').replace('PANEL_ENABLED = yes', 'DIFFERENT_NODE_CONFIG'));
  const result = spawnSync(process.execPath, [join(source, 'server-php/build-package.mjs'), join(temporary, 'output')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PHP panel help/i);
});

test('ZIP carries no setup key or Activity Codes; each installation creates its own', t => {
  const { source, temporary } = fixture(t);
  const result = build(source, join(temporary, 'first'));
  const archiveFiles = execFileSync('unzip', ['-Z1', result.zip], { encoding: 'utf8' });
  assert.doesNotMatch(archiveFiles, /INSTALLATION_KEY|setup-key|installation-key|playfood\.db|users\.txt|installation\.json|playfood-private-/);
  assert.equal(execFileSync('unzip', ['-p', result.zip, 'PLAYFOOD_Upload/READ_ME_FIRST.txt'], { encoding: 'utf8' }), readFileSync(join(source, 'server-php/READ_ME_FIRST.txt'), 'utf8'));
  const shipped = JSON.parse(execFileSync('unzip', ['-p', result.zip, 'PLAYFOOD_Upload/UPLOAD_CONTENTS/api/lib/default-codes.json'], { encoding: 'utf8' }));
  const catalog = JSON.parse(readFileSync(join(source, 'server/phygital-codes.json'), 'utf8'));
  assert.equal(shipped.length, catalog.length);
  for (const [index, activity] of shipped.entries()) {
    assert.equal('code' in activity, false);
    const { code, ...expected } = catalog[index];
    assert.deepEqual(activity, expected);
  }
  assert.equal(execFileSync('unzip', ['-p', result.zip, 'PLAYFOOD_Upload/UPLOAD_CONTENTS/LICENSE.txt'], { encoding: 'utf8' }), readFileSync(join(source, 'LICENSE'), 'utf8'));
  assert.equal(execFileSync('unzip', ['-p', result.zip, 'PLAYFOOD_Upload/UPLOAD_CONTENTS/fonts/OFL.txt'], { encoding: 'utf8' }), readFileSync(join(source, 'client/FONT_LICENCES.txt'), 'utf8'));
});

test('ZIP makes every uploaded file readable by the web server, even if it is private on disk', t => {
  const { source, temporary } = fixture(t);
  writeFileSync(join(source, 'client/dist/source.html'), '<!doctype html><title>Sources</title>');
  chmodSync(join(source, 'client/dist/source.html'), 0o600);
  chmodSync(join(source, 'client/dist/index.html'), 0o755);
  const result = build(source, join(temporary, 'out'));
  const listing = execFileSync('unzip', ['-Z', result.zip], { encoding: 'utf8' }).split('\n').filter(l => l.includes('UPLOAD_CONTENTS/'));
  assert.match(listing.find(l => l.endsWith('UPLOAD_CONTENTS/source.html')), /^-rw-r--r--/);
  for (const line of listing) assert.match(line, /^(drwxr-xr-x|-rw-r--r--) /, line);
});

test('packaging refuses a game bundle that carries the local panel secret', t => {
  const { source, temporary } = fixture(t);
  writeFileSync(join(source, 'client/.env.local'), 'VITE_PANEL_SECRET=fixture-local-secret-phrase\n');
  writeFileSync(join(source, 'client/dist/assets/game.js'), 'const s="fixture-local-secret-phrase";');
  const run = spawnSync(process.execPath, [join(source, 'server-php/build-package.mjs'), join(temporary, 'out')], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /contains the local VITE_PANEL_SECRET/);
});
