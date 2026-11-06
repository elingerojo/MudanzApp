import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  LISTING_SLUG_PATTERN,
  type CreatedEvent,
  type CreatedInvitation,
  type CreatedItem,
  type IssuedSession,
  type PublicListing,
  type PublishedListing,
} from '@mudanzapp/shared';

import {
  CAPTURE_VARIANTS,
  attachCapture,
  openCapture,
  uploadCaptureVariant,
} from './support/attach-capture.js';
import { ADMIN_TOKEN, BACKEND_URL } from './support/harness.js';

/**
 * Evidencia del ciclo 3c (`publish`, `resumen-funcional` §3 y §4) con la foto en tres tamaños del
 * ciclo 3c-optimizar: un artículo capturado recibe una URL pública legible, cualquiera la abre sin
 * sesión y la ficha muestra los tamaños de la foto.
 *
 * Es autocontenida: crea su propio evento, invitación, artículo y variantes por API con el
 * `ADMIN_TOKEN` del arnés y después abre la página pública en un contexto de navegador sin
 * `localStorage`. Corre **una vez**, en el `project` de `shop`, porque es la shell que sirve la ficha.
 *
 * **Límite declarado:** con `R2_MODE=fake` la URL pública es determinista pero no descargable, así que
 * el gate demuestra contrato, composición de la URL y render, no el píxel. Que la foto se vea «por
 * cualquiera» es un hecho `live` y se verifica en el cierre remoto (`plan-ciclo-3c` §7).
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** JPEG 1×1 válido: la salida que produce el codificador del dispositivo. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Prepara un evento real con una invitación canjeada. Devuelve la sesión de evento, que es la que
 * publica y la que no debe alcanzar un evento ajeno.
 */
async function eventWithSession(
  request: APIRequestContext,
  origin: string,
  destination: string,
): Promise<{
  event: CreatedEvent['event'];
  invitation: CreatedInvitation;
  session: IssuedSession;
}> {
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

  return { event, invitation, session };
}

/** Artículo mínimo del evento, con la sesión que lo documenta. */
async function createItem(
  request: APIRequestContext,
  eventId: string,
  sessionToken: string,
  title: string,
): Promise<CreatedItem['item']> {
  const response = await request.post(`${BACKEND_URL}/events/${eventId}/items`, {
    headers: bearer(sessionToken),
    data: {
      title,
      note: 'Nota de la ficha',
      widthCm: 45,
      heightCm: 90,
      depthCm: 45,
      weightKg: 6.5,
    },
  });
  expect(response.status()).toBe(201);

  const { item } = (await response.json()) as CreatedItem;
  return item;
}

test('the first published article opens without a session', async ({ request, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'shop', 'public publish suite runs once against shop');

  const own = await eventWithSession(request, 'Bogotá', 'Ciudad de México');
  const foreign = await eventWithSession(request, 'Lima', 'Santiago');

  // 1. El artículo existe y sus tres tamaños entran por el cuerpo binario crudo.
  const item = await createItem(request, own.event.id, own.session.sessionToken, 'Silla de madera');

  // El ticket firma las tres escrituras; el cuerpo de la foto no atraviesa el API.
  await attachCapture(request, {
    eventId: own.event.id,
    itemId: item.id,
    token: own.session.sessionToken,
    body: JPEG,
  });

  // 2. Publicar devuelve un `slug` que cumple el contrato y su camino relativo.
  const publishResponse = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/listing`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(publishResponse.status()).toBe(201);
  const listing = (await publishResponse.json()) as PublishedListing;
  expect(new RegExp(LISTING_SLUG_PATTERN).test(listing.slug)).toBe(true);
  expect(listing.path).toBe(`/${listing.slug}`);

  // 3. La ficha pública se lee **sin** credencial, con los tres tamaños y sin identificadores internos.
  const publicResponse = await request.get(`${BACKEND_URL}/public/listings/${listing.slug}`);
  expect(publicResponse.status()).toBe(200);
  expect(publicResponse.headers()['cache-control']).toContain('public');

  const body = (await publicResponse.json()) as PublicListing;
  expect(body.slug).toBe(listing.slug);
  expect(body.title).toBe('Silla de madera');
  expect(body.widthCm).toBe(45);
  // Desde el ciclo 4a la ficha compone el `publicSlug` del evento para enlazar de vuelta al índice;
  // desde 4b publica además la moneda del evento y el precio.
  expect(body.event).toEqual({
    originCity: 'Bogotá',
    destinationCity: 'Ciudad de México',
    publicSlug: own.event.publicSlug,
    currency: 'MXN',
  });
  expect(body.priceCents).toBeNull();
  expect(body.soldAt).toBeNull();

  expect(body.photo?.sizes.medium?.widthPx).toBe(768);
  expect(body.photo?.sizes.medium?.heightPx).toBe(576);
  expect(body.photo?.sizes.thumb?.widthPx).toBe(320);
  expect(body.photo?.sizes.large?.widthPx).toBe(1_440);
  for (const size of [body.photo?.sizes.thumb, body.photo?.sizes.medium, body.photo?.sizes.large]) {
    expect(size?.url.startsWith('http')).toBe(true);
  }

  const raw = JSON.stringify(body);
  expect(raw).not.toContain('eventId');
  expect(raw).not.toContain('itemId');
  expect(raw).not.toContain('object_key');
  // Ningún contrato lleva peso: no se persiste, así que no hay nada que publicar.
  expect(raw).not.toContain('byteSize');
  expect(raw).not.toContain('byte_size');

  // 4. Un contexto de navegador sin `localStorage` abre el enlace, ve la ficha y los dos tamaños.
  await page.goto(`/${listing.slug}`);
  await expect(page.getByTestId('listing-title')).toHaveText('Silla de madera');
  await expect(page.getByTestId('listing-measures')).toContainText('45');
  expect(await page.getByTestId('listing-photo').getAttribute('src')).toBe(
    body.photo?.sizes.medium?.url,
  );
  expect(await page.getByTestId('listing-photo-thumb').getAttribute('src')).toBe(
    body.photo?.sizes.thumb?.url,
  );
  expect(await page.evaluate(() => localStorage.length)).toBe(0);

  // 5. Un `slug` inexistente muestra el estado de enlace no disponible.
  await page.goto('/este-enlace-no-existe-000000');
  await expect(page.getByTestId('listing-not-found')).toBeVisible();
  await expect(page.getByTestId('listing')).toHaveCount(0);

  // 6. Publicar exige las **tres** variantes: sin foto y con una sola responden el mismo 409.
  const bare = await createItem(request, own.event.id, own.session.sessionToken, 'Caja sin foto');

  const withoutPhoto = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${bare.id}/listing`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(withoutPhoto.status()).toBe(409);
  await expect(withoutPhoto.json()).resolves.toEqual({ error: 'listing_photo_required' });

  const partial = await createItem(
    request,
    own.event.id,
    own.session.sessionToken,
    'Caja a medias',
  );

  // Una captura a la que le falta una variante no se adjunta: el borde la rechaza y el artículo
  // sigue sin foto, así que tampoco se puede publicar.
  const partialTicket = await openCapture(request, own.event.id, own.session.sessionToken);
  const [largeOnly, mediumOnly] = CAPTURE_VARIANTS;
  if (largeOnly === undefined || mediumOnly === undefined) {
    throw new Error('capture-variants-missing');
  }

  expect(await uploadCaptureVariant(request, partialTicket, largeOnly.variant, JPEG)).toBe(204);
  expect(await uploadCaptureVariant(request, partialTicket, mediumOnly.variant, JPEG)).toBe(204);

  const incomplete = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${partial.id}/photos`,
    {
      headers: bearer(own.session.sessionToken),
      data: {
        captures: [{ captureId: partialTicket.captureId, slot: 0, variants: CAPTURE_VARIANTS }],
      },
    },
  );
  expect(incomplete.status()).toBe(409);
  await expect(incomplete.json()).resolves.toEqual({ error: 'capture_incomplete' });

  const withOneVariant = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${partial.id}/listing`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(withOneVariant.status()).toBe(409);
  await expect(withOneVariant.json()).resolves.toEqual({ error: 'listing_photo_required' });

  // Republicar devuelve el mismo `slug`, aunque el estado publicado ya exista.
  const republished = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/listing`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(republished.status()).toBe(200);
  const sameListing = (await republished.json()) as PublishedListing;
  expect(sameListing.slug).toBe(listing.slug);

  // 6b. Despublicar retira la URL con `410` y el índice deja de enumerarla; republicar la devuelve
  // con el mismo `slug`, que es el hecho publicado.
  const unpublished = await request.delete(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/listing`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(unpublished.status()).toBe(204);

  const gone = await request.get(`${BACKEND_URL}/public/listings/${listing.slug}`);
  expect(gone.status()).toBe(410);
  expect(gone.headers()['x-robots-tag']).toBe('noindex');
  await expect(gone.json()).resolves.toEqual({ error: 'listing_unpublished' });

  const index = await request.get(`${BACKEND_URL}/public/events/${own.event.publicSlug}`);
  expect(index.status()).toBe(200);
  const indexBody = (await index.json()) as { readonly listings: readonly { slug: string }[] };
  expect(indexBody.listings.some((entry) => entry.slug === listing.slug)).toBe(false);

  const restored = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/listing`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(restored.status()).toBe(200);
  expect(((await restored.json()) as PublishedListing).slug).toBe(listing.slug);

  const visibleAgain = await request.get(`${BACKEND_URL}/public/listings/${listing.slug}`);
  expect(visibleAgain.status()).toBe(200);

  // 7. Una sesión de otro evento no publica en este: no se distingue ajeno de inexistente.
  const foreignAttempt = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/listing`,
    { headers: bearer(foreign.session.sessionToken) },
  );
  expect(foreignAttempt.status()).toBe(404);
  await expect(foreignAttempt.json()).resolves.toEqual({ error: 'not_found' });
});
