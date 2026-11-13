import type {
  ItemPhotoContentType,
  ItemPhotoVariant,
  ItemPhotoVariantContentType,
  PhotoSize,
} from '@mudanzapp/shared';

import type { Database, Queryable } from '../db.js';
import type { ItemDraft, ItemUpdate } from '../domain/item.js';

/**
 * Acceso a datos del artículo, en SQL crudo y parametrizado (`modelo-datos` §2).
 *
 * Cada función recibe la superficie de consulta (`Queryable`), de modo que la misma sentencia sirve
 * al pool y al cliente de una transacción. No hay ORM ni query builder que oculte el SQL.
 *
 * `weight_kg` se lee como `float8`: `numeric` vuelve de `pg` como cadena para no perder precisión, y
 * el contrato publica un número. El resto de las columnas viaja con alias `camelCase` para que el
 * presentador no traduzca dos veces.
 *
 * Desde 3c-optimizar la foto tiene tres tamaños en `app.item_photo_variant`. Las columnas heredadas de
 * `app.item_photo` siguen describiendo el tamaño `large` y **no** se tocan; los pesos no se guardan en
 * la tabla nueva (`plan-ciclo-3c-optimizar` §5).
 */

export type ItemRecord = {
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
  /** Instante de la venta; `null` mientras el artículo no está vendido (ciclo 4b). */
  readonly soldAt: Date | null;
  readonly createdAt: Date;
};

/** Las variantes presentes, por nombre: es lo que el presentador compone en los tres tamaños. */
export type PhotoVariantSizes = Partial<Record<ItemPhotoVariant, PhotoSize>>;

/** Una foto de la galería: su dirección estable y las variantes que existen, o `null`. */
export type PhotoGalleryEntry = {
  readonly id: string;
  readonly variants: PhotoVariantSizes | null;
};

/**
 * El artículo con su galería **ordenada** —el índice 0 es la portada—, el `slug` de su fila en
 * `app.listing` —`null` mientras no está publicado— y el instante de su despublicación, `null`
 * mientras la ficha está a la vista (F3).
 *
 * Desde 3e la lectura trae todas las fotos del artículo en una sola consulta: el orden es el de
 * `app.item_photo.position` y no se recalcula en el presentador.
 */
export type ItemWithPhotoRecord = ItemRecord & {
  readonly photos: readonly PhotoGalleryEntry[];
  readonly publishedSlug: string | null;
  readonly unpublishedAt: Date | null;
};

export type PhotoRecord = {
  readonly id: string;
  readonly itemId: string;
  readonly objectKey: string;
  readonly contentType: ItemPhotoContentType;
  readonly byteSize: number;
};

/** Una variante guardada: su objeto, su tipo y sus dimensiones reales. */
export type PhotoVariantRecord = {
  readonly photoId: string;
  readonly variant: ItemPhotoVariant;
  readonly objectKey: string;
  readonly contentType: ItemPhotoVariantContentType;
  readonly widthPx: number;
  readonly heightPx: number;
};

/** La foto con el evento al que pertenece: es lo que autoriza su lectura. */
export type PhotoLookupRecord = PhotoRecord & { readonly eventId: string };

const ITEM_COLUMNS =
  'i.id, i.event_id AS "eventId", i.title, i.note, ' +
  'i.width_cm AS "widthCm", i.height_cm AS "heightCm", i.depth_cm AS "depthCm", ' +
  'i.weight_kg::float8 AS "weightKg", i.price_cents AS "priceCents", ' +
  'l.sold_at AS "soldAt", i.created_at AS "createdAt", ' +
  'l.slug AS "publishedSlug", l.unpublished_at AS "unpublishedAt"';

/**
 * El estado publicado se lee de `app.listing`, no de la memoria de la visita: publicar inserta la fila
 * y recargar la lista lo conserva (`plan-ciclo-3d` §5). Un artículo sin fila está `en proceso`.
 */
const LISTING_JOIN = 'LEFT JOIN app.listing l ON l.item_id = i.id';

/**
 * La galería completa en una sola lectura (3e): un arreglo JSON por artículo, ordenado por
 * `position`, con las variantes de cada foto agregadas en el mismo viaje. Sin filas devuelve `[]`, y
 * el presentador lo publica como «sin foto»: el orden se lee, no se recalcula.
 */
const PHOTO_GALLERY =
  '(SELECT COALESCE(jsonb_agg(jsonb_build_object(' +
  "'id', p.id, " +
  "'variants', (SELECT jsonb_object_agg(v.variant, " +
  "jsonb_build_object('widthPx', v.width_px, 'heightPx', v.height_px)) " +
  '   FROM app.item_photo_variant v WHERE v.photo_id = p.id)' +
  ") ORDER BY p.position), '[]'::jsonb) " +
  '   FROM app.item_photo p WHERE p.item_id = i.id) AS "photos"';

const PHOTO_RETURNING =
  'id, item_id AS "itemId", object_key AS "objectKey", ' +
  'content_type AS "contentType", byte_size AS "byteSize"';

export async function insertItem(
  database: Queryable,
  input: { readonly eventId: string; readonly draft: ItemDraft },
): Promise<ItemRecord> {
  const { draft } = input;
  const { rows } = await database.query<ItemRecord>(
    `INSERT INTO app.item (event_id, title, note, width_cm, height_cm, depth_cm, weight_kg)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id,
               event_id AS "eventId",
               title,
               note,
               width_cm AS "widthCm",
               height_cm AS "heightCm",
               depth_cm AS "depthCm",
               weight_kg::float8 AS "weightKg",
               price_cents AS "priceCents",
               NULL::timestamptz AS "soldAt",
               created_at AS "createdAt"`,
    [
      input.eventId,
      draft.title,
      draft.note,
      draft.widthCm,
      draft.heightCm,
      draft.depthCm,
      draft.weightKg,
    ],
  );

  const item = rows[0];
  if (item === undefined) {
    throw new Error('item-insert-returned-no-row');
  }

  return item;
}

/** Un artículo del evento; `null` cuando no existe **o** pertenece a otro evento. */
export async function findItem(
  database: Queryable,
  eventId: string,
  itemId: string,
): Promise<ItemWithPhotoRecord | null> {
  const { rows } = await database.query<ItemWithPhotoRecord>(
    `SELECT ${ITEM_COLUMNS}, ${PHOTO_GALLERY}
       FROM app.item i
       ${LISTING_JOIN}
      WHERE i.event_id = $1
        AND i.id = $2`,
    [eventId, itemId],
  );

  return rows[0] ?? null;
}

/**
 * Corrige la ficha en una sola sentencia parametrizada. Las banderas `has*` distinguen «no venía en
 * la petición» de «vino con `null` para limpiar»; el `slug` publicado no se toca (decisión §31).
 */
export async function updateItem(
  database: Queryable,
  eventId: string,
  itemId: string,
  patch: ItemUpdate,
): Promise<boolean> {
  const { rows } = await database.query<{ readonly id: string }>(
    `UPDATE app.item
        SET title = CASE WHEN $3 THEN $4 ELSE title END,
            note = CASE WHEN $5 THEN $6 ELSE note END,
            width_cm = CASE WHEN $7 THEN $8 ELSE width_cm END,
            height_cm = CASE WHEN $9 THEN $10 ELSE height_cm END,
            depth_cm = CASE WHEN $11 THEN $12 ELSE depth_cm END,
            weight_kg = CASE WHEN $13 THEN $14 ELSE weight_kg END,
            price_cents = CASE WHEN $15 THEN $16 ELSE price_cents END
      WHERE event_id = $1
        AND id = $2
      RETURNING id`,
    [
      eventId,
      itemId,
      patch.title !== undefined,
      patch.title ?? null,
      patch.note !== undefined,
      patch.note ?? null,
      patch.widthCm !== undefined,
      patch.widthCm ?? null,
      patch.heightCm !== undefined,
      patch.heightCm ?? null,
      patch.depthCm !== undefined,
      patch.depthCm ?? null,
      patch.weightKg !== undefined,
      patch.weightKg ?? null,
      patch.priceCents !== undefined,
      patch.priceCents ?? null,
    ],
  );

  return rows.length > 0;
}

/**
 * Retira la fila del artículo. La cascada —foto, variantes y `app.listing`— la impone el DDL
 * (`ON DELETE CASCADE`), no este código: borrar filas hijas a mano sería una segunda fuente del
 * modelo.
 *
 * `false` significa que no había una fila de **ese** evento: un artículo ajeno y uno inexistente
 * responden igual, como en el resto de la superficie privada (`decisiones` §24).
 */
export async function deleteItem(
  database: Queryable,
  eventId: string,
  itemId: string,
): Promise<boolean> {
  const { rowCount } = await database.query(
    `DELETE FROM app.item
      WHERE event_id = $1
        AND id = $2`,
    [eventId, itemId],
  );

  return rowCount === 1;
}

export async function listItemsForEvent(
  database: Queryable,
  eventId: string,
): Promise<ItemWithPhotoRecord[]> {
  const { rows } = await database.query<ItemWithPhotoRecord>(
    `SELECT ${ITEM_COLUMNS}, ${PHOTO_GALLERY}
       FROM app.item i
       ${LISTING_JOIN}
      WHERE i.event_id = $1
      ORDER BY i.created_at DESC, i.id DESC`,
    [eventId],
  );

  return rows;
}

/**
 * Escribe la foto del artículo —el tamaño `large`— en las columnas heredadas.
 *
 * `position` es la posición de la foto en el artículo y el par `(item_id, position)` es único, así
 * que reemplazar la foto de una posición no acumula filas: la 0 es la portada y la galería de 3e usa
 * las siguientes sin migrar (ciclo 4g, `direct-upload`).
 *
 * `byte_size` sigue siendo obligatoria y guarda el peso del tamaño `large`: desde 4g lo dicta el
 * `HEAD` del almacén, no el cliente.
 */
export async function upsertItemPhoto(
  database: Queryable,
  input: {
    readonly itemId: string;
    readonly objectKey: string;
    readonly contentType: ItemPhotoContentType;
    readonly byteSize: number;
    readonly position: number;
  },
): Promise<PhotoRecord> {
  const { rows } = await database.query<PhotoRecord>(
    `INSERT INTO app.item_photo (item_id, object_key, content_type, byte_size, position)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (item_id, position) DO UPDATE
        SET object_key = EXCLUDED.object_key,
            content_type = EXCLUDED.content_type,
            byte_size = EXCLUDED.byte_size,
            created_at = now()
     RETURNING ${PHOTO_RETURNING}`,
    [input.itemId, input.objectKey, input.contentType, input.byteSize, input.position],
  );

  const photo = rows[0];
  if (photo === undefined) {
    throw new Error('photo-upsert-returned-no-row');
  }

  return photo;
}

/**
 * Escribe o reemplaza una variante. La clave es nueva en cada subida (`newObjectKey` incluye un
 * `uuid`), así que reemplazar un tamaño nunca sobrescribe otro objeto ni choca con su unicidad.
 */
export async function upsertPhotoVariant(
  database: Queryable,
  input: {
    readonly photoId: string;
    readonly variant: ItemPhotoVariant;
    readonly objectKey: string;
    readonly contentType: ItemPhotoVariantContentType;
    readonly widthPx: number;
    readonly heightPx: number;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO app.item_photo_variant
       (photo_id, variant, object_key, content_type, width_px, height_px)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (photo_id, variant) DO UPDATE
        SET object_key = EXCLUDED.object_key,
            content_type = EXCLUDED.content_type,
            width_px = EXCLUDED.width_px,
            height_px = EXCLUDED.height_px,
            created_at = now()`,
    [
      input.photoId,
      input.variant,
      input.objectKey,
      input.contentType,
      input.widthPx,
      input.heightPx,
    ],
  );
}

/** Las variantes de una foto: lo que la respuesta de la subida y la lectura por variante necesitan. */
export async function findPhotoVariants(
  database: Queryable,
  photoId: string,
): Promise<PhotoVariantRecord[]> {
  const { rows } = await database.query<PhotoVariantRecord>(
    `SELECT photo_id AS "photoId",
            variant,
            object_key AS "objectKey",
            content_type AS "contentType",
            width_px AS "widthPx",
            height_px AS "heightPx"
       FROM app.item_photo_variant
      WHERE photo_id = $1
      ORDER BY variant`,
    [photoId],
  );

  return rows;
}

/**
 * La permutación de la galería (`plan-ciclo-3e` §4): el orden nuevo, ya aplicado, o `false` cuando el
 * conjunto enviado ya no coincide con el del artículo.
 *
 * Corre en **una transacción y en dos pasadas**: primero todas las filas del artículo se desplazan a
 * `position + 100`, después cada una a su índice destino. El desplazamiento es necesario porque
 * `UNIQUE (item_id, position)` se comprueba por fila y `CHECK (position >= 0)` prohíbe los negativos;
 * con el esquema vigente el tope real es `position 5`, así que `100..105` no puede chocar.
 *
 * No «repara» silenciosamente un conjunto distinto: si la lista enviada no es exactamente la del
 * artículo —otro dispositivo añadió o borró una foto—, devuelve `false` sin escribir nada.
 */
export async function reorderItemPhotos(
  database: Database,
  input: {
    readonly itemId: string;
    readonly photoIds: readonly string[];
  },
): Promise<boolean> {
  return database.transaction(async (client) => {
    const { rows } = await client.query<{ readonly id: string }>(
      `SELECT id
         FROM app.item_photo
        WHERE item_id = $1
        ORDER BY position`,
      [input.itemId],
    );

    const current = new Set(rows.map((row) => row.id));
    if (current.size !== input.photoIds.length) {
      return false;
    }

    if (!input.photoIds.every((photoId) => current.has(photoId))) {
      return false;
    }

    // Primera pasada: todas fuera del rango que el segundo paso va a reutilizar.
    await client.query(
      `UPDATE app.item_photo
          SET position = position + 100
        WHERE item_id = $1`,
      [input.itemId],
    );

    // Segunda pasada: cada foto a su índice destino, sin que ninguna quede fuera.
    for (const [index, photoId] of input.photoIds.entries()) {
      await client.query(
        `UPDATE app.item_photo
            SET position = $2
          WHERE item_id = $1
            AND id = $3`,
        [input.itemId, index, photoId],
      );
    }

    return true;
  });
}

/**
 * La foto con el evento de su artículo: el router autoriza con `eventId` en la misma consulta, sin
 * una segunda lectura que pueda ver un estado distinto. Sus columnas heredadas son la caída de las
 * fotos anteriores a 3c-optimizar, que no tienen filas de variante.
 */
export async function findPhotoById(
  database: Queryable,
  photoId: string,
): Promise<PhotoLookupRecord | null> {
  const { rows } = await database.query<PhotoLookupRecord>(
    `SELECT p.id,
            p.item_id AS "itemId",
            p.object_key AS "objectKey",
            p.content_type AS "contentType",
            p.byte_size AS "byteSize",
            i.event_id AS "eventId"
       FROM app.item_photo p
       JOIN app.item i ON i.id = p.item_id
      WHERE p.id = $1`,
    [photoId],
  );

  return rows[0] ?? null;
}
