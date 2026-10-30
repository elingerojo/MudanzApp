import type { AddressInfo } from 'node:net';

import type { DatabaseState } from '@mudanzapp/shared';

import { createApp } from '../../src/app.js';
import type { Database } from '../../src/db.js';
import { createOAuthVerifier } from '../../src/identity/oauth.js';

export interface RunningApp {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export interface TestAppOptions {
  readonly adminToken?: string | null;
}

/**
 * Levanta la app en un puerto efímero con un doble determinista de `Database`.
 * El puerto se pide al sistema (`0`) para que las suites no dependan de un 3000 libre.
 *
 * La integración OAUTH va en `fake` (regla del gate) y el reloj se inyecta desde aquí: el dominio
 * no crea su propio reloj (`03` §3).
 */
export async function startTestApp(
  state: DatabaseState = 'ok',
  appBaseUrl = '',
  options: TestAppOptions = {},
): Promise<RunningApp> {
  const database: Database = {
    check: () => Promise.resolve(state),
    query: () => Promise.reject(new Error('test-database-query-not-stubbed')),
    transaction: () => Promise.reject(new Error('test-database-transaction-not-stubbed')),
    close: () => Promise.resolve(),
  };

  const oauth = createOAuthVerifier({
    mode: 'fake',
    issuer: null,
    clientId: null,
    clientSecret: null,
  });

  const server = createApp({
    database,
    appBaseUrl,
    oauth,
    adminToken: options.adminToken ?? null,
    now: () => new Date(),
  }).listen(0);

  await new Promise<void>((resolve) => {
    server.once('listening', () => {
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}
