import type { ItemPhotoVariant } from '@mudanzapp/shared';

import type { Queryable } from '../db.js';
import { backfillEventPublicSlugs } from './identity-store.js';

/**
 * Acceso a datos de la publicación, en SQL crudo y parametrizado (`modelo-datos` §2).
 *
 * `app.listing` es el estado publicado del artículo: una fila por artículo (`listing_item_key`) y un
 * `slug` único (`listing_slug_key`). Republicar no crea otra fila ni cambia la URL: la sentencia es un
 * `ON CONFLICT (item_id)` que devuelve la fila existente.
 *
 * La URL pública **no** se guarda: las claves de los objetos viven en `app.item_photo_variant` y la
 * dirección se compone al leer, así que reemplazar la foto cambia lo que sirve la misma URL publicada.
 */

export type ListingRecord = {
  readonly id: string;
  readonly itemId: string;
  readonly slug: string;
  readonly publishedAt: Date;
  readonly createdAt: Date;
};

/** Una variante de la foto pública: su clave, para componer la URL, y sus dimensiones reales. */
export type PublicVariantRecord = {
  readonly objectKey: string;
  readonly widthPx: number;
  readonly heightPx: number;
};

/**
 * La ficha pública resuelta: publicación, artículo y evento, con la foto de la posición 0 en sus tres
 * tamaños. `photoObjectKey` es la clave heredada del tamaño `large` y sirve de caída para las fotos
 * anteriores a 3c-optimizar, que no tienen filas de variante.
 */
export type ListingWithItemRecord = {
  readonly slug: string;
  readonly title: string;
  readonly note: string | null;
  readonly widthCm: number | null;
  readonly heightCm: number | null;
  readonly depthCm: number | null;
  readonly weightKg: number | null;
  readonly priceCents: number | null;
  readonly soldAt: Date | null;
  readonly photoObjectKey: string | null;
  readonly photoVariants: Partial<Record<ItemPhotoVariant, PublicVariantRecord>> | null;
  /** Interno: permite derivar el `public_slug` de un evento anterior al ciclo 4a. No se publica. */
  readonly eventId: string;
  readonly publicSlug: string | null;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly currency: string;
  readonly publishedAt: Date;
};

/**
 * El evento del índice público: su identificador público y las dos ciudades de la cabecera.
 * `publicSlug` es `null` solo en un evento anterior al ciclo 4a, antes de su derivación perezosa.
 *
 * `contactPhone` (ciclo 4e) es el WhatsApp **del vendedor** y no se publica en ningún contrato: solo
 * decide `whatsappAvailable` en el carrito y compone el enlace `wa.me` de una solicitud.
 */
export type PublicEventRecord = {
  readonly id: string;
  readonly publicSlug: string | null;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly currency: string;
  readonly contactPhone: string | null;
};

/**
 * Una tarjeta del índice: el artículo publicado con la variante `thumb` de su foto. `thumb*` es
 * `null` cuando la foto no tiene esa variante —un artículo publicado antes de `3c-optimizar`— y la
 * tarjeta muestra su marcador en las dos renderizaciones.
 */
export type PublicEventListingRecord = {
  readonly slug: string;
  readonly title: string;
  readonly priceCents: number | null;
  readonly publishedAt: Date;
  readonly thumbObjectKey: string | null;
  readonly thumbWidthPx: number | null;
  readonly thumbHeightPx: number | null;
};

export type PublicEventIndexRecord = {
  readonly event: PublicEventRecord;
  readonly listings: readonly PublicEventListingRecord[];
};

const LISTING_RETURNING =
  'id, item_id AS "itemId", slug, published_at AS "publishedAt", created_at AS "createdAt"';

/**
 * Publica el artículo o devuelve la publicación existente.
 *
 * El `slug` propuesto solo se escribe la primera vez: un cambio de título no reescribe una URL que ya
 * se compartió (`plan-ciclo-3c` §3). Si el `slug` propuesto ya pertenece a otro artículo, la
 * restricción única falla y el borde responde un error interno: no se inventa un desempate silencioso.
 */
export async function upsertListing(
  database: Queryable,
  input: { readonly itemId: string; readonly slug: string },
): Promise<ListingRecord> {
  const { rows } = await database.query<ListingRecord>(
    `INSERT INTO app.listing (item_id, slug)
     VALUES ($1, $2)
     ON CONFLICT (item_id) DO UPDATE SET slug = app.listing.slug
     RETURNING ${LISTING_RETURNING}`,
    [input.itemId, input.slug],
  );

  const listing = rows[0];
  if (listing === undefined) {
    throw new Error('listing-upsert-returned-no-row');
  }

  return listing;
}

/** ¿Ya está publicado este artículo? Es la lectura que hace idempotente la respuesta. */
export async function findListingByItemId(
  database: Queryable,
  itemId: string,
): Promise<ListingRecord | null> {
  const { rows } = await database.query<ListingRecord>(
    `SELECT ${LISTING_RETURNING}
       FROM app.listing
      WHERE item_id = $1`,
    [itemId],
  );

  return rows[0] ?? null;
}

/**
 * La ficha pública por `slug`. Un `slug` inexistente es `null`, que la ruta traduce a `not_found`.
 *
 * Las tres variantes entran agregadas en la misma consulta (`jsonb_object_agg`), así que la ficha
 * sigue siendo **una sola lectura** (`plan-ciclo-3c-optimizar` §5). `weight_kg` se lee como `float8`
 * por la misma razón que en `item-store`: `numeric` vuelve de `pg` como cadena y el contrato publica
 * un número.
 */
export async function findListingBySlug(
  database: Queryable,
  slug: string,
): Promise<ListingWithItemRecord | null> {
  const { rows } = await database.query<ListingWithItemRecord>(
    `SELECT l.slug,
            i.title,
            i.note,
            i.width_cm AS "widthCm",
            i.height_cm AS "heightCm",
            i.depth_cm AS "depthCm",
            i.weight_kg::float8 AS "weightKg",
            i.price_cents AS "priceCents",
            l.sold_at AS "soldAt",
            p.object_key AS "photoObjectKey",
            (SELECT jsonb_object_agg(v.variant,
                     jsonb_build_object('objectKey', v.object_key,
                                        'widthPx', v.width_px,
                                        'heightPx', v.height_px))
               FROM app.item_photo_variant v
              WHERE v.photo_id = p.id) AS "photoVariants",
            e.id AS "eventId",
            e.public_slug AS "publicSlug",
            e.origin_city AS "originCity",
            e.destination_city AS "destinationCity",
            e.currency,
            l.published_at AS "publishedAt"
       FROM app.listing l
       JOIN app.item i ON i.id = l.item_id
       JOIN app.event e ON e.id = i.event_id
       LEFT JOIN app.item_photo p ON p.item_id = i.id AND p.position = 0
      WHERE l.slug = $1`,
    [slug],
  );

  return rows[0] ?? null;
}

/** Lo que la venta deja escrito; `soldAt` es el instante ya persistido, no el del intento. */
export type ListingSaleRecord = {
  readonly slug: string;
  readonly soldAt: Date;
};

/**
 * Marca la publicación como vendida sin monto y sin exigir precio (decisión §40). Es idempotente:
 * `COALESCE` conserva la primera venta, así que reintentar no reescribe la fecha. Un artículo sin
 * fila en `app.listing` devuelve `null` y el borde responde `listing_not_published`.
 */
export async function markListingSold(
  database: Queryable,
  itemId: string,
  soldAt: Date,
): Promise<ListingSaleRecord | null> {
  const { rows } = await database.query<ListingSaleRecord>(
    `UPDATE app.listing
        SET sold_at = COALESCE(sold_at, $2)
      WHERE item_id = $1
      RETURNING slug, sold_at AS "soldAt"`,
    [itemId, soldAt],
  );

  return rows[0] ?? null;
}

/**
 * El evento por su `public_slug`. Un `slug` inexistente es `null`, que la ruta traduce a `not_found`.
 */
export async function findPublicEventBySlug(
  database: Queryable,
  publicSlug: string,
): Promise<PublicEventRecord | null> {
  const { rows } = await database.query<PublicEventRecord>(
    `SELECT id,
            public_slug AS "publicSlug",
            origin_city AS "originCity",
            destination_city AS "destinationCity",
            currency,
            contact_phone AS "contactPhone"
       FROM app.event
      WHERE public_slug = $1`,
    [publicSlug],
  );

  return rows[0] ?? null;
}

/**
 * Las tarjetas del índice: **solo** artículos con fila en `app.listing`, en el orden publicado
 * (`published_at DESC, id`). La variante `thumb` entra por `LEFT JOIN` en la misma lectura, así que un
 * artículo sin esa variante devuelve `null` y no desaparece de la lista.
 */
async function listPublicEventListings(
  database: Queryable,
  eventId: string,
): Promise<PublicEventListingRecord[]> {
  const { rows } = await database.query<PublicEventListingRecord>(
    `SELECT l.slug,
            i.title,
            i.price_cents AS "priceCents",
            l.published_at AS "publishedAt",
            v.object_key AS "thumbObjectKey",
            v.width_px AS "thumbWidthPx",
            v.height_px AS "thumbHeightPx"
       FROM app.listing l
       JOIN app.item i ON i.id = l.item_id
       LEFT JOIN app.item_photo p ON p.item_id = i.id AND p.position = 0
       LEFT JOIN app.item_photo_variant v ON v.photo_id = p.id AND v.variant = 'thumb'
      WHERE i.event_id = $1
        AND l.sold_at IS NULL
      ORDER BY l.published_at DESC, l.id`,
    [eventId],
  );

  return rows;
}

/**
 * El índice de un evento: su cabecera y sus tarjetas publicadas.
 *
 * Un evento anterior al ciclo 4a no está todavía en el índice único de `public_slug`; la lectura
 * pública lo deriva **una sola vez** y reintenta, para que un enlace emitido antes del corte
 * encuentre su evento sin que nadie abra primero la superficie privada (`plan-ciclo-4a` §3). Con la
 * tabla al día, el camino de fallo solo cuesta una consulta que no devuelve filas.
 */
export async function findPublicEventIndex(
  database: Queryable,
  publicSlug: string,
): Promise<PublicEventIndexRecord | null> {
  const found = await findPublicEventBySlug(database, publicSlug);
  if (found !== null) {
    return { event: found, listings: await listPublicEventListings(database, found.id) };
  }

  const backfilled = await backfillEventPublicSlugs(database);
  if (backfilled === 0) {
    return null;
  }

  const retried = await findPublicEventBySlug(database, publicSlug);
  if (retried === null) {
    return null;
  }

  return { event: retried, listings: await listPublicEventListings(database, retried.id) };
}
