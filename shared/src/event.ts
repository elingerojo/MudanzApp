import { z } from 'zod';

import { cardModel, type EventCardEntry } from './card.js';
import { LISTING_LIMITS, LISTING_SLUG_PATTERN } from './listing.js';

/**
 * Contrato del índice público del evento (ciclo 4a, `event-index`).
 *
 * Decisión §36: `app.event.public_slug` se emite al crear el evento, existe **antes** de que haya
 * artículos y no se reescribe. La ruta es `/evento/<slug>` en `shop` y el contrato no publica
 * `eventId`, `itemId` ni `object_key` (`decisiones` §24): la autorización vive en la escritura y el
 * borde público solo publica hechos públicos.
 *
 * La única pieza que la caché necesita para saber si su copia sigue viva es `version`: un hash de
 * **exactamente** los campos que la tarjeta pinta. Si incluyera un campo que la tarjeta no muestra,
 * cada edición reescribiría la página pública; si omitiera uno que sí pinta, la tarjeta quedaría
 * vieja y en silencio (`plan-ciclo-4a` §10).
 */

/** Caracteres del `eventId` que desempatan en la primera emisión. */
export const EVENT_SLUG_SUFFIX_LENGTH = 6;

/** Caracteres del `eventId` en el reintento, cuando el índice único rechaza la primera forma. */
export const EVENT_SLUG_RETRY_SUFFIX_LENGTH = 8;

/** Palabra de reserva cuando las ciudades no aportan ningún carácter admisible. */
const FALLBACK_BASE = 'evento';

/**
 * Parámetro de la ruta pública. Mismo patrón y mismo límite que el `slug` del artículo: un `slug`
 * que no cumple el patrón y uno que no existe responden lo mismo (`not_found`, §24).
 */
export const eventPublicSlugSchema = z
  .string()
  .min(3)
  .max(LISTING_LIMITS.slug)
  .regex(new RegExp(LISTING_SLUG_PATTERN));

/**
 * Base de `slug` de un texto: minúsculas, sin acentos, separadores colapsados a un guion y recorte.
 *
 * Es la **misma** regla que `slugifyTitle` del `slug` del artículo; vive aquí para que la derivación
 * del evento no dependa del backend y las dos formas no puedan separarse (`plan-ciclo-4a` §6).
 */
export function slugBase(text: string, maxLength: number): string {
  const ascii = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  return ascii.slice(0, maxLength).replace(/^-+|-+$/g, '');
}

/** Caracteres utilizables del identificador, rellenados con ceros para que la forma no dependa de él. */
function identifierSuffix(eventId: string, length: number): string {
  return eventId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, length)
    .padEnd(length, '0');
}

/**
 * `publicSlug` del evento: las dos ciudades más los caracteres del `eventId`.
 *
 * Función **pura**: no consulta la base ni conoce HTTP. El resultado siempre cumple
 * `eventPublicSlugSchema` y cabe en `LISTING_LIMITS.slug`, que es lo que exige el `CHECK` de
 * `app.event.public_slug`.
 */
export function deriveEventPublicSlug(
  originCity: string,
  destinationCity: string,
  eventId: string,
  suffixLength: number = EVENT_SLUG_SUFFIX_LENGTH,
): string {
  const suffix = identifierSuffix(eventId, suffixLength);
  const maxBase = LISTING_LIMITS.slug - suffix.length - 1;
  const base = (slugBase(`${originCity}-${destinationCity}`, maxBase) || FALLBACK_BASE)
    .slice(0, maxBase)
    .replace(/-+$/g, '');

  return `${base}-${suffix}`;
}

/** El evento tal como lo publica el índice: sin identificador interno. */
export interface PublicEventIndexEvent {
  readonly publicSlug: string;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly currency: string;
}

/** `GET /public/events/:publicSlug`: el evento, sus tarjetas y la clave de versión. */
export interface PublicEventIndex {
  readonly version: string;
  readonly event: PublicEventIndexEvent;
  readonly listings: readonly EventCardEntry[];
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * FNV-1a de 64 bits sobre las unidades UTF-16 del texto.
 *
 * Se implementa aquí y no se importa una biblioteca porque la clave debe salir **igual** en el
 * backend y en la prueba, sin depender de `Intl` ni de la plataforma. 16 hex son de sobra para
 * distinguir dos versiones del mismo evento.
 */
function hash(text: string): string {
  let value = FNV_OFFSET;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    value ^= BigInt(code & 0xff);
    value = (value * FNV_PRIME) & MASK_64;
    value ^= BigInt(code >> 8);
    value = (value * FNV_PRIME) & MASK_64;
  }

  return value.toString(16).padStart(16, '0');
}

/**
 * Clave del snapshot: hashea lo que la tarjeta pinta —ciudades de la cabecera, y por cada tarjeta su
 * `slug` (el `href`), su título ya recortado, su etiqueta de publicación y los descriptores de la
 * imagen—.
 *
 * **No** entran `currency`, `note`, `weightKg`, las medidas ni el orden de llegada de la base más
 * allá del orden publicado (`published_at DESC, id`): cambiar cualquiera de los primeros no altera un
 * solo píxel de la página, y el segundo ya es parte de la lista.
 */
export function indexVersion(input: {
  readonly event: { readonly originCity: string; readonly destinationCity: string };
  readonly listings: readonly EventCardEntry[];
}): string {
  const lines = [
    `event\u001f${input.event.originCity}\u001f${input.event.destinationCity}`,
    ...input.listings.map((entry) => {
      const card = cardModel(entry);
      const image = card.image;
      const media =
        image === null
          ? 'no-thumb'
          : `${image.src}\u001f${String(image.width)}\u001f${String(image.height)}`;

      return [card.slug, card.title, card.publishedLabel, media].join('\u001e');
    }),
  ];

  return hash(lines.join('\u001d'));
}
