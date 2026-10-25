import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { resolveConnectionFromEnvironment } from './test-database-url.js';

const { Client } = pg;
const sqlDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'sql');

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

/** El archivo trae control de transacción propio: el runner ya abre la suya y anidarla falla. */
function hasTransactionControl(sql: string): boolean {
  const [firstStatement = ''] = sql
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('--'));

  return /^\s*(?:BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\b/i.test(firstStatement);
}

async function main(): Promise<number> {
  const connection = resolveConnectionFromEnvironment(process.argv.slice(2));
  if (connection === null) {
    return 1;
  }

  const files = (await readdir(sqlDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  if (files.length === 0) {
    console.error('migrations-missing: backend/sql has no .sql files');
    return 1;
  }

  const client = new Client({ connectionString: connection.databaseUrl });
  try {
    await client.connect();
    for (const file of files) {
      const sql = await readFile(join(sqlDirectory, file), 'utf8');
      if (hasTransactionControl(sql)) {
        console.error(`migration-transaction-control: ${file}`);
        return 1;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }

    console.log(`ok: applied ${String(files.length)} migration(s) to ${connection.target}`);
    return 0;
  } catch (error) {
    console.error(`migrate-failed: ${stableCode(error)}`);
    return 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

process.exitCode = await main();
