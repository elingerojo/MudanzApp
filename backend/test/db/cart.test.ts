import { cartRequestAvailableTotal } from '@mudanzapp/shared';

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
import { deleteItem, insertItem, updateItem } from '../../src/store/item-store.js';
import { markListingSold, unpublishListing, upsertListing } from '../../src/store/listing-store.js';

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
    // B8: el `ON DELETE SET NULL` deja el `listing_id` nulo y la lectura lo publica como `deleted`,
    // con la instantánea intacta.
    expect(requests[0]?.items).toEqual([
      {
        title: 'Silla de prueba',
        priceCents: 125_000,
        state: 'deleted',
        currentPriceCents: null,
      },
    ]);
    expect(requests[0]?.buyerName).toBe('Compradora de prueba');

    const dangling = await database.query<{ readonly count: number }>(
      'SELECT count(*)::int AS "count" FROM app.cart_request_item WHERE request_id = $1 AND listing_id IS NULL',
      [requests[0]?.id],
    );
    expect(dangling.rows[0]?.count).toBe(1);
  });

  it('derives price changes, republication and sale without rewriting the snapshot', async () => {
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

    const readItem = async () => {
      const requests = await listCartRequestsForEvent(database, event.id);
      return requests[0]?.items[0];
    };

    // La ficha nace sin precio: la instantánea de 125 000 ya no coincide.
    expect(await readItem()).toEqual({
      title: 'Silla de prueba',
      priceCents: 125_000,
      state: 'price_changed',
      currentPriceCents: null,
    });

    // Un precio nuevo publica `price_changed` con el precio actual.
    expect(await updateItem(database, event.id, item.id, { priceCents: 99_000 })).toBe(true);
    expect(await readItem()).toEqual({
      title: 'Silla de prueba',
      priceCents: 125_000,
      state: 'price_changed',
      currentPriceCents: 99_000,
    });

    // Igual que la instantánea: vigente.
    expect(await updateItem(database, event.id, item.id, { priceCents: 125_000 })).toBe(true);
    expect((await readItem())?.state).toBe('current');

    // Despublicar gana al precio y el estado se deriva sin tocar la solicitud.
    expect(
      await unpublishListing(database, item.id, new Date('2026-11-04T19:00:00.000Z')),
    ).not.toBeNull();
    expect((await readItem())?.state).toBe('unpublished');

    // Republicar limpia `unpublished_at` y el estado vuelve a `current`.
    await upsertListing(database, { itemId: item.id, slug: listing.slug });
    expect((await readItem())?.state).toBe('current');

    // Vender después de la solicitud publica `sold`.
    expect(
      await markListingSold(database, item.id, new Date('2026-11-04T20:00:00.000Z')),
    ).not.toBeNull();
    expect((await readItem())?.state).toBe('sold');

    // La instantánea sigue intacta en todos los casos.
    expect(await readItem()).toMatchObject({ title: 'Silla de prueba', priceCents: 125_000 });
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

  it('reads the open request with the same derived state the panel publishes', async () => {
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

    const readOpen = async () => {
      const open = await findOpenCartRequest(database, cartId);
      const panel = await listCartRequestsForEvent(database, event.id);
      // B9: los dos lectores derivan con el mismo fragmento; no pueden describir estados distintos.
      expect(open?.items).toEqual(panel[0]?.items);
      return open;
    };

    // La ficha nace sin precio: la instantánea de 125 000 ya no coincide y el importe vigente es 0.
    const fresh = await readOpen();
    expect(fresh?.items).toEqual([
      {
        title: 'Silla de prueba',
        priceCents: 125_000,
        state: 'price_changed',
        currentPriceCents: null,
      },
    ]);
    expect(cartRequestAvailableTotal(fresh?.items ?? [])).toBe(0);

    // Un precio nuevo suma el precio **de hoy**, no el de la instantánea.
    expect(await updateItem(database, event.id, item.id, { priceCents: 99_000 })).toBe(true);
    const repriced = await readOpen();
    expect(repriced?.items[0]).toMatchObject({
      priceCents: 125_000,
      state: 'price_changed',
      currentPriceCents: 99_000,
    });
    expect(cartRequestAvailableTotal(repriced?.items ?? [])).toBe(99_000);

    // Igual que la instantánea: vigente y con su precio.
    expect(await updateItem(database, event.id, item.id, { priceCents: 125_000 })).toBe(true);
    expect(cartRequestAvailableTotal((await readOpen())?.items ?? [])).toBe(125_000);

    // Despublicado: la instantánea se conserva y el importe vigente cae a cero.
    expect(
      await unpublishListing(database, item.id, new Date('2026-11-04T19:00:00.000Z')),
    ).not.toBeNull();
    const unpublished = await readOpen();
    expect(unpublished?.items[0]?.state).toBe('unpublished');
    expect(cartRequestAvailableTotal(unpublished?.items ?? [])).toBe(0);

    // Borrado: la fila sobrevive con `listing_id` nulo y el importe vigente sigue en cero.
    expect(await deleteItem(database, event.id, item.id)).toBe(true);
    const deleted = await readOpen();
    expect(deleted?.items[0]).toMatchObject({ state: 'deleted', currentPriceCents: null });
    expect(cartRequestAvailableTotal(deleted?.items ?? [])).toBe(0);
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
