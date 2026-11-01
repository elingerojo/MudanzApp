import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { PublicListing } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { ListingComponent } from './listing.component';

/**
 * La ficha pública (`plan-ciclo-3c` §7 y `plan-ciclo-3c-optimizar` §7): pinta lo que el contrato
 * entrega —título, medidas y los tres tamaños de la foto—, la mediana abre la grande y un enlace
 * inexistente muestra su estado sin romper la shell.
 */
const LISTING: PublicListing = {
  slug: 'mesa-de-roble-3f9a2c',
  title: 'Mesa de roble',
  note: 'De madera',
  widthCm: 120,
  heightCm: 75,
  depthCm: 60,
  weightKg: 35,
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
  event: { originCity: 'Bogotá', destinationCity: 'Ciudad de México' },
  publishedAt: '2026-10-31T12:00:00.000Z',
};

describe('ListingComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListingComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ slug: LISTING.slug }) },
          },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  async function render(body: PublicListing = LISTING) {
    const fixture = TestBed.createComponent(ListingComponent);
    fixture.detectChanges();

    httpTesting.expectOne(`/api/public/listings/${LISTING.slug}`).flush(body);
    await fixture.whenStable();
    fixture.detectChanges();

    return fixture;
  }

  function elementOf(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('paints the title, the measures and the medium size from the public contract', async () => {
    const fixture = await render();
    const element = elementOf(fixture);

    expect(element.querySelector('[data-testid="listing-title"]')?.textContent).toContain(
      'Mesa de roble',
    );
    expect(element.querySelector('[data-testid="listing-measures"]')?.textContent).toContain('120');
    expect(element.querySelector('[data-testid="listing-event"]')?.textContent).toContain('Bogotá');
    expect(element.querySelector('[data-testid="listing-photo-medium"]')?.textContent).toContain(
      '768',
    );

    const medium = element.querySelector('[data-testid="listing-photo"]') as HTMLImageElement;
    expect(medium.getAttribute('src')).toBe(LISTING.photo?.sizes.medium?.url);

    const thumb = element.querySelector('[data-testid="listing-photo-thumb"]') as HTMLImageElement;
    expect(thumb.getAttribute('src')).toBe(LISTING.photo?.sizes.thumb?.url);

    expect(TestBed.inject(Title).getTitle()).toBe('Mesa de roble');
  });

  it('opens the large size when the medium is tapped and closes it with Escape', async () => {
    const fixture = await render();
    const element = elementOf(fixture);

    expect(element.querySelector('[data-testid="listing-photo-overlay"]')).toBeNull();

    (element.querySelector('[data-testid="listing-photo-trigger"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const large = element.querySelector('[data-testid="listing-photo-large"]') as HTMLImageElement;
    expect(large.getAttribute('src')).toBe(LISTING.photo?.sizes.large?.url);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="listing-photo-overlay"]')).toBeNull();
    expect(document.activeElement).toBe(
      element.querySelector('[data-testid="listing-photo-trigger"]'),
    );
  });

  it('fills the missing sizes from the large one, which is the legacy fallback', async () => {
    const large = LISTING.photo?.sizes.large ?? null;
    const legacy: PublicListing = {
      ...LISTING,
      photo: { sizes: { thumb: null, medium: null, large } },
    };

    const fixture = await render(legacy);
    const element = elementOf(fixture);

    const medium = element.querySelector('[data-testid="listing-photo"]') as HTMLImageElement;
    const thumb = element.querySelector('[data-testid="listing-photo-thumb"]') as HTMLImageElement;

    expect(medium.getAttribute('src')).toBe(large?.url);
    expect(thumb.getAttribute('src')).toBe(large?.url);
  });

  it('shows the unavailable state for a slug that does not exist', async () => {
    const fixture = TestBed.createComponent(ListingComponent);
    fixture.detectChanges();

    httpTesting
      .expectOne(`/api/public/listings/${LISTING.slug}`)
      .flush({ error: 'not_found' }, { status: 404, statusText: 'Not Found' });

    await fixture.whenStable();
    fixture.detectChanges();

    const element = elementOf(fixture);
    expect(element.querySelector('[data-testid="listing-not-found"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="listing"]')).toBeNull();
    expect(element.querySelector('[data-testid="listing-error"]')).toBeNull();
  });
});
