import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { CreatedEvent, CreatedInvitation, IssuedSession } from '@mudanzapp/shared';

import { ADMIN_TOKEN, BACKEND_URL, FRONTENDS, frontendUrl } from './support/harness.js';

/**
 * Evidencia del ciclo 4c-2 (`event-admin` y el control de acceso por dispositivo, `plan-ciclo-4c-2` §8).
 *
 * La hipótesis tiene dos mitades y aquí se recorren las dos: la cuenta que se autentica desde el evento
 * lo reclama y abre el dashboard —con una fila de acceso por co-dispositivo, no la propia—, y un
 * co-dispositivo que pulsa la pestaña vuelve a `Capturados` con el aviso, porque el borde le responde
 * `403`.
 *
 * **Límite declarado.** El verificador `fake` fija un sujeto, así que todas las cuentas del arnés son la
 * misma: aquí se demuestra el reclamo y el rechazo, no que una segunda cuenta no se lleve el evento. Eso
 * lo prueba el unit de base con dos usuarios reales. El arnés corre `ng serve`, así que el panel se
 * ejercita por su superficie real, no por su build.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

const FRONTEND = FRONTENDS.find((frontend) => frontend.name === 'frontend');
const FRONTEND_URL = FRONTEND === undefined ? '' : frontendUrl(FRONTEND);

/** Nombre que el verificador `fake` del backend atribuye al sujeto. */
const FAKE_DISPLAY_NAME = 'Invitado';

const SESSION_KEY = 'mudanzapp.session';

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function createEvent(request: APIRequestContext): Promise<CreatedEvent['event']> {
  const response = await request.post(`${BACKEND_URL}/admin/events`, {
    headers: adminHeaders,
    data: { originCity: 'Quito', destinationCity: 'Guayaquil' },
  });
  expect(response.status()).toBe(201);
  const { event } = (await response.json()) as CreatedEvent;
  return event;
}

/** Un co-dispositivo nuevo: una invitación propia y su canje, sin cuenta. */
async function redeemCoDevice(
  request: APIRequestContext,
  eventId: string,
  deviceLabel: string,
): Promise<IssuedSession> {
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
  return (await redeemed.json()) as IssuedSession;
}

/** Deja el dispositivo con la credencial que la aplicación lee al arrancar. */
async function seedSession(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key ?? '', value ?? '');
    },
    [SESSION_KEY, token],
  );
}

test('the event administrator opens its dashboard and revokes a co-device', async ({
  request,
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'the dashboard walks the private surface');

  const event = await createEvent(request);

  // El rey: canjea el enlace y vincula su cuenta; ese acto reclama el evento.
  const kingDevice = await redeemCoDevice(request, event.id, 'Teléfono del rey');
  const claimed = await request.post(`${BACKEND_URL}/auth/claim`, {
    headers: bearer(kingDevice.sessionToken),
    data: { oauthToken: 'e2e-admin-token', deviceLabel: 'Teléfono del rey' },
  });
  expect(claimed.status()).toBe(201);
  const king = (await claimed.json()) as IssuedSession;

  // Dos co-dispositivos que no tienen cuenta.
  const firstDevice = await redeemCoDevice(request, event.id, 'Tableta');
  const secondDevice = await redeemCoDevice(request, event.id, 'Teléfono viejo');

  // 1. El rey abre la pestaña y el panel publica lo que el borde decidió.
  await seedSession(page, king.sessionToken);
  await page.goto(`${FRONTEND_URL}/eventos/${event.id}`);
  await page.getByTestId('event-tab-dashboard').click();

  await expect(page.getByTestId('dashboard-panel')).toBeVisible();
  await expect(page.getByTestId('dashboard-administrator')).toContainText(FAKE_DISPLAY_NAME);
  await expect(page.getByTestId('dashboard-counts')).toContainText('Capturados: 0');
  await expect(page.getByTestId('dashboard-unclaimed')).toHaveCount(0);

  // Solo co-dispositivos, y su estado es evidencia: la sesión de evento del rey sigue en la lista
  // porque el claim la revocó, mientras que su sesión de **cuenta** no aparece. Los dos co-dispositivos
  // nuevos están "con acceso" y son los únicos con botón.
  const rows = page.locator('li[data-testid^="access-device-"]');
  await expect(rows).toHaveCount(3);
  await expect(
    page.getByTestId('access-device-state').filter({ hasText: 'sin acceso' }),
  ).toHaveCount(1);
  await expect(page.getByTestId('access-device-revoke')).toHaveCount(2);

  // 2. Des-invitar: dos toques y la lectura se rehace.
  await page.getByTestId('access-device-revoke').first().click();
  await page.getByTestId('access-device-revoke-confirm').first().click();

  await expect(
    page.getByTestId('access-device-state').filter({ hasText: 'sin acceso' }),
  ).toHaveCount(2);

  // 3. Uno de los dos tokens dejó de servir; el otro sigue dentro. El orden de la lista no se asume:
  //    se pregunta por cada token y se conserva el que sobrevive.
  const statusOf = async (token: string): Promise<number> => {
    const response = await request.get(`${BACKEND_URL}/auth/session`, {
      headers: bearer(token),
    });
    return response.status();
  };

  const firstStatus = await statusOf(firstDevice.sessionToken);
  const secondStatus = await statusOf(secondDevice.sessionToken);
  expect([firstStatus, secondStatus].sort()).toEqual([200, 401]);

  // 4. El co-dispositivo que sobrevive ve la pestaña y no entra: vuelve a `Capturados` con el aviso.
  const survivorToken = firstStatus === 200 ? firstDevice.sessionToken : secondDevice.sessionToken;
  const context = await browser.newContext();
  try {
    const coDevice = await context.newPage();
    await seedSession(coDevice, survivorToken);
    await coDevice.goto(`${FRONTEND_URL}/eventos/${event.id}/dashboard`);

    // La URL lleva la familia del fallo, no solo el aviso: un `500` no puede leerse como un rechazo
    // de autorización (diagnóstico del borde, 2026-11-04).
    await expect(coDevice).toHaveURL(
      /\/eventos\/[0-9a-f-]+\/capturados\?denied=dashboard&reason=forbidden$/,
    );
    await expect(coDevice.getByTestId('event-dashboard-denied')).toContainText(
      'esta cuenta no administra el evento',
    );
    await expect(coDevice.getByTestId('dashboard-panel')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
