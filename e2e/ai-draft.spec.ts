import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  AI_DRAFT_LIMITS,
  type AiDraftResult,
  type CreatedEvent,
  type CreatedInvitation,
  type IssuedSession,
} from '@mudanzapp/shared';
import pg from 'pg';

import { ADMIN_TOKEN, BACKEND_URL, testDatabaseUrl } from './support/harness.js';

const { Client } = pg;

/**
 * Evidencia del ciclo 3d (`ai-draft`, `plan-ciclo-3d` §9, forma B): el borrador se pide **desde el
 * formulario de captura, antes de que el artículo exista**, con los bytes de la variante mediana; no
 * escribe nada; y el humano publica o guarda desde la misma pantalla.
 *
 * Tres suites: la de API corre una vez, la de interfaz abre la superficie privada en un navegador real
 * y la del dossier corre en el `project` de `wiki`. El backend va con `AI_MODE=fake` (lo compone
 * `backendEnv()`), así que aquí se demuestra contrato, validación, relleno y publicación —**no** la
 * calidad del borrador ni la llamada al proveedor— (`06` §4).
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

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function draftUrl(eventId: string): string {
  return `${BACKEND_URL}/events/${eventId}/ai/drafts`;
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

test('the draft is ephemeral, needs no article and only the human publishes', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'API-level draft suite runs once');

  const own = await eventWithSession(request, 'Bogotá', 'Ciudad de México');
  const foreign = await eventWithSession(request, 'Lima', 'Santiago');

  const before = await eventCounts(own.event.id);

  // 1. El borrador vuelve validado, dentro de los límites del contrato y **sin artículo previo**.
  const draftResponse = await request.post(draftUrl(own.event.id), {
    headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'image/jpeg' },
    data: JPEG,
  });
  expect(draftResponse.status()).toBe(200);

  const { draft } = (await draftResponse.json()) as AiDraftResult;
  expect(draft.title.length).toBeGreaterThan(0);
  expect(draft.title.length).toBeLessThanOrEqual(AI_DRAFT_LIMITS.title);
  expect(draft.note.length).toBeGreaterThan(0);
  expect(draft.note.length).toBeLessThanOrEqual(AI_DRAFT_LIMITS.note);

  // 2. El borrador **no escribe**: ni artículo, ni foto, ni fila alguna.
  await expect(eventCounts(own.event.id)).resolves.toEqual(before);

  // 3. Los bordes: sin credencial, evento ajeno, tipo no admitido y cuerpo demasiado grande.
  const anonymous = await request.post(draftUrl(own.event.id), {
    headers: { 'Content-Type': 'image/jpeg' },
    data: JPEG,
  });
  expect(anonymous.status()).toBe(401);
  await expect(anonymous.json()).resolves.toEqual({ error: 'unauthorized' });

  const foreignAttempt = await request.post(draftUrl(own.event.id), {
    headers: { ...bearer(foreign.session.sessionToken), 'Content-Type': 'image/jpeg' },
    data: JPEG,
  });
  expect(foreignAttempt.status()).toBe(404);
  await expect(foreignAttempt.json()).resolves.toEqual({ error: 'not_found' });

  const wrongType = await request.post(draftUrl(own.event.id), {
    headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'text/plain' },
    data: 'no soy una foto',
  });
  expect(wrongType.status()).toBe(400);
  await expect(wrongType.json()).resolves.toEqual({ error: 'photo_invalid' });

  const tooBig = await request.post(draftUrl(own.event.id), {
    headers: { ...bearer(own.session.sessionToken), 'Content-Type': 'image/jpeg' },
    data: Buffer.alloc(6 * 1024 * 1024),
  });
  expect(tooBig.status()).toBe(400);
  await expect(tooBig.json()).resolves.toEqual({ error: 'photo_invalid' });
});

test('the human reviews the draft in the form and publishes from the same screen', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'UI draft suite opens the private surface');

  const own = await eventWithSession(request, 'Bogotá', 'Ciudad de México');

  // 1. Canje, foto y borrador: nada existe todavía en la base.
  await page.goto(`/invitacion?token=${encodeURIComponent(own.invitation.token)}`);
  await page.getByTestId('redeem-submit').click();
  await expect(page).toHaveURL(/\/captura$/);

  await page.setInputFiles('[data-testid="item-photo-input"]', {
    name: 'silla.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByTestId('item-photo-sizes')).toBeVisible();

  await page.getByTestId('item-form-draft').click();
  await expect(page.getByTestId('item-form-draft-notice')).toContainText(
    'revísalo antes de publicar',
  );

  // 2. El humano corrige el título y publica: el enlace aparece en la misma pantalla.
  await page.getByTestId('item-title-input').fill('Silla blanca');
  await page.getByTestId('item-form-publish').click();

  await expect(page.getByTestId('capture-saved')).toBeVisible();
  await expect(page.getByTestId('capture-published-link')).toBeVisible();

  // 3. La pantalla de capturados lo muestra como publicado, y recargar no lo pierde.
  await page.getByTestId('shell-nav-captured').click();
  await expect(page.getByTestId('item-title')).toHaveText('Silla blanca');
  await expect(page.getByTestId('item-status')).toHaveText('publicado');

  await page.reload();
  await expect(page.getByTestId('item-status')).toHaveText('publicado');

  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    // 4. Lo publicado es **la palabra del humano**, y la fila de `app.listing` existe.
    const rows = await client.query<{ title: string; slug: string | null }>(
      `SELECT i.title, l.slug
         FROM app.item i
         LEFT JOIN app.listing l ON l.item_id = i.id
        WHERE i.event_id = $1`,
      [own.event.id],
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.title).toBe('Silla blanca');
    expect(rows.rows[0]?.slug).not.toBeNull();
  } finally {
    await client.end();
  }
});

test('saving without publishing leaves the article en proceso and the row can publish it', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'UI save-only suite opens the private surface');

  const own = await eventWithSession(request, 'Cali', 'Medellín');

  await page.goto(`/invitacion?token=${encodeURIComponent(own.invitation.token)}`);
  await page.getByTestId('redeem-submit').click();
  await expect(page).toHaveURL(/\/captura$/);

  await page.setInputFiles('[data-testid="item-photo-input"]', {
    name: 'caja.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByTestId('item-photo-sizes')).toBeVisible();

  await page.getByTestId('item-title-input').fill('Caja de cartón');
  await page.getByTestId('item-form-save-only').click();
  await expect(page.getByTestId('capture-saved')).toContainText('en proceso');

  await page.getByTestId('shell-nav-captured').click();
  await expect(page.getByTestId('item-status')).toHaveText('en proceso');

  await page.getByTestId('item-publish').click();
  await expect(page.getByTestId('item-status')).toHaveText('publicado');
});
