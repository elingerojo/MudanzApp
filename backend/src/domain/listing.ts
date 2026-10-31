import { LISTING_LIMITS } from '@mudanzapp/shared';

/**
 * Núcleo puro de la publicación (ciclo 3c, `publish`).
 *
 * No conoce HTTP, base de datos, reloj ni almacén (`03` §3): recibe el título ya validado y el
 * `itemId` que la base asignó, y devuelve el `slug` con el que se publica. El `slug` es determinista
 * para el mismo par (título, artículo), de modo que republicar devuelve la misma URL.
 *
 * Hechos que implementa, con su fuente (`plan-ciclo-3c` §3):
 * - el `slug` se deriva del título y **no** es editable: un cambio de título no cambia la URL
 *   publicada;
 * - seis caracteres del `itemId` desempatan dos títulos idénticos, así que la unicidad no depende de
 *   que el título lo sea;
 * - el resultado siempre cabe en `LISTING_LIMITS.slug` y cumple `LISTING_SLUG_PATTERN`, que es lo
 *   mismo que exige el `CHECK` de la tabla.
 */

/** Recorte del título que se convierte en palabras del `slug`; el resto se descarta. */
const MAX_TITLE_PART = 120;

/** Caracteres del `itemId` que desempatan; seis hexadecimales son suficientes y legibles. */
const SUFFIX_LENGTH = 6;

/**
 * Palabra de reserva cuando el título no aporta ningún carácter alfanumérico —por ejemplo, un título
 * escrito en un alfabeto que el `slug` no admite—. Sin ella, el `slug` empezaría por guion y no
 * cumpliría el patrón.
 */
const FALLBACK_BASE = 'articulo';

/** Un espacio entre la base y el sufijo. */
const JOIN_LENGTH = 1;

/**
 * Convierte un título en la base del `slug`: minúsculas, sin acentos, separadores colapsados a un
 * guion y recorte a `MAX_TITLE_PART`. La descomposición `NFD` más la eliminación de diacríticos es lo
 * que hace que «Sillón» y «Sillon» produzcan la misma base.
 */
export function slugifyTitle(title: string): string {
  const ascii = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  return ascii.slice(0, MAX_TITLE_PART).replace(/^-+|-+$/g, '');
}

/**
 * `slug` público del artículo: base derivada del título más seis caracteres del `itemId`.
 *
 * El sufijo se rellena con ceros si el identificador no aporta seis caracteres utilizables, para que
 * la forma del `slug` no dependa de cómo llegue el identificador.
 */
export function listingSlug(title: string, itemId: string): string {
  const digits = itemId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, SUFFIX_LENGTH)
    .padEnd(SUFFIX_LENGTH, '0');

  const maxBase = LISTING_LIMITS.slug - SUFFIX_LENGTH - JOIN_LENGTH;
  const base = (slugifyTitle(title) || FALLBACK_BASE).slice(0, maxBase).replace(/-+$/g, '');

  return `${base}-${digits}`;
}
