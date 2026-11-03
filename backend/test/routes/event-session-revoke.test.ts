import {
  dashboardDatabase,
  EVENT_ID,
  OTHER_EVENT_ID,
  type SessionFixture,
} from '../support/event-admin-fixture.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La frontera del acto de des-invitar (ciclo 4c-2, `plan-ciclo-4c-2` §5 y §8).
 *
 * Tres afirmaciones, y ninguna es cosmética:
 * - la sesión en curso se rechaza **antes** de mirar la base, así que el rey no puede quedarse fuera;
 * - una sesión con sujeto no se retira por esta puerta, porque su retiro es un acto de membresía;
 * - una sesión de otro evento o inexistente responde `not_found`, que es lo mismo que ve el borde.
 *
 * El efecto real —`revoked_at` escrito y el token dejando de servir— se demuestra en
 * `test/db/event-access.test.ts`.
 */
const KING = { id: 'user-king', displayName: 'Ana', isAdmin: false };

const KING_SESSION_ID = '44444444-4444-4444-8444-444444444444';
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const ELSEWHERE_SESSION_ID = '66666666-6666-4666-8666-666666666666';
const UNKNOWN_SESSION_ID = '77777777-7777-4777-8777-777777777777';

const kingSession: SessionFixture = {
  token: 'king-token',
  id: KING_SESSION_ID,
  userId: KING.id,
  eventId: null,
  displayName: KING.displayName,
  isAdmin: false,
};

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function start(fixture: Parameters<typeof dashboardDatabase>[0]) {
  return startTestApp('ok', '', { database: dashboardDatabase(fixture) });
}

const kingFixture = {
  sessions: [kingSession],
  administrator: KING,
  memberUserId: KING.id,
};

describe('DELETE /events/:eventId/sessions/:sessionId', () => {
  it('revokes a co-device of the event', async () => {
    const app = await start({
      ...kingFixture,
      target: { id: DEVICE_ID, userId: null, eventId: EVENT_ID },
    });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/sessions/${DEVICE_ID}`, {
        method: 'DELETE',
        headers: bearer(kingSession.token),
      });

      expect(response.status).toBe(204);
    } finally {
      await app.close();
    }
  });

  it('refuses the session in flight even when it would match the filters', async () => {
    const app = await start(kingFixture);

    try {
      const response = await fetch(
        `${app.baseUrl}/events/${EVENT_ID}/sessions/${KING_SESSION_ID}`,
        { method: 'DELETE', headers: bearer(kingSession.token) },
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    } finally {
      await app.close();
    }
  });

  it('refuses a session that belongs to an account', async () => {
    const app = await start({
      ...kingFixture,
      target: { id: ACCOUNT_SESSION_ID, userId: 'user-member', eventId: EVENT_ID },
    });

    try {
      const response = await fetch(
        `${app.baseUrl}/events/${EVENT_ID}/sessions/${ACCOUNT_SESSION_ID}`,
        { method: 'DELETE', headers: bearer(kingSession.token) },
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    } finally {
      await app.close();
    }
  });

  it('answers not_found for a session of another event', async () => {
    const app = await start({
      ...kingFixture,
      target: { id: ELSEWHERE_SESSION_ID, userId: null, eventId: OTHER_EVENT_ID },
    });

    try {
      const response = await fetch(
        `${app.baseUrl}/events/${EVENT_ID}/sessions/${ELSEWHERE_SESSION_ID}`,
        { method: 'DELETE', headers: bearer(kingSession.token) },
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'not_found' });
    } finally {
      await app.close();
    }
  });

  it('answers not_found for a session that does not exist', async () => {
    const app = await start(kingFixture);

    try {
      const response = await fetch(
        `${app.baseUrl}/events/${EVENT_ID}/sessions/${UNKNOWN_SESSION_ID}`,
        { method: 'DELETE', headers: bearer(kingSession.token) },
      );

      expect(response.status).toBe(404);
    } finally {
      await app.close();
    }
  });
});
