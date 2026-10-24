import type { AddressInfo } from 'node:net';

import type { DatabaseState } from '@mudanzapp/shared';

import { createApp } from '../../src/app.js';
import type { Database } from '../../src/db.js';

export interface RunningApp {
  readonly baseUrl: string;
  close(): Promise<void>;
}

/**
 * Levanta la app en un puerto efímero con un doble determinista de `Database`.
 * El puerto se pide al sistema (`0`) para que las suites no dependan de un 3000 libre.
 */
export async function startTestApp(
  state: DatabaseState = 'ok',
  appBaseUrl = '',
): Promise<RunningApp> {
  const database: Database = {
    check: () => Promise.resolve(state),
    close: () => Promise.resolve(),
  };

  const server = createApp({ database, appBaseUrl }).listen(0);
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
