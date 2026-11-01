import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  AI_DRAFT_LIMITS,
  type AiDraftResult,
  type CreatedEvent,
  type CreatedInvitation,
  type CreatedItem,
  type IssuedSession,
} from '@mudanzapp/shared';
import pg from 'pg';

import { ADMIN_TOKEN, BACKEND_URL, testDatabaseUrl } from './support/harness.js';

const { Client } = pg;

/**
 * Evidencia del ciclo 3d (`ai-draft`, `plan-ciclo-3d` §8, forma A): el borrador se pide sobre un
 * artículo ya capturado, **no escribe** nada, y solo lo que el humano deja escrito llega a la base.
 *
 * Tres suites: la de API corre una vez, la de interfaz abre la superficie privada en un navegador
 * real y la del dossier corre en el project `wiki`. El backend va con `AI_MODE=fake` (lo compone
 * `backendEnv()`), así que aquí se demuestra contrato, validación, prefill y revisión humana —**no**
 * la calidad del borrador ni la llamada al proveedor— (`06` §4).
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** JPEG 1×1 válido: la salida que produce el codificador del dispositivo. */
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

/** Las tres variantes con sus dimensiones reales: es la foto completa que el borrador necesita. */
const VARIANTS = [
  { variant: 'large', w: 1_440, h: 960 },
  { variant: 'medium', w: 768, h: 512 },
  { variant: 'thumb', w: 320, h: 213 },
] as const;

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

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

async function captureItem(
  request: APIRequestContext,
  eventId: string,
  sessionToken: string,
  title: string,
): Promise<string> {
  const created = await request.post(`${BACKEND_URL}/events/${eventId}/items`, {
    headers: bearer(sessionToken),
    data: { title },
  });
  expect(created.status()).toBe(201);
  const { item } = (await created.json()) as CreatedItem;
  return item.id;
}

async function uploadVariants(
  request: APIRequestContext,
  eventId: string,
  itemId: string,
  sessionToken: string,
): Promise<void> {
  for (const variant of VARIANTS) {
    const uploaded = await request.put(
      `${BACKEND_URL}/events/${eventId}/items/${itemId}/photo?variant=${variant.variant}&w=${variant.w}&h=${variant.h}`,
      {
        headers: { ...bearer(sessionToken), 'Content-Type': 'image/jpeg' },
        data: JPEG,
      },
    );
    expect(uploaded.status()).toBe(200);
  }
}

function draftUrl(eventId: string, itemId: string): string {
  return `${BACKEND_URL}/events/${eventId}/items/${itemId}/draft`;
}

/** Conteos del evento: la aserción de que el borrador es efímero se hace contra la base. */
async function eventCounts(eventId: string): Promise<{ items: number; photos: number }> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const items = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM app.item WHERE event_id = $1',
      [eventId],
    );
    const photos = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM app.item_photo p
         JOIN app.item i ON i.id = p.item_id
        WHERE i.event_id = $1`,
      [eventId],
    );

    return {
      items: Number(items.rows[0]?.count ?? '0'),
      photos: Number(photos.rows[0]?.count ?? '0'),
    };
  } finally {
    await client.end();
  }
}

test('the draft is ephemeral and only the human review writes', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'API-level draft suite runs once');

  const own = await eventWithSession(request, 'Bogotá', 'Ciudad de México');
  const foreign = await eventWithSession(request, 'Lima', 'Santiago');

  // 1. Un artículo **sin foto** no puede tener borrador: 409 con su propio código.
  const bare = await captureItem(request, own.event.id, own.session.sessionToken, 'Caja sin foto');

  const withoutPhoto = await request.post(draftUrl(own.event.id, bare), {
    headers: bearer(own.session.sessionToken),
  });
  expect(withoutPhoto.status()).toBe(409);
  await expect(withoutPhoto.json()).resolves.toEqual({ error: 'item_photo_missing' });

  // 2. Con su foto, el borrador vuelve validado y dentro de los límites del contrato.
  const item = await captureItem(
    request,
    own.event.id,
    own.session.sessionToken,
    'Título de trabajo',
  );
  await uploadVariants(request, own.event.id, item, own.session.sessionToken);

  const before = await eventCounts(own.event.id);

  const draftResponse = await request.post(draftUrl(own.event.id, item), {
    headers: bearer(own.session.sessionToken),
  });
  expect(draftResponse.status()).toBe(200);

  const { draft } = (await draftResponse.json()) as AiDraftResult;
  expect(draft.title.length).toBeGreaterThan(0);
  expect(draft.title.length).toBeLessThanOrEqual(AI_DRAFT_LIMITS.title);
  expect(draft.note.length).toBeGreaterThan(0);
  expect(draft.note.length).toBeLessThanOrEqual(AI_DRAFT_LIMITS.note);

  // 3. El borrador **no escribe**: ni artículo, ni foto, ni fila alguna.
  await expect(eventCounts(own.event.id)).resolves.toEqual(before);

  // 4. Los bordes de siempre: sin credencial, evento ajeno y artículo inexistente.
  const anonymous = await request.post(draftUrl(own.event.id, item));
  expect(anonymous.status()).toBe(401);
  await expect(anonymous.json()).resolves.toEqual({ error: 'unauthorized' });

  const foreignAttempt = await request.post(draftUrl(own.event.id, item), {
    headers: bearer(foreign.session.sessionToken),
  });
  expect(foreignAttempt.status()).toBe(404);
  await expect(foreignAttempt.json()).resolves.toEqual({ error: 'not_found' });

  const missingItem = await request.post(
    draftUrl(own.event.id, '00000000-0000-4000-8000-000000000000'),
    { headers: bearer(own.session.sessionToken) },
  );
  expect(missingItem.status()).toBe(404);
  await expect(missingItem.json()).resolves.toEqual({ error: 'item_not_found' });

  // 5. La revisión humana sí escribe, y solo los campos que envió.
  const patched = await request.patch(`${BACKEND_URL}/events/${own.event.id}/items/${item}`, {
    headers: bearer(own.session.sessionToken),
    data: { title: 'Silla blanca', note: 'Barniz claro' },
  });
  expect(patched.status()).toBe(200);

  const storedItem = (await patched.json()) as { item: { title: string; note: string | null } };
  expect(storedItem.item.title).toBe('Silla blanca');
  expect(storedItem.item.note).toBe('Barniz claro');

  const emptyPatch = await request.patch(`${BACKEND_URL}/events/${own.event.id}/items/${item}`, {
    headers: bearer(own.session.sessionToken),
    data: {},
  });
  expect(emptyPatch.status()).toBe(400);
  await expect(emptyPatch.json()).resolves.toEqual({ error: 'validation_failed' });

  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const rows = await client.query<{ title: string; note: string | null }>(
      'SELECT title, note FROM app.item WHERE id = $1',
      [item],
    );
    expect(rows.rows[0]).toEqual({ title: 'Silla blanca', note: 'Barniz claro' });

    // La foto no cambió: la revisión no toca medidas ni foto.
    const photos = await client.query('SELECT 1 FROM app.item_photo WHERE item_id = $1', [item]);
    expect(photos.rowCount).toBe(1);
  } finally {
    await client.end();
  }
});

test('the human reviews the draft in the browser and saves the ficha', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'UI review suite opens the private surface');

  const own = await eventWithSession(request, 'Bogotá', 'Ciudad de México');

  // 1. Canje y captura con foto: el artículo existe antes que el borrador (forma A).
  await page.goto(`/invitacion?token=${encodeURIComponent(own.invitation.token)}`);
  await page.getByTestId('redeem-submit').click();
  await expect(page).toHaveURL(new RegExp(`/eventos/${own.event.id}$`));

  await page.getByTestId('item-title-input').fill('Título de trabajo');
  await page.setInputFiles('[data-testid="item-photo-input"]', {
    name: 'silla.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByTestId('item-photo-sizes')).toBeVisible();
  await page.getByTestId('item-submit').click();
  await expect(page.getByTestId('items-list')).toBeVisible();

  // 2. Revisar → Borrador con IA → el humano corrige → guardar.
  await page.getByTestId('item-review-open').first().click();
  await expect(page.getByTestId('item-review-form')).toBeVisible();

  await page.getByTestId('item-review-draft').click();
  await expect(page.getByTestId('item-review-draft-notice')).toContainText(
    'revísalo antes de guardar',
  );

  await page.getByTestId('item-review-title').fill('Silla blanca');
  await page.getByTestId('item-review-save').click();

  // 3. La lista muestra **la palabra del humano**, no la del borrador.
  await expect(page.getByTestId('item-title')).toHaveText('Silla blanca');
  await expect(page.getByTestId('item-review-form')).toHaveCount(0);

  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const rows = await client.query<{ title: string }>(
      `SELECT i.title
         FROM app.item i
        WHERE i.event_id = $1`,
      [own.event.id],
    );
    expect(rows.rows.map((row) => row.title)).toEqual(['Silla blanca']);
  } finally {
    await client.end();
  }
});

test('the dossier explains the contract and the mandatory review', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'wiki', 'the dossier runs in the wiki project');

  // La página abre en un contexto sin sesión: no pide credencial ni backend.
  await page.goto('/foto-a-ficha');

  await expect(page.getByTestId('foto-a-ficha')).toBeVisible();
  await expect(page.getByTestId('foto-a-ficha-pide')).toContainText('variante mediana');
  await expect(page.getByTestId('foto-a-ficha-devuelve')).toContainText(
    String(AI_DRAFT_LIMITS.title),
  );
  await expect(page.getByTestId('foto-a-ficha-no-decide')).toContainText(
    'medidas, peso, precio ni destino',
  );
  await expect(page.getByTestId('foto-a-ficha-valida')).toContainText('esquema estricto');
  await expect(page.getByTestId('foto-a-ficha-falla')).toContainText('se escribe a mano');
  await expect(page.getByTestId('foto-a-ficha-revision')).toContainText('WhatsApp');

  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
