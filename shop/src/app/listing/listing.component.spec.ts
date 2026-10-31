import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { PublicListing } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { ListingComponent } from './listing.component';

/**
 * La ficha pública (`plan-ciclo-3c` §7): pinta lo que el contrato entrega —título, medidas y foto—
 * y un enlace inexistente muestra su estado sin romper la shell.
 */
const LISTING: PublicListing = {
  slug: 'mesa-de-roble-3f9a2c',
  title: 'Mesa de roble',
  note: 'De madera',
  widthCm: 120,
  heightCm: 75,
  depthCm: 60,
  weightKg: 35,
  photo: { url: 'https://fake.r2.local/event/item/photo', contentType: 'image/png' },
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

  function render() {
    const fixture = TestBed.createComponent(ListingComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('paints the title, the measures and the photo from the public contract', async () => {
    const fixture = render();

    httpTesting.expectOne(`/api/public/listings/${LISTING.slug}`).flush(LISTING);
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="listing-title"]')?.textContent).toContain(
      'Mesa de roble',
    );
    expect(element.querySelector('[data-testid="listing-measures"]')?.textContent).toContain('120');
    expect(element.querySelector('[data-testid="listing-event"]')?.textContent).toContain('Bogotá');

    const photo = element.querySelector('[data-testid="listing-photo"]') as HTMLImageElement;
    expect(photo.getAttribute('src')).toBe(LISTING.photo?.url);

    expect(TestBed.inject(Title).getTitle()).toBe('Mesa de roble');
  });

  it('shows the unavailable state for a slug that does not exist', async () => {
    const fixture = render();

    httpTesting
      .expectOne(`/api/public/listings/${LISTING.slug}`)
      .flush({ error: 'not_found' }, { status: 404, statusText: 'Not Found' });

    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="listing-not-found"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="listing"]')).toBeNull();
    expect(element.querySelector('[data-testid="listing-error"]')).toBeNull();
  });
});
