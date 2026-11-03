import { createDatabase } from '../../src/db.js';
import {
  INVITATION_MAX_USES,
  invitationUsability,
  sessionUsability,
} from '../../src/domain/account.js';
import {
  cancelInvitation,
  createEvent,
  createInvitation,
  createSession,
  ensureAdminUser,
  findSessionById,
  findSessionByTokenHash,
  increaseInvitationUse,
  listEventCoDeviceSessions,
  listEventInvitations,
  revokeEventCoDeviceSession,
} from '../../src/store/identity-store.js';
import { hashToken } from '../../src/tokens.js';

/**
 * El control de acceso sobre la base real (ciclos 4c-2 y 4c-3, `plan-ciclo-4c-3` §5).
 *
 * Hechos que son SQL y solo un test contra la base puede demostrar:
 * 1. la lista de dispositivos trae **solo** co-dispositivos del evento —ni sesiones de cuenta ni de
 *    otro evento—;
 * 2. des-invitar escribe `revoked_at` y el token deja de servir en la petición siguiente;
 * 3. el acto no toca una sesión con sujeto, ni una de otro evento, y repetirlo no reescribe la fecha;
 * 4. cancelar un enlace escribe `revoked_at`, el canje deja de admitir y un enlace de otro evento no
 *    se toca.
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

  it('lists one event invitation links and cancels one without touching another event', async () => {
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
    const otherEvent = await createEvent(database, {
      ownerUserId: admin.id,
      originCity: 'Quito',
      destinationCity: 'Ambato',
      currency: 'MXN',
    });

    const now = new Date('2026-11-03T12:00:00.000Z');
    const expiresAt = new Date('2026-11-06T12:00:00.000Z');

    const first = await createInvitation(database, {
      eventId: event.id,
      tokenHash: hashToken(`invitation-first-${event.id}`),
      createdBy: admin.id,
      expiresAt,
    });
    const second = await createInvitation(database, {
      eventId: event.id,
      tokenHash: hashToken(`invitation-second-${event.id}`),
      createdBy: admin.id,
      expiresAt,
    });
    const elsewhere = await createInvitation(database, {
      eventId: otherEvent.id,
      tokenHash: hashToken(`invitation-elsewhere-${otherEvent.id}`),
      createdBy: admin.id,
      expiresAt,
    });

    // La lista es del evento y nada más: la invitación del otro evento no aparece.
    const invitations = await listEventInvitations(database, event.id);
    expect(invitations.map((invitation) => invitation.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect(invitations.every((invitation) => invitation.revokedAt === null)).toBe(true);
    expect(invitations.map((invitation) => invitation.id)).not.toContain(elsewhere.id);

    expect(
      await cancelInvitation(database, { eventId: event.id, invitationId: first.id, now }),
    ).toBe(true);

    const cancelled = (await listEventInvitations(database, event.id)).find(
      (invitation) => invitation.id === first.id,
    );
    expect(cancelled?.revokedAt?.getTime()).toBe(now.getTime());

    // El núcleo ya sabe leerlo: la cancelación manda sobre vencimiento y canjes.
    expect(
      invitationUsability(
        {
          expiresAt: cancelled?.expiresAt ?? expiresAt,
          useCount: cancelled?.useCount ?? 0,
          claimedAt: null,
          revokedAt: cancelled?.revokedAt ?? null,
        },
        now,
      ),
    ).toEqual({ usable: false, reason: 'revoked' });

    // Y el canje no escribe nada sobre el enlace cancelado.
    expect(
      await increaseInvitationUse(database, {
        invitationId: first.id,
        maxUses: INVITATION_MAX_USES,
        now,
        userId: null,
      }),
    ).toBe(false);
    expect(
      (await listEventInvitations(database, event.id)).find(
        (invitation) => invitation.id === first.id,
      )?.useCount,
    ).toBe(0);

    // Repetir el acto responde igual y conserva el primer instante: es su evidencia.
    const later = new Date(now.getTime() + 60_000);
    expect(
      await cancelInvitation(database, { eventId: event.id, invitationId: first.id, now: later }),
    ).toBe(true);
    expect(
      (await listEventInvitations(database, event.id))
        .find((invitation) => invitation.id === first.id)
        ?.revokedAt?.getTime(),
    ).toBe(now.getTime());

    // Una invitación de otro evento no se cancela desde este: la condición no la alcanza.
    expect(
      await cancelInvitation(database, {
        eventId: otherEvent.id,
        invitationId: second.id,
        now,
      }),
    ).toBe(false);
    expect(
      (await listEventInvitations(database, event.id)).find(
        (invitation) => invitation.id === second.id,
      )?.revokedAt,
    ).toBeNull();
  });
});
