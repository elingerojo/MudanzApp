import { z } from 'zod';

/**
 * Contrato del corte de captura del ciclo 3a (`capture`, `resumen-funcional` §4).
 *
 * Un artículo es la ficha mínima que un co-dispositivo documenta desde el teléfono: título, nota y
 * medidas opcionales. La foto es una capacidad aparte y su lectura exige sesión del evento en este
 * corte, así que el contrato **no** publica una URL: entrega el identificador con el que el cliente
 * la pide (`decisiones` §26 revisará la lectura pública en `publish`).
 */

/** Tipos de imagen admitidos. Se validan los tres: subida, almacén y lectura. */
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
  photoBytes: 5 * 1024 * 1024,
} as const;

const title = z.string().trim().min(1).max(ITEM_LIMITS.title);
const note = z.string().trim().max(ITEM_LIMITS.note);
const side = z.number().int().min(1).max(ITEM_LIMITS.sideCm);
const weightKg = z.number().positive().max(ITEM_LIMITS.weightKg);

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

/** Foto almacenada; `id` es la dirección estable, nunca el `object_key` del almacén. */
export interface ItemPhoto {
  readonly id: string;
  readonly contentType: ItemPhotoContentType;
  readonly byteSize: number;
}

/** Artículo tal como lo lee la superficie privada. `photo` es `null` mientras no se subió. */
export interface ItemSummary {
  readonly id: string;
  readonly eventId: string;
  readonly title: string;
  readonly note: string | null;
  readonly widthCm: number | null;
  readonly heightCm: number | null;
  readonly depthCm: number | null;
  readonly weightKg: number | null;
  readonly photo: ItemPhoto | null;
  readonly createdAt: string;
}

export interface CreatedItem {
  readonly item: ItemSummary;
}

export interface ItemList {
  readonly items: readonly ItemSummary[];
}
