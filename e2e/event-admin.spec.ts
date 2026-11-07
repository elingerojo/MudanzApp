import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type {
  CreatedEvent,
  CreatedInvitation,
  CreatedItem,
  IssuedSession,
  PublishedListing,
} from '@mudanzapp/shared';

import { attachCapture } from './support/attach-capture.js';
import { ADMIN_TOKEN, BACKEND_URL, FRONTENDS, frontendUrl } from './support/harness.js';

/**
 * Evidencia de `event-admin` (ciclo 4c-2), del control de acceso (ciclo 4c-3) y de la administración
 * como hija de la Cuenta (corte D10).
 *
 * La hipótesis se recorre entera: la cuenta que se autentica desde el evento lo reclama y abre la
 * administración desde su Cuenta —con una fila de acceso por co-dispositivo, no la propia—; un
 * co-dispositivo que la pide vuelve a `Cuenta` con el aviso porque el borde le responde `403`; el rey
 * des-invita a un dispositivo y ese token deja de servir; y cancela un enlace pendiente, tras lo cual
 * el canje responde `410 invitation_invalid`.
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

/** JPEG 1×1 válido: la salida que produce el codificador del dispositivo. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

const VARIANTS = [
  { variant: 'large', w: 1_440, h: 1_080 },
  { variant: 'medium', w: 768, h: 576 },
  { variant: 'thumb', w: 320, h: 240 },
] as const;

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

/** Un enlace emitido y todavía sin canjear: el que el panel lista como «activo». */
async function createInvitationLink(
  request: APIRequestContext,
  eventId: string,
): Promise<CreatedInvitation> {
  const response = await request.post(`${BACKEND_URL}/admin/events/${eventId}/invitations`, {
    headers: adminHeaders,
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as CreatedInvitation;
}

/** Un co-dispositivo nuevo: una invitación propia y su canje, sin cuenta. */
async function redeemCoDevice(
  request: APIRequestContext,
  eventId: string,
  deviceLabel: string,
): Promise<IssuedSession> {
  const invitation = await createInvitationLink(request, eventId);

  const redeemed = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: { inviteToken: invitation.token, deviceLabel },
  });
  expect(redeemed.status()).toBe(201);
  return (await redeemed.json()) as IssuedSession;
}

/** Un artículo del evento, documentado por la sesión que lo publica. */
async function createItem(
  request: APIRequestContext,
  eventId: string,
  token: string,
  title: string,
): Promise<CreatedItem['item']> {
  const response = await request.post(`${BACKEND_URL}/events/${eventId}/items`, {
    headers: bearer(token),
    data: { title, note: 'Captura por error', widthCm: 90, heightCm: 80, depthCm: 90 },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as CreatedItem).item;
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

test('the event administrator opens its dashboard, revokes a co-device and cancels a link', async ({
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

  // Dos co-dispositivos que no tienen cuenta, y un enlace que nadie canjeó todavía.
  const firstDevice = await redeemCoDevice(request, event.id, 'Tableta');
  const secondDevice = await redeemCoDevice(request, event.id, 'Teléfono viejo');
  const pendingInvitation = await createInvitationLink(request, event.id);

  // 1. El rey abre la Cuenta y entra al panel desde su enlace.
  await seedSession(page, king.sessionToken);
  await page.goto(`${FRONTEND_URL}/cuenta`);
  await page.getByTestId('cuenta-dashboard-link').click();

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

  // El enlace pendiente se publica «activo» y es cancelable; la fila se localiza por su id, no por el
  // orden de la lista, que no se asume.
  const pendingRow = page.getByTestId(`access-invitation-${pendingInvitation.id}`);
  await expect(pendingRow).toBeVisible();
  await expect(pendingRow.getByTestId('access-invitation-state')).toHaveText('activo');

  // El nombre del enlace lo decide el servidor y la fila lo publica: es lo que permite cancelar el
  // correcto entre varios activos. Se afirma la palabra que devolvió el `201`, nunca una literal: el
  // anillo comparte estado entre corridas.
  await expect(pendingRow.getByTestId('access-invitation-name')).toContainText(
    `Enlace ${pendingInvitation.label}`,
  );

  // 2. Des-invitar: dos toques y la lectura se rehace.
  await page.getByTestId('access-device-revoke').first().click();
  await page.getByTestId('access-device-revoke-confirm').first().click();

  await expect(
    page.getByTestId('access-device-state').filter({ hasText: 'sin acceso' }),
  ).toHaveCount(2);

  // 3. Cancelar el enlace pendiente: dos toques, la fila queda cancelada y el token deja de admitir.
  await pendingRow.getByTestId('access-invitation-cancel').click();
  await pendingRow.getByTestId('access-invitation-cancel-confirm').click();

  await expect(pendingRow.getByTestId('access-invitation-state')).toHaveText('cancelado');
  await expect(pendingRow.getByTestId('access-invitation-cancel')).toHaveCount(0);

  const afterCancel = await request.post(`${BACKEND_URL}/auth/redeem`, {
    data: { inviteToken: pendingInvitation.token, deviceLabel: 'Intento tras cancelar' },
  });
  expect(afterCancel.status()).toBe(410);
  await expect(afterCancel.json()).resolves.toEqual({ error: 'invitation_invalid' });

  // 4. Uno de los dos tokens dejó de servir; el otro sigue dentro. El orden de la lista no se asume:
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

  // 5. El co-dispositivo que sobrevive pide la administración y no entra: vuelve a `Cuenta` con el
  //    aviso, que es la pantalla dueña desde D10.
  const survivorToken = firstStatus === 200 ? firstDevice.sessionToken : secondDevice.sessionToken;
  const context = await browser.newContext();
  try {
    const coDevice = await context.newPage();
    await seedSession(coDevice, survivorToken);
    await coDevice.goto(`${FRONTEND_URL}/cuenta/evento`);

    // La URL lleva la familia del fallo, no solo el aviso: un `500` no puede leerse como un rechazo
    // de autorización (diagnóstico del borde, 2026-11-04).
    await expect(coDevice).toHaveURL(/\/cuenta\?denied=dashboard&reason=forbidden$/);
    await expect(coDevice.getByTestId('event-dashboard-denied')).toContainText(
      'esta cuenta no administra el evento',
    );
    await expect(coDevice.getByTestId('dashboard-panel')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('the event administrator retires a mistaken capture and the public page stops offering it', async ({
  request,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'the dashboard walks the private surface');

  const event = await createEvent(request);

  // El rey reclama el evento con su cuenta; desde ahí publica y después borra.
  const kingDevice = await redeemCoDevice(request, event.id, 'Teléfono del rey');
  const claimed = await request.post(`${BACKEND_URL}/auth/claim`, {
    headers: bearer(kingDevice.sessionToken),
    data: { oauthToken: 'e2e-admin-delete-token', deviceLabel: 'Teléfono del rey' },
  });
  expect(claimed.status()).toBe(201);
  const king = (await claimed.json()) as IssuedSession;

  // 1. Un artículo publicado: la ficha pública existe antes del borrado.
  const item = await createItem(request, event.id, king.sessionToken, 'Sillón equivocado');
  // El ticket firma las tres escrituras y el cuerpo de la foto no atraviesa el API.
  await attachCapture(request, {
    eventId: event.id,
    itemId: item.id,
    token: king.sessionToken,
    body: JPEG,
    variants: VARIANTS.map((variant) => ({
      variant: variant.variant,
      widthPx: variant.w,
      heightPx: variant.h,
    })),
  });

  const published = await request.post(
    `${BACKEND_URL}/events/${event.id}/items/${item.id}/listing`,
    { headers: bearer(king.sessionToken) },
  );
  expect(published.status()).toBe(201);
  const listing = (await published.json()) as PublishedListing;

  const before = await request.get(`${BACKEND_URL}/public/listings/${listing.slug}`);
  expect(before.status()).toBe(200);

  // 2. El rey abre el panel, ve la captura y la elimina con dos toques.
  await seedSession(page, king.sessionToken);
  await page.goto(`${FRONTEND_URL}/cuenta`);
  await page.getByTestId('cuenta-dashboard-link').click();

  const row = page.getByTestId(`dashboard-item-row-${item.id}`);
  await expect(row).toBeVisible();
  await expect(page.getByTestId('dashboard-counts')).toContainText('Capturados: 1');

  await page.getByTestId('dashboard-item-delete').first().click();
  await page.getByTestId('dashboard-item-delete-confirm').first().click();
  await expect(row).toHaveCount(0);

  // 3. La ficha pública responde `404` en la siguiente lectura; el artículo salió de `Capturados`.
  const after = await request.get(`${BACKEND_URL}/public/listings/${listing.slug}`);
  expect(after.status()).toBe(404);
  await expect(after.json()).resolves.toEqual({ error: 'not_found' });

  await page.getByTestId('shell-nav-captured').click();
  await expect(page.getByTestId('items-empty')).toBeVisible();
});
