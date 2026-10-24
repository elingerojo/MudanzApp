import pg from 'pg';

import { migrateCommand, testDatabaseUrl } from './support/harness.js';

const { Client } = pg;

/**
 * Verifica que el esquema exista en la base de **pruebas**; **no** migra.
 *
 * El runner de migraciones se aplica a mano (manual `Man-2.4`); si el esquema falta, la corrida
 * falla ruidosamente con la guía del comando que lo resuelve. La URL derivada no se imprime.
 */
function stableCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === 'string') {
      return code;
    }
  }

  return 'unknown';
}

export default async function globalSetup(): Promise<void> {
  const client = new Client({
    connectionString: testDatabaseUrl(),
    connectionTimeoutMillis: 5_000,
  });

  try {
    await client.connect();
  } catch (error) {
    // El código estable va en el mensaje; la causa se conserva para diagnóstico sin la URL.
    throw new Error(`e2e-database-unreachable: ${stableCode(error)}`, { cause: error });
  }

  try {
    // El marcador idempotente de `backend/sql/001_init.sql`: el esquema de la aplicación.
    const { rowCount } = await client.query("SELECT 1 FROM pg_namespace WHERE nspname = 'app'");
    if (rowCount !== 1) {
      throw new Error(
        `e2e-schema-missing: apply the schema first with ${migrateCommand()}; the harness never migrates`,
      );
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}
