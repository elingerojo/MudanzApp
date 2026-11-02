import {
  LISTING_LIMITS,
  LISTING_SLUG_PATTERN,
  SOLD_COURTESY_DAYS,
  listingState,
  soldCourtesyOver,
} from '@mudanzapp/shared';

import { listingSlug, slugifyTitle } from '../../src/domain/listing.js';

/**
 * El núcleo del `slug` (`plan-ciclo-3c` §7): el título produce una base legible, acentos fuera y
 * separadores colapsados, y dos artículos con el mismo título no colisionan porque el identificador
 * desempata.
 */
const SLUG = new RegExp(LISTING_SLUG_PATTERN);

describe('slugifyTitle', () => {
  it('strips accents and lowercases the title', () => {
    expect(slugifyTitle('Sillón de Madera')).toBe('sillon-de-madera');
  });

  it('collapses every separator into a single hyphen and trims the edges', () => {
    expect(slugifyTitle('  Mesa — roble  /  nogal  ')).toBe('mesa-roble-nogal');
  });

  it('drops characters that the pattern does not admit', () => {
    expect(slugifyTitle('Caja 40x30x20 (cartón)')).toBe('caja-40x30x20-carton');
  });
});

describe('listingSlug', () => {
  it('appends six characters of the item id', () => {
    expect(listingSlug('Silla de madera', '3f9a2c4d-1111-4222-8333-444455556666')).toBe(
      'silla-de-madera-3f9a2c',
    );
  });

  it('respects the pattern and the slug limit for a very long title', () => {
    const slug = listingSlug('Sillón'.repeat(60), 'a0b1c2d3-0000-4000-8000-000000000000');

    expect(slug.length).toBeLessThanOrEqual(LISTING_LIMITS.slug);
    expect(SLUG.test(slug)).toBe(true);
  });

  it('does not collide when two articles share the title', () => {
    const first = listingSlug('Bicicleta', '11111111-1111-4111-8111-111111111111');
    const second = listingSlug('Bicicleta', '22222222-2222-4222-8222-222222222222');

    expect(first).not.toBe(second);
    expect(SLUG.test(first)).toBe(true);
    expect(SLUG.test(second)).toBe(true);
  });

  it('falls back to a word when the title yields no admissible characters', () => {
    const slug = listingSlug('日本語', 'abcdef12-0000-4000-8000-000000000000');

    expect(slug).toBe('articulo-abcdef');
    expect(SLUG.test(slug)).toBe(true);
  });
});

describe('listingState', () => {
  const SOLD_AT = '2026-10-01T12:00:00.000Z';
  const sold = new Date(SOLD_AT);

  it('is live while the article has not been sold', () => {
    expect(listingState(null, sold)).toBe('live');
  });

  it('is sold during the courtesy window', () => {
    const justBefore = new Date(sold.getTime() + SOLD_COURTESY_DAYS * 24 * 60 * 60 * 1_000 - 1);

    expect(listingState(SOLD_AT, justBefore)).toBe('sold');
    expect(soldCourtesyOver(SOLD_AT, justBefore)).toBe(false);
  });

  it('is gone exactly at the end of the courtesy window', () => {
    const exactly = new Date(sold.getTime() + SOLD_COURTESY_DAYS * 24 * 60 * 60 * 1_000);

    expect(listingState(SOLD_AT, exactly)).toBe('gone');
    expect(soldCourtesyOver(SOLD_AT, exactly)).toBe(true);
  });
});
