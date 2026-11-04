import { expect, test } from '@playwright/test';
import type { CreatedEvent, ShopIdentity } from '@mudanzapp/shared';

import { ADMIN_TOKEN, BACKEND_URL } from './support/harness.js';

/**
 * Evidencia del ciclo 4d (`shop-account`).
 *
 * La hipótesis es el registro sin evento: un visitante entra por primera vez con el proveedor desde
 * `/cuenta`, la tienda le emite una sesión de alcance `shop`, lo reconoce al recargar y le permite
 * fijar un nombre visible. La sesión **no** abre la identidad de la aplicación privada.
 *
 * **Límite declarado.** El verificador `fake` fija un sujeto, así que esta base ya tiene la cuenta de
 * las suites de `frontend`: el e2e demuestra el acceso y el regreso, no el alta de una cuenta nueva.
 * Eso último vive en `backend/test/db/shop-account.test.ts`, que usa un emisor y un sujeto propios.
 * Si el caso cambia el nombre, lo restaura dentro de la misma prueba para no alterar las suites que
 * comparten la cuenta falsa.
 */
const FAKE_DISPLAY_NAME = 'Invitado';
const PROFILE_NAME = 'Compradora E2E';
const SHOP_SESSION_KEY = 'mudanzapp.shop.session';
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

test('a visitor registers in the shop without touching an event', async ({
  request,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'shop', 'the shop account suite runs once against shop');

  // 1. Sin sesión, la cuenta ofrece entrar; el evento no participa en ninguna parte del recorrido.
  await page.goto('/cuenta');
  await expect(page.getByTestId('shop-account-signin')).toBeVisible();
  await expect(page.getByTestId('shop-account-name')).toHaveCount(0);

  // 2. El primer acceso usa el flujo `fake`: vuelve por `/auth/callback`, el backend registra o reusa
  //    la cuenta y la tienda aterriza en `/cuenta` ya con su nombre.
  await page.getByTestId('shop-account-signin').click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByTestId('shop-account-name')).toHaveText(FAKE_DISPLAY_NAME);

  const token = await page.evaluate((key) => localStorage.getItem(key), SHOP_SESSION_KEY);
  expect(token).not.toBeNull();

  // 3. La sesión es de tienda: su propia lectura responde, la identidad del evento no.
  const shopIdentity = await request.get(`${BACKEND_URL}/auth/shop/session`, {
    headers: bearer(String(token)),
  });
  expect(shopIdentity.status()).toBe(200);
  const identity = (await shopIdentity.json()) as ShopIdentity;
  expect(identity.user.displayName).toBe(FAKE_DISPLAY_NAME);
  expect(identity.session.scope).toBe('shop');

  const appIdentity = await request.get(`${BACKEND_URL}/auth/session`, {
    headers: bearer(String(token)),
  });
  expect(appIdentity.status()).toBe(401);

  // 4. La recarga restaura la credencial y la tienda vuelve a leer la cuenta.
  await page.reload();
  await expect(page.getByTestId('shop-account-name')).toHaveText(FAKE_DISPLAY_NAME);

  // 5. El nombre es opcional y se fija después del primer acceso.
  await page.getByTestId('shop-account-name-input').fill(PROFILE_NAME);
  await page.getByTestId('shop-account-name-save').click();
  await expect(page.getByTestId('shop-account-saved')).toBeVisible();
  await expect(page.getByTestId('shop-account-name')).toHaveText(PROFILE_NAME);

  const renamed = await request.get(`${BACKEND_URL}/auth/shop/session`, {
    headers: bearer(String(token)),
  });
  expect(((await renamed.json()) as ShopIdentity).user.displayName).toBe(PROFILE_NAME);

  // 6. Se restaura el nombre compartido con las suites de `frontend` antes de cerrar.
  await page.getByTestId('shop-account-name-input').fill(FAKE_DISPLAY_NAME);
  await page.getByTestId('shop-account-name-save').click();
  await expect(page.getByTestId('shop-account-name')).toHaveText(FAKE_DISPLAY_NAME);

  // 7. `Cerrar sesión` es local: la credencial deja el navegador y la cuenta vuelve a ofrecer entrar.
  await page.getByTestId('shop-account-signout').click();
  await expect(page.getByTestId('shop-account-signin')).toBeVisible();
  const cleared = await page.evaluate((key) => localStorage.getItem(key), SHOP_SESSION_KEY);
  expect(cleared).toBeNull();
});

test('a visitor can sign in from the public event link and comes back to it', async ({
  request,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'shop', 'the shop account suite runs once against shop');

  const eventResponse = await request.post(`${BACKEND_URL}/admin/events`, {
    headers: adminHeaders,
    data: { originCity: 'Quito', destinationCity: 'Cuenca' },
  });
  expect(eventResponse.status()).toBe(201);
  const { event } = (await eventResponse.json()) as CreatedEvent;

  // El enlace público se lee sin sesión y ofrece el acceso opcional en la barra de la shell.
  await page.goto(`/evento/${event.publicSlug}`);
  await expect(page.getByTestId('shop-account-bar-signin')).toBeVisible();

  // Entrar desde el enlace vuelve a la misma página, no a `/cuenta`.
  await page.getByTestId('shop-account-bar-signin').click();
  await expect(page).toHaveURL(new RegExp(`/evento/${event.publicSlug}$`));
  await expect(page.getByTestId('shop-account-bar-name')).toHaveText(FAKE_DISPLAY_NAME);

  // La salida es local y el enlace sigue siendo anónimo.
  await page.getByTestId('shop-account-bar-signout').click();
  await expect(page.getByTestId('shop-account-bar-signin')).toBeVisible();
  await expect(page.getByTestId('shop-account-bar-name')).toHaveCount(0);
});
