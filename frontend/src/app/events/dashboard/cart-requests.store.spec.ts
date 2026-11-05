import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CartRequestSummary } from '@mudanzapp/shared';

import { API_BASE_URL } from '../../api-base-url.token';
import { CartRequestsStore } from './cart-requests.store';

/**
 * La lectura y el acto de las solicitudes de carrito (ciclo 4e).
 *
 * Lo que se prueba es que la lista **sale del servidor** y que descartar vuelve a leer: la copia local
 * no se parchea a mano, porque el estado que se pinta tiene que ser el que el borde escribió.
 */
const REQUESTS_URL = '/api/events/event-1/cart-requests';
const DISMISS_URL = '/api/events/event-1/cart-requests/request-1';

const REQUEST: CartRequestSummary = {
  id: 'request-1',
  reference: 'ab12cd34',
  buyerName: 'Compradora',
  itemCount: 2,
  items: [
    { title: 'Silla', priceCents: 125_000 },
    { title: 'Mesa', priceCents: 90_000 },
  ],
  requestedAt: '2026-11-04T18:00:00.000Z',
  dismissedAt: null,
  cancelledAt: null,
};

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('CartRequestsStore', () => {
  let httpTesting: HttpTestingController;
  let store: CartRequestsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    store = TestBed.inject(CartRequestsStore);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('reads the requests of the event it was given', async () => {
    store.load('event-1');
    TestBed.tick();

    expect(store.loading()).toBe(true);

    httpTesting.expectOne(REQUESTS_URL).flush({ requests: [REQUEST] });
    await tick();

    expect(store.requests()).toHaveLength(1);
    expect(store.requests()[0]?.buyerName).toBe('Compradora');
    expect(store.failed()).toBe(false);
  });

  it('dismisses and reads again instead of patching the local copy', async () => {
    store.load('event-1');
    TestBed.tick();
    httpTesting.expectOne(REQUESTS_URL).flush({ requests: [REQUEST] });
    await tick();

    const dismissing = store.dismiss(REQUEST);
    httpTesting.expectOne(DISMISS_URL).flush(null, { status: 204, statusText: 'No Content' });
    await dismissing;

    // `reload()` marca el recurso; la petición sale en el siguiente ciclo de la aplicación.
    TestBed.tick();

    httpTesting
      .expectOne(REQUESTS_URL)
      .flush({ requests: [{ ...REQUEST, dismissedAt: '2026-11-04T19:00:00.000Z' }] });
    await tick();

    expect(store.requests()[0]?.dismissedAt).toBe('2026-11-04T19:00:00.000Z');
    expect(store.dismissingId()).toBeNull();
    expect(store.failure()).toBeNull();
  });

  it('explains a forbidden dismissal with its own phrase', async () => {
    store.load('event-1');
    TestBed.tick();
    httpTesting.expectOne(REQUESTS_URL).flush({ requests: [REQUEST] });
    await tick();

    const dismissing = store.dismiss(REQUEST);
    httpTesting
      .expectOne(DISMISS_URL)
      .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
    await dismissing;

    expect(store.failure()).toContain('No puedes descartar solicitudes de este evento.');
    expect(store.dismissingId()).toBeNull();
  });
});
