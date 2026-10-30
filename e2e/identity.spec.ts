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
 * Evidencia del ciclo 2 (`resumen-funcional` §3 y `decisiones` §30 revisada): reclamar con una
 * cuenta es **aditivo** —el enlace sigue sirviendo y los demás co-dispositivos siguen trabajando— y
 * cualquier sesión del evento emite invitaciones para su propio evento.
 *
 * Es una suite de API sobre el arnés real: backend + base de pruebas derivada + `OAUTH_MODE=fake`.
 * Se ejecuta una vez, no una por `project`, porque no abre ninguna superficie.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

test('the claim is additive and any event session can invite', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'API-level identity suite runs once');

  const runId = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. El administrador solo responde con su credencial.
  const anonymous = await request.post(`${BACKEND_URL}/admin/events`, {
    data: { originCity: 'Bogotá', destinationCity: 'Ciudad de México' },
  });
  expect(anonymous.status()).toBe(401);
  await expect(anonymous.json()).resolves.toEqual({ error: 'admin_unauthorized' });

  // 2. El administrador crea su evento y un segundo evento ajeno a la invitación.
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

  // 3. La invitación declara sus términos: 72 horas y cinco canjes.
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

  // 4. El primer co-dispositivo canjea el enlace **sin identidad** y recibe una sesión de evento.
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

  // Ve su evento y no ve el evento al que no fue invitada.
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

  // 5. Un segundo co-dispositivo canjea el mismo enlace: son cinco canjes en total.
  const redeemedB = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: { inviteToken: invitation.token, deviceLabel: `device-b-${runId}` },
  });
  expect(redeemedB.status()).toBe(201);
  const sessionB = (await redeemedB.json()) as IssuedSession;

  // 6. Cualquier sesión del evento emite invitaciones para **su** evento.
  const mintedResponse = await request.post(`${BACKEND_URL}/events/${eventA.id}/invitations`, {
    headers: bearer(sessionB.sessionToken),
  });
  expect(mintedResponse.status()).toBe(201);
  const mintedInvitation = (await mintedResponse.json()) as CreatedInvitation;
  expect(mintedInvitation.maxUses).toBe(5);
  expect(mintedInvitation.token).not.toBe(invitation.token);

  // La invitación emitida por un co-dispositivo admite a un tercero en el mismo evento.
  const redeemedC = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: { inviteToken: mintedInvitation.token, deviceLabel: `device-c-${runId}` },
  });
  expect(redeemedC.status()).toBe(201);
  const sessionC = (await redeemedC.json()) as IssuedSession;
  expect(sessionC.event?.id).toBe(eventA.id);

  // La autorización se ejerce por el evento de la sesión, no por el rol.
  const foreignMint = await request.post(`${BACKEND_URL}/events/${eventB.id}/invitations`, {
    headers: bearer(sessionB.sessionToken),
  });
  expect(foreignMint.status()).toBe(404);
  await expect(foreignMint.json()).resolves.toEqual({ error: 'not_found' });

  const anonymousMint = await request.post(`${BACKEND_URL}/events/${eventA.id}/invitations`);
  expect(anonymousMint.status()).toBe(401);
  await expect(anonymousMint.json()).resolves.toEqual({ error: 'unauthorized' });

  // 7. El reclamo es aditivo: la sesión de evento se sustituye por una de cuenta.
  const claimed = await request.post(`${BACKEND_URL}/auth/claim`, {
    headers: bearer(sessionA.sessionToken),
    data: { oauthToken: `assertion-a-${runId}`, deviceLabel: `device-a-account-${runId}` },
  });
  expect(claimed.status()).toBe(201);
  const accountSession = (await claimed.json()) as IssuedSession;
  expect(accountSession.user).not.toBeNull();
  expect(accountSession.event?.id).toBe(eventA.id);
  expect(accountSession.event?.role).toBe('member');
  expect(accountSession.sessionToken).not.toBe(sessionA.sessionToken);

  // Solo se revoca la sesión reclamada, porque el cliente la sustituye en `localStorage`.
  const superseded = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(sessionA.sessionToken),
  });
  expect(superseded.status()).toBe(401);
  await expect(superseded.json()).resolves.toEqual({ error: 'session_revoked' });

  // Los demás co-dispositivos no se enteran: la regla retirada los expulsaba a todos.
  const bStillWorks = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(sessionB.sessionToken),
  });
  expect(bStillWorks.status()).toBe(200);
  const bEvents = (await bStillWorks.json()) as { events: EventSummary[] };
  expect(bEvents.events.map((event) => event.id)).toEqual([eventA.id]);

  const cStillWorks = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(sessionC.sessionToken),
  });
  expect(cStillWorks.status()).toBe(200);

  // El enlace sigue sirviendo después del reclamo: tercer canje.
  const afterClaim = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: { inviteToken: invitation.token, deviceLabel: `device-d-${runId}` },
  });
  expect(afterClaim.status()).toBe(201);
  const sessionD = (await afterClaim.json()) as IssuedSession;
  expect(sessionD.event?.id).toBe(eventA.id);

  // 8. La base guarda hashes, el reclamo no marca `claimed_at` y `invited_by` es el dueño.
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  let ownerUserId: string | undefined;
  try {
    const storedSession = await client.query('SELECT 1 FROM app.session WHERE token_hash = $1', [
      accountSession.sessionToken,
    ]);
    expect(storedSession.rowCount).toBe(0);

    const invitationRows = await client.query<{
      use_count: number;
      consumed_at: Date | null;
      claimed_at: Date | null;
    }>('SELECT use_count, consumed_at, claimed_at FROM app.invitation WHERE id = $1', [
      invitation.id,
    ]);
    expect(invitationRows.rows[0]?.use_count).toBe(3);
    expect(invitationRows.rows[0]?.consumed_at).toBeInstanceOf(Date);
    expect(invitationRows.rows[0]?.claimed_at).toBeNull();

    const ownerRows = await client.query<{ owner_user_id: string }>(
      'SELECT owner_user_id FROM app.event WHERE id = $1',
      [eventA.id],
    );
    ownerUserId = ownerRows.rows[0]?.owner_user_id;
    expect(ownerUserId).toBeDefined();

    const memberRows = await client.query<{ invited_by: string | null }>(
      'SELECT invited_by FROM app.event_member WHERE event_id = $1 AND user_id = $2',
      [eventA.id, String(accountSession.user?.id)],
    );
    expect(memberRows.rows[0]?.invited_by).toBe(ownerUserId);
  } finally {
    await client.end();
  }

  // 9. El enlace sigue acotado: dos canjes más y el sexto ya no entra.
  for (const label of ['e', 'f']) {
    const response = await request.post(`${BACKEND_URL}/auth/redeem`, {
      data: { inviteToken: invitation.token, deviceLabel: `device-${label}-${runId}` },
    });
    expect(response.status(), `device ${label}`).toBe(201);
  }

  const exhausted = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: { inviteToken: invitation.token, deviceLabel: `device-g-${runId}` },
  });
  expect(exhausted.status()).toBe(410);
  await expect(exhausted.json()).resolves.toEqual({ error: 'invitation_invalid' });

  // 10. La sesión de cuenta lee su identidad y su evento.
  const current = await request.get(`${BACKEND_URL}/auth/session`, {
    headers: bearer(accountSession.sessionToken),
  });
  expect(current.status()).toBe(200);
  const identity = (await current.json()) as CurrentIdentity;
  expect(identity.user?.id).toBe(accountSession.user?.id);
  expect(identity.session.scope).toBe('app');
  expect(identity.events.map((event) => event.id)).toContain(eventA.id);

  // 11. El camino de regreso sigue siendo la cuenta, y la recuperación no revoca nada.
  const recovered = await request.post(`${BACKEND_URL}/auth/sessions`, {
    data: { oauthToken: `assertion-a-${runId}`, deviceLabel: `device-lost-${runId}` },
  });
  expect(recovered.status()).toBe(201);
  const recoveredSession = (await recovered.json()) as IssuedSession;
  expect(recoveredSession.user?.id).toBe(accountSession.user?.id);
  expect(recoveredSession.sessionToken).not.toBe(accountSession.sessionToken);

  const recoveredEvents = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(recoveredSession.sessionToken),
  });
  expect(recoveredEvents.status()).toBe(200);

  const claimedStillWorks = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(accountSession.sessionToken),
  });
  expect(claimedStillWorks.status()).toBe(200);

  // 12. El administrador ve las sesiones del evento y revoca una por dispositivo.
  const sessionsResponse = await request.get(`${BACKEND_URL}/admin/events/${eventA.id}/sessions`, {
    headers: adminHeaders,
  });
  expect(sessionsResponse.status()).toBe(200);
  const { sessions } = (await sessionsResponse.json()) as { sessions: SessionSummary[] };

  const claimedEventSession = sessions.find(
    (session) => session.deviceLabel === `device-a-${runId}`,
  );
  expect(claimedEventSession).toBeDefined();
  expect(claimedEventSession?.revokedAt).not.toBeNull();

  for (const label of ['b', 'c', 'd']) {
    const row = sessions.find((session) => session.deviceLabel === `device-${label}-${runId}`);
    expect(row, `session ${label}`).toBeDefined();
    expect(row?.revokedAt, `session ${label}`).toBeNull();
  }

  const recoveredRow = sessions.find((session) => session.deviceLabel === `device-lost-${runId}`);
  expect(recoveredRow).toBeDefined();
  expect(recoveredRow?.revokedAt).toBeNull();

  const revoked = await request.delete(
    `${BACKEND_URL}/admin/sessions/${String(recoveredRow?.id)}`,
    { headers: adminHeaders },
  );
  expect(revoked.status()).toBe(204);

  const revokedRecovered = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(recoveredSession.sessionToken),
  });
  expect(revokedRecovered.status()).toBe(401);
  await expect(revokedRecovered.json()).resolves.toEqual({ error: 'session_revoked' });

  // 13. Un token desconocido no se confunde con una sesión revocada.
  const unknown = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer('not-a-session-token'),
  });
  expect(unknown.status()).toBe(401);
  await expect(unknown.json()).resolves.toEqual({ error: 'unauthorized' });
});
