import type { DatabaseState } from '@mudanzapp/shared';
import pg, { type QueryResult, type QueryResultRow } from 'pg';

import { AppError } from './errors.js';

const { Pool } = pg;

/** Superficie mínima de consulta: la misma para el pool y para el cliente de una transacción. */
export interface Queryable {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

/**
 * Adaptador de base de datos.
 *
 * El proceso es dueño del pool: `index.ts` lo crea una sola vez y lo cierra en el apagado
 * ordenado. `check()` alimenta el humo; `query()` y `transaction()` son el único camino del SQL de
 * negocio, siempre parametrizado (`04` §1). Un fallo de la base en `check()` **no** lanza: se
 * traduce a `'error'`, de modo que `/health` (liveness) nunca dependa del dependiente.
 */
export interface Database extends Queryable {
  check(): Promise<DatabaseState>;
  transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const NOT_CONFIGURED: Database = {
  check: () => Promise.resolve('not-configured'),
  query: () => Promise.reject(new AppError('database_not_configured')),
  transaction: () => Promise.reject(new AppError('database_not_configured')),
  close: () => Promise.resolve(),
};

export function createDatabase(connectionString: string | null): Database {
  if (connectionString === null) {
    return NOT_CONFIGURED;
  }

  const pool = new Pool({
    connectionString,
    max: 2,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });

  // Un cliente inactivo roto no debe tumbar un proceso sano: el estado se reporta por /health/db.
  pool.on('error', () => {
    console.error('database-pool-error');
  });

  return {
    async check(): Promise<DatabaseState> {
      try {
        await pool.query('SELECT 1');
        return 'ok';
      } catch {
        return 'error';
      }
    },
    query: <Row extends QueryResultRow>(text: string, values?: readonly unknown[]) =>
      pool.query<Row>(text, values === undefined ? undefined : [...values]),
    async transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
