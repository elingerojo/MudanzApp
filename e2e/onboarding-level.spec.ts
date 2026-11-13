import { expect, test, type APIRequestContext } from '@playwright/test';
import type { CreatedEvent, CreatedInvitation, IssuedSession } from '@mudanzapp/shared';

import { enterCapture } from './support/enter-capture.js';
import { ADMIN_TOKEN, BACKEND_URL } from './support/harness.js';

/**
 * Evidencia del corte 3k (`nivel-onboarding`, `plan-ciclo-3k` §7).
 *
 * La promoción se deriva de lo que la mudanza ya publicó: con 0 a 2 artículos publicados el borrador
 * de IA lidera y `Repetir la foto` es discreto; a partir de 3 los dos pesan igual. La persona puede
 * **subir** el nivel desde `Cuenta`, y la recarga es la prueba de que el hecho es del servidor y no de
 * esta pestaña.
 *
 * La derivación por tres artículos publicados se ejercita en unidad y en la base; aquí se demuestra
 * el cambio visible de la pantalla y la frontera de la escritura.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function eventWithSession(
  request: APIRequestContext,
  origin: string,
  destination: string,
): Promise<{
  event: CreatedEvent['event'];
  invitation: CreatedInvitation;
  session: IssuedSession;
}> {
  const eventResponse = await request.post(`${BACKEND_URL}/admin/events`, {
    headers: adminHeaders,
    data: { originCity: origin, destinationCity: destination },
  });
  expect(eventResponse.status()).toBe(201);
  const { event } = (await eventResponse.json()) as CreatedEvent;

  const invitationResponse = await request.post(
    `${BACKEND_URL}/admin/events/${event.id}/invitations`,
    { headers: adminHeaders },
  );
  expect(invitationResponse.status()).toBe(201);
  const invitation = (await invitationResponse.json()) as CreatedInvitation;

  const redeemed = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: { inviteToken: invitation.token },
  });
  expect(redeemed.status()).toBe(201);
  const session = (await redeemed.json()) as IssuedSession;

  return { event, invitation, session };
}

test('the capture panel promotes the draft at level 0 and equals both actions after raising', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'the onboarding suite opens the private surface');

  const own = await eventWithSession(request, 'Bogotá', 'Ciudad de México');

  // 1. Nivel 0 (cero publicados): el borrador lidera y `Repetir la foto` es discreto.
  await page.goto(`/invitacion?token=${encodeURIComponent(own.invitation.token)}`);
  await page.getByTestId('redeem-submit').click();
  await enterCapture(page);

  const draft = page.getByTestId('item-form-draft');
  const retry = page.getByTestId('item-photo-label');
  await expect(draft).toHaveClass(/bg-slate-900/);
  await expect(retry).not.toHaveClass(/bg-slate-900/);
  await expect(page.getByTestId('item-form-onboarding')).toContainText('Publica 3 artículos');

  // 2. Cuenta dice el nivel vigente y ofrece subirlo; el umbral sale de la tabla.
  await page.goto('/cuenta');
  await expect(page.getByTestId('cuenta-onboarding-copy')).toContainText('usa 1 foto');
  await expect(page.getByTestId('cuenta-onboarding-copy')).toContainText('Publica 3 artículos');
  await page.getByTestId('cuenta-onboarding-raise').click();
  await expect(page.getByTestId('cuenta-onboarding-copy')).toContainText('usa 2 fotos');

  // 3. La recarga es la prueba de que el hecho es del servidor: sigue en 2 fotos y sin acción.
  await page.reload();
  await expect(page.getByTestId('cuenta-onboarding-copy')).toContainText('usa 2 fotos');
  await expect(page.getByTestId('cuenta-onboarding-raise')).toHaveCount(0);

  // 4. Nivel 1: los dos botones pesan igual; `Publicar` sigue siendo el primario real.
  await page.goto('/inicio');
  await enterCapture(page);
  await expect(page.getByTestId('item-form-draft')).not.toHaveClass(/bg-slate-900/);
  await expect(page.getByTestId('item-photo-label')).not.toHaveClass(/bg-slate-900/);

  // 5. La frontera: fuera de rango o con una clave de más responde `400 validation_failed`.
  const outOfRange = await request.patch(`${BACKEND_URL}/events/${own.event.id}/onboarding-level`, {
    headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'application/json' },
    data: { level: 2 },
  });
  expect(outOfRange.status()).toBe(400);
  await expect(outOfRange.json()).resolves.toEqual({ error: 'validation_failed' });

  const extraKey = await request.patch(`${BACKEND_URL}/events/${own.event.id}/onboarding-level`, {
    headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'application/json' },
    data: { level: 1, photos: 9 },
  });
  expect(extraKey.status()).toBe(400);
  await expect(extraKey.json()).resolves.toEqual({ error: 'validation_failed' });
});
