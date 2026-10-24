import { defineConfig } from 'vitest/config';

// `test:api` corre en frío y no toca la base: excluye las suites de `test/db/`.
// `test:api:db` deriva la URL de pruebas y activa `MUDANZAPP_DB_TESTS=1` por el camino
// autorizado (`scripts/test-db.ts`); solo entonces esas suites entran en la corrida.
const includeDatabaseSuites = process.env.MUDANZAPP_DB_TESTS === '1';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: includeDatabaseSuites
      ? ['**/node_modules/**', '**/dist/**']
      : ['**/node_modules/**', '**/dist/**', 'test/db/**'],
    globals: true,
    pool: 'threads',
    fileParallelism: false, // suites DB-backed: serializan para no pisarse
  },
});
