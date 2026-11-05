import { createDatabase } from '../../src/db.js';
import { normalizeItemDraft } from '../../src/domain/item.js';
import {
  cancelOpenCartRequest,
  dismissCartRequest,
  findCart,
  findOpenCartRequest,
  insertCartRequest,
  listCartRequestsForEvent,
  replaceCart,
} from '../../src/store/cart-store.js';
import {
  createEvent,
  createUser,
  ensureAdminUser,
  readEventContact,
  updateEventContact,
} from '../../src/store/identity-store.js';
import { deleteItem, insertItem } from '../../src/store/item-store.js';
import { upsertListing } from '../../src/store/listing-store.js';

/**
 * El carrito, su solicitud y el WhatsApp del evento sobre la base real (ciclo 4e, `plan-ciclo-4e` §7).
 *
 * Lo que solo la base puede demostrar es lo que impone el DDL y no el código:
 * - un carrito por (comprador, evento) y un `added_at` que **no** se reescribe al reemplazar;
 * - una sola solicitud abierta por carrito (índice único parcial);
 * - una instantánea que sobrevive al borrado del artículo;
 * - el primer instante y el autor del descarte, que reintentar no reescribe;
 * - el `CHECK` del WhatsApp, que rechaza un número que `wa.me` no aceptaría.
 *
 * Solo entra con `test:api:db`/`:branch`, que derivan la URL de pruebas y activan
 * `MUDANZAPP_DB_TESTS=1` (`backend/vitest.config.ts`). La base es un sandbox desechable.
 */
const database = createDatabase(process.env.DATABASE_URL ?? null);

afterAll(async () => {
  await database.close();
});

async function setup() {
  const admin = await ensureAdminUser(database);
  expect(admin).not.toBeNull();
  if (admin === null) {
    throw new Error('missing-admin');
  }

  const buyer = await createUser(database, 'Compradora de prueba');
  const event = await createEvent(database, {
    ownerUserId: admin.id,
    originCity: 'Quito',
    destinationCity: 'Guayaquil',
    currency: 'MXN',
  });

  const item = await insertItem(database, {
    eventId: event.id,
    draft: normalizeItemDraft({ title: 'Silla de prueba' }),
  });

  const listing = await upsertListing(database, {
    itemId: item.id,
    slug: `silla-${item.id.slice(0, 8)}`,
  });

  return { admin, buyer, event, item, listing };
}

describe('cart', () => {
  it('keeps one cart per buyer and event and preserves addedAt when it is replaced', async () => {
    const { buyer, event, listing } = await setup();

    const cartId = await replaceCart(database, {
      userId: buyer.id,
      eventId: event.id,
      listingIds: [listing.id],
    });

    const before = await findCart(database, { eventId: event.id, userId: buyer.id });
    expect(before?.id).toBe(cartId);
    expect(before?.items).toHaveLength(1);

    await replaceCart(database, {
      userId: buyer.id,
      eventId: event.id,
      listingIds: [listing.id],
    });

    const after = await findCart(database, { eventId: event.id, userId: buyer.id });
    expect(after?.items[0]?.addedAt.toISOString()).toBe(
      before?.items[0]?.addedAt.toISOString() ?? '',
    );

    const carts = await database.query<{ readonly count: number }>(
      'SELECT count(*)::int AS "count" FROM app.cart WHERE user_id = $1 AND event_id = $2',
      [buyer.id, event.id],
    );
    expect(carts.rows[0]?.count).toBe(1);
  });

  it('allows only one open request per cart', async () => {
    const { buyer, event, listing } = await setup();

    const cartId = await replaceCart(database, {
      userId: buyer.id,
      eventId: event.id,
      listingIds: [listing.id],
    });

    const snapshot = [
      { listingId: listing.id, title: 'Silla de prueba', priceCents: 125_000 },
    ] as const;

    await insertCartRequest(database, { cartId, items: snapshot });

    await expect(insertCartRequest(database, { cartId, items: snapshot })).rejects.toThrow();

    const open = await findOpenCartRequest(database, cartId);
    expect(open).not.toBeNull();
  });
});

describe('cart request', () => {
  it('keeps the snapshot after the article is deleted', async () => {
    const { buyer, event, item, listing } = await setup();

    const cartId = await replaceCart(database, {
      userId: buyer.id,
      eventId: event.id,
      listingIds: [listing.id],
    });

    await insertCartRequest(database, {
      cartId,
      items: [{ listingId: listing.id, title: 'Silla de prueba', priceCents: 125_000 }],
    });

    expect(await deleteItem(database, event.id, item.id)).toBe(true);

    const requests = await listCartRequestsForEvent(database, event.id);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.items).toEqual([{ title: 'Silla de prueba', priceCents: 125_000 }]);
    expect(requests[0]?.buyerName).toBe('Compradora de prueba');

    const dangling = await database.query<{ readonly count: number }>(
      'SELECT count(*)::int AS "count" FROM app.cart_request_item WHERE request_id = $1 AND listing_id IS NULL',
      [requests[0]?.id],
    );
    expect(dangling.rows[0]?.count).toBe(1);
  });

  it('dismisses once and keeps the first instant and author', async () => {
    const { admin, buyer, event, listing } = await setup();

    const cartId = await replaceCart(database, {
      userId: buyer.id,
      eventId: event.id,
      listingIds: [listing.id],
    });

    const request = await insertCartRequest(database, {
      cartId,
      items: [{ listingId: listing.id, title: 'Silla de prueba', priceCents: 125_000 }],
    });

    const first = new Date('2026-11-04T18:00:00.000Z');
    const later = new Date('2026-11-04T19:00:00.000Z');

    expect(
      await dismissCartRequest(database, {
        eventId: event.id,
        requestId: request.id,
        dismissedBy: admin.id,
        now: first,
      }),
    ).toBe(true);

    expect(
      await dismissCartRequest(database, {
        eventId: event.id,
        requestId: request.id,
        dismissedBy: admin.id,
        now: later,
      }),
    ).toBe(true);

    const rows = await database.query<{
      readonly dismissedAt: Date;
      readonly dismissedBy: string;
    }>(
      'SELECT dismissed_at AS "dismissedAt", dismissed_by AS "dismissedBy" FROM app.cart_request WHERE id = $1',
      [request.id],
    );

    expect(rows.rows[0]?.dismissedAt.toISOString()).toBe(first.toISOString());
    expect(rows.rows[0]?.dismissedBy).toBe(admin.id);
  });

  it('cancels an open request and refuses to dismiss a cancelled one', async () => {
    const { admin, buyer, event, listing } = await setup();

    const cartId = await replaceCart(database, {
      userId: buyer.id,
      eventId: event.id,
      listingIds: [listing.id],
    });

    const request = await insertCartRequest(database, {
      cartId,
      items: [{ listingId: listing.id, title: 'Silla de prueba', priceCents: 125_000 }],
    });

    await cancelOpenCartRequest(database, {
      cartId,
      now: new Date('2026-11-04T18:00:00.000Z'),
    });

    expect(await findOpenCartRequest(database, cartId)).toBeNull();
    expect(
      await dismissCartRequest(database, {
        eventId: event.id,
        requestId: request.id,
        dismissedBy: admin.id,
        now: new Date('2026-11-04T19:00:00.000Z'),
      }),
    ).toBe(false);
  });
});

describe('event contact', () => {
  it('stores digits only and rejects a number that wa.me could not use', async () => {
    const { event } = await setup();

    expect(await readEventContact(database, event.id)).toEqual({ contactPhone: null });

    expect(
      await updateEventContact(database, { eventId: event.id, contactPhone: '525512345678' }),
    ).toEqual({ contactPhone: '525512345678' });

    await expect(
      updateEventContact(database, { eventId: event.id, contactPhone: '12' }),
    ).rejects.toThrow();

    expect(await updateEventContact(database, { eventId: event.id, contactPhone: null })).toEqual({
      contactPhone: null,
    });
  });
});
