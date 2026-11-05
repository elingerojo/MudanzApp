import { expect, test, type APIRequestContext } from '@playwright/test';
import type {
  AttachedPhotos,
  CaptureTicket,
  CreatedEvent,
  CreatedInvitation,
  CreatedItem,
  IssuedSession,
  ItemList,
} from '@mudanzapp/shared';
import pg from 'pg';

import { ADMIN_TOKEN, BACKEND_URL, testDatabaseUrl } from './support/harness.js';

const { Client } = pg;

/**
 * Evidencia de `capture` (ciclo 3a) y de la subida directa del ciclo 4g (`direct-upload`).
 *
 * La hipótesis de 4g es una negativa y una positiva: el cuerpo de la foto **no** atraviesa el API —el
 * navegador escribe las tres variantes con la URL prefirmada del ticket— y el artículo queda con su
 * foto completa después de adjuntarla. La lectura por variante sigue exigiendo sesión del evento.
 *
 * Dos suites en un archivo: la de API, que corre una vez, y la de interfaz, que abre la superficie
 * privada en un navegador real. Los binarios del fixture se generan en memoria —1×1 px— para no
 * versionar imágenes: el backend no decodifica la imagen, juzga el tipo declarado y las dimensiones.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** JPEG 1×1 válido: es la salida que produce el codificador del dispositivo. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

/** PNG 1×1 válido: el archivo que el formulario acepta del carrete, antes de optimizarlo. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Las tres variantes con sus dimensiones reales: la única forma de que la foto exista completa. */
const VARIANTS = [
  { variant: 'large', widthPx: 1_440, heightPx: 960 },
  { variant: 'medium', widthPx: 768, heightPx: 512 },
  { variant: 'thumb', widthPx: 320, heightPx: 213 },
] as const;

/**
 * Prepara un evento real con una invitación canjeada: el camino que el administrador usa fuera de
 * la aplicación. Devuelve también la sesión, porque la suite no canjea dos veces lo mismo.
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

/** El ticket: firma las escrituras y no recibe ningún byte. */
async function openCapture(
  request: APIRequestContext,
  eventId: string,
  token: string,
  contentType = 'image/jpeg',
): Promise<CaptureTicket> {
  const response = await request.post(`${BACKEND_URL}/events/${eventId}/captures`, {
    headers: { ...bearer(token), 'Content-Type': 'application/json' },
    data: { contentType },
  });
  expect(response.status()).toBe(201);

  return (await response.json()) as CaptureTicket;
}

/**
 * Sube por la URL prefirmada, como el navegador: el cuerpo **no** pasa por el API. En `fake` la URL
 * es relativa al API y `photo-upload` la resuelve contra el prefijo de la app.
 */
async function uploadVariant(
  request: APIRequestContext,
  ticket: CaptureTicket,
  variant: keyof CaptureTicket['uploads'],
  body: Buffer = JPEG,
): Promise<void> {
  const { url } = ticket.uploads[variant];

  const response = await request.put(`${BACKEND_URL}${url}`, {
    headers: { 'Content-Type': ticket.contentType },
    data: body,
  });

  expect(response.status()).toBe(204);
}

function attachBody(ticket: CaptureTicket) {
  return {
    captures: [{ captureId: ticket.captureId, slot: 0, variants: VARIANTS }],
  };
}

test('a co-device captures an article and only its event can read the photo', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'API-level capture suite runs once');

  const own = await eventWithSession(request, 'Bogotá', 'Ciudad de México');
  const foreign = await eventWithSession(request, 'Lima', 'Santiago');

  // 1. El artículo nace sin foto y con la ficha mínima.
  const createdResponse = await request.post(`${BACKEND_URL}/events/${own.event.id}/items`, {
    headers: bearer(own.session.sessionToken),
    data: {
      title: 'Bicicleta',
      note: 'Rodada 26',
      widthCm: 180,
      heightCm: 100,
      depthCm: 40,
      weightKg: 12.5,
    },
  });
  expect(createdResponse.status()).toBe(201);
  const { item } = (await createdResponse.json()) as CreatedItem;
  expect(item.eventId).toBe(own.event.id);
  expect(item.title).toBe('Bicicleta');
  expect(item.weightKg).toBe(12.5);
  expect(item.photo).toBeNull();

  // 2. La lista del evento lo devuelve.
  const listResponse = await request.get(`${BACKEND_URL}/events/${own.event.id}/items`, {
    headers: bearer(own.session.sessionToken),
  });
  expect(listResponse.status()).toBe(200);
  const list = (await listResponse.json()) as ItemList;
  expect(list.items.map((entry) => entry.id)).toContain(item.id);

  // 3. El ticket firma tres escrituras y las variantes suben por su URL: el cuerpo no toca el API.
  const ticket = await openCapture(request, own.event.id, own.session.sessionToken);
  expect(Object.keys(ticket.uploads).sort()).toEqual(['large', 'medium', 'thumb']);

  for (const variant of VARIANTS) {
    await uploadVariant(request, ticket, variant.variant);
  }

  const attachResponse = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photos`,
    {
      headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'application/json' },
      data: attachBody(ticket),
    },
  );
  expect(attachResponse.status()).toBe(200);

  const attached = (await attachResponse.json()) as AttachedPhotos;
  expect(attached.photos).toHaveLength(1);

  const photoId = attached.photos[0]?.id ?? '';
  expect(attached.photos[0]?.sizes.large).toEqual({ widthPx: 1_440, heightPx: 960 });
  expect(attached.photos[0]?.sizes.medium).toEqual({ widthPx: 768, heightPx: 512 });
  expect(attached.photos[0]?.sizes.thumb).toEqual({ widthPx: 320, heightPx: 213 });

  // 4. La lectura por variante responde su tipo, y sin parámetro sirve el tamaño grande.
  for (const variant of VARIANTS) {
    const photoResponse = await request.get(
      `${BACKEND_URL}/photos/${photoId}?variant=${variant.variant}`,
      { headers: bearer(own.session.sessionToken) },
    );
    expect(photoResponse.status()).toBe(200);
    expect(photoResponse.headers()['content-type']).toContain('image/jpeg');
    expect(await photoResponse.body()).toEqual(JPEG);
  }

  const defaultPhoto = await request.get(`${BACKEND_URL}/photos/${photoId}`, {
    headers: bearer(own.session.sessionToken),
  });
  expect(defaultPhoto.status()).toBe(200);
  expect(defaultPhoto.headers()['content-type']).toContain('image/jpeg');

  // 5. Sin credencial no hay foto, y desde otro evento tampoco: no se distingue ajeno de inexistente.
  const anonymousPhoto = await request.get(`${BACKEND_URL}/photos/${photoId}`);
  expect(anonymousPhoto.status()).toBe(401);
  await expect(anonymousPhoto.json()).resolves.toEqual({ error: 'unauthorized' });

  const foreignPhoto = await request.get(`${BACKEND_URL}/photos/${photoId}`, {
    headers: bearer(foreign.session.sessionToken),
  });
  expect(foreignPhoto.status()).toBe(404);
  await expect(foreignPhoto.json()).resolves.toEqual({ error: 'item_not_found' });

  // 6. El evento ajeno responde `not_found` en sus caminos, sin revelar que existe.
  const foreignList = await request.get(`${BACKEND_URL}/events/${own.event.id}/items`, {
    headers: bearer(foreign.session.sessionToken),
  });
  expect(foreignList.status()).toBe(404);
  await expect(foreignList.json()).resolves.toEqual({ error: 'not_found' });

  const foreignItem = await request.get(`${BACKEND_URL}/events/${own.event.id}/items/${item.id}`, {
    headers: bearer(foreign.session.sessionToken),
  });
  expect(foreignItem.status()).toBe(404);
  await expect(foreignItem.json()).resolves.toEqual({ error: 'not_found' });

  const foreignTicket = await request.post(`${BACKEND_URL}/events/${own.event.id}/captures`, {
    headers: { ...bearer(foreign.session.sessionToken), 'Content-Type': 'application/json' },
    data: { contentType: 'image/jpeg' },
  });
  expect(foreignTicket.status()).toBe(404);
  await expect(foreignTicket.json()).resolves.toEqual({ error: 'not_found' });

  const foreignAttach = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photos`,
    {
      headers: { ...bearer(foreign.session.sessionToken), 'Content-Type': 'application/json' },
      data: attachBody(ticket),
    },
  );
  expect(foreignAttach.status()).toBe(404);
  await expect(foreignAttach.json()).resolves.toEqual({ error: 'not_found' });

  // Un artículo que no está en el evento responde su propio código.
  const missingItem = await request.get(
    `${BACKEND_URL}/events/${own.event.id}/items/00000000-0000-4000-8000-000000000000`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(missingItem.status()).toBe(404);
  await expect(missingItem.json()).resolves.toEqual({ error: 'item_not_found' });

  // 7. Los rechazos del nuevo borde: el tipo del ticket, la captura incompleta, las dimensiones
  //    fuera de su tamaño y el tope de transporte de la escritura directa. Ninguno toca lo guardado.
  const badTicket = await request.post(`${BACKEND_URL}/events/${own.event.id}/captures`, {
    headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'application/json' },
    data: { contentType: 'image/gif' },
  });
  expect(badTicket.status()).toBe(400);
  await expect(badTicket.json()).resolves.toEqual({ error: 'validation_failed' });

  const incomplete = await openCapture(request, own.event.id, own.session.sessionToken);
  await uploadVariant(request, incomplete, 'large');
  await uploadVariant(request, incomplete, 'medium');
  const incompleteAttach = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photos`,
    {
      headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'application/json' },
      data: attachBody(incomplete),
    },
  );
  expect(incompleteAttach.status()).toBe(409);
  await expect(incompleteAttach.json()).resolves.toEqual({ error: 'capture_incomplete' });

  const oversized = await openCapture(request, own.event.id, own.session.sessionToken);
  for (const variant of ['large', 'medium', 'thumb'] as const) {
    await uploadVariant(request, oversized, variant);
  }
  const oversizedAttach = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photos`,
    {
      headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'application/json' },
      data: {
        captures: [
          {
            captureId: oversized.captureId,
            slot: 0,
            variants: [
              { variant: 'large', widthPx: 1_440, heightPx: 960 },
              { variant: 'medium', widthPx: 768, heightPx: 512 },
              { variant: 'thumb', widthPx: 1_024, heightPx: 768 },
            ],
          },
        ],
      },
    },
  );
  expect(oversizedAttach.status()).toBe(400);
  await expect(oversizedAttach.json()).resolves.toEqual({ error: 'validation_failed' });

  const transport = await openCapture(request, own.event.id, own.session.sessionToken);
  const tooBig = await request.put(`${BACKEND_URL}${transport.uploads.large.url}`, {
    headers: { 'Content-Type': transport.contentType },
    data: Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]),
  });
  expect(tooBig.status()).toBe(400);
  await expect(tooBig.json()).resolves.toEqual({ error: 'photo_invalid' });

  const afterRejections = await request.get(`${BACKEND_URL}/events/${own.event.id}/items`, {
    headers: bearer(own.session.sessionToken),
  });
  const afterList = (await afterRejections.json()) as ItemList;
  const [stored] = afterList.items.filter((entry) => entry.id === item.id);
  expect(stored?.photo?.sizes.large).toEqual({ widthPx: 1_440, heightPx: 960 });
  expect(stored?.photo?.sizes.medium).toEqual({ widthPx: 768, heightPx: 512 });
  expect(stored?.photo?.sizes.thumb).toEqual({ widthPx: 320, heightPx: 213 });

  // 8. La base guarda el evento, la foto y sus tres variantes, y ningún token en claro.
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const itemRows = await client.query<{ event_id: string; title: string }>(
      'SELECT event_id, title FROM app.item WHERE id = $1',
      [item.id],
    );
    expect(itemRows.rows[0]?.event_id).toBe(own.event.id);
    expect(itemRows.rows[0]?.title).toBe('Bicicleta');

    // Las columnas heredadas describen el tamaño `large`; desde 4g el peso lo dicta el `HEAD`.
    const photoRows = await client.query<{ content_type: string; byte_size: number }>(
      'SELECT content_type, byte_size FROM app.item_photo WHERE item_id = $1 AND position = 0',
      [item.id],
    );
    expect(photoRows.rows[0]?.content_type).toBe('image/jpeg');
    expect(photoRows.rows[0]?.byte_size).toBe(JPEG.length);

    const variantRows = await client.query<{ variant: string; width_px: number }>(
      `SELECT variant, width_px
         FROM app.item_photo_variant
        WHERE photo_id = $1
        ORDER BY variant`,
      [photoId],
    );
    expect(variantRows.rows).toEqual([
      { variant: 'large', width_px: 1_440 },
      { variant: 'medium', width_px: 768 },
      { variant: 'thumb', width_px: 320 },
    ]);

    const plain = await client.query('SELECT 1 FROM app.session WHERE token_hash = $1', [
      own.session.sessionToken,
    ]);
    expect(plain.rowCount).toBe(0);
  } finally {
    await client.end();
  }
});

test('a co-device opens the link and captures the first article from the browser', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'UI capture suite opens the private surface');

  const own = await eventWithSession(request, 'Bogotá', 'Ciudad de México');

  // 1. El enlace abre el canje con su token, y canjear deja la sesión en el dispositivo.
  await page.goto(`/invitacion?token=${encodeURIComponent(own.invitation.token)}`);
  await expect(page.getByTestId('redeem-token')).toHaveValue(own.invitation.token);
  await page.getByTestId('redeem-submit').click();

  await expect(page).toHaveURL(new RegExp(`/eventos/${own.event.id}$`));
  // Desde 3d la captura y la lista son pestañas distintas: el evento abre en `Captura`.
  await expect(page.getByTestId('event-tab-capture')).toBeVisible();
  await expect(page.getByTestId('event-tab-captured')).toContainText('Capturados (0)');

  const stored = await page.evaluate(() => localStorage.getItem('mudanzapp.session'));
  expect(stored).not.toBeNull();
  expect(page.url()).not.toContain(own.invitation.token);

  // 2. La captura: foto por el input de archivo —optimizada en el dispositivo— y ficha mínima.
  await page.getByTestId('item-title-input').fill('Mesa de comedor');
  await page.getByTestId('item-weight-input').fill('35');
  await page.setInputFiles('[data-testid="item-photo-input"]', {
    name: 'mesa.png',
    mimeType: 'image/png',
    buffer: PNG,
  });

  await expect(page.getByTestId('item-photo-preview')).toBeVisible();
  await expect(page.getByTestId('item-photo-sizes')).toBeVisible();
  await expect(page.getByTestId('item-photo-size-large')).toBeVisible();

  // 3. El botón dice cuánto falta: la escritura directa se retrasa para que el progreso sea visible.
  await page.route('**/__fake-r2/**', async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    await route.continue();
  });

  await page.getByTestId('item-form-save-only').click();
  await expect(page.getByTestId('item-form-save-only')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByTestId('item-form-save-only')).toContainText('%');

  // La captura no publica: guarda la ficha privada y ofrece el enlace a `Capturados`.
  await expect(page.getByTestId('capture-saved')).toBeVisible();
  await expect(page.getByTestId('item-form-save-only')).toBeDisabled();

  await page.getByTestId('capture-go-captured').click();

  // 4. Aparece en la lista con su miniatura, servida con la sesión del dispositivo.
  await expect(page.getByTestId('items-list')).toBeVisible();
  await expect(page.getByTestId('item-title')).toHaveText('Mesa de comedor');
  await expect(page.getByTestId('item-photo')).toBeVisible();

  // 5. Recargar conserva la sesión y el artículo: la credencial se restaura antes del guard.
  await page.reload();
  await expect(page.getByTestId('item-title')).toHaveText('Mesa de comedor');
  await expect(page.getByTestId('item-photo')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/eventos/${own.event.id}/capturados$`));
});
