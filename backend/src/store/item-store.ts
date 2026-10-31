import type { ItemPhotoContentType } from '@mudanzapp/shared';

import type { Queryable } from '../db.js';
import type { ItemDraft } from '../domain/item.js';

/**
 * Acceso a datos del artículo, en SQL crudo y parametrizado (`modelo-datos` §2).
 *
 * Cada función recibe la superficie de consulta (`Queryable`), de modo que la misma sentencia sirve
 * al pool y al cliente de una transacción. No hay ORM ni query builder que oculte el SQL.
 *
 * `weight_kg` se lee como `float8`: `numeric` vuelve de `pg` como cadena para no perder precisión, y
 * el contrato publica un número. El resto de las columnas viaja con alias `camelCase` para que el
 * presentador no traduzca dos veces.
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

/** El artículo con su foto de posición 0, o con las tres columnas de foto en `null`. */
export type ItemWithPhotoRecord = ItemRecord & {
  readonly photoId: string | null;
  readonly photoContentType: ItemPhotoContentType | null;
  readonly photoByteSize: number | null;
};

export type PhotoRecord = {
  readonly id: string;
  readonly itemId: string;
  readonly objectKey: string;
  readonly contentType: ItemPhotoContentType;
  readonly byteSize: number;
};

/** La foto con el evento al que pertenece: es lo que autoriza su lectura. */
export type PhotoLookupRecord = PhotoRecord & { readonly eventId: string };

const ITEM_COLUMNS =
  'i.id, i.event_id AS "eventId", i.title, i.note, ' +
  'i.width_cm AS "widthCm", i.height_cm AS "heightCm", i.depth_cm AS "depthCm", ' +
  'i.weight_kg::float8 AS "weightKg", i.created_at AS "createdAt"';

const PHOTO_JOIN = 'LEFT JOIN app.item_photo p ON p.item_id = i.id AND p.position = 0';

const PHOTO_COLUMNS =
  'p.id AS "photoId", p.content_type AS "photoContentType", p.byte_size AS "photoByteSize"';

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
 * Escribe la foto del artículo. La posición 0 es única por artículo, así que una segunda subida
 * reemplaza la anterior en vez de acumular filas: el corte admite **una** foto por artículo y la
 * tabla queda lista para más posiciones sin migrar.
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
 * La foto con el evento de su artículo: el router autoriza con `eventId` en la misma consulta, sin
 * una segunda lectura que pueda ver un estado distinto.
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
