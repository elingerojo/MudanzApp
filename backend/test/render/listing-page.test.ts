import type { PublicListing } from '@mudanzapp/shared';

import { renderListingPage } from '../../src/render/listing-page.js';

/**
 * El snapshot de la ficha pública (ciclo 4b, `plan-ciclo-4b` §7): el fragmento trae lo que la ficha
 * pinta, la versión incrustada y el estado vendido cuando corresponde. El renderizador no consulta la
 * base: recibe el payload y coloca lo que resuelve `listingPageModel`.
 */
const LISTING: PublicListing = {
  version: 'a1b2c3d4e5f60718',
  slug: 'mesa-de-roble-3f9a2c',
  title: 'Mesa de roble',
  note: 'De madera',
  widthCm: 120,
  heightCm: 75,
  depthCm: 60,
  weightKg: 35,
  priceCents: 125_050,
  soldAt: null,
  photo: {
    sizes: {
      thumb: { url: 'https://fake.r2.local/event/item/uuid-thumb', widthPx: 320, heightPx: 240 },
      medium: { url: 'https://fake.r2.local/event/item/uuid-medium', widthPx: 768, heightPx: 576 },
      large: {
        url: 'https://fake.r2.local/event/item/uuid-large',
        widthPx: 1_440,
        heightPx: 1_080,
      },
    },
  },
  event: {
    originCity: 'Bogotá',
    destinationCity: 'Ciudad de México',
    publicSlug: 'bogota-ciudad-de-mexico-3f9a2c',
    currency: 'MXN',
  },
  publishedAt: '2026-10-31T12:00:00.000Z',
};

describe('renderListingPage', () => {
  it('renders the title, price, measures and the way back to the index', () => {
    const html = renderListingPage(LISTING);

    expect(html).toContain('data-testid="listing-title">Mesa de roble');
    expect(html).toContain('$1,250.50 MXN');
    expect(html).toContain('120 × 75 × 60 cm · 35 kg');
    expect(html).toContain('De madera');
    expect(html).toContain('href="/evento/bogota-ciudad-de-mexico-3f9a2c"');
  });

  it('embeds the version so the component can decide before touching the DOM', () => {
    const html = renderListingPage(LISTING);

    expect(html).toContain('<meta name="listing-version" content="a1b2c3d4e5f60718">');
    expect(html).toContain('id="ficha-snapshot"');
  });

  it('paints the stored photo with its real dimensions', () => {
    const html = renderListingPage(LISTING);

    expect(html).toContain('src="https://fake.r2.local/event/item/uuid-medium"');
    expect(html).toContain('width="768"');
    expect(html).toContain('height="576"');
    expect(html).toContain('src="https://fake.r2.local/event/item/uuid-thumb"');
  });

  it('shows the sold label only when the listing has a sold instant', () => {
    expect(renderListingPage(LISTING)).not.toContain('data-testid="listing-sold"');

    const sold = {
      ...LISTING,
      soldAt: '2026-11-02T12:00:00.000Z',
      version: 'b2c3d4e5f6071829',
    };

    expect(renderListingPage(sold)).toContain('data-testid="listing-sold">Vendido');
  });

  it('escapes user input and carries no session marks', () => {
    const html = renderListingPage({
      ...LISTING,
      title: '<script>alert(1)</script>',
      note: '<b>nota</b>',
    });

    expect(html).toContain('\u0026lt;script\u0026gt;');
    expect(html).toContain('\u0026lt;b\u0026gt;nota\u0026lt;/b\u0026gt;');
    expect(html).not.toContain('<script>');
    expect(html.toLowerCase()).not.toContain('session');
    expect(html.toLowerCase()).not.toContain('authorization');
    expect(html.toLowerCase()).not.toContain('token');
  });
});
