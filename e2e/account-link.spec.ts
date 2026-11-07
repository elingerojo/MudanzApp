import { expect, test, type APIRequestContext } from '@playwright/test';
import type {
  CreatedEvent,
  CreatedInvitation,
  CurrentIdentity,
  IssuedSession,
} from '@mudanzapp/shared';

import { chooseEventIfAsked } from './support/choose-event.js';
import { ADMIN_TOKEN, BACKEND_URL, FRONTENDS, frontendUrl } from './support/harness.js';

/**
 * Evidencia del ciclo 4c-1 (`oauth-login`, `plan-ciclo-4c-event-admin` §5).
 *
 * El recorrido es el de la hipótesis: el co-dispositivo pide su sesión de cuenta al proveedor desde la
 * Cuenta del marco y vuelve al evento como cuenta, sin pegar nada. El caso corre una vez, en el
 * `project` de `frontend`.
 *
 * **Límite declarado del arnés.** El flujo corre con el doble `fake` (configuración compilada del
 * desarrollo y `OAUTH_MODE=fake` en el backend): lo que se demuestra es el recorrido del producto —la
 * puerta, la vuelta, el reclamo y la credencial sustituida—, no el proveedor real, que es un hecho del
 * dueño y solo se ejerce en `live`.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

const FRONTEND = FRONTENDS.find((frontend) => frontend.name === 'frontend');
const FRONTEND_URL = FRONTEND === undefined ? '' : frontendUrl(FRONTEND);

/** Nombre que el verificador `fake` del backend atribuye al sujeto. */
const FAKE_DISPLAY_NAME = 'Invitado';

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function eventWithSession(
  request: APIRequestContext,
): Promise<{ event: CreatedEvent['event']; session: IssuedSession }> {
  const eventResponse = await request.post(`${BACKEND_URL}/admin/events`, {
    headers: adminHeaders,
    data: { originCity: 'Bogotá', destinationCity: 'Ciudad de México' },
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

  return { event, session: (await redeemed.json()) as IssuedSession };
}

test('a co-device links an account from the account card and keeps its event', async ({
  request,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'account link walks the private surface');

  const own = await eventWithSession(request);

  // El dispositivo entra con la sesión de evento sembrada, como después de canjear el enlace.
  await page.addInitScript(
    (token) => localStorage.setItem('mudanzapp.session', token),
    own.session.sessionToken,
  );
  await page.goto(`${FRONTEND_URL}/captura`);
  await expect(page.getByTestId('event-title')).toBeVisible();

  // 1. La Cuenta es un destino de la barra y ofrece vincular: el dispositivo no tiene sujeto.
  await page.getByTestId('shell-nav-account').click();
  await expect(page.getByTestId('shell-account-link')).toBeVisible();

  // 2. Al pulsar, el flujo sale y vuelve; el reclamo deja la sesión de cuenta y la pantalla en captura.
  //    La cuenta acumula membresías, así que desde D2 el destino puede ser el selector: se elige la
  //    más reciente, que es este evento.
  await page.getByTestId('shell-account-link').click();
  await expect(page).toHaveURL(/\/(captura|eventos)$/);
  await chooseEventIfAsked(page);
  await expect(page).toHaveURL(/\/captura$/);

  // 3. La Cuenta ya muestra la cuenta vinculada y la acción desaparece.
  await page.getByTestId('shell-nav-account').click();
  await expect(page.getByTestId('cuenta-identity')).toContainText(FAKE_DISPLAY_NAME);
  await expect(page.getByTestId('shell-account-link')).toHaveCount(0);

  // 4. La credencial del dispositivo es otra y el backend la reconoce como sesión de cuenta del evento.
  const token = await page.evaluate(() => localStorage.getItem('mudanzapp.session'));
  expect(token).not.toBeNull();
  expect(token).not.toBe(own.session.sessionToken);

  const identityResponse = await request.get(`${BACKEND_URL}/auth/session`, {
    headers: bearer(String(token)),
  });
  expect(identityResponse.status()).toBe(200);

  const identity = (await identityResponse.json()) as CurrentIdentity;
  expect(identity.user?.displayName).toBe(FAKE_DISPLAY_NAME);
  expect(identity.session.scope).toBe('app');
  // El sujeto del doble es uno solo para toda la suite, así que la cuenta acumula los eventos de
  // corridas anteriores: lo que se afirma es que **este** evento entra en su alcance, no que sea el único.
  expect(identity.events.map((event) => event.id)).toContain(own.event.id);

  // 5. La sesión reclamada se sustituye: el token anterior ya no sirve (regla aditiva de §30).
  const superseded = await request.get(`${BACKEND_URL}/events`, {
    headers: bearer(own.session.sessionToken),
  });
  expect(superseded.status()).toBe(401);
  await expect(superseded.json()).resolves.toEqual({ error: 'session_revoked' });
});
