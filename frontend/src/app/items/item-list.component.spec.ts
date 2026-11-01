import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { ItemSummary } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { EventItemsStore } from '../events/event-items.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { ItemListComponent } from './item-list.component';

/**
 * La pestaña `Capturados` (`plan-ciclo-3d` §5): el indicador sale de `publishedSlug`, que llega del
 * borde en cada lectura, así que recargar no convierte un `publicado` en `en proceso`.
 */
const ITEMS_URL = '/api/events/event-1/items';

const PENDING: ItemSummary = {
  id: 'item-1',
  eventId: 'event-1',
  title: 'Mesa de roble',
  note: 'De madera',
  widthCm: 120,
  heightCm: 75,
  depthCm: 60,
  weightKg: 35,
  photo: { id: 'photo-1', sizes: { thumb: null, medium: null, large: null } },
  publishedSlug: null,
  createdAt: '2026-10-31T00:00:00.000Z',
};

const PUBLISHED: ItemSummary = {
  ...PENDING,
  id: 'item-2',
  title: 'Silla blanca',
  publishedSlug: 'silla-blanca-3f9a2c',
};

/** Un turno de macro-tarea: deja correr la cadena de promesas entre dos peticiones encadenadas. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('ItemListComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItemListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        EventItemsStore,
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: SHOP_BASE_URL, useValue: 'http://shop.test' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ eventId: 'event-1' }) } },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function render() {
    const fixture = TestBed.createComponent(ItemListComponent);
    fixture.detectChanges();
    return fixture;
  }

  type Fixture = ReturnType<typeof render>;

  /**
   * Las filas piden su miniatura con sesión: se drena lo que quede pendiente para que la verificación
   * del final no dependa del orden en que los efectos de las miniaturas se disparan.
   */
  function drainPhotos(): void {
    for (const request of httpTesting.match((candidate) =>
      candidate.url.startsWith('/api/photos/'),
    )) {
      request.flush(new Blob([]), { status: 200, statusText: 'OK' });
    }
  }

  async function settle(fixture: Fixture): Promise<void> {
    await tick();
    fixture.detectChanges();
    await tick();
    drainPhotos();
    fixture.detectChanges();
  }

  async function load(items: readonly ItemSummary[]) {
    const fixture = render();
    httpTesting.expectOne(ITEMS_URL).flush({ items });
    await settle(fixture);
    return fixture;
  }

  function statusOf(fixture: Fixture, index: number): string {
    const chips = fixture.nativeElement.querySelectorAll(
      '[data-testid="item-status"]',
    ) as NodeListOf<HTMLElement>;
    return chips[index]?.textContent?.trim() ?? '';
  }

  it('paints en proceso for an article without a listing', async () => {
    const fixture = await load([PENDING]);

    expect(statusOf(fixture, 0)).toBe('en proceso');
  });

  it('paints publicado and the link when the article has a slug', async () => {
    const fixture = await load([PUBLISHED]);

    expect(statusOf(fixture, 0)).toBe('publicado');

    const link = fixture.nativeElement.querySelector(
      '[data-testid="item-listing-link"]',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('http://shop.test/silla-blanca-3f9a2c');
  });

  it('publishes an en proceso article and reloads the list', async () => {
    const fixture = await load([PENDING]);

    (
      fixture.nativeElement.querySelector('[data-testid="item-publish"]') as HTMLButtonElement
    ).click();
    await settle(fixture);

    const request = httpTesting.expectOne('/api/events/event-1/items/item-1/listing');
    expect(request.request.method).toBe('POST');
    request.flush({ slug: 'mesa-de-roble-3f9a2c', path: '/mesa-de-roble-3f9a2c' });
    await settle(fixture);

    // La recarga es lo que convierte la fila en `publicado`: el estado no se guarda en memoria.
    httpTesting
      .expectOne(ITEMS_URL)
      .flush({ items: [{ ...PENDING, publishedSlug: 'mesa-de-roble-3f9a2c' }] });
    await settle(fixture);

    expect(statusOf(fixture, 0)).toBe('publicado');
  });

  it('explains a missing photo on the row that cannot be published', async () => {
    const fixture = await load([{ ...PENDING, photo: null }]);

    expect(
      fixture.nativeElement.querySelector('[data-testid="item-photo-pending"]'),
    ).not.toBeNull();
  });
});
