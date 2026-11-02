import { z } from 'zod';

import type { ItemPhotoVariant, PhotoSize } from './item.js';

/**
 * Contrato del corte de publicación del ciclo 3c (`publish`, `resumen-funcional` §3 y §4) y de la
 * optimización de la foto del ciclo 3c-optimizar.
 *
 * Un artículo capturado recibe una URL pública legible (`/<slug>`) y cualquiera la abre sin sesión
 * desde WhatsApp. La autorización sigue viviendo en la escritura, nunca en la URL (`decisiones` §24),
 * de modo que el contrato público no publica identificadores internos: ni `eventId`, ni `itemId`, ni
 * el `object_key` del almacén. El `slug` es la dirección y cada tamaño de la foto llega como URL
 * absoluta, compuesta por el backend desde la base pública de `R2_MODE` (decisión §26).
 */

/** Límites del corte, en un solo lugar: el `CHECK` de la tabla y el contrato usan el mismo número. */
export const LISTING_LIMITS = {
  slug: 140,
} as const;

/**
 * Forma del `slug`: minúsculas alfanuméricas y separadores de un solo guion. Es el **mismo** patrón
 * que el `CHECK` de `app.listing` en [`005_listing.sql`](../backend/sql/005_listing.sql:1); un
 * cambio aquí exige el cambio del DDL, no al revés.
 */
export const LISTING_SLUG_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$';

/**
 * Parámetro de la ruta pública. Un `slug` que no cumple el patrón y uno que no existe responden lo
 * mismo (`not_found`): la ruta no distingue «mal formado» de «inexistente» (`decisiones` §24).
 */
export const listingSlugSchema = z
  .string()
  .min(3)
  .max(LISTING_LIMITS.slug)
  .regex(new RegExp(LISTING_SLUG_PATTERN));

/**
 * Un tamaño de la ficha pública: la URL la emite el backend, el navegador la descarga del almacén, y
 * las dimensiones son las **reales** del objeto, para que la ficha reserve la caja correcta.
 */
export interface PublicPhotoSize extends PhotoSize {
  readonly url: string;
}

/** La foto pública en sus tres tamaños. Un tamaño ausente es `null`, no un objeto vacío. */
export interface PublicListingPhoto {
  readonly sizes: Readonly<Record<ItemPhotoVariant, PublicPhotoSize | null>>;
}

/**
 * Ficha pública de un artículo publicado. Sin precio ni moneda: el artículo no los guarda en este
 * ciclo y la venta se cierra fuera de la aplicación.
 */
export interface PublicListing {
  readonly slug: string;
  readonly title: string;
  readonly note: string | null;
  readonly widthCm: number | null;
  readonly heightCm: number | null;
  readonly depthCm: number | null;
  readonly weightKg: number | null;
  readonly photo: PublicListingPhoto | null;
  readonly event: {
    readonly originCity: string;
    readonly destinationCity: string;
    /** Enlace de vuelta al índice del evento (ciclo 4a, decisión §36). */
    readonly publicSlug: string;
  };
  readonly publishedAt: string;
}

/**
 * Resultado de publicar. `path` es `/<slug>` y **no** un origen: el origen de `shop` es configuración
 * compilada de cada frontend, no un hecho del contrato.
 */
export interface PublishedListing {
  readonly slug: string;
  readonly path: string;
}
