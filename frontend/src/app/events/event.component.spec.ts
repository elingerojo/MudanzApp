import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { API_BASE_URL } from '../api-base-url.token';
import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { EventComponent } from './event.component';

/**
 * El marco de la sección (`plan-ciclo-3d` §5): dos pestañas enlazables y el contador de `Capturados`,
 * que sale del mismo recurso que pinta la lista.
 *
 * La sesión se sustituye por un doble: lo que se prueba es el marco, y su `SessionStore` haría una
 * petición de identidad que aquí no aporta nada.
 */
const ITEM = {
  id: 'item-1',
  eventId: 'event-1',
  title: 'Mesa de roble',
  note: null,
  widthCm: null,
  heightCm: null,
  depthCm: null,
  weightKg: null,
  priceCents: null,
  soldAt: null,
  photo: null,
  publishedSlug: null,
  createdAt: '2026-10-31T00:00:00.000Z',
};

describe('EventComponent', () => {
  let httpTesting: HttpTestingController;
  let identityFailed: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    identityFailed = signal(false);

    await TestBed.configureTestingModule({
      imports: [EventComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
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
  });

  function render() {
    const fixture = TestBed.createComponent(EventComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('offers the two tabs of the section', () => {
    const fixture = render();
    httpTesting.expectOne('/api/events/event-1/items').flush({ items: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="event-tab-capture"]')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="event-tab-captured"]'),
    ).not.toBeNull();
  });

  it('counts the articles in the Capturados tab from the same read as the list', async () => {
    const fixture = render();
    httpTesting.expectOne('/api/events/event-1/items').flush({ items: [ITEM] });

    await fixture.whenStable();
    fixture.detectChanges();

    const captured = fixture.nativeElement.querySelector(
      '[data-testid="event-tab-captured"]',
    ) as HTMLElement;
    expect(captured.textContent).toContain('Capturados (1)');
  });

  it('keeps the warning visible when the session is no longer valid', async () => {
    identityFailed.set(true);

    const fixture = render();
    httpTesting.expectOne('/api/events/event-1/items').flush({ items: [ITEM] });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="event-session-invalid"]'),
    ).not.toBeNull();
  });
});
