import {
  EVENT_SLUG_RETRY_SUFFIX_LENGTH,
  EVENT_SLUG_SUFFIX_LENGTH,
  deriveEventPublicSlug,
} from '@mudanzapp/shared';

/**
 * Núcleo puro del identificador público del evento (ciclo 4a, `event-index`).
 *
 * No conoce HTTP, base de datos ni reloj (`03` §3). La derivación vive en `shared` porque es la
 * misma regla que el concepto público necesita para validar la URL; aquí solo se fijan los dos
 * largos de sufijo que este borde usa.
 *
 * Hechos que implementa, con su fuente (decisión §36):
 * - el `public_slug` se emite al crear el evento y **no se reescribe**: es un identificador público
 *   permanente y la URL que alguien ya compartió no cambia;
 * - seis caracteres del `eventId` desempatan dos trayectos con las mismas ciudades;
 * - si el índice único rechaza la primera forma, el reintento usa ocho caracteres del mismo
 *   identificador antes de aceptar el fallo.
 */

/** `public_slug` de la primera emisión: ciudades más seis caracteres del identificador. */
export function eventPublicSlug(
  originCity: string,
  destinationCity: string,
  eventId: string,
): string {
  return deriveEventPublicSlug(originCity, destinationCity, eventId, EVENT_SLUG_SUFFIX_LENGTH);
}

/** Reintento ante colisión del índice único: ocho caracteres del identificador. */
export function eventPublicSlugRetry(
  originCity: string,
  destinationCity: string,
  eventId: string,
): string {
  return deriveEventPublicSlug(
    originCity,
    destinationCity,
    eventId,
    EVENT_SLUG_RETRY_SUFFIX_LENGTH,
  );
}
