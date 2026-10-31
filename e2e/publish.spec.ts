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

import { ADMIN_TOKEN, BACKEND_URL } from './support/harness.js';

/**
 * Evidencia del ciclo 3c (`publish`, `resumen-funcional` §3 y §4): un artículo capturado recibe una
 * URL pública legible, cualquiera la abre sin sesión y la ficha muestra la foto.
 *
 * Es autocontenida: crea su propio evento, invitación, artículo y foto por API con el `ADMIN_TOKEN`
 * del arnés y después abre la página pública en un contexto de navegador sin `localStorage`. Corre
 * **una vez**, en el `project` de `shop`, porque es la shell que sirve la ficha.
 *
 * **Límite declarado:** con `R2_MODE=fake` la URL pública es determinista pero no descargable, así que
 * el gate demuestra contrato, composición de la URL y render, no el píxel. Que la foto se vea «por
 * cualquiera» es un hecho `live` y se verifica en el cierre remoto (`plan-ciclo-3c` §7).
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** PNG 1×1 válido: basta para que el navegador lo pinte y para declarar un `Content-Type` real. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
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

  // 1. El artículo existe y su foto entra por el cuerpo binario crudo.
  const item = await createItem(request, own.event.id, own.session.sessionToken, 'Silla de madera');

  const upload = await request.put(`${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photo`, {
    headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'image/png' },
    data: PNG,
  });
  expect(upload.status()).toBe(200);

  // 2. Publicar devuelve un `slug` que cumple el contrato y su camino relativo.
  const publishResponse = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/listing`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(publishResponse.status()).toBe(201);
  const listing = (await publishResponse.json()) as PublishedListing;
  expect(new RegExp(LISTING_SLUG_PATTERN).test(listing.slug)).toBe(true);
  expect(listing.path).toBe(`/${listing.slug}`);

  // 3. La ficha pública se lee **sin** credencial y no expone identificadores internos.
  const publicResponse = await request.get(`${BACKEND_URL}/public/listings/${listing.slug}`);
  expect(publicResponse.status()).toBe(200);
  expect(publicResponse.headers()['cache-control']).toContain('public');

  const body = (await publicResponse.json()) as PublicListing;
  expect(body.slug).toBe(listing.slug);
  expect(body.title).toBe('Silla de madera');
  expect(body.widthCm).toBe(45);
  expect(body.event).toEqual({ originCity: 'Bogotá', destinationCity: 'Ciudad de México' });
  expect(body.photo?.url.startsWith('http')).toBe(true);

  const raw = JSON.stringify(body);
  expect(raw).not.toContain('eventId');
  expect(raw).not.toContain('itemId');
  expect(raw).not.toContain('object_key');

  // 4. Un contexto de navegador sin `localStorage` abre el enlace y ve la ficha y la foto.
  await page.goto(`/${listing.slug}`);
  await expect(page.getByTestId('listing-title')).toHaveText('Silla de madera');
  await expect(page.getByTestId('listing-measures')).toContainText('45');
  expect(await page.getByTestId('listing-photo').getAttribute('src')).toBe(body.photo?.url);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);

  // 5. Un `slug` inexistente muestra el estado de enlace no disponible.
  await page.goto('/este-enlace-no-existe-000000');
  await expect(page.getByTestId('listing-not-found')).toBeVisible();
  await expect(page.getByTestId('listing')).toHaveCount(0);

  // 6. Publicar un artículo sin foto se rechaza con su código; republicar devuelve el mismo `slug`.
  const bare = await createItem(request, own.event.id, own.session.sessionToken, 'Caja sin foto');

  const withoutPhoto = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${bare.id}/listing`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(withoutPhoto.status()).toBe(409);
  await expect(withoutPhoto.json()).resolves.toEqual({ error: 'listing_photo_required' });

  const republished = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/listing`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(republished.status()).toBe(200);
  const sameListing = (await republished.json()) as PublishedListing;
  expect(sameListing.slug).toBe(listing.slug);

  // 7. Una sesión de otro evento no publica en este: no se distingue ajeno de inexistente.
  const foreignAttempt = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/listing`,
    { headers: bearer(foreign.session.sessionToken) },
  );
  expect(foreignAttempt.status()).toBe(404);
  await expect(foreignAttempt.json()).resolves.toEqual({ error: 'not_found' });
});
