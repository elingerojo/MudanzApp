import { createDatabase } from '../../src/db.js';
import {
  ensureAdminUser,
  ensureEventPublicSlug,
  findEventById,
} from '../../src/store/identity-store.js';

/**
 * Derivación perezosa del `public_slug` (ciclo 4a, `plan-ciclo-4a` §7 y decisión §36).
 *
 * Solo entra con `test:api:db`/`:branch`, que derivan la URL de pruebas y activan
 * `MUDANZAPP_DB_TESTS=1` (`backend/vitest.config.ts`). La base es un sandbox desechable.
 */
const database = createDatabase(process.env.DATABASE_URL ?? null);

afterAll(async () => {
  await database.close();
});

describe('ensureEventPublicSlug', () => {
  it('gives a pre-cut event a slug on the first read and keeps it on the second', async () => {
    const admin = await ensureAdminUser(database);
    expect(admin).not.toBeNull();
    if (admin === null) {
      return;
    }

    // Un evento anterior al corte: la columna existe y está nula.
    const { rows } = await database.query<{ readonly id: string }>(
      `INSERT INTO app.event (owner_user_id, origin_city, destination_city, public_slug)
       VALUES ($1, $2, $3, NULL)
       RETURNING id`,
      [admin.id, 'Quito', 'Guayaquil'],
    );
    const created = rows[0];
    expect(created).toBeDefined();
    if (created === undefined) {
      return;
    }

    const event = await findEventById(database, created.id);
    expect(event).not.toBeNull();
    if (event === null) {
      return;
    }

    expect(event.publicSlug).toBeNull();

    const first = await ensureEventPublicSlug(database, event);

    expect(first.publicSlug).toMatch(/^quito-guayaquil-[a-z0-9]{6}$/);
    await expect(findEventById(database, created.id)).resolves.toMatchObject({
      publicSlug: first.publicSlug,
    });

    // La segunda lectura, incluso partiendo del registro viejo, no reescribe nada.
    const second = await ensureEventPublicSlug(database, event);

    expect(second.publicSlug).toBe(first.publicSlug);
  });
});
