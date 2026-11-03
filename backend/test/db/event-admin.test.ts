import { createDatabase } from '../../src/db.js';
import {
  addEventMember,
  claimEventAdmin,
  createEvent,
  createUser,
  ensureAdminUser,
  findEventForUser,
  readEventAdministrator,
} from '../../src/store/identity-store.js';

/**
 * El reclamo del event-administrator sobre la base real (ciclo 4c-2, `plan-ciclo-4c-2` §8).
 *
 * Es el único lugar donde se puede demostrar que **una segunda cuenta no se lleva el evento**: el
 * verificador `fake` del arnés fija un solo sujeto, así que el e2e no puede producir dos. Aquí se crean
 * dos usuarios con `createUser` y se ejerce el SQL tal como lo ejerce el camino del claim.
 *
 * Solo entra con `test:api:db`/`:branch`, que derivan la URL de pruebas y activan
 * `MUDANZAPP_DB_TESTS=1` (`backend/vitest.config.ts`). La base es un sandbox desechable.
 */
const database = createDatabase(process.env.DATABASE_URL ?? null);

afterAll(async () => {
  await database.close();
});

describe('event administrator claim', () => {
  it('writes the claim once and never replaces it', async () => {
    const admin = await ensureAdminUser(database);
    expect(admin).not.toBeNull();
    if (admin === null) {
      return;
    }

    const event = await createEvent(database, {
      ownerUserId: admin.id,
      originCity: 'Quito',
      destinationCity: 'Guayaquil',
      currency: 'MXN',
    });

    // Un evento nace sin administrador: el reclamo no es un relleno de la migración.
    expect(event.adminUserId).toBeNull();

    const first = await createUser(database, 'Primera cuenta');
    const second = await createUser(database, 'Segunda cuenta');

    await addEventMember(database, {
      eventId: event.id,
      userId: first.id,
      role: 'member',
      invitedBy: admin.id,
    });
    await addEventMember(database, {
      eventId: event.id,
      userId: second.id,
      role: 'member',
      invitedBy: admin.id,
    });

    expect(await claimEventAdmin(database, { eventId: event.id, userId: first.id })).toBe(true);

    // Idempotencia en las dos formas: otra cuenta y la misma.
    expect(await claimEventAdmin(database, { eventId: event.id, userId: second.id })).toBe(false);
    expect(await claimEventAdmin(database, { eventId: event.id, userId: first.id })).toBe(false);

    const administrator = await readEventAdministrator(database, event.id);
    expect(administrator).toMatchObject({
      adminUserId: first.id,
      displayName: 'Primera cuenta',
      isAdmin: false,
    });

    // La membresía publica el mismo hecho: el panel y la frontera no necesitan otra lectura.
    const membership = await findEventForUser(database, event.id, second.id);
    expect(membership?.adminUserId).toBe(first.id);
  });

  it('answers null for an event that does not exist', async () => {
    const administrator = await readEventAdministrator(
      database,
      '00000000-0000-4000-8000-000000000000',
    );

    expect(administrator).toBeNull();
  });
});
