import type { Database } from '../../src/db.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La cortesía de una ficha vendida (ciclo 4b, `plan-ciclo-4b` §5 y decisión §40) y el retiro de una
 * ficha despublicada (F3).
 *
 * El e2e no puede envejecer una venta ni despublicar sin escribir la base a mano, así que las reglas
 * se demuestran aquí con un doble de `Database` y un reloj fijo: `200` sin `noindex` mientras está
 * viva, `200` con `noindex` dentro de los treinta días, `410 listing_gone` después y
 * `410 listing_unpublished` cuando el vendedor la retiró.
 */
const NOW = new Date('2026-11-02T12:00:00.000Z');
const SLUG = 'mesa-de-roble-3f9a2c';

interface ListingStateFixture {
  readonly soldAt?: Date | null;
  readonly unpublishedAt?: Date | null;
}

function databaseWithState(state: ListingStateFixture): Database {
  const row = {
    slug: SLUG,
    title: 'Mesa de roble',
    note: 'De madera',
    widthCm: 120,
    heightCm: 75,
    depthCm: 60,
    weightKg: 35,
    priceCents: 125_050,
    soldAt: state.soldAt ?? null,
    photoObjectKey: null,
    photoVariants: null,
    eventId: '11111111-1111-4111-8111-111111111111',
    publicSlug: 'bogota-ciudad-de-mexico-3f9a2c',
    originCity: 'Bogotá',
    destinationCity: 'Ciudad de México',
    currency: 'MXN',
    publishedAt: new Date('2026-10-31T12:00:00.000Z'),
    unpublishedAt: state.unpublishedAt ?? null,
  };

  return {
    check: () => Promise.resolve('ok'),
    query: () =>
      Promise.resolve({ rows: [row], rowCount: 1, command: 'SELECT', oid: 0, fields: [] }),
    transaction: () => Promise.reject(new Error('not-stubbed')),
    close: () => Promise.resolve(),
  } as unknown as Database;
}

async function start(state: ListingStateFixture) {
  return startTestApp('ok', '', {
    database: databaseWithState(state),
    now: () => NOW,
  });
}

describe('public listing state', () => {
  it('serves a live listing without noindex', async () => {
    const app = await start({});
    try {
      const response = await fetch(`${app.baseUrl}/public/listings/${SLUG}`);

      expect(response.status).toBe(200);
      expect(response.headers.get('x-robots-tag')).toBeNull();
      await expect(response.json()).resolves.toMatchObject({
        priceCents: 125_050,
        soldAt: null,
        event: { currency: 'MXN' },
      });
    } finally {
      await app.close();
    }
  });

  it('answers 410 listing_unpublished and noindex when the seller unpublished it', async () => {
    const app = await start({ unpublishedAt: new Date('2026-11-05T12:00:00.000Z') });
    try {
      const response = await fetch(`${app.baseUrl}/public/listings/${SLUG}`);

      expect(response.status).toBe(410);
      expect(response.headers.get('x-robots-tag')).toBe('noindex');
      await expect(response.json()).resolves.toEqual({ error: 'listing_unpublished' });
    } finally {
      await app.close();
    }
  });

  it('answers the unpublished page with 410 and noindex', async () => {
    const app = await start({ unpublishedAt: new Date('2026-11-05T12:00:00.000Z') });
    try {
      const response = await fetch(`${app.baseUrl}/public/listings/${SLUG}/page`);

      expect(response.status).toBe(410);
      expect(response.headers.get('x-robots-tag')).toBe('noindex');
    } finally {
      await app.close();
    }
  });

  it('serves a sold listing with noindex inside the courtesy window', async () => {
    const app = await start({ soldAt: new Date('2026-10-20T12:00:00.000Z') });
    try {
      const response = await fetch(`${app.baseUrl}/public/listings/${SLUG}`);

      expect(response.status).toBe(200);
      expect(response.headers.get('x-robots-tag')).toBe('noindex');
      await expect(response.json()).resolves.toMatchObject({
        soldAt: '2026-10-20T12:00:00.000Z',
      });
    } finally {
      await app.close();
    }
  });

  it('keeps noindex and answers 410 after thirty days', async () => {
    const app = await start({ soldAt: new Date('2026-09-30T12:00:00.000Z') });
    try {
      const response = await fetch(`${app.baseUrl}/public/listings/${SLUG}`);

      expect(response.status).toBe(410);
      expect(response.headers.get('x-robots-tag')).toBe('noindex');
      await expect(response.json()).resolves.toEqual({ error: 'listing_gone' });
    } finally {
      await app.close();
    }
  });

  it('serves the sold snapshot with Vendido and noindex', async () => {
    const app = await start({ soldAt: new Date('2026-10-20T12:00:00.000Z') });
    try {
      const response = await fetch(`${app.baseUrl}/public/listings/${SLUG}/page`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('x-robots-tag')).toBe('noindex');
      expect(html).toContain('data-testid="listing-sold">Vendido');
      expect(html).toContain('<meta name="listing-version"');
    } finally {
      await app.close();
    }
  });

  it('answers the expired page with 410 and noindex', async () => {
    const app = await start({ soldAt: new Date('2026-09-30T12:00:00.000Z') });
    try {
      const response = await fetch(`${app.baseUrl}/public/listings/${SLUG}/page`);

      expect(response.status).toBe(410);
      expect(response.headers.get('x-robots-tag')).toBe('noindex');
    } finally {
      await app.close();
    }
  });
});
