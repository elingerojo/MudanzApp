import { expect, test, type APIRequestContext } from '@playwright/test';
import type { CreatedEvent, CreatedInvitation, IssuedSession } from '@mudanzapp/shared';

import { ADMIN_TOKEN, BACKEND_URL, FRONTENDS, frontendUrl } from './support/harness.js';

/**
 * Evidencia de los cortes D2 (`event-selector`) y D15 (`evento-recordado`).
 *
 * La hipótesis es la elección: una cuenta con dos o más membresías **no** aterriza en silencio en la
 * más reciente. Al entrar llega a `/eventos`, elige una mudanza y el resto de la superficie privada
 * —captura y Cuenta— habla de la elegida. Desde D15 la elección se recuerda en este navegador, así
 * que una recarga conserva la mudanza y el cambio se hace desde la Cuenta; solo un navegador sin un
 * recordado válido vuelve a ver el selector.
 *
 * **Límite declarado.** El verificador `fake` fija un sujeto, así que todas las cuentas del arnés son
 * la misma y la lista acumula los eventos de las corridas anteriores. Por eso el caso crea **dos**
 * membresías propias, afirma que hay al menos dos opciones y elige por su trayecto —no por su
 * posición—: si la superficie usara la más reciente, el título de captura no coincidiría.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

const FRONTEND = FRONTENDS.find((frontend) => frontend.name === 'frontend');
const FRONTEND_URL = FRONTEND === undefined ? '' : frontendUrl(FRONTEND);

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function createEvent(
  request: APIRequestContext,
  originCity: string,
  destinationCity: string,
): Promise<CreatedEvent['event']> {
  const response = await request.post(`${BACKEND_URL}/admin/events`, {
    headers: adminHeaders,
    data: { originCity, destinationCity },
  });
  expect(response.status()).toBe(201);
  const { event } = (await response.json()) as CreatedEvent;
  return event;
}

/** Canjea un enlace del evento y lo reclama con la cuenta: una membresía para el sujeto `fake`. */
async function linkAccountToEvent(
  request: APIRequestContext,
  eventId: string,
  deviceLabel: string,
): Promise<void> {
  const invitationResponse = await request.post(
    `${BACKEND_URL}/admin/events/${eventId}/invitations`,
    { headers: adminHeaders },
  );
  expect(invitationResponse.status()).toBe(201);
  const invitation = (await invitationResponse.json()) as CreatedInvitation;

  const redeemed = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: { inviteToken: invitation.token, deviceLabel },
  });
  expect(redeemed.status()).toBe(201);
  const session = (await redeemed.json()) as IssuedSession;

  const claimed = await request.post(`${BACKEND_URL}/auth/claim`, {
    headers: bearer(session.sessionToken),
    data: { oauthToken: 'e2e-selector-token', deviceLabel },
  });
  expect(claimed.status()).toBe(201);
}

test('an account with two moves chooses once and the browser remembers where it works', async ({
  request,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'the selector lives in the private surface');

  const first = await createEvent(request, 'Ambato', 'Machala');
  const second = await createEvent(request, 'Tena', 'Esmeraldas');
  await linkAccountToEvent(request, first.id, 'e2e-selector-first');
  await linkAccountToEvent(request, second.id, 'e2e-selector-second');

  // 1. Se entra con la cuenta: con dos o más membresías el destino es el selector.
  await page.goto(`${FRONTEND_URL}/`);
  await page.getByTestId('home-account-signin').click();
  await expect(page).toHaveURL(/\/eventos$/);
  await expect(page.getByTestId('event-selector-title')).toBeVisible();
  await expect(page.getByTestId('shell-nav-account')).toHaveAttribute('aria-current', 'page');

  // 2. Las dos membresías propias están en la lista, con su trayecto y su rol. La base del arnés
  //    acumula membresías de otras corridas, así que no se afirma un número exacto.
  const choices = page.getByTestId('event-choice');
  await expect(choices.filter({ hasText: 'Ambato → Machala' }).first()).toBeVisible();
  await expect(choices.filter({ hasText: 'Tena → Esmeraldas' }).first()).toBeVisible();

  // 3. Se elige la primera de la lista —la más antigua— y la bienvenida habla de ella, no de la
  //    reciente (corte D13: elegir aterriza en `/inicio`).
  const firstChoice = choices.first();
  const firstTitle = (await firstChoice.getByTestId('event-choice-title').innerText()).trim();
  await firstChoice.click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByTestId('event-title')).toHaveText(firstTitle);

  // 4. La Cuenta refleja la misma mudanza y ofrece cambiarla.
  await page.getByTestId('shell-nav-account').click();
  await expect(page.getByTestId('cuenta-event-title')).toHaveText(firstTitle);
  await expect(page.getByTestId('cuenta-events-link')).toBeVisible();

  // 5. Desde D15 la elección se recuerda: recargar un destino privado ya no vuelve a preguntar.
  await page.goto(`${FRONTEND_URL}/capturados`);
  await expect(page).toHaveURL(/\/capturados$/);
  await page.getByTestId('shell-nav-account').click();
  await expect(page.getByTestId('cuenta-event-title')).toHaveText(firstTitle);

  // 6. El cambio de mudanza se hace desde la Cuenta y también queda recordado.
  await page.getByTestId('cuenta-events-link').click();
  await expect(page).toHaveURL(/\/eventos$/);
  await expect(page.getByTestId('event-selector-title')).toBeVisible();

  // La base acumula eventos de corridas anteriores; el recién creado es el último con ese trayecto.
  await page.getByTestId('event-choice').filter({ hasText: 'Tena → Esmeraldas' }).last().click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByTestId('event-title')).toHaveText('Tena → Esmeraldas');
  expect(await page.evaluate(() => localStorage.getItem('mudanzapp.event'))).toBe(second.id);

  await page.goto(`${FRONTEND_URL}/cuenta`);
  await expect(page.getByTestId('cuenta-event-title')).toHaveText('Tena → Esmeraldas');

  // 7. Un navegador sin un evento recordado válido vuelve a ver el selector una vez.
  await page.evaluate(() => localStorage.removeItem('mudanzapp.event'));
  await page.goto(`${FRONTEND_URL}/capturados`);
  await expect(page).toHaveURL(/\/eventos$/);
  await expect(page.getByTestId('event-selector-title')).toBeVisible();
});
