import { expect, test, type APIRequestContext } from '@playwright/test';
import type { CreatedEvent, CreatedInvitation } from '@mudanzapp/shared';

import { ADMIN_TOKEN, BACKEND_URL } from './support/harness.js';

/**
 * Evidencia de la corrección de 4a (`plan-ciclo-4a-correccion-cache-y-cuenta` §7): el enlace del
 * evento se reparte desde la Cuenta del marco y un segundo dispositivo entra con él, sin volver al
 * administrador.
 *
 * Es autocontenida: crea su evento y su invitación por API con el `ADMIN_TOKEN` del arnés, entra con
 * el primer dispositivo por la pantalla de canje y abre un **contexto de navegador nuevo** para el
 * segundo. Corre una vez, en el `project` de `frontend`, que es la superficie de la Cuenta.
 *
 * **Límite declarado:** la cabecera `cache-control` no se mide aquí. El arnés corre `ng serve` y no
 * `wrangler dev`, así que el borde lo cubre `shop/src/worker.spec.ts` (mismo límite que
 * `plan-ciclo-4a` §14).
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** Un evento real con la invitación que el administrador entrega fuera de la aplicación. */
async function eventWithInvitation(
  request: APIRequestContext,
): Promise<{ event: CreatedEvent['event']; invitation: CreatedInvitation }> {
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

  return { event, invitation: (await invitationResponse.json()) as CreatedInvitation };
}

test('a co-device gets in from the account card of the frame', async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'frontend',
    'the account card belongs to the private surface',
  );

  const { invitation } = await eventWithInvitation(request);

  // 1. El primer dispositivo entra con el enlace del administrador y abre la Cuenta del marco.
  await page.goto(`/invitacion?token=${encodeURIComponent(invitation.token)}`);
  await page.getByTestId('redeem-submit').click();
  await expect(page).toHaveURL(/\/captura$/);

  await page.getByTestId('shell-nav-account').click();
  await expect(page.getByTestId('shell-invite-card')).toBeVisible();

  // 2. El card emite la invitación con el evento de la sesión y compone el enlace del marco.
  await page.getByTestId('shell-invite-create').click();

  const linkInput = page.getByTestId('shell-invite-url');
  await expect(linkInput).toHaveValue(/\/invitacion\?token=.+/);
  const link = await linkInput.inputValue();

  // El enlace es nuevo: no reusa el que entregó el administrador.
  expect(link).not.toContain(invitation.token);
  expect(new URL(link).origin).toBe(new URL(page.url()).origin);

  // 3. Un segundo dispositivo, sin sesión, canjea ese enlace y aterriza en el mismo evento.
  const secondDevice = await browser.newContext();
  try {
    const secondPage = await secondDevice.newPage();

    await secondPage.goto(link);

    // El segundo dispositivo no trae sesión: la obtiene del canje, no de un almacenamiento previo.
    expect(await secondPage.evaluate(() => localStorage.getItem('mudanzapp.session'))).toBeNull();

    await expect(secondPage.getByTestId('redeem-token')).toHaveValue(/.+/);
    await secondPage.getByTestId('redeem-submit').click();

    await expect(secondPage).toHaveURL(/\/captura$/);
    await expect(secondPage.getByTestId('shell-nav-capture')).toBeVisible();

    const stored = await secondPage.evaluate(() => localStorage.getItem('mudanzapp.session'));
    expect(stored).not.toBeNull();
    expect(secondPage.url()).not.toContain(new URL(link).searchParams.get('token'));
  } finally {
    await secondDevice.close();
  }
});
