import type { PublicEventIndex } from '@mudanzapp/shared';

import { renderEventIndexPage } from '../../src/render/event-index-page.js';

/**
 * El snapshot del índice (`plan-ciclo-4a` §7): una tarjeta por artículo en el orden publicado, la
 * versión incrustada, el marcador de la foto ausente y ninguna marca de sesión. El renderizador no
 * consulta la base: recibe el payload y coloca lo que resuelve `cardModel`.
 */
const PAYLOAD: PublicEventIndex = {
  version: 'a1b2c3d4e5f60718',
  event: {
    publicSlug: 'bogota-ciudad-de-mexico-3f9a2c',
    originCity: 'Bogotá',
    destinationCity: 'Ciudad de México',
    currency: 'MXN',
  },
  listings: [
    {
      slug: 'silla-de-madera-3f9a2c',
      title: 'Silla de madera',
      publishedAt: '2026-10-31T12:00:00.000Z',
      thumb: {
        url: 'https://fake.r2.local/event/item/uuid-thumb',
        widthPx: 320,
        heightPx: 240,
      },
    },
    {
      slug: 'mesa-de-roble-4a1b3c',
      title: 'Mesa de roble',
      publishedAt: '2026-10-30T12:00:00.000Z',
      thumb: null,
    },
  ],
};

describe('renderEventIndexPage', () => {
  it('renders one card per listing in the published order', () => {
    const html = renderEventIndexPage(PAYLOAD);

    expect(html.match(/data-testid="event-index-card"/g)).toHaveLength(2);
    expect(html.indexOf('Silla de madera')).toBeLessThan(html.indexOf('Mesa de roble'));
    expect(html).toContain('Bogotá → Ciudad de México');
  });

  it('embeds the version so the component can decide before touching the DOM', () => {
    const html = renderEventIndexPage(PAYLOAD);

    expect(html).toContain('<meta name="event-version" content="a1b2c3d4e5f60718">');
  });

  it('renders the thumbnail with its real dimensions and the shared srcset', () => {
    const html = renderEventIndexPage(PAYLOAD);

    expect(html).toContain('src="https://fake.r2.local/event/item/uuid-thumb"');
    expect(html).toContain('srcset="https://fake.r2.local/event/item/uuid-thumb 320w"');
    expect(html).toContain('width="320"');
    expect(html).toContain('height="240"');
  });

  it('shows the placeholder when the thumbnail is absent', () => {
    const html = renderEventIndexPage(PAYLOAD);
    const [withThumb = '', withoutThumb = ''] = html.split('<article').slice(1);

    expect(withThumb).toContain('<img');
    expect(withoutThumb).toContain('data-testid="event-index-card-thumb"></div>');
  });

  it('labels the publication date without Intl', () => {
    const html = renderEventIndexPage(PAYLOAD);

    expect(html).toContain('Publicado el 2026-10-31');
  });

  it('escapes user input and carries no session marks', () => {
    const html = renderEventIndexPage({
      ...PAYLOAD,
      listings: [
        {
          slug: 'caja-3f9a2c',
          title: '<script>alert(1)</script>',
          publishedAt: '2026-10-31T12:00:00.000Z',
          thumb: null,
        },
      ],
    });

    expect(html).toContain('\u0026lt;script\u0026gt;');
    expect(html).not.toContain('<script>');
    expect(html.toLowerCase()).not.toContain('session');
    expect(html.toLowerCase()).not.toContain('authorization');
    expect(html.toLowerCase()).not.toContain('token');
  });
});
