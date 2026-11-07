import type { CartRequestItem } from '@mudanzapp/shared';

import type { Queryable } from '../db.js';

/**
 * Acceso a datos del carrito de seleccionados y de su solicitud (ciclo 4e, `cart-request`).
 *
 * SQL crudo y parametrizado (`modelo-datos` §2). La tabla es la verdad y `localStorage` es su espejo
 * (decisión §39): el carrito se reemplaza **entero** y la solicitud se **inserta** con su instantánea,
 * nunca se parchea. Esa instantánea es lo que hace que la solicitud sobreviva al borrado del artículo
 * y que una edición posterior no reescriba lo que el comprador pidió.
 *
 * `app.purchase_interest` no existe: la decisión §38 quedó superada por la §44 y este carrito guarda el
 * hecho que el vendedor necesita.
 */

/** Un artículo del carrito con el hecho publicado que el borde necesita para decidir. */
export type CartItemRow = {
  readonly listingId: string;
  readonly slug: string;
  readonly title: string;
  /** Nulo solo si el vendedor vació el precio después de que el artículo entró al carrito. */
  readonly priceCents: number | null;
  readonly soldAt: Date | null;
  /** Instante de la despublicación; el borde lo retira del carrito con su aviso (F3). */
  readonly unpublishedAt: Date | null;
  readonly addedAt: Date;
};

/** El carrito de un comprador dentro de un evento; `null` es «todavía no tiene carrito». */
export type CartRow = {
  readonly id: string;
  readonly items: readonly CartItemRow[];
};

/** Un artículo resuelto por `slug` dentro de un evento: lo que el `PUT` puede guardar o descartar. */
export type CartableListing = {
  readonly listingId: string;
  readonly slug: string;
  readonly title: string;
  readonly priceCents: number | null;
  readonly soldAt: Date | null;
  /** Distingue «despublicado» de «sin precio» y «vendido» en la respuesta del `PUT` (F3). */
  readonly unpublishedAt: Date | null;
};

/** La solicitud **abierta** de un carrito: sin descartar y sin cancelar, con su registro (B9). */
export type OpenCartRequestRecord = {
  readonly id: string;
  readonly requestedAt: Date;
  /** Instantánea del momento de pedir con el estado derivado de hoy, en el orden `position`. */
  readonly items: readonly CartRequestItem[];
};

/**
 * La solicitud recién insertada. Su instantánea se lee con `findOpenCartRequest`, que es la única
 * derivación; el insert no la reconstruye por su cuenta (ciclo B9).
 */
export type CreatedCartRequest = {
  readonly id: string;
  readonly requestedAt: Date;
};

/** Lo que se congela al pedir: el título y el precio de ese momento, con el artículo que los originó. */
export type CartRequestItemSnapshot = {
  readonly listingId: string;
  readonly title: string;
  readonly priceCents: number;
};

/** Una solicitud tal como el panel la pinta, con su instantánea y el nombre de la cuenta. */
export type CartRequestRecord = {
  readonly id: string;
  readonly buyerName: string;
  readonly requestedAt: Date;
  readonly dismissedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly items: readonly CartRequestItem[];
};

/** La fila cruda del `LEFT JOIN`: un carrito sin artículos también devuelve una fila, con nulos. */
type CartJoinRow = {
  readonly cartId: string;
  readonly listingId: string | null;
  readonly slug: string | null;
  readonly title: string | null;
  readonly priceCents: number | null;
  readonly soldAt: Date | null;
  readonly unpublishedAt: Date | null;
  readonly addedAt: Date | null;
};

/**
 * El carrito del comprador en el evento, con sus artículos en el orden en que los guardó.
 *
 * Una sola lectura: el carrito se resuelve por su clave `(user_id, event_id)` y los artículos entran
 * con dos `LEFT JOIN`, así que un carrito vacío sigue siendo un carrito (y no un `not_found`). Una
 * fila sin `listing` es imposible por la cascada del DDL; se ignora en vez de inventar un artículo.
 */
export async function findCart(
  database: Queryable,
  input: { readonly eventId: string; readonly userId: string },
): Promise<CartRow | null> {
  const { rows } = await database.query<CartJoinRow>(
    `SELECT c.id AS "cartId",
            ci.added_at AS "addedAt",
            l.id AS "listingId",
            l.slug,
            i.title,
            i.price_cents AS "priceCents",
            l.sold_at AS "soldAt",
            l.unpublished_at AS "unpublishedAt"
       FROM app.cart c
       LEFT JOIN app.cart_item ci ON ci.cart_id = c.id
       LEFT JOIN app.listing l ON l.id = ci.listing_id
       LEFT JOIN app.item i ON i.id = l.item_id
      WHERE c.user_id = $1
        AND c.event_id = $2
      ORDER BY ci.added_at, l.slug`,
    [input.userId, input.eventId],
  );

  const first = rows[0];
  if (first === undefined) {
    return null;
  }

  const items: CartItemRow[] = [];
  for (const row of rows) {
    if (row.listingId === null || row.slug === null || row.title === null || row.addedAt === null) {
      continue;
    }

    items.push({
      listingId: row.listingId,
      slug: row.slug,
      title: row.title,
      priceCents: row.priceCents,
      soldAt: row.soldAt,
      unpublishedAt: row.unpublishedAt,
      addedAt: row.addedAt,
    });
  }

  return { id: first.cartId, items };
}

/**
 * Los artículos que el `PUT` nombró, resueltos dentro de **ese** evento. Decide el borde: la
 * consulta no filtra por precio ni por venta, porque «no se puede guardar» es una regla del corte y
 * tiene que poder explicarse, no desaparecer aquí.
 */
export async function findCartableListings(
  database: Queryable,
  input: { readonly eventId: string; readonly slugs: readonly string[] },
): Promise<readonly CartableListing[]> {
  if (input.slugs.length === 0) {
    return [];
  }

  const { rows } = await database.query<CartableListing>(
    `SELECT l.id AS "listingId",
            l.slug,
            i.title,
            i.price_cents AS "priceCents",
            l.sold_at AS "soldAt",
            l.unpublished_at AS "unpublishedAt"
       FROM app.listing l
       JOIN app.item i ON i.id = l.item_id
      WHERE i.event_id = $1
        AND l.slug = ANY($2::text[])`,
    [input.eventId, [...input.slugs]],
  );

  return rows;
}

/**
 * Reemplaza el carrito entero y devuelve su `id`.
 *
 * No borra y reinserta: quita lo que ya no está y añade lo nuevo con `ON CONFLICT DO NOTHING`, así que
 * el `added_at` de un artículo que se conserva **no** se reescribe. Es la forma idempotente de §39 y la
 * razón por la que reintentar el `PUT` no duplica nada.
 */
export async function replaceCart(
  database: Queryable,
  input: {
    readonly userId: string;
    readonly eventId: string;
    readonly listingIds: readonly string[];
  },
): Promise<string> {
  const { rows } = await database.query<{ readonly id: string }>(
    `INSERT INTO app.cart (user_id, event_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, event_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [input.userId, input.eventId],
  );

  const cart = rows[0];
  if (cart === undefined) {
    throw new Error('cart-upsert-returned-no-row');
  }

  const listingIds = [...input.listingIds];

  await database.query(
    `DELETE FROM app.cart_item
      WHERE cart_id = $1
        AND NOT (listing_id = ANY($2::uuid[]))`,
    [cart.id, listingIds],
  );

  if (listingIds.length > 0) {
    await database.query(
      `INSERT INTO app.cart_item (cart_id, listing_id)
       SELECT $1, listing_id
         FROM unnest($2::uuid[]) AS listing_id
       ON CONFLICT (cart_id, listing_id) DO NOTHING`,
      [cart.id, listingIds],
    );
  }

  return cart.id;
}

/**
 * La instantánea de una solicitud con el estado que el catálogo de hoy le da (ciclos B8 y B9).
 *
 * Es una **sola** derivación para los dos lectores —el panel del vendedor y el registro del
 * comprador—: cambiar el orden del `CASE` o un `JOIN` cambia las dos lecturas a la vez. El alias
 * exterior es `r`, así que quien la interpola nombra `app.cart_request r`.
 */
const CART_REQUEST_SNAPSHOT_SQL = `SELECT json_agg(
                  json_build_object(
                    'title', item.title_snapshot,
                    'priceCents', item.price_cents_snapshot,
                    'state', CASE
                      WHEN item.listing_id IS NULL THEN 'deleted'
                      WHEN listing.unpublished_at IS NOT NULL THEN 'unpublished'
                      WHEN listing.sold_at IS NOT NULL THEN 'sold'
                      WHEN i.price_cents IS DISTINCT FROM item.price_cents_snapshot THEN 'price_changed'
                      ELSE 'current'
                    END,
                    'currentPriceCents', i.price_cents
                  )
                  ORDER BY item.position
                ) AS list
           FROM app.cart_request_item item
           LEFT JOIN app.listing listing ON listing.id = item.listing_id
           LEFT JOIN app.item i ON i.id = listing.item_id
          WHERE item.request_id = r.id`;

/**
 * La solicitud abierta del carrito con su registro, o `null`. Es lo que hace idempotente el reintento
 * del comprador y lo que el comprador lee en `/carrito/:publicSlug` (B9).
 *
 * Una solicitud sin artículos no existe por el DDL; el `COALESCE` la publica como lista vacía en vez de
 * convertir la fila en un error de lectura.
 */
export async function findOpenCartRequest(
  database: Queryable,
  cartId: string,
): Promise<OpenCartRequestRecord | null> {
  const { rows } = await database.query<OpenCartRequestRecord>(
    `SELECT r.id,
            r.requested_at AS "requestedAt",
            COALESCE(snapshot.list, '[]'::json) AS "items"
       FROM app.cart_request r
       LEFT JOIN LATERAL (
         ${CART_REQUEST_SNAPSHOT_SQL}
       ) snapshot ON true
      WHERE r.cart_id = $1
        AND r.dismissed_at IS NULL
        AND r.cancelled_at IS NULL`,
    [cartId],
  );

  return rows[0] ?? null;
}

/**
 * Inserta la solicitud y su instantánea. Las dos escrituras van en la misma transacción del borde: una
 * solicitud sin artículos no es un hecho, y el índice único parcial impide que dos peticiones
 * simultáneas dejen dos solicitudes abiertas.
 *
 * Devuelve la fila recién creada **sin** el registro: el borde lo relee con `findOpenCartRequest` para
 * que el acto y una recarga publiquen exactamente la misma derivación (ciclo B9).
 */
export async function insertCartRequest(
  database: Queryable,
  input: { readonly cartId: string; readonly items: readonly CartRequestItemSnapshot[] },
): Promise<CreatedCartRequest> {
  const { rows } = await database.query<CreatedCartRequest>(
    `INSERT INTO app.cart_request (cart_id)
     VALUES ($1)
     RETURNING id, requested_at AS "requestedAt"`,
    [input.cartId],
  );

  const request = rows[0];
  if (request === undefined) {
    throw new Error('cart-request-insert-returned-no-row');
  }

  if (input.items.length > 0) {
    await database.query(
      `INSERT INTO app.cart_request_item
              (request_id, position, listing_id, title_snapshot, price_cents_snapshot)
       SELECT $1,
              (item.ordinality - 1)::smallint,
              item.listing_id,
              item.title,
              item.price_cents
         FROM unnest($2::uuid[], $3::text[], $4::integer[])
              WITH ORDINALITY AS item (listing_id, title, price_cents, ordinality)`,
      [
        request.id,
        input.items.map((item) => item.listingId),
        input.items.map((item) => item.title),
        input.items.map((item) => item.priceCents),
      ],
    );
  }

  return request;
}

/**
 * Cancela la solicitud abierta del comprador. Es idempotente y conserva el primer instante del acto;
 * sin solicitud abierta no escribe nada (el borde responde `204` igual, porque el estado deseado ya
 * se cumple).
 */
export async function cancelOpenCartRequest(
  database: Queryable,
  input: { readonly cartId: string; readonly now: Date },
): Promise<void> {
  await database.query(
    `UPDATE app.cart_request
        SET cancelled_at = COALESCE(cancelled_at, $2)
      WHERE cart_id = $1
        AND dismissed_at IS NULL
        AND cancelled_at IS NULL`,
    [input.cartId, input.now],
  );
}

/**
 * Las solicitudes del evento, de la más reciente a la más antigua, incluidas las atendidas y las
 * canceladas: su estado es la evidencia del acto (la misma regla que los enlaces de 4c-3).
 *
 * `items` viaja agregado como `json` en la misma lectura, así que el panel no hace una consulta por
 * solicitud.
 */
export async function listCartRequestsForEvent(
  database: Queryable,
  eventId: string,
): Promise<readonly CartRequestRecord[]> {
  // B8: la instantánea se queda intacta y el estado actual se **deriva** aquí, al leer. El orden del
  // `CASE` vive en `CART_REQUEST_SNAPSHOT_SQL`, que comparte con la lectura del comprador (B9).
  const { rows } = await database.query<CartRequestRecord>(
    `SELECT r.id,
            u.display_name AS "buyerName",
            r.requested_at AS "requestedAt",
            r.dismissed_at AS "dismissedAt",
            r.cancelled_at AS "cancelledAt",
            COALESCE(snapshot.list, '[]'::json) AS "items"
       FROM app.cart_request r
       JOIN app.cart c ON c.id = r.cart_id
       JOIN app."user" u ON u.id = c.user_id
       LEFT JOIN LATERAL (
         ${CART_REQUEST_SNAPSHOT_SQL}
       ) snapshot ON true
      WHERE c.event_id = $1
      ORDER BY r.requested_at DESC, r.id`,
    [eventId],
  );

  return rows;
}

/**
 * Descarta una solicitud del evento: escribe el instante y el autor **solo la primera vez**, para que
 * reintentar no reescriba la evidencia. Devuelve `false` cuando la solicitud no es de ese evento o ya
 * la canceló el comprador: en los dos casos no hay nada que atender.
 */
export async function dismissCartRequest(
  database: Queryable,
  input: {
    readonly eventId: string;
    readonly requestId: string;
    readonly dismissedBy: string;
    readonly now: Date;
  },
): Promise<boolean> {
  const { rowCount } = await database.query(
    `UPDATE app.cart_request AS r
        SET dismissed_at = COALESCE(r.dismissed_at, $3),
            dismissed_by = COALESCE(r.dismissed_by, $4)
       FROM app.cart c
      WHERE r.cart_id = c.id
        AND r.id = $1
        AND c.event_id = $2
        AND r.cancelled_at IS NULL`,
    [input.requestId, input.eventId, input.now, input.dismissedBy],
  );

  return rowCount === 1;
}
