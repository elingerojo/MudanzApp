import {
  ITEM_PHOTO_SIZES,
  ITEM_PHOTO_VARIANTS,
  ITEM_PHOTO_VARIANT_CONTENT_TYPES,
  type CreateItemRequest,
  type ItemPhotoVariant,
  type ItemPhotoVariantContentType,
  type PhotoSize,
} from '@mudanzapp/shared';

/**
 * Núcleo puro del artículo (ciclo 3a, `capture`; revisado por 3c-optimizar).
 *
 * No conoce HTTP, base de datos, reloj ni red (`03` §3): recibe la petición ya validada por la
 * frontera y devuelve la forma que el almacén escribe, o un veredicto sobre una foto. Los límites
 * viven en `shared` porque el formulario los usa para rechazar antes de subir; aquí se vuelven a
 * aplicar, porque la frontera no es la regla de dominio (`modelo-datos` §8).
 *
 * Hechos que implementa, con su fuente:
 * - la ficha mínima es título, nota y medidas opcionales; la nota vacía es ausencia, no una cadena
 *   vacía (`resumen-funcional` §4, `capture`);
 * - una variante solo se acepta con la salida del codificador del dispositivo, con dimensiones
 *   positivas y dentro del lado mayor de **su** tamaño; el peso no se juzga (`plan-ciclo-3c-optimizar`
 *   §3 y §4).
 */

/** Ficha lista para escribir: la nota ausente es `null`, nunca `''`. */
export interface ItemDraft {
  readonly title: string;
  readonly note: string | null;
  readonly widthCm: number | null;
  readonly heightCm: number | null;
  readonly depthCm: number | null;
  readonly weightKg: number | null;
}

/**
 * Normaliza lo que la frontera ya validó. El `trim` del título se repite aquí a propósito: la regla
 * «un título vacío no es un título» es del dominio, y el esquema solo acota la forma.
 */
export function normalizeItemDraft(input: CreateItemRequest): ItemDraft {
  const note = input.note ?? null;

  return {
    title: input.title.trim(),
    note: note === null || note.length === 0 ? null : note,
    widthCm: input.widthCm ?? null,
    heightCm: input.heightCm ?? null,
    depthCm: input.depthCm ?? null,
    weightKg: input.weightKg ?? null,
  };
}

/**
 * Veredicto sobre una variante recibida: el tipo debe ser la salida del codificador, las dimensiones
 * ser positivas y el lado mayor no superar el de esa variante. Se comprueba en el borde, antes de
 * tocar el almacén, para que un archivo rechazado no deje objeto huérfano.
 *
 * **El peso no se juzga**: no hay presupuesto en el borde. El objetivo de 400 KB es del codificador
 * del dispositivo (decisión §33) y una variante más pesada entra igual.
 */
export function isAcceptedVariant(
  variant: ItemPhotoVariant,
  contentType: string,
  widthPx: number,
  heightPx: number,
): boolean {
  if (photoVariantContentType(contentType) === null) {
    return false;
  }

  if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx)) {
    return false;
  }

  if (widthPx <= 0 || heightPx <= 0) {
    return false;
  }

  return Math.max(widthPx, heightPx) <= ITEM_PHOTO_SIZES[variant].maxEdgePx;
}

/** Estrecha el tipo de una variante ya aceptada; evita un `cast` en el borde. */
export function photoVariantContentType(contentType: string): ItemPhotoVariantContentType | null {
  const found = ITEM_PHOTO_VARIANT_CONTENT_TYPES.find((candidate) => candidate === contentType);
  return found ?? null;
}

/**
 * ¿Están las tres variantes? Es la regla de publicar: un artículo con una foto heredada —sin tabla de
 * variantes— no puede publicarse por primera vez, porque la ficha se comparte por sus tamaños.
 */
export function hasEveryVariant(
  sizes: Readonly<Partial<Record<ItemPhotoVariant, PhotoSize | null>>> | null,
): boolean {
  if (sizes === null) {
    return false;
  }

  return ITEM_PHOTO_VARIANTS.every((variant) => (sizes[variant] ?? null) !== null);
}
