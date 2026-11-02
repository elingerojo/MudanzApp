import { z } from 'zod';

import { PRICE_LIMITS } from './price.js';

/**
 * Contrato del corte de captura del ciclo 3a (`capture`, `resumen-funcional` §4), del corte de
 * optimización del ciclo 3c-optimizar y de la edición del ciclo 4b (`item-edit`).
 *
 * Un artículo es la ficha mínima que un co-dispositivo documenta desde el teléfono: título, nota y
 * medidas opcionales. La foto es una capacidad aparte y su lectura exige sesión del evento en este
 * corte, así que el contrato **no** publica una URL: entrega el identificador con el que el cliente
 * la pide (`decisiones` §26 revisará la lectura pública en `publish`).
 *
 * Desde 3c-optimizar la foto se guarda en **tres tamaños estándar** y el peso no viaja en ningún
 * contrato: la optimización ocurre en el dispositivo antes de la primera petición.
 */

/**
 * Tipos de imagen admitidos como **origen** de la captura. Se validan en el formulario, que es el
 * único que ve el archivo de la cámara; lo que viaja es la salida del codificador del dispositivo.
 */
export const ITEM_PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ItemPhotoContentType = (typeof ITEM_PHOTO_CONTENT_TYPES)[number];

/**
 * Límites del corte, en un solo lugar: el formulario los usa para rechazar antes de subir y la
 * frontera HTTP los vuelve a aplicar. Ninguno viaja al navegador como configuración de entorno.
 */
export const ITEM_LIMITS = {
  title: 120,
  note: 500,
  sideCm: 500,
  weightKg: 2_000,
  /** Tope del precio en centavos; el precio es nulo mientras el vendedor no lo fija. */
  priceCents: PRICE_LIMITS.cents,
  /**
   * Tope del **archivo de la cámara**, no de lo que se transmite: desde 3c-optimizar la original se
   * decodifica en el dispositivo y nunca sale de él. En la frontera solo es cordura de transporte.
   */
  photoBytes: 5 * 1024 * 1024,
} as const;

/** Las tres variantes estándar. Es la lista única del navegador, la frontera y el DDL. */
export const ITEM_PHOTO_VARIANTS = ['thumb', 'medium', 'large'] as const;
export type ItemPhotoVariant = (typeof ITEM_PHOTO_VARIANTS)[number];

/**
 * Tamaños estándar: ajustar aquí es ajustar el producto, no la lógica. `maxEdgePx` es el lado mayor
 * de la variante; **ningún tamaño recorta** y **ninguno amplía** la foto tomada.
 */
export const ITEM_PHOTO_SIZES = {
  thumb: { maxEdgePx: 320 },
  medium: { maxEdgePx: 768 },
  large: { maxEdgePx: 1_440 },
} as const;

/**
 * Cómo se codifica en el dispositivo: se arranca en `qualityStart` y solo se baja la calidad si el
 * resultado rebasa `targetBytes`. Es un **objetivo**, no una regla que alguien más verifique: ni el
 * borde, ni la base, ni la lectura lo comprueban.
 */
export const ITEM_PHOTO_ENCODING = {
  type: 'image/webp',
  fallbackType: 'image/jpeg',
  /** Calidad inicial de la codificación. */
  qualityStart: 0.8,
  /** Piso de calidad: no se baja más para no destruir la foto. */
  qualityFloor: 0.5,
  qualityStep: 0.05,
  /** Objetivo de peso por variante, en bytes. */
  targetBytes: 400 * 1024,
} as const;

/**
 * Tipos que puede tener una variante guardada: la salida del codificador del dispositivo. Es el
 * mismo conjunto que el `CHECK` de `app.item_photo_variant`, no el del origen de la captura.
 */
export const ITEM_PHOTO_VARIANT_CONTENT_TYPES = [
  ITEM_PHOTO_ENCODING.type,
  ITEM_PHOTO_ENCODING.fallbackType,
] as const;
export type ItemPhotoVariantContentType = (typeof ITEM_PHOTO_VARIANT_CONTENT_TYPES)[number];

const title = z.string().trim().min(1).max(ITEM_LIMITS.title);
const note = z.string().trim().max(ITEM_LIMITS.note);
const side = z.number().int().min(1).max(ITEM_LIMITS.sideCm);
const weightKg = z.number().positive().max(ITEM_LIMITS.weightKg);
const priceCents = z.number().int().min(0).max(ITEM_LIMITS.priceCents).nullable();

/**
 * `POST /events/:eventId/items`: ficha mínima del artículo. Las medidas son opcionales porque el
 * co-dispositivo documenta rápido y completa después; el objeto rechaza claves desconocidas para que
 * un campo nuevo no entre por la puerta de atrás.
 */
export const createItemSchema = z.strictObject({
  title,
  note: note.optional(),
  widthCm: side.optional(),
  heightCm: side.optional(),
  depthCm: side.optional(),
  weightKg: weightKg.optional(),
});

export type CreateItemRequest = z.infer<typeof createItemSchema>;

/**
 * `PATCH /events/:eventId/items/:itemId` (ciclo 4b): corrige la ficha y fija el precio. Todos los
 * campos son opcionales, pero la petición lleva al menos uno; `null` limpia la nota, una medida o el
 * precio. El título no puede quedar vacío y el `slug` publicado no se toca (decisión §31).
 */
export const updateItemSchema = z
  .strictObject({
    title: title.optional(),
    note: note.nullable().optional(),
    widthCm: side.nullable().optional(),
    heightCm: side.nullable().optional(),
    depthCm: side.nullable().optional(),
    weightKg: weightKg.nullable().optional(),
    priceCents: priceCents.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  });

export type UpdateItemRequest = z.infer<typeof updateItemSchema>;

/** Nombre de la variante que pide o sube el cliente. */
export const photoVariantSchema = z.enum(ITEM_PHOTO_VARIANTS);

/**
 * `PUT /events/:eventId/items/:itemId/photo?variant=&w=&h=`: la variante pedida y las dimensiones
 * **reales** del cuerpo que viaja. Los tres parámetros llegan como cadena de la URL y se acotan con
 * el tamaño de su propia variante; el borde los vuelve a juzgar en el dominio, porque la frontera no
 * es la regla de dominio (`modelo-datos` §8). El peso no se declara ni se juzga.
 */
export const photoVariantUploadSchema = z
  .strictObject({
    variant: photoVariantSchema,
    w: z.coerce.number().int().positive(),
    h: z.coerce.number().int().positive(),
  })
  .refine((value) => Math.max(value.w, value.h) <= ITEM_PHOTO_SIZES[value.variant].maxEdgePx, {
    message: 'dimensions exceed the variant size',
    path: ['w'],
  });

export type PhotoVariantUpload = z.infer<typeof photoVariantUploadSchema>;

/**
 * Dimensiones reales de un tamaño. `0` en ambos lados significa «no declaradas»: solo aparece en
 * fotos anteriores a 3c-optimizar, que no tienen tabla de variantes y se sirven por la caída
 * heredada. El navegador no reserva caja en ese caso, porque inventarla sería peor que no tenerla.
 */
export interface PhotoSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * Foto almacenada; `id` es la dirección estable, nunca el `object_key` del almacén. Un tamaño
 * ausente es `null`, no un objeto vacío, y el peso no se persiste: no hay nada que leer.
 */
export interface ItemPhoto {
  readonly id: string;
  readonly sizes: Readonly<Record<ItemPhotoVariant, PhotoSize | null>>;
}

/**
 * Artículo tal como lo lee la superficie privada.
 *
 * `photo` es `null` mientras no se subió. `publishedSlug` es `null` mientras el artículo no está
 * publicado y, cuando existe, es la dirección pública con la que se comparte: se lee de
 * `app.listing`, no de la memoria de la visita, así que recargar no lo pierde
 * (`plan-ciclo-3d` §5).
 */
export interface ItemSummary {
  readonly id: string;
  readonly eventId: string;
  readonly title: string;
  readonly note: string | null;
  readonly widthCm: number | null;
  readonly heightCm: number | null;
  readonly depthCm: number | null;
  readonly weightKg: number | null;
  /** Precio en centavos de la moneda del evento; `null` mientras el vendedor no lo fija. */
  readonly priceCents: number | null;
  /** Instante de la venta; `null` mientras el artículo no está vendido (ciclo 4b, §40). */
  readonly soldAt: string | null;
  readonly photo: ItemPhoto | null;
  readonly publishedSlug: string | null;
  readonly createdAt: string;
}

export interface CreatedItem {
  readonly item: ItemSummary;
}

/** Respuesta de `PATCH` y de la venta: el artículo ya con su estado nuevo. */
export interface UpdatedItem {
  readonly item: ItemSummary;
}

export interface ItemList {
  readonly items: readonly ItemSummary[];
}
