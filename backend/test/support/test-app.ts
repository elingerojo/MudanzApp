import type { AddressInfo } from 'node:net';

import type { DatabaseState } from '@mudanzapp/shared';

import { createFakeDraftProvider } from '../../src/ai/gemini-fake.js';
import { createApp } from '../../src/app.js';
import type { Database } from '../../src/db.js';
import { createOAuthVerifier, type OAuthVerifier } from '../../src/identity/oauth.js';
import type { ObjectStore } from '../../src/storage/object-store.js';
import { createMemoryObjectStore } from './memory-object-store.js';

export interface RunningApp {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export interface TestAppOptions {
  readonly adminToken?: string | null;
  /** Doble de base para una ruta concreta; sin él se usa el que rechaza toda consulta. */
  readonly database?: Database;
  /** Reloj inyectado; la cortesía de venta no debe depender del reloj de la máquina. */
  readonly now?: () => Date;
  /**
   * Almacén que la prueba crea y siembra. Sin él se usa uno nuevo en memoria: una prueba de la
   * adjunción necesita dejar objetos en el staging antes de llamar al borde.
   */
  readonly storage?: ObjectStore;
  /**
   * Verificador concreto cuando la prueba necesita el adaptador y no el doble: el canje del código
   * (4c-1b) solo existe en `live`, así que su frontera se ejerce con un doble del verificador.
   */
  readonly oauth?: OAuthVerifier;
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
  const database: Database = options.database ?? {
    check: () => Promise.resolve(state),
    query: () => Promise.reject(new Error('test-database-query-not-stubbed')),
    transaction: () => Promise.reject(new Error('test-database-transaction-not-stubbed')),
    close: () => Promise.resolve(),
  };

  const oauth =
    options.oauth ??
    createOAuthVerifier({
      mode: 'fake',
      issuer: null,
      clientId: null,
      clientSecret: null,
    });

  // Doble en memoria del almacén: el humo no escribe fotos, y un almacén real aquí haría que la
  // prueba dependiera del sistema de archivos. La concesión de firma es la misma que usa la ruta
  // `PUT /__fake-r2/put`, así que una prueba de frontera recorre el camino real del navegador.
  const storage: ObjectStore = options.storage ?? createMemoryObjectStore();

  const server = createApp({
    database,
    appBaseUrl,
    oauth,
    adminToken: options.adminToken ?? null,
    now: options.now ?? (() => new Date()),
    storage,
    // La IA va en `fake`, como OAUTH: el gate no depende del proveedor (regla del gate).
    ai: createFakeDraftProvider(),
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
