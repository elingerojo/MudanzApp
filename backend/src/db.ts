import type { DatabaseState } from '@mudanzapp/shared';
import pg from 'pg';

const { Pool } = pg;

/**
 * Adaptador de base de datos.
 *
 * El proceso es dueño del pool: `index.ts` lo crea una sola vez y lo cierra en el apagado
 * ordenado. Solo se expone `check()` porque el humo necesita el estado, no consultas de negocio.
 * Un fallo de la base **no** lanza: se traduce a `'error'`, de modo que `/health` (liveness) nunca
 * dependa del dependiente.
 */
export interface Database {
  check(): Promise<DatabaseState>;
  close(): Promise<void>;
}

const NOT_CONFIGURED: Database = {
  check: () => Promise.resolve('not-configured'),
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
    close: () => pool.end(),
  };
}
