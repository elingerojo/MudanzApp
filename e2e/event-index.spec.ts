import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  LISTING_SLUG_PATTERN,
  type CreatedEvent,
  type CreatedInvitation,
  type CreatedItem,
  type IssuedSession,
  type PublicEventIndex,
  type PublishedListing,
} from '@mudanzapp/shared';

import { ADMIN_TOKEN, BACKEND_URL, FRONTENDS, frontendUrl } from './support/harness.js';

/**
 * Evidencia del ciclo 4a (`event-index`, `plan-ciclo-4a` §7).
 *
 * Es autocontenida: crea su evento, invitación y artículos por API con el `ADMIN_TOKEN` del arnés, y
 * después abre la página pública en un contexto sin `localStorage`. Corre **una vez**, en el
 * `project` de `shop`.
 *
 * **Límite declarado del arnés.** El arnés levanta cada frontend con `ng serve`, no con
 * `wrangler dev`, así que el `main` del Worker no corre en el e2e. Por eso:
 * - el estado de la copia (`X-Snapshot: miss | hit | stale | shell`) se demuestra en la prueba
 *   unitaria del Worker ([`shop/src/worker.spec.ts`](../shop/src/worker.spec.ts:1)), que ejerce el
 *   handler con una caché y un `ASSETS` deterministas;
 * - aquí se demuestra el contrato que el Worker consume —el HTML del snapshot, su `ETag` de versión
 *   y el `204` del evento vacío— y el comportamiento que la SPA tiene al recibirlo, inyectando el
 *   fragmento en la shell real del dev server;
 * - la paridad al píxel entre el HTML servido y el arranque de Angular no se mide aquí: en `ng serve`
 *   los estilos globales los inyecta el JavaScript, así que una medición con scripts bloqueados no
 *   tendría el mismo CSS. La paridad de estructura y descriptores se cubre en
 *   [`card-parity.spec.ts`](../shop/src/app/event-index/card-parity.spec.ts:1).
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

const SHOP = FRONTENDS.find((frontend) => frontend.name === 'shop');
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
  origin: string,
  destination: string,
): Promise<{ event: CreatedEvent['event']; session: IssuedSession }> {
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

  return { event, session };
}

/** Documenta un artículo con sus tres tamaños y lo publica; devuelve su `slug`. */
async function publishArticle(
  request: APIRequestContext,
  eventId: string,
  sessionToken: string,
  title: string,
): Promise<string> {
  const itemResponse = await request.post(`${BACKEND_URL}/events/${eventId}/items`, {
    headers: bearer(sessionToken),
    data: { title, note: 'Nota de la ficha' },
  });
  expect(itemResponse.status()).toBe(201);
  const { item } = (await itemResponse.json()) as CreatedItem;

  for (const variant of VARIANTS) {
    const upload = await request.put(
      `${BACKEND_URL}/events/${eventId}/items/${item.id}/photo` +
        `?variant=${variant.variant}&w=${variant.w}&h=${variant.h}`,
      {
        headers: { ...bearer(sessionToken), 'Content-Type': 'image/jpeg' },
        data: JPEG,
      },
    );
    expect(upload.status()).toBe(200);
  }

  const published = await request.post(
    `${BACKEND_URL}/events/${eventId}/items/${item.id}/listing`,
    { headers: bearer(sessionToken) },
  );
  expect(published.status()).toBe(201);

  return ((await published.json()) as PublishedListing).slug;
}

async function readIndex(
  request: APIRequestContext,
  publicSlug: string,
): Promise<PublicEventIndex> {
  const response = await request.get(`${BACKEND_URL}/public/events/${publicSlug}`);
  expect(response.status()).toBe(200);

  return (await response.json()) as PublicEventIndex;
}

test('the event link opens its index from the first publication', async ({
  request,
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'shop', 'public event index suite runs once against shop');

  const own = await eventWithSession(request, 'Bogotá', 'Ciudad de México');
  const publicSlug = own.event.publicSlug;

  // 1. El enlace existe desde que el evento se crea y su índice es un enlace válido y vacío.
  expect(new RegExp(LISTING_SLUG_PATTERN).test(publicSlug)).toBe(true);

  const empty = await readIndex(request, publicSlug);
  expect(empty.event).toEqual({
    publicSlug,
    originCity: 'Bogotá',
    destinationCity: 'Ciudad de México',
    currency: 'MXN',
  });
  expect(empty.listings).toEqual([]);

  const raw = JSON.stringify(empty);
  expect(raw).not.toContain('eventId');
  expect(raw).not.toContain('itemId');
  expect(raw).not.toContain('object_key');

  const emptyPage = await request.get(`${BACKEND_URL}/public/events/${publicSlug}/page`);
  expect(emptyPage.status()).toBe(204);

  await page.goto(`/evento/${publicSlug}`);
  await expect(page.getByTestId('event-index-empty')).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);

  // 2. Con un artículo publicado, el HTML del índice ya trae su tarjeta y su clave de versión.
  const firstSlug = await publishArticle(
    request,
    own.event.id,
    own.session.sessionToken,
    'Silla de madera',
  );
  const firstIndex = await readIndex(request, publicSlug);
  expect(firstIndex.listings).toHaveLength(1);
  expect(firstIndex.listings[0]?.slug).toBe(firstSlug);

  const snapshotResponse = await request.get(`${BACKEND_URL}/public/events/${publicSlug}/page`);
  expect(snapshotResponse.status()).toBe(200);
  expect(snapshotResponse.headers()['cache-control']).toContain('stale-while-revalidate=600');

  const etag = snapshotResponse.headers()['etag'];
  expect(etag).toBe(`"${firstIndex.version}"`);

  const snapshotHtml = await snapshotResponse.text();
  expect(snapshotHtml.match(/data-testid="event-index-card"/g)).toHaveLength(1);
  expect(snapshotHtml).toContain('Silla de madera');
  expect(snapshotHtml).toContain(`<meta name="event-version" content="${firstIndex.version}">`);

  // La misma versión devuelve la misma clave: lo que la caché del Worker usa para no regenerar.
  const again = await request.get(`${BACKEND_URL}/public/events/${publicSlug}/page`);
  expect(again.headers()['etag']).toBe(etag);

  // 3. Un segundo artículo cambia la versión y el snapshot regenerado trae las dos en orden.
  const secondSlug = await publishArticle(
    request,
    own.event.id,
    own.session.sessionToken,
    'Mesa de roble',
  );
  const secondIndex = await readIndex(request, publicSlug);
  expect(secondIndex.version).not.toBe(firstIndex.version);
  expect(secondIndex.listings.map((listing) => listing.slug)).toEqual([secondSlug, firstSlug]);

  const regenerated = await (
    await request.get(`${BACKEND_URL}/public/events/${publicSlug}/page`)
  ).text();
  expect(regenerated.match(/data-testid="event-index-card"/g)).toHaveLength(2);
  expect(regenerated.indexOf('Mesa de roble')).toBeLessThan(regenerated.indexOf('Silla de madera'));

  // 4. La tarjeta abre la ficha y la ficha enlaza de vuelta al índice.
  //
  // Contexto nuevo: la lectura pública se cachea 60 s —es el único reloj que acota lo que ve un
  // visitante cuando cambia la disponibilidad, `plan-ciclo-4a` §5—, así que reutilizar la página
  // anterior mediría la copia vieja, no una publicación nueva.
  const fresh = await browser.newContext();
  try {
    const freshPage = await fresh.newPage();

    await freshPage.goto(`/evento/${publicSlug}`);
    await expect(freshPage.getByTestId('event-index-card')).toHaveCount(2);

    await freshPage.getByTestId('event-index-card-link').first().click();
    await expect(freshPage.getByTestId('listing-title')).toHaveText('Mesa de roble');

    const back = freshPage.getByTestId('listing-event-link');
    await expect(back).toHaveAttribute('href', `/evento/${publicSlug}`);

    await back.click();
    await expect(freshPage.getByTestId('event-index-cities')).toContainText('Bogotá');

    // 5. El snapshot servido arranca sin duplicar la lista: el componente lo retira y pinta el suyo.
    const shell = await (await request.get(`${SHOP_URL}/`)).text();
    const documentWithSnapshot = shell.replace(
      '</body>',
      `${snapshotHtml.replace(firstIndex.version, secondIndex.version)}\n</body>`,
    );

    await freshPage.route(`**/evento/${publicSlug}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: documentWithSnapshot,
      }),
    );

    await freshPage.goto(`/evento/${publicSlug}`);
    await expect(freshPage.getByTestId('event-index-cities')).toContainText('Bogotá');
    await expect(freshPage.getByTestId('event-index-card')).toHaveCount(2);
    await expect(freshPage.locator('#evento-snapshot')).toHaveCount(0);
  } finally {
    await fresh.close();
  }
});
