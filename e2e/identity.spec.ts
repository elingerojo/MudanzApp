import { expect, test } from '@playwright/test';
import type {
  CreatedEvent,
  CreatedInvitation,
  CurrentIdentity,
  EventSummary,
  IssuedSession,
  SessionSummary,
} from '@mudanzapp/shared';
import pg from 'pg';

import { ADMIN_TOKEN, BACKEND_URL, testDatabaseUrl } from './support/harness.js';

const { Client } = pg;

/**
 * Evidencia del ciclo 1 (`resumen-funcional` §2): un enlace de un solo uso crea sesiones
 * utilizables en más de un dispositivo dentro del mismo evento, sin contraseña y sin transportar
 * secretos entre dispositivos.
 *
 * Es una suite de API sobre el arnés real: backend + base de pruebas derivada + `OAUTH_MODE=fake`.
 * Se ejecuta una vez, no una por `project`, porque no abre ninguna superficie.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

test('a single-use invitation creates revocable sessions on more than one device', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'API-level identity suite runs once');

  const runId = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
  const deviceA = `device-a-${runId}`;
  const deviceB = `device-b-${runId}`;

  // El administrador solo responde con su credencial.
  const anonymous = await request.post(`${BACKEND_URL}/admin/events`, {
    data: { originCity: 'Bogotá', destinationCity: 'Ciudad de México' },
  });
  expect(anonymous.status()).toBe(401);
  await expect(anonymous.json()).resolves.toEqual({ error: 'admin_unauthorized' });

  // 1. El administrador crea el evento de la mudanza y un segundo evento ajeno a la invitación.
  const createdEvent = await request.post(`${BACKEND_URL}/admin/events`, {
    headers: adminHeaders,
    data: { originCity: 'Bogotá', destinationCity: 'Ciudad de México', currency: 'MXN' },
  });
  expect(createdEvent.status()).toBe(201);
  const { event: eventA } = (await createdEvent.json()) as CreatedEvent;

  const otherEventResponse = await request.post(`${BACKEND_URL}/admin/events`, {
    headers: adminHeaders,
    data: { originCity: 'Lima', destinationCity: 'Santiago', currency: 'USD' },
  });
  expect(otherEventResponse.status()).toBe(201);
  const { event: eventB } = (await otherEventResponse.json()) as CreatedEvent;

  // 2. El administrador emite la invitación de un solo uso.
  const invitationResponse = await request.post(
    `${BACKEND_URL}/admin/events/${eventA.id}/invitations`,
    { headers: adminHeaders },
  );
  expect(invitationResponse.status()).toBe(201);
  const invitation = (await invitationResponse.json()) as CreatedInvitation;
  expect(new Date(invitation.expiresAt).getTime()).toBeGreaterThan(Date.now());

  // 3. Dispositivo A: canjea el enlace y el servidor emite su sesión.
  const redeemed = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: {
      inviteToken: invitation.token,
      oauthToken: `assertion-a-${runId}`,
      deviceLabel: deviceA,
    },
  });
  expect(redeemed.status()).toBe(201);
  const sessionA = (await redeemed.json()) as IssuedSession;
  expect(sessionA.scope).toBe('app');
  expect(sessionA.event?.id).toBe(eventA.id);
  expect(sessionA.sessionToken.length).toBeGreaterThan(32);

  // 4. El enlace es de un solo uso: un tercer dispositivo no puede reusarlo.
  const reused = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: {
      inviteToken: invitation.token,
      oauthToken: `assertion-c-${runId}`,
      deviceLabel: `device-c-${runId}`,
    },
  });
  expect(reused.status()).toBe(410);
  await expect(reused.json()).resolves.toEqual({ error: 'invitation_invalid' });

  // 5. Dispositivo B: la misma cuenta abre una sesión nueva, sin reusar el enlace.
  const secondDevice = await request.post(`${BACKEND_URL}/auth/sessions`, {
    data: { oauthToken: `assertion-b-${runId}`, deviceLabel: deviceB },
  });
  expect(secondDevice.status()).toBe(201);
  const sessionB = (await secondDevice.json()) as IssuedSession;
  expect(sessionB.user.id).toBe(sessionA.user.id);
  expect(sessionB.event?.id).toBe(eventA.id);
  expect(sessionB.sessionToken).not.toBe(sessionA.sessionToken);

  // 6. El invitado ve su evento y no ve el evento al que no fue invitado.
  const visible = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(sessionA.sessionToken),
  });
  expect(visible.status()).toBe(200);
  const { events } = (await visible.json()) as { events: EventSummary[] };
  expect(events.map((event) => event.id)).toContain(eventA.id);
  expect(events.map((event) => event.id)).not.toContain(eventB.id);

  const forbidden = await request.get(`${BACKEND_URL}/events/${eventB.id}`, {
    headers: bearer(sessionA.sessionToken),
  });
  expect(forbidden.status()).toBe(404);
  await expect(forbidden.json()).resolves.toEqual({ error: 'not_found' });

  const current = await request.get(`${BACKEND_URL}/auth/session`, {
    headers: bearer(sessionB.sessionToken),
  });
  expect(current.status()).toBe(200);
  const identity = (await current.json()) as CurrentIdentity;
  expect(identity.session.scope).toBe('app');
  expect(identity.events.map((event) => event.id)).toContain(eventA.id);

  // 7. La base guarda hashes, nunca los tokens emitidos, y la invitación quedó consumida.
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const sessionRows = await client.query<{ token_hash: string }>(
      'SELECT token_hash FROM app.session WHERE token_hash = $1',
      [sessionA.sessionToken],
    );
    expect(sessionRows.rowCount).toBe(0);

    const invitationRows = await client.query<{ consumed_at: Date | null }>(
      'SELECT consumed_at FROM app.invitation WHERE id = $1',
      [invitation.id],
    );
    expect(invitationRows.rows[0]?.consumed_at).toBeInstanceOf(Date);
  } finally {
    await client.end();
  }

  // 8. El administrador ve las dos sesiones del evento.
  const sessionsResponse = await request.get(`${BACKEND_URL}/admin/events/${eventA.id}/sessions`, {
    headers: adminHeaders,
  });
  expect(sessionsResponse.status()).toBe(200);
  const { sessions } = (await sessionsResponse.json()) as { sessions: SessionSummary[] };
  const sessionRowA = sessions.find((session) => session.deviceLabel === deviceA);
  const sessionRowB = sessions.find((session) => session.deviceLabel === deviceB);
  expect(sessionRowA).toBeDefined();
  expect(sessionRowB).toBeDefined();
  expect(sessionRowA?.revokedAt).toBeNull();
  expect(sessionRowB?.revokedAt).toBeNull();

  // 9. Revocar la sesión A: deja de servir; la sesión B del mismo sujeto sigue viva.
  const revoked = await request.delete(`${BACKEND_URL}/admin/sessions/${String(sessionRowA?.id)}`, {
    headers: adminHeaders,
  });
  expect(revoked.status()).toBe(204);

  const revokedUse = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(sessionA.sessionToken),
  });
  expect(revokedUse.status()).toBe(401);
  await expect(revokedUse.json()).resolves.toEqual({ error: 'session_revoked' });

  const stillValid = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(sessionB.sessionToken),
  });
  expect(stillValid.status()).toBe(200);

  const unknown = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer('not-a-session-token'),
  });
  expect(unknown.status()).toBe(401);
  await expect(unknown.json()).resolves.toEqual({ error: 'unauthorized' });
});
