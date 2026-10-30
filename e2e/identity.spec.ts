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
 * Evidencia del ciclo 1 (`resumen-funcional` §2): un enlace de invitación acotado —72 horas y cinco
 * canjes— permite documentar **sin identidad** en el primer dispositivo, y el reclamo con una cuenta
 * conserva el acceso en más de un dispositivo sin transportar secretos entre ellos.
 *
 * Es una suite de API sobre el arnés real: backend + base de pruebas derivada + `OAUTH_MODE=fake`.
 * Se ejecuta una vez, no una por `project`, porque no abre ninguna superficie.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

test('a bounded invitation issues event sessions that a claim turns into an account', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'API-level identity suite runs once');

  const runId = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;

  // El administrador solo responde con su credencial.
  const anonymous = await request.post(`${BACKEND_URL}/admin/events`, {
    data: { originCity: 'Bogotá', destinationCity: 'Ciudad de México' },
  });
  expect(anonymous.status()).toBe(401);
  await expect(anonymous.json()).resolves.toEqual({ error: 'admin_unauthorized' });

  // 1. El administrador crea su evento y un segundo evento ajeno a la invitación.
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

  // 2. La invitación declara sus términos: 72 horas y cinco canjes.
  const invitationResponse = await request.post(
    `${BACKEND_URL}/admin/events/${eventA.id}/invitations`,
    { headers: adminHeaders },
  );
  expect(invitationResponse.status()).toBe(201);
  const invitation = (await invitationResponse.json()) as CreatedInvitation;
  expect(invitation.maxUses).toBe(5);

  const seventyTwoHours = 72 * 60 * 60 * 1_000;
  const remainingMs = new Date(invitation.expiresAt).getTime() - Date.now();
  expect(remainingMs).toBeGreaterThan(seventyTwoHours - 60_000);
  expect(remainingMs).toBeLessThanOrEqual(seventyTwoHours);

  // 3. El primer dispositivo canjea el enlace **sin identidad** y recibe una sesión de evento.
  const redeemed = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: { inviteToken: invitation.token, deviceLabel: `device-a-${runId}` },
  });
  expect(redeemed.status()).toBe(201);
  const sessionA = (await redeemed.json()) as IssuedSession;
  expect(sessionA.scope).toBe('app');
  expect(sessionA.user).toBeNull();
  expect(sessionA.event?.id).toBe(eventA.id);
  expect(sessionA.event?.role).toBeNull();
  expect(sessionA.sessionToken.length).toBeGreaterThan(32);

  // 4. La sesión de evento ve su evento y no ve el evento al que no fue invitada.
  const current = await request.get(`${BACKEND_URL}/auth/session`, {
    headers: bearer(sessionA.sessionToken),
  });
  expect(current.status()).toBe(200);
  const anonymousIdentity = (await current.json()) as CurrentIdentity;
  expect(anonymousIdentity.user).toBeNull();
  expect(anonymousIdentity.events.map((event) => event.id)).toEqual([eventA.id]);

  const visible = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(sessionA.sessionToken),
  });
  expect(visible.status()).toBe(200);
  const { events } = (await visible.json()) as { events: EventSummary[] };
  expect(events.map((event) => event.id)).toEqual([eventA.id]);

  const forbidden = await request.get(`${BACKEND_URL}/events/${eventB.id}`, {
    headers: bearer(sessionA.sessionToken),
  });
  expect(forbidden.status()).toBe(404);
  await expect(forbidden.json()).resolves.toEqual({ error: 'not_found' });

  // 5. El enlace admite cuatro canjes más: los cinco dispositivos quedan dentro del acuerdo.
  const extraSessions: IssuedSession[] = [];
  for (const label of ['b', 'c', 'd', 'e']) {
    const response = await request.post(`${BACKEND_URL}/auth/redeem`, {
      data: { inviteToken: invitation.token, deviceLabel: `device-${label}-${runId}` },
    });
    expect(response.status(), `device ${label}`).toBe(201);
    extraSessions.push((await response.json()) as IssuedSession);
  }

  // 6. El sexto canje ya no es posible: la invitación está agotada.
  const exhausted = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: { inviteToken: invitation.token, deviceLabel: `device-f-${runId}` },
  });
  expect(exhausted.status()).toBe(410);
  await expect(exhausted.json()).resolves.toEqual({ error: 'invitation_invalid' });

  // 7. La base guarda hashes, nunca los tokens emitidos, y cuenta los canjes.
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const sessionRows = await client.query<{ token_hash: string }>(
      'SELECT token_hash FROM app.session WHERE token_hash = $1',
      [sessionA.sessionToken],
    );
    expect(sessionRows.rowCount).toBe(0);

    const invitationRows = await client.query<{
      use_count: number;
      consumed_at: Date | null;
      claimed_at: Date | null;
    }>('SELECT use_count, consumed_at, claimed_at FROM app.invitation WHERE id = $1', [
      invitation.id,
    ]);
    expect(invitationRows.rows[0]?.use_count).toBe(5);
    expect(invitationRows.rows[0]?.consumed_at).toBeInstanceOf(Date);
    expect(invitationRows.rows[0]?.claimed_at).toBeNull();
  } finally {
    await client.end();
  }

  // 8. El reclamo convierte la sesión de evento en sesión de cuenta.
  const claimed = await request.post(`${BACKEND_URL}/auth/claim`, {
    headers: bearer(sessionA.sessionToken),
    data: { oauthToken: `assertion-a-${runId}`, deviceLabel: `device-a-${runId}` },
  });
  expect(claimed.status()).toBe(201);
  const accountSession = (await claimed.json()) as IssuedSession;
  expect(accountSession.user).not.toBeNull();
  expect(accountSession.event?.id).toBe(eventA.id);
  expect(accountSession.event?.role).toBe('member');
  expect(accountSession.sessionToken).not.toBe(sessionA.sessionToken);

  // 9. El reclamo cierra el enlace para todos y revoca las demás sesiones de evento.
  const afterClaim = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: { inviteToken: invitation.token, deviceLabel: `device-g-${runId}` },
  });
  expect(afterClaim.status()).toBe(410);
  await expect(afterClaim.json()).resolves.toEqual({ error: 'invitation_invalid' });

  const [otherDevice] = extraSessions;
  expect(otherDevice).toBeDefined();
  const revokedUse = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(String(otherDevice?.sessionToken)),
  });
  expect(revokedUse.status()).toBe(401);
  await expect(revokedUse.json()).resolves.toEqual({ error: 'session_revoked' });

  const ownEventSession = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(sessionA.sessionToken),
  });
  expect(ownEventSession.status()).toBe(401);
  await expect(ownEventSession.json()).resolves.toEqual({ error: 'session_revoked' });

  // 10. La sesión de cuenta ya no se puede reclamar otra vez.
  const reclaim = await request.post(`${BACKEND_URL}/auth/claim`, {
    headers: bearer(accountSession.sessionToken),
    data: { oauthToken: `assertion-a-${runId}` },
  });
  expect(reclaim.status()).toBe(409);
  await expect(reclaim.json()).resolves.toEqual({ error: 'session_not_claimable' });

  // 11. El camino de regreso es la cuenta: un navegador sin almacenamiento recupera el acceso.
  const recovered = await request.post(`${BACKEND_URL}/auth/sessions`, {
    data: { oauthToken: `assertion-a-${runId}`, deviceLabel: `device-lost-${runId}` },
  });
  expect(recovered.status()).toBe(201);
  const recoveredSession = (await recovered.json()) as IssuedSession;
  expect(recoveredSession.user?.id).toBe(accountSession.user?.id);
  expect(recoveredSession.sessionToken).not.toBe(accountSession.sessionToken);
  // `IssuedSession.event` es el evento más antiguo de la cuenta, no necesariamente el recién
  // reclamado: la cuenta puede pertenecer ya a otros eventos. La pertenencia se comprueba abajo.

  const recoveredIdentity = await request.get(`${BACKEND_URL}/auth/session`, {
    headers: bearer(recoveredSession.sessionToken),
  });
  expect(recoveredIdentity.status()).toBe(200);
  const identity = (await recoveredIdentity.json()) as CurrentIdentity;
  expect(identity.session.scope).toBe('app');
  expect(identity.events.map((event) => event.id)).toContain(eventA.id);

  // 12. El administrador ve las sesiones del evento y puede revocar una por dispositivo.
  const sessionsResponse = await request.get(`${BACKEND_URL}/admin/events/${eventA.id}/sessions`, {
    headers: adminHeaders,
  });
  expect(sessionsResponse.status()).toBe(200);
  const { sessions } = (await sessionsResponse.json()) as { sessions: SessionSummary[] };

  // Todas las sesiones de evento del evento quedaron revocadas por el reclamo.
  const eventSessionRows = sessions.filter((session) => session.userId === null);
  expect(eventSessionRows.length).toBeGreaterThanOrEqual(5);
  expect(eventSessionRows.every((session) => session.revokedAt !== null)).toBe(true);

  const recoveredRow = sessions.find((session) => session.deviceLabel === `device-lost-${runId}`);
  expect(recoveredRow).toBeDefined();
  expect(recoveredRow?.revokedAt).toBeNull();

  const revoked = await request.delete(
    `${BACKEND_URL}/admin/sessions/${String(recoveredRow?.id)}`,
    {
      headers: adminHeaders,
    },
  );
  expect(revoked.status()).toBe(204);

  const revokedRecovered = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(recoveredSession.sessionToken),
  });
  expect(revokedRecovered.status()).toBe(401);
  await expect(revokedRecovered.json()).resolves.toEqual({ error: 'session_revoked' });

  const unknown = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer('not-a-session-token'),
  });
  expect(unknown.status()).toBe(401);
  await expect(unknown.json()).resolves.toEqual({ error: 'unauthorized' });
});
