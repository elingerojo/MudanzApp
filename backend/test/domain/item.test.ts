import { ITEM_LIMITS } from '@mudanzapp/shared';

import { isSupportedPhoto, normalizeItemDraft, photoContentType } from '../../src/domain/item.js';

/**
 * Núcleo puro del artículo: la evidencia unitaria del ciclo 3a (`resumen-funcional` §4, `capture`).
 * Sin base, sin HTTP y sin reloj.
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

describe('isSupportedPhoto', () => {
  it('accepts the three declared image types at the boundary size', () => {
    expect(isSupportedPhoto('image/jpeg', ITEM_LIMITS.photoBytes)).toBe(true);
    expect(isSupportedPhoto('image/png', 1)).toBe(true);
    expect(isSupportedPhoto('image/webp', 1_024)).toBe(true);
  });

  it('rejects a type that is not declared', () => {
    expect(isSupportedPhoto('image/gif', 1_024)).toBe(false);
    expect(isSupportedPhoto('application/pdf', 1_024)).toBe(false);
  });

  it('rejects an empty file and one byte over the limit', () => {
    expect(isSupportedPhoto('image/jpeg', 0)).toBe(false);
    expect(isSupportedPhoto('image/jpeg', ITEM_LIMITS.photoBytes + 1)).toBe(false);
  });
});

describe('photoContentType', () => {
  it('narrows a declared type and refuses anything else', () => {
    expect(photoContentType('image/png')).toBe('image/png');
    expect(photoContentType('image/gif')).toBeNull();
  });
});
