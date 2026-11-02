import { createDatabase } from '../../src/db.js';
import { normalizeItemDraft, normalizeItemUpdate } from '../../src/domain/item.js';
import { createEvent, ensureAdminUser } from '../../src/store/identity-store.js';
import { findItem, insertItem, updateItem } from '../../src/store/item-store.js';
import {
  findListingBySlug,
  findPublicEventIndex,
  markListingSold,
  upsertListing,
} from '../../src/store/listing-store.js';

/**
 * La edición y la venta sobre la base real (ciclo 4b, `plan-ciclo-4b` §7).
 *
 * Solo entra con `test:api:db`/`:branch`, que derivan la URL de pruebas y activan
 * `MUDANZAPP_DB_TESTS=1` (`backend/vitest.config.ts`). La base es un sandbox desechable.
 */
const database = createDatabase(process.env.DATABASE_URL ?? null);

afterAll(async () => {
  await database.close();
});

describe('item edit and sold', () => {
  it('updates the price and text without touching the published slug, then sells idempotently', async () => {
    const admin = await ensureAdminUser(database);
    expect(admin).not.toBeNull();
    if (admin === null) {
      return;
    }

    const event = await createEvent(database, {
      ownerUserId: admin.id,
      originCity: 'Quito',
      destinationCity: 'Guayaquil',
      currency: 'MXN',
    });

    const item = await insertItem(database, {
      eventId: event.id,
      draft: normalizeItemDraft({ title: 'Mesa de roble', note: 'De madera' }),
    });

    const listing = await upsertListing(database, {
      itemId: item.id,
      slug: `mesa-de-roble-${item.id.slice(0, 6)}`,
    });

    const updated = await updateItem(
      database,
      event.id,
      item.id,
      normalizeItemUpdate({
        title: 'Mesa de roble pulida',
        note: null,
        widthCm: 120,
        heightCm: 75,
        depthCm: 60,
        weightKg: 35,
        priceCents: 125_050,
      }),
    );
    expect(updated).toBe(true);

    const afterEdit = await findItem(database, event.id, item.id);
    expect(afterEdit).toMatchObject({
      title: 'Mesa de roble pulida',
      note: null,
      widthCm: 120,
      priceCents: 125_050,
      publishedSlug: listing.slug,
      soldAt: null,
    });

    const soldAt = new Date('2026-11-02T12:00:00.000Z');
    const firstSale = await markListingSold(database, item.id, soldAt);
    expect(firstSale?.soldAt).toEqual(soldAt);

    const secondSale = await markListingSold(
      database,
      item.id,
      new Date('2026-11-03T12:00:00.000Z'),
    );
    expect(secondSale?.soldAt).toEqual(soldAt);

    const afterSale = await findItem(database, event.id, item.id);
    expect(afterSale?.soldAt).toEqual(soldAt);

    const publicListing = await findListingBySlug(database, listing.slug);
    expect(publicListing).toMatchObject({
      priceCents: 125_050,
      soldAt,
      currency: 'MXN',
    });

    const index = await findPublicEventIndex(database, event.publicSlug ?? '');
    expect(index?.listings.map((entry) => entry.slug)).not.toContain(listing.slug);
  });
});
