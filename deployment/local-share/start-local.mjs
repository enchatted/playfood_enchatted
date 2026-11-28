import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(root, 'server');

export function assertSupportedNode(version = process.versions.node) {
  const major = Number(version.split('.')[0]);
  if (!Number.isInteger(major) || major < 22 || major >= 27) {
    throw new Error(`Node.js 22–26 is required. Found ${version}. Install an LTS version in that range from https://nodejs.org/ and try again.`);
  }
}

async function installDependenciesIfNeeded() {
  // Native binaries must match this Node version. Keep failed module-resolution
  // caches in a child so installing a missing package can repair the same start.
  const probe = spawnSync(process.execPath, ['--input-type=commonjs', '-e', `
    require.resolve('fastify');
    const Database = require('better-sqlite3');
    const database = new Database(':memory:');
    database.close();
  `], { cwd: serverRoot, stdio: 'ignore', timeout: 10000 });
  if (probe.status === 0) return;

  console.log('Installing the locked server dependencies for this Node.js version. Internet is needed for this step.');
  await new Promise((resolveInstall, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: serverRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.once('error', () => reject(new Error('Could not start npm. Install Node.js 22–26 including npm, then try again.')));
    child.once('exit', (code) => code === 0 ? resolveInstall() : reject(new Error('Dependency installation failed. Check the npm message above, then try again.')));
  });
}

export async function createLocalServer({ dataDir = serverRoot } = {}) {
  assertSupportedNode();
  const { buildServer, getPort } = await import('./server/src/app.js');
  const app = await buildServer({ dataDir, clientDist: join(root, 'client', 'dist'), loggerLevel: 'warn', trustProxy: false, corsOrigins: [] });
  return { app, port: getPort() };
}

async function main() {
  assertSupportedNode();
  if (!existsSync(join(root, 'client', 'dist', 'index.html'))) {
    throw new Error('The game build is missing. Extract the complete ZIP first.');
  }
  await installDependenciesIfNeeded();
  const { app, port } = await createLocalServer();
  try {
    await app.listen({ host: '127.0.0.1', port });
  } catch (error) {
    await app.close();
    if (error.code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is already in use. Stop the earlier server, or change PORT in server/playfood.config.txt.`);
    }
    throw error;
  }
  console.log(`\nPLAYFOOD is ready.\nGame:  http://127.0.0.1:${port}/\nPanel: http://127.0.0.1:${port}/panel\nPanel login: LOCAL_PANEL_LOGIN.txt\nKeep this window open. Press Ctrl+C to stop.\n`);
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`\nPLAYFOOD could not start: ${error.message}\nSee README_EN.md or ΟΔΗΓΙΕΣ_EL.txt.\n`);
    process.exitCode = 1;
  });
}
