import { onboardingLevelFor } from '@mudanzapp/shared';

import { createDatabase } from '../../src/db.js';
import {
  createEvent,
  ensureAdminUser,
  findEventForUser,
  updateEventOnboardingLevel,
} from '../../src/store/identity-store.js';

/**
 * El SQL del nivel de onboarding sobre la base real (corte 3k).
 *
 * Hechos que solo un test contra la base demuestra:
 * 1. el conteo publicado mira **toda** fila de `app.listing` del evento, incluida la despublicada;
 * 2. el piso elegido se guarda y no hace descender el efectivo;
 * 3. el `CHECK` de la migración `014` es la red de seguridad del rango.
 *
 * Solo entra con `test:api:db`/`:branch`. La base es un sandbox desechable.
 */
const database = createDatabase(process.env.DATABASE_URL ?? null);

afterAll(async () => {
  await database.close();
});

/** Inserta el artículo y su fila publicada, sin pasar por el borde: aquí se prueba el SQL. */
async function publishItem(eventId: string, index: number): Promise<void> {
  const { rows } = await database.query<{ id: string }>(
    `INSERT INTO app.item (event_id, title) VALUES ($1, $2) RETURNING id`,
    [eventId, `Caja ${String(index)}`],
  );

  const item = rows[0];
  if (item === undefined) {
    throw new Error('item-insert-returned-no-row');
  }

  await database.query(`INSERT INTO app.listing (item_id, slug) VALUES ($1, $2)`, [
    item.id,
    `caja-${eventId}-${String(index)}`,
  ]);
}

describe('event onboarding level', () => {
  it('counts every published article ever and never descends the effective level', async () => {
    const admin = await ensureAdminUser(database);
    expect(admin).not.toBeNull();
    if (admin === null) {
      return;
    }

    const event = await createEvent(database, {
      ownerUserId: admin.id,
      originCity: 'Quito',
      destinationCity: 'Cuenca',
      currency: 'MXN',
    });

    for (let index = 0; index < 3; index += 1) {
      await publishItem(event.id, index);
    }

    const before = await findEventForUser(database, event.id, admin.id);
    expect(before?.publishedCount).toBe(3);
    expect(
      onboardingLevelFor(
        { publishedCount: before?.publishedCount ?? 0 },
        before?.onboardingLevel ?? null,
      ),
    ).toBe(1);

    // Un piso menor que la evidencia se guarda y el efectivo sigue en 1.
    const stored = await updateEventOnboardingLevel(database, { eventId: event.id, level: 0 });
    expect(stored?.onboardingLevel).toBe(0);
    expect(stored?.publishedCount).toBe(3);
    expect(
      onboardingLevelFor(
        { publishedCount: stored?.publishedCount ?? 0 },
        stored?.onboardingLevel ?? null,
      ),
    ).toBe(1);

    // Despublicar no borra la evidencia: la fila de `app.listing` sigue contando.
    await database.query(
      `UPDATE app.listing
          SET unpublished_at = now()
        WHERE item_id IN (SELECT id FROM app.item WHERE event_id = $1)`,
      [event.id],
    );

    const afterUnpublish = await findEventForUser(database, event.id, admin.id);
    expect(afterUnpublish?.publishedCount).toBe(3);
  });

  it('rejects a floor outside the CHECK range', async () => {
    const admin = await ensureAdminUser(database);
    expect(admin).not.toBeNull();
    if (admin === null) {
      return;
    }

    const event = await createEvent(database, {
      ownerUserId: admin.id,
      originCity: 'Quito',
      destinationCity: 'Manta',
      currency: 'MXN',
    });

    await expect(
      updateEventOnboardingLevel(database, { eventId: event.id, level: 10 }),
    ).rejects.toThrow();
  });
});
