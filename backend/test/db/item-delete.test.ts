import { randomUUID } from 'node:crypto';

import { createDatabase } from '../../src/db.js';
import { normalizeItemDraft } from '../../src/domain/item.js';
import { createEvent, ensureAdminUser } from '../../src/store/identity-store.js';
import {
  deleteItem,
  findItem,
  insertItem,
  upsertItemPhoto,
  upsertPhotoVariant,
} from '../../src/store/item-store.js';
import {
  findListingBySlug,
  findPublicEventIndex,
  upsertListing,
} from '../../src/store/listing-store.js';

/**
 * El borrado de una captura sobre la base real (ciclo 4c-4, `plan-ciclo-4c-event-admin` §8).
 *
 * La hipótesis dice que el catálogo deja de ofrecer el artículo. Lo que solo la base puede demostrar
 * es la **cascada**: la foto, sus variantes y la fila de `app.listing` caen con la fila del artículo
 * porque lo impone el DDL, no el código; y que el borrado tiene alcance de un evento.
 *
 * Solo entra con `test:api:db`/`:branch`, que derivan la URL de pruebas y activan
 * `MUDANZAPP_DB_TESTS=1` (`backend/vitest.config.ts`). La base es un sandbox desechable.
 */
const database = createDatabase(process.env.DATABASE_URL ?? null);

afterAll(async () => {
  await database.close();
});

describe('item delete', () => {
  it('removes the item, its photo, its variants and its listing, and the public page stops offering it', async () => {
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
      draft: normalizeItemDraft({ title: 'Sillón equivocado', note: 'Captura por error' }),
    });

    const photo = await upsertItemPhoto(database, {
      itemId: item.id,
      objectKey: `items/${randomUUID()}`,
      contentType: 'image/jpeg',
      byteSize: 1_024,
    });

    for (const variant of [
      { variant: 'large', widthPx: 1_440, heightPx: 1_080 },
      { variant: 'medium', widthPx: 768, heightPx: 576 },
      { variant: 'thumb', widthPx: 320, heightPx: 240 },
    ] as const) {
      await upsertPhotoVariant(database, {
        photoId: photo.id,
        variant: variant.variant,
        objectKey: `items/${randomUUID()}`,
        contentType: 'image/jpeg',
        widthPx: variant.widthPx,
        heightPx: variant.heightPx,
      });
    }

    const listing = await upsertListing(database, {
      itemId: item.id,
      slug: `sillon-equivocado-${item.id.slice(0, 6)}`,
    });

    expect(await findListingBySlug(database, listing.slug)).not.toBeNull();
    const before = await findPublicEventIndex(database, event.publicSlug ?? '');
    expect(before?.listings.map((entry) => entry.slug)).toContain(listing.slug);

    expect(await deleteItem(database, event.id, item.id)).toBe(true);

    // La fila del artículo y las que caen con ella.
    expect(await findItem(database, event.id, item.id)).toBeNull();
    expect(await findListingBySlug(database, listing.slug)).toBeNull();

    const photos = await database.query<{ readonly count: number }>(
      'SELECT count(*)::int AS "count" FROM app.item_photo WHERE item_id = $1',
      [item.id],
    );
    expect(photos.rows[0]?.count).toBe(0);

    const variants = await database.query<{ readonly count: number }>(
      'SELECT count(*)::int AS "count" FROM app.item_photo_variant WHERE photo_id = $1',
      [photo.id],
    );
    expect(variants.rows[0]?.count).toBe(0);

    const after = await findPublicEventIndex(database, event.publicSlug ?? '');
    expect(after?.listings.map((entry) => entry.slug)).not.toContain(listing.slug);

    // Borrar dos veces es un «no había fila», no un segundo efecto.
    expect(await deleteItem(database, event.id, item.id)).toBe(false);
  });

  it('does not delete an item of another event', async () => {
    const admin = await ensureAdminUser(database);
    expect(admin).not.toBeNull();
    if (admin === null) {
      return;
    }

    const own = await createEvent(database, {
      ownerUserId: admin.id,
      originCity: 'Bogotá',
      destinationCity: 'Cali',
      currency: 'MXN',
    });

    const foreign = await createEvent(database, {
      ownerUserId: admin.id,
      originCity: 'Lima',
      destinationCity: 'Arequipa',
      currency: 'MXN',
    });

    const foreignItem = await insertItem(database, {
      eventId: foreign.id,
      draft: normalizeItemDraft({ title: 'Artículo ajeno' }),
    });

    expect(await deleteItem(database, own.id, foreignItem.id)).toBe(false);
    expect(await findItem(database, foreign.id, foreignItem.id)).not.toBeNull();
  });
});
