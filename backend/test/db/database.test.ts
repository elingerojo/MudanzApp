import { createDatabase } from '../../src/db.js';

// Suite con base: solo entra cuando `test:api:db` (o `:branch`) derivó la URL y activó
// `MUDANZAPP_DB_TESTS=1` (ver `backend/vitest.config.ts`). Si la URL falta, la corrida la crea el
// runner y sale 1 con guía; aquí un `not-configured` es un fallo, no un salto.
const database = createDatabase(process.env.DATABASE_URL ?? null);

afterAll(async () => {
  await database.close();
});

describe('database adapter', () => {
  it('reports ok against the derived test database', async () => {
    await expect(database.check()).resolves.toBe('ok');
  });
});
