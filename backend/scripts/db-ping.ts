import pg from 'pg';

import { resolveConnectionFromEnvironment } from './test-database-url.js';

const { Client } = pg;

/** SQLSTATE, no el mensaje: puede arrastrar identificadores de la conexión. */
function stableCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === 'string') {
      return code;
    }
  }

  return 'unknown';
}

async function main(): Promise<number> {
  const connection = resolveConnectionFromEnvironment(process.argv.slice(2));
  if (connection === null) {
    return 1;
  }

  const client = new Client({ connectionString: connection.databaseUrl });
  try {
    await client.connect();
    await client.query('SELECT 1');
    console.log('ok');
    return 0;
  } catch (error) {
    console.error(`db-ping-failed: ${stableCode(error)}`);
    return 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

process.exitCode = await main();
