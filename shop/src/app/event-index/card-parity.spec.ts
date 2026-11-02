import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { PublicEventIndex } from '@mudanzapp/shared';

import { renderEventIndexPage } from '../../../../backend/src/render/event-index-page.js';
import { API_BASE_URL } from '../api-base-url.token';
import { EventIndexComponent } from './event-index.component';

/**
 * Prueba de **paridad** de las dos renderizaciones (ciclo 4a, `plan-ciclo-4a` §7).
 *
 * Un mismo fixture pasa por el template del backend y por el componente en `TestBed`; se normaliza
 * lo que no es contenido —`class`, orden de atributos, los atributos que añade `NgOptimizedImage`
 * (`loading`, `decoding`, `fetchpriority`) y las marcas del compilador— y ambas salidas deben ser
 * iguales. Es la garantía de que las dos renderizaciones no se separan.
 */
const SLUG = 'bogota-ciudad-de-mexico-3f9a2c';

const PAYLOAD: PublicEventIndex = {
  version: 'a1b2c3d4e5f60718',
  event: {
    publicSlug: SLUG,
    originCity: 'Bogotá',
    destinationCity: 'Ciudad de México',
    currency: 'MXN',
  },
  listings: [
    {
      slug: 'silla-de-madera-3f9a2c',
      title: 'Silla de madera',
      publishedAt: '2026-10-31T12:00:00.000Z',
      priceCents: 125_050,
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
      priceCents: null,
      thumb: null,
    },
  ],
};

/** Atributos que no son contenido: los normaliza la comparación, no el contrato. */
const IGNORED_ATTRIBUTES = new Set(['class', 'loading', 'decoding', 'fetchpriority']);

function canonical(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const attributes = [...element.attributes]
    .filter(
      (attribute) =>
        !IGNORED_ATTRIBUTES.has(attribute.name) &&
        !attribute.name.startsWith('_ng') &&
        !attribute.name.startsWith('ng-'),
    )
    .map((attribute) => {
      // `NgOptimizedImage` antepone `auto, ` a `sizes`: es una pista del navegador, no contenido.
      const value =
        attribute.name === 'sizes' ? attribute.value.replace(/^auto,\s*/, '') : attribute.value;

      return `${attribute.name}="${value}"`;
    })
    .sort()
    .join(' ');

  const children = [...element.childNodes]
    .map(canonical)
    .filter((part) => part.length > 0)
    .join('');

  return `<${tag} ${attributes}>${children}</${tag}>`;
}

describe('event index card parity', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventIndexComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ publicSlug: SLUG }) } },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('renders the same list in the backend template and in the component', async () => {
    const serverList = new DOMParser()
      .parseFromString(renderEventIndexPage(PAYLOAD), 'text/html')
      .querySelector('[data-testid="event-index-list"]');

    const fixture = TestBed.createComponent(EventIndexComponent);
    fixture.detectChanges();
    httpTesting.expectOne(`/api/public/events/${SLUG}`).flush(PAYLOAD);
    await fixture.whenStable();
    fixture.detectChanges();

    const clientList = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="event-index-list"]',
    );

    expect(serverList).not.toBeNull();
    expect(clientList).not.toBeNull();

    expect(canonical(clientList as Element)).toBe(canonical(serverList as Element));
  });
});
