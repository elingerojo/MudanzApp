import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  ITEM_PHOTO_ENCODING,
  type CreatedEvent,
  type CreatedInvitation,
  type CreatedItem,
  type IssuedSession,
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

  // 1. La sesión entra por el enlace de invitación, como lo hace un co-dispositivo.
  await page.goto(`/invitacion?token=${encodeURIComponent(own.invitation.token)}`);
  await page.getByTestId('redeem-submit').click();
  await expect(page).toHaveURL(new RegExp(`/eventos/${own.event.id}$`));

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

  await page.getByTestId('item-title-input').fill('Sofá de tres puestos');
  await page.setInputFiles('[data-testid="item-photo-input"]', {
    name: 'sala.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(source.base64, 'base64'),
  });

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
  await expect(page.getByTestId('capture-saved')).toBeVisible();
  await page.getByTestId('capture-go-captured').click();

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
