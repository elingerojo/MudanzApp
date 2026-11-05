import { randomUUID } from 'node:crypto';

import type { Database } from '../../src/db.js';
import { hashToken } from '../../src/tokens.js';

/**
 * Doble de `Database` para la frontera del carrito y de su solicitud (ciclo 4e).
 *
 * Responde por **forma** de la sentencia: el token de la sesión, el `touch`, el evento por
 * `public_slug`, el carrito con sus artículos, los artículos que el `PUT` resuelve por `slug`, la
 * escritura del carrito, la solicitud con su instantánea, el listado del panel, el descarte, el
 * WhatsApp del evento y el derecho de administración. Cualquier otra consulta **falla** en vez de
 * devolver una fila inventada: un doble que responde a todo esconde justo el defecto que la prueba
 * busca.
 *
 * El estado del carrito y de las solicitudes es **mutable**: el `PUT`, la cancelación y el descarte se
 * ejercen de verdad sobre este doble, y una segunda lectura ve lo que la primera escribió.
 * La base real y el SQL se ejercen en `test/db/cart.test.ts`.
 */

export const CART_EVENT_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_CART_EVENT_ID = '22222222-2222-4222-8222-222222222222';
export const CART_PUBLIC_SLUG = 'bogota-ciudad-de-mexico-3f9a2c';
/** La solicitud que la fixture deja abierta: es un `id` real, porque la ruta lo valida como UUID. */
export const OPEN_REQUEST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** La sesión que el middleware resuelve a partir del token de la petición. */
export interface CartSessionFixture {
  readonly token: string;
  readonly userId: string | null;
  readonly scope: 'app' | 'shop';
  readonly eventId?: string | null;
  readonly displayName?: string | null;
  readonly isAdmin?: boolean;
  readonly revokedAt?: Date | null;
}

/** Un artículo publicado del evento, con los dos hechos que el carrito mira: precio y venta. */
export interface CartListingFixture {
  readonly listingId: string;
  readonly slug: string;
  readonly title: string;
  readonly priceCents: number | null;
  readonly soldAt: Date | null;
}

/** Una solicitud tal como el doble la guarda y la devuelve. */
export interface CartRequestState {
  readonly id: string;
  readonly eventId: string;
  readonly cartOwnerId: string;
  readonly requestedAt: Date;
  dismissedAt: Date | null;
  dismissedBy: string | null;
  cancelledAt: Date | null;
  readonly items: readonly { readonly title: string; readonly priceCents: number }[];
}

export interface CartFixture {
  readonly sessions: readonly CartSessionFixture[];
  readonly contactPhone?: string | null;
  readonly listings?: readonly CartListingFixture[];
  /** Artículos ya guardados, para no tener que hacer un `PUT` antes de cada caso. */
  readonly cartItems?: readonly string[];
  /** La solicitud que ya está abierta al empezar el caso. */
  readonly openRequest?: boolean;
  /** El nombre que la cuenta del comprador publica en el panel. */
  readonly buyerName?: string;
  /** El administrador reclamado del evento; `null` deja el evento sin reclamar. */
  readonly administrator?: { readonly id: string; readonly displayName: string } | null;
  /** El único sujeto que registra membresía, para la negativa del panel. */
  readonly memberUserId?: string | null;
  /** `true` hace que el evento no exista por `public_slug`. */
  readonly eventMissing?: boolean;
}

export interface CartDatabaseHarness {
  readonly database: Database;
  /** Una lectura del estado, para afirmar qué quedó guardado después del acto. */
  readonly state: {
    readonly items: readonly string[];
    readonly requests: readonly CartRequestState[];
  };
}

function rows<Row>(entries: readonly Row[], rowCount = entries.length) {
  return Promise.resolve({ rows: entries, rowCount, command: 'SELECT', oid: 0, fields: [] });
}

function none() {
  return rows([]);
}

const FIXED_NOW = new Date('2026-11-04T18:00:00.000Z');

export function cartDatabase(fixture: CartFixture): CartDatabaseHarness {
  let cartExists = fixture.cartItems !== undefined || fixture.openRequest === true;
  let items: string[] = [...(fixture.cartItems ?? [])];
  const requests: CartRequestState[] = [];

  const owner = fixture.sessions.find((session) => session.scope === 'shop')?.userId ?? 'user-shop';
  const buyerName = fixture.buyerName ?? 'Ana';
  const listings = fixture.listings ?? [];

  if (fixture.openRequest === true) {
    requests.push({
      id: OPEN_REQUEST_ID,
      eventId: CART_EVENT_ID,
      cartOwnerId: owner,
      requestedAt: FIXED_NOW,
      dismissedAt: null,
      dismissedBy: null,
      cancelledAt: null,
      items: [{ title: 'Silla', priceCents: 125_000 }],
    });
  }

  const openOf = (eventId: string): CartRequestState | undefined =>
    requests.find(
      (request) =>
        request.eventId === eventId && request.dismissedAt === null && request.cancelledAt === null,
    );

  const database = {
    check: () => Promise.resolve('ok'),
    query: (text: string, values?: readonly unknown[]) => {
      const value = (index: number): string => String(values?.[index] ?? '');

      if (text.includes('token_hash = $1')) {
        const found = fixture.sessions.find((entry) => hashToken(entry.token) === value(0));
        if (found === undefined) {
          return none();
        }

        return rows([
          {
            id: `session-${found.token}`,
            userId: found.userId,
            eventId: found.eventId ?? null,
            scope: found.scope,
            revokedAt: found.revokedAt ?? null,
            displayName: found.displayName ?? null,
            isAdmin: found.isAdmin ?? false,
          },
        ]);
      }

      if (text.includes('SET last_seen_at')) {
        return rows([], 1);
      }

      if (text.includes('WHERE public_slug = $1')) {
        if (fixture.eventMissing === true) {
          return none();
        }

        return rows([
          {
            id: CART_EVENT_ID,
            publicSlug: CART_PUBLIC_SLUG,
            originCity: 'Bogotá',
            destinationCity: 'Ciudad de México',
            currency: 'MXN',
            contactPhone: fixture.contactPhone ?? null,
          },
        ]);
      }

      // ---- Carrito -------------------------------------------------------------------------
      if (text.includes('LEFT JOIN app.cart_item ci')) {
        if (!cartExists) {
          return none();
        }

        type CartJoinRow = {
          readonly cartId: string;
          readonly addedAt: Date | null;
          readonly listingId: string | null;
          readonly slug: string | null;
          readonly title: string | null;
          readonly priceCents: number | null;
          readonly soldAt: Date | null;
        };

        const found: CartJoinRow[] = [];
        for (const listingId of items) {
          const listing = listings.find((entry) => entry.listingId === listingId);
          if (listing === undefined) {
            continue;
          }

          found.push({
            cartId: 'cart-1',
            addedAt: FIXED_NOW,
            listingId: listing.listingId,
            slug: listing.slug,
            title: listing.title,
            priceCents: listing.priceCents,
            soldAt: listing.soldAt,
          });
        }

        // Un carrito sin artículos también devuelve **una** fila, con los nulos del `LEFT JOIN`.
        const empty: CartJoinRow = {
          cartId: 'cart-1',
          addedAt: null,
          listingId: null,
          slug: null,
          title: null,
          priceCents: null,
          soldAt: null,
        };

        return rows(found.length === 0 ? [empty] : found);
      }

      if (text.includes('AND l.slug = ANY($2::text[])')) {
        const wanted = new Set((values?.[1] as readonly string[] | undefined) ?? []);
        return rows(
          listings
            .filter((listing) => wanted.has(listing.slug))
            .map((listing) => ({
              listingId: listing.listingId,
              slug: listing.slug,
              priceCents: listing.priceCents,
              soldAt: listing.soldAt,
            })),
        );
      }

      if (text.includes('INSERT INTO app.cart (')) {
        cartExists = true;
        return rows([{ id: 'cart-1' }]);
      }

      if (text.includes('DELETE FROM app.cart_item')) {
        const kept = new Set((values?.[1] as readonly string[] | undefined) ?? []);
        items = items.filter((listingId) => kept.has(listingId));
        return rows([], 1);
      }

      if (text.includes('INSERT INTO app.cart_item (')) {
        const incoming = (values?.[1] as readonly string[] | undefined) ?? [];
        for (const listingId of incoming) {
          if (!items.includes(listingId)) {
            items.push(listingId);
          }
        }

        return rows([], incoming.length);
      }

      // ---- Solicitud -----------------------------------------------------------------------
      if (text.includes('INSERT INTO app.cart_request_item')) {
        const titles = (values?.[2] as readonly string[] | undefined) ?? [];
        const prices = (values?.[3] as readonly number[] | undefined) ?? [];
        const target = requests[requests.length - 1];
        if (target !== undefined) {
          Object.assign(target, {
            items: titles.map((title, index) => ({
              title,
              priceCents: prices[index] ?? 0,
            })),
          });
        }

        return rows([], titles.length);
      }

      if (text.includes('INSERT INTO app.cart_request (')) {
        const request: CartRequestState = {
          id: randomUUID(),
          eventId: CART_EVENT_ID,
          cartOwnerId: owner,
          requestedAt: FIXED_NOW,
          dismissedAt: null,
          dismissedBy: null,
          cancelledAt: null,
          items: [],
        };
        requests.push(request);
        return rows([{ id: request.id, requestedAt: request.requestedAt }]);
      }

      if (text.includes('FROM app.cart_request') && text.includes('dismissed_at IS NULL')) {
        const open = openOf(CART_EVENT_ID);
        return open === undefined ? none() : rows([{ id: open.id, requestedAt: open.requestedAt }]);
      }

      if (text.includes('UPDATE app.cart_request AS r')) {
        const request = requests.find((entry) => entry.id === value(0));
        const belongs = request?.eventId === value(1);
        if (request === undefined || !belongs || request.cancelledAt !== null) {
          return rows([], 0);
        }

        request.dismissedAt = request.dismissedAt ?? FIXED_NOW;
        request.dismissedBy = request.dismissedBy ?? value(3);
        return rows([], 1);
      }

      if (text.includes('SET cancelled_at = COALESCE')) {
        const open = openOf(CART_EVENT_ID);
        if (open !== undefined) {
          open.cancelledAt = FIXED_NOW;
        }

        return rows([], open === undefined ? 0 : 1);
      }

      if (text.includes('FROM app.cart_request r')) {
        return rows(
          requests
            .filter((request) => request.eventId === value(0))
            .map((request) => ({
              id: request.id,
              buyerName,
              requestedAt: request.requestedAt,
              dismissedAt: request.dismissedAt,
              cancelledAt: request.cancelledAt,
              items: request.items,
            })),
        );
      }

      // ---- WhatsApp del evento y derecho del panel ------------------------------------------
      if (text.includes('SELECT contact_phone AS "contactPhone"')) {
        return rows([{ contactPhone: fixture.contactPhone ?? null }]);
      }

      if (text.includes('UPDATE app.event') && text.includes('SET contact_phone = $2')) {
        return rows([{ contactPhone: values?.[1] ?? null }]);
      }

      if (text.includes('LEFT JOIN app."user" u ON u.id = e.admin_user_id')) {
        return rows([
          {
            adminUserId: fixture.administrator?.id ?? null,
            displayName: fixture.administrator?.displayName ?? null,
            isAdmin: false,
          },
        ]);
      }

      if (text.includes('FROM app.event_member m')) {
        const isMember =
          fixture.memberUserId !== undefined &&
          fixture.memberUserId !== null &&
          value(0) === fixture.memberUserId &&
          value(1) === CART_EVENT_ID;

        return isMember
          ? rows([
              {
                id: CART_EVENT_ID,
                publicSlug: CART_PUBLIC_SLUG,
                adminUserId: fixture.administrator?.id ?? null,
                originCity: 'Bogotá',
                destinationCity: 'Ciudad de México',
                currency: 'MXN',
                state: 'open',
                role: 'member',
              },
            ])
          : none();
      }

      return Promise.reject(new Error(`unexpected-query: ${text}`));
    },
    transaction: (work: (client: unknown) => Promise<unknown>) => Promise.resolve(work(database)),
    close: () => Promise.resolve(),
  } as unknown as Database;

  return {
    database,
    state: {
      get items() {
        return [...items];
      },
      get requests() {
        return [...requests];
      },
    },
  };
}
