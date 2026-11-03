import {
  dashboardDatabase,
  EVENT_ID,
  type InvitationRow,
  type SessionFixture,
} from '../support/event-admin-fixture.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La frontera de `Cancelar enlace` (ciclo 4c-3, `plan-ciclo-4c-3` §2 y §5).
 *
 * Cuatro afirmaciones, y ninguna es cosmética:
 * - el rey cancela un enlace de su evento y recibe `204`;
 * - un co-dispositivo no entra, aunque su evento sea el de la ruta: `403`, no `404`;
 * - un miembro sin reclamo tampoco: `403`;
 * - un enlace que no es de este evento —o que no existe— responde `404`, igual que el borde ve a un
 *   evento que la sesión no alcanza.
 *
 * El efecto real —`revoked_at` escrito, el primer instante conservado y el canje dejando de admitir—
 * se demuestra en `test/db/event-access.test.ts`; el `410` del canje, en el e2e.
 */
const KING = { id: 'user-king', displayName: 'Ana', isAdmin: false };

const INVITATION_ID = '88888888-8888-4888-8888-888888888888';
const OTHER_INVITATION_ID = '99999999-9999-4999-8999-999999999999';
const UNKNOWN_INVITATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const kingSession: SessionFixture = {
  token: 'king-token',
  id: 'session-king',
  userId: KING.id,
  eventId: null,
  displayName: KING.displayName,
  isAdmin: false,
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

const INVITATION: InvitationRow = {
  id: INVITATION_ID,
  createdAt: new Date('2026-11-01T09:00:00.000Z'),
  expiresAt: new Date('2026-11-04T09:00:00.000Z'),
  useCount: 2,
  revokedAt: null,
};

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function start(fixture: Parameters<typeof dashboardDatabase>[0]) {
  return startTestApp('ok', '', { database: dashboardDatabase(fixture) });
}

function cancelUrl(invitationId: string): string {
  return `/events/${EVENT_ID}/invitations/${invitationId}`;
}

describe('DELETE /events/:eventId/invitations/:invitationId', () => {
  it('cancels a link of the event for the administrator', async () => {
    const app = await start({
      sessions: [kingSession],
      administrator: KING,
      memberUserId: KING.id,
      invitations: [INVITATION],
    });

    try {
      const response = await fetch(`${app.baseUrl}${cancelUrl(INVITATION_ID)}`, {
        method: 'DELETE',
        headers: bearer(kingSession.token),
      });

      expect(response.status).toBe(204);
    } finally {
      await app.close();
    }
  });

  it('refuses a co-device of that same event with forbidden, never not_found', async () => {
    const app = await start({
      sessions: [coDeviceSession],
      administrator: KING,
      memberUserId: null,
      invitations: [INVITATION],
    });

    try {
      const response = await fetch(`${app.baseUrl}${cancelUrl(INVITATION_ID)}`, {
        method: 'DELETE',
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
      invitations: [INVITATION],
    });

    try {
      const response = await fetch(`${app.baseUrl}${cancelUrl(INVITATION_ID)}`, {
        method: 'DELETE',
        headers: bearer(memberSession.token),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    } finally {
      await app.close();
    }
  });

  it('answers not_found for a link of another event', async () => {
    // El doble solo guarda las invitaciones de este evento, así que un id de otro evento es una fila
    // que la sentencia —`id = $1 AND event_id = $2`— no alcanza: lo mismo que un id inexistente.
    const app = await start({
      sessions: [kingSession],
      administrator: KING,
      memberUserId: KING.id,
      invitations: [INVITATION],
    });

    try {
      const response = await fetch(`${app.baseUrl}${cancelUrl(OTHER_INVITATION_ID)}`, {
        method: 'DELETE',
        headers: bearer(kingSession.token),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'not_found' });
    } finally {
      await app.close();
    }
  });

  it('answers not_found for a link that does not exist', async () => {
    const app = await start({
      sessions: [kingSession],
      administrator: KING,
      memberUserId: KING.id,
    });

    try {
      const response = await fetch(`${app.baseUrl}${cancelUrl(UNKNOWN_INVITATION_ID)}`, {
        method: 'DELETE',
        headers: bearer(kingSession.token),
      });

      expect(response.status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('answers not_found for an event the session does not reach', async () => {
    const app = await start({
      sessions: [memberSession],
      administrator: KING,
      memberUserId: 'someone-else',
      invitations: [INVITATION],
    });

    try {
      const response = await fetch(`${app.baseUrl}${cancelUrl(INVITATION_ID)}`, {
        method: 'DELETE',
        headers: bearer(memberSession.token),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'not_found' });
    } finally {
      await app.close();
    }
  });
});
