import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type {
  CreatedEvent,
  CreatedInvitation,
  CreatedItem,
  IssuedSession,
  PublishedListing,
} from '@mudanzapp/shared';

import { attachCapture } from './support/attach-capture.js';
import { chooseEventIfAsked } from './support/choose-event.js';
import { ADMIN_TOKEN, BACKEND_URL, FRONTENDS, frontendUrl } from './support/harness.js';

/**
 * Evidencia del ciclo 4e (`cart-request`, `plan-ciclo-4e` §7).
 *
 * El recorrido de la hipótesis: el vendedor fija el WhatsApp del evento en su dashboard, el comprador
 * guarda un artículo desde la ficha pública, entra en la tienda, lo pide y recibe el enlace de
 * WhatsApp; el vendedor ve la solicitud con el nombre de la cuenta y la descarta.
 *
 * **Límite declarado.** El verificador `fake` fija un sujeto, así que el comprador y el vendedor son
 * **la misma cuenta**: se demuestra el recorrido y el aviso, no dos personas distintas. El enlace
 * `wa.me` se comprueba por su `href`, sin abrir WhatsApp. Guardar sin sesión y la unión con el carrito
 * del servidor se prueban en `shop/src/app/cart/shop-cart.store.spec.ts`.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

const FRONTEND = FRONTENDS.find((frontend) => frontend.name === 'frontend');
const SHOP = FRONTENDS.find((frontend) => frontend.name === 'shop');
const FRONTEND_URL = FRONTEND === undefined ? '' : frontendUrl(FRONTEND);
const SHOP_URL = SHOP === undefined ? '' : frontendUrl(SHOP);

const PHONE = '525512345678';
const FAKE_DISPLAY_NAME = 'Invitado';
const SESSION_KEY = 'mudanzapp.session';

/** JPEG 1×1 válido: la salida del codificador del dispositivo. */
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

/** Un evento con una sesión de co-dispositivo y un artículo publicado y con precio. */
async function eventWithPublishedArticle(
  request: APIRequestContext,
): Promise<{ event: CreatedEvent['event']; sessionToken: string; slug: string; itemId: string }> {
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
    data: { inviteToken: invitation.token, deviceLabel: 'Teléfono del vendedor' },
  });
  expect(redeemed.status()).toBe(201);
  const session = (await redeemed.json()) as IssuedSession;
  const sessionToken = session.sessionToken;

  const itemResponse = await request.post(`${BACKEND_URL}/events/${event.id}/items`, {
    headers: bearer(sessionToken),
    data: { title: 'Silla de la sala', note: 'Se va por la mudanza' },
  });
  expect(itemResponse.status()).toBe(201);
  const { item } = (await itemResponse.json()) as CreatedItem;

  // La foto viaja directo al almacén con el ticket; el API sólo recibe la adjunción.
  await attachCapture(request, {
    eventId: event.id,
    itemId: item.id,
    token: sessionToken,
    body: JPEG,
    variants: VARIANTS.map((variant) => ({
      variant: variant.variant,
      widthPx: variant.w,
      heightPx: variant.h,
    })),
  });

  const priced = await request.patch(`${BACKEND_URL}/events/${event.id}/items/${item.id}`, {
    headers: bearer(sessionToken),
    data: { priceCents: 125_000 },
  });
  expect(priced.status()).toBe(200);

  const published = await request.post(
    `${BACKEND_URL}/events/${event.id}/items/${item.id}/listing`,
    { headers: bearer(sessionToken) },
  );
  expect(published.status()).toBe(201);

  return {
    event,
    sessionToken,
    slug: ((await published.json()) as PublishedListing).slug,
    itemId: item.id,
  };
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

/**
 * Abre la administración del evento. Desde D2 una cuenta con varias membresías elige antes de
 * entrar; la elección vive en memoria, así que se llega al panel con la barra y no con un `goto`.
 */
async function openEventDashboard(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/dashboard`);
  await expect(page).toHaveURL(/\/(cuenta\/evento|eventos)$/);

  if (await chooseEventIfAsked(page)) {
    await page.getByTestId('shell-nav-account').click();
    await page.getByTestId('cuenta-dashboard-link').click();
  }

  await expect(page.getByTestId('dashboard-panel')).toBeVisible();
}

/** Igual que el panel: `Capturados` es un destino privado y desde D2 puede exigir elegir antes. */
async function openCaptured(page: Page): Promise<void> {
  await page.goto(`${FRONTEND_URL}/capturados`);
  await expect(page).toHaveURL(/\/(capturados|eventos)$/);

  if (await chooseEventIfAsked(page)) {
    await page.getByTestId('shell-nav-captured').click();
  }

  await expect(page).toHaveURL(/\/capturados$/);
}

test('the seller sets its WhatsApp and the buyer asks the cart from the shop', async ({
  request,
  page,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'frontend',
    'the cart request walks both the private surface and the shop',
  );

  const { event, sessionToken, slug, itemId } = await eventWithPublishedArticle(request);

  // 1. La cuenta que se autentica desde el evento lo reclama: el dashboard es suyo (decisión §37).
  const claimed = await request.post(`${BACKEND_URL}/auth/claim`, {
    headers: bearer(sessionToken),
    data: { oauthToken: 'e2e-admin-token', deviceLabel: 'Teléfono del vendedor' },
  });
  expect(claimed.status()).toBe(201);
  const account = (await claimed.json()) as IssuedSession;

  await seedSession(page, account.sessionToken);
  await openEventDashboard(page);

  // 2. El número es del evento y lo fija quien lo administra, aquí y no en la Cuenta del marco.
  await expect(page.getByTestId('dashboard-contact-empty')).toBeVisible();
  await page.getByTestId('dashboard-contact-input').fill('+52 55 1234 5678');
  await page.getByTestId('dashboard-contact-save').click();
  await expect(page.getByTestId('dashboard-contact-saved')).toContainText(`+${PHONE}`);

  // 3. El comprador entra por el enlace público, guarda —sin cuenta— y la tienda le pide entrar.
  const shopContext = await browser.newContext();
  const shopPage = await shopContext.newPage();

  try {
    await shopPage.goto(`${SHOP_URL}/${slug}`);
    await shopPage.getByTestId('listing-save').click();
    await expect(shopPage.getByTestId('listing-save')).toHaveText('Quitar de seleccionados');

    await shopPage.getByTestId('listing-cart-link').click();
    await expect(shopPage).toHaveURL(new RegExp(`/carrito/${event.publicSlug}$`));
    await expect(shopPage.getByTestId('cart-anonymous')).toBeVisible();

    // 4. Con la cuenta de tienda, la selección se une al carrito del servidor y se puede pedir.
    await shopPage.getByTestId('cart-signin').click();
    await expect(shopPage).toHaveURL(new RegExp(`/carrito/${event.publicSlug}$`));
    await expect(shopPage.getByTestId(`cart-item-${slug}`)).toBeVisible();

    const ask = shopPage.getByTestId('cart-whatsapp-request');
    await expect(ask).toBeEnabled();
    await ask.click();

    await expect(shopPage.getByTestId('cart-requested')).toBeVisible();
    await expect(shopPage.getByTestId('cart-whatsapp')).toHaveAttribute(
      'href',
      new RegExp(`^https://wa\\.me/${PHONE}\\?text=`),
    );
    // 4b. El vendedor despublica desde `Capturados`: la ficha sale del catálogo y el carrito del
    // comprador la retira con un aviso que la nombra (F3).
    await openCaptured(page);
    const row = page.getByTestId(`item-${itemId}`);
    await row.getByTestId('item-unpublish').click();
    await expect(row.getByTestId('item-status')).toHaveText('despublicado');

    await shopPage.reload();
    await expect(shopPage.getByTestId('cart-unpublished')).toContainText('Silla de la sala');
    await expect(shopPage.getByTestId(`cart-item-${slug}`)).toHaveCount(0);
  } finally {
    await shopContext.close();
  }

  // 5. El vendedor vuelve al panel, ve el renglón con el nombre de la cuenta y lo descarta; el estado
  // queda escrito. La navegación es explícita: el paso 4b lo dejó en `Capturados`.
  await openEventDashboard(page);
  await expect(page.getByTestId('dashboard-requests')).toContainText(FAKE_DISPLAY_NAME);
  await expect(page.getByTestId('dashboard-request-state')).toHaveText('pendiente');

  await page.getByTestId('dashboard-request-dismiss').click();
  await page.getByTestId('dashboard-request-dismiss-confirm').click();
  await expect(page.getByTestId('dashboard-request-state')).toHaveText('atendida');
});
