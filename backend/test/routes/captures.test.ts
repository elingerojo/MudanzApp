import type { CaptureTicket } from '@mudanzapp/shared';

import {
  dashboardDatabase,
  EVENT_ID,
  OTHER_EVENT_ID,
  type SessionFixture,
} from '../support/event-admin-fixture.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La frontera del ticket de captura y de su descarte (ciclo 4g, `direct-upload`).
 *
 * La hipótesis pide cuatro cosas:
 * - el ticket se emite **sin recibir bytes** y con las tres URL firmadas;
 * - un tipo que no es la salida del codificador es `400 photo_invalid`;
 * - un evento que la sesión no alcanza responde `404`, igual que uno inexistente;
 * - el descarte es idempotente (`204`) y no distingue «no está» de «ya no está».
 *
 * El efecto real del almacén —objetos escritos, copiados y borrados— se demuestra en
 * `test/storage/r2-fake.test.ts` y en la adjunción sobre la base.
 */

const MEMBER = { id: 'user-member', displayName: 'Luis', isAdmin: false };

const memberSession: SessionFixture = {
  token: 'member-token',
  id: '55555555-5555-4555-8555-555555555555',
  userId: MEMBER.id,
  eventId: null,
  displayName: MEMBER.displayName,
  isAdmin: false,
};

const CAPTURE_ID = '7b0d3f43-2a4e-4f7a-9a51-0d3a1e6f5c11';

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function start() {
  return startTestApp('ok', '', {
    database: dashboardDatabase({
      sessions: [memberSession],
      administrator: null,
      memberUserId: MEMBER.id,
    }),
  });
}

describe('POST /events/:eventId/captures', () => {
  it('issues three signed urls without receiving any bytes', async () => {
    const app = await start();

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/captures`, {
        method: 'POST',
        headers: { ...bearer(memberSession.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/webp' }),
      });

      expect(response.status).toBe(201);

      const ticket = (await response.json()) as CaptureTicket;

      expect(ticket.captureId).toMatch(/^[0-9a-f-]{36}$/);
      expect(ticket.contentType).toBe('image/webp');
      expect(Date.parse(ticket.expiresAt)).toBeGreaterThan(Date.now());
      expect(Object.keys(ticket.uploads).sort()).toEqual(['large', 'medium', 'thumb']);

      for (const variant of ['thumb', 'medium', 'large'] as const) {
        expect(ticket.uploads[variant].key).toBe(
          `${EVENT_ID}/captures/${ticket.captureId}/${variant}`,
        );
        expect(ticket.uploads[variant].url.startsWith('/__fake-r2/put?token=')).toBe(true);
      }
    } finally {
      await app.close();
    }
  });

  it('rejects a type that is not the encoder output at the frontier', async () => {
    const app = await start();

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/captures`, {
        method: 'POST',
        headers: { ...bearer(memberSession.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/gif' }),
      });

      // Un campo del JSON que no cumple el esquema es `validation_failed`, como en el resto del
      // borde; `photo_invalid` queda para lo que el dominio juzga sobre los bytes.
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'validation_failed' });
    } finally {
      await app.close();
    }
  });

  it('does not distinguish an event the session cannot reach', async () => {
    const app = await start();

    try {
      const response = await fetch(`${app.baseUrl}/events/${OTHER_EVENT_ID}/captures`, {
        method: 'POST',
        headers: { ...bearer(memberSession.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/webp' }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'not_found' });
    } finally {
      await app.close();
    }
  });

  it('requires a session', async () => {
    const app = await start();

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/captures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/webp' }),
      });

      expect(response.status).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('DELETE /events/:eventId/captures/:captureId', () => {
  it('discards the staging and is idempotent', async () => {
    const app = await start();

    try {
      const first = await fetch(`${app.baseUrl}/events/${EVENT_ID}/captures/${CAPTURE_ID}`, {
        method: 'DELETE',
        headers: bearer(memberSession.token),
      });
      const second = await fetch(`${app.baseUrl}/events/${EVENT_ID}/captures/${CAPTURE_ID}`, {
        method: 'DELETE',
        headers: bearer(memberSession.token),
      });

      expect(first.status).toBe(204);
      expect(second.status).toBe(204);
      await expect(first.text()).resolves.toBe('');
    } finally {
      await app.close();
    }
  });

  it('refuses a capture of an event the session cannot reach with capture_not_found', async () => {
    const app = await start();

    try {
      const response = await fetch(
        `${app.baseUrl}/events/${OTHER_EVENT_ID}/captures/${CAPTURE_ID}`,
        { method: 'DELETE', headers: bearer(memberSession.token) },
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'capture_not_found' });
    } finally {
      await app.close();
    }
  });

  it('rejects a capture id that is not a uuid', async () => {
    const app = await start();

    try {
      const response = await fetch(`${app.baseUrl}/events/${EVENT_ID}/captures/not-a-uuid`, {
        method: 'DELETE',
        headers: bearer(memberSession.token),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'validation_failed' });
    } finally {
      await app.close();
    }
  });
});
