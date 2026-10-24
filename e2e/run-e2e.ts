import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';

import {
  DatabaseUrlError,
  deriveDatabaseUrl,
  type DatabaseTarget,
} from '../backend/scripts/test-database-url.js';
import { HARNESS_PORTS, WORKSPACE_DIRECTORY } from './support/harness.js';

/**
 * Envoltorio de `test:e2e`.
 *
 * Es el **único** camino autorizado del arnés: carga `backend/.env.local` con el parser nativo de
 * Node, deriva la URL de pruebas (`_test` o `_branch_test`) con la función pura del backend y la
 * inyecta en el proceso hijo. No imprime ni escribe la URL (`06-datos`, `07-secretos`).
 */

const envFile = join(WORKSPACE_DIRECTORY, 'backend', '.env.local');

const argv = process.argv.slice(2);
const branch = argv.includes('--branch');
/** `--branch` lo consume el envoltorio: Playwright no recibe argumentos del gate. */
const passthrough = argv.filter((argument) => argument !== '--branch');
const target: DatabaseTarget = branch ? 'branch-test' : 'test';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const settle = (inUse: boolean): void => {
      socket.destroy();
      resolve(inUse);
    };

    socket.setTimeout(1_000);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

function derivedTestDatabaseUrl(): string {
  try {
    return deriveDatabaseUrl(process.env.DATABASE_URL, target);
  } catch (error) {
    if (error instanceof DatabaseUrlError) {
      fail(error.message);
    }

    throw error;
  }
}

if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    fail('e2e-env-unreadable: backend/.env.local could not be parsed; check its KEY=value lines');
  }
}

const databaseUrl = derivedTestDatabaseUrl();

// Un backend de desarrollo escuchando en el puerto del arnés es un fallo del operador, no del
// arnés (`07` §4): se detecta antes de arrancar para no correr el humo contra la base de desarrollo.
for (const port of HARNESS_PORTS) {
  if (await isPortInUse(port)) {
    fail(
      `e2e-port-in-use: port ${String(port)} is already listening; stop the dev loop (manual Man-2.5) before running the harness`,
    );
  }
}

const playwrightCli = join(WORKSPACE_DIRECTORY, 'node_modules', '@playwright', 'test', 'cli.js');
if (!existsSync(playwrightCli)) {
  fail('e2e-playwright-missing: run npm install at the workspace root (manual Man-2.3)');
}

// La config se pasa explícita: sin ella Playwright buscaría en el cwd y recolectaría los specs
// unitarios de los workspaces.
const playwrightConfig = join(WORKSPACE_DIRECTORY, 'e2e', 'playwright.config.ts');

// Evidencia del ciclo: el objetivo derivado y el postrequisito manual, nunca la URL.
console.log(`e2e target: ${target}; prerequisite already applied by hand before this run`);

const child = spawn(
  process.execPath,
  [playwrightCli, 'test', '--config', playwrightConfig, ...passthrough],
  {
    cwd: WORKSPACE_DIRECTORY,
    env: {
      ...process.env,
      // Solo el hijo ve la URL derivada: nunca pasa por la salida ni por el disco.
      DATABASE_URL: databaseUrl,
      MUDANZAPP_E2E: '1',
      MUDANZAPP_E2E_TARGET: target,
    },
    stdio: 'inherit',
  },
);

child.on('error', () => {
  fail('e2e-playwright-spawn-failed');
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal === null ? 0 : 1));
});
