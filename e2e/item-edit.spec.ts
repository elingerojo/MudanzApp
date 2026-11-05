import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  type CreatedEvent,
  type CreatedInvitation,
  type CreatedItem,
  type IssuedSession,
  type PublicEventIndex,
  type PublicListing,
  type PublishedListing,
} from '@mudanzapp/shared';

import { attachCapture } from './support/attach-capture.js';
import { ADMIN_TOKEN, BACKEND_URL, FRONTENDS, frontendUrl } from './support/harness.js';

/**
 * Evidencia del ciclo 4b (`item-edit`, `plan-ciclo-4b` §7).
 *
 * El recorrido es el de la hipótesis: un co-dispositivo corrige la ficha y fija el precio desde
 * `Capturados`, el catálogo lo refleja, y el vendedor declara `Vendido`; la ficha pública conserva su
 * URL y deja de ofrecerse en el índice. El caso corre una vez, en el `project` de `frontend`, y abre
 * `shop` en un contexto aparte para leer la ficha pública.
 *
 * **Límite declarado del arnés.** Corre `ng serve`, no `wrangler dev`: la cabecera `noindex` del
 * Worker y el `410` de la cortesía se demuestran en la prueba unitaria del Worker y en la de frontera;
 * aquí se demuestra el contrato que consumen y el recorrido de la interfaz.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

const FRONTEND = FRONTENDS.find((frontend) => frontend.name === 'frontend');
const SHOP = FRONTENDS.find((frontend) => frontend.name === 'shop');
const FRONTEND_URL = FRONTEND === undefined ? '' : frontendUrl(FRONTEND);
const SHOP_URL = SHOP === undefined ? '' : frontendUrl(SHOP);

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
  const session = (await redeemed.json()) as IssuedSession;

  return { event, session };
}

async function publishArticle(
  request: APIRequestContext,
  eventId: string,
  sessionToken: string,
  title: string,
): Promise<{ readonly itemId: string; readonly slug: string }> {
  const itemResponse = await request.post(`${BACKEND_URL}/events/${eventId}/items`, {
    headers: bearer(sessionToken),
    data: { title, note: 'Nota de la ficha' },
  });
  expect(itemResponse.status()).toBe(201);
  const { item } = (await itemResponse.json()) as CreatedItem;

  // El ticket firma las tres escrituras y el cuerpo de la foto no atraviesa el API.
  await attachCapture(request, {
    eventId,
    itemId: item.id,
    token: sessionToken,
    body: JPEG,
    variants: VARIANTS.map((variant) => ({
      variant: variant.variant,
      widthPx: variant.w,
      heightPx: variant.h,
    })),
  });

  const published = await request.post(
    `${BACKEND_URL}/events/${eventId}/items/${item.id}/listing`,
    { headers: bearer(sessionToken) },
  );
  expect(published.status()).toBe(201);

  return { itemId: item.id, slug: ((await published.json()) as PublishedListing).slug };
}

async function readListing(request: APIRequestContext, slug: string): Promise<PublicListing> {
  const response = await request.get(`${BACKEND_URL}/public/listings/${slug}`);
  expect(response.status()).toBe(200);

  return (await response.json()) as PublicListing;
}

test('a co-device corrects the sheet, sets the price and declares the sale', async ({
  request,
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'item edit walks the private surface');

  const own = await eventWithSession(request);
  const article = await publishArticle(
    request,
    own.event.id,
    own.session.sessionToken,
    'Silla de madera',
  );

  // El dispositivo entra con la sesión sembrada, como después de canjear el enlace.
  await page.addInitScript(
    (token) => localStorage.setItem('mudanzapp.session', token),
    own.session.sessionToken,
  );
  await page.goto(`${FRONTEND_URL}/eventos/${own.event.id}/capturados`);
  await expect(page.getByTestId('item-title')).toHaveText('Silla de madera');

  // 1. La ficha se corrige y el precio entra desde `Capturados`.
  await page.getByTestId('item-edit-link').click();
  await expect(page.getByTestId('item-edit-form')).toBeVisible();
  await page.getByTestId('item-edit-title').fill('Silla de madera pulida');
  await page.getByTestId('item-edit-price').fill('1250.50');
  await page.getByTestId('item-edit-save').click();

  await expect(page).toHaveURL(new RegExp(`/eventos/${own.event.id}/capturados$`));
  await expect(page.getByTestId('item-title')).toHaveText('Silla de madera pulida');
  await expect(page.getByTestId('item-price')).toHaveText('$1,250.50 MXN');

  // 2. El catálogo lo refleja: la ficha pública lee el texto y el precio nuevos.
  const edited = await readListing(request, article.slug);
  expect(edited.title).toBe('Silla de madera pulida');
  expect(edited.priceCents).toBe(125_050);

  const shopContext = await browser.newContext();
  try {
    const shopPage = await shopContext.newPage();
    await shopPage.goto(`${SHOP_URL}/${article.slug}`);
    await expect(shopPage.getByTestId('listing-title')).toHaveText('Silla de madera pulida');
    await expect(shopPage.getByTestId('listing-price')).toHaveText('$1,250.50 MXN');
  } finally {
    await shopContext.close();
  }

  // 3. El vendedor declara la venta; la confirmación es un segundo toque.
  await page.getByTestId('item-sold').click();
  await expect(page.getByTestId('item-sold')).toContainText('Confirmar venta');
  await page.getByTestId('item-sold').click();
  await expect(page.getByTestId('item-status')).toHaveText('vendido');

  const sold = await readListing(request, article.slug);
  expect(sold.soldAt).not.toBeNull();

  // 4. El índice deja de ofrecerlo y la ficha sigue existiendo con `Vendido`.
  const index = await request.get(`${BACKEND_URL}/public/events/${own.event.publicSlug}`);
  expect(index.status()).toBe(200);
  const body = (await index.json()) as PublicEventIndex;
  expect(body.listings.map((listing) => listing.slug)).not.toContain(article.slug);

  const soldContext = await browser.newContext();
  try {
    const soldPage = await soldContext.newPage();
    await soldPage.goto(`${SHOP_URL}/${article.slug}`);
    await expect(soldPage.getByTestId('listing-sold')).toHaveText('Vendido');
  } finally {
    await soldContext.close();
  }
});
