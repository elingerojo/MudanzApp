import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConnectionFromEnvironment } from './test-database-url.js';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = join(scriptsDirectory, '..');
const workspaceDirectory = join(backendDirectory, '..');

const connection = resolveConnectionFromEnvironment(process.argv.slice(2));
if (connection === null) {
  process.exit(1);
}

const vitestEntry = [
  join(workspaceDirectory, 'node_modules', 'vitest', 'vitest.mjs'),
  join(backendDirectory, 'node_modules', 'vitest', 'vitest.mjs'),
].find((candidate) => existsSync(candidate));

if (vitestEntry === undefined) {
  console.error('vitest-not-installed: run npm install at the workspace root');
  process.exit(1);
}

// La URL derivada viaja solo al proceso hijo: nunca se imprime ni se escribe en disco.
const child = spawn(process.execPath, [vitestEntry, 'run'], {
  cwd: backendDirectory,
  env: {
    ...process.env,
    DATABASE_URL: connection.databaseUrl,
    MUDANZAPP_DB_TESTS: '1',
  },
  stdio: 'inherit',
});

child.on('error', () => {
  console.error('vitest-spawn-failed');
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal === null ? 0 : 1));
});
