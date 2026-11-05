import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PublicCart } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { ShopSessionStore } from '../session/shop-session.store';
import { ShopCartStore } from './shop-cart.store';

/**
 * El carrito de seleccionados (ciclo 4e, `cart-request`).
 *
 * Lo que se prueba es la regla del corte: la lista local sirve sin cuenta, y al entrar se **une** con
 * la del servidor con un `PUT` que reemplaza entero (decisión §39). La lista no se parchea a mano.
 */
const PUBLIC_SLUG = 'bogota';
const CART_URL = `/api/public/events/${PUBLIC_SLUG}/cart`;
const SESSION_URL = '/api/auth/shop/session';

const SELLER_EVENT = { publicSlug: PUBLIC_SLUG, currency: 'MXN' };

const CART: PublicCart = {
  event: SELLER_EVENT,
  items: [
    {
      slug: 'silla',
      title: 'Silla',
      priceCents: 125_000,
      soldAt: null,
      addedAt: '2026-11-04T18:00:00.000Z',
    },
  ],
  whatsappAvailable: true,
  request: null,
};

const CART_WITH_BOTH: PublicCart = {
  ...CART,
  items: [
    ...CART.items,
    {
      slug: 'mesa',
      title: 'Mesa',
      priceCents: 90_000,
      soldAt: null,
      addedAt: '2026-11-04T18:05:00.000Z',
    },
  ],
};

const REQUESTED: PublicCart = {
  ...CART_WITH_BOTH,
  request: {
    id: 'request-1',
    reference: 'ab12cd34',
    requestedAt: '2026-11-04T19:00:00.000Z',
    whatsappUrl: 'https://wa.me/525512345678?text=hola',
  },
};

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('ShopCartStore', () => {
  let httpTesting: HttpTestingController;
  let store: ShopCartStore;
  let session: ShopSessionStore;

  beforeEach(() => {
    globalThis.localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ShopCartStore);
    session = TestBed.inject(ShopSessionStore);
  });

  afterEach(() => {
    httpTesting.verify();
    globalThis.localStorage.clear();
  });

  async function signIn(): Promise<void> {
    session.establish({
      sessionToken: 'shop-token',
      scope: 'shop',
      user: { id: 'user-1', displayName: 'Ana', isAdmin: false },
      event: null,
    });
    TestBed.tick();

    httpTesting.expectOne(SESSION_URL).flush({
      user: { id: 'user-1', displayName: 'Ana', isAdmin: false },
      session: { id: 'session-1', scope: 'shop' },
    });
    await tick();
  }

  it('keeps the selection in the browser while the visitor has no account', async () => {
    store.open(PUBLIC_SLUG);
    await store.toggle('silla');

    expect(store.has('silla')).toBe(true);
    expect(store.count()).toBe(1);
    expect(globalThis.localStorage.getItem(`mudanzapp.shop.selected.${PUBLIC_SLUG}`)).toBe(
      '["silla"]',
    );

    await store.toggle('silla');
    expect(store.has('silla')).toBe(false);
  });

  it('unions the local selection with the server cart when the buyer signs in', async () => {
    store.open(PUBLIC_SLUG);
    await store.toggle('mesa');

    await signIn();

    httpTesting.expectOne(CART_URL).flush({ cart: CART });
    await tick();

    // La unión no cabe en el carrito del servidor: se escribe entera y el borde devuelve el resultado.
    httpTesting.expectOne({ method: 'PUT', url: CART_URL }).flush({
      cart: CART_WITH_BOTH,
      dropped: [],
    });
    await tick();

    expect(store.items().map((item) => item.slug)).toEqual(['silla', 'mesa']);
    expect(store.has('mesa')).toBe(true);
    expect(store.whatsappAvailable()).toBe(true);
  });

  it('says an article without price blocks the request instead of failing in the border', async () => {
    store.open(PUBLIC_SLUG);
    await signIn();

    httpTesting.expectOne(CART_URL).flush({
      cart: {
        ...CART,
        items: [
          {
            slug: 'silla',
            title: 'Silla',
            priceCents: null,
            soldAt: null,
            addedAt: '2026-11-04T18:00:00.000Z',
          },
        ],
      },
    });
    await tick();

    expect(store.requestBlock()).toBe('unavailable');
  });

  it('requests the cart and keeps the reference and the link of the open request', async () => {
    store.open(PUBLIC_SLUG);
    await signIn();

    httpTesting.expectOne(CART_URL).flush({ cart: CART });
    await tick();

    const pending = store.request();
    httpTesting.expectOne({ method: 'POST', url: `${CART_URL}/request` }).flush({
      request: REQUESTED.request,
    });

    await expect(pending).resolves.toBe(REQUESTED.request?.whatsappUrl);

    // La respuesta del acto ya publica la solicitud abierta: no hace falta otra lectura.
    expect(store.openRequest()?.reference).toBe('ab12cd34');
    expect(store.openRequest()?.whatsappUrl).toBe(REQUESTED.request?.whatsappUrl);
  });
});
