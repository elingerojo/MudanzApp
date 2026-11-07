import { expect, test, type APIRequestContext } from '@playwright/test';
import type { CreatedEvent, CreatedInvitation, IssuedSession } from '@mudanzapp/shared';

import { ADMIN_TOKEN, BACKEND_URL, FRONTENDS, frontendUrl } from './support/harness.js';

/**
 * Evidencia del ciclo 4c-1c (`account-signin`, `plan-ciclo-4c` §18).
 *
 * La hipótesis es el **regreso**: un dispositivo sin credencial entra con una cuenta ya vinculada y
 * aterriza en su evento, sin canjear ninguna invitación. El caso corre una vez, en el `project` de
 * `frontend`, y lo que se demuestra es el camino de la portada, no el del proveedor: el flujo va con el
 * doble `fake`, como el resto del arnés.
 *
 * **Límite declarado.** El doble usa un sujeto fijo, así que la cuenta acumula los eventos de todas las
 * corridas: se afirma que aterriza en **un** evento suyo, no en uno concreto. El caso de
 * `account_not_linked` —una cuenta sin ninguna membresía— se demuestra en el unit del callback, porque
 * en esta base el sujeto siempre tiene al menos uno.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

const FRONTEND = FRONTENDS.find((frontend) => frontend.name === 'frontend');
const FRONTEND_URL = FRONTEND === undefined ? '' : frontendUrl(FRONTEND);

/** Nombre que el verificador `fake` del backend atribuye al sujeto. */
const FAKE_DISPLAY_NAME = 'Invitado';

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Un evento cuya cuenta ya está vinculada: canje, reclamo y membresía. */
async function eventWithLinkedAccount(request: APIRequestContext): Promise<CreatedEvent['event']> {
  const eventResponse = await request.post(`${BACKEND_URL}/admin/events`, {
    headers: adminHeaders,
    data: { originCity: 'Quito', destinationCity: 'Guayaquil' },
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

  // El reclamo liga la cuenta al evento; a partir de aquí el regreso tiene a dónde volver.
  const claimed = await request.post(`${BACKEND_URL}/auth/claim`, {
    headers: bearer(session.sessionToken),
    data: { oauthToken: 'e2e-signin-token', deviceLabel: 'e2e-signin' },
  });
  expect(claimed.status()).toBe(201);

  return event;
}

test('a device with no credential comes back with its account and reaches its event', async ({
  request,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'account sign in walks the private surface');

  const event = await eventWithLinkedAccount(request);

  // 1. La portada ofrece las dos puertas: primero el enlace, después la cuenta.
  await page.goto(`${FRONTEND_URL}/`);
  await expect(page.getByTestId('home-door-invitation')).toBeVisible();
  await expect(page.getByTestId('home-door-account')).toBeVisible();
  await expect(page.getByTestId('home-account-signin')).toBeVisible();

  // 2. Se entra por la cuenta, sin canjear nada. El doble `fake` acumula membresías entre corridas,
  //    así que desde D2 el aterrizaje es el selector cuando hay más de una; con una sola sigue
  //    siendo `/captura`. En cualquiera de los dos casos se llega a la mudanza de este caso.
  await page.getByTestId('home-account-signin').click();
  await expect(page).toHaveURL(/\/(captura|eventos)$/);

  if (new URL(page.url()).pathname === '/eventos') {
    await page
      .getByTestId('event-choice')
      .filter({ hasText: `${event.originCity} → ${event.destinationCity}` })
      .first()
      .click();
    await expect(page).toHaveURL(/\/captura$/);
  }

  // 3. El dispositivo queda con sesión de cuenta, así que la Cuenta muestra el nombre y ya no ofrece
  //    vincular: el regreso no es un reclamo.
  await page.getByTestId('shell-nav-account').click();
  await expect(page.getByTestId('cuenta-identity')).toContainText(FAKE_DISPLAY_NAME);
  await expect(page.getByTestId('shell-account-link')).toHaveCount(0);

  // 4. La credencial es de cuenta y alcanza el evento que se acaba de vincular.
  const token = await page.evaluate(() => localStorage.getItem('mudanzapp.session'));
  expect(token).not.toBeNull();

  const identityResponse = await request.get(`${BACKEND_URL}/auth/session`, {
    headers: bearer(String(token)),
  });
  expect(identityResponse.status()).toBe(200);

  const identity = (await identityResponse.json()) as {
    readonly user: { readonly displayName: string } | null;
    readonly events: readonly { readonly id: string }[];
  };
  expect(identity.user?.displayName).toBe(FAKE_DISPLAY_NAME);
  expect(identity.events.map((entry) => entry.id)).toContain(event.id);
});
