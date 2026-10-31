import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { ItemSummary } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { EventComponent } from './event.component';

/**
 * La publicación desde la superficie privada (`plan-ciclo-3c` §7): el enlace se compone con el
 * origen compilado de `shop` y el `slug` que devuelve el backend, un artículo sin foto se explica por
 * su código y una sesión sin acceso no rompe la lista.
 *
 * La sesión se sustituye por un doble: lo que se prueba es el componente, y su `SessionStore` haría
 * una petición de identidad que aquí no aporta nada.
 */
const ITEM: ItemSummary = {
  id: 'item-1',
  eventId: 'event-1',
  title: 'Mesa de roble',
  note: 'De madera',
  widthCm: 120,
  heightCm: 75,
  depthCm: 60,
  weightKg: 35,
  photo: null,
  createdAt: '2026-10-31T00:00:00.000Z',
};

const LISTING_URL = '/api/events/event-1/items/item-1/listing';

describe('EventComponent publishing', () => {
  let httpTesting: HttpTestingController;
  let identityFailed: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    identityFailed = signal(false);

    await TestBed.configureTestingModule({
      imports: [EventComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: SHOP_BASE_URL, useValue: 'http://shop.test' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ eventId: 'event-1' }) } },
        },
        {
          provide: SessionStore,
          useValue: { eventById: () => null, identityFailed },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  function render() {
    const fixture = TestBed.createComponent(EventComponent);
    fixture.detectChanges();
    return fixture;
  }

  function loadItems(): void {
    httpTesting.expectOne('/api/events/event-1/items').flush({ items: [ITEM] });
  }

  it('publishes the article and paints the link with the compiled shop origin', async () => {
    const fixture = render();
    loadItems();
    await fixture.whenStable();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="item-publish"]',
    ) as HTMLButtonElement;
    button.click();

    const request = httpTesting.expectOne(LISTING_URL);
    expect(request.request.method).toBe('POST');
    request.flush({ slug: 'mesa-de-roble-3f9a2c', path: '/mesa-de-roble-3f9a2c' });

    await fixture.whenStable();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      '[data-testid="item-listing-link"]',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('http://shop.test/mesa-de-roble-3f9a2c');
    expect(link.textContent).toContain('mesa-de-roble-3f9a2c');
    expect(fixture.nativeElement.querySelector('[data-testid="item-publish"]')).toBeNull();
  });

  it('explains a missing photo next to the article instead of a generic error', async () => {
    const fixture = render();
    loadItems();
    await fixture.whenStable();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="item-publish"]',
    ) as HTMLButtonElement;
    button.click();

    httpTesting
      .expectOne(LISTING_URL)
      .flush({ error: 'listing_photo_required' }, { status: 409, statusText: 'Conflict' });

    await fixture.whenStable();
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector(
      '[data-testid="item-listing-error"]',
    ) as HTMLElement;
    expect(error.textContent).toContain('foto');
    expect(fixture.nativeElement.querySelector('[data-testid="item-listing-link"]')).toBeNull();
  });

  it('keeps the list readable when the session is no longer valid', async () => {
    identityFailed.set(true);

    const fixture = render();
    loadItems();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="event-session-invalid"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="item-title"]')?.textContent,
    ).toContain('Mesa de roble');
  });
});
