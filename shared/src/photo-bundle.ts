import { z } from 'zod';

import { AI_DRAFT_LIMITS } from './ai.js';
import { ITEM_PHOTO_VARIANT_CONTENT_TYPES, type ItemPhotoVariantContentType } from './item.js';

/**
 * Framing del cuerpo del borrador: varias fotos en un solo cuerpo binario (`plan-ciclo-3i` §4).
 *
 * El sobre es el mismo en el navegador y en el borde, y por eso vive aquí y no en cada lado: una
 * segunda implementación del formato sería una segunda verdad del transporte.
 *
 * ```text
 * <uint32 BE headerLength><header JSON UTF-8><blob 1><blob 2>…
 * header = { "photos": [ { "contentType": "image/webp", "byteLength": 1234 }, … ] }
 * ```
 *
 * Tres reglas que este módulo no negocia:
 * - **el índice es el orden**: no se publica `position`, porque un segundo campo que dice lo mismo
 *   que el arreglo es una fuente duplicada (`plan-ciclo-3e` §4);
 * - **el decodificador no repara**: una cabecera corrupta, una suma que no cuadra o un byte sobrante
 *   fallan con un código estable en vez de adivinar qué quiso decir el emisor;
 * - **los topes son del contrato**, no del emisor: el duro de fotos y el de bytes se leen de
 *   [`AI_DRAFT_LIMITS`](ai.ts:20), y el nivel de onboarding no participa (`plan-ciclo-3i` §0).
 */

/** El tipo con el que viaja el cuerpo: no es una imagen, es el sobre. */
export const PHOTO_BUNDLE_CONTENT_TYPE = 'application/x-mudanzapp-photos';

/** Tope de la cabecera JSON: el sobre nunca crece, así que un exceso es un abuso, no un caso. */
export const PHOTO_BUNDLE_HEADER_BYTES = 1_024;

/** Una foto que entra al sobre: los bytes del codificador y el tipo que ese codificador produjo. */
export interface PhotoBundlePart {
  /** Se valida contra [`ITEM_PHOTO_VARIANT_CONTENT_TYPES`](item.ts:83) al codificar. */
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

/** Una foto que sale del sobre, ya con el tipo acotado al que el almacén admite. */
export interface PhotoBundlePhoto {
  readonly contentType: ItemPhotoVariantContentType;
  readonly bytes: Uint8Array;
}

/**
 * Motivos de rechazo. Los dos primeros hablan de la foto; el tercero, de la cantidad; el cuarto, del
 * sobre. La frontera los traduce a `photo_invalid` o `validation_failed` según el plan §4.
 */
export type PhotoBundleErrorCode = 'bundle_malformed' | 'bundle_photo_invalid' | 'bundle_too_large';

/** Fallo del framing, con código estable: el mensaje nunca es la evidencia que decide. */
export class PhotoBundleError extends Error {
  readonly code: PhotoBundleErrorCode;

  constructor(code: PhotoBundleErrorCode) {
    super(code);
    this.name = 'PhotoBundleError';
    this.code = code;
  }
}

/**
 * La cabecera, laxa en lo que se decide después: el tipo y la cantidad se juzgan con los topes del
 * contrato, y `byteLength` admite cero solo para poder rechazarlo con `bundle_photo_invalid` en vez de
 * confundirlo con una cabecera rota. `strictObject` en los dos niveles: una clave de más es un fallo.
 */
const photoBundleHeaderSchema = z.strictObject({
  photos: z.array(
    z.strictObject({
      contentType: z.string().min(1).max(64),
      byteLength: z.number().int().min(0).max(AI_DRAFT_LIMITS.bundleBytes),
    }),
  ),
});

/**
 * El sobre se escribe y se lee como ASCII: las claves del JSON y los tipos de la lista son ASCII, y
 * `shared` compila sin `DOM`, así que no hay `TextEncoder` —la misma razón que
 * [`pkce`](pkce.ts:105) documenta—. Un byte alto en la cabecera no puede parear un tipo admitido, así
 * que la frontera lo rechaza en vez de adivinar su codificación.
 */
function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function asciiText(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
}

function isVariantContentType(value: string): value is ItemPhotoVariantContentType {
  return (ITEM_PHOTO_VARIANT_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Compone el cuerpo: cabecera de longitud en big-endian y los blobs en el orden del arreglo.
 *
 * Falla ruidoso antes de tocar la red: una foto vacía, un tipo que el almacén no admite, una cantidad
 * fuera de `1..AI_DRAFT_LIMITS.photos` o un cuerpo sobre `bundleBytes` son errores del cliente.
 */
export function encodePhotoBundle(photos: readonly PhotoBundlePart[]): Uint8Array {
  if (photos.length < 1 || photos.length > AI_DRAFT_LIMITS.photos) {
    throw new PhotoBundleError('bundle_photo_invalid');
  }

  let totalBytes = 0;
  const entries = photos.map((photo) => {
    if (photo.bytes.byteLength === 0 || !isVariantContentType(photo.contentType)) {
      throw new PhotoBundleError('bundle_photo_invalid');
    }

    totalBytes += photo.bytes.byteLength;
    return { contentType: photo.contentType, byteLength: photo.bytes.byteLength };
  });

  const header = asciiBytes(JSON.stringify({ photos: entries }));
  if (header.byteLength > PHOTO_BUNDLE_HEADER_BYTES) {
    throw new PhotoBundleError('bundle_malformed');
  }

  const bodyBytes = 4 + header.byteLength + totalBytes;
  if (bodyBytes > AI_DRAFT_LIMITS.bundleBytes) {
    throw new PhotoBundleError('bundle_too_large');
  }

  const body = new Uint8Array(bodyBytes);
  new DataView(body.buffer).setUint32(0, header.byteLength, false);
  body.set(header, 4);

  let offset = 4 + header.byteLength;
  for (const photo of photos) {
    body.set(photo.bytes, offset);
    offset += photo.bytes.byteLength;
  }

  return body;
}

/**
 * Descompone el cuerpo y devuelve las fotos **en el orden del sobre**.
 *
 * Cada `bytes` es una vista sobre el cuerpo recibido, no una copia: quien necesite retenerla copia.
 * El decodificador rechaza la cabecera de más de 1 KiB, la cantidad fuera de `1..6`, la parte de
 * `byteLength` cero, el tipo no admitido, la suma que no cuadra con el total y los bytes sobrantes.
 */
export function decodePhotoBundle(body: Uint8Array): readonly PhotoBundlePhoto[] {
  if (body.byteLength > AI_DRAFT_LIMITS.bundleBytes) {
    throw new PhotoBundleError('bundle_too_large');
  }

  if (body.byteLength < 4) {
    throw new PhotoBundleError('bundle_malformed');
  }

  const headerLength = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(
    0,
    false,
  );

  if (headerLength === 0 || headerLength > PHOTO_BUNDLE_HEADER_BYTES) {
    throw new PhotoBundleError('bundle_malformed');
  }

  const payloadStart = 4 + headerLength;
  if (payloadStart > body.byteLength) {
    throw new PhotoBundleError('bundle_malformed');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(asciiText(body.subarray(4, payloadStart)));
  } catch {
    throw new PhotoBundleError('bundle_malformed');
  }

  const header = photoBundleHeaderSchema.safeParse(parsed);
  if (!header.success) {
    throw new PhotoBundleError('bundle_malformed');
  }

  const entries = header.data.photos;
  if (entries.length < 1 || entries.length > AI_DRAFT_LIMITS.photos) {
    throw new PhotoBundleError('bundle_photo_invalid');
  }

  const declaredBytes = entries.reduce((sum, entry) => sum + entry.byteLength, 0);
  if (payloadStart + declaredBytes !== body.byteLength) {
    throw new PhotoBundleError('bundle_malformed');
  }

  const photos: PhotoBundlePhoto[] = [];
  let offset = payloadStart;

  for (const entry of entries) {
    if (entry.byteLength === 0 || !isVariantContentType(entry.contentType)) {
      throw new PhotoBundleError('bundle_photo_invalid');
    }

    photos.push({
      contentType: entry.contentType,
      bytes: body.subarray(offset, offset + entry.byteLength),
    });
    offset += entry.byteLength;
  }

  return photos;
}
