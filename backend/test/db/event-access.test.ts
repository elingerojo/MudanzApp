import { createDatabase } from '../../src/db.js';
import { sessionUsability } from '../../src/domain/account.js';
import {
  createEvent,
  createSession,
  ensureAdminUser,
  findSessionById,
  findSessionByTokenHash,
  listEventCoDeviceSessions,
  revokeEventCoDeviceSession,
} from '../../src/store/identity-store.js';
import { hashToken } from '../../src/tokens.js';

/**
 * El control de acceso por dispositivo sobre la base real (ciclo 4c-2, `plan-ciclo-4c-2` §8).
 *
 * Tres hechos, y los tres son SQL:
 * 1. la lista trae **solo** co-dispositivos del evento —ni sesiones de cuenta ni de otro evento—;
 * 2. des-invitar escribe `revoked_at` y el token deja de servir en la petición siguiente;
 * 3. el acto no toca una sesión con sujeto, ni una de otro evento, y repetirlo no reescribe la fecha.
 *
 * Solo entra con `test:api:db`/`:branch`. La base es un sandbox desechable.
 */
const database = createDatabase(process.env.DATABASE_URL ?? null);

afterAll(async () => {
  await database.close();
});

describe('event co-device access', () => {
  it('lists only co-devices and revokes one without touching accounts or other events', async () => {
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
    const otherEvent = await createEvent(database, {
      ownerUserId: admin.id,
      originCity: 'Quito',
      destinationCity: 'Loja',
      currency: 'MXN',
    });

    // Los tokens se derivan del evento para que dos corridas sobre la misma base no choquen.
    const firstToken = `co-first-${event.id}`;
    const secondToken = `co-second-${event.id}`;
    const elsewhereToken = `co-elsewhere-${otherEvent.id}`;
    const accountToken = `account-${event.id}`;

    const firstId = await createSession(database, {
      userId: null,
      eventId: event.id,
      tokenHash: hashToken(firstToken),
      scope: 'app',
      deviceLabel: 'Teléfono',
    });
    const secondId = await createSession(database, {
      userId: null,
      eventId: event.id,
      tokenHash: hashToken(secondToken),
      scope: 'app',
      deviceLabel: 'Tableta',
    });
    await createSession(database, {
      userId: null,
      eventId: otherEvent.id,
      tokenHash: hashToken(elsewhereToken),
      scope: 'app',
      deviceLabel: 'Otro evento',
    });
    const accountSessionId = await createSession(database, {
      userId: admin.id,
      eventId: null,
      tokenHash: hashToken(accountToken),
      scope: 'app',
      deviceLabel: 'Cuenta',
    });

    const devices = await listEventCoDeviceSessions(database, event.id);
    expect(devices.map((device) => device.id).sort()).toEqual([firstId, secondId].sort());
    expect(devices.every((device) => device.userId === null)).toBe(true);

    const target = await findSessionById(database, firstId);
    expect(target?.eventId).toBe(event.id);
    expect(target?.userId).toBeNull();

    expect(
      await revokeEventCoDeviceSession(database, { eventId: event.id, sessionId: firstId }),
    ).toBe(true);

    const revoked = await findSessionByTokenHash(database, hashToken(firstToken));
    expect(revoked?.revokedAt).not.toBeNull();
    expect(sessionUsability({ revokedAt: revoked?.revokedAt ?? null })).toEqual({
      usable: false,
      reason: 'revoked',
    });

    // Repetir el acto responde igual y **no** reescribe el instante: es la evidencia del primer acto.
    const firstRevokedAt = revoked?.revokedAt?.getTime() ?? 0;
    expect(
      await revokeEventCoDeviceSession(database, { eventId: event.id, sessionId: firstId }),
    ).toBe(true);
    const repeated = await findSessionByTokenHash(database, hashToken(firstToken));
    expect(repeated?.revokedAt?.getTime()).toBe(firstRevokedAt);

    // Una cuenta no se retira por esta puerta: la condición `user_id IS NULL` no la alcanza.
    expect(
      await revokeEventCoDeviceSession(database, {
        eventId: event.id,
        sessionId: accountSessionId,
      }),
    ).toBe(false);
    expect((await findSessionById(database, accountSessionId))?.revokedAt).toBeNull();

    // Una sesión de otro evento tampoco: el acto tiene alcance de un evento.
    expect(
      await revokeEventCoDeviceSession(database, {
        eventId: otherEvent.id,
        sessionId: secondId,
      }),
    ).toBe(false);
    expect((await findSessionByTokenHash(database, hashToken(secondToken)))?.revokedAt).toBeNull();
  });
});
