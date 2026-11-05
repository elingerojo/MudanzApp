import { expect, type APIRequestContext } from '@playwright/test';
import type { AttachedPhotos, CaptureTicket, ItemPhotoVariant } from '@mudanzapp/shared';

import { BACKEND_URL } from './harness.js';

/**
 * La captura por el camino del ciclo 4g, compartida por las suites e2e.
 *
 * El navegador pide un **ticket**, sube cada variante por su URL prefirmada y **adjunta** la captura
 * al artículo. Ningún cuerpo de foto atraviesa el API: si una suite vuelve a llamar a una ruta de
 * subida propia, esta pieza es la que hay que cambiar, no cada spec.
 */

export interface CaptureVariant {
  readonly variant: ItemPhotoVariant;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Los tres tamaños que el codificador del dispositivo produce, con sus dimensiones reales. */
export const CAPTURE_VARIANTS: readonly CaptureVariant[] = [
  { variant: 'large', widthPx: 1_440, heightPx: 1_080 },
  { variant: 'medium', widthPx: 768, heightPx: 576 },
  { variant: 'thumb', widthPx: 320, heightPx: 240 },
];

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Pide el ticket: firma las tres escrituras y no recibe ningún byte. */
export async function openCapture(
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
 * Escribe una variante en el almacén por la URL del ticket. Devuelve el estado para que la suite que
 * prueba un rechazo pueda afirmarlo sin una segunda petición.
 */
export async function uploadCaptureVariant(
  request: APIRequestContext,
  ticket: CaptureTicket,
  variant: ItemPhotoVariant,
  body: Buffer,
): Promise<number> {
  const response = await request.put(`${BACKEND_URL}${ticket.uploads[variant].url}`, {
    headers: { 'Content-Type': ticket.contentType },
    data: body,
  });

  return response.status();
}

/** Adjunta la captura al artículo y devuelve el identificador de la foto. */
export async function attachCapture(
  request: APIRequestContext,
  input: {
    readonly eventId: string;
    readonly itemId: string;
    readonly token: string;
    readonly body: Buffer;
    readonly variants?: readonly CaptureVariant[];
    readonly contentType?: string;
  },
): Promise<string> {
  const variants = input.variants ?? CAPTURE_VARIANTS;
  const ticket = await openCapture(
    request,
    input.eventId,
    input.token,
    input.contentType ?? 'image/jpeg',
  );

  for (const variant of variants) {
    const status = await uploadCaptureVariant(request, ticket, variant.variant, input.body);
    expect(status).toBe(204);
  }

  const response = await request.post(
    `${BACKEND_URL}/events/${input.eventId}/items/${input.itemId}/photos`,
    {
      headers: { ...bearer(input.token), 'Content-Type': 'application/json' },
      data: {
        captures: [{ captureId: ticket.captureId, slot: 0, variants }],
      },
    },
  );

  expect(response.status()).toBe(200);

  const payload = (await response.json()) as AttachedPhotos;
  const photoId = payload.photos[0]?.id;
  expect(photoId).toBeDefined();

  return photoId ?? '';
}
