import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { PublicListing } from '@mudanzapp/shared';

import { renderListingPage } from '../../../../backend/src/render/listing-page.js';
import { API_BASE_URL } from '../api-base-url.token';
import { ListingComponent } from './listing.component';

/**
 * Prueba de **paridad** de las dos renderizaciones de la ficha (ciclo 4b, `plan-ciclo-4b` §7).
 *
 * Un mismo fixture pasa por el template del backend y por el componente en `TestBed`; se normaliza lo
 * que no es contenido —`class`, orden de atributos, los que añade `NgOptimizedImage` (`loading`,
 * `decoding`, `fetchpriority`) y las marcas del compilador— y ambas salidas deben ser iguales.
 */
const SLUG = 'mesa-de-roble-3f9a2c';

const LISTING: PublicListing = {
  version: 'a1b2c3d4e5f60718',
  slug: SLUG,
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

/** Atributos que no son contenido: los normaliza la comparación, no el contrato. */
const IGNORED_ATTRIBUTES = new Set(['class', 'loading', 'decoding', 'fetchpriority', 'priority']);

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

describe('listing page parity', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListingComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ slug: SLUG }) } },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('renders the same listing in the backend template and in the component', async () => {
    const server = new DOMParser()
      .parseFromString(renderListingPage(LISTING), 'text/html')
      .querySelector('[data-testid="listing"]');

    const fixture = TestBed.createComponent(ListingComponent);
    fixture.detectChanges();
    httpTesting.expectOne(`/api/public/listings/${SLUG}`).flush(LISTING);
    await fixture.whenStable();
    fixture.detectChanges();

    const client = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="listing"]');

    expect(server).not.toBeNull();
    expect(client).not.toBeNull();
    expect(canonical(client as Element)).toBe(canonical(server as Element));
  });
});
