import {
  dashboardDatabase,
  EVENT_ID,
  type SessionFixture,
} from '../support/event-admin-fixture.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La frontera del panel del event-administrator (ciclo 4c-2, `plan-ciclo-4c-2` §5 y §8).
 *
 * Lo que se demuestra aquí es **el orden**: un evento que la sesión no alcanza responde `not_found`, y
 * un evento que sí alcanza pero cuyo sujeto no administra responde `forbidden`. La diferencia es el
 * hecho de la hipótesis —el co-dispositivo ya ve su evento— y por eso se prueba en el borde y no en el
 * guard, que solo traduce el código.
 *
 * La base real se ejerce en `test/db/event-admin.test.ts`; aquí el doble responde por forma de la
 * sentencia (`../support/event-admin-fixture.ts`).
 */
const KING = { id: 'user-king', displayName: 'Ana', isAdmin: false };
const ROOT = { id: 'user-root', displayName: 'Administrador', isAdmin: true };

const kingSession: SessionFixture = {
  token: 'king-token',
  id: 'session-king',
  userId: KING.id,
  eventId: null,
  displayName: KING.displayName,
  isAdmin: false,
};

const rootSession: SessionFixture = {
  token: 'root-token',
  id: 'session-root',
  userId: ROOT.id,
  eventId: null,
  displayName: ROOT.displayName,
  isAdmin: true,
};

const coDeviceSession: SessionFixture = {
  token: 'co-token',
  id: 'session-co',
  userId: null,
  eventId: EVENT_ID,
  displayName: null,
  isAdmin: false,
};

const memberSession: SessionFixture = {
  token: 'member-token',
  id: 'session-member',
  userId: 'user-member',
  eventId: null,
  displayName: 'Luis',
  isAdmin: false,
};

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function start(
  fixture: Parameters<typeof dashboardDatabase>[0],
): Promise<Awaited<ReturnType<typeof startTestApp>>> {
  return startTestApp('ok', '', { database: dashboardDatabase(fixture) });
}

const device = {
  id: 'device-1',
  deviceLabel: 'Teléfono de Ana',
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  lastSeenAt: new Date('2026-11-02T10:00:00.000Z'),
  revokedAt: null,
};

const invitation = {
  id: 'invitation-1',
  createdAt: new Date('2026-11-01T09:00:00.000Z'),
  expiresAt: new Date('2026-11-04T09:00:00.000Z'),
  useCount: 2,
  revokedAt: null,
  label: 'caja',
};

describe('GET /events/:eventId/dashboard', () => {
  it('serves the administrator, the co-devices and the invitation links', async () => {
    const app = await start({
      sessions: [kingSession],
      administrator: KING,
      memberUserId: KING.id,
      devices: [device],
      invitations: [invitation],
    });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/dashboard`, {
        headers: bearer(kingSession.token),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        administrator: KING,
        devices: [
          {
            id: device.id,
            userId: null,
            deviceLabel: 'Teléfono de Ana',
            revokedAt: null,
            createdAt: '2026-11-01T10:00:00.000Z',
            lastSeenAt: '2026-11-02T10:00:00.000Z',
          },
        ],
        invitations: [
          {
            id: invitation.id,
            createdAt: '2026-11-01T09:00:00.000Z',
            expiresAt: '2026-11-04T09:00:00.000Z',
            useCount: 2,
            revokedAt: null,
          },
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('lets the platform administrator open an event nobody claimed', async () => {
    const app = await start({
      sessions: [rootSession],
      administrator: null,
      memberUserId: ROOT.id,
    });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/dashboard`, {
        headers: bearer(rootSession.token),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        administrator: null,
        devices: [],
        invitations: [],
      });
    } finally {
      await app.close();
    }
  });

  it('refuses a co-device of that same event with forbidden, never not_found', async () => {
    const app = await start({
      sessions: [coDeviceSession],
      administrator: KING,
      memberUserId: null,
    });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/dashboard`, {
        headers: bearer(coDeviceSession.token),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    } finally {
      await app.close();
    }
  });

  it('refuses a member without the claim with forbidden', async () => {
    const app = await start({
      sessions: [memberSession],
      administrator: KING,
      memberUserId: 'user-member',
    });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/dashboard`, {
        headers: bearer(memberSession.token),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    } finally {
      await app.close();
    }
  });

  it('answers not_found for an event the session does not reach', async () => {
    const app = await start({
      sessions: [memberSession],
      administrator: KING,
      memberUserId: 'someone-else',
    });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/dashboard`, {
        headers: bearer(memberSession.token),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'not_found' });
    } finally {
      await app.close();
    }
  });

  it('answers not_found when the event does not exist', async () => {
    const app = await start({
      sessions: [kingSession],
      administrator: KING,
      memberUserId: KING.id,
      eventMissing: true,
    });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/dashboard`, {
        headers: bearer(kingSession.token),
      });

      expect(response.status).toBe(404);
    } finally {
      await app.close();
    }
  });
});
