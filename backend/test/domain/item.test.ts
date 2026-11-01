import { ITEM_PHOTO_SIZES } from '@mudanzapp/shared';

import {
  hasEveryVariant,
  isAcceptedVariant,
  normalizeItemDraft,
  photoVariantContentType,
} from '../../src/domain/item.js';

/**
 * Núcleo puro del artículo: la evidencia unitaria del ciclo 3a (`resumen-funcional` §4, `capture`) y
 * el veredicto de variante del ciclo 3c-optimizar. Sin base, sin HTTP y sin reloj.
 */

describe('normalizeItemDraft', () => {
  it('keeps a complete draft and empties every absent measure', () => {
    expect(
      normalizeItemDraft({
        title: 'Bicicleta',
        note: 'Rodada 26',
        widthCm: 180,
        heightCm: 100,
        depthCm: 40,
        weightKg: 12.5,
      }),
    ).toEqual({
      title: 'Bicicleta',
      note: 'Rodada 26',
      widthCm: 180,
      heightCm: 100,
      depthCm: 40,
      weightKg: 12.5,
    });
  });

  it('turns an absent note and absent measures into null', () => {
    expect(normalizeItemDraft({ title: 'Silla' })).toEqual({
      title: 'Silla',
      note: null,
      widthCm: null,
      heightCm: null,
      depthCm: null,
      weightKg: null,
    });
  });

  it('treats an empty note as absence instead of an empty string', () => {
    expect(normalizeItemDraft({ title: 'Silla', note: '' }).note).toBeNull();
  });

  it('trims the title, because a title of only spaces is not a title', () => {
    expect(normalizeItemDraft({ title: '  Mesa  ' }).title).toBe('Mesa');
  });
});

describe('isAcceptedVariant', () => {
  it('accepts the encoder output at the boundary of its own size', () => {
    expect(isAcceptedVariant('thumb', 'image/webp', ITEM_PHOTO_SIZES.thumb.maxEdgePx, 180)).toBe(
      true,
    );
    expect(isAcceptedVariant('medium', 'image/jpeg', ITEM_PHOTO_SIZES.medium.maxEdgePx, 512)).toBe(
      true,
    );
    expect(isAcceptedVariant('large', 'image/webp', 1_080, ITEM_PHOTO_SIZES.large.maxEdgePx)).toBe(
      true,
    );
  });

  it('accepts a photo smaller than its size without enlarging it', () => {
    expect(isAcceptedVariant('large', 'image/webp', 400, 300)).toBe(true);
  });

  it('rejects a declared type that is not the encoder output', () => {
    expect(isAcceptedVariant('medium', 'image/png', 768, 512)).toBe(false);
    expect(isAcceptedVariant('medium', 'image/gif', 768, 512)).toBe(false);
  });

  it('rejects an edge that exceeds the size of its own variant', () => {
    expect(
      isAcceptedVariant('thumb', 'image/webp', ITEM_PHOTO_SIZES.thumb.maxEdgePx + 1, 100),
    ).toBe(false);
    expect(isAcceptedVariant('medium', 'image/webp', 1_024, 768)).toBe(false);
  });

  it('rejects zero, negative and fractional dimensions', () => {
    expect(isAcceptedVariant('thumb', 'image/webp', 0, 100)).toBe(false);
    expect(isAcceptedVariant('thumb', 'image/webp', 100, -1)).toBe(false);
    expect(isAcceptedVariant('thumb', 'image/webp', 100.5, 100)).toBe(false);
  });
});

describe('photoVariantContentType', () => {
  it('narrows the encoder output and refuses anything else', () => {
    expect(photoVariantContentType('image/webp')).toBe('image/webp');
    expect(photoVariantContentType('image/jpeg')).toBe('image/jpeg');
    expect(photoVariantContentType('image/png')).toBeNull();
  });
});

describe('hasEveryVariant', () => {
  it('is true only when the three sizes exist', () => {
    const size = { widthPx: 320, heightPx: 180 };

    expect(hasEveryVariant({ thumb: size, medium: size, large: size })).toBe(true);
    expect(hasEveryVariant({ thumb: size, medium: null, large: size })).toBe(false);
    expect(hasEveryVariant(null)).toBe(false);
  });
});
