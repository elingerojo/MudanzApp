import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { BuyerCartRequest, CartItem } from '@mudanzapp/shared';

import { SHOP_OAUTH_FLOW } from '../session/shop-oauth-flow';
import { ShopSessionStore } from '../session/shop-session.store';
import { ShopCartComponent } from './shop-cart.component';
import { ShopCartStore } from './shop-cart.store';

/**
 * El importe del carrito en la pantalla (ciclo B1, corrección 2026-11-07).
 *
 * La pantalla no deriva el total: muestra el valor publicado y distingue el `null` legítimo de un
 * artículo sin precio («Precio a consultar») del campo ausente de un borde anterior («Total no
 * disponible»).
 */
const ITEM: CartItem = {
  slug: 'silla',
  title: 'Silla',
  priceCents: 125_000,
  soldAt: null,
  addedAt: '2026-11-04T18:00:00.000Z',
};

describe('ShopCartComponent total', () => {
  let totalCents: ReturnType<typeof signal<number | null>>;
  let totalUnavailable: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    totalCents = signal<number | null>(125_000);
    totalUnavailable = signal(false);

    await TestBed.configureTestingModule({
      imports: [ShopCartComponent],
      providers: [
        provideRouter([]),
        {
          provide: ShopCartStore,
          useValue: {
            items: signal<readonly CartItem[]>([ITEM]),
            unpublished: signal<readonly { readonly slug: string; readonly title: string }[]>([]),
            openRequest: signal<{
              readonly reference: string;
              readonly whatsappUrl: string | null;
            } | null>(null),
            whatsappAvailable: signal(true),
            requestBlock: signal<'session' | 'empty' | 'whatsapp' | 'unavailable' | null>(null),
            busy: signal(false),
            cleaning: signal(false),
            dropped: signal<readonly string[]>([]),
            failure: signal<string | null>(null),
            currency: signal('MXN'),
            totalCents,
            totalUnavailable,
            count: () => 1,
            open: () => undefined,
            toggle: () => Promise.resolve(),
            request: () => Promise.resolve(null),
            cancelRequest: () => Promise.resolve(),
            dismissUnpublished: () => undefined,
          },
        },
        { provide: ShopSessionStore, useValue: { hasSession: signal(true) } },
        {
          provide: SHOP_OAUTH_FLOW,
          useValue: { begin: () => Promise.resolve(), complete: () => Promise.reject() },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ publicSlug: 'bogota' }) } },
        },
      ],
    }).compileComponents();
  });

  function renderTotal(): string {
    const fixture = TestBed.createComponent(ShopCartComponent);
    fixture.detectChanges();

    return (
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="cart-total"]')
        ?.textContent ?? ''
    );
  }

  it('shows the published amount', () => {
    expect(renderTotal()).toContain('$1,250.00 MXN');
  });

  it('shows an explicit unavailable total when the border does not publish it', () => {
    totalCents.set(null);
    totalUnavailable.set(true);

    expect(renderTotal()).toContain('Total no disponible');
  });

  it('keeps the incomplete label for a published null', () => {
    totalCents.set(null);
    totalUnavailable.set(false);

    expect(renderTotal()).toContain('Precio a consultar');
  });
});

const REQUEST: BuyerCartRequest = {
  id: 'request-1',
  reference: 'ab12cd34',
  requestedAt: '2026-11-04T18:00:00.000Z',
  whatsappUrl: 'https://wa.me/525512345678?text=hola',
  items: [
    { title: 'Silla', priceCents: 125_000, state: 'current', currentPriceCents: 125_000 },
    { title: 'Ropero', priceCents: 45_000, state: 'unpublished', currentPriceCents: 45_000 },
    { title: 'Mesa', priceCents: 90_000, state: 'sold', currentPriceCents: 90_000 },
    { title: 'Sofá', priceCents: 125_000, state: 'price_changed', currentPriceCents: 99_000 },
    { title: 'Cama', priceCents: 50_000, state: 'deleted', currentPriceCents: null },
  ],
  // Silla a su precio y Sofá al precio de hoy; despublicado, vendido y eliminado suman cero.
  totalCents: 125_000 + 99_000,
  hasChanges: true,
};

describe('ShopCartComponent request record', () => {
  let openRequest: ReturnType<typeof signal<BuyerCartRequest | null>>;

  function storeStub() {
    return {
      items: signal<readonly CartItem[]>([]),
      unpublished: signal<readonly { readonly slug: string; readonly title: string }[]>([]),
      openRequest,
      whatsappAvailable: signal(true),
      requestBlock: signal<'session' | 'empty' | 'whatsapp' | 'unavailable' | null>(null),
      busy: signal(false),
      cleaning: signal(false),
      dropped: signal<readonly string[]>([]),
      failure: signal<string | null>(null),
      currency: signal('MXN'),
      totalCents: signal<number | null>(0),
      totalUnavailable: signal(false),
      count: () => 0,
      open: () => undefined,
      toggle: () => Promise.resolve(),
      request: () => Promise.resolve(null),
      cancelRequest: () => Promise.resolve(),
      dismissUnpublished: () => undefined,
    };
  }

  async function render(request: unknown): Promise<HTMLElement> {
    openRequest = signal<BuyerCartRequest | null>(request as BuyerCartRequest | null);

    await TestBed.configureTestingModule({
      imports: [ShopCartComponent],
      providers: [
        provideRouter([]),
        { provide: ShopCartStore, useValue: storeStub() },
        { provide: ShopSessionStore, useValue: { hasSession: signal(true) } },
        {
          provide: SHOP_OAUTH_FLOW,
          useValue: { begin: () => Promise.resolve(), complete: () => Promise.reject() },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ publicSlug: 'bogota' }) } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ShopCartComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function testId(element: HTMLElement, id: string): Element | null {
    return element.querySelector(`[data-testid="${id}"]`);
  }

  it('is collapsed by default and summarizes the request in the summary', async () => {
    const element = await render(REQUEST);

    const card = element.querySelector('details[data-testid="cart-requested"]');
    expect(card).not.toBeNull();
    expect(card?.hasAttribute('open')).toBe(false);

    const summary = card?.querySelector('summary');
    expect(summary?.textContent).toContain('ab12cd34');
    expect(summary?.textContent).toContain('5 artículos');
    expect(testId(element, 'cart-request-total')?.textContent).toContain('$2,240.00 MXN');
    // La nota de precio se lee sin expandir y es texto, no solo color.
    expect(testId(element, 'cart-request-price-notice')?.textContent).toContain(
      'Atención, al menos uno de los artículos cambió de precio.',
    );
  });

  it('expands into the record with each item state and the current amount', async () => {
    const element = await render(REQUEST);

    const card = element.querySelector('details[data-testid="cart-requested"]');
    if (card instanceof HTMLDetailsElement) {
      card.open = true;
    }
    expect(card?.textContent).toContain('Registro de Artículos solicitados');

    const rows = element.querySelectorAll('[data-testid="cart-request-item"]');
    expect(rows).toHaveLength(5);

    const amounts = Array.from(
      element.querySelectorAll('[data-testid="cart-request-item-amount"]'),
    ).map((node) => node.textContent?.trim() ?? '');
    // Silla vigente, Sofá al precio de hoy y los tres no disponibles en cero.
    expect(amounts).toEqual([
      '$1,250.00 MXN',
      '$0.00 MXN',
      '$0.00 MXN',
      '$990.00 MXN',
      '$0.00 MXN',
    ]);

    expect(testId(element, 'cart-request-item-state-current')?.textContent).toContain('Vigente');
    expect(testId(element, 'cart-request-item-state-unpublished')?.textContent).toContain(
      'Despublicado',
    );
    expect(testId(element, 'cart-request-item-state-sold')?.textContent).toContain('Vendido');
    expect(testId(element, 'cart-request-item-state-price_changed')?.textContent).toContain(
      'Precio cambiado',
    );
    expect(testId(element, 'cart-request-item-state-deleted')?.textContent).toContain('Eliminado');

    // El precio de la instantánea se conserva como `Antes`; el importe del renglón es el de hoy.
    expect(card?.textContent).toContain('Antes: $1,250.00 MXN');
    expect(testId(element, 'cart-request-record-total')?.textContent).toContain('$2,240.00 MXN');
    expect(card?.textContent).toContain('no suman al importe de la solicitud');
  });

  it('degrades to the 4e notice when the border does not publish the record', async () => {
    const element = await render({
      id: 'request-1',
      reference: 'ab12cd34',
      requestedAt: '2026-11-04T18:00:00.000Z',
      whatsappUrl: 'https://wa.me/525512345678?text=hola',
    });

    const card = element.querySelector('details[data-testid="cart-requested"]');
    expect(card?.textContent).toContain('Solicitud enviada.');
    expect(card?.textContent).not.toContain('Registro de Artículos solicitados');
    expect(element.querySelectorAll('[data-testid="cart-request-item"]')).toHaveLength(0);
    // Sin `items` no hay lista ni importe: el card no inventa un cero ni pinta `NaN`.
    expect(testId(element, 'cart-request-total')).toBeNull();
    expect(card?.textContent ?? '').not.toContain('NaN');
    // Las acciones de 4e siguen disponibles.
    expect(testId(element, 'cart-whatsapp')).not.toBeNull();
    expect(testId(element, 'cart-request-cancel')).not.toBeNull();
  });
});
