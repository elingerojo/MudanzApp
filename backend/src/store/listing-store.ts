import type { ItemPhotoContentType } from '@mudanzapp/shared';

import type { Queryable } from '../db.js';

/**
 * Acceso a datos de la publicación, en SQL crudo y parametrizado (`modelo-datos` §2).
 *
 * `app.listing` es el estado publicado del artículo: una fila por artículo (`listing_item_key`) y un
 * `slug` único (`listing_slug_key`). Republicar no crea otra fila ni cambia la URL: la sentencia es un
 * `ON CONFLICT (item_id)` que devuelve la fila existente.
 *
 * La URL pública **no** se guarda: la clave del objeto vive en `app.item_photo` y la dirección se
 * compone al leer, así que reemplazar la foto cambia lo que sirve la misma URL publicada.
 */

export type ListingRecord = {
  readonly id: string;
  readonly itemId: string;
  readonly slug: string;
  readonly publishedAt: Date;
  readonly createdAt: Date;
};

/** La ficha pública resuelta: publicación, artículo y evento, con la foto de la posición 0. */
export type ListingWithItemRecord = {
  readonly slug: string;
  readonly title: string;
  readonly note: string | null;
  readonly widthCm: number | null;
  readonly heightCm: number | null;
  readonly depthCm: number | null;
  readonly weightKg: number | null;
  readonly photoObjectKey: string | null;
  readonly photoContentType: ItemPhotoContentType | null;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly publishedAt: Date;
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
 * `weight_kg` se lee como `float8` por la misma razón que en `item-store`: `numeric` vuelve de `pg`
 * como cadena y el contrato publica un número.
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
            p.object_key AS "photoObjectKey",
            p.content_type AS "photoContentType",
            e.origin_city AS "originCity",
            e.destination_city AS "destinationCity",
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
