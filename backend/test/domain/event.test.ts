import {
  EVENT_SLUG_SUFFIX_LENGTH,
  LISTING_LIMITS,
  LISTING_SLUG_PATTERN,
  eventPublicSlugSchema,
} from '@mudanzapp/shared';

import { eventPublicSlug, eventPublicSlugRetry } from '../../src/domain/event.js';

/**
 * Núcleo del `public_slug` del evento (ciclo 4a, `plan-ciclo-4a` §7): las ciudades producen una base
 * legible, acentos fuera y separadores colapsados, y el identificador desempata. El resultado siempre
 * cumple el contrato público y cabe en el `CHECK` de la tabla.
 */
const SLUG = new RegExp(LISTING_SLUG_PATTERN);
const EVENT_ID = '3f9a2c4d-1111-4222-8333-444455556666';

describe('eventPublicSlug', () => {
  it('derives the base from both cities and appends six characters of the event id', () => {
    expect(eventPublicSlug('Bogotá', 'Ciudad de México', EVENT_ID)).toBe(
      'bogota-ciudad-de-mexico-3f9a2c',
    );
  });

  it('strips accents, spaces and casing like the article slug', () => {
    expect(eventPublicSlug('  SAN JOSÉ ', 'Puerto   Limón', EVENT_ID)).toBe(
      'san-jose-puerto-limon-3f9a2c',
    );
  });

  it('respects the limit and the pattern for very long cities', () => {
    const slug = eventPublicSlug('Ciudad'.repeat(40), 'Destino'.repeat(40), EVENT_ID);

    expect(slug.length).toBeLessThanOrEqual(LISTING_LIMITS.slug);
    expect(SLUG.test(slug)).toBe(true);
  });

  it('accepts a slug the public contract validates', () => {
    const slug = eventPublicSlug('Quito', 'Guayaquil', EVENT_ID);

    expect(eventPublicSlugSchema.safeParse(slug).success).toBe(true);
  });

  it('falls back to a word when the cities yield no admissible characters', () => {
    const slug = eventPublicSlug('東京', '大阪', 'abcdef12-0000-4000-8000-000000000000');

    expect(slug).toBe('evento-abcdef');
    expect(SLUG.test(slug)).toBe(true);
  });

  it('does not collide when two events share the route', () => {
    const first = eventPublicSlug('Bogotá', 'Lima', '11111111-1111-4111-8111-111111111111');
    const second = eventPublicSlug('Bogotá', 'Lima', '22222222-2222-4222-8222-222222222222');

    expect(first).not.toBe(second);
  });

  it('uses eight characters in the collision retry', () => {
    const retried = eventPublicSlugRetry('Bogotá', 'Lima', EVENT_ID);

    expect(retried.endsWith(EVENT_ID.slice(0, 8))).toBe(true);
    expect(EVENT_SLUG_SUFFIX_LENGTH).toBe(6);
    expect(SLUG.test(retried)).toBe(true);
  });
});
