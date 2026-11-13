import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  ITEM_PHOTO_ENCODING,
  type CreatedEvent,
  type CreatedInvitation,
  type CreatedItem,
  type IssuedSession,
  type ItemSummary,
  type PublicListing,
  type PublishedListing,
} from '@mudanzapp/shared';

import { attachCapture } from './support/attach-capture.js';
import { ADMIN_TOKEN, BACKEND_URL } from './support/harness.js';

/**
 * Evidencia central del ciclo 3c-optimizar (`plan-ciclo-3c-optimizar` §7), en un navegador real:
 *
 * 1. una foto de origen pesada se optimiza **en el dispositivo** y llega al servidor como tres
 *    variantes dentro del objetivo de 400 KB, la mediana con 768 px de lado mayor y la proporción
 *    original intacta, y **ningún** cuerpo enviado se acerca al peso de la original;
 * 2. en `shop`, la ficha pinta la miniatura y la mediana, y tocar la mediana descubre la grande.
 *
 * Dos suites en un archivo porque cada una abre su superficie: la primera en `frontend`, la segunda en
 * `shop`. La descarga real del píxel desde `r2.dev` **no** es evidencia de gate: el doble `fake`
 * publica `https://fake.r2.local`, que no se descarga a propósito
 * ([`r2-fake.ts`](../backend/src/storage/r2-fake.ts:28)). El píxel se confirma en la verificación
 * manual `live` del ciclo.
 */
const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** JPEG 1×1 válido: la salida que produce el codificador del dispositivo. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

/** Un archivo elegido en la galería del dispositivo; el contenido es el JPEG de la prueba. */
function fileOf(name: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: 'image/jpeg', buffer: JPEG };
}

/** La ruta del doble del almacén: lo que sube el navegador por su cuenta (`plan-ciclo-4g` §5). */
const FAKE_PUT_PATH = '/__fake-r2/put';

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

/** Dimensiones de la foto que la prueba genera: 3:2, como la mayoría de las cámaras. */
const SOURCE_WIDTH = 3_000;
const SOURCE_HEIGHT = 2_000;

/**
 * Genera en el propio navegador una foto de origen pesada: un lienzo de 3000×2000 con degradado y
 * detalle, exportado a JPEG de calidad alta. Es el archivo que simula la cámara; nunca debe viajar.
 */
async function generateHeavyPhoto(page: Page): Promise<{ base64: string; size: number }> {
  return page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (context === null) {
        throw new Error('photo-canvas-unavailable');
      }

      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#c9d9e8');
      gradient.addColorStop(0.5, '#7d8fa1');
      gradient.addColorStop(1, '#2c3742');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      // Detalle suficiente para que el origen pese de verdad, sin volverlo ruido puro: así las tres
      // variantes sí caben en el objetivo y la prueba no depende de una foto patológica.
      for (let index = 0; index < 600; index += 1) {
        context.fillStyle = `rgba(${String(index % 255)}, ${String((index * 7) % 255)}, ${String(
          (index * 13) % 255,
        )}, 0.35)`;
        context.fillRect((index * 37) % width, (index * 53) % height, 140, 110);
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          (result) => {
            resolve(result);
          },
          'image/jpeg',
          0.95,
        );
      });

      if (blob === null) {
        throw new Error('photo-encode-unavailable');
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }

      return { base64: btoa(binary), size: blob.size };
    },
    { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
  );
}

test('the device optimizes a heavy photo into three sizes and the original never travels', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'the device suite opens the private surface');

  const own = await eventWithSession(request, 'Bogotá', 'Ciudad de México');

  // 1. La sesión entra por el enlace y la bienvenida nombra la cámara (cortes D13 y D14): la foto
  //    pesada se elige con el input de la barra, así que el panel abre con ella ya optimizada.
  await page.goto(`/invitacion?token=${encodeURIComponent(own.invitation.token)}`);
  await page.getByTestId('redeem-submit').click();
  await expect(page).toHaveURL(/\/inicio$/);

  const source = await generateHeavyPhoto(page);

  // 2. Cada cuerpo que se sube se mide: es la prueba de que la original no viaja. Desde 4g la
  //    escritura va a la URL prefirmada del almacén, así que lo que se intercepta es esa ruta.
  const uploads: { readonly bytes: number }[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (request.method() !== 'PUT' || !url.includes('/__fake-r2/put?token=')) {
      return;
    }

    uploads.push({ bytes: request.postDataBuffer()?.length ?? 0 });
  });

  await page.setInputFiles('[data-testid="shell-photo-input"]', {
    name: 'sala.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(source.base64, 'base64'),
  });
  await expect(page).toHaveURL(/\/captura$/);
  await page.getByTestId('item-title-input').fill('Sofá de tres puestos');

  // 3. La tarjeta de pesos aparece con las tres variantes ya codificadas en el dispositivo.
  await expect(page.getByTestId('item-photo-sizes')).toBeVisible();

  const sizes = await page.evaluate(() => {
    const read = (variant: string) => {
      const element = document.querySelector(`[data-testid="item-photo-size-${variant}"]`);
      if (element === null) {
        return null;
      }

      return {
        widthPx: Number(element.getAttribute('data-width')),
        heightPx: Number(element.getAttribute('data-height')),
        byteSize: Number(element.getAttribute('data-bytes')),
      };
    };

    return { thumb: read('thumb'), medium: read('medium'), large: read('large') };
  });

  expect(sizes.thumb).not.toBeNull();
  expect(sizes.medium).not.toBeNull();
  expect(sizes.large).not.toBeNull();

  // Lado mayor de cada tamaño, sin ampliar, y con la proporción original intacta.
  expect(Math.max(sizes.thumb?.widthPx ?? 0, sizes.thumb?.heightPx ?? 0)).toBe(320);
  expect(Math.max(sizes.medium?.widthPx ?? 0, sizes.medium?.heightPx ?? 0)).toBe(768);
  expect(Math.max(sizes.large?.widthPx ?? 0, sizes.large?.heightPx ?? 0)).toBe(1_440);

  const sourceRatio = SOURCE_WIDTH / SOURCE_HEIGHT;
  for (const size of [sizes.thumb, sizes.medium, sizes.large]) {
    const ratio = (size?.widthPx ?? 1) / (size?.heightPx ?? 1);
    expect(Math.abs(ratio - sourceRatio)).toBeLessThan(0.01);
  }

  // Objetivo de peso: es un objetivo del codificador, y aquí se comprueba el resultado real.
  for (const size of [sizes.thumb, sizes.medium, sizes.large]) {
    expect(size?.byteSize ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      ITEM_PHOTO_ENCODING.targetBytes,
    );
  }

  await page.getByTestId('item-form-save-only').click();

  // El cierre de la captura navega solo a `Capturados` (corte D14).
  await expect(page).toHaveURL(/\/capturados$/);

  // 4. Se subieron exactamente tres cuerpos y ninguno se acerca al peso de la original.
  await expect(page.getByTestId('items-list')).toBeVisible();
  await expect(page.getByTestId('item-title')).toHaveText('Sofá de tres puestos');

  // Tres cuerpos, uno por tamaño: la tarjeta de pesos ya demostró cuál es cuál.
  expect(uploads).toHaveLength(3);
  for (const entry of uploads) {
    expect(entry.bytes).toBeLessThan(source.size);
    expect(entry.bytes).toBeLessThanOrEqual(ITEM_PHOTO_ENCODING.targetBytes);
  }
});

test('the public listing paints the thumbnail and the medium, and the medium opens the large', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'shop', 'the public gallery suite opens shop');

  const own = await eventWithSession(request, 'Bogotá', 'Ciudad de México');

  const createdResponse = await request.post(`${BACKEND_URL}/events/${own.event.id}/items`, {
    headers: bearer(own.session.sessionToken),
    data: { title: 'Sofá de dos puestos' },
  });
  expect(createdResponse.status()).toBe(201);
  const { item } = (await createdResponse.json()) as CreatedItem;

  const variants = [
    { variant: 'large', w: 1_440, h: 960 },
    { variant: 'medium', w: 768, h: 512 },
    { variant: 'thumb', w: 320, h: 213 },
  ] as const;

  await attachCapture(request, {
    eventId: own.event.id,
    itemId: item.id,
    token: own.session.sessionToken,
    body: JPEG,
    variants: variants.map((variant) => ({
      variant: variant.variant,
      widthPx: variant.w,
      heightPx: variant.h,
    })),
  });

  const publishResponse = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/listing`,
    { headers: bearer(own.session.sessionToken) },
  );
  expect(publishResponse.status()).toBe(201);
  const listing = (await publishResponse.json()) as PublishedListing;

  const publicResponse = await request.get(`${BACKEND_URL}/public/listings/${listing.slug}`);
  expect(publicResponse.status()).toBe(200);
  const body = (await publicResponse.json()) as PublicListing;

  // La ficha pinta los dos tamaños menores y sus etiquetas de píxeles.
  await page.goto(`/${listing.slug}`);
  await expect(page.getByTestId('listing-title')).toHaveText('Sofá de dos puestos');
  expect(await page.getByTestId('listing-photo').getAttribute('src')).toBe(
    body.photo?.sizes.medium?.url,
  );
  expect(await page.getByTestId('listing-photo-thumb').getAttribute('src')).toBe(
    body.photo?.sizes.thumb?.url,
  );
  await expect(page.getByTestId('listing-photo-medium')).toContainText('768');
  await expect(page.getByTestId('listing-photo-thumb-label')).toContainText('320');

  // Tocar la mediana deja visible la URL de la grande, que apunta al almacén público.
  await expect(page.getByTestId('listing-photo-overlay')).toHaveCount(0);
  await page.getByTestId('listing-photo-trigger').click();

  await expect(page.getByTestId('listing-photo-overlay')).toBeVisible();
  expect(await page.getByTestId('listing-photo-large').getAttribute('src')).toBe(
    body.photo?.sizes.large?.url,
  );
  expect(body.photo?.sizes.large?.url.startsWith('http')).toBe(true);

  // La ampliada no se ve más chica que la imagen en línea: su caja es el viewport, no una fila del
  // `flex` ni una columna `max-w-2xl` con `padding`. Es la evidencia de la corrección de presentación.
  const inline = await page.getByTestId('listing-photo').boundingBox();
  const zoomed = await page.getByTestId('listing-photo-large').boundingBox();
  expect(inline?.width ?? 0).toBeGreaterThan(0);
  expect(zoomed?.width ?? 0).toBeGreaterThan(inline?.width ?? 0);

  // `Escape` cierra la vista ampliada y devuelve el foco al control que la abrió.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('listing-photo-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(
    'listing-photo-trigger',
  );
});

/**
 * Evidencia del corte 3e (`gallery`): el orden de captura es el orden de la galería, el índice 0 es
 * la portada y la permutación de publicación se guarda con una ruta propia.
 *
 * La suite de API comprueba el contrato —orden, persistencia, `photo_order_mismatch` y `item_sold`—
 * y la de interfaz que la tira reordena y que con una sola foto no hay controles ni petición de orden.
 */
test('the private gallery keeps the capture order and a publication permutation', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'API-level gallery suite runs once');

  const own = await eventWithSession(request, 'Quito', 'Loja');
  const token = own.session.sessionToken;

  const created = await request.post(`${BACKEND_URL}/events/${own.event.id}/items`, {
    headers: bearer(token),
    data: { title: 'Comedor de seis puestos' },
  });
  expect(created.status()).toBe(201);
  const { item } = (await created.json()) as CreatedItem;

  const ids: string[] = [];
  for (const slot of [0, 1, 2]) {
    ids.push(
      await attachCapture(request, {
        eventId: own.event.id,
        itemId: item.id,
        token,
        body: JPEG,
        slot,
      }),
    );
  }

  const read = async (): Promise<ItemSummary> => {
    const response = await request.get(`${BACKEND_URL}/events/${own.event.id}/items/${item.id}`, {
      headers: bearer(token),
    });
    expect(response.status()).toBe(200);
    return ((await response.json()) as { item: ItemSummary }).item;
  };

  // 1. La galería se publica en el orden de captura y la portada es la primera.
  expect((await read()).photos.map((photo) => photo.id)).toEqual(ids);

  // 2. Una permutación válida se aplica y sobrevive a una nueva lectura.
  const next = [ids[2], ids[0], ids[1]] as string[];
  const orderResponse = await request.put(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photos/order`,
    { headers: bearer(token), data: { photoIds: next } },
  );
  expect(orderResponse.status()).toBe(200);
  const ordered = (await orderResponse.json()) as { photos: { readonly id: string }[] };
  expect(ordered.photos.map((photo) => photo.id)).toEqual(next);
  expect((await read()).photos.map((photo) => photo.id)).toEqual(next);

  // 3. Un conjunto que ya no coincide responde `photo_order_mismatch` y no reordena nada.
  const mismatch = await request.put(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photos/order`,
    { headers: bearer(token), data: { photoIds: [ids[0], ids[1]] } },
  );
  expect(mismatch.status()).toBe(409);
  await expect(mismatch.json()).resolves.toEqual({ error: 'photo_order_mismatch' });
  expect((await read()).photos.map((photo) => photo.id)).toEqual(next);

  // 4. Una sola foto no se permuta: la frontera la rechaza.
  const single = await request.post(`${BACKEND_URL}/events/${own.event.id}/items`, {
    headers: bearer(token),
    data: { title: 'Lámpara' },
  });
  const singleItem = ((await single.json()) as CreatedItem).item;
  const singlePhoto = await attachCapture(request, {
    eventId: own.event.id,
    itemId: singleItem.id,
    token,
    body: JPEG,
  });
  const singleOrder = await request.put(
    `${BACKEND_URL}/events/${own.event.id}/items/${singleItem.id}/photos/order`,
    { headers: bearer(token), data: { photoIds: [singlePhoto] } },
  );
  expect(singleOrder.status()).toBe(400);
  await expect(singleOrder.json()).resolves.toEqual({ error: 'validation_failed' });

  // 5. Un artículo vendido tiene la galería congelada.
  const published = await request.post(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/listing`,
    { headers: bearer(token) },
  );
  expect(published.status()).toBe(201);

  const sold = await request.post(`${BACKEND_URL}/events/${own.event.id}/items/${item.id}/sold`, {
    headers: bearer(token),
  });
  expect(sold.status()).toBe(200);

  const frozenOrder = await request.put(
    `${BACKEND_URL}/events/${own.event.id}/items/${item.id}/photos/order`,
    { headers: bearer(token), data: { photoIds: [ids[0], ids[1], ids[2]] } },
  );
  expect(frozenOrder.status()).toBe(409);
  await expect(frozenOrder.json()).resolves.toEqual({ error: 'item_sold' });
});

test('the capture strip reorders two photos and attaches them in that order', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'the strip suite opens the private surface');

  const own = await eventWithSession(request, 'Cali', 'Medellín');

  await page.goto(`/invitacion?token=${encodeURIComponent(own.invitation.token)}`);
  await page.getByTestId('redeem-submit').click();
  await expect(page).toHaveURL(/\/inicio$/);

  // La primera foto entra por la cámara de la barra; la segunda, por `Elegir de la galería`.
  await page.setInputFiles('[data-testid="shell-photo-input"]', {
    name: 'uno.jpg',
    mimeType: 'image/jpeg',
    buffer: JPEG,
  });
  await expect(page).toHaveURL(/\/captura$/);

  await page.setInputFiles('[data-testid="item-photo-input"]', [
    { name: 'dos.jpg', mimeType: 'image/jpeg', buffer: JPEG },
    { name: 'tres.jpg', mimeType: 'image/jpeg', buffer: JPEG },
  ]);

  // 1. Contador por estado —ninguna subida todavía—, portada marcada y controles de orden por haber
  //    dos o más fotos.
  await expect(page.getByTestId('photo-gallery-count')).toHaveText('0 listas, 3 en el teléfono');
  await expect(page.getByTestId('photo-gallery-cover')).toBeVisible();
  await expect(page.getByTestId('photo-gallery-strip')).toBeVisible();
  await expect(page.getByTestId('photo-gallery-up-0')).toBeDisabled();
  await expect(page.getByTestId('photo-gallery-down-0')).toBeEnabled();

  // 2. Reordenar durante la captura: la portada pasa a la segunda miniatura.
  await page.getByTestId('photo-gallery-down-0').click();
  await expect(
    page.getByTestId('photo-gallery-item-0').getByTestId('photo-gallery-cover'),
  ).toHaveCount(1);

  await page.getByTestId('item-title-input').fill('Juego de comedor');

  // Desde 3f la captura adjunta **de a una**: tres fotos son tres peticiones, cada una con su `slot`.
  const attaches: { captures: { readonly slot: number }[] }[] = [];
  page.on('request', (candidate) => {
    if (candidate.method() === 'POST' && candidate.url().endsWith('/photos')) {
      attaches.push(
        JSON.parse(candidate.postData() ?? '{}') as { captures: { readonly slot: number }[] },
      );
    }
  });

  await page.getByTestId('item-form-save-only').click();
  await expect(page).toHaveURL(/\/capturados$/);

  // 3. La tira define el `slot` de cada captura: tres fotos, sin compartir posición.
  expect(attaches).toHaveLength(3);
  expect(attaches.every((body) => body.captures.length === 1)).toBe(true);
  expect(attaches.flatMap((body) => body.captures.map((capture) => capture.slot))).toEqual([
    0, 1, 2,
  ]);
  await expect(page.getByTestId('item-title')).toHaveText('Juego de comedor');

  // 4. El artículo quedó con las tres fotos y la portada es la primera del orden guardado.
  const list = await request.get(`${BACKEND_URL}/events/${own.event.id}/items`, {
    headers: bearer(own.session.sessionToken),
  });
  const items = ((await list.json()) as { items: readonly ItemSummary[] }).items;
  const stored = items.find((entry) => entry.title === 'Juego de comedor');
  expect(stored?.photos).toHaveLength(3);
});

/**
 * Evidencia del corte 3f (`plan-ciclo-3f` §7): un rechazo del almacén deja **una** foto señalada y
 * las demás subidas; el reintento manda los tres cuerpos de esa foto —los mismos bytes— y no vuelve a
 * enviar los de las otras. La publicación no espera a la foto que falló, pero sí exige la portada.
 */
test('a failed photo keeps its own state and retries without resending the others', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'the strip suite opens the private surface');

  const own = await eventWithSession(request, 'Cúcuta', 'Bucaramanga');

  await page.goto(`/invitacion?token=${encodeURIComponent(own.invitation.token)}`);
  await page.getByTestId('redeem-submit').click();
  await expect(page).toHaveURL(/\/inicio$/);

  // Cada cuerpo que viaja se cuenta: es la prueba de que las fotos ya subidas no se reenvían.
  const puts: string[] = [];
  page.on('request', (candidate) => {
    if (candidate.method() === 'PUT' && candidate.url().includes(`${FAKE_PUT_PATH}?token=`)) {
      puts.push(candidate.url());
    }
  });

  // El fallo se inyecta en la **segunda** foto: se dejan pasar los tres cuerpos de la primera y se
  // abortan los tres de la segunda. Las variantes de una foto viajan en paralelo y las fotos se
  // adjuntan de a una, así que el conteo es determinista.
  let passed = 3;
  let aborted = 3;
  await page.route(
    (url) => url.pathname.includes(FAKE_PUT_PATH),
    async (route) => {
      if (passed > 0) {
        passed -= 1;
        await route.continue();
        return;
      }

      if (aborted > 0) {
        aborted -= 1;
        await route.abort('failed');
        return;
      }

      await route.continue();
    },
  );

  await page.setInputFiles('[data-testid="shell-photo-input"]', fileOf('uno.jpg'));
  await expect(page).toHaveURL(/\/captura$/);
  await page.setInputFiles('[data-testid="item-photo-input"]', [
    fileOf('dos.jpg'),
    fileOf('tres.jpg'),
  ]);

  // La tira nombra el estado de cada foto y no un porcentaje de la galería.
  await expect(page.getByTestId('photo-gallery-count')).toHaveText('0 listas, 3 en el teléfono');
  await page.getByTestId('item-title-input').fill('Juego de sala');

  await page.getByTestId('item-form-publish').click();

  // 1. La segunda queda `No subió` con su `Reintentar`; las otras dos, `Subida`.
  await expect(page.getByTestId('photo-gallery-state-0')).toHaveText('Subida');
  await expect(page.getByTestId('photo-gallery-state-1')).toHaveText('No subió');
  await expect(page.getByTestId('photo-gallery-state-2')).toHaveText('Subida');
  await expect(page.getByTestId('photo-gallery-retry-1')).toBeVisible();
  await expect(page.getByTestId('photo-gallery-retry-0')).toHaveCount(0);
  await expect(page.getByTestId('photo-gallery-retry-2')).toHaveCount(0);
  await expect(page.getByTestId('photo-gallery-count')).toHaveText('2 listas, 1 en el teléfono');

  // 2. El fallo no navega ni cierra la sesión: vive en la foto, dentro del panel.
  await expect(page).toHaveURL(/\/captura$/);
  await expect(page.getByTestId('shell-nav-capture')).toBeVisible();

  // 3. La portada subió, así que la publicación se completó aunque falte la segunda foto.
  await expect(page.getByTestId('item-form-photo-notice')).toContainText('publicó');
  await expect.poll(() => puts.length).toBe(9);

  const listed = await request.get(`${BACKEND_URL}/events/${own.event.id}/items`, {
    headers: bearer(own.session.sessionToken),
  });
  const published = ((await listed.json()) as { items: readonly ItemSummary[] }).items.find(
    (entry) => entry.title === 'Juego de sala',
  );
  expect(published?.publishedSlug).not.toBeNull();
  expect(published?.photos).toHaveLength(2);

  // 4. Reintentar manda **solo** los tres cuerpos de la foto que falló.
  await page.getByTestId('photo-gallery-retry-1').click();
  await expect(page).toHaveURL(/\/capturados$/);
  expect(puts).toHaveLength(12);

  // 5. El reintento completa la galería del artículo, sin republicar nada.
  const reread = await request.get(`${BACKEND_URL}/events/${own.event.id}/items`, {
    headers: bearer(own.session.sessionToken),
  });
  const complete = ((await reread.json()) as { items: readonly ItemSummary[] }).items.find(
    (entry) => entry.title === 'Juego de sala',
  );
  expect(complete?.photos).toHaveLength(3);

  // 6. El fallo no viaja con la sesión: en el aterrizaje no hay nada que reintentar.
  await page.goto('/inicio');
  await expect(page.getByTestId('inicio-card')).toBeVisible();
  await expect(page.getByText('No subió')).toHaveCount(0);
});

/**
 * La otra mitad de la regla de `plan-ciclo-3f` §5: **publicar exige la portada subida**, porque la
 * miniatura de la lista y la ficha pública leen la posición 0. El fallo se queda en la foto y el
 * artículo ya creado no se pierde: reintentar la portada publica.
 */
test('publishing waits for the cover, and retrying it publishes', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'frontend', 'the strip suite opens the private surface');

  const own = await eventWithSession(request, 'Ibagué', 'Armenia');

  await page.goto(`/invitacion?token=${encodeURIComponent(own.invitation.token)}`);
  await page.getByTestId('redeem-submit').click();
  await expect(page).toHaveURL(/\/inicio$/);

  const listings: string[] = [];
  page.on('request', (candidate) => {
    if (candidate.method() === 'POST' && candidate.url().endsWith('/listing')) {
      listings.push(candidate.url());
    }
  });

  // La portada es la primera foto: se abortan sus tres variantes y se dejan pasar las demás.
  let aborted = 3;
  await page.route(
    (url) => url.pathname.includes(FAKE_PUT_PATH),
    async (route) => {
      if (aborted > 0) {
        aborted -= 1;
        await route.abort('failed');
        return;
      }

      await route.continue();
    },
  );

  await page.setInputFiles('[data-testid="shell-photo-input"]', fileOf('uno.jpg'));
  await expect(page).toHaveURL(/\/captura$/);
  await page.setInputFiles('[data-testid="item-photo-input"]', [fileOf('dos.jpg')]);
  await page.getByTestId('item-title-input').fill('Mesa de centro');

  await page.getByTestId('item-form-publish').click();

  // Sin portada no hay publicación: la foto lo dice con todas las letras y la ficha se queda.
  await expect(page.getByTestId('photo-gallery-state-0')).toHaveText(
    'No subió: sin portada no se publica',
  );
  await expect(page.getByTestId('photo-gallery-state-1')).toHaveText('Subida');
  await expect(page.getByTestId('item-error')).toContainText('portada');
  await expect(page).toHaveURL(/\/captura$/);
  expect(listings).toHaveLength(0);

  // Reintentar la portada publica: el artículo ya existía y el reintento no lo vuelve a crear.
  await page.getByTestId('photo-gallery-retry-0').click();
  await expect(page).toHaveURL(/\/capturados$/);
  expect(listings).toHaveLength(1);
});
