import { z } from 'zod';

import {
  ITEM_PHOTO_SIZES,
  ITEM_PHOTO_VARIANTS,
  ITEM_PHOTO_VARIANT_CONTENT_TYPES,
  photoVariantSchema,
  type ItemPhoto,
  type ItemPhotoVariant,
  type ItemPhotoVariantContentType,
} from './item.js';

/**
 * Contrato del ticket de captura, de la adjunción de la foto al artículo (ciclo 4g, `direct-upload`)
 * y del orden de la galería privada (ciclo 3e, `gallery`).
 *
 * El navegador no manda bytes al backend: pide un **ticket** con una URL prefirmada por variante, sube
 * `thumb`, `medium` y `large` al almacén y, cuando las tres existen, **adjunta** la captura al
 * artículo. El borde verifica cada objeto con `HEAD`, lo copia a su clave definitiva y escribe las
 * filas; el objeto de staging se borra.
 *
 * Cuatro reglas que este módulo no negocia:
 * - **nada se escribe en el almacén antes de que el humano decida**; el ticket solo firma una
 *   intención y no toca el bucket;
 * - una captura es **una** fotografía con sus tres variantes, así que la galería de 3e es «varias
 *   capturas» y no un cambio de contrato;
 * - el **orden es el arreglo**: no se publica `position`, porque un segundo campo que dice lo mismo
 *   que el índice es una fuente duplicada;
 * - las dimensiones las declara el cliente, igual que antes de 4g, y el borde las acota con
 *   `ITEM_PHOTO_SIZES`; el peso real lo pone el `HEAD`, no el cliente.
 */

/** Límites del corte, en un solo lugar: el borde, el formulario y las pruebas usan los mismos números. */
export const CAPTURE_LIMITS = {
  /** Vida del ticket y de sus URL prefirmadas; quien se tarda vuelve a pedir uno. */
  ttlSeconds: 15 * 60,
  /** Fotos por artículo y, por tanto, capturas por adjunción; es el tope de la galería de 3e. */
  photos: 6,
} as const;

/** Segmento del staging: lo que vive bajo `<eventId>/captures/` es candidato a barrido por edad. */
export const CAPTURE_KEY_SEGMENT = 'captures';

/** Prefijo común de las claves de staging de un evento. */
export function captureKeyPrefix(eventId: string): string {
  return `${eventId}/${CAPTURE_KEY_SEGMENT}/`;
}

/**
 * Clave de staging de una variante: `<eventId>/captures/<captureId>/<variant>`.
 *
 * La deriva el servidor y la vuelve a derivar al adjuntar, así que el cliente **no** transporta
 * claves: solo el `captureId`. El `captureId` es un `uuid` que el propio borde generó, y el prefijo
 * ata el objeto a su evento.
 */
export function captureObjectKey(
  eventId: string,
  captureId: string,
  variant: ItemPhotoVariant,
): string {
  return `${captureKeyPrefix(eventId)}${captureId}/${variant}`;
}

/**
 * `POST /events/:eventId/captures`: el tipo de la salida del codificador que se va a firmar.
 *
 * Se declara en el ticket y no en cada `PUT` porque una variante se firma con su `Content-Type`, y un
 * cliente que mandara otro tipo vería el `403` de la firma: una sola fuente para el tipo.
 */
export const captureTicketRequestSchema = z.strictObject({
  contentType: z.enum(ITEM_PHOTO_VARIANT_CONTENT_TYPES),
});

export type CaptureTicketRequest = z.infer<typeof captureTicketRequestSchema>;

/** Una URL prefirmada y la clave que nombra al objeto que se escribirá con ella. */
export interface CaptureUploadUrl {
  readonly url: string;
  readonly key: string;
}

/**
 * Respuesta de `POST /events/:eventId/captures`.
 *
 * `url` es absoluta contra el almacén en `live` y **relativa al API** en `fake`; el cliente la
 * resuelve contra la base del API, así el doble no necesita conocer el host.
 */
export interface CaptureTicket {
  readonly captureId: string;
  readonly expiresAt: string;
  readonly contentType: ItemPhotoVariantContentType;
  readonly uploads: Readonly<Record<ItemPhotoVariant, CaptureUploadUrl>>;
}

const captureVariantDims = z.strictObject({
  variant: photoVariantSchema,
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
});

/**
 * `POST /events/:eventId/items/:itemId/photos`: adjunta una o varias capturas al artículo.
 *
 * Nace con **arreglo** y con `slot` aunque hoy se mande un solo elemento, porque 3e (varias fotos)
 * no puede permitirse un segundo cambio de contrato: `slot` es la `position` que el modelo ya admite.
 * Exige las tres variantes de cada captura y que ninguna exceda el lado mayor de su tamaño; el tipo y
 * el peso real se comprueban después, con el `HEAD` del objeto.
 */
export const attachPhotosSchema = z
  .strictObject({
    captures: z
      .array(
        z.strictObject({
          captureId: z.uuid(),
          slot: z
            .number()
            .int()
            .min(0)
            .max(CAPTURE_LIMITS.photos - 1),
          variants: z.array(captureVariantDims).length(ITEM_PHOTO_VARIANTS.length),
        }),
      )
      .min(1)
      .max(CAPTURE_LIMITS.photos),
  })
  .refine(
    (value) =>
      value.captures.every((capture) =>
        capture.variants.every(
          (variant) =>
            Math.max(variant.widthPx, variant.heightPx) <=
            ITEM_PHOTO_SIZES[variant.variant].maxEdgePx,
        ),
      ),
    { message: 'dimensions exceed the variant size', path: ['captures'] },
  )
  .refine(
    (value) =>
      value.captures.every(
        (capture) =>
          new Set(capture.variants.map((variant) => variant.variant)).size ===
          ITEM_PHOTO_VARIANTS.length,
      ),
    { message: 'every capture needs its three variants', path: ['captures'] },
  )
  .refine(
    (value) =>
      new Set(value.captures.map((capture) => capture.captureId)).size === value.captures.length,
    { message: 'a capture appears twice', path: ['captures'] },
  )
  .refine(
    (value) =>
      new Set(value.captures.map((capture) => capture.slot)).size === value.captures.length,
    { message: 'two captures share a slot', path: ['captures'] },
  );

export type CaptureVariantDims = z.infer<typeof captureVariantDims>;

export type CaptureAttach = z.infer<typeof attachPhotosSchema>['captures'][number];

export type AttachPhotosRequest = z.infer<typeof attachPhotosSchema>;

/**
 * Respuesta de la adjunción y del nuevo orden: las fotos ya con su dirección estable, en el orden
 * recibido.
 *
 * Es la misma forma en las dos rutas —adjuntar y reordenar—, porque ambas devuelven la galería tal
 * como quedó y una segunda forma para el mismo hecho sería una fuente duplicada. Es un arreglo desde
 * el primer día aunque la adjunción mande una sola captura.
 */
export interface AttachedPhotos {
  readonly photos: readonly ItemPhoto[];
}

/**
 * `PUT /events/:eventId/items/:itemId/photos/order`: la galería completa, ya permutada.
 *
 * Exige **dos fotos o más**: una permutación de una sola foto es un no-op y se rechaza en la frontera
 * (`plan-ciclo-3e` §4). Los identificadores no se repiten y son exactamente los del artículo; un
 * conjunto que ya no coincide responde `photo_order_mismatch` y no reordena nada.
 */
export const photoOrderSchema = z.strictObject({
  photoIds: z
    .array(z.uuid())
    .min(2)
    .max(CAPTURE_LIMITS.photos)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'a photo appears twice' }),
});

export type PhotoOrderRequest = z.infer<typeof photoOrderSchema>;
