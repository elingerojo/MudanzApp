import {
  ITEM_LIMITS,
  ITEM_PHOTO_CONTENT_TYPES,
  type CreateItemRequest,
  type ItemPhotoContentType,
} from '@mudanzapp/shared';

/**
 * Núcleo puro del artículo (ciclo 3a, `capture`).
 *
 * No conoce HTTP, base de datos, reloj ni red (`03` §3): recibe la petición ya validada por la
 * frontera y devuelve la forma que el almacén escribe, o un veredicto sobre una foto. Los límites
 * viven en `shared` porque el formulario los usa para rechazar antes de subir; aquí se vuelven a
 * aplicar, porque la frontera no es la regla de dominio (`modelo-datos` §8).
 *
 * Hechos que implementa, con su fuente:
 * - la ficha mínima es título, nota y medidas opcionales; la nota vacía es ausencia, no una cadena
 *   vacía (`resumen-funcional` §4, `capture`);
 * - la foto solo se acepta en los tres tipos declarados y por debajo del límite del corte.
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
 * Veredicto sobre una foto recibida: el tipo debe estar declarado y el tamaño ser positivo y no
 * superar el límite. Se comprueba en el borde, antes de tocar el almacén, para que un archivo
 * rechazado no deje objeto huérfano.
 */
export function isSupportedPhoto(contentType: string, byteSize: number): boolean {
  if (byteSize <= 0 || byteSize > ITEM_LIMITS.photoBytes) {
    return false;
  }

  return (ITEM_PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType);
}

/** Estrecha un tipo ya aceptado por `isSupportedPhoto`; evita un `cast` en el borde. */
export function photoContentType(contentType: string): ItemPhotoContentType | null {
  const found = ITEM_PHOTO_CONTENT_TYPES.find((candidate) => candidate === contentType);
  return found ?? null;
}
