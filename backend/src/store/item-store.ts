import type {
  ItemPhotoContentType,
  ItemPhotoVariant,
  ItemPhotoVariantContentType,
  PhotoSize,
} from '@mudanzapp/shared';

import type { Queryable } from '../db.js';
import type { ItemDraft, ItemPatch } from '../domain/item.js';

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
  readonly createdAt: Date;
};

/** Las variantes presentes, por nombre: es lo que el presentador compone en los tres tamaños. */
export type PhotoVariantSizes = Partial<Record<ItemPhotoVariant, PhotoSize>>;

/** El artículo con su foto de posición 0, o con `photoId` y sus variantes en `null`. */
export type ItemWithPhotoRecord = ItemRecord & {
  readonly photoId: string | null;
  readonly photoVariants: PhotoVariantSizes | null;
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

/**
 * La foto de un artículo tal como la necesita el borrador: el artículo existe, su foto existe o no,
 * y sus variantes están todas en la misma respuesta.
 */
export type DraftPhotoRecord = {
  readonly itemId: string;
  readonly photoId: string | null;
  readonly variants: readonly PhotoVariantRecord[];
};

const ITEM_COLUMNS =
  'i.id, i.event_id AS "eventId", i.title, i.note, ' +
  'i.width_cm AS "widthCm", i.height_cm AS "heightCm", i.depth_cm AS "depthCm", ' +
  'i.weight_kg::float8 AS "weightKg", i.created_at AS "createdAt"';

const PHOTO_JOIN = 'LEFT JOIN app.item_photo p ON p.item_id = i.id AND p.position = 0';

/**
 * Las variantes se agregan en la misma consulta para no hacer una lectura por artículo ni por foto
 * (`plan-ciclo-3c-optimizar` §5): un artículo sin filas devuelve `NULL`, que el presentador traduce a
 * los tres tamaños en `null`.
 */
const PHOTO_COLUMNS =
  'p.id AS "photoId", ' +
  '(SELECT jsonb_object_agg(v.variant, ' +
  "jsonb_build_object('widthPx', v.width_px, 'heightPx', v.height_px)) " +
  '   FROM app.item_photo_variant v WHERE v.photo_id = p.id) AS "photoVariants"';

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
    `SELECT ${ITEM_COLUMNS}, ${PHOTO_COLUMNS}
       FROM app.item i
       ${PHOTO_JOIN}
      WHERE i.event_id = $1
        AND i.id = $2`,
    [eventId, itemId],
  );

  return rows[0] ?? null;
}

export async function listItemsForEvent(
  database: Queryable,
  eventId: string,
): Promise<ItemWithPhotoRecord[]> {
  const { rows } = await database.query<ItemWithPhotoRecord>(
    `SELECT ${ITEM_COLUMNS}, ${PHOTO_COLUMNS}
       FROM app.item i
       ${PHOTO_JOIN}
      WHERE i.event_id = $1
      ORDER BY i.created_at DESC, i.id DESC`,
    [eventId],
  );

  return rows;
}

/**
 * Escribe la foto del artículo —el tamaño `large`— en las columnas heredadas. La posición 0 es única
 * por artículo, así que una segunda subida reemplaza la anterior en vez de acumular filas: el corte
 * admite **una** foto por artículo y la tabla queda lista para más posiciones sin migrar.
 *
 * `byte_size` sigue siendo obligatoria y guarda el peso del tamaño `large`: nadie lo lee y se retira
 * con el GC, no en este ciclo.
 */
export async function upsertItemPhoto(
  database: Queryable,
  input: {
    readonly itemId: string;
    readonly objectKey: string;
    readonly contentType: ItemPhotoContentType;
    readonly byteSize: number;
  },
): Promise<PhotoRecord> {
  const { rows } = await database.query<PhotoRecord>(
    `INSERT INTO app.item_photo (item_id, object_key, content_type, byte_size, position)
     VALUES ($1, $2, $3, $4, 0)
     ON CONFLICT (item_id, position) DO UPDATE
        SET object_key = EXCLUDED.object_key,
            content_type = EXCLUDED.content_type,
            byte_size = EXCLUDED.byte_size,
            created_at = now()
     RETURNING ${PHOTO_RETURNING}`,
    [input.itemId, input.objectKey, input.contentType, input.byteSize],
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
 * La foto del artículo para el borrador: **una sola** consulta autoriza (el `event_id` va en el
 * `WHERE`) y trae el artículo, su foto de posición 0 y todas sus variantes. Sin ella se podrían ver
 * dos estados distintos entre autorizar y elegir, y el ciclo ya tiene un `JOIN` barato.
 *
 * Distingue los tres casos que el borde tiene que distinguir: `null` si el artículo no es de ese
 * evento (`item_not_found`), `photoId` en `null` si no tiene foto (`item_photo_missing`) y la lista
 * de variantes vacía si la foto es anterior a 3c-optimizar.
 */
export async function findPhotoForDraft(
  database: Queryable,
  eventId: string,
  itemId: string,
): Promise<DraftPhotoRecord | null> {
  const { rows } = await database.query<{
    readonly itemId: string;
    readonly photoId: string | null;
    readonly variant: ItemPhotoVariant | null;
    readonly objectKey: string | null;
    readonly contentType: ItemPhotoVariantContentType | null;
    readonly widthPx: number | null;
    readonly heightPx: number | null;
  }>(
    `SELECT i.id AS "itemId",
            p.id AS "photoId",
            v.variant,
            v.object_key AS "objectKey",
            v.content_type AS "contentType",
            v.width_px AS "widthPx",
            v.height_px AS "heightPx"
       FROM app.item i
       LEFT JOIN app.item_photo p ON p.item_id = i.id AND p.position = 0
       LEFT JOIN app.item_photo_variant v ON v.photo_id = p.id
      WHERE i.event_id = $1
        AND i.id = $2`,
    [eventId, itemId],
  );

  const first = rows[0];
  if (first === undefined) {
    return null;
  }

  const variants: PhotoVariantRecord[] = [];
  for (const row of rows) {
    if (
      row.variant === null ||
      row.objectKey === null ||
      row.contentType === null ||
      row.widthPx === null ||
      row.heightPx === null
    ) {
      continue;
    }

    variants.push({
      photoId: first.photoId ?? '',
      variant: row.variant,
      objectKey: row.objectKey,
      contentType: row.contentType,
      widthPx: row.widthPx,
      heightPx: row.heightPx,
    });
  }

  return { itemId: first.itemId, photoId: first.photoId, variants };
}

/**
 * La revisión humana de 3d escribe **solo** `title` y `note`, y solo lo que vino: `COALESCE` deja el
 * título intacto cuando llega ausente y `CASE` distingue «no toqué la nota» de «la vacié», que son
 * cosas distintas. Medidas, foto y borrado siguen fuera del corte.
 *
 * El `event_id` va en el `WHERE` igual que en la lectura: un artículo de otro evento no se actualiza
 * por accidente. Devuelve si cambió alguna fila; el router relee con `findItem` para responder el
 * `ItemSummary` completo, con su foto, sin duplicar el presentador.
 */
export async function updateItem(
  database: Queryable,
  input: { readonly eventId: string; readonly itemId: string; readonly patch: ItemPatch },
): Promise<boolean> {
  const { patch } = input;
  const { rowCount } = await database.query(
    `UPDATE app.item
        SET title = COALESCE($3, title),
            note = CASE WHEN $4 THEN $5 ELSE note END
      WHERE event_id = $1
        AND id = $2`,
    [input.eventId, input.itemId, patch.title, patch.replaceNote, patch.note],
  );

  return (rowCount ?? 0) > 0;
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
