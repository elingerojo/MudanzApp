import {
  dashboardDatabase,
  EVENT_ID,
  OTHER_EVENT_ID,
  type SessionFixture,
} from '../support/event-admin-fixture.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La frontera del borrado de una captura (ciclo 4c-4, `plan-ciclo-4c-event-admin` §8).
 *
 * La hipótesis pide dos negativas distintas y una positiva:
 * - un co-dispositivo del evento ve el evento pero no administra: `403 forbidden`;
 * - un miembro sin reclamo tampoco administra: `403 forbidden`;
 * - un evento que la sesión no alcanza responde `404 not_found`, igual que uno inexistente;
 * - un artículo vendido es evidencia y responde `409 item_sold`;
 * - el rey borra y recibe `204`, sin cuerpo.
 *
 * El efecto real —artículo, foto, variantes y `app.listing` desapareciendo en cascada— se demuestra
 * en `test/db/item-delete.test.ts`, sobre la base y no sobre un doble.
 */
const ITEM_ID = '88888888-8888-4888-8888-888888888888';
const UNKNOWN_ITEM_ID = '99999999-9999-4999-8999-999999999999';

const KING = { id: 'user-king', displayName: 'Ana', isAdmin: false };
const MEMBER = { id: 'user-member', displayName: 'Luis', isAdmin: false };

const KING_SESSION_ID = '44444444-4444-4444-8444-444444444444';
const MEMBER_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const DEVICE_SESSION_ID = '33333333-3333-4333-8333-333333333333';

const kingSession: SessionFixture = {
  token: 'king-token',
  id: KING_SESSION_ID,
  userId: KING.id,
  eventId: null,
  displayName: KING.displayName,
  isAdmin: false,
};

const memberSession: SessionFixture = {
  token: 'member-token',
  id: MEMBER_SESSION_ID,
  userId: MEMBER.id,
  eventId: null,
  displayName: MEMBER.displayName,
  isAdmin: false,
};

const deviceSession: SessionFixture = {
  token: 'device-token',
  id: DEVICE_SESSION_ID,
  userId: null,
  eventId: EVENT_ID,
  displayName: null,
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
  item: { id: ITEM_ID, soldAt: null },
};

describe('DELETE /events/:eventId/items/:itemId', () => {
  it('lets the event administrator retire a capture', async () => {
    const app = await start(kingFixture);

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/items/${ITEM_ID}`, {
        method: 'DELETE',
        headers: bearer(kingSession.token),
      });

      expect(response.status).toBe(204);
    } finally {
      await app.close();
    }
  });

  it('refuses a co-device of the event with forbidden, not not_found', async () => {
    const app = await start({
      sessions: [deviceSession],
      administrator: KING,
      item: { id: ITEM_ID, soldAt: null },
    });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/items/${ITEM_ID}`, {
        method: 'DELETE',
        headers: bearer(deviceSession.token),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    } finally {
      await app.close();
    }
  });

  it('refuses a member of an event nobody has claimed yet', async () => {
    const app = await start({
      sessions: [memberSession],
      administrator: null,
      memberUserId: MEMBER.id,
      item: { id: ITEM_ID, soldAt: null },
    });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/items/${ITEM_ID}`, {
        method: 'DELETE',
        headers: bearer(memberSession.token),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    } finally {
      await app.close();
    }
  });

  it('answers not_found for an event the session does not reach', async () => {
    const app = await start(kingFixture);

    try {
      const response = await fetch(`${app.baseUrl}/events/${OTHER_EVENT_ID}/items/${ITEM_ID}`, {
        method: 'DELETE',
        headers: bearer(kingSession.token),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'not_found' });
    } finally {
      await app.close();
    }
  });

  it('answers item_not_found when the capture does not exist in the event', async () => {
    const app = await start(kingFixture);

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/items/${UNKNOWN_ITEM_ID}`, {
        method: 'DELETE',
        headers: bearer(kingSession.token),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'item_not_found' });
    } finally {
      await app.close();
    }
  });

  it('refuses a sold item because it is the evidence of the sale', async () => {
    const app = await start({
      ...kingFixture,
      item: { id: ITEM_ID, soldAt: new Date('2026-11-02T12:00:00.000Z') },
    });

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/items/${ITEM_ID}`, {
        method: 'DELETE',
        headers: bearer(kingSession.token),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'item_sold' });
    } finally {
      await app.close();
    }
  });
});
