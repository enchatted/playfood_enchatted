import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv[2] ? resolve(process.argv[2]) : mkdtempSync('/tmp/playfood-php-package-');
const root = join(output, 'PLAYFOOD_Upload');
if (existsSync(root)) throw new Error('Output exists; choose a fresh destination');
mkdirSync(root, { recursive: true });
const upload = join(root, 'UPLOAD_CONTENTS');
// Build the game here, never reuse a dist: a stale one, a demo-locked one, or one with the local panel secret
// (PHP's event_secret is empty, so every event would get a silent 401) must not ship.
if (existsSync(join(repo, 'client/package.json'))) execFileSync('npm', ['run', 'build'], { cwd: join(repo, 'client'), stdio: ['ignore', process.stderr, 'inherit'], env: { ...process.env, VITE_PANEL_SECRET: '', VITE_DEMO_ISLAND1: '' } });
cpSync(join(repo, 'client/dist'), upload, { recursive: true });
const localSecret = ['.env', '.env.local', '.env.production', '.env.production.local'].map(f => join(repo, 'client', f)).filter(existsSync)
  .map(f => readFileSync(f, 'utf8').match(/^VITE_PANEL_SECRET=(.+)$/m)?.[1]?.trim()).find(Boolean);
if (localSecret && readdirSync(join(upload, 'assets')).some(f => f.endsWith('.js') && readFileSync(join(upload, 'assets', f), 'utf8').includes(localSecret))) throw new Error('The game bundle contains the local VITE_PANEL_SECRET; the PHP server would reject every event');
cpSync(join(repo, 'server/public/panel'), join(upload, 'panel'), { recursive: true });
// Apply PHP-specific public pages last so shared Node documentation cannot overwrite them.
cpSync(join(repo, 'server-php/public'), upload, { recursive: true });
cpSync(join(repo, 'server-php/src'), join(upload, 'api/lib'), { recursive: true });
// Ship the activities without their codes: setup.php gives each installation fresh random codes and its own key.
const activities = JSON.parse(readFileSync(join(repo, 'server/phygital-codes.json'), 'utf8')).map(({ code, ...activity }) => activity);
writeFileSync(join(upload, 'api/lib/default-codes.json'), JSON.stringify(activities, null, 2) + '\n');
cpSync(join(repo, 'LICENSE'), join(upload, 'LICENSE.txt'));
cpSync(join(repo, 'client/FONT_LICENCES.txt'), join(upload, 'fonts/OFL.txt'));
for (const file of ['index.html','panel/index.html']) {
  const path = join(upload, file);
  let html = readFileSync(path,'utf8');
  if (file === 'panel/index.html') {
    const nodeHelp = 'Open <code>server/playfood.config.txt</code> and set <code>PANEL_ENABLED = yes</code>, then save.<br>\n      It takes effect within 30 seconds; no restart is needed.';
    if (html.split(nodeHelp).length !== 2) throw new Error('PHP panel help could not be adapted; review the shared disabled-panel instructions before packaging');
    html = html.replace(nodeHelp, 'Open the private <code>installation.json</code> outside your website root and set <code>enabled</code> to <code>true</code>, then save.<br>\n      It takes effect on the next API request. Select Check again.');
  }
  writeFileSync(path, html.replace(/<head>/i, '<head>\n<script src="/hosting-api.js"></script>'));
}
cpSync(join(repo,'server-php/READ_ME_FIRST.txt'),join(root,'READ_ME_FIRST.txt'));
// Apache must read every uploaded file: a 600 file on disk shipped as 600 and gave /source.html a 403.
execFileSync('find',[upload,'-type','d','-exec','chmod','755','{}','+']);
execFileSync('find',[upload,'-type','f','-exec','chmod','644','{}','+']);
execFileSync('zip',['-qrD',join(output,'PLAYFOOD_Archipelago_cPanel_Upload.zip'),'PLAYFOOD_Upload'],{cwd:output});
console.log(JSON.stringify({output,upload,zip:join(output,'PLAYFOOD_Archipelago_cPanel_Upload.zip')}));
