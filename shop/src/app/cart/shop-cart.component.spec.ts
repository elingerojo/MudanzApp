import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { CartItem } from '@mudanzapp/shared';

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
