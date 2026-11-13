import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type { ItemSummary } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { EventItemsStore } from '../events/event-items.store';
import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { ItemEditComponent } from './item-edit.component';

/**
 * La página de edición de `Capturados` (ciclo 4b, `plan-ciclo-4b` §7).
 *
 * Lo que se prueba es la frontera de la pantalla: precarga lo que el borde devolvió, manda el
 * `PATCH` con el precio convertido a centavos y limpia con `null` lo que la persona vació. Un precio
 * inválido no sale a la red.
 */
const ITEM_URL = '/api/events/event-1/items/item-1';
const ITEMS_URL = '/api/events/event-1/items';
const ORDER_URL = '/api/events/event-1/items/item-1/photos/order';

/** Un turno de macro-tarea: deja correr la cadena de promesas del recurso. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const ITEM: ItemSummary = {
  id: 'item-1',
  eventId: 'event-1',
  title: 'Mesa de roble',
  note: 'De madera',
  widthCm: 120,
  heightCm: 75,
  depthCm: 60,
  weightKg: 35,
  priceCents: 125_050,
  soldAt: null,
  photos: [],
  publishedSlug: 'mesa-de-roble-3f9a2c',
  unpublishedAt: null,
  createdAt: '2026-10-31T00:00:00.000Z',
};

/** La misma ficha con dos fotos: la tira muestra los controles de orden desde 3e. */
const GALLERY: ItemSummary = {
  ...ITEM,
  photos: [
    { id: 'photo-a', sizes: { thumb: null, medium: null, large: null } },
    { id: 'photo-b', sizes: { thumb: null, medium: null, large: null } },
  ],
};

describe('ItemEditComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItemEditComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        EventItemsStore,
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: SHOP_BASE_URL, useValue: 'http://shop.test' },
        {
          provide: SessionStore,
          useValue: {
            activeEventId: signal('event-1'),
            eventById: () => ({ currency: 'MXN' }),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ itemId: 'item-1' }),
            },
          },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  async function render(item: ItemSummary = ITEM) {
    const fixture = TestBed.createComponent(ItemEditComponent);
    fixture.detectChanges();
    httpTesting.expectOne(ITEM_URL).flush({ item });

    await tick();
    fixture.detectChanges();

    // El marco comparte el recurso de la lista: su lectura también se drena aquí.
    for (const request of httpTesting.match((candidate) => candidate.url === ITEMS_URL)) {
      request.flush({ items: [] });
    }

    await tick();
    fixture.detectChanges();

    // Cada miniatura de la tira se pide con la sesión del evento; se drena para que la verificación
    // del final no dependa del orden de los efectos.
    for (const request of httpTesting.match((candidate) =>
      candidate.url.startsWith('/api/photos/'),
    )) {
      request.flush(new Blob([]), { status: 200, statusText: 'OK' });
    }

    return fixture;
  }

  function click(fixture: { nativeElement: unknown }, testId: string): void {
    (
      (fixture.nativeElement as HTMLElement).querySelector(
        `[data-testid="${testId}"]`,
      ) as HTMLButtonElement
    ).click();
  }

  function input(fixture: { nativeElement: unknown }, testId: string): HTMLInputElement {
    return (fixture.nativeElement as HTMLElement).querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLInputElement;
  }

  function write(target: HTMLInputElement, value: string): void {
    target.value = value;
    target.dispatchEvent(new Event('input'));
  }

  it('prefills the editable fields from the item', async () => {
    const fixture = await render();

    expect(input(fixture, 'item-edit-title').value).toBe('Mesa de roble');
    expect(input(fixture, 'item-edit-note').value).toBe('De madera');
    expect(input(fixture, 'item-edit-price').value).toBe('1250.50');
    expect(input(fixture, 'item-edit-width').value).toBe('120');
  });

  it('sends the corrected text, the price in cents and null for cleared measures', async () => {
    const fixture = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    write(input(fixture, 'item-edit-title'), 'Mesa de roble pulida');
    write(input(fixture, 'item-edit-note'), '');
    write(input(fixture, 'item-edit-width'), '');
    write(input(fixture, 'item-edit-price'), '999.90');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector('form')
      ?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const request = httpTesting.expectOne(ITEM_URL);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      title: 'Mesa de roble pulida',
      note: null,
      widthCm: null,
      heightCm: 75,
      depthCm: 60,
      weightKg: 35,
      priceCents: 99_990,
    });

    request.flush({ item: { ...ITEM, title: 'Mesa de roble pulida', priceCents: 99_990 } });
    await tick();
    fixture.detectChanges();

    // El marco recarga la lista y la pantalla vuelve a `Capturados`.
    for (const reload of httpTesting.match((candidate) => candidate.url === ITEMS_URL)) {
      reload.flush({ items: [] });
    }
    await tick();
    expect(navigate).toHaveBeenCalledWith(['/capturados']);
  });

  it('rejects an invalid price without sending the PATCH', async () => {
    const fixture = await render();

    write(input(fixture, 'item-edit-price'), '12,50.00');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector('form')
      ?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="item-edit-error"]')
        ?.textContent,
    ).toContain('precio');
    httpTesting.expectNone(ITEM_URL);
  });

  it('sends the new publication order to the photos/order route', async () => {
    const fixture = await render(GALLERY);

    click(fixture, 'photo-gallery-down-0');
    fixture.detectChanges();

    const request = httpTesting.expectOne(ORDER_URL);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ photoIds: ['photo-b', 'photo-a'] });

    request.flush({ photos: [GALLERY.photos[1], GALLERY.photos[0]] });
    await tick();
    fixture.detectChanges();

    for (const reload of httpTesting.match((candidate) => candidate.url === ITEMS_URL)) {
      reload.flush({ items: [] });
    }
    await tick();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="item-edit-photo-hint"]')
        ?.textContent,
    ).toContain('no reescribe el borrador');
  });

  it('does not offer order controls nor call the route with a single photo', async () => {
    const fixture = await render({ ...ITEM, photos: [GALLERY.photos[0]!] });

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="photo-gallery-down-0"]'),
    ).toBeNull();
    httpTesting.expectNone(ORDER_URL);
  });
});
