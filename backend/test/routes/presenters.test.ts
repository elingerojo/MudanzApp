import { toItemSummary } from '../../src/routes/presenters.js';
import type { ItemWithPhotoRecord } from '../../src/store/item-store.js';

/**
 * La derivación del artículo privado (corte 3e): la galería se publica **en el orden en que se leyó**.
 * El presentador no reordena ni inventa portada; el orden es la `position` y el índice 0 es la
 * portada (`plan-ciclo-3e` §4).
 */
const ITEM: ItemWithPhotoRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  eventId: '22222222-2222-4222-8222-222222222222',
  title: 'Mesa',
  note: null,
  widthCm: null,
  heightCm: null,
  depthCm: null,
  weightKg: null,
  priceCents: null,
  soldAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  photos: [
    { id: 'photo-b', variants: { thumb: { widthPx: 320, heightPx: 240 } } },
    { id: 'photo-a', variants: null },
  ],
  publishedSlug: null,
  unpublishedAt: null,
};

describe('toItemSummary', () => {
  it('publishes the gallery in the order it was read', () => {
    const summary = toItemSummary(ITEM);

    expect(summary.photos.map((photo) => photo.id)).toEqual(['photo-b', 'photo-a']);
    expect(summary.photos[0]?.sizes.thumb).toEqual({ widthPx: 320, heightPx: 240 });
    expect(summary.photos[1]?.sizes).toEqual({ thumb: null, medium: null, large: null });
  });

  it('publishes an empty gallery when the item has no photo', () => {
    const summary = toItemSummary({ ...ITEM, photos: [] });

    expect(summary.photos).toEqual([]);
  });
});
