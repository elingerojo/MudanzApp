import { expect, test, type APIRequestContext } from '@playwright/test';
import type {
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
 * Evidencia del ciclo 3a (`capture`, `resumen-funcional` §3 y §4): un co-dispositivo documenta su
 * primer artículo con foto dentro de su evento, la foto se lee solo con sesión del evento y ningún
 * otro evento la alcanza.
 *
 * Dos suites en un archivo: la de API, que corre una vez, y la de interfaz, que abre la superficie
 * privada en un navegador real. El PNG del fixture se genera en memoria — 1×1 px — para no versionar
 * binarios.
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

  // 3. La foto entra por cuerpo binario crudo y queda declarada en la base.
  const uploadResponse = await request.put(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photo`,
    {
      headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'image/png' },
      data: PNG,
    },
  );
  expect(uploadResponse.status()).toBe(200);
  const uploaded = (await uploadResponse.json()) as { photo: { id: string; contentType: string } };
  expect(uploaded.photo.contentType).toBe('image/png');

  // 4. La foto se lee con sesión del evento y con su tipo.
  const photoResponse = await request.get(`${BACKEND_URL}/photos/${uploaded.photo.id}`, {
    headers: bearer(own.session.sessionToken),
  });
  expect(photoResponse.status()).toBe(200);
  expect(photoResponse.headers()['content-type']).toContain('image/png');
  expect(await photoResponse.body()).toEqual(PNG);

  // 5. Sin credencial no hay foto, y desde otro evento tampoco: no se distingue ajeno de inexistente.
  const anonymousPhoto = await request.get(`${BACKEND_URL}/photos/${uploaded.photo.id}`);
  expect(anonymousPhoto.status()).toBe(401);
  await expect(anonymousPhoto.json()).resolves.toEqual({ error: 'unauthorized' });

  const foreignPhoto = await request.get(`${BACKEND_URL}/photos/${uploaded.photo.id}`, {
    headers: bearer(foreign.session.sessionToken),
  });
  expect(foreignPhoto.status()).toBe(404);
  await expect(foreignPhoto.json()).resolves.toEqual({ error: 'item_not_found' });

  // 6. El evento ajeno responde `not_found` en sus tres caminos, sin revelar que existe.
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

  const foreignUpload = await request.put(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photo`,
    {
      headers: { ...bearer(foreign.session.sessionToken), 'Content-Type': 'image/png' },
      data: PNG,
    },
  );
  expect(foreignUpload.status()).toBe(404);
  await expect(foreignUpload.json()).resolves.toEqual({ error: 'not_found' });

  // Un artículo que no está en el evento responde su propio código.
  const missingItem = await request.get(
    `${BACKEND_URL}/events/${own.event.id}/items/00000000-0000-4000-8000-000000000000`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(missingItem.status()).toBe(404);
  await expect(missingItem.json()).resolves.toEqual({ error: 'item_not_found' });

  // 7. Una foto de tipo no admitido y una que pasa el límite se rechazan sin tocar la guardada.
  const wrongType = await request.put(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photo`,
    {
      headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'image/gif' },
      data: PNG,
    },
  );
  expect(wrongType.status()).toBe(400);
  await expect(wrongType.json()).resolves.toEqual({ error: 'photo_invalid' });

  const tooBig = await request.put(`${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photo`, {
    headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'image/png' },
    data: Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]),
  });
  expect(tooBig.status()).toBe(400);
  await expect(tooBig.json()).resolves.toEqual({ error: 'photo_invalid' });

  const afterRejections = await request.get(`${BACKEND_URL}/events/${own.event.id}/items`, {
    headers: bearer(own.session.sessionToken),
  });
  const afterList = (await afterRejections.json()) as ItemList;
  const [stored] = afterList.items.filter((entry) => entry.id === item.id);
  expect(stored?.photo?.byteSize).toBe(PNG.length);

  // 8. La base guarda el evento del artículo, su foto y ningún token en claro.
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const itemRows = await client.query<{ event_id: string; title: string }>(
      'SELECT event_id, title FROM app.item WHERE id = $1',
      [item.id],
    );
    expect(itemRows.rows[0]?.event_id).toBe(own.event.id);
    expect(itemRows.rows[0]?.title).toBe('Bicicleta');

    const photoRows = await client.query<{ content_type: string; byte_size: number }>(
      'SELECT content_type, byte_size FROM app.item_photo WHERE item_id = $1 AND position = 0',
      [item.id],
    );
    expect(photoRows.rows[0]?.content_type).toBe('image/png');
    expect(photoRows.rows[0]?.byte_size).toBe(PNG.length);

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
  await expect(page.getByTestId('items-empty')).toBeVisible();

  const stored = await page.evaluate(() => localStorage.getItem('mudanzapp.session'));
  expect(stored).not.toBeNull();
  expect(page.url()).not.toContain(own.invitation.token);

  // 2. La captura: foto por el input de archivo y ficha mínima.
  await page.getByTestId('item-title-input').fill('Mesa de comedor');
  await page.getByTestId('item-weight-input').fill('35');
  await page.setInputFiles('[data-testid="item-photo-input"]', {
    name: 'mesa.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByTestId('item-photo-preview')).toBeVisible();

  await page.getByTestId('item-submit').click();

  // 3. Aparece en la lista con su foto, servida con la sesión del dispositivo.
  await expect(page.getByTestId('items-list')).toBeVisible();
  await expect(page.getByTestId('item-title')).toHaveText('Mesa de comedor');
  await expect(page.getByTestId('item-photo')).toBeVisible();

  // 4. Recargar conserva la sesión y el artículo: la credencial se restaura antes del guard.
  await page.reload();
  await expect(page.getByTestId('item-title')).toHaveText('Mesa de comedor');
  await expect(page.getByTestId('item-photo')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/eventos/${own.event.id}$`));
});
